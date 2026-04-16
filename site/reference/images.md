---
title: Images
description: Browse images posted to Civitai, with filters for post, model, version, and creator.
---

# Images

Images are user-submitted outputs attached to posts. This endpoint powers the
gallery on civitai.com.

## List images

```
GET /api/v1/images
```

**Auth:** Public. Authenticated callers see content up to their configured
browsing level; anonymous callers are capped at the public browsing level.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer (1–200) | 100 | Number of items per page. |
| `page` | integer | — | 1-indexed page number. Incompatible with `cursor`. |
| `cursor` | string | — | Opaque cursor; use `metadata.nextCursor` from the previous response. |
| `postId` | integer | — | Restrict to a specific post. |
| `modelId` | integer | — | Images associated with any version of a model. |
| `modelVersionId` | integer | — | Images associated with a specific version. |
| `imageId` | integer | — | Single-image lookup. |
| `username` | string | — | Filter by uploader username. Auto-slugified. |
| `userId` | integer | — | Filter by uploader user ID. |
| `period` | `AllTime` \| `Year` \| `Month` \| `Week` \| `Day` | `AllTime` | Time window for sort metrics. |
| `sort` | `Most Reactions` \| `Most Comments` \| `Newest` \| `Oldest` \| ... | `Most Reactions` | |
| `nsfw` | `None` \| `Soft` \| `Mature` \| `X` \| boolean | — | Legacy NSFW filter; prefer `browsingLevel`. |
| `browsingLevel` | integer (bitmask) | — | Raw browsing-level bitmask. Takes precedence over `nsfw`. |
| `tags` | comma-separated integers | — | Tag IDs to require on each image. |
| `type` | `image` \| `video` \| `audio` | — | Media type. |
| `baseModels` | comma-separated strings | — | Filter to outputs from specific base models. |
| `withMeta` | boolean | `false` | If `true`, include the full `meta` object (prompt, resources, etc.). |

### Response

```json
{
  "items": [
    {
      "id": 9173928,
      "url": "https://image.civitai.com/.../cc242d6c-f960-4274-aa1d-f22a71e705ef.jpeg",
      "hash": "UA8N5},:Ioni~C#laKxaoznNwvx]XmRkVstR",
      "width": 832,
      "height": 1216,
      "type": "image",
      "nsfw": true,
      "nsfwLevel": "Soft",
      "browsingLevel": 2,
      "createdAt": "2025-04-17T21:28:57.225Z",
      "postId": 1981754,
      "username": "Ajuro",
      "baseModel": "SDXL 1.0",
      "modelVersionIds": [9208, 249861, 258687, 332071, 345685],
      "stats": {
        "cryCount": 1770,
        "laughCount": 2771,
        "likeCount": 21692,
        "dislikeCount": 0,
        "heartCount": 8044,
        "commentCount": 58
      },
      "meta": {
        "Size": "832x1216",
        "seed": 1938345220,
        "steps": 45,
        "sampler": "DPM++ 2M",
        "cfgScale": 5,
        "clipSkip": 2,
        "prompt": "...",
        "negativePrompt": "...",
        "resources": [],
        "civitaiResources": [
          { "type": "checkpoint", "modelVersionId": 345685 },
          { "type": "lora", "weight": 0.65, "modelVersionId": 249861 }
        ]
      }
    }
  ],
  "metadata": {
    "nextCursor": "1|1744925337225",
    "nextPage": "https://civitai.com/api/v1/images?limit=100&cursor=..."
  }
}
```

### Field notes

- `nsfwLevel` is the **string** form (`None`, `Soft`, `Mature`, `X`).
  `browsingLevel` is the raw bitmask — use this for precise filtering.
- `hash` is a BlurHash, suitable for rendering a placeholder while the
  `url` loads.
- `meta` is present only when the uploader included metadata at post time.
  The most common fields are listed above, but the object is free-form —
  tools like Automatic1111 and ComfyUI drop in their own keys. Treat unknown
  keys as opaque.
- `civitaiResources` inside `meta` maps each referenced resource to its
  Civitai `modelVersionId`, so you can round-trip back to
  [`GET /model-versions/{id}`](./model-versions).
- `modelVersionIds` at the top level is a deduped list of every model
  version referenced in `meta.civitaiResources`.

### Notes

- Page-based pagination is capped at `page * limit ≤ 1000`; deep traversal
  requires `cursor`. See [Pagination](../guide/pagination).
- On Civitai's "green" domain or from restricted regions, results are
  filtered to SFW regardless of the `nsfw` / `browsingLevel` parameter.
- `/images` ships with a large default limit (100). Lower `limit` explicitly
  if you're only after a handful.

### Examples

```bash
# Newest images for a specific model
curl "https://civitai.com/api/v1/images?modelId=827184&sort=Newest&limit=10"

# All images in a post, with full generation metadata
curl "https://civitai.com/api/v1/images?postId=1981754&withMeta=true"

# Cursor-based traversal
curl "https://civitai.com/api/v1/images?limit=100" | jq '.metadata.nextCursor'
```
