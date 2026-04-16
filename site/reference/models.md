---
title: Models
description: List and fetch Civitai models.
---

# Models

A **model** represents a trained AI resource published on Civitai — a
checkpoint, LoRA, textual inversion, VAE, ControlNet, upscaler, etc. Each
model has one or more [model versions](./model-versions) containing the
actual files.

## List models

```
GET /api/v1/models
```

**Auth:** Mixed — the `favorites` and `hidden` params require a bearer token.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer (1–100) | 100 | Number of items per page. |
| `page` | integer (≥ 1) | — | 1-indexed page number. Incompatible with `query`. |
| `cursor` | string | — | Opaque pagination cursor. Use `metadata.nextCursor` from the previous response. |
| `query` | string | — | Full-text search (Meilisearch). Requires cursor-based pagination. |
| `ids` | comma-separated integers | — | Restrict to specific model IDs. |
| `tag` | string | — | Filter by tag name. |
| `username` | string | — | Filter by creator. Auto-slugified. |
| `types` | `ModelType` or `ModelType[]` | — | One or more of the values from `GET /enums` (`ModelType`). Repeat the param or comma-separate. |
| `baseModels` | string or string[] | — | Filter by base model (e.g. `SDXL 1.0`, `Flux.1 D`). See `GET /enums` (`BaseModel`). |
| `checkpointType` | `Standard` \| `Trained` \| `Merge` | — | For checkpoint models only. |
| `sort` | `Highest Rated` \| `Most Downloaded` \| `Newest` \| ... | `Highest Rated` | See source for full list. |
| `period` | `AllTime` \| `Year` \| `Month` \| `Week` \| `Day` | `AllTime` | Time window for sort metrics. |
| `nsfw` | boolean | `false` | If `true`, include mature content. Ignored on SFW-gated regions. |
| `supportsGeneration` | boolean | — | Only return models supported by on-site generation. |
| `fromPlatform` | boolean | — | Only return models trained on Civitai. |
| `earlyAccess` | boolean | — | Include early-access versions. |
| `primaryFileOnly` | boolean | `false` | Drop non-primary files from each version's `files[]`. |
| `favorites` | boolean | `false` | *(auth required)* Only models in the caller's bookmark collection. |
| `hidden` | boolean | `false` | *(auth required)* Only models the caller has hidden. |

Unknown params are silently ignored after Zod parsing; invalid ones return `400`.

### Response

```json
{
  "items": [
    {
      "id": 827184,
      "name": "WAI-illustrious-SDXL",
      "description": "<p>...</p>",
      "type": "Checkpoint",
      "nsfw": false,
      "nsfwLevel": 31,
      "availability": "Public",
      "supportsGeneration": true,
      "allowNoCredit": true,
      "allowCommercialUse": "{Image,RentCivit}",
      "allowDerivatives": true,
      "allowDifferentLicense": true,
      "minor": false,
      "poi": false,
      "sfwOnly": false,
      "stats": {
        "downloadCount": 1272529,
        "thumbsUpCount": 79272,
        "thumbsDownCount": 202,
        "commentCount": 1931,
        "tippedAmountCount": 156742
      },
      "creator": {
        "username": "WAI0731",
        "image": "https://image.civitai.com/.../WAI0731.jpeg"
      },
      "tags": ["base model", "anime"],
      "modelVersions": [
        {
          "id": 2514310,
          "name": "v16.0",
          "baseModel": "Illustrious",
          "baseModelType": "Standard",
          "publishedAt": "2025-12-18T09:16:12.062Z",
          "supportsGeneration": true,
          "stats": { "downloadCount": 215627, "thumbsUpCount": 13828, "thumbsDownCount": 22 },
          "files": [
            {
              "id": 2402203,
              "name": "waiIllustriousSDXL_v160.safetensors",
              "type": "Model",
              "sizeKB": 6775430.35,
              "hashes": {
                "AutoV2": "A5F58EB1C3",
                "SHA256": "A5F58EB1C3...",
                "BLAKE3": "1A411D9B..."
              },
              "downloadUrl": "https://civitai.com/api/download/models/2514310",
              "primary": true,
              "metadata": { "format": "SafeTensor", "size": "pruned", "fp": "fp16" }
            }
          ],
          "images": [],
          "downloadUrl": "https://civitai.com/api/download/models/2514310"
        }
      ]
    }
  ],
  "metadata": {
    "nextCursor": "75363|932023|257749",
    "nextPage": "https://civitai.com/api/v1/models?limit=100&cursor=...",
    "currentPage": 1,
    "pageSize": 100
  }
}
```

When using `page` pagination, `metadata` additionally includes `currentPage` and `pageSize`. When using `cursor` pagination, those are omitted.

### Notes

- `page * limit` above 1000 returns `429`; use `cursor` for deep paging. See [Pagination](../guide/pagination).
- Including `query` without `cursor` is fine; combining `query` with `page` returns `400`.
- Only `Published` versions are returned to non-moderator callers. Files marked non-public by the uploader are hidden from `files[]`.
- `images[]` is omitted entirely when the model is taken down; `files[]` and `downloadUrl` are omitted when the model is archived.

### Example

```bash
curl "https://civitai.com/api/v1/models?limit=5&types=LORA&baseModels=SDXL%201.0&sort=Most%20Downloaded"
```

<ApiTry path="/api/v1/models" :query="{ limit: 5, types: 'LORA', baseModels: 'SDXL 1.0', sort: 'Most Downloaded' }" />

## Get a model

```
GET /api/v1/models/{id}
```

**Auth:** Public.

### Path parameters

| Name | Type | Description |
|------|------|-------------|
| `id` | integer | Model ID. |

### Response

Returns the same shape as a single item from the list endpoint — same
top-level keys (`id`, `name`, `type`, `modelVersions`, `creator`, `tags`,
`stats`, ...).

Returns `404` if the model doesn't exist:

```json
{ "error": "No model with id 0" }
```

### Example

```bash
curl "https://civitai.com/api/v1/models/827184"
```

<ApiTry path="/api/v1/models/827184" />
