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
 * GENERATED REGIONS ARE EXEMPT — THEY ARE THE THING THIS GUARD IS ASKING FOR
 * -------------------------------------------------------------------------
 * A `<!-- BEGIN GENERATED: <key> -->` … `<!-- END GENERATED: <key> -->` region
 * is not a hand-typed copy. It is written by `scripts/gen-appblocks-md.mjs` from
 * `public/appblocks/cli.json` — the SAME artifact `<CliReference />` renders, the
 * same artifact built from the binary's own `--help` — so that the `.md`/LLM
 * channel carries the island payload a browser gets from the Vue component. It
 * is pinned by `npm run check:md-regions`, which fails the moment a committed
 * region diverges from its generator.
 *
 * So the objection stated above — "nothing failed, because nothing related the
 * table to the binary" — is precisely what does NOT apply inside a region: the
 * region IS related to the binary, by generation, and the relationship is gated.
 * Scanning it would fire this guard on the generated reference itself and demand
 * the deletion of content it simultaneously tells the reader to go and read. The
 * hazard is a hand-maintained ENUMERATION nothing regenerates; a generated,
 * drift-guarded region is the remedy wearing the hazard's shape.
 *
 * Everything OUTSIDE the markers is scanned exactly as before. This narrows
 * WHERE the guard looks, never WHAT it objects to.
 *
 * 🔴 THE EXEMPTION MUST BE BALANCED, OR IT SILENTLY BLINDS THIS GUARD.
 * `inGenerated` is a sticky flag driven by a bare PREFIX match, so one stray or
 * typo'd BEGIN — or a DELETED END — swallows every remaining line of the file
 * and this guard reports `✓ no flag table` over content it never read. That is
 * not hypothetical: the identical exclusion in
 * `scripts/typecheck-appblocks-snippets.mjs` shipped without a balance
 * assertion, and one bogus BEGIN took that run from 31 snippets to 19 with a
 * green summary and EXIT 0 (fixed in ed46326; this file mirrors that fix).
 * `scanMarkdown()` therefore REFUSES on a nested BEGIN, an orphan END, or a
 * BEGIN still open at EOF, naming file, line and region key.
 *
 * THREE POSITIVE CONTROLS, BECAUSE A CLEAN VERDICT IS A ZERO
 * ---------------------------------------------------------
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
 *   3. REACH CONTROL (is the corpus still THERE?) — `MIN_SCANNED_PAGES` and
 *      `MIN_SCANNABLE_LINES` floors, checked after the scan. The balance
 *      assertion covers the marker CAUSE; these floors cover the CLASS — an
 *      emptied `CLI_PAGES`, a fence left open to EOF, a region legitimately
 *      widened until it swallows the page, any future narrowing of what gets
 *      read. Each would otherwise print a confident `✓ no flag table` over a
 *      corpus that is no longer there.
 *
 * 🔴 Note which invariant is NOT used: "tables examined". Measured on this tree
 * the CLI pages contain ZERO GFM tables outside their generated regions, so a
 * table-count floor would be pinned at 0 — satisfied by a scanner wired to
 * nothing, i.e. exactly the reassuring zero these controls exist to refuse.
 * Scannable LINES is the metric that moves when the reader stops reading.
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
 * REACH CONTROL — the floors that make a wholesale collapse impossible to
 * report as a pass. See "THREE POSITIVE CONTROLS" above for why a table-count
 * floor was rejected (it would be 0).
 *
 * A "scannable line" is one this scan actually CONSIDERS: outside every fence
 * and outside every generated region. Fenced content is deliberately excluded
 * from the count, and that choice is load-bearing rather than cosmetic — a
 * fenced block left unclosed to EOF is one of the collapses this floor exists
 * to catch, and it only moves the number if fenced lines do NOT count.
 *
 * DERIVATION — read off this script's own per-page output on the merged tree
 * (`origin/main` + the generated-markdown branch), 2026-08-07:
 *   site/guide/cli.md        283 scannable, 0 generated regions
 *   apps/reference/cli.md    105 scannable, 1 generated region (853 lines exempt)
 *   ------------------------------------------------------------------------
 *   TOTAL                    388 scannable lines across 2 pages
 *
 * The floor is 320, ~18% under today's real 388, and the headroom is bounded on
 * BOTH sides on purpose. Above it: 320 > 283, so losing the whole of
 * `apps/reference/cli.md` — the page whose 853-line region makes it the one a
 * widening region can swallow — still trips. Below it: a floor pinned at 388
 * would go red on the next paragraph anyone deletes, and a permanently-red gate
 * is one everybody learns to click through.
 *
 * Stated limit of the claim: a TOTAL floor cannot see a PARTIAL collapse of the
 * smaller page (105 → 40 still totals 323). The balance assertion in
 * `scanMarkdown` covers the marker cause directly; this floor covers the class.
 * A per-page floor would close that gap and is deliberately not used — it would
 * mean a second hand-maintained copy of `CLI_PAGES`, which is the duplication
 * bug this whole guard is about.
 *
 * Raise these deliberately as the pages grow; LOWER them deliberately, in the
 * same commit as the deletion and with the reason in the message. Never edit
 * either one to make a red run go green.
 */
