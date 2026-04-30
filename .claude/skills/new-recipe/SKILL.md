---
name: new-recipe
description: Scaffold a new orchestration recipe page in orchestration/recipes/. Use when adding documentation for a new model, engine, or workflow type. Bundles a template MD file and the checklist of touchpoints (sidebar in config.mts, recipes index page).
---

# new-recipe

Scaffolds a new task-oriented recipe page under `orchestration/recipes/`.

Recipes are the most-edited content in this repo (35+ pages and growing). They follow a tight shape so the `<RecipeRun>` widget and the `test-doc-samples.mjs` harness can find request bodies reliably. This skill exists to keep new recipes on-shape.

## When to use this skill

- Adding a brand-new model/engine (e.g. a new video provider, a new image-gen family).
- Adding a new operation under an existing engine that warrants its own page (rare — usually extend the existing recipe instead).
- Stubbing a recipe before the API surface is finalized (mark it WIP in the body).

If the change is "add another `operation` to an existing engine that already has a recipe", **don't** use this skill — extend the existing file.

## Procedure

1. **Pick a slug** — kebab-case, matches the `link` value used in the sidebar (e.g. `kling`, `grok-video`, `text-to-speech`). It becomes `orchestration/recipes/<slug>.md`.
2. **Pick the closest sibling recipe** to fork from. Prefer one in the same category (Video / Image / Audio / Language models / Utilities / Training). Examples:
   - Video: `wan.md`, `kling.md`
   - Image: `flux2.md`, `openai.md`
   - Audio: `text-to-speech.md`, `transcription.md`
3. **Copy `template.md`** from this skill folder to `orchestration/recipes/<slug>.md` and fill it in. Replace every `{{PLACEHOLDER}}`.
4. **Add the sidebar entry** in `.vitepress/config.mts` under the matching category (`Video`, `Image`, `Audio`, `Language models`, `Utilities`, `Training`). Match the surrounding entries' wording — "X video generation", "X image generation", etc.
5. **Cross-link** from at least one related recipe's "Related" section so the new page is reachable.
6. **Verify locally**: `npm run dev` → visit the page → confirm each `<RecipeRun>` widget renders the cost preview.
7. **Verify the sample harness can parse it**: `CIVITAI_TOKEN=… node scripts/test-doc-samples.mjs --orch --filter <slug>` (uses `whatif=true` — no Buzz spent). If you have the `validate-doc-sample` skill installed, just run `/validate-doc-sample <slug>`.

## Recipe shape (what `template.md` enforces)

Every recipe has these in order:

1. **Frontmatter** with `title:` (matches the H1).
2. **`<script setup>` block** with one `const <name>Body = { steps: [{...}] }` per `<RecipeRun>` widget on the page. Use plain literals — `test-doc-samples.mjs` evaluates the script in a sandbox that strips imports.
3. **H1** matching the title.
4. **One-paragraph intro** stating what this recipe does and the default choice for new integrations.
5. **Versions/models table** when the engine has variants (skip if there's only one).
6. **The request shape** — a JSON snippet with the keys that select the variant.
7. **One section per operation** with: a JSON request example, the `<RecipeRun :body="<name>Body" />` widget, and a parameters table.
8. **Reading the result** — a JSON response snippet showing the success shape.
9. **Runtime** — wall-time expectations + `wait` recommendation.
10. **Cost** — Buzz pricing tables / formulas. Always link to [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz).
11. **Troubleshooting** — table of symptom / cause / fix.
12. **Related** — links to sibling recipes, `SubmitWorkflow`, `GetWorkflow`, and the relevant input-schema names from the OpenAPI reference.

## Conventions

- Reference reusable links: `/orchestration/reference/operations/SubmitWorkflow`, `/orchestration/reference/operations/GetWorkflow`, `/orchestration/reference/operations/GetBlob`, `/orchestration/guide/results-and-webhooks`, `/orchestration/guide/errors-and-retries`.
- Use `https://image.civitai.com/...` URLs for sample images so `<RecipeRun>` previews can fetch them.
- For URLs the user must supply (input video, source media), use `https://example.com/...` placeholders **and** add a `::: warning` callout telling the reader to swap them.
- Default `whatif` semantics: don't pass `whatif=true` in the JSON examples — the orchestrator submits real jobs. The `<RecipeRun>` widget calls `previewCost()` (whatif) before letting the user submit, so the preview is always free.
- Keep `<script setup>` body objects to literal data only. No imports, no computed values — the test harness can't evaluate them.
- Mention the matching `Input` schema names (e.g. `Wan26FalTextToVideoInput`) in "Related" so readers can jump from a recipe to the typed reference.

## Files in this skill

- `template.md` — the recipe scaffold to copy. Fill in `{{PLACEHOLDERS}}`.
