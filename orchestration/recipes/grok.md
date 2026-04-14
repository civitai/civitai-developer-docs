---
title: Grok image generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const createBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'grok', operation: 'createImage',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      aspectRatio: '1:1', quantity: 1,
    },
  }],
};

const createWideBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'grok', operation: 'createImage',
      prompt: 'A sweeping cinematic view of a futuristic city skyline at dusk',
      aspectRatio: '20:9', quantity: 1,
    },
  }],
};

const editBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'grok', operation: 'editImage',
      prompt: 'Make it a winter scene with snow falling',
      images: [sampleImage],
    },
  }],
};
</script>

# Grok image generation

Routes to xAI's Grok image API. Two operations — `createImage` and `editImage` — and a wide aspect-ratio menu (including extreme-wide and extreme-tall variants beyond what Google or OpenAI expose).

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- For `editImage`: 1–3 source images (URLs, data URLs, or Base64)

## Text-to-image (`createImage`)

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "grok",
      "operation": "createImage",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "aspectRatio": "1:1",
      "quantity": 1
    }
  }]
}
```

<RecipeRun :body="createBody" :wait="60" />

### Parameters

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `operation` | ✅ | — | `createImage` or `editImage`. |
| `prompt` | ✅ | — | Natural-language. |
| `aspectRatio` | | `1:1` | See the ratio table below. |
| `quantity` | | `1` | `1`–`4`. |

### Aspect ratios

Grok exposes a wider aspect-ratio menu than other commercial engines:

| Category | Ratios |
|----------|--------|
| Ultra-wide | `2:1`, `20:9`, `19.5:9`, `16:9` |
| Landscape | `4:3`, `3:2` |
| Square | `1:1` |
| Portrait | `2:3`, `3:4` |
| Vertical | `9:16`, `9:19.5`, `9:20`, `1:2` |

Useful when you need phone-native vertical ratios (`9:19.5` / `9:20` match modern flagship screens) or cinema-wide output (`2:1`, `20:9`):

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "grok",
      "operation": "createImage",
      "prompt": "A sweeping cinematic view of a futuristic city skyline at dusk",
      "aspectRatio": "20:9",
      "quantity": 1
    }
  }]
}
```

<RecipeRun :body="createWideBody" :wait="60" />

::: warning `21:9` isn't in the enum
Grok's list jumps from `20:9` to `16:9` — `21:9` (the common cinema label) isn't accepted. Use `20:9` as the closest cinematic-wide option.
:::

## Image editing (`editImage`)

Pass 1–3 reference images in `images[]`:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "grok",
      "operation": "editImage",
      "prompt": "Make it a winter scene with snow falling",
      "images": [
        "https://image.civitai.com/.../source.jpeg"
      ]
    }
  }]
}
```

<RecipeRun :body="editBody" :wait="60" />

Edit operations don't take an `aspectRatio` — the output resolution follows the source(s).

## Reading the result

Standard `imageGen` output — an `images[]` array, one per `quantity`:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "imageGen",
    "status": "succeeded",
    "output": {
      "images": [
        { "id": "blob_...", "url": "https://.../signed.png" }
      ]
    }
  }]
}
```

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL.

## Runtime

xAI's API queue is the dominant factor. Typical wall time 10–30 s per image. `wait=60` is comfortable for `quantity ≤ 2`; higher batches or busy periods warrant `wait=0` + polling.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Flat per-image pricing by operation:

```
total = base × quantity
```

| Operation | Base (per image) |
|-----------|------------------|
| `createImage` | **~26** |
| `editImage` | **~29** |

Examples:
- `createImage`, `quantity: 1` → **~26 Buzz**
- `createImage`, `quantity: 4` → ~104 Buzz
- `editImage` with 1 reference, `quantity: 1` → **~29 Buzz**

Aspect ratio and reference count don't affect Grok's Buzz price — the provider charges flat per-image.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "aspectRatio must be one of" | Ratio outside the accepted enum (e.g. `21:9`) | Pick a close equivalent from the table above — `20:9` is the closest cinematic wide. |
| `400` with "images minItems" on edit | Empty `images[]` on `editImage` | Include 1–3 source images. |
| `400` with "images maxItems" | More than 3 source images | Trim to 3. |
| `400` with "quantity must be ≤ 4" | Requested more than 4 in one call | Split into multiple submissions or use a different engine with a higher cap (Flux / OpenAI gpt-image-1 / Seedream go up to 10–12). |
| Request timed out (`wait` expired) | Large `quantity` or busy xAI queue | Resubmit with `wait=0` and poll. |
| Step `failed`, `reason = "blocked"` | xAI content filter | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [OpenAI image generation](./openai) — alternative commercial tier
- [Google image generation](./google) / [Gemini](./gemini) — alternative commercial tier
- [Flux 2](./flux2) / [Qwen](./qwen) / [SDXL](./sdxl) — open-weights / sdcpp alternatives on Civitai-hosted workers
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: the `GrokCreateImageGenInput` and `GrokEditImageGenInput` schemas in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface
