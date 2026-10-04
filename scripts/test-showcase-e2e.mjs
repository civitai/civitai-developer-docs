#!/usr/bin/env node
/**
 * test-showcase-e2e.mjs
 * ---------------------
 * Browser E2E for the design-system showcase, run against the BUILT + served
 * site with a real headless Chromium (via playwright-core — no bundled browser
 * download; resolves a system/nix Chromium). Covers:
 *
 *   1. Live-render-themed  — the live previews are painted by the published
 *      design-system CSS, in BOTH light and dark. One anchor per component
 *      family: filled Button `background-color`, Badge pill radius, Card
 *      surface, Loader circle, Alert tint, the labeled inputs. Toggling the
 *      site theme re-resolves the tokens in place (dark values differ).
 *   4. <ComponentDemo> behaviour — the HTML/React toggle switches panels, and
 *      the live preview renders the passed HTML.
 *   2. Snippet accuracy (HTML↔preview) — the sequence of `data-civitai-ui`
 *      values in the SHOWN html source equals the sequence in the live preview
 *      DOM (the preview is derived from the shown html; this guards that link).
 *   5. Site-chrome non-regression — importing the design-system CSS did NOT
 *      restyle the VitePress chrome: no `[data-civitai-ui]` leaks into nav/
 *      sidebar, the chrome font resolves from `--vp-font-family-base` (NOT the
 *      civitai stack, which is what the previews use), and no `--vp-*` custom
 *      property has been shadowed by a `--civitai-*` value.
 *   6. ELEMENT GALLERY — apps/reference/elements, the OTHER consumption track.
 *      The `<civitai-*>` hosts upgrade (registration is lazy, imported by
 *      <ElementPreview> on mount), and the `.cds-el-preview :is(…)` escape hatch
 *      in theme/design-system.css is still beating Tailwind Preflight on the HOSTS.
 *      This is the ONLY check anywhere that can see that hatch regress — see
 *      MIN_EXPECTED and the block itself for the measured before/after.
 *   7. DARK ON FIRST LOAD — a reader who already chose dark gets dark PREVIEWS,
 *      not just a dark page. Separate from (1) because (1) reaches dark by
 *      CLICKING the switch, which is a reactive update; a first load is a
 *      HYDRATION, and the two fail independently. They did.
 *
 * Token-gallery drift is a separate, browserless check: `test:tokens:drift`.
 * React-snippet typecheck accuracy is covered by `test:snippets:appblocks`.
 * Docs COVERAGE (is anything missing) is `check:showcase-coverage`, which compares
 * KEY SETS only — this suite is the half that reads VALUES.
 *
 * USAGE
 *   npm run build && npm run test:showcase:e2e
 *   Chromium resolution order: $PLAYWRIGHT_CHROMIUM_PATH, $CHROMIUM_PATH,
 *   `chromium`/`chromium-browser`/`google-chrome` on PATH, then playwright-core's
 *   own downloaded browser (`chromium.executablePath()`).
 *
 *   🔴 NO BROWSER IS A FAILURE, NOT A SKIP. This used to print SKIP and
 *   `process.exit(0)` so "browserless CI doesn't hard-fail" — which is the
 *   positive-control hole: a green exit code that proves nothing ran, in a job
 *   whose whole output is an exit code. It now exits 4. Set
 *   SHOWCASE_E2E_ALLOW_SKIP=1 to get the old behaviour for a local run on a host
 *   with no browser; never set it in CI.
 *
 *   Screenshots (light+dark, showcase + tokens + elements) are written to
 *   $SHOWCASE_SHOT_DIR (default: ./.showcase-shots).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const DIST = join(repoRoot, '.vitepress', 'dist');
const PORT = Number(process.env.SHOWCASE_E2E_PORT || 4183);
const BASE = `http://localhost:${PORT}`;
const SHOT_DIR = process.env.SHOWCASE_SHOT_DIR || join(repoRoot, '.showcase-shots');

/**
 * CARDINALITY FLOORS — "did this suite look at ANYTHING", and nothing more.
 *
 * Same control, and the same reasoning, as `check-showcase-coverage.mjs`'s FLOORS:
 * an assertion of the form *"X holds for all N things"* is VACUOUSLY TRUE at N=0,
 * and every way of reading zero things here is silent. A renamed `.cds-demo`
 * class, a `data-testid` that moved, a generated page that failed to generate, a
 * selector that stopped matching — each turns "28 passed" into a sentence about
 * nothing. The `for all ${parity.length} demos` check was the live instance: it
 * reported `0 demos` as a PASS.
 *
 * Measured on the built site at @civitai/components@0.8.1: 21 `.cds-demo` blocks
 * on apps/showcase, 45 `[data-testid="cds-el-preview"]` containers on
 * apps/reference/elements, and 45 distinct upgraded `<civitai-*>` tags inside them
 * (47 elements exist; the 2 under the package's src/sdk/ render nothing
 * off-platform and the generator documents them instead of previewing them).
 *
 * 🔴 THESE SIT FAR BELOW THE REAL VALUES ON PURPOSE, and raising them is a bug,
 * not a tightening — the same trap `check-showcase-coverage.mjs` hit and
 * documented. A floor set NEAR the real count STEALS the failure from the
 * assertion that would have named the actual cause: lose one demo and you want
 * `snippet accuracy … mismatched: card`, not `demos: 20 (floor 21)`. COVERAGE is
 * `check:showcase-coverage`'s job and it owns the exact counts; these numbers
 * exist only to separate "measured and passed" from "measured nothing".
 */
