---
title: Articles
description: List, search, and fetch Civitai articles.
---

# Articles

An **article** is a long-form post published on Civitai — a guide, workflow
write-up, changelog, or announcement. These endpoints expose the same public
article feed that powers the website.

::: tip Public, edge-cached, rate-limited
Both endpoints are **public** — they work anonymously and always evaluate the
request as anonymous, so a token is *optional* and never changes the data you
get back (the result is a pure function of the URL + your region). Responses are
edge-cached (`public, s-maxage=300`) and **conservatively rate-limited**; on a
`429` respect the `Retry-After` header. Only **published, scanned, non-private**
articles are ever returned; drafts and private articles are invisible (a private
article is indistinguishable from a missing one). Mature content is clamped to
the SFW ceiling in restricted regions regardless of the `nsfw` param.
:::

## List articles

```
GET /api/v1/articles
```

**Auth:** Public.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer (1–100) | 100 | Number of items per page. |
| `cursor` | string | — | Opaque keyset cursor (`"<v>\|<id>"`). Use `metadata.nextCursor` from the previous response. Articles use **cursor-based** pagination only (no `page`). |
| `query` | string | — | Full-text search over the article title. |
| `tags` | comma-separated integers | — | Filter by **tag IDs** (not names), e.g. `tags=5,12`. |
| `username` | string | — | Filter by author username. |
| `sort` | `Newest` \| `Recently Updated` \| `Most Reactions` \| `Most Comments` \| `Most Bookmarks` \| `Most Collected` | `Newest` | Sort order. |
| `nsfw` | boolean | `false` | If `true`, include mature content. Ignored (clamped to SFW) in restricted regions. |

A malformed `cursor` or an invalid param returns `400`.

### Response

Envelope: `{ items, metadata: { nextCursor, nextPage } }`. Each item mirrors the
article feed shape (key fields shown):

```json
{
  "items": [
    {
      "id": 15342,
      "title": "Getting started with ComfyUI",
      "publishedAt": "2025-12-18T09:16:12.062Z",
      "createdAt": "2025-12-17T20:02:00.000Z",
      "updatedAt": "2025-12-18T09:16:12.062Z",
      "nsfwLevel": 1,
      "availability": "Public",
      "status": "Published",
      "stats": {
        "favoriteCount": 812,
        "collectedCount": 240,
        "commentCount": 37,
        "likeCount": 640,
        "heartCount": 210,
        "viewCount": 51200,
        "tippedAmountCount": 1450
      },
      "user": {
        "id": 4021,
        "username": "some-creator",
        "image": "https://image.civitai.com/.../avatar.jpeg"
      },
      "tags": [
        { "id": 5, "name": "comfyui", "isCategory": false }
      ],
      "coverImage": {
        "id": 88213,
        "url": "https://image.civitai.com/.../cover.jpeg",
        "nsfwLevel": 1,
        "width": 1024,
        "height": 1024
      }
    }
  ],
  "metadata": {
    "nextCursor": "1734512172|15320",
    "nextPage": "https://civitai.com/api/v1/articles?limit=100&cursor=1734512172%7C15320"
  }
}
```

`metadata.nextCursor` / `metadata.nextPage` are omitted on the last page.

### Example

```bash
curl "https://civitai.com/api/v1/articles?limit=5&sort=Most%20Reactions&query=comfyui"
```

<ApiTry path="/api/v1/articles" :query="{ limit: 5, sort: 'Most Reactions', query: 'comfyui' }" />

## Get an article

```
GET /api/v1/articles/{id}
```

**Auth:** Public.

### Path parameters

| Name | Type | Description |
|------|------|-------------|
| `id` | integer (1–2147483647) | Article ID. |

### Response

Returns the full article object — the same fields as a list item plus the
article body/content — with the moderator-only `moderatorNsfwLevel` field
stripped and the `coverImage` clamped to the region's public browsing ceiling
(a cover above the ceiling is dropped).

Returns `404` if the article doesn't exist **or** is a draft / unpublished /
private article (the two cases are indistinguishable):

```json
{ "error": "No article with id 0" }
```

### Example

```bash
curl "https://civitai.com/api/v1/articles/4797"
```

<ApiTry path="/api/v1/articles/4797" />
