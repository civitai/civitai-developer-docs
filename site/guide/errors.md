---
title: Errors
description: Error response shape and HTTP status codes used by the Civitai site API.
---

# Errors

## Response shape

Most errors come back as a single-field JSON object:

```json
{ "error": "descriptive message" }
```

Some errors originate inside the internal tRPC layer and get forwarded with a
richer shape:

```json
{
  "code": "UNAUTHORIZED",
  "message": "descriptive message",
  "issues": [ /* optional Zod validation details */ ]
}
```

Either way, inspect the HTTP status code first and use the body for a
human-readable explanation.

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

The API does not expose a `Retry-After` header for most failures. For 5xx and
429 responses, apply exponential backoff starting at ~1 second and cap at
~30 seconds. Don't retry 4xx responses other than 429 — the request shape
itself is the problem.

## Rate limits

There is no per-endpoint rate limit exposed as a stable contract. Cloudflare
enforces edge limits (generic DDoS / abuse protection) in front of the API;
those are operational, not a published SLA. Treat unexpected 429s as a signal
to back off, not as a scheme to code against.
