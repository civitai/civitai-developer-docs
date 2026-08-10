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
import { readFileSync, writeFileSync } from 'node:fs';
import { log } from './appblocks-util.mjs';
import { assertRegionInSlot, pagePath, renderAll, spliceRegion } from './appblocks-md.mjs';

const rendered = await renderAll();
let changed = 0;
for (const { region, body } of rendered) {
  const path = pagePath(region);
  const before = readFileSync(path, 'utf8');
  // Refuse to write into a region that has escaped its island's slot — there it
  // would RENDER, duplicating the island on the page.
  assertRegionInSlot(before, region);
  const after = spliceRegion(before, region.key, body);
  if (after !== before) {
    writeFileSync(path, after);
    changed++;
    log(`md: UPDATED ${region.page} (region '${region.key}', ${body.split('\n').length} lines)`);
  } else {
    log(`md: unchanged ${region.page} (region '${region.key}')`);
  }
}
log(`md: ${changed} of ${rendered.length} page region(s) rewritten`);
