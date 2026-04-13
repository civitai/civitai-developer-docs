# Civitai Developer Docs

Source for [developer.civitai.com](https://developer.civitai.com) — built with [VitePress](https://vitepress.dev/).

Currently covers the **Orchestration API** (submit AI workflows for video, image, audio, and text generation through a single contract). Structured to host additional product docs (SDKs, Signals, etc.) over time.

## Quick start

```bash
npm install
npm run dev
```

The dev server starts with HMR. The OpenAPI spec is pulled automatically from the sibling [civitai-orchestration](https://github.com/civitai/civitai-orchestration) repo if present, otherwise fetched from the production API.

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
├── .vitepress/
│   ├── config.mts                     # Nav, sidebar, plugins
│   └── theme/
│       ├── components/                # AuthBar, RecipeRun, ResultViewer
│       └── composables/               # useAuthToken, useWorkflow
├── scripts/copy-spec.mjs             # OpenAPI spec sync script
├── public/openapi/                    # Spec destination (gitignored)
├── Dockerfile                         # Multi-stage build for production
└── nginx.conf                         # cleanUrls routing + caching
```

## Interactive features

Recipe pages include **Try It** widgets (`<RecipeRun>`) that let readers preview cost, submit real workflows, and see results inline. Set an API token via the **Token** button in the navbar.

The API reference uses [vitepress-openapi](https://github.com/enzonotario/vitepress-openapi) for interactive playgrounds on each operation page.

## OpenAPI spec sync

The spec at `public/openapi/v2-consumers.json` is gitignored and resolved at dev/build time by `scripts/copy-spec.mjs`:

1. Sibling repo: `../../civitai-orchestration/repo/src/.../wwwroot/openapi/v2-consumers.json`
2. Fallback: `https://orchestration.civitai.com/openapi/v2-consumers.json`

To refresh manually:

```bash
npm run copy:spec
```

## Adding a new section

1. Create a top-level directory (e.g. `signals/`)
2. Add sidebar and nav entries in `.vitepress/config.mts`
3. Add a feature card to `index.md`

## License

Proprietary. Copyright Civitai.
