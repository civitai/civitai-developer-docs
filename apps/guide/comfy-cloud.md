---
title: Comfy on Civitai (customComfy)
description: Drive ComfyUI from an App Block — either by naming a server-registered recipe, or by shipping your own graph inline. The two arms, the gates on each, the budget rules, and how to try it in the local harness.
sources:
  - npm:@civitai/app-sdk@0.31.0/blocks#WorkflowBodyCustomComfy
  - npm:@civitai/blocks-react@0.39.0#useBuzzWorkflow
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
| **[recipe](#the-recipe-arm)** | omitted, or `'recipe'` | a registered recipe id + bounded `params` | closed-beta builders |
| **[inline](#the-inline-arm-ship-your-own-graph)** | `'inline'` (required) | **the ComfyUI graph itself**, a declared resource manifest, and a `maxBuzz` ceiling | app developers |

::: danger This page used to say you could not do the second one
Earlier revisions stated flatly that a block never ships a ComfyUI graph and
could not bring its own. That was true when the recipe arm was the only one; the
inline arm shipped afterwards and this page was not updated. A developer working
against the live feature read the old sentence, believed it over their own
testing, and concluded the capability did not exist. It does.
:::

::: warning Closed beta — access is limited
Comfy on Civitai is part of the [closed-beta](./) Apps platform and is
**mod-gated**, and the inline arm additionally requires an **app-developer**
account. You can scaffold and run the recipe sample against the local mock host
today (see [Try it locally](#try-it-locally)).
:::

## The recipe arm

The block sends a tiny body that _names_ a workflow the platform already owns:

```ts
import type { WorkflowBodyCustomComfy } from '@civitai/app-sdk/blocks';

// The block picks a registered recipe id + a small, per-recipe-validated params
// object. The server owns the workflow in full.
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
validates. That's the entire wire surface for this arm.

Note that `mode` is **omitted**, not set to `'recipe'`. The server declares it an
optional literal precisely so that a body without the key parses as a recipe —
which is what keeps every block written before the inline arm existed working
unchanged.

### The recipe-gated model

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

::: tip Why the recipe arm works this way — the security model
A block runs in an untrusted sandboxed iframe. Code review is what makes a recipe
trustworthy: a human checked the graph, the resources it pins, and the ceiling it
declares. Pinning a generation to a reviewed, in-repo artifact keeps all three on
Civitai's side of the boundary. It's the same "the host brokers, you don't"
principle as the rest of the [bridge](./concepts#the-host-block-bridge), applied
to ComfyUI.

The [inline arm](#the-inline-arm-ship-your-own-graph) has no such review, so it
replaces it with three mechanical gates rather than dropping the requirement.
:::

The trade-off is deliberate: **within this arm** you choose the recipe, not the
graph. If the registered recipes don't cover what you need, you have two options
— request a new recipe (below), or ship the graph yourself with the
[inline arm](#the-inline-arm-ship-your-own-graph).

### Requesting a new recipe

Because a recipe is a reviewed, in-repo artifact, adding one isn't self-serve —
it's a change the Civitai team makes. Request one through the **same channel as
beta access**: open a [Request access](https://github.com/civitai/cli/issues/new?template=request-access.yml)
issue on the `civitai/cli` repo describing the workflow you need (what the graph
should do, the models involved, rough runtime), or reach out to the Civitai team
if you already have builder access.

Ask for a recipe when you want a graph available to **every viewer** of your
block. If you just want to run a graph now, that's what the inline arm is for.

## The inline arm (ship your own graph)

Set `mode: 'inline'` and the body carries the ComfyUI graph itself, plus a
declared manifest of every resource it needs:

```ts
// The inline arm's body shape, written out here rather than imported so the
// shape is visible. It mirrors the server's schema field-for-field.
type InlineComfyBody = {
  kind: 'customComfy';
  mode: 'inline';
  workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }>;
  resources: string[];
  prompt?: string;
  negativePrompt?: string;
  maxBuzz: number;
};

const CHECKPOINT = 'urn:air:sdxl:checkpoint:civitai:101055@128078';

const body: InlineComfyBody = {
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

::: warning The published SDK does not type the inline arm yet
That is why the shape above is written out by hand rather than imported. In the
pinned `@civitai/app-sdk@0.31.0` — also the newest published version —
`WorkflowBodyCustomComfy` is the **recipe** shape only
(`{ kind, recipe, params }`): there is no `mode` field on it, and no
`WorkflowBodyCustomComfyInline` or `InlineComfyNode` export to import. The
server accepts an inline body; the published types have not caught up.

So declare the shape locally, as above. When you narrow, narrow on the **value**
of `body.mode === 'inline'` — never on whether the `mode` key is present,
because a recipe body may legitimately carry `mode: 'recipe'` or even
`mode: undefined`.
:::

### `mode: 'inline'` is required

Including a `workflow` key does not select this arm. A body without `mode` routes
to the **recipe** arm and is then rejected for a missing `recipe` — an error that
reads as though something unrelated went wrong. This is the single most common
first-try mistake.

### `resources` is a declared manifest, not an inference

Every AIR URN that appears anywhere in your graph — including as an **object
key** — must also appear in `resources`, or the submit is rejected. The server
does not extract them for you, and the match is **whole-string** (trimmed,
case-insensitive): an AIR embedded inside a longer string does not count as
declared.

That flat array is the entire surface the entitlement check runs over, and the
containment rule is what makes checking it sufficient. It is also what the
orchestrator downloads — anything your graph references that is missing from the
list would fail at load time inside ComfyUI regardless.

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

A recipe is trustworthy because a human read it. An inline graph has no review,
so three fail-closed gates stand in — all of which run **before** any spend
reservation or orchestrator call, so a rejection costs nothing:

1. **AIR containment** — the rule above. Without it, gating `resources` would
   prove nothing about what the graph actually loads.
2. **Entitlement**, over the declared `resources`, and **stricter than the
   on-site generator**: early-access `hasAccess` and Private/epoch subscription
   are both folded in, an unresolvable version id is a hard rejection rather than
   a silent drop, and a resource the site would normally **substitute** with a
   sibling version is rejected instead — your graph names one exact AIR string
   and nothing rewrites it.
3. **A moderation sweep** over every distinct string leaf in the graph, not just
   your declared `prompt`. A real graph carries its prompts inside
   `CLIPTextEncode` nodes, so auditing a declared field alone would leave
   moderation reading a value the generation never uses. A clean declared
   `prompt` therefore cannot launder a graph prompt.

Fields the orchestrator's own step input accepts but a block must never set —
a session API token, a container image, a VRAM tier — are unreachable: the step
is constructed server-side from an allowlisted set, and the body schema is strict
so naming one of them is a rejection rather than a silently ignored key.

### Access

The inline arm is **app-developer-only** and **page-token-only**. The host runs a
developer check on every `customComfy` estimate *and* submit, so a non-developer
viewing your published block cannot submit one. Treat inline as a build-and-
iterate primitive; to serve a graph to every viewer, get it registered as a
recipe.

An inline body also carries **no account preference** — its schema has no
`accountType` field anywhere, so the host funds it from the default order.

## Submitting a generation

You submit a `customComfy` body through the **same** `useBuzzWorkflow()` hook you
use for text-to-image generation — the hook takes a full `WorkflowBody`
discriminated union and forwards the body verbatim, so switching to Comfy on
Civitai (either arm) is just a different `body`:

```tsx
import { useBuzzWorkflow } from '@civitai/blocks-react';
import type { WorkflowBodyCustomComfy } from '@civitai/app-sdk/blocks';

export function RunButton({ prompt }: { prompt: string }) {
  const { estimate, submit, watch, status, result } = useBuzzWorkflow();

  const run = async () => {
    const body: WorkflowBodyCustomComfy = {
      kind: 'customComfy',
      recipe: 'starter-comfy-txt2img',
      params: { prompt },
    };
    await estimate(body);        // display estimate → result.cost.total
    const snap = await submit(body);
    await watch(snap.workflowId); // owns the loop; resolves on the terminal snapshot
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

To use Comfy on Civitai, your app must be a **page app** (Comfy on Civitai is
not offered to slot apps) and its manifest must:

1. **Request the `ai:write:budgeted` scope.** This is the budgeted-generation
   capability — the same scope text-to-image generation uses.
2. **Set `page.buzzBudgetPerGen` ≥ the per-generation Buzz ceiling.** On the
   recipe arm that ceiling comes from the registry; on the inline arm it is the
   `maxBuzz` you declare. The host mints each generation token with
   `buzzBudgetPerGen` as its budget and
   **gates every submit on `maxBuzz ≤ token.buzzBudget`**. If your
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

The scaffold's Comfy on Civitai sample pairs `buzzBudgetPerGen: 300` with the
`starter-comfy-txt2img` recipe (per-generation ceiling **30** Buzz) — roughly 10×
the ceiling. That headroom is never spent: it bounds what the app is allowed to
*ask for*, while the charge is the real runtime cost. Read the 300 as a
blast-radius limit, not as 30 rounded up.

## How generation is billed

Comfy on Civitai is **post-paid with a hard ceiling** — you don't pay a fixed price up
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

### 🔴 On the inline arm, `maxBuzz` is also the timeout in seconds

The recipe arm gets its ceiling from the registry. On the inline arm **you
declare it**, and the server derives the step timeout from that same number:

> `stepTimeoutSeconds = maxBuzz`

One number, both roles. That is not an implementation detail — it is what makes
the ceiling *physically* enforceable instead of merely asserted: there is only
one value, so the job cannot outrun the budget it was reserved against.

The consequence is the thing to internalise:

::: danger Setting `maxBuzz` low to be thrifty does not buy a cheap generation
It buys a job that is **killed** after that many seconds and comes back
`expired`, with nothing to show for it and no obvious explanation. `maxBuzz: 10`
is a 10-second timeout.
:::

You are billed the **real** cost either way — post-paid against measured GPU
seconds, settling to actual and refunding the unused remainder of the ceiling.
**Headroom is free.** Size `maxBuzz` from the wall-clock time your graph needs,
not from what you hope to pay. It must be an integer in **1 – 250**, and the host
still requires `maxBuzz ≤ token.buzzBudget`; over-budget comes back as a failed
snapshot naming both numbers.

For the same reason, `estimate()` on an inline body simply **echoes your
`maxBuzz` back** as `cost.total`. The orchestrator forwards the graph opaquely
and cannot price it, so that number is an **upper bound, not a quote** — surface
it as "up to N Buzz", not as a price.

## Try it locally

The `civitai` CLI's generation scaffold (`civitai app create`, the page-app
template that wires up Buzz + generation) ships a **Comfy on Civitai sample** — a
ready-made `src/comfy.ts` with body builders for **both arms**:
`buildComfyBody` for a `starter-comfy-txt2img` recipe body, and
`buildInlineComfyBody` for a complete inline SDXL graph like the one above. Both
are unit-tested, including the AIR-containment rule.

The **mock host** in `npm run dev:harness` implements the `customComfy` message
handlers, so the **recipe** sample runs **with no backend** — you can wire up the
body, click generate, and see the mocked estimate/submit/poll round-trip locally
before you ever have beta access:

```bash
civitai app create my-app     # generation template ships src/comfy.ts
cd my-app && npm install
npm run dev:harness           # mock host — recipe sample runs, no backend
npm test                      # exercises BOTH body builders
```

The inline builder is not on the scaffold's mode toggle yet: the mock host in the
pinned `@civitai/blocks-react` reads `body.params.accountType` unconditionally
and an inline body has no `params`, so driving it through the harness throws.
That is a mock-host bug being fixed, and it does **not** affect live
civitai.com — the scaffold's README tracks the state and spells out the wiring.

Real generation needs closed-beta access (plus an app-developer account for the
inline arm) and `npm run dev:live` / a submitted app; see the
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

They're different products with different auth models. If you're building an App
Block, you want customComfy recipes; if you're calling the orchestration API
directly, you want [Orchestration recipes](/orchestration/recipes/).

## Next

- [Quickstart](./quickstart) — scaffold, run the harness, submit for review.
- [Concepts](./concepts) — the block / trust-frame / bridge model.
- [Scopes reference](../reference/scopes) — `ai:write:budgeted` and the full scope set.
- [Manifest reference](../reference/manifest) — `page.buzzBudgetPerGen` and every manifest field.
