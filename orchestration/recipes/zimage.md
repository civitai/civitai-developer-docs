---
title: Z-Image generation
---

<script setup>
const baseBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'zImage',
      model: 'base',
      operation: 'createImage',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      width: 1024, height: 1024,
      cfgScale: 4, steps: 20,
    },
  }],
};

const baseNegBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'zImage',
      model: 'base',
      operation: 'createImage',
      prompt: 'A detailed anime character in a magical forest, ethereal lighting, masterpiece',
      negativePrompt: 'blurry, low quality, deformed hands, bad anatomy, watermark, text',
      width: 1024, height: 1024,
      cfgScale: 4, steps: 24,
    },
  }],
};

const baseLoraBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'zImage',
      model: 'base',
      operation: 'createImage',
      prompt: 'A cyberpunk street scene with neon signs and rain reflections',
      width: 1024, height: 1024,
      cfgScale: 4, steps: 20,
      loras: {
        'urn:air:zImage:lora:civitai:123456@789012': 0.8,
      },
    },
  }],
};

const turboBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'zImage',
      model: 'turbo',
      operation: 'createImage',
      prompt: 'A cozy cabin in the woods at sunset, cinematic lighting',
      width: 1024, height: 1024,
      cfgScale: 1, steps: 9,
    },
  }],
};

const turboBatchBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'sdcpp',
      ecosystem: 'zImage',
      model: 'turbo',
      operation: 'createImage',
      prompt: 'A majestic fox with flowing tails in an enchanted garden',
      width: 1024, height: 1024,
      quantity: 4,
      cfgScale: 1, steps: 9,
    },
  }],
};
</script>

# Z-Image generation

Z-Image is a lightweight text-to-image model family that runs on Civitai's sdcpp workers. Two variants on the same ecosystem:

| `model` | Typical use | Defaults |
|---------|-------------|----------|
| `turbo` | **Default** — distilled model, extremely fast and cheap, high enough quality for most workloads | `cfgScale: 1`, `steps: 9` |
| `base` | Upgrade tier — use when `turbo` isn't delivering enough fidelity for a specific prompt | `cfgScale: 4`, `steps: 20` |

Both share the same `engine: "sdcpp"`, `ecosystem: "zImage"` invocation — they differ in default sampler tuning and the expected usage pattern. Neither supports img2img or image editing; the only operation is `createImage`.

**Default choice**: `model: "turbo"` at `cfgScale: 1` / `steps: 9`. Switch to `base` (with `cfgScale: 4` / `steps: 20`) when you need more fidelity — better prompt adherence, cleaner detail, or working negative prompts.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- No checkpoint URN needed — the ecosystem ships its own models; you pick between `base` and `turbo` via the `model` field

## The request shape

Every Z-Image request is a single `imageGen` step routed through sdcpp:

```json
{
  "$type": "imageGen",
  "input": {
    "engine":    "sdcpp",
    "ecosystem": "zImage",
    "model":     "turbo",        // turbo | base
    "operation": "createImage"
  }
}
```

The orchestrator dispatches to the matching input schema (`ZImageTurboCreateImageGenInput` or `ZImageBaseCreateImageGenInput`), so only the fields valid for that combination are accepted — [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) will `400` on unknown ones.

## turbo (default)

