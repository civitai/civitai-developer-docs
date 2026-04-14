---
title: Video frame interpolation
---

<script setup>
const sampleVideo = 'https://example.com/input.mp4';

const recipeBody = { video: sampleVideo };

const workflowBody = {
  steps: [{
    $type: 'videoInterpolation',
    input: { video: sampleVideo, interpolationFactor: 2 },
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
      $type: 'videoInterpolation',
      name: 'clip-smooth',
      input: {
        video: { $ref: 'clip', path: 'output.video.url' },
        interpolationFactor: 2,
      },
    },
  ],
};

const polishBody = {
  steps: [
    {
      $type: 'videoGen',
      name: 'clip',
      input: {
        engine: 'ltx2.3', operation: 'createVideo', model: '22b-distilled',
        prompt: 'Neon-lit city street at night, slow dolly forward',
        duration: 5, width: 1280, height: 720, fps: 24,
        generateAudio: false, guidanceScale: 4, numInferenceSteps: 20,
      },
    },
    {
      $type: 'videoInterpolation',
      name: 'clip-smooth',
      input: {
        video: { $ref: 'clip', path: 'output.video.url' },
        interpolationFactor: 2,
      },
    },
    {
      $type: 'videoUpscaler',
      name: 'clip-polished',
      input: {
        video: { $ref: 'clip-smooth', path: 'output.video.url' },
        scaleFactor: 2,
      },
    },
  ],
};
</script>

# Video frame interpolation

The `videoInterpolation` step type takes a video and returns a version with more frames per second, using **[VFIMamba](https://huggingface.co/MCG-NJU/VFIMamba)** — a frame-interpolation model that synthesizes intermediate frames between existing ones. `interpolationFactor: 2` doubles the frame count; `interpolationFactor: 3` triples it. Resolution and duration stay the same — only the frame rate changes, giving you smoother motion.

Common uses:

- **Smooth out generated video** — most video-gen models output at 16 or 24 FPS; interpolate to 48–72 FPS for smoother playback.
- **Rescue low-framerate source** — older footage at 24 FPS or hand-drawn animation at 12 FPS.
- **Full polish pass** — chain `videoGen` → `videoInterpolation` → `videoUpscaler` for a higher-res, higher-FPS output from a short gen.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A source video URL — publicly fetchable by the orchestrator (Civitai CDN URLs work directly)

## The simplest request

Use the per-recipe endpoint when you just want to smooth one clip and don't need webhooks or multi-step chaining:

```http
POST https://orchestration.civitai.com/v2/consumer/recipes/videoInterpolation?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "video": "https://.../input.mp4"
}
```

<RecipeRun :body="recipeBody" path="/v2/consumer/recipes/videoInterpolation" :wait="0" />

::: warning Replace the placeholder URL
Swap `https://example.com/input.mp4` for a real, publicly fetchable video before clicking **Submit**. Civitai-hosted clips (`video.civitai.com/...`) work without extra auth.
:::

Defaults apply `interpolationFactor: 2`. The response is a full [`Workflow`](/orchestration/reference/operations/GetWorkflow) whose single step carries the smoothed video blob.

::: tip Use `wait=0` for video
VFIMamba processes frame-by-frame and scales with clip length; a multi-second clip almost always exceeds the [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline). Submit with `wait=0`, then poll or [subscribe via webhook](/orchestration/guide/results-and-webhooks).
:::

## Via the generic workflow endpoint

Equivalent request through [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — use this path when you need webhooks, tags, or to chain with other steps:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoInterpolation",
    "input": {
      "video": "https://.../input.mp4",
      "interpolationFactor": 2
    }
  }]
}
```

<RecipeRun :body="workflowBody" :wait="0" />

## Input fields

See the [`VideoInterpolationInput` schema](/orchestration/reference/operations/InvokeVideoInterpolationStepTemplate) for the full definition.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `video` | ✅ | — | URL of the source video. Must be publicly fetchable without auth. Single video stream only — multi-track sources are rejected. |
| `interpolationFactor` | | `2` | Integer `2` or `3`. Output frame count ≈ `input × interpolationFactor`. |
| `model` | | `VFIMamba` | Currently the only supported model; leave as default. |

### Picking an interpolation factor

`interpolationFactor: 2` is the safe default — it doubles the frame count (e.g., 24 FPS → 48 FPS) and produces reliably smooth motion. `3` triples frames and works well on low-motion content, but can introduce artifacts on fast-moving or heavily-compressed sources. Start at `2` and only step up after visually confirming the output holds up.

### Source resolution limit

VFIMamba enforces a **2048 px hard cap on either axis** of the source — width AND height must each be ≤ 2048 before interpolation. The orchestrator probes your source at submit time and rejects the request (`400 Bad Request`) if it's larger.

If your source is 4K (3840×2160), downscale first via [`transcode`](/orchestration/reference/operations/InvokeTranscodeStepTemplate), then interpolate. Interpolation itself does not change resolution, so you can upscale afterwards if needed.

## Chaining: generate then smooth

The most common two-step flow — generate a short clip at the model's native FPS, then interpolate to a higher frame rate:

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
      "$type": "videoInterpolation",
      "name": "clip-smooth",
      "input": {
        "video": { "$ref": "clip", "path": "output.video.url" },
        "interpolationFactor": 2
      }
    }
  ]
}
```

The `{ "$ref": "clip", "path": "output.video.url" }` reference creates a dependency — `clip-smooth` doesn't start until `clip` succeeds, and the interpolator's `video` field is filled in with the generated clip's signed URL at runtime. See [Workflows & Jobs → Dependencies](/orchestration/guide/workflows-and-jobs#dependencies-parallelism) for the full reference syntax.

<RecipeRun :body="chainBody" :wait="0" />

