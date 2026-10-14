---
title: CLI reference
description: The whole civitai CLI command tree, indexed by name and linked to the page that documents each command — commands, flags, examples and the global flags — generated from the canonical Go CLI (civitai/cli).
sources:
  - go:github.com/civitai/cli
---

# CLI

The **`civitai` CLI** (Go, repo [`civitai/cli`](https://github.com/civitai/cli))
is the canonical command-line tool for Civitai — searching and downloading
models, running generations, and authoring Apps. Its `app` command group
scaffolds a correct project, validates it against the platform contract, and
packages + submits it for review.

::: warning This replaces the deprecated `@civitai/blocks-cli`
The old npm `@civitai/blocks-cli` (with `init` / `dev` / `deploy`) is
**deprecated**. Install the `civitai` binary instead — its authoring commands
below are the source of truth.
:::

## Install

Pick whichever fits — **npm** is the most convenient if you already have Node;
the others need no Node toolchain:

```bash
# npm (a thin wrapper that downloads the matching prebuilt binary)
npm install -g @civitai/cli
# or, without installing:
npx @civitai/cli --help

# Homebrew (macOS only — see the note below)
brew install civitai/tap/civitai

# Go install (from source, Go 1.25+)
go install github.com/civitai/cli/cmd/civitai@latest

# Nix flake — run without installing:
nix run github:civitai/cli -- --help
# …or install into your profile:
nix profile install github:civitai/cli
```

::: warning Homebrew is macOS-only
The tap publishes a **cask**, not a formula — the CLI's release config carries
`homebrew_casks:` and no `brews:` stanza — and a cask is a macOS-only concept.
On Linux (Linuxbrew included) `brew install civitai/tap/civitai` has nothing to
install; use npm, the Nix flake, `go install`, or a prebuilt binary instead.
:::

The repo is a [Nix flake](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-flake.html),
so `nix run` / `nix profile install` need no Go toolchain (`x86_64`/`aarch64`
Linux and macOS). To pin the CLI as a flake input — the reproducible option for
a team devShell or CI — reference it in your `flake.nix`:

```nix
{
  inputs.civitai-cli.url = "github:civitai/cli";
  # …or pin a release tag from the Releases page:
  # inputs.civitai-cli.url = "github:civitai/cli/<tag>";

  outputs = { self, nixpkgs, civitai-cli, ... }: {
    # add `civitai-cli.packages.${system}.default` to your devShell / packages
  };
}
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

## Command reference

Every command is generated from the binary's own help output — the whole
`civitai` command tree, not just `app`. Alongside App authoring it covers
catalog browsing and downloads (`models`, `images`, `articles`, `collections`,
`creators`, `tags`, `users`, `model-versions`, `download`), image generation
(`generate`, `workflows` — these **spend Buzz**), account commands
(`login`, `whoami`, `buzz`, `upgrade`, `version`), and `agent-setup`, which
configures your coding agent for Civitai App development.

The commands are documented across the pages indexed below — `civitai app`
and `civitai app listing` first, then the catalog, generation and account
commands — so that each page's `.md` copy stays small enough for an agent's
fetch tool to read whole. The index names every command; the global flags
follow it.

Two `app` commands are badged **invite-only** — they are gated during the pre-GA
beta. The `completion` command (shell-completion scripts) is deliberately not
documented here; run `civitai completion --help` for it.

<ReferenceIndex kind="cli">
<!-- BEGIN GENERATED: cli-index — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

60 commands across 5 pages. Each link goes to the page that documents the command; fetch that page's `.md` for the full entry.

**[civitai app — authoring commands](./cli/app)** — Scaffold, validate, submit and operate an App: every `civitai app` command except the listing group.

- [`civitai app`](./cli/app#cli-app) — Browse, author, and ship Civitai Apps
- [`civitai app create`](./cli/app#cli-app-create) — Create a ready-to-build App (web components by default)
- [`civitai app init`](./cli/app#cli-app-init) — Scaffold a ready-to-build App project
- [`civitai app validate`](./cli/app#cli-app-validate) — Validate block.manifest.json against the App schema
- [`civitai app submit`](./cli/app#cli-app-submit) — Package and submit an App for review
- [`civitai app status`](./cli/app#cli-app-status) — Check the review/deploy status of your App submissions
- [`civitai app withdraw`](./cli/app#cli-app-withdraw) — Withdraw your own pending App submission
- [`civitai app list`](./cli/app#cli-app-list) — Discover published Apps in the store (GET /api/v1/apps)
- [`civitai app view`](./cli/app#cli-app-view) — Show one App's detail (GET /api/v1/apps/{slug})
- [`civitai app metrics`](./cli/app#cli-app-metrics) — Show your App's install / run / Buzz / engagement analytics
- [`civitai app dev-token`](./cli/app#cli-app-dev-token) — Mint a short-lived dev block token for `npm run dev:live`
- [`civitai app dev-tunnel`](./cli/app#cli-app-dev-tunnel) — Preview your LOCAL dev server inside the real Civitai host via a hardened tunnel
- [`civitai app pull`](./cli/app#cli-app-pull) — Clone or sync your app's repository from Civitai
- [`civitai app doctor`](./cli/app#cli-app-doctor) — Diagnose what is incomplete or blocked on your App store listings
- [`civitai app feedback`](./cli/app#cli-app-feedback) — Read the feedback users sent about your App, and triage it
- [`civitai app feedback flag`](./cli/app#cli-app-feedback-flag) — Flag a feedback row as abusive, for moderator review
- [`civitai app feedback set-status`](./cli/app#cli-app-feedback-set-status) — Mark a feedback row acknowledged, resolved or wont_fix

**[civitai app listing — store listing commands](./cli/app-listing)** — Edit an App's store listing: icon, cover, screenshots, text, source repo and revisions.

- [`civitai app listing`](./cli/app-listing#cli-app-listing) — Manage your App store-listing media (icon, cover, screenshots)
- [`civitai app listing set-icon`](./cli/app-listing#cli-app-listing-set-icon) — Set the listing icon (png, jpeg or webp, at most 2.0 MiB)
- [`civitai app listing set-cover`](./cli/app-listing#cli-app-listing-set-cover) — Set the listing cover (png, jpeg or webp, at most 4.0 MiB)
- [`civitai app listing add-screenshot`](./cli/app-listing#cli-app-listing-add-screenshot) — Add a screenshot (up to 8) with an optional caption
- [`civitai app listing rm-screenshot`](./cli/app-listing#cli-app-listing-rm-screenshot) — Remove a screenshot by its id (see `app listing status`)
- [`civitai app listing reorder`](./cli/app-listing#cli-app-listing-reorder) — Reorder screenshots (pass ALL current screenshot ids in the new order)
- [`civitai app listing status`](./cli/app-listing#cli-app-listing-status) — Show attached media and what's missing vs the publish floor
- [`civitai app listing set-source-repo`](./cli/app-listing#cli-app-listing-set-source-repo) — Set (or clear) the public source-repository link on your listing
- [`civitai app listing set-text`](./cli/app-listing#cli-app-listing-set-text) — Set your listing's tagline, description or category
- [`civitai app listing submit-revision`](./cli/app-listing#cli-app-listing-submit-revision) — Submit your live listing's open revision for moderator review

**[Catalog and download commands](./cli/catalog)** — Browse and search the public catalog, and download model files.

- [`civitai articles`](./cli/catalog#cli-articles) — Search and inspect articles on Civitai
- [`civitai articles get`](./cli/catalog#cli-articles-get) — Get an article by id (GET /api/v1/articles/{id})
- [`civitai articles search`](./cli/catalog#cli-articles-search) — Search articles (GET /api/v1/articles)
- [`civitai collections`](./cli/catalog#cli-collections) — Search and inspect collections on Civitai
- [`civitai collections get`](./cli/catalog#cli-collections-get) — Get a collection by id (GET /api/v1/collections/{id})
- [`civitai collections search`](./cli/catalog#cli-collections-search) — Search collections (GET /api/v1/collections)
- [`civitai creators`](./cli/catalog#cli-creators) — Search creators on Civitai
- [`civitai creators search`](./cli/catalog#cli-creators-search) — Search creators (GET /api/v1/creators)
- [`civitai download`](./cli/catalog#cli-download) — Download a model version's file(s)
- [`civitai images`](./cli/catalog#cli-images) — Search images on Civitai
- [`civitai images get`](./cli/catalog#cli-images-get) — Get a single image by id (GET /api/v1/images?imageId=\<id>)
- [`civitai images search`](./cli/catalog#cli-images-search) — Search images (GET /api/v1/images)
- [`civitai model-versions`](./cli/catalog#cli-model-versions) — Inspect model versions on Civitai
- [`civitai model-versions by-hash`](./cli/catalog#cli-model-versions-by-hash) — Get a model version by file hash (GET /api/v1/model-versions/by-hash/{hash})
- [`civitai model-versions get`](./cli/catalog#cli-model-versions-get) — Get a model version by id (GET /api/v1/model-versions/{id})
- [`civitai models`](./cli/catalog#cli-models) — Search and inspect models on Civitai
- [`civitai models get`](./cli/catalog#cli-models-get) — Get a model by id (GET /api/v1/models/{id})
- [`civitai models search`](./cli/catalog#cli-models-search) — Search models (GET /api/v1/models)
- [`civitai tags`](./cli/catalog#cli-tags) — Search model tags on Civitai
- [`civitai tags search`](./cli/catalog#cli-tags-search) — Search tags (GET /api/v1/tags)
- [`civitai users`](./cli/catalog#cli-users) — Look up users on Civitai
- [`civitai users get`](./cli/catalog#cli-users-get) — Look up a user by username or id (public search: GET /api/v1/users)

**[Generation commands](./cli/generation)** — Run generations and manage workflows. These spend Buzz.

- [`civitai generate`](./cli/generation#cli-generate) — Generate images from a text prompt (SPENDS BUZZ)
- [`civitai workflows`](./cli/generation#cli-workflows) — List, inspect and cancel generation workflows
- [`civitai workflows cancel`](./cli/generation#cli-workflows-cancel) — Cancel a running generation workflow (you are billed for what it delivered)
- [`civitai workflows get`](./cli/generation#cli-workflows-get) — Show one generation workflow and its outputs
- [`civitai workflows list`](./cli/generation#cli-workflows-list) — List the generation workflows you have submitted

**[Account, setup and utility commands](./cli/account-and-setup)** — Sign in, inspect your account and Buzz, configure your coding agent, and update the CLI.

- [`civitai agent-setup`](./cli/account-and-setup#cli-agent-setup) — Set up your coding agent (Claude Code, Cursor, Codex, …) to build Civitai Apps
- [`civitai buzz`](./cli/account-and-setup#cli-buzz) — Show your spendable Buzz balance
- [`civitai login`](./cli/account-and-setup#cli-login) — Authenticate with Civitai
- [`civitai upgrade`](./cli/account-and-setup#cli-upgrade) — Update the civitai CLI to the latest release
- [`civitai version`](./cli/account-and-setup#cli-version) — Print the CLI version, commit, and build date
- [`civitai whoami`](./cli/account-and-setup#cli-whoami) — Verify your stored API token and its capabilities

**Global flags**

Accepted by every `civitai` command, in addition to the flags listed with it.

| Flag | Description | Default |
|---|---|---|
| `--color` | force colored output even when stdout is not a TTY (also via CLICOLOR_FORCE) | — |
| `--no-color` | disable colored/styled output (also via NO_COLOR or CIVITAI_NO_COLOR) | — |
| `--no-update-check` | skip the background check for a newer release (also via CIVITAI_NO_UPDATE_CHECK) | — |
| `-v, --version` | version for civitai | — |

<!-- END GENERATED: cli-index -->
</ReferenceIndex>

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
