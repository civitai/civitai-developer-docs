#!/usr/bin/env node
/**
 * test-bump-appblocks-pins.mjs
 * ----------------------------
 * Offline tests for scripts/bump-appblocks-pins.mjs and the workflow that runs
 * it (.github/workflows/appblocks-pin-bump.yml), plus the required-checks
 * dispatch list both bots share (scripts/lib/required-checks.mjs).
 *
 * Every npm answer here is a FIXTURE: the CLI cases point the script at a
 * loopback registry (APPBLOCKS_NPM_REGISTRY) that serves canned documents, so
 * nothing reaches npm. Runs on every PR from the `checks` job in checks.yml.
 *
 *   npm run test:bump-appblocks-pins
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BOT_BRANCH,
  CONTENT_LABEL,
  TRACKED_PACKAGES,
  autoMergeDecision,
  bumpsBetween,
  classifyChanges,
  parseRehearse,
  planBump,
  prBody,
  prTitle,
  resolveLatest,
  rewriteLiterals,
} from './bump-appblocks-pins.mjs';
import { REQUIRED_CHECKS, dispatchCommands, dispatchRequiredChecks } from './lib/required-checks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

let executed = 0;
let failures = 0;
const pending = [];
function check(name, fn) {
  pending.push(async () => {
    executed++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failures++;
      console.error(`  ✗ ${name}\n      ${String(err.message).split('\n').join('\n      ')}`);
    }
  });
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function assertEqual(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg}\n      got:      ${sa}\n      expected: ${sb}`);
}

// ---------------------------------------------------------------------------
// Fixture versions. Pairwise distinct, and distinct from anything the script
// could hardcode, so a mutant returning a constant cannot satisfy them.
const PIN = {
  '@civitai/app-sdk': '0.86.0',
  '@civitai/blocks-react': '0.80.0',
  '@civitai/sdk': '0.25.2',
  '@civitai/components': '0.13.0',
  '@civitai/components-react': '0.10.2',
  '@civitai/theme': '0.5.2',
};

check('the tracked set is every package the pin guards check, theme included', () => {
  assertEqual(
    [...TRACKED_PACKAGES].sort(),
    Object.keys(PIN).sort(),
    'the bot does not bump exactly the six guarded @civitai packages',
  );
});

// ---------------------------------------------------------------------------
console.log('PLAN — what moves, and in which direction');

check('a lagging pin is bumped to npm latest; equal and ahead pins are left alone', () => {
  const latest = { ...PIN, '@civitai/app-sdk': '0.87.1', '@civitai/sdk': '0.25.1', '@civitai/theme': '0.5.2' };
  assertEqual(
    planBump(PIN, latest),
    [{ pkg: '@civitai/app-sdk', from: '0.86.0', to: '0.87.1' }],
    'the plan is wrong: only app-sdk lags (sdk is AHEAD of latest, theme is equal)',
  );
});

check('the plan never downgrades — a latest BELOW the pin is not a bump', () => {
  const latest = { ...PIN, '@civitai/components': '0.12.9' };
  assertEqual(planBump(PIN, latest), [], 'a lower npm latest produced a bump (a downgrade)');
});

check('a package whose latest is unknown is not in the plan', () => {
  const latest = { ...PIN };
  delete latest['@civitai/blocks-react'];
  assertEqual(planBump({ ...PIN, '@civitai/blocks-react': '0.79.0' }, latest), [], 'an unknown latest produced a bump');
});

check('every lagging package is planned, in tracked order', () => {
  const latest = { ...PIN, '@civitai/blocks-react': '0.81.0', '@civitai/app-sdk': '0.88.0' };
  assertEqual(
    planBump(PIN, latest).map((b) => `${b.pkg}@${b.to}`),
    ['@civitai/app-sdk@0.88.0', '@civitai/blocks-react@0.81.0'],
    'not every lagging package was planned',
  );
});

// ---------------------------------------------------------------------------
console.log('');
console.log('REGISTRY — fixture npm responses');

function fixtureRegistry(docs) {
  // docs: { '@civitai/x': { status, body } | latestString }
  const seen = [];
  const server = createServer((req, res) => {
    const name = decodeURIComponent(req.url.slice(1));
    seen.push(name);
    const d = docs[name];
    if (d === undefined) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"Not found"}');
      return;
    }
    if (typeof d === 'string') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ name, 'dist-tags': { latest: d }, versions: { [d]: {} } }));
      return;
    }
    res.writeHead(d.status, { 'content-type': 'application/json' });
    res.end(d.body ?? '{}');
  });
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}`, server, seen })),
  );
}

check('resolveLatest reads dist-tags.latest for every tracked package', async () => {
  const docs = Object.fromEntries(Object.entries(PIN).map(([p, v]) => [p, v.replace(/\.\d+$/, '.9')]));
  const reg = await fixtureRegistry(docs);
  try {
    const r = await resolveLatest(TRACKED_PACKAGES, { registry: reg.url });
    const sorted = (o) => Object.fromEntries(Object.entries(o).sort());
    assertEqual(sorted(r.latest), sorted(docs), 'latest versions not read from the registry documents');
    assertEqual(r.gone, [], 'a served package was reported gone');
    assertEqual(r.unreachable, [], 'a served package was reported unreachable');
    assertEqual(reg.seen.length, TRACKED_PACKAGES.length, 'not every package was asked for');
  } finally {
    reg.server.close();
  }
});

check('a 404 is GONE (real drift) and a 503 is UNREACHABLE (transient) — never the same', async () => {
  const docs = { ...PIN, '@civitai/theme': { status: 503 } };
  delete docs['@civitai/sdk'];
  const reg = await fixtureRegistry(docs);
  try {
    const r = await resolveLatest(TRACKED_PACKAGES, { registry: reg.url });
    assertEqual(r.gone, ['@civitai/sdk'], 'the 404 was not classified as gone');
    assertEqual(r.unreachable, ['@civitai/theme'], 'the 503 was not classified as unreachable');
    assert(!('@civitai/sdk' in r.latest) && !('@civitai/theme' in r.latest), 'a failed package still has a latest');
  } finally {
    reg.server.close();
  }
});

// ---------------------------------------------------------------------------
console.log('');
console.log('LITERALS — the hand-written @civitai/<pkg>@x.y.z strings');

const bumpSdk = [{ pkg: '@civitai/app-sdk', from: '0.86.0', to: '0.87.1' }];
const bumpComponents = [{ pkg: '@civitai/components', from: '0.13.0', to: '0.14.0' }];

check('a pin literal is rewritten, in frontmatter and in prose', () => {
  const text = '---\nsources:\n  - "@civitai/app-sdk@0.86.0"\n---\nInstall `@civitai/app-sdk@0.86.0` and go.\n';
  const r = rewriteLiterals('apps/guide/x.md', text, bumpSdk);
  assertEqual(r.count, 2, 'both literals should be rewritten');
  assertEqual(
    r.text,
    '---\nsources:\n  - "@civitai/app-sdk@0.87.1"\n---\nInstall `@civitai/app-sdk@0.87.1` and go.\n',
    'the rewritten text is wrong',
  );
});

check('a literal at any OTHER version is a historical claim and is left alone', () => {
  const text = 'The `step` member (added in `@civitai/app-sdk@0.30.0`) and `@civitai/app-sdk@0.86.0`.\n';
  const r = rewriteLiterals('apps/reference/generation.md', text, bumpSdk);
  assertEqual(r.count, 1, 'only the pin literal should move');
  assert(r.text.includes('@civitai/app-sdk@0.30.0'), 'the historical 0.30.0 literal was rewritten');
});

check('a longer version that merely STARTS with the pin is not rewritten', () => {
  const text = '`@civitai/app-sdk@0.86.01` and `@civitai/app-sdk@0.86.0-beta.1` and `@civitai/app-sdk@0.86.0`.';
  const r = rewriteLiterals('apps/x.md', text, bumpSdk);
  assertEqual(r.count, 1, 'a prefix match was rewritten');
  assert(r.text.includes('0.86.01') && r.text.includes('0.86.0-beta.1'), 'a longer version was mangled');
});

check('bumping components does not touch components-react, and the reverse', () => {
  const text = 'https://unpkg.com/@civitai/components@0.13.0/styles.css and @civitai/components-react@0.13.0';
  const r = rewriteLiterals('apps/x.md', text, bumpComponents);
  assertEqual(r.count, 1, 'components-react was rewritten by a components bump');
  assert(r.text.includes('@civitai/components-react@0.13.0'), 'components-react literal moved');
  assert(r.text.includes('@civitai/components@0.14.0/styles.css'), 'the components CDN literal did not move');
});

check('bumping sdk does not touch app-sdk', () => {
  const text = '@civitai/sdk@0.25.2 and @civitai/app-sdk@0.25.2';
  const r = rewriteLiterals('apps/x.md', text, [{ pkg: '@civitai/sdk', from: '0.25.2', to: '0.26.0' }]);
  assertEqual(r.text, '@civitai/sdk@0.26.0 and @civitai/app-sdk@0.25.2', 'app-sdk literal was rewritten by an sdk bump');
});

check('a HISTORICAL_LITERALS row at the old pin is refused, never silently rewritten', () => {
  // A registry row at the CURRENT pin cannot coexist with a green check:ds-pins
  // (the guard skips pin-valued literals before consulting the registry, so the
  // row's count would read 0), but if one ever does, the bot cannot tell the
  // historical sentence from the pin literal, so it must stop.
  let threw = null;
  try {
    rewriteLiterals('apps/reference/generation.md', '`@civitai/app-sdk@0.30.0`', [
      { pkg: '@civitai/app-sdk', from: '0.30.0', to: '0.31.0' },
    ]);
  } catch (err) {
    threw = err;
  }
  assert(threw, 'a rewrite over a declared historical literal did not throw');
  assert(/HISTORICAL_LITERALS/.test(threw.message), `wrong refusal: ${threw.message}`);
});

// ---------------------------------------------------------------------------
console.log('');
console.log('CLASSIFY — version strings only, or a content change?');

const pkgJson = (pins, extra = {}) =>
  `${JSON.stringify({ name: 'x', private: true, ...extra, devDependencies: { ...pins, typescript: '^5.6.0' } }, null, 2)}\n`;

check('a diff that differs only by the bumped version strings is version-only', () => {
  const changes = [
    { path: 'package.json', before: pkgJson(PIN), after: pkgJson({ ...PIN, '@civitai/app-sdk': '0.87.1' }) },
    { path: 'package-lock.json', before: '{"a":1}', after: '{"a":2,"b":3}' },
    { path: 'apps/reference/hooks.md', before: 'stamp 0.86.0\nbody\n', after: 'stamp 0.87.1\nbody\n' },
  ];
  const c = classifyChanges(changes, bumpSdk);
  assertEqual(c, { versionOnly: true, contentPaths: [] }, 'a version-only diff was classified as content');
});

check('a generated page whose TEXT changed is a content change, named by path', () => {
  const changes = [
    { path: 'apps/reference/hooks.md', before: 'stamp 0.86.0\nbody\n', after: 'stamp 0.87.1\nbody\nnew hook\n' },
    { path: 'apps/reference/messages.md', before: 'v0.86.0', after: 'v0.87.1' },
  ];
  assertEqual(
    classifyChanges(changes, bumpSdk),
    { versionOnly: false, contentPaths: ['apps/reference/hooks.md'] },
    'the content change was not caught',
  );
});

check('an unrelated number changing next to a bump is a content change', () => {
  // The mask is the bumped package's two version strings, not "any semver".
  const changes = [{ path: 'apps/x.md', before: '0.86.0 limit 1.2.3', after: '0.87.1 limit 1.2.4' }];
  assertEqual(classifyChanges(changes, bumpSdk).versionOnly, false, 'an unrelated version change was masked');
});

check('an added or deleted file is a content change', () => {
  assertEqual(
    classifyChanges([{ path: 'apps/reference/hooks/new.md', before: null, after: 'x' }], bumpSdk).contentPaths,
    ['apps/reference/hooks/new.md'],
    'an added page was not a content change',
  );
  assertEqual(
    classifyChanges([{ path: 'apps/reference/hooks/old.md', before: 'x', after: null }], bumpSdk).contentPaths,
    ['apps/reference/hooks/old.md'],
    'a deleted page was not a content change',
  );
});

check('package.json changing anything but the bumped pins is a content change', () => {
  const changes = [
    {
      path: 'package.json',
      before: pkgJson(PIN),
      after: pkgJson({ ...PIN, '@civitai/app-sdk': '0.87.1' }, { scripts: { evil: 'curl x | sh' } }),
    },
  ];
  assertEqual(classifyChanges(changes, bumpSdk).contentPaths, ['package.json'], 'a package.json script change was masked');
});

check('an empty net diff (a rehearsal) is version-only', () => {
  assertEqual(classifyChanges([], []), { versionOnly: true, contentPaths: [] }, 'an empty diff was not version-only');
});

check('bumpsBetween reads the guarded devDep pins of two package.json texts', () => {
  assertEqual(
    bumpsBetween(pkgJson(PIN), pkgJson({ ...PIN, '@civitai/theme': '0.6.0', '@civitai/sdk': '0.25.1' })),
    [
      { pkg: '@civitai/sdk', from: '0.25.2', to: '0.25.1' },
      { pkg: '@civitai/theme', from: '0.5.2', to: '0.6.0' },
    ],
    'bumpsBetween did not report both moves (one of them a downgrade)',
  );
});

// ---------------------------------------------------------------------------
console.log('');
console.log('AUTO-MERGE — only a version-only change that lands main exactly at npm latest');

const latestAll = { ...PIN, '@civitai/app-sdk': '0.87.1' };
const headPins = { ...PIN, '@civitai/app-sdk': '0.87.1' };
const versionOnly = { versionOnly: true, contentPaths: [] };

check('version-only, every head pin at npm latest: enable', () => {
  const d = autoMergeDecision({ bumps: bumpSdk, headPins, latest: latestAll, classification: versionOnly });
  assertEqual(d.enable, true, `auto-merge refused a clean bump: ${d.reasons.join('; ')}`);
});

check('a content change: refuse, and say why', () => {
  const d = autoMergeDecision({
    bumps: bumpSdk,
    headPins,
    latest: latestAll,
    classification: { versionOnly: false, contentPaths: ['apps/reference/hooks.md'] },
  });
  assertEqual(d.enable, false, 'auto-merge enabled on a content change');
  assert(d.reasons.some((r) => r.includes('apps/reference/hooks.md')), `the reason does not name the page: ${d.reasons}`);
});

check('a head pin BELOW npm latest: refuse — main must never land at an older version', () => {
  const d = autoMergeDecision({
    bumps: [{ pkg: '@civitai/app-sdk', from: '0.86.0', to: '0.85.0' }],
    headPins: { ...PIN, '@civitai/app-sdk': '0.85.0' },
    latest: { ...PIN },
    classification: versionOnly,
  });
  assertEqual(d.enable, false, 'auto-merge enabled on a downgrade');
});

check('ANY tracked head pin off npm latest refuses, even one this PR did not move', () => {
  const d = autoMergeDecision({
    bumps: bumpSdk,
    headPins,
    latest: { ...latestAll, '@civitai/theme': '0.5.3' },
    classification: versionOnly,
  });
  assertEqual(d.enable, false, 'auto-merge enabled while theme lags npm latest');
  assert(d.reasons.some((r) => r.includes('@civitai/theme')), `the reason does not name theme: ${d.reasons}`);
});

check('an unknown npm latest refuses (cannot prove "at latest")', () => {
  const latest = { ...latestAll };
  delete latest['@civitai/components'];
  const d = autoMergeDecision({ bumps: bumpSdk, headPins, latest, classification: versionOnly });
  assertEqual(d.enable, false, 'auto-merge enabled without knowing every latest');
});

// ---------------------------------------------------------------------------
console.log('');
console.log('PR TEXT');

check('title names each move as old -> new', () => {
  assertEqual(
    prTitle({ bumps: bumpSdk }),
    'chore(deps): bump @civitai/app-sdk 0.86.0 -> 0.87.1',
    'title wrong',
  );
});

check('a content-change body says auto-merge is off and lists the pages', () => {
  const b = prBody({
    bumps: bumpSdk,
    classification: { versionOnly: false, contentPaths: ['apps/reference/hooks.md'] },
    decision: { enable: false, reasons: ['x'] },
    runUrl: 'https://example.invalid/run/1',
  });
  assert(b.includes(CONTENT_LABEL), 'the body does not name the label');
  assert(/auto-merge is OFF/i.test(b), 'the body does not say auto-merge is off');
  assert(b.includes('apps/reference/hooks.md'), 'the body does not list the changed page');
  assert(b.includes('0.86.0') && b.includes('0.87.1'), 'the body does not name both versions');
  assert(!/did NOT run/.test(b), 'the body still carries the old zero-checks warning');
});

check('a version-only body says it will auto-merge', () => {
  const b = prBody({ bumps: bumpSdk, classification: versionOnly, decision: { enable: true, reasons: [] } });
  assert(/auto-merge/i.test(b) && !/auto-merge is OFF/i.test(b), 'the body does not describe auto-merge as on');
});

check('a rehearsal is parsed, and anything else is refused', () => {
  assertEqual(parseRehearse('@civitai/theme@0.5.1'), { pkg: '@civitai/theme', version: '0.5.1' }, 'parse failed');
  assertEqual(parseRehearse(''), null, 'empty rehearsal should be null');
  for (const bad of ['theme@0.5.1', '@civitai/lodash@1.0.0', '@civitai/theme@latest', '@civitai/theme@0.5.1;rm']) {
    let threw = false;
    try {
      parseRehearse(bad);
    } catch {
      threw = true;
    }
    assert(threw, `parseRehearse accepted ${bad}`);
  }
});

// ---------------------------------------------------------------------------
console.log('');
console.log('CLI — --dry-run against a fixture registry writes nothing');

function runCli(args, env) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, [join(repoRoot, 'scripts', 'bump-appblocks-pins.mjs'), ...args], {
      cwd: repoRoot,
      env: { ...process.env, CI: '', GITHUB_OUTPUT: '', ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => ok({ status, stdout, stderr }));
  });
}

const repoPins = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).devDependencies;
const bumped = (v) => v.replace(/^(\d+)\.(\d+)\.\d+$/, (_, a, b) => `${a}.${Number(b) + 1}.0`);

check('--dry-run plans the bump and the literal rewrites, and leaves package.json untouched', async () => {
  const sdkPin = repoPins['@civitai/app-sdk'];
  const next = bumped(sdkPin);
  assert(next !== sdkPin, 'fixture: the bumped version equals the pin');
  const docs = Object.fromEntries(TRACKED_PACKAGES.map((p) => [p, repoPins[p]]));
  docs['@civitai/app-sdk'] = next;
  const reg = await fixtureRegistry(docs);
  const before = readFileSync(join(repoRoot, 'package.json'), 'utf8');
  try {
    const res = await runCli(['--dry-run'], { APPBLOCKS_NPM_REGISTRY: reg.url });
    assertEqual(res.status, 0, `dry run exited ${res.status}:\n${res.stderr}`);
    assert(res.stdout.includes(`@civitai/app-sdk ${sdkPin} -> ${next}`), `the plan is not printed:\n${res.stdout}`);
    const m = /(\d+) literal\(s\) in (\d+) file\(s\)/.exec(res.stdout);
    assert(m && Number(m[1]) > 0, `no literal rewrites reported — the docs carry app-sdk stamps:\n${res.stdout}`);
    assert(/--dry-run: nothing written/.test(res.stdout), 'the dry run did not report that it wrote nothing');
  } finally {
    reg.server.close();
  }
  assertEqual(readFileSync(join(repoRoot, 'package.json'), 'utf8'), before, '--dry-run modified package.json');
});

check('--dry-run with every pin at latest reports nothing to bump', async () => {
  const reg = await fixtureRegistry(Object.fromEntries(TRACKED_PACKAGES.map((p) => [p, repoPins[p]])));
  try {
    const res = await runCli(['--dry-run'], { APPBLOCKS_NPM_REGISTRY: reg.url });
    assertEqual(res.status, 0, `exited ${res.status}:\n${res.stderr}`);
    assert(/nothing to bump/i.test(res.stdout), `did not report nothing to bump:\n${res.stdout}`);
  } finally {
    reg.server.close();
  }
});

check('a 404 for a tracked package fails the run (real drift)', async () => {
  const docs = Object.fromEntries(TRACKED_PACKAGES.map((p) => [p, repoPins[p]]));
  delete docs['@civitai/components-react'];
  const reg = await fixtureRegistry(docs);
  try {
    const res = await runCli(['--dry-run'], { APPBLOCKS_NPM_REGISTRY: reg.url });
    assertEqual(res.status, 1, `a 404 did not fail the run:\n${res.stdout}\n${res.stderr}`);
    assert(/@civitai\/components-react/.test(res.stderr), 'the failure does not name the package');
  } finally {
    reg.server.close();
  }
});

check('an unreachable registry skips without bumping anything (exit 0)', async () => {
  const docs = Object.fromEntries(TRACKED_PACKAGES.map((p) => [p, { status: 503 }]));
  const reg = await fixtureRegistry(docs);
  try {
    const res = await runCli(['--dry-run'], { APPBLOCKS_NPM_REGISTRY: reg.url });
    assertEqual(res.status, 0, `a transient failure failed the run:\n${res.stderr}`);
    assert(/skip/i.test(res.stdout), `did not report a skip:\n${res.stdout}`);
    assert(!/->/.test(res.stdout), 'a bump was planned from an unreachable registry');
  } finally {
    reg.server.close();
  }
});

check('--prepare refuses to run outside CI (it commits)', async () => {
  const res = await runCli(['--prepare', '--out', '/nonexistent'], {});
  assertEqual(res.status, 1, 'the committing path ran outside CI');
  assert(/outside CI/.test(res.stderr), `wrong refusal:\n${res.stderr}`);
});

// ---------------------------------------------------------------------------
console.log('');
console.log('REQUIRED CHECKS — the dispatch list both bots share');

const WF_DIR = join(repoRoot, '.github', 'workflows');
const runnable = (yml) => yml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

/** The top-level `on:` block of a workflow, comments dropped. */
function triggersOf(yml) {
  const r = runnable(yml);
  const m = /^on:\n((?: .*\n|\n)*)/m.exec(r);
  assert(m, 'no top-level on: block');
  return m[1];
}

