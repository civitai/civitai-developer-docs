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

WAN is Alibaba's open video-generation model family. The orchestrator exposes every shipped version, across multiple providers, under a single `videoGen` step. This recipe walks through the full surface: which version to pick, which provider to route to, and how to invoke each operation.

## Versions at a glance

| `version` | Providers | Operations | Notes |
|-----------|-----------|------------|-------|
| `v2.7` | `fal` | `text-to-video`, `image-to-video`, `reference-to-video`, `edit-video` | Current flagship on FAL. Adds `edit-video`. |
| `v2.6` | `fal` | `text-to-video`, `image-to-video`, `reference-to-video` | FAL production default for new integrations. |
| `v2.5` | `fal` | `text-to-video`, `image-to-video` | Still supported; fewer operations than 2.6/2.7. |
| `v2.2` | `fal`, `comfy` | `text-to-video`, `image-to-video` | Only version with a native ComfyUI path. Supports LoRAs + Turbo mode. |
| `v2.1` | `fal`, `civitai` | `text-to-video`, `image-to-video` | Legacy — prefer 2.6+ unless you specifically need Civitai-hosted inference. |

**Default choice for new integrations**: `version: "v2.6"`, `provider: "fal"`.

## The request shape

Every WAN request is a single `videoGen` step on [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow). Four keys select which WAN variant runs:

```json
{
  "$type": "videoGen",
  "input": {
    "engine":    "wan",
    "version":   "v2.6",         // 2.1 | 2.2 | 2.5 | 2.6 | 2.7
    "provider":  "fal",          // fal | comfy | civitai (version-dependent)
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

**v2.7 additions**: `endImage` to constrain the last frame of the clip (useful for loops and transitions).

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

## Common parameters

These appear on most (version, operation) combinations; the schema for your chosen variant is the source of truth.

| Field | Typical values | Notes |
|-------|----------------|-------|
| `resolution` | `720p`, `1080p` | 1080p costs more and takes longer. |
| `aspectRatio` | `16:9`, `9:16`, `1:1` | Vertical for reels/shorts. |
| `duration` | `5`, `10` (seconds) | Longer clips push you past the 100 s `wait` cap — use webhooks. |
| `enablePromptExpansion` | `true` \| `false` | Let the model expand short prompts. Disable for reproducibility. |
| `enableSafetyChecker` | `true` (default) | Disable only if you handle moderation yourself. |
| `audioUrl` / `audioSetting` | URL or `auto` | Attach background audio (2.6+) or drive audio inference (2.7 edit). |

## Provider-specific features

### FAL (all versions)

Hosted inference with low queue time. FAL is the production default. `enablePromptExpansion` and audio attachment only exist on FAL variants.

### Comfy (v2.2 only)

Runs on Civitai's ComfyUI workers. Two features aren't available on FAL:

- **LoRAs** via the `loras` array with AIR identifiers
  ```json
  "loras": [{ "air": "urn:air:lora:civitai:123456@789012", "strength": 0.8 }]
  ```
- **Turbo mode** (`useTurbo: true`) + frame-interpolator models (`interpolatorModel: "film"`) for faster runs at lower quality
- **Multi-step workflows** — chain `videoGen` → `videoInterpolation` → `videoUpscaler` in one `steps` array

### Civitai (v2.1 only)

Legacy self-hosted path. Accepts explicit `model` AIRs and `width`/`height` instead of `resolution`/`aspectRatio`. Migrate to FAL 2.6+ unless you have a specific reason.

## Reading the result

On success each `videoGen` step emits an output blob per generated clip:

```json
{
  "id": "wf_01HXYZ...",
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "videoGen",
    "status": "succeeded",
    "output": {
      "blobs": [{ "id": "blob_...", "url": "https://.../signed.mp4" }]
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
| `400` with unknown field | Field isn't valid for this `(version, provider, operation)` combo | Check the specific `Wan<X><Provider><Op>Input` schema via [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow). |
| Step `failed`, `error.code = "no_provider"` | No capacity for that resolution/duration on the chosen provider | Retry, drop to 720p, or switch provider. |
| `workflow:processing` after `wait=90` returns | Job ran past the 100 s timeout | Expected — continue via webhook or poll. |
| Blob URL `403` after a few minutes | Signed URL expired | Refetch the workflow to get a fresh URL. |
| Reference prompt ignored | `@VideoN` tokens missing or misnumbered | Tokens are 1-indexed and must match items in `referenceVideoUrls`. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production-ready result handling
- Full parameter catalog: the `Wan<version><Provider><Operation>Input` schemas in the [API reference](/orchestration/reference/) (e.g. `Wan26FalTextToVideoInput`, `Wan27FalEditVideoInput`)
