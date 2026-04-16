---
title: Tags
description: List model tags used on Civitai.
---

# Tags

Tags categorize models (and other content) on Civitai. Use this endpoint to
discover what's taggable; use the tag name as `?tag=` on
[`GET /models`](./models#list-models) to filter by it.

## List tags

```
GET /api/v1/tags
```

**Auth:** Public.

### Query parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer (1–200) | 20 | Number of items per page. |
| `page` | integer (≥ 1) | 1 | 1-indexed page number. |
| `query` | string | — | Full-text search on tag name. |

This endpoint is scoped to model tags (`entityType=Model`) — you cannot
fetch image-level tags through it.

### Response

```json
{
  "items": [
    {
      "name": "character",
      "link": "https://civitai.com/api/v1/models?tag=character"
    }
  ],
  "metadata": {
    "totalItems": 0,
    "currentPage": 1,
    "pageSize": 1,
    "totalPages": 1
  }
}
```

### Field notes

- `link` is pre-built — follow it to list models carrying the tag.
- `totalItems` and `totalPages` may be reported as `0` when an exact count
  isn't cheap to compute. Use `items.length` and `nextPage` to drive
  pagination rather than the counts.
- Responses are cached server-side for 60 seconds.

### Example

```bash
# Common model tags
curl "https://civitai.com/api/v1/tags?limit=20"
```

<ApiTry path="/api/v1/tags" :query="{ limit: 20 }" />
