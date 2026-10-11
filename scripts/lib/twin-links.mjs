// Rewrites the RELATIVE markdown links in every `.md` twin `vitepress-plugin-llms`
// emits into ROOT-ABSOLUTE paths, resolved against the SOURCE page's directory.
//
// 🔴 THE BUG THIS FIXES. The plugin names a section index's twin after its
// DIRECTORY: `apps/guide/index.md` is emitted as `dist/apps/guide.md`, and
// `/llms.txt` advertises `/apps/guide.md`. The twin keeps the source's relative
// links verbatim, and those were written against `apps/guide/` — so read from
// `/apps/guide.md`, `](./sdk)` resolves to `/apps/sdk` (wrong) instead of
// `/apps/guide/sdk`, one directory too high. Measured on the live site
// 2026-10-11: 127 relative links across the ten advertised index twins that
// carry any. nginx also serves the same file at `/apps/guide/index.md`, where
// the very same links resolve correctly — so the twin's meaning depended on
// which of two URLs fetched it.
//
// The installed plugin (1.12.0) has no option for this: `domain` prefixes only
// llms.txt entries and each twin's `url:` frontmatter, never the body, and the
// `<dir>.md` naming is hard-coded (`generateBundle`). Hence a post-build pass.
//
// WHY EVERY TWIN, NOT ONLY INDEX TWINS. Every twin is served at TWO URLs:
// its own, and `/<stem>/index.md` via nginx.conf's `^(.+)/index\.md$` location,
// which matches any page, not just section indexes. A relative link resolves
// correctly at exactly one of them — an index twin's at the alias, every other
// twin's at its own URL. Measured on the build at 3ae6236: all 796 relative
// links in the twins were dead at one of their two URLs (127 at the llms.txt
// URL, 669 at the alias). Absolutizing a non-index twin's link resolves to the
// same target its own URL already reached (verified link-by-link on that build),
// so it changes nothing that worked and fixes the alias — ONE rule, "a twin's
// links do not depend on the URL that served it", which also holds for a twin
// an agent saved or quoted.
//
// What is left alone: absolute URLs (`https:`, `mailto:`, any scheme),
// protocol-relative `//host`, root paths `/x`, same-page `#anchor` / `?query`,
// and anything inside a fenced code block or an inline code span.
//
// 🔴 It touches ONLY files the plugin generated — identified by their own
// `url:` frontmatter naming their own path. `public/` copies such as
// `agent-setup/prompt.md` carry no such frontmatter and must stay byte-identical
// to the source (`check:built-site` asserts that).

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

