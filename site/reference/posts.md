---
title: Posts
description: Fetch a published Civitai post with its title, description, tags, and images.
---

# Posts

A **post** groups the images (and videos) an uploader published together, with
an optional title and description. To list the images of a post with paging,
use [`GET /images?postId=`](./images).

::: tip Public, edge-cached, rate-limited
This endpoint is **public**. It always evaluates the request as anonymous, so a
token is *optional* and never changes the data you get back (the result is a
pure function of the URL + your region). Anonymous responses are edge-cached
(`public, s-maxage=300, stale-while-revalidate=150`); a request that sends a
token is served uncached. Requests are **rate-limited** per IP, or per user when
a token is sent; on a `429` respect the `Retry-After` header.
:::

## Get a post

```
GET /api/v1/posts/{id}
```

**Auth:** Public.

### Path parameters

| Name | Type | Description |
|------|------|-------------|
| `id` | integer (1–2147483647) | Post ID. |

### Response

Key fields shown; each entry in `images` carries every field of an
[`/images`](./images) item.

```json
{
  "id": 1981754,
  "title": "Autumn portraits",
  "detail": "<p>A few portraits from this week.</p>",
  "nsfwLevel": 1,
  "publishedAt": "2025-04-17T21:28:57.225Z",
  "modelVersionId": 345685,
  "user": { "id": 4021, "username": "some-creator" },
  "tags": [{ "id": 5133, "name": "portrait" }],
  "images": [
    {
      "id": 9173928,
      "url": "https://image.civitai.com/.../cc242d6c-f960-4274-aa1d-f22a71e705ef.jpeg",
      "type": "image",
      "nsfwLevel": "None",
      "browsingLevel": 1,
      "postId": 1981754,
      "thumbnail": null,
      "meta": null
    }
  ]
}
```

### Field notes

- `title` and `detail` can be `null`. `detail` is HTML.
- `nsfwLevel` is the post's **bitmask** (the combined levels of its images),
  not the string form used on image items.
- `modelVersionId` is the model version the post was published to, or `null`
  if there is none or that version is not published.
- `images` are in the order the uploader arranged them. Each item has the same
  shape as an item from [`GET /images`](./images), including `thumbnail` for
  videos, with `meta` always `null`; use `/images?postId=` with
  `withMeta=true` for generation data.
- `images` holds the first 100 entries in post order, with no cursor. Use
  `/images?postId=` to page through a larger post.
- An image above the browsing level served to your region, or one not yet
  scanned, is left out of `images` rather than returned, so `images` can be
  empty.

### Errors

| Status | When |
|--------|------|
| `400` | `id` is not a positive integer. |
| `404` | The post doesn't exist, isn't published yet, is private or in early access, or hasn't finished moderation scanning (or was blocked). In a restricted region, a post with any mature content is also a `404`. These cases are indistinguishable: `{ "error": "Post not found" }`. |
| `429` | Rate limit exceeded. Retry after the `Retry-After` header. |
| `503` | The server is busy. Retry after the `Retry-After` header. |

### Example

```bash
curl "https://civitai.com/api/v1/posts/1981754"
```

<ApiTry path="/api/v1/posts/1981754" />
