---
title: Hooks reference
description: Every @civitai/blocks-react hook — signature and example, generated from the published package.
sources:
  - npm:@civitai/blocks-react@0.39.0/dist/index.d.ts
  - npm:@civitai/blocks-react@0.39.0#README
  - npm:@civitai/app-sdk@0.31.0/blocks#WorkflowBody
  - civitai:src/server/schema/blocks/workflow.schema.ts#blockInlineComfyBodySchema
---

# React hooks

`@civitai/blocks-react` is the React-first way to build a Civitai App. Each hook
wraps a slice of the [message bridge](./messages) so you never touch
`postMessage` directly — you call a hook, get typed state back, and the host
brokers the privileged work.

The signatures below are generated from the published package's type
definitions; the examples come from its README.

::: tip Trust model
Every hook that reads private data or submits work is **host-mediated**: the host
resolves the viewer from the block token and performs the privileged call on
Civitai's side of the iframe boundary. Your app never holds a credential or calls
a privileged API directly.
:::

::: warning `useBuzzWorkflow`'s generated example is one `kind` of several
The `useBuzzWorkflow` entry below is generated from the package README, whose
example sends a `kind: 'textToImage'` body. That is **one member** of the
`WorkflowBody` union, not the whole surface — the same hook also submits
ComfyUI workflows (`kind: 'customComfy'`) and registered orchestrator steps
(`kind: 'step'`). See [Workflow bodies: the `kind` union](#workflow-bodies-the-kind-union)
below before concluding a capability is missing.
:::

<HooksReference />

## Workflow bodies: the `kind` union

`estimate()` and `submit()` both take a full `WorkflowBody` — a discriminated
union keyed by `kind`. The hook forwards the body to the host verbatim and never
reads member-specific fields, so every member flows through the same
`estimate → submit → watch` lifecycle shown above.

As of the pinned `@civitai/app-sdk@0.31.0` the union has three members:

| `kind` | what it runs | what your block sends |
|---|---|---|
| `textToImage` | a Civitai **checkpoint** (plus optional LoRAs / img2img) | `modelId` + `modelVersionId` + `params` |
| `customComfy` | a **ComfyUI workflow** — a server-registered recipe, **or your own graph** | a registered `recipe` id, or `mode: 'inline'` plus the graph itself |
| `step` | a **server-registered orchestrator step** (`convert-image`, `chat-completion`) | a registered `step` id + bounded `params` |

Narrow on `body.kind` before touching member-specific fields. The full field
tables for all three are in the
[generation bridge reference](./generation#what-the-bridge-can-and-cannot-do).

### `kind: 'customComfy'` — ComfyUI from a block

`customComfy` has **two arms**, selected by `mode`. This is the member most often
missed, because the generated example above never shows it.

**Recipe arm** — `mode` omitted (or `'recipe'`). Your block names a
server-registered, code-reviewed workflow and passes bounded params; the server
owns the graph:

```ts
import type { WorkflowBodyCustomComfy } from '@civitai/app-sdk/blocks';

const body: WorkflowBodyCustomComfy = {
  kind: 'customComfy',
  recipe: 'starter-comfy-txt2img', // a SERVER-registered id — unknown ids are rejected fail-closed
  params: {
    prompt: 'a serene alpine lake at golden hour',
    // seed?: number | null — omit to let the orchestrator pick
  },
};
```

**Inline arm** — `mode: 'inline'` (required). Your block ships the ComfyUI graph
itself, plus a declared `resources` manifest and a `maxBuzz` ceiling:

```ts
// Declared locally, not imported: the pinned SDK types only the recipe arm.
// This mirrors the server's `blockInlineComfyBodySchema` field-for-field.
type InlineComfyBody = {
  kind: 'customComfy';
  mode: 'inline';
  workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }>;
  resources: string[];
  prompt?: string;
  negativePrompt?: string;
  maxBuzz: number;
};
```

Three things trip up a first attempt, all covered in the guide:

- **`mode: 'inline'` is required.** Including a `workflow` key does not select
  the arm — a body without `mode` routes to the recipe arm and is then rejected
  for a missing `recipe`.
- **`resources` is a declared manifest, not an inference.** Every AIR the graph
  names must also appear in `resources` or the submit is rejected.
- **`maxBuzz` is the only spend knob**, and doubles as the step timeout in
  seconds.

::: warning The published SDK types the recipe arm only
In `@civitai/app-sdk@0.31.0`, `WorkflowBodyCustomComfy` is
`{ kind, recipe, params }` — there is no `mode` field and no inline body type to
import. The server accepts an inline body; the published types have not caught
up. Declare the shape locally, as above, and narrow on the **value** of
`body.mode === 'inline'` rather than on whether the key is present.
:::

The recipe arm is **mod-gated**; the inline arm additionally requires an
**app-developer** account. For the graph rules, the entitlement and moderation
gates, the budget model, and a runnable local example, read
**[Comfy on Civitai (`customComfy`)](../guide/comfy-cloud)** — this section is a
pointer, not a replacement.

## Install

```bash
pnpm add @civitai/blocks-react @civitai/app-sdk
```

See the [Quickstart](../guide/quickstart) for a full scaffold, and the
[message bridge reference](./messages) for the protocol these hooks sit on.
