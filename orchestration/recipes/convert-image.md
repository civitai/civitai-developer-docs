---
title: Image conversion
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const jpegBody = {
  steps: [{
    $type: 'convertImage',
    input: {
      image: sampleImage,
      output: { format: 'jpeg', quality: 85 },
    },
  }],
};

const resizeBody = {
  steps: [{
    $type: 'convertImage',
    input: {
      image: sampleImage,
      transforms: [{ type: 'resize', targetWidth: 512 }],
      output: { format: 'webp', quality: 85 },
    },
  }],
};

const blurRegionBody = {
  steps: [{
    $type: 'convertImage',
    input: {
      image: sampleImage,
      transforms: [{
        type: 'blur', blur: 60, mode: 'include',
        regions: [{ x1: 50, y1: 50, x2: 400, y2: 400 }],
      }],
      output: { format: 'jpeg', quality: 85 },
    },
  }],
};

const blurFullBody = {
  steps: [{
    $type: 'convertImage',
    input: {
      image: sampleImage,
      transforms: [{ type: 'blur', blur: 40, mode: 'exclude', regions: [] }],
      output: { format: 'jpeg', quality: 85 },
    },
  }],
};

const pngBody = {
  steps: [{
    $type: 'convertImage',
    input: {
      image: sampleImage,
      output: { format: 'png', hideMetadata: true },
    },
  }],
};
</script>

# Image conversion

`convertImage` is a utility step for format conversion, resizing, and blurring. It applies zero or more transforms in order, then encodes the result to the requested format. Cost is a flat **1 Buzz** regardless of image size, number of transforms, or output format.

## The request shape

```json
{
  "$type": "convertImage",
  "input": {
    "image":      "https://...",       // source — URL, data URL, or Base64
    "transforms": [ /* optional */ ],  // resize / blur — applied in order
    "output":     { "format": "jpeg" } // required — format + per-format settings
  }
}
```

`transforms` is optional (omit to change format or settings only). `output` is required.

## Examples

### Format conversion

