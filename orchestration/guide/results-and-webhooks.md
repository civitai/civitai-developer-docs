---
title: Results & Webhooks
---

# Results & Webhooks

You have two ways to learn that a workflow finished: **poll** [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) until it reaches a terminal state, or register **callbacks** (webhooks) on the workflow and let the orchestrator push events to you.

For anything longer than the [100-second request timeout](./getting-started#_3-poll-if-you-didn-t-wait-inline) — most video jobs, training, large batches — webhooks are strongly preferred over polling.

## Registering callbacks

Callbacks live on the workflow body you submit via [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow), alongside `steps`:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [
    {
      "$type": "videoGen",
      "input": { "engine": "wan", "version": "v2.6", "operation": "text-to-video",
                 "prompt": "...", "resolution": "1080p", "duration": 10 }
    }
  ],
  "callbacks": [
    {
      "url": "https://your-service.example.com/civitai-hooks",
      "type": ["workflow:succeeded", "workflow:failed"],
      "detailed": true
    }
  ]
}
```

Each entry in `callbacks` (see the [`WorkflowCallback` schema](/orchestration/reference/operations/SubmitWorkflow)) has:

| Field | Required | Notes |
|-------|----------|-------|
| `url` | ✅ | HTTPS endpoint that will receive POSTed events. |
| `type` | ✅ | Array of event types to subscribe to (see below). |
| `detailed` | | If `true`, the payload includes the full workflow / step output (blobs, timings). Defaults to `false` — you'd then call [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) to fetch details. |

You can register multiple callbacks per workflow (different URLs, different event filters).

## Event types

Event types use a `<scope>:<status>` format. Scopes fan out at decreasing granularity:

| Scope | Fires on | Typical use |
|-------|----------|-------------|
| `workflow:*` | Workflow-level transitions | What you usually want — one event when the whole workflow resolves. |
| `step:*` | Each step transition | Multi-step workflows where you want intermediate output. |
| `job:*` | Each internal job transition | Debugging / observability — usually too noisy for production. |

Statuses you can filter on: `unassigned`, `processing`, `succeeded`, `failed`, `expired`, `canceled`. Use `*` to receive every status for a scope.

Common subscriptions:

- **"Tell me when it's done, pass or fail"** → `["workflow:succeeded", "workflow:failed", "workflow:expired", "workflow:canceled"]`
- **"Everything about the workflow"** → `["workflow:*"]`
- **"Per-step progress in a multi-step pipeline"** → `["step:succeeded", "step:failed"]`

## Event payload

The orchestrator POSTs a JSON body to your `url`. For workflow-scoped events:

```json
{
  "$type": "workflow",
  "workflowId": "wf_01HXYZ...",
  "status": "succeeded",
  "timestamp": "2026-04-12T23:00:00Z",
  "details": {
    "createdAt": "2026-04-12T22:58:12Z",
    "startedAt": "2026-04-12T22:58:14Z",
    "completedAt": "2026-04-12T23:00:00Z",
    "steps": [
      { "name": "0", "status": "succeeded", "output": { "blobs": [ /* ... */ ] } }
    ]
  }
}
```

`details` is only present when the callback was registered with `detailed: true`. Without it, you get the transition notification (id + status + timestamp) and fetch the workflow yourself.

Step events use [`WorkflowStepEvent`](/orchestration/reference/operations/SubmitWorkflow) (`workflowId` + `name` + `status` + optional `details`), and job events use [`WorkflowStepJobEvent`](/orchestration/reference/operations/SubmitWorkflow) (adds `jobId`, `progress`, `reason`). Inspect `$type` to route them.

## Delivery semantics

- **In-order, serialized per workflow.** The orchestrator waits for each callback invocation to complete before sending the next one, so `processing` always arrives before `succeeded` for a given workflow / step.
- **Terminal states are terminal.** Once a workflow or step reaches `succeeded`, `failed`, `expired`, or `canceled`, it will not transition back to `processing` or any other state.
- **`processing` can repeat.** You may get multiple `processing` events for the same workflow or step — each one signals progress. If you need the latest details (e.g. partial output), call [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) in response.
- **Automatic retries on transient errors.** If your endpoint returns a non-`2xx` or times out, the orchestrator retries before advancing to the next event.

## Receiving endpoint checklist

- **Return `2xx` quickly.** Do the real work on a queue after acknowledging. Slow receivers delay subsequent events (delivery is serialized) and get retried.
- **Be idempotent on `processing`.** Retries and legitimately repeated `processing` events mean the same event can arrive more than once. Use `(workflowId, status, timestamp)` as your dedupe key, or treat `processing` as "latest progress, refetch if you care."
- **Accept only HTTPS URLs** — the orchestrator won't post to plain HTTP.

## Blobs in results

Output blobs come back with signed `url` fields inside `details.steps[].output.blobs[]`. Those URLs **expire** — refetch the workflow (or call [`GetBlob`](/orchestration/reference/operations/GetBlob)) to get a fresh signed URL; don't cache the URL long-term. If you need to keep the media, download the bytes and store them yourself.

## Polling fallback

If you can't expose a webhook endpoint (scripts, CLI tools, notebooks), poll [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow). Suggested cadence: 2 s, 5 s, 10 s, 15 s, then 30 s. Stop when `status` is one of `succeeded`, `failed`, `expired`, `canceled`.

## Ephemeral workflows

By default, a submitted workflow is retained for 30 days after it reaches a terminal state, so you can refetch it via [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) for as long as you might need the results.

Set `"ephemeral": true` on the submission body to opt out of that retention entirely — the workflow is never written to long-term storage. The only way to receive its results is a callback or a synchronous `wait`:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=120
Content-Type: application/json

{
  "ephemeral": true,
  "steps": [ /* ... */ ],
  "callbacks": [
    { "url": "https://your-service.example.com/civitai-hooks",
      "type": ["workflow:succeeded", "workflow:failed"],
      "detailed": true }
  ]
}
```

- **Validation.** The orchestrator rejects ephemeral submissions with neither a `callbacks` entry nor `wait > 0` (HTTP 400) — without one of those, you'd have no way to get the result.
- **Use `detailed: true` on callbacks** (or `wait` long enough for terminal status) — once the workflow finishes, [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) returns 404 and you can't go back for it.
- **In-flight polling still works.** While the workflow is running you can poll `GetWorkflow` as usual; only after it reaches a terminal state does the record disappear.
