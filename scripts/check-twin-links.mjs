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
// 🔴 A ZERO HERE MUST NOT BE A VACUOUS PASS. `PARSER_SELF_TEST` runs on every
// invocation (the matcher must find exactly the links a fixture plants), and
// floors on the twin and link counts catch a glob or matcher that has gone to
// nothing.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

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
if (failed) process.exit(1);

console.log(
  `check-twin-links: OK — ${checked} internal link resolution(s) (${relativeChecked} written relative) across ` +
    `${twins} twins and their served URLs all reach an existing page; all ${advertised.length} /llms.txt URLs exist.`,
);