export const MIN_SCANNED_PAGES = 2;
export const MIN_SCANNABLE_LINES = 320;

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
 * The generated-region markers, matched as a bare PREFIX exactly as
 * `scripts/appblocks-md.mjs` writes them and as
 * `scripts/typecheck-appblocks-snippets.mjs` reads them. A third spelling of
 * this pair would be the same duplication bug this guard is about, so the
 * regexes are kept character-identical to that file's.
 */
const GEN_BEGIN = /^<!-- BEGIN GENERATED: /;
const GEN_END = /^<!-- END GENERATED: /;
/** The region key, so an imbalance error names the marker, not just the file. */
const GEN_KEY = /^<!-- (?:BEGIN|END) GENERATED:\s*([^\s-]+)/;
const markerKey = (line) => GEN_KEY.exec(line)?.[1] ?? '(unnamed)';

/**
 * Scan a markdown document for first-column flag tables, skipping the contents
 * of balanced `BEGIN/END GENERATED` regions.
 *
 * Line ordering mirrors `extractBlocks` in
 * `scripts/typecheck-appblocks-snippets.mjs`: markers are recognised only
 * OUTSIDE a fence (so a fenced sample that merely SHOWS a marker cannot open a
 * region), then a region skips the line wholesale, then fences toggle, then
 * tables are detected. Line numbers stay 1-based over the ORIGINAL document —
 * nothing is stripped or re-indexed, so a reported line still points at the
 * offending row in the file.
 *
 * @param {string} markdown
 * @param {string} [file] Path used in imbalance errors.
 * @returns {{tables:{line:number, header:string, flagRows:string[]}[],
 *            scannableLines:number, generatedRegions:number,
 *            generatedLines:number}}
 * @throws {Error} on a nested BEGIN, an orphan END, or a BEGIN open at EOF.
 */
export function scanMarkdown(markdown, file = '(inline)') {
  const lines = markdown.split('\n');
  const found = [];
  let fenced = false;
  let inGenerated = false;
  let genLine = 0;
  let genKey = '';
  let scannableLines = 0;
  let generatedRegions = 0;
  let generatedLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!fenced && GEN_BEGIN.test(line)) {
      if (inGenerated) {
        throw new Error(
          `${file}:${i + 1} — nested "BEGIN GENERATED: ${markerKey(line)}" while region ` +
            `'${genKey}' (opened at line ${genLine}) is still open. Generated regions must ` +
            `be balanced: everything between BEGIN and END is EXEMPT from this check, so an ` +
            `unbalanced marker silently hides hand-maintained flag tables.`,
        );
      }
      inGenerated = true;
      generatedRegions++;
      generatedLines++;
      genLine = i + 1;
      genKey = markerKey(line);
      continue;
    }
    if (!fenced && GEN_END.test(line)) {
      if (!inGenerated) {
        throw new Error(
          `${file}:${i + 1} — "END GENERATED: ${markerKey(line)}" with no matching BEGIN. ` +
            `Generated regions must be balanced: a lone END means the BEGIN was deleted, ` +
            `which feeds a machine-written flag table into this check as if a human had ` +
            `typed it — the guard then demands the deletion of content it cannot fix.`,
        );
      }
      inGenerated = false;
      generatedLines++;
      continue;
    }
    if (inGenerated) {
      generatedLines++;
      continue;
    }

    if (isFence(line)) {
      fenced = !fenced;
      scannableLines++;
      continue;
    }
    if (fenced) continue;
    scannableLines++;

    // A table is a header row immediately followed by a delimiter row.
    if (!isDelimiterRow(line)) continue;
    const headerIdx = i - 1;
    if (headerIdx < 0 || !isTableRow(lines[headerIdx])) continue;

    const flagRows = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (isFence(lines[j])) break;
      if (!isTableRow(lines[j])) break;
      const cells = splitCells(lines[j]);
      if (cells.length && LONG_FLAG.test(cells[0])) flagRows.push(lines[j].trim());
      scannableLines++;
    }

    if (flagRows.length) {
      found.push({ line: headerIdx + 1, header: lines[headerIdx].trim(), flagRows });
    }
    i = j - 1;
  }

  if (inGenerated) {
    throw new Error(
      `${file} — unbalanced generated region: "BEGIN GENERATED: ${genKey}" at line ${genLine} ` +
        `is never closed by a matching "<!-- END GENERATED: … -->". Everything after it was ` +
        `EXEMPT from this check, so a hand-maintained flag table below that line would be ` +
        `skipped SILENTLY while the run still reports the page clean. Restore the END marker, ` +
        `or delete the stray BEGIN.`,
    );
  }

  return { tables: found, scannableLines, generatedRegions, generatedLines };
}

