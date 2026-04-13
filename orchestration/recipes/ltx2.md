---
title: LTX2 video generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/c7281429-7dc8-4256-9907-2e2c55137f40/original=true,quality=90,optimized=true/42750475.jpeg';

const createT2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'ltx2.3', operation: 'createVideo', model: '22b-distilled',
      prompt: 'A beautiful sunset over the ocean with waves crashing',
      duration: 5, width: 1280, height: 720, fps: 24,
      generateAudio: false, guidanceScale: 4, numInferenceSteps: 20,
    },
  }],
};

const createI2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'ltx2.3', operation: 'createVideo', model: '22b-dev',
      prompt: 'The cat starts walking and exploring',
      images: [sampleImage],
      duration: 5, width: 1280, height: 720, fps: 24,
    },
  }],
};

const flfBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'ltx2.3', operation: 'firstLastFrameToVideo', model: '22b-dev',
      prompt: 'smooth transition from morning to night',
      firstFrame: 'https://example.com/start.jpeg',
      lastFrame: 'https://example.com/end.jpeg',
      frameGuideStrength: 0.8,
      duration: 5, width: 1280, height: 720, fps: 24,
    },
  }],
};

const editBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'ltx2.3', operation: 'editVideo', model: '22b-dev',
      prompt: 'Transform the scene into a cyberpunk aesthetic with neon lighting',
      sourceVideo: 'https://example.com/input.mp4',
      cannyLowThreshold: 100, cannyHighThreshold: 200, guideStrength: 0.7,
    },
  }],
};

const extendBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'ltx2.3', operation: 'extendVideo', model: '22b-dev',
      prompt: 'The scene continues with gentle camera push-in',
      sourceVideo: 'https://example.com/clip.mp4',
      numFrames: 48, fps: 24,
    },
  }],
};

const v2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'ltx2.3', operation: 'videoToVideo', model: '22b-dev',
      prompt: 'Rendered in the style of a watercolor painting',
      sourceVideo: 'https://example.com/clip.mp4',
    },
  }],
};

const a2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'ltx2.3', operation: 'audioToVideo', model: '22b-dev',
      prompt: 'A person speaks directly to camera with natural lip movements',
      negativePrompt: 'frozen lips, off-sync lips, blurry',
      sourceAudio: 'https://example.com/voiceover.mp3',
      referenceImage: 'https://example.com/portrait.jpeg',
      audioToVideoAttentionScale: 2.0, imageGuideStrength: 0.7,
      duration: 5, width: 1280, height: 720, fps: 24,
    },
  }],
};
</script>

# LTX2 video generation

LTX2 is Lightricks' open video-generation model family. The orchestrator exposes both LTX2 and the newer LTX2.3 through the `videoGen` step, running on Civitai's ComfyUI workers. This recipe covers both versions end-to-end.

## Versions at a glance

| `engine` | Models | Operations | Notes |
|----------|--------|------------|-------|
| `ltx2.3` | `22b-dev`, `22b-distilled` | `createVideo`, `firstLastFrameToVideo`, `editVideo`, `extendVideo`, `videoToVideo`, `audioToVideo` | Current release. Adds style transfer (`videoToVideo`) and audio-driven talking-head generation (`audioToVideo`). |
| `ltx2` | `19b-dev`, `19b-distilled` | `createVideo`, `firstLastFrameToVideo`, `editVideo`, `extendVideo` | Previous release. Still supported. |

**Default choice for new integrations**: `engine: "ltx2.3"`, `model: "22b-distilled"` for speed, `"22b-dev"` for maximum quality.

## The request shape

Every LTX2 request is a single `videoGen` step on [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow). Three keys select which LTX2 variant runs:

```json
{
  "$type": "videoGen",
  "input": {
    "engine":    "ltx2.3",       // ltx2 | ltx2.3
    "operation": "createVideo",  // see table above
    "model":     "22b-distilled" // version-specific
  }
}
```

