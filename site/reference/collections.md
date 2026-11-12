---
title: Collections
description: List, search, and fetch public Civitai collections.
---

# Collections

A **collection** is a curated set of resources (models, images, articles, or
posts) grouped by a user on Civitai. These endpoints expose **public**
collections only.

::: tip Public, edge-cached, rate-limited
Both endpoints are **public** — they work anonymously and always evaluate the
request as anonymous, so a token is *optional* and never changes the data you
get back (the result is a pure function of the URL + your region). Only
**public** collections are ever returned — private collections are unreachable,
and a private collection is indistinguishable from a missing one. Responses are
edge-cached (`public, s-maxage=300`) and **conservatively rate-limited**; on a
`429` respect the `Retry-After` header. Mature covers/collections are clamped to
the SFW ceiling in restricted regions regardless of the `nsfw` param. There is
no "my collections" mode here — own-collection discovery is a per-user
(authoring) surface, not public discovery.
:::

## List collections

```
GET /api/v1/collections
```

**Auth:** Public.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer (1–100) | 100 | Number of items per page. |
| `cursor` | integer | — | Keyset cursor (a collection ID). Use `metadata.nextCursor` from the previous response. **Only supported with the default `Newest` sort** — combining a cursor with `sort=Most Followers` returns `400`. |
| `query` | string (≤ 100 chars) | — | Full-text search over the collection name. |
| `sort` | `Newest` \| `Most Followers` | `Newest` | Sort order. |
| `nsfw` | boolean | `false` | If `true`, include mature content. Ignored (clamped to SFW) in restricted regions. |

An invalid param — or a cursor combined with `sort=Most Followers` — returns `400`.

### Response

Envelope: `{ items, metadata: { nextCursor, nextPage } }`.

```json
{
  "items": [
    {
      "id": 1201,
      "name": "Favorite anime LoRAs",
      "description": "A running list of the best anime LoRAs.",
      "type": "Model",
      "mode": null,
      "nsfwLevel": 1,
      "read": "Public",
      "isPublic": true,
      "itemCount": 42,
      "coverImage": {
        "id": 501,
        "url": "https://image.civitai.com/.../cover.jpeg",
        "type": "image",
        "width": 1200,
        "height": 800,
        "nsfwLevel": 1
      },
      "coverImageUrl": "https://image.civitai.com/.../cover.jpeg",
      "user": { "id": 4021, "username": "some-curator" }
    }
  ],
  "metadata": {
    "nextCursor": 1180,
    "nextPage": "https://civitai.com/api/v1/collections?limit=100&cursor=1180"
  }
}
```

- `itemCount` counts only **accepted** items in the collection.
- `mode` is `Contest`, `Bookmark`, or `null` for an ordinary collection.
- `nsfwLevel` is the collection's rating, not the cover's: the cover's own rating
  is `coverImage.nsfwLevel`.
- `coverImage` is the cover's image `id`, a ready-to-use CDN `url`, its media
  `type` (`image` or `video`), its original `width` and `height` (each `null` when
  unknown) and its `nsfwLevel`. It is `null` when the collection has no cover or
  the cover may not be shown publicly, for example because it is unrated, awaiting
  review, or above the request's browsing ceiling (the `nsfw` param and region).
- `coverImageUrl` is `coverImage.url`, or `null` when `coverImage` is `null`.
- `metadata.nextCursor` / `metadata.nextPage` are omitted on the last page.

### Example

```bash
curl "https://civitai.com/api/v1/collections?limit=5&query=anime&sort=Newest"
```

<ApiTry path="/api/v1/collections" :query="{ limit: 5, query: 'anime', sort: 'Newest' }" />

## Get a collection

```
GET /api/v1/collections/{id}
```

**Auth:** Public.

### Path parameters

| Name | Type | Description |
|------|------|-------------|
| `id` | integer (1–2147483647) | Collection ID. |

### Response

```json
{
  "id": 1201,
  "name": "Favorite anime LoRAs",
  "description": "A running list of the best anime LoRAs.",
  "type": "Model",
  "mode": null,
  "nsfwLevel": 1,
  "read": "Public",
  "isPublic": true,
  "coverImage": {
    "id": 501,
    "url": "https://image.civitai.com/.../cover.jpeg",
    "type": "image",
    "width": 1200,
    "height": 800,
    "nsfwLevel": 1
  },
  "coverImageUrl": "https://image.civitai.com/.../cover.jpeg",
  "user": { "id": 4021, "username": "some-curator" },
  "tags": [ { "id": 5, "name": "anime" } ]
}
```

`mode`, `coverImage` and `coverImageUrl` are as in [the list](#list-collections).
Detail has no `nsfw` param: its cover ceiling is PG, or PG/PG-13 in a restricted
region.

Returns `404` if the collection doesn't exist **or** is private (the two cases
are indistinguishable):

```json
{ "error": "No collection with id 0" }
```

### Example

```bash
curl "https://civitai.com/api/v1/collections/104"
```

<ApiTry path="/api/v1/collections/104" />
