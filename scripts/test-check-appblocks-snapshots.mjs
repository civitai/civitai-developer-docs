#!/usr/bin/env node
// Offline contract test for scripts/check-appblocks-snapshots.mjs — the daily
// snapshot drift guard.
//
//   node scripts/test-check-appblocks-snapshots.mjs     (needs `npm ci`)
//
// WHY. That guard used to fail on any BYTE difference between a committed
// snapshot and its upstream file, and the files are mostly comments: it was red
// on 29 of its last 30 daily runs to 2026-11-14, mostly on churn after which the
// reference it guards would have rendered identically (not all: the 2026-11-12
// run also caught real drift in BLOCK_BUZZ_CAP_PER_DAY). It now grades what the
// consuming generator RENDERS. This file pins both halves of that contract,
// because each is a way to get it wrong:
//   - churn that does not change the rendered output must be GREEN (the old
//     guard went red here — this is the regression case);
//   - a change that DOES alter the rendered output must stay RED, for a JSON
//     artifact, for the components page, and when the generator refuses the
//     upstream copy (a guard that compares nothing would pass the first half).
// It also pins the two DERIVED MCP registries (compared as text, never
// rendered), the --only/--skip argv contract, the ledger check inside main(),
// and the "no install next to the App private key" rule for every workflow.
//
// How: a local HTTP server stands in for raw.githubusercontent.com, serving the
// COMMITTED snapshots at their upstream paths, with a per-case override for one
// or two files. For the two registries it serves SYNTHESIZED upstream source
// files (index.ts / server.ts / tools/*.ts for the MCP server, McpEndpoints.cs /
// Tools/*.cs for orchestration) built from a registry model, so the guard's real
// derivation runs over them. Any other path (the PINNED_CONSTANTS sources, which
// are not snapshotted) answers 503, which the guard treats as unreachable → skip,
// so those never decide a case here. The guard runs as a child process, exactly
// as `npm run check:snapshots` runs it, and its exit code AND its own result lines
// are read (an exit code alone cannot tell "graded green" from "graded nothing").
// A NODE_OPTIONS preload records every generator the guard spawns, so a case can
// assert that NO generator ran (and the churn case is its positive control).
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { repoRoot } from './appblocks-util.mjs';
import { checkLedger, SOURCES } from './check-appblocks-snapshots.mjs';
import { MCP_SERVER_SNAPSHOT, ORCHESTRATION_SNAPSHOT, parseRegistry } from './lib/mcp-registries.mjs';
import { appKeyJobProblems } from './lib/app-key-jobs.mjs';

const run = promisify(execFile);
const GUARD = join(repoRoot, 'scripts', 'check-appblocks-snapshots.mjs');
const RAW = 'https://raw.githubusercontent.com/';
const DEFAULT_BASE = `${RAW}civitai/civitai/main`;
const ORCH_TOKEN = 'test-dummy-orchestration-token';

let failures = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const committed = (snapshot) => readFileSync(join(repoRoot, 'appblocks-snapshots', snapshot), 'utf8');
const routeOf = (entry) => `/${(entry.base ?? DEFAULT_BASE).replace(RAW, '')}/${entry.path}`;

// ── The registries' synthesized upstream ────────────────────────────────────
// Each is built from a model ({endpoints, tools}) in the exact shapes
// scripts/lib/mcp-registries.mjs reads, split over TWO tool modules / types so
// the derivation's loop is exercised. The clean model is the committed snapshot.
const MCP_PREFIX = '/civitai/civitai-mcp-server/main/';
const ORCH_PREFIX = '/civitai/civitai-orchestration/contents/';
const ORCH_DIR = 'src/Civitai.Orchestration.McpServer';
const model = (snapshot) => {
  const { endpoints, tools } = parseRegistry(committed(snapshot));
  return { endpoints: [...endpoints], tools: [...tools] };
};
const halves = (xs) => [xs.slice(0, Math.ceil(xs.length / 2)), xs.slice(Math.ceil(xs.length / 2))];

