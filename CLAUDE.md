# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

VitePress documentation site for **developer.civitai.com**. Houses Orchestration API docs (`/orchestration/`) and the Civitai site API docs (`/site/`); structured to expand to additional product areas (SDKs, Signals, etc.).

## Commands

```bash
npm install              # install deps (uses package-lock.json)
npm run dev              # VitePress dev server with HMR
npm run build            # production build → .vitepress/dist/
npm run preview          # serve the built site locally
npm run copy:spec        # resolve the OpenAPI spec (sibling repo, else committed snapshot) — no network
npm run copy:spec -- --refresh   # re-snapshot from orchestration.civitai.com (the ONLY fetching path)
npm run test:copy-spec   # offline guard for the resolution contract (PR-blocking)
npm run check:spec-drift # is the committed snapshot still what the orchestrator publishes? (scheduled)
```

`copy:spec` runs automatically as `predev` and `prebuild` hooks — no manual step needed for normal dev.

### Via Aspire (full stack)

From the dev-stack root:
```bash
dotnet run --project host/Civitai.DevStack.AppHost.csproj
```
The Aspire integration (`Hosting.cs` one level up) injects `VITE_ORCHESTRATION_API_URL` pointing at the local orchestrator, so "Try It" widgets hit the dev API.

## Architecture

### OpenAPI spec pipeline

🔴 **The build is HERMETIC. The default path makes no network request — do not
reintroduce one.** `scripts/copy-spec.mjs` resolves the `v2-consumers.json` spec:
1. Looks for the sibling orchestration repo at `../../civitai-orchestration/repo/src/Civitai.Orchestration.Api/wwwroot/openapi/v2-consumers.json`
2. Falls back to the **committed snapshot** at `openapi-snapshots/v2-consumers.json`
3. Neither present → fails in milliseconds with a message naming both paths

The spec lands at `public/openapi/v2-consumers.json` (gitignored). Both the VitePress config and the theme import it directly with `with { type: 'json' }` — a static import, so no spec means esbuild `Could not resolve` and no build at all. That is why this script's failure mode is the build's failure mode, and why it used to be the one thing standing between `build-site` and being a required check: it fetched the spec on every build, with no timeout, no retry and no fallback. Measured at 30f52a0 — DNS failure: uncaught `TypeError: fetch failed`, exit 1; degraded host (accepts, never answers): **300,734 ms**, undici's 5-minute `headersTimeout`; 503: exit 1; and an existing on-disk spec was never consulted in any of them.

Fetching now happens only under `--refresh` / `COPY_SPEC_REFRESH=1`, which re-snapshots and is bounded (20 s × 3 attempts, matching every other `fetch(` in `scripts/`). A refresh that cannot reach the host **warns and falls back** — an opt-in refresh must never turn a working build into a broken one.

Two guards, and neither subsumes the other:
- `scripts/test-copy-spec.mjs` (`npm run test:copy-spec`) — repo-local, loopback only, **blocks a PR** from `.github/workflows/copy-spec.yml`. It poisons `fetch` in the child, so "resolved from the snapshot" and "did not also quietly fetch" are separate observations.
- `scripts/check-openapi-drift.mjs` (`npm run check:spec-drift`) — upstream freshness, so it is **scheduled, never a gate** (`appblocks-drift.yml`). Connectivity failures SKIP; only real drift is red.

The trade this buys hermeticity with: the published reference now moves only when someone re-snapshots. The drift check is what says when.

### Dynamic reference pages

API reference pages are generated at build time from the OpenAPI spec via VitePress dynamic routes:
- `orchestration/reference/operations/[operationId].paths.js` — generates one page per operation using `vitepress-openapi`'s `usePaths()`
- `orchestration/reference/operations/[operationId].md` — template that renders `<OAOperation>` for each operation
- Dead-link checker is configured to ignore `/orchestration/reference/operations/` paths since they only exist at build time

### Theme and custom components

`.vitepress/theme/index.ts` extends the default VitePress theme and registers three global components:

| Component | Purpose |
|-----------|---------|
| `AuthBar` | Navbar pill for entering/managing a Civitai API token (stored in `localStorage` at key `civitai-developer-docs:token`) |
| `RecipeRun` | Interactive widget on recipe pages: preview cost → submit workflow → poll → display results |
| `ResultViewer` | Renders workflow output (media, JSON) inside RecipeRun |

Two composables support these:
- `useAuthToken` — shared singleton ref backed by localStorage, syncs across tabs via `storage` event
- `useWorkflow` — orchestration API client: `previewCost()` (whatif), `submit()` + polling with backoff, error handling