Turbo is the distilled Z-Image variant — fast, cheap, and good enough for almost every workload. Low CFG (`cfgScale: 1`, effectively disabling classifier-free guidance) and short step counts make it the cost/quality sweet spot:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "zImage",
      "model": "turbo",
      "operation": "createImage",
      "prompt": "A cozy cabin in the woods at sunset, cinematic lighting",
      "width": 1024,
      "height": 1024,
      "cfgScale": 1,
      "steps": 9
    }
  }]
}
```

<RecipeRun :body="turboBody" :wait="60" />

::: tip Turbo tuning
Keep `cfgScale` at `1` and `steps` at `8`–`12`. Pushing either up negates the turbo speedup without meaningfully improving quality — if you need better output, switch to `base` instead of cranking turbo's knobs.
:::

### Batching with turbo

Turbo's low cost makes it a natural fit for multi-image calls. `quantity` up to `12` is supported on the schema, though you'll generally hit the 100-second request timeout above ~4–6 depending on dimensions:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "zImage",
      "model": "turbo",
      "operation": "createImage",
      "prompt": "A majestic fox with flowing tails in an enchanted garden",
      "width": 1024,
      "height": 1024,
      "quantity": 4,
      "cfgScale": 1,
      "steps": 9
    }
  }]
}
```

<RecipeRun :body="turboBatchBody" :wait="60" />

For larger batches, submit with `wait=0` and poll (see [Results & webhooks](/orchestration/guide/results-and-webhooks)).

## base (fallback when turbo isn't enough)

Step up to `base` when turbo isn't delivering — prompts that need strong adherence, fine detail work, or negative-prompt conditioning. Higher `cfgScale` (`4` is the default) and more sampler steps (`20`+) at the cost of higher wall time and spend.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "zImage",
      "model": "base",
      "operation": "createImage",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "width": 1024,
      "height": 1024,
      "cfgScale": 4,
      "steps": 20
    }
  }]
}
```

<RecipeRun :body="baseBody" :wait="60" />

### With a negative prompt

Z-Image Base honours negative prompts; they steer the model away from undesired content. (Turbo effectively ignores them at `cfgScale: 1`, so this is one of the cleanest reasons to step up.)

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "zImage",
      "model": "base",
      "operation": "createImage",
      "prompt": "A detailed anime character in a magical forest, ethereal lighting, masterpiece",
      "negativePrompt": "blurry, low quality, deformed hands, bad anatomy, watermark, text",
      "width": 1024,
      "height": 1024,
      "cfgScale": 4,
      "steps": 24
    }
  }]
}
```

<RecipeRun :body="baseNegBody" :wait="60" />

### With LoRAs

