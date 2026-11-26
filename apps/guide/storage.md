---
title: Storing data (document store)
description: Keep an app's data on Civitai with the document store — declare collections in the manifest, the apps:storage, apps:storage:publish and apps:storage:import scopes, documents, conditional writes, lists, viewer-keyed documents for votes, likes and one entry per viewer, reporting a document to moderators, the removed counters, marks, write "none" and publish, reaching another app's data through storage.imports and ?from=, what viewers can do with their own data, moderation, error codes, limits, local development, createFakeStorage, the REST routes, and moving off the legacy useAppStorage / useSharedStorage stores.
sources:
  - npm:@civitai/sdk@0.32.0/dist/doc-store/index.d.ts
  - npm:@civitai/sdk@0.32.0/dist/doc-store/fake.d.ts
  - npm:@civitai/sdk@0.32.0#README
  - civitai:public/schemas/app-block/v1.json#storage
  - civitai:public/schemas/app-block/storage-contract.v1.json
  - civitai:src/shared/constants/block-storage.constants.ts
  - civitai:src/server/services/apps/doc-store-api.ts
  - civitai:src/server/services/apps/doc-store-viewer-keyed.ts
  - civitai:src/server/services/apps/doc-store-report-api.ts
  - civitai:src/server/services/apps/doc-store-access.ts
  - civitai:src/server/services/apps/doc-store-ownership.ts
  - civitai:src/server/services/apps/doc-store-schema.ts
  - civitai:src/server/services/apps/storage-schema-migrations.ts
  - civitai:src/server/services/apps/storage-migration-run.service.ts
  - civitai:src/server/services/blocks/publish-request.service.ts
  - civitai:src/server/services/apps/doc-store.ts
  - civitai:src/server/services/apps/doc-store.types.ts
  - civitai:src/server/utils/shared-storage-rate-limit.ts
  - civitai:src/server/services/blocks/block-write-trust.service.ts
  - civitai:src/server/services/blocks/dev-scoped-mint.service.ts
  - civitai:src/server/routers/apps-mod-doc-store.router.ts
  - civitai:src/server/services/apps/storage-import-grant.service.ts
  - civitai:src/components/AppBlocks/BlockConsentModal.tsx
  - civitai:src/components/Account/AppStorageCard.tsx
  - civitai:src/shared/utils/app-storage-usage.ts
---

# Storing data (document store)

