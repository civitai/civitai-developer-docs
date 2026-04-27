---
title: Happy-Horse video generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/c7281429-7dc8-4256-9907-2e2c55137f40/original=true,quality=90,optimized=true/42750475.jpeg';
const sampleSecondImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';
// sourceVideo must be a civitai-hosted URL or urn:air:... URN — see "Source-media inputs" below.
const sampleVideo = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/a35b4935-3e7a-46a6-b2f7-efbe220b7eab/transcode=true,original=true,quality=90,optimized=true/70182582.webm';

const t2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'happyHorse', version: 'v1.0', operation: 'textToVideo',
      prompt: 'A little girl walking on a road at sunset, cinematic lighting, smooth camera movement',
      aspectRatio: '16:9', resolution: '1080p', duration: 5,
    },
  }],
};

const i2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'happyHorse', version: 'v1.0', operation: 'imageToVideo',
      prompt: 'Camera slowly pushes in',
      image: sampleImage,
      resolution: '1080p', duration: 5,
    },
  }],
};

const editBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'happyHorse', version: 'v1.0', operation: 'videoEdit',
      prompt: 'Repaint the scene in vibrant anime style; reference @Image1 for the character outfit',
      sourceVideo: sampleVideo,
      referenceImages: [sampleImage],
      audioSetting: 'auto',
      resolution: '1080p', duration: 5,
    },
  }],
};

const refBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'happyHorse', version: 'v1.0', operation: 'referenceToVideo',
      prompt: 'character1 and character2 walk together through a neon-lit alley',
      images: [sampleImage, sampleSecondImage],
      aspectRatio: '16:9', resolution: '1080p', duration: 5,
    },
  }],
};
</script>

# Happy-Horse video generation

Alibaba's Happy-Horse video model, served through FAL. Four operations cover the common video workflows: text-to-video, image-to-video, video-to-video editing, and multi-character reference generation. The operation is selected by an explicit `operation` discriminator — fields invalid for that operation are rejected with a `400`.

| `operation` | Required inputs | What it does |
|---|---|---|
| `textToVideo` | `prompt` | Generate a clip from a text prompt. |
| `imageToVideo` | `image` | Animate a single source image as the first frame. |
| `videoEdit` | `sourceVideo`, `prompt` | Re-paint or restyle an existing clip; optional reference images guide the look. |
| `referenceToVideo` | `prompt`, `images` (1–9) | Subject-consistent generation using up to 9 character references. Cite them as `character1`…`character9` in the prompt. |

**Default choice**: `version: "v1.0"`, `resolution: "1080p"`, `duration: 5`. All Happy-Horse jobs exceed the [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) — always submit with `wait=0`.

## The request shape

Every Happy-Horse request is a single `videoGen` step on [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow). Three keys select which leaf schema the rest of the body is validated against:

```json
{
  "$type": "videoGen",
  "input": {
    "engine":    "happyHorse",
    "version":   "v1.0",
    "operation": "textToVideo"
  }
}
```

### Source-media inputs

`videoEdit` accepts `sourceVideo` as either:

- a Civitai AIR URN (`urn:air:…`), or
- a civitai-hosted URL (`image.civitai.com`, orchestrator blob URLs, civitai-managed R2 / B2 / Spaces).

Arbitrary third-party URLs are **not** fetched — requests that pass one are rejected with a `400`. Upload the video to Civitai first and pass the resulting URL. `image`, `images`, and `referenceImages` go through the image pipeline and *do* accept external URLs — only `sourceVideo` has this restriction.

