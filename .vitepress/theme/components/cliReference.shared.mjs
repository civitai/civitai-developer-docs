// Pure presentation helpers for CliReference.vue.
//
// They live in a plain `.mjs` beside the component, rather than inside the SFC,
// so scripts/test-appblocks-cli.mjs (plain node) can import and pin them. A
// helper that only exists inside a `<script setup>` block is unreachable from
// the PR-blocking gate, and both of the defects below shipped precisely because
// nothing outside the browser ever evaluated them.
//
// They are deliberately NOT baked into public/appblocks/cli.json: that artifact
// is a data mirror of `civitai app --help`, and an anchor slug / heading depth
// is a fact about THIS page's markup, not about the CLI.

/**
 * The DOM id for a command's heading.
 *
 * 🔴 Was `` `cli-${c.command}` `` — which emits literal SPACES inside an id for
 * every command in the reference: `id="cli-app listing set-icon"`. A space is
 * legal in an HTML5 id but is not a valid CSS identifier and cannot appear in a
 * URL fragment unencoded, so `#cli-app listing set-icon` never resolves as a
 * deep link and `document.querySelector('#' + id)` throws. VitePress's outline
 * builds its links as `'#' + el.id` straight off the DOM, so every one of the
 * 19 command entries had a broken anchor.
 *
 * Mirrors the shape VitePress's own markdown slugifier produces for headings
 * (lowercase, non-alphanumerics collapsed to a single `-`, no leading/trailing
 * `-`), so a hand-written cross-link reads the same as one to a `##` heading.
 *
 * @param {string} command e.g. `app listing set-icon`
 * @returns {string} e.g. `cli-app-listing-set-icon`
 */
export function cliAnchorId(command) {
  const slug = String(command ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `cli-${slug}` : 'cli';
}

// The depth a TOP-LEVEL `civitai <cmd>` renders at. The page places
// <CliReference /> under an `##` section, so its commands are that section's
// children — and `.vitepress/config.mts` sets `outline: { level: [2, 3] }`,
// which is what puts them in the page outline.
const BASE_LEVEL = 3;
const MAX_LEVEL = 6;

/**
 * The heading level for a command, derived from its nesting depth.
 *
 * 🔴 Was hardcoded `<h3>` for every entry. That rendered the six
 * `app listing <sub>` subcommands as SIBLINGS of the `app listing` group that
 * owns them — flat in the document outline and flat in the sidebar outline,
 * asserting a structure the CLI does not have.
 *
 * 🔴 THE BASE MOVED WHEN THE REFERENCE WIDENED, AND LEAVING IT WOULD HAVE
 * REINTRODUCED THAT EXACT DEFECT ONE LEVEL UP. The generator used to emit only
 * `app …`, so depth was counted from TWO tokens and `app create` was the
 * shallowest thing on the page. It now walks the whole binary, so `app` ITSELF
 * is an entry — and under the old `tokens - 2` rule `app` (1 token, clamped to
 * depth 0) and `app create` (2 tokens, depth 0) BOTH rendered h3: a group and
 * its own subcommand as siblings, which is the defect above wearing a
 * different hat. Depth is now counted from ONE token, the shallowest thing the
 * generator actually emits.
 *
 * `app` / `login` (1 token) -> 3; `app create` (2) -> 4;
 * `app listing set-icon` (3) -> 5.
 *
 * With `outline.level: [2, 3]` that leaves the top-level commands as the
 * navigable outline set — 17 entries rather than all 52, which is the readable
 * choice at this width.
 *
 * @param {string} command
 * @returns {number} 3..6
 */
export function cliHeadingLevel(command) {
  const tokens = String(command ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  // `<cmd>` is the shallowest thing the generator emits (1 token). Clamped at
  // BOTH ends: an empty/absent command must never render ABOVE BASE_LEVEL, or
  // it would collide with the page's own `##` sections.
  const depth = Math.max(0, tokens - 1);
  return Math.min(MAX_LEVEL, BASE_LEVEL + depth);
}

/** The heading tag name for a command, e.g. `h3`. */
export function cliHeadingTag(command) {
  return `h${cliHeadingLevel(command)}`;
}
