---
title: Manifest reference
description: Every block.manifest.json field, generated from the canonical JSON Schema.
sources:
  - https://civitai.com/schemas/app-block/v1.json
  - civitai:public/schemas/app-block/v1.json
  - '@civitai/app-sdk/schemas/app-block/v1.json'
  - civitai:src/server/services/block-manifest-validator.service.ts
---

# Manifest

Every app ships a `block.manifest.json` that declares its identity, the scopes
it needs, and how it renders. The platform publishes the **canonical JSON Schema
(Draft 2020-12)** for this file at
[`https://civitai.com/schemas/app-block/v1.json`](https://civitai.com/schemas/app-block/v1.json).
Set that URL as your manifest's `$schema` for editor validation. The table below
is generated from the **same canonical schema** — the one the `@civitai/app-sdk`
and the `civitai` CLI vendor and validate against — so it never drifts from what
the server accepts.

<JsonSchemaTable />

## Required fields

`blockId`, `version`, `name`, `contentRating`, and `scopes` are always required.
`iframe.src` is **server-owned** — do not set it (see below); the platform stamps
the canonical bundle URL during build/approve.

Note the tightened constraints the schema now surfaces (all server-enforced):

- **`blockId`** — a DNS-label slug: lowercase, starts with a letter, 3–40 chars,
  `^[a-z][a-z0-9-]*[a-z0-9]$`. It becomes `<blockId>.civit.ai`.
- **`version`** — semantic version (`x.y.z`, optional `-prerelease`), not just any
  non-empty string.
- **`scopes`** — each entry must be one of the known scopes (the enum in the
  table above), not merely a well-formed `a:b:c` string. See [Scopes](./scopes).

## Optional fields worth calling out

- **`category`** (enforced) — an optional marketplace category for the app's
  `/apps` store listing. If present it must be one of the enum values in the
  table; an unknown value is **rejected** at submit time. Omit it to let a
  moderator categorise the app.
- **`assetBundleUrl`** (enforced) — an optional v2 surface. Must be a public
  `https://` URL on an origin registered in your app's OAuth-client
  `allowedOrigins` (SSRF + origin binding); private, non-HTTPS, or off-origin
  values are rejected.
- **`type`** and **`minApiVersion`** (informational) — accepted but **not
  enforced** by the validator. Safe to include as documentation; don't treat
  them as load-bearing.

## Server-owned fields

Some fields appear in the schema for completeness but are **owned by the
platform** — a value you submit is normalized or overridden server-side:

- **`iframe.src`** — normalized and host-allowlisted at registration. You don't
  point this at your own host; the platform serves your app from
  `https://<slug>.civit.ai/`.
- **`trustTier`** — always assigned by the server; a submitted value is ignored.

## What the schema can't express (the validator wins)

The JSON Schema describes the manifest's **shape and enums**. The authoritative
`BlockManifestValidator` at submit time additionally enforces semantic rules
that JSON Schema can't:

- **SSRF host allowlisting** on `iframe.src`.
- **Scope ⊆ OAuth-client** — your declared `scopes` must be a subset of the
  app's OAuth-client allowed bits (see [Scopes](./scopes)).
- **Sandbox-token allowlisting by trust tier.**
- **`buildCommand` allowlist** — only a fixed set of build invocations is
  permitted. The published schema only bounds the length; the **validator**
  carries the positive allowlist regex and additionally rejects shell
  metacharacters. A `buildCommand` that passes local schema validation can still
  be rejected at submit time.
- **`outputDir` traversal** — the schema blocks a leading `/`; the validator also
  rejects `..`, backslashes, and other traversal/escape sequences.

In two small spots the published schema is *marginally stricter* than the
runtime validator: it locks `type` to `["block"]` and requires `outputDir`
whenever `buildCommand` is set, whereas the validator ignores `type` and
defaults `outputDir`. The server validator is the true gate — and it enforces
**more** than the schema elsewhere (the semantic rules above) — so don't
over-constrain based on the table alone.

::: warning The validator is the enforcement boundary
A manifest can pass local JSON-Schema validation and still be rejected at submit
time. If the schema and the validator ever conflict, **the validator wins.**
:::
