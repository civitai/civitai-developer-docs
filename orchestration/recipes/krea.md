---
title: Krea v2 image generation
---

<script setup>
const sampleStyleRef = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const mediumBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'krea2',
      operation: 'createImage',
      size: 'medium',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      aspectRatio: '1:1',
      creativity: 'medium',
    },
  }],
};

const largeBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'krea2',
      operation: 'createImage',
      size: 'large',
      prompt: 'An epic fantasy battle scene with dragons, cinematic lighting, intricate details',
      aspectRatio: '16:9',
      creativity: 'high',
    },
  }],
};

const styleRefBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'krea2',
      operation: 'createImage',
      size: 'medium',
      prompt: 'A serene mountain landscape with the same artistic style',
      aspectRatio: '3:2',
      creativity: 'medium',
      imageStyleReferences: [
        { imageUrl: sampleStyleRef, strength: 1.0 },
      ],
    },
  }],
};
</script>

# Krea v2 image generation

Krea v2 is Krea's text-to-image family, hosted through FAL. The orchestrator exposes both tiers — **medium** for fast everyday generation and **large** for higher-quality hero shots — under a single `engine: "fal"`, `model: "krea2"` entry, with a `size` field selecting the tier.

**Default choice for new integrations**: `size: "medium"`. Step up to `size: "large"` when quality matters more than throughput or cost.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- For `imageStyleReferences`: one or more publicly-accessible image URLs

## Tiers

| `size` | FAL endpoint | Best for |
|--------|--------------|----------|
| `medium` (default) | `krea/v2/medium/text-to-image` | Fast iteration, lower cost |
| `large` | `krea/v2/large/text-to-image` | Higher-fidelity output for hero shots |

Both tiers accept exactly the same input shape.

## Text-to-image — medium

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "krea2",
      "operation": "createImage",
      "size": "medium",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "aspectRatio": "1:1",
      "creativity": "medium"
    }
  }]
}
```

<RecipeRun :body="mediumBody" :wait="60" />

### Parameters

| Field | Default | Range | Notes |
|-------|---------|-------|-------|
| `prompt` | — ✅ | 1–5000 chars | Natural-language prompts work well. |
| `size` | `"medium"` | `"medium"` / `"large"` | Picks the FAL tier and pricing. |
| `aspectRatio` | `"1:1"` | `1:1` / `4:3` / `3:2` / `16:9` / `2.35:1` / `4:5` / `2:3` / `9:16` | Krea returns a fixed-resolution image per ratio — no width/height. |
| `creativity` | `"medium"` | `raw` / `low` / `medium` / `high` | Higher creativity gives Krea more interpretive license; `raw` follows the prompt most literally. |
| `quantity` | `1` | `1`–`10` | Krea has no native batch — quantities > 1 fan out to parallel FAL calls. |
| `seed` | random | uint32 | Pin for reproducibility. The same seed is used for every image in a `quantity` batch (matches the FAL-Qwen2 path). |
| `imageStyleReferences` | `[]` | up to 10 items | See [Style references](#style-references) below. Triggers a small price premium. |

Krea v2 does **not** accept LoRAs, negative prompts, or explicit width/height — use the [Flux 2](./flux2) or [Qwen](./qwen) recipes if you need any of those.

## Text-to-image — large

Swap `size` to `"large"` for the higher-quality tier. The input shape is identical:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "krea2",
      "operation": "createImage",
      "size": "large",
      "prompt": "An epic fantasy battle scene with dragons, cinematic lighting, intricate details",
      "aspectRatio": "16:9",
      "creativity": "high"
    }
  }]
}
```

<RecipeRun :body="largeBody" :wait="60" />

## Style references

Pass up to **10** reference images to nudge Krea toward a specific visual style. Each entry needs an `imageUrl` (publicly fetchable) and an optional `strength` from `-2.0` to `2.0` (default `1.0`). Negative strengths *repel* from the reference style — useful for stylistic exclusion.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "krea2",
      "operation": "createImage",
      "size": "medium",
      "prompt": "A serene mountain landscape with the same artistic style",
      "aspectRatio": "3:2",
      "creativity": "medium",
      "imageStyleReferences": [
        { "imageUrl": "https://image.civitai.com/.../reference.jpeg", "strength": 1.0 }
      ]
    }
  }]
}
```

<RecipeRun :body="styleRefBody" :wait="60" />

Style references trigger a small price premium — see [Cost](#cost).

## Reading the result

Krea emits the standard `imageGen` output — an `images[]` array with one entry per `quantity`:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "imageGen",
    "status": "succeeded",
    "output": {
      "images": [
        { "id": "blob_...", "url": "https://.../signed.jpeg" }
      ]
    }
  }]
}
```

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL.

## Runtime

| Tier | Typical wall time per image | `wait` recommendation |
|------|----------------------------|-----------------------|
| `medium` | 5–15 s | `wait=60` is comfortable for `quantity: 1` |
| `large` | 15–40 s | `wait=60` usually fine; fall back to `wait=0` on busy periods |

Large `quantity` pushes toward the 100-second request timeout — submit with `wait=0` and poll.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

| Tier | Without style refs | With `imageStyleReferences` |
|------|--------------------|----------------------------|
| `medium` | **39 Buzz / image** | **45.5 Buzz / image** |
| `large` | **78 Buzz / image** | **84.5 Buzz / image** |

Total = `base × quantity`. Style references add a flat 6.5 Buzz / image regardless of how many references are attached.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "size must be one of" | Typo in `size` | Lowercase `"medium"` or `"large"` — no other values are accepted. |
| `400` with "aspectRatio must be one of" | Invalid aspect ratio | Pick one of the listed ratios — Krea doesn't accept width/height. |
| `400` with "creativity must be one of" | Invalid creativity level | Use `raw`, `low`, `medium`, or `high` — case-sensitive. |
| `400` with "imageStyleReferences maxItems" | More than 10 references | Trim the array to ≤ 10. |
| `400` with "strength out of range" | `strength` outside `[-2, 2]` | Krea clamps to `[-2.0, 2.0]`; default `1.0` is a safe baseline. |
| Style reference fetch fails | URL is private or expired | Krea fetches each `imageUrl` server-side from FAL — make sure it's publicly reachable. |
| Output ignores the prompt | `creativity` too high | Drop to `low` or `raw` for stricter prompt adherence. |
| Request timed out (`wait` expired) | Large `quantity` or busy FAL queue | Resubmit with `wait=0` and poll. |
| Step `failed`, `reason = "blocked"` | Prompt or reference image hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Flux 2](./flux2) / [Flux 1](./flux1) image generation — alternative open-weights families with LoRA support
- [Qwen](./qwen) image generation — when you need editing or LoRAs
- [MAI Image 2.5](./mai-image) image generation — sibling FAL-hosted text-to-image (no editing, seeds, or style refs)
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: `Krea2CreateFalImageGenInput` in the [API reference](/orchestration/reference/)
- [`imageGen` endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml) — standalone OpenAPI 3.1 YAML covering the full `imageGen` surface
