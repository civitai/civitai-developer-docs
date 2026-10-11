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
// ALSO that nothing from `INTERNAL_DIRS` (`claudedocs/`, `appblocks-snapshots/`)
// is published on any surface — see "internal-only source directories" below.
//
// 🔴 A ZERO HERE MUST NOT BE A VACUOUS PASS. `PARSER_SELF_TEST` runs on every
// invocation (the matcher must find exactly the links a fixture plants), and
// floors on the twin and link counts catch a glob or matcher that has gone to
// nothing.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

const DIST = process.argv[2] ?? '.vitepress/dist';
const ORIGIN = 'https://developer.civitai.com';

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
const advertised = [...llms.matchAll(/\]\((\/[^)\s]+\.md)\)/g)].map((m) => m[1]);
const deadAdvertised = advertised.filter((u) => !pageExists(DIST, u));

let twins = 0;
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
  const served = [`/${rel}`, `/${rel.slice(0, -'.md'.length)}/index.md`];
  for (const target of linkTargets(text)) {
    for (const url of served) {
      const path = internalPath(target, url);
      if (path === null) continue;
      checked++;
      if (!target.startsWith('/')) relativeChecked++;
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
    const key = `${served} § ${url ?? '<no url: header>'}`;
    if (!url || !url.startsWith('/') || !pageExists(DIST, url)) {
      problem(key, `section header url: ${url} does not name a page in the build`);
    } else if (existsSync(join(DIST, url)) && readFileSync(join(DIST, url), 'utf8') !== body) {
      problem(key, `section differs from its twin ${url} — the bundle and twin rewrites disagree`);
    } else if (!existsSync(join(DIST, url))) {
      problem(key, `section header url: ${url} has no .md twin in the build to compare against`);
    }
    for (const target of linkTargets(body)) {
      if (target.startsWith('#') || target.startsWith('?')) continue;
      const path = internalPath(target, served);
      if (path === null) continue;
      bundleChecked++;
      if (!target.startsWith('/')) problem(key, `RELATIVE ${target}  ->  ${path} (from ${served})`);
      else if (!pageExists(DIST, path)) problem(key, `DEAD ${target}`);
    }
  }
}

// ── internal-only source directories are not published ──────────────────────
//
// 🔴 THE GAP THIS CLOSES. Two directories hold files that are not documentation:
// `claudedocs/` (internal handoff notes for the people working on this repo) and
// `appblocks-snapshots/` (committed generator INPUTS — `MARKUP.md` feeds
// /apps/reference/components). Nothing excluded either, so
// `claudedocs/handoff-docs-showcase-coverage.md` (added in #137) and
// `appblocks-snapshots/MARKUP.md` each shipped as a page, a `.md` twin,
// local-search entries, an `/llms.txt` link and an `/llms-full.txt` section —
// and every check here passed, because their links all resolved.
// `.vitepress/config.mts` now lists both in `srcExclude` (measured on
// claudedocs/ with vitepress-plugin-llms 1.12.0: that alone removes every
// surface; the plugin's `ignoreFiles` alone still published the page, its
// chunks and its search entries) and, as belt-and-braces, in `ignoreFiles`.
//
// Each surface is matched STRUCTURALLY (a dist path, a chunk/hashmap key, a
// link target, a section header, a search-index route), never as a bare
// substring: the build bakes absolute source paths into some chunks, so a
// checkout whose directory name happens to contain a listed name must not trip
// it, and prose that merely NAMES `appblocks-snapshots/MARKUP.md` in a code
// span (apps/reference/index.md does) is not a leak. `LEAK_SELF_TEST` below
// plants one leak per surface per listed dir in a fixture dist, plus
// look-alikes, and requires exactly the planted set back — so a surface whose
// matcher has gone blind fails here instead of passing.
export const INTERNAL_DIRS = ['claudedocs', 'appblocks-snapshots'];

