#!/usr/bin/env node
// Regression tests for scripts/check-appblocks-cli-snapshot.mjs — the CLI
// snapshot CONTENT guard.
//
//   node scripts/test-check-cli-snapshot.mjs
//
// WHY THIS EXISTS: docs#101 replaced that guard's verdict. It used to compare
// the snapshot header's `git describe` TAG against the latest civitai/cli
// release — a predicate that verdicted `ok` straight through docs#56, where the
// committed snapshot served `2.0 MB` in 10 places where the CLI says `MiB`. The
// verdict is now a BYTE comparison against a fresh capture from the release
// binary.
//
// A guard that replaced a green-through-failure predicate has exactly one thing
// worth testing: that it can still go RED, and that it cannot go GREEN by
// accident. So the two properties pinned hardest here are:
//
//   - THE TAG NO LONGER SHORT-CIRCUITS TO A PASS. The end-to-end check below
//     serves a fixture release whose tag MATCHES the committed snapshot's — the
//     exact input the old guard exited 0 on — and asserts the script exits
//     NON-ZERO because it went on to attempt the content comparison. That is
//     docs#101's closing condition 1, as a test rather than a claim.
//   - A ZERO IS NOT A PASS. `describeContentDrift` reports `comparable: false`
//     whenever either side has zero bytes or zero `===CMD` blocks, and main()
//     refuses on it before reading `identical`. Two empty buffers ARE identical;
//     a comparison wired to nothing would otherwise report success forever.
//
// The block-count assertions deliberately use fixtures whose counts are
// PAIRWISE DISTINCT and distinct from the committed snapshot's 116, so a mutant
// that hardcodes any one of those numbers cannot survive.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifySnapshot,
  countCommandBlocks,
  describeContentDrift,
  isPlainVersionTag,
  parseChecksums,
  parseSnapshotVersion,
  releaseAssetName,
} from './check-appblocks-cli-snapshot.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const CHECKER = join(__dirname, 'check-appblocks-cli-snapshot.mjs');
const SNAPSHOT = join(repoRoot, 'appblocks-snapshots', 'civitai-cli-help.txt');

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
async function checkAsync(name, fn) {
  executed++;
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const bundle = (n, body = 'x') =>
  ['header', 'Binary version: civitai 0.1.108']
    .concat(Array.from({ length: n }, (_, i) => `===CMD c${i}===\n${body}`))
    .join('\n') + '\n';

console.log('\ncheck-appblocks-cli-snapshot — header parsing\n');

check('parses a goreleaser RELEASE-ASSET header (bare version, no leading v)', () => {
  const p = parseSnapshotVersion('Binary version: civitai 0.1.108\n');
  assert(p.ok, `expected ok, got ${JSON.stringify(p)}`);
  eq(p.tag, '0.1.108', 'tag');
  eq(p.ahead, 0, 'ahead');
  eq(p.sha, null, 'sha');
});

check('parses a `make build` / git-describe header (leading v, commits ahead)', () => {
  // The two header shapes are BOTH live and both correct — a release asset
  // stamps `0.1.108`, a local `make build` stamps `v0.1.90-13-g569f5dc`. This
  // is the pair that stops anyone "fixing" the `v?` out of the regex.
  const p = parseSnapshotVersion('Binary version: civitai v0.1.90-13-g569f5dc\n');
  assert(p.ok, `expected ok, got ${JSON.stringify(p)}`);
  eq(p.tag, 'v0.1.90', 'tag');
  eq(p.ahead, 13, 'ahead');
  eq(p.sha, '569f5dc', 'sha');
});

check('refuses a header with no Binary version line', () => {
  const p = parseSnapshotVersion('civitai CLI help snapshot\n===CMD (root)===\n');
  assert(!p.ok, 'expected a refusal');
  assert(/Binary version/.test(p.reason), `reason should name the missing line: ${p.reason}`);
});

check('refuses an unparseable version token', () => {
  const p = parseSnapshotVersion('Binary version: civitai dev\n');
  assert(!p.ok, 'expected a refusal');
  assert(/unparseable/.test(p.reason), `reason: ${p.reason}`);
});

check('the committed snapshot parses, and its tag is one of the two live shapes', () => {
  const p = parseSnapshotVersion(readFileSync(SNAPSHOT, 'utf8'));
  assert(p.ok, `the committed snapshot header does not parse: ${p.reason}`);
  assert(/^v?\d+\.\d+\.\d+/.test(p.tag), `unexpected tag shape ${p.tag}`);
});

console.log('\ncheck-appblocks-cli-snapshot — classifySnapshot (message text only, NOT the verdict)\n');

check('classifySnapshot still orders tags in both directions and at equality', () => {
  // Still exported, still correct, still USED — by scripts/refresh-cli-snapshot.mjs's
  // tag-based `--decide`, and here only to build the "tag context" line. Its
  // answer no longer reaches process.exit; see the end-to-end check below.
  eq(classifySnapshot('0.1.104', 'v0.1.108').status, 'stale', 'behind');
  eq(classifySnapshot('v0.1.108', '0.1.108').status, 'ok', 'equal across the v/bare split');
  eq(classifySnapshot('v0.1.200', 'v0.1.108').status, 'ahead', 'ahead');
});

console.log('\ncheck-appblocks-cli-snapshot — the CONTENT verdict\n');

check('countCommandBlocks counts ===CMD delimiters, and the count MOVES with the input', () => {
  // Distinct, non-round counts on purpose: a mutant returning any fixed number
  // cannot satisfy all three.
  eq(countCommandBlocks(bundle(0)), 0, '0 blocks');
  eq(countCommandBlocks(bundle(3)), 3, '3 blocks');
  eq(countCommandBlocks(bundle(37)), 37, '37 blocks');
  // Not a delimiter: the marker must be the whole line.
  eq(countCommandBlocks('prefix ===CMD app===\n'), 0, 'mid-line marker is not a block');
});

check('the committed snapshot carries a non-zero, plural block count', () => {
  // The positive control the guard prints on a pass, asserted here too: if this
  // is ever 0, every "CONTENT MATCHES" line the guard emits is meaningless.
  const n = countCommandBlocks(readFileSync(SNAPSHOT, 'utf8'));
  assert(n > 1, `the committed snapshot reports ${n} ===CMD blocks — a comparison over it would prove nothing`);
});

check('identical bytes -> identical, comparable, with both counts reported', () => {
  const b = bundle(5);
  const d = describeContentDrift(b, b);
  assert(d.identical, 'expected identical');
  assert(d.comparable, 'expected comparable');
  eq(d.committedBlocks, 5, 'committedBlocks');
  eq(d.freshBlocks, 5, 'freshBlocks');
  eq(d.committedBytes, Buffer.byteLength(b), 'committedBytes');
  eq(d.changedLines, 0, 'changedLines');
});

check('one changed line -> NOT identical, located, and sampled', () => {
  const a = bundle(4, 'at most 4.0 MiB');
  const f = a.replace('at most 4.0 MiB', 'at most 4.0 MB');
  assert(a !== f, 'fixture did not actually mutate');
  const d = describeContentDrift(f, a); // committed = mutated, fresh = release
  assert(!d.identical, 'expected a difference');
  assert(d.comparable, 'expected comparable');
  eq(d.changedLines, 1, 'changedLines');
  assert(d.firstDiffLine > 0, 'firstDiffLine should be a 1-based line number');
  eq(d.sample.length, 1, 'sample length');
  assert(/4\.0 MB/.test(d.sample[0].committed), 'sample must show the committed line');
  assert(/4\.0 MiB/.test(d.sample[0].fresh), 'sample must show the release line');
});

check('byte-level (non-line) drift is caught too', () => {
  // A trailing-newline change moves no LINE content but changes the bytes. The
  // verdict is Buffer.equals, so it must still be a difference.
  const a = bundle(3);
  const d = describeContentDrift(a, a + '\n');
  assert(!d.identical, 'a trailing byte difference must not read as identical');
});

check('the sample is capped but the total is still reported in full', () => {
  const a = bundle(20, 'same');
  const f = bundle(20, 'different');
  const d = describeContentDrift(a, f);
  eq(d.sample.length, 6, 'sample cap');
  assert(d.changedLines > 6, `changedLines (${d.changedLines}) should exceed the sample cap`);
});

check('a shorter side is reported as absent, not as an empty match', () => {
  const a = bundle(4);
  const d = describeContentDrift(a, a + 'extra tail line\n');
  assert(!d.identical, 'expected a difference');
  const tail = d.sample.find((s) => /absent/.test(s.committed));
  assert(tail, `expected an "<absent …>" marker in the sample: ${JSON.stringify(d.sample)}`);
});

console.log('\ncheck-appblocks-cli-snapshot — a zero is not a pass\n');

check('two EMPTY inputs are identical but NOT comparable', () => {
  // 🔴 The whole reason `comparable` exists. `identical` alone is true here.
  const d = describeContentDrift('', '');
  assert(d.identical, 'two empty buffers genuinely are byte-identical');
  assert(!d.comparable, 'but a comparison over zero bytes must never be readable as a pass');
});

check('a block-less but non-empty snapshot is NOT comparable', () => {
  // The header-only truncation: parses as a valid header, carries no commands.
  const headerOnly = 'civitai CLI help snapshot\nBinary version: civitai 0.1.108\n';
  const d = describeContentDrift(headerOnly, bundle(9));
  assert(!d.comparable, 'zero ===CMD blocks on the committed side must not be comparable');
  eq(d.committedBlocks, 0, 'committedBlocks');
  eq(d.freshBlocks, 9, 'freshBlocks');
});

check('a block-less CAPTURE is NOT comparable either (both directions)', () => {
  const d = describeContentDrift(bundle(9), 'civitai CLI help snapshot\n');
  assert(!d.comparable, 'zero ===CMD blocks on the capture side must not be comparable');
});

console.log('\ncheck-appblocks-cli-snapshot — release asset resolution\n');

check('releaseAssetName matches the v0.1.108 asset list, on more than one platform', () => {
  // Measured against `gh release view v0.1.108 --repo civitai/cli --json assets`.
  eq(releaseAssetName('v0.1.108', 'linux', 'x64'), 'civitai_0.1.108_linux_amd64', 'linux/amd64');
  eq(releaseAssetName('0.1.108', 'linux', 'arm64'), 'civitai_0.1.108_linux_arm64', 'bare tag, linux/arm64');
  eq(releaseAssetName('v0.1.108', 'darwin', 'arm64'), 'civitai_0.1.108_darwin_arm64', 'darwin/arm64');
  eq(releaseAssetName('v0.1.108', 'win32', 'x64'), 'civitai_0.1.108_windows_amd64.exe', 'windows/amd64');
});

check('an unpublished platform yields null (which SKIPs, never fails)', () => {
  eq(releaseAssetName('v0.1.108', 'freebsd', 'x64'), null, 'freebsd');
  eq(releaseAssetName('v0.1.108', 'linux', 'ppc64'), null, 'ppc64');
});

check('isPlainVersionTag accepts the shapes civitai/cli actually publishes', () => {
  assert(isPlainVersionTag('v0.1.108'), 'v-prefixed');
  assert(isPlainVersionTag('0.1.108'), 'bare');
  assert(isPlainVersionTag('v1.0.0-rc.1'), 'prerelease');
});

check('isPlainVersionTag refuses a tag that could steer a filesystem path', () => {
  // 🔴 The remote `tag_name` reaches an asset name and, before this gate, a
  // cache path of a file the process then EXECUTES. CodeQL
  // js/command-line-injection flagged it on the first push of docs#101.
  // The first two are the SEMVER-PARSEABLE ones — `compareSemver` accepts both
  // (measured), so they are the shapes that genuinely escaped the cache dir.
  // The rest are the obvious cases, kept so the gate is not narrowed to them.
  for (const bad of [
    '0.1.108-x/../../../../tmp/pwn',
    '0.1.108+../../x',
    '../../../../etc/cron.d/x',
    'v0.1.108/../../evil',
    'v0.1.108 ',
    'v0.1.108 ; rm -rf /',
    '/abs/path',
    'v0.1.108\n0.0.0',
    'latest',
    '',
    null,
    123,
    'v0.1.' + '9'.repeat(70),
  ]) {
    assert(!isPlainVersionTag(bad), `must refuse ${JSON.stringify(bad)}`);
  }
});

check('parseChecksums reads goreleaser checksums.txt, including the binary-mode star', () => {
  const sum = 'c30323319d7d7eebbaf18b4bb4a3b2a0e21818f205c71ca8b5f8da32f2e5c350';
  const other = '972033be034e9a1f0cd21d91ca7fc10d5e3bc8d49252d1e23ee7285b42d873cd';
  const parsed = parseChecksums(
    `${sum}  civitai_0.1.108_linux_amd64\n${other} *civitai_0.1.108_linux_arm64\nnot a checksum line\n`,
  );
  eq(parsed['civitai_0.1.108_linux_amd64'], sum, 'amd64');
  eq(parsed['civitai_0.1.108_linux_arm64'], other, 'arm64 (binary mode)');
  eq(Object.keys(parsed).length, 2, 'the junk line must not become an entry');
});

// ---------------------------------------------------------------------------
// END-TO-END: the tag no longer short-circuits to a pass.
//
// 🔴 THIS IS docs#101's CLOSING CONDITION 1, AS A TEST. The fixture release's
// tag EQUALS the committed snapshot's tag — the exact input the pre-#101 guard
// printed "✓ snapshot tag … matches the latest civitai/cli release" for and
// exited 0 on. The asset it serves is a STUB that answers `--version` correctly
// and nothing else, so the capture cannot succeed. The assertion is that the
// script exits NON-ZERO anyway, i.e. that a matching tag did not end the run.
//
// Fully offline: an ephemeral loopback server, no civitai/cli, no GitHub.
// ---------------------------------------------------------------------------
console.log('\ncheck-appblocks-cli-snapshot — end to end (offline fixture release)\n');

// 🔴 ASYNC ON PURPOSE. `spawnSync` blocks this process's event loop, so the
// loopback fixture server below would never get to answer and the run would
// SKIP on a timeout — a green-looking "the endpoint was unreachable" that tests
// nothing. Measured: that is exactly what happened on the first attempt.
function runChecker(env) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [CHECKER], {
      env: { ...process.env, GITHUB_TOKEN: '', CIVITAI_CLI_BIN: '', ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const kill = setTimeout(() => child.kill('SIGKILL'), 120000);
    child.on('close', (status) => {
      clearTimeout(kill);
      done({ status, stdout, stderr });
    });
  });
}

