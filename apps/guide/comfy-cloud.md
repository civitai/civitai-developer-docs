---
title: Comfy Cloud (customComfy)
description: Drive a server-owned ComfyUI workflow from an App Block with a { kind, recipe, params } body — the recipe-gated security model, the budget rules, and how to try it in the local harness.
sources:
  - npm:@civitai/app-sdk@0.28.0/blocks#WorkflowBodyCustomComfy
  - npm:@civitai/blocks-react@0.37.0#useBuzzWorkflow
  - go:github.com/civitai/cli#app-create (page-money scaffold: src/comfy.ts)
  - civitai:public/schemas/app-block/v1.json#page.buzzBudgetPerGen
---

# Comfy Cloud (customComfy)

Most generation from an App Block goes through a bounded
[**text-to-image**](./text-to-image) body: you send a prompt, model, and a few
params, and the host builds the generation graph for you. **Comfy Cloud**
(`customComfy`) is the other path — it lets your block drive a **server-owned
ComfyUI workflow** by name, for effects a simple txt2img body can't express (a
panorama stitch, a multi-stage pipeline, a custom-node graph).

The defining constraint: **your block never ships a ComfyUI graph.** It sends a
tiny body that _names_ a workflow the platform already owns:

```ts
import type { WorkflowBodyCustomComfy } from '@civitai/app-sdk/blocks';

// The block picks a registered recipe id + a small, per-recipe-validated params
// object. It never sends a graph — the server owns the workflow in full.
const body: WorkflowBodyCustomComfy = {
  kind: 'customComfy',
  recipe: 'starter-comfy-txt2img', // a SERVER-registered, code-reviewed id
  params: {
    prompt: 'a serene alpine lake at golden hour',
    // seed?: number | null  — omit to let the orchestrator pick
  },
};
```

`recipe` selects the workflow; `params` is a small, bounded object the recipe
validates. That's the entire wire surface.

::: warning Closed beta — access is limited
Comfy Cloud is part of the [closed-beta](./) Apps platform and is **mod-gated**.
You can scaffold and run the sample against the local mock host today (see
[Try it locally](#try-it-locally)); **real** generation needs closed-beta
builder access, and each recipe is added by the Civitai team.
:::

## The recipe-gated model

A **recipe** is a fixed, **server-registered, code-reviewed** ComfyUI workflow,
identified by a stable id (for example `starter-comfy-txt2img`). The recipe —
not your block — owns:

- the **ComfyUI graph** itself,
- the **resource allowlist** (which checkpoints / LoRAs the graph may use),
- the **checkpoint policy**, and
- a hard per-generation **Buzz ceiling** (`maxBuzz`) backed by an aggressive
  step timeout.

Your block influences none of that beyond **choosing the recipe id and its
`params`**. An unknown or unregistered `recipe` is rejected **fail-closed** at
the server boundary, and any `params` field the recipe's schema doesn't accept
is stripped.

::: tip Why it works this way — the security model
A block runs in an untrusted sandboxed iframe. If a block could ship its own
ComfyUI graph, it could pull in arbitrary custom nodes, arbitrary weights, and
arbitrary compute — an unbounded, unreviewable surface. Pinning generation to a
small set of **reviewed, in-repo** recipes keeps the graph, the resources, and
the spend ceiling on Civitai's side of the boundary. It's the same "the host
brokers, you don't" principle as the rest of the [bridge](./concepts#the-host-block-bridge),
applied to ComfyUI.
:::

The trade-off is deliberate: **you cannot bring your own graph.** If the
registered recipes don't cover what you need, a new recipe has to be authored
and reviewed on Civitai's side.

### Requesting a new recipe

Because a recipe is a reviewed, in-repo artifact, adding one isn't self-serve —
it's a change the Civitai team makes. Request one through the **same channel as
beta access**: open a [Request access](https://github.com/civitai/cli/issues/new?template=request-access.yml)
issue on the `civitai/cli` repo describing the workflow you need (what the graph
should do, the models involved, rough runtime), or reach out to the Civitai team
if you already have builder access. There is no runtime or dashboard way to
register a graph yourself.

## Submitting a generation

You submit a `customComfy` body through the **same** `useBuzzWorkflow()` hook you
use for text-to-image generation — the hook takes a full `WorkflowBody`
discriminated union, so switching to Comfy Cloud is just a different `body`:

```tsx
import { useBuzzWorkflow } from '@civitai/blocks-react';
import type { WorkflowBodyCustomComfy } from '@civitai/app-sdk/blocks';

export function RunButton({ prompt }: { prompt: string }) {
  const { estimate, submit, poll, status, result } = useBuzzWorkflow();

  const run = async () => {
    const body: WorkflowBodyCustomComfy = {
      kind: 'customComfy',
      recipe: 'starter-comfy-txt2img',
      params: { prompt },
    };
    await estimate(body);        // display estimate → result.cost.total
    const snap = await submit(body);
    await poll(snap.workflowId); // drive to a terminal snapshot
  };

  return <button onClick={run} disabled={status !== 'confirming'}>Generate</button>;
}
```

The host runs the estimate and submit server-side against your block token,
re-checking scopes and budget every time — your block never talks to the
orchestrator directly. `estimate()` returns a **display estimate**, not a firm
quote; the exact charge is known only when the workflow reaches a terminal
state (see [How generation is billed](#how-generation-is-billed)).

## Requirements

To use Comfy Cloud, your app must be a **page app** (Comfy Cloud is not offered
to slot apps) and its manifest must:

1. **Request the `ai:write:budgeted` scope.** This is the budgeted-generation
   capability — the same scope text-to-image generation uses.
2. **Set `page.buzzBudgetPerGen` ≥ the recipe's per-generation Buzz ceiling.**
   The host mints each generation token with `buzzBudgetPerGen` as its budget and
   **gates every submit on `recipe.maxBuzz ≤ token.buzzBudget`**. If your
   per-gen budget is below the recipe's ceiling, **every submit is rejected**
   before it runs. But that makes the recipe's ceiling a **floor**, and a floor
   is not a sizing method — these are two different quantities. The recipe's
   `maxBuzz` is what the *server* enforces on one job: the step runs under a
   timeout that physically bounds GPU-seconds, and you settle down to the real
   runtime cost regardless. `buzzBudgetPerGen` is what *you* choose — the largest
   single generation your app may request at all, i.e. the blast radius if the
   app is exploited. Size it from how much damage you are willing to absorb, then
   check it clears the floor; sizing it as *the recipe's price plus a margin* is
   the classic mistake, and it re-breaks the app the day you call a pricier
   recipe. See [Sizing the budget](../reference/manifest) in the manifest
   reference.

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

The scaffold's Comfy Cloud sample pairs `buzzBudgetPerGen: 300` with the
`starter-comfy-txt2img` recipe (per-generation ceiling **30** Buzz) — roughly 10×
the ceiling. That headroom is never spent: it bounds what the app is allowed to
*ask for*, while the charge is the real runtime cost. Read the 300 as a
blast-radius limit, not as 30 rounded up.

## How generation is billed

Comfy Cloud is **post-paid with a hard ceiling** — you don't pay a fixed price up
front:

1. **Reserve the ceiling.** On submit, the host reserves the recipe's declared
   `maxBuzz` against the token budget (this is why `buzzBudgetPerGen` must cover
   it).
2. **Cap the runtime.** The recipe runs under an aggressive step **timeout** that
   physically bounds GPU-seconds, so the worst-case charge can't exceed the
   ceiling no matter what the graph does (roughly ~1 Buzz per GPU-second).
3. **Settle to actual.** When the workflow reaches a terminal state, the charge
   **settles down to the real runtime** — a fast job costs less than the ceiling;
   the reservation only bounds the maximum.

So a recipe's ceiling is a **worst case the host reserves against**, not a flat
price — and not a target to size `buzzBudgetPerGen` from.
Surface the `estimate()` value as an estimate in your UI, and read the final
`result.cost.total` on completion.

## Try it locally

The `civitai` CLI's generation scaffold (`civitai app create`, the page-app
template that wires up Buzz + generation) ships a **Comfy Cloud sample** as a
secondary path — a ready-made `src/comfy.ts` that builds a `starter-comfy-txt2img`
body exactly like the snippets above, plus a unit test.

The **mock host** in `npm run dev:harness` implements the `customComfy` message
handlers, so the sample runs **with no backend** — you can wire up the body,
click generate, and see the mocked estimate/submit/poll round-trip locally
before you ever have beta access:

```bash
civitai app create my-app     # generation template ships src/comfy.ts
cd my-app && npm install
npm run dev:harness           # mock host — Comfy Cloud sample runs, no backend
```

Real generation (against a registered recipe) needs closed-beta access and
`npm run dev:live` / a submitted app; see the [Quickstart](./quickstart#submitting-closed-beta).

## Not to be confused with orchestration recipes

Civitai uses the word "recipe" in two unrelated places:

- **App Blocks `customComfy` recipes** (this page) — server-registered ComfyUI
  workflows a _block_ invokes by id through the host bridge. The block sends
  `{ kind: 'customComfy', recipe, params }`; it never holds a token for, or calls,
  the orchestrator directly.
- **[Orchestration recipes](/orchestration/recipes/)** — task-oriented examples
  for the public **Orchestration REST API** (WAN, Flux, upscalers, TTS, …), where
  _you_ hold a Bearer token and POST workflows to
  `orchestration.civitai.com` yourself.

They're different products with different auth models. If you're building an App
Block, you want customComfy recipes; if you're calling the orchestration API
directly, you want [Orchestration recipes](/orchestration/recipes/).

## Next

- [Quickstart](./quickstart) — scaffold, run the harness, submit for review.
- [Concepts](./concepts) — the block / trust-frame / bridge model.
- [Scopes reference](../reference/scopes) — `ai:write:budgeted` and the full scope set.
- [Manifest reference](../reference/manifest) — `page.buzzBudgetPerGen` and every manifest field.
