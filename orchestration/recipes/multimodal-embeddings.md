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
      inputs: [{ id: 'query', text: 'a red sports car on a mountain road' }],
    },
  }],
};
</script>

# Multimodal embeddings

Embed text and images into the same vector space with the `multimodalEmbedding` workflow step. Use `wemm-2b` with 256 dimensions to start. The step returns normalized vectors; storing them in a search index is a separate operation. This requires GPU workers with the optional `embeddings` profile enabled.

## The request shape

Submit the step inside a workflow to combine it with other steps. For a standalone synchronous call, `POST /v2/consumer/recipes/multimodalEmbedding` accepts just the `input` object and returns the output object.

```json
{
  "$type": "multimodalEmbedding",
  "name": "embed",
  "input": {
    "model": "wemm-2b",
    "dimensions": 256,
    "inputs": [{ "id": "query", "text": "a red sports car on a mountain road" }]
  }
}
```

## Operations

### Embed a batch

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
      "inputs": [{ "id": "query", "text": "a red sports car on a mountain road" }]
    }
  }]
}
```

<RecipeRun :body="embedBody" />

For an image, replace the text item with `{ "id": "image-1", "imageUrl": "https://example.com/image.jpg" }`. A batch can mix image and text items, with exactly one content field per item.

::: warning
Replace `https://example.com/image.jpg` with a reachable image URL before submitting an image batch.
:::

| Field | Default | Allowed | Notes |
|---|---|---|---|
| `model` | `wemm-2b` | `wemm-2b` | Pinned WeMM 2B checkpoint. |
| `dimensions` | `256` | 64, 128, 256, 512, 1024, 2048 | Match indexed images and queries. |
| `inputs` | Required | 1–128 items | Results preserve input order. |
| `inputs[].id` | Required | Unique nonempty string, at most 128 characters | Returned with each vector. |
| `inputs[].text` | Omitted | Nonempty text, at most 20,000 characters | Must also fit the 8,192-token model context. |
| `inputs[].imageUrl` | Omitted | Absolute HTTP(S) URL | Required when text is absent. |

The workflow's usual priority, timeout, retries, callbacks and idempotency fields apply. Inputs can reference earlier step outputs with `$ref`; later steps can reference `embed` at `output.data` or `output.data[0].embedding`.

## Reading the result

The workflow response contains `steps[].output`:

```json
{
  "model": "wemm-2b",
  "modelRevision": "bbd6cd4bf52cfc6716f752a2df80b2706720bd95",
  "profile": "wemm-2b-bf16-image262144-v1",
  "dimensions": 256,
  "normalized": true,
  "data": [{ "id": "query", "index": 0, "embedding": [0.01, -0.02] }]
}
```

The vector above is shortened for display; each actual vector has exactly `dimensions` values. Values are normalized FP32 JSON numbers. Qdrant can quantize these separately to INT8. Use the same model revision, profile and dimensions for indexed items and queries. No partial vector output is published when a batch fails. Copy completed vectors into your own index for durable storage.

## Runtime

Use `wait=30`, then poll the returned workflow ID if the response is 202. Cold model startup, queueing, image downloads and batch size affect latency. For backfills, use batches of 128 and enough concurrent workflows to keep the available workers busy. No fixed fleet latency is guaranteed.

## Cost

Cost units scale with input count. Preview the current price with `whatif=true` or the widget before submitting; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz). Embeddings use the paid workflow tier.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Validation error | Duplicate IDs, unsupported dimensions, empty batch or both content fields | Use unique IDs, supported dimensions and one content field per item. |
| Batch fails | Unreachable image or text exceeds token context | Check URLs and shorten long text; no partial vectors are returned. |
| Workflow waits without an eligible worker | Embedding profile is not deployed | Enable the matching GPU worker profile. |
| Poor similarity results | Different models or preprocessing profiles | Re-embed items and queries with matching settings. |

## Related

- [Chat completion](/orchestration/recipes/chat-completion)
- [Results and webhooks](/orchestration/guide/results-and-webhooks)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow)
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- Schemas: `MultimodalEmbeddingStepInput`, `MultimodalEmbeddingInput`, `MultimodalEmbeddingStepOutput` in the [API reference](/orchestration/reference/)
