---
title: Flux 1 image generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const sdcppDiffuser = 'urn:air:flux1:diffuser:civitai:618692@691639';

const sdcppT2IBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'flux1',
      operation: 'createImage',
      diffuserModel: sdcppDiffuser,
      prompt: 'A photorealistic portrait of a woman in a cyberpunk city, neon reflections',
      width: 1024, height: 1024,
    },
  }],
};

const sdcppLoraBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'flux1',
      operation: 'createImage',
      diffuserModel: sdcppDiffuser,
      prompt: 'A detailed anime character in a magical forest, ethereal lighting',
      width: 1024, height: 1024,
      loras: {
        'urn:air:flux1:lora:civitai:123456@789012': 0.8,
      },
    },
  }],
};

const sdcppVariantBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'flux1',
      operation: 'createVariant',
      diffuserModel: sdcppDiffuser,
      prompt: 'Make it daytime with clear blue sky',
      width: 1024, height: 1024,
      image: sampleImage,
      strength: 0.7,
    },
  }],
};

const sdcppEditBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'flux1',
      operation: 'editImage',
      diffuserModel: sdcppDiffuser,
      prompt: 'Make it a winter scene with snow falling',
      width: 1024, height: 1024,
      images: [sampleImage],
    },
  }],
};

const comfyT2IBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'comfy',
      ecosystem: 'flux1',
      operation: 'createImage',
      model: 'urn:air:flux1:checkpoint:civitai:618692@691639',
      prompt: 'A photorealistic portrait of a woman in a cyberpunk city, neon reflections',
      width: 1024, height: 1024,
      steps: 20, cfgScale: 3.5,
      sampler: 'euler', scheduler: 'simple',
      quantity: 1,
    },
  }],
};

const kontextProBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'flux1-kontext',
      model: 'pro',
      prompt: 'A photograph of a cat wearing a tiny astronaut helmet',
      quantity: 1,
    },
  }],
};

const kontextEditBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'flux1-kontext',
      model: 'max',
      prompt: 'Make it daytime',
      quantity: 1,
      images: [sampleImage],
    },
  }],
};
</script>

# Flux 1 image generation

Flux 1 is Black Forest Labs' original open-weights family (Dev / Schnell plus the commercial Kontext tier). The whole family is the **`flux1` ecosystem** on the orchestrator — same checkpoint family, same AIR prefix (`urn:air:flux1:…`), same resource pool for workers and capability matching. What differs is how you *invoke* it: there's no single `engine: "flux1"` discriminator, so you pick one of three `engine` values depending on what you want:

| `engine` | Best for | Notes |
|----------|----------|-------|
| `sdcpp` (ecosystem `flux1`) | **Default** — Stable Diffusion C++ on Civitai workers | Only `diffuserModel` is required; VAE / CLIP-L / T5-XXL default to sensible components. Supports LoRAs, `createImage` / `createVariant` / `editImage`. |
| `comfy` (ecosystem `flux1`) | When you specifically need ComfyUI sampler knobs | Full sampler/scheduler enum control, LoRA support, checkpoint via AIR URN. Picks a heavier worker than sdcpp — reach for this only if you need a Comfy-specific sampler. |
| `flux1-kontext` (ecosystem `flux1`) | Image editing / prompt-based edits via BFL's managed Kontext API | `dev` / `pro` / `max` tiers; the `ecosystem` field isn't in the request body but the endpoint lives in the same ecosystem internally |

**Default choice for new integrations**: `engine: "sdcpp"`, `ecosystem: "flux1"`. Sdcpp's defaults handle the component models for you, so you only need to pick a diffuser. Reach for `comfy` when you need a specific Comfy sampler; use `flux1-kontext` when you want BFL's managed editor.

If you're starting fresh and don't need Flux.1 specifically, consider [Flux 2](./flux2) — cleaner schema, better quality, same orchestration-side usage.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A Flux.1 diffuser AIR URN (for sdcpp / comfy paths) — browse the [Civitai Flux 1.D catalog](https://civitai.com/models?baseModels=Flux.1+D)
- For `createVariant` / `editImage` / Kontext editing: one or more source image URLs

## sdcpp (default path)

Runs Flux.1 on Civitai's sdcpp workers. Minimal required input — just pick a diffuser and write a prompt. Every other model component (VAE, CLIP-L, T5-XXL) has a working default; LoRAs, samplers, and dimensions are tunable.

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
      "ecosystem": "flux1",
      "operation": "createImage",
      "diffuserModel": "urn:air:flux1:diffuser:civitai:618692@691639",
      "prompt": "A photorealistic portrait of a woman in a cyberpunk city, neon reflections",
      "width": 1024,
      "height": 1024
    }
  }]
}
```

<RecipeRun :body="sdcppT2IBody" :wait="60" />

Common sdcpp-flux1 parameters:

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `diffuserModel` | — ✅ | AIR URN | The only required model component. A Flux.1 diffuser from the catalog. |
| `prompt` | — ✅ | ≤ 1000 chars | Natural-language descriptions work best on Flux. |
| `width` / `height` | `1024` | `832`–`1216`, divisible by 16 | Tighter than Comfy's `64`–`2048`. |
| `steps` | `28` | `4`–`50` | Sampler steps. Diminishing returns past ~30. |
| `cfgScale` | `3.5` | `1`–`20` | Classifier-free guidance. `2.5`–`4` is the sweet spot for Flux. |
| `sampleMethod` | `euler` | enum | See [`SdCppSampleMethod`](/orchestration/reference/). |
| `schedule` | `simple` | enum | See [`SdCppSchedule`](/orchestration/reference/). |
| `negativePrompt` | *(none)* | string | Available — Comfy/Kontext flux1 variants don't expose one. |
| `loras` | `{}` | `{ airUrn: strength }` | Stack multiple; strengths in `0.0`–`2.0` are typical. |
| `quantity` | `1` | `1`–`4` | Number of images per call. |
| `seed` | random | int64 | Pin for reproducibility. |
| `vaeModel` | *(default)* | AIR URN | Override the default VAE. Usually unnecessary. |
| `clipLModel` | *(default)* | AIR URN | Override the default CLIP-L. |
| `t5XXLModel` | *(default)* | AIR URN | Override the default T5-XXL text encoder. |

The default component URNs (Green-Sky's quantized GGUF releases on HuggingFace) are what the orchestrator falls back to when you omit `vaeModel` / `clipLModel` / `t5XXLModel`. They work out of the box — override only if you need a specific quantization or cached component.

### With LoRAs

LoRAs are a map of AIR URN → strength, identical shape to Comfy:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "flux1",
      "operation": "createImage",
      "diffuserModel": "urn:air:flux1:diffuser:civitai:618692@691639",
      "prompt": "A detailed anime character in a magical forest, ethereal lighting",
      "width": 1024,
      "height": 1024,
      "loras": {
        "urn:air:flux1:lora:civitai:123456@789012": 0.8
      }
    }
  }]
}
```

<RecipeRun :body="sdcppLoraBody" :wait="60" />

### Image-to-image (`createVariant`)

Pass a source image and a new prompt; the model re-imagines it. `strength` controls how much of the source to preserve — `0.0` returns the source unchanged, `1.0` discards it entirely. `0.6`–`0.8` is the "keep composition, change style" sweet spot.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "flux1",
      "operation": "createVariant",
      "diffuserModel": "urn:air:flux1:diffuser:civitai:618692@691639",
      "prompt": "Make it daytime with clear blue sky",
      "width": 1024,
      "height": 1024,
      "image": "https://image.civitai.com/.../source.jpeg",
      "strength": 0.7
    }
  }]
}
```

<RecipeRun :body="sdcppVariantBody" :wait="60" />

Note `image` is a plain string URL (not a `{ url: ... }` wrapper), and the field is `strength` (not `denoiseStrength` like on Comfy).

### Edit image (`editImage`)

Alternative to `createVariant` — accepts up to two reference images and treats the prompt as an edit instruction rather than a variant direction:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "flux1",
      "operation": "editImage",
      "diffuserModel": "urn:air:flux1:diffuser:civitai:618692@691639",
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

<RecipeRun :body="sdcppEditBody" :wait="60" />

`images[]` takes up to 2 entries. Use `createVariant` when you want a strength-weighted re-imagining of a single source; use `editImage` when you want prompt-driven surgery (a more literal "do X to this picture" interpretation).

## Comfy (ComfyUI-specific knobs)

When you need controls specific to ComfyUI's sampler surface — `ComfySampler` / `ComfyScheduler` enum values, a single-checkpoint AIR URN instead of separate components, or `denoiseStrength` semantics on img2img — use `engine: "comfy"`. Otherwise prefer `sdcpp`.

### Text-to-image

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "comfy",
      "ecosystem": "flux1",
      "operation": "createImage",
      "model": "urn:air:flux1:checkpoint:civitai:618692@691639",
      "prompt": "A photorealistic portrait of a woman in a cyberpunk city, neon reflections",
      "width": 1024,
      "height": 1024,
      "steps": 20,
      "cfgScale": 3.5,
      "sampler": "euler",
      "scheduler": "simple",
      "quantity": 1
    }
  }]
}
```

<RecipeRun :body="comfyT2IBody" :wait="60" />

Key differences from sdcpp:

| Field | sdcpp | comfy |
|-------|-------|-------|
| Model spec | `diffuserModel` (+ optional components) | `model` — single checkpoint AIR URN |
| Sampler | `sampleMethod` ([`SdCppSampleMethod`](/orchestration/reference/)) | `sampler` ([`ComfySampler`](/orchestration/reference/)) |
| Schedule | `schedule` ([`SdCppSchedule`](/orchestration/reference/)) | `scheduler` ([`ComfyScheduler`](/orchestration/reference/)) |
| Img2img strength | `strength` (`createVariant`) | `denoiseStrength` (`createVariant`) |
| Max `quantity` | `4` | `12` |
| Max `width` / `height` | `1216` | `2048` |
| `negativePrompt` | ✅ | — |

Comfy also supports `createVariant` with the same shape, using a plain `image` string (URL, data URL, or Base64) and `denoiseStrength` instead of the plain `image` / `strength` pair sdcpp uses. See the [`ComfyFlux1VariantImageGenInput` schema](/orchestration/reference/) for the full field list.

## flux1-kontext (managed editing tier)

`flux1-kontext` stays inside the `flux1` ecosystem — same checkpoint family, same AIR prefix for any LoRAs/models you'd reference elsewhere in the `flux1` ecosystem — but routes inference to BFL's managed Kontext provider. Three model tiers (`dev`/`pro`/`max`), simpler input schema — just `prompt` + optional `images[]` + `aspectRatio`. No checkpoint selection, no LoRAs, no sampler knobs. The trade-off is convenience: BFL handles quality; you handle prompts and reference images.

### Text-to-image

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "flux1-kontext",
      "model": "pro",
      "prompt": "A photograph of a cat wearing a tiny astronaut helmet",
      "quantity": 1
    }
  }]
}
```

<RecipeRun :body="kontextProBody" :wait="60" />

### Image editing (the Kontext strength)

Pass `images[]` to edit an existing image via prompt:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "flux1-kontext",
      "model": "max",
      "prompt": "Make it daytime",
      "quantity": 1,
      "images": [
        "https://image.civitai.com/.../source.jpeg"
      ]
    }
  }]
}
```

<RecipeRun :body="kontextEditBody" :wait="60" />

Kontext models:

| `model` | Notes |
|---------|-------|
| `dev` | Open-weights tier. Cheapest Kontext option. |
| `pro` | Commercial tier — BFL's standard production model. Default recommendation. |
| `max` | Top tier — highest quality, slowest, most expensive. Use for hero shots. |

Kontext-specific parameters:

| Field | Default | Notes |
|-------|---------|-------|
| `prompt` | — ✅ | ≤ 1000 chars. |
| `images[]` | — | URLs, data URLs, or Base64. When present → image-edit mode. Omit → text-to-image. |
| `aspectRatio` | `1:1` | Enum: `21:9`, `16:9`, `4:3`, `3:2`, `1:1`, `2:3`, `3:4`, `9:16`, `9:21`. |
| `guidanceScale` | `3.5` | `1`–`20`. |
| `quantity` | `1` | `1`–`4`. |
| `seed` | random | int64. |

## Reading the result