An app keeps its data on Civitai in the **document store**: JSON documents in
named **collections** that the app declares in its manifest. A collection is
either **private**, one key space per viewer, or **shared**, one key space every
viewer of the app reads. Shared collections carry authorship without any code
of yours on the server, and a shared collection can be
[**viewer-keyed**](#viewer-keyed): the server gives each viewer at most one
document of their own (per item, if you like), which is how a vote, a like, a
rating or one entry per viewer is stored. A document is reported to moderators
through the [report API](#reporting).

Use `app.storage.collection(name)` from [`@civitai/sdk`](./sdk)'s
`initialize()`, called in the block with **no token** (a React app adds it
beside `@civitai/blocks-react`: [porting](./porting#reading-and-writing)).
From 0.32.0 it can use Civitai's faster [data service](./storage-data-service).
The [REST API](#rest-reference) is for other clients and always goes to
civitai.com.

Minimum versions for this page: `@civitai/sdk` **0.32.0**, `@civitai/app-sdk`
**0.82.0**, `@civitai/blocks-react` **0.79.0**, `civitai` CLI **v0.1.136**.
A scaffolded app may pin an older SDK, and a caret range on a `0.x` version
never moves to the next minor, so check, and raise it if needed:

```bash
npm ls @civitai/sdk
npm install @civitai/sdk@latest
```

This store replaces `useAppStorage` / `app.storage.get` … `getQuota` and
`useSharedStorage` / `app.sharedStorage` (the `app-storage` and
`shared-storage` routes), which were **shut down on 2026-11-10** and answer
`410 Gone` ([Moving from the legacy stores](#moving-from-the-legacy-stores)).

## Removed: counters, marks, `write: "none"` and publish {#deprecated}

The document store is plain collections plus
[viewer-keyed documents](#viewer-keyed). Counters, marks and their tallies,
`write: "none"` and server-side `publish` / `unpublish` were **removed**:
their routes answer as unknown routes (`404`, or `405` for the `PATCH` of
`update`), and a list naming `markedBy` or `mark`, or sorting by `counter:` /
`mark:`, is refused. Build what they did on collections:

- **A vote, like or per-viewer flag:** the viewer's own document in a
  viewer-keyed collection.
- **A count:** list the viewer-keyed documents (`keyPrefix`) and count them;
  there is no server-side count, sum or sort by count.
- **A report:** the [report API](#reporting). An SDK older than 0.30.0 still
  files one with `mark(key, 'report')`.
- **Publish:** write the shared copies one by one with `put` / `delete`.

A version you submit may not add `marks`, `counters` or `write: "none"` to a
collection. One your previous approved version declared may stay, and does
nothing; a `write: "none"` collection is read-only until a version drops it.
Call by call: [Moving off counters, marks and publish](./votes-and-reports#moving-off).

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
      "requests": { "visibility": "shared", "write": "own",
                    "indexes": { "status": "string" }, "showAuthor": true },
      "votes":    { "visibility": "shared", "write": "own", "keyedBy": "parent+viewer" }
    }
  }
}
```

`votes` holds at most one document per viewer per request: a viewer's vote on
request `r1` is their own document there ([Viewer-keyed documents](#viewer-keyed)).

Each collection declares:

- **`visibility`** — `"private"`: each viewer has their own key space, and only
  that viewer reads or writes it. `"shared"`: one key space for the whole app,
  read by every viewer, signed-out viewers included.
- **`write`** — shared collections only, and required on them. `"own"`: signed-in
  viewers create documents, and only a document's author edits or deletes it.
- **`keyedBy`** — shared `write: "own"` collections only, optional.
  `"viewer"` or `"parent+viewer"`: the server derives each document's key from
  the signed-in viewer (and an item key you name), so each viewer has at most one
  document, or one per item. See [Viewer-keyed documents](#viewer-keyed).
- **`indexes`** — the fields of a document's `data` you can filter and sort by,
  as a map of field path to type (`string`, `number`, `boolean` or `time`). A
  path such as `status` or `meta.round` names a field inside `data`.
- **`showAuthor`** — shared only. When `true`, readers see the author's username.
  Otherwise they learn only whether they wrote a document themselves. The
  numeric user id is never exposed either way.
- **`ownedModelVersions`** — shared collections with `write: "own"` only. Fields
  of `data` that, when present, must hold a model version the writing viewer
  owns. See [Fields that must name the author's own model version](#owned-model-versions).
- **`schema`** — optional, on any collection that holds documents. A JSON Schema
  subset that every document's `data` must match. See
  [A schema for each document](#collection-schemas).
- **`exportable`** — optional, `true` when omitted. Whether another app may
  reach this collection, for a viewer who allows it, through an
  [import](#imports). Set `false` on a collection no other app should reach:
  every call to it through an import is then refused `not_exportable`.

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
- The app cannot delete documents on viewers' behalf: `write: "owner"`, which
  would make the app a writer, is reserved.

Every document not deleted that way stays charged to those quotas, and
declaring the old collection again is the only way to reach it again.

Changing an index's type is not supported; remove the index and add one under a
new name.

Some of the schema is reserved for later phases, and the server refuses it with
a message saying so. The [limits table](#limits) lists which fields are refused
today, and the [manifest reference](../reference/manifest) has the bounds of
each field, including the ones nested inside a collection (its
`storage.collections.<name>.*` rows). `ownedModelVersions` has its own rules
[below](#owned-model-versions).

The server's own manifest validation, which applies the reserved-feature
refusal and the [scope rules](#scopes-and-consent), runs when a moderator
approves the version (and on a direct git push), not when `civitai app submit`
uploads it. A declaration it refuses therefore waits in review until approval
fails, so check it before you submit.
`civitai app validate` mirrors those rules locally: the scope rules are errors, the reserved features are warnings, and it
warns when your source calls an undeclared collection or the store without its
scope ([Storage checks](./validate#storage)).

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
  `"anyone"` and `"owner"`.
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
  (`PUT /{collection}/{key}`, `put`) of a document. Deletes do not write
  `data` and are not checked.
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

### A schema for each document {#collection-schemas}

A collection can declare **`schema`**, and the server then refuses any document
whose `data` does not match it. Without a schema, a collection's documents are
not checked, so existing apps are unaffected.

```json
{
  "storage": {
    "collections": {
      "cards": {
        "visibility": "private",
        "schema": {
          "type": "object",
          "required": ["title"],
          "additionalProperties": false,
          "properties": {
            "title": { "type": "string", "minLength": 1, "maxLength": 40 },
            "tags": { "type": "array", "maxItems": 3, "items": { "enum": ["red", "green", "blue"] } }
          }
        }
      }
    }
  }
}
```

**Keywords.** Only a subset of JSON Schema exists here:

- `type`: one of `object`, `array`, `string`, `number`, `integer`, `boolean`,
  `null`, or a list of them.
- Object keywords: `properties`, `required`, and `additionalProperties`
  (`true`, `false` or a schema).
- Array keywords: `items` (one schema for every element), `minItems`, `maxItems`.
- String keywords: `minLength`, `maxLength`, `pattern`.
- Number keywords: `minimum`, `maximum`.
- Any type: `enum`, `const`, `description`.

Any other keyword (`format`, `$ref`, `oneOf` and the rest) is refused, and the
refusal names the keyword. A keyword the store would ignore can therefore never
look enforced.

**Bounds.** The [limits table](#limits) has the numbers:

- the schema's size in bytes of JSON;
- how many schemas may nest inside one another (the collection's own schema
  counts as one);
- how many `pattern`s it may declare, and how many all of the manifest's
  collection schemas may declare together (every place a pattern appears
  counts, even when the same pattern repeats);
- each pattern's length.

A schema with a `pattern` must also declare a `maxLength` on the same schema, so
a pattern only ever runs against a bounded string. A pattern must compile as a
JavaScript regular expression with the `u` flag. A pattern that can backtrack
catastrophically (such as `^(a+)+$`) is refused. A `minLength`, `minItems` or
`minimum` above its maximum is refused.

**What it means.** The same rules apply to every evaluator, including the CLI's
and the SDK's:

- A keyword for another type is ignored: `minLength` says nothing about a number.
- `integer` is a number with no fraction, and `number` includes integers.
- `null` is its own type, and an array is not an `object`.
- String lengths count code points, so an emoji is one character.
- `pattern` is unanchored (write `^…$` to match the whole string) and is a
  JavaScript regular expression with the `u` flag.
- `enum` and `const` compare JSON values: `1` does not equal `"1"`, and object
  key order does not matter.
- `required` and `additionalProperties` look at the object's own keys only.

**Which failure is reported.** When `data` fails in several places, only the
**first** is reported. Within one schema the order is:

1. `type`
2. `const`, then `enum`
3. the string, number and array keywords, with `maxLength` before `pattern`
4. `items`, element by element
5. `required`, in its declared order
6. the object's own keys, in ascending order, each against its `properties`
   entry or `additionalProperties`

**When it is checked.**

- On every create (`POST /{collection}`, `create`) and every replace
  (`PUT /{collection}/{key}`, `put`).
- A `put` replaces the whole body, so the check always sees the document that
  would be stored. Send the whole merged document, not a patch.
- Deletes do not write `data` and are not checked.
- The check runs before the [`ownedModelVersions`](#owned-model-versions)
  check, the minimum-trust gate, the shared write budget and
  [moderation](#moderation). A refused write is not stored and spends none of
  them.
- A schema change that could leave stored documents unwritable is refused at
  submit unless the version declares `migrations` for it, which run over the
  stored documents when the version is approved. See
  [Changing a collection's schema](#schema-changes).

A refusal is `400` with code `schema_violation`:

- `details.pointer` is the first failing JSON pointer (RFC 6901) into `data`.
  `""` is the root. `~` and `/` in a key are escaped as `~0` and `~1`.
- `details.keyword` is the keyword it failed.
- `details.collection` is the collection.
- The message names the pointer too. A pointer longer than 200 characters is cut
  short in the message, but `details.pointer` always carries it whole.

```json
{
  "code": "schema_violation",
  "message": "document does not match the schema of collection cards at \"/tags/1\": must be one of the schema's enum values",
  "error": "document does not match the schema of collection cards at \"/tags/1\": must be one of the schema's enum values",
  "details": { "collection": "cards", "pointer": "/tags/1", "keyword": "enum" }
}
```

The server enforces the schema whatever tooling you use. Checking offline:

- **`createFakeStorage`** in `@civitai/sdk`, and the dev-tunnel
  [local preview](#local-development) built on it, enforce the schema the way
  the server does: the same keywords, order, pointers and messages, and
  patterns read as JavaScript `u`-flag regular expressions. When the fake is created, a
  schema the server would refuse throws, with the server's message. It does not
  run the server's check for catastrophic backtracking.
- **`civitai app validate`** checks the subset and the bounds: the size, depth,
  pattern count, and min above max. The CLI is
  written in Go, whose regular-expression engine (RE2) is a different language
  from JavaScript's. A pattern RE2 cannot compile, such as a lookahead, is a
  **warning**: the CLI cannot check it, and the server decides at submit. A
  pattern RE2 does compile is not proven valid either: `(?i)x`, `\z` and `\pL`
  compile in RE2 and are refused by the server. The CLI does not check for
  catastrophic backtracking. See [Storage checks](./validate#storage).

### Changing a collection's schema {#schema-changes}

When you submit a version, the server compares each collection's `schema` with
the one in your app's **previous approved version**. It compares the two
declarations only and never reads a stored document. A change that could leave
a stored document unwritable is **breaking**, and the submit is refused unless
the collection's `migrations` covers it. These are breaking, at any depth
(inside `properties`, `items` or an `additionalProperties` schema):

- a property newly in `required`;
- a declared property removed while `additionalProperties` is `false`;
- `additionalProperties` newly `false`, or newly a schema;
- a `type` removed (`number` to `integer` counts);
- `enum` or `const` narrowed, or a `const` added;
- `minimum`, `minLength` or `minItems` added or raised; `maximum`, `maxLength`
  or `maxItems` added or lowered; `pattern` added or changed;
- a schema on a collection that had none. It is compared with a schema that
  accepts anything, so each constraint it adds is a breaking change of its own.

Loosening a bound, adding a `type` or an `enum` value, and declaring a new
optional property are not breaking. (A new optional property on a schema that
left undeclared keys open gets a warning: stored documents may already hold that
key with another type, and those are refused on their next write.) A first
version has nothing to compare against. A collection removed from the manifest
is a warning, not a refusal: its documents are kept, and come back if a later
version declares it again, compared with the last approved schema that declared
it.

The refusal is a `400` whose message lists each uncovered change as
`<collection> <pointer> <keyword>: <old> → <new>` (the first 20). The REST
response of `POST /api/v1/blocks/submit-version` also carries the whole list as
`storageBreakingChanges`, each entry `{ collection, pointer, keyword, old, new }`.
A pointer is a JSON Pointer into `data`: `""` is the document itself, and the
segment `*` stands for every array element (`items`) or every undeclared
property (an `additionalProperties` schema).

Say the approved version declares `cards` with `title` (`maxLength: 80`),
`color` and a `tags` array of `"red"`, `"green"`, `"blue"` or `"gold"`, under
`additionalProperties: false`. This next version breaks it in five places, and
four ops cover all of them:

```json
{
  "storage": {
    "collections": {
      "cards": {
        "visibility": "private",
        "schema": {
          "type": "object",
          "required": ["title", "status"],
          "additionalProperties": false,
          "properties": {
            "title": { "type": "string", "maxLength": 40 },
            "status": { "enum": ["draft", "published"] },
            "colour": { "type": "string", "maxLength": 20 },
            "tags": { "type": "array", "maxItems": 3, "items": { "enum": ["red", "green", "blue"] } }
          }
        },
        "migrations": [
          { "op": "default", "path": "/status", "value": "draft" },
          { "op": "rename", "from": "/color", "to": "/colour" },
          { "op": "remove", "path": "/tags" },
          { "op": "acknowledge", "path": "/title", "keyword": "maxLength" }
        ]
      }
    }
  }
}
```

| Op | Covers | What it does to a stored document |
|---|---|---|
| `default` | a newly required property, at exactly `path`. Nothing else can cover one. | Sets `value` where the field is missing and its parent object exists. `value` must match the new schema there, or the submit is refused, and is at most 4096 bytes of JSON. |
| `rename` | a declared property removed under `additionalProperties: false`, at `from` | Moves the value when `from` is present and `to` is absent. The new schema must allow `to`. |
| `remove` | every breaking change at or under `path`, as long as the new schema does not require that field | Deletes the value only where the new schema refuses it. A value that is valid under the new schema is kept. |
| `acknowledge` | exactly one change: the one whose pointer is `path` and whose keyword is `keyword`, matched literally, never as a prefix. `path` may be `""` or contain `*`, as in `"/tags/*"`. | Nothing. Documents that violate it stay stored and readable, and their next write is refused until it matches. `keyword` cannot be `required`: a newly required field needs a `default`. |

In the example, `{ "title": "a", "color": "teal", "tags": ["red", "gold"] }`
becomes `{ "title": "a", "status": "draft", "colour": "teal" }`: `tags` holds
`"gold"`, so it is removed. A document already in the new shape is left alone,
and a title longer than 40 characters stays as it is.

- `default`, `rename` and `remove` take paths of 1 to 15 segments with no `*`,
  and must touch disjoint fields: no path equal to or inside another's. Every
  op is idempotent, so a run that repeats a page changes nothing.
- 1 to 32 ops per collection.
- Only the ops that cover a breaking change of this version run. An op that
  covers nothing never runs and is listed in the submit response's
  `storageMigrationWarnings`, so a `migrations` list left in a later version
  does nothing. Remove it.
- No op can fill a newly required field inside an array element or an
  `additionalProperties` schema (`…/*/…`): declare it optional, or `remove` the
  whole optional array or object. A newly required object with a newly required
  field inside it takes two versions: first require the object, with a
  `default` that already holds the field, then require the field with its own
  `default`.

**When the ops run.** At approval. From that moment the new schema applies to
every write, including writes from a build that is still serving the old code.
The ops then run in the background over the collection's production documents:
every viewer's key space, hidden documents, and the documents
[forks](./forking) of your app wrote into it. Development and review data are
not migrated. Whatever the first pass does not finish is picked up by a job
that runs every 10 minutes. A migrated document is written like any other: its
`version` goes up, so a [conditional write](#conditional-writes) holding the
old version gets `version_conflict`, and its size counts against the quotas. A
document whose rewrite would be refused (over the size cap, for example) is
left as it was. A document that still does not match the new schema afterwards,
because an op acknowledged the change or the rewrite was refused, stays readable,
and its next write must match the new schema.

**What you can see.** There is no API that reports a run's progress or result
to you. What you can see is the submit's refusal or its
`storageMigrationWarnings`, and the documents themselves: read one, and a
migrated document has the new shape and a higher `version`. Until the run
reaches every document, your code will read documents in both shapes.

**Approving the next version.** While an earlier version's run is unfinished, a
moderator cannot approve a version that changes that collection's storage: one
whose migrations run on it, or one that declares its `schema`, `migrations`,
`visibility`, `write` or `exportable` differently. A version that leaves the
collection alone can be approved, and the run carries on. A version that is
rejected or withdrawn has its run closed, so the run blocks nothing.

The server applies all of this whatever tooling you use. The CLI checks only
the shape of the ops. Whether an
op covers a change depends on the previous approved version, which only the
server has, so that is decided at submit. An accepted
`civitai app submit` prints the server's `storageMigrationWarnings` under the
success line; a refused one prints the server's message, which lists each
uncovered change.

## Scopes and consent {#scopes-and-consent}

Three scopes:

| Scope | Lets your app | Is the viewer asked? |
|---|---|---|
| `apps:storage` | use any collection: reads, the viewer's private collections, deleting documents the viewer wrote (`deleteMine` included), and [reports](#reporting) | No, and it cannot be withdrawn |
| `apps:storage:publish` | let viewers create and edit documents other viewers read: a shared collection with `write: "own"`, a viewer-keyed `putMine` (a vote) included | Once per app, in the consent dialog; withdrawable under **Apps & permissions** (civitai.com/apps/activity). Needs a `scopeJustifications` entry |
| `apps:storage:import` | reach the viewer's documents in another app, through `storage.imports` ([imports](#imports)) | Once per source app: the dialog names the source, its collections, and whether your app reads or also changes them; each source's grant is withdrawable there too. Writing into the source's shared collections also needs the viewer's publish grant in the source ([Two consents](#import-consent)). Needs a `scopeJustifications` entry |

The same rules apply whether a call is served by the
[data service](./storage-data-service) or by civitai.com.

The rules the server's manifest validation enforces at approval (only the
`scopeJustifications` entry is checked earlier, when `civitai app submit`
uploads the version):

- Declaring any collection requires `apps:storage`.
- A shared collection with `write: "own"` requires `apps:storage:publish`,
  viewer-keyed ones included.
- Declaring any import requires `apps:storage:import`, and `apps:storage` too,
  even when the app declares no collections of its own.
- Declaring any of the three scopes with nothing in `storage` for it to reach is
  refused.
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

const page = await requests.list({ where: { status: 'open' }, sort: '-createdAt', limit: 20 });
for (const item of page.items) {
  console.log(item.data.title, item.author);
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
| `getMine(parent?)`, `putMine(data, { parent?, ifVersion? })`, `deleteMine({ parent?, ifVersion? })` | the viewer's own document in a [viewer-keyed](#viewer-keyed) collection |
| `parentOf(key)` | the item key a `parent+viewer` document's key names, or `null` |
| `app.storage.info()` | the declared collections, the [limits](#limits) and the usage so far; signed-in viewers only |

### Documents

A document is `{ key, data, version, createdAt, updatedAt, author }`:

- `data` is a JSON object. `version` goes up by one on every write to `data`.
  The SDK gives you `createdAt` and
  `updatedAt` as `Date`s; on the wire they are ISO strings.
- `author` is `{ kind: 'user', isViewer, username? }` for a viewer's document
  (`username` only in a `showAuthor` collection), or `{ kind: 'app' }`. It
  never carries a numeric user id.
- A reply from civitai.com also carries `counters: {}`, `marks: {}` and
  `viewer`, always empty, only for older SDKs that expect them. Do not read them.

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
| `sort` | `key` (the default), `createdAt`, `updatedAt` or a declared index; a leading `-` sorts descending |
| `author: 'me'` | only documents the viewer wrote |
| `keyPrefix` | only keys starting with this prefix; on a `parent+viewer` collection, `<parent>:` lists one item's documents |
| `limit` | page size; the server applies its own default and maximum |

The filters combine with AND. A filter or sort on an index lists only the
documents that **have** a value for that index. A `where` or `sort` on anything
undeclared is refused `index_not_declared`.

## Viewer-keyed documents {#viewer-keyed}

A shared `write: "own"` collection that declares **`keyedBy`** gives each
signed-in viewer at most one document of their own (`"viewer"`), or one per
item (`"parent+viewer"`), at a key the **server** derives from the verified
viewer. A vote, a like, a rating or one entry per viewer is an ordinary document
there, with a body, a `version`, a schema and moderation. The SDK calls are
`getMine(parent?)`, `putMine(data, { parent? })`, `deleteMine({ parent? })` and
`parentOf(key)`; over REST, `GET` / `PUT` / `DELETE /{collection}/@me[/{parent}]`.

In short: shared `write: "own"` only; a
viewer writes only their own document, and creates or writes by key are refused;
`keyedBy` cannot change once approved; keys are `<parent>:<digest>`; there are no
server-side aggregates, so count by listing with `keyPrefix: '<parent>:'`; and a
vote is a shared write, so `putMine` needs `apps:storage:publish`.
[Votes, likes and reports](./votes-and-reports) has the rules, every refusal
and a worked "votes" example.

## Who can do what {#who-can-do-what}

| Operation | Viewer | Scope | Other gates |
|---|---|---|---|
| Read a shared collection | anyone, signed out included | `apps:storage` | — |
| Read a private collection, `info()`, `author: 'me'` lists | signed in | `apps:storage` | — |
| Write or delete in a private collection | signed in | `apps:storage` | a write is checked against the collection's [`schema`](#collection-schemas) when declared |
| Create or edit in a shared `"own"` collection | signed in | `apps:storage` + `apps:storage:publish` | the minimum-trust gate, moderation, the shared write budget, and the collection's [`schema`](#collection-schemas) and [`ownedModelVersions`](#owned-model-versions) checks when declared (in that order, before the trust gate, moderation and the budget); editing another viewer's document is refused `not_author`, or `schema_violation` / `resource_not_owned` first when its `data` fails those checks |
| Delete in a shared `"own"` collection | signed in, the author | `apps:storage` | — |
| `putMine` in a [viewer-keyed](#viewer-keyed) collection | signed in | `apps:storage` + `apps:storage:publish` | as creating or editing in a shared `"own"` collection; refused `write_policy` (`viewer_keyed_closed`) while the collection is closed |
| `getMine`, `deleteMine` in a viewer-keyed collection | signed in | `apps:storage` | `deleteMine` refused while the collection is closed, as `putMine` |
| Report a document ([report API](#reporting)) | signed in | `apps:storage` | the minimum-trust gate, the daily report limit |

Signed-out viewers get `sign_in_required` for everything but shared reads, so
gate write affordances on `app.viewer`, and render shared reads regardless.
Every call also needs an approved app, and for a signed-in viewer an account
that may run apps; otherwise it is refused `not_eligible` with `details.reason`
`app_not_approved` or `apps_disabled`.

The **minimum-trust gate** applies to a viewer's writes into shared collections
(other than deleting their own) and to reports. It is about the
viewer's account, not your app: a refusal is `not_eligible` with
`details.reason` set to `ineligible`, `restricted`, `onboarding_incomplete`,
`email_unverified` or `account_too_new`. Treat it as a normal outcome and show
the viewer why, rather than as an error.

## Another app's data: imports {#imports}

An app can read, and write, a viewer's documents in **another** app. A fork
reaching the data its users already keep in the app it was forked from is the
case this exists for ([Forking an app](./forking)). Declare each source app
under `storage.imports`, then call that app's collection with
`?from=<its blockId>`.

```json
{
  "blockId": "my-notes-fork-ab12",
  "scopes": ["apps:storage", "apps:storage:import"],
  "scopeJustifications": {
    "apps:storage:import": "This app is a fork of My Notes. It reads and updates the notes you already keep in My Notes."
  },
  "storage": {
    "imports": [
      { "from": "my-notes", "collections": ["notes", "board"], "access": "readwrite" }
    ]
  }
}
```

Each import declares:

- **`from`** — the source app's `blockId`. One import per source app, and never
  the app itself.
- **`collections`** — which of the source's collections the import reaches. A
  name the source does not declare is refused when it is called,
  `collection_not_declared` with `details.from`.
- **`access`** — `"read"`, or `"readwrite"` to write as well. Through a `"read"`
  import every write and delete is refused `write_policy` with
  `details.reason: "import_read_only"`.

`storage.collections` is optional once `storage.imports` is there: an app that
only reaches other apps' data declares no collections of its own. The bounds
are in the [limits table](#limits).

### What a call through an import does {#import-calls}

Every collection route takes `?from=`, with the same method, path, body and
reply. `info` does not: it refuses `from` as an unknown query parameter, so a
source app's limits and usage cannot be read through an import.

- **It runs in the source app, as the same viewer**, in the source's production
  data. A private collection holds that viewer's own documents in the source,
  and a shared one reads as the source shows it to them. A write follows the
  source collection's `write` policy and [`schema`](#collection-schemas), is
  stored with the viewer as its author, and counts toward the source's
  [quotas](#limits).
- **It is charged twice.** Each call is first charged to the calling app's read
  limit for the viewer. After that it is gated as a call made in the source:
  the source's rate limits, shared write budget, minimum-trust gate and
  [moderation](#moderation) all apply.
- **It needs a signed-in viewer**, for reads of shared collections too
  (`sign_in_required`).
- **It goes one hop.** A source app's own imports are never followed.
- **It needs an ordinary token** of an approved app, in production. A
  `civitai app dev-token` token, a dev-tunnel preview, a hub token and a
  moderator's review run are refused `not_eligible`, with `details.reason`
  `import_dev_token`, `import_hub_token`, `import_in_review` or
  `import_namespace`. Imports therefore cannot be tried with a dev token: test
  against [`createFakeStorage`](#testing), then on the approved app.
- **The source must be available.** It must be an approved app
  (`source_not_approved` otherwise). A mature-rated source is refused on a host
  that cannot show it (`import_source_rating`). A collection the source
  declares `exportable: false` is refused `not_exportable`.

### Two consents {#import-consent}

**`apps:storage:import`, in your app.** The consent prompt lists each source app
and its collections, and says whether your app "reads" them or "reads and
changes" them. The grant is recorded per viewer, per your app and per source
app, with the collections and access the viewer was shown. When a newer version
of your app imports more (another collection, or `"read"` widened to
`"readwrite"`), the old grant does not cover it, and calls are refused
`consent_required` with
`details: { "scope": "apps:storage:import", "from": "<source>" }` until the
viewer allows again:

```json
{
  "code": "consent_required",
  "message": "apps:storage:import has not been granted",
  "error": "apps:storage:import has not been granted",
  "details": { "scope": "apps:storage:import", "from": "my-notes" }
}
```

Ask with [`app.requestGrants(['apps:storage:import'])`](./sdk#consent-app-requestgrants),
and pass a `signal` to bound the wait: without `from` it has no timeout of its
own, and a viewer who presses "Not now" sends nothing. A token minted before the viewer's grant stopped covering the import can still
carry the scope, so fetch a fresh token first (`app.getToken({ fresh: true })`).

**`apps:storage:publish`, in the source app.** A create, put, `putMine` or
report in one of the source's **shared** collections acts on
what other viewers of the source see, so it also needs the viewer's own `apps:storage:publish`
grant **in the source app**. The import grant is not that consent, and your
app's own publish grant is never consulted. Without it the write is refused
`consent_required` with
`details: { "scope": "apps:storage:publish", "from": "<source>" }`. Neither a
delete nor a write to the viewer's private collections in the source needs it.
The source app's own approved manifest must declare `apps:storage:publish`, or
the grant cannot be given, and an app can declare that scope only when it has a
shared collection with `write: "own"`.

To ask for it, the block sends
`REQUEST_CONSENT { scopes: ['apps:storage:publish'], from: '<source blockId>' }`,
with exactly that one scope:

- On the app page (`/apps/run/<slug>`) the host opens the consent prompt **for
  the source app**. The prompt names the source app and tells the viewer that
  what your app adds there appears publicly under their account. It also tells
  them that the permission is given to the source app, so the source app can
  do the same. On **Allow** the host re-mints the token and pushes
  `TOKEN_REFRESH`. Retry the write then; the token's scopes do not change,
  because the grant is the source's.
- For a `from` your app does not import with `"readwrite"`, the prompt offers
  nothing to allow. A request that is malformed (another scope alongside, or a
  `from` that is not a blockId) gets `CONSENT_UNAVAILABLE`.
- In a model slot the host answers `CONSENT_UNAVAILABLE` and opens nothing.

::: warning "Not now" sends nothing
When the viewer presses **Not now**, the host sends the block no message at all.
The block cannot tell a dismissed prompt from one still open, and a
`TOKEN_REFRESH` the host pushes for its own reasons looks the same as one that
follows an Allow. So retry the write once after the next `TOKEN_REFRESH`, treat
that retry's answer as the authority (a refusal means no grant), give up after
a timeout, and do not ask again until the viewer acts again.
:::

### Calling it {#import-rest}

Over REST, add `from` to the query string. This works with any client today:

```bash
# The viewer's notes in my-notes, read by my-notes-fork-ab12 with its own block token
curl -s "https://civitai.com/api/v1/blocks/storage/notes?from=my-notes&limit=20" \
  -H "Authorization: Bearer $BLOCK_TOKEN"

# Write one, as the viewer, into my-notes
curl -s -X PUT "https://civitai.com/api/v1/blocks/storage/notes/n1?from=my-notes" \
  -H "Authorization: Bearer $BLOCK_TOKEN" -H "Content-Type: application/json" \
  -d '{"data":{"value":{"text":"Carried over from the original app"}}}'
```

The same call without `from` reaches your app's own `notes` collection, a
separate key space that starts empty. A worked example, with each reply, is in
[Forking an app](./forking#worked-example).

`app.storage.collection(name, { from })` sends `from` on every call it
makes. When a write through it is refused for want of publish consent in the
source, `app.storage` asks the host once and retries once on the next
host-pushed `TOKEN_REFRESH`, within 60 seconds. `storageImportRefusal(error)`
types the refusals, `app.requestGrants(['apps:storage:publish'], { from })`
asks directly, and `useRequestConsent()` passes `from` too.

```ts
import { initialize, storageImportRefusal } from '@civitai/sdk';

const app = await initialize();
const notes = app.storage.collection<{ value: { text: string } }>('notes', { from: 'my-notes' });

try {
  await notes.put('n1', { value: { text: 'Carried over from the original app' } });
} catch (error) {
  const refusal = storageImportRefusal(error);
  if (refusal?.kind !== 'import_consent') throw error;
  await app.getToken({ fresh: true });
  // "Not now" sends nothing, so bound the wait; a timeout rejects, and counts as "no".
  const granted = await app
    .requestGrants(['apps:storage:import'], { signal: AbortSignal.timeout(60_000) })
    .catch(() => false);
  if (granted) {
    await notes.put('n1', { value: { text: 'Carried over from the original app' } });
  }
}
```

## Moderation {#moderation}

Every create or edit in a shared collection is scanned before it is stored:
every string value and object key in `data`, and on `put` the document key (on
a viewer-keyed `putMine`, the parent instead: the derived digest is never
scanned).

- A refusal is `content_rejected` (422). `details.category` is coarse (`link`,
  `unreviewable` or `blocked`) and never the matched text.
- When the scan cannot run, the write is refused `moderation_unavailable` (503)
  with a `Retry-After`; retry after it.

Viewers report documents through the [report API](#reporting). Moderators see
reported shared documents across apps and can **hide** one (it then reads as
not found to your app and to every viewer, and a write to its key is refused
`not_found`; a viewer whose own viewer-keyed document was hidden cannot
`putMine` that item again while it is hidden), **unhide** it, **delete** it, or
**dismiss** its reports and keep it. Reports filed after a dismissal reopen it.

### Reporting a document {#reporting}

`app.moderation.report({ collection, key, from? })`
(`POST /api/v1/blocks/moderation/reports`) reports one document of a shared
collection. It needs a signed-in viewer and `apps:storage`, answers
`{ reported: true }` (never a count), spends the daily report limit and cannot
be withdrawn. It is served for every app; the SDK rejects `report_unavailable`
only against an older civitai.com, or while the route is rolled back. Details in
[Reporting a document](./votes-and-reports#reporting).

## Errors {#errors}

Every refusal has one shape, whichever layer refused:

```json
{ "code": "version_conflict", "message": "version conflict", "error": "version conflict", "details": { "currentVersion": 3 } }
```

Branch on `code`; `message` is prose and `error` repeats it. `details` carries
what the code needs (`currentVersion`, `reason`, `category`, `ceiling`,
`bucket`, `pointer`, `keyword`, `collection`, `scope`, `from`, `retryAfter`). A refusal that names a wait sends a `Retry-After`
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
| `invalid_request` | 400 | The request is malformed: a bad key, body, query parameter (a `from` that is not a blockId included), value or cursor, or withdrawing a report. |
| `index_not_declared` | 400 | A `where` or `sort` names a field the collection does not declare. |
| `schema_violation` | 400 | The document's `data` does not match its collection's declared `schema`. The message and `details.pointer` name the first failing JSON pointer into `data` (`""` is the root); `details.keyword` names the keyword it failed and `details.collection` the collection. Nothing is stored and nothing is spent. |
| `unauthenticated` | 401 | No usable token. |
| `sign_in_required` | 401 | The operation needs a signed-in viewer: writes, reports, `info`, any read of a private collection, `author=me` lists, and every call through an import (`?from=`), shared reads included. |
| `insufficient_scope` | 403 | The token does not carry `apps:storage`. |
| `consent_required` | 403 | The viewer has not granted a consent-gated scope the call needs, or withdrew it: `apps:storage:publish` for a shared write; through an import, `apps:storage:import` (or a grant that does not cover what this version imports), or `apps:storage:publish` in the source app. `details.scope`, when present, names the scope, and `details.from` the source app. Ask with `requestGrants`. |
| `import_not_declared` | 403 | A call through an import (`?from=`) names a source app or collection that the app's approved manifest does not import, or names the app itself. |
| `not_exportable` | 403 | Through an import: the source app declares the collection `exportable: false`. |
| `not_eligible` | 403 | The app or the viewer cannot use storage here. `details.reason` says which, for example `app_not_approved` or `account_too_new`; through an import, also `import_dev_token`, `import_hub_token`, `import_in_review`, `import_namespace`, `source_not_approved` or `import_source_rating`. |
| `not_author` | 403 | Only a document's author may change or delete it. |
| `write_policy` | 403 | The collection's `write` policy does not let viewers write documents, or the import is read-only (`details.reason` `import_read_only`). |
| `hook_rejected` | 403 | The collection's permission hook refused the write. `details.cause` is `denied` when the hook said no (the message is its reason), or why the hook failed (`error`, `timeout`, `oom`, `stack_overflow`, `invalid_result`). |
| `resource_not_owned` | 403 | A field the collection declares in `ownedModelVersions` holds a model version the writing viewer does not own (or one that does not exist, is deleted, or is not a positive integer). `details.pointer` names the field. |
| `not_found` | 404 | No such document (hidden documents read the same way), or no such route. |
| `collection_not_declared` | 404 | The collection is not declared in the app's approved manifest (in a moderator's review run, the pending one). Through an import, the source app does not declare it, and `details.from` names the source. |
| `version_conflict` | 409 | An `ifVersion` write found another version. `details.currentVersion` is the one stored. |
| `index_building` | 409 | Declared for a later phase; not raised today. |
| `cursor_expired` | 410 | Declared for a later phase; not raised today. |
| `removed` | 410 | Not raised today: the removed mark, counter and publish routes answer as unknown routes (`404`, or `405` for `PATCH`). |
| `too_large` | 413 | The document or the request body is over its limit. |
| `quota_exceeded` | 413 | A quota is full. `details.ceiling` names which one. |
| `content_rejected` | 422 | Moderation refused a shared write. `details.category` is coarse and never the matched text. |
| `rate_limited` | 429 | A rate limit or the shared write budget is spent. Wait `Retry-After` seconds. |
| `storage_disabled` | 503 | The document store is not enabled on this server. |
| `moderation_unavailable` | 503 | A shared write could not be reviewed right now. Retryable after `Retry-After`. |
| `hook_unavailable` | 503 | The collection's permission hook could not be run, so the write was refused. Retryable. |
| `consent_unavailable` | 503 | The viewer's consent state could not be read. Retryable. |
| `service_unavailable` | 503 | A dependency could not be read. Retryable. |
| `internal_error` | 500 | A server fault. |
| `method_not_allowed` | 405 | The path exists, not for this method. The `Allow` header lists the methods it takes. |
| `not_supported_here` | 501 | Through the data service: the call is one the service does not serve (an import). The SDK sends those to civitai.com. |
| `stale_major` | 409 | Through the data service: the request named a schema major that is not the current one. |

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
| Lists | Page size (`limit`) | default 25, at most 100 |
| Lists | Equality filters (`where`) | 1, on a declared index |
| Lists | Keys in one `getMany` | 100 |
| Lists | Cursor length | 512 characters |
| Declaration | Collections per app | 16 |
| Declaration | Indexes per collection | 4, each a field path of up to 3 segments, typed `string`, `number`, `boolean`, `time` |
| Declaration | Owned model-version fields (`ownedModelVersions`) | 1 to 4 distinct pointers per collection, each matching `^(/[A-Za-z_][A-Za-z0-9_]{0,63}){1,4}$`; shared collections with `write: "own"` only |
| Declaration | Collection document schema (`schema`) | the keywords `type`, `properties`, `required`, `additionalProperties`, `items`, `enum`, `const`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `minItems`, `maxItems`, `description`; at most 16,384 bytes (16 KiB) of JSON, 16 nested schemas and 16 patterns per collection, and 32 patterns across all of the manifest's collection schemas; a `pattern` of at most 256 characters, on a schema with a `maxLength` of at most 1,000 |
| Declaration | Imports (`storage.imports`) | at most 8, one per source app and never the app itself, each naming 1 to 16 distinct collections, with `access` `"read"` or `"readwrite"` |
| Declaration | An import's source (`from`) | the source app's `blockId`, matching `^[a-z][a-z0-9-]{1,38}[a-z0-9]$` |
| Declaration | Refused by the server (not available yet) | `write: "anyone"`, `write: "owner"`, `kind: "log"` (and `maxEntries`), `ttlSeconds`, `dailyWritesPerAuthor`, `registry` |
| Quota | Per app | 52,428,800 bytes (50 MiB) and 1,000,000 documents |
| Quota | Per viewer, within one app | 2,097,152 bytes (2 MiB) and 1,000 documents on a free account; a paid membership raises both, and `info().limits.viewerBytes` / `viewerDocs` report the signed-in viewer's own |
| Rate | Reads (`info`, `list`, `get`, `getMany`) | 300 a minute per viewer, or per IP address for a signed-out viewer |
| Rate | Writes to private collections, and every delete | 120 a minute per viewer |
| Rate | Reports | 20 a day per viewer |
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
  in another app. A shared document counts toward its author's per-viewer quota.
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
content, that account's documents are removed from every app's store
too.

## Your users control their data {#user-controls}

Viewers can see and remove what apps keep for them, without your app's help:

- **Account settings → Security & Apps → App storage** lists every app the
  viewer keeps production data in, with a bar for their use of that app's
  per-viewer [quota](#limits), and a **Near limit** badge from 80% of either
  the bytes or the documents.
- On the app page, the host shows the viewer a notice when they are at 80% or
  more of either, checked once each time the app is opened.
- **Empty** deletes the viewer's private documents in one app. A checkbox,
  off by default, also deletes the shared documents they wrote there (their
  votes in viewer-keyed collections included), which disappear for every
  viewer. Documents moderation hid stay.
- **Deleting a Civitai account** offers "Also delete my data in apps", off by
  default. Ticked, the account's private documents, the shared documents it
  wrote are removed from every app 7 days after the deletion.
  Restoring the account in that time cancels the removal, and a legal hold on
  the account postpones it for as long as the hold stands.

So a document your app wrote for a viewer can be gone the next time they open
it, and a shared list can get shorter. Treat a `null` from `get` and a missing
key as normal states, not errors.

## Local development {#local-development}

- **`dev:live` does not reach the document store.** The `page-money` harness
  forwards the block→host bridge, and the document store is not on the bridge:
  `@civitai/sdk` calls it over HTTP, and that template does not use
  `@civitai/sdk`. (The `page-elements` template, which does, has no `dev:live`
  script.)
- **The dev tunnel** (`civitai app dev-tunnel`) mints a token without either
  storage scope. The preview's document
  store is local to the tab: the host marks the frame
  `storageMode: 'local-preview'`, and the SDK serves `app.storage.collection(name)`
  and `app.storage.info()` from an in-memory store that enforces your local
  manifest's declarations, sending nothing to `/api/v1/blocks/storage/*`
  (`app.storage.mode` reads `'local-preview'`). The manifest reaches the SDK only
  through `blockManifestPlugin()` on the Vite dev server; without it every call
  is refused `local_preview_no_manifest`. `ownedModelVersions` is not checked
  locally. `requestGrants` in a preview treats `apps:storage` and
  `apps:storage:publish` as held instead of asking the host, which refuses them.
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
    storage: { collections: { requests: { visibility: 'shared', write: 'own' } } },
  },
  viewer: { username: 'alice' },
});

const created = await requestsIn(fake.storage).create({ title: 'Dark mode', status: 'open' });

// The same store, as other callers.
const bob = requestsIn(fake.as({ viewer: { username: 'bob' } }).storage);
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
  `ownedModelVersions`.
- It enforces a collection's
  [`ownedModelVersions`](#owned-model-versions) rule. The fake has no model
  versions of its own, so it checks writes against the viewer's
  `modelVersions`, the ids that viewer owns; the default is none, so every id is
  refused, as the server refuses a version that is not the writer's:
  `fake.as({ viewer: { username: 'bob', modelVersions: [4317] } })`.
- It enforces a collection's
  [`schema`](#collection-schemas) as the server does
  (`schema_violation`, the same pointers and messages), and throws when it is
  created on a schema the server would refuse, except for the server's check for
  catastrophic backtracking, which it does not run.
- It serves [imports](#imports): pass
  `blockId` and `sources` (the other apps, each with its own manifest, `status`
  and `consent`) and `importGrants`, and act as a source with `as({ app })`.
  Its `requestGrants` option stands in for the host's prompt for publish
  consent in a source. A `token: 'dev'` caller is refused every import, as on
  the server.
- It serves [viewer-keyed collections](#viewer-keyed) (`getMine`, `putMine`,
  `deleteMine`, with the server's refusals) from `@civitai/sdk` 0.30.0;
  `viewerKeyedClosed: ['votes']` closes a collection, to test
  `viewer_keyed_closed`. It serves the [report API](#reporting) only with
  `reports: true`. The fake's default is off, so your default tests exercise
  the `report_unavailable` path; civitai.com serves the route for every app.
- It still serves the removed `update` (and `publish` with `publish: true`),
  which civitai.com no longer does: do not build on them.
- It does not model moderator hides, the review namespace, or a failed
  ownership lookup (the server's retryable `503 service_unavailable`).

## REST reference {#rest-reference}

For clients other than a block. A block uses [`@civitai/sdk`](#reading-and-writing):
direct calls always go to civitai.com, never the [data service](./storage-data-service).

Base URL `https://civitai.com/api/v1/blocks/storage`, with
`Authorization: Bearer <block token>`. Every route needs `apps:storage` on the
token. Bodies and responses are JSON; refusals use the [envelope](#errors).
Block origins are allowed by CORS, including the opaque `Origin: null` of a
sandboxed block, with `PUT`, `DELETE` and `PATCH` in the preflight and
`Retry-After`, `Deprecation` and `Link` exposed.

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | (the base URL) | — | `info`: `{ collections, limits, usage }` |
| `GET` | `/{collection}` | — | a page: `{ items, nextCursor }` |
| `POST` | `/{collection}` | `{ data }` | `201`, the created document |
| `POST` | `/_get/{collection}` | `{ keys }` | `{ items }`, in the order of `keys`, `null` for each miss |
| `GET` | `/{collection}/{key}` | — | the document, or `404 not_found` |
| `PUT` | `/{collection}/{key}` | `{ data, ifVersion? }` | the stored document |
| `DELETE` | `/{collection}/{key}` | — (`?ifVersion=` in the query) | `{ deleted }` |
| `GET` | `/{collection}/@me` | — | `keyedBy: "viewer"`: the viewer's document, or `404 not_found` |
| `PUT` | `/{collection}/@me` | `{ data, ifVersion? }` | `keyedBy: "viewer"`: the stored document |
| `DELETE` | `/{collection}/@me` | — (`?ifVersion=` in the query) | `keyedBy: "viewer"`: `{ deleted }` |
| `GET` | `/{collection}/@me/{parent}` | — | `keyedBy: "parent+viewer"`: the viewer's document for `parent`, or `404 not_found` |
| `PUT` | `/{collection}/@me/{parent}` | `{ data, ifVersion? }` | `keyedBy: "parent+viewer"`: the stored document |
| `DELETE` | `/{collection}/@me/{parent}` | — (`?ifVersion=` in the query) | `keyedBy: "parent+viewer"`: `{ deleted }` |

The report API is a separate route,
`POST https://civitai.com/api/v1/blocks/moderation/reports` with
`{ collection, key, from? }`, answering `{ reported: true }`
([Reporting a document](#reporting)).

A list takes these query parameters, each at most once:
`where[<index>]=<value>`, `sort`, `author=me`, `keyPrefix`, `limit` and
`cursor`. Every route but `info` also takes `from`,
to reach another app's collection through an [import](#imports). A `where` value is read by the index's
declared type: a number for `number`, `true` or `false` for `boolean`, and an
ISO-8601 string or epoch milliseconds for `time`. Any other query parameter, on
any route, is refused `invalid_request` rather than ignored. A path that exists
answers a method it does not take with `405 method_not_allowed` and an `Allow`
header.

```bash
curl -s "https://civitai.com/api/v1/blocks/storage/requests?where%5Bstatus%5D=open&sort=-createdAt&limit=20" \
  -H "Authorization: Bearer $BLOCK_TOKEN"
```

## Moving from the legacy stores {#moving-from-the-legacy-stores}

`useAppStorage`, `useSharedStorage`, `app.storage.get/set/delete/list/getQuota`,
`app.sharedStorage` and the routes under `/api/v1/blocks/app-storage/*` and
`/api/v1/blocks/shared-storage/*` were **shut down on 2026-11-10** and answer
`410 Gone`. How each call maps onto the document store, and what does not carry
over, is in [Moving from the legacy stores](./storage-legacy).

## Troubleshooting {#troubleshooting}

- **`civitai app validate` or `submit` refuses `ownedModelVersions`, `schema`, `storage.imports`, `exportable`, `apps:storage:import` or `migrations` as an unknown property:** the CLI is older than the key (v0.1.128 for `ownedModelVersions`, v0.1.135 for `schema` and imports, v0.1.136 for `migrations`). Upgrade the CLI.
- **`civitai app submit` is refused with "storage.collections.‹name›.marks: marks were removed and cannot be declared on a new app …" or "… not declared on this collection by the previous approved version, and marks were removed …" (or the same for `counters` or `write: "none"`):** remove the declaration, and use a [viewer-keyed collection](#viewer-keyed) and the [report API](#reporting) instead ([Removed](#deprecated)).
- **`civitai app validate` refuses `keyedBy` as an unknown property:** the CLI predates viewer-keyed collections. Upgrade it once a release that knows `keyedBy` is out.
- **`getMine`, `putMine` or `app.moderation` is not a function (before 0.30.0), every store call in a `civitai app dev-tunnel` preview is refused `insufficient_scope` (before 0.18.0), or a write passes in [`createFakeStorage`](#testing) but civitai.com refuses it `schema_violation` or `resource_not_owned` (before 0.23.0 / 0.16.0):** `@civitai/sdk` is too old. Upgrade it.

## Related

- [Faster storage (the data service)](./storage-data-service) — which calls it serves.
- [Votes, likes and reports](./votes-and-reports) — viewer-keyed collections, the report API, and replacing counters and marks.
- [Moving from the legacy stores](./storage-legacy) — `useAppStorage` / `useSharedStorage` calls on the document store.
- [The `@civitai/sdk` client](./sdk) — `initialize()`, consent and the rest of `app`.
- [Forking an app](./forking) — what a fork starts with, and how it reaches its parent's data.
- [Scopes reference](../reference/scopes) — `apps:storage`, `apps:storage:publish` and `apps:storage:import` beside every other scope.
- [Manifest reference](../reference/manifest) — the `storage` property, each collection field, and their bounds.
- [Local dev loop](./local-dev) — the harness modes.
