---
title: Web scrape
---

<script setup>
const scrapeBody = {
  steps: [{
    $type: 'webScrape',
    input: {
      url: 'https://example.com',
      formats: ['markdown', 'links'],
    },
  }],
};
</script>

# Web scrape

Fetch and render a single web page and get its content back as LLM-ready markdown (and/or raw HTML and links). The orchestrator exposes this via the `webScrape` step, backed by a self-hosted headless-browser scraper, so JavaScript-rendered pages work too.

::: warning
Swap `https://example.com` for the page you actually want to scrape.
:::

## The request shape

Every request is a single `webScrape` step on [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow):

```json
{
  "$type": "webScrape",
  "input": {
    "url": "https://example.com",
    "formats": ["markdown"]
  }
}
```

## Operations

### Scrape

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=30
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "webScrape",
    "input": {
      "url": "https://example.com",
      "formats": ["markdown", "links"]
    }
  }]
}
```

<RecipeRun :body="scrapeBody" />

#### Parameters

| Field | Default | Allowed | Notes |
|---|---|---|---|
| `url` | — ✅ | absolute http(s) URL | The page to scrape. |
| `formats` | `["markdown"]` | `markdown`, `html`, `links` | Which content representations to return. |

## Reading the result

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "webScrape",
    "status": "succeeded",
    "output": {
      "markdown": "Example Domain\n==============\n\nThis domain is for use in...",
      "html": null,
      "links": ["https://iana.org/domains/example"],
      "title": "Example Domain",
      "description": null,
      "statusCode": 200
    }
  }]
}
```

Only the requested `formats` are populated. Very large pages are truncated to keep outputs bounded. Identical scrapes are cached for a while.

To scrape many URLs from a search, combine with [webSearch](/orchestration/recipes/web-search) and a `repeat` step:

```json
{
  "steps": [
    {
      "$type": "webSearch",
      "name": "search",
      "input": { "query": "civitai lora training guide", "limit": 3 }
    },
    {
      "$type": "repeat",
      "input": {
        "for": { "$ref": "search", "path": "output.results", "as": "result" },
        "template": {
          "$type": "webScrape",
          "name": "page",
          "input": { "url": { "$ref": "result", "path": "url" } }
        }
      }
    }
  ]
}
```

## Runtime

| Variant | Per-call wall time | `wait` recommendation |
|---|---|---|
| Static page | 1–5 s | `wait=30` |
| JavaScript-heavy page | 5–20 s | `wait=30` |

For anything past the 100 s request timeout, use webhooks — see [Results & webhooks](/orchestration/guide/results-and-webhooks).

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz).

| Operation | Buzz |
|---|---|
| Scrape | 1 |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Step `failed` with an upstream error | The site blocked the request or timed out | Heavily bot-protected sites can't be scraped by the self-hosted stack — there is no stealth/anti-bot layer. |
| `markdown` empty but `statusCode: 200` | Page renders entirely client-side after load events | Retry; some pages need a moment — or request `html` and parse yourself. |
| `400` on submit | `url` not an absolute http(s) URL | Include the scheme, e.g. `https://`. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Web search](/orchestration/recipes/web-search) — find pages first, optionally scraping every result
- [Chat completion](/orchestration/recipes/chat-completion#server-executed-web-search) — let the model fetch pages itself via `civitai:web_search`
- Full parameter catalog: the `WebScrapeInput` schema in the [API reference](/orchestration/reference/)
