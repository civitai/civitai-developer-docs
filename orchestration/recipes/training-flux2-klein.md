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
      steps: 2000,
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
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
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
      steps: 2000,
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
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
        count: 15,
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
      steps: 2000,
      lr: 0.0001,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 32,
      networkAlpha: 32,
      noiseOffset: 0,
      trainingData: {
        type: 'zip',
        sourceUrl: 'https://example.com/your-edit-dataset.zip',
        count: 3,
      },
      samples: {
        prompts: [
          'a portrait of a woman standing in a sunlit garden with flowers',
          'a landscape painting of rolling hills at sunset',
          'a painting of a cat sitting on a windowsill looking outside at a rainy day',
        ],
        sourceImages: [
          'https://example.com/your-source-image-1.jpg',
          'https://example.com/your-source-image-2.jpg',
        ],
      },
    },
  }],
};
</script>

# Flux 2 Klein LoRA training

Train a Flux 2 Klein LoRA for use with the [Flux 2 image generation](./flux2) recipe. Two size tiers, plus a special **edit-training** mode for image-editing LoRAs that take control / reference images at inference time.

| `modelVariant` | Base | Default price | Use when |
|----------------|------|---------------|----------|
| `4b` (default) | `FLUX.2-klein-base-4B` | 500 Buzz | Cheaper / faster training. Pairs with Klein `4b` inference. |
| `9b` | `FLUX.2-klein-base-9B` | 1000 Buzz | Higher fidelity. Pairs with Klein `9b` inference. |

The base checkpoint is fixed by `modelVariant`; there is no `model` field on the input. Set `isEditTraining: true` to train an editing LoRA — the dataset zip layout changes (see [Edit training](#edit-training)).

Submit with `wait=0`: a typical 2000-step run lands in single-digit minutes for `4b`, longer for `9b`. The request fields, training data, continuing a run and live progress are shared by every ecosystem — see the [LoRA training overview](./training).

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

- A training-data zip addressed by an AIR ([accepted sources](./training#training-data)):
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
      "steps": 2000,
      "lr": 0.0005,
      "trainTextEncoder": false,
      "lrScheduler": "constant",
      "optimizerType": "adamw8bit",
      "networkDim": 2,
      "networkAlpha": 1,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip",
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

Same shape, larger base model. Recommended `steps: 2000`+, `networkDim: 32`, `lr: ~1e-4`.

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
      "steps": 2000,
      "resolution": 1024,
      "lr": 0.000102,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 32,
      "networkAlpha": 32,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip",
        "count": 15
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
      "steps": 2000,
      "lr": 0.0001,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 32,
      "networkAlpha": 32,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "https://example.com/your-edit-dataset.zip",
        "count": 3
      },
      "samples": {
        "prompts": [
          "a portrait of a woman standing in a sunlit garden with flowers",
          "a landscape painting of rolling hills at sunset",
          "a painting of a cat sitting on a windowsill looking outside at a rainy day"
        ],
        "sourceImages": [
          "https://example.com/your-source-image-1.jpg",
          "https://example.com/your-source-image-2.jpg"
        ]
      }
    }
  }]
}
```

::: warning Placeholder URLs
Replace the `https://example.com/…` URLs with your own edit-training zip and reference images before submitting.
:::

<!-- test-skip: the edit dataset and source images are reader-supplied placeholders -->
<RecipeRun :body="kleinEditBody" :wait="0" />

`samples.sourceImages` is required for edit training when you want preview samples — the listed URLs become the reference images for the per-checkpoint sample renders.

## Klein parameters {#common-parameters}

Fields and defaults not listed here are as in the overview's [common parameters](./training#common-parameters).

