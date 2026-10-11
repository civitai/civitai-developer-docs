// Asserts that every `.md` twin this site emits actually carries CONTENT.
//
// 🔴 THE GAP THIS CLOSES. `vitepress-plugin-llms` emits one `.md` per page, and
// that twin is how every AI agent reads this site — the `civitai` CLI's
// generated `AGENTS.md` tells agents in as many words that "the `.md` suffix
// serves the plain-text source an agent can read directly", and `/llms.txt`
// indexes the twins, not the HTML. Nothing asserted the twins were non-empty.
//
// Measured on the live site 2026-09-30, before this check existed:
//
//     /apps.md            23 bytes
//     /orchestration.md   32 bytes
//
// Both were frontmatter and nothing else. The cause is that `apps/index.md` and
// `orchestration/index.md` are `layout: home` pages whose entire content lives
// in the `hero:` and `features:` frontmatter keys — and the twin strips
// frontmatter. So the two natural entry points for "what is this section",
// both listed in `/llms.txt`, served an agent a blank page while the HTML
// rendered a full hero. `site/index.md` was unaffected precisely because it is
// an ordinary page with a markdown body, which is the shape this check pins.
//
// It is a CONTENT floor, not a byte floor on the file: frontmatter is stripped
// before measuring, because a page can carry a large `hero:` block and still be
// empty to a reader that never sees it. That is the exact defect.
//
// 🔴 A ZERO HERE MUST NOT BE A VACUOUS PASS. If the dist glob ever stops
// matching — a plugin change, a renamed output dir — walking zero files would
// report success while checking nothing. So this asserts a non-zero FLOOR on
// the number of twins found, the same discipline `check-built-site.mjs` uses.
// The floor is deliberately far below the real count (127 unique pages as of
// 2026-09-30) so ordinary page churn never reddens it; it exists to catch a
// glob that has gone to nothing, not to track the page count.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = '.vitepress/dist';

// A twin below this many characters of post-frontmatter, non-whitespace body is
// treated as empty. The two known-bad pages measured 0. The smallest legitimate
// twin on the live site was /orchestration/guide.md at ~1.3 KB, so 200 sits an
// order of magnitude below the real floor and well above the defect.
const MIN_BODY_CHARS = 200;

// See the header: this guards against a glob that matches nothing, not against
// page-count drift.
const MIN_TWINS = 50;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// Strip a leading YAML frontmatter block, the way the twin's own reader would
// see it. Only a block that starts on the very first line counts — a `---`
// further down is a horizontal rule, and treating one as frontmatter would
// silently eat real body text.
function body(text) {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return text;
  return text.slice(end + 4);
}

let twins;
try {
  statSync(DIST);
  twins = walk(DIST);
} catch {
  console.error(`check-agent-md: no build output at ${DIST} — run \`npm run build\` first.`);
  process.exit(2);
}

if (twins.length < MIN_TWINS) {
  console.error(
    `check-agent-md: found only ${twins.length} .md twin(s) under ${DIST}, expected at least ${MIN_TWINS}.`,
  );
  console.error(
    'check-agent-md: that is a BROKEN SEARCH, not a clean result — a pass computed over ' +
      'zero files would assert nothing. Check that vitepress-plugin-llms still emits twins here.',
  );
  process.exit(1);
}

const empty = [];
for (const p of twins) {
  const raw = readFileSync(p, 'utf8');
  const chars = body(raw).replace(/\s+/g, '').length;
  if (chars < MIN_BODY_CHARS) empty.push([relative(DIST, p), chars, raw.length]);
}

if (empty.length) {
  console.error(
    `check-agent-md: ${empty.length} of ${twins.length} .md twin(s) carry no usable body ` +
      `(< ${MIN_BODY_CHARS} non-whitespace chars after frontmatter):\n`,
  );
  for (const [p, chars, total] of empty) {
    console.error(`  /${p}  —  ${chars} body chars (file is ${total} B, so it is ~all frontmatter)`);
  }
  console.error(
    '\ncheck-agent-md: an agent fetching that URL gets a blank page while the HTML renders fine.\n' +
      'If the page is `layout: home`, its hero/features live in frontmatter and the twin strips\n' +
      'them — give the page a markdown body below the frontmatter (see site/index.md, or the\n' +
      '"Where to start" sections on apps/index.md and orchestration/index.md).',
  );
  process.exit(1);
}

