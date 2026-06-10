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

| `ecosystem` | Base | Default price | Notes |
|-------------|------|---------------|-------|
| `ltx2` | `Lightricks/LTX-2` (19B) | 2750 Buzz | Original LTX2. |
| `ltx23` | `Lightricks/LTX-2.3` (22B) | 2750 Buzz | Newer LTX 2.3. |

The base checkpoint is fixed by `ecosystem`; there's no `model` field on the input.

::: tip Long-running step
Video training is the slowest training mode on the platform — video needs a longer run, so the LTX **default is 3000 steps** (vs 2000 for image ecosystems). Always use `wait=0` and follow up via webhook or polling.
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
| `steps` | | `3000` | `1`–`10000`. Total training steps. Primary driver of training length and pricing. Video needs a longer run, hence the higher default. |
| `epochs` | | `10` | `1`–`20`. Number of saved checkpoints delivered, each separately downloadable. **Each adds 50 Buzz** — LTX preview samples are videos and costly to compute. |
| `batchSize` | | `1` | Fixed at 1 for this ecosystem. |
| `continueFrom` | | *(none)* | A previously-trained `urn:air:ltx2:lora:...` / `urn:air:ltx23:lora:...` AIR to resume from (see [Continue training](#continue-training)). Must be a LoRA of the same ecosystem. |
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
| `samples.prompts[]` | | `[]` | Preview videos rendered at each saved checkpoint. |
| `samples.negativePrompt` | | *(none)* | — |
| `samples.cfgScale` | | *(ecosystem default)* | Overrides the CFG / guidance scale used when rendering the preview samples. |
| `samples.strength` | | `1.0` | Trained-LoRA weight applied in the preview samples. |

## Continue training / train further {#continue-training}

To resume from an LTX LoRA you already trained instead of starting from the base checkpoint, set `continueFrom` to that LoRA's AIR. The new run starts from those weights and the new epochs build on top:

```json
{
  "$type": "training",
  "input": {
    "engine": "ai-toolkit",
    "ecosystem": "ltx2",
    "continueFrom": "urn:air:ltx2:lora:civitai:<id>@<version>",
    "steps": 1500
  }
}
```

`continueFrom` must point at a LoRA of the **same ecosystem** as the model being trained (an `ltx2` LoRA for `ecosystem: "ltx2"`, an `ltx23` LoRA for `ecosystem: "ltx23"`) — a mismatched ecosystem is rejected.

## Reading the result

Same envelope as the other training recipes — see [SDXL/SD1 → Reading the result](./training-sdxl-sd1#reading-the-result). Each saved checkpoint yields a video LoRA `.safetensors` blob plus any sample `.mp4` files. Use the trained LoRA in [LTX2 video generation](./ltx2) by referencing it in the workflow's `loras` field.

## Runtime

Wall time, default settings on a 4-clip dataset:

| Ecosystem | Per 100 steps | Typical full run |
|-----------|---------------|-------------------|
| `ltx2` | ~1–2 min | 30–60 min for 3000 steps |
| `ltx23` | ~2–3 min | 60–90 min for 3000 steps |

Always use `wait=0`.

## Cost

Training is billed per **step** plus a flat per-**epoch** storage surcharge, with a price floor. LTX defaults to **3000 steps** (video needs a longer run):

```
price = steps × costPerStep + epochs × 50        (rounded)
costPerStep = 0.75   (ltx2 and ltx23)
floor: never less than 80% of the default-configuration price
```

`epochs` is the number of saved checkpoints delivered (default `10`, range `1`–`20`); **each adds 50 Buzz** — LTX preview samples are videos and costly to compute. The default run is **3000 steps / 10 epochs** → `3000 × 0.75 + 10 × 50 = 2250 + 500 = 2750 Buzz`. The **floor** is 80% of the default price (2200 Buzz).

| Configuration | Buzz (training only) |
|---------------|---------------------|
| LTX2 / LTX 2.3, default (`steps: 3000`, `epochs: 10`) | 2750 + samples |
| LTX2 / LTX 2.3, `steps: 3000`, `epochs: 20` | 3250 + samples (+500 for 10 more checkpoints) |
| LTX2 / LTX 2.3, `steps: 2000`, `epochs: 10` | 2200 + samples (floor) |

Sample-prompt rendering uses LTX2 video-generation rates and is billed separately. Run with `whatif=true` to see the exact pre-flight charge.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "trainingData.sourceUrl not reachable" | Signed URL expired, or zip behind auth | Regenerate the URL. R2 signed URLs default to 24h. |
| Step `failed` with VRAM-related error | Resolution × clip length too high | Lower `resolution` (e.g. to `512`), shorten clips. |
| Training cost surprises you | Video defaults to 3000 steps, so the floor is higher than image ecosystems | Check `whatif=true` before submitting. Lowering `steps`/`epochs` saves at most 20% (the floor). |
| Trained LoRA produces no motion | Too few steps / static reference clips | Raise `steps`, ensure clips show the motion you want learned. |
| Step `failed`, `moderationStatus: "Rejected"` | Dataset failed content moderation | Replace flagged clips. |

## Related

- [Wan video LoRA training](./training-wan) — Wan video LoRA training (preview)
- [LTX2 video generation](./ltx2) — use a trained LoRA in LTX2 inference
- [Flux 2 Klein LoRA training](./training-flux2-klein) — image-side counterpart
- [Results & webhooks](/orchestration/guide/results-and-webhooks)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) / [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
