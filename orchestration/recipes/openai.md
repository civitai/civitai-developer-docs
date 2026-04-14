---
title: OpenAI image generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const gpt15Body = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'openai', model: 'gpt-image-1.5', operation: 'createImage',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      size: '1024x1024', quantity: 1, quality: 'high',
    },
  }],
};

const gpt15EditBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'openai', model: 'gpt-image-1.5', operation: 'editImage',
      prompt: 'Make it a winter scene with snow falling',
      size: '1024x1024',
      images: [sampleImage],
    },
  }],
};

const gpt1TransparentBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'openai', model: 'gpt-image-1', operation: 'createImage',
      prompt: 'A stylized logo mark for a coffee brand, simple vector illustration',
      size: '1024x1024', quantity: 1,
      background: 'transparent',
      quality: 'high',
    },
  }],
};

const dalle3Body = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'openai', model: 'dall-e-3', operation: 'createImage',
      prompt: 'A majestic fantasy landscape with floating islands',
      size: '1024x1024',
      style: 'vivid', quality: 'hd',
    },
  }],
};

const dalle2Body = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'openai', model: 'dall-e-2', operation: 'createImage',
      prompt: 'A vintage postcard illustration of a mountain town',
      size: '512x512', quantity: 1,
    },
  }],
};
</script>

# OpenAI image generation

The orchestrator routes OpenAI image requests to OpenAI's hosted APIs via the `imageGen` step. Four models, each with its own behaviour and quality tier:

| `model` | Operations | Notes |
|---------|------------|-------|
| `gpt-image-1.5` | `createImage` / `editImage` | **Default** — latest GPT-Image model. `createImage` + `editImage`, 4 images max, quality + background controls. |
| `gpt-image-1` | `createImage` / `editImage` | Previous-gen GPT-Image. Up to 10 images per call. Supports `background: "transparent"`. |
| `dall-e-3` | `createImage` only | Stand-alone `natural` vs `vivid` style control, `standard` / `hd` quality, up to 1792 px. |
| `dall-e-2` | `createImage` / `editImage` | Legacy. Only supports square outputs (256² / 512² / 1024²) and 1000-char prompts. Use only for compatibility reasons. |

**Default choice for new integrations**: `model: "gpt-image-1.5"`. It's OpenAI's current flagship and the drop-in for most workloads. Drop to `gpt-image-1` only if you need transparent backgrounds or `quantity > 4`; use `dall-e-3` for the style-controlled vivid output; avoid `dall-e-2` unless you specifically need it.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- For `editImage`: one or more source image URLs, data URLs, or Base64 strings

## gpt-image-1.5 (default)

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "openai",
      "model": "gpt-image-1.5",
      "operation": "createImage",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "size": "1024x1024",
      "quantity": 1,
      "quality": "high"
    }
  }]
}
```

<RecipeRun :body="gpt15Body" :wait="60" />

### Parameters

| Field | Default | Allowed | Notes |
|-------|---------|---------|-------|
| `prompt` | — ✅ | ≤ 32 000 chars | Natural-language works best. |
| `size` | `1024x1024` | `1024x1024` / `1536x1024` / `1024x1536` | Exact pixel dimensions as a string, not width/height. |
| `quantity` | `1` | `1`–`4` | Lower cap than `gpt-image-1` (which allows up to 10). |
| `background` | `auto` | `auto` / `transparent` / `opaque` | Transparent backgrounds require PNG-compatible output. |
| `quality` | `high` | `low` / `medium` / `high` | 1.5 doesn't expose `auto`; pick one explicitly. |

### Editing (`editImage`)

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "openai",
      "model": "gpt-image-1.5",
      "operation": "editImage",
      "prompt": "Make it a winter scene with snow falling",
      "size": "1024x1024",
      "images": [
        "https://image.civitai.com/.../source.jpeg"
      ]
    }
  }]
}
```

<RecipeRun :body="gpt15EditBody" :wait="60" />

Pass one or more source images in `images[]`. The Edit shape also accepts a `mask` (string URL/DataURL/Base64) if you want to inpaint a specific region.

## gpt-image-1 (previous flagship, transparent backgrounds)

Same shape as `gpt-image-1.5` but older weights. Reach for it when you need:

- `quantity > 4` (up to 10)
- `background: "transparent"` (1.5 also supports it but older clients may already be wired for 1)
- `quality: "auto"`

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "openai",
      "model": "gpt-image-1",
      "operation": "createImage",
      "prompt": "A stylized logo mark for a coffee brand, simple vector illustration",
      "size": "1024x1024",
      "quantity": 1,
      "background": "transparent",
      "quality": "high"
    }
  }]
}
```

<RecipeRun :body="gpt1TransparentBody" :wait="60" />

`size`, `background`, `images[]`, and `mask` work exactly like 1.5; the only difference is `quantity` goes up to 10 and `quality` accepts `auto` as a fifth option.

## dall-e-3 (style-controlled, `natural` vs `vivid`)

`dall-e-3` is create-only and exposes a style dimension the GPT-Image models don't:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "openai",
      "model": "dall-e-3",
      "operation": "createImage",
      "prompt": "A majestic fantasy landscape with floating islands",
      "size": "1024x1024",
      "style": "vivid",
      "quality": "hd"
    }
  }]
}
```

<RecipeRun :body="dalle3Body" :wait="60" />