console.log(`check-agent-md: OK — ${twins.length} .md twin(s), all carry a body.`);

// ── Hook-entry FIDELITY ───────────────────────────────────────────────────────
//
// 🔴 THE GAP THIS CLOSES. "Carries a body" is a floor, and a twin can clear it
// while quoting its source wrongly. The hooks twin is a generated region
// (scripts/appblocks-md.mjs), and its inline escaper backslash-escaped `<`
// INSIDE code spans, where CommonMark does not process escapes — so
// `useSaveImage`'s `` `<a href="blob:…" download>` `` reached agents as
// `` `\<a href="blob:…" download>` ``, a backslash the source never contained
// (red at c65de89 for useSaveImage and useNestedDocument). check:md-regions could not see it (the region IS byte-identical to generator
// output) and neither could this file's body floor.
//
// So: for EVERY hook in public/appblocks/hooks.json, the BUILT twin's entry for
// that hook must contain the full text of its `description` and of every one of
// its `notes`, compared after the same normalisation on both sides — whitespace
// collapsed, emphasis markers dropped, backslash escapes resolved OUTSIDE code
// spans (what a CommonMark reader sees) and code-span content kept VERBATIM.
// That last asymmetry is the point: an escape added inside a code span survives
// normalisation and fails here.
//
// The expectation is read from the SOURCE artifact, never from the generator,
// and the comparison is per hook, so a failure names the hook and the first
// span the twin lost.

const HOOKS_JSON = 'public/appblocks/hooks.json';
const HOOKS_TWIN = join(DIST, 'apps/reference/hooks.md');
// Positive control on the population: today's artifact carries 42 hooks. A
// floor far below that catches an artifact or slicer that has gone to nothing.
const MIN_HOOKS = 20;

const FENCE_OPEN = /^\s*(`{3,}|~{3,})\s*([\w-]*)\s*$/;

/** Inline normalisation of one prose run (see header). */
function normInline(s) {
  // Same CommonMark backtick-run matching the generator uses, re-derived here so
  // the check does not inherit a bug from the code it checks. Backslash-escaped
  // backticks outside a span are honoured, as a CommonMark reader would.
  let out = '';
  let i = 0;
  const runEnd = (p) => {
    while (s[p] === '`') p++;
    return p;
  };
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length && /[!-/:-@[-`{-~]/.test(s[i + 1])) {
      out += s[i + 1] === '*' || s[i + 1] === '_' ? '' : s[i + 1];
      i += 2;
      continue;
    }
    if (c === '*' || c === '_') {
      i++;
      continue;
    }
    if (c !== '`') {
      out += c;
      i++;
      continue;
    }
    const open = runEnd(i);
    const n = open - i;
    let close = -1;
    for (let k = open; k < s.length; ) {
      if (s[k] !== '`') {
        k++;
        continue;
      }
      const e = runEnd(k);
      if (e - k === n) {
        close = k;
        break;
      }
      k = e;
    }
    if (close === -1) {
      out += s.slice(i, open);
      i = open;
      continue;
    }
    let content = s.slice(open, close).replace(/\s+/g, ' ');
    if (content.length > 2 && content.startsWith(' ') && content.endsWith(' ')) content = content.slice(1, -1);
    out += ` \`${content}\` `;
    i = close + n;
  }
  return out;
}

/**
 * Block-level normalisation: fenced blocks are kept raw (an `md` fence holds
 * markdown, so it is normalised recursively), everything else is prose. Fence
 * delimiter lines themselves are dropped on both sides.
 */
