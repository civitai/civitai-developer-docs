#!/usr/bin/env node
/**
 * check-cli-exit-codes.mjs
 * ------------------------
 * Every exit code these docs publish must match what the `civitai` binary
 * actually does.
 *
 * 🔴 WHY THIS EXISTS — THE DEFECT IT IS A REGRESSION GUARD FOR.
 * This site published a wrong one. `site/guide/cli.md` stated that
 * `civitai model-versions get 999999999 --json` exits **1**; the binary exits
 * **4**, and civitai/cli's README was correct the whole time. An exit code is a
 * SCRIPTING CONTRACT — a CI job branching on it takes the wrong arm — and it was
 * wrong in the damaging direction, because `1` reads as "generic failure, retry
 * or give up" where `4` means "this id does not exist, stop asking". Nothing in
 * either repository gated this site's page CONTENT against the binary.
 *
 * WHAT IS CHECKED — THREE LAYERS, TWO ARTIFACTS, NO NETWORK
 * ---------------------------------------------------------
 * Layer 1 · THE CODE SET. `appblocks-snapshots/civitai-cli-help.txt` is captured
 *   from a released binary and carries its `Exit codes:` block. Every exit code
 *   any page states must be one the binary documents. Catches an invented code
 *   (`exit 7`) and a code the CLI has retired.
 *
 * Layer 2 · THE CODE→MEANING BINDING. Every `### Exit code N` heading must open
 *   with a blockquote that is, whitespace-normalised, the binary's OWN one-line
 *   summary for N. Catches the shape where the number is real but the page has
 *   bound it to the wrong meaning ("exit 3 — not found"). The comparison is on
 *   the WHOLE normalised string, not a keyword, because a guard on words is
 *   walkable by rewording.
 *
 * Layer 3 · OBSERVED COMMAND→CODE. Every ```console block that ends in
 *   `$ echo $?` and a number is a claim about a specific invocation. Each is
 *   joined by its command line to `appblocks-snapshots/civitai-cli-exit-codes.txt`,
 *   which `npm run refresh:cli-exit-codes` writes by RUNNING the real binary over
 *   the closed registry in `scripts/lib/cli-exit-code-cases.mjs`. This is the
 *   layer that would have caught the defect above.
 *
 * 🔴 THE LIMIT OF THE CLAIM, STATED RATHER THAN HIDDEN.
 * This checks CODES. It does not check the per-code DETAIL prose on
 * `site/guide/cli-exit-codes.md` — that text has exactly one upstream source
 * (`internal/cmd/exitcodes_doc.go`'s `Detail` strings) and no artifact in this
 * repository carries it, because `civitai --help` deliberately renders `Summary`
 * only. So a green run here means "every code is real, every code→meaning
 * binding matches the binary, and every published transcript matches an
 * observed run" — NOT "the prose around them is accurate". A wrong sentence
 * beside a right number still passes. Closing that would mean capturing the
 * Detail strings into a fourth artifact; it is not done, and saying so is the
 * honest version.
 *
 * Layer 3 also only covers transcripts written in the `$ … / $ echo $? / N`
 * shape. A page asserting an exit code in prose alone is reached by layers 1
 * and 2 only.
 *
 * SCOPE
 * -----
 * The whole repository tree is walked, every extension, minus `SKIP_DIRS`.
 * `scripts/` is carved out because this file and its siblings must be free to
 * name a wrong code in a comment or a fixture — the carve-out is reported in
 * the output so it can never be silent.
 *
 * POSITIVE CONTROL
 * ----------------
 * A reassuring zero is indistinguishable from a walker wired to nothing, so
 * every layer reports a COUNT and every count that must be non-zero is asserted
 * to be non-zero. If the snapshot parse yields no codes, or the walk finds no
 * files, or no page states any exit code at all, this check FAILS rather than
 * printing a clean run.
 *
 * USAGE
 *   npm run check:cli-exit-codes
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const HELP_SNAPSHOT = join(REPO, 'appblocks-snapshots', 'civitai-cli-help.txt');
const OBSERVED = join(REPO, 'appblocks-snapshots', 'civitai-cli-exit-codes.txt');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.vitepress',
  'dist',
  'scripts',
  'appblocks-snapshots',
  'openapi-snapshots',
  'public',
]);

/** Minimum codes the help snapshot must yield, or its parse is broken. */
const MIN_DOCUMENTED_CODES = 5;

const errors = [];
const fail = (m) => errors.push(m);

// ---------------------------------------------------------------- artifacts

function parseDocumentedCodes() {
  let text;
  try {
    text = readFileSync(HELP_SNAPSHOT, 'utf8');
  } catch (err) {
    console.error(`✗ cannot read the CLI help snapshot: ${err.message}`);
    process.exit(1);
  }
  const block = /\nExit codes:\n([\s\S]*?)\n\s*Full ledger/.exec(text);
  if (!block) {
    console.error(
      '✗ no `Exit codes:` block in the CLI help snapshot. Either the capture is ' +
        'broken or the binary stopped printing one — either way this check cannot ' +
        'make its assertion, so it fails rather than passing vacuously.',
    );
    process.exit(1);
  }
  const summaries = new Map();
  let current = null;
  for (const line of block[1].split('\n')) {
    const head = /^ {4}(\d) {2}(.*)$/.exec(line);
    if (head) {
      current = Number(head[1]);
      summaries.set(current, head[2].trim());
    } else if (current !== null && /^ {7}\S/.test(line)) {
      summaries.set(current, `${summaries.get(current)} ${line.trim()}`);
    } else if (!line.trim()) {
      current = null;
    }
  }
  if (summaries.size < MIN_DOCUMENTED_CODES) {
    console.error(
      `✗ parsed only ${summaries.size} exit code(s) from the help snapshot ` +
        `(expected at least ${MIN_DOCUMENTED_CODES}). The parser is wrong or the ` +
        'capture changed shape; a small number here would make every later ' +
        'assertion vacuous.',
    );
    process.exit(1);
  }
  return summaries;
}

function parseObservedCases() {
  let text;
  try {
    text = readFileSync(OBSERVED, 'utf8');
  } catch {
    return null; // reported by the caller, with the remedy
  }
  const byCommand = new Map();
  for (const m of text.matchAll(/^===CASE (\S+)===\ncommand: (.*)\nexit: (\d+)$/gm)) {
    byCommand.set(m[2], { id: m[1], code: Number(m[3]) });
  }
  return byCommand;
}

// --------------------------------------------------------------------- walk

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile() && statSync(full).size < 4 << 20) {
      out.push(full);
    }
  }
  return out;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Split a markdown file into fenced-code and prose spans. */
function classifyLines(text) {
  const lines = text.split('\n');
  let fence = null;
  return lines.map((line) => {
    const f = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (f) {
      if (fence === null) {
        fence = { marker: f[1][0], len: f[1].length, info: f[2].trim() };
        return { line, inFence: true, opensFence: fence.info };
      }
      if (f[1][0] === fence.marker && f[1].length >= fence.len && !f[2].trim()) {
        fence = null;
        return { line, inFence: true, closesFence: true };
      }
    }
    return { line, inFence: fence !== null, fenceInfo: fence?.info };
  });
}

// ------------------------------------------------------------------- layers

const documented = parseDocumentedCodes();
const observed = parseObservedCases();

const files = walk(REPO, []);
if (files.length === 0) {
  console.error('✗ walked zero files — the walker is wired to nothing.');
  process.exit(1);
}

let inlineClaims = 0;
let headingChecks = 0;
let transcriptChecks = 0;

// Matches `exit 4`, `exits `4``, `exit code `2`` and `(exit 1 — …)`.
const INLINE = /\bexits?(?:\s+code)?\s+`?(\d+)`?/gi;

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!/exits?\s/i.test(text) && !/### Exit code/.test(text)) continue;
  const rel = relative(REPO, file);
  const rows = classifyLines(text);

  // --- Layer 1: every inline claim names a code the binary documents.
  rows.forEach((row, i) => {
    if (row.inFence) return;
    for (const m of row.line.matchAll(INLINE)) {
      const code = Number(m[1]);
      inlineClaims += 1;
      if (!documented.has(code)) {
        fail(
          `${rel}:${i + 1}: states exit code ${code}, which the CLI does not ` +
            `document. Documented codes: ${[...documented.keys()].join(', ')}. ` +
            `(line: ${row.line.trim().slice(0, 110)})`,
        );
      }
    }
  });

  // --- Layer 2: `### Exit code N` must quote the binary's own summary.
  rows.forEach((row, i) => {
    if (row.inFence) return;
    const h = /^###\s+Exit code (\d+)\s*$/.exec(row.line);
    if (!h) return;
    const code = Number(h[1]);
    headingChecks += 1;
    if (!documented.has(code)) {
      fail(`${rel}:${i + 1}: section for exit code ${code}, which the CLI does not document.`);
      return;
    }
    // Collect the blockquote that follows, skipping blank lines.
    let j = i + 1;
    while (j < rows.length && !rows[j].line.trim()) j += 1;
    const quote = [];
    while (j < rows.length && /^>\s?/.test(rows[j].line)) {
      quote.push(rows[j].line.replace(/^>\s?/, ''));
      j += 1;
    }
    if (quote.length === 0) {
      fail(
        `${rel}:${i + 1}: \`### Exit code ${code}\` must open with a blockquote ` +
          "carrying the binary's own summary for that code, so the page's " +
          'code→meaning binding is pinned to the CLI rather than to prose.',
      );
      return;
    }
    const got = norm(quote.join(' '));
    const want = norm(documented.get(code));
    if (got !== want) {
      fail(
        `${rel}:${i + 1}: the summary quoted for exit code ${code} is not the ` +
          `binary's.\n      page:   ${got}\n      binary: ${want}`,
      );
    }
  });

  // --- Layer 3: published transcripts must match an observed run.
  rows.forEach((row, i) => {
    if (!/^\s*\$\s*echo \$\?\s*$/.test(row.line)) return;
    if (!row.inFence) return;
    const next = rows[i + 1];
    if (!next || !/^\s*\d+\s*$/.test(next.line)) return;
    const claimed = Number(next.line.trim());
    // Walk back to the nearest `$ civitai …` line in the same fence.
    let k = i - 1;
    let command = null;
    while (k > 0 && !rows[k].opensFence) {
      const c = /^\s*\$\s+(civitai\s.*)$/.exec(rows[k].line);
      if (c) {
        command = c[1].trim();
        break;
      }
      k -= 1;
    }
    if (command === null) return;
    transcriptChecks += 1;
    if (observed === null) {
      fail(
        `${rel}:${i + 1}: transcript claims exit ${claimed} for \`${command}\`, but ` +
          `${relative(REPO, OBSERVED)} is missing. Run \`npm run refresh:cli-exit-codes\`.`,
      );
      return;
    }
    const hit = observed.get(command);
    if (!hit) {
      fail(
        `${rel}:${i + 1}: transcript for \`${command}\` has no observed run.\n` +
          '      Add it to scripts/lib/cli-exit-code-cases.mjs (it must be an ' +
          'offline, free refusal) and run `npm run refresh:cli-exit-codes`.',
      );
      return;
    }
    if (hit.code !== claimed) {
      fail(
        `${rel}:${i + 1}: page says \`${command}\` exits ${claimed}; the binary was ` +
          `observed exiting ${hit.code} (case ${hit.id}). The page is wrong, or the ` +
          'capture is stale — re-run `npm run refresh:cli-exit-codes` and look.',
      );
    }
  });
}

// ------------------------------------------------------------------ verdict

console.log(`civitai CLI exit codes — checked ${files.length} file(s)`);
console.log(`  skipped directories: ${[...SKIP_DIRS].sort().join(', ')}`);
console.log(
  `  layer 1 · documented code set: ${documented.size} code(s) from ` +
    `${relative(REPO, HELP_SNAPSHOT)}; ${inlineClaims} inline claim(s) checked`,
);
console.log(`  layer 2 · code→meaning bindings pinned to the binary: ${headingChecks}`);
console.log(
  `  layer 3 · published transcripts checked against observed runs: ${transcriptChecks}` +
    (observed === null ? ' (NO capture artifact)' : ` (capture holds ${observed.size})`),
);

if (inlineClaims === 0) {
  fail(
    'zero inline exit-code claims found across the whole tree. These docs ' +
      'certainly state exit codes, so a zero here means the matcher stopped ' +
      'matching — a silent pass, which is the failure this check exists to avoid.',
  );
}
if (headingChecks === 0) {
  fail(
    'zero `### Exit code N` sections found. The per-code ledger page is missing ' +
      'or renamed its headings, so layer 2 asserted nothing.',
  );
}
if (transcriptChecks === 0) {
  fail(
    'zero `$ echo $?` transcripts found. Layer 3 — the only layer that relates a ' +
      'COMMAND to a code — asserted nothing.',
  );
}

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    '\nThe binary is the authority. Fix the page, or — if the CLI genuinely ' +
      'changed — re-capture:\n' +
      '  npm run refresh:cli-snapshot     # the help text, incl. the code set\n' +
      '  npm run refresh:cli-exit-codes   # the observed command→code runs\n',
  );
  process.exit(1);
}

console.log('\n✓ every published exit code matches the CLI.');
