---
title: "Training and multi-step workflow types"
description: "The training body and its ai-toolkit parameter types, and the multi-step workflow body. Part of the Generation bridge reference."
---

<!-- GENERATED PAGE — do not edit by hand. Written by `npm run gen:appblocks:md` (scripts/appblocks-md.mjs); which entry lives on which page is decided in .vitepress/theme/components/referenceSplit.shared.mjs. -->

# Training and multi-step workflow types

The `training` body and its ai-toolkit parameter types, and the multi-step `workflow` body.

This page documents 11 of the 27 types in the [Generation bridge reference](../generation), which indexes every type by name. Generated from `@civitai/app-sdk@0.80.0` and `@civitai/blocks-react@0.78.1`.

Other pages: [useBuzzWorkflow lifecycle and snapshot types](./lifecycle) · [Workflow body types](./bodies)

<BridgeReference group="training-and-multi-step">
<!-- BEGIN GENERATED: bridge/training-and-multi-step — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`WorkflowBodyTraining`** — object

Train a LoRA with the ai-toolkit engine on images the VIEWER uploaded through the host — the App Blocks `kind: 'training'` workflow body. ## Availability — read before building on it - 🔴 Behind the host flag **`app-blocks-training-kind`**, which ships OFF and is evaluated per viewer. Where it is off, every training call is refused (`training from apps is not enabled`). - **Page apps only** (`/apps/run/<slug>`). The model slot answers `RUN_TRAINING` with an error, and the server refuses a non-page token. - The manifest must declare **`ai:write:budgeted`** and the viewer must have granted it; the viewer must be signed in. - **Not from a development or review session**: dev tokens (`dev:live`, dev tunnel) and review-sandbox tokens are refused, run-for-real included. Use the mock host (`createMockHost` / `Harness`) to build the flow. ## The flow 1. **Upload** — `useImageUpload({ purpose: 'trainingData' }).open()` (`OPEN_IMAGE_UPLOAD { purpose: 'trainingData' }`). The viewer picks up to {@link BLOCK_TRAINING_DATASET_MAX_ITEMS} images in a host modal; you get `[{ url, air }]` ({@link BlockTrainingDataImage}), or `null` on cancel. Pair each `air` with your caption to build {@link WorkflowBodyTraining.items}. 2. **Quote** — `useBuzzWorkflow().estimate(body)` with this body, `quoteId` ABSENT. The reply's {@link BlockWorkflowSnapshot.trainingQuote} is the orchestrator's own price for exactly this run, stored server-side. 3. **Run** — `useRunTraining().runTraining({ ...body, quoteId })` (`RUN_TRAINING`). Civitai shows the viewer a consent dialog in ITS chrome — price, base model, length, dataset size, all read back from the server, never from your body, with the host's own copies of the uploads as thumbnails — and submits only on their click. A quote naming an image this host did not upload for the block is refused with no dialog (`training data not uploaded here`) — upload in the same page session as the run; a reload forgets the uploads. 4. **Follow** — `useBuzzWorkflow().watch(snapshot.workflowId)`. 🔴 `useBuzzWorkflow().submit()` REFUSES THIS BODY before sending it. The server charges a training run only against a quote the viewer confirmed from a signed-in session, which only `RUN_TRAINING`'s dialog can record. ## Money There is no `maxBuzz` and no timeout knob, on purpose: the price is the quote. A run may cost more than the token's per-call `buzzBudget` (the viewer confirms the exact price), up to {@link BLOCK_TRAINING_MAX_BUZZ_PER_RUN} (5,000 Buzz); an estimate above that is refused.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'training'` |  |
| `items` | `BlockTrainingDatasetItem[]` | The dataset: 1…{@link BLOCK_TRAINING_DATASET_MAX_ITEMS} images this host uploaded for the viewer, each with its caption — see {@link BlockTrainingDatasetItem}. One blob may appear once. |
| `engine` | `'ai-toolkit'` | The only engine accepted. |
| `model` | `string` | A base-model key from Civitai's training catalog (1…64 characters), resolved and gated server-side. Custom AIRs are not accepted. |
| `params` | `AiToolkitTrainingParams` |  |
| `triggerWord` | `string` | At most {@link BLOCK_TRAINING_TRIGGER_WORD_MAX_CHARS} characters. The host runs it through the same trigger-word check Civitai's trainer and Training Studio use, at the estimate and again at the submit, before anything is reserved; a refused trigger word fails the estimate. |
| `samplePrompts` | `string[]` | At most {@link BLOCK_TRAINING_SAMPLE_PROMPTS_MAX} prompts of at most {@link BLOCK_TRAINING_SAMPLE_PROMPT_MAX_CHARS} characters each. Checked for those bounds only, as in the Training Studio. |
| `quoteId?` | `string` | The quote this run is charged against — {@link BlockTrainingQuote.quoteId} from the estimate (`tq_` + 32 hex characters). OMIT it on the estimate; REQUIRED on `RUN_TRAINING`. The server checks the rest of the body against the body that was quoted, so change nothing else between the two. |

