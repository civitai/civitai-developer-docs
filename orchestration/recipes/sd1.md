---
title: SD1 image generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

// Analog Madness v7 — popular SD1.5 checkpoint used in samples
const sd1Model = 'urn:air:sd1:checkpoint:civitai:4384@128713';

const sdcppT2IBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'sd1',
      operation: 'createImage',
      model: sd1Model,
      prompt: 'masterpiece, best quality, 1girl, solo, portrait, looking at viewer, cinematic lighting',
      negativePrompt: 'worst quality, low quality, blurry, bad anatomy',
      width: 512, height: 512,
      cfgScale: 7, steps: 20,
      clipSkip: -1,
    },
  }],
};

const sdcppLoraBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'sd1',
      operation: 'createImage',
      model: sd1Model,
      prompt: 'masterpiece, best quality, cyberpunk street at night, neon signs',
      negativePrompt: 'worst quality, low quality, blurry',
      width: 512, height: 768,
      cfgScale: 7, steps: 25,
      loras: {
        'urn:air:sd1:lora:civitai:123456@789012': 0.8,
      },
      clipSkip: -1,
    },
  }],
};

const sdcppVariantBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'sd1',
      operation: 'createVariant',
      model: sd1Model,
      prompt: 'masterpiece, best quality, daytime with clear blue sky',
      negativePrompt: 'worst quality, low quality',
      width: 512, height: 512,
      cfgScale: 7, steps: 20,
      image: sampleImage,
      strength: 0.7,
    },
  }],
};

const comfyT2IBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'comfy',
      ecosystem: 'sd1',
      operation: 'createImage',
      model: sd1Model,
      prompt: 'masterpiece, best quality, 1girl, solo, portrait, looking at viewer',
      negativePrompt: 'worst quality, low quality, blurry, bad hands',
      width: 512, height: 512,
      steps: 30, cfgScale: 7,
      sampler: 'euler_ancestral',
      scheduler: 'normal',
      clipSkip: 2,
    },
  }],
};
</script>

# SD1 image generation

SD1 is Stable Diffusion 1.x — the original open-weights family. Mature ecosystem, huge model catalog, native resolution **512×512**, prompt style is Booru-like tag-soup plus quality boosters (`masterpiece, best quality, …`). Two invocation paths on the orchestrator:

| `engine` | Best for | Notes |
|----------|----------|-------|
| `sdcpp` (ecosystem `sd1`) | **Default** — Stable Diffusion C++ on Civitai workers | `sampleMethod` + `schedule` sdcpp enums, textual-inversion embeddings, `uCache` mode. |
| `comfy` (ecosystem `sd1`) | When you specifically need ComfyUI sampler/scheduler enums or a Comfy-only feature | `sampler` + `scheduler` Comfy enums, `denoiseStrength` (vs sdcpp's `strength`) on variants. |

**Default choice**: `engine: "sdcpp"`, `ecosystem: "sd1"`. Reach for `comfy` only when you specifically need a ComfyUI-exclusive sampler.

Both engines support `createImage` and `createVariant` (img2img). Neither supports `editImage` — use [Flux 1 Kontext](./flux1#flux1-kontext-managed-editing-tier) or [Flux 2 Klein](./flux2#klein-createvariant-img2img) if you need prompt-driven editing.

## Prerequisites

- An SD1 checkpoint AIR URN — browse the [Civitai SD1.5 catalog](https://civitai.com/models?baseModels=SD+1.5)
- For `createVariant`: a source image URL

## sdcpp (default path)

### Text-to-image

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "sd1",
      "operation": "createImage",
      "model": "urn:air:sd1:checkpoint:civitai:4384@128713",
      "prompt": "masterpiece, best quality, 1girl, solo, portrait, looking at viewer, cinematic lighting",
      "negativePrompt": "worst quality, low quality, blurry, bad anatomy",
      "width": 512,
      "height": 512,
      "cfgScale": 7,
      "steps": 20,
      "clipSkip": -1
    }
  }]
}
```

<RecipeRun :body="sdcppT2IBody" :wait="60" />

Common sdcpp-sd1 parameters:

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `model` | — ✅ | AIR URN | SD1 checkpoint. See the [catalog](https://civitai.com/models?baseModels=SD+1.5). |
| `prompt` | — ✅ | ≤ 10 000 chars | Booru-style tags work best. Lead with quality tags (`masterpiece, best quality, …`). |
| `negativePrompt` | *(none)* | ≤ 10 000 chars | Strongly recommended on SD1 — `worst quality, low quality, blurry, bad anatomy, bad hands` is a solid starting point. |
| `width` / `height` | `512` | `64`–`2048`, divisible by 16 | SD1's native resolution is 512×512. Aspect-ratio variants like 512×768 or 768×512 work; going much bigger often produces duplicated subjects. |
| `cfgScale` | `7` | `0`–`30` | `6`–`8` is the sweet spot for SD1. |
| `steps` | `20` | `1`–`150` | `20`–`30` typical; `30`+ rarely helps. |
| `sampleMethod` | `euler` | enum | [`SdCppSampleMethod`](/orchestration/reference/). |
| `schedule` | `discrete` | enum | [`SdCppSchedule`](/orchestration/reference/). |
| `clipSkip` | `-1` | int | `-1` = model default. `2` is a common hand-tuned value on many SD1 checkpoints — try it if output feels stiff. |
| `vaeModel` | *(checkpoint VAE)* | AIR URN | Override baked-in VAE. Rarely needed. |
| `loras` | `{}` | `{ airUrn: strength }` | Stack multiple; `0.6`–`1.0` strengths typical. |
| `embeddings` | `[]` | array of AIR URNs | Textual inversions. Reference them in the prompt / negative prompt by their embedding name. |
| `quantity` | `1` | `1`–`12` | Number of images per call. |
| `seed` | random | int64 | Pin for reproducibility. |
| `uCache` | *(default)* | enum | [`SdCppUCacheMode`](/orchestration/reference/). Caching strategy; leave default unless you know you want otherwise. |

### With LoRAs

LoRAs are a map of AIR URN → strength. Style LoRAs usually want `0.6`–`1.0`; character / concept LoRAs often sit higher.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "sd1",
      "operation": "createImage",
      "model": "urn:air:sd1:checkpoint:civitai:4384@128713",
      "prompt": "masterpiece, best quality, cyberpunk street at night, neon signs",
      "negativePrompt": "worst quality, low quality, blurry",
      "width": 512,
      "height": 768,
      "cfgScale": 7,
      "steps": 25,
      "loras": {
        "urn:air:sd1:lora:civitai:123456@789012": 0.8
      }
    }
  }]
}
```

<RecipeRun :body="sdcppLoraBody" :wait="60" />

### Image-to-image (`createVariant`)

Pass a source image + a new prompt; the model re-imagines it. `strength` controls how much of the source to preserve — `0.0` returns the source unchanged, `1.0` discards it entirely. `0.6`–`0.8` is the sweet spot.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "sd1",
      "operation": "createVariant",
      "model": "urn:air:sd1:checkpoint:civitai:4384@128713",
      "prompt": "masterpiece, best quality, daytime with clear blue sky",
      "negativePrompt": "worst quality, low quality",
      "width": 512,
      "height": 512,
      "cfgScale": 7,
      "steps": 20,
      "image": "https://image.civitai.com/.../source.jpeg",
      "strength": 0.7
    }
  }]
}
```

<RecipeRun :body="sdcppVariantBody" :wait="60" />

Note `image` is a plain string URL (not a `{ url: ... }` wrapper), and the field is `strength` (not `denoiseStrength` like on Comfy).

## Comfy (alternative path)

Use `engine: "comfy"` when you specifically need a ComfyUI sampler/scheduler enum that sdcpp doesn't expose.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "comfy",
      "ecosystem": "sd1",
      "operation": "createImage",
      "model": "urn:air:sd1:checkpoint:civitai:4384@128713",
      "prompt": "masterpiece, best quality, 1girl, solo, portrait, looking at viewer",
      "negativePrompt": "worst quality, low quality, blurry, bad hands",
      "width": 512,
      "height": 512,
      "steps": 30,
      "cfgScale": 7,
      "sampler": "euler_ancestral",
      "scheduler": "normal",
      "clipSkip": 2
    }
  }]
}
```

<RecipeRun :body="comfyT2IBody" :wait="60" />

Key differences from sdcpp:

