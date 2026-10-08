---
title: Vidu video generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const viduT2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'vidu',
      prompt: 'A cat sitting on a windowsill watching rain fall outside',
      duration: 4, aspectRatio: '16:9', style: 'General', movementAmplitude: 'auto',
    },
  }],
};

const viduI2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'vidu',
      prompt: 'The subject looks up and smiles warmly at the camera',
      images: [sampleImage],
      duration: 4, aspectRatio: '16:9', movementAmplitude: 'auto',
    },
  }],
};

const viduAnimeBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'vidu',
      prompt: 'Cherry blossoms falling gently in the breeze, soft anime style',
      duration: 4, aspectRatio: '16:9', style: 'Anime', movementAmplitude: 'auto',
    },
  }],
};

const viduQ3T2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'vidu-q3',
      prompt: 'An eagle soaring over snow-capped mountain peaks at golden hour',
      duration: 5, resolution: '720p', aspectRatio: '16:9',
    },
  }],
};

const viduQ3TurboBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'vidu-q3',
      prompt: 'A city street at night with neon lights reflecting in puddles',
      duration: 5, resolution: '720p', aspectRatio: '16:9', turbo: true, enableAudio: false,
    },
  }],
};

const viduQ4ImageBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'vidu-q4', operation: 'imageToVideo',
      prompt: 'The subject moves gently as the camera slowly pushes in',
      image: sampleImage, duration: 5, resolution: '720p',
    },
  }],
};

const viduQ4ReferenceBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'vidu-q4', operation: 'referenceToVideo',
      prompt: '[@reference_image_1] in a sunlit room, slow camera movement',
      referenceImages: [sampleImage], duration: 5, resolution: '720p',
      aspectRatio: '16:9', enableAudio: false,
    },
  }],
};
</script>

# Vidu video generation

Vidu's video-generation models are available in three engines:

| `engine` | Notes |
|----------|-------|
| `vidu` | Vidu 2.0 (`default` / `q1` models). Flat 600 Buzz. Text-to-video, image-to-video, first-last-frame interpolation, anime style. |
| `vidu-q3` | Vidu Q3. Per-second pricing, 4 resolution tiers, turbo mode, native audio, first-last-frame support. |
| `vidu-q4` | Vidu Q4 through FAL. Image-to-video and reference-to-video, 3–16 seconds, up to 4K, image and voice references. |

Use `engine: "vidu-q4"` for Q4 image animation and reference-based scenes. Q3 remains available for text-to-video, turbo, and first-last-frame generation.

Submit with `wait=0` and poll for completion because video generation can exceed the [100-second timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline).

## Vidu (`engine: "vidu"`)

### Text-to-video

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "vidu",
      "prompt": "A cat sitting on a windowsill watching rain fall outside",
      "duration": 4,
      "aspectRatio": "16:9",
      "style": "General"
    }
  }]
}
```

<RecipeRun :body="viduT2VBody" />

### Image-to-video

Pass one image in `images[]` to animate it. The first image is the start frame; the second (optional) is the end frame:

```json
{
  "engine": "vidu",
  "prompt": "The subject looks up and smiles warmly",
  "images": ["https://image.civitai.com/.../photo.jpeg"],
  "duration": 4,
  "aspectRatio": "16:9"
}
```

<RecipeRun :body="viduI2VBody" />

### First-last-frame interpolation

Pass two images to interpolate between a start and end frame:

```json
{
  "engine": "vidu",
  "prompt": "Smooth transition from morning to evening",
  "images": [
    "https://example.com/start.jpeg",
    "https://example.com/end.jpeg"
  ],
  "duration": 4
}
```

### Anime style

```json
{
  "engine": "vidu",
  "prompt": "Cherry blossoms falling gently in the breeze",
  "duration": 4,
  "style": "Anime"
}
```

<RecipeRun :body="viduAnimeBody" />

### Parameters

| Field | Default | Notes |
|-------|---------|-------|
| `engine` | — ✅ | `"vidu"` |
| `prompt` | — ✅ | Generation prompt. |
| `model` | `"default"` | `"default"`, `"q1"`. `"q3"` is the separate `vidu-q3` engine. |
| `duration` | `4` | `4` or `8` seconds. |
| `aspectRatio` | `null` | `"16:9"`, `"9:16"`, `"1:1"`. Inferred from image if omitted. |
| `style` | `"General"` | `"General"` or `"Anime"`. |
| `images[]` | `[]` | Up to 2 images (start frame / end frame). |
| `movementAmplitude` | `null` | `"auto"`, `"small"`, `"medium"`, `"large"`. |
| `enableBackgroundMusic` | `false` | Add background music to the output. |
| `enablePromptEnhancer` | `true` | LLM expands the prompt before generation. |

### Cost

Flat **600 Buzz** per clip, regardless of duration, style, or model.

---

## Vidu Q3 (`engine: "vidu-q3"`)

Vidu Q3 offers finer resolution control, a turbo speed tier, native audio generation, and per-second pricing.

### Text-to-video

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "vidu-q3",
      "prompt": "An eagle soaring over snow-capped mountain peaks at golden hour",
      "duration": 5,
      "resolution": "720p",
      "aspectRatio": "16:9"
    }
  }]
}
```

