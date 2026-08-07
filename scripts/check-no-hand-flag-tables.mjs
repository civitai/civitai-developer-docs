#!/usr/bin/env node
/**
 * check-no-hand-flag-tables.mjs
 * -----------------------------
 * The hosted CLI pages must not hand-maintain a table of command flags. The
 * flag list is GENERATED from the binary's own `--help` output
 * (`scripts/gen-appblocks-cli.mjs` -> `public/appblocks/cli.json`, rendered by
 * `<CliReference />` on `apps/reference/cli.md`), so a second, hand-typed copy
 * has exactly one possible future: it drifts, silently, and the reader who
 * trusts it is the one who loses.
 *
 * THE DRIFT THIS EXISTS TO STOP COMING BACK
 * -----------------------------------------
 * `site/guide/cli.md` carried a `### Download flags` table of 12 rows. Measured
 * against the generated artifact on the day it was removed, `civitai download`
 * advertised **14** flags: the table was missing `--version` (download this
 * model-VERSION id explicitly, skipping the ambiguous-id safety stop) and
 * `--yes` (proceed past that safety stop). Both are about the SAFETY STOP for a
 * bare id that is both a model id and a version id — i.e. the drifted rows were
 * not cosmetic, they were the ones a reader hitting the stop needed. Nothing
 * failed. Nothing could: no check related the hand table to the binary.
 *
 * WHY DELETION RATHER THAN A PARITY CHECK
 * ---------------------------------------
 * A parity check between the hand table and `cli.json` is the obvious
 * alternative and it is the wrong trade: it keeps the duplicate alive, makes
 * every upstream flag addition a docs PR, and buys the reader nothing the
 * generated page does not already give them. One rule, one place — the flag
 * list lives where it is generated, and the guide LINKS to it.
 *
 * WHAT COUNTS AS A FLAG TABLE (AND THE LIMIT OF THAT CLAIM)
 * --------------------------------------------------------
 * A GFM table (header row, delimiter row, body rows) outside any fenced code
 * block, at least one of whose body rows has a long flag (`--json`,
 * `--out-dir`, …) in its FIRST cell. That is the shape every flag table in this
 * repo's history has had, and it is deliberately narrower than "a table
 * mentioning a flag":
 *
 *   - A prose table whose DESCRIPTION column happens to name `--cursor` is not
 *     a flag table and must not fire. Over-firing on the pagination-style
 *     tables elsewhere in the guide would make this a permanently-annoying gate
 *     — the kind everyone learns to click through.
 *   - 🔴 CONVERSELY: a flag table that puts the flag in column TWO is NOT
 *     detected. That is a real hole and it is stated rather than hidden. The
 *     honest reading of a green run here is "no first-column flag table", not
 *     "no duplicated flag documentation".
 *
 * Fence tracking is not optional — `site/guide/cli.md` and `apps/reference/cli.md`
 * both contain ```bash blocks full of `--flag` text, and a fence-blind scanner
 * that also matched non-table lines would fire on every one of them.
 *
 * TWO POSITIVE CONTROLS, BECAUSE A CLEAN VERDICT IS A ZERO
 * -------------------------------------------------------
 * "Found 0 flag tables" is exactly what a scanner wired to nothing prints, so
 * neither zero is trusted on its own:
 *
 *   1. DETECTOR CONTROL (can it ever observe?) — `CONTROL_CORPUS` drives
 *      `flagTablesIn()` over fixtures that MUST fire and fixtures that must NOT,
 *      including the real deleted table verbatim. If the must-fire cases return
 *      nothing, the run FAILS instead of reporting the pages clean. This also
 *      pins the must-NOT side, so a future widening that starts eating prose
 *      tables fails loudly here rather than in someone's PR.
 *   2. CORPUS CONTROL (did it read anything?) — each guarded page must exist,
 *      be non-empty, and contain at least one markdown heading. A renamed or
 *      moved page fails rather than scanning air and passing.
 *
 * SCOPE
 * -----
 * `CLI_PAGES` is imported from `check-cli-install-parity.mjs` rather than
 * re-listed: it is already this repo's answer to "which hosted pages document
 * the `civitai` binary", and two hand-maintained copies of that list is the
 * same duplication bug this guard is about. Adding a CLI page there covers it
 * here automatically.
 *
 * USAGE
 *   npm run check:no-flag-tables
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CLI_PAGES } from './check-cli-install-parity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

export { CLI_PAGES };

/** Where a reader is sent instead. Printed in the failure remedy. */
export const GENERATED_REFERENCE = '/apps/reference/cli';

/**
 * A long flag anywhere in a cell. Not anchored to the cell start: the real
 * table wrote `` `--layout <a1111\|comfyui>` `` and `` `--model <model-id>` ``,
 * so the cell is a code span plus an argument placeholder, not a bare token.
 * The leading boundary keeps it off `<!--` and off an em-dash-ish `--word`
 * inside prose that is not at a token start.
 */
