// Asserts that every internal link in every `.md` twin resolves to a page that
// EXISTS in the built site, when resolved against each URL the twin is SERVED at.
//
// 🔴 THE GAP THIS CLOSES. `vitepress-plugin-llms` names a section index's twin
// after its directory — `apps/guide/index.md` becomes `/apps/guide.md`, the URL
// `/llms.txt` advertises — but kept the source's RELATIVE links, written
// against `apps/guide/`. Read from `/apps/guide.md`, `](./sdk)` resolved to
// `/apps/sdk`, which does not exist; the right target is `/apps/guide/sdk`.
// Measured live 2026-10-11: 127 such links across the advertised index twins
// (apps/guide 11, apps/reference 14, orchestration/recipes 48, site/guide 15, …),
// while the HTML pages — what every human reviewer looks at — were correct.
// `check:agent-md` could not see it: every one of those twins carries a body.
//
// The fix is `scripts/lib/twin-links.mjs`, run from the VitePress `buildEnd`
// hook. This check deliberately does NOT import it: it resolves links with
// WHATWG `new URL(target, servedUrl)` — what an agent's HTTP client does —
// rather than with the rewriter's path arithmetic, so the two can disagree.
//
// WHAT "SERVED AT" MEANS. A twin's own path (which is what `/llms.txt` lists),
// AND the `/<stem>/index.md` alias: `nginx.conf`'s `location ~ ^(.+)/index\.md$`
// serves EVERY twin there (`/apps/guide/sdk/index.md` -> `apps/guide/sdk.md`),
// not just section indexes. Before the fix the two URLs disagreed for every twin
// that carried a relative link — an index twin broke at its advertised URL, any
// other twin at its alias — which is why the fix absolutizes ALL twins and why
// this checks both URLs for all of them.
//
// WHAT IS CHECKED. Relative links AND root-absolute ones: a rewriter that turned
// `./sdk` into a confident but wrong `/apps/sdk` would leave zero relative links
// behind, so checking only relative links would pass the very regression it
// exists for. Skipped: other schemes/hosts, `#same-page` anchors, and anything
// inside a fenced code block or an inline code span. Anchors on an existing page
// are NOT validated — this asserts the PAGE exists.
//
// ALSO `llms-full.txt` (see "llms-full.txt bundles" below): the plugin's
// concatenation of every page, where a relative link is a defect outright.
//
// ALSO that every published page sits in an allowlisted section (`SECTIONS`).
//
// 🔴 A ZERO HERE MUST NOT BE A VACUOUS PASS. `PARSER_SELF_TEST` runs on every
// invocation (the matcher must find exactly the links a fixture plants), and
// floors on the twin and link counts catch a glob or matcher that has gone to
// nothing.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = process.argv[2] ?? '.vitepress/dist';
const ORIGIN = 'https://developer.civitai.com';

/**
 * Written relative = no scheme and not root-absolute. `scripts/lib/agent-surface.mjs`
 * makes internal page links ABSOLUTE `https://developer.civitai.com/…​.md` URLs, which
 * are internal (same origin, checked for existence below) but not relative.
 */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
export const isWrittenRelative = (target) => !target.startsWith('/') && !SCHEME.test(target);

/**
 * The twin with its one-line index note (inserted after the frontmatter by
 * `scripts/lib/agent-surface.mjs`) removed — the note is in every twin and in no
 * llms-full.txt section, by design. Re-implemented here rather than imported, for
 * the reason the header gives. `check:agent-surface` asserts every twin HAS it.
 */
export const stripIndexNote = (text) => text.replace(/^(---\n[\s\S]*?\n---\n)\n> Documentation index: [^\n]*\n/, '$1');

// Floors, far below today's counts (136 twins / 1,000+ internal links as of
// 2026-10-11): they catch a broken search, not page churn.
const MIN_TWINS = 50;
const MIN_LINKS = 300;

// ── link extraction ──────────────────────────────────────────────────────────

/** Drop fenced code blocks; return the remaining prose lines. */
function proseLines(text) {
  const out = [];
  let fence = null;
  for (const line of text.split('\n')) {
    const open = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const t = line.trim();
      if (open && t[0] === fence[0] && /^(`+|~+)$/.test(t) && t.length >= fence.length) fence = null;
      continue;
    }
    if (open) {
      fence = open[1];
      continue;
    }
    out.push(line);
  }
  return out;
}

/** Remove inline code spans (matched backtick runs of equal length). */
function dropCodeSpans(line) {
  return line.replace(/(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, ' ');
}

/** Every link target in a twin's prose: inline `](x)` and `[ref]: x`. */
export function linkTargets(text) {
  const targets = [];
  for (const raw of proseLines(text)) {
    const line = dropCodeSpans(raw);
    const ref = line.match(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/);
    if (ref) targets.push(ref[1].replace(/^<|>$/g, ''));
    for (const m of line.matchAll(/\]\((<[^>]*>|[^)\s]+)/g)) targets.push(m[1].replace(/^<|>$/g, ''));
  }
  return targets;
}

/** null = skip (external / same-page), else a path on this site. */
function internalPath(target, servedUrl) {
  if (!target || target.startsWith('#')) return null;
  let u;
  try {
    u = new URL(target, ORIGIN + servedUrl);
  } catch {
    return `<unparseable ${target}>`;
  }
  if (u.origin !== ORIGIN) return null;
  return decodeURIComponent(u.pathname);
}

// ── existence in the built site (mirrors nginx.conf's resolution) ───────────

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function pageExists(dist, path) {
  const rel = path.replace(/^\/+/, '');
  if (path.endsWith('/')) return isFile(join(dist, rel, 'index.html'));
  if (isFile(join(dist, rel))) return true; // .md / .html / .txt / asset
  if (isFile(join(dist, `${rel}.html`))) return true; // cleanUrls
  if (isFile(join(dist, rel, 'index.html'))) return true; // /dir -> /dir/
  const idx = rel.match(/^(.+)\/index\.md$/); // nginx: /dir/index.md -> /dir.md
  return Boolean(idx && isFile(join(dist, `${idx[1]}.md`)));
}

// ── self-test: the matcher must see exactly what a fixture plants ────────────

const PARSER_SELF_TEST = [
  '---',
  'url: /x.md',
  '---',
  '# T',
  'See [a](./a) and [b](../b#h "title") and [c](<./c d>) and ![i](./i.png).',
  'Root [r](/r), external [e](https://e.com/x), anchor [h](#same).',
  'Code `[no](./no)` and ``[no2](./no2) ` x`` stay out; [after](./after).',
  '[ref]: ./ref',
  '```md',
  '[fenced](./fenced)',
  '```',
  '  ~~~~',
  '  [tilde](./tilde)',
  '  ~~~~',
  '* list [l](./l)',
].join('\n');
const SELF_TEST_WANT = ['./ref', './a', '../b#h', './c d', './i.png', '/r', 'https://e.com/x', '#same', './after', './l'];

{
  const got = linkTargets(PARSER_SELF_TEST);
  const a = [...got].sort().join('|');
  const b = [...SELF_TEST_WANT].sort().join('|');
  if (a !== b) {
    console.error('check-twin-links: PARSER_SELF_TEST failed — the link matcher is broken.');
    console.error(`  want: ${b}\n  got:  ${a}`);
    process.exit(2);
  }
}

{
  const rel = ['./a', 'a/b', '../c'].every(isWrittenRelative);
  const notRel = ['/a', 'https://developer.civitai.com/a.md', 'mailto:x@y.z'].every((t) => !isWrittenRelative(t));
  const noted = '---\nurl: /a.md\n---\n\n> Documentation index: https://x/llms.txt — y\n\n# A\n';
  const strip = stripIndexNote(noted) === '---\nurl: /a.md\n---\n\n# A\n' && stripIndexNote('---\nurl: /a.md\n---\n\n# A\n') === '---\nurl: /a.md\n---\n\n# A\n';
  if (!rel || !notRel || !strip) {
    console.error(`check-twin-links: HELPER_SELF_TEST failed (relative=${rel} absolute=${notRel} strip=${strip}).`);
    process.exit(2);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

function walk(dir, want = (name) => name.endsWith('.md')) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, want));
    else if (e.isFile() && want(e.name)) out.push(p);
  }
  return out;
}

