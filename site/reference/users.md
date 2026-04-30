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
