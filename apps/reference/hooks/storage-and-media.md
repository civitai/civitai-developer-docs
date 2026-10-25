---
title: "Storage, picker and media hooks"
description: "Per-app and shared storage, wildcard packs, checkpoint, resource and image pickers, uploading images and other media, saving images, and creating posts. Part of the Hooks reference."
---

<!-- GENERATED PAGE — do not edit by hand. Written by `npm run gen:appblocks:md` (scripts/appblocks-md.mjs); which entry lives on which page is decided in .vitepress/theme/components/referenceSplit.shared.mjs. -->

# Storage, picker and media hooks

Per-app and shared storage, wildcard packs, checkpoint, resource and image pickers, uploading images and other media, saving images, and creating posts.

This page documents 11 of the 48 hooks in the [Hooks reference](../hooks), which indexes every hook by name. Generated from the published `@civitai/blocks-react@0.77.0` package's type definitions and README.

Other pages: [Context, frame and analytics hooks](./context) · [Generation hooks](./generation) · [Batch, confirmed-step and training hooks](./batches-and-training) · [Buzz, purchase and tip hooks](./buzz-and-purchases) · [Viewer, consent and navigation hooks](./viewer-and-navigation)

<HooksReference group="storage-and-media">
<!-- BEGIN GENERATED: hooks/storage-and-media — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`useWildcardPack`**

```ts
useWildcardPack(modelVersionId: number): UseWildcardPack
```

```ts
interface UseWildcardPack {
  pack: BlockWildcardPack | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

Import a wildcard pack's parsed prompt lists by model version — the host resolves + fetches + unzips + parses it **in the user's own page session** (every download gate enforced), so the untrusted iframe never sees the bytes. Returns `{ pack, loading, error, refetch }`. On failure `error` is a `WildcardPackError` with a discriminated `code` (`not-found` / `forbidden` / `too-large` / `parse-failed` / `busy` — `busy` is retryable), not free text.

```tsx
const { pack, loading, error, refetch } = useWildcardPack(modelVersionId);
// `error.code === 'busy'` is retryable — call refetch(); the other codes are terminal.
if (error instanceof WildcardPackError && error.code === 'busy') void refetch();
if (!loading && pack) console.log(Object.keys(pack.lists));
```

**`useCreatePostFromApp`**

```ts
useCreatePostFromApp(): UseCreatePostFromApp
```

```ts
interface UseCreatePostFromApp {
  createPost: (args: BlockCreatePostRequest, options?: ConsentRetryOptions) => Promise<BlockCreatePostResult>;
  pending: boolean;
  error: CreatePostError | null;
}
```

```md
Publish a **real, published Post on the viewer's profile** from this app's own
outputs, host-mediated over `CREATE_POST_FROM_APP`. Returns
`{ createPost, pending, error }`.

The strictly-more-consequential sibling of `usePublishGenerationOutputs()`: that
one makes a bare `Image` row with no post, no feed presence, no reward and no
notification; this one makes **public, feed-visible, reward-earning content under
the viewer's byline**.

🔴 **Requires the `posts:write:self` scope**, which is **sensitive** and
**consent-gated**. Declare it in your manifest *with* a `scopeJustifications`
entry — the server rejects the manifest at submit without one — and expect the
viewer to be prompted to grant it before the first call succeeds.

🔴 **The grant is not the consent.** Every call opens a host-chrome confirm, and
what it shows is the **server's** resolution of your request, never your strings:
the tag names that will *actually* be applied, host-fetched model and version
names for a gallery attach, and real thumbnails. A block cannot show one post and
publish another.

🔴 **No arm of `sources` takes a URL.** Name a workflow from this app's own
subqueue plus indexes into its outputs, or `Image` ids from a previous
`usePublishGenerationOutputs()` publish or `useUploadImageBytes()` upload. The
server re-verifies both — ownership,
this app's provenance marker, and that the image is not already in a post.

⚠️ **Posting a published image removes it from this app's own grid.** The
app-scoped read behind `useGatedImages()` is conjoined with `postId IS NULL`, so
an image that joins a post stops resolving there. An app cannot both keep an
image in its shared grid and let the viewer post it — design around it.

Text is advisory: the server bounds `title`/`detail`, screens them, refuses a
`detail` containing a link, and resolves `tags` against **existing** tags only (a
name matching no tag is dropped, never minted, and is shown to the viewer on the
confirm).

`createPost` **rejects** with a `CreatePostError` on every non-success:

| | meaning | what to do |
|---|---|---|
| `err.declined` | the viewer dismissed the confirm — **no post was created** | revert, say nothing |
| `err.signInRequired` | no session | route into `useRequestSignIn()` |
| `err.timedOut` | no reply arrived within the 10-min consent bound | 🔴 **check this BEFORE `.message`** — it also has no `.code`, and its message is an SDK-internal string. It does **not** mean nothing happened; tell the viewer to check their profile and never retry automatically |
| `err.code` set otherwise | a host refusal (`review-mode` / `block is not ready` / `no images to post` / `no block token`) | show or ignore per case |
| `err.code === undefined` **and** `!err.timedOut` | a **server** message the host forwarded verbatim (rate limit, blocked title, refused gallery attach) | show `err.message` |
```

```tsx
const { createPost, pending } = useCreatePostFromApp();
const { requestSignIn } = useRequestSignIn();

async function share() {
  try {
    const post = await createPost({
      sources: [{ kind: 'workflow', workflowId: w.workflowId, imageIndexes: [0, 2] }],
      title: 'Made with Sticker Studio',
    });
    showToast(`Posted! ${post.url}`);
  } catch (err) {
    if (err instanceof CreatePostError) {
      if (err.signInRequired) return requestSignIn();
      if (err.declined) return; // the viewer said no — say nothing
      if (err.timedOut) return showToast('Still working — check your profile.');
      showToast(err.message); // a real server message, safe to render
    }
  }
}
```

```md
With the mock host — `createMockHost` or `Harness` from
`@civitai/blocks-react/testing` — the `createPostResult` / `createPostError`
options drive both arms (including `declined`). **`dev:live` refuses this bridge on purpose** —
it has no civitai chrome to render the server-resolved confirm in, and driving
the write without it would let dev prove out a flow production does not have.
```

**`useAppStorage`**

```ts
useAppStorage(): UseAppStorage
```

> Deprecated: new apps keep per-viewer data in a private collection of the document store. This hook is shut down on 2026-11-10; from then on its calls fail with an error. See [Storing data](/apps/guide/storage#moving-from-the-legacy-stores).

```ts
interface UseAppStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<{ ok: true; sizeBytes?: number; }>;
  delete(key: string): Promise<{ ok: true; deleted: boolean; }>;
  list(opts?: { prefix?: string; limit?: number; cursor?: string; }): Promise<AppStorageListResult>;
  getQuota(): Promise<AppStorageQuota>;
}
```

KV datastore, host-mediated. Keys are **namespaced** per (block instance, viewer); the byte and row **budgets** are enforced per (**app**, viewer), so every instance of one app shares one budget for that viewer.

```tsx
import {
  APP_STORAGE_MAX_VALUE_BYTES, // largest single value, in wire bytes
  APP_STORAGE_MAX_BYTES,       // total stored bytes per (app, viewer)
  APP_STORAGE_MAX_ROWS,        // total rows per (app, viewer)
} from '@civitai/app-sdk/blocks';

