---
title: CLI reference
description: The civitai CLI's App-authoring commands and flags, generated from the canonical Go CLI (civitai/cli).
sources:
  - go:github.com/civitai/cli#app
---

# CLI

The **`civitai` CLI** (Go, repo [`civitai/cli`](https://github.com/civitai/cli))
is the canonical tool for authoring Civitai Apps. Its `app` command group
scaffolds a correct project, validates it against the platform contract, and
packages + submits it for review.

::: warning This replaces the deprecated `@civitai/blocks-cli`
The old npm `@civitai/blocks-cli` (with `init` / `dev` / `deploy`) is
**deprecated**. Install the `civitai` binary instead — its authoring commands
below are the source of truth.
:::

## Install

Pick whichever fits — **npm** is the most convenient if you already have Node
(App authors usually do); the others need no Node toolchain:

```bash
# npm (a thin wrapper that downloads the matching prebuilt binary)
npm install -g @civitai/cli
# or, without installing:
npx @civitai/cli --help

# Homebrew (macOS / Linux)
brew install civitai/tap/civitai

# Go install (from source, Go 1.25+)
go install github.com/civitai/cli/cmd/civitai@latest
```

Prebuilt binaries for linux/macOS/windows × amd64/arm64 are on the
[GitHub Releases](https://github.com/civitai/cli/releases) page. Verify with
`civitai version`.

## Authenticate

Most `app` commands that talk to the platform need a stored credential:

```bash
civitai login                    # browser device login
# or a full-scope personal API key (needed for real Buzz-spend in dev:live):
civitai login --token <key>      # create the key at civitai.com/user/account
```

## The App lifecycle

The authoring flow is **create → validate → submit**, then **review** on
civitai.com. The platform rebuilds your app from source — there is **no
client-side `deploy`**.

```bash
civitai app create my-app        # scaffold a ready-to-build App
cd my-app
npm install && npm run dev:harness   # iterate locally against the mock host
civitai app validate             # local pre-check of block.manifest.json
civitai app submit               # package the SOURCE tree + submit for review
civitai app status               # track review / deploy state
```

`civitai app submit` enters your app into **moderator review** — it is not
published immediately. On approval the platform builds + deploys it and serves it
at `https://<blockId>.civit.ai/`.

The commands and flags below are generated from the `civitai app --help` command
tree.

<CliReference />

## Local dev against the real backend

The scaffold ships npm scripts for the inner dev loop (`npm run dev:harness` for
the mock host, `npm run dev:live` for the real backend). Two `app` subcommands
support the live loop and are **invite-gated during the pre-GA beta**:

- **`civitai app dev-token <slug>`** mints a short-lived dev block token for
  `npm run dev:live` (real backend). Real generation that spends Buzz needs a
  full-scope personal API key.
- **`civitai app dev-tunnel`** previews your **local** dev server rendered inside
  the real Civitai host (real session, real pickers, real Buzz) via a hardened
  reverse SSH tunnel.

See the [Quickstart](../guide/quickstart) for the end-to-end flow.
