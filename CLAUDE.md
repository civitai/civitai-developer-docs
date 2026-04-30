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
npm run copy:spec        # pull OpenAPI spec from sibling orchestration repo (or prod fallback)
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

`scripts/copy-spec.mjs` resolves the `v2-consumers.json` spec:
1. Looks for the sibling orchestration repo at `../../civitai-orchestration/repo/src/Civitai.Orchestration.Api/wwwroot/openapi/v2-consumers.json`
2. Falls back to fetching from `https://orchestration.civitai.com/openapi/v2-consumers.json`

The spec lands at `public/openapi/v2-consumers.json` (gitignored). Both the VitePress config and the theme import it directly with `with { type: 'json' }`.

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

- **PreToolUse** blocks edits to `public/openapi/**` (gitignored, regenerated by `copy:spec`). If you need to change the spec, edit the source repo and re-run `npm run copy:spec`.

## Prod deployment

Docker build: `docker build . -t civitai-developer-docs`
- Multi-stage: Node 20 build → nginx:alpine runtime
- `copy-spec.mjs` falls back to prod API when no sibling repo is in the build context
- `nginx.conf` handles VitePress `cleanUrls` rewrites and asset caching

## Key gotchas

- The OpenAPI spec file (`public/openapi/v2-consumers.json`) is gitignored. If `npm run dev` or `npm run build` fails with a missing import, run `npm run copy:spec` first.
- `srcExclude` in config.mts excludes `CLAUDE.md` and `README.md` from the built site.
- `VITE_ORCHESTRATION_API_URL` defaults to `https://orchestration.civitai.com` in the composable when not set (standalone dev without Aspire).
