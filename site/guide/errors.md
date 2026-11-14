---
title: Errors
description: Error response shape and HTTP status codes used by the Civitai site API.
---

# Errors

## Response shape

Errors that go through the API's shared error envelope carry three fields:

```json
{ "code": "NOT_FOUND", "message": "Not found", "error": "Not found" }
```

- **`code`** — a stable, machine-readable value: `BAD_REQUEST`, `NOT_FOUND`,
  `CONFLICT`, `TIMEOUT`, `TOO_MANY_REQUESTS` or `INTERNAL_SERVER_ERROR`.
  **Branch on `code`**, never on the text.
- **`message`** — a human-readable summary, always a string.
- **`error`** — the older field, kept for existing clients. Usually the same
  string as `message`; on some `400`s it is a validation object.
- **`rateLimit`** — on a rate-limited `429` only:
  `{ "retryAfterSeconds": …, "retryAt": … }`, sent with a `Retry-After` header.

Not every error carries `code` yet. A `401` is still `{ "error": "Unauthorized" }`,
a missing-scope `403` is `{ "error": "<message>" }`, and some `4xx` forwarded
from the internal tRPC layer are `{ "message": "…" }` or a list of Zod issues.
When `code` is absent, branch on the HTTP status.

::: tip Hit this through the `civitai` CLI rather than the REST API?
The CLI turns these statuses into **exit codes** and its own messages, and the
mapping is not one-to-one — one `429` is exit `2`, another is exit `6`. Look the
message you got up on
[CLI troubleshooting](./cli-troubleshooting), which is indexed by the string the
binary prints.
:::

## Status codes

| Status | Meaning | Typical cause |
|--------|---------|---------------|
| **200** | OK | Successful read. |
| **400** | Bad Request | Invalid query parameters. For list endpoints, response body includes Zod-style validation issues. Combining `?query=` with `?page=` also returns 400. |
| **401** | Unauthorized | Missing or invalid token on an `Authenticated` endpoint, or an auth-only filter (e.g. `?favorites=true`) on a `Mixed` endpoint without a session. |
| **403** | Forbidden | Valid token, but the user is not permitted to access the resource. |
| **404** | Not Found | Unknown model, version, or hash. Body shape: `{"error": "No model with id 0"}`. |
| **405** | Method Not Allowed | Wrong HTTP verb for the endpoint. |
| **429** | Too Many Requests | Either edge rate limiting (Cloudflare) or the `page * limit > 1000` pagination cap — see [Pagination](./pagination). |
| **500** | Internal Server Error | Unexpected failure. Safe to retry with backoff. |

## Retries

A rate-limited `429` sends `Retry-After` (and `rateLimit` in the body); wait
that long. Without one, for 5xx and 429 responses apply exponential backoff
starting at ~1 second and cap at ~30 seconds. Don't retry 4xx responses other than 429 — the request shape
itself is the problem.

## Rate limits

There is no per-endpoint rate limit exposed as a stable contract. Cloudflare
enforces edge limits (generic DDoS / abuse protection) in front of the API;
those are operational, not a published SLA. Treat unexpected 429s as a signal
to back off, not as a scheme to code against.
