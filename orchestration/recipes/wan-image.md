---
title: WAN image generation
---

<script setup>
const v22Body = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'wan', version: 'v2.2', provider: 'fal',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      imageSize: 'square_hd',
      guidanceScale: 3.5, steps: 27,
      quantity: 1,
    },
  }],
};

const v225bBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'wan', version: 'v2.2-5b', provider: 'fal',
      prompt: 'A serene mountain landscape with a crystal clear lake at dawn',
      imageSize: 'landscape_16_9',
      guidanceScale: 3.5, steps: 40, shift: 2,
    },
  }],
};

const v25Body = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'wan', version: 'v2.5', provider: 'fal',
      prompt: 'A cinematic sci-fi cityscape at sunset, neon lighting',
      imageSize: 'landscape_16_9',
      guidanceScale: 3.5,
    },
  }],
};

const v27Body = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'wan', version: 'v2.7', provider: 'fal',
      prompt: 'An epic fantasy dragon perched on a mountain peak at dawn',
      imageSize: 'landscape_16_9',
      guidanceScale: 3.5,
    },
  }],
};

const v22FastBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'wan', version: 'v2.2', provider: 'fal',
      prompt: 'A cozy cabin in the woods at sunset',
      imageSize: 'square_hd',
      acceleration: 'faster',
      guidanceScale: 3.5, steps: 27,
    },
  }],
};
</script>

# WAN image generation

WAN is Alibaba's open video model family — and the same architecture generates images. The orchestrator exposes WAN's image-gen path via `engine: "wan"`, with the model version picked by the `version` field.

For video workloads, see [WAN video generation](./wan) — shares the engine, different operations.

| `version` | Notes |
|-----------|-------|
| `v2.2` | **Default** — stable fal.ai-hosted path. Exposes `steps` (default 27) and `acceleration` tier. Supports LoRAs. |
| `v2.2-5b` | 5B-parameter variant of v2.2 — lighter, exposes a `shift` parameter in addition to the base knobs. Default `steps: 40`. |
| `v2.5` | Newer v2.5 release on fal. Simpler knob set than v2.2. |
| `v2.7` | Latest release on fal. Simpler knob set than v2.2. |

**Default choice for new integrations**: `version: "v2.2"`, `provider: "fal"`. Step up to `v2.5` or `v2.7` when you want the newer output, drop to `v2.2-5b` for lower-cost generation with the `shift` control.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- No checkpoint URN — the ecosystem ships its own models per version

## v2.2 (default)

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "wan",
      "version": "v2.2",
      "provider": "fal",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "imageSize": "square_hd",
      "guidanceScale": 3.5,
      "steps": 27,
      "quantity": 1
    }
  }]
}
```

<RecipeRun :body="v22Body" :wait="60" />

### Parameters

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `version` | `v2.2` | `v2.2` / `v2.2-5b` / `v2.5` / `v2.7` | Required — picks the model variant. |
| `provider` | `fal` | `fal` | FAL is currently the only provider for WAN image gen. |
| `prompt` | — ✅ | ≥ 1 char | Natural-language works best. |
| `negativePrompt` | *(none)* | string | Optional. |
| `imageSize` | `square_hd` | `square_hd`, `square`, `portrait_4_3`, `portrait_16_9`, `landscape_4_3`, `landscape_16_9` (FAL-style enum) | Enum, not width/height. |
| `guidanceScale` | `3.5` | `1`–`10` | |
| `steps` | `27` | `2`–`40` | Only on `v2.2`. |
| `quantity` | `1` | `1`–`10` | |
| `seed` | random | int32 | |
| `enablePromptExpansion` | `false` | boolean | Model-side prompt expansion. |
| `enableSafetyChecker` | `false` | boolean | |
| `loras[]` | `[]` | array of `{ air, strength }` | LoRA support via the `ImageGenInputLora` shape — `{ "air": "urn:air:…", "strength": 1.0 }`. |

### With acceleration (`v2.2` only)

`v2.2` exposes an `acceleration` tier that trades a small quality hit for substantial speedups. Three levels — use `fast` for a good balance, `faster` when throughput matters more than fidelity:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "wan",
      "version": "v2.2",
      "provider": "fal",
      "prompt": "A cozy cabin in the woods at sunset",
      "imageSize": "square_hd",
      "acceleration": "faster",
      "guidanceScale": 3.5,
      "steps": 27
    }
  }]
}
```

<RecipeRun :body="v22FastBody" :wait="60" />

`acceleration` accepts `none` (default) / `fast` / `faster`.

## v2.2-5b (lightweight with shift control)

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "wan",
      "version": "v2.2-5b",
      "provider": "fal",
      "prompt": "A serene mountain landscape with a crystal clear lake at dawn",
      "imageSize": "landscape_16_9",
      "guidanceScale": 3.5,
      "steps": 40,
      "shift": 2
    }
  }]
}
```

<RecipeRun :body="v225bBody" :wait="60" />

Additional knob over `v2.2`:

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `shift` | `2` | `1`–`10` | Controls the WAN "shift" parameter — sampling shift factor. `2` is the tuned default; bumping higher produces smoother but sometimes softer output. |

Default `steps` is `40` (up from `27` on `v2.2`); max is `50`.

## v2.5 and v2.7 (newer releases, simpler knobs)

Both expose the base shared surface (`prompt`, `negativePrompt`, `imageSize`, `guidanceScale`, `quantity`, `seed`, `loras`, prompt-expansion / safety-checker toggles) without exposing `steps`, `acceleration`, or `shift`:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "wan",
      "version": "v2.5",
      "provider": "fal",
      "prompt": "A cinematic sci-fi cityscape at sunset, neon lighting",
      "imageSize": "landscape_16_9",
      "guidanceScale": 3.5
    }
  }]
}
```

<RecipeRun :body="v25Body" :wait="60" />

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "wan",
      "version": "v2.7",
      "provider": "fal",
      "prompt": "An epic fantasy dragon perched on a mountain peak at dawn",
      "imageSize": "landscape_16_9",
      "guidanceScale": 3.5
    }
  }]
}
```

<RecipeRun :body="v27Body" :wait="60" />

Pick `v2.7` for the latest, `v2.5` if you've validated it against your workload and want to pin to it.

## Reading the result

All WAN versions emit the standard `imageGen` output:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "imageGen",
    "status": "succeeded",
    "output": {
      "images": [
        { "id": "blob_...", "url": "https://.../signed.png" }
      ]
    }
  }]
}
```

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL.

## Runtime

FAL queue is the dominant factor. Typical wall times for `quantity: 1`:

| Version | Wall time (no acceleration) | With `acceleration: fast` / `faster` |
|---------|----------------------------|--------------------------------------|
| `v2.2` | 15–40 s | 7–15 s |
| `v2.2-5b` | 10–25 s | (no acceleration) |
| `v2.5` | 15–40 s | (no acceleration) |
| `v2.7` | 15–40 s | (no acceleration) |

Submit `wait=0` + poll for large `quantity` or busy FAL periods.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Flat per-image pricing by `version`, with LoRA usage doubling the base on `v2.2`:

```
total = base × quantity
```

| Version | Base (per image) | Notes |
|---------|------------------|-------|
| `v2.2` | **150** (no LoRA) / **300** (with LoRA) | LoRA-enabled endpoint roughly 2× the price. |
| `v2.2-5b` | **~100** | Lighter variant, lower cost. |
| `v2.5` | **~32.5** | Cheapest of the WAN image tiers. |
| `v2.7` | **~39** standard / **~97.5** pro | |

Examples:
- `v2.2`, `quantity: 1`, no LoRA → **~150 Buzz**
- `v2.2`, `quantity: 2`, with `loras: [{…}]` → ~600 Buzz
- `v2.5`, `quantity: 4` → ~130 Buzz
- `v2.7`, `quantity: 1` → **~39 Buzz**

Dimensions (`imageSize` enum), `steps`, and `acceleration` don't change the Buzz price — they affect runtime but the provider charges flat per-image per version.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "version must be one of" | Typo or using a WAN video version number | Use `v2.2`, `v2.2-5b`, `v2.5`, or `v2.7`. |
| `400` with "provider must be fal" | Other providers aren't exposed yet | Stick with `fal`. |
| `400` with "acceleration is not a valid property" | Only `v2.2` exposes `acceleration` | Remove the field on v2.5/v2.7/v2.2-5b. |
| `400` with "shift is not a valid property" | Only `v2.2-5b` exposes `shift` | Remove the field on other versions. |
| `400` with "imageSize must be one of" | Sent width/height like other ecosystems | WAN uses FAL's enum — pick `square_hd`, `landscape_16_9`, etc. Use a different engine (Flux 2, Qwen, etc.) if you need arbitrary dimensions. |
| LoRA has no effect | Wrong AIR URN, or incompatible ecosystem | WAN LoRAs must be tagged for the WAN ecosystem and compatible with the version you're running. |
| Request timed out (`wait` expired) | Large `quantity` or busy FAL queue | Resubmit with `wait=0` and poll. |
| Step `failed`, `reason = "blocked"` | Prompt hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [WAN video generation](./wan) — WAN for videoGen (same engine, different operation)
- [Flux 2](./flux2) / [Qwen](./qwen) / [SDXL](./sdxl) — open-weights / sdcpp alternatives with width/height control
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- Full parameter catalog: the `Wan22FalImageGenInput`, `Wan225bFalImageGenInput`, `Wan25FalImageGenInput`, `Wan27FalImageGenInput` schemas in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface
