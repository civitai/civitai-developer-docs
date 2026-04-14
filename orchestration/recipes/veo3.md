---
title: Veo 3 video generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const veo3T2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'veo3', version: '3.1',
      prompt: 'A lighthouse standing on rocky cliffs at sunset, waves crashing below, cinematic',
      aspectRatio: '16:9', duration: 8,
      generateAudio: true,
    },
  }],
};

const veo3FastBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'veo3', version: '3.1',
      prompt: 'A peaceful forest path in autumn with golden leaves falling',
      aspectRatio: '16:9', duration: 8, mode: 'fast',
      generateAudio: false,
    },
  }],
};

const veo3LiteBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'veo3', version: '3.1',
      prompt: 'A busy coffee shop with people working and chatting',
      aspectRatio: '16:9', duration: 8, mode: 'lite',
      generateAudio: false,
    },
  }],
};

const veo3I2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'veo3', version: '3.1',
      prompt: 'The subject slowly turns and looks into the distance, pensive',
      images: [sampleImage],
      aspectRatio: '16:9', duration: 8, generateAudio: false,
    },
  }],
};

const veo3FlfBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'veo3', version: '3.1',
      prompt: 'A smooth, natural transition between the two scenes',
      images: ['https://example.com/first.jpeg', 'https://example.com/last.jpeg'],
      aspectRatio: '16:9', duration: 8, generateAudio: false,
    },
  }],
};
</script>

# Veo 3 video generation

Google's Veo 3 video generation model, available in two releases (`3.0` and `3.1`) with three speed/cost tiers. The operation (text-to-video, image-to-video, first-last-frame, reference) is inferred from the number of images passed.

| `version` | `mode` | Notes |
|-----------|--------|-------|
| `3.1` | `standard` | Best quality. Default. |
| `3.1` | `fast` | ~40% cheaper, significantly faster. |
| `3.1` | `lite` | ~70% cheaper, fastest. Supports only text-to-video and single image-to-video. |
| `3.0` | `standard` / `fast` | Previous release. Same operations as 3.1 standard/fast; `lite` is 3.1-only. |

**Default choice**: `version: "3.1"`, `mode: "standard"` for maximum quality. Use `mode: "fast"` for iterating; `mode: "lite"` for rapid prototyping or high-volume tasks.

All Veo 3 jobs exceed the [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) — always submit with `wait=0`.

## Text-to-video

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "veo3",
      "version": "3.1",
      "prompt": "A lighthouse standing on rocky cliffs at sunset, waves crashing below, cinematic",
      "aspectRatio": "16:9",
      "duration": 8,
      "generateAudio": true
    }
  }]
}
```

<RecipeRun :body="veo3T2VBody" />

## Fast mode

Significantly faster and ~40% cheaper than standard. Good for iteration:

```json
{
  "engine": "veo3",
  "version": "3.1",
  "prompt": "A peaceful forest path in autumn with golden leaves falling",
  "aspectRatio": "16:9",
  "duration": 8,
  "mode": "fast",
  "generateAudio": false
}
```

<RecipeRun :body="veo3FastBody" />

## Lite mode *(3.1 only)*

Cheapest and fastest tier — roughly 70% cheaper than standard. Supports text-to-video and single image-to-video only:

```json
{
  "engine": "veo3",
  "version": "3.1",
  "prompt": "A busy coffee shop with people working and chatting",
  "aspectRatio": "16:9",
  "duration": 8,
  "mode": "lite",
  "generateAudio": false
}
```

<RecipeRun :body="veo3LiteBody" />

## Image-to-video

Pass one image to animate from that start frame:

```json
{
  "engine": "veo3",
  "version": "3.1",
  "prompt": "The subject slowly turns and looks into the distance",
  "images": ["https://image.civitai.com/.../photo.jpeg"],
  "aspectRatio": "16:9",
  "duration": 8,
  "generateAudio": false
}
```

<RecipeRun :body="veo3I2VBody" />

## First-last-frame interpolation

Pass exactly two images to interpolate between a start and end frame:

```json
{
  "engine": "veo3",
  "version": "3.1",
  "prompt": "A smooth, natural transition between the two scenes",
  "images": [
    "https://example.com/first.jpeg",
    "https://example.com/last.jpeg"
  ],
  "aspectRatio": "16:9",
  "duration": 8,
  "generateAudio": false
}
```

<RecipeRun :body="veo3FlfBody" />

::: warning Placeholder URLs
Replace `https://example.com/` placeholders with publicly fetchable image URLs before submitting.
:::

