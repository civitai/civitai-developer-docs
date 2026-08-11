#!/usr/bin/env node
// Regression tests for scripts/refresh-cli-snapshot.mjs — the self-healing
// CLI-snapshot refresher that opens a PR instead of only going red.
//
//   node scripts/test-refresh-cli-snapshot.mjs
//
// WHY THIS EXISTS: the refresher's job is to COMMIT bytes nobody has looked at
// yet, on a schedule, into a PR whose checks do not run (see the header of the
// script). Every one of its safety properties is therefore a property of code
// that runs unattended:
//
//   - it must open NO PR when the snapshot is current (a bot that PRs for
//     nothing gets muted, and a muted bot buries the run that matters);
//   - it must FAIL, loudly and with no PR, on a SHORT capture — the failure
//     this path is most likely to produce and the one that looks most normal
//     in a diff;
//   - its "we could not ask upstream" and "we asked and the answer was no"
//     verdicts must stay distinct;
//   - the PR body must carry the zero-checks disclosure, because that is the
//     entire mitigation for the GITHUB_TOKEN trap.
//
// The floor test in particular is written so it WATCHES THE FLOOR FAIL: it
// truncates a real snapshot and asserts the specific refusal, not merely that
// "an error came back".
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_BASE,
  DEFAULT_BRANCH,
  SNAPSHOT_REL,
  countNulBytes,
  countSnapshotBlocks,
  decideAction,
  prBody,
  prCreationBlocked,
  prCreationBlockedAdvice,
  prTitle,
  validateCapture,
} from './refresh-cli-snapshot.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const SNAPSHOT = join(repoRoot, SNAPSHOT_REL);

let failures = 0;
let skipped = 0;
class Skip extends Error {}
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    if (err instanceof Skip) {
      skipped++;
      console.log(`  SKIP ${name}\n       ${err.message}`);
      return;
    }
    failures++;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const committed = readFileSync(SNAPSHOT, 'utf8');

// ---------------------------------------------------------------------------
console.log('BLOCK COUNTING — the quantity the anti-truncation floor is made of');

check('the committed snapshot carries an even, non-trivial number of ===CMD blocks', () => {
  const n = countSnapshotBlocks(committed);
  // Every node contributes exactly TWO blocks (`--help` + `__complete`), so an
  // ODD count is itself evidence of truncation. 106 = 53 nodes at civitai
  // v0.1.92. The floor in the script is RELATIVE (>= the snapshot being
  // replaced), so this is the pin that keeps the relative floor from being
  // re-based downwards without anyone noticing.
  assert(n >= 106, `only ${n} ===CMD blocks in the committed snapshot (was 106 at civitai v0.1.92)`);
  assertEqual(n % 2, 0, `odd ===CMD block count (${n}) — a node is missing one of its two blocks`);
});

check('countSnapshotBlocks matches an independent grep of the same file', () => {
  // A second tool that fails differently: a regex bug in countSnapshotBlocks
  // would otherwise be invisible to every assertion built on it.
  const out = execFileSync('grep', ['-c', '^===CMD', SNAPSHOT], { encoding: 'utf8' }).trim();
  assertEqual(countSnapshotBlocks(committed), Number(out), 'countSnapshotBlocks disagrees with grep -c');
});

check('countSnapshotBlocks is anchored — a ===CMD inside a line does not count', () => {
  assertEqual(countSnapshotBlocks('===CMD app===\nsee ===CMD app=== for details\n'), 1, 'unanchored match');
  assertEqual(countSnapshotBlocks(''), 0, 'empty text should carry no blocks');
});

check('countNulBytes sees a NUL and reports zero for clean text', () => {
  assertEqual(countNulBytes('a\x00b\x00c'), 2, 'NUL count wrong');
  assertEqual(countNulBytes(committed), 0, 'the committed snapshot carries NUL bytes');
});

// ---------------------------------------------------------------------------
console.log('');
console.log('THE FLOOR — a SHORT capture must be REFUSED, not PRed');

/** Drop the last `n` nodes (2 blocks each) from a snapshot, keeping the header. */
function truncateNodes(text, n) {
  const marks = [...text.matchAll(/^===CMD .+===$/gm)].map((m) => m.index);
  assert(marks.length > 2 * n, 'fixture too small to truncate');
  return text.slice(0, marks[marks.length - 2 * n]);
}

