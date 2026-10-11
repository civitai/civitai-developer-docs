---
title: MAI Image 2.5 image generation
---

<script setup>
const basicBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'maiImage',
      operation: 'createImage',
      prompt: 'A photorealistic portrait of a woman with flowers in her hair, golden hour lighting',
      aspectRatio: '1:1',
    },
  }],
};

const autoBody = {
  steps: [{
    $type: 'imageGen',
    input: {
      engine: 'fal',
      model: 'maiImage',
      operation: 'createImage',
      prompt: 'A majestic dragon soaring through clouds at sunset, highly detailed, fantasy art',
      aspectRatio: 'auto',
    },
  }],
};

const batchBody = {
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

# MAI Image 2.5 image generation

MAI Image 2.5 is Microsoft's text-to-image model, hosted through FAL. The orchestrator exposes it as a single `engine: "fal"`, `model: "maiImage"`, `operation: "createImage"` entry — text-to-image only, with no editing, seed, or style-reference inputs.

**Default choice**: leave `aspectRatio` at `"auto"` and let the model pick a composition-appropriate ratio, or pin one of the eleven supported ratios when you need a specific shape.

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
      "model": "maiImage",
      "operation": "createImage",
      "prompt": "A photorealistic portrait of a woman with flowers in her hair, golden hour lighting",
      "aspectRatio": "1:1"
    }
  }]
}
```

<RecipeRun :body="basicBody" :wait="60" />

### Parameters

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `prompt` | ✅ | — | 3–5000 characters. Natural-language prompts work well. |
| `aspectRatio` | | `"auto"` | One of `auto` / `21:9` / `16:9` / `3:2` / `4:3` / `5:4` / `1:1` / `4:5` / `3:4` / `2:3` / `9:16`. `auto` lets the model choose. MAI returns a fixed resolution per ratio — no width/height. |
| `quantity` | | `1` | `1`–`4`. MAI bills each image separately; quantities > 1 fan out to parallel FAL calls. |
| `outputFormat` | | `"jpeg"` | `jpeg` / `png` / `webp`. |

MAI Image does **not** accept negative prompts, seeds, LoRAs, style references, or explicit width/height — use the [Krea](./krea), [Qwen](./qwen), or [Flux 2](./flux2) recipes if you need any of those.

## Auto aspect ratio

Omit `aspectRatio` (or set it to `"auto"`) to let MAI choose a ratio that suits the prompt:

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "fal",
      "model": "maiImage",
      "operation": "createImage",
      "prompt": "A majestic dragon soaring through clouds at sunset, highly detailed, fantasy art",
      "aspectRatio": "auto"
    }
  }]
}
```

<RecipeRun :body="autoBody" :wait="60" />

## Batch generation

Set `quantity` up to `4` for multiple images from one step. Each image is a separate FAL call (and a separate charge), run in parallel:

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

<RecipeRun :body="batchBody" :wait="60" />

## Reading the result

Standard `imageGen` output: an `images[]` array, one entry per `quantity` ([shape and URL expiry](/orchestration/recipes/#reading-results)).

## Runtime

Single images typically land well inside the `wait=60` long-poll window, so a single `wait=60` POST covers the common case. A `quantity: 4` batch fans out to parallel calls but can still push toward the 100-second request timeout on busy FAL queues — submit those with `wait=0` and poll, or register a webhook.

## Cost

Preview the exact charge with `whatif=true` ([Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz)).

MAI bills a flat rate per generated image:

```
total = 65 × quantity
```

| Shape | Buzz |
|-------|------|
| Default (`quantity: 1`) | **65** |
| Batch of 4 (`quantity: 4`) | 260 |

Aspect ratio and output format don't affect MAI's Buzz price — the provider charges flat per image.

## Troubleshooting

Timeouts, moderation blocks and expired blob URLs: see [Common troubleshooting](/orchestration/recipes/#common-troubleshooting).

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "prompt" length error | Prompt under 3 or over 5000 characters | Keep the prompt within 3–5000 characters. |
| `400` with "aspectRatio must be one of" | Invalid aspect ratio | Pick one of the listed ratios (or `auto`) — MAI doesn't accept width/height. |
| `400` with "quantity" range error | `quantity` outside `1`–`4` | MAI caps batches at 4 images per step. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) · [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [Krea v2](./krea) / [Qwen](./qwen) image generation — sibling FAL-hosted text-to-image families (Qwen adds editing and LoRAs)
- [Flux 2](./flux2) / [Flux 1](./flux1) image generation — open-weights families with LoRA support
- [Image upscaling](./image-upscaler) — chain after `imageGen` for higher-res output
- [Prompt enhancement](./prompt-enhancement) — LLM-rewrite a prompt before feeding it in via `$ref`
- Full parameter catalog: `MaiImageCreateFalImageGenInput` in the [API reference](/orchestration/reference/)
- [`imageGen` OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml)