const LONG_FLAG = /(^|[^\w-])--[a-z][a-z0-9-]*/;

const isFence = (line) => /^\s*(```|~~~)/.test(line);

/** A line that is structurally a GFM table row. */
const isTableRow = (line) => /^\s*\|/.test(line);

/**
 * Split a GFM row into cells, honouring `\|` escapes.
 *
 * 🔴 THE ESCAPE HANDLING IS LOAD-BEARING, not tidiness. The deleted table's
 * `--layout` row spelled its argument `<a1111\|comfyui>` — a naive
 * `row.split('|')` breaks that row into an extra cell and shifts every
 * subsequent one, which for a one-column-of-flags table means the flag lands in
 * cell 0 anyway and the bug hides. It would NOT hide on a row whose first cell
 * contained an escaped pipe. Pinned by a CONTROL_CORPUS case.
 */
export function splitCells(row) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '\\' && row[i + 1] === '|') {
      cur += '\\|';
      i++;
    } else if (c === '|') {
      cells.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  // Drop the empties produced by the leading and trailing pipes.
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

/** A GFM delimiter row: every cell is `---`, `:---`, `---:` or `:---:`. */
export function isDelimiterRow(line) {
  if (!isTableRow(line)) return false;
  const cells = splitCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

/**
 * Every first-column flag table in a markdown document.
 *
 * @param {string} markdown
 * @returns {{line:number, header:string, flagRows:string[]}[]} 1-based line
 *   numbers of each offending table's HEADER row.
 */
export function flagTablesIn(markdown) {
  const lines = markdown.split('\n');
  const found = [];
  let fenced = false;

  for (let i = 0; i < lines.length; i++) {
    if (isFence(lines[i])) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    // A table is a header row immediately followed by a delimiter row.
    if (!isDelimiterRow(lines[i])) continue;
    const headerIdx = i - 1;
    if (headerIdx < 0 || !isTableRow(lines[headerIdx])) continue;

    const flagRows = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (isFence(lines[j])) break;
      if (!isTableRow(lines[j])) break;
      const cells = splitCells(lines[j]);
      if (cells.length && LONG_FLAG.test(cells[0])) flagRows.push(lines[j].trim());
    }

    if (flagRows.length) {
      found.push({ line: headerIdx + 1, header: lines[headerIdx].trim(), flagRows });
    }
    i = j - 1;
  }

  return found;
}

/**
 * The detector's own test corpus. `expect` is the number of flag tables
 * `flagTablesIn` must report — asserted exactly, in BOTH directions.
 */
export const CONTROL_CORPUS = [
  {
    name: 'the real deleted `### Download flags` table (verbatim, 3 rows)',
    expect: 1,
    md: [
      '### Download flags',
      '',
      '| Flag | Description |',
      '|------|-------------|',
      '| `--model <model-id>` | Resolve + download a model default version. |',
      '| `--layout <a1111\\|comfyui>` | Route each file into its type subfolder. |',
      '| `--anon` | Force an anonymous request. |',
      '',
    ].join('\n'),
  },
  {
    name: 'the real deleted `## Shared flags` table (2 rows)',
    expect: 1,
    md: [
      '## Shared flags',
      '',
      '| Flag | Description |',
      '|------|-------------|',
      '| `--json` | Print the raw API JSON response. |',
      '| `--anon` | Force an anonymous request. |',
      '',
    ].join('\n'),
  },
  {
    name: 'a flag table with a non-"Flag" header (structural, not spelled)',
    expect: 1,
    md: ['| Option | Meaning |', '|---|---|', '| `--out-dir` | Where to write. |', ''].join('\n'),
  },
  {
    name: 'a bare flag with no code span',
    expect: 1,
    md: ['| Switch | Effect |', '|---|---|', '| --no-verify | Skip SHA256. |', ''].join('\n'),
  },
  {
    name: 'two separate flag tables in one document',
    expect: 2,
    md: [
      '| Flag | Description |',
      '|---|---|',
      '| `--json` | raw JSON |',
      '',
      'prose in between',
      '',
      '| Flag | Description |',
      '|---|---|',
      '| `--anon` | anonymous |',
      '',
    ].join('\n'),
  },
  // ---- must NOT fire ----
  {
    name: 'a fenced bash block full of flags (fence tracking)',
    expect: 0,
    md: [
      '```bash',
      'civitai download 128713 --all --out-dir ./models --no-verify',
      '| --this-is-not-a-table | but it starts with a pipe |',
      '|---|---|',
      '| --neither-is-this | nope |',
      '```',
      '',
    ].join('\n'),
  },
  {
    name: 'a prose table merely MENTIONING a flag in its description column',
    expect: 0,
    md: [
      '| Mode | How to page |',
      '|---|---|',
      '| Shallow | Use `--page`, capped at 1000 items. |',
      '| Deep | Use `--cursor` from `metadata.nextCursor`. |',
      '',
    ].join('\n'),
  },
  {
    name: 'prose naming flags with no table at all',
    expect: 0,
    md: '`models search` flags: `--query`, `--tag`, `--username`, `--limit`.\n',
  },
  {
    name: 'an HTML comment (`<!--`) is not a flag',
    expect: 0,
    md: ['| Note | Value |', '|---|---|', '| <!-- hidden --> | nothing |', ''].join('\n'),
  },
  {
    name: 'a table with no delimiter row is not a table',
    expect: 0,
    md: ['| `--json` | raw JSON |', '| `--anon` | anonymous |', ''].join('\n'),
  },
  {
    name: 'an escaped pipe in the FIRST cell still resolves to one cell',
    expect: 1,
    md: [
      '| Flag | Description |',
      '|---|---|',
      '| `--layout <a1111\\|comfyui>` | Route by type. |',
      '',
    ].join('\n'),
  },
];

