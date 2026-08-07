---
title: Seedance video generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/925ab66c-616d-4a65-b338-3565494f8aa1/original=true,quality=90,optimized=true/ChatGPT%20Image%20Jul%203,%202025,%2008_19_44%20AM.jpeg';
const sampleSecondImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/5fa07823-315f-4737-95cd-ded6f2671b94/original=true,quality=90,optimized=true/1751459024314-622e372a-0100-4f92-98b7-26ecc7397a2d.jpeg';

const t2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'seedance',
      model: 'v2',
      prompt: 'A dancing cat in a neon-lit alley, cinematic lighting',
      aspectRatio: '16:9', resolution: '720p', duration: 5, generateAudio: true,
    },
  }],
};

const v25Body = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'seedance',
      model: 'v2.5',
      prompt: 'An epic landscape unfolding through the seasons, slow continuous camera push-in',
      aspectRatio: '16:9', resolution: '480p', duration: 30, generateAudio: true,
    },
  }],
};

const i2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'seedance',
      model: 'v2.5',
      prompt: 'The scene animates with gentle motion',
      resolution: '720p', duration: 5, generateAudio: true,
      images: [sampleImage],
    },
  }],
};

const flfBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'seedance',
      model: 'v2',
      prompt: 'Smooth transition between the two frames with natural motion',
      resolution: '720p', duration: 5,
      images: [sampleImage, sampleSecondImage],
    },
  }],
};

const refBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'seedance',
      model: 'v2.5',
      prompt: 'Use the first-person POV framing from @Video 1 throughout, and use @Audio 1 as background music. @Image 1 a dew-covered red apple is picked up by hand, @Image 2 the finished layered fruit tea is raised toward the camera.',
      resolution: '480p', duration: 10, generateAudio: true,
      images: [
        'https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic1.jpg',
        'https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic2.jpg',
      ],
      referenceVideos: ['https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_video/r2v_tea_video1.mp4'],
      referenceAudios: ['https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_audio/r2v_tea_audio1.mp3'],
    },
  }],
};
</script>

# Seedance video generation

ByteDance's Seedance, called directly against BytePlus ModelArk. All versions produce 24 fps video with an optional native audio track, and cover four input modes: text-to-video, image-to-video, first-and-last-frame, and reference-to-video with reference images, video clips, and audio clips.

Pick a version with `model`:

| `model` | Duration | Resolution | Reference budget |
|---|---|---|---|
| `v2` (default) | 4–15 s | 480p / 720p / 1080p | 9 images · 3 videos · 3 audio, ≤15 s total |
| `v2-fast` | 4–15 s | 480p / 720p | same as `v2` |
| `v2-mini` | 4–15 s | 480p / 720p / 1080p | same as `v2`, cheapest tier |
| `v2.5` | **4–30 s** | **480p / 720p only** | **30 images · 10 videos · 10 audio, ≤30 s total** |

**Seedance 2.5** doubles the single-shot length to 30 seconds and triples the reference budget, and is the only version that accepts audio-only input. It drops 1080p in exchange — 1080p and 4K remain `v2`-only.

**Default choice**: `model: "v2"`, `resolution: "720p"`, `duration: 5`, `aspectRatio: "adaptive"`. Every Seedance job exceeds the [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) — always submit with `wait=0`.

## The request shape

A single `videoGen` step on [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow). `engine` is the discriminator; `model` selects the version:

```json
{
  "$type": "videoGen",
  "input": {
    "engine": "seedance",
    "model": "v2",
    "prompt": "…",
    "resolution": "720p",
    "duration": 5
  }
}
```

There is no `operation` discriminator — **the mode is inferred from which media fields you populate**:

| Mode | Populate |
|---|---|
| Text-to-video | nothing but `prompt` |
| Image-to-video | one entry in `images` |
| First and last frame | two entries in `images` |
| Reference-to-video | three or more `images`, or any `referenceVideos` / `referenceAudios` |

