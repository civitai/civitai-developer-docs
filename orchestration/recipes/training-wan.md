---
title: Wan video LoRA training
---

<script setup>
const wan21Body = {
  tags: ['training', 'video'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'wan',
      modelVariant: '2.1',
      steps: 2000,
      resolution: 512,
      lr: 0.0002,
      trainTextEncoder: false,
      lrScheduler: 'constant',
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

# Wan video LoRA training

::: warning Preview ecosystem
Wan video training is currently marked **Preview** in the orchestrator. The endpoint accepts requests and `whatif=true` cost previews work, but actual training runs may not be available on every worker fleet. Reach out via [Civitai Discord](https://civitai.com/discord) before integrating against production traffic.
:::

Train a [WAN](./wan) video LoRA on a small set of source video clips using AI Toolkit. Output is a video LoRA usable in WAN text-to-video and image-to-video generation.

| `modelVariant` | Wan family | Default price |
|----------------|-----------|---------------|
| `2.1` | Wan 2.1 (14B) | 3000 Buzz |
| `2.2` | Wan 2.2 (14B-A14B) | 3000 Buzz |

Video training is the slowest training mode on the platform — a 2000-step run on a 4-clip dataset takes many minutes. Submit with `wait=0`. The request fields, training data, continuing a run and live progress are shared by every ecosystem — see the [LoRA training overview](./training).

## The request shape

```json
{
  "$type": "training",
  "input": {
    "engine":       "ai-toolkit",
    "ecosystem":    "wan",
    "modelVariant": "2.1"        // 2.1 | 2.2
  }
}
```

## Prerequisites

- A training-data zip of images, video clips, or a mix — addressed by an AIR ([accepted sources](./training#training-data)), with an accurate `count` of items. Keep clips to a few seconds at a similar resolution.

## Wan 2.1 / 2.2

Both variants share the same input shape and per-step cost; pick the one that matches your inference target. The example below uses `2.1`; swap `modelVariant` to `"2.2"` for Wan 2.2 training (no other change required).

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
      "ecosystem": "wan",
      "modelVariant": "2.1",
      "steps": 2000,
      "resolution": 512,
      "lr": 0.0002,
      "trainTextEncoder": false,
      "lrScheduler": "constant",
      "optimizerType": "adamw8bit",
      "networkDim": 32,
      "networkAlpha": 32,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip",
        "count": 15
      },
      "samples": {
        "prompts": ["a video of TOK", "TOK moving in a garden"]
      }
    }
  }]
}
```

<RecipeRun :body="wan21Body" :wait="0" />

## Wan parameters {#common-parameters}

Fields and defaults not listed here are as in the overview's [common parameters](./training#common-parameters).

| Field | Wan default | Notes |
|-------|-------------|-------|
| `modelVariant` | ✅ required | `2.1` or `2.2`. |
| `epochs` | `round(steps / 200)` | **Each adds 200 Buzz** — Wan's per-epoch preview samples are videos and expensive to compute, so keep the epoch count modest. |
| `batchSize` | `1` | Fixed at 1 for this ecosystem. |
| `continueFrom` | *(none)* | A Wan LoRA (`urn:air:wan:lora:...`) to resume from. |
| `lr` | `0.0001` | `0.0002` is a typical override for video; see example. |
| `trainTextEncoder` | `false` | Leave off — Wan training does not benefit from text-encoder updates. |
| `triggerWord` | *(none)* | Some video ecosystems reject `triggerWord` — leave it empty if you see schema rejections. |
| `trainingData` | ✅ | Images, video clips, or a mix; the example uses an image dataset. |
| `samples.prompts[]` | `[]` | Preview videos rendered at each saved checkpoint with the trained LoRA. |

## Reading the result

The [standard training output](./training#reading-the-result): each saved checkpoint yields a video LoRA `.safetensors` blob plus any sample `.mp4` files. The trained LoRA is usable in [WAN video generation](./wan) by referencing it in the `loras` field.

## Runtime

Wall time, default settings on a 4-clip dataset:

| Variant | Per 100 steps | Typical full run |
|---------|---------------|-------------------|
| `2.1` | ~1–3 min | 20–60 min for 2000 steps |
| `2.2` | ~1–3 min | 20–60 min for 2000 steps |

## Cost

The [training cost formula](./training#cost) with Wan rates:

```
price = steps × costPerStep + epochs × 200       (rounded)
costPerStep = 0.5   (2.1 and 2.2)
floor: never less than 80% of the default-configuration price
```

Wan's per-epoch surcharge is **200 Buzz** (not 10 like image ecosystems) because each epoch's preview samples are videos and expensive to compute — so most of Wan's cost is in the epoch count, not the step count. With both `steps` and `epochs` omitted the run is **2000 steps / 10 epochs** (the example at the top of the page sends `steps: 2000`, which also resolves to 10 epochs) → `2000 × 0.5 + 10 × 200 = 1000 + 2000 = 3000 Buzz`. The **floor** is 80% of the default price (2400 Buzz).

Lowering `epochs` saves the most. Sample-prompt rendering itself uses Wan video-generation rates and is billed separately. Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

| Configuration | Buzz (training only) |
|---------------|---------------------|
| default (`steps: 2000`, `epochs: 10`) | 3000 + samples |
| `steps: 2000`, `epochs: 20` | 5000 + samples (each extra checkpoint adds 200) |
| `steps: 1000`, `epochs: 5` | 2400 + samples (floor) |

## Troubleshooting

`steps` out of range, an unresolvable `sourceUrl`, a `count` mismatch and a rejected dataset are covered in the [overview's troubleshooting](./training#troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "modelVariant required" | Missing `modelVariant` | Set to `"2.1"` or `"2.2"`. |
| Step starts then fails immediately | Wan training not yet available for your request | Contact Civitai support. |
| Step `failed` with VRAM-related error | Resolution × clip length too high for the worker | Lower `resolution` (e.g. to `512`), shorten clips to ≤ 3 seconds. |
| Trained LoRA produces static / no motion | Too few steps, too few / too short clips | Raise `steps`; ensure clips show the motion you want learned. |

## Related

- [LoRA training overview](./training) — shared parameters, training data, live progress and cost formula
- [LTX2 video LoRA training](./training-ltx2) — Lightricks LTX video LoRA training (also video, less expensive previews on LTX2.3)
- [WAN video generation](./wan) — use a trained LoRA in WAN inference
- [Flux 2 Klein LoRA training](./training-flux2-klein) — image-side counterpart
- [Results & webhooks](/orchestration/guide/results-and-webhooks)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [`training` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