const MIN_EXPECTED = {
  demos: 15,
  elementPreviews: 30,
  upgradedElementTags: 30,
};

/** The Tailwind Preflight reset colour — `*{border-color:#e4e4e7}`. Seeing THIS on
 *  a component border is the signature of the hatch having lost. */
const PREFLIGHT_BORDER = 'rgb(228, 228, 231)';

/* ─────────────────────────── chromium resolution ─────────────────────────── */

function resolveChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH || process.env.CHROMIUM_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    const r = spawnSync('command', ['-v', bin], { shell: true, encoding: 'utf8' });
    const p = (r.stdout || '').trim();
    if (p && existsSync(p)) return p;
  }
  // Last resort: a browser playwright downloaded itself (`npx playwright install
  // chromium`). `executablePath()` is a pure path computation — it does not check
  // the file is there — so the existsSync is what makes this a resolution and not
  // a guess.
  try {
    const p = chromium.executablePath();
    if (p && existsSync(p)) return p;
  } catch {
    /* no registry entry for this build */
  }
  return null;
}

/* ──────────────────────────── assertion harness ──────────────────────────── */

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function eq(name, actual, expected) {
  check(name, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
/** A floor on a count, so the "for all N" assertion next to it cannot be vacuous. */
function atLeast(name, actual, floor) {
  check(`${name} (floor ${floor})`, Number.isFinite(actual) && actual >= floor, `counted ${actual}`);
}

/* ───────────────────────────── preview server ────────────────────────────── */

function startPreview() {
  const bin = join(repoRoot, 'node_modules', '.bin', 'vitepress');
  const proc = spawn(bin, ['preview', '--port', String(PORT)], {
    cwd: repoRoot,
    stdio: 'ignore',
    env: process.env,
  });
  return proc;
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server did not come up at ${url}`);
}

/* ────────────────────────────── theme helpers ────────────────────────────── */

/** Force the site into a known appearance via localStorage + reload, then wait
 *  for hydration to fill the live preview `readySelector` names.
 *
 *  `readySelector` is a parameter because this helper is used on two pages now (the
 *  showcase and the element gallery) and the "the page is alive" anchor differs. It
 *  waits on the <html> class only — NOT on the preview's `data-theme` — on purpose:
 *  that attribute is one of the things under test (see the first-load-dark block),
 *  so waiting for it would make the assertion unfalsifiable. */
async function setAppearance(
  page,
  dark,
  readySelector = '[data-testid="cds-preview"] [data-civitai-ui="button"][data-variant="filled"]',
) {
  await page.evaluate((d) => {
    localStorage.setItem('vitepress-theme-appearance', d ? 'dark' : 'light');
  }, dark);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(
    ({ wantDark, sel }) =>
      document.documentElement.classList.contains('dark') === wantDark &&
      !!document.querySelector(sel),
    { wantDark: dark, sel: readySelector },
    { timeout: 15000 },
  );
}

/** Toggle dark mode the way a USER does — clicking the appearance switch — so we
 *  exercise the REACTIVE re-resolution (no reload). Returns after `<html>` flips
 *  and the preview container's data-theme has followed. */
async function toggleAppearanceToDark(page) {
  await page.click('.VPSwitchAppearance, .VPNavBarAppearance button, button.VPSwitchAppearance');
  await page.waitForFunction(
    () =>
      document.documentElement.classList.contains('dark') &&
      document.querySelector('[data-testid="cds-preview"]')?.getAttribute('data-theme') === 'dark',
    { timeout: 15000 },
  );
}

/* ──────────────────────────────── the suite ──────────────────────────────── */

async function run() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const exe = resolveChromium();
  if (!exe) {
    // 🔴 NOT exit 0. A job whose only output is an exit code cannot tell "28 checks
    // passed" from "no checks ran", and the old `SKIP` + exit 0 produced the second
    // while reading as the first. Opt out explicitly for a local browserless run.
    const msg =
      'no Chromium found — set PLAYWRIGHT_CHROMIUM_PATH / CHROMIUM_PATH, install a system ' +
      'chromium, or run `npx playwright install chromium`.';
    if (process.env.SHOWCASE_E2E_ALLOW_SKIP === '1') {
      console.log(`SKIP — ${msg} (SHOWCASE_E2E_ALLOW_SKIP=1)`);
      process.exit(0);
    }
    console.error(`FAIL — ${msg}`);
    console.error('       This suite is the only check that reads the design system\'s RENDERED');
    console.error('       values, so a green run without a browser is a green run that measured');
    console.error('       nothing. Set SHOWCASE_E2E_ALLOW_SKIP=1 to skip deliberately (never in CI).');
    process.exit(4);
  }
  console.log(`Chromium: ${exe}`);
  // Both pages, named explicitly: the element gallery is GENERATED (and gitignored)
  // by gen-appblocks-element-gallery.mjs on prebuild, so "the build ran" and "the
  // gallery exists" are different claims, and the second one is the one that goes
  // missing. Failing here names the cause; failing later looks like a selector bug.
  for (const page of [join('apps', 'showcase.html'), join('apps', 'reference', 'elements.html')]) {
    if (!existsSync(join(DIST, page))) {
      console.error(`Build output missing (${join(DIST, page)}); run \`npm run build\` first.`);
      process.exit(2);
    }
  }

  const server = startPreview();
  let browser;
  try {
    await waitForServer(`${BASE}/apps/showcase.html`);
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    /* 🔴 HERMETIC BY CONSTRUCTION — abort every request that is not localhost.
       Two reasons, and the second is why this suite is safe to BLOCK on:

       1. CORRECTNESS. A preview must render from the pinned bundle, not from
          something fetched at view time. Aborting the network is how that becomes
          an assertion rather than an assumption.
       2. THE REQUIRED-CHECK RULE from build-site.yml's own header: `npm run build`
          was made to issue no network request precisely so this job was safe to
          gate on, because a merely DEGRADED third party burned the whole job budget
          and reported a TIMEOUT — the least legible failure a required check can
          produce. The pages under test re-open that hole: <AuthBar> and
          useAuthToken fetch auth.civitai.com and civitai.com on mount, and
          `waitUntil: 'networkidle'` WAITS ON THEM. A hung host would stall the
          navigation to its own timeout and fail this gate for a reason that has
          nothing to do with the PR. Aborted requests settle instantly instead.

       Nothing the page needs is remote — every script, style and font in
       .vitepress/dist is served from the preview server; the only external URLs in
       the built HTML are anchor `href`s, which are never fetched. */
    await context.route('**/*', (route) => {
      const host = new URL(route.request().url()).hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return route.continue();
      return route.abort();
    });
    const page = await context.newPage();

    /* ---------- LIGHT ---------- */
    await page.goto(`${BASE}/apps/showcase`, { waitUntil: 'networkidle' });
    await setAppearance(page, false);

    const light = await page.evaluate(() => {
      const q = (sel) => document.querySelector(sel);
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const btn = q('[data-testid="cds-preview"] [data-civitai-ui="button"][data-variant="filled"]');
      const badge = q('[data-testid="cds-preview"] [data-civitai-ui="badge"]');
      const card = q('[data-testid="cds-preview"] [data-civitai-ui="card"]');
      const loader = q('[data-testid="cds-preview"] [data-civitai-ui="loader"]');
      const alert = q('[data-testid="cds-preview"] [data-civitai-ui="alert"]');
      const input = q('[data-testid="cds-preview"] [data-civitai-ui="text-input"] [data-civitai-ui-control]');
      const previewTheme = q('[data-testid="cds-preview"]')?.getAttribute('data-theme');
      return {
        btnBg: cs(btn)?.backgroundColor,
        badgeRadius: cs(badge)?.borderTopLeftRadius,
        cardBg: cs(card)?.backgroundColor,
        loaderRadius: cs(loader)?.borderTopLeftRadius,
        alertBg: cs(alert)?.backgroundColor,
        hasInput: !!input,
        previewTheme,
      };
    });

    eq('light: filled Button background === rgb(34, 139, 230)', light.btnBg, 'rgb(34, 139, 230)');
    eq('light: Badge is a pill (border-radius 999px)', light.badgeRadius, '999px');
    // ⚠ AMBIGUOUS BY CONSTRUCTION, and kept only as a "the card is painted at all"
    // check. In light, @civitai/theme resolves --civitai-color-surface AND
    // --civitai-color-body to the SAME #fefefe, so this passes whichever token the
    // card reads. The discriminating version of this assertion is only possible in
    // dark, and lives there.
    eq('light: Card surface === rgb(254, 254, 254)', light.cardBg, 'rgb(254, 254, 254)');
    eq('light: Loader is circular (border-radius 50%)', light.loaderRadius, '50%');
    check('light: Alert has a themed (non-transparent) tint', !!light.alertBg && light.alertBg !== 'rgba(0, 0, 0, 0)', light.alertBg);
    check('light: labeled input control renders', light.hasInput === true);
    eq('light: preview container data-theme', light.previewTheme, 'light');

    /* ---------- Render integrity (light) — the properties the Tailwind-Preflight
       border reset used to strip inside a preview, and the badge padding the
       size-less demo used to drop. These four assertions would have CAUGHT the
       maintainer-reported bugs (badge no-padding + no outline, invisible card
       border, empty loader, featureless Stack/Group) that the pre-existing suite
       (background/radius/font only) sailed past 21/21. ---------- */
    const lightRender = await page.evaluate(() => {
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const inDemo = (ui, sel) => document.querySelector(`.cds-demo[data-ui="${ui}"] [data-testid="cds-preview"] ${sel}`);
      const badgeFilled = inDemo('badge', '[data-civitai-ui="badge"][data-variant="filled"]');
      const badgeOutline = inDemo('badge', '[data-civitai-ui="badge"][data-variant="outline"]');
      const card = inDemo('card', '[data-civitai-ui="card"][data-with-border="true"]');
      const loader = inDemo('loader', '[data-civitai-ui="loader"]');
      const loaderR = loader ? loader.getBoundingClientRect() : null;
      const chips = document.querySelectorAll('.cds-demo[data-ui="stack"] [data-testid="cds-preview"] [data-demo-chip]');
      const firstChip = chips[0] || null;
      return {
        badgePadLeft: parseFloat(cs(badgeFilled)?.paddingLeft || '0'),
        outlineBorderW: parseFloat(cs(badgeOutline)?.borderTopWidth || '0'),
        outlineBorderColor: cs(badgeOutline)?.borderTopColor,
        cardBorderW: parseFloat(cs(card)?.borderTopWidth || '0'),
        cardBorderColor: cs(card)?.borderTopColor,
        loaderW: loaderR ? Math.round(loaderR.width) : 0,
        loaderH: loaderR ? Math.round(loaderR.height) : 0,
        loaderRingW: parseFloat(cs(loader)?.borderTopWidth || '0'),
        chipCount: chips.length,
        chipBg: cs(firstChip)?.backgroundColor,
      };
    });
    // Bug 1 — Badge padding + real outline.
    check('light: Badge has non-zero horizontal padding', lightRender.badgePadLeft > 0, `paddingLeft=${lightRender.badgePadLeft}px`);
    check(
      'light: Badge outline variant has a visible border (>=1px, primary color, not the reset #e4e4e7)',
      lightRender.outlineBorderW >= 1 && lightRender.outlineBorderColor === 'rgb(34, 139, 230)',
      `w=${lightRender.outlineBorderW}px color=${lightRender.outlineBorderColor}`,
    );
    // Bug 2 — Card data-with-border shows a real border.
    check(
      'light: Card data-with-border has a non-zero, non-reset border',
      lightRender.cardBorderW >= 1 && lightRender.cardBorderColor === 'rgb(206, 212, 218)',
      `w=${lightRender.cardBorderW}px color=${lightRender.cardBorderColor}`,
    );
    // Bug 4 — Loader renders a visible ring (non-empty box + non-zero border).
    check(
      'light: Loader renders a non-empty ring (w/h>0 and ring border>0)',
      lightRender.loaderW > 0 && lightRender.loaderH > 0 && lightRender.loaderRingW > 0,
      `w=${lightRender.loaderW} h=${lightRender.loaderH} ring=${lightRender.loaderRingW}px`,
    );
    // Bug 3 — Stack/Group demo has visible filled child chips.
    check(
      'light: Stack/Group demo has >=6 filled child chips (visible, non-transparent)',
      lightRender.chipCount >= 6 && !!lightRender.chipBg && lightRender.chipBg !== 'rgba(0, 0, 0, 0)',
      `chips=${lightRender.chipCount} bg=${lightRender.chipBg}`,
    );

    await page.screenshot({ path: join(SHOT_DIR, 'showcase-light.png'), fullPage: true });

    /* ---------- ComponentDemo behaviour (light) ---------- */
    const visibleFn = (el) => !!el && getComputedStyle(el).display !== 'none';
    const before = await page.evaluate((visSrc) => {
      const visible = eval(`(${visSrc})`);
      const d = document.querySelector('.cds-demo');
      return {
        html: visible(d.querySelector('[data-testid="cds-code-html"]')),
        react: visible(d.querySelector('[data-testid="cds-code-react"]')),
        previewHasUi: !!d.querySelector('[data-testid="cds-preview"] [data-civitai-ui]'),
      };
    }, visibleFn.toString());
    check('ComponentDemo: HTML panel shown first', before.html === true && before.react === false, JSON.stringify(before));
    check('ComponentDemo: live preview rendered the passed HTML', before.previewHasUi === true);

    // Click the React tab of the first demo (real async click → Vue re-renders).
    await page.click('.cds-demo [data-testid="cds-tab-react"]');
    await page.waitForFunction(
      () => {
        const d = document.querySelector('.cds-demo');
        const rp = d.querySelector('[data-testid="cds-code-react"]');
        return rp && getComputedStyle(rp).display !== 'none';
      },
      { timeout: 5000 },
    );
    const after = await page.evaluate((visSrc) => {
      const visible = eval(`(${visSrc})`);
      const d = document.querySelector('.cds-demo');
      return {
        html: visible(d.querySelector('[data-testid="cds-code-html"]')),
        react: visible(d.querySelector('[data-testid="cds-code-react"]')),
        reactSelected: d.querySelector('[data-testid="cds-tab-react"]').getAttribute('aria-selected'),
      };
    }, visibleFn.toString());
    check('ComponentDemo: clicking React tab swaps panels', after.react === true && after.html === false, JSON.stringify(after));
    eq('ComponentDemo: React tab becomes aria-selected', after.reactSelected, 'true');
    // Restore the HTML tab for the subsequent snippet-accuracy read.
    await page.click('.cds-demo [data-testid="cds-tab-html"]');

    /* ---------- Snippet accuracy: shown HTML ↔ live preview ---------- */
    const parity = await page.evaluate(() => {
      const norm = (root) =>
        Array.from(root.querySelectorAll('[data-civitai-ui]')).map((el) => el.getAttribute('data-civitai-ui'));
      const out = [];
      for (const demoEl of document.querySelectorAll('.cds-demo')) {
        const codeEl = demoEl.querySelector('[data-testid="cds-code-html"] pre code');
        const preview = demoEl.querySelector('[data-testid="cds-preview"]');
        // Extract the data-civitai-ui values from the shown snippet TEXT via regex —
        // compares the same thing as the rendered preview (the list of component
        // markers, in order) WITHOUT reinterpreting DOM text as HTML, which avoids
        // the CodeQL js/xss-through-dom sink (both innerHTML and DOMParser trip it).
        const shownText = codeEl ? codeEl.textContent : '';
        const shown = [...shownText.matchAll(/data-civitai-ui="([^"]+)"/g)].map((m) => m[1]);
        const rendered = norm(preview);
        out.push({ ui: demoEl.getAttribute('data-ui'), match: JSON.stringify(shown) === JSON.stringify(rendered), shown, rendered });
      }
      return out;
    });
    // The floor FIRST, because the assertion under it is "for all N" and N=0 passes.
    // A renamed `.cds-demo`, a moved `data-testid`, or a showcase page that stopped
    // rendering all read as `0 demos · 0 mismatched · PASS`.
    atLeast('demos measured on apps/showcase', parity.length, MIN_EXPECTED.demos);
    const mismatch = parity.filter((p) => !p.match);
    check(
      `snippet accuracy: shown HTML === live preview for all ${parity.length} demos`,
      mismatch.length === 0,
      mismatch.length ? `mismatched: ${mismatch.map((m) => m.ui).join(', ')}` : '',
    );

    /* ---------- Site-chrome non-regression ---------- */
    const chrome = await page.evaluate(() => {
      const root = document.documentElement;
      const rootCs = getComputedStyle(root);
      const vpFont = rootCs.getPropertyValue('--vp-font-family-base').trim();
      const civitaiFont = rootCs.getPropertyValue('--civitai-font').trim();
      const navLink = document.querySelector('.VPNavBar .VPNavBarMenuLink, .VPNavBar a, .VPNavBar .title');
      const sidebar = document.querySelector('.VPSidebar');
      const previewEl = document.querySelector('[data-testid="cds-preview"] [data-civitai-ui]');
      const leaks = document.querySelectorAll('.VPNav [data-civitai-ui], .VPSidebar [data-civitai-ui], .VPNavBar [data-civitai-ui]').length;
      // Any --vp-* custom prop shadowed by a --civitai-* value?
      const brand = rootCs.getPropertyValue('--vp-c-brand-1').trim();
      const civitaiPrimary = rootCs.getPropertyValue('--civitai-color-primary').trim();
      return {
        vpFont,
        civitaiFont,
        navFont: navLink ? getComputedStyle(navLink).fontFamily : null,
        sidebarPresent: !!sidebar,
        previewFont: previewEl ? getComputedStyle(previewEl).fontFamily : null,
        leaks,
        brand,
        civitaiPrimary,
      };
    });
    check('chrome: no [data-civitai-ui] elements leak into nav/sidebar', chrome.leaks === 0, `leaks=${chrome.leaks}`);
    check(
      'chrome: --vp-font-family-base and --civitai-font are distinct stacks',
      !!chrome.vpFont && !!chrome.civitaiFont && chrome.vpFont !== chrome.civitaiFont,
    );
    check(
      'chrome: nav font resolves from VitePress base font (not the civitai stack)',
      !!chrome.navFont && chrome.navFont.replace(/["']/g, '') === chrome.vpFont.replace(/["']/g, ''),
      chrome.navFont,
    );
    check(
      'chrome: preview font IS the civitai stack (DS font scoped to previews)',
      !!chrome.previewFont && chrome.previewFont.replace(/["']/g, '') === chrome.civitaiFont.replace(/["']/g, ''),
      chrome.previewFont,
    );
    check(
      'chrome: --vp-c-brand-1 not shadowed by --civitai-color-primary',
      !!chrome.brand && chrome.brand !== chrome.civitaiPrimary,
      `brand=${chrome.brand} civitaiPrimary=${chrome.civitaiPrimary}`,
    );

    /* ---------- DARK (reactive re-resolution via the appearance switch) ---------- */
    await toggleAppearanceToDark(page);
    const dark = await page.evaluate(() => {
      const q = (sel) => document.querySelector(sel);
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const inDemo = (ui, sel) => document.querySelector(`.cds-demo[data-ui="${ui}"] [data-testid="cds-preview"] ${sel}`);
      const btn = q('[data-testid="cds-preview"] [data-civitai-ui="button"][data-variant="filled"]');
      const card = q('[data-testid="cds-preview"] [data-civitai-ui="card"]');
      const cardBordered = inDemo('card', '[data-civitai-ui="card"][data-with-border="true"]');
      const badgeOutline = inDemo('badge', '[data-civitai-ui="badge"][data-variant="outline"]');
      const loader = inDemo('loader', '[data-civitai-ui="loader"]');
      const loaderR = loader ? loader.getBoundingClientRect() : null;
      // Read the two tokens the Card could plausibly be painted from, resolved in
      // this preview's own scope — see the assertions below for why.
      const previewCs = cs(q('[data-testid="cds-preview"]'));
      return {
        btnBg: cs(btn)?.backgroundColor,
        cardBg: cs(card)?.backgroundColor,
        tokenSurface: previewCs?.getPropertyValue('--civitai-color-surface').trim(),
        tokenBody: previewCs?.getPropertyValue('--civitai-color-body').trim(),
        previewTheme: q('[data-testid="cds-preview"]')?.getAttribute('data-theme'),
        cardBorderW: parseFloat(cs(cardBordered)?.borderTopWidth || '0'),
        cardBorderColor: cs(cardBordered)?.borderTopColor,
        outlineBorderW: parseFloat(cs(badgeOutline)?.borderTopWidth || '0'),
        loaderRingW: parseFloat(cs(loader)?.borderTopWidth || '0'),
        loaderBox: loaderR ? Math.round(loaderR.width) > 0 && Math.round(loaderR.height) > 0 : false,
      };
    });
    eq('dark: preview container data-theme re-resolved', dark.previewTheme, 'dark');
    eq('dark: filled Button background === rgb(25, 113, 194)', dark.btnBg, 'rgb(25, 113, 194)');
    /* 🔴 THE EXPECTED VALUE HERE WAS WRONG FOR THE WHOLE LIFE OF THIS FILE, and the
       light twin above structurally could not say so. `[data-civitai-ui='card']` is
       `background: var(--civitai-color-surface)` (components.css), and
       @civitai/theme@0.4.0 resolves, in DARK:
           --civitai-color-surface  #25262B  rgb(37, 38, 43)
           --civitai-color-body     #1A1B1E  rgb(26, 27, 30)
       This assertion expected rgb(26,27,30) — the BODY colour, i.e. the page behind
       the card, not the card. So it had nothing to do with the card at all, and it
       was red on `main` and on every branch since.

       Why nobody noticed from the light twin: in LIGHT both tokens are #fefefe, so
       `light: Card surface === rgb(254, 254, 254)` passes against either one and
       cannot discriminate. That is the whole bug class — a fixture whose constants
       collapse two distinct values into one.

       So the fix is the literal, PLUS the control that keeps the pair separable:
       assert the card equals the SURFACE token it reads, and assert that in dark
       surface and body are actually different values. If a future palette collapses
       them again, the second check goes red and says so, instead of this one
       silently becoming untestable. */
    eq('dark: Card surface === rgb(37, 38, 43)', dark.cardBg, 'rgb(37, 38, 43)');
    check(
      'dark: Card background IS --civitai-color-surface (not --civitai-color-body)',
      !!dark.tokenSurface && dark.cardBg === dark.tokenSurface && dark.cardBg !== dark.tokenBody,
      `card=${dark.cardBg} surface=${dark.tokenSurface} body=${dark.tokenBody}`,
    );
    check(
      'dark: --civitai-color-surface and --civitai-color-body are DISTINCT (so the check above can fail)',
      !!dark.tokenSurface && !!dark.tokenBody && dark.tokenSurface !== dark.tokenBody,
      `surface=${dark.tokenSurface} body=${dark.tokenBody}`,
    );
    check('dark: button re-resolved to a DIFFERENT value than light', dark.btnBg !== light.btnBg, `light=${light.btnBg} dark=${dark.btnBg}`);
    // Render integrity (dark) — the border reset was theme-agnostic, so re-assert
    // the restored borders re-resolve to the dark tokens.
    check(
      'dark: Card data-with-border has a non-zero, dark-token border',
      dark.cardBorderW >= 1 && dark.cardBorderColor === 'rgb(55, 58, 64)',
      `w=${dark.cardBorderW}px color=${dark.cardBorderColor}`,
    );
    check('dark: Badge outline variant keeps a visible border (>=1px)', dark.outlineBorderW >= 1, `w=${dark.outlineBorderW}px`);
    check('dark: Loader keeps a non-empty ring (box>0 and ring border>0)', dark.loaderBox && dark.loaderRingW > 0, `box=${dark.loaderBox} ring=${dark.loaderRingW}px`);

    await page.screenshot({ path: join(SHOT_DIR, 'showcase-dark.png'), fullPage: true });

    /* ---------- DARK ON FIRST LOAD (hydration, not reactivity) ----------
       🔴 A DIFFERENT CODE PATH FROM THE BLOCK ABOVE, AND IT WAS BROKEN WHILE THAT
       BLOCK WAS GREEN. Everything above reaches dark by CLICKING the appearance
       switch, which is a reactive update Vue patches into the DOM. A returning
       reader never clicks anything: dark is already in localStorage, the page is
       SERVER-rendered with VitePress's `isDark` as a `ref(false)` — so
       `data-theme="light"` is in the static HTML — and a PRODUCTION hydration does
       not repair a mismatched plain attribute. Measured before the fix, at +0ms,
       +1s and +3s after a dark first load: `<html class="dark">` but
       `data-theme="light"`, `--civitai-color-surface` = rgb(254,254,254), and every
       card painted white inside a dark page. See
       .vitepress/theme/composables/usePreviewTheme.ts.

       `setAppearance(page, true)` is localStorage + RELOAD, which is exactly that
       path — so this block is the regression guard, and it is the reason the suite
       now exercises dark twice by two different mechanisms rather than once. */
    await setAppearance(page, true);
    const darkOnLoad = await page.evaluate(() => {
      const prev = document.querySelector('[data-testid="cds-preview"]');
      const card = document.querySelector('[data-testid="cds-preview"] [data-civitai-ui="card"]');
      const pcs = prev ? getComputedStyle(prev) : null;
      return {
        htmlDark: document.documentElement.classList.contains('dark'),
        previewTheme: prev?.getAttribute('data-theme'),
        tokenSurface: pcs?.getPropertyValue('--civitai-color-surface').trim(),
        cardBg: card ? getComputedStyle(card).backgroundColor : null,
      };
    });
    check('first-load dark: <html> carries .dark (the precondition)', darkOnLoad.htmlDark === true);
    eq('first-load dark: preview container data-theme follows it', darkOnLoad.previewTheme, 'dark');
    eq(
      'first-load dark: tokens resolve to the DARK scale, not the light one',
      darkOnLoad.tokenSurface,
      'rgb(37, 38, 43)',
    );
    eq('first-load dark: Card paints the dark surface', darkOnLoad.cardBg, 'rgb(37, 38, 43)');

    /* ---------- Element gallery: upgrade + the `.cds-el-preview` hatch ----------
       The OTHER consumption track, and until now observed by NOTHING in this
       repo — this suite only ever loaded apps/showcase (the `data-civitai-ui` CSS
       pack) and apps/tokens. `check:showcase-coverage` watches the hatch's tag LIST
       against the manifest, and its own header says it compares KEYS, never VALUES:
       it cannot tell whether the rule still WINS.

       Measured on the built site, deleting ONLY the `all: revert-layer` declaration
       inside `.cds-el-preview :is(…)` and rebuilding (the hatch's enclosing rule and
       its tag list left intact, so the mutation is the hatch and nothing else):

                                with hatch              without
         civitai-card border     1px rgb(206,212,218)    0px rgb(228,228,231)
         civitai-alert border    1px srgb(…/0.35)        0px rgb(228,228,231)
         civitai-badge border    1px transparent         0px rgb(228,228,231)
         civitai-text-input      568px wide              285px wide

       rgb(228,228,231) is Tailwind Preflight's `*{border-color:#e4e4e7}`, so the
       assertions below name that colour explicitly: a border that is BOTH zero-width
       and that exact colour is the reset having won, which is a different failure
       from a component that simply has no border. */
    await page.goto(`${BASE}/apps/reference/elements`, { waitUntil: 'networkidle' });
    await setAppearance(page, false, '[data-testid="cds-el-preview"] civitai-card');
    // Registration is LAZY (ElementPreview mounts it), so upgrade is asynchronous:
    // wait for it, but SWALLOW the timeout. The `every tag UPGRADED` check below is
    // what reports a registration failure, and it names the tags that never got
    // defined. Letting the wait throw instead would abort the run with a
    // `waitForFunction: Timeout` stack and skip the remaining 7 assertions —
    // measured: 36 result lines, zero FAIL lines, exit 1. A gate that is red for an
    // unreadable reason gets clicked through.
    await page
      .waitForFunction(() => !!customElements.get('civitai-card'), undefined, { timeout: 15000 })
      .catch(() => {});
    const gallery = await page.evaluate(() => {
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const inPreview = (tag) => document.querySelector(`.cds-el-preview ${tag}`);
      const box = (tag) => {
        const el = inPreview(tag);
        return el ? Math.round(el.getBoundingClientRect().width) : 0;
      };
      const border = (tag) => {
        const c = cs(inPreview(tag));
        return c ? { w: parseFloat(c.borderTopWidth || '0'), color: c.borderTopColor } : null;
      };
      const tagsPresent = [
        ...new Set(
          [...document.querySelectorAll('.cds-el-preview *')]
            .map((e) => e.tagName.toLowerCase())
            .filter((t) => t.startsWith('civitai-')),
        ),
      ];
      return {
        previews: document.querySelectorAll('[data-testid="cds-el-preview"]').length,
        tagsPresent: tagsPresent.length,
        upgraded: tagsPresent.filter((t) => !!customElements.get(t)).length,
        notUpgraded: tagsPresent.filter((t) => !customElements.get(t)),
        shadowRoots: tagsPresent.filter((t) => !!inPreview(t)?.shadowRoot).length,
        cardBorder: border('civitai-card'),
        alertBorder: border('civitai-alert'),
        badgeBorder: border('civitai-badge'),
        textInputW: box('civitai-text-input'),
      };
    });
    atLeast('elements: live preview containers', gallery.previews, MIN_EXPECTED.elementPreviews);
    atLeast('elements: distinct <civitai-*> tags in previews', gallery.tagsPresent, MIN_EXPECTED.upgradedElementTags);
    check(
      `elements: every one of the ${gallery.tagsPresent} tags UPGRADED (lazy registerSite() ran)`,
      gallery.notUpgraded.length === 0,
      gallery.notUpgraded.length ? `never defined: ${gallery.notUpgraded.join(', ')}` : '',
    );
    check(
      'elements: hatch holds — <civitai-card> host keeps its 1px rgb(206, 212, 218) border',
      gallery.cardBorder?.w >= 1 && gallery.cardBorder.color === 'rgb(206, 212, 218)',
      `w=${gallery.cardBorder?.w}px color=${gallery.cardBorder?.color}` +
        (gallery.cardBorder?.color === PREFLIGHT_BORDER ? ' ← Tailwind Preflight WON' : ''),
    );
    check(
      'elements: hatch holds — <civitai-alert> host border is not the Preflight reset',
      gallery.alertBorder?.w >= 1 && gallery.alertBorder.color !== PREFLIGHT_BORDER,
      `w=${gallery.alertBorder?.w}px color=${gallery.alertBorder?.color}`,
    );
    check(
      'elements: hatch holds — <civitai-badge> host border width survived the reset',
      gallery.badgeBorder?.w >= 1 && gallery.badgeBorder.color !== PREFLIGHT_BORDER,
      `w=${gallery.badgeBorder?.w}px color=${gallery.badgeBorder?.color}`,
    );
    check(
      'elements: hatch holds — <civitai-text-input> host still fills its preview (>400px)',
      gallery.textInputW > 400,
      `w=${gallery.textInputW}px (collapses to ~285px when the hatch loses)`,
    );
    await page.screenshot({ path: join(SHOT_DIR, 'elements-light.png'), fullPage: true });

    /* ---------- Token gallery (light + dark screenshots) ---------- */
    await page.goto(`${BASE}/apps/tokens`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('vitepress-theme-appearance', 'light'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="cds-token-gallery"]');
    await page.screenshot({ path: join(SHOT_DIR, 'tokens-light.png'), fullPage: true });
    await page.evaluate(() => localStorage.setItem('vitepress-theme-appearance', 'dark'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="cds-token-gallery"]');
    await page.screenshot({ path: join(SHOT_DIR, 'tokens-dark.png'), fullPage: true });
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nShowcase E2E: ${results.length} checks · ${results.length - failed.length} passed · ${failed.length} failed`);
  console.log(
    `Screenshots: ${SHOT_DIR} (showcase-{light,dark}.png, elements-light.png, tokens-{light,dark}.png)`,
  );
  if (failed.length) {
    console.error('\n--- failures ---');
    for (const f of failed) console.error(`  ${f.name} — ${f.detail}`);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
