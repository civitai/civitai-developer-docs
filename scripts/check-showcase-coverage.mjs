#!/usr/bin/env node
/**
 * check-showcase-coverage.mjs
 * ---------------------------
 * Every `<civitai-*>` element the pinned `@civitai/components` defines must have
 * a live demo on `apps/showcase.md`, and every component of its CSS-only
 * stylesheet must keep its `data-civitai-ui` fallback demo there. The page leads
 * with the elements; this is what stops the next element added upstream from
 * shipping with no demo, silently.
 *
 * WHAT COUNTS AS COVERED — WHAT RENDERS, NOT WHAT IS SPELLED
 *   - An element is covered when ONE `<ElementDemo>` both names it in its
 *     `tags="…"` chips AND renders it: `<civitai-x` in that demo's `#html` slot.
 *     The `#html` slot is what ElementDemo injects into the preview; the `#js`
 *     slot only runs against it, so a tag that appears there (a comment, a
 *     `createElement` string) renders nothing and does not count. A chip alone is
 *     a label over nothing; a tag used in passing inside another element's demo
 *     (every demo uses `<civitai-stack>`) is not a demo of it.
 *   - A CSS component is covered when a `<ComponentDemo>`'s `#html` slot renders
 *     `data-civitai-ui="<name>"`.
 *   - `<!-- … -->` is removed from the page BEFORE anything is matched — from
 *     prose and from inside code fences alike. A demo wrapped in a comment
 *     renders nothing on the page, and an element written only inside an HTML
 *     comment in a fence renders nothing in the preview; both used to pass.
 *   - Placement: every `<ComponentDemo>` sits in a `::: details CSS-only …`
 *     container, after an `<ElementDemo>` in the same `##` section; and NO
 *     `<ElementDemo>` sits inside any `::: details` container — the element is
 *     the lead, never the collapsed fallback.
 * The inverse is checked too: a chip or `<civitai-…>` tag that the manifest does
 * not define (a typo renders nothing and raises no error), and a
 * `data-civitai-ui` value the stylesheet does not define.
 *
 * SELF-TEST. Every run first grades a set of synthetic fixture pages — one per
 * hazard shape above, plus a clean page — and fails if any fixture's verdict or
 * message is not the expected one. `--self-test` runs only that. The fixtures
 * use a fake two-element manifest, so they do not move when the real page does.
 *
 * THE RESIDUAL. Keys, never values: a demo that renders the element with a wrong
 * attribute passes. Rendering is the browser E2E's job
 * (`npm run test:showcase:e2e`). Comments in OTHER syntaxes inside an `#html`
 * fence (e.g. `<script>// <civitai-x>`) are not stripped.
 *
 * INPUTS — ALL OFFLINE, SO IT BLOCKS
 *   - `custom-elements.json` of the INSTALLED `@civitai/components` (the pin).
 *   - The `COMPONENT_NAMES` tuple in that package's `dist/index.d.ts`, cross-
 *     checked against the `data-civitai-ui` values in the SAME tarball's
 *     `MARKUP.md`: two unrelated readings that must agree, or the extractor is
 *     wrong and the page is not graded at all.
 *   - The page. `SHOWCASE_PAGE` overrides the path so a red control can run the
 *     real logic over a copy with one demo removed.
 * No network and no generated artifact, so a third party's publish cannot turn it
 * red. It rides the `test-md-regions` job, which already runs `npm ci`.
 *
 * FLOORS catch a PACKAGE-side extractor that read nothing (`0 missing of 0`
 * is not coverage). They sit far below the real counts (measured at
 * @civitai/components@0.9.2: 47 elements, 21 CSS components) so a legitimate
 * upstream removal still reaches the ledger. There is deliberately NO floor on
 * the page's demo counts: a page-side parser that reads nothing already fails
 * the ledger (every element "missing"), and a demo floor STEALS that failure —
 * measured: graded against the pre-elements showcase (0 element demos), a
 * demo floor reported "elementDemos: 0 (floor 5) — not a coverage verdict" for
 * the exact state this guard exists to catch. When this landed the page had 26
 * element demos and 18 CSS-only demos.
 *
 * USAGE   npm run check:showcase-coverage [-- --self-test]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { log, repoRoot, resolvePackageRoot } from './appblocks-util.mjs';

export const SHOWCASE_PAGE = process.env.SHOWCASE_PAGE || 'apps/showcase.md';

export const FLOORS = { elementTags: 30, cssNames: 10 };

const sorted = (set) => [...set].sort();

/** Every tag name declared in a custom-elements manifest. */
export function manifestTags(cem) {
  const out = new Set();
  for (const mod of cem.modules ?? []) {
    for (const decl of mod.declarations ?? []) if (decl.tagName) out.add(decl.tagName);
  }
  return out;
}

