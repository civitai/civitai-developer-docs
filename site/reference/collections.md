---
title: Collections
description: List, search, and fetch public Civitai collections.
---

# Collections

A **collection** is a curated set of resources (models, images, articles,
posts, or 3D models) grouped by a user on Civitai. The list exposes **public**
collections. Detail also accepts an **unlisted** collection when its ID is known.

::: tip Public, edge-cached, rate-limited
Both endpoints are **public** — they work anonymously and always evaluate the
request as anonymous, so a token is *optional* and never changes the data you
get back (the result is a pure function of the URL + your region). Private
collections are unreachable, and a private collection is indistinguishable
from a missing one. Anonymous responses are edge-cached (`public, s-maxage=300`);
requests with credentials are uncached. Requests are **rate-limited**; on a `429`
respect the `Retry-After` header. Mature covers/collections are clamped to
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
      "nsfwLevel": 1,
      "read": "Public",
      "isPublic": true,
      "itemCount": 42,
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
- `coverImageUrl` is a ready-to-use CDN URL (or `null` when there is no viewable
  cover, e.g. a mature cover clamped out in a restricted region).
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
  "coverImageUrl": "https://image.civitai.com/.../cover.jpeg",
  "coverImage": {
    "id": 501,
    "url": "https://image.civitai.com/.../cover.jpeg",
    "type": "image",
    "width": 1200,
    "height": 800,
    "nsfwLevel": 1
  },
  "user": { "id": 4021, "username": "some-curator" },
  "tags": [{ "id": 5, "name": "anime" }]
}
```

- `type` is `Model`, `Article`, `Post`, `Image`, `Model3D`, or `null` for a
  collection without a fixed resource type.
- `mode` is `Contest`, `Bookmark`, or `null` for an ordinary collection.
- `description` is the entered text or `null`; it may contain Markdown.
- `tags` are named collection tags, separate from `type`. A collection may
  have several or none.
- `nsfwLevel` is the collection's aggregate content bucket, **not the cover's
  rating**. Use `coverImage.nsfwLevel` to assess the specific cover.
- `coverImage` is `null` when no eligible cover is available. Otherwise it contains
  the cover's image ID, ready-to-use CDN media URL, media type (`image` or `video`),
  original dimensions (nullable), and its own rating. Only scanned, positively
  rated media without a review, terms-of-service or block flag and within the endpoint's existing
  public/region ceiling are included. Unrated, pending, blocked, or restricted
  covers are omitted from both cover fields.
- `coverImageUrl` remains the same ready-to-use CDN media URL as
  `coverImage.url`, or `null`. The URL format follows the existing media delivery
  convention; a `video` cover is not guaranteed to be a still-image thumbnail.
  Consumers can use `coverImage.type` to choose their media presentation.
- Detail uses the PG public ceiling by default, including on `civitai.red`; it
  does not accept `nsfw`. A restricted region uses the existing PG/PG-13 ceiling.
  Cover metadata does not widen access.

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
