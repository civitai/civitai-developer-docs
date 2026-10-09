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
 *   - 404 / 410 on a tracked path               -> FAIL (exit 1). A tracked
 *     source file returning 404 means it was RENAMED/REMOVED upstream — the
 *     committed snapshot then keeps generating stale docs forever, so this is
 *     REAL drift, not a transient outage. The message points at the generator's
 *     source path.
 *   - network unreachable / DNS / timeout / 5xx / 403 -> SKIP with a clear note
 *     (exit 0 — a genuine connectivity failure must never false-fail).
 *   - 200 fetch byte-identical                  -> PASS.
 *
 * The manifest schema is guarded separately by check-manifest-parity.mjs.
 *
 * It also checks PINNED_CONSTANTS: single values (rate limits, spend caps) read
 * out of civitai source files and compared with the hand-written generation-limits
 * table in apps/guide/text-to-image.md. Same fetch, same SKIP/FAIL rules. See the
 * comment above PINNED_CONSTANTS for why those files are not byte-snapshotted.
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
// The design-system markup contract lives in a SEPARATE repo (civitai-app-starters).
const APP_STARTERS_BASE =
  process.env.APPBLOCKS_STARTERS_RAW_BASE ||
  'https://raw.githubusercontent.com/civitai/civitai-app-starters/main';

// Each committed snapshot ↔ its canonical upstream source path. Entries default
// to civitai@main (RAW_BASE); an explicit `base` overrides it for sources that
// live in another repo. The manifest schema is intentionally NOT here (see
// check-manifest-parity.mjs).
//
// civitai-cli-help.txt is NOT here either, and NOT because anything else already
// guards it. It is `civitai app … --help` OUTPUT captured by RUNNING the compiled
// Go binary (gen-appblocks-cli.mjs resolves it from CIVITAI_CLI_BIN or PATH), so
// there is no upstream file to fetch and byte-compare — this guard's whole
// mechanism is inapplicable to it. An earlier version of this comment claimed it
// "tracks an npm package pinned by version, so version-pinning already guards
// it"; that was false in both halves (Go binary, not npm; and
// check-appblocks-pins.mjs pins only @civitai/app-sdk + @civitai/blocks-react),
// and it is why the CLI snapshot went ~30 commits stale unnoticed. It now has its
// own probe — snapshot header version vs the latest civitai/cli release — in
// check-appblocks-cli-snapshot.mjs, on the same scheduled drift sweep.
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
  {
    // @civitai/components markup contract → apps/reference/components.md
    // (regenerate with `npm run gen:appblocks:components` after re-snapshotting).
    path: 'packages/civitai-components/MARKUP.md',
    snapshot: 'MARKUP.md',
    base: APP_STARTERS_BASE,
  },
];