/** The CSS pack's names, from the `COMPONENT_NAMES` readonly tuple in a `.d.ts`. */
export function componentNamesFrom(dts) {
  const m = /COMPONENT_NAMES\s*:\s*readonly\s*\[([^\]]*)\]/.exec(dts);
  if (!m) return new Set();
  return new Set(
    m[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean),
  );
}

/** Distinct `data-civitai-ui="…"` values in a text. */
export const uiValues = (text) =>
  new Set([...text.matchAll(/data-civitai-ui="([a-z0-9-]+)"/g)].map((m) => m[1]));

/** Distinct `<civitai-…` opening tags in a text. */
export const elementTagsIn = (text) =>
  new Set([...text.matchAll(/<(civitai-[a-z0-9-]+)/g)].map((m) => m[1]));

/**
 * Remove every `<!-- … -->`, keeping its newlines so line numbers still point at
 * the source. An unterminated `<!--` swallows the rest of the page — which is
 * also what the browser does with it.
 */
export function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, (c) => c.replace(/[^\n]/g, ''));
}

/**
 * Parse the page into demos. Fence-aware: a fence's lines are code, never page
 * structure. Each demo records its kind, attributes, the `##` section and the
 * stack of `:::` containers it sits in, and its fenced code PER SLOT
 * (`<template #html>` / `<template #js>`).
 */
export function parseDemos(rawMarkdown) {
  const lines = stripHtmlComments(rawMarkdown).split('\n');
  const demos = [];
  let fence = null;
  let section = '(before the first ## heading)';
  const containers = [];
  let open = null;
  let slot = null;
  let tagBuf = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1][0].repeat(f[1].length);
      else if (line.trim().startsWith(fence) && line.trim().replace(/[`~]/g, '') === '') fence = null;
      continue;
    }
    if (fence !== null) {
      if (open && slot) open.slots[slot] = (open.slots[slot] ?? '') + `${line}\n`;
      continue;
    }
    if (/^## /.test(line)) section = line.slice(3).trim();
    const c = /^(:{3,})\s*(\S.*)?$/.exec(line.trim());
    if (c) {
      if (c[2]) containers.push(line.trim());
      else containers.pop();
      continue;
    }

    // An opening tag may wrap across lines: buffer until its `>`.
    if (tagBuf !== null) tagBuf.text += ` ${line}`;
    else {
      const start = /<(ElementDemo|ComponentDemo)\b/.exec(line);
      if (start) tagBuf = { kind: start[1], text: line.slice(start.index), line: i + 1 };
    }
    if (tagBuf !== null && tagBuf.text.includes('>')) {
      const attrs = Object.fromEntries(
        [...tagBuf.text.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
      );
      open = { kind: tagBuf.kind, line: tagBuf.line, attrs, section, containers: [...containers], slots: {} };
      tagBuf = null;
      slot = null;
      continue;
    }
    if (!open) continue;
    const s = /<template\s+#([a-z]+)\s*>/.exec(line);
    if (s) slot = s[1];
    else if (/<\/template>/.test(line)) slot = null;
    if (new RegExp(`</${open.kind}>`).test(line)) {
      demos.push(open);
      open = null;
      slot = null;
    }
  }
  return demos;
}

const inDetails = (d) => d.containers.some((c) => /^:{3,}\s*details\b/.test(c));

/** All failures for one page against one package. Pure, so the self-test can call it. */
export function grade({ markdown, tags, cssNames, floors = FLOORS }) {
  const problems = [];
  const measured = { elementTags: tags.size, cssNames: cssNames.size };
  const under = Object.entries(floors).filter(([k, floor]) => measured[k] < floor);
  if (under.length) {
    return [
      'a derived set came back below its floor, so every comparison would be vacuous:',
      ...under.map(([k, floor]) => `  ${k}: ${measured[k]} (floor ${floor})`),
      'The package-side extractor stopped matching — this is NOT a coverage verdict.',
    ];
  }
  return problems.concat(gradeDemos(parseDemos(markdown), tags, cssNames));
}

function gradeDemos(demos, tags, cssNames) {
  const problems = [];
  const elementDemos = demos.filter((d) => d.kind === 'ElementDemo');
  const componentDemos = demos.filter((d) => d.kind === 'ComponentDemo');

  // ── Elements ──────────────────────────────────────────────────────────────
  const covered = new Set();
  for (const d of elementDemos) {
    const chips = new Set((d.attrs.tags ?? '').split(/[\s,]+/).filter(Boolean));
    const used = elementTagsIn(d.slots.html ?? '');
    const where = `<ElementDemo title="${d.attrs.title ?? '?'}"> (line ${d.line})`;
    if (inDetails(d)) {
      problems.push(`${where}: sits inside a "::: details" container — the element demo is the lead, never the collapsed fallback.`);
      continue;
    }
    for (const c of sorted(chips)) {
      if (!tags.has(c)) problems.push(`${where}: chip <${c}> is not an element the package defines.`);
      else if (!used.has(c)) problems.push(`${where}: chip <${c}> is never rendered by that demo's #html slot.`);
      else covered.add(c);
    }
    for (const u of sorted(used)) {
      if (!tags.has(u)) problems.push(`${where}: renders <${u}>, which the package does not define (renders nothing).`);
    }
  }
  const missing = sorted(tags).filter((t) => !covered.has(t));
  if (missing.length) {
    problems.push(
      `${missing.length} element(s) defined by the package have no demo on the page:`,
      ...missing.map((t) => `  <${t}>`),
      'Add an <ElementDemo title="…" tags="<tag>"> whose #html slot renders the element.',
      'Naming it in tags="" is what makes the demo its home; using it inside another',
      "element's demo, in the #js slot, or in an HTML comment does not count.",
    );
  }

  // ── CSS-only fallbacks ────────────────────────────────────────────────────
  const cssCovered = new Set();
  for (const d of componentDemos) {
    const where = `<ComponentDemo title="${d.attrs.title ?? '?'}"> (line ${d.line})`;
    for (const u of sorted(uiValues(d.slots.html ?? ''))) {
      if (!cssNames.has(u)) problems.push(`${where}: data-civitai-ui="${u}" is not a component of the stylesheet.`);
      else cssCovered.add(u);
    }
    if (!d.containers.some((c) => /^:{3,}\s*details\s+CSS-only\b/.test(c))) {
      problems.push(`${where}: not inside a "::: details CSS-only …" container — the markup is the fallback, not the lead.`);
    }
    const lead = elementDemos.some((e) => e.section === d.section && e.line < d.line && !inDetails(e));
    if (!lead) problems.push(`${where}: no <ElementDemo> before it in section "${d.section}".`);
  }
  const cssMissing = sorted(cssNames).filter((n) => !cssCovered.has(n));
  if (cssMissing.length) {
    problems.push(
      `${cssMissing.length} stylesheet component(s) have no CSS-only demo on the page:`,
      ...cssMissing.map((n) => `  data-civitai-ui="${n}"`),
      'Add the markup in a "::: details CSS-only / no-JS: …" panel under the element it matches.',
    );
  }
  return problems;
}

