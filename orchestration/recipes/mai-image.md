---
title: MAI Image image generation
---

<script setup>
const createBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'maiImage27',
      operation: 'createImage',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      imageSize: 'portrait_4_3',
    },
  }],
};

const flashBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'maiImage27',
      operation: 'createImage',
      variant: 'flash',
      prompt: 'Wide alpine valley with a lake and a wooden pier, photorealistic',
      imageSize: 'landscape_16_9',
      resolution: '2K',
    },
  }],
};

const editBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'maiImage27',
      operation: 'editImage',
      prompt: 'Make the teapot bright blue.',
      images: ['https://storage.googleapis.com/falserverless/example_inputs/nano-banana-edit-input.png'],
    },
  }],
};

const v25Body = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'maiImage',
      operation: 'createImage',
      prompt: 'An astronaut riding a horse on Mars, dramatic lighting',
      aspectRatio: '9:16',
      quantity: 4,
    },
  }],
};
</script>

# MAI Image image generation

MAI Image is Microsoft's image model family, hosted through FAL. The orchestrator exposes two generations under `engine: "fal"`:

- **MAI Image 2.7** (`model: "maiImage27"`): text-to-image (`createImage`) and editing with up to five images (`editImage`), in a `standard` or cheaper `flash` variant. Preset sizes at 1K or 2K, custom dimensions, and transparent backgrounds. Billed from the provider's token usage.
- **MAI Image 2.5** (`model: "maiImage"`): text-to-image with eleven aspect ratios at a flat per-image price.

**Default choice**: `maiImage27` with the default `standard` variant. Switch to `variant: "flash"` for drafts and high-volume work: it costs about a third as much and returns in about half the time.

## MAI Image 2.7 text-to-image

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "maiImage27",
      "operation": "createImage",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "imageSize": "portrait_4_3"
    }
  }]
}
```

<RecipeRun :body="createBody" :wait="60" />

### Parameters

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `prompt` | ✅ | — | 3–5000 characters. For edits, describe the change. |
| `variant` | | `"standard"` | `standard` or `flash`. Same inputs; Flash is cheaper and faster. |
| `imageSize` | | `"square_hd"` (`"auto"` for edits) | A preset from the table below. Edits also accept `auto`, which picks a size close to the first image. |
| `resolution` | | `"1K"` | `1K` (about 1 MP) or `2K` (each side of the preset doubled). Ignored for custom dimensions. |
| `width` / `height` | | — | Custom size; overrides `imageSize`. Set both, as multiples of 16, each side at least 768 and at most 4,194,304 pixels in total. |
| `background` | | `"opaque"` | `transparent` requires `png` or `webp` output. |
| `quantity` | | `1` | `1`–`4`. Each image is a separate, parallel FAL call. |
| `outputFormat` | | `"jpeg"` | `jpeg` / `png` / `webp`. |

Preset sizes at `1K`; `2K` doubles each side (for example `landscape_16_9` becomes 2720×1536):

| `imageSize` | Size | `imageSize` | Size |
|-------------|------|-------------|------|
| `square_hd` | 1024×1024 | | |
| `landscape_4_3` | 1024×768 | `portrait_4_3` | 768×1024 |
| `landscape_3_2` | 1152×768 | `portrait_3_2` | 768×1152 |
| `landscape_16_9` | 1360×768 | `portrait_16_9` | 768×1360 |

MAI Image 2.7 does **not** accept negative prompts, seeds, LoRAs, or style references.

## Flash variant

Add `variant: "flash"` to any 2.7 request. This one renders at 2K:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "maiImage27",
      "operation": "createImage",
      "variant": "flash",
      "prompt": "Wide alpine valley with a lake and a wooden pier, photorealistic",
      "imageSize": "landscape_16_9",
      "resolution": "2K"
    }
  }]
}
```

<RecipeRun :body="flashBody" :wait="60" />

## Editing