| Field | sdcpp | comfy |
|-------|-------|-------|
| Sampler | `sampleMethod` ([`SdCppSampleMethod`](/orchestration/reference/)) | `sampler` ([`ComfySampler`](/orchestration/reference/)) |
| Schedule | `schedule` ([`SdCppSchedule`](/orchestration/reference/)) | `scheduler` ([`ComfyScheduler`](/orchestration/reference/)) |
| Img2img strength | `strength` (default `0.7`) | `denoiseStrength` (default `0.75`) |
| Default `steps` | `20` | `30` |
| Default `clipSkip` | `-1` (model default) | `2` |
| `embeddings` array | ✅ | — |
| `uCache` | ✅ | — |

Comfy also supports `createVariant` with `image` (plain string URL) + `denoiseStrength`; see the [`ComfySd1VariantImageGenInput` schema](/orchestration/reference/).

## Reading the result

Standard `imageGen` output: an `images[]` array, one entry per `quantity` ([shape and URL expiry](/orchestration/recipes/#reading-results)).

## Runtime

SD1 at 512×512 is one of the fastest image-gen paths available — typical wall time 3–10 s per image (sdcpp) or 5–15 s (comfy, slightly heavier). `wait=60` works comfortably for `quantity ≤ 4`. Going beyond 768px on either axis compounds runtime quadratically; submit with `wait=0` and poll for large batches or dimensions.

## Cost

Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

Both engines use the same per-pixel / per-step shape — different reference values:

```
total = base × (width × height / referencePixels) × (steps / referenceSteps) × quantity
```

| Path | `base` | `referencePixels` | `referenceSteps` | Defaults → Buzz |
|------|--------|-------------------|------------------|-----------------|
| `sdcpp + sd1` | `4` | 512² | `20` | 512²/`steps: 20`/`q: 1` → **~4 Buzz** |
| `comfy + sd1` | `4` | 512² | `30` | 512²/`steps: 30`/`q: 1` → **~4 Buzz** |

Examples:
- 512² at `quantity: 4` → ~16 Buzz
- 768×512 at `steps: 25` → ~4 × 1.5 × 1.25 = **~7.5 Buzz** (sdcpp)
- 512² at `steps: 40` → **~8 Buzz** (sdcpp)

SD1 is the cheapest per-image option Civitai exposes — native 512² defaults keep the formula at 1.0 on each axis.

## Troubleshooting

Timeouts, moderation blocks and expired blob URLs: see [Common troubleshooting](/orchestration/recipes/#common-troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "model must match AIR pattern" | Passed a bare model ID or version slug | Use a full AIR URN: `urn:air:sd1:checkpoint:civitai:<modelId>@<versionId>`. |
| `400` with unknown property | Field not valid for this engine (e.g. `sampler` on sdcpp, `sampleMethod` on comfy, `denoiseStrength` on sdcpp) | Match the schema for your chosen engine — see the difference table above. |
| Output has duplicated subjects / Frankenstein anatomy | Dimensions too far from SD1's native 512×512 | Generate at 512 / 768 max; upscale with [`imageUpscaler`](./image-upscaler) if you need more resolution. |
| Output looks flat / low-contrast on SD1 | `clipSkip` at model default where the checkpoint expects `2` | Try `clipSkip: 2` — the convention for many SD1 community checkpoints. |
| Prompts feel ignored on SD1 | Missing quality boosters, or `cfgScale` too low | Lead the prompt with `masterpiece, best quality, …` tags; bump `cfgScale` toward `8`. |
| LoRA has no visible effect | Wrong AIR URN, model private / not published, or ecosystem mismatch | Verify the URN on the LoRA's Civitai page; only SD1-tagged LoRAs work on the `sd1` ecosystem. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [SDXL image generation](./sdxl) — higher-resolution successor to SD1
- [Flux 2](./flux2) / [Flux 1](./flux1) image generation — newer open-weights families with stronger prompt adherence
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref` (use `ecosystem: "sd1"` on the enhancer)
- Full parameter catalog: the `Sd1CreateImageGenInput` / `Sd1VariantImageGenInput` / `ComfySd1CreateImageGenInput` / `ComfySd1VariantImageGenInput` schemas in the [API reference](/orchestration/reference/)
- [`imageGen` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml)