/* ──────────────────────────────  self-test  ──────────────────────────────── */

const FX_TAGS = new Set(['civitai-a', 'civitai-b']);
const FX_CSS = new Set(['x']);
const fence = (lang, body) => ['```' + lang, ...body, '```'].join('\n');
const elementDemo = (tag, html, js) =>
  [
    `<ElementDemo title="${tag}" tags="${tag}">`,
    '',
    '<template #html>',
    '',
    fence('html', html),
    '',
    '</template>',
    ...(js ? ['', '<template #js>', '', fence('js', js), '', '</template>'] : []),
    '',
    '</ElementDemo>',
  ].join('\n');
const cssPanel = (html) =>
  [
    '::: details CSS-only / no-JS: data-civitai-ui="x"',
    '<ComponentDemo title="X" ui="x">',
    '',
    '<template #html>',
    '',
    fence('html', html),
    '',
    '</template>',
    '',
    '</ComponentDemo>',
    '',
    ':::',
  ].join('\n');
const page = ({ a = elementDemo('civitai-a', ['<civitai-a></civitai-a>']), b = elementDemo('civitai-b', ['<civitai-b></civitai-b>']), css = cssPanel(['<div data-civitai-ui="x"></div>']) } = {}) =>
  ['# Fixture', '', '## A', '', a, '', css, '', '## B', '', b, ''].join('\n');

