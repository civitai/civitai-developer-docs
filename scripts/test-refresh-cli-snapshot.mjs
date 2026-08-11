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
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshotVersion } from './check-appblocks-cli-snapshot.mjs';
import {
  DEFAULT_BASE,
  DEFAULT_BRANCH,
  SNAPSHOT_REL,
  branchPushedAdvice,
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
let executed = 0;
function check(name, fn) {
  executed++;
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
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
// 🔴 EVERY TAG BELOW IS DERIVED FROM THE COMMITTED SNAPSHOT, NEVER TYPED.
//
// They were typed — `expectedTag: 'v0.1.92'` in eight places, `civitai v0.1.92`
// as the fake binary's version in six more — and that is a fixture pinned to a
// value THIS FEATURE'S OWN SUCCESS CHANGES. The first accepted refresh PR bumps
// the committed header to the next release, every one of those assertions then
// describes a snapshot that no longer exists, and `main` goes red the morning
// the bot works for the first time. A suite that breaks when the thing it
// guards succeeds is worse than no suite: it trains everyone to expect a red.
//
// `SNAP_TAG` is the release tag the committed snapshot records; `SNAP_RAW` is
// the full `git describe` string (they differ whenever the capture came from an
// unreleased build, e.g. `v0.1.90-34-g4018e2c`). OLDER/NEWER are synthetic
// neighbours used wherever a test needs "some other tag" — their identity never
// matters, only their ORDER relative to SNAP_TAG.
const snap = parseSnapshotVersion(committed);
assert(snap.ok, `the committed snapshot has no readable header: ${snap.reason}`);
const SNAP_TAG = snap.tag;
const SNAP_RAW = snap.raw;

function shiftTag(tag, delta) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!m) throw new Error(`cannot shift a non-semver tag: ${tag}`);
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  pat += delta;
  if (pat < 0) {
    min -= 1;
    pat = 999;
  }
  if (min < 0) throw new Error(`cannot shift ${tag} by ${delta}`);
  return `v${maj}.${min}.${pat}`;
}
const OLDER = shiftTag(SNAP_TAG, -1);
const NEWER = shiftTag(SNAP_TAG, +1);

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
  const v = validateCapture({ next: short, prev: committed, expectedTag: SNAP_TAG });
  assert(!v.ok, 'a capture missing 3 commands was ACCEPTED — the floor is not wired');
  const joined = v.problems.join('\n');
  assert(/SHORT CAPTURE/.test(joined), `the refusal does not identify itself as a short capture:\n${joined}`);
  assert(/missing 3 command/.test(joined), `the refusal does not name the shortfall:\n${joined}`);
  assert(/CIVITAI_CLI_BIN/.test(joined), `the refusal does not name the usual cause:\n${joined}`);
});

check('a capture missing exactly ONE command is refused (the floor is >=, not "roughly")', () => {
  const v = validateCapture({ next: truncateNodes(committed, 1), prev: committed, expectedTag: SNAP_TAG });
  assert(!v.ok, 'a capture missing one command was accepted');
});

check('a capture that GROWS the tree is accepted (a new command must not read as truncation)', () => {
  const grown = `${committed}===CMD new-thing===\nUsage:\n  civitai new-thing\n===CMD complete new-thing===\n:4\n`;
  const v = validateCapture({ next: grown, prev: committed, expectedTag: SNAP_TAG });
  assert(v.ok, `a larger capture was refused: ${v.problems.join(' | ')}`);
  assertEqual(v.stats.nextBlocks, countSnapshotBlocks(committed) + 2, 'stats do not reflect the grown tree');
});

check('an unchanged capture is accepted (the floor is a floor, not an inequality)', () => {
  const v = validateCapture({ next: committed, prev: committed, expectedTag: SNAP_TAG });
  assert(v.ok, `the committed snapshot failed its own floor: ${v.problems.join(' | ')}`);
});

check('a NUL byte is refused, and the refusal explains what it breaks', () => {
  const poisoned = committed.replace('Usage:', 'Usage:\x00');
  assert(countNulBytes(poisoned) === 1, 'the fixture lost its NUL');
  const v = validateCapture({ next: poisoned, prev: committed, expectedTag: SNAP_TAG });
  assert(!v.ok, 'a NUL-carrying capture was accepted');
  assert(/NUL BYTES/.test(v.problems.join('\n')), 'the refusal does not name the NUL');
  assert(/BINARY/.test(v.problems.join('\n')), 'the refusal does not say what a NUL breaks');
});

check('a capture from the WRONG binary is refused even when it is long enough', () => {
  // The nastiest shape: a full-length capture from the wrong version. The block
  // floor cannot see it at all — only the header can.
  const v = validateCapture({ next: committed, prev: committed, expectedTag: NEWER });
  assert(!v.ok, 'a capture whose header disagrees with the target tag was accepted');
  const joined = v.problems.join('\n');
  assert(/WRONG BINARY/.test(joined), `the refusal does not identify the wrong binary:\n${joined}`);
  assert(joined.includes(NEWER) && joined.includes(SNAP_TAG), 'the refusal names neither the target nor the actual tag');
});

check('a capture with no parseable header is refused', () => {
  const headerless = committed.replace(/^Binary version:.*$/m, 'Binary version: (unknown)');
  const v = validateCapture({ next: headerless, prev: committed, expectedTag: SNAP_TAG });
  assert(!v.ok, 'a capture with an unreadable header was accepted');
  assert(/UNREADABLE HEADER/.test(v.problems.join('\n')), 'the refusal does not name the header');
});

