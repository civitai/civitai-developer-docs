#!/usr/bin/env node
/**
 * check-boot-skeleton.mjs
 * -----------------------
 * Pins the `manifest.bootSkeleton` contract the docs teach.
 *
 * WHY THIS EXISTS
 * ---------------
 * `bootSkeleton: true` makes the full-page run host stand down THREE things it
 * otherwise uses to hide the iframe while a block loads: an opaque branded veil,
 * the iframe's `opacity: 0`, and a `translateY(8px)` reveal settle. The key is
 * therefore a DECLARATION that the document already paints something. Declared
 * over an empty `#root` it produces a blank iframe for the whole load —
 * strictly worse than not opting in.
 *
 * Nothing validates that on the platform today. So the docs are the only thing
 * an author has, and a doc example that quietly stops satisfying the rule it
 * teaches is worse than no example: it is a copy-pasteable blank page.
 *
 * WHY IT BLOCKS A PR
 * ------------------
 * Repo doctrine (see .github/workflows/appblocks-drift.yml): a check with an
 * UPSTREAM input is scheduled and non-blocking; a REPO-LOCAL invariant blocks.
 * This is repo-local in the strongest sense — it reads two committed markdown
 * files and nothing else. No network, no snapshot, no pinned dep, so it cannot
 * false-fail because someone else published something. It runs as a step of
 * `typecheck-snippets` in .github/workflows/appblocks-snippets.yml, which is a
 * REQUIRED status check on `main` (measured 2026-09-02:
 * `gh api repos/civitai/civitai-developer-docs/branches/main/protection` ->
 * contexts test-cli, test-messages, test-bridge, typecheck-snippets,
 * build-site, test-md-regions).
 *
 * WHAT IS CHECKED
 *   STRUCTURAL (the strong half — these pin code, not words):
 *     1. Every `html` fence in the guide that carries `[data-boot-skeleton]`
 *        SATISFIES the real gate rule, implemented here as `bootSkeletonGate()`
 *        rather than described in prose.
 *     2. The same function is TABLE-TESTED against fixtures that MUST fail —
 *        key + empty `#root`, marker outside the container, a container holding
 *        only whitespace / a comment / a `<script>`. A rule that has only ever
 *        seen a passing input has not been shown to do anything.
 *     3. The complete `index.html` example keeps its DARK default: the dark
 *        values live in the BASE rules, there is NO
 *        `@media (prefers-color-scheme: dark)` block, and
 *        `<meta name="color-scheme">` is `dark light` (dark FIRST). Darkness is
 *        asserted by RELATIVE LUMINANCE of the parsed hex, not by a keyword, so
 *        "tidying" the example into a light default fails here.
 *     4. The manifest-reference pointer sits OUTSIDE the generated region.
 *   PROSE (the weak half — labelled as such in the output):
 *     5. Three non-negotiables are stated. Pinned as NORMALISED WHOLE SENTENCES
 *        rather than keywords, so a reword fails loudly instead of walking past
 *        a keyword match. A cosmetic reword must update this file; that cost is
 *        the point.
 *
 * USAGE
 *   npm run check:boot-skeleton
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { repoRoot } from './appblocks-util.mjs';

/** The guide page that carries the contract and the copy-pasteable example. */
export const GUIDE = 'apps/guide/embedding.md';

/** The reference page that must carry a pointer, outside the generated region. */
export const REFERENCE = 'apps/reference/manifest.md';

/** Minimum number of `[data-boot-skeleton]` html fences the guide must carry. */
export const MIN_SKELETON_FENCES = 2;

/**
 * Elements that do not count as "the container paints something". From the
 * contract's gate rule 3. The walk does not DESCEND into these either, which is
 * what makes a container holding only a `<script>` fail: the script's text is
 * real text, but it is not painted.
 */
export const NON_PAINTING_TAGS = new Set(['script', 'template', 'style', 'link', 'noscript']);

/** Selectors that identify a mount container, from the contract's gate rule 1. */
const CONTAINER_IDS = new Set(['root', 'app']);
const CONTAINER_ATTR = 'data-app-root';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

