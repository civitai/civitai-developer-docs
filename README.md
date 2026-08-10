# Civitai Developer Docs

Source for [developer.civitai.com](https://developer.civitai.com) — built with [VitePress](https://vitepress.dev/).

Covers the **Orchestration API** (submit AI workflows for video, image, audio, and text generation through a single contract) and the **Civitai Site API** (browse models, images, creators, and tags on civitai.com). Structured to host additional product docs (SDKs, Signals, etc.) over time.

## Quick start

```bash
npm install
npm run dev
```

The dev server starts with HMR. The OpenAPI spec is resolved automatically from the sibling [civitai-orchestration](https://github.com/civitai/civitai-orchestration) repo if present, otherwise from the committed snapshot — see [OpenAPI spec sync](#openapi-spec-sync). Neither path touches the network.

## Build

```bash
npm run build       # outputs .vitepress/dist/
npm run preview     # serve the built site locally
```

### Docker

```bash
docker build . -t civitai-developer-docs
```

Produces an nginx:alpine image serving the static site.

## Project structure

```
├── index.md                           # Developer Hub landing page
├── orchestration/
│   ├── guide/                         # Consumer onboarding (auth, workflows, results, errors)
│   ├── recipes/                       # Runnable examples with interactive Try It widgets
│   ├── reference/                     # Auto-generated from OpenAPI spec (dynamic routes)
│   └── internals/                     # Architecture diagrams
├── site/
│   ├── guide/                         # Civitai site API: auth, pagination, errors, AIR
│   └── reference/                     # Hand-written per-resource endpoint docs
├── .vitepress/
│   ├── config.mts                     # Nav, sidebar, plugins
│   └── theme/
│       ├── components/                # AuthBar, RecipeRun, ResultViewer
│       └── composables/               # useAuthToken, useWorkflow
├── scripts/copy-spec.mjs             # OpenAPI spec sync script
├── openapi-snapshots/                 # Committed spec snapshot — the build's default source
├── public/openapi/                    # Spec destination (gitignored)
├── Dockerfile                         # Multi-stage build for production
└── nginx.conf                         # cleanUrls routing + caching
```

## Interactive features

Recipe pages include **Try It** widgets (`<RecipeRun>`) that let readers preview cost, submit real workflows, and see results inline. Set an API token via the **Token** button in the navbar.

The API reference uses [vitepress-openapi](https://github.com/enzonotario/vitepress-openapi) for interactive playgrounds on each operation page.

## OpenAPI spec sync

The spec at `public/openapi/v2-consumers.json` is gitignored and resolved at dev/build time by `scripts/copy-spec.mjs`. **The build is hermetic — the default path makes no network request:**

1. Sibling repo, if the dev stack is checked out beside this one: `../../civitai-orchestration/repo/src/.../wwwroot/openapi/v2-consumers.json`
2. The committed snapshot: `openapi-snapshots/v2-consumers.json`

If neither exists the build fails immediately with a message naming both paths — it never falls back to the network, so a `orchestration.civitai.com` outage can no longer fail a build or a CI job.

To refresh the committed snapshot from the live spec (the only path that fetches):

```bash
npm run copy:spec -- --refresh   # rewrites openapi-snapshots/v2-consumers.json
```

Bounded: 20 s per attempt, 3 attempts. If it cannot reach the host it warns and falls back to the snapshot rather than failing.

Staleness is caught by `npm run check:spec-drift`, which runs daily from `appblocks-drift.yml` and goes red when the published spec no longer matches the snapshot. Same doctrine as the App Blocks snapshots: upstream freshness belongs on a schedule, never on a PR gate.

## Adding a new section

1. Create a top-level directory (e.g. `signals/`)
2. Add sidebar and nav entries in `.vitepress/config.mts`
3. Add a feature card to `index.md`

## Testing interactive samples

`<ApiTry>` widgets (site docs) and `<RecipeRun>` widgets (orchestrator recipes)
can be exercised against the live APIs via:

```bash
CIVITAI_TOKEN=your-token npm run test:samples           # all
CIVITAI_TOKEN=your-token npm run test:samples:site      # /site only
CIVITAI_TOKEN=your-token npm run test:samples:orch      # /orchestration/recipes only
```

Orchestrator samples are submitted with `?whatif=true` — no Buzz is spent and
no jobs actually run. Site samples are plain GETs. CI runs this on every PR
that touches the samples and on a daily cron (see `.github/workflows/test-samples.yml`)
so API drift surfaces even when docs don't change.

### Skipping a known-broken sample

When a sample is intentionally broken (orchestrator-side bug, placeholder URL
awaiting a real asset, etc.), precede the widget with a `<!-- test-skip: -->`
HTML comment on the line immediately before it:

```md
<!-- test-skip: editVideo whatif returns empty-body 500 — unskip once fixed -->
<RecipeRun :body="editBody" />
```

The widget still renders in the docs, but the test script reports it as
skipped (with the reason) instead of failing. Skipped samples are listed in
the test summary as a reminder to revisit.

## License

Proprietary. Copyright Civitai.
