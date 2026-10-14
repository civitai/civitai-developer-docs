#!/usr/bin/env node
// Asserts the BUILT site's agent surface — what `scripts/lib/operation-twins.mjs`
// and `scripts/lib/agent-surface.mjs` (VitePress `buildEnd`) and the
// `transformHead` hook in `.vitepress/config.mts` produce. Offline; reads
// `.vitepress/dist` and the spec the build rendered from.
//
// Each assertion is a RELATIONSHIP between two artifacts, because each artifact
// alone reads fine while the pair is wrong:
//   1. OPERATIONS — spec operations == operation twins == operation HTML pages
//      == the `### API operations` group in llms.txt (all four counts equal,
//      and > 0), and each twin carries its method + path, every parameter name,
//      every response status and the request schema name (spec parity).
//   2. TWINS — every twin carries the index note; NO internal page link is left
//      as a root path or HTML route (every one is an absolute `.md` URL).
//   3. llms.txt — every entry absolute; every section index it names exists;
//      each `/<section>/llms.txt` is EXACTLY the root's entries under that path
//      (set equality, both directions), and each `/<section>/llms-full.txt`
//      holds exactly those pages.
//   4. HTML — every page whose twin exists advertises it with
//      `<link rel="alternate" type="text/markdown">`, and every advertised href
//      exists (no page advertises a twin that is not there).
//   5. robots.txt names the sitemap, the sitemap exists and lists the pages;
//      every docs `.md` URL the agent-setup prompt hands an agent exists.
//
// Floors are POSITIVE CONTROLS: a glob or parser that stopped matching would
// otherwise report "0 problems" over 0 files. Usage: node scripts/check-agent-surface.mjs [distDir]

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = process.argv[2] ?? '.vitepress/dist';
const SPEC = 'public/openapi/v2-consumers.json';
const ORIGIN = 'https://developer.civitai.com';
const OPS = 'orchestration/reference/operations';
const NOTE_PREFIX = `> Documentation index: ${ORIGIN}/llms.txt`;

// Floors far below today's counts (2026-10-14: 215 twins, 78 operations,
// 3,300+ absolute .md links, 216 sitemap URLs): they catch a broken search.
const MIN_TWINS = 100;
const MIN_OPS = 20;
const MIN_ABS_LINKS = 500;
const MIN_SITEMAP = 100;
const MIN_ALTERNATES = 100;

if (!existsSync(join(DIST, 'llms.txt'))) {
  console.error(`check-agent-surface: no build at ${DIST} — run \`npm run build\` first.`);
  process.exit(2);
}

const failures = [];
const fail = (m) => failures.push(m);
const read = (p) => readFileSync(join(DIST, p), 'utf8');
const exists = (p) => existsSync(join(DIST, p));

function walk(dir, want) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, want));
    else if (e.isFile() && want(e.name)) out.push(relative(DIST, p).split(sep).join('/'));
  }
  return out;
}

/** Prose link targets (fenced blocks and inline code removed). Independent of the rewriter. */
function linkTargets(text) {
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
    const prose = line.replace(/(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, ' ');
    const ref = prose.match(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/);
    if (ref) out.push(ref[1].replace(/^<|>$/g, ''));
    for (const m of prose.matchAll(/\]\((<[^>]*>|[^)\s]+)/g)) out.push(m[1].replace(/^<|>$/g, ''));
  }
  return out;
}

{
  const got = linkTargets('[a](/x) `[b](/y)` [c](https://e/z)\n```\n[d](/w)\n```\n[r]: /q').sort().join('|');
  if (got !== '/q|/x|https://e/z') {
    console.error(`check-agent-surface: LINK_SELF_TEST failed (got ${got}).`);
    process.exit(2);
  }
}

// ── twins ────────────────────────────────────────────────────────────────────
const twinFiles = walk(DIST, (n) => n.endsWith('.md')).filter((rel) => {
  const m = read(rel).match(/^---\n[\s\S]*?^url:\s*['"]?([^'"\n]+?)['"]?\s*$/m);
  return m && m[1] === `/${rel}`;
});
const twinSet = new Set(twinFiles.map((r) => `/${r}`));

/** The twin a site path names (mirrors nginx's $twin_candidate), or null. */
function twinOf(path) {
  let base;
  if (path === '/') base = '/index';
  else if (path.endsWith('/index.html')) base = path.slice(0, -11);
  else if (path.endsWith('.html')) base = path.slice(0, -5);
  else if (path.endsWith('/')) base = path.slice(0, -1);
  else if (/\.[^/]*$/.test(path)) return null;
  else base = path;
  return twinSet.has(`${base}.md`) ? `${base}.md` : null;
}

