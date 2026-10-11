---
title: LoRA training overview
description: What every AI Toolkit LoRA training recipe shares — request shape, common parameters, training data, continuing a run, reading the result, live progress logs, and how cost is calculated.
---

# LoRA training overview

Every LoRA training recipe is a single `training` step with `engine: "ai-toolkit"` and an `ecosystem`. This page covers what they all share; each ecosystem page covers its variants, the defaults that differ, runtime and rates:

- [SDXL & SD1](./training-sdxl-sd1) · [Flux 1](./training-flux1) · [Flux 2 Klein](./training-flux2-klein) · [Wan video](./training-wan) · [LTX2 video](./training-ltx2) · [Chroma / ERNIE / Qwen / Z-Image](./training-other-image)

## The request shape

```json
{
  "$type": "training",
  "input": {
    "engine":    "ai-toolkit",
    "ecosystem": "sdxl",
    "steps":     2000,
    "trainingData": { "type": "zip", "sourceUrl": "<training-data AIR>", "count": 15 }
  }
}
```

Training takes minutes to hours depending on dataset size and `steps`. Always submit with `wait=0` and follow up by polling [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) or with a webhook — see [Results & webhooks](/orchestration/guide/results-and-webhooks). The `<RecipeRun>` widgets on the training pages preview cost via `whatif=true`, so you can see the price without starting a run.

## Training data {#training-data}

`trainingData` is either a zip (`type: "zip"`) or a list of uploaded blobs (`type: "blobs"`).

A zip needs an accurate `count` of the items in it (used for batch sizing) and a `sourceUrl` that is an AIR, so the accepted forms are:

- A Hugging Face file AIR — `urn:air:other:other:huggingface:{repo}@{revision}/{path}`, as the examples use. Pin a commit sha rather than `main` so the reference can't move.
- A Civitai storage AIR or URL — R2 (`urn:air:other:other:civitai-r2:{bucket}@{key}`, or the equivalent `*.r2.cloudflarestorage.com` URL), Backblaze B2, or DigitalOcean Spaces.

A URL on any other host is rejected: nothing maps it to an AIR. No hosted zip? Upload the files as blobs instead.

### Training data as blobs {#blobs-training-data}

Upload each image individually through [`UploadConsumerBlob`](/orchestration/reference/operations/UploadConsumerBlob) (`POST /v2/consumer/blobs`) and pass the returned blobs as `trainingData.items`. Every image goes through per-asset moderation on upload — which is why the blob endpoint accepts images but not zips.

```http
POST https://orchestration.civitai.com/v2/consumer/blobs
Authorization: Bearer <your-token>
Content-Type: image/jpeg

< ./cat-01.jpg
```

The response's `id` is the blob key. Reference it in any of three equivalent forms — the bare key, the blob URL from the response, or the AIR urn `urn:air:other:other:orchestrator:blob@<id>`:

```json
{
  "$type": "training",
  "input": {
    "engine": "ai-toolkit",
    "ecosystem": "sdxl",
    "steps": 2000,
    "trainingData": {
      "type": "blobs",
      "items": [
        { "air": "urn:air:other:other:orchestrator:blob@<id1>" },
        { "air": "<id2>", "caption": "catz sitting on a windowsill, looking at viewer" },
        { "air": "<id3>", "caption": "catz curled up asleep on a red blanket" }
      ]
    }
  }
}
```

- `items` are objects with a required `air` and an optional `caption` (max 1024 characters). Captions serve the same role as the `.txt` sidecar files in a training zip; items without one fall back to the trigger word / default caption.
- At most **1000 items**, each referenced blob at most once. Any media type the blob endpoint accepts works (`jpg`, `png`, `webp`, `mp4`, `webm`, `mp3`, `wav`) — use images for the SD family, videos for video ecosystems like WAN/LTX, audio for ACE-Step.
- There is no `count` field — the item count is `items.length`.
- Uploaded blobs are retained for ~30 days (each re-upload or training submission refreshes the clock), so upload and train within the same session or at least the same month.
- Item order matters for training-run dedup: resubmitting the same set in a different order is treated as a new training run.

## Common parameters {#common-parameters}

