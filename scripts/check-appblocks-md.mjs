// PR-BLOCKING drift guard: the generated markdown-fallback regions in the
// committed App Blocks reference pages must match what the generator would
// write right now.
//
// WHY THIS BLOCKS A PR (and check:snapshots / check:pins do not).
// Repo doctrine: upstream movement is SCHEDULED, a REPO-LOCAL invariant BLOCKS.
// This is repo-local — the regions are rendered from artifacts this repo
// generates out of its own committed snapshots and pinned devDeps, so the guard
// cannot false-fail because someone else published something. What it catches is
// a contributor editing a page (or bumping a pin, or re-snapshotting) and not
// re-running the refresh step, which would silently re-open the exact defect
// the regions exist to close: the .md/LLM channel drifting away from the HTML.
//
// The failure this prevents is SILENT in the same way the CLI-omission one was —
// a stale region renders a perfectly healthy-looking page while the machine
// channel serves last month's hooks.
//
// It renders IN MEMORY and never writes, so it is safe on a read-only checkout.
//
// It ALSO enforces the `.md` SIZE BUDGET (MD_PAGE_BUDGET in
// .vitepress/theme/components/referenceSplit.shared.mjs; `APPBLOCKS_MD_BUDGET`
// overrides it, which is how the guard is shown red): every page carrying a
// generated region is served as a `.md` twin, and agent fetch tools truncate a
// long document silently. A page over budget fails here; the fix is a further
// split in referenceSplit.shared.mjs. Generated sub-pages are graded whole, and
// a sub-page file no group owns any more fails as an orphan.
//
// USAGE
//   APPBLOCKS_SNAPSHOT_ONLY=1 npm run gen:appblocks && npm run check:md-regions
//
// The env var is not optional garnish: it is exactly how .github/workflows/
// appblocks-md-regions.yml generates the artifacts, and appblocks-util.mjs
// otherwise prefers a sibling `civitai` checkout at ../civitai that the real dev
// layout HAS and CI does not. Omit it locally and you grade different bytes than
// CI will.
import { existsSync, readFileSync } from 'node:fs';
import { log } from './appblocks-util.mjs';
import {
  REFRESH_CMD,
  assertRegionInSlot,
  expectedPageText,
  orphanSubPages,
  pageBudget,
  pageChars,
  pagePath,
  regionBlock,
  renderAll,
  spliceRegion,
} from './appblocks-md.mjs';

/** First differing line, for an error message that points at something. */
function firstDiff(expected, actual) {
  const e = expected.split('\n');
  const a = actual.split('\n');
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if (e[i] !== a[i]) {
      return { line: i + 1, expected: e[i] ?? '(end of region)', actual: a[i] ?? '(end of region)' };
    }
  }
  return null;
}

/** The committed text of a region, markers included. */
function committedRegion(pageText, key) {
  // Splice a sentinel body in, then diff positions: cheaper and more robust than
  // duplicating the marker regexes here.
  const marked = spliceRegion(pageText, key, '\u0000SENTINEL\u0000');
  const probe = regionBlock(key, '\u0000SENTINEL\u0000');
  const at = marked.indexOf(probe);
  const head = marked.slice(0, at);
  const tail = marked.slice(at + probe.length);
  return pageText.slice(head.length, pageText.length - tail.length);
}

