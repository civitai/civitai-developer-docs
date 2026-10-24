#!/usr/bin/env node
// Pins the manifest reference's NESTED storage rows — the fields an author
// declares inside each `storage.collections.<name>` entry.
//
//   node scripts/test-appblocks-manifest.mjs
//
// WHY THIS EXISTS. <JsonSchemaTable> and its .md fallback used to list top-level
// manifest fields only, so `ownedModelVersions` (and every other per-collection
// field: `visibility`, `write`, `counters`, `marks`, `indexes`, `showAuthor`, …)
// appeared on the reference page nowhere but inside the one-cell `storage`
// description. check:md-regions could not see that: it compares the region with
// the generator, and both agreed on the omission.
//
// What is pinned, with LITERAL expected values (never re-derived from the code
// under test):
//   1. the ROWS — `manifestRows()` over the committed schema snapshot, the single
//      function both channels call (.vitepress/theme/components/manifestSchema.shared.mjs);
//   2. the .md CHANNEL — the committed region in apps/reference/manifest.md;
//   3. the SEAM — JsonSchemaTable.vue takes its rows from that same function, so
//      the HTML cannot quietly go back to a private top-level-only copy (the
//      built HTML itself is graded by check:built-site);
//   4. the SCOPE — only `storage` is expanded (iframe/page/goods/analytics are not).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot, snapshotsDir } from './appblocks-util.mjs';
import { manifestRows, EXPANDED_FIELDS } from '../.vitepress/theme/components/manifestSchema.shared.mjs';

let failures = 0;
function check(name, fn) {
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
function assertEqual(got, want, msg) {
  if (got !== want) throw new Error(`${msg} — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}

const schema = JSON.parse(readFileSync(join(snapshotsDir, 'manifest-schema.json'), 'utf8'));
const rows = manifestRows(schema);
const row = (field) => rows.find((r) => r.field === field);

const OMV = 'storage.collections.<name>.ownedModelVersions';
const OMV_CONSTRAINTS = 'minItems 1, maxItems 4, unique items, item pattern: ^(/[A-Za-z_][A-Za-z0-9_]{0,63}){1,4}$';
const VIS = 'storage.collections.<name>.visibility';

// ── 1. rows ──────────────────────────────────────────────────────────────────
check('ownedModelVersions row: type, required, bounds and item pattern', () => {
  const r = row(OMV);
  assert(r, `no ${OMV} row among ${rows.length} rows`);
  assertEqual(r.type, 'string[]', 'type');
  assertEqual(r.required, false, 'required');
  assertEqual(r.constraints, OMV_CONSTRAINTS, 'constraints');
  assert(r.description.startsWith('Shared collections with `write` "own" only.'), `description: ${r.description.slice(0, 80)}`);
});

check('visibility row: required within a collection, enum type', () => {
  const r = row(VIS);
  assert(r, `no ${VIS} row`);
  assertEqual(r.type, '"private" | "shared"', 'type');
  assertEqual(r.required, true, 'required');
  assertEqual(r.constraints, '', 'constraints');
});

check('collections map row carries its size bounds and key pattern', () => {
  const r = row('storage.collections');
  assert(r, 'no storage.collections row');
  assertEqual(r.required, true, 'required (within storage)');
  assertEqual(r.constraints, 'minProperties 1, maxProperties 16, key pattern: ^[a-z][a-z0-9_]{0,31}$', 'constraints');
});

check('counters / indexes rows: item exclusion and index value types', () => {
  assertEqual(
    row('storage.collections.<name>.counters')?.constraints,
    'maxItems 8, unique items, item pattern: ^[a-z][a-z0-9_]{0,31}$, item not: "report"',
    'counters constraints',
  );
  assertEqual(
    row('storage.collections.<name>.indexes')?.constraints,
    'maxProperties 4, key pattern: ^[A-Za-z][A-Za-z0-9_]{0,31}(\\.[A-Za-z][A-Za-z0-9_]{0,31}){0,2}$, values: "string" | "number" | "boolean" | "time"',
    'indexes constraints',
  );
});

check('nested rows sit directly after `storage`, in schema order', () => {
  const at = rows.findIndex((r) => r.field === 'storage');
  const nested = rows.slice(at + 1, rows.findIndex((r, i) => i > at && !r.field.startsWith('storage.')));
  assertEqual(
    nested.map((r) => r.field.replace('storage.collections.<name>.', '')).join(','),
    'storage.collections,kind,visibility,write,counters,marks,indexes,showAuthor,ttlSeconds,maxEntries,dailyWritesPerAuthor,ownedModelVersions',
    'nested row order',
  );
});

// ── 4. scope: only storage expands ───────────────────────────────────────────
check('only `storage` is expanded (iframe, page, goods, analytics stay one row)', () => {
  assertEqual(EXPANDED_FIELDS.join(','), 'storage', 'EXPANDED_FIELDS');
  const dotted = rows.filter((r) => r.field.includes('.')).map((r) => r.field);
  assert(dotted.every((f) => f.startsWith('storage.')), `unexpected nested rows: ${dotted.filter((f) => !f.startsWith('storage.'))}`);
  // Control: the schema DOES nest fields under iframe and page, so the absence above is a choice.
  assert(Object.keys(schema.properties.page.properties ?? {}).length > 0, 'control: page has nested properties');
});

// ── 2. the committed .md channel ─────────────────────────────────────────────
const page = readFileSync(join(repoRoot, 'apps', 'reference', 'manifest.md'), 'utf8');
const region = page.slice(page.indexOf('<!-- BEGIN GENERATED: manifest '), page.indexOf('<!-- END GENERATED: manifest -->'));
const mdRow = (field) => region.split('\n').find((l) => l.startsWith(`| \`${field}\` |`));

check('manifest.md region lists ownedModelVersions with its bounds and pattern', () => {
  assert(region.length > 0, 'no manifest region in apps/reference/manifest.md');
  const l = mdRow(OMV);
  assert(l, `apps/reference/manifest.md has no ${OMV} row`);
  assert(
    l.startsWith('| `storage.collections.<name>.ownedModelVersions` | `string[]` | optional | Shared collections with `write` "own" only.'),
    `row head: ${l.slice(0, 140)}`,
  );
  assert(l.endsWith(` \`${OMV_CONSTRAINTS}\` |`), `row tail: ${l.slice(-140)}`);
});

check('manifest.md region lists visibility as required with its enum', () => {
  const l = mdRow(VIS);
  assert(l, `apps/reference/manifest.md has no ${VIS} row`);
  assert(l.startsWith('| `storage.collections.<name>.visibility` | `"private" \\| "shared"` | required | Who can read the collection.'), `row: ${l.slice(0, 140)}`);
});

// ── 3. the seam: the island uses the shared rows ─────────────────────────────
check('JsonSchemaTable.vue renders manifestRows() from the shared module', () => {
  const vue = readFileSync(join(repoRoot, '.vitepress', 'theme', 'components', 'JsonSchemaTable.vue'), 'utf8');
  assert(/import \{[^}]*\bmanifestRows\b[^}]*\} from '\.\/manifestSchema\.shared\.mjs'/.test(vue), 'no manifestRows import from ./manifestSchema.shared.mjs');
  assert(/computed\(\(\) => manifestRows\(schema\)\)/.test(vue), 'rows are not computed by manifestRows(schema)');
  assert(!/function (typeText|constraintText)\b/.test(vue), 'the component defines its own typeText/constraintText again');
});

console.log(failures ? `\n${failures} check(s) FAILED` : `\nall manifest-table checks passed (${rows.length} rows)`);
process.exit(failures ? 1 : 0);
