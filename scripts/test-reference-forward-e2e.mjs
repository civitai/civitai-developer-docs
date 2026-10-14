#!/usr/bin/env node
/**
 * Browser E2E for the split-reference hubs' OLD-ANCHOR FORWARDER
 * (`<ReferenceIndex>` in .vitepress/theme/components/ReferenceIndex.vue).
 *
 * The hooks, CLI and generation-bridge references were split into sub-pages,
 * so an entry's old deep link (`/apps/reference/hooks#hook-useTip`) now points
 * at a hub. The hub keeps the old id and, when JavaScript runs, forwards to the
 * entry's sub-page. These checks pin the forward from the reader's side:
 *
 *   1. BACK LEAVES. A reader on page A who follows an old deep link and is
 *      forwarded must get back to A with ONE Back. The first forwarder called
 *      `router.go()`, which PUSHES a history entry — so Back popped to the hub
 *      URL, the hub re-mounted, forwarded again, and Back never left (measured
 *      ×3 on 95406d1). The forward must REPLACE the hub entry.
 *   2. A DIRECT OPEN (no prior page) of an old deep link still forwards, for
 *      each split reference.
 *   3. A hub anchor that did NOT move stays on the hub.
 *
 * The built site cannot show any of this — the forward runs only in a browser.
 *
 * USAGE
 *   npm run build && npm run test:reference:e2e
 *
 * No Chromium → SKIP (exit 0) on a contributor's machine, unless
 * REFERENCE_E2E_REQUIRE_BROWSER=1 (CI: showcase-e2e.yml), where it fails.
 * Browser resolution and the preview server mirror scripts/test-showcase-e2e.mjs.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const DIST = join(repoRoot, '.vitepress', 'dist');
const PORT = Number(process.env.REFERENCE_E2E_PORT || 4184);
const BASE = `http://localhost:${PORT}`;

function resolveChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH || process.env.CHROMIUM_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    const r = spawnSync('command', ['-v', bin], { shell: true, encoding: 'utf8' });
    const p = (r.stdout || '').trim();
    if (p && existsSync(p)) return p;
  }
  try {
    const managed = chromium.executablePath();
    if (managed && existsSync(managed)) return managed;
  } catch {
    /* no managed browser */
  }
  return null;
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server did not come up at ${url}`);
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Path + hash of the page's current URL, `.html` dropped (cleanUrls). */
const where = (page) => {
  const u = new URL(page.url());
  return u.pathname.replace(/\.html$/, '') + u.hash;
};

/** Wait for the URL to become `want`; return what it is either way. */
async function settleOn(page, want, timeout = 8000) {
  await page
    .waitForFunction((w) => location.pathname.replace(/\.html$/, '') + location.hash === w, want, { timeout })
    .catch(() => {});
  // Let a (buggy) second forward fire before the caller reads the URL.
  await page.waitForTimeout(600);
  return where(page);
}

// One old deep link per split reference, with where it must land. Literal on
// purpose: these are the URLs that exist in the wild, and a regroup that moves
// one of these entries should make a human re-read this file.
const DEEP_LINKS = [
  ['/apps/reference/hooks#hook-useTip', '/apps/reference/hooks/buzz-and-purchases#hook-useTip'],
  ['/apps/reference/cli#cli-app-submit', '/apps/reference/cli/app#cli-app-submit'],
  ['/apps/reference/generation#bridge-BlockWorkflowSnapshot', '/apps/reference/generation/lifecycle#bridge-BlockWorkflowSnapshot'],
];
const STAYS = ['/apps/reference/cli#cli-global-flags', '/apps/reference/generation#what-the-bridge-can-and-cannot-do'];
const PAGE_A = '/apps/guide/quickstart';

async function run() {
  const exe = resolveChromium();
  if (!exe) {
    if (process.env.REFERENCE_E2E_REQUIRE_BROWSER === '1') {
      console.error('FAIL — no Chromium found and REFERENCE_E2E_REQUIRE_BROWSER=1.');
      process.exit(1);
    }
    console.log('SKIP — no Chromium found (set PLAYWRIGHT_CHROMIUM_PATH / CHROMIUM_PATH or install chromium).');
    process.exit(0);
  }
  console.log(`Chromium: ${exe}`);
  if (!existsSync(join(DIST, 'apps', 'reference', 'hooks.html'))) {
    console.error(`Build output missing (${DIST}); run \`npm run build\` first.`);
    process.exit(2);
  }

  const server = spawn(join(repoRoot, 'node_modules', '.bin', 'vitepress'), ['preview', '--port', String(PORT)], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  let browser;
  try {
    await waitForServer(`${BASE}/apps/reference/hooks.html`);
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

    // 1. BACK LEAVES — A → old deep link → forwarded → Back → A.
    for (const [from, to] of DEEP_LINKS) {
      const page = await browser.newPage();
      await page.goto(`${BASE}${PAGE_A}`, { waitUntil: 'networkidle' });
      await page.goto(`${BASE}${from}`, { waitUntil: 'networkidle' });
      const landed = await settleOn(page, to);
      check(`${from} forwards to its sub-page`, landed === to, `landed on ${landed}`);
      await page.goBack({ waitUntil: 'commit' }).catch(() => {});
      const back = await settleOn(page, PAGE_A);
      check(`Back from the forwarded ${from} returns to ${PAGE_A}`, back === PAGE_A, `Back landed on ${back}`);
      await page.close();
    }

    // 2. DIRECT OPEN — a fresh tab with no prior page still forwards, and the
    //    target entry is on the page.
    for (const [from, to] of DEEP_LINKS) {
      const page = await browser.newPage();
      await page.goto(`${BASE}${from}`, { waitUntil: 'networkidle' });
      const landed = await settleOn(page, to);
      const id = to.split('#')[1];
      // The HUB also carries this id (on its index entry), so presence alone
      // cannot tell "the sub-page rendered" from "the URL changed over the hub's
      // DOM". Require the id on an element OUTSIDE the hub index, and no hub
      // index on the page at all.
      const rendered = await page.evaluate((i) => {
        const el = document.getElementById(i);
        return !!el && !el.closest('.ab-refindex') && !document.querySelector('.ab-refindex');
      }, id);
      check(
        `direct open of ${from} forwards and renders the sub-page's #${id}`,
        landed === to && rendered,
        `landed on ${landed}, sub-page entry ${rendered ? 'rendered' : 'NOT rendered (hub DOM?)'}`,
      );
      await page.close();
    }

    // 3. A hub anchor that did not move stays put.
    for (const url of STAYS) {
      const page = await browser.newPage();
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      const at = where(page);
      check(`${url} stays on the hub`, at === url, `at ${at}`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nReference forward E2E: ${results.length} checks · ${results.length - failed.length} passed · ${failed.length} failed`);
  // Positive control on the harness: every list above must have produced checks.
  const expected = DEEP_LINKS.length * 2 + DEEP_LINKS.length + STAYS.length;
  if (results.length !== expected) {
    console.error(`expected ${expected} checks, ran ${results.length} — the harness skipped some`);
    process.exit(1);
  }
  if (failed.length) process.exit(1);
}

run().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
