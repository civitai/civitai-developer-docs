#!/usr/bin/env node
/**
 * check-design-system-pins.mjs
 * ----------------------------
 * The DESIGN-SYSTEM version-pin drift-guard: one source of truth for the
 * `@civitai/theme` / `components` / `components-react` version numbers the apps
 * docs hand a reader, plus a freshness check against npm.
 *
 * WHY THIS EXISTS (and why it is separate from check-appblocks-pins.mjs)
 * ---------------------------------------------------------------------
 * These version literals are not provenance stamps — they are **instructions**.
 * A reader copies `https://unpkg.com/@civitai/components@X/styles.css` straight
 * out of the page, so a wrong X is a broken integration that produces an
 * **unstyled page, not an error** — precisely the failure the theming guide
 * spends pages warning about, and one the docs shipped themselves (theming.md
 * pinned `0.1.1` in 27 places while npm was on `components@0.3.0`/`theme@0.2.0`).
 *
 * THREE DISTINCT FAILURE MODES, and it is worth keeping them straight because
 * the first one is the counter-intuitive one and the third is invisible to this
 * guard entirely:
 *
 *   1. STALE BUT PUBLISHED (what the docs actually shipped). The URL returns
 *      **200**. jsDelivr and unpkg keep serving a published version, so
 *      `components@0.1.1/styles.css` resolves fine — it just carries the OLD
 *      stylesheet: 10 components' rules where 0.3.0 has 20. Note the symptom is
 *      NOT uniformly "bare": the shared field rules (label/control/description/
 *      error) already existed in 0.1.1, so `select`/`checkbox`/`radio` come out
 *      PARTIALLY styled while `tooltip`/`toast`/`image`/`slider` are fully bare.
 *      A stale `theme` pin is different again — components stay styled, but
 *      tokens added since resolve to nothing and backgrounds/accents drop out.
 *      Nothing 404s and nothing errors; the page is just subtly wrong.
 *   2. NEVER PUBLISHED (the trap when "fixing" mode 1). `theme@0.3.0` does not
 *      exist — theme is on 0.2.0 — so that URL genuinely **404s** and the
 *      stylesheet is absent entirely. This is what a blanket "bump everything to
 *      0.3.0" produces, which is why the guard checks each package separately.
 *   3. PATH ABSENT (not a version problem at all). `@civitai/components-react`
 *      has never shipped a `styles.css` at ANY version — its `exports` map has
 *      no CSS entry, and the React bindings inject the CSS themselves. So
 *      `components-react@<anything>/styles.css` 404s even when the version is
 *      current. This guard only compares VERSIONS, so it cannot catch a docs
 *      page linking a stylesheet that does not exist; only fetching the URL can.
 *
 * All three render wrong with no error, which is why none is caught by review.
 *
 * `check-appblocks-pins.mjs` deliberately does NOT cover these packages (see its
 * header): it tracks the two SDK packages that FEED the generated generation
 * references, and it only compares a devDep pin to npm. It never reads prose. So
 * a prose pin could rot indefinitely with every existing guard green.
 *
 * WHAT IS CHECKED
 *   1. SINGLE SOURCE — every `@civitai/<ds-pkg>@<version>` literal in a
 *      hand-authored `apps/**\/*.md` must equal that package's EXACT devDep pin
 *      in package.json. The devDep is the one place a version is declared; the
 *      docs quote it. A disagreement is a FAIL.
 *   2. FRESHNESS — each devDep pin is compared to npm's `latest`. A lagging pin
 *      is a FAIL (the docs are teaching an old version).
 *
 * Note that (1) and (2) compose: bumping the pin without updating the prose
 * fails (1); updating the prose without bumping the pin fails (1) too; bumping
 * both but trailing npm fails (2). There is no green state that leaves a reader
 * with the WRONG VERSION — which is the thing that matters, since the common
 * failure resolves perfectly well (see the two modes below).
 *
 * WHAT IS ONLY WARNED ABOUT — the generated page
 * ----------------------------------------------
 * `apps/reference/components.md` is generated verbatim from the `MARKUP.md` that
 * ships INSIDE the published `@civitai/components` package, and that upstream
 * file carries its own CDN `<link>`s. As of `@civitai/components@0.3.0` those
 * still read `@0.1.1`. This repo cannot fix them without diverging from the
 * canonical prose the generator exists to mirror — the fix belongs in
 * civitai-app-starters `packages/civitai-components/MARKUP.md`, after which a
 * re-vendor clears it here.
 *
 * So a stale pin on that page is reported as a WARNING with the upstream
 * pointer, and does NOT fail. A gate that cannot be made green by anyone in this
 * repo would just train people to ignore it.
 *
 * RESULTS (mirrors check-appblocks-pins.mjs's network contract)
 *   - all literals match the pin, no pin lags npm    -> PASS (exit 0)
 *   - a literal disagrees with the pin               -> FAIL (exit 1)
 *   - a pin lags npm latest                          -> FAIL (exit 1)
 *   - pin AHEAD of latest (prerelease/pending publish) -> PASS with a note
 *   - registry unreachable / DNS / timeout / 5xx      -> SKIP the freshness half
 *     (exit 0). Connectivity must never false-fail. The single-source half is
 *     offline and still runs.
 *   - a 404 for the package itself                   -> FAIL (the pin names a
 *     package npm does not serve — real drift, not transient)
 *
 * USAGE
 *   npm run check:ds-pins
 *   node scripts/check-design-system-pins.mjs --offline   # skip the npm half
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { classifyPin, readPinnedVersion } from './check-appblocks-pins.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** The design-system packages whose version literals the docs hand to readers. */
export const DESIGN_SYSTEM_PACKAGES = [
  '@civitai/theme',
  '@civitai/components',
  '@civitai/components-react',
];

