---
title: Enums
description: Valid enum values used across the Civitai site API.
---

# Enums

```
GET /api/v1/enums
```

**Auth:** Public.

Returns the current set of enum values used elsewhere in the site API — model
types, file types, base models, and their sub-types. Call this endpoint to
discover valid values for query params like `types=` and `baseModels=` on
[`GET /models`](./models), rather than hardcoding lists.

### Response

```json
{
  "ModelType": [
    "Checkpoint", "TextualInversion", "Hypernetwork", "AestheticGradient",
    "LORA", "LoCon", "DoRA", "Controlnet", "Upscaler", "MotionModule",
    "VAE", "Poses", "Wildcards", "Workflows", "Detection", "Other"
  ],
  "ModelFileType": [
    "Model", "Text Encoder", "Pruned Model", "Negative",
    "Training Data", "VAE", "Config", "Archive"
  ],
  "ActiveBaseModel": [
    "Flux.1 D", "Flux.2 D", "SDXL 1.0", "Illustrious",
    "Qwen", "Wan Video 2.2 T2V-A14B", "ZImageTurbo", "..."
  ],
  "BaseModel": [
    "SD 1.5", "SD 2.1", "SD 3.5", "SDXL 1.0", "Flux.1 D",
    "Illustrious", "Pony", "Hunyuan Video", "..."
  ],
  "BaseModelType": [
    "Standard", "Inpainting", "Refiner", "Pix2Pix"
  ]
}
```

Only the shape is guaranteed above — the list contents change as Civitai
adds support for new model families. Always fetch live values rather than
baking them into clients.

### Key distinctions

- **`ModelType`** — the kind of artifact (checkpoint vs. LoRA vs. VAE, etc.). Use as the `types=` filter on `GET /models`.
- **`ModelFileType`** — the role of a file *within* a model version (main model, VAE, text encoder, training data). Appears as `files[].type`.
- **`BaseModel`** — every base model Civitai has ever catalogued. Use as `baseModels=` when filtering.
- **`ActiveBaseModel`** — the subset of `BaseModel` that Civitai's on-site generation currently supports. If you're building around Orchestration workflows, filter to these.
- **`BaseModelType`** — sub-classification of a base model (e.g. Standard vs. Inpainting SDXL). Appears as `baseModelType` on model versions.

### Example

```bash
curl "https://civitai.com/api/v1/enums" | jq '.ModelType'
```
