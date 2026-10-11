---
title: Apps Reference
description: Generated-from-source reference for Civitai Apps — scopes, manifest, message bridge, React hooks, and the CLI.
---

# Reference

The pages in this section are **regenerated from pinned sources** on every build,
rather than hand-maintained. Each page states its exact source at the top.
Manifest, Hooks and the Messages payload shapes follow pinned `@civitai/*`
package releases; Scopes, the Messages page-only flags, Components and the CLI
follow committed snapshots of their sources (the `civitai` repo's constants, the
`@civitai/components` markup contract and the CLI's `--help`). Either way, an upstream change reaches these pages when the
site re-pins or re-snapshots.

| Page | What it covers | Source of truth |
|------|----------------|-----------------|
| [Scopes](./scopes) | The scope catalog: what each scope authorizes, its OAuth bit, and its binding | `civitai` block-scope constants |
| [Manifest](./manifest) | Every `block.manifest.json` field, type, and constraint | the published JSON Schema |
| [Components](./components) | The `@civitai/components` design-system pack: each component's `data-civitai-ui` name, attributes, and ARIA markup | the `@civitai/components` `MARKUP.md` contract |
| [Messages](./messages) | The full `postMessage` bridge protocol (payloads, directions, page-only) | `@civitai/app-sdk` + host parity inventory |
| [Hooks](./hooks) | Every `@civitai/blocks-react` hook: signature + example | `@civitai/blocks-react` types + README |
| [CLI](./cli) | The `civitai` CLI's App-authoring commands and flags | the Go `civitai` CLI (`civitai/cli`) |

## A note on authority

The generated tables describe the **shape** of the contract. The Civitai server
is the **enforcement boundary** — it validates more than these artifacts can
express (host allowlists, scope subsets, trust tiers). Where a generated page
and the server ever disagree, the server wins. Each page calls out the semantics
it can't capture.
