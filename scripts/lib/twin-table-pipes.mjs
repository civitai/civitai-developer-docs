// Puts the `\|` escapes back into the table rows of every `.md` twin and every
// `llms-full.txt` section, copying each affected row from its SOURCE page.
//
// 🔴 THE BUG THIS FIXES. `vitepress-plugin-llms` (1.12.0) rebuilds every page
// with `remark()` + `remark-frontmatter` and NO `remark-gfm`, so a table is
// parsed as a plain paragraph. A `|` in paragraph text needs no escape, so the
// serializer DROPS the `\` of every `\|` outside a code span, and the escaped
// pipe inside a cell becomes a column separator. Measured on the live site
// 2026-11-17: `/site/reference/models.md` serves
//   | `checkpointType` | `Standard` | `Trained` | `Merge` | — | For checkpoint models only. |
// (6 cells under a 4-column header) for the source row
//   | `checkpointType` | `Standard` \| `Trained` \| `Merge` | — | For checkpoint models only. |
// 10 rows across 7 pages, in the twins and in `/llms-full.txt` alike. Inline
// code is serialized verbatim, so a `\|` INSIDE a code span survives — and stays:
// in a GFM table cell that backslash is the escape GFM requires there too.
//
// The plugin has no option to add a remark plugin, so this is a post-build pass
// from VitePress' `buildEnd`, before the link passes (they rewrite link targets,
// after which a twin row no longer equals its source row).
//
// HOW. For each source row outside a fenced block that carries a `\|` outside a
// code span, the twin holds exactly what the plugin's serializer makes of that
// row. That is computed by running the row through the same processor the
// plugin builds (`remark().use(remarkFrontmatter)`, default stringify options),
// not modelled as "drop the `\|` backslashes": on the same line the serializer
// also escapes `_` and `[`, decodes entities and drops trailing spaces, and a
// row carrying one of those would match no hand-written model. `remark` and
// `remark-frontmatter` are imported undeclared on purpose: the plugin is their
// only dependent, so the hoisted copy IS the plugin's and tracks its version.
// Every twin line outside a fence that equals that form is replaced by the
// source row. Only rows the source escaped are touched,
// so a fenced block or a code span in the twin can never be rewritten: neither
// the match nor the replacement looks inside one.
//
// 🔴 FAIL-LOUD. A source row with an escape that appears in its twin neither
// broken nor intact means the twin's row did not come from serializing that
// line alone (an `<llm-exclude>`, an include, or a plugin change), and the row
// would ship broken without anyone seeing it: `restoreTwinTablePipes`
// throws and fails the build. `check:twin-tables` independently asserts every
// table in the built twins has a constant column count.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import { frontmatterUrl, mapProseSegments, sourceFileOf, splitBundle } from './twin-links.mjs';

const FENCE = /^\s*(`{3,}|~{3,})/;

/** Call `fn(line, index)` for every line of `text` outside a fenced code block. */
function eachProseLine(lines, fn) {
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
    fn(line, k);
  }
}

/** True when `line` has a `\|` outside its code spans: the escape the serializer drops. */
export function hasPipeEscape(line) {
  return mapProseSegments(line, (seg) => seg.replaceAll('\\|', '|')) !== line;
}

const serializer = remark().use(remarkFrontmatter);

/** What the plugin's serializer makes of one table row (no trailing newline). */
export function serializeRow(line) {
  return String(serializer.processSync(line)).replace(/\n$/, '');
}

/**
 * The source's escaped table rows, keyed by the form the plugin emits them in.
 * A row is a line outside a fence whose first non-blank character is `|`.
 */
export function escapedRows(sourceText) {
  const rows = new Map();
  eachProseLine(sourceText.split('\n'), (line) => {
    if (!line.trimStart().startsWith('|')) return;
    if (!hasPipeEscape(line)) return;
    const broken = serializeRow(line);
    const prev = rows.get(broken);
    if (prev !== undefined && prev !== line) {
      throw new Error(`two different source rows serialize to the same twin row: ${JSON.stringify(broken)}`);
    }
    rows.set(broken, line);
  });
  return rows;
}

/**
 * Restore the escaped table rows of one twin (or one llms-full section) from its
 * source page. Returns the new text, how many lines it restored, and the source
 * rows found in the twin neither broken nor intact.
 */
export function restoreTablePipes(twinText, sourceText) {
  const rows = escapedRows(sourceText);
  if (rows.size === 0) return { text: twinText, restored: 0, missed: [] };
  const intact = new Set(rows.values());
  const seen = new Set();
  const lines = twinText.split('\n');
  let restored = 0;
  eachProseLine(lines, (line, k) => {
    const fixed = rows.get(line);
    if (fixed !== undefined) {
      lines[k] = fixed;
      seen.add(fixed);
      restored++;
    } else if (intact.has(line)) {
      seen.add(line);
    }
  });
  const missed = [...intact].filter((row) => !seen.has(row));
  return { text: lines.join('\n'), restored, missed };
}

function walk(dir, want) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, want));
    else if (e.isFile() && want(e.name)) out.push(p);
  }
  return out;
}

/**
 * Post-build pass over `outDir`: every plugin twin (identified, as in
 * `rewriteTwinLinks`, by a `url:` naming its own path) and every section of every
 * `llms-full.txt`. Throws on any missed row. Returns counts for the build log.
 */
export function restoreTwinTablePipes(outDir, srcDir) {
  const sources = new Map();
  const sourceOf = (twinRel) => {
    const file = sourceFileOf(twinRel, srcDir);
    if (!sources.has(file)) sources.set(file, readFileSync(join(srcDir, file), 'utf8'));
    return sources.get(file);
  };
  const missed = [];
  let twins = 0;
  let sections = 0;
  let rowsRestored = 0;
  let filesChanged = 0;

  for (const p of walk(outDir, (name) => name.endsWith('.md'))) {
    const rel = relative(outDir, p).split(sep).join('/');
    const text = readFileSync(p, 'utf8');
    if (frontmatterUrl(text) !== `/${rel}`) continue;
    twins++;
    const r = restoreTablePipes(text, sourceOf(rel));
    for (const row of r.missed) missed.push(`/${rel}: ${row}`);
    rowsRestored += r.restored;
    if (r.text !== text) {
      writeFileSync(p, r.text);
      filesChanged++;
    }
  }

  for (const p of walk(outDir, (name) => name === 'llms-full.txt')) {
    const bundleRel = relative(outDir, p).split(sep).join('/');
    const text = readFileSync(p, 'utf8');
    const out = splitBundle(text).map((section, k) => {
      const url = frontmatterUrl(section);
      if (!url || !url.startsWith('/') || !url.endsWith('.md')) {
        throw new Error(`${bundleRel} section ${k + 1} has no site-root .md url: header`);
      }
      sections++;
      const r = restoreTablePipes(section, sourceOf(url.slice(1)));
      for (const row of r.missed) missed.push(`/${bundleRel} (${url}): ${row}`);
      rowsRestored += r.restored;
      return r.text;
    });
    const next = out.join('');
    if (next !== text) {
      writeFileSync(p, next);
      filesChanged++;
    }
  }

  if (missed.length > 0) {
    throw new Error(
      `twin-table-pipes: ${missed.length} escaped source table row(s) appear in no twin, broken or intact ` +
        `(the plugin's serializer emitted them as something other than serializing that line alone; ` +
        `check for an <llm-exclude> or include around the row, or reword the cell so it needs no \\| ` +
        `outside a code span):\n  ${missed.join('\n  ')}`,
    );
  }
  return { twins, sections, rowsRestored, filesChanged };
}