await checkAsync('an unreachable release endpoint SKIPs (exit 0) rather than false-failing', async () => {
  const r = await runChecker({ APPBLOCKS_CLI_RELEASES_URL: 'http://127.0.0.1:1/releases/latest' });
  eq(r.status, 0, `expected a skip, got exit ${r.status}\n${r.stdout}${r.stderr}`);
  assert(/skip, no false-fail/.test(r.stdout), `expected the skip wording:\n${r.stdout}`);
});

await checkAsync('a path-traversal tag_name FAILS before anything is downloaded or executed', async () => {
  // 🔴 THE FIXTURE TAG IS SEMVER-PARSEABLE ON PURPOSE. A bare
  // `../../../../tmp/pwned` is refused by `compareSemver` before it reaches a
  // path — an ACCIDENTAL barrier, and testing against it would prove the gate
  // works on the one input that never needed it. `0.1.108-x/../../../../tmp/pwn`
  // parses as semver (prerelease `x/../../../../tmp/pwn`), so under the first
  // push of docs#101 it flowed into the asset name and then into the cache
  // filename of a file this process writes, chmod +x es and EXECUTES.
  let assetHits = 0;
  const server = createServer((req, res) => {
    if (req.url === '/releases/latest') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ tag_name: '0.1.108-x/../../../../tmp/pwn', assets: [] }));
    }
    assetHits++;
    res.writeHead(404);
    res.end('no');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const r = await runChecker({
      APPBLOCKS_CLI_RELEASES_URL: `http://127.0.0.1:${server.address().port}/releases/latest`,
    });
    const all = `${r.stdout}${r.stderr}`;
    eq(r.status, 1, `expected a hard failure, got exit ${r.status}\n${all}`);
    assert(/not a plain version/.test(all), `expected the tag gate's own message:\n${all}`);
    assert(!/skip, no false-fail/.test(all), `a malformed tag must not degrade to a skip:\n${all}`);
    eq(assetHits, 0, 'nothing beyond the release metadata should have been requested');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

