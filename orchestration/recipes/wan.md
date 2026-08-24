---
title: WAN video generation
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/e4a8f395-8166-44a8-82b1-bb0901c10aa3/original=true,quality=90,optimized=true/19325406.jpeg';
const sampleReferenceVideo = 'https://example.com/reference.mp4';
const sampleSourceVideo = 'https://example.com/input.mp4';

const t2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'wan', version: 'v2.6', provider: 'fal', operation: 'text-to-video',
      prompt: 'A serene forest with sunlight filtering through the trees, cinematic quality',
      resolution: '1080p', aspectRatio: '16:9', duration: 5,
      enablePromptExpansion: true,
    },
  }],
};

const i2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'wan', version: 'v2.6', provider: 'fal', operation: 'image-to-video',
      images: [sampleImage],
      prompt: 'A dancing cat moving gracefully',
      resolution: '1080p', duration: 5,
    },
  }],
};

const r2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'wan', version: 'v2.6', provider: 'fal', operation: 'reference-to-video',
      referenceVideoUrls: [sampleReferenceVideo],
      prompt: '@Video1 is walking through a beautiful garden',
      resolution: '1080p', aspectRatio: '16:9', duration: 5,
    },
  }],
};

const v30T2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'wan', version: 'v3.0', operation: 'text-to-video',
      prompt: 'A serene forest with sunlight filtering through the trees, cinematic quality',
      resolution: '1080p', aspectRatio: '16:9', duration: 5,
      enablePromptExpansion: true,
    },
  }],
};

const v30I2vBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'wan', version: 'v3.0', operation: 'image-to-video',
      startImage: sampleImage,
      prompt: 'The camera slowly pushes in as the subject turns toward the light',
      resolution: '720p', duration: 5,
      enablePromptExpansion: false, usePrime: true,
    },
  }],
};

const editBody = {
  steps: [{
    $type: 'videoGen',
    input: {
      engine: 'wan', version: 'v2.7', provider: 'fal', operation: 'edit-video',
      videoUrl: sampleSourceVideo,
      prompt: 'Transform the scene into a cyberpunk aesthetic with neon lighting',
      resolution: '1080p', audioSetting: 'auto',
    },
  }],
};
</script>

# WAN video generation

WAN is an open video-generation model family. The orchestrator exposes every shipped version, across multiple providers, under a single `videoGen` step. This recipe walks through the full surface: which version to pick, which provider to route to, and how to invoke each operation.

## Versions at a glance

| `version` | Providers | Operations | Notes |
|-----------|-----------|------------|-------|
| `v3.0` | — | `text-to-video`, `image-to-video` | Newest release. Adds `480p`; prompt expansion on by default. |
| `v2.7` | `fal` | `text-to-video`, `image-to-video`, `reference-to-video`, `edit-video` | Widest operation set — the only version with `edit-video`. |
| `v2.6` | `fal` | `text-to-video`, `image-to-video`, `reference-to-video` | Production default for new integrations. |
| `v2.5` | `fal` | `text-to-video`, `image-to-video` | Still supported; fewer operations than 2.6/2.7. |
| `v2.2` | `fal`, `comfy` | `text-to-video`, `image-to-video` | Only version with a native ComfyUI path. Supports LoRAs + Turbo mode. |
| `v2.1` | `fal`, `civitai` | `text-to-video`, `image-to-video` | Legacy — prefer 2.6+ unless you specifically need Civitai-hosted inference. |

**Default choice for new integrations**: `version: "v2.6"`, `provider: "fal"`.

## The request shape

Every WAN request is a single `videoGen` step on [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow). Up to four keys select which WAN variant runs:

```json
{
  "$type": "videoGen",
  "input": {
    "engine":    "wan",
    "version":   "v2.6",         // 2.1 | 2.2 | 2.5 | 2.6 | 2.7 | 3.0
    "provider":  "fal",          // fal | comfy | civitai (2.1–2.7 only; v3.0 has none)
    "operation": "text-to-video" // see table above
  }
}
```

