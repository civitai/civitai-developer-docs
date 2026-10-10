---
title: Posting from an app
description: Publish a post to the viewer's Civitai profile from a page app, from the app's own generation outputs or from an image the app produced in the browser tab and uploaded. The two source kinds, the upload-then-post flow, the requirements, the limits, and how to test it with the mock host.
sources:
  - npm:@civitai/blocks-react@0.67.0#useCreatePostFromApp
  - npm:@civitai/blocks-react@0.67.0#useUploadImageBytes
  - npm:@civitai/app-sdk@0.62.0/blocks#BlockCreatePostRequest
  - civitai:src/server/routers/blocks.router.ts#createPostFromApp
  - civitai:src/server/routers/blocks.router.ts#persistAppUploadImage
  - civitai:src/server/services/blocks/block-post.logic.ts
  - civitai:src/server/services/blocks/block-post.service.ts#resolveAppPublishedImages
  - civitai:src/components/AppBlocks/imageUploadBytes.ts
---

# Posting from an app

A page app can publish a **real post on the viewer's Civitai profile**: public,
visible in feeds, under the viewer's name. The app asks, Civitai shows the
viewer exactly what will be published, and the post is created only when they
confirm.

There are two hooks:

- [`useCreatePostFromApp()`](../reference/hooks#hook-useCreatePostFromApp)
  creates the post.
- [`useUploadImageBytes()`](../reference/hooks#hook-useUploadImageBytes) uploads
  an image your app produced in the browser tab (an edited render, a
  composited canvas, a file with repaired metadata), so that it can be posted.
  It needs `@civitai/blocks-react` 0.67.0 or later and `@civitai/app-sdk`
  0.62.0 or later.

Both are bridge messages. Neither has a `/api/v1/blocks/*` route, and
[that is by design](./concepts#what-stays-on-the-bridge-by-design).

::: warning Page apps only, and still rolling out
Posting works from a **page app**, not from a model-slot block. It is also
still being rolled out, so some viewers get the refusal
`posting from apps is not enabled`. Treat that as an ordinary error state: show
a short message and leave the rest of your app working. Like the rest of the
[Apps platform](./), it needs closed-beta access to run for real.
:::

## What an app can post {#sources}

A post is built from `sources`, in post order. There are two kinds:

| Source | What it names | Where the ids come from |
|---|---|---|
| `{ kind: 'workflow', workflowId, imageIndexes? }` | Outputs of a generation your app ran for this viewer | `workflowId` from [`useBuzzWorkflow()`](./text-to-image) or `useAppWorkflows()`. `imageIndexes` are positions in that workflow's images. Leave it out to take every available output |
| `{ kind: 'published', imageIds }` | Images this app already published or uploaded for this viewer | `imageIds` from a `useUploadImageBytes()` upload, or from a `usePublishGenerationOutputs()` publish |

**No source takes a URL or raw bytes.** Your app can only choose among images
Civitai already holds and has tied to your app and this viewer. To post a file
your app made itself, upload it first: the upload is a separate step so the
image is scanned before it can be posted.

A `workflow` source has two rules:

- The workflow must be one your app submitted for this viewer.
- It must be finished (`succeeded`, `failed`, `expired` or `canceled`). A
  workflow that is still running is refused with
  `workflow is still running — wait for it to finish before posting`.

A `published` source has four. Each image must:

- belong to this viewer,
- have been published or uploaded by this app,
- not be in a post already, and
- be scanned, unflagged, and within the content ceiling of the Civitai domain
  the app is running on. An uploaded image must also be within the
  safe-for-work ceiling, whatever that domain allows.

An image that fails any of these is refused with
`an image is not available to post`. The message is the same for every cause.
An image you published with `usePublishGenerationOutputs()` a moment ago has
not been rated yet, and an unrated image is refused.
[`useGatedImages()`](../reference/hooks#hook-useGatedImages) returns the
viewer's own unrated image as `status: 'visible'` with `ratingPending: true`,
so `visible` alone is not enough. Offer to post an image only once its entry
is `visible` **and** `ratingPending` is no longer set.

## Upload, then post {#upload-then-post}

The flow for a file your app produced in the tab:

1. Make sure the token holds `posts:write:self` (see
   [Requirements](#requirements)).
2. `upload(bytes)`. The host stores the file, scans it, and resolves with a
   moderated image.
3. `createPost({ sources: [{ kind: 'published', imageIds: [image.imageId] }] })`.
   The host opens its confirmation dialog and resolves with the post when the
   viewer confirms.

```tsx
import { useRef, useState } from 'react';
import {
  CreatePostError,
  useBlockToken,
  useCreatePostFromApp,
  useRequestConsent,
  useRequestSignIn,
  useUploadImageBytes,
} from '@civitai/blocks-react';

export function PostButton({ file }: { file: Blob }) {
  const { scopes } = useBlockToken();
  const { requestConsent } = useRequestConsent();
  const { requestSignIn } = useRequestSignIn();
  const { upload } = useUploadImageBytes();
  const { createPost } = useCreatePostFromApp();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Kept across clicks, so a retry posts the image that is already uploaded.
  const uploaded = useRef<{ file: Blob; imageId: number } | null>(null);
  const canPost = scopes.includes('posts:write:self');

  const onClick = async () => {
    if (!canPost) {
      // upload() does not prompt. Ask first. This returns nothing: when the
      // viewer grants, the host pushes a new token, `scopes` updates, and the
      // button re-renders as "Post".
      requestConsent({ scopes: ['posts:write:self'] });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      // 1. Upload once per file. Resolves only once the scan has settled,
      //    which can take a few minutes.
      let kept = uploaded.current;
      if (kept?.file !== file) {
        const image = await upload(await file.arrayBuffer(), { filename: 'result.png' });
        kept = uploaded.current = { file, imageId: image.imageId };
      }
      // 2. Opens the host's confirmation dialog.
      const post = await createPost({
        sources: [{ kind: 'published', imageIds: [kept.imageId] }],
        title: 'Made with My App',
      });
      uploaded.current = null; // an uploaded image goes into one post only
      setNote(`Posted: ${post.url}`);
    } catch (err) {
      if (err instanceof CreatePostError) {
        if (err.declined) return; // the viewer said no, so no post exists
        if (err.signInRequired) return requestSignIn();
        if (err.timedOut) {
          setNote('Still working. Check your profile before trying again.');
          return;
        }
      }
      // A host or server message, for example 'busy',
      // 'file type is not allowed' or 'posting from apps is not enabled'.
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={onClick} disabled={busy}>
        {canPost ? 'Post to Civitai' : 'Allow posting'}
      </button>
      {note && <p>{note}</p>}
    </>
  );
}
```

Things the example depends on:

- **`upload()` takes an `ArrayBuffer`.** Use `await blob.arrayBuffer()`. A
  `Blob`, a typed array such as `Uint8Array`, or an empty buffer is refused
  with `invalid image-upload request`.
- **`upload()` rejects with a plain `Error`**, whose message is the host's or
  the server's reason. `createPost()` rejects with a `CreatePostError`.
- **Keep the returned `imageId`.** If the viewer dismisses the dialog, or the
  post is refused or times out, the uploaded image is still there. Call
  `createPost()` again with the same id; do not upload the file a second time.
  The example keeps the id in a ref next to the file it came from, uploads
  only when it has no id for that file, and clears it once the post exists.

### Posting a generation instead

To post what your app just generated, skip the upload and name the workflow:

```tsx
import { useBuzzWorkflow, useCreatePostFromApp } from '@civitai/blocks-react';

export function ShareResult() {
  const { result } = useBuzzWorkflow();
  const { createPost, pending } = useCreatePostFromApp();
  if (result?.status !== 'succeeded') return null;

  const share = () =>
    createPost({
      sources: [{ kind: 'workflow', workflowId: result.workflowId, imageIndexes: [0] }],
      title: 'Made with My App',
    }).catch(() => {
      // Handle CreatePostError as in the example above.
    });

  return <button onClick={share} disabled={pending}>Post the first image</button>;
}
```

Here `createPost()` asks for `posts:write:self` by itself if the token lacks
it, then retries once. Only the upload needs the scope requested up front.

## Requirements {#requirements}

1. **A page app.** A model-slot block has no handler for either message:
   `upload()` rejects at once with `unsupported on this host`, and the server
   refuses a non-page token too.
2. **`posts:write:self` in your manifest, with a `scopeJustifications` entry.**
   The scope is sensitive, so a manifest that declares it without a
   justification is rejected at submit. See the
   [scopes reference](../reference/scopes).
3. **The viewer has granted it before you upload.** The server refuses an
   upload from a token without the scope
   (`block lacks posts:write:self scope`), and `upload()` does not open the
   consent dialog. Call
   [`useRequestConsent()`](../reference/hooks#hook-useRequestConsent) with
   `{ scopes: ['posts:write:self'] }` from a click, then upload once
   `useBlockToken().scopes` contains it.
4. **A signed-in viewer** whose account may post. Creating a post needs an
   account with a verified email or a linked sign-in provider, that has
   finished onboarding, is not brand new, and is not muted or banned. A banned
   account is refused at upload as well; the rest are checked only when the
   post is created, so a viewer can upload successfully and still be refused at
   the post step. The refusal arrives as a
   server message you can show.

```json
{
  "scopes": ["posts:write:self"],
  "scopeJustifications": {
    "posts:write:self": "Lets you publish the image you edited here to your Civitai profile."
  }
}
```

### The viewer confirms every post {#confirm}

The scope grant does not publish anything by itself. No post is created
without the viewer confirming it in a dialog in Civitai's own chrome. A request
Civitai refuses up front never reaches the dialog.

The dialog shows what Civitai resolved from your request, not the strings you
sent: the real thumbnails, the title and description that will be written, and
the tags that will actually be applied. Your app cannot show one post and
publish another. Two consequences:

- A requested tag that does not exist is not applied. The dialog tells the
  viewer which ones were dropped.
- A dismissed dialog rejects with `err.declined`, and that always means no
  post was created. Revert your UI quietly.

## Limits {#limits}

The numbers behind the caps in this section (file size, upload burst, images
and sources per post, and the rate limits) are published in one place, the
[posting and image-upload limits](./text-to-image#posting-limits) table. This
section says what is limited and what your app sees.

### The file you upload

| | |
|---|---|
| Formats | PNG, WebP or JPEG. The host reads the file's first bytes; the filename and extension are ignored. Anything else is refused with `file type is not allowed` |
| Size | Capped per file. A larger buffer is refused with `file exceeds the maximum upload size` |
| Shape | An `ArrayBuffer` |
| Burst | The host caps how many uploads, and how many bytes in total, one open page of your app can send in a short window. Past that it replies `busy`; wait and try again |
| Content | Scanned before you get an id back. An image rated above the safe-for-work ceiling (PG and PG-13), or flagged by the scan, is refused with the scan's message |

**The upload resolves only after the scan settles.** That is usually quick but
can take a few minutes, so show progress and do not put a short timeout around
it. If the wait ends without a result (`upload()` rejects with a timeout
error, or the host reports that the scan timed out), **do not retry
automatically**. The first attempt may already have stored the image, and a
second upload creates a duplicate. Let the viewer decide.

### The post

| | |
|---|---|
| Images | At least 1, up to a per-post maximum. A request that resolves to more is refused, not trimmed |
| Sources | The number of entries in `sources` is capped as well |
| `title` | Optional, up to **255** characters, no links |
| `detail` | Optional, up to **2,000** characters, no links |
| `tags` | Up to **5** are applied, and only tags that already exist on Civitai. An app cannot create a tag |
| `modelVersionId` | Optional. Attaches the post to that model version's gallery. The version must be published and public, and an app cannot attach posts to its own publisher's models |

Title, description and tags are also screened against Civitai's blocked-content
list. A refusal there, or for a link, comes back as a server message.

### Things that surprise people

- **An uploaded image goes into exactly one post.** Once it is in a post it can
  no longer be named as a `published` source. To post the same file again,
  upload it again.
- **Uploaded images do not appear in `useGatedImages()`.** That hook reads the
  images your app published with `usePublishGenerationOutputs()`, and an
  upload is not one of them. Keep the `imageId` that `upload()` returned.
- **Posting a published image removes it from your grid.** An image from
  `usePublishGenerationOutputs()` stops resolving through `useGatedImages()`
  once it joins a post. An app cannot keep an image in its shared grid and let
  the viewer post that same image.
- **Embedded generation metadata is not carried over.** If the file you upload
  has prompt or parameter metadata embedded in it, Civitai does not read it
  into the posted image's generation details. The image is posted without
  them.
- **`dev:live` cannot post.** It has no Civitai chrome to draw the
  confirmation dialog in, so it refuses `createPost()`, and its `upload()`
  rejects with `the host returned no uploaded image`. Use the
  [mock host](#testing-locally).

### Rate limits {#rate-limits}

Uploads and posts are rate limited on the server as well, and those numbers
are in the same
[posting and image-upload limits](./text-to-image#posting-limits) table. The
one to design around: **a page app's hourly post allowance is small, and it is
shared by every viewer of the app.** Make posting a deliberate action the
viewer takes on a finished result, never something your app does in a loop,
and show a refusal as "try again later".

## Handling errors {#errors}

`createPost()` rejects with a `CreatePostError`. Check its flags in this order:

| Check | Meaning | What to do |
|---|---|---|
| `err.declined` | The viewer dismissed the dialog. No post was created | Revert, say nothing |
| `err.signInRequired` | No session | Call `useRequestSignIn()` |
| `err.timedOut` | No reply arrived. The post **may** exist | Tell the viewer to check their profile. Never retry automatically |
| `err.code` is set | A host refusal: `review-mode`, `block is not ready`, `no images to post`, `no block token` | Show your own copy, or ignore |
| none of the above | A server message, safe to show: a rate limit, a blocked title, `posting from apps is not enabled`, an account that may not post yet | Show `err.message` |

`upload()` rejects with an `Error` whose message is one of the host's strings
(`busy`, `file type is not allowed`, `file exceeds the maximum upload size`,
`invalid image-upload request`, `no block token`) or a server message (the
missing scope, the rollout refusal, a rate limit, the scan's verdict).

Server messages are written for people and can be reworded. Show them; do not
branch on their text.

## Testing locally {#testing-locally}

The mock host (`createMockHost` or `Harness` from
`@civitai/blocks-react/testing`, which is what `npm run dev:harness` runs)
answers both messages with no backend. See
[the local dev loop](./local-dev) for the harness itself.

For the upload it runs the host's own checks in the host's order: the size cap,
then the burst window, then the file type. These options control the rest:

| Option | Effect |
|---|---|
| `uploadImageBytesResult` | The image an accepted upload resolves with |
| `uploadImageBytesError` | Forces a refusal, for example `'block lacks posts:write:self scope'` |
| `onUploadImageBytes` | Reports what was accepted |
| `createPostResult` | The post a confirmed `createPost()` resolves with |
| `createPostError` | Forces a refusal, including `'declined'` |
| `postableImageIds` | Image ids to treat as already postable |

The mock checks a `published` source with the server's rule and the server's
refusal string, but it has no stored images. It accepts an id only if it issued
that id as postable in this session (an accepted upload, or a
`usePublishGenerationOutputs()` reply) or you seeded it, and each id works in
one post only:

```ts
import { createMockHost } from '@civitai/blocks-react/testing';

// A viewer returning to an image they uploaded in an earlier session.
createMockHost({ postableImageIds: [1001, 1002] });
```

Any other id, an id from a picked `useImageUpload()` upload, or an id already
used in a post is refused with `an image is not available to post`, as in
production.

The mock does **not** model the page-only rule, the scope check, the real
scan, the rollout refusal, or the server rate limits. A flow that passes in
the harness can still be refused for any of those on civitai.com, so write the
error handling before you need it.

## Next

- [Hooks reference](../reference/hooks) for
  [`useCreatePostFromApp`](../reference/hooks#hook-useCreatePostFromApp) and
  [`useUploadImageBytes`](../reference/hooks#hook-useUploadImageBytes).
- [Generating images (text-to-image)](./text-to-image), the usual source of a
  `workflow` post, and its
  [posting and image-upload limits](./text-to-image#posting-limits).
- [Scopes reference](../reference/scopes) for `posts:write:self`.
- [Concepts](./concepts#what-stays-on-the-bridge-by-design) for why posting
  stays on the bridge.
- [Local dev loop](./local-dev) for the mock host.