check('a capture missing commands is REFUSED, and the refusal names the shortfall', () => {
  const short = truncateNodes(committed, 3);
  // Positive control on the fixture itself: if this ever stops being short the
  // assertion below passes for the wrong reason.
  assertEqual(
    countSnapshotBlocks(short),
    countSnapshotBlocks(committed) - 6,
    'the truncation fixture did not actually remove 3 nodes',
  );
  const v = validateCapture({ next: short, prev: committed, expectedTag: 'v0.1.92' });
  assert(!v.ok, 'a capture missing 3 commands was ACCEPTED — the floor is not wired');
  const joined = v.problems.join('\n');
  assert(/SHORT CAPTURE/.test(joined), `the refusal does not identify itself as a short capture:\n${joined}`);
  assert(/missing 3 command/.test(joined), `the refusal does not name the shortfall:\n${joined}`);
  assert(/CIVITAI_CLI_BIN/.test(joined), `the refusal does not name the usual cause:\n${joined}`);
});

check('a capture missing exactly ONE command is refused (the floor is >=, not "roughly")', () => {
  const v = validateCapture({ next: truncateNodes(committed, 1), prev: committed, expectedTag: 'v0.1.92' });
  assert(!v.ok, 'a capture missing one command was accepted');
});

check('a capture that GROWS the tree is accepted (a new command must not read as truncation)', () => {
  const grown = `${committed}===CMD new-thing===\nUsage:\n  civitai new-thing\n===CMD complete new-thing===\n:4\n`;
  const v = validateCapture({ next: grown, prev: committed, expectedTag: 'v0.1.92' });
  assert(v.ok, `a larger capture was refused: ${v.problems.join(' | ')}`);
  assertEqual(v.stats.nextBlocks, countSnapshotBlocks(committed) + 2, 'stats do not reflect the grown tree');
});

check('an unchanged capture is accepted (the floor is a floor, not an inequality)', () => {
  const v = validateCapture({ next: committed, prev: committed, expectedTag: 'v0.1.92' });
  assert(v.ok, `the committed snapshot failed its own floor: ${v.problems.join(' | ')}`);
});

check('a NUL byte is refused, and the refusal explains what it breaks', () => {
  const poisoned = committed.replace('Usage:', 'Usage:\x00');
  assert(countNulBytes(poisoned) === 1, 'the fixture lost its NUL');
  const v = validateCapture({ next: poisoned, prev: committed, expectedTag: 'v0.1.92' });
  assert(!v.ok, 'a NUL-carrying capture was accepted');
  assert(/NUL BYTES/.test(v.problems.join('\n')), 'the refusal does not name the NUL');
  assert(/BINARY/.test(v.problems.join('\n')), 'the refusal does not say what a NUL breaks');
});

check('a capture from the WRONG binary is refused even when it is long enough', () => {
  // The nastiest shape: a full-length capture from the wrong version. The block
  // floor cannot see it at all — only the header can.
  const v = validateCapture({ next: committed, prev: committed, expectedTag: 'v0.1.99' });
  assert(!v.ok, 'a capture whose header disagrees with the target tag was accepted');
  const joined = v.problems.join('\n');
  assert(/WRONG BINARY/.test(joined), `the refusal does not identify the wrong binary:\n${joined}`);
  assert(/v0\.1\.99/.test(joined) && /v0\.1\.92/.test(joined), 'the refusal names neither the target nor the actual tag');
});

check('a capture with no parseable header is refused', () => {
  const headerless = committed.replace(/^Binary version:.*$/m, 'Binary version: (unknown)');
  const v = validateCapture({ next: headerless, prev: committed, expectedTag: 'v0.1.92' });
  assert(!v.ok, 'a capture with an unreadable header was accepted');
  assert(/UNREADABLE HEADER/.test(v.problems.join('\n')), 'the refusal does not name the header');
});

check('every refusal reports EVERY problem, not just the first', () => {
  // A capture is usually wrong one way. When it is wrong three ways, a reviewer
  // reading the job log should see three, or the second fix reveals the third.
  const bad = truncateNodes(committed, 2).replace('Usage:', 'Usage:\x00');
  const v = validateCapture({ next: bad, prev: committed, expectedTag: 'v0.1.99' });
  assert(!v.ok, 'a triply-broken capture was accepted');
  assert(v.problems.length >= 3, `only ${v.problems.length} problem(s) reported for a triply-broken capture`);
});

