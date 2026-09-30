#!/usr/bin/env node
/**
 * check-porting-hook-coverage.mjs
 * -------------------------------
 * `apps/guide/porting.md` carries a hand-written table mapping every
 * `@civitai/blocks-react` hook to what replaces it when an author ports off the
 * bridge onto REST. This guard asserts that table's ROW SET is exactly the hook
 * set the pinned package exports — in BOTH directions.
 *
 * THE DRIFT THIS EXISTS TO STOP COMING BACK
 * -----------------------------------------
 * The page opened "All 37 hooks `@civitai/blocks-react` exports" and listed 37
 * rows. Measured against the pinned devDep on the day this landed, the package
 * exported 39 (38 root + `useBlocksStyles` on the `/ui` subpath). The two it was
 * short of were `useGoodPurchase` and `useEntitlements` — the entire digital-
 * goods rail, added in 0.59.0 — so the one page an author reads to find out what
 * survives a port told them goods did not exist. Nothing failed, and nothing
 * could: no check related the hand table to the package.
 *
 * WHY A PARITY CHECK HERE, WHEN check-no-hand-flag-tables.mjs ARGUES FOR DELETION
 * ------------------------------------------------------------------------------
 * That guard's subject is a hand-typed copy of GENERATED data — a flag table
 * duplicating `cli.json`, buying the reader nothing the generated page already
 * gives them, so deletion is the right trade. This table is not that. Its value
 * column is the REPLACEMENT DECISION for each hook (a route, "Keep — host UI",
 * "No route yet", "Not carried"), which is hand-authored knowledge that exists
 * nowhere upstream and cannot be generated. So the table has to stay, and the
 * only question is whether its KEYS are complete. That is what this checks — the
 * keys, never the values.
 *
 * It follows that "every new hook is a docs PR" is the CORRECT cost here, and is
 * the opposite of the flag-table case: a hook the package gains genuinely needs
 * somebody to decide what replaces it. A red run is a request for that decision.
 *
 * WHY check:pins CANNOT COVER THIS
 * --------------------------------
 * `check-appblocks-pins.mjs` watches whether the pinned devDep trails npm. On the
 * day this defect was found the pin was already at 0.59.0 — current, green — and
 * the page was still two hooks short. A version check sees version numbers; it
 * has no view of what a prose page enumerates. The two guards are disjoint.
 *
 * REPO-LOCAL, SO IT BLOCKS
 * ------------------------
 * Repo doctrine (see appblocks-drift.yml): upstream movement is SCHEDULED, a
 * repo-local invariant BLOCKS. This reads the pinned devDep already in the lock
 * file and a committed page — no network, nothing that can move underneath it
 * because a third party published something. It rides the `test-md-regions` job,
 * which already does the `npm ci` this needs.
 *
 * TWO POSITIVE CONTROLS, BECAUSE A CLEAN VERDICT IS A ZERO
 * -------------------------------------------------------
 * "0 missing hooks" is exactly what a guard wired to nothing prints:
 *
 *   1. EXTRACTOR CONTROL (is the .d.ts scan reading the right thing?) — the root
 *      hook set this script derives is cross-checked against
 *      `public/appblocks/hooks.json`, the artifact `<HooksReference />` and the
 *      generated markdown region are built from by a DIFFERENT mechanism
 *      (ts-morph, in gen-appblocks-hooks.mjs). Two independent readings of one
 *      package must agree; if they do not, this script's extractor is wrong and
 *      the run FAILS rather than grading the page against a bad list.
 *   2. FLOOR CONTROL (did it read anything?) — both the derived hook set and the
 *      parsed table must clear MIN_HOOKS. An empty parse of either side makes
 *      the symmetric difference vacuously empty, which is a serene pass over a
 *      page nobody checked.
 *
 * The table parse is fence-aware for the same reason every other scanner here is:
 * porting.md is full of ```tsx blocks, and a fence-blind row match would read
 * code as table rows.
 *
 * USAGE
 *   APPBLOCKS_SNAPSHOT_ONLY=1 npm run gen:appblocks   # hooks.json, for control 1
 *   npm run check:porting-hooks
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, resolvePackageRoot } from './appblocks-util.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const PAGE = 'apps/guide/porting.md';
const HOOKS_ARTIFACT = 'public/appblocks/hooks.json';

/**
 * FLOOR CONTROL. The package exported 39 hooks when this landed and the set has
 * only ever grown. A floor well below that still catches the failure mode it
 * exists for — a scan that returned nothing — without turning an upstream
 * REMOVAL into a mystery failure in the wrong guard. Raise it if you like;
 * never lower it to make a run green.
 */
const MIN_HOOKS = 30;

/**
 * Hook names exported from a `.d.ts` barrel's VALUE exports.
 *
 * `export type { … }` is deliberately excluded: a type named `UseGoodPurchase`
 * is not a hook, and including type exports would demand rows for things an
 * author cannot call. Handles `export { a as b }` by taking the exported name.
 */
function hookNamesFrom(dtsPath) {
  const src = readFileSync(dtsPath, 'utf8');
  const out = new Set();
  // `^export\s*\{` only — `export type {` does not match, which is the point.
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (/^use[A-Z]/.test(name)) out.add(name);
    }
  }
  return out;
}