Z-Image LoRAs are a map of AIR URN → strength — same shape as every other sdcpp ecosystem. LoRAs work on both `turbo` and `base`; this example is on `base` because LoRA-driven styles usually benefit from the higher-fidelity tier:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "sdcpp",
      "ecosystem": "zImage",
      "model": "base",
      "operation": "createImage",
      "prompt": "A cyberpunk street scene with neon signs and rain reflections",
      "width": 1024,
      "height": 1024,
      "cfgScale": 4,
      "steps": 20,
      "loras": {
        "urn:air:zImage:lora:civitai:123456@789012": 0.8
      }
    }
  }]
}
```

<RecipeRun :body="baseLoraBody" :wait="60" />

## Common parameters

Both `turbo` and `base` share the same schema — only defaults differ. See the [`ZImageTurboCreateImageGenInput`](/orchestration/reference/operations/InvokeImageGenStepTemplate) and [`ZImageBaseCreateImageGenInput`](/orchestration/reference/operations/InvokeImageGenStepTemplate) schemas for the complete field list.

| Field | Required | Turbo default | Base default | Range | Notes |
|-------|----------|---------------|--------------|-------|-------|
| `prompt` | ✅ | — | — | ≤ 10 000 chars | Natural-language descriptions with lighting / composition / camera cues. |
| `negativePrompt` | | *(none)* | *(none)* | ≤ 10 000 chars | Most useful on `base`; effectively ignored on `turbo` because `cfgScale: 1`. |
| `width` / `height` | | `1024` | `1024` | `64`–`2048` | Divisible by 16. |
| `cfgScale` | | `1` | `4` | `0`–`30` | Turbo: keep at `1`. Base: `3`–`5` is the sweet spot. |
| `steps` | | `9` | `20` | `1`–`150` | Turbo: `8`–`12`. Base: `20`–`30`. |
| `sampleMethod` | | `euler` | `euler` | enum | [`SdCppSampleMethod`](/orchestration/reference/). |
| `schedule` | | `simple` | `simple` | enum | [`SdCppSchedule`](/orchestration/reference/). |
| `loras` | | `{}` | `{}` | `{ airUrn: strength }` | Stack multiple; strengths in `0.0`–`2.0` are typical. |
| `quantity` | | `1` | `1` | `1`–`12` | Number of images per call. |
| `seed` | | random | random | int64 | Pin for reproducibility. |

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

| Variant | Typical wall time per 1024×1024 image | `wait` recommendation |
|---------|---------------------------------------|-----------------------|
| `turbo` (`cfgScale: 1`, `steps: 9`) — **default** | 3–8 s | `wait=30` fine for `quantity ≤ 4` |
| `base` (`cfgScale: 4`, `steps: 20`) | 8–20 s | `wait=60` fine for `quantity ≤ 2` |

Turbo's cost advantage shows up most clearly in batch mode — `quantity: 4` on turbo often finishes in the same wall-clock window as `quantity: 1` on base. For larger batches or dimensions, submit with `wait=0` and poll.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Same per-pixel / per-step shape for both variants — different base cost and reference step count:

```
total = base × (width × height / 1024²) × (steps / referenceSteps) × quantity
```

| Variant | `base` | `referenceSteps` | Defaults (1024², default steps, `quantity: 1`) |
|---------|--------|------------------|-----------------------------------------------|
| `turbo` | `8` | `9` | **~8 Buzz** |
| `base` | `20` | `20` | **~20 Buzz** |

Examples:
- Turbo at `quantity: 4` → ~32 Buzz
- Turbo at 1536×1024, `steps: 12` → ~8 × 1.5 × 1.33 ≈ **~16 Buzz**
- Base at 1024², `steps: 30` → ~20 × 1 × 1.5 ≈ **~30 Buzz**

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with unknown property | Field not valid for the ecosystem (e.g. `guidanceScale` — that's a Flux knob, not sdcpp) | Z-Image uses the sdcpp knob names: `cfgScale`, `steps`, `sampleMethod`, `schedule`. |
| `400` with "operation must be createImage" | Passed `editImage` or `createVariant` | Z-Image only supports `createImage` on either model. Use Flux 2 Klein or Flux 1 sdcpp if you need img2img / edit. |
| `400` with "ecosystem must be zImage" | Typo on the ecosystem slug | `"zImage"` — camelCase with capital I. Not `"z-image"`, `"zimage"`, `"Z-Image"`. |
| Turbo output looks washed out / low-detail | Step count too low for the prompt complexity | Bump `steps` to `10`–`12`; or switch to `base` if you need more. |
| Turbo ignores the negative prompt | `cfgScale: 1` effectively disables negative-prompt conditioning | Use `base` (with `cfgScale: 4`) if your workload depends on negative prompts. |
| Base output ignores the prompt | `cfgScale` too low or prompt too short | Raise `cfgScale` toward `5`; add lighting / composition cues. |
| LoRA silently has no effect | Wrong AIR URN, unpublished / private model, wrong ecosystem | Verify the URN on the LoRA's Civitai page; Z-Image LoRAs must be tagged for the `zImage` ecosystem. |
| Request timed out (`wait` expired) | Large `quantity`, large dimensions, or cold worker | Resubmit with `wait=0` and poll. Turbo is less likely to time out than base for the same dimensions. |
| Step `failed`, `reason = "blocked"` | Prompt hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Flux 2 image generation](./flux2) — higher-fidelity alternative with createVariant / editImage support
- [Flux 1 image generation](./flux1) — other sdcpp-hosted Flux ecosystem
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: the `ZImageBaseCreateImageGenInput` and `ZImageTurboCreateImageGenInput` schemas in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface; import into Postman / OpenAPI Generator
