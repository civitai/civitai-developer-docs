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

<BridgeReference>
<!-- BEGIN GENERATED: bridge — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`useBuzzWorkflow()`** — lifecycle

```ts
useBuzzWorkflow(): UseBuzzWorkflowReturn
```

Orchestrates the estimate → confirm → submit → poll dance through the host-mediated `postMessage` path. The host enforces budget rules (`cost_estimate \<= token.buzzBudget`) before forwarding to the orchestrator; submit() will reject if the host refuses. Block apps should call `useBuzzPurchase().openPurchaseModal()` when that happens. AFTER `submit` FLIPS `status` TO `'polling'`, USE `watch(workflowId)`. It owns the loop, resolves on the terminal snapshot, and pushes every intermediate one to an `onUpdate` callback — so a block consumes a promise/callback rather than running its own timer. `poll(workflowId)` remains the single-round-trip primitive for callers that genuinely want to drive their own cadence; the hand-written `useEffect` + backoff around it that this docstring used to prescribe is no longer the recommended shape. `status === 'confirming'` is IDLE (estimate landed, user reviewing cost) — keep the Generate button enabled. `estimate`/`submit` take a full {@link WorkflowBody} — the discriminated union keyed by `kind`, with THREE members as of `@civitai/app-sdk@0.30.0`: a `textToImage` body (`{ kind, modelId, modelVersionId, params }`), a `customComfy` recipe body (`{ kind, recipe, params }`), or a `step` body (`{ kind: 'step', step, params }` — a server-registered orchestrator step such as `'chat-completion'`), never a bare `{ prompt }`. The hook forwards the body to the host verbatim and never reads variant-specific fields, so every member flows through unchanged, including any member added later.

| Field | Type | Notes |
|---|---|---|
| `estimate` | `(body: WorkflowBody) => Promise<BlockWorkflowSnapshot>` |  |
| `submit` | `(body: WorkflowBody, options?: SubmitWorkflowOptions) => Promise<BlockWorkflowSnapshot>` |  |
| `poll` | `(workflowId: string) => Promise<BlockWorkflowSnapshot>` | ONE host round-trip. The low-level pull primitive — you almost certainly want {@link UseBuzzWorkflowReturn.watch} instead, which owns the loop. |
| `watch` | `(workflowId: string, options?: WatchWorkflowOptions) => Promise<BlockWorkflowSnapshot>` | Watch a workflow to completion. Resolves with the TERMINAL snapshot; calls `onUpdate` with every intermediate snapshot along the way. This is the replacement for the `useEffect` + `setTimeout` backoff every block used to hand-write around {@link UseBuzzWorkflowReturn.poll}. The app consumes a promise and/or a callback; the loop lives here. 🔴 THE LOOP IS SEQUENTIAL AND NON-OVERLAPPING BY CONSTRUCTION — each poll is awaited before the next is scheduled, so exactly one request per watched workflow is ever in flight. That is not tidiness: it is the property that makes a long hold SAFE. A caller-written `setInterval(poll, 2000)` against a host holding 15s would stack ~7 concurrent requests per workflow, and that is precisely why long polling is opt-in on the wire rather than switched on for every deployed block. |
| `cancel` | `(workflowId: string) => Promise<BlockWorkflowSnapshot>` | Cancel a running workflow on the orchestrator (a real server-side stop, not just client-side untracking). The host re-derives ownership from the viewer's orchestrator token, so this can only cancel workflows the viewer owns; the orchestrator rejects others. Resolves with the workflow's (now-canceled) snapshot. |
| `status` | `WorkflowStatus` |  |
| `result` | `BlockWorkflowSnapshot \| null` |  |
| `error` | `Error \| null` |  |

**`WorkflowBody`** — union