function mcpServerFiles({ endpoints, tools }) {
  const [a, b] = halves(tools);
  return {
    'src/index.ts': endpoints.map((e) => `app.post('${e}', handleMcp);`).join('\n') + '\n',
    'src/server.ts': [
      "import { toolsA } from './tools/tools-a.js';",
      "import { toolsB } from './tools/tools-b.js';",
      'const modules: Array<{ name: string; mod: ToolModule }> = [',
      "  { name: 'a', mod: toolsA },",
      "  { name: 'b', mod: toolsB },",
      '];',
      '',
    ].join('\n'),
    'src/tools/tools-a.ts': a.map((t) => `  reg('${t}', schema, handler);`).join('\n') + '\n',
    'src/tools/tools-b.ts': b.map((t) => `  reg('${t}', schema, handler);`).join('\n') + '\n',
  };
}

function orchestrationFiles({ endpoints, tools }) {
  const [a, b] = halves(tools);
  const tool = (t) => `    [McpServerTool(Name = "${t}")]\n    public static Task ${t}() => null;`;
  return {
    [`${ORCH_DIR}/Infrastructure/McpEndpoints.cs`]: [
      ...endpoints.map((e, i) => `    public const string V${i + 1}Path = "${e}";`),
      '    public static readonly Type[] V2Tools = [typeof(ToolsA), typeof(ToolsB)];',
      '',
    ].join('\n'),
    [`${ORCH_DIR}/Tools/ToolsA.cs`]: a.map(tool).join('\n') + '\n',
    [`${ORCH_DIR}/Tools/ToolsB.cs`]: b.map(tool).join('\n') + '\n',
  };
}

// Per-case state, reset by guard().
let overrides = new Map(); // snapshot name -> upstream text
let registry = {}; // { mcp, orch }: file maps; { gone: Set<route> }
let hits = { mcp: 0, orch: 0, orchAuth: new Set() };
const resetRegistry = () => ({
  mcp: mcpServerFiles(model(MCP_SERVER_SNAPSHOT)),
  orch: orchestrationFiles(model(ORCHESTRATION_SNAPSHOT)),
  gone: new Set(),
});