## Full polish pass: generate → interpolate → upscale

For the highest-quality short clips, chain all three steps. Order matters — **interpolation must happen before upscaling**, because VFIMamba's 2048 px input cap is tighter than the upscaler's 2560 px output cap. Generating at 1280×720, interpolating at that size (within the 2048 cap), then upscaling 2× to 2560×1440 (at the 2560 cap) satisfies both:

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
        "prompt": "Neon-lit city street at night, slow dolly forward",
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
      "$type": "videoInterpolation",
      "name": "clip-smooth",
      "input": {
        "video": { "$ref": "clip", "path": "output.video.url" },
        "interpolationFactor": 2
      }
    },
    {
      "$type": "videoUpscaler",
      "name": "clip-polished",
      "input": {
        "video": { "$ref": "clip-smooth", "path": "output.video.url" },
        "scaleFactor": 2
      }
    }
  ]
}
```

What happens at runtime:

1. **`clip`** generates a 5-second 1280×720 clip at 24 FPS with LTX2.3 (`22b-distilled` for speed).
2. **`clip-smooth`** doubles the frame count → ~48 FPS, same 1280×720 resolution and duration — comfortably under VFIMamba's 2048 px cap.
3. **`clip-polished`** upscales 2× → 2560×1440, landing exactly at the [upscaler cap](./video-upscaler#picking-a-scale-factor).

Flipping the order (upscale then interpolate) would produce a 2560×1440 intermediate that VFIMamba *won't accept* — its 2048 px cap rejects it at submit time with a `400`.

<RecipeRun :body="polishBody" :wait="0" />

Because the combined workflow is guaranteed to exceed the 100-second request limit, submit with `wait=0` and poll — the built-in **Try It** widget does this automatically.

## Reading the result

A successful `videoInterpolation` step emits a single video blob at the same resolution as the input:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "videoInterpolation",
    "status": "succeeded",
    "output": {
      "video": {
        "id": "blob_...",
        "url": "https://.../signed.mp4",
        "type": "video",
        "width": 1280,
        "height": 720
      }
    }
  }]
}
```

Note: `videoInterpolation` output is `video` (singular VideoBlob), not a collection. The reported `width` / `height` mirror the source — interpolation only changes frame count, not pixel dimensions.

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) to get a fresh URL.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

VFIMamba's cost scales with input pixel-frame volume, with a fixed overhead per call:

```
totalFrames        = durationSeconds × fps
pixelFrameProduct  = width × height × totalFrames / 1 000 000

total = C0 + C1 × pixelFrameProduct
        where (C0, C1) = (2.188, 0.29297)   if interpolationFactor == 2
              (C0, C1) = (0.324, 0.51379)   if interpolationFactor == 3
```

| Shape | Buzz |
|-------|------|
| 5 s @ 720p, 24 fps, `interpolationFactor: 2` | ~33 |
| 10 s @ 720p, 24 fps, `interpolationFactor: 2` | **~67** |
| 10 s @ 1080p, 30 fps, `interpolationFactor: 2` | ~180 |
| 10 s @ 720p, 24 fps, `interpolationFactor: 3` | ~114 |

`interpolationFactor: 3` roughly doubles the per-frame cost coefficient, so plan on ~1.75× the price over `2`. Resolution and duration scale linearly.

## Runtime

VFIMamba's runtime scales roughly linearly with **input-frame-count × resolution**. A 5-second 720p clip at 24 FPS (120 frames) at `interpolationFactor: 2` generates ~120 new frames and typically takes a couple of minutes end-to-end including queue time. `interpolationFactor: 3` does ~2× the work. Always submit with `wait=0` plus [webhooks or polling](/orchestration/guide/results-and-webhooks); a synchronous `wait=90` will time out on most realistic inputs.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "video could not be loaded" | URL not publicly reachable | Make sure the URL is fetchable without auth; avoid signed URLs that expire quickly. |
| `400` with "Video resolution (…) exceeds maximum supported resolution (2048x2048)" | Source is wider or taller than 2048 px | Downscale first via [`transcode`](/orchestration/reference/operations/InvokeTranscodeStepTemplate), then interpolate. |
| `400` with "Only 1 video stream is supported" | Multi-track source (e.g., camera with picture-in-picture) | Re-encode the source to a single video stream before submitting. |
| `400` with "interpolationFactor out of range" | Value outside `2`–`3` | Clamp client-side. VFIMamba only supports 2× or 3×. |
| `400` with "Unable to analyze video file" | Source couldn't be probed (corrupt, wrong container, network error during probe) | Check the URL resolves and serves valid MP4/WebM; re-upload if the source is corrupt. |
| Output has artifacts / ghosting on fast motion | `interpolationFactor: 3` too aggressive for high-motion content | Drop to `2`, or pre-stabilize the source. |
| Step `failed`, `reason = "blocked"` | Source video hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |
| Request timed out (`wait` expired) | VFIMamba too slow to finish in the synchronous window | Resubmit with `wait=0` and poll, or register a webhook. |

## Related

- [`InvokeVideoInterpolationStepTemplate`](/orchestration/reference/operations/InvokeVideoInterpolationStepTemplate) — the per-recipe endpoint
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/videoInterpolation/openapi.yaml) — standalone OpenAPI 3.1 YAML for this endpoint, ready to import into Postman / Insomnia / OpenAPI Generator
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — generic path for chaining
- [Video upscaling](./video-upscaler) — the `videoUpscaler` recipe for increasing resolution
- [WAN video generation](./wan) — generate clips to feed into this recipe
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running workflows
- [Workflows & Jobs → Dependencies](/orchestration/guide/workflows-and-jobs#dependencies-parallelism) — how the `$ref` references work
