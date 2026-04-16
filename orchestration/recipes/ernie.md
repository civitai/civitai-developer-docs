---
title: ERNIE image generation
---

<script setup>
const standardBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'comfy',
      ecosystem: 'ernie',
      model: 'ernie',
      operation: 'createImage',
      prompt: 'A red panda wearing a yellow rain jacket, cinematic soft light, highly detailed',
      width: 1024, height: 1024,
      steps: 20, cfgScale: 4,
      sampler: 'euler', scheduler: 'simple',
      quantity: 1,
    },
  }],
};

const standardPortraitBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'comfy',
      ecosystem: 'ernie',
      model: 'ernie',
      operation: 'createImage',
      prompt: 'Portrait of a woman with flowing hair standing in a blooming cherry blossom field, golden hour lighting',
      negativePrompt: 'worst quality, blurry, low resolution',
      width: 832, height: 1216,
      steps: 20, cfgScale: 4,
      sampler: 'euler', scheduler: 'simple',
      seed: 42,
    },
  }],
};

const turboBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'comfy',
      ecosystem: 'ernie',
      model: 'turbo',
      operation: 'createImage',
      prompt: 'A red panda wearing a yellow rain jacket, cinematic soft light, highly detailed',
      width: 1024, height: 1024,
      steps: 8, cfgScale: 1,
      sampler: 'euler', scheduler: 'simple',
      quantity: 1,
    },
  }],
};

</script>

# ERNIE image generation

Baidu's ERNIE Image is a distillation-friendly text-to-image family hosted on Civitai's Comfy workers. Single engine path, one operation (`createImage` — no img2img, variant, or edit support), two model variants that differ only in speed vs. quality:

- `engine: "comfy"`, `ecosystem: "ernie"`
- **Only `createImage`** — ERNIE doesn't expose `createVariant` or `editImage`. Use [Flux 2 Klein](./flux2#klein-createvariant-img2img) or [Qwen](./qwen) if you need img2img or prompt-driven editing.
- Built-in diffuser, VAE, and text encoder — no `model` URN to pick. The only `model` field is the variant selector (`ernie` or `turbo`).
- LoRA support (ERNIE-tagged LoRAs only).

## Variants

| `model` | Steps (default) | `cfgScale` (default) | Best for |
|---------|-----------------|----------------------|----------|
| `ernie` | `20` | `4` | **Default** — full-quality output, standard sampling |
| `turbo` | `8` | `1` | Distilled for speed — 3–4× faster and ~⅓ the Buzz per image; use for drafts, batches, and iteration |

Leave `cfgScale: 1` on `turbo` — it's a distilled model and doesn't respond to classifier-free guidance the way the standard variant does.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- No checkpoint URN required — both variants ship with built-in diffuser / VAE / text encoder

## Standard (`model: "ernie"`)

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "comfy",
      "ecosystem": "ernie",
      "model": "ernie",
      "operation": "createImage",
      "prompt": "A red panda wearing a yellow rain jacket, cinematic soft light, highly detailed",
      "width": 1024,
      "height": 1024,
      "steps": 20,
      "cfgScale": 4,
      "sampler": "euler",
      "scheduler": "simple",
      "quantity": 1
    }
  }]
}
```

<RecipeRun :body="standardBody" :wait="60" />

### Parameters

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `prompt` | — ✅ | ≤ 10 000 chars | Natural-language descriptions work well; ERNIE handles complex scenes better than tag-soup. |
| `negativePrompt` | *(none)* | ≤ 10 000 chars | Optional. Shorter is usually better — ERNIE's defaults are already clean. |
| `width` / `height` | `1024` | `64`–`2048`, divisible by 16 | Trained around 1024². Well-behaved near ~1 megapixel total. |
| `steps` | `20` | `1`–`150` | Diminishing returns past ~25. |
| `cfgScale` | `4` | `0`–`30` | `3`–`5` is the sweet spot. |
| `sampler` | `euler` | enum | [`ComfySampler`](/orchestration/reference/). `euler` is what the model was tuned against. |
| `scheduler` | `simple` | enum | [`ComfyScheduler`](/orchestration/reference/). |
| `loras` | `{}` | `{ airUrn: strength }` | Stack multiple. Only `urn:air:ernie:lora:...` LoRAs work here. |
| `quantity` | `1` | `1`–`12` | Number of images per call. |
| `seed` | random | int64 | Pin for reproducibility. |

### Portrait aspect ratio

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "comfy",
      "ecosystem": "ernie",
      "model": "ernie",
      "operation": "createImage",
      "prompt": "Portrait of a woman with flowing hair standing in a blooming cherry blossom field, golden hour lighting",
      "negativePrompt": "worst quality, blurry, low resolution",
      "width": 832,
      "height": 1216,
      "steps": 20,
      "cfgScale": 4,
      "sampler": "euler",
      "scheduler": "simple",
      "seed": 42
    }
  }]
}
```

<RecipeRun :body="standardPortraitBody" :wait="60" />

## Turbo (`model: "turbo"`)