function normBlocks(md) {
  const lines = String(md ?? '').split('\n');
  const parts = [];
  let prose = [];
  const flush = () => {
    if (prose.length) parts.push(normInline(prose.join('\n')));
    prose = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FENCE_OPEN);
    if (!m) {
      prose.push(lines[i]);
      continue;
    }
    flush();
    const [, run, lang] = m;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const c = lines[j].match(/^\s*(`{3,}|~{3,})\s*$/);
      if (c && c[1][0] === run[0] && c[1].length >= run.length) break;
      body.push(lines[j]);
    }
    parts.push(lang === 'md' ? normBlocks(body.join('\n')) : body.join('\n'));
    i = j;
  }
  flush();
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** The first span of `want` that `have` does not contain, or null. */
function firstMissing(want, have) {
  if (have.includes(want)) return null;
  const words = want.split(' ');
  // Longest prefix of whole words still present, then report what follows it.
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (have.includes(words.slice(0, mid).join(' '))) lo = mid;
    else hi = mid - 1;
  }
  const missing = words.slice(lo).join(' ');
  return { after: words.slice(Math.max(0, lo - 8), lo).join(' '), missing: missing.slice(0, 160) };
}

let hooks;
let twinText;
try {
  hooks = JSON.parse(readFileSync(HOOKS_JSON, 'utf8')).hooks;
  twinText = readFileSync(HOOKS_TWIN, 'utf8');
} catch (err) {
  console.error(`check-agent-md: cannot read ${HOOKS_JSON} or ${HOOKS_TWIN}: ${err.message}`);
  process.exit(2);
}
if (!Array.isArray(hooks) || hooks.length < MIN_HOOKS) {
  console.error(
    `check-agent-md: ${HOOKS_JSON} lists ${hooks?.length ?? 0} hook(s), expected at least ${MIN_HOOKS} — ` +
      'a BROKEN SEARCH, not a clean result.',
  );
  process.exit(1);
}

// Slice the twin into one entry per hook, at the generator's `**`name`**` lines.
const twinLines = twinText.split('\n');
const headerAt = new Map();
twinLines.forEach((l, idx) => {
  const m = l.match(/^\*\*(`+)([A-Za-z0-9_]+)\1\*\*$/);
  if (m && !headerAt.has(m[2])) headerAt.set(m[2], idx);
});
const starts = [...headerAt.values()].sort((a, b) => a - b);
function entryOf(name) {
  const s = headerAt.get(name);
  if (s === undefined) return null;
  const e = starts.find((x) => x > s) ?? twinLines.length;
  return normBlocks(twinLines.slice(s + 1, e).join('\n'));
}

const lost = [];
let pieces = 0;
for (const h of hooks) {
  const entry = entryOf(h.name);
  if (entry === null) {
    lost.push(`  ${h.name}: no entry in the twin at all (no **\`${h.name}\`** line)`);
    continue;
  }
  const want = [];
  if (h.description) want.push(['description', normBlocks(h.description)]);
  (h.notes ?? []).forEach((n, k) => {
    want.push([`notes[${k}]`, n.kind === 'text' ? normBlocks(n.text) : String(n.code ?? '').replace(/\s+/g, ' ').trim()]);
  });
  for (const [field, text] of want) {
    if (!text) continue;
    pieces++;
    const miss = firstMissing(text, entry);
    if (miss) {
      // "Diverges", not "lost": the prefix match stops at the first difference,
      // so the text after it may still be in the twin, just not contiguously.
      lost.push(
        `  ${h.name} ${field}: the twin diverges from the source after "…${miss.after}"\n` +
          `      source continues: "${miss.missing}"`,
      );
    }
  }
}

if (lost.length) {
  console.error(
    `check-agent-md: ${lost.length} hook field(s) are not carried verbatim by /apps/reference/hooks.md ` +
      `(${pieces} field(s) across ${hooks.length} hooks checked):\n`,
  );
  for (const l of lost) console.error(l);
  console.error(
    '\ncheck-agent-md: the HTML page renders hooks.json directly, so it can be complete while the\n' +
      '.md twin agents read is not. The twin comes from the generated region in\n' +
      'apps/reference/hooks.md (scripts/appblocks-md.mjs) — fix the generator, then\n' +
      '`npm run gen:appblocks:md` and rebuild.',
  );
  process.exit(1);
}

console.log(
  `check-agent-md: OK — all ${pieces} description/notes field(s) of ${hooks.length} hooks are carried verbatim by the hooks twin.`,
);
