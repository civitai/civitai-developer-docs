---
title: Image background removal
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/e4a8f395-8166-44a8-82b1-bb0901c10aa3/original=true,quality=90,optimized=true/19325406.jpeg';

const recipeBody = { image: sampleImage };

const workflowBody = {
  steps: [{
    $type: 'imageBackgroundRemoval',
    input: { image: sampleImage, format: 'webp' },
  }],
};

const heroPrompt = 'Product photo of a vintage camera on a cluttered wooden desk';
const chainBody = {
  steps: [
    {
      $type: 'imageGen',
      name: 'hero',
      input: { engine: 'flux2', model: 'klein', operation: 'createImage', modelVersion: '4b', prompt: heroPrompt, width: 1024, height: 1024 },
    },
    {
      $type: 'imageBackgroundRemoval',
      name: 'hero-cutout',
      input: {
        image: { $ref: 'hero', path: 'output.images[0].url' },
      },
    },
  ],
};
</script>

# Image background removal

The `imageBackgroundRemoval` step type takes an image and returns the same image with its background removed, as a transparent-background cutout. Segmentation runs on [BiRefNet](https://github.com/ZhengPeng7/BiRefNet) on Civitai's Comfy workers, with blur-fusion foreground estimation to clean up edge fringing — no model selection or tuning knobs to worry about.

Common uses:

- Product shots and profile pictures — isolate the subject for compositing
- Sticker / thumbnail pipelines (chain `imageGen` → `imageBackgroundRemoval`)
- Preparing cutouts for downstream layout tools that expect an alpha channel

## Prerequisites

- A source image — URL, data URL, or Base64 string

## The simplest request

Use the per-recipe endpoint when you're processing one image and don't need webhooks or multi-step chaining:

```http
POST https://orchestration.civitai.com/v2/consumer/recipes/imageBackgroundRemoval
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "image": "https://image.civitai.com/.../00890-23.jpeg"
}
```

<RecipeRun :body="recipeBody" path="/v2/consumer/recipes/imageBackgroundRemoval" :wait="60" />

The defaults produce a PNG with the alpha channel carrying the cutout. The recipe endpoint responds with the step's output object directly — the `image` blob described in [Reading the result](#reading-the-result).

## Via the generic workflow endpoint

The same request through [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow), for webhooks, tags or chaining:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageBackgroundRemoval",
    "input": {
      "image": "https://image.civitai.com/.../00890-23.jpeg",
      "format": "webp"
    }
  }]
}
```

<RecipeRun :body="workflowBody" :wait="60" />

## Input fields

See the [`ImageBackgroundRemovalInput` schema](/orchestration/reference/operations/InvokeImageBackgroundRemovalStepTemplate) for the full definition.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `image` | ✅ | — | URL, data URL, or raw Base64 string. Civitai CDN URLs work directly. |
| `format` | | `png` | `png` or `webp`. Both preserve the alpha channel; WebP produces smaller files. |

The segmentation mask is computed at 1024×1024 and upscaled to the source resolution, so extremely fine detail (individual hairs, fur wisps) on very large sources resolves at the mask's precision, not the source's. The foreground pass runs at full source resolution.

## Chaining: generate then cut out

Produce an image and strip its background in a single submission:

```json
{
  "steps": [
    {
      "$type": "imageGen",
      "name": "hero",
      "input": {
        "engine": "flux2",
        "model": "klein",
        "operation": "createImage",
        "modelVersion": "4b",
        "prompt": "Product photo of a vintage camera on a cluttered wooden desk",
        "width": 1024,
        "height": 1024
      }
    },
    {
      "$type": "imageBackgroundRemoval",
      "name": "hero-cutout",
      "input": {
        "image": {
          "$ref": "hero",
          "path": "output.images[0].url"
        }
      }
    }
  ]
}
```

`hero-cutout` waits for `hero` to succeed; the `$ref` then fills its `image` with the generated image's signed URL ([Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism)).

<RecipeRun :body="chainBody" />

To resize the cutout or convert its format, chain an [Image conversion](./convert-image) step after this one.

## Reading the result

A successful `imageBackgroundRemoval` step emits a single image blob. Through [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) / [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) it arrives inside the workflow envelope shown below; the per-recipe endpoint returns the inner `output` object on its own.

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "imageBackgroundRemoval",
    "status": "succeeded",
    "output": {
      "image": {
        "id": "blob_....png",
        "width": 512,
        "height": 768,
        "available": true,
        "url": "https://.../signed.png",
        "urlExpiresAt": "2027-07-16T17:25:34.0666142Z"
      }
    }
  }]
}
```

Fields:

- **`image`** — the cutout blob (singular — the step always returns exactly one image). `width` and `height` match the source image; background removal never resizes.
- **`available`** — `false` until the worker has uploaded the result; on a terminal `succeeded` workflow it's `true`.

Blob URLs expire — see [Reading results](/orchestration/recipes/#reading-results).

## Runtime

Execution is dominated by a fixed cost: the segmentation mask always runs at 1024×1024 regardless of source size, so wall time moves only slightly with resolution — roughly 5 s of GPU execution plus ~0.6 s per megapixel of source, before queue and container overhead. A single request returns well within the request timeout.

Resubmitting the same image + format typically serves the previous output from cache — see [Workflows → Result caching](/orchestration/guide/workflows#result-caching).

## Cost

Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

Cost tracks estimated runtime, which is floor-dominated — source resolution moves the price only slightly:

```
megapixels = width × height / 1 000 000
buzz       = max(1, round((4.7 + 0.6 × megapixels) × 10 / 8))
```

| Shape | Buzz |
|-------|------|
| 512×768 source | **6** |
| 1024×1024 source | 7 |
| 2048×2048 source | 9 |
| 4096×4096 source | 18 |

The `format` choice doesn't affect the Buzz price.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "Input image failed to download from URL." | URL not publicly reachable, or data URL malformed | Make sure the URL is fetchable without auth; re-encode the Base64 payload. |
| `400` with "The JSON value could not be converted to … ImageBackgroundRemovalFormat" | `format` outside `png` / `webp` | Use one of the two supported values; chain [Image conversion](./convert-image) for other formats. |
| `400` with "missing required properties including: 'image'" | Empty or misspelled body | `image` is the only required field. |
| Halo or soft edges around fine detail (hair, fur) | Mask precision is capped at 1024×1024 | Expected on very large sources; downscale before submitting if the cutout will be displayed small anyway. |
| Request timed out (`wait` expired) | Busy queue | Resubmit via [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) with `wait=0` and poll, or use a [webhook](/orchestration/guide/results-and-webhooks). |

## Related

- [`InvokeImageBackgroundRemovalStepTemplate`](/orchestration/reference/operations/InvokeImageBackgroundRemovalStepTemplate) — the per-recipe endpoint
- [`imageBackgroundRemoval` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageBackgroundRemoval/openapi.yaml)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) (generic path, for chaining) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Image conversion](./convert-image) — resize the cutout or convert formats
- [Image upscaling](./image-upscaler) — enlarge before or after cutting out
- [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism) — how the `$ref` references work
