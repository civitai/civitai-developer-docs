---
title: Storing data (document store)
description: Keep an app's data on Civitai with the document store — declare collections in the manifest, the apps:storage and apps:storage:publish scopes, documents, conditional writes, lists, counters and marks, moderation, error codes, limits, local development, createFakeStorage, the REST routes, and moving off the legacy useAppStorage / useSharedStorage stores.
sources:
  - npm:@civitai/sdk@0.14.1/dist/doc-store/index.d.ts
  - npm:@civitai/sdk@0.14.1/dist/doc-store/fake.d.ts
  - npm:@civitai/sdk@0.14.1#README
  - civitai:public/schemas/app-block/v1.json#storage
  - civitai:public/schemas/app-block/storage-contract.v1.json
  - civitai:src/shared/constants/block-storage.constants.ts
  - civitai:src/server/services/apps/doc-store-api.ts
  - civitai:src/server/services/apps/doc-store-access.ts
  - civitai:src/server/services/apps/doc-store-ownership.ts
  - civitai:src/server/services/apps/doc-store.ts
  - civitai:src/server/services/apps/doc-store.types.ts
  - civitai:src/server/utils/shared-storage-rate-limit.ts
  - civitai:src/server/services/blocks/block-write-trust.service.ts
  - civitai:src/server/services/blocks/dev-scoped-mint.service.ts
  - civitai:src/server/routers/apps-mod-doc-store.router.ts
---

# Storing data (document store)

An app keeps its data on Civitai in the **document store**: JSON documents in
named **collections** that the app declares in its manifest. A collection is
either **private**, one key space per viewer, or **shared**, one key space every
viewer of the app reads. Shared collections carry authorship, **counters** and
per-viewer **marks** (a vote, a like, a report) without any code of yours on the
server.

The client is `app.storage.collection(name)` in
[`@civitai/sdk`](./sdk) **0.14.0 or later**. Underneath it is a plain REST API
under `/api/v1/blocks/storage`, called with the block token, so an app that does
not use the SDK can call it directly ([REST reference](#rest-reference)).

A scaffolded app may pin an older SDK, and a caret range on a `0.x` version
never moves to the next minor, so `npm install` alone does not get you there.
On an older version `app.storage.collection` does not exist. Check, and raise
it if needed:

```bash
npm ls @civitai/sdk
npm install @civitai/sdk@^0.14.0
```

This store replaces two older ones, `useAppStorage` and `useSharedStorage`
(and their `app-storage` / `shared-storage` routes). Those keep working while
apps move; see [Moving from the legacy stores](#moving-from-the-legacy-stores).
Which client reaches which store:

| Store | `@civitai/sdk` | `@civitai/blocks-react` (bridge) | REST |
|---|---|---|---|
| Document store | `app.storage.collection(name)`, `app.storage.info()` | none | `/api/v1/blocks/storage/*` |
| Legacy per-viewer store (deprecated) | `app.storage.get` / `set` / `delete` / `list` / `getQuota` | `useAppStorage` | `/api/v1/blocks/app-storage/*` |
| Legacy shared store (deprecated) | `app.sharedStorage` | `useSharedStorage` | `/api/v1/blocks/shared-storage/*` |

## Declare your collections {#declare}

A collection that is not declared in the manifest does not exist: every call to
it is refused `collection_not_declared`. The declaration is reviewed with the
rest of the manifest, and the server reads the **approved** version of it, so a
collection you add in a new version exists once that version is approved.

```json
{
  "scopes": ["apps:storage", "apps:storage:publish"],
  "scopeJustifications": {
    "apps:storage:publish": "Viewers post feature requests that every viewer of the app can read and vote on."
  },
  "storage": {
    "collections": {
      "prefs":    { "visibility": "private" },
      "requests": { "visibility": "shared", "write": "own", "marks": ["vote"],
                    "indexes": { "status": "string" }, "showAuthor": true },
      "plays":    { "visibility": "shared", "write": "none", "counters": ["plays"] }
    }
  }
}
```

Each collection declares:

- **`visibility`** — `"private"`: each viewer has their own key space, and only
  that viewer reads or writes it. `"shared"`: one key space for the whole app,
  read by every viewer, signed-out viewers included.
- **`write`** — shared collections only, and required on them. `"own"`: signed-in
  viewers create documents, and only a document's author edits or deletes it.
  `"none"`: nobody writes documents; viewers only increment the declared
  counters and set the declared marks, and the first increment of a key that
  does not exist creates an empty document. A `"none"` collection must declare at
  least one counter or mark.
- **`counters`** — shared only. Atomic tallies the app increments, such as
  `plays`.
- **`marks`** — shared only. A per-viewer flag on a document, at most one of each
  per viewer per document, such as `vote`. A reader sees each mark's count and
  whether **they** set it, never who else did. `report` is built in on every
  shared collection and must not be declared.
- **`indexes`** — the fields of a document's `data` you can filter and sort by,
  as a map of field path to type (`string`, `number`, `boolean` or `time`). A
  path such as `status` or `meta.round` names a field inside `data`.
- **`showAuthor`** — shared only. When `true`, readers see the author's username.
  Otherwise they learn only whether they wrote a document themselves. The
  numeric user id is never exposed either way.
- **`ownedModelVersions`** — shared collections with `write: "own"` only. Fields
  of `data` that, when present, must hold a model version the writing viewer
  owns. See [Fields that must name the author's own model version](#owned-model-versions).

Renaming a collection or changing its visibility makes it a **new** collection,
and the old one's documents are not moved into it. They are not deleted either:
they stay stored, keep counting toward the app's and each viewer's
[quotas](#limits), and can no longer be read or deleted: a call naming a
collection that is no longer declared is refused `collection_not_declared`, and
after a visibility change under the same name the old documents sit in a key
space the collection no longer reads. Declaring the old collection again brings
them back.

Clearing a collection out first is possible only for some of its documents,
because there is no app-wide delete:

- In a **private** collection, each viewer can delete their own documents, with
  their own token.
- In a shared **`"own"`** collection, each document's author can delete it,
  and no other viewer can. A document a moderator has hidden cannot be deleted
  this way.
- In a shared **`"none"`** collection, no viewer can delete a document: a
  delete is refused `write_policy`.
- The app cannot delete documents on viewers' behalf: `write: "owner"`, which
  would make the app a writer, is reserved.

Every document not deleted that way stays charged to those quotas, and
declaring the old collection again is the only way to reach it again.

Changing an index's type is not supported; remove the index and add one under a
new name.

Some of the schema is reserved for later phases, and the server refuses it with
a message saying so. The [limits table](#limits) lists which fields are refused
today, and the [manifest reference](../reference/manifest) has every field's
bounds, except `ownedModelVersions`, which it lists once these docs' pinned
`@civitai/app-sdk` is bumped to a version that carries it (see
[below](#owned-model-versions) for its rules).

`civitai app validate` checks only the JSON schema, which admits the reserved
fields. The server's own manifest validation, which applies the reserved-feature
refusal and the [scope rules](#scopes-and-consent), runs when a moderator
approves the version (and on a direct git push), not when `civitai app submit`
uploads it. A declaration it refuses therefore waits in review until approval
fails, so check it against this page before you submit.

### Fields that must name the author's own model version {#owned-model-versions}

A shared collection can carry documents that point at a model version, such as
a workflow a creator publishes for their own model. Readers then take that id
at face value, so the server can enforce that only the version's owner writes
it: declare the fields in **`ownedModelVersions`**, and every create and
replace is checked against the viewer making it.

```json
{
  "scopes": ["apps:storage", "apps:storage:publish"],
  "scopeJustifications": {
    "apps:storage:publish": "Creators publish workflows for their own models, and every viewer of the app can browse them."
  },
  "storage": {
    "collections": {
      "workflows": {
        "visibility": "shared",
        "write": "own",
        "indexes": { "workflow.modelVersionId": "number" },
        "showAuthor": true,
        "ownedModelVersions": ["/workflow/modelVersionId"]
      }
    }
  }
}
```

A document in `workflows` such as
`{ "workflow": { "modelVersionId": 123456, "steps": [] }, "title": "Portrait pass" }`
is stored only if model version `123456` belongs to a model the writing viewer
owns.

The rules:

- **Where it may be declared.** Shared collections whose `write` is `"own"`,
  the only policy under which the viewer making a write is always the
  document's author. It is refused on private collections and on `write`
  `"anyone"`, `"owner"` and `"none"`.
- **Pointers.** Each entry names one field of nested objects: no array
  indexes, no `~0` / `~1` escapes, no hyphens and no non-ASCII characters. The
  count and the exact pattern are in the [limits table](#limits).
- **Absent is allowed.** A field that is missing, or a path that steps through
  an array, `null` or any other non-object on the way, counts as absent and is
  not checked. To require the field, validate that in your app.
- **Present must be owned.** A present field must be a positive integer naming a
  model version whose model the writer owns. A version that is someone else's,
  that does not exist or is deleted, and a value that is not a positive integer
  (a string `"123456"` and `null` included) are all refused the same way, so the
  refusal does not reveal whether a version exists. To clear the field, leave
  the key out rather than setting it to `null`. Draft and unpublished versions
  the writer owns pass.
- **Which writes.** Every create (`POST /{collection}`, `create`) and replace
  (`PUT /{collection}/{key}`, `put`) of a document. Counters, marks and deletes
  do not write `data` and are not checked.
- **Before the author check.** The check is against the viewer making the
  write, and it runs before the store looks at who wrote the document. So a
  `put` by a viewer who is not the author, whose `data` carries a version that
  viewer does not own (such as the author's own id, unchanged), is refused
  `resource_not_owned`, not `not_author`. Handle both codes on an edit.
- **Before moderation and the write budget.** A refused write is not scanned and
  spends no write budget.
- **At write time only.** Ownership is checked when a document is written. If
  the model later changes hands or is deleted, documents already stored keep
  the id; the check applies again the next time the document is written.
  Adding `ownedModelVersions` to a collection that already holds documents does
  not re-check them.
- **A failed lookup** is a retryable `503 service_unavailable`; the write is
  never accepted unchecked.

A refusal is `403` with code `resource_not_owned`, and `details.pointer` names
a declared field that failed (when several fail, only one is reported):

```json
{
  "code": "resource_not_owned",
  "message": "the model version at this field is not one the author owns",
  "error": "the model version at this field is not one the author owns",
  "details": { "pointer": "/workflow/modelVersionId" }
}
```

Tooling versions that know the field:

- `civitai` CLI **0.1.128** or later validates it in `civitai app validate`;
  older CLIs reject it as an unknown property.
- `@civitai/sdk` **0.16.0** or later names `resource_not_owned` in
  `StorageErrorCode`, and its [`createFakeStorage`](#testing) enforces the rule.
- `@civitai/app-sdk` **0.73.0** or later types `ownedModelVersions` on a shared
  collection.

## Scopes and consent {#scopes-and-consent}

Two scopes:

| Scope | Covers | Consent |
|---|---|---|
| `apps:storage` | everything except authoring shared documents: reads, the viewer's private collections, deleting documents the viewer wrote, marks and counters | consent-exempt |
| `apps:storage:publish` | creating and editing documents in a shared collection whose `write` is `"own"` | consent-gated, and needs a `scopeJustifications` entry |

The rules the server's manifest validation enforces at approval (only the
`scopeJustifications` entry is checked earlier, when `civitai app submit`
uploads the version):

- Declaring any collection requires `apps:storage`.
- A shared collection with `write: "own"` requires `apps:storage:publish`.
  `write: "none"` does not: no viewer authors a document there.
- Declaring either scope with nothing in `storage` for it to reach is refused.
- `auth: "oauth"` cannot be declared alongside any `apps:storage*` scope.

`apps:storage:publish` reaches the token only after the viewer agrees in the
host's consent dialog, so the first shared write from a viewer who has not been
asked is refused `consent_required`. Ask with
[`app.requestGrants`](./sdk#consent-app-requestgrants) and retry:

```ts
import { initialize, StorageError } from '@civitai/sdk';

const app = await initialize();
const requests = app.storage.collection<{ title: string; status: 'open' | 'done' }>('requests');

async function postRequest(title: string) {
  try {
    return await requests.create({ title, status: 'open' });
  } catch (error) {
    if (!(error instanceof StorageError) || error.code !== 'consent_required') throw error;
    const granted = await app.requestGrants(['apps:storage:publish'], {
      signal: AbortSignal.timeout(60_000),
    });
    if (!granted) return null; // the viewer said no: keep the UI usable without posting
    return requests.create({ title, status: 'open' });
  }
}
```

A viewer who withdraws the publish scope can still delete the documents they
wrote: deleting needs only `apps:storage`.

## Reading and writing {#reading-and-writing}

`app.storage.collection<T>(name)` returns a handle; nothing is sent until you
call an operation on it.

```ts
import { initialize } from '@civitai/sdk';

interface Request {
  title: string;
  status: 'open' | 'done';
}

const app = await initialize();
const requests = app.storage.collection<Request>('requests');

const created = await requests.create({ title: 'More lighting presets', status: 'open' });
const doc = await requests.get(created.key); // null when there is none
await requests.put(created.key, { title: 'More lighting presets', status: 'done' }, { ifVersion: doc?.version });
await requests.mark(created.key, 'vote'); // { marked: true, count }

const page = await requests.list({ where: { status: 'open' }, sort: '-mark:vote', limit: 20 });
for (const item of page.items) {
  console.log(item.data.title, item.marks.vote, item.author, item.viewer?.marks);
}
```

| Call | Does |
|---|---|
| `get(key)` | the document, or `null` when there is none (a hidden document reads the same way) |
| `getMany(keys)` | one round trip; the result is in the order of `keys`, with `null` for each miss |
| `put(key, data, { ifVersion? })` | creates or replaces the document at `key` |
| `create(data)` | creates a document under a key the server chooses, a sortable id |
| `delete(key, { ifVersion? })` | `{ deleted: false }` when there was nothing to delete; calling it twice is safe |
| `list(query?)` | one page; see [Lists](#lists) |
| `increment(key, counter, by?)` | adds to a declared counter, `{ value }` |
| `mark(key, name)` / `unmark(key, name)` | sets or clears the viewer's mark, `{ marked, count }` |
| `app.storage.info()` | the declared collections, the [limits](#limits) and the usage so far; signed-in viewers only |

### Documents

A document is `{ key, data, version, createdAt, updatedAt, author, counters,
marks, viewer }`:

- `data` is a JSON object. `version` goes up by one on every write to `data`;
  counter and mark changes do not move it. The SDK gives you `createdAt` and
  `updatedAt` as `Date`s; on the wire they are ISO strings.
- `author` is `{ kind: 'user', isViewer, username? }` for a viewer's document
  (`username` only in a `showAuthor` collection), `{ kind: 'counter' }` for a
  document a counter's first increment created, or `{ kind: 'app' }`. It never
  carries a numeric user id.
- `counters` and `marks` hold the declared counters and mark counts of a shared
  document, and are `{}` on a private one. A `report` count is never exposed.
- `viewer` is `{ marks }`, the marks the reading viewer set on this document,
  or `null` for a signed-out viewer.

Reads and writes use the same database connection, so a read made after a write
succeeded sees it; there is no replica delay to wait out.

The characters and length a key may have are in the [limits table](#limits).
In a private collection each viewer has their own key space, so two viewers can
both have a document `theme` without colliding.

### Conditional writes {#conditional-writes}

`put` and `delete` take `ifVersion`: the write happens only if the stored
document is at that version, and `0` means "only if it does not exist yet".
A mismatch is refused `version_conflict`, with the stored version in
`details.currentVersion`. Use it whenever two viewers, or two tabs, can edit the
same document: read, change, write with the version you read, and on a conflict
read again.

Two writes racing on one key can also be refused `version_conflict` without
`ifVersion`; retrying is safe.

### Lists {#lists}

`list(query)` returns `{ items, nextCursor }`. `nextCursor` is `null` exactly on
the last page; pass it back as `cursor` **with the same query** for the next one.

| Query field | Meaning |
|---|---|
| `where` | equality on **one** declared index: `{ status: 'open' }`. A `time` index takes an ISO-8601 string, epoch milliseconds or a `Date` |
| `sort` | `key` (the default), `createdAt`, `updatedAt`, a declared index, `counter:<name>` or `mark:<name>`; a leading `-` sorts descending |
| `author: 'me'` | only documents the viewer wrote |
| `markedBy: 'me'` with `mark` | only documents the viewer marked with that mark |
| `keyPrefix` | only keys starting with this prefix |
| `limit` | page size; the server applies its own default and maximum |

The filters combine with AND. A filter or sort on an index lists only the
documents that **have** a value for that index; a counter or mark sort lists
every document, counting a missing tally as 0. A `where` or `sort` on anything
undeclared is refused `index_not_declared`.

### Counters and marks {#counters-and-marks}

Both exist on shared collections only, and both need a signed-in viewer.

```ts
import { initialize } from '@civitai/sdk';

const app = await initialize();
const plays = app.storage.collection('plays'); // write: "none", counters: ["plays"]

const { value } = await plays.increment('model-123', 'plays'); // creates the document on first use
```

- `increment(key, counter, by)` adds `by` (1 when omitted) and resolves the new
  value. In a `write: "none"` collection the first increment of a missing key
  creates the document.
- `mark` and `unmark` are idempotent and resolve the mark's new count. Use a
  mark for anything one viewer does once per document: a vote, a like, a
  bookmark. `viewer.marks` on each document tells you which ones this viewer has
  set, so a toggle can render its state on load.
- `report` is the built-in mark that sends a document to moderators. Its count
  is never returned, and **a report cannot be withdrawn**: `unmark(key,
  'report')` is refused `invalid_request` for every caller. Reports have their
  own daily limit on top of the marks-and-counters one.

## Who can do what {#who-can-do-what}

| Operation | Viewer | Scope | Other gates |
|---|---|---|---|
| Read a shared collection | anyone, signed out included | `apps:storage` | — |
| Read a private collection, `info()`, `author: 'me'` / `markedBy: 'me'` lists | signed in | `apps:storage` | — |
| Write or delete in a private collection | signed in | `apps:storage` | — |
| Create or edit in a shared `"own"` collection | signed in | `apps:storage` + `apps:storage:publish` | the minimum-trust gate, moderation, the shared write budget, and the [`ownedModelVersions`](#owned-model-versions) check when declared (before moderation and the budget); editing another viewer's document is refused `not_author`, or `resource_not_owned` when its `data` carries a version the editor does not own |
| Delete in a shared `"own"` collection | signed in, the author | `apps:storage` | — |
| Write a document in a `"none"` collection | — | — | refused `write_policy` for a signed-in viewer (a signed-out one gets `sign_in_required` first) |
| `increment`, `mark`, `unmark` | signed in | `apps:storage` | the minimum-trust gate |

Signed-out viewers get `sign_in_required` for everything but shared reads, so
gate write affordances on `app.viewer`, and render shared reads regardless.
Every call also needs an approved app, and for a signed-in viewer an account
that may run apps; otherwise it is refused `not_eligible` with `details.reason`
`app_not_approved` or `apps_disabled`.

The **minimum-trust gate** applies to a viewer's writes into shared collections
(other than deleting their own) and to marks and counters. It is about the
viewer's account, not your app: a refusal is `not_eligible` with
`details.reason` set to `ineligible`, `restricted`, `onboarding_incomplete`,
`email_unverified` or `account_too_new`. Treat it as a normal outcome and show
the viewer why, rather than as an error.

## Moderation {#moderation}

Every create or edit in a shared collection is scanned before it is stored:
every string value and object key in `data`, and on `put` the document key. In a
`"none"` collection, every increment scans the document's key, whether or not the
document already exists.

- A refusal is `content_rejected` (422). `details.category` is coarse (`link`,
  `unreviewable` or `blocked`) and never the matched text.
- When the scan cannot run, the write is refused `moderation_unavailable` (503)
  with a `Retry-After`; retry after it. In a `"none"` collection that includes
  increments to documents that already exist.

Viewers report documents with the built-in `report` mark. Moderators see
reported shared documents across apps and can **hide** one (it then reads as
not found to your app and to every viewer, and a write to its key is refused
`not_found`), **unhide** it, **delete** it, or **dismiss** its reports and keep
it. Reports filed after a dismissal reopen it.

## Errors {#errors}

Every refusal has one shape, whichever layer refused:

```json
{ "code": "version_conflict", "message": "version conflict", "error": "version conflict", "details": { "currentVersion": 3 } }
```

Branch on `code`; `message` is prose and `error` repeats it. `details` carries
what the code needs (`currentVersion`, `reason`, `category`, `ceiling`,
`bucket`, `pointer`, `retryAfter`). A refusal that names a wait sends a `Retry-After`
header too, and a `429` also carries `rateLimit: { retryAfterSeconds, retryAt }`.

In `@civitai/sdk` a refusal in this envelope is a `StorageError`, an `ApiError`
with `code`, `status`, `details` and a `retryAfter` getter. The client also
refuses a few things before sending: a collection name that cannot be declared
(`collection_not_declared`) and a key of `''`, `.` or `..` (`invalid_request`).
A response without the envelope arrives as a plain `ApiError`, and a request
that never got an answer as the platform's `TypeError`.

```ts
import { initialize, StorageError } from '@civitai/sdk';

const app = await initialize();
const requests = app.storage.collection<{ title: string; status: 'open' | 'done' }>('requests');

try {
  await requests.put('r1', { title: 'Renamed', status: 'open' }, { ifVersion: 3 });
} catch (error) {
  if (!(error instanceof StorageError)) throw error;
  if (error.code === 'version_conflict') {
    // reload the document and let the viewer redo the edit
  } else if (error.code === 'rate_limited') {
    console.warn(`busy; retry in ${error.retryAfter ?? 1}s`);
  } else {
    throw error;
  }
}
```

Every code the routes return, generated from the server's own table:

<StorageReference table="errors">

<!-- BEGIN GENERATED: storage-errors — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

| Code | HTTP | Meaning |
|---|---|---|
| `invalid_request` | 400 | The request is malformed: a bad key, body, query parameter, value or cursor, an increment or mark naming an undeclared counter or mark, a counter or mark on a private collection, or withdrawing a `report`. |
| `index_not_declared` | 400 | A `where` or `sort` names a field, counter or mark the collection does not declare. |
| `unauthenticated` | 401 | No usable token. |
| `sign_in_required` | 401 | The operation needs a signed-in viewer: writes, marks, counters, `info`, any read of a private collection, and `author=me` / `markedBy=me` lists. |
| `insufficient_scope` | 403 | The token does not carry `apps:storage`. |
| `consent_required` | 403 | The viewer has not granted `apps:storage:publish`, or withdrew a consent-gated scope. Ask with `requestGrants`. |
| `not_eligible` | 403 | The app or the viewer cannot use storage here. `details.reason` says which, for example `app_not_approved` or `account_too_new`. |
| `not_author` | 403 | Only a document's author may change or delete it. |
| `write_policy` | 403 | The collection's `write` policy does not let viewers write documents. |
| `resource_not_owned` | 403 | A field the collection declares in `ownedModelVersions` holds a model version the writing viewer does not own (or one that does not exist, is deleted, or is not a positive integer). `details.pointer` names the field. |
| `not_found` | 404 | No such document (hidden documents read the same way), or no such route. |
| `collection_not_declared` | 404 | The collection is not declared in the app's approved manifest (in a moderator's review run, the pending one). |
| `version_conflict` | 409 | An `ifVersion` write found another version. `details.currentVersion` is the one stored. |
| `index_building` | 409 | Declared for a later phase; not raised today. |
| `cursor_expired` | 410 | Declared for a later phase; not raised today. |
| `too_large` | 413 | The document or the request body is over its limit. |
| `quota_exceeded` | 413 | A quota is full. `details.ceiling` names which one. |
| `content_rejected` | 422 | Moderation refused a shared write. `details.category` is coarse and never the matched text. |
| `rate_limited` | 429 | A rate limit or the shared write budget is spent. Wait `Retry-After` seconds. |
| `storage_disabled` | 503 | The document store is not enabled on this server. |
| `moderation_unavailable` | 503 | A shared write could not be reviewed right now. Retryable after `Retry-After`. |
| `consent_unavailable` | 503 | The viewer's consent state could not be read. Retryable. |
| `service_unavailable` | 503 | A dependency could not be read. Retryable. |
| `internal_error` | 500 | A server fault. |
| `method_not_allowed` | 405 | The path exists, not for this method. The `Allow` header lists the methods it takes. |

<!-- END GENERATED: storage-errors -->

</StorageReference>

A `503 storage_disabled` answers every data call on a server where the document
store is not enabled; it is not something your app caused or can fix.

## Limits {#limits}

Generated from the server's constants. **Render `app.storage.info().limits`,
never a number you copied**: the server can change any of these without a new
SDK, and `info()` is what the running server enforces.

<StorageReference table="limits">

<!-- BEGIN GENERATED: storage-limits — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

| Area | Limit | Value |
|---|---|---|
| Documents | One document | 65,536 bytes (64 KiB), measured on the JSON text the server stores, which can be larger than the JSON you sent |
| Documents | One request body | 81,920 bytes (80 KiB) |
| Documents | Nesting depth of `data` | 16 |
| Documents | Key | `^[A-Za-z0-9._:-]{1,128}$`, and not made only of dots |
| Documents | A string index value | 128 bytes |
| Documents | Counter increment (`by`) | 1 to 100 |
| Lists | Page size (`limit`) | default 25, at most 100 |
| Lists | Equality filters (`where`) | 1, on a declared index |
| Lists | Keys in one `getMany` | 100 |
| Lists | Cursor length | 512 characters |
| Declaration | Collections per app | 16 |
| Declaration | Counters / marks per collection | 8 / 8 |
| Declaration | Indexes per collection | 4, each a field path of up to 3 segments, typed `string`, `number`, `boolean`, `time` |
| Declaration | Owned model-version fields (`ownedModelVersions`) | 1 to 4 distinct pointers per collection, each matching `^(/[A-Za-z_][A-Za-z0-9_]{0,63}){1,4}$`; shared collections with `write: "own"` only |
| Declaration | Built-in marks (never declared) | `report` |
| Declaration | Refused by the server (not available yet) | `write: "anyone"`, `write: "owner"`, `kind: "log"` (and `maxEntries`), `ttlSeconds`, `dailyWritesPerAuthor` |
| Quota | Per app | 52,428,800 bytes (50 MiB) and 1,000,000 documents |
| Quota | Per viewer, within one app | 2,097,152 bytes (2 MiB) and 1,000 documents |
| Rate | Reads (`info`, `list`, `get`, `getMany`) | 300 a minute per viewer, or per IP address for a signed-out viewer |
| Rate | Writes to private collections, and every delete | 120 a minute per viewer |
| Rate | Marks and counters | 30 a minute per viewer |
| Rate | Reports | 20 a day per viewer, on top of the marks-and-counters limit |
| Rate | Creating and editing shared documents | a burst of 10 refilling 1 every 6 minutes, and 50 a day refilling 1 every ~28.8 minutes, per viewer; a write needs a token from both, and only a write that lands spends one |
| Rate | Shared writes the server refused | also charged to a bucket of 10 refilling 1 every 30 minutes; while it is empty, no shared create or edit is accepted |

<!-- END GENERATED: storage-limits -->

</StorageReference>

Three things the table does not say on its own:

- **Sizes are in the stored unit.** The document limit and both quotas measure
  the JSON text the server keeps, which can be larger than the JSON you sent.
  `info().usage` reports bytes and document counts in that same unit; size your
  data against it, not against what you sent.
- **Every limit is per app.** One viewer at a limit in your app is not limited
  in another app. A shared document counts toward its author's per-viewer quota,
  and a document a counter created counts toward the viewer whose increment
  created it.
- **The shared write budget is the legacy store's budget.** Creating and editing
  shared documents spend the same per-viewer, per-app budget as the legacy
  shared store's `append` and `update`, so an app using both spends one budget.

A `rate_limited` refusal with `details.reason: "contention"` means the store was
busy with other writes to the same documents, not that the viewer is over a
limit; it is safe to retry after `Retry-After`.

## Where your data lives {#namespaces}

The same app sees different data depending on who is running it:

- **Production** — every viewer of the approved app shares one namespace:
  shared collections are shared across all of them, and private collections are
  per viewer within it.
- **Your dev token** — a token from `civitai app dev-token` reads and writes a
  namespace of your own, separate from production and from every other
  developer. Nothing you write there reaches a production viewer.
- **A moderator's review run** — a moderator running a pending submission for
  real gets a namespace per moderator and submission, declared by the pending
  manifest, and it is deleted once the submission is no longer pending.

Quotas count each namespace separately. When a moderator wipes an account's
content, that account's documents and marks are removed from every app's store
too.

## Local development {#local-development}

- **`dev:live` does not reach the document store.** The `page-money` harness
  forwards the block→host bridge, and the document store is not on the bridge:
  `@civitai/sdk` calls it over HTTP, and that template does not use
  `@civitai/sdk`. (The `page-elements` template, which does, has no `dev:live`
  script.)
- **The dev tunnel** (`civitai app dev-tunnel`) mints a token without either
  storage scope, so every call is refused `insufficient_scope`.
- **A `civitai app dev-token` token** carries `apps:storage` and
  `apps:storage:publish` when your app's manifest declares them (the approved
  version's, once there is one), without a consent prompt, and the store serves
  it only once your app has an **approved** version, in your own namespace (see
  above) with the collections that version declares. Before approval every call
  is refused `not_eligible` with `details.reason: "app_not_approved"`.
- **`dev:harness` does not reach it either.** The `page-money` mock host answers
  the bridge only (the legacy storage messages included), and the
  `page-elements` harness hands the app a mock token that no Civitai route
  accepts.

So test against a fake: [`createFakeStorage`](#testing).

## Testing with `createFakeStorage` {#testing}

`@civitai/sdk/testing` exports `createFakeStorage({ manifest })`: an in-memory
document store behind the same seam the real client uses, enforcing the
server's rules (scopes and consent, write policies, the minimum-trust gate,
signed-out readers, keys, limits and quotas, moderation, and the error codes and
statuses). The SDK runs the platform's own storage contract against it.

Write your data layer against the `DocumentStorage` type, pass `app.storage` in
the app and the fake's `storage` in tests:

```ts
import { StorageError, type DocumentStorage } from '@civitai/sdk';
import { createFakeStorage, FAKE_STORAGE_MODERATION } from '@civitai/sdk/testing';

interface Request {
  title: string;
  status: 'open' | 'done';
}
const requestsIn = (storage: DocumentStorage) => storage.collection<Request>('requests');
/** The refusal's code, or 'ok' — so a test can assert on it. */
const codeOf = (p: Promise<unknown>) =>
  p.then(() => 'ok', (e: unknown) => (e instanceof StorageError ? e.code : 'not a StorageError'));

const fake = createFakeStorage({
  manifest: {
    scopes: ['apps:storage', 'apps:storage:publish'],
    storage: { collections: { requests: { visibility: 'shared', write: 'own', marks: ['vote'] } } },
  },
  viewer: { username: 'alice' },
});

const created = await requestsIn(fake.storage).create({ title: 'Dark mode', status: 'open' });

// The same store, as other callers.
const bob = requestsIn(fake.as({ viewer: { username: 'bob' } }).storage);
await bob.mark(created.key, 'vote'); // { marked: true, count: 1 }
await codeOf(bob.put(created.key, { title: 'Light mode', status: 'open' })); // 'not_author'

const newbie = requestsIn(fake.as({ viewer: { username: 'dan', trusted: false } }).storage);
await codeOf(newbie.create({ title: 'Hi', status: 'open' })); // 'not_eligible' (details.reason 'account_too_new')

const anon = requestsIn(fake.as({ viewer: null }).storage);
(await anon.list()).items.length; // 1: shared reads work signed out

const noConsent = requestsIn(fake.as({ scopes: ['apps:storage'] }).storage);
await codeOf(noConsent.create({ title: 'Hi', status: 'open' })); // 'consent_required'

await codeOf(requestsIn(fake.storage).create({ title: FAKE_STORAGE_MODERATION.blockedText, status: 'open' })); // 'content_rejected'
```

- `fake.calls` records every request and answer.
- Options: `limits` (smaller quotas, to reach `quota_exceeded`), `consent`
  (revoked scopes, or `'unavailable'`), `appStatus`, `disabled` (every call
  `storage_disabled`) and `moderate` (your own scanner). By default the scanner
  refuses the words in `FAKE_STORAGE_MODERATION`.
- **Rate limits are off by default**, so your tests are never throttled. Pass
  `enforceRateLimits: true` (and drive the clock with `now`) to test
  `rate_limited`.
- A declaration using a reserved feature makes `createFakeStorage` throw,
  naming it, instead of failing per request. So does a misplaced or malformed
  `ownedModelVersions` (0.16.0 or later).
- From 0.16.0 it enforces a collection's
  [`ownedModelVersions`](#owned-model-versions) rule. The fake has no model
  versions of its own, so it checks writes against the viewer's
  `modelVersions`, the ids that viewer owns; the default is none, so every id is
  refused, as the server refuses a version that is not the writer's:
  `fake.as({ viewer: { username: 'bob', modelVersions: [4317] } })`.
- It does not model moderator hides, the review namespace, or a failed
  ownership lookup (the server's retryable `503 service_unavailable`).

## REST reference {#rest-reference}

Base URL `https://civitai.com/api/v1/blocks/storage`, with
`Authorization: Bearer <block token>`. Every route needs `apps:storage` on the
token. Bodies and responses are JSON; refusals use the [envelope](#errors).
Block origins are allowed by CORS, including the opaque `Origin: null` of a
sandboxed block, with `PUT` and `DELETE` in the preflight and `Retry-After`
exposed.

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | (the base URL) | — | `info`: `{ collections, limits, usage }` |
| `GET` | `/{collection}` | — | a page: `{ items, nextCursor }` |
| `POST` | `/{collection}` | `{ data }` | `201`, the created document |
| `POST` | `/_get/{collection}` | `{ keys }` | `{ items }`, in the order of `keys`, `null` for each miss |
| `GET` | `/{collection}/{key}` | — | the document, or `404 not_found` |
| `PUT` | `/{collection}/{key}` | `{ data, ifVersion? }` | the stored document |
| `DELETE` | `/{collection}/{key}` | — (`?ifVersion=` in the query) | `{ deleted }` |
| `POST` | `/{collection}/{key}/counters/{name}` | `{ by? }` | `{ value }` |
| `PUT` | `/{collection}/{key}/marks/{name}` | none, or `{}` | `{ marked: true, count }` (no `count` for `report`) |
| `DELETE` | `/{collection}/{key}/marks/{name}` | — | `{ marked: false, count }` |

A list takes these query parameters, each at most once:
`where[<index>]=<value>`, `sort`, `author=me`, `markedBy=me` with `mark`,
`keyPrefix`, `limit` and `cursor`. A `where` value is read by the index's
declared type: a number for `number`, `true` or `false` for `boolean`, and an
ISO-8601 string or epoch milliseconds for `time`. Any other query parameter, on
any route, is refused `invalid_request` rather than ignored. A path that exists
answers a method it does not take with `405 method_not_allowed` and an `Allow`
header.

```bash
curl -s "https://civitai.com/api/v1/blocks/storage/requests?where%5Bstatus%5D=open&sort=-mark:vote&limit=20" \
  -H "Authorization: Bearer $BLOCK_TOKEN"
```

## Moving from the legacy stores {#moving-from-the-legacy-stores}

`useAppStorage` and `useSharedStorage` in `@civitai/blocks-react`, the matching
`app.storage.get/set/delete/list/getQuota` and `app.sharedStorage` methods in
`@civitai/sdk`, and the routes under `/api/v1/blocks/app-storage/*` and
`/api/v1/blocks/shared-storage/*` are **deprecated**. They keep working, with
their scopes (`apps:storage:read`, `apps:storage:write`,
`apps:storage:shared:read`, `apps:storage:shared:write`), while apps move. No
removal date has been set.

**Nothing is copied for you.** The document store starts empty; data in the
legacy stores stays there. If your app has data viewers care about, read it from
the legacy store and write it into a collection yourself, or keep reading the
legacy store for old data while new data goes to the collection.

### Per-viewer storage (`useAppStorage`)

Declare a `private` collection and the `apps:storage` scope.

| Legacy | Document store |
|---|---|
| `set(key, value)` | `put(key, data)` — `data` must be a JSON object, so wrap a scalar: `{ value }` |
| `get(key)` | `get(key)` — the value is the document's `data` |
| `delete(key)` | `delete(key)` |
| `list({ prefix, cursor })` | `list({ keyPrefix, cursor })` — whole documents, not just keys |
| `getQuota()` | `app.storage.info()` — `usage.viewer` and `limits` |
| the legacy byte, row and key-length messages | [error codes](#errors) |

**Keys may not carry over as they are.** A legacy key is any string of 1 to 200
characters, while a document key is limited to the characters and length in the
[limits table](#limits). A legacy key with a `/`, a space or any other character
outside that set, or one longer than the limit, is refused `invalid_request`, so
map such keys (hash them, for example) when you copy. A viewer's legacy data can
be read only with that viewer's own token, so the copy runs per viewer, inside
the app, as each viewer opens it.

### Shared storage (`useSharedStorage`)

Declare a `shared` collection with `write: "own"`, a `vote` mark if you had
voting, and both scopes; `apps:storage:publish` replaces
`apps:storage:shared:write` and needs a `scopeJustifications` entry.

| Legacy | Document store |
|---|---|
| `append({ title, body?, data? })` | `create(data)` — put what you stored in `title`, `body` and `data` into the document's `data`; every string in it is moderated |
| `list({ limit, cursor })` (newest first) | `list({ sort: '-createdAt', limit, cursor })` |
| `list({ mine: true })` (REST) | `list({ author: 'me' })` |
| `get(key)` | `get(key)` |
| `update(key, value)` | `put(key, data)`, by the author |
| `withdraw(key)` | `delete(key)`, by the author |
| `vote(key)` / `unvote(key)` | `mark(key, 'vote')` / `unmark(key, 'vote')` |
| `count` on an item, `getCount(key)`, `getCounts(keys)` | `marks.vote` on the document; `getMany(keys)` for several |
| `viewerVoted` on an item | `viewer.marks.includes('vote')` |
| `authorUserId` on an item | `author` (`isViewer`, and `username` when the collection sets `showAuthor`); no user id |
| `report(key, reason?)` | `mark(key, 'report')` — no free-text reason, and it cannot be withdrawn |

Two things do not carry over from a legacy board:

- **Authorship.** A shared document is authored by the viewer whose token
  created it, and there is no app-owned write yet (`write: "owner"` is
  reserved). Copying a legacy board makes whoever runs the copy the author of
  every copied document: each one counts toward that viewer's quota and spends
  their shared write budget, and no other viewer can edit or delete it. Keep reading
  old rows from the legacy store, or have each author post again.
- **Votes.** A mark belongs to the viewer who set it, so legacy vote counts
  cannot become `vote` marks. They start at zero.

Two things still read **only** the legacy shared store, so keep using it for
them:

- **[App Store sub-listings](./sub-listings)**: `itemKey` must name a row the
  viewer wrote in the legacy shared store.
- **`sharedContentKey`** on a [`textToImage` body](../reference/generation/bodies):
  it resolves the author of a legacy shared-store row.

## Related

- [The `@civitai/sdk` client](./sdk) — `initialize()`, consent and the rest of `app`.
- [Scopes reference](../reference/scopes) — `apps:storage` and `apps:storage:publish` beside every other scope.
- [Manifest reference](../reference/manifest) — the `storage` property and its bounds.
- [Local dev loop](./local-dev) — the harness modes.
