#!/usr/bin/env node
/**
 * check-appblocks-snapshots.mjs
 * -----------------------------
 * The App Blocks SNAPSHOT drift-guard (external CI check).
 *
 * The generated App Blocks reference (Phase 2) is produced from source files in
 * the `civitai` monorepo. In CI there is no `civitai` sibling checkout, so the
 * generators fall back to committed copies under `appblocks-snapshots/`. If
 * civitai changes one of those files upstream and nobody re-snapshots here, the
 * docs silently stale with a green build. Phase 2 added an INTERNAL parser
 * assertion (a parity reformat trips the generator); this is the EXTERNAL guard
 * that catches real UPSTREAM drift by diffing each committed snapshot against
 * `civitai@origin/main` (fetched from the PUBLIC repo via raw.githubusercontent).
 *
 * DESIGN — scheduled, not PR-blocking. Snapshot drift is UPSTREAM civitai
 * movement, unrelated to any given docs PR; blocking unrelated docs PRs on a
 * stale snapshot would be wrong. So this runs on a schedule (mirroring
 * `test-samples`) + workflow_dispatch, where a red run is the visible signal to
 * re-snapshot. See `.github/workflows/appblocks-drift.yml`.
 *
 * RESULTS
 *   - 200 fetch that DIFFERS from the snapshot  -> FAIL (exit 1), naming the
 *     drifted file + the exact re-copy command.
 *   - network unreachable / 5xx / 404           -> SKIP with a clear note
 *     (exit 0 — never false-fail on a transient outage or a moved path).
 *   - 200 fetch byte-identical                  -> PASS.
 *
 * The manifest schema is guarded separately by check-manifest-parity.mjs.
 *
 * USAGE
 *   npm run check:snapshots
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const snapshotsDir = join(repoRoot, 'appblocks-snapshots');

// Override for testing the unreachable-source path (point at a dead host).
const RAW_BASE = process.env.APPBLOCKS_RAW_BASE || 'https://raw.githubusercontent.com/civitai/civitai/main';

// Each committed snapshot ↔ its canonical civitai source path. The manifest
// schema is intentionally NOT here (see check-manifest-parity.mjs); the CLI
// snapshot tracks an npm package pinned by version, so version-pinning already
// guards it.
const SOURCES = [
  {
    path: 'src/shared/constants/block-scope.constants.ts',
    snapshot: 'block-scope.constants.ts',
  },
  {
    path: 'src/server/services/blocks/scope-descriptions.constants.ts',
    snapshot: 'scope-descriptions.constants.ts',
  },
  {
    path: 'src/components/AppBlocks/hostHandlerParity.ts',
    snapshot: 'hostHandlerParity.ts',
  },
];

/** Normalize line endings so a CRLF/LF-only difference isn't reported as drift. */
function normalize(text) {
  return text.replace(/\r\n/g, '\n');
}

/** First diverging line + a small counts summary, for an actionable message. */
function firstDivergence(a, b) {
  const la = a.split('\n');
  const lb = b.split('\n');
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      return {
        line: i + 1,
        snapshot: la[i] ?? '(end of file)',
        upstream: lb[i] ?? '(end of file)',
        snapshotLines: la.length,
        upstreamLines: lb.length,
      };
    }
  }
  return null;
}

async function fetchUpstream(path) {
  const url = `${RAW_BASE}/${path}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      return { ok: false, url, reason: `HTTP ${res.status}`, movedMaybe: res.status === 404 };
    }
    return { ok: true, url, text: await res.text() };
  } catch (err) {
    return { ok: false, url, reason: err.message, network: true };
  }
}

async function main() {
  console.log('App Blocks snapshot drift-guard — diffing appblocks-snapshots/ vs civitai@origin/main\n');

  const drifted = [];
  const skipped = [];
  let ok = 0;

  for (const { path, snapshot } of SOURCES) {
    const snapPath = join(snapshotsDir, snapshot);
    if (!existsSync(snapPath)) {
      console.log(`  ✗ ${snapshot} — committed snapshot MISSING at appblocks-snapshots/${snapshot}`);
      drifted.push({ snapshot, path, missing: true });
      continue;
    }
    const local = normalize(readFileSync(snapPath, 'utf8'));
    const remote = await fetchUpstream(path);

    if (!remote.ok) {
      const note = remote.movedMaybe
        ? `${remote.reason} — upstream path may have moved (rename); verify ${path}`
        : `${remote.reason} — could not reach source`;
      console.log(`  ⊘ ${snapshot} — ${note}`);
      skipped.push({ snapshot, path, note });
      continue;
    }

    const up = normalize(remote.text);
    if (up === local) {
      console.log(`  ✓ ${snapshot} — matches civitai@origin/main`);
      ok++;
    } else {
      const d = firstDivergence(local, up);
      console.log(`  ✗ ${snapshot} — DRIFTED from civitai@origin/main`);
      if (d) {
        console.log(`      first diff at line ${d.line} (snapshot ${d.snapshotLines} lines, upstream ${d.upstreamLines} lines)`);
        console.log(`        snapshot: ${d.snapshot.slice(0, 160)}`);
        console.log(`        upstream: ${d.upstream.slice(0, 160)}`);
      }
      console.log(`      re-snapshot with:`);
      console.log(`        curl -sSL ${remote.url} > appblocks-snapshots/${snapshot}`);
      drifted.push({ snapshot, path, url: remote.url });
    }
  }

  console.log(
    `\nSnapshots: ${ok} up-to-date · ${drifted.length} drifted · ${skipped.length} skipped (unreachable)`,
  );

  if (skipped.length && !drifted.length && ok === 0) {
    console.log('\nAll sources unreachable — treating as an environment/network issue, not drift. Exiting 0.');
  }

  if (drifted.length) {
    console.error('\n--- DRIFT: the committed snapshot(s) no longer match civitai@origin/main ---');
    console.error('The generated App Blocks reference is built from these snapshots in CI, so the');
    console.error('published docs are STALE until they are re-copied. Re-snapshot and commit:');
    for (const d of drifted) {
      if (d.missing) {
        console.error(`  - ${d.snapshot}: MISSING — restore it from ${RAW_BASE}/${d.path}`);
      } else {
        console.error(`  - ${d.snapshot}:  curl -sSL ${d.url} > appblocks-snapshots/${d.snapshot}`);
      }
    }
    console.error('\nThen re-run `npm run gen:appblocks` and review the regenerated public/appblocks/*.');
    process.exit(1);
  }
}

main().catch((err) => {
  // An unexpected error in the guard itself shouldn't wedge the pipeline as a
  // false drift signal — surface it and exit non-fatally on the schedule.
  console.error(`check-appblocks-snapshots: unexpected error: ${err.stack || err.message}`);
  process.exit(2);
});
