---
title: Vault
description: Manage a member's saved model versions — list, check, add, and remove.
---

# Vault

The **Civitai Vault** is a personal collection of model versions kept on
behalf of a paid member. It survives even if the original model is deleted
from the site, so creators can keep using resources they relied on.

::: warning Membership required
All vault endpoints require an active Civitai membership (`bronze`, `silver`,
`gold`, or `founder`). Free-tier callers get a `200` response with
`{"vault": null}` — there is no `403` to distinguish "no membership" from
"empty vault". Check [`GET /me`](./users#get-the-current-user) for the
caller's `tier` if you need to gate ahead of time.
:::

::: warning Authentication
All vault endpoints require a Civitai API token. Pass it as
`Authorization: Bearer <token>`. See [Authentication](../guide/authentication).
:::

## Get or create the vault

```
GET /api/v1/vault/get
```

Returns the caller's vault, creating one on first call.

### Response

```json
{
  "vault": {
    "userId": 12345,
    "storageKb": 1048576,
    "usedStorageKb": 6775430,
    "meta": {},
    "updatedAt": "2025-04-01T08:30:00.000Z"
  }
}
```

| Field | Description |
|-------|-------------|
| `userId` | Vault owner's user ID. Doubles as the vault's primary key. |
| `storageKb` | Total storage allowance, derived from the user's active membership(s). |
| `usedStorageKb` | Sum of `modelSizeKb + detailsSizeKb + imagesSizeKb` across all items. |
| `meta` | Free-form metadata bag. Reserved for future use. |
| `updatedAt` | When the vault row last changed. |

Free-tier callers get `{"vault": null}` instead.

### Example

```bash
curl -H "Authorization: Bearer $CIVITAI_TOKEN" \
  "https://civitai.com/api/v1/vault/get"
```

<ApiTry path="/api/v1/vault/get" require-auth />

## List vault items

```
GET /api/v1/vault/all
```

Paginated list of model versions in the caller's vault.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer (1–200) | `60` | Items per page. |
| `page` | integer | `1` | 1-indexed page number. |
| `query` | string | — | Case-insensitive substring match against `modelName`, `versionName`, and `creatorName`. |
| `types` | comma-separated `ModelType` values | — | e.g. `Checkpoint,LORA`. |
| `categories` | comma-separated strings | — | Filter by category. |
| `baseModels` | comma-separated strings | — | e.g. `SDXL 1.0,Flux.1 D`. |
| `dateCreatedFrom` / `dateCreatedTo` | ISO date | — | Bound the underlying model version's `createdAt`. |
| `dateAddedFrom` / `dateAddedTo` | ISO date | — | Bound when the item was added to the vault. |
| `sort` | enum | `Recently Added` | One of `Recently Added`, `Recently Created`, `Model Name`, `Model Size`. URL-encode the space. |

### Response

```json
{
  "items": [
    {
      "id": 9876,
      "vaultId": 12345,
      "status": "Stored",
      "modelVersionId": 2514310,
      "modelId": 827184,
      "modelName": "WAI-illustrious-SDXL",
      "versionName": "v16.0",
      "creatorId": 67890,
      "creatorName": "WAI",
      "type": "Checkpoint",
      "baseModel": "Illustrious",
      "category": "character",
      "modelSizeKb": 6775430,
      "detailsSizeKb": 12,
      "imagesSizeKb": 4096,
      "createdAt": "2025-04-01T08:30:00.000Z",
      "addedAt": "2025-04-01T08:30:00.000Z",
      "refreshedAt": null,
      "notes": null,
      "meta": { "failures": 0 },
      "coverImageUrl": "https://image.civitai.com/.../cover.jpeg",
      "files": [
        { "id": 2402203, "sizeKB": 6775430, "url": "https://...", "displayName": "waiIllustriousSDXL_v160.safetensors" }
      ]
    }
  ],
  "totalItems": 42,
  "currentPage": 1,
  "pageSize": 60,
  "totalPages": 1
}
```

| Field | Description |
|-------|-------------|
| `status` | `Pending`, `Stored`, or `Failed`. Cover image and full files are only available once `Stored`. |
| `modelName` / `versionName` / `creatorName` | Snapshot at vault time. Survive deletion of the original model. |
| `coverImageUrl` | Pre-signed URL to a cover image, or `null` while the item is still pending. |
| `files` | Mirror of the model version's downloadable files at vault time. Each entry has `id`, `sizeKB`, `url`, `displayName`. |
| `category` | Tag-derived category. May be empty string if uncategorised. |
| `meta.failures` | Counter for ingestion retries. Diagnostic only. |

### Example

```bash
curl -H "Authorization: Bearer $CIVITAI_TOKEN" \
  "https://civitai.com/api/v1/vault/all?limit=10&types=LORA"
```

<ApiTry path="/api/v1/vault/all" :query="{ limit: 10 }" require-auth />

## Check vault membership

```
GET /api/v1/vault/check-vault
```

Bulk lookup: for a list of model version IDs, return which ones the caller
already has in their vault.

### Query parameters

| Name | Type | Description |
|------|------|-------------|
| `modelVersionIds` | comma-separated integers | IDs to check. Required. |

### Response

An array, one entry per requested ID. `vaultItem` is `null` when the version
isn't in the vault, otherwise it's the full vault item record (same shape as
in `/vault/all`).

```json
[
  { "modelVersionId": 2514310, "vaultItem": { "id": 9876, "...": "..." } },
  { "modelVersionId": 2402203, "vaultItem": null }
]
```

### Example

```bash
curl -H "Authorization: Bearer $CIVITAI_TOKEN" \
  "https://civitai.com/api/v1/vault/check-vault?modelVersionIds=2514310,2402203"
```

<ApiTry path="/api/v1/vault/check-vault" :query="{ modelVersionIds: '2514310' }" require-auth />

## Add or remove a model version

```
POST /api/v1/vault/toggle-version
```

Toggles a model version in the caller's vault. If it isn't there, it's added;
if it is, it's removed. There's no separate add/remove endpoint — both
operations go through this one.

### Query parameters

| Name | Type | Description |
|------|------|-------------|
| `modelVersionId` | integer | Required. |

### Response

```json
{
  "success": true,
  "vaultId": 12345
}
```

`vaultId` is omitted when the operation removed the item.

### Errors

| Status | Cause |
|--------|-------|
| `401` | Missing or invalid token. |
| `400` | Missing or malformed `modelVersionId`. |
| `500` | Storage quota exceeded, model not found, or other internal error — check `error.message`. |

### Example

```bash
curl -X POST -H "Authorization: Bearer $CIVITAI_TOKEN" \
  "https://civitai.com/api/v1/vault/toggle-version?modelVersionId=2514310"
```

::: tip
The "Try It" widget is GET-only, so this endpoint can only be exercised from a
shell. Run the curl above (it's idempotent — calling it twice puts the version
back).
:::