**`BlockTrainedEpoch`** — object

One entry of {@link BlockWorkflowSnapshot.trainedEpochs} / {@link AppWorkflow.trainedEpochs}.

| Field | Type | Notes |
|---|---|---|
| `$type` | `'training' \| 'imageResourceTraining'` | Which pass-through training `$type` produced this epoch. The SDK's inbound validator checks only that it is a string, so a value the host adds later can arrive — give an exhaustive `switch` a default branch. |
| `epochNumber` | `number` | Pass as `epoch` to the `/models/train/from-orchestrator` wizard route. |

**`AiToolkitTrainingParams`** — alias

`params` of a {@link WorkflowBodyTraining} — the host's `aiToolkitTrainingParamsSchema`, the same schema Civitai's own training form validates against, discriminated on `ecosystem`. ⚠️ THE ECOSYSTEM LIST IS CLOSED HERE AND OPEN ON THE HOST. The host adds ecosystems over time; until this package mirrors one, a body naming it does not type-check. That is the cost of a typed copy, paid deliberately: a free `string` would let a typo through to a refused estimate.

```ts
AiToolkitTrainingParamsBase & ({
    ecosystem: AiToolkitPlainEcosystem;
    modelVariant?: undefined;
} | {
    ecosystem: 'sd3';
    modelVariant: 'large' | 'medium';
} | {
    ecosystem: 'flux1';
    modelVariant: 'dev' | 'schnell';
} | {
    ecosystem: 'wan';
    modelVariant: '2.1' | '2.2';
} | {
    ecosystem: 'flux2klein';
    modelVariant: '4b' | '9b';
} | {
    ecosystem: 'qwen21' | 'ming' | 'yue2';
    modelVariant?: undefined;
    batchSize?: 1;
} | {
    ecosystem: 'ace_step_15_xl';
    modelVariant: 'base' | 'sft';
})
```

**`AiToolkitTrainingParamsBase`** — object

The fields every ai-toolkit ecosystem shares (`aiToolkitBaseParams` on the host).

| Field | Type | Notes |
|---|---|---|
| `engine` | `'ai-toolkit'` |  |
| `epochs?` | `number` | Saved checkpoint count, integer 1…50. With `steps` absent it is also the length knob. |
| `steps?` | `number` | Total training steps, integer ≥ 1 — the primary length (and price) knob. |
| `batchSize?` | `number` | Integer ≥ 1. Exactly `1` on the `qwen21` / `ming` / `yue2` ecosystems. |
| `sampleCfgScale?` | `number` |  |
| `sampleStrength?` | `number` |  |
| `continueFrom?` | `string` |  |
| `resolution` | `number \| null` |  |
| `lr` | `number` | Learning rate. 🔴 Must be BELOW `0.1` unless `optimizerType` is `prodigy` or `prodigy8bit` — a host refinement this type cannot express; a body that breaks it is refused at estimate. |
| `textEncoderLr` | `number \| null` |  |
| `trainTextEncoder` | `boolean` |  |
| `lrScheduler` | `AiToolkitLrScheduler` |  |
| `optimizerType` | `AiToolkitOptimizerType` |  |
| `networkDim` | `number \| null` |  |
| `networkAlpha` | `number \| null` |  |
| `noiseOffset` | `number \| null` |  |
| `minSnrGamma` | `number \| null` |  |
| `flipAugmentation` | `boolean` |  |
| `shuffleTokens` | `boolean` |  |
| `keepTokens` | `number` |  |
| `numRepeats?` | `number` |  |

**`AiToolkitPlainEcosystem`** — union

The ai-toolkit ecosystems that take NO `modelVariant` — send the key absent. (`qwen21` / `ming` / `yue2` also take none; they live on their own arm of {@link AiToolkitTrainingParams} because they pin `batchSize` to `1`.)