// ── llms-full.txt bundles ────────────────────────────────────────────────────
//
// The plugin concatenates every page into `llms-full.txt`: each page gets a
// `---\nurl: /x.md\n---` header and the pages are joined with `\n---\n\n`.
// Served at `/llms-full.txt`, a RELATIVE link in any section resolves against
// `/`, not against the page it came from — so here a relative link is itself
// the defect, whatever it happens to resolve to. Root paths must exist.
//
// 🔴 Existence alone cannot tell a WRONG root target from the right one when
// both pages exist (`../` resolved one directory too high lands on `/`, which
// exists). So each section must also be byte-identical to the twin its `url:`
// names: the twins are checked above at both served URLs, and the plugin wrote
// each section from the same page as its twin, so any divergence means the two
// rewrite passes disagree. It cannot catch a bug BOTH passes share (they share
// `sourceDirOf`), and the twin check above has the same existence-only limit;
// that rule is pinned by the source-dir assertions in
// `scripts/test-twin-links.mjs`, not by anything in this file.
//
// The splitter's boundary regex is the same one `scripts/lib/twin-links.mjs`
// uses (not imported, so a change to one is a visible diff in the other) — a
// shared mis-split would fool both, which is why the self-test below pins it
// on a fixture and the twin-identity check catches a section cut in the wrong
// place.

/** [{ url, body }] for each section of a bundle. */
export function bundleSections(text) {
  return text.split(/\n---\n\n(?=---\nurl:)/).map((body) => {
    const m = body.match(/^---\n(?:[^\n]*\n)*?url:\s*['"]?([^'"\n]+?)['"]?\s*\n/);
    return { url: m ? m[1] : null, body };
  });
}

{
  const fixture = [
    '---\nurl: /a.md\n---\n# A\n[x](./x)\n',
    '---\nurl: /b/c.md\ndescription: d\n---\n# C\n---\nnot a header\n',
    "---\nurl: '/d.md'\n---\n# D\n",
  ].join('\n---\n\n');
  const got = bundleSections(fixture).map((s) => s.url).join('|');
  if (got !== '/a.md|/b/c.md|/d.md') {
    console.error(`check-twin-links: BUNDLE_SELF_TEST failed — the llms-full splitter is broken (got ${got}).`);
    process.exit(2);
  }
}

// Floors for the bundle, far below today's counts (135 sections / 1,400+
// internal links on the build of 28e9e5c).
const MIN_SECTIONS = 50;
const MIN_BUNDLE_LINKS = 300;

if (!existsSync(DIST)) {
  console.error(`check-twin-links: no build output at ${DIST} — run \`npm run build\` first.`);
  process.exit(2);
}

// The advertised set: every `.md` URL /llms.txt lists must itself exist.
const llms = readFileSync(join(DIST, 'llms.txt'), 'utf8');
// Entries are absolute since agent-surface.mjs; root-relative ones are still accepted.
const advertised = [...llms.matchAll(/\]\(((?:https:\/\/developer\.civitai\.com)?\/[^)\s]+\.md)\)/g)].map((m) =>
  m[1].replace(ORIGIN, ''),
);
const deadAdvertised = advertised.filter((u) => !pageExists(DIST, u));

let twins = 0;
const twinUrls = [];
let checked = 0;
let relativeChecked = 0;
const broken = new Map(); // servedUrl -> [target -> resolved]

for (const p of walk(DIST)) {
  const rel = relative(DIST, p).split(sep).join('/');
  const text = readFileSync(p, 'utf8');
  // A twin is a file the llms plugin wrote: its frontmatter `url:` is its own path.
  const fm = text.match(/^---\n[\s\S]*?^url:\s*['"]?([^'"\n]+?)['"]?\s*$/m);
  if (!fm || fm[1] !== `/${rel}`) continue;
  twins++;
  twinUrls.push(`/${rel}`);
  const served = [`/${rel}`, `/${rel.slice(0, -'.md'.length)}/index.md`];
  for (const target of linkTargets(text)) {
    for (const url of served) {
      const path = internalPath(target, url);
      if (path === null) continue;
      checked++;
      if (isWrittenRelative(target)) relativeChecked++;
      if (!pageExists(DIST, path)) {
        if (!broken.has(url)) broken.set(url, []);
        broken.get(url).push(`${target}  ->  ${path}`);
      }
    }
  }
}

