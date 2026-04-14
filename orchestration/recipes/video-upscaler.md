---
title: Video upscaling
---

<script setup>
const sampleVideo = 'https://example.com/input.mp4';

const recipeBody = { video: sampleVideo };

const workflowBody = {
  steps: [{
    $type: 'videoUpscaler',
    input: { video: sampleVideo, scaleFactor: 2 },
  }],
};

const chainBody = {
  steps: [
    {
      $type: 'videoGen',
      name: 'clip',
      input: {
        engine: 'ltx2.3', operation: 'createVideo', model: '22b-distilled',
        prompt: 'A calm mountain lake at dawn, slow cinematic pan',
        duration: 5, width: 1280, height: 720, fps: 24,
        generateAudio: false, guidanceScale: 4, numInferenceSteps: 20,
      },
    },
    {
      $type: 'videoUpscaler',
      name: 'clip-hd',
      input: {
        video: { $ref: 'clip', path: 'output.video.url' },
        scaleFactor: 2,
      },
    },
  ],
};
</script>

# Video upscaling

The `videoUpscaler` step type takes a video and returns a higher-resolution version using **[FlashVSR](https://huggingface.co/JunhaoZhuang/FlashVSR)** — a real-time video super-resolution model. One model, one knob: `scaleFactor` multiplies both dimensions by `2`, `3`, or `4`. A 720p input upscaled at `scaleFactor: 2` becomes 1440p; at `scaleFactor: 4` it becomes 2880p.

Common uses:

- Finishing step after video generation (chain `videoGen` → `videoUpscaler`)
- Rescuing low-resolution source clips
- Preparing clips for large-format display

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A source video URL — publicly fetchable by the orchestrator (Civitai CDN URLs work directly)

## The simplest request

Use the per-recipe endpoint when you're upscaling a single video and don't need webhooks or multi-step chaining:

```http
POST https://orchestration.civitai.com/v2/consumer/recipes/videoUpscaler?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "video": "https://.../input.mp4"
}
```

<RecipeRun :body="recipeBody" path="/v2/consumer/recipes/videoUpscaler" :wait="0" />

::: warning Replace the placeholder URL
Swap `https://example.com/input.mp4` for a real, publicly fetchable video before clicking **Submit**. Civitai-hosted clips (`video.civitai.com/...`) work without extra auth.
:::

Defaults apply `scaleFactor: 2`. The response is a full [`Workflow`](/orchestration/reference/operations/GetWorkflow) whose single step carries the upscaled video blob.

::: tip Use `wait=0` for video
FlashVSR on a multi-second clip almost always exceeds the [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline). Submit with `wait=0`, then poll or [subscribe via webhook](/orchestration/guide/results-and-webhooks).
:::

## Via the generic workflow endpoint

Equivalent request through [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — use this path when you need webhooks, tags, or to chain with other steps:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoUpscaler",
    "input": {
      "video": "https://.../input.mp4",
      "scaleFactor": 2
    }
  }]
}
```

<RecipeRun :body="workflowBody" :wait="0" />

## Input fields

See the [`VideoUpscalerInput` schema](/orchestration/reference/operations/InvokeVideoUpscalerStepTemplate) for the full definition.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `video` | ✅ | — | URL of the source video. Must be publicly fetchable without auth. |
| `scaleFactor` | | `2` | Integer `2`–`4`. Output dimensions are `input × scaleFactor` on both axes. |

### Picking a scale factor

FlashVSR applies a single pass at your chosen scale — there's no equivalent to image-upscaling's `numberOfRepeats`. Higher factors quadratically increase output pixels *and* runtime.

::: warning Output is capped at 2560 px per side
The orchestrator probes your source at submit time and **rejects the request** (`400 Bad Request`) if `width × scaleFactor` or `height × scaleFactor` would exceed **2560**. This keeps FlashVSR within a shape it can reliably deliver.
:::

Practical combinations that land inside the cap:

| Source | Max `scaleFactor` | Upscaled output |
|--------|-------------------|-----------------|
| 480p (854×480) | `2` | 1708×960 |
| 540p (960×540) | `2` | 1920×1080 |
| 720p (1280×720) | `2` | 2560×1440 *(exactly at cap)* |
| 640×360 | `4` | 2560×1440 *(exactly at cap)* |
| 1080p (1920×1080) | — | already too large; transcode down before upscaling |

Rule of thumb: start at `scaleFactor: 2` and only step up when the source is small enough that the output still fits under 2560 px. The visual gains between `2` and `4` are usually smaller than the runtime cost implies.

## Chaining: generate then upscale

The most common two-step video flow — generate at a manageable resolution, then upscale in a single submission:

```json
{
  "steps": [
    {
      "$type": "videoGen",
      "name": "clip",
      "input": {
        "engine": "ltx2.3",
        "operation": "createVideo",
        "model": "22b-distilled",
        "prompt": "A calm mountain lake at dawn, slow cinematic pan",
        "duration": 5,
        "width": 1280,
        "height": 720,
        "fps": 24,
        "generateAudio": false,
        "guidanceScale": 4,
        "numInferenceSteps": 20
      }
    },
    {
      "$type": "videoUpscaler",
      "name": "clip-hd",
      "input": {
        "video": { "$ref": "clip", "path": "output.video.url" },
        "scaleFactor": 2
      }
    }
  ]
}
```

The `{ "$ref": "clip", "path": "output.video.url" }` reference creates a dependency — `clip-hd` doesn't start until `clip` succeeds, and the upscaler's `video` field is filled in with the generated clip's signed URL at runtime. See [Workflows & Jobs → Dependencies](/orchestration/guide/workflows-and-jobs#dependencies-parallelism) for the full reference syntax.

<RecipeRun :body="chainBody" :wait="0" />

Because the combined workflow easily runs past the 100-second request limit, submit with `wait=0` and poll — the built-in **Try It** widget does this automatically.

## Reading the result

A successful `videoUpscaler` step emits a single upscaled video blob:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "videoUpscaler",
    "status": "succeeded",
    "output": {
      "video": {
        "id": "blob_...",
        "url": "https://.../signed.mp4",
        "type": "video",
        "width": 2560,
        "height": 1440
      }
    }
  }]
}
```

