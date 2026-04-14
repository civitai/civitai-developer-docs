---
title: SDXL image generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

// Juggernaut XL — popular SDXL checkpoint used in samples
const sdxlModel = 'urn:air:sdxl:checkpoint:civitai:101055@128078';

const sdcppT2IBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'sdxl',
      operation: 'createImage',
      model: sdxlModel,
      prompt: 'masterpiece, best quality, 1girl, solo, landscape, sunset, cinematic lighting, highly detailed',
      negativePrompt: 'worst quality, low quality, blurry',
      width: 1024, height: 1024,
      cfgScale: 7, steps: 25,
    },
  }],
};

const sdcppAspectBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'sdxl',
      operation: 'createImage',
      model: sdxlModel,
      prompt: 'masterpiece, best quality, wide panoramic view of a futuristic city at dusk',
      negativePrompt: 'worst quality, low quality',
      width: 1536, height: 640,
      cfgScale: 7, steps: 25,
    },
  }],
};

const sdcppLoraBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'sdxl',
      operation: 'createImage',
      model: sdxlModel,
      prompt: 'masterpiece, best quality, portrait of a warrior in ornate armor',
      negativePrompt: 'worst quality, low quality, blurry',
      width: 1024, height: 1024,
      cfgScale: 7, steps: 25,
      loras: {
        'urn:air:sdxl:lora:civitai:123456@789012': 0.8,
      },
    },
  }],
};

const sdcppVariantBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'sdxl',
      operation: 'createVariant',
      model: sdxlModel,
      prompt: 'masterpiece, best quality, daytime with clear blue sky',
      negativePrompt: 'worst quality, low quality',
      width: 1024, height: 1024,
      cfgScale: 7, steps: 25,
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
      ecosystem: 'sdxl',
      operation: 'createImage',
      model: sdxlModel,
      prompt: 'masterpiece, best quality, 1girl, solo, landscape, sunset, cinematic lighting',
      negativePrompt: 'worst quality, low quality, blurry',
      width: 1024, height: 1024,
      steps: 30, cfgScale: 7,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
    },
  }],
};
</script>

# SDXL image generation

SDXL is Stable Diffusion XL — the higher-resolution successor to SD1. Native resolution **1024×1024**, massive community catalog, prompt style sits between SD1's Booru tags and Flux's natural language (tags still help; full sentences work too). Two invocation paths on the orchestrator:

| `engine` | Best for | Notes |
|----------|----------|-------|
| `sdcpp` (ecosystem `sdxl`) | **Default** — Stable Diffusion C++ on Civitai workers | `sampleMethod` + `schedule` sdcpp enums, textual-inversion embeddings, `uCache` mode. |
| `comfy` (ecosystem `sdxl`) | When you specifically need ComfyUI sampler/scheduler enums or a Comfy-only feature | `sampler` + `scheduler` Comfy enums, `denoiseStrength` (vs sdcpp's `strength`) on variants. |

**Default choice for new integrations**: `engine: "sdcpp"`, `ecosystem: "sdxl"`. Reach for `comfy` only when you specifically need a ComfyUI-exclusive sampler (`dpmpp_2m`, `dpmpp_sde`, etc.) or scheduler (`karras`).

Both engines support `createImage` and `createVariant` (img2img). Neither supports `editImage` — use [Flux 1 Kontext](./flux1#flux1-kontext-managed-editing-tier) or [Flux 2 Klein](./flux2#klein-createvariant-img2img) if you need prompt-driven editing.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- An SDXL checkpoint AIR URN — browse the [Civitai SDXL catalog](https://civitai.com/models?baseModels=SDXL+1.0)
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
      "ecosystem": "sdxl",
      "operation": "createImage",
      "model": "urn:air:sdxl:checkpoint:civitai:101055@128078",
      "prompt": "masterpiece, best quality, 1girl, solo, landscape, sunset, cinematic lighting, highly detailed",
      "negativePrompt": "worst quality, low quality, blurry",
      "width": 1024,
      "height": 1024,
      "cfgScale": 7,
      "steps": 25
    }
  }]
}
```

<RecipeRun :body="sdcppT2IBody" :wait="60" />

Common sdcpp-sdxl parameters:

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `model` | — ✅ | AIR URN | SDXL checkpoint. See the [catalog](https://civitai.com/models?baseModels=SDXL+1.0). |
| `prompt` | — ✅ | ≤ 10 000 chars | Tag-style or natural language. Quality tags (`masterpiece, best quality, …`) still help. |
| `negativePrompt` | *(none)* | ≤ 10 000 chars | Recommended. `worst quality, low quality, blurry` is a solid starting point. |
| `width` / `height` | `1024` | `64`–`2048`, divisible by 16 | SDXL's native resolution is 1024×1024. Well-behaved aspect ratios: 1024×1024, 1152×896, 896×1152, 1216×832, 832×1216, 1344×768, 768×1344, 1536×640, 640×1536. |
| `cfgScale` | `7` | `0`–`30` | `6`–`8` works for most SDXL checkpoints; LCM/Turbo variants want `1`–`2`. |
| `steps` | `20` | `1`–`150` | `20`–`30` typical. LCM/Turbo checkpoints need fewer (`4`–`8`). |
| `sampleMethod` | `euler` | enum | [`SdCppSampleMethod`](/orchestration/reference/). |
| `schedule` | `discrete` | enum | [`SdCppSchedule`](/orchestration/reference/). |
| `vaeModel` | *(checkpoint VAE)* | AIR URN | Override baked-in VAE. Rarely needed. |
| `loras` | `{}` | `{ airUrn: strength }` | Stack multiple; `0.6`–`1.0` strengths typical. |
| `embeddings` | `[]` | array of AIR URNs | Textual inversions. Reference them in the prompt / negative prompt by their embedding name. |
| `quantity` | `1` | `1`–`12` | Number of images per call. |
| `seed` | random | int64 | Pin for reproducibility. |
| `uCache` | *(default)* | enum | [`SdCppUCacheMode`](/orchestration/reference/). Caching strategy; leave default unless you know you want otherwise. |

::: tip No `clipSkip` on SDXL
Unlike SD1, SDXL doesn't expose a `clipSkip` parameter — the model's dual text encoders make the SD1 clip-skip convention meaningless here. Sending `clipSkip` on an SDXL request will 400.
:::

### Aspect-ratio variants

SDXL handles off-square aspect ratios well as long as you stay near ~1 megapixel total area. Go too wide or too tall and composition artifacts (duplicated subjects, "mirrored twin" effects) start to appear.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "sdxl",
      "operation": "createImage",
      "model": "urn:air:sdxl:checkpoint:civitai:101055@128078",
      "prompt": "masterpiece, best quality, wide panoramic view of a futuristic city at dusk",
      "negativePrompt": "worst quality, low quality",
      "width": 1536,
      "height": 640,
      "cfgScale": 7,
      "steps": 25
    }
  }]
}
```

<RecipeRun :body="sdcppAspectBody" :wait="60" />

### With LoRAs

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "sdxl",
      "operation": "createImage",
      "model": "urn:air:sdxl:checkpoint:civitai:101055@128078",
      "prompt": "masterpiece, best quality, portrait of a warrior in ornate armor",
      "negativePrompt": "worst quality, low quality, blurry",
      "width": 1024,
      "height": 1024,
      "cfgScale": 7,
      "steps": 25,
      "loras": {
        "urn:air:sdxl:lora:civitai:123456@789012": 0.8
      }
    }
  }]
}
```

<RecipeRun :body="sdcppLoraBody" :wait="60" />

### Image-to-image (`createVariant`)

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "sdxl",
      "operation": "createVariant",
      "model": "urn:air:sdxl:checkpoint:civitai:101055@128078",
      "prompt": "masterpiece, best quality, daytime with clear blue sky",
      "negativePrompt": "worst quality, low quality",
      "width": 1024,
      "height": 1024,
      "cfgScale": 7,
      "steps": 25,
      "image": "https://image.civitai.com/.../source.jpeg",
      "strength": 0.7
    }
  }]
}
```

<RecipeRun :body="sdcppVariantBody" :wait="60" />

`strength` controls how much of the source to preserve — `0.0` returns the source unchanged, `1.0` discards it entirely. `0.6`–`0.8` is the sweet spot for "keep composition, change style". Note `image` is a plain string URL (not a `{ url: ... }` wrapper), and the field is `strength` (not `denoiseStrength` like on Comfy).

## Comfy (alternative path)