// Every llms-full.txt the build emitted (today only the root one; the plugin
// writes per-directory bundles too when its `experimental.depth` is raised).
const bundleFiles = walk(DIST, (name) => name === 'llms-full.txt');
let sections = 0;
const sectionUrls = [];
let bundleChecked = 0;
const bundleProblems = new Map(); // `${bundleUrl} § ${sectionUrl}` -> [problem]
const problem = (key, msg) => {
  if (!bundleProblems.has(key)) bundleProblems.set(key, []);
  bundleProblems.get(key).push(msg);
};
for (const p of bundleFiles) {
  const served = `/${relative(DIST, p).split(sep).join('/')}`;
  for (const { url, body } of bundleSections(readFileSync(p, 'utf8'))) {
    sections++;
    if (url) sectionUrls.push(url);
    const key = `${served} § ${url ?? '<no url: header>'}`;
    if (!url || !url.startsWith('/') || !pageExists(DIST, url)) {
      problem(key, `section header url: ${url} does not name a page in the build`);
    } else if (existsSync(join(DIST, url)) && stripIndexNote(readFileSync(join(DIST, url), 'utf8')) !== body) {
      problem(key, `section differs from its twin ${url} — the bundle and twin rewrites disagree`);
    } else if (!existsSync(join(DIST, url))) {
      problem(key, `section header url: ${url} has no .md twin in the build to compare against`);
    }
    for (const target of linkTargets(body)) {
      if (target.startsWith('#') || target.startsWith('?')) continue;
      const path = internalPath(target, served);
      if (path === null) continue;
      bundleChecked++;
      if (isWrittenRelative(target)) problem(key, `RELATIVE ${target}  ->  ${path} (from ${served})`);
      else if (!pageExists(DIST, path)) problem(key, `DEAD ${target}`);
    }
  }
}

// ── published sections: allowlist ────────────────────────────────────────────
// hashmap.json has one key per compiled page (`apps/guide/sdk.md` -> `apps_guide_sdk.md`),
// so a folder that should be in `srcExclude` shows up here as an unknown section.
export const SECTIONS = ['index', 'agent-setup', 'apps', 'orchestration', 'site'];
export const unlistedPages = (keys, allow) =>
  keys.filter((k) => !allow.includes(k.replace(/\.md$/, '').split('_')[0])).sort();
{
  const got = unlistedPages(['index.md', 'apps_x.md', 'apps.md', 'notes_y.md', 'appsx_z.md', 'readme.md'], SECTIONS);
  if (got.join('|') !== 'appsx_z.md|notes_y.md|readme.md') {
    console.error(`check-twin-links: SECTION_SELF_TEST failed — the section matcher is broken (got ${got.join('|')}).`);
    process.exit(2);
  }
}
const pageKeys = Object.keys(JSON.parse(readFileSync(join(DIST, 'hashmap.json'), 'utf8')));
const unlisted = unlistedPages(pageKeys, SECTIONS);
// The llms plugin writes the twins, llms.txt and llms-full.txt itself, so a page it
// published without VitePress compiling it (e.g. one srcExclude dropped) has no
// hashmap key. Every URL on those surfaces must map back to one.
export const orphanUrls = (urls, keys) => {
  const have = new Set(keys);
  const stem = (u) => u.slice(1).replace(/\.md$/, '').split('/').join('_').toLowerCase();
  return [...new Set(urls)].filter((u) => !have.has(`${stem(u)}.md`) && !have.has(`${stem(u)}_index.md`)).sort();
};
{
  const got = orphanUrls(['/index.md', '/apps/guide.md', '/apps/guide/sdk.md', '/notes/x.md', '/apps/MARKUP.md'], [
    'index.md', 'apps_guide_index.md', 'apps_guide_sdk.md', 'apps_markup.md',
  ]);
  if (got.join('|') !== '/notes/x.md') {
    console.error(`check-twin-links: ORPHAN_SELF_TEST failed — the URL-to-page matcher is broken (got ${got.join('|')}).`);
    process.exit(2);
  }
}
const orphans = orphanUrls([...twinUrls, ...sectionUrls, ...advertised], pageKeys);
if (pageKeys.length < MIN_TWINS) {
  console.error(`check-twin-links: hashmap.json lists only ${pageKeys.length} page(s) — a BROKEN SEARCH, not a clean result.`);
  process.exit(1);
}

if (!bundleFiles.some((p) => relative(DIST, p) === 'llms-full.txt')) {
  console.error(`check-twin-links: no ${join(DIST, 'llms-full.txt')} — the llms plugin did not emit the bundle.`);
  process.exit(1);
}
if (sections < MIN_SECTIONS || bundleChecked < MIN_BUNDLE_LINKS) {
  console.error(
    `check-twin-links: found ${sections} llms-full section(s) and ${bundleChecked} internal link(s) in them; ` +
      `expected at least ${MIN_SECTIONS} and ${MIN_BUNDLE_LINKS}. That is a BROKEN SEARCH, not a clean result.`,
  );
  process.exit(1);
}

if (twins < MIN_TWINS || checked < MIN_LINKS) {
  console.error(
    `check-twin-links: found ${twins} twin(s) and ${checked} internal link resolution(s); expected at least ` +
      `${MIN_TWINS} and ${MIN_LINKS}. That is a BROKEN SEARCH, not a clean result.`,
  );
  process.exit(1);
}

