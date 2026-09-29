// SINGLE SOURCE for the `/agent-setup/` surface.
//
// Four things have to agree and are trivially easy to drift apart by hand:
//   1. the copy-paste string the landing page advertises,
//   2. the SHORT alias inside that string,
//   3. the canonical URL that alias redirects to,
//   4. the path the raw prompt is actually served from.
//
// They are derived here, once. `agent-setup/index.md` carries the rendered
// literals (deliberately literal, not `{{ }}` interpolation — the
// vitepress-plugin-llms `.md` export is a machine channel and a Vue expression
// would reach it verbatim as `{{ SETUP_PROMPT }}`), and
// `scripts/check-agent-setup.mjs` asserts every literal against these constants
// on every PR. 🔴 THE COUNT AND THE LIST OF CHECKS ARE DELIBERATELY NOT REPEATED
// HERE. That script's header is the authority on what each check does and does
// NOT cover; this pointer used to enumerate them and was wrong twice — it listed
// three of four, then four of five. Read `scripts/check-agent-setup.mjs`.
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

/**
 * The SHORT, HUMAN-FACING ALIAS of the raw prompt — an alias, never the
 * canonical address.
 *
 * 🔴 `PROMPT_URL` STAYS CANONICAL, AND THAT IS NOT A STYLE PREFERENCE: this URL
 * is a Cloudflare redirect on civitai.com whose TARGET is `PROMPT_URL`, so
 * repointing the canonical constant at the alias would aim the redirect at
 * itself. Everything machine-facing keeps `PROMPT_URL`: the nginx exact-match
 * route (check 3), the `.well-known/ai-catalog.json` entry, the built-artifact
 * byte-identity assertions in `check-built-site.mjs`, and the "read the raw
 * file" link on the landing page. The alias exists for exactly one job — being
 * short enough to say out loud and to survive being retyped — so it appears in
 * `SETUP_PROMPT` and nowhere else.
 *
 * 🔴 IT IS A REDIRECT, WHICH MAKES `-L` PART OF ITS CONTRACT. Measured
 * 2026-09-28: a `GET` with no redirect following returns **143 bytes** of
 * Cloudflare `<html>302 Found</html>` and `curl` exits **0**, against 7,433
 * bytes of `text/markdown` through the redirect. So a COMMAND naming this URL
 * without `-L`/`--location` hands an agent redirect HTML and a success status —
 * the worst combination there is. `SETUP_PROMPT` is prose an agent READS, not a
 * command, so it needs no flag; anything written as a command does, and check 6
 * of `scripts/check-agent-setup.mjs` enforces that on both agent-setup surfaces.
 */
export const SHORT_PROMPT_URL = 'https://civitai.com/agent-onboarding';

/**
 * The one string a developer pastes into their agent.
 *
 * Natural language, deliberately: the agent reads "fetch … from <URL>" and
 * chooses its own fetcher, which follows redirects. Do not turn this into a
 * shell command — see the 🔴 note on SHORT_PROMPT_URL.
 */
export const SETUP_PROMPT = `Fetch and execute the appropriate instructions to set me up for Civitai from ${SHORT_PROMPT_URL}`;

/** Repo-relative path of the prompt source, derived from PROMPT_PATH. */
export const PROMPT_SOURCE = `public${PROMPT_PATH}`;

/** Repo-relative path of the landing page whose literals the guard grades. */
export const LANDING_PAGE = 'agent-setup/index.md';