/** Every published trace of a source dir in `dist`, as "surface: detail" strings. */
export function internalLeaks(dist, dirs) {
  const leaks = [];
  const has = (p) => existsSync(join(dist, p));
  const files = (sub) => (has(sub) ? walk(join(dist, sub), () => true) : []);
  for (const dir of dirs) {
    for (const p of files(dir)) leaks.push(`page/twin: /${relative(dist, p).split(sep).join('/')}`);
    const chunk = `${dir}_`; // VitePress names a page chunk after its source path, `/` -> `_`
    for (const name of has('assets') ? readdirSync(join(dist, 'assets')) : []) {
      if (name.startsWith(chunk)) leaks.push(`page chunk: /assets/${name}`);
    }
    if (has('hashmap.json')) {
      for (const k of Object.keys(JSON.parse(readFileSync(join(dist, 'hashmap.json'), 'utf8')))) {
        if (k.startsWith(chunk)) leaks.push(`hashmap.json key: ${k}`);
      }
    }
    if (has('llms.txt')) {
      for (const t of linkTargets(readFileSync(join(dist, 'llms.txt'), 'utf8'))) {
        if (internalPath(t, '/llms.txt')?.startsWith(`/${dir}/`)) leaks.push(`llms.txt entry: ${t}`);
      }
    }
    for (const p of walk(dist, (n) => n === 'llms-full.txt')) {
      const served = `/${relative(dist, p).split(sep).join('/')}`;
      for (const { url } of bundleSections(readFileSync(p, 'utf8'))) {
        if (url?.startsWith(`/${dir}/`)) leaks.push(`${served} section: ${url}`);
      }
    }
    const routeRe = new RegExp(`"/${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"#]*`, 'g');
    for (const p of files('assets/chunks').filter((f) => /@localSearchIndex[^/]*\.js$/.test(f))) {
      const routes = new Set(readFileSync(p, 'utf8').match(routeRe) ?? []);
      for (const r of routes) leaks.push(`search index (${relative(dist, p)}): ${r.slice(1)}`);
    }
  }
  return leaks.sort();
}

{
  const fx = mkdtempSync(join(tmpdir(), 'check-twin-links-leaks-'));
  try {
    const put = (p, text) => {
      mkdirSync(dirname(join(fx, p)), { recursive: true });
      writeFileSync(join(fx, p), text);
    };
    const want = [];
    const hashmap = { 'apps_x.md': 'a' };
    const llms = ['- [X](/apps/x.md)'];
    const full = ['---\nurl: /apps/x.md\n---\n# X\n'];
    const search = ['"1":"/apps/x#a"'];
    const lookalike = [];
    INTERNAL_DIRS.forEach((d, i) => {
      put(`${d}/n${i}.html`, '<html></html>');
      put(`assets/${d}_n${i}.md.h.js`, '');
      hashmap[`${d}_n${i}.md`] = 'b';
      llms.push(`- [N](/${d}/n${i}.md)`, `- [Y](/apps/not-${d}/y.md)`);
      full.push(`---\nurl: /${d}/n${i}.md\n---\n# N\n`);
      search.push(`"${i + 2}":"/${d}/n${i}#goal"`, `"${i + 50}":"/apps/x-${d}/z"`);
      // A baked-in absolute path and a code-span mention are not leaks.
      lookalike.push(`/home/u/repo-no-${d}/${d}/z.ts`, `\`${d}/MARKUP.md\``);
      want.push(
        `/llms-full.txt section: /${d}/n${i}.md`,
        `hashmap.json key: ${d}_n${i}.md`,
        `llms.txt entry: /${d}/n${i}.md`,
        `page chunk: /assets/${d}_n${i}.md.h.js`,
        `page/twin: /${d}/n${i}.html`,
        `search index (assets/chunks/@localSearchIndexroot.q.js): /${d}/n${i}`,
      );
    });
    put('apps/x.md', `---\nurl: /apps/x.md\n---\n# X\n${lookalike.join(' ')}\n`);
    put('assets/apps_x.md.abc.js', `import ${JSON.stringify(lookalike[0])};`);
    put('hashmap.json', JSON.stringify(hashmap));
    put('llms.txt', `${llms.join('\n')}\n${lookalike.join(' ')}\n`);
    put('llms-full.txt', full.join('\n---\n\n'));
    put('assets/chunks/@localSearchIndexroot.q.js', `const t={${search.join(',')}};`);
    const got = internalLeaks(fx, INTERNAL_DIRS);
    want.sort();
    if (got.join('|') !== want.join('|')) {
      console.error('check-twin-links: LEAK_SELF_TEST failed — an internal-dir surface matcher is broken.');
      console.error(`  want: ${want.join('\n        ')}\n  got:  ${got.join('\n        ')}`);
      process.exit(2);
    }
  } finally {
    rmSync(fx, { recursive: true, force: true });
  }
}

const leaks = internalLeaks(DIST, INTERNAL_DIRS);

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
if (leaks.length) {
  failed = true;
  console.error(
    `\ncheck-twin-links: ${leaks.length} published trace(s) of internal-only source dir(s) ` +
      `${INTERNAL_DIRS.map((d) => `${d}/`).join(', ')}:\n`,
  );
  for (const l of leaks) console.error(`  ${l}`);
  console.error(
    '\ncheck-twin-links: these directories hold internal notes and generator inputs, not documentation.\n' +
      'List them in .vitepress/config.mts `srcExclude` (that is what keeps the page, twin, search entry,\n' +
      'llms.txt entry and llms-full.txt section out) and in the llms plugin\'s `ignoreFiles`.',
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
console.log(
  `check-twin-links: OK — no page, twin, chunk, search entry, llms.txt entry or llms-full.txt section from ` +
    `${INTERNAL_DIRS.map((d) => `${d}/`).join(', ')} (6 surfaces each, self-tested).`,
);
