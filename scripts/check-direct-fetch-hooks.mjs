#!/usr/bin/env node
/**
 * check-direct-fetch-hooks.mjs
 * ----------------------------
 * `apps/reference/hooks.md`'s hand-written "Trust model" box names the hooks
 * that are NOT host-mediated: they call `fetch()` on a `/api/v1/blocks/*` route
 * themselves, with the block token as a bearer. This guard asserts that list is
 * exactly the set of hook modules in the PINNED `@civitai/blocks-react` dist that
 * contain a `fetch(` call outside a comment — in both directions.
 *
 * Why it exists: the box used to say every hook was host-mediated, which went
 * false as hooks moved to direct fetches and nothing noticed. A hand list with
 * no check rots the same way the route counts beside it did.
 *
 * Repo-local (pinned devDep + a committed page, no network), so it BLOCKS a PR
 * from the `test-md-regions` job, which already runs the `npm ci` it needs.
 *
 * Positive control: a scan that finds zero direct-fetch hooks FAILS rather than
 * comparing an empty set — "0 found" is also what a broken scan prints.
 *
 * USAGE
 *   npm run check:direct-fetch-hooks
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, resolvePackageRoot } from './appblocks-util.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'apps/reference/hooks.md';
// The bullet wraps across lines, so the name span may contain newlines.
const LIST_LINE = /^- \*\*Direct-fetch hooks — ([\s\S]+?)\.\*\*/m;

/** Strip block comments and whole-line `//` comments, then look for `fetch(`
 * not preceded by an identifier char or `.` (so `refetch(` / `deps.fetch(` do
 * not count). A trailing `// … fetch(` would over-report — loudly, never silently. */
export function callsFetch(src) {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  return /(^|[^A-Za-z0-9_$.])fetch\(/m.test(code);
}

export function pageList(page) {
  const m = LIST_LINE.exec(page);
  if (!m) return null;
  return [...m[1].matchAll(/`(use[A-Za-z0-9]+)`/g)].map((x) => x[1]);
}

function main() {
  const pkgRoot = resolvePackageRoot('@civitai/blocks-react');
  const version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;
  const hooksDir = join(pkgRoot, 'dist', 'hooks');
  const files = readdirSync(hooksDir).filter((f) => /^use[A-Za-z0-9]+\.js$/.test(f));
  const actual = files
    .filter((f) => callsFetch(readFileSync(join(hooksDir, f), 'utf8')))
    .map((f) => f.replace(/\.js$/, ''))
    .sort();

  const named = pageList(readFileSync(join(repoRoot, PAGE), 'utf8'));
  if (!named) {
    console.error(`✗ ${PAGE}: no "- **Direct-fetch hooks — …**" bullet found; the guard cannot read the list.`);
    process.exit(1);
  }
  if (actual.length === 0) {
    console.error(`✗ scanned ${files.length} hook modules of @civitai/blocks-react@${version} and found no fetch( call — the scan is broken, not the page.`);
    process.exit(1);
  }

  const missing = actual.filter((h) => !named.includes(h));
  const extra = named.filter((h) => !actual.includes(h));
  const dupes = named.filter((h, i) => named.indexOf(h) !== i);
  if (missing.length || extra.length || dupes.length) {
    console.error(`✗ ${PAGE} direct-fetch hook list disagrees with @civitai/blocks-react@${version}:`);
    for (const h of missing) console.error(`  + ${h} calls fetch() but the page does not name it`);
    for (const h of extra) console.error(`  - ${h} is named on the page but makes no fetch() call`);
    for (const h of dupes) console.error(`  ! ${h} is named twice`);
    process.exit(1);
  }
  log(`ok: ${PAGE} names all ${actual.length} direct-fetch hooks of @civitai/blocks-react@${version} (${actual.join(', ')}), scanned ${files.length} hook modules`);
}

main();
