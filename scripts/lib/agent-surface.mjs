// The post-build pass that makes the built site's MACHINE surface self-contained:
// what an agent gets from a `.md` twin, `llms.txt` or `llms-full.txt` must work
// with no knowledge of the site's routing and no base URL.
//
// Runs from VitePress `buildEnd` AFTER `scripts/lib/twin-links.mjs` (which has
// already made every relative link root-absolute against its source page), and
// after the operation twins are written. It is GENERIC: it discovers twins from
// the build output (a twin is a `.md` whose frontmatter `url:` names its own
// path — the same identity rule twin-links uses), so a page added anywhere
// later gets the same treatment with no edit here.
//
// What it does:
//   1. Every internal page link in every twin (and in every llms-full.txt
//      section) becomes an ABSOLUTE `.md` URL — `/apps/guide/sdk#x` ->
//      `https://developer.civitai.com/apps/guide/sdk.md#x`. A twin is read by
//      an agent that fetched ONE file: a root path needs a base it may not keep
//      (a saved file, a quoted excerpt, a tool that drops the URL), and an HTML
//      route sends it back to the lossy channel. Only routes that HAVE a twin
//      are rewritten; assets, `.txt`/`.json` files, external URLs and links
//      inside code are left alone.
//   2. Every twin gets a one-line index note after its frontmatter, so an agent
//      that landed on one page learns the index and the `.md` convention.
//   3. `llms.txt` links become absolute, and it gains a short preamble naming
//      the `.md` convention and the per-section indexes.
//   4. Per-section `/<section>/llms.txt` indexes (the
//      llms.txt subpath convention): the root index / bundle filtered to that
//      path. A section is any top-level path segment with >= 2 index entries.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { frontmatterUrl, mapLinkTargets, splitBundle } from './twin-links.mjs';

export const ORIGIN = 'https://developer.civitai.com';

/** The one-line note every twin carries after its frontmatter. */
export const INDEX_NOTE =
  `> Documentation index: ${ORIGIN}/llms.txt — every page on this site has a markdown version at its URL + \`.md\`.`;

const SEPARATOR = '\n---\n\n';

function walk(dir, want) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, want));
    else if (e.isFile() && want(e.name)) out.push(p);
  }
  return out;
}

const relPosix = (outDir, p) => relative(outDir, p).split(sep).join('/');

/** Every twin in the build: { url: '/x.md', file }. */
export function collectTwins(outDir) {
  const twins = [];
  for (const file of walk(outDir, (n) => n.endsWith('.md'))) {
    const url = `/${relPosix(outDir, file)}`;
    if (frontmatterUrl(readFileSync(file, 'utf8')) === url) twins.push({ url, file });
  }
  return twins;
}

/**
 * The twin URL a site path names, or null. Mirrors nginx.conf's
 * `$twin_candidate` map: `/a/` and `/a` and `/a.html` and `/a/index.html` ->
 * `/a.md`; `/` -> `/index.md`; an explicit `/a.md` or `/a/index.md` alias
 * -> `/a.md`. Returns the candidate only when it is in `twins`.
 */
export function twinForPath(path, twins) {
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  let base;
  if (path === '/') base = '/index';
  else if (path.endsWith('/index.md')) base = path.slice(0, -'/index.md'.length);
  else if (path.endsWith('.md')) base = path.slice(0, -'.md'.length);
  else if (path.endsWith('/index.html')) base = path.slice(0, -'/index.html'.length);
  else if (path.endsWith('.html')) base = path.slice(0, -'.html'.length);
  else if (path.endsWith('/')) base = path.slice(0, -1);
  else if (/\.[^/]*$/.test(path)) return null; // some other file: asset, .txt, .json
  else base = path;
  const candidate = `${base || '/index'}.md`;
  return twins.has(candidate) ? candidate : null;
}