let absLinks = 0;
const leftover = [];
const missingNote = [];
for (const rel of twinFiles) {
  const text = read(rel);
  const fmEnd = text.indexOf('\n---\n', 3);
  if (!text.slice(fmEnd + 5).startsWith(`\n${NOTE_PREFIX}`)) missingNote.push(`/${rel}`);
  for (const t of linkTargets(text)) {
    if (t.startsWith(`${ORIGIN}/`) && /\.md(?:[#?]|$)/.test(t)) {
      absLinks++;
      continue;
    }
    let path = null;
    if (t.startsWith('/') && !t.startsWith('//')) path = t;
    else if (t.startsWith(`${ORIGIN}/`)) path = t.slice(ORIGIN.length);
    if (path === null) continue;
    path = path.replace(/[?#].*$/, '');
    if (path.endsWith('.md') || twinOf(path)) leftover.push(`/${rel}: ${t}`);
  }
}
if (twinFiles.length < MIN_TWINS) fail(`only ${twinFiles.length} twin(s) found (floor ${MIN_TWINS}) — a broken search, not a clean result`);
if (absLinks < MIN_ABS_LINKS) fail(`only ${absLinks} absolute .md link(s) across the twins (floor ${MIN_ABS_LINKS})`);
if (missingNote.length) fail(`${missingNote.length} twin(s) lack the index note after their frontmatter: ${missingNote.slice(0, 5).join(', ')}`);
if (leftover.length) {
  fail(`${leftover.length} internal page link(s) in twins are not absolute .md URLs:\n    ${leftover.slice(0, 10).join('\n    ')}`);
}

// ── operations ───────────────────────────────────────────────────────────────
const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
const specOps = [];
for (const [path, item] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(item)) if (op?.operationId) specOps.push({ path, method, op, item });
}
const opHtml = existsSync(join(DIST, OPS)) ? readdirSync(join(DIST, OPS)).filter((f) => f.endsWith('.html')) : [];
const opTwins = twinFiles.filter((r) => r.startsWith(`${OPS}/`));
const llms = read('llms.txt');
const opGroup = llms.split('\n### ').find((g) => g.startsWith('API operations\n')) ?? '';
const opEntries = [...opGroup.matchAll(/^- \[[^\]]*\]\(([^)]+)\)/gm)].map((m) => m[1]);
const counts = `spec ${specOps.length}, twins ${opTwins.length}, HTML pages ${opHtml.length}, llms.txt entries ${opEntries.length}`;
if (specOps.length < MIN_OPS) fail(`the spec yields ${specOps.length} operation(s) (floor ${MIN_OPS})`);
if (new Set([specOps.length, opTwins.length, opHtml.length, opEntries.length]).size !== 1) fail(`operation counts disagree: ${counts}`);
const parity = [];
for (const { path, method, op, item } of specOps) {
  const rel = `${OPS}/${op.operationId}.md`;
  if (!exists(rel)) {
    parity.push(`${op.operationId}: no twin`);
    continue;
  }
  const t = read(rel);
  if (!t.includes(`\`${method.toUpperCase()} https://orchestration.civitai.com${path}\``)) parity.push(`${op.operationId}: method + path line`);
  for (const p of [...(item.parameters ?? []), ...(op.parameters ?? [])]) {
    if (p.name && !t.includes(`| \`${p.name}\` | ${p.in} |`)) parity.push(`${op.operationId}: parameter ${p.name}`);
  }
  for (const status of Object.keys(op.responses ?? {})) {
    if (!new RegExp(`^### ${status}\\b`, 'm').test(t)) parity.push(`${op.operationId}: response ${status}`);
  }
  for (const media of Object.values(op.requestBody?.content ?? {}).slice(0, 1)) {
    const ref = media.schema?.$ref?.split('/').pop();
    if (ref && !t.includes(`Schema \`${ref}\``)) parity.push(`${op.operationId}: request schema ${ref}`);
  }
  if (!opEntries.includes(`${ORIGIN}/${rel}`)) parity.push(`${op.operationId}: not in llms.txt`);
}
if (parity.length) fail(`${parity.length} operation twin parity gap(s) against ${SPEC}:\n    ${parity.slice(0, 10).join('\n    ')}`);

// ── llms.txt and the section indexes ─────────────────────────────────────────
const entries = (text) => [...text.matchAll(/^- \[[^\]]*\]\(([^)\s]+)\)/gm)].map((m) => m[1]);
const rootEntries = entries(llms.slice(llms.indexOf('\n## Table of Contents')));
const notAbsolute = entries(llms).filter((u) => !u.startsWith(`${ORIGIN}/`));
if (notAbsolute.length) fail(`${notAbsolute.length} llms.txt entr(ies) are not absolute: ${notAbsolute.slice(0, 5).join(', ')}`);
const sectionIndexes = [...llms.matchAll(new RegExp(`\\]\\(${ORIGIN.replace(/\./g, '\\.')}/([^/)]+)/llms\\.txt\\)`, 'g'))].map((m) => m[1]);
if (sectionIndexes.length < 3) fail(`llms.txt names ${sectionIndexes.length} section index(es), expected at least 3 (apps, orchestration, site)`);
const sectionReport = [];
for (const seg of sectionIndexes) {
  for (const f of [`${seg}/llms.txt`, `${seg}/llms-full.txt`]) if (!exists(f)) fail(`llms.txt names /${f}, which is not in the build`);
  if (!exists(`${seg}/llms.txt`) || !exists(`${seg}/llms-full.txt`)) continue;
  const inSeg = (u) => u === `${ORIGIN}/${seg}.md` || u.startsWith(`${ORIGIN}/${seg}/`);
  const want = new Set(rootEntries.filter(inSeg));
  const sub = read(`${seg}/llms.txt`);
  const got = new Set(entries(sub.slice(sub.indexOf('\n## Table of Contents'))));
  const missing = [...want].filter((u) => !got.has(u));
  const extra = [...got].filter((u) => !want.has(u));
  if (want.size === 0) fail(`/${seg}/: the root index has no entries under it`);
  if (missing.length || extra.length) fail(`/${seg}/llms.txt differs from the root's /${seg}/ entries: missing [${missing.join(', ')}], extra [${extra.join(', ')}]`);
  const fullUrls = new Set([...read(`${seg}/llms-full.txt`).matchAll(/^---\nurl:\s*(\S+)\n/gm)].map((m) => `${ORIGIN}${m[1]}`));
  const fMissing = [...want].map((u) => u.replace(/#.*$/, '')).filter((u) => !fullUrls.has(u));
  const fExtra = [...fullUrls].filter((u) => !want.has(u));
  if (fMissing.length || fExtra.length) fail(`/${seg}/llms-full.txt pages differ from its index: missing [${fMissing.join(', ')}], extra [${fExtra.join(', ')}]`);
  sectionReport.push(`/${seg}/ ${want.size} pages`);
}

// ── HTML alternates ──────────────────────────────────────────────────────────
let alternates = 0;
const altProblems = [];
for (const rel of walk(DIST, (n) => n.endsWith('.html'))) {
  if (rel === '404.html') continue;
  const html = read(rel);
  const hrefs = [...html.matchAll(/<link rel="alternate" type="text\/markdown" href="([^"]+)">/g)].map((m) => m[1]);
  const expected = twinOf(`/${rel}`);
  if (hrefs.length > 1) altProblems.push(`/${rel}: ${hrefs.length} markdown alternates`);
  if (expected && hrefs[0] !== expected) altProblems.push(`/${rel}: advertises ${hrefs[0] ?? 'nothing'}, its twin is ${expected}`);
  if (!expected && hrefs.length) altProblems.push(`/${rel}: advertises ${hrefs[0]}, which does not exist`);
  if (hrefs.length) alternates++;
}
if (alternates < MIN_ALTERNATES) fail(`only ${alternates} HTML page(s) advertise a markdown alternate (floor ${MIN_ALTERNATES})`);
if (altProblems.length) fail(`${altProblems.length} HTML markdown-alternate problem(s):\n    ${altProblems.slice(0, 10).join('\n    ')}`);

// ── robots, sitemap, prompt ──────────────────────────────────────────────────
const robots = exists('robots.txt') ? read('robots.txt') : '';
if (!/^Sitemap: https:\/\/developer\.civitai\.com\/sitemap\.xml$/m.test(robots)) fail('robots.txt is missing or does not name the sitemap');
if (!/^Content-Signal: .*ai-input=yes/m.test(robots)) fail('robots.txt carries no Content-Signal line');
const locs = exists('sitemap.xml') ? [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]) : [];
if (locs.length < MIN_SITEMAP) fail(`sitemap.xml lists ${locs.length} URL(s) (floor ${MIN_SITEMAP})`);
const opLocs = locs.filter((u) => u.includes(`/${OPS}/`)).length;
if (opLocs !== specOps.length) fail(`sitemap.xml lists ${opLocs} operation page(s), the spec has ${specOps.length}`);
const promptDocs = [...read('agent-setup/prompt.md').matchAll(/https:\/\/developer\.civitai\.com(\/[^\s)`]+\.md)\b/g)].map((m) => m[1]);
for (const p of promptDocs) if (p !== '/agent-setup/prompt.md' && !exists(p.slice(1))) fail(`agent-setup/prompt.md sends agents to ${ORIGIN}${p}, which is not in the build`);

if (failures.length) {
  console.error(`check-agent-surface: ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-agent-surface: OK — ${twinFiles.length} twins (all with the index note), ${absLinks} absolute .md links, 0 root/HTML page links left; ` +
    `operations: ${counts}; section indexes: ${sectionReport.join(', ')}; ${alternates} HTML pages advertise their twin; ` +
    `sitemap ${locs.length} URLs; ${promptDocs.length} prompt .md URL(s) exist.`,
);