const storage = useAppStorage();
await storage.set('key', { any: 'json' });   // rejects over ANY of the three — and on a >200-char key
const v = await storage.get<MyShape>('key'); // null if unset / anon
await storage.delete('key');                  // idempotent
const { keys } = await storage.list({ prefix: 'note-' });
const quota = await storage.getQuota();       // { usedBytes, rowCount, limitBytes, limitRows }
```

````md
🔴 **For the byte/row budget, `getQuota()` is the authority for those two
numbers and the constants are a snapshot.** All three above are compiled-in
figures **as of the version of `@civitai/app-sdk` you installed** — which is the
same frozen-number failure mode this page used to demonstrate, just with one
copy instead of nine. The host can move any of them without your lockfile
changing. So:

- **Render `getQuota()`'s reply**, never a constant, anywhere a viewer sees a
  number or a code path decides whether a write will fit.
- **Reach for the constants only where no quota reply is available** — a
  build-time sanity check, a test fixture, a rough design-time estimate — and
  treat the answer as "roughly, at install time".
- **Re-check after any SDK bump**, and expect movement: the per-viewer clamp
  was sized against a measured distribution and the host says to expect a
  re-measure. `appStorageLimits.ts` in `@civitai/app-sdk` carries the
  provenance and a one-liner that re-derives the current values from the host.

Never hard-code a figure of your own: the docs here used to quote the app-wide
umbrella instead of the per-viewer clamp and were **25x** out on bytes and
**1000x** out on rows.

🔴 **That authority stops at the budget, and so does the list above.**
`getQuota()` answers `{ usedBytes, rowCount, limitBytes, limitRows }` and
nothing more, so it reports neither of the other two ceilings: the host's
**200-character cap on `key`**, nor `APP_STORAGE_MAX_VALUE_BYTES`, which is a
per-**write** cap rather than part of the per-(app, viewer) budget. A write that
fits the quota reply is still refused if its key is too long or its value is
over the per-value cap — and for the key, nothing local catches it
([#370](https://github.com/civitai/civitai-app-starters/issues/370), detailed
below). Cap or hash long keys in your block.

🔴 **The ROW ceiling is usually the binding one, and a byte-based "x of y used"
readout will not see it coming.** A block caching one modest record per item a
viewer touches exhausts `limitRows` while still holding a small fraction of
`limitBytes`. Show rows too.

`createMockHost()` defaults to these same ceilings and enforces the per-value
cap, the byte budget and — since it was added — the **row** budget on write, so
a row-limit overrun now fails under `dev:mock` where it previously passed and
failed only in production. Pass `storage: { quotaBytes, limitRows }` to
simulate something smaller.

⚠️ The mock is **not** gate-for-gate identical to the host. Five known
divergences:

- the byte gate refusing a shrinking overwrite that the host admits
  ([#345](https://github.com/civitai/civitai-app-starters/issues/345));
- 🔴 the byte gate counting **wire** bytes where the host counts **stored**
  bytes — `octet_length(value::jsonb::text)`, larger for every container: ~1.5x
  for a long array of small integers, and measured up to 44.4x for a
  numeric-heavy one (an array of `1e308`)
  ([#347](https://github.com/civitai/civitai-app-starters/issues/347));
- nothing models the **app-wide** umbrella, so `app quota exceeded` and `app row
  limit exceeded` cannot be produced here at all
  ([#368](https://github.com/civitai/civitai-app-starters/issues/368));
- lowering `valueCapBytes` moves the **gate** but not the **message**, which
  keeps naming the host's real cap
  ([#369](https://github.com/civitai/civitai-app-starters/issues/369));
- 🔴 no key-length cap: the host refuses a `key` over **200 characters**
  zod-side, and neither the mock nor `useAppStorage` does
  ([#370](https://github.com/civitai/civitai-app-starters/issues/370)).

Passing under `dev:mock` is evidence, not proof — and note that the second, the
third and the fifth are **permissive**: each lets a write pass locally that
production will reject. (#347 under-counts the bytes; #368 models no app-wide
ceiling at all, so a write the host would refuse with `app quota exceeded`
succeeds here; #370 admits an over-length key the host refuses outright.)
Size your fixtures against `getQuota()`, not against what the mock accepted.

🔴 **A rejection carries a host-authored MESSAGE, not a code.** There is no
`PAYLOAD_TOO_LARGE` on the wire — that is the TRPC *code*, and the host's
bridge forwards `err.message`. Six **ceiling** strings are measured and
single-sourced in the app-sdk's `blocks/appStorageErrors.ts` — one per
`PAYLOAD_TOO_LARGE` site in the host's router, plus the bridge's `storage
request failed` fallback — and `createMockHost` draws its rejections from that
same module, so for the ceilings the mock HAS it answers the message production
would send, and `classifyAppStorageError(err)` picks the same branch in both.

🔴 **Those six are not every string a block can receive — and nothing here
enumerates the rest.** The bridge catches every rejection out of
`apps.storage.*` with a *blanket* `catch` and puts its message on the same
`error` field, so the host's authorization, approval and feature-flag prose —
**plus tRPC's own zod input-validation messages, which never reach a handler at
all** — travel the identical path. **Every one of them classifies `null`.**

🔴 **One of those zod bounds is a ceiling a real block hits with no local
warning: `key` is capped at 200 characters** (`z.string().min(1).max(200)` on
the host's `get`/`set`/`delete` input schema; `list` also caps `prefix` at 200
and `cursor` at 400). Neither `useAppStorage` nor `createMockHost` caps the key
— both forward it verbatim and the mock has no length gate
([#370](https://github.com/civitai/civitai-app-starters/issues/370)) — so a key
built from a URL or a model name can save fine under `dev:mock` and fail
forever in production, classified `null`. **The reload the `null` arm below
recommends does not fix it.** Cap or hash long keys in your block.

That is the whole rule, and it is stated structurally on purpose: the SDK owns
a chosen slice of the ceiling vocabulary, not the host's error surface, so the
honest claim is "**these six** classify, everything else is `null`" — which
needs no list and stays true when the host adds or rewords a message. Note it
is deliberately *not* "every ceiling classifies": the zod key cap above is a
ceiling that lands on `null` like everything else. Two earlier drafts of this
section tried instead to enumerate the non-ceiling strings, and **both lists
were short**; see the header of `blocks/appStorageErrors.ts` for what they
missed and why no third list replaced them. `invalid block token` (an expired
token mid-session) and `block instance revoked` are *illustrations* of what
lands on `null`, never a bound on it. The practical consequence: `null` is a
busy bucket, so see the `default` arm note below before writing copy for it.

⚠️ **The mock reaches four of the six.** It models no app-wide umbrella
([#368](https://github.com/civitai/civitai-app-starters/issues/368)), so
`app quota exceeded` and `app row limit exceeded` are production-only: a block
must still handle them, and no local run will ever exercise that branch. The
other four are covered — the three ceilings, plus `storage request failed` via
`storage: { failNext }`.

Branch on the classifier's **reason**, never on the string. The reason is this
SDK's and cannot move; the message is the host's and can. (That is also why the
SDK exports `classifyAppStorageError` and the reason type, but deliberately does
*not* export the array of messages: `MESSAGES.includes(err.message)` is equality
against a snapshot, and the per-value message is a template over a cap the host
is free to change.)

```ts
import { classifyAppStorageError } from '@civitai/app-sdk/blocks';

let status = 'Saved.';
try {
  await storage.set(key, note);
} catch (err) {
  console.warn('[my-block] save failed:', err);  // log the host's words
  switch (classifyAppStorageError(err)) {        // never render them
    case 'value-too-large':
      status = 'That note is too long to save. Try shortening it.';
      break;
    case 'user-row-limit':
      status = 'You have no note slots left. Delete one to make room.';
      break;
    case 'request-failed':
      // The bridge's fallback — a transport fault. Genuinely retryable.
      status = 'Could not save that note. Please try again.';
      break;
    default:
      // `null`: an unknown ceiling, or (more often) an expired/revoked token.
      status =
        'Could not save that note. Try reloading the page — if that does not ' +
        'help, storage may be unavailable for this app right now.';
  }
}
```

🔴 **Keep the `default` arm, and do not put "please try again" in it.**
`classifyAppStorageError` answers `null` both for a ceiling message this SDK
version does not know (the host can reword one in any deploy) *and* for the
whole authorization family listed above — an expired block token, a revoked
instance, an unapproved block, a missing storage scope. Retrying fixes none of
the second group, so the generic arm should offer a **reload** (which re-mints
the token, and covers a transport blip too) and concede that storage may be
unavailable. Split `'request-failed'` out if you want honest retry copy: that
reason really is the transport one.

The mock emitted the *code* until
[#343](https://github.com/civitai/civitai-app-starters/issues/343), which is
how a block's error branch could pass every local run and never fire in
production.
````

**`useSharedStorage`**

```ts
useSharedStorage(): UseSharedStorage
```

> Deprecated: new apps keep data every viewer reads in a shared collection of the document store, which has authorship, counters and marks built in. This hook is shut down on 2026-11-10; from then on its calls fail with an error. See [Storing data](/apps/guide/storage#moving-from-the-legacy-stores).

```ts
interface UseSharedStorage {
  list(opts?: { prefix?: string; limit?: number; cursor?: string; }): Promise<SharedListResult>;
  get(key: string): Promise<SharedListItem | null>;
  report(key: string, reason?: string): Promise<void>;
  getCount(key: string): Promise<number>;
  getCounts(keys: string[]): Promise<Record<string, number>>;
  append(value: SharedAppendValue): Promise<{ key: string; }>;
  update(key: string, value: SharedAppendValue): Promise<void>;
  vote(key: string): Promise<number>;
  unvote(key: string): Promise<number>;
  withdraw(key: string): Promise<{ ok: boolean; deleted: boolean; }>;
}
```

App-scoped, append-only, community-votable SHARED datastore (every viewer sees the same list). Sibling of `useAppStorage`; anonymous viewers get the read path and a hard reject on mutations.

```tsx
const shared = useSharedStorage();
const { key } = await shared.append({ title: 'Add dark mode', body: 'please' });
const { items } = await shared.list({ limit: 20 });   // newest-first
const count = await shared.vote(key);                 // idempotent up-vote
await shared.unvote(key);
await shared.withdraw(key);                            // remove my own entry
```

````md
#### Shared-storage write limits

Every write is budgeted per **(viewer, app)** on the server. One viewer
exhausting their budget in your app costs them nothing in another app, and
re-minting the block token does not reset it.

| Writes | Budget |
|---|---|
| `append` + `update` (one shared budget) | a **burst of 10**, refilling **1 every 6 minutes**, and a **daily bucket of 50**, refilling continuously (one every ~29 minutes). A write needs a token from both. |
| — writes the server **refused** (moderation block, the 50-entry cap, quota, not found, …) | also charged to a **rejection bucket of 10**, refilling **1 every 30 minutes**. No `append`/`update` is accepted while it is empty. Concurrent refused writes can drive it into debt, down to −10, which has to refill first. |
| `vote` + `unvote` | 30 a minute, shared |
| `withdraw` | 30 a minute |
| `report` | 20 a day |

Only writes that **land** spend the `append`/`update` budget: a write that fails
without landing gets its token back. The few failures the platform marks as its
own fault are refunded without a rejection charge too.

A write refused for budget arrives with retry metadata, and the hook rejects with
**`SharedStorageRateLimitError`**. It extends the plain `Error` every other
refusal is thrown as, so existing `catch` code keeps working, and `.message` is
still the server's text (`Too many submissions — retry in 312s`, or `votes`,
`withdrawals`, `reports`). Branch on the class to render the wait instead of
parsing the message:

```tsx
import { SharedStorageRateLimitError, useSharedStorage } from '@civitai/blocks-react';