/** A link target -> its absolute `.md` URL, or the target unchanged. */
export function toAbsoluteMd(target, twins) {
  let rest;
  if (target.startsWith(`${ORIGIN}/`)) rest = target.slice(ORIGIN.length);
  else if (target.startsWith('/') && !target.startsWith('//')) rest = target;
  else return target;
  const cut = rest.search(/[?#]/);
  const path = cut === -1 ? rest : rest.slice(0, cut);
  const suffix = cut === -1 ? '' : rest.slice(cut);
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {}
  const twin = twinForPath(decoded, twins);
  return twin ? `${ORIGIN}${twin}${suffix}` : target;
}

/** Insert INDEX_NOTE after the frontmatter (idempotent). */
export function withIndexNote(text) {
  if (text.includes(`\n${INDEX_NOTE}\n`)) return text;
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---\n', 3);
    if (end !== -1) {
      const at = end + '\n---\n'.length;
      return `${text.slice(0, at)}\n${INDEX_NOTE}\n${text.slice(at)}`;
    }
  }
  return `${INDEX_NOTE}\n\n${text}`;
}

/** Remove INDEX_NOTE as `withIndexNote` placed it — for comparing a twin to its bundle section. */
export function withoutIndexNote(text) {
  return text.replace(`\n---\n\n${INDEX_NOTE}\n`, '\n---\n').replace(`${INDEX_NOTE}\n\n`, '');
}

/** Root-relative links -> absolute (any root path; llms.txt only lists files). */
const absoluteRoot = (t) => (t.startsWith('/') && !t.startsWith('//') ? `${ORIGIN}${t}` : t);

// ── llms.txt parsing ─────────────────────────────────────────────────────────

// A group heading at ANY depth below the `## Table of Contents` H2: the plugin
// emits a top-level sidebar group as `###` and a NESTED group as `####` (and
// deeper). Measured when the hooks/cli/generation references were split into
// sub-pages under nested sidebar groups: `#### Generation bridge`, `#### Hooks`,
// `#### CLI`. A `###`-only parser failed the build on them.
const GROUP_HEADING = /^(#{3,6}) \S/;
export const headingLevel = (heading) => heading.match(/^#+/)[0].length;

/**
 * Split llms.txt into { head, toc: [{ heading, lines }] } at `## Table of Contents`.
 * `toc` is FLAT and in document order; a group's nesting is its heading level.
 */
export function parseIndex(text) {
  const marker = '\n## Table of Contents\n';
  const at = text.indexOf(marker);
  if (at === -1) throw new Error('agent-surface: llms.txt has no "## Table of Contents" — the plugin output changed shape');
  const head = text.slice(0, at);
  const toc = [];
  for (const line of text.slice(at + marker.length).split('\n')) {
    if (GROUP_HEADING.test(line)) toc.push({ heading: line, lines: [] });
    else if (line.startsWith('- ') && toc.length) {
      // Every entry must parse: one that does not would silently drop out of
      // every section index (a multi-line operation summary once did).
      if (!entryPath(line)) throw new Error(`agent-surface: unparseable llms.txt entry: ${line}`);
      toc[toc.length - 1].lines.push(line);
    } else if (line.trim() && toc.length) {
      throw new Error(`agent-surface: unexpected line in the llms.txt Table of Contents: ${line}`);
    }
  }
  return { head, toc };
}

export function renderIndex({ head, toc }) {
  return `${head}\n## Table of Contents\n${toc.map((g) => `\n${g.heading}\n\n${g.lines.join('\n')}\n`).join('')}`;
}

/**
 * The site path an index entry links to, or its URL unchanged when it is on
 * another origin. Compared by PARSED origin, not by string prefix: a prefix test
 * reads `https://developer.civitai.com.example.org/x.md` (or `…com@host/x.md`)
 * as this site.
 */
export const entryPath = (line) => {
  const m = line.match(/^- \[[^\]]*\]\(([^)\s]+)\)/);
  if (!m) return null;
  if (m[1].startsWith('/')) return m[1];
  let u;
  try {
    u = new URL(m[1]);
  } catch {
    return m[1];
  }
  return u.origin === ORIGIN ? u.pathname + u.search + u.hash : m[1];
};
const entryTitle = (line) => line.match(/^- \[([^\]]*)\]/)?.[1] ?? null;
const entryDesc = (line) => line.match(/^- \[[^\]]*\]\([^)]*\):\s*(.+)$/)?.[1] ?? null;
const inSection = (path, seg) => Boolean(path) && (path === `/${seg}.md` || path.startsWith(`/${seg}/`));

