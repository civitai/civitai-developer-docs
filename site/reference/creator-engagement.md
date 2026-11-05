---
title: Creator engagement
description: Per-item reactions, comments, collects, views, downloads and tips for your own images, videos and models.
---

# Creator engagement

Engagement counts for **your own** work: each image, video and model you
published, with its reactions, comments, collects, views or downloads, and
tipped Buzz over the last 7 days, the last 30 days and all time. Use it to find
your best-performing items, for example to build a showcase.

::: warning Early access
This endpoint is enabled for a limited group of accounts. When it is not
enabled for yours it answers `404`, as if it did not exist.
:::

## List your items with engagement

```
GET /api/v1/creator/engagement
```

*Authenticated with a full-access personal API key, or a signed-in session.*
OAuth tokens and keys with a narrower scope are refused with `403`.
Credentials passed as a `?token=` query parameter are refused with `403`;
send the key in the `Authorization` header.
The results are always the authenticated user's own items.
There is no `userId` or `username` parameter; you cannot read another
creator's numbers.

### Query parameters

| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `type` | `image`, `video`, `model` | all three | Only this kind of item. |
| `sort` | `engagement`, `newest` | `engagement` | See [Sorting](#sorting). |
| `limit` | 1–100 | 20 | Items per page. |
| `cursor` | string | — | `metadata.nextCursor` from the previous page. |

### Response

```json
{
  "items": [
    {
      "id": 1234,
      "type": "image",
      "name": null,
      "url": "https://civitai.com/images/1234",
      "mediaUrl": "https://image.civitai.com/…",
      "createdAt": "2026-10-01T12:00:00.000Z",
      "nsfwLevel": 1,
      "d7":      { "reactions": { "total": 3, "like": 2, "heart": 1, "laugh": 0, "cry": 0 }, "comments": 1, "collects": 0, "views": 40 },
      "d30":     { "reactions": { "total": 9, "like": 6, "heart": 2, "laugh": 1, "cry": 0 }, "comments": 2, "collects": 1, "views": 210 },
      "allTime": { "reactions": { "total": 9, "like": 6, "heart": 2, "laugh": 1, "cry": 0 }, "comments": 2, "collects": 1, "views": 230, "tippedBuzz": 50 }
    },
    {
      "id": 5678,
      "type": "model",
      "name": "My LoRA",
      "url": "https://civitai.com/models/5678",
      "createdAt": "2026-09-12T08:00:00.000Z",
      "nsfwLevel": 1,
      "versionCount": 3,
      "d7":      { "reactions": { "total": 4, "thumbsUp": 4, "thumbsDown": 0 }, "comments": 0, "collects": 2 },
      "d30":     { "reactions": { "total": 11, "thumbsUp": 10, "thumbsDown": 1 }, "comments": 3, "collects": 9 },
      "allTime": { "reactions": { "total": 40, "thumbsUp": 37, "thumbsDown": 3 }, "comments": 12, "collects": 55, "downloads": 1800, "tippedBuzz": 500 }
    }
  ],
  "metadata": { "nextCursor": "eyJ…" }
}
```

| Field | Description |
|-------|-------------|
| `type` | `image`, `video` or `model`. |
| `name` | The model's name; images and videos usually have none. |
| `mediaUrl` | Images and videos only. |
| `versionCount` | Models only: published versions. |
| `d7`, `d30`, `allTime` | Counts for the last 7 days, the last 30 days, and all time. |
| `reactions` | Images and videos: `like`, `heart`, `laugh`, `cry` and their `total`. Models have no emoji reactions, so they report reviews: `thumbsUp` (recommended), `thumbsDown` (not recommended) and `total`. |
| `comments` | Comments and replies on the item. |
| `collects` | Collections the item was added to. |
| `views` | Images and videos. Counted per UTC day, so `d7` is the last 7 UTC days including today. Left out when it cannot be read, never reported as `0`. |
| `downloads` | Models, `allTime` only. |
| `tippedBuzz` | Buzz tipped on the item, `allTime` only. |
| `metadata.nextCursor` | Pass it back as `cursor` for the next page; `null` at the end. |
| `metadata.imageCandidates` | `sort=engagement` only: `reactions-30d` normally, `newest` when the ranking had to fall back to your newest images. |

**Your own activity is not counted**, in any window: your reactions,
reviews, comments and collection entries on your own items are left out. A few
accounts are also excluded from reaction counts platform-wide. So these numbers
can be lower than the counts shown on the item's page. The response only ever
contains counts: never who reacted, commented or tipped.

### Sorting

- **`newest`:** newest first, across all three kinds. A page can come back
  short, or even empty, with a `nextCursor`: keep following `nextCursor` until
  it is `null`. An empty page is not the end.
- **`engagement`:** highest 30-day score first, where the score is
  `d30.reactions.total + d30.comments + d30.collects`. Only items with a score
  above 0 are listed, at most 1,000. The ranking is refreshed every 5 minutes;
  the counts on each page are read fresh.

### Limits

30 requests per minute per account; over that, `429` with a `Retry-After`
header. Responses are not cached (`Cache-Control: private, no-store`).

### Errors

| Status | When |
|--------|------|
| `400` | A parameter is out of range, or the cursor is not one this endpoint issued. |
| `401` | No valid API token or session. |
| `403` | The token is not a full-access personal API key (for example an OAuth token, a key with limited scopes, or a key passed as `?token=`). |
| `404` | The endpoint is not enabled for your account. |
| `429` | Over the rate limit. |

### Example

```bash
curl -H "Authorization: Bearer $CIVITAI_TOKEN" \
  "https://civitai.com/api/v1/creator/engagement?type=image&limit=10"
```
