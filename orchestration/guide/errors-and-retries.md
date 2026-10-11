---
title: Errors & Retries
---

# Errors & Retries

Errors surface in two places:

1. **HTTP responses** on the submit / get / update endpoints — validation, auth, rate-limit, or server issues.
2. **Step status** inside a returned workflow — the request succeeded, but a step reached `failed`, `expired`, or `canceled`.

The orchestrator races providers, so a transient provider failure (a worker crashing, a slow region) is usually invisible: another provider claims the job. You see a step-level failure only once every viable provider is exhausted.

## HTTP error shape

Error responses use the standard [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) `application/problem+json` shape ([`ProblemDetails`](/orchestration/reference/operations/SubmitWorkflow) / [`ValidationProblemDetails`](/orchestration/reference/operations/SubmitWorkflow)):

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "steps[0].input.resolution": [
      "The value '4k' is not valid for resolution."
    ]
  }
}
```

- `status` — the HTTP status code (also in the response line).
- `title` — short, human-readable summary.
- `detail` — longer description when the orchestrator can give one.
- `errors` — present on `400` validation failures; JSON Pointer–style paths → list of messages.
- `instance` / `type` — optional URIs identifying the specific occurrence and error class.

## HTTP status taxonomy

| Code | Meaning | Retry? |
|------|---------|--------|
| `400 Bad Request` | Body failed validation. `errors` map tells you exactly which fields. | **No** — fix the request. |
| `401 Unauthorized` | Missing / expired / malformed bearer token. | **No** — obtain a new token. |
| `403 Forbidden` | Token is valid but can't perform this operation (recipe not enabled for your tier, mature content not permitted, etc.). | **No** — request access; don't retry as-is. |
| `404 Not Found` | Workflow or blob ID doesn't exist (or the token can't see it). | **No** — check the ID. |
| `409 Conflict` | The workflow is in a state that blocks this mutation (e.g. updating a step that already started). | **Maybe** — refetch and reconcile. |
| `429 Too Many Requests` | Rate-limit hit. | **Yes, with backoff.** |
| `5xx Server Error` | Transient orchestrator issue. | **Yes, with backoff.** |

For `429` / `5xx`: exponential backoff with jitter, capped at ~30 s between attempts, giving up after ~5 tries.

## Step-level failures

A `200` / `202` on submit means the workflow was accepted; steps can still fail later. The [`Workflow`](/orchestration/reference/operations/GetWorkflow) you get back (or by webhook) carries per-step status:

```json
{
  "id": "wf_01HXYZ...",
  "status": "failed",
  "steps": [
    {
      "name": "0",
      "$type": "videoGen",
      "status": "failed",
      "jobs": [
        {
          "status": "failed",
          "reason": "no_provider_available",
          "blockedReason": null
        }
      ]
    }
  ]
}
```

Workflows, steps and jobs share one status enum ([Status lifecycle](./workflows#status-lifecycle)); its terminal states [never change](./results-and-webhooks#delivery-semantics).

The `reason` and `blockedReason` fields on failed jobs are the best hint at *why*:

| `reason` | What it means | Your move |
|----------|---------------|-----------|
| `no_provider_available` | No provider can run this job with the given inputs (unusual resolution, unsupported duration, restricted region, etc.). | Relax inputs, try another `provider`/`version`, or retry later. |
| `blocked` | The job was blocked by content moderation. `blockedReason` explains further. | Don't retry the same input; rework the prompt or image. |
| `timeout` / `expired` | Job exceeded its internal deadline. | Safe to resubmit — possibly with a smaller workload. |
| `canceled` | Someone (you or an operator) canceled the workflow via [`DeleteWorkflow`](/orchestration/reference/operations/DeleteWorkflow). | No retry unless you actually want to re-run it. |

When `reason` is absent, the failure is generic — safe to retry once with the same body.

## Webhook retries

The orchestrator retries transient failures on your callback endpoint automatically; see [Delivery semantics](./results-and-webhooks#delivery-semantics) for the ordering guarantees.

## Common gotchas

- **Blob URLs 403 after a few minutes.** The signed URL expired; this isn't a failure. Get a fresh one as described in [Blobs in results](./results-and-webhooks#blobs-in-results).
- **`202` after `wait=90`.** The workflow didn't finish within the [100-second request timeout](./getting-started#_3-poll-if-you-didn-t-wait-inline); continue via webhooks or polling.
- **Step `canceled` unexpectedly.** Check whether another process called [`DeleteWorkflow`](/orchestration/reference/operations/DeleteWorkflow). The orchestrator only cancels on request or when a step it depends on failed.