/** [name, markdown, substring the FIRST-listed expected problem must contain | null for clean]. */
export const SELF_TEST_CASES = [
  ['clean page', page(), null],
  ['element only in an HTML comment inside the #html fence', page({ b: elementDemo('civitai-b', ['<!-- <civitai-b></civitai-b> -->', '<div></div>']) }), 'chip <civitai-b> is never rendered'],
  ['whole <ElementDemo> wrapped in <!-- -->', page({ b: `<!--\n${elementDemo('civitai-b', ['<civitai-b></civitai-b>'])}\n-->` }), '<civitai-b>'],
  ['element only in the #js slot', page({ b: elementDemo('civitai-b', ['<div></div>'], ["// <civitai-b>"]) }), 'chip <civitai-b> is never rendered'],
  ['<ElementDemo> inside a ::: details container', page({ b: `::: details CSS-only / no-JS: moved\n${elementDemo('civitai-b', ['<civitai-b></civitai-b>'])}\n:::` }), 'inside a "::: details" container'],
  ['CSS component only in an HTML comment', page({ css: cssPanel(['<!-- <div data-civitai-ui="x"></div> -->', '<div></div>']) }), 'data-civitai-ui="x"'],
  ['element demo deleted (control)', page({ b: '' }), '<civitai-b>'],
  ['CSS-only demo outside its details panel', page({ css: cssPanel(['<div data-civitai-ui="x"></div>']).replace(/^:::.*$/gm, '') }), 'not inside a "::: details CSS-only'],
  ['CSS-only demo with no element demo leading its section', page({ a: '' }), 'no <ElementDemo> before it'],
];

export function selfTest() {
  const failures = [];
  for (const [name, md, expect] of SELF_TEST_CASES) {
    const problems = grade({ markdown: md, tags: FX_TAGS, cssNames: FX_CSS, floors: {} });
    if (expect === null && problems.length) failures.push(`${name}: expected clean, got: ${problems[0]}`);
    if (expect !== null && !problems.some((p) => p.includes(expect))) {
      failures.push(`${name}: expected a problem containing ${JSON.stringify(expect)}, got: ${problems.join(' / ') || '(clean)'}`);
    }
  }
  return failures;
}

function main() {
  // The fixtures use a 2-tag manifest, below the real floors, so they are graded without them.
  const stFailures = selfTest();
  if (stFailures.length) {
    log(`FAIL: self-test — the guard no longer catches ${stFailures.length} shape(s) it must:`);
    for (const f of stFailures) log(`  ${f}`);
    process.exit(1);
  }
  log(`ok: self-test — ${SELF_TEST_CASES.length} fixture(s) graded as expected (1 clean, ${SELF_TEST_CASES.length - 1} must-fail)`);
  if (process.argv.includes('--self-test')) return;

  const root = resolvePackageRoot('@civitai/components');
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const tags = manifestTags(JSON.parse(readFileSync(join(root, 'custom-elements.json'), 'utf8')));
  const cssNames = componentNamesFrom(readFileSync(join(root, 'dist', 'index.d.ts'), 'utf8'));

  const markupNames = uiValues(readFileSync(join(root, 'MARKUP.md'), 'utf8'));
  const disagree = [
    ...sorted(cssNames).filter((n) => !markupNames.has(n)).map((n) => `+${n} (only in COMPONENT_NAMES)`),
    ...sorted(markupNames).filter((n) => !cssNames.has(n)).map((n) => `-${n} (only in MARKUP.md)`),
  ];
  if (disagree.length) {
    log(`FAIL: @civitai/components@${version}: COMPONENT_NAMES disagrees with its own MARKUP.md —`);
    log('      the extractor is wrong, so the page was NOT graded.');
    for (const d of disagree) log(`      ${d}`);
    process.exit(1);
  }

  const pagePath = resolve(repoRoot, SHOWCASE_PAGE);
  if (!existsSync(pagePath)) {
    log(`FAIL: ${SHOWCASE_PAGE} does not exist — nothing was graded.`);
    process.exit(1);
  }
  const markdown = readFileSync(pagePath, 'utf8');
  const problems = grade({ markdown, tags, cssNames });
  if (problems.length) {
    log(`FAIL: ${SHOWCASE_PAGE} vs @civitai/components@${version}:`);
    for (const p of problems) log(`  ${p}`);
    process.exit(1);
  }
  const demos = parseDemos(markdown);
  log(
    `ok: ${SHOWCASE_PAGE} demos all ${tags.size} elements of @civitai/components@${version} ` +
      `(${demos.filter((d) => d.kind === 'ElementDemo').length} element demos) and keeps a CSS-only ` +
      `fallback for all ${cssNames.size} stylesheet components ` +
      `(${demos.filter((d) => d.kind === 'ComponentDemo').length} CSS-only demos)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
