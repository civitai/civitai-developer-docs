---
title: Generation bridge reference
description: The field-level generation contract — the WorkflowBody union, the useBuzzWorkflow lifecycle (incl. cancel), and the BlockWorkflowSnapshot result — generated from the published SDK type JSDoc.
sources:
  - npm:@civitai/app-sdk@0.70.0/blocks#WorkflowBody
  - npm:@civitai/blocks-react@0.73.0#useBuzzWorkflow
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

::: info Sending a body from `@civitai/sdk`
The tables below name the React hook. On the default `page-elements` template
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

<BridgeReference>
<!-- BEGIN GENERATED: bridge — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`useBuzzWorkflow()`** — lifecycle

```ts
useBuzzWorkflow(): UseBuzzWorkflow
```

Orchestrates the estimate → confirm → submit → poll dance through the host-mediated `postMessage` path. The host enforces budget rules (`cost_estimate <= token.buzzBudget`) before forwarding to the orchestrator. 🔴 A BUDGET REFUSAL DOES **NOT** REJECT — IT RESOLVES. It comes back as a snapshot with `status: 'failed'`, an `error` string and the `cost` the server declined to charge. It is NOT a cue to call `useBuzzPurchase().openPurchaseModal()`: every resolving refusal is a cap buying Buzz does not raise, or a reply that is not about the wallet at all — the complete list is on {@link UseBuzzWorkflow.submit}. 🔴 RUNNING OUT OF BUZZ REJECTS, and is not marked as such. The orchestrator's refusal reaches the block as {@link WorkflowSubmitError} code `'exception'`, shared with every other thrown submit. Offer a top-up only after checking the viewer's SPENDABLE Buzz ({@link useBuzzBalance}: blue plus the block's domain pool, `buzz:read:self` declared) against the quoted cost — see {@link UseBuzzWorkflow.submit}, which also holds the complete list of resolved refusals. AFTER `submit` FLIPS `status` TO `'polling'`, USE `watch(workflowId)`. It owns the loop, resolves on the terminal snapshot, and pushes every intermediate one to an `onUpdate` callback — so a block consumes a promise/callback rather than running its own timer. `poll(workflowId)` remains the single-round-trip primitive for callers that genuinely want to drive their own cadence; the hand-written `useEffect` + backoff around it that this docstring used to prescribe is no longer the recommended shape. `status === 'confirming'` is IDLE (estimate landed, user reviewing cost) — keep the Generate button enabled. `estimate`/`submit` take a full {@link WorkflowBody} — the discriminated union keyed by `kind`, never a bare `{ prompt }`. The hook forwards the body to the host verbatim and never reads variant-specific fields, so every member flows through unchanged, including any member added later. 🔴 THIS COMMENT DELIBERATELY DOES NOT SAY HOW MANY MEMBERS THERE ARE, OR NAME THEM (#381). It used to open "with THREE members as of `@civitai/app-sdk@0.30.0`" and close by certifying the list "otherwise unchanged" — while the union had FOUR, `WorkflowBodyPassThroughStep` having arrived in 583e8ba (#310). The sentence whose only job was to vouch for the list was the sentence that went stale. `{@link WorkflowBody}`'s own docblock is the single description of the member set; the machine-checked copy is {@link WorkflowBodyArms} below, which fails `tsc` when the union changes in either direction. A count re-typed here could only ever repeat the defect. 🔴 `customComfy` IS ITSELF A UNION, on `mode` — an app CAN ship its own ComfyUI graph, which is a CAPABILITY claim, not a member count, and so is stated here. `WorkflowBodyCustomComfyRecipe` (`mode` omitted or `'recipe'`) names a server-registered recipe; `WorkflowBodyCustomComfyInline` (`mode: 'inline'`) carries the graph itself, plus its declared AIR `resources` and a `maxBuzz` bound. The inline arm is LIVE in production (page-tokens-only, and NOT developer-only — this parenthetical said "developer-only", which is false: no `customComfy` arm runs an app-developer check. See `WorkflowBodyCustomComfyInline` for the refusals that DO run) and this comment used to describe `customComfy` as a recipe-only `{ kind, recipe, params }` shape — written when that was true and never revisited once the arm shipped. A developer working against the live feature read the equivalent claim on the type, believed it over their own instinct, and concluded the capability did not exist. That is the SAME defect the paragraph above records, one member over: an incomplete description of a union, trusted because it read as authoritative. 🔴 A MULTI-STEP `kind: 'workflow'` BODY CHANGES WHAT THE PRICE MEANS — again a capability claim, so it is stated here. `WorkflowBodyWorkflow` submits several orchestrator steps as one workflow through these same calls, and: - `estimate()`'s `cost.total` is NOT a maximum: the orchestrator re-prices a step once the values it references are known and charges the difference; - a workflow the host cannot price FAILS `estimate()` with a `workflow_quote_*` `errorCode` and no `cost`, yet still proceeds on `submit()`, reserved at the app's per-generation budget × the number of steps (one with a training step, or with a `repeat` step at any depth, is refused on both); an older host returns that ceiling as the estimate; - one author fee applies to the whole workflow, not one per step, and it is reversed whole if the workflow does not succeed; - `repeat` iterates only an array in the body's `arguments`, at most 16 times, nested repeats multiplied; - a `failed` result can carry `cost.total > 0` and usable `imageUrls`, because steps that succeeded before the failing one stay charged — read `result.steps`.

| Field | Type | Notes |
|---|---|---|
| `estimate` | `(body: WorkflowBody) => Promise<BlockWorkflowSnapshot>` | Price a workflow without queueing it. Resolves ONLY with a snapshot that carries a numeric `cost.total`. 🔴 REJECTS with {@link WorkflowEstimateError} when the reply is unusable — the estimate errored server-side, or it came back with no numeric cost. Wrap every call in `try/catch`; see that class for why resolving such a reply was civitai/civitai#4159. 🔴 THIS INCLUDES MODERATOR REVIEW PREVIEW, a behaviour change worth knowing before you ship. While an app is under review the host short-circuits every workflow request with `failureSnapshot('not available in review preview')`, so `estimate()` now rejects there where it used to resolve. That is the correct reading — no estimate happened — and it is why the catch is not optional: a block without one turns the reviewer's first click into an unhandled rejection, at exactly the moment it is meant to look healthy. A block that catches shows the reviewer the reason instead. `result` is updated to the returned snapshot BEFORE any rejection, so a failed estimate can never leave a previous, differently-configured estimate's price sitting in `result` for a Confirm gate to read. 🔴 NO AUTOMATIC CONSENT PROMPT HERE, unlike {@link UseBuzzWorkflow.submit}. Blocks call `estimate()` from an effect keyed on the generation form, so it fires on mount and on every parameter change — prompting there would open a consent dialog with no user gesture behind it, once per edit. A missing scope surfaces as an ordinary rejection; show no price and let `submit()` do the asking. A `kind: 'training'` body's reply also carries {@link BlockWorkflowSnapshot.trainingQuote} — the `quoteId` to run it with through `useRunTraining()`. A pass-through `step` body's reply carries {@link BlockWorkflowSnapshot.stepQuote} when its FIXED price is above the token's per-call budget (and within the per-job ceiling). That job cannot run through {@link UseBuzzWorkflow.submit}; run it with `useRunConfirmedStep().runConfirmedStep({ ...body, quoteId: stepQuote.quoteId })`, which has the viewer confirm `stepQuote.total`. No `stepQuote` means the ordinary rules apply — it is also what a host without the feature sends. Where a quote would be granted, this REJECTS instead for a training `$type` or an `input` that is not plain JSON (see {@link BlockWorkflowSnapshot.stepQuote} for the two messages). |
| `submit` | `(body: WorkflowBody, options?: SubmitWorkflowOptions) => Promise<BlockWorkflowSnapshot>` | Queue a workflow. Resolves ONLY with a reply that represents a real workflow OUTCOME — one that was queued, or one the server priced and then refused. 🔴 REJECTS with {@link WorkflowSubmitError} when the reply is failure-shaped and carries no price. Wrap every call in `try/catch`; see that class for why resolving such a reply was the `submit` half of civitai/civitai#4159. **Check `err.code` before saying anything about money** — and note that NEITHER code guarantees nothing was spent. `'exception'` usually means nothing was queued or charged, but a lost response or an in-progress idempotency conflict reaches it too; `'workflow-failed'` means a workflow PROBABLY exists (the `'whatif'` sentinel lands here too and has nothing to poll — guard before polling) and its spend may already be committed. Do not tell the viewer it was free, and on either code prefer reusing the same {@link SubmitWorkflowOptions.idempotencyKey}. 🔴 A BUDGET / SPEND-CAP REJECTION STILL RESOLVES, and that is deliberate. It is a documented outcome, not an error: the server quotes what it refused to charge, so the resolved snapshot has `status === 'failed'` AND a numeric `cost.total`. 🔴 WHAT A RESOLVED `status: 'failed'` CAN MEAN — THE ONE COMPLETE LIST. The `@civitai/blocks-react` README, the `civitai-block-starter` AGENTS.md and the changesets link here rather than restating it. Every case below RESOLVES (`blocks.submitWorkflow` returns it; the REST route answers it with HTTP 200): 1. **Refused before anything ran — the `'failed'` sentinel `workflowId`, a `cost.total`, nothing charged, every reservation released.** - the per-call budget, `token.buzzBudget` (`insufficient buzz budget: …`); - the viewer's daily Buzz cap — or, in its place, the review-session cap (a moderator's run-for-real) or the private-run cap; - the viewer's consent budget (the ceiling they set when they granted the scope); - the app's velocity limit or aggregate daily cap, or a fail-closed "temporarily unavailable" deny; - the dev-session cap (`dev:tunnel`); - a missing price quote for a step ("generation temporarily unavailable"). A training step with no price quote is refused the same way but with NO `cost`, which on this hook REJECTS as `'exception'` instead. 2. **Not confirmed — Buzz may have been spent.** A training run whose submission the server could not confirm: the sentinel id, a `cost.total`, and `submissionUnconfirmed: true` on the REST reply. The reservation is NOT refunded and the run may be going. 🔴 The host bridge forwards only the snapshot, so on this hook that flag never arrives and the reply looks like case 1 — never tell a viewer "nothing was charged" for a resolved failed `kind: 'training'` submit; send them to their trainings instead. 3. **A run was created and came back failed — a REAL `workflowId`.** The reservation is kept and Buzz may have been spent. Priced, it resolves; unpriced, it rejects as `'workflow-failed'`. So only case 1 may be told "could not start, nothing was charged". 🔴 A RESOLVED `'failed'` IS NEVER A TOP-UP CUE — do not wire it to `useBuzzPurchase().openPurchaseModal()`. Case 1 is a set of caps that buying Buzz does not raise, and cases 2 and 3 are not about the wallet. 🔴 THE CASE A TOP-UP DOES FIX — THE VIEWER IS ACTUALLY OUT OF BUZZ — REJECTS. The orchestrator refuses the run, the server throws, and the host answers with its cost-less `failureSnapshot(err)`, so this rejects with {@link WorkflowSubmitError} code **`'exception'`** — the same code as every other thrown submit (a bad request, an outage, a rate limit, an idempotency conflict). Nothing structural marks it as insufficient funds: the code is shared, and `snapshot.error` is the upstream message, server-authored prose that is not a contract. So decide a top-up from the BALANCE, not from the rejection: on `'exception'`, read {@link useBuzzBalance} and offer `openPurchaseModal()` only if the viewer's SPENDABLE Buzz is below the quoted cost. Two things make that read correct: - `useBuzzBalance` needs `buzz:read:self` declared in `block.manifest.json`, and that scope is consent-gated (it is not consent-exempt), so request it like any other gated scope. An anonymous viewer is refused outright. - A block spends only blue plus ITS DOMAIN'S pool: blue + green under an SFW ceiling, blue + yellow under a mature one. The server keys this on the token's DOMAIN ceiling (`maxBrowsingLevel`), so compute it as `isSfwCeiling(useDomainMaturity().maxBrowsingLevel)` (from `@civitai/app-sdk/blocks`; an unknown ceiling counts as SFW) — NOT `useDomainMaturity().isSfw`, which is narrowed by the viewer's own setting — and compare `blue` plus that one pool, never blue + green + yellow, against the quoted cost. 🔴 THIS ALSO INCLUDES MODERATOR REVIEW PREVIEW. While an app is under review the host short-circuits every workflow request with `failureSnapshot('not available in review preview')`, so `submit()` rejects there where it used to resolve — the correct reading (no workflow was queued), and why the catch is not optional. `result` is updated to the returned snapshot BEFORE any rejection, so a failed submit can never leave a previous submit's workflow in `result`. 🔴 CONSENT IS HANDLED FOR YOU. When the token lacks `ai:write:budgeted`, this opens the host's consent dialog, waits for the grant, and re-sends the submit ONCE — with the SAME {@link SubmitWorkflowOptions.idempotencyKey}, so the two attempts are one reservation, not two. Nothing else changes: a failure while the token DOES hold the scope is untouched, a `CONSENT_UNAVAILABLE` environment is never retried, and a second consent failure reaches you unchanged. Opt out with {@link ConsentRetryOptions.autoRequestConsent}`: false`. 🔴 A `kind: 'training'` BODY IS REFUSED before anything is sent — it runs only through `useRunTraining()`. See {@link TRAINING_BODY_SUBMIT_REFUSAL}. So is a pass-through `step` body that carries a `quoteId` — it runs only through `useRunConfirmedStep()`. See {@link CONFIRMED_STEP_BODY_SUBMIT_REFUSAL}. |
| `poll` | `(workflowId: string) => Promise<BlockWorkflowSnapshot>` | ONE host round-trip. The low-level pull primitive — you almost certainly want {@link UseBuzzWorkflow.watch} instead, which owns the loop. |
| `watch` | `(workflowId: string, options?: WatchWorkflowOptions) => Promise<BlockWorkflowSnapshot>` | Watch a workflow to completion. Resolves with the TERMINAL snapshot; calls `onUpdate` with every intermediate snapshot along the way. This is the replacement for the `useEffect` + `setTimeout` backoff every block used to hand-write around {@link UseBuzzWorkflow.poll}. The app consumes a promise and/or a callback; the loop lives here. 🔴 THE LOOP IS SEQUENTIAL AND NON-OVERLAPPING BY CONSTRUCTION — each poll is awaited before the next is scheduled, so exactly one request per watched workflow is ever in flight. That is not tidiness: it is the property that makes a long hold SAFE. A caller-written `setInterval(poll, 2000)` against a host holding 15s would stack ~7 concurrent requests per workflow, and that is precisely why long polling is opt-in on the wire rather than switched on for every deployed block. |
| `cancel` | `(workflowId: string) => Promise<BlockWorkflowSnapshot>` | Cancel a running workflow on the orchestrator (a real server-side stop, not just client-side untracking). The host re-derives ownership from the viewer's orchestrator token, so this can only cancel workflows the viewer owns; the orchestrator rejects others. Resolves with the workflow's (now-canceled) snapshot. |
| `status` | `WorkflowStatus` |  |
| `result` | `BlockWorkflowSnapshot \| null` |  |
| `error` | `Error \| null` |  |

**`WorkflowBody`** — union

Body the block sends to `useBuzzWorkflow().{submit,estimate}`. A real discriminated union keyed by `kind`: - {@link WorkflowBodyTextToImage} (`kind: 'textToImage'`) — the original checkpoint/LoRA/img2img generation body (unchanged, back-compatible). - {@link WorkflowBodyCustomComfy} (`kind: 'customComfy'`) — post-paid ComfyUI, itself a union on `mode`: a bounded, server-registered {@link WorkflowBodyCustomComfyRecipe} (the default), or a {@link WorkflowBodyCustomComfyInline} graph the block ships itself (`mode: 'inline'`; page-tokens-only, and NOT developer-only — that claim used to be here and is false). - {@link WorkflowBodyStep} (`kind: 'step'`, `step` PRESENT) — a bounded, server-registered orchestrator step (the host's step registry; billing mode and moderation posture are declared per entry). - {@link WorkflowBodyPassThroughStep} (`kind: 'step'`, `step` ABSENT) — names an orchestrator `$type` directly and has the host forward `input` unmodified. Bounded by a platform-internal denylist and by `maxBuzz`, not by a registry. - {@link WorkflowBodyTraining} (`kind: 'training'`) — an ai-toolkit LoRA run on a server-prepared dataset of the viewer's own images. ESTIMATE ONLY through `useBuzzWorkflow`; it runs through `useRunTraining()`, whose host-chrome consent dialog is the only way to confirm its quote. - {@link WorkflowBodyWorkflow} (`kind: 'workflow'`) — up to {@link BLOCK_WORKFLOW_MAX_STEPS} orchestrator steps submitted as one workflow, a later step consuming an earlier one's result through a {@link WorkflowStepRef}. Its estimate is not a maximum — read its doc. `kind: 'step'` is therefore itself a union, discriminated on the PRESENCE of `step` — the same nesting {@link WorkflowBodyCustomComfy} has on `mode`. Narrowing on `kind === 'step'` alone leaves both arms in play; narrow further with `'$type' in body` (or `body.step === undefined`) before touching arm-specific fields. New kinds extend this union as the host gains support for them. Narrow on `body.kind` before touching member-specific fields (e.g. `modelId`/`params` live only on the `textToImage` member). ⚠️ Adding a member is additive for PRODUCERS (every existing body still satisfies the union) but narrowing for CONSUMERS that `switch` exhaustively over `kind`. Host code that must handle every member gets a compile error pointing at the new one, which is the intended behaviour.

- `WorkflowBodyTextToImage`
- `WorkflowBodyCustomComfy`
- `WorkflowBodyStep`
- `WorkflowBodyPassThroughStep`
- `WorkflowBodyTraining`
- `WorkflowBodyWorkflow`

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

**`WorkflowBodyCustomComfy`** — union

The `customComfy` member of the {@link WorkflowBody} discriminated union (`kind: 'customComfy'`) — itself a discriminated union on `mode`, mirroring the host's `blockCustomComfyMemberSchema`: - {@link WorkflowBodyCustomComfyRecipe} (`mode` omitted, or `'recipe'`) — names a server-registered, code-reviewed recipe. The default. - {@link WorkflowBodyCustomComfyInline} (`mode: 'inline'`) — ships the ComfyUI graph itself. Page-tokens-only, and fenced by three server-side gates instead of code review. 🔴 NOT developer-only — this line said it was, and no `customComfy` arm runs an app-developer check. See that type's own doc comment for the refusals that DO run. Both arms are `.strict()` server-side, so a body naming BOTH `recipe` and `workflow` is rejected by both rather than resolved to a winner. Narrow on `body.mode === 'inline'` — NOT on the presence of a `mode` key, and not on the presence of a `workflow` key.

- `WorkflowBodyCustomComfyRecipe`
- `WorkflowBodyCustomComfyInline`

**`WorkflowBodyCustomComfyRecipe`** — object

The RECIPE arm of {@link WorkflowBodyCustomComfy} — runs a **server-registered, code-reviewed ComfyUI recipe** end-to-end. The block sends only a registered `recipe` id plus a small, per-recipe-validated `params` object; the civitai server owns the entire graph (built by object construction, so the prompt is a leaf value that cannot perturb graph topology). This is the DEFAULT arm. `mode` is optional here and a body that omits it lands on this arm, so every body written before the inline arm existed is unchanged and keeps working byte-for-byte. Trust / safety model (all SERVER-ENFORCED — mirrors civitai's `blockCustomComfyBodySchema`): - `recipe` is a **registered recipe id** resolved against a code-reviewed, in-repo recipe registry. An unknown id is **rejected server-side, fail- closed** (the schema enum is derived from the registry keys). - `params` are **bounded and validated per-recipe** by the server's `.strict()` Zod param schema (extra fields rejected); each recipe pins its own resources (checkpoint/LoRA/diffusion AIRs) — the block cannot supply them. Billing is **post-paid** (the underlying orchestrator `customComfy` step bills measured GPU runtime at a fixed rate, so there is NO exact pre-price): - `estimate` returns a per-recipe **display estimate**, not a firm quote — surface it as an estimate; the actual cost is known only on terminal. - Each recipe declares a hard per-job `maxBuzz` ceiling backed by an aggressive step `timeout`; the orchestrator physically caps the job at that ceiling server-side (worst-case Buzz = the timeout in seconds), and the host gates `maxBuzz <= token.buzzBudget` before submit. A single job therefore cannot exceed the recipe's declared ceiling no matter what.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'customComfy'` |  |
| `mode?` | `'recipe'` | The arm discriminator, OPTIONAL on this arm. Omit it (the normal case) or set it to `'recipe'`; both land here. It exists so the inline arm can be selected explicitly with `mode: 'inline'`. 🔴 The host's schema declares this `z.literal('recipe').optional()` — NOT `.default('recipe')` — precisely so a body with no `mode` key still parses as a recipe. Do not "helpfully" send `mode: undefined` as a spread from an optional variable if you can avoid it; it parses fine today, but omitting the key entirely is the shape every deployed block sends. |
| `recipe` | `string` | A **registered recipe id** (e.g. `'seamless-pano-360'`). Resolved server- side against the code-reviewed recipe registry; an unknown id is rejected fail-closed. The recipe fixes the graph, the resource allowlist, the checkpoint policy, and the `maxBuzz`/`timeout` budget ceiling — none of which the block can influence beyond selecting the recipe + `params`. |
| `params` | `{ prompt: string; seed?: number \| null; engine?: string; accountType?: BuzzAccountType; }` | Bounded, per-recipe-validated parameters. Only the fields a recipe's `.strict()` Zod schema accepts are honored; extra fields are rejected server-side. The common shape: - `prompt` — the generation prompt (a leaf string; injected into the server-built graph by object construction, never string-templated). - `seed` — optional; `null`/omitted lets the orchestrator pick. - `engine` — optional recipe engine-variant selector (e.g. a DiT engine); the recipe defaults it when omitted. - `accountType` — optional preferred Buzz pool (a preference, clamped server-side to pools the viewer actually holds; see {@link BuzzAccountType}). |

**`WorkflowBodyCustomComfyInline`** — object

The INLINE-GRAPH arm of {@link WorkflowBodyCustomComfy} (`kind: 'customComfy'`, `mode: 'inline'`) — the block ships **the ComfyUI graph itself**, so it can run a workflow the server's recipe registry does not contain. 🔴 THIS IS LIVE IN PRODUCTION. An earlier revision of this doc comment asserted that "there is no way for a block to run an arbitrary/unreviewed graph". That is FALSE and was removed: it predates the inline arm and cost a developer a dogfooding session, who trusted it over a working feature. 🔴 IT IS NOT "APP DEVELOPERS ONLY", AND THAT CLAIM USED TO BE HERE. This block read "**App developers only** — the host runs `assertViewerIsAppDeveloper` on every `customComfy` estimate AND submit. A non-developer viewer of your published block cannot submit one." Both sentences are FALSE: NEITHER `customComfy` arm runs any app-developer check, on the estimate or on the submit. The host's own schema module records the same retraction. Do not reintroduce it, in any wording — it is a SECURITY claim, and believing it is what makes an author ship an inline graph they would not ship to every viewer. An ordinary viewer of your published block CAN reach this arm once the refusals below pass. WHO CAN USE IT — stated as the refusals the host actually runs, before either arm's body is inspected. Each is a path your block has to handle: - **Page tokens only** — a model-bound token is rejected. - The token must carry the **`ai:write:budgeted`** consent scope. - The viewer must be **signed in** — a token whose subject does not resolve is refused. - The viewer must be **enabled for Apps** (the runtime kill-switch, evaluated on the token's subject; this is a closed beta). - On **submit** only: the token must carry a **positive per-call Buzz budget**. That budget is minted from YOUR OWN manifest (`page.buzzBudgetPerGen`) — it is not a property of the viewer. A registered recipe is how you get a reviewed graph you do not have to ship in the body. It is not a way onto a surface the inline arm cannot reach. WHAT REPLACED CODE REVIEW. A recipe is reviewed in-repo, and that review was the trust root. An inline graph has none, so the host substitutes three mechanical, fail-closed gates that all run BEFORE any spend or orchestrator call (a rejection therefore costs nothing): 1. **AIR containment.** Every AIR URN appearing anywhere in the graph — including as an object KEY — must also appear in {@link resources}. The match is whole-string (trimmed, case-insensitive), so an AIR embedded in a longer string does not count as declared and the body is rejected. 2. **Entitlement**, over the declared `resources`. Stricter than the onsite generator: early-access `hasAccess` and Private/epoch subscription are both folded in, an unresolvable version id is a hard `FORBIDDEN`, and a resource the site would silently SUBSTITUTE with a sibling version is REJECTED instead — your graph names one specific AIR and nothing rewrites it. 3. **Moderation sweep.** The audit reads the declared `prompt` AND every distinct string leaf in the graph, because a real graph carries its prompts inside `CLIPTextEncode` nodes. A clean declared `prompt` cannot launder a graph prompt.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'customComfy'` |  |
| `mode` | `'inline'` | The arm discriminator. REQUIRED and exactly `'inline'` — omitting it does not "default to inline because a `workflow` is present"; it routes the body to the recipe arm, which then rejects it for a missing `recipe`. |
| `workflow` | `Record<string, InlineComfyNode>` | The ComfyUI `/prompt` graph, keyed by node id (the same object shape ComfyUI's "Save (API Format)" export produces). Server-enforced bounds — all three REJECT, none truncates: - at least **1** node, at most **300**; - the serialized graph must be at most **262144 bytes** (256 KB); - nesting at most **128** levels deep (the gate walks the graph, and a graph it cannot finish walking is one it cannot prove safe). |
| `resources` | `string[]` | The DECLARED DOWNLOAD MANIFEST: every resource the graph needs, as an AIR URN. This is the array the entitlement gate runs over, and gate 1 above is what makes gating it sufficient. 🔴 **Declaring is not optional and it is not inferred.** Every AIR your graph names must ALSO be listed here or the submit is rejected — and anything the graph references that is missing from this list would fail at load time inside ComfyUI anyway. At most **24** entries, each at most 512 characters. A `civitai`-sourced AIR MUST carry a model VERSION id (`urn:air:<ecosystem>:<type>:civitai:<modelId>@<versionId>`) — without one there is no version to check entitlement against and the body is rejected. The AIR grammar is read strictly here: all of `urn:air:<ecosystem>:<type>:<source>:<id>[@<version>]` is required, unlike the lenient parser used elsewhere. The permitted AIR `type`s are model WEIGHTS — `checkpoint`, `diffusion_model`, `unet`, `lora`, `lycoris`, `dora`, `embedding`, `hypernet`, `controlnet`, `vae`, `upscaler`, `clip`, `clipvision`, `text_encoders`, `motion` and a few siblings. An `oci:image` container AIR is NOT permitted. Anything the allowlist does not name is rejected rather than passed through. Duplicate entries are rejected, not deduped. |
| `prompt?` | `string` | The prompt to surface and to audit alongside the graph sweep. Optional (defaults to `''` server-side) and at most 1500 characters. It is NOT the moderation surface on its own — the graph's own strings are swept too — and it is NOT what generates: the text that generates is whatever your `CLIPTextEncode` node carries. Set it to the same text so what you show the user matches what ran. |
| `negativePrompt?` | `string` | Optional declared negative prompt, at most 1500 characters. Same posture as {@link prompt}. |
| `maxBuzz` | `number` | The per-job Buzz ceiling. Required, an integer in **1…250**. 🔴 **IT IS ALSO THE STEP TIMEOUT, IN SECONDS.** The host stamps `stepTimeoutSeconds = maxBuzz` — there is only one number, which is exactly what makes the ceiling physically enforceable rather than merely asserted. So `maxBuzz: 10` does not buy a cheap generation; it buys a job that is KILLED after 10 seconds and comes back `expired`. Size it to the wall-clock time your graph actually needs, not to what you hope to pay. You are billed the REAL cost. Billing is post-paid against measured GPU seconds and settles to actual, refunding the unused remainder of the ceiling — so a generous `maxBuzz` costs nothing extra when the job finishes early. The only thing a low value guarantees is a timeout. `estimate` on an inline body echoes this number back as `cost.total`. That is an upper bound, not a price — surface it as "up to N Buzz". There is no honest per-graph estimate: the orchestrator forwards the graph opaquely and cannot price it. The host additionally requires `maxBuzz <= token.buzzBudget` before submit; over-budget comes back as a `failed` snapshot naming both numbers. |

**`WorkflowBodyStep`** — object

The REGISTRY ARM of the `kind: 'step'` member — a **registered orchestrator step**, submitted through the host's step registry, the uniform bridge for step types that are not full generation recipes (image conversion, chat completion, captioning, …). 🔴 `kind: 'step'` HAS TWO ARMS, discriminated by whether `step` is present. This one names a REGISTERED id and the host translates it; the other is {@link WorkflowBodyPassThroughStep}, which omits `step`, names an orchestrator `$type` directly and has the host forward `input` unmodified. The trust model below describes THIS arm only — the pass-through arm deliberately drops four of these controls, and its own doc comment enumerates which. Mirrors the host's `blockStepBodySchema` element-for-element. That schema is `.strict()` with exactly these three fields, so anything else on this object is REJECTED server-side rather than dropped. Trust / safety model (all SERVER-ENFORCED, same posture as {@link WorkflowBodyCustomComfy}): - `step` is a **registered step id** resolved against a code-reviewed, non-DB-editable registry. THIS ARM's wire enum is DERIVED from the registry keys, so an unregistered id is rejected **fail-closed at the schema**, before any translator, any spend reservation, or any orchestrator call. 🔴 That is a statement about the REGISTRY ARM, not about `kind: 'step'` as a whole: a body that omits `step` lands on {@link WorkflowBodyPassThroughStep} instead, where an id the registry has never heard of is exactly the supported case. - `params` are **bounded and validated per-step** by that step's own `.strict()` Zod schema. They are deliberately opaque on the wire (the host keeps the transport step-agnostic), so this field is `Record<string, unknown>` here and the host's per-step schema is the authority for what a given step accepts. An unknown param is a `BAD_REQUEST`, never a silent drop. - Each entry declares its own billing mode and moderation posture in that registry; a step that produces free text has its output scanned before it can reach the block. Registered ids at the time of writing: `'convert-image'` (fixed-price image format conversion + resize) and `'chat-completion'` (fixed-price LLM chat completion over a server-pinned model allowlist). The set grows additively — `step` is typed `string` rather than a literal union on purpose, because the registry lives on the host and a pinned union here would go stale against any host deploy that adds one.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'step'` |  |
| `step` | `string` | A **registered step id** (e.g. `'chat-completion'`). Resolved server-side against the code-reviewed step registry; on THIS arm an unregistered id is rejected fail-closed at the wire schema. Its presence is also the ARM DISCRIMINATOR. Omit it and the body is read as a {@link WorkflowBodyPassThroughStep} instead, where an unregistered id is not rejected because there is no registry lookup at all. |
| `params` | `Record<string, unknown>` | Bounded, per-step-validated parameters. Only the fields that step's `.strict()` schema accepts are honored; anything else is rejected. For `'chat-completion'` the accepted shape is `{ model: string; messages: Array<{ role: 'system' \| 'user' \| 'assistant'; content: string }>; maxTokens: number; temperature?: number }`, where `model` must be one of the host's allowlisted models and `maxTokens` is REQUIRED and bounded. Documented rather than typed here: the host's schema is the single source of truth, and a hand-mirrored param type in this package would drift against it silently. |

**`WorkflowBodyPassThroughStep`** — object

The PASS-THROUGH ARM of the `kind: 'step'` member — the block names an ORCHESTRATOR `$type` directly and the host forwards `input` **unmodified**. No registry entry, no server-side translator, no per-step param schema. Mirrors the host's `blockPassThroughStepBodySchema`. That schema is `.strict()` with exactly these fields, so anything else on this object is REJECTED server-side rather than dropped. 🔴 **`step` IS THE ARM DISCRIMINATOR AND IT MUST BE ABSENT.** Send `{ kind: 'step', $type, input, maxBuzz }` with no `step` key at all. It is typed `step?: undefined` here so that omitting it satisfies the type while setting it to anything is a compile error — the host's discriminated union uses `z.undefined()` for the same job, and a body carrying both `step` and `$type` is rejected by BOTH arms (each is `.strict()`) rather than resolved to a winner. WHAT THIS ARM GIVES UP relative to {@link WorkflowBodyStep}. Four of the registry's controls are deliberately absent, by operator decision — this is documented so it reads as a decision rather than an oversight: 1. **No per-step `.strict()` param schema.** `input` is opaque; the orchestrator's own per-`$type` validation is the only shape gate, and it runs AFTER the spend reservation rather than at the wire. 2. **No moderation posture and no prompt audit.** Nothing audits `input`. Moderation moved to the PUBLISH boundary — nothing a block generates is public until published, and that path is moderated. 3. **No resource policy / `urn:air:` scan.** AIR resources are ALLOWED here. Spend, not entitlement, is the binding control. 4. **No `billingMode` and no load-time price invariant.** {@link maxBuzz} and a per-request orchestrator `whatif` quote replace them — see `maxBuzz` below for how the two combine. WHAT STILL BOUNDS IT, all server-side: - A **denylist** of platform-internal `$type`s (scanners, moderation classifiers, hashing/model-ingestion, web egress) is refused by the host router before any spend reservation or orchestrator call. It is a DENYLIST, not an allowlist: a `$type` the host has never heard of is allowed through by construction, which is the point of this arm. `training` and `imageResourceTraining` are deliberately NOT on it (a host operator decision): both may be submitted here, on the same terms as every other `$type`. If the orchestrator quotes the run, the host reserves the quote (or `maxBuzz`, if larger), gated by the token's per-call budget, and stamps no timeout; if it does not, `maxBuzz` is both the reservation and the timeout — see `maxBuzz` below. Whether a given training input is quoted, and at what price, is the orchestrator's answer, not this package's: read it from `estimate`. A host that supports it reports the trained epochs on {@link BlockWorkflowSnapshot.trainedEpochs} without exposing the checkpoint itself. - `$type` is bounded to **1…64 characters** and `input` to **262144 bytes** (256 KB) serialized. Both REJECT; neither truncates. - **`repeat` is refused on this arm**, outright: a `repeat` may only iterate an array in a body's own `arguments`, and this arm has none. Use a `kind: 'workflow'` body ({@link WorkflowBodyWorkflow}) to repeat a step. - `maxBuzz` is the app's spend knob, and the host's quote can raise the reservation above it — see its own note below.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'step'` |  |
| `step?` | `undefined` | 🔴 THE ARM DISCRIMINATOR — **omit this key**. It exists in the type only so that a body which sets it cannot be mistaken for a pass-through body: the only assignable value is `undefined`, and the wire payload carries no `step` key at all (JSON cannot express `undefined`). To name a REGISTERED step id instead, you want {@link WorkflowBodyStep}. |
| `$type` | `string` | The ORCHESTRATOR step type to run, verbatim — e.g. `'imageBackgroundRemoval'`. Required, 1…64 characters. This is the orchestrator's own `$type` discriminator, NOT a Civitai step- registry id, and it is not resolved against any allowlist. It is refused only if it names a platform-internal type (the denylist above; the match is case-insensitive). The host records the submitted value as the subtype of the generation it stamps, so a `$type` longer than the cap is rejected rather than silently degraded. |
| `input` | `Record<string, unknown>` | The orchestrator step's own input object, **forwarded unmodified**. The host does not read, rewrite, merge or default any field in here — that is the whole point of this arm, and the step the orchestrator receives carries an `input` byte-identical to this value. Consequently the orchestrator's per-`$type` schema is the ONLY authority for what a given `$type` accepts; nothing in this package or on the host mirrors it. Bounded only by size: at most **262144 bytes** (256 KB) serialized, which is a payload-DoS bound and not a shape gate. |
| `maxBuzz` | `number` | The app's declared per-job Buzz amount: the least the host reserves, and — only when unquoted — the step timeout in seconds. NOT a spend ceiling (see below). Required, an integer in **1…250**. 🔴 **WHAT IT BOUNDS DEPENDS ON WHETHER THE HOST GOT A QUOTE** — this is NOT the mechanism of {@link WorkflowBodyCustomComfyInline.maxBuzz}, which is always the timeout. On both `estimate` and `submit` the host first asks the orchestrator for a `whatif` quote of this exact step, then: - **Quoted** — the host reserves `max(maxBuzz, quote)` and stamps NO step timeout. That reservation can exceed 250: it is gated against the token's per-call budget (`token.buzzBudget` — the app's per-generation budget, capped at 1000 when the host mints a production token), and a submit whose reservation exceeds that budget comes back `failed` with an `insufficient buzz budget` error before any Buzz is reserved. - **Unquoted** (the orchestrator returned no price, or the quote could not be had) — the host reserves `maxBuzz` and stamps it as the step timeout, in seconds. `maxBuzz: 10` then buys a job that is KILLED after 10 seconds and comes back `expired`, so size it to the wall-clock time the step actually needs. The same per-call budget gate applies. The timeout bounds wall-clock time; it bounds spend only for a step billed by compute time. A step priced per unit can bill ABOVE `maxBuzz`. `estimate` on a pass-through body returns, as `cost.total`, the number the submit would reserve: `max(maxBuzz, quote)`, or `maxBuzz` when unquoted. It is a reservation, NOT a guaranteed ceiling: the terminal settle refunds any unused remainder, but nothing on this arm stops a job billing above the reservation (see the unquoted case above). Do not present it to the viewer as a maximum. |
| `quoteId?` | `string` | The viewer-confirmable quote this job is charged against — {@link BlockStepQuote.quoteId} from this body's own estimate (`sq_` + 32 lowercase hex characters, {@link BLOCK_STEP_QUOTE_ID_REGEX}). OMIT it everywhere except a CONFIRMED run: an estimate never carries it, and neither does an ordinary submit. It is REQUIRED on `RUN_CONFIRMED_STEP` (`useRunConfirmedStep()` in `@civitai/blocks-react`), the only message that can run a job priced above the token's per-call budget — see {@link BlockWorkflowSnapshot.stepQuote} for the flow. 🔴 A body carrying it is NOT runnable through `SUBMIT_WORKFLOW`. The server charges a confirmed job only against a quote the viewer confirmed in Civitai's own dialog from a signed-in session, so the same body sent as a plain submit is refused. Change nothing else in the body between the estimate and the run: the server checks it against the quoted one (`quoteId` itself is excluded from that comparison). |

**`WorkflowBodyTraining`** — object

Train a LoRA with the ai-toolkit engine on a dataset Civitai prepared from the VIEWER'S OWN images — the App Blocks `kind: 'training'` workflow body. ## Availability — read before building on it - 🔴 Behind the host flag **`app-blocks-training-kind`**, which ships OFF and is evaluated per viewer. Where it is off, every training call is refused (`training from apps is not enabled`). - **Page apps only** (`/apps/run/<slug>`). The model slot answers both training messages with an error, and the server refuses a non-page token. - The manifest must declare **`ai:write:budgeted`** and the viewer must have granted it; the viewer must be signed in. - **Not from a development or review session**: dev tokens (`dev:live`, dev tunnel) and review-sandbox tokens are refused, run-for-real included. Use the mock host (`createMockHost` / `Harness`) to build the flow. ## The flow 1. **Dataset** — `usePrepareTrainingDataset()` (`PREPARE_TRAINING_DATASET`) with `[{ imageId, caption }]`. Only the viewer's OWN scanned, unflagged images within the page's maturity ceiling are admitted; the rest come back in `rejected`. You get an opaque {@link WorkflowBodyTraining.datasetId}. 2. **Quote** — `useBuzzWorkflow().estimate(body)` with this body, `quoteId` ABSENT. The reply's {@link BlockWorkflowSnapshot.trainingQuote} is the orchestrator's own price for exactly this run, stored server-side. 3. **Run** — `useRunTraining().runTraining({ ...body, quoteId })` (`RUN_TRAINING`). Civitai shows the viewer a consent dialog in ITS chrome — price, base model, length, dataset size, all read back from the server, never from your body — and submits only on their click. 4. **Follow** — `useBuzzWorkflow().watch(snapshot.workflowId)`. 🔴 `useBuzzWorkflow().submit()` REFUSES THIS BODY before sending it. The server charges a training run only against a quote the viewer confirmed from a signed-in session, which only `RUN_TRAINING`'s dialog can record. ## Money There is no `maxBuzz` and no timeout knob, on purpose: the price is the quote. A run may cost more than the token's per-call `buzzBudget` (the viewer confirms the exact price), up to {@link BLOCK_TRAINING_MAX_BUZZ_PER_RUN} (5,000 Buzz); an estimate above that is refused.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'training'` |  |
| `datasetId` | `string` | The handle `usePrepareTrainingDataset()` returned — `tds_` + 32 hex characters. |
| `engine` | `'ai-toolkit'` | The only engine accepted. |
| `model` | `string` | A base-model key from Civitai's training catalog (1…64 characters), resolved and gated server-side. Custom AIRs are not accepted. |
| `params` | `AiToolkitTrainingParams` |  |
| `triggerWord` | `string` | At most {@link BLOCK_TRAINING_TRIGGER_WORD_MAX_CHARS} characters. Moderated like a prompt. |
| `samplePrompts` | `string[]` | At most {@link BLOCK_TRAINING_SAMPLE_PROMPTS_MAX} prompts of at most {@link BLOCK_TRAINING_SAMPLE_PROMPT_MAX_CHARS} characters each. Moderated like prompts. |
| `quoteId?` | `string` | The quote this run is charged against — {@link BlockTrainingQuote.quoteId} from the estimate (`tq_` + 32 hex characters). OMIT it on the estimate; REQUIRED on `RUN_TRAINING`. The server checks the rest of the body against the body that was quoted, so change nothing else between the two. |

**`BlockTrainedEpoch`** — object

One entry of {@link BlockWorkflowSnapshot.trainedEpochs} / {@link AppWorkflow.trainedEpochs}.

| Field | Type | Notes |
|---|---|---|
| `$type` | `'training' \| 'imageResourceTraining'` | Which pass-through training `$type` produced this epoch. The SDK's inbound validator checks only that it is a string, so a value the host adds later can arrive — give an exhaustive `switch` a default branch. |
| `epochNumber` | `number` | Pass as `epoch` to the `/models/train/from-orchestrator` wizard route. |

**`AiToolkitTrainingParams`** — alias

`params` of a {@link WorkflowBodyTraining} — the host's `aiToolkitTrainingParamsSchema`, the same schema Civitai's own training form validates against, discriminated on `ecosystem`. ⚠️ THE ECOSYSTEM LIST IS CLOSED HERE AND OPEN ON THE HOST. The host adds ecosystems over time; until this package mirrors one, a body naming it does not type-check. That is the cost of a typed copy, paid deliberately: a free `string` would let a typo through to a refused estimate.

```ts
AiToolkitTrainingParamsBase & ({
    ecosystem: AiToolkitPlainEcosystem;
    modelVariant?: undefined;
} | {
    ecosystem: 'sd3';
    modelVariant: 'large' | 'medium';
} | {
    ecosystem: 'flux1';
    modelVariant: 'dev' | 'schnell';
} | {
    ecosystem: 'wan';
    modelVariant: '2.1' | '2.2';
} | {
    ecosystem: 'flux2klein';
    modelVariant: '4b' | '9b';
} | {
    ecosystem: 'qwen21' | 'ming' | 'yue2';
    modelVariant?: undefined;
    batchSize?: 1;
} | {
    ecosystem: 'ace_step_15_xl';
    modelVariant: 'base' | 'sft';
})
```

**`AiToolkitTrainingParamsBase`** — object

The fields every ai-toolkit ecosystem shares (`aiToolkitBaseParams` on the host).

| Field | Type | Notes |
|---|---|---|
| `engine` | `'ai-toolkit'` |  |
| `epochs?` | `number` | Saved checkpoint count, integer 1…50. With `steps` absent it is also the length knob. |
| `steps?` | `number` | Total training steps, integer ≥ 1 — the primary length (and price) knob. |
| `batchSize?` | `number` | Integer ≥ 1. Exactly `1` on the `qwen21` / `ming` / `yue2` ecosystems. |
| `sampleCfgScale?` | `number` |  |
| `sampleStrength?` | `number` |  |
| `continueFrom?` | `string` |  |
| `resolution` | `number \| null` |  |
| `lr` | `number` | Learning rate. 🔴 Must be BELOW `0.1` unless `optimizerType` is `prodigy` or `prodigy8bit` — a host refinement this type cannot express; a body that breaks it is refused at estimate. |
| `textEncoderLr` | `number \| null` |  |
| `trainTextEncoder` | `boolean` |  |
| `lrScheduler` | `AiToolkitLrScheduler` |  |
| `optimizerType` | `AiToolkitOptimizerType` |  |
| `networkDim` | `number \| null` |  |
| `networkAlpha` | `number \| null` |  |
| `noiseOffset` | `number \| null` |  |
| `minSnrGamma` | `number \| null` |  |
| `flipAugmentation` | `boolean` |  |
| `shuffleTokens` | `boolean` |  |
| `keepTokens` | `number` |  |
| `numRepeats?` | `number` |  |

**`AiToolkitPlainEcosystem`** — union

The ai-toolkit ecosystems that take NO `modelVariant` — send the key absent. (`qwen21` / `ming` / `yue2` also take none; they live on their own arm of {@link AiToolkitTrainingParams} because they pin `batchSize` to `1`.)

- `'sd1'`
- `'sdxl'`
- `'chroma'`
- `'qwen'`
- `'zimageturbo'`
- `'zimagebase'`
- `'ltx2'`
- `'ltx23'`
- `'ltx25'`
- `'minimaxh3'`
- `'ernie'`
- `'anima'`
- `'boogu'`
- `'krea2'`
- `'mageflow'`
- `'ideogram4'`
- `'ace_step_15'`

**`AiToolkitLrScheduler`** — union

`lrScheduler` values the host's ai-toolkit schema accepts.

- `'constant'`
- `'constant_with_warmup'`
- `'cosine'`
- `'linear'`
- `'step'`

**`AiToolkitOptimizerType`** — union

`optimizerType` values the host's ai-toolkit schema accepts.

- `'adamw'`
- `'adamw8bit'`
- `'adam8bit'`
- `'lion'`
- `'lion8bit'`
- `'adafactor'`
- `'adagrad'`
- `'prodigy'`
- `'prodigy8bit'`
- `'automagic'`

**`BlockTrainingQuote`** — object

{@link BlockWorkflowSnapshot.trainingQuote}.

| Field | Type | Notes |
|---|---|---|
| `quoteId` | `string` | `tq_` + 32 hex characters. Opaque — pass it back verbatim. |
| `total` | `number` | The quoted price, in Buzz. |
| `imageCount` | `number` | How many images the prepared dataset holds. |
| `expiresAt` | `string` | ISO-8601. The quote cannot be run after this. |

**`WorkflowBodyWorkflow`** — object

The `workflow` member of {@link WorkflowBody} — SEVERAL orchestrator steps submitted as ONE workflow, where a later step can consume an earlier step's result through a {@link WorkflowStepRef}. It travels through the same messages and hooks as every other kind (`estimate`, `submit`, `watch`, `cancel`, a batch-estimate cell, `useWorkflowBatch`). Between 1 and {@link BLOCK_WORKFLOW_MAX_STEPS} steps. There is no `maxBuzz`: the spend ceiling is the app's per-generation budget × the number of steps, enforced by the host. The host's schema is strict: an unknown key on the body or on a step is rejected, not dropped. 🔴 THREE THINGS ABOUT THE PRICE, all of them different from a single-step body: 1. **The estimate is NOT a maximum.** When a step's input references an earlier step, the orchestrator re-prices that step once the referenced values are known and charges the difference. Show the estimate as an estimate; never as "you will pay at most". 2. **A workflow the host cannot price has no estimate, but its submit still proceeds.** `estimate()` (and that body's cell in a batch estimate) FAILS with no `cost` and `errorCode` `'workflow_quote_rejected'`, `'workflow_quote_unavailable'` or `'workflow_quote_unpriced'` — see {@link BlockWorkflowSnapshot.errorCode} for which of them a retry can clear. `submit()` of the same body is NOT refused: it is reserved at the ceiling above instead of at a quote. So a failed estimate does not predict a refused submit. Two exceptions are refused on BOTH, before any reservation: a workflow containing a training step, exactly as on the single-step arm (a `training-quote-*` `errorCode`), and one with a `repeat` step at any depth (`errorCode: 'workflow_repeat_unbounded'`). Their `error` states the cause; only "none could be obtained; try again" is one a retry of the same body can clear. (An OLDER host returns the ceiling as the estimate's `cost.total` instead of failing, so there a total equal to the ceiling may be unpriced.) 3. **One author fee per workflow**, not one per step, computed on the QUOTED base. The estimate's `cost.authorFee` is that single fee, already inside `cost.total`. If the workflow bills more than the quote, the fee charged is held to the fee shown. A workflow that does not succeed has its WHOLE fee reversed, even when earlier steps delivered output. The app's velocity limit counts one unit per step, and a `repeat` step one per iteration (nested repeats multiplied) instead of one. 🔴 A FAILED WORKFLOW CAN STILL HAVE COST AND IMAGES. Steps that succeeded before the failing one stay charged, so a `failed` snapshot can carry `cost.total > 0` and usable `imageUrls`. See {@link BlockWorkflowSnapshot.steps}. 🔴 REQUIRES A HOST THAT KNOWS THIS KIND. An older host refuses the body.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'workflow'` |  |
| `steps` | `WorkflowBodyWorkflowStep[]` | The steps, in order. 1…{@link BLOCK_WORKFLOW_MAX_STEPS}. |
| `arguments?` | `Record<string, unknown>` | Values the steps can read through `{ $ref: '$arguments', path }` — one place to put a prompt or a seed that several steps share. |

**`WorkflowBodyWorkflowStep`** — object

One step of a {@link WorkflowBodyWorkflow}.

| Field | Type | Notes |
|---|---|---|
| `name?` | `string` | What later steps call this one in a {@link WorkflowStepRef}, and the `name` it reports under on {@link BlockWorkflowSnapshot.steps}. Optional: an unnamed step is named by its position (`'$0'`, `'$1'`, …). A lowercase letter followed by up to 31 of `a-z`, `0-9`, `_` or `-` (`/^[a-z][a-z0-9_-]{0,31}$/`), unique within the body, and not `'block-step'`, which is reserved. A name that breaks a rule is refused with `errorCode: 'workflow_ref_invalid'`. |
| `$type` | `string` | The ORCHESTRATOR step type to run, verbatim — e.g. `'imageGen'`. Not resolved against any allowlist: it is refused only when it names a platform-internal type (scanners, moderation classifiers, hashing, web scrape/search, and the retired `textToImage` step type), with `errorCode: 'workflow_step_denied'`. 1…64 characters. Two step types are read by shape, because they name their sources outside a {@link WorkflowStepRef}: - **`repeat` — over `arguments` only, at most {@link BLOCK_WORKFLOW_REPEAT_MAX_ITERATIONS} iterations.** Its input must be exactly `{ for: { $ref, path, as }, template: { $type, name?, input? } }` with `for.$ref === '$arguments'` and `path` naming an ARRAY in the body's `arguments`; its length is the iteration count, nested repeats multiplied. A repeat over another step's output, a missing or non-array path, or too many iterations is refused with `errorCode: 'workflow_repeat_unbounded'`; a wrong shape, or repeats nested more than 4 deep, with `workflow_ref_invalid`. Inside the template the `as` name is a source a reference may name; it may not equal a step name. The template's `$type` is held to the denylist too. - **`merge`** — every entry of `input.fields` needs a string `$ref` and a `reduce`, and each `$ref` must name `$arguments` or an EARLIER step, never a repeat variable. Each counts toward the 64-reference cap. Otherwise `workflow_ref_invalid`. |
| `input` | `Record<string, unknown>` | The step's own input object. Any value in it, at any depth, may be a {@link WorkflowStepRef}. The orchestrator's per-`$type` schema is the only authority for what a given `$type` accepts. Every step's `input` plus the body's `arguments` may total at most 262144 bytes (256 KB) serialized. |
| `suppressOutput?` | `boolean` | `true` marks an INTERMEDIATE step: its blobs are not surfaced, neither on its own {@link BlockWorkflowStepSnapshot.imageUrls} nor in the top-level {@link BlockWorkflowSnapshot.imageUrls}. The step still runs and is still charged. |

**`WorkflowStepRef`** — object

A REFERENCE inside a `kind: 'workflow'` step's `input` — the orchestrator's own mechanism for feeding one step's result into a later step. Put it anywhere a value would go, at any depth. `$ref` names where the value comes from: - `'$arguments'` — the body's own {@link WorkflowBodyWorkflow.arguments}; - the `name` of an EARLIER step in the same body; - `'$<index>'` — an EARLIER step you did NOT name, by its zero-based position (`'$0'` is the first step). A step that has a `name` is referenced by that name only. An object counts as a reference only when it has BOTH `$ref` and `path` and no key other than `default` / `format`; anything else is ordinary input. `path` selects the value inside that source, e.g. `'output.images[0].url'` for a step, or `'prompt'` for `$arguments`. The orchestrator resolves it; the path is not checked by this package or by the host. 🔴 A reference may only point BACKWARDS. A step that names itself, a later step, or a step that does not exist is refused by the host with `errorCode: 'workflow_ref_invalid'` before anything is priced or reserved. A body may hold at most 64 references, in inputs nested at most 32 levels. `default` is the value used when the path resolves to nothing; `format` is a template applied to the resolved value. Both are passed to the orchestrator unmodified.

| Field | Type | Notes |
|---|---|---|
| `$ref` | ``'$arguments' \| `$${number}` \| (string & {})`` |  |
| `path` | `string` |  |
| `default?` | `unknown` |  |
| `format?` | `string` |  |

**`BlockWorkflowStepSnapshot`** — object

One entry of {@link BlockWorkflowSnapshot.steps}.

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | The step's `name` from the body, or the name the host gave an unnamed step. |
| `$type` | `string` | The orchestrator step type that ran. |
| `status` | `'pending' \| 'processing' \| 'succeeded' \| 'failed' \| 'expired' \| 'canceled'` |  |
| `imageUrls?` | `string[]` | This step's own image urls. Omitted when it has none, and always omitted for a step submitted with `suppressOutput: true`. |
| `output?` | `unknown` | The step's raw orchestrator output, minus its blobs — the same treatment and the same caveats as {@link BlockWorkflowSnapshot.stepOutputs}: its shape is whatever the orchestrator returns for that `$type`, and it is UNSCANNED. |
| `error?` | `string` | Why this step failed. Diagnostic text; do not render it verbatim. |

**`BlockWorkflowSnapshot`** — object

The host-mediated view of an orchestrator workflow that an iframe block receives over `postMessage`. This is intentionally a flattened **subset** of `WorkflowSnapshot` from `../orchestrator/` — the host (civitai.com) maps the full orchestrator payload down to this shape before forwarding. Notable differences: - `workflowId` here = orchestrator's `id` - `imageUrls` here = flattened from `steps[].output.images[].url` - `cost.total` is the host-attested total (not the raw orchestrator field) - the status union omits orchestrator-internal states like `unassigned` If the orchestrator gains a status the host doesn't recognize, the host is responsible for mapping it to one of the values here (typically `processing` or `failed`).

| Field | Type | Notes |
|---|---|---|
| `workflowId` | `string` |  |
| `status` | `'pending' \| 'processing' \| 'succeeded' \| 'failed' \| 'expired' \| 'canceled'` |  |
| `cost?` | ``{ /** Whole Buzz. Includes {@link authorFee} whenever that field is present. */ total: number; /** * The part of `total` that is the app author's per-generation fee, in whole * Buzz — so `total - authorFee` is the generation's own price. Display only: * it is the amount the host added into `total` for this reply. * * - **A number** wherever `total` was built from a fee quote: the * `estimate()` result for a `textToImage` or registered-`step` body, and * the refusal `submit()` resolves for those kinds when a budget, spend cap * or rate limit refuses the quoted price. **`0` means a fee was looked up * and none applies** to this request. * - **Absent** when the total is not itemised: a host that predates the * field; every snapshot of a submitted workflow (`submit` success, `poll`, * `cancel` — its total is the realized generation cost and the fee is a * separate charge); the registered-`step` `submit()` refusal for a missing * orchestrator price quote, which refuses before any fee is looked up; and * the kinds that price no fee (`customComfy`, pass-through `step`, * `training`). **Do not read absent as `0`** — show `total` on its own. * * A `kind: 'workflow'` estimate itemises it too, and it is ONE fee for the * whole workflow however many steps it has. */ authorFee?: number; }`` |  |
| `imageUrls?` | `string[]` |  |
| `error?` | `string` |  |
| `errorCode?` | `KnownBlockWorkflowErrorCode \| (string & {})` | A stable, machine-readable companion to {@link error}, for a block to branch on instead of matching the prose. OPTIONAL: set only on the refusals that define a code, absent everywhere else (and on every reply from a host that predates the field). WHERE IT APPEARS today: the refusal for a pass-through `step` body ({@link WorkflowBodyPassThroughStep}) whose `$type` is a training type (`'training'` or `'imageResourceTraining'`, in any casing — the host compares `$type` case-insensitively) when the host could not get a price quote for it. That refusal is `{ workflowId: 'failed', status: 'failed', error, errorCode }` with no `cost`, and it is the reply to `estimate()` (which rejects with `WorkflowEstimateError`), to `submit()` (which rejects with `WorkflowSubmitError`, before anything is reserved or charged), and to that body's cell in a batch estimate. Read it from the error's `.snapshot.errorCode`. A `kind: 'training'` ESTIMATE does not set it. The confirmed SUBMIT of a training run or a confirmed step can — see `'daily-limit-exceeded'` below. A refused `kind: 'workflow'` body ({@link WorkflowBodyWorkflow}) sets it in the same shape, on the same three replies — except the three `workflow_quote_*` codes, which are ESTIMATE-ONLY (`estimate()` and a batch-estimate cell): `submit()` of the same body defines no such refusal and proceeds, reserved at the ceiling. A REGISTERED `step` body ({@link WorkflowBodyStep}) the host has no price quote for gets one of the three `step_quote_*` codes, also ESTIMATE-ONLY (`estimate()` and a batch-estimate cell); its `submit()` is unchanged. The pass-through `step` arm does not set them. The values the host sends today ({@link KnownBlockWorkflowErrorCode}): - `'training-quote-rejected'` — the orchestrator refused the request itself; resending the same body will not help. `error` then reads `Training could not be priced: <reason>` when the reason is safe to show. - `'training-quote-unavailable'` — no usable answer (an outage, a timeout, a rate limit, insufficient funds, …). Retrying later may succeed. - `'training-quote-unpriced'` — the orchestrator answered without a price. - `'daily-limit-exceeded'` — a viewer-confirmed job (a `kind: 'training'` run or a confirmed step) would exceed what remains today of the daily Buzz limit THE VIEWER set for this app. Nothing was charged and no job was started; the confirm cannot override it, and only the viewer can raise the limit. This one arrives on the failed snapshot a confirmed SUBMIT resolves (`{ workflowId: 'failed', status: 'failed', cost, error, errorCode }`), not on an estimate. On a confirmed step the host also reports it as the `error` code of `CONFIRMED_STEP_RESULT` — see {@link BlockRunConfirmedStepHostError}. - `'workflow_step_denied'` — a step of a `kind: 'workflow'` body names a platform-internal `$type`. Remove or replace that step. - `'workflow_ref_invalid'` — a {@link WorkflowStepRef} in a step's `input` points at the step itself, a later step, or nothing; or a step `name` breaks the naming rules (see {@link WorkflowBodyWorkflowStep.name}). `error` names the step by its position. - `'workflow_too_many_steps'` — more than {@link BLOCK_WORKFLOW_MAX_STEPS} steps. - `'workflow_repeat_unbounded'` — a `repeat` step iterates something other than an array in the body's `arguments`, or more than {@link BLOCK_WORKFLOW_REPEAT_MAX_ITERATIONS} times, nested repeats multiplied; or the workflow has a `repeat` and the host has no price quote for it. `error` then reads `workflow step N: a workflow with a repeat needs a price quote and <cause>`, where `<cause>` is one of the three in the `workflow_quote_*` messages below. A retry of the same body can succeed only when the cause is `none could be obtained; try again`; otherwise the body is what has to change. - `'workflow_quote_rejected'` — ESTIMATE only. The orchestrator refused the body, so there is no price to show; resending the same body will not help. `error` reads `No price quote for this workflow: the orchestrator rejected the request: <reason>` when the reason is safe to show, else `No price quote for this workflow: the orchestrator rejected the request; check the step inputs and references (retrying the same body will not help)`. - `'workflow_quote_unavailable'` — ESTIMATE only. No usable answer (an outage, a timeout, a rate limit, …). The one `workflow_quote_*` code a retry of the same body can clear. `error` reads `No price quote for this workflow: none could be obtained; try again`. - `'workflow_quote_unpriced'` — ESTIMATE only. The orchestrator answered without a price. `error` reads `No price quote for this workflow: the orchestrator answered without one`. Each `workflow_quote_*` reply is `{ workflowId: 'failed', status: 'failed', error, errorCode }` with NO `cost`. A host that predates these codes resolves the estimate instead, with the spend ceiling as `cost.total`. - `'step_quote_rejected'` — ESTIMATE only, registered `step` body. The orchestrator refused the request; resending the same body will not help. `error` reads `No price quote for this step: the orchestrator rejected the request: <reason>` when the reason is safe to show, else `No price quote for this step: the orchestrator rejected the request; check the step inputs and references (retrying the same body will not help)`. - `'step_quote_unavailable'` — ESTIMATE only, registered `step` body. No usable answer (an outage, a timeout, a rate limit, …). The one `step_quote_*` code a retry of the same body can clear. `error` reads `No price quote for this step: none could be obtained; try again`. - `'step_quote_unpriced'` — ESTIMATE only, registered `step` body. The orchestrator answered without a price. `error` reads `No price quote for this step: the orchestrator answered without one`. Each `step_quote_*` reply is `{ workflowId: 'failed', status: 'failed', error, errorCode }` with NO `cost`. A host that predates these codes resolves the estimate instead, priced at the step's declared estimate, so there a registered-step estimate may not be a quote. 🔴 AN UNKNOWN VALUE IS POSSIBLE: the host may add codes, and the SDK's inbound validator accepts any string here. Handle an unrecognised code as a generic failure and show `error`. |
| `spentAccountType?` | `BuzzAccountType` | The Buzz pool that was the PRIMARY FUNDER of this generation — i.e. the account with the LARGEST debit, which the host stamps onto the workflow snapshot server-side. This is NOT necessarily "the paid account": a generation covered mostly by free/earned Buzz reports `spentAccountType: 'blue'`. Populated by the host from the Phase-1 backend `spentAccountType` field; absent when the host predates it or no spend occurred. Informational only — surface it (e.g. "funded from your yellow balance") but don't gate on it. |
| `autoClaim?` | `{ type: 'dailyBoost'; amount: number; accountType: 'yellow' \| 'blue' \| 'red' \| 'green'; }` | Set when the host opportunistically claimed a Buzz reward on the user's behalf during submit. Currently the host only fires this for the daily boost (25 blue Buzz, one per UTC day) when the user's balance would otherwise have been short by less than the boost amount. Informational only — the block has no obligation to reconcile state (the claim already settled in the orchestrator). A typical block UX surfaces a small "+25 daily boost claimed" notice next to the succeeded result. |
| `modelSubstitutions?` | `BlockModelSubstitution[]` | Checkpoint versions the host SILENTLY replaced before running the generation. `requested` is the version id the block asked for, `applied` is the one that actually ran (and was billed). On an ecosystem whose model is locked to a workflow, the host swaps a version id that is not offered for the current workflow for that workflow's default and still succeeds — graceful degradation that keeps an app pinned to a since-retired version working. This field only REPORTS the swap; the behaviour is unchanged. WHERE IT APPEARS: on the `kind: 'textToImage'` path only — the submit reply, the estimate reply, every submit reply that quotes a cost without submitting, and every later poll/cancel of that workflow (the record is persisted with it, so it sits next to the `imageUrls` it describes). An estimate creates no persisted workflow, so there it exists only on that reply. It does NOT appear for `customComfy` or `step` bodies: neither resolves a checkpoint, so there is nothing to substitute. OMITTED entirely when nothing was substituted. Absent on hosts that predate it. |
| `textOutputs?` | `string[]` | Generated FREE TEXT produced by a registered text-output step (e.g. `chat-completion`) — every string here has PASSED the host's output moderation scan. WHERE IT APPEARS: the poll and cancel replies (`poll()` / `cancel()` / `watch()` on `useBuzzWorkflow`). NOT on the submit reply — a submit returns a freshly-queued workflow with no output yet, so poll for the text. Also never on {@link AppWorkflow}, which has no text field. OMITTED entirely when there is no text. Independent of {@link BlockWorkflowSnapshot.textOutputWithheld}: a workflow with two text steps can release one and withhold the other, and both fields then appear. |
| `textOutputWithheld?` | `{ reason: string; }` | Set when a text-output step produced nothing the block can be given, with a user-facing sentence saying why. TWO distinct causes land here: 1. WITHHELD — text WAS produced and is being kept back: a content-policy hit, or any other fail-CLOSED scan outcome (scanner error or timeout, no verdict at all, an over-cap payload, or requested labels that came back missing or errored). Every one of those paths returns the SAME message, so this cause is one string with several origins. 2. UNPUBLISHABLE — the step SUCCEEDED and the scan RELEASED, but none of what came back could be published (e.g. a provider tool-call `id` outside the published charset). Nothing was moderated in this case, and the message says so explicitly. `reason` is deliberately generic: it does not name the labels that triggered. 🔴 THE TWO CAUSES ARE NOT MACHINE-SEPARABLE without matching on the string, which is NOT a contract. Do not branch on the text of `reason`. 🔴 ONLY CAUSE 2 IS STATUS-GATED, and that gate reads the STEP's own `succeeded` status — never the workflow's. Cause 1 is not gated at all, so a CANCELLED generation CAN still set this field: the orchestrator returns whatever text it had already produced, that text is still scanned, and a hit still withholds it. A block that skips rendering `reason` on cancel would suppress a real content-policy explanation. A block polling a healthy in-flight generation sees the field absent — not because of its status, but because a step that has produced no text yet can reach neither cause. Independent of {@link BlockWorkflowSnapshot.textOutputs} rather than mutually exclusive, so `reason` is scoped to "a step in this response", never to the response as a whole. Same appearance rules as `textOutputs`. |
| `toolCalls?` | `BlockStepToolCall[]` | Structured tool calls the model requested on a registered text-output step (e.g. `chat-completion` with tools), which have PASSED the same output moderation scan as {@link BlockWorkflowSnapshot.textOutputs}: every `arguments` string here was part of the text the scan released. The tool `name` is restricted to `[A-Za-z0-9_-]`, so it cannot carry prose. Each entry is fully populated — the host drops a call it cannot fill completely rather than publishing a partial one. Same appearance rules as `textOutputs` (poll and cancel replies only). OMITTED entirely when there are none. |
| `stepOutputs?` | `Array<{ $type: string; output: unknown; }>` | The raw orchestrator output of each PASS-THROUGH step ({@link WorkflowBodyPassThroughStep}: `kind: 'step'` with a `$type`), as `{ $type, output }`, forwarded as-is — minus its blobs. Blob-SHAPED values are removed from `output`; their available urls go to {@link BlockWorkflowSnapshot.imageUrls} (and to {@link AppWorkflow.images}) instead, so a pass-through step does not open a second image channel. "Blob-shaped" is the exact scope of that: a url held in a plain string field of the output is not a blob and can still appear here. 🔴 UNSCANNED. Unlike `textOutputs`, no moderation scan runs over this field; moderation for the pass-through arm happens at the publish boundary. Treat any text in it accordingly. 🔴 A `$type` that is ALSO a registered step's orchestrator type (e.g. `chatCompletion`, which `chat-completion` uses) is handled by that registered step instead — its text arrives on `textOutputs`, scanned, and it does not appear here. Which channel a pass-through `$type` lands on can therefore change the day the host registers a step for it. `output` is `unknown`: its shape is whatever the orchestrator returns for that `$type`. OMITTED entirely when the workflow has no pass-through step with an unregistered `$type`. |
| `trainedEpochs?` | `BlockTrainedEpoch[]` | The epochs of a pass-through `training` / `imageResourceTraining` step (see {@link WorkflowBodyPassThroughStep}) that PRODUCED A CHECKPOINT — one entry per epoch, each naming the step's `$type` and its `epochNumber`. Only runs whose training moderation status is approved are listed; an unmoderated or refused run reports no epochs. 🔴 THE CHECKPOINT ITSELF IS DELIBERATELY NOT EXPOSED — this field carries no download url. (An older host may still surface checkpoint urls in `imageUrls` or `stepOutputs` for a training step; that is a host defect, not a contract — never treat an `imageUrls` entry as a checkpoint.) To publish a trained epoch, navigate the viewer to Civitai's own model wizard: ```ts const { navigate } = useCivitaiNavigate(); navigate( `models/train/from-orchestrator?workflowId=${snapshot.workflowId}&epoch=${epoch.epochNumber}`, { scope: 'site' }, ); ``` The viewer completes (or abandons) the publish there, on Civitai's surface; {@link BlockWorkflowSnapshot.publishedModel} then reports the result. 🔴 REQUIRES A HOST VERSION THAT EMITS IT. Absent on older hosts — treat absence as "unknown", not as "no checkpoint". The run's spend and timeout follow the pass-through arm's rules — see {@link WorkflowBodyPassThroughStep.maxBuzz}. |
| `publishedModel?` | `BlockPublishedModel` | The Civitai model this run has been published as — present once the viewer has STARTED or FINISHED publishing it through the model wizard reached from {@link BlockWorkflowSnapshot.trainedEpochs}. `published` is `false` while the model is still a draft and `true` once it is published. 🔴 REQUIRES A HOST VERSION THAT EMITS IT. Absent on older hosts, and absent on any run nobody has started publishing. |
| `trainingQuote?` | `BlockTrainingQuote` | The quote a {@link WorkflowBodyTraining} ESTIMATE produced — the orchestrator's own price for exactly that run, stored server-side. Pass `trainingQuote.quoteId` back as the body's `quoteId` on `useRunTraining().runTraining()`; the consent dialog then shows the viewer this price, read back from the server. `cost.total` on the same snapshot equals `trainingQuote.total`. `expiresAt` is an ISO-8601 timestamp: after it the run is refused and you estimate again. `imageCount` is the server-derived size of the prepared dataset, never a number the block sent. Present ONLY on the reply to a `kind: 'training'` estimate. Absent on hosts that predate civitai/civitai#5434. |
| `stepQuote?` | `BlockStepQuote` | The viewer-confirmable quote a pass-through `step` ESTIMATE ({@link WorkflowBodyPassThroughStep}) produced, when the job costs more than the app may spend without asking. Its presence means: this job cannot run through `submit()`, and CAN run through `useRunConfirmedStep()` once the viewer confirms `stepQuote.total` in Civitai's own dialog. THE FLOW, mirroring a training run's: 1. `useBuzzWorkflow().estimate(body)` — the reply carries `stepQuote`. 2. `useRunConfirmedStep().runConfirmedStep({ ...body, quoteId: stepQuote.quoteId })` — Civitai shows the viewer the price (read back from the server, never from the body) and submits on their confirm. 3. `useBuzzWorkflow().watch(snapshot.workflowId)`. WHEN THE HOST SENDS IT — all of these, decided server-side: - the orchestrator quoted a **FIXED** price for exactly this step: positive, and not a variable or metered one. The viewer confirms what they are charged, so a price that may move is never confirmable; - that price is ABOVE the token's per-call budget and at most {@link BLOCK_CONFIRMED_STEP_MAX_BUZZ_PER_JOB} (5,000 Buzz); - the block runs in a page app for a signed-in viewer on an ordinary token. Development, dev-tunnel and review sessions never get one, and neither does the model slot. Everywhere else the field is ABSENT and the estimate is exactly what it was. Absent is therefore not an error — it is also what every host that predates civitai/civitai#5786 sends. 🔴 ONLY A SINGLE ESTIMATE CARRIES IT. A batch estimate (`ESTIMATE_WORKFLOW_BATCH`, `useBatchEstimate()`) stores nothing, so its cells never have a `stepQuote`, whatever they cost. Price a grid in a batch, then estimate the one body you want to run on its own. 🔴 TWO BODIES MAKE THAT ESTIMATE FAIL INSTEAD OF RETURNING A PRICE — only where a quote would otherwise have been granted (so not below the budget, and not in a batch). The reply is the failure snapshot `{ workflowId: 'failed', status: 'failed', error }`, which `estimate()` rejects with; the same text arrives as `CONFIRMED_STEP_RESULT`'s `error` if such a body is run. Neither has an {@link BlockWorkflowSnapshot.errorCode}; they are server messages, so match on the text and keep a generic branch: - `a training step type cannot run as a confirmed step — use kind:'training'` — `$type` is `training` or `imageResourceTraining`, in any casing. Training has its own kind ({@link WorkflowBodyTraining}). - `a confirmed step needs plain JSON input (objects, arrays, strings, finite numbers, booleans, null) — <path> is <what>` — `input` holds a `Date`, `Map`, `Set`, class instance, `BigInt`, `NaN`/`Infinity`, an `undefined` array element or an empty slot in a sparse array (`… — body.input.list[1] is an empty array slot`). The quote is bound to the exact body, so the body must be exactly representable. The part after the dash names the offending path (`body.input.when is a Date`) and varies: match on the text BEFORE the dash. `total` is the price the viewer confirms and is charged. 🔴 It can differ from `cost.total` on the same snapshot, which stays what an UNCONFIRMED submit would reserve (`max(maxBuzz, quote)`); show `stepQuote.total` on a confirm button. `expiresAt` is an ISO-8601 timestamp 15 minutes out; after it the run is refused and you estimate again. A quote is single-use. |
| `model3dOutputs?` | `BlockModel3dOutput[]` | What each 3D model in {@link BlockWorkflowSnapshot.imageUrls} IS — one label per model a pass-through step produced (e.g. `polyGen`). Every model url is still listed in `imageUrls`, unchanged and in the same order as before the field existed; this only says which entry is which. Match on `url`: ```ts const glb = snapshot.model3dOutputs?.find( (m) => m.format === 'glb' && m.variant === 'model', ); if (glb) viewer.load(glb.url); ``` OMITTED when the workflow produced no 3D model, and on hosts that predate civitai/civitai#5786 — in which case `imageUrls` is all there is. |
| `steps?` | `BlockWorkflowStepSnapshot[]` | The steps of a `kind: 'workflow'` run ({@link WorkflowBodyWorkflow}), in the orchestrator's order, each with its own status and results. The steps a `repeat` step generates follow it, named `<repeat name>.<n>`, so the list can be longer than the body's. The top-level fields keep their meaning: `status` is the workflow's, `imageUrls` is the union of every step that did NOT set `suppressOutput`, and `cost` is the whole workflow's. 🔴 A `failed` WORKFLOW IS NOT AN EMPTY ONE. Steps that succeeded before the failing step stay charged and keep their results, so a snapshot with `status: 'failed'` can carry `cost.total > 0` and usable `imageUrls`. Read `steps` to see which step failed (`status: 'failed'`, with its `error`) and which finished. Read it from the poll and cancel replies of a `kind: 'workflow'` run; do not rely on it being on the submit reply. ABSENT for every other kind, on an estimate (which creates no workflow) and on a host that predates it. |

**`AppWorkflow`** — object

The clean, wire-stable projection of ONE orchestrator workflow in the calling app's own generator SUBQUEUE — what `QUERY_APP_WORKFLOWS` / `CANCEL_APP_WORKFLOW` return. Mirrors civitai/civitai's `AppWorkflow` / `projectAppWorkflow` (`src/server/services/blocks/workflow.service.ts`, PR #3164) EXACTLY — KEEP IN LOCKSTEP; a drift here silently strands the reply's transport validator. The host deliberately DROPS every internal/sensitive workflow field (steps, params, prompts, resources, tokens, transactions, metadata, tags) so a block can never read generation internals of a queue it only owns by tag. status: the block-contract status — the orchestrator's `unassigned`/`preparing`/`scheduled` all collapse to `pending`. images: only `available` blobs with a non-null url (see {@link AppWorkflowImage}). cost: the workflow's realized/estimated buzz total, or `null` when absent. createdAt: ISO-8601 string.

| Field | Type | Notes |
|---|---|---|
| `workflowId` | `string` |  |
| `status` | `'pending' \| 'processing' \| 'succeeded' \| 'failed' \| 'expired' \| 'canceled'` |  |
| `images` | `AppWorkflowImage[]` |  |
| `cost` | `number \| null` |  |
| `createdAt` | `string` | ISO-8601. |
| `publishedModel?` | `BlockPublishedModel` | The Civitai model a training run in this workflow was published as — present once the viewer has started or finished publishing it through the model wizard. Same shape and meaning as {@link BlockWorkflowSnapshot.publishedModel}. 🔴 REQUIRES A HOST VERSION THAT EMITS IT. Absent on older hosts, and on every workflow nobody has published. |
| `trainedEpochs?` | `BlockTrainedEpoch[]` | The epochs of a pass-through `training` / `imageResourceTraining` step in this workflow that produced a checkpoint. Same shape and rule as {@link BlockWorkflowSnapshot.trainedEpochs}: only runs whose training moderation status is approved are listed, the checkpoint itself is not exposed, and the field is OMITTED when there are no epochs to list. Lets a block offer "publish epoch n" from its queue without polling each run. 🔴 REQUIRES A HOST VERSION THAT EMITS IT. Absent on older hosts — treat absence as "unknown", not as "no checkpoint". |
| `model3dOutputs?` | `BlockModel3dOutput[]` | Labels for the 3D models among this workflow's {@link AppWorkflow.images} — same shape and rule as {@link BlockWorkflowSnapshot.model3dOutputs}: every labelled `url` is also an entry of `images`, and the field is OMITTED when there are none (and on hosts that predate it). |

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
| `idempotencyKey?` | `string` | A STABLE idempotency key for this logical submit. Reuse the SAME value when RETRYING a submit whose response was lost (timeout / network drop) so the host+orchestrator collapse it to ONE Buzz charge instead of double-charging. Omit → the hook generates a fresh key per `submit()` call (each call is a new logical submit); pass a stable id (e.g. a grid-cell id) to make a retry safe. 🔴 THIS IS THE FIELD THAT MAKES A RETRY AFTER A `'workflow-failed'` REJECTION SAFE. That code means a workflow probably exists and its spend may already be committed server-side; retrying WITHOUT reusing the key mints a fresh one and therefore a SECOND reservation. See {@link WorkflowSubmitError.code}. The SDK's own automatic consent retry obeys this: whichever value ends up here — yours, or the one `submit()` mints — is the value BOTH of its attempts carry. So an error you receive may already be a second attempt's; if you then retry a third time by hand, reuse this key for that too. 🔴 **FORMAT: `^[A-Za-z0-9_-]{1,64}$` — letters, digits, `_` and `-` only, at most 64 characters, and NO COLONS.** The host rejects anything else before the procedure runs: `BAD_REQUEST` / **400** on `blocks.submitWorkflow`, with `{"code":"invalid_format","pattern":"/^[A-Za-z0-9_-]{1,64}$/","path":["idempotencyKey"]}`. So a composite key like `sheetId:panelId:nonce` fails every time — that is the exact value that broke a shipped app, with 201 local tests green. The colon is excluded deliberately, not cosmetically: the host composes its per-`(user, app, key)` dedupe key with `:` as the delimiter and relies on the key being colon-free for that to stay injective. The 64 bound is derived from the orchestrator's 128-char `externalId` ceiling, which the host builds by substringing this key. 🔴 A key that fails this is **REFUSED before anything is sent**, with `InvalidIdempotencyKeyError` — nothing was sent and nothing was spent, which is why it is NOT a {@link WorkflowSubmitError} (every code on that class is money-ambiguous by design). The key is never sanitised for you: rewriting an idempotency key would break the identity it exists to carry — two distinct logical submits could collapse onto one slot, or a retry could be normalised differently from its first attempt and mint a SECOND reservation. Validate with `isValidBlockIdempotencyKey` from `@civitai/app-sdk/blocks` if you compose keys dynamically. |

**`WatchWorkflowOptions`** — object

Optional controls for {@link UseBuzzWorkflow.watch}.

| Field | Type | Notes |
|---|---|---|
| `onUpdate?` | `(snapshot: BlockWorkflowSnapshot) => void` | Called with EVERY snapshot the host returns, intermediate ones included, in order. This is the push side of the API: render from here instead of re-reading `result` on a timer. A throw from this callback is not caught — it rejects the `watch` promise. |
| `signal?` | `AbortSignal` | Stop watching. The promise RESOLVES with the last snapshot seen rather than rejecting: an abort is the caller's own decision, not a failure, and the common case (a component unmounting) has nobody left to catch a rejection. 🔴 This does NOT cancel the workflow — it stops watching it. Buzz is already spent and the orchestrator keeps running. To actually stop the work, call {@link UseBuzzWorkflow.cancel}. |
| `waitSeconds?` | `number` | Orchestrator-side hold per poll, in **seconds**. Default {@link DEFAULT_WATCH_WAIT_SECONDS}. 🔴 THE HOST HONOURS AND CLAMPS THIS — it is NOT advisory (#388). This docblock said "CURRENTLY ADVISORY … a host that does not yet read the field simply answers immediately, exactly as today", which was true when written and is not true of the deployed host. The contract, read off `civitai/civitai` at **`b0eb2820b5`** (5.1.120, `main`) — two files, because a constant that nothing calls is not a contract: - `src/server/services/blocks/workflow.service.ts:1263` declares `MAX_BLOCK_POLL_WAIT_SECONDS = 15`. - `:1286-1292` `resolveBlockPollWaitSeconds(waitSeconds?: number)` applies it, and `src/server/routers/blocks.router.ts:3965` is the call site. What that function does, in its own order: 1. a non-`number` or non-finite value → `undefined`, i.e. NO HOLD. 2. `Math.floor` FIRST. `0.9` is therefore not "a short hold" — it floors to `0` and becomes no hold at all, which the host's own comment calls out explicitly. 3. floored `<= 0` → `undefined` (no hold). So `0` — and any fraction below 1 — disables long polling and `watch` falls back to a plain read per `intervalMs`. 4. otherwise `Math.min(floored, 15)`. Asking for 60 gets you 15. Consequences worth planning for: only whole seconds are expressible, and no value above `MAX_BLOCK_POLL_WAIT_SECONDS` buys anything — `intervalMs` is still what bounds request rate, because a clamped hold returns sooner than the caller asked for. 🔴 THIS IS PROSE ABOUT ANOTHER REPO, AND NO GUARD IN THIS ONE CAN CHECK IT. The host checkout is not present in CI, so the honest check is a human reading the two files above at a named revision — which is why the sha is quoted rather than "as of today". A later reader comparing against a newer host should update the sha along with whatever moved. The `POLL_WORKFLOW` field's own note on `BlockToParentMessage` in `@civitai/app-sdk` covers the wire shape and the older-host case; this covers what the current host does with the value. |
| `intervalMs?` | `number` | Delay between polls, in ms. Default 1500. 🔴 NOT REDUNDANT WITH `waitSeconds`. When the host long-polls, the hold dominates and this is a few percent of overhead. When it does NOT — an older host, or `waitSeconds: 0` — this is the only thing standing between this loop and a request storm. |
| `timeoutMs?` | `number` | Give up and resolve with the last snapshot after this long. Default 10min. |
| `maxRetries?` | `number` | Consecutive transport failures to absorb before rejecting. Default 3. A poll can fail for reasons that have nothing to do with the workflow (a pod rolling, a network blip). Because `watch` OWNS the loop, a single blip would otherwise end a generation the caller's own retry loop used to survive. The counter RESETS on any successful poll, so this bounds a burst, not a lifetime. |

<!-- END GENERATED: bridge -->
</BridgeReference>

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
| `training` | an ai-toolkit **LoRA training** run on a dataset of the viewer's own images | a base-model key from Civitai's training catalog (`model`), plus the `datasetId` that `usePrepareTrainingDataset()` returned |
| `workflow` | **up to 8 orchestrator steps submitted as one workflow**, a later step reading an earlier step's result through a `{ $ref, path }` reference | each step's own `$type`, as on the pass-through arm |

`workflow` is the multi-step member: the same denylist as the pass-through arm
runs on every step, references may only point at `$arguments` or an earlier
step, and there is no `maxBuzz` (the ceiling is the per-generation budget × the
number of steps). The guide is [Multi-step workflows](../guide/workflows); the
field table is at [`WorkflowBodyWorkflow`](#bridge-WorkflowBodyWorkflow).

`training` ships behind the host flag **`app-blocks-training-kind`**, which is
**off by default** and evaluated **per viewer**; where it is off, every training
call is refused. It is a page-app flow, quoted with `estimate()` and run with
`useRunTraining()` (`submit()` refuses it). The field table is at
[`WorkflowBodyTraining`](#bridge-WorkflowBodyTraining); availability and money
rules are under
[`usePrepareTrainingDataset`](./hooks#hook-usePrepareTrainingDataset).

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
[`WorkflowBodyStep`](#bridge-WorkflowBodyStep); the other arm's is at
[`WorkflowBodyPassThroughStep`](#bridge-WorkflowBodyPassThroughStep).

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
[`useBuzzWorkflow`](./hooks#hook-useBuzzWorkflow). Log it; its wording is not a
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
[`WorkflowBodyPassThroughStep`](#bridge-WorkflowBodyPassThroughStep).

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
which gives you the full [param surface](#bridge-BlockTextToImageParams)
(dimensions, steps, sampler, quantity). Reach for the recipe only when you
want exactly what it does.
:::

## Retrying a `submit()` without double-charging

This section is the React hook. In `@civitai/sdk`,
`app.workflows.submit(body, { idempotencyKey })` has no default key: it requires
one and refuses to send without it, and its retry rules are under
[Money calls](../guide/sdk#submit-rejects).

`submit(body, options?)` takes a second argument —
[`SubmitWorkflowOptions`](#bridge-SubmitWorkflowOptions) — whose one field is
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