/** `{ jobName: body }` for a workflow. */
function jobsOf(yml) {
  const at = yml.indexOf('\njobs:');
  assert(at > 0, 'no jobs: block');
  const body = yml.slice(at);
  const marks = [...body.matchAll(/^ {2}([a-z0-9][a-z0-9-]*):$/gm)];
  const out = {};
  marks.forEach((m, i) => {
    out[m[1]] = body.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : body.length);
  });
  return out;
}

check('every required context maps to a dispatchable workflow with a job of that name', () => {
  assertEqual(REQUIRED_CHECKS.length, 6, 'main requires six contexts');
  for (const { context, workflow } of REQUIRED_CHECKS) {
    const p = join(WF_DIR, workflow);
    assert(existsSync(p), `${workflow} does not exist`);
    const yml = readFileSync(p, 'utf8');
    assert(/^ {2}workflow_dispatch:/m.test(triggersOf(yml)), `${workflow} cannot be dispatched`);
    const jobs = jobsOf(yml);
    assert(context in jobs, `${workflow} has no job named ${context}`);
    assert(!/^ {4}name:/m.test(jobs[context]), `${workflow}'s ${context} job sets a name: — its check would not be "${context}"`);
  }
});

check('the dispatch commands are exactly `gh workflow run <file> --ref <branch>` per workflow', () => {
  assertEqual(
    dispatchCommands(BOT_BRANCH),
    REQUIRED_CHECKS.map(({ workflow }) => ['workflow', 'run', workflow, '--ref', BOT_BRANCH]),
    'the dispatch commands drifted',
  );
});

