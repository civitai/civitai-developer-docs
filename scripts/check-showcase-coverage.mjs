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
 * WHAT COUNTS AS COVERED — A RELATIONSHIP, NOT A WORD
 *   - An element is covered when ONE `<ElementDemo>` both names it in its
 *     `tags="…"` chips AND renders it (`<civitai-x` in that demo's own code
 *     fences). A chip alone is a label over nothing; a tag used in passing inside
 *     another element's demo (every demo uses `<civitai-stack>`) is not a demo of
 *     it.
 *   - A CSS component is covered when a `<ComponentDemo>`'s code renders
 *     `data-civitai-ui="<name>"`.
 *   - Every `<ComponentDemo>` sits in a `::: details CSS-only …` container, after
 *     an `<ElementDemo>` in the same `##` section — the page's elements-first
 *     shape. A CSS demo promoted back to the lead fails here.
 * The inverse is checked too: a chip or `<civitai-…>` tag that the manifest does
 * not define (a typo renders nothing and raises no error), and a
 * `data-civitai-ui` value the stylesheet does not define.
 *
 * THE RESIDUAL. Keys, never values: a demo that renders the element with a wrong
 * attribute passes. Rendering is the browser E2E's job
 * (`npm run test:showcase:e2e`).
 *
 * INPUTS — ALL OFFLINE, SO IT BLOCKS
 *   - `custom-elements.json` of the INSTALLED `@civitai/components` (the pin).
 *   - The `COMPONENT_NAMES` tuple in that package's `dist/index.d.ts`, cross-
 *     checked against the `data-civitai-ui` values in the SAME tarball's
 *     `MARKUP.md`: two unrelated readings that must agree, or the extractor is
 *     wrong and the page is not graded at all.
 *   - The page. `SHOWCASE_PAGE` overrides the path so the red control can run the
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
 * USAGE   npm run check:showcase-coverage
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
 * Parse the page into demos. Fence-aware: a fence's lines are code, never page
 * structure. Each demo records its kind, its attributes, the `##` section it sits
 * in, the `:::` container line it sits in (if any), and the text of every fence
 * inside it.
 */
export function parseDemos(markdown) {
  const lines = markdown.split('\n');
  const demos = [];
  let fence = null;
  let section = '(before the first ## heading)';
  let container = null;
  let open = null;
  let tagBuf = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (fence === null) {
        fence = f[1][0].repeat(f[1].length);
        if (open) open.code.push('');
      } else if (line.trim().startsWith(fence) && line.trim().replace(/[`~]/g, '') === '') {
        fence = null;
      }
      continue;
    }
    if (fence !== null) {
      if (open) open.code[open.code.length - 1] += `${line}\n`;
      continue;
    }
    if (/^## /.test(line)) section = line.slice(3).trim();
    if (/^:::\s*\S/.test(line)) container = line.trim();
    else if (/^:::\s*$/.test(line)) container = null;

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
      open = { kind: tagBuf.kind, line: tagBuf.line, attrs, section, container, code: [] };
      tagBuf = null;
      continue;
    }
    if (open && new RegExp(`</${open.kind}>`).test(line)) {
      demos.push({ ...open, code: open.code.join('\n') });
      open = null;
    }
  }
  return demos;
}

/** All failures for one page against one package. Pure, so the controls can call it. */
export function grade({ markdown, tags, cssNames }) {
  const problems = [];
  const demos = parseDemos(markdown);
  const elementDemos = demos.filter((d) => d.kind === 'ElementDemo');
  const componentDemos = demos.filter((d) => d.kind === 'ComponentDemo');

  const measured = { elementTags: tags.size, cssNames: cssNames.size };
  const under = Object.entries(FLOORS).filter(([k, floor]) => measured[k] < floor);
  if (under.length) {
    return [
      'a derived set came back below its floor, so every comparison would be vacuous:',
      ...under.map(([k, floor]) => `  ${k}: ${measured[k]} (floor ${floor})`),
      'The package-side extractor stopped matching — this is NOT a coverage verdict.',
    ];
  }

  // ── Elements ──────────────────────────────────────────────────────────────
  const covered = new Set();
  for (const d of elementDemos) {
    const chips = new Set((d.attrs.tags ?? '').split(/[\s,]+/).filter(Boolean));
    const used = elementTagsIn(d.code);
    const where = `<ElementDemo title="${d.attrs.title ?? '?'}"> (line ${d.line})`;
    for (const c of sorted(chips)) {
      if (!tags.has(c)) problems.push(`${where}: chip <${c}> is not an element the package defines.`);
      else if (!used.has(c)) problems.push(`${where}: chip <${c}> is never rendered by that demo's code.`);
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
      'Add an <ElementDemo title="…" tags="<tag>"> whose #html code renders the element.',
      'Naming it in tags="" is what makes the demo its home; using it inside another',
      "element's demo does not count.",
    );
  }

  // ── CSS-only fallbacks ────────────────────────────────────────────────────
  const cssCovered = new Set();
  for (const d of componentDemos) {
    const where = `<ComponentDemo title="${d.attrs.title ?? '?'}"> (line ${d.line})`;
    for (const u of sorted(uiValues(d.code))) {
      if (!cssNames.has(u)) problems.push(`${where}: data-civitai-ui="${u}" is not a component of the stylesheet.`);
      else cssCovered.add(u);
    }
    if (!/^:::\s*details\s+CSS-only\b/.test(d.container ?? '')) {
      problems.push(`${where}: not inside a "::: details CSS-only …" container — the markup is the fallback, not the lead.`);
    }
    const lead = elementDemos.some((e) => e.section === d.section && e.line < d.line);
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

function main() {
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
