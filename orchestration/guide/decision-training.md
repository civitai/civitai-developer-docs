---
title: Decision model training
---

# Decision model training

The `decisionTraining` step fine-tunes a model to choose among named answers for your own questions. The first supported backend is **Imajev 4B**, with text, images, or both as inputs. Questions and dataset labels are independent of the model backend, so the same format can support additional models later.

This requires a worker with the `decision-training` profile enabled. Training produces a downloadable model artifact and evaluation report. It does not publish the model or replace an existing moderation model automatically.

## Define the task

Give each question a stable ID, instructions, and two or more answer options. Assign a `policyVersion` whenever the meaning of the task or labels changes. For independent labels, use separate questions. For mutually exclusive classes, use one question with multiple options.

For example, a five-level image rating task can use one question with `PG`, `PG13`, `R`, `X`, and `XXX` options, each with the agreed moderator definitions. Preserve those exact definitions in the evaluation set and when serving the trained model.

## Prepare the dataset

Upload either a **JSONL file directly** or a **ZIP containing `examples.jsonl` at its root** and any bundled images. Each line has this shape:

```json
{"id":"example-001","groupId":"source-001","split":"train","input":{"state":"A red square.","images":[]},"labels":{"color":"red"}}
{"id":"example-002","groupId":"source-002","split":"validation","input":{"state":"Classify the visible object.","images":["images/002.png"]},"labels":{"color":"blue"}}
{"id":"example-003","groupId":"source-003","split":"test","input":{"state":"A red balloon.","images":[]},"labels":{"color":"red"}}
```

`input.state` is a string or JSON object supplied to the model. Omit `input.images` or leave it empty for text-only training. Images can be paths relative to the ZIP root, public HTTPS URLs, or both. An example supports up to two images. IDs and labels are bookkeeping and are not added to the model's input.

For image training without a ZIP, put HTTPS URLs in the JSONL:

```json
{"id":"image-001","groupId":"source-001","split":"train","input":{"state":"Classify the visible object.","images":["https://your-storage.example/images/001.png"]},"labels":{"color":"blue"}}
```

The trainer downloads up to four images concurrently before loading the model, reusing each distinct URL within the run. URLs must be accessible without extra headers; signed query strings are supported. Redirects must also resolve to public HTTPS destinations. Private addresses, URL user-info credentials, and invalid images are rejected. Download failures fail the run rather than silently removing examples.

Use `groupId` to keep variants, near duplicates, and examples from the same source in the same split. The trainer rejects duplicate IDs, groups crossing splits, identical inputs crossing splits, and byte-identical images crossing splits. It cannot discover every near duplicate: grouping remains the dataset author's responsibility.

Every question needs labeled training and validation examples. Test examples are optional and are evaluated only after checkpoint selection. A missing label or JSON `null` is excluded for that question. **Null does not mean a negative label.** The explicit label `"__unknown__"` trains abstention; it is reserved and must not appear in the options list.

The input file is limited to 20 GiB, the extracted dataset including downloaded images to 32 GiB, and the dataset to 200,000 examples. Remote images are limited to 32 MiB and 40 million pixels each, with a 15-second socket timeout and 120-second transfer deadline. Compute SHA-256 over the exact JSONL or ZIP bytes and supply an HTTPS `datasetUrl` the worker can download without extra headers. The format is detected from contents; no extension or extra format setting is required. All signed URLs must remain valid through queueing and download.

`datasetSha256` identifies the submitted file, not mutable remote image contents. Use immutable image URLs or bundle images in the ZIP for reproducibility. The report includes remote image counts, bytes, and an aggregate content checksum. Downloaded image bytes are also used for the cross-split duplicate checks.

## Submit training

Submit this body to [`POST /v2/consumer/workflows`](/orchestration/reference/operations/SubmitWorkflow), replacing the URL and checksum:

```json
{
  "steps": [{
    "$type": "decisionTraining",
    "name": "train",
    "timeout": "1.00:00:00",
    "input": {
      "model": "imajev-4b",
      "policyVersion": "colors-v1",
      "datasetUrl": "https://your-storage.example/dataset.zip",
      "datasetSha256": "REPLACE_WITH_64_HEXADECIMAL_CHARACTERS",
      "questions": [{
        "id": "color",
        "instructions": "What color is the object described or shown?",
        "options": [
          { "value": "red", "description": "The object is red." },
          { "value": "blue", "description": "The object is blue." }
        ]
      }],
      "parameters": {
        "maxSteps": 1000,
        "epochs": 3,
        "learningRate": 0.00002,
        "preset": "auto",
        "autoTune": true,
        "vramFraction": 0.9,
        "evaluateEvery": 100,
        "maxLength": 4096,
        "maxImagePixels": 262144,
        "seed": 42
      }
    }
  }]
}
```