/** Top-level sections: first path segment with >= 2 entries and a directory in the build. */
export function sectionsOf(toc, outDir) {
  const counts = new Map();
  for (const g of toc) {
    for (const l of g.lines) {
      const p = entryPath(l);
      const seg = p?.match(/^\/([^/.]+)(?:\.md$|\/)/)?.[1];
      if (seg) counts.set(seg, (counts.get(seg) ?? 0) + 1);
    }
  }
  return [...counts].filter(([seg, n]) => n >= 2 && existsSync(join(outDir, seg))).map(([seg]) => seg);
}

/**
 * Drop groups with no entries — unless a DESCENDANT group (a following run of
 * deeper headings) kept some, so a nested group never loses its parent heading.
 * Membership is by each entry's PATH; heading level only decides nesting.
 */
export function pruneEmptyGroups(toc) {
  const keep = toc.map((g) => g.lines.length > 0);
  for (let i = toc.length - 1; i >= 0; i--) {
    if (keep[i]) continue;
    const level = headingLevel(toc[i].heading);
    for (let j = i + 1; j < toc.length && headingLevel(toc[j].heading) > level; j++) {
      if (keep[j]) {
        keep[i] = true;
        break;
      }
    }
  }
  return toc.filter((_, i) => keep[i]);
}

// ── the pass ─────────────────────────────────────────────────────────────────

/**
 * Insert an extra `### heading` group into llms.txt right after the group that
 * lists `afterUrl` (else at the end). Returns the new text.
 */
export function insertIndexGroup(text, heading, lines, afterUrl) {
  const index = parseIndex(text);
  const i = index.toc.findIndex((g) => g.lines.some((l) => entryPath(l) === afterUrl));
  const group = { heading: `### ${heading}`, lines };
  if (i === -1) {
    index.toc.push(group);
    return renderIndex(index);
  }
  // After the anchor group's whole SUBTREE: inserting a `###` between a group and
  // its deeper (`####`) children would re-parent the children under the new group.
  let at = i + 1;
  const level = headingLevel(index.toc[i].heading);
  while (at < index.toc.length && headingLevel(index.toc[at].heading) > level) at++;
  index.toc.splice(at, 0, group);
  return renderIndex(index);
}

/**
 * The HOMEPAGE twin, `/index.md`. The llms plugin emits none for the root page
 * (a `layout: home` page), which made the published rule — "every page has a
 * markdown version at its URL + `.md`" — false for `/`, the first URL an agent
 * is likely to fetch. Built from llms.txt itself: the site title, description
 * and details, the top-level section pages (`/<section>.md` entries), and the
 * indexes. Page links are written root-relative and made absolute `.md` URLs
 * by the twin pass below (which also adds the index note); the index links,
 * which are not pages, are written absolute here.
 * Returns true when written; never overwrites an existing `/index.md`.
 */
export function writeHomeTwin(outDir) {
  const file = join(outDir, 'index.md');
  if (existsSync(file) || !existsSync(join(outDir, 'index.html'))) return false;
  const text = readFileSync(join(outDir, 'llms.txt'), 'utf8');
  const { head, toc } = parseIndex(text);
  const title = head.match(/^# (.+)$/m)?.[1] ?? 'Documentation';
  const desc = head.match(/^> (.+)$/m)?.[1] ?? '';
  const details = head
    .split('\n\n')
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith('#') && !b.startsWith('>'));
  const top = toc.flatMap((g) => g.lines).filter((l) => /^\/[^/]+\.md$/.test(entryPath(l) ?? ''));
  if (top.length === 0) throw new Error('agent-surface: llms.txt lists no top-level section page for the homepage twin');
  const sections = sectionsOf(toc, outDir);
  const body = [
    '---',
    'url: /index.md',
    `description: '${desc.replace(/'/g, "''")}'`,
    '---',
    '',
    `# ${title}`,
    '',
    ...(desc ? [`> ${desc}`, ''] : []),
    ...details.flatMap((d) => [d, '']),
    '## Sections',
    '',
    ...top,
    '',
    '## Indexes',
    '',
    `- [llms.txt](${ORIGIN}/llms.txt): every page, one line each`,
    `- [llms-full.txt](${ORIGIN}/llms-full.txt): the full text of every page in one file`,
    ...sections.map((seg) => `- [/${seg}/llms.txt](${ORIGIN}/${seg}/llms.txt): the /${seg}/ pages only`),
    '',
  ].join('\n');
  writeFileSync(file, body);
  return true;
}