Use `operation: "editImage"` with one to five `images` (URLs, data URLs or Base64). The prompt can refer to all of them, such as "place the product from the first image on the table in the second". With the default `imageSize: "auto"`, the output follows the first image; set a preset or custom size to change the shape. On edits a custom size is a target, and the model may return a nearby size.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "maiImage27",
      "operation": "editImage",
      "prompt": "Make the teapot bright blue.",
      "images": ["https://storage.googleapis.com/falserverless/example_inputs/nano-banana-edit-input.png"]
    }
  }]
}
```

<RecipeRun :body="editBody" :wait="60" />

Source images are scaled down to fit within 2048×2048 before they are sent, and their transparency is dropped.

## MAI Image 2.5

`model: "maiImage"` takes an `aspectRatio` instead of a size: `auto` (the default, letting the model choose) or one of `21:9` / `16:9` / `3:2` / `4:3` / `5:4` / `1:1` / `4:5` / `3:4` / `2:3` / `9:16`. MAI returns a fixed resolution per ratio, with no width/height. `quantity` (`1`–`4`) and `outputFormat` work as above.

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "maiImage",
      "operation": "createImage",
      "prompt": "An astronaut riding a horse on Mars, dramatic lighting",
      "aspectRatio": "9:16",
      "quantity": 4
    }
  }]
}
```

<RecipeRun :body="v25Body" :wait="60" />

## Reading the result

Standard `imageGen` output: an `images[]` array, one entry per `quantity` ([shape and URL expiry](/orchestration/recipes/#reading-results)). Each entry reports the delivered image's actual `width` and `height`.

## Runtime

A 2.7 standard image takes about 30 s and a Flash image about 15 s; 2.5 is similar to 2.7 standard. Single images fit inside `wait=60`. A `quantity: 4` batch runs in parallel but can outlast your HTTP client's timeout on busy FAL queues, so submit those with `wait=0` and poll, or register a webhook.

## Cost

Preview the charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)). Non-members pay an extra 2 Buzz per image for `png` output and 1 for `webp`.

### MAI Image 2.7

FAL bills 2.7 by tokens, and edit input images scale the price, so the step reserves an estimate and **settles at FAL's actual charge plus 30%** once the images are delivered. The final charge usually lands within a Buzz of the `whatif` preview.

Images count one token per 1024 pixels, for the output and for each edit input (after the 2048×2048 fit). Prompts count about one token per four characters. Each image in a `quantity` is billed separately, inputs included.

| USD per million tokens | Text input | Image input | Image output |
|------------------------|-----------:|------------:|-------------:|
| `standard` | 5 | 8 | 34 |
| `flash` | 1.75 | 2.5 | 10 |

```
buzz per image ≈ 1.3 × 1000 × (outputTokens × out + inputTokens × in + promptTokens × text) / 1,000,000
```

| Request | Buzz per image |
|---------|------:|
| Standard, 1K square | 46 |
| Standard, 2K square | 182 |
| Flash, 1K square | 14 |
| Flash, 2K `landscape_16_9` | 54 |
| Standard edit, one 1 MP source, `auto` | 56 |
| Flash edit, five sources (about 9 MP in total), 2K `portrait_4_3` | 66 |

### MAI Image 2.5

A flat rate per generated image, whatever the aspect ratio:

```
total = 65 × quantity
```

## Troubleshooting

Timeouts, moderation blocks and expired blob URLs: see [Common troubleshooting](/orchestration/recipes/#common-troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` "Set width and height together." | Only one custom dimension set | Send both, or neither and use `imageSize`. |
| `400` "Custom dimensions must be multiples of 16…" | Size not a multiple of 16, or over 4,194,304 pixels | Round down to a multiple of 16 and stay within the pixel limit. |
| `400` "Transparent backgrounds require PNG or WebP output." | `background: "transparent"` with `jpeg` | Set `outputFormat` to `png` or `webp`. |
| `400` "MAI Image 2.7 outputs JPEG, PNG or WebP." | `gif` or `svg` requested | Use one of the three supported formats. |
| `400` on `imageSize` for `createImage` | `auto` sent for text-to-image | `auto` is edit-only; pick a preset. |
| `400` on `images` length | More than five edit images | Send one to five images. |
| `400` with "aspectRatio must be one of" (2.5) | Invalid ratio, or width/height sent | Use a listed ratio or `auto`. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Krea v2](./krea) / [Qwen](./qwen) image generation: sibling FAL-hosted families (Qwen adds LoRAs)
- [Flux 2](./flux2) / [Flux 1](./flux1) image generation: open-weights families with LoRA support
- [Image upscaling](./image-upscaler): chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement): LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: `MaiImage27CreateFalImageGenInput`, `MaiImage27EditFalImageGenInput` and `MaiImageCreateFalImageGenInput` in the [API reference](/orchestration/reference/)
- [`imageGen` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml)