/**
 * Generated pages whose version literals come from UPSTREAM (the vendored
 * MARKUP.md), not from this repo. Stale pins here warn instead of failing —
 * see the header. Paths are repo-relative and compared exactly.
 */
export const UPSTREAM_OWNED_PAGES = new Set(['apps/reference/components.md']);

const REGISTRY = process.env.APPBLOCKS_NPM_REGISTRY || 'https://registry.npmjs.org';

/**
 * Match `@civitai/<pkg>@<semver>` for the design-system packages only.
 *
 * `components-react` MUST precede `components` in the alternation: with the
 * shorter name first the regex matches `@civitai/components` inside
 * `@civitai/components-react@0.3.0` and then reads the version as… nothing,
 * silently skipping the literal it was written to catch.
 */
const LITERAL_RE = /@civitai\/(theme|components-react|components)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g;

/** Recursively collect `.md` files under a directory. */
function collectMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectMarkdown(full, out);
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

/**
 * Scan markdown for design-system version literals.
 *
 * Pure + exported so the regression test can prove the guard FIRES on a planted
 * stale pin without touching the filesystem or the network.
 *
 * @param {string} text markdown source
 * @returns {Array<{pkg: string, version: string, line: number}>}
 */
export function findLiterals(text) {
  const found = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(LITERAL_RE)) {
      found.push({ pkg: `@civitai/${m[1]}`, version: m[2], line: i + 1 });
    }
  }
  return found;
}

/**
 * Compare every literal against the declared pins.
 * @returns {Array<{file: string, line: number, pkg: string, found: string, expected: string}>}
 */
export function findMismatches(files, pins) {
  const bad = [];
  for (const { file, text } of files) {
    for (const lit of findLiterals(text)) {
      const expected = pins[lit.pkg];
      if (!expected || lit.version === expected) continue;
      bad.push({ file, line: lit.line, pkg: lit.pkg, found: lit.version, expected });
    }
  }
  return bad;
}

