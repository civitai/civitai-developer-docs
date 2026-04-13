---
title: Quick Start
---

<script setup>
const helloBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'flux',
      prompt: 'A cat astronaut floating through neon space',
      width: 1024,
      height: 1024,
    },
  }],
};
</script>

# Quick start

This page walks you through submitting your first workflow, inspecting the result, and polling for completion.

## Prerequisites

- A Civitai API token (Bearer).
- The orchestrator base URL: `https://orchestration.civitai.com`.

You pass the token as `Authorization: Bearer <token>` on every request.

## 1. Submit a workflow

A workflow is a list of **steps**. Each step has a `$type` (the step type) and an `input`. Submit the workflow to [`POST /v2/consumer/workflows`](/orchestration/reference/operations/SubmitWorkflow).

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?whatif=false&wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [
    {
      "$type": "imageGen",
      "input": {
        "engine": "flux",
        "prompt": "A cat astronaut floating through neon space",
        "width": 1024,
        "height": 1024
      }
    }
  ]
}
```

<RecipeRun :body="helloBody" />

Key query parameters:

| Param | Default | Purpose |
|-------|---------|---------|
| `whatif` | `false` | If `true`, validates the workflow and returns the resolved plan without executing. Great for CI smoke tests. |
| `wait` | `0` | Seconds to block waiting for completion inline. `0` returns immediately with a pending workflow. Capped by the **100-second request timeout** — if the workflow hasn't finished by then, the response returns with `status: "processing"` and you continue via polling or webhooks. |

## 2. Read the response

The response is the **Workflow** object — the same object you get back from [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) while polling. Key fields:

```json
{
  "id": "wf_01HXYZ...",
  "status": "succeeded",
  "steps": [
    {
      "name": "0",
      "$type": "imageGen",
      "status": "succeeded",
      "output": {
        "blobs": [
          { "id": "blob_...", "url": "https://.../signed-url" }
        ]
      }
    }
  ]
}
```

Statuses progress through: `pending` → `processing` → (`succeeded` | `failed` | `canceled`).

## 3. Poll if you didn't wait inline

Server requests time out at **100 seconds**, so any workflow longer than that — most video jobs, large batches, training — will return still `processing`. Poll [`GET /v2/consumer/workflows/{workflowId}`](/orchestration/reference/operations/GetWorkflow) until it reaches a terminal state:

```http
GET https://orchestration.civitai.com/v2/consumer/workflows/wf_01HXYZ...
Authorization: Bearer <your-token>
```

A reasonable loop is: 2 s, 5 s, 10 s, 15 s, then 30 s thereafter. Most image jobs finish in under 30 s; video jobs can take several minutes.

Production integrations should use webhooks instead of polling — see [Results & webhooks](./results-and-webhooks).

## 4. Consume outputs

Step outputs are typically **blobs**. Each blob comes back with a signed `url` you can fetch directly. Blob URLs expire; re-fetch the workflow (or call [`GetBlob`](/orchestration/reference/operations/GetBlob)) to refresh.

## What's next

- Try a real recipe end-to-end: [WAN video generation](/orchestration/recipes/wan)
- Browse all recipes: [Recipes](/orchestration/recipes/)
- Go deep on the request/response shapes: [API reference](/orchestration/reference/)
