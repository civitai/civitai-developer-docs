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
      epochs: 10,
      numberOfRepeats: 14,
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
        sourceUrl: 'urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2783465TrainingData.koBd.zip',
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
      epochs: 100,
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
        sourceUrl: 'urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2707938TrainingData.Ac22.zip',
        count: 8,
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

| `ecosystem` | Output LoRA usable with | Buzz / epoch | Native resolution |
|-------------|------------------------|--------------|-------------------|
| `sdxl` | [SDXL image generation](./sdxl) | 50 | 1024² |
| `sd1` | [SD1 image generation](./sd1) | 50 | 512² |

Both are the cheapest training ecosystems on the platform — good first pick when iterating on dataset choice or hyperparameters before stepping up to a more expensive model family. SDXL is the better default for new fine-tunes; SD1 is mostly useful when you specifically need a SD 1.5 LoRA (e.g. to deploy onto an existing SD 1.5 product).

## The request shape

Every training request is a single `training` step with an `engine` and `ecosystem` selector:

```json
{
  "$type": "training",
  "input": {
    "engine":    "ai-toolkit",
    "ecosystem": "sdxl"          // sdxl | sd1
  }
}
```

The input shape is shared with the other AI Toolkit ecosystems — see [Common parameters](#common-parameters) below. The fields documented here are the SD-family-specific ones (`model`, `minSnrGamma`, `triggerWord`, default text-encoder behavior).

::: tip Long-running step
Training takes minutes to hours depending on dataset size and epoch count. Always submit with `wait=0` and follow up with polling or a webhook — see [Results & webhooks](/orchestration/guide/results-and-webhooks). The `<RecipeRun>` widgets below preview cost via `whatif=true` so you can see the price without kicking off an actual training run.
:::

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A training-data zip uploaded to a Civitai-reachable URL. Three accepted forms:
  - A signed `https://civitai-delivery-worker-prod.*.r2.cloudflarestorage.com/...` URL
  - A Civitai R2 AIR (e.g. `urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/.../...zip`)
  - Any HTTPS URL that returns the zip without auth
- An accurate `count` of images in the zip — used to compute `numberOfRepeats` defaults and batch sizing

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
      "epochs": 10,
      "numberOfRepeats": 14,
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
        "sourceUrl": "urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2783465TrainingData.koBd.zip",
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
| `optimizerType` | `adafactor` | see [enum](#common-parameters) | `adafactor` is the SDXL house default; `adamw8bit` works too if you have memory headroom. |

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
      "epochs": 100,
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
        "sourceUrl": "urn:air:other:other:civitai-r2:civitai-delivery-worker-prod@training-images/6/2707938TrainingData.Ac22.zip",
        "count": 8
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
| `numberOfRepeats` (auto) | `ceil(400 / count)` | `ceil(200 / count)` |

## Common parameters {#common-parameters}

These apply to every AI Toolkit training input regardless of ecosystem. Defaults shown are the post-`ApplyDefaults` values for SDXL; some ecosystems override individual defaults (the SD1 / SDXL differences above are the main examples).

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `engine` | ✅ | — | Always `ai-toolkit` for these recipes. |
| `ecosystem` | ✅ | — | `sdxl` or `sd1` for this page. |
| `epochs` | | `5` | `1`–`20`. One pass through the dataset = one epoch. Billed per epoch (see [Cost](#cost)). |
| `numberOfRepeats` | | auto | `1`–`5000`. Per-image repeats inside one epoch. Auto-computed from dataset size when omitted. |
| `lr` | | `0.0001` | `0`–`1`. UNet learning rate. `0.0005` is typical for character/style LoRAs on SDXL. |
| `textEncoderLr` | | — | Only used when `trainTextEncoder: true`. SDXL/SD1 default to `5e-5`. |
| `trainTextEncoder` | | `true` (SDXL/SD1) | Train CLIP alongside the diffuser. |
| `lrScheduler` | | `cosine` | `constant`, `constant_with_warmup`, `cosine`, `linear`, `step`. |
| `optimizerType` | | `adafactor` (SDXL) / `adamw8bit` (SD1) | `adamw`, `adamw8bit`, `adam8bit`, `lion`, `lion8bit`, `adafactor`, `adagrad`, `prodigy`, `prodigy8bit`, `automagic`. |
| `networkDim` | | `32` | `1`–`256`. LoRA rank. Higher = more capacity, larger LoRA file. |
| `networkAlpha` | | matches `networkDim` | `1`–`256`. Scales the effective learning rate via `alpha / dim`. |
| `noiseOffset` | | `0.1` (SDXL) / `0` (SD1) | `0`–`1`. Adds noise during training to improve dark/bright sample handling. |
| `flipAugmentation` | | `false` | Random horizontal flips. Useful for symmetric subjects. |
| `shuffleTokens` | | `false` | Randomize caption-tag order. |
| `keepTokens` | | `0` | `0`–`10`. When `shuffleTokens: true`, keep the first N tokens fixed. |
| `triggerWord` | | *(none)* | Activation token recommended for character/style LoRAs. |
| `trainingData.type` | ✅ | — | `zip` (only currently supported type). |
| `trainingData.sourceUrl` | ✅ | — | Signed HTTPS URL or Civitai R2 AIR. |
| `trainingData.count` | ✅ | — | Number of images in the zip. |
| `samples.prompts[]` | | `[]` | Up to a handful of preview prompts rendered after each epoch with the trained LoRA at strength 1.0. Empty entries are skipped. |
| `samples.negativePrompt` | | *(none)* | Applied to all sample prompts. |

## Reading the result

Submitting with `wait=0` returns immediately with `status: processing`. Poll [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) (or use a webhook — see [Results & webhooks](/orchestration/guide/results-and-webhooks)) until the step settles. A successful step produces one `epochs[]` entry per epoch; each contains the trained LoRA blob and any sample images:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "training",
    "status": "succeeded",
    "output": {
      "moderationStatus": "Approved",
      "epochs": [
        {
          "epochNumber": 1,
          "model": { "id": "blob_...", "url": "https://.../epoch_1.safetensors" },
          "samples": [
            { "id": "blob_...", "url": "https://.../sample_0.jpeg" },
            { "id": "blob_...", "url": "https://.../sample_1.jpeg" }
          ]
        },
        { "epochNumber": 2, "model": { "...": "..." }, "samples": [] }
      ]
    }
  }]
}
```

The blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL when downloading the trained LoRA.

`moderationStatus` reflects safety review of the dataset: `Approved` is the green-light case. `Rejected` means the run was halted because the dataset failed moderation.

## Runtime

Training is highly variable and depends on `epochs × numberOfRepeats × count`. Always use `wait=0`.

| Ecosystem | Per-epoch wall time (15 imgs, default settings) | Typical full run |
|-----------|------------------------------------------------|------------------|
| `sdxl` | ~30–60 s | 5–15 min for 10 epochs |
| `sd1` | ~10–25 s | 3–10 min for 100 epochs (SD1 is much faster per step) |

Queue time on busy days can dominate — use the workflow's `events[]` to see when the step actually started.

## Cost

Billed in Buzz (1 Buzz ≈ 1/6 second of GPU). Both SDXL and SD1 are flat-rate per epoch:

```
total = costPerEpoch × epochs
costPerEpoch = 50 (sdxl), 50 (sd1)
```

Sample-prompt rendering is billed separately at standard SDXL / SD1 image-generation rates. Use `whatif=true` (the default for the **Preview cost** button on the `<RecipeRun>` widgets above) to see the exact pre-flight charge before committing.

| Configuration | Buzz |
|---------------|------|
| SDXL, `epochs: 10` | 500 + samples |
| SDXL, `epochs: 5` | 250 + samples |
| SD1, `epochs: 100` | 5000 + samples |
| SD1, `epochs: 20` | 1000 + samples |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "epochs out of range" | `epochs` outside `1`–`20` | The hard cap is 20. For very-many-epoch SD1 runs (rare), submit multiple training workflows and chain them. |
| `400` with "model not found" | `model` URN points at a checkpoint that isn't the right ecosystem (e.g. an SD1 model on `ecosystem: "sdxl"`) | Use a `urn:air:sdxl:checkpoint:...` AIR for SDXL; `urn:air:sd1:checkpoint:...` for SD1. |
| `400` with "trainingData.sourceUrl not reachable" | Signed URL expired, or zip behind auth | R2 signed URLs expire — regenerate. Prefer Civitai R2 AIRs for stable references. |
| `400` with "count mismatch" | `trainingData.count` doesn't match the actual image count in the zip | Inspect the zip contents and update `count`. |
| Step `failed`, output `moderationStatus: "Rejected"` | Dataset failed automated content moderation | Replace flagged images and resubmit. Don't retry the same dataset. |
| Trained LoRA looks under-trained | Too few steps for the dataset | Raise `epochs` or `numberOfRepeats`; or increase `lr`. |
| Trained LoRA overfits / memorizes | Too many steps, dim too high, or alpha = dim with high `lr` | Lower `epochs`, drop `networkDim` to 16–24, or set `networkAlpha` to half of `networkDim`. |

## Related

- [Flux 1 LoRA training](./training-flux1) — open-weights Flux LoRAs at higher quality and higher cost
- [Flux 2 Klein LoRA training](./training-flux2-klein) — current Flux generation
- [Chroma / ERNIE / Qwen / Z-Image LoRA training](./training-other-image) — smaller image ecosystems
- [SDXL image generation](./sdxl) / [SD1 image generation](./sd1) — use a trained LoRA via `loras: { "<lora-air>": 1.0 }`
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running training jobs
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) / [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — the operations behind the examples here
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml) — standalone OpenAPI 3.1 YAML for the `training` endpoint
