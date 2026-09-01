---
title: Web search
---

<script setup>
const searchBody = {
  steps: [{
    $type: 'webSearch',
    input: {
      query: 'civitai stable diffusion models',
      limit: 3,
    },
  }],
};

const searchScrapedBody = {
  steps: [{
    $type: 'webSearch',
    input: {
      query: 'civitai stable diffusion models',
      limit: 3,
      scrapeFormats: ['markdown'],
    },
  }],
};
</script>

# Web search

Search the web and get back result titles, URLs and descriptions — optionally with each result page's content scraped to markdown in the same call. The orchestrator exposes this via the `webSearch` step, backed by a self-hosted SearXNG instance, with page content rendered by a headless-browser scraper when requested. Use it to ground LLM answers in live web data, verify facts, or feed pages into downstream steps like [webScrape](/orchestration/recipes/web-scrape).

To let a chat model call web search *itself* mid-completion, use the `civitai:web_search` tool on the [chat completion](/orchestration/recipes/chat-completion#server-executed-web-search) step instead.

## The request shape

Every request is a single `webSearch` step on [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow):

```json
{
  "$type": "webSearch",
  "input": {
    "query": "civitai stable diffusion models",
    "limit": 3
  }
}
```

## Operations

### Search

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=30
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "webSearch",
    "input": {
      "query": "civitai stable diffusion models",
      "limit": 3
    }
  }]
}
```

<RecipeRun :body="searchBody" />

### Search with scraped content

Add `scrapeFormats` to also fetch each result page and return its content inline as `markdown`:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "webSearch",
    "input": {
      "query": "civitai stable diffusion models",
      "limit": 3,
      "scrapeFormats": ["markdown"]
    }
  }]
}
```

<RecipeRun :body="searchScrapedBody" />

#### Parameters

| Field | Default | Allowed | Notes |
|---|---|---|---|
| `query` | — ✅ | string | The search query. |
| `limit` | `5` | 1–10 | Maximum number of results. |
| `scrapeFormats` | `null` | `["markdown"]` | When set, each result page is scraped and its content returned inline. Slower — every result costs a page render. |

## Reading the result

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "webSearch",
    "status": "succeeded",
    "output": {
      "results": [
        {
          "url": "https://civitai.com/models",
          "title": "AI Models | Civitai",
          "description": "Browse thousands of free Stable Diffusion models...",
          "markdown": null
        }
      ]
    }
  }]
}
```

`results` is ordered by relevance. `markdown` is only populated when `scrapeFormats` was set. Results can be fed into other steps with `$ref` — e.g. a `repeat` step scraping every hit via `{ "$ref": "search", "path": "output.results", "as": "result" }`.

Identical queries are cached for a while, so repeating the same search is fast and free of extra crawling.

## Runtime

| Variant | Per-call wall time | `wait` recommendation |
|---|---|---|
| Search only | 1–5 s | `wait=30` |
| With `scrapeFormats` | 5–30 s | `wait=60` |

For anything past the 100 s request timeout, use webhooks — see [Results & webhooks](/orchestration/guide/results-and-webhooks).

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz).

| Operation | Buzz |
|---|---|
| Search (with or without `scrapeFormats`) | 1 |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Empty `results` | Query too narrow, or the search backend returned nothing | Rephrase the query; try a higher `limit`. |
| `markdown` is `null` on some results with `scrapeFormats` set | The result page blocked scraping or timed out | Expected for heavily bot-protected sites — use the description, or try [webScrape](/orchestration/recipes/web-scrape) on a different URL. |
| Step stays `queued` | No web-search workers available | Capacity issue — retry later or contact us. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Web scrape](/orchestration/recipes/web-scrape) — fetch a single known URL
- [Chat completion](/orchestration/recipes/chat-completion#server-executed-web-search) — let the model search the web itself via `civitai:web_search`
- Full parameter catalog: the `WebSearchInput` schema in the [API reference](/orchestration/reference/)