// ---------------------------------------------------------------------------
console.log('');
console.log('THE DECISION — "we asked and the answer was no" vs "we could not ask"');

check('a stale snapshot decides REFRESH, at the latest release tag', () => {
  const d = decideAction({ snapshotTag: 'v0.1.90', latestTag: 'v0.1.92', forcedTag: null });
  assertEqual(d.action, 'refresh', 'a stale snapshot did not decide refresh');
  assertEqual(d.targetTag, 'v0.1.92', 'refresh targeted the wrong tag');
});

check('a current snapshot decides UP-TO-DATE and names no target', () => {
  const d = decideAction({ snapshotTag: 'v0.1.92', latestTag: 'v0.1.92', forcedTag: null });
  assertEqual(d.action, 'up-to-date', 'a current snapshot did not decide up-to-date');
  assertEqual(d.targetTag, null, 'up-to-date must name no capture target');
});

check('a snapshot AHEAD of the latest release decides UP-TO-DATE, not refresh', () => {
  // Mirrors check:cli-snapshot: a capture from an unreleased build is fine and
  // must not be rolled BACKWARDS to the last release by a bot.
  const d = decideAction({ snapshotTag: 'v0.1.93', latestTag: 'v0.1.92', forcedTag: null });
  assertEqual(d.action, 'up-to-date', 'an ahead snapshot decided something other than up-to-date');
});

check('an unreachable releases endpoint decides SKIP — never up-to-date, never refresh', () => {
  const d = decideAction({ snapshotTag: 'v0.1.90', latestTag: null, forcedTag: null });
  assertEqual(d.action, 'skip', 'a failed upstream read did not decide skip');
  assert(d.action !== 'up-to-date', 'a rate-limited runner must never report the snapshot as current');
});

check('CLI_SNAPSHOT_REFRESH_TAG forces a refresh at that tag even when current', () => {
  const d = decideAction({ snapshotTag: 'v0.1.92', latestTag: 'v0.1.92', forcedTag: 'v0.1.90' });
  assertEqual(d.action, 'refresh', 'the documented override did not force a refresh');
  assertEqual(d.targetTag, 'v0.1.90', 'the override did not set the capture target');
});

// ---------------------------------------------------------------------------
console.log('');
console.log('THE PR BODY — the zero-checks disclosure IS the mitigation');

const sampleBody = prBody({
  fromVersion: 'v0.1.92',
  targetTag: 'v0.1.93',
  stats: { prevBlocks: 106, nextBlocks: 108, nuls: 0, tag: 'v0.1.93' },
  reason: 'snapshot tag v0.1.92 LAGS the latest civitai/cli release v0.1.93',
  runUrl: 'https://github.com/civitai/civitai-developer-docs/actions/runs/1',
  branch: DEFAULT_BRANCH,
});

check('the body states that the checks did NOT run, and says so FIRST', () => {
  // 🔴 Position is load-bearing, not style: "no checks" and "all checks green"
  // look identical in the GitHub UI, and a warning below the fold is a warning
  // a skimming reviewer never meets. Require it inside the opening section.
  assert(/did NOT run/i.test(sampleBody), 'the body does not say the checks did not run');
  const idx = sampleBody.indexOf('did NOT run');
  assert(idx >= 0 && idx < 200, `the disclosure is ${idx} chars in — it must open the body`);
  assert(/GITHUB_TOKEN/.test(sampleBody), 'the body does not name the cause (the default GITHUB_TOKEN)');
  assert(/empty, not green/.test(sampleBody), 'the body does not spell out how the empty checks list reads');
});

check('the body gives BOTH one-click remedies for triggering the checks', () => {
  assert(/close and reopen/i.test(sampleBody), 'the body does not offer close-and-reopen');
  assert(/--allow-empty/.test(sampleBody), 'the body does not offer an empty commit');
});

check('the body carries the numbers a reviewer needs to sanity-check the capture', () => {
  assert(sampleBody.includes('v0.1.92'), 'the body does not name the version being replaced');
  assert(sampleBody.includes('v0.1.93'), 'the body does not name the version captured');
  assert(/106 → 108/.test(sampleBody), 'the body does not report the block-count movement');
  assert(/NUL bytes/.test(sampleBody), 'the body does not report the NUL count');
});

