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
      epochs: 2,
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

| `modelVariant` | Wan family | Buzz / epoch |
|----------------|-----------|--------------|
| `2.1` | Wan 2.1 (14B) | 300 |
| `2.2` | Wan 2.2 (14B-A14B) | 300 |

::: tip Long-running step
Video training is the slowest training mode on the platform — single-digit minutes per epoch on a 4-clip dataset. Always use `wait=0` and follow up via webhook or polling.
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

Both variants share the same input shape and per-epoch cost; pick the one that matches your inference target. The example below uses `2.1`; swap `modelVariant` to `"2.2"` for Wan 2.2 training (no other change required).

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
      "epochs": 2,
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
| `epochs` | | `5` | `1`–`20`. Billed per epoch. Keep low (2–5) for video — the per-epoch step count is much higher than image. |
| `numberOfRepeats` | | (no auto-default for Wan) | `1`–`5000`. |
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
| `samples.prompts[]` | | `[]` | Per-epoch preview videos rendered with the trained LoRA. |
| `samples.negativePrompt` | | *(none)* | — |

## Reading the result

Same envelope as the other training recipes — see [SDXL/SD1 → Reading the result](./training-sdxl-sd1#reading-the-result). Each epoch yields a video LoRA `.safetensors` blob plus any sample `.mp4` files. The trained LoRA is usable in [WAN video generation](./wan) by referencing it in the `loras` field.

## Runtime

Per-epoch wall time, default settings on a 4-clip dataset:

| Variant | Per-epoch | Typical full run |
|---------|-----------|-------------------|
| `2.1` | ~3–10 min | 6–20 min for 2 epochs |
| `2.2` | ~3–10 min | 6–20 min for 2 epochs |

Always use `wait=0`.

## Cost

```
total = 300 × epochs   (Buzz, base cost)
```

Cost-per-epoch is `300` per the orchestrator source. Sample-prompt rendering uses Wan video-generation rates (much higher than image samples) and is billed separately. Run with `whatif=true` to see the exact pre-flight charge.

| Configuration | Buzz (training only) |
|---------------|---------------------|
| `epochs: 2` | 600 + samples |
| `epochs: 5` | 1500 + samples |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "modelVariant required" | Missing `modelVariant` | Set to `"2.1"` or `"2.2"`. |
| Step starts then fails immediately | Preview ecosystem not yet enabled on the routing GPU fleet | Contact Civitai support — Wan training is rolling out. |
| Step `failed` with VRAM-related error | Resolution × clip length too high for the worker | Lower `resolution` (e.g. to `512`), shorten clips to ≤ 3 seconds. |
| Trained LoRA produces static / no motion | Too few epochs, too few / too short clips | Raise `epochs` to 3–5; ensure clips show the motion you want learned. |
| Step `failed`, `moderationStatus: "Rejected"` | Dataset failed content moderation | Replace flagged clips. |

## Related

- [LTX2 video LoRA training](./training-ltx2) — Lightricks LTX video LoRA training (also video, less expensive previews on LTX2.3)
- [WAN video generation](./wan) — use a trained LoRA in WAN inference
- [Flux 2 Klein LoRA training](./training-flux2-klein) — image-side counterpart
- [Results & webhooks](/orchestration/guide/results-and-webhooks)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) / [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
