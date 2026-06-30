---
title: Google image generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const nanoBanana2Body = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'google', model: 'nano-banana-2',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      aspectRatio: '1:1', resolution: '1K', numImages: 1,
    },
  }],
};

const nanoBanana2EditBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'google', model: 'nano-banana-2',
      prompt: 'Make it a winter scene with snow falling',
      aspectRatio: '1:1', resolution: '1K',
      images: [sampleImage],
    },
  }],
};

const nanoBanana2SearchBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'google', model: 'nano-banana-2',
      prompt: 'A realistic photo of the Eiffel Tower at night, with accurate lighting and modern signage',
      aspectRatio: '16:9', resolution: '2K',
      enableWebSearch: true,
    },
  }],
};

const nanoBanana2LiteBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'google', model: 'nano-banana-2-lite',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      aspectRatio: '1:1', numImages: 1,
    },
  }],
};

const nanoBananaProBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'google', model: 'nano-banana-pro',
      prompt: 'A cinematic scene of a dragon perched on a mountain peak at dawn',
      aspectRatio: '21:9', resolution: '2K', numImages: 1,
    },
  }],
};

const imagen4Body = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'google', model: 'imagen4',
      prompt: 'A majestic fantasy landscape with floating islands, cinematic lighting',
      negativePrompt: 'blurry, low quality',
      aspectRatio: '16:9', numImages: 1,
    },
  }],
};
</script>

# Google image generation

Routes to Google's image-generation APIs (Vertex AI / Gemini API). Four models, selected via the `model` field:

| `model` | Also known as | Notes |
|---------|---------------|-------|
| `nano-banana-2` | Gemini 2.5 Flash Image, next-gen | **Default** — text-to-image + image-editing via `images[]`, high-resolution tier (up to 4K), optional web/Google search grounding. |
| `nano-banana-2-lite` | Gemini 3.1 Flash-Lite Image | Cheapest & fastest — text-to-image + image-editing via `images[]`, **1K only**, no search grounding. |
| `nano-banana-pro` | Gemini 2.5 Pro Image | Same shape as `nano-banana-2` for most purposes; pro tier for premium output. |
| `imagen4` | Imagen 4 | Google's dedicated image model (not Gemini-based). Natural-language + negative prompt, fewer aspect ratios, 1K only. |

**Default choice for new integrations**: `model: "nano-banana-2"`. It's fast, capable, supports editing via `images[]`, and has the widest aspect-ratio and resolution range. Step up to `nano-banana-pro` for hero-shot quality; drop down to `nano-banana-2-lite` when speed and cost matter more than the 2K/4K tiers; reach for `imagen4` when you specifically want Google's older Imagen family semantics (negative prompts, stricter aspect-ratio set).

::: tip Gemini vs Google
The `gemini` engine ([Gemini image generation](./gemini)) exposes the same Gemini 2.5 Flash Image product as `model: "2.5-flash"` via the direct Gemini API, with a slightly different input shape. Pick based on which API semantics you prefer — this page covers the `google` engine.
:::

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- For image editing: one or more source image URLs, data URLs, or Base64 strings (Nano Banana only — Imagen 4 is create-only)

## nano-banana-2 (default — Gemini 2.5 Flash Image)

### Text-to-image

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "google",
      "model": "nano-banana-2",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "aspectRatio": "1:1",
      "resolution": "1K",
      "numImages": 1
    }
  }]
}
```

<RecipeRun :body="nanoBanana2Body" :wait="60" />

### Parameters

| Field | Default | Allowed | Notes |
|-------|---------|---------|-------|
| `prompt` | — ✅ | ≤ 50 000 chars | Natural-language, very long prompts permitted. |
| `aspectRatio` | `1:1` | `21:9`, `16:9`, `3:2`, `4:3`, `5:4`, `1:1`, `4:5`, `3:4`, `2:3`, `9:16` | |
| `resolution` | `1K` | `1K` / `2K` / `4K` | Multi-resolution tier — `4K` is slower and more expensive. |
| `numImages` | `1` | `1`–`4` | Nano Banana uses `numImages`, not `quantity`. |
| `images[]` | *(none)* | max 10 | Passing `images[]` switches to edit mode. URLs, data URLs, or Base64. |
| `seed` | random | int32 | Pin for reproducibility. |
| `enableWebSearch` | `false` | boolean | Let the model ground its output in fresh web-search results. |
| `enableGoogleSearch` | `false` | boolean | Let the model ground its output in Google Search results — useful for accurate depictions of real places/people/events. |

### Image editing

Drop one or more source images into `images[]` and the same endpoint switches to edit mode — no separate `operation` field:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "google",
      "model": "nano-banana-2",
      "prompt": "Make it a winter scene with snow falling",
      "aspectRatio": "1:1",
      "resolution": "1K",
      "images": [
        "https://image.civitai.com/.../source.jpeg"
      ]
    }
  }]
}
```