The orchestrator dispatches to the matching input schema (`Wan26FalTextToVideoInput`, `Wan22ComfyVideoGenInput`, etc.), so only the fields valid for that combination are accepted — [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) will `400` on unknown ones.

## Operations

All examples target production and use `<your-token>` in place of your Bearer token. Request timeout is **100 s** — `wait` is capped accordingly. See [Results & webhooks](/orchestration/guide/results-and-webhooks) for anything longer.

### text-to-video

Prompt → video. The most common operation; supported on every WAN version.

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?whatif=false&wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "wan",
      "version": "v2.6",
      "provider": "fal",
      "operation": "text-to-video",
      "prompt": "A serene forest with sunlight filtering through the trees, cinematic quality",
      "resolution": "1080p",
      "aspectRatio": "16:9",
      "duration": 5,
      "enablePromptExpansion": true
    }
  }]
}
```

<RecipeRun :body="t2vBody" />

### image-to-video

One or more source images animate into a clip. Supported on every version.

```json
{
  "engine": "wan",
  "version": "v2.6",
  "provider": "fal",
  "operation": "image-to-video",
  "images": [
    "https://image.civitai.com/.../19325406.jpeg"
  ],
  "prompt": "A dancing cat moving gracefully",
  "resolution": "1080p",
  "duration": 5
}
```

<RecipeRun :body="i2vBody" />

**v2.7 and v3.0 image-to-video use `startImage` + `endImage`** (not `images[]`). Pass `startImage` to seed the first frame and optionally `endImage` to constrain the last frame (useful for loops and transitions). The `images[]` array accepted by v2.6 is not available on v2.7 or v3.0.

### reference-to-video *(v2.6, v2.7)*

Pass one or more reference videos; refer to them from the prompt via `@Video1`, `@Video2`, `@Video3` to transfer subjects / motion / style.

```json
{
  "engine": "wan",
  "version": "v2.6",
  "provider": "fal",
  "operation": "reference-to-video",
  "referenceVideoUrls": [
    "https://example.com/reference.mp4"
  ],
  "prompt": "@Video1 is walking through a beautiful garden",
  "resolution": "1080p",
  "aspectRatio": "16:9",
  "duration": 5
}
```

<RecipeRun :body="r2vBody" />

::: warning Reference video URL
The example above uses `https://example.com/reference.mp4` as a placeholder — replace with a real publicly fetchable video URL before submitting.
:::

### edit-video *(v2.7 only)*

Input video + prompt → transformed video. Preserves timing; rewrites content.

```json
{
  "engine": "wan",
  "version": "v2.7",
  "provider": "fal",
  "operation": "edit-video",
  "videoUrl": "https://example.com/input.mp4",
  "prompt": "Transform the scene into a cyberpunk aesthetic with neon lighting",
  "resolution": "1080p",
  "audioSetting": "auto"
}
```

<RecipeRun :body="editBody" />

::: warning Source video URL
Replace `https://example.com/input.mp4` with a real publicly fetchable video URL before submitting.
:::

## WAN 3.0

The newest release, and the only version with **no `provider` key** — it runs on one backend, so `version` and `operation` fully specify the request. The input surface is smaller and flatter than 2.6/2.7: no `multiShots`, no audio attachment, no reference clips, and no `enableSafetyChecker`. Three things are new:

- **`480p`** joins `720p` and `1080p`, for cheap drafts.
- **`enablePromptExpansion` defaults to `true`.** Prompt rewriting improves results from short prompts but adds 20–60 s of latency. Set it to `false` for the fastest turnaround, and write a fully-specified prompt when you do.
- **`usePrime`** switches to the Prime model. Output quality is identical — Prime only returns sooner, and costs about 40% more. Leave it `false` unless latency matters more than cost.

```json
{
  "engine": "wan",
  "version": "v3.0",
  "operation": "text-to-video",
  "prompt": "A serene forest with sunlight filtering through the trees, cinematic quality",
  "resolution": "1080p",
  "aspectRatio": "16:9",
  "duration": 5,
  "enablePromptExpansion": true
}
```

