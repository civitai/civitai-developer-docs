---
title: Generation bridge reference
description: The field-level generation contract — the WorkflowBody union, the useBuzzWorkflow lifecycle (incl. cancel), and the BlockWorkflowSnapshot result — generated from the published SDK type JSDoc.
sources:
  - npm:@civitai/app-sdk@0.31.0/blocks#WorkflowBody
  - npm:@civitai/blocks-react@0.39.0#useBuzzWorkflow
---

# Generation bridge reference

This is the **field-level contract** for spending a viewer's Buzz on a
generation from a block: the `WorkflowBody` your block sends, the
`useBuzzWorkflow()` lifecycle that carries it (estimate → submit → **watch** →
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

::: warning The generated `customComfy` entry below is recipe-arm only
The field tables in this section are generated from the **published** SDK's type
JSDoc, and the published SDK has not caught up to `customComfy`'s **inline** arm.
Its `WorkflowBodyCustomComfy` entry therefore describes the recipe shape alone,
and still states that a block never sends a ComfyUI graph. That is true of the
recipe arm; it is **not** true of the bridge as a whole — see
[the inline arm](../guide/comfy-cloud#the-inline-arm-ship-your-own-graph), which
carries the graph in the body and is gated on an app-developer account.
:::

<BridgeReference />

## What the bridge can and cannot do

The generation bridge is a **deliberately narrower surface than the
orchestrator**, not a thin proxy in front of it. The body your block sends is a
**three-member discriminated union** keyed by `kind`, and anything outside those
three shapes is rejected at the wire schema — in the host, **before** any
orchestrator call is made.

::: tip Why the bridge isn't just the orchestrator API
The full orchestrator contract is not hidden — it is documented as the
[Orchestration REST API](/orchestration/) and open to anyone willing to be their
**own principal**: your own API token, your own backend, your own Buzz.
The bridge is what you get when you want the **viewer** to be the principal
instead. A block spends *someone else's* Buzz, inside Civitai's brand, from code
Civitai did not write, so the host has to be able to (a) render an honest
confirmation of what is about to be spent, and (b) enforce policy on the values —
sources, destinations, priority — rather than trust the caller. Both require the
host to *understand* the body semantically, which is exactly what a narrow,
enumerable union buys and an arbitrary passthrough does not.

If your app genuinely needs the whole orchestrator surface, the supported answer
is to ship your own backend as an ordinary API consumer and use the block purely
as its UI.
:::

The three members are the whole surface:

| `kind` | what it addresses | how you name the model |
|---|---|---|
| `textToImage` | a Civitai **checkpoint** | numeric `modelId` + `modelVersionId` |
| `customComfy` | a **server-registered** ComfyUI recipe, **or your own graph** | a registered `recipe` id — or, with `mode: 'inline'`, the graph itself plus a declared `resources` manifest |
| `step` | a **server-registered** orchestrator step (`convert-image`, `chat-completion`) | a registered `step` id |

The `step` member (added in `@civitai/app-sdk@0.30.0`) carries a registered
**step id** plus bounded `params` validated per-step by the host's own `.strict()`
schema — it is *not* a way to send orchestrator step JSON (see the next note).
Like recipes, the step registry is server-side and code-reviewed: an unregistered
id is rejected fail-closed at the wire schema.

Registered ids as of the pinned SDK: **`convert-image`** (fixed-price image
format conversion + resize) and **`chat-completion`** (fixed-price LLM chat
completion over a server-pinned model allowlist). So `step` is **not** the
"non-image" arm — one of the two entries today is an image operation. The set
grows additively on the host, which is why `step` is typed `string` rather than a
literal union: a union pinned in the SDK would go stale against any host deploy
that adds one, so treat the host's registry, not this list, as authoritative.
The full field table is at [`WorkflowBodyStep`](#bridge-WorkflowBodyStep).

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

The `step` member is **not** the loophole: it takes a *registered step id* (a
string the host resolves against its code-reviewed registry) plus per-step
validated `params` — never a caller-supplied `$type` step object. Passing
orchestrator step JSON as `params` fails that step's `.strict()` schema.

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
2. **Do you need an edit?** — pass a **source image** (`sourceImage`, or
   `sourceImages` for more than one) **and** name the edit version (see the
   [worked example](#worked-example-qwen-single-image-edit)). The variant is
   chosen by the *presence of a source image*, not by the version id — this is
   the single most common mistake on the bridge.
3. **Is it genuinely outside the union?** — before you conclude that, check all
   three arms. Each of them reaches work this page used to rule out:
   - `textToImage` covers **multi-image** editing too, via `sourceImages`, on
     any checkpoint whose ecosystem allows more than one image — see
     [what the source-image fields can and cannot do](#what-sourceimage-can-and-cannot-do).
   - `step` is **not** limited to non-image work: today's registry holds
     `convert-image` (fixed-price image format conversion + resize) alongside
     `chat-completion`, and the registry grows additively on the host.
   - `customComfy` reaches the registered ComfyUI recipes — and, on its
     [inline arm](../guide/comfy-cloud#the-inline-arm-ship-your-own-graph)
     (`mode: 'inline'`), a ComfyUI graph your block ships itself.

   What is left over today is **background removal** — no union member reaches
   it, inline graphs included: it is a first-class orchestrator step rather than
   a Comfy graph, so it has to be registered on the platform side before any arm
   can name it. That makes it a **platform request**. Say so explicitly when you
   ask, and note that both `customComfy` recipes today are prompt-only txt2img,
   so anything taking an **image input** is new ground rather than a variation
   on an existing one.
4. **Recipes are not self-serve, but an inline graph is.** The recipe registry is
   server-side and code-reviewed; there is no runtime, manifest, or dashboard way
   to add one, so adding a recipe is a **platform request** — see
   [requesting a new recipe](../guide/comfy-cloud#requesting-a-new-recipe).
   You do **not** have to wait for one to run a graph, though: the
   [inline arm](../guide/comfy-cloud#the-inline-arm-ship-your-own-graph)
   (`mode: 'inline'`) lets an app-developer account ship the ComfyUI graph in the
   body today. Ask for a recipe when you need the graph available to **every**
   viewer of your block.

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

::: danger Omitting the source image silently switches you to a different MODEL
The workflow variant is derived from **whether a source image is present**
(`sourceImage`, or `sourceImages`), not
from the version id you name. Name the edit version but leave the source image
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

**The fix is in your body, not in a support request**: send a source image
whenever you mean to edit, and name the edit version (`2558804`) explicitly.
:::

#### Worked example: Qwen single-image edit

The case people get wrong. Note both halves: the **edit version id** *and* the
source image. This is a **page app** — source images are rejected on a
model-bound token.

This example sends the **singular** `sourceImage`, which is the right choice for
one image today even though the SDK marks it `@deprecated` — see
[which field to send today](#which-field-to-send-today).

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

### What the source-image fields can and cannot do {#what-sourceimage-can-and-cannot-do}

A `textToImage` body carries its img2img / edit input in **one of two fields**,
and the SDK ships both:

| field | shape | status |
|---|---|---|
| `sourceImage` | a single `{ url, width, height }` | **`@deprecated`** — but supported *indefinitely*, and the right thing to send today for one image |
| `sourceImages` | `{ url, width, height }[]` (min 1) | the **current** field; the only way to express **more than one** image |

Read [which field to send today](#which-field-to-send-today) before you pick —
the answer is not simply "the newer one".

These limits are structural, not tuning knobs, and apply to **both** fields:

- **Civitai-hosted `https` URLs only.** `civitai.com`, `civitai.red`,
  `civitai.green` and their subdomains. An arbitrary remote URL is rejected.
  In the array form **every element is validated individually** — there is no
  "first element only" path, and one bad element rejects the whole body.
- **`width`/`height` are bounded to 64–2048** per image, and are required.
- **Page apps only.** Source images are rejected fail-closed on a
  **model-bound** token, the same restriction `additionalResources` carries —
  for the array form as well as the singular one. See
  [page-vs-model constraints](../guide/text-to-image#page-vs-model-constraints).
- **Never send both fields.** `sourceImage` *and* `sourceImages` together is
  rejected as **ambiguous** rather than resolved to a winner. TypeScript cannot
  express that mutual exclusion (both are independently optional), so it
  surfaces as a server-side validation error — send exactly one.
- **An empty `sourceImages: []` is rejected**, not read as "no source image".
  Omit the field entirely for plain text-to-image.
- **You do not choose edit vs img2img — the checkpoint's ecosystem does.**
  Edit-capable ecosystems (Qwen, Qwen2, Seedream, NanoBanana, OpenAI, Flux.1
  Kontext, Flux2 and the Flux2-Klein variants) get an **`img2img:edit`** graph.
  SD-family
  ecosystems get plain **`img2img`** ("Image Variations") instead. A checkpoint
  whose ecosystem supports neither is rejected fail-closed. There is no body
  field that overrides this.

#### How many images you may send

**The cap is per-ecosystem, not a constant.** It is derived from the
checkpoint's own generation-graph `images` node, so it tracks what the ecosystem
actually supports:

| max images | ecosystems |
|---|---|
| **1** | SD-family, Flux.1 Kontext, Boogu, MAI |
| **3** | Qwen, Qwen2, MageFlow |
| **4** | Reve, HiDream-O1 |
| **5** | WanImage |
| **7** | Flux.2, Flux.2 Klein, OpenAI, NanoBanana, Seedream, Grok |

Exceeding the checkpoint's cap is **rejected, never silently truncated**, and
the error names both the count you sent and the ecosystem's limit. A flat wire
bound of **10** additionally rejects an oversized array before the body is even
parsed — that number is a wire guard, **not** the product cap, so never design
against it.

Element **order is preserved** into the graph's `images` input.

Note the consequence: on an ecosystem capped at 1 (SD-family, Flux.1 Kontext,
Boogu, MAI) multi-image editing is still not reachable — not because the field
can't express it, but because that checkpoint's graph has one image slot. Pick
the checkpoint accordingly. Being **edit-capable** and accepting **several**
images are separate properties: Flux.1 Kontext is an edit ecosystem with a cap
of 1.

#### Which field to send today

`sourceImages` is the current field, but "always use the current field" is the
wrong rule here, because of one asymmetry:

::: danger An old host STRIPS `sourceImages` and still bills you
`sourceImages` requires a host running
[civitai/civitai#3518](https://github.com/civitai/civitai/pull/3518) or later.
The text-to-image body schema is **not** `.strict()`, so a host that predates
#3518 does **not** error on the field — it **silently strips it** and runs, and
**bills**, a plain text-to-image generation with **no image conditioning at
all**. There is no client-side way to detect that: you get a successful workflow,
real images, and a real Buzz charge for a generation that ignored your input.

`sourceImage` (singular) is understood by **both** old and new hosts.
:::

So:

- **One image → send `sourceImage`.** It is marked `@deprecated`, but the SDK
  states the alias keeps working **indefinitely** (every deployed block and
  these docs ship it), and the server normalizes it into a 1-element array, so a
  1-element `sourceImages` array produces a **byte-identical** generation. The
  deprecation is a signpost toward the array, not a removal notice.
- **Two or more images → send `sourceImages`**, and only against a host you know
  runs #3518 or later. Until #3518 is deployed everywhere you target, that is
  the trade you are making: `sourceImages` is the only way to express the
  request, and an older host answers it by silently doing something else.
- **Never both**, in either direction — that is rejected as ambiguous.

### Not supported today

One thing is genuinely out of reach, and it is the one worth opening a platform
request for:

| Not available through the bridge | Where it stands |
|---|---|
| **Background removal** (e.g. BiRefNet) | a **first-class orchestrator step**, not a Comfy graph and not an `imageGen` operation — **no union member reaches it** |

Multi-image editing **used to be on this list and no longer is**: `sourceImages`
expresses it, subject to the [per-ecosystem cap](#how-many-images-you-may-send)
and the [host-version caveat](#which-field-to-send-today).

These are bounded by the union's shape, not by configuration:

| Constraint | What to do instead |
|---|---|
| Source images on a model-bound (`model.*`) block | build a **page app** |
| More images than the checkpoint's ecosystem allows | pick a checkpoint whose ecosystem has a higher cap |
| Choosing edit vs img2img yourself | it follows from the checkpoint's ecosystem; pick the checkpoint accordingly |

Shipping your own ComfyUI graph **used to be on that list too, and no longer
is**: `customComfy`'s
[inline arm](../guide/comfy-cloud#the-inline-arm-ship-your-own-graph)
(`mode: 'inline'`) carries the graph in the body. It is gated rather than
unrestricted — **app-developer accounts only, page tokens only** — so a
registered recipe is still how a graph reaches **every** viewer of your block.

Note what is **not** on these lists: single-image editing, multi-image editing
on a capable ecosystem, and Z-Image all work through `textToImage` today — see
[the ids you probably want](#the-ids-you-probably-want).

### The registered recipes

On its **recipe** arm `customComfy` accepts only a **registered** id — an
unregistered one is rejected at the union, before the recipe is resolved. Today
there are exactly **two**. (The
[inline arm](../guide/comfy-cloud#the-inline-arm-ship-your-own-graph) is how you
run a graph that is not in this table.)

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

## Retrying a `submit()` without double-charging

`submit(body, options?)` takes a second argument —
[`SubmitWorkflowOptions`](#bridge-SubmitWorkflowOptions) — whose one field is
about **money**:

```tsx
import { useBuzzWorkflow } from '@civitai/blocks-react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

export function useRetryableSubmit() {
  const { submit } = useBuzzWorkflow();

  // ONE logical submit → ONE stable key, reused by every retry of it.
  return async (body: WorkflowBody, cellId: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await submit(body, { idempotencyKey: `gen:${cellId}` });
      } catch (err) {
        if (attempt === 2) throw err;
      }
    }
  };
}
```

- **Omit `idempotencyKey`** and the hook generates a **fresh key per
  `submit()` call** — correct, because each call is a new logical submit.
- **Reuse the SAME key** when you are **retrying a submit whose response was
  lost** (a timeout, a network drop). The host and the orchestrator then
  collapse the attempts into **one Buzz charge** instead of charging twice.

The failure this prevents is invisible from the client: the first submit
*succeeded server-side* and only the response was lost, so a naive retry spends
the viewer's Buzz a second time on a generation they already paid for. If your
block has any retry path at all — a wrapper, a react-query `retry`, a user-facing
"try again" button — give that logical submit a stable id (a grid-cell id, a
request id you already hold) and pass it every time.

::: warning A stable key must be stable per *submit*, not per *component*
The key identifies **one logical submit**. Deriving it from something coarser —
a component instance, the block id, a user id — means two genuinely different
generations share a key and are eligible to be collapsed as if one were a retry
of the other. Key it to the unit of work the user asked for. When in doubt, omit
the option: the hook's per-call key is the safe default, and only a retry needs
to opt out of it.
:::

## See also

- [What the bridge can and cannot do](#what-the-bridge-can-and-cannot-do) — the boundary vs the orchestrator, the ids for Z-Image and Qwen edit, and the one gap that needs a platform request.
- [Retrying a `submit()` without double-charging](#retrying-a-submit-without-double-charging) — `idempotencyKey`.
- [Generation guide](../guide/text-to-image) — the narrative walkthrough (img2img, LoRAs, page-vs-model).
- [Comfy on Civitai (customComfy)](../guide/comfy-cloud) — the recipe-gated ComfyUI path.
- [Hooks reference](./hooks) — every `@civitai/blocks-react` hook.
- [Messages reference](./messages) — the `postMessage` protocol these hooks sit on.
