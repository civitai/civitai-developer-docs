---
title: Qwen image generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const sdcppT2IBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'qwen',
      model: '20b',
      operation: 'createImage',
      version: 'latest',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting, highly detailed',
      width: 1024, height: 1024,
      cfgScale: 2.5, steps: 20,
    },
  }],
};

const sdcppVersionBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'qwen',
      model: '20b',
      operation: 'createImage',
      version: '2512',
      prompt: 'A majestic mountain landscape at sunrise, cinematic composition',
      width: 1024, height: 1024,
      cfgScale: 2.5, steps: 20,
    },
  }],
};

const sdcppLoraBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'qwen',
      model: '20b',
      operation: 'createImage',
      version: 'latest',
      prompt: 'A detailed anime character in a magical forest, ethereal lighting',
      width: 1024, height: 1024,
      cfgScale: 2.5, steps: 20,
      loras: {
        'urn:air:qwen:lora:civitai:123456@789012': 0.8,
      },
    },
  }],
};

const sdcppVariantBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'qwen',
      model: '20b',
      operation: 'createVariant',
      version: 'latest',
      prompt: 'Turn it into a winter scene with snow falling',
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
      ecosystem: 'qwen',
      model: '20b',
      operation: 'editImage',
      version: 'latest',
      prompt: 'Add a rainbow in the sky',
      images: [sampleImage],
    },
  }],
};

const falT2IBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'qwen2',
      operation: 'createImage',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      imageSize: 'square_hd',
    },
  }],
};

const falProBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'qwen2',
      operation: 'proCreateImage',
      prompt: 'An epic fantasy battle scene with dragons, cinematic lighting, intricate details',
      imageSize: 'landscape_16_9',
    },
  }],
};

const falEditBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'qwen2',
      operation: 'editImage',
      prompt: 'Make it daytime',
      images: [sampleImage],
    },
  }],
};
</script>

# Qwen image generation

Qwen is Alibaba's image-generation family. The orchestrator exposes two invocation paths, covering different versions of the model family:

| `engine` | Model | Best for | Notes |
|----------|-------|----------|-------|
| `sdcpp` (ecosystem `qwen`) | `20b` | **Default** — Qwen-Image 20B on Civitai workers | `createImage` / `createVariant` / `editImage`. Version picker (`latest`, `2509`, `2512`, `2511`). LoRA support. |
| `fal` | `qwen2` | When you need FAL-hosted inference — including the **Pro** tier | `createImage` / `proCreateImage` / `editImage` / `proEditImage`. `imageSize` enum instead of width/height. No LoRA support. |

**Default choice for new integrations**: `engine: "sdcpp"`, `ecosystem: "qwen"`, `model: "20b"`. Reach for the `fal` path when you specifically want FAL's hosting or the Pro tier.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- For `editImage` / `createVariant`: one or more source image URLs, data URLs, or Base64 strings

## sdcpp — Qwen-Image 20B (default path)

### Text-to-image (`createImage`)

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "qwen",
      "model": "20b",
      "operation": "createImage",
      "version": "latest",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting, highly detailed",
      "width": 1024,
      "height": 1024,
      "cfgScale": 2.5,
      "steps": 20
    }
  }]
}
```

<RecipeRun :body="sdcppT2IBody" :wait="60" />

Common sdcpp-qwen parameters:

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `model` | — ✅ | `20b` | Currently only `20b` is exposed. |
| `version` | `latest` | `latest` / `2509` / `2512` (create + variant) / `2511` (edit) | Model release snapshot. `latest` follows whichever is current. |
| `prompt` | — ✅ | ≤ 10 000 chars | Natural-language works well on Qwen. |
| `negativePrompt` | *(none)* | ≤ 10 000 chars | Optional. |
| `width` / `height` | `1024` | `64`–`2048`, divisible by 8 | Qwen-Image 20B is trained at 1024². Well-behaved aspect ratios stay near that pixel count. On `editImage` / `createVariant` width/height are inferred from the source and treated as read-only. |
| `cfgScale` | `2.5` | `0`–`30` | Lower than most image models — `2`–`4` is the sweet spot. |
| `steps` | `20` | `1`–`150` | `20`–`30` typical. |
| `sampleMethod` | `euler` | enum | [`SdCppSampleMethod`](/orchestration/reference/). |
| `schedule` | `simple` | enum | [`SdCppSchedule`](/orchestration/reference/). |
| `loras` | `{}` | `{ airUrn: strength }` | Stack multiple; `0.6`–`1.0` strengths typical. |
| `quantity` | `1` | `1`–`12` | Number of images per call. |
| `seed` | random | int64 | Pin for reproducibility. |

### Picking a `version`

| `version` | Available on | Notes |
|-----------|--------------|-------|
| `latest` | all ops | Follows whatever release Civitai is currently pinning to. Recommended unless you need reproducibility against a specific release. |
| `2509` | all ops | September 2025 release snapshot. |
| `2512` | create / variant | December 2025 release — latest generation-side release at the time of writing. |
| `2511` | edit | November 2025 release — edit-specific snapshot. |

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "qwen",
      "model": "20b",
      "operation": "createImage",
      "version": "2512",
      "prompt": "A majestic mountain landscape at sunrise, cinematic composition",
      "width": 1024,
      "height": 1024,
      "cfgScale": 2.5,
      "steps": 20
    }
  }]
}
```

<RecipeRun :body="sdcppVersionBody" :wait="60" />

Pin to a specific `version` when you need reproducible output or are comparing generations across a larger experiment; stick to `latest` for day-to-day use.

### With LoRAs

LoRAs are a map of AIR URN → strength:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "qwen",
      "model": "20b",
      "operation": "createImage",
      "prompt": "A detailed anime character in a magical forest, ethereal lighting",
      "width": 1024,
      "height": 1024,
      "cfgScale": 2.5,
      "steps": 20,
      "loras": {
        "urn:air:qwen:lora:civitai:123456@789012": 0.8
      }
    }
  }]
}
```

<RecipeRun :body="sdcppLoraBody" :wait="60" />

Only Qwen-tagged LoRAs work on the `qwen` ecosystem. Browse the [Civitai Qwen LoRA catalog](https://civitai.com/models?baseModels=Qwen+Image) for AIR URNs.

### Image-to-image (`createVariant`)

Pass a single source image and a prompt; the model re-imagines it. `strength` controls how much of the source to preserve — `0.0` returns the source unchanged, `1.0` discards it entirely. Width and height are inferred from the source.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "qwen",
      "model": "20b",
      "operation": "createVariant",
      "prompt": "Turn it into a winter scene with snow falling",
      "image": "https://image.civitai.com/.../source.jpeg",
      "strength": 0.7
    }
  }]
}
```

<RecipeRun :body="sdcppVariantBody" :wait="60" />

Note `image` is a plain string URL (not a `{ url: ... }` wrapper), and the field is `strength` (default `0.7`).

### Edit image (`editImage`)

Pass up to **10 reference images** via `images[]` — Qwen-Image's edit variant accepts more sources than most edit pipelines:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "qwen",
      "model": "20b",
      "operation": "editImage",
      "prompt": "Add a rainbow in the sky",
      "images": [
        "https://image.civitai.com/.../source.jpeg"
      ]
    }
  }]
}
```

<RecipeRun :body="sdcppEditBody" :wait="60" />

Width/height are inferred from the source image(s); sending them produces a 400.

## fal — FAL-hosted Qwen2 (with Pro tier)

When you want FAL's hosted inference — including the commercial **Pro** tier via the `proCreateImage` and `proEditImage` operations — use `engine: "fal"`, `model: "qwen2"`:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "qwen2",
      "operation": "createImage",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "imageSize": "square_hd"
    }
  }]
}
```

<RecipeRun :body="falT2IBody" :wait="60" />

### FAL-specific parameters

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `prompt` | — ✅ | ≥ 1 char | Natural-language works well on Qwen. |
| `negativePrompt` | *(none)* | ≤ 500 chars | Much tighter limit than sdcpp's 10 000. |
| `imageSize` | `square_hd` | `square_hd` / `square` / `portrait_4_3` / `portrait_16_9` / `landscape_4_3` / `landscape_16_9` | **Enum, not width/height.** FAL doesn't accept arbitrary dimensions on Qwen2. |
| `quantity` | `1` | `1`–`10` | Slightly lower ceiling than sdcpp's 12. |
| `enablePromptExpansion` | `true` | boolean | Model-side prompt expansion — Qwen rewrites your prompt before generation. On by default. |
| `enableSafetyChecker` | `false` | boolean | FAL's safety filter. Off by default. |
| `seed` | random | int32 | Pin for reproducibility. |

FAL Qwen2 does **not** support LoRAs or `uCache` — use the sdcpp path when you need either.

### Pro tier (`proCreateImage` / `proEditImage`)

