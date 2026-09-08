// Shared mechanism for the INLINE COPY of the agent-setup prompt on
// `agent-setup/index.md`.
//
// THE DEFECT THIS EXISTS TO FIX
// -----------------------------
// The landing page says "Read it before you paste it into an agent" and then
// links to the RAW `/agent-setup/prompt.md`. That route is served as
// `text/markdown` with `X-Content-Type-Options: nosniff` — deliberately, because
// the `.md` channel of this site exists for machines and some agent fetchers
// bypass lossy summarisation only for that type. The cost lands on exactly one
// human-facing path: a browser handed `text/markdown` + `nosniff` opens a SAVE
// dialog instead of rendering. So the one instruction the page's entire
// unsigned-code posture rests on did not work in a browser.
//
// The fix is to render the prompt's full text ON the landing page, and keep the
// raw link beside it labelled as the machine copy.
//
// WHY A GENERATED REGION AND NOT A HAND-WRITTEN COPY
// -------------------------------------------------
// `public/agent-setup/prompt.md` is the file whose ENTIRE contract is that the
// bytes served equal the bytes committed. A second, hand-maintained copy of it
// on the landing page is the one change that could make the page LIE about what
// an agent will execute — which is strictly worse than the download dialog it
// replaces. So the inline copy is generated from the source file, and
// `check-agent-setup.mjs` grades the committed region byte-for-byte against what
// this module would write right now.
//
// This is the same mechanism `scripts/appblocks-md.mjs` uses for the App Blocks
// markdown-fallback regions, for the same reason and with the same doctrine: the
// generator is a MAINTAINER STEP, deliberately NOT wired into predev/prebuild,
// because a build must never rewrite a committed file. `npm run
// check:agent-setup` blocks a PR that forgot to run it.
//
// WHY A CODE FENCE AND NOT INJECTED MARKDOWN
// ------------------------------------------
// Splicing the prompt's markdown in raw would render prettier, and it was
// rejected. VitePress compiles a page's markdown as a Vue template: `{{ … }}` in
// the source would be evaluated as an expression, and an HTML/`<script>` node
// would be mounted. prompt.md is a file that is expected to CHANGE, is authored
// against a different contract, and is the last file in this repo that should
// gain the power to execute in a reader's browser or break the docs build. A
// fence escapes all of it, is byte-faithful — what the reader sees IS what is
// served — and cannot pollute the page's heading outline.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANDING_PAGE, PROMPT_SOURCE } from '../.vitepress/agent-setup.mjs';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The region's key, and the command that rewrites it. */
export const REGION_KEY = 'agent-setup-prompt';
export const REFRESH_CMD = 'npm run gen:agent-setup-page';

export const beginMarker = () =>
  `<!-- BEGIN GENERATED: ${REGION_KEY} — verbatim copy of ${PROMPT_SOURCE}. ` +
  `Do not edit by hand; run \`${REFRESH_CMD}\`. -->`;
export const endMarker = () => `<!-- END GENERATED: ${REGION_KEY} -->`;

// Matched loosely so the BEGIN comment's prose can evolve without stranding the
// committed page. The generator always writes the canonical text above, and the
// drift guard compares the WHOLE block, so a hand-edited marker still fails.
const beginRe = () => new RegExp(`^<!-- BEGIN GENERATED: ${REGION_KEY}\\b[^\\n]*-->$`, 'm');
const endRe = () => new RegExp(`^<!-- END GENERATED: ${REGION_KEY} -->$`, 'm');

/**
 * The fence that can hold `text` without being closed early by it.
 *
 * prompt.md contains ``` fences of its own, so a 3-backtick fence would end at
 * the first one and spill the rest of the file onto the page as live markdown —
 * silently, and looking fine until you read it. CommonMark closes a fence only
 * on a run at least as long as the opener, so this returns one longer than
 * anything in the body.
 */
export function fenceFor(text) {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return '`'.repeat(Math.max(4, longest + 1));
}