// ---------------------------------------------------------------------------
// A small, self-contained HTML tree builder.
//
// Deliberately not a dependency: the only parser reachable from this repo's
// lockfile is an INDIRECT transitive of vitepress, which a chart bump could
// take away without touching anything this repo declares. The inputs here are
// a doc example and hand-written fixtures, and the fixtures below are what
// exercise the tricky parts (comments, raw-text elements, void elements,
// nesting) rather than a claim that this handles arbitrary HTML.
// ---------------------------------------------------------------------------

function parseAttrs(raw) {
  const attrs = new Map();
  const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

export function parseHtml(html) {
  const root = { type: 'root', tag: '#root-node', attrs: new Map(), children: [], parent: null };
  const stack = [root];
  let i = 0;
  const push = (node) => {
    node.parent = stack[stack.length - 1];
    stack[stack.length - 1].children.push(node);
    return node;
  };

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      const text = html.slice(i);
      if (text) push({ type: 'text', value: text, children: [] });
      break;
    }
    if (lt > i) push({ type: 'text', value: html.slice(i, lt), children: [] });

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      const stop = end === -1 ? html.length : end + 3;
      push({ type: 'comment', value: html.slice(lt + 4, end === -1 ? html.length : end), children: [] });
      i = stop;
      continue;
    }
    if (html.startsWith('<!', lt)) {
      // doctype or other declaration — skipped, contributes no node
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    if (html.startsWith('</', lt)) {
      const end = html.indexOf('>', lt);
      const tag = html.slice(lt + 2, end === -1 ? html.length : end).trim().toLowerCase();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tag === tag) {
          stack.length = s;
          break;
        }
      }
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const end = html.indexOf('>', lt);
    if (end === -1) {
      push({ type: 'text', value: html.slice(lt), children: [] });
      break;
    }
    let inner = html.slice(lt + 1, end);
    const selfClosing = inner.endsWith('/');
    if (selfClosing) inner = inner.slice(0, -1);
    const sp = inner.search(/\s/);
    const tag = (sp === -1 ? inner : inner.slice(0, sp)).toLowerCase();
    const attrs = parseAttrs(sp === -1 ? '' : inner.slice(sp));
    const node = push({ type: 'element', tag, attrs, children: [] });
    i = end + 1;

    if (VOID_TAGS.has(tag) || selfClosing) continue;

    if (RAW_TEXT_TAGS.has(tag)) {
      const closeIdx = html.toLowerCase().indexOf(`</${tag}`, i);
      const stop = closeIdx === -1 ? html.length : closeIdx;
      const text = html.slice(i, stop);
      if (text) {
        node.children.push({ type: 'text', value: text, children: [], parent: node });
      }
      const gt = closeIdx === -1 ? -1 : html.indexOf('>', closeIdx);
      i = gt === -1 ? html.length : gt + 1;
      continue;
    }
    stack.push(node);
  }
  return root;
}

function* walk(node) {
  for (const child of node.children) {
    yield child;
    yield* walk(child);
  }
}

function isContainer(node) {
  if (node.type !== 'element') return false;
  const id = node.attrs.get('id');
  return (id !== undefined && CONTAINER_IDS.has(id)) || node.attrs.has(CONTAINER_ATTR);
}

/** Does the container's subtree paint anything? Contract gate rule 3. */
function containerPaints(container) {
  const queue = [...container.children];
  while (queue.length) {
    const n = queue.shift();
    if (n.type === 'text') {
      if (n.value.trim()) return true;
      continue;
    }
    if (n.type === 'comment') continue;
    if (n.type !== 'element') continue;
    if (NON_PAINTING_TAGS.has(n.tag)) continue; // and do not descend
    return true;
  }
  return false;
}

function describe(node) {
  const id = node.attrs?.get('id');
  return id ? `#${id}` : `<${node.tag} ${CONTAINER_ATTR}>`;
}

/**
 * THE GATE. A faithful implementation of the contract's blocking rule, so the
 * doc example is graded by the rule itself and not by a description of it.
 *
 * @returns {{ok: boolean, failures: string[], warnings: string[], containers: number}}
 */
export function bootSkeletonGate(html) {
  const doc = parseHtml(html);
  const nodes = [...walk(doc)];
  const containers = nodes.filter(isContainer);
  const failures = [];
  const warnings = [];

  // Rule 2 — no identifiable mount container: PASS, this gate does not guess.
  if (containers.length === 0) {
    return { ok: true, failures, warnings, containers: 0 };
  }

  // Rule 3 — every container must paint something.
  for (const c of containers) {
    if (!containerPaints(c)) {
      failures.push(
        `manifest declares bootSkeleton: true but ${describe(c)} is empty in the built index.html — ` +
          'the run host stands down its loading veil for this app, so the viewer would see a blank ' +
          'iframe for the whole load. Either paint a boot state inside the container, or remove ' +
          'bootSkeleton from the manifest.'
      );
    }
  }

  // Rule 4 — a marker outside every container is never replaced by the render.
  const containerSet = new Set(containers);
  const inAContainer = (node) => {
    for (let p = node.parent; p; p = p.parent) if (containerSet.has(p)) return true;
    return false;
  };
  for (const n of nodes) {
    if (n.type !== 'element' || !n.attrs.has('data-boot-skeleton')) continue;
    if (!inAContainer(n)) {
      failures.push(
        'the [data-boot-skeleton] element is outside the mount container, so the app\'s own render ' +
          'will not replace it and it will stay on screen after mount.'
      );
    }
  }

  // ADVISORY — the boot content must not depend on a second round-trip.
  if (failures.length === 0) {
    const styledInline = nodes.some(
      (n) => n.type === 'element' && n.attrs.has('style') && inAContainer(n)
    );
    const styleTagMatches = nodes.some(
      (n) =>
        n.type === 'element' &&
        n.tag === 'style' &&
        n.children.some((c) => c.type === 'text' && c.value.includes('data-boot-skeleton'))
    );
    if (!styleTagMatches && !styledInline) {
      warnings.push(
        'bootSkeleton-paints-without-network: no <style> mentioning data-boot-skeleton and no inline ' +
          'style= inside a container — the boot content is styled only by an external stylesheet.'
      );
    }
  }

  return { ok: failures.length === 0, failures, warnings, containers: containers.length };
}

// ---------------------------------------------------------------------------
// Fixtures. The table test is the instrument's own negative control: a rule
// that has only ever been shown a passing input is indistinguishable from a
// rule wired to nothing.
// ---------------------------------------------------------------------------

export const FIXTURES = [
  {
    name: 'contract example — marker inside #root',
    expect: 'pass',
    html: '<body><div id="root"><div data-boot-skeleton aria-hidden="true"><div class="bar"></div></div></div><style>[data-boot-skeleton]{}</style></body>',
  },
  {
    name: 'static app — real content in #app, no marker',
    expect: 'pass',
    html: '<body><main id="app"><h1>Hello</h1></main></body>',
  },
  {
    name: 'no identifiable container — gate does not guess',
    expect: 'pass',
    html: '<body><div class="mount"></div></body>',
  },
  {
    name: '(a) key + empty #root',
    expect: 'fail',
    html: '<body><div id="root"></div><script type="module" src="/x.js"></script></body>',
  },
  {
    name: '(b) marker OUTSIDE #root (a sibling)',
    expect: 'fail',
    html: '<body><div data-boot-skeleton aria-hidden="true"><div class="bar"></div></div><div id="root"></div></body>',
  },
  {
    name: '(b2) marker outside a NON-empty #root — still never replaced',
    expect: 'fail',
    html: '<body><div data-boot-skeleton><div class="bar"></div></div><div id="root"><p>real</p></div></body>',
  },
  {
    name: '(c1) #root holding only whitespace',
    expect: 'fail',
    html: '<body><div id="root">\n   \n  </div></body>',
  },
  {
    name: '(c2) #root holding only a comment',
    expect: 'fail',
    html: '<body><div id="root"><!-- app mounts here --></div></body>',
  },
  {
    name: '(c3) #root holding only a <script> (its text must not count)',
    expect: 'fail',
    html: '<body><div id="root"><script>window.__boot = "not painted";</script></div></body>',
  },
  {
    name: '(c4) #root holding only a <template>',
    expect: 'fail',
    html: '<body><div id="root"><template><div class="bar"></div></template></div></body>',
  },
  {
    name: '(d) one container paints, a SECOND is empty',
    expect: 'fail',
    html: '<body><div id="root"><p>ok</p></div><div data-app-root></div></body>',
  },
];

