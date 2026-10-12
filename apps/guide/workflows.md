---
title: Multi-step workflows (kind 'workflow')
description: Chain up to eight orchestrator steps in one App Blocks generation, where a later step reads an earlier step's result. References, repeat, merge, the limits, how the price and the author fee work, every refusal code, the per-step result, partial failure, and testing it with the mock host.
sources:
  - civitai-app-starters:packages/civitai-app-sdk/src/blocks/types.ts#WorkflowBodyWorkflow
  - civitai-app-starters:packages/civitai-blocks-react/src/internal/mockHost.ts#failWorkflowStep
  - civitai:src/server/schema/blocks/workflow.schema.ts#blockMultiStepWorkflowBodySchema
  - civitai:src/server/services/blocks/workflow-graph.ts#resolveBlockWorkflowGraph
  - civitai:src/server/routers/blocks.router.ts#submitMultiStepWorkflow
  - civitai:src/server/services/blocks/workflow.service.ts#snapshotFromWorkflow
---

# Multi-step workflows (`kind: 'workflow'`)

A `kind: 'workflow'` body sends **several orchestrator steps as one
generation**, and a later step can read an earlier step's result: draft a story
outline and then write the story from it, generate an image and then remove its
background, render one prompt per subject. The host checks the whole graph,
prices it once, reserves Buzz once, and returns one workflow you watch like any
other.

It goes through the hooks you already use:
[`useBuzzWorkflow()`](../reference/hooks#hook-useBuzzWorkflow)'s `estimate`,
`submit`, `watch`, `poll` and `cancel`, a
[`useBatchEstimate()`](../reference/hooks#hook-useBatchEstimate) cell, and
[`useWorkflowBatch()`](../reference/hooks#hook-useWorkflowBatch). There is no
new hook and no new message.

::: warning Closed beta, and it needs a current SDK and host
Like the rest of [generation](./text-to-image), this is **mod-gated** during
the closed beta, **page apps only**, needs the
[`ai:write:budgeted`](../reference/scopes) scope and a **signed-in** viewer.
The types (`WorkflowBodyWorkflow` and friends) and the mock-host support ship
in the **next** `@civitai/app-sdk` and `@civitai/blocks-react` releases, after
the 0.65 and 0.70 lines; until those publish, the examples on this page do not
compile against the SDK. A host that predates the kind refuses the body, so
`estimate()` and `submit()` reject.
:::

::: info Not the same thing as calling the orchestrator yourself
An App Block never holds an orchestrator token. This page is about the bridge
body a block sends through the host, which adds a step-type denylist, a
reference check, spend caps and an author fee on top of the orchestrator's own
workflow. If you are building a backend that calls the orchestrator directly
with your own token, read the orchestration guide's
[Workflows](/orchestration/guide/workflows) page instead. It is also the
reference for what each step type takes and returns, and for how references,
`format` and `arguments` resolve.
:::

## When to use it

| You want to… | Use |
|---|---|
| Feed one step's output into another step (text into a prompt, an image into an edit) | **`kind: 'workflow'`** |
| Run the same step over a short list you already have (up to 16 items) as one generation | **`kind: 'workflow'`** with a [`repeat`](#repeat-one-step-per-item) |
| Run independent generations the viewer tracks one by one, such as a grid of cells | one `submit()` per cell, watched with [`useWorkflowBatch()`](./text-to-image#watch-cancel-grid) |
| Price many independent bodies before the viewer confirms | [`useBatchEstimate()`](../reference/hooks#hook-useBatchEstimate) (a `kind: 'workflow'` body can be one of its cells) |
| Run exactly one orchestrator step type | the single-step [pass-through arm](../reference/generation#what-the-bridge-can-and-cannot-do) (`kind: 'step'` with a `$type`) |

A workflow is **one** generation to the viewer: one estimate, one charge, one
`workflowId`. Cells of a grid are separate generations: each can be retried,
refused or cancelled on its own. If a failure in one part should not touch the
others, keep them as separate submits.

## The body

```ts
// @ts-skip-snippet: needs the @civitai/app-sdk release that adds kind 'workflow'
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

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
        prompt: { $ref: '$arguments', path: 'prompt' },
      },
      // An intermediate result: run and charged, but its image is not returned.
      suppressOutput: true,
    },
    {
      name: 'cutout',
      $type: 'imageBackgroundRemoval',
      input: { image: { $ref: 'draw', path: 'output.images[0].url' } },
    },
  ],
};
```

- **`steps`**: 1 to 8 (`BLOCK_WORKFLOW_MAX_STEPS`), run as one orchestrator
  workflow. Each step is `{ name?, $type, input, suppressOutput? }`.
- **`$type`** is the orchestrator's own step type, 1 to 64 characters. The
  host forwards `input` unmodified, so the orchestrator's schema for that
  `$type` decides what `input` may hold. Any `$type` is accepted except the
  platform-internal ones (see [`workflow_step_denied`](#refusals)).
- **`name`** is optional. It must match `^[a-z][a-z0-9_-]{0,31}$` (a lowercase
  letter, then up to 31 lowercase letters, digits, `_` or `-`), be unique in the
  body, and not be `block-step`, which is reserved. A step you do not name is
  named by its position: `$0`, `$1`, and so on.
- **`arguments`** is an optional object the steps can read. Put a value
  several steps share there, and the list a [`repeat`](#repeat-one-step-per-item)
  iterates.
- **`suppressOutput: true`** marks an intermediate step: its images are left out
  of the result. It still runs and is still charged.
- There is **no `maxBuzz`**. The spend ceiling is derived for you; see
  [What it costs](#what-it-costs).
- The schema is strict: an unknown key on the body or on a step is rejected,
  not dropped.

## References: reading an earlier result

Anywhere a value would go in a step's `input`, at any depth, you can put a
**reference** instead:

```ts
// @ts-skip-snippet: needs the @civitai/app-sdk release that adds kind 'workflow'
import type { WorkflowStepRef } from '@civitai/app-sdk/blocks';

const image: WorkflowStepRef = { $ref: 'draw', path: 'output.images[0].url' };
```

The orchestrator replaces it with the value at `path` once the source is ready,
and the step waits for its source to finish. The fields:

- **`$ref`** names the source. It is one of:
  - `'$arguments'`, the body's own `arguments`;
  - the `name` of an **earlier** step;
  - `'$<index>'`, an earlier step you did not name, by its zero-based position
    (`'$0'` is the first step). A named step is referenced by its name only.
- **`path`** selects the value inside that source: `'prompt'` in `arguments`,
  `'output.images[0].url'` or `'output.choices[0].message.content'` in a step.
  The host does not check that the path exists; the orchestrator resolves it,
  and a path that resolves to nothing uses `default`.
- **`default`** (optional) is used when `path` resolves to nothing.
- **`format`** (optional) puts the value inside a longer string, at `{0}`. The
  orchestration guide covers
  [the rules for `format`](/orchestration/guide/workflows#inserting-a-reference-into-text).

An object counts as a reference only when it has **both** `$ref` and `path` and
no other key except `default` and `format`. Anything else is ordinary input.

🔴 **References point backwards only.** A step cannot read itself, a later step,
or a step that does not exist. That keeps every workflow free of cycles, and the
host checks it before anything is priced: a reference that breaks the rule is
refused with [`workflow_ref_invalid`](#refusals).

To keep a step's input typed while wiring references into it, use
`WithWorkflowStepRefs<T>` from `@civitai/app-sdk/blocks`, which accepts a
`WorkflowStepRef` wherever `T` has a value:

```ts
// @ts-skip-snippet: needs the @civitai/app-sdk release that adds kind 'workflow'
import type { WithWorkflowStepRefs } from '@civitai/app-sdk/blocks';

type CutoutInput = { image: string; format?: 'png' | 'webp' };

const input: WithWorkflowStepRefs<CutoutInput> = {
  image: { $ref: 'draw', path: 'output.images[0].url' },
  format: 'png',
};
```

## Example: one chat step feeding another

Step 1 writes an outline; step 2 writes a story from it. The second step's
prompt is the first step's reply, placed into a sentence with `format`.

```tsx
// @ts-skip-snippet: needs the @civitai/app-sdk release that adds kind 'workflow'
import { useState } from 'react';
import { useBuzzWorkflow, WorkflowSubmitError } from '@civitai/blocks-react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

const MODEL = 'openai/gpt-4o-mini';

function outlineThenStory(topic: string): WorkflowBody {
  return {
    kind: 'workflow',
    arguments: { topic },
    steps: [
      {
        name: 'outline',
        $type: 'chatCompletion',
        input: {
          model: MODEL,
          messages: [
            {
              role: 'user',
              content: {
                $ref: '$arguments',
                path: 'topic',
                format: 'Write a three-point outline for a very short story about {0}.',
              },
            },
          ],
        },
      },
      {
        name: 'story',
        $type: 'chatCompletion',
        input: {
          model: MODEL,
          messages: [
            {
              role: 'user',
              content: {
                $ref: 'outline',
                path: 'output.choices[0].message.content',
                format: 'Write a 150-word story that follows this outline: {0}',
              },
            },
          ],
        },
      },
    ],
  };
}

export function StoryWriter({ topic }: { topic: string }) {
  const { estimate, submit, watch } = useBuzzWorkflow();
  const [price, setPrice] = useState<number | null>(null);
  const [texts, setTexts] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  async function quote() {
    const snap = await estimate(outlineThenStory(topic));
    // An estimate, not a maximum: see "What it costs".
    setPrice(snap.cost?.total ?? null);
  }

  async function run() {
    try {
      const submitted = await submit(outlineThenStory(topic));
      if (submitted.status === 'failed') {
        setMessage('This story could not be started.');
        return;
      }
      const done = await watch(submitted.workflowId);
      // Moderated chat text, one entry per chat reply, in step order.
      setTexts(done.textOutputs ?? []);
      if (done.status !== 'succeeded') setMessage('The story did not finish.');
    } catch (err) {
      if (err instanceof WorkflowSubmitError && err.snapshot.errorCode) {
        setMessage(`Refused: ${err.snapshot.errorCode}`);
        return;
      }
      throw err;
    }
  }

  return (
    <div>
      <button onClick={() => void quote()}>Price it</button>
      {price !== null && <p>About {price} Buzz</p>}
      <button onClick={() => void run()}>Write the story</button>
      {texts.map((t, i) => (
        <p key={i}>{t}</p>
      ))}
      {message && <p>{message}</p>}
    </div>
  );
}
```

**Where the text comes back.** `chatCompletion` is a step type the host
moderates, so its reply arrives on the snapshot's **`textOutputs`** (text that
passed the output scan) or, if the scan held it back, as
**`textOutputWithheld.reason`**. Its entry in [`steps`](#reading-the-result)
reports its `status` but carries **no `output`**. Read text from
`textOutputs`, on the `poll()`, `watch()` or `cancel()` result, never the
`submit()` reply.

## `repeat`: one step per item

`repeat` runs a template step once for each item of an array in the body's
`arguments`. Inside the template, the `as` name is a source a reference can
read.

```ts
// @ts-skip-snippet: needs the @civitai/app-sdk release that adds kind 'workflow'
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

const body: WorkflowBody = {
  kind: 'workflow',
  arguments: {
    subjects: [{ prompt: 'a red fox' }, { prompt: 'a snowy owl' }, { prompt: 'a lynx' }],
  },
  steps: [
    {
      name: 'portraits',
      $type: 'repeat',
      input: {
        for: { $ref: '$arguments', path: 'subjects', as: 'subject' },
        template: {
          $type: 'imageGen',
          input: {
            engine: 'google',
            model: 'nano-banana-2',
            prompt: { $ref: 'subject', path: 'prompt' },
          },
        },
      },
    },
  ],
};
```

The rules, all checked by the host before anything is priced:

- **The input is exactly** `{ for: { $ref, path, as }, template: { $type, name?, input? } }`,
  with every key spelled exactly. A template carries only what a top-level step
  may. A different shape is refused with `workflow_ref_invalid`.
- **`for.$ref` must be `'$arguments'`** and `for.path` must name an **array**
  in `arguments`. A `repeat` over another step's output is refused, because its
  length is unknown until that step has run, so the workflow could not be
  priced up front. Put the list in `arguments` instead.
- **At most 16 iterations** (`BLOCK_WORKFLOW_REPEAT_MAX_ITERATIONS`), with
  nested repeats **multiplied**: a 4-item `repeat` inside a 4-item `repeat` is
  16. Repeats nest at most 4 deep.
- **The `as` name** may not also be a step name or `$arguments`.
- **The template's `$type` is held to the same denylist** as a top-level step.
- **A `repeat` needs a price quote.** If the host cannot get one, the workflow
  is refused rather than run at the ceiling; see
  [`workflow_repeat_unbounded`](#refusals).

Each item becomes its own generated step in the result, named
`<repeat name>.<n>` (`portraits.<n>` here), after the `repeat` step itself.

`repeat` belongs to this kind only. The single-step pass-through arm
(`kind: 'step'` with a `$type`) refuses a `repeat` outright, because it has no
`arguments` for one to iterate.

## `merge`: combining results

`merge` reads values out of earlier steps and combines them into one result a
later step can reference. Its sources are named in `input.fields`, so the host
checks them like references: every field needs a string `$ref` naming
`$arguments` or an **earlier** step (never a `repeat`'s `as` name) and a
`reduce`.

```ts
// @ts-skip-snippet: needs the @civitai/app-sdk release that adds kind 'workflow'
import type { WorkflowBodyWorkflowStep } from '@civitai/app-sdk/blocks';

// Added after the `portraits` repeat above: collect every child's first image.
const gallery: WorkflowBodyWorkflowStep = {
  name: 'gallery',
  $type: 'merge',
  input: {
    onMissing: 'partial',
    fields: {
      urls: {
        $ref: 'portraits',
        path: 'output.steps[*].output.images[0].url',
        reduce: 'push',
        includeIndex: false,
      },
    },
  },
};
```

A later step reads the combined value as
`{ $ref: 'gallery', path: 'output.fields.urls' }`. The reducers (`push`,
`first`, `max`, `group` and the rest) and `onMissing` are the orchestrator's;
the `merge` step's schema in the
[orchestration reference](/orchestration/reference/) lists them. Each field
counts toward the 64-reference limit.

## Limits

| Limit | Value | Refused with |
|---|---|---|
| Steps per body | 1 to 8 | `workflow_too_many_steps` (more than 8). An empty `steps` fails the body schema, so the call rejects without a code |
| Step `name` | `^[a-z][a-z0-9_-]{0,31}$`, unique, not `block-step` | `workflow_ref_invalid` |
| References per body | 64 (each `merge` field and each `repeat` `for` counts) | `workflow_ref_invalid` |
| Nesting depth of a step `input` | 32 levels | `workflow_ref_invalid` |
| `repeat` iterations | 16, nested repeats multiplied | `workflow_repeat_unbounded` |
| `repeat` nesting | 4 deep | `workflow_ref_invalid` |
| `$type` length | 1 to 64 characters | the body schema (rejects, no code) |
| Size of every step `input` plus `arguments` | 256 KB (262,144 bytes) serialized, all together | the body schema (rejects, no code) |

Every other generation limit still applies: the
[app velocity and daily spend limits](./text-to-image#limits-table), the
viewer's daily cap and consent budget, and the estimate and poll rate limits.
Two of them count a workflow differently:

- **App velocity counts steps, not submits.** One `kind: 'workflow'` submit uses
  one unit per step, and a `repeat` step one per iteration (nested repeats
  multiplied). The 3-subject `repeat` above plus the `merge` step uses 4 of the
  app's per-minute allowance.
- **The per-call budget is multiplied by the number of steps.** See below.

## What it costs

**The ceiling.** There is no `maxBuzz`. The host's ceiling for one workflow is
your per-generation budget (`page.buzzBudgetPerGen`, see
[Budget model](./text-to-image#budget-model)) **times the number of steps in
`steps`**. A `repeat` is one step for this purpose, however many times it runs,
so a long `repeat` can quote above the ceiling and be refused with
`insufficient buzz budget`. The workflow's whole price, author fee included,
must fit under the ceiling or the submit is refused before anything is charged.

**The reservation.** The host asks the orchestrator for one quote for the whole
workflow and reserves that quote plus the author fee, once, against every
cap. The estimate shows the same number.

🔴 **The estimate of a chained workflow is not a maximum.** When a step's input
references an earlier step, the orchestrator prices that step before the values
it references exist, and prices it again once they do. If the second price is
higher, the viewer is charged the difference. So a workflow can cost more than
its estimate. Show the estimate as an estimate ("about 40 Buzz"), never as "you
will pay at most". The host corrects its spend caps afterwards, but the extra
charge is not bounded by the estimate.

**No quote.** If the orchestrator cannot price the workflow, it still runs,
reserved at the ceiling, with each step's timeout set from your per-step
budget. Two kinds of workflow are refused instead, before anything is reserved:

- one containing a training step, which is refused without a quote exactly as on
  the single-step arm, with a `training-quote-*` `errorCode`;
- one containing a `repeat` at any depth, refused with
  `workflow_repeat_unbounded` and an `error` that says no price quote could be
  obtained. Retrying later may succeed.

**The author fee.** If your app charges one (see
[How an app earns](./earning)), a workflow pays it **once**, not once per step,
computed on the whole workflow's quoted base. The estimate itemises it as
`cost.authorFee`, already inside `cost.total`. The fee charged is never more
than the fee shown, even when the workflow bills more than its quote. A workflow that
**does not succeed** has its **whole** fee reversed, even when earlier steps
delivered output. A workflow with no quote has no fee.

## Reading the result

The poll, watch and cancel replies of a `kind: 'workflow'` run carry
**`steps`**, one entry per step in the orchestrator's order:

```ts
// @ts-skip-snippet: needs the @civitai/app-sdk release that adds kind 'workflow'
type BlockWorkflowStepSnapshot = {
  name: string;          // your name, or `$<index>`; `<repeat name>.<n>` for repeat children
  $type: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired' | 'canceled';
  imageUrls?: string[];  // this step's images; never for a `suppressOutput` step
  output?: unknown;      // the step's raw output, minus its media
  error?: string;        // why it did not succeed, when the orchestrator gave plain text
};
```

- **`imageUrls`** at the top level is the union of every step that did not set
  `suppressOutput`. `status` and `cost` at the top level are the whole
  workflow's.
- **`output`** is the orchestrator's output for that `$type`, with images and
  other media removed (they are on `imageUrls`). It is **not moderated**, and
  its shape is the orchestrator's. It is **absent** for the step types the host
  extracts itself: `imageGen`, `comfy` and `customComfy` report only
  `imageUrls`, and the types Civitai registers (`chatCompletion`,
  `convertImage`) report through their own fields, chat text on `textOutputs`
  (see the [chat example](#example-one-chat-step-feeding-another)). A `repeat`
  step's own entry has none either: its children are listed as steps of their
  own. A `merge`, or any other `$type`, reports its `output` here.
- **`error`** is diagnostic text. Log it; show the viewer your own words.
- **`steps` is absent** on an estimate (no workflow exists yet), on every other
  `kind`, and from a host that predates it. Don't rely on it in the `submit()`
  reply either; read it from `poll()`, `watch()` or `cancel()`.

### Partial failure

🔴 **A `failed` workflow is not an empty one.** If step 3 fails, steps 1 and 2
already ran: they stay **charged**, and their images stay in the result. So a
snapshot with `status: 'failed'` can carry `cost.total > 0` and usable
`imageUrls`. Read `steps` to find which step failed and show the viewer what did
finish. Don't tell them nothing was charged. The author fee is the exception:
it is reversed in full for any workflow that does not succeed.

```tsx
// @ts-skip-snippet: needs the @civitai/app-sdk release that adds kind 'workflow'
import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';

export function StepList({ snap }: { snap: BlockWorkflowSnapshot }) {
  return (
    <ul>
      {(snap.steps ?? []).map((step) => (
        <li key={step.name}>
          {step.name}: {step.status}
          {step.imageUrls?.map((url) => <img key={url} src={url} alt="" />)}
        </li>
      ))}
    </ul>
  );
}
```

## Refusals

A body the host will not run is refused **before anything is priced, reserved
or sent**, with a machine-readable `errorCode`. `estimate()` rejects with
`WorkflowEstimateError`, `submit()` with `WorkflowSubmitError`, and a batch
estimate returns it as that body's cell. Read it from `err.snapshot.errorCode`,
and keep a default branch: the host may add codes, and `error`'s wording is not
a contract.

| `errorCode` | Means | What to do |
|---|---|---|
| `workflow_too_many_steps` | more than 8 steps | Split the job into two workflows, or move repeated work into a `repeat` |
| `workflow_step_denied` | a step (or a `repeat` template) names a platform-internal `$type`: the model and image scanners, the moderation classifiers such as `promptModeration`, the hashing and model-ingestion types, a few other platform tools, web scrape and web search, and the retired `textToImage` step type. The match ignores case | Remove or replace that step. These types are reserved for Civitai's own use |
| `workflow_ref_invalid` | a reference or `merge` field names the step itself, a later step, or nothing; a step `name` breaks the rules or repeats; a `repeat` or `merge` is malformed; a `repeat`'s `as` name is also a step name; more than 64 references; or an input nested deeper than 32 levels. `error` names the step by its position | Fix the body. Resending it unchanged gives the same answer |
| `workflow_repeat_unbounded` | a `repeat` iterates something other than an array in `arguments`, or more than 16 times with nested repeats multiplied; **or** the workflow has a `repeat` and no price quote could be obtained | For the first two, move the list into `arguments` or shorten it. For the missing quote, retry later |
| `training-quote-rejected` / `-unavailable` / `-unpriced` | a training step in the workflow could not be priced | As for a [single training step](./text-to-image#refused-submits) |

Other refusals look the same as on every other kind. A price over the
ceiling, a daily cap, the consent budget or the app velocity limit makes
`submit()` **resolve** with `status: 'failed'`, the `'failed'` placeholder
`workflowId` and an `error`, and nothing is charged (see
[refused submits](./text-to-image#refused-submits)). A body the schema rejects
(an unknown key, an empty `steps`, an input over 256 KB) rejects without an
`errorCode`.

## Testing with the mock host

The mock host (`createMockHost` / `Harness` from `@civitai/blocks-react/testing`,
and `npm run dev:harness` in a scaffolded app) estimates, submits and polls
this kind:

- It **prices each step** with `generation.costPerGen` and adds
  `generation.authorFee` **once**. A function `costPerGen` receives the step as
  its second argument (`MockWorkflowStepInfo`: `index`, `name`, `$type`,
  `input`), and a `repeat` step is priced once per iteration.
- It **refuses** with the same four `workflow_*` codes as the host, in the
  host's order: the step count, then the names and references (including
  `repeat` and `merge`), then the denylist.
- **Polls report `steps`**, finishing them in order, with `suppressOutput`
  honoured. Each succeeded step that is not suppressed gets a placeholder image.
- **`generation.failWorkflowStep: '<name>'`** (`'$<index>'` for an unnamed step)
  fails that step: the steps before it succeed and stay charged, so you can
  render a partial failure.
- **`generation.workflowUnpriced: true`** simulates the host getting no quote:
  a workflow with a training step or a `repeat` is refused, and any other is
  reserved at `buzzBudget` × steps with no author fee.

```ts
// @ts-skip-snippet: needs the @civitai/app-sdk release that adds kind 'workflow'
import { createMockHost } from '@civitai/blocks-react/testing';

const host = createMockHost({
  consentGranted: true,
  generation: { costPerGen: 10, authorFee: 2, failWorkflowStep: 'story' },
});
```

What the mock does **not** do: it checks where a reference points, not whether
its `path` exists; it never re-prices a step; it does not expand a `repeat` into
`<name>.<n>` children; and it produces no chat text (`textOutputs`). Exercise
those against the real host with [`dev:live`](./local-dev).

Since `@civitai/blocks-react` 0.70.0 the mock also refuses estimate, batch
estimate and submit for a token without `ai:write:budgeted`, as the real host
does. A test that is not about consent needs `consentGranted: true` (or
`?consent=granted` on the dev harness URL); see
[Local dev loop](./local-dev#the-mock-host-enforces-the-spend-scope).

## Next

- [Generating images (text-to-image)](./text-to-image): the lifecycle, refused
  submits, and the [limits](./text-to-image#limits) every kind shares.
- [Generation bridge reference](../reference/generation): the generated field
  tables for every `WorkflowBody` member and `BlockWorkflowSnapshot`
  (`WorkflowBodyWorkflow` and `WorkflowStepRef` appear there once this site
  pins the SDK release that adds them).
- [Orchestration: Workflows](/orchestration/guide/workflows): how the
  orchestrator runs steps, resolves references and reports status, and the
  [step reference](/orchestration/reference/) for each `$type`'s input and
  output.
