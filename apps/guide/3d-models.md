---
title: Generate 3D models in an app
description: Turn an image into a 3D model from an App Block with a pass-through polyGen step — the request body, the scope and Buzz budget it needs, estimating and polling, picking the GLB out of model3dOutputs, what an unrated model means, showing it with a bundled viewer, and saving it as a .glb.
sources:
  - npm:@civitai/app-sdk@0.95.1/blocks#WorkflowBodyPassThroughStep
  - npm:@civitai/app-sdk@0.95.1/blocks#BlockModel3dOutput
  - npm:@civitai/app-sdk@0.95.1/save-model3d
  - npm:@civitai/blocks-react@0.87.0#useBuzzWorkflow
  - npm:@civitai/blocks-react@0.87.0#useRunConfirmedStep
  - npm:@civitai/blocks-react@0.87.0#useSaveImage
  - npm:@civitai/orchestration-client@0.2.8#MeshyV71ImageTo3dFalPolyGenInput
  - civitai:src/server/services/blocks/steps/output.ts#splitPassThroughStepOutput
  - civitai:src/server/services/blocks/workflow.service.ts#propagateMeshRating
  - civitai:src/server/services/blocks/block-output-restriction.ts#classifyBlockOutput
  - civitai:src/components/AppBlocks/saveImageDownload.ts#enforceImageExtension
---

# Generate 3D models in an app

An App Block can turn an image into a 3D model by sending the orchestrator's
`polyGen` step through the **pass-through** arm of the generation bridge: a
`{ kind: 'step', $type: 'polyGen', input, maxBuzz }` body whose `input` the
host forwards to the orchestrator unmodified. The host prices it, spends the
viewer's Buzz, and hands back the model URLs, labelled so you can tell the GLB
from the FBX.

This page is the App Blocks walkthrough. The engines, every `input` field and
the price of each option are on the orchestration
[3D model generation recipe](/orchestration/recipes/3d); the field-level bridge
contract is the [generation bridge reference](../reference/generation).

::: warning Closed beta, page apps only
Like the rest of [generation](./text-to-image), this is **mod-gated** during
the closed beta and needs a **page app**, the
[`ai:write:budgeted`](../reference/scopes) scope and a **signed-in** viewer.
The examples use `@civitai/blocks-react@0.87.0` and
`@civitai/app-sdk@0.95.1`; `WorkflowBodyPassThroughStep` needs
`@civitai/app-sdk@0.43.0` or later.
:::

## 1. The manifest: scope and budget {#manifest}

Declare `ai:write:budgeted` and size `page.buzzBudgetPerGen` for a 3D run.
3D models cost far more than images: on the recipe's price list a textured
Meshy model is 1,560 Buzz, and a Hunyuan3D model is 160. The per-call budget
is **1,000 Buzz when the manifest omits it** and is clamped at **5,000**
([the limits table](./text-to-image#limits-table)), and a submit whose
reservation is above it comes back `failed` with `insufficient buzz budget`,
nothing charged. So a Meshy app with no budget
declared fails on every submit.

```json
{
  "$schema": "https://civitai.com/schemas/app-block/v1.json",
  "blockId": "my-3d-app",
  "version": "0.1.0",
  "name": "My 3D App",
  "type": "block",
  "scopes": ["ai:write:budgeted"],
  "page": {
    "path": "/",
    "title": "My 3D App",
    "buzzBudgetPerGen": 5000
  },
  "contentRating": "g",
  "minApiVersion": "1.0",
  "buildCommand": "npm run build",
  "outputDir": "dist"
}
```

The budget is a ceiling, not a price: the viewer is charged the real price
([Sizing the budget](../reference/manifest)). If you would rather keep a low
budget, a job priced above it can still run once the viewer confirms its exact
price in Civitai's own dialog; see [step 3](#estimate-and-submit).

## 2. The request body {#request-body}

Send the orchestrator's `polyGen` input as `input`, verbatim. This body asks
Meshy v7.1 for a textured model from one image:

```ts
import type { WorkflowBodyPassThroughStep } from '@civitai/app-sdk/blocks';

declare const sourceImageUrl: string;

const body: WorkflowBodyPassThroughStep = {
  kind: 'step',
  $type: 'polyGen',
  input: {
    engine: 'fal',
    model: 'meshy',
    version: 'v7.1',
    operation: 'imageTo3D',
    imageUrl: sourceImageUrl,
    shouldTexture: true,
    enablePbr: true,
  },
  maxBuzz: 250,
};
```

- **`kind: 'step'` with `$type` and no `step` key.** That is what selects the
  pass-through arm; a body carrying both `step` and `$type` is refused
  ([`WorkflowBodyPassThroughStep`](../reference/generation/bodies#bridge-WorkflowBodyPassThroughStep)).
  `polyGen` is not on the host's denylist of platform-internal step types.
- **`input` is the orchestrator's own `polyGen` input.** The host does not
  read, default or rewrite it, so the orchestrator decides what is valid, after
  the spend is reserved rather than before. The fields above are those of the
  orchestrator client's `MeshyV71ImageTo3dFalPolyGenInput`; the other engines
  (`engine: 'comfy', model: 'hunyuan3D'` and `engine: 'fal', model: 'tripo'`)
  and every option are in the [recipe](/orchestration/recipes/3d).
- **`imageUrl` must be a URL, never inline data.** The host refuses a `data:`
  URI or long base64 anywhere in `input`. Let the viewer pick or upload the
  image with
  [`useMediaUpload()`](../reference/hooks/storage-and-media#hook-useMediaUpload)
  (`open({ kind: 'image' })`) and pass the `url` it returns. To make a model
  from an image your app just generated, save it with
  [`usePersistGenerationSource()`](../reference/hooks/generation#hook-usePersistGenerationSource)
  and pass the url that returns: an output URL from a snapshot is refused as an
  input with `Host media urls cannot be used as workflow inputs. Save the output
  with persistGenerationSource and use the url it returns.` Or run both steps
  in one [multi-step workflow](./workflows).
- **`maxBuzz` is not the price.** It is an integer from 1 to 250. When the
  orchestrator quotes the step, the host reserves the larger of `maxBuzz` and
  the quote, so a 1,560 Buzz quote reserves 1,560. When it cannot quote,
  `maxBuzz` is both the reservation and the step's **timeout in seconds**, and a
  3D job killed after 250 seconds comes back `expired`. Read the estimate before
  you submit (next step).

## 3. Estimate, then submit {#estimate-and-submit}

[`useBuzzWorkflow()`](../reference/hooks/generation#hook-useBuzzWorkflow)
carries the body: `estimate(body)` prices it without running it, and
`submit(body)` runs it. When the token lacks `ai:write:budgeted`, `submit`
opens the host's consent dialog and re-sends once the viewer grants it;
`estimate` never prompts.

On a pass-through body, the estimate's `cost.total` is what the submit would
**reserve**, `max(maxBuzz, quote)`, or `maxBuzz` when unquoted. It is not a
guaranteed ceiling: nothing on this arm stops a job billing above the
reservation, so do not show it to the viewer as a maximum. Where your app
charges an author fee, `cost.authorFee` itemises it.

When the price is **above your per-call budget**, the estimate can carry a
`stepQuote` instead, and the job runs through
[`useRunConfirmedStep()`](../reference/hooks/batches-and-training#hook-useRunConfirmedStep):
Civitai shows the viewer `stepQuote.total` in its own dialog and submits on
their click. It needs a fixed price of at most 5,000 Buzz, and it ships behind a
host flag that is **off by default**, so an estimate with no `stepQuote` is
normal. Without one, a job over the budget cannot run from your app.

```tsx
import { useBuzzWorkflow, useRunConfirmedStep } from '@civitai/blocks-react';
import type { WorkflowBodyPassThroughStep } from '@civitai/app-sdk/blocks';

declare const body: WorkflowBodyPassThroughStep;

function useGenerate3d() {
  const { estimate, submit, watch } = useBuzzWorkflow();
  const { runConfirmedStep } = useRunConfirmedStep();

  return async function generate() {
    const priced = await estimate(body); // rejects with WorkflowEstimateError when unpriced
    const started = priced.stepQuote
      ? await runConfirmedStep({ ...body, quoteId: priced.stepQuote.quoteId })
      : await submit(body);
    if (started.status === 'failed') return started; // e.g. 'insufficient buzz budget: …'
    return watch(started.workflowId, { timeoutMs: 25 * 60_000 });
  };
}
```

`runConfirmedStep` rejects when the viewer declines, and it never retries: see
its reference for the error flags before you write the catch. `submit()`
**resolves** with `status: 'failed'` for a budget or spend-cap refusal rather
than rejecting; the cases are listed under
[`useBuzzWorkflow`](../reference/generation/lifecycle#bridge-useBuzzWorkflow).

On the default `page-elements` template, `@civitai/sdk` 0.33.0 sends the same
body with `app.workflows.estimate(body)`,
`app.workflows.submit(body, { idempotencyKey })` and
`app.workflows.wait(workflowId)`, and its snapshot carries the same
`model3dOutputs` field. The confirmed-step and save calls on this page are
`@civitai/blocks-react` hooks.

## 4. Poll until it is done {#polling}

3D generation takes **minutes**: the recipe gives Meshy up to 20 minutes of
worker time. `watch(workflowId)` owns the polling loop, calls `onUpdate` with
every snapshot, and resolves with the terminal one. Its default `timeoutMs` is
**10 minutes**, after which it resolves with the last snapshot it saw, still
`processing`, so pass a longer one for 3D (above) and check `status` on what it
returns.

Two waits can come after the job itself finishes, both because a model is held
until it is rated (next section):

- While a model waits for its rating, the host reports a finished workflow as
  `processing` for up to 5 minutes after it completed (civitai source at the
  time of writing).
- After that, a final snapshot can still carry `ratingPending: true`, and
  `watch` keeps polling for up to 2 more minutes for the rating to land.

`watch` stopping (a timeout, or an `AbortSignal`) does not cancel the job. Use
`cancel(workflowId)` to stop it.

## 5. Find the GLB: `model3dOutputs` {#model3d-outputs}

The snapshot's `outputs` lists every output in position, and `imageUrls` lists
the URLs you may load, a `polyGen` run's thumbnail and models together. The
host labels the 3D models among them on `model3dOutputs`, one entry per model:

- `url`: the same URL that is in `imageUrls` (and in that output's entry of
  `outputs`).
- `format`: the file format the orchestrator reports on the blob, such as
  `'glb'` or `'fbx'`. It is an open set: match the formats your viewer loads
  and ignore the rest.
- `variant`: the output field the model came from, dot-joined when nested:
  `'model'`, `'fbxModel'`, `'riggedModel'`, `'basicAnimations.walkingModel'`.

```ts
import type { BlockWorkflowSnapshot } from '@civitai/app-sdk/blocks';

declare const snapshot: BlockWorkflowSnapshot;

const glb =
  snapshot.model3dOutputs?.find((m) => m.format === 'glb' && m.variant === 'model') ??
  snapshot.model3dOutputs?.find((m) => m.format === 'glb');
```

Match on **both** fields. A Tripo quad run puts its mesh in `fbxModel` (FBX)
and leaves `model` empty, and the orchestrator's own type notes that `model` can
be a PLY Gaussian splat on one engine, so `variant === 'model'` alone does not
promise a GLB. Rigging and animation add `riggedModel`, `animatedModel` and
`basicAnimations.*` entries.

`model3dOutputs` is **omitted** when the run produced no model your app may
load, and on hosts that predate it. A model that is pending, restricted or
blocked is never in it, so when your GLB is missing, read `outputs` to say why.

## 6. Unrated and restricted models {#unrated}

The orchestrator never rates a 3D mesh itself. The host gives a model the most
severe rating of its **rating sources**, the step's `thumbnail` and any
`model3DPreview` render in the same workflow, and holds it until every source
has been rated. The model's entry in `outputs` is then one of:

- `{ url, nsfwLevel? }`: rated, and within what this viewer may see. Load it.
- `{ pending: true }`: a rating source has not been rated yet. There is no URL
  yet; keep watching (the snapshot carries `ratingPending: true`).
- `{ restricted: true, reason: 'unrated' }`: the step finished with **no
  rating source at all**, so no rating will ever arrive, and a rating could
  restrict it for this viewer. It is **terminal**: there is no URL, it never
  becomes available, and publishing or persisting it is refused with
  `output N is restricted`. Show a locked state and do not try to fetch it.
- `{ restricted: true, reason: 'pool' | 'ceiling' }` and `{ blocked: true }`:
  the same meanings as for an image.

A rating "could restrict it" almost everywhere: whenever the viewer's ceiling
does not cover every rating (an SFW app on an SFW host caps every viewer at
PG-13), or the
workflow refuses mature content or carries a rating cap. So **pick an engine
that returns a thumbnail**. The recipe lists a thumbnail for Meshy and Tripo
and none for Hunyuan3D, which means a Hunyuan3D-only run in an SFW app comes
back `{ restricted: true, reason: 'unrated' }`. A `model3DPreview` render of
the mesh in the same [multi-step workflow](./workflows) is also a rating source
to the host. Not yet confirmed: we have not run a working `polyGen` plus
`model3DPreview` workflow body end to end, so treat that route as unverified.

For a restricted model,
[`useOutputUnlock()`](../reference/hooks/generation#hook-useBuzzWorkflow)
(see "Unlocking a restricted output") opens the host's dialog; for `'unrated'`
it is never charged and cannot hand you the URL. The full rules are under
"Restricted outputs" on the same page.

Test every state against the mock host: `createMockHost` from
`@civitai/blocks-react/testing` takes `generation.model3dOutputs` (the labels a
pass-through step returns), `generation.pendingOutputs` and
`generation.neverRatedOutputs` (positions reported
`{ restricted: true, reason: 'unrated' }`).

## 7. Show it in the app {#viewer}

Any glTF viewer works, for example `<model-viewer>` (`@google/model-viewer`) or
three.js with its `GLTFLoader`. What we checked about the sandbox your app runs
in:

- **Scripts.** On 2026-11-26 two live apps were served with a
  `Content-Security-Policy` that sets only `frame-ancestors`, and the host's
  iframe carries no `csp` attribute, so no `script-src` or `connect-src`
  limits what your app loads. Bundle the viewer into your app anyway
  (`npm install` it and import it) rather than adding a CDN `<script>`: the
  version is pinned in what you submit and works offline in the mock
  harness. Some viewers fetch decoders or environment maps from a CDN by
  default; check your library's settings if you want everything bundled.
- **The model URL.** An app runs in a sandboxed iframe at an **opaque
  origin** (`allow-scripts allow-forms`), and a glTF loader fetches the model
  with `fetch` or XHR, so the request carries `Origin: null` and succeeds only
  if the response allows that origin. **Not yet confirmed:** we have not loaded
  a real generated model URL this way end to end. Civitai's own media route sets
  `Access-Control-Allow-Origin: *`, and the orchestration API answered an
  unauthenticated request carrying `Origin: null` with
  `Access-Control-Allow-Origin: null`, but a signed model URL can redirect to
  storage whose CORS headers we did not check.
  Try it with [`dev:live`](./local-dev) before you ship, and look for a CORS
  error in the console.
- **Babylon.js environment files.** The packager drops every file ending in
  `.env`, which includes Babylon's `environment.env` texture. Rename it (for
  example `environment.envmap`); see [What goes in the bundle](./packaging).

```tsx
// @ts-skip-snippet: three.js is not a dependency of this docs repo
import { WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

async function showModel(canvas: HTMLCanvasElement, url: string) {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x444444, 3));
  const camera = new PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.01, 100);
  camera.position.set(0, 1, 3);
  const gltf = await new GLTFLoader().loadAsync(url); // fetches `url` from the sandbox
  scene.add(gltf.scene);
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
}
```

Treat the URL as opaque: load it as you received it. The recipe notes that
model URLs expire, so keep the workflow id, not the URL, if you need the model
again later.

## 8. Save it to the viewer's device {#saving}

An app cannot download a file itself: its sandbox has no `allow-downloads`.
[`useSaveImage()`](../reference/hooks/storage-and-media#hook-useSaveImage) asks
the host to do it.

**Save the bytes, not the URL.** `saveImage({ url })` fetches the URL in the
host and forces a safe **image or video** extension from the response's content
type, falling back to `.jpg`, so a model saved that way does not land as a
`.glb`. Fetch the model into an `ArrayBuffer` and pass it as `bytes`:

```tsx
import { useSaveImage } from '@civitai/blocks-react';

declare const glbUrl: string;

function SaveModelButton() {
  const { saveImage } = useSaveImage();
  async function onClick() {
    const bytes = await (await fetch(glbUrl)).arrayBuffer();
    await saveImage({ bytes, filename: 'model.glb' }); // rejects with the host's reason
  }
  return <button onClick={onClick}>Download .glb</button>;
}
```

The host recognises a binary glTF (`.glb`) or a binary FBX (`.fbx`) by its
**content** and saves it under that extension, whatever `filename` says. The
check is `@civitai/app-sdk/save-model3d` (`looksLikeSaveModel3d`, then
`isValidSaveModel3d`), the same module the host and `createMockHost` run:

- A GLB must be glTF container version 2, declare a length equal to the
  buffer's, and start with a JSON chunk (at most 8 MiB) that parses to a glTF
  document with `asset.version`. Anything appended after the model is refused
  with `file type is not allowed`.
- An FBX must be binary, version 6100 to 7999. ASCII FBX, `.gltf` with sidecar
  files and OBJ are text, and are saved as text.
- The cap is **100 MiB** per model (`SAVE_MODEL3D_MAX_BYTES`); the hook refuses
  a larger buffer before sending it. That is also the host's whole save budget
  for a 10-second window, so a second save right after a large model can reply
  `busy`.
- A host or `createMockHost` older than model saves refuses one: `file type is
  not allowed` from an older host, and a `createMockHost` error naming
  `@civitai/app-sdk/save-model3d` when the installed `@civitai/app-sdk` does
  not have it.

The `fetch(glbUrl)` here is the same cross-origin read as the viewer's, with the
same **not yet confirmed** status ([section 7](#viewer)).

## Related

- [3D model generation recipe](/orchestration/recipes/3d): engines, every
  `polyGen` field, costs and troubleshooting.
- [`WorkflowBodyPassThroughStep`](../reference/generation/bodies#bridge-WorkflowBodyPassThroughStep)
  and [what the bridge can and cannot do](../reference/generation#what-the-bridge-can-and-cannot-do).
- [`BlockWorkflowSnapshot`](../reference/generation/lifecycle#bridge-BlockWorkflowSnapshot):
  `outputs`, `ratingPending`, `model3dOutputs`, `stepQuote`.
- [`useRunConfirmedStep`](../reference/hooks/batches-and-training#hook-useRunConfirmedStep)
  and [`useSaveImage`](../reference/hooks/storage-and-media#hook-useSaveImage).
- [Multi-step workflows](./workflows) and [Local dev loop](./local-dev).
