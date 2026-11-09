---
title: Users
description: Look up users by ID or username, and inspect the authenticated caller.
---

# Users

## Get the current user

```
GET /api/v1/me
```

**Auth:** Authenticated — a valid token is required. Returns `401` otherwise.

Use this to confirm which account a token belongs to, check membership
status, or surface the caller's subscription tier in your own UI.

### Response

```json
{
  "id": 12345,
  "username": "you",
  "tier": "founder",
  "status": "active",
  "isMember": true,
  "subscriptions": ["monthly"]
}
```

### Field notes

| Field | Description |
|-------|-------------|
| `id` | Civitai user ID. |
| `username` | Current username. |
| `tier` | Membership tier — `free`, `founder`, `bronze`, `silver`, `gold`. |
| `status` | One of `active`, `muted`, `banned`. |
| `isMember` | Shortcut: `true` when `tier !== 'free'`. |
| `subscriptions` | Names of active subscription products. Empty array when none. |

### Errors

```
HTTP/2 401
{"error":"Unauthorized"}
```

Returned for missing, malformed, or revoked tokens alike — the API does not
distinguish between them.

### Example

```bash
curl -H "Authorization: Bearer $CIVITAI_TOKEN" \
  "https://civitai.com/api/v1/me"
```

<ApiTry path="/api/v1/me" require-auth />

::: tip
Browsers block cross-origin requests that carry credentials unless the server
allowlists the origin. If the Try It above fails with a CORS error from
`developer.civitai.com`, use `curl` locally instead — the endpoint itself is
working.
:::

## Get your usage limits

```
GET /api/v1/me/limits
```

**Auth:** Authenticated — a valid token is required. Returns `401` otherwise.
A scoped token needs **either** the `UserRead` or the `MediaWrite` scope;
one with neither gets `403`.

Shows how much of each product limit the caller has used, so an app can
tell a user how many posts they have left before it tries to create one.
Reading your limits never counts against them.

### Query parameters

| Name | Type | Description |
|------|------|-------------|
| `ids` | string | Optional. Limit ids to return, comma-separated (`ids=posts.daily,posts.hourly`) or repeated (`ids=posts.daily&ids=posts.hourly`). At most 20. Unknown ids are ignored. |

### Response

```json
{
  "limits": [
    {
      "id": "posts.daily",
      "area": "posts",
      "label": "Posts per day",
      "limit": 20,
      "used": 3,
      "remaining": 17,
      "windowSeconds": 86400,
      "window": "rolling",
      "nextAt": null,
      "resetAt": "2026-11-06T09:41:52.000Z"
    },
    {
      "id": "gifts.monthly",
      "area": "gifts",
      "label": "Gift claims per month",
      "limit": 10,
      "used": 2,
      "remaining": 8,
      "windowSeconds": null,
      "window": "utc-month",
      "nextAt": null,
      "resetAt": "2026-12-01T00:00:00.000Z"
    }
  ]
}
```

Every limit that applies to the caller right now is listed. A new account
also has `posts.hourly` on the day it signs up.

A limit counts over one of two kinds of window, given in `window`:

- **`rolling`**: a sliding window. An attempt counts for `windowSeconds`
  after it is made.
- **`utc-day`** or **`utc-month`**: a calendar window in UTC. Everything in
  the current UTC day or month counts, and the count starts again at the next
  boundary, which is `resetAt`.

### Limits listed

| Id | Covers | Window |
|----|--------|--------|
| `posts.hourly`, `posts.daily` | Posts | `rolling` |
| `comments.hourly`, `comments.daily` | Comments. One allowance covers every place you can comment on the site, including model discussions. | `rolling` |
| `gifts.monthly` | Gift claims. Listed only for callers who can claim gifts. | `utc-month` |

Limits that guard against abuse are never listed here.

The values of each limit can change; read them from this endpoint rather than
hard-coding them.

### Field notes

| Field | Description |
|-------|-------------|
| `id` | Stable limit id. The same id is sent as `rateLimit.id` on a `429` refusal. |
| `area` | What the limit covers, e.g. `posts`. |
| `label` | Short human-readable name. |
| `limit` | How many are allowed per window. `null` when the limit does not apply to the caller. |
| `used` | How many count in the current window. `null` when `limit` is. |
| `remaining` | `limit - used`, never below 0. `null` when `limit` is. |
| `windowSeconds` | A `rolling` window's length. `null` for a calendar window, and when `limit` is `null`. |
| `window` | `rolling`, `utc-day` or `utc-month`. `null` when `limit` is. |
| `nextAt` | Once `remaining` is 0, the ISO time the caller can next use it. `null` while `remaining` is above 0. |
| `resetAt` | For a `rolling` window, the ISO time every counted attempt has aged out (`null` when none count). For a calendar window, the next UTC day or month boundary. |

### Errors

```
HTTP/2 401
{"error":"Unauthorized"}
```

```
HTTP/2 403
{"error":"This token lacks the scope to read usage limits."}
```

```
HTTP/2 400
{"error":"Invalid ids."}
```

The response is never cached (`Cache-Control: private, no-store`).

### Example

```bash
curl -H "Authorization: Bearer $CIVITAI_TOKEN" \
  "https://civitai.com/api/v1/me/limits?ids=posts.daily"
```

<ApiTry path="/api/v1/me/limits" require-auth />

## Look up users

```
GET /api/v1/users
```

**Auth:** Public.

Resolve user IDs or do a username prefix search. Returns just `{id, username}`
per result — this endpoint is intentionally lean. Use it to map IDs to
usernames (e.g. when post-processing `/images` results) or to power a
"find user" autocomplete.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `ids` | comma-separated integers | — | Look up specific user IDs. When set, the response limit is `ids.length`. |
| `query` | string | — | Username prefix match (`username LIKE 'query%'`). Returns the shortest matches first. |

When neither `ids` nor `query` is supplied, the endpoint returns the first 5
users in the database. That's almost never what you want — always pass one
of the two.

### Response

```json
{
  "items": [
    { "id": 12345, "username": "you", "avatarNsfw": "None" },
    { "id": 67890, "username": "yousef", "avatarNsfw": "None" }
  ]
}
```

| Field | Description |
|-------|-------------|
| `id` | Civitai user ID. |
| `username` | Current username. |
| `avatarNsfw` | Browsing-level label for the user's avatar (`None`, `Soft`, `Mature`, `X`). Always `None` unless the user has set a mature avatar. |

Deleted and system users (`id = -1`) are filtered out automatically.

### Errors

| Status | Body | Cause |
|--------|------|-------|
| `400` | Zod error JSON | Malformed `ids` (non-numeric) or other parse failure. |
| `500` | `{"message":"An unexpected error occurred", "error": ...}` | Internal failure. |

### Example

```bash
# Map a list of IDs to usernames
curl "https://civitai.com/api/v1/users?ids=12345,67890"

# Username autocomplete
curl "https://civitai.com/api/v1/users?query=yo"
```

<ApiTry path="/api/v1/users" :query="{ ids: '12345' }" />
