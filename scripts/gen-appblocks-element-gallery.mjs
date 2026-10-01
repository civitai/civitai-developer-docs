// Generate apps/reference/elements.md — the <civitai-*> CUSTOM ELEMENT gallery.
//
// Source of truth: `custom-elements.json`, the W3C/webcomponents Custom Elements
// Manifest that ships INSIDE the published `@civitai/components` tarball (its
// `exports` map serves it at `@civitai/components/custom-elements.json`). So this
// generator is offline and hermetic by construction — no network, no sibling
// checkout, no committed snapshot to re-vendor. The pinned devDep in the lock
// file IS the source, which is also why the companion guard
// `scripts/check-showcase-coverage.mjs` BLOCKS rather than running on a schedule.
//
// WHY A SECOND GALLERY, NEXT TO apps/showcase.md AND apps/reference/components.md
// ------------------------------------------------------------------------------
// The design system has TWO consumption tracks and the docs covered one and a
// half of them. `apps/reference/components.md` + `apps/showcase.md` are the
// `data-civitai-ui` CSS pack: 21 names. The ELEMENTS are 47 tags, and 26 of them
// have no `[data-civitai-ui=…]` rule at all (`civitai-modal`, `civitai-menu`,
// `civitai-table`, `civitai-tabs`, `civitai-switch`, `civitai-avatar`, …), so
// they appeared on NO page. `@civitai/components-react` binds 45 of the 47, which
// is the surface a React author actually calls.
//
// 🔴 THE MANIFEST UNDER-REPORTS, AND THE GALLERY MUST SAY SO ON EVERY AFFECTED
// ELEMENT — THE WHOLE POINT OF THIS GENERATOR'S `renderGap()`.
// The upstream `custom-elements.json` config globs `civitai-*.ts` only, so the
// BASE CLASSES are not in it: there is no `CivitaiField`, `CivitaiElement` or
// `CivitaiMediaElement` declaration. A manifest consumer therefore sees
// `civitai-text-input` with FIVE attributes and no `label`, `description`,
// `error`, `required`, `value`, `name`, `disabled` or `size` — eight inherited
// public fields, including the four its own React demo on apps/showcase.md uses.
// A short list that reads as complete is worse than a missing page, so every
// element whose superclass chain leaves this manifest gets a VISIBLE note naming
// the fields the manifest does not carry, derived from the installed base-class
// `.d.ts` (not hardcoded) and floor-asserted so a silent parse failure fails the
// build instead of quietly emitting "0 inherited fields".
//
// WIRED INTO predev/prebuild (scripts/gen-appblocks.mjs), and the page it writes
// is GITIGNORED, exactly like the public/appblocks/*.json artifacts. It is NOT
// the gen-appblocks-components.mjs model (a COMMITTED page, refreshed by hand):
// that generator reads a committed snapshot a drift-guard polices, so its output
// has to be reviewable in a diff. This one reads the LOCK FILE, so the page is a
// pure function of `npm ci` and regenerating it on every build is strictly
// better than asking a human to remember. A build must never rewrite a committed
// file, which is what makes gitignored the only consistent choice.
//
// USAGE
//   node scripts/gen-appblocks-element-gallery.mjs
//   (runs automatically via `npm run gen:appblocks`, i.e. predev + prebuild)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { log, repoRoot, resolvePackageRoot } from './appblocks-util.mjs';

const OUT = join(repoRoot, 'apps', 'reference', 'elements.md');

/* ───────────────────────────  base-class recovery  ────────────────────────── */

/**
 * The base classes the manifest omits, and the installed declaration file each
 * one's public fields are read out of. Keyed by the `superclass.name` the
 * manifest records, so the lookup is the manifest's own spelling.
 *
 * `floor` is the FAIL-LOUD half: a `.d.ts` reformat that broke the parse would
 * otherwise emit "0 inherited fields", i.e. the exact false reassurance this
 * whole mechanism exists to prevent. Measured against
 * @civitai/components@0.8.1 — CivitaiField 8, CivitaiMediaElement 6.
 * `CivitaiElement` has no public fields at all (only `connectedCallback` and a
 * protected `firstUpdated`), so its floor is 0 and it is listed to DOCUMENT that
 * zero rather than to leave the chain unexplained.
 */
const ABSENT_BASES = {
  CivitaiField: { dts: 'field-base.d.ts', cls: 'CivitaiField', floor: 8 },
  CivitaiMediaElement: { dts: 'media-base.d.ts', cls: 'CivitaiMediaElement', floor: 6 },
  CivitaiElement: { dts: 'base.d.ts', cls: 'CivitaiElement', floor: 0 },
  // `HTMLElementBase` is `typeof HTMLElement` with a Node shim — it adds no
  // civitai-specific field, so there is nothing for a reader to be missing.
  HTMLElementBase: { dts: 'html-element.d.ts', cls: null, floor: 0 },
};

/**
 * PUBLIC INSTANCE FIELDS declared directly on a class in a `.d.ts`.
 *
 * Line-based on purpose: these are generated declaration files, one member per
 * line at a fixed indent, and a real TS parse here would buy nothing a floor
 * assertion does not already cover. Excluded: `static`, `protected`, `private`,
 * `readonly` internals, `#private`, accessors (`get`/`set`), the constructor, and
 * anything with a `(` before its `:` — that is a method, not a field.
 */
function publicFieldsOf(dtsPath, className) {
  if (!className) return [];
  const src = readFileSync(dtsPath, 'utf8');
  const start = src.search(new RegExp(`^export declare (?:abstract )?class ${className}\\b`, 'm'));
  if (start < 0) {
    throw new Error(
      `gen-appblocks-element-gallery: no "class ${className}" in ${dtsPath}. The base-class ` +
        `layout changed; fix the parser rather than letting the gallery claim 0 inherited fields.`,
    );
  }
  const body = src.slice(start);
  const out = [];
  for (const line of body.split('\n').slice(1)) {
    if (/^\}/.test(line)) break;
    const m = /^ {4}([A-Za-z_$][\w$]*)\??: ([^;]+);\s*$/.exec(line);
    if (!m) continue;
    if (/^\s*(static|protected|private|readonly|get|set|constructor)\b/.test(line.trim())) continue;
    if (m[1] === 'constructor') continue;
    out.push({ name: m[1], type: m[2].trim() });
  }
  return out;
}

/** Resolve every absent base's public fields once, with the floor assertion. */
function resolveAbsentBases(pkgRoot) {
  const resolved = {};
  for (const [name, spec] of Object.entries(ABSENT_BASES)) {
    const fields = publicFieldsOf(join(pkgRoot, 'dist', 'elements', spec.dts), spec.cls);
    if (fields.length < spec.floor) {
      throw new Error(
        `gen-appblocks-element-gallery: parsed ${fields.length} public field(s) for ${name} ` +
          `(floor ${spec.floor}) out of dist/elements/${spec.dts}. A short list here is the exact ` +
          `silent under-report this generator exists to prevent, so this is a hard failure.`,
      );
    }
    resolved[name] = { ...spec, fields };
  }
  return resolved;
}

/* ──────────────────────────────  the manifest  ────────────────────────────── */

function readManifest(pkgRoot) {
  const path = join(pkgRoot, 'custom-elements.json');
  const cem = JSON.parse(readFileSync(path, 'utf8'));
  const elements = [];
  for (const mod of cem.modules ?? []) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;
      elements.push({ ...decl, modulePath: mod.path });
    }
  }
  if (elements.length === 0) {
    throw new Error(
      'gen-appblocks-element-gallery: custom-elements.json declared 0 tagged elements — ' +
        'refusing to write an empty gallery.',
    );
  }
  elements.sort((a, b) => a.tagName.localeCompare(b.tagName));
  return { cem, elements, path };
}

/** The React barrel's export names, so each row can name its binding (or say none). */
function reactBindings() {
  const dts = join(
    resolvePackageRoot('@civitai/components-react'),
    'dist',
    'elements',
    'index.d.ts',
  );
  const src = readFileSync(dts, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^export\s*\{\s*([A-Za-z_$][\w$]*)[^}]*\}/gm)) names.add(m[1]);
  if (names.size === 0) {
    throw new Error(
      'gen-appblocks-element-gallery: parsed 0 exports from @civitai/components-react ' +
        "dist/elements/index.d.ts — every element would be labelled 'no React binding', " +
        'which is a confident lie about 45 of them.',
    );
  }
  return names;
}

/** `civitai-text-input` -> `CivitaiTextInput`. */
const bindingNameFor = (tag) =>
  tag.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');

/* ──────────────────────────  registration bundles  ────────────────────────── */

/**
 * Which bundle defines a tag, read from the installed `register.js` /
 * `register-site.js` rather than restated — the split is a real authoring
 * decision (the five civitai-vocabulary elements are not in the generic kit) and
 * a reader who loads the wrong bundle gets an element that never upgrades.
 */
function registrationOf(pkgRoot, tags) {
  const read = (f) => readFileSync(join(pkgRoot, 'dist', 'elements', f), 'utf8');
  const defines = (src) =>
    new Set([...src.matchAll(/^import \{ (define[A-Za-z]+) \} from '\.\/([a-z-]+)\.js';/gm)].map((m) => m[2]));
  const base = defines(read('register.js'));
  const site = defines(read('register-site.js'));
  const out = new Map();
  for (const tag of tags) {
    // The define module's basename is the tag for every element in this package
    // except `civitai-tab-panel`, which `civitai-tabs.ts` declares alongside
    // `civitai-tabs` — so it registers with it.
    const owner = tag === 'civitai-tab-panel' ? 'civitai-tabs' : tag;
    if (base.has(owner)) out.set(tag, 'registerAll');
    else if (site.has(owner)) out.set(tag, 'registerSite');
    else out.set(tag, null);
  }
  return out;
}

/* ─────────────────────────────  live exemplars  ───────────────────────────── */

/**
 * ONE hand-authored exemplar per tag — the single source for both the live
 * instance and the markup fence beneath it, the same invariant
 * `<ComponentDemo>` holds on apps/showcase.md: there is no second copy that can
 * drift from what the reader sees.
 *
 * Plain HTML with ATTRIBUTES only, deliberately. Five elements take their
 * content from an ARRAY PROPERTY (`data`) that no markup can express, and their
 * `note` says so and gives the one line of JS — rather than rendering an empty
 * box as if that were the component. `note` is also where a `position: fixed`
 * host, a closed dialog, and the two SDK elements declare themselves.
 *
 * COMPLETENESS IS ENFORCED, not hoped for: `main()` fails if any manifest tag has
 * no entry here, and `scripts/check-showcase-coverage.mjs` re-asserts it against
 * the built page.
 */
