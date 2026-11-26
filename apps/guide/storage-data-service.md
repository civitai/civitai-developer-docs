---
title: Faster storage (the data service)
description: How @civitai/sdk (0.32.0 and later; use 0.33.0) sends an app's document store through Civitai's app-data service, which calls always go to civitai.com (imports, moderation, lists with where or another sort, OAuth tokens, direct REST calls), and what an app sees differently there.
sources:
  - npm:@civitai/sdk@0.33.0/dist/doc-store/index.d.ts
  - npm:@civitai/sdk@0.33.0#README
  - civitai-app-starters:packages/civitai-sdk/CHANGELOG.md
  - civitai-app-starters:packages/civitai-sdk/src/doc-store/index.ts
  - civitai-app-starters:packages/civitai-sdk/src/app/index.ts
---

# Faster storage (the data service) {#data-service}

From `@civitai/sdk` 0.32.0, Civitai can serve an app's document store through
its app-data service, which is built to answer storage reads and writes faster
and at a larger scale than civitai.com itself. Civitai turns it on per app, so
your code does not change: when it is on for your app, the host tells the SDK
at start-up, and `app.storage` sends its calls there on its own. The routing
arrived in `@civitai/sdk` 0.32.0; use 0.33.0 or later, the minimum for
[App Storage](./storage), and the block client from `initialize()`.
These do **not** get it:

- an older `@civitai/sdk`;
- a [local preview](./storage#local-development), which keeps its local store;
- **direct REST calls** to `/api/v1/blocks/storage` (your own `fetch`, `curl`,
  or any other client). They always go to civitai.com.

Even with the service on, these calls **always go to civitai.com**:

- every call on a collection opened through an [import](./storage#imports)
  (`collection(name, { from })`);
- [`app.moderation`](./storage#reporting), including `report`;
- a `list` that uses `where`, or a `sort` other than `key` or `-key`;
- **any call while the frame holds an OAuth token** rather than the block
  token. The SDK checks on every call, so if the host switches the frame to an
  OAuth token, the next call goes to civitai.com.

Everything else (`get`, `getMany`, `put`, `create`, `delete`, `getMine`,
`putMine`, `deleteMine`, `info()`, and a `list` filtered only by `keyPrefix`
or `author` and sorted by key) goes through the service when it is on. Things
to know:

- **Permissions do not change.** The same scopes, consent and per-call checks
  apply as on civitai.com ([Scopes and consent](./storage#scopes-and-consent)).
- **Your writes are visible to your next read** of the same collection from
  the same `app` client.
  A write that went to civitai.com (while the frame held an OAuth token, say)
  can take a moment to show up in a read served by the service.
- **A private collection's documents come back with `version: 0`**, and with
  `createdAt` and `updatedAt` at the epoch. Do not build an `ifVersion` from
  them: a stored document never has version `0`, so the write is refused
  `version_conflict` rather than overwriting.
- **Retries are the SDK's.** A briefly unavailable read is retried a few times;
  a write is retried only when it is certain it never reached the store.
- **`getMany` is several single reads** (at most 4 at a time), and stops at the
  first failure.
- **Some refusals are new.** The service answers with its own error codes,
  such as `floor_not_met`, `not_forwarded` and `outcome_unknown` (a write that
  may have landed: read it back before writing again). `StorageError.code`
  carries them.

## Related

- [Storing data (document store)](./storage) — collections, scopes, lists, errors and limits.
- [The `@civitai/sdk` client](./sdk) — `initialize()` and the rest of `app`.
