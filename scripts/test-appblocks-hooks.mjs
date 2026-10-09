#!/usr/bin/env node
// Regression tests for `descriptionHasTable` — the predicate that decides whether
// an upstream hook docstring is rendered in a <pre> (rows keep their own lines)
// or a <p> (rows collapse into one run of literal pipes).
//
//   node scripts/test-appblocks-hooks.mjs
//
// 🔴 WHY THIS FILE EXISTS, STATED AS THE MEASUREMENT THAT DEMANDED IT:
// civitai-developer-docs#80 round 3 restored the previous, NARROWER predicate
// into the generator and ran the full gate set — `check:built-site`,
// `check:md-regions`, `check:no-flag-tables` and `check:snapshots` were ALL
// GREEN. The page assertions in `check-built-site.mjs` pin the COMPONENT (a
// table-flagged hook must land in a <pre>), so when the predicate itself
// regresses, the flag and the page agree with each other and nothing is red.
// Those assertions cannot see this class by construction. This file is the only
// thing that can, so it asserts the predicate directly against LITERAL expected
// values — never against what the implementation happens to return.
//
// The corpus matters too: today exactly ONE upstream description carries a
// table, and its delimiter row is `|---|---|---|`. Every narrowing that still
// matches three columns is invisible to the real artifact. The fixtures below
// are deliberately shapes the live corpus does NOT contain.
import { descriptionHasTable } from './lib/description-has-table.mjs';
import { parseReadme, scanSections, splitSection, verifyPublished } from './lib/readme-hook-sections.mjs';
import { reflowNoteText } from '../.vitepress/theme/components/hookNotes.shared.mjs';
// Imported, NOT re-declared. An earlier version of the test below copied that
// file's `isTableRow` regex into a local const, which made its failure message —
// a claim about the SIBLING — a tautology about a local literal: deleting
// check-no-hand-flag-tables.mjs outright left this battery fully green.
//
// 🔴 Dynamic, and wrapped, because this file is step 1 of the `build-site` job
// and `build-site` is a required context. A bare static import of a file that
// has been retired or renamed kills the run with an unexplained
// ERR_MODULE_NOT_FOUND stack inside a job called "build-site", which tells the
// next maintainer nothing about what to do. Retiring that guard is a legitimate
// future action — its own header argues it will one day be unnecessary — so the
// failure needs to carry its own remedy.
let flagTablesIn;
let isDelimiterRow;
try {
  ({ flagTablesIn, isDelimiterRow } = await import('./check-no-hand-flag-tables.mjs'));
} catch (err) {
  // Two different failures reach here and they need different remedies, so do
  // NOT print one message for both: a module that cannot be RESOLVED is the
  // retirement case, while a module that resolves and throws while EVALUATING is
  // a broken sibling that is still wanted. An earlier version printed the
  // retirement remedy for both.
  const retired = err?.code === 'ERR_MODULE_NOT_FOUND';
  console.error(
    retired
      ? 'FAIL scripts/check-no-hand-flag-tables.mjs could not be resolved. If that guard was\n' +
        '     deliberately retired, delete the "no-outer-pipe" test below AND the paragraph in\n' +
        '     lib/description-has-table.mjs that cites it as the reason for not importing it. Do\n' +
        '     not silence this by re-declaring its regex locally — that is what it replaced.'
      : 'FAIL scripts/check-no-hand-flag-tables.mjs threw while loading. It still EXISTS, so this\n' +
        '     is not the retirement case — fix it there; the test below is only its reader.',
  );
  console.error(`     underlying error: ${err?.message}`);
  process.exit(1);
}
// 🔴 A RENAMED EXPORT DOES NOT THROW. ESM namespace destructuring yields
// `undefined`, so the catch above never runs and the run dies later inside a
// check with "flagTablesIn is not a function" — an error that names neither the
// file nor the remedy. The static import this replaced failed at LINK time with
// "does not provide an export named", which was at least legible; wrapping it
// took that away, so put it back explicitly.
for (const [name, fn] of [['flagTablesIn', flagTablesIn], ['isDelimiterRow', isDelimiterRow]]) {
  if (typeof fn !== 'function') {
    console.error(
      `FAIL scripts/check-no-hand-flag-tables.mjs loaded but exports no \`${name}\` function.\n` +
        '     It was renamed or removed rather than retired. Re-point the test below at its new\n' +
        '     name, and update the paragraph in lib/description-has-table.mjs that names it.',
    );
    process.exit(1);
  }
}

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── The table shapes GFM permits ─────────────────────────────────────────────
// Each carries the version of the predicate that MISSED it, so a future
// narrowing is legible as a regression against a named past bug rather than an
// abstract case.
const TABLES = [
  { why: 'two columns — the only shape the live corpus contains', md: 'prose\n\n| a | b |\n| --- | --- |\n| 1 | 2 |' },
  { why: 'ONE column — missed by the `(…)+` version, matched by the one before it', md: 'prose\n\n| check |\n| --- |\n| x |' },
  { why: 'a single dash per cell — GFM allows one or more', md: 'prose\n\n| a | b |\n|-|-|\n| 1 | 2 |' },
  { why: 'NO outer pipes — GFM permits it; `check-no-hand-flag-tables.mjs` cannot see this', md: 'prose\n\na | b\n--- | ---\n1 | 2' },
  { why: 'alignment colons, both sides', md: 'prose\n\n| a | b | c |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |' },
  { why: 'three columns — the live `useCollectionFollow` shape', md: 'prose\n\n| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |' },
  { why: 'leading whitespace before the row', md: 'prose\n\n  | a | b |\n  | --- | --- |' },
];

