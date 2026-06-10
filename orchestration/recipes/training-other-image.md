---
title: Chroma / ERNIE / Qwen / Z-Image LoRA training
---

<script setup>
const chromaBody = {
  tags: ['training'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'chroma',
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
        sourceUrl: 'https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/training-images/5418/2382561TrainingData.B6Tr.zip',
        count: 10,
      },
      samples: {
        prompts: [
          'woman with red hair, playing chess at the park, dramatic explosion in background',
          'a woman holding a coffee cup, in a beanie, sitting at a cafe',
          'a horse acting as a DJ at a night club, fisheye lens, smoke machine, laser lights',
        ],
      },
    },
  }],
};

const ernieBody = {
  tags: ['training'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'ernie',
      steps: 2000,
      lr: 0.0001,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 32,
      networkAlpha: 32,
      noiseOffset: 0,
      flipAugmentation: false,
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/7918795/2435272TrainingData.bJ7P.zip',
        count: 10,
      },
      samples: {
        prompts: [
          'a portrait of TOK',
          'TOK walking through a comic book city',
        ],
      },
    },
  }],
};

const qwenBody = {
  tags: ['training'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'qwen',
      version: 'latest',
      steps: 2000,
      resolution: 1024,
      lr: 0.00011,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 16,
      networkAlpha: 16,
      noiseOffset: 0,
      flipAugmentation: false,
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/3315022/2526079TrainingData.o4S8.zip',
        count: 10,
      },
      samples: {
        prompts: [
          'woman with red hair, playing chess at the park, dramatic explosion in background',
          'a woman holding a coffee cup, in a beanie, sitting at a cafe',
        ],
      },
    },
  }],
};

const zImageTurboBody = {
  tags: ['training'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'zimageturbo',
      steps: 2000,
      resolution: 512,
      lr: 0.000611,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 32,
      networkAlpha: 32,
      noiseOffset: 0,
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/3315022/2526079TrainingData.o4S8.zip',
        count: 10,
      },
      samples: {
        prompts: ['a photo of TOK', 'TOK in a garden', 'TOK portrait'],
      },
    },
  }],
};

const zImageBaseBody = {
  tags: ['training'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'zimagebase',
      steps: 2000,
      resolution: 512,
      lr: 0.000611,
      trainTextEncoder: false,
      lrScheduler: 'cosine',
      networkDim: 32,
      networkAlpha: 32,
      noiseOffset: 0,
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/3315022/2526079TrainingData.o4S8.zip',
        count: 10,
      },
      samples: {
        prompts: ['a photo of TOK', 'TOK in a garden', 'TOK portrait'],
      },
    },
  }],
};
</script>

# Chroma / ERNIE / Qwen / Z-Image LoRA training

Five smaller image-LoRA ecosystems share this page: each has its own `ecosystem` value and base checkpoint, but the request shape is otherwise the AI Toolkit standard.

| `ecosystem` | Base | Default price | Best for |
|-------------|------|---------------|----------|
| `chroma` | `lodestones/Chroma1-HD` | 2000 Buzz | Chroma community model fine-tunes |
| `ernie` | `baidu/ERNIE-Image` | 1000 Buzz | ERNIE Image LoRAs |
| `qwen` | Qwen-Image (versioned) | 2000 Buzz | Qwen Image / Qwen-Image-Edit LoRAs |
| `zimageturbo` | `ostris/Z-Image-De-Turbo` (+ Z-Image-Turbo extras) | 1000 Buzz | Z-Image Turbo LoRAs (cheap, fast inference) |
| `zimagebase` | `Tongyi-MAI/Z-Image` | 1000 Buzz | Z-Image base LoRAs |