- `'sd1'`
- `'sdxl'`
- `'chroma'`
- `'qwen'`
- `'zimageturbo'`
- `'zimagebase'`
- `'ltx2'`
- `'ltx23'`
- `'ltx25'`
- `'minimaxh3'`
- `'ernie'`
- `'anima'`
- `'boogu'`
- `'krea2'`
- `'mageflow'`
- `'ideogram4'`
- `'ace_step_15'`

**`AiToolkitLrScheduler`** — union

`lrScheduler` values the host's ai-toolkit schema accepts.

- `'constant'`
- `'constant_with_warmup'`
- `'cosine'`
- `'linear'`
- `'step'`

**`AiToolkitOptimizerType`** — union

`optimizerType` values the host's ai-toolkit schema accepts.

- `'adamw'`
- `'adamw8bit'`
- `'adam8bit'`
- `'lion'`
- `'lion8bit'`
- `'adafactor'`
- `'adagrad'`
- `'prodigy'`
- `'prodigy8bit'`
- `'automagic'`

**`BlockTrainingQuote`** — object

{@link BlockWorkflowSnapshot.trainingQuote}.

| Field | Type | Notes |
|---|---|---|
| `quoteId` | `string` | `tq_` + 32 hex characters. Opaque — pass it back verbatim. |
| `total` | `number` | The quoted price, in Buzz. |
| `imageCount` | `number` | How many images the quoted dataset holds. |
| `expiresAt` | `string` | ISO-8601. The quote cannot be run after this. |

**`WorkflowBodyWorkflow`** — object