These apply to every AI Toolkit training input. Each ecosystem page lists the defaults and limits that differ from these.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `engine` | ✅ | — | Always `ai-toolkit`. |
| `ecosystem` | ✅ | — | The base-model family; values are listed on each ecosystem page. |
| `steps` | | `2000` | `1`–`10000`. Total training steps. Primary driver of training length and pricing (see [Cost](#cost)). |
| `epochs` | | `round(steps / 200)` | `1`–`200`. Number of saved checkpoints delivered, each separately downloadable. When omitted it is `steps / 200` rounded to the nearest whole number, with a `.5` going to the even neighbour, so `steps: 2500` gives `12` (`10` at `2000`); `10` if `steps` is omitted too. Each adds a per-epoch storage surcharge (see [Cost](#cost)). |
| `batchSize` | | `1` | Raise it up to the ecosystem maximum to train faster at the cost of more GPU memory; a larger batch needs fewer steps. Values above the max are clamped; where the maximum is 1 it is fixed. |
| `continueFrom` | | *(none)* | A previously-trained LoRA AIR to resume from (see [Continue training](#continue-training)). |
| `lr` | | `0.0001` | `0`–`1`. UNet learning rate. |
| `textEncoderLr` | | — | Only used when `trainTextEncoder: true`. |
| `trainTextEncoder` | | `false` | Train the text encoder alongside the diffuser. Only SDXL/SD1 default to `true`. |
| `lrScheduler` | | `constant` | `constant`, `constant_with_warmup`, `cosine`, `linear`, `step`. |
| `optimizerType` | | `adamw8bit` | `adamw`, `adamw8bit`, `adam8bit`, `lion`, `lion8bit`, `adafactor`, `adagrad`, `prodigy`, `prodigy8bit`, `automagic`. |
| `networkDim` | | `32` | `1`–`256`. LoRA rank. Higher = more capacity, larger LoRA file. |
| `networkAlpha` | | matches `networkDim` | `1`–`256`. Scales the effective learning rate via `alpha / dim`. |
| `noiseOffset` | | `0` | `0`–`1`. Adds noise during training to improve dark/bright sample handling. |
| `flipAugmentation` | | `false` | Random horizontal flips. Useful for symmetric subjects. |
| `shuffleTokens` | | `false` | Randomize caption-tag order. |
| `keepTokens` | | `0` | `0`–`10`. When `shuffleTokens: true`, keep the first N tokens fixed. |
| `triggerWord` | | *(none)* | Optional activation token. Recommended for character / style LoRAs. |
| `trainingData.type` | ✅ | — | `zip` or `blobs` (see [Training data](#training-data)). |
| `trainingData.sourceUrl` | ✅ (zip) | — | Hugging Face file AIR, or a Civitai R2/B2/Spaces AIR or URL. |
| `trainingData.count` | ✅ (zip) | — | Number of items in the zip. |
| `trainingData.items[]` | ✅ (blobs) | — | Up to 1000 `{ air, caption? }` objects referencing consumer-uploaded blobs. |
| `samples.prompts[]` | | `[]` | Up to a handful of preview prompts rendered at each saved checkpoint with the trained LoRA at strength 1.0 (preview videos on video ecosystems). Empty entries are skipped. |
| `samples.negativePrompt` | | *(none)* | Applied to all sample prompts. |
| `samples.cfgScale` | | *(ecosystem default)* | Overrides the CFG / guidance scale used when rendering the preview samples. |
| `samples.strength` | | `1.0` | Trained-LoRA weight applied in the preview samples. |

## Continue training / train further {#continue-training}

To resume from a LoRA you already trained instead of starting from the base checkpoint, set `continueFrom` to that LoRA's AIR. The new run starts from those weights and the new epochs build on top:

```json
{
  "$type": "training",
  "input": {
    "engine": "ai-toolkit",
    "ecosystem": "sdxl",
    "continueFrom": "urn:air:sdxl:lora:civitai:<id>@<version>",
    "steps": 1000
  }
}
```

`continueFrom` must point at a LoRA of the **same ecosystem** as the model being trained (an SDXL LoRA for `ecosystem: "sdxl"`, an SD1 LoRA for `ecosystem: "sd1"`, and so on); each ecosystem page gives its AIR prefix. A mismatched ecosystem is rejected.

## Reading the result

Submitting with `wait=0` returns immediately with `status: processing`. Poll [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) (or use a webhook) until the step settles. The step reports an `epochs[]` array with one entry per saved epoch (see `epochs` above) — where `model.available` tells you whether that checkpoint has been saved yet. Each available entry contains the trained LoRA `.safetensors` blob and any sample images (or `.mp4` samples on video ecosystems):

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

Blob URLs expire — see [Blobs in results](/orchestration/guide/results-and-webhooks#blobs-in-results). To use the LoRA, pass its AIR under `loras` in the matching generation recipe (each ecosystem page links it).

`moderationStatus` reflects safety review of the dataset: `Approved` is the green-light case. `Rejected` means the run was halted because the dataset failed moderation.

## Live progress & logs {#live-progress}

Training runs for minutes to hours, so the output also lets you watch it *while* it runs:

**`epochs[].traceUrl`** — opt in with `"trace": "events"` (or `"logs"`) on the input and each epoch gets a live, tail-able stream. `epochs[]` always lists every epoch of the run: a pending or training epoch has `model.available: false` and no samples yet, and its `traceUrl` is where to watch it (epochs served from an existing checkpoint have no trace):

```json
"epochs": [
  { "epochNumber": 1, "model": { "id": "…", "available": true, "url": "https://…" }, "samples": [ … ],
    "traceUrl": "https://orchestration.civitai.com/v2/consumer/streaming-blobs/training-...-epoch-1-trace.ndjson" },
  { "epochNumber": 2, "model": { "id": "…", "available": false }, "samples": [],
    "traceUrl": "https://orchestration.civitai.com/v2/consumer/streaming-blobs/training-...-epoch-2-trace.ndjson" }
]
```

Only treat an epoch as downloadable when `model.available` is true. `GET` a trace with a streaming client (`curl -N`, `fetch` + `ReadableStream`); it stays open while that epoch trains and ends when its job does, so follow the run by moving to the next epoch's trace as each one closes. The two modes differ only in what is written:

- `"logs"` — plain text (`text/plain`): one line per line of the trainer's console output, nothing else. The same shape as customComfy's `trace: "logs"`.
- `"events"` — [NDJSON](https://github.com/ndjson/ndjson-spec) (`application/x-ndjson`): each line is one JSON object with a unix-millisecond `t`, a `type` and the `epoch`:

| `type` | Fields | Notes |
|--------|--------|-------|
| `attempt` | `jobId`, `claimId` | First line of every upload; a second one means the job was retried on a new worker |
| `phase` | `phase` | What the worker is doing: `loading_base_model`, `creating_session`, `copying_previous_epoch`, `running`, `uploading`, … |
| `log` | `message` | One line of the trainer's console output (progress-bar redraws are filtered out) |
| `step` | `step`, `maxSteps`, `epochStepsRemaining`, `secondsPerStep` | Sampled about every 2 s, so consecutive lines may skip steps; `secondsPerStep` is the average since training started and `null` until a few steps are in |
| `epoch` | `checkpointPath` | The checkpoint for this epoch was written; the upload follows |
| `error` | `message` | The job failed — the reason, since you'd otherwise only see `status: failed` |

To render an ETA from the stream: `nextEpochIn ≈ epochStepsRemaining × secondsPerStep` and `remaining ≈ (maxSteps − step) × secondsPerStep`.

A few things to expect: a trace URL answers `404` until its worker has written the first line (retry with backoff rather than treating it as final); if the worker falls behind on upload it drops the oldest queued lines, so resync on the next newline instead of assuming a gap-free sequence; a few log lines can go missing if the worker has to re-attach to the trainer's log stream; and a job retried on another worker continues into the same stream after a fresh `attempt` line.

## Runtime

Wall time scales with `steps`, dataset size and the ecosystem — each ecosystem page has a per-step table. Queue time on busy days can dominate; use the workflow's `events[]` to see when the step actually started.

## Cost {#cost}

Training is billed per **step** plus a flat per-**epoch** storage surcharge, with a price floor:

```
price = steps × costPerStep + epochs × epochSurcharge        (rounded)
floor: never less than 80% of the default-configuration price
```

`costPerStep` and `epochSurcharge` are per ecosystem (see each page). Because of the floor, lowering `steps` or `epochs` can save at most 20%. Sample-prompt rendering is billed separately at the ecosystem's generation rate. Preview the exact charge with `whatif=true` — the **Preview cost** button on the `<RecipeRun>` widgets does this ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "steps out of range" | `steps` outside `1`–`10000` | The hard cap is 10000. For longer runs, submit multiple training workflows and chain them. |
| `400` with "uses a resource which could not be resolved" | The zip behind `sourceUrl` is gone, private, or the signed URL expired | Re-upload it, or point `sourceUrl` at an AIR pinned to an immutable revision. |
| `400` with "count mismatch" | `trainingData.count` doesn't match the actual item count in the zip | Inspect the zip contents and update `count`. |
| Step `failed`, output `moderationStatus: "Rejected"` | Dataset failed automated content moderation | Replace flagged images or clips and resubmit. Don't retry the same dataset. |

## Related

- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running training jobs
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [`training` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/training/openapi.yaml)
