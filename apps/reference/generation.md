---
title: Generation bridge reference
description: The field-level generation contract — the WorkflowBody union, the useBuzzWorkflow lifecycle (incl. cancel), and the BlockWorkflowSnapshot result — generated from the published SDK type JSDoc.
sources:
  - npm:@civitai/app-sdk@0.28.0/blocks#WorkflowBody
  - npm:@civitai/blocks-react@0.37.0#useBuzzWorkflow
---

# Generation bridge reference

This is the **field-level contract** for spending a viewer's Buzz on a
generation from a block: the `WorkflowBody` your block sends, the
`useBuzzWorkflow()` lifecycle that carries it (estimate → submit → poll →
**cancel**), and the `BlockWorkflowSnapshot` you get back.

The field tables below are generated from the **published** `@civitai/app-sdk`
and `@civitai/blocks-react` type definitions — the same JSDoc your editor shows
— so they can't drift from the packages you install. For the narrative version
(with worked img2img / LoRA examples and the page-vs-model rules) start with the
[text-to-image generation guide](../guide/text-to-image); for the ComfyUI recipe
path see [Comfy on Civitai](../guide/comfy-cloud).

Before you design against the field tables, read
[what the bridge can and cannot do](#what-the-bridge-can-and-cannot-do) — the
bridge is a **narrower surface than the orchestrator**, so orchestrator step
JSON can't be sent from a block, and reaching a model is a matter of naming the
right `modelVersionId` rather than describing an engine.

::: tip Trust model
`useBuzzWorkflow()` is **host-mediated**: the host resolves the viewer from the
block token and runs the estimate/submit/cancel on Civitai's side of the iframe
boundary, re-checking scope + budget every time. Your block never holds an
orchestrator credential.
:::

<BridgeReference />

## What the bridge can and cannot do

The generation bridge is a **deliberately narrower surface than the
orchestrator**, not a thin proxy in front of it. The body your block sends is a
**two-member discriminated union** keyed by `kind`, and anything outside those
two shapes is rejected at the wire schema — in the host, **before** any
orchestrator call is made.

The two members are the whole surface:

| `kind` | what it addresses | how you name the model |
|---|---|---|
| `textToImage` | a Civitai **checkpoint** | numeric `modelId` + `modelVersionId` |
| `customComfy` | a **server-registered** ComfyUI recipe | a registered `recipe` id |

::: danger Orchestrator step JSON cannot be sent from a block
If you have been handed an orchestrator **step** — a `$type` object shaped like
this:

```json
{
  "$type": "imageGen",
  "input": {
    "engine": "sdcpp",
    "ecosystem": "zImage",
    "model": "turbo",
    "operation": "createImage"
  }
}
```

— that is correct **for the orchestrator** and **unusable from a block**. The
bridge body has no `$type` field and no `imageGen` kind, and none of
`ecosystem` / `model` / `operation` / `engine` is how a block names a model.
Such a body fails the `kind` union before the host does anything else.

The symptom is distinctive: **every generation fails identically, on every
model**, with no per-model variation — because nothing model-specific ever ran.
If you are seeing "it fails on anything", check the body shape first.

Orchestrator step JSON belongs to the
[Orchestration REST API](/orchestration/), where *you* hold a Bearer token.
Blocks never hold one — see
[not to be confused with orchestration recipes](../guide/comfy-cloud#not-to-be-confused-with-orchestration-recipes).
:::

### "The model I want isn't reachable" — what to do

Most of the time it **is** reachable, and the fix is naming the right
`modelVersionId`. Work down this path:

1. **Is it a Civitai checkpoint?** — if it has a Civitai model version, use
   [`textToImage`](../guide/text-to-image) with its `modelId` +
   `modelVersionId`. Models that feel "orchestrator-only" usually aren't:
   Z-Image and Qwen are ordinary checkpoints with ordinary ids.
2. **Do you need an edit?** — pass a `sourceImage` **and** name the edit
   version (see the [worked example](#worked-example-qwen-single-image-edit)).
   The variant is chosen by `sourceImage`, not by the version id — this is the
   single most common mistake on the bridge.
3. **Is it genuinely outside the union?** — today that means **multi-image
   editing** (`sourceImage` is singular) and **background removal** (no union
   member reaches it). `customComfy` is the only other path, so this becomes a
   **registered recipe** question. Say so explicitly when you ask: both recipes
   today are prompt-only txt2img, so anything taking an **image input** is new
   ground, not a variation on an existing recipe.
4. **Recipes are not self-serve.** The registry is server-side and
   code-reviewed; there is no runtime, manifest, or dashboard way to add one.
   Adding a recipe is a **platform request** — ask through the same channel as
   beta access, described in
   [requesting a new recipe](../guide/comfy-cloud#requesting-a-new-recipe).

#### The ids you probably want

These are the checkpoints developers most often assume are out of reach. They
are not — they are normal `textToImage` targets:

| model | `modelId` | `modelVersionId` | use it for |
|---|---|---|---|
| Z Image Turbo | `2168935` | `2442439` | txt2img |
| Qwen — "Image Edit 2511" | `2268063` | `2558804` | **edit** (send a `sourceImage`) |
| Qwen — "fp8_e4m3fn" | `2268063` | `2552908` | txt2img |

::: warning The Qwen model name and its edit version disagree
Both Qwen versions live under **one** `modelId` (`2268063`), and the model is
named **"Qwen-Image-2512"** while its edit version is named **"Image Edit
2511"**. Reading `2512` off the model and treating it as the version you want
lands you on the txt2img version. The **edit** version is `2558804`.
:::

::: danger Omitting `sourceImage` silently switches you to a different MODEL
The workflow variant is derived from **whether `sourceImage` is present**, not
from the version id you name. Name the edit version but leave `sourceImage`
off, and the bridge builds a **`txt2img`** graph — and then, because the edit
version isn't valid for `txt2img`, it **re-maps your model to that version's
txt2img sibling** and generates with *that*. For Qwen, asking for `2558804`
without a source image gets you `2552908`. It does not warn you, and it does
not fail.

That is the worst failure mode available here, because it looks like success:
the workflow succeeds, images render, and nothing in the
`BlockWorkflowSnapshot` reports either substitution. You did not get a weaker
version of what you asked for — you got a **different model**, and the only
tell is that the output ignores your source image and doesn't behave like an
edit.

**The fix is in your body, not in a support request**: send `sourceImage`
whenever you mean to edit, and name the edit version (`2558804`) explicitly.
:::

#### Worked example: Qwen single-image edit

The case people get wrong. Note both halves: the **edit version id** *and* the
`sourceImage`. This is a **page app** — `sourceImage` is rejected on a
model-bound token.

```tsx
import { useBuzzWorkflow, useImageUpload } from '@civitai/blocks-react';
import type { WorkflowBodyTextToImage } from '@civitai/app-sdk/blocks';

// PAGE APP ONLY — `sourceImage` is rejected fail-closed on a model-bound token.
export function QwenEdit() {
  const { submit } = useBuzzWorkflow();
  const { open } = useImageUpload({ purpose: 'generationSource' });

  const run = async () => {
    const source = await open(); // Civitai-hosted { url, width, height }
    if (!source) return;

    const body: WorkflowBodyTextToImage = {
      kind: 'textToImage',
      modelId: 2268063,
      modelVersionId: 2558804, // "Image Edit 2511" — NOT the model's default
      sourceImage: { url: source.url, width: source.width, height: source.height },
      params: { prompt: 'make the sky stormy' },
    };
    await submit(body);
  };

  return <button onClick={run}>Edit image</button>;
}
```

Drop the `sourceImage` line and this silently becomes a txt2img generation.

### What `sourceImage` can and cannot do

`sourceImage` is the optional img2img / edit input on a `textToImage` body. Its
limits are structural, not tuning knobs:

- **One image, never several.** `sourceImage` is a **single**
  `{ url, width, height }` object, not an array. Multi-image editing — a
  reference plus a target, or compositing two inputs — is **not expressible**.
- **Civitai-hosted `https` URLs only.** `civitai.com`, `civitai.red`,
  `civitai.green` and their subdomains. An arbitrary remote URL is rejected.
- **Page apps only.** `sourceImage` is rejected fail-closed on a **model-bound**
  token, the same restriction `additionalResources` carries. See
  [page-vs-model constraints](../guide/text-to-image#page-vs-model-constraints).
- **You do not choose edit vs img2img — the checkpoint's ecosystem does.**
  Edit-capable ecosystems (Qwen, Qwen2, Seedream, NanoBanana, OpenAI, Flux2 and
  the Flux2-Klein variants) get an **`img2img:edit`** graph. SD-family
  ecosystems get plain **`img2img`** ("Image Variations") instead. A checkpoint
  whose ecosystem supports neither is rejected fail-closed. There is no body
  field that overrides this.

### Not supported today

Two things are genuinely out of reach, and they are the only two worth opening
a platform request for:

| Not available through the bridge | Where it stands |
|---|---|
| **Multi-image editing** (two or more inputs) | `sourceImage` is singular, and **no registered recipe takes an image input** — a platform request |
| **Background removal** (e.g. BiRefNet) | a **first-class orchestrator step**, not a Comfy graph and not an `imageGen` operation — **no union member reaches it** |

These are bounded by the union's shape, not by configuration:

| Constraint | What to do instead |
|---|---|
| `sourceImage` on a model-bound (`model.*`) block | build a **page app** |
| Shipping your own ComfyUI graph | never available — graphs stay server-side, by design |
| Choosing edit vs img2img yourself | it follows from the checkpoint's ecosystem; pick the checkpoint accordingly |

Note what is **not** on these lists: single-image editing and Z-Image both work
through `textToImage` today — see [the ids you probably
want](#the-ids-you-probably-want).

### The registered recipes

`customComfy` accepts only a **registered** recipe id — an unregistered id is
rejected at the union, before the recipe is resolved. Today there are exactly
**two**:

| `recipe` | what it does | `params` (`.strict()`) | per-generation Buzz ceiling |
|---|---|---|---|
| `seamless-pano-360` | 360° seamless panorama, fixed **2048×1024** | `{ prompt, seed?, engine?, accountType? }` — `engine` is one of `zimage-turbo`, `flux2-klein`, `qwen-image` | 90 / 150 / 180, by engine |
| `starter-comfy-txt2img` | single-step **Z-Image** txt2img, fixed **1024×1024** | `{ prompt, seed?, accountType? }` | 30 |

Both param schemas are `.strict()`: a field that isn't listed is rejected, not
ignored. Note what is **not** exposed — neither recipe takes `width` / `height`,
steps, or CFG. Those are fixed server-side (the starter recipe runs at the
Z-Image turbo defaults).

::: tip Don't reach for `starter-comfy-txt2img` to get Z-Image
It is a fixed-resolution, prompt-and-seed **demo starter**, not the Z-Image
path. For Z-Image generation use `textToImage` with `2168935` / `2442439`,
which gives you the full [param surface](#bridge-BlockTextToImageParams)
(dimensions, steps, sampler, quantity). Reach for the recipe only when you
want exactly what it does.
:::

## See also

- [What the bridge can and cannot do](#what-the-bridge-can-and-cannot-do) — the boundary vs the orchestrator, the ids for Z-Image and Qwen edit, and the two gaps that need a platform request.
- [Generation guide](../guide/text-to-image) — the narrative walkthrough (img2img, LoRAs, page-vs-model).
- [Comfy on Civitai (customComfy)](../guide/comfy-cloud) — the recipe-gated ComfyUI path.
- [Hooks reference](./hooks) — every `@civitai/blocks-react` hook.
- [Messages reference](./messages) — the `postMessage` protocol these hooks sit on.