check('dispatching on main, or on nothing, is refused', () => {
  for (const ref of ['main', '', undefined, '--ref']) {
    let threw = false;
    try {
      dispatchCommands(ref);
    } catch {
      threw = true;
    }
    assert(threw, `dispatchCommands accepted ${JSON.stringify(ref)}`);
  }
});

check('one failed dispatch does not stop the rest, and the call still fails', () => {
  const ran = [];
  let threw = null;
  // The function logs each result; the planted failure's log line would read
  // as a real one in the CI output, so it is muted for this case only.
  const { log, error } = console;
  console.log = console.error = () => {};
  try {
    dispatchRequiredChecks(BOT_BRANCH, (args) => {
      ran.push(args[2]);
      if (args[2] === 'appblocks-bridge.yml') throw new Error('HTTP 500');
    });
  } catch (err) {
    threw = err;
  } finally {
    console.log = log;
    console.error = error;
  }
  assertEqual(ran.length, REQUIRED_CHECKS.length, 'a failure stopped the remaining dispatches');
  assert(threw && /appblocks-bridge\.yml/.test(threw.message), 'the failure was swallowed or not named');
});

// ---------------------------------------------------------------------------
console.log('');
console.log('THE WORKFLOW — appblocks-pin-bump.yml');

const BOT_WF = join(WF_DIR, 'appblocks-pin-bump.yml');
const botYml = existsSync(BOT_WF) ? readFileSync(BOT_WF, 'utf8') : '';