// ── Prose that must NOT be fenced ────────────────────────────────────────────
// A false positive is not harmless: it puts ordinary paragraphs into a <pre>,
// where they render as unwrapped monospace.
const NOT_TABLES = [
  { why: 'plain prose', md: 'Returns the current theme. Call it inside a block.' },
  { why: 'a bulleted list — hyphens, no pipes', md: 'Notes:\n- one\n- two\n- three' },
  { why: 'an em-dash sentence', md: 'It resolves — eventually — to a value.' },
  { why: 'a union type: pipes, no dashes', md: "Accepts `'light' | 'dark' | 'system'`." },
  { why: 'a shell pipeline: both chars, not a delimiter row', md: 'Run `npm ls | grep -c blocks` to check.' },
  { why: 'a horizontal rule', md: 'before\n\n---\n\nafter' },
  { why: 'a code fence drawing a box', md: 'Layout:\n```\n+---+---+\n```' },
  { why: 'empty', md: '' },
];

check('every GFM table shape is detected', () => {
  const missed = TABLES.filter((t) => descriptionHasTable(t.md) !== true);
  assert(
    missed.length === 0,
    `${missed.length} table shape(s) NOT detected — each would collapse on the page:\n` +
      missed.map((t) => `         - ${t.why}`).join('\n'),
  );
});

check('prose is never mistaken for a table', () => {
  const wrong = NOT_TABLES.filter((t) => descriptionHasTable(t.md) !== false);
  assert(
    wrong.length === 0,
    `${wrong.length} prose sample(s) WRONGLY detected as a table — these would be fenced ` +
      `into a <pre> and render as unwrapped monospace:\n` +
      wrong.map((t) => `         - ${t.why}`).join('\n'),
  );
});

check('null and undefined are answered, not thrown on', () => {
  assert(descriptionHasTable(undefined) === false, 'undefined should be false');
  assert(descriptionHasTable(null) === false, 'null should be false');
});

// ── NEGATIVE CONTROL — prove this file can go red ────────────────────────────
// Without this, a battery that silently stopped calling the predicate would
// report two cheerful `ok` lines. It re-implements each historical predicate and
// asserts the fixtures ABOVE catch it, so the corpus is proven able to separate
// the versions rather than merely agreeing with the current one.
// 🔴 COPIED FROM `git show 98acef0:scripts/gen-appblocks-hooks.mjs`, NOT FROM
// MEMORY. The first draft of this control reconstructed that regex by hand, and
// the hand-written version matched a one-column table — so it AGREED with the
// current predicate everywhere and the control failed, correctly, on its first
// run. That failure is the only reason this comment exists.
const HISTORICAL = [
  {
    name: 'the version committed at 98acef0 — its `(…)+` demands a SECOND dash-cell, so a one-column table never matched',
    fn: (d) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/m.test(String(d ?? '')),
  },
];

check('NEGATIVE CONTROL — the fixtures separate this predicate from the one it replaced', () => {
  for (const past of HISTORICAL) {
    const disagree = [...TABLES, ...NOT_TABLES].filter(
      (t) => past.fn(t.md) !== descriptionHasTable(t.md),
    );
    assert(
      disagree.length > 0,
      `the fixture corpus cannot tell the current predicate apart from "${past.name}". ` +
        `A battery that every historical version also passes proves nothing about this one — ` +
        `add a shape they disagree on.`,
    );
  }
});

// ── The documented disagreement with the sibling predicate ───────────────────
// `lib/description-has-table.mjs` states that it deliberately differs from
// `check-no-hand-flag-tables.mjs`'s `isDelimiterRow`, which is gated behind a
// leading-pipe test and so cannot see a no-outer-pipe table. An earlier comment
// claimed the two agreed. Pin the disagreement so it stays a decision.
// 🔴 THE SIBLING APPLIES ITS LEADING-PIPE RULE IN THREE PLACES, AND A TEST THAT
// WATCHES ONE OF THEM IS A FALSE GREEN WAITING TO HAPPEN. Two earlier versions
// of this test each watched a different single place and each MISSED a mutant
// the other caught — they were a trade, not successive improvements:
//
//   mutant                                    isDelimiterRow-only   flagTablesIn-only
//   widen isDelimiterRow's own gate                   RED                GREEN
//   open-code the two scanMarkdown gates             GREEN               GREEN
//   open-code all three                              GREEN                RED
//
// The middle row was green under BOTH, and a commit message claimed it red — it
// described a two-edit mutant while the run that produced the number had made
// three. So: assert every level, over every shape. They cost one line each.
check('the sibling predicate cannot reach a no-outer-pipe flag table, at any level', () => {
  assert(
    descriptionHasTable('a | b\n--- | ---\n1 | 2') === true,
    'this predicate must detect a no-outer-pipe table',
  );

  const STALE =
    'check-no-hand-flag-tables.mjs now DOES reach a no-outer-pipe shape. The two predicates no ' +
    'longer disagree, so the reason lib/description-has-table.mjs gives for not importing it is ' +
    'stale — re-check whether they can be unified, and update that comment either way. Shape: ';

  // LEVEL 1 — the exported helper, on the delimiter row alone.
  assert(!isDelimiterRow('--- | ---'), `${STALE}isDelimiterRow('--- | ---')`);

  // LEVEL 2 — the whole pipeline, over each of the three ways a flag table can
  // shed its outer pipes. `scanMarkdown` gates the header and the body rows
  // SEPARATELY, so a shape that unpipes only one of them is its own case.
  const SHAPES = [
    { why: 'header unpiped, delimiter and body piped', md: 'Flag | Description\n| --- | --- |\n| `--json` | print raw JSON |' },
    { why: 'body unpiped, header and delimiter piped', md: '| Flag | Description |\n| --- | --- |\n`--json` | print raw JSON' },
    { why: 'fully unpiped', md: 'Flag | Description\n--- | ---\n`--json` | print raw JSON' },
  ];
  const reached = SHAPES.filter((sh) => flagTablesIn(sh.md, '(fixture)').length > 0);
  assert(reached.length === 0, STALE + reached.map((sh) => sh.why).join('; '));

  // POSITIVE CONTROL for every `=== 0` above: prove flagTablesIn can return a
  // match at all, or those zeros are a function wired to nothing rather than a
  // reading. Differs from the shapes above in ONE dimension — the outer pipes.
  const withOuterPipes = '| Flag | Description |\n| --- | --- |\n| `--json` | print raw JSON |';
  assert(
    flagTablesIn(withOuterPipes, '(fixture)').length > 0,
    'flagTablesIn found nothing in a CONVENTIONAL hand-written flag table, so every zero above ' +
      'proves nothing. The sibling guard is not working — fix it there, not here.',
  );
});

