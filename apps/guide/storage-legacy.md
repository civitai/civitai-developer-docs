---
title: Moving from the legacy stores
description: The legacy useAppStorage / useSharedStorage stores and their app-storage / shared-storage routes, shut down on 2026-11-10 — how each legacy call maps onto the document store, keys that do not carry over, authorship and votes on a legacy board, and how item keys resolve once an app declares a shared collection.
sources:
  - npm:@civitai/sdk@0.29.1#README
  - civitai:src/server/services/apps/doc-store-api.ts
---

# Moving from the legacy stores

`useAppStorage` and `useSharedStorage` in `@civitai/blocks-react`, the matching
`app.storage.get/set/delete/list/getQuota` and `app.sharedStorage` methods in
`@civitai/sdk`, and the routes under `/api/v1/blocks/app-storage/*` and
`/api/v1/blocks/shared-storage/*` are **deprecated and shut down on
2026-11-10**. Until then they keep working, with their scopes
(`apps:storage:read`, `apps:storage:write`, `apps:storage:shared:read`,
`apps:storage:shared:write`). From 2026-11-10 the legacy REST routes answer
**HTTP `410 Gone`**, and the legacy hooks, bridge messages and SDK methods stop
working: their calls fail with an error. Move your app to the document store
before that date.

**Nothing is copied automatically.** The document store starts empty; data in
the legacy stores stays there. If your app has data viewers care about, you
have two options:

- **Copy it yourself before 2026-11-10**: read it from the legacy store and
  write it into a collection, as described below. After 2026-11-10 the app can
  no longer read the legacy store. A self-copy has two limits:
  - **Per-viewer data** can be read only with that viewer's own token, so the
    copy runs inside the app as each viewer opens it. Only viewers who open the
    app before 2026-11-10 are moved; everyone else's data is left behind.
  - **Shared data** copied by the app is authored by whoever runs the copy, so
    that viewer becomes the author of every copied row (see
    [Authorship](#shared-storage-usesharedstorage) below). The original
    authors no longer own their rows, so they cannot edit or withdraw them or
    publish them as [sub-listings](./sub-listings), which need an item the
    viewer authored.
- **Ask Civitai to copy it at cutover.** On request, Civitai can copy an app's
  legacy data into its document store when the legacy stores shut down. The
  cutover copy keeps each row's key, author and hidden state, and runs on
  Civitai's side, so it does not wait for each viewer to open the app. This is not
  automatic: contact the Civitai team (or your Civitai contact) before
  2026-11-10. **For shared data, ask for the cutover copy.**

### Per-viewer storage (`useAppStorage`)

Declare a `private` collection and the `apps:storage` scope.

| Legacy | Document store |
|---|---|
| `set(key, value)` | `put(key, data)` — `data` must be a JSON object, so wrap a scalar: `{ value }` |
| `get(key)` | `get(key)` — the value is the document's `data` |
| `delete(key)` | `delete(key)` |
| `list({ prefix, cursor })` | `list({ keyPrefix, cursor })` — whole documents, not just keys |
| `getQuota()` | `app.storage.info()` — `usage.viewer` and `limits` |
| the legacy byte, row and key-length messages | [error codes](./storage#errors) |

**Keys may not carry over as they are.** A legacy key is any string of 1 to 200
characters, while a document key is limited to the characters and length in the
[limits table](./storage#limits). A legacy key with a `/`, a space or any other character
outside that set, or one longer than the limit, is refused `invalid_request`, so
map such keys (hash them, for example) when you copy. A viewer's legacy data can
be read only with that viewer's own token, so the copy runs per viewer, inside
the app, as each viewer opens it — and only viewers who open the app before
2026-11-10 are copied. The cutover copy has no such limit.

### Shared storage (`useSharedStorage`)

Declare a `shared` collection with `write: "own"`, a
[viewer-keyed](./storage#viewer-keyed) `votes` collection (`keyedBy: "parent+viewer"`)
if you had voting, and both scopes; `apps:storage:publish` replaces
`apps:storage:shared:write` and needs a `scopeJustifications` entry.

| Legacy | Document store |
|---|---|
| `append({ title, body?, data? })` | `create(data)` — put what you stored in `title`, `body` and `data` into the document's `data`; every string in it is moderated |
| `list({ limit, cursor })` (newest first) | `list({ sort: '-createdAt', limit, cursor })` |
| `list({ mine: true })` (REST) | `list({ author: 'me' })` |
| `get(key)` | `get(key)` |
| `update(key, value)` | `put(key, data)`, by the author |
| `withdraw(key)` | `delete(key)`, by the author |
| `vote(key)` / `unvote(key)` | `votes.putMine({}, { parent: key })` / `votes.deleteMine({ parent: key })` |
| `count` on an item, `getCount(key)`, `getCounts(keys)` | count `votes.list({ keyPrefix: key + ':' })`, one list per item ([Counting](./votes-and-reports#viewer-keyed-counting)) |
| `viewerVoted` on an item | `votes.getMine(key)` is not `null`; for many items, one `votes.list({ author: 'me' })` |
| `authorUserId` on an item | `author` (`isViewer`, and `username` when the collection sets `showAuthor`); no user id |
| `report(key, reason?)` | `app.moderation.report({ collection, key })` ([Reporting](./votes-and-reports#reporting)) — no free-text reason, and it cannot be withdrawn |

Two things do not carry over from a legacy board:

- **Authorship.** A shared document is authored by the viewer whose token
  created it, and there is no app-owned write yet (`write: "owner"` is
  reserved). Copying a legacy board makes whoever runs the copy the author of
  every copied document: each one counts toward that viewer's quota and spends
  their shared write budget, and no other viewer can edit or delete it. To keep
  the original authors, ask for the cutover copy before 2026-11-10; otherwise
  read or copy the old rows before that date, or have each author post again.
  The legacy store cannot be read after 2026-11-10.
- **Votes.** A vote is the voter's own document, so legacy vote counts cannot
  become votes. They start at zero.

Two things resolve an item key the app supplies:

- **[App Store sub-listings](./sub-listings)**: `itemKey` names the item being
  listed.
- **`sharedContentKey`** on a [`textToImage` body](../reference/generation/bodies):
  it resolves the item's author.

Which store answers is decided by the app's **approved** manifest. Once it
declares a shared collection that viewers write (`write: "own"`), the key is
looked up in the document store only: it must name one production document in
such a collection, a key found in two of them names nothing, and the legacy
shared store is no longer read, even for old keys. A `write: "none"` collection
(deprecated; counters and marks only) is never searched. An app whose approved manifest
declares no such collection still resolves keys from the legacy shared store,
which shuts down on 2026-11-10, so move listable items into a shared collection
before then.

