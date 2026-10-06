---
title: API Reference
---

# API Reference

Every consumer-facing operation, request schema, and response shape in the Civitai Orchestration API. Pages here are generated from the OpenAPI specification ([`v2-consumers.json`](https://orchestration.civitai.com/openapi/v2-consumers.json)) and stay in sync with the running API on every build.

## Conventions

- **Base URL**: `https://orchestration.civitai.com`
- **Auth**: `Authorization: Bearer <token>` on every request.
- **Content type**: `application/json` for bodies; blob upload endpoints accept `multipart/form-data` or presigned PUT.
- **IDs**: workflow IDs are ULIDs prefixed `wf_`; blob IDs are prefixed `blob_`.
- **Polymorphism**: workflow step bodies use a `$type` discriminator; request/response schemas list all valid subtypes under `oneOf`.

## Entry points

Most consumer integrations only touch three operations:

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — create a workflow with one or more steps
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — poll a single workflow
- [`QueryWorkflows`](/orchestration/reference/operations/QueryWorkflows) — list / filter workflows

The left sidebar is grouped by OpenAPI tag — **Workflows**, **WorkflowSteps**, **Recipes**, **Blobs**, **Resources**. Recipes have per-endpoint variants (one per job type) if you prefer the typed surface over the polymorphic `SubmitWorkflow` body.

## Rate limits & quotas

Responses report the limits that apply to you in the `RateLimit-Policy` and `RateLimit` headers, using the named-policy syntax of the [IETF RateLimit header fields draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/). Each limit is one named entry:

```http
RateLimit-Policy: "buzz";q=1000;w=60
RateLimit: "buzz";r=940;t=12
```

| Parameter | Header | Meaning |
|-----------|--------|---------|
| `q` | `RateLimit-Policy` | Quota per window |
| `w` | `RateLimit-Policy` | Window length in seconds |
| `r` | `RateLimit` | Remaining quota in the current window |
| `t` | `RateLimit` | Seconds until the current window resets |

When a limit is exhausted the API responds with `429 Too Many Requests` and a `Retry-After` header giving the seconds to wait.

### Free tier

A limited set of models can be run without Buzz on a best-effort basis. [`GetFreeTier`](/orchestration/reference/operations/GetFreeTier) returns the models currently offered and your remaining quota for each. To opt in:

- set `"tier": "free"` on [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow)
- add `?tier=free` to a recipe endpoint
- send `X-Civitai-Tier: free` on the OpenAI-compatible chat completions endpoint

Free work is scheduled behind paid work and expires if it cannot be served in time. Each free request uses quota when it is accepted, whether or not it later succeeds. Every step in a free workflow must use a model offered on the free tier; otherwise the request is rejected with `400`. On free requests, each quota also appears as its own entry in the `RateLimit` headers.