FAL ships a Pro tier with the same input shape but routes to a higher-quality backing model. Swap the `operation` to `proCreateImage` for text-to-image or `proEditImage` for editing:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "qwen2",
      "operation": "proCreateImage",
      "prompt": "An epic fantasy battle scene with dragons, cinematic lighting, intricate details",
      "imageSize": "landscape_16_9"
    }
  }]
}
```

<RecipeRun :body="falProBody" :wait="60" />

Pro costs more and is slower, but delivers stronger prompt adherence and finer detail. Use for hero shots where quality matters more than throughput.

### Edit image (FAL)

FAL's edit operation accepts **1–3** reference images (vs sdcpp's 10):

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "qwen2",
      "operation": "editImage",
      "prompt": "Make it daytime",
      "images": [
        "https://image.civitai.com/.../source.jpeg"
      ]
    }
  }]
}
```

<RecipeRun :body="falEditBody" :wait="60" />

Swap to `proEditImage` for the Pro tier variant.

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

| Path | Typical wall time per 1024×1024 image | `wait` recommendation |
|------|---------------------------------------|-----------------------|
| sdcpp Qwen-Image 20B | 15–35 s | `wait=60` usually fine for `quantity: 1` |
| FAL Qwen2 (create / edit) | 10–30 s depending on FAL queue | `wait=60` usually fine |
| FAL Qwen2 Pro (`proCreateImage` / `proEditImage`) | 20–60 s depending on queue | `wait=60` sometimes; fall back to `wait=0` on busy periods |

Large `quantity` or atypical aspect ratios push toward the 100-second request timeout — submit with `wait=0` and poll.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

**sdcpp Qwen-Image 20B** — per-pixel + per-step scaling, with `editImage` carrying a flat higher base:

```
createImage / createVariant:
  total = 30 × (width × height / 1328²) × (steps / 20) × quantity

editImage:
  total = 40 × (width × height / 1328²) × (steps / 20) × (1 + (numImages − 1) × 0.1) × quantity
```

| Shape | Buzz |
|-------|------|
| `createImage`, 1024²/`steps: 20`/`quantity: 1` | **~18** |
| `createImage`, 1328²/`steps: 20`/`quantity: 1` | ~30 |
| `createImage`, 1024²/`steps: 20`/`quantity: 4` | ~72 |
| `editImage`, 1 ref, 1024²/`steps: 20` | ~24 |
| `editImage`, 3 refs, 1024²/`steps: 20` | ~29 |

**FAL Qwen2** (`engine: "fal"`) — commercial tier routed through FAL. Base cost is fixed per operation, per image. `createImage` is cheapest; `proCreateImage` / `proEditImage` cost meaningfully more. Use `whatif=true` to confirm pricing for your shape — FAL pricing shifts independently of the sdcpp path.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "ecosystem must be qwen" | Typo | Lowercase `"qwen"` — not `"Qwen"` or `"qwen2"` (that's the fal `model`, not the sdcpp ecosystem). |
| `400` with "version must be one of" | Picked a version that isn't valid for that operation | Edit supports `latest`/`2509`/`2511`; create + variant support `latest`/`2509`/`2512`. |
| `400` with "width/height is readOnly" on edit/variant | Sent dimensions on an edit or variant request | Drop `width`/`height`; they're inferred from the source. |
| `400` with "imageSize must be one of" on fal | Arbitrary dimensions on FAL path | FAL Qwen2 uses the enum — pick `square_hd`, `landscape_16_9`, etc. Use the sdcpp path for arbitrary dimensions. |
| `400` with "images maxItems" | More than 10 source images on sdcpp `editImage`, or more than 3 on fal `editImage` | Trim the array. |
| LoRA has no effect on FAL | FAL Qwen2 doesn't support LoRAs | Switch to the sdcpp path. |
| Output ignores the prompt | `cfgScale` too low (Qwen wants ~2.5, far below SD1/SDXL's 7) or `enablePromptExpansion` rewriting your carefully-tuned text | Bump `cfgScale` toward 4 on sdcpp; set `enablePromptExpansion: false` on fal. |
| Request timed out (`wait` expired) | Large `quantity`, Pro tier on busy queue | Resubmit with `wait=0` and poll. |
| Step `failed`, `reason = "blocked"` | Prompt or input image hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Flux 2](./flux2) / [Flux 1](./flux1) image generation — alternative open-weights families
- [SDXL](./sdxl) / [SD1](./sd1) image generation — classic Stable Diffusion ecosystems
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: the `Qwen20b<Operation>Input` (sdcpp) and `Qwen2<Operation>FalImageGenInput` / `Qwen2Pro<Operation>FalImageGenInput` (fal) schemas in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface; import into Postman / OpenAPI Generator
