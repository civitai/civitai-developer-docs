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

**Which images are listed:** only images from **public** posts. Images in
unlisted (unsearchable) posts and in early-access posts are not returned.
Exceptions: requests filtered by `postId`, by `imageId`, or by `modelId`
without `modelVersionId`, and requests with `sort=Random` or `limit=0`, can still
include unlisted and early-access images, and their `tags` filter matches an
image carrying any one of the given tags.

::: info Rolling out
The public-only results, the all-of `tags` filter and the `feed:` cursors
described on this page are being rolled out gradually, so some callers may
still see the previous behaviour for a while.
:::

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer (0–200) | 50 | Number of items per page. |
| `page` | integer | — | 1-indexed page number. Honoured only for lookups by `imageId`, or by `modelId` without `modelVersionId`; on every other request it is ignored and the first page is returned. Ignored whenever `cursor` is set. When `page` is sent, `metadata.nextPage` advances `page` rather than the cursor, so on those other requests it returns the first page again — walk results with `cursor` instead. |
| `cursor` | string | — | Opaque cursor: pass `metadata.nextCursor` from the previous response back verbatim. See [Cursors](#cursors). |
| `postId` | integer | — | Restrict to a specific post. |
| `modelId` | integer | — | Images associated with any version of a model. |
| `modelVersionId` | integer | — | Images associated with a specific version. |
| `imageId` | integer | — | Single-image lookup. |
| `username` | string | — | Filter by uploader username. Auto-slugified. |
| `userId` | integer | — | Filter by uploader user ID. |
| `period` | `AllTime` \| `Year` \| `Month` \| `Week` \| `Day` | `AllTime` | Time window for sort metrics. |
| `sort` | `Most Reactions` \| `Most Comments` \| `Most Collected` \| `Newest` \| `Oldest` \| `Random` | `Most Reactions` | |
| `nsfw` | `None` \| `Soft` \| `Mature` \| `X` \| boolean | — | Legacy NSFW filter; prefer `browsingLevel`. |
| `browsingLevel` | integer (bitmask) | — | Raw browsing-level bitmask. Takes precedence over `nsfw`. |
| `tags` | comma-separated integers | — | Tag IDs to require on each image. With several IDs, an image must carry **all** of them (not any one). |
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
      "thumbnail": null,
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
    "nextCursor": "feed:1744925337225:9173928",
    "nextPage": "https://civitai.com/api/v1/images?limit=100&cursor=..."
  }
}
```

### Field notes

- `nsfwLevel` is the **string** form (`None`, `Soft`, `Mature`, `X`).
  `browsingLevel` is the raw bitmask — use this for precise filtering.
- `hash` is a BlurHash, suitable for rendering a placeholder while the
  `url` loads.
- `thumbnail` is a still for a video: `{ url, width, height }`. It is `null`
  for images and audio. It is the uploader's custom thumbnail when that
  thumbnail's rating is within the browsing level of the request, otherwise a
  frame taken from the video. The `url` serves an optimized still (WebP for a
  custom thumbnail, JPEG for a frame), while the item's own `url` serves the
  video file. `width` and `height` can be `null`.
- `meta` is present only when the uploader included metadata at post time.
  The most common fields are listed above, but the object is free-form —
  tools like Automatic1111 and ComfyUI drop in their own keys. Treat unknown
  keys as opaque.
- `civitaiResources` inside `meta` maps each referenced resource to its
  Civitai `modelVersionId`, so you can round-trip back to
  [`GET /model-versions/{id}`](./model-versions).
- `modelVersionIds` at the top level is a deduped list of every model
  version referenced in `meta.civitaiResources`.

### Cursors

- Treat `metadata.nextCursor` as an opaque token and pass it back verbatim
  as `cursor` (or follow `metadata.nextPage`, which carries it as long as
  you did not send `page`). Don't parse or build cursors yourself.
- Cursors now begin with `feed:` (for example `feed:1744925337225:9173928`).
  Older cursors of the form `<offset>|<timestamp>` are still accepted, and a
  first page can occasionally still return one (for example during a brief
  service disruption). Such a page, and a scroll that continues from an
  older cursor, follow the previous rules: they can include unlisted and
  early-access images, and multiple `tags` match an image carrying any one
  of them.
- Keep the other query parameters the same while you follow a cursor. A
  `feed:` cursor sent with filters it cannot continue is rejected with a
  `400` rather than silently restarting at the first page.
- **An empty `items` array is not the end of the results.** A page can come
  back empty with a `nextCursor`; keep following it. The results end only
  when `nextCursor` is absent.

### Errors

Besides the validation errors common to all list endpoints (see
[Errors](../guide/errors)), a request carrying a `feed:` cursor can return:

| Status | Body | Meaning |
|--------|------|---------|
| `503` | `{ "error": "Image search is temporarily overloaded — please retry." }` | Transient. Sent with `Retry-After: 2`; retry the same request, cursor unchanged. |
| `400` | `{ "message": "This cursor cannot be continued with these filters" }` | The cursor can't be continued with the request as sent, usually because a filter changed mid-scroll. Restore the original filters, or start again without `cursor`. |
| `400` | `{ "message": "This cursor can no longer be continued; start again without it" }` | Start again without `cursor`. |

### Notes

- Page-based pagination is capped at `page * limit ≤ 1000`; deep traversal
  requires `cursor`. See [Pagination](../guide/pagination).
- On Civitai's "green" domain or from restricted regions, results are
  filtered to SFW regardless of the `nsfw` / `browsingLevel` parameter.
- `/images` defaults to `limit=50`. Lower it explicitly if you're only after
  a handful, or raise it up to `200` for fewer round-trips.

### Examples

```bash
# Newest images for a specific model
curl "https://civitai.com/api/v1/images?modelId=827184&sort=Newest&limit=10"

# All images in a post, with full generation metadata
curl "https://civitai.com/api/v1/images?postId=1981754&withMeta=true"

# Cursor-based traversal
curl "https://civitai.com/api/v1/images?limit=100" | jq '.metadata.nextCursor'
```

<ApiTry path="/api/v1/images" :query="{ postId: 1981754, withMeta: true, limit: 5 }" />

::: warning
Filtering by `modelId` on an extremely popular checkpoint (hundreds of
thousands of images) can exceed Cloudflare's 30s timeout. For large models,
fetch by `postId` or walk `cursor`-based pagination with `limit=100` instead
of sorting the whole set.
:::
