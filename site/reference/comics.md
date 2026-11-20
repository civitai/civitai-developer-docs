---
title: Comics
description: List published Civitai comics, fetch a comic's chapter list, and read a chapter's pages.
---

# Comics

A **comic** is a series of chapters made of page images, created with Civitai's comic
creator. These endpoints serve the same published comics as the site's public comic reader,
so an app can show comics without the reader downloading them.

::: tip Public, edge-cached, rate-limited
All three endpoints are **public**. They always evaluate the request as anonymous, so a token
is *optional* and never changes the data you get back: the result depends only on the URL and
your region. Responses are edge-cached (`public, s-maxage=300`) and **conservatively
rate-limited**. On a `429`, wait for the time in the `Retry-After` header.

You only ever get what the public reader shows a signed-out visitor:
- Comics are published, not removed, and by creators in good standing.
- Chapters are published, and their pages have finished scanning.
- Mature content appears only with `nsfw=true`, and it is clamped to SFW in restricted regions.
:::

If comics are not available to signed-out visitors on the site, every endpoint here returns
`404`.

::: warning Downloads
Every comic carries `allowDownload`: the creator's choice of whether readers may save it.
Pages are served either way, for reading. **When `allowDownload` is `false`, your app must not
offer to save, export or cache the pages for offline use.**
:::

## Maturity

Each comic, chapter and page has an `nsfwLevel`, a bit flag (1 = PG, 2 = PG-13, 4 = R, 8 = X,
16 = XXX). A comic's level combines all its chapters.

- **Without `nsfw`:** only comics whose every chapter is PG are listed or served, in every
  region. Any other comic is a `404`.
- **With `nsfw=true`:** every level is served, except in a restricted region, where it is
  clamped to PG and PG-13. The response is `private, no-store`, because it depends on your
  region.

A page whose image falls outside your level has `url: null`. It keeps its place in the
chapter.

## List comics

```
GET /api/v1/comics
```

**Auth:** Public.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer (1–50) | 20 | Number of comics per page. |
| `cursor` | string | — | Use `metadata.nextCursor` from the previous response. Cursor-based pagination only. |
| `sort` | `Newest` \| `MostFollowed` \| `MostChapters` | `Newest` | Sort order. `Newest` is by last update. |
| `period` | `Day` \| `Week` \| `Month` \| `Year` \| `AllTime` | — | Only comics updated within the period. |
| `genre` | string | — | A comic genre, e.g. `Fantasy`, `SciFi`, `Mystery`. |
| `username` | string | — | Only this creator's comics. An unknown username returns no items. |
| `nsfw` | boolean | `false` | Include mature comics. See [Maturity](#maturity). |

An invalid parameter returns `400`, as does a `cursor` that is not one this endpoint returned for the same `sort`.

### Response

Envelope: `{ items, metadata: { nextCursor, nextPage } }`. `nextCursor` and `nextPage` are
omitted on the last page.

```json
{
  "items": [
    {
      "id": 4336,
      "name": "The Comic Machine",
      "description": "Technology runs amok.",
      "genre": "SciFi",
      "url": "https://civitai.com/comics/4336/the-comic-machine",
      "nsfwLevel": 1,
      "coverImage": {
        "url": "https://image.civitai.com/.../width=450/145533600.jpeg",
        "nsfwLevel": 1
      },
      "user": { "username": "some-creator" },
      "chapterCount": 1,
      "followerCount": 0,
      "readerCount": 234,
      "updatedAt": "2026-10-21T15:41:03.693Z",
      "allowDownload": true
    }
  ],
  "metadata": {
    "nextCursor": "4336",
    "nextPage": "https://civitai.com/api/v1/comics?limit=20&cursor=4336"
  }
}
```

`coverImage` is `null` when the comic has none, when the cover is above your level, or while the
cover image is still being checked.

### Example

```bash
curl "https://civitai.com/api/v1/comics?limit=5&sort=MostFollowed"
```

<ApiTry path="/api/v1/comics" :query="{ limit: 5, sort: 'MostFollowed' }" />

## Get a comic

```
GET /api/v1/comics/{id}
```

**Auth:** Public.

### Parameters

| Name | In | Type | Description |
|------|----|------|-------------|
| `id` | path | integer | Comic ID. |
| `nsfw` | query | boolean | Include a mature comic. See [Maturity](#maturity). |

### Response

The comic's fields (as in the list, without `genre`, `chapterCount` and `updatedAt`), plus its
published chapters in reading order. Page images are not included; fetch a chapter for those.

```json
{
  "id": 4336,
  "name": "The Comic Machine",
  "description": "Technology runs amok.",
  "url": "https://civitai.com/comics/4336/the-comic-machine",
  "nsfwLevel": 1,
  "allowDownload": true,
  "coverImage": { "url": "https://image.civitai.com/.../width=450/145533600.jpeg", "nsfwLevel": 1 },
  "user": { "username": "some-creator" },
  "followerCount": 0,
  "readerCount": 234,
  "chapters": [
    {
      "number": 1,
      "name": "Chapter 1",
      "publishedAt": "2026-10-13T10:53:05.931Z",
      "nsfwLevel": 1,
      "pageCount": 12,
      "earlyAccessEndsAt": null,
      "url": "https://civitai.com/comics/4336/the-comic-machine/1/chapter-1"
    }
  ]
}
```

`earlyAccessEndsAt` is set while a chapter is in early access, which is paid access for
supporters before the chapter is free. Its pages are refused until that time.

Returns `404` if the comic doesn't exist, isn't public, or is above your level. The three cases
look the same.

### Example

```bash
curl "https://civitai.com/api/v1/comics/4336"
```

<ApiTry path="/api/v1/comics/4336" />

## Get a chapter's pages

```
GET /api/v1/comics/{id}/chapters/{number}
```

**Auth:** Public.

### Parameters

| Name | In | Type | Description |
|------|----|------|-------------|
| `id` | path | integer | Comic ID. |
| `number` | path | integer | Chapter number as the site shows it, from 1. |
| `nsfw` | query | boolean | Include mature content. See [Maturity](#maturity). |

### Response

```json
{
  "comicId": 4336,
  "series": "The Comic Machine",
  "number": 1,
  "name": "Chapter 1",
  "writer": "some-creator",
  "nsfwLevel": 1,
  "publishedAt": "2026-10-13T10:53:05.931Z",
  "allowDownload": true,
  "url": "https://civitai.com/comics/4336/the-comic-machine/1/chapter-1",
  "pages": [
    {
      "number": 1,
      "url": "https://image.civitai.com/.../width=1600/53689.jpeg",
      "width": 1184,
      "height": 896,
      "nsfwLevel": 1
    }
  ]
}
```

`series`, `name`, `number` and `writer` match the fields a ComicInfo.xml carries. Page
images are served at up to 1600 px wide. `width` and `height` are the original image's size.

| Status | When |
|--------|------|
| `200` | The chapter's pages. |
| `403` | The chapter is in early access: `{ "error": "...", "earlyAccessEndsAt": "..." }`. Retry after that time. |
| `404` | The comic or chapter doesn't exist, isn't public, or is above your level. |

### Example

```bash
curl "https://civitai.com/api/v1/comics/4336/chapters/1"
```

<ApiTry path="/api/v1/comics/4336/chapters/1" />
