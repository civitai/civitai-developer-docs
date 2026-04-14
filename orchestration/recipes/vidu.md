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
      duration: 4, aspectRatio: '16:9', style: 'General',
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
      duration: 4, aspectRatio: '16:9',
    },
  }],
};

const viduAnimeBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'vidu',
      prompt: 'Cherry blossoms falling gently in the breeze, soft anime style',
      duration: 4, aspectRatio: '16:9', style: 'Anime',
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
      duration: 5, resolution: '720p', turbo: true, enableAudio: false,
    },
  }],
};
</script>

# Vidu video generation

Vidu's video-generation models are available in two engines:

| `engine` | Notes |
|----------|-------|
| `vidu` | Vidu 2.0 (`default` / `q1` models). Flat 600 Buzz. Text-to-video, image-to-video, first-last-frame interpolation, anime style. |
| `vidu-q3` | Vidu Q3. Per-second pricing, 4 resolution tiers, turbo mode, native audio, first-last-frame support. |

**Default choice for new integrations**: `engine: "vidu-q3"` for its per-second pricing and output quality. Use `engine: "vidu"` for simple text-to-video or anime-style clips where the flat cost model is predictable.

All Vidu jobs exceed the [100-second timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) — always submit with `wait=0`.

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

Vidu jobs typically take 1–4 minutes depending on duration and resolution. Use `wait=0` + polling or webhooks:

- **Webhooks** (recommended): `type: ["workflow:succeeded", "workflow:failed"]` — see [Results & webhooks](/orchestration/guide/results-and-webhooks)
- **Polling**: `GET /v2/consumer/workflows/{workflowId}` every 10–30 s

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "images maxItems" | More than 2 images on `vidu-q3` | Trim to at most 2 (start + end frame). |
| `400` with "duration must be one of" | Sent `2` or `6` for `vidu` | `vidu` accepts only `4` or `8`. |
| No audio in output | `enableAudio: false` on `vidu-q3` | Set `enableAudio: true` (the default). |
| Step `failed`, `reason = "no_provider_available"` | No Vidu worker available | Retry shortly. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production result handling
- [WAN video generation](./wan) — comparable alternative
- [Kling video generation](./kling) — another commercial video model
