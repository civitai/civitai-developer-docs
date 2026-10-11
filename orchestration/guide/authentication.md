---
title: Authentication
---

# Authentication

All consumer endpoints require `Authorization: Bearer <token>` on every request.

## Getting an API key

Generate, copy and revoke API keys from your account at **[civitai.com](https://civitai.com)**. Treat them like passwords: never commit them, and rotate one if you suspect exposure.

## Using the token

```http
Authorization: Bearer <your-token>
```

All requests go to `https://orchestration.civitai.com`.

## Try It in the docs

Paste your token via **Token** in the navbar (top right) to use the **Run** widgets under examples. It's stored in your browser's `localStorage` and never leaves it except in the `Authorization` header sent to `orchestration.civitai.com`. A Run widget can **preview cost** (`whatif=true`, per-currency Buzz breakdown) or **submit** (`wait=90`, then polls [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) until terminal) and renders generated images and videos inline.

Reference operation pages have their own OpenAPI playground with a separate auth field, which also persists across reloads.