All Flux 1 paths emit the standard `imageGen` output — an `images[]` array, one entry per `quantity`:

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

| Path | Typical wall time per 1024×1024 image | `wait` recommendation |
|------|---------------------------------------|-----------------------|
| `sdcpp + flux1` | 10–30 s | `wait=60` usually fine |
| `comfy + flux1` | 10–30 s (LoRAs add a few seconds each) | `wait=60` usually fine |
| `flux1-kontext` (dev / pro) | 10–30 s depending on BFL queue | `wait=60` usually fine |
| `flux1-kontext` (max) | 15–60 s | `wait=60` sometimes, fall back to `wait=0` on busy periods |

`quantity > 2` or large dimensions push you toward the 100-second request timeout — submit with `wait=0` and poll instead.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

**sdcpp path** (`Flux1SdCppImageGenInput.CalculateCost`):

```
base  = 0.5 × steps × (editImages + 1) × (cfgScale == 1 ? 1 : 2)
total = base × quantity
```

| Shape | Buzz |
|-------|------|
| `createImage`, `steps: 28`, `cfgScale: 3.5`, `quantity: 1` | **~28** |
| `createImage`, `steps: 28`, `quantity: 4` | ~112 |
| `createVariant`, `quantity: 1` | ~28 |
| `editImage` with 1 reference | ~56 |

**Comfy path** (`ComfyFlux1ImageGenInput.CalculateCost`) — per-pixel + per-step scaling:

```
total = 8 × (width × height / 1024²) × (steps / 20) × quantity
```

At 1024² / `steps: 20` / `quantity: 1` → **~8 Buzz**. Comfy scales linearly with pixels and steps — 512² halves, 2048² quadruples, `steps: 40` doubles, and so on.

**Kontext** (`flux1-kontext`, BFL-hosted) — flat per-image by tier:

| Tier | Buzz per image |
|------|----------------|
| `dev` | **~35** |
| `pro` | **~45** |
| `max` | **~90** |

Multiply by `quantity`. No per-step / per-pixel scaling since Kontext doesn't expose those knobs.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with unknown property | Field not valid for this `engine` (e.g. `sampler` on sdcpp, `sampleMethod` on comfy, `loras` on `flux1-kontext`) | Match the schema for your chosen engine — see the tables above. |
| `400` with "diffuserModel is required" | sdcpp `createImage` / `createVariant` / `editImage` without a diffuser | Supply `diffuserModel` — the only required model component on sdcpp. VAE / CLIP-L / T5-XXL default automatically. |
| `400` with "model must match AIR pattern" | Passed a bare model ID or version slug | Use a full AIR URN: `urn:air:flux1:diffuser:civitai:<modelId>@<versionId>` (sdcpp) or `urn:air:flux1:checkpoint:civitai:<modelId>@<versionId>` (comfy). |
| `400` with "width/height out of range" on sdcpp | sdcpp clamps tighter than Comfy (`832`–`1216`, divisible by 16) | Round to a valid multiple of 16 inside that range, or switch to the Comfy engine for more freedom. |
| Output ignores the prompt on Flux.1 | `cfgScale` too low or prompt too short | Raise `cfgScale` toward 4; add lighting / composition / camera cues. |
| LoRA silently has no effect | Wrong AIR URN, unpublished / private model | Verify the URN on the LoRA's Civitai page; strengths outside `0.0`–`2.0` may also be clamped. |
| Kontext edit returns a generation unrelated to the source | `images[]` URL not reachable by BFL | Use a CDN-served URL (Civitai CDN works); see the source-URL notes in [Transcription → Choosing a source URL](./transcription). |
| Request timed out (`wait` expired) | Large `quantity`, Kontext `max` on a busy queue | Resubmit with `wait=0` and poll. |
| Step `failed`, `reason = "blocked"` | Prompt or input image hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Flux 2 image generation](./flux2) — newer Flux family with a cleaner schema, higher quality
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref` (use `ecosystem: "flux1"` on the enhancer)
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling longer runs
- Full parameter catalog: the `Flux1SdCpp<Operation>Input`, `ComfyFlux1<Operation>Input`, `Flux1Kontext<Model>ImageGenInput` schemas in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface; import into Postman / OpenAPI Generator