Distilled variant — same input surface as standard, just lower defaults for `steps` and `cfgScale`. Use this as the default when you're iterating on prompts or generating batches; fall back to `ernie` for hero shots.

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "comfy",
      "ecosystem": "ernie",
      "model": "turbo",
      "operation": "createImage",
      "prompt": "A red panda wearing a yellow rain jacket, cinematic soft light, highly detailed",
      "width": 1024,
      "height": 1024,
      "steps": 8,
      "cfgScale": 1,
      "sampler": "euler",
      "scheduler": "simple",
      "quantity": 1
    }
  }]
}
```

<RecipeRun :body="turboBody" :wait="60" />

Turbo-specific tuning:

| Field | Default | Notes |
|-------|---------|-------|
| `steps` | `8` | Stay in `6`–`12`. Pushing past `~16` wastes Buzz without improving output on the distilled model. |
| `cfgScale` | `1` | Distilled — leave at `1`. Raising it usually over-saturates / burns the output. |

Everything else (`prompt`, `negativePrompt`, dimensions, `sampler`, `scheduler`, `seed`, `quantity`, `loras`) matches the standard variant.

## Reading the result

ERNIE emits the standard `imageGen` output — an `images[]` array, one entry per `quantity`:

```json
{
  "status": "succeeded",
  "steps": [{
    "$type": "imageGen",
    "name": "$0",
    "status": "succeeded",
    "output": {
      "images": [
        {
          "id": "aa6e7228-68cd-4d15-b4d7-5005b2bfbac6-0.jpg",
          "width": 1024,
          "height": 1024,
          "url": "https://orchestration.civitai.com/v2/consumer/blobs/…?sig=…",
          "urlExpiresAt": "2027-04-15T17:18:54.3195353Z",
          "previewUrl": "https://orchestration.civitai.com/v2/consumer/blobs/…?sig=…",
          "previewUrlExpiresAt": "2027-04-15T17:18:54.3196735Z",
          "available": true,
          "nsfwLevel": "pg13"
        }
      ],
      "errors": []
    }
  }]
}
```

`url` and `previewUrl` are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL. The `nsfwLevel` field carries the moderation classification applied to the output.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Per-pixel + per-step scaling against 1024² and the variant's default step count:

**Standard** (`ComfyErnieStandardCreateImageGenInput.CalculateCost`):

```
total = 20 × (width × height / 1024²) × (steps / 20) × quantity
```

**Turbo** (`ComfyErnieTurboCreateImageGenInput.CalculateCost`):

```
total = 8 × (width × height / 1024²) × (steps / 8) × quantity
```

| Shape | Standard (Buzz) | Turbo (Buzz) |
|-------|-----------------|--------------|
| 1024² / default steps / `quantity: 1` (defaults) | **20** | **8** |
| 832×1216 / default steps / `quantity: 1` | ~20 | ~8 |
| 1024² / default steps / `quantity: 4` | ~80 | ~32 |
| 1024² / `steps: 40` (standard) / `steps: 16` (turbo) | ~40 | ~16 |

Standard pricing is ~2.5× turbo at defaults — reach for turbo when iterating on prompts.

## Runtime

Claim duration (`job.startedAt` → `job.completedAt`) measured against `orchestration-next` with `quantity: 1`:

| Variant | Shape | Claim duration |
|---------|-------|----------------|
| `ernie` (standard) | 1024² / 20 steps | ~29 s |
| `ernie` (standard) | 832×1216 / 20 steps | ~27 s |
| `turbo` | 1024² / 8 steps | ~13 s |

`wait=60` covers single-image calls comfortably. For `quantity > 1`, larger dimensions, or high `steps` counts, compute + queue wait typically runs past the 60 s long-poll ceiling — submit with `wait=60` and re-issue `GET /v2/consumer/workflows/{id}?wait=60` on a loop until the response is terminal (see [Submitting work → Waiting for results](/orchestration/guide/submitting-work#waiting-for-results)), or register a webhook.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "No derived type found for discriminator value 'ernie'" on `ecosystem` | ERNIE not yet rolled out to the environment you're hitting | Confirm the target orchestrator lists `ernie` in `/openapi/v2-consumers.json` → `ComfyImageGenInput` `ecosystem` enum. Retry after rollout. |
| `400` with "operation must be createImage" | Passed `editImage` or `createVariant` | ERNIE only supports `createImage`. Use [Qwen](./qwen) or [Flux 2 Klein](./flux2#klein-createvariant-img2img) for img2img / edit. |
| `400` on `model` | Sent a full AIR URN or a value other than `ernie` / `turbo` | The `model` field is a variant selector, not a checkpoint URN. Only `"ernie"` and `"turbo"` are valid. |
| `400` on `width` / `height` | Value not divisible by 16, or outside `64`–`2048` | Round to a valid multiple of 16 inside that range. |
| Turbo output looks over-saturated / blown out | `cfgScale > 1` on the distilled model | Set `cfgScale: 1` for turbo. Raise `steps` instead if you want more fidelity. |
| Standard output ignores the prompt | `cfgScale` too low | Bump toward `4`–`6`. `cfgScale: 1` on standard barely steers the model. |
| LoRA silently has no effect | Wrong AIR URN, or ecosystem mismatch | Only `urn:air:ernie:lora:…` LoRAs work here. Verify the URN on the LoRA's Civitai page. |
| Request timed out (`wait` expired) | Large `quantity`, atypical dimensions, or high `steps` | Resubmit and resume with a `GET …?wait=60` loop, or register a webhook. |
| Step `failed`, `reason = "blocked"` | Prompt hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Qwen image generation](./qwen) — alternative with edit + variant operations and LoRA support
- [Flux 2 image generation](./flux2) — higher-fidelity general-purpose alternative with `createVariant`
- [Z-Image generation](./zimage) — the other distilled, extremely cheap + fast image recipe (sdcpp-based)
- [Anima image generation](./anima) — anime-tuned sdcpp ecosystem, same single-operation shape
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: `ComfyErnieStandardCreateImageGenInput` and `ComfyErnieTurboCreateImageGenInput` in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface; import into Postman / OpenAPI Generator