/** Run the detector control. Returns a list of failure strings. */
export function runDetectorControl() {
  const failures = [];
  for (const c of CONTROL_CORPUS) {
    const got = flagTablesIn(c.md).length;
    if (got !== c.expect) failures.push(`${c.name} — expected ${c.expect} flag table(s), detector reported ${got}`);
  }
  return failures;
}

function main() {
  console.log('Hand-maintained flag tables — the flag list is GENERATED, there must be no second copy\n');

  const problems = [];

  // --- Positive control 1: can the detector observe anything at all? ---
  const controlFailures = runDetectorControl();
  const mustFire = CONTROL_CORPUS.filter((c) => c.expect > 0).length;
  if (controlFailures.length) {
    console.error(`  ✗ DETECTOR CONTROL failed on ${controlFailures.length}/${CONTROL_CORPUS.length} fixture(s):`);
    for (const f of controlFailures) console.error(`      - ${f}`);
    console.error('    A detector that cannot reproduce the real deleted tables proves nothing about');
    console.error('    the pages below, so this run reports NO verdict on them.');
    problems.push('detector-control');
  } else {
    console.log(
      `  ✓ detector control: ${CONTROL_CORPUS.length} fixture(s) exact — ` +
        `${mustFire} that MUST fire did, ${CONTROL_CORPUS.length - mustFire} that must not stayed silent`
    );
  }

  // --- Positive control 2 + the actual scan. ---
  for (const rel of CLI_PAGES) {
    let text;
    try {
      text = readFileSync(join(repoRoot, rel), 'utf8');
    } catch (err) {
      console.error(`  ✗ ${rel} — could not be read (${err.code ?? err.message}).`);
      console.error('    A page this guard cannot open is not a page it found clean.');
      problems.push(`unreadable:${rel}`);
      continue;
    }

    if (!text.trim() || !/^#{1,6}\s+\S/m.test(text)) {
      console.error(`  ✗ ${rel} — empty, or contains no markdown heading.`);
      console.error('    Scanning that yields zero findings for reasons unrelated to flag tables.');
      problems.push(`unscannable:${rel}`);
      continue;
    }

    const tables = flagTablesIn(text);
    const lineCount = text.split('\n').length;
    if (!tables.length) {
      console.log(`  ✓ ${rel} — no flag table (${lineCount} lines scanned)`);
      continue;
    }

    console.error(`  ✗ ${rel} — ${tables.length} hand-maintained flag table(s):`);
    for (const t of tables) {
      console.error(`      line ${t.line}: ${t.header}`);
      for (const r of t.flagRows.slice(0, 4)) console.error(`        ${r}`);
      if (t.flagRows.length > 4) console.error(`        … and ${t.flagRows.length - 4} more row(s)`);
    }
    problems.push(`flag-table:${rel}`);
  }

  if (problems.length) {
    console.error('\n--- HAND-MAINTAINED FLAG TABLE ---');
    console.error("\nThe flag list is generated from the binary's own help output into");
    console.error('public/appblocks/cli.json and rendered by <CliReference />. A hand-typed copy');
    console.error('cannot be kept in step with it: the last one lost `--version` and `--yes` on');
    console.error('`download` — the two flags that explain the ambiguous-id safety stop — and');
    console.error('nothing failed, because nothing related the table to the binary.');
    console.error(`\nRemedy: delete the table and link to ${GENERATED_REFERENCE} instead.`);
    console.error('If a flag genuinely needs narrative treatment, write it as prose in the');
    console.error('surrounding section — the objection is to an ENUMERATION that must be');
    console.error('maintained by hand, not to naming a flag.');
    console.error(`\nFailed: ${problems.join(', ')}`);
    process.exit(1);
  }

  console.log('\nNo hand-maintained flag tables.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    console.error(`check-no-hand-flag-tables: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  }
}