## Text-to-video

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "seedance",
      "model": "v2",
      "prompt": "A dancing cat in a neon-lit alley, cinematic lighting",
      "aspectRatio": "16:9",
      "resolution": "720p",
      "duration": 5,
      "generateAudio": true
    }
  }]
}
```

<RecipeRun :body="t2vBody" />

## Long-form with Seedance 2.5

`v2.5` is the only version that accepts a `duration` above 15, up to 30 seconds in a single generation. Cost scales linearly with duration, so 480p keeps a 30-second test affordable.

```json
{
  "engine": "seedance",
  "model": "v2.5",
  "prompt": "An epic landscape unfolding through the seasons, slow continuous camera push-in",
  "aspectRatio": "16:9",
  "resolution": "480p",
  "duration": 30,
  "generateAudio": true
}
```

<RecipeRun :body="v25Body" />

## Image-to-video

A single entry in `images` becomes the opening frame.

```json
{
  "engine": "seedance",
  "model": "v2.5",
  "prompt": "The scene animates with gentle motion",
  "images": ["https://image.civitai.com/.../first-frame.jpeg"],
  "resolution": "720p",
  "duration": 5
}
```

<RecipeRun :body="i2vBody" />

## First and last frame

Two entries interpolate between them — first image opens, second closes.

```json
{
  "engine": "seedance",
  "model": "v2",
  "prompt": "Smooth transition between the two frames with natural motion",
  "images": [
    "https://image.civitai.com/.../start.jpeg",
    "https://image.civitai.com/.../end.jpeg"
  ],
  "resolution": "720p",
  "duration": 5
}
```

<RecipeRun :body="flfBody" />

## Reference-to-video

Three or more `images`, or any `referenceVideos` / `referenceAudios`, switch Seedance into reference mode. Refer to individual assets from the prompt as `@Image 1`, `@Video 1`, `@Audio 1`.

```json
{
  "engine": "seedance",
  "model": "v2.5",
  "prompt": "Use the first-person POV framing from @Video 1 throughout, and use @Audio 1 as background music. @Image 1 a dew-covered red apple is picked up by hand.",
  "images": ["https://.../pic1.jpg", "https://.../pic2.jpg"],
  "referenceVideos": ["https://.../clip.mp4"],
  "referenceAudios": ["https://.../music.mp3"],
  "resolution": "480p",
  "duration": 10
}
```

<RecipeRun :body="refBody" />

Prompt punctuation is meaningful in reference mode: `()` marks music, `<>` sound effects, `{}` dialogue, and `【】` subtitles.

::: warning Reference media must be publicly reachable
BytePlus fetches `referenceVideos` and `referenceAudios` **server-side, from its own infrastructure**. Relative URLs and non-`http(s)` schemes are dropped before submission; signed URLs that expire and private buckets fail with an opaque error. Images passed via `images` go through the Civitai image pipeline first and don't have this restriction.
:::

::: warning Seedance 2.5 rejects real human faces in reference media
`v2.5` and the `v2` series refuse reference images and videos containing real human faces. Your own recent Seedance outputs are accepted as references.
:::

## Parameters

The schema in the [API reference](/orchestration/reference/) is authoritative.

| Field | Default | Notes |
|---|---|---|
| `engine` | — ✅ | `"seedance"` |
| `model` | `"v2"` | `"v2"`, `"v2-fast"`, `"v2-mini"`, `"v2.5"`. |
| `prompt` | — ✅ | |
| `resolution` | `"720p"` | `"480p"`, `"720p"`, `"1080p"`. **`1080p` is rejected on `v2.5`.** |
| `duration` | `5` | Integer seconds. 4–15 on the `v2` series; **4–30 on `v2.5`** — a value above 15 on any other model is rejected. |
| `aspectRatio` | `"adaptive"` | `"adaptive"`, `"21:9"`, `"16:9"`, `"4:3"`, `"1:1"`, `"3:4"`, `"9:16"`. On `v2.5` anything but text-to-video is forced to `"adaptive"` (see below). |
| `generateAudio` | `true` | Output audio is always mono. |
| `seed` | random | Assigned automatically when omitted. Not sent for `v2.5`, which ignores it. |
| `images[]` | `[]` | Role is positional — see the mode table above. |
| `referenceVideos[]` | `[]` | 2–30 s each. MP4/MOV, ≤200 MB, H.264/H.265. |
| `referenceAudios[]` | `[]` | 2–30 s each. WAV/MP3, ≤15 MB. |

Image limits: 300–6000 px per side, aspect ratio between 0.4 and 2.5, ≤30 MB, JPEG/PNG/WEBP/BMP/TIFF/GIF/HEIC/HEIF.

::: tip `aspectRatio` is coerced on Seedance 2.5
`v2.5` classifies each request into a task type and only accepts `adaptive` for the frame-anchored and reference-driven ones — and it enforces that *asynchronously*, failing only after the task has queued. Any `v2.5` request that isn't plain text-to-video therefore has `aspectRatio` rewritten to `"adaptive"` before submission; output geometry follows the input media.
:::

## Cost

Billed per second in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

```
total = ratePerSecond × duration
```

Buzz per second of output:

| `model` | 480p | 720p | 1080p |
|---|---|---|---|
| `v2` | 90 | 200 | 490 |
| `v2-fast` | 55 | 120 | — |
| `v2-mini` | 44 | 98 | 223 |
| `v2.5` | **134** | **300** | — |

`v2-mini` is charged at a reduced rate — 26 / 59 / 134 — when the request includes a `referenceVideos` entry. `v2.5` is charged at the flat rate above regardless of reference media.

Worked examples:

| Scenario | Total |
|---|---|
| `v2`, 720p, 5 s | 1 000 |
| `v2-mini`, 720p, 5 s | 490 |
| `v2.5`, 720p, 5 s | 1 500 |
| `v2.5`, 480p, 30 s | 4 020 |
| `v2.5`, 720p, 30 s | 9 000 |

Failed generations and clips rejected by BytePlus's content review are not charged.

## Reading the result

Same as any `videoGen` step — a single `video` blob:

```json
{
  "steps": [{
    "output": {
      "video": {
        "id": "…",
        "url": "https://orchestration.civitai.com/v2/consumer/blobs/…"
      }
    }
  }]
}
```

The blob URL is signed and expires — refetch the workflow with [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) for a fresh one rather than storing it.

The output is H.264 in an MP4 container at 24 fps, with an AAC audio track when `generateAudio` is on.

## Runtime

Well past the 100-second inline request budget, and roughly proportional to duration — a 30-second `v2.5` clip takes considerably longer than a 5-second one. Submit with `wait=0` and collect the result via a webhook or by polling — see [Results and webhooks](/orchestration/guide/results-and-webhooks).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `400` on `duration` | Above 15 s on `v2` / `v2-fast` / `v2-mini` | Switch to `model: "v2.5"`, which allows up to 30 s. |
| `400` on `resolution` | `1080p` with `model: "v2.5"` | 2.5 tops out at 720p; use `v2` for 1080p. |
| Job fails after sitting in the queue | BytePlus classified a `v2.5` request into a task type your parameters don't satisfy | Usually prompt-driven: edit/extend wording ("add", "remove", "extend") over reference media switches task type. Rephrase, or drop the reference media. |
| Reference media error | URL not publicly fetchable, or a clip outside the size/duration limits | Check the limits above and that the URL resolves from the public internet. |
| Content-policy rejection | BytePlus's own input review — including its ban on real human faces in reference media | Rephrase the prompt or swap the source media. Not billed. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- Other video engines: [WAN](./wan), [Veo 3](./veo3), [Kling](./kling), [MiniMax H3](./minimax-h3), [FLUX-3](./flux3-video)
- The image counterpart from the same provider: [Seedream](./seedream)
- Schema: `SeedanceVideoGenInput` in the [API reference](/orchestration/reference/)