## Reference-to-video

Pass three or more images to use them as style/subject references:

```json
{
  "engine": "veo3",
  "version": "3.1",
  "prompt": "The character walks through a forest in this art style",
  "images": [
    "https://example.com/ref1.jpeg",
    "https://example.com/ref2.jpeg",
    "https://example.com/ref3.jpeg"
  ],
  "duration": 8
}
```

## Operations — how images count determines operation

| `images[]` length | Operation |
|-------------------|-----------|
| 0 | text-to-video |
| 1 | image-to-video |
| 2 | first-last-frame-to-video |
| 3+ | reference-to-video |

::: warning Lite mode restrictions
`mode: "lite"` only supports text-to-video (0 images) and image-to-video (1 image). Passing 2+ images with `lite` returns a `400`.
:::

## Parameters

| Field | Default | Notes |
|-------|---------|-------|
| `engine` | — ✅ | `"veo3"` |
| `version` | `"3.1"` | `"3.0"` or `"3.1"` |
| `mode` | `"standard"` | `"standard"`, `"fast"`, `"lite"`. `lite` is 3.1-only. |
| `prompt` | — ✅ | Generation prompt. |
| `negativePrompt` | `null` | What to avoid. |
| `aspectRatio` | `"16:9"` | `"16:9"`, `"9:16"`, `"1:1"` |
| `duration` | `8` | `4`, `6`, or `8` seconds. |
| `generateAudio` | `true` | Emit a synchronized audio track. Disable to reduce cost by ~33%. |
| `images[]` | `[]` | 0–3+ images. Count determines operation type. |
| `enablePromptEnhancer` | `true` | LLM expands the prompt before generation. |
| `seed` | random | Integer for reproducibility. |

## Cost

Cost scales with `duration`, audio, and mode.

```
total = baseCost(duration) × audioFactor × modeFactor
```

| Duration | baseCost |
|----------|----------|
| 4 s | 1 667 |
| 6 s | 2 500 |
| 8 s | 3 333 |

| `mode` | modeFactor |
|--------|------------|
| `standard` | × 1.0 |
| `fast` | × 0.6 |
| `lite` | × 0.3 |

| `generateAudio` | audioFactor |
|-----------------|-------------|
| `true` (default) | × 1.0 |
| `false` | × 0.67 |

Example costs at **8 s** (Buzz):

| Mode | With audio | Without audio |
|------|------------|---------------|
| `standard` | **3 333** | **2 233** |
| `fast` | **2 000** | **1 333** |
| `lite` | **1 000** | **667** |

Example costs at **4 s** (Buzz):

| Mode | With audio | Without audio |
|------|------------|---------------|
| `standard` | **1 667** | **1 117** |
| `fast` | **1 000** | **667** |
| `lite` | **500** | **333** |

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

Standard 8 s typically completes in 3–7 minutes. Fast and Lite are faster. Use `wait=0` + polling or webhooks:

- **Webhooks** (recommended): `type: ["workflow:succeeded", "workflow:failed"]` — see [Results & webhooks](/orchestration/guide/results-and-webhooks)
- **Polling**: `GET /v2/consumer/workflows/{workflowId}` every 10–30 s

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "lite mode only supports..." | Passed 2+ images with `mode: "lite"` | Use `standard` or `fast` for first-last-frame and reference-to-video. |
| `400` with "lite mode requires version 3.1" | Used `mode: "lite"` with `version: "3.0"` | Set `version: "3.1"` to use lite mode. |
| `400` with "duration must be one of" | Sent a duration not in `[4, 6, 8]` | Use only 4, 6, or 8 seconds. |
| Output lacks audio | `generateAudio: false` | Set `generateAudio: true` (the default). |
| Step `failed`, `reason = "no_provider_available"` | Google API queue busy | Retry shortly. |
| Step `failed`, `reason = "blocked"` | Google content policy | Don't retry the same input. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production result handling
- [WAN video generation](./wan) — open-source alternative
- [Kling video generation](./kling) — another commercial video model
- [Kling video generation](./kling) — another commercial video model