await checkAsync('a MATCHING tag does NOT end the run — the content comparison is attempted', async () => {
  if (process.platform === 'win32') {
    console.log('       (skipped on win32: the stub binary is a POSIX shell script)');
    return;
  }
  const snapTag = parseSnapshotVersion(readFileSync(SNAPSHOT, 'utf8')).tag;
  const dir = mkdtempSync(join(tmpdir(), 'cli-snapshot-e2e-'));
  const assetName = releaseAssetName(snapTag);
  assert(assetName, `no asset name for ${process.platform}/${process.arch}`);

  // A stub that answers --version with the fixture tag and nothing else. It
  // passes the version gate, so the run reaches the capture — and the capture
  // then fails, which is the observable that proves the tag did not decide.
  const stub = `#!/bin/sh\ncase "$1" in --version) echo "civitai ${snapTag.replace(/^v/, '')}";; *) exit 0;; esac\n`;
  const stubBytes = Buffer.from(stub, 'utf8');
  const sum = createHash('sha256').update(stubBytes).digest('hex');
  const stubPath = join(dir, assetName);
  writeFileSync(stubPath, stubBytes);
  chmodSync(stubPath, 0o755);
  const checksums = `${sum}  ${assetName}\n`;

  const server = createServer((req, res) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    if (req.url === '/releases/latest') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          tag_name: snapTag,
          assets: [
            { name: assetName, browser_download_url: `${base}/a/${assetName}` },
            { name: 'checksums.txt', browser_download_url: `${base}/a/checksums.txt` },
          ],
        }),
      );
      return;
    }
    if (req.url === '/a/checksums.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(checksums);
      return;
    }
    if (req.url === `/a/${assetName}`) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(stubBytes);
      return;
    }
    res.writeHead(404);
    res.end('no');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const port = server.address().port;
    const r = await runChecker({
      APPBLOCKS_CLI_RELEASES_URL: `http://127.0.0.1:${port}/releases/latest`,
      APPBLOCKS_CLI_BIN_CACHE: join(dir, 'cache'),
    });
    const all = `${r.stdout}${r.stderr}`;
    // The old guard's exact pass line, on this exact input.
    assert(
      /latest civitai\/cli release: /.test(all),
      `the run did not reach the release resolution at all:\n${all}`,
    );
    assert(
      r.status !== 0,
      `🔴 a MATCHING tag exited 0 — the tag comparison is deciding the verdict again:\n${all}`,
    );
    assert(
      /capture from the .* binary FAILED/.test(all),
      `expected the capture to be attempted and to fail loudly; got:\n${all}`,
    );
    // And it must NOT have failed by way of a tag verdict.
    assert(!/LAGS the latest/.test(all), `the failure came from a tag comparison:\n${all}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

console.log('');
// 🔴 A COUNT FLOOR — the positive control on this harness. Every assertion above
// lives inside a `check(...)` callback, so a suite that never RUNS them (an early
// return, a rename that orphans a section, a botched merge) would print a serene
// "all passed" over zero work. Measured when this line was written.
const MIN_CHECKS = 24;
if (executed < MIN_CHECKS) {
  console.error(
    `check-cli-snapshot tests: only ${executed} checks RAN, expected at least ${MIN_CHECKS} — ` +
      'the suite is reporting on work it did not do.',
  );
  process.exit(1);
}
if (failures) {
  console.error(`check-cli-snapshot tests: ${failures} FAILED of ${executed}`);
  process.exit(1);
}
console.log(`check-cli-snapshot tests: all ${executed} passed`);
