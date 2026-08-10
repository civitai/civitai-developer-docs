#!/usr/bin/env node
/**
 * test-tokens-drift.mjs
 * ---------------------
 * Asserts the <TokenGallery> on apps/tokens.md renders EXACTLY the tokens that
 * `@civitai/theme` exports — no missing, stale, or misnamed rows.
 *
 * WHY / HOW
 *   <TokenGallery> derives every row from `Object.keys(tokenVars)` at component
 *   setup (not a hand-list), and those rows are static v-for output present in
 *   the SSR HTML. So the drift check is fully deterministic against the BUILT
 *   site — no browser needed:
 *     expected = Object.keys(tokenVars)            (the published package)
 *     actual   = data-token="…" of every `cds-token-row` in dist/apps/tokens.html
 *   The two SETS must be equal. It also verifies each row's `--civitai-*`
 *   custom-property name matches the one embedded in the package's `tokenVars`
 *   `var(--…)` string, so a row can't silently point at the wrong property.
 *
 * Fails (exit 1) on any of: a token exported but not rendered (missing), a row
 * rendered for a token the package no longer exports (stale), or a mismatched
 * CSS-var name (misnamed).
 *
 * USAGE
 *   npm run build && npm run test:tokens:drift
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const DIST = join(repoRoot, '.vitepress', 'dist', 'apps', 'tokens.html');

function fail(msg) {
  console.error(`\n✗ token drift: ${msg}`);
  process.exit(1);
}

async function loadTokenVars() {
  // The package is ESM-only with a proper `.` exports condition — import it.
  const mod = await import('@civitai/theme');
  if (!mod.tokenVars) fail('`@civitai/theme` did not export `tokenVars`.');
  return mod.tokenVars;
}

/** Extract `{ token: cssVar }` for every `cds-token-row` in the built HTML. */
function extractRenderedRows(html) {
  const rows = new Map();
  // Each row: <... data-testid="cds-token-row" data-token="NAME" ...>…<... --civitai-… …>
  const re = /data-testid="cds-token-row"[^>]*\bdata-token="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) rows.set(m[1], null);
  // Also capture, per row, the first --civitai-* property mentioned in its block
  // by slicing to the next row (or end) and grabbing the css var.
  const names = [...rows.keys()];
  const idxs = names.map((n) => html.indexOf(`data-token="${n}"`));
  for (let i = 0; i < names.length; i++) {
    const start = idxs[i];
    const end = i + 1 < names.length ? idxs[i + 1] : html.length;
    const slice = html.slice(start, end);
    const v = /(--civitai-[a-z0-9-]+)/i.exec(slice);
    rows.set(names[i], v ? v[1] : null);
  }
  return rows;
}

async function main() {
  if (!existsSync(DIST)) {
    fail(`built page not found at ${DIST} — run \`npm run build\` first.`);
  }
  const tokenVars = await loadTokenVars();
  const expected = new Map(
    Object.entries(tokenVars).map(([name, ref]) => {
      const mm = /var\((--[a-z0-9-]+)\)/i.exec(String(ref));
      return [name, mm ? mm[1] : null];
    }),
  );

  const html = readFileSync(DIST, 'utf8');
  const rendered = extractRenderedRows(html);

  const expNames = new Set(expected.keys());
  const gotNames = new Set(rendered.keys());

  const missing = [...expNames].filter((n) => !gotNames.has(n));
  const stale = [...gotNames].filter((n) => !expNames.has(n));
  const misnamed = [];
  for (const n of expNames) {
    if (!gotNames.has(n)) continue;
    if (expected.get(n) !== rendered.get(n)) {
      misnamed.push(`${n}: package=${expected.get(n)} rendered=${rendered.get(n)}`);
    }
  }

  console.log(
    `TokenGallery drift: ${expNames.size} exported · ${gotNames.size} rendered`,
  );

  if (missing.length) fail(`missing rows (exported but not rendered): ${missing.join(', ')}`);
  if (stale.length) fail(`stale rows (rendered but not exported): ${stale.join(', ')}`);
  if (misnamed.length) fail(`misnamed CSS var(s):\n  ${misnamed.join('\n  ')}`);

  console.log('✓ token gallery matches @civitai/theme exactly (no missing/stale/misnamed).');
}

main().catch((e) => fail(e?.stack || String(e)));