There's no `provider` discriminator — LTX2 currently only runs on Comfy. Each combination dispatches to its typed input schema (`ComfyLtx23CreateVideoInput`, `ComfyLtx2EditVideoInput`, …) so fields invalid for that combination get rejected with a `400`.

## Operations

All examples target production and use `<your-token>` in place of your Bearer token. LTX2 jobs typically exceed the [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) — submit with `wait=0` and handle completion via webhooks or polling.

### createVideo

Single operation covers both **text-to-video** and **image-to-video** — add `images` to turn any text-to-video request into image-to-video.

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?whatif=false&wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "ltx2.3",
      "operation": "createVideo",
      "model": "22b-distilled",
      "prompt": "A beautiful sunset over the ocean with waves crashing",
      "duration": 5,
      "width": 1280,
      "height": 720,
      "fps": 24,
      "generateAudio": false,
      "guidanceScale": 4,
      "numInferenceSteps": 20
    }
  }]
}
```

<RecipeRun :body="createT2VBody" />

Image-to-video: pass one or more images via `images`.

```json
{
  "engine": "ltx2.3",
  "operation": "createVideo",
  "model": "22b-dev",
  "prompt": "The cat starts walking and exploring",
  "images": [
    "https://image.civitai.com/.../42750475.jpeg"
  ],
  "duration": 5,
  "width": 1280,
  "height": 720,
  "fps": 24
}
```

<RecipeRun :body="createI2VBody" />

### firstLastFrameToVideo

Interpolate between two keyframes (or extend from a single first frame).

```json
{
  "engine": "ltx2.3",
  "operation": "firstLastFrameToVideo",
  "model": "22b-dev",
  "prompt": "smooth transition from morning to night",
  "firstFrame": "https://.../start.jpeg",
  "lastFrame":  "https://.../end.jpeg",
  "frameGuideStrength": 0.8,
  "duration": 5,
  "width": 1280,
  "height": 720,
  "fps": 24
}
```

Omit `lastFrame` to seed the motion from just the first frame.

<RecipeRun :body="flfBody" />

::: warning Frame URLs
Replace the `https://example.com/start.jpeg` and `/end.jpeg` placeholders with publicly fetchable image URLs before submitting.
:::

### editVideo

Input video + prompt → transformed video. Uses Canny edge-maps for structural preservation.

```json
{
  "engine": "ltx2.3",
  "operation": "editVideo",
  "model": "22b-dev",
  "prompt": "Transform the scene into a cyberpunk aesthetic with neon lighting",
  "sourceVideo": "https://.../input.mp4",
  "cannyLowThreshold": 100,
  "cannyHighThreshold": 200,
  "guideStrength": 0.7
}
```

<RecipeRun :body="editBody" />

### extendVideo

Continue an existing clip for `numFrames` more frames.

```json
{
  "engine": "ltx2.3",
  "operation": "extendVideo",
  "model": "22b-dev",
  "prompt": "The scene continues with gentle camera push-in",
  "sourceVideo": "https://.../clip.mp4",
  "numFrames": 48,
  "fps": 24
}
```

<RecipeRun :body="extendBody" />

### videoToVideo *(LTX2.3 only)*

Style-transfer an entire video.

```json
{
  "engine": "ltx2.3",
  "operation": "videoToVideo",
  "model": "22b-dev",
  "prompt": "Rendered in the style of a watercolor painting",
  "sourceVideo": "https://.../clip.mp4"
}
```

<RecipeRun :body="v2vBody" />

### audioToVideo *(LTX2.3 only)*

Audio-driven generation. With just `sourceAudio`, produces a matching visual scene; add `referenceImage` for talking-head / lip-sync output.

