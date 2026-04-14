---
title: Kling video generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const klingT2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'kling', model: 'v2.5-turbo',
      prompt: 'A serene mountain lake at dawn with mist rolling over the water',
      aspectRatio: '16:9', duration: '5',
    },
  }],
};

const klingI2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'kling', model: 'v1.6',
      prompt: 'The subject slowly turns to face the camera with a gentle smile',
      sourceImage: sampleImage,
      aspectRatio: '16:9', duration: '5', mode: 'Standard',
    },
  }],
};

const klingV3T2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'kling-v3', operation: 'text-to-video',
      prompt: 'A timelapse of a flower blooming in a sunlit meadow',
      aspectRatio: '16:9', duration: 5, mode: 'Standard',
    },
  }],
};

const klingV3I2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'kling-v3', operation: 'image-to-video',
      prompt: 'The cat stretches and yawns, then looks directly into the camera',
      sourceImage: sampleImage,
      aspectRatio: '16:9', duration: 5,
    },
  }],
};

const klingV3FlFBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'kling-v3', operation: 'image-to-video',
      prompt: 'Smooth cinematic transition between the two scenes',
      sourceImage: 'https://example.com/start.jpeg',
      endImage: 'https://example.com/end.jpeg',
      aspectRatio: '16:9', duration: 5,
    },
  }],
};
</script>

# Kling video generation

Kuaishou's Kling model family, available in two generations through the `videoGen` step:

| `engine` | Models | Notes |
|----------|--------|-------|
| `kling` | `v1`, `v1.5`, `v1.6`, `v2`, `v2.5-turbo` | Original Kling. Text-to-video and image-to-video. |
| `kling-v3` | *(version-agnostic)* | Kling V3. Five operations including video-to-video and reference-to-video. Duration in seconds (3–15). |

**Default choice for new integrations**: `engine: "kling-v3"` with `operation: "text-to-video"`. For speed + cost, use `mode: "Standard"`; for highest quality, `mode: "Professional"`.

All Kling jobs exceed the [100-second timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) — always submit with `wait=0` and handle results via webhooks or polling.

## Kling (original)

