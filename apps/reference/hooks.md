---
title: Hooks reference
description: Every @civitai/blocks-react hook, indexed by name and linked to the topic page that documents it — signature, example and README notes, generated from the published package.
sources:
  - npm:@civitai/blocks-react@0.73.0/dist/index.d.ts
  - npm:@civitai/blocks-react@0.73.0#README
  - npm:@civitai/app-sdk@0.71.0/blocks#WorkflowBody
  - civitai:src/server/schema/blocks/workflow.schema.ts#blockInlineComfyBodySchema
---

# React hooks

`@civitai/blocks-react` is the React-first way to build a Civitai App. Most
hooks wrap a slice of the [message bridge](./messages) so you never touch
`postMessage` directly — you call a hook, get typed state back, and the host
brokers the privileged work. A few call a REST route themselves; the **Trust
model** box below names them.

The signatures on the hook pages are generated from the published package's type
definitions; the examples, and everything each README section says after its
example, come from its README.

::: info Which transport for what
See [Concepts → Transport models](../guide/concepts#transport-models).

Most hooks on this page are bridge hooks, and most of the data they carry also
has a REST route a block can call with the token it already holds. The
[porting guide](../guide/porting#hook-replacements) maps every hook the package
exports to its route, or says why it stays on the bridge.

This page is generated from `@civitai/blocks-react`'s own type definitions and
README, so it describes each hook as the package ships it. That is a property of
the generator, not a recommendation of one transport over the other.
:::

::: tip Trust model
The hooks fall into three classes, and the credential is the boundary in all of
them.

- **Bridge hooks — most of this page.** The hook posts a message; the host
  resolves the viewer from the block token and performs the privileged call on
  Civitai's side of the iframe boundary, re-checking scopes each time.
- **Direct-fetch hooks — `useTip`, `useTipAllowance`, `useEntitlements`,
  `useGoodPurchase` and `useGenerationResources`.** These are *not*
  host-mediated. The hook calls `fetch()` on a `/api/v1/blocks/*` route at the
  validated host origin, sending the block token your block holds as a bearer.
  The server verifies that token on every request and, where the route declares
  one, checks its required scope (`social:tip:self` for the two tip hooks,
  `goods:purchase:self` and `goods:read:self` for the goods hooks;
  `generation-resources` takes any valid block token). An expired token is a
  401 here, and a mock host that only answers messages never sees these calls.
- **Local hooks.** A few read state the block already has or work entirely
  inside the frame, and call nothing on Civitai.

Calling a block route yourself has the same trust model as the direct-fetch
hooks: your block holds a short-lived scoped credential, and the server
re-checks it and its scopes on every request.
:::

::: warning Not every capability is a hook: generation has five body `kind`s
A search of this page for a hook name will not find everything the platform can
generate. One hook, `useBuzzWorkflow`, takes every kind of generation body, and
**what** it generates is chosen by the `kind` of the body you pass it, not by a
separate hook. [Its entry](./hooks/generation#hook-useBuzzWorkflow) is generated from the package README, whose
example sends only `kind: 'textToImage'`. The five kinds:

| Body `kind` | What it runs | Read |
|---|---|---|
| `'textToImage'` | An image from a prompt, with LoRAs and source images | [Generating images](../guide/text-to-image) |
| `'customComfy'` | A ComfyUI workflow: a registered recipe, or your own graph | [Comfy on Civitai](../guide/comfy-cloud) |
| `'step'` | One orchestrator step: a registered step id, or any step `$type` passed through | [What the bridge can and cannot do](./generation#what-the-bridge-can-and-cannot-do) |
| `'training'` | A LoRA trained on the viewer's own images | [`WorkflowBodyTraining`](./generation/training-and-multi-step#bridge-WorkflowBodyTraining) |
| `'workflow'` | Up to eight steps as one generation, a later step reading an earlier one's result | [Multi-step workflows](../guide/workflows) |

See [Workflow bodies: the `kind` union](#workflow-bodies-the-kind-union) below
before concluding a capability is missing.
:::

## Hooks by page

The hooks are documented across the pages below, grouped by what they do, so
that each page's `.md` copy stays small enough for an agent's fetch tool to
read whole. Every hook the package exports is listed here by name; a hook you
cannot find in this index is not in the pinned package.

<ReferenceIndex kind="hooks">
<!-- BEGIN GENERATED: hooks-index — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

47 hooks across 6 pages. Each link goes to the page that documents the hook; fetch that page's `.md` for the full entry.

**[Context, frame and analytics hooks](./hooks/context)** — The host handshake, theme, sizing, the block token and settings, direct-load and nested documents, and analytics.

- [`useBlockContext`](./hooks/context#hook-useBlockContext)
- [`useBlockTheme`](./hooks/context#hook-useBlockTheme)
- [`useBlockResize`](./hooks/context#hook-useBlockResize)
- [`useBlockBreakpoint`](./hooks/context#hook-useBlockBreakpoint)
- [`useBlockToken`](./hooks/context#hook-useBlockToken)
- [`useHostOrigin`](./hooks/context#hook-useHostOrigin)
- [`useBlockSettings`](./hooks/context#hook-useBlockSettings)
- [`useBlockAnalytics`](./hooks/context#hook-useBlockAnalytics)
- [`useDirectLoad`](./hooks/context#hook-useDirectLoad)
- [`useNestedDocument`](./hooks/context#hook-useNestedDocument)

**[Generation hooks](./hooks/generation)** — `useBuzzWorkflow` and the hooks that list, publish and resource a generation.

- [`useBuzzWorkflow`](./hooks/generation#hook-useBuzzWorkflow)
- [`useAppWorkflows`](./hooks/generation#hook-useAppWorkflows)
- [`useGenerationResources`](./hooks/generation#hook-useGenerationResources)
- [`usePublishGenerationOutputs`](./hooks/generation#hook-usePublishGenerationOutputs)

**[Batch, confirmed-step and training hooks](./hooks/batches-and-training)** — Estimating and running batches, running one job above the per-call budget, and LoRA training.

- [`useBatchEstimate`](./hooks/batches-and-training#hook-useBatchEstimate)
- [`useWorkflowBatch`](./hooks/batches-and-training#hook-useWorkflowBatch)
- [`usePrepareTrainingDataset`](./hooks/batches-and-training#hook-usePrepareTrainingDataset)
- [`useRunConfirmedStep`](./hooks/batches-and-training#hook-useRunConfirmedStep)
- [`useRunTraining`](./hooks/batches-and-training#hook-useRunTraining)

**[Buzz, purchase and tip hooks](./hooks/buzz-and-purchases)** — Buzz balance and transactions, Buzz and goods purchases, entitlements, compensation and tips.

- [`useBuzzPurchase`](./hooks/buzz-and-purchases#hook-useBuzzPurchase)
- [`useGoodPurchase`](./hooks/buzz-and-purchases#hook-useGoodPurchase)
- [`useEntitlements`](./hooks/buzz-and-purchases#hook-useEntitlements)
- [`useBuzzBalance`](./hooks/buzz-and-purchases#hook-useBuzzBalance)
- [`useBuzzTransactions`](./hooks/buzz-and-purchases#hook-useBuzzTransactions)
- [`useBuzzAccounts`](./hooks/buzz-and-purchases#hook-useBuzzAccounts)
- [`useDailyCompensation`](./hooks/buzz-and-purchases#hook-useDailyCompensation)
- [`useTip`](./hooks/buzz-and-purchases#hook-useTip)
- [`useTipAllowance`](./hooks/buzz-and-purchases#hook-useTipAllowance)

**[Viewer, consent and navigation hooks](./hooks/viewer-and-navigation)** — The viewer, sign-in and consent prompts, maturity and gated images, following collections, and navigating the host.

- [`useViewer`](./hooks/viewer-and-navigation#hook-useViewer)
- [`useCollectionFollow`](./hooks/viewer-and-navigation#hook-useCollectionFollow)
- [`useCivitaiNavigate`](./hooks/viewer-and-navigation#hook-useCivitaiNavigate)
- [`useCivitaiRoute`](./hooks/viewer-and-navigation#hook-useCivitaiRoute)
- [`useRequestSignIn`](./hooks/viewer-and-navigation#hook-useRequestSignIn)
- [`useRequestConsent`](./hooks/viewer-and-navigation#hook-useRequestConsent)
- [`useConsentUnavailable`](./hooks/viewer-and-navigation#hook-useConsentUnavailable)
- [`useDomainMaturity`](./hooks/viewer-and-navigation#hook-useDomainMaturity)
- [`useGatedImages`](./hooks/viewer-and-navigation#hook-useGatedImages)

**[Storage, picker and media hooks](./hooks/storage-and-media)** — Per-app and shared storage, wildcard packs, checkpoint, resource and image pickers, uploading and saving images, and creating posts.

- [`useWildcardPack`](./hooks/storage-and-media#hook-useWildcardPack)
- [`useCreatePostFromApp`](./hooks/storage-and-media#hook-useCreatePostFromApp)
- [`useAppStorage`](./hooks/storage-and-media#hook-useAppStorage)
- [`useSharedStorage`](./hooks/storage-and-media#hook-useSharedStorage)
- [`useCheckpointPicker`](./hooks/storage-and-media#hook-useCheckpointPicker)
- [`useResourcePicker`](./hooks/storage-and-media#hook-useResourcePicker)
- [`useImageUpload`](./hooks/storage-and-media#hook-useImageUpload)
- [`useUploadImageBytes`](./hooks/storage-and-media#hook-useUploadImageBytes)
- [`useImagePicker`](./hooks/storage-and-media#hook-useImagePicker)
- [`useSaveImage`](./hooks/storage-and-media#hook-useSaveImage)

<!-- END GENERATED: hooks-index -->
</ReferenceIndex>

## Workflow bodies: the `kind` union

`estimate()` and `submit()` both take a full `WorkflowBody` — a discriminated
union keyed by `kind`. The hook forwards the body to the host verbatim and never
reads member-specific fields, so every member except `training` flows through the
same `estimate → submit → watch` lifecycle
[`useBuzzWorkflow`](./hooks/generation#hook-useBuzzWorkflow) documents. `training` is quoted with
`estimate()` but run with `useRunTraining()`, and `submit()` refuses it.

As of the pinned `@civitai/app-sdk@0.71.0` the union has five `kind` values, and
`kind: 'step'` is itself two arms — six members in all:

| `kind` | what it runs | what your block sends |
|---|---|---|
| `textToImage` | a Civitai **checkpoint** (plus optional LoRAs / img2img) | `modelId` + `modelVersionId` + `params` |
| `customComfy` | a **ComfyUI workflow** — a server-registered recipe, **or your own graph** | a registered `recipe` id, or `mode: 'inline'` plus the graph itself |
| `step` (`step` present) | a **server-registered orchestrator step** (`convert-image`, `chat-completion`) | a registered `step` id + bounded `params` |
| `step` (`step` omitted) | an orchestrator step type **named directly**, `input` forwarded unmodified | a `$type` + `input` + a `maxBuzz` amount — a reservation, **not** a spend ceiling |
| `training` | an ai-toolkit **LoRA training** run on a dataset of the viewer's own images | a `datasetId` from `usePrepareTrainingDataset()` + a base-model key + `params`; the `quoteId` from the estimate on the run |
| `workflow` | **up to 8 orchestrator steps as one generation**, a later step reading an earlier one's result | `steps` (each a `$type` + `input`, where any value may be a `{ $ref, path }` reference) + optional `arguments`; no `maxBuzz`. See [Multi-step workflows](../guide/workflows) |

`training` is a page-app flow behind a host flag that ships off; its availability,
money rules and the three hooks it uses are under
[`usePrepareTrainingDataset`](./hooks/batches-and-training#hook-usePrepareTrainingDataset).

Narrow on `body.kind` before touching member-specific fields — and note that
`kind === 'step'` alone leaves both step arms in play, so narrow further on
whether `step` is present. The full field tables are in the
[generation bridge reference](./generation#what-the-bridge-can-and-cannot-do).

### `kind: 'customComfy'` — ComfyUI from a block

`customComfy` has **two arms**, selected by `mode`. This is the member most often
missed, because the generated `useBuzzWorkflow` example never shows it.

**Recipe arm** — `mode` omitted (or `'recipe'`). Your block names a
server-registered, code-reviewed workflow and passes bounded params; the server
owns the graph:

```ts
import type { WorkflowBodyCustomComfyRecipe } from '@civitai/app-sdk/blocks';

const body: WorkflowBodyCustomComfyRecipe = {
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
import type { WorkflowBodyCustomComfyInline } from '@civitai/app-sdk/blocks';

const body: WorkflowBodyCustomComfyInline = {
  kind: 'customComfy',
  mode: 'inline', // REQUIRED, and exactly this value — see below
  workflow: {
    // the ComfyUI `/prompt` graph, keyed by node id — the shape
    // ComfyUI's "Save (API Format)" export produces
    '3': { class_type: 'KSampler', inputs: { seed: 42, steps: 20 } },
  },
  resources: ['urn:air:sdxl:checkpoint:civitai:101055@128078'],
  maxBuzz: 50, // integer 1…250, and ALSO the step timeout in seconds
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

::: tip The published SDK types BOTH arms
`WorkflowBodyCustomComfy` is itself a union on `mode`, and both arms are
importable from `@civitai/app-sdk/blocks`: `WorkflowBodyCustomComfyRecipe` and
`WorkflowBodyCustomComfyInline` (plus `InlineComfyNode` for the graph nodes).
Import them rather than declaring the inline shape locally — a hand-declared
copy will drift from the SDK.

**Annotate the ARM, not the union**, as both examples above do. When the `mode`
discriminant is **omitted** — which is the shape this page recommends —
TypeScript's excess-property check runs against the whole union and accepts any
key belonging to *any* constituent, so a body annotated
`WorkflowBodyCustomComfy` silently tolerates a `workflow` key on a recipe body
and you find out at submit, server-side. (Spelling `mode` out explicitly narrows
the union to one constituent and *does* restore the error — but then you are
carrying a field the recommended shape leaves off.) Annotating
`WorkflowBodyCustomComfyRecipe` (or `…Inline`) makes it a compile error either
way. Use the union only where a value genuinely holds either arm.

Still narrow on the **value** of `body.mode === 'inline'`, never on whether the
key is present: `mode` is optional on the recipe arm, so a body that merely
carries a `workflow` key routes to the recipe arm and is rejected for a missing
`recipe`.
:::

Both arms are **mod-gated** and **page-token-only** — a model-bound token is
rejected before either arm is inspected. For the graph rules, the entitlement
and moderation gates, the budget model, and a runnable local example, read
**[Comfy on Civitai (`customComfy`)](../guide/comfy-cloud)** — this section is a
pointer, not a replacement.

## Install

```bash
pnpm add @civitai/blocks-react @civitai/app-sdk
```

See the [Quickstart](../guide/quickstart) for a full scaffold, and the
[message bridge reference](./messages) for the protocol these hooks sit on.
