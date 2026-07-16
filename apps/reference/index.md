---
title: Apps Reference
description: Generated-from-source reference for Civitai Apps — scopes, manifest, message bridge, React hooks, and the CLI.
---

# Reference

The pages in this section are **generated from source** on every build, so they
track the real platform contract instead of drifting from a hand-maintained
copy. Each page states its exact source at the top.

| Page | What it covers | Source of truth |
|------|----------------|-----------------|
| [Scopes](./scopes) | The scope catalog: what each scope authorizes, its OAuth bit, and its binding | `civitai` block-scope constants |
| [Manifest](./manifest) | Every `block.manifest.json` field, type, and constraint | the published JSON Schema |
| [Messages](./messages) | The full `postMessage` bridge protocol (payloads, directions, page-only) | `@civitai/app-sdk` + host parity inventory |
| [Hooks](./hooks) | Every `@civitai/blocks-react` hook: signature + example | `@civitai/blocks-react` types + README |
| [CLI](./cli) | The `@civitai/blocks-cli` commands and flags | `@civitai/blocks-cli` |

::: tip These pages regenerate on build
Reference artifacts are produced by `scripts/gen-appblocks-*.mjs` and land in a
gitignored `public/appblocks/`. `npm run gen:appblocks` (wired into `predev` /
`prebuild`) rebuilds them from the pinned SDK packages and the `civitai`
contract sources.
:::

## Pinned versions

The SDK-derived pages are generated from these published, pinned packages:

- `@civitai/app-sdk@0.24.0` — the framework-agnostic contract (messages, scopes, manifest schema).
- `@civitai/blocks-react@0.29.0` — the React hooks.
- `@civitai/blocks-cli@0.1.2` — the scaffolding + preflight CLI.

When the SDK publishes a new version, bumping the pin in `package.json` is a
one-line, reviewable change that flows through to every generated page.

## A note on authority

The generated tables describe the **shape** of the contract. The Civitai server
is the **enforcement boundary** — it validates more than these artifacts can
express (host allowlists, scope subsets, trust tiers). Where a generated page
and the server ever disagree, the server wins. Each page calls out the semantics
it can't capture.
