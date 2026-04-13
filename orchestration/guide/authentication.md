---
title: Authentication
---

# Authentication

All consumer endpoints require `Authorization: Bearer <token>` on every request.

## Getting an API key

Manage your API keys from your Civitai account at **[civitai.com](https://civitai.com)** — generate new keys, revoke old ones, and copy tokens from there. Treat API keys like passwords: never commit them to source control, and rotate them if you suspect exposure.

## Using the token

```http
Authorization: Bearer <your-token>
```

All requests go to `https://orchestration.civitai.com`.

## Try It in the docs

Most pages on this site have a **Run** widget under each example. Click the **Token** button in the top-right of the navbar to paste your Bearer token; it's stored in your browser's `localStorage` and used for every Run / Reference Try-It on the site. The token never leaves your browser except in the `Authorization` header it sends to `orchestration.civitai.com`.

The widget supports:

- **Preview cost** — submits with `whatif=true`, shows a per-currency Buzz breakdown.
- **Submit for real** — runs the workflow with `wait=90`, then polls [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) until terminal.
- **Inline preview** — generated images and videos render in the page once the workflow finishes.

Reference operation pages have their own playground panel from the OpenAPI viewer (with its own auth field — paste once, persists across reloads).

::: info Stub
Expand once finalized: token scopes, rate limits per tier, rotation policy, how to request elevated access.
:::