const EXEMPLARS = {
  'civitai-action-button': {
    html: '<civitai-action-button label="More actions"></civitai-action-button>',
  },
  'civitai-alert': {
    html: '<civitai-alert color="success" heading="Saved" closable>Your changes are live.</civitai-alert>',
  },
  'civitai-audio': {
    html: '<civitai-audio pending alt="A track still being generated"></civitai-audio>',
    note:
      'Shown in its `pending` state — still being made, so a loader shows and nothing is ' +
      'requested. The docs ship no audio asset, and a `src` that 404s would demonstrate the ' +
      '`error` fallback rather than the player.',
  },
  'civitai-avatar': {
    html: '<civitai-avatar name="Ada Lovelace" size="md"></civitai-avatar>',
    note: 'With no `src` it falls back to initials derived from `name`.',
  },
  'civitai-badge': {
    html: '<civitai-badge variant="light" color="success">ready</civitai-badge>',
  },
  'civitai-breadcrumb': {
    html: '<civitai-breadcrumb label="Breadcrumb"></civitai-breadcrumb>',
    note:
      'The crumbs come from the `data` PROPERTY (`Crumb[]` — `{ label, href? }`), which no ' +
      'attribute can carry, so the live instance above is the empty state. Set it from JS: ' +
      "`el.data = [{ label: 'Models', href: '/models' }, { label: 'Flux.1 dev' }]`.",
  },
  'civitai-button': {
    html: '<civitai-button variant="filled" size="md">Generate</civitai-button>',
  },
  'civitai-button-group': {
    html:
      '<civitai-button-group>\n' +
      '  <civitai-button variant="outline">Grid</civitai-button>\n' +
      '  <civitai-button variant="outline">List</civitai-button>\n' +
      '  <civitai-button variant="outline">Map</civitai-button>\n' +
      '</civitai-button-group>',
    note:
      'Light DOM on purpose, so the page can reach its children with `::part()`. It injects ' +
      'its own unlayered stylesheet on connect rather than shipping shadow styles.',
  },
  'civitai-card': {
    html:
      '<civitai-card padding="md" with-border>\n' +
      '  <civitai-text weight="semibold">A bordered card</civitai-text>\n' +
      '  <civitai-text size="sm">Presentational surface container.</civitai-text>\n' +
      '</civitai-card>',
  },
  'civitai-checkbox': {
    html:
      '<civitai-checkbox label="Show mature content" description="You can change this later in settings."></civitai-checkbox>',
  },
  'civitai-collapse': {
    html:
      '<civitai-collapse heading="Advanced" open>Seed, CFG scale and sampler live in here.</civitai-collapse>',
  },
  'civitai-confirm-dialog': {
    html:
      '<civitai-confirm-dialog heading="Delete this image?" message="This cannot be undone." destructive></civitai-confirm-dialog>',
    note:
      'Rendered CLOSED, which is why the preview above is empty: `open` raises a real modal ' +
      'overlay and it would cover this page. Set `open` (or call `show()`) to raise it. It ' +
      'extends `CivitaiModal`, so every modal attribute applies to it too.',
  },
  'civitai-group': {
    html:
      '<civitai-group gap="sm">\n' +
      '  <civitai-badge variant="light">one</civitai-badge>\n' +
      '  <civitai-badge variant="light">two</civitai-badge>\n' +
      '  <civitai-badge variant="light">three</civitai-badge>\n' +
      '</civitai-group>',
  },
  'civitai-image': {
    html:
      '<civitai-image\n' +
      '  src="/images/oauth/edit-oauth-app.png"\n' +
      '  alt="The OAuth app edit screen"\n' +
      '  fit="cover"\n' +
      '  style="width: 240px; aspect-ratio: 16 / 9"\n' +
      '></civitai-image>',
    note:
      'The element reflects its load state as **`status`**, not `data-status` — the attribute ' +
      'track spells the same thing differently. It also takes `pending` (still being made) and ' +
      '`blocked` (withheld from this viewer), which the CSS pack has no equivalent for.',
  },
  'civitai-input-group': {
    html:
      '<civitai-input-group>\n' +
      '  <civitai-text-input label="Width" value="1024"></civitai-text-input>\n' +
      '  <civitai-text-input label="Height" value="1024"></civitai-text-input>\n' +
      '</civitai-input-group>',
    note:
      'Light DOM, and it reaches its children through `::part(control)` / `::part(button)` to ' +
      'collapse the inner radii. A child carrying `.affix` or `[data-affix]` renders as a ' +
      'prefix/suffix chip instead of a control.',
  },
  'civitai-loader': {
    html: '<civitai-loader size="md" label="Loading"></civitai-loader>',
  },
  'civitai-media-card': {
    html:
      '<civitai-media-card label="Open the preview" style="width: 240px">\n' +
      '  <civitai-image slot="media" src="/images/oauth/edit-oauth-app.png" alt=""></civitai-image>\n' +
      '  <civitai-badge slot="top-start" variant="filled">new</civitai-badge>\n' +
      '  <span slot="bottom">A generated preview</span>\n' +
      '</civitai-media-card>',
  },
  'civitai-menu': {
    html:
      '<civitai-menu label="Image actions">\n' +
      '  <civitai-button slot="trigger" variant="light">Actions</civitai-button>\n' +
      '  <civitai-menu-label>On this image</civitai-menu-label>\n' +
      '  <civitai-menu-item value="copy">Copy prompt</civitai-menu-item>\n' +
      '  <civitai-menu-item value="remix">Remix</civitai-menu-item>\n' +
      '  <civitai-menu-item value="delete" destructive>Delete</civitai-menu-item>\n' +
      '</civitai-menu>',
    note:
      'Rendered CLOSED — click the trigger to open it. `open` is an attribute, but a popover ' +
      'pinned open in a docs page overlaps whatever follows it. Selection arrives as a `select` ' +
      'event carrying the item `value`.',
  },
  'civitai-menu-item': {
    html: '<civitai-menu-item value="copy">Copy prompt</civitai-menu-item>',
    note: 'Belongs inside a `<civitai-menu>`; shown standalone so its own chrome is legible.',
  },
  'civitai-menu-label': {
    html: '<civitai-menu-label>On this image</civitai-menu-label>',
    note: 'A non-interactive section heading inside a `<civitai-menu>`.',
  },
  'civitai-modal': {
    html:
      '<civitai-modal heading="Generation settings">Steps, CFG and sampler.</civitai-modal>',
    note:
      'Rendered CLOSED, which is why the preview above is empty: `open` raises a real overlay ' +
      'over the whole page. Set `open` to raise it.',
  },
  'civitai-nav-item': {
    html: '<civitai-nav-item href="#" label="Models" current></civitai-nav-item>',
  },
  'civitai-nav-list': {
    html:
      '<civitai-nav-list label="Sections">\n' +
      '  <civitai-nav-item href="#models" label="Models"></civitai-nav-item>\n' +
      '  <civitai-nav-item href="#images" label="Images"></civitai-nav-item>\n' +
      '  <civitai-nav-item href="#articles" label="Articles"></civitai-nav-item>\n' +
      '</civitai-nav-list>',
    note: 'Its `current` attribute marks one child by `href`, so the page sets it in one place.',
  },
  'civitai-number-input': {
    html:
      '<civitai-number-input label="Steps" description="Sampling steps (1–50)." min="1" max="50" value="30"></civitai-number-input>',
  },
  'civitai-pagination': {
    html: '<civitai-pagination page="3" total="9"></civitai-pagination>',
  },
  'civitai-progress': {
    html: '<civitai-progress value="42" label="Rendering" show-value></civitai-progress>',
  },
  'civitai-radio-group': {
    html: '<civitai-radio-group label="Sampler" orientation="vertical"></civitai-radio-group>',
    note:
      'The options come from the `data` PROPERTY (`RadioOption[]` — `{ value, label, disabled? }`), ' +
      'which no attribute can carry, so the live instance above shows the label and no options. ' +
      "Set it from JS: `el.data = [{ value: 'euler', label: 'Euler a' }]`. 🔴 There is no " +
      '`<civitai-radio>`: native `name` exclusion is tree-scoped, so radios in sibling shadow ' +
      'roots would never group, and one element owns the whole set to keep that native.',
  },
  'civitai-rating-badge': {
    html: '<civitai-rating-badge rating="pg13"></civitai-rating-badge>',
    note:
      "`rating` is the off-site content-rating ladder as `block.manifest.json` spells it — `g` · " +
      '`pg` · `pg13` · `r` · `x`. The manifest types it as a bare `string`, so those five values ' +
      'are not discoverable from `custom-elements.json`.',
  },
  'civitai-reaction': {
    html: '<civitai-reaction emoji="👍" count="12" label="Like"></civitai-reaction>',
  },
  'civitai-segmented-control': {
    html: '<civitai-segmented-control label="Layout" size="md"></civitai-segmented-control>',
    note:
      'The segments come from the `data` PROPERTY (`SegmentItem[]` — `{ value, label, disabled? }`), ' +
      'which no attribute can carry, so the live instance above is the empty state. Set it from ' +
      "JS: `el.data = [{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]`. " +
      'This element is the `radiogroup` mode ONLY — tabs are `<civitai-tabs>`, because a tab’s ' +
      '`aria-controls` is an IDREF and an IDREF cannot reach a light-DOM panel from inside a ' +
      'shadow root.',
  },
  'civitai-select': {
    html: '<civitai-select label="Base model" placeholder="Pick a base model"></civitai-select>',
    note:
      'The options come from the `data` PROPERTY (`SelectOption[]` — `{ value, label, disabled? }`), ' +
      'which no attribute can carry, so the live instance above shows only the placeholder. Set ' +
      "it from JS: `el.data = [{ value: 'flux', label: 'Flux.1 dev' }]`.",
  },
  'civitai-sign-in-button': {
    html: null,
    note:
      '🔴 **Not instantiated on this page, and not registered by either bundle.** It lives under ' +
      "the package's `src/sdk/`, `import`s `@civitai/sdk`, and on connect asks for a host " +
      'transport (`getTransport()` / `createHost()`) — off civitai.com there is no validated host ' +
      'origin, so it stays inert and `render()` returns nothing. An empty box here would read as ' +
      'a broken component rather than a missing precondition. Register it yourself with ' +
      "`import '@civitai/components/civitai-sign-in-button/define'`, and give it either a " +
      '`signIn` from `createSignIn()` (an app of its own) or a real parent frame (a block).',
  },
  'civitai-slider': {
    html:
      '<civitai-slider label="Steps" min="1" max="50" value="20" show-value></civitai-slider>',
    note:
      '🔴 `show-value` renders the RAW value and sets no `aria-valuetext`. A formatted read-out ' +
      '(`20%`, `Large`) needs you to set `aria-valuetext` yourself — the deleted React `<Slider>` ' +
      'did it from a `valueLabel` prop, and that prop has no element equivalent.',
  },
  'civitai-stack': {
    html:
      '<civitai-stack gap="sm">\n' +
      '  <civitai-badge variant="light">one</civitai-badge>\n' +
      '  <civitai-badge variant="light">two</civitai-badge>\n' +
      '</civitai-stack>',
  },
  'civitai-switch': {
    html: '<civitai-switch label="Public" description="Anyone with the link can view." checked></civitai-switch>',
    note:
      'Extends `CivitaiCheckbox`, which is itself a field — so it inherits BOTH that class’s ' +
      'declared members and the field members this manifest omits.',
  },
  'civitai-table': {
    html:
      '<civitai-table with-border striped>\n' +
      '  <table>\n' +
      '    <caption>Recent generations</caption>\n' +
      '    <thead>\n' +
      '      <tr><th>Model</th><th>Steps</th><th data-numeric>Buzz</th></tr>\n' +
      '    </thead>\n' +
      '    <tbody>\n' +
      '      <tr><td>Flux.1 dev</td><td>20</td><td data-numeric>14</td></tr>\n' +
      '      <tr><td>SDXL 1.0</td><td>30</td><td data-numeric>9</td></tr>\n' +
      '    </tbody>\n' +
      '  </table>\n' +
      '</civitai-table>',
    note:
      'Light DOM on purpose: a slotted `<tr>` inside a shadow `<table>` leaves the table ' +
      'formatting context and stops being a row, so this styles a table the page already owns — ' +
      'including one a data grid generated. The styling attributes it reads (`with-border`, ' +
      '`striped`, `hoverable`, `dense`, `sticky-header`, and `data-numeric` on a cell) are set on ' +
      'the host and the cells, and the manifest lists NONE of them: it records 0 attributes and 0 ' +
      'members for this element.',
  },
  'civitai-tab-panel': {
    html: '<civitai-tab-panel value="grid">The grid panel.</civitai-tab-panel>',
    note:
      'Declared in `civitai-tabs.ts` alongside `<civitai-tabs>`, so it registers with it. Its ' +
      '`value` is a read-only accessor over the `value` attribute, which is how `<civitai-tabs>` ' +
      'matches a panel to a tab.',
  },
  'civitai-tabs': {
    html:
      '<civitai-tabs value="grid">\n' +
      '  <civitai-tab-panel value="grid">The grid panel.</civitai-tab-panel>\n' +
      '  <civitai-tab-panel value="list">The list panel.</civitai-tab-panel>\n' +
      '</civitai-tabs>',
    note:
      'The tab STRIP comes from the `data` PROPERTY (`TabItem[]` — `{ value, label, disabled? }`), ' +
      'which no attribute can carry, so the live instance above renders its panels and no tabs. ' +
      "Set it from JS: `el.data = [{ value: 'grid', label: 'Grid' }, { value: 'list', label: " +
      "'List' }]`. Light DOM, for the IDREF reason under `<civitai-segmented-control>`.",
  },
  'civitai-tag': {
    html: '<civitai-tag name="landscape" score="42" show-score></civitai-tag>',
  },
  'civitai-text': {
    html: '<civitai-text as="h2" size="2xl" weight="bold">Generate an image</civitai-text>',
    note:
      '🔴 `color: inherit`, not the text token — on both tracks. Text renders in whatever colour ' +
      'it inherits, so an ancestor `color` wins over `--civitai-color-text`. Colour, alignment ' +
      'and truncation are `ci-*` utilities in `@civitai/components/utilities.css`, a separate ' +
      'sheet neither `injectStyles()` nor `injectBlocksStyles()` injects.',
  },
  'civitai-text-input': {
    html:
      '<civitai-text-input label="Display name" description="Shown on your profile." placeholder="ada" required></civitai-text-input>',
    note:
      '🔴 The manifest lists FIVE attributes for this element and omits every one the React demo ' +
      'on the [component showcase](/apps/showcase) uses — `label`, `description`, `error`, ' +
      '`required` — because they are inherited. See the inherited-fields note below.',
  },
  'civitai-textarea': {
    html:
      '<civitai-textarea label="Prompt" description="Describe what you want to generate." rows="3" placeholder="a serene alpine lake at dawn"></civitai-textarea>',
  },
  'civitai-toast': {
    html:
      '<civitai-toast color="info" heading="Heads up" closable>A new model version is available.</civitai-toast>',
    note:
      'Shown outside a region so the card is legible. In an app a toast is a child of a ' +
      '`<civitai-toast-region>`, which is what makes it announced.',
  },
  'civitai-toast-region': {
    html:
      '<civitai-toast-region>\n' +
      '  <civitai-toast color="success" heading="Saved">Your changes are live.</civitai-toast>\n' +
      '</civitai-toast-region>',
    note:
      'The region is `position: fixed` (a bottom-right stack over everything else), so the ' +
      'preview above puts it in a `contain: paint` box — that box becomes the containing block ' +
      'for fixed descendants and the stack renders in place instead of floating over this page. ' +
      'The real API is imperative: `region.show({ message, heading, color, duration, urgent })` ' +
      'enqueues a toast, owns its auto-dismiss timer and returns its id. The manifest records 0 ' +
      'attributes for this element, which is accurate — `show`, `dismiss`, `clear`, `label`, ' +
      '`defaultDuration` and `toasts` are members, not attributes.',
  },
  'civitai-tooltip': {
    html:
      '<civitai-tooltip label="Randomize the seed">\n' +
      '  <civitai-button variant="light">Seed</civitai-button>\n' +
      '</civitai-tooltip>',
    note:
      'Hover or focus the trigger to reveal the bubble. It wires the trigger’s ' +
      '`aria-describedby` and Escape-to-dismiss for you — that is the whole reason to prefer it ' +
      'over the hand-HTML tooltip, which reveals on `:hover` alone.',
  },
  'civitai-video': {
    html: '<civitai-video pending alt="A clip still being generated"></civitai-video>',
    note:
      'Shown in its `pending` state for the reason `<civitai-audio>` is: the docs ship no video ' +
      'asset, and a 404 `src` would demonstrate the `error` fallback rather than the player.',
  },
  'civitai-workflow-button': {
    html: null,
    note:
      '🔴 **Not instantiated on this page, and not registered by either bundle.** It lives under ' +
      "the package's `src/sdk/`, `import`s `@civitai/sdk`, and drives a real orchestrator " +
      'workflow — pricing it, asking for consent, submitting it and polling to a terminal state. ' +
      'Off a host with a token there is nothing for it to do, and an inert button here would read ' +
      'as a broken component. Register it with ' +
      "`import '@civitai/components/civitai-workflow-button/define'`. At 16 attributes and 39 " +
      'members it is the largest element in the package, and 6 of its own events ' +
      '(`priced`, `submitted`, `progress`, `finished`, `canceled`, `error`) are the workflow ' +
      'lifecycle.',
  },
};

