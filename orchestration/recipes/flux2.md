---
title: Flux 2 image generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/e4a8f395-8166-44a8-82b1-bb0901c10aa3/original=true,quality=90,optimized=true/19325406.jpeg';

// Klein — default choice
const kleinT2IBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'flux2', model: 'klein', operation: 'createImage',
      modelVersion: '4b',
      prompt: 'A cozy cabin in the woods at sunset, cinematic lighting',
      width: 1024, height: 1024,
      cfgScale: 5, steps: 20,
    },
  }],
};

const klein9bBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'flux2', model: 'klein', operation: 'createImage',
      modelVersion: '9b',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      width: 1024, height: 1536,
      cfgScale: 5, steps: 24,
    },
  }],
};

const kleinLoraBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'flux2', model: 'klein', operation: 'createImage',
      modelVersion: '4b',
      prompt: 'A detailed anime character in a magical forest, ethereal lighting',
      width: 1024, height: 1024,
      cfgScale: 5, steps: 20,
      loras: {
        'urn:air:flux2:lora:civitai:2169780@2443422': 1.0,
      },
    },
  }],
};

const kleinEditBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'flux2', model: 'klein', operation: 'editImage',
      modelVersion: '4b',
      prompt: 'Make it a winter scene with snow falling',
      width: 1024, height: 1024,
      images: [sampleImage],
    },
  }],
};

// Klein createVariant via the sdcpp path (no createVariant on the native flux2 engine for klein)
const kleinVariantBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp', ecosystem: 'flux2Klein', operation: 'createVariant',
      modelVersion: '4b',
      prompt: 'Make it daytime with clear blue sky',
      width: 1024, height: 1024,
      image: sampleImage,
      strength: 0.7,
    },
  }],
};

// Dev — higher-fidelity open-weights variant
const devT2IBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'flux2', model: 'dev', operation: 'createImage',
      prompt: 'A majestic cat sitting on a throne, highly detailed, 8k',
      width: 1024, height: 1024, quantity: 1,
      guidanceScale: 2.5, numInferenceSteps: 28,
    },
  }],
};

const flexBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'flux2', model: 'flex', operation: 'createImage',
      prompt: 'A serene mountain landscape with a crystal clear lake at dawn',
      width: 1024, height: 1024,
      guidanceScale: 3.5, numInferenceSteps: 28,
    },
  }],
};

const proBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'flux2', model: 'pro', operation: 'createImage',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      width: 1024, height: 1536,
    },
  }],
};

const maxBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'flux2', model: 'max', operation: 'createImage',
      prompt: 'An epic fantasy battle scene with dragons, cinematic lighting, intricate details',
      width: 1536, height: 1024,
    },
  }],
};
</script>

# Flux 2 image generation

Flux 2 is Black Forest Labs' latest image-generation family. The orchestrator exposes every shipped variant under the `imageGen` step, selected by the `model` field:

| `model` | Best for | Notes |
|---------|----------|-------|
| `klein` | **Default** — cheapest and most capable variant for almost every workload | Supports `createImage` / `createVariant` / `editImage`. Two size tiers (`4b` / `9b`). Takes LoRAs. Runs on Civitai infra. |
| `dev` | Higher fidelity when Klein isn't enough, with LoRA support | Supports `createImage` / `editImage`. Exposes `guidanceScale` + `numInferenceSteps`. |
| `flex` | Mid-tier quality, faster than `dev` | Supports `createImage` / `editImage`. Fewer tunable knobs. |
| `pro` | Commercial tier — routed through BFL's provider | Supports `createImage` / `editImage`. No LoRAs. |
| `max` | Top commercial tier — premium hero shots | Supports `createImage` / `editImage`. Slowest + most expensive. |

**Default choice for new integrations**: `model: "klein"`, `modelVersion: "4b"`. Upgrade to `9b` when you want more fidelity on the same variant, step to `dev` for open-weights Flux 2 with the official sampler, or `pro` / `max` for BFL-managed commercial output.

## The request shape

Every Flux 2 request is a single `imageGen` step with three keys selecting the variant and operation:

```json
{
  "$type": "imageGen",
  "input": {
    "engine":    "flux2",
    "model":     "klein",       // klein | dev | flex | pro | max
    "operation": "createImage"  // createImage | editImage
  }
}
```

The orchestrator dispatches to the matching input schema (`Flux2KleinCreateImageInput`, `Flux2DevEditImageInput`, …), so only the fields valid for that combination are accepted — [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) will `400` on unknown ones.

