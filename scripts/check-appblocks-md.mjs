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
// USAGE
//   APPBLOCKS_SNAPSHOT_ONLY=1 npm run gen:appblocks && npm run check:md-regions
//
// The env var is not optional garnish: it is exactly how .github/workflows/
// appblocks-md-regions.yml generates the artifacts, and appblocks-util.mjs
// otherwise prefers a sibling `civitai` checkout at ../civitai that the real dev
// layout HAS and CI does not. Omit it locally and you grade different bytes than
// CI will.
import { readFileSync } from 'node:fs';
import { log } from './appblocks-util.mjs';
import {
  REFRESH_CMD,
  assertRegionInSlot,
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
const failures = [];
for (const { region, body } of rendered) {
  const path = pagePath(region);
  const pageText = readFileSync(path, 'utf8');
  const expected = regionBlock(region.key, body);
  let actual;
  try {
    actual = committedRegion(pageText, region.key);
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
        `region '${region.key}' is STALE — the committed markdown fallback differs from the generator's output` +
        (d
          ? `\n     first difference at region line ${d.line}:\n` +
            `       committed: ${JSON.stringify(d.actual.slice(0, 160))}\n` +
            `       generated: ${JSON.stringify(d.expected.slice(0, 160))}`
          : ''),
    });
  } else {
    log(`md-regions: OK ${region.page} (region '${region.key}')`);
  }
}

if (failures.length) {
  // eslint-disable-next-line no-console
  console.error(`\n❌ appblocks md-region drift — ${failures.length} page(s) out of date:\n`);
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

log(`md-regions: all ${rendered.length} generated region(s) up to date`);