check('every refusal reports EVERY problem, not just the first', () => {
  // A capture is usually wrong one way. When it is wrong three ways, a reviewer
  // reading the job log should see three, or the second fix reveals the third.
  const bad = truncateNodes(committed, 2).replace('Usage:', 'Usage:\x00');
  const v = validateCapture({ next: bad, prev: committed, expectedTag: NEWER });
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

// Derived, for the same reason every other tag here is: the assertions below
// ask that the body NAMES these versions, and a literal repeated in both the
// input and the assertion is a pair that can silently stop describing anything.
const SAMPLE = { from: SNAP_RAW, to: NEWER, prevBlocks: 106, nextBlocks: 108 };
const sampleBody = prBody({
  fromVersion: SAMPLE.from,
  targetTag: SAMPLE.to,
  stats: { prevBlocks: SAMPLE.prevBlocks, nextBlocks: SAMPLE.nextBlocks, nuls: 0, tag: SAMPLE.to },
  reason: `snapshot tag ${SNAP_TAG} LAGS the latest civitai/cli release ${SAMPLE.to}`,
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
  // Positive control on the fixture: the two versions must be DISTINCT, or
  // "names both" is satisfied by a body that names one thing twice.
  assert(SAMPLE.from !== SAMPLE.to, 'the sample replaces a version with itself — the assertions below say nothing');
  assert(sampleBody.includes(SAMPLE.from), 'the body does not name the version being replaced');
  assert(sampleBody.includes(SAMPLE.to), 'the body does not name the version captured');
  assert(sampleBody.includes(`${SAMPLE.prevBlocks} → ${SAMPLE.nextBlocks}`), 'the body does not report the block-count movement');
  assert(/NUL bytes/.test(sampleBody), 'the body does not report the NUL count');
});

check('the body reports the versions in the RIGHT ORDER — was, then now', () => {
  // 🔴 THE OPERAND-SWAP CLASS. Every assertion above is satisfied by a body that
  // names both versions ANYWHERE, so exchanging `fromVersion` and `stats.tag`
  // survives all of them — and the swapped body tells a reviewer the snapshot is
  // being rolled BACKWARDS, which is the one thing that would make them reject a
  // correct PR. Read the two rows separately.
  const row = (label) => sampleBody.split('\n').find((l) => l.startsWith(`| ${label}`)) || '';
  const was = row('snapshot was captured from');
  const now = row('now captured from');
  assert(was && now, `the body no longer carries the two version rows:\n${sampleBody}`);
  assert(was.includes(SAMPLE.from), `the "was captured from" row does not name the OLD version: ${was}`);
  assert(!was.includes(SAMPLE.to), `the "was captured from" row names the NEW version — the operands are swapped: ${was}`);
  assert(now.includes(SAMPLE.to), `the "now captured from" row does not name the NEW version: ${now}`);
  assert(!now.includes(SAMPLE.from), `the "now captured from" row names the OLD version — the operands are swapped: ${now}`);
});

check('the body says the floor exists and what it refuses', () => {
  assert(/fails the job instead of opening a PR/.test(sampleBody), 'the body does not state the floor contract');
});

check('the body names the stable branch and says it is reused', () => {
  assert(sampleBody.includes(DEFAULT_BRANCH), 'the body does not name the branch');
  assert(/one PR, not\s+one per day/.test(sampleBody), 'the body does not explain the stable-branch design');
  // 🔴 The body ASKS the reviewer to push an empty commit to this branch (it is
  // the documented remedy for the zero-checks trap). It must therefore promise
  // the commit survives — the promise and the behaviour ship together, or the
  // instruction is the trap it used to be.
  assert(
    /never force-push/.test(sampleBody),
    'the body asks for a commit on the bot branch without promising it survives the next run',
  );
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

check('EVERY post-push failure gets the compare URL, not only the one with a diagnosis', () => {
  // 🔴 "The branch is pushed and nobody has been told" is the state this whole
  // workflow exists to end, and it used to be announced only when
  // `prCreationBlocked` matched. A `gh pr list` outage, an expired token, `gh`
  // missing, a 502, the "already exists" race — all reached the SAME repo state
  // with a stack trace and no URL. The unanticipated failures are exactly the
  // ones a reader needs the state spelled out for.
  const a = branchPushedAdvice({ branch: DEFAULT_BRANCH, base: DEFAULT_BASE, repoSlug: 'o/r', cause: 'HTTP 502' });
  assert(a.includes(`https://github.com/o/r/compare/${DEFAULT_BASE}...${DEFAULT_BRANCH}?expand=1`), 'no compare URL');
  assert(/BRANCH IS PUSHED BUT NO PR/.test(a), 'the advice does not say what state the repo is in');
  assert(a.includes('HTTP 502'), 'the advice does not name the cause it was given');
  assert(a.includes(DEFAULT_BRANCH), 'the advice does not name the branch the work is on');
  // It must NOT claim the repo-setting diagnosis for a failure it knows nothing
  // about — that is the over-broad direction, and it would send a reader to
  // flip a checkbox that was never the problem.
  assert(!/Allow GitHub Actions to create and approve/.test(a), 'the generic advice asserts the specific diagnosis');
  // A missing slug must still produce a usable URL rather than `undefined`.
  const noSlug = branchPushedAdvice({ branch: DEFAULT_BRANCH, base: DEFAULT_BASE, repoSlug: undefined, cause: 'x' });
  assert(!/undefined/.test(noSlug), `the advice interpolated undefined:\n${noSlug}`);
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
const GIT_IDENT = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

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
      // 🔴 SET EXPLICITLY, NOT INHERITED. The script refuses its pushing path
      // outside CI, and `CI` is set on a runner and unset on a laptop — so
      // inheriting it would make this whole suite take a DIFFERENT branch in
      // the two places it runs, and the local green would say nothing about
      // the one that gates. The refusal itself is covered by its own case,
      // which clears this.
      CI: '1',
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

// 🔴 NAMED FOR THE PATH IT TAKES, WHICH IS *SKIP*. It was called
// "UP TO DATE -> …" and never once reached the up-to-date branch: the scratch
// releases URL is a dead loopback port, so the upstream read fails and the run
// SKIPs. A name that misdescribes the path is how a hole gets read as covered —
// the up-to-date branch is exercised by the `--decide` case below and by the
// pure `decideAction` tests, and neither of those is this.
check('UNREACHABLE UPSTREAM (skip) -> exits 0, opens no PR, creates no branch, changes no bytes', () => {
  const { work, origin } = scratchRepo();
  const before = readFileSync(join(work, SNAPSHOT_REL), 'utf8');
  const res = runScript(work, [], { CLI_SNAPSHOT_REFRESH_TAG: '' });
  // Both no-op verdicts must behave identically HERE — no branch, no PR, no
  // byte moved. The distinction they must NOT collapse is in their message,
  // asserted by the decideAction tests above.
  assertEqual(res.status, 0, `exit ${res.status}\n${res.stdout}\n${res.stderr}`);
  assert(/skipping/.test(res.stdout), `this fixture must take the SKIP path, and did not:\n${res.stdout}`);
  assertEqual(readFileSync(join(work, SNAPSHOT_REL), 'utf8'), before, 'a no-op run rewrote the snapshot');
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(!branches.includes(DEFAULT_BRANCH), `a no-op run pushed ${DEFAULT_BRANCH}:\n${branches}`);
});

check('CLI_SNAPSHOT_REFRESH_LATEST_TAG answers the upstream question without asking', () => {
  // 🔴 The plumbing that makes the workflow resolve the release tag ONCE. The
  // scratch releases URL is a dead loopback port, so a run that still asked
  // would SKIP — reaching the up-to-date verdict here is itself the proof that
  // the pre-resolved answer was used, and reaching it as "up-to-date" rather
  // than "refresh" is the proof that it is CLASSIFIED, not obeyed.
  const { work, origin } = scratchRepo();
  const res = runScript(work, [], { CLI_SNAPSHOT_REFRESH_TAG: '', CLI_SNAPSHOT_REFRESH_LATEST_TAG: SNAP_TAG });
  assertEqual(res.status, 0, `exit ${res.status}\n${res.stdout}\n${res.stderr}`);
  assert(/Nothing to do/.test(res.stdout), `a pre-resolved matching tag did not decide up-to-date:\n${res.stdout}`);
  assert(!/skipping/.test(res.stdout), `the run still asked upstream:\n${res.stdout}`);
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(!branches.includes(DEFAULT_BRANCH), 'an up-to-date run pushed a branch');
});

check('--decide EMITS the verdict, and captures nothing', () => {
  // The workflow gates a Go toolchain and a full upstream build on this output
  // (F9), so a `--decide` that disagreed with the real run — or that did work
  // of its own — would either waste the build or, worse, skip a needed one.
  const { work, origin, root } = scratchRepo();
  const before = readFileSync(join(work, SNAPSHOT_REL), 'utf8');
  const outFile = join(root, 'gh-output');
  writeFileSync(outFile, '');
  const res = runScript(work, ['--decide'], {
    CLI_SNAPSHOT_REFRESH_TAG: '',
    CLI_SNAPSHOT_REFRESH_LATEST_TAG: NEWER,
    GITHUB_OUTPUT: outFile,
    // No binary at all: `--decide` must never reach the capture, and an unset
    // CIVITAI_CLI_BIN is what the real `decide` job runs with.
    CIVITAI_CLI_BIN: '',
  });
  assertEqual(res.status, 0, `exit ${res.status}\n${res.stdout}\n${res.stderr}`);
  const emitted = Object.fromEntries(
    readFileSync(outFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  assertEqual(emitted.action, 'refresh', `--decide emitted the wrong action: ${JSON.stringify(emitted)}`);
  assertEqual(emitted.tag, NEWER, `--decide emitted the wrong capture target: ${JSON.stringify(emitted)}`);
  assertEqual(emitted.latest, NEWER, `--decide did not pass the resolved release tag forward`);
  assertEqual(readFileSync(join(work, SNAPSHOT_REL), 'utf8'), before, '--decide rewrote the snapshot');
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(!branches.includes(DEFAULT_BRANCH), '--decide pushed a branch');
});

check('--decide emits an EMPTY tag when there is nothing to capture', () => {
  // The workflow's `if:` reads `action`, but the build job reads `tag` — a
  // non-empty tag on a no-op verdict is a build for a capture nobody asked for.
  const { work, root } = scratchRepo();
  const outFile = join(root, 'gh-output-2');
  writeFileSync(outFile, '');
  const res = runScript(work, ['--decide'], {
    CLI_SNAPSHOT_REFRESH_TAG: '',
    CLI_SNAPSHOT_REFRESH_LATEST_TAG: SNAP_TAG,
    GITHUB_OUTPUT: outFile,
  });
  assertEqual(res.status, 0, `exit ${res.status}\n${res.stdout}\n${res.stderr}`);
  const text = readFileSync(outFile, 'utf8');
  assert(/^action=up-to-date$/m.test(text), `wrong action:\n${text}`);
  assert(/^tag=$/m.test(text), `a no-op verdict named a capture target:\n${text}`);
});

check('DRIFT -> pushes the stable branch with ONE file changed, and prints the PR body', () => {
  const { work, origin, root } = scratchRepo();
  // Make the committed snapshot "old" by rewriting only its header, then hand
  // the script a fake binary that replays the REAL committed bundle at the
  // target tag. The capture therefore differs from the checked-in file by
  // exactly the header line, which is the smallest honest drift.
  const stale = committed.replace(/^Binary version: civitai .*$/m, `Binary version: civitai ${OLDER}`);
  writeFileSync(join(work, SNAPSHOT_REL), stale);
  execFileSync('git', ['-C', work, 'commit', '-am', 'stale'], {
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  execFileSync('git', ['-C', work, 'push', 'origin', DEFAULT_BASE], { stdio: 'ignore' });

  const bundlePath = join(root, 'bundle.txt');
  writeFileSync(bundlePath, committed);
  const bin = fakeCliBin(root, bundlePath, `civitai ${SNAP_RAW}`);

  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG });
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
  assert(onBranch.includes(`Binary version: civitai ${SNAP_RAW}\n`), 'the branch carries the stale header');
  assertEqual(countSnapshotBlocks(onBranch), countSnapshotBlocks(committed), 'the branch carries a short capture');

  assert(/did NOT run/.test(res.stdout), `the printed PR body lacks the zero-checks disclosure:\n${res.stdout}`);
  assert(res.stdout.includes(prTitle(SNAP_TAG)), 'the printed title is not the one the PR would carry');
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
  const bin = fakeCliBin(root, bundlePath, `civitai ${SNAP_RAW}`);

  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG });
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
  const bin = fakeCliBin(root, bundlePath, `civitai ${SNAP_RAW}`);
  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG });
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
  const stale = committed.replace(/^Binary version: civitai .*$/m, `Binary version: civitai ${OLDER}`);
  writeFileSync(join(work, SNAPSHOT_REL), stale);
  const gitEnv = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  execFileSync('git', ['-C', work, 'commit', '-am', 'stale'], { stdio: 'ignore', env: { ...process.env, ...gitEnv } });
  execFileSync('git', ['-C', work, 'push', 'origin', DEFAULT_BASE], { stdio: 'ignore' });
  const bundlePath = join(root, 'bundle.txt');
  writeFileSync(bundlePath, committed);
  const bin = fakeCliBin(root, bundlePath, `civitai ${SNAP_RAW}`);

  for (const run of [1, 2]) {
    // Run 2 starts from the branch run 1 left checked out, which is the shape
    // a second CI run does NOT have — reset to base first so each run is a
    // fresh checkout of `main`, as actions/checkout would give it.
    execFileSync('git', ['-C', work, 'checkout', '-f', DEFAULT_BASE], { stdio: 'ignore' });
    const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG });
    assertEqual(res.status, 0, `run ${run} exited ${res.status}\n${res.stdout}\n${res.stderr}`);
  }
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.replace(/^\*?\s*/, ''))
    .filter(Boolean);
  assertEqual(branches.length, 2, `two runs left ${branches.length} branches on the remote: ${branches.join(', ')}`);
  assert(branches.includes(DEFAULT_BRANCH), `the stable branch is missing: ${branches.join(', ')}`);
});

/**
 * The scratch repo, wound forward to the state a real drift run meets: `main`
 * carries a STALE snapshot header, and a fake `civitai` replays the committed
 * bundle at the target tag. Three tests need exactly this, and building it by
 * hand three times is how the three quietly stop describing the same scenario.
 */
function driftRepo() {
  const { work, origin, root } = scratchRepo();
  const stale = committed.replace(/^Binary version: civitai .*$/m, `Binary version: civitai ${OLDER}`);
  writeFileSync(join(work, SNAPSHOT_REL), stale);
  execFileSync('git', ['-C', work, 'commit', '-am', 'stale'], { stdio: 'ignore', env: { ...process.env, ...GIT_IDENT } });
  execFileSync('git', ['-C', work, 'push', 'origin', DEFAULT_BASE], { stdio: 'ignore' });
  const bundlePath = join(root, 'bundle.txt');
  writeFileSync(bundlePath, committed);
  return { work, origin, root, bin: fakeCliBin(root, bundlePath, `civitai ${SNAP_RAW}`) };
}

/** `git -C <dir> …` with a deterministic identity, returning trimmed stdout. */
function g(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...GIT_IDENT } }).trim();
}