const routes = new Map(SOURCES.filter((e) => !e.derive).map((e) => [routeOf(e), e.snapshot]));
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://stand-in');
  if (registry.gone?.has(url.pathname)) {
    res.writeHead(404).end('gone');
    return;
  }
  // The MCP server repo also hosts a generator-read snapshot (mcp-platform-feedback.ts),
  // so a snapshotted path is served as a snapshot before the registry files are tried.
  if (url.pathname.startsWith(MCP_PREFIX) && !routes.has(req.url)) {
    hits.mcp++;
    const body = registry.mcp?.[url.pathname.slice(MCP_PREFIX.length)];
    res.writeHead(body === undefined ? 404 : 200).end(body ?? 'no such file');
    return;
  }
  if (url.pathname.startsWith(ORCH_PREFIX)) {
    // The contents API: the guard must ask for `?ref=main`, the raw media type,
    // and send the token. Anything else answers 401, which the guard reads as
    // unreachable, so a case that expects a comparison catches it.
    hits.orch++;
    hits.orchAuth.add(req.headers.authorization ?? '(none)');
    const authed =
      req.headers.authorization === `Bearer ${ORCH_TOKEN}` &&
      req.headers.accept === 'application/vnd.github.raw' &&
      url.searchParams.get('ref') === 'main';
    if (!authed) {
      res.writeHead(401).end('bad credentials');
      return;
    }
    const body = registry.orch?.[decodeURIComponent(url.pathname.slice(ORCH_PREFIX.length))];
    res.writeHead(body === undefined ? 404 : 200).end(body ?? 'no such file');
    return;
  }
  const snapshot = routes.get(req.url);
  if (!snapshot) {
    res.writeHead(503).end('not a snapshotted path');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' }).end(overrides.get(snapshot) ?? committed(snapshot));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// The generator-spawn recorder: a preload every child node process loads. It
// appends the script name when the process is a gen-appblocks-*.mjs generator.
const work = mkdtempSync(join(tmpdir(), 'test-check-snapshots-'));
const genLog = join(work, 'generators.log');
const sentinel = join(work, 'record-generators.cjs');
writeFileSync(
  sentinel,
  `const n = require('node:path').basename(process.argv[1] || '');\n` +
    `if (/^gen-appblocks-.*\\.mjs$/.test(n)) require('node:fs').appendFileSync(${JSON.stringify(genLog)}, n + '\\n');\n`,
);
const generatorsRun = () => {
  try {
    return readFileSync(genLog, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
};

const env = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${sentinel}`.trim(),
  APPBLOCKS_RAW_BASE: `${origin}/civitai/civitai/main`,
  APPBLOCKS_STARTERS_RAW_BASE: `${origin}/civitai/civitai-app-starters/main`,
  APPBLOCKS_CLI_RAW_BASE: `${origin}/civitai/cli/main`,
  APPBLOCKS_MCP_RAW_BASE: `${origin}/civitai/civitai-mcp-server/main`,
  // The PRIVATE orchestration registry: a dummy token, accepted only by the
  // stand-in, so the source is compared rather than skipped. The base points at
  // the stand-in so nothing here can reach the real API.
  APPBLOCKS_ORCH_API_BASE: `${origin}/civitai/civitai-orchestration/contents`,
  ORCHESTRATION_APP_TOKEN: ORCH_TOKEN,
};
// The routes above are keyed by the DEFAULT bases baked into SOURCES at import;
// the guard in the child reads the overridden bases. They must name the same repos.
for (const e of SOURCES) {
  const tail = e.base?.replace(RAW, '').replace('https://api.github.com/repos/', '');
  if (e.base) assert(Object.values(env).some((v) => v === `${origin}/${tail}`), `no env override reaches ${e.base}`);
}

/**
 * Runs the guard (or `script`, a wrapper) as a child process. `o`: per-snapshot
 * upstream overrides; `opts.args`, `opts.env`, `opts.registry(r)` to edit the
 * synthesized registry upstream in place.
 */
async function guard(o, opts = {}) {
  overrides = new Map(Object.entries(o));
  registry = resetRegistry();
  opts.registry?.(registry);
  hits = { mcp: 0, orch: 0, orchAuth: new Set() };
  rmSync(genLog, { force: true });
  const childEnv = { ...env, ...(opts.env ?? {}) };
  try {
    const { stdout, stderr } = await run(process.execPath, [opts.script ?? GUARD, ...(opts.args ?? [])], {
      env: childEnv,
      cwd: repoRoot,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { rc: 0, out: stdout + stderr };
  } catch (err) {
    return { rc: err.code, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

async function check(name, o, expect, opts) {
  const { rc, out } = await guard(o, opts);
  try {
    expect(rc, out);
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${err.message}\n${out.split('\n').map((l) => `       | ${l}`).join('\n')}`);
  }
}

function sync(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}

const summary = (out) => out.match(/^Snapshots: .*$/m)?.[0] ?? '(no Snapshots: line)';
const n = SOURCES.filter((e) => !e.derive).length;
const derivedCount = SOURCES.length - n;
assert(derivedCount === 2, `expected the two derived MCP registries in SOURCES, found ${derivedCount}`);

// Seeds. Each is a LITERAL edit of a committed file; the `includes` asserts below
// refuse to run a seed that no longer applies, so a seed cannot silently become a no-op.
const SCOPE_DESC = "'models:read:self': 'Read the model on the page where the block is mounted'";
const MARKUP_HEADING = '### Button — `data-civitai-ui="button"`';
const STORAGE_CONST = 'export const APP_STORAGE_MAX_COLLECTIONS = 16;';
assert(committed('scope-descriptions.constants.ts').includes(SCOPE_DESC), 'seed: scope description moved');
assert(committed('MARKUP.md').includes(MARKUP_HEADING), 'seed: MARKUP heading moved');
assert(committed('block-storage.constants.ts').includes(STORAGE_CONST), 'seed: storage constant moved');
// Registry seeds: a tool the committed snapshot does not have, and one it does.
const ADDED_TOOL = 'zz_contract_test_added_tool';
const REMOVED_TOOL = model(MCP_SERVER_SNAPSHOT).tools[0];
assert(REMOVED_TOOL && !model(MCP_SERVER_SNAPSHOT).tools.includes(ADDED_TOOL), 'seed: registry tools');

