---
title: Gemini Omni video generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';
const sampleEndImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/e4a8f395-8166-44a8-82b1-bb0901c10aa3/original=true,quality=90,optimized=true/19325406.jpeg';

const omni12Body = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'gemini-omni', model: '1.2-flash',
      prompt: 'A red marble rolling down a wooden spiral track, close-up, soft daylight, continuous smooth shot',
      duration: 15, aspectRatio: '16:9', resolution: '720p',
    },
  }],
};

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

Google's Gemini Omni Flash generates MP4 video with synchronized audio from text and up to six images, at 360p, 720p, 1080p or 4K. Version 1.2 runs on Google Cloud and supports 3–15 seconds; version 1.1 chooses 3–10 seconds. The operation (text-to-video, image-to-video, first-last-frame, reference) is inferred from the number of images passed, exactly like [Veo 3](./veo3).

| `model` | Also known as | Notes |
|---------|---------------|-------|
| `1.1-flash` | Gemini Omni 1.1 Flash | **Default** for existing requests. Model-selected duration. |
| `1.2-flash` | Gemini Omni 1.2 Flash | Google Cloud. Select 3–15 seconds, or up to 10 with first/last frames. |

Both versions are **billed on the seconds actually delivered**, up to the reserved duration — see [Cost](#cost).

Jobs can outlast [your HTTP client's timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) — submit with `wait=0` (or a short `wait`) and poll or use webhooks.

## Omni 1.2 Flash

Set `model: "1.2-flash"` and optionally `duration` (whole seconds, default 10):

```json
{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "gemini-omni",
      "model": "1.2-flash",
      "prompt": "A red marble rolling down a wooden spiral track, close-up, soft daylight, continuous smooth shot",
      "duration": 15,
      "aspectRatio": "16:9",
      "resolution": "720p"
    }
  }]
}
```

<RecipeRun :body="omni12Body" />

All four image-count modes below also support `1.2-flash`: use the same `images` array and add the model and duration fields. Two images select first/last-frame generation, which accepts only 3–10 seconds; zero, one, or three to six images support 3–15 seconds. Existing requests without a model continue to use 1.1 Flash.

See Google's [model limits](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/omni-1-2-flash) and [Cloud API](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-text).

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
| `model` | `"1.1-flash"` | `"1.1-flash"` or `"1.2-flash"`. |
| `duration` | 10 for 1.2 | 1.2 only: integer 3–15; at most 10 with two images. Omit for 1.1. |
| `prompt` | — ✅ | Generation prompt. Put negatives in the prompt — there is no `negativePrompt`. |
| `aspectRatio` | `"16:9"` | `"16:9"` or `"9:16"`. |
| `resolution` | `"720p"` | `"360p"`, `"720p"`, `"1080p"`, `"4k"`. 1080p and 4K are upscaled from 720p. |
| `images[]` | `[]` | 0–6 images. Count determines operation type. |

Not exposed: `seed`, `negativePrompt`, `generateAudio` (audio is always generated), `enablePromptEnhancer`.

## Cost

Omni is priced **per delivered second**, by resolution. Charges round up once to whole Buzz.

Version 1.2 uses Google Cloud’s [$12 per million video output tokens](https://cloud.google.com/vertex-ai/generative-ai/pricing#gemini-omni), preserving the existing margin at each resolution: the 1.1 Buzz rate × 12 / 17.5. Approximate per-second rates and exact reserved totals:

| `resolution` | Buzz / second | Reserved for 10 s | Reserved for 15 s |
|--------------|---------------|-------------------|-------------------|
| `360p` | 58.286 | 583 | 875 |
| `720p` | 171.429 | 1 715 | 2 572 |
| `1080p` | 205.714 | 2 058 | 3 086 |
| `4k` | 274.286 | 2 743 | 4 115 |

Version 1.1 keeps its existing rates:

| `resolution` | Buzz / second | Reserved at submit (10 s cap) |
|--------------|---------------|-------------------------------|
| `360p` | 85 | **850** |
| `720p` | 250 | **2 500** |
| `1080p` | 300 | **3 000** |
| `4k` | 400 | **4 000** |

The reservation is settled when generation completes:

1. **Submit** — 1.2 reserves the requested duration (10 seconds when omitted); 1.1 reserves its 10-second maximum. A `whatif=true` request reports this cap as the estimate, and a real submit is rejected with `400` (`requiredBuzz` / `availableBuzz` in the body) if your balance can't cover it.
2. **Complete** — the step's `cost` is settled to `ceil(seconds × rate)` for the clip that came back and the difference is refunded automatically. A 6.4 s clip at 720p costs 1 600 Buzz, not 2 500.
3. **Fail or cancel** before any video was produced — the full reservation is refunded.

## Reading the result

Standard `videoGen` output: a single `video` blob ([shape and URL expiry](/orchestration/recipes/#reading-results)).

## Long-running jobs

360p usually completes in under a minute; 720p in one to two; 4K can take several. Submit with `wait=0`, then prefer a [webhook](/orchestration/guide/results-and-webhooks) (`workflow:succeeded` / `workflow:failed`) or poll `GET /v2/consumer/workflows/{workflowId}` every 10–30 s.

## Troubleshooting

Timeouts, moderation blocks and expired blob URLs: see [Common troubleshooting](/orchestration/recipes/#common-troubleshooting). `blocked` comes from Google's content policy.

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with `requiredBuzz` / `availableBuzz` | Balance below the reserved cost | Top up, or drop to `360p` for drafts. |
| `400` "must be one of 16:9, 9:16" | Unsupported aspect ratio | Omni is landscape or portrait only; no `1:1`. |
| `400` on `images` | More than six images | Pass at most six. |
| Clip is shorter than expected | Version 1.1 chooses the length | Use `model: "1.2-flash"` and `duration` for explicit length control. |
| `400` on `duration` | Unsupported version or first/last-frame length | Use 1.2, whole seconds 3–15, and at most 10 for two images. |
| Step `failed`, `reason = "no_provider_available"` | Google API queue busy | Retry shortly. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production result handling
- [Veo 3 video generation](./veo3) — Google's other video model, with fixed durations and tiers
- [Google image generation](./google) — Nano Banana / Imagen 4 for stills
