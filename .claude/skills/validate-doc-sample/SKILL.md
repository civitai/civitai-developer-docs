---
name: validate-doc-sample
description: Validate the request bodies inside `<RecipeRun>` and `<ApiTry>` widgets in one or more docs against the live APIs. Use after editing recipes or site reference pages, or before opening a PR. Calls the orchestrator with `?whatif=true` (no Buzz spent) and the site API as plain GETs. Wraps scripts/test-doc-samples.mjs.
disable-model-invocation: true
---

# validate-doc-sample

Wraps `scripts/test-doc-samples.mjs` so you can validate doc samples by recipe slug or section without remembering the env-var dance.

This skill is **user-only** (`disable-model-invocation: true`) because it makes real network calls to `civitai.com` and `orchestration.civitai.com` and requires a real `CIVITAI_TOKEN`. Claude won't invoke it on its own.

## What it does

The `test-doc-samples.mjs` harness:

- Walks every `.md` file under `site/` and `orchestration/recipes/`.
- Extracts each `<ApiTry>` and `<RecipeRun>` widget's request body (it evaluates `<script setup>` in a `vm` sandbox).
- For `<ApiTry>` (site API): issues a plain `GET` against `civitai.com` and asserts the documented status / response shape.
- For `<RecipeRun>` (orchestrator): issues a `POST` with `?whatif=true` so no job runs and no Buzz is spent.
- Reports a per-file pass/fail summary.

## Usage

The skill takes one optional argument: a recipe slug, a section flag, or a free-form filter.

```
/validate-doc-sample                    # all samples (site + orch)
/validate-doc-sample wan                # only orch recipes matching "wan"
/validate-doc-sample --orch             # only orchestrator recipes
/validate-doc-sample --site             # only site reference pages
/validate-doc-sample --orch --filter openai
```

## Procedure

1. Confirm `CIVITAI_TOKEN` is set in the user's shell. If not, prompt them to export one (`https://civitai.com/user/account` → API Keys). Don't hardcode tokens or read them from disk.
2. Map the argument to the right `test-doc-samples.mjs` flags:
   - No arg → run with no flags (full suite).
   - A bare slug like `wan` or `openai` → `--orch --filter <slug>` (recipes are the common case).
   - `--site` / `--orch` / `--filter <pat>` → pass through verbatim.
3. Run from the repo root: `node scripts/test-doc-samples.mjs <flags>`.
4. Surface failures — for each failing sample, show the file path, the widget's body (truncated), and the API's response body / status. The harness prints these by default; just don't swallow them.
5. If a failure is `whatif`-rejected with "unknown field" or "schema mismatch", the doc is out of sync with the OpenAPI spec — suggest running `npm run copy:spec` and re-checking the typed `Input` schema name in the API reference.

## Notes

- The `--filter` flag matches against the file path (relative to repo root). `wan` will match both `orchestration/recipes/wan.md` and `orchestration/recipes/wan-image.md` — narrow with `--filter wan.md` if needed.
- Daily CI already runs the full suite at 06:17 UTC (see `.github/workflows/test-samples.yml`); this skill is for fast local iteration.
- The harness exits non-zero on any failure — propagate that exit code so callers can chain it.
