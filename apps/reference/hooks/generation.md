---
title: "Generation hooks"
description: "useBuzzWorkflow and the hooks that list, publish and resource a generation. Part of the Hooks reference."
---

<!-- GENERATED PAGE — do not edit by hand. Written by `npm run gen:appblocks:md` (scripts/appblocks-md.mjs); which entry lives on which page is decided in .vitepress/theme/components/referenceSplit.shared.mjs. -->

# Generation hooks

`useBuzzWorkflow` and the hooks that list, publish and resource a generation.

This page documents 4 of the 49 hooks in the [Hooks reference](../hooks), which indexes every hook by name. Generated from the published `@civitai/blocks-react@0.78.0` package's type definitions and README.

Other pages: [Context, frame and analytics hooks](./context) · [Batch, confirmed-step and training hooks](./batches-and-training) · [Buzz, purchase and tip hooks](./buzz-and-purchases) · [Viewer, consent and navigation hooks](./viewer-and-navigation) · [Storage, picker and media hooks](./storage-and-media)

<HooksReference group="generation">
<!-- BEGIN GENERATED: hooks/generation — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`useBuzzWorkflow`**

```ts
useBuzzWorkflow(): UseBuzzWorkflow
```

```ts
interface UseBuzzWorkflow {
  estimate: (body: WorkflowBody) => Promise<BlockWorkflowSnapshot>;
  submit: (body: WorkflowBody, options?: SubmitWorkflowOptions) => Promise<BlockWorkflowSnapshot>;
  poll: (workflowId: string) => Promise<BlockWorkflowSnapshot>;
  watch: (workflowId: string, options?: WatchWorkflowOptions) => Promise<BlockWorkflowSnapshot>;
  cancel: (workflowId: string) => Promise<BlockWorkflowSnapshot>;
  status: WorkflowStatus;
  result: BlockWorkflowSnapshot | null;
  error: Error | null;
}
```

The generation flow: `estimate` → `submit` → `poll`, host-mediated. Returns `{ estimate, submit, poll, status, result, error }`.

```tsx
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

const { estimate, submit, poll, status, result } = useBuzzWorkflow();
declare const modelId: number, modelVersionId: number, userPrompt: string;

const body: WorkflowBody = {
  kind: 'textToImage',
  modelId,
  modelVersionId,
  params: { prompt: userPrompt },
};
// The viewer-facing copy is a string YOUR APP owns, chosen by `err.code`.
// Nothing on the error may be rendered: `err.message` is developer-facing and
// its wording is not a contract; `err.snapshot.error` is server-authored and
// unsanitised.
const estimateFailureMessage = (err: WorkflowEstimateError) =>
  err.code === 'no-cost'
    ? 'We could not get a price for this configuration. Try adjusting it.'
    : 'Pricing is unavailable right now. Please try again shortly.';

// 🔴 estimate() REJECTS when the reply carries no usable price. ALWAYS catch it.
let priced = false;
try {
  await estimate(body);          // status 'estimating' → 'confirming' (cost in result.cost.total)
  priced = true;
} catch (err) {
  if (!(err instanceof WorkflowEstimateError)) throw err;
  // status is now 'error'. Log both for the developer; render neither.
  logForDebugging(err.message, err.snapshot.error);
  showError(estimateFailureMessage(err));
}
if (priced) {
  // 🔴 submit() REJECTS when the reply carries no usable workflow outcome. A
  // priced refusal is different — it RESOLVES.
  try {
    const snap = await submit(body); // status 'submitting' → 'polling'
    if (snap.status === 'failed') {
      // 🔴 A RESOLVED `failed` IS A SERVER OUTCOME, NEVER A TOP-UP CUE: a spend
      // cap or limit buying Buzz does not raise, or a run that may already have
      // spent. The complete list is on `useBuzzWorkflow`'s `submit` docs.
      // Running OUT of Buzz rejects instead — see the catch below.
      showError(submitOutcomeMessage(snap)); // YOUR app owns this copy
    } else {
      await poll(snap.workflowId);   // you loop this on a backoff until terminal
    }
  } catch (err) {
    if (!(err instanceof WorkflowSubmitError)) throw err;
    // Log both for the developer; render neither.
    logForDebugging(err.message, err.snapshot.error);
    // 🔴 TWO SEPARATE QUESTIONS — DO NOT CONJOIN THEM. `code` decides what you may
    // say about MONEY; the id decides only whether there is something to POLL.
    // Folding the id test into the `code` test sends a 'workflow-failed' reply
    // whose id is 'whatif' into the reassuring arm — the exact blind-retry
    // invitation this whole guard exists to remove.
    if (err.code === 'workflow-failed') {
      // 🔴 Spend MAY ALREADY BE COMMITTED. Do not tell the viewer it was free,
      // and do not retry blindly — a retry mints a fresh idempotency key, i.e. a
      // SECOND reservation.
      showError('The generation may have started but did not complete. Check your history.');
      // Only NOW ask about pollability: 'whatif' is a non-workflow sentinel.
      if (err.snapshot.workflowId !== 'whatif') await poll(err.snapshot.workflowId);
    } else {
      // 🔴 'exception' means the host had no workflow to report — USUALLY nothing
      // was queued, but a lost response or an in-progress idempotency conflict
      // reaches this arm too. Retry with the SAME idempotencyKey, not a fresh one.
      showError('Could not start the generation. Please try again.');
    }
  }
}
```

