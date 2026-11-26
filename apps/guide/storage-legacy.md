---
title: Moving from the legacy stores
description: The legacy useAppStorage / useSharedStorage stores and their app-storage / shared-storage routes were shut down on 2026-11-10 (410 Gone, legacy_store_removed) — how each legacy call maps onto the document store, keys that do not carry over, what did not carry over from a legacy board, and how item keys resolve once an app declares a shared collection.
sources:
  - npm:@civitai/sdk@0.33.0#README
  - civitai:src/server/services/apps/doc-store-api.ts
---

# Moving from the legacy stores

`useAppStorage` and `useSharedStorage` in `@civitai/blocks-react`, the matching
`app.storage.get/set/delete/list/getQuota` and `app.sharedStorage` methods in
`@civitai/sdk` (removed from the SDK in 0.33.0), and the routes under `/api/v1/blocks/app-storage/*` and
`/api/v1/blocks/shared-storage/*`, with their scopes (`apps:storage:read`,
`apps:storage:write`, `apps:storage:shared:read`, `apps:storage:shared:write`),
were **shut down on 2026-11-10**. The legacy REST routes answer
**HTTP `410 Gone`**, and every call through the legacy hooks, bridge messages
and SDK methods is refused `legacy_store_removed`. An app that still uses them
moves to the [document store](./storage).

**Nothing was copied automatically**, and an app can no longer read the legacy
stores itself, so there is nothing left to copy from inside the app. If your app
had legacy data viewers care about, ask the Civitai team (or your Civitai
contact) about it.

The tables below map each legacy call onto the document store.

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
an app that used such keys maps them (hashes them, for example).

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

Two things did not carry over from a legacy board:

- **Authorship.** A shared document is authored by the viewer whose token
  created it, and there is no app-owned write yet (`write: "owner"` is
  reserved), so an app cannot write a document on behalf of a legacy row's
  author: each author posts again.
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
(removed; read-only) is never searched. An app whose approved
manifest declares no such collection resolves keys from the legacy shared store,
which was shut down on 2026-11-10: declare a shared collection and keep listable
items there.