<RecipeRun :body="nanoBanana2EditBody" :wait="60" />

Up to 10 reference images per call. Useful for prompt-driven edits and compositional blends.

### With web-search grounding

`enableWebSearch` / `enableGoogleSearch` let the model pull fresh factual context into its generation. Handy for depicting real locations, current events, or brands accurately:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "google",
      "model": "nano-banana-2",
      "prompt": "A realistic photo of the Eiffel Tower at night, with accurate lighting and modern signage",
      "aspectRatio": "16:9",
      "resolution": "2K",
      "enableWebSearch": true
    }
  }]
}
```

<RecipeRun :body="nanoBanana2SearchBody" :wait="60" />

## nano-banana-2-lite

Google's fastest, cheapest image model (Gemini 3.1 Flash-Lite Image). Same input shape as `nano-banana-2` — text-to-image plus `images[]` editing — but **1K-only** (no `resolution` field) and no web/Google search grounding:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "google",
      "model": "nano-banana-2-lite",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "aspectRatio": "1:1",
      "numImages": 1
    }
  }]
}
```

<RecipeRun :body="nanoBanana2LiteBody" :wait="60" />

| Field | Default | Allowed | Notes |
|-------|---------|---------|-------|
| `prompt` | — ✅ | ≤ 50 000 chars | |
| `aspectRatio` | `1:1` | `21:9`, `16:9`, `3:2`, `4:3`, `5:4`, `1:1`, `4:5`, `3:4`, `2:3`, `9:16` | Same set as `nano-banana-2`. |
| `numImages` | `1` | `1`–`4` | |
| `images[]` | *(none)* | max 10 | Passing `images[]` switches to edit mode. |
| `seed` | random | int | Pin for reproducibility. |

No `resolution` field — outputs are always 1K. No search-grounding toggles.

## nano-banana-pro

Pro-tier version of Nano Banana. Identical input shape minus the search-grounding toggles and `seed`. Reach for it when you want premium output quality on the same API:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "google",
      "model": "nano-banana-pro",
      "prompt": "A cinematic scene of a dragon perched on a mountain peak at dawn",
      "aspectRatio": "21:9",
      "resolution": "2K",
      "numImages": 1
    }
  }]
}
```

<RecipeRun :body="nanoBananaProBody" :wait="60" />

Same aspect-ratio / resolution enums, same `images[]` editing behaviour (up to 10 inputs). Most costly of the three Google models — use for hero shots, not bulk generation.

## imagen4

Google's dedicated Imagen 4 model. Different semantics from Nano Banana — supports `negativePrompt`, stricter aspect-ratio enum, no resolution tiers (implicit 1K), no editing:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "google",
      "model": "imagen4",
      "prompt": "A majestic fantasy landscape with floating islands, cinematic lighting",
      "negativePrompt": "blurry, low quality",
      "aspectRatio": "16:9",
      "numImages": 1
    }
  }]
}
```

<RecipeRun :body="imagen4Body" :wait="60" />

| Field | Default | Allowed | Notes |
|-------|---------|---------|-------|
| `prompt` | — ✅ | ≤ 1 000 chars | Tighter than Nano Banana's 50k. |
| `negativePrompt` | `""` | ≤ 1 000 chars | Imagen-specific — Nano Banana doesn't accept one. |
| `aspectRatio` | `1:1` | `1:1`, `16:9`, `9:16`, `3:4`, `4:3` | Smaller set than Nano Banana. |
| `numImages` | `1` | `1`–`4` | |
| `seed` | random | int64 | |

No editing. No `resolution` picker — outputs are always 1K.

## Reading the result

All Google models emit the standard `imageGen` output:

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