Note: `videoUpscaler` output is `video` (singular VideoBlob with `width` / `height`), not a collection — the step always returns exactly one clip.

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) to get a fresh URL.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

`videoUpscaler` uses an empirical polynomial fit to real FlashVSR runtimes — cost scales with both the input pixel-frame product and the `scaleFactor`:

```
Pin = totalFrames × (width × height)        // frames × pixels
D   = −16.35
    + −1.15e-6  × Pin
    +  0.4366   × scaleFactor
    + −1.44e-16 × Pin²
    +  1.08e-6  × (Pin × scaleFactor)
    +  2.73     × scaleFactor²

total = max(1, D)
```

Because the polynomial has negative low-order coefficients, **small inputs floor at ~1–2 Buzz** and larger inputs grow quadratically in `Pin` and `scaleFactor`. A couple of realistic shapes:

| Source | `scaleFactor` | Estimated Buzz |
|--------|---------------|----------------|
| 5 s @ 720p, 24 fps (~120 frames) | `2` | low tens of Buzz |
| 5 s @ 720p, 24 fps | `3` | ~2× the scale-2 cost |
| 10 s @ 1080p, 30 fps | `2` | low hundreds |
| 10 s @ 1080p, 30 fps | `4` | *rejected* ([see the 2560 px cap](#picking-a-scale-factor)) |

Always run `whatif=true` before a large upscale — the polynomial grows fast once you pass 1 megapixel × hundreds of frames, and stacking `scaleFactor: 3` or `4` compounds it.

## Runtime

FlashVSR is GPU-heavy and scales with both source resolution *and* duration. A 5-second 720p clip at `scaleFactor: 2` typically takes a few minutes end-to-end including queue time; `scaleFactor: 4` can easily be 10×+ that. Always submit with `wait=0` plus [webhooks or polling](/orchestration/guide/results-and-webhooks) — a synchronous `wait=90` will almost always time out on real inputs.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "video could not be loaded" | URL not publicly reachable | Make sure the URL is fetchable without auth; avoid signed URLs that expire quickly. |
| `400` with "Upscaled resolution (…) exceeds maximum supported resolution (2560x2560)" | `source_dim × scaleFactor` > 2560 on either axis | Lower `scaleFactor`, or transcode the source to a smaller resolution first (see [`transcode`](/orchestration/reference/operations/InvokeTranscodeStepTemplate)) before upscaling. |
| `400` with "scaleFactor out of range" | Value outside `2`–`4` | Clamp client-side. FlashVSR doesn't support `1×` (identity) or >`4×`. |
| `400` with "Unable to analyze video file" | Source couldn't be probed (corrupt, wrong container, network error during probe) | Check the URL resolves and serves valid MP4/WebM; re-upload if the source is corrupt. |
| Step `failed`, step-level `reason` mentions unsupported codec | Unusual container or codec in source | Transcode the source to H.264 MP4 first (see the [`transcode` recipe](/orchestration/reference/operations/InvokeTranscodeStepTemplate)), then upscale. |
| Step `failed`, `reason = "blocked"` | Source video hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |
| Request timed out (`wait` expired) | FlashVSR too slow to finish in the synchronous window | Resubmit with `wait=0` and poll, or register a webhook. |

## Related

- [`InvokeVideoUpscalerStepTemplate`](/orchestration/reference/operations/InvokeVideoUpscalerStepTemplate) — the per-recipe endpoint
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/videoUpscaler/openapi.yaml) — standalone OpenAPI 3.1 YAML for this endpoint, ready to import into Postman / Insomnia / OpenAPI Generator
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — generic path for chaining
- [Image upscaling](./image-upscaler) — the `imageUpscaler` equivalent for images
- [WAN video generation](./wan) — generate clips to feed into this recipe
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running workflows
- [Workflows & Jobs → Dependencies](/orchestration/guide/workflows-and-jobs#dependencies-parallelism) — how the `$ref` references work
