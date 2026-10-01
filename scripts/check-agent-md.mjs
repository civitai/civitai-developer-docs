// Asserts that every `.md` twin this site emits actually carries CONTENT.
//
// 🔴 THE GAP THIS CLOSES. `vitepress-plugin-llms` emits one `.md` per page, and
// that twin is how every AI agent reads this site — the `civitai` CLI's
// generated `AGENTS.md` tells agents in as many words that "the `.md` suffix
// serves the plain-text source an agent can read directly", and `/llms.txt`
// indexes the twins, not the HTML. Nothing asserted the twins were non-empty.
//
// Measured on the live site 2026-09-30, before this check existed:
//
//     /apps.md            23 bytes
//     /orchestration.md   32 bytes
//
// Both were frontmatter and nothing else. The cause is that `apps/index.md` and
// `orchestration/index.md` are `layout: home` pages whose entire content lives
// in the `hero:` and `features:` frontmatter keys — and the twin strips
// frontmatter. So the two natural entry points for "what is this section",
// both listed in `/llms.txt`, served an agent a blank page while the HTML
// rendered a full hero. `site/index.md` was unaffected precisely because it is
// an ordinary page with a markdown body, which is the shape this check pins.
//
// It is a CONTENT floor, not a byte floor on the file: frontmatter is stripped
// before measuring, because a page can carry a large `hero:` block and still be
// empty to a reader that never sees it. That is the exact defect.
//
// 🔴 A ZERO HERE MUST NOT BE A VACUOUS PASS. If the dist glob ever stops
// matching — a plugin change, a renamed output dir — walking zero files would
// report success while checking nothing. So this asserts a non-zero FLOOR on
// the number of twins found, the same discipline `check-built-site.mjs` uses.
// The floor is deliberately far below the real count (127 unique pages as of
// 2026-09-30) so ordinary page churn never reddens it; it exists to catch a
// glob that has gone to nothing, not to track the page count.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = '.vitepress/dist';

// A twin below this many characters of post-frontmatter, non-whitespace body is
// treated as empty. The two known-bad pages measured 0. The smallest legitimate
// twin on the live site was /orchestration/guide.md at ~1.3 KB, so 200 sits an
// order of magnitude below the real floor and well above the defect.
const MIN_BODY_CHARS = 200;

// See the header: this guards against a glob that matches nothing, not against
// page-count drift.
const MIN_TWINS = 50;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// Strip a leading YAML frontmatter block, the way the twin's own reader would
// see it. Only a block that starts on the very first line counts — a `---`
// further down is a horizontal rule, and treating one as frontmatter would
// silently eat real body text.
function body(text) {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return text;
  return text.slice(end + 4);
}

let twins;
try {
  statSync(DIST);
  twins = walk(DIST);
} catch {
  console.error(`check-agent-md: no build output at ${DIST} — run \`npm run build\` first.`);
  process.exit(2);
}

if (twins.length < MIN_TWINS) {
  console.error(
    `check-agent-md: found only ${twins.length} .md twin(s) under ${DIST}, expected at least ${MIN_TWINS}.`,
  );
  console.error(
    'check-agent-md: that is a BROKEN SEARCH, not a clean result — a pass computed over ' +
      'zero files would assert nothing. Check that vitepress-plugin-llms still emits twins here.',
  );
  process.exit(1);
}

const empty = [];
for (const p of twins) {
  const raw = readFileSync(p, 'utf8');
  const chars = body(raw).replace(/\s+/g, '').length;
  if (chars < MIN_BODY_CHARS) empty.push([relative(DIST, p), chars, raw.length]);
}

if (empty.length) {
  console.error(
    `check-agent-md: ${empty.length} of ${twins.length} .md twin(s) carry no usable body ` +
      `(< ${MIN_BODY_CHARS} non-whitespace chars after frontmatter):\n`,
  );
  for (const [p, chars, total] of empty) {
    console.error(`  /${p}  —  ${chars} body chars (file is ${total} B, so it is ~all frontmatter)`);
  }
  console.error(
    '\ncheck-agent-md: an agent fetching that URL gets a blank page while the HTML renders fine.\n' +
      'If the page is `layout: home`, its hero/features live in frontmatter and the twin strips\n' +
      'them — give the page a markdown body below the frontmatter (see site/index.md, or the\n' +
      '"Where to start" sections on apps/index.md and orchestration/index.md).',
  );
  process.exit(1);
}

console.log(`check-agent-md: OK — ${twins.length} .md twin(s), all carry a body.`);
