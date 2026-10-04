#!/usr/bin/env node
/**
 * check-goods-item-parity.mjs
 * ---------------------------
 * `apps/reference/manifest.md` documents the per-entry shape of a `goods` entry
 * in a HAND-MAINTAINED table, and nothing related that table to the schema. This
 * guard does: the table's key set must equal
 * `properties.goods.items.properties` in the canonical manifest schema.
 *
 * WHY A HAND TABLE EXISTS HERE AT ALL (it is not the flag-table mistake)
 * ---------------------------------------------------------------------
 * `scripts/gen-appblocks-manifest.mjs` emits the schema and `<JsonSchemaTable />`
 * renders TOP-LEVEL fields only. `goods` is an array of objects, so its per-entry
 * properties are one level below anything the generated region can express — the
 * page says so in its own words ("here is the per-entry shape it cannot expand").
 * Deleting the table in favour of a link, the remedy
 * `check-no-hand-flag-tables.mjs` prescribes, would leave the per-entry contract
 * documented NOWHERE. So the duplicate is justified, and the cost of a justified
 * duplicate is that something has to relate it to its source. That is this file.
 *
 * THE DRIFT THIS EXISTS TO STOP COMING BACK
 * -----------------------------------------
 * Measured 2026-10-04 on `origin/main`: the canonical carried SEVEN `goods.items`
 * properties and the table documented SIX. The missing one was `justification` —
 * and it is MANDATORY for a `kind: "app_unlock"` good
 * (`civitai:src/shared/constants/block-goods.constants.ts`, "justification is
 * required for an app_unlock good"). So the one key the table omitted was the one
 * an author declaring a paid app could not submit without, and the schema's own
 * `justification.description` had carried that sentence the whole time.
 *
 * 🔴 WHY NO EXISTING GUARD SAW IT — THE REASON THIS CHECK IS KEY-SET-SHAPED.
 * `check:manifest-parity` compares the SDK-bundled schema to the prod endpoint,
 * and `check:md-regions` compares a generated region to its generator. BOTH were
 * green throughout, correctly: neither one reads this table, and the generated
 * region genuinely did not change, because a NESTED property addition moves no
 * top-level field. A cardinality check at the wrong depth is a confident green
 * about a different question — `len(properties)` was 24 before and after.
 *
 * WHAT THIS CHECKS, AND THE LIMIT OF THAT CLAIM
 * ---------------------------------------------
 * The KEY SET, in both directions: a schema key absent from the table fails, and
 * a table row naming a key the schema does not have fails too (the second is how
 * a renamed property shows up).
 *
 * 🔴 It does NOT check the `Type`, `Required` or `Bound` cells. A row whose bound
 * is wrong — the exact second defect found on 2026-10-04, where `priceBuzz` read
 * "2–50000" while an `app_unlock` is capped at 5000 by the validator — PASSES
 * this guard. That is a real hole and it is stated rather than hidden, because
 * those cells are prose summaries of `description` text and pinning them would
 * mean asserting a normalised paragraph per row: a guard everybody edits to make
 * green, which is worse than none. The honest reading of a green run here is
 * "the table names every key and no others", never "the table is correct".
 *
 * THE SCHEMA COMES FROM THE GENERATOR'S OWN RESOLVER
 * -------------------------------------------------
 * `resolveSchema()` is imported from `gen-appblocks-manifest.mjs` rather than
 * reimplemented. It prefers the pinned, hermetic SDK-bundled copy and falls back
 * to the committed snapshot — and a second copy of that fallback would be free to
 * disagree with the generator about which schema is authoritative, producing a
 * verdict about a schema the page was never built from. No network: this is a
 * PR-blocking gate, and the 404-vs-network contract exists because guards that
 * reach out go red on infra. The snapshot's own agreement with live is a
 * different question, already owned by `check:manifest-parity`.
 *
 * THREE POSITIVE CONTROLS, BECAUSE A CLEAN VERDICT IS A ZERO
 * ---------------------------------------------------------
 * "0 mismatches" is what a scanner wired to nothing prints:
 *
 *   1. DETECTOR CONTROL — `CONTROL_CORPUS` drives `goodsTableKeysIn()` over
 *      fixtures that MUST yield a given key set and fixtures that must yield
 *      nothing, including the real six-row table verbatim. A detector that
 *      cannot reproduce the real table reports no verdict on the page.
 *   2. CORPUS CONTROL — the page must exist, be non-empty, carry a heading, and
 *      the `goods` bullet and its table must both be FOUND. A renamed page or a
 *      restructured bullet fails rather than scanning air and passing.
 *   3. SCHEMA CONTROL — the resolved schema must expose at least
 *      `MIN_SCHEMA_KEYS` `goods.items` properties. An empty or wrong-shaped
 *      schema otherwise yields an empty expected set, which an empty table
 *      "matches" — a zero on both sides is the reassuring zero to refuse.
 *
 * USAGE
 *   npm run check:goods-item-parity
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { repoRoot } from './appblocks-util.mjs';
import { isDelimiterRow, splitCells } from './check-no-hand-flag-tables.mjs';
import { resolveSchema } from './gen-appblocks-manifest.mjs';

/** The page carrying the hand-maintained per-entry table. */
export const GOODS_PAGE = 'apps/reference/manifest.md';

