---
title: Site API Guide
description: Getting started with the public Civitai site API.
---

# Site API Guide

This section covers everything you need to start building against the Civitai
site API: generating a token, making your first request, paginating results,
handling errors, and working with AIR identifiers. It is also where the
**`civitai` CLI** is documented.

## The REST API

- [Getting started](./getting-started) — create a token and make your first call.
- [Authentication](./authentication) — how bearer tokens work and when they're required.
- [Pagination](./pagination) — `page` vs. `cursor` and the 1000-offset cap.
- [Errors](./errors) — response shape and HTTP status codes.
- [AIR identifiers](./air) — the canonical URN format for Civitai resources.

For a per-endpoint breakdown (parameters, response fields, examples), see the
[Reference](../reference/).

## The `civitai` CLI

The same binary reads these endpoints, downloads model files, and runs
generations on your own account.

- [CLI](./cli) — install it, then the read and download commands.
- [CLI credentials and scopes](./cli-auth) — OAuth vs a personal API key, and
  why a default browser login cannot spend Buzz.
- [Generating images from the CLI](./cli-generate) — 🔴 spends real Buzz. The
  money contract, `--dry-run`, `--max-cost`, waiting and downloading.
- [Choosing a model](./cli-generate-models) — `--checkpoint` vs `--ecosystem`,
  silent model substitution, and image-to-image.
- [Raw generation graphs](./cli-generation-graphs) — `--print-input` /
  `--input`, and the only route to a seed.
- [Tracking and cancelling generations](./cli-workflows) — finding a job,
  reading what failed, and what cancelling does to a charge.
- [Scripting the CLI with `--json`](./cli-json) — the output guarantees beyond
  the read endpoints.

To author and ship a Civitai App with the same binary, see the
[Apps guide](/apps/guide/).
