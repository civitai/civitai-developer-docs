---
title: Pagination
description: Page-based vs. cursor-based pagination on the Civitai site API.
---

# Pagination

Most list endpoints (`/models`, `/images`, `/creators`, `/tags`) support both
page-based and cursor-based pagination. Choose cursor-based for anything
beyond a handful of pages.

## Page-based

```http
GET /api/v1/models?page=1&limit=100
```

- `page` is **1-indexed**.
- `limit` caps at 100 for `/models`, 200 for `/images`, 200 for `/creators`/`/tags`.
- `page * limit` may not exceed **1000**. Beyond that the API returns
  `429 Too Many Requests` with the message
  `"You've requested too many pages, please use cursors instead"`.

Response metadata when paging:

```json
{
  "items": [ ... ],
  "metadata": {
    "totalItems": 84916,
    "currentPage": 1,
    "pageSize": 100,
    "totalPages": 850,
    "nextPage": "https://civitai.com/api/v1/creators?page=2&limit=100"
  }
}
```

Not every endpoint reports `totalItems` / `totalPages` — some report `0` when
an exact count isn't cheap to compute (notably `/tags`). Use `nextPage`, not
the counts, to drive "load more" UIs.

## Cursor-based

```http
GET /api/v1/models?limit=100&cursor=75363|932023|257749
```

- Cursors are **opaque strings** — don't try to parse them. Treat them as tokens.
- Keep calling with `nextCursor` until it's missing from the response.
- Cursor-based pagination is required when using `?query=<text>` (Meilisearch
  full-text search). Combining `page` with `query` returns
  `400 Bad Request`.

Cursor metadata:

```json
{
  "items": [ ... ],
  "metadata": {
    "nextCursor": "75363|932023|257749",
    "nextPage": "https://civitai.com/api/v1/models?limit=100&cursor=..."
  }
}
```

When `nextCursor` is absent or null, you've reached the end.

## When to prefer cursors

- Deep paging (more than ~10 pages at `limit=100`).
- Any query using `?query=...` for full-text search.
- Iterating through the whole catalog — cursors stay correct even as new
  content is added between calls, while page-based traversal can skip or
  duplicate results.

Keep `limit` as large as the endpoint allows (usually 100 or 200) to minimize
round trips.