check('it runs daily, on dispatch (with dry_run), and on repository_dispatch — never on pull_request', () => {
  const on = triggersOf(botYml);
  assert(/^ {2}schedule:\n {4}- cron: '[^']+'/m.test(on), `no daily cron:\n${on}`);
  assert(/^ {2}workflow_dispatch:/m.test(on), 'no workflow_dispatch');
  assert(/^ {6}dry_run:/m.test(on), 'workflow_dispatch has no dry_run input');
  assert(/^ {2}repository_dispatch:/m.test(on), 'no repository_dispatch');
  assert(!/pull_request|push:/.test(on), 'the bot triggers on pull_request/push');
});

check('least privilege: read by default, write only in the job that runs no npm install', () => {
  const r = runnable(botYml);
  const preamble = r.slice(0, r.indexOf('\njobs:'));
  assert(/^permissions:\n {2}contents: read\n/m.test(preamble), 'the workflow default is not contents: read');
  const jobs = jobsOf(runnable(botYml));
  const writers = Object.entries(jobs).filter(([, b]) => /^\s+[a-z-]+: write$/m.test(b));
  assertEqual(writers.length, 1, `expected exactly one job with write scopes, got ${writers.map(([n]) => n)}`);
  const [, w] = writers[0];
  const scopes = [...w.matchAll(/^ {6}([a-z-]+): (read|write)$/gm)].map((m) => `${m[1]}:${m[2]}`).sort();
  assertEqual(
    scopes,
    ['actions:write', 'contents:write', 'pull-requests:write'],
    'the writer job holds the wrong scopes',
  );
  assert(!/npm (ci|install)/.test(w), 'the write-scoped job installs npm packages');
  for (const [name, body] of Object.entries(jobs)) {
    if (/npm (ci|install)/.test(body)) {
      assert(/persist-credentials: false/.test(body), `job ${name} installs npm packages with a persisted credential`);
    }
  }
});

