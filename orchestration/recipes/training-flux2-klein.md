---
title: Flux 2 Klein LoRA training
---

<script setup>
const klein4bBody = {
  tags: ['training'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'flux2klein',
      modelVariant: '4b',
      epochs: 1,
      lr: 0.0005,
      trainTextEncoder: false,
      lrScheduler: 'constant',
      optimizerType: 'adamw8bit',
      networkDim: 2,
      networkAlpha: 1,
      noiseOffset: 0,
      flipAugmentation: false,
      shuffleTokens: false,
      keepTokens: 0,
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2658016TrainingData.1zGG.zip',
        count: 15,
      },
      samples: {
        prompts: [
          'fruit, food, no humans, blue eyes, solo, leaf, strawberry, fangs, pokemon (creature), standing',
          'no humans, pokemon (creature), cup, food, solo, bird, blush, blurry, animal focus, leaf',
          'no humans, candle, pokemon (creature), blurry, animal focus, solo, food, bird, standing',
        ],
      },
    },
  }],
};

const klein9bBody = {
  tags: ['training'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'flux2klein',
      modelVariant: '9b',
      epochs: 5,
      resolution: 1024,
      lr: 0.000102,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 32,
      networkAlpha: 32,
      noiseOffset: 0,
      flipAugmentation: false,
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2657604TrainingData.EYBd.zip',
        count: 1,
      },
      samples: { prompts: [] },
    },
  }],
};

const kleinEditBody = {
  tags: ['training', 'edit'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'flux2klein',
      modelVariant: '4b',
      isEditTraining: true,
      epochs: 3,
      lr: 0.0001,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 32,
      networkAlpha: 32,
      noiseOffset: 0,
      trainingData: {
        type: 'zip',
        sourceUrl: 'https://blobs-temp.sfo3.digitaloceanspaces.com/flux2_klein_edit_testdata.zip',
        count: 3,
      },
      samples: {
        prompts: [
          'a portrait of a woman standing in a sunlit garden with flowers',
          'a landscape painting of rolling hills at sunset',
          'a painting of a cat sitting on a windowsill looking outside at a rainy day',
        ],
        sourceImages: [
          'https://blobs-temp.sfo3.digitaloceanspaces.com/sample-edit-source-1.jpg',
          'https://blobs-temp.sfo3.digitaloceanspaces.com/sample-edit-source-2.jpg',
        ],
      },
    },
  }],
};
</script>

# Flux 2 Klein LoRA training

Train a Flux 2 Klein LoRA for use with the [Flux 2 image generation](./flux2) recipe. Two size tiers, plus a special **edit-training** mode for image-editing LoRAs that take control / reference images at inference time.

| `modelVariant` | Base | Buzz / epoch | Use when |
|----------------|------|--------------|----------|
| `4b` (default) | `FLUX.2-klein-base-4B` | 50 | Cheaper / faster training. Pairs with Klein `4b` inference. |
| `9b` | `FLUX.2-klein-base-9B` | 100 | Higher fidelity. Pairs with Klein `9b` inference. |