Each ecosystem has its own subsection with a runnable example. The shared schema lives in [Common parameters](#common-parameters); ecosystem-specific quirks are in each subsection.

::: tip Long-running step
Always submit with `wait=0`. These ecosystems run anywhere from a fraction of a second per step (Z-Image Turbo) to ~1s/step (Chroma/Qwen). See [Results & webhooks](/orchestration/guide/results-and-webhooks).
:::

## The request shape

```json
{
  "$type": "training",
  "input": {
    "engine":    "ai-toolkit",
    "ecosystem": "chroma"   // chroma | ernie | qwen | zimageturbo | zimagebase
  }
}
```

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A training-data zip (signed R2 URL, Civitai R2 AIR, or any HTTPS URL)
- An accurate `count` of images in the zip

## Chroma

Trains on the Chroma1-HD base. Uses [`TextToImageV2Job`](/orchestration/reference/) for sample renders; output LoRA is usable wherever Chroma is supported.

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
      "ecosystem": "chroma",
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
        "sourceUrl": "https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/training-images/5418/2382561TrainingData.B6Tr.zip",
        "count": 10
      },
      "samples": {
        "prompts": [
          "woman with red hair, playing chess at the park, dramatic explosion in background",
          "a woman holding a coffee cup, in a beanie, sitting at a cafe",
          "a horse acting as a DJ at a night club, fisheye lens, smoke machine, laser lights"
        ]
      }
    }
  }]
}
```

<RecipeRun :body="chromaBody" :wait="0" />

Chroma defaults: `networkDim: 16`, `optimizerType: adamw8bit`, `trainTextEncoder: false`, `lrScheduler: cosine`. Default price 2000 Buzz.

## ERNIE

Trains on Baidu's ERNIE-Image. Comfy-based ecosystem with built-in diffuser. Uses [`ComfyImageGenJob`](/orchestration/reference/) for sample renders.

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
      "ecosystem": "ernie",
      "steps": 2000,
      "lr": 0.0001,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 32,
      "networkAlpha": 32,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/7918795/2435272TrainingData.bJ7P.zip",
        "count": 10
      },
      "samples": {
        "prompts": ["a portrait of TOK", "TOK walking through a comic book city"]
      }
    }
  }]
}
```

<RecipeRun :body="ernieBody" :wait="0" />

ERNIE defaults: `networkDim: 32`, `optimizerType: adamw8bit`, `trainTextEncoder: false`, `lrScheduler: cosine`. Default price 1000 Buzz.

## Qwen

Trains on Qwen-Image. The `version` field selects a specific Qwen-Image release:

| `version` | Base resolved to |
|-----------|------------------|
| `latest` (default) | `Qwen/Qwen-Image-Edit-2512` |
| `2509` | `urn:air:qwen:checkpoint:civitai:1864281@2110043` |
| `2512` | `Qwen/Qwen-Image-Edit-2512` (same as `latest`) |

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
      "ecosystem": "qwen",
      "version": "latest",
      "steps": 2000,
      "resolution": 1024,
      "lr": 0.00011,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 16,
      "networkAlpha": 16,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/3315022/2526079TrainingData.o4S8.zip",
        "count": 10
      },
      "samples": {
        "prompts": [
          "woman with red hair, playing chess at the park, dramatic explosion in background",
          "a woman holding a coffee cup, in a beanie, sitting at a cafe"
        ]
      }
    }
  }]
}
```

<RecipeRun :body="qwenBody" :wait="0" />

Qwen defaults: `networkDim: 16`, `optimizerType: adamw8bit`, `trainTextEncoder: false`, `lrScheduler: cosine`. Default price 2000 Buzz.

## Z-Image Turbo

Trains on `ostris/Z-Image-De-Turbo` and pulls in the original `Tongyi-MAI/Z-Image-Turbo` as an extras model. Output LoRA is usable in [Z-Image generation](./zimage) on the `turbo` model.

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
      "ecosystem": "zimageturbo",
      "steps": 2000,
      "resolution": 512,
      "lr": 0.000611,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 32,
      "networkAlpha": 32,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/3315022/2526079TrainingData.o4S8.zip",
        "count": 10
      },
      "samples": {
        "prompts": ["a photo of TOK", "TOK in a garden", "TOK portrait"]
      }
    }
  }]
}
```

<RecipeRun :body="zImageTurboBody" :wait="0" />

Z-Image Turbo defaults: `networkDim: 32`, `optimizerType: adamw8bit`, `trainTextEncoder: false`. Default price 1000 Buzz.

## Z-Image Base

