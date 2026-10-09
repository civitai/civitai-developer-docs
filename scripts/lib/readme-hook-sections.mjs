// Split the pinned `@civitai/blocks-react` README into one section per hook, and
// prove the published hook entries carry every line of their section.
//
// 🔴 THE DEFECT THIS REPLACES. `gen-appblocks-hooks.mjs` used to keep only the
// prose BEFORE a hook's first ```tsx fence:
//
//     const prose = text.slice(0, fence ? text.indexOf('```tsx') : text.length).trim();
//
// Everything after that fence was dropped without a word. Measured on the pinned
// @civitai/blocks-react@0.65.1 README: 21 of its 34 hook sections had content
// after their first fence, carrying 22 🔴 lines across 8 hooks that never reached
// the site — among them useResourcePicker's "derive the family from that
// checkpoint" guidance, which an agent then reported as missing
// (civitai/civitai-app-starters#580).
//
// It also had a second, latent defect that the first one hid: a section ended
// only at the next `use…` heading, so a hook followed by a NON-hook section ran on
// into it. useDomainMaturity's section ran to the end of the file (`### SfwGate`,
// `## The /testing subexport`, …, `## License`): 4,429 words against its own 264
// — harmless only because all of it was after the first fence and therefore
// thrown away. Publishing the rest of a section without fixing the boundary
// would have attached the rest of the README to that one hook.
//
// So a section now ends at the next heading of the SAME OR HIGHER level, whatever
// it is called, and the split is fence-aware: a `#` line inside a code block is a
// comment, not a heading.
//
// Shape of a section's published entry (see `splitSection`):
//   prose — the text before the first ```tsx fence (the hook's lead)
//   example — that fence's body
//   notes — everything after it, in order, as `text` and `code` segments
// The page renders them in that order: lead, example, the rest.

/** A README heading that opens a hook section. Unchanged from the original parser. */
export const HOOK_HEADING = /^(#{2,4})\s+`?(use[A-Za-z0-9]+)/;
/** Any ATX heading (CommonMark: up to 3 spaces of indent, then 1–6 `#`). */
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/;
/** A fence opener: up to 3 spaces, then 3+ backticks or tildes, then the info string. */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Classify every line of a markdown document by fence state.
 * Kinds: 'text' | 'fence-open' | 'fence-body' | 'fence-close'.
 * A fence closes on a line of the same character, at least as long, and nothing
 * else (CommonMark); an unclosed fence runs to the end of the document.
 */
export function tokenize(md) {
  const out = [];
  let open = null; // { ch, len }
  for (const text of String(md).split('\n')) {
    if (open) {
      const close = new RegExp(`^ {0,3}${open.ch === '`' ? '`' : '~'}{${open.len},}\\s*$`);
      if (close.test(text)) {
        out.push({ kind: 'fence-close', text });
        open = null;
      } else {
        out.push({ kind: 'fence-body', text });
      }
      continue;
    }
    const m = text.match(FENCE_OPEN);
    // A backtick fence's info string may not contain a backtick (CommonMark), so
    // ```` ```inline``` ```` on one line is a code span, not a fence.
    if (m && !(m[1][0] === '`' && m[2].includes('`'))) {
      open = { ch: m[1][0], len: m[1].length };
      out.push({ kind: 'fence-open', text, lang: m[2].trim().split(/\s+/)[0] || '' });
      continue;
    }
    out.push({ kind: 'text', text });
  }
  return out;
}

/**
 * One section per hook heading, in README order. A section runs until the next
 * hook heading or the next heading at the same or a higher level — so a
 * `### SfwGate` or a `## Testing` after a `### useX` is never attributed to useX.
 *
 * `interstitials` lists the non-hook headings that ended a hook section as its
 * SIBLING (same level) — README sections sitting inside the hook list that no
 * hook entry carries, e.g. `### SfwGate`. They are not published on the hooks
 * page; the generator names them so that is visible rather than silent.
 *
 * @returns {{ name: string, level: number, heading: string, tokens: ReturnType<typeof tokenize> }[] & { interstitials: { heading: string, tokens: ReturnType<typeof tokenize> }[] }}
 */
export function scanSections(md) {
  const sections = [];
  const interstitials = [];
  let current = null;
  let interstitial = null;
  let hookLevel = null; // level of the hook list we are inside, until a shallower heading leaves it
  for (const tok of tokenize(md)) {
    if (tok.kind === 'text') {
      const atx = tok.text.match(ATX_HEADING);
      if (atx) {
        const level = atx[1].length;
        const hook = tok.text.match(HOOK_HEADING);
        if (hook) {
          current = { name: hook[2], level: hook[1].length, heading: tok.text, tokens: [] };
          sections.push(current);
          hookLevel = current.level;
          interstitial = null;
          continue;
        }
        if (current && level <= current.level) current = null;
        if (!current) {
          if (hookLevel !== null && level < hookLevel) hookLevel = null;
          if (hookLevel !== null && level === hookLevel) {
            interstitial = { heading: tok.text.trim(), level, tokens: [] };
            interstitials.push(interstitial);
            continue;
          }
          if (interstitial && level <= interstitial.level) interstitial = null;
        }
      }
    }
    if (current) current.tokens.push(tok);
    else if (interstitial) interstitial.tokens.push(tok);
  }
  sections.interstitials = interstitials;
  return sections;
}

/** Drop leading/trailing blank lines; keep everything else verbatim. */
const trimBlankLines = (lines) => {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b).join('\n');
};

