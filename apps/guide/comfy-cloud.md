---
title: Comfy on Civitai (customComfy)
description: Drive ComfyUI from an App Block — either by naming a server-registered recipe, or by shipping your own graph inline. The two arms, the gates on each, the budget rules, and how to try it in the local harness.
sources:
  - npm:@civitai/app-sdk@0.65.0/blocks#WorkflowBodyCustomComfy
  - npm:@civitai/blocks-react@0.69.0#useBuzzWorkflow
  - go:github.com/civitai/cli#app-create (page-money scaffold: src/comfy.ts)
  - civitai:public/schemas/app-block/v1.json#page.buzzBudgetPerGen
  - civitai:src/server/schema/blocks/workflow.schema.ts#blockInlineComfyBodySchema
  - civitai:src/server/services/blocks/inline-comfy.service.ts
  - civitai:src/server/routers/blocks.router.ts#submitCustomComfyWorkflow
---

<!--
  FILE NAME IS DELIBERATE. The product was renamed "Comfy Cloud" -> "Comfy on
  Civitai", but this file keeps its path so the PUBLISHED URL
  /apps/guide/comfy-cloud keeps resolving. This site has no redirect layer
  (nginx.conf serves static VitePress output with try_files and no 301 rules),
  so renaming the file would 404 every existing inbound link. If the slug must
  change later, add the redirect FIRST — an nginx `location = /apps/guide/comfy-cloud
  { return 301 /apps/guide/comfy-on-civitai; }` — then rename.
-->

# Comfy on Civitai (customComfy)

Most generation from an App Block goes through a bounded
[**text-to-image**](./text-to-image) body: you send a prompt, model, and a few
params, and the host builds the generation graph for you. **Comfy on Civitai**
(`customComfy`) is the other path — it drives ComfyUI, for effects a simple
txt2img body can't express (a panorama stitch, a multi-stage pipeline, a
custom-node graph).

`customComfy` has **two arms**, selected by `mode`:

| Arm | `mode` | Your block sends | Who can run it |
| --- | --- | --- | --- |
| **[recipe](#the-recipe-arm)** | omitted, or `'recipe'` | a registered recipe id + bounded `params` | page apps (closed beta) |
| **[inline](#the-inline-arm-ship-your-own-graph)** | `'inline'` (required) | **the ComfyUI graph itself**, a declared resource manifest, and a `maxBuzz` ceiling | page apps (closed beta) |

::: warning Closed beta — access is limited
Comfy on Civitai is part of the [closed-beta](./) Apps platform and is
**mod-gated**, and both arms are **page-token-only**. You can scaffold and
run the recipe sample against the local mock host today (see
[Try it locally](#try-it-locally)).
:::

## The recipe arm

The block sends a tiny body that _names_ a workflow the platform already owns:

```ts
import type { WorkflowBodyCustomComfyRecipe } from '@civitai/app-sdk/blocks';

// The block picks a registered recipe id + a small, per-recipe-validated params
// object. The server owns the workflow in full. Annotate the ARM, not the
// `WorkflowBodyCustomComfy` union: with `mode` omitted (as here), excess-property
// checking runs against the whole union and admits ANY constituent's keys, so a
// union annotation would let an inline-arm key (`workflow`, `resources`,
// `maxBuzz`) sit here uncaught.
const body: WorkflowBodyCustomComfyRecipe = {
  kind: 'customComfy',
  recipe: 'starter-comfy-txt2img', // a SERVER-registered, code-reviewed id
  params: {
    prompt: 'a serene alpine lake at golden hour',
    // seed?: number | null  — omit to let the orchestrator pick
  },
};
```

That's the entire wire surface for this arm. `mode` may be omitted: a body
without it parses as a recipe.

### The recipe-gated model

A **recipe** is a fixed, **server-registered, code-reviewed** ComfyUI workflow,
identified by a stable id (for example `starter-comfy-txt2img`). The recipe —
not your block — owns:

- the **ComfyUI graph** itself,
- the **resource allowlist** (which checkpoints / LoRAs the graph may use),
- the **checkpoint policy**, and
- a hard per-generation **Buzz ceiling** (`maxBuzz`) backed by an aggressive
  step timeout.

Your block chooses only **the recipe id and its `params`**. An unregistered
`recipe`, or a `params` field the recipe's strict schema doesn't accept, is
rejected **fail-closed**. Code review is what makes a recipe trustworthy; the
[inline arm](#the-inline-arm-ship-your-own-graph) has no review and replaces it
with three mechanical gates. If no registered recipe fits, request one (below)
or ship the graph with the inline arm.

### Requesting a new recipe

Adding a recipe is a change the Civitai team makes. Open a
[Request access](https://github.com/civitai/cli/issues/new?template=request-access.yml)
issue on `civitai/cli` describing the workflow (what the graph should do, the
models involved, rough runtime), or contact the Civitai team if you already have
builder access. Ask for a recipe when you want a reviewed graph you do not have
to ship in the body.

## The inline arm (ship your own graph)

Set `mode: 'inline'` and the body carries the ComfyUI graph itself, plus a
declared manifest of every resource it needs:

```ts
import type { WorkflowBodyCustomComfyInline } from '@civitai/app-sdk/blocks';

const CHECKPOINT = 'urn:air:sdxl:checkpoint:civitai:101055@128078';

const body: WorkflowBodyCustomComfyInline = {
  kind: 'customComfy',
  mode: 'inline',
  workflow: {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CHECKPOINT } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a mountain at dawn', clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: 0, steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1,
        model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'civitai' } },
  },
  // EVERY AIR the graph names must also be declared here.
  resources: [CHECKPOINT],
  prompt: 'a mountain at dawn',
  maxBuzz: 90, // ALSO the step timeout, in seconds — see below
};
```

::: tip The published SDK types the inline arm
`WorkflowBodyCustomComfy` is a **union on `mode`**: import
`WorkflowBodyCustomComfyInline` (with `InlineComfyNode` for nodes) and
`WorkflowBodyCustomComfyRecipe` rather than declaring the shape by hand. Narrow
on the **value** `body.mode === 'inline'`, never on whether the key is present —
a recipe body may carry `mode: 'recipe'` or `mode: undefined`.
:::

### `mode: 'inline'` is required

A `workflow` key does not select this arm. Without `mode` the body routes to the
**recipe** arm and is rejected for a missing `recipe` — the most common
first-try mistake.

### `resources` is a declared manifest, not an inference

Every AIR URN anywhere in your graph — including as an **object key** — must
also appear in `resources`, or the submit is rejected. The match is
**whole-string** (trimmed, case-insensitive): an AIR inside a longer string does
not count. This array is what the entitlement check covers and what the
orchestrator downloads.

Rules that reject a body outright:

- **A `civitai`-sourced AIR must carry a model version id** —
  `urn:air:<ecosystem>:<type>:civitai:<modelId>@<versionId>`. Without one there
  is no version to check entitlement against. The AIR grammar is parsed strictly
  here: all four segments are required.
- **Permitted AIR types are model weights only** — `checkpoint`,
  `diffusion_model`, `unet`, `lora`, `lycoris`, `dora`, `embedding`, `hypernet`,
  `controlnet`, `vae`, `upscaler`, `clip`, `clipvision`, `text_encoders`,
  `motion` and a few siblings. An `oci:image` container AIR is **not** permitted.
  Anything the allowlist does not name is rejected, not passed through.
- **At most 24 entries**, each at most 512 characters. **Duplicates are
  rejected**, not silently deduped.

### Graph limits

All of these **reject** the body; none truncates it.

| Limit | Value |
| --- | --- |
| Nodes | 1 – 300 |
| Serialized graph size | ≤ 262144 bytes (256 KB) |
| Nesting depth | ≤ 128 levels |
| `prompt` / `negativePrompt` | ≤ 1500 characters each |

Each node is exactly `{ class_type, inputs }` and the node schema is strict, so a
raw ComfyUI **Save (API Format)** export needs its per-node `_meta` key stripped
— otherwise the whole body bounces rather than the key being dropped.

An `inputs` value is either a literal or a `[nodeId, outputIndex]` pair wiring
that input to another node's output, exactly as in ComfyUI.

### What replaced code review

Three fail-closed gates stand in for review, all **before** any spend
reservation or orchestrator call, so a rejection costs nothing:

1. **AIR containment** — the rule above.
2. **Entitlement** over the declared `resources`, **stricter than the on-site
   generator**: early-access and Private/epoch subscription are checked, an
   unresolvable version id is rejected, and a resource the site would
   **substitute** with a sibling version is rejected instead.
3. **A moderation sweep** over every string in the graph, not just your declared
   `prompt` — real prompts live in `CLIPTextEncode` nodes.

Orchestrator step fields a block must never set — a session API token, a
container image, a VRAM tier — are unreachable: the step is built server-side
from an allowlist, and naming one in the strict body schema is a rejection.

### Access

**The whole `customComfy` path is page-token-only — both arms.** A model-bound
token is rejected on estimate and submit before either arm is inspected.

<!-- 🔴 FIVE DRAFTS OF THE NEXT PARAGRAPH HAVE BEEN WRONG. Recorded so nobody
     writes a sixth: (1) "app developers only" — no such check exists on this
     path; (2) "the inline arm is ADDITIONALLY page-token-only" — the recipe arm
     is too; (3) "nothing stands between a viewer and a submit except your own
     code" — then named three platform gates in the next clause; (4) "there is no
     per-viewer gate" — the server runs at least four viewer-keyed checks before
     either arm is inspected; (5) listed "a positive `buzzBudget` that covers
     your maxBuzz" as a VIEWER property — it is minted from the app's own
     manifest (`page.buzzBudgetPerGen`, default 10), and that comparison is a
     static check AFTER the arm is chosen, not one of the pre-arm viewer gates.
     If you are tempted to characterise WHO can submit, don't: enumerate the
     refusals from `blocks.router.ts` instead, or say nothing. Every draft above
     was written while fixing the one before it — the failure mode is supplying a
     reason under pressure, so prefer deleting a claim to rewording it.
     🔴 SEPARATE TRAP in the budget sentence below: `maxBuzz` is an INLINE-ARM
     body field, so any sentence naming it must say which arm it means. This
     section covers BOTH arms, and on the recipe arm the ceiling comes from the
     registry (`recipe.budgetFor(params)`), not from a `maxBuzz` the app wrote. -->

Several platform gates run **before** either arm is inspected, each a refusal
your app must handle: the viewer must be **signed in**, **enabled for Apps**
(closed beta), and have granted the **`ai:write:budgeted`** consent scope.
Resource entitlement is checked against the **viewer**, not the app.

A submit is also refused if the per-generation ceiling — the `maxBuzz` you
declare on the inline arm, the registry's on the recipe arm — exceeds your
manifest's `page.buzzBudgetPerGen` (see [Requirements](#requirements)).

An inline body carries **no account preference** (no `accountType` field), so
the host funds it from the default order.

## Submitting a generation

Submit through the **same** `useBuzzWorkflow()` hook as text-to-image — only
the `body` differs:

```tsx
import { useState } from 'react';
import {
  useBuzzWorkflow,
  useBuzzBalance,
  useBuzzPurchase,
  useDomainMaturity,
  WorkflowSubmitError,
} from '@civitai/blocks-react';
import { isSfwCeiling } from '@civitai/app-sdk/blocks';
import type { WorkflowBodyCustomComfyRecipe } from '@civitai/app-sdk/blocks';

export function RunButton({ prompt }: { prompt: string }) {
  const { estimate, submit, watch, status } = useBuzzWorkflow();
  const { openPurchaseModal } = useBuzzPurchase();
  const { balance } = useBuzzBalance(); // null unless `buzz:read:self` is granted and the viewer signed in
  const { maxBrowsingLevel } = useDomainMaturity(); // the domain's ceiling, not `domain` or `isSfw`
  const [message, setMessage] = useState<string | null>(null);
  const [offerTopUp, setOfferTopUp] = useState(false);
  // The hook starts at 'idle'; disable only while a request is in flight.
  const busy = status === 'estimating' || status === 'submitting' || status === 'polling';

  const run = async () => {
    setMessage(null);
    setOfferTopUp(false);
    // `estimate`/`submit` take the whole `WorkflowBody` union, but THIS body is
    // a recipe body — annotate the arm so a stray inline-arm key is a compile
    // error here rather than a server-side rejection at submit time.
    const body: WorkflowBodyCustomComfyRecipe = {
      kind: 'customComfy',
      recipe: 'starter-comfy-txt2img',
      params: { prompt },
    };
    let quote: number | undefined;
    try {
      quote = (await estimate(body)).cost?.total; // display estimate
      const snap = await submit(body);
      // A REFUSED submit (over your per-generation budget, a spend cap, a rate
      // limit) still RESOLVES, with `status: 'failed'` and a placeholder
      // workflowId of 'failed'. A 'failed' reply is terminal, so there is
      // nothing to watch. Branch on `status`, never on whether `workflowId` is set.
      if (snap.status === 'failed') {
        console.warn('generation did not run:', snap.workflowId, snap.error); // log, never render
        setMessage('This generation did not run.');
        return;
      }
      await watch(snap.workflowId); // owns the loop; resolves on the terminal snapshot
    } catch (err) {
      console.warn(err); // developer-facing; never render err.message or snapshot.error
      if (err instanceof WorkflowSubmitError && err.code === 'exception') {
        // A short balance lands here, but so do review preview, a lost response
        // and a network error. Offer a top-up only when the balance proves it:
        // blue plus the one paid pool this block spends is below the quote.
        const spendable = balance
          ? balance.blue + (isSfwCeiling(maxBrowsingLevel) ? balance.green : balance.yellow)
          : null;
        const short = spendable !== null && quote !== undefined && spendable < quote;
        setMessage(short ? 'Not enough Buzz for this generation.' : 'Could not start the generation. Please try again.');
        setOfferTopUp(short);
      } else if (err instanceof WorkflowSubmitError) {
        setMessage('The generation may have started but did not complete.');
      } else {
        setMessage('Something went wrong. Please try again.');
      }
    }
  };

  return (
    <>
      <button onClick={run} disabled={busy}>Generate</button>
      {message && <p>{message}</p>}
      {offerTopUp && <button onClick={() => void openPurchaseModal()}>Top up</button>}
    </>
  );
}
```

The host re-checks scopes and budget on every call. `estimate()` returns a
**display estimate**; the exact charge is known only when the workflow is
terminal (see [How generation is billed](#how-generation-is-billed)). Refusals
and the out-of-Buzz top-up work exactly as for text-to-image — see
[Refused submits](./text-to-image#refused-submits).

## Requirements

Your app must be a **page app**, and its manifest must:

1. **Request the `ai:write:budgeted` scope** (as text-to-image does).
2. **Set `page.buzzBudgetPerGen` ≥ the per-generation Buzz ceiling** (the
   registry's on the recipe arm, your `maxBuzz` on the inline arm). The host
   **gates every submit on `maxBuzz ≤ token.buzzBudget`**, so a lower budget
   rejects **every submit**. See [Sizing the budget](../reference/manifest).

```json
{
  "$schema": "https://civitai.com/schemas/app-block/v1.json",
  "blockId": "my-comfy-app",
  "version": "0.1.0",
  "name": "My Comfy App",
  "type": "block",
  "scopes": ["ai:write:budgeted"],
  "page": {
    "path": "/",
    "title": "My Comfy App",
    "buzzBudgetPerGen": 300
  },
  "contentRating": "g",
  "minApiVersion": "1.0",
  "buildCommand": "npm run build",
  "outputDir": "dist"
}
```

The scaffold pairs `buzzBudgetPerGen: 300` with the `starter-comfy-txt2img`
recipe (ceiling **90** Buzz). The headroom is never spent: it bounds what the
app may *ask for*; the charge is the real runtime cost.

## How generation is billed

Comfy on Civitai is **post-paid with a hard ceiling**:

1. **Reserve the ceiling.** On submit, the host reserves the recipe's declared
   `maxBuzz` against the token budget (this is why `buzzBudgetPerGen` must cover
   it).
2. **Cap the runtime.** The recipe runs under an aggressive step **timeout** that
   physically bounds GPU-seconds, so the worst-case charge can't exceed the
   ceiling no matter what the graph does (roughly ~1 Buzz per GPU-second).
3. **Settle to actual.** When the workflow reaches a terminal state, the charge
   **settles down to the real runtime** — a fast job costs less than the ceiling;
   the reservation only bounds the maximum.

The ceiling is a worst case, not a target to size `buzzBudgetPerGen` from. Show
the `estimate()` value as an estimate, and read the final
`result.cost.total` on completion.

### On the inline arm, `maxBuzz` is also the timeout in seconds

On the inline arm **you declare** the ceiling, and the server derives the step
timeout from it:

> `stepTimeoutSeconds = maxBuzz`

::: danger Setting `maxBuzz` low to be thrifty does not buy a cheap generation
It buys a job that is **killed** after that many seconds and comes back
`expired`, with nothing to show for it and no obvious explanation. `maxBuzz: 10`
is a 10-second timeout.
:::

You are billed the **real** cost either way, settling to actual and refunding
the rest. **Headroom is free**: size `maxBuzz` from the wall-clock time your
graph needs. It must be an integer in **1 – 250**, and still
`≤ token.buzzBudget` (over-budget comes back as a failed snapshot naming both
numbers).

`estimate()` on an inline body **echoes your `maxBuzz` back** as `cost.total` —
the orchestrator cannot price an opaque graph — so show it as "up to N Buzz".

## Try it locally

The `page-money` scaffold (`civitai app create --template page-money`) ships
`src/comfy.ts` with unit-tested body builders for **both arms**:
`buildComfyBody` (a `starter-comfy-txt2img` recipe body) and
`buildInlineComfyBody` (an inline SDXL graph like the one above). The **mock
host** in `npm run dev:harness` runs the **recipe** sample **with no backend**:

```bash
civitai app create my-app --template page-money   # ships src/comfy.ts
cd my-app && npm install
npm run dev:harness           # mock host — recipe sample runs, no backend
npm test                      # exercises BOTH body builders
```

The inline builder is not on the scaffold's mode toggle yet; the scaffold's
README spells out the wiring.

Real generation needs closed-beta access (and a page app — `customComfy` is
page-only on both arms) and `npm run dev:live` / a submitted app; see the
[Quickstart](./quickstart#submitting-closed-beta).

## Not to be confused with orchestration recipes

Civitai uses the word "recipe" in two unrelated places:

- **App Blocks `customComfy` recipes** (this page) — server-registered ComfyUI
  workflows a _block_ invokes by id through the host bridge. The block sends
  `{ kind: 'customComfy', recipe, params }`; it never holds a token for, or calls,
  the orchestrator directly. (The [inline arm](#the-inline-arm-ship-your-own-graph)
  goes through the same host bridge — shipping your own graph does **not** mean
  talking to the orchestrator yourself.)
- **[Orchestration recipes](/orchestration/recipes/)** — task-oriented examples
  for the public **Orchestration REST API** (WAN, Flux, upscalers, TTS, …), where
  _you_ hold a Bearer token and POST workflows to
  `orchestration.civitai.com` yourself.

An App Block wants customComfy recipes.

## Next

- [Quickstart](./quickstart) — scaffold, run the harness, submit for review.
- [Concepts](./concepts) — the block / trust-frame / bridge model.
- [Scopes reference](../reference/scopes) — `ai:write:budgeted` and the full scope set.
- [Manifest reference](../reference/manifest) — `page.buzzBudgetPerGen` and every manifest field.