The run ends when either `maxSteps` optimizer updates or `epochs` passes through the labeled training decisions is reached. Each labeled question is one training decision. Gradient accumulation combines microbatches into an optimizer update; it does not increase the batch held in VRAM at once. The workflow step timeout defaults to 24 hours and may be set to at most six days.

The initial backend trains the original Imajev language LoRA and FP32 decision head over a frozen BF16 Qwen3.5 4B base. The vision encoder remains frozen. Inputs exceeding `maxLength` after image processing and prompt rendering fail explicitly rather than being silently truncated. `maxImagePixels` bounds each image's preprocessing budget.

Use the normal workflow polling and cancellation endpoints described in [Submitting work](./submitting-work) and [Results and webhooks](./results-and-webhooks). Preview cost through the workflow `whatif` endpoint; pricing is configured by the deployment.

## Automatic presets and overrides

By default, leave `preset` as `auto` or omit it. Text-only datasets select the **text** preset. Datasets containing images, including mixed text/image datasets, select **image**. You can explicitly select either preset; `text` rejects datasets containing images.

| Default | Text | Image or mixed |
| --- | --- | --- |
| Effective batch | 64 labeled decisions | 32 labeled decisions |
| Batch size and gradient checkpointing | Benchmarked at startup | Benchmarked at startup |
| Frozen image feature cache | Off | On |
| VRAM budget | 90% | 90% |

Both presets group similar input lengths to reduce padding. The image preset reuses frozen BF16 vision features with identical preprocessing; its temporary disk cache is bounded to 8 GiB and is not included in the export. Validation and export checks use fresh image inference.

Startup tuning measures forward/backward and optimizer memory on training examples without updating weights. It compares cached/batched probabilities with singleton inference and stress-tests the longest training input of each image count. It chooses the fastest measured configuration that passes these checks. It does not lower image resolution or truncate text to fit memory. Tuning adds startup time, which can dominate very short runs.

`vramFraction` accepts `0.5`–`0.95`, default `0.9`. This sets a PyTorch allocator budget after accounting for existing device memory usage. It leaves headroom and does not guarantee a precise ceiling for allocations outside PyTorch. The fastest configuration may use less than the budget.

Manual values take precedence:

- `batchSize`: examples held in one microbatch, 1–128. Omit to tune automatically.
- `effectiveBatchSize`: decisions per optimizer update, 1–4096. Microbatches accumulate to this total; the final one can be smaller.
- `gradientAccumulation`: alternatively supply this together with `batchSize`, without `effectiveBatchSize`. Their product defines the effective batch.
- `gradientCheckpointing`: force `true` to save activation memory or `false` to avoid recomputation; omit to benchmark both.
- `cacheImageFeatures`: enable or disable the frozen vision cache.
- `autoTune`: set `false` to skip the sweep. Omitted batch size then becomes 1 and omitted checkpointing becomes `true`.

For example, a fully specified image configuration is:

```json
{
  "preset": "image",
  "autoTune": false,
  "batchSize": 1,
  "gradientAccumulation": 32,
  "gradientCheckpointing": false,
  "cacheImageFeatures": true,
  "vramFraction": 0.9
}
```

With automatic tuning enabled, an unexpected activation-memory failure retries the entire pending gradient group using smaller microbatches or checkpointing. Its effective batch and loss weighting stay unchanged. Explicit overrides are respected; an impossible manual configuration fails instead of silently changing your settings. Training progress reports profiling/tuning phases before optimizer steps begin.

## Live progress and scores

Live tracing is enabled by default. Set `input.trace` to `false` to disable it. Once a worker starts the attempt, `steps[].output.traceUrl` becomes available even while the artifact and report are still unavailable. Open it with `fetch()` and a streaming reader, or:

```bash
curl --no-buffer "$TRACE_URL"
```

The response is `application/x-ndjson`: buffer incomplete lines and parse each complete line as JSON. It uses the same streaming-blob transport as AI Toolkit. Each event includes `t` (Unix milliseconds), `type`, `attemptId`, `seq`, and `source`.

