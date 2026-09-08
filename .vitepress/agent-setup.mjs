// SINGLE SOURCE for the `/agent-setup/` surface.
//
// Three things have to agree and are trivially easy to drift apart by hand:
//   1. the copy-paste string the landing page advertises,
//   2. the URL inside that string,
//   3. the path the raw prompt is actually served from.
//
// They are derived here, once. `agent-setup/index.md` carries the rendered
// literals (deliberately literal, not `{{ }}` interpolation — the
// vitepress-plugin-llms `.md` export is a machine channel and a Vue expression
// would reach it verbatim as `{{ SETUP_PROMPT }}`), and
// `scripts/check-agent-setup-prompt.mjs` asserts every literal against these
// constants on every PR. Drift is therefore a red check, not a silent one.
//
// Plain `.mjs` on purpose: imported by node scripts AND resolvable by Vite.

/** Origin the docs site is published under. */
export const SITE_ORIGIN = 'https://developer.civitai.com';

/**
 * Site-root-relative path of the RAW prompt.
 *
 * 🔴 The file lives at `public/<PROMPT_PATH>`. VitePress copies `public/`
 * verbatim into the build output — no markdown pipeline, no HTML rendering, no
 * client-side hydration — which is what makes the served bytes equal the source
 * file's bytes. Moving the source out of `public/` turns this into a rendered
 * page and silently breaks the contract; the guard asserts the file is there.
 */
export const PROMPT_PATH = '/agent-setup/prompt.md';

/** Absolute URL of the raw prompt. This is what an agent is told to fetch. */
export const PROMPT_URL = `${SITE_ORIGIN}${PROMPT_PATH}`;

/** The one string a developer pastes into their agent. */
export const SETUP_PROMPT = `Fetch and execute the appropriate instructions to set me up for Civitai from ${PROMPT_URL}`;

/** Repo-relative path of the prompt source, derived from PROMPT_PATH. */
export const PROMPT_SOURCE = `public${PROMPT_PATH}`;

/** Repo-relative path of the landing page whose literals the guard grades. */
export const LANDING_PAGE = 'agent-setup/index.md';
