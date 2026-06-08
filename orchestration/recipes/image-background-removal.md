---
title: Background removal
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/cc67bd77-33f2-46e4-b7b9-5a44444e7572/original=true,quality=95,optimized=true/59852152.jpeg';

const recipeBody = { image: sampleImage };

const workflowBody = {
  steps: [{
    $type: 'imageBackgroundRemoval',
    input: { image: sampleImage, format: 'png' },
  }],
};

const webpBody = {
  steps: [{
    $type: 'imageBackgroundRemoval',
    input: { image: sampleImage, format: 'webp' },
  }],
};

const heroPrompt = 'A studio portrait of a corgi on a plain grey backdrop';
const chainBody = {
  steps: [
    {
      $type: 'imageGen',
      name: 'hero',
      input: { engine: 'flux2', model: 'klein', operation: 'createImage', modelVersion: '4b', prompt: heroPrompt, width: 1024, height: 1024 },
    },
    {
      $type: 'imageBackgroundRemoval',
      name: 'cutout',
      input: {
        image: { $ref: 'hero', path: 'output.images[0].url' },
        format: 'png',
      },
    },
  ],
};
</script>

# Background removal

The `imageBackgroundRemoval` step takes an image and returns it with the background removed — the subject is isolated on a transparent canvas. It runs [BiRefNet](https://github.com/ZhengPeng7/BiRefNet) (high-accuracy dichotomous image segmentation) under the hood, with edge refinement via mask-guided blur fusion for clean hair and fine detail.

Output is **PNG by default** so the alpha channel is preserved; choose `webp` for smaller files (WebP also supports transparency). The model is fixed — there's nothing to pick, just point it at an image.

Common uses:

- Product shots and catalog images (drop subjects onto any background)
- Cutouts for compositing, stickers, or avatars
- Cleaning up generated images (chain `imageGen` → `imageBackgroundRemoval`)

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A source image — URL, data URL, or Base64 string

## The simplest request

Use the per-recipe endpoint when you're isolating one subject and don't need webhooks or multi-step chaining:

```http
POST https://orchestration.civitai.com/v2/consumer/recipes/imageBackgroundRemoval?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "image": "https://image.civitai.com/.../59852152.jpeg"
}
```

<RecipeRun :body="recipeBody" path="/v2/consumer/recipes/imageBackgroundRemoval" :wait="60" />

The default output is a transparent PNG. The response is a full [`Workflow`](/orchestration/reference/operations/GetWorkflow) whose single step carries the cutout blob.

## Via the generic workflow endpoint

Equivalent request through [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — use this path when you need webhooks, tags, or to chain with other steps:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "imageBackgroundRemoval",
    "input": {
      "image": "https://image.civitai.com/.../59852152.jpeg",
      "format": "png"
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
| `format` | | `png` | Output format: `png` or `webp`. Both preserve transparency; PNG is lossless, WebP is smaller. |

### Choosing a format

- **`png`** (default) — lossless, universally supported, the safe choice for cutouts that get re-composited.
- **`webp`** — noticeably smaller files at near-identical quality, with the same alpha-channel support. Reach for it when you're serving cutouts directly to a browser or storing many of them.

WebP example:

<RecipeRun :body="webpBody" :wait="60" />

## Chaining: generate then cut out

A common two-step workflow — generate a subject, then strip the background in the same submission:

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
        "prompt": "A studio portrait of a corgi on a plain grey backdrop",
        "width": 1024,
        "height": 1024
      }
    },
    {
      "$type": "imageBackgroundRemoval",
      "name": "cutout",
      "input": {
        "image": { "$ref": "hero", "path": "output.images[0].url" },
        "format": "png"
      }
    }
  ]
}
```

The `{ "$ref": "hero", "path": "output.images[0].url" }` reference creates a dependency — `cutout` doesn't start until `hero` succeeds, and its `image` field is filled in with the generated image's signed URL at runtime. See [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism) for the full reference syntax.

<RecipeRun :body="chainBody" />

## Reading the result

A successful step emits a single image blob — the cutout, with a transparent background:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "imageBackgroundRemoval",
    "status": "succeeded",
    "output": {
      "image": {
        "id": "blob_...",
        "url": "https://.../signed.png",
        "width": 1024,
        "height": 1024
      }
    }
  }]
}
```

Note the output field is `image` (singular) — the step always returns exactly one blob. Its dimensions match the source image.

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) to get a fresh URL.

::: tip Result caching
`imageBackgroundRemoval` is deterministic: the same source image and `format` always produce the same blob. The orchestrator caches the result, so repeated identical calls skip re-processing and return the cached blob immediately.
:::

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Cost tracks measured processing time, billed at ~10 Buzz per 8 seconds of compute. Runtime is **floor-dominated** — the BiRefNet mask runs at a fixed resolution, so the price barely moves with image size:

```
estimatedSeconds = 4.7 + 0.6 × (width × height / 1_000_000)
buzz             = round(estimatedSeconds × 10 / 8)   // min 1
```

| Input size | ~Megapixels | ~Runtime | ~Buzz |
|-------|------|------|------|
| 512×512 | 0.26 | ~6 s | **6** |
| 1024×1024 | 1.0 | ~6 s | **7** |
| 1600×1600 | 2.6 | ~6 s | **8** |
| 2200×2200 | 4.8 | ~8 s | **10** |
| 3072×3072 | 9.4 | ~10 s | **13** |

Format choice (`png` vs `webp`) does not affect cost. Use `whatif=true` for an exact preview.

## Runtime

Background removal runs in **roughly 5–10 seconds** on the fleet, with negligible queue time (under a second when capacity is available). The BiRefNet mask runs at a fixed resolution, so runtime is **floor-dominated** — measured at ~6 s for a 0.26 MP image and only ~10 s for a 9.4 MP image (≈ `4.7 s + 0.6 s/MP`). Even large inputs finish well inside `wait=60`, so a single long-poll `POST …?wait=60` is all you need; expect a few seconds of run-to-run variance from cold model load and worker queueing.

Because the result is cached, an identical repeat submission returns instantly. When you're submitting from a backend that can't hold the connection open, register a webhook and submit with `wait=0` instead.

::: info Measured via the equivalent workflow
These figures were measured by running the exact BiRefNet graph this step builds on the production fleet, across input sizes from 512×512 to 3072×3072. The `imageBackgroundRemoval` endpoint routes the same graph to the same workers; first-day per-endpoint timings may sit slightly higher until capacity warms up.
:::

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "image could not be loaded" | URL not publicly reachable, or data URL malformed | Make sure the URL is fetchable without auth; re-encode the Base64 payload. |
| Background tinge / halo around the subject | Low-contrast or busy background where the matte is ambiguous | BiRefNet handles most images well; for stubborn edges, pre-crop closer to the subject. |
| Output isn't transparent when opened | Viewer flattened the alpha, or you re-encoded to a format without alpha downstream | Keep `format: png` (or `webp`); avoid converting to JPEG, which has no alpha channel. |
| Step `failed`, `reason = "blocked"` | Source image hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`InvokeImageBackgroundRemovalStepTemplate`](/orchestration/reference/operations/InvokeImageBackgroundRemovalStepTemplate) — the per-recipe endpoint
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageBackgroundRemoval/openapi.yaml) — standalone OpenAPI 3.1 YAML for this endpoint, ready to import into Postman / Insomnia / OpenAPI Generator
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — generic path for chaining
- [Image conversion](./convert-image) — resize / re-encode the cutout, or strip metadata
- [Image upscaling](./image-upscaler) — enlarge before or after removing the background
- [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism) — how the `$ref` references work
