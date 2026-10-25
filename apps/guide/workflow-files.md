---
title: Reading a workflow file
description: Read a published Workflows model's file as parsed JSON graphs from a page app with useResourceFile — where it works, which file is served, who is served what, a worked example, and checking with checkComfyGraph whether a graph can run inline before offering Run.
sources:
  - npm:@civitai/blocks-react@0.78.1#useResourceFile
  - npm:@civitai/app-sdk@0.80.0/blocks#BlockResourceFile
  - npm:@civitai/app-sdk@0.80.0/blocks#BlockResourceFileErrorCode
  - npm:@civitai/app-sdk@0.80.0/blocks#checkComfyGraph
  - npm:@civitai/app-sdk@0.80.0#README
  - civitai:src/server/services/resource-file.service.ts#resolveResourceFileForUser
  - civitai:src/server/routers/generation.router.ts#resolveResourceFile
  - civitai:src/components/AppBlocks/resourceFileParse.ts
  - civitai:src/components/AppBlocks/resourceFileHost.ts
  - civitai:src/components/AppBlocks/PageBlockHost.tsx#GET_RESOURCE_FILE
---

# Reading a workflow file

A page app can read the file of a published **Workflows** model — a ComfyUI
workflow — as parsed JSON, without downloading anything itself. The app names a
model version; Civitai resolves the file **as the signed-in viewer**, through
the same download checks the site uses, fetches and unzips it in the viewer's
own tab, and hands back only the parsed JSON. The app never sees the viewer's
session, a signed download URL or the raw bytes. It needs **no scope** and no
manifest change, and it counts no download.

This page covers what the reference entries do not: where the request works,
which file you get, and who is served what. For everything else, read the
reference:

- [`useResourceFile()`](../reference/hooks/storage-and-media#hook-useResourceFile)
  — the hook's signature, the shape of `file` (`meta`, `entries`, `truncated`,
  and what each entry `format` means), every error code, the size and rate
  limits, and the mock host options for testing.
- [`GET_RESOURCE_FILE` → `RESOURCE_FILE_RESULT`](../reference/messages#msg-wildcard)
  — the bridge message pair's payload and reply types.

The hook needs `@civitai/blocks-react` 0.78.0 and `@civitai/app-sdk` 0.79.0 or
later.

## Where it works

| Where your app runs | What a `GET_RESOURCE_FILE` gets |
|---|---|
| A full-page app on civitai.com | A file, or an error code. |
| Review preview | `forbidden`, always. |
| The model-page slot | **No reply.** The slot has no handler, and no code in the closed set means "not supported here", so the host sends nothing. The hook reports a `RequestTimeoutError` after 120 seconds. |
| `npm run dev:live` | `parse-failed`, always, with a console note. The live dev host holds a block token, not a viewer session, so it cannot resolve the file. |
| `npm run dev:harness` (the mock host) | A canned one-entry `ui` file for any id, or the code you force. |

There is no "not supported" code. So do not treat `parse-failed` as proof the
file is broken: under `dev:live` it only means the bridge is not there. And do
not let a model-slot block wait two minutes for a reply that never comes —
only ask from a page. The hook fetches nothing for a non-positive id, so pass
`0` when you are not on a page (see the [example](#example)).

The host also drops, without replying, a request with no `requestId` or whose
`modelVersionId` or `fileId` is not a positive integer; a present but invalid
`fileId` is dropped rather than replaced by the default file. The hook never
sends such a request.

## Which file is served

Pass `fileId` to read one file of a multi-file version. Without it, the host
picks, in this order:

1. a `.json` file of type **Config**,
2. then a `.zip` file of type **Archive**,
3. then the file with the lowest id.

Within a rank the lowest id wins — in practice, the file uploaded first — so
the pick does not depend on the order the database returns the files in.
`file.meta.fileId` and `file.meta.fileName` say which one you got.

Only `.json` and `.zip` files can be parsed; any other file type answers
`parse-failed`. The 32 MB size cap is checked first, though: a file over
32 MB answers `too-large` whatever its type.

## What is served, and to whom

- **Workflows models only.** The version must belong to a `Workflows` or
  `ComfyWorkflows` model. A Checkpoint, a LoRA or any other type answers
  `not-found`.
- **Signed-in viewers only.** A signed-out viewer gets `unauthorized`, and
  retrying will not change that. Offer sign-in with
  [`useRequestSignIn()`](../reference/hooks/viewer-and-navigation#hook-useRequestSignIn):
  after login the page reloads signed in, the block re-inits, and the hook
  fetches again on mount. There is nothing to refetch by hand.
- **Everyone except the model's owner gets only free, public content.** For
  them the version must be published, not in early access or any other paid
  access, downloadable, not a POI model, with both the model's and the
  version's availability open (`Public` or `Unsearchable`), and the file itself
  must be public. This applies to moderators too, and to a viewer who bought the
  version or holds a private-access grant. Each of these refusals answers
  `not-found`, the same as a version that does not exist.
- **The owner** can read their own published version's files, including a
  non-public file and an early-access, private, POI or download-disabled
  version. An unpublished draft, and an archived or deleted model, is
  `not-found` for everyone, the owner included.
- **Maturity.** A version that passes every check above but is rated above the
  viewer's maturity setting on this site answers `forbidden`. This check runs
  last, so a version the viewer could not read anyway is `not-found` whatever
  its rating.

Two rate-limit details the reference does not state: the 30-a-minute budget is
a bucket of its own (wildcard-pack reads do not count against it), and
moderators are not rate-limited.

## Example

```tsx
import { useEffect } from 'react';
import { isPageSlotContext } from '@civitai/app-sdk/blocks';
import {
  ResourceFileError,
  useBlockContext,
  useRequestSignIn,
  useResourceFile,
} from '@civitai/blocks-react';

export function WorkflowGraphs({ modelVersionId }: { modelVersionId: number }) {
  const { ready, context } = useBlockContext();
  // `ready` is false until the host's BLOCK_INIT arrives; only then is `context` real.
  const onPage = ready && isPageSlotContext(context);
  // A non-positive id fetches nothing, so a model-slot block never sends a request
  // that would only time out.
  const { file, loading, error, refetch } = useResourceFile(onPage ? modelVersionId : 0);
  const { requestSignIn } = useRequestSignIn();

  const retryable =
    error instanceof ResourceFileError && (error.code === 'busy' || error.code === 'rate-limited');
  // Retry from an effect, after a delay, never during render. Only `busy` and
  // `rate-limited` loop here: `parse-failed` gets one user-clicked retry below,
  // because this loop would re-download a file of up to 32 MB every 2 s.
  useEffect(() => {
    if (!retryable) return;
    const t = setTimeout(refetch, 2_000);
    return () => clearTimeout(t);
  }, [retryable, refetch]);

  if (!ready) return <p>Loading…</p>;
  if (!onPage) return <p>Open this app's page to read the workflow.</p>;
  if (loading) return <p>Loading workflow…</p>;
  if (error instanceof ResourceFileError) {
    if (error.code === 'not-found') return <p>This workflow isn't available to read.</p>;
    if (error.code === 'forbidden') return <p>This workflow is above your content settings.</p>;
    // After login the page reloads and the hook fetches again on mount.
    if (error.code === 'unauthorized')
      return <button onClick={() => requestSignIn()}>Sign in to read this workflow</button>;
    if (error.code === 'parse-failed') return <button onClick={refetch}>Try again</button>;
    if (error.code === 'too-large') return <p>This workflow is too large to read here.</p>;
    return <p>Busy, retrying…</p>; // `busy` or `rate-limited`: the effect above retries
  } else if (error) {
    return <p>No answer from Civitai. {error.message}</p>;
  }
  if (!file) return null;

  // Check `format` per entry: one archive can hold `ui`, `api` and `unknown` entries.
  const graphs = file.entries.filter((e) => e.format !== 'unknown');
  return (
    <div>
      <h3>
        {file.meta.modelName} — {file.meta.fileName}
      </h3>
      <p>
        {graphs.length} graph(s){file.truncated ? ', some entries were left out' : ''}
      </p>
      <ul>
        {graphs.map((e) => (
          <li key={e.path}>
            {e.path} ({e.format})
          </li>
        ))}
      </ul>
    </div>
  );
}
```

A `ui` graph is the editor format; an `api` graph is the format a ComfyUI
server queues. Before you offer to run one, see
[Can this graph run?](#can-this-graph-run).

The mock host cannot show you the access rules, the size caps or the
model-slot timeout. Those exist only on the real page host.

## Can this graph run?

Reading a workflow file is not the same as being able to run it. Almost no
posted workflow can run as an
[inline `customComfy` graph](./comfy-cloud#the-inline-arm-ship-your-own-graph).

**What can run inline:** a graph that is

- in ComfyUI's **API format** (what **Save (API Format)** exports);
- built from **core ComfyUI nodes only**;
- naming every model by **AIR** (`urn:air:…`), not by filename;
- within **300 nodes** and **256 KiB** serialized
  ([graph limits](./comfy-cloud#graph-limits)).

**What can't:** a UI (editor) graph, a graph that uses custom nodes, or a graph
whose loaders name local model files such as `sd_xl_base_1.0.safetensors`.
The SDK does not convert a UI graph to API format, and custom node packs are
turned off on the inline path.

That rules out most posted workflows. In a sample of the 130 most-downloaded
SFW Workflows models, measured in
[civitai-app-starters#772](https://github.com/civitai/civitai-app-starters/issues/772):

- **0 of 178** JSON files were in API format;
- **98%** of the graphs (161 of 165) used custom nodes;
- **164 of 165** graphs named at least one model by local filename.

### Check before you offer "Run"

`checkComfyGraph` from `@civitai/app-sdk/blocks` (0.80.0 or later) answers from
the entry alone: it is pure, synchronous and makes no request. Call it on each
`useResourceFile` entry and disable "Run" with the reason, so the viewer never
spends Buzz on a job that cannot run. It returns `{ runnable: true }` or
`{ runnable: false, reasons }`; `reasons` is never empty, and its `code` is a
closed set.

```tsx
import { checkComfyGraph } from '@civitai/app-sdk/blocks';
import type { BlockResourceFileEntry, ComfyGraphRefusal } from '@civitai/app-sdk/blocks';

function whyNot(reason: ComfyGraphRefusal): string {
  switch (reason.code) {
    case 'not-api-format':
      return 'Not an API-format graph. Re-export it with "Save (API Format)".';
    case 'custom-nodes':
      return `Needs custom nodes: ${(reason.packs.length > 0 ? reason.packs : reason.classes).join(', ')}`;
    case 'model-filenames':
      return `Names models by file, not AIR: ${reason.inputs.map((i) => i.value).join(', ')}`;
    case 'too-many-nodes':
      return `${reason.nodes} nodes, over the limit of ${reason.max}`;
    case 'too-large':
      return `${reason.bytes} bytes, over the limit of ${reason.max}`;
  }
}

export function RunButton({ entry, onRun }: { entry: BlockResourceFileEntry; onRun: () => void }) {
  const check = checkComfyGraph(entry);
  if (check.runnable) return <button onClick={onRun}>Run</button>;
  return (
    <div>
      <button disabled>Run</button>
      <ul>
        {check.reasons.map((r) => (
          <li key={r.code}>{whyNot(r)}</li>
        ))}
      </ul>
    </div>
  );
}
```

When `not-api-format` fires, the filename, node-count and size checks are
skipped, because they are defined on an API graph. `packs` comes from the
`properties.cnr_id` that UI graphs carry, so it is empty for an API graph; fall
back to `classes`, as above. The full table of codes and fields is in the
[`@civitai/app-sdk` README](https://www.npmjs.com/package/@civitai/app-sdk).

`runnable: true` means no known blocker was found, not that the job will
succeed. Three things the check does not cover:

- **The core-node list is pinned to a ComfyUI commit, not the worker's ComfyUI
  version.** It can name classes newer than the ComfyUI the generation worker
  runs, so a graph that uses one passes the check and can still fail on the
  worker.
- **Strip per-node extras before you submit.** Each node must be exactly
  `{ class_type, inputs }`; a node that carries anything else, such as an
  export's `_meta`, gets the whole body rejected. The `too-large` check already
  measures the graph without them.
- **The request body is capped at 256 KB for the whole request.** The estimate
  and submit routes refuse a larger body with a 413, and the body carries
  `resources`, `prompt` and the rest as well as the graph. A graph just under
  the graph limit can still be refused.

The host also still runs its own checks on what you submit, such as requiring
every AIR in the graph to be declared in
[`resources`](./comfy-cloud#resources-is-a-declared-manifest-not-an-inference).

### The estimate is a ceiling, never a price

Estimating a `customComfy` body returns your `maxBuzz` as `cost.total`; it is
not a quote. Billing settles to the real GPU time after the run. Show the
estimate as "up to N Buzz", never as the price
([how generation is billed](./comfy-cloud#how-generation-is-billed)).
