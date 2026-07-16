---
title: Apps Reference
description: Generated-from-source reference for Civitai Apps — scopes, manifest, message bridge, React hooks, and the CLI.
---

# Reference

The pages in this section are **regenerated from pinned sources** on every build,
rather than hand-maintained. Each page states its exact source at the top. How
"live" a page is depends on its source (see [Keeping this current](#keeping-this-current)):
the manifest and the other SDK-derived pages track pinned package versions,
while the scope catalog tracks a committed snapshot in CI.

| Page | What it covers | Source of truth |
|------|----------------|-----------------|
| [Scopes](./scopes) | The scope catalog: what each scope authorizes, its OAuth bit, and its binding | `civitai` block-scope constants |
| [Manifest](./manifest) | Every `block.manifest.json` field, type, and constraint | the published JSON Schema |
| [Messages](./messages) | The full `postMessage` bridge protocol (payloads, directions, page-only) | `@civitai/app-sdk` + host parity inventory |
| [Hooks](./hooks) | Every `@civitai/blocks-react` hook: signature + example | `@civitai/blocks-react` types + README |
| [CLI](./cli) | The `civitai` CLI's App-authoring commands and flags | the Go `civitai` CLI (`civitai/cli`) |

::: tip These pages regenerate on build
Reference artifacts are produced by `scripts/gen-appblocks-*.mjs` and land in a
gitignored `public/appblocks/`. `npm run gen:appblocks` (wired into `predev` /
`prebuild`) rebuilds them from the pinned SDK packages and the `civitai`
contract sources.
:::

## Keeping this current

Regeneration is automatic, but the **sources** the generators read are pinned —
so a real upstream change reaches these pages only after a maintainer refreshes
the relevant pin or snapshot. The refresh actions are:

| Page(s) | Source in CI | Refresh action |
|---------|--------------|----------------|
| [Manifest](./manifest) | the SDK-bundled canonical schema `@civitai/app-sdk/schemas/app-block/v1.json` (pinned devDep); committed `appblocks-snapshots/manifest-schema.json` is the CI-hermetic fallback, kept in lockstep with the pin | **Bump the `@civitai/app-sdk` version pin** (same one-line change as Messages/Hooks) — no live fetch. |
| [Messages](./messages) payload shapes, [Hooks](./hooks) | the pinned `@civitai/*` npm devDeps in `package.json` | **Bump the version pins** (`@civitai/app-sdk`, `@civitai/blocks-react`) — a one-line, reviewable change. |
| [CLI](./cli) | the committed `civitai app --help` snapshot (`appblocks-snapshots/civitai-cli-help.txt`) | **Re-capture** with a newer `civitai` binary: `node scripts/gen-appblocks-cli.mjs --write-snapshot`. |
| [Scopes](./scopes) + the [Messages](./messages) page-only / request-reply flags | committed `appblocks-snapshots/` (CI has no `civitai` checkout) | **Re-copy the 3 snapshot files** from `civitai@origin/main` (`block-scope.constants.ts`, `scope-descriptions.constants.ts`, `hostHandlerParity.ts`). |

On a machine that has the `civitai` sibling repo checked out, the scopes /
messages-parity generators read `civitai@origin/main` directly and only fall
back to the snapshot when it's absent — so those snapshots are the CI-hermetic
copy, not the live source.

> An automated CI drift-guard that fails the build when a snapshot or pin lags
> the upstream contract is planned (Phase 3). Until then, refreshing is a manual
> maintainer step, prompted by the `sources:` front-matter on each page.

## Pinned versions

The SDK-derived pages are generated from these published, pinned packages:

- `@civitai/app-sdk@0.24.0` — the framework-agnostic contract (messages, scopes, manifest schema).
- `@civitai/blocks-react@0.29.0` — the React hooks.

When the SDK publishes a new version, bumping the pin in `package.json` is a
one-line, reviewable change that flows through to every generated page.

The [CLI](./cli) page is generated separately, from a committed `civitai app
--help` snapshot of the canonical Go `civitai` CLI (`civitai/cli`) — not from an
npm package. Refresh it with `node scripts/gen-appblocks-cli.mjs
--write-snapshot` against a newer binary.

## A note on authority

The generated tables describe the **shape** of the contract. The Civitai server
is the **enforcement boundary** — it validates more than these artifacts can
express (host allowlists, scope subsets, trust tiers). Where a generated page
and the server ever disagree, the server wins. Each page calls out the semantics
it can't capture.
