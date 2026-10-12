---
title: MiniMax H3 (ComfyUI) video generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/c7281429-7dc8-4256-9907-2e2c55137f40/original=true,quality=90,optimized=true/42750475.jpeg';
const sampleSecondImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const t2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'minimax-h3-comfy',
      operation: 'imageToVideo',
      prompt: 'A golden retriever puppy running along a sunny beach, waves splashing, cinematic slow motion',
      width: 864, height: 480, duration: 5,
    },
  }],
};

const i2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'minimax-h3-comfy',
      operation: 'imageToVideo',
      prompt: 'Pull focus to the people in the background and add steam rising from the bowl',
      firstFrame: sampleImage,
      duration: 5,
    },
  }],
};

const refBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'minimax-h3-comfy',
      operation: 'referenceToVideo',
      prompt: 'The video opens exactly on <Image 1>: same framing, background and lighting. The character from <Image 2> walks into the scene.',
      images: [sampleImage, sampleSecondImage],
      duration: 5,
      turbo: true,
    },
  }],
};
</script>

# MiniMax H3 (ComfyUI) video generation

The open MiniMax H3 weights, run on Civitai's own ComfyUI workers instead of MiniMax's hosted API. It is a fraction of the price of the [hosted `minimax-h3` engine](./minimax-h3), generates a clip **with a native audio track**, and accepts LoRAs, but it renders at up to 1344 px per side rather than 2K. Three operations: text- or frame-to-video, reference-images-to-video, and structure-controlled video-to-video.

**Default choice**: `operation: "imageToVideo"`, `duration: 5`, the default 864×480. Add `turbo: true` for drafts: it costs about a third as much and finishes in under a minute.

::: tip Voice references (`referenceAudios`)
`referenceAudios` works on `referenceToVideo` with `turbo: true`, alongside `images`. Pass each clip as the **original blob URL** or the **blob AIR** of your upload. A redirected blob URL (one that looks like `/blobs/content/<token>`) is not accepted as an input and fails, even on a `whatif=true` preview.
:::

## Operations

| `operation` | Weights | What it does |
|---|---|---|
| `imageToVideo` (default) | FL2VA | Text-to-video with no frames, or animate from `firstFrame` and/or towards `lastFrame`. |
| `referenceToVideo` | REF2VA | Generate from up to 9 reference images, referred to as `<Image 1>`, `<Image 2>`… in the prompt. |
| `controlVideo` | FL2VA + ControlNet | Video-to-video guided by a preprocessed structure map (depth, pose, edges). |

## The request shape

A single `videoGen` step on [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow). `engine` selects the ComfyUI path and `operation` selects the mode:

```json
{
  "$type": "videoGen",
  "input": {
    "engine": "minimax-h3-comfy",
    "operation": "imageToVideo",
    "prompt": "…",
    "duration": 5
  }
}
```

Every operation shares these fields:

| Field | Default | Notes |
|---|---|---|
| `engine` | — ✅ | `"minimax-h3-comfy"` |
| `operation` | `"imageToVideo"` | See the table above. |
| `prompt` | — ✅ | |
| `duration` | `5` | Integer seconds, 4–15. |
| `width` / `height` | `864` / `480` | 32–1344 each, and **multiples of 32**. Resolution does not change the price. |
| `turbo` | `false` | Faster, cheaper distilled path. Good for drafts; can copy the layout of a busy reference image (see Troubleshooting). |
| `steps` | `20` | 1–60 sampling steps. Not billed. |
| `fast` | `false` | Enables EasyCache with its default configuration. |
| `seed` | random | |
| `loras` | `{}` | Map of LoRA AIR → strength, e.g. `{ "<lora-air>": 0.8 }`. Use LoRAs trained for MiniMax H3. |
| `diffusionModel` | — | Override the base weights with an AIR. Leave unset unless you know you need it. |

## Text-to-video and image-to-video