## textToVideo

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "happyHorse",
      "version": "v1.0",
      "operation": "textToVideo",
      "prompt": "A little girl walking on a road at sunset, cinematic lighting, smooth camera movement",
      "aspectRatio": "16:9",
      "resolution": "1080p",
      "duration": 5
    }
  }]
}
```

<RecipeRun :body="t2vBody" />

## imageToVideo

Pass a single image as the first frame; `prompt` becomes optional and only steers the motion.

```json
{
  "engine": "happyHorse",
  "version": "v1.0",
  "operation": "imageToVideo",
  "prompt": "Camera slowly pushes in",
  "image": "https://image.civitai.com/.../first-frame.jpeg",
  "resolution": "1080p",
  "duration": 5
}
```

`aspectRatio` is **not** accepted here — output dimensions are derived from the input image. Source images must be at least 300px on the short side, ≤10 MB, and within a 1:2.5–2.5:1 aspect range.

<RecipeRun :body="i2vBody" />

## videoEdit

Re-paint or restyle an existing clip. The output duration matches the source; `duration` on the request applies to the cost preview only.

```json
{
  "engine": "happyHorse",
  "version": "v1.0",
  "operation": "videoEdit",
  "prompt": "Repaint the scene in vibrant anime style; reference @Image1 for the character outfit",
  "sourceVideo": "https://image.civitai.com/.../clip.webm",
  "referenceImages": [
    "https://image.civitai.com/.../style.jpeg"
  ],
  "audioSetting": "auto",
  "resolution": "1080p"
}
```

- `referenceImages` is optional — pass 0–5 images. Cite them in the prompt as `@Image1`–`@Image5`.
- `audioSetting`: `"auto"` regenerates a soundtrack to match the edit; `"origin"` keeps the source audio intact.
- FAL bills both the input *and* the output second on this operation, so the per-second rate is double the other modes — see [Cost](#cost).

<RecipeRun :body="editBody" />

## referenceToVideo

Generate with 1–9 character references. Cite each in the prompt with `character1`, `character2`, … `character9`.

```json
{
  "engine": "happyHorse",
  "version": "v1.0",
  "operation": "referenceToVideo",
  "prompt": "character1 and character2 walk together through a neon-lit alley",
  "images": [
    "https://image.civitai.com/.../subject-a.jpeg",
    "https://image.civitai.com/.../subject-b.jpeg"
  ],
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "duration": 5
}
```

Reference images must be ≥400 px on the short side and ≤10 MB each.

<RecipeRun :body="refBody" />

## Parameters

Shared across operations unless noted. The per-operation schema in the [API reference](/orchestration/reference/) is authoritative.

| Field | Default | Used by | Notes |
|---|---|---|---|
| `engine` | — ✅ | All | `"happyHorse"` |
| `version` | — ✅ | All | `"v1.0"` |
| `operation` | — ✅ | All | See the table above. |
| `prompt` | — ✅ | All (optional on `imageToVideo`) | Up to 2500 characters. |
| `resolution` | `"1080p"` | All | `"720p"` or `"1080p"`. |
| `duration` | `5` | All except `videoEdit`'s output | Integer seconds, 3–15. `videoEdit` clamps output to the source video's length. |
| `aspectRatio` | `"16:9"` | `textToVideo`, `referenceToVideo` | `"16:9"`, `"9:16"`, `"1:1"`, `"4:3"`, `"3:4"`. |
| `image` | — ✅ | `imageToVideo` | Single image used as the first frame. |
| `sourceVideo` | — ✅ | `videoEdit` | Civitai-hosted URL or AIR URN — not arbitrary external. |
| `referenceImages[]` | `[]` | `videoEdit` | 0–5 images. |
| `audioSetting` | `"auto"` | `videoEdit` | `"auto"` regenerates audio, `"origin"` preserves it. |
| `images[]` | — ✅ | `referenceToVideo` | 1–9 character references. |
| `seed` | random | All | Integer for reproducibility, 0–2147483647. |
| `enableSafetyChecker` | `true` | All | Disable only when you have your own moderation. |

## Cost

Billed per output second in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

```
total = buzzPerSecond × duration
```

| Operation | 720p | 1080p |
|---|---|---|
| `textToVideo`, `imageToVideo`, `referenceToVideo` | **182** Buzz/s | **364** Buzz/s |
| `videoEdit` | **364** Buzz/s | **728** Buzz/s |

Example totals at `duration: 5`:

| Operation | 720p | 1080p |
|---|---|---|
| `textToVideo` / `imageToVideo` / `referenceToVideo` | **910** | **1 820** |
| `videoEdit` | **1 820** | **3 640** |

`videoEdit` is double the others because FAL bills both the input second and the output second — already encoded in the rate above.

## Reading the result

Same as any `videoGen` step — a single `video` blob:

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

Happy-Horse jobs typically complete in 2–6 minutes (longer for `videoEdit` and 1080p). All exceed the [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) — submit with `wait=0` and:

- **Webhooks** (recommended): register a callback with `type: ["workflow:succeeded", "workflow:failed"]` — see [Results & webhooks](/orchestration/guide/results-and-webhooks).
- **Polling**: `GET /v2/consumer/workflows/{workflowId}` on a 10 s → 30 s → 60 s cadence.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `400` with unknown field | Field isn't valid for this `operation` | Each operation maps to its own typed schema (`HappyHorseV1<Op>Input`); check it via [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow). |
| `400` "`sourceVideo` must be a Civitai AIR URN…" | Passed an external URL to `sourceVideo` | Re-upload the video to Civitai and use the resulting URL, or pass a `urn:air:…` URN. |
| `400` "referenceToVideo requires between 1 and 9 reference images" | `images` was empty or had >9 entries | Provide 1–9 images. |
| `400` "videoEdit accepts at most 5 reference images" | `referenceImages` had >5 entries | Trim to 5. |
| Step `failed`, `reason = "no_provider_available"` | FAL queue busy | Retry shortly. |
| Step `failed`, `reason = "blocked"` | Safety checker rejected input/output | Re-prompt; if you've handled moderation upstream, set `enableSafetyChecker: false`. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production result handling
- [Veo 3 video generation](./veo3) — comparable commercial multi-mode video model
- [Kling video generation](./kling) — another commercial multi-mode video model
- Full parameter catalog: the `HappyHorseV1<Operation>Input` schemas in the [API reference](/orchestration/reference/)
- [`videoGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `videoGen` surface
