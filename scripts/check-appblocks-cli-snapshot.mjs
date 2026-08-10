#!/usr/bin/env node
/**
 * check-appblocks-cli-snapshot.mjs
 * --------------------------------
 * The `civitai` CLI SNAPSHOT freshness guard (scheduled drift check).
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
 * WHAT IT PROBES INSTEAD
 * ----------------------
 * The snapshot header records the exact binary it was captured from:
 *
 *     Binary version: civitai v0.1.90-13-g569f5dc
 *
 * That is `git describe` output — `<tag>[-<commits-ahead>-g<sha>]`. This guard
 * compares its TAG against the latest published civitai/cli release and fails
 * when the snapshot's tag is BEHIND. It is a coarse probe (a snapshot captured
 * from an unreleased build of the current tag reads as current), but it catches
 * the failure that actually happened: a release shipping while the snapshot sat
 * unchanged.
 *
 * DESIGN — scheduled, not PR-blocking. A civitai/cli release is UPSTREAM
 * movement, unrelated to any given docs PR, so blocking unrelated PRs on it
 * would be wrong. This runs on the daily `.github/workflows/appblocks-drift.yml`
 * sweep, where a red run is the visible signal to re-capture. The REPO-LOCAL
 * half of CLI-snapshot correctness — every `app` subcommand the snapshot
 * advertises being listed in the generator — has no upstream input and therefore
 * DOES block a PR: see .github/workflows/appblocks-cli.yml.
 *
 * RESULTS (mirrors the pin guard's 404-vs-network contract)
 *   - snapshot tag == latest release        -> PASS.
 *   - snapshot tag <  latest release        -> FAIL (exit 1): re-capture.
 *   - snapshot tag >  latest release        -> PASS with a note (captured from
 *                                              an unreleased/prerelease build).
 *   - API unreachable / DNS / timeout / 5xx / 403 rate-limit -> SKIP (exit 0):
 *                                              a connectivity failure or a
 *                                              shared-runner rate limit must
 *                                              never false-fail.
 *   - 404 / 410 on the releases endpoint    -> FAIL: the repo or its releases
 *                                              moved — real drift, not transient.
 *   - snapshot missing / header unparseable -> FAIL (repo-local breakage).
 *
 * USAGE
 *   npm run check:cli-snapshot
 *   APPBLOCKS_CLI_RELEASES_URL=<url> npm run check:cli-snapshot   # test hook
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareSemver } from './check-appblocks-pins.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const SNAPSHOT = join(repoRoot, 'appblocks-snapshots', 'civitai-cli-help.txt');

// Override to point the guard at a dead host (skip path) or a fixture (red path).
const RELEASES_URL =
  process.env.APPBLOCKS_CLI_RELEASES_URL || 'https://api.github.com/repos/civitai/cli/releases/latest';

/**
 * Parse the snapshot header's `Binary version:` line into its `git describe`
 * parts. Pure + exported so the regression test can drive it without network.
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
 * @returns {{ status: 'ok'|'stale'|'ahead' }}
 */
export function classifySnapshot(snapshotTag, latestTag) {
  const cmp = compareSemver(bare(snapshotTag), bare(latestTag));
  if (cmp < 0) return { status: 'stale' };
  if (cmp > 0) return { status: 'ahead' };
  return { status: 'ok' };
}

/** Fetch the latest civitai/cli release tag. 404 = real drift; else transient. */
async function fetchLatestRelease() {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'civitai-developer-docs-drift-guard' };
  // Optional — an Actions-provided token lifts the shared-IP rate limit. Absent,
  // a 403 rate-limit SKIPs rather than false-fails.
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(RELEASES_URL, { signal: AbortSignal.timeout(20000), headers });
    if (!res.ok) {
      const gone = res.status === 404 || res.status === 410;
      return { ok: false, status: res.status, reason: `HTTP ${res.status}`, gone };
    }
    const body = await res.json();
    const tag = body?.tag_name;
    if (!tag) return { ok: false, reason: 'no tag_name in the releases response' };
    return { ok: true, tag };
  } catch (err) {
    return { ok: false, reason: err.message, network: true };
  }
}

async function main() {
  console.log('civitai CLI snapshot freshness — appblocks-snapshots/civitai-cli-help.txt vs the latest civitai/cli release\n');

  if (!existsSync(SNAPSHOT)) {
    console.error(`  ✗ committed snapshot MISSING at appblocks-snapshots/civitai-cli-help.txt`);
    console.error('    the CLI reference cannot be generated in CI without it — restore it with');
    console.error('    `node scripts/gen-appblocks-cli.mjs --write-snapshot` (civitai binary on PATH).');
    process.exit(1);
  }

  const parsed = parseSnapshotVersion(readFileSync(SNAPSHOT, 'utf8'));
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
    console.log(`  ⊘ ${remote.reason} — could not reach ${RELEASES_URL} (skip, no false-fail)`);
    console.log('\nRelease API unreachable — treating as a network/rate-limit issue, not drift. Exiting 0.');
    return;
  }

  const cls = classifySnapshot(parsed.tag, remote.tag);
  if (cls.status === 'ok') {
    console.log(`  ✓ snapshot tag ${parsed.tag} matches the latest civitai/cli release ${remote.tag}`);
    return;
  }
  if (cls.status === 'ahead') {
    console.log(`  ✓ snapshot tag ${parsed.tag} is AHEAD of the latest release ${remote.tag} — ok (unreleased build)`);
    return;
  }

  console.error(`  ✗ snapshot tag ${parsed.tag} LAGS the latest civitai/cli release ${remote.tag}`);
  console.error('\n--- CLI SNAPSHOT DRIFT: the committed help snapshot trails a published release ---');
  console.error('CI has no `civitai` binary, so the published CLI reference is generated from this');
  console.error('snapshot alone — every command, flag and caveat added since it was captured is');
  console.error('MISSING from developer.civitai.com until it is re-captured. Re-capture with a');
  console.error(`civitai ${remote.tag} binary and commit the result:`);
  console.error('');
  console.error('  go install github.com/civitai/cli/cmd/civitai@latest   # or: brew install civitai/tap/civitai');
  console.error('  node scripts/gen-appblocks-cli.mjs --write-snapshot');
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
