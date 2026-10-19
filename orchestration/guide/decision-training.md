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

Upload a ZIP containing `examples.jsonl` at its root and any referenced images. Each line has this shape:

```json
{"id":"example-001","groupId":"source-001","split":"train","input":{"state":"A red square.","images":[]},"labels":{"color":"red"}}
{"id":"example-002","groupId":"source-002","split":"validation","input":{"state":"Classify the visible object.","images":["images/002.png"]},"labels":{"color":"blue"}}
{"id":"example-003","groupId":"source-003","split":"test","input":{"state":"A red balloon.","images":[]},"labels":{"color":"red"}}
```

`input.state` is a string or JSON object supplied to the model. Image paths are relative to the ZIP root; external image URLs are not fetched. An example supports up to two images. IDs and labels are bookkeeping and are not added to the model's input.

Use `groupId` to keep variants, near duplicates, and examples from the same source in the same split. The trainer rejects duplicate IDs, groups crossing splits, identical inputs crossing splits, and byte-identical images crossing splits. It cannot discover every near duplicate: grouping remains the dataset author's responsibility.

Every question needs labeled training and validation examples. Test examples are optional and are evaluated only after checkpoint selection. A missing label or JSON `null` is excluded for that question. **Null does not mean a negative label.** The explicit label `"__unknown__"` trains abstention; it is reserved and must not appear in the options list.

The archive is limited to 20 GiB compressed, 32 GiB expanded, and 200,000 examples. Compute SHA-256 over the exact ZIP bytes and supply an HTTPS URL that the worker can download without extra headers. A signed URL must remain valid through queueing and download.

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
        "batchSize": 1,
        "gradientAccumulation": 16,
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

Start with batch size 1 on a 24 GB GPU. Larger batches, longer contexts, and more image pixels require more VRAM. Use the normal workflow polling and cancellation endpoints described in [Submitting work](./submitting-work) and [Results and webhooks](./results-and-webhooks). Preview cost through the workflow `whatif` endpoint; pricing is configured by the deployment.

## Read and preserve the result

The step returns `model`, `policyVersion`, and two blobs: `artifact` and `report`. Download their `url` values while available. Follow the standard [blob retention rules](./results-and-webhooks) and copy artifacts into durable storage before they expire.

The artifact ZIP contains:

- `model/`: LoRA weights, FP32 decision head, tokenizer and processor files.
- `manifest.json`: task definition, pinned base and initial adapter revisions, preprocessing, training parameters, dataset checksum, and selected step.
- `report.json`: baseline validation, selected validation, optional test metrics, optimizer history, and export reload verification.
- The upstream Imajev license.

Base weights are referenced by pinned repository revision, not duplicated inside the export. Paths within the ZIP are relative. The source dataset, signed download URL, and individual example content are not included.

Checkpoint selection minimizes the mean validation loss across questions, including the initial checkpoint. The initial model can remain selected if training does not improve that loss. The exported checkpoint is reloaded and must reproduce every selected validation decision and the validation loss before the job succeeds.

Reports include confusion matrices (rows are ground truth, columns are predictions), accuracy, per-class precision and recall, and false-positive rates. Counts and class support accompany percentages. Scores are **uncalibrated**; the initial adapter's old calibration is not reused after training.

## Serving and extending

Serve the pinned base plus exported adapter and decision head using the manifest's questions, answer order, prompt layout, and preprocessing. An arbitrary export is not automatically compatible with the existing fixed Civitai prompt-moderation wrapper. Validate a suitable serving wrapper before deployment.

This first version supports fresh task-specific runs from the original Imajev adapter. It does not accept arbitrary base models, optimizer resume archives, or continuously update a deployed model. Additional backends can implement the trainer's prepare, loss, predict, and export interface while retaining this dataset and workflow structure.
