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
path see [Comfy Cloud](../guide/comfy-cloud).

Before you design against the field tables, read
[what the bridge can and cannot do](#what-the-bridge-can-and-cannot-do) — the
bridge is a **narrower surface than the orchestrator**, and the models it can
reach are bounded by that.

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

Work down this path:

1. **Is it a Civitai checkpoint?** — does it have a Civitai model version you
   can point at by id? If yes, use
   [`textToImage`](../guide/text-to-image) with its `modelId` +
   `modelVersionId`. That path addresses a checkpoint and nothing else.
2. **Is it not a checkpoint?** — models that have no Civitai model version to
   name **cannot be expressed by `textToImage` at all**. **Z-Image Turbo** and
   **Qwen Image Edit** are both in this category: the orchestrator selects them
   by ecosystem / model / version, not by a Civitai model version id, so there
   is no id for your body to carry.
3. **Do you need something `textToImage` can't express?** — multi-image
   editing, a specific edit-model version, a multi-stage pipeline, or a task
   that isn't image generation at all. `customComfy` is the only other path, so
   this becomes a **registered recipe** question. Say what you need explicitly
   when you ask: both recipes today are prompt-only txt2img, so anything taking
   an **image input** is new ground, not a variation on an existing recipe.
4. **Recipes are not self-serve.** The registry is server-side and
   code-reviewed; there is no runtime, manifest, or dashboard way to add one.
   Adding a recipe is a **platform request** — ask through the same channel as
   beta access, described in
   [requesting a new recipe](../guide/comfy-cloud#requesting-a-new-recipe).

::: danger A checkpoint AIR does not select an edit model — it silently returns the wrong one
You **cannot pin an edit-model version** (for example Qwen `2511`) through
`textToImage`. Passing a checkpoint AIR in the hope of selecting one **does not
error**: it quietly falls back to txt2img `2512` and returns plausible-looking
images from a model you did not ask for.

This is the worst failure mode on the bridge because it looks like success —
the workflow succeeds, the images render, and nothing in the snapshot says the
model was substituted. If you need a specific edit-model version, it has to be
pinned by a `customComfy` recipe.
:::

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

Stated plainly, so you can rule an idea in or out quickly:

| Not available through the bridge | Where it stands |
|---|---|
| Multi-image editing (two or more inputs) | `sourceImage` is singular, and **no registered recipe takes an image input** — a platform request |
| Pinning an edit-model version (e.g. Qwen `2511`) | not expressible in `textToImage`; a recipe would have to pin it — a platform request |
| Background removal (e.g. BiRefNet) | **no bridge path at all today** — it is not an image-generation step |
| Non-checkpoint models via `textToImage` | not expressible — there is no model version id to name |
| `sourceImage` on a model-bound (`model.*`) block | build a **page app** instead |
| Shipping your own ComfyUI graph | never — graphs stay server-side, by design |

Apart from the last row, everything here funnels to the same place: **use a
checkpoint through `textToImage`**, or **ask for a recipe**.

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

So `starter-comfy-txt2img` is a genuine **Z-Image** path from a block — but a
fixed-resolution, prompt-and-seed one, not a general-purpose Z-Image API. If
your app needs a different resolution or a different model, that is a new
recipe, which is a platform request.

## See also

- [What the bridge can and cannot do](#what-the-bridge-can-and-cannot-do) — the boundary vs the orchestrator, and how to ask for what isn't reachable.
- [Generation guide](../guide/text-to-image) — the narrative walkthrough (img2img, LoRAs, page-vs-model).
- [Comfy Cloud (customComfy)](../guide/comfy-cloud) — the recipe-gated ComfyUI path.
- [Hooks reference](./hooks) — every `@civitai/blocks-react` hook.
- [Messages reference](./messages) — the `postMessage` protocol these hooks sit on.
