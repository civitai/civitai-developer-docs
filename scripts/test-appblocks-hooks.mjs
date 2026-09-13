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
// Imported, NOT re-declared. An earlier version of the test below copied that
// file's `isTableRow` regex into a local const, which made its failure message —
// a claim about the SIBLING — a tautology about a local literal: deleting
// check-no-hand-flag-tables.mjs outright left this battery fully green.
import { isDelimiterRow } from './check-no-hand-flag-tables.mjs';

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
check('the no-outer-pipe shape is exactly where the sibling predicate cannot reach', () => {
  const noOuter = 'a | b\n--- | ---\n1 | 2';
  assert(descriptionHasTable(noOuter) === true, 'this predicate must detect a no-outer-pipe table');
  assert(
    noOuter.split('\n').every((l) => !isDelimiterRow(l)),
    'check-no-hand-flag-tables.mjs now DOES reach the no-outer-pipe shape. The two predicates no ' +
      'longer disagree, so the reason lib/description-has-table.mjs gives for not importing it is ' +
      'stale — re-check whether they can be unified, and update that comment either way.',
  );
});

console.log('');
if (failures) {
  console.log(`appblocks-hooks tests: ${failures} FAILED`);
  process.exit(1);
}
console.log('appblocks-hooks tests: all passed');