// ── README section splitting (lib/readme-hook-sections.mjs) ─────────────────
// 🔴 The generator used to keep only the prose BEFORE a hook's first ```tsx fence
// and end a section only at the next `use…` heading. These fixtures pin the
// replacement's three properties — boundary, fence-awareness, order — and that
// the fail-loud guard (`verifyPublished`) goes red on the historical splitter.
const FENCE = '```';
const README_FIXTURE = [
  '## The hooks',
  '',
  '### `useAlpha()`',
  '',
  'Alpha lead.',
  '',
  `${FENCE}tsx`,
  'const a = useAlpha();',
  '}',
  FENCE,
  '',
  '🔴 **Alpha warning after the example.**',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  `${FENCE}bash`,
  '## not a heading — a shell comment inside a fence',
  '}',
  FENCE,
  '',
  '#### A deeper subheading stays with alpha',
  '',
  'Alpha tail.',
  '',
  '### `NotAHook`',
  '',
  'Interstitial text that belongs to no hook.',
  '',
  '### `useBeta()`',
  '',
  'Beta lead, no fence at all.',
  '',
  '## Testing',
  '',
  'A non-hook section after the hook list.',
].join('\n');

check('a hook section ends at the next same-or-higher heading, whatever its name', () => {
  const sections = scanSections(README_FIXTURE);
  assert(sections.map((s) => s.name).join(',') === 'useAlpha,useBeta', `sections: ${sections.map((s) => s.name)}`);
  const alpha = sections[0].tokens.map((t) => t.text).join('\n');
  const beta = sections[1].tokens.map((t) => t.text).join('\n');
  assert(!alpha.includes('Interstitial text'), 'useAlpha swallowed the `### NotAHook` section after it');
  assert(!beta.includes('A non-hook section'), 'useBeta swallowed the `## Testing` section after it');
  assert(alpha.includes('Alpha tail.'), 'a DEEPER (####) subheading wrongly ended useAlpha');
  assert(
    sections.interstitials.map((s) => s.heading).join('|') === '### `NotAHook`',
    `interstitials: ${JSON.stringify(sections.interstitials.map((s) => s.heading))}`,
  );
});

check('a `#` line inside a code fence is not a heading', () => {
  const alpha = scanSections(README_FIXTURE)[0].tokens.map((t) => t.text).join('\n');
  assert(alpha.includes('Alpha tail.'), 'the `## …` shell comment inside the bash fence ended the section');
});

check('lead, example and notes keep README order, with later fences as code segments', () => {
  const { prose, example, notes } = splitSection(scanSections(README_FIXTURE)[0].tokens);
  assert(prose === 'Alpha lead.', `prose: ${JSON.stringify(prose)}`);
  assert(example === 'const a = useAlpha();\n}', `example: ${JSON.stringify(example)}`);
  const shape = notes.map((n) => (n.kind === 'code' ? `code:${n.lang}` : 'text')).join(',');
  assert(shape === 'text,code:bash,text', `notes shape: ${shape}`);
  assert(notes[0].text.startsWith('🔴 **Alpha warning'), 'the 🔴 line after the example is not the first note');
  assert(notes[2].text.endsWith('Alpha tail.'), 'the deeper subsection is not in the last note');
  // No ```tsx fence: the whole section is the lead, and there are no notes.
  const beta = splitSection(scanSections(README_FIXTURE)[1].tokens);
  assert(beta.prose === 'Beta lead, no fence at all.' && beta.example === null && beta.notes.length === 0, `beta: ${JSON.stringify(beta)}`);
});

const entriesFrom = (byHook) =>
  Object.entries(byHook).map(([name, r]) => ({ name, description: r.prose ?? '', example: r.example ?? '', notes: r.notes ?? [] }));

check('verifyPublished is clean on what the splitter produces', () => {
  const problems = verifyPublished(scanSections(README_FIXTURE), entriesFrom(parseReadme(README_FIXTURE).byHook));
  assert(problems.length === 0, problems.join('; '));
});

