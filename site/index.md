---
title: Civitai Site API
description: REST API for browsing models, images, creators, and tags on civitai.com.
---

# Civitai Site API

The Civitai site exposes a public REST API at `https://civitai.com/api/v1/...` for
browsing models, model versions, images, creators, and tags. It's the same
surface that powers third-party tools like Stable Diffusion downloaders and
metadata lookup utilities.

This is **not** the Orchestration API. If you are building a service that
submits generation work against your own orchestrator credentials, see the
[Orchestration docs](/orchestration/).

The one exception is the **`civitai` CLI**, which lives in this section. As well
as reading these endpoints it can run a generation on your own account and spend
your own Buzz — see [Generating images from the CLI](./guide/cli-generate). That
is a terminal tool for a civitai.com user, not the partner orchestrator API.

## Where to start

<div class="vp-card-group">

- **[Guide](./guide/)** — authentication, pagination, error handling, and the
  AIR (AI Resource Identifier) format.
- **[Reference](./reference/)** — per-resource documentation for every public
  endpoint (models, images, articles, collections, creators, tags, users),
  sourced directly from the current Next.js handlers.
- **[CLI](./guide/cli)** — search, fetch and download from the terminal with
  the `civitai` CLI. Also the home of the CLI's
  [credentials](./guide/cli-auth) and
  [generation](./guide/cli-generate) pages.

</div>

## Quick example

```bash
# Public — no auth required
curl "https://civitai.com/api/v1/models?limit=1&types=LORA"

# Authenticated — pass a Civitai API token
curl -H "Authorization: Bearer $CIVITAI_TOKEN" \
  "https://civitai.com/api/v1/me"
```

See [Getting started](./guide/getting-started) for a full walkthrough.