`imageToVideo` with only a `prompt` is text-to-video. Add `firstFrame` to animate forward from a still, `lastFrame` to end on one, or both to interpolate between them.

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "minimax-h3-comfy",
      "operation": "imageToVideo",
      "prompt": "A golden retriever puppy running along a sunny beach, waves splashing, cinematic slow motion",
      "width": 864,
      "height": 480,
      "duration": 5
    }
  }]
}
```

<RecipeRun :body="t2vBody" />

With a first frame:

```json
{
  "engine": "minimax-h3-comfy",
  "operation": "imageToVideo",
  "prompt": "Pull focus to the people in the background and add steam rising from the bowl",
  "firstFrame": "https://image.civitai.com/.../first-frame.jpeg",
  "duration": 5
}
```

<RecipeRun :body="i2vBody" />

| Field | Notes |
|---|---|
| `firstFrame` | Optional opening frame. A URL, data URL or base64 string. |
| `lastFrame` | Optional closing frame. Same formats. |

## Reference-to-video

Pass 1–9 `images` and refer to them in the prompt as `<Image 1>`, `<Image 2>` and so on, in array order.

```json
{
  "engine": "minimax-h3-comfy",
  "operation": "referenceToVideo",
  "prompt": "The video opens exactly on <Image 1>: same framing, background and lighting. The character from <Image 2> walks into the scene.",
  "images": [
    "https://image.civitai.com/.../start-frame.jpeg",
    "https://image.civitai.com/.../character.jpeg"
  ],
  "duration": 5,
  "turbo": true
}
```

<RecipeRun :body="refBody" />

**To anchor the opening shot, put the start frame in `images[0]` and say so in the prompt**, as above. Don't use the `firstFrame` field on this operation: it is in the schema, but a request combining it with `images` currently fails as soon as the job starts. A frame passed as `<Image 1>` with an explicit "opens exactly on" instruction does the same job.

| Field | Notes |
|---|---|
| `images[]` | 1–9 reference images. URL, data URL or base64. |
| `referenceAudios[]` | Voice clips to drive the performance. Original blob URL or blob AIR (see the note at the top). |
| `firstFrame` | **Not working yet** in combination with `images`. Pass the frame as `images[0]` instead. |

## Control video

`controlVideo` re-renders a clip following the structure of a **preprocessed** control map. `video` must be a Civitai AIR (`urn:air:…`) or a Civitai-hosted URL of an already-preprocessed map; a raw video URL is rejected with a `400`.

| Field | Default | Notes |
|---|---|---|
| `video` | — ✅ | Preprocessed control map, as an AIR or Civitai-hosted URL. |
| `strength` | `1` | 0–10. |
| `startPercent` / `endPercent` | `0` / `1` | The portion of the sampling schedule the control applies to. |

## Reading the result

Standard `videoGen` output: a single `video` blob ([shape and URL expiry](/orchestration/recipes/#reading-results)).

```json
{
  "video": {
    "id": "0W73QE15CNKRNJDJZFHVQSHTN0.mp4",
    "width": 864,
    "height": 480,
    "duration": 4.458,
    "available": true,
    "url": "https://orchestration-new.civitai.com/v2/consumer/blobs/0W73QE15CNKRNJDJZFHVQSHTN0.mp4?sig=…"
  }
}
```

The file is H.264 at 24 fps in an MP4 container, with an AAC audio track generated alongside the picture.

## Runtime

A 4-second turbo clip at the default size finishes in under a minute. Standard (non-turbo) runs and longer clips take longer. Submit with `wait=0` and collect the result via a webhook or by polling. See [Results and webhooks](/orchestration/guide/results-and-webhooks).

## Cost

Billed per second of output. Resolution, `steps`, `fast` and the number of reference images don't change the price. Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

| Mode | Per second | 5 s | 10 s | 15 s |
|---|---|---|---|---|
| Standard | 35 | **175** | **350** | **525** |
| `turbo: true` | 12 | **60** | **120** | **180** |

For comparison, the [hosted `minimax-h3` engine](./minimax-h3#cost) is 170 Buzz per second at 2K.

`whatif=true` checks the request against the schema and prices it, but does not run it. A request that will fail at run time, such as one combining `firstFrame` with `images`, still gets a price.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `400`: "width and height must be multiples of 32" | e.g. 1280×720 | Use multiples of 32, e.g. 1280×704 or 1344×768. |
| `400`: "At least one reference image or audio clip is required" | `referenceToVideo` with no `images` | Pass at least one image. |
| `400` on `controlVideo` mentioning a preprocessed AIR | Raw video URL in `video` | Pass a preprocessed control map as an AIR or Civitai-hosted URL. |
| Step fails immediately, no message, no charge | `firstFrame` together with `images` on `referenceToVideo` | Not supported yet. Pass the frame as `images[0]` instead. |
| `referenceAudios` fails, or `whatif` returns `500` | Audio passed as a redirected blob URL (`/blobs/content/<token>`) | Pass the original blob URL or the blob AIR. |
| Turbo output copies the grid of a multi-panel reference sheet | Turbo can follow the reference image's layout too closely | Put a clean start frame in `images[0]`, or turn `turbo` off. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [MiniMax H3 (hosted)](./minimax-h3): 2K, reference video and voice references
- Other video engines: [WAN](./wan), [LTX2](./ltx2), [Kling](./kling), [Seedance](./seedance)
- Schemas: `ComfyMiniMaxH3VideoGenInput`, `ComfyMiniMaxH3ImageToVideoInput`, `ComfyMiniMaxH3ReferenceToVideoInput`, `ComfyMiniMaxH3ControlVideoInput` in the [API reference](/orchestration/reference/)
