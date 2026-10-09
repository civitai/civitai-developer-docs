---
title: Generating images (text-to-image)
description: The primary App Blocks generation path — submit a text-to-image WorkflowBody, add LoRAs, do img2img (page-only), and read the result — with the server-enforced field contract and the page-vs-model rules stated in full.
sources:
  - npm:@civitai/app-sdk@0.59.0/blocks#WorkflowBodyTextToImage
  - npm:@civitai/blocks-react@0.65.1#useBuzzWorkflow
  - civitai:src/server/schema/blocks/workflow.schema.ts#blockTextToImageBodySchema
---

# Generating images (text-to-image)

Text-to-image is the **primary** generation path for an App Block: your block
sends a small, bounded `WorkflowBody`, and the host builds the generation graph,
prices it, spends the viewer's Buzz, and streams back the images. Your block
never holds an orchestrator token — the host brokers every call from Civitai's
side of the iframe boundary.

This guide is the narrative companion to the generated
[generation bridge reference](../reference/generation): it walks the body shape,
LoRA stacking, img2img, the estimate → submit → watch → cancel lifecycle, and
**what you get back** — and states the **page-vs-model** rules that are enforced
server-side but easy to trip over. For the ComfyUI path — a server-owned graph
you invoke by name, **or your own graph shipped inline** — see
[Comfy on Civitai](./comfy-cloud) instead.

::: warning Closed beta — mod-gated
Like the rest of the [Apps platform](./), generation is **mod-gated** during the
closed beta. You can scaffold and run the whole flow against the local mock host
today; **real** Buzz generation needs closed-beta builder access.
:::

## The happy path

The smallest possible generation is a checkpoint + a prompt. You submit it
through [`useBuzzWorkflow()`](../reference/generation#bridge-useBuzzWorkflow),
which takes a full `WorkflowBody` — the discriminated union keyed by `kind`:

```tsx
import { useState } from 'react';
import {
  useBuzzWorkflow,
  useBuzzBalance,
  useBuzzPurchase,
  useBlockContext,
  useDomainMaturity,
  WorkflowSubmitError,
} from '@civitai/blocks-react';
import { isSfwCeiling } from '@civitai/app-sdk/blocks';
import type { WorkflowBodyTextToImage, ModelSlotContext } from '@civitai/app-sdk/blocks';

type Outcome = 'refused' | 'short' | 'not-started' | 'maybe-started' | 'error' | null;

export function Generate() {
  const { estimate, submit, watch, status } = useBuzzWorkflow();
  const { openPurchaseModal } = useBuzzPurchase();
  // Needs `buzz:read:self` in your manifest AND granted by the viewer, and a
  // signed-in viewer; otherwise `balance` stays null and no top-up is offered.
  const { balance } = useBuzzBalance();
  // The DOMAIN's ceiling, not `isSfw` (which the viewer's own setting narrows):
  // the server picks the pool from the ceiling.
  const { maxBrowsingLevel } = useDomainMaturity();
  const { context } = useBlockContext();
  const ctx = context as ModelSlotContext; // model slot: has modelId + modelVersionId
  const [outcome, setOutcome] = useState<Outcome>(null);
  // The hook starts at 'idle'; only estimate() moves it to 'confirming'. Disable
  // the button while a request is in flight, not "until confirming".
  const busy = status === 'estimating' || status === 'submitting' || status === 'polling';

  const run = async () => {
    setOutcome(null);
    const body: WorkflowBodyTextToImage = {
      kind: 'textToImage',
      modelId: ctx.modelId,
      modelVersionId: ctx.modelVersionId,
      params: { prompt: 'a serene alpine lake at golden hour' },
    };
    let quote: number | undefined;
    try {
      quote = (await estimate(body)).cost?.total; // the price to show, and to test the balance against
      const snap = await submit(body);
      // A REFUSED submit (over your per-generation budget, a spend cap, a rate
      // limit) still RESOLVES, with `status: 'failed'` and a placeholder
      // workflowId of 'failed'. A 'failed' reply is terminal, so there is
      // nothing to watch. Branch on `status`, never on whether `workflowId` is
      // set. See "Refused submits" below.
      if (snap.status === 'failed') {
        console.warn('generation did not run:', snap.workflowId, snap.error); // log, never render
        setOutcome('refused');
        return;
      }
      await watch(snap.workflowId); // owns the loop; resolves on the terminal snapshot
    } catch (err) {
      console.warn(err); // developer-facing; never render err.message or snapshot.error
      if (err instanceof WorkflowSubmitError && err.code === 'exception') {
        // Usually nothing was queued. A balance too low for this run lands HERE,
        // but so do review preview, a lost response, an idempotency conflict and
        // a network error, so the rejection alone never means "out of Buzz".
        // Offer a top-up only when the balance PROVES it. A block spends blue plus
        // ONE paid pool: green under an SFW ceiling, yellow under a mature one
        // (an unknown ceiling counts as SFW, as it does on the server).
        const spendable = balance
          ? balance.blue + (isSfwCeiling(maxBrowsingLevel) ? balance.green : balance.yellow)
          : null;
        setOutcome(spendable !== null && quote !== undefined && spendable < quote ? 'short' : 'not-started');
      } else if (err instanceof WorkflowSubmitError) {
        setOutcome('maybe-started'); // 'workflow-failed': spend may be committed
      } else {
        setOutcome('error'); // estimate() rejected, or watch() gave up
      }
    }
  };

  return (
    <>
      <button onClick={run} disabled={busy}>Generate</button>
      {outcome === 'refused' && <p>This generation did not run.</p>}
      {outcome === 'short' && (
        <p>
          Not enough Buzz for this generation.{' '}
          <button onClick={() => void openPurchaseModal()}>Top up</button>
        </p>
      )}
      {outcome === 'not-started' && <p>Could not start the generation. Please try again.</p>}
      {outcome === 'maybe-started' && <p>The generation may have started but did not complete.</p>}
      {outcome === 'error' && <p>Something went wrong. Please try again.</p>}
    </>
  );
}
```

Both `modelId` and `modelVersionId` are required even though they look
redundant: the host validates that `modelId` matches the token's bound model
**and** that the version belongs to it. On a model slot you already have both
from `useBlockContext().context`; on a page app you obtain them from a
[resource picker](../reference/hooks#hook-useResourcePicker).

## Generation parameters

`params` is a `BlockTextToImageParams` object. Everything except `prompt` is
optional — the host fills sensible defaults (sampler `Euler`, 25 steps,
family-appropriate dimensions), so the simplest block sends only a prompt. Each
bound below is **server-enforced** (over-limit values are rejected before any
Buzz is spent); the authoritative list is the
[reference table](../reference/generation#bridge-BlockTextToImageParams).

| field | range | default |
|---|---|---|
| `prompt` | required | — |
| `negativePrompt` | optional | — |
| `cfgScale` | 1–30 | model-dependent |
| `steps` | 1–50 | 25 |
| `sampler` | name | `Euler` |
| `seed` | int / `null` | orchestrator picks |
| `width` / `height` | 64–2048 | 1024 (SDXL/Flux), 512 (SD1/SD2) |
| `clipSkip` | 0–12 | model-dependent (Flux ignores) |
| `quantity` | 1–4 | 1 |

## Adding LoRAs (`additionalResources`)

Layer LoRAs on top of the checkpoint with `additionalResources` — up to **5**
entries, each `{ modelVersionId, strength? }` with `strength` in **[-1, 2]**
(default `1`):

Because `additionalResources` is page-only (see the warning below), this is a
**page app**: the checkpoint comes from a resource picker, not from a slot
context.

```tsx
import { useBuzzWorkflow, useResourcePicker } from '@civitai/blocks-react';
import type { WorkflowBodyTextToImage } from '@civitai/app-sdk/blocks';

// PAGE APP: modelId/modelVersionId come from a resource picker, not a slot
// context. A page context carries no model fields — see the warning below.
export function GenerateWithLora({ modelId, modelVersionId, baseModel }: {
  modelId: number;
  modelVersionId: number;
  baseModel: string;
}) {
  const { submit } = useBuzzWorkflow();
  const { open } = useResourcePicker();

  const run = async () => {
    // Constrain the LoRA pick to the checkpoint's base-model family.
    const lora = await open({ resourceType: 'LORA', baseModelGroup: baseModel });
    if (!lora) return;

    const body: WorkflowBodyTextToImage = {
      kind: 'textToImage',
      modelId,
      modelVersionId,
      additionalResources: [{ modelVersionId: lora.versionId, strength: 0.8 }],
      params: { prompt: 'a serene alpine lake at golden hour, watercolor' },
    };
    await submit(body);
  };

  return <button onClick={run}>Generate with LoRA</button>;
}
```

The server enforces the whole contract before spending Buzz: entries must be
**LoRAs** (a non-LoRA version is rejected), each must be **base-model-family
compatible** with the checkpoint, and each is **entitlement-checked**
(early-access / Private-subscription). Use the checkpoint's `baseModel` as the
picker's `baseModelGroup` so you never offer an incompatible LoRA.

::: warning `additionalResources` is a page-only field
Like `sourceImage` (below), `additionalResources` is **rejected fail-closed on a
model-bound token** — it is honored only for **page apps**. A model-slot block
that sends `additionalResources` gets a `FORBIDDEN` it can't diagnose from the
response. See [page-vs-model constraints](#page-vs-model-constraints).
:::

### Building a LoRA stack (several slots) {#lora-stack}

The resource picker returns **one** resource per `open()`. An app that layers
several LoRAs (a stack, or a matrix of LoRA × weight) opens it **once per
slot** and keeps the picks in its own state.

The hook reference says to **omit `baseModelGroup` by default**, and that still
holds for an unconstrained pick (the checkpoint picker below passes none, so the
viewer can switch family). A LoRA slot is the case where you do pass it:
it must stay inside the family of the checkpoint already chosen, so pass
`baseModelGroup`, **derived** from that checkpoint's `baseModel` at the moment
you open the picker. Never pass a hardcoded ecosystem string.

```tsx
import { useCheckpointPicker, useResourcePicker } from '@civitai/blocks-react';
import type { BlockCheckpointInfo, BlockResourceInfo } from '@civitai/app-sdk/blocks';

const MAX_LORAS = 5; // server cap on additionalResources

interface LoraSlot {
  resource: BlockResourceInfo;
  strength: number; // [-1, 2]
  requestedFamily: string; // the family this slot was picked FOR
}

export function useLoraStack(
  checkpoint: BlockCheckpointInfo,
  loras: LoraSlot[],
  setCheckpoint: (next: BlockCheckpointInfo) => void,
  setLoras: (next: LoraSlot[]) => void,
) {
  const { open: openCheckpoint } = useCheckpointPicker();
  const { open: openResource } = useResourcePicker();

  // One open() per slot: the picker returns a single resource.
  const addLora = async () => {
    if (loras.length >= MAX_LORAS) return;
    const family = checkpoint.baseModel; // DERIVED, never a literal
    const picked = await openResource({ resourceType: 'LORA', baseModelGroup: family });
    if (!picked || loras.some((l) => l.resource.versionId === picked.versionId)) return;
    setLoras([...loras, { resource: picked, strength: 1, requestedFamily: family }]);
  };

  // The checkpoint pick passes NO baseModelGroup, so the viewer can change family.
  const changeCheckpoint = async () => {
    const { selected } = await openCheckpoint({ currentVersionId: checkpoint.versionId });
    if (!selected) return;
    setCheckpoint(selected);
    // A new family strands the old LoRAs. Drop them (and tell the viewer).
    setLoras(loras.filter((l) => l.requestedFamily === selected.baseModel));
  };

  return { addLora, changeCheckpoint };
}
```

- **Re-filter when the checkpoint changes.** A LoRA left over from the previous
  family makes the server reject the next estimate, with nothing on screen to
  explain it. Compare against the family you **asked for** (`requestedFamily`),
  not the pick's own `baseModel`: the host maps a family to an ecosystem, so a
  pick requested as `SDXL 1.0` can come back labelled `SDXL Turbo`.
- **Respect the limits.** At most **5** entries, each `strength` in
  **[-1, 2]**. Clamp before you build the body, and disable "add" at the cap.
  Page apps only, like every `additionalResources` request.
- Map the stack to the body as
  `additionalResources: loras.map((l) => ({ modelVersionId: l.resource.versionId, strength: l.strength }))`,
  and omit the key when the stack is empty.

The full worked version is the
[generate-studio](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/generate-studio)
example: `src/components/ModelSection.tsx` has the per-slot picker and the
checkpoint change, and `keepCompatibleLoras` in `src/studio/setup.ts` is the
re-filter.

## Image-to-image (`sourceImage` / `sourceImages`) — page apps only

Add a source image to turn the request into **img2img**: the block bridge emits
an `img2img` graph instead of `txt2img`, seeded from your image. There are two
fields for this and the SDK ships both — `sourceImage` (a single
`{ url, width, height }`) and `sourceImages` (an array of them, for multi-image
conditioning). Which one to send is a real decision, not a style preference:
see [choosing between them](#one-image-or-several) below.

This is the one part of the contract with the sharpest constraints, and they are
**all server-enforced**, for both fields:

- 🔴 **Page apps only.** A source image is **rejected fail-closed on a
  model-bound token** — a model-slot block cannot do img2img. This is documented
  nowhere else; if you copy a page-app img2img example into a `model.*` slot
  block you will get a `FORBIDDEN` with no hint why. img2img lives on **page
  apps**.
- **The checkpoint's ecosystem picks the graph.** SD-family checkpoints get
  plain `img2img` ("Image Variations"); edit-capable ecosystems get
  `img2img:edit`. A checkpoint whose ecosystem supports neither is rejected
  fail-closed. The full ecosystem list — and the limits these fields cannot be
  argued out of (Civitai-hosted URLs only, 64–2048 per side, a **per-ecosystem**
  cap on how many images, never both fields at once) — is in
  [what the source-image fields can and cannot do](../reference/generation#what-sourceimage-can-and-cannot-do).
- **Civitai-hosted URL only.** `url` must resolve to a Civitai-controlled host —
  an arbitrary remote URL is rejected (SSRF guard). The way to get a qualifying
  URL is the host's image-upload bridge with `purpose: 'generationSource'`,
  which returns an unscanned private `{ url, width, height }`. In the array form
  **every element** is validated this way — one bad element rejects the whole
  body.

```tsx
import { useBuzzWorkflow, useImageUpload } from '@civitai/blocks-react';
import type { WorkflowBodyTextToImage } from '@civitai/app-sdk/blocks';

// PAGE APP: modelVersionId comes from a resource picker, not a slot context.
export function Img2Img({ modelId, modelVersionId }: { modelId: number; modelVersionId: number }) {
  const { submit } = useBuzzWorkflow();
  const { open } = useImageUpload({ purpose: 'generationSource' });

  const run = async () => {
    const source = await open(); // { url, width, height } — Civitai-hosted, unscanned
    if (!source) return;

    const body: WorkflowBodyTextToImage = {
      kind: 'textToImage',
      modelId,
      modelVersionId,
      // Singular, on purpose: `sourceImage` is `@deprecated` but works on EVERY
      // host, and for one image it is byte-identical to a 1-element
      // `sourceImages`. See "One image, or several?" below.
      sourceImage: { url: source.url, width: source.width, height: source.height },
      params: { prompt: 'the same lake, now at dawn' },
    };
    await submit(body);
  };

  return <button onClick={run}>Remix an image</button>;
}
```

The `generationSource` upload is an **unscanned private input** by contract — the
orchestrator scans it at generation time, so the moderation stamp is the
gen-time scan, not a pre-crossing one. That is the correct posture for an edit
source (it is not a public display image).

### One image, or several? {#one-image-or-several}

The SDK marks `sourceImage` **`@deprecated`** in favour of `sourceImages`. Read
that as a signpost, **not** a removal notice, and do not blanket-migrate:

| you want | send | why |
|---|---|---|
| exactly one image | **`sourceImage`** | understood by every host. The server normalizes it into a 1-element array, so a 1-element `sourceImages` would produce a **byte-identical** generation — there is nothing to gain by switching, and something to lose (below). The SDK states the alias keeps working **indefinitely**. |
| two or more images | **`sourceImages`** | the only field that can express it — but see the host caveat below |

::: danger An old host silently strips `sourceImages` — and still bills you
`sourceImages` needs a host running
[civitai/civitai#3518](https://github.com/civitai/civitai/pull/3518) or later.
The text-to-image body schema is **not** `.strict()`, so a host that predates
#3518 does not reject the field — it **drops it** and runs, and **charges for**,
a plain text-to-image generation with **no image conditioning at all**. You get a
successful workflow, real images and a real Buzz charge for a request that
ignored your input, and there is **no client-side way to detect it**.

Until #3518 is deployed everywhere you target, `sourceImage` (singular) is the
field that works on both.
:::

Sending **both** fields is rejected as ambiguous, so this is genuinely an
either/or.

```tsx
import { useBuzzWorkflow, useImageUpload } from '@civitai/blocks-react';
import type { WorkflowBodyTextToImage } from '@civitai/app-sdk/blocks';

// PAGE APP: multi-image edit. Needs a host on civitai/civitai#3518 or later,
// and a checkpoint whose ecosystem allows more than one image (Qwen: 3).
export function MultiImageEdit({ modelId, modelVersionId }: { modelId: number; modelVersionId: number }) {
  const { submit } = useBuzzWorkflow();
  const { open } = useImageUpload({ purpose: 'generationSource' });

  const run = async () => {
    const a = await open();
    const b = await open();
    if (!a || !b) return;

    const body: WorkflowBodyTextToImage = {
      kind: 'textToImage',
      modelId,
      modelVersionId,
      // Order is preserved into the graph's `images` input.
      sourceImages: [a, b],
      params: { prompt: 'put the subject from the second image into the first' },
    };
    await submit(body);
  };

  return <button onClick={run}>Combine two images</button>;
}
```

## The lifecycle — estimate, submit, watch, cancel

`useBuzzWorkflow()` orchestrates a deliberate estimate → confirm → submit →
watch dance. Nothing starts on its own — you drive each step — but once a
workflow is running, `watch()` owns the polling loop for you. The full return is
in the [reference](../reference/generation#bridge-useBuzzWorkflow); the members
you drive:

- **`estimate(body)`** — a host-side whatIf price. `status` goes
  `'estimating' → 'confirming'`; the cost lands on `result.cost.total`.
  `'confirming'` is **idle** — keep your Generate button enabled.
- **`submit(body, options?)`** — the host runs a whatIf preflight, gates
  `cost ≤ token.buzzBudget`, spends, and returns a snapshot with a
  `workflowId`. `status` goes `'submitting' → 'polling'`. A **refused** submit
  also resolves — with `status: 'failed'` and a placeholder `workflowId`, and
  the hook's `status` goes to `'done'`, not `'polling'` — so a `workflowId`
  alone does not mean a run started; see
  [refused submits](#refused-submits). The `options` bag
  carries **`idempotencyKey`** — 🔴 **read
  [retrying a submit](#retrying-a-submit-safely) before you write any retry
  path**, because a retried submit is how a viewer gets charged twice.
- **`watch(workflowId, options?)`** — **the one you want.** It owns the polling
  loop, resolves with the **terminal** snapshot, and calls `onUpdate` with every
  intermediate one. The loop is sequential and non-overlapping by construction —
  exactly one request per watched workflow is ever in flight.
- **`poll(workflowId)`** — a single host round-trip. The low-level primitive,
  for callers that genuinely want to drive their own cadence; you call it on a
  backoff until the snapshot is terminal
  (`succeeded | failed | canceled | expired`).
- **`cancel(workflowId)`** — a **real server-side orchestrator cancel** (not
  just client-side untracking), so a running workflow stops spending Buzz. The
  host re-derives ownership from the viewer's token, so you can only cancel
  workflows the viewer owns. Resolves with the (now-canceled) snapshot.

```tsx
import { useEffect } from 'react';
import { useBuzzWorkflow } from '@civitai/blocks-react';

export function useAutoWatch() {
  const { watch, result, status } = useBuzzWorkflow();
  useEffect(() => {
    if (status !== 'polling' || !result?.workflowId) return;
    const ac = new AbortController();
    void watch(result.workflowId, {
      signal: ac.signal,
      onUpdate: (snap) => console.log(snap.status, snap.imageUrls?.length ?? 0),
    });
    // Stops WATCHING on unmount. It does not cancel the workflow — Buzz is
    // already spent and the orchestrator keeps running; use cancel() for that.
    return () => ac.abort();
  }, [status, result?.workflowId, watch]);
}
```

### Refused submits, and running out of Buzz {#refused-submits}

A refused submit does **not** reject (with the exceptions below). `submit()`
**resolves** with a snapshot whose `status` is `'failed'`, whose `workflowId`
is the placeholder `'failed'` (no workflow was started, so never `watch()` or
`poll()` it), whose `cost.total` is the amount the server refused to spend
(the price on text-to-image; on Comfy and step workflows it can be the
declared ceiling, `maxBuzz`), and whose `error` says why. (A real workflow that
failed straight away can resolve as `'failed'` too, with its real id — equally
terminal, equally nothing to watch.) So branch on `snap.status === 'failed'`,
as the [happy path](#the-happy-path) does — never on whether `workflowId` is
set. `error` is server-authored and unsanitised: log it, and show the viewer
copy your app owns.

A resolved `'failed'` is **not** always "nothing charged". Only the `'failed'`
placeholder id means the server refused before spending. A real id means a
workflow ran and failed, and the server keeps that reservation. Training is
the other exception: an unconfirmed training submission comes back with the
`'failed'` id **and** `submissionUnconfirmed: true`, and its reservation is not
refunded either. (Training never goes through `submit()`; it runs through
`useRunTraining()`.)

A resolved refusal reports a **limit**, not the viewer's balance: a price over
your per-generation budget (see [Budget model](#budget-model)), a daily spend
cap, the per-app rate limit or daily cap, a temporary "unavailable" deny, or a
missing price quote. The server checks those against the token, its counters
or a quote, and never against the viewer's wallet. Buying Buzz raises none of
them, so do not answer a resolved refusal with
`useBuzzPurchase().openPurchaseModal()`.

**Running out of Buzz is a rejection, not a refusal.** The host never checks
the viewer's balance itself. The generation service does, and when the balance
is too low the submit throws on the host. The block gets a reply with no
`cost`, and `submit()` **rejects** with a `WorkflowSubmitError` whose `code` is
`'exception'`. That is the one case where a top-up can help, but the rejection
alone **cannot tell you it happened**. `'exception'` also covers review
preview, a lost response, an idempotency conflict and a network error, and only
`err.snapshot.error`'s text differs, which is server-authored and not a
contract. Offering a top-up on every `'exception'` would tell a viewer with a
full wallet they are low on Buzz.

So decide from the **balance**, not the rejection. The happy path reads it with
[`useBuzzBalance()`](../reference/hooks#hook-useBuzzBalance) and offers
`openPurchaseModal()` only when the Buzz the block can actually **spend** is
below the quoted `cost.total`. A block spends `blue` plus **one** paid pool,
chosen by the domain's maturity **ceiling**: `green` on an SFW ceiling, `yellow`
on a mature one. It never spends both, so an SFW block cannot spend `yellow`,
and adding all three pools together would hide a real shortfall. The snippet
reads the ceiling as `maxBrowsingLevel` from
[`useDomainMaturity()`](../reference/hooks#hook-useDomainMaturity) and tests it
with `isSfwCeiling` from `@civitai/app-sdk/blocks`. An unknown ceiling counts as
SFW, exactly as it does on the server. Two look-alikes must **not** choose the
pool:
- **`domain` is informational only.** On civitai.red a block can be told
  `domain: 'blue'` while its ceiling is fully mature, and the server then
  spends `yellow`.
- **`isSfw` is the wrong test here.** It also reflects the viewer's own NSFW
  setting, which is right for deciding what to *show* but not what the server
  *spends*.

Reading the balance needs the **`buzz:read:self`** scope. Declare it in your
manifest's `scopes`. It is **not** consent-exempt, so the viewer must also
grant it, and `useBuzzBalance()` does not ask for it on its own. The read is
also refused for a viewer who is not signed in. In either case `balance` stays
`null`, and the happy path shows a generic "Could not start the generation"
with **no** top-up offer. That is the cost of the
fallback: a viewer who really is short, in a block without the grant, gets no
purchase prompt. The alternative, offering one on every `'exception'`, is
wrong for everyone else.

Other rejections: a pass-through training step the orchestrator would not quote
is refused **without** a `cost`, so it rejects too. The
[`useBuzzWorkflow` reference](../reference/generation#bridge-useBuzzWorkflow)
states the same model from the SDK's own doc comments. It has the complete list
of resolved refusals, each `WorkflowSubmitError` `code` and what it says about
money, and the spendable-balance rule for a top-up.

### Retrying a submit safely — `idempotencyKey` {#retrying-a-submit-safely}

A retry is the one place a block can spend the viewer's Buzz **twice for one
generation**, and it is invisible from the client: if the submit succeeded
server-side and only the *response* was lost (a timeout, a dropped connection),
a naive retry starts a second paid workflow.

`submit()`'s second argument exists for exactly that:

```tsx
import { useBuzzWorkflow } from '@civitai/blocks-react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

export function useSubmitWithRetry() {
  const { submit } = useBuzzWorkflow();

  // `cellId` identifies ONE logical generation. Every retry of it reuses the
  // same key, so the host + orchestrator collapse them to ONE Buzz charge.
  // The separator is `-`, not `:` — a colon fails the key's charset (below).
  return async (body: WorkflowBody, cellId: string) => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await submit(body, { idempotencyKey: `gen-${cellId}` });
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  };
}
```

- **Omit it** and the hook generates a fresh key per `submit()` call — the right
  default, since each call is a new logical submit.
- **Pass a stable id** — a grid-cell id, a request id you already hold — only
  for the *retry* of a submit you already made.
- **Don't key it to something coarse** (a component instance, the block id):
  two genuinely different generations that share a key become eligible to be
  collapsed as if one were a retry of the other.

::: danger The key's charset is validated — `^[A-Za-z0-9_-]{1,64}$`
**Letters, digits, `_` and `-` only, 1–64 characters.** The host validates the
field before it prices anything, so a key outside that class is refused outright:

```json
{ "code": "invalid_format", "format": "regex",
  "pattern": "/^[A-Za-z0-9_-]{1,64}$/",
  "path": ["idempotencyKey"],
  "message": "Invalid string: must match pattern /^[A-Za-z0-9_-]{1,64}$/" }
```

— a `BAD_REQUEST` / **`400`**. Nothing is queued and nothing is charged, so a
block that composes its keys this way simply never generates.

🔴 **A colon is the one to watch, and it is excluded deliberately** — not as an
oversight you can work around with a different punctuation mark. The host joins
the parts of its internal per-viewer / per-app dedupe and rate-limit keys with
`:`, and those joins are only collision-free while your key cannot contain one;
a colon-bearing key could cross into a neighbouring key's namespace. So `.`,
`/`, `|`, `#`, spaces and every other separator are **also** rejected — the
allowed class is the whole contract. Use **`-`** or `_` when you need to
concatenate parts, as the example above does.

The **64**-character bound is derived too: the host builds the identifier it
hands the orchestrator out of your key plus a prefix, and the orchestrator
enforces its own `^[A-Za-z0-9_-]+$` over at most 128 characters. 64 keeps the
worst case inside that.

**Safe**: `` `gen-${cellId}` ``, `crypto.randomUUID()` (36 chars, `[0-9a-f-]`).
**Not safe**: `` `gen:${cellId}` ``, `React.useId()` — `useId` returns a
colon-wrapped value such as `:R0:` and will 400.

The same charset governs every idempotency key the platform takes — the REST
`POST /api/v1/blocks/workflows/submit` body (where it is **required**),
`useGoodPurchase().purchase()` and `useTip().tip()`. Full rationale:
[`idempotencyKey` — the validated charset](../reference/generation#idempotency-key-charset).
:::

The reference entry is
[`SubmitWorkflowOptions`](../reference/generation#bridge-SubmitWorkflowOptions).

## What you get back — the result shape

Both `submit` and `poll` resolve with a `BlockWorkflowSnapshot` — a **flattened
subset** of the orchestrator's workflow that the host maps down before it
crosses the boundary. The fields you render (full list in the
[reference](../reference/generation#bridge-BlockWorkflowSnapshot)):

- **`status`** — `'pending' | 'processing' | 'succeeded' | 'failed' |
  'expired' | 'canceled'`.
- **`imageUrls`** — the finished image URLs, **flattened from the workflow's
  `steps[].output.images[].url`**. This is where your results are.
- **`cost.total`** — the host-attested Buzz total for the run.
- **`spentAccountType`** — the Buzz pool that was the primary funder
  (informational; surface it, don't gate on it).
- **`autoClaim`** — set when the host opportunistically claimed a daily-boost
  reward during submit; surface a small "+25 daily boost" notice.

```tsx
import { useBuzzWorkflow } from '@civitai/blocks-react';

export function Results() {
  const { result } = useBuzzWorkflow();
  if (result?.status !== 'succeeded') return null;
  return (
    <div>
      {result.imageUrls?.map((url) => <img key={url} src={url} alt="" />)}
      <small>Cost: {result.cost?.total} Buzz</small>
    </div>
  );
}
```

## Reading your app's queue (`useAppWorkflows`)

To show a running list of the generations **your app** submitted (across
reloads), read the per-app subqueue with `useAppWorkflows()`. It returns a
wire-stable `AppWorkflow[]` projection — `workflowId`, `status`, `images`
(only `available` blobs with a URL), `cost`, `createdAt` — with every internal
field (steps, params, prompts, resources) deliberately dropped. The full shape
is in the [reference](../reference/generation#bridge-AppWorkflow).

## Budget model

Text-to-image is **prepaid** (unlike Comfy on Civitai, which is post-paid). The host
whatIf-prices the graph exactly, so:

1. **Your `estimate()` mirrors the `submit()` price** — surface it before you
   spend.
2. **`submit()` gates `cost ≤ token.buzzBudget`** per call, then debits the
   viewer.

A page app sets its per-generation budget with `page.buzzBudgetPerGen` in the
manifest. That budget is a **safety ceiling, not an estimate** — it exists so a
buggy or compromised app can't drain the viewer's Buzz, and you are charged the
real price regardless. Size it at *several times* your worst-case run, not at
what you expect a run to cost: a submit priced above the budget is rejected
before it runs (nothing charged, nothing delivered), and it stays that way for
every user until you ship a new manifest version. See
[Sizing the budget](../reference/manifest) in the manifest reference. The
`ai:write:budgeted` [scope](../reference/scopes) is required either way.

## Page-vs-model constraints

The same `textToImage` body is accepted on both a **page app** token and a
**model-slot** token, but two body fields are **page-only** and rejected
fail-closed on a model-bound token:

| field | model slot (`model.*`) | page app |
|---|---|---|
| `modelId` / `modelVersionId` / `params` | ✅ | ✅ |
| `additionalResources` (LoRAs) | ❌ `FORBIDDEN` | ✅ |
| `sourceImage` (img2img, single) | ❌ `FORBIDDEN` | ✅ |
| `sourceImages` (img2img, multi) | ❌ `FORBIDDEN` | ✅ |

If you are building a `model.*` slot block, keep to checkpoint-only txt2img. If
you need LoRA stacking or img2img, build a **page app**.

## Try it locally

The generation scaffold wires all of this up against the **mock host**, so the
estimate/submit/poll round-trip runs with no backend:

```bash
civitai app create my-app --template page-money   # the generation template
cd my-app && npm install
npm run dev:harness           # mock host — no backend needed
```

Real Buzz generation needs closed-beta access; see the
[Quickstart](./quickstart).

## Next

- [Generation bridge reference](../reference/generation) — the generated field-level contract.
- [What the bridge can and cannot do](../reference/generation#what-the-bridge-can-and-cannot-do) — the boundary vs the orchestrator, and what to do when a model isn't reachable.
- [Comfy on Civitai (customComfy)](./comfy-cloud) — the recipe-gated ComfyUI path.
- [Hooks reference](../reference/hooks) · [Messages reference](../reference/messages).
- [Scopes](../reference/scopes) — `ai:write:budgeted`. · [Manifest](../reference/manifest) — `page.buzzBudgetPerGen`.
