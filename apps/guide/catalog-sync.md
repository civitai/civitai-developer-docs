---
title: App Store catalog sync
description: Keeping an off-site app's own items in the /apps store as their own cards, server to server — the AppStoreCatalogWrite client-credentials token, PUT/DELETE/GET /api/v1/catalog/items, attribution, review, limits and error codes.
sources:
  - civitai:src/pages/api/v1/catalog/items/index.ts
  - civitai:src/pages/api/v1/catalog/items/[externalId].ts
  - civitai:src/server/services/blocks/app-sub-listing-catalog-auth.ts
  - civitai:src/server/services/blocks/app-sub-listing.service.ts
  - civitai:src/server/services/blocks/app-sub-listing-store.service.ts
  - civitai:src/shared/constants/app-sub-listing.constants.ts
  - civitai:src/server/utils/shared-storage-rate-limit.ts
  - civitai:src/server/services/apps/shared-content-safety.ts
  - civitai:src/server/auth/bearer-token.ts
  - civitai:apps/auth/src/lib/server/oauth/model.ts
  - civitai:apps/auth/src/lib/server/oauth/scope.ts
  - civitai:docs/auth/oauth-developer-docs.md
---

# App Store catalog sync

An **off-site** app — one whose store listing points at your own site rather
than a block that runs on Civitai — can put the items **on your platform** into
the [`/apps` store](https://civitai.com/apps) as their own cards, badged
"in ‹your app›": the games on a games site, say. These are
[sub-listings](./sub-listings) of your listing, but instead of a viewer
publishing them from inside a block, **your server** keeps the store in step
with its own catalog, using an OAuth client acting as itself.

Opening one of these cards opens **your site** in a new tab, at a link Civitai
builds from a template you agree with Civitai, e.g.

```
https://games.example.com/?game={id}
```

with `{id}` replaced by the item's id on your platform.

::: warning Not self-serve, and not yet public
- **Civitai sets this up for you.** Your off-site listing must be approved and
  linked to your OAuth client, enabled for sub-listings (with a per-creator cap
  on items), and given its link template; your client must be
  [confidential](/site/oauth/register-app), allowed the `client_credentials`
  grant and allowed the `AppStoreCatalogWrite` scope. These are set by Civitai,
  not from the CLI or the manifest — ask Civitai to enable catalog sync for
  your listing. Until it is on, the token request below is
  refused, or every catalog call answers `403 not_enabled`.
- **Sub-listings are in a moderator-only preview** (October 2026), as described
  on [App Store sub-listings](./sub-listings): the store shows approved items
  to Civitai moderators only. Syncing and review work the same either way.
:::

The link template is an `https://` URL with exactly one `{id}`. Civitai builds
every card's link from it and only accepts a result that stays on the
template's origin, so an item id can never send a viewer elsewhere.

## Get a token

Use the [`client_credentials` grant](/site/oauth/endpoints#grant-client-credentials)
from your server, and ask for `AppStoreCatalogWrite` explicitly:

```bash
curl -X POST https://auth.civitai.com/api/auth/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=$CIVITAI_CLIENT_ID" \
  -d "client_secret=$CIVITAI_CLIENT_SECRET" \
  -d "scope=268435456"
```

- **Always send `scope=268435456`.** The token carries what you ask for plus
  `UserRead`; leave `scope` out (or send a value that is not a valid scope
  number) and you silently get `UserRead` alone, which every catalog call
  refuses with `403 insufficient_scope`.
- **No other scope can ride along.** A `client_credentials` token may carry
  only `AppStoreCatalogWrite` and `UserRead`; asking for anything else is
  `invalid_scope`. Conversely, `AppStoreCatalogWrite` is never issued by
  `/authorize`, so it never appears on a consent screen.
- **One hour, no refresh token.** The response has `expires_in: 3600` and no
  `refresh_token`. Cache the token and mint a new one shortly before it
  expires, or on a `401`.
- **Single-purpose.** The token is accepted on the catalog endpoints below and
  refused as a credential everywhere else on the API.

The token stands for your client, on the account that owns it. Keep the client
secret on your server: this is a server-to-server integration.

## The endpoints

Every call sends `Authorization: Bearer <access token>`. The token is read from
that header only — cookies are not read, and a request that also carries
`?token=` is refused `401`.

Your **client selects the listing**: the one approved, off-site listing linked
to it and enabled for catalog sync. Nothing in the path or body names it.

| Route | Body | Returns |
|---|---|---|
| `PUT /api/v1/catalog/items/{externalId}` | `title`, `tagline?`, `imageId?`, `contentRating?`, `creatorUserId?` | `{ id, status, pendingEdit, href }` |
| `DELETE /api/v1/catalog/items/{externalId}` | — | `{ ok, withdrawn }` |
| `GET /api/v1/catalog/items?cursor=` | — | `{ items, nextCursor }` |

`externalId` is the item's id on **your** platform: 1–64 letters, digits, `_`
or `-`. It is both the item's key in the store (one card per id; a `PUT` of the
same id edits it) and the value that replaces `{id}` in its link.

### `PUT` — publish or edit an item

```bash
curl -X PUT https://civitai.com/api/v1/catalog/items/neon-drift \
  -H "Authorization: Bearer $CATALOG_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Neon Drift","tagline":"Arcade racing after midnight","contentRating":"pg"}'
```

```json
{
  "id": "…",
  "status": "pending",
  "pendingEdit": false,
  "href": "https://games.example.com/?game=neon-drift"
}
```

`href` is the link the card opens. The body is JSON (send
`Content-Type: application/json`), **strict** — an unknown key is
`400 invalid_body` — and at most 8 KB. An optional field may be left out or
sent as `null`.

**A `PUT` replaces the whole item; it does not patch it.** An optional field
you leave out is stored as empty, so an edit that sends only `title` clears the
item's tagline and image and resets its rating to your listing's. Send every
field on every `PUT`.

| Field | Rule |
|---|---|
| `title` | 1–80 characters after cleaning (invisible and control characters removed, whitespace collapsed). Must pass the same text-safety check as shared-storage posts (`400 text_rejected`). |
| `tagline` | Optional, at most 140 characters after cleaning, same check. |
| `imageId` | Optional: the id of a Civitai image to show on the card. It must have been uploaded by the item's creator (see [Who an item is attributed to](#who-an-item-is-attributed-to)), else `403 image_not_yours`, and be publicly visible: in a published, non-`Private` post on Civitai and reviewed, else `400 image_not_public`. |
| `contentRating` | Optional: `g`, `pg`, `pg13`, `r` or `x`, **no less mature than your listing's own rating** (`400 rating_too_loose`). Omitted, the item inherits your listing's rating; the card is always shown under the stricter of the two. |
| `creatorUserId` | Optional: the Civitai user id to show as the item's creator. See [Who an item is attributed to](#who-an-item-is-attributed-to). |

**The card image.** With an `imageId`, the card shows that image — but only to a
viewer it is cleared for: the check runs again on every render, so if the
image's post is later made private or unpublished, or the image is more mature
than the card or the viewer's settings, the card falls back to your listing's
cover. Without one, the card always shows your listing's cover. The image has
to be on Civitai already: there is no upload through this API, so the creator
posts it on Civitai first.

A `PUT` follows the same review rules as an in-app publish:

- A **new** item, or a withdrawn one sent again, is `pending` until a moderator
  approves it.
- An edit to an **approved** item is staged (`pendingEdit: true`) while the card
  keeps serving the approved version, until a moderator approves or rejects the
  edit.
- A **hidden** item answers `200` with `status: "hidden"` and is not changed —
  a moderator's hide is a lock your platform cannot lift.
- An **identical re-sync** (a pending or approved item, with no staged edit,
  sent the content it already has) writes nothing and does not count against the
  rate limit, so it is safe to re-send your whole catalog. Re-sending an
  approved item's live content while it has a staged edit is not a no-op: it
  discards the staged edit (`pendingEdit: false`).

### `DELETE` — take an item out of the store

```bash
curl -X DELETE https://civitai.com/api/v1/catalog/items/neon-drift \
  -H "Authorization: Bearer $CATALOG_TOKEN"
```

`{ "ok": true, "withdrawn": true }` means a pending or approved item left the
store. `withdrawn: false` means there was nothing to withdraw — an unknown or
already-withdrawn id (neither changes anything nor counts against the rate
limit) — or the item is hidden. A `DELETE` withdraws the item whoever it is
attributed to, and never lifts a hide; a hidden item you have deleted can
afterwards only be restored to review, not straight back into the store. A
later `PUT` of a withdrawn id republishes it, and it waits for a moderator
again.

### `GET` — list what the store holds

```bash
curl "https://civitai.com/api/v1/catalog/items" \
  -H "Authorization: Bearer $CATALOG_TOKEN"
```

Returns every item under your listing, in every status, 100 per page, oldest
first. Each item is
`{ externalId, id, status, title, creatorUserId, pendingEdit, statusReason, editRejectionReason, updatedAt }`.
While `nextCursor` is not `null`, pass it back as `?cursor=` for the next page;
a malformed cursor is `400 invalid_body`.

Diff this list against your own catalog: `PUT` what is new or changed, `DELETE`
what you no longer carry, and surface `statusReason` (why a moderator hid an
item) and `editRejectionReason` (why a staged edit was rejected) to your own
team.

## Who an item is attributed to

The card is shown under a Civitai creator:

- **Your listing's owner**, by default (no `creatorUserId`, or the owner's id).
- **Another user**, via `creatorUserId` — only one who has signed in to your
  platform **with Civitai**, i.e. granted your client consent through the
  normal [OAuth sign-in](/site/oauth/quickstart). Anyone else is
  `403 creator_not_linked`.

Either way the creator must clear the same account-trust check as shared-storage
writes (`403 untrusted`). An existing item is **never re-attributed**, and the
creator is checked on **every** `PUT`: one that resolves to a different creator
than the item already has — including leaving `creatorUserId` out, which means
the owner — is `409 author_mismatch`. Always send the same `creatorUserId` you
first published an item with. The creator checks run even on an identical
re-sync, so one can fail later if that creator has since revoked your app or
no longer clears the trust check. The per-creator item cap applies to that creator's
pending and approved items under your listing (`429 author_cap`).

A creator stays in control of items attributed to them. In their Civitai
account settings, next to Connected apps (in limited rollout as of October
2026), they can withdraw any of their pending or approved items, and revoking
your app's access withdraws every such item your platform attributed to them.
The effect is the same as your `DELETE`: a later `PUT` of such an item (after
they sign in with Civitai again) is a republish and waits for a moderator.

## Limits and errors

- **600 writes an hour and 3,000 a day**, per listing — `PUT` and `DELETE`
  draw on the same allowance. No-op calls (an identical re-sync, a `DELETE` of
  an unknown or withdrawn id, a `PUT` to a hidden item) are not counted.
  A `PUT` is counted once it passes the field, rating and attribution checks:
  `invalid_body`, `rating_too_loose`, `creator_not_linked`, `untrusted`,
  `creator_not_found` and `author_mismatch` are not counted, but
  `text_rejected`, `image_not_public`, `image_not_yours`, `author_cap` and
  `conflict` are — and so is a call refused
  `429`, so back off for `Retry-After` rather than retrying.
- **A per-creator cap** on pending + approved items, set when your listing is
  enabled.
- **The token endpoint** is limited separately, to 20 requests a minute per
  IP — another reason to cache the token for its hour.

A refusal is a JSON body `{ error, code }`. Branch on `code`; `error` is a
server sentence, not copy for your UI.

| Status | `code` | When |
|---|---|---|
| `400` | `invalid_body` | the body failed validation (an unknown key, an out-of-range field, a missing `Content-Type: application/json`), a bad `externalId` or `cursor`, or an id that does not form a valid link with your template |
| `400` | `text_rejected` | the title or tagline did not pass the text-safety check — or the check could not run, so one later retry is reasonable |
| `400` | `rating_too_loose` | `contentRating` is less mature than your listing's rating |
| `400` | `image_not_public` | `imageId` is not publicly visible: not in a published, non-`Private` post, or not reviewed |
| `401` | `invalid_token` | no `Bearer` header; an unknown, expired or non-OAuth token; or a token also sent as `?token=` |
| `403` | `insufficient_scope` | the token lacks `AppStoreCatalogWrite`, or is not a `client_credentials` token of a client that still holds that grant |
| `403` | `not_enabled` | no listing is set up for catalog sync with your client |
| `403` | `creator_not_linked` | `creatorUserId` has not signed in to your platform with Civitai |
| `403` | `untrusted` | the creator's account does not yet clear the trust check |
| `403` | `image_not_yours` | `imageId` was not uploaded by the item's creator |
| `404` | `creator_not_found` | the creator's account no longer exists |
| `409` | `parent_ambiguous` | more than one listing is set up for your client — a configuration error; contact Civitai |
| `409` | `author_mismatch` | the item is attributed to a different creator |
| `409` | `conflict` | the item kept changing while saving — retry |
| `429` | `rate_limited` | over the hourly or daily allowance; honour `Retry-After` |
| `429` | `author_cap` | the creator already has the maximum number of items in the store under your listing |
| `503` | `unavailable` | catalog sync is temporarily unavailable — retry later |

Three refusals come before that mapping and carry no `code`: a body over 8 KB
is `413` (plain text), malformed JSON is `400` (plain text), and any other
method on these routes is `405` with `{ error }` only.

## Turning it off

Ask Civitai to disable catalog sync for your listing: calls then answer
`403 not_enabled` at once. If your client secret leaks,
[rotate it](/site/oauth/register-app#rotating-the-secret) — that stops new
tokens, but a catalog token already issued keeps working until its hour is up.

## Next

- [App Store sub-listings](./sub-listings) — the on-site version, published by
  viewers from inside a block.
- [Your store listing](./store-listing) — your listing's own card, which these
  items are shown under.
- [OAuth scopes](/site/oauth/scopes) — `AppStoreCatalogWrite` beside every
  other scope.
