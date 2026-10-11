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
 *   4. <ComponentDemo> behaviour — the CSS-only preview renders the passed HTML.
 *   6. <ElementDemo> upgrade — in light AND dark, every `<civitai-*>` element
 *      on the page is DEFINED, every demo's preview has a non-zero box, every
 *      tag a demo names in its chips renders at least one visible instance
 *      (bar HIDDEN_BY_DESIGN), no demo's #js threw, and the page logged no
 *      console error. Then at a 390px phone viewport: no horizontal page
 *      overflow.
 *   2. Snippet accuracy (HTML↔preview) — the sequence of `data-civitai-ui`
 *      values in the SHOWN html source equals the sequence in the live preview
 *      DOM (the preview is derived from the shown html; this guards that link).
 *
 * The CSS-only demos sit in collapsed `::: details` panels; the suite opens every
 * panel before measuring, because a closed panel's content has no layout box.
 *   5. Site-chrome non-regression — importing the design-system CSS did NOT
 *      restyle the VitePress chrome: no `[data-civitai-ui]` leaks into nav/
 *      sidebar, the chrome font resolves from `--vp-font-family-base` (NOT the
 *      civitai stack, which is what the previews use), and no `--vp-*` custom
 *      property has been shadowed by a `--civitai-*` value.
 *
 * Token-gallery drift is a separate, browserless check: `test:tokens:drift`.
 *
 * USAGE
 *   npm run build && npm run test:showcase:e2e
 *   Chromium resolution order: $PLAYWRIGHT_CHROMIUM_PATH, $CHROMIUM_PATH,
 *   `chromium`/`chromium-browser`/`google-chrome` on PATH, then the browser
 *   `npx playwright-core install chromium` downloaded for the installed
 *   playwright-core. If none is found the suite prints SKIP and exits 0 — unless
 *   SHOWCASE_E2E_REQUIRE_BROWSER=1 (set by .github/workflows/showcase-e2e.yml),
 *   which makes a missing browser a failure.  Screenshots (light+dark) are
 *   written to $SHOWCASE_SHOT_DIR (default: ./.showcase-shots).
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

/* ─────────────────────────── chromium resolution ─────────────────────────── */

function resolveChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH || process.env.CHROMIUM_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    const r = spawnSync('command', ['-v', bin], { shell: true, encoding: 'utf8' });
    const p = (r.stdout || '').trim();
    if (p && existsSync(p)) return p;
  }
  // Last: the build `npx playwright-core install chromium` downloaded for THIS
  // playwright-core version — how CI gets a browser (showcase-e2e.yml). Asked of
  // playwright-core itself, so the path tracks the pinned version; it throws or
  // names a missing file when nothing was installed.
  try {
    const managed = chromium.executablePath();
    if (managed && existsSync(managed)) return managed;
  } catch {
    /* no managed browser */
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

/** Open every collapsed `<details>` (the CSS-only panels): a closed panel's
 *  content has no layout box, so sizes measured inside it read 0. */
async function openAllDetails(page) {
  await page.evaluate(() => document.querySelectorAll('.vp-doc details').forEach((d) => (d.open = true)));
}

/** Elements a demo names that render nothing until the reader acts (a closed
 *  dialog, a menu's items, an empty toast region). Being DEFINED is still
 *  asserted for them; only the visible-instance check skips them. */
const HIDDEN_BY_DESIGN = new Set([
  'civitai-modal',
  'civitai-confirm-dialog',
  'civitai-toast-region',
  'civitai-menu-item',
  'civitai-menu-label',
]);

/** Measure every <ElementDemo> on the page. */
async function measureElementDemos(page) {
  return page.evaluate((hidden) => {
    const hiddenSet = new Set(hidden);
    const out = [];
    for (const demo of document.querySelectorAll('.cds-demo')) {
      const preview = demo.querySelector('.cds-element-preview');
      if (!preview) continue;
      const title = demo.querySelector('.cds-demo__title')?.firstChild?.textContent?.trim();
      const chips = [...demo.querySelectorAll('.cds-demo__tag')].map((c) => c.textContent.replace(/[<>]/g, ''));
      const all = [...preview.querySelectorAll('*')].filter((el) => el.localName.startsWith('civitai-'));
      const undefinedTags = [...new Set(all.filter((el) => !customElements.get(el.localName)).map((el) => el.localName))];
      const box = preview.getBoundingClientRect();
      const invisibleChips = chips.filter((tag) => {
        if (hiddenSet.has(tag)) return false;
        return ![...preview.querySelectorAll(tag)].some((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
      });
      out.push({
        title,
        chips,
        elements: all.length,
        undefinedTags,
        width: Math.round(box.width),
        height: Math.round(box.height),
        invisibleChips,
        jsError: demo.querySelector('.cds-demo__error')?.textContent ?? '',
        theme: preview.getAttribute('data-theme'),
      });
    }
    return out;
  }, [...HIDDEN_BY_DESIGN]);
}

function assertElementDemos(label, demos, wantTheme) {
  const upgraded = demos.filter((d) => d.undefinedTags.length === 0 && d.width > 0 && d.height > 0);
  check(
    `${label}: every <ElementDemo> upgraded (all civitai-* defined, non-zero preview) — ${upgraded.length}/${demos.length}`,
    demos.length > 0 && upgraded.length === demos.length,
    demos
      .filter((d) => !upgraded.includes(d))
      .map((d) => `${d.title}: undefined=[${d.undefinedTags}] ${d.width}x${d.height}`)
      .join('; '),
  );
  const elementCount = demos.reduce((n, d) => n + d.elements, 0);
  check(`${label}: civitai-* instances inside element previews > 0`, elementCount > 0, `instances=${elementCount}`);
  const invisible = demos.filter((d) => d.invisibleChips.length);
  check(
    `${label}: every chip tag renders a visible instance in its demo`,
    invisible.length === 0,
    invisible.map((d) => `${d.title}: ${d.invisibleChips.join(',')}`).join('; '),
  );
  const thrown = demos.filter((d) => d.jsError);
  check(`${label}: no demo #js threw`, thrown.length === 0, thrown.map((d) => `${d.title}: ${d.jsError}`).join('; '));
  const wrongTheme = demos.filter((d) => d.theme !== wantTheme);
  check(`${label}: every element preview data-theme === ${wantTheme}`, wrongTheme.length === 0, wrongTheme.map((d) => d.title).join(', '));
}

/** Force the site into a known appearance via localStorage + reload, then wait
 *  for hydration to fill the first live preview. */
async function setAppearance(page, dark) {
  await page.evaluate((d) => {
    localStorage.setItem('vitepress-theme-appearance', d ? 'dark' : 'light');
  }, dark);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(
    (wantDark) =>
      document.documentElement.classList.contains('dark') === wantDark &&
      !!document.querySelector('[data-testid="cds-preview"] [data-civitai-ui="button"][data-variant="filled"]'),
    dark,
    { timeout: 15000 },
  );
  await openAllDetails(page);
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
    // In CI a missing browser is a broken job, not a skip: a SKIP exits 0 and
    // would read as a green E2E that never opened a page.
    if (process.env.SHOWCASE_E2E_REQUIRE_BROWSER === '1') {
      console.error('FAIL — no Chromium found and SHOWCASE_E2E_REQUIRE_BROWSER=1 (run `npx playwright-core install chromium`).');
      process.exit(1);
    }
    console.log('SKIP — no Chromium found (set PLAYWRIGHT_CHROMIUM_PATH / CHROMIUM_PATH or install chromium).');
    process.exit(0);
  }
  console.log(`Chromium: ${exe}`);
  if (!existsSync(join(DIST, 'apps', 'showcase.html'))) {
    console.error(`Build output missing (${DIST}); run \`npm run build\` first.`);
    process.exit(2);
  }

  const server = startPreview();
  let browser;
  try {
    await waitForServer(`${BASE}/apps/showcase.html`);
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

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
    const firstCss = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="cds-preview"]')?.closest('.cds-demo');
      return {
        hasCode: !!d?.querySelector('[data-testid="cds-code-html"] pre code'),
        previewHasUi: !!d?.querySelector('[data-testid="cds-preview"] [data-civitai-ui]'),
        reactTabs: document.querySelectorAll('[data-testid="cds-tab-react"]').length,
      };
    });
    check('ComponentDemo: live preview rendered the passed HTML', firstCss.hasCode && firstCss.previewHasUi, JSON.stringify(firstCss));
    eq('ComponentDemo: no React source tab on the page', firstCss.reactTabs, 0);

    /* ---------- ElementDemo upgrade (light) ---------- */
    const lightElements = await measureElementDemos(page);
    assertElementDemos('light', lightElements, 'light');

    /* ---------- Snippet accuracy: shown HTML ↔ live preview ---------- */
    const parity = await page.evaluate(() => {
      const norm = (root) =>
        Array.from(root.querySelectorAll('[data-civitai-ui]')).map((el) => el.getAttribute('data-civitai-ui'));
      const out = [];
      for (const demoEl of document.querySelectorAll('.cds-demo')) {
        if (!demoEl.querySelector('[data-testid="cds-code-html"]')) continue; // an <ElementDemo>
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
      return {
        btnBg: cs(btn)?.backgroundColor,
        cardBg: cs(card)?.backgroundColor,
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
    // A card paints the SURFACE token (#25262B in dark), not the body (#1A1B1E).
    // This expected the body colour and was red on every run; in light both
    // tokens are #fefefe, so the light twin above cannot tell them apart.
    eq('dark: Card surface === rgb(37, 38, 43)', dark.cardBg, 'rgb(37, 38, 43)');
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

    /* ---------- ElementDemo upgrade (dark, after a reload in dark) ---------- */
    await setAppearance(page, true);
    const darkElements = await measureElementDemos(page);
    assertElementDemos('dark', darkElements, 'dark');

    await page.screenshot({ path: join(SHOT_DIR, 'showcase-dark.png'), fullPage: true });

    /* ---------- Phone width (390px): no horizontal page overflow ---------- */
    // CONTROL: the VitePress navbar itself overflows a 390px viewport by a few px
    // on EVERY page (measured on origin/main's /apps/: scrollWidth 394 — the
    // hamburger's container), which is site chrome, not the showcase. So the
    // assertion is: the showcase overflows no further than a demo-free page, and
    // no demo box crosses the viewport edge.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/apps/`, { waitUntil: 'networkidle' });
    const chromeScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.goto(`${BASE}/apps/showcase`, { waitUntil: 'networkidle' });
    for (const dark of [false, true]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await setAppearance(page, dark);
      const phone = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        widest: [...document.querySelectorAll('.vp-doc .cds-demo')]
          .map((d) => Math.round(d.getBoundingClientRect().right))
          .reduce((a, b) => Math.max(a, b), 0),
        // A preview whose CONTENT (shadow roots included) runs past its own
        // right edge is clipped on a phone even when the page does not scroll.
        clipped: [...document.querySelectorAll('.cds-preview')]
          .map((pr) => {
            const edge = pr.getBoundingClientRect().right;
            let max = 0;
            const walk = (root) => {
              for (const el of root.querySelectorAll('*')) {
                const r = el.getBoundingClientRect();
                if (r.width && r.height) max = Math.max(max, r.right);
                if (el.shadowRoot) walk(el.shadowRoot);
              }
            };
            walk(pr);
            const title = pr.closest('.cds-demo')?.querySelector('.cds-demo__title')?.firstChild?.textContent?.trim();
            return { title, over: Math.round(max - edge) };
          })
          .filter((x) => x.over > 0),
      }));
      check(
        `phone 390px (${dark ? 'dark' : 'light'}): no preview's content runs past its edge`,
        phone.clipped.length === 0,
        phone.clipped.map((c) => `${c.title} +${c.over}px`).join('; '),
      );
      check(
        `phone 390px (${dark ? 'dark' : 'light'}): no horizontal overflow beyond the site chrome's own`,
        phone.scrollWidth <= Math.max(phone.innerWidth, chromeScrollWidth) && phone.widest <= phone.innerWidth,
        `scrollWidth=${phone.scrollWidth} (demo-free /apps/: ${chromeScrollWidth}) innerWidth=${phone.innerWidth} widestDemoRight=${phone.widest}`,
      );
      const phoneElements = await measureElementDemos(page);
      const upgraded = phoneElements.filter((d) => d.undefinedTags.length === 0 && d.width > 0 && d.height > 0);
      check(
        `phone 390px (${dark ? 'dark' : 'light'}): every <ElementDemo> upgraded — ${upgraded.length}/${phoneElements.length}`,
        phoneElements.length > 0 && upgraded.length === phoneElements.length,
      );
      await page.screenshot({ path: join(SHOT_DIR, `showcase-phone-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // CONTROL: the site chrome (the navbar's token pill) makes credentialed
    // calls to civitai.com that a non-civitai origin rejects with CORS errors on
    // EVERY page. Load a page with no demos and subtract what it logs, so the
    // assertion is about errors the showcase adds — and print the control's
    // count so a zero here is never read alone.
    const control = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const controlErrors = [];
    control.on('console', (msg) => msg.type() === 'error' && controlErrors.push(msg.text()));
    control.on('pageerror', (err) => controlErrors.push(String(err)));
    await control.goto(`${BASE}/apps/`, { waitUntil: 'networkidle' });
    await control.waitForTimeout(1500);
    await control.close();
    const chromeNoise = new Set(controlErrors);
    const added = consoleErrors.filter((e) => !chromeNoise.has(e));
    check(
      `showcase: no console errors beyond the demo-free control page (control /apps/ logged ${controlErrors.length}, showcase ${consoleErrors.length})`,
      added.length === 0,
      added.slice(0, 5).join(' | '),
    );

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
  console.log(`Screenshots: ${SHOT_DIR} (showcase-{light,dark}.png, tokens-{light,dark}.png)`);
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
