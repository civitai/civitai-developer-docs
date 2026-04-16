---
title: Users
description: Information about the authenticated user.
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