// ---------------------------------------------------------------------------
// Markdown extraction + CSS assertions.
// ---------------------------------------------------------------------------

function htmlFences(md) {
  const out = [];
  const re = /^```html[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
  let m;
  while ((m = re.exec(md))) out.push(m[1]);
  return out;
}

/**
 * Strip CSS comments FIRST. Without this the example's own explanatory comment
 * ("do not move these into a @media (prefers-color-scheme: dark) block") is read
 * as a real dark media query and the guard fails the very file it is grading —
 * measured while writing this, and the reason the strip is not optional.
 */
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Strip every `@media (...) { ... }` block, returning what is left: base rules. */
function splitMediaBlocks(rawCss) {
  const css = stripCssComments(rawCss);
  const blocks = [];
  let base = '';
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf('@media', i);
    if (at === -1) {
      base += css.slice(i);
      break;
    }
    base += css.slice(i, at);
    const open = css.indexOf('{', at);
    if (open === -1) {
      base += css.slice(at);
      break;
    }
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    blocks.push({ prelude: css.slice(at, open).trim(), body: css.slice(open + 1, j) });
    i = j + 1;
  }
  return { base, blocks };
}

/** WCAG relative luminance of a #rrggbb / #rgb colour, 0 (black) .. 1 (white). */
export function luminance(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const ch = [0, 2, 4].map((o) => {
    const v = parseInt(h.slice(o, o + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** `html { ... background: #xxx ... }` -> the hex, from a CSS chunk. */
function htmlBackgroundHex(css) {
  const m = /(^|[\s}])html\s*\{([^}]*)\}/m.exec(css);
  if (!m) return null;
  const bg = /background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/.exec(m[2]);
  return bg ? bg[1] : null;
}