<RecipeRun :body="v30T2vBody" />

Image-to-video takes `startImage` (and optionally `endImage`), like v2.7:

```json
{
  "engine": "wan",
  "version": "v3.0",
  "operation": "image-to-video",
  "startImage": "https://image.civitai.com/.../19325406.jpeg",
  "prompt": "The camera slowly pushes in as the subject turns toward the light",
  "resolution": "720p",
  "duration": 5,
  "enablePromptExpansion": false,
  "usePrime": true
}
```

<RecipeRun :body="v30I2vBody" />

## Common parameters

These appear on most (version, operation) combinations; the schema for your chosen variant is the source of truth.

| Field | Typical values | Notes |
|-------|----------------|-------|
| `resolution` | `720p`, `1080p` (plus `480p` on v3.0) | 1080p costs more and takes longer. |
| `aspectRatio` | `16:9`, `9:16`, `1:1` | Vertical for reels/shorts. v3.0 text-to-video also takes `4:3` / `3:4`; v3.0 image-to-video takes none — the ratio comes from the source image. |
| `duration` | `5`, `10` (seconds) | Longer clips push you past the 100 s `wait` cap — use webhooks. |
| `enablePromptExpansion` | `true` \| `false` | Let the model expand short prompts. Disable for reproducibility, or on v3.0 to cut 20–60 s of latency. |
| `enableSafetyChecker` | `true` (default) | Disable only if you handle moderation yourself. Not accepted on v3.0. |
| `audioUrl` / `audioSetting` | URL or `auto` | Attach background audio (2.6 / 2.7) or drive audio inference (2.7 edit). Not on v3.0. |

## Provider-specific features

### `fal` (2.1–2.7)