/** The region BODY: the whole prompt, verbatim, inside one fence. */
export function renderPromptRegion(promptText) {
  const fence = fenceFor(promptText);
  // No trimming of the prompt's own trailing newline beyond the one the fence
  // needs: the guard compares this against the file's bytes, so any normalising
  // done here has to be done identically on both sides, and the cheapest way to
  // guarantee that is to do none.
  return `${fence}md\n${promptText.replace(/\n+$/, '')}\n${fence}`;
}

/** Markers plus body, with the blank lines CommonMark needs around them. */
export const regionBlock = (body) => `${beginMarker()}\n\n${body.replace(/\s+$/, '')}\n\n${endMarker()}`;

/**
 * Why `promptText` cannot be inlined, or null when it can.
 *
 * 🔴 FAIL-CLOSED IS NOT ENOUGH WHEN THE REMEDY IS UNREACHABLE. If prompt.md ever
 * contains a line that is itself one of this region's markers, the generator
 * writes it into the page once and `locateRegion` then finds TWO markers
 * forever: check 4 fails with "found 2", its remedy is "run the generator", and
 * the generator fails the same way. Fail-closed, but only repairable by hand —
 * which is precisely what the region forbids.
 *
 * So both callers ask this FIRST and report the real cause, which does have a
 * remedy: the marker line does not belong in prompt.md.
 */
export function regionConflict(promptText) {
  const kind = beginRe().test(promptText) ? 'BEGIN' : endRe().test(promptText) ? 'END' : null;
  if (!kind) return null;
  return (
    `${PROMPT_SOURCE} contains a line that is itself this region's ${kind} marker ` +
    `for '${REGION_KEY}'.\n` +
    `    It cannot be inlined: the generated copy would carry a SECOND ${kind} marker into\n` +
    `    ${LANDING_PAGE}, after which the region can no longer be located and\n` +
    `    \`${REFRESH_CMD}\` cannot repair it either — it fails on this same line. Remove or\n` +
    `    reword that line in ${PROMPT_SOURCE}; the markers are matched anchored to the start\n` +
    `    of a line, so indenting it is enough.`
  );
}

/**
 * Locate the committed region in `pageText`.
 *
 * @returns {{ start: number, end: number, block: string }} character offsets of
 *   the whole block, markers included.
 * @throws when the markers are missing, duplicated or out of order — every one
 *   of which is an editing accident the guard must report, not paper over.
 */
export function locateRegion(pageText) {
  const begins = pageText.match(new RegExp(beginRe().source, 'gm')) ?? [];
  const ends = pageText.match(new RegExp(endRe().source, 'gm')) ?? [];
  if (begins.length !== 1) {
    throw new Error(
      `expected exactly 1 BEGIN marker for region '${REGION_KEY}' in ${LANDING_PAGE}, found ${begins.length}`,
    );
  }
  if (ends.length !== 1) {
    throw new Error(
      `expected exactly 1 END marker for region '${REGION_KEY}' in ${LANDING_PAGE}, found ${ends.length}`,
    );
  }
  const start = pageText.indexOf(begins[0]);
  const endAt = pageText.indexOf(ends[0]);
  if (endAt < start) {
    throw new Error(`region '${REGION_KEY}' in ${LANDING_PAGE} has its END marker BEFORE its BEGIN marker`);
  }
  return { start, end: endAt + ends[0].length, block: pageText.slice(start, endAt + ends[0].length) };
}

/** Replace the region's block in `pageText`. Splice, never a whole-page rewrite. */
export function spliceRegion(pageText, body) {
  const { start, end } = locateRegion(pageText);
  return pageText.slice(0, start) + regionBlock(body) + pageText.slice(end);
}

/** Read the two files this mechanism relates. */
export function readSources() {
  return {
    page: readFileSync(join(repoRoot, LANDING_PAGE), 'utf8'),
    prompt: readFileSync(join(repoRoot, PROMPT_SOURCE), 'utf8'),
  };
}