| Event | Contents |
| --- | --- |
| `phase`, `progress` | Preparation, model loading, profiling/tuning, training, evaluation, export, and upload |
| `download` | Dataset/image download state, bytes received, file counts, and download fraction |
| `step` | Step/planned steps, epoch, loss, learning rate, gradient norm, progress fraction, seconds per step, peak VRAM, resolved settings |
| `validation` | Split, checkpoint, mean question loss, per-question accuracy/counts, per-class precision/recall/support/false-positive rate |
| `checkpoint` | Newly selected checkpoint step and validation loss; the initial step zero is eligible |
| `result` | Trainer artifacts are ready; uploads may still be in progress |
| `error`, `complete` | Error type or attempt completion (`succeeded`, `failed`, `cancelled`) |

Validation events distinguish `checkpoint: "baseline"`, `"current"`, and `"selected"`. Test scores have `split: "test"` and appear only after checkpoint selection and export verification. Undefined metrics are null rather than zero. Full confusion matrices are in the report.

Download events contain `downloadTarget` (`dataset` or `images`), `downloadState` (`started`, `downloading`, `verifying`, or `completed`), `downloadedBytes`, `totalBytes`, `completedFiles`, `totalFiles`, and `downloadProgress` (0–1). Dataset fractions use bytes when Content-Length is available, otherwise null until completion. Image fractions use completed unique URLs; their total bytes are unknown until completion. Dataset completion includes checksum verification; image completion includes image validation. Signed URLs are excluded. Download events arrive about once per second plus start/completion events, through the same `traceUrl`.

The controller forwards events about once per second without skipping optimizer steps between polls. `estimatedTrainingSecondsRemaining` estimates optimizer work only; evaluation, checkpoint writes, and uploads add time. It is not an overall completion estimate.

Reconnecting replays that attempt from the beginning; deduplicate by `(attemptId, seq)`. A retry gets a new trace URL, so continue polling the workflow and switch URLs when it changes. A connection may return 404 before its first bytes; retry while the workflow remains active. `complete` describes a worker attempt; the workflow status determines final success, cancellation, or failure.

Streaming is best effort and may drop updates under backpressure. An unavailable stream does not stop training. The final report is authoritative. Raw examples and trainer logs are excluded, but task option names appear in per-class scores. Anyone holding the trace URL can read it.

## Read and preserve the result

The step returns `model`, `policyVersion`, `traceUrl` when tracing has started, and two blobs: `artifact` and `report`. Download their `url` values while available. Follow the standard [blob retention rules](./results-and-webhooks) and copy artifacts into durable storage before they expire.

The artifact ZIP contains:

- `model/`: LoRA weights, FP32 decision head, tokenizer and processor files.
- `manifest.json`: task definition, pinned base and initial adapter revisions, preprocessing, requested and resolved training parameters, dataset checksum, and selected step.
- `report.json`: baseline validation, selected validation, optional test metrics, optimizer history, tuning measurements, memory usage, and export reload verification.
- The upstream Imajev license.

Base weights are referenced by pinned repository revision, not duplicated inside the export. Paths within the ZIP are relative. The source dataset, signed download URL, and individual example content are not included.

Checkpoint selection minimizes the mean validation loss across questions, including the initial checkpoint. The initial model can remain selected if training does not improve that loss. The exported checkpoint is reloaded and must reproduce every selected validation decision and the validation loss before the job succeeds.

Reports include confusion matrices (rows are ground truth, columns are predictions), accuracy, per-class precision and recall, and false-positive rates. Counts and class support accompany percentages. Scores are **uncalibrated**; the initial adapter's old calibration is not reused after training.

## Serving and extending

The Python training service and Docker build are maintained in the private [civitai-decision-trainer repository](https://github.com/civitai/civitai-decision-trainer). The controller repository owns the .NET worker integration. Maintainers can find container build and rollout settings in the trainer's [deployment guide](https://github.com/civitai/civitai-decision-trainer/blob/main/docs/deployment.md).

Serve the pinned base plus exported adapter and decision head using the manifest's questions, answer order, prompt layout, and preprocessing. An arbitrary export is not automatically compatible with the existing fixed Civitai prompt-moderation wrapper. Validate a suitable serving wrapper before deployment.

This first version supports fresh task-specific runs from the original Imajev adapter. It does not accept arbitrary base models, optimizer resume archives, or continuously update a deployed model. Additional backends can implement the trainer's prepare, loss, predict, and export interface while retaining this dataset and workflow structure.
