---
title: Store items (sub-listings)
description: How an app publishes items its viewers made — one generator, one preset — as their own cards in the /apps store, under the viewer's name. The apps:store:items:write scope, the three block REST routes, their limits and error codes, and the moderator review every item goes through.
sources:
  - civitai:src/pages/api/v1/blocks/sub-listings/upsert.ts
  - civitai:src/pages/api/v1/blocks/sub-listings/withdraw.ts
  - civitai:src/pages/api/v1/blocks/sub-listings/mine.ts
  - civitai:src/server/services/blocks/app-sub-listing.service.ts
  - civitai:src/shared/constants/app-sub-listing.constants.ts
---

# Store items (sub-listings)

An app can place individual items it contains into the
[`/apps` store](https://civitai.com/apps) as **their own cards**, badged
"in ‹your app›". A store item is something a viewer made inside your app and
saved to your app's [shared storage](../reference/scopes) — one generator, one
preset — and it is published **by that viewer, under their name**. Opening the
card runs your app at a sub-path you choose:

```
/apps/run/<your-app-slug>/<subPath>?sl=<store-item-id>
```

The server builds that link; your app supplies only `subPath`.

::: warning Not self-serve, and not yet public
- **Your app must be enabled for store items by Civitai.** It is a per-app
  switch, and it carries a per-author cap on how many items one viewer can have
  in the store. No CLI command or manifest field turns it on; until it is on,
  every publish answers `403 not_enabled`.
- **Store items are in a moderator-only preview** (October 2026): the `/apps`
  store mixes approved items in for Civitai moderators, and shows everyone else
  app cards only. Publishing and review work the same either way.
:::

## What your manifest needs

Declare the scope and justify it. `apps:store:items:write` is
**sensitive** — it writes a card every store visitor sees, under the viewer's
name — so a manifest without a `scopeJustifications` entry for it is
rejected at submit (and by `civitai app validate`):

```json
{
  "scopes": ["apps:storage:shared:read", "apps:storage:shared:write", "apps:store:items:write"],
  "scopeJustifications": {
    "apps:storage:shared:write": "Authors save their presets to the app's shared gallery.",
    "apps:store:items:write": "Authors can list a preset they made as its own App Store card."
  }
}
```

Three properties of the scope decide how you call it:

- **Consent-exempt.** There is no consent prompt and nothing to
  `requestGrants` for: the server's per-call checks below are the gate. See
  [consent gating](../reference/scopes#what-this-table-can-t-show-the-server-enforces-more).
- **Signed-in viewers only.** An anonymous viewer's token is refused (`403`)
  before the route runs, so gate the publish control on a signed-in viewer.
- **Never minted for dev-token, dev-tunnel or review sessions.** A token from
  `civitai app dev-token`, `dev:live` or a reviewer's session never carries it,
  so these routes can only be exercised from an **approved** version of your
  app. Build the publish path so its refusal degrades quietly.

The item itself must already exist in your app's shared storage, so in practice
the app also holds `apps:storage:shared:write`.

## The routes

All three take the block token, live under `/api/v1/blocks/sub-listings/`, and
act on **the calling app's own listing**, taken from the token — there is no
field that names another app.

| Route | Body | Returns |
|---|---|---|
| `POST /api/v1/blocks/sub-listings/upsert` | `itemKey`, `title`, `tagline?`, `imageId?`, `subPath`, `contentRating?` | `{ id, status, pendingEdit }` |
| `POST /api/v1/blocks/sub-listings/withdraw` | `itemKey` | `{ ok, withdrawn }` |
| `GET /api/v1/blocks/sub-listings/mine` | — | `{ items }` — the viewer's own items for this app, with review status |

With [`@civitai/sdk`](./sdk#app-site-the-rest-api):

```ts
import { ApiError, initialize } from '@civitai/sdk';

const app = await initialize();

try {
  const item = await app.site.post('blocks/sub-listings/upsert', {
    itemKey: 'preset-7f3a', // the key of the viewer's own shared-storage row
    title: 'Moody film portraits',
    subPath: 'p/preset-7f3a', // opens /apps/run/<your-app-slug>/p/preset-7f3a
  });
  // item: { id, status: 'pending', pendingEdit: false }
} catch (error) {
  if (error instanceof ApiError) {
    // error.body is { error, code } — branch on `code`, not on the sentence.
  }
}
```

### `upsert` — the fields

The body is **strict**: an unknown key is a `400 invalid_body`, so leave an
optional field out rather than sending it as `null` or `''`. The body may be
at most 8 KB.

| Field | Rule |
|---|---|
| `itemKey` | 1–64 characters: the key of a row in **your app's shared storage** that the viewer **authored** and that is not hidden. One store item per key; publishing the same key again edits it. |
| `title` | 1–80 characters after cleaning. Must pass the same text-safety check as shared-storage posts (`400 text_rejected`). |
| `tagline` | Optional, at most 140 characters, same check. |
| `imageId` | Optional. An image **the viewer uploaded** (`403 image_not_yours` otherwise) that is **publicly visible** — in a published, non-private post, and reviewed — else `400 image_not_public`. Without one, the card shows your app's cover. |
| `subPath` | One to four `/`-separated segments of letters, digits, `_` and `-`, each at most 64 characters (128 in all). No dots, `%`, `?`, `#` or empty segment. |
| `contentRating` | Optional: `g`, `pg`, `pg13`, `r` or `x`, **no less mature than your app's own rating** (`400 rating_too_loose`). Omitted, the item inherits your app's rating; the card is always shown under the stricter of the two. |

### `withdraw` and `mine`

`withdraw` takes the viewer's own item out of the store. `withdrawn: false`
means there was nothing of theirs to withdraw — or a moderator has hidden it,
which the app cannot change. You rarely need it: when the author withdraws or
deletes the shared-storage row the item came from, the server withdraws the
store item itself, and a moderator hiding or deleting that row hides it (both
best-effort, so `mine` is the place to reconcile).

`mine` returns up to 200 items, oldest first, each
`{ id, itemKey, status, title, pendingEdit, statusReason, editRejectionReason, updatedAt }`
— enough to show "In the store: pending review" next to the item and to
reconcile after the fact.

## Review: every item waits for a moderator

There is no auto-approve. An item's `status` is one of:

| `status` | Meaning |
|---|---|
| `pending` | New, or republished after a withdraw. Not in the store until a moderator approves it. |
| `approved` | In the store. |
| `hidden` | A moderator took it down. **The app cannot lift this** — an `upsert` returns `status: 'hidden'` and changes nothing. |
| `withdrawn` | The author (or the server, following the shared row) took it out. Publishing it again returns it to `pending`. |

**Editing an approved item does not take it out of the store.** The edit is
staged — `pendingEdit: true` — while the card keeps serving the last approved
version, until a moderator approves the edit or rejects it (the reason comes
back as `editRejectionReason` from `mine`). A newer edit replaces a staged one,
and an edit identical to the live version clears it.

## Limits and errors

- **30 writes an hour and 100 a day**, per viewer per app — `upsert` and
  `withdraw` draw on the same allowance.
- **A per-author cap** on pending + approved items, set when your app is
  enabled.

A refusal is a JSON body `{ error, code }`. Branch on `code`; `error` is a
server sentence, not copy for your UI.

| Status | `code` | When |
|---|---|---|
| `400` | `invalid_body` | the body failed validation — an unknown key, an out-of-range field, a bad `subPath` |
| `400` | `text_rejected` | the title or tagline did not pass the text-safety check |
| `400` | `image_not_public` | `imageId` is not a publicly visible image |
| `400` | `rating_too_loose` | `contentRating` is less mature than your app's rating |
| `403` | `not_enabled` | your app is not enabled for store items |
| `403` | `untrusted` | the viewer's account does not yet clear the shared-storage write trust gate |
| `403` | `not_your_item` | the shared row, or the existing store item, belongs to someone else |
| `403` | `image_not_yours` | `imageId` is someone else's image |
| `404` | `item_not_found` | no live shared-storage row with that `itemKey` |
| `409` | `conflict` | the item kept changing under the write — retry |
| `429` | `rate_limited` | over the hourly or daily allowance; honour `Retry-After` |
| `429` | `author_cap` | the viewer already has the maximum number of items in the store for your app |
| `503` | `unavailable` | store items are temporarily unavailable — retry later |

A `403` whose `code` is not in this table comes from the token, before the
route runs — `insufficient_scope` (the token does not carry the scope, as in any
dev or review session) or `context_binding` (an anonymous viewer). Those codes
are listed under
[scope and permission refusals](./earning#scope-and-permission-refusals-—-the-code-key).

## Next

- [Scopes reference](../reference/scopes) — `apps:store:items:write` beside
  every other scope.
- [Your store listing](./store-listing) — your app's own card, which a store
  item is shown under.
