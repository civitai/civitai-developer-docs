// Does an upstream hook docstring contain a GFM table?
//
// 🔴 ONE RULE, ONE PLACE — and this module exists because the FIRST two attempts
// at it were open-coded predicates that disagreed with each other.
//
// The answer is needed by two channels that render independently:
// `gen-appblocks-hooks.mjs` stamps it into `hooks.json` (which the Vue island
// `<HooksReference>` reads), and `appblocks-md.mjs` writes the `.md` fallback
// region. civitai-developer-docs#80 fixed only the second — the island declares
// no `<slot />` and discards that region — so `check:md-regions` went green over
// a page that was still broken.
//
// History — and ONE version of it was ever committed, which is worth stating
// plainly because an earlier draft of this comment implied two:
//   • `98acef0` — `/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/m`. Its `(…)+`
//     demands a SECOND dash-cell, so a ONE-COLUMN table (`| check |` over
//     `| --- |`) never matched. `test-appblocks-hooks.mjs` pins that regex
//     verbatim as its negative control.
//   • Before it, within the same unlanded work, a pipe-counting draft that DID
//     match one column. It is in no commit — `git log -S` finds only the above —
//     so treat "it was narrower than its predecessor" as narrative, not as
//     something you can check out and run.
// Hence: split the row into CELLS and ask whether every one is a delimiter.
//
// ⚠ THIS DELIBERATELY DISAGREES WITH `check-no-hand-flag-tables.mjs`, and an
// earlier version of this comment claimed the opposite. That file's
// `isDelimiterRow` is reached only behind `isTableRow = /^\s*\|/`, so it cannot
// see a table written with NO outer pipes (`--- | ---`), which GFM permits and
// which this must catch. It also honours an escaped `\|`, which the `.split('|')`
// below does not. The two are NOT interchangeable — importing that one here
// would re-narrow this predicate. The disagreement is pinned as a fixture in
// `test-appblocks-hooks.mjs` so it stays a decision rather than a drift.
export function descriptionHasTable(description) {
  return String(description ?? '')
    .split('\n')
    .some((line) => {
      const t = line.trim();
      // A delimiter row is dashes, optional alignment colons, and pipes. It must
      // contain at least one of each, or every prose line with a hyphen matches.
      if (!t.includes('-') || !t.includes('|')) return false;
      const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|');
      return cells.every((c) => /^\s*:?-+:?\s*$/.test(c));
    });
}