/**
 * The hook names the page's replacement table lists, read from the FIRST cell of
 * each body row, outside any fenced code block.
 *
 * Fence tracking mirrors check-no-hand-flag-tables.mjs: porting.md carries ```tsx
 * blocks whose lines can start with `|`, and a fence-blind scan would take them
 * for rows. This is the simple opening/closing-run form rather than the full
 * CommonMark walk because the only thing downstream of it is a set of
 * backticked identifiers — a mis-parse cannot pass silently, it shows up as a
 * bogus name in the symmetric difference.
 */
function tableHooksIn(markdown) {
  const out = new Set();
  let fence = null;
  for (const line of markdown.split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1][0].repeat(f[1].length);
      else if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (!line.startsWith('|')) continue;
    const first = line.split('|')[1];
    if (first === undefined) continue;
    const m = /^\s*`(use[A-Za-z0-9]+)`\s*$/.exec(first);
    if (m) out.add(m[1]);
  }
  return out;
}

const sorted = (set) => [...set].sort();

function main() {
  const pkgRoot = resolvePackageRoot('@civitai/blocks-react');
  const version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;

  const rootHooks = hookNamesFrom(join(pkgRoot, 'dist', 'index.d.ts'));
  const uiHooks = hookNamesFrom(join(pkgRoot, 'dist', 'ui', 'index.d.ts'));
  const expected = new Set([...rootHooks, ...uiHooks]);

  // ── CONTROL 1: EXTRACTOR ──────────────────────────────────────────────────
  // hooks.json is the ROOT surface only (the generator reads dist/index.d.ts),
  // so it is compared against rootHooks, not against `expected`.
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(join(repoRoot, HOOKS_ARTIFACT), 'utf8'));
  } catch {
    log(
      `FAIL: ${HOOKS_ARTIFACT} is missing or unreadable — it is the control this guard ` +
        `grades its own extractor against.\n` +
        `      Run: APPBLOCKS_SNAPSHOT_ONLY=1 npm run gen:appblocks`,
    );
    process.exit(1);
  }
  const artifactHooks = new Set(
    (Array.isArray(artifact) ? artifact : (artifact.hooks ?? [])).map((h) => h.name),
  );
  const extractorDiff = [
    ...sorted(rootHooks).filter((n) => !artifactHooks.has(n)).map((n) => `+${n} (only in my scan)`),
    ...sorted(artifactHooks).filter((n) => !rootHooks.has(n)).map((n) => `-${n} (only in ${HOOKS_ARTIFACT})`),
  ];
  if (extractorDiff.length > 0) {
    log(
      `FAIL: this script's .d.ts scan disagrees with ${HOOKS_ARTIFACT}, which ts-morph built from\n` +
        `      the same package. THE EXTRACTOR IS WRONG — the page has not been graded at all.\n` +
        `      ${extractorDiff.join('\n      ')}`,
    );
    process.exit(1);
  }

  // ── CONTROL 2: FLOOR ──────────────────────────────────────────────────────
  const page = readFileSync(join(repoRoot, PAGE), 'utf8');
  const documented = tableHooksIn(page);
  if (expected.size < MIN_HOOKS) {
    log(
      `FAIL: derived only ${expected.size} hook(s) from @civitai/blocks-react@${version} ` +
        `(floor ${MIN_HOOKS}).\n` +
        `      A near-empty hook set makes the comparison below vacuous. The extractor or the ` +
        `package layout changed, not the package.`,
    );
    process.exit(1);
  }
  if (documented.size < MIN_HOOKS) {
    log(
      `FAIL: parsed only ${documented.size} hook row(s) out of ${PAGE} (floor ${MIN_HOOKS}).\n` +
        `      A near-empty parse makes the comparison below vacuous. The table's shape changed ` +
        `(or moved inside a fence), so nothing was actually checked.`,
    );
    process.exit(1);
  }

  // ── THE INVARIANT ─────────────────────────────────────────────────────────
  const missing = sorted(expected).filter((n) => !documented.has(n));
  const extra = sorted(documented).filter((n) => !expected.has(n));

  if (missing.length > 0 || extra.length > 0) {
    log(`FAIL: ${PAGE}'s hook table does not match @civitai/blocks-react@${version}.`);
    if (missing.length > 0) {
      log(
        `\n  EXPORTED BUT NOT IN THE TABLE (${missing.length}):\n    ${missing.join('\n    ')}\n` +
          `  An author porting off the bridge reads this table to find out what replaces each\n` +
          `  hook. A hook missing from it reads as "this does not exist" — which is how the\n` +
          `  whole digital-goods rail went undocumented. Add a row deciding what replaces it:\n` +
          `  a REST route, "**Keep**" + why, "**No route yet**", or "**Not carried**".`,
      );
    }
    if (extra.length > 0) {
      log(
        `\n  IN THE TABLE BUT NOT EXPORTED (${extra.length}):\n    ${extra.join('\n    ')}\n` +
          `  Either the package dropped it (say so in the row, or remove it) or the name is\n` +
          `  misspelled — a row nobody can act on.`,
      );
    }
    process.exit(1);
  }

  log(
    `ok: ${PAGE} documents all ${expected.size} hooks of @civitai/blocks-react@${version} ` +
      `(${rootHooks.size} root + ${uiHooks.size} on /ui), and no others ` +
      `[extractor agrees with ${HOOKS_ARTIFACT}]`,
  );
}

main();
