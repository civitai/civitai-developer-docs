---
title: Anima image generation
---

<script setup>
const sdcppT2IBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'anima',
      operation: 'createImage',
      prompt: 'masterpiece, best quality, 1girl, solo, portrait, looking at viewer, cinematic lighting',
      negativePrompt: 'worst quality, low quality, blurry, bad anatomy, deformed hands',
      width: 1024, height: 1024,
      cfgScale: 4, steps: 30,
    },
  }],
};

const sdcppAspectBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'anima',
      operation: 'createImage',
      prompt: 'masterpiece, best quality, cyberpunk anime scene, neon city street at night',
      negativePrompt: 'worst quality, low quality, blurry',
      width: 1344, height: 768,
      cfgScale: 4, steps: 30,
    },
  }],
};

const sdcppLoraBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'anima',
      operation: 'createImage',
      prompt: 'masterpiece, best quality, detailed portrait of a magical girl in a forest',
      negativePrompt: 'worst quality, low quality',
      width: 1024, height: 1024,
      cfgScale: 4, steps: 30,
      loras: {
        'urn:air:anima:lora:civitai:123456@789012': 0.8,
      },
    },
  }],
};
</script>

# Anima image generation

Anima is an anime-focused image generation ecosystem on Civitai's sdcpp workers. Single engine path, one operation (`createImage` — no img2img or edit support), optimized defaults for anime/illustration output:

- `engine: "sdcpp"`, `ecosystem: "anima"`
- **Only `createImage`** — Anima doesn't expose `createVariant` or `editImage`. Use [Flux 2 Klein](./flux2#klein-createvariant-img2img) or [Qwen](./qwen) if you need img2img or prompt-driven editing.
- Higher default `steps` (`30`) and lower default `cfgScale` (`4`) than the SD ecosystems — tuned for anime output
- Supports LoRAs for style/character injection
- No checkpoint URN needed — the ecosystem ships its own model; an optional `diffuserModel` override exists for advanced cases

## Prerequisites

- No checkpoint URN required — Anima uses a built-in diffuser

## Text-to-image

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "anima",
      "operation": "createImage",
      "prompt": "masterpiece, best quality, 1girl, solo, portrait, looking at viewer, cinematic lighting",
      "negativePrompt": "worst quality, low quality, blurry, bad anatomy, deformed hands",
      "width": 1024,
      "height": 1024,
      "cfgScale": 4,
      "steps": 30
    }
  }]
}
```

<RecipeRun :body="sdcppT2IBody" :wait="60" />

### Parameters

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `prompt` | — ✅ | ≤ 10 000 chars | Booru-style tags work best. Lead with quality boosters (`masterpiece, best quality, …`). |
| `negativePrompt` | *(none)* | ≤ 10 000 chars | Recommended. `worst quality, low quality, blurry, bad anatomy, deformed hands` is a solid starting point. |
| `width` / `height` | `1024` | `64`–`2048`, divisible by 16 | Anima is trained around 1024² and well-behaved aspect ratios near that pixel count. |
| `cfgScale` | `4` | `0`–`30` | **Lower than SD1/SDXL's 7.** `3`–`5` is the sweet spot for Anima. |
| `steps` | `30` | `1`–`150` | **Higher than most sdcpp defaults.** `25`–`35` typical. |
| `sampleMethod` | `euler` | enum | [`SdCppSampleMethod`](/orchestration/reference/). |
| `schedule` | `simple` | enum | [`SdCppSchedule`](/orchestration/reference/). |
| `loras` | `{}` | `{ airUrn: strength }` | Stack multiple; `0.6`–`1.0` strengths typical. |
| `diffuserModel` | *(built-in)* | AIR URN | Optional override for the diffuser. The default built-in model is what you want in almost every case. |
| `quantity` | `1` | `1`–`12` | Number of images per call. |
| `seed` | random | int64 | Pin for reproducibility. |

### Aspect-ratio variants

Anima handles non-square aspect ratios well near ~1 megapixel total area — similar guidance to SDXL. Well-behaved dimensions include 1024², 1152×896, 1344×768, 1536×640, and their mirrors.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "anima",
      "operation": "createImage",
      "prompt": "masterpiece, best quality, cyberpunk anime scene, neon city street at night",
      "negativePrompt": "worst quality, low quality, blurry",
      "width": 1344,
      "height": 768,
      "cfgScale": 4,
      "steps": 30
    }
  }]
}
```

<RecipeRun :body="sdcppAspectBody" :wait="60" />

### With LoRAs

Anima LoRAs are a map of AIR URN → strength. Style LoRAs usually sit at `0.6`–`1.0`; character / concept LoRAs often higher:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "anima",
      "operation": "createImage",
      "prompt": "masterpiece, best quality, detailed portrait of a magical girl in a forest",
      "negativePrompt": "worst quality, low quality",
      "width": 1024,
      "height": 1024,
      "cfgScale": 4,
      "steps": 30,
      "loras": {
        "urn:air:anima:lora:civitai:123456@789012": 0.8
      }
    }
  }]
}
```

<RecipeRun :body="sdcppLoraBody" :wait="60" />

Only Anima-tagged LoRAs work on the `anima` ecosystem.

## Reading the result

Standard `imageGen` output: an `images[]` array, one entry per `quantity` ([shape and URL expiry](/orchestration/recipes/#reading-results)).

## Runtime

Typical wall time per 1024×1024 image is 10–25 s. `wait=60` works comfortably for `quantity ≤ 2`. Higher `steps` counts and larger dimensions compound runtime; submit with `wait=0` and poll for large batches or atypical aspect ratios.

## Cost

Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

Per-pixel + per-step scaling against 1024² / 25 steps:

```
total = 8 × (width × height / 1024²) × (steps / 25) × quantity
```

| Shape | Buzz |
|-------|------|
| 1024²/`steps: 30`/`quantity: 1` (defaults) | **~9.6** |
| 1024²/`steps: 30`/`quantity: 4` | ~38 |
| 1344×768/`steps: 30` | ~7.5 × 1.2 ≈ **~9** |
| 1024²/`steps: 40` | ~12.8 |

## Troubleshooting

Timeouts, moderation blocks and expired blob URLs: see [Common troubleshooting](/orchestration/recipes/#common-troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "operation must be createImage" | Passed `editImage` or `createVariant` | Anima only supports `createImage`. Use [Qwen](./qwen) or [Flux 2 Klein](./flux2#klein-createvariant-img2img) for img2img / edit on anime-style inputs. |
| `400` with "ecosystem must be anima" | Typo | Lowercase `"anima"`. |
| `400` with "model is not a valid property" | Sent `model` field | Anima has no checkpoint picker — delete the field, or if overriding, use `diffuserModel` instead. |
| Output looks flat or off-style | `cfgScale: 7` (SD default) on Anima | Drop to `cfgScale: 4`. Anima wants lower guidance than SD1/SDXL. |
| Output underbakes | `steps` too low for the prompt complexity | Bump to `steps: 30`–`40`. Anima's default is already `30` — don't go much below `20`. |
| LoRA has no effect | Wrong AIR URN, model private / not published, or ecosystem mismatch | Verify the URN on the LoRA's Civitai page; only Anima-tagged LoRAs work on the `anima` ecosystem. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Qwen image generation](./qwen) — alternative with edit + variant operations and LoRA support
- [SDXL image generation](./sdxl) — higher-fidelity general-purpose alternative
- [Flux 2](./flux2) / [Flux 1](./flux1) image generation — newer open-weights families
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: the `AnimaCreateImageGenInput` schema in the [API reference](/orchestration/reference/)
- [`imageGen` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml)
