#!/usr/bin/env node
/**
 * check-design-system-pins.mjs
 * ----------------------------
 * The FIRST-PARTY PACKAGE version-pin drift-guard: one source of truth for every
 * `@civitai/*` version number the docs hand a reader, plus a freshness check
 * against npm.
 *
 * It covers two families, for two different reasons:
 *
 *   - DESIGN SYSTEM (`theme`, `components`, `components-react`) — the literals
 *     are **instructions** a reader copies (CDN URLs). See below.
 *   - SDK (`app-sdk`, `blocks-react`) — the literals are **provenance stamps**
 *     in page frontmatter (`sources:`), declaring which published version the
 *     page was written against. A stale stamp is a page describing an old API
 *     while claiming to describe the pinned one.
 *
 * WHY THE SDK HALF WAS ADDED
 * --------------------------
 * It was missing, and the numbers rotted at least twice. Before this guard grew
 * an SDK arm, `check-appblocks-pins.mjs` compared the *devDep pin* to npm and
 * this script scanned *prose* for design-system packages only — so an SDK
 * version written into prose was pinned by NOTHING, and both guards stayed
 * green while pages advertised versions six and thirteen minors behind:
 * quickstart.md and concepts.md carried `app-sdk@0.22.0` / `blocks-react@0.26.0`
 * and embedding.md carried `blocks-react@0.32.0` against pins of `0.31.0` /
 * `0.39.0`. Fixing the numbers without closing the gap just schedules a third
 * occurrence, which is why the guard — not the edit — is the deliverable.
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
 *   1. SINGLE SOURCE — every `@civitai/<guarded-pkg>@<version>` literal in a
 *      hand-authored `.md` under any DOC_ROOT must equal that package's EXACT
 *      devDep pin in package.json. The devDep is the one place a version is
 *      declared; the docs quote it. A disagreement is a FAIL — unless the
 *      literal is a declared HISTORICAL reference (see below).
 *   2. FRESHNESS — each devDep pin is compared to npm's `latest`. A lagging pin
 *      is a FAIL (the docs are teaching an old version).
 *
 * HISTORICAL LITERALS — the one exemption, and why it is a REGISTRY not a regex
 * ----------------------------------------------------------------------------
 * A few literals are deliberately NOT the pin, because they are claims about the
 * PAST: `generation.md` says the `step` member was "added in
 * `@civitai/app-sdk@0.30.0`". Bumping that to the current pin would not fix
 * staleness, it would make the sentence FALSE — the feature did not arrive in
 * 0.31.0.
 *
 * The exemption is an explicit `HISTORICAL_LITERALS` registry keyed on
 * (file, pkg, version), NOT a prose heuristic like /added in|since/. A heuristic
 * fails in the expensive direction: a literal that happens to sit near the word
 * "since" would be silently exempted, which is precisely the silence this guard
 * exists to end. A registry entry is a deliberate, reviewable decision.
 *
 * The registry is checked BIDIRECTIONALLY: every literal not in it must equal
 * the pin, AND every entry in it must match at least one real literal. A stale
 * row that matches nothing is a FAIL, so the registry cannot rot into a list of
 * exemptions for text that no longer exists — the shape in which an allowlist
 * quietly becomes a hole.
 *
 * 🔴 AND EVERY ROW CARRIES AN EXACT `count`, BECAUSE (file, pkg, version) ALONE
 * SILENCES A WHOLE FILE. Without it, regressing `generation.md`'s own `sources:`
 * stamp from `0.31.0` back to `0.30.0` — the precise defect the SDK arm exists
 * to catch, in the same file that holds the exemption — matched the historical
 * row and exited 0, reported as "exempt (historical)" under a `why` that is
 * false about that line. The count is the fix: the row asserts "0.30.0 appears
 * in this file EXACTLY ONCE, as the changelog reference", so a second occurrence
 * is a mismatch again. A count wrong in EITHER direction fails.
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
 * The SDK packages whose version literals the docs stamp into `sources:`
 * frontmatter (and occasionally quote in prose, e.g. "in the pinned
 * `@civitai/app-sdk@X` …"). Same single-source rule, different failure mode:
 * a stale stamp means the page documents an older API than it claims to.
 */
export const SDK_PACKAGES = ['@civitai/app-sdk', '@civitai/blocks-react'];

/** Every first-party package whose prose literals are pinned by this guard. */
export const GUARDED_PACKAGES = [...DESIGN_SYSTEM_PACKAGES, ...SDK_PACKAGES];

/**
 * Hand-authored documentation roots to scan, repo-relative. The guard used to
 * read `apps/` only; a stale literal anywhere else in the docs was unpinned.
 *
 * NO HAND-SYNC IS REQUIRED ANY MORE. This list used to have to be kept in step
 * with `.github/workflows/appblocks-snippets.yml`'s `paths:` filter, because a
 * root the guard READ but the trigger did not WATCH merged its stale literals
 * green. That filter no longer exists — `typecheck-snippets` (which runs this
 * guard's `--offline` half) is a REQUIRED check and now triggers on every pull
 * request unconditionally, so the trigger can no longer be narrower than this
 * list and the whole class of gap is unreachable rather than merely documented.
 * Adding a root here needs no workflow edit.
 */
export const DOC_ROOTS = ['apps', 'site', 'orchestration'];

/** Hand-authored top-level pages (not under a DOC_ROOT). */
export const DOC_FILES = ['index.md'];

/**
 * Generated pages whose version literals come from UPSTREAM (the vendored
 * MARKUP.md), not from this repo. Stale pins here warn instead of failing —
 * see the header. Paths are repo-relative and compared exactly.
 */
export const UPSTREAM_OWNED_PAGES = new Set(['apps/reference/components.md']);

/**
 * Literals that are deliberately NOT the current pin because they are claims
 * about the PAST. Exempt from the single-source rule, and REQUIRED to match
 * something (see the header: the registry is checked bidirectionally).
 *
 * Keyed on (file, pkg, version) rather than a line number so ordinary edits to
 * the page do not invalidate the row, while a change to the VERSION being
 * claimed still forces a fresh decision.
 *
 * `why` is the reviewable part: it must say why the current pin would be WRONG
 * here, not merely that the literal differs.
 */
export const HISTORICAL_LITERALS = [
  {
    file: 'apps/reference/generation.md',
    pkg: '@civitai/app-sdk',
    version: '0.30.0',
    // EXACT — see the header. TWO occurrences of the SAME changelog fact:
    //   1. the hand-written `The \`step\` member (added in …)` prose, and
    //   2. the generated markdown-fallback region (the .md / LLM channel — see
    //      scripts/appblocks-md.mjs), which mirrors <BridgeReference>'s
    //      `useBuzzWorkflow` docstring, and that docstring itself says "THREE
    //      members as of @civitai/app-sdk@0.30.0".
    // Both are arrival-version statements, neither is a `sources:` stamp — and a
    // regressed stamp would make it THREE, so the count still catches it.
    // If the upstream docstring stops naming 0.30.0 this drops to 1 and fails,
    // which is the bidirectional strictness working: refresh the region and
    // correct this row in the same change.
    count: 2,
    why: 'the `step` WorkflowBody member was ADDED in 0.30.0 — a changelog fact. Bumping it to the current pin would state a false arrival version.',
  },
];

const REGISTRY = process.env.APPBLOCKS_NPM_REGISTRY || 'https://registry.npmjs.org';

/** Escape a string for literal use inside a RegExp. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match `@civitai/<pkg>@<semver>` for every guarded package.
 *
 * The alternation is built LONGEST-NAME-FIRST so that a name which is a PREFIX
 * of another (`components` vs `components-react`) is always tried second, and
 * the pattern therefore does not depend on the order the package lists happen
 * to be written in.
 *
 * 🔴 A correction to what this comment used to claim. It said that with the
 * shorter name first the regex "matches `@civitai/components` inside
 * `@civitai/components-react@0.3.0` and then reads the version as… nothing,
 * silently skipping the literal". That is NOT true of this pattern, and it was
 * measured: with the alternation deliberately reordered shortest-first,
 * `@civitai/components-react@0.3.0` still captures `components-react`/`0.3.0`,
 * both bare and inside a CDN URL. The trailing `@(\d+\.…)` cannot match after
 * `components`, so the engine BACKTRACKS into the longer alternative. Ordering
 * is not load-bearing here.
 *
 * The sort is kept anyway, as defence rather than a fix: it makes correctness
 * independent of backtracking, so a later edit that DOES make the suffix
 * optional (or that drops the `@`) cannot quietly turn a prefix name into a
 * silent truncation. Do not restate the old claim — it is false.
 */
export const GUARDED_NAME_ALTERNATION = GUARDED_PACKAGES.map((p) => p.replace('@civitai/', ''))
  .sort((a, b) => b.length - a.length || a.localeCompare(b))
  .map(escapeRe)
  .join('|');

const LITERAL_RE = new RegExp(
  `@civitai\\/(${GUARDED_NAME_ALTERNATION})@(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)`,
  'g'
);

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

/** True when a literal is a declared historical reference. */
export function historicalEntryFor(file, pkg, version) {
  return (
    HISTORICAL_LITERALS.find(
      (h) => h.file === file && h.pkg === pkg && h.version === version
    ) ?? null
  );
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
 *
 * Returns the mismatches AND the historical entries actually hit, so the caller
 * can enforce the registry's other direction (an entry matching nothing is a
 * stale exemption and must fail).
 *
 * @returns {{
 *   mismatches: Array<{file: string, line: number, pkg: string, found: string, expected: string}>,
 *   exempted: Array<{file: string, line: number, pkg: string, version: string, why: string}>,
 * }}
 */
export function findMismatches(files, pins) {
  const mismatches = [];
  const exempted = [];
  for (const { file, text } of files) {
    for (const lit of findLiterals(text)) {
      const expected = pins[lit.pkg];
      if (!expected || lit.version === expected) continue;
      const hist = historicalEntryFor(file, lit.pkg, lit.version);
      if (hist) {
        exempted.push({ file, line: lit.line, pkg: lit.pkg, version: lit.version, why: hist.why });
        continue;
      }
      mismatches.push({ file, line: lit.line, pkg: lit.pkg, found: lit.version, expected });
    }
  }
  return { mismatches, exempted };
}

/**
 * Registry rows whose observed occurrence count != the declared `count`.
 *
 * Covers BOTH directions with one comparison: 0 observed is a stale row (a hole
 * that looks like coverage), and more than declared is the file-wide silencing
 * described in the header — a regressed stamp hiding behind a changelog row.
 *
 * @returns {Array<{entry: object, seen: number}>}
 */