const shared = useSharedStorage();
try {
  await shared.append({ title: 'Add dark mode' });
} catch (err) {
  if (err instanceof SharedStorageRateLimitError) {
    // err.retryAt: ISO-8601 instant a retry can succeed; err.retryAfterSeconds: whole seconds, ≥ 1.
    const at = new Date(err.retryAt).toLocaleTimeString();
    showNotice(`You're posting fast. Try again at ${at}.`);
  } else {
    throw err;
  }
}
```

- **Don't retry before `retryAt`.** A refused retry gets nothing, and once the
  budget is empty every attempt is refused until it refills.
- **Absent metadata is not "retry now".** A host that predates it, or a refusal
  that is not a rate limit, throws the plain `Error`. The hook also ignores a
  malformed `rateLimit` and throws the plain `Error`, rather than hand you
  something you would render.
- On the wire the refusal reply is `{ requestId, error, rateLimit?: { retryAfterSeconds, retryAt } }`
  (type `SharedStorageRateLimit` in `@civitai/app-sdk/blocks`) on the six write
  replies.
- `createMockHost({ shared: { rateLimitNext: 1, rateLimit: { retryAfterSeconds: 312 } } })`
  refuses the next write this way, so you can test the branch locally
  (`setScenario({ shared: { rateLimitNext } })` arms it mid-session).
````

**`useCheckpointPicker`**

```ts
useCheckpointPicker(): UseCheckpointPicker
```

```ts
interface UseCheckpointPicker {
  open: (opts?: { /** * 🔴 OMIT THIS BY DEFAULT. It is an ecosystem-family FILTER, not a label: * the host HIDES every checkpoint outside the family you pass. Passing the * family you are already in is therefore a trap — it makes the picker offer * only the ecosystem the user is trying to leave, and every other family * becomes unreachable for the life of the session. * * Omit it for an unconstrained pick: the host applies no base-model * narrowing and offers every checkpoint the viewer can generate with. * * Pass it ONLY when the block must stay inside a family it already holds — * a regenerate/variation flow pinned to one checkpoint's ecosystem, say — * and then DERIVE it from that checkpoint (`checkpoint.baseModel`, or * `useBlockContext().context.checkpoint?.baseModel`). Never a hardcoded * ecosystem string: a literal pins every viewer of the app to whichever * family the author happened to be testing with. Accepts an ecosystem key * (e.g. 'Flux1', 'SDXL') or any baseModel name in the family; the host * collapses either to the ecosystem family. * * An empty string is normalized to absent here and never reaches the wire, * and `''` is **not** an escape hatch — it does not even mean the same thing * on both hosts. On a **model slot** the host normalises whatever string you * send, so `''` resolves to the real ecosystem key `Other` and NARROWS to * that one family. On a **page** the host drops a zero-length value, so `''` * behaves exactly like omitting it. Neither is what you meant on at least one * surface: omit the key, or pass a family derived from a real checkpoint, and * never `''`. * * A WHITESPACE-ONLY string narrows on BOTH hosts — the page host's guard is * `length > 0`, which `' '` passes — which is why this hook trims before * deciding. */ baseModelGroup?: string; /** Currently-selected versionId so the picker can pre-highlight it. */ currentVersionId?: number; }) => Promise<{ selected?: BlockCheckpointInfo; }>;
  persist: (versionId: number | null) => Promise<void>;
}
```

Drive the platform Checkpoint picker + persist a viewer override. 🔴 **OMIT `baseModelGroup` BY DEFAULT.** It is an ecosystem-family FILTER, not a label: the host HIDES every checkpoint outside the family you pass, so passing the family you are already in is a trap — the picker then offers only the ecosystem the user is trying to leave. Omit it for an unconstrained pick and the host applies no narrowing at all, offering every checkpoint the viewer can generate with. Pass it ONLY when the block must stay inside a family it already holds — a regenerate/variation flow, say — and then DERIVE it from that checkpoint, never a hardcoded ecosystem string: a literal pins every viewer to whichever family the author happened to test with. `''` is **not** an escape hatch — it does not even mean the same thing on both hosts. On a **model slot** the host normalises whatever string you send, so `''` resolves to the real ecosystem key `Other` and NARROWS to that one family. On a **page** the host drops a zero-length value, so `''` behaves exactly like omitting it. Neither is what you meant on at least one surface: omit the key, or pass a family derived from a real checkpoint, and never `''`.

```tsx
import { isModelSlotContext } from '@civitai/app-sdk/blocks';

const { context } = useBlockContext();
const { open, persist } = useCheckpointPicker();

// DEFAULT — pass no baseModelGroup. The viewer can reach every family.
if (isModelSlotContext(context) && context.checkpoint) {
  const { selected } = await open({ currentVersionId: context.checkpoint.versionId });
  if (selected) await persist(selected.versionId);   // null clears the override
}
```

````md
Pass `baseModelGroup` **only** when the block must stay inside a family it already
holds — a regenerate or variation flow pinned to one checkpoint's ecosystem — and
then derive it from that checkpoint, never from a literal:

```tsx
import { isModelSlotContext } from '@civitai/app-sdk/blocks';

const { context } = useBlockContext();
const { open, persist } = useCheckpointPicker();

// ONLY to stay inside the family the block already holds — derived, never a literal.
if (isModelSlotContext(context) && context.checkpoint) {
  const { selected } = await open({ baseModelGroup: context.checkpoint.baseModel });
  if (selected) await persist(selected.versionId);
}
```

🔴 **`persist()` works on a model slot only. On a page it always rejects.** A
full-page app (`app.page`) is bound to no model, so the host has nowhere to write
the override: it answers every `persist()`, including `persist(null)`, with
`ok: false`, and the promise rejects with `page blocks cannot persist a
checkpoint override (no model binding)`. A page app keeps the checkpoint `open()`
returned in its own state (or in `useAppStorage()`).

Both dev hosts (`createMockHost` / `Harness` and `dev:live`) refuse it the same
way, and both default to a page context. Pass a complete `ModelSlotContext` as
`context` to exercise a block that persists. A test that expected `persist()` to
resolve under the default mock context was asserting something a page app never
gets: give it the model slot the block really runs in, or, for a page app, drop
the `persist()` call.
````

**`useResourcePicker`**

```ts
useResourcePicker(): UseResourcePicker
```

```ts
interface UseResourcePicker {
  open: { /** * Single pick. Resolves with the chosen resource, or `null` when the viewer * dismissed the picker. */ (opts: ResourcePickerOpenOptions & { multiple?: undefined; }): Promise<BlockResourceInfo | null>; /** * Multi-select (see {@link ResourcePickerMultiple}). Resolves with the * picked resources IN THE ORDER THE VIEWER PICKED THEM — never more than * `max` — or `[]` when the viewer dismissed. Each entry is the same * {@link BlockResourceInfo} a single pick returns. * * Against a host that predates multi-select the viewer gets the single-pick * picker, and this still resolves with a list: of the one resource they * picked, or `[]`. */ (opts: ResourcePickerOpenOptions & { resourceType: 'LORA'; multiple: ResourcePickerMultiple; }): Promise<BlockResourceInfo[]>; };
}
```

Drive the platform resource picker for page blocks — `'Checkpoint' | 'LORA'`. The viewer searches in host chrome; the block only ever sees what the viewer picked: one resource, or with `multiple` the few LoRAs they chose. DISCOVERY ONLY — a returned `versionId` is re-validated + re-priced server-side at estimate/submit. 🔴 **OMIT `baseModelGroup` BY DEFAULT, and never pass a HARDCODED ecosystem.** It is an ecosystem-family FILTER, not a label: the host hides every resource outside the family you pass, so a literal ecosystem string makes the viewer's own valid LoRAs invisible and the picker look empty or broken. Omit it for an unconstrained pick and the viewer sees everything of that type. Pass it ONLY when the block already holds a chosen checkpoint the pick has to match, and then DERIVE it from that checkpoint (`checkpoint.baseModel`). For stack and matrix apps that pair LoRAs with a checkpoint, this is the recommended pattern: a derived family keeps incompatible LoRAs out of the picker. This hook is PAGE-ONLY, and a page slot has no `context.checkpoint` (that field lives on `ModelSlotContext` alone), so the family comes from `BlockResourceInfo.baseModel`, the `baseModel` of a Checkpoint a picker returned earlier. For a complete multi-LoRA app, see [`starters/examples/generate-studio`](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/generate-studio): `src/components/ModelSection.tsx` fills one LoRA slot per picker session, up to `MAX_LORAS`, with a `baseModelGroup` derived from the selected checkpoint, and `keepCompatibleLoras` (`src/studio/setup.ts`) re-filters the stack when the checkpoint changes, dropping LoRAs made for another family. To fill several slots in ONE session, use `multiple` (below).

```tsx
const { open } = useResourcePicker();
const picked = await open({ resourceType: 'LORA' });   // unconstrained — the default
if (picked) {
  const versionId = picked.versionId;   // feed into body.additionalResources
  const weight = picked.strength;        // recommended default weight (may be undefined)
}
```

````md
Constrained to the family of a checkpoint the block already holds, derived from
that checkpoint, never from a literal:

```tsx
const { open } = useResourcePicker();