check('the body says the floor exists and what it refuses', () => {
  assert(/fails the job instead of opening a PR/.test(sampleBody), 'the body does not state the floor contract');
});

check('the body names the stable branch and says it is reused', () => {
  assert(sampleBody.includes(DEFAULT_BRANCH), 'the body does not name the branch');
  assert(/one PR, not\s+one per day/.test(sampleBody), 'the body does not explain the stable-branch design');
});

check('the title names the tag it captured', () => {
  assertEqual(prTitle('v0.1.93'), 'chore(snapshot): re-capture the CLI help snapshot at v0.1.93', 'title drifted');
});

// ---------------------------------------------------------------------------
console.log('');
console.log('BLOCKED PR CREATION — the repo setting this feature cannot grant itself');

check('the real GitHub refusal is recognised, and unrelated failures are not', () => {
  // The exact text measured from a live run, kept verbatim so a reword of the
  // test fixture cannot silently diverge from what `gh` actually prints.
  const real = 'pull request create failed: GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)';
  assert(prCreationBlocked(real), 'the measured refusal text is not recognised');
  // Negative controls: this must not swallow every `gh` failure, or a genuine
  // outage would print "flip this setting" and exit as though it were understood.
  assert(!prCreationBlocked('pull request create failed: GraphQL: A pull request already exists'), 'over-broad match');
  assert(!prCreationBlocked('HTTP 502 Bad Gateway'), 'over-broad match');
  assert(!prCreationBlocked(''), 'an empty stderr must not be read as a permission refusal');
});

check('the advice names the setting, the API equivalent, and a one-click compare URL', () => {
  const a = prCreationBlockedAdvice({ branch: DEFAULT_BRANCH, base: DEFAULT_BASE, repoSlug: 'o/r' });
  assert(/Allow GitHub Actions to create and approve pull requests/.test(a), 'the advice does not name the setting');
  assert(/Settings -> Actions -> General/.test(a), 'the advice does not name where the setting lives');
  assert(/can_approve_pull_request_reviews=true/.test(a), 'the advice does not give the API equivalent');
  // 🔴 The branch IS pushed at this point. Without the compare URL the run is a
  // red job about a snapshot sitting somewhere the reader has to go find.
  assert(a.includes(`https://github.com/o/r/compare/${DEFAULT_BASE}...${DEFAULT_BRANCH}?expand=1`), 'no compare URL');
  assert(/branch was pushed, the PR was not opened/.test(a), 'the advice does not say what state the repo is in');
  assert(/NOT something a `permissions:` block can grant/.test(a), 'the advice does not rule out the wrong fix');
});

// ---------------------------------------------------------------------------
console.log('');
console.log('END TO END — the script itself, against a scratch clone with a local origin');

/**
 * A throwaway clone of this repo with a BARE local `origin`, so the branch and
 * commit the script produces can be inspected without touching any real remote.
 * `--no-pr` stops short of the `gh` calls.
 */
function scratchRepo() {
  const root = mkdtempSync(join(tmpdir(), 'refresh-cli-snapshot-'));
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  mkdirSync(work);
  execFileSync('git', ['init', '--bare', '-b', DEFAULT_BASE, origin], { stdio: 'ignore' });
  execFileSync('git', ['init', '-b', DEFAULT_BASE, work], { stdio: 'ignore' });
  for (const rel of ['scripts', 'appblocks-snapshots', '.vitepress']) {
    cpSync(join(repoRoot, rel), join(work, rel), { recursive: true });
  }
  cpSync(join(repoRoot, 'package.json'), join(work, 'package.json'));
  const env = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const g = (args) => execFileSync('git', ['-C', work, ...args], { stdio: 'ignore', env: { ...process.env, ...env } });
  g(['add', '--', 'scripts', 'appblocks-snapshots', '.vitepress', 'package.json']);
  g(['commit', '-m', 'base']);
  g(['remote', 'add', 'origin', origin]);
  g(['push', '-u', 'origin', DEFAULT_BASE]);
  return { root, origin, work };
}

function runScript(work, args, env) {
  return spawnSync(process.execPath, [join(work, 'scripts', 'refresh-cli-snapshot.mjs'), ...args], {
    cwd: work,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
      // Never let a scratch run reach the real releases endpoint.
      APPBLOCKS_CLI_RELEASES_URL: 'http://127.0.0.1:1/nope',
      ...env,
    },
  });
}

/** A `civitai` stand-in: replays a recorded bundle instead of a real binary. */
function fakeCliBin(dir, bundlePath, version) {
  const bin = join(dir, 'fake-civitai');
  // gen-appblocks-cli.mjs shells out per node (`<path> --help`, `__complete …`).
  // Replaying the recorded bundle by label reproduces that interface exactly,
  // which is what lets this test drive the REAL generator with no Go toolchain.
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const { readFileSync } = require('node:fs');
const bundle = readFileSync(${JSON.stringify(bundlePath)}, 'utf8');
const blocks = {};
{
  const re = /^===CMD (.+?)===$/gm; const marks = []; let m;
  while ((m = re.exec(bundle))) marks.push({ label: m[1].trim(), start: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? bundle.lastIndexOf('===CMD', marks[i + 1].start) : bundle.length;
    blocks[marks[i].label] = bundle.slice(marks[i].start, end).replace(/^\\n/, '');
  }
}
const argv = process.argv.slice(2);
if (argv[0] === '--version') { process.stdout.write(${JSON.stringify(version)} + '\\n'); process.exit(0); }
let label, path;
if (argv[0] === '__complete') { path = argv.slice(1).filter((a) => a !== ''); label = 'complete ' + (path.length ? path.join(' ') : '(root)'); }
else { path = argv.filter((a) => a !== '--help'); label = path.length ? path.join(' ') : '(root)'; }
const body = blocks[label];
if (body == null) { process.stderr.write('no such block: ' + label + '\\n'); process.exit(1); }
process.stdout.write(body);
`,
    { mode: 0o755 },
  );
  return bin;
}

check('UP TO DATE -> exits 0, opens no PR, creates no branch, changes no bytes', () => {
  const { work, origin } = scratchRepo();
  const before = readFileSync(join(work, SNAPSHOT_REL), 'utf8');
  const res = runScript(work, [], { CLI_SNAPSHOT_REFRESH_TAG: '' });
  // The releases URL is a dead loopback port, so this run takes the SKIP path
  // rather than up-to-date; both must behave identically here — no branch, no
  // PR, no byte moved. The distinction they must NOT collapse is in their
  // message, asserted by the decideAction tests above.
  assertEqual(res.status, 0, `exit ${res.status}\n${res.stdout}\n${res.stderr}`);
  assertEqual(readFileSync(join(work, SNAPSHOT_REL), 'utf8'), before, 'a no-op run rewrote the snapshot');
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(!branches.includes(DEFAULT_BRANCH), `a no-op run pushed ${DEFAULT_BRANCH}:\n${branches}`);
  assert(/skipping|Nothing to do/.test(res.stdout), `the run did not report itself as a no-op:\n${res.stdout}`);
});

check('DRIFT -> pushes the stable branch with ONE file changed, and prints the PR body', () => {
  const { work, origin, root } = scratchRepo();
  // Make the committed snapshot "old" by rewriting only its header, then hand
  // the script a fake binary that replays the REAL committed bundle at the
  // target tag. The capture therefore differs from the checked-in file by
  // exactly the header line, which is the smallest honest drift.
  const stale = committed.replace(/^Binary version: civitai .*$/m, 'Binary version: civitai v0.1.90');
  writeFileSync(join(work, SNAPSHOT_REL), stale);
  execFileSync('git', ['-C', work, 'commit', '-am', 'stale'], {
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  execFileSync('git', ['-C', work, 'push', 'origin', DEFAULT_BASE], { stdio: 'ignore' });

  const bundlePath = join(root, 'bundle.txt');
  writeFileSync(bundlePath, committed);
  const bin = fakeCliBin(root, bundlePath, 'civitai v0.1.92');

  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: 'v0.1.92' });
  assertEqual(res.status, 0, `exit ${res.status}\n${res.stdout}\n${res.stderr}`);

  // The branch exists on the "remote", and it changed exactly ONE file.
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(branches.includes(DEFAULT_BRANCH), `the stable branch was not pushed:\n${branches}`);
  const changed = execFileSync(
    'git',
    ['-C', origin, 'diff', '--name-only', `${DEFAULT_BASE}..${DEFAULT_BRANCH}`],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  assertEqual(changed.join(','), SNAPSHOT_REL, `the commit touched more than the snapshot: ${changed.join(', ')}`);

  // 🔴 The bytes on the branch are the CAPTURE, not the stale file. A push that
  // carried the old bytes would satisfy every assertion above.
  const onBranch = execFileSync('git', ['-C', origin, 'show', `${DEFAULT_BRANCH}:${SNAPSHOT_REL}`], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert(/^Binary version: civitai v0\.1\.92$/m.test(onBranch), 'the branch carries the stale header');
  assertEqual(countSnapshotBlocks(onBranch), countSnapshotBlocks(committed), 'the branch carries a short capture');

  assert(/did NOT run/.test(res.stdout), `the printed PR body lacks the zero-checks disclosure:\n${res.stdout}`);
  assert(res.stdout.includes(prTitle('v0.1.92')), 'the printed title is not the one the PR would carry');
});

/**
 * A bundle describing a CLI that no longer ships `<name>` as a top-level
 * command — removed from BOTH root enumerations, which is what an older binary
 * genuinely looks like. Removing it from only one trips the generator's own
 * cross-check instead, which is a different (and separately tested) refusal.
 */
function dropTopLevelCommand(text, name) {
  const out = text
    .replace(new RegExp(`^ {2}${name} {2,}.*$\\n`, 'm'), '') // the `Available Commands:` row
    .replace(new RegExp(`^${name}\\t.*$\\n`, 'm'), ''); // the `__complete` row
  assert(out !== text, `the fixture did not remove "${name}"`);
  assert(!new RegExp(`^${name}\\t`, 'm').test(out), `"${name}" survives in a __complete block`);
  return out;
}

check('THE FLOOR FAILS THE RUN: a short capture exits non-zero, pushes nothing, restores the tree', () => {
  const { work, origin, root } = scratchRepo();
  const before = readFileSync(join(work, SNAPSHOT_REL), 'utf8');
  // A binary that walks a SMALLER tree — the measured real-world failure (an
  // older `civitai` on PATH wrote 47 commands instead of 52 and exited 0). The
  // walk simply never descends into the dropped node, so every generator guard
  // is satisfied and only the floor stands between this and a PR.
  const bundlePath = join(root, 'short.txt');
  writeFileSync(bundlePath, dropTopLevelCommand(committed, 'generate'));
  const bin = fakeCliBin(root, bundlePath, 'civitai v0.1.92');

  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: 'v0.1.92' });
  const out = `${res.stdout}\n${res.stderr}`;
  assert(res.status !== 0, `a SHORT capture exited 0 — it would have opened a PR:\n${out}`);
  // 🔴 It must fail on THE FLOOR, by name. A run that died for some other
  // reason is green-for-the-wrong-reason: it proves nothing about the floor.
  assert(/SHORT CAPTURE/.test(out), `the run did not fail on the floor:\n${out}`);
  assert(/missing 1 command/.test(out), `the refusal did not name the shortfall:\n${out}`);
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(!branches.includes(DEFAULT_BRANCH), `a rejected capture still pushed ${DEFAULT_BRANCH}:\n${branches}`);
  assertEqual(readFileSync(join(work, SNAPSHOT_REL), 'utf8'), before, 'a rejected capture left the tree modified');
});

check('a capture the GENERATOR refuses also restores the tree and opens nothing', () => {
  // `--write-snapshot` writes the file and THEN builds the artifact, so the
  // generator's own guards throw with bad bytes already on disk. Measured: the
  // first cut of this script restored the tree only after a failed FLOOR, so
  // this path left the checkout modified.
  const { work, origin, root } = scratchRepo();
  const before = readFileSync(join(work, SNAPSHOT_REL), 'utf8');
  const bundlePath = join(root, 'inconsistent.txt');
  // Removed from `__complete` only — the two enumerations now disagree.
  writeFileSync(bundlePath, committed.replace(/^generate\t.*$\n/m, ''));
  const bin = fakeCliBin(root, bundlePath, 'civitai v0.1.92');
  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: 'v0.1.92' });
  const out = `${res.stdout}\n${res.stderr}`;
  assert(res.status !== 0, `a capture the generator refuses exited 0:\n${out}`);
  assert(/CAPTURE FAILED/.test(out), `the failure was not reported as a capture failure:\n${out}`);
  assertEqual(readFileSync(join(work, SNAPSHOT_REL), 'utf8'), before, 'the tree was left holding a refused capture');
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(!branches.includes(DEFAULT_BRANCH), 'a refused capture still pushed a branch');
});

check('TWO consecutive drift runs reuse ONE branch — they do not accumulate', () => {
  // 🔴 The design decision this pins: a fresh branch per run opens a PR per day
  // for the same fact and gets muted inside a week, which is strictly worse
  // than the red it replaces. Asserting `branches.includes(DEFAULT_BRANCH)`
  // cannot see a per-run name that merely embeds the constant, and asserting a
  // name at all would move with the constant. Count the branches instead.
  const { work, origin, root } = scratchRepo();
  const stale = committed.replace(/^Binary version: civitai .*$/m, 'Binary version: civitai v0.1.90');
  writeFileSync(join(work, SNAPSHOT_REL), stale);
  const gitEnv = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  execFileSync('git', ['-C', work, 'commit', '-am', 'stale'], { stdio: 'ignore', env: { ...process.env, ...gitEnv } });
  execFileSync('git', ['-C', work, 'push', 'origin', DEFAULT_BASE], { stdio: 'ignore' });
  const bundlePath = join(root, 'bundle.txt');
  writeFileSync(bundlePath, committed);
  const bin = fakeCliBin(root, bundlePath, 'civitai v0.1.92');

  for (const run of [1, 2]) {
    // Run 2 starts from the branch run 1 left checked out, which is the shape
    // a second CI run does NOT have — reset to base first so each run is a
    // fresh checkout of `main`, as actions/checkout would give it.
    execFileSync('git', ['-C', work, 'checkout', '-f', DEFAULT_BASE], { stdio: 'ignore' });
    const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: 'v0.1.92' });
    assertEqual(res.status, 0, `run ${run} exited ${res.status}\n${res.stdout}\n${res.stderr}`);
  }
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.replace(/^\*?\s*/, ''))
    .filter(Boolean);
  assertEqual(branches.length, 2, `two runs left ${branches.length} branches on the remote: ${branches.join(', ')}`);
  assert(branches.includes(DEFAULT_BRANCH), `the stable branch is missing: ${branches.join(', ')}`);
});

check('a capture identical to the committed snapshot opens NO PR', () => {
  const { work, origin, root } = scratchRepo();
  const bundlePath = join(root, 'same.txt');
  writeFileSync(bundlePath, committed);
  const bin = fakeCliBin(root, bundlePath, 'civitai v0.1.92');
  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: 'v0.1.92' });
  assertEqual(res.status, 0, `exit ${res.status}\n${res.stdout}\n${res.stderr}`);
  assert(/byte-identical/.test(res.stdout), `the run did not report the no-op:\n${res.stdout}`);
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(!branches.includes(DEFAULT_BRANCH), 'an identical capture still pushed a branch');
});

check('a refresh with no CIVITAI_CLI_BIN fails rather than letting the generator find one on PATH', () => {
  // The recorded failure: gen-appblocks-cli.mjs prefers a live `civitai` on
  // PATH, so an unset CIVITAI_CLI_BIN silently captures from whatever happens
  // to be installed. On a runner that is nothing; on a developer box it is a
  // short capture. Refusing is the only safe answer.
  const { work } = scratchRepo();
  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: '', CLI_SNAPSHOT_REFRESH_TAG: 'v0.1.92' });
  assert(res.status !== 0, 'a refresh with no binary exited 0');
  assert(/CIVITAI_CLI_BIN is unset/.test(res.stderr), `unexpected failure:\n${res.stderr}`);
});

// ---------------------------------------------------------------------------
console.log('');
console.log('THE WORKFLOW — the thin caller must stay thin, scoped and non-gating');

const WORKFLOW = join(repoRoot, '.github', 'workflows', 'cli-snapshot-refresh.yml');

/**
 * The `on:` block alone. 🔴 Every trigger assertion reads THIS, not the file:
 * a `/workflow_dispatch/` search over the whole YAML is satisfied by the word
 * appearing in a comment, and — measured as a SURVIVING mutant — by renaming
 * the key to `workflow_dispatch_disabled`, which still contains it.
 */
function triggerBlock() {
  const yml = readFileSync(WORKFLOW, 'utf8');
  const on = yml.slice(yml.indexOf('\non:') + 1, yml.indexOf('\npermissions:'));
  assert(on.startsWith('on:'), 'could not isolate the trigger block');
  return on;
}

check('the workflow exists and can be dispatched on demand', () => {
  const on = triggerBlock();
  // The happy path CANNOT fire on a day the snapshot is current, so a
  // dispatchable trigger is what makes this workflow testable at all — which
  // is why it is asserted rather than assumed.
  assert(/^ {2}workflow_dispatch:$/m.test(on), `no workflow_dispatch: trigger — the path could never be exercised:\n${on}`);
  assert(/^ {2}schedule:$/m.test(on), `no schedule: trigger — the whole point is that it runs unattended:\n${on}`);
  assert(/cron: '[^']+'/.test(on), 'the schedule declares no cron expression');
  // The documented override the dispatch exists to carry.
  assert(/force_tag:/.test(on), 'workflow_dispatch takes no force_tag input — the drift path stays unexercisable');
});

check('write permissions are scoped to the ONE job, and the workflow default stays read', () => {
  const yml = readFileSync(WORKFLOW, 'utf8');
  const jobsAt = yml.indexOf('\njobs:');
  assert(jobsAt > 0, 'no jobs: block');
  const preamble = yml.slice(0, jobsAt);
  const jobs = yml.slice(jobsAt);
  assert(/^permissions:\n\s+contents: read\n/m.test(preamble), 'the workflow-level default is not `contents: read`');
  assert(!/contents:\s*write/.test(preamble), 'the workflow-level block grants write — it must be job-scoped');
  assert(/contents:\s*write/.test(jobs), 'the job does not request contents: write (it cannot push its branch)');
  assert(/pull-requests:\s*write/.test(jobs), 'the job does not request pull-requests: write (it cannot open a PR)');
  // Nothing else. A bot that runs unattended should not hold a permission it
  // has no call for, and each of these has been the blast radius of a real
  // supply-chain incident somewhere.
  for (const scope of ['issues:', 'packages:', 'id-token:', 'actions:', 'deployments:', 'security-events:']) {
    assert(!jobs.includes(scope), `the job requests ${scope} — it has no use for it`);
  }
});

check('the workflow is a THIN CALLER — the logic lives in the tested script', () => {
  const yml = readFileSync(WORKFLOW, 'utf8');
  assert(/refresh-cli-snapshot\.mjs/.test(yml), 'the workflow does not call the script');
  // A workflow body is untestable, so anything decision-shaped in it is
  // untested by construction. `gh pr create` in YAML is the shape to refuse.
  //
  // 🔴 Read the RUNNABLE lines, not the file. The header QUOTES the failure text
  // "`gh pr create` fails with …" to explain the repo-setting prerequisite, so a
  // whole-file search fails on the documentation of the rule it enforces —
  // measured: this assertion went red the moment that comment was added.
  const runnable = yml
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
  assert(!/gh pr (create|edit)/.test(runnable), 'the workflow opens the PR itself — that logic belongs in the script');
  assert(!/git (commit|push)/.test(runnable), 'the workflow does the git work itself — that logic belongs in the script');
});

check('the job is not named like one of `main`\'s required contexts', () => {
  // Non-gating is a DOCTRINE here (upstream movement must not block unrelated
  // docs PRs). A job whose name collides with a required context would be
  // silently promoted into a gate.
  const required = ['test-cli', 'test-messages', 'test-bridge', 'typecheck-snippets', 'build-site', 'test-md-regions'];
  const yml = readFileSync(WORKFLOW, 'utf8');
  const names = [...yml.matchAll(/^ {2}([a-z0-9-]+):$/gm)].map((m) => m[1]);
  for (const n of names) assert(!required.includes(n), `job "${n}" collides with a required status check on main`);
  // 🔴 Read the TRIGGERS, not the file. A `/pull_request/` search over the whole
  // YAML is satisfied by the comment that says "do NOT add a `pull_request:`
  // trigger" — a guard defeated by the documentation of the thing it guards.
  const on = triggerBlock();
  assert(!/^ {2}pull_request/m.test(on), `the workflow triggers on pull_request — it must stay non-gating:\n${on}`);
});

console.log('');
if (failures) {
  console.error(`refresh-cli-snapshot tests: ${failures} FAILED, ${skipped} skipped`);
  process.exit(1);
}
console.log(`refresh-cli-snapshot tests: all passed (${skipped} skipped)`);