<RecipeRun :body="viduQ3T2VBody" />

### Turbo mode

Turbo roughly halves cost and runtime with modest quality reduction:

```json
{
  "engine": "vidu-q3",
  "prompt": "A city street at night with neon lights",
  "duration": 5,
  "resolution": "720p",
  "turbo": true,
  "enableAudio": false
}
```

<RecipeRun :body="viduQ3TurboBody" />

### First-last-frame interpolation

Pass up to 2 images — the first is the start frame, the second is the end frame:

```json
{
  "engine": "vidu-q3",
  "prompt": "Smooth transition from a rainy day to sunshine",
  "images": [
    "https://example.com/rainy.jpeg",
    "https://example.com/sunny.jpeg"
  ],
  "duration": 5,
  "resolution": "720p"
}
```

::: warning Two-image maximum
Vidu Q3 accepts at most 2 images (start + end frame). Sending more returns a `400`.
:::

### Parameters

| Field | Default | Notes |
|-------|---------|-------|
| `engine` | — ✅ | `"vidu-q3"` |
| `prompt` | — ✅ | Generation prompt. |
| `duration` | `5` | 1–16 seconds. |
| `resolution` | `"720p"` | `"360p"`, `"540p"`, `"720p"`, `"1080p"` |
| `turbo` | `false` | Faster, cheaper generation with modest quality trade-off. |
| `enableAudio` | `true` | Generate synchronized audio in the output. |
| `aspectRatio` | `null` | `"16:9"`, `"9:16"`, `"1:1"`, `"4:3"`, `"3:4"`. Inferred from images if omitted. |
| `images[]` | `[]` | 0–2 images (start + optional end frame). |

### Cost

Per-second pricing. `total = costPerSecond × duration`.

| Turbo | Resolution | Buzz/s | Example — 5 s |
|-------|------------|--------|---------------|
| No | `360p` / `540p` | 91 | **455** |
| No | `720p` / `1080p` | 200 | **1 000** |
| Yes | `360p` / `540p` | 46 | **230** |
| Yes | `720p` / `1080p` | 100 | **500** |

---

## Vidu Q4 (`engine: "vidu-q4"`)

Select the operation explicitly. One reference image can be used with either operation: `imageToVideo` animates it as frame one; `referenceToVideo` uses it to guide a new scene.

### Image-to-video

```json
{
  "engine": "vidu-q4",
  "operation": "imageToVideo",
  "prompt": "The subject moves gently as the camera slowly pushes in",
  "image": "https://example.com/start.png",
  "duration": 5,
  "resolution": "720p"
}
```

::: warning
Replace `https://example.com/start.png` with your starting image URL.
:::

PNG, JPEG and WebP are supported. Send `prompt: ""` for animation without text instructions. Q4 image-to-video generates audio and takes its aspect ratio from the starting image; it has no ending-frame or audio-toggle parameter.

<RecipeRun :body="viduQ4ImageBody" />

### Reference-to-video

```json
{
  "engine": "vidu-q4",
  "operation": "referenceToVideo",
  "prompt": "[@reference_image_1] holds [@reference_image_2] and speaks in the voice of [reference_audio_1]",
  "referenceImages": ["https://example.com/person.png", "https://example.com/product.png"],
  "referenceAudios": ["https://example.com/voice.mp3"],
  "duration": 5,
  "resolution": "720p",
  "aspectRatio": "16:9",
  "enableAudio": true
}
```

::: warning
Replace the `https://example.com/...` URLs with your reference image and audio URLs.
:::

Prompt tags use the references' positions, starting at 1. Image tags include `@`; audio tags do not. Audio clips must be MP3, each 3–12 seconds and at most 50 MB. Reference audio accepts HTTP(S) URLs or base64 `audio/mpeg` data URIs. Set `enableAudio: true` to produce dialogue or sound effects.

<RecipeRun :body="viduQ4ReferenceBody" />

### Parameters

| Field | Default | Notes |
|-------|---------|-------|
| `operation` | `imageToVideo` | `imageToVideo` or `referenceToVideo`. |
| `prompt` | Required | At most 5,000 characters; may be empty for image-to-video. |
| `duration` | `5` | Integer seconds, 3–16. |
| `resolution` | `720p` | `540p`, `720p`, `1080p`, `2K`, `4K`; case-sensitive. |
| `seed` | Random | Integer from 0 to 2,147,483,647. |
| `image` | Required for image-to-video | One starting image. |
| `referenceImages` | `[]` | Reference-to-video only; up to 12 images, each at most 50 MB. |
| `referenceAudios` | `[]` | Reference-to-video only; up to 3 voice clips. |
| `aspectRatio` | `16:9` | Reference-to-video only: `16:9`, `9:16`, `4:3`, `3:4`, `1:1`. |
| `enableAudio` | `false` | Reference-to-video only. Does not change the price. |

Resolution tiers are nominal: FAL returned 960×528 in a `540p`, `16:9` reference-video test. The workflow preserves the provider's actual dimensions.

### Cost

Both operations use the same rates: `Buzz = seconds × Buzz/s`, before any workflow-level adjustments. These use FAL's regular USD rates with the existing 30% markup, excluding its temporary 30% provider discount through November 30, 2026.

| Resolution | Provider USD/s (regular) | Buzz/s | 5-second quote |
|------------|-------------------------|--------|-------------------|
| `540p` | $0.045 | 58.5 | 293 |
| `720p` | $0.095 | 123.5 | 618 |
| `1080p` | $0.12 | 156 | 780 |
| `2K` | $0.19 | 247 | 1,235 |
| `4K` | $0.39 | 507 | 2,535 |

The quote rounds up to whole Buzz. Use a workflow cost preview for the final charge. See [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) and [FAL's Q4 pricing](https://fal.ai/models/fal-ai/vidu/q4/reference-to-video).

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

Completion time depends on provider load, duration and resolution. Use `wait=0` with polling or webhooks:

- **Webhooks** (recommended): `type: ["workflow:succeeded", "workflow:failed"]` — see [Results & webhooks](/orchestration/guide/results-and-webhooks)
- **Polling**: `GET /v2/consumer/workflows/{workflowId}` every 10–30 s

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "images maxItems" | More than 2 images on `vidu-q3` | Trim to at most 2 (start + end frame). |
| `400` with "duration must be one of" | Sent `2` or `6` for `vidu` | `vidu` accepts only `4` or `8`. |
| No audio in output | `enableAudio: false` on `vidu-q3` | Set `enableAudio: true` (the default). |
| Silent Q4 reference video | `enableAudio` was omitted or `false` | Set `enableAudio: true`. |
| Q4 reference audio rejected | Unsupported format or duration | Use MP3 clips of 3–12 seconds, at most 50 MB each. |
| Step `failed`, `reason = "no_provider_available"` | No Vidu worker available | Retry shortly. |

## Related

- Public input schemas: `ViduQ4ImageToVideoInput` and `ViduQ4ReferenceToVideoInput`.
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production result handling
- [WAN video generation](./wan) — comparable alternative
- [Kling video generation](./kling) — another commercial video model
