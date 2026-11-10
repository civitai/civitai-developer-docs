---
title: MiniMax H3 image generation
---

<script setup>
const create = {
  steps: [{ $type: 'imageGen', input: {
    engine: 'minimax-h3-image', model: 'standard',
    prompt: 'A blue ceramic teapot on a wooden table, soft morning light',
    resolution: '2K', aspectRatio: '16:9', outputFormat: 'png',
  } }],
};
const highspeed = {
  steps: [{ $type: 'imageGen', input: {
    engine: 'minimax-h3-image', model: 'highspeed',
    prompt: 'A red lighthouse overlooking calm blue water',
    resolution: '1K', aspectRatio: '1:3', quantity: 2,
    disablePromptEnhancement: true, outputFormat: 'webP',
  } }],
};
const edit = {
  steps: [{ $type: 'imageGen', input: {
    engine: 'minimax-h3-image',
    prompt: 'Turn the scene into a watercolor painting with soft blue tones',
    images: ['https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg'],
    width: 2720, height: 1536, outputFormat: 'jpeg',
  } }],
};
const comfyCreate = {
  steps: [{ $type: 'imageGen', input: {
    engine: 'comfy', ecosystem: 'h3-image', operation: 'createImage',
    prompt: 'A blue ceramic teapot on a wooden table, soft morning light',
    width: 2048, height: 2048, seed: 42, outputFormat: 'png',
  } }],
};
const comfyEdit = {
  steps: [{ $type: 'imageGen', input: {
    engine: 'comfy', ecosystem: 'h3-image', operation: 'editImage',
    prompt: 'Turn the scene in image 1 into a watercolor painting with soft blue tones',
    images: edit.steps[0].input.images,
    width: 2048, height: 2048, seed: 42, outputFormat: 'png',
  } }],
};
</script>

# MiniMax H3 image generation

Use `engine: "minimax-h3-image"` for MiniMax's hosted H3 image models. Choose `model: "standard"` (default) or `"highspeed"`. Both support text-to-image and editing with up to 16 reference images.

H3 Image supports hosted API and Comfy execution. Their selectors are separate from [H3 video](./minimax-h3):

| Model | Hosted API | Comfy |
| --- | --- | --- |
| H3 Image | `engine: "minimax-h3-image"` | `engine: "comfy"`, `ecosystem: "h3-image"` |
| H3 video | `engine: "minimax-h3"` | `engine: "minimax-h3-comfy"` |

The hosted API controls and pricing below apply to `minimax-h3-image`. See [Comfy H3 Image](#comfy-h3-image) for the local model's controls and Buzz pricing.

## Generate an image

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "minimax-h3-image",
      "model": "standard",
      "prompt": "A blue ceramic teapot on a wooden table, soft morning light",
      "resolution": "2K",
      "aspectRatio": "16:9",
      "outputFormat": "png"
    }
  }]
}
```

<RecipeRun :body="create" :wait="0" />

Highspeed accepts the same controls:

<RecipeRun :body="highspeed" :wait="0" />

## Edit images

Add `images` with 1–16 source-image URLs, data URLs, or Base64 strings. Reference order is preserved; prompts can refer to “image 1”, “image 2”, and so on. Omit `images` for text-to-image.

<RecipeRun :body="edit" :wait="0" />

References must have sides between 128 and 8192 pixels and an aspect ratio between 1:4 and 4:1. Use a URL for large files: reference downloads support up to 64 MiB, while inline source images have the platform's 32 MiB limit including Base64 overhead. MiniMax supports JPEG, PNG, WebP, HEIC and HEIF references. Edits always use prompt enhancement; masks and transparent backgrounds are not supported.

## Size and output controls

| Field | Default | Supported values |
| --- | --- | --- |
| `prompt` | Required | Up to 32,000 characters |
| `model` | `standard` | `standard`, `highspeed` |
| `quantity` | `1` | 1–10 images |
| `resolution` | `4K` | `1K`, `2K`, `4K` target pixel area |
| `aspectRatio` | `auto` | `auto`, or `X:Y` with integers 1–300 and a ratio from 1:3 to 3:1 |
| `width`, `height` | Automatic | Exact dimensions; set both and omit `resolution` and `aspectRatio` |
| `disablePromptEnhancement` | `false` | Text-to-image only; requires exact dimensions or a fixed aspect ratio |
| `outputFormat` | `jpeg` | `jpeg`, `png`, `webP` |

Resolution presets target 1024², 2048² or 4096² pixels. They describe area rather than the longest edge: `2K` at `16:9` produces 2720×1536; `4K` at `3:1` produces 7104×2368. Every integer ratio within the supported range is accepted, including `1:1`, `3:4`, `9:16`, `21:9`, and `3:1`.

Exact dimensions must total 655,360–20,000,000 pixels with an aspect ratio between 1:3 and 3:1. They are sent without rounding or resizing. When sizing is automatic, the completed output reports the actual dimensions. With prompt enhancement disabled, only roughly the first 4096 prompt tokens influence generation.

## Pricing and completion

The initial Buzz quote is an estimate. Final generation cost uses MiniMax's reported text-input, reference-image and image-output token usage, converted at 1500 Buzz per USD. Normal image-format and priority charges also apply.

| Model | Text input, USD/million tokens | Image input | Image output |
| --- | --- | --- | --- |
| Standard | 2.30 | 1.50 | 3.80 |
| Highspeed | 2.30 | 3.00 | 7.60 |

The 50% launch discount applies to qualifying outputs of at least 16,600,000 pixels before November 17, 2026 at 16:00 UTC. Final usage includes prompt-enhancement costs, so there is no fixed per-image price. See [MiniMax pricing](https://platform.minimax.io/docs/pricing/overview).

If part of a batch fails, the workflow returns the successful images and describes failed items in `errors`; generation and format charges cover successful images. Ambiguous generation failures are not automatically resubmitted because MiniMax may still finish and bill the original request.

See the [API reference](/orchestration/reference/) for `MiniMaxH3ImageGenInput` and [MiniMax's image guide](https://platform.minimax.io/docs/guides/image-generation) for provider details.

## Comfy H3 Image

Use `engine: "comfy"` with `ecosystem: "h3-image"`. Set `operation: "createImage"` for text-to-image or `"editImage"` with 1–16 ordered references in `images`.

<RecipeRun :body="comfyCreate" :wait="0" />

<RecipeRun :body="comfyEdit" :wait="0" />

Comfy uses the pruned INT8 image model and NVFP4 text encoder. It supports seeds, LoRAs and an optional `diffusionModel` checkpoint AIR; omission or `null` selects the default checkpoint. It uses six sampling steps and the prompt as supplied.

Set explicit `width` and `height`, each a multiple of 32 between 512 and 8192, with a total area from 4 × 1024² through 20 × 1024² pixels. The default is 2048×2048; `quantity` supports 1–4 images. Hosted API controls such as `model`, `resolution`, `aspectRatio` and `disablePromptEnhancement` do not apply to Comfy.

Generation starts at 20 Buzz per 2048×2048 output, scaling with pixel area, plus 15 Buzz per reference per output. Existing quantity discounts, output-format charges and priority charges also apply. This pricing is separate from the hosted API's token-based billing.
