---
title: Authentication
description: How to authenticate with the Civitai site API using bearer tokens.
---

# Authentication

The Civitai site API uses **bearer tokens** generated from your account
settings. A single token covers every endpoint that accepts authentication.

::: info Building a third-party app?
Use [OAuth](/site/oauth/) instead of personal API keys — users authorize
your app explicitly with the scopes it needs and can revoke it any time,
without rotating anything on your side.
:::

## How to pass the token

Two methods are supported. The header form is strongly preferred; the
query-param form exists mainly for download-tool compatibility and leaks the
token into access logs and caches.

### Authorization header (preferred)

```bash
curl -H "Authorization: Bearer $CIVITAI_TOKEN" \
  "https://civitai.com/api/v1/me"
```

### Query parameter

```bash
curl "https://civitai.com/api/v1/me?token=$CIVITAI_TOKEN"
```

## Which endpoints require a token?

Endpoints fall into three categories:

| Category | Behavior without a token | Examples |
|---|---|---|
| **Public** | Full access. | `GET /creators`, `GET /tags`, `GET /images`, `GET /models/{id}`, `GET /model-versions/*` |
| **Mixed** | Accessible, but some filter params or fields may be unavailable. | `GET /models` (the `favorites` and `hidden` query params require auth) |
| **Authenticated** | `401 Unauthorized`. | `GET /me` |

Each page in the [Reference](../reference/) notes which category an endpoint falls into.

## What 401 looks like

Calling an authenticated endpoint without a token — or with an invalid one —
returns:

```
HTTP/2 401
Content-Type: application/json

{"error":"Unauthorized"}
```

Mixed endpoints silently degrade to anonymous access when no token is
provided; they only return 401 if you pass an auth-only filter (e.g.
`?favorites=true`) without a valid session.

## Caching and auth

Public endpoints set `Cache-Control: public, s-maxage=300, stale-while-revalidate=150` —
responses are cached for 5 minutes at the edge. When you call an endpoint *with*
a valid token, caching is skipped so personalized responses aren't shared.

CORS is open for public endpoints (`Access-Control-Allow-Origin: *`);
authenticated requests are restricted to Civitai-owned origins.

## Security tips

- Tokens are account-scoped. Rotating one means rotating everywhere it's used.
- If you suspect a leak, delete the key from your [account settings](https://civitai.com/user/account) and issue a new one.
- Prefer the `Authorization` header over `?token=`; query params end up in server logs, browser history, and proxy caches.
- Never embed a token in client-side code shipped to browsers or mobile apps.
