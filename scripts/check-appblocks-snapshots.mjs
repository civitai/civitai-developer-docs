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
 * WHAT IS COMPARED: THE RENDERED OUTPUT, NOT THE FILE'S BYTES
 * This guard used to fail whenever a snapshot's BYTES differed from upstream.
 * The snapshotted files are mostly comments and unrelated constants
 * (block-scope.constants.ts is ~1,000 lines; the generator reads its scope
 * bits), so a comment rewrite upstream turned the daily sweep red while the
 * docs it guards were byte-for-byte what re-snapshotting would produce. It was
 * red on 29 of 30 runs to 2026-11-14 and every one of those reds read the same
 * as a real one. Now a byte difference is only the TRIGGER: the guard runs the
 * generator that consumes the snapshot twice — once over the committed
 * snapshots, once with every byte-drifted file replaced by its upstream copy —
 * and fails only when the two outputs differ (the JSON artifact minus its
 * `generatedAt` / `sources` bookkeeping, or the generated page for MARKUP.md).
 * That is the same idea PINNED_CONSTANTS below already applied to the limits
 * table: compare the value the docs state, not the file it came from.
 *
 * RESULTS
 *   - 200 fetch byte-identical                  -> PASS.
 *   - 200 fetch that DIFFERS, but the consuming generator renders the same
 *     output from it                            -> PASS, reported as "bytes
 *     differ, rendered output identical" (re-snapshotting is optional).
 *   - 200 fetch that DIFFERS and changes the generator's output -> FAIL
 *     (exit 1), naming the drifted file(s), the first differing line of the
 *     rendered output, and the exact re-copy command.
 *   - 200 fetch that the generator REFUSES (throws on, e.g. a reformat its
 *     parser's fail-loud assertion catches) -> FAIL (exit 1): re-snapshotting
 *     would break the build.
 *   - 404 / 410 on a tracked path               -> FAIL (exit 1). A tracked
 *     source file returning 404 means it was RENAMED/REMOVED upstream — the
 *     committed snapshot then keeps generating stale docs forever, so this is
 *     REAL drift, not a transient outage. The message points at the generator's
 *     source path.
 *   - network unreachable / DNS / timeout / 5xx / 403 -> SKIP with a clear note
 *     (exit 0 — a genuine connectivity failure must never false-fail).
 *
 * It needs `npm ci` first (the generators read the pinned SDK packages and
 * ts-morph). The offline contract test is scripts/test-check-appblocks-snapshots.mjs.
 *
 * The manifest schema has no snapshot: the page renders from the pinned
 * @civitai/app-sdk, whose freshness check:pins owns (and whose agreement with
 * the prod endpoint check-manifest-parity.mjs owns).
 *
 * It also checks PINNED_CONSTANTS: single values (rate limits, spend caps) read
 * out of civitai source files and compared with the hand-written generation-limits
 * table in apps/guide/text-to-image.md. Same fetch, same SKIP/FAIL rules. See the
 * comment above PINNED_CONSTANTS for why those files are not byte-snapshotted.
 *
 * USAGE
 *   npm run check:snapshots
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
// Overridable for the offline contract test, which runs this guard against a doctored
// copy of the committed snapshots. Unset everywhere else.
const snapshotsDir = process.env.APPBLOCKS_SNAPSHOTS_DIR || join(repoRoot, 'appblocks-snapshots');

// Override for testing the unreachable-source path (point at a dead host).
const RAW_BASE = process.env.APPBLOCKS_RAW_BASE || 'https://raw.githubusercontent.com/civitai/civitai/main';
// The design-system markup contract lives in a SEPARATE repo (civitai-app-starters).
const APP_STARTERS_BASE =
  process.env.APPBLOCKS_STARTERS_RAW_BASE ||
  'https://raw.githubusercontent.com/civitai/civitai-app-starters/main';
// The platform feedback limits come from the Go CLI and the MCP server, two more repos.
const CLI_BASE = process.env.APPBLOCKS_CLI_RAW_BASE || 'https://raw.githubusercontent.com/civitai/cli/main';
const MCP_BASE =
  process.env.APPBLOCKS_MCP_RAW_BASE || 'https://raw.githubusercontent.com/civitai/civitai-mcp-server/main';

// Each committed snapshot ↔ its canonical upstream source path. Entries default
// to civitai@main (RAW_BASE); an explicit `base` overrides it for sources that
// live in another repo. `gen` is the generator that READS the snapshot, and
// `out` what it writes: a JSON artifact name, or `PAGE` for the components
// generator, whose output is a committed page. checkLedger() refuses to run
// when a `gen` does not name its snapshot, so a wrong mapping cannot grade a
// generator that never reads the file. There is no manifest-schema snapshot
// any more (see gen-appblocks-manifest.mjs).
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
export const PAGE = Symbol('page');
export const SOURCES = [
  {
    path: 'src/shared/constants/block-scope.constants.ts',
    snapshot: 'block-scope.constants.ts',
    gen: 'gen-appblocks-scopes.mjs',
    out: 'scopes.json',
  },
  {
    path: 'src/server/services/blocks/scope-descriptions.constants.ts',
    snapshot: 'scope-descriptions.constants.ts',
    gen: 'gen-appblocks-scopes.mjs',
    out: 'scopes.json',
  },
  {
    path: 'src/components/AppBlocks/hostHandlerParity.ts',
    snapshot: 'hostHandlerParity.ts',
    gen: 'gen-appblocks-messages.mjs',
    out: 'messages.json',
  },
  // The document store's limits and error codes → apps/guide/storage.md, via
  // scripts/gen-appblocks-storage.mjs (regenerate with `npm run gen:appblocks`, then
  // `npm run gen:appblocks:md` for the .md region, after re-snapshotting).
  {
    path: 'src/server/services/apps/doc-store.types.ts',
    snapshot: 'doc-store.types.ts',
    gen: 'gen-appblocks-storage.mjs',
    out: 'storage.json',
  },
  {
    path: 'src/server/services/apps/doc-store-api.ts',
    snapshot: 'doc-store-api.ts',
    gen: 'gen-appblocks-storage.mjs',
    out: 'storage.json',
  },
  {
    path: 'src/server/utils/shared-storage-rate-limit.ts',
    snapshot: 'shared-storage-rate-limit.ts',
    gen: 'gen-appblocks-storage.mjs',
    out: 'storage.json',
  },
  {
    path: 'src/shared/constants/block-storage.constants.ts',
    snapshot: 'block-storage.constants.ts',
    gen: 'gen-appblocks-storage.mjs',
    out: 'storage.json',
  },
  {
    // @civitai/components markup contract → apps/reference/components.md
    // (regenerate with `npm run gen:appblocks:components` after re-snapshotting).
    path: 'packages/civitai-components/MARKUP.md',
    snapshot: 'MARKUP.md',
    gen: 'gen-appblocks-components.mjs',
    out: PAGE,
    base: APP_STARTERS_BASE,
  },
  // The platform feedback limits → site/guide/platform-feedback.md (#limits), via
  // scripts/gen-appblocks-platform-feedback.mjs (regenerate with `npm run gen:appblocks`,
  // then `npm run gen:appblocks:md` for the .md region, after re-snapshotting). The CLI's
  // copy is the source of the values; the MCP server's is read so the generator can fail
  // when the two disagree (site/mcp/tools.md points at the same table).
  {
    path: 'internal/appapi/platform_feedback.go',
    snapshot: 'platform_feedback.go',
    gen: 'gen-appblocks-platform-feedback.mjs',
    out: 'platform-feedback.json',
    base: CLI_BASE,
  },
  {
    path: 'src/lib/platform-feedback.ts',
    snapshot: 'mcp-platform-feedback.ts',
    gen: 'gen-appblocks-platform-feedback.mjs',
    out: 'platform-feedback.json',
    base: MCP_BASE,
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
  // The viewer's daily cap became per membership tier (civitai #8452), so it is no
  // longer one constant: it is the `apps.buzz-daily` entry of the usage-limit
  // registry, `base` for a free account and `byTier` for the paid tiers (read
  // through `resolveUserAppCaps`). Each regex starts at that entry's id and may not
  // cross the next `id: '`, so another entry's `base` or tier row cannot satisfy it.
  {
    path: 'src/shared/constants/usage-limits.ts',
    name: 'apps.buzz-daily base (free)',
    re: /id: 'apps\.buzz-daily',(?:(?!\bid: ')[\s\S])*?base: ([\d_]+),/,
    want: '50000',
    doc: '**50,000 Buzz / UTC day** on a free account',
  },
  {
    path: 'src/shared/constants/usage-limits.ts',
    name: 'apps.buzz-daily bronze',
    re: /id: 'apps\.buzz-daily',(?:(?!\bid: ')[\s\S])*?byTier: \{(?:(?!\bid: ')[\s\S])*?bronze: \{ limit: ([\d_]+) \}/,
    want: '75000',
    doc: 'Bronze and Founder **75,000**',
  },
  {
    path: 'src/shared/constants/usage-limits.ts',
    name: 'apps.buzz-daily founder',
    re: /id: 'apps\.buzz-daily',(?:(?!\bid: ')[\s\S])*?byTier: \{(?:(?!\bid: ')[\s\S])*?founder: \{ limit: ([\d_]+) \}/,
    want: '75000',
    doc: 'Bronze and Founder **75,000**',
  },
  {
    // The opt-in multiplier the row's "twice" states (user-app-caps.service.ts).
    path: 'src/server/services/blocks/user-app-caps.service.ts',
    name: 'OPT_IN_MULTIPLIER',
    re: /export const OPT_IN_MULTIPLIER = ([\d_]+);/,
    want: '2',
    doc: 'gets **twice** their cap',
  },
  {
    path: 'src/shared/constants/usage-limits.ts',
    name: 'apps.buzz-daily silver',
    re: /id: 'apps\.buzz-daily',(?:(?!\bid: ')[\s\S])*?byTier: \{(?:(?!\bid: ')[\s\S])*?silver: \{ limit: ([\d_]+) \}/,
    want: '100000',
    doc: 'Silver **100,000**',
  },
  {
    path: 'src/shared/constants/usage-limits.ts',
    name: 'apps.buzz-daily gold',
    re: /id: 'apps\.buzz-daily',(?:(?!\bid: ')[\s\S])*?byTier: \{(?:(?!\bid: ')[\s\S])*?gold: \{ limit: ([\d_]+) \}/,
    want: '200000',
    doc: 'Gold **200,000**',
  },
  {
    path: 'src/shared/constants/block-scope.constants.ts',
    name: 'BLOCK_CONSENT_BUDGET_MAX_PER_DAY',
    re: /export const BLOCK_CONSENT_BUDGET_MAX_PER_DAY = ([\d_]+);/,
    want: '50000',
    doc: 'at most 50,000 / UTC day',
  },
  {
    path: 'src/shared/constants/block-scope.constants.ts',
    name: 'BUZZ_BUDGET_DEFAULT',
    re: /export const BUZZ_BUDGET_DEFAULT = ([\d_]+);/,
    want: '1000',
    doc: 'Default **1,000** when the manifest omits it',
  },
  {
    path: 'src/shared/constants/block-scope.constants.ts',
    name: 'BUZZ_BUDGET_CAP',
    re: /export const BUZZ_BUDGET_CAP = ([\d_]+);/,
    want: '5000',
    doc: 'anything above **5,000** is clamped to 5,000',
  },
  {
    path: 'src/shared/constants/block-scope.constants.ts',
    name: 'BLOCK_WORKFLOW_MAX_BUZZ_PER_CALL',
    re: /export const BLOCK_WORKFLOW_MAX_BUZZ_PER_CALL = ([\d_]+);/,
    want: '8000',
    doc: 'never more than **8,000** for one call',
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

/**
 * Every SOURCES entry's `gen` must exist and must name its snapshot, or the
 * render comparison below grades a generator that never reads the file and
 * reports "rendered output identical" for every byte of upstream drift.
 * Returns a list of problems (empty = the ledger holds).
 */
export function checkLedger(sources = SOURCES) {
  const problems = [];
  for (const { snapshot, gen, out } of sources) {
    if (!gen || !out) {
      problems.push(`${snapshot}: no \`gen\`/\`out\` — every snapshot must name the generator that reads it`);
      continue;
    }
    const genPath = join(__dirname, gen);
    if (!existsSync(genPath)) {
      problems.push(`${snapshot}: generator ${gen} does not exist`);
      continue;
    }
    if (!readFileSync(genPath, 'utf8').includes(`'${snapshot}'`)) {
      problems.push(`${snapshot}: ${gen} does not name '${snapshot}', so it does not read this snapshot`);
    }
  }
  return problems;
}

/**
 * What `gen` would publish when its snapshots come from `snapDir`: the JSON
 * artifact with its bookkeeping keys (`generatedAt`, `sources`, `source` —
 * timestamps and file paths, which differ between any two runs) removed, or
 * the generated page. Throws with the generator's stderr when it refuses.
 */
function render(gen, out, snapDir, workDir) {
  const outDir = mkdtempSync(join(workDir, 'out-'));
  const pagePath = join(outDir, 'page.md');
  try {
    execFileSync(process.execPath, [join(__dirname, gen)], {
      cwd: repoRoot,
      env: {
        ...process.env,
        APPBLOCKS_SNAPSHOT_ONLY: '1',
        APPBLOCKS_SNAPSHOTS_DIR: snapDir,
        APPBLOCKS_OUT_DIR: outDir,
        APPBLOCKS_COMPONENTS_OUT: pagePath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    const why = `${err.stderr || ''}${err.stdout || ''}`.trim().split('\n').filter(Boolean).slice(-6).join('\n');
    throw new Error(why || err.message);
  }
  if (out === PAGE) return normalize(readFileSync(pagePath, 'utf8'));
  const artifact = JSON.parse(readFileSync(join(outDir, out), 'utf8'));
  delete artifact.generatedAt;
  delete artifact.sources;
  delete artifact.source;
  return JSON.stringify(artifact, null, 2);
}

async function main() {
  console.log('App Blocks snapshot drift-guard — diffing appblocks-snapshots/ vs civitai@origin/main\n');

  const ledger = checkLedger();
  if (ledger.length) {
    console.error('check-appblocks-snapshots: the SOURCES ledger is wrong, so no verdict is reported:');
    for (const p of ledger) console.error(`  - ${p}`);
    process.exit(2);
  }

  const drifted = [];
  const skipped = [];
  let ok = 0;
  let equivalent = 0;
  // Snapshots whose BYTES differ from upstream, with the upstream text. Graded by
  // rendered output below, never on bytes alone.
  const byteDrifted = [];

  for (const entry of SOURCES) {
    const { path, snapshot, base } = entry;
    const snapPath = join(snapshotsDir, snapshot);
    if (!existsSync(snapPath)) {
      console.log(`  ✗ ${snapshot} — committed snapshot MISSING at appblocks-snapshots/${snapshot}`);
      drifted.push({ snapshot, path, base, missing: true });
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
      // Name the repo the file came from: three of these sources are not civitai.
      const upstream = base ? `${base.replace('https://raw.githubusercontent.com/', '')}` : 'civitai@origin/main';
      console.log(`  ✓ ${snapshot} — matches ${upstream}`);
      ok++;
    } else {
      byteDrifted.push({ ...entry, local, up, url: remote.url });
    }
  }

  // ── Render comparison: does the byte drift change what the docs would say? ──
  // Every byte-drifted file goes into ONE candidate snapshot dir, because that is
  // the state re-snapshotting produces — and a constant moving between two files a
  // generator reads together (storage reads four) only renders correctly with both.
  if (byteDrifted.length) {
    const workDir = mkdtempSync(join(tmpdir(), 'appblocks-drift-'));
    try {
      const candidate = join(workDir, 'snapshots');
      cpSync(snapshotsDir, candidate, { recursive: true });
      for (const d of byteDrifted) writeFileSync(join(candidate, d.snapshot), d.up);
      const gens = [...new Map(byteDrifted.map((d) => [d.gen, d.out]))];
      for (const [gen, out] of gens) {
        const inputs = byteDrifted.filter((d) => d.gen === gen);
        const names = inputs.map((d) => d.snapshot).join(', ');
        const baseline = render(gen, out, snapshotsDir, workDir); // throws: the COMMITTED tree is broken
        let next;
        try {
          next = render(gen, out, candidate, workDir);
        } catch (err) {
          console.log(`  ✗ ${names} — bytes differ, and ${gen} REFUSES the upstream copy:`);
          for (const line of err.message.split('\n')) console.log(`        ${line.slice(0, 200)}`);
          for (const d of inputs) drifted.push({ snapshot: d.snapshot, path: d.path, url: d.url, refused: gen });
          continue;
        }
        if (next === baseline) {
          for (const d of inputs) {
            const f = firstDivergence(d.local, d.up);
            console.log(`  ≈ ${d.snapshot} — bytes differ (first at line ${f?.line}), ${gen} renders identical output — no docs change`);
            equivalent++;
          }
          continue;
        }
        const r = firstDivergence(baseline, next);
        const what = out === PAGE ? 'the generated page' : `public/appblocks/${out}`;
        console.log(`  ✗ ${names} — DRIFTED: re-snapshotting changes ${what}`);
        if (r) {
          console.log(`      first rendered diff at line ${r.line}:`);
          console.log(`        committed: ${r.snapshot.slice(0, 160)}`);
          console.log(`        upstream:  ${r.upstream.slice(0, 160)}`);
        }
        for (const d of inputs) drifted.push({ snapshot: d.snapshot, path: d.path, url: d.url });
      }
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  console.log(
    `\nSnapshots: ${ok} up-to-date · ${equivalent} byte-drifted with identical rendered output · ${drifted.length} drifted · ${skipped.length} skipped (unreachable)`,
  );

  console.log(`\nPinned constants — the generation-limits table in ${LIMITS_DOC} vs civitai@origin/main\n`);
  const pins = await checkPinnedConstants();
  console.log(
    `\nPinned constants: ${pins.ok} of ${PINNED_CONSTANTS.length} match · ${pins.drifted.length} drifted · ${pins.skipped.length} skipped (unreachable)`,
  );

  if (skipped.length && !drifted.length && ok === 0 && equivalent === 0) {
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
    console.error('\n--- DRIFT: re-snapshotting would change the published App Blocks reference ---');
    console.error('The generated reference is built from these snapshots in CI, so the published');
    console.error('docs are STALE until they are re-copied. Re-snapshot and commit:');
    for (const d of drifted) {
      if (d.missing) {
        console.error(`  - ${d.snapshot}: MISSING — restore it from ${d.base ?? RAW_BASE}/${d.path}`);
      } else if (d.gone) {
        console.error(
          `  - ${d.snapshot}: source path ${d.path} returned HTTP ${d.status} — it moved/was removed upstream;` +
            ` update the generator's source path + re-snapshot from the new location.`,
        );
      } else if (d.refused) {
        console.error(`  - ${d.snapshot}: ${d.refused} throws on the upstream copy — fix its parser, then  curl -sSL ${d.url} > appblocks-snapshots/${d.snapshot}`);
      } else {
        console.error(`  - ${d.snapshot}:  curl -sSL ${d.url} > appblocks-snapshots/${d.snapshot}`);
      }
    }
    console.error('\nThen re-run `npm run gen:appblocks` (and `npm run gen:appblocks:md` for the .md');
    console.error('regions; `node scripts/gen-appblocks-components.mjs` for MARKUP.md) and review the result.');
  }

  if (drifted.length || pins.drifted.length) process.exit(1);
}

// Gated so the contract test can import SOURCES / checkLedger without running the sweep.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    // An unexpected error in the guard itself shouldn't wedge the pipeline as a
    // false drift signal — surface it and exit non-fatally on the schedule.
    console.error(`check-appblocks-snapshots: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  });
}