Convert any image to JPEG:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "convertImage",
    "input": {
      "image": "https://image.civitai.com/.../source.png",
      "output": { "format": "jpeg", "quality": 85 }
    }
  }]
}
```

<RecipeRun :body="jpegBody" :wait="60" />

### Resize then convert

Resize to a target width (aspect ratio preserved) and encode to WebP:

```json
{
  "$type": "convertImage",
  "input": {
    "image": "https://...",
    "transforms": [{ "type": "resize", "targetWidth": 512 }],
    "output": { "format": "webp", "quality": 85 }
  }
}
```

<RecipeRun :body="resizeBody" :wait="60" />

### Region blur

Blur one or more rectangular areas — useful for privacy masking:

```json
{
  "$type": "convertImage",
  "input": {
    "image": "https://...",
    "transforms": [{
      "type": "blur",
      "blur": 60,
      "mode": "include",
      "regions": [
        { "x1": 50, "y1": 50, "x2": 400, "y2": 400 }
      ]
    }],
    "output": { "format": "jpeg", "quality": 85 }
  }
}
```

`mode: "include"` blurs only inside the regions; the rest stays sharp. `mode: "exclude"` blurs everything *except* the regions — use it to protect a subject while blurring the background.

<RecipeRun :body="blurRegionBody" :wait="60" />

### Full-image blur

`mode: "exclude"` with an empty `regions` array blurs the entire image (nothing is excluded):

```json
{
  "type": "blur",
  "blur": 40,
  "mode": "exclude",
  "regions": []
}
```

<RecipeRun :body="blurFullBody" :wait="60" />

### PNG with metadata stripped

```json
{
  "$type": "convertImage",
  "input": {
    "image": "https://...",
    "output": { "format": "png", "hideMetadata": true }
  }
}
```

<RecipeRun :body="pngBody" :wait="60" />

## Transforms reference

Transforms run in array order. You can chain multiple transforms — for example, resize first and then blur.

### `resize`

| Field | Default | Notes |
|-------|---------|-------|
| `type` | — ✅ | Must be `"resize"`. |
| `targetWidth` | *(none)* | Target width in pixels, 1–4096. Height is calculated to preserve aspect ratio. |

### `blur`

| Field | Default | Notes |
|-------|---------|-------|
| `type` | — ✅ | Must be `"blur"`. |
| `blur` | — ✅ | Gaussian blur intensity, 1–100. |
| `mode` | — ✅ | `"include"` — blur only inside regions. `"exclude"` — blur everywhere except regions. |
| `regions` | `[]` | Pixel-coordinate rectangles `{ x1, y1, x2, y2 }`. With `mode: "exclude"` and no regions, the entire image is blurred. With `mode: "include"` and no regions, nothing is blurred. |

## Output formats reference

### `jpeg`

| Field | Default | Notes |
|-------|---------|-------|
| `format` | — ✅ | `"jpeg"` |
| `quality` | `85` | 1–100. Higher = better quality, larger file. |
| `hideMetadata` | `false` | Strip EXIF and other metadata. |

### `png`

| Field | Default | Notes |
|-------|---------|-------|
| `format` | — ✅ | `"png"` |
| `hideMetadata` | `false` | Strip metadata. |

PNG is lossless — no quality setting.

### `webp`

| Field | Default | Notes |
|-------|---------|-------|
| `format` | — ✅ | `"webp"` |
| `quality` | `85` | 1–100. Applies only when `lossless: false`. |
| `lossless` | `false` | Enable lossless WebP compression. |
| `maxFrames` | `null` | Cap frame count for animated sources. Set to `1` to extract only the first frame. |
| `hideMetadata` | `false` | Strip metadata. |

### `gif`

| Field | Default | Notes |
|-------|---------|-------|
| `format` | — ✅ | `"gif"` |
| `maxFrames` | `null` | Cap frame count. Set to `1` to extract the first frame. |
| `hideMetadata` | `false` | Strip metadata. |

::: tip JPEG and PNG with animated sources
JPEG and PNG are inherently single-frame. Animated source images (GIF, animated WebP) are automatically reduced to the first frame when encoding to these formats — there is no `maxFrames` field to set. Use WebP or GIF output to preserve animation.
:::

## Reading the result

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "convertImage",
    "status": "succeeded",
    "output": {
      "blob": {
        "id": "blob_...",
        "url": "https://.../signed.jpg",
        "width": 512,
        "height": 342
      }
    }
  }]
}
```

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL.

::: tip Result caching
`convertImage` is deterministic: the same source image, transforms, and output settings always produce the same blob. The orchestrator caches the result, so repeated identical calls skip re-processing and return the cached blob immediately.
:::

## Cost

Flat **1 Buzz** per step — regardless of source image size, number of transforms, or output format.

## Chaining with other steps

`convertImage` is most useful as a post-processing step. Chain it after `imageGen` using `$ref` to reference the previous step's output:

```json
{
  "steps": [
    {
      "name": "gen",
      "$type": "imageGen",
      "input": {
        "engine": "flux2",
        "prompt": "A photorealistic cat sitting in a sunny garden"
      }
    },
    {
      "name": "convert",
      "$type": "convertImage",
      "input": {
        "image": { "$ref": "gen.output.images[0].url" },
        "transforms": [{ "type": "resize", "targetWidth": 1024 }],
        "output": { "format": "webp", "quality": 90 }
      }
    }
  ]
}
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "output is required" | Missing `output` field | `output` is always required — include at minimum `{ "format": "jpeg" }`. |
| `400` with "targetWidth out of range" | Value outside 1–4096 | Clamp to 1–4096. |
| `400` with "blur out of range" | Value outside 1–100 | Clamp to 1–100. |
| `400` with "mode is required" | Blur transform sent without `mode` | `mode` is required on `blur` — set `"include"` or `"exclude"`. |
| Output height different from expected | `resize` maintains aspect ratio | Only `targetWidth` is specified; height is derived from the original aspect ratio. |
| Animated source collapsed to one frame | JPEG or PNG output requested | These formats are single-frame; use WebP or GIF output to preserve animation. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Image upscaling](./image-upscaler) — chain upscaling before `convertImage` for high-res output in a target format
- [Image background removal](./image-background-removal) — produce a transparent cutout, then chain `convertImage` to resize or re-encode it
- [Prompt enhancement](./prompt-enhancement) — another 1-Buzz utility step