/**
 * SCHEMA CONTROL floor. The canonical currently declares 7 `goods.items`
 * properties (`id`, `title`, `priceBuzz`, `description`, `kind`, `payload`,
 * `justification`). The floor is 5, below today's 7 so an ordinary property
 * removal does not go red, and far enough above 0 that a schema resolved to the
 * wrong object — or to nothing — cannot present as a match against a table this
 * guard also failed to read. Lower it deliberately, in the same commit as the
 * removal, with the reason in the message.
 */
export const MIN_SCHEMA_KEYS = 5;

/** The bullet that introduces the per-entry table. */
const GOODS_BULLET = /^\s*-\s+\*\*`goods`\*\*/;

const isFence = (line) => /^\s*(```|~~~)/.test(line);
const isTableRow = (line) => /^\s*\|/.test(line);
const GEN_BEGIN = /^<!-- BEGIN GENERATED: /;
const GEN_END = /^<!-- END GENERATED: /;

/** Strip a cell down to the bare key it names: `` `id` `` -> `id`. */
export function cellKey(cell) {
  const m = /^`([A-Za-z_][A-Za-z0-9_]*)`/.exec(cell.trim());
  return m ? m[1] : null;
}

/**
 * The key set documented by the first GFM table after the `goods` bullet.
 *
 * Markers and fences are honoured in the same order as
 * `check-no-hand-flag-tables.mjs scanMarkdown`: a region is skipped wholesale, a
 * fenced sample that merely SHOWS a table cannot be mistaken for one, and the
 * bullet is only recognised outside both. Returns `null` when the bullet or its
 * table is not found at all — a different outcome from "found, and empty", and
 * the corpus control depends on being able to tell them apart.
 *
 * @param {string} markdown
 * @returns {{keys:string[], line:number}|null}
 */
export function goodsTableKeysIn(markdown) {
  const lines = markdown.split('\n');
  let fenced = false;
  let inGenerated = false;
  let seenBullet = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!fenced && GEN_BEGIN.test(line)) {
      inGenerated = true;
      continue;
    }
    if (!fenced && GEN_END.test(line)) {
      inGenerated = false;
      continue;
    }
    if (inGenerated) continue;

    if (isFence(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    if (!seenBullet) {
      if (GOODS_BULLET.test(line)) seenBullet = true;
      continue;
    }

    // First delimiter row after the bullet opens the table we want.
    if (!isDelimiterRow(line)) continue;
    const headerIdx = i - 1;
    if (headerIdx < 0 || !isTableRow(lines[headerIdx])) continue;

    const keys = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (!isTableRow(lines[j]) || isFence(lines[j])) break;
      const cells = splitCells(lines[j]);
      const key = cells.length ? cellKey(cells[0]) : null;
      if (key) keys.push(key);
    }
    return { keys, line: headerIdx + 1 };
  }
  return null;
}

/** The real table as it stands after the 2026-10-04 fix, for the detector control. */
const REAL_TABLE = [
  '- **`goods`** (enforced) — an optional **digital-goods catalog**:',
  '',
  '  | Key | Type | Required | Bound |',
  '  |---|---|---|---|',
  '  | `id` | `string` | required | pattern, 1–64 chars. |',
  '  | `title` | `string` | required | 1–80 chars. |',
  '  | `priceBuzz` | `integer` | required | **2–50000** whole Buzz. |',
  '  | `description` | `string` | optional | ≤ 500 chars. |',
  '  | `kind` | `"good" \\| "app_unlock"` | optional | Defaults to `"good"`. |',
  '  | `justification` | `string` | **required for `"app_unlock"`** | 1–500 chars. |',
  '  | `payload` | `object` | optional | Opaque; ≤ 2048 bytes. |',
  '',
].join('\n');

/**
 * `expect` is the exact key list `goodsTableKeysIn` must return, or `null` when
 * it must report "not found". Asserted in BOTH directions.
 */
export const CONTROL_CORPUS = [
  {
    name: 'the real 7-row table (verbatim, post-fix)',
    expect: ['id', 'title', 'priceBuzz', 'description', 'kind', 'justification', 'payload'],
    md: REAL_TABLE,
  },
  {
    name: 'the real table as it SHIPPED, missing `justification` (the measured drift)',
    expect: ['id', 'title', 'priceBuzz', 'description', 'kind', 'payload'],
    md: REAL_TABLE.split('\n')
      .filter((l) => !l.includes('`justification`'))
      .join('\n'),
  },
  {
    name: 'a table BEFORE the goods bullet is not the goods table',
    expect: ['blockId', 'version'],
    md: [
      '| Key | Type |',
      '|---|---|',
      '| `ignored` | `string` |',
      '',
      '- **`goods`** (enforced) — catalog:',
      '',
      '  | Key | Type |',
      '  |---|---|',
      '  | `blockId` | `string` |',
      '  | `version` | `string` |',
      '',
    ].join('\n'),
  },
  {
    name: 'a fenced table after the bullet is skipped, the real one still found',
    expect: ['id'],
    md: [
      '- **`goods`** (enforced) — catalog:',
      '',
      '  ```markdown',
      '  | Key | Type |',
      '  |---|---|',
      '  | `fenced` | `string` |',
      '  ```',
      '',
      '  | Key | Type |',
      '  |---|---|',
      '  | `id` | `string` |',
      '',
    ].join('\n'),
  },
  {
    name: 'a non-key first cell (prose) contributes no key',
    expect: ['id'],
    md: [
      '- **`goods`** (enforced) — catalog:',
      '',
      '  | Key | Type |',
      '  |---|---|',
      '  | `id` | `string` |',
      '  | see above | — |',
      '',
    ].join('\n'),
  },
  // ---- must report NOT FOUND ----
  {
    name: 'no goods bullet at all',
    expect: null,
    md: ['# Manifest', '', '- **`scopes`** — the permission list.', ''].join('\n'),
  },
  {
    name: 'a goods bullet with no table after it',
    expect: null,
    md: ['- **`goods`** (enforced) — catalog, described in prose only.', '', 'More prose.', ''].join('\n'),
  },
  {
    name: 'a goods bullet inside a generated region is not the hand table',
    expect: null,
    md: [
      '<!-- BEGIN GENERATED: manifest -->',
      '- **`goods`** (enforced) — catalog:',
      '',
      '  | Key | Type |',
      '  |---|---|',
      '  | `id` | `string` |',
      '<!-- END GENERATED: manifest -->',
      '',
    ].join('\n'),
  },
];