Use `engine: "comfy"` when you need a ComfyUI-specific sampler — `dpmpp_2m` paired with the `karras` scheduler is a popular combo on SDXL for smoother detail:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "comfy",
      "ecosystem": "sdxl",
      "operation": "createImage",
      "model": "urn:air:sdxl:checkpoint:civitai:101055@128078",
      "prompt": "masterpiece, best quality, 1girl, solo, landscape, sunset, cinematic lighting",
      "negativePrompt": "worst quality, low quality, blurry",
      "width": 1024,
      "height": 1024,
      "steps": 30,
      "cfgScale": 7,
      "sampler": "dpmpp_2m",
      "scheduler": "karras"
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
| `embeddings` array | ✅ | — |
| `uCache` | ✅ | — |

Comfy also supports `createVariant` with `image` (plain string URL) + `denoiseStrength`; see the [`ComfySdxlVariantImageGenInput` schema](/orchestration/reference/).

## Reading the result

Both engines emit the standard `imageGen` output — an `images[]` array, one entry per `quantity`:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "imageGen",
    "status": "succeeded",
    "output": {
      "images": [
        { "id": "blob_...", "url": "https://.../signed.jpeg" }
      ]
    }
  }]
}
```

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL.

## Runtime

SDXL at 1024×1024 typically finishes in 10–25 s (sdcpp) or 15–35 s (comfy). `wait=60` works comfortably for `quantity ≤ 2`. LCM/Turbo checkpoints at `steps: 4`–`8` finish in 3–8 s and support higher `quantity` inside the same window. For larger batches or atypical aspect ratios, submit with `wait=0` and poll.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Both engines use the same per-pixel / per-step shape — different reference values:

```
total = base × (width × height / referencePixels) × (steps / referenceSteps) × quantity
```

| Path | `base` | `referencePixels` | `referenceSteps` | Defaults → Buzz |
|------|--------|-------------------|------------------|-----------------|
| `sdcpp + sdxl` | `8` | 1024² | `20` | 1024²/`steps: 20`/`q: 1` → **~8 Buzz** |
| `comfy + sdxl` | `8` | 1024² | `30` | 1024²/`steps: 30`/`q: 1` → **~8 Buzz** |

Examples:
- 1024² at `quantity: 4` → ~32 Buzz
- 1344×768 at `steps: 25` → ~8 × 0.98 × 1.25 ≈ **~10 Buzz** (sdcpp)
- 1024² at `steps: 35` → **~14 Buzz** (sdcpp)
- 1536×640 at `steps: 25` → ~8 × 0.94 × 1.25 ≈ **~9 Buzz** (sdcpp)

Atypical aspect ratios still bill by total pixel area, so a 2:1 panorama at the same megapixel count costs the same as a 1:1 image at 1024².

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "model must match AIR pattern" | Passed a bare model ID or version slug | Use a full AIR URN: `urn:air:sdxl:checkpoint:civitai:<modelId>@<versionId>`. |
| `400` with "clipSkip is not a valid property" on SDXL | `clipSkip` doesn't exist on SDXL (it's an SD1 knob) | Remove the field. SDXL uses dual text encoders; there's nothing to skip. |
| `400` with unknown property | Field not valid for this engine (e.g. `sampler` on sdcpp, `sampleMethod` on comfy, `denoiseStrength` on sdcpp) | Match the schema for your chosen engine — see the difference table above. |
| Output has duplicated subjects / mirrored-twin composition | Aspect ratio too far from 1:1 at fixed megapixel count | Stick to well-behaved SDXL ratios: 1024², 1152×896, 1344×768, 1536×640, and mirrors thereof. |
| Turbo/LCM checkpoint produces mush | `cfgScale` / `steps` tuned for base SDXL | Turbo/LCM want `cfgScale: 1`–`2` and `steps: 4`–`8`. |
| LoRA has no visible effect | Wrong AIR URN, model private / not published, or ecosystem mismatch | Verify the URN on the LoRA's Civitai page; only SDXL-tagged LoRAs work on the `sdxl` ecosystem. |
| Request timed out (`wait` expired) | Large `quantity`, atypical dimensions, busy worker | Resubmit with `wait=0` and poll. |
| Step `failed`, `reason = "blocked"` | Prompt hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [SD1 image generation](./sd1) — the 512×512 predecessor with the same two-engine pattern
- [Flux 2](./flux2) / [Flux 1](./flux1) image generation — newer families with stronger prompt adherence
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref` (use `ecosystem: "sdxl"` on the enhancer)
- Full parameter catalog: the `SdxlCreateImageGenInput` / `SdxlVariantImageGenInput` / `ComfySdxlCreateImageGenInput` / `ComfySdxlVariantImageGenInput` schemas in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface; import into Postman / OpenAPI Generator