console.log('check-appblocks-snapshots contract (offline, local stand-in for raw.githubusercontent.com)\n');

await check('clean: every upstream file equals its snapshot → green, all graded (registries compared, not skipped)', {}, (rc, out) => {
  assert(rc === 0, `rc ${rc}`);
  assert(summary(out) === `Snapshots: ${SOURCES.length} up-to-date · 0 byte-drifted with identical rendered output · 0 drifted · 0 skipped (unreachable)`, summary(out));
  // (The label is the base URL, which here is the stand-in's.)
  assert(out.includes(`✓ ${MCP_SERVER_SNAPSHOT} — matches ${origin}/civitai/civitai-mcp-server/main`), `${MCP_SERVER_SNAPSHOT} was not compared`);
  assert(new RegExp(`✓ ${ORCHESTRATION_SNAPSHOT.replace('.', '\\.')} — matches `).test(out), `${ORCHESTRATION_SNAPSHOT} was not compared`);
  // Positive control on the stand-in: both registries were actually fetched, the private one with the token.
  assert(hits.mcp >= 4 && hits.orch >= 3, `registry fetches: mcp ${hits.mcp}, orch ${hits.orch}`);
  assert([...hits.orchAuth].join() === `Bearer ${ORCH_TOKEN}`, `orchestration auth: ${[...hits.orchAuth]}`);
});

await check(
  'no ORCHESTRATION_APP_TOKEN → the private registry SKIPs as UNVERIFIED before any request',
  {},
  (rc, out) => {
    assert(rc === 0, `rc ${rc}`);
    assert(out.includes(`⊘ ${ORCHESTRATION_SNAPSHOT} — UNVERIFIED`), 'the tokenless private source did not report UNVERIFIED');
    assert(hits.orch === 0, `the tokenless run still made ${hits.orch} orchestration request(s)`);
    assert(/ · 0 drifted · 1 skipped/.test(summary(out)), summary(out));
  },
  { env: { ORCHESTRATION_APP_TOKEN: '' } },
);

await check(
  'a registry drifts upstream (one tool added, one removed) → red, naming the + / - lines',
  {},
  (rc, out) => {
    assert(out.includes(`✗ ${MCP_SERVER_SNAPSHOT} — DRIFTED from ${origin}/civitai/civitai-mcp-server/main`), 'no DRIFTED line for the registry');
    assert(out.includes(`      + tool ${ADDED_TOOL}\n`), `no "+ tool ${ADDED_TOOL}" line`);
    assert(out.includes(`      - tool ${REMOVED_TOOL}\n`), `no "- tool ${REMOVED_TOOL}" line`);
    assert(out.includes(`${MCP_SERVER_SNAPSHOT}: apply +1 / -1 line(s) listed above`), 'no apply summary');
    assert(rc === 1, `rc ${rc}`);
    // The other registry is still graded on its own.
    assert(out.includes(`✓ ${ORCHESTRATION_SNAPSHOT} — matches`), `${ORCHESTRATION_SNAPSHOT} was not compared`);
    assert(/ · 1 drifted · 0 skipped/.test(summary(out)), summary(out));
  },
  {
    registry: (r) => {
      const m = model(MCP_SERVER_SNAPSHOT);
      r.mcp = mcpServerFiles({ endpoints: m.endpoints, tools: [...m.tools.slice(1), ADDED_TOOL] });
    },
  },
);

await check(
  'a file a registry derives from 404s upstream → red (moved/removed), never a skip',
  {},
  (rc, out) => {
    assert(out.includes(`✗ ${ORCHESTRATION_SNAPSHOT} — source path returned HTTP 404: moved/removed upstream`), 'no 404 drift line');
    assert(rc === 1, `rc ${rc}`);
    assert(/ · 1 drifted · 0 skipped/.test(summary(out)), summary(out));
  },
  { registry: (r) => r.gone.add(`${ORCH_PREFIX}${ORCH_DIR}/Tools/ToolsB.cs`) },
);

await check(
  'comment churn in two generator inputs → green, reported as byte-drifted with identical output',
  {
    'block-scope.constants.ts': committed('block-scope.constants.ts') + '\n// upstream comment churn\n',
    'hostHandlerParity.ts': '// a rewritten comment\n' + committed('hostHandlerParity.ts'),
  },
  (rc, out) => {
    assert(rc === 0, `rc ${rc} — comment-only churn must not fail the guard`);
    assert(/≈ block-scope\.constants\.ts — bytes differ .* gen-appblocks-scopes\.mjs renders identical output/.test(out), 'no ≈ line for block-scope');
    assert(/≈ hostHandlerParity\.ts — bytes differ .* gen-appblocks-messages\.mjs renders identical output/.test(out), 'no ≈ line for hostHandlerParity');
    assert(summary(out).startsWith(`Snapshots: ${SOURCES.length - 2} up-to-date · 2 byte-drifted with identical rendered output · 0 drifted`), summary(out));
    // Positive control for the generator recorder the --only case relies on.
    const gens = generatorsRun();
    assert(gens.includes('gen-appblocks-scopes.mjs') && gens.includes('gen-appblocks-messages.mjs'), `recorder saw: ${gens.join(', ') || '(nothing)'}`);
  },
);

await check(
  'a scope description changes upstream → red, names the snapshot and scopes.json',
  { 'scope-descriptions.constants.ts': committed('scope-descriptions.constants.ts').replace(SCOPE_DESC, SCOPE_DESC.replace('Read the model', 'Read THE model')) },
  (rc, out) => {
    assert(rc === 1, `rc ${rc}`);
    assert(out.includes('✗ scope-descriptions.constants.ts — DRIFTED: re-snapshotting changes public/appblocks/scopes.json'), 'no DRIFTED line');
    assert(out.includes('Read THE model'), 'the rendered diff does not show the upstream text');
    assert(/curl -sSL \S+scope-descriptions\.constants\.ts > appblocks-snapshots\/scope-descriptions\.constants\.ts/.test(out), 'no re-snapshot command');
  },
);

await check(
  'a storage limit changes upstream → red via storage.json',
  { 'block-storage.constants.ts': committed('block-storage.constants.ts').replace(STORAGE_CONST, 'export const APP_STORAGE_MAX_COLLECTIONS = 17;') },
  (rc, out) => {
    assert(rc === 1, `rc ${rc}`);
    assert(out.includes('✗ block-storage.constants.ts — DRIFTED: re-snapshotting changes public/appblocks/storage.json'), 'no DRIFTED line');
  },
);

await check(
  'a MARKUP.md component heading changes upstream → red via the generated page',
  { 'MARKUP.md': committed('MARKUP.md').replace(MARKUP_HEADING, '### Button — `data-civitai-ui="btn"`') },
  (rc, out) => {
    assert(rc === 1, `rc ${rc}`);
    assert(out.includes('✗ MARKUP.md — DRIFTED: re-snapshotting changes the generated page'), 'no DRIFTED line');
  },
);

await check(
  'an upstream copy the generator refuses → red, not "identical"',
  { 'hostHandlerParity.ts': '// emptied upstream\n' },
  (rc, out) => {
    assert(rc === 1, `rc ${rc}`);
    assert(out.includes('✗ hostHandlerParity.ts — bytes differ, and gen-appblocks-messages.mjs REFUSES the upstream copy'), 'no REFUSES line');
  },
);

// ── --only / --skip ─────────────────────────────────────────────────────────
await check(
  '--skip with a misspelled snapshot name → exit 2, nothing checked',
  {},
  (rc, out) => {
    assert(out.includes('check-appblocks-snapshots: --skip "mcp-server-tool.txt" names no source'), 'no "names no source" refusal');
    assert(rc === 2, `rc ${rc}`);
    assert(!/^Snapshots: /m.test(out), 'a sweep ran anyway');
  },
  { args: ['--skip', 'mcp-server-tool.txt'] },
);

await check(
  '--only together with --skip → exit 2',
  {},
  (rc, out) => {
    assert(out.includes('check-appblocks-snapshots: --only and --skip are mutually exclusive'), 'no mutual-exclusion refusal');
    assert(rc === 2, `rc ${rc}`);
    assert(!/^Snapshots: /m.test(out), 'a sweep ran anyway');
  },
  { args: ['--only', ORCHESTRATION_SNAPSHOT, '--skip', MCP_SERVER_SNAPSHOT] },
);

