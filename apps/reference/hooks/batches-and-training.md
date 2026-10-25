---
title: "Batch, confirmed-step and training hooks"
description: "Estimating and running batches, running one job above the per-call budget, and LoRA training. Part of the Hooks reference."
---

<!-- GENERATED PAGE — do not edit by hand. Written by `npm run gen:appblocks:md` (scripts/appblocks-md.mjs); which entry lives on which page is decided in .vitepress/theme/components/referenceSplit.shared.mjs. -->

# Batch, confirmed-step and training hooks

Estimating and running batches, running one job above the per-call budget, and LoRA training.

This page documents 4 of the 48 hooks in the [Hooks reference](../hooks), which indexes every hook by name. Generated from the published `@civitai/blocks-react@0.77.0` package's type definitions and README.

Other pages: [Context, frame and analytics hooks](./context) · [Generation hooks](./generation) · [Buzz, purchase and tip hooks](./buzz-and-purchases) · [Viewer, consent and navigation hooks](./viewer-and-navigation) · [Storage, picker and media hooks](./storage-and-media)

<HooksReference group="batches-and-training">
<!-- BEGIN GENERATED: hooks/batches-and-training — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`useBatchEstimate`**

```ts
useBatchEstimate(): UseBatchEstimate
```

```ts
interface UseBatchEstimate {
  estimateBatch: (bodies: WorkflowBody[], options?: EstimateBatchOptions) => Promise<BatchEstimateResult>;
  pending: boolean;
  result: BatchEstimateResult | null;
  error: BatchEstimateError | null;
}
```

```md
Price a grid of generations in one request. `estimateBatch(bodies)` takes a list
of workflow bodies, each exactly what `useBuzzWorkflow().estimate()` takes, and
resolves with one cell per body, in order, plus the run total. Returns
`{ estimateBatch, pending, result, error }`.

- **One request against the estimate allowance** however many cells it carries.
  On a page app that allowance is shared by every viewer of the app and by the
  host's other reads for it, so a 16-cell grid priced cell by cell used 16 of it.
- **At most 16 bodies per call** (`BATCH_ESTIMATE_MAX_CELLS`). Price a larger grid
  in several calls.
- **Cells are metered too**, against an allowance of their own that is shared
  the same way (on a page app, by every viewer of the app), so a batch is not a
  way around the estimate allowance. A call over either limit is refused whole:
  it rejects with `BatchEstimateError` code `'failed'`. Retry in a few seconds.
- **Every rule of a single estimate applies to each cell.** A cell that one
  `estimate()` would reject comes back as `ok: false` with the same
  `WorkflowEstimateError`, and the other cells still price.
- **`kind: 'training'` bodies are refused per cell.** Estimate a training run
  with `useBuzzWorkflow().estimate()`.
- **A cell never carries a `stepQuote`.** A batch stores nothing, so a
  pass-through step priced above the per-call budget comes back with its cost and
  no confirmable quote. To run it with
  [`useRunConfirmedStep()`](#userunconfirmedstep--one-job-above-the-per-call-budget),
  estimate that one body with `useBuzzWorkflow().estimate()`.
- **Estimate only.** Nothing is submitted and no Buzz is held or spent. There is
  no batch submit. Submit each cell with
  `useBuzzWorkflow().submit()`, which asks the viewer and checks the budget per
  cell. `aggregate.total` is a quote, not a lock: each cell is priced again when
  it is submitted. To follow the submitted cells and cancel them together, see
  [`useWorkflowBatch()`](#useworkflowbatch).

`aggregate.total` sums the cells that priced. It covers the whole grid only when
`aggregate.pricedCells === aggregate.cellCount`; otherwise show it as a partial
total.

**The host bounds the time one call takes.** If its budget runs out, the call
still resolves: the cells that priced are returned, and every other cell is
`ok: false` with `timedOut: true`. Show those cells as unavailable and let the
viewer retry later. Branch on `timedOut`, not on `snapshot.error`: the host's
wording is not a contract.

`estimateBatch` rejects with `BatchEstimateError` only when the whole call
failed. Branch on `err.code`:

| `code` | Meaning | What to do |
|---|---|---|
| `'unsupported'` | The host answered `unsupported on this host`. | Price each cell with `estimate()`. |
| `'timeout'` | No reply in time. A host that supports the batch replies within its own time budget, well inside the default wait, so this usually means a slow host, not an old one. | Show the estimate as unavailable and retry later. **Do not** fall back to one `estimate()` per cell: that sends up to 16 more estimates at a host that is already slow. |
| `'invalid-request'` | Empty list, or more than 16 bodies. Refused before sending. | Fix the list. |
| `'failed'` | Any other whole-call refusal: the scope, a rate limit, review preview. The reason is on `err.hostError`; log it, don't render it. | Show your own copy and retry later. |

A 2 × 2 grid (two prompts × two checkpoints), falling back to per-cell estimates
only on a host that answers `'unsupported'`:
```

```tsx
import { useState } from 'react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';
import {
  BatchEstimateError,
  useBatchEstimate,
  useBuzzWorkflow,
  WorkflowEstimateError,
} from '@civitai/blocks-react';

const PROMPTS = ['a lighthouse at dusk', 'a lighthouse in fog'];
const CHECKPOINTS = [
  { modelId: 101, modelVersionId: 1001 },
  { modelId: 202, modelVersionId: 2002 },
];

/** One cell's quote: a price, or why it has none. */
type CellQuote = { total: number } | { unavailable: string };

export function GridQuote() {
  const { estimateBatch } = useBatchEstimate();
  const { estimate } = useBuzzWorkflow();
  const [quotes, setQuotes] = useState<CellQuote[]>([]);
  const [runTotal, setRunTotal] = useState<number | null>(null);

  const bodies: WorkflowBody[] = PROMPTS.flatMap((prompt) =>
    CHECKPOINTS.map((cp) => ({ kind: 'textToImage' as const, ...cp, params: { prompt } })),
  );

  // Your copy, chosen by `code` (and, for a batch cell, `timedOut`). Never
  // render or match `err.message` or `snapshot.error`.
  const why = (err: WorkflowEstimateError, timedOut = false) =>
    timedOut
      ? 'Price not ready, try again shortly'
      : err.code === 'no-cost'
        ? 'No price for this cell'
        : 'This cell cannot run';

  async function priceGrid() {
    try {
      const { cells, aggregate } = await estimateBatch(bodies);
      setQuotes(
        cells.map((c) => (c.ok ? { total: c.cost.total } : { unavailable: why(c.error, c.timedOut) })),
      );
      setRunTotal(aggregate.pricedCells === aggregate.cellCount ? aggregate.total : null);
      return;
    } catch (err) {
      if (!(err instanceof BatchEstimateError)) throw err;
      if (err.code !== 'unsupported') {
        // 'timeout' is a slow host, not an old one: never fan out per cell here.
        setQuotes([]);
        setRunTotal(null);
        return; // show "pricing unavailable, try again" in your UI
      }
    }
    // This host has no batch estimate: one estimate() per cell, as before.
    const fallback: CellQuote[] = [];
    for (const body of bodies) {
      try {
        const snapshot = await estimate(body);
        fallback.push({ total: snapshot.cost!.total });
      } catch (err) {
        if (!(err instanceof WorkflowEstimateError)) throw err;
        fallback.push({ unavailable: why(err) });
      }
    }
    setQuotes(fallback);
    const priced = fallback.filter((q): q is { total: number } => 'total' in q);
    setRunTotal(
      priced.length === fallback.length ? priced.reduce((sum, q) => sum + q.total, 0) : null,
    );
  }

  return (
    <div>
      <button onClick={() => void priceGrid()}>Price grid</button>
      <ul>
        {quotes.map((q, i) => (
          <li key={i}>{'total' in q ? `${q.total} Buzz` : q.unavailable}</li>
        ))}
      </ul>
      {runTotal !== null && <p>Run total: {runTotal} Buzz</p>}
    </div>
  );
}
```

```md
The fallback spends one request of the shared allowance per cell, which is why
the batch exists. Each submit stays per cell: call `submit(bodies[i])` for each
cell the viewer confirms.

A host that predates the batch message never replies, so the call ends in
`'timeout'` after the full wait. Only if your app must support such a host,
detect it with a deliberate probe: send a one-body batch once with a short
`{ timeoutMs }`, and treat only that probe's `'timeout'` as "no batch support".
Any other `'timeout'` is a slow host.

**Mock host:** `createMockHost` and `Harness` price each cell exactly as they
price one `estimate()` of that body (`costPerGen` and `failEstimate` apply per
cell). Like the host, they refuse the **whole call** while the token lacks
`ai:write:budgeted` — `'failed'`, with `hostError` `block lacks
ai:write:budgeted scope` — so pass `consentGranted: true`, or drive
`requestConsent()` and estimate again once the scope lands. Set `generation.batchEstimate` to `'unsupported'` to test the fallback,
or to `'silent'` to test a call that never gets a reply (pass a short
`timeoutMs` in a test). Set `generation.batchEstimateTimedOutCells` to a list
of cell indices to answer those cells the way the host does when its time
budget runs out (`ok: false`, `timedOut: true`). **`dev:live`** forwards the call to civitai.com, so against
a civitai.com that predates the batch procedure it rejects with `'failed'`
rather than `'unsupported'`.
```

**`useWorkflowBatch`**

```ts
useWorkflowBatch(workflowIds: readonly string[], options?: WorkflowBatchOptions): UseWorkflowBatch
```

```ts
interface UseWorkflowBatch {
  cells: readonly WorkflowBatchCell[];
  summary: WorkflowBatchSummary;
  cancelAll: () => Promise<WorkflowBatchCancelResult>;
  rewatch: () => void;
}
```

Watch a set of already-submitted workflows as one batch: per-cell status, a summary, and cancel-all. Built for grid apps that submit each cell with `useBuzzWorkflow().submit()` (one submit per cell, unchanged) and then have to follow all of them. `useWorkflowBatch(workflowIds, options?)` returns `{ cells, summary, cancelAll, rewatch }`. - **The array of ids is the batch.** There is no server-side batch id. Append each id as its `submit()` resolves, and persist the same array (plain strings) to re-attach after a reload by passing it back. Skip a submit that resolved with the `'failed'` placeholder id: nothing was created. - **Every cell is one ordinary `watch()`**, so each workflow has exactly one poll in flight. When a cell's loop restarts (the list changes, `rewatch()`, a StrictMode remount) the new loop waits for the old loop's poll to return. `options` (`intervalMs`, `waitSeconds`, `timeoutMs`, `maxRetries`) are passed to every cell's `watch()`. - **At most 30 ids** (`WORKFLOW_BATCH_MAX_CELLS`): the poll allowance (1,200 per 60 s per block instance and viewer) divided by one watch's 40 polls a minute. A longer list, a duplicate, an empty id or a `'failed'`/`'whatif'` placeholder throws. - **`summary`** counts `succeeded`, `failed`, `canceled`, `expired` and `running` (not terminal, including cells with no snapshot yet) from each cell's latest snapshot, plus `realisedCost`: the sum of `cost.total` on the terminal snapshots that carry one. That is the generation cost the host reported, not a ledger read; the author fee is charged separately and is not included. `settled` is `running === 0`. - **A host failure placeholder is not a workflow outcome.** When the host fails a poll it answers `{ workflowId: 'failed', status: 'failed' }`. That says nothing about the workflow, so the cell is not counted as failed: its `phase` becomes `'stopped'` with `error` set, and `summary.stopped` counts it. A stopped cell (also a watch that timed out or ran out of retries) is not polled again until you call `rewatch()`. - **`cancelAll()` cancels every cell not known to be finished** and resolves (never rejects) with `{ canceled, alreadySettled, refused, notAttempted, failed, complete }`, each a list of ids. Cancels charge the estimate allowance (150 per 10 s per block instance; on a page app every viewer shares it), so at most four are in flight. A refused cancel resolves `status: 'processing'`: it was not sent and the workflow is still running. After the first refusal the rest of the call is not sent (`notAttempted`). A cancel answered with the host's failure placeholder is `failed`, not a failed workflow. Nothing is retried automatically. When `complete` is `false`, wait a few seconds and call `cancelAll()` again; it targets only cells that are still not finished. - **Unmounting stops every poll.** A `cancelAll()` already running keeps sending.

```tsx
import { useEffect, useState } from 'react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';
import { useBuzzWorkflow, useWorkflowBatch } from '@civitai/blocks-react';

const SAVED = 'grid-run-ids';

function GridRun({ bodies }: { bodies: WorkflowBody[] }) {
  const { submit } = useBuzzWorkflow();
  const [ids, setIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVED) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SAVED, JSON.stringify(ids));
    } catch {
      // Storage can be unavailable; the run still works, it just won't re-attach.
    }
  }, [ids]);

  const { cells, summary, cancelAll, rewatch } = useWorkflowBatch(ids);
  const [cancelNote, setCancelNote] = useState<string | null>(null);

  async function runCell(body: WorkflowBody, key: string) {
    const snap = await submit(body, { idempotencyKey: key });
    if (snap.workflowId !== 'failed') setIds((prev) => [...prev, snap.workflowId]);
  }

  async function onCancelAll() {
    const result = await cancelAll();
    setCancelNote(
      result.complete
        ? null
        : `${result.refused.length + result.notAttempted.length + result.failed.length} cells are still running. Try again in a few seconds.`,
    );
  }

  return (
    <div>
      <button onClick={() => bodies.forEach((b, i) => void runCell(b, `cell-${i}`))}>Run grid</button>
      <p>
        {summary.succeeded} done, {summary.failed} failed, {summary.canceled} cancelled,{' '}
        {summary.running} running. Spent {summary.realisedCost} Buzz.
      </p>
      {!summary.settled && <button onClick={onCancelAll}>Cancel all</button>}
      {summary.stopped > 0 && <button onClick={rewatch}>Refresh stalled cells</button>}
      {cancelNote && <p>{cancelNote}</p>}
      <ul>
        {cells.map((cell) => (
          <li key={cell.workflowId}>{cell.snapshot?.status ?? 'queued'}</li>
        ))}
      </ul>
    </div>
  );
}
```

```md
**Mock host:** `createMockHost` and `Harness` keep a cancelled workflow
cancelled on later polls, report a finished workflow's real status when it is
cancelled, and count down an id they did not submit (one restored after a
reload) like any other. Set `generation.cancelRefused` to `true` (or a list of
workflow ids) to answer cancels the way the host does when the allowance is used
up, and `generation.workflowOutcome` to a `(workflowId, body) => 'succeeded' |
'failed' | 'expired'` function to give a grid a mix of outcomes. The mock does
not model the rate limits themselves.
```

**`useRunTraining`**

```ts
useRunTraining(): UseRunTraining
```

```ts
interface UseRunTraining {
  runTraining: (body: QuotedTrainingBody) => Promise<BlockWorkflowSnapshot>;
  pending: boolean;
  error: RunTrainingError | null;
}
```

```md
Train a LoRA with the ai-toolkit engine on **images the viewer uploads**, from
inside a page app — the App Blocks `kind: 'training'` flow, with the same upload
path and `{ air, caption }` dataset shape as Civitai's own training form. Four
steps, three hooks:

1. **Upload** — `useImageUpload({ purpose: 'trainingData' }).open()`
   (`OPEN_IMAGE_UPLOAD { purpose: 'trainingData' }`). Civitai opens an upload
   modal in **its own chrome**; the viewer picks up to 50 PNG, JPEG or WebP
   images, and each is uploaded as a private blob (not published). `open()`
   resolves with every image that uploaded, `[{ url, air }]`, or `null` when
   the viewer cancels. Pair each `air` with your caption — captions up to 8,192
   characters, one blob at most once. The host answers only when its modal
   closes, after every original has uploaded, so `open()` waits up to an hour,
   not the ten minutes the other pickers use.
2. **Quote** — `useBuzzWorkflow().estimate(body)` with a `WorkflowBodyTraining`
   (`kind: 'training'`, `items: [{ air, caption }]`, no `quoteId`). The reply
   carries `trainingQuote: { quoteId, total, imageCount, expiresAt }` — the
   orchestrator's own price for exactly this run, stored server-side for 15
   minutes.
3. **Run** — `useRunTraining().runTraining({ ...body, quoteId })` (`RUN_TRAINING`).
   **Civitai shows the viewer a consent dialog in its own chrome** — price, base
   model, length and dataset size, all read back from the server, never from
   your body, with the host's own copies of the uploads as thumbnails — and
   submits only on their click. Change nothing in the body between the estimate
   and the run; the server checks it against the quoted one.
4. **Follow** — `useBuzzWorkflow().watch(workflowId)`. Once the run's moderation
   status is approved, `trainedEpochs` lists the epochs whose checkpoint is
   ready; send the viewer to the publish wizard with one of them (see
   `trainedEpochs` on `BlockWorkflowSnapshot`).

🔴 **Upload and run in the same page session.** The host remembers the blobs
its own upload modal uploaded for this block, and **refuses a quote naming any
other** with `training data not uploaded here` — before any dialog, so no run
and no charge. A page reload forgets the uploads: ask the viewer to upload
again, then estimate again.

🔴 **Availability.** Behind the host flag **`app-blocks-training-kind`**, which
ships **off** and is evaluated per viewer. **Page apps only** — the model slot
answers `RUN_TRAINING` with an error. The manifest must declare
**`ai:write:budgeted`** and the viewer must be signed in and have granted it.
**Refused from `dev:live` and from review sessions** (the server refuses
development and review tokens); build the flow against the mock host. Requires a
civitai.com host carrying civitai/civitai#5434 (`kind: 'training'`,
`RUN_TRAINING`) and civitai/civitai#6461 (uploaded blobs as the dataset). The
server-prepared dataset this flow used before #6461 (`usePrepareTrainingDataset`,
`PREPARE_TRAINING_DATASET`) is **removed**; a host carrying #6461 answers that
message with the error `removed`.

🔴 **Money.** There is no `maxBuzz` and no timeout knob — the price is the quote.
A confirmed run may cost more than the token's per-call `buzzBudget` (the viewer
confirms the exact price), up to `BLOCK_TRAINING_MAX_BUZZ_PER_RUN` (5,000 Buzz);
an estimate above that is refused. `useBuzzWorkflow().submit()` **refuses** a
training body before sending anything: only `RUN_TRAINING`'s dialog can confirm a
quote, so a training run starts nowhere else.

`runTraining` **rejects** with a `RunTrainingError`; read the flags before
saying anything about money:

| | meaning | what to do |
|---|---|---|
| `err.declined` | the viewer dismissed the dialog — **no run was submitted** | revert, say nothing |
| `err.unconfirmed` | `submission-unconfirmed`, or no reply within the 10-min bound (`err.timedOut`) — the run **may be running and charged** | 🔴 **never retry automatically**: check the viewer's trainings first (`useAppWorkflows()` lists this app's runs). Re-running the same body after the server did start it is a **second, separately charged run** |
| `err.refused` (`code: 'refused'`) | the server refused the submit after the viewer confirmed — a **spend cap** (their daily or private-run Buzz cap, the per-app consent budget, the app's daily spend or rate limit, a dev-session cap) or a **temporary-availability** deny. Refunded: **no run, nothing charged**; the quote is used up | show `err.message` (the server's reason, e.g. `daily Buzz cap reached: …`); estimate again before any retry — buying Buzz does not lift these caps |
| `err.trainingDataNotUploaded` (`code: 'training data not uploaded here'`) | the quote names an image this host did not upload for this block (typically after a reload) — refused before any dialog: **no run, nothing charged** | ask the viewer to upload the images again, then estimate and run the new quote |
| `err.signInRequired` | no session | route into `useRequestSignIn()` |
| `err.code` set otherwise | a host refusal (`review-mode` / `block is not ready` / `invalid training request` / `no block token`) | show or ignore per case |
| `err.code === undefined`, no flag | a server refusal before any submit (expired or used quote, changed body) | estimate again, then retry |

`runTraining` never prompts for `ai:write:budgeted` or re-sends — it carries no
idempotency key and has an outcome where a run may exist.
```

```tsx
const { open } = useImageUpload({ purpose: 'trainingData' });
const { estimate, watch } = useBuzzWorkflow();
const { runTraining } = useRunTraining();

async function train(captionFor: (image: BlockTrainingDataImage) => string) {
  const images = await open();
  if (!images) return; // the viewer cancelled

  const body: WorkflowBodyTraining = {
    kind: 'training',
    items: images.map((image) => ({ air: image.air, caption: captionFor(image) })),
    engine: 'ai-toolkit',
    model: baseModelKey, // a key from Civitai's training catalog
    params: aiToolkitParams, // AiToolkitTrainingParams
    triggerWord: 'mystyle',
    samplePrompts: ['mystyle, a lighthouse at dusk'],
  };
  const quote = (await estimate(body)).trainingQuote;
  if (!quote) return showError('No training price came back.');
  // Show quote.total; the host's dialog will show the same number.

  try {
    const started = await runTraining({ ...body, quoteId: quote.quoteId });
    const done = await watch(started.workflowId, { onUpdate: render });
    setEpochs(done.trainedEpochs ?? []);
  } catch (err) {
    if (!(err instanceof RunTrainingError)) throw err;
    if (err.declined) return; // no run
    if (err.unconfirmed) return showCheckYourTrainings(); // may be running — never auto-retry
    if (err.refused) return showError(err.message); // a cap / availability refusal; no run, nothing charged
    if (err.trainingDataNotUploaded) return showError('Upload the images again.'); // no run
    if (err.signInRequired) return requestSignIn();
    showError('Could not start training. Get a new price and try again.');
  }
}
```

```md
With the mock host — `createMockHost` or `Harness` from
`@civitai/blocks-react/testing` — the training path is **kind-faithful**: it
remembers the blob keys its uploads handed out and refuses a run naming any
other (`training data not uploaded here`, quote kept), refuses items outside the
server's schema at the estimate, a quote above 5,000, a quote run twice and a
body that differs from the quoted one, and needs `ai:write:budgeted` on the
token and a signed-in viewer. Its knobs are `cannedTrainingDataUpload` (the
images an upload returns; default three fresh ones per upload, `null` for a
cancel), `trainingDataNotUploadedHere` (refuse every run as a host that forgot
its uploads would), `trainingQuoteTotal`, `runTrainingError` (`'declined'`,
`'submission-unconfirmed'`, or any server message), `runTrainingCapRefusal` (the
server's resolved cap / availability refusal, which consumes the quote →
`err.refused`) and `generation.trainedEpochs` for the finished run. It has no
upload modal and no consent dialog, so `open()` and `runTraining` settle at once
where the real host waits on the viewer; and it accepts any https blob url as an
`air`, where the server accepts only Civitai-hosted ones — name items by `air`.
**`dev:live` refuses the run** (the server refuses every training request from a
dev token) and answers the upload as a cancel.
```

**`useRunConfirmedStep`**

```ts
useRunConfirmedStep(): UseRunConfirmedStep
```

```ts
interface UseRunConfirmedStep {
  runConfirmedStep: (body: QuotedStepBody) => Promise<BlockWorkflowSnapshot>;
  pending: boolean;
  error: RunConfirmedStepError | null;
}
```

```md
A pass-through `step` job (`{ kind: 'step', $type, input, maxBuzz }`) that costs
more than the app may spend without asking is refused by `submit()` — unless the
**viewer confirms that exact price** in Civitai's own dialog. This hook is that
path. It is the training run's confirm applied to any pass-through `$type`
(`polyGen`, a long video job, …). Three steps, two hooks:

1. **Quote** — `useBuzzWorkflow().estimate(body)`, the body you would submit. When
   the job qualifies the reply carries `stepQuote: { quoteId, total, stepType,
   expiresAt }`. `total` is the price the viewer will confirm and be charged.
2. **Run** — `useRunConfirmedStep().runConfirmedStep({ ...body, quoteId })`
   (`RUN_CONFIRMED_STEP`). Civitai reads the quote back from the server, shows
   the viewer the price in **its** chrome and submits on their click. Resolves
   with the submitted workflow's snapshot.
3. **Watch** — `useBuzzWorkflow().watch(snapshot.workflowId)`, as for any job.

No `stepQuote` on the estimate means the ordinary rules apply: submit it if it
fits the budget, and otherwise it cannot run from an app. Change nothing in the
body between the estimate and the run — the server checks it against the quoted
one.

🔴 **Only a fixed price is confirmable.** `stepQuote` is present when the
orchestrator quoted a **fixed** price (positive, not variable or metered) that is
above the token's per-call `buzzBudget` and at most
`BLOCK_CONFIRMED_STEP_MAX_BUZZ_PER_JOB` (5,000 Buzz). The viewer confirms what
they are charged, so a price that may move, or no price at all, gets no quote.
`stepQuote.total` can differ from `cost.total` on the same snapshot (which stays
what an unconfirmed submit would reserve) — put `stepQuote.total` on your button.

🔴 **Estimate it on its own.** Only a single `estimate()` returns a `stepQuote`.
A batch estimate (`useBatchEstimate()`) stores nothing, so its cells never carry
one: price the grid in a batch, then estimate the one body you want to run.

🔴 **Two bodies make the estimate reject instead of returning a price.** Only
where a quote would otherwise be granted, so not below the budget and not in a
batch. `estimate()` rejects with a `WorkflowEstimateError` whose
`snapshot.error` is the server's message; the same text is the
`RunConfirmedStepError`'s `message` if such a body is run. Neither has a code or
a flag — they are server messages, so match on the text:

| `snapshot.error` / `err.message` | cause | fix |
|---|---|---|
| `a training step type cannot run as a confirmed step — use kind:'training'` | `$type` is `training` or `imageResourceTraining`, in any casing | train with [`kind: 'training'`](#usepreparetrainingdataset-and-useruntraining--lora-training), which has its own dataset and checks |
| starts with `a confirmed step needs plain JSON input (objects, arrays, strings, finite numbers, booleans, null) — ` and ends with the offending path, e.g. `body.input.when is a Date` | `input` holds something that is not plain JSON: a `Date`, `Map`, `Set`, class instance, `BigInt`, `NaN`/`Infinity`, an `undefined` array element, or an empty slot in a sparse array (`… is an empty array slot`). The quote is bound to the exact body, so the body must be exactly representable | send plain JSON (an ISO string for a date, an array for a set). The suffix varies, so match on the part **before the dash** |

🔴 **Single-use, and it expires.** A quote is good for one run and for **15
minutes** (`stepQuote.expiresAt`). The server prices the job again at submit and
refuses a higher price. Estimate again to get a new one.

🔴 **Availability.** Behind the host flag **`app-blocks-confirmed-step`**, which
ships **off** and is evaluated per viewer; requires a civitai.com host carrying
civitai/civitai#5786. **Page apps only** — the model slot answers with an error.
The manifest must declare **`ai:write:budgeted`** and the viewer must be signed
in and have granted it. **Refused for development, dev-tunnel and review
tokens**, so **`dev:live` cannot exercise it**: the estimate there never carries
a `stepQuote` and the bridge replies with a refusal. Build the flow against the
mock host (below). Where the feature is unavailable nothing errors — the estimate
simply has no `stepQuote`, which is also what an older host sends.

🔴 **No retry, ever.** Every confirmation is its own job: there is no idempotency
key, and confirming the same body twice starts and charges two jobs. The hook
never re-sends and never prompts for consent, and `useBuzzWorkflow().submit()`
**refuses** a step body that carries a `quoteId` before sending anything — only
`RUN_CONFIRMED_STEP`'s dialog can confirm a quote. `runConfirmedStep` also
refuses, before sending, a body whose `quoteId` is missing or is not an
`sq_`-shaped id (a training `tq_…` quote, or `undefined` from an estimate that
returned no `stepQuote`).

`runConfirmedStep` **rejects** with a `RunConfirmedStepError`; read the flags
before saying anything about money:

| | meaning | what to do |
|---|---|---|
| `err.declined` | the viewer dismissed the confirm — **no job was submitted**; the quote is still good until it expires | revert, say nothing |
| `err.dailyLimitExceeded` | the job would exceed what remains today of the daily Buzz limit **the viewer** set for this app — **no job, nothing charged**. Civitai has already told the viewer and linked to where the limit is raised | say nothing more; do **not** retry and do **not** offer a Buzz purchase (more Buzz does not lift a limit) |
| `err.unconfirmed` | `submission-unconfirmed`, or no reply within the 10-min bound (`err.timedOut`) — the job **may be running and charged** | 🔴 **never retry automatically**: check the viewer's generations first (`useAppWorkflows()` lists this app's runs). A retry needs a new estimate and a new confirmation, and is a **second, separately charged job** if the first one started |
| `err.refused` (`code: 'refused'`) | the server refused the submit after the viewer confirmed — a **spend cap** (their daily or private-run Buzz cap, the app's daily spend or rate limit). Refunded: **no job, nothing charged**; the quote is used up | show `err.message` (the server's reason); a retry needs a new estimate and usually a later time |
| `err.signInRequired` | no session | route into `useRequestSignIn()` |
| `err.code` set otherwise | a host refusal (`review-mode` / `block is not ready` / `invalid confirmed step request` / `no block token`) | show or ignore per case |
| `err.code === undefined`, no flag | a server refusal with no job started (expired or used quote, changed body, changed price, a training `$type`, non-plain-JSON `input`, the flag is off) | fix the body if the message names it, estimate again, then retry |
```

```tsx
const { estimate, submit, watch } = useBuzzWorkflow();
const { runConfirmedStep } = useRunConfirmedStep();
const { requestSignIn } = useRequestSignIn();

async function generate3d(prompt: string) {
  const body: WorkflowBodyPassThroughStep = {
    kind: 'step',
    $type: 'polyGen',
    input: { prompt },
    maxBuzz: 250,
  };
  const quote = (await estimate(body)).stepQuote;

  try {
    const started = quote
      ? // Over the per-call budget: the viewer confirms `quote.total` in Civitai's dialog.
        await runConfirmedStep({ ...body, quoteId: quote.quoteId })
      : // Within it (or not confirmable): the ordinary path.
        await submit(body);
    return await watch(started.workflowId);
  } catch (err) {
    if (!(err instanceof RunConfirmedStepError)) throw err;
    if (err.declined) return; // no job — say nothing
    if (err.dailyLimitExceeded) return; // no job — Civitai already told the viewer
    if (err.signInRequired) return requestSignIn();
    if (err.unconfirmed) return showCheckYourGenerations(); // may be running — never auto-retry
    if (err.refused) return showError(err.message); // a cap refusal; no job, nothing charged
    showError('Could not start this job. Get a new price and try again.');
  }
}
```

````md
**With the mock host** — `createMockHost` or `Harness` from
`@civitai/blocks-react/testing` — this is the only place the flow can be
exercised before a production host has it. A pass-through `step` estimate carries
a `stepQuote` whenever the mock's price for it (`generation.costPerGen`, or
`cost`) is above the token's per-call budget (`buzzBudget`, default 200) and at
most 5,000, for a signed-in viewer; there is no separate switch. As on the
server, a batch-estimate cell never carries one, and where a quote would be
granted the estimate fails instead, with the server's message, for a training
`$type` and for non-plain-JSON `input`. The mock holds the quotes it stored and
refuses an unknown, expired or already-run one, a body that differs from the
quoted one, and a plain `SUBMIT_WORKFLOW` carrying a `quoteId`. How the run
settles is `runConfirmedStepError`:

| `runConfirmedStepError` | URL | outcome |
|---|---|---|
| unset | — | the viewer confirms; the job starts, charged `stepQuote.total` |
| `'declined'` | `?confirmedStep=declined` | `err.declined`; the quote survives |
| `'daily-limit-exceeded'` | `?confirmedStep=daily-limit` | `err.dailyLimitExceeded`; the quote survives |
| `'submission-unconfirmed'` | `?confirmedStep=unconfirmed` | `err.unconfirmed`; the quote is used up |
| any other string | — | a server message; the quote is used up |

`runConfirmedStepCapRefusal` resolves the server's refunded cap refusal
(`err.refused`), and both knobs are live-tunable with `host.setScenario(...)`.

```tsx
import { createMockHost } from '@civitai/blocks-react/testing';

const host = createMockHost({
  consentGranted: true,
  generation: { costPerGen: 800 }, // above the default 200 per-call budget → quoted
  runConfirmedStepError: 'declined',
});
const uninstall = host.install();
// …later: the viewer confirms this time.
host.setScenario({ runConfirmedStepError: undefined });
```

What the mock does **not** model: it has no dialog, so the run settles at once
where the real host waits on a click; it prices every estimate as fixed, where
the real host gives a variable or metered price no `stepQuote`; and the flag, the
page-only rule and the submit-time re-price are server-side.

#### 3D outputs: `model3dOutputs`

A step that produces 3D models (`polyGen`) lists every model url in
`snapshot.imageUrls`, as before. `snapshot.model3dOutputs` says which is which:
one `{ url, format, variant }` per model, where `format` is the model's own file
format (`'glb'`, `'fbx'`, …) and `variant` is the output it came from (`'model'`,
`'riggedFbxModel'`, `'basicAnimations.walkingModel'`, …). Both are open sets
named by the orchestrator. The field is **omitted** when the workflow produced no
3D model and on hosts that predate it, and the same field is on each
`useAppWorkflows()` row.

```tsx
function modelsOf(snapshot: BlockWorkflowSnapshot) {
  const models = snapshot.model3dOutputs ?? [];
  return {
    // The plain mesh, in the format a web viewer loads.
    glb: models.find((m) => m.format === 'glb' && m.variant === 'model')?.url,
    // The rigged export, for a download button.
    riggedFbx: models.find((m) => m.variant === 'riggedFbxModel')?.url,
    // Every animation clip, whatever the host named them.
    animations: models.filter((m) => m.variant.startsWith('basicAnimations.')),
  };
}
```

In the mock host, `generation.model3dOutputs` puts labels (and their urls in
`imageUrls`) on a succeeded pass-through step.
````

<!-- END GENERATED: hooks/batches-and-training -->
</HooksReference>
