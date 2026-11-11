---
title: MiniMax H3 Image (ComfyUI)
---

# MiniMax H3 Image (ComfyUI)

Use an `imageGen` step with `engine: "comfy"` and `ecosystem: "h3-image"` to generate or edit images. This uses the pruned INT8 H3 Image checkpoint and NVFP4 text encoder by default.

## Generate an image

```json
{
  "steps": [{
    "$type": "imageGen",
    "input": {
      "engine": "comfy",
      "ecosystem": "h3-image",
      "operation": "createImage",
      "prompt": "A studio photograph of a glossy red ceramic teapot beside two yellow lemons on a pale blue tablecloth.",
      "width": 2048,
      "height": 2048,
      "seed": 42,
      "steps": 6,
      "cfgScale": 1,
      "sampler": "euler",
      "scheduler": "simple",
      "outputFormat": "png"
    }
  }]
}
```

Submit this body to `POST /v2/consumer/workflows`. Sampling fields are optional: omitting them keeps the six-step workflow above.

| Setting | Default | Accepted values |
| --- | --- | --- |
| `steps` | `6` | Integer from 1 to 150 |
| `cfgScale` | `1` | Number from 1 to 30 |
| `sampler` | `"euler"` | Shared Comfy sampler enum, for example `"heun"` or `"euler_ancestral"` |
| `scheduler` | `"simple"` | `"normal"`, `"karras"`, `"exponential"`, `"sgm_uniform"`, `"simple"`, `"ddim_uniform"`, `"beta"` |

These controls also apply to `editImage`. The default checkpoint is distilled for six steps with CFG 1; higher values or different samplers do not guarantee better results. CFG above 1 adds an extra model evaluation per sampling step.

## Edit an image

Set `operation` to `"editImage"` and supply `images`, an ordered list of 1–16 reference image URLs. Refer to them as `<Picture 1>`, `<Picture 2>`, and so on in the prompt:

```json
{
  "engine": "comfy",
  "ecosystem": "h3-image",
  "operation": "editImage",
  "prompt": "Change the teapot in <Picture 1> to cobalt blue, preserving the composition and lighting.",
  "images": ["https://example.com/teapot.png"],
  "steps": 8,
  "cfgScale": 1.5,
  "sampler": "heun",
  "scheduler": "normal"
}
```

Both operations support `quantity` (1–4), `loras` (LoRA AIR to strength), and an optional compatible H3 Image `diffusionModel` AIR. Omit `diffusionModel` or set it to `null` for the default checkpoint. The text encoder and VAE remain fixed.

Canvas sides must be multiples of 32 between 512 and 8192, with total area between 4,194,304 and 20,971,520 pixels. The default is 2048 × 2048.

## Pricing

At default sampling, generation costs 20 Buzz per 2048 × 2048 output, scaled by pixel count. Editing adds 15 Buzz per reference image per output. This subtotal scales by `steps / 6` and doubles when `cfgScale` is above 1. Existing discounts and output-format, priority, and resource charges still apply. Use `?whatif=true` for a quote.

For example, at 2048 × 2048, 12 steps with CFG 1 costs 40 Buzz before those adjustments; 12 steps with CFG 1.5 costs 80 Buzz.

For video, see [MiniMax H3 (ComfyUI) video generation](./minimax-h3-comfy).