// PINNED CONSTANTS — the second half of this guard, for the generation-limits
// table in apps/guide/text-to-image.md (#limits). That table is HAND-WRITTEN
// prose about numbers that live in civitai source, so nothing regenerates it.
// Byte-snapshotting the source files would not work: they are mostly comments
// and change for reasons that never touch a number, so the guard would be red
// on most runs and teach everyone to ignore it. Instead each entry pulls ONE
// value out of the upstream file with a regex and compares it with the value
// the table states.
//
// Each entry carries `doc`, a string that must appear verbatim in the page.
// That ties the pin to the sentence it backs: editing the number in the table
// without updating the pin goes red here too, and so does a rewrite that drops
// the claim. A regex that stops matching (the constant was renamed or moved) is
// drift, not a skip: it means the table's source is no longer where we look.
//
// On drift: re-read the upstream value, update the table, its "Values at
// civitai <sha>, <date>" stamp, and the matching `want` below.
const LIMITS_DOC = 'apps/guide/text-to-image.md';
const PINNED_CONSTANTS = [
  {
    path: 'src/server/utils/block-catalog-rate-limit.ts',
    name: 'BLOCK_CATALOG_RATE_LIMIT_MAX',
    re: /export const BLOCK_CATALOG_RATE_LIMIT_MAX = ([\d_]+);/,
    want: '150',
    doc: '**150 requests / 10 s**',
  },
  {
    path: 'src/server/utils/block-catalog-rate-limit.ts',
    name: 'BLOCK_CATALOG_RATE_LIMIT_WINDOW_SECONDS',
    re: /export const BLOCK_CATALOG_RATE_LIMIT_WINDOW_SECONDS = ([\d_]+);/,
    want: '10',
    doc: '**150 requests / 10 s**',
  },
  {
    path: 'src/server/utils/block-catalog-rate-limit.ts',
    name: 'BLOCK_POLL_RATE_LIMIT_MAX',
    re: /export const BLOCK_POLL_RATE_LIMIT_MAX = ([\d_]+);/,
    want: '1200',
    doc: '**1,200 requests / 60 s**',
  },
  {
    path: 'src/server/utils/block-catalog-rate-limit.ts',
    name: 'BLOCK_POLL_RATE_LIMIT_WINDOW_SECONDS',
    re: /export const BLOCK_POLL_RATE_LIMIT_WINDOW_SECONDS = ([\d_]+);/,
    want: '60',
    doc: '**1,200 requests / 60 s**',
  },
  {
    path: 'src/server/services/blocks/app-cap-limits.constants.ts',
    name: 'DEFAULT_APP_SPEND_TIER',
    re: /export const DEFAULT_APP_SPEND_TIER: AppSpendTier = '(\w+)';/,
    want: 'standard',
    doc: 'Every app starts on `standard`',
  },
  {
    path: 'src/server/services/blocks/app-cap-limits.constants.ts',
    name: 'SHIPPED_APP_VELOCITY_MAX_GENS',
    re: /export const SHIPPED_APP_VELOCITY_MAX_GENS = ([\d_]+);/,
    want: '120',
    doc: '**120 accepted submits / 60 s** on `standard`',
  },
  {
    path: 'src/server/services/blocks/app-cap-limits.constants.ts',
    name: 'BLOCK_APP_SPEND_VELOCITY_WINDOW_SECONDS (default)',
    re: /envPositiveInt\(\s*'BLOCK_APP_SPEND_VELOCITY_WINDOW_SECONDS',\s*([\d_]+)\s*\)/,
    want: '60',
    doc: '**120 accepted submits / 60 s** on `standard`',
  },
  {
    path: 'src/server/services/blocks/app-cap-limits.constants.ts',
    name: 'SHIPPED_APP_DAILY_BUZZ_CEILING',
    re: /export const SHIPPED_APP_DAILY_BUZZ_CEILING = ([\d_]+);/,
    want: '5000000',
    doc: '**5,000,000 Buzz / UTC day**',
  },
  {
    path: 'src/server/services/blocks/app-cap-limits.constants.ts',
    name: 'tier standard.velocityMaxGens',
    re: /APP_SPEND_TIER_TARGETS[\s\S]*?standard: \{[^}]*velocityMaxGens: ([\w]+)/,
    want: 'SHIPPED_APP_VELOCITY_MAX_GENS',
    doc: '**120 accepted submits / 60 s** on `standard`',
  },
  {
    path: 'src/server/services/blocks/app-cap-limits.constants.ts',
    name: 'tier standard.dailyBuzz',
    re: /APP_SPEND_TIER_TARGETS[\s\S]*?standard: \{[^}]*dailyBuzz: ([\w]+)/,
    want: 'SHIPPED_APP_DAILY_BUZZ_CEILING',
    doc: '**5,000,000 Buzz / UTC day** on `standard` and `trusted`',
  },
  {
    path: 'src/server/services/blocks/app-cap-limits.constants.ts',
    name: 'tier trusted.velocityMaxGens',
    re: /APP_SPEND_TIER_TARGETS[\s\S]*?trusted: \{[^}]*velocityMaxGens: ([\w]+)/,
    want: '600',
    doc: '`trusted`: 600',
  },
  {
    path: 'src/server/services/blocks/app-cap-limits.constants.ts',
    name: 'tier trusted.dailyBuzz',
    re: /APP_SPEND_TIER_TARGETS[\s\S]*?trusted: \{[^}]*dailyBuzz: ([\w]+)/,
    want: 'SHIPPED_APP_DAILY_BUZZ_CEILING',
    doc: '**5,000,000 Buzz / UTC day** on `standard` and `trusted`',
  },
  {
    path: 'src/server/services/blocks/app-cap-limits.constants.ts',
    name: 'tier platform.velocityMaxGens',
    re: /APP_SPEND_TIER_TARGETS[\s\S]*?platform: \{[^}]*velocityMaxGens: ([\w]+)/,
    want: '3000',
    doc: '`platform`: 3,000',
  },
  {
    path: 'src/server/services/blocks/app-cap-limits.constants.ts',
    name: 'tier platform.dailyBuzz',
    re: /APP_SPEND_TIER_TARGETS[\s\S]*?platform: \{[^}]*dailyBuzz: ([\w]+)/,
    want: '25000000',
    doc: '`platform`: 25,000,000',
  },
  {
    path: 'src/shared/constants/block-scope.constants.ts',
    name: 'BLOCK_BUZZ_CAP_PER_DAY',
    re: /export const BLOCK_BUZZ_CAP_PER_DAY = ([\d_]+);/,
    want: '50000',
    doc: '**50,000 Buzz / UTC day**',
  },
  {
    path: 'src/pages/api/v1/block-tokens/index.ts',
    name: 'BUZZ_BUDGET_DEFAULT',
    re: /const BUZZ_BUDGET_DEFAULT = ([\d_]+);/,
    want: '10',
    doc: 'Default **10** when the manifest omits it',
  },
  {
    path: 'src/pages/api/v1/block-tokens/index.ts',
    name: 'BUZZ_BUDGET_CAP',
    re: /const BUZZ_BUDGET_CAP = ([\d_]+);/,
    want: '1000',
    doc: 'anything above **1,000** is clamped to 1,000',
  },
  {
    path: 'src/server/schema/blocks/workflow.schema.ts',
    name: 'QUANTITY_MAX',
    re: /const QUANTITY_MAX = ([\d_]+);/,
    want: '4',
    doc: '`quantity` **1–4**',
  },
  {
    path: 'src/server/schema/blocks/workflow.schema.ts',
    name: 'quantity min',
    re: /quantity: z\.coerce\.number\(\)\.int\(\)\.min\(([\d_]+)\)\.max\(QUANTITY_MAX\)/,
    want: '1',
    doc: '`quantity` **1–4**',
  },
];

/**
 * Checks every PINNED_CONSTANTS entry. Returns counts plus the drifted/skipped
 * entries in the same shapes main() reports. The page half is offline and always
 * runs; the upstream half fetches each source file once.
 */
async function checkPinnedConstants() {
  const drifted = [];
  const skipped = [];
  let ok = 0;
  const docPath = join(repoRoot, LIMITS_DOC);
  const doc = existsSync(docPath) ? readFileSync(docPath, 'utf8') : null;
  const files = new Map();

  for (const pin of PINNED_CONSTANTS) {
    const label = `${pin.name} (${pin.path})`;
    if (doc === null || !doc.includes(pin.doc)) {
      console.log(`  ✗ ${label} — ${LIMITS_DOC} no longer contains ${JSON.stringify(pin.doc)}`);
      drifted.push({ pin, docMissing: true });
      continue;
    }
    if (!files.has(pin.path)) files.set(pin.path, await fetchUpstream(pin.path));
    const remote = files.get(pin.path);
    if (!remote.ok && !remote.gone) {
      console.log(`  ⊘ ${label} — ${remote.reason} — could not reach source`);
      skipped.push({ pin, note: remote.reason });
      continue;
    }
    if (!remote.ok) {
      console.log(`  ✗ ${label} — source returned ${remote.reason}: moved/removed upstream`);
      drifted.push({ pin, gone: true, status: remote.status });
      continue;
    }
    const m = normalize(remote.text).match(pin.re);
    if (!m) {
      console.log(`  ✗ ${label} — pattern no longer matches upstream (renamed or moved?)`);
      drifted.push({ pin, unmatched: true });
      continue;
    }
    // Strip numeric separators only (`5_000_000`), never an identifier's underscores.
    const got = /^[\d_]+$/.test(m[1]) ? m[1].replace(/_/g, '') : m[1];
    if (got !== pin.want) {
      console.log(`  ✗ ${label} — upstream is ${got}, the table says ${pin.want}`);
      drifted.push({ pin, got });
      continue;
    }
    console.log(`  ✓ ${label} = ${got}`);
    ok++;
  }
  return { ok, drifted, skipped };
}

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