await check(
  '--only <a derived source> checks just that source and never invokes a generator',
  // A generator input that WOULD make its generator run (and refuse) if it were selected.
  { 'hostHandlerParity.ts': '// emptied upstream\n' },
  (rc, out) => {
    const gens = generatorsRun();
    assert(gens.length === 0, `--only ${MCP_SERVER_SNAPSHOT} spawned generator(s): ${gens.join(', ')}`);
    assert(rc === 0, `rc ${rc}`);
    assert(summary(out) === 'Snapshots: 1 up-to-date · 0 byte-drifted with identical rendered output · 0 drifted · 0 skipped (unreachable)', summary(out));
    assert(out.includes(`✓ ${MCP_SERVER_SNAPSHOT} — matches`), 'the selected source was not compared');
    assert(out.includes('Pinned constants: not checked by this invocation (--only)'), 'pinned constants ran under --only');
  },
  { args: ['--only', MCP_SERVER_SNAPSHOT] },
);

// ── The ledger check inside main() ──────────────────────────────────────────
// The seam: main(argv, sources) is exported, and a wrapper script run as a child
// process calls the REAL main() with SOURCES plus one mis-mapped entry. Nothing in
// the guard reads an alternate ledger from env or argv. The positive control runs
// the same wrapper over the shipped SOURCES (rc 0), so a wrapper that never reaches
// the sweep cannot pass the bad-entry case by exiting non-zero for its own reasons.
const wrapper = join(work, 'run-guard-with-sources.mjs');
writeFileSync(
  wrapper,
  [
    `import { main, SOURCES } from ${JSON.stringify(pathToFileURL(GUARD).href)};`,
    "const extra = process.env.TEST_EXTRA_SOURCE ? [JSON.parse(process.env.TEST_EXTRA_SOURCE)] : [];",
    'main([], [...SOURCES, ...extra]).catch((err) => { console.error(`wrapper: ${err.stack}`); process.exit(3); });',
    '',
  ].join('\n'),
);
const BAD_ENTRY = { path: 'src/contract-test/never-fetched.ts', snapshot: 'doc-store-api.ts', gen: 'gen-appblocks-scopes.mjs', out: 'scopes.json' };

await check(
  'wrapper positive control: main() over the shipped SOURCES → green, full sweep',
  {},
  (rc, out) => {
    assert(rc === 0, `rc ${rc}`);
    assert(summary(out).startsWith(`Snapshots: ${SOURCES.length} up-to-date`), summary(out));
  },
  { script: wrapper },
);

await check(
  'a bad SOURCES entry → main() refuses with exit 2 before any verdict',
  {},
  (rc, out) => {
    assert(out.includes('check-appblocks-snapshots: the SOURCES ledger is wrong, so no verdict is reported:'), 'no ledger refusal');
    assert(out.includes("doc-store-api.ts: gen-appblocks-scopes.mjs does not name 'doc-store-api.ts'"), 'the refusal does not name the bad entry');
    assert(rc === 2, `rc ${rc}`);
    assert(!/^Snapshots: /m.test(out), 'a sweep ran anyway');
  },
  { script: wrapper, env: { TEST_EXTRA_SOURCE: JSON.stringify(BAD_ENTRY) } },
);

server.close();

// The ledger is what stops the render comparison grading a generator that never
// reads the file (which would report every byte of drift as "identical").
sync('the SOURCES ledger holds, and refuses a snapshot mapped to a generator that does not read it', () => {
  assert(checkLedger().length === 0, `shipped ledger: ${checkLedger().join('; ')}`);
  const bad = checkLedger([BAD_ENTRY]);
  assert(bad.length === 1 && bad[0].includes('does not read this snapshot'), `mis-mapped entry accepted: ${JSON.stringify(bad)}`);
  assert(checkLedger([{ snapshot: 'x.ts' }])[0]?.includes('no `gen`/`out`'), 'entry without gen accepted');
  assert(checkLedger([{ snapshot: 'x.txt', derive: () => {}, gen: 'gen-appblocks-scopes.mjs', out: 'scopes.json' }])[0]?.includes('drop its'), 'derived entry with a generator accepted');
});

// ── No dependency install in a job that can read the App private key ────────
// See scripts/lib/app-key-jobs.mjs. The ledger of key-holding jobs fails when it
// GROWS (a new job got the key: confirm it installs nothing, then add it here) or
// SHRINKS (the scanner went blind, or a job dropped the key).
const KEY_JOBS = ['appblocks-drift.yml:orch-snapshot', 'appblocks-pin-bump.yml:publish', 'cli-snapshot-refresh.yml:publish'];
const WF_DIR = join(repoRoot, '.github', 'workflows');

sync('no job that can read AGENT_APP_PRIVATE_KEY installs or runs package-manager code', () => {
  const files = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f)).sort();
  assert(files.length >= 10, `only ${files.length} workflow file(s) found`);
  const keyJobs = [];
  const problems = [];
  for (const f of files) {
    const r = appKeyJobProblems(readFileSync(join(WF_DIR, f), 'utf8'), f);
    keyJobs.push(...r.keyJobs.map((j) => `${f}:${j}`));
    problems.push(...r.problems);
  }
  assert(problems.length === 0, problems.join('; '));
  assert(JSON.stringify(keyJobs.sort()) === JSON.stringify(KEY_JOBS), `key-holding jobs are ${JSON.stringify(keyJobs)}, expected ${JSON.stringify(KEY_JOBS)}`);
});

sync('the key-job check parses jobs: judges each job by its own values, never comments or a neighbour', () => {
  const wf = (jobs, top = '') => `name: t\non: push\n${top}jobs:\n${jobs}`;
  const keyStep = "      - uses: actions/create-github-app-token@x\n        with:\n          private-key: ${{ secrets.AGENT_APP_PRIVATE_KEY }}\n";
  const probe = (text) => appKeyJobProblems(text, 't.yml');
  // A comment naming an install is not an install (a whole-file grep would fail here).
  let r = probe(wf(`  a:\n    runs-on: x\n    # no npm ci here, deliberately\n    steps:\n${keyStep}`));
  assert(r.keyJobs.join() === 'a' && r.problems.length === 0, `comment counted: ${JSON.stringify(r)}`);
  // An install in a neighbour that does not hold the key is not charged to the key job.
  r = probe(wf(`  a:\n    steps:\n${keyStep}  b:\n    steps:\n      - run: npm ci\n`));
  assert(r.keyJobs.join() === 'a' && r.problems.length === 0, `neighbour charged: ${JSON.stringify(r)}`);
  // Prose naming the secret delivers nothing.
  r = probe(wf(`  a:\n    steps:\n      - run: echo "set the secret AGENT_APP_PRIVATE_KEY"; npm ci\n`));
  assert(r.keyJobs.length === 0, `prose counted as a key reference: ${JSON.stringify(r)}`);
  // Each marker, in the key job, is caught.
  for (const [step, marker] of [
    ['      - run: npm ci\n', 'npm ci'],
    ['      - run: npm install --ignore-scripts\n', 'npm install'],
    ['      - run: npm run build\n', 'npm run'],
    ['      - run: pnpm i\n', 'pnpm'],
    ['      - run: yarn\n', 'yarn'],
    ["      - uses: actions/setup-node@v4\n        with:\n          cache: 'npm'\n", 'cache: npm'],
  ]) {
    r = probe(wf(`  a:\n    steps:\n${keyStep}${step}`));
    assert(r.problems.length === 1 && r.problems[0].includes(marker), `${marker} not caught: ${JSON.stringify(r.problems)}`);
  }
  // A key in the workflow-level env reaches every job.
  r = probe(wf('  b:\n    steps:\n      - run: npm ci\n', 'env:\n  K: ${{ secrets.AGENT_APP_PRIVATE_KEY }}\n'));
  assert(r.keyJobs.join() === 'b' && r.problems.length === 1, `workflow-level key missed: ${JSON.stringify(r)}`);
});

rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall check-appblocks-snapshots contract checks passed');
process.exit(failures ? 1 : 0);