const checkpoint = await open({ resourceType: 'Checkpoint' });
if (checkpoint) {
  const matching = await open({
    resourceType: 'LORA',
    baseModelGroup: checkpoint.baseModel,   // from the pick above — BlockResourceInfo.baseModel
  });
}
```

**Several LoRAs in one session — `multiple: { max }`.** The viewer stages up to
`max` LoRAs in the picker and confirms once; `open` resolves with a **list**, in
the order the viewer picked them, instead of a single resource. Dismissing
resolves with `[]`.

```tsx
const { open } = useResourcePicker();

const loras = await open({ resourceType: 'LORA', multiple: { max: 3 } });
// [] when dismissed; otherwise up to 3 BlockResourceInfo, in pick order
const additionalResources = loras.map((lora) => ({
  modelVersionId: lora.versionId,
  strength: lora.strength ?? 1,
}));
```

- **LoRA only.** `multiple` with `resourceType: 'Checkpoint'` is a type error and
  rejects at runtime — it is never quietly treated as a single pick.
- **`max` is a whole number of at least 1, capped at 5** (the cap on
  `additionalResources`, exported as `RESOURCE_PICKER_MULTIPLE_MAX`). A larger
  value is clamped to 5; `0`, a negative or a fraction rejects.
- **`baseModelGroup` works the same** — pass the family derived from the
  checkpoint the block holds and every LoRA offered matches it.
- **Each entry is the same `BlockResourceInfo`** a single pick returns, and every
  id is still re-validated at estimate/submit.
- **Without `multiple`, nothing changes**: `open` resolves with one resource or
  `null`, exactly as before.
- **On a host that predates multi-select** the viewer gets the single-pick
  picker, and `open` still resolves with a list: of the one LoRA they picked, or
  `[]`. The result does not say which kind of host answered, so a one-item
  list is not a signal to open the picker again: on a current host it means the
  viewer chose one. Let the viewer add more with their own action instead.

With the mock host — `createMockHost` or `Harness` from
`@civitai/blocks-react/testing` — a `multiple` request resolves with two curated
LoRAs by default. Pass `cannedMultiPicks: [...]` to choose the list (it is cut to
the request's `max`), or `cannedMultiPicks: null` for a dismissed picker. The mock
answers a raw `multiple` + Checkpoint request with the host's error.
````

**`useImageUpload`**

```ts
useImageUpload(options: {
    purpose: 'generationSource';
}): UseImageUploadGenerationSource
```

```ts
interface UseImageUploadGenerationSource {
  open: () => Promise<BlockGenerationSourceImageInfo | null>;
}
```

Host-mediated image upload — the host opens its native upload modal and the iframe never handles the bytes. Resolves with a moderated image (or `null` on dismiss); pass `{ purpose: 'generationSource' }` for an unscanned img2img source, `{ purpose: 'trainingData' }` for several private training images in one call (`[{ url, air }] | null` — see the LoRA training section), or `{ asyncScan: true }` for the early-resolve + `scanStatus()` flow.

```tsx
const { open } = useImageUpload();
const img = await open();               // BlockUploadedImageInfo | null
if (img) {
  await submit({
    kind: 'textToImage',
    modelId,
    modelVersionId,
    sourceImage: { url: img.url, width: 1024, height: 1024 },
    params: { prompt },
  });
}
```

**`useUploadImageBytes`**

```ts
useUploadImageBytes(): UseUploadImageBytes
```

```ts
interface UseUploadImageBytes {
  upload: (bytes: ArrayBuffer, options?: UploadImageBytesOptions) => Promise<BlockUploadedImageInfo>;
}
```

Upload an image the block **produced in the tab** (a healed PNG, an edited render), with no picker, so the app can then post it. Returns `{ upload }`. `upload(bytes, { filename? })` resolves with the same moderated image a picked `useImageUpload()` upload returns (`imageId`, `nsfwLevel`, `contentRating`, `url`). That `imageId` is postable by this app through `useCreatePostFromApp()` as a `{ kind: 'published', imageIds }` source. - 🔴 **Page apps only.** A slot (model) block's host has no handler for it. The host answers an unhandled request at once with its generic refusal, so on a slot `upload` rejects immediately with `unsupported on this host` rather than waiting out the 10-minute timeout. - 🔴 **Requires `posts:write:self`.** The server refuses the upload without it, and this hook does not prompt. Ask for the scope first with `useRequestConsent()` and upload only once `useBlockToken().scopes` holds it (the example below), because the upload runs before the `createPost()` call that would otherwise prompt. - **Images only:** PNG, WebP or JPEG by magic bytes. Anything else is refused with `file type is not allowed`. The host names the stored file from the sniffed type, whatever `filename` says. - **The cap is 40 MiB.** The hook refuses a larger buffer before sending it, with the host's error `file exceeds the maximum upload size`. The host also allows at most 8 uploads and 80 MiB per 60 seconds per page, and replies `busy` past that. - **The upload is blocking.** The host replies once the image is scanned, so allow for a wait of up to a few minutes. An image above the SFW ceiling or flagged by the scan is refused with the scan's message. - Pass an `ArrayBuffer` (`await blob.arrayBuffer()`). A `Blob`, a `Uint8Array` or an empty buffer is refused with `invalid image-upload request`. The buffer is copied, not transferred. `upload` **rejects** with the host's error string on every refusal: the ones above, `no block token`, or a server message passed through verbatim (the missing scope, the posting flag, page-only, a rate limit, the scan). It rejects with `the host returned no uploaded image` if the reply carries neither an image nor an error. If no reply arrives within 10 minutes it rejects with a `RequestTimeoutError`; the host may still have stored the image, so retrying after a timeout can create a duplicate. The hook ships in `@civitai/blocks-react` 0.67.0, and the `bytes` payload type it sends is in `@civitai/app-sdk` 0.62.0. What the upload does and does not give you on civitai.com: - 🔴 **Generation metadata embedded in the file is not read.** The posted image has no generation details (prompt, resources, sampler settings), whatever the PNG or JPEG carries. In the example below the healed pixels are posted, and the metadata the app repaired is not shown on the post. - 🔴 **Each uploaded image goes into exactly one post.** Once a post holds it, `createPost()` refuses that `imageId` with `an image is not available to post`. To post the same picture again, upload it again. - **An uploaded image never appears in `useGatedImages()`.** That read returns only what the app published with `usePublishGenerationOutputs()`. Keep the `imageId` and `url` that `upload` resolves with if you need to show it. - **A post holds at most 20 images and names at most 10 sources.** Past 20 images the server refuses with `a post may contain at most 20 images`. - **Posting from apps is still being rolled out.** A viewer who does not have it yet is refused with `posting from apps is not enabled`, and the refusal arrives from `upload` as well as from `createPost()`. Handle it as an ordinary error branch, not as a bug in your app. - **Creating the post needs an account with a verified email or a linked sign-in provider.** Other account checks apply too: onboarding must be finished, the account must not be brand new, and it must not be muted or banned. `upload` refuses a banned account but checks none of the rest, so a viewer can upload and then be refused at `createPost()`. - **Server-side limits also apply**, to the upload and to the post, beyond the host's per-page window above. A `busy` reply or a rate-limit error such as `Rate limit exceeded, please retry shortly.` means wait and retry.

```tsx
import {
  CreatePostError,
  useBlockToken,
  useCreatePostFromApp,
  useRequestConsent,
  useUploadImageBytes,
} from '@civitai/blocks-react';

function PostHealedButton({ healed }: { healed: Blob }) {
  const { scopes } = useBlockToken();
  const { requestConsent } = useRequestConsent();
  const { upload } = useUploadImageBytes();
  const { createPost } = useCreatePostFromApp();
  const canPost = scopes.includes('posts:write:self');

  async function onClick() {
    if (!canPost) {
      // Fire-and-forget: this opens the host's consent dialog and returns
      // nothing. On a grant the host pushes a new token, `scopes` updates and
      // the button re-renders as "Post". Never upload before that: the server
      // refuses the upload without the scope.
      requestConsent({ scopes: ['posts:write:self'] });
      return;
    }
    try {
      // 1. Bytes made in the tab, uploaded and scanned by the host.
      const image = await upload(await healed.arrayBuffer(), { filename: 'healed.png' });
      // 2. Posted through the existing bridge, with its own confirm.
      const post = await createPost({
        sources: [{ kind: 'published', imageIds: [image.imageId] }],
        title: 'Fixed with Metadata Healer',
      });
      showToast(`Posted! ${post.url}`);
    } catch (err) {
      if (err instanceof CreatePostError && err.declined) return; // the viewer said no
      showToast((err as Error).message); // e.g. 'busy', 'file type is not allowed'
    }
  }

  return <button onClick={onClick}>{canPost ? 'Post' : 'Allow posting'}</button>;
}
```

```md
Under `createMockHost` / `Harness` the host's checks run in the host's order:
the cap, then the window, then the type. `uploadImageBytesResult` sets the
image an accepted upload returns, `uploadImageBytesError` forces a refusal
(for example `block lacks posts:write:self scope`), and `onUploadImageBytes`
reports what was accepted. The mock's `CREATE_POST_FROM_APP` checks a
`published` source with the server's rule and refusal strings, but not its
data. Production accepts the viewer's own images that this app stamped and that
are not in a post yet, including ones from earlier sessions. The mock has no
earlier sessions, so it accepts only ids it issued as postable in this session
(an accepted bytes upload, or a `PUBLISH_GENERATION_OUTPUTS` reply) plus the
ids you seed with `createMockHost({ postableImageIds: [...] })`, each in one
post only. Any other id, a picked `useImageUpload()` id (production leaves it
unstamped) or an already-posted id is refused with
`an image is not available to post`. The mock does not model the page-only
rule, the scope check, the real scan, or an older host's picker. `dev:live` has
no bytes path: `upload` rejects with `the host returned no uploaded image`.
```

**`useImagePicker`**

```ts
useImagePicker(): UseImagePicker
```

```ts
interface UseImagePicker {
  open: { /** * Single pick. Resolves with the chosen image, or `null` when nothing was * picked. Rejects when the host refuses the request. */ (opts?: ImagePickerOpenOptions & { multiple?: undefined; }): Promise<BlockPickedImageInfo | null>; /** * Multi pick (see {@link ImagePickerMultiple}). Resolves with the picked * images, never more than `max`, or `[]` when nothing was picked. Each * entry is the same {@link BlockPickedImageInfo} a single pick returns. * Rejects when the host refuses the request. */ (opts: ImagePickerOpenOptions & { multiple: ImagePickerMultiple; }): Promise<BlockPickedImageInfo[]>; /** * A `multiple` decided at runtime, e.g. * `open({ multiple: many ? { max: 3 } : undefined })`. The result is a list * when `multiple` was set and a single image or `null` when it was not, so * narrow it with `Array.isArray`. */ (opts: ImagePickerOpenOptions & { multiple?: ImagePickerMultiple | undefined; }): Promise<BlockPickedImageInfo | BlockPickedImageInfo[] | null>; };
}
```

Let the viewer pick one of their **existing** Civitai images: the ones they have posted, and the ones they made with the Civitai generator. The host opens its own picker over the viewer's library, and your app receives only what the viewer picked. Returns `{ open }`. `open()` resolves with one image, or `null` if nothing was picked.

```tsx
const { open } = useImagePicker();

const image = await open();   // BlockPickedImageInfo | null
if (image) {
  // image.source     'posted' | 'generated'
  // image.url        a Civitai-hosted image URL
  // image.width, image.height
  // image.nsfwLevel  the image's rating; it can be a mature level
  // image.imageId    set for a posted image, undefined for a generated one
}
```

````md
**Several images in one session: `multiple: { max }`.** `open` then resolves with
a **list** of up to `max` images instead of a single image, or `[]` if nothing
was picked.

```tsx
const { open } = useImagePicker();

const images = await open({ multiple: { max: 5 } });
// [] when nothing was picked; otherwise 1 to 5 images
const urls = images.map((image) => image.url);
```

**One library only: `sources`.** Pass `['posted']` or `['generated']` to offer
just that library. Leave it out to offer both.

```tsx
const { open } = useImagePicker();

