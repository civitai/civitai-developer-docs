# Civitai Developer Docs

VitePress site served at **developer.civitai.com**. Houses the Civitai Orchestration API docs today; structured to host additional product docs (SDKs, Signals, etc.) over time.

## Commands

### Local dev (standalone)

```bash
npm install
npm run dev                     # Vite dev server with HMR
```

### Build

```bash
npm run build                   # outputs .vitepress/dist/
npm run preview                 # serve the built site
```

### Via Aspire (recommended for full stack)

```bash
# From the dev-stack root — runs orchestration API + docs together,
# routes developer.civitai.localhost → this site
dotnet run --project host/Civitai.DevStack.AppHost.csproj
```

The Aspire integration injects `VITE_ORCHESTRATION_API_URL` pointing at the locally running orchestrator, so the "Try It" widgets hit the dev API instead of prod.

## Structure

```
├── index.md                        # Developer Hub landing
├── orchestration/                  # Orchestration API docs section
│   ├── index.md                    # section landing
│   ├── guide/                      # consumer onboarding
│   ├── recipes/                    # task-oriented, runnable examples
│   ├── reference/                  # auto-generated from OpenAPI spec
│   └── internals/                  # architecture / diagrams
├── .vitepress/
│   ├── config.mts                  # nav, sidebar, base, plugins
│   └── theme/                      # custom components + composables
│       ├── components/             # AuthBar, RecipeRun, ResultViewer
│       └── composables/            # useAuthToken, useWorkflow
├── scripts/copy-spec.mjs           # pulls v2-consumers.json from sibling orchestration repo (or prod fallback)
├── public/openapi/                 # spec lands here; gitignored
├── Dockerfile                      # nginx:alpine serving dist/ for prod
└── nginx.conf                      # cleanUrls fallback + caching
```

## OpenAPI spec sync

`scripts/copy-spec.mjs` runs on `predev` and `prebuild`. It looks for the spec at:

1. `../../civitai-orchestration/repo/src/Civitai.Orchestration.Api/wwwroot/openapi/v2-consumers.json` (sibling repo in the dev stack)
2. Falls back to `https://orchestration.civitai.com/openapi/v2-consumers.json`

To refresh the local reference while iterating on the orchestrator:

```bash
# From the orchestration repo
dotnet build src/Civitai.Orchestration.Api
# Then in this repo — either restart `npm run dev` or run:
npm run copy:spec
```

## Adding a new product section

1. Create a top-level directory (e.g. `signals/`).
2. Add sidebar + nav entries in [.vitepress/config.mts](.vitepress/config.mts).
3. Add a feature card to the root [index.md](index.md).

## Prod deployment

Built via `docker build . -t civitai-developer-docs`. In CI, mount the freshly built orchestration spec into the build context or rely on the prod fallback in `copy-spec.mjs`. Deployment manifests (K8s / Talos) live in [gpu-fleet-infra](../../gpu-fleet-infra/repo/) — TODO: add a manifest for this service.

## Interactive "Try It" widgets

- `<RecipeRun method="POST" path="..." :body="{...}" />` — preview cost, submit, poll, render media output.
- `<OAOperation :operationId="..." />` on reference pages — built-in playground from vitepress-openapi.
- Token stored at localStorage key `civitai-developer-docs:token` (shared between AuthBar navbar widget and the OpenAPI playground).