check('A HUMAN COMMIT ON THE BOT BRANCH SURVIVES THE NEXT RUN', () => {
  // 🔴 THE FORCE-PUSH DESTROYED IT. The branch is a shared, long-lived ref that
  // the tool's OWN generated PR body instructs a reviewer to push to:
  //
  //     git commit --allow-empty -m "chore: trigger checks" && git push
  //
  // — the documented remedy for the zero-checks trap. Re-creating the branch
  // from a fresh `main` and force-pushing it deleted that commit on the next
  // cron tick, so the reviewer's checks vanished with it and the advice in the
  // body was advice to do something the bot would undo within a day. Anything
  // else pushed there by a human (a fixup to the capture, a review commit) went
  // the same way, silently — a force-push reports success.
  //
  // The property asserted is the PROPERTY, not the mechanism: whatever the
  // script does with the branch, a commit it did not make must still be
  // reachable from the remote ref afterwards.
  const { work, origin, bin } = driftRepo();

  const run1 = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG });
  assertEqual(run1.status, 0, `run 1 exited ${run1.status}\n${run1.stdout}\n${run1.stderr}`);

  // A human does exactly what the generated PR body tells them to do.
  g(work, ['fetch', 'origin', DEFAULT_BRANCH]);
  g(work, ['checkout', '-B', 'human-work', 'FETCH_HEAD']);
  g(work, ['commit', '--allow-empty', '-m', 'chore: trigger checks']);
  const humanSha = g(work, ['rev-parse', 'HEAD']);
  g(work, ['push', 'origin', `human-work:${DEFAULT_BRANCH}`]);
  // Positive control on the fixture: the commit really is on the remote branch
  // BEFORE the second run, or "it survived" would be satisfied by a test that
  // never put it there.
  g(origin, ['merge-base', '--is-ancestor', humanSha, DEFAULT_BRANCH]);

  // Run 2, from a fresh checkout of `main` — what actions/checkout hands the
  // next cron tick.
  g(work, ['checkout', '-f', DEFAULT_BASE]);
  const run2 = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG });
  assertEqual(run2.status, 0, `run 2 exited ${run2.status}\n${run2.stdout}\n${run2.stderr}`);

  const survived = spawnSync('git', ['-C', origin, 'merge-base', '--is-ancestor', humanSha, DEFAULT_BRANCH]);
  assertEqual(
    survived.status,
    0,
    `the human commit ${humanSha.slice(0, 8)} is NO LONGER reachable from ${DEFAULT_BRANCH} — the run destroyed it`,
  );

  // …and the branch still carries the capture, so "never destroy anything" was
  // not bought by refusing to do the job.
  const onBranch = execFileSync('git', ['-C', origin, 'show', `${DEFAULT_BRANCH}:${SNAPSHOT_REL}`], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert(onBranch.includes(`Binary version: civitai ${SNAP_RAW}\n`), 'the branch no longer carries the fresh capture');
});

