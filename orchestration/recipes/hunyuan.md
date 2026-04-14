---
title: HunyuanVideo generation
---

<script setup>
const hunyuanT2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'hunyuan',
      prompt: 'A majestic waterfall cascading down mossy rocks in a lush rainforest, slow motion',
      width: 854, height: 480,
      duration: 5, fps: 24, steps: 40,
    },
  }],
};

const hunyuanLoraBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'hunyuan',
      prompt: 'A character from the LoRA walking through a neon-lit city at night',
      width: 854, height: 480,
      duration: 5, fps: 24, steps: 40,
      loras: [{ air: 'urn:air:hyv1:lora:civitai:123456@789012', strength: 0.8 }],
    },
  }],
};
</script>

# HunyuanVideo generation

Tencent's HunyuanVideo open model, running on Civitai's Comfy workers. Text-to-video with LoRA support for custom subjects, styles, and motions.

```json
{
  "$type": "videoGen",
  "input": {
    "engine": "hunyuan",
    "prompt": "...",
    "width": 854,
    "height": 480,
    "duration": 5
  }
}
```

HunyuanVideo is compute-intensive — always submit with `wait=0`.

## Text-to-video

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "hunyuan",
      "prompt": "A majestic waterfall cascading down mossy rocks in a lush rainforest, slow motion",
      "width": 854,
      "height": 480,
      "duration": 5,
      "fps": 24,
      "steps": 40
    }
  }]
}
```

<RecipeRun :body="hunyuanT2VBody" />

## With LoRAs

Attach community LoRAs to bias subject, style, or motion. Format: `{ "air": "<AIR URN>", "strength": 0.0–1.0 }`:

```json
{
  "engine": "hunyuan",
  "prompt": "A character from the LoRA walking through a neon-lit city at night",
  "width": 854,
  "height": 480,
  "duration": 5,
  "fps": 24,
  "steps": 40,
  "loras": [
    { "air": "urn:air:hyv1:lora:civitai:123456@789012", "strength": 0.8 }
  ]
}
```

<RecipeRun :body="hunyuanLoraBody" />

## Using a custom model checkpoint

The default model is the base HunyuanVideo checkpoint. Override with any Civitai-hosted HunyuanVideo checkpoint using its AIR URN:

```json
{
  "engine": "hunyuan",
  "model": "urn:air:hyv1:checkpoint:civitai:<modelId>@<versionId>",
  "prompt": "...",
  "width": 854,
  "height": 480,
  "duration": 5
}
```

## Parameters

| Field | Default | Notes |
|-------|---------|-------|
| `engine` | — ✅ | `"hunyuan"` |
| `prompt` | — ✅ | Generation prompt. |
| `model` | *(base HunyuanVideo)* | AIR URN for an alternative checkpoint. |
| `width` | `480` | Output width in pixels. Larger → slower and more expensive. |
| `height` | `480` | Output height in pixels. |
| `duration` | `5` | 1–30 seconds. |
| `fps` | `25` | Frame rate. Common values: `24`, `25`, `30`. |
| `steps` | `40` | 10–50 diffusion steps. More steps = higher quality, longer runtime. |
| `cfgScale` | `4` | 0–100. Guidance scale — lower is more creative. |
| `loras[]` | `[]` | Array of `{ air, strength }` LoRA attachments. |
| `seed` | random | Integer for reproducibility. |

## Recommended resolutions

| Use case | `width` | `height` | Notes |
|----------|---------|----------|-------|
| Fast / prototype | `480` | `480` | Square, minimal cost. |
| Landscape 480p | `854` | `480` | 16:9, good balance. |
| Portrait 480p | `480` | `854` | 9:16 for mobile. |
| Landscape 720p | `1280` | `720` | High quality; significantly slower. |

::: tip Resolution and cost
Cost scales approximately with pixel count × duration × steps. Doubling the resolution (~4× pixel area) increases cost roughly 4×. Use `whatif=true` to preview exact cost before committing.
:::

## Cost

HunyuanVideo cost depends on `width × height × duration × fps × steps`. The formula uses GPU-second estimation with a 5× markup, rounded to the nearest 25 Buzz (minimum 100 Buzz).

Use `whatif=true` to get an exact preview:

```bash
curl -s "https://orchestration.civitai.com/v2/consumer/workflows?whatif=true" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"steps":[{"$type":"videoGen","input":{"engine":"hunyuan","prompt":"...","width":854,"height":480,"duration":5,"steps":40}}]}'
```

Approximate ranges (854×480, 24 fps):

| Duration | Steps | Approx. Buzz |
|----------|-------|--------------|
| 3 s | 20 | ~200–400 |
| 5 s | 40 | ~500–1 000 |
| 10 s | 40 | ~1 000–2 000 |

Actual cost varies with GPU load and model.

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

HunyuanVideo is compute-heavy. Expect 5–30 minutes depending on resolution, duration, and steps. Use `wait=0` + polling or webhooks:

- **Webhooks** (recommended): `type: ["workflow:succeeded", "workflow:failed"]` — see [Results & webhooks](/orchestration/guide/results-and-webhooks)
- **Polling**: `GET /v2/consumer/workflows/{workflowId}` every 30–60 s

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "steps out of range" | Value outside 10–50 | Clamp to 10–50. |
| `400` with "duration out of range" | Value outside 1–30 | Clamp to 1–30. |
| Very long queue wait | Large resolution / many steps | Reduce `width`/`height` or `steps` for iteration; scale up for final renders. |
| Step `failed`, `reason = "no_provider_available"` | No Comfy worker with HunyuanVideo warm | Retry shortly. |
| Output looks blurry at high resolution | Too few steps | Increase `steps` to 40–50 for larger resolutions. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production result handling
- [LTX2 video generation](./ltx2) — another Comfy-based open video model, generally faster
- [WAN video generation](./wan) — another Comfy/FAL open video model with broad operation support
