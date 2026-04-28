---
title: Flux 1 LoRA training
---

<script setup>
const flux1DevBody = {
  tags: ['training'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'flux1',
      modelVariant: 'dev',
      epochs: 5,
      resolution: 1024,
      lr: 0.0001,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 16,
      networkAlpha: 16,
      noiseOffset: 0,
      flipAugmentation: false,
      shuffleTokens: false,
      keepTokens: 0,
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2657604TrainingData.EYBd.zip',
        count: 10,
      },
      samples: {
        prompts: [
          'a photo of TOK',
          'TOK in a garden',
          'TOK portrait',
        ],
      },
    },
  }],
};

const flux1SchnellBody = {
  tags: ['training'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'flux1',
      modelVariant: 'schnell',
      epochs: 5,
      lr: 0.0001,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 16,
      networkAlpha: 16,
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2657604TrainingData.EYBd.zip',
        count: 10,
      },
      samples: {
        prompts: ['a photo of TOK', 'TOK in a garden'],
      },
    },
  }],
};
</script>

# Flux 1 LoRA training

Train a Flux.1 LoRA on your own image dataset using AI Toolkit. The output LoRA is usable directly in [Flux 1 image generation](./flux1) (sdcpp or Comfy paths).

| `modelVariant` | Base model | Inference characteristics |
|----------------|-----------|---------------------------|
| `dev` (default) | `black-forest-labs/FLUX.1-dev` | Higher fidelity, ~20–28 sampler steps. Good default for most LoRAs. |
| `schnell` | `black-forest-labs/FLUX.1-schnell` | Faster inference, 4 sampler steps, no CFG. Use when you specifically want a Schnell-targeted LoRA. |

The base checkpoint is fixed by `modelVariant` — there's no `model` field to override. To train on a non-BFL Flux.1 finetune, use the [SDXL & SD1](./training-sdxl-sd1) or [other-image](./training-other-image) ecosystems instead.

::: tip Long-running step
Flux 1 training is the most expensive AI Toolkit ecosystem (200 Buzz/epoch) and runs for ~30s–2min per epoch on a typical 10-image dataset. Always use `wait=0` and follow up via polling or a webhook — see [Results & webhooks](/orchestration/guide/results-and-webhooks).
:::

## The request shape

```json
{
  "$type": "training",
  "input": {
    "engine":       "ai-toolkit",
    "ecosystem":    "flux1",
    "modelVariant": "dev"        // dev | schnell
  }
}
```

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A training-data zip uploaded to a reachable URL (signed R2 URL, Civitai R2 AIR, or any HTTPS URL)
- An accurate `count` of images in the zip

## Flux 1 dev (default)

Trains on top of `FLUX.1-dev` and produces a LoRA usable with any Flux 1 dev workflow.

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "tags": ["training"],
  "steps": [{
    "$type": "training",
    "priority": "normal",
    "retries": 2,
    "input": {
      "engine": "ai-toolkit",
      "ecosystem": "flux1",
      "modelVariant": "dev",
      "epochs": 5,
      "resolution": 1024,
      "lr": 0.0001,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 16,
      "networkAlpha": 16,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2657604TrainingData.EYBd.zip",
        "count": 10
      },
      "samples": {
        "prompts": ["a photo of TOK", "TOK in a garden", "TOK portrait"]
      }
    }
  }]
}
```

<RecipeRun :body="flux1DevBody" :wait="0" />

## Flux 1 schnell

Trains on top of `FLUX.1-schnell`. Inference uses 4 steps and `cfgScale: 0` — the output LoRA is meant to be used in those conditions.

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "tags": ["training"],
  "steps": [{
    "$type": "training",
    "input": {
      "engine": "ai-toolkit",
      "ecosystem": "flux1",
      "modelVariant": "schnell",
      "epochs": 5,
      "lr": 0.0001,
      "trainTextEncoder": false,
      "networkDim": 16,
      "networkAlpha": 16,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2657604TrainingData.EYBd.zip",
        "count": 10
      },
      "samples": { "prompts": ["a photo of TOK", "TOK in a garden"] }
    }
  }]
}
```

<RecipeRun :body="flux1SchnellBody" :wait="0" />

## Common parameters {#common-parameters}