export function findHistoricalCountMismatches(exempted) {
  const seen = new Map();
  for (const e of exempted) {
    const k = `${e.file}|${e.pkg}|${e.version}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return HISTORICAL_LITERALS.map((h) => ({
    entry: h,
    seen: seen.get(`${h.file}|${h.pkg}|${h.version}`) ?? 0,
  })).filter(({ entry, seen: n }) => n !== entry.count);
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
  console.log('First-party pin-guard — docs version literals vs the declared pin\n');

  // --- Resolve the single source: the exact devDep pin per package. ---
  const pins = {};
  for (const pkg of GUARDED_PACKAGES) {
    const pin = readPinnedVersion(pkg);
    if (!pin.ok) {
      console.error(`  ✗ ${pkg} — ${pin.reason}`);
      console.error('\nEvery guarded package must be an EXACT devDependency pin — that pin is');
      console.error('the single source the docs quote. Add it to package.json devDependencies.');
      process.exit(1);
    }
    pins[pkg] = pin.version;
    console.log(`  · ${pkg} pinned at ${pin.version}`);
  }

  // --- 1. SINGLE SOURCE: every literal in the hand-authored docs must match. ---
  const all = [
    ...DOC_ROOTS.flatMap((d) => collectMarkdown(join(repoRoot, d))),
    ...DOC_FILES.map((f) => join(repoRoot, f)),
  ].map((f) => ({
    file: relative(repoRoot, f),
    text: readFileSync(f, 'utf8'),
  }));
  const authored = all.filter((f) => !UPSTREAM_OWNED_PAGES.has(f.file));
  const upstream = all.filter((f) => UPSTREAM_OWNED_PAGES.has(f.file));

  // Per-FAMILY positive control. A single global count hides a half-broken
  // matcher: if the SDK arm matched nothing, a total of 13 design-system hits
  // still reads as a healthy scan. Each family must find at least one literal.
  const perFamily = (pkgs) =>
    authored.reduce(
      (n, f) => n + findLiterals(f.text).filter((l) => pkgs.includes(l.pkg)).length,
      0
    );
  const dsCount = perFamily(DESIGN_SYSTEM_PACKAGES);
  const sdkCount = perFamily(SDK_PACKAGES);
  console.log(
    `\n  scanned ${dsCount} design-system + ${sdkCount} SDK version literal(s) across ${authored.length} authored page(s)`
  );
  console.log(`  roots: ${DOC_ROOTS.map((d) => `${d}/`).join(' ')} ${DOC_FILES.join(' ')}`);

  const emptyFamilies = [
    ['design-system', dsCount],
    ['SDK', sdkCount],
  ].filter(([, n]) => n === 0);
  if (emptyFamilies.length) {
    // A zero here is indistinguishable from a broken matcher. Say so loudly
    // rather than printing a reassuring PASS over a scan that found nothing.
    for (const [name] of emptyFamilies) {
      console.error(`\n  ✗ found ZERO ${name} literals to check — the docs quote these versions in CDN`);
      console.error('    URLs and in `sources:` frontmatter, so zero means the matcher (or the page');
      console.error('    layout) changed, not that the docs are clean.');
    }
    process.exit(1);
  }

  const { mismatches, exempted } = findMismatches(authored, pins);
  for (const m of mismatches) {
    console.error(`  ✗ ${m.file}:${m.line} — ${m.pkg}@${m.found} (declared pin is ${m.expected})`);
  }
  if (!mismatches.length) console.log('  ✓ every literal matches its declared pin (or is a declared historical reference)');

  // --- The historical registry, both directions. ---
  for (const e of exempted) {
    console.log(`  · ${e.file}:${e.line} — ${e.pkg}@${e.version} exempt (historical): ${e.why}`);
  }
  const staleHistorical = findHistoricalCountMismatches(exempted);
  for (const { entry, seen } of staleHistorical) {
    console.error(
      `  ✗ HISTORICAL_LITERALS row expected ${entry.count} occurrence(s), saw ${seen}: ${entry.file} ${entry.pkg}@${entry.version}`
    );
  }

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
    for (const pkg of GUARDED_PACKAGES) {
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

  if (mismatches.length || lagging.length || staleHistorical.length) {
    console.error('\n--- FIRST-PARTY PIN DRIFT ---');
    if (mismatches.length) {
      console.error(`\n${mismatches.length} docs literal(s) disagree with the declared pin:`);
      for (const m of mismatches) {
        console.error(`  - ${m.file}:${m.line}  ${m.pkg}@${m.found}  ->  expected ${m.expected}`);
      }
      console.error('\nA design-system literal is a copy-paste CDN URL, and BOTH ways of being wrong');
      console.error('are silent:');
      console.error('  - stale but published -> 200 with OLD css (newer components render unstyled)');
      console.error('  - never published     -> 404, no stylesheet at all');
      console.error('An SDK literal is a `sources:` provenance stamp: a stale one means the page');
      console.error('documents an older API than it claims to, which no build step can detect.');
      console.error('Neither errors, so neither is caught by review.');
      console.error('Update the prose to the pin (or bump the pin and the prose together).');
      console.error('If a literal is deliberately historical ("added in X"), add a reviewed row to');
      console.error('HISTORICAL_LITERALS in this file rather than bumping it to a false version.');
    }
    if (staleHistorical.length) {
      console.error(`\n${staleHistorical.length} HISTORICAL_LITERALS row(s) saw an unexpected occurrence count.`);
      for (const { entry, seen } of staleHistorical) {
        console.error(`  - ${entry.file}: ${entry.pkg}@${entry.version} — expected ${entry.count}, saw ${seen}`);
      }
      console.error('\nFEWER than declared (usually 0): the exemption covers text that no longer');
      console.error('exists — a hole that looks like coverage. Delete or correct the row.');
      console.error('MORE than declared: a SECOND literal in that file is riding the exemption.');
      console.error('That is how a regressed `sources:` stamp hides behind a changelog reference —');
      console.error('check whether the new occurrence is really historical before raising `count`.');
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

  console.log('\nFirst-party pins: single-sourced and current.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`check-design-system-pins: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  });
}
