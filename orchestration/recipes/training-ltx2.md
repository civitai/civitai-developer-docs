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
      epochs: 2,
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
        sourceUrl: 'https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/training-images/4470934/2725414TrainingData.nuB3.zip',
        count: 4,
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
      epochs: 2,
      lr: 0.0001,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 32,
      networkAlpha: 32,
      flipAugmentation: false,
      trainingData: {
        type: 'zip',
        sourceUrl: 'https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/training-images/4470934/2725414TrainingData.nuB3.zip',
        count: 4,
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

| `ecosystem` | Base | Buzz / epoch | Notes |
|-------------|------|--------------|-------|
| `ltx2` | `Lightricks/LTX-2` (19B) | variable (formula-based) | Original LTX2. Cost is computed per-step from clip count + duration. |
| `ltx23` | `Lightricks/LTX-2.3` (22B) | 200 (flat) | Newer LTX 2.3. Higher per-epoch cost reflects the heavier model — kept high deliberately to disincentivize very long runs. |

The base checkpoint is fixed by `ecosystem`; there's no `model` field on the input.

::: tip Long-running step
Video training is the slowest training mode on the platform. LTX 2.3 in particular is expensive — keep `epochs` ≤ 3 unless you have a clear reason. Always use `wait=0` and follow up via webhook or polling.
:::

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

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A training-data zip containing source video clips
- An accurate `count` of clips in the zip

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
      "epochs": 2,
      "resolution": 768,
      "lr": 0.0002,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 32,
      "networkAlpha": 32,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/training-images/4470934/2725414TrainingData.nuB3.zip",
        "count": 4
      },
      "samples": { "prompts": ["a video of TOK", "TOK moving in a garden"] }
    }
  }]
}
```

<RecipeRun :body="ltx2Body" :wait="0" />

## LTX 2.3

Newer 22B model. Same shape as LTX2; `lr` is typically lower and the per-epoch cost is materially higher (200 Buzz / epoch vs. ltx2's variable formula-based cost).

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
      "epochs": 2,
      "lr": 0.0001,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 32,
      "networkAlpha": 32,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/training-images/4470934/2725414TrainingData.nuB3.zip",
        "count": 4
      },
      "samples": { "prompts": ["a video of TOK", "TOK moving in a garden"] }
    }
  }]
}
```

<RecipeRun :body="ltx23Body" :wait="0" />

## Common parameters {#common-parameters}

Defaults shown are the post-`ApplyDefaults` values for both LTX ecosystems.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `engine` | ✅ | — | Always `ai-toolkit`. |
| `ecosystem` | ✅ | — | `ltx2` or `ltx23`. |
| `epochs` | | `5` | `1`–`20`. Billed per epoch. Keep low (2–3) for video. |
| `numberOfRepeats` | | (no auto-default) | `1`–`5000`. |
| `lr` | | `0.0001` | LTX2 examples often use `0.0002`; LTX 2.3 typically `0.0001`. |
| `trainTextEncoder` | | `false` | Leave off — LTX text encoder is not retrained by AI Toolkit. |
| `lrScheduler` | | `cosine` | `constant`, `constant_with_warmup`, `cosine`, `linear`, `step`. |
| `optimizerType` | | `adamw8bit` | See SDXL/SD1 page for full enum. |
| `networkDim` | | `32` | `1`–`256`. |
| `networkAlpha` | | matches `networkDim` | `1`–`256`. |
| `noiseOffset` | | `0` | `0`–`1`. |
| `flipAugmentation` | | `false` | Random horizontal flips. |
| `shuffleTokens` / `keepTokens` | | `false` / `0` | Caption-tag shuffling. |
| `triggerWord` | | *(none)* | Activation token. |
| `trainingData.{type, sourceUrl, count}` | ✅ | — | `type: "zip"`. Zip should contain video clips. |
| `samples.prompts[]` | | `[]` | Per-epoch preview videos. |
| `samples.negativePrompt` | | *(none)* | — |

## Reading the result

Same envelope as the other training recipes — see [SDXL/SD1 → Reading the result](./training-sdxl-sd1#reading-the-result). Each epoch yields a video LoRA `.safetensors` blob plus any sample `.mp4` files. Use the trained LoRA in [LTX2 video generation](./ltx2) by referencing it in the workflow's `loras` field.

## Runtime

Per-epoch wall time, default settings on a 4-clip dataset:

| Ecosystem | Per-epoch | Typical full run |
|-----------|-----------|-------------------|
| `ltx2` | ~3–8 min | 6–16 min for 2 epochs |
| `ltx23` | ~5–12 min | 10–25 min for 2 epochs |

Always use `wait=0`.

## Cost

LTX2 uses a formula-based cost (per-step area + clip count); LTX 2.3 is flat at 200 Buzz / epoch.

```
ltx2:  total = epochs × computed_cost   (formula varies with clip count + duration)
ltx23: total = 200 × epochs
```

| Configuration | Buzz (training only) |
|---------------|---------------------|
| LTX2, `epochs: 2`, 4 clips | ~10–40 (depends on clip duration) + samples |
| LTX 2.3, `epochs: 2` | 400 + samples |
| LTX 2.3, `epochs: 5` | 1000 + samples |

Sample-prompt rendering uses LTX2 video-generation rates and is billed separately. Run with `whatif=true` to see the exact pre-flight charge.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "trainingData.sourceUrl not reachable" | Signed URL expired, or zip behind auth | Regenerate the URL. R2 signed URLs default to 24h. |
| Step `failed` with VRAM-related error | Resolution × clip length too high | Lower `resolution` (e.g. to `512`), shorten clips. |
| LTX 2.3 cost surprises you | Flat 200 Buzz / epoch, by design | Check `whatif=true` before submitting. Cap `epochs` at 2–3 unless you have budget. |
| Trained LoRA produces no motion | Too few epochs / static reference clips | Raise `epochs`, ensure clips show the motion you want learned. |
| Step `failed`, `moderationStatus: "Rejected"` | Dataset failed content moderation | Replace flagged clips. |

## Related

- [Wan video LoRA training](./training-wan) — Wan video LoRA training (preview)
- [LTX2 video generation](./ltx2) — use a trained LoRA in LTX2 inference
- [Flux 2 Klein LoRA training](./training-flux2-klein) — image-side counterpart
- [Results & webhooks](/orchestration/guide/results-and-webhooks)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) / [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