Shared by both Flux 1 variants. Defaults shown are after `ApplyDefaults`.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `engine` | ✅ | — | Always `ai-toolkit`. |
| `ecosystem` | ✅ | — | Always `flux1` for this page. |
| `modelVariant` | ✅ | — | `dev` or `schnell`. Determines the base checkpoint. |
| `epochs` | | `5` | `1`–`20`. Billed per epoch. |
| `numberOfRepeats` | | auto: `ceil(200 / count)` | `1`–`5000`. |
| `lr` | | `0.0001` | UNet learning rate. Flux 1 is sensitive to high LRs — keep ≤ `0.0005`. |
| `trainTextEncoder` | | `false` | Flux 1 does not benefit much from text-encoder training. Leave off. |
| `lrScheduler` | | `cosine` | `constant`, `constant_with_warmup`, `cosine`, `linear`, `step`. |
| `optimizerType` | | `adamw8bit` | `adamw`, `adamw8bit`, `adam8bit`, `lion`, `lion8bit`, `adafactor`, `adagrad`, `prodigy`, `prodigy8bit`, `automagic`. |
| `networkDim` | | `16` | `1`–`256`. Flux 1's lower default reflects how compactly Flux LoRAs encode style/character vs. SD-family. |
| `networkAlpha` | | matches `networkDim` | `1`–`256`. |
| `noiseOffset` | | `0` | `0`–`1`. |
| `flipAugmentation` | | `false` | Random horizontal flips. |
| `shuffleTokens` / `keepTokens` | | `false` / `0` | Caption-tag shuffling. |
| `triggerWord` | | *(none)* | Activation token. Recommended for character / style LoRAs. |
| `trainingData.{type, sourceUrl, count}` | ✅ | — | Always `type: "zip"`. |
| `samples.prompts[]` | | `[]` | Preview prompts rendered after each epoch using the trained LoRA at strength 1.0. |
| `samples.negativePrompt` | | *(none)* | — |

## Reading the result

Same envelope as the other training recipes — see [SDXL/SD1 → Reading the result](./training-sdxl-sd1#reading-the-result) for the full shape. The relevant bit:

```json
{
  "output": {
    "moderationStatus": "Approved",
    "epochs": [
      {
        "epochNumber": 1,
        "model": { "id": "blob_...", "url": "https://.../epoch_1.safetensors" },
        "samples": [{ "id": "blob_...", "url": "https://.../sample_0.jpeg" }]
      }
    ]
  }
}
```

The `model` blob is your trained LoRA — download it (URLs are signed and expire), or use the blob URL directly with [Flux 1 image generation](./flux1) by referencing its AIR in the `loras` field.

## Runtime

Per-epoch wall time on a 10-image dataset, default settings:

| Variant | Per-epoch | 5-epoch full run |
|---------|-----------|-------------------|
| `dev` | ~60–120 s | 5–15 min |
| `schnell` | ~60–120 s | 5–15 min |

Always use `wait=0`.

## Cost

```
total = 200 × epochs   (Buzz)
```

| Configuration | Buzz |
|---------------|------|
| `epochs: 5` | 1000 + samples |
| `epochs: 10` | 2000 + samples |
| `epochs: 20` (max) | 4000 + samples |

Sample-prompt rendering is billed separately at the appropriate Flux 1 generation rate. Run with `whatif=true` (the **Preview cost** button on the widgets above) to see the exact pre-flight charge.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "modelVariant required" | Missing `modelVariant` field | Set to `"dev"` or `"schnell"`. |
| `400` with "epochs out of range" | `epochs` outside `1`–`20` | Cap at 20. |
| `400` with "trainingData.sourceUrl not reachable" | Signed URL expired | Regenerate. Prefer Civitai R2 AIRs over signed URLs for long-lived references. |
| Trained LoRA underbaked | Too few epochs for dataset, or `lr` too low | Raise `epochs` to 8–12 for character LoRAs; keep `lr` at `0.0001`–`0.0003`. |
| Trained LoRA overfits | Too many epochs / too high `networkDim` | Lower `epochs`, drop `networkDim` to 8–12. |
| Step `failed`, output `moderationStatus: "Rejected"` | Dataset failed content moderation | Replace flagged images. |

## Related

- [SDXL & SD1 LoRA training](./training-sdxl-sd1) — cheaper, classic SD ecosystems
- [Flux 2 Klein LoRA training](./training-flux2-klein) — current Flux generation, including image-edit training
- [Flux 1 image generation](./flux1) — use a trained LoRA via `loras: { "<lora-air>": 1.0 }`
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running training jobs
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) / [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