export function applyAgentSurface(outDir) {
  const homeTwin = writeHomeTwin(outDir);
  const twinList = collectTwins(outDir);
  if (twinList.length === 0) throw new Error(`agent-surface: no .md twins found under ${outDir}`);
  const twins = new Set(twinList.map((t) => t.url));
  const toMd = (t) => toAbsoluteMd(t, twins);

  // 1 + 2: twins
  let twinsChanged = 0;
  for (const { file } of twinList) {
    const text = readFileSync(file, 'utf8');
    const next = withIndexNote(mapLinkTargets(text, toMd));
    if (next !== text) {
      writeFileSync(file, next);
      twinsChanged++;
    }
  }

  // 1: the root bundle, section by section (a section's unclosed fence must not
  // swallow the next one). No index note here: one per section would repeat it
  // ~200 times in a file that is itself the index's companion.
  const fullPath = join(outDir, 'llms-full.txt');
  const bundle = splitBundle(readFileSync(fullPath, 'utf8')).map((s) => {
    const body = s.endsWith(SEPARATOR) ? s.slice(0, -SEPARATOR.length) : s;
    return mapLinkTargets(body, toMd);
  });
  writeFileSync(fullPath, bundle.join(SEPARATOR));

  // 3 + 4: llms.txt
  const indexPath = join(outDir, 'llms.txt');
  const index = parseIndex(mapLinkTargets(readFileSync(indexPath, 'utf8'), absoluteRoot));
  const sections = sectionsOf(index.toc, outDir);
  if (sections.length === 0) throw new Error('agent-surface: derived 0 sections from llms.txt');

  const perSection = [];
  for (const seg of sections) {
    const toc = pruneEmptyGroups(
      index.toc.map((g) => ({ heading: g.heading, lines: g.lines.filter((l) => inSection(entryPath(l), seg)) })),
    );
    const own = toc.flatMap((g) => g.lines).find((l) => entryPath(l) === `/${seg}.md`);
    const title = (own && entryTitle(own)) || seg;
    const desc = (own && entryDesc(own)) || `The /${seg}/ pages of ${ORIGIN}.`;
    const head =
      `# ${title}\n\n> ${desc}\n\n` +
      `The /${seg}/ subset of ${ORIGIN}/llms.txt. Every page has a markdown version at its URL + \`.md\`.\n`;
    writeFileSync(join(outDir, seg, 'llms.txt'), renderIndex({ head, toc }));
    perSection.push({ seg, title, entries: toc.reduce((n, g) => n + g.lines.length, 0) });
  }

  const preamble =
    `\nEvery page has a markdown version at its URL + \`.md\` (also served from the page URL itself to ` +
    `\`Accept: text/markdown\`). Internal links in the markdown are absolute \`.md\` URLs.\n\n` +
    `## Section indexes\n\n` +
    perSection
      .map((s) => `- [${s.title}](${ORIGIN}/${s.seg}/llms.txt): the /${s.seg}/ pages only`)
      .join('\n') +
    '\n';
  writeFileSync(indexPath, renderIndex({ head: index.head.replace(/\n*$/, '\n') + preamble, toc: index.toc }));

  return { twins: twinList.length, twinsChanged, homeTwin, bundleSections: bundle.length, sections: perSection };
}
