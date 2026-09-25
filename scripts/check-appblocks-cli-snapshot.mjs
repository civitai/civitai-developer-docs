#!/usr/bin/env node
/**
 * check-appblocks-cli-snapshot.mjs
 * --------------------------------
 * The `civitai` CLI SNAPSHOT correctness guard (scheduled drift check).
 *
 * WHY THIS IS SEPARATE FROM check-appblocks-snapshots.mjs
 * -------------------------------------------------------
 * That guard diffs each committed snapshot against a raw file served from a
 * public repo. `appblocks-snapshots/civitai-cli-help.txt` has no such upstream
 * file: it is `civitai app … --help` OUTPUT, captured by running a compiled Go
 * binary (gen-appblocks-cli.mjs resolves it from CIVITAI_CLI_BIN or PATH). There
 * is nothing to `curl` and byte-compare, so it was simply excluded — with a
 * comment claiming "the CLI snapshot tracks an npm package pinned by version, so
 * version-pinning already guards it". That was FALSE in both halves: the source
 * is a Go binary, not an npm package, and check-appblocks-pins.mjs pins only
 * @civitai/app-sdk and @civitai/blocks-react. Nothing guarded it, and the
 * snapshot silently fell ~30 commits behind — losing, among other things, the
 * `civitai app dev-token --spend` / `--budget` flags, so the published docs told
 * app authors `npm run dev:live` could not spend real Buzz and offered no way to
 * enable it.
 *
 * 🔴 THE VERDICT IS A CONTENT COMPARISON. IT USED TO BE A VERSION STRING, AND
 * THAT IS THE DEFECT docs#101 FIXED.
 * ---------------------------------------------------------------------------
 * Until docs#101 this guard read the snapshot header's `git describe` TAG and
 * compared it against the latest published civitai/cli release. That predicate
 * is not the question anybody has: it can only ever answer "was a release cut
 * since the capture", never "does the committed snapshot say what the binary
 * says". The gap is not theoretical and this file recorded it in its own
 * source, unprompted, for months:
 *
 *   - Measured 2026-08-09: the snapshot sat at v0.1.90-25-g9cfe468 with
 *     civitai/cli#274 and #276 both merged, and grep for their help prose
 *     returned 0 and 0 against a working positive control. The guard said `ok`.
 *   - docs#56: the snapshot served `2.0 MB` in 10 occurrences across 8 lines
 *     where the CLI says `MiB` (civitai/cli#282's `humanBytes` relabel). The
 *     guard said `ok` for the whole window.
 *
 * A permanently-GREEN gate is worse than a permanently-red one: nobody clicks
 * through it, they just believe it. So the verdict is now the predicate nothing
 * previously asserted:
 *
 *     does the committed snapshot BYTE-EQUAL what the current release's binary
 *     emits, through the same generator that wrote it?
 *
 * Mechanically: resolve a binary at the latest release tag (a verified release
 * asset, or CIVITAI_CLI_BIN), run `gen-appblocks-cli.mjs --write-snapshot` with
 * APPBLOCKS_SNAPSHOTS_DIR pointed at a temp dir, and `Buffer.equals` the result
 * against the bytes read from the committed file BEFORE the capture ran.
 *
 * 🔴 COMPARE AGAINST THE LATEST *RELEASE*, NEVER `main`. developer.civitai.com
 * documents the binary a reader can actually install — `brew install civitai`,
 * `npm i -g @civitai/cli`, a GitHub release archive; all three are RELEASES.
 * Capturing `main` would redden this job on every upstream PR that touches help
 * text, i.e. rebuild the permanently-red gate at the other end of the same
 * spectrum. cli-snapshot-refresh.yml's header states the same policy at length;
 * changing it is a policy decision, not a trigger swap.
 *
 * 🔴 THE TAG PARSE SURVIVES AS MESSAGE TEXT, NOT AS THE VERDICT.
 * `parseSnapshotVersion` and `classifySnapshot` are still exported and still
 * called — "snapshot says v0.1.104, release is v0.1.108" is the single most
 * useful line on a failure, and it is the whole of what scripts/refresh-cli-
 * snapshot.mjs imports from here (its `--decide` step is tag-based ON PURPOSE;
 * read that file's header before "unifying" the two). What changed is that
 * `classifySnapshot`'s answer no longer reaches `process.exit`.
 *
 * DESIGN — scheduled, not PR-blocking. A civitai/cli release is UPSTREAM
 * movement, unrelated to any given docs PR, so blocking unrelated PRs on it
 * would be wrong. This runs on the daily `.github/workflows/appblocks-drift.yml`
 * sweep, where a red run is the visible signal to re-capture. The REPO-LOCAL
 * half of CLI-snapshot correctness — every `app` subcommand the snapshot
 * advertises being listed in the generator — has no upstream input and therefore
 * DOES block a PR: see .github/workflows/appblocks-cli.yml.
 *
 * RESULTS
 *   - fresh capture BYTE-EQUALS the committed snapshot -> PASS, reporting the
 *     byte count and the `===CMD` block count on BOTH sides. A comparison that
 *     reports zero of anything is indistinguishable from one wired to nothing,
 *     so a zero on either side is itself a FAIL — `describeContentDrift`'s
 *     `comparable`, refused in main() BEFORE `identical` is ever read.
 *   - fresh capture DIFFERS                 -> FAIL (exit 1): re-capture. The
 *                                              message names the first differing
 *                                              line and carries the tag context.
 *   - snapshot missing / header unparseable -> FAIL (repo-local breakage).
 *   - release endpoint 404 / 410            -> FAIL: civitai/cli or its releases
 *                                              moved — real drift.
 *   - release asset absent from the release -> FAIL: the release layout changed.
 *   - CIVITAI_CLI_BIN set but not AT the release tag -> FAIL: an explicit
 *                                              override pointing at the wrong
 *                                              binary is operator error, and
 *                                              quietly downloading instead would
 *                                              hide it.
 *   - sha256 mismatch on the downloaded asset -> FAIL: never execute it.
 *   - network / DNS / timeout / 5xx / 403 rate-limit, on EITHER the metadata or
 *     the asset download            -> SKIP (exit 0): a connectivity failure or
 *                                      a shared-runner rate limit must never
 *                                      false-fail.
 *   - no release asset for this OS/arch     -> SKIP (exit 0), naming the pair.
 *
 * USAGE
 *   npm run check:cli-snapshot
 *   APPBLOCKS_CLI_RELEASES_URL=<url> npm run check:cli-snapshot   # test hook
 *   CIVITAI_CLI_BIN=/path/to/civitai npm run check:cli-snapshot   # CI artifact
 *
 * Offline unit coverage for the pure halves: scripts/test-check-cli-snapshot.mjs.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareSemver } from './check-appblocks-pins.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const SNAPSHOT = join(repoRoot, 'appblocks-snapshots', 'civitai-cli-help.txt');
const GENERATOR = join(__dirname, 'gen-appblocks-cli.mjs');

// Override to point the guard at a dead host (skip path) or a fixture (red path).
const RELEASES_URL =
  process.env.APPBLOCKS_CLI_RELEASES_URL || 'https://api.github.com/repos/civitai/cli/releases/latest';

// Same, for the informational commits-behind probe below.
const COMPARE_URL =
  process.env.APPBLOCKS_CLI_COMPARE_URL || 'https://api.github.com/repos/civitai/cli/compare';

// Verified release binaries are cached by CONTENT HASH, so a re-run (and the
// mutation battery this guard's own correctness is established with) does not
// re-download ~20 MB each time. Keyed on the sha256 the release's checksums.txt
// asserts, and re-verified on every cache hit — a cache entry is never trusted
// because of its name.
const BIN_CACHE = process.env.APPBLOCKS_CLI_BIN_CACHE || join(tmpdir(), 'civitai-cli-release-bins');

const ghHeaders = () => {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'civitai-developer-docs-drift-guard',
  };
  // Optional — an Actions-provided token lifts the shared-IP rate limit. Absent,
  // a 403 rate-limit SKIPs rather than false-fails.
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
};

/**
 * How many civitai/cli commits have landed since the snapshot was captured.
 *
 * INFORMATIONAL, AND NOW ONLY THAT. This used to carry a 🔴 banner calling it
 * "the drift the tag comparison structurally cannot see" — true while the tag
 * WAS the verdict, and no longer the shape of this file: the content comparison
 * below sees every byte of drift against the release. What this number still
 * adds is the OTHER axis, `main` movement between releases, which the
 * release-tracking policy deliberately does not fail on (see the header, and
 * cli-snapshot-refresh.yml's at length). It is printed so a human reading a
 * green run can see "38 commits behind" and decide to look.
 *
 * 🔴 REPORTED, NEVER FAILED. Failing on a non-zero count would redden this daily
 * job on every upstream commit, including the many that touch no help text (8 of
 * 12 in one measured window).
 *
 * Returns null on ANY failure — it must never be able to turn a passing run into
 * a failing one, so every error path degrades to silence.
 */
export async function commitsSinceSnapshot(snapshotSha, fetchImpl = fetch) {
  if (!snapshotSha) return null;
  try {
    const res = await fetchImpl(`${COMPARE_URL}/${snapshotSha}...main`, {
      signal: AbortSignal.timeout(20000),
      headers: ghHeaders(),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.ahead_by === 'number' ? body.ahead_by : null;
  } catch {
    return null;
  }
}

/**
 * Parse the snapshot header's `Binary version:` line into its `git describe`
 * parts. Pure + exported so the regression test can drive it without network.
 *
 * 🔴 THE HEADER CARRIES TWO SHAPES AND BOTH ARE CORRECT. A `make build` stamps
 * `git describe` (`v0.1.104`, `v0.1.90-13-g569f5dc`); a goreleaser RELEASE ASSET
 * stamps the bare version with no `v` (`0.1.108`). The `v?` is load-bearing —
 * do not "fix" it.
 * @returns {{ ok: true, raw, tag, ahead, sha } | { ok: false, reason: string }}
 */
export function parseSnapshotVersion(text) {
  const m = /^Binary version:\s*civitai\s+(\S+)\s*$/m.exec(text);
  if (!m) return { ok: false, reason: 'no `Binary version: civitai <version>` line in the snapshot header' };
  const raw = m[1];
  // git describe: v0.1.90 | v0.1.90-13-g569f5dc
  const d = /^(v?\d+\.\d+\.\d+(?:-(?!\d+-g)[0-9A-Za-z.-]+)?)(?:-(\d+)-g([0-9a-f]+))?$/.exec(raw);
  if (!d) return { ok: false, reason: `unparseable version "${raw}" (expected git-describe output)` };
  return { ok: true, raw, tag: d[1], ahead: d[2] ? Number(d[2]) : 0, sha: d[3] ?? null };
}

/** Strip a leading `v` so the tag can go through the shared semver comparator. */
const bare = (tag) => String(tag).replace(/^v/, '');

/**
 * Classify the snapshot's tag against the latest published release tag.
 *
 * 🔴 NO LONGER THE VERDICT — see the header. Still exported because
 * scripts/refresh-cli-snapshot.mjs's `--decide` step is tag-based on purpose,
 * and because "snapshot says X, release is Y" is the context line a content
 * failure is read with.
 * @returns {{ status: 'ok'|'stale'|'ahead' }}
 */
export function classifySnapshot(snapshotTag, latestTag) {
  const cmp = compareSemver(bare(snapshotTag), bare(latestTag));
  if (cmp < 0) return { status: 'stale' };
  if (cmp > 0) return { status: 'ahead' };
  return { status: 'ok' };
}

/** `===CMD <label>===` delimiters in a bundle — the generator's own block marker. */
export function countCommandBlocks(text) {
  return (String(text).match(/^===CMD .+?===$/gm) || []).length;
}

/**
 * The CONTENT verdict. Pure, exported, and the only thing that decides the exit
 * code.
 *
 * 🔴 A ZERO IS NOT A PASS. `identical` alone would report success for two empty
 * strings, two truncated captures, or a comparison accidentally wired to the
 * same file twice — the reassuring-zero failure this whole rewrite exists to
 * remove. So the result carries the COUNTS it compared and `comparable` is false
 * unless both sides carry at least one `===CMD` block and at least one byte.
 * main() refuses on `comparable === false` before it ever looks at `identical`.
 *
 * @param {Buffer|string} committed bytes read from the committed snapshot
 * @param {Buffer|string} fresh     bytes captured from the release binary
 */
export function describeContentDrift(committed, fresh) {
  const a = Buffer.isBuffer(committed) ? committed : Buffer.from(String(committed), 'utf8');
  const b = Buffer.isBuffer(fresh) ? fresh : Buffer.from(String(fresh), 'utf8');
  const aText = a.toString('utf8');
  const bText = b.toString('utf8');
  const committedBlocks = countCommandBlocks(aText);
  const freshBlocks = countCommandBlocks(bText);
  const comparable = a.length > 0 && b.length > 0 && committedBlocks > 0 && freshBlocks > 0;

  const identical = a.equals(b);
  const out = {
    comparable,
    identical,
    committedBytes: a.length,
    freshBytes: b.length,
    committedBlocks,
    freshBlocks,
    changedLines: 0,
    firstDiffLine: null,
    sample: [],
  };
  if (identical) return out;

  const aLines = aText.split('\n');
  const bLines = bText.split('\n');
  const n = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < n; i++) {
    if (aLines[i] === bLines[i]) continue;
    out.changedLines++;
    if (out.firstDiffLine === null) out.firstDiffLine = i + 1;
    if (out.sample.length < 6) {
      out.sample.push({
        line: i + 1,
        committed: aLines[i] === undefined ? '<absent — snapshot is shorter>' : aLines[i],
        fresh: bLines[i] === undefined ? '<absent — capture is shorter>' : bLines[i],
      });
    }
  }
  return out;
}

/** Fetch the latest civitai/cli release. 404 = real drift; else transient. */
async function fetchLatestRelease() {
  try {
    const res = await fetch(RELEASES_URL, { signal: AbortSignal.timeout(20000), headers: ghHeaders() });
    if (!res.ok) {
      const gone = res.status === 404 || res.status === 410;
      return { ok: false, status: res.status, reason: `HTTP ${res.status}`, gone };
    }
    const body = await res.json();
    const tag = body?.tag_name;
    if (!tag) return { ok: false, reason: 'no tag_name in the releases response' };
    // 🔴 THE TAG IS REMOTE INPUT AND IT REACHES A FILESYSTEM PATH. It is
    // interpolated into the release asset name, which used to be interpolated
    // into the cache filename of a file this process then EXECUTES — so a tag
    // containing `/` or `..` was a path-traversal write-and-run, no shell
    // required. The cache path no longer carries the tag at all (see
    // resolveReleaseBinary), and this is the second barrier: refuse anything
    // that is not a plain version tag before it is used for ANYTHING. Flagged
    // by CodeQL js/command-line-injection on the first push of docs#101.
    // FAIL, not SKIP: this is not a connectivity problem, and a skip would hide
    // exactly the input worth shouting about.
    if (!isPlainVersionTag(tag)) {
      return {
        ok: false,
        malformed: true,
        reason: `the releases endpoint returned a tag_name that is not a plain version: ${JSON.stringify(String(tag).slice(0, 80))}`,
      };
    }
    const assets = Array.isArray(body?.assets)
      ? body.assets.map((a) => ({ name: a?.name, url: a?.browser_download_url }))
      : [];
    return { ok: true, tag, assets };
  } catch (err) {
    return { ok: false, reason: err.message, network: true };
  }
}

/**
 * The goreleaser asset name for THIS host, e.g. `civitai_0.1.108_linux_amd64`.
 * Returns null for a platform civitai/cli publishes nothing for — which SKIPs
 * rather than fails: this guard is not an opinion about where it runs.
 * (Measured against the v0.1.108 asset list: linux/darwin × amd64/arm64 and
 * windows × amd64/arm64 with a `.exe` suffix.)
 */
export function releaseAssetName(tag, platform = process.platform, arch = process.arch) {
  const os = { linux: 'linux', darwin: 'darwin', win32: 'windows' }[platform];
  const cpu = { x64: 'amd64', arm64: 'arm64' }[arch];
  if (!os || !cpu) return null;
  return `civitai_${bare(tag)}_${os}_${cpu}${os === 'windows' ? '.exe' : ''}`;
}

/**
 * Is this a plain `[v]MAJOR.MINOR.PATCH[-prerelease]` tag and nothing else?
 *
 * The allowlist is deliberately tighter than semver: no path separators, no
 * `..`, no whitespace, no shell metacharacters, bounded length. Everything
 * downstream — the asset name, the error messages, and formerly the cache path
 * — interpolates this string, so the gate is here rather than at each use.
 */
export function isPlainVersionTag(tag) {
  return typeof tag === 'string' && tag.length <= 64 && /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag);
}