Hosted inference with low queue time. `provider: "fal"` is the production default for these versions; audio attachment only exists on these variants. (v3.0 takes no `provider` — see [WAN 3.0](#wan-3-0).)

### Comfy (v2.2 only)

Runs on Civitai's ComfyUI workers. Two features aren't available on `fal`:

- **LoRAs** via the `loras` array with AIR identifiers
  ```json
  "loras": [{ "air": "urn:air:lora:civitai:123456@789012", "strength": 0.8 }]
  ```
- **Turbo mode** (`useTurbo: true`) + frame-interpolator models (`interpolatorModel: "film"`) for faster runs at lower quality
- **Multi-step workflows** — chain `videoGen` → `videoInterpolation` → `videoUpscaler` in one `steps` array

### Civitai (v2.1 only)

Legacy self-hosted path. Accepts explicit `model` AIRs and `width`/`height` instead of `resolution`/`aspectRatio`. Migrate to `fal` 2.6+ unless you have a specific reason.

## Reading the result

On success each `videoGen` step emits a single `video` blob:

```json
{
  "id": "wf_01HXYZ...",
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

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL; don't cache them long-term. Download and store the bytes yourself if you need durable storage.

## Long-running jobs

WAN jobs routinely run longer than 100 s (any 1080p clip ≥ 10 s; reference-to-video; edit-video). The [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) means `wait` is capped — use `wait=90` for a best-effort inline attempt, then fall back to:

- **Webhooks** (preferred): register a callback with `type: ["workflow:succeeded", "workflow:failed"]` — see [Results & webhooks](/orchestration/guide/results-and-webhooks)
- **Polling**: `GET /v2/consumer/workflows/{workflowId}` on a 5 s → 10 s → 30 s cadence

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with unknown field | Field isn't valid for this `(version, provider, operation)` combo | Check the specific input schema via [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — `Wan26FalTextToVideoInput`, `Wan30TextToVideoInput`, and so on. |
| Step `failed`, `error.code = "no_provider"` | No capacity for that resolution/duration on the chosen provider | Retry, drop to 720p, or switch provider. |
| `workflow:processing` after `wait=90` returns | Job ran past the 100 s timeout | Expected — continue via webhook or poll. |
| Blob URL `403` after a few minutes | Signed URL expired | Refetch the workflow to get a fresh URL. |
| Reference prompt ignored | `@VideoN` tokens missing or misnumbered | Tokens are 1-indexed and must match items in `referenceVideoUrls`. |

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

WAN video pricing varies by `version`, `provider`, `resolution`, and acceleration flags. All the numbers below are per **single video** (not per second per clip unless noted).

### v3.0

Per-second, scaled by resolution. Prime costs about 40% more for the same output:

| Resolution | Buzz per second | Prime |
|-----------|-----------------|-------|
| `480p` | **65** | 88.4 |
| `720p` | **130** | 182 |
| `1080p` | **260** | 364 |

```
total = buzzPerSecond × duration_seconds
```

- 1080p × 5 s → **1 300 Buzz** (Prime: 1 820)
- 720p × 5 s → **650 Buzz** (Prime: 910)

### v2.7 (`fal`)

Flat per-second across resolutions:

```
total = 130 × duration_seconds
```

- 5 s → **~650 Buzz**
- 10 s → ~1 300 Buzz

### v2.6 (`fal`)

Resolution-scaled per-second:

| Resolution | Buzz per second |
|-----------|-----------------|
| `720p` | **130** |
| `1080p` | **195** |

- 720p × 5 s → **~650 Buzz**
- 1080p × 5 s → **~975 Buzz**

### v2.5 (`fal`)

Resolution-scaled per-second:

```
total = 100 × resolutionFactor × duration
```

with `resolutionFactor` = 1 (480p) / 2 (720p) / 3 (1080p).

- 720p × 5 s → **1 000 Buzz**
- 720p × 10 s → **2 000 Buzz**
- 480p × 5 s → **500 Buzz**

### v2.2 (`fal`, `text-to-video` / `image-to-video`)

Driven by Turbo / LoRA / standard, plus resolution:

| Mode | `720p` | `580p` | `480p` |
|------|--------|--------|--------|
| Turbo | **~130 / video** (flat) | ~97.5 | ~65 |
| With LoRA | **~94.9 × duration** | ~94.9 × duration | ~94.9 × duration |
| Standard | **~104 × duration** | ~78 × duration | ~52 × duration |

Typical: 720p Turbo 5 s → ~130; 720p standard 5 s → ~520; 720p LoRA 5 s → ~475.

### v2.2-5b (`fal`)

| Mode | Buzz per video |
|------|----------------|
| Fast-wan `720p` | **~32.5** |
| Distill | ~75.9 |
| Standard | ~142.35 |
| Image-to-video | ~142.35 (flat) |

### v2.2 (Comfy, Civitai-hosted)

Variable per-pixel-per-step formula with an 8× markup, minimum **100 Buzz**, rounded up to the nearest 25:

```
areaCost    = max(a × width × height + b, 0)    // per-frame per-step compute factor
duration    = length × steps × areaCost
buzz        = max(100, ceil((duration × 420/3600 × 8) / 25) × 25)
```

Where `(a, b)` is `(1.22e-6, -0.14)` for image-to-video, `(2.53e-7, -0.0259)` for text-to-video. This path is noticeably more expensive per second than the `fal` routes — `fal` is the default for a reason.

### v2.1 (legacy)

```
total = 100 × resolutionFactor × duration
```
with `resolutionFactor` = 1 (480p) / 2 (720p) / 3 (1080p). 720p × 5 s → ~1 000 Buzz.

### Quick reference

For new integrations on `v2.6` / `v2.7` at 720p × 5 s with no LoRAs, expect **~650–975 Buzz per video**. Always `whatif=true` before long-duration / high-res submissions — costs scale linearly with duration and can escalate fast.

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production-ready result handling
- Full parameter catalog: the `Wan…Input` schemas in the [API reference](/orchestration/reference/) (e.g. `Wan26FalTextToVideoInput`, `Wan27FalEditVideoInput`, `Wan30TextToVideoInput`)
- [MiniMax H3](./minimax-h3) — 2K native video with first/last-frame and reference video + audio
- [`videoGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `videoGen` surface (WAN, LTX2, Flux, etc.); import into Postman / OpenAPI Generator
