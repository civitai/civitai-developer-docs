---
title: Creators
description: List Civitai creators.
---

# Creators

Creators are users who have published at least one model on Civitai.

## List creators

```
GET /api/v1/creators
```

**Auth:** Public.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer (1–200) | 20 | Number of items per page. |
| `page` | integer (≥ 1) | 1 | 1-indexed page number. |
| `query` | string | — | Full-text search on username. |

Pagination is page-based only — there is no `cursor` parameter on this
endpoint.

### Response

```json
{
  "items": [
    {
      "username": "JustMaier",
      "modelCount": 3,
      "link": "https://civitai.com/api/v1/models?username=JustMaier",
      "image": "https://image.civitai.com/.../JustMaier.jpeg"
    }
  ],
  "metadata": {
    "totalItems": 84916,
    "currentPage": 1,
    "pageSize": 1,
    "totalPages": 84916,
    "nextPage": "https://civitai.com/api/v1/creators?limit=1&page=2"
  }
}
```

### Field notes

- `link` is pre-built — follow it to list a creator's models via
  [`GET /models`](./models#list-models).
- `modelCount` is only included when greater than zero; creators with no
  published models are excluded from the listing entirely.
- `image` is null when the creator has no avatar.
- When a `query` is supplied, `metadata.totalItems` and `metadata.totalPages`
  are **lower bounds**, not exact counts. They grow monotonically as you page
  and are exact only once you reach the final page. Treat the presence of
  `metadata.nextPage` as the authoritative "another page exists" signal rather
  than comparing `currentPage` against `totalPages`. The unfiltered listing (no
  `query`) still returns an exact `totalItems`/`totalPages`.

### Notes

- For very deep traversals, scope with `?query=` rather than paging linearly —
  the listing is sorted alphabetically by username, so `query=A`, `query=B`,
  ... is a reliable way to walk the full set. Page within each `query` by
  following `metadata.nextPage` until it is absent (on the search path the total
  counts are lower bounds — see the note above).

### Examples

```bash
# First page
curl "https://civitai.com/api/v1/creators?limit=20"

# Find a specific creator
curl "https://civitai.com/api/v1/creators?query=JustMaier"
```

<ApiTry path="/api/v1/creators" :query="{ limit: 20 }" />
