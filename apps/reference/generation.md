---
title: Generation bridge reference
description: The field-level generation contract — the WorkflowBody union, the useBuzzWorkflow lifecycle (incl. cancel), and the BlockWorkflowSnapshot result — with every type indexed and linked to the page that documents it, generated from the published SDK type JSDoc.
sources:
  - npm:@civitai/app-sdk@0.79.0/blocks#WorkflowBody
  - npm:@civitai/blocks-react@0.78.0#useBuzzWorkflow
---

# Generation bridge reference

This is the **field-level contract** for spending a viewer's Buzz on a
generation from a block: the `WorkflowBody` your block sends, the
`useBuzzWorkflow()` lifecycle that carries it (estimate → submit → **watch** →
**cancel**), and the `BlockWorkflowSnapshot` you get back.

The field tables are generated from the **published** `@civitai/app-sdk`
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

::: info Sending a body from `@civitai/sdk`
The field tables name the React hook. On the default `page-elements` template
the same `WorkflowBody` goes through `app.workflows` in `@civitai/sdk` (0.12.0
or later), and the same `BlockWorkflowSnapshot` comes back. Both types are
exported from `@civitai/sdk`.

| `useBuzzWorkflow()` member | `@civitai/sdk` call |
|---|---|
| `estimate(body)` | `app.workflows.estimate(body)` |
| `submit(body, options?)` | `app.workflows.submit(body, { idempotencyKey })` — the key is required |
| `poll(workflowId)` | `app.workflows.get(workflowId)` |
| `watch(workflowId)` | `app.workflows.wait(workflowId)` for the final snapshot, or `app.workflows.watch(workflowId)` to iterate each change |
| `cancel(workflowId)` | `app.workflows.cancel(workflowId)` |

The hook **rejects** some refusals, with `WorkflowEstimateError` or
`WorkflowSubmitError`. `app.workflows` does not reject for a refusal: when the
host declines a body it answers with a `failed` snapshot and the call
**resolves** with it, so check `snapshot.status`, then read
`snapshot.errorCode`. An HTTP error status rejects with `ApiError`.
`app.workflows` has no call for the host dialogs that `useRunTraining()` and
`useRunConfirmedStep()` open. [Money calls](../guide/sdk#money-calls) has the
calling code, the token it needs and what to do when a `submit` rejects.
:::

## Field tables by page

The field tables are documented across the pages below, so that each page's
`.md` copy stays small enough for an agent's fetch tool to read whole. Every
type is listed here by name.

<ReferenceIndex kind="bridge">
<!-- BEGIN GENERATED: bridge-index — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

27 types across 3 pages. Each link goes to the page that documents the type; fetch that page's `.md` for the full entry.

**[useBuzzWorkflow lifecycle and snapshot types](./generation/lifecycle)** — The `useBuzzWorkflow()` lifecycle, the submit and watch options, and the workflow snapshots and app-workflow records it returns.

- [`useBuzzWorkflow()`](./generation/lifecycle#bridge-useBuzzWorkflow) — lifecycle
- [`BlockWorkflowStepSnapshot`](./generation/lifecycle#bridge-BlockWorkflowStepSnapshot) — object
- [`BlockWorkflowSnapshot`](./generation/lifecycle#bridge-BlockWorkflowSnapshot) — object
- [`AppWorkflow`](./generation/lifecycle#bridge-AppWorkflow) — object
- [`AppWorkflowImage`](./generation/lifecycle#bridge-AppWorkflowImage) — object
- [`SubmitWorkflowOptions`](./generation/lifecycle#bridge-SubmitWorkflowOptions) — object
- [`WatchWorkflowOptions`](./generation/lifecycle#bridge-WatchWorkflowOptions) — object

**[Workflow body types](./generation/bodies)** — The `WorkflowBody` union and its text-to-image, ComfyUI and orchestrator-step members, with their parameter types.

- [`WorkflowBody`](./generation/bodies#bridge-WorkflowBody) — union
- [`WorkflowBodyTextToImage`](./generation/bodies#bridge-WorkflowBodyTextToImage) — object
- [`BlockTextToImageParams`](./generation/bodies#bridge-BlockTextToImageParams) — object
- [`BlockSourceImage`](./generation/bodies#bridge-BlockSourceImage) — object
- [`WorkflowBodyCustomComfy`](./generation/bodies#bridge-WorkflowBodyCustomComfy) — union
- [`WorkflowBodyCustomComfyRecipe`](./generation/bodies#bridge-WorkflowBodyCustomComfyRecipe) — object
- [`WorkflowBodyCustomComfyInline`](./generation/bodies#bridge-WorkflowBodyCustomComfyInline) — object
- [`WorkflowBodyStep`](./generation/bodies#bridge-WorkflowBodyStep) — object
- [`WorkflowBodyPassThroughStep`](./generation/bodies#bridge-WorkflowBodyPassThroughStep) — object

**[Training and multi-step workflow types](./generation/training-and-multi-step)** — The `training` body and its ai-toolkit parameter types, and the multi-step `workflow` body.

- [`WorkflowBodyTraining`](./generation/training-and-multi-step#bridge-WorkflowBodyTraining) — object
- [`BlockTrainedEpoch`](./generation/training-and-multi-step#bridge-BlockTrainedEpoch) — object
- [`AiToolkitTrainingParams`](./generation/training-and-multi-step#bridge-AiToolkitTrainingParams) — alias
- [`AiToolkitTrainingParamsBase`](./generation/training-and-multi-step#bridge-AiToolkitTrainingParamsBase) — object
- [`AiToolkitPlainEcosystem`](./generation/training-and-multi-step#bridge-AiToolkitPlainEcosystem) — union
- [`AiToolkitLrScheduler`](./generation/training-and-multi-step#bridge-AiToolkitLrScheduler) — union
- [`AiToolkitOptimizerType`](./generation/training-and-multi-step#bridge-AiToolkitOptimizerType) — union
- [`BlockTrainingQuote`](./generation/training-and-multi-step#bridge-BlockTrainingQuote) — object
- [`WorkflowBodyWorkflow`](./generation/training-and-multi-step#bridge-WorkflowBodyWorkflow) — object
- [`WorkflowBodyWorkflowStep`](./generation/training-and-multi-step#bridge-WorkflowBodyWorkflowStep) — object
- [`WorkflowStepRef`](./generation/training-and-multi-step#bridge-WorkflowStepRef) — object

<!-- END GENERATED: bridge-index -->
</ReferenceIndex>

## What the bridge can and cannot do

The generation bridge is a **deliberately narrower surface than the
orchestrator**, not a thin proxy in front of it. The body your block sends is a
**discriminated union** keyed by `kind`, and anything outside those shapes is
rejected at the wire schema — in the host, **before** any orchestrator call is
made.

There are five `kind` values, and `kind: 'step'` is itself two arms — six
members, and they are the whole surface:

| `kind` | what it addresses | how you name the model |
|---|---|---|
| `textToImage` | a Civitai **checkpoint** | numeric `modelId` + `modelVersionId` |
| `customComfy` | a **server-registered** ComfyUI recipe, **or your own graph** | a registered `recipe` id — or, with `mode: 'inline'`, the graph itself plus a declared `resources` manifest |
| `step` (`step` present) | a **server-registered** orchestrator step (`convert-image`, `chat-completion`) | a registered `step` id |
| `step` (`step` omitted) | an orchestrator step type **named directly**, with `input` forwarded unmodified | the orchestrator's own `$type` — not a Civitai id |
| `training` | an ai-toolkit **LoRA training** run on images the viewer uploaded | a base-model key from Civitai's training catalog (`model`), plus the `items` (`{ air, caption }`) that `useImageUpload({ purpose: 'trainingData' })` uploaded |
| `workflow` | **up to 8 orchestrator steps submitted as one workflow**, a later step reading an earlier step's result through a `{ $ref, path }` reference | each step's own `$type`, as on the pass-through arm |

`workflow` is the multi-step member: the same denylist as the pass-through arm
runs on every step, references may only point at `$arguments` or an earlier
step, and there is no `maxBuzz` (the ceiling is the per-generation budget × the
number of steps, with a fixed per-call maximum on top; see
[What it costs](../guide/workflows#what-it-costs)). The guide is [Multi-step workflows](../guide/workflows); the
field table is at [`WorkflowBodyWorkflow`](./generation/training-and-multi-step#bridge-WorkflowBodyWorkflow).

`training` ships behind the host flag **`app-blocks-training-kind`**, which is
**off by default** and evaluated **per viewer**; where it is off, every training
call is refused. It is a page-app flow, quoted with `estimate()` and run with
`useRunTraining()` (`submit()` refuses it). The field table is at
[`WorkflowBodyTraining`](./generation/training-and-multi-step#bridge-WorkflowBodyTraining); availability and money
rules are under
[`useRunTraining`](./hooks/batches-and-training#hook-useRunTraining).

The **registry arm** of `step` (added in `@civitai/app-sdk@0.30.0`) carries a
registered **step id** plus bounded `params` validated per-step by the host's own
`.strict()` schema. Like recipes, the step registry is server-side and
code-reviewed: an unregistered id is rejected fail-closed at the wire schema.

Registered ids as of the pinned SDK (the registry arm only — the pass-through arm
has no registry): **`convert-image`** (image format conversion + resize) and
**`chat-completion`** (LLM chat completion over a server-pinned model
allowlist). So `step` is **not** the
"non-image" arm — one of the two entries today is an image operation. The set
grows additively on the host, which is why `step` is typed `string` rather than a
literal union: a union pinned in the SDK would go stale against any host deploy
that adds one, so treat the host's registry, not this list, as authoritative.
The full field table for this arm is at
[`WorkflowBodyStep`](./generation/bodies#bridge-WorkflowBodyStep); the other arm's is at
[`WorkflowBodyPassThroughStep`](./generation/bodies#bridge-WorkflowBodyPassThroughStep).

#### Estimating a registered step {#registered-step-estimate}

A registered step's `estimate()` asks the orchestrator for a price quote, so
the number it shows is a quote, not the step's declared price (it is never less
than what the submit would reserve). When the host gets no quote, the estimate
**fails** rather than falling back to the declared price: a `failed` snapshot
with **no `cost`**, `{ workflowId: 'failed', status: 'failed', error, errorCode }`.
`useBuzzWorkflow().estimate` rejects it with `WorkflowEstimateError`, and
`useBatchEstimate()` marks that cell `ok: false`. Branch on
`err.snapshot.errorCode`. (`app.workflows.estimate` in `@civitai/sdk` resolves
with that snapshot instead; branch on its `errorCode`.)

| `errorCode` | Means | Retry the same body? |
|---|---|---|
| `'step_quote_rejected'` | the orchestrator refused the request | no — change the `params` |
| `'step_quote_unavailable'` | no usable answer just then (an outage, a timeout, a rate limit) | yes, after a short wait |
| `'step_quote_unpriced'` | the orchestrator answered without a price | not expected to help |

The exact `error` text for each is listed under
[`useBuzzWorkflow`](./hooks/generation#hook-useBuzzWorkflow). Log it; its wording is not a
contract, so branch on `errorCode`.

These codes are **estimate-only**: a submit never carries a `step_quote_*`
code. It still needs a price quote, though, so a submit the host cannot quote
fails as well: `submit()` rejects, or resolves `failed` with no `errorCode`.
Unlike a `kind: 'workflow'` body, a registered step is never run at a fallback
price. Keep a default branch for a code you do not recognise.

They need a host that sends them, which civitai.com does. The SDK's typed union
(`KnownBlockWorkflowErrorCode`) lists them from `@civitai/app-sdk@0.68.0`;
with an older SDK, compare the string anyway: `errorCode` is
typed to accept any string, so the comparison typechecks. The mock
host (`createMockHost` from `@civitai/blocks-react/testing`, see
[Local dev loop](../guide/local-dev)) always prices a registered step, so it
never sends one of these codes.

The other single-step arms are not affected. A pass-through estimate (`kind:
'step'` with a `$type`) still shows the `maxBuzz` you declared, and an inline
`customComfy` estimate is unchanged: it never asks for a quote, and its
`maxBuzz` is a real bound on the spend.

::: warning Orchestrator step JSON is not a bridge body as it stands
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

— that is correct **for the orchestrator** and is still not a bridge body. It
carries no `kind` and no `maxBuzz`, so it fails the wire schema before the host
does anything else, and none of `ecosystem` / `model` / `operation` / `engine`
is how a block names a Civitai model.

What *is* new: the `kind: 'step'` member has a second, **pass-through** arm that
does carry a `$type`. It is a host capability and is already live;
`@civitai/app-sdk@0.43.0` is the release that gives it a type
(`WorkflowBodyPassThroughStep`), so that is the floor for expressing one in
typed code. A body of
`{ kind: 'step', $type, input, maxBuzz }` — with the `step` key **omitted** —
has the host forward `input` unmodified. The two arms are discriminated on
whether `step` is present, so a body carrying both is rejected by both. The
registry arm described above is unchanged. Field-by-field bounds are in
[`WorkflowBodyPassThroughStep`](./generation/bodies#bridge-WorkflowBodyPassThroughStep).

That arm is deliberately *less* bounded than the registry, not unbounded.
`$type`s the platform reserves for its own internal use are refused server-side,
with their own error and a case-insensitive match. A `$type` being absent from
that set is not a promise that it will run — only that the host will forward it;
the orchestrator's own per-`$type` validation is what decides, and it runs after
the spend reservation rather than at the wire. One `$type` is refused on this
arm by shape rather than by the denylist: `repeat`, which may only iterate an
array in a body's own `arguments`, and this arm has none. To repeat a step, or
to feed one step's result into another, send a
[multi-step workflow](../guide/workflows) (`kind: 'workflow'`).

Below `0.43.0` the SDK has no type for this arm, so a pass-through body cannot be
expressed without casting — that is a typing floor, not a host one.

If you send a body the wire schema rejects — the raw orchestrator step above, or
a `kind: 'step'` body carrying both `step` and `$type` — the symptom is
distinctive: **every generation fails identically, on every model**, with no
per-model variation, because nothing model-specific ever ran. If you are seeing
"it fails on anything", check the body shape first.

Either way, a block never holds an orchestrator Bearer token. The full
orchestrator contract, with *you* as the principal, is the
[Orchestration REST API](/orchestration/) — see
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
3. **Is it genuinely outside the union?** — before you conclude that, check
   every arm.

   Asking for a **platform request** is still the route to the bounded,
   registered treatment — say so explicitly when you ask, and note that both
   `customComfy` recipes today are prompt-only txt2img, so anything taking an
   **image input** is new ground rather than a variation on an existing one.
4. **Recipes are not self-serve, but an inline graph is.** The recipe registry is
   server-side and code-reviewed; there is no runtime, manifest, or dashboard way
   to add one, so adding a recipe is a **platform request** — see
   [requesting a new recipe](../guide/comfy-cloud#requesting-a-new-recipe).
   You do **not** have to wait for one to run a graph, though: the
   [inline arm](../guide/comfy-cloud#the-inline-arm-ship-your-own-graph)
   (`mode: 'inline'`) lets a page app ship the ComfyUI graph in the body today.
   Ask for a recipe when you want a **reviewed** graph you do not have to ship in
   the body. Neither arm reaches a model-slot block: `customComfy` is
   page-token-only on both.

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

::: danger A version the resolved workflow doesn't offer can still be swapped silently
The workflow variant is derived from **whether a source image is present**
(`sourceImage`, or `sourceImages`), not from the version id you name — so the
version you send and the workflow you get are decided independently.

**The Qwen case in the table above now fails, loudly.** Name the edit version
`2558804`, leave the source image off, the bridge resolves `txt2img`, and the
request is rejected with `BAD_REQUEST`:

> modelVersion 2558804 is not available for 'txt2img' on the Qwen ecosystem — it
> is offered for img2img:edit only. Either send a `sourceImage` to run it as an
> image edit, or use modelVersionId 2552908 for txt2img.

That check only fires on a version the ecosystem's config lists for **some other
workflow**, and only in the **`txt2img` direction**. Two narrower cases are still
substituted silently:

- **A version id the ecosystem lists nowhere** — a community checkpoint, or a
  version retired since your app shipped. Most image ecosystems lock their
  checkpoint, and on those an unlisted id is replaced with the workflow's default
  version and the generation succeeds: `987654321` on Qwen `txt2img` comes back
  as `2552908`. (On an ecosystem that does not lock its checkpoint, the id
  survives.)
- **The reverse direction** — a `txt2img`-only version sent **with** a source
  image. It is substituted the same way and is not rejected: `2552908` sent with
  a source image on Qwen comes back as `2558804`.

In both, it looks like success: the workflow succeeds, images render, and you are
billed for a checkpoint you did not ask for. The swap is reported on the
`textToImage` snapshot's `modelSubstitutions` field (see
`BlockWorkflowSnapshot` above: `requested` / `applied` /
`reason`, omitted when nothing was substituted), so read it on the estimate and
on the result. The other tell is behavioural: the output ignores your source
image, or doesn't look like the version you named.

**The fix is in your body, not in a support request**: send a source image
whenever you mean to edit, and name the version that belongs to the mode you
want — `2558804` for a Qwen edit, `2552908` for Qwen `txt2img`.
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

- **One image → either field.** `sourceImage` is marked `@deprecated`, but the
  SDK states the alias keeps working **indefinitely** (every deployed block and
  these docs ship it), and the server normalizes it into a 1-element array, so a
  1-element `sourceImages` array produces a **byte-identical** generation. The
  deprecation is a signpost toward the array, not a removal notice.
- **Two or more images → send `sourceImages`**, the only way to express the
  request.
- **Never both**, in either direction — that is rejected as ambiguous.

These are bounded by the union's shape, not by configuration:

| Constraint | What to do instead |
|---|---|
| Source images on a model-bound (`model.*`) block | build a **page app** |
| More images than the checkpoint's ecosystem allows | pick a checkpoint whose ecosystem has a higher cap |
| Choosing edit vs img2img yourself | it follows from the checkpoint's ecosystem; pick the checkpoint accordingly |

Note what is **not** on this list: single-image editing, multi-image editing
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
| `starter-comfy-txt2img` | single-step **Z-Image** txt2img, fixed **1024×1024** | `{ prompt, seed?, accountType? }` | 90 |

Both param schemas are `.strict()`: a field that isn't listed is rejected, not
ignored. Note what is **not** exposed — neither recipe takes `width` / `height`,
steps, or CFG. Those are fixed server-side (the starter recipe runs at the
Z-Image turbo defaults).

::: tip Don't reach for `starter-comfy-txt2img` to get Z-Image
It is a fixed-resolution, prompt-and-seed **demo starter**, not the Z-Image
path. For Z-Image generation use `textToImage` with `2168935` / `2442439`,
which gives you the full [param surface](./generation/bodies#bridge-BlockTextToImageParams)
(dimensions, steps, sampler, quantity). Reach for the recipe only when you
want exactly what it does.
:::

## Retrying a `submit()` without double-charging

This section is the React hook. In `@civitai/sdk`,
`app.workflows.submit(body, { idempotencyKey })` has no default key: it requires
one and refuses to send without it, and its retry rules are under
[Money calls](../guide/sdk#submit-rejects).

`submit(body, options?)` takes a second argument —
[`SubmitWorkflowOptions`](./generation/lifecycle#bridge-SubmitWorkflowOptions) — whose one field is
about **money**:

```tsx
import { useBuzzWorkflow } from '@civitai/blocks-react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

export function useRetryableSubmit() {
  const { submit } = useBuzzWorkflow();

  // ONE logical submit → ONE stable key, reused by every retry of it.
  // `-` is the separator, not `:` — a colon fails the charset below.
  return async (body: WorkflowBody, cellId: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await submit(body, { idempotencyKey: `gen-${cellId}` });
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

::: warning A stable key must be stable per *submit*, not per *component*
The key identifies **one logical submit**. Deriving it from something coarser —
a component instance, the block id, a user id — means two genuinely different
generations share a key and are eligible to be collapsed as if one were a retry
of the other. Key it to the unit of work the user asked for. When in doubt, omit
the option: the hook's per-call key is the safe default, and only a retry needs
to opt out of it.
:::

### `idempotencyKey` — the validated charset {#idempotency-key-charset}

**`^[A-Za-z0-9_-]{1,64}$`.** Letters, digits, `_` and `-`, 1 to 64
characters — and the host validates it on the way in, before the whatIf
preflight prices anything. A key outside that class is refused:

```json
{ "code": "invalid_format", "format": "regex",
  "pattern": "/^[A-Za-z0-9_-]{1,64}$/",
  "path": ["idempotencyKey"],
  "message": "Invalid string: must match pattern /^[A-Za-z0-9_-]{1,64}$/" }
```

returned as `BAD_REQUEST` / **`400`**. Because validation runs first, nothing is
queued and nothing is charged — a block that composes keys outside the class
never generates at all, rather than generating and double-charging.

The **same** charset governs every idempotency key the platform accepts, on all
four surfaces that take one: the `useBuzzWorkflow().submit()` bag documented
here, the REST `POST /api/v1/blocks/workflows/submit` body (where the field is
**required**, not optional; `app.workflows.submit` in `@civitai/sdk` sends this
body), `useGoodPurchase().purchase()`, and `useTip().tip()`.

The payload above is what the bridge path returns. The three **REST** routes
validate the same pattern but report it in their own envelope — a `400` with
`{ "error": "Invalid request body", "details": { "fieldErrors": {
"idempotencyKey": [ … ] } } }` — so branch on the status, not on a shared
error body.

**Why the colon specifically is out.** It is excluded on purpose, and knowing
why is what stops you reaching for `.` or `/` instead. The host composes its
internal per-viewer / per-app dedupe and rate-limit keys by joining their parts
with `:`. Those joins are unambiguous **only** while none of the parts can
themselves contain a colon — your key is one of the parts, so a colon-bearing
key could cross into a neighbouring key's namespace. Every other separator
outside `[A-Za-z0-9_-]` is rejected for the same reason the class is closed:
`-` and `_` are the two you have. Concatenate with those.

**Why 64.** The host derives the orchestrator-side identifier for the run from
your key plus a short prefix, and the orchestrator enforces its own
`^[A-Za-z0-9_-]+$` over at most 128 characters. A 64-character ceiling on your
half keeps the composed identifier inside that in the worst case.

| Key expression | Verdict |
|---|---|
| `` `gen-${cellId}` `` | ✅ |
| `` `buy-${goodId}-${attemptId}` `` | ⚠️ charset-legal, **still wrong twice**: an attempt-varying part defeats the replay the key exists for, and a good id may itself be 64 chars, which breaks the length bound below. Prefer `` `buy-${crypto.randomUUID()}` `` |
| `crypto.randomUUID()` | ✅ — 36 chars, `[0-9a-f-]` |
| `` `gen:${cellId}` `` | ❌ `400` — colon |
| `React.useId()` | ❌ `400` — returns a colon-wrapped id such as `:R0:` |
| `` `gen.${cellId}` `` / `` `gen/${cellId}` `` | ❌ `400` — `.` and `/` are outside the class |
| a key longer than 64 chars | ❌ `400` |

## See also

- [What the bridge can and cannot do](#what-the-bridge-can-and-cannot-do) — the boundary vs the orchestrator, the ids for Z-Image and Qwen edit, and the one gap that needs a platform request.
- [Retrying a `submit()` without double-charging](#retrying-a-submit-without-double-charging) — `idempotencyKey`.
- [Generation guide](../guide/text-to-image) — the narrative walkthrough (img2img, LoRAs, page-vs-model).
- [Comfy on Civitai (customComfy)](../guide/comfy-cloud) — the recipe-gated ComfyUI path.
- [Hooks reference](./hooks) — every `@civitai/blocks-react` hook.
- [Messages reference](./messages) — the `postMessage` protocol these hooks sit on.