// NEGATIVE CONTROL — the splitter this replaced, verbatim from origin/main at
// 1697554 (`git show 1697554:scripts/gen-appblocks-hooks.mjs`). The guard must
// name the hook it drops content from, and count the 🔴 line among the losses.
function historicalParseReadme(md) {
  const byHook = {};
  let current = null;
  let buf = [];
  const flush = () => {
    if (!current) return;
    const text = buf.join('\n');
    const fence = text.match(/```tsx\n([\s\S]*?)```/);
    const prose = text.slice(0, fence ? text.indexOf('```tsx') : text.length).trim();
    byHook[current] = { example: fence ? fence[1].replace(/\n+$/, '') : null, prose: prose || null };
  };
  for (const line of md.split('\n')) {
    const h = line.match(/^#{2,4}\s+`?(use[A-Za-z0-9]+)/);
    if (h) {
      flush();
      current = h[1];
      buf = [];
    } else if (current) buf.push(line);
  }
  flush();
  return byHook;
}

check('NEGATIVE CONTROL — verifyPublished goes red on the historical splitter, naming both defects', () => {
  const problems = verifyPublished(scanSections(README_FIXTURE), entriesFrom(historicalParseReadme(README_FIXTURE)));
  // useAlpha loses everything after its example (the 🔴 line among it); useBeta,
  // which has no fence, has the `## Testing` section run into its lead.
  assert(problems.length === 2, `expected two problems (useAlpha, useBeta), got ${problems.length}: ${problems.join('; ')}`);
  assert(/^useAlpha: \d+ line\(s\).*\(1 of them 🔴\)/.test(problems[0]), `problem does not name useAlpha and its 🔴 line: ${problems[0]}`);
  assert(/^useBeta: its published text contains 1 heading/.test(problems[1]), `problem does not name useBeta's boundary: ${problems[1]}`);
});

check('NEGATIVE CONTROL — verifyPublished goes red when another section is attached to a hook', () => {
  const byHook = parseReadme(README_FIXTURE).byHook;
  byHook.useAlpha.notes = [...byHook.useAlpha.notes, { kind: 'text', text: '### `NotAHook`\n\nInterstitial text that belongs to no hook.' }];
  const problems = verifyPublished(scanSections(README_FIXTURE), entriesFrom(byHook));
  assert(problems.length === 1 && /^useAlpha: its published text contains 1 heading/.test(problems[0]), `got: ${problems.join('; ')}`);
});

check('verifyPublished counts repeated lines — a second `}` cannot vanish behind the first', () => {
  const byHook = parseReadme(README_FIXTURE).byHook;
  // The bash fence's `}` duplicates the example's `}`. Drop the bash fence: a SET
  // would still find `}` (from the example) and report only the comment line.
  byHook.useAlpha.notes = byHook.useAlpha.notes.map((n) =>
    n.kind === 'code' ? { ...n, code: '## not a heading — a shell comment inside a fence' } : n,
  );
  const problems = verifyPublished(scanSections(README_FIXTURE), entriesFrom(byHook));
  assert(problems.length === 1 && /^useAlpha: 1 line\(s\)/.test(problems[0]) && problems[0].includes('"}"'), `got: ${problems.join('; ')}`);
});

// ── reflowNoteText — the island's display reflow of a text note ──────────────
// Literal expected strings: the page shows exactly this, and check:built-site
// compares the rendered HTML against the same function.
check('reflowNoteText joins hard-wrapped prose and keeps every structural line break', () => {
  const cases = [
    { why: 'a hard-wrapped paragraph joins', in: 'Constrain it only when the pick has\nto match the checkpoint.', out: 'Constrain it only when the pick has to match the checkpoint.' },
    { why: 'a blank line stays a paragraph break', in: 'one\ntwo\n\nthree', out: 'one two\n\nthree' },
    { why: 'list items stay one per line; a continuation joins its item', in: '- first item\n  continues here\n- second\n  - nested', out: '- first item continues here\n- second\n  - nested' },
    { why: 'numbered items stay one per line', in: '1. one\n2. two', out: '1. one\n2. two' },
    { why: 'table rows are never joined', in: '| a | b |\n|---|---|\n| 1 | 2 |', out: '| a | b |\n|---|---|\n| 1 | 2 |' },
    { why: 'a quote continuation joins with its `>` dropped', in: '> 🔴 **No leading slash.** The host\n> sends the segment.', out: '> 🔴 **No leading slash.** The host sends the segment.' },
    { why: 'a quote does not swallow the unquoted line after it', in: '> quoted\nplain', out: '> quoted\nplain' },
    { why: 'a markdown hard break (two spaces) is honoured', in: 'line one  \nline two', out: 'line one\nline two' },
    { why: 'a heading does not absorb the line under it', in: '#### Errors\nthe table below', out: '#### Errors\nthe table below' },
  ];
  const wrong = cases.filter((c) => reflowNoteText(c.in) !== c.out);
  assert(wrong.length === 0, wrong.map((c) => `${c.why}: got ${JSON.stringify(reflowNoteText(c.in))}`).join('\n       '));
});

console.log('');
if (failures) {
  console.log(`appblocks-hooks tests: ${failures} FAILED`);
  process.exit(1);
}
console.log('appblocks-hooks tests: all passed');