const FENCE = /^\s*(`{3,}|~{3,})/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Is `target` a link this pass should rewrite? */
export function isRelativeTarget(target) {
  if (!target) return false;
  if (target.startsWith('/') || target.startsWith('#') || target.startsWith('?')) return false;
  return !SCHEME.test(target);
}

/** Resolve a relative target against a site directory ('' for the root). */
export function resolveTarget(target, siteDir) {
  const cut = target.search(/[?#]/);
  const pathPart = cut === -1 ? target : target.slice(0, cut);
  const suffix = cut === -1 ? '' : target.slice(cut);
  if (!pathPart) return target;
  let resolved = posix.join('/', siteDir, pathPart);
  // `./` and `.` both mean "this directory", which is a trailing-slash URL.
  if ((pathPart === '.' || pathPart.endsWith('/')) && !resolved.endsWith('/')) resolved += '/';
  return resolved + suffix;
}

// `](target)` / `](<target>)`, with an optional title after the target.
const INLINE_LINK = /\]\((<[^>\n]*>|[^)\s]+)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/g;
// `[label]: target` reference definitions.
const REF_DEF = /^(\s{0,3}\[[^\]]+\]:\s*)(<[^>\n]*>|\S+)/;

function rewriteTarget(raw, siteDir) {
  const angled = raw.startsWith('<') && raw.endsWith('>');
  const t = angled ? raw.slice(1, -1) : raw;
  if (!isRelativeTarget(t)) return raw;
  const r = resolveTarget(t, siteDir);
  return angled ? `<${r}>` : r;
}

/** Rewrite one prose line, leaving inline code spans untouched. */
function rewriteProse(line, siteDir) {
  let out = '';
  let i = 0;
  let seg = '';
  const flush = () => {
    out += seg.replace(INLINE_LINK, (_m, target, title = '') => `](${rewriteTarget(target, siteDir)}${title})`);
    seg = '';
  };
  while (i < line.length) {
    if (line[i] !== '`') {
      seg += line[i++];
      continue;
    }
    let n = i;
    while (line[n] === '`') n++;
    const len = n - i;
    // The closer is the next backtick run of EXACTLY the opener's length
    // (CommonMark); with none, the opener is literal text.
    let c = -1;
    for (let k = n; k < line.length; ) {
      if (line[k] !== '`') {
        k++;
        continue;
      }
      let e = k;
      while (line[e] === '`') e++;
      if (e - k === len) {
        c = k;
        break;
      }
      k = e;
    }
    if (c === -1) {
      seg += line.slice(i, n);
      i = n;
      continue;
    }
    flush();
    out += line.slice(i, c + len);
    i = c + len;
  }
  flush();
  return out;
}

/**
 * Rewrite every relative link in `text` (a twin's full contents) against
 * `siteDir`, the source page's directory relative to the site root.
 */
export function absolutizeLinks(text, siteDir) {
  const lines = text.split('\n');
  let fence = null;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const m = line.match(FENCE);
    if (fence) {
      const t = line.trim();
      if (m && t[0] === fence[0] && /^(`+|~+)$/.test(t) && t.length >= fence.length) fence = null;
      continue;
    }
    if (m) {
      fence = m[1];
      continue;
    }
    const ref = line.match(REF_DEF);
    lines[k] = ref
      ? ref[1] + rewriteTarget(ref[2], siteDir) + rewriteProse(line.slice(ref[0].length), siteDir)
      : rewriteProse(line, siteDir);
  }
  return lines.join('\n');
}

/** The `url:` a twin's frontmatter declares, or null. */
export function frontmatterUrl(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const m = text.slice(4, end).match(/^url:\s*['"]?([^'"\n]+?)['"]?\s*$/m);
  return m ? m[1] : null;
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/**
 * The SOURCE directory (site-relative, posix) a twin was generated from, or
 * throws when the source is missing or ambiguous — guessing would silently
 * resolve a page's links against the wrong directory, the very defect.
 */
export function sourceDirOf(twinRel, srcDir) {
  const stem = twinRel.slice(0, -'.md'.length);
  const asPage = existsSync(join(srcDir, `${stem}.md`));
  const asIndex = existsSync(join(srcDir, stem, 'index.md'));
  if (asPage && asIndex) {
    throw new Error(`twin /${twinRel} is ambiguous: both ${stem}.md and ${stem}/index.md exist in the source`);
  }
  if (asIndex) return stem;
  if (asPage) return posix.dirname(stem) === '.' ? '' : posix.dirname(stem);
  throw new Error(`twin /${twinRel} has no source page (${stem}.md or ${stem}/index.md)`);
}

/** Post-build pass over `outDir`. Returns counts for the build log. */
export function rewriteTwinLinks(outDir, srcDir) {
  let twins = 0;
  let changed = 0;
  for (const p of walk(outDir)) {
    const rel = relative(outDir, p).split(sep).join('/');
    const text = readFileSync(p, 'utf8');
    if (frontmatterUrl(text) !== `/${rel}`) continue;
    twins++;
    const next = absolutizeLinks(text, sourceDirOf(rel, srcDir));
    if (next !== text) {
      writeFileSync(p, next);
      changed++;
    }
  }
  return { twins, changed };
}
