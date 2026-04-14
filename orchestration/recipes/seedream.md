---
title: Seedream image generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const v4Body = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'seedream', version: 'v4',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      width: 1024, height: 1024,
      guidanceScale: 2.5, quantity: 1,
    },
  }],
};

const v5LiteBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'seedream', version: 'v5.0-lite',
      prompt: 'A serene mountain landscape with a crystal clear lake at dawn',
      width: 1536, height: 864,
      guidanceScale: 2.5,
    },
  }],
};

const v45HighResBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'seedream', version: 'v4.5',
      prompt: 'An epic fantasy dragon perched on a mountain peak, highly detailed',
      width: 2048, height: 2048,
      guidanceScale: 2.5,
    },
  }],
};

const v4EditBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'seedream', version: 'v4',
      prompt: 'Make it a winter scene with snow falling',
      width: 1024, height: 1024,
      images: [sampleImage],
    },
  }],
};
</script>

# Seedream image generation

Seedream is ByteDance's image-generation family. Single engine, multiple versions, native high-resolution support up to **4096×4096**, and image editing via `images[]`:

| `version` | Notes |
|-----------|-------|
| `v3` | Earliest version. Compatibility only — prefer `v4.5` or newer. |
| `v4` | Balanced quality and speed; lower cost than `v4.5`. |
| `v4.5` | **Default** — refined v4, better detail. Returned when `version` is omitted. |
| `v5.0-lite` | Latest fast tier — lighter than v4.5 with similar output characteristics for most workloads. |

**Default choice for new integrations**: `version: "v4.5"` (also the API default when the field is omitted). Use `v4` when you want lower cost with slightly less detail; try `v5.0-lite` for faster / cheaper output on the newest release.

Unlike most image engines exposed here, Seedream uses plain `width` / `height` (not an enum) and accepts very large outputs — up to 4096 px per side.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- For image editing: one or more source image URLs, data URLs, or Base64 strings

## Text-to-image

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "seedream",
      "version": "v4",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "width": 1024,
      "height": 1024,
      "guidanceScale": 2.5,
      "quantity": 1
    }
  }]
}
```

<RecipeRun :body="v4Body" :wait="60" />

### Parameters

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `version` | `v4.5` | `v3` / `v4` / `v4.5` / `v5.0-lite` | Optional; defaults to `v4.5`. |
| `prompt` | — ✅ | ≥ 1 char | Natural-language works best. |
| `width` / `height` | `1024` | `256`–`4096` | Plain pixel dimensions. Stay near ~1 MP for native output; push higher only when you need print-size output. |
| `quantity` | `1` | `1`–`12` | |
| `guidanceScale` | `2.5` | `1`–`10` | Lower than SD1/SDXL's 7 — similar range to Flux. |
| `seed` | random | int32 | |
| `enableSafetyChecker` | `false` | boolean | |
| `images[]` | *(none)* | max 10 | Passing `images[]` switches to edit mode. URLs, data URLs, or Base64. |

### Newer version (`v5.0-lite`)

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "seedream",
      "version": "v5.0-lite",
      "prompt": "A serene mountain landscape with a crystal clear lake at dawn",
      "width": 1536,
      "height": 864,
      "guidanceScale": 2.5
    }
  }]
}
```

<RecipeRun :body="v5LiteBody" :wait="60" />

### High-resolution output

Seedream can render up to 4096×4096 natively — useful when you need print-size output without a separate upscaling pass. Expect higher runtime:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "seedream",
      "version": "v4.5",
      "prompt": "An epic fantasy dragon perched on a mountain peak, highly detailed",
      "width": 2048,
      "height": 2048,
      "guidanceScale": 2.5
    }
  }]
}
```

<RecipeRun :body="v45HighResBody" :wait="60" />

Watch for request-timeout behaviour at large dimensions — see [Runtime](#runtime) below.

### Image editing

Drop one or more source images into `images[]` and the same call switches to edit mode — same shape, prompt is treated as the edit instruction:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "seedream",
      "version": "v4",
      "prompt": "Make it a winter scene with snow falling",
      "width": 1024,
      "height": 1024,
      "images": [
        "https://image.civitai.com/.../source.jpeg"
      ]
    }
  }]
}
```

<RecipeRun :body="v4EditBody" :wait="60" />

Up to 10 reference images per call.

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

| Size | Typical wall time | `wait` recommendation |
|------|-------------------|-----------------------|
| ≤ 1024×1024 | 10–25 s | `wait=60` fine |
| 1536×1536 | 20–45 s | `wait=60` often fine; fall back to `wait=0` on busy periods |
| 2048–4096 per side | 40–90+ s | **Use `wait=0` + polling** — you'll usually exceed the 100-second request timeout otherwise |

Combined with `quantity > 2`, high-res outputs cross the timeout quickly. Always poll for anything above ~1.5 megapixels unless you're running a known-fast version.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Flat per-image pricing by `version`:

```
total = base × quantity
```

| Version | Base (per image) |
|---------|------------------|
| `v4.5` | **60** |
| `v5.0-lite` | **52** |
| `v4` / `v3` | **40** |

Examples:
- `v4.5`, 1024², `quantity: 1` → **60 Buzz**
- `v4`, 1024², `quantity: 1` → **40 Buzz**
- `v5.0-lite`, 1024², `quantity: 1` → **52 Buzz**
- `v4.5` at 2048², `quantity: 1` → 60 Buzz *(dimensions don't affect the fixed base)*
- `v4` with 3 reference images, `quantity: 1` → 40 Buzz *(editing uses the same base)*

Dimensions and `images[]` count don't change Seedream's Buzz price — the provider charges per-image-generated, not per-megapixel. If you need 4K output, you pay the same as 1K.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "version must be one of" | Typo or unsupported version slug | Use `v3`, `v4`, `v4.5`, or `v5.0-lite` (note the `v` prefix). |
| `400` with "width/height out of range" | Below 256 or above 4096 | Clamp to `256`–`4096`. |
| `400` with "images maxItems" | More than 10 source images on edit | Trim to 10. |
| Output too saturated / painterly | `guidanceScale` too high | Seedream prefers `2`–`3` — values above 5 typically degrade output. |
| Request timed out (`wait` expired) | High-res output, large quantity, or busy queue | Resubmit with `wait=0` and poll. |
| Step `failed`, `reason = "blocked"` | Seedream content filter | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Google image generation](./google) — commercial alternative with Nano Banana + Imagen 4
- [OpenAI image generation](./openai) — commercial alternative with GPT-Image + DALL·E
- [Flux 2](./flux2) / [Qwen](./qwen) / [SDXL](./sdxl) — open-weights / sdcpp alternatives on Civitai-hosted workers
- [Image upscaling](./image-upscaler) — chain after `imageGen` (Seedream's native 4096 may already cover your upscale needs)
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: the `SeedreamImageGenInput` schema in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface
