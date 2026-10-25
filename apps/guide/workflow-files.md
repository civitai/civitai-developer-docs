---
title: Reading a workflow file
description: Read a published Workflows model's file as parsed JSON graphs from a page app with useResourceFile — where it works, which file is served, who is served what, and a worked example.
sources:
  - npm:@civitai/blocks-react@0.78.0#useResourceFile
  - npm:@civitai/app-sdk@0.79.0/blocks#BlockResourceFile
  - npm:@civitai/app-sdk@0.79.0/blocks#BlockResourceFileErrorCode
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
- **Signed-in viewers only.** A signed-out viewer gets `unauthorized`. The hook
  does not refetch by itself when the viewer signs in: offer sign-in
  ([`useRequestSignIn()`](../reference/hooks/viewer-and-navigation#hook-useRequestSignIn)),
  then call `refetch()` once the viewer is signed in.
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
import { ResourceFileError, useBlockContext, useResourceFile } from '@civitai/blocks-react';

export function WorkflowGraphs({ modelVersionId }: { modelVersionId: number }) {
  const { ready, context } = useBlockContext();
  // `ready` is false until the host's BLOCK_INIT arrives; only then is `context` real.
  const onPage = ready && isPageSlotContext(context);
  // A non-positive id fetches nothing, so a model-slot block never sends a request
  // that would only time out.
  const { file, loading, error, refetch } = useResourceFile(onPage ? modelVersionId : 0);

  const retryable =
    error instanceof ResourceFileError && (error.code === 'busy' || error.code === 'rate-limited');
  // Retry from an effect, after a delay, never during render.
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
    if (error.code === 'unauthorized') return <p>Sign in to read this workflow.</p>;
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
server queues. If you run one on Civitai with
[`customComfy`](./comfy-cloud), check which format that path expects before
you pass a graph through.

The mock host cannot show you the access rules, the size caps or the
model-slot timeout. Those exist only on the real page host.
