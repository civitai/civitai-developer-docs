---
title: Manifest reference
description: Every block.manifest.json field, generated from the canonical JSON Schema.
sources:
  - https://civitai.com/api/blocks/manifest-schema
  - civitai:src/pages/api/blocks/manifest-schema.ts#MANIFEST_JSON_SCHEMA
  - civitai:src/server/services/block-manifest-validator.service.ts
---

# Manifest

Every app ships a `block.manifest.json` that declares its identity, the scopes
it needs, and how it renders. The platform publishes the **canonical JSON Schema
(Draft 2020-12)** for this file at
[`https://civitai.com/api/blocks/manifest-schema`](https://civitai.com/api/blocks/manifest-schema);
the table below is generated straight from it, so it never drifts from what the
server accepts.

<JsonSchemaTable />

## Required fields

`blockId`, `version`, `name`, `contentRating`, and `scopes` are always required.
For an iframe-mode block, `iframe.src` is required too (it is server-owned — see
below).

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
  permitted (the schema `pattern` is the positive allowlist; the server also
  rejects shell metacharacters).
- **`outputDir` traversal** — no leading `/`, no `..`.

::: warning The validator is the enforcement boundary
A manifest can pass local JSON-Schema validation and still be rejected at submit
time. If the schema and the validator ever conflict, **the validator wins.**
:::