| Field | Klein default | Notes |
|-------|---------------|-------|
| `modelVariant` | ✅ required | `4b` or `9b`. |
| `isEditTraining` | `false` | When `true`, dataset zip must contain `main/` + `control_*/` subfolders. |
| `epochs` | `round(steps / 200)` | Each adds 10 Buzz of storage. |
| `batchSize` | `1` | For `4b`, up to **2**; for `9b` it is fixed at 1. |
| `continueFrom` | *(none)* | A Klein (`urn:air:flux2:lora:...`) LoRA to resume from. |
| `lr` | `0.0001` | Klein is sensitive to high LRs — keep in `1e-4`–`5e-4`. |
| `trainTextEncoder` | `false` | Klein uses Qwen-3 as its text encoder; AI Toolkit does not train it. Leave `false`. |
| `networkDim` | `32` | Klein LoRAs are typically `16`–`32`. |
| `trainingData.count` | ✅ (zip) | For edit training, `count` should equal the number of `main/` entries. |
| `samples.sourceImages[]` | `[]` | Edit-training only — reference images for sample renders. |

## Reading the result

The [standard training output](./training#reading-the-result): each saved checkpoint yields a Klein LoRA `.safetensors` blob plus any sample images.

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

Per-step wall time, default settings on a 10-image dataset:

| Variant | Per-step | Typical full run |
|---------|----------|-------------------|
| `4b` | ~0.1–0.3 s | 3–10 min for 2000 steps |
| `9b` | ~0.3–0.6 s | 10–30 min for 2000 steps |
| `4b` + `isEditTraining` | ~0.2–0.5 s | 5–15 min for 2000 steps |

## Cost

The [training cost formula](./training#cost) with Klein rates:

```
price = steps × costPerStep + epochs × 10        (rounded)
costPerStep = 0.20 (4b), 0.45 (9b)
floor: never less than 80% of the default-configuration price
```

Each epoch adds 10 Buzz of storage. With both `steps` and `epochs` omitted the run is **2000 steps / 10 epochs** (the examples at the top of the page send `steps: 2000`, which also resolves to 10 epochs):

- `4b`: `2000 × 0.20 + 10 × 10 = 400 + 100 = 500 Buzz` (floor 400)
- `9b`: `2000 × 0.45 + 10 × 10 = 900 + 100 = 1000 Buzz` (floor 800)

| Configuration | Buzz |
|---------------|------|
| Klein `4b`, default (`steps: 2000`, `epochs: 10`) | 500 + samples |
| Klein `4b`, `steps: 1000`, `epochs: 10` | 400 + samples (floor) |
| Klein `9b`, default (`steps: 2000`, `epochs: 10`) | 1000 + samples |
| Klein `9b`, `steps: 1000`, `epochs: 10` | 800 + samples (floor) |

Sample-prompt rendering is billed separately at Klein image-generation rates (~8 Buzz per sample for `4b`, ~16 for `9b`). Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

## Troubleshooting

`steps` out of range, an unresolvable `sourceUrl`, a `count` mismatch and a rejected dataset are covered in the [overview's troubleshooting](./training#troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "modelVariant required" | Missing `modelVariant` | Set to `"4b"` or `"9b"`. |
| `400` with "isEditTraining: true requires control folders" | Edit-training zip missing `control_*/` subfolders | Repackage the zip with `main/`, `control_1/`, `control_2/`, `control_3/`. Filenames must align across folders. |
| Step `failed` mentioning "training data validation" | Edit-training zip filenames don't match across `main/` and `control_*/` | Ensure the same basenames appear in `main/` and at least one `control_*/` folder. |
| Trained LoRA underbaked | Too few steps / too low `lr` | Raise `steps` to 1500–2500; keep `lr` ≤ `5e-4`. |
| Trained LoRA overcooked / broken samples | `lr` too high | Drop `lr` to `1e-4`–`2e-4`. |

## Related

- [LoRA training overview](./training) — shared parameters, training data, live progress and cost formula
- [Flux 1 LoRA training](./training-flux1) — open-weights Flux LoRAs (Dev / Schnell)
- [SDXL & SD1 LoRA training](./training-sdxl-sd1) — cheaper SD-family ecosystems
- [Flux 2 image generation](./flux2) — use a trained Klein LoRA via `loras: { ... }` on `model: "klein"`
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running training jobs
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [`training` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