Body the block sends to `useBuzzWorkflow().{submit,estimate}`. A real discriminated union keyed by `kind`: - {@link WorkflowBodyTextToImage} (`kind: 'textToImage'`) — the original checkpoint/LoRA/img2img generation body (unchanged, back-compatible). - {@link WorkflowBodyCustomComfy} (`kind: 'customComfy'`) — a bounded, server-registered ComfyUI recipe (post-paid; the iframe never sends a graph). - {@link WorkflowBodyStep} (`kind: 'step'`) — a bounded, server-registered orchestrator step (the host's step registry; billing mode and moderation posture are declared per entry). New kinds extend this union as the host gains support for them. Narrow on `body.kind` before touching member-specific fields (e.g. `modelId`/`params` live only on the `textToImage` member). ⚠️ Adding a member is additive for PRODUCERS (every existing body still satisfies the union) but narrowing for CONSUMERS that `switch` exhaustively over `kind`. Host code that must handle every member gets a compile error pointing at the new one, which is the intended behaviour.

- `WorkflowBodyTextToImage`
- `WorkflowBodyCustomComfy`
- `WorkflowBodyStep`

**`WorkflowBodyTextToImage`** — object

The text-to-image member of the {@link WorkflowBody} discriminated union (`kind: 'textToImage'`). This is the original, single-member shape — kept byte-identical for backward compatibility. An existing `{ kind: 'textToImage', modelId, modelVersionId, params }` body must continue to satisfy {@link WorkflowBody} unchanged. Both `modelId` and `modelVersionId` are required even though they're conceptually redundant — the host validates that `modelId` matches the JWT's `ctx.modelId` (context binding) AND that the version belongs to that model (DB lookup). The block always has both values from `useBlockContext().context as ModelSlotContext`.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'textToImage'` |  |
| `modelId` | `number` |  |
| `modelVersionId` | `number` |  |
| `additionalResources?` | `Array<{ modelVersionId: number; strength?: number; }>` | Optional additional generation resources (LoRAs) layered on top of the checkpoint (`modelVersionId`). Mirrors civitai's `blockWorkflowBodySchema`: - max 5 entries - each: { modelVersionId: positive int, strength?: number in [-1, 2], default 1 } - the server is LoRA-only for additional resources (non-LoRA versions are rejected) and enforces base-model-family compatibility with the checkpoint + per-resource entitlement (early-access/Private) before any Buzz spend. Omit for a checkpoint-only generation (backward compatible). |
| `sourceImage?` | `BlockSourceImage` | Optional img2img init/source image (App Blocks IMAGE bridge). When present, the block bridge emits an img2img graph workflow instead of `txt2img`; omit for a plain text-to-image generation (backward compatible). Constraints (all SERVER-ENFORCED — mirrors civitai's `blockTextToImageBodySchema`): - `url` must be a Civitai-hosted https image (an uploaded image from {@link BlockUploadedImageInfo.url} qualifies) — never an arbitrary remote URL. - The checkpoint's ecosystem must support an img2img variant — SD-family → `img2img`, edit-capable (OpenAI / Qwen / Flux Kontext / …) → `img2img:edit`. An ecosystem supporting NEITHER is rejected fail-closed. - PAGE apps only — the server rejects source images on a model-bound token. |
| `sourceImages?` | `BlockSourceImage[]` | Optional img2img/edit source images — multi-image conditioning (App Blocks IMAGE bridge). The current field; supersedes the deprecated singular {@link WorkflowBodyTextToImage.sourceImage}. Omit BOTH for a plain text-to-image generation (backward compatible). Constraints (all SERVER-ENFORCED — mirrors civitai's `blockTextToImageBodySchema.sourceImages`, which is `z.array(blockSourceImageSchema).min(1).max(BLOCK_SOURCE_IMAGES_WIRE_MAX)`): - **Every element is validated individually** — each `url` must be a Civitai-hosted **https** image (an image from {@link BlockUploadedImageInfo.url}, or a {@link BlockGenerationSourceImageInfo} from a `'generationSource'` upload, qualifies) and each `width`/`height` must be within 64–2048. A bad element ANYWHERE rejects the whole body — there is no "first element only" path. - **The maximum count is PER-ECOSYSTEM, not a constant.** It is derived from the checkpoint's own generation-graph `images` node, so it tracks what the ecosystem actually supports: SD-family / Flux.1 Kontext / Boogu / MAI **1**; Qwen / Qwen2 / MageFlow **3**; Reve / HiDream-O1 **4**; WanImage **5**; Flux.2 / Flux.2 Klein / OpenAI / NanoBanana / Seedream / Grok **7**. Exceeding the checkpoint's cap is REJECTED (never silently truncated), and the error names both the count sent and the ecosystem's limit. A flat wire bound of 10 additionally rejects an oversized array before the body is parsed — it is NOT the product cap. - **An empty array is REJECTED** (`.min(1)`); it is NOT treated as "no source image". Omit the field entirely for text-to-image. - **PAGE apps only** — the server rejects source images on a model-bound token, for this array form as well as the singular one. - Sending **both** `sourceImage` and `sourceImages` is REJECTED as ambiguous rather than resolved to a winner. TypeScript cannot express that mutual exclusion here (both are independently optional on this member), so it surfaces as a server-side validation error — send exactly one. - Element ORDER is preserved into the graph's `images` input. 🔴 Requires a host running civitai/civitai#3518 or later. The text-to-image body schema is NOT `.strict()`, so a host predating #3518 does not error on this field — it SILENTLY STRIPS it and runs (and bills) a plain text-to-image generation with no image conditioning at all. There is no client-side way to detect that, so until #3518 is deployed everywhere you target, send the singular `sourceImage` (which works on both). |
| `sharedContentKey?` | `string` | Optional shared-storage key of the published content this generation runs on behalf of. The server resolves it to the content's author for attribution (see the G5 civitai PR). Opaque string — the block passes back the `key` it got from `useSharedStorage()` for the content being generated against; omit when not applicable. |
| `accountType?` | `BuzzAccountType` | Optional preferred Buzz pool to fund this generation from — a *preference*, not a guarantee. The host clamps it server-side to what the viewer actually holds and to the domain-allowed pools (a `blockWorkflowBodySchema` field on civitai/civitai; preferred-first, then falls back). Omit for today's default host-chosen funding order (backward compatible). Whichever pool ended up the primary funder is echoed back on {@link BlockWorkflowSnapshot.spentAccountType}. |
| `params` | `BlockTextToImageParams` |  |

**`BlockTextToImageParams`** — object

Generation parameters a block can override. All optional — the host fills sensible defaults (sampler='Euler', steps=25, dimensions from the base-model family) when omitted, so the simplest block can submit `{ kind: 'textToImage', modelId, modelVersionId, params: { prompt } }`. Bounds mirror civitai/civitai's `blockWorkflowBodySchema` zod gate; over- limit values are rejected server-side before reaching the orchestrator.

| Field | Type | Notes |
|---|---|---|
| `prompt` | `string` |  |
| `negativePrompt?` | `string` |  |
| `cfgScale?` | `number` | Range 1–30. |
| `sampler?` | `string` | Sampler name (e.g. 'Euler', 'DPM++ 2M Karras'). Defaults to 'Euler'. |
| `steps?` | `number` | Range 1–50. |
| `seed?` | `number \| null` | `null` lets the orchestrator pick. |
| `width?` | `number` | Range 64–2048. Defaults to 1024 for SDXL/Flux, 512 for SD1/SD2. |
| `height?` | `number` | Range 64–2048. Same defaults as width. |
| `clipSkip?` | `number` | Per-resource CLIP layer skip count (SD1/SDXL). Range 0–12. Flux ignores it. |
| `quantity?` | `number` | Range 1–4. Defaults to 1. |

**`BlockSourceImage`** — object

A Civitai-hosted source image for an img2img generation. Mirrors civitai's `blockSourceImageSchema` (`{ url, width, height }` — all three REQUIRED), the element type of BOTH `blockTextToImageBodySchema.sourceImages` (current) and its deprecated singular alias `.sourceImage`. `url` MUST resolve to a Civitai-controlled host — the server rejects an arbitrary remote URL (SSRF / arbitrary-fetch). An image obtained from {@link BlockUploadedImageInfo.url} (via `useImageUpload`) satisfies this. `width`/`height` are the intrinsic dimensions the graph uses for its denoise/aspect derivation; the server bounds each to 64–2048. In the array form EVERY element is validated individually against exactly these rules — there is no "first element only" shortcut server-side.

| Field | Type | Notes |
|---|---|---|
| `url` | `string` |  |
| `width` | `number` |  |
| `height` | `number` |  |

**`WorkflowBodyCustomComfy`** — object

The `customComfy` member of the {@link WorkflowBody} discriminated union (`kind: 'customComfy'`) — runs a **server-registered, code-reviewed ComfyUI recipe** end-to-end. This is a bounded, fail-closed primitive: the iframe NEVER sends a Comfy graph. It sends only a registered `recipe` id plus a small, per-recipe-validated `params` object; the civitai server owns the entire graph (built by object construction, so the prompt is a leaf value that cannot perturb graph topology). Trust / safety model (all SERVER-ENFORCED — mirrors civitai's forthcoming `blockCustomComfyBodySchema`): - `recipe` is a **registered recipe id** resolved against a code-reviewed, in-repo recipe registry. An unknown id is **rejected server-side, fail- closed** (the schema enum is derived from the registry keys) — there is no way for a block to run an arbitrary/unreviewed graph. - `params` are **bounded and validated per-recipe** by the server's `.strict()` Zod param schema (extra fields rejected); each recipe pins its own resources (checkpoint/LoRA/diffusion AIRs) — the block cannot supply them. Billing is **post-paid** (the underlying orchestrator `customComfy` step bills measured GPU runtime at a fixed rate, so there is NO exact pre-price): - `estimate` returns a per-recipe **display estimate**, not a firm quote — surface it as an estimate; the actual cost is known only on terminal. - Each recipe declares a hard per-job `maxBuzz` ceiling backed by an aggressive step `timeout`; the orchestrator physically caps the job at that ceiling server-side (worst-case Buzz = the timeout in seconds), and the host gates `maxBuzz \<= token.buzzBudget` before submit. A single job therefore cannot exceed the recipe's declared ceiling no matter what.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'customComfy'` |  |
| `recipe` | `string` | A **registered recipe id** (e.g. `'seamless-pano-360'`). Resolved server- side against the code-reviewed recipe registry; an unknown id is rejected fail-closed. The recipe fixes the graph, the resource allowlist, the checkpoint policy, and the `maxBuzz`/`timeout` budget ceiling — none of which the block can influence beyond selecting the recipe + `params`. |
| `params` | `{ prompt: string; seed?: number \| null; engine?: string; accountType?: BuzzAccountType; }` | Bounded, per-recipe-validated parameters. Only the fields a recipe's `.strict()` Zod schema accepts are honored; extra fields are rejected server-side. The common shape: - `prompt` — the generation prompt (a leaf string; injected into the server-built graph by object construction, never string-templated). - `seed` — optional; `null`/omitted lets the orchestrator pick. - `engine` — optional recipe engine-variant selector (e.g. a DiT engine); the recipe defaults it when omitted. - `accountType` — optional preferred Buzz pool (a preference, clamped server-side to pools the viewer actually holds; see {@link BuzzAccountType}). |

**`WorkflowBodyStep`** — object

A **registered orchestrator step**, submitted through the host's step registry — the uniform bridge for step types that are not full generation recipes (image conversion, chat completion, captioning, …). Mirrors the host's `blockStepBodySchema` element-for-element. That schema is `.strict()` with exactly these three fields, so anything else on this object is REJECTED server-side rather than dropped. Trust / safety model (all SERVER-ENFORCED, same posture as {@link WorkflowBodyCustomComfy}): - `step` is a **registered step id** resolved against a code-reviewed, non-DB-editable registry. The wire enum is DERIVED from the registry keys, so an unregistered id is rejected **fail-closed at the schema**, before any translator, any spend reservation, or any orchestrator call. - `params` are **bounded and validated per-step** by that step's own `.strict()` Zod schema. They are deliberately opaque on the wire (the host keeps the transport step-agnostic), so this field is `Record\<string, unknown>` here and the host's per-step schema is the authority for what a given step accepts. An unknown param is a `BAD_REQUEST`, never a silent drop. - Each entry declares its own billing mode and moderation posture in that registry; a step that produces free text has its output scanned before it can reach the block. Registered ids at the time of writing: `'convert-image'` (fixed-price image format conversion + resize) and `'chat-completion'` (fixed-price LLM chat completion over a server-pinned model allowlist). The set grows additively — `step` is typed `string` rather than a literal union on purpose, because the registry lives on the host and a pinned union here would go stale against any host deploy that adds one.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'step'` |  |
| `step` | `string` | A **registered step id** (e.g. `'chat-completion'`). Resolved server-side against the code-reviewed step registry; an unregistered id is rejected fail-closed at the wire schema. |
| `params` | `Record<string, unknown>` | Bounded, per-step-validated parameters. Only the fields that step's `.strict()` schema accepts are honored; anything else is rejected. For `'chat-completion'` the accepted shape is `{ model: string; messages: Array\<{ role: 'system' \| 'user' \| 'assistant'; content: string }>; maxTokens: number; temperature?: number }`, where `model` must be one of the host's allowlisted models and `maxTokens` is REQUIRED and bounded. Documented rather than typed here: the host's schema is the single source of truth, and a hand-mirrored param type in this package would drift against it silently. |

**`BlockWorkflowSnapshot`** — object

The host-mediated view of an orchestrator workflow that an iframe block receives over `postMessage`. This is intentionally a flattened **subset** of `WorkflowSnapshot` from `../orchestrator/` — the host (civitai.com) maps the full orchestrator payload down to this shape before forwarding. Notable differences: - `workflowId` here = orchestrator's `id` - `imageUrls` here = flattened from `steps[].output.images[].url` - `cost.total` is the host-attested total (not the raw orchestrator field) - the status union omits orchestrator-internal states like `unassigned` If the orchestrator gains a status the host doesn't recognize, the host is responsible for mapping it to one of the values here (typically `processing` or `failed`).

| Field | Type | Notes |
|---|---|---|
| `workflowId` | `string` |  |
| `status` | `'pending' \| 'processing' \| 'succeeded' \| 'failed' \| 'expired' \| 'canceled'` |  |
| `cost?` | `{ total: number; }` |  |
| `imageUrls?` | `string[]` |  |
| `error?` | `string` |  |
| `spentAccountType?` | `BuzzAccountType` | The Buzz pool that was the PRIMARY FUNDER of this generation — i.e. the account with the LARGEST debit, which the host stamps onto the workflow snapshot server-side. This is NOT necessarily "the paid account": a generation covered mostly by free/earned Buzz reports `spentAccountType: 'blue'`. Populated by the host from the Phase-1 backend `spentAccountType` field; absent when the host predates it or no spend occurred. Informational only — surface it (e.g. "funded from your yellow balance") but don't gate on it. |
| `autoClaim?` | `{ type: 'dailyBoost'; amount: number; accountType: 'yellow' \| 'blue' \| 'red' \| 'green'; }` | Set when the host opportunistically claimed a Buzz reward on the user's behalf during submit. Currently the host only fires this for the daily boost (25 blue Buzz, one per UTC day) when the user's balance would otherwise have been short by less than the boost amount. Informational only — the block has no obligation to reconcile state (the claim already settled in the orchestrator). A typical block UX surfaces a small "+25 daily boost claimed" notice next to the succeeded result. |

**`AppWorkflow`** — object

The clean, wire-stable projection of ONE orchestrator workflow in the calling app's own generator SUBQUEUE — what `QUERY_APP_WORKFLOWS` / `CANCEL_APP_WORKFLOW` return. Mirrors civitai/civitai's `AppWorkflow` / `projectAppWorkflow` (`src/server/services/blocks/workflow.service.ts`, PR #3164) EXACTLY — KEEP IN LOCKSTEP; a drift here silently strands the reply's transport validator. The host deliberately DROPS every internal/sensitive workflow field (steps, params, prompts, resources, tokens, transactions, metadata, tags) so a block can never read generation internals of a queue it only owns by tag. status: the block-contract status — the orchestrator's `unassigned`/`preparing`/`scheduled` all collapse to `pending`. images: only `available` blobs with a non-null url (see {@link AppWorkflowImage}). cost: the workflow's realized/estimated buzz total, or `null` when absent. createdAt: ISO-8601 string.

| Field | Type | Notes |
|---|---|---|
| `workflowId` | `string` |  |
| `status` | `'pending' \| 'processing' \| 'succeeded' \| 'failed' \| 'expired' \| 'canceled'` |  |
| `images` | `AppWorkflowImage[]` |  |
| `cost` | `number \| null` |  |
| `createdAt` | `string` | ISO-8601. |

**`AppWorkflowImage`** — object

One result image on an {@link AppWorkflow}. Mirrors civitai/civitai's `AppWorkflowImage` projection (`src/server/services/blocks/workflow.service.ts`, PR #3164) — keep in lockstep. Only `available` blobs with a non-null url are surfaced by the host (pending/blocked blobs are dropped rather than handing the block dead links). `width`/`height` are `null` until the orchestrator populates them; `nsfwLevel` is the numeric civitai browsing-level bitflag (1/2/4/8/16), `null` for an unrated blob.

| Field | Type | Notes |
|---|---|---|
| `url` | `string` |  |
| `width` | `number \| null` |  |
| `height` | `number \| null` |  |
| `nsfwLevel` | `number \| null` |  |

**`SubmitWorkflowOptions`** — object

Optional per-submit controls.

| Field | Type | Notes |
|---|---|---|
| `idempotencyKey?` | `string` | A STABLE idempotency key for this logical submit. Reuse the SAME value when RETRYING a submit whose response was lost (timeout / network drop) so the host+orchestrator collapse it to ONE Buzz charge instead of double-charging. Omit → the hook generates a fresh key per `submit()` call (each call is a new logical submit); pass a stable id (e.g. a grid-cell id) to make a retry safe. |

**`WatchWorkflowOptions`** — object

Optional controls for {@link UseBuzzWorkflowReturn.watch}.

| Field | Type | Notes |
|---|---|---|
| `onUpdate?` | `(snapshot: BlockWorkflowSnapshot) => void` | Called with EVERY snapshot the host returns, intermediate ones included, in order. This is the push side of the API: render from here instead of re-reading `result` on a timer. A throw from this callback is not caught — it rejects the `watch` promise. |
| `signal?` | `AbortSignal` | Stop watching. The promise RESOLVES with the last snapshot seen rather than rejecting: an abort is the caller's own decision, not a failure, and the common case (a component unmounting) has nobody left to catch a rejection. 🔴 This does NOT cancel the workflow — it stops watching it. Buzz is already spent and the orchestrator keeps running. To actually stop the work, call {@link UseBuzzWorkflowReturn.cancel}. |
| `waitSeconds?` | `number` | Orchestrator-side hold per poll, in **seconds**. Default {@link DEFAULT_WATCH_WAIT_SECONDS}. `0` disables long polling and falls back to a plain read per `intervalMs`. 🔴 CURRENTLY ADVISORY. It travels on the `POLL_WORKFLOW` message and a host that does not yet read the field simply answers immediately, exactly as today — so `watch` is correct either way, it just polls more often. See the field's note on `BlockToParentMessage`. |
| `intervalMs?` | `number` | Delay between polls, in ms. Default 1500. 🔴 NOT REDUNDANT WITH `waitSeconds`. When the host long-polls, the hold dominates and this is a few percent of overhead. When it does NOT — an older host, or `waitSeconds: 0` — this is the only thing standing between this loop and a request storm. |
| `timeoutMs?` | `number` | Give up and resolve with the last snapshot after this long. Default 10min. |
| `maxRetries?` | `number` | Consecutive transport failures to absorb before rejecting. Default 3. A poll can fail for reasons that have nothing to do with the workflow (a pod rolling, a network blip). Because `watch` OWNS the loop, a single blip would otherwise end a generation the caller's own retry loop used to survive. The counter RESETS on any successful poll, so this bounds a burst, not a lifetime. |

<!-- END GENERATED: bridge -->
</BridgeReference>

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