The auth token is shared between AuthBar and the vitepress-openapi playground (both use the same `civitai-developer-docs` storage prefix).

### Content structure

- `orchestration/guide/` — consumer onboarding (auth, workflows, submitting, results, errors)
- `orchestration/recipes/` — task-oriented runnable examples using `<RecipeRun>` (some are stubs)
- `orchestration/reference/` — auto-generated from OpenAPI spec
- `orchestration/internals/` — architecture diagrams (Mermaid)
- `site/guide/` — Civitai site API: getting started, auth, pagination, errors, AIR
- `site/reference/` — hand-written per-resource endpoint docs sourced from the live Next.js handlers in `civitai/src/pages/api/v1/`

### VitePress plugins

- `vitepress-openapi` — OpenAPI reference UI and sidebar generation
- `vitepress-plugin-mermaid` — Mermaid diagram rendering (config uses `withMermaid` wrapper)
- `vitepress-plugin-llms` — generates `llms.txt` / `llms-full.txt` for LLM consumption

## Adding a new product section

1. Create a top-level directory (e.g. `signals/`)
2. Add sidebar + nav entries in `.vitepress/config.mts`
3. Add a feature card to the root `index.md`

## Project-specific Claude tooling

This repo ships skills, agents, and hooks under `.claude/`. Use them — don't reinvent.

### Skills

- **`new-recipe`** (`.claude/skills/new-recipe/`) — when adding a new file under `orchestration/recipes/`, start by reading this skill. It bundles `template.md` and the checklist of touchpoints (sidebar entry in `.vitepress/config.mts`, cross-links from sibling recipes). Don't hand-write a recipe from scratch when the template + a closest-sibling fork is faster and more consistent.
- **`validate-doc-sample`** (`.claude/skills/validate-doc-sample/`) — user-only (`disable-model-invocation: true`); wraps `node scripts/test-doc-samples.mjs` for fast local validation of `<RecipeRun>` / `<ApiTry>` widgets. Don't invoke this yourself; if a recipe edit needs validation, suggest the user run `/validate-doc-sample <slug>`.

### Agents

- **`recipe-consistency-reviewer`** — dispatch via the Agent tool after editing or adding a recipe under `orchestration/recipes/*.md`. It checks frontmatter, `<script setup>` body shape, required sections, sidebar entry, and cross-links against the rest of the corpus.
- **`openapi-parity-checker`** — dispatch after editing `site/reference/*.md` or `orchestration/reference/*.md`. It diffs the doc against the source of truth (handlers in the sibling `../civitai/src/pages/api/v1/` for site API, or `public/openapi/v2-consumers.json` for the orchestrator).

Both agents are review-only — they report findings, they don't edit. Read their reports and apply fixes yourself.

### Hooks (in `.claude/settings.json`)

- **PreToolUse** blocks edits to `public/openapi/**` (gitignored, regenerated by `copy:spec`). If you need to change the spec, edit the source repo (or re-snapshot with `npm run copy:spec -- --refresh`) and re-run `npm run copy:spec`. `openapi-snapshots/v2-consumers.json` is deliberately NOT hook-blocked — it is committed — but it is still a generated artifact: refresh it with the command, never by hand.

## Prod deployment

Docker build: `docker build . -t civitai-developer-docs`
- Multi-stage: Node 20 build → nginx:alpine runtime
- `copy-spec.mjs` resolves the spec from the committed `openapi-snapshots/` when no sibling repo is in the build context, so `docker build` needs no network for the spec (and cannot be broken by an orchestrator outage). The image therefore serves the SNAPSHOT: to publish spec changes, re-snapshot (`npm run copy:spec -- --refresh`) and merge that PR first.
- `nginx.conf` handles VitePress `cleanUrls` rewrites, asset caching, and the
  `.md` content types. See README → "The serving layer, for machine consumers"
  before touching it: `.md` must be `text/markdown` (not `text/plain`),
  `/agent-setup/prompt.md` is an exact-match verbatim route that must never
  redirect, and a Cloudflare **Browser Integrity Check** 403 (error 1010) on
  `Python-urllib` / `libwww-perl` is upstream of this repo and cannot be fixed
  here — the same config serves those UAs 200 locally.

## Key gotchas