async function fetchUpstream(path, base = RAW_BASE) {
  const url = `${base}/${path}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      // 404/410 on a KNOWN tracked path is not "transient" — it means the file
      // was renamed or removed upstream, which is REAL drift. Any other non-2xx
      // (5xx server error, 403 rate-limit, etc.) is a transient connectivity
      // issue → skip.
      const gone = res.status === 404 || res.status === 410;
      return { ok: false, url, status: res.status, reason: `HTTP ${res.status}`, gone };
    }
    return { ok: true, url, text: await res.text() };
  } catch (err) {
    // A thrown fetch error is a genuine connectivity failure (DNS / host down /
    // timeout / TLS) — never drift.
    return { ok: false, url, reason: err.message, network: true };
  }
}

async function main() {
  console.log('App Blocks snapshot drift-guard — diffing appblocks-snapshots/ vs civitai@origin/main\n');

  const drifted = [];
  const skipped = [];
  let ok = 0;

  for (const { path, snapshot, base } of SOURCES) {
    const snapPath = join(snapshotsDir, snapshot);
    if (!existsSync(snapPath)) {
      console.log(`  ✗ ${snapshot} — committed snapshot MISSING at appblocks-snapshots/${snapshot}`);
      drifted.push({ snapshot, path, missing: true });
      continue;
    }
    const local = normalize(readFileSync(snapPath, 'utf8'));
    const remote = await fetchUpstream(path, base);

    if (!remote.ok) {
      if (remote.gone) {
        // Tracked path moved/removed upstream → REAL drift (RED), not a skip.
        console.log(`  ✗ ${snapshot} — source path returned ${remote.reason}: moved/removed upstream`);
        console.log(`      civitai no longer serves ${path}, but the generator still reads`);
        console.log(`      appblocks-snapshots/${snapshot} — the generated docs are stale.`);
        console.log(`      update the source path in the gen-appblocks-*.mjs generator + re-snapshot from the new path.`);
        drifted.push({ snapshot, path, gone: true, status: remote.status });
        continue;
      }
      console.log(`  ⊘ ${snapshot} — ${remote.reason} — could not reach source`);
      skipped.push({ snapshot, path, note: remote.reason });
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

  console.log(`\nPinned constants — the generation-limits table in ${LIMITS_DOC} vs civitai@origin/main\n`);
  const pins = await checkPinnedConstants();
  console.log(
    `\nPinned constants: ${pins.ok} of ${PINNED_CONSTANTS.length} match · ${pins.drifted.length} drifted · ${pins.skipped.length} skipped (unreachable)`,
  );

  if (skipped.length && !drifted.length && ok === 0) {
    console.log('\nAll sources unreachable — treating as an environment/network issue, not drift. Exiting 0.');
  }

  if (pins.drifted.length) {
    console.error(`\n--- DRIFT: the generation-limits table in ${LIMITS_DOC} (#limits) no longer matches civitai@origin/main ---`);
    for (const d of pins.drifted) {
      const where = `${RAW_BASE}/${d.pin.path}`;
      if (d.docMissing) console.error(`  - ${d.pin.name}: the page no longer states ${JSON.stringify(d.pin.doc)} — update the pin's \`doc\` with the table`);
      else if (d.gone) console.error(`  - ${d.pin.name}: ${where} returned HTTP ${d.status} — find where the constant moved`);
      else if (d.unmatched) console.error(`  - ${d.pin.name}: pattern no longer matches ${where} — find where the constant moved`);
      else console.error(`  - ${d.pin.name}: upstream ${d.got}, table ${d.pin.want} — update the table, its "Values at civitai <sha>" stamp, and the pin`);
    }
  }

  if (drifted.length) {
    console.error('\n--- DRIFT: the committed snapshot(s) no longer match civitai@origin/main ---');
    console.error('The generated App Blocks reference is built from these snapshots in CI, so the');
    console.error('published docs are STALE until they are re-copied. Re-snapshot and commit:');
    for (const d of drifted) {
      if (d.missing) {
        console.error(`  - ${d.snapshot}: MISSING — restore it from ${RAW_BASE}/${d.path}`);
      } else if (d.gone) {
        console.error(
          `  - ${d.snapshot}: source path ${d.path} returned HTTP ${d.status} — it moved/was removed upstream;` +
            ` update the generator's source path + re-snapshot from the new location.`,
        );
      } else {
        console.error(`  - ${d.snapshot}:  curl -sSL ${d.url} > appblocks-snapshots/${d.snapshot}`);
      }
    }
    console.error('\nThen re-run `npm run gen:appblocks` and review the regenerated public/appblocks/*.');
  }

  if (drifted.length || pins.drifted.length) process.exit(1);
}

main().catch((err) => {
  // An unexpected error in the guard itself shouldn't wedge the pipeline as a
  // false drift signal — surface it and exit non-fatally on the schedule.
  console.error(`check-appblocks-snapshots: unexpected error: ${err.stack || err.message}`);
  process.exit(2);
});
