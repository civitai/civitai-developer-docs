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
        sourceUrl: 'urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/5418/2202966TrainingData.Kjwp.zip',
        count: 4,
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

::: tip Long-running step
Video training is the slowest training mode on the platform — a 2000-step run on a 4-clip dataset takes many minutes. Always use `wait=0` and follow up via webhook or polling.
:::

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

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A training-data zip containing source video clips (each ≤ a few seconds, similar resolution)
- An accurate `count` of clips in the zip

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
        "sourceUrl": "urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/5418/2202966TrainingData.Kjwp.zip",
        "count": 4
      },
      "samples": {
        "prompts": ["a video of TOK", "TOK moving in a garden"]
      }
    }
  }]
}
```

<RecipeRun :body="wan21Body" :wait="0" />

## Common parameters {#common-parameters}

Defaults shown are the post-`ApplyDefaults` values for Wan.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `engine` | ✅ | — | Always `ai-toolkit`. |
| `ecosystem` | ✅ | — | Always `wan` for this page. |
| `modelVariant` | ✅ | — | `2.1` or `2.2`. |
| `steps` | | `2000` | `1`–`10000`. Total training steps. Primary driver of training length. |
| `epochs` | | `10` | `1`–`20`. Number of saved checkpoints delivered, each separately downloadable. **Each adds 200 Buzz** — Wan's per-epoch preview samples are videos and expensive to compute, so keep the epoch count modest. |
| `batchSize` | | `1` | Fixed at 1 for this ecosystem. |
| `continueFrom` | | *(none)* | A previously-trained `urn:air:wan:lora:...` AIR to resume from (see [Continue training](#continue-training)). Must be a Wan LoRA. |
| `lr` | | `0.0001` | `0.0002` is a typical override for video; see example. |
| `trainTextEncoder` | | `false` | Leave off — Wan training does not benefit from text-encoder updates. |
| `lrScheduler` | | `cosine` | `constant`, `constant_with_warmup`, `cosine`, `linear`, `step`. |
| `optimizerType` | | `adamw8bit` | See SDXL/SD1 page for full enum. |
| `networkDim` | | `32` | `1`–`256`. |
| `networkAlpha` | | matches `networkDim` | `1`–`256`. |
| `noiseOffset` | | `0` | `0`–`1`. |
| `flipAugmentation` | | `false` | Random horizontal flips. |
| `shuffleTokens` / `keepTokens` | | `false` / `0` | Caption-tag shuffling. |
| `triggerWord` | | *(none)* | Activation token. Per the source, not all video ecosystems support `triggerWord` — leave empty if you see schema rejections. |
| `trainingData.{type, sourceUrl, count}` | ✅ | — | `type: "zip"`. Zip should contain video clips. |
| `samples.prompts[]` | | `[]` | Preview videos rendered at each saved checkpoint with the trained LoRA. |
| `samples.negativePrompt` | | *(none)* | — |
| `samples.cfgScale` | | *(ecosystem default)* | Overrides the CFG / guidance scale used when rendering the preview samples. |
| `samples.strength` | | `1.0` | Trained-LoRA weight applied in the preview samples. |

## Continue training / train further {#continue-training}

To resume from a Wan LoRA you already trained instead of starting from the base checkpoint, set `continueFrom` to that LoRA's AIR. The new run starts from those weights and the new epochs build on top:

```json
{
  "$type": "training",
  "input": {
    "engine": "ai-toolkit",
    "ecosystem": "wan",
    "modelVariant": "2.1",
    "continueFrom": "urn:air:wan:lora:civitai:<id>@<version>",
    "steps": 1000
  }
}
```

`continueFrom` must point at a LoRA of the **same ecosystem** (a Wan LoRA) as the model being trained — a mismatched ecosystem is rejected.

## Reading the result

Same envelope as the other training recipes — see [SDXL/SD1 → Reading the result](./training-sdxl-sd1#reading-the-result). Each saved checkpoint yields a video LoRA `.safetensors` blob plus any sample `.mp4` files. The trained LoRA is usable in [WAN video generation](./wan) by referencing it in the `loras` field.

## Runtime

Wall time, default settings on a 4-clip dataset:

| Variant | Per 100 steps | Typical full run |
|---------|---------------|-------------------|
| `2.1` | ~1–3 min | 20–60 min for 2000 steps |
| `2.2` | ~1–3 min | 20–60 min for 2000 steps |

Always use `wait=0`.

## Cost

Training is billed per **step** plus a flat per-**epoch** storage surcharge, with a price floor:

```
price = steps × costPerStep + epochs × 200       (rounded)
costPerStep = 0.5   (2.1 and 2.2)
floor: never less than 80% of the default-configuration price
```

Wan's per-epoch surcharge is **200 Buzz** (not 10 like image ecosystems) because each epoch's preview samples are videos and expensive to compute — so most of Wan's cost is in the epoch count, not the step count. The default run is **2000 steps / 10 epochs** → `2000 × 0.5 + 10 × 200 = 1000 + 2000 = 3000 Buzz`. The **floor** is 80% of the default price (2400 Buzz).

Lowering `epochs` saves the most. Sample-prompt rendering itself uses Wan video-generation rates and is billed separately. Run with `whatif=true` to see the exact pre-flight charge.

| Configuration | Buzz (training only) |
|---------------|---------------------|
| default (`steps: 2000`, `epochs: 10`) | 3000 + samples |
| `steps: 2000`, `epochs: 20` | 5000 + samples (each extra checkpoint adds 200) |
| `steps: 1000`, `epochs: 5` | 2400 + samples (floor) |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "modelVariant required" | Missing `modelVariant` | Set to `"2.1"` or `"2.2"`. |
| Step starts then fails immediately | Preview ecosystem not yet enabled on the routing GPU fleet | Contact Civitai support — Wan training is rolling out. |
| Step `failed` with VRAM-related error | Resolution × clip length too high for the worker | Lower `resolution` (e.g. to `512`), shorten clips to ≤ 3 seconds. |
| Trained LoRA produces static / no motion | Too few steps, too few / too short clips | Raise `steps`; ensure clips show the motion you want learned. |
| Step `failed`, `moderationStatus: "Rejected"` | Dataset failed content moderation | Replace flagged clips. |

## Related

- [LTX2 video LoRA training](./training-ltx2) — Lightricks LTX video LoRA training (also video, less expensive previews on LTX2.3)
- [WAN video generation](./wan) — use a trained LoRA in WAN inference
- [Flux 2 Klein LoRA training](./training-flux2-klein) — image-side counterpart
- [Results & webhooks](/orchestration/guide/results-and-webhooks)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) / [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