/** Parse a goreleaser `checksums.txt` into { filename: sha256 }. */
export function parseChecksums(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)\s*$/.exec(line.trim());
    if (m) out[m[2]] = m[1];
  }
  return out;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * `civitai --version` -> `civitai 0.1.108`. Returns the version token or null.
 *
 * 🔴 THE TRUST BOUNDARY, STATED. This runs a program, so `bin` must never be a
 * path an attacker can steer. Two callers, two different answers:
 *   - CIVITAI_CLI_BIN — an operator-set path to a program to run, which is the
 *     FEATURE (cli-snapshot-refresh.yml passes its build artifact this way, and
 *     gen-appblocks-cli.mjs has always taken the same variable). Anyone who can
 *     set it can already run anything as this process.
 *   - the release-asset cache path — which is `join(BIN_CACHE, 'civitai-' +
 *     <64 hex>)` and carries NO remote string, after CodeQL flagged the version
 *     that did. See resolveReleaseBinary.
 * `execFileSync` with an argv array, never a shell string, so there is no
 * metacharacter surface on top of that.
 */
function binaryVersion(bin) {
  try {
    const out = execFileSync(bin, ['--version'], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', CIVITAI_NO_COLOR: '1', CIVITAI_NO_UPDATE_CHECK: '1' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = /^civitai\s+(\S+)/m.exec(out);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * A `civitai` binary AT `release.tag`, or a reason not to have one.
 *
 * Two routes, in this order:
 *   1. CIVITAI_CLI_BIN — the CI route. cli-snapshot-refresh.yml's `build-cli`
 *      job already produces exactly this artifact (`make build` at the tag,
 *      uploaded, `chmod +x`ed), and it succeeds on every recent run.
 *   2. The published release asset for this OS/arch, sha256-verified against the
 *      release's OWN checksums.txt before it is made executable. A binary this
 *      process is about to EXECUTE is never run unverified, and "the download
 *      succeeded" is not verification.
 * @returns {{ ok: true, bin, source } | { ok: false, skip?: true, reason, advice? }}
 */
async function resolveReleaseBinary(release) {
  const want = bare(release.tag);

  const override = process.env.CIVITAI_CLI_BIN;
  if (override) {
    const got = binaryVersion(override);
    if (!got) {
      return {
        ok: false,
        reason: `CIVITAI_CLI_BIN=${override} is not an invokable civitai binary (\`--version\` failed)`,
        advice: 'unset CIVITAI_CLI_BIN to let this guard fetch the published release asset instead.',
      };
    }
    if (bare(got) !== want) {
      return {
        ok: false,
        reason: `CIVITAI_CLI_BIN=${override} reports civitai ${got}, but the latest release is ${release.tag}`,
        advice:
          'an explicit override pointing at the wrong binary is operator error — silently downloading the right ' +
          'one instead would hide it. Point it at a ' +
          `${release.tag} build, or unset it.`,
      };
    }
    return { ok: true, bin: override, source: `CIVITAI_CLI_BIN (civitai ${got})` };
  }

  const assetName = releaseAssetName(release.tag);
  if (!assetName) {
    return {
      ok: false,
      skip: true,
      reason: `civitai/cli publishes no release asset for ${process.platform}/${process.arch}`,
    };
  }
  const asset = release.assets.find((a) => a.name === assetName);
  const sums = release.assets.find((a) => a.name === 'checksums.txt');
  if (!asset || !sums) {
    const missing = !asset ? assetName : 'checksums.txt';
    return {
      ok: false,
      reason: `release ${release.tag} carries no asset named "${missing}"`,
      advice:
        `the release layout changed — assets present: ${release.assets.map((a) => a.name).join(', ') || '(none)'}. ` +
        'Update releaseAssetName() in scripts/check-appblocks-cli-snapshot.mjs, or set CIVITAI_CLI_BIN.',
    };
  }

  let sumsText;
  let bytes;
  try {
    const r1 = await fetch(sums.url, { signal: AbortSignal.timeout(60000), headers: ghHeaders() });
    if (!r1.ok) return { ok: false, skip: true, reason: `checksums.txt download returned HTTP ${r1.status}` };
    sumsText = await r1.text();
    const r2 = await fetch(asset.url, { signal: AbortSignal.timeout(180000), headers: ghHeaders() });
    if (!r2.ok) return { ok: false, skip: true, reason: `${assetName} download returned HTTP ${r2.status}` };
    bytes = Buffer.from(await r2.arrayBuffer());
  } catch (err) {
    return { ok: false, skip: true, reason: `release asset download failed: ${err.message}` };
  }

  const expected = parseChecksums(sumsText)[assetName];
  if (!expected) {
    return {
      ok: false,
      reason: `checksums.txt for ${release.tag} has no line for ${assetName}`,
      advice: 'refusing to execute an unverified binary.',
    };
  }
  const actual = sha256(bytes);
  if (actual !== expected) {
    return {
      ok: false,
      reason: `sha256 mismatch on ${assetName}: release says ${expected}, download hashed ${actual}`,
      advice: 'refusing to execute it. Re-run; if it persists, the release assets or the network path are corrupt.',
    };
  }

  // 🔴 THE CACHE FILENAME IS THE HASH, AND NOTHING ELSE. It used to be
  // `${assetName}-${expected}`, and `assetName` interpolates the remote
  // `tag_name` — so a tag containing `/` or `..` wrote (and then EXECUTED) a
  // file outside BIN_CACHE. `expected` came out of `parseChecksums`, whose
  // capture group is `[0-9a-f]{64}`, but relying on a regex three functions
  // away is exactly the reasoning that does not survive an edit. Re-assert it
  // here, at the use, and assert containment after joining.
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    return { ok: false, reason: `checksums.txt gave a non-sha256 digest for ${assetName}` };
  }
  mkdirSync(BIN_CACHE, { recursive: true });
  const dest = join(BIN_CACHE, `civitai-${expected}`);
  if (dirname(resolve(dest)) !== resolve(BIN_CACHE)) {
    return { ok: false, reason: `refusing to cache the release binary outside ${BIN_CACHE}` };
  }
  // Re-verify a cache HIT rather than trusting its filename.
  if (!existsSync(dest) || sha256(readFileSync(dest)) !== expected) writeFileSync(dest, bytes);
  chmodSync(dest, 0o755);

  const got = binaryVersion(dest);
  if (!got || bare(got) !== want) {
    return {
      ok: false,
      reason: `the verified ${assetName} reports civitai ${got ?? '<no --version output>'}, expected ${release.tag}`,
      advice: 'the release asset does not match its own tag — do not capture from it.',
    };
  }
  return { ok: true, bin: dest, source: `release asset ${assetName} (sha256 ${expected.slice(0, 12)}…, civitai ${got})` };
}

/**
 * Run the REAL generator against `bin`, writing its snapshot into a temp dir.
 *
 * 🔴 THE CAPTURE MUST NOT BE ABLE TO LAND ON THE COMMITTED FILE. If
 * APPBLOCKS_SNAPSHOTS_DIR failed to take effect, `--write-snapshot` would
 * OVERWRITE appblocks-snapshots/civitai-cli-help.txt and this guard would then
 * compare a file against itself and pass forever — the exact instrument failure
 * it exists to end. Two independent barriers: the path equality is asserted
 * here, and main() reads the committed bytes into memory BEFORE calling this, so
 * the comparison is against the pre-capture content either way.
 *
 * The generator also writes public/appblocks/cli.json as it always does; that
 * directory is gitignored and is regenerated by `prebuild`, so it is left alone.
 */
function captureFromBinary(bin) {
  const dir = mkdtempSync(join(tmpdir(), 'cli-snapshot-capture-'));
  const out = join(dir, 'civitai-cli-help.txt');
  if (resolve(out) === resolve(SNAPSHOT)) {
    throw new Error('the capture destination resolved to the COMMITTED snapshot — refusing to overwrite it');
  }
  execFileSync(process.execPath, [GENERATOR, '--write-snapshot'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, CIVITAI_CLI_BIN: bin, APPBLOCKS_SNAPSHOTS_DIR: dir, APPBLOCKS_SNAPSHOT_ONLY: '' },
  });
  if (!existsSync(out)) throw new Error(`the generator exited 0 but wrote no snapshot at ${out}`);
  return { dir, out, bytes: readFileSync(out) };
}

async function main() {
  console.log(
    'civitai CLI snapshot CONTENT check — appblocks-snapshots/civitai-cli-help.txt vs a fresh capture from the latest civitai/cli RELEASE\n',
  );

  if (!existsSync(SNAPSHOT)) {
    console.error(`  ✗ committed snapshot MISSING at appblocks-snapshots/civitai-cli-help.txt`);
    console.error('    the CLI reference cannot be generated in CI without it — restore it with');
    console.error('    `node scripts/gen-appblocks-cli.mjs --write-snapshot` (civitai binary on PATH).');
    process.exit(1);
  }

  // 🔴 READ BEFORE CAPTURE. See captureFromBinary: this is the second barrier
  // against a capture that lands on the committed file and then compares it
  // against itself.
  const committedBytes = readFileSync(SNAPSHOT);

  const parsed = parseSnapshotVersion(committedBytes.toString('utf8'));
  if (!parsed.ok) {
    console.error(`  ✗ snapshot header unreadable — ${parsed.reason}`);
    console.error('    the header is written by gen-appblocks-cli.mjs; re-capture rather than hand-editing it.');
    process.exit(1);
  }
  console.log(`  snapshot captured from civitai ${parsed.raw} (tag ${parsed.tag}${parsed.ahead ? `, +${parsed.ahead} commits` : ''})`);

  const remote = await fetchLatestRelease();
  if (!remote.ok) {
    if (remote.gone) {
      console.error(`  ✗ releases endpoint returned ${remote.reason} — civitai/cli or its releases moved`);
      console.error(`    update RELEASES_URL in scripts/check-appblocks-cli-snapshot.mjs to the new location.`);
      process.exit(1);
    }
    if (remote.malformed) {
      console.error(`  ✗ ${remote.reason}`);
      console.error(`    ${RELEASES_URL} is not answering with a civitai/cli release. Nothing was downloaded and`);
      console.error('    nothing was executed. This is not a connectivity failure, so it does not skip.');
      process.exit(1);
    }
    console.log(`  ⊘ ${remote.reason} — could not reach ${RELEASES_URL} (skip, no false-fail)`);
    console.log('\nRelease API unreachable — treating as a network/rate-limit issue, not drift. Exiting 0.');
    return;
  }
  console.log(`  latest civitai/cli release: ${remote.tag}`);

  // Context only. The tag line is printed on every path because it is what a
  // reader needs to interpret a content failure — it is not consulted for the
  // verdict. (docs#101: this used to BE the verdict.)
  const cls = classifySnapshot(parsed.tag, remote.tag);
  const tagContext =
    cls.status === 'ok'
      ? `snapshot tag ${parsed.tag} == release ${remote.tag}`
      : cls.status === 'stale'
        ? `snapshot tag ${parsed.tag} LAGS release ${remote.tag}`
        : `snapshot tag ${parsed.tag} is AHEAD of release ${remote.tag} (unreleased build)`;

  const bin = await resolveReleaseBinary(remote);
  if (!bin.ok) {
    if (bin.skip) {
      console.log(`  ⊘ ${bin.reason} (skip, no false-fail)`);
      console.log(`    tag context: ${tagContext}`);
      console.log('\nNo release binary available to capture from — not drift. Exiting 0.');
      return;
    }
    console.error(`  ✗ ${bin.reason}`);
    if (bin.advice) console.error(`    ${bin.advice}`);
    process.exit(1);
  }
  console.log(`  reference binary: ${bin.source}`);

  let capture;
  try {
    capture = captureFromBinary(bin.bin);
  } catch (err) {
    console.error(`  ✗ capture from the ${remote.tag} binary FAILED — the content comparison could not be made`);
    console.error(`    ${(err.stderr || '').toString().trim() || err.message}`);
    console.error('    this is a failure of the guard, not a verdict about the snapshot: fix it rather than');
    console.error('    reading it as "the snapshot is fine".');
    process.exit(1);
  }

  const drift = describeContentDrift(committedBytes, capture.bytes);
  rmSync(capture.dir, { recursive: true, force: true });

  // POSITIVE CONTROL, in code. A comparison that compared nothing reports
  // `identical: true` for two empty buffers; refuse before reading the verdict.
  if (!drift.comparable) {
    console.error('  ✗ the content comparison compared NOTHING and therefore proves nothing');
    console.error(
      `    committed: ${drift.committedBytes} bytes / ${drift.committedBlocks} ===CMD blocks; ` +
        `fresh capture: ${drift.freshBytes} bytes / ${drift.freshBlocks} ===CMD blocks`,
    );
    console.error('    a side with zero bytes or zero blocks means the capture or the snapshot is empty/truncated.');
    process.exit(1);
  }

  if (drift.identical) {
    console.log(
      `  ✓ CONTENT MATCHES — ${drift.committedBytes} bytes / ${drift.committedBlocks} ===CMD blocks compared, ` +
        'byte-identical to a fresh capture from the release binary',
    );
    console.log(`    tag context: ${tagContext}`);
    // 🔴 TWO REASONS THIS NUMBER CAN BE ABSENT, AND THEY ARE NOT THE SAME
    // OBSERVABLE. A header stamped by a RELEASE ASSET carries a bare version
    // and no `-N-g<sha>`, so there is no commit to compare from — the normal,
    // expected case under the release-tracking policy, and it is not a failure
    // of anything. A header that DOES name a sha and still yields null means
    // the compare API did not answer. Printing one "⊘ unavailable" for both
    // would be an empty result standing in for two mechanisms.
    if (!parsed.sha) {
      console.log(
        `    · no commits-behind probe: the header names a release version (${parsed.raw}), not a git-describe sha`,
      );
      return;
    }
    const behind = await commitsSinceSnapshot(parsed.sha);
    if (behind === null) {
      console.log(`    ⊘ commits-behind unavailable — the compare API did not answer for ${parsed.sha}`);
    } else if (behind === 0) {
      console.log('    ✓ 0 civitai/cli commits on `main` since the capture');
    } else {
      console.log(
        `    ⚠ ${behind} civitai/cli commit(s) have landed on \`main\` since this snapshot was captured.\n` +
          '      This does NOT fail the check: the docs track the latest RELEASE, which this snapshot\n' +
          '      matches byte-for-byte. The number is here so a human can decide whether to look.',
      );
    }
    return;
  }

  console.error(
    `  ✗ CLI SNAPSHOT CONTENT DRIFT — the committed snapshot is NOT what civitai ${remote.tag} emits`,
  );
  console.error(
    `    compared ${drift.committedBytes} bytes / ${drift.committedBlocks} ===CMD blocks (committed) against ` +
      `${drift.freshBytes} bytes / ${drift.freshBlocks} ===CMD blocks (fresh capture)`,
  );
  console.error(`    ${drift.changedLines} line(s) differ, first at line ${drift.firstDiffLine}`);
  for (const s of drift.sample) {
    console.error(`      line ${s.line}:`);
    console.error(`        committed: ${s.committed}`);
    console.error(`        release  : ${s.fresh}`);
  }
  if (drift.changedLines > drift.sample.length) {
    console.error(`      … and ${drift.changedLines - drift.sample.length} further differing line(s)`);
  }
  console.error(`    tag context: ${tagContext}`);
  console.error('\n--- CLI SNAPSHOT DRIFT: the committed help snapshot does not match the published release ---');
  console.error('CI has no `civitai` binary, so the published CLI reference is generated from this');
  console.error('snapshot alone — every byte above is a byte developer.civitai.com is serving WRONG.');
  console.error('This is the docs#56 failure shape (`2.0 MB` where the CLI says `MiB`), which the old');
  console.error('tag comparison verdicted `ok` throughout. Re-capture with a');
  console.error(`civitai ${remote.tag} binary and commit the result:`);
  console.error('');
  console.error('  gh release download ' + remote.tag + ' --repo civitai/cli --pattern "civitai_*_linux_amd64"');
  console.error('  chmod +x civitai_*_linux_amd64   # or: brew install civitai/tap/civitai');
  console.error('  CIVITAI_CLI_BIN=./civitai_*_linux_amd64 node scripts/gen-appblocks-cli.mjs --write-snapshot');
  console.error('  npm run gen:appblocks && git diff appblocks-snapshots/civitai-cli-help.txt');
  console.error('');
  // The remedy used to end "…a new `app` subcommand also has to be added to
  // APP_COMMANDS". That list no longer exists: the command set is WALKED from
  // cobra's `__complete`, so a new command needs no edit here — re-capturing is
  // the whole fix. Leaving the old instruction would send a maintainer looking
  // for a constant that is gone.
  console.error('Review the diff by hand. The command set is walked from the binary, so a new');
  console.error('command needs no list edit — but DO check the node count in the generator log');
  console.error('and re-measure the floors in scripts/test-appblocks-cli.mjs if commands were');
  console.error('added or removed (the PR-blocking appblocks-cli job fails on a shrinking tree).');
  process.exit(1);
}

// Run only when invoked directly (not when imported for the exported helpers).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`check-appblocks-cli-snapshot: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  });
}
