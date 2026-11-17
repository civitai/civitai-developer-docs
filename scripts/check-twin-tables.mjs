// Asserts that every table in every `.md` twin and every `llms-full.txt` of the
// BUILT site has the same number of cells in every row as in its header.
//
// 🔴 THE GAP THIS CLOSES. `vitepress-plugin-llms` re-serializes every page
// without GFM, which drops the `\` from each `\|` outside a code span, so an
// escaped pipe inside a cell became a column separator in the twin while the
// HTML page rendered correctly. Measured on the live site 2026-11-17: 10 rows
// across 7 pages (e.g. `/site/reference/models.md`'s `checkpointType` row, 6
// cells under a 4-column header), in the twins and `/llms-full.txt` alike. The
// fix is `scripts/lib/twin-table-pipes.mjs`, run from `buildEnd`. This check
// deliberately does NOT import it: it counts cells the way GFM does, so the two
// can disagree.
//
// It also catches a SOURCE table whose cell holds an unescaped `|` (GFM splits
// cells before it parses code spans, so `a|b` inside backticks splits the cell
// too): one such row shipped in `site/oauth/register-app.md`.
//
// 🔴 A ZERO HERE MUST NOT BE A VACUOUS PASS: the counter self-tests on a fixture
// with a known ragged row, and the number of tables checked has a floor.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = process.argv[2] ?? '.vitepress/dist';
// Far below today's count (942 tables in the live /llms-full.txt, 2026-11-17):
// catches a walk or table detector gone to nothing, not page churn.
const MIN_TABLES = 200;

const FENCE = /^\s*(`{3,}|~{3,})/;
const DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** GFM cell count: split on every `|` not preceded by `\` (code spans included). */
export function cells(row) {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  let count = 1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '|') count++;
  }
  return count;
}

/** Every table row whose cell count differs from its header's, plus the table count. */
export function raggedRows(text) {
  const lines = text.split('\n');
  const bad = [];
  let tables = 0;
  let fence = null;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const m = line.match(FENCE);
    if (fence) {
      const t = line.trim();
      if (m && t[0] === fence[0] && /^(`+|~+)$/.test(t) && t.length >= fence.length) fence = null;
      continue;
    }
    if (m) {
      fence = m[1];
      continue;
    }
    const next = lines[k + 1];
    if (!line.trimStart().startsWith('|') || next === undefined || !DELIM.test(next) || !next.includes('-')) continue;
    tables++;
    const want = cells(line);
    let j = k + 2;
    for (; j < lines.length && lines[j].trimStart().startsWith('|'); j++) {
      const got = cells(lines[j]);
      if (got !== want) bad.push({ line: j + 1, want, got, row: lines[j] });
    }
    k = j - 1;
  }
  return { tables, bad };
}

{
  const fixture = [
    '| a | b |',
    '|---|---|',
    '| `x \\| y` | ok |',
    '| `x` | `y` | z |',
    '```',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 | 3 |',
    '```',
  ].join('\n');
  const r = raggedRows(fixture);
  if (r.tables !== 1 || r.bad.length !== 1 || r.bad[0].line !== 4 || r.bad[0].got !== 3) {
    console.error(`check-twin-tables: SELF_TEST failed — the table counter is broken: ${JSON.stringify(r)}`);
    process.exit(2);
  }
}

/** The `url:` in a leading frontmatter block, or null (re-implemented, not imported, as the header says). */
function ownUrl(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const m = text.slice(4, end).match(/^url:\s*['"]?([^'"\n]+?)['"]?\s*$/m);
  return m ? m[1] : null;
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && (e.name.endsWith('.md') || e.name === 'llms-full.txt')) out.push(p);
  }
  return out;
}

let tables = 0;
let files = 0;
const failures = [];
for (const p of walk(DIST)) {
  const rel = relative(DIST, p).split(sep).join('/');
  // `public/` copies (e.g. agent-setup/prompt.md) ship verbatim; only generated
  // twins carry a `url:` header naming themselves.
  const text = readFileSync(p, 'utf8');
  if (rel.endsWith('.md') && ownUrl(text) !== `/${rel}`) continue;
  files++;
  const r = raggedRows(text);
  tables += r.tables;
  for (const b of r.bad) failures.push(`/${rel}:${b.line}: ${b.got} cells under a ${b.want}-column header: ${b.row}`);
}

if (tables < MIN_TABLES) {
  console.error(`check-twin-tables: only ${tables} table(s) in ${files} file(s) under ${DIST} (floor ${MIN_TABLES}) — the walk or the detector is broken.`);
  process.exit(1);
}
if (failures.length > 0) {
  console.error(`check-twin-tables: ${failures.length} table row(s) whose cell count differs from the header:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`check-twin-tables: OK — ${tables} table(s) in ${files} file(s), every row matches its header`);