check('a capture identical to the committed snapshot opens NO PR', () => {
  const { work, origin, root } = scratchRepo();
  const bundlePath = join(root, 'same.txt');
  writeFileSync(bundlePath, committed);
  const bin = fakeCliBin(root, bundlePath, `civitai ${SNAP_RAW}`);
  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG });
  assertEqual(res.status, 0, `exit ${res.status}\n${res.stdout}\n${res.stderr}`);
  assert(/byte-identical/.test(res.stdout), `the run did not report the no-op:\n${res.stdout}`);
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(!branches.includes(DEFAULT_BRANCH), 'an identical capture still pushed a branch');
});

check('THE HERMETIC REBUILD ACTUALLY RUNS on the bytes about to be committed', () => {
  // 🔴 THE SINGLE SURVIVOR OF A 14-MUTANT SEMANTIC SWEEP. `verifyHermeticBuild()`
  // could be commented out and the ENTIRE suite stayed green — the strongest
  // check in the script was the one nothing observed. It has no return value and
  // no side effect on the snapshot, so the only observable is the generator's
  // own source line, and the two invocations report DIFFERENT sources:
  //
  //   live capture      -> `from civitai binary (…)`
  //   hermetic rebuild  -> `from snapshot: …`
  //
  // The live run can never emit `from snapshot:`, so requiring it is a claim
  // about the second invocation specifically rather than about "the generator
  // ran at all".
  const { work, bin } = driftRepo();
  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG });
  const out = `${res.stdout}\n${res.stderr}`;
  assertEqual(res.status, 0, `exit ${res.status}\n${out}`);
  // Positive control: the LIVE capture ran too, so "the generator ran" cannot be
  // satisfied by the hermetic pass alone and vice versa.
  assert(/from civitai binary \(/.test(out), `the live capture never ran — this fixture proves nothing:\n${out}`);
  assert(
    /from snapshot: /.test(out),
    `the hermetic rebuild never ran: the committed bytes were never re-derived on the codepath CI takes.\n${out}`,
  );
});