The `workflow` member of {@link WorkflowBody} — SEVERAL orchestrator steps submitted as ONE workflow, where a later step can consume an earlier step's result through a {@link WorkflowStepRef}. It travels through the same messages and hooks as every other kind (`estimate`, `submit`, `watch`, `cancel`, a batch-estimate cell, `useWorkflowBatch`). Between 1 and {@link BLOCK_WORKFLOW_MAX_STEPS} steps. There is no `maxBuzz`: the spend ceiling is the app's per-generation budget × the number of steps, enforced by the host. The host's schema is strict: an unknown key on the body or on a step is rejected, not dropped. 🔴 THREE THINGS ABOUT THE PRICE, all of them different from a single-step body: 1. **The estimate is NOT a maximum.** When a step's input references an earlier step, the orchestrator re-prices that step once the referenced values are known and charges the difference. Show the estimate as an estimate; never as "you will pay at most". 2. **A workflow the host cannot price has no estimate, but its submit still proceeds.** `estimate()` (and that body's cell in a batch estimate) FAILS with no `cost` and `errorCode` `'workflow_quote_rejected'`, `'workflow_quote_unavailable'` or `'workflow_quote_unpriced'` — see {@link BlockWorkflowSnapshot.errorCode} for which of them a retry can clear. `submit()` of the same body is NOT refused: it is reserved at the ceiling above instead of at a quote. So a failed estimate does not predict a refused submit. Two exceptions are refused on BOTH, before any reservation: a workflow containing a training step, exactly as on the single-step arm (a `training-quote-*` `errorCode`), and one with a `repeat` step at any depth (`errorCode: 'workflow_repeat_unbounded'`). Their `error` states the cause; only "none could be obtained; try again" is one a retry of the same body can clear. (An OLDER host returns the ceiling as the estimate's `cost.total` instead of failing, so there a total equal to the ceiling may be unpriced.) 3. **One author fee per workflow**, not one per step, computed on the QUOTED base. The estimate's `cost.authorFee` is that single fee, already inside `cost.total`. If the workflow bills more than the quote, the fee charged is held to the fee shown. A workflow that does not succeed has its WHOLE fee reversed, even when earlier steps delivered output. The app's velocity limit counts one unit per step, and a `repeat` step one per iteration (nested repeats multiplied) instead of one. 🔴 A FAILED WORKFLOW CAN STILL HAVE COST AND IMAGES. Steps that succeeded before the failing one stay charged, so a `failed` snapshot can carry `cost.total > 0` and usable `imageUrls`. See {@link BlockWorkflowSnapshot.steps}. 🔴 REQUIRES A HOST THAT KNOWS THIS KIND. An older host refuses the body.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'workflow'` |  |
| `steps` | `WorkflowBodyWorkflowStep[]` | The steps, in order. 1…{@link BLOCK_WORKFLOW_MAX_STEPS}. |
| `arguments?` | `Record<string, unknown>` | Values the steps can read through `{ $ref: '$arguments', path }` — one place to put a prompt or a seed that several steps share. |

**`WorkflowBodyWorkflowStep`** — object

One step of a {@link WorkflowBodyWorkflow}.

| Field | Type | Notes |
|---|---|---|
| `name?` | `string` | What later steps call this one in a {@link WorkflowStepRef}, and the `name` it reports under on {@link BlockWorkflowSnapshot.steps}. Optional: an unnamed step is named by its position (`'$0'`, `'$1'`, …). A lowercase letter followed by up to 31 of `a-z`, `0-9`, `_` or `-` (`/^[a-z][a-z0-9_-]{0,31}$/`), unique within the body, and not `'block-step'`, which is reserved. A name that breaks a rule is refused with `errorCode: 'workflow_ref_invalid'`. |
| `$type` | `string` | The ORCHESTRATOR step type to run, verbatim — e.g. `'imageGen'`. Not resolved against any allowlist: it is refused only when it names a platform-internal type (scanners, moderation classifiers, hashing, web scrape/search, and the retired `textToImage` step type), with `errorCode: 'workflow_step_denied'`. 1…64 characters. Two step types are read by shape, because they name their sources outside a {@link WorkflowStepRef}: - **`repeat` — over `arguments` only, at most {@link BLOCK_WORKFLOW_REPEAT_MAX_ITERATIONS} iterations.** Its input must be exactly `{ for: { $ref, path, as }, template: { $type, name?, input? } }` with `for.$ref === '$arguments'` and `path` naming an ARRAY in the body's `arguments`; its length is the iteration count, nested repeats multiplied. A repeat over another step's output, a missing or non-array path, or too many iterations is refused with `errorCode: 'workflow_repeat_unbounded'`; a wrong shape, or repeats nested more than 4 deep, with `workflow_ref_invalid`. Inside the template the `as` name is a source a reference may name; it may not equal a step name. The template's `$type` is held to the denylist too. - **`merge`** — every entry of `input.fields` needs a string `$ref` and a `reduce`, and each `$ref` must name `$arguments` or an EARLIER step, never a repeat variable. Each counts toward the 64-reference cap. Otherwise `workflow_ref_invalid`. |
| `input` | `Record<string, unknown>` | The step's own input object. Any value in it, at any depth, may be a {@link WorkflowStepRef}. The orchestrator's per-`$type` schema is the only authority for what a given `$type` accepts. Every step's `input` plus the body's `arguments` may total at most 262144 bytes (256 KB) serialized. |
| `suppressOutput?` | `boolean` | `true` marks an INTERMEDIATE step: its blobs are not surfaced, neither on its own {@link BlockWorkflowStepSnapshot.imageUrls} nor in the top-level {@link BlockWorkflowSnapshot.imageUrls}. The step still runs and is still charged. |

**`WorkflowStepRef`** — object

A REFERENCE inside a `kind: 'workflow'` step's `input` — the orchestrator's own mechanism for feeding one step's result into a later step. Put it anywhere a value would go, at any depth. `$ref` names where the value comes from: - `'$arguments'` — the body's own {@link WorkflowBodyWorkflow.arguments}; - the `name` of an EARLIER step in the same body; - `'$<index>'` — an EARLIER step you did NOT name, by its zero-based position (`'$0'` is the first step). A step that has a `name` is referenced by that name only. An object counts as a reference only when it has BOTH `$ref` and `path` and no key other than `default` / `format`; anything else is ordinary input. `path` selects the value inside that source, e.g. `'output.images[0].url'` for a step, or `'prompt'` for `$arguments`. The orchestrator resolves it; the path is not checked by this package or by the host. 🔴 A reference may only point BACKWARDS. A step that names itself, a later step, or a step that does not exist is refused by the host with `errorCode: 'workflow_ref_invalid'` before anything is priced or reserved. A body may hold at most 64 references, in inputs nested at most 32 levels. `default` is the value used when the path resolves to nothing; `format` is a template applied to the resolved value. Both are passed to the orchestrator unmodified.

| Field | Type | Notes |
|---|---|---|
| `$ref` | ``'$arguments' \| `$${number}` \| (string & {})`` |  |
| `path` | `string` |  |
| `default?` | `unknown` |  |
| `format?` | `string` |  |

<!-- END GENERATED: bridge/training-and-multi-step -->
</BridgeReference>
