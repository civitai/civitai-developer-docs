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
      steps: 2000,
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
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
        count: 15,
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
      steps: 2000,
      lr: 0.0001,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 16,
      networkAlpha: 16,
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
        count: 15,
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

The base checkpoint is fixed by `modelVariant` — there's no `model` field to override, so training against another Flux.1 finetune as the base isn't supported.

Flux 1 is the most expensive AI Toolkit image ecosystem (2000 Buzz for the default run); a typical 2000-step run on a 10-image dataset takes several minutes. Submit with `wait=0`. The request fields, training data, continuing a run and live progress are shared by every ecosystem — see the [LoRA training overview](./training).

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

- A training-data zip addressed by an AIR ([accepted sources](./training#training-data)), with an accurate `count` of images

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
      "steps": 2000,
      "resolution": 1024,
      "lr": 0.0001,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 16,
      "networkAlpha": 16,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip",
        "count": 15
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
      "steps": 2000,
      "lr": 0.0001,
      "trainTextEncoder": false,
      "networkDim": 16,
      "networkAlpha": 16,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip",
        "count": 15
      },
      "samples": { "prompts": ["a photo of TOK", "TOK in a garden"] }
    }
  }]
}
```

<RecipeRun :body="flux1SchnellBody" :wait="0" />

## Flux 1 parameters {#common-parameters}

Fields and defaults not listed here are as in the overview's [common parameters](./training#common-parameters).

| Field | Flux 1 default | Notes |
|-------|----------------|-------|
| `modelVariant` | ✅ required | `dev` or `schnell`. Determines the base checkpoint. |
| `epochs` | `round(steps / 200)` | Each adds **20 Buzz** of storage. |
| `batchSize` | `1` | Fixed at 1 for this ecosystem. |
| `continueFrom` | *(none)* | A Flux 1 LoRA (`urn:air:flux1:lora:...`) to resume from. |
| `lr` | `0.0001` | Flux 1 is sensitive to high LRs — keep ≤ `0.0005`. |
| `trainTextEncoder` | `false` | Flux 1 does not benefit much from text-encoder training. Leave off. |
| `networkDim` | `16` | Flux 1's lower default reflects how compactly Flux LoRAs encode style/character vs. SD-family. |

## Reading the result

The [standard training output](./training#reading-the-result): each saved epoch's Flux 1 LoRA blob plus sample images. Use the LoRA in [Flux 1 image generation](./flux1) by referencing its AIR in the `loras` field.

## Runtime

Per-step wall time on a 10-image dataset, default settings:

| Variant | Per-step | 2000-step full run |
|---------|----------|--------------------|
| `dev` | ~0.3–0.7 s | 10–30 min |
| `schnell` | ~0.3–0.7 s | 10–30 min |

## Cost

The [training cost formula](./training#cost) with Flux 1 rates:

```
price = steps × costPerStep + epochs × 20        (rounded)
costPerStep = 0.9   (dev and schnell)
floor: never less than 80% of the default-configuration price
```

Each epoch adds 20 Buzz of storage. With both `steps` and `epochs` omitted the run is **2000 steps / 10 epochs** (the examples at the top of the page send `steps: 2000`, which also resolves to 10 epochs) → `2000 × 0.9 + 10 × 20 = 1800 + 200 = 2000 Buzz`. The **floor** is 80% of the default price (1600 Buzz).

| Configuration | Buzz |
|---------------|------|
| default (`steps: 2000`, `epochs: 10`) | 2000 + samples |
| `steps: 1000`, `epochs: 10` | 1600 + samples (floor) |
| `steps: 2000`, `epochs: 20` | 2200 + samples (+200 for 10 more checkpoints) |

Sample-prompt rendering is billed separately at the appropriate Flux 1 generation rate. Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

## Troubleshooting

`steps` out of range, an unresolvable `sourceUrl`, a `count` mismatch and a rejected dataset are covered in the [overview's troubleshooting](./training#troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "modelVariant required" | Missing `modelVariant` field | Set to `"dev"` or `"schnell"`. |
| Trained LoRA underbaked | Too few steps for dataset, or `lr` too low | Raise `steps` to 1500–2500 for character LoRAs; keep `lr` at `0.0001`–`0.0003`. |
| Trained LoRA overfits | Too many steps / too high `networkDim` | Lower `steps`, drop `networkDim` to 8–12. |

## Related

- [LoRA training overview](./training) — shared parameters, training data, live progress and cost formula
- [SDXL & SD1 LoRA training](./training-sdxl-sd1) — cheaper, classic SD ecosystems
- [Flux 2 Klein LoRA training](./training-flux2-klein) — current Flux generation, including image-edit training
- [Flux 1 image generation](./flux1) — use a trained LoRA via `loras: { "<lora-air>": 1.0 }`
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running training jobs
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [`training` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
