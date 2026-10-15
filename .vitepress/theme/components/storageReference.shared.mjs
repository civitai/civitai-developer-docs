// Shared by <StorageReference> and its .md fallback renderer (scripts/appblocks-md.mjs).

/**
 * Split a row's text on single backticks into plain and inline-code runs, so the island
 * renders `name` as <code> while the .md channel keeps the backticks verbatim. An
 * unmatched trailing backtick stays plain text.
 *
 * @param {string} text
 * @returns {Array<{ code: boolean, text: string }>}
 */
export function inlineCodeSegments(text) {
  const out = [];
  const parts = String(text).split('`');
  const closed = parts.length % 2 === 1;
  parts.forEach((p, i) => {
    const isCode = i % 2 === 1 && (closed || i < parts.length - 1);
    if (!isCode && i % 2 === 1) out.push({ code: false, text: '`' + p });
    else if (p) out.push({ code: isCode, text: p });
  });
  return out;
}

/** The island's `table` prop values, in page order. */
export const STORAGE_TABLES = ['limits', 'errors'];
