---
title: Gemini Omni video generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';
const sampleEndImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/e4a8f395-8166-44a8-82b1-bb0901c10aa3/original=true,quality=90,optimized=true/19325406.jpeg';

const omniT2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'gemini-omni', model: '1.1-flash',
      prompt: 'A red marble rolling down a wooden spiral track, close-up, soft daylight, continuous smooth shot',
      aspectRatio: '16:9', resolution: '720p',
    },
  }],
};

const omniDraftBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'gemini-omni',
      prompt: 'A lighthouse standing on rocky cliffs at sunset, waves crashing below, cinematic',
      aspectRatio: '9:16', resolution: '360p',
    },
  }],
};

const omniI2VBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'gemini-omni',
      prompt: 'The subject slowly turns and looks into the distance, pensive',
      images: [sampleImage],
      resolution: '720p',
    },
  }],
};

const omniFlfBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'gemini-omni',
      prompt: 'A smooth, natural cinematic transition between the two scenes',
      images: [sampleImage, sampleEndImage],
      resolution: '720p',
    },
  }],
};

const omniRefBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'gemini-omni',
      prompt: 'The character from <IMAGE_REF_0> walks through the setting of <IMAGE_REF_1>, then waves at the camera',
      images: [sampleImage, sampleEndImage, sampleImage],
      resolution: '720p',
    },
  }],
};
</script>

# Gemini Omni video generation

Google's Gemini Omni 1.1 Flash is a fast multimodal video model: text and up to six reference images in, a 3–10 second MP4 with a synchronized audio track out, at 360p, 720p, 1080p or 4K. The operation (text-to-video, image-to-video, first-last-frame, reference) is inferred from the number of images passed, exactly like [Veo 3](./veo3).

| `model` | Also known as | Notes |
|---------|---------------|-------|
| `1.1-flash` | Gemini Omni 1.1 Flash | **Default** and only variant today. |

Two things set it apart from Veo 3:

- **You don't pick a duration.** The model chooses 3–10 s to fit the prompt. Because of that, the step is **billed on the seconds actually delivered** — see [Cost](#cost).
- **It's fast.** A 360p clip typically returns in well under a minute; 720p in one to two.

Jobs can exceed the [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) — submit with `wait=0` (or a short `wait`) and poll or use webhooks.

## Text-to-video

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "gemini-omni",
      "model": "1.1-flash",
      "prompt": "A red marble rolling down a wooden spiral track, close-up, soft daylight, continuous smooth shot",
      "aspectRatio": "16:9",
      "resolution": "720p"
    }
  }]
}
```

<RecipeRun :body="omniT2VBody" />

## Draft at 360p

Roughly a third of the 720p price and the fastest turnaround. Iterate on the prompt here, then re-run the keeper at 720p or above:

```json
{
  "engine": "gemini-omni",
  "prompt": "A lighthouse standing on rocky cliffs at sunset, waves crashing below, cinematic",
  "aspectRatio": "9:16",
  "resolution": "360p"
}
```

<RecipeRun :body="omniDraftBody" />

## Image-to-video

One image animates that image:

```json
{
  "engine": "gemini-omni",
  "prompt": "The subject slowly turns and looks into the distance, pensive",
  "images": ["https://.../start.jpeg"],
  "resolution": "720p"
}
```

<RecipeRun :body="omniI2VBody" />

## First-last-frame interpolation

Two images are treated as the first and last frame:

```json
{
  "engine": "gemini-omni",
  "prompt": "A smooth, natural cinematic transition between the two scenes",
  "images": ["https://.../start.jpeg", "https://.../end.jpeg"],
  "resolution": "720p"
}
```

<RecipeRun :body="omniFlfBody" />

## Reference-to-video

Three to six images are references for characters, objects or style. Refer to them in the prompt as `<IMAGE_REF_0>`, `<IMAGE_REF_1>`, … in the order you passed them:

```json
{
  "engine": "gemini-omni",
  "prompt": "The character from <IMAGE_REF_0> walks through the setting of <IMAGE_REF_1>, then waves at the camera",
  "images": ["https://.../character.jpeg", "https://.../setting.jpeg", "https://.../style.jpeg"],
  "resolution": "720p"
}
```

<RecipeRun :body="omniRefBody" />

## Operations — how images count determines operation

| `images[]` length | Operation |
|-------------------|-----------|
| 0 | text-to-video |
| 1 | image-to-video |
| 2 | first-last-frame-to-video |
| 3–6 | reference-to-video |

More than six images returns a `400`.

## Parameters

| Field | Default | Notes |
|-------|---------|-------|
| `engine` | — ✅ | `"gemini-omni"` |
| `model` | `"1.1-flash"` | Only `"1.1-flash"` today. |
| `prompt` | — ✅ | Generation prompt. Put negatives in the prompt — there is no `negativePrompt`. |
| `aspectRatio` | `"16:9"` | `"16:9"` or `"9:16"`. |
| `resolution` | `"720p"` | `"360p"`, `"720p"`, `"1080p"`, `"4k"`. 1080p and 4K are upscaled from 720p. |
| `images[]` | `[]` | 0–6 images. Count determines operation type. |

Not supported by the model, so not exposed: `duration`, `seed`, `negativePrompt`, `generateAudio` (audio is always generated), `enablePromptEnhancer`.

## Cost

Omni is priced **per delivered second**, by resolution:

| `resolution` | Buzz / second | Reserved at submit (10 s cap) |
|--------------|---------------|-------------------------------|
| `360p` | 85 | **850** |
| `720p` | 250 | **2 500** |
| `1080p` | 300 | **3 000** |
| `4k` | 400 | **4 000** |

Because the model decides the length, the exact charge isn't known up front:

1. **Submit** — the 10-second cap for your resolution is reserved. A `whatif=true` request reports this cap as the estimate, and a real submit is rejected with `400` (`requiredBuzz` / `availableBuzz` in the body) if your balance can't cover it.
2. **Complete** — the step's `cost` is settled to `ceil(seconds × rate)` for the clip that came back and the difference is refunded automatically. A 6.4 s clip at 720p costs 1 600 Buzz, not 2 500.
3. **Fail or cancel** before any video was produced — the full reservation is refunded.

## Reading the result

```json
{
  "status": "succeeded",
  "cost": { "base": 1600, "total": 1600 },
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

360p usually completes in under a minute; 720p in one to two; 4K can take several. Use `wait=0` + polling or webhooks:

- **Webhooks** (recommended): `type: ["workflow:succeeded", "workflow:failed"]` — see [Results & webhooks](/orchestration/guide/results-and-webhooks)
- **Polling**: `GET /v2/consumer/workflows/{workflowId}` every 10–30 s

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with `requiredBuzz` / `availableBuzz` | Balance below the 10 s cap for the chosen resolution | Top up, or drop to `360p` for drafts. |
| `400` "must be one of 16:9, 9:16" | Unsupported aspect ratio | Omni is landscape or portrait only; no `1:1`. |
| `400` on `images` | More than six images | Pass at most six. |
| Clip is shorter than expected | The model chose the length | Ask for it in the prompt ("a ten-second continuous shot"); you're only billed for what came back. |
| Step `failed`, `reason = "blocked"` | Google content policy | Don't retry the same input. |
| Step `failed`, `reason = "no_provider_available"` | Google API queue busy | Retry shortly. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production result handling
- [Veo 3 video generation](./veo3) — Google's other video model, with fixed durations and tiers
- [Google image generation](./google) — Nano Banana / Imagen 4 for stills
