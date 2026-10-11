---
title: SDXL & SD1 LoRA training
---

<script setup>
const sdxlBody = {
  tags: ['training'],
  steps: [{
    $type: 'training',
    priority: 'normal',
    retries: 2,
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'sdxl',
      model: 'urn:air:sdxl:checkpoint:civitai:101055@128078',
      steps: 2000,
      lr: 0.0005,
      textEncoderLr: 5e-5,
      trainTextEncoder: true,
      lrScheduler: 'cosine',
      optimizerType: 'adafactor',
      networkDim: 32,
      networkAlpha: 32,
      noiseOffset: 0.1,
      minSnrGamma: 5,
      triggerWord: 'cat',
      trainingData: {
        type: 'zip',
        sourceUrl: 'urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip',
        count: 15,
      },
      samples: {
        prompts: [
          'catz no humans, cat, whiskers, animal focus, looking at viewer, animal, solo, yellow eyes',
          'catz no humans, candle, pokemon (creature), blurry, animal focus, solo, food, bird, standing',
          'catz no humans, food, noodles, bowl, cat, green eyes, tongue, food focus, ramen, chopsticks',
        ],
      },
    },
  }],
};

const sd1Body = {
  tags: ['training'],
  steps: [{
    $type: 'training',
    input: {
      engine: 'ai-toolkit',
      ecosystem: 'sd1',
      model: 'urn:air:sd1:checkpoint:civitai:127227@139180',
      steps: 4000,
      lr: 0.0005,
      textEncoderLr: 5e-5,
      trainTextEncoder: true,
      lrScheduler: 'cosine',
      optimizerType: 'adamw8bit',
      networkDim: 32,
      networkAlpha: 16,
      noiseOffset: 0.1,
      minSnrGamma: 5,
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
          'no humans, cat, whiskers, animal focus, looking at viewer, animal, solo, yellow eyes',
          'no humans, food, tiger, cake, animal focus, food focus, whiskers, black background',
          'no humans, fruit, food, bug, black background, wings, food focus, orange (fruit), antennae',
        ],
      },
    },
  }],
};
</script>

# SDXL & SD1 LoRA training

Train a Stable Diffusion LoRA on your own image dataset using AI Toolkit. This page covers the two classic SD ecosystems:

| `ecosystem` | Output LoRA usable with | Default price | Native resolution |
|-------------|------------------------|---------------|-------------------|
| `sdxl` | [SDXL image generation](./sdxl) | 500 Buzz | 1024² |
| `sd1` | [SD1 image generation](./sd1) | 500 Buzz | 512² |

Both are the cheapest training ecosystems on the platform — good first pick when iterating on dataset choice or hyperparameters before stepping up to a more expensive model family. SDXL is the better default for new fine-tunes; SD1 is mostly useful when you specifically need a SD 1.5 LoRA (e.g. to deploy onto an existing SD 1.5 product).

The request shape, [training data](./training#training-data) (zip or uploaded blobs), [common parameters](./training#common-parameters), [continuing a run](./training#continue-training) and [live progress](./training#live-progress) are shared by every ecosystem — see the [LoRA training overview](./training). This page covers the SD-family-specific fields (`model`, `minSnrGamma`, `triggerWord`, default text-encoder behavior). Submit with `wait=0`; the widgets below preview cost only.

## The request shape

```json
{
  "$type": "training",
  "input": {
    "engine":    "ai-toolkit",
    "ecosystem": "sdxl"          // sdxl | sd1
  }
}
```

## SDXL

Stable Diffusion XL trains at 1024² and produces a LoRA usable with any SDXL checkpoint. The base checkpoint defaults to `urn:air:sdxl:checkpoint:civitai:101055@128078` (Juggernaut XL); override `model` to train on top of a different SDXL checkpoint.

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
      "ecosystem": "sdxl",
      "model": "urn:air:sdxl:checkpoint:civitai:101055@128078",
      "steps": 2000,
      "lr": 0.0005,
      "textEncoderLr": 5e-5,
      "trainTextEncoder": true,
      "lrScheduler": "cosine",
      "optimizerType": "adafactor",
      "networkDim": 32,
      "networkAlpha": 32,
      "noiseOffset": 0.1,
      "minSnrGamma": 5,
      "triggerWord": "cat",
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip",
        "count": 15
      },
      "samples": {
        "prompts": [
          "catz no humans, cat, whiskers, animal focus, looking at viewer, animal, solo, yellow eyes",
          "catz no humans, candle, pokemon (creature), blurry, animal focus, solo, food, bird, standing",
          "catz no humans, food, noodles, bowl, cat, green eyes, tongue, food focus, ramen, chopsticks"
        ]
      }
    }
  }]
}
```

<RecipeRun :body="sdxlBody" :wait="0" />

SDXL-specific fields:

| Field | Default | Range / values | Notes |
|-------|---------|----------------|-------|
| `model` | `urn:air:sdxl:checkpoint:civitai:101055@128078` | Any SDXL `checkpoint` AIR | The base checkpoint your LoRA is trained on top of. |
| `minSnrGamma` | `5` | `0`–`20` | Min-SNR-γ stabilization. `5` is a good default; lower values can speed up convergence on simple subjects. |
| `triggerWord` | *(none)* | string | Optional prompt token that activates the trained LoRA. Recommended for character / style LoRAs. |
| `trainTextEncoder` | `true` | bool | SDXL benefits noticeably from text-encoder training. Disable to halve memory cost at the price of prompt-following quality. |
| `textEncoderLr` | `5e-5` | `0`–`1` | Only used when `trainTextEncoder: true`. |
| `optimizerType` | `adafactor` | see [enum](./training#common-parameters) | `adafactor` is the SDXL house default; `adamw8bit` works too if you have memory headroom. |
| `noiseOffset` | `0.1` | `0`–`1` | |
| `lr` | `0.0001` | `0`–`1` | `0.0005` is typical for character/style LoRAs on SDXL. |
| `batchSize` | `1` | up to **4** | Same maximum for SDXL and SD1. |
| `continueFrom` | *(none)* | `urn:air:sdxl:lora:...` | Must be an SDXL LoRA (an SD1 LoRA for `sd1`). |

## SD1

Stable Diffusion 1.5 trains at 512² and produces a LoRA usable with any SD1.5 checkpoint. Base checkpoint defaults to `urn:air:sd1:checkpoint:civitai:127227@139180`. Same shape as SDXL with two differences: `optimizerType` defaults to `adamw8bit` (not `adafactor`), and `noiseOffset` defaults to `0` (not `0.1`).

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "tags": ["training"],
  "steps": [{
    "$type": "training",
    "input": {
      "engine": "ai-toolkit",
      "ecosystem": "sd1",
      "model": "urn:air:sd1:checkpoint:civitai:127227@139180",
      "steps": 4000,
      "lr": 0.0005,
      "textEncoderLr": 5e-5,
      "trainTextEncoder": true,
      "lrScheduler": "cosine",
      "optimizerType": "adamw8bit",
      "networkDim": 32,
      "networkAlpha": 16,
      "noiseOffset": 0.1,
      "minSnrGamma": 5,
      "trainingData": {
        "type": "zip",
        "sourceUrl": "urn:air:other:other:huggingface:datasets/Civitai/orchestration-samples@e86d025874700507615ae8ef74937c319ea41dfe/sample-training-dataset.zip",
        "count": 15
      },
      "samples": {
        "prompts": [
          "no humans, cat, whiskers, animal focus, looking at viewer, animal, solo, yellow eyes",
          "no humans, food, tiger, cake, animal focus, food focus, whiskers, black background",
          "no humans, fruit, food, bug, black background, wings, food focus, orange (fruit), antennae"
        ]
      }
    }
  }]
}
```

<RecipeRun :body="sd1Body" :wait="0" />

SD1-specific fields are a subset of the SDXL list — same `model` / `minSnrGamma` / `triggerWord` / `trainTextEncoder` / `textEncoderLr`, with these defaults:

| Field | SD1 default | SDXL default |
|-------|-------------|--------------|
| `optimizerType` | `adamw8bit` | `adafactor` |
| `noiseOffset` | `0` | `0.1` |

## Reading the result

The [standard training output](./training#reading-the-result): an `epochs[]` array with each saved checkpoint's SDXL / SD1 LoRA `.safetensors` blob and sample images, plus the dataset's `moderationStatus`. Use the LoRA in [SDXL](./sdxl) or [SD1](./sd1) image generation via `loras: { "<lora-air>": 1.0 }`.

## Runtime

Training is highly variable and depends on `steps`.

| Ecosystem | Per-step wall time (15 imgs, default settings) | Typical full run |
|-----------|------------------------------------------------|------------------|
| `sdxl` | ~0.3–0.5 s | 5–15 min for 2000 steps |
| `sd1` | ~0.1–0.2 s | 3–10 min for 4000 steps (SD1 is much faster per step) |

## Cost

The [training cost formula](./training#cost) with SDXL / SD1 rates:

```
price = steps × costPerStep + epochs × 10        (rounded)
costPerStep = 0.20   (sdxl and sd1)
floor: never less than 80% of the default-configuration price
```

Each epoch adds 10 Buzz of storage. The SD1 example above sends `steps: 4000` with no `epochs`, so it gets 20 epochs: `4000 × 0.20 + 20 × 10 = 1000 Buzz`. The default run is **2000 steps / 10 epochs**, which lands the price on the familiar number:

```
2000 × 0.20 + 10 × 10 = 400 + 100 = 500 Buzz
```

The **floor** is 80% of the default price (400 Buzz for both SDXL and SD1). Sample-prompt rendering is billed separately at standard SDXL / SD1 image-generation rates. Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

| Configuration | Buzz |
|---------------|------|
| SDXL / SD1, default (`steps: 2000`, `epochs: 10`) | 500 + samples |
| SDXL / SD1, `steps: 1000`, `epochs: 10` | 400 + samples (floor) |
| SDXL / SD1, `steps: 2000`, `epochs: 20` | 600 + samples |

## Troubleshooting

`steps` out of range, an unresolvable `sourceUrl`, a `count` mismatch and a rejected dataset are covered in the [overview's troubleshooting](./training#troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "model not found" | `model` URN points at a checkpoint that isn't the right ecosystem (e.g. an SD1 model on `ecosystem: "sdxl"`) | Use a `urn:air:sdxl:checkpoint:...` AIR for SDXL; `urn:air:sd1:checkpoint:...` for SD1. |
| Trained LoRA looks under-trained | Too few steps for the dataset | Raise `steps`; or increase `lr`. |
| Trained LoRA overfits / memorizes | Too many steps, dim too high, or alpha = dim with high `lr` | Lower `steps`, drop `networkDim` to 16–24, or set `networkAlpha` to half of `networkDim`. |

## Related

- [LoRA training overview](./training) — shared parameters, training data, live progress and cost formula
- [Flux 1 LoRA training](./training-flux1) — open-weights Flux LoRAs at higher quality and higher cost
- [Flux 2 Klein LoRA training](./training-flux2-klein) — current Flux generation
- [Chroma / ERNIE / Qwen / Z-Image LoRA training](./training-other-image) — smaller image ecosystems
- [SDXL image generation](./sdxl) / [SD1 image generation](./sd1) — use a trained LoRA via `loras: { "<lora-air>": 1.0 }`
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running training jobs
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [`training` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
