---
title: Votes, likes and reports (viewer-keyed documents)
description: Store a vote, a like, a rating or one entry per viewer in the document store with a viewer-keyed collection (keyedBy "viewer" or "parent+viewer", getMine / putMine / deleteMine / parentOf, the /@me routes), count by listing, report a document to moderators with app.moderation.report, and replace the removed counters, marks, write "none" and publish.
sources:
  - civitai-app-starters:packages/civitai-sdk/src/doc-store/index.ts
  - civitai-app-starters:packages/civitai-sdk/src/doc-store/moderation.ts
  - civitai:public/schemas/app-block/v1.json#storage
  - civitai:src/shared/constants/block-storage.constants.ts
  - civitai:src/server/services/apps/doc-store-api.ts
  - civitai:src/server/services/apps/doc-store-viewer-keyed.ts
  - civitai:src/server/services/apps/doc-store-report-api.ts
  - civitai:src/server/services/apps/storage-schema-migrations.ts
---

# Votes, likes and reports

A vote, a like, a rating, a bookmark or one entry per viewer is stored in the
[document store](./storage) as an ordinary document in a **viewer-keyed**
collection: the server gives each viewer at most one document of their own,
per item if you like, and nobody else can write it. A document is reported to
moderators through the **report API**. Both replace the removed counters,
marks and `report` mark ([Moving off](#moving-off)).

Use `@civitai/sdk` **0.33.0** or later (the calls arrived in 0.30.0, and
[the data service](./storage-data-service) in 0.32.0):

```bash
npm install @civitai/sdk@latest
```

## Viewer-keyed documents {#viewer-keyed}

A shared collection that declares **`keyedBy`** gives each signed-in viewer at
most one document of their own, at a key the **server** derives from the
verified viewer. A vote, a like, a rating, a bookmark or one entry per viewer is
an ordinary document there, so it has a body, a `version`, a schema and
moderation like any other.

```json
{
  "scopes": ["apps:storage", "apps:storage:publish"],
  "scopeJustifications": {
    "apps:storage:publish": "Viewers vote on records, and every viewer of the app sees the totals."
  },
  "storage": {
    "collections": {
      "records": { "visibility": "shared", "write": "own", "indexes": { "createdBy": "string" } },
      "votes": {
        "visibility": "shared",
        "write": "own",
        "keyedBy": "parent+viewer",
        "schema": {
          "type": "object",
          "properties": { "value": { "type": "integer", "minimum": -1, "maximum": 1 } },
          "additionalProperties": false
        }
      }
    }
  }
}
```

- **`"viewer"`** — at most one document per viewer in the collection: a profile,
  a single entry, a preference others can read.
- **`"parent+viewer"`** — at most one per viewer per **parent**, a key your app
  names (usually another document's key): a vote on a record, a like on a post.

The rules:

- **Shared `write: "own"` only.** It is refused on a private collection (which
  already has one key space per viewer), with any other `write` policy, on a
  `kind: "log"` collection.
- **Write your own, only.** The key is never taken from the request: every
  `@me` call resolves the viewer from the token, so a viewer can only ever reach
  their own document. A create (`POST /{collection}`) and a write or delete by
  key (`PUT` / `DELETE /{collection}/{key}`) to a viewer-keyed collection are
  refused `invalid_request` with `details.reason: "viewer_keyed"`. Reads by key
  and lists work as on any shared collection, signed-out viewers included.
- **Immutable once approved.** A version may not add, remove or change `keyedBy`
  on a collection that any approved version of the app declared, because it
  changes what every stored key means. Declare a new collection instead.
- **Signed-in viewers only.** Every `@me` call, reads included, is refused
  `sign_in_required` for a signed-out viewer.

### Keys {#viewer-keyed-keys}

The key is `<digest>` (`"viewer"`) or `<parent>:<digest>` (`"parent+viewer"`),
where `<digest>` is 26 characters the server derives from the app, the
collection, the parent and the viewer. It carries no user id, and one viewer's
digests are not linkable across items or apps. You cannot compute it: reach the
viewer's own document with `getMine`, never with a key built by hand, and read
the item back from any key with `parentOf(key)`.

A **parent** is 1 to 96 characters of `A-Z a-z 0-9 . _ -` (the key characters
without `:`), not only dots. A server-chosen key (a `create`) fits, and so does
any key of yours without `:` of at most 96 characters. A `parent+viewer` call
without a parent is refused `invalid_request` (`details.reason:
"parent_required"`), a `"viewer"` call with one `parent_not_allowed`, and a
parent outside those characters `invalid_parent`.

### Counting {#viewer-keyed-counting}

There are **no server-side aggregates**: no count, no sum and no sort by count.
Count by listing: `list({ keyPrefix: '<parent>:' })` returns exactly one item's
documents, at most 100 per page, so an item with more takes one more page per
further 100. "Did I vote on these?" is one `list({ author: 'me' })`, or
`getMine(parent)` for one item. Where an app's shared documents are rated
before others see them, a new document is visible only to its author until it
is rated, so others' counts can trail a new vote briefly.

### A vote is a shared write {#viewer-keyed-consent}

`putMine` creates or edits a shared document, so it is gated exactly as one:

- it needs **`apps:storage:publish`**, which is consent-gated: a viewer who has
  not granted it is refused `consent_required`, and you ask with
  [`app.requestGrants`](./sdk#consent-app-requestgrants) as for any shared write
  ([Scopes and consent](./storage#scopes-and-consent));
- it passes the minimum-trust gate, the collection's `schema` and
  `ownedModelVersions`, [moderation](./storage#moderation) (which scans `data` and the
  parent, never the derived digest), and spends the shared write budget in the
  [limits table](./storage#limits);
- each document counts toward the app's and its author's quotas.

`deleteMine` needs only `apps:storage`, as any delete. A collection may also
refuse `@me` writes for a while (while its data is being moved, for example):
`putMine` / `deleteMine` are then refused `write_policy` with `details.reason:
"viewer_keyed_closed"`, reads still work, and `app.storage.info()` reports the
collection with `open: false`. `storageViewerKeyedRefusal(error)` in
`@civitai/sdk` reads every viewer-keyed refusal.

### Worked example: votes {#votes-example}

With the manifest above, a viewer votes on a record, changes their mind, and the
app shows the total:

```ts
import { initialize } from '@civitai/sdk';

const app = await initialize();
const votes = app.storage.collection<{ value: -1 | 0 | 1 }>('votes');

// The viewer's own vote on one record, or null.
const mine = await votes.getMine(record.key);

// Vote up, or change the vote: one document per viewer per record.
await votes.putMine({ value: 1 }, { parent: record.key });

// Withdraw it.
await votes.deleteMine({ parent: record.key });

// The total for one record: list its votes and add them up.
async function scoreOf(recordKey: string): Promise<number> {
  let score = 0;
  let cursor: string | undefined;
  do {
    const page = await votes.list({ keyPrefix: `${recordKey}:`, limit: 100, cursor });
    for (const v of page.items) score += v.data.value;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return score;
}

// Which records on screen this viewer voted on: one list, not one call per record.
const myVotes = await votes.list({ author: 'me', limit: 100 });
const votedOn = new Set(myVotes.items.map((v) => votes.parentOf(v.key)));
```

Over REST the same calls are below. From a block, use the SDK calls above:
direct REST calls always go to civitai.com and never get
[the data service](./storage-data-service).

```bash
# The viewer's vote on record 01JD3Q8M5Z4X2V7K9C6B1N0RTA (404 not_found when they have none)
curl -s "https://civitai.com/api/v1/blocks/storage/votes/@me/01JD3Q8M5Z4X2V7K9C6B1N0RTA" \
  -H "Authorization: Bearer $BLOCK_TOKEN"

# Vote, or change the vote
curl -s -X PUT "https://civitai.com/api/v1/blocks/storage/votes/@me/01JD3Q8M5Z4X2V7K9C6B1N0RTA" \
  -H "Authorization: Bearer $BLOCK_TOKEN" -H "Content-Type: application/json" \
  -d '{"data":{"value":1}}'

# Every vote on that record, to count
curl -s "https://civitai.com/api/v1/blocks/storage/votes?keyPrefix=01JD3Q8M5Z4X2V7K9C6B1N0RTA:&limit=100" \
  -H "Authorization: Bearer $BLOCK_TOKEN"
```

The `PUT` answers the stored document, at the derived key:

```json
{
  "key": "01JD3Q8M5Z4X2V7K9C6B1N0RTA:gq4z7m2k5w6c3t6y7b2d4f7h3j",
  "data": { "value": 1 },
  "version": 1,
  "createdAt": "2026-11-24T10:00:00.000Z",
  "updatedAt": "2026-11-24T10:00:00.000Z",
  "author": { "kind": "user", "isViewer": true },
  "counters": {},
  "marks": {},
  "viewer": { "marks": [] }
}
```

(`counters`, `marks` and `viewer` are always empty, kept only for older SDKs.
Do not read them.)

Deleting a record does not delete its votes: they stay, charged to their voters,
until each voter deletes their own. Filter out votes whose record is gone.

## Reporting a document {#reporting}

`POST /api/v1/blocks/moderation/reports` reports one document of a **shared**
collection to Civitai's moderators. In `@civitai/sdk` it is
`app.moderation.report`:

```ts
import { initialize, StorageError } from '@civitai/sdk';

const app = await initialize();

try {
  await app.moderation.report({ collection: 'records', key: record.key }); // { reported: true }
  showReported(record.key); // keep "reported" in your own state: the API never tells you
} catch (error) {
  if (error instanceof StorageError && error.code === 'report_unavailable') hideReportButton();
  else throw error;
}
```

```bash
curl -s -X POST "https://civitai.com/api/v1/blocks/moderation/reports" \
  -H "Authorization: Bearer $BLOCK_TOKEN" -H "Content-Type: application/json" \
  -d '{"collection":"records","key":"01JD3Q8M5Z4X2V7K9C6B1N0RTA"}'
```

- **Body:** `collection` (a shared collection the app declares; a private one
  is refused `invalid_request`, an undeclared one `collection_not_declared`),
  `key`, and optionally `from` to report a document in another app's collection
  through an [import](./storage#imports).
- **Answer:** `200 { "reported": true }`, the same whether or not the viewer had
  reported it already. A report is one per document per viewer. There is no
  count, ever, and no way to read whether the viewer reported something: keep
  that in your app's own state.
- **No withdrawal.** There is no delete; a report cannot be taken back.
- **Who:** a signed-in viewer (`sign_in_required` otherwise), with
  `apps:storage` (consent-exempt) and the minimum-trust gate. A report on your
  app's own documents needs no publish scope; through an import it follows the
  import's rules, as a write does.
- **Limit:** the daily report limit in the [limits table](./storage#limits)
  (`rate_limited` past it).
- **What it reaches:** a document that is not there or not visible is
  `404 not_found`. Moderators see the report in their queue.

The report API is served for every app. Against an older civitai.com, or while
the route is rolled back, it answers as an unknown route and
`app.moderation.report` rejects with the local code `report_unavailable` (404):
hide the report action then.

## Moving off counters, marks and publish {#moving-off}

Marks, counters, `write: "none"`, the tally fields and list parameters, and
`publish` / `unpublish` were [removed](./storage#deprecated) from the document
store, and from `@civitai/sdk` 0.33.0 the methods are gone too. A report goes
only through `app.moderation.report`. Call by call:

| Removed | Use instead |
|---|---|
| `marks: ["vote"]` + `update(key, { $mark: 'vote' })` / `{ $unmark: 'vote' }` | a `keyedBy: "parent+viewer"` collection + `putMine(data, { parent: key })` / `deleteMine({ parent: key })` ([worked example](#votes-example)) |
| `marks.vote` on a document (the count) | list the votes collection with `keyPrefix: key + ':'` and count ([Counting](#viewer-keyed-counting)) |
| `viewer.marks.includes('vote')` | `getMine(key)` is not `null`; for a page of items, `list({ author: 'me' })` once |
| `sort: '-mark:vote'`, `sort: 'counter:<name>'` | none: sort in your app after counting |
| `markedBy: 'me', mark: 'vote'` | `list({ author: 'me' })` on the votes collection |
| `counters` + `update(key, { $inc })` / `increment`, `write: "none"` | a viewer-keyed collection holding what each viewer did (for example `{ "count": 3 }`), summed by your app; there is no server-side counter |
| `update(key, { $mark: 'report' })` / `mark(key, 'report')` | [`app.moderation.report({ collection, key })`](#reporting) |
| `publish({ from, keys })` / `unpublish(keys)` | `get` each private document, then `put` / `delete` the shared copy |

A version you submit may not add `marks`, `counters` or `write: "none"`. One
your previous approved version declared may stay, and does nothing; a
`write: "none"` collection is read-only until a version drops it. Declare the
viewer-keyed collection under a **new** name: `keyedBy` cannot be added to a
collection an approved version already declared.
