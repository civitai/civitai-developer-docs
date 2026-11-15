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
//
// How: a local HTTP server stands in for raw.githubusercontent.com, serving the
// COMMITTED snapshots at their upstream paths, with a per-case override for one
// or two files. Any other path (the PINNED_CONSTANTS sources, which are not
// snapshotted) answers 503, which the guard treats as unreachable → skip, so
// those never decide a case here. The guard runs as a child process, exactly as
// `npm run check:snapshots` runs it, and its exit code AND its own result lines
// are read (an exit code alone cannot tell "graded green" from "graded nothing").
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { repoRoot } from './appblocks-util.mjs';
import { checkLedger, SOURCES } from './check-appblocks-snapshots.mjs';

const run = promisify(execFile);
const GUARD = join(repoRoot, 'scripts', 'check-appblocks-snapshots.mjs');
const RAW = 'https://raw.githubusercontent.com/';
const DEFAULT_BASE = `${RAW}civitai/civitai/main`;

let failures = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const committed = (snapshot) => readFileSync(join(repoRoot, 'appblocks-snapshots', snapshot), 'utf8');
const routeOf = (entry) => `/${(entry.base ?? DEFAULT_BASE).replace(RAW, '')}/${entry.path}`;

let overrides = new Map(); // snapshot name -> upstream text for the current case
const routes = new Map(SOURCES.map((e) => [routeOf(e), e.snapshot]));
const server = createServer((req, res) => {
  const snapshot = routes.get(req.url);
  if (!snapshot) {
    res.writeHead(503).end('not a snapshotted path');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' }).end(overrides.get(snapshot) ?? committed(snapshot));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const env = {
  ...process.env,
  APPBLOCKS_RAW_BASE: `${origin}/civitai/civitai/main`,
  APPBLOCKS_STARTERS_RAW_BASE: `${origin}/civitai/civitai-app-starters/main`,
  APPBLOCKS_CLI_RAW_BASE: `${origin}/civitai/cli/main`,
  APPBLOCKS_MCP_RAW_BASE: `${origin}/civitai/civitai-mcp-server/main`,
};
// The routes above are keyed by the DEFAULT bases baked into SOURCES at import;
// the guard in the child reads the overridden bases. They must name the same repos.
for (const e of SOURCES) {
  if (e.base) assert(Object.values(env).some((v) => v === `${origin}/${e.base.replace(RAW, '')}`), `no env override reaches ${e.base}`);
}

async function guard(o) {
  overrides = new Map(Object.entries(o));
  try {
    const { stdout, stderr } = await run(process.execPath, [GUARD], { env, cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 });
    return { rc: 0, out: stdout + stderr };
  } catch (err) {
    return { rc: err.code, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

async function check(name, o, expect) {
  const { rc, out } = await guard(o);
  try {
    expect(rc, out);
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${err.message}\n${out.split('\n').map((l) => `       | ${l}`).join('\n')}`);
  }
}

const summary = (out) => out.match(/^Snapshots: .*$/m)?.[0] ?? '(no Snapshots: line)';
const n = SOURCES.length;

// Seeds. Each is a LITERAL edit of a committed file; the `includes` asserts below
// refuse to run a seed that no longer applies, so a seed cannot silently become a no-op.
const SCOPE_DESC = "'models:read:self': 'Read the model on the page where the block is mounted'";
const MARKUP_HEADING = '### Button — `data-civitai-ui="button"`';
const STORAGE_CONST = 'export const APP_STORAGE_MAX_COLLECTIONS = 16;';
assert(committed('scope-descriptions.constants.ts').includes(SCOPE_DESC), 'seed: scope description moved');
assert(committed('MARKUP.md').includes(MARKUP_HEADING), 'seed: MARKUP heading moved');
assert(committed('block-storage.constants.ts').includes(STORAGE_CONST), 'seed: storage constant moved');

console.log('check-appblocks-snapshots contract (offline, local stand-in for raw.githubusercontent.com)\n');

await check('clean: every upstream file equals its snapshot → green, all graded', {}, (rc, out) => {
  assert(rc === 0, `rc ${rc}`);
  assert(summary(out).startsWith(`Snapshots: ${n} up-to-date · 0 byte-drifted`), summary(out));
  assert(/0 drifted · 0 skipped/.test(summary(out)), summary(out));
});

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
    assert(summary(out).startsWith(`Snapshots: ${n - 2} up-to-date · 2 byte-drifted with identical rendered output · 0 drifted`), summary(out));
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

server.close();

// The ledger is what stops the render comparison grading a generator that never
// reads the file (which would report every byte of drift as "identical").
try {
  assert(checkLedger().length === 0, `shipped ledger: ${checkLedger().join('; ')}`);
  const bad = checkLedger([{ snapshot: 'doc-store-api.ts', gen: 'gen-appblocks-scopes.mjs', out: 'scopes.json' }]);
  assert(bad.length === 1 && bad[0].includes('does not read this snapshot'), `mis-mapped entry accepted: ${JSON.stringify(bad)}`);
  assert(checkLedger([{ snapshot: 'x.ts' }])[0]?.includes('no `gen`/`out`'), 'entry without gen accepted');
  console.log('  ok   the SOURCES ledger holds, and refuses a snapshot mapped to a generator that does not read it');
} catch (err) {
  failures++;
  console.error(`  FAIL SOURCES ledger\n       ${err.message}`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall check-appblocks-snapshots contract checks passed');
process.exit(failures ? 1 : 0);