let failed = false;
if (deadAdvertised.length) {
  failed = true;
  console.error(`check-twin-links: ${deadAdvertised.length} URL(s) listed in /llms.txt do not exist in the build:`);
  for (const u of deadAdvertised) console.error(`  ${u}`);
}
if (broken.size) {
  failed = true;
  const count = (pred) => [...broken].filter(([u]) => pred(u)).reduce((s, [, v]) => s + v.length, 0);
  const atAlias = count((u) => u.endsWith('/index.md'));
  const atOwn = count((u) => !u.endsWith('/index.md'));
  console.error(
    `check-twin-links: ${atOwn + atAlias} link(s) in ${broken.size} served twin URL(s) resolve to a page that ` +
      `does not exist — ${atOwn} at a twin's own (llms.txt) URL, ${atAlias} at its /index.md alias ` +
      `(${checked} resolutions checked across ${twins} twins):\n`,
  );
  const SHOW = 5;
  for (const [url, list] of [...broken].sort()) {
    console.error(`  ${url}  (${list.length})`);
    for (const l of list.slice(0, SHOW)) console.error(`      ${l}`);
    if (list.length > SHOW) console.error(`      … and ${list.length - SHOW} more`);
  }
  console.error(
    '\ncheck-twin-links: an agent following that link from the .md twin lands on a 404. If the twin is a\n' +
      'section index (`<dir>/index.md` emitted as `/<dir>.md`), its relative links resolve one directory\n' +
      'too high — scripts/lib/twin-links.mjs (VitePress `buildEnd`) is what absolutizes them.',
  );
}
if (bundleProblems.size) {
  failed = true;
  const all = [...bundleProblems.values()].flat();
  const rel = all.filter((m) => m.startsWith('RELATIVE')).length;
  const dead = all.filter((m) => m.startsWith('DEAD')).length;
  console.error(
    `\ncheck-twin-links: llms-full.txt — ${rel} relative link(s), ${dead} dead root link(s) and ` +
      `${all.length - rel - dead} bad header(s) or twin mismatch(es) in ${bundleProblems.size} section(s) ` +
      `(${bundleChecked} internal links checked across ${sections} sections of ${bundleFiles.length} bundle(s)):\n`,
  );
  const SHOW = 5;
  for (const [key, list] of [...bundleProblems].sort()) {
    console.error(`  ${key}  (${list.length})`);
    for (const l of list.slice(0, SHOW)) console.error(`      ${l}`);
    if (list.length > SHOW) console.error(`      … and ${list.length - SHOW} more`);
  }
  console.error(
    '\ncheck-twin-links: a relative link in llms-full.txt resolves against the BUNDLE\'s URL, not the page it\n' +
      'came from. scripts/lib/twin-links.mjs (VitePress `buildEnd`, rewriteLlmsFull) absolutizes each section\n' +
      'against its SOURCE page\'s directory — `<dir>/index.md` is headed `url: /<dir>.md` but resolves against `<dir>/`.',
  );
}
if (orphans.length) {
  failed = true;
  console.error(`\ncheck-twin-links: ${orphans.length} twin / llms.txt / llms-full.txt URL(s) with no compiled page (hashmap.json key):`);
  for (const u of orphans) console.error(`  ${u}`);
}
if (unlisted.length) {
  failed = true;
  console.error(`\ncheck-twin-links: ${unlisted.length} published page(s) outside the allowed sections (${SECTIONS.join(', ')}):`);
  for (const k of unlisted) console.error(`  ${k}`);
  console.error(
    'If the folder is real docs, add its section to SECTIONS in scripts/check-twin-links.mjs; ' +
      'if it is not, add it to `srcExclude` in .vitepress/config.mts.',
  );
}
if (failed) process.exit(1);

console.log(
  `check-twin-links: OK — ${checked} internal link resolution(s) (${relativeChecked} written relative) across ` +
    `${twins} twins and their served URLs all reach an existing page; all ${advertised.length} /llms.txt URLs exist.`,
);
console.log(
  `check-twin-links: OK — llms-full.txt: ${bundleChecked} internal link(s) across ${sections} section(s) of ` +
    `${bundleFiles.length} bundle(s), 0 relative, 0 dead.`,
);
console.log(`check-twin-links: OK — all ${pageKeys.length} pages are in an allowed section (${SECTIONS.join(', ')}).`);