/**
 * Every first-column flag table in a markdown document, outside any balanced
 * generated region. Thin wrapper over `scanMarkdown` — the shape the control
 * corpus asserts against.
 *
 * @param {string} markdown
 * @param {string} [file]
 * @returns {{line:number, header:string, flagRows:string[]}[]} 1-based line
 *   numbers of each offending table's HEADER row.
 */
export function flagTablesIn(markdown, file) {
  return scanMarkdown(markdown, file).tables;
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
  // ---- generated-region exemption (both directions) ----
  {
    name: 'a flag table INSIDE a balanced generated region is exempt',
    expect: 0,
    md: [
      '<!-- BEGIN GENERATED: cli — do not edit by hand. -->',
      '',
      '| Flag | Description |',
      '|---|---|',
      '| `--json` | print the raw API JSON response |',
      '',
      '<!-- END GENERATED: cli -->',
      '',
    ].join('\n'),
  },
  {
    name: 'a hand table OUTSIDE the region on a page that HAS one still fires',
    expect: 1,
    md: [
      '<!-- BEGIN GENERATED: cli -->',
      '| Flag | Description |',
      '|---|---|',
      '| `--json` | generated |',
      '<!-- END GENERATED: cli -->',
      '',
      '### Download flags',
      '',
      '| Flag | Description |',
      '|---|---|',
      '| `--anon` | hand-typed, and still caught |',
      '',
    ].join('\n'),
  },
  {
    name: 'hand tables on BOTH sides of a region are both caught',
    expect: 2,
    md: [
      '| Flag | Description |',
      '|---|---|',
      '| `--before` | above the region |',
      '',
      '<!-- BEGIN GENERATED: cli -->',
      '| Flag | Description |',
      '|---|---|',
      '| `--json` | generated, exempt |',
      '<!-- END GENERATED: cli -->',
      '',
      '| Flag | Description |',
      '|---|---|',
      '| `--after` | below the region |',
      '',
    ].join('\n'),
  },
  {
    name: 'a BEGIN marker shown INSIDE a fence does not open a region',
    expect: 1,
    md: [
      '```markdown',
      '<!-- BEGIN GENERATED: cli -->',
      '```',
      '',
      '| Flag | Description |',
      '|---|---|',
      '| `--anon` | hand-typed, after a merely-quoted marker |',
      '',
    ].join('\n'),
  },
  {
    name: 'an END marker shown INSIDE a fenced sample does not close a real region',
    expect: 0,
    md: [
      '<!-- BEGIN GENERATED: cli -->',
      '```markdown',
      '<!-- END GENERATED: cli -->',
      '```',
      '| Flag | Description |',
      '|---|---|',
      '| `--json` | still inside the region |',
      '<!-- END GENERATED: cli -->',
      '',
    ].join('\n'),
  },
];

/**
 * BALANCE CONTROL. The exemption above is a sticky flag, so the three ways it
 * can be left open are the three ways this guard goes silently blind. Each
 * fixture must THROW, and the message must name the specific imbalance — a
 * refusal for the wrong reason is a mutation that dies to the wrong guard.
 */
export const BALANCE_CORPUS = [
  {
    name: 'a stray BEGIN that is never closed',
    match: /never closed by a matching/,
    md: ['# Page', '', '<!-- BEGIN GENERATED: bogus -->', '', 'text to EOF', ''].join('\n'),
  },
  {
    name: 'an orphan END whose BEGIN was deleted',
    match: /with no matching BEGIN/,
    md: ['# Page', '', '| Flag | D |', '|---|---|', '| `--x` | y |', '', '<!-- END GENERATED: cli -->', ''].join('\n'),
  },
  {
    name: 'a nested BEGIN inside an already-open region',
    match: /nested "BEGIN GENERATED/,
    md: [
      '<!-- BEGIN GENERATED: cli -->',
      'body',
      '<!-- BEGIN GENERATED: other -->',
      'body',
      '<!-- END GENERATED: other -->',
      '',
    ].join('\n'),
  },
];

