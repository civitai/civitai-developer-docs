---
title: Submitting Work
---

# Submitting Work

The orchestrator gives you two ways to submit a workflow:

1. **Generic** — [`POST /v2/consumer/workflows`](/orchestration/reference/operations/SubmitWorkflow) with a `steps` array and polymorphic `$type` on each step. Use when you're chaining steps, mixing step types, or building a typed SDK that handles the discriminator itself.
2. **Per-recipe** — `POST /v2/consumer/recipes/{recipe}` with a single typed body (no `$type`). Each recipe is a convenience endpoint that wraps a single-step workflow. Use when your integration only runs one step type and you want the cleanest schema surface — e.g. [`InvokeChatCompletionStepTemplate`](/orchestration/reference/operations/InvokeChatCompletionStepTemplate), [`InvokeComfyStepTemplate`](/orchestration/reference/operations/InvokeComfyStepTemplate), etc.

Both paths return the same [`Workflow`](/orchestration/reference/operations/GetWorkflow) shape. Pick whichever maps more cleanly to your caller; you can mix freely.

## The generic path

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

### Workflow-level body fields

Everything in the table lives alongside `steps`. See the full [`WorkflowTemplate` schema](/orchestration/reference/operations/SubmitWorkflow) for types.

| Field | Purpose |
|-------|---------|
| `steps` | Required. One or more step objects, each with its own `$type` and `input`. |
| `callbacks` | Webhooks for lifecycle events — see [Results & webhooks](./results-and-webhooks). |
| `tags` | Indexed string tags for later lookup via [`QueryWorkflows`](/orchestration/reference/operations/QueryWorkflows). Great for tenant / campaign / user IDs. |
| `metadata` | Arbitrary JSON attached to the workflow. Not indexed — use for notes, correlation IDs, UI hints. |
| `arguments` | Reserved for templating values referenced by steps. |
| `allowMatureContent` | Controls mature-content gating and which Buzz currency pays — see [Payments (Buzz)](#payments-buzz) below. |
| `experimental` | Marks the workflow as experimental; may relax some guardrails. |
| `upgradeMode` | How to handle a workflow paid with blue/green Buzz that turns out to produce mature content — see [Payments (Buzz)](#payments-buzz). |
| `currencies` | Restrict which Buzz currencies may settle this workflow (see [Payments (Buzz)](#payments-buzz)). |
| `tips` | Optional tip amount attached to the workflow. |

### Query parameters

| Param | Default | Purpose |
|-------|---------|---------|
| `wait` | `0` | Seconds to block waiting for the workflow to finish, capped by the **100-second request timeout**. If the workflow hasn't reached a terminal state by then, you get a `202` with the in-flight workflow — keep the `id` and continue via webhooks or polling. |
| `whatif` | `false` | If `true`, validates and resolves the workflow (provider, estimated cost, required resources) without actually running it. Great for CI smoke tests and cost previews. |
| `hideMatureContent` | `false` | If `true`, mature blobs on the response won't include a `url`. Useful for rendering in user-facing UIs without re-checking policy per-blob. |

### Status codes

| Code | Meaning |
|------|---------|
| `200 OK` | The workflow reached a terminal state within your `wait` budget. |
| `202 Accepted` | The workflow is still running. The body is the current workflow; continue via webhooks or [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow). |
| `400 Bad Request` | Body failed validation — see [Errors & retries](./errors-and-retries) for the response shape. |
| `401 Unauthorized` | Missing or invalid bearer token. |
| `403 Forbidden` | Token is valid but not allowed to use this recipe / resource / mature content flag. |
| `429 Too Many Requests` | Rate limited. Back off and retry. |

## Payments (Buzz)

Workflows are paid for with **Buzz**, Civitai's on-platform currency. Buzz balances live on your civitai.com account, not on the workflow — you never pass dollar amounts in the API. Three flavors matter for the orchestrator:

| Currency | Earned / bought | Valid for |
|----------|-----------------|-----------|
| **Blue** (`blue`) | Earned by interacting on civitai.com | SFW workflows only |
| **Green** (`green`) | Purchased | SFW workflows only |
| **Yellow** (`yellow`) | Purchased | SFW **and** NSFW workflows |

### Default charging

If you don't set `currencies`, the orchestrator charges your account in order **blue → green → yellow**, splitting across currencies if needed (e.g. spend all your blue first, top up the remainder with green or yellow). This maximises the value of earned Buzz.

### Restricting to specific currencies

Set `currencies` on the workflow body to cap which accounts can settle it:

```json
{
  "steps": [ /* ... */ ],
  "currencies": ["green", "yellow"]
}
```

Only currencies you list will be drawn on. If none of them cover the cost, the submission is rejected with a payment error.

### Mature content and currency interaction

- Setting `allowMatureContent: true` forces payment in **yellow** Buzz (the only NSFW-capable currency).
- Setting `allowMatureContent: false` restricts to SFW and allows blue/green (plus yellow) to pay.
- Leaving `allowMatureContent` unset means the orchestrator decides *after* seeing which currency was charged: if the workflow settled with blue or green, it's treated as SFW; if it settled with yellow, mature content is allowed.

### `upgradeMode` — when the output turns out mature

If the workflow was paid with blue or green Buzz (SFW) but the generated content is classified as mature, `upgradeMode` controls what happens:

- `"manual"` — the mature output is withheld and the workflow waits on you. To release it, call [`UpdateWorkflow`](/orchestration/reference/operations/UpdateWorkflow) (`PUT`) or [`PatchWorkflow`](/orchestration/reference/operations/PatchWorkflow) (`PATCH`) with `allowMatureContent: true`. The orchestrator refunds the blue/green Buzz and charges yellow. If your yellow balance is insufficient, the update returns `400`.
- `"automatic"` — the orchestrator does that swap for you inline, charging the difference in yellow Buzz and delivering the mature output (or failing the workflow if yellow is insufficient).

### Previewing cost

Use `whatif=true` to get a cost estimate back without actually running the workflow. The response includes per-currency breakdowns so you can show users what they'd be charged before they commit.

## The per-recipe path

```http
POST https://orchestration.civitai.com/v2/consumer/recipes/chatCompletion?whatif=false&wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "model": "openai/gpt-oss-120b",
  "messages": [
    { "role": "user", "content": "Summarize this release note: ..." }
  ]
}
```

Each `/v2/consumer/recipes/{recipe}` endpoint is a thin wrapper that builds a single-step workflow for you, so:

- The request body is the step's `input` schema directly — no `$type`, no `steps` array.
- `whatif`, `wait`, `hideMatureContent` still apply.
- Callbacks aren't expressible here — if you need webhooks, use the generic path.
- The response is still a full [`Workflow`](/orchestration/reference/operations/GetWorkflow).

## Choosing between them

| Your situation | Use |
|----------------|-----|
| Single step type, no callbacks, want a typed request body | Per-recipe |
| Multiple steps chained (e.g. generate → upscale → transcode) | Generic |
| Need webhooks, tags, metadata, or upgrade control | Generic |
| Building an SDK that consumes the polymorphic `steps` array generically | Generic |

## Updating and querying

Once submitted, a workflow is live until it reaches a terminal state. You can:

- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — fetch by ID
- [`QueryWorkflows`](/orchestration/reference/operations/QueryWorkflows) — list by tag, status, date range
- [`UpdateWorkflow`](/orchestration/reference/operations/UpdateWorkflow) / [`PatchWorkflow`](/orchestration/reference/operations/PatchWorkflow) — amend metadata / tags
- [`AddWorkflowTag`](/orchestration/reference/operations/AddWorkflowTag) / [`RemoveWorkflowTag`](/orchestration/reference/operations/RemoveWorkflowTag) — tag maintenance
- [`DeleteWorkflow`](/orchestration/reference/operations/DeleteWorkflow) — cancel / remove

For step-level updates (e.g. rewriting `input` before execution, if still `unassigned`), use [`UpdateWorkflowStep`](/orchestration/reference/operations/UpdateWorkflowStep) / [`PatchWorkflowStep`](/orchestration/reference/operations/PatchWorkflowStep).
