#!/usr/bin/env node
/**
 * check-showcase-coverage.mjs
 * ---------------------------
 * The design-system DOCS COVERAGE guard. Three hand-written surfaces claim to
 * cover a pinned package, and nothing related the claim to the package:
 *
 *   1. `apps/showcase.md` — its own first sentence is "A live gallery of every
 *      component in @civitai/components". Measured the day this landed it carried
 *      **12** `<ComponentDemo ui="…">` demos against a pack of **21**. The seven
 *      with no demo at all were `text`, `slider`, `segmented-control`, `toast`,
 *      `toast-region`, `tooltip` and `image`; `group` and `radio` were rendered
 *      inside another component's demo and so had no addressable `ui=` chip. `text`
 *      is the typography primitive — the component every page uses — and the one
 *      whose contract is 128 lines of MARKUP.md.
 *   2. The React arms of those demos import `Civitai*` bindings by name. A binding
 *      renamed upstream is a `tsx` fence that stops compiling, which
 *      `test:snippets:appblocks` does catch — but a binding that EXISTS and is
 *      documented NOWHERE is invisible to a typechecker.
 *   3. `apps/reference/elements.md` (generated) claims to cover every `<civitai-*>`
 *      element. Its generator asserts that internally; this asserts it against the
 *      page that actually ships, which is a different claim.
 *
 * WHAT THIS CHECKS, AND THE RESIDUAL — KEYS, NEVER VALUES
 * ------------------------------------------------------
 * Stated the same way `check-porting-hook-coverage.mjs` states its own: this
 * compares KEY SETS. A demo whose `ui=` chip says `slider` while its markup
 * renders a `number-input`, or whose prose lists `data-variant` values the CSS
 * does not implement, PASSES here. Those are value claims, and the things that can
 * see them are the browser E2E (`test:showcase:e2e`, computed styles) and the
 * generated `apps/reference/components.md` (the contract, verbatim from upstream).
 * This guard's whole job is the question none of them ask: is anything MISSING.
 *
 * REPO-LOCAL, SO IT BLOCKS
 * ------------------------
 * Repo doctrine (see appblocks-drift.yml): upstream movement is SCHEDULED, a
 * repo-local invariant BLOCKS. Every input here is in the tree or the lock file —
 * the pinned `@civitai/components` + `@civitai/components-react` declarations and
 * two committed/generated pages. No network, so it cannot go red because a third
 * party published something. It rides the `test-md-regions` job, which already
 * does the `npm ci` and the `gen:appblocks` this needs.
 *
 * TWO CONTROLS, BECAUSE A CLEAN VERDICT HERE IS A ZERO
 * ---------------------------------------------------
 *   1. EXTRACTOR CONTROL — the 21 CSS-pack names are read out of the published
 *      `dist/index.d.ts` `COMPONENT_NAMES` tuple, and cross-checked against the
 *      distinct `data-civitai-ui="…"` values in the `MARKUP.md` that ships in the
 *      SAME tarball. Two unrelated readings of one package (a TS literal tuple vs
 *      prose examples) must agree; if they do not, this script's extractor is wrong
 *      and the run FAILS rather than grading a page against a bad list.
 *      🔴 Deliberately the INSTALLED package's MARKUP.md, not
 *      `appblocks-snapshots/MARKUP.md`: the snapshot is vendored from
 *      civitai-app-starters@main and is allowed to run AHEAD of the pin, so using
 *      it would make this guard fail for a reason that has nothing to do with the
 *      pages it grades. (`check:snapshots` is what watches the snapshot, on a
 *      schedule, by design.)
 *   2. FLOOR CONTROL — every derived set must clear a cardinality floor. A
 *      `.d.ts` reformat, a regex that stops matching, or a page that moved all
 *      yield an EMPTY set, which makes every comparison below vacuously clean:
 *      `0 == 0` reported as full coverage.
 *
 * Both are required because they fail differently: the floor catches "read
 * nothing", the extractor cross-check catches "read the wrong thing".
 *
 * USAGE
 *   APPBLOCKS_SNAPSHOT_ONLY=1 npm run gen:appblocks   # generates the element gallery
 *   npm run check:showcase-coverage
 *
 * The two page paths are env-overridable (`SHOWCASE_PAGE`, `ELEMENT_GALLERY_PAGE`)
 * so the positive control can run the real logic over a synthetic page with one key
 * removed, without touching the tree. Same mechanism as
 * `check-example-apps.mjs`'s `EXAMPLE_APPS_PAGE`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { log, resolvePackageRoot } from './appblocks-util.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

export const SHOWCASE_PAGE = process.env.SHOWCASE_PAGE || 'apps/showcase.md';
export const ELEMENT_GALLERY_PAGE =
  process.env.ELEMENT_GALLERY_PAGE || 'apps/reference/elements.md';

/**
 * FLOOR CONTROLS — "did the extractor read ANYTHING", and nothing more.
 *
 * Measured at @civitai/components@0.8.1 / @civitai/components-react@0.9.0:
 * cssNames 21, uiValues 21, elementTags 47, reactExports 45, and 22 distinct
 * bindings imported across `apps/**`.
 *
 * 🔴 THE PAGE-SIDE FLOORS ARE DELIBERATELY FAR BELOW THEIR REAL VALUES, AND THIS
 * WAS A BUG BEFORE IT WAS A COMMENT. `uiValues` was first set to 18 — just under
 * the real 21 — and the positive control caught what that does: run the guard
 * against the `apps/showcase.md` on `origin/main`, the exact state it exists to
 * catch, and it reports *"uiValues: 12 (floor 18)"* — an EXTRACTOR failure — while
 * the ledger that would have named the nine undocumented components never
 * executes. A floor set near the real count STEALS the ledger's failure and
 * reports the wrong cause, which is the unreachable-guard shape: the assertion
 * that matters is skipped because an earlier check always wins.
 *
 * So: the page-side floors (`uiValues`, `importedBindings`) catch only a COLLAPSE
 * — a fence tracker that swallowed the page, a renamed `<ComponentDemo`, a page
 * that moved — all of which yield 0 or near it. Coverage is the ledger's job.
 *
 * The PACKAGE-side floors are a different claim (is the trusted side readable at
 * all), and they are also cross-checked by the extractor control, so they sit low
 * enough that a legitimate upstream REMOVAL reaches the ledger rather than failing
 * here with a false "the extractor broke".
 *
 * Never raise a page-side floor to encode coverage, and never lower any of them to
 * make a run green.
 */
