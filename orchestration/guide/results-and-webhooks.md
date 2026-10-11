---
title: Results & Webhooks
---

# Results & Webhooks

To learn that a workflow finished, either **poll** [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) until it reaches a terminal state, or register **callbacks** (webhooks) and let the orchestrator push events to you. For anything that may outlast [your HTTP client's timeout](./getting-started#_3-poll-if-you-didn-t-wait-inline), prefer webhooks.

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
| `detailed` | | If `true`, the payload includes the full workflow / step output (blobs, timings). Defaults to `false`: call [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) for details. |

A workflow can have several callbacks, with different URLs and event filters.

## Event types

Event types use a `<scope>:<status>` format:

| Scope | Fires on | Typical use |
|-------|----------|-------------|
| `workflow:*` | Workflow-level transitions | What you usually want — one event when the whole workflow resolves. |
| `step:*` | Each step transition | Multi-step workflows where you want intermediate output. |
| `job:*` | Each internal job transition | Debugging / observability — usually too noisy for production. |

`<status>` is any [workflow status](./workflows#status-lifecycle), or `*` for all of them. Prefer naming the statuses you act on: `*` also delivers every `preparing` progress tick, and any status added later.

Common subscriptions:

- **"Tell me when it's done, pass or fail"** → `["workflow:succeeded", "workflow:failed", "workflow:expired", "workflow:canceled"]`
- **"Everything about the workflow"** → `["workflow:*"]`
- **"Per-step progress in a multi-step pipeline"** → `["step:succeeded", "step:failed"]`
- **"Show download progress while models are fetched"** → `["step:preparing", "step:processing", "step:succeeded", "step:failed"]` — `preparing` events carry a `preparation` object with the resource being downloaded and its progress.

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

`details` is only present with `detailed: true`; otherwise you get id, status and timestamp, and fetch the workflow yourself.

Step events use [`WorkflowStepEvent`](/orchestration/reference/operations/SubmitWorkflow) (`workflowId` + `name` + `status` + optional `details`), and job events use [`WorkflowStepJobEvent`](/orchestration/reference/operations/SubmitWorkflow) (adds `jobId`, `progress`, `reason`). Inspect `$type` to route them.

## Delivery semantics

- **In-order, serialized per workflow.** Each callback invocation completes before the next is sent, so `processing` always arrives before `succeeded` for a given workflow / step.
- **Terminal states are terminal.** Once a workflow or step reaches `succeeded`, `failed`, `expired`, or `canceled`, it never transitions again.
- **`preparing` and `processing` can repeat**, each signalling progress. For the latest details (e.g. partial output), call [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow).
- **Automatic retries on transient errors.** If your endpoint returns a non-`2xx` or times out, the orchestrator retries before advancing to the next event.

## Receiving endpoint checklist

- **Return `2xx` quickly** and do the real work on a queue. A slow receiver delays later events (delivery is serialized) and gets retried.
- **Be idempotent.** Retries and repeated `preparing` / `processing` events mean an event can arrive more than once. Dedupe on `(workflowId, status, timestamp)`, or treat `processing` as "latest progress, refetch if you care."
- **Accept only HTTPS URLs** — the orchestrator won't post to plain HTTP.

## Blobs in results

Each blob object in a step's output carries its own `url` and `urlExpiresAt`; where the blobs sit depends on the step type, e.g. `output.images[]` for `imageGen`, `output.video` for `videoGen`, `output.blobs[]` for `comfy` (in a webhook, under `details`). A signed URL stops working once it passes its `urlExpiresAt` (a public-tier URL is unsigned: its `urlExpiresAt`, if set, is when the object is scheduled for deletion, not when a signature lapses). Refetch the workflow, or call [`GetBlob`](/orchestration/reference/operations/GetBlob), for a fresh one (a deleted public-tier object comes back with the same URL and `available: false`); don't cache the URL. To keep the media, download the bytes and store them yourself.

## Polling fallback

If you can't expose a webhook endpoint (scripts, CLI tools, notebooks), poll [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) at 2 s, 5 s, 10 s, 15 s, then every 30 s, until `status` is terminal.

## Ephemeral workflows

By default a workflow is retained for 30 days after it reaches a terminal state, so you can refetch it via [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow).

Set `"ephemeral": true` on the submission body to opt out: the workflow is never written to long-term storage, and the only way to receive its results is a callback or a synchronous `wait`:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=90
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

- **Validation.** An ephemeral submission with neither a `callbacks` entry nor `wait > 0` is rejected with `400`.
- **Use `detailed: true` on callbacks** (or `wait` long enough for terminal status). While it runs you can poll `GetWorkflow` as usual, but once it finishes [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) returns 404.
