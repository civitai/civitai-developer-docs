---
title: Ideogram image generation
---

<script setup>
const teapot = 'https://storage.googleapis.com/falserverless/example_inputs/nano-banana-edit-input.png';
const pattern = 'https://storage.googleapis.com/falserverless/example_inputs/nano-banana-edit-input-2.png';

const createBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'ideogram46',
      operation: 'createImage',
      prompt: 'A cozy bookshop storefront with a sign reading OPEN LATE, evening light',
      imageSize: 'landscape_16_9',
    },
  }],
};

const transparentBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'ideogram46',
      operation: 'createImage',
      prompt: 'A single red apple sticker, isolated',
      quality: 'low',
      background: 'transparent',
      outputFormat: 'png',
    },
  }],
};

const editBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'ideogram46',
      operation: 'editImage',
      prompt: 'Paint the teapot with the pattern of the second image',
      images: [teapot, pattern],
      quality: 'low',
    },
  }],
};

const boxBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'ideogram46',
      operation: 'editImage',
      prompt: 'Make the teapot emerald green',
      images: [teapot],
      editPrecision: 'high',
      contextWindowBox: { xMin: 320, yMin: 768, xMax: 704, yMax: 1024 },
      quality: 'low',
    },
  }],
};
</script>

# Ideogram image generation

Ideogram 4.6 is Ideogram's image model, hosted through FAL and known for accurate text in images. The orchestrator exposes it as `engine: "fal"`, `model: "ideogram46"`:

| `operation` | Best for | Notes |
|-------------|----------|-------|
| `createImage` | **Default** — text-to-image | Model-picked ~2K size or presets/custom up to 4096 per side, transparent backgrounds, one to eight images. |
| `editImage` | Editing a source image, with up to four references | Regular edits restyle the whole image; high-precision edits restore unchanged pixels and can be limited to a masked or boxed region at the source resolution. |

**Default choice**: `createImage` at the default `medium` quality and `imageSize: "auto"`. Drop to `low` or `very_low` for drafts; use `high` when fine detail or dense text matters.

The previous generation is still available as `model: "ideogram45"` ([`Ideogram45CreateFalImageGenInput`](/orchestration/reference/), [`Ideogram45EditFalImageGenInput`](/orchestration/reference/)); new integrations should use 4.6.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- For edits: publicly reachable source and reference image URLs (or data URLs / Base64), and optionally a mask

## Text-to-image

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "ideogram46",
      "operation": "createImage",
      "prompt": "A cozy bookshop storefront with a sign reading OPEN LATE, evening light",
      "imageSize": "landscape_16_9"
    }
  }]
}
```

<RecipeRun :body="createBody" :wait="60" />

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `enhancePrompt` | | `true` | Let Ideogram expand the prompt. Set `false` to render it as written. |

### Transparent backgrounds

Set `background: "transparent"` for an image with an alpha channel, such as stickers, logos and cut-outs. It requires `png` or `webp` output. `"opaque"` forces a solid background; leave it unset for the model default.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "ideogram46",
      "operation": "createImage",
      "prompt": "A single red apple sticker, isolated",
      "quality": "low",
      "background": "transparent",
      "outputFormat": "png"
    }
  }]
}
```

<RecipeRun :body="transparentBody" :wait="60" />

## Editing

`images` takes one to five images: the first is the source, the rest are references the prompt can refer to. With the default `imageSize: "auto"` the output keeps the source size.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "ideogram46",
      "operation": "editImage",
      "prompt": "Paint the teapot with the pattern of the second image",
      "images": [
        "https://storage.googleapis.com/falserverless/example_inputs/nano-banana-edit-input.png",
        "https://storage.googleapis.com/falserverless/example_inputs/nano-banana-edit-input-2.png"
      ],
      "quality": "low"
    }
  }]
}
```

<RecipeRun :body="editBody" :wait="60" />

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `images` | ✅ | — | 1–5 images. The first is the source; at most three references when a `mask` is set. |
| `mask` | | *(none)* | Same size as the source. Black is edited, white is preserved; it must contain both. |
| `editPrecision` | | `"regular"` | `high` restores every pixel the edit didn't change. |
| `contextWindow` | | `"none"` | `high` only. `auto` edits a region fitted around the `mask` instead of the whole image. |
| `contextWindowBox` | | *(none)* | `high` only. The region to edit as `{ xMin, yMin, xMax, yMax }` in source pixels (`xMax`/`yMax` exclusive): at least 256 pixels per side, at most 4,194,304 pixels, at most 6:1. Not combinable with `contextWindow: "auto"`. |

Regular edits accept `imageSize` presets, custom `width`/`height` and `background`. Masked and high-precision edits always keep the source geometry.

### Region edits at full resolution

A high-precision edit without a region works on the whole image, downscaled to at most 4,194,304 pixels. Set `contextWindow: "auto"` with a `mask`, or a `contextWindowBox`, to edit only that region: the output keeps the source resolution and every pixel outside the region.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "ideogram46",
      "operation": "editImage",
      "prompt": "Make the teapot emerald green",
      "images": ["https://storage.googleapis.com/falserverless/example_inputs/nano-banana-edit-input.png"],
      "editPrecision": "high",
      "contextWindowBox": { "xMin": 320, "yMin": 768, "xMax": 704, "yMax": 1024 },
      "quality": "low"
    }
  }]
}
```

<RecipeRun :body="boxBody" :wait="60" />

## Common parameters

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `prompt` | ✅ | — | 1–10000 characters. For edits, describe the change. |
| `quality` | | `"medium"` | `very_low` / `low` / `medium` / `high`. `very_low` renders at most 4,194,304 pixels. |
| `imageSize` | | `"auto"` | `auto` (about 2K for text-to-image, the source size for edits) or a preset below. |
| `width` / `height` | | *(none)* | Custom size; overrides `imageSize`. Set both, as multiples of 32 between 256 and 4096, at most 6:1. |
| `background` | | *(none)* | `transparent` or `opaque`; see [Transparent backgrounds](#transparent-backgrounds). |
| `quantity` | | `1` | `1`–`8` images in one call. |
| `seed` | | random | Reuse to reproduce a result. |
| `outputFormat` | | `"jpeg"` | `jpeg` / `png` / `webp`. |

| `imageSize` | Size | `imageSize` | Size |
|-------------|------|-------------|------|
| `square` | 512×512 | `square_hd` | 1024×1024 |
| `landscape_4_3` | 1024×768 | `portrait_4_3` | 768×1024 |
| `landscape_16_9` | 1024×576 | `portrait_16_9` | 576×1024 |

With `auto`, text-to-image picks both the size and the aspect ratio (for example 2048×2048, 2496×1664 or 1824×2272). Set a preset or a custom size when the shape matters.

Ideogram 4.6 does **not** accept negative prompts, LoRAs or style references.

## Reading the result

Standard `imageGen` output: an `images[]` array with one entry per `quantity` ([shape and URL expiry](/orchestration/recipes/#reading-results)). Each entry reports the delivered image's actual `width` and `height`.

## Runtime

Single images took 8–25 s in testing, with `very_low` edits fastest and larger or higher-quality images slowest, so one `wait=60` request usually returns the result. Re-issue `GET /v2/consumer/workflows/{id}?wait=60` if it comes back unfinished, or use [webhooks](/orchestration/guide/results-and-webhooks) for backend integrations. These timings were measured before the production rollout and will be revised.

## Cost

Preview the charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)). The step reserves the estimate below and **settles at FAL's actual charge plus 30%** once the images are delivered; in testing the two matched.

Each image is priced by quality, and outputs above 4,194,304 pixels (2048×2048) cost more. An edit with `imageSize: "auto"` is the size of its source, except that `very_low` and whole-image high-precision edits are downscaled to the lower tier.

| Buzz per image | `very_low` | `low` | `medium` | `high` |
|----------------|-----------:|------:|---------:|-------:|
| Text-to-image, up to 4,194,304 pixels | 10.4 | 39 | 78 | 130 |
| Text-to-image, larger | — | 78 | 156 | 260 |
| Edit, up to 4,194,304 pixels | 10.4 | 39 | 78 | 286 |
| Edit, larger | — | 78 | 260 | 780 |

```
total = buzzPerImage × quantity
```

Non-members pay an extra 2 Buzz per image for `png` output and 1 for `webp`.

## Troubleshooting

Timeouts, moderation blocks and expired blob URLs: see [Common troubleshooting](/orchestration/recipes/#common-troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` "Set width and height together." | Only one custom dimension set | Send both, or neither and use `imageSize`. |
| `400` "Custom dimensions must be multiples of 32…" | Size not a multiple of 32, or wider than 6:1 | Round to a multiple of 32 and keep the ratio within 6:1. |
| `400` "very_low quality renders at most 4,194,304 pixels." | `very_low` with a larger custom size | Use `low` or higher, or a smaller size. |
| `400` "Transparent backgrounds require PNG or WebP output." | `background: "transparent"` with `jpeg` | Set `outputFormat` to `png` or `webp`. |
| `400` "Masked and high-precision edits require imageSize auto…" | Preset or custom size on a masked or `high` edit | Remove `imageSize`, `width` and `height`. |
| `400` "Masked edits accept at most three references…" | Five images plus a mask | Send at most four images with a mask. |
| `400` "Backgrounds apply to regular edits only." | `background` with `editPrecision: "high"` | Drop `background`, or use a regular edit. |
| `400` "Context windows require editPrecision high." | `contextWindow` or `contextWindowBox` on a regular edit | Set `editPrecision: "high"`. |
| `400` "contextWindow auto requires a mask." | `contextWindow: "auto"` without `mask` | Add a mask, or use `contextWindowBox`. |
| `400` "contextWindowBox must be at least 256 pixels per side…" | Box too small, too large or too narrow | Enlarge or reshape the box. |
| Step fails on a masked edit | Mask size differs from the source, or it is all black or all white | Export the mask at the source size with both regions. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [MAI Image](./mai-image) / [Krea v2](./krea) / [Seedream](./seedream) image generation: other hosted image models
- [OpenAI image generation](./openai): GPT Image, also strong at text in images
- [Image background removal](./image-background-removal): cut out an existing image instead of generating a transparent one
- [Prompt enhancement](./prompt-enhancement): LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: `Ideogram46CreateFalImageGenInput` and `Ideogram46EditFalImageGenInput` in the [API reference](/orchestration/reference/)
- [`imageGen` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml)