const output = await open({ sources: ['generated'] });
// output?.imageId is always undefined here: a generator output has no image id
```

If your app decides at runtime whether to ask for one image or several, pass
`multiple` as a value that may be `undefined`. The result is then either shape,
so narrow it with `Array.isArray`:

```tsx
const { open } = useImagePicker();

const picked = await open({ multiple: allowSeveral ? { max: 3 } : undefined });
const images = Array.isArray(picked) ? picked : picked ? [picked] : [];
```

What the viewer can pick, and what you get back:

- **The host decides what is pickable.** Posted images: the viewer's own, in a
  published post, fully scanned, not flagged and rated. Generated images: the
  viewer's own finished generator outputs that have a rating. In both cases the
  viewer is offered only what their own browsing settings on Civitai allow them
  to see. An unrated image is never offered. Images only, no video. Your app
  never sees the rest of the library.
- 🔴 **A pick can be a mature image.** `nsfwLevel` is the image's rating, and it
  is never `0`. The image was offered to this viewer under this viewer's own
  settings. That says nothing about anyone else. If your app shows a pick to
  anybody other than the viewer who picked it (a shared board, a gallery, a
  public post), it is your app's job to check `nsfwLevel` and decide who may
  see it.
- **`imageId` is set only on a posted image.** A generator output that was never
  posted has no image id, so check `image.source` or `image.imageId` before you
  use it.
- **A posted pick's `url` is a resized copy, not the original file.** `width` and
  `height` are the size that copy is requested at. The host chooses one with both
  sides between 64 and 2048 pixels, and a small original is scaled up. The image
  server normally returns exactly that size, but it can return the original
  while the resized copy is still being produced. A posted image that has no
  size in that range (a very long or very wide one) is not offered.
- 🔴 **A generated pick's `url` is the generator's own output link and may stop
  working after a while.** Use it soon after the pick and do not store it for
  later. Its `width` and `height` are the output's own size.

What `open` resolves and rejects with:

- **`null` (or `[]` with `multiple`) means nothing was picked.** Usually the
  viewer closed the picker. A signed-out viewer sees the picker with a sign-in
  button, and closing it gives the same result. The host also answers this way
  immediately, without showing a picker, while your app is being viewed in
  review mode or is not ready yet.
- **`max` is a whole number of at least 1, capped at 20** (exported as
  `IMAGE_PICKER_MULTIPLE_MAX`). A larger value is clamped to 20. `0`, a negative
  number or a fraction rejects before anything is sent, and so does an empty
  `sources` or a value other than `'posted'` and `'generated'`.
- **A refusal rejects.** If the host refuses the request, `open` rejects with an
  `Error` carrying the host's message. It never resolves with `null` for a
  refusal.
- **Page apps only.** On any other surface the host answers at once and `open`
  rejects with `unsupported on this host`.
- **On a host that does not have the picker yet**, the request gets no answer and
  `open` rejects with a `RequestTimeoutError` after 10 minutes.

Using a pick as the source image of a generation: a pick's `url` is hosted by
Civitai, so `{ url, width, height }` passes the address check a generation body
makes on its `sourceImage`. That is the only thing this hook settles. The
generation body has its own rules, including 64 to 2048 pixels per side. A posted
pick is already within that range. A generated pick can be larger, and a
generation body refuses a size above 2048.

With the mock host (`createMockHost` or `Harness` from
`@civitai/blocks-react/testing`) there is no picker to click through: `open`
resolves at once. By default the mock holds one posted image and one generated
image. Pass `cannedImagePicks: [...]` to set the viewer's library. The mock keeps
only the images matching the request's `sources`, then answers a single pick with
the first one and a `multiple` pick with the first `max`. `cannedImagePicks: null`
is a viewer who always closes the picker. Like the host, the mock offers a
repeated image once and drops an `imageId` from a generated image. It does not
model browsing settings or ratings: it returns whatever `nsfwLevel` you give an
image, so use that to test how your app handles a mature pick. The mock refuses
an invalid `sources` or `multiple` with an error, and answers
`unsupported on this host` when its `context` is a model slot. `dev:live` cannot
list the viewer's images, so there `open` rejects with a message saying to use
the mock host.
````

**`useMediaUpload`**

```ts
useMediaUpload(): UseMediaUpload
```

```ts
interface UseMediaUpload {
  open: (options: MediaUploadOpenOptions) => Promise<BlockMediaUploadInfo | null>;
  upload: (options: MediaUploadBytesOptions) => Promise<BlockMediaUploadInfo>;
}
```

\**The way to pass any media (image, video or audio) into a workflow step.** The host refuses data URIs and inline base64 in step inputs, so upload the file with this hook and pass the `url` it returns into the step input. Returns `{ open, upload }`. - **`open({ kind })`** opens the host's own file picker for that kind. The viewer picks a file, the host uploads it, and `open` resolves with the upload, or `null` if nothing was uploaded. - **`upload({ kind, bytes, mimeType? })`** uploads media your app already holds in the tab, with no picker: a canvas export, a crop, a `MediaRecorder` recording. It resolves with the upload, and never resolves without one.

```tsx
import { useMediaUpload } from '@civitai/blocks-react';

function UseRecording({ recording }: { recording: Blob }) {
  const { upload } = useMediaUpload();

  async function onClick() {
    const audio = await upload({
      kind: 'audio',
      bytes: await recording.arrayBuffer(),
      mimeType: recording.type, // optional; checked against the content
    });
    // audio.url goes into the step's audio input
    startStep({ audioUrl: audio.url });
  }

  return <button onClick={onClick}>Use this recording</button>;
}
```

````md
```tsx
const { open } = useMediaUpload();

const video = await open({ kind: 'video' }); // BlockMediaUploadInfo | null
if (video) {
  // video.url, video.width, video.height, video.durationMs (when known)
}
```

What each kind accepts, decided by the file's **content** (its first bytes),
never by its name or declared type:

| `kind` | Accepted | What you get back |
|---|---|---|
| `'image'` | PNG, JPEG, WebP | Resized so both sides are 64 to 2048 pixels and re-encoded as JPEG: `mimeType` is always `'image/jpeg'`, and `sizeBytes`, `width` and `height` describe that JPEG. |
| `'video'` | MP4, WebM | Uploaded as sent. `width` and `height` are always set (a file with no video track is refused). `durationMs` when the browser reports a duration. |
| `'audio'` | MP3, WAV, WebM | Uploaded as sent. No `width` or `height`. `durationMs` when the browser reports a duration: a `MediaRecorder` WebM often reports none, so do not rely on it. |

- **At most 24 MB per image, and 64 MB per video or audio file.** The image
  cap is lower because the host decodes an image in full before it resizes it.
  `upload` refuses a larger buffer before sending it, with the host's own
  message: `file exceeds the 24 MB image upload limit` or
  `file exceeds the 64 MB upload limit`.
- **`upload` is rate-limited:** at most 8 uploads and 128 MB per 60 seconds
  per page. Past that the host replies `busy`; wait and retry. A refused upload
  does not count. `open` is not limited this way, because a person picks each
  file.
- **`mimeType` is optional.** When you pass it (for example `blob.type`) it
  must match the content, or the upload is refused with
  `mimeType does not match the file's content`. Case and parameters such as
  `;codecs=opus` are ignored, and `audio/x-wav` counts as `audio/wav`.
- Pass an `ArrayBuffer` (`await blob.arrayBuffer()`). A `Blob`, a typed array
  or an empty buffer is refused before sending with
  `invalid media-upload request`. The buffer is copied, not transferred.
- A file whose content is not one of its kind's types is refused with
  `images must be PNG, JPEG or WebP`, `videos must be MP4 or WebM` or
  `audio must be MP3, WAV or WebM`. The host also refuses a file it cannot
  read (`could not read this video file`, `could not read this audio file`), a
  video with no video track (`this file has no video track`), and an image too
  small to resize to 64 pixels. A failed upload rejects with
  `media upload failed — please try again`, and a file the upload service
  refuses with `this video was refused by the upload service` or
  `this audio was refused by the upload service`. A bytes upload made while
  the host holds no block token rejects with `no block token`.

What `open` and `upload` resolve and reject with:

- **`open` resolves `null` when nothing was uploaded.** Usually the viewer
  closed the picker. The host also answers that way at once, without showing a
  picker, while your app is viewed in review mode or is not ready yet. A
  problem with the picked file is shown in the picker, where the viewer can
  pick another one.
- **`upload` never resolves `null`.** When the host declines without
  uploading (review mode, not ready), `upload` rejects with
  `the host did not upload the media (the app is in review mode or not ready)`.
- **A refusal rejects** with the host's message, in both modes. On a surface
  other than a page app the host answers at once with
  `unsupported on this host`.
- **Both wait up to 10 minutes** for the host (a person picking a file, or a
  large upload), then reject with a `RequestTimeoutError`.

For images only, `useImageUpload().open({ purpose: 'generationSource' })` still
works and returns `{ url, width, height }`. Use `useMediaUpload` for video,
audio, or bytes your app made in the tab.

🔴 **Needs a host that answers `OPEN_MEDIA_UPLOAD`** (civitai/civitai#6149).
On a civitai.com that predates it, the request gets no answer and both calls reject with a
`RequestTimeoutError` after 10 minutes.

With the mock host (`createMockHost` or `Harness` from
`@civitai/blocks-react/testing`) there is no picker: `open` resolves at once
with a built-in upload for the kind. Set `cannedMediaUploads: { video: {...} }`
to choose what a kind returns, or `{ audio: null }` for a viewer who closes
that picker. `upload` runs the host's checks in the host's order (kind,
purpose, an invalid buffer, the per-kind cap, the rate window, the content type,
a mismatching `mimeType`) and answers with that kind's upload, carrying the
sniffed `mimeType` and the buffer's size for video and audio. The mock cannot
decode media, so it never produces the host's decode-time refusals (an
unreadable file, no video track, an image too small, an upload failure): set
`mediaUploadError: 'this file has no video track'` to force one.
`mediaUploadError: 'no block token'` is checked where the host checks it: a
bytes upload is refused before the cap and the window, and is not counted. A model-slot
`context` answers `unsupported on this host`. `dev:live` cannot upload
generation inputs, so there both calls reject with a message saying to use the
mock host.
````

**`useSaveImage`**

```ts
useSaveImage(): UseSaveImage
```

```ts
interface UseSaveImage {
  saveImage: (input: SaveImageInput) => Promise<void>;
}
```

Ask the host to download a file to the viewer's device. **A block cannot download anything itself.** Its sandbox lacks `allow-downloads`, and the validator refuses that token for unverified blocks, so an `<a href="blob:…" download>` click silently does nothing. 🔴 **This hook is the sanctioned way to deliver a file**, including one the block produced in the tab. Pass exactly ONE of three inputs, each gated differently by the host: - **`{ url }`**: the block's own generation output. The host allowlists the origin to the civitai image CDN and refuses any other. - **`{ imageId }`**: an image from another user, read through the same per-viewer gate as `useGatedImages()`. A withheld image is never saved. - **`{ bytes }`**: an `ArrayBuffer` the block made in the tab, such as a healed image or a JSON sidecar. 🔴 **Page apps only.** The host classifies it by CONTENT. It accepts PNG, WebP and JPEG by magic bytes. Anything else must be valid UTF-8 with no NUL byte: it is saved as JSON when it parses and `filename` ends `.json` (any case) once the host has replaced each `?` and `#` with `_`, and as plain text otherwise. A GIF, a zip or other binary is refused with `file type is not allowed`. The host forces the extension from the classified type. The cap is 50 MiB, and the hook refuses a larger buffer before sending it: `file exceeds the maximum save size`. The buffer is copied, not transferred, so you can keep displaying it. 🔴 **On a host that predates the `bytes` variant, `saveImage({ bytes })` rejects with `invalid save-image request`.** The host also replies that when the input is not exactly one variant, or when `bytes` is empty or not an `ArrayBuffer`. Pass `await blob.arrayBuffer()`, not the `Blob` or a `Uint8Array`. The promise resolves once the host has started the download. On any refusal it rejects with the host's error string, which can also be `busy` when too many saves are in flight.

```tsx
import { useSaveImage } from '@civitai/blocks-react';

const { saveImage } = useSaveImage();

// A file healed in the tab. It never leaves the device except to the viewer's disk.
const healed: Blob = await healPngMetadata(file);
await saveImage({ bytes: await healed.arrayBuffer(), filename: 'healed.png' });

// Its JSON sidecar. The .json filename makes valid JSON save as .json rather than .txt.
const sidecar = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
try {
  await saveImage({ bytes: sidecar.slice().buffer, filename: 'healed.json' });
} catch (err) {
  // 'invalid save-image request' here means this host cannot save bytes yet.
  setStatus(`Could not save the sidecar: ${(err as Error).message}`);
}

// The block's own generation output, or another user's image.
await saveImage({ url: output.url, filename: 'render.png' });
await saveImage({ imageId: cell.imageId });
```

```md
Under `createMockHost` / `Harness` the `bytes` variant is classified the same
way. `onSaveBytes` reports what would have been downloaded, and `saveImageError`
forces a refusal. Pass `saveImageError: 'invalid save-image request'` to test a
host without the variant. `dev:live` refuses every save.
```

<!-- END GENERATED: hooks/storage-and-media -->
</HooksReference>
