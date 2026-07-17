---
title: Reference
description: Civitai site API reference — per-resource endpoint documentation.
---

# Reference

All endpoints below live under `https://civitai.com/api/v1/`.

| Resource | Endpoints |
|----------|-----------|
| [Models](./models) | `GET /models`, `GET /models/{id}` |
| [Model versions](./model-versions) | `GET /model-versions/{id}`, `GET /model-versions/by-hash/{hash}`, `POST /model-versions/by-hash`, `POST /model-versions/by-hash/ids`, `GET /model-versions/mini/{id}` |
| [Images](./images) | `GET /images` |
| [Articles](./articles) | `GET /articles`, `GET /articles/{id}` |
| [Collections](./collections) | `GET /collections`, `GET /collections/{id}` |
| [Creators](./creators) | `GET /creators` |
| [Tags](./tags) | `GET /tags` |
| [Users](./users) | `GET /me`, `GET /users` |
| [Permissions](./permissions) | `GET /permissions/check` |
| [Vault](./vault) | `GET /vault/get`, `GET /vault/all`, `GET /vault/check-vault`, `POST /vault/toggle-version` |
| [Enums](./enums) | `GET /enums` |

## Conventions used on this page

- **Base URL:** `https://civitai.com/api/v1`
- **Content type:** All responses are `application/json; charset=utf-8`.
- **Auth class** (shown on each endpoint):
  - *Public* — no token required.
  - *Mixed* — works without a token, but some parameters or response fields require one.
  - *Authenticated* — 401 without a valid token.
- **Caching:** Public endpoints set `Cache-Control: public, s-maxage=300, stale-while-revalidate=150`; authenticated calls skip the cache.
- **Region gating:** Responses may be filtered to SFW-only content regardless of the `nsfw` param when the request comes from a restricted region or Civitai's "green" domain. This is silent — you just see fewer results.

See the [Guide](../guide/) for cross-cutting topics (authentication,
pagination, errors, AIR identifiers) and the [CLI](../guide/cli) for calling
these endpoints from the terminal.