Trains on `Tongyi-MAI/Z-Image`. The orchestrator overrides `optimizerType` to `automagic` and `lr` to `0.000001` regardless of what you submit — the input fields are accepted but ignored. Use the [Z-Image Turbo](#z-image-turbo) recipe instead unless you specifically need a base-model LoRA.

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
      "ecosystem": "zimagebase",
      "steps": 2000,
      "resolution": 512,
      "lr": 0.000611,
      "trainTextEncoder": false,
      "lrScheduler": "cosine",
      "networkDim": 32,
      "networkAlpha": 32,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/3315022/2526079TrainingData.o4S8.zip",
        "count": 10
      },
      "samples": {
        "prompts": ["a photo of TOK", "TOK in a garden", "TOK portrait"]
      }
    }
  }]
}
```

<RecipeRun :body="zImageBaseBody" :wait="0" />

Z-Image Base defaults: `networkDim: 32`, `optimizerType: automagic` (overridden), `lr: 0.000001` (overridden), `trainTextEncoder: false`. Default price 1000 Buzz.

## Common parameters {#common-parameters}

Defaults shown are the post-`ApplyDefaults` values; per-ecosystem deviations are noted above.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `engine` | ✅ | — | Always `ai-toolkit`. |
| `ecosystem` | ✅ | — | One of: `chroma`, `ernie`, `qwen`, `zimageturbo`, `zimagebase`. |
| `version` | (qwen only) | `latest` | `latest`, `2509`, `2512`. Selects the Qwen-Image base release. |
| `steps` | | `2000` | `1`–`10000`. Total training steps. Primary driver of training length and pricing. |
| `epochs` | | `10` | `1`–`20`. Number of saved checkpoints delivered, each separately downloadable. Each adds 10 Buzz of storage. |
| `batchSize` | | `1` | Defaults to 1. For Z-Image and ERNIE, raise it up to the ecosystem maximum (**2**) to train faster at the cost of more GPU memory; a larger batch needs fewer steps. For Chroma and Qwen it is fixed at 1. Values above the max are clamped. |
| `continueFrom` | | *(none)* | A previously-trained LoRA AIR (`urn:air:<ecosystem>:lora:...`) to resume from (see [Continue training](#continue-training)). Must be a LoRA of the same ecosystem. |
| `lr` | | `0.0001` | UNet learning rate. |
| `trainTextEncoder` | | `false` | All five ecosystems leave the text encoder frozen. |
| `lrScheduler` | | `cosine` | `constant`, `constant_with_warmup`, `cosine`, `linear`, `step`. |
| `optimizerType` | | `adamw8bit` (`automagic` for Z-Image Base) | Full enum on the [SDXL/SD1 page](./training-sdxl-sd1#common-parameters). |
| `networkDim` | | `32` (`16` for Chroma / Qwen) | `1`–`256`. |
| `networkAlpha` | | matches `networkDim` | `1`–`256`. |
| `noiseOffset` | | `0` | `0`–`1`. |
| `flipAugmentation` | | `false` | Random horizontal flips. |
| `shuffleTokens` / `keepTokens` | | `false` / `0` | Caption-tag shuffling. |
| `triggerWord` | | *(none)* | Activation token. Recommended for character / style LoRAs on Chroma, Z-Image. |
| `trainingData.{type, sourceUrl, count}` | ✅ | — | `type: "zip"`. |
| `samples.prompts[]` | | `[]` | Preview prompts rendered at each saved checkpoint with the trained LoRA. |
| `samples.negativePrompt` | | *(none)* | — |
| `samples.cfgScale` | | *(ecosystem default)* | Overrides the CFG / guidance scale used when rendering the preview samples. |
| `samples.strength` | | `1.0` | Trained-LoRA weight applied in the preview samples. |

## Continue training / train further {#continue-training}

To resume from a LoRA you already trained instead of starting from the base checkpoint, set `continueFrom` to that LoRA's AIR. The new run starts from those weights and the new epochs build on top:

```json
{
  "$type": "training",
  "input": {
    "engine": "ai-toolkit",
    "ecosystem": "chroma",
    "continueFrom": "urn:air:chroma:lora:civitai:<id>@<version>",
    "steps": 1000
  }
}
```

`continueFrom` must point at a LoRA of the **same ecosystem** as the model being trained (a `chroma` LoRA for `ecosystem: "chroma"`, a `qwen` LoRA for `ecosystem: "qwen"`, and so on) — a mismatched ecosystem is rejected.

## Reading the result

Same envelope as the other training recipes — see [SDXL/SD1 → Reading the result](./training-sdxl-sd1#reading-the-result). Each saved checkpoint yields a `.safetensors` LoRA blob plus any sample images.

The trained LoRA is usable in the corresponding generation recipe — Chroma LoRAs in any Chroma workflow, ERNIE LoRAs in [ERNIE image generation](./ernie), Qwen LoRAs in [Qwen image generation](./qwen), Z-Image LoRAs in [Z-Image generation](./zimage).

## Runtime

Per-step wall time, default settings on a 10-image dataset:

| Ecosystem | Per-step | Typical full run |
|-----------|----------|-------------------|
| `chroma` | ~0.6–1.2 s | 10–30 min for 2000 steps |
| `ernie` | ~0.3–0.6 s | 6–16 min for 2000 steps |
| `qwen` | ~0.6–1.2 s | 10–30 min for 2000 steps |
| `zimageturbo` | ~0.1–0.25 s | 2–8 min for 2000 steps |
| `zimagebase` | ~0.1–0.25 s | 2–8 min for 2000 steps |

Always use `wait=0`.

## Cost

Training is billed per **step** plus a flat per-**epoch** storage surcharge, with a price floor:

```
price = steps × costPerStep + epochs × 10        (rounded)
floor: never less than 80% of the default-configuration price
```

`epochs` is the number of saved checkpoints delivered (default `10`, range `1`–`20`); each adds 10 Buzz of storage. The default run is **2000 steps / 10 epochs**, which lands each ecosystem on its default price. Lowering `steps` or `epochs` can save at most 20% (the floor).

| Ecosystem | `costPerStep` | Default price (2000 steps, 10 epochs) | Floor (80%) |
|-----------|---------------|----------------------------------------|-------------|
| `chroma` | 0.95 | 2000 | 1600 |
| `ernie` | 0.45 | 1000 | 800 |
| `qwen` | 0.95 | 2000 | 1600 |
| `zimageturbo` | 0.45 | 1000 | 800 |
| `zimagebase` | 0.45 | 1000 | 800 |

Sample-prompt rendering is billed separately at each ecosystem's image-generation rate. Use `whatif=true` (the **Preview cost** button on the widgets above) to confirm exact charges before submitting.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "ecosystem unknown" | Typo, or not one of `chroma` / `ernie` / `qwen` / `zimageturbo` / `zimagebase` | Check spelling. |
| `400` with "version not allowed" (Qwen only) | `version` not one of `latest` / `2509` / `2512` | Use one of the listed values. |
| Z-Image Base: `optimizerType` you set seems ignored | Intentional — `ApplyDefaults` overrides to `automagic` | Use Z-Image Turbo if you need full optimizer control. |
| Trained LoRA underbaked | Too few steps / too low `lr` | Raise `steps` (these ecosystems often need more steps than SDXL); keep `lr` ≤ `5e-4`. |
| Trained LoRA overcooked | Too many steps or `networkDim` too high | Drop `networkDim` to 16, lower `steps`. |
| Step `failed`, `moderationStatus: "Rejected"` | Dataset failed content moderation | Replace flagged images. |

## Related

- [SDXL & SD1 LoRA training](./training-sdxl-sd1) — classic Stable Diffusion ecosystems
- [Flux 1 LoRA training](./training-flux1) / [Flux 2 Klein LoRA training](./training-flux2-klein) — Flux family
- [Wan video LoRA training](./training-wan) / [LTX2 video LoRA training](./training-ltx2) — video LoRAs
- Generation recipes for these ecosystems: [Z-Image](./zimage), [Qwen](./qwen), [ERNIE](./ernie)
- [Results & webhooks](/orchestration/guide/results-and-webhooks)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) / [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
