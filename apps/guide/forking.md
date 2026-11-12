---
title: Forking an app
description: Forking a Civitai App — how an author opts a listing in, what the copy starts from and leaves out, how its manifest is rewritten (blockId, repository, iframe.src, storage.imports), what is not inherited, the "Forked from" credit, reaching the parent's data through an import, a worked example, and publishing a fork with today's tooling.
sources:
  - civitai:src/server/services/blocks/app-fork-start.service.ts
  - civitai:src/server/services/blocks/app-fork.service.ts
  - civitai:src/shared/constants/app-fork.constants.ts
  - civitai:src/shared/constants/block-storage.constants.ts
  - civitai:src/server/services/apps/doc-store-access.ts
  - civitai:src/server/services/apps/doc-store-api.ts
---

# Forking an app

An author can let other people **fork** their app: copy its source into their
own App Assistant workspace, change it, and publish it as a **new** app. The
fork keeps a link back to the original for credit only. It can also reach the
data its users already keep in the original, through a storage
[import](./storage#imports), so their entries carry over instead of starting
empty.

## Letting others fork your app {#opt-in}

Forking is off until the author turns it on. The app's owner, or a
collaborator, ticks **"Let others fork this app's source"** on the live app's
Details tab. Only apps hosted on Civitai can be forked: an external app has no
source here to copy.

Turning it off stops new forks. Forks that already exist stay up.

What you are sharing:

- **Your latest approved source.** The copy is built from the commit the
  platform recorded when your latest version was approved, never from a branch
  an unreviewed push could move.
- **Minus the usual places a secret sits** (see [below](#seed)). This is a
  list of file names, not a scan: a token hard-coded in an ordinary source file
  is copied like the rest of that file. Keep secrets out of your source.
- **Not your earnings, approvals or data.** A fork does not share your
  earnings. Your users' data stays in your app: a fork reaches it only for a
  viewer who allows that, and only as that viewer. What it writes there counts
  toward your app's quotas and limits, as that viewer's own writes would. Set
  `exportable: false` on any collection no other app should reach.

## Forking {#fork}

A viewer forks from the app's store page, or from the **⋮** menu of the running
app. While forking is rolling out, the **Fork** button shows only to accounts
that have App Assistant and that the rollout has reached. The original must be
publicly visible in the store, running an approved version, and opted in.

A viewer can start up to 5 forks an hour and 20 a day.

The fork gets a new `blockId`, `<parent>-fork-<4 hex digits>` (the parent's
part is shortened so the whole stays within 40 characters), and App Assistant
opens a workspace holding the copy, ready to set up and preview.

The fork also gets its own **source repository**, `civitai-apps-src/<fork>`,
seeded with exactly the copied files as one commit. Its `Forked-From-App` and
`Forked-From-Commit` trailers come from the platform's record of the fork, never
from the manifest. App Assistant commits each save there, and
`civitai app pull <dir> --app <fork>` clones it (CLI 0.1.139 or later). Nothing
builds from it: see [Your app's git repositories](./repositories).

### What the copy starts from {#seed}

The parent's approved source, with these left out:

- `.git` metadata, and any path with a segment starting `.env`;
- `node_modules` at any depth, and top-level build output: `dist`, `build`,
  `out`, `.next`, `.turbo`, `.vercel`, `.cache`, `.output` and `coverage`;
- key files (`.pem`, `.key`, `.p12`, `.pfx`, `.p8`, `.ppk`, `.jks`,
  `.keystore`, and `id_rsa`-style SSH keys);
- the common credential files (`.npmrc`, `.yarnrc`, `.yarnrc.yml`, `.netrc`,
  `.pypirc`, `.git-credentials`, `.dev.vars`, `.pgpass`, `.htpasswd`,
  `credentials.json`) and directories (`.ssh`, `.aws`, `.docker`, `.gnupg`,
  `.kube`).

An app whose copy would be over 25 MiB zipped, 100 MiB unzipped or 5,000 files
cannot be forked.

### How the manifest is rewritten {#manifest}

`block.manifest.json` in the copy is changed in four ways, and is otherwise the
parent's:

- **`blockId`** becomes the fork's, so the copy publishes as a new app rather
  than as an update of the parent.
- **`repository`** is removed: it is the parent's source link, and left in it
  would show on the fork's store page as the fork's.
- **`iframe.src`** is removed. It is [server-owned](../reference/manifest#server-owned-fields),
  and the server stamps the fork's own on submit. A fork started from an older
  copy can still carry the parent's `iframe.src`, which `civitai app validate`
  refuses: delete it, and the platform sets your own.
- **`storage.imports`** gains an import from the parent: every collection the
  parent declares that is not `exportable: false` (at most 16), with
  `access: "readwrite"`. `scopes` gains `apps:storage` and
  `apps:storage:import`, and `scopeJustifications` gains a default entry for
  `apps:storage:import` unless one is set. An existing import from the parent
  is replaced. Nothing is added when the parent declares no collection other
  apps may reach, or when the manifest already holds the most imports allowed.

The default justification reads:

> This app is a fork of ‹parent name›. It reads and updates the data you already
> keep in ‹parent name›, so your entries carry over instead of starting empty.

All of it is yours to edit or remove before you publish, and the fork's own
review decides what it may have.

### What is not inherited {#not-inherited}

Only files. A fork starts with no approval, no viewer's consent to any scope,
no goods sales or entitlements, and no share of the parent's earnings. Its
first version goes through its own publish review like any new app, and paid
goods in its code can sell only once that review approves them. Viewers grant
the fork its permissions themselves, the import included.

### "Forked from" {#provenance}

A published fork shows **"Forked from ‹parent›"** on its store page, linking to
the parent, and the parent's page counts its forks. The link comes only from
the server's record of the fork, never from anything in the manifest, so a
parent cannot be claimed or forged. It is applied when:

- the person who forked submits the fork's first version,
- under the fork's `blockId`, unchanged,
- within 30 days of forking.

Rename the `blockId` before publishing and the fork publishes with no credit.
When the parent is later hidden or removed, the line reads "Forked from an app
that is no longer available".

## Reaching the parent's data {#parent-data}

The copy declares the parent's collections as its **own**, and its code still
calls them. Those are new, empty collections that belong to the fork. The
pre-filled import does nothing until the code asks for the parent's
collection by passing `from`:

- over REST, `?from=<parent blockId>` on the collection route;
- with `@civitai/sdk` 0.23.0 or later,
  `app.storage.collection(name, { from: '<parent blockId>' })`.

What such a call does, the consents it needs, and every refusal are in
[Another app's data: imports](./storage#imports). In short:

- Each viewer allows `apps:storage:import` in the fork before any call reaches
  the parent, reads included.
- The call runs in the parent as that viewer: their private documents there,
  the parent's shared collections as the parent shows them, and the parent's
  `schema`, write policy, quotas and limits.
- Writing to the parent's **shared** collections (create, put, and a counter or
  mark, through either API) also needs the viewer's `apps:storage:publish` **in
  the parent**. A delete does not. The parent can only be granted that scope if it declares it,
  which needs a shared `write: "own"` collection, so when its only shared
  collections are `write: "none"`, votes, likes and counts through the import
  never work.

Decide what the fork needs. Change `access` to `"read"` to copy entries over
without ever writing back, name fewer collections, or remove the import and
the scope if the fork keeps only its own data. A narrower import is a smaller
consent prompt and an easier review.

## Worked example {#worked-example}

A fork `my-notes-fork-ab12` of `my-notes`. The parent keeps each viewer's
notes in a private collection `notes`, whose `schema` requires a `value`
object. The fork's manifest imports it:

```json
{
  "blockId": "my-notes-fork-ab12",
  "scopes": ["apps:storage", "apps:storage:import"],
  "scopeJustifications": {
    "apps:storage:import": "This app is a fork of My Notes. It reads and updates the data you already keep in My Notes, so your entries carry over instead of starting empty."
  },
  "storage": {
    "collections": {
      "notes": { "visibility": "private" }
    },
    "imports": [
      { "from": "my-notes", "collections": ["notes"], "access": "readwrite" }
    ]
  }
}
```

Every call below uses the fork's block token for one signed-in viewer, against
`https://civitai.com/api/v1/blocks/storage`. These are the replies production
gave, with the app names, collection name, keys and timestamps replaced.

**1. Before the viewer allows the import**, a read and a write through it are
both refused:

```http
GET /notes?from=my-notes
```

```json
{
  "code": "consent_required",
  "message": "apps:storage:import has not been granted",
  "error": "apps:storage:import has not been granted",
  "details": { "scope": "apps:storage:import", "from": "my-notes" }
}
```

**2. After the viewer allows it**, the same list answers `200` with a page,
`{ items, nextCursor }`, holding the documents that viewer had written in
`my-notes`.

**3. A write through the import** lands in the parent, as the viewer:

```http
PUT /notes/from-fork?from=my-notes
Content-Type: application/json

{ "data": { "value": { "id": "from-fork" } } }
```

```json
{
  "key": "from-fork",
  "data": { "value": { "id": "from-fork" } },
  "version": 1,
  "createdAt": "2026-11-03T12:00:00.000Z",
  "updatedAt": "2026-11-03T12:00:00.000Z",
  "author": { "kind": "user", "isViewer": true },
  "counters": {},
  "marks": {},
  "viewer": { "marks": [] }
}
```

`GET /notes/from-fork?from=my-notes` returns the same document. The parent app,
with its own token for the same viewer, reads it too at `GET /notes/from-fork`.

**4. Without `from`**, the fork reaches its own `notes`, which is empty:
`GET /notes/from-fork` answers `404`:

```json
{ "code": "not_found", "message": "document not found", "error": "document not found" }
```

**5. The parent's schema applies.** A put of `{ "data": {} }` through the
import is refused against `my-notes`'s `schema`, and nothing is stored:

```json
{
  "code": "schema_violation",
  "message": "document does not match the schema of collection notes at \"/value\": is required",
  "error": "document does not match the schema of collection notes at \"/value\": is required",
  "details": { "collection": "notes", "pointer": "/value", "keyword": "required" }
}
```

**6. A delete through the import**, `DELETE /notes/from-fork?from=my-notes`,
answers `200` with `{ "deleted": true }`.

## Publishing a fork {#publishing}

A fork is published like any app ([Review, approval and deploy](./review-and-deploy)),
with two things to check first:

- **Use `civitai` CLI 0.1.135 or later.** It validates `storage.imports`,
  `exportable` and the `apps:storage:import` scope offline. 0.1.134 and older
  refuse the pre-filled manifest, in both `civitai app validate` and
  `civitai app submit`.
- **Delete `iframe.src` from `block.manifest.json`** if the copy has it: a
  fork started from an older copy can still carry the parent's. `civitai app
  validate` refuses it and the platform sets your own, so there is nothing to
  keep (see [How the manifest is rewritten](#manifest)). Delete the key rather
  than reaching for `civitai app submit --skip-validate`, which also skips
  every other check.

Keep the `blockId` the fork was given if you want the "Forked from" credit
([above](#provenance)).

To work on the fork outside App Assistant, clone its source repository with
`civitai app pull <dir> --app <fork>`, then submit from that checkout with
`civitai app submit`. Pushing to the source repository keeps your history on
the platform but never submits anything
([Pushing](./repositories#push)).

## Related

- [Storing data: imports](./storage#imports) — `storage.imports`, `?from=`, the two consents and every refusal.
- [Your store listing](./store-listing) — the listing a published fork gets.
- [Manifest reference](../reference/manifest) — `storage.imports` and `exportable`.
