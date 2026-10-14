// Rewrite the generated markdown-fallback regions in the committed App Blocks
// reference pages — the .md/LLM channel's copy of what the Vue islands render.
//
// See scripts/appblocks-md.mjs for the defect, the slot mechanism, and why the
// regions render from the islands' own JSON artifacts.
//
// MAINTAINER REFRESH STEP — deliberately NOT wired into predev/prebuild, for the
// same reason as scripts/gen-appblocks-components.mjs: a build must never
// rewrite a committed file. Run it after anything that moves the underlying
// artifacts (a re-snapshot, an SDK/CLI pin bump, a schema change), then commit
// the page diff. `npm run check:md-regions` blocks a PR that forgot to.
//
// The JSON artifacts must exist first — they are gitignored and produced by
// `npm run gen:appblocks`, which this script does NOT run for you (keeping the
// two steps separate is what lets the drift guard grade a checkout without
// mutating it).
//
// USAGE
//   npm run gen:appblocks && npm run gen:appblocks:md
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { log, repoRoot } from './appblocks-util.mjs';
import {
  assertRegionInSlot,
  expectedPageText,
  inheritedPlacements,
  orphanSubPages,
  MD_PAGE_BUDGET,
  oversizedPages,
  pageChars,
  pagePath,
  renderAll,
} from './appblocks-md.mjs';

const rendered = await renderAll();
let changed = 0;
const sizes = [];
for (const { region, body } of rendered) {
  const path = pagePath(region);
  // A generated sub-page may not exist yet (a new group): the generator owns
  // the whole file, so it is created rather than spliced.
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (before === null && !region.renderPage) throw new Error(`md: ${region.page} does not exist`);
  // Refuse to write into a region that has escaped its island's slot — there it
  // would RENDER, duplicating the island on the page.
  if (before !== null && !region.renderPage) assertRegionInSlot(before, region);
  const after = expectedPageText(region, body, before);
  assertRegionInSlot(after, region);
  const chars = pageChars(after);
  sizes.push({ page: region.page, chars });
  if (after !== before) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, after);
    changed++;
    log(`md: ${before === null ? 'CREATED' : 'UPDATED'} ${region.page} (region '${region.key}', ${chars} chars)`);
  } else {
    log(`md: unchanged ${region.page} (region '${region.key}', ${chars} chars)`);
  }
}
// Sub-page directories are owned by this generator, so a page whose group was
// renamed or removed is deleted rather than left to be built and served stale.
for (const rel of orphanSubPages()) {
  rmSync(join(repoRoot, rel));
  changed++;
  log(`md: DELETED ${rel} (no group in referenceSplit.shared.mjs owns it)`);
}
for (const { kind, key } of inheritedPlacements()) {
  log(
    `md: NOTE ${kind} '${key}' has no explicit group — placed by inheritance. ` +
      `Name it in .vitepress/theme/components/referenceSplit.shared.mjs if that page is wrong.`,
  );
}
log(`md: ${changed} page(s) written or removed, ${rendered.length} region(s) rendered`);
const over = oversizedPages(sizes, MD_PAGE_BUDGET).map((s) => `${s.page} (${s.chars} > ${MD_PAGE_BUDGET})`);
if (over.length) {
  // Written anyway, so the maintainer can see the result — but `check:md-regions`
  // fails on it, so it cannot merge.
  console.error(
    `\n❌ ${over.length} page(s) exceed the ${MD_PAGE_BUDGET}-character .md budget:\n  ${over.join('\n  ')}\n` +
      'Split the group further in .vitepress/theme/components/referenceSplit.shared.mjs.\n',
  );
  process.exit(1);
}
