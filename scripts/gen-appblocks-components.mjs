// Generate apps/reference/components.md — the @civitai/components reference.
//
// Source of truth (single-sourced): the markup contract that ships INSIDE the
// published `@civitai/components` package as `MARKUP.md`
// (civitai-app-starters:packages/civitai-components/MARKUP.md). That file is the
// executable, browser-test-asserted contract for the framework-agnostic
// components — the same document `@civitai/components-react` renders. This
// generator transforms its `## Components` section into a VitePress page:
//   - a generated summary table (component -> data-civitai-ui name + enumerable
//     data-* attributes), parsed structurally, PLUS
//   - the setup / theming / cascade / per-component contract reproduced verbatim
//     from MARKUP.md, so the page never diverges from the canonical prose.
//
// Resolution mirrors appblocks-util.readCivitaiSource: prefer the installed
// `@civitai/components` package's MARKUP.md (once published), else the committed
// snapshot appblocks-snapshots/MARKUP.md (the CI-hermetic copy the drift-guard
// diffs against civitai-app-starters@main). Set APPBLOCKS_SNAPSHOT_ONLY=1 to
// force the snapshot path.
//
// UNLIKE the gen-appblocks-*.mjs generators (which emit gitignored JSON consumed
// by Vue island components on every build), this generator writes a COMMITTED
// markdown page and is a MAINTAINER REFRESH step — run it after re-snapshotting
// MARKUP.md (mirrors the CLI-help snapshot flow). It is intentionally NOT wired
// into predev/prebuild so a build never rewrites a committed file. Deterministic
// output (no timestamps) keeps the committed page byte-stable.
//
// USAGE
//   node scripts/gen-appblocks-components.mjs
//   APPBLOCKS_SNAPSHOT_ONLY=1 node scripts/gen-appblocks-components.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, repoRoot, resolvePackageRoot, snapshotsDir } from './appblocks-util.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = join(snapshotsDir, 'MARKUP.md');
const OUT = join(repoRoot, 'apps', 'reference', 'components.md');

// The canonical repo path, cited in the page front-matter + the drift-guard.
const CANONICAL_REPO_PATH = 'packages/civitai-components/MARKUP.md';
const CANONICAL_PKG_PATH = '@civitai/components/MARKUP.md';

/** Resolve MARKUP.md: installed @civitai/components package, else snapshot. */
function readMarkup() {
  const snapshotOnly = process.env.APPBLOCKS_SNAPSHOT_ONLY === '1';
  if (!snapshotOnly) {
    try {
      const pkgRoot = resolvePackageRoot('@civitai/components');
      const pkgMarkup = join(pkgRoot, 'MARKUP.md');
      if (existsSync(pkgMarkup)) {
        return { text: readFileSync(pkgMarkup, 'utf8'), source: `${CANONICAL_PKG_PATH} (installed)` };
      }
    } catch {
      /* not installed yet (0.1.0 not published) — fall back to snapshot */
    }
  }
  if (existsSync(SNAPSHOT)) {
    return { text: readFileSync(SNAPSHOT, 'utf8'), source: `snapshot: appblocks-snapshots/MARKUP.md` };
  }
  throw new Error(
    `gen-appblocks-components: could not resolve MARKUP.md from @civitai/components or the committed snapshot`,
  );
}

/** Normalize CRLF so the generated page is stable regardless of the source EOL. */
const normalize = (t) => t.replace(/\r\n/g, '\n');

/**
 * Parse the `## Components` section into { name, uiName, attrs[] } for the
 * summary table. attrs = enumerable `data-*` attributes with their options; the
 * full per-component contract (element, a11y, examples) is reproduced verbatim
 * from MARKUP.md below the table, so this parse only needs the structured bits.
 */
function parseComponents(md) {
  const h2 = md.indexOf('## Components');
  if (h2 < 0) throw new Error('gen-appblocks-components: no "## Components" section in MARKUP.md');
  const afterH2 = md.slice(md.indexOf('\n', h2) + 1);
  const nextH2 = afterH2.indexOf('\n## ');
  const block = nextH2 >= 0 ? afterH2.slice(0, nextH2) : afterH2;

  const chunks = block.split(/\n### /).slice(1); // drop the Legend preamble
  const components = [];
  for (const chunk of chunks) {
    const firstLine = chunk.split('\n', 1)[0];
    const uiMatch = firstLine.match(/data-civitai-ui="([^"]+)"/);
    if (!uiMatch) continue;
    const uiName = uiMatch[1];
    const name = firstLine.split('—')[0].trim();
    const rest = chunk.slice(firstLine.length);

    const attrs = [];
    // `data-<attr>`: `opt` (default) · `opt` · `opt`
    const attrRe = /`data-([a-z-]+)`:\s*([^\n]+)/g;
    let m;
    while ((m = attrRe.exec(rest)) !== null) {
      const attr = `data-${m[1]}`;
      const options = [];
      const optRe = /`([^`]+)`(\s*\(default\))?/g;
      let o;
      while ((o = optRe.exec(m[2])) !== null) {
        options.push({ value: o[1], default: Boolean(o[2]) });
      }
      if (options.length) attrs.push({ attr, options });
    }
    components.push({ name, uiName, attrs });
  }
  if (components.length === 0) {
    throw new Error('gen-appblocks-components: parsed 0 components — refusing to write an empty page');
  }
  return components;
}

/** Render one attr's options as compact inline code, e.g. filled·light·outline. */
function renderAttr({ attr, options }) {
  const opts = options
    .map((o) => (o.default ? `${o.value} (default)` : o.value))
    .join(' · ');
  return `\`${attr}\`: ${opts}`;
}

