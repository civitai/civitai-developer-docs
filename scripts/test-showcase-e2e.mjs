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
 *
 * Token-gallery drift is a separate, browserless check: `test:tokens:drift`.
 * React-snippet typecheck accuracy is covered by `test:snippets:appblocks`.
 *
 * USAGE
 *   npm run build && npm run test:showcase:e2e
 *   Chromium resolution order: $PLAYWRIGHT_CHROMIUM_PATH, $CHROMIUM_PATH,
 *   `chromium`/`chromium-browser`/`google-chrome` on PATH. If none is found the
 *   suite prints SKIP and exits 0 (so browserless CI doesn't hard-fail); run it
 *   on a host with Chromium for the real gate.  Screenshots (light+dark) are
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
      const btn = q('[data-testid="cds-preview"] [data-civitai-ui="button"][data-variant="filled"]');
      const card = q('[data-testid="cds-preview"] [data-civitai-ui="card"]');
      return {
        btnBg: cs(btn)?.backgroundColor,
        cardBg: cs(card)?.backgroundColor,
        previewTheme: q('[data-testid="cds-preview"]')?.getAttribute('data-theme'),
      };
    });
    eq('dark: preview container data-theme re-resolved', dark.previewTheme, 'dark');
    eq('dark: filled Button background === rgb(25, 113, 194)', dark.btnBg, 'rgb(25, 113, 194)');
    eq('dark: Card surface === rgb(26, 27, 30)', dark.cardBg, 'rgb(26, 27, 30)');
    check('dark: button re-resolved to a DIFFERENT value than light', dark.btnBg !== light.btnBg, `light=${light.btnBg} dark=${dark.btnBg}`);

    await page.screenshot({ path: join(SHOT_DIR, 'showcase-dark.png'), fullPage: true });

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