/** Run the detector control. Returns a list of failure strings. */
export function runDetectorControl() {
  const failures = [];
  for (const c of CONTROL_CORPUS) {
    const got = goodsTableKeysIn(c.md);
    if (c.expect === null) {
      if (got !== null) {
        failures.push(`${c.name} — expected NOT FOUND, detector returned [${got.keys.join(', ')}]`);
      }
      continue;
    }
    if (got === null) {
      failures.push(`${c.name} — expected [${c.expect.join(', ')}], detector reported NOT FOUND`);
      continue;
    }
    if (got.keys.join(',') !== c.expect.join(',')) {
      failures.push(`${c.name} — expected [${c.expect.join(', ')}], detector reported [${got.keys.join(', ')}]`);
    }
  }
  return failures;
}

function main() {
  console.log("`goods` per-entry table vs the canonical schema's goods.items — key-set parity\n");

  // --- Positive control 1: can the detector observe anything at all? ---
  const controlFailures = runDetectorControl();
  if (controlFailures.length) {
    console.error(`  ✗ DETECTOR CONTROL failed on ${controlFailures.length}/${CONTROL_CORPUS.length} fixture(s):`);
    for (const f of controlFailures) console.error(`      - ${f}`);
    console.error('    A detector that cannot reproduce the real table proves nothing about the');
    console.error('    page, so this run reports NO verdict on it.');
    process.exit(1);
  }
  console.log(`  ✓ detector control: ${CONTROL_CORPUS.length} fixture(s) exact, in both directions`);

  // --- Positive control 3: is the schema the one we think it is? ---
  const { schema, source } = resolveSchema();
  const itemProps = schema?.properties?.goods?.items?.properties;
  if (!itemProps || typeof itemProps !== 'object') {
    console.error('  ✗ SCHEMA CONTROL — the resolved schema exposes no properties.goods.items.properties.');
    console.error(`    Resolved from ${source}.`);
    console.error('    An absent expected set is "matched" by any table, including one this guard');
    console.error('    failed to read, so no verdict is reported.');
    process.exit(1);
  }
  const expected = Object.keys(itemProps).sort();
  if (expected.length < MIN_SCHEMA_KEYS) {
    console.error(
      `  ✗ SCHEMA CONTROL — only ${expected.length} goods.items propert(ies), expected at least ${MIN_SCHEMA_KEYS}.`
    );
    console.error(`    Resolved from ${source}. Found: ${expected.join(', ') || '(none)'}`);
    console.error('    If the schema legitimately shrank, lower MIN_SCHEMA_KEYS in this file in the');
    console.error('    SAME commit, with the reason.');
    process.exit(1);
  }
  console.log(`  ✓ schema control: ${expected.length} goods.items propert(ies) (floor ${MIN_SCHEMA_KEYS})`);
  console.log(`      from ${source}`);

  // --- Positive control 2 + the actual comparison. ---
  const abs = join(repoRoot, GOODS_PAGE);
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (err) {
    console.error(`  ✗ ${GOODS_PAGE} — could not be read (${err.code ?? err.message}).`);
    console.error('    A page this guard cannot open is not a page it found correct.');
    process.exit(1);
  }
  if (!text.trim() || !/^#{1,6}\s+\S/m.test(text)) {
    console.error(`  ✗ ${GOODS_PAGE} — empty, or contains no markdown heading.`);
    process.exit(1);
  }

  const found = goodsTableKeysIn(text);
  if (found === null) {
    console.error(`  ✗ ${GOODS_PAGE} — the \`goods\` bullet, or its per-entry table, was NOT FOUND.`);
    console.error('    This guard compares that table to the schema; if it cannot locate the table');
    console.error('    it has checked nothing. The usual causes are the bullet being reworded away');
    console.error('    from ``- **`goods`**``, or the table moving inside a generated region.');
    console.error('    If the per-entry shape is now GENERATED, delete this guard in that commit');
    console.error('    and say so — do not leave it passing over a table it no longer reads.');
    process.exit(1);
  }

  const documented = [...found.keys].sort();
  const missing = expected.filter((k) => !documented.includes(k));
  const extra = documented.filter((k) => !expected.includes(k));

  if (missing.length || extra.length) {
    console.error(`  ✗ ${GOODS_PAGE}:${found.line} — the per-entry table and the schema disagree:`);
    if (missing.length) {
      console.error(`      in the schema, ABSENT from the table: ${missing.join(', ')}`);
    }
    if (extra.length) {
      console.error(`      in the table, absent from the SCHEMA: ${extra.join(', ')}`);
    }
    console.error('\n--- goods.items TABLE DRIFT ---\n');
    console.error('A `goods` entry property the table omits is one an author cannot discover from');
    console.error('the reference. That is not hypothetical: the table shipped without');
    console.error('`justification`, which the platform validator REQUIRES for a');
    console.error('`kind: "app_unlock"` good, so the documented path to authoring a paid app ended');
    console.error('in a submit rejection the docs could not explain.');
    console.error(`\nRemedy: add a row per missing key to the table at ${GOODS_PAGE}:${found.line},`);
    console.error("taking the wording from that property's own `description` in the canonical");
    console.error('schema — it is written for an author and is the source this page summarises.');
    console.error('A key in the table but not the schema means the property was renamed or');
    console.error('removed upstream; delete or rename the row.');
    process.exit(1);
  }

  console.log(
    `  ✓ ${GOODS_PAGE}:${found.line} — all ${expected.length} key(s) documented, none extra ` +
      `(${documented.join(', ')})`
  );
  console.log('\ngoods.items key-set parity holds. NOTE: this checks the key SET only — a wrong');
  console.log('Type/Required/Bound cell passes. See the header for why.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    console.error(`check-goods-item-parity: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  }
}