check('every `uses:` is a first-party actions/* tag like the rest of the repo, or a full SHA', () => {
  const uses = [...runnable(botYml).matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert(uses.length > 0, 'no uses: found — the scan sees nothing');
  for (const u of uses) {
    const ok = /^actions\/[a-z-]+@v\d+$/.test(u) || /@[0-9a-f]{40}$/.test(u);
    assert(ok, `${u} is neither a first-party actions/* tag nor SHA-pinned`);
  }
});

check('no `${{ }}` expression is interpolated into a run: script', () => {
  const bad = [];
  let inRun = false;
  let indent = 0;
  for (const line of botYml.split('\n')) {
    if (inRun && line.trim() && line.search(/\S/) <= indent) inRun = false;
    const m = /^(\s*)(- )?run: \|/.exec(line);
    if (m) {
      inRun = true;
      indent = m[1].length;
      continue;
    }
    if ((inRun && line.includes('${{')) || /^\s*(- )?run: (?!\|).*\$\{\{/.test(line)) bad.push(line.trim());
  }
  assertEqual(bad, [], 'expressions reach shell text');
});

check('the workflow is a thin caller: no git push, no gh pr, no branch name but the bot one', () => {
  const r = runnable(botYml);
  assert(/bump-appblocks-pins\.mjs --prepare/.test(r) && /bump-appblocks-pins\.mjs --publish/.test(r), 'the script is not called');
  assert(!/git (push|commit)|gh pr /.test(r), 'the workflow does git/PR work itself');
  assert(/^concurrency:\n {2}group: \S+\n {2}cancel-in-progress: false$/m.test(r), 'runs are not serialised');
});

check('the bot never pushes to main: its push target is the bot branch constant', () => {
  const src = readFileSync(join(repoRoot, 'scripts', 'bump-appblocks-pins.mjs'), 'utf8');
  const pushes = [...src.matchAll(/\['push',[^\]]*\]/g)].map((m) => m[0]);
  assertEqual(pushes.length, 1, `expected exactly one git push in the script, found ${pushes.length}`);
  assert(pushes[0].includes('refs/heads/${BOT_BRANCH}') && !/main|--force|-f'/.test(pushes[0]), `bad push: ${pushes[0]}`);
  assertEqual(BOT_BRANCH, 'bot/appblocks-pin-bump', 'the bot branch changed');
});

check('both bots dispatch the required checks', () => {
  for (const f of ['appblocks-pin-bump.yml', 'cli-snapshot-refresh.yml']) {
    const r = runnable(readFileSync(join(WF_DIR, f), 'utf8'));
    const viaLib = /scripts\/lib\/required-checks\.mjs/.test(r);
    const viaScript = f === 'appblocks-pin-bump.yml' && /bump-appblocks-pins\.mjs --publish/.test(r);
    assert(viaLib || viaScript, `${f} never dispatches the required checks`);
    assert(/actions: write/.test(r), `${f} holds no actions: write, so it cannot dispatch`);
  }
  const src = readFileSync(join(repoRoot, 'scripts', 'bump-appblocks-pins.mjs'), 'utf8');
  assert(/dispatchRequiredChecks\(/.test(src), 'the pin bot never calls dispatchRequiredChecks');
});

check('this suite is wired into a pull_request workflow', () => {
  const wired = readdirSync(WF_DIR)
    .filter((f) => f.endsWith('.yml'))
    .map((f) => readFileSync(join(WF_DIR, f), 'utf8'))
    .filter((y) => /test:bump-appblocks-pins/.test(runnable(y)) && /^ {2}pull_request:/m.test(triggersOf(y)));
  assert(wired.length > 0, 'no pull_request workflow runs npm run test:bump-appblocks-pins');
});

// ---------------------------------------------------------------------------
for (const t of pending) await t();
console.log('');
const MIN_CHECKS = 46;
if (executed < MIN_CHECKS) {
  console.error(`bump-appblocks-pins tests: only ${executed} checks ran, expected at least ${MIN_CHECKS}`);
  process.exit(1);
}
if (failures) {
  console.error(`bump-appblocks-pins tests: ${failures} FAILED of ${executed}`);
  process.exit(1);
}
console.log(`bump-appblocks-pins tests: all ${executed} passed`);