Google's API queue is the dominant factor. Typical wall times:

| Model / resolution | Per-image wall time | `wait` recommendation |
|--------------------|---------------------|-----------------------|
| `nano-banana-2-lite` (1K) | ~4–10 s | `wait=60` fine |
| `imagen4` (1K) | 8–20 s | `wait=60` fine |
| `nano-banana-2` (1K) | 8–20 s | `wait=60` fine |
| `nano-banana-2` (2K / 4K) | 20–60 s | `wait=60` sometimes; fall back to `wait=0` |
| `nano-banana-pro` (any) | 20–60 s depending on queue | `wait=60` sometimes; `wait=0` + polling is safer |

Enable `wait=0` + polling for batches above `numImages: 2`, 4K output, or Pro tier.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Flat per-image pricing by model, `resolution`, and grounding toggles:

```
total = base × numImages
```

| Model | Base (per image) | Notes |
|-------|------------------|-------|
| `nano-banana-2-lite` | **44** | Cheapest Google model; 1K only. |
| `imagen4` | **40** | Fixed; aspect ratio doesn't affect price. |
| `nano-banana-2` (1K) | **104** | Default resolution tier. |
| `nano-banana-2` (2K) | **156** | |
| `nano-banana-2` (4K) | **208** | |
| `nano-banana-pro` (1K, text-only) | **160** | |
| `nano-banana-pro` (1K, with `images[]`) | **180** | Image-to-image carries a small premium. |
| `nano-banana-pro` (2K, text-only) | **230** | |
| `nano-banana-pro` (2K, with `images[]`) | **250** | |
| `nano-banana-pro` (4K, text-only) | **320** | |
| `nano-banana-pro` (4K, with `images[]`) | **340** | |

**Web-search grounding** (Nano Banana 2 only) adds **+20 Buzz per image** for each flag enabled — `enableWebSearch: true` and `enableGoogleSearch: true` stack (so +40 if both on).

Examples:
- `nano-banana-2-lite`, `numImages: 1` → **~44 Buzz**
- `imagen4`, `numImages: 1` → **~40 Buzz**
- `nano-banana-2` 1K, `numImages: 1` → **~104 Buzz**
- `nano-banana-2` 1K + web search, `numImages: 1` → **~124 Buzz**
- `nano-banana-2` 4K, `numImages: 4` → ~832 Buzz
- `nano-banana-pro` 2K text-only, `numImages: 1` → **230 Buzz**; with `images[]` → **250 Buzz**

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with unknown property `quantity` | Sent `quantity` instead of `numImages` | Google uses `numImages`; OpenAI / Flux use `quantity`. Easy to mix up. |
| `400` with "aspectRatio must be one of" on Imagen 4 | Passed a Nano Banana–only ratio like `21:9` or `5:4` | Imagen 4's set is smaller — stick to `1:1`, `16:9`, `9:16`, `3:4`, `4:3`. |
| `400` with "resolution is not a valid property" on Imagen 4 | Imagen 4 has no `resolution` field | Drop it — Imagen 4 is always 1K. |
| `400` with "images is not a valid property" on Imagen 4 | Imagen 4 is create-only | Switch to `nano-banana-2` or `nano-banana-pro` for editing. |
| `400` with "images maxItems" | More than 10 reference images on Nano Banana | Trim to 10. |
| Output seems disconnected from reality (wrong year of events, nonexistent place) | No search grounding | Set `enableWebSearch: true` (or `enableGoogleSearch: true`) on `nano-banana-2`. |
| Request timed out (`wait` expired) | Large `numImages`, 4K resolution, or Pro tier on busy queue | Resubmit with `wait=0` and poll. |
| Step `failed`, `reason = "blocked"` | Google's content filter | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Gemini image generation](./gemini) — Gemini 2.5 Flash Image via the direct Gemini API (alternate routing to Nano Banana)
- [OpenAI image generation](./openai) — alternative commercial tier
- [Flux 2](./flux2) / [Flux 1](./flux1) / [Qwen](./qwen) — open-weights alternatives on Civitai-hosted workers
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: the `Imagen4ImageGenInput`, `NanoBananaProImageGenInput`, `NanoBanana2ImageGenInput`, `NanoBanana2LiteImageGenInput` schemas in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface
