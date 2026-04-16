---
title: Civitai Site API
description: REST API for browsing models, images, creators, and tags on civitai.com.
---

# Civitai Site API

The Civitai site exposes a public REST API at `https://civitai.com/api/v1/...` for
browsing models, model versions, images, creators, and tags. It's the same
surface that powers third-party tools like Stable Diffusion downloaders and
metadata lookup utilities.

This is **not** the Orchestration API. If you want to *submit* generation work,
see the [Orchestration docs](/orchestration/).

## Where to start

<div class="vp-card-group">

- **[Guide](./guide/)** — authentication, pagination, error handling, and the
  AIR (AI Resource Identifier) format.
- **[Reference](./reference/)** — per-resource documentation for every public
  endpoint, sourced directly from the current Next.js handlers.

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