export const FLOORS = {
  cssNames: 10,
  uiValues: 5,
  elementTags: 30,
  reactExports: 30,
  importedBindings: 5,
};

const sorted = (set) => [...set].sort();

/* ──────────────────────────────  extractors  ─────────────────────────────── */

/**
 * The CSS pack's component names, from the `readonly [...]` tuple
 * `@civitai/components` publishes in `dist/index.d.ts`. A literal tuple rather
 * than a runtime import because this file must stay a plain offline script.
 */
export function componentNamesFrom(dts) {
  const src = readFileSync(dts, 'utf8');
  const m = /COMPONENT_NAMES\s*:\s*readonly\s*\[([^\]]*)\]/.exec(src);
  if (!m) return new Set();
  return new Set(
    m[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean),
  );
}

/** Distinct `data-civitai-ui="…"` values in a markup document (the control). */
export function uiValuesInMarkup(text) {
  return new Set([...text.matchAll(/data-civitai-ui="([a-z0-9-]+)"/g)].map((m) => m[1]));
}

/**
 * The `ui="…"` values of `<ComponentDemo>` tags, outside any fenced code block.
 *
 * Fence tracking mirrors check-porting-hook-coverage.mjs and
 * check-no-hand-flag-tables.mjs: this page is almost entirely ```html / ```tsx
 * fences, and a fence-blind match would read a demo's own source as a second
 * demo. The opening tag can wrap across lines, so the scan is on the fence-free
 * text rather than line by line.
 */