/* ────────────────────────────────  rendering  ─────────────────────────────── */

/**
 * 🔴 BACKSLASH BEFORE PIPE, IN BOTH HELPERS BELOW, AND THE ORDER IS THE POINT.
 * Escaping `|` -> `\|` without first escaping a pre-existing `\` turns an input
 * ending in a backslash into `\\|`: an escaped BACKSLASH followed by a BARE pipe.
 * A spec-strict GFM parser (cmark-gfm — GitHub, and whatever consumes the `.md`
 * twin this page is also served as) splits the row there and shifts every column
 * after it. Same defect the code-span note below records, in a narrower form;
 * CodeQL `js/incomplete-sanitization` caught this one.
 *
 * MEASURED, NOT DEDUCED — rendered through a real `npm run build`, with
 * `custom-elements.json` doctored to carry the pathological strings (`a\|b` as a
 * type, `t\` as a default, `p\|q` as a slot description) and the row HTML read
 * back out of `.vitepress/dist`. VitePress renders with markdown-it, whose table
 * layer strips exactly ONE backslash before a pipe and does not process `\\`:
 *
 *   path    input   BEFORE the fix           AFTER (this code)
 *   esc()   p\|q    `p|q`  — backslash LOST   `p\|q`  — faithful
 *   code()  a\|b    `a\|b` — right by luck    `a\\|b` — backslash doubled
 *   code()  t\      `t\`   — right by luck    `t\\`   — backslash doubled
 *
 * Cell counts were 2 and 5 (correct) in every one of those runs, so markdown-it
 * never actually split the row — the row-splitting half of the finding does NOT
 * reproduce on THIS renderer. It does on a spec-strict one, which is why this is
 * worth fixing rather than waving away, and `esc()` was losing a character anyway.
 *
 * THE COST, stated because it is real: inside a CODE SPAN markdown-it leaves `\\`
 * literal, so a backslash in a type string now displays doubled on this site
 * (it is correct on cmark-gfm). Unreachable today — 0 of the 3,789 strings in
 * `@civitai/components@0.8.1`'s manifest contain a backslash at all, re-derived
 * with a positive control that plants one and must find it (the first version of
 * that probe tested for TWO backslashes and its control came back 0 — a broken
 * instrument reporting a reassuring zero). A doubled character is a smaller fault
 * than a shifted table either way. Do not "fix" the doubling by dropping the
 * backslash escape; that is the hazard above, restored.
 */