The base checkpoint is fixed by `modelVariant`; there is no `model` field on the input. Set `isEditTraining: true` to train an editing LoRA — the dataset zip layout changes (see [Edit training](#edit-training)).

::: tip Long-running step
Always submit with `wait=0`. Klein training takes ~10–60s per epoch on a 10-image dataset; full multi-epoch runs land in single-digit minutes for `4b`, longer for `9b`.
:::

## The request shape

```json
{
  "$type": "training",
  "input": {
    "engine":         "ai-toolkit",
    "ecosystem":      "flux2klein",
    "modelVariant":   "4b",         // 4b | 9b
    "isEditTraining": false         // optional, defaults to false
  }
}
```

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A training-data zip:
  - For standard training: a flat zip of training images
  - For [edit training](#edit-training): a zip with `main/`, `control_1/`, `control_2/`, `control_3/` subfolders

## Klein 4b (default)

Fastest and cheapest tier. Default for most LoRAs.

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
      "ecosystem": "flux2klein",
      "modelVariant": "4b",
      "epochs": 1,
      "lr": 0.0005,
      "trainTextEncoder": false,
      "lrScheduler": "constant",
      "optimizerType": "adamw8bit",
      "networkDim": 2,
      "networkAlpha": 1,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2658016TrainingData.1zGG.zip",
        "count": 15
      },
      "samples": {
        "prompts": [
          "fruit, food, no humans, blue eyes, solo, leaf, strawberry, fangs, pokemon (creature)",
          "no humans, pokemon (creature), cup, food, solo, bird, blush, blurry, animal focus",
          "no humans, candle, pokemon (creature), blurry, animal focus, solo, food, bird, standing"
        ]
      }
    }
  }]
}
```

<RecipeRun :body="klein4bBody" :wait="0" />

## Klein 9b

Same shape, larger base model. Recommended `epochs: 5`+, `networkDim: 32`, `lr: ~1e-4`.

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
      "ecosystem": "flux2klein",
      "modelVariant": "9b",
      "epochs": 5,
      "resolution": 1024,
      "lr": 0.000102,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 32,
      "networkAlpha": 32,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2657604TrainingData.EYBd.zip",
        "count": 1
      },
      "samples": { "prompts": [] }
    }
  }]
}
```

<RecipeRun :body="klein9bBody" :wait="0" />

## Edit training {#edit-training}

Setting `isEditTraining: true` produces an **editing LoRA** — at inference time it takes one or more reference images alongside the prompt and modifies them. The dataset zip layout differs:

- `main/` — target images (what the LoRA should produce)
- `control_1/`, `control_2/`, `control_3/` — reference / source images that pair with each `main/` entry