- The OpenAPI spec file (`public/openapi/v2-consumers.json`) is gitignored. If `npm run dev` or `npm run build` fails with a missing import, run `npm run copy:spec` first — it needs no network, only the committed `openapi-snapshots/v2-consumers.json`.
- `srcExclude` in config.mts excludes `CLAUDE.md`, `README.md` and `public/**` from the built site. The `public/**` entry is load-bearing, not tidiness: VitePress globs `**/*.md` from srcDir and `public/` is inside it, so without it `public/agent-setup/prompt.md` is ALSO compiled into a page at `/public/agent-setup/prompt.html` and re-emitted by the llms plugin with frontmatter injected — a mutated copy of a file whose entire contract is that it is not mutated.
- `npm run check:agent-setup` grades four things, all offline: (1) every `civitai …` command and flag named in `public/agent-setup/prompt.md` exists in the CLI help snapshot, AND every non-`civitai` binary that file tells an agent to run is on the `ALLOWED_NON_CIVITAI` allowlist in the script, in an allowed subcommand/argument shape (it is fetched and executed unattended, so a new third-party command must be an explicit one-line diff a reviewer sees); (2) the landing page's copy-paste string matches `.vitepress/agent-setup.mjs`, every absolute URL the page carries outside the generated region is `PROMPT_URL` or on `ALLOWED_PAGE_URLS`, and every prompt-claiming URL in `prompt.md` is `PROMPT_URL`; (3) `nginx.conf` serves `PROMPT_PATH` from an exact-match `location =`; (4) the inline copy of the prompt on `agent-setup/index.md` is byte-for-byte what `npm run gen:agent-setup-page` would write. The sequencing is SETTLED and this line used to say the opposite: check 1 was held red until civitai/cli shipped `civitai agent-setup` (civitai/cli#528) and this repo re-captured the snapshot, and both have happened — it is green now. The script's own `SEQUENCING NOTE` is the authority; see `.github/workflows/agent-setup.yml` for the job.
  - 🔴 **Check 1 covers CODE BLOCKS, and "code block" means what the markdown block structure says, not what a regex at column 0 says.** Round 2 measured the gap: `curl … | sh` inside a *list-nested* fence — the ordinary way an author writes the next step — was invisible, and so were a 2-space-indented fence, a 4-space indented block, an HTML `<pre>` and a fence in a blockquote. The guard now walks the document's containers (`codeBlocks` in the script) and pins one sample of every one of those shapes, plus a negative control, in `PARSER_SELF_TEST` — which runs on every invocation, so a re-narrowing is a red check. **What it still does NOT cover is PROSE**, and six other named residuals: read the `KNOWN RESIDUALS` list in the script's header before treating a green check 1 as "nothing dangerous in that file".
  - 🔴 **An HTML block's tags are STRIPPED, and stripping is DELETING — so the strip is itself a place a command can be hidden.** The single-pass `replace(/<[^>]*>/g, '')` ran from any `<` to the next `>` whether or not what lay between was markup: `<pre>` holding `civitai app submit < manifest.json && curl … | sh > /tmp/log` left the guard at exit 0 with `curl` printed zero times, and two more shapes did the same. `stripTags` now deletes a `<…>` run only when it is unambiguously markup AND carries none of `|`, `&`, `;`, repeating to a bounded fixed point; everything else is left verbatim for the allowlist to red on. **The fix for a strip that hides things is never "strip harder".** Residuals 6 and 7 name what it still misses and what it costs. Do not add a `node_modules` import to that script (markdown-it included) — its CI job runs with no `npm ci` on purpose.
- **Edited `public/agent-setup/prompt.md`? Run `npm run gen:agent-setup-page` and commit the `agent-setup/index.md` diff.** The landing page renders the prompt inline because the raw route is `text/markdown` + `nosniff`, which a browser SAVES rather than displays — on the one link whose instruction is "read this before you paste it into an agent". Like `gen:appblocks:md`, the generator is a maintainer step and is deliberately NOT wired into `prebuild`: a build must never rewrite a committed file. `check:agent-setup` blocks a PR that forgot, and it runs in a CI job with no `npm ci` and no build, which is why the copy is committed rather than injected at build time.
- `npm run check:built-site` additionally asserts the BUILT `.vitepress/dist/agent-setup/prompt.md` is byte-identical to the repo source, AND that the rendered `dist/agent-setup/index.html` holds that same text verbatim inside a `<pre>`. `check:agent-setup` is source-only and cannot see a `publicDir`/Dockerfile/`.gitignore` change that ships a 404 or a rewritten body at the URL every agent is told to fetch; nor could anything, until this, see a *rendering*-layer regression that spilled the fence or dropped the generated region — which would show a reader something other than what an agent executes with both source checks green.
- `VITE_ORCHESTRATION_API_URL` defaults to `https://orchestration.civitai.com` in the composable when not set (standalone dev without Aspire).
