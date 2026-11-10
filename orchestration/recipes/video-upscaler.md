---
title: Video upscaling
---

<script setup>
const sampleVideo = 'https://raw.githubusercontent.com/intel-iot-devkit/sample-videos/master/head-pose-face-detection-male.mp4';

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

The `videoUpscaler` step takes a video and returns a higher-resolution MP4. Choose `model: "flashvsr"` (the default) for 2x, 3x or 4x scaling, or `model: "relayvsr"` for native 2x or 4x scaling. Both preserve the source frame rate and audio. RelayVSR uses a one-step model and needs no prompt.

Common uses:

- Finishing step after video generation (chain `videoGen` → `videoUpscaler`)
- Rescuing low-resolution source clips
- Preparing clips for large-format display

## Prerequisites

- A source video URL — publicly fetchable by the orchestrator (Civitai CDN URLs work directly)

## The simplest request

Use the per-recipe endpoint when you're upscaling a single video and don't need webhooks or multi-step chaining:

```http
POST https://orchestration.civitai.com/v2/consumer/recipes/videoUpscaler
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "video": "https://.../input.mp4"
}
```

<RecipeRun :body="recipeBody" path="/v2/consumer/recipes/videoUpscaler" :wait="0" />

Defaults apply `model: "flashvsr"` and `scaleFactor: 2`. The recipe endpoint blocks until the step finishes and returns the step output directly — the `video` blob described in [Reading the result](#reading-the-result).

::: tip Long clips: use the generic endpoint
FlashVSR on a multi-second clip almost always outlasts [your HTTP client's timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline), and the recipe endpoint cancels the run if the client disconnects. Submit through the [generic workflow endpoint](#via-the-generic-workflow-endpoint) with `wait=0`, then poll or [subscribe via webhook](/orchestration/guide/results-and-webhooks).
:::

## Via the generic workflow endpoint

The same request through [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow), for webhooks, tags or chaining:

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

## RelayVSR

Set `model` to `relayvsr` and choose `scaleFactor: 2` or `4`. Each scale selects its matching checkpoint and decoder from [Comfy-Org/RelayVSR](https://huggingface.co/Comfy-Org/RelayVSR).

```json
{
  "steps": [{
    "$type": "videoUpscaler",
    "input": {
      "video": "https://.../input.mp4",
      "model": "relayvsr",
      "scaleFactor": 4
    }
  }]
}
```

The existing 2560 px per-side limit still applies. For example, a 512×288 clip becomes 2048×1152 at 4x. A 3x RelayVSR request is rejected.

## Input fields

See the [`VideoUpscalerInput` schema](/orchestration/reference/operations/InvokeVideoUpscalerStepTemplate) for the full definition.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `video` | ✅ | — | URL of the source video. Must be publicly fetchable without auth. |
| `model` | | `flashvsr` | `flashvsr` or `relayvsr`. |
| `scaleFactor` | | `2` | FlashVSR: `2`, `3`, `4`. RelayVSR: `2`, `4`. Multiplies both dimensions. |

### Picking a scale factor

FlashVSR applies a single pass at your chosen scale — there's no equivalent to image-upscaling's `numberOfRepeats`. Higher factors quadratically increase output pixels *and* runtime.

::: warning Output is capped at 2560 px per side
The orchestrator probes your source at submit time and **rejects the request** (`400 Bad Request`) if `width × scaleFactor` or `height × scaleFactor` would exceed **2560**. This cap applies to both models.
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

`clip-hd` waits for `clip` to succeed; the `$ref` then fills its `video` with the generated clip's signed URL ([Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism)).

<RecipeRun :body="chainBody" :wait="0" />

Because the combined workflow runs for minutes, submit with `wait=0` and poll — the built-in **Try It** widget does this automatically.

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

Blob URLs expire — see [Reading results](/orchestration/recipes/#reading-results).

## Cost

Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

RelayVSR costs **5 Buzz plus 0.06 Buzz per output megapixel-frame**, rounded up before tips:

```
outputMegapixels = width × height × scaleFactor² / 1,000,000
total = 5 + ceil(durationSeconds × fps × outputMegapixels × 0.06)
```

For a 10-second 320×176 clip at 25 fps, that is about 9 Buzz at 2x or 19 Buzz at 4x. Source duration includes container timing, so use `whatif=true` for the exact quote. The rate includes video decoding and encoding overhead and is based on local RTX 4090 measurements.

FlashVSR uses an empirical polynomial fit to measured runtimes — cost scales with both the input pixel-frame product and the `scaleFactor`:

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

FlashVSR is GPU-heavy and scales with both source resolution *and* duration. A 5-second 720p clip at `scaleFactor: 2` typically takes a few minutes end-to-end including queue time; `scaleFactor: 4` can easily be 10×+ that. Submit through the [generic workflow endpoint](#via-the-generic-workflow-endpoint) with `wait=0` plus [webhooks or polling](/orchestration/guide/results-and-webhooks) — a synchronous call will almost always time out on real inputs.

## Troubleshooting

Timeouts, moderation blocks and expired blob URLs: see [Common troubleshooting](/orchestration/recipes/#common-troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "video could not be loaded" | URL not publicly reachable | Make sure the URL is fetchable without auth; avoid signed URLs that expire quickly. |
| `400` with "Upscaled resolution (…) exceeds maximum supported resolution (2560x2560)" | `source_dim × scaleFactor` > 2560 on either axis | Lower `scaleFactor`, or transcode the source to a smaller resolution first (see [`transcode`](/orchestration/reference/operations/InvokeTranscodeStepTemplate)) before upscaling. |
| `400` with "scaleFactor out of range" | Value outside `2`–`4` | Clamp client-side. FlashVSR doesn't support `1×` (identity) or >`4×`. |
| `400` with "Unable to analyze video file" | Source couldn't be probed (corrupt, wrong container, network error during probe) | Check the URL resolves and serves valid MP4/WebM; re-upload if the source is corrupt. |
| Step `failed`, step-level `reason` mentions unsupported codec | Unusual container or codec in source | Transcode the source to H.264 MP4 first (see the [`transcode` recipe](/orchestration/reference/operations/InvokeTranscodeStepTemplate)), then upscale. |

## Related

- [`InvokeVideoUpscalerStepTemplate`](/orchestration/reference/operations/InvokeVideoUpscalerStepTemplate) — the per-recipe endpoint
- [`videoUpscaler` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/videoUpscaler/openapi.yaml)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — generic path for chaining
- [Image upscaling](./image-upscaler) — the `imageUpscaler` equivalent for images
- [WAN video generation](./wan) — generate clips to feed into this recipe
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running workflows
- [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism) — how the `$ref` references work
