---
title: "Generation hooks"
description: "useBuzzWorkflow and the hooks that list, publish and resource a generation. Part of the Hooks reference."
---

<!-- GENERATED PAGE — do not edit by hand. Written by `npm run gen:appblocks:md` (scripts/appblocks-md.mjs); which entry lives on which page is decided in .vitepress/theme/components/referenceSplit.shared.mjs. -->

# Generation hooks

`useBuzzWorkflow` and the hooks that list, publish and resource a generation.

This page documents 5 of the 51 hooks in the [Hooks reference](../hooks), which indexes every hook by name. Generated from the published `@civitai/blocks-react@0.85.1` package's type definitions and README.

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

The generation flow: `estimate` → `submit` → `poll` (or `watch`), host-mediated. Returns `{ estimate, submit, poll, watch, cancel, status, result, error }` — the `UseBuzzWorkflow` interface in `src/hooks/useBuzzWorkflow.ts` is the authority.

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
      // 🔴 Spend MAY ALREADY BE COMMITTED. Do not tell the viewer it was free.
      // This is a FINAL answer: the next submit() gets a fresh key and really
      // runs again (a second reservation). Pass this call's key to replay instead.
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
    a non-throwing failed snapshot. So do not tell the viewer it was free. This
    outcome is final, so the next `submit()`, even of the SAME body, gets a fresh
    `idempotencyKey`, i.e. a real second run and a second reservation; pass the
    failed call's key yourself to replay this reply instead. Read `err.snapshot.workflowId` (a
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

#### An unscanned source or an inline graph the host will not run

These refusals come before anything is priced or reserved, on `estimate()`
(`WorkflowEstimateError`), on `submit()` (`WorkflowSubmitError`) and as that
body's cell of a batch estimate, as
`{ workflowId: 'failed', status: 'failed', error, errorCode }` with no `cost`.
Nothing is charged.