check('AN UNREADABLE REMOTE IS NOT AN ABSENT BRANCH — the run refuses rather than guessing', () => {
  // 🔴 THE FAILURE MODE THE `ls-remote` SPELLING EXISTS FOR, and a SURVIVING
  // mutant until this case was written. `git fetch` exits non-zero for a missing
  // ref AND for an unreachable remote, an auth failure, a proxy — and reading
  // the second as the first is how a run decides the branch is new and recreates
  // it over whatever is there. `ls-remote --exit-code` separates them: measured,
  // an ABSENT ref exits 2 and a BROKEN remote exits 128.
  //
  // The observable is not "the run failed" — treating the branch as absent also
  // fails, at the push. It is WHERE it fails: refusing happens before any local
  // branch exists and before the checkout has moved.
  const { work, root, bin } = driftRepo();
  execFileSync('git', ['-C', work, 'remote', 'set-url', 'origin', join(root, 'no-such-remote.git')], { stdio: 'ignore' });
  // Premise: git really does report this as something other than an absent ref.
  const probe = spawnSync('git', ['-C', work, 'ls-remote', '--exit-code', 'origin', 'refs/heads/whatever'], {
    encoding: 'utf8',
  });
  assert(probe.status !== 2 && probe.status !== 0, `this fixture is not an unreadable remote (rc ${probe.status})`);

  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG });
  const out = `${res.stdout}\n${res.stderr}`;
  assert(res.status !== 0, `an unreadable remote exited 0:\n${out}`);
  assert(/could not read origin\//.test(out), `the run did not refuse on the unreadable remote:\n${out}`);
  // 🔴 The kill: treating it as absent gets as far as creating the branch and
  // committing before the push fails.
  const local = execFileSync('git', ['-C', work, 'branch', '--list'], { encoding: 'utf8' });
  assert(!local.includes(DEFAULT_BRANCH), `the run created ${DEFAULT_BRANCH} before discovering it could not ask:\n${local}`);
  assertEqual(
    execFileSync('git', ['-C', work, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(),
    DEFAULT_BASE,
    'the run moved the checkout onto the bot branch before it knew the remote state',
  );
});

check('the push carries no --force (defence in depth, and a WEAKER guard than the one above)', () => {
  // 🔴 LABELLED AS THE WEAK GUARD IT IS, so nobody counts it as the coverage.
  // The behavioural test — "A HUMAN COMMIT ON THE BOT BRANCH SURVIVES THE NEXT
  // RUN" — is the real one, and it kills the mutation that caused the bug
  // (recreating the branch from `main`). It does NOT kill `--force` on its own:
  // once the run builds on top of the fetched tip the push is a fast-forward, so
  // the flag is inert in every state this suite can construct. It remains a live
  // hazard in a state the suite CANNOT construct — a concurrent push landing
  // between our fetch and our push, which `--force` would silently discard and a
  // plain push correctly rejects. Nothing observable distinguishes those locally,
  // so this reads the source: a spelled guard, which is what is available rather
  // than what is wanted.
  const src = readFileSync(join(repoRoot, 'scripts', 'refresh-cli-snapshot.mjs'), 'utf8');
  const pushes = src
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .filter((l) => /git\(\[\s*'push'/.test(l));
  assert(pushes.length > 0, 'no push call found — this guard is wired to nothing');
  for (const p of pushes) assert(!/--force/.test(p), `the push force-updates the shared branch: ${p.trim()}`);
});

/**
 * A `gh` stand-in on PATH that always fails with a chosen stderr. The script
 * resolves `gh` through PATH, so this is the seam that lets the post-push
 * failure paths be driven for real.
 */
function fakeGh(dir, stderrText) {
  const binDir = join(dir, 'fakebin');
  mkdirSync(binDir, { recursive: true });
  const gh = join(binDir, 'gh');
  writeFileSync(gh, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(stderrText)} >&2\nexit 1\n`, { mode: 0o755 });
  return binDir;
}

check('A POST-PUSH `gh` FAILURE PRINTS THE COMPARE URL — at the CALL SITE, not just in the helper', () => {
  // 🔴 A UNIT TEST OF `branchPushedAdvice` CANNOT SEE THIS. The helper can be
  // perfect and never called; that is exactly the shape the previous round
  // shipped, where only `prCreationBlocked` reached advice and every other
  // post-push failure exited with a stack trace. So drive the REAL script with
  // a `gh` that fails, and read what the operator is left holding.
  //
  // The failure lands on `gh pr list` — the FIRST gh call, and the one that used
  // to sit outside the try entirely.
  const { work, origin, root, bin } = driftRepo();
  const binDir = fakeGh(root, 'HTTP 502 Bad Gateway');
  const res = runScript(work, [], {
    CIVITAI_CLI_BIN: bin,
    CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG,
    PATH: `${binDir}:${process.env.PATH}`,
    GITHUB_REPOSITORY: 'o/r',
  });
  const err = res.stderr;
  assert(res.status !== 0, `a failed PR step exited 0:\n${res.stdout}\n${err}`);
  // Premise: the run really did get past the push, or this proves nothing about
  // the POST-push state.
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(branches.includes(DEFAULT_BRANCH), `the run never pushed — this row tests the wrong thing:\n${res.stdout}`);
  assert(
    err.includes(`https://github.com/o/r/compare/${DEFAULT_BASE}...${DEFAULT_BRANCH}?expand=1`),
    `no compare URL after a post-push failure — the operator is told nothing:\n${err}`,
  );
  assert(/BRANCH IS PUSHED BUT NO PR/.test(err), `the run does not name the state it left behind:\n${err}`);
  // …and it must NOT assert the repo-setting diagnosis for an unrelated failure.
  assert(
    !/Allow GitHub Actions to create and approve/.test(err),
    `a 502 was reported as the repo-setting refusal:\n${err}`,
  );
});

check('the BLOCKED-SETTING failure gets BOTH the state and the diagnosis', () => {
  // The specific advice is an ADDITION to the generic one, never a replacement —
  // measured against the real message text `gh` printed on a live run.
  const { work, root, bin } = driftRepo();
  const binDir = fakeGh(
    root,
    'pull request create failed: GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)',
  );
  const res = runScript(work, [], {
    CIVITAI_CLI_BIN: bin,
    CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG,
    PATH: `${binDir}:${process.env.PATH}`,
    GITHUB_REPOSITORY: 'o/r',
  });
  const err = res.stderr;
  assert(res.status !== 0, 'the blocked-setting failure exited 0');
  assert(/BRANCH IS PUSHED BUT NO PR/.test(err), `the generic state report is missing:\n${err}`);
  assert(/Allow GitHub Actions to create and approve/.test(err), `the specific diagnosis is missing:\n${err}`);
  assert(/can_approve_pull_request_reviews=true/.test(err), `the API equivalent is missing:\n${err}`);
});

check('OUTSIDE CI the pushing path REFUSES, before touching anything', () => {
  // F13: this was listed in the README's repair table beside a dozen read-only
  // `check:*` scripts, and it is not that shape — it pushes a shared branch and
  // moves the caller's HEAD onto it. A developer following the table would
  // discover that afterwards.
  const { work, origin, bin } = driftRepo();
  const before = readFileSync(join(work, SNAPSHOT_REL), 'utf8');
  const res = runScript(work, [], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG, CI: '' });
  assert(res.status !== 0, `a local run pushed instead of refusing:\n${res.stdout}\n${res.stderr}`);
  assert(/this command PUSHES/.test(res.stderr), `the refusal does not say why:\n${res.stderr}`);
  assert(/--dry-run/.test(res.stderr), 'the refusal does not name the safe alternative');
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(!branches.includes(DEFAULT_BRANCH), 'the refusal came AFTER the push');
  assertEqual(readFileSync(join(work, SNAPSHOT_REL), 'utf8'), before, 'the refusal left a capture in the tree');
  // The head is where it started: refusing must not be the thing that moves it.
  assertEqual(
    execFileSync('git', ['-C', work, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(),
    DEFAULT_BASE,
    'the refusal moved the checkout off its branch',
  );
});

check('--dry-run and --decide are NOT blocked outside CI — they write nothing', () => {
  // The guard must not eat the two modes a human is actually told to run. A
  // refusal that covered them would push people to `--allow-local-push`, which
  // is the opposite of the point.
  const { work, bin } = driftRepo();
  const dry = runScript(work, ['--dry-run'], { CIVITAI_CLI_BIN: bin, CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG, CI: '' });
  assertEqual(dry.status, 0, `--dry-run was refused outside CI:\n${dry.stdout}\n${dry.stderr}`);
  assert(/tree restored, no git writes/.test(dry.stdout), `--dry-run did not reach its own report:\n${dry.stdout}`);
  const dec = runScript(work, ['--decide'], { CLI_SNAPSHOT_REFRESH_TAG: '', CLI_SNAPSHOT_REFRESH_LATEST_TAG: SNAP_TAG, CI: '' });
  assertEqual(dec.status, 0, `--decide was refused outside CI:\n${dec.stdout}\n${dec.stderr}`);
});

check('--allow-local-push is a real escape hatch, not a message', () => {
  // A documented override that does not work is worse than none: it sends the
  // one person who needed it into the code to find out why.
  const { work, origin, bin } = driftRepo();
  const res = runScript(work, ['--no-pr', '--allow-local-push'], {
    CIVITAI_CLI_BIN: bin,
    CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG,
    CI: '',
  });
  assertEqual(res.status, 0, `the override did not work:\n${res.stdout}\n${res.stderr}`);
  const branches = execFileSync('git', ['-C', origin, 'branch', '--list'], { encoding: 'utf8' });
  assert(branches.includes(DEFAULT_BRANCH), 'the override did not push');
});

check('a refresh with no CIVITAI_CLI_BIN fails rather than letting the generator find one on PATH', () => {
  // The recorded failure: gen-appblocks-cli.mjs prefers a live `civitai` on
  // PATH, so an unset CIVITAI_CLI_BIN silently captures from whatever happens
  // to be installed. On a runner that is nothing; on a developer box it is a
  // short capture. Refusing is the only safe answer.
  const { work } = scratchRepo();
  const res = runScript(work, ['--no-pr'], { CIVITAI_CLI_BIN: '', CLI_SNAPSHOT_REFRESH_TAG: SNAP_TAG });
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
  const start = yml.indexOf('\non:') + 1;
  assert(start > 0, 'no top-level `on:` key');
  // 🔴 Ends at the NEXT top-level key, whatever it is. It used to be hardcoded
  // to `\npermissions:`; adding `concurrency:` between the two silently widened
  // every trigger assertion to cover a block that is not the triggers.
  const rest = yml.slice(start + 3);
  const nextKey = rest.search(/\n[a-z][a-z-]*:/);
  const on = nextKey === -1 ? yml.slice(start) : yml.slice(start, start + 3 + nextKey);
  assert(on.startsWith('on:'), 'could not isolate the trigger block');
  assert(!/^concurrency:/m.test(on), 'the trigger block swallowed a later top-level key');
  return on;
}

/**
 * Every job in a workflow, as `{ name: body }`, split on top-level (2-space)
 * job keys. Crude, and deliberately so — a YAML parser is a new dependency
 * ("ask first" in AGENTS.md) for a file whose shape this repo controls.
 */
function jobsOf(ymlPath) {
  const yml = readFileSync(ymlPath, 'utf8');
  const jobsAt = yml.indexOf('\njobs:');
  assert(jobsAt > 0, `no jobs: block in ${ymlPath}`);
  const body = yml.slice(jobsAt);
  const marks = [...body.matchAll(/^ {2}([a-z0-9][a-z0-9-]*):$/gm)];
  assert(marks.length > 0, `no jobs found in ${ymlPath}`);
  const out = {};
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : body.length;
    out[m[1]] = body.slice(m.index, end);
  });
  return out;
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

check('EXACTLY ONE job holds write, and it is not the one that runs upstream code', () => {
  // 🔴 THE SECURITY BOUNDARY, ASSERTED PER JOB RATHER THAN OVER THE WHOLE
  // `jobs:` TEXT. The check above searches the entire jobs block, so it is
  // satisfied by write appearing ANYWHERE in it — including on the job that
  // clones civitai/cli at a MUTABLE tag and executes its Makefile. That is the
  // arrangement this split exists to end: with write scopes and
  // actions/checkout's default `persist-credentials: true`, anyone able to move
  // a tag upstream had write on this repo.
  const jobs = jobsOf(WORKFLOW);
  const writers = Object.entries(jobs).filter(([, body]) => /^\s+(contents|pull-requests):\s*write$/m.test(body));
  assertEqual(writers.length, 1, `${writers.length} jobs hold write: ${writers.map(([n]) => n).join(', ')}`);
  const [writerName, writerBody] = writers[0];

  // The writer must not be the job that builds upstream code. Identify that job
  // STRUCTURALLY — it is whichever one clones civitai/cli — never by name, or a
  // rename moves the hazard past this guard.
  const upstream = Object.entries(jobs).filter(([, body]) => /git clone .*github\.com\/civitai\/cli/.test(body));
  assertEqual(upstream.length, 1, `expected exactly one job to build upstream, found ${upstream.length}`);
  assert(upstream[0][0] !== writerName, `the job that builds civitai/cli ("${writerName}") also holds write scopes`);

  // Positive control: the upstream job must declare read explicitly rather than
  // inherit it, so a later edit to the file-level default cannot silently
  // elevate it.
  assert(
    /^\s+permissions:\n\s+contents: read$/m.test(upstream[0][1]),
    `the upstream-build job does not pin \`contents: read\`:\n${upstream[0][1]}`,
  );
  // …and it must not check THIS repository out, because that is what writes a
  // credential into a .git/config the upstream Makefile can read.
  assert(
    !/uses: actions\/checkout/.test(upstream[0][1]),
    'the upstream-build job checks this repository out — that re-exposes the token to code it does not own',
  );
  assert(/pull-requests:\s*write/.test(writerBody), 'the writer job cannot open a PR');
});

check('the expensive jobs are GATED on the freshness decision', () => {
  // F9: the Go toolchain and a full upstream build used to run unconditionally,
  // including on the ~364 days a year the answer is "nothing to do" — the
  // decision was not made until the final step. Both costly jobs must be
  // conditional on the cheap one's verdict.
  const jobs = jobsOf(WORKFLOW);
  const deciders = Object.entries(jobs).filter(([, b]) => /--decide/.test(b));
  assertEqual(deciders.length, 1, 'expected exactly one job to compute the verdict');
  const decideName = deciders[0][0];
  assert(
    !/^\s+if:/m.test(deciders[0][1]),
    'the decide job is itself gated — nothing would ever compute the verdict',
  );
  for (const [name, body] of Object.entries(jobs)) {
    if (name === decideName) continue;
    assert(
      new RegExp(`^\\s+if: needs\\.${decideName}\\.outputs\\.action == 'refresh'$`, 'm').test(body),
      `job "${name}" runs regardless of the verdict — it pays for a build on a no-op day:\n${body}`,
    );
  }
});

check('the workflow serialises itself — a cron tick and a dispatch cannot race', () => {
  // F6: both runs pass `gh pr list --state open` before either creates
  // anything, then collide on `gh pr create`. The loser's "already exists" is
  // not the blocked-setting message, so it exited with the branch pushed and
  // nobody told.
  const yml = readFileSync(WORKFLOW, 'utf8');
  const runnable = yml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert(/^concurrency:$/m.test(runnable), 'the workflow declares no concurrency group');
  assert(/^\s+group: \S+/m.test(runnable), 'the concurrency block names no group');
  // 🔴 `cancel-in-progress: true` would be WORSE than no group at all: it would
  // kill a run that has already pushed the branch, which is precisely the
  // "pushed, nobody told" state.
  assert(
    /^\s+cancel-in-progress: false$/m.test(runnable),
    'cancel-in-progress must be false — cancelling a run mid-push strands the branch',
  );
});

check('NO `${{ }}` EXPANSION REACHES A `run:` SCRIPT — values ride in env:', () => {
  // F4: a `${{ … }}` expansion is substituted into the script TEXT before bash
  // sees it, so an attacker-controllable value becomes CODE. The tag came from
  // a `curl` of a third-party API and was interpolated into three `run:` lines.
  // Reading the runnable lines only, because the header discusses the pattern.
  const yml = readFileSync(WORKFLOW, 'utf8');
  const lines = yml.split('\n');
  const offenders = [];
  let inRun = false;
  let runIndent = 0;
  for (const line of lines) {
    if (/^\s*#/.test(line)) continue;
    const m = /^(\s*)(- )?run: \|/.exec(line);
    if (m) {
      inRun = true;
      runIndent = m[1].length;
      continue;
    }
    if (inRun) {
      const indent = line.search(/\S/);
      if (line.trim() !== '' && indent <= runIndent) inRun = false;
    }
    const single = /^\s*(- )?run: (?!\|).*\$\{\{/.test(line);
    if ((inRun && line.includes('${{')) || single) offenders.push(line.trim());
  }
  assertEqual(offenders.length, 0, `shell scripts interpolate workflow expressions:\n  ${offenders.join('\n  ')}`);
});

check('the tag is resolved ONCE, and never by an unauthenticated curl', () => {
  // F8: the tag was resolved twice — a `curl` in the workflow and the script's
  // own fetch — which can disagree if a release publishes in between, surfacing
  // as a `WRONG BINARY` refusal that blames the capture for a race. That `curl`
  // also carried no credential under `set -euo pipefail`, so a shared-runner
  // rate limit (60/hr) killed the job before the script — whose contract is
  // "a connectivity failure must never fail the job" — ever ran.
  const yml = readFileSync(WORKFLOW, 'utf8');
  const runnable = yml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert(!/curl/.test(runnable), 'the workflow resolves the release tag itself — the script already does, with auth');
  assert(
    /CLI_SNAPSHOT_REFRESH_LATEST_TAG:/.test(runnable),
    'the resolved tag is not passed forward — the capture job would ask upstream a second time',
  );
});

check('THE TEST SUITE IS ACTUALLY WIRED INTO A PR WORKFLOW', () => {
  // 🔴 THE FINDING THAT MADE EVERY OTHER GUARD IN THIS FILE INERT. There is no
  // aggregate `npm test` in this repo, so a `test:*` script with no workflow is
  // a script nothing runs — and this 600-line suite had none. Three workflow
  // mutations it kills (a job gaining `id-token: write`, the file-level default
  // flipped to write, a `pull_request:` trigger on the refresher) would all have
  // merged green.
  //
  // Asserted over the workflow DIRECTORY rather than a filename, so moving the
  // job into an existing workflow is fine and DELETING it is not.
  const dir = join(repoRoot, '.github', 'workflows');
  const wired = readdirSync(dir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ f, yml: readFileSync(join(dir, f), 'utf8') }))
    .filter(({ yml }) =>
      yml
        .split('\n')
        .filter((l) => !/^\s*#/.test(l))
        .some((l) => l.includes('test:refresh-cli-snapshot')),
    );
  assert(wired.length > 0, 'NO workflow runs `npm run test:refresh-cli-snapshot` — this entire suite is inert in CI');
  // And it must run on PULL REQUESTS. A suite wired only to a schedule reports
  // a regression up to a day AFTER it merges, on a workflow nobody watches —
  // the same failure this whole feature exists to fix, one level up.
  const onPr = wired.filter(({ yml }) => /^on:\n(?:.*\n)*?\s{2}pull_request/m.test(yml));
  assert(
    onPr.length > 0,
    `\`test:refresh-cli-snapshot\` runs only outside pull_request (${wired.map((w) => w.f).join(', ')})`,
  );
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
// 🔴 A COUNT FLOOR. Every assertion above is inside a `check(...)` callback, so
// a suite that never RUNS them — an early return, a rename that orphans a
// section, a botched merge — prints a serene "all passed" over zero work. The
// floor is the positive control on the harness itself: it must have executed at
// least as many checks as it did when this line was written.
const MIN_CHECKS = 56;
if (executed < MIN_CHECKS) {
  console.error(
    `refresh-cli-snapshot tests: only ${executed} checks RAN, expected at least ${MIN_CHECKS} — ` +
      'the suite is reporting on work it did not do.',
  );
  process.exit(1);
}
if (failures) {
  console.error(`refresh-cli-snapshot tests: ${failures} FAILED of ${executed}`);
  process.exit(1);
}
console.log(`refresh-cli-snapshot tests: all ${executed} passed`);