/** Run the balance control. Returns a list of failure strings. */
export function runBalanceControl() {
  const failures = [];
  for (const c of BALANCE_CORPUS) {
    let thrown = null;
    try {
      scanMarkdown(c.md, '(fixture)');
    } catch (err) {
      thrown = err;
    }
    if (!thrown) {
      failures.push(`${c.name} — scanMarkdown ACCEPTED an unbalanced region instead of refusing`);
    } else if (!c.match.test(thrown.message)) {
      failures.push(`${c.name} — refused, but for the wrong reason: ${thrown.message.split('\n')[0]}`);
    }
  }
  return failures;
}

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

  // --- Balance control: the generated-region exemption must refuse when open. ---
  const balanceFailures = runBalanceControl();
  if (balanceFailures.length) {
    console.error(`  ✗ BALANCE CONTROL failed on ${balanceFailures.length}/${BALANCE_CORPUS.length} fixture(s):`);
    for (const f of balanceFailures) console.error(`      - ${f}`);
    console.error('    An unbalanced generated region that is ACCEPTED hides every flag table');
    console.error('    after it, under a green verdict. No verdict is reported on the pages below.');
    problems.push('balance-control');
  } else {
    console.log(
      `  ✓ balance control: ${BALANCE_CORPUS.length} unbalanced region(s) refused, each for its own reason`
    );
  }

  // --- Positive controls 2 + 3 and the actual scan. ---
  let pagesScanned = 0;
  let scannableTotal = 0;
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

    let scan;
    try {
      scan = scanMarkdown(text, rel);
    } catch (err) {
      console.error(`  ✗ ${rel} — scan refused (a generated-region marker is unbalanced):`);
      console.error(`      ${err.message}`);
      problems.push(`unbalanced-region:${rel}`);
      continue;
    }

    pagesScanned++;
    scannableTotal += scan.scannableLines;

    const { tables } = scan;
    // Report what was READ and what was EXEMPT, so a region quietly widening to
    // swallow the page is visible in the green output rather than only in the
    // floor that eventually trips.
    const reach =
      `${scan.scannableLines} line(s) scanned` +
      (scan.generatedRegions
        ? `, ${scan.generatedLines} exempt in ${scan.generatedRegions} generated region(s)`
        : '');
    if (!tables.length) {
      console.log(`  ✓ ${rel} — no flag table (${reach})`);
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
    console.error('');
    console.error('If the table is GENERATED — written by scripts/gen-appblocks-md.mjs from');
    console.error('public/appblocks/cli.json and pinned by `npm run check:md-regions` — then it');
    console.error('is not a hand-maintained copy and this guard should not see it: it belongs');
    console.error('between <!-- BEGIN GENERATED: <key> --> and <!-- END GENERATED: <key> -->,');
    console.error('which are exempt. Add the markers, do not delete the content.');
    console.error(`\nFailed: ${problems.join(', ')}`);
    process.exit(1);
  }

  // --- Positive control 3: did the scan still REACH the corpus? ---
  // Runs after the failure report so a real hand-typed table stays the headline,
  // but exits non-zero on its own: `no flag table` over a corpus that is no
  // longer there is the mode this guard is blind to by construction.
  const reachFailures = [];
  if (pagesScanned < MIN_SCANNED_PAGES) {
    reachFailures.push(
      `only ${pagesScanned} page(s) were scanned, expected at least ${MIN_SCANNED_PAGES} ` +
        `(CLI_PAGES, imported from check-cli-install-parity.mjs, currently lists ${CLI_PAGES.length})`
    );
  }
  if (scannableTotal < MIN_SCANNABLE_LINES) {
    reachFailures.push(
      `only ${scannableTotal} scannable line(s) were read across those pages, expected at ` +
        `least ${MIN_SCANNABLE_LINES}`
    );
  }
  if (reachFailures.length) {
    console.error('\n--- corpus out of reach (positive control) ---\n');
    for (const f of reachFailures) console.error(`  ✗ ${f}`);
    console.error('\nA clean verdict over a corpus this guard can no longer see is not a clean');
    console.error('verdict. The usual causes are a generated region widened until it swallows the');
    console.error('page, a fenced block left open to EOF, or CLI_PAGES losing an entry.');
    console.error('\nIf the pages legitimately shrank, lower MIN_SCANNED_PAGES /');
    console.error('MIN_SCANNABLE_LINES in scripts/check-no-hand-flag-tables.mjs in the SAME');
    console.error('commit, with the reason.');
    process.exit(1);
  }

  console.log(
    `\nNo hand-maintained flag tables. ` +
      `(${pagesScanned} page(s), ${scannableTotal} scannable line(s) — floors ` +
      `${MIN_SCANNED_PAGES}/${MIN_SCANNABLE_LINES})`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    console.error(`check-no-hand-flag-tables: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  }
}