````md
**Status semantics** (gotcha #8/#9/#10):

- `status === 'confirming'` is **IDLE** (estimate landed, user reviewing the
  cost) — keep the Generate button enabled. Only `estimating | submitting |
  polling` are busy.
- `result` is populated after `estimate()` too — don't treat a non-null `result`
  as "something is queued."
- The hook does **not** auto-poll. After `submit` flips status to `'polling'`,
  the **caller** runs a `useEffect` that calls `poll(workflowId)` on a backoff
  until the snapshot is terminal (`succeeded | failed | canceled | expired`).
- A **priced** submit refusal comes back as a **resolved** snapshot with
  `status: 'failed'`, an `error` string, **and a numeric `cost.total`** — the
  price the server refused to charge. That is a workflow *outcome*, not an error.
  Check `snap.status`, not just `try/catch`.
  🔴 **None of them is a top-up cue.** Each is a spend cap or limit that buying
  Buzz does not raise — the per-call `buzzBudget` and the viewer's daily cap
  included — or a reply that may already have spent. The complete list, and
  which of them may say "nothing was charged", is in `useBuzzWorkflow`'s
  `submit` docs. A viewer who is genuinely **out of Buzz** makes `submit`
  **reject** (`WorkflowSubmitError` code `'exception'`, shared with other
  thrown submits): decide a top-up from `useBuzzBalance()` — blue plus the
  block's domain pool, never all three — against the quoted cost.
- **`submit` REJECTS when the reply carries no usable workflow outcome**
  (`@civitai/blocks-react@0.44.0+`). Every failure-shaped reply reports
  `status: 'failed'`, so `status` cannot tell them apart — **`cost` presence
  decides resolve-vs-reject, and `workflowId` decides which rejection**:
  - **priced refusal** → carries `cost`. **Resolves**, as above.
  - **a reply the host built itself** (`failureSnapshot(err)`, which stamps the
    literal `workflowId: 'failed'` — from a `catch` or a short-circuit such as
    the moderator-review nack) → no `cost`. **Rejects** with
    `err.code === 'exception'`, which means *the host had no workflow to report*.
    🔴 **Not the same as "nothing happened."** Usually nothing was queued or
    charged and a retry is fine, but a **lost response**, an **in-progress
    idempotency conflict**, or a **transient 5xx/408/429/401** also land here,
    and a workflow may have been created and charged. Prefer reusing the same
    `idempotencyKey` on retry, and don't render "nothing was charged" as fact.
  - **a failed, unpriced reply whose id is NOT that sentinel** (normally a
    genuine orchestrator id) → no `cost`. **Rejects** with
    `err.code === 'workflow-failed'`.
    🔴 **Money may already be committed.** Server-side, *any* resolved submit
    keeps its Buzz reservation "regardless of snapshot status", with no refund on
    a non-throwing failed snapshot. So do not tell the viewer it was free, and do
    not retry blindly — `submit()` mints a fresh `idempotencyKey` per call, so an
    automatic retry is a second reservation. Read `err.snapshot.workflowId` (a
    usually-pollable id) and `watch`/`poll` it to learn the workflow's actual
    fate — guarding with `err.snapshot.workflowId !== 'whatif'` first, since the
    server treats both `'failed'` and `'whatif'` as non-workflow sentinels.

  Before that version everything resolved, so a block branching on
  `snap.status === 'failed'` could not tell "you can't afford this" from "the
  request failed", and one gating a money control on
  `typeof snap.cost?.total === 'number'` saw the same dead-control shape
  civitai/civitai#4159 describes. An ordinary in-flight reply
  (`{ status: 'pending' }`) is cost-less too and still resolves — and so are
  cost-less `succeeded` / `canceled` / `expired` replies. Only a *failure-shaped*
  reply with no price rejects. `err.message` is a generic developer-facing
  constant that makes **no claim about money** (the two codes differ on that) and
  the server's words stay on `err.snapshot.error`, exactly as on
  `WorkflowEstimateError` below. Note this also fires in **moderator review
  preview**. To exercise your `catch` locally, set the mock host's
  `generation.failSubmitException: true`.
- **`estimate` follows the same rule for a different question** (`@civitai/blocks-react@0.43.0+`).
  It **rejects** with a `WorkflowEstimateError` when the reply carries no usable
  price, rather than resolving a snapshot with no `cost`. Two things produce
  that, and `err.code` tells them apart: `'failed'` (the estimate errored
  server-side) and `'no-cost'` (an otherwise-successful reply that simply has no
  price).
  Before that version both cases resolved, so a block that correctly gates
  Confirm on `typeof cost === 'number'` rendered a dialog it could never confirm
  ("Cost unavailable") and the server's reason was discarded — civitai/civitai#4159.
  Note this also fires in **moderator review preview**, where the host answers
  every workflow request with `'not available in review preview'`: without a
  `catch`, a reviewer's first click becomes an unhandled rejection.
  To exercise your `catch` locally, set the mock host's
  `generation.failEstimate: 'failed' | 'no-cost'`.
- **Three fields, three audiences — and none of them is viewer-facing copy.**
  The string a viewer sees is one **your app owns**; nothing on this error may
  be rendered as-is.
  - `err.code` (`'failed' | 'no-cost'`) — **the branch target**, and the only
    stable one. Switch on it to pick your own localised message.
  - `err.snapshot.error` — **the diagnostic read**, and recovering it is the
    whole point of the fix. **Server-authored and unsanitised** (raw upstream
    text, including database constraint names, can reach it): log it or show it
    in a developer-facing surface, and **never render it verbatim into markup**.
  - `err.message` — **developer-facing**. A generic constant naming only the code
    (`estimate did not return a usable price (no-cost) — reason on .snapshot.error`),
    because `message` is what an uncaught rejection prints and what an error
    reporter ships by default. Safe to log and to let a stack trace print;
    **not intended for display to viewers** — it names an internal field path,
    it is not localised, and **its exact wording is not a contract**, so a UI
    built on it silently rots. Two apps migrating to `0.43.0` piped it into
    rendered UI and would have shipped that sentence to end users.
- A cost of **`0` is a real price**, not a missing one (the orchestrator whatif
  prices a cache hit at 0). `estimate` resolves it; only a non-numeric
  `cost.total` rejects.

#### Showing the app fee: `cost.authorFee`

`cost.total` is what the viewer pays and **already includes the app author's
per-generation fee**. `cost.authorFee` is that fee on its own, in whole Buzz, so
`total - authorFee` is the generation's price. It is display only.

```tsx
import type { BlockWorkflowSnapshot, WorkflowBody } from '@civitai/app-sdk/blocks';

const { estimate } = useBuzzWorkflow();
declare const body: WorkflowBody;

function priceLine(cost: NonNullable<BlockWorkflowSnapshot['cost']>): string {
  // Absent = not itemised. Show the total alone; do NOT treat it as a 0 fee.
  if (cost.authorFee === undefined) return `${cost.total} Buzz`;
  // 0 = a fee was looked up and none applies to this request.
  if (cost.authorFee === 0) return `${cost.total} Buzz (no app fee)`;
  const generation = cost.total - cost.authorFee;
  return `${cost.total} Buzz (generation ${generation} + app fee ${cost.authorFee})`;
}

const quote = await estimate(body); // rejects without a usable price — see above
if (quote.cost) showPrice(priceLine(quote.cost));
```

| `cost.authorFee` | Means | Where |
|---|---|---|
| a number `> 0` | that much of `total` is the app fee | `estimate()` for a `textToImage`, registered-`step` or `workflow` body (one fee for the whole workflow), and the refusal `submit()` resolves for those kinds when a budget, spend cap or rate limit refuses the quoted price |
| `0` | a fee was looked up and none applies to this request | the same replies |
| absent | the total is **not itemised** | a host that predates the field; every snapshot of a submitted workflow (`submit` success, `poll`, `cancel`), whose `total` is the generation's realized cost with the fee charged separately; the registered-`step` `submit()` refusal for a missing orchestrator price quote, which refuses before any fee is looked up; and `customComfy`, pass-through `step` and `training` quotes, which price no fee |

- **Against an older host the field is simply absent.** Nothing else changes:
  `total` has the same value with or without it, so an app that never reads
  `authorFee` is unaffected.
- **Test all three locally** with the mock host's `generation.authorFee`
  (`createMockHost({ generation: { costPerGen: 40, authorFee: 5 } })`, or
  `?authorFee=5` in the dev harness): a number itemises it, the default `0`
  reports `authorFee: 0`, and `authorFee: false` (`?authorFee=off`) leaves it
  out, as an older host does.

#### Why a training step could not be priced: `snapshot.errorCode`

A pass-through `step` body whose `$type` is a training type (`'training'` or
`'imageResourceTraining'`) needs a price quote; when the host cannot get one it
refuses with `{ workflowId: 'failed', status: 'failed', error, errorCode }` and
no `cost`. `estimate()` rejects with a `WorkflowEstimateError` and `submit()`
with a `WorkflowSubmitError` (before anything is reserved), and a batch
estimate returns it as that body's cell. `errorCode` is the stable value to
branch on; `error` stays the diagnostic read.

```tsx
import { useBuzzWorkflow, WorkflowEstimateError } from '@civitai/blocks-react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

const { estimate } = useBuzzWorkflow();
declare const body: WorkflowBody;

try {
  await estimate(body);
} catch (err) {
  if (!(err instanceof WorkflowEstimateError)) throw err;
  switch (err.snapshot.errorCode) {
    case 'training-quote-rejected': // the request itself was refused — change it
      showError('These training settings were refused. Check them and try again.');
      break;
    case 'training-quote-unavailable': // no answer right now — retrying may work
    case 'training-quote-unpriced': // answered without a price
      showError('Training cannot be priced right now. Try again shortly.');
      break;
    default: // no code, or one a later host added
      showError('Could not get a price.');
  }
}
```

| `errorCode` | Means |
|---|---|
| `'training-quote-rejected'` | the orchestrator refused the request itself; resending the same body will not help. `error` reads `Training could not be priced: <reason>` when the reason is safe to show |
| `'training-quote-unavailable'` | no usable answer (an outage, a timeout, a rate limit, insufficient funds, …); a retry may succeed |
| `'training-quote-unpriced'` | the orchestrator answered without a price |
| `'daily-limit-exceeded'` | a viewer-confirmed job (a training run or a [confirmed step](#userunconfirmedstep--one-job-above-the-per-call-budget)) would exceed what remains today of the daily Buzz limit **the viewer** set for this app. Nothing was charged, no job started, and only the viewer can raise the limit. Arrives on a confirmed submit's failed snapshot, never on an estimate; `useRunConfirmedStep()` surfaces it as `err.dailyLimitExceeded` |
| absent | any other reply, and every reply from a host that predates the field |

- **Treat an unknown value as possible.** The field is typed as an open string
  (`KnownBlockWorkflowErrorCode | (string & {})`), the host may add codes, and
  the inbound validator accepts any string. Keep a `default` branch.
- A `kind: 'training'` **estimate** does not set it; the three `training-quote-*`
  codes belong to the pass-through arm.
- A refused `kind: 'workflow'` body sets its own codes, in the same shape — see
  the next section.

#### A registered step with no price quote: `step_quote_*`

A **registered** `kind: 'step'` body (one with a `step` id, such as
`'chat-completion'` or `'convert-image'`) that the host has no price quote for
fails on `estimate()` (`WorkflowEstimateError`) and as a batch-estimate cell,
as `{ workflowId: 'failed', status: 'failed', error, errorCode }` with no
`cost`. `submit()` of the same body is unchanged. The pass-through arm (a
`$type`, no `step`) does not set these codes.

| `errorCode` | Means | `error` | Retry the same body? |
|---|---|---|---|
| `'step_quote_rejected'` | the orchestrator refused the request | `No price quote for this step: the orchestrator rejected the request: <reason>` when the reason is safe to show, else `No price quote for this step: the orchestrator rejected the request; check the step inputs and references (retrying the same body will not help)` | no — change the body |
| `'step_quote_unavailable'` | no usable answer (an outage, a timeout, a rate limit, …) | `No price quote for this step: none could be obtained; try again` | yes |
| `'step_quote_unpriced'` | the orchestrator answered without a price | `No price quote for this step: the orchestrator answered without one` | not expected to help |

An older host has none of the three: it resolves the estimate priced at the
step's declared estimate. The mock host always quotes a registered step (at
`generation.costPerGen`), so it never sends these codes.

#### Several steps as one workflow: `kind: 'workflow'`

A `kind: 'workflow'` body submits **several orchestrator steps as one
workflow**, where a later step can consume an earlier step's result. It goes
through the hooks you already use: `useBuzzWorkflow().estimate / submit /
watch / cancel`, a `useBatchEstimate()` cell, and `useWorkflowBatch()`. There
is no new hook and no new message.

```tsx
import { useBuzzWorkflow } from '@civitai/blocks-react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

const { estimate, submit, watch } = useBuzzWorkflow();

// Step 1 draws an image; step 2 removes the background from step 1's result.
const body: WorkflowBody = {
  kind: 'workflow',
  arguments: { prompt: 'a lighthouse at dusk' },
  steps: [
    {
      name: 'draw',
      $type: 'imageGen',
      input: {
        engine: 'google',
        model: 'nano-banana-2',
        // Read from `arguments` above.
        prompt: { $ref: '$arguments', path: 'prompt' },
      },
      // An intermediate step: its image is not surfaced.
      suppressOutput: true,
    },
    {
      name: 'cutout',
      $type: 'imageBackgroundRemoval',
      // Read from the EARLIER step named `draw`.
      input: { image: { $ref: 'draw', path: 'output.images[0].url' } },
    },
  ],
};

const quote = await estimate(body);
showPrice(`About ${quote.cost?.total} Buzz`); // an estimate, not a maximum

const submitted = await submit(body);
const done = await watch(submitted.workflowId);

for (const step of done.steps ?? []) {
  if (step.status === 'failed') showError(`${step.name} failed`);
}
// Even when `done.status === 'failed'`, earlier steps may have left images.
showImages(done.imageUrls ?? []);
```

**The body**

- `steps`: 1 to 8 (`BLOCK_WORKFLOW_MAX_STEPS`). Each is `{ name?, $type, input,
  suppressOutput? }`, where `$type` is an orchestrator step type and `input` is
  that step's own input.
- **A step `name`** is optional. It is a lowercase letter followed by up to 31
  of `a-z`, `0-9`, `_` or `-`, unique within the body, and not `block-step`
  (reserved). A step you do not name is named by its position: `$0`, `$1`, ….
- **A reference** is `{ $ref, path, default?, format? }` and may stand in for
  any value in `input`, at any depth. `$ref` is `'$arguments'`, the `name` of an
  **earlier** step, or — for an earlier step you did not name — its position
  (`'$0'` is the first step). A step can never reference itself or a later
  step. An object is a reference only when it has both `$ref` and `path` and no
  other key but `default` / `format`.
- **Limits**: 64 references per body, inputs nested at most 32 levels, `repeat`
  templates nested at most 4 deep, a `$type` of at most 64 characters, and 256
  KB (262144 bytes) for every step's `input` plus `arguments` together. An
  unknown key on the body or on a step is rejected. The app's velocity limit
  counts one unit per step, and a `repeat` step one per iteration instead.
- **No inline media** in a step `input` or in `arguments` — here or in a
  pass-through `kind: 'step'` body's `input`: no `data:image|video|audio` URI
  and no raw base64 string of 4096+ characters, at any depth. Upload the image,
  video or audio with [`useMediaUpload()`](#usemediaupload) (an image also works
  with `useImageUpload({ purpose: 'generationSource' })` or `useImagePicker()`)
  and pass the returned `url`. A body holding more than
  262144 values in those fields is refused outright. `createMockHost` refuses
  both as the host does, naming the path.
- `suppressOutput: true` marks an intermediate step. Its images are left out of
  `snapshot.imageUrls` and out of its own `steps[i].imageUrls`. It still runs
  and is still charged.
- There is **no `maxBuzz`**. The spend ceiling is the app's per-generation
  budget × the number of steps, enforced by the host.
- Any orchestrator `$type` is accepted except the platform-internal ones:
  scanners, moderation classifiers, hashing, web scrape/search, and the retired
  `textToImage` step type.
- **`repeat` over `arguments` only, at most 16 iterations**
  (`BLOCK_WORKFLOW_REPEAT_MAX_ITERATIONS`, nested repeats multiplied). Its input
  is exactly `{ for: { $ref: '$arguments', path, as }, template: { $type,
  name?, input? } }`, where `path` names an array in `arguments`. Inside the
  template, `as` is a source a reference may name; it may not equal a step
  name. The template's `$type` is held to the denylist too. A `repeat` over
  another step's output is refused, because its length is unknown until that
  step has run. The single-step pass-through `kind: 'step'` arm refuses
  `repeat` outright.
- **`merge`**: every entry of `input.fields` needs a string `$ref` (`$arguments`
  or an earlier step, never a repeat variable) and a `reduce`; each counts
  toward the 64-reference limit.
- `WithWorkflowStepRefs<T>` (from `@civitai/app-sdk/blocks`) types an input you
  already have a type for while still allowing references in it.

**🔴 Three things about the price**

1. **The estimate is not a maximum.** When a step reads from an earlier step,
   the orchestrator re-prices it once those values are known and charges the
   difference. Never show the estimate as "you will pay at most".
2. **A workflow the host cannot price has no estimate, but its submit still
   proceeds.** `estimate()` rejects with a `workflow_quote_*` `errorCode` and
   no `cost` (see the second table under Refusals), and a batch estimate
   returns that as the cell. `submit()` of the same body is **not** refused: it
   reserves the ceiling above instead of a quote. So a failed estimate does not
   predict a refused submit. Two exceptions are refused on both, before any
   reservation: a workflow with a training step (a `training-quote-*`
   `errorCode`, as on the single-step arm), and a workflow with a `repeat` step
   at any depth (`workflow_repeat_unbounded`). Their `error` states why there
   is no quote, and only `none could be obtained; try again` is a cause a retry
   of the same body can clear; for the others the body has to change.
   An older host returns the ceiling as the estimate's `cost.total` instead of
   failing, so there a total equal to the ceiling may be unpriced.
3. **One author fee per workflow**, not one per step, on the quoted base. The
   estimate's `cost.authorFee` is that single fee, already inside `cost.total`.
   If the workflow bills more than the quote, the fee charged is held to the
   fee shown. A workflow that does not succeed has its **whole** fee reversed,
   even if earlier steps delivered output.

**The result**

`snapshot.steps` lists every step in order, as `{ name, $type, status,
imageUrls?, output?, error? }`. Read it from `poll()`, `watch()` and
`cancel()`; do not rely on it being on the `submit()` reply. The steps a
`repeat` step generates follow it, named `<repeat name>.<n>`. The top-level
fields keep their meaning: `status` and `cost` are the whole workflow's, and
`imageUrls` is the union of the steps that did not set `suppressOutput`.

🔴 **A `failed` workflow is not an empty one.** Steps that succeeded before the
failing step stay charged and keep their results, so a snapshot with `status:
'failed'` can carry `cost.total > 0` and usable `imageUrls`. Show what did
finish, and do not tell the viewer nothing was charged — though the app fee is
reversed for any workflow that does not succeed.

**Refusals**

A body the host will not run is refused before anything is priced or reserved:
`estimate()` rejects with `WorkflowEstimateError`, `submit()` with
`WorkflowSubmitError`, and a batch estimate returns it as that cell. Branch on
`err.snapshot.errorCode`:

| `errorCode` | Means |
|---|---|
| `'workflow_too_many_steps'` | more than 8 steps |
| `'workflow_step_denied'` | a step names a platform-internal `$type` |
| `'workflow_ref_invalid'` | a reference points at the step itself, a later step, or nothing; a step name breaks the rules above; a `repeat` or `merge` is malformed; or a repeat `as` name is also a step name |
| `'workflow_repeat_unbounded'` | a `repeat` iterates something other than an array in `arguments`, or more than 16 times (nested repeats multiplied); or the workflow has a `repeat` and the host has no price quote for it. `error` then reads `workflow step N: a workflow with a repeat needs a price quote and <cause>`; a retry of the same body can work only when `<cause>` is `none could be obtained; try again` |

A body the host WOULD run, but has no price quote for, fails on `estimate()`
and as a batch-estimate cell only, with no `cost`. `submit()` of the same body
still proceeds (point 2 above):

| `errorCode` | Means | `error` | Retry the same body? |
|---|---|---|---|
| `'workflow_quote_rejected'` | the orchestrator refused the body | `No price quote for this workflow: the orchestrator rejected the request: <reason>` when the reason is safe to show, else `No price quote for this workflow: the orchestrator rejected the request; check the step inputs and references (retrying the same body will not help)` | no — change the body |
| `'workflow_quote_unavailable'` | no usable answer (an outage, a timeout, a rate limit, …) | `No price quote for this workflow: none could be obtained; try again` | yes |
| `'workflow_quote_unpriced'` | the orchestrator answered without a price | `No price quote for this workflow: the orchestrator answered without one` | not expected to help |

An older host has none of the three: it resolves the estimate with the ceiling
as `cost.total`.

- **Requires a host that knows the kind.** An older host refuses the body.
- **Test it locally.** The mock host prices each step with
  `generation.costPerGen` (a function gets the step as its second argument) and
  multiplies it by a `repeat` step's iteration count, then adds
  `generation.authorFee` once; refuses with the four codes of the first table,
  in the host's order; reports
  `steps` on every poll, finishing them in order; and
  `generation.failWorkflowStep: '<name>'` (`'$<index>'` for an unnamed step)
  makes one step fail, so you can render a partial failure. The mock checks
  where a reference points, not whether its `path` exists; it never re-prices;
  and it does not expand a `repeat` step into generated `<name>.<n>` steps. It
  quotes every workflow unless you set `generation.workflowUnpriced` to
  `'rejected'`, `'unavailable'` or `'unpriced'` (`true` means `'unavailable'`),
  which simulates no quote for that cause: a workflow with a training step or a
  `repeat` is refused on both `estimate()` and `submit()`; any other fails its
  `estimate()` with `workflow_quote_<cause>` and no `cost`, while its
  `submit()` is reserved at `buzzBudget` × steps with no fee. The mock has no
  orchestrator reason to pass on, so `'rejected'` always gives the reason-less
  message, never the `…rejected the request: <reason>` form.

> **Estimate must mirror submit** (gotcha #59): build the params for `estimate`
> with the *exact* same logic as `submit` — same seed decision especially. The
> orchestrator whatif prices a cache hit (identical workflow) at 0 and a fresh
> job at full cost, and the seed decides which. A drifting estimate silently
> mis-quotes. See the `buzz-workflow` example.

> **cancel** — `@civitai/blocks-react@0.5.0+` adds `useBuzzWorkflow().cancel(workflowId)`
> for a real server-side orchestrator cancel (gotcha #51), so a running workflow
> stops spending Buzz. Before that, cancel was client-side only (stop polling). If
> your installed version predates 0.5.0, do the client-side half and add the
> `cancel(...)` call after upgrading.
````

**`useAppWorkflows`**

```ts
useAppWorkflows(params?: AppWorkflowsParams): UseAppWorkflows
```

```ts
interface UseAppWorkflows {
  workflows: AppWorkflow[];
  cursor: string | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  cancel: (workflowId: string) => Promise<void>;
}
```

The calling app's **own** generator subqueue — the tag-scoped list of generations **this app** produced for the viewer (newest-first), plus a fail-closed `cancel`. The host self-binds the account off the block token and **forces** the per-app tag filter, so a block only ever sees the queue it produced — never the viewer's personal queue or another app's. Returns `{ workflows, cursor, loading, error, refetch, cancel }`; each `AppWorkflow` is `{ workflowId, status, images[], cost, createdAt }`. Pass the returned `cursor` back as `params.cursor` to page forward. Requires `ai:write:budgeted` (same trust boundary as submit); host-mediated over `QUERY_APP_WORKFLOWS` / `CANCEL_APP_WORKFLOW`. `cancel(workflowId)` sends `CANCEL_APP_WORKFLOW`, resolves once the host confirms the terminal state (which is optimistically spliced into `workflows` in place — no refetch round-trip), and rejects with the host's error on failure.

```tsx
const { workflows, cursor, loading, error, refetch, cancel } = useAppWorkflows({ limit: 20 });
if (!loading && !error) {
  workflows.forEach((w) => console.log(w.workflowId, w.status, w.images.length, w.cost));
}
async function onCancel(id: string) {
  try {
    await cancel(id); // optimistically flips the row to `canceled`
  } catch (err) {
    console.error('cancel failed', err);
  }
}
```

**`useGenerationResources`**

```ts
useGenerationResources(): UseGenerationResources
```

```ts
interface UseGenerationResources {
  fetch: (versionIds: number[]) => Promise<BlockResourceInfo[]>;
}
```

Rehydrate a saved set of generation resources by version id — WITHOUT re-opening the picker. Returns the same widened projection `useResourcePicker` yields (recommended weights, trigger words, clipSkip). DISCOVERY ONLY.

```tsx
const { fetch } = useGenerationResources();
const resources = await fetch([691639, 666002]);   // by saved versionIds
const first = resources[0];             // .versionId / .strength / .trainedWords / .clipSkip
```

**`usePublishGenerationOutputs`**

```ts
usePublishGenerationOutputs(): UsePublishGenerationOutputs
```

```ts
interface UsePublishGenerationOutputs {
  publish: (args: { workflowId: string; imageIndexes?: number[]; title?: string; }) => Promise<number[]>;
}
```

Publish selected outputs of one of the calling app's OWN generations into bare, real-scanned public `Image` rows via the host-mediated `PUBLISH_GENERATION_OUTPUTS` → `PUBLISH_RESULT` bridge. Token-bound + fail-closed: the host self-binds the account off the block token, re-derives (viewer, app, workflowId) ownership before reading the workflow, and re-uploads + FULL-scans each selected output server-side (no url ever crosses from the iframe). The result is a set of bare (post-less) scanned `Image` row ids — no Post, no gallery attach, no rewards/notifications. Host-chrome shows a consent confirm before anything is published, and because that confirm waits on a human the request carries {@link HUMAN_INTERACTION_TIMEOUT_MS}, not the default protocol timeout. `dev:live` refuses this bridge: publishing requires the viewer's signed-in civitai.com session, which the local harness does not have, so `publish()` rejects with a message saying so. Test publishing against the mock host — `createMockHost` or `Harness` from `@civitai/blocks-react/testing`, with the `publishImageIds` / `publishError` options.

```tsx
const { publish } = usePublishGenerationOutputs();
const imageIds = await publish({ workflowId: w.workflowId, imageIndexes: [0, 2] });
// …store imageIds via useSharedStorage() so the grid can read them back gated.
```

<!-- END GENERATED: hooks/generation -->
</HooksReference>