/** Fetch a package's npm `latest` dist-tag. 404 = real drift; else transient. */
async function fetchLatest(pkg) {
  // replaceAll, not replace: `replace` with a string pattern rewrites only the
  // FIRST '/', which silently under-encodes any name with more than one. Scoped
  // npm names have exactly one today, so this is equivalence-preserving here —
  // it removes the footgun rather than fixing a live bug. (Not
  // encodeURIComponent: that would also escape the leading '@' to %40, which is
  // not how the registry addresses a scoped package.)
  const url = `${REGISTRY}/${pkg.replaceAll('/', '%2F')}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      const gone = res.status === 404 || res.status === 410;
      return { ok: false, status: res.status, reason: `HTTP ${res.status}`, gone };
    }
    const latest = (await res.json())['dist-tags']?.latest;
    if (!latest) return { ok: false, reason: 'no dist-tags.latest in registry response' };
    return { ok: true, latest };
  } catch (err) {
    return { ok: false, reason: err.message, network: true };
  }
}

async function main() {
  const offline = process.argv.includes('--offline');
  console.log('Design-system pin-guard — docs version literals vs the declared pin\n');

  // --- Resolve the single source: the exact devDep pin per package. ---
  const pins = {};
  for (const pkg of DESIGN_SYSTEM_PACKAGES) {
    const pin = readPinnedVersion(pkg);
    if (!pin.ok) {
      console.error(`  ✗ ${pkg} — ${pin.reason}`);
      console.error('\nEvery design-system package must be an EXACT devDependency pin — that pin is');
      console.error('the single source the docs quote. Add it to package.json devDependencies.');
      process.exit(1);
    }
    pins[pkg] = pin.version;
    console.log(`  · ${pkg} pinned at ${pin.version}`);
  }

  // --- 1. SINGLE SOURCE: every literal in hand-authored apps/ must match. ---
  const appsDir = join(repoRoot, 'apps');
  const all = collectMarkdown(appsDir).map((f) => ({
    file: relative(repoRoot, f),
    text: readFileSync(f, 'utf8'),
  }));
  const authored = all.filter((f) => !UPSTREAM_OWNED_PAGES.has(f.file));
  const upstream = all.filter((f) => UPSTREAM_OWNED_PAGES.has(f.file));

  const scanned = authored.reduce((n, f) => n + findLiterals(f.text).length, 0);
  console.log(`\n  scanned ${scanned} design-system version literal(s) across ${authored.length} authored page(s)`);
  if (scanned === 0) {
    // A zero here is indistinguishable from a broken matcher. Say so loudly
    // rather than printing a reassuring PASS over a scan that found nothing.
    console.error('\n  ✗ found ZERO literals to check — the docs quote these versions in CDN URLs,');
    console.error('    so zero means the matcher (or the layout) changed, not that the docs are clean.');
    process.exit(1);
  }

  const mismatches = findMismatches(authored, pins);
  for (const m of mismatches) {
    console.error(`  ✗ ${m.file}:${m.line} — ${m.pkg}@${m.found} (declared pin is ${m.expected})`);
  }
  if (!mismatches.length) console.log('  ✓ every literal matches its declared pin');

  // --- The generated page: report upstream staleness, never fail on it. ---
  for (const f of upstream) {
    for (const lit of findLiterals(f.text)) {
      if (pins[lit.pkg] && lit.version !== pins[lit.pkg]) {
        console.log(
          `\n  ⚠ ${f.file}:${lit.line} — ${lit.pkg}@${lit.version} (pin is ${pins[lit.pkg]}), but this page is`
        );
        console.log('    generated verbatim from the MARKUP.md shipped inside @civitai/components.');
        console.log('    Fix upstream in civitai-app-starters packages/civitai-components/MARKUP.md,');
        console.log('    publish, then re-vendor here (npm i + gen:appblocks:components). Not a failure.');
      }
    }
  }

  // --- 2. FRESHNESS: is the pin itself behind npm? ---
  const lagging = [];
  if (offline) {
    console.log('\n  ⊘ --offline: skipping the npm freshness check');
  } else {
    console.log('');
    for (const pkg of DESIGN_SYSTEM_PACKAGES) {
      const remote = await fetchLatest(pkg);
      if (!remote.ok) {
        if (remote.gone) {
          console.error(`  ✗ ${pkg} — registry returned ${remote.reason}: npm does not serve this package`);
          lagging.push({ pkg, pinned: pins[pkg], gone: true, status: remote.status });
        } else {
          console.log(`  ⊘ ${pkg} — ${remote.reason} — could not reach registry (skip, no false-fail)`);
        }
        continue;
      }
      const cls = classifyPin(pins[pkg], remote.latest);
      if (cls.status === 'ok') console.log(`  ✓ ${pkg}@${pins[pkg]} — matches npm latest`);
      else if (cls.status === 'ahead')
        console.log(`  ✓ ${pkg}@${pins[pkg]} — AHEAD of npm latest (${remote.latest}) — ok`);
      else {
        console.error(`  ✗ ${pkg}@${pins[pkg]} — LAGS npm latest ${remote.latest}`);
        lagging.push({ pkg, pinned: pins[pkg], latest: remote.latest });
      }
    }
  }

  if (mismatches.length || lagging.length) {
    console.error('\n--- DESIGN-SYSTEM PIN DRIFT ---');
    if (mismatches.length) {
      console.error(`\n${mismatches.length} docs literal(s) disagree with the declared pin.`);
      console.error('These are copy-paste CDN URLs, and BOTH ways of being wrong are silent:');
      console.error('  - stale but published -> 200 with OLD css (newer components render unstyled)');
      console.error('  - never published     -> 404, no stylesheet at all');
      console.error('Neither errors, so neither is caught by review.');
      console.error('Update the prose to the pin (or bump the pin and the prose together).');
    }
    if (lagging.length) {
      console.error('\nA declared pin trails npm latest — the docs teach an old version:');
      for (const l of lagging) {
        if (l.gone) console.error(`  - ${l.pkg}: pinned ${l.pinned}, npm returned HTTP ${l.status}`);
        else console.error(`  - ${l.pkg}: ${l.pinned} -> ${l.latest}   (package.json devDependencies)`);
      }
      console.error('\nBump the devDep, re-run `npm i`, update the prose literals to match, and if');
      console.error('@civitai/components moved, re-vendor MARKUP.md + `npm run gen:appblocks:components`.');
      console.error('VERIFY EACH CDN URL before committing — and note that a 200 is NOT sufficient:');
      console.error('every published version resolves forever, so a stale pin looks healthy while');
      console.error('serving old CSS. Check the version you wrote is the one you meant.');
    }
    process.exit(1);
  }

  console.log('\nDesign-system pins: single-sourced and current.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`check-design-system-pins: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  });
}