::: tip `createVariant` on Klein
The native `flux2` engine exposes `createImage` and `editImage` on every model. If you want strength-weighted img2img (`createVariant`), **Klein** and **Dev** each have a second invocation path via `engine: "sdcpp"` + `ecosystem: "flux2Klein"` / `"flux2Dev"` — same models, extra operations. See [Klein → createVariant](#klein-createvariant-img2img) and [Dev createVariant](#dev-createvariant-img2img-via-sdcpp) below.
:::

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- For `editImage` / `createVariant` operations: one or more source image URLs, data URLs, or Base64 strings

## Klein (default)

Klein is the cost/capability sweet spot for almost every Flux 2 workload. Cheap enough to generate at scale, capable enough for production output, and the only variant that supports `createVariant`. Two size tiers:

| `modelVersion` | Typical use |
|----------------|-------------|
| `4b` (default) | Fastest, cheapest. Great default. |
| `4b-base` | Un-tuned 4b checkpoint — useful for custom fine-tuning, not for direct generation. |
| `9b` | Higher fidelity at higher cost. Step up from `4b` when quality matters more than throughput. |
| `9b-base` | Un-tuned 9b checkpoint, same caveats as `4b-base`. |
| `9b-kv` | 9b with key-value caching (ComfyUI worker only). Rare; use when a worker explicitly requires it. |

### Text-to-image (`createImage`)

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "flux2",
      "model": "klein",
      "operation": "createImage",
      "modelVersion": "4b",
      "prompt": "A cozy cabin in the woods at sunset, cinematic lighting",
      "width": 1024,
      "height": 1024,
      "cfgScale": 5,
      "steps": 20
    }
  }]
}
```

<RecipeRun :body="kleinT2IBody" :wait="60" />

Klein-specific parameters:

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `modelVersion` | `4b` | `4b` / `4b-base` / `9b` / `9b-base` / `9b-kv` | Size tier. `4b` is the default workload pick. |
| `cfgScale` | `5` | `1`–`20` | Classifier-free guidance. `4`–`6` is the sweet spot on Klein. |
| `steps` | `20` | `4`–`50` | Sampler steps. Klein is efficient — 20 is usually plenty. |
| `sampleMethod` | `euler` | enum | [`SdCppSampleMethod`](/orchestration/reference/). |
| `schedule` | `simple` | enum | [`SdCppSchedule`](/orchestration/reference/). |
| `negativePrompt` | *(none)* | string | Available on Klein — not exposed on `dev` / `flex` / `pro` / `max`. |
| `loras` | `{}` | `{ airUrn: strength }` | Stack multiple; strengths in `0.0`–`2.0` are typical. |

Plus the shared Flux 2 fields (`prompt`, `width`, `height`, `seed`, `quantity`, `outputFormat`, `enablePromptExpansion`) — see [Common parameters](#common-parameters).

### Bumping up to 9b

When `4b` isn't delivering enough fidelity, switch `modelVersion` to `9b` — same shape, same knobs, just a heavier model:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "flux2",
      "model": "klein",
      "operation": "createImage",
      "modelVersion": "9b",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "width": 1024,
      "height": 1536,
      "cfgScale": 5,
      "steps": 24
    }
  }]
}
```

<RecipeRun :body="klein9bBody" :wait="60" />

### With LoRAs

Flux 2 Klein LoRAs are a map of AIR URN → strength (same shape as [Flux 1](./flux1)):

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "flux2",
      "model": "klein",
      "operation": "createImage",
      "modelVersion": "4b",
      "prompt": "A detailed anime character in a magical forest, ethereal lighting",
      "width": 1024,
      "height": 1024,
      "cfgScale": 5,
      "steps": 20,
      "loras": {
        "urn:air:flux2:lora:civitai:2169780@2443422": 1.0
      }
    }
  }]
}
```

<RecipeRun :body="kleinLoraBody" :wait="60" />

Browse the [Civitai Flux 2 LoRA catalog](https://civitai.com/models?baseModels=Flux.2+D) for AIR URNs.

### Edit image (`editImage`)

Pass `images[]` (up to 2 entries) alongside a prompt treated as an edit instruction:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "flux2",
      "model": "klein",
      "operation": "editImage",
      "modelVersion": "4b",
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

<RecipeRun :body="kleinEditBody" :wait="60" />

### Klein createVariant (img2img) {#klein-createvariant-img2img}

The native `engine: "flux2"` path doesn't expose `createVariant` on Klein, but there's a second invocation path that does: `engine: "sdcpp"` + `ecosystem: "flux2Klein"`. Same model, same LoRAs, same size tiers — adds `createVariant` with `image` (single source) + `strength`:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "flux2Klein",
      "operation": "createVariant",
      "modelVersion": "4b",
      "prompt": "Make it daytime with clear blue sky",
      "width": 1024,
      "height": 1024,
      "image": "https://image.civitai.com/.../source.jpeg",
      "strength": 0.7
    }
  }]
}
```

