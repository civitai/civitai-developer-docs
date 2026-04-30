---
title: Permissions
description: Check whether a caller (or another user) is allowed to generate from a given resource.
---

# Permissions

Some Civitai resources are gated — most commonly by the **early-access** window
on a model version. This endpoint lets you check, in bulk, whether a user is
allowed to use a given resource for generation before you submit it to the
[Orchestration API](/orchestration/).

## Check generation permission

```
GET /api/v1/permissions/check
```

**Auth:** Public. The check runs against the user identified by the `userId`
query param (anonymous when omitted). Bearer tokens are **not** used to scope
this endpoint — pass `userId` explicitly when you need to check permissions
for a specific user.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `entityIds` | comma-separated integers | — | The IDs to check. Required. |
| `entityType` | `ModelVersion` | `ModelVersion` | The kind of entity. Currently only model versions are supported. |
| `permission` | `Generate` | `Generate` | Which permission to check. Currently only `Generate` is supported. |
| `userId` | integer | — | Run the check on behalf of this user instead of the token's owner. Useful for partner integrations that broker requests for many users. |

### Response

A flat object mapping each `entityId` to a boolean.

```json
{
  "2514310": true,
  "2402203": false
}
```

`true` means the resource can be used to generate; `false` means it's gated
and the user does not currently have access (e.g. early-access window is
active and they haven't paid for it, or it's marked `Private` and they're not
the owner).

When `entityIds` is empty, the response is an empty array (`[]`).

### Errors

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{"error":"Could not parse provided model versions array."}` | Missing or malformed `entityIds`. |
| `400` | `{"error":"Invalid permission"}` | `permission` not recognised. |
| `500` | `{"message":"An unexpected error occurred", "error": ...}` | Internal failure. |

### Example

```bash
# Anonymous check across two versions
curl "https://civitai.com/api/v1/permissions/check?entityIds=2514310,2402203"

# Check on behalf of a specific user
curl "https://civitai.com/api/v1/permissions/check?entityIds=2514310&userId=12345"
```

<ApiTry path="/api/v1/permissions/check" :query="{ entityIds: '2514310' }" />

::: tip
Combine this with [`GET /model-versions/{id}`](./model-versions): the model
version response already includes `earlyAccessEndsAt` and `earlyAccessConfig`,
which tell you *why* a resource is gated. Use this endpoint when you only
need a yes/no for a specific user.
:::