/** Fold markdown emphasis/code away so a prose pin survives formatting churn. */
export function normalise(text) {
  return text
    .replace(/[`*_]/g, '')
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * PROSE GUARDS — honestly weaker than the structural ones above. Each pins a
 * whole NORMALISED sentence, not a keyword, precisely because a keyword guard is
 * walkable by rewording.
 */
export const PROSE_PINS = [
  {
    id: 'key-without-markup-is-worse-than-nothing',
    sentence:
      'bootSkeleton: true over an empty #root is a blank iframe for the entire load - strictly worse than not opting in.',
  },
  {
    id: 'theme-is-a-guess-default-dark',
    sentence: 'The boot theme is a guess, and the guess must be dark.',
  },
  {
    id: 'react-does-not-generalise',
    sentence:
      "React's behaviour does not generalise; assume any other framework appends until you have measured it.",
  },
];

// ---------------------------------------------------------------------------

export function main() {
  const problems = [];
  const guidePath = join(repoRoot, GUIDE);
  const refPath = join(repoRoot, REFERENCE);
  const guide = readFileSync(guidePath, 'utf8');
  const reference = readFileSync(refPath, 'utf8');

  // -- 1. table test: the gate itself ---------------------------------------
  let passed = 0;
  for (const f of FIXTURES) {
    const res = bootSkeletonGate(f.html);
    const got = res.ok ? 'pass' : 'fail';
    if (got !== f.expect) {
      console.error(`  ✗ fixture "${f.name}": expected ${f.expect}, got ${got}`);
      if (res.failures.length) console.error(`      ${res.failures.join('\n      ')}`);
      problems.push(`fixture:${f.name}`);
    } else {
      passed++;
    }
  }
  const mustFail = FIXTURES.filter((f) => f.expect === 'fail').length;
  const mustPass = FIXTURES.length - mustFail;
  console.log(
    `  ✓ gate table test: ${passed}/${FIXTURES.length} fixtures agreed ` +
      `(${mustPass} must-pass, ${mustFail} must-FAIL — the negative control)`
  );
  if (mustFail < 5 || mustPass < 2) {
    console.error('  ✗ the fixture table lost its controls — a rule graded only on passing input');
    console.error('    proves nothing. Restore the must-FAIL cases.');
    problems.push('fixture-table-degenerate');
  }

  // -- 2. every skeleton example in the guide satisfies the gate -------------
  const fences = htmlFences(guide);
  const skeletonFences = fences.filter((f) => f.includes('data-boot-skeleton'));
  console.log(
    `  ✓ ${GUIDE}: ${fences.length} html fence(s), ${skeletonFences.length} carrying [data-boot-skeleton]`
  );
  if (skeletonFences.length < MIN_SKELETON_FENCES) {
    // A reassuring ZERO is indistinguishable from a broken extractor.
    console.error(
      `  ✗ expected at least ${MIN_SKELETON_FENCES} [data-boot-skeleton] html fence(s) in ${GUIDE}, ` +
        `found ${skeletonFences.length}. Either the examples were removed, or the fence extractor ` +
        'stopped matching — this rule then checked nothing.'
    );
    problems.push('too-few-skeleton-fences');
  }
  skeletonFences.forEach((html, idx) => {
    const res = bootSkeletonGate(html);
    if (!res.ok) {
      console.error(`  ✗ ${GUIDE} html example #${idx + 1} FAILS the bootSkeleton gate it teaches:`);
      for (const f of res.failures) console.error(`      ${f}`);
      problems.push(`example-fails-gate:${idx + 1}`);
    }
  });

  // -- 3. the complete index.html example: dark default ---------------------
  const full = skeletonFences.filter((f) => /<!doctype html>/i.test(f));
  if (full.length !== 1) {
    console.error(
      `  ✗ expected exactly 1 complete <!doctype html> boot-skeleton example in ${GUIDE}, found ${full.length}`
    );
    problems.push('doctype-example-count');
  } else {
    const doc = full[0];
    const tree = parseHtml(doc);
    const nodes = [...walk(tree)];

    const meta = nodes.find(
      (n) => n.type === 'element' && n.tag === 'meta' && n.attrs.get('name') === 'color-scheme'
    );
    const content = meta?.attrs.get('content')?.trim().replace(/\s+/g, ' ');
    if (content !== 'dark light') {
      console.error(
        `  ✗ <meta name="color-scheme"> is ${content === undefined ? 'MISSING' : `"${content}"`} — ` +
          'must be "dark light", dark FIRST. It is what the UA paints before any rule applies.'
      );
      problems.push('meta-color-scheme');
    }

    const css = nodes
      .filter((n) => n.type === 'element' && n.tag === 'style')
      .flatMap((n) => n.children.filter((c) => c.type === 'text').map((c) => c.value))
      .join('\n');
    if (!css.trim()) {
      console.error('  ✗ the complete example has no inline <style> — the skeleton would need a round-trip');
      problems.push('no-inline-style');
    }
    const { base, blocks } = splitMediaBlocks(css);
    const darkQueries = blocks.filter((b) => /prefers-color-scheme\s*:\s*dark/.test(b.prelude));
    const lightQueries = blocks.filter((b) => /prefers-color-scheme\s*:\s*light/.test(b.prelude));

    if (darkQueries.length !== 0) {
      console.error(
        `  ✗ the example carries ${darkQueries.length} @media (prefers-color-scheme: dark) block(s). ` +
          'The dark values belong in the BASE rules — a dark media query inverts the default for ' +
          'no-preference, for an unknown preference, and for any UA without the query.'
      );
      problems.push('dark-media-query');
    }
    if (lightQueries.length === 0) {
      console.error('  ✗ the example has no @media (prefers-color-scheme: light) override');
      problems.push('no-light-override');
    }

    const baseHex = htmlBackgroundHex(base);
    const baseLum = baseHex ? luminance(baseHex) : null;
    if (baseLum === null) {
      console.error('  ✗ could not read `html { background: #… }` from the example\'s BASE rules');
      problems.push('no-base-html-background');
    } else if (baseLum >= 0.35) {
      console.error(
        `  ✗ the BASE \`html\` background ${baseHex} has relative luminance ${baseLum.toFixed(3)} — ` +
          'that is a LIGHT default. Civitai is dark-first; a light default is a white flash for the ' +
          'majority. Put the dark values in the base rules.'
      );
      problems.push('base-not-dark');
    }
    const lightHex = lightQueries.length ? htmlBackgroundHex(lightQueries[0].body) : null;
    const lightLum = lightHex ? luminance(lightHex) : null;
    if (lightLum !== null && lightLum <= 0.65) {
      console.error(
        `  ✗ the light-override \`html\` background ${lightHex} (luminance ${lightLum.toFixed(3)}) is ` +
          'not light — the two branches have been swapped.'
      );
      problems.push('light-not-light');
    }
    console.log(
      `  ✓ dark default: meta="dark light", base html luminance ` +
        `${baseLum === null ? 'n/a' : baseLum.toFixed(3)} (<0.35), ` +
        `${darkQueries.length} dark media block(s) (must be 0), ${lightQueries.length} light override(s)`
    );
  }

  // -- 4. the reference pointer lives OUTSIDE the generated region -----------
  const endMarker = reference.indexOf('<!-- END GENERATED: manifest -->');
  const beginMarker = reference.indexOf('<!-- BEGIN GENERATED: manifest');
  const mentions = [...reference.matchAll(/bootSkeleton/g)].map((m) => m.index);
  if (endMarker === -1 || beginMarker === -1) {
    console.error(`  ✗ ${REFERENCE}: the generated manifest region markers are gone`);
    problems.push('reference-markers-missing');
  } else if (mentions.length === 0) {
    console.error(`  ✗ ${REFERENCE} does not mention bootSkeleton at all`);
    problems.push('reference-no-pointer');
  } else {
    const inside = mentions.filter((i) => i > beginMarker && i < endMarker);
    if (inside.length) {
      console.error(
        `  ✗ ${REFERENCE}: ${inside.length} bootSkeleton mention(s) sit INSIDE the generated region. ` +
          'That region is rendered from the canonical schema bundled with the pinned @civitai/app-sdk; ' +
          'hand-writing a row there is overwritten by `npm run gen:appblocks:md` and fails check:md-regions. ' +
          'The row appears on its own once the pin carries the field.'
      );
      problems.push('reference-pointer-in-generated-region');
    }
    console.log(
      `  ✓ ${REFERENCE}: ${mentions.length} bootSkeleton mention(s), ${inside?.length ?? 0} inside the generated region (must be 0)`
    );
  }

  // -- 5. prose pins (WEAKER — labelled) ------------------------------------
  const normalisedGuide = normalise(guide);
  let pinned = 0;
  for (const pin of PROSE_PINS) {
    if (normalisedGuide.includes(normalise(pin.sentence))) {
      pinned++;
    } else {
      console.error(`  ✗ PROSE PIN "${pin.id}" is no longer stated in ${GUIDE}. Expected, normalised:`);
      console.error(`      ${normalise(pin.sentence)}`);
      console.error(
        '    This is a PROSE guard: it pins a whole normalised sentence, so a reword fails here by ' +
          'design. If the reword is intentional, update PROSE_PINS in this file in the same change.'
      );
      problems.push(`prose-pin:${pin.id}`);
    }
  }
  console.log(`  ✓ prose pins (WEAK GUARD — words, not structure): ${pinned}/${PROSE_PINS.length} stated`);

  if (problems.length) {
    console.error('\n--- BOOT-SKELETON CONTRACT DRIFT ---');
    console.error('\n`bootSkeleton: true` over an empty #root is a blank iframe for the whole load, and');
    console.error('NOTHING on the platform validates it. A doc example that stops satisfying the rule');
    console.error('it teaches is a copy-pasteable blank page.');
    console.error(`Failed: ${problems.join(', ')}`);
    process.exit(1);
  }

  console.log('\nBoot-skeleton contract: pinned.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    console.error(`check-boot-skeleton: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  }
}