| Field | Default | Allowed | Notes |
|-------|---------|---------|-------|
| `prompt` | — ✅ | ≤ 4 000 chars | DALL·E 3 silently rewrites short/vague prompts — write verbose directives for control. |
| `size` | — ✅ | `1024x1024` / `1792x1024` / `1024x1792` | Required field on DALL·E 3 (unlike GPT-Image, which has a default). |
| `style` | `vivid` | `natural` / `vivid` | `vivid` pushes hyper-real colours; `natural` stays closer to the prompt. |
| `quality` | `auto` | `auto` / `standard` / `hd` | All quality tiers cost the same Buzz (300 flat per image); `hd` increases runtime only. |

DALL·E 3 doesn't support `editImage` or multiple samples — `quantity` isn't on the schema.

## dall-e-2 (legacy)

Only include for legacy compatibility. Prompt ≤ 1000 chars, square outputs only, and much lower output quality than newer models:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "openai",
      "model": "dall-e-2",
      "operation": "createImage",
      "prompt": "A vintage postcard illustration of a mountain town",
      "size": "512x512",
      "quantity": 1
    }
  }]
}
```

<RecipeRun :body="dalle2Body" :wait="60" />

| Field | Allowed | Notes |
|-------|---------|-------|
| `size` | `256x256` / `512x512` / `1024x1024` | Square only. |
| `prompt` | ≤ 1000 chars | Much tighter than newer models. |
| `quantity` | `1`–`10` | |

Supports `editImage` with `image` (a single source string, not an array), but honestly — use GPT-Image 1 or 1.5 unless you have a reason not to.

## Reading the result

All models emit the standard `imageGen` output:

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

OpenAI's API queue is the dominant factor — Civitai routes your request straight through. Typical wall times:

| Model | Per-image wall time | `wait` recommendation |
|-------|---------------------|-----------------------|
| `dall-e-2` | 3–8 s | `wait=30` fine |
| `dall-e-3` (standard) | 10–20 s | `wait=60` fine |
| `dall-e-3` (hd) | 15–40 s | `wait=60` usually fine |
| `gpt-image-1` / `1.5` | 10–30 s per image | `wait=60` fine for `quantity: 1`; fall back to `wait=0` for batches |

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

OpenAI routing bills at a flat per-image price scaled by `quantity`:

```
total = base × quantity
```

| Model | `quality` | Base (Buzz per image) |
|-------|-----------|-----------------------|
| `gpt-image-1.5` | `low` | **25** |
| `gpt-image-1.5` | `medium` | **100** |
| `gpt-image-1.5` | `high` (default) | **375** |
| `gpt-image-1` | `low` | 25 |
| `gpt-image-1` | `medium` | 100 |
| `gpt-image-1` | `high` | 375 |
| `gpt-image-1` | `auto` | 300 |
| `dall-e-3` / `dall-e-2` | *(any)* | 300 |

Examples:
- `gpt-image-1.5` `high`, `quantity: 1` → **~375 Buzz**
- `gpt-image-1.5` `medium`, `quantity: 4` → **~400 Buzz**
- `dall-e-3` `hd`, `quantity: 1` → **~300 Buzz**
- `gpt-image-1.5` `low`, `quantity: 1` → **~25 Buzz** (cheapest drafting tier)

The `size`, `background`, and `style` fields don't change the Buzz price — only `quality` (on GPT-Image) and `quantity` do.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "size must be one of" | Sent `1536x1024` to DALL·E 3 (it wants `1792x1024`) or `1792x1024` to GPT-Image | Match the size enum for the model you're using — the tables above list each model's allowed set. |
| `400` with "style is not a valid property" | Sent `style` outside DALL·E 3 | Only DALL·E 3 exposes `style`. |
| `400` with "quantity must be ≤ 4" on `gpt-image-1.5` | Using 1.5 ceilings with 1's quantity expectations | Drop to `quantity: 4` or use `gpt-image-1` (up to 10). |
| `400` with "prompt too long" on `dall-e-2` | DALL·E 2's 1000-char prompt cap | Trim the prompt or move to a newer model. |
| Output is unexpectedly stylised on DALL·E 3 | `style: "vivid"` default | Set `style: "natural"` for closer-to-prompt output. |
| Output is PNG when you wanted JPEG | Transparent backgrounds force PNG | Set `background: "opaque"` if you want JPEG, or leave `outputFormat` unset and accept whatever OpenAI returns. |
| Request timed out (`wait` expired) | Large `quantity` or `hd` on DALL·E 3 during busy periods | Resubmit with `wait=0` and poll. |
| Step `failed`, `reason = "blocked"` | OpenAI's content filter or Civitai moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Google image generation](./google) — alternative commercial tier with Imagen 4 and Nano Banana
- [Gemini image generation](./gemini) — Google's Gemini 2.5 Flash Image direct-API route
- [Flux 2](./flux2) / [Flux 1](./flux1) / [Qwen](./qwen) — open-weights alternatives on Civitai-hosted workers
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: the `OpenAIGpt1CreateImageInput`, `OpenAIGpt1EditImageInput`, `OpenAIGpt15CreateImageInput`, `OpenAIGpt15EditImageInput`, `OpenAIDallE3CreateImageGenInput`, `OpenAIDallE2CreateImageGenInput`, `OpenAIDallE2EditImageInput` schemas in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface
