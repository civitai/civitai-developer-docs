---
title: Multi-step workflows (kind 'workflow')
description: Chain up to eight orchestrator steps in one App Blocks generation, where a later step reads an earlier step's result. References, repeat, merge, the limits, how the price and the author fee work, every refusal code, the per-step result, partial failure, and testing it with the mock host.
sources:
  - npm:@civitai/app-sdk@0.68.0/blocks#WorkflowBodyWorkflow
  - npm:@civitai/blocks-react@0.72.2#useBuzzWorkflow
  - npm:@civitai/sdk@0.12.0/dist/workflows/index.d.ts
  - npm:@civitai/sdk@0.12.0#README
  - civitai:src/server/schema/blocks/workflow.schema.ts#blockMultiStepWorkflowBodySchema
  - civitai:src/server/services/blocks/workflow-graph.ts#resolveBlockWorkflowGraph
  - civitai:src/server/routers/blocks.router.ts#submitMultiStepWorkflow
  - civitai:src/server/services/blocks/workflow.service.ts#snapshotFromWorkflow
---

# Multi-step workflows (`kind: 'workflow'`)

A `kind: 'workflow'` body sends **several orchestrator steps as one
generation**, and a later step can read an earlier step's result: draft a story
outline and then write the story from it, generate an image and then remove its
background, write one caption per item of a list. The host checks the whole graph,
prices it once, reserves Buzz once, and returns one workflow you watch like any
other.

On React it goes through the hooks you already use:
[`useBuzzWorkflow()`](../reference/hooks#hook-useBuzzWorkflow)'s `estimate`,
`submit`, `watch`, `poll` and `cancel`, a
[`useBatchEstimate()`](../reference/hooks#hook-useBatchEstimate) cell, and
[`useWorkflowBatch()`](../reference/hooks#hook-useWorkflowBatch). There is no
new hook and no new message. On `@civitai/sdk`, which the default template
uses, it goes through [`app.workflows`](#on-civitai-sdk).

::: warning Closed beta, and it needs a current SDK and host
Like the rest of [generation](./text-to-image), this is **mod-gated** during
the closed beta, **page apps only**, needs the
[`ai:write:budgeted`](../reference/scopes) scope and a **signed-in** viewer.
This page is written against `@civitai/app-sdk@0.68.0`, whose types
(`WorkflowBodyWorkflow` and friends) include the
[`workflow_quote_*` estimate codes](#refusals), and
`@civitai/blocks-react@0.72.2`, whose mock host can
[simulate an estimate with no quote](#testing-with-the-mock-host). The
`app.workflows` calls are written against `@civitai/sdk@0.12.0`, the first
release that has them. A host that predates the kind refuses the body, so
`estimate()` and `submit()` reject.
:::

::: tip Getting those versions into a scaffolded app
`civitai app create` writes its own `@civitai/*` version ranges, and they can
trail the packages. A caret range on a `0.x` version never moves to the next
minor, so `npm install` and `npm update` alone will not cross one. See what you
have:

```bash
npm ls @civitai/sdk @civitai/app-sdk @civitai/blocks-react
```

On `page-elements`, if `@civitai/sdk` is below `0.12.0` there is no
`app.workflows`; raise it:

```bash
npm install @civitai/sdk@^0.12.0
```

On `page-money`, if `@civitai/app-sdk` is below `0.68.0`, or
`@civitai/blocks-react` below `0.72.2`, raise them together:

```bash
npm install @civitai/app-sdk@^0.68.0 @civitai/blocks-react@^0.72.2
```

Commit `package.json` and the lockfile, then run the project's typecheck and
tests before going on.

The scaffold's `AGENTS.md` says not to hand-edit the `@civitai/*` versions. That
rule is there to keep the packages matched; this is the case where one has to
move, and the commands above move it. Once `npm ls` shows these versions or
later, skip this box.
:::

::: info Which template, and which package
The examples on this page are React: they call `useBuzzWorkflow()` from
`@civitai/blocks-react`, which is what the **`page-money`** template ships
(`civitai app create <name> --template page-money`).

The default template, `page-elements`, is not React. It uses `@civitai/sdk`,
and its calling code is in the next section,
[Calling it from `@civitai/sdk`](#on-civitai-sdk). That template's
`npm run dev:harness` does not answer these calls: its token is not a real one,
so every `app.workflows` call rejects there. To exercise them, run the app
inside the real host with
[`civitai app dev-tunnel`](./local-dev#previewing-inside-the-real-host), which
spends real Buzz; its limits are listed there.

Everything else on this page (the body, the limits, the costs, the refusal
codes, the result) is the same on both; only the calling code differs.
:::

## Calling it from `@civitai/sdk` {#on-civitai-sdk}

From `0.12.0`, `@civitai/sdk` has a client for a block's generation calls:
**`app.workflows`**, with `estimate`, `submit`, `get`, `watch`, `wait`,
`cancel` and `list`. It sends the same body to the same block routes as the
React hook. The body and reply types are exported from `@civitai/sdk` itself,
so on the default template import `WorkflowBody`, `WorkflowBodyWorkflowStep`,
`WorkflowStepRef`, `WithWorkflowStepRefs` and `BlockWorkflowSnapshot` from
`'@civitai/sdk'` where the examples below import them from
`'@civitai/app-sdk/blocks'`.

```ts
import { initialize, type WorkflowBody } from '@civitai/sdk';

const app = await initialize();

// `idempotencyKey` is minted by the caller when the viewer presses the button,
// and kept there: a retry of the same press sends the same key.
async function run(body: WorkflowBody, idempotencyKey: string) {
  // 1. Price it. Nothing is charged or reserved.
  const estimate = await app.workflows.estimate(body);
  if (estimate.status === 'failed') {
    // A refusal RESOLVES: read `errorCode` from the snapshot itself.
    return showMessage(`Cannot price this: ${estimate.errorCode ?? 'refused'}`);
  }
  if (!(await confirmSpend(estimate.cost?.total))) return;

  // 2. Run it.
  const submitted = await app.workflows.submit(body, { idempotencyKey });
  if (submitted.status === 'failed') {
    // The placeholder id 'failed': the host refused this request. A real id:
    // a run was created and came back failed, and Buzz may have been spent.
    return showMessage(
      submitted.workflowId === 'failed'
        ? `Could not start: ${submitted.errorCode ?? 'refused'}`
        : 'This run failed. Check your history before trying again.'
    );
  }

  // 3. Follow it to a final status, whichever it is.
  const done = await app.workflows.wait(submitted.workflowId);
  render(done.steps ?? [], done.imageUrls ?? [], done.textOutputs ?? []);
}
```

Four things differ from the React examples, and the first changes how you read
the rest of this page:

- **A refusal resolves; it does not reject.** Where this page says `estimate()`
  rejects with `WorkflowEstimateError` or `submit()` with `WorkflowSubmitError`,
  that is the React hook. `app.workflows` resolves with the host's `failed`
  snapshot, so check `snapshot.status` and read `snapshot.errorCode`. What
  rejects is an `ApiError` carrying the HTTP status (a `400` is a body or key
  the host cannot parse), a `CivitaiError` for a `2xx` reply with no snapshot,
  or whatever `fetch` threw.
- **`submit` requires an `idempotencyKey`** and refuses to send without one.
  Mint it once when the viewer presses the button (`crypto.randomUUID()` fits),
  keep it until that press has a known outcome, and send the same key on every
  retry.
- **A `submit` that rejects has an unknown outcome**, not a failed one: the run
  may exist. Retry with the same key, or look for the run with
  `app.workflows.list()`; never mint a new key for the same press. The package
  README has the rules, the two body kinds the key does not identify, and a
  worked `catch`, under
  [When a submit rejects](https://github.com/civitai/civitai-app-starters/blob/main/packages/civitai-sdk/README.md#when-a-submit-rejects-the-outcome-is-unknown).
- **The names differ.** The hook's `poll(id)` is `app.workflows.get(id)`.
  `app.workflows.watch(id)` is an async iterator that yields the workflow now
  and each time it changes, and `wait(id)` resolves with its last value, the
  final snapshot. There is no batch call: price each body with `estimate`, and
  watch or cancel each workflow id on its own.

`app.workflows` needs the block token, which is what a block holds unless its
manifest declares `auth: "oauth"`, and the `ai:write:budgeted` scope. See
[Money calls](./sdk#money-calls) for both, and for the consent call that comes
first.

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
| Run the same step over a short list you already have (up to 16 items) as one generation | **`kind: 'workflow'`** with a [`repeat`](#repeat-one-step-per-item). Not yet for image generation: see the [known limitation](#repeat-imagegen-limitation) |
| Run independent generations the viewer tracks one by one, such as a grid of cells | one `submit()` per cell, watched with [`useWorkflowBatch()`](./text-to-image#watch-cancel-grid) |
| Price many independent bodies before the viewer confirms | [`useBatchEstimate()`](../reference/hooks#hook-useBatchEstimate) (a `kind: 'workflow'` body can be one of its cells) |
| Run exactly one orchestrator step type | the single-step [pass-through arm](../reference/generation#what-the-bridge-can-and-cannot-do) (`kind: 'step'` with a `$type`) |

A workflow is **one** generation to the viewer: one estimate, one reservation,
one `workflowId`. Cells of a grid are separate generations: each can be retried,
refused or cancelled on its own. If a failure in one part should not touch the
others, keep them as separate submits.

## The body

```ts
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

A reference stands in for a **plain value** (a string, a number, a URL). A
field that accepts several shapes, such as a chat message's `content` (a string
or an array of parts), rejects a reference in its place: put it one level down,
in a plain field of the shape you mean (see the
[chat example](#example-one-chat-step-feeding-another)). The host does not
catch this; the orchestrator does, so the estimate fails with
[`workflow_quote_rejected`](#refusals), and the submit is not refused by the
host (see [What it costs](#what-it-costs)).

🔴 **References point backwards only.** A step cannot read itself, a later step,
or a step that does not exist. That keeps every workflow free of cycles, and the
host checks it before anything is priced: a reference that breaks the rule is
refused with [`workflow_ref_invalid`](#refusals).

To keep a step's input typed while wiring references into it, use
`WithWorkflowStepRefs<T>` from `@civitai/app-sdk/blocks`, which accepts a
`WorkflowStepRef` wherever `T` has a value:

```ts
import type { WithWorkflowStepRefs } from '@civitai/app-sdk/blocks';

type CutoutInput = { image: string; format?: 'png' | 'webp' };

const input: WithWorkflowStepRefs<CutoutInput> = {
  image: { $ref: 'draw', path: 'output.images[0].url' },
  format: 'png',
};
```

## Example: one chat step feeding another

Step 1 writes an outline; step 2 writes a story from it. The second step's
prompt is the first step's reply, read with a reference.

🔴 **Put a reference in a text part, not in `content` itself.** A chat
message's `content` is either a string or an array of parts, and the
orchestrator does not accept a reference in its place: `content: { $ref, path }`
is rejected as an invalid request. Use the parts form,
`content: [{ type: 'text', text: { $ref, path } }]`, as below. A reference in a
plain string field (such as `text` inside a part) works.

```tsx
import { useState } from 'react';
import { useBuzzWorkflow, WorkflowEstimateError, WorkflowSubmitError } from '@civitai/blocks-react';
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
              // A reference goes in a text PART, never directly in `content`.
              content: [
                { type: 'text', text: 'Write a three-point outline for a very short story about:' },
                { type: 'text', text: { $ref: '$arguments', path: 'topic' } },
              ],
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
              content: [
                { type: 'text', text: 'Write a 150-word story that follows this outline:' },
                { type: 'text', text: { $ref: 'outline', path: 'output.choices[0].message.content' } },
              ],
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
    try {
      const snap = await estimate(outlineThenStory(topic));
      // An estimate, not a maximum: see "What it costs".
      setPrice(snap.cost?.total ?? null);
    } catch (err) {
      // No price quote (a `workflow_quote_*` code) or a refused body: no number to show.
      if (err instanceof WorkflowEstimateError) {
        setPrice(null);
        setMessage(
          err.snapshot.errorCode === 'workflow_quote_unavailable'
            ? 'Could not get a price just now. Try again.'
            : 'This story cannot be priced as written.'
        );
        return;
      }
      throw err;
    }
  }

  async function run() {
    try {
      const submitted = await submit(outlineThenStory(topic));
      if (submitted.status === 'failed') {
        setMessage('This story could not be started.');
        return;
      }
      const done = await watch(submitted.workflowId);
      // Moderated chat text, in step order (a step can contribute more than one).
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
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

const body: WorkflowBody = {
  kind: 'workflow',
  arguments: {
    animals: [{ name: 'a red fox' }, { name: 'a snowy owl' }, { name: 'a lynx' }],
  },
  steps: [
    {
      name: 'captions',
      $type: 'repeat',
      input: {
        for: { $ref: '$arguments', path: 'animals', as: 'animal' },
        template: {
          $type: 'chatCompletion',
          input: {
            model: 'openai/gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Write a one-line photo caption for:' },
                  { type: 'text', text: { $ref: 'animal', path: 'name' } },
                ],
              },
            ],
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
- **What a template may read.** The host checks a template's references like
  any other step's, with the `as` name added as one more source. So a template
  may reference the `as` name, `$arguments`, or a step **earlier** than the
  `repeat`. It cannot read the `repeat` step itself or a later step, and the
  `as` name means nothing outside its own template. That is what the host's
  check accepts; as with any `repeat`, price the body before you build on it.
- **The template's `$type` is held to the same denylist** as a top-level step.
- **A `repeat` needs a price quote.** If the host cannot get one, the workflow
  is refused rather than run at the ceiling; see
  [When a `repeat` cannot be priced](#repeat-unpriced).

Use object items and read a field with `path`, as above
(`{ $ref: 'animal', path: 'name' }`). When a `repeat` is priced, the quote
covers every iteration, because the list is fixed in the body. Whether a
`repeat` can be priced at all depends on the template's step type: a
`chatCompletion` template is priced on civitai.com today, and an `imageGen`
template is not. See the [known limitation](#repeat-imagegen-limitation) below.

Each item becomes its own generated step in the result, named
`<repeat name>.<n>` with `<n>` counting **from 0** in list order: `captions.0`,
`captions.1` and `captions.2` here, listed after the `repeat` step itself.

`repeat` belongs to this kind only. The single-step pass-through arm
(`kind: 'step'` with a `$type`) refuses a `repeat` outright, because it has no
`arguments` for one to iterate.

### Known limitation: a `repeat` of `imageGen` cannot be priced yet {#repeat-imagegen-limitation}

::: danger Refused on civitai.com today
A `repeat` whose template is an **`imageGen`** step is currently refused on
civitai.com, by `estimate()` and by `submit()`, with
[`workflow_repeat_unbounded`](#refusals) and an `error` that currently reads
`… a workflow with a repeat needs a price quote and none could be obtained; try
again`. It is refused however the template is written, including with no
reference in it at all, and despite that "try again", retrying does not
change the answer: the platform cannot price that combination yet. Other step
types may be affected in the same way, so an estimate is the test: it is free,
and a `repeat` that can be priced returns a number.

What does work today:

- a `repeat` with a `chatCompletion` template, as in the example above;
- a single `imageGen` step, and a chain that feeds an `imageGen` step from an
  earlier one (a chat step writing its prompt, for example).

For several images in one generation, write **one `imageGen` step per item**
as explicit steps, up to the [8-step limit](#limits):

```ts
import type { WorkflowBody, WorkflowBodyWorkflowStep } from '@civitai/app-sdk/blocks';

// One explicit step per subject. Keep the list at 8 or fewer.
function portraits(subjects: string[]): WorkflowBody {
  return {
    kind: 'workflow',
    steps: subjects.map(
      (prompt, index): WorkflowBodyWorkflowStep => ({
        name: `portrait-${index}`,
        $type: 'imageGen',
        input: { engine: 'google', model: 'nano-banana-2', prompt },
      })
    ),
  };
}
```

Each explicit step counts toward the 8-step limit and the app velocity limit,
and raises the [ceiling](#what-it-costs) by one per-generation budget. For more
than 8 images, send separate submits and watch them with
[`useWorkflowBatch()`](./text-to-image#watch-cancel-grid).

The [mock host](#testing-with-the-mock-host) does **not** have this limitation:
it prices and runs an `imageGen` `repeat`. Check a `repeat` body against the
real host with [`dev:live`](./local-dev) before you build on it.
:::

## `merge`: combining results

`merge` reads values out of earlier steps and combines them into one result a
later step can reference. Its sources are named in `input.fields`, so the host
checks them like references: every field needs a string `$ref` naming
`$arguments` or an **earlier** step (never a `repeat`'s `as` name) and a
`reduce`.

```ts
import type { WorkflowBodyWorkflowStep } from '@civitai/app-sdk/blocks';

// Added after a `repeat` step named `cutouts` whose children each return an
// image: collect every child's first image.
const gallery: WorkflowBodyWorkflowStep = {
  name: 'gallery',
  $type: 'merge',
  input: {
    onMissing: 'partial',
    fields: {
      urls: {
        $ref: 'cutouts',
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
| Step `name` | `^[a-z][a-z0-9_-]{0,31}$` (or exactly the step's own `$<index>`), unique, not `block-step` | `workflow_ref_invalid`; an empty name or one over 64 characters fails the body schema (rejects, no code) |
| References per body | 64 (each `merge` field and each `repeat` `for` counts) | `workflow_ref_invalid` |
| Nesting depth of a step `input` | 32 levels | `workflow_ref_invalid` |
| `repeat` iterations | 16, nested repeats multiplied | `workflow_repeat_unbounded` |
| `repeat` nesting | 4 deep | `workflow_ref_invalid` |
| `$type` length | 1 to 64 characters | the body schema (rejects, no code) |
| Size of every step `input` plus `arguments` | 262,144 characters of serialized JSON, all together (256 KB for ASCII) | the body schema (rejects, no code) |

Every other generation limit still applies: the
[app velocity and daily spend limits](./text-to-image#limits-table), the
viewer's daily cap and consent budget, and the estimate and poll rate limits.
Two of them count a workflow differently:

- **App velocity counts steps, not submits.** One `kind: 'workflow'` submit uses
  one unit per step, and a `repeat` step one per iteration (nested repeats
  multiplied). A 3-item `repeat` plus a `merge` step uses 4 of the app's
  per-minute allowance.
- **The per-call budget is multiplied by the number of steps.** See below.

## What it costs

**The ceiling.** There is no `maxBuzz`. The host's ceiling for one workflow is
your per-generation budget (`page.buzzBudgetPerGen`, see
[Budget model](./text-to-image#budget-model)) **times the number of steps in
`steps`**. A `repeat` is one step for this purpose, however many times it runs,
so a long `repeat` can quote above the ceiling and be refused with
`insufficient buzz budget`. With a per-generation budget of 50, a body whose
only step is a `repeat` has a ceiling of 50 whether its list holds 2 items or
16, while three explicit steps have a ceiling of 150. The workflow's whole
price, author fee included,
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

**No quote.** The orchestrator may not price a workflow: it can reject the
body as invalid (for example a reference placed where the step's schema does
not accept one), give no usable answer just then, or answer without a price.
The estimate and the submit then behave differently.

- **The estimate fails.** It comes back as a `failed` snapshot with **no
  `cost`**, `{ workflowId: 'failed', status: 'failed', error, errorCode }`,
  where `errorCode` names the cause: `workflow_quote_rejected`,
  `workflow_quote_unavailable` or `workflow_quote_unpriced` (see
  [Refusals](#refusals) for which one a retry can clear).
  `useBuzzWorkflow().estimate` rejects it with `WorkflowEstimateError`, and
  [`useBatchEstimate()`](../reference/hooks#hook-useBatchEstimate) marks that
  body's cell `ok: false`. There is no number to show the viewer.
- **The submit still runs.** The host does not refuse the same body for having
  no quote: it is reserved at the ceiling, with each step's timeout set from
  your per-step budget. So a failed estimate does **not** predict a refused
  submit.

Two kinds of workflow are refused on **both** the estimate and the submit
instead, before anything is reserved, and they keep their own codes rather than
a `workflow_quote_*` one:

- one containing a training step, which is refused without a quote exactly as on
  the single-step arm, with a `training-quote-*` `errorCode`;
- one containing a `repeat` at any depth, refused with
  `workflow_repeat_unbounded` and an `error` that names the cause. The cause can
  be the body itself, in which case retrying never succeeds; see
  [When a `repeat` cannot be priced](#repeat-unpriced).

A host that predates the `workflow_quote_*` codes resolved such an estimate
instead, with the ceiling as its `cost.total`; civitai.com fails it.

**The author fee.** If your app charges one (see
[How an app earns](./earning)), a workflow pays it **once**, not once per step,
computed on the whole workflow's quoted base. The estimate itemises it as
`cost.authorFee`, already inside `cost.total`. The fee charged is never more
than the fee reserved at submit, even when the workflow bills more than its
quote. A workflow that **does not succeed** has its **whole** fee reversed, even
when earlier steps delivered output, once the host sees it end; a reversal is
not applied after that day's fees have settled. A workflow with no quote has no fee.

## Reading the result

The poll, watch and cancel replies of a `kind: 'workflow'` run carry
**`steps`**, one entry per step in the orchestrator's order:

```ts
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
- **Image URLs are signed and expire.** Each URL carries a signature and an
  expiry in its query string (`sig` and `exp`), and the same image can come
  back with a different query string on every poll. Render from the latest
  snapshot, and do not use the whole URL as a cache key or a list `key`: a
  finished image would then be fetched again on each poll. Identify an image by
  its step `name` and its position in that step's `imageUrls`.
- **`steps` is absent** on an estimate (no workflow exists yet), on every other
  `kind`, and from a host that predates it. Don't rely on it in the `submit()`
  reply either; read it from `poll()`, `watch()` or `cancel()` (on
  `app.workflows`: `get()`, `watch()`, `wait()` or `cancel()`).

### Partial failure

🔴 **A `failed` workflow is not an empty one.** If step 3 fails, steps 1 and 2
already ran: they stay **charged**, and their images stay in the result. So a
snapshot with `status: 'failed'` can carry `cost.total > 0` and usable
`imageUrls`. Read `steps` to find which step failed and show the viewer what did
finish. Don't tell them nothing was charged. The author fee is the exception:
it is reversed in full for a workflow that does not succeed (see
[What it costs](#what-it-costs)).

```tsx
import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';

export function StepList({ snap }: { snap: BlockWorkflowSnapshot }) {
  return (
    <ul>
      {(snap.steps ?? []).map((step) => (
        <li key={step.name}>
          {step.name}: {step.status}
          {/* Keyed by position: the URL's signature can change between polls. */}
          {step.imageUrls?.map((url, index) => <img key={index} src={url} alt="" />)}
        </li>
      ))}
    </ul>
  );
}
```

## Refusals

A body the host will not run is refused **before anything is reserved or
charged**, with a machine-readable `errorCode`. (Most codes are decided before
the host even asks for a price; the no-quote cases are decided after it tried.)
The three `workflow_quote_*` codes are different: they are **estimate-only**,
for a body the host would run but could not price, and the submit of that
body is not refused (see [What it costs](#what-it-costs)). `estimate()` rejects with
`WorkflowEstimateError`, `submit()` with `WorkflowSubmitError`, and a batch
estimate returns it as that body's cell. Read it from `err.snapshot.errorCode`,
and keep a default branch: the host may add codes, and `error`'s wording is not
a contract. On [`app.workflows`](#on-civitai-sdk) nothing rejects for a refusal:
the call resolves with the `failed` snapshot, and the code is its `errorCode`.

| `errorCode` | Means | What to do |
|---|---|---|
| `workflow_too_many_steps` | more than 8 steps | Split the job into two workflows, or move repeated work into a `repeat` where its step type [can be priced in one](#repeat-imagegen-limitation) |
| `workflow_step_denied` | a step (or a `repeat` template) names a platform-internal `$type`: the model and image scanners, the moderation classifiers such as `promptModeration`, the hashing and model-ingestion types, a few other platform tools, web scrape and web search, and the retired `textToImage` step type. The match ignores case | Remove or replace that step. These types are reserved for Civitai's own use |
| `workflow_ref_invalid` | a reference or `merge` field names the step itself, a later step, or nothing; a step `name` breaks the rules or repeats; a `repeat` or `merge` is malformed; a `repeat`'s `as` name is also a step name; more than 64 references; or an input nested deeper than 32 levels. `error` names the step by its position, except for the `as`-name clash | Fix the body. Resending it unchanged gives the same answer |
| `workflow_repeat_unbounded` (the loop) | a `repeat` iterates something other than an array in `arguments`, or more than 16 times with nested repeats multiplied. Decided from the body alone, before the host asks for a price | Move the list into `arguments`, or shorten it. Resending it unchanged gives the same answer |
| `workflow_repeat_unbounded` (no price) | the workflow has a `repeat` and the host could not get a price for it. The same code whatever the reason was; the `error` reads `workflow step N: a workflow with a repeat needs a price quote and <cause>` | See [When a `repeat` cannot be priced](#repeat-unpriced). Retrying helps only if the cause was temporary |
| `training-quote-rejected` / `-unavailable` / `-unpriced` | a training step in the workflow could not be priced | As for a [single training step](./text-to-image#refused-submits) |
| `workflow_quote_rejected` (estimate only) | the orchestrator refused the body, so there is no price | Fix the body; retrying the same body will not help. Check where each reference sits first |
| `workflow_quote_unavailable` (estimate only) | no usable answer just then (an outage, a timeout, a rate limit) | Estimate again after a short wait. The only `workflow_quote_*` code a retry can clear |
| `workflow_quote_unpriced` (estimate only) | the orchestrator answered without a price | Retrying the same body is not expected to help |

None of the `workflow_quote_*` codes is a submit refusal: `submit()` of the
same body still runs, reserved at the ceiling. A `repeat` or a training step
without a price is the exception, and it is refused on both with the codes
above it in the table.

Other refusals look the same as on every other kind. A price over the
ceiling, a daily cap, the consent budget or the app velocity limit makes
`submit()` **resolve** with `status: 'failed'`, the `'failed'` placeholder
`workflowId` and an `error`, and nothing is charged (see
[refused submits](./text-to-image#refused-submits)). A body the schema rejects
(an unknown key, an empty `steps`, inputs over the size limit) rejects without an
`errorCode`.

### When a `repeat` cannot be priced {#repeat-unpriced}

`workflow_repeat_unbounded` covers two different situations, and the code alone
does not say which.

**What your app can tell apart.** The loop rules are properties of the body you
built, so check them before you send: `for.$ref` is `'$arguments'`, `for.path`
names an array in `arguments`, and the iteration count (nested repeats
multiplied) is 16 or fewer. A body that passes all three and is still refused
with this code was refused for the missing price. Today the `error` text also
differs (the no-price refusal reads `workflow step N: a workflow with a repeat
needs a price quote and <cause>`), but its wording is not a contract.

**What your app cannot reliably tell apart.** A missing price has three possible
causes, and the `errorCode` is the same for all of them:

1. the price could not be fetched just then, which is temporary;
2. the template's `input` is not valid for its `$type`, such as a reference
   placed where that step type does not accept one;
3. the template's step type cannot be priced inside a `repeat` yet, as with
   [`imageGen`](#repeat-imagegen-limitation).

The `<cause>` in `error` is a hint, not a verdict. It is the same three causes
as the [`workflow_quote_*` codes](#refusals): `none could be obtained; try
again` when no usable answer came back, `the orchestrator rejected the request…`
when the body was refused, and `the orchestrator answered without one`. Only the
first one says "try again", but cause 3 can produce it too: an `imageGen`
`repeat` currently reads "try again" and never clears.

Only the first cause is fixed by retrying. In a shipped app, show the viewer that the
job cannot be run right now and let them try again; do not retry in a loop,
since estimates are rate-limited and causes 2 and 3 never clear on their own.

**Finding the cause while you build.** Estimates are free, so narrow it down
with them:

1. **Estimate the same body again** after a short wait. A number means the
   cause was temporary.
2. **Estimate the template as an ordinary step.** Send a `kind: 'workflow'`
   body whose only step is the template's `$type` and `input`, with one item's
   values written in where the template read the `as` name. If that estimate
   fails with [`workflow_quote_rejected`](#refusals), the input is the problem,
   and its `error` may name the reason. Fix the input and repeat this step. If
   it fails with `workflow_quote_unavailable`, wait and estimate it again.
3. **If the step is priced on its own but the `repeat` is still refused**, that
   step type cannot be priced inside a `repeat` yet. Write the items as
   explicit steps instead, as shown under the
   [known limitation](#repeat-imagegen-limitation).

## Testing with the mock host

The mock host (`createMockHost` / `Harness` from `@civitai/blocks-react/testing`,
and `npm run dev:harness` in an app scaffolded from `page-money`) estimates, submits and polls
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
- **`generation.workflowUnpriced`** simulates the host getting no quote, for a
  cause you pick: `'rejected'`, `'unavailable'` or `'unpriced'` (`true` means
  `'unavailable'`). A workflow with a training step or a `repeat` is refused on
  both `estimate()` and `submit()`. Any other fails its `estimate()` with
  `workflow_quote_<cause>` and no `cost`, while its `submit()` is reserved at
  `buzzBudget` × steps with no author fee. The mock has no orchestrator reason
  to pass on, so `'rejected'` always gives the message without a reason.

```ts
import { createMockHost } from '@civitai/blocks-react/testing';

const host = createMockHost({
  consentGranted: true,
  generation: { costPerGen: 10, authorFee: 2, failWorkflowStep: 'story' },
});
```

### What the mock does not do

A body the mock prices and runs can still be refused, or look different, on the
real host. The mock:

- checks where a reference points, not whether its `path` exists;
- never re-prices a step;
- does not expand a `repeat` into `<name>.<n>` children: the `repeat` is one
  entry in `steps`;
- **prices and runs every `repeat`**, including one with an `imageGen`
  template, which the real host
  [currently refuses](#repeat-imagegen-limitation). A `repeat` that works in
  the mock has not been shown to be priceable. To see how your app handles the
  refusal, set `generation.workflowUnpriced: true`;
- **gives every succeeded step that is not suppressed a placeholder image,
  whatever its `$type`**. A `chatCompletion` or `repeat` step therefore has
  `imageUrls` in the mock and none on the real host, so a gallery built from
  the top-level `imageUrls` shows more pictures in the mock than it will in
  production;
- **prices every step the same** when `costPerGen` is a number, so a chat step
  costs as much as an image and the mock total can be well off a real quote.
  Pass a function and branch on the step's `$type` for a closer number;
- produces no chat text (`textOutputs`) and no step `output`;
- returns placeholder URLs that stay the same from poll to poll, where real
  image URLs are [signed and can change](#reading-the-result).

Exercise those against the real host with [`dev:live`](./local-dev).

Since `@civitai/blocks-react` 0.70.0 the mock also refuses estimate, batch
estimate and submit for a token without `ai:write:budgeted`, as the real host
does. A test that is not about consent needs `consentGranted: true` (or
`?consent=granted` on the dev harness URL); see
[Local dev loop](./local-dev#the-mock-host-enforces-the-spend-scope).

## Next

- [Generating images (text-to-image)](./text-to-image): the lifecycle, refused
  submits, and the [limits](./text-to-image#limits) every kind shares.
- [Generation bridge reference](../reference/generation): the generated field
  tables for [`WorkflowBodyWorkflow`](../reference/generation#bridge-WorkflowBodyWorkflow),
  [`WorkflowStepRef`](../reference/generation#bridge-WorkflowStepRef) and
  [`BlockWorkflowSnapshot`](../reference/generation#bridge-BlockWorkflowSnapshot).
- [Orchestration: Workflows](/orchestration/guide/workflows): how the
  orchestrator runs steps, resolves references and reports status, and the
  [step reference](/orchestration/reference/) for each `$type`'s input and
  output.