```json
{
  "engine": "ltx2.3",
  "operation": "audioToVideo",
  "model": "22b-dev",
  "prompt": "A person speaks directly to camera with natural lip movements",
  "negativePrompt": "frozen lips, off-sync lips, blurry",
  "sourceAudio": "https://.../voiceover.mp3",
  "referenceImage": "https://.../portrait.jpeg",
  "audioToVideoAttentionScale": 2.0,
  "imageGuideStrength": 0.7,
  "duration": 5,
  "width": 1280,
  "height": 720,
  "fps": 24
}
```

<RecipeRun :body="a2vBody" />

::: warning Source URLs
The `extendVideo`, `videoToVideo`, and `audioToVideo` examples on this page use `https://example.com/...` placeholders for source media. Replace them with publicly fetchable URLs before submitting.
:::

## Common parameters

Shared across most (engine, operation) combinations. The per-variant schema in the [API reference](/orchestration/reference/) is authoritative.

| Field | Typical values | Notes |
|-------|----------------|-------|
| `model` | `22b-dev` / `22b-distilled` (2.3); `19b-dev` / `19b-distilled` (2.0) | `-distilled` is faster with slightly lower fidelity; `-dev` is maximum quality. |
| `width` / `height` | `1280×720`, `720×1280`, `1024×1024` | Vertical for phones: swap to `720×1280`. |
| `duration` | `3`–`20` seconds | Longer = proportionally longer runtime. |
| `fps` | `24`, `30` | Frame rate of the generated clip. |
| `guidanceScale` | `3`–`7` | Prompt adherence. Higher = closer to prompt but less creative. |
| `numInferenceSteps` | `20`–`40` | More steps = higher quality, longer runtime. |
| `generateAudio` | `true` / `false` | Emit a soundtrack alongside the video. |
| `negativePrompt` | string | What you *don't* want. |
| `seed` | integer | Reproducibility. |
| `loras` | object / array | Attach community LoRAs to bias style or subject. Format: `{ "air": "urn:air:lora:civitai:<modelId>@<versionId>", "strength": 0.8 }`. |

## Choosing a model

| Need | Pick |
|------|------|
| Fastest turnaround, batch generation | `22b-distilled` (or `19b-distilled`) |
| Highest fidelity, final-quality renders | `22b-dev` |
| Parity with an older pipeline | `19b-dev` / `19b-distilled` |

## Reading the result

Same as any `videoGen` step — one output blob per clip:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "videoGen",
    "status": "succeeded",
    "output": {
      "blobs": [{ "id": "blob_...", "url": "https://.../signed.mp4" }]
    }
  }]
}
```

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL.

## Long-running jobs

LTX2.3 `22b-dev` at 1280×720 / 5 s typically runs 2–5 minutes; `editVideo` and `audioToVideo` can go longer. All of these exceed the [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline), so prefer `wait=0` and:

- **Webhooks** (recommended): register a callback with `type: ["workflow:succeeded", "workflow:failed"]` — see [Results & webhooks](/orchestration/guide/results-and-webhooks)
- **Polling**: `GET /v2/consumer/workflows/{workflowId}` on a 10 s → 30 s → 60 s cadence

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with unknown field | Field isn't valid for this `(engine, operation)` combo | Check the specific `ComfyLtx<Ver><Op>Input` schema via [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow). |
| Step `failed`, `reason = "no_provider_available"` | No Comfy worker has the requested model warm | Retry shortly; or try the other model (`-dev` ↔ `-distilled`). |
| Audio-to-video lip-sync poor | Attention scale too low, or audio clipping | Raise `audioToVideoAttentionScale` (e.g. `2.0` → `3.0`); re-encode source audio at constant bitrate. |
| Edit-video loses structure | Canny guide too weak | Raise `guideStrength` (`0.7` → `0.85`) or widen the Canny thresholds. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production-ready result handling
- [WAN video generation](./wan) — comparable recipe for the WAN model family
- Full parameter catalog: the `ComfyLtx23<Operation>Input` and `ComfyLtx2<Operation>Input` schemas in the [API reference](/orchestration/reference/)