const esc = (s) =>
  String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
/**
 * A code span safe inside a GFM TABLE CELL. The pipe escape is load-bearing, not
 * cosmetic: half the element types in this manifest are unions (`Intent | ''`,
 * `'sm' | 'md' | 'lg'`), and an unescaped `|` inside a code span still splits the
 * row — `| \`Intent | ''\` |` renders as two cells and shifts every column after
 * it. Caught on the first generated page. Backslash ordering: see the note above.
 */
const code = (s) =>
  '`' + String(s).replace(/`/g, '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|') + '`';

/** First sentence-ish line of a CEM description, for the one-line summary. */
function summaryOf(decl) {
  const d = (decl.description ?? '').trim();
  if (!d) return '';
  const firstPara = d.split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ').trim();
  return firstPara;
}

function attrTable(decl) {
  const attrs = decl.attributes ?? [];
  if (attrs.length === 0) return '_No attributes in the manifest._';
  const fields = new Map((decl.members ?? []).filter((m) => m.kind === 'field').map((m) => [m.name, m]));
  const rows = attrs.map((a) => {
    const prop = a.fieldName && a.fieldName !== a.name ? code(a.fieldName) : code(a.name);
    const member = a.fieldName ? fields.get(a.fieldName) : undefined;
    const type = a.type?.text ?? member?.type?.text ?? '—';
    const dflt = a.default ?? member?.default;
    const reflects = member?.reflects ? 'yes' : '—';
    return `| ${code(a.name)} | ${prop} | ${code(type)} | ${dflt === undefined ? '—' : code(dflt)} | ${reflects} |`;
  });
  return [
    '| Attribute | Property | Type | Default | Reflects |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function slotsAndEvents(decl) {
  const out = [];
  const slots = decl.slots ?? [];
  const events = decl.events ?? [];
  if (slots.length) {
    out.push(
      '| Slot | What goes in it |',
      '|---|---|',
      ...slots.map(
        (s) => `| ${s.name ? code(s.name) : '_(default)_'} | ${esc(s.description ?? '—')} |`,
      ),
    );
  }
  if (events.length) {
    if (out.length) out.push('');
    out.push(
      '| Event | Detail | What it means |',
      '|---|---|---|',
      ...events.map(
        (e) =>
          `| ${code(e.name)} | ${e.type?.text ? code(e.type.text) : '—'} | ${esc(e.description ?? '—')} |`,
      ),
    );
  }
  if (!out.length) return '_No slots or events in the manifest._';
  return out.join('\n');
}

/**
 * THE GAP NOTE. Walks the superclass chain against the manifest's own
 * declarations and names every base it does not carry, plus the public fields a
 * reader therefore cannot see on this element.
 *
 * Returns '' only when the chain is fully declared OR the absent bases genuinely
 * add no public field — never because the walk gave up, which throws instead.
 */
function renderGap(decl, byClassName, bases) {
  const missing = [];
  let cur = decl;
  const seen = new Set();
  while (cur?.superclass?.name) {
    const name = cur.superclass.name;
    if (seen.has(name)) break;
    seen.add(name);
    const declared = byClassName.get(name);
    if (declared) {
      cur = declared;
      continue;
    }
    const base = bases[name];
    if (!base) {
      throw new Error(
        `gen-appblocks-element-gallery: <${decl.tagName}> extends "${name}", which is neither a ` +
          `manifest declaration nor a known absent base. Add it to ABSENT_BASES — leaving it out ` +
          `would silently drop whatever public fields it contributes.`,
      );
    }
    missing.push({ name, fields: base.fields });
    break; // the absent base's own chain is not in the manifest either
  }
  const withFields = missing.filter((m) => m.fields.length > 0);
  if (withFields.length === 0) return '';
  const lines = ['::: danger The manifest does not list these inherited fields', ''];
  for (const m of withFields) {
    lines.push(
      `\`<${decl.tagName}>\` inherits **${m.fields.length}** public field(s) from ` +
        `\`${m.name}\`, which \`custom-elements.json\` carries **no declaration for** — the ` +
        `manifest's generator globs \`civitai-*.ts\` only, so a base class is invisible to it. ` +
        `They work as attributes and as properties, and the table above does not mention them:`,
      '',
      ...m.fields.map((f) => `- ${code(f.name)} — ${code(f.type)}`),
      '',
      `Read them off the installed declaration file rather than the manifest: ` +
        `\`@civitai/components/dist/elements/${bases[m.name].dts}\`.`,
      '',
    );
  }
  lines.push(':::');
  return lines.join('\n');
}

function renderElement(decl, ctx) {
  const { reactNames, registration, byClassName, bases } = ctx;
  const tag = decl.tagName;
  const binding = bindingNameFor(tag);
  const hasBinding = reactNames.has(binding);
  const reg = registration.get(tag);
  const ex = EXEMPLARS[tag];

  const meta = [
    code(decl.modulePath),
    `extends ${code(decl.superclass?.name ?? '—')}`,
    hasBinding ? `React ${code(binding)}` : '**no React binding**',
    reg ? `registered by ${code(reg + '()')}` : '**registered by neither bundle**',
  ].join(' · ');

  const parts = [`### \`<${tag}>\``, '', meta, ''];
  const summary = summaryOf(decl);
  if (summary) parts.push(summary, '');

  if (ex.html) {
    const wrapper =
      tag === 'civitai-toast-region'
        ? ['<ElementPreview contain>', ex.html, '</ElementPreview>']
        : ['<ElementPreview>', ex.html, '</ElementPreview>'];
    parts.push(wrapper.join('\n'), '', '```html', ex.html, '```', '');
  }
  if (ex.note) parts.push(ex.note, '');

  parts.push(attrTable(decl), '', slotsAndEvents(decl), '');
  const gap = renderGap(decl, byClassName, bases);
  if (gap) parts.push(gap, '');
  return parts.join('\n');
}

function buildPage({ elements, version, reactNames, registration, byClassName, bases, coverage }) {
  const ctx = { reactNames, registration, byClassName, bases };
  const frontmatter = [
    '---',
    'title: Element gallery',
    'description: Every <civitai-*> custom element the @civitai/components package defines — tag, attributes with defaults, slots, events and a live instance, generated from the custom-elements.json that ships in the published tarball.',
    'sources:',
    '  - npm:@civitai/components/custom-elements.json',
    '---',
  ].join('\n');

  const banner = [
    '<!--',
    '  GENERATED FILE — do not edit by hand, and do not commit it.',
    '  Produced by scripts/gen-appblocks-element-gallery.mjs from the',
    '  custom-elements.json inside the pinned @civitai/components devDep, on',
    '  predev/prebuild. Change the generator, not this file.',
    '-->',
  ].join('\n');

  const intro = [
    '# Element gallery',
    '',
    `All **${elements.length}** \`<civitai-*>\` custom elements \`@civitai/components\` defines,`,
    `generated from the \`custom-elements.json\` that ships inside the published`,
    `package (v${version}) — so it cannot drift from the version this site pins.`,
    '',
    'The elements are the design system\'s **second consumption track**, and the one',
    '`@civitai/components-react` binds: they style themselves in shadow DOM and inject',
    'the `@civitai/theme` tokens on first mount, so there is no stylesheet to load.',
    `**${reactNames.size}** of the ${elements.length} have a React binding. The`,
    '[component showcase](/apps/showcase) and the',
    '[components reference](/apps/reference/components) cover the OTHER track — the 21',
    '`data-civitai-ui` names in the CSS pack — and most of the elements below have no',
    'rule in that sheet at all.',
    '',
    '## Registering them',
    '',
    'Nothing below upgrades until the custom element is defined. Two bundles, and you',
    'load one or the other (two disjoint bundles would each carry their own copy of Lit):',
    '',
    '```js',
    "// the generic kit — every element marked `registerAll()` below",
    "import '@civitai/components/register';",
    'registerAll();',
    '',
    "// or the civitai vocabulary ON TOP of it — adds the `registerSite()` rows",
    "import '@civitai/components/register-site';",
    'registerSite();',
    '',
    "// or a single element, tree-shaken:",
    "import '@civitai/components/civitai-button/define';",
    '```',
    '',
    'Each is safe to call more than once. A duplicate `customElements.define` would',
    'throw and abort the rest of the calling module, so a conflict no-ops and warns',
    'instead — which is also how a second, older copy of the package on the page',
    'announces itself.',
    '',
    '## What the manifest does and does not carry',
    '',
    'This page is only as complete as its source, so here is that source measured',
    `rather than described. Of the ${elements.length} elements, \`custom-elements.json\``,
    'records:',
    '',
    '| | elements |',
    '|---|---|',
    `| at least one \`attributes\` entry | **${coverage.withAttrs}** / ${elements.length} |`,
    `| at least one \`members\` entry (where \`default\` and \`reflects\` live) | **${coverage.withMembers}** / ${elements.length} |`,
    `| at least one \`slots\` entry | **${coverage.withSlots}** / ${elements.length} |`,
    `| at least one \`events\` entry | **${coverage.withEvents}** / ${elements.length} |`,
    '',
    '🔴 **And one gap that is not a count: the manifest has no base-class',
    'declarations.** Its generator globs `civitai-*.ts`, so `CivitaiField`,',
    '`CivitaiElement` and `CivitaiMediaElement` are absent, and every field element',
    'loses the eight public fields it inherits — `name`, `value`, `label`,',
    '`description`, `error`, `required`, `disabled`, `size`. `<civitai-text-input>`',
    'lists five attributes and omits exactly the four its own React example uses. Each',
    'affected element below carries a note naming what is missing; those lists are read',
    'out of the installed `dist/elements/*.d.ts` at generation time, not restated here.',
    '',
    '## Elements',
    '',
    '',
  ].join('\n');

  const body = elements.map((d) => renderElement(d, ctx)).join('\n');
  return `${frontmatter}\n${banner}\n\n${intro}${body}`;
}

/* ──────────────────────────────────  main  ────────────────────────────────── */

function main() {
  const pkgRoot = resolvePackageRoot('@civitai/components');
  const version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;
  const { elements } = readManifest(pkgRoot);

  const missingExemplars = elements.map((e) => e.tagName).filter((t) => !(t in EXEMPLARS));
  const staleExemplars = Object.keys(EXEMPLARS).filter(
    (t) => !elements.some((e) => e.tagName === t),
  );
  if (missingExemplars.length || staleExemplars.length) {
    throw new Error(
      `gen-appblocks-element-gallery: EXEMPLARS is out of step with custom-elements.json.\n` +
        (missingExemplars.length
          ? `  no exemplar for: ${missingExemplars.join(', ')}\n` +
            `  Add one (with a \`note\` if it cannot be shown live) — an element with no live\n` +
            `  instance is the under-report this page exists to end.\n`
          : '') +
        (staleExemplars.length
          ? `  exemplar for a tag the package no longer defines: ${staleExemplars.join(', ')}\n`
          : ''),
    );
  }

  const bases = resolveAbsentBases(pkgRoot);
  const byClassName = new Map(elements.map((e) => [e.name, e]));
  const coverage = {
    withAttrs: elements.filter((e) => (e.attributes ?? []).length > 0).length,
    withMembers: elements.filter((e) => (e.members ?? []).length > 0).length,
    withSlots: elements.filter((e) => (e.slots ?? []).length > 0).length,
    withEvents: elements.filter((e) => (e.events ?? []).length > 0).length,
  };

  const page = buildPage({
    elements,
    version,
    reactNames: reactBindings(),
    registration: registrationOf(pkgRoot, elements.map((e) => e.tagName)),
    byClassName,
    bases,
    coverage,
  });
  writeFileSync(OUT, page);
  log(
    `element-gallery: wrote ${elements.length} elements -> apps/reference/elements.md ` +
      `(@civitai/components v${version}; manifest attrs ${coverage.withAttrs}/${elements.length}, ` +
      `slots ${coverage.withSlots}, events ${coverage.withEvents})`,
  );
}

main();
