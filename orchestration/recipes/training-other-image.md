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
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
        count: 15,
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
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
        count: 15,
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
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
        count: 15,
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
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
        count: 15,
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
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
        count: 15,
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

Each ecosystem has its own subsection with a runnable example; the request fields, training data, continuing a run and live progress are shared by every ecosystem — see the [LoRA training overview](./training). Submit with `wait=0`: these run from a fraction of a second per step (Z-Image Turbo) to ~1s/step (Chroma/Qwen).

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

- A training-data zip addressed by an AIR ([accepted sources](./training#training-data)), with an accurate `count` of images

## Chroma

Trains on the Chroma1-HD base. The output LoRA is usable wherever Chroma is supported.

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
        "sourceUrl": "urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip",
        "count": 15
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

Chroma defaults: `networkDim: 16`, `optimizerType: adamw8bit`, `trainTextEncoder: false`, `lrScheduler: constant`. Default price 2000 Buzz.

## ERNIE

Trains on Baidu's ERNIE-Image. Comfy-based ecosystem with built-in diffuser.

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
        "sourceUrl": "urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip",
        "count": 15
      },
      "samples": {
        "prompts": ["a portrait of TOK", "TOK walking through a comic book city"]
      }
    }
  }]
}
```

<RecipeRun :body="ernieBody" :wait="0" />

ERNIE defaults: `networkDim: 32`, `optimizerType: adamw8bit`, `trainTextEncoder: false`, `lrScheduler: constant`. Default price 1000 Buzz.

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
        "sourceUrl": "urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip",
        "count": 15
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

Qwen defaults: `networkDim: 16`, `optimizerType: adamw8bit`, `trainTextEncoder: false`, `lrScheduler: constant`. Default price 2000 Buzz.

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

<RecipeRun :body="zImageBaseBody" :wait="0" />

Z-Image Base defaults: `networkDim: 32`, `optimizerType: automagic` (overridden), `lr: 0.000001` (overridden), `trainTextEncoder: false`. Default price 1000 Buzz.

## Parameters {#common-parameters}

Fields and defaults not listed here (or in each subsection above) are as in the overview's [common parameters](./training#common-parameters).

| Field | Default | Notes |
|-------|---------|-------|
| `ecosystem` | ✅ required | One of: `chroma`, `ernie`, `qwen`, `zimageturbo`, `zimagebase`. |
| `version` | `latest` (qwen only) | `latest`, `2509`, `2512`. Selects the Qwen-Image base release. |
| `epochs` | `round(steps / 200)` | Each adds 10 Buzz of storage. |
| `batchSize` | `1` | For Z-Image and ERNIE, up to **2**; for Chroma and Qwen it is fixed at 1. |
| `continueFrom` | *(none)* | A LoRA of the same ecosystem (`urn:air:<ecosystem>:lora:...`, e.g. a `chroma` LoRA for `ecosystem: "chroma"`) to resume from. |
| `trainTextEncoder` | `false` | All five ecosystems leave the text encoder frozen. |
| `optimizerType` | `adamw8bit` (`automagic` for Z-Image Base) | |
| `networkDim` | `32` (`16` for Chroma / Qwen) | |
| `triggerWord` | *(none)* | Recommended for character / style LoRAs on Chroma, Z-Image. |

## Reading the result

The [standard training output](./training#reading-the-result): each saved checkpoint yields a `.safetensors` LoRA blob plus any sample images.

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

## Cost

The [training cost formula](./training#cost) with these ecosystems' rates:

```
price = steps × costPerStep + epochs × 10        (rounded)
floor: never less than 80% of the default-configuration price
```

Each epoch adds 10 Buzz of storage. Every ecosystem on this page defaults to 2000 steps, so with both `steps` and `epochs` omitted the run is **2000 steps / 10 epochs**, which lands each ecosystem on its default price (the examples at the top of the page send `steps: 2000`, which also resolves to 10 epochs).

| Ecosystem | `costPerStep` | Default price (2000 steps, 10 epochs) | Floor (80%) |
|-----------|---------------|----------------------------------------|-------------|
| `chroma` | 0.95 | 2000 | 1600 |
| `ernie` | 0.45 | 1000 | 800 |
| `qwen` | 0.95 | 2000 | 1600 |
| `zimageturbo` | 0.45 | 1000 | 800 |
| `zimagebase` | 0.45 | 1000 | 800 |

Sample-prompt rendering is billed separately at each ecosystem's image-generation rate. Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

## Troubleshooting

`steps` out of range, an unresolvable `sourceUrl`, a `count` mismatch and a rejected dataset are covered in the [overview's troubleshooting](./training#troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "ecosystem unknown" | Typo, or not one of `chroma` / `ernie` / `qwen` / `zimageturbo` / `zimagebase` | Check spelling. |
| `400` with "version not allowed" (Qwen only) | `version` not one of `latest` / `2509` / `2512` | Use one of the listed values. |
| Z-Image Base: `optimizerType` you set seems ignored | Intentional — the server overrides it to `automagic` | Use Z-Image Turbo if you need full optimizer control. |
| Trained LoRA underbaked | Too few steps / too low `lr` | Raise `steps` (these ecosystems often need more steps than SDXL); keep `lr` ≤ `5e-4`. |
| Trained LoRA overcooked | Too many steps or `networkDim` too high | Drop `networkDim` to 16, lower `steps`. |

## Related

- [LoRA training overview](./training) — shared parameters, training data, live progress and cost formula
- [SDXL & SD1 LoRA training](./training-sdxl-sd1) — classic Stable Diffusion ecosystems
- [Flux 1 LoRA training](./training-flux1) / [Flux 2 Klein LoRA training](./training-flux2-klein) — Flux family
- [Wan video LoRA training](./training-wan) / [LTX2 video LoRA training](./training-ltx2) — video LoRAs
- Generation recipes for these ecosystems: [Z-Image](./zimage), [Qwen](./qwen), [ERNIE](./ernie)
- [Results & webhooks](/orchestration/guide/results-and-webhooks)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [`training` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