<RecipeRun :body="kleinVariantBody" :wait="60" />

`strength` controls how much of the source to preserve — `0.0` returns the source unchanged, `1.0` discards it entirely. `0.6`–`0.8` is the "keep composition, change style" sweet spot.

The sdcpp path also supports `createImage` and `editImage` on Klein with the same field shapes shown above under the native `flux2` engine — just swap `engine: "flux2", model: "klein"` for `engine: "sdcpp", ecosystem: "flux2Klein"`. Most users can stay on the native `flux2` engine; reach for the sdcpp path when you need `createVariant`.

## Dev — higher-fidelity open-weights

When Klein isn't delivering and you want open-weights quality, `dev` is the next step up. Supports LoRAs; exposes the native Flux 2 sampler interface (`guidanceScale`, `numInferenceSteps`):

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "flux2",
      "model": "dev",
      "operation": "createImage",
      "prompt": "A majestic cat sitting on a throne, highly detailed, 8k",
      "width": 1024,
      "height": 1024,
      "quantity": 1,
      "guidanceScale": 2.5,
      "numInferenceSteps": 28
    }
  }]
}
```

<RecipeRun :body="devT2IBody" :wait="60" />

Dev-specific parameters:

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `guidanceScale` | `2.5` | `0`–`20` | Lower = more creative, higher = sticks closer to the prompt. `2.5`–`4.0` is the sweet spot. |
| `numInferenceSteps` | `28` | `4`–`50` | Sampler steps. Diminishing returns past ~30. |
| `loras[]` | `[]` | array of `{ air, strength }` | **Note the shape difference from Klein**: Dev uses an *array* of `{ air, strength }` objects; Klein uses a *dict*. |

Dev also supports `operation: "editImage"` with `images[]` — same shape as Klein's edit, just on the richer sampler surface.

### Dev createVariant (img2img) via sdcpp

Like Klein, the native `engine: "flux2"` path doesn't expose `createVariant` on Dev — but there's a second invocation path that does: `engine: "sdcpp"` + `ecosystem: "flux2Dev"`. Same model, same LoRA support, with `image` (single source) + `strength` for img2img:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "flux2Dev",
      "operation": "createVariant",
      "prompt": "Make it daytime with clear blue sky",
      "width": 1024,
      "height": 1024,
      "image": "https://image.civitai.com/.../source.jpeg",
      "strength": 0.7
    }
  }]
}
```

`strength` runs `0.0`–`1.0` (default `0.7`). The sdcpp path also supports `createImage` and `editImage` on Dev — most users can stay on the native `flux2` engine; reach for the sdcpp path when you need `createVariant`.

## Flex — faster, lighter

Mid-tier quality, tuned for throughput. Same knobs as `dev`, slightly lower fidelity:

```json
{
  "$type": "imageGen",
  "input": {
    "engine": "flux2",
    "model": "flex",
    "operation": "createImage",
    "prompt": "A serene mountain landscape with a crystal clear lake at dawn",
    "width": 1024,
    "height": 1024,
    "guidanceScale": 3.5,
    "numInferenceSteps": 28
  }
}
```

<RecipeRun :body="flexBody" :wait="60" />

Also supports `editImage`.

## Pro — BFL commercial tier

Routed through Black Forest Labs' production provider. No LoRAs, no sampler knobs — just prompt in, image out. Use when Klein / dev don't meet quality needs and you're willing to pay for BFL-managed output:

```json
{
  "$type": "imageGen",
  "input": {
    "engine": "flux2",
    "model": "pro",
    "operation": "createImage",
    "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
    "width": 1024,
    "height": 1536
  }
}
```

<RecipeRun :body="proBody" :wait="60" />

## Max — BFL flagship

Top commercial tier. Slowest and most expensive. Use for hero shots where quality matters more than throughput:

```json
{
  "$type": "imageGen",
  "input": {
    "engine": "flux2",
    "model": "max",
    "operation": "createImage",
    "prompt": "An epic fantasy battle scene with dragons, cinematic lighting, intricate details",
    "width": 1536,
    "height": 1024
  }
}
```

<RecipeRun :body="maxBody" :wait="60" />

Same shape as `pro`; heavier backing model.

## Common parameters {#common-parameters}