| `errorCode` | Means | `error` | Retry the same body? |
|---|---|---|---|
| `'source-scan-pending'` | a `kind: 'textToImage'` source image (`sourceImages` / `sourceImage`), a `kind: 'step'` or `kind: 'workflow'` input, or an inline `customComfy` graph, names an image the viewer uploaded whose scan has not finished, or a source [`usePersistGenerationSource()`](#usepersistgenerationsource) returned with `ready: false` | `that image is still being scanned — wait for it to finish before using it` | yes, once the scan has finished. With `useImageUpload({ asyncScan: true })`, wait until `scanStatus()` resolves `{ status: 'scanned' }` before you estimate or submit; for a persisted source, call `persist()` again with the same `workflowId` and `imageIndex` until it answers `ready: true` |
| `'inline-node-refused'` | an inline `customComfy` graph uses a node the host does not run inline: one that reads or writes a file path, or a loader whose input comes from another node, is an object, is a URL the host does not fetch, or names a local file. `checkComfyGraph` does not detect this | starts with `inline workflow uses nodes the host does not run inline: ` and names each node, e.g. `node 4 (LoadImage) names a local file in image; upload the media and pass its URL` | no — remove a node that reads or writes a file path; give loader inputs as literal values, and bring media in as Civitai uploads (pass the upload's `url`) |
| `'not-api-format'` | an inline `customComfy` graph is not ComfyUI API format (`checkComfyGraph` reports the same code) | starts with `inline workflow is not a ComfyUI API-format graph` | no — export the graph with "Export (API)" and keep only `class_type` and `inputs` on each node |
| `'model-filenames'` | an inline `customComfy` graph's loader names a model by filename instead of an AIR (`checkComfyGraph` reports the same code) | starts with `inline workflow loads models by filename, which the worker cannot load: ` | no — reference each model by its AIR (`urn:air:…`) and declare it in `resources` |

#### Restricted outputs: `snapshot.outputs`

A finished snapshot can hold an output the host will **not** hand your app. This
happens in two cases. The Buzz that paid for the generation does not include mature
content for this viewer, or the output is above the viewer's own browsing level,
capped by your app's maturity ceiling (an SFW app on an SFW host caps every viewer at
PG-13). Such an output is **restricted**: the host withholds its url.

`snapshot.outputs` lists every available output in order, restricted ones **in
position**. Render your result grid from it:

```tsx
import type { BlockWorkflowOutput, BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';

function Results({ snapshot }: { snapshot: BlockWorkflowSnapshot }) {
  // An older host sends no `outputs`; fall back to the urls.
  const outputs: BlockWorkflowOutput[] =
    snapshot.outputs ?? (snapshot.imageUrls ?? []).map((url) => ({ url }));
  return (
    <div className="grid">
      {outputs.map((out, i) =>
        out.restricted === true ? (
          // No url to load. Do not try to fetch anything for this tile.
          <div key={i} className="locked">
            {out.reason === 'pool' ? 'Mature content is not included with this Buzz' : 'Not available here'}
          </div>
        ) : out.pending === true ? (
          // Not rated yet: `snapshot.ratingPending` is set and `watch` keeps polling.
          <div key={i} className="processing">Still processing</div>
        ) : out.blocked === true ? (
          <div key={i} className="locked">Not available</div>
        ) : (
          <img key={i} src={out.url} alt="" />
        ),
      )}
    </div>
  );
}
```

- `{ url, nsfwLevel? }`: load and show it. `nsfwLevel` is `'pg'`, `'pg13'`,
  `'r'`, `'x'` or `'xxx'`, and is absent when there is no rating to report and
  none could restrict the output (an output whose rating could is `{ pending }`).
- `{ restricted: true, reason }`: **show a locked state; there is no url, and do
  not try to fetch one.** `'pool'` means the paying Buzz does not include mature
  content for this viewer and the output is above PG-13. `'ceiling'` means the
  output is above the viewer's own browsing level, capped by your app's maturity
  ceiling, or above a cap the host put on the request.
  `'unrated'` means no rating will ever arrive for it (a training sample, a 3D
  model on a finished step with no rating source) and one could restrict it; it
  never becomes available. A video from an engine the orchestrator does not rate is
  delivered with its url while unrated, as on Civitai. Treat an unknown `reason`
  like `'ceiling'`.
- **A restricted output is not in `imageUrls`**, nor in a step's `imageUrls`,
  `AppWorkflow.images` or `model3dOutputs`. Those lists are convenience views,
  can be shorter than `outputs`, and are **not for indexing**.
- `{ pending: true }`: **not rated yet**, and its rating could still restrict it, so
  the host holds the url. The snapshot carries `ratingPending: true`; `watch` keeps
  polling for up to two minutes after the final status and resolves once the rating
  lands (or with the last snapshot, still pending). Publishing, posting or persisting
  it is refused with `output N is still being rated, try again shortly`, and so is
  publishing with `imageIndexes` omitted while any output is pending.
- `{ blocked: true }`: blocked by moderation. It keeps its slot and never becomes
  available; naming it is refused.
- ⚠️ **Migration:** an app that built `imageIndexes` from `images` / `imageUrls`
  positions (`images.map((_, i) => i)`) now names a different output whenever an
  earlier one is restricted, pending or blocked. Build them from `outputs` positions,
  or omit `imageIndexes`.
- `steps[].outputs` follows the same rules for one step of a `kind: 'workflow'`
  run, and `useAppWorkflows()` rows carry `outputs` too.
- 🔴 **An index is a position in `outputs`.** `imageIndexes` on
  `publishGenerationOutputs` and on a `createPostFromApp` workflow source, and
  `imageIndex` on `persistGenerationSource`, name the output at that position. A
  restricted output keeps its slot, so an index never moves when a rating lands
  late. Naming a restricted position is **refused** with `output N is restricted`;
  the host never picks another output. An omitted `imageIndexes` means every
  available output that is not restricted.

A malformed `outputs` entry is **replaced in place** by this package's transport with
`{ restricted: true, reason: 'ceiling' }`, so the reply is kept, the slot shows
as locked, and no position moves. In the mock host,
`generation: { restrictedOutputs: { 1: 'pool' } }` restricts the output at
position 1 of a succeeded snapshot, and publish / post / persist naming position
1 reply `output 1 is restricted`, so you can exercise both locally.

#### Unlocking a restricted output: `useOutputUnlock()`

`unlockOutput(workflowId, position)` asks the host to unlock the output at that
position of a workflow your app ran. The host reads the live workflow, decides what
it may offer, and draws its own dialog; your app supplies only the position, never
a price. It resolves with a `BlockOutputUnlockResult` once the viewer is done:

```tsx
const { unlockOutput } = useOutputUnlock();
const result = await unlockOutput(snapshot.workflowId, 1);
if (result.outcome === 'unlocked') setSnapshot(result.snapshot!); // outputs[1] has its url
```

- **`reason: 'pool'`** (the Buzz that paid does not cover mature content): the viewer
  can unlock it with yellow Buzz at the price the host shows, the same unlock as on
  civitai.com. It adds no author share and counts against no spend limit: the
  original generation's spend already did. `'refused'` means the viewer does not
  have enough yellow Buzz.
- **`'ceiling'` / `'unrated'`**: never charged. When the site your app runs on is
  what keeps it out, the host offers your app on civitai.red at the same page
  (`'linked-out'`); when the viewer's own settings hide it, `'unavailable'` with a
  message.
- `'not-restricted'` (it already had a url; a retry lands here), `'not-released'`
  (still above the viewer's level after the unlock; `message` says why) and
  `'dismissed'` (the viewer closed the dialog without a completed unlock) complete the
  set. `'unavailable'` also covers a position that does not exist, a second request
  for a position whose dialog is already open, and an unlock whose orchestrator write
  got no answer (`message` says to check back). Treat an unknown outcome like
  `'unavailable'`.

The reply waits for the viewer, so it uses the human-interaction timeout (10 minutes):
`unlockOutput` rejects when it runs out, which is also what an older host without an
unlock handler produces, and when the host replies with an `error`.

In the mock host, `generation.outputUnlock` decides a `'pool'` position: `'unlock'`
(default), `'dismiss'`, `'insufficient'` (`'refused'`) or `'not-released'`.
`generation.outputUnlockRestricted` decides a `'ceiling'` / `'unrated'` one:
`'dismiss'` (default), `'link-out'` (`'linked-out'`) or `'settings'` (`'unavailable'`).
As on the host, a missing position and a second open request for one position answer
`'unavailable'`.

#### Queue position, ETA and progress

A snapshot from `watch()` / `poll()` carries where the run is right now, for a
progress bar or an "N ahead, starts ~HH:MM" line:

- **`snapshot.eta`** summarises the step that is queued or running now:
  `{ stepName, queuedAhead, startsAt, completesAt, progress, support }`. The
  host reads it off all of the workflow's orchestrator steps, so every kind has
  one, not only `kind: 'workflow'`. It picks the first step with a queue
  position, else the first running step. While that step is queued,
  `queuedAhead` counts the jobs ahead of it and `startsAt` / `completesAt` are
  estimates. While it runs, those two are `null` and `progress` moves.
- **On each entry of `snapshot.steps`** (a `kind: 'workflow'` run): `queue`
  (`{ precedingJobs, estimatedStartAt, estimatedCompleteAt, support }`, present
  only while that step is queued), `progress`, `startedAt` and `completedAt`.

**Absent and `null` mean the same thing.** The host omits a field it has
nothing to report rather than sending `null`. A terminal snapshot has no `eta`,
and neither does a workflow with nothing queued or running. A host that predates
these fields sends none of them.

**A throttled poll is not an update, and `watch` already skips it.** When the
host cannot serve a poll (it is rate-limited), it answers
`{ workflowId, status: 'processing', throttled: true }` without reading the
workflow. `watch` does not pass that reply to `onUpdate` and keeps the previous
real snapshot (its `eta`, `steps` and `cost`) as `result`. It then polls again,
so an app's progress bar does not blank on a refused poll. `poll()` returns
such a reply as is, so check `snapshot.throttled`, but it does not replace
`result` either. `cancel()` rejects on such a reply with
`WorkflowCancelNotIssuedError`, since the cancel was not issued (see the cancel
note below). The `dev:live` host marks its own transient poll-failure reply the
same way. A host that predates the marker sends the same reply without
`throttled`, and that one still reaches `onUpdate`.

🔴 **The queue position does not move on its own between status changes.** A
held poll (`watch`) returns early when the workflow's status, a step's progress
or a job event changes. It does not return when the queue ahead of a waiting
step drains. So while a step is queued, `queuedAhead` and its estimates refresh
at most once per held poll, about every 15 s. Once the step runs, `progress`
updates promptly.

`progress` is a **fraction from 0 to 1**, not a percentage. The host reports it
only for image and video generation steps (`textToImage`, `imageGen`,
`videoGen`). Other types, training among them, report a value that restarts
each phase, so they get none. Every time is an ISO-8601 string and an
**estimate**. `support: 'unavailable'` means there is no capacity for the step
right now; treat a value you do not recognise like `'unsupported'` (no
estimate). `status` is still the only thing that says the run is done.

```tsx
import type { BlockWorkflowEta } from '@civitai/app-sdk/blocks';
import { useState } from 'react';

function RunStatus({ workflowId }: { workflowId: string }) {
  const { watch } = useBuzzWorkflow();
  const [eta, setEta] = useState<BlockWorkflowEta | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    void watch(workflowId, {
      signal: ctl.signal,
      onUpdate: (s) => setEta(s.eta ?? null), // throttled polls never arrive here
    }).then(
      () => setEta(null), // terminal
      () => {}, // a watch error is shown elsewhere
    );
    return () => ctl.abort();
  }, [watch, workflowId]);

  if (!eta) return null;
  if (eta.progress !== null) {
    return <progress max={1} value={eta.progress} />;
  }
  const at = eta.startsAt
    ? new Date(eta.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <span>
      {eta.queuedAhead ?? '?'} ahead{at ? `, starts ~${at}` : ''}
    </span>
  );
}
```

🔴 **A malformed value is dropped, not fatal.** The transport removes an `eta`
that does not have this shape (and likewise a malformed `queue`, `progress`,
`startedAt` or `completedAt` on a step) and delivers the rest of the snapshot,
so a bad estimate never costs you the status or the outputs.

**Mock host:** the polls before `pollsUntilDone` report these fields, encoded
as the host does (an empty field is omitted, not `null`). The first half of
them are queued (`status: 'pending'`, `queuedAhead` falling) and the rest
running (`status: 'processing'`, `progress` rising for an image or video
generation step). The terminal poll has no `eta`. `throttledPolls: [n, …]`
answers those `POLL_WORKFLOW` requests (1-based) as throttled replies. `stepName` is the host's own step name for each kind: `block-step` for
`kind: 'step'` and `kind: 'training'`, `block-custom-comfy` for `customComfy`,
and each step's `name` for `kind: 'workflow'`. A `textToImage` step is named by
the orchestrator, which the mock cannot know, so it uses `$0`. With the default
`pollsUntilDone: 2` the one non-terminal poll is a running one. Pass
`pollsUntilDone: 5` to see two of each.

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
imageUrls?, outputs?, output?, error?, queue?, progress?, startedAt?, completedAt? }`
(`outputs`: [Restricted outputs](#restricted-outputs-snapshotoutputs); the last four:
[Queue position, ETA and progress](#queue-position-eta-and-progress)).
Read it from `poll()`, `watch()` and
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
>
> 🔴 **A throttled cancel was not issued.** If the host cannot serve the cancel
> (it answers `throttled: true`), `cancel()` REJECTS with
> `WorkflowCancelNotIssuedError` (`code: 'cancel-not-issued'`, plus
> `workflowId` and the reply as `snapshot`). The workflow is still running and
> still spending, so retry the cancel after a short wait. The hook's `result`,
> `status` and `error` are left as they were. Any other reply resolves as
> before, with `status` becoming `'done'`.
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

**`usePersistGenerationSource`**

```ts
usePersistGenerationSource(): UsePersistGenerationSource
```

```ts
interface UsePersistGenerationSource {
  persist: (args: BlockPersistGenerationSourceRequest) => Promise<BlockPersistedGenerationSource>;
  isPending: boolean;
  error: Error | null;
}
```

Turn one of the app's **own** finished outputs into a **private, scanned generation source**, to feed into the next generation (an img2img chain, a "refine this one" button). Returns `{ persist, isPending, error }`. `persist({ workflowId, imageIndex })` names the output the way `usePublishGenerationOutputs()` does — a workflow from this app's own subqueue and the output's **position in its `outputs`** (as `useAppWorkflows()` or a snapshot shows them; see [Restricted outputs](#restricted-outputs-snapshotoutputs)), never a url — and resolves with `{ url, width, height, imageId, ready }`. `url` / `width` / `height` are a `BlockGenerationSourceImageInfo`, usable as a `sourceImages` entry wherever a generation source is accepted. - **Private, no confirm.** The image is stored for the viewer with no post and is **not** on the app's shared grid; `useGatedImages()` and a `useCreatePostFromApp()` `published` source do not accept it. No dialog opens. Use `usePublishGenerationOutputs()` to put an output on the grid. - **Same gates as publishing.** It needs `ai:write:budgeted`, a signed-in viewer who is the token's subject, and a FINISHED workflow from this app's own subqueue. An `imageIndex` out of range, an output that is not available, or a restricted position (`output N is restricted`) is refused. - **Size.** The output is re-stored on Civitai, downscaled to fit 2048 px if it is larger. An output under 64 px is refused. - **Scanned.** The host waits up to about 30 s for the scan (the whole request, fetch and store included, runs under one server deadline, so `persist()` waits up to 120 s). `ready: true` means a generation accepts `url` now. **`ready: false`** means the scan has not finished: a generation that uses the source — a `textToImage` `sourceImages` entry included — is refused with the `source-scan-pending` error code. An output the scan blocks, or holds for review, is answered with an error. - **Idempotent.** One image per (viewer, app, `workflowId`, `imageIndex`): calling `persist()` again with the same pair returns the same image, without storing another, with its current `ready`. That is how to wait for a pending scan. - **Where it works.** The full-page app host only. It rejects with the host's error on the model-page slot (iframe) host, in review mode, before the block is ready, and on App Assistant dev-tunnel previews (they have no workflow record for the app). The host allows 60 per hour per viewer. - `dev:live` refuses it (it needs the viewer's signed-in session). Test it against the mock host: `createMockHost` / `Harness` from `@civitai/blocks-react/testing`, with `persistedGenerationSource` (the canned reply, `ready: true` by default; pass one with `ready: false` to simulate a pending scan) and `persistGenerationSourceError`. The mock does not enforce `source-scan-pending`.

```tsx
import type { BlockPersistedGenerationSource, WorkflowBody } from '@civitai/app-sdk/blocks';

declare const modelId: number, modelVersionId: number;
declare function sleep(ms: number): Promise<void>;
const { submit, watch } = useBuzzWorkflow();
const { persist, isPending } = usePersistGenerationSource();

// 1. Generate, and wait for the workflow to FINISH — persist() refuses one that has not.
const first = await submit({ kind: 'textToImage', modelId, modelVersionId, params: { prompt: 'a red fox' } });
const done = await watch(first.workflowId);
if (done.status !== 'succeeded') throw new Error('the first generation did not succeed');

// 2. Persist output 0 as a private source. Same (workflowId, imageIndex) ⇒ same
//    image, so calling again is how to wait for a pending scan.
let src: BlockPersistedGenerationSource = await persist({ workflowId: done.workflowId, imageIndex: 0 });
for (let tries = 0; !src.ready && tries < 3; tries++) {
  await sleep(10_000);
  src = await persist({ workflowId: done.workflowId, imageIndex: 0 });
}

// 3. Use it as the source of the next generation.
const next: WorkflowBody = {
  kind: 'textToImage',
  modelId,
  modelVersionId,
  params: { prompt: 'the same fox, in snow' },
  sourceImages: [{ url: src.url, width: src.width, height: src.height }],
};
try {
  await submit(next);
} catch (err) {
  if (err instanceof WorkflowSubmitError && err.snapshot.errorCode === 'source-scan-pending') {
    // `src.ready` was still false: the scan has not finished, and the host refused
    // before reserving anything. Persist again later, then submit `next` again.
  } else {
    throw err;
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
// …store imageIds in a shared collection so the grid can read them back gated.
```

<!-- END GENERATED: hooks/generation -->
</HooksReference>