function renderSummaryTable(components) {
  const rows = components.map((c) => {
    const attrCell = c.attrs.length ? c.attrs.map(renderAttr).join('<br>') : '—';
    return `| ${c.name} | \`${c.uiName}\` | ${attrCell} |`;
  });
  return [
    '| Component | `data-civitai-ui` | Enumerable attributes |',
    '|-----------|-------------------|-----------------------|',
    ...rows,
  ].join('\n');
}

/**
 * Version-pin the CDN URLs the upstream MARKUP.md Setup section ships bare
 * (unversioned). As of 0.1.1 each package ships a real package-root
 * `styles.css`, so BOTH jsDelivr and unpkg resolve `@civitai/<pkg>@0.1.1/styles.css`
 * (all verified 200 text/css) — the old 0.1.0 jsDelivr-404 (exports-alias) problem
 * is gone. The only correction now is to pin the version so the rendered page
 * doesn't recommend an unpinned `latest` URL.
 *
 * This is a targeted swap on the exact bare specifiers, so it NO-OPS the moment
 * upstream MARKUP.md ships pinned URLs. The committed snapshot stays
 * byte-identical to civitai-app-starters@main, so the snapshot drift-guard is
 * unaffected — only the rendered page is corrected. Remove this shim once the
 * @civitai/components package ships version-pinned URLs upstream.
 */
const CDN_URL_FIXES = [
  [
    'https://cdn.jsdelivr.net/npm/@civitai/theme/styles.css',
    'https://unpkg.com/@civitai/theme@0.1.1/styles.css',
  ],
  [
    'https://cdn.jsdelivr.net/npm/@civitai/components/styles.css',
    'https://unpkg.com/@civitai/components@0.1.1/styles.css',
  ],
];
function fixCdnUrls(body) {
  return CDN_URL_FIXES.reduce((acc, [broken, fixed]) => acc.replaceAll(broken, fixed), body);
}

/**
 * The MARKUP.md body reproduced on the page: from the first `## ` section
 * (Setup) onward (Setup / Theming / Cascade / Components / React parity),
 * verbatim so the contract never diverges — except the two broken CDN URLs in
 * the Setup section, corrected by fixCdnUrls (see above). The H1 and MARKUP.md's
 * own intro paragraph are dropped — this page supplies its own H1 + intro above.
 */
function markupBody(md) {
  const firstH2 = md.search(/^## /m);
  if (firstH2 < 0) throw new Error('gen-appblocks-components: no "## " section found in MARKUP.md');
  return fixCdnUrls(md.slice(firstH2).trimEnd());
}

function buildPage(md, components) {
  const frontmatter = [
    '---',
    'title: Components reference',
    'description: The @civitai/components framework-agnostic component pack — each component\'s data-civitai-ui name, enumerable attributes, and the ARIA/role markup contract.',
    'sources:',
    `  - civitai-app-starters:${CANONICAL_REPO_PATH}`,
    `  - npm:${CANONICAL_PKG_PATH}`,
    '---',
  ].join('\n');

  // Banner is deterministic (no run-specific provenance) so the committed page
  // is byte-stable whether generated from the installed package or the snapshot.
  const banner = [
    '<!--',
    '  GENERATED FILE — do not edit by hand.',
    '  Produced by scripts/gen-appblocks-components.mjs from the canonical',
    `  ${CANONICAL_PKG_PATH} markup contract.`,
    '  To update: re-snapshot appblocks-snapshots/MARKUP.md from',
    `  civitai-app-starters:${CANONICAL_REPO_PATH}, then re-run the generator.`,
    '-->',
  ].join('\n');

  const intro = [
    '# Components',
    '',
    `\`@civitai/components\` is a **framework-agnostic** pack of ${components.length} presentational`,
    'components. The styling is driven entirely by `data-*` attributes, so any',
    'HTML that follows the contract renders identically to the React bindings in',
    '`@civitai/components-react`. This page is generated from that contract —',
    'the canonical [`MARKUP.md`](https://github.com/civitai/civitai-app-starters/blob/main/packages/civitai-components/MARKUP.md)',
    'that ships inside the `@civitai/components` package — so it never drifts from',
    'the source of truth.',
    '',
    '::: tip New to the design system?',
    'Start with the [Theming & design system](../guide/theming) guide for the',
    '3-layer model (tokens → framework-agnostic CSS → React bindings) and the',
    'plain-HTML and React setup. This page is the per-component attribute reference.',
    ':::',
    '',
    '## Component summary',
    '',
    renderSummaryTable(components),
    '',
    'The exact element, required attributes, and ARIA/role wiring for each',
    'component are reproduced verbatim from the canonical contract below.',
    '',
  ].join('\n');

  return `${frontmatter}\n${banner}\n\n${intro}\n${markupBody(md)}\n`;
}

const { text, source } = readMarkup();
const md = normalize(text);
const components = parseComponents(md);
const page = buildPage(md, components);
writeFileSync(OUT, page);
log(`components: wrote ${components.length} components -> ${resolve(OUT)}`);
log(`  markup from ${source}`);