### Text-to-video

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "kling",
      "model": "v2.5-turbo",
      "prompt": "A serene mountain lake at dawn with mist rolling over the water",
      "aspectRatio": "16:9",
      "duration": "5"
    }
  }]
}
```

<RecipeRun :body="klingT2VBody" />

### Image-to-video

Pass `sourceImage` (URL, data URL, or Base64) to animate a start frame:

```json
{
  "engine": "kling",
  "model": "v1.6",
  "prompt": "The subject slowly turns to face the camera",
  "sourceImage": "https://image.civitai.com/.../photo.jpeg",
  "aspectRatio": "16:9",
  "duration": "5",
  "mode": "Standard"
}
```

<RecipeRun :body="klingI2VBody" />

### Parameters

| Field | Default | Notes |
|-------|---------|-------|
| `engine` | — ✅ | `"kling"` |
| `model` | — ✅ | `"v1"` / `"v1.5"` / `"v1.6"` / `"v2"` / `"v2.5-turbo"` |
| `prompt` | — ✅ | Generation prompt. |
| `negativePrompt` | `null` | What to avoid. |
| `mode` | `"Standard"` | `"Standard"` or `"Professional"`. Affects quality and cost for v1/v1.5/v1.6. Ignored for v2/v2.5-turbo. |
| `aspectRatio` | `"16:9"` | `"16:9"`, `"9:16"`, `"1:1"` |
| `duration` | `"5"` | `"5"` or `"10"` (seconds). String enum. |
| `cfgScale` | `0.5` | 0–1. Prompt adherence. |
| `sourceImage` | `null` | URL / data URL / Base64. Enables image-to-video. |
| `cameraControl` | `null` | Fine camera motion — see [Camera control](#camera-control) below. |

### Cost

| Model | 5 s | 10 s |
|-------|-----|------|
| `v1` / `v1.5` / `v1.6` Standard | **600** | **1 200** |
| `v1` / `v1.5` / `v1.6` Professional | **1 050** | **2 100** |
| `v2` | **1 200** | **2 400** |
| `v2.5-turbo` | **600** | **1 200** |

### Camera control

Available on all models. Provide a `cameraControl` object with a `config` sub-object containing any of these axes (all -10 to 10, default null = no control):

| Axis | Effect |
|------|--------|
| `horizontal` | Translate left (−) / right (+) |
| `vertical` | Translate down (−) / up (+) |
| `pan` | Rotate left (−) / right (+) around Y axis |
| `tilt` | Rotate down (−) / up (+) around X axis |
| `roll` | Counter-clockwise (−) / clockwise (+) around Z axis |
| `zoom` | Narrow FOV (−) / widen FOV (+) |

```json
{
  "cameraControl": {
    "config": { "zoom": -3, "pan": 2 }
  }
}
```

---

## Kling V3 (`engine: "kling-v3"`)

Kling V3 introduces a richer operation set via the `operation` discriminator.

### Operations

| `operation` | Description | Key inputs |
|-------------|-------------|------------|
| `text-to-video` | Generate from a text prompt | `prompt` |
| `image-to-video` | Animate a start frame (optionally to an end frame) | `sourceImage`, optionally `endImage` |
| `reference-to-video` | Stylize video from reference images | `images[]` |
| `video-to-video-edit` | Edit an existing video guided by a prompt | `videoUrl` |
| `video-to-video-reference` | Reference an existing video's motion/structure | `videoUrl`, optionally `images[]` |

### Text-to-video

```json
{
  "engine": "kling-v3",
  "operation": "text-to-video",
  "prompt": "A timelapse of a flower blooming in a sunlit meadow",
  "aspectRatio": "16:9",
  "duration": 5,
  "mode": "Standard"
}
```

<RecipeRun :body="klingV3T2VBody" />

### Image-to-video

```json
{
  "engine": "kling-v3",
  "operation": "image-to-video",
  "prompt": "The cat stretches and yawns, then looks directly into the camera",
  "sourceImage": "https://image.civitai.com/.../photo.jpeg",
  "aspectRatio": "16:9",
  "duration": 5
}
```

Add `endImage` to interpolate between a start frame and an end frame:

```json
{
  "engine": "kling-v3",
  "operation": "image-to-video",
  "prompt": "Smooth cinematic transition",
  "sourceImage": "https://.../start.jpeg",
  "endImage":   "https://.../end.jpeg",
  "duration": 5
}
```

<RecipeRun :body="klingV3I2VBody" />

::: warning Placeholder URLs
The first-last-frame example uses `https://example.com/` placeholders. Replace them with publicly accessible image URLs before submitting.
:::

### Video-to-video

Edit or reference the motion of an existing video:

```json
{
  "engine": "kling-v3",
  "operation": "video-to-video-edit",
  "prompt": "Transform the scene into a vintage 1970s film aesthetic with grain",
  "videoUrl": "https://example.com/input.mp4",
  "duration": 5,
  "mode": "Standard"
}
```

Use `video-to-video-reference` to guide generation from a video's motion without directly editing it.

### Multi-prompt (Kling V3)

`multiPrompt` lets you sequence different prompts across a video timeline. Each entry has a `prompt` and a `duration` (seconds that prompt controls):

```json
{
  "engine": "kling-v3",
  "operation": "text-to-video",
  "prompt": "Base scene description",
  "multiPrompt": [
    { "prompt": "The camera slowly pushes in on the subject", "duration": 3 },
    { "prompt": "The subject looks up and the scene brightens", "duration": 4 }
  ]
}
```

### Audio generation (Kling V3)

Set `generateAudio: true` to produce a synchronized audio track. Optionally provide `voiceIds` to use a specific voice profile:

```json
{
  "generateAudio": true,
  "voiceIds": ["voice_abc123"]
}
```

For video-to-video operations, `keepAudio: true` (default) preserves the original video's audio.

### Parameters (Kling V3)

| Field | Default | Notes |
|-------|---------|-------|
| `engine` | — ✅ | `"kling-v3"` |
| `operation` | `"text-to-video"` | See operations table above. |
| `prompt` | — ✅ | Generation prompt. |
| `mode` | `"Standard"` | `"Standard"` or `"Professional"`. |
| `duration` | `5` | 3–15 seconds (integer, unlike the original `kling` engine). |
| `aspectRatio` | `"16:9"` | `"16:9"`, `"9:16"`, `"1:1"` |
| `sourceImage` | `null` | Start frame for `image-to-video`. |
| `endImage` | `null` | End frame for first-last-frame interpolation. |
| `images[]` | `[]` | Reference images for `reference-to-video`. |
| `videoUrl` | `null` | Source video for `video-to-video-*` operations. |
| `generateAudio` | `false` | Generate a synchronized audio track. |
| `voiceIds` | `null` | Voice profile IDs for audio generation. |
| `keepAudio` | `true` | Preserve source video audio in video-to-video operations. |
| `multiPrompt[]` | `null` | Time-sequenced prompts `{ prompt, duration }`. |

### Cost (Kling V3)

Cost scales linearly with `duration`. All costs are in Buzz per second:

| Operation group | Mode | Audio | Buzz/s |
|-----------------|------|-------|--------|
| t2v / i2v / ref | Standard | No | 219 |
| t2v / i2v / ref | Standard | Yes | 292 |
| t2v / i2v / ref | Professional | No | 292 |
| t2v / i2v / ref | Professional | Yes | 364 |
| v2v-edit / v2v-ref | Standard | — | 328 |
| v2v-edit / v2v-ref | Professional | — | 437 |

Examples at `duration: 5`:

| Scenario | Buzz |
|----------|------|
| Standard t2v, no audio, 5 s | **~1 095** |
| Standard t2v, with audio, 5 s | **~1 460** |
| Professional t2v, no audio, 5 s | **~1 460** |
| Professional t2v, with audio, 5 s | **~1 820** |
| Standard video-to-video, 5 s | **~1 640** |
| Professional video-to-video, 5 s | **~2 185** |

---

## Reading the result

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "videoGen",
    "status": "succeeded",
    "output": {
      "video": { "id": "blob_...", "url": "https://.../signed.mp4" }
    }
  }]
}
```

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL.

## Long-running jobs

Kling V3 Standard at 5 s typically completes in 2–5 minutes; Professional and longer durations take longer. Always use `wait=0` and handle via:

- **Webhooks** (recommended): `type: ["workflow:succeeded", "workflow:failed"]` — see [Results & webhooks](/orchestration/guide/results-and-webhooks)
- **Polling**: `GET /v2/consumer/workflows/{workflowId}` on a 10 s → 30 s → 60 s cadence

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "duration must be one of" (kling) | Sent integer instead of string | The original `kling` engine uses string duration: `"5"` or `"10"`. |
| `400` with "model is required" (kling) | Missing `model` on the original engine | `model` is required for `kling`; it is not used by `kling-v3`. |
| `400` with "sourceImage is required" | Used `image-to-video` without an image | Provide `sourceImage` for `image-to-video`. |
| `400` with "videoUrl is required" | Used `video-to-video-*` without a source video | Provide `videoUrl` for video-to-video operations. |
| Step `failed`, `reason = "no_provider_available"` | No Kling worker available | Retry shortly. |
| Output doesn't match end frame | `endImage` ignored for `text-to-video` | Use `operation: "image-to-video"` with both `sourceImage` and `endImage` to interpolate frames. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production result handling
- [WAN video generation](./wan) — comparable open-source alternative
- [Veo 3 video generation](./veo3) — Google alternative for commercial-grade video
