---
title: Multimodal embeddings
---

<script setup>
const embedBody = {
  steps: [{
    $type: 'multimodalEmbedding',
    name: 'embed',
    input: {
      model: 'wemm-2b',
      dimensions: 256,
      text: 'a red sports car on a mountain road',
    },
  }],
};
</script>

# Multimodal embeddings

Embed text, images and videos into the same vector space with the `multimodalEmbedding` workflow step. Use `wemm-2b` with 256 dimensions to start. Each step accepts one input and returns one normalized vector; storing them in a search index is a separate operation. This requires GPU workers with the optional `embeddings` profile enabled.

## The request shape

Submit the step inside a workflow to combine it with other steps. For a standalone synchronous call, `POST /v2/consumer/recipes/multimodalEmbedding` accepts just the `input` object and returns the output object.

```json
{
  "$type": "multimodalEmbedding",
  "name": "embed",
  "input": {
    "model": "wemm-2b",
    "dimensions": 256,
    "text": "a red sports car on a mountain road"
  }
}
```

## Operations

### Embed one input

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=30
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "multimodalEmbedding",
    "name": "embed",
    "input": {
      "model": "wemm-2b",
      "dimensions": 256,
      "text": "a red sports car on a mountain road"
    }
  }]
}
```

<RecipeRun :body="embedBody" />

For an image, replace `text` with `"imageUrl": "https://example.com/image.jpg"`. For a video, use `"videoUrl": "https://example.com/video.mp4"`. Provide exactly one of `text`, `imageUrl` or `videoUrl`; each step produces one embedding.

::: warning
Replace example media URLs with reachable HTTP(S) URLs before submitting.
:::

| Field | Default | Allowed | Notes |
|---|---|---|---|
| `model` | `wemm-2b` | `wemm-2b` | Pinned WeMM 2B checkpoint. |
| `dimensions` | `256` | 64, 128, 256, 512, 1024, 2048 | Match indexed media and queries. |
| `text` | Omitted | Nonempty text, at most 20,000 characters | Must also fit the 8,192-token model context. |
| `imageUrl` | Omitted | Absolute HTTP(S) URL | Image to index or use as a query. |
| `videoUrl` | Omitted | Absolute HTTP(S) URL | Clip to index or use as a query; ≤60 seconds, ≤100 MiB, ≤4096 pixels per side. |

The workflow's usual priority, timeout, retries, callbacks and idempotency fields apply. Inputs can reference earlier step outputs with `$ref`; later steps can reference `embed` at `output.embedding`.

## Video queries

Index a video by embedding its `videoUrl` and storing the returned vector in Qdrant. To search with a video, embed the query clip using the same field and send that vector to your Qdrant query endpoint. No separate query flag is needed. Text and image queries can search the same collection when model revision and dimensions match.

```json
{
  "steps": [{
    "$type": "multimodalEmbedding",
    "name": "embed-query",
    "input": {
      "model": "wemm-2b",
      "dimensions": 256,
      "videoUrl": "https://example.com/query.mp4"
    }
  }]
}
```

The worker samples at a target 2 fps, capped at 16 frames spread across the whole clip, and returns **one vector per clip**. Audio is ignored. This version does not return matching timestamps or separate scene vectors. Long clips must be split before submitting.

## Reading the result

The workflow response contains `steps[].output`:

```json
{
  "model": "wemm-2b",
  "modelRevision": "bbd6cd4bf52cfc6716f752a2df80b2706720bd95",
  "profile": "wemm-2b-bf16-image262144-v1",
  "dimensions": 256,
  "normalized": true,
  "embedding": [0.01, -0.02]
}
```

The vector above is shortened for display; each actual vector has exactly `dimensions` values. Values are normalized FP32 JSON numbers. Qdrant can quantize these separately to INT8. Use the same model revision, profile and dimensions for indexed items and queries. Video inputs also return `videoProfile: "wemm-2b-bf16-video-fps2-frames16-pixels4194304-v1"`; use matching video preprocessing for indexing and video queries. Existing image preprocessing remains unchanged. No vector is published when the job fails. Copy completed vectors into your own index for durable storage.

## Cached results

The output blob is the cache. Identical requests reuse a readable, validated result without another GPU job. The cache key includes the exact text or media URL, model revision, preprocessing profile and dimensions. Media URLs must identify immutable content; use a different URL or version parameter when content changes. This cache does not hash downloaded media bytes. Simultaneous first requests may both compute, and stored blobs follow normal retention. A cache hit retains normal workflow pricing.

The previous `inputs: [...]` request and `output.data[].embedding` response are replaced by one content field and `output.embedding`. Split old batches into individual steps or workflows, and associate results through step names, workflow IDs, `externalId` or metadata.

## Runtime

Use `wait=30`, then poll the returned workflow ID if the response is 202. Cold model startup, queueing, media downloads and input size affect latency. For backfills, submit concurrent single-input steps or workflows. Each worker can admit 64 jobs per GPU, sharing one vLLM instance. Video inference is separately limited to four concurrent requests per instance. No fixed fleet latency is guaranteed.

## Cost

Each step is priced as one input. Preview the current price with `whatif=true` or the widget before submitting; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz). Embeddings use the paid workflow tier.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Validation error | Unsupported dimensions, missing content, an old `inputs` array or multiple content fields | Supply supported dimensions and exactly one of `text`, `imageUrl` or `videoUrl`. |
| Job fails | Unreachable/invalid media, video exceeds limits, or text exceeds token context | Check URLs, split long videos and shorten long text; no vector is returned. |
| Workflow waits without an eligible worker | Embedding profile is not deployed | Enable the matching GPU worker profile with video capability for video jobs. |
| Poor similarity results | Different models or preprocessing profiles | Re-embed items and queries with matching settings. |

## Related

- [Chat completion](/orchestration/recipes/chat-completion)
- [Results and webhooks](/orchestration/guide/results-and-webhooks)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow)
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- Schemas: `MultimodalEmbeddingStepInput`, `MultimodalEmbeddingStepOutput` in the [API reference](/orchestration/reference/)
