---
title: Grok video generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const grokT2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'grok', operation: 'text-to-video',
      prompt: 'A red fox trotting through a snowy forest at dusk',
      aspectRatio: '16:9', duration: 6, resolution: '720p',
    },
  }],
};

const grokI2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'grok', operation: 'image-to-video',
      prompt: 'The subject slowly turns their head and looks toward the horizon',
      images: [sampleImage],
      duration: 6, resolution: '720p',
    },
  }],
};

const grokPortraitBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'grok', operation: 'text-to-video',
      prompt: 'A person speaking passionately on stage, dynamic lighting',
      aspectRatio: '9:16', duration: 6, resolution: '720p',
    },
  }],
};
</script>

# Grok video generation

xAI's Grok video model (Grok-Imagine-Video) via FAL, available through the `videoGen` step with `engine: "grok"`.

::: tip Grok image vs Grok video
The `grok` engine here is for **video generation**. For Grok image generation, see the separate [`imageGen` Grok recipe](./grok).
:::

Three operations: `text-to-video`, `image-to-video`, and `edit-video`. Two resolutions: 480p and 720p (default). Seven aspect ratios for text-to-video.

All Grok video jobs typically run 1–4 minutes — submit with `wait=0`.

## Text-to-video

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "grok",
      "operation": "text-to-video",
      "prompt": "A red fox trotting through a snowy forest at dusk",
      "aspectRatio": "16:9",
      "duration": 6,
      "resolution": "720p"
    }
  }]
}
```

<RecipeRun :body="grokT2VBody" />

## Image-to-video

Pass exactly one image in `images[]` to animate from it. Aspect ratio is inferred from the source image when `aspectRatio: "auto"`:

```json
{
  "engine": "grok",
  "operation": "image-to-video",
  "prompt": "The subject slowly turns their head and looks toward the horizon",
  "images": ["https://image.civitai.com/.../photo.jpeg"],
  "duration": 6,
  "resolution": "720p",
  "aspectRatio": "auto"
}
```

<RecipeRun :body="grokI2VBody" />

## Portrait video

Text-to-video accepts a wide aspect ratio set — use `9:16` for mobile-first content:

```json
{
  "engine": "grok",
  "operation": "text-to-video",
  "prompt": "A person speaking passionately on stage, dynamic lighting",
  "aspectRatio": "9:16",
  "duration": 6,
  "resolution": "720p"
}
```

<RecipeRun :body="grokPortraitBody" />

## Video editing

Edit an existing video guided by a prompt. The input video is automatically resized to 854×480 and truncated to 8 seconds:

```json
{
  "engine": "grok",
  "operation": "edit-video",
  "prompt": "Transform the scene into a vintage sepia-toned film",
  "videoUrl": "https://example.com/input.mp4",
  "duration": 6,
  "resolution": "720p"
}
```

::: warning Edit-video is capped at 8 s
Grok truncates source videos to 8 seconds. Longer inputs are trimmed automatically. Cost is based on the analyzed duration, not the requested `duration` field.
:::

## Parameters

### Text-to-video

| Field | Default | Notes |
|-------|---------|-------|
| `engine` | — ✅ | `"grok"` |
| `operation` | `"text-to-video"` | `"text-to-video"` |
| `prompt` | — ✅ | Generation prompt. |
| `duration` | `6` | 1–15 seconds. |
| `resolution` | `"720p"` | `"480p"` or `"720p"` |
| `aspectRatio` | `"16:9"` | `"16:9"`, `"4:3"`, `"3:2"`, `"1:1"`, `"2:3"`, `"3:4"`, `"9:16"` |

### Image-to-video

Same as text-to-video plus:

| Field | Default | Notes |
|-------|---------|-------|
| `operation` | — ✅ | `"image-to-video"` |
| `images[]` | — ✅ | Exactly 1 image (URL, data URL, or Base64). |
| `aspectRatio` | `"auto"` | `"auto"` infers ratio from the source image. Explicit ratios also accepted. |

### Edit-video

| Field | Default | Notes |
|-------|---------|-------|
| `operation` | — ✅ | `"edit-video"` |
| `videoUrl` | — ✅ | Source video URL. Resized to 854×480, capped at 8 s. |
| `duration` | `6` | Informational for the request; actual duration determined by the source video length (up to 8 s). |
| `resolution` | `"720p"` | `"480p"` or `"720p"` |

## Cost

Per-second pricing; `total = costPerSecond × duration`.

| Operation | Resolution | Buzz/s | Example — 6 s |
|-----------|------------|--------|---------------|
| `text-to-video` / `image-to-video` | `480p` | 65 | **390** |
| `text-to-video` / `image-to-video` | `720p` | 91 | **546** |
| `edit-video` | `480p` | 78 | **468** |
| `edit-video` | `720p` | 104 | **624** |

For `edit-video`, cost uses the **analyzed source video duration** (capped at 8 s), not the `duration` field in the request.

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

Grok video typically completes in 1–4 minutes. Use `wait=0` + polling or webhooks:

- **Webhooks** (recommended): `type: ["workflow:succeeded", "workflow:failed"]` — see [Results & webhooks](/orchestration/guide/results-and-webhooks)
- **Polling**: `GET /v2/consumer/workflows/{workflowId}` every 10–30 s

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "images must have exactly 1 item" | Sent 0 or 2+ images to `image-to-video` | Image-to-video requires exactly 1 source image. |
| `400` with "videoUrl is required" | Missing `videoUrl` on `edit-video` | Provide the source video URL. |
| `400` with "aspectRatio must be one of" on image-to-video | Sent an unsupported ratio | Image-to-video additionally accepts `"auto"` but has the same seven explicit ratios as t2v. |
| Cost higher than expected on edit-video | Source video longer than requested duration | Input is truncated to 8 s; cost is based on the actual analyzed length. |
| Step `failed`, `reason = "no_provider_available"` | No Grok worker available | Retry shortly. |
| Step `failed`, `reason = "blocked"` | xAI content policy | Don't retry the same input. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production result handling
- [Grok image generation](./grok) — Grok for images
- [Kling video generation](./kling) — comparable commercial video model
- [Veo 3 video generation](./veo3) — Google's video model