Filenames inside the subfolders must align across folders. Reading the result you'll get a LoRA that works with [Flux 2 Klein → editImage](./flux2#edit-image-editimage).

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "tags": ["training", "edit"],
  "steps": [{
    "$type": "training",
    "priority": "normal",
    "retries": 2,
    "input": {
      "engine": "ai-toolkit",
      "ecosystem": "flux2klein",
      "modelVariant": "4b",
      "isEditTraining": true,
      "epochs": 3,
      "lr": 0.0001,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 32,
      "networkAlpha": 32,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "https://blobs-temp.sfo3.digitaloceanspaces.com/flux2_klein_edit_testdata.zip",
        "count": 3
      },
      "samples": {
        "prompts": [
          "a portrait of a woman standing in a sunlit garden with flowers",
          "a landscape painting of rolling hills at sunset",
          "a painting of a cat sitting on a windowsill looking outside at a rainy day"
        ],
        "sourceImages": [
          "https://blobs-temp.sfo3.digitaloceanspaces.com/sample-edit-source-1.jpg",
          "https://blobs-temp.sfo3.digitaloceanspaces.com/sample-edit-source-2.jpg"
        ]
      }
    }
  }]
}
```

<RecipeRun :body="kleinEditBody" :wait="0" />

`samples.sourceImages` is required for edit training when you want preview samples — the listed URLs become the reference images for the per-epoch sample renders.

## Common parameters {#common-parameters}

Defaults shown are the post-`ApplyDefaults` values for Klein.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `engine` | ✅ | — | Always `ai-toolkit`. |
| `ecosystem` | ✅ | — | Always `flux2klein` for this page. |
| `modelVariant` | ✅ | — | `4b` or `9b`. |
| `isEditTraining` | | `false` | When `true`, dataset zip must contain `main/` + `control_*/` subfolders. |
| `epochs` | | `5` | `1`–`20`. Billed per epoch. |
| `numberOfRepeats` | | auto: `ceil(200 / count)` | `1`–`5000`. |
| `lr` | | `0.0001` | Klein is sensitive to high LRs — keep in `1e-4`–`5e-4`. |
| `trainTextEncoder` | | `false` | Klein uses Qwen-3 as its text encoder; AI Toolkit does not train it. Leave `false`. |
| `lrScheduler` | | `cosine` | `constant`, `constant_with_warmup`, `cosine`, `linear`, `step`. |
| `optimizerType` | | `adamw8bit` | See SDXL/SD1 page for full enum. |
| `networkDim` | | `32` | `1`–`256`. Klein LoRAs are typically `16`–`32`. |
| `networkAlpha` | | matches `networkDim` | `1`–`256`. |
| `noiseOffset` | | `0` | `0`–`1`. |
| `flipAugmentation` | | `false` | Random horizontal flips. |
| `shuffleTokens` / `keepTokens` | | `false` / `0` | Caption-tag shuffling. |
| `triggerWord` | | *(none)* | Activation token. |
| `trainingData.{type, sourceUrl, count}` | ✅ | — | `type: "zip"`. For edit training, `count` should equal the number of `main/` entries. |
| `samples.prompts[]` | | `[]` | Per-epoch preview prompts. |
| `samples.negativePrompt` | | *(none)* | — |
| `samples.sourceImages[]` | | `[]` | Edit-training only — reference images for sample renders. |

## Reading the result

Same envelope as the other training recipes — see [SDXL/SD1 → Reading the result](./training-sdxl-sd1#reading-the-result). Each epoch yields a Klein LoRA `.safetensors` blob plus any sample images.

To use the trained LoRA, register it on Civitai (or reference its blob URN directly) and pass it under `loras` in a [Flux 2 Klein generation](./flux2#klein-default) request:

```json
{
  "$type": "imageGen",
  "input": {
    "engine": "flux2",
    "model": "klein",
    "operation": "createImage",
    "modelVersion": "4b",
    "prompt": "your prompt",
    "loras": { "urn:air:flux2:lora:civitai:<id>@<version>": 1.0 }
  }
}
```

## Runtime

Per-epoch wall time, default settings on a 10-image dataset:

| Variant | Per-epoch | Typical full run |
|---------|-----------|-------------------|
| `4b` | ~10–30 s | 1–5 min for 5 epochs |
| `9b` | ~30–90 s | 5–15 min for 5 epochs |
| `4b` + `isEditTraining` | ~20–45 s | 2–8 min for 5 epochs (more steps per epoch) |

Always use `wait=0`.

## Cost

```
total = costPerEpoch × epochs
costPerEpoch = 50 (4b), 100 (9b)
```

| Configuration | Buzz |
|---------------|------|
| Klein `4b`, `epochs: 5` | 250 + samples |
| Klein `4b`, `epochs: 1` | 50 + samples |
| Klein `9b`, `epochs: 5` | 500 + samples |
| Klein `9b`, `epochs: 10` | 1000 + samples |

Sample-prompt rendering is billed separately at Klein image-generation rates (~8 Buzz per sample for `4b`, ~16 for `9b`). Run with `whatif=true` to see exact charges.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "modelVariant required" | Missing `modelVariant` | Set to `"4b"` or `"9b"`. |
| `400` with "isEditTraining: true requires control folders" | Edit-training zip missing `control_*/` subfolders | Repackage the zip with `main/`, `control_1/`, `control_2/`, `control_3/`. Filenames must align across folders. |
| Step `failed` mentioning "training data validation" | Edit-training zip filenames don't match across `main/` and `control_*/` | Ensure the same basenames appear in `main/` and at least one `control_*/` folder. |
| Trained LoRA underbaked | Too few epochs / too low `lr` | Raise `epochs` to 5–10; keep `lr` ≤ `5e-4`. |
| Trained LoRA overcooked / broken samples | `lr` too high | Drop `lr` to `1e-4`–`2e-4`. |
| Step `failed`, `moderationStatus: "Rejected"` | Dataset failed content moderation | Replace flagged images. |

## Related

- [Flux 1 LoRA training](./training-flux1) — open-weights Flux LoRAs (Dev / Schnell)
- [SDXL & SD1 LoRA training](./training-sdxl-sd1) — cheaper SD-family ecosystems
- [Flux 2 image generation](./flux2) — use a trained Klein LoRA via `loras: { ... }` on `model: "klein"`
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running training jobs
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) / [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
