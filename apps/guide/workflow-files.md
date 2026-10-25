---
title: Reading a workflow file
description: Read a published Workflows model's file as parsed JSON graphs from a page app with useResourceFile — what is served, the default file, errors, limits and where it works.
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
session, a signed download URL or the raw bytes.

It is one hook, [`useResourceFile()`](../reference/hooks/storage-and-media#hook-useResourceFile),
over one bridge message pair, `GET_RESOURCE_FILE` → `RESOURCE_FILE_RESULT`
(listed under *Wildcard packs & resource files* in the
[message bridge reference](../reference/messages)). It needs
`@civitai/blocks-react` 0.78.0 and `@civitai/app-sdk` 0.79.0 or later. It needs
**no scope** and no manifest change, and it counts no download.

## The request and the reply

```ts
import type { BlockResourceFile, BlockResourceFileErrorCode } from '@civitai/app-sdk/blocks';

// block → host
type GetResourceFile = {
  type: 'GET_RESOURCE_FILE';
  payload: { requestId: string; modelVersionId: number; fileId?: number };
};

// host → block: `file` on success, `error` on failure
type ResourceFileResult = {
  type: 'RESOURCE_FILE_RESULT';
  payload: { requestId: string; file?: BlockResourceFile; error?: BlockResourceFileErrorCode };
};
```

A successful reply carries `file`:

| Field | What it holds |
|---|---|
| `file.meta` | Which file was served: `modelId`, `modelVersionId`, `fileId`, `fileName`, `modelName`, `versionName`, `creatorUsername` (`null` when the creator has no username). |
| `file.entries` | One `{ path, format, graph }` per JSON document. A plain `.json` file gives one entry, whose `path` is the file name. A `.zip` gives one entry per `.json` inside it, with its path in the archive; other files, `__MACOSX/` entries and dot-files are skipped and do not count. |
| `entries[].format` | `'api'` when every top-level value has `class_type` and `inputs` (ComfyUI's API format); `'ui'` when the document has a `nodes` array (the editor's saved workflow); otherwise `'unknown'`. |
| `entries[].graph` | The parsed JSON as-is. Check `format` before you treat it as a graph — an `'unknown'` entry can be any JSON. |
| `file.truncated` | `true` when a JSON entry was left out: past the 20-entry cap, over a size cap, unreadable, or not valid JSON. |

A failed reply carries `error`, one code from a closed set — never free text.

The host drops a request with no `requestId`, or whose `modelVersionId` or
`fileId` is not a positive integer, without replying. A present but invalid
`fileId` is dropped rather than replaced by the default file. The hook never
sends one: it fetches nothing for a non-positive or non-integer id.

## Which file is served

Pass `fileId` to read one file of a multi-file version. Without it, the host
picks, in this order:

1. a `.json` file of type **Config**,
2. then a `.zip` file of type **Archive**,
3. then the file with the lowest id.

Within a rank the lowest id wins, so the pick does not depend on the order the
files were uploaded or returned. `file.meta.fileId` and `file.meta.fileName`
say which one you got.

Only `.json` and `.zip` files can be parsed. Any other file type answers
`parse-failed`.

## What is served, and to whom

- **Workflows models only.** The version must belong to a `Workflows` or
  `ComfyWorkflows` model. A Checkpoint, a LoRA or any other type answers
  `not-found`.
- **Signed-in viewers only.** A signed-out viewer gets `unauthorized`.
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

Observed on civitai.com on 2026-10-25: an early-access workflow, a paid
mature-rated workflow and a Checkpoint each answered `not-found`, and a
mature-rated, freely downloadable workflow answered `forbidden` to a viewer
browsing with mature content off.

## Errors

| `code` | What it means for your app | Retry? |
|---|---|---|
| `not-found` | No such version or file, not a Workflows model, or not free public content for this viewer (see above). Your app cannot tell these apart, by design. | No |
| `forbidden` | The version is above the viewer's maturity setting, **or** your app is running in review preview, where the host refuses before resolving anything. | No |
| `unauthorized` | The viewer is signed out. Offer sign-in, then refetch. | After sign-in |
| `too-large` | The file is over 32 MB (by its recorded size, its `Content-Length`, or the body as it downloads), or nothing could be returned because every JSON entry was over a size cap (4 MB per entry, 16 MB in total). A single `.json` over 4 MB is `too-large`. | No |
| `parse-failed` | Not a `.json` or `.zip`, a corrupt archive, or no JSON entry that could be read and parsed. It is **also** the host's catch-all: a network error, a failed download, no answer within the host's 110-second deadline, a transient storage failure, or any other server error. | Once is reasonable |
| `busy` | This tab already has 3 resource-file requests in flight. | Yes, after a short delay |
| `rate-limited` | The viewer has used their 30 requests in the current minute. | Yes, later |

In the hook, `error` is a `ResourceFileError` whose `.code` is one of these
(its `.message` is the code too). When the host never answers, `error` is a
`RequestTimeoutError` instead — see [Where it works](#where-it-works).

## Limits

| Limit | Value | Past it |
|---|---|---|
| File size | 32 MB, checked before the download and again as the body streams | `too-large` |
| One JSON entry, inflated | 4 MB | entry skipped, `truncated: true` (`too-large` if no entry is left) |
| All entries, inflated | 16 MB | remaining entries skipped, `truncated: true` (`too-large` if no entry is left) |
| JSON entries returned | 20 | the rest are skipped, `truncated: true` |
| Requests in flight per tab | 3 | `busy` |
| Requests per viewer | 30 a minute, in a bucket of their own (wildcard-pack reads are counted separately); moderators are not limited | `rate-limited` |
| Host deadline (resolve, download and parse together) | 110 s | `parse-failed`, and the in-flight slot is freed |
| Hook timeout (`RESOURCE_FILE_REQUEST_TIMEOUT_MS`) | 120 s | `RequestTimeoutError` |

The hook's timeout is longer than the default for bridge requests on purpose:
the host's own 110-second deadline should always answer first.

## Where it works

| Where your app runs | What a `GET_RESOURCE_FILE` gets |
|---|---|
| A full-page app on civitai.com | A file, or one of the codes above. |
| Review preview | `forbidden`, always. |
| The model-page slot | **No reply.** The slot has no handler, and no code in the closed set means "not supported here", so the host sends nothing. The hook reports a `RequestTimeoutError` after 120 seconds. |
| `npm run dev:live` | `parse-failed`, always, with a console note. The live dev host holds a block token, not a viewer session, so it cannot resolve the file. |
| `npm run dev:harness` (the mock host) | A canned one-entry `ui` file for any id, or the code you force. |

There is no "not supported" code. So do not treat `parse-failed` as proof the
file is broken: under `dev:live` it only means the bridge is not there. And do
not let a model-slot block wait two minutes for a reply that never comes —
only ask from a page. The hook fetches nothing for a non-positive id, so pass
`0` when you are not on a page:

```tsx
import { useEffect } from 'react';
import { isPageSlotContext } from '@civitai/app-sdk/blocks';
import { ResourceFileError, useBlockContext, useResourceFile } from '@civitai/blocks-react';

export function WorkflowGraphs({ modelVersionId }: { modelVersionId: number }) {
  const { context } = useBlockContext();
  const onPage = isPageSlotContext(context);
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

## What a real file looks like

Observed on civitai.com on 2026-10-25:

- A public `.zip` workflow returned two entries, both `format: 'ui'`.
- A version that has both a `.json` and a `.zip` file was served the `.json`
  when no `fileId` was given (the Config-file rank).
- The same version, with the `.zip`'s `fileId` named, returned `ui`, `api` and
  `unknown` entries from one archive — which is why you check `format` per
  entry rather than per file.

## Testing with the mock host

The mock host answers `GET_RESOURCE_FILE` for any `modelVersionId` and `fileId`
with one `ui` entry from a `.json` file. `createMockHost` (and `<Harness>`,
which takes the same options) from `@civitai/blocks-react/testing` take two
options:

- `resourceFile` — the `BlockResourceFile` to return instead of the default.
- `resourceFileError` — one of the codes above, returned instead of a file, to
  exercise your error states. `setScenario({ resourceFileError: undefined })`
  clears it.

The mock cannot show you the access rules, the size caps or the model-slot
timeout. Those exist only on the real page host.