/**
 * Split one section into its lead prose, its example (the first ```tsx fence)
 * and its notes (everything after that fence, in order).
 *
 * With no ```tsx fence the whole section is prose, which is what the original
 * parser did; `notes` is then empty.
 *
 * @returns {{ prose: string|null, example: string|null, notes: ({kind:'text', text:string}|{kind:'code', lang:string, code:string})[] }}
 */
export function splitSection(tokens) {
  const first = tokens.findIndex((t) => t.kind === 'fence-open' && t.lang === 'tsx');
  if (first < 0) {
    const prose = trimBlankLines(tokens.map((t) => t.text));
    return { prose: prose || null, example: null, notes: [] };
  }
  const prose = trimBlankLines(tokens.slice(0, first).map((t) => t.text));
  let i = first + 1;
  const exampleLines = [];
  while (i < tokens.length && tokens[i].kind === 'fence-body') exampleLines.push(tokens[i++].text);
  if (i < tokens.length && tokens[i].kind === 'fence-close') i++;

  const notes = [];
  let text = [];
  const flushText = () => {
    const t = trimBlankLines(text);
    if (t) notes.push({ kind: 'text', text: t });
    text = [];
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === 'fence-open') {
      flushText();
      const code = [];
      i++;
      while (i < tokens.length && tokens[i].kind === 'fence-body') code.push(tokens[i++].text);
      if (i < tokens.length && tokens[i].kind === 'fence-close') i++;
      notes.push({ kind: 'code', lang: t.lang, code: code.join('\n').replace(/\n+$/, '') });
      continue;
    }
    text.push(t.text);
    i++;
  }
  flushText();
  return {
    prose: prose || null,
    example: exampleLines.join('\n').replace(/\n+$/, ''),
    notes,
  };
}

/**
 * The original parser's return shape — `{ order, byHook }` — built on the
 * fence-aware, level-bounded sections above.
 */
export function parseReadme(md) {
  const order = [];
  const byHook = {};
  for (const s of scanSections(md)) {
    order.push(s.name);
    byHook[s.name] = splitSection(s.tokens);
  }
  return { order, byHook };
}

/** Render a hook's notes back to markdown, nested fences re-opened at a safe length. */
export function notesMarkdown(notes) {
  return (notes ?? [])
    .map((n) => {
      if (n.kind === 'text') return n.text;
      const longest = (n.code.match(/`{3,}/g) ?? []).reduce((m, r) => Math.max(m, r.length), 2);
      const f = '`'.repeat(longest + 1);
      return `${f}${n.lang}\n${n.code}\n${f}`;
    })
    .join('\n\n');
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * 🔴 THE FAIL-LOUD GUARD. For every hook whose entry was built from its README
 * section, every non-blank line of that section — prose, list items, table rows,
 * code, 🔴 warnings, deeper subheadings — must appear in the published entry
 * (description + example + notes), compared line by line after whitespace
 * normalisation. Fence delimiter lines are the only lines exempt.
 *
 * It reads the SECTION, not the splitter's output, so it cannot agree with a
 * splitter that drops something: put the old "prose before the first fence"
 * line back and this names every hook that loses content.
 *
 * And the boundary: no published prose (description or text notes) may contain a
 * heading at the section's own level or higher — that would be a different README section
 * attached to this hook.
 *
 * @param {ReturnType<typeof scanSections>} sections
 * @param {{name:string, description?:string, example?:string, exampleSource?:string|null, notes?:any[]}[]} entries
 * @returns {string[]} one human-readable problem per failing hook; empty when clean
 */
export function verifyPublished(sections, entries) {
  const byName = new Map(entries.map((e) => [e.name, e]));
  const problems = [];
  for (const s of sections) {
    const e = byName.get(s.name);
    // A README heading with no exported hook is not published at all — that is
    // the d.ts deciding, not a dropped line. The caller reports those separately.
    if (!e) continue;
    // A MULTISET, not a set: a line like `}` or `});` occurs in the example AND in
    // a later fence, and set membership would let the later copy vanish unseen.
    const published = new Map();
    for (const l of [e.description ?? '', e.example ?? '', ...(e.notes ?? []).map((n) => (n.kind === 'code' ? n.code : n.text))]
      .join('\n')
      .split('\n')
      .map(norm)
      .filter(Boolean)) {
      published.set(l, (published.get(l) ?? 0) + 1);
    }
    const missing = [];
    for (const l of s.tokens.filter((t) => t.kind === 'text' || t.kind === 'fence-body').map((t) => norm(t.text))) {
      if (!l) continue;
      const n = published.get(l) ?? 0;
      if (n > 0) published.set(l, n - 1);
      else missing.push(l);
    }
    if (missing.length) {
      const red = missing.filter((l) => l.includes('🔴')).length;
      problems.push(
        `${s.name}: ${missing.length} line(s) of its README section are not published` +
          `${red ? ` (${red} of them 🔴)` : ''} — first: ${JSON.stringify(missing[0].slice(0, 100))}`,
      );
    }
    // The description too: a section with no ```tsx fence is ALL lead, so a
    // boundary regression there lands in `description`, not in `notes`.
    const leaked = [e.description ?? '', ...(e.notes ?? []).filter((n) => n.kind === 'text').map((n) => n.text)]
      .flatMap((t) => t.split('\n'))
      .filter((l) => {
        const m = l.match(ATX_HEADING);
        return m && m[1].length <= s.level;
      });
    if (leaked.length) {
      problems.push(
        `${s.name}: its published text contains ${leaked.length} heading(s) at level <= ${s.level} — another README ` +
          `section has been attached to this hook — first: ${JSON.stringify(leaked[0].trim())}`,
      );
    }
  }
  return problems;
}