These apply across all Flux 2 models (per the [`Flux2ImageGenInput` schema](/orchestration/reference/operations/InvokeImageGenStepTemplate)):

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `prompt` | ✅ | — | ≤ 1000 characters. Natural-language descriptions work best — include lighting, composition, camera/lens cues. |
| `width` | | `1024` | `512`–`2048`. Klein requires divisible by 16; other models have no divisibility constraint. |
| `height` | | `1024` | `512`–`2048`. Klein requires divisible by 16; other models have no divisibility constraint. |
| `quantity` | | `1` | `1`–`4`. Number of images returned per call. |
| `outputFormat` | | `jpeg` | `jpeg` or `png`. `png` for lossless, `jpeg` for smaller files. |
| `seed` | | random | `int64`. Pin for reproducibility. |
| `enablePromptExpansion` | | `false` | Model-side prompt expansion — Flux rewrites your prompt before generation. Off by default. |

For `editImage` operations, add `images[]` (up to 2 entries on Klein) — HTTP(S) URLs, data URLs, or Base64 strings.

## Reading the result

A successful `imageGen` step emits an `images[]` array — one entry per `quantity`:

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

Rough ranges on Civitai-hosted infra (warm node, queue permitting):

| Variant | Typical wall time per 1024×1024 image | `wait` recommendation |
|---------|---------------------------------------|-----------------------|
| `klein` (`4b`) | 5–15 s | `wait=60` fine for `quantity: 1` |
| `klein` (`9b`) | 10–25 s | `wait=60` usually fine |
| `dev`, `flex` | 10–30 s | `wait=60` usually works for `quantity ≤ 2` |
| `pro`, `max` | 15–60 s depending on BFL queue | `wait=60` works sometimes; fall back to `wait=0` + polling on busy periods |

Past ~2 images, large dimensions, or `pro`/`max` on a busy queue, you risk hitting the 100 s request timeout — submit with `wait=0` and poll / webhook.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` to preview the exact charge before submitting; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

**Klein** (`Flux2KleinSdCppImageGenInput.CalculateCost`) — driven by `modelVersion`, `steps`, and `cfgScale`:

```
base     = stepCost × steps × (editImages + 1) × (cfgScale == 1 ? 1 : 2)
stepCost = 0.3 (4b / 4b-base), 0.5 (9b / 9b-base)
total    = base × quantity
```

| Variant | Shape | Buzz |
|---------|-------|------|
| Klein `4b`, `createImage`, `steps: 20`, `cfgScale: 5`, `quantity: 1` | default | **~12** |
| Klein `4b`, `createImage`, `quantity: 4` | batch | ~48 |
| Klein `4b`, `editImage` with 1 reference | edit | ~24 |
| Klein `9b`, `createImage`, `steps: 24`, `cfgScale: 5` | upgrade | **~24** |

**Dev / Flex / Pro / Max** use a per-megapixel formula — `ceil(width × height / 1 000 000) × costPerMegapixel × quantity`, where `costPerMegapixel` doubles when LoRAs are present on `dev`. A default 1024² `dev` createImage lands at **~40 Buzz**; expect commercial-tier variants (`pro`, `max`) to be materially higher. Run `whatif=true` when pricing matters.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "prompt must be less than 1000" | Too long | Trim; 500 chars is plenty for most prompts. |
| `400` with "width/height out of range" | Outside `512`–`2048`, or not divisible by 8 (16 on Klein) | Round to a valid multiple. |
| `400` with unexpected property | Field not valid for this `model`/`operation` (e.g. `loras` on `pro`, `guidanceScale` on `klein`, `cfgScale` on `dev`) | Match the schema for your chosen variant — see the tables above. Klein uses `cfgScale`/`steps`/`sampleMethod`; dev/flex use `guidanceScale`/`numInferenceSteps`. |
| `400` with "createVariant is not a valid operation" on Klein / Dev (native `flux2` engine) | Native `flux2` engine only exposes `createImage` + `editImage` | Use `engine: "sdcpp"` + `ecosystem: "flux2Klein"` or `"flux2Dev"` to access `createVariant`. See [Klein createVariant](#klein-createvariant-img2img) or [Dev createVariant](#dev-createvariant-img2img-via-sdcpp). |
| `400` with "LoRA not found" | AIR URN wrong or model private / not published | Verify the URN on the model's Civitai page. |
| Output ignores the prompt | `enablePromptExpansion: true` with a short prompt; or guidance too low | Set `enablePromptExpansion: false` and/or raise `cfgScale` (Klein) / `guidanceScale` (dev, flex). |
| Request timed out (`wait` expired) | Large `quantity`, `max`/`pro` on a busy queue | Resubmit with `wait=0` and poll. |
| Step `failed`, `reason = "blocked"` | Prompt or input image hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Flux 1 image generation](./flux1) — classic Flux.1 family (sdcpp, Comfy, Kontext editing)
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref`
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling longer runs
- Full parameter catalog: the `Flux2<Model><Operation>Input` and `Flux2KleinSdCpp<Operation>Input` schemas in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface; import into Postman / OpenAPI Generator