const rendered = await renderAll();
const budget = pageBudget();
const failures = [];
const sizes = [];
for (const { region, body } of rendered) {
  const path = pagePath(region);
  if (!existsSync(path)) {
    failures.push({ region, reason: `${region.page} does not exist — a generated sub-page was never written` });
    continue;
  }
  const pageText = readFileSync(path, 'utf8');

  // 🔴 SIZE BUDGET. Every page carrying a generated region is also served as a
  // `.md` twin, and agent fetch tools truncate a long document silently
  // (WebFetch cut apps/reference/hooks.md at character 99,961 when it was 166 KB).
  // Graded on the page the GENERATOR would write, so a stale page cannot hide
  // an over-budget render, and on the committed page, so a hand-padded one
  // cannot either. The fix is a further split in referenceSplit.shared.mjs.
  let expectedPage;
  try {
    expectedPage = expectedPageText(region, body, pageText);
  } catch (err) {
    failures.push({ region, reason: err.message });
    continue;
  }
  const chars = Math.max(pageChars(expectedPage), pageChars(pageText));
  sizes.push({ page: region.page, chars });
  if (chars > budget) {
    failures.push({
      region,
      reason:
        `${region.page} is ${chars} characters, over the ${budget}-character .md budget — agent fetch tools ` +
        `truncate a twin this long. Split its group further in .vitepress/theme/components/referenceSplit.shared.mjs`,
    });
    continue;
  }

  const expected = region.renderPage ? expectedPage : regionBlock(region.key, body);
  let actual;
  try {
    actual = region.renderPage ? pageText : committedRegion(pageText, region.key);
    // Structural half: content parity alone would stay green with the region
    // moved out of the slot, which is the one way this feature can regress the
    // HTML.
    assertRegionInSlot(pageText, region);
  } catch (err) {
    failures.push({ region, reason: err.message });
    continue;
  }
  if (actual !== expected) {
    const d = firstDiff(expected, actual);
    failures.push({
      region,
      reason:
        `${region.renderPage ? 'generated page' : `region '${region.key}'`} is STALE — the committed markdown differs from the generator's output` +
        (d
          ? `\n     first difference at ${region.renderPage ? 'page' : 'region'} line ${d.line}:\n` +
            `       committed: ${JSON.stringify(d.actual.slice(0, 160))}\n` +
            `       generated: ${JSON.stringify(d.expected.slice(0, 160))}`
          : ''),
    });
  } else {
    log(`md-regions: OK ${region.page} (region '${region.key}', ${chars} chars)`);
  }
}
for (const rel of orphanSubPages()) {
  failures.push({
    region: { page: rel, component: 'generated' },
    reason: 'a generated sub-page that no group in referenceSplit.shared.mjs owns — it would still be built and served',
  });
}

if (failures.length) {
  // eslint-disable-next-line no-console
  console.error(`\n❌ appblocks md-regions — ${failures.length} page(s) failed (stale, misplaced, or over the size budget):\n`);
  for (const f of failures) {
    // eslint-disable-next-line no-console
    console.error(`  ${f.region.page}: ${f.reason}`);
  }
  // eslint-disable-next-line no-console
  console.error(
    `\nThese regions are the ONLY copy of the <${failures[0].region.component}>-style island payload that reaches\n` +
      `the .md / llms-full.txt channel — a stale one ships an LLM-visible page that\n` +
      `contradicts the HTML. Fix with:\n\n` +
      // APPBLOCKS_SNAPSHOT_ONLY=1 is what CI grades with, and it is load-bearing
      // in the remedy: appblocks-util.mjs prefers a sibling `civitai` checkout at
      // ../civitai, which EXISTS in the real dev layout. Without the flag a
      // maintainer regenerates from live upstream source and commits bytes CI
      // then rejects — the guard sending them round the loop a second time.
      `    APPBLOCKS_SNAPSHOT_ONLY=1 npm run gen:appblocks && ${REFRESH_CMD}\n\n` +
      `then commit the page diff.\n`,
  );
  process.exit(1);
}

// Positive control on the size measurement: a zero-length page set would make
// "nothing over budget" a claim about nothing.
const largest = sizes.reduce((m, x) => (x.chars > m.chars ? x : m), { page: '(none)', chars: 0 });
if (!sizes.length || largest.chars === 0) {
  console.error('md-regions: measured no page sizes — the budget check saw nothing');
  process.exit(1);
}
log(
  `md-regions: all ${rendered.length} generated region(s) up to date; ${sizes.length} page(s) within the ` +
    `${budget}-character budget (largest: ${largest.page}, ${largest.chars})`,
);
