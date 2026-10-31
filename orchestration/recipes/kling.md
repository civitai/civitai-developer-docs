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
const klingV4 = (input) => ({ steps: [{ $type: 'videoGen', input: { engine: 'kling-v4', resolution: '720p', duration: 3, ...input } }] });
const klingV4Text = klingV4({ operation: 'text-to-video', prompt: 'A small blue ceramic robot waves on a sunny wooden desk', aspectRatio: '16:9' });
const klingV4Image = klingV4({ operation: 'image-to-video', prompt: 'A gentle breeze moves the branches, fixed camera', sourceImage: 'https://v3b.fal.media/files/b/rabbit/NaslJIC7F2WodS6DFZRRJ.png' });
const klingV4Reference = klingV4({ operation: 'reference-to-video', prompt: 'A slow camera push toward the tree in @Image1', images: ['https://v3b.fal.media/files/b/rabbit/NaslJIC7F2WodS6DFZRRJ.png'] });
const klingV4Edit = klingV4({ operation: 'video-to-video-edit', prompt: 'Change the scene to golden sunset lighting', videoUrl: 'https://v3b.fal.media/files/b/0aac4497/-fHk6MiMZhLy2FncCbyM7_clip_reference.mp4' });
</script>

# Kling video generation

Kuaishou's Kling model family, available through the `videoGen` step:

| `engine` | Models | Notes |
|----------|--------|-------|
| `kling` | `v1`, `v1.5`, `v1.6`, `v2`, `v2.5-turbo` | Original Kling. Text-to-video and image-to-video. |
| `kling-v4` | Kling 4.0 via FAL | Four operations, 720p/1080p, 3–30 seconds, keyframes and references. |
| `kling-v3` | *(version-agnostic)* | Kling V3. Five operations including video-to-video and reference-to-video. Duration in seconds (3–15). |

For Kling 4, use `engine: "kling-v4"`. Choose the operation and resolution explicitly; `mode` belongs to earlier engines.

Kling jobs run for minutes, longer than [your HTTP client's timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) — always submit with `wait=0` and handle results via webhooks or polling.

## Kling 4 (`engine: "kling-v4"`)

### Operations

| `operation` | Required input | Optional controls |
|---|---|---|
| `text-to-video` | `prompt` or `multiPrompt` | `aspectRatio` |
| `image-to-video` | `sourceImage`, plus `prompt` or `multiPrompt` | `endImage`, up to 8 ordered `middleImages` |
| `reference-to-video` | `prompt` or `multiPrompt` | `images`, `videos`, `elements`, `voiceIds`, keyframes, `aspectRatio` |
| `video-to-video-edit` | `videoUrl`, `prompt` | `images`, `videos`, `elements`, `voiceIds` |

All operations accept `resolution: "720p" | "1080p"` (default `1080p`). `duration` is an integer from 3 to 30 seconds. Omit it for 5-second generation or to retain the source length in an edit. Images and edits take their canvas from the input. Text/reference generation accepts `16:9`, `9:16`, `1:1` or `21:9`; reference generation also accepts `auto`.

Prompts have a 26,000-character limit. For multi-shot generation, supply `multiPrompt: [{ prompt, duration }, ...]`. Each shot needs a 1–512 character prompt and 1–30 seconds; the sum must be 3–30 seconds and overrides `duration`. The orchestration contract still requires `prompt`; set it to `""` for shots only. Edits accept a single prompt.

### Try the four operations

These examples request 3 seconds at 720p. The edit example also bills the source video's duration.

**Text to video**

<RecipeRun :body="klingV4Text" />

**Image to video**

<RecipeRun :body="klingV4Image" />

**Reference to video**

<RecipeRun :body="klingV4Reference" />

**Video editing**

<RecipeRun :body="klingV4Edit" />

For example, a reference request inside a `videoGen` step is:

```json
{
  "engine": "kling-v4",
  "operation": "reference-to-video",
  "prompt": "A slow camera push toward the tree in @Image1",
  "images": ["https://v3b.fal.media/files/b/rabbit/NaslJIC7F2WodS6DFZRRJ.png"],
  "resolution": "720p",
  "duration": 3,
  "aspectRatio": "16:9"
}
```

### References and elements

- `images`: up to 10 images, counting `sourceImage`, `endImage` and `middleImages` toward the same limit. Reference them as `@Image1`, `@Image2`, etc.
- `videos`: up to 5 public HTTP(S) videos for reference generation, or 4 extra videos for edits. The edit source is `@Video1`; extra edit references start at `@Video2`.
- `elements`: up to 7 characters/objects, referenced as `@Element1`, etc. Supply `frontalImage` plus 1–3 `referenceImages`, or a `videoUrl` of 3–8 seconds. Up to 3 elements may use video. An element may also bind a `voiceId`.
- `voiceIds`: existing Kling voice IDs, referenced as `@Voice1`, etc. At most 3 voices including those bound to elements. Voice creation is a separate FAL API.
- At most 15 references combined, including keyframes, source video, elements and standalone voices.
- Source and reference videos must be 3–30 seconds each; source, reference and element videos together must stay within 30 seconds. Videos require 24–60 fps, 700–4553 pixels per side, aspect ratio 0.4–2.5, and at most 300 MB.
- Images accept URLs, data URLs or Base64. They must be at least 300×300 with aspect ratio 0.4–2.5. The worker resizes images before sending them to FAL.

### Pricing

| Input | 720p USD/second | 1080p USD/second | Billed seconds |
|---|---:|---:|---|
| Text, images, or references without videos | $0.157 | $0.235 | Output duration |
| References with videos/video elements, or edits | $0.094 | $0.141 | `max(input seconds + output seconds, 2 × output seconds)` |

Orchestration converts USD to Buzz at 1,300 Buzz/USD, before normal workflow surcharges. A 3-second 720p text/image generation is estimated at **613 Buzz**. An edit of a 12-second source into 3 seconds is estimated at **1,833 Buzz** at 720p. Quotes use measured input durations; the final charge uses FAL's reported billable usage. Use `whatif=true` to preview a request.

FAL references: [text](https://fal.ai/models/kling/v4/text-to-video/api), [image](https://fal.ai/models/kling/v4/image-to-video/api), [reference](https://fal.ai/models/kling/v4/reference-to-video/api), [edit](https://fal.ai/models/kling/v4/video-to-video/edit/api).

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

Standard `videoGen` output: a single `video` blob ([shape and URL expiry](/orchestration/recipes/#reading-results)).

## Long-running jobs

Kling V3 Standard at 5 s typically completes in 2–5 minutes; Professional and longer durations take longer. Submit with `wait=0`, then prefer a [webhook](/orchestration/guide/results-and-webhooks) (`workflow:succeeded` / `workflow:failed`) or poll `GET /v2/consumer/workflows/{workflowId}` on a 10 s → 30 s → 60 s cadence.

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

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production result handling
- [WAN video generation](./wan) — comparable open-source alternative
- [Veo 3 video generation](./veo3) — Google alternative for commercial-grade video
