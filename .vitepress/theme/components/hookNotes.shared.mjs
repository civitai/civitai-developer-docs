// Pure presentation helper for HooksReference.vue's README notes.
//
// Lives beside the component, like cliReference.shared.mjs, so plain-node
// scripts can import it: scripts/check-built-site.mjs compares the rendered page
// against `reflowNoteText(note.text)`, and scripts/test-appblocks-hooks.mjs pins
// its behaviour. It is deliberately NOT baked into hooks.json — the artifact
// keeps the README's lines verbatim (the generator's `verifyPublished` guard
// compares line by line, and the .md twin publishes them as-is); reflow is a
// fact about THIS page's markup.

// A line that starts its own visual line rather than continuing the previous
// one: a list item, a table row, a heading.
const STARTS_LINE = /^\s*(?:[-*+]\s|\d+[.)]\s|\|)|^\s{0,3}#{1,6}\s/;
const QUOTED = /^\s*>/;
const unquote = (l) => l.replace(/^\s*>\s?/, '');

/**
 * Undo the README's ~80-column HARD WRAP for display, and nothing else.
 *
 * The notes are upstream markdown shown as TEXT (never v-html — see
 * HooksReference.vue) in a `white-space: pre-wrap` block, so that list items,
 * table rows and 🔴 lines keep their own lines. pre-wrap also keeps every soft
 * line break the README author's editor inserted, which renders as ragged
 * mid-sentence breaks ("…the pick has / to match…"). A soft break is a space in
 * markdown, so joining a continuation line onto the line before it changes no
 * meaning.
 *
 * Joined: a non-blank line that does not start a list item / table row /
 * heading, onto a previous line that is not a table row or heading and does not
 * end in a hard break, and only within the same quote level (a `> …`
 * continuation joins a `> …` line, with its `>` dropped). Blank lines — paragraph
 * breaks — are kept exactly.
 *
 * @param {string} text
 * @returns {string}
 */
export function reflowNoteText(text) {
  return String(text ?? '')
    .split(/\n[ \t]*\n/)
    .map((block) => {
      const out = []; // { text, hardBreak } — hardBreak: the source line ended in `  ` or `\`
      for (const raw of block.split('\n')) {
        const line = raw.replace(/\s+$/, '');
        const hardBreak = / {2,}$|\\$/.test(raw);
        const prev = out.length ? out[out.length - 1] : null;
        const quoted = QUOTED.test(line);
        const body = quoted ? unquote(line) : line;
        const prevBody = prev && (QUOTED.test(prev.text) ? unquote(prev.text) : prev.text);
        const joins =
          prev !== null &&
          !prev.hardBreak &&
          body.trim() !== '' &&
          prevBody.trim() !== '' &&
          quoted === QUOTED.test(prev.text) &&
          !STARTS_LINE.test(body) &&
          !/^\s*(?:\||#{1,6}\s)/.test(prevBody);
        if (joins) out[out.length - 1] = { text: `${prev.text} ${body.trim()}`, hardBreak };
        else out.push({ text: line, hardBreak });
      }
      return out.map((l) => l.text).join('\n');
    })
    .join('\n\n');
}
