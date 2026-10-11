---
title: LTX2 video LoRA training
---

<script setup>
const ltx2Body = {
  tags: ['training', 'video'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'ltx2',
      steps: 3000,
      resolution: 768,
      lr: 0.0002,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 32,
      networkAlpha: 32,
      flipAugmentation: false,
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
        count: 15,
      },
      samples: {
        prompts: ['a video of TOK', 'TOK moving in a garden'],
      },
    },
  }],
};

const ltx23Body = {
  tags: ['training', 'video'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'ltx23',
      steps: 3000,
      lr: 0.0001,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 32,
      networkAlpha: 32,
      flipAugmentation: false,
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
        count: 15,
      },
      samples: {
        prompts: ['a video of TOK', 'TOK moving in a garden'],
      },
    },
  }],
};
</script>

# LTX2 video LoRA training

Train a Lightricks LTX video LoRA on a small set of source video clips using AI Toolkit. The output LoRA is usable in [LTX2 video generation](./ltx2).

| `ecosystem` | Base | Default price | Notes |
|-------------|------|---------------|-------|
| `ltx2` | `Lightricks/LTX-2` (19B) | 2750 Buzz | Original LTX2. |
| `ltx23` | `Lightricks/LTX-2.3` (22B) | 2750 Buzz | Newer LTX 2.3. |

The base checkpoint is fixed by `ecosystem`; there's no `model` field on the input.

Video training is the slowest training mode on the platform — video needs a longer run, so the LTX **default is 3000 steps** (vs 2000 for image ecosystems). Submit with `wait=0`. The request fields, training data, continuing a run and live progress are shared by every ecosystem — see the [LoRA training overview](./training).

## The request shape

```json
{
  "$type": "training",
  "input": {
    "engine":    "ai-toolkit",
    "ecosystem": "ltx2"          // ltx2 | ltx23
  }
}
```

## Prerequisites

- A training-data zip of images, video clips, or a mix — addressed by an AIR ([accepted sources](./training#training-data)), with an accurate `count` of items

## LTX2

Original 19B-parameter LTX video model. `resolution: 768` is the typical training resolution.

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "tags": ["training", "video"],
  "steps": [{
    "$type": "training",
    "priority": "normal",
    "retries": 2,
    "input": {
      "engine": "ai-toolkit",
      "ecosystem": "ltx2",
      "steps": 3000,
      "resolution": 768,
      "lr": 0.0002,
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
      "samples": { "prompts": ["a video of TOK", "TOK moving in a garden"] }
    }
  }]
}
```

<RecipeRun :body="ltx2Body" :wait="0" />

## LTX 2.3

Newer 22B model. Same shape as LTX2; `lr` is typically lower. Both LTX ecosystems share the same rates and 3000-step default, so the default price matches (2750 Buzz).

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "tags": ["training", "video"],
  "steps": [{
    "$type": "training",
    "priority": "normal",
    "retries": 2,
    "input": {
      "engine": "ai-toolkit",
      "ecosystem": "ltx23",
      "steps": 3000,
      "lr": 0.0001,
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
      "samples": { "prompts": ["a video of TOK", "TOK moving in a garden"] }
    }
  }]
}
```

<RecipeRun :body="ltx23Body" :wait="0" />

## LTX parameters {#common-parameters}

Defaults apply to both LTX ecosystems. Fields and defaults not listed here are as in the overview's [common parameters](./training#common-parameters).

| Field | LTX default | Notes |
|-------|-------------|-------|
| `steps` | `3000` | Video needs a longer run, hence the higher default. |
| `epochs` | `round(steps / 200)` | `15` for `steps: 3000`; `10` if `steps` is omitted too. **Each adds 50 Buzz** — LTX preview samples are videos and costly to compute. |
| `batchSize` | `1` | Fixed at 1 for this ecosystem. |
| `continueFrom` | *(none)* | A LoRA of the same ecosystem (`urn:air:ltx2:lora:...` / `urn:air:ltx23:lora:...`) to resume from. |
| `lr` | `0.0001` | LTX2 examples often use `0.0002`; LTX 2.3 typically `0.0001`. |
| `trainTextEncoder` | `false` | Leave off — LTX text encoder is not retrained by AI Toolkit. |
| `trainingData` | ✅ | Images, video clips, or a mix; the example uses an image dataset. |
| `samples.prompts[]` | `[]` | Preview videos rendered at each saved checkpoint. |

## Reading the result

The [standard training output](./training#reading-the-result): each saved checkpoint yields a video LoRA `.safetensors` blob plus any sample `.mp4` files. Use the trained LoRA in [LTX2 video generation](./ltx2) by referencing it in the workflow's `loras` field.

## Runtime

Wall time, default settings on a 4-clip dataset:

| Ecosystem | Per 100 steps | Typical full run |
|-----------|---------------|-------------------|
| `ltx2` | ~1–2 min | 30–60 min for 3000 steps |
| `ltx23` | ~2–3 min | 60–90 min for 3000 steps |

## Cost

The [training cost formula](./training#cost) with LTX rates:

```
price = steps × costPerStep + epochs × 50        (rounded)
costPerStep = 0.75   (ltx2 and ltx23)
floor: never less than 80% of the default-configuration price
```

Each epoch adds 50 Buzz. With both `steps` and `epochs` omitted the run is **3000 steps / 10 epochs** → `3000 × 0.75 + 10 × 50 = 2250 + 500 = 2750 Buzz`. The **floor** is 80% of that price (2200 Buzz).

The examples at the top of the page send `steps: 3000` with no `epochs`, so they get `round(3000 / 200) = 15` epochs: `15 × (200 × 0.75 + 50) = 15 × 200 = 3000 Buzz`. Send `epochs: 10` alongside `steps: 3000` to get the 2750 price.

| Configuration | Buzz (training only) |
|---------------|---------------------|
| LTX2 / LTX 2.3, default (`steps: 3000`, `epochs: 10`) | 2750 + samples |
| LTX2 / LTX 2.3, `steps: 3000`, `epochs: 20` | 3250 + samples (+500 for 10 more checkpoints) |
| LTX2 / LTX 2.3, `steps: 2000`, `epochs: 10` | 2200 + samples (floor) |

Sample-prompt rendering uses LTX2 video-generation rates and is billed separately. Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

## Troubleshooting

`steps` out of range, an unresolvable `sourceUrl`, a `count` mismatch and a rejected dataset are covered in the [overview's troubleshooting](./training#troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Step `failed` with VRAM-related error | Resolution × clip length too high | Lower `resolution` (e.g. to `512`), shorten clips. |
| Training cost surprises you | Video defaults to 3000 steps, so the floor is higher than image ecosystems | Check `whatif=true` before submitting. Lowering `steps`/`epochs` saves at most 20% (the floor). |
| Trained LoRA produces no motion | Too few steps / static reference clips | Raise `steps`, ensure clips show the motion you want learned. |

## Related

- [LoRA training overview](./training) — shared parameters, training data, live progress and cost formula
- [Wan video LoRA training](./training-wan) — Wan video LoRA training (preview)
- [LTX2 video generation](./ltx2) — use a trained LoRA in LTX2 inference
- [Flux 2 Klein LoRA training](./training-flux2-klein) — image-side counterpart
- [Results & webhooks](/orchestration/guide/results-and-webhooks)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [`training` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