export function demoUiValues(markdown) {
  const kept = [];
  let fence = null;
  for (const line of markdown.split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1][0].repeat(f[1].length);
      else if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (fence !== null) continue;
    kept.push(line);
  }
  const text = kept.join('\n');
  const out = new Set();
  for (const m of text.matchAll(/<ComponentDemo\b[^>]*?\bui="([a-z0-9-]+)"/g)) out.add(m[1]);
  return out;
}

/** Value exports of a `.d.ts` barrel whose names look like a binding. */
export function barrelExports(dts) {
  const src = readFileSync(dts, 'utf8');
  const out = new Set();
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (/^Civitai[A-Z]/.test(name)) out.add(name);
    }
  }
  return out;
}

/** `Civitai*` names imported from `@civitai/components-react` in ts/tsx fences. */
export function importedBindings(markdown) {
  const out = new Set();
  for (const m of markdown.matchAll(
    /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]@civitai\/components-react['"]/g,
  )) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (/^Civitai[A-Z]/.test(name)) out.add(name);
    }
  }
  return out;
}

/** Every `<civitai-*>` tag name defined in a custom-elements manifest. */
export function manifestTags(cemPath) {
  const cem = JSON.parse(readFileSync(cemPath, 'utf8'));
  const out = new Set();
  for (const mod of cem.modules ?? []) {
    for (const decl of mod.declarations ?? []) if (decl.tagName) out.add(decl.tagName);
  }
  return out;
}

/** `civitai-text-input` -> `CivitaiTextInput` (the binding-name convention). */
export const bindingNameFor = (tag) =>
  tag.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');

/**
 * THE TAGS THIS FILE EXPECTS NO REACT BINDING FOR. That is the whole predicate —
 * LEDGER 2(b)'s declared exception set and nothing else.
 *
 * Both entries today are the elements under `@civitai/components`' `src/sdk/`:
 * they `import` `@civitai/sdk` and need a validated host transport, so
 * `@civitai/components-react` deliberately binds neither.
 *
 * 🔴 `scripts/gen-appblocks-element-gallery.mjs`'s `UNREGISTERED_TAGS` HOLDS THE
 * SAME TWO TAGS TODAY. THAT IS A COINCIDENCE. DO NOT RE-MERGE THEM ON IT.
 * Its predicate is "no register bundle defines it" — a different claim that is
 * true of the same two elements only because an `src/sdk/` element happens to be
 * both unbound and unregistered. These WERE one shared list, consolidated on a
 * "one rule, one place" reading, and the two predicates deadlocked: measured, an
 * element that loses its React binding while keeping its registration is told by
 * THIS file to add the tag, after which the generator fails because the tag is
 * still registered and tells you to remove it — no state of the single list was
 * green in both gates. Each gate extends its OWN list; they are free to diverge
 * and the first non-`src/sdk/` entry on either side is what makes them.
 */
export const BINDINGLESS_TAGS = new Set(['civitai-sign-in-button', 'civitai-workflow-button']);

/** `### \`<civitai-foo>\`` headings — the gallery's own per-element sections. */
export function galleryTags(markdown) {
  return new Set([...markdown.matchAll(/^###\s+`<(civitai-[a-z0-9-]+)>`/gm)].map((m) => m[1]));
}

/** `@civitai/components*` devDependencies, the packages these pages must cover. */
export function componentPackages(pkgJson) {
  return Object.keys(pkgJson.devDependencies ?? {})
    .filter((n) => n.startsWith('@civitai/components'))
    .sort();
}

/** Repo-relative `apps/**` markdown paths. */
function appsPages(root = join(repoRoot, 'apps')) {
  const out = [];
  if (!existsSync(root)) return out;
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) out.push(...appsPages(full));
    else if (name.endsWith('.md')) out.push(relative(repoRoot, full));
  }
  return out.sort();
}

/* ────────────────────────────────  the run  ──────────────────────────────── */

function fail(lines) {
  for (const l of lines) log(l);
  process.exit(1);
}

function main() {
  const componentsRoot = resolvePackageRoot('@civitai/components');
  const reactRoot = resolvePackageRoot('@civitai/components-react');
  const pkgJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const componentsVersion = JSON.parse(
    readFileSync(join(componentsRoot, 'package.json'), 'utf8'),
  ).version;
  const reactVersion = JSON.parse(readFileSync(join(reactRoot, 'package.json'), 'utf8')).version;

  // `resolve`, not `join`: the env overrides exist so the positive control can point
  // this at a synthetic page outside the tree, and an absolute path must stay absolute.
  const showcasePath = resolve(repoRoot, SHOWCASE_PAGE);
  if (!existsSync(showcasePath)) {
    fail([`FAIL: ${SHOWCASE_PAGE} does not exist — nothing was graded.`]);
  }
  const showcase = readFileSync(showcasePath, 'utf8');

  const galleryPath = resolve(repoRoot, ELEMENT_GALLERY_PAGE);
  if (!existsSync(galleryPath)) {
    fail([
      `FAIL: ${ELEMENT_GALLERY_PAGE} is missing. It is GENERATED (and gitignored) by`,
      `      scripts/gen-appblocks-element-gallery.mjs on predev/prebuild, so a bare checkout`,
      `      does not have it yet.`,
      `      Run: APPBLOCKS_SNAPSHOT_ONLY=1 npm run gen:appblocks`,
    ]);
  }
  const gallery = readFileSync(galleryPath, 'utf8');

  // ── CONTROL 1: EXTRACTOR ───────────────────────────────────────────────────
  const cssNames = componentNamesFrom(join(componentsRoot, 'dist', 'index.d.ts'));
  const markupPath = join(componentsRoot, 'MARKUP.md');
  if (!existsSync(markupPath)) {
    fail([
      `FAIL: ${relative(repoRoot, markupPath)} is missing, so this guard cannot cross-check its`,
      `      own extractor and would grade the page against an unverified list.`,
    ]);
  }
  const markupNames = uiValuesInMarkup(readFileSync(markupPath, 'utf8'));
  const extractorDiff = [
    ...sorted(cssNames).filter((n) => !markupNames.has(n)).map((n) => `+${n} (only in COMPONENT_NAMES)`),
    ...sorted(markupNames).filter((n) => !cssNames.has(n)).map((n) => `-${n} (only in MARKUP.md)`),
  ];
  if (extractorDiff.length > 0) {
    fail([
      `FAIL: the COMPONENT_NAMES tuple in @civitai/components@${componentsVersion}'s dist/index.d.ts`,
      `      disagrees with the data-civitai-ui values in the MARKUP.md of the SAME tarball.`,
      `      THE EXTRACTOR IS WRONG — the pages below have not been graded at all.`,
      `      ${extractorDiff.join('\n      ')}`,
    ]);
  }

  // ── CONTROL 2: FLOORS ──────────────────────────────────────────────────────
  const uiValues = demoUiValues(showcase);
  const tags = manifestTags(join(componentsRoot, 'custom-elements.json'));
  const exports_ = barrelExports(join(reactRoot, 'dist', 'elements', 'index.d.ts'));
  const imported = importedBindings(showcase);
  const measured = {
    cssNames: cssNames.size,
    uiValues: uiValues.size,
    elementTags: tags.size,
    reactExports: exports_.size,
    importedBindings: imported.size,
  };
  const under = Object.entries(FLOORS).filter(([k, floor]) => measured[k] < floor);
  if (under.length > 0) {
    fail([
      `FAIL: a derived set came back below its floor, which makes every comparison below`,
      `      vacuous — an empty set has no missing members.`,
      ...under.map(([k, floor]) => `      ${k}: ${measured[k]} (floor ${floor})`),
      `      Measured at components@0.8.1 / components-react@0.9.0: cssNames 21, uiValues 21,`,
      `      elementTags 47, reactExports 45, importedBindings 22. These floors sit FAR below`,
      `      those values on purpose (see FLOORS) — reaching one means an extractor stopped`,
      `      matching or a page moved, NOT that coverage slipped. Coverage is reported by the`,
      `      named-key ledgers below, which a near-real floor would pre-empt.`,
    ]);
  }

  // ── LEDGER 1: the CSS pack vs apps/showcase.md's `ui=` chips ───────────────
  const noDemo = sorted(cssNames).filter((n) => !uiValues.has(n));
  const notAComponent = sorted(uiValues).filter((n) => !cssNames.has(n));
  if (noDemo.length > 0 || notAComponent.length > 0) {
    const out = [
      `FAIL: ${SHOWCASE_PAGE}'s <ComponentDemo ui="…"> set does not match the ` +
        `${cssNames.size} components of @civitai/components@${componentsVersion}.`,
    ];
    if (noDemo.length > 0) {
      out.push(
        ``,
        `  IN THE PACKAGE, NO DEMO ON THE PAGE (${noDemo.length}):`,
        `    ${noDemo.join('\n    ')}`,
        `  The page opens "A live gallery of EVERY component in @civitai/components", so a`,
        `  component with no demo reads as one that does not exist. Add a`,
        `  <ComponentDemo title="…" ui="<name>"> with an #html slot and a tsx #react fence,`,
        `  matching the shape of the demos already there. If the component genuinely renders`,
        `  inside another one's demo, it still needs its OWN addressable ui= chip — that is`,
        `  exactly how \`group\` and \`radio\` went undocumented while being on the page.`,
      );
    }
    if (notAComponent.length > 0) {
      out.push(
        ``,
        `  ON THE PAGE, NOT IN THE PACKAGE (${notAComponent.length}):`,
        `    ${notAComponent.join('\n    ')}`,
        `  Either the component was renamed/removed upstream (update the demo) or the ui=`,
        `  chip is misspelled — a chip nobody can look up, and a demo whose CSS never loads.`,
      );
    }
    fail(out);
  }

  // ── LEDGER 2: the React bindings ───────────────────────────────────────────
  // (a) every binding any apps/** page imports must still be exported.
  const importedEverywhere = new Map();
  for (const rel of appsPages()) {
    for (const name of importedBindings(readFileSync(join(repoRoot, rel), 'utf8'))) {
      if (!importedEverywhere.has(name)) importedEverywhere.set(name, rel);
    }
  }
  const unknownImports = sorted(importedEverywhere.keys()).filter((n) => !exports_.has(n));
  if (unknownImports.length > 0) {
    fail([
      `FAIL: ${unknownImports.length} binding(s) imported in apps/**/*.md are not exported by`,
      `      @civitai/components-react@${reactVersion}:`,
      ...unknownImports.map((n) => `        ${n}  (${importedEverywhere.get(n)})`),
      `      The binding was renamed or removed upstream.`,
    ]);
  }
  // (b) the barrel and the element manifest must describe the SAME set. These are
  //     two INDEPENDENTLY PINNED packages (components 0.8.1, components-react
  //     0.9.0), and a binding with no element — or an element with no binding —
  //     is a pin SKEW, which no version check sees because both pins are current.
  //     The 2 elements under the package's src/sdk/ have no binding by design and
  //     are the declared exception — `BINDINGLESS_TAGS`, which is THIS file's list
  //     and no other reader's (see its comment).
  //
  //     Three states, three different causes, so three separate lines. The third —
  //     a STALE exemption — used to be reported as "exported with no element", a
  //     statement that is FALSE when the element is sitting in the manifest, and
  //     whose remediation ("add the tag") was already done.
  const exemptTags = sorted(BINDINGLESS_TAGS);
  const staleExemptions = exemptTags
    .filter((t) => !tags.has(t) || exports_.has(bindingNameFor(t)))
    .map((t) =>
      !tags.has(t)
        ? `${t} (no longer an element)`
        : `${t} (the barrel DOES export ${bindingNameFor(t)})`,
    );
  // An exempt tag the barrel binds anyway is reported above, not as "no element".
  const exemptBound = new Set(exemptTags.filter((t) => tags.has(t)).map(bindingNameFor));
  const expectedBindings = new Set(
    sorted(tags).filter((t) => !BINDINGLESS_TAGS.has(t)).map(bindingNameFor),
  );
  const bindingNoElement = sorted(exports_).filter(
    (n) => !expectedBindings.has(n) && !exemptBound.has(n),
  );
  const elementNoBinding = sorted(expectedBindings).filter((n) => !exports_.has(n));
  if (bindingNoElement.length > 0 || elementNoBinding.length > 0 || staleExemptions.length > 0) {
    fail([
      `FAIL: @civitai/components-react@${reactVersion}'s barrel and`,
      `      @civitai/components@${componentsVersion}'s custom-elements.json describe different`,
      `      element sets. The two pins are independent, so this is a SKEW no freshness check`,
      `      can see — both pins are "current" and the pair is still inconsistent.`,
      ...(bindingNoElement.length
        ? [
            `      exported with no element: ${bindingNoElement.join(', ')}`,
            `      Bump the two pins in lockstep — the barrel binds a tag the manifest does not`,
            `      declare.`,
          ]
        : []),
      ...(elementNoBinding.length
        ? [
            `      element with no binding:  ${elementNoBinding.join(', ')}`,
            `      Bump the two pins in lockstep, or — if the element is deliberately binding-less —`,
            `      add its TAG to BINDINGLESS_TAGS in this file`,
            `      (scripts/check-showcase-coverage.mjs) with a reason. That list is this file's`,
            `      alone; the element gallery generator has its own, for its own predicate.`,
          ]
        : []),
      ...(staleExemptions.length
        ? [
            `      stale BINDINGLESS_TAGS entry (${staleExemptions.length}): ${staleExemptions.join(', ')}`,
            `      Remove the tag from BINDINGLESS_TAGS in this file`,
            `      (scripts/check-showcase-coverage.mjs). While it sits there the element is`,
            `      excluded from the comparison above, so nothing else here can see it.`,
          ]
        : []),
    ]);
  }

  // ── LEDGER 3: every components package is demoed, and the gallery is complete ─
  const packages = componentPackages(pkgJson);
  if (packages.length === 0) {
    fail([
      `FAIL: no @civitai/components* devDependency found in package.json. This guard grades`,
      `      the docs against those packages, so an empty list means it graded nothing.`,
    ]);
  }
  const demoPages = appsPages().filter((rel) =>
    readFileSync(join(repoRoot, rel), 'utf8').includes('<ComponentDemo'),
  );
  const undemoed = packages.filter(
    (pkg) =>
      !demoPages.some((rel) => {
        const text = readFileSync(join(repoRoot, rel), 'utf8');
        // `@civitai/components` is a PREFIX of `@civitai/components-react`, so a
        // bare `includes` would credit the react package's mentions to both. Match
        // the specifier at a boundary instead.
        return new RegExp(`@civitai/${pkg.slice('@civitai/'.length)}(?![a-z-])`).test(text);
      }),
  );
  if (undemoed.length > 0) {
    fail([
      `FAIL: ${undemoed.length} @civitai/components* devDependency(ies) are named on no page that`,
      `      carries a <ComponentDemo>:`,
      ...undemoed.map((p) => `        ${p}`),
      `      A package the docs install but never demonstrate is a dependency a reader cannot`,
      `      see working. Pages with demos today: ${demoPages.join(', ') || '(none)'}`,
    ]);
  }

  const galleryCovered = galleryTags(gallery);
  const ungalleried = sorted(tags).filter((t) => !galleryCovered.has(t));
  const galleryExtra = sorted(galleryCovered).filter((t) => !tags.has(t));
  if (ungalleried.length > 0 || galleryExtra.length > 0) {
    fail([
      `FAIL: ${ELEMENT_GALLERY_PAGE} does not cover the ${tags.size} elements defined by`,
      `      @civitai/components@${componentsVersion}.`,
      ...(ungalleried.length
        ? [
            ``,
            `  DEFINED BUT NOT ON THE PAGE (${ungalleried.length}):`,
            `    ${ungalleried.join('\n    ')}`,
            `  The page is generated, so the fix is in scripts/gen-appblocks-element-gallery.mjs`,
            `  (its EXEMPLARS map) — then re-run \`npm run gen:appblocks\`. A stale page here`,
            `  means the generator ran against an older install.`,
          ]
        : []),
      ...(galleryExtra.length
        ? [
            ``,
            `  ON THE PAGE, NOT DEFINED (${galleryExtra.length}):`,
            `    ${galleryExtra.join('\n    ')}`,
            `  The element was removed upstream and the page was generated before that.`,
          ]
        : []),
    ]);
  }

  // ── The CSS hatch ledger ───────────────────────────────────────────────────
  // The `all: revert-layer` escape hatch in .vitepress/theme/design-system.css has
  // to ENUMERATE the element tags (CSS has no tag-prefix selector). An element
  // added upstream and absent from that list renders with Tailwind Preflight's
  // reset winning over its own `:host` rules — measured: the card's border goes
  // 1px rgb(206,212,218) -> 0px rgb(228,228,231), i.e. invisible, with no error.
  const cssPath = join(repoRoot, '.vitepress', 'theme', 'design-system.css');
  const css = readFileSync(cssPath, 'utf8');
  const hatch = /\.cds-el-preview\s*:is\(([^)]*)\)/.exec(css);
  if (!hatch) {
    fail([
      `FAIL: no \`.cds-el-preview :is(civitai-…)\` rule in .vitepress/theme/design-system.css.`,
      `      That rule is the only thing keeping Tailwind Preflight's unlayered border reset from`,
      `      beating every element's own \`:host\` styling on the gallery page, and its absence is`,
      `      SILENT — the elements render, just without their borders.`,
    ]);
  }
  const hatched = new Set(
    hatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^civitai-[a-z0-9-]+$/.test(s)),
  );
  const unhatched = sorted(tags).filter((t) => !hatched.has(t));
  const hatchExtra = sorted(hatched).filter((t) => !tags.has(t));
  if (unhatched.length > 0 || hatchExtra.length > 0) {
    fail([
      `FAIL: the \`.cds-el-preview :is(…)\` tag list in .vitepress/theme/design-system.css does`,
      `      not match the ${tags.size} elements @civitai/components@${componentsVersion} defines.`,
      ...(unhatched.length ? [`      missing from the CSS: ${unhatched.join(', ')}`] : []),
      ...(hatchExtra.length ? [`      in the CSS, not an element: ${hatchExtra.join(', ')}`] : []),
      `      An unlisted element loses its borders on the gallery page with no error.`,
    ]);
  }

  log(
    `ok: ${SHOWCASE_PAGE} demos all ${cssNames.size} components of ` +
      `@civitai/components@${componentsVersion} (and no others) ` +
      `[extractor agrees with that tarball's MARKUP.md]`,
  );
  log(
    `ok: ${ELEMENT_GALLERY_PAGE} covers all ${tags.size} elements; ` +
      `@civitai/components-react@${reactVersion} binds ${exports_.size} of them ` +
      `(${BINDINGLESS_TAGS.size} tag(s) in BINDINGLESS_TAGS bind none, by design); ` +
      `${importedEverywhere.size} binding(s) imported across apps/**`,
  );
  log(
    `ok: every @civitai/components* devDep (${packages.join(', ')}) is named on a ` +
      `<ComponentDemo> page; the design-system.css hatch lists all ${tags.size} tags`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
