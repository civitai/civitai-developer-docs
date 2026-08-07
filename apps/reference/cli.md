---
title: CLI reference
description: The whole civitai CLI command tree — commands, flags, examples and the global flags — generated from the canonical Go CLI (civitai/cli).
sources:
  - go:github.com/civitai/cli
# 🔴 PAGE-LOCAL OUTLINE DEPTH. The site default is `outline: { level: [2, 3] }`
# (.vitepress/config.mts), which on this page means the right sidebar lists the
# page sections plus the 17 top-level commands — and NOT `app submit`,
# `app validate` and the other 11 `app <cmd>` entries, which were outlined
# before the reference widened. That is a real navigation downgrade for this
# page's primary audience: App authors reach `app submit` more often than
# `civitai tags`. Widening to [2, 4] restores every entry that used to be there
# and adds the rest, at the cost of a longer sidebar (measured: 23 entries at
# [2,3] vs 52 at [2,4]). A command reference is precisely the page where the
# outline IS the index, so the longer sidebar is the right trade. h5 —
# `app listing <sub>` — stays out deliberately, so the outline reads as
# "groups and their commands" rather than every media leaf.
outline: [2, 4]
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

# Nix flake — run without installing:
nix run github:civitai/cli -- --help
# …or install into your profile:
nix profile install github:civitai/cli
```

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

Every command below is generated from the binary's own help output — the whole
`civitai` command tree, not just `app`. Alongside App authoring it covers
catalog browsing and downloads (`models`, `images`, `articles`, `collections`,
`creators`, `tags`, `users`, `model-versions`, `download`), image generation
(`generate`, `workflows` — these **spend Buzz**), and account commands
(`login`, `whoami`, `buzz`, `upgrade`, `version`).

`civitai app` and its subcommands come first; the rest follow alphabetically.
Two `app` commands are badged **invite-only** — they are gated during the pre-GA
beta. The `completion` command (shell-completion scripts) is deliberately not
documented here; run `civitai completion --help` for it.

<CliReference>
<!-- BEGIN GENERATED: cli — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**Global flags**

Accepted by every `civitai` command, in addition to the flags listed with it.

| Flag | Description | Default |
|---|---|---|
| `--color` | force colored output even when stdout is not a TTY (also via CLICOLOR_FORCE) | — |
| `--no-color` | disable colored/styled output (also via NO_COLOR or CIVITAI_NO_COLOR) | — |
| `--no-update-check` | skip the background check for a newer release (also via CIVITAI_NO_UPDATE_CHECK) | — |
| `-v, --version` | version for civitai | — |

**`civitai app`**

Browse, author, and ship Civitai Apps

```bash
  civitai app list
  civitai app view my-block
  civitai app create my-block
  civitai app validate ./my-block
  civitai app submit ./my-block
  civitai app status
  civitai app metrics my-block
  civitai app withdraw pubreq_01H
  civitai app dev-token my-block
```

**`civitai app create [name] [dir]`**

Create a ready-to-build App (batteries-included, SDK money-path)

```bash
  # A page-money app in ./my-block (the batteries-included default).
  civitai app create my-block

  # "My Cool Block" -> slug my-cool-block, dir ./my-cool-block.
  civitai app create "My Cool Block"

  # Same as init: a no-build static app.
  civitai app create my-block --template static

  # Custom output directory (slug stays my-block; created in ./apps/foo).
  civitai app create my-block --dir ./apps/foo
```

| Flag | Description | Default |
|---|---|---|
| `--dir string` | output directory (default ./\<slug>) | — |
| `--from string` | fork from an existing published app slug (not yet wired) | — |
| `--name string` | display name (default derived from the name argument) | — |
| `-t, --template string` | project template: static \| page-vite \| page-money | `page-money` |
| `-y, --yes` | non-interactive: never prompt (use flags/defaults; fail if a name is missing) | — |

**`civitai app init [name] [dir]`**

Scaffold a ready-to-build App project

```bash
  # A no-build static app in ./my-block.
  civitai app init my-block

  # A page-money app; "My Cool Block" -> slug my-cool-block, dir ./my-cool-block.
  civitai app init "My Cool Block" --template page-money

  # Custom output directory (slug stays my-block; created in ./apps/foo).
  civitai app init my-block --dir ./apps/foo

  # Name, slug, and dir all independent.
  civitai app init my-block ./apps/foo --name "My Block"
```

| Flag | Description | Default |
|---|---|---|
| `--dir string` | output directory (default ./\<slug>) | — |
| `--from string` | fork from an existing published app slug (not yet wired) | — |
| `--name string` | display name (default derived from the name argument) | — |
| `-t, --template string` | project template: static \| page-vite \| page-money | `static` |
| `-y, --yes` | non-interactive: never prompt (use flags/defaults; fail if a name is missing) | — |

**`civitai app validate [dir]`**

Validate block.manifest.json against the App schema

```bash
  civitai app validate            # the current directory
  civitai app validate ./my-block
  civitai app validate --strict   # treat warnings as failures
  civitai app validate --json     # raw JSON result (scriptable)
```

| Flag | Description | Default |
|---|---|---|
| `--json` | emit the validation result as JSON (scriptable) | — |
| `--strict` | treat warnings as failures (non-zero exit) | — |

**`civitai app submit [dir]`**

Package and submit an App for review

```bash
  civitai app submit                 # validate + package + confirm + submit
  civitai app submit --yes           # skip the confirmation prompt (scripts/CI)
  civitai app submit --package-only  # just write the .zip (safe preview, never submits)
  civitai app submit -o my-block.zip ./my-block
```

| Flag | Description | Default |
|---|---|---|
| `-o, --out string` | output .zip path (default: \<blockId>-\<version>.zip) | — |
| `--package-only` | only write the .zip; do not attempt submission | — |
| `--skip-validate` | skip manifest validation before packaging | — |
| `-y, --yes` | skip the confirmation prompt and submit (for scripts/CI) | — |

**`civitai app status [blockId]`**

Check the review/deploy status of your App submissions

```bash
  civitai app status                 # list all your submissions
  civitai app status my-block        # detail for the my-block app
  civitai app status --id pubreq_01H # detail by publish-request id
  civitai app status --json          # raw JSON (scriptable)
```

| Flag | Description | Default |
|---|---|---|
| `--id string` | look up a single submission by publish-request id (pubreq_...) | — |
| `--json` | emit raw JSON (scriptable) | — |

**`civitai app withdraw [pubreq-id]`**

Withdraw your own pending App submission

```bash
  civitai app withdraw pubreq_01H        # withdraw by publish-request id
  civitai app withdraw --id pubreq_01H   # same, via the flag
```

| Flag | Description | Default |
|---|---|---|
| `--id string` | the publish-request id to withdraw (pubreq_...) | — |
| `-y, --yes` | accepted for symmetry with 'app submit' (withdraw is non-interactive; no-op) | — |

**`civitai app listing`**

Manage your App store-listing media (icon, cover, screenshots)

```bash
  civitai app listing status
  civitai app listing set-icon ./assets/icon.png
  civitai app listing set-cover ./assets/cover.png
  civitai app listing add-screenshot ./shot.png --caption "Grid view"
  civitai app listing rm-screenshot alsc_01H...
  civitai app listing reorder alsc_02 alsc_01 alsc_03
```

**`civitai app listing set-icon <file>`**

Set the listing icon (a square-ish image)

| Flag | Description | Default |
|---|---|---|
| `--changelog string` | changelog for the moderator review (used only when the listing is already live) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |
| `-y, --yes` | skip the live-listing revision confirmation | — |

**`civitai app listing set-cover <file>`**

Set the listing cover (a landscape hero image)

| Flag | Description | Default |
|---|---|---|
| `--changelog string` | changelog for the moderator review (used only when the listing is already live) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |
| `-y, --yes` | skip the live-listing revision confirmation | — |

**`civitai app listing add-screenshot <file>`**

Add a screenshot (up to 8) with an optional caption

| Flag | Description | Default |
|---|---|---|
| `--caption string` | optional one-line caption for the screenshot | — |
| `--changelog string` | changelog for the moderator review (used only when the listing is already live) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |
| `-y, --yes` | skip the live-listing revision confirmation | — |

**`civitai app listing rm-screenshot <screenshotId>`**

Remove a screenshot by its id (see `app listing status`)

| Flag | Description | Default |
|---|---|---|
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app listing reorder <screenshotId...>`**

Reorder screenshots (pass ALL current screenshot ids in the new order)

| Flag | Description | Default |
|---|---|---|
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app listing status`**

Show attached media and what's missing vs the publish floor

| Flag | Description | Default |
|---|---|---|
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app list`**

Discover published Apps in the store (GET /api/v1/apps)

```bash
  civitai app list
  civitai app list --kind onsite --sort popular --limit 10
  civitai app list --category generation --json
  civitai app list --cursor '<next-cursor-from-a-previous-page>'
```

| Flag | Description | Default |
|---|---|---|
| `--category string` | filter by marketplace category (generation, games, utility, discovery, moderation, analytics, other) | — |
| `--cursor string` | pagination cursor from a previous response | — |
| `--json` | print the raw API JSON response (for scripting) | — |
| `--kind string` | filter by kind (all, onsite, offsite) | — |
| `--limit int` | results per page (1-50) | — |
| `--sort string` | sort order (top-rated, popular, newest, name) | — |

**`civitai app view <slug>`**

Show one App's detail (GET /api/v1/apps/{slug})

```bash
  civitai app view my-cool-app
  civitai app view my-cool-app --json
```

| Flag | Description | Default |
|---|---|---|
| `--json` | print the raw API JSON response (for scripting) | — |

**`civitai app metrics <slug>`**

Show your App's install / run / Buzz / engagement analytics

```bash
  civitai app metrics my-block
  civitai app metrics my-block --from 2026-05-01 --to 2026-08-03
  civitai app metrics my-block --from 2026-05-01T00:00:00Z
  civitai app metrics my-block --json
```

| Flag | Description | Default |
|---|---|---|
| `--from string` | window start: YYYY-MM-DD (midnight UTC) or RFC3339 (default: 30 days ago, server-side) | — |
| `--json` | emit the raw analytics payload (scriptable). Unlike the human view, --json does NOT refuse a not-entitled read: a notOwned:true payload is passed through with every counter zeroed and still exits 0, so a script MUST branch on the notOwned field rather than trusting the counts | — |
| `--to string` | window end: YYYY-MM-DD (midnight UTC) or RFC3339 (default: now, server-side) | — |

**`civitai app dev-token <slug>`** — invite-only

Mint a short-lived dev block token for `npm run dev:live`

```bash
  civitai app dev-token my-block               # print the token to stdout
  civitai app dev-token my-block --spend       # also REQUEST ai:write:budgeted (real Buzz)
  civitai app dev-token my-block --budget 250  # max budget (and 250s of customComfy wall clock)
  civitai app dev-token my-block --env         # print VITE_LIVE_BLOCK_TOKEN=<token>
  civitai app dev-token my-block --env >> .env.development.local
```

| Flag | Description | Default |
|---|---|---|
| `--budget int` | per-generation Buzz budget the token may spend (1-250; omit to let the server decide — 50 for an unsubmitted app). Must clear your recipe's ceiling; for inline customComfy it is ALSO the step timeout in seconds | — |
| `--env` | print VITE_LIVE_BLOCK_TOKEN=\<token> (paste-ready into .env.development.local) | — |
| `--spend` | explicitly REQUEST the ai:write:budgeted scope so npm run dev:live can spend REAL Buzz. Omit it and that scope is FILTERED OUT of the request and the request's spend-intent field states false — the CLI never asks for budgeted spend implicitly, even when your block.manifest.json declares it | — |

**`civitai app dev-tunnel [blockId]`** — invite-only

Preview your LOCAL dev server inside the real Civitai host via a hardened tunnel

```bash
  # In terminal 1: start the embeddable dev server.
  npm run dev:tunnel
  # In terminal 2: open the tunnel (Ctrl-C to tear down).
  civitai app dev-tunnel                 # blockId from block.manifest.json in the CWD
  civitai app dev-tunnel my-block
  civitai app dev-tunnel my-block --port 5173
  # Dev server NOT on the CLI's loopback (a container/pod, VM, or bound interface):
  civitai app dev-tunnel my-block --local-host 10.42.0.100
  civitai app dev-tunnel --block my-block --idle-timeout 15m
```

| Flag | Description | Default |
|---|---|---|
| `--block string` | the blockId (app slug) to tunnel (or pass it positionally; defaults to the blockId in block.manifest.json in the CWD) | — |
| `--idle-timeout duration` | tear the tunnel down after this much inactivity | `30m0s` |
| `--local-host string` | host your local dev server is bound to. Default localhost (loopback) — the scaffold's dev:tunnel binds localhost, so most users need nothing. Set this for a dev server NOT on the CLI's loopback: a container/pod (e.g. --local-host 10.42.0.100), a VM, or a specific bound interface | `localhost` |
| `--no-wait` | skip the readiness wait and print the URL immediately (it may 404/NXDOMAIN for a few minutes while DNS/route propagate) | — |
| `--port int` | local dev-server port to tunnel (matches the scaffold's dev:tunnel) | `5186` |
| `--ready-timeout duration` | cap the wait for the public host to start serving (0 = wait indefinitely until ready or Ctrl-C; a positive value warns + prints the URL anyway on expiry) | — |
| `--tunnel-endpoint string` | sish SSH endpoint host:port (default sish.civitai.com:2224, or $CIVITAI_DEV_TUNNEL_ENDPOINT) | — |

**`civitai app pull [dir]`**

Clone or sync your app's repository from Civitai

```bash
  civitai app pull --app my-block               # clone into ./my-block
  civitai app pull ./my-block --app my-block    # clone/sync into ./my-block
  civitai app pull . --app my-block             # sync the current directory
```

| Flag | Description | Default |
|---|---|---|
| `--app string` | the app slug (repo name) or appBlockId to pull (required) | — |

**`civitai articles`**

Search and inspect articles on Civitai

```bash
  civitai articles search --query "workflow" --limit 5
  civitai articles get 1234
```

**`civitai articles get <id>`**

Get an article by id (GET /api/v1/articles/{id})

```bash
  civitai articles get 1234
  civitai articles get 1234 --content
  civitai articles get 1234 --json
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--content` | also render the article body as readable text/markdown (ignored with --json, which returns raw) | — |
| `--json` | print the raw API JSON response (for scripting) | — |

**`civitai articles search`**

Search articles (GET /api/v1/articles)

```bash
  civitai articles search --query "comfyui" --limit 5
  civitai articles search --sort "Most Reactions" --nsfw
  civitai articles search --username some-creator --cursor <cursor>
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--cursor string` | pagination cursor from a previous response | — |
| `--json` | print the raw API JSON response (for scripting) | — |
| `--limit int` | results per page (1-100) | — |
| `--nsfw` | include NSFW results | — |
| `--query string` | text search query (matches the article title) | — |
| `--sort string` | sort order (Newest, "Recently Updated", "Most Reactions", "Most Comments", "Most Bookmarks", "Most Collected") | — |
| `--tags string` | filter by tag ids (comma-separated, e.g. 5,12) | — |
| `--username string` | filter by author username | — |

**`civitai buzz`**

Show your spendable Buzz balance

```bash
  civitai buzz
  civitai buzz --json   # raw JSON (scriptable)
```

| Flag | Description | Default |
|---|---|---|
| `--json` | emit raw JSON (scriptable) | — |

**`civitai collections`**

Search and inspect collections on Civitai

```bash
  civitai collections search --query "favorites" --limit 5
  civitai collections get 1234
```

**`civitai collections get <id>`**

Get a collection by id (GET /api/v1/collections/{id})

```bash
  civitai collections get 1234
  civitai collections get 1234 --json
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |

**`civitai collections search`**

Search collections (GET /api/v1/collections)

```bash
  civitai collections search --query "anime" --limit 5
  civitai collections search --sort Newest --cursor <cursor>
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--cursor string` | pagination cursor from a previous response (Newest sort only) | — |
| `--json` | print the raw API JSON response (for scripting) | — |
| `--limit int` | results per page (1-100) | — |
| `--nsfw` | include NSFW results | — |
| `--query string` | text search query (matches the collection name) | — |
| `--sort string` | sort order (Newest, "Most Followers") | — |

**`civitai creators`**

Search creators on Civitai

```bash
  civitai creators search --query artist --limit 10
```

**`civitai creators search`**

Search creators (GET /api/v1/creators)

```bash
  civitai creators search --query artist --limit 10
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |
| `--limit int` | results per page | — |
| `--page int` | page number | — |
| `--query string` | text search query | — |

**`civitai download [version-id]`**

Download a model version's file(s)

```bash
  civitai download 691639
  civitai download --version 128713                # force a version id (skips the ambiguous-id stop)
  civitai download --model 4384 --out ./dreamshaper.safetensors
  civitai download 290640 --file vae --out-dir ./models
  civitai download 691639 --file 1234567          # pick one of two same-named files by id
  civitai download 290640 --all --out-dir ./models
  civitai download 290640 --all --layout comfyui --root ~/ComfyUI
  civitai download 691639 --layout a1111 --for-base "SDXL 1.0"
```

| Flag | Description | Default |
|---|---|---|
| `--all` | download every file in the version (refuses if two files would overwrite the same path — pick one with --file \<id>) | — |
| `--anon` | force an anonymous request (ignore any stored login token); NOTE: most downloads 401 without a token — --anon is meaningful for read commands, not downloads | — |
| `--dry-run` | print the resolved download plan (files, sizes, hashes, targets) and exit without downloading anything | — |
| `--file string` | select one file by numeric file id, or by name (exact, else a unique case-insensitive substring); use the id to pick one of two same-named files | — |
| `--for-base string` | warn if the version's base model is a confidently different family than this target (e.g. "SDXL 1.0") | — |
| `--force` | re-download even if the target file already exists | — |
| `--layout string` | route each file into its type's subfolder for an app (a1111\|comfyui); mutually exclusive with --out/--out-dir | — |
| `--model string` | resolve+download a MODEL's default (first published) version instead of a version id | — |
| `--no-verify` | skip SHA256 verification of the downloaded bytes | — |
| `--out string` | target file path (single-file only; mutually exclusive with --all/--out-dir) | — |
| `--out-dir string` | directory to write server-named file(s) into (created if needed) | — |
| `--root string` | base directory for --layout routing (default "."; only applies with --layout) | — |
| `--version string` | download this model-VERSION id explicitly (skips the ambiguous model-id safety stop the bare positional id triggers) | — |
| `--yes` | proceed past the ambiguous-id safety stop (a bare id that is BOTH a model id and a version id): download the version as typed | — |

**`civitai generate [prompt]`**

Generate images from a text prompt (SPENDS BUZZ)

```bash
  # Preview the price — spends nothing
  civitai generate "a cat wearing sunglasses" --dry-run

  # The same estimate as JSON, for scripts
  civitai generate "a cat wearing sunglasses" --dry-run --json

  # Generate 4 images, refusing if the estimate exceeds 50 Buzz
  civitai generate "a cat wearing sunglasses" --quantity 4 --max-cost 50

  # A specific checkpoint plus a LoRA at 0.8 strength
  civitai generate "a cat" --checkpoint 128713 --lora 250712:0.8

  # Image-to-image from a local file — --ecosystem is required
  civitai generate "make it winter" --ecosystem Flux1Kontext --image ./cat.png --dry-run

  # …or from a public URL, with two reference images
  civitai generate "combine these" --ecosystem Seedream \
    --image https://example.com/a.jpg --image ./b.png --yes

  # Wait, and write the images into ./out
  civitai generate "a cat" --yes --out-dir ./out

  # Fire and forget; collect the results later
  civitai generate "a cat" --yes --no-wait
  civitai workflows get <workflow-id>

  # Non-interactive (CI): --yes is required, or the run is refused
  civitai generate "a cat" --yes --max-cost 20

  # Graduate from flags to a raw graph: print, edit, send back
  civitai generate "a cat" --quantity 2 --print-input > graph.json
  civitai generate --input graph.json --dry-run
  civitai generate --input graph.json --yes

  # …or pipe it straight through
  jq '.prompt = "a dog"' graph.json | civitai generate --input - --dry-run
```

| Flag | Description | Default |
|---|---|---|
| `--aspect-ratio string` | aspect ratio bucket, e.g. 1:1 (width/height derive from it) | — |
| `--checkpoint int` | checkpoint model-VERSION id (not a model id) — resolved before submitting | — |
| `--dry-run` | print the cost estimate and exit without submitting (spends nothing) | — |
| `--ecosystem string` | model family to generate with, e.g. Qwen or Flux1Kontext. Sent to the server verbatim and NOT checked locally; required with --image because the server only promotes a job to image-to-image when the ecosystem is stated | — |
| `--external-id string` | re-attach to an earlier submit by reusing its idempotency key (the orchestrator dedupes on it and returns the PRE-EXISTING workflow rather than charging again). Use the key recorded before the lost submit | — |
| `--fail-on-substitution` | refuse to submit if the server REPORTS it substituted a different checkpoint for the one you asked for. Checked against the ESTIMATE, so nothing is spent when it refuses. Off by default: the server substitutes deliberately so that a script pinned to a retired version keeps working. NOT A GUARANTEE: a server that does not report substitutions makes this flag silently inert, so it cannot be relied on as a spend guard against an older deployment | — |
| `--force` | overwrite existing output files instead of refusing | — |
| `--image stringArray` | reference image for image-to-image: a local file (png or jpeg, uploaded) or an https URL (passed through). Repeatable. Requires --ecosystem, and only some ecosystems accept reference images at all | — |
| `--input string` | read the generation graph from a JSON file ('-' for stdin) and send it as-is, instead of building one from flags. txt2img only. Cannot be combined with the content flags above | — |
| `--json` | emit the raw server payload on stdout (scriptable) | — |
| `--lora stringArray` | LoRA model-version id, optionally :strength (e.g. 250712:0.8). Repeatable | — |
| `--max-cost int` | refuse to submit if the ESTIMATE exceeds this many Buzz. This is an estimate check, NOT a spending cap: the estimate is not binding, the server enforces no ceiling, and the realized charge can be higher with no refund | — |
| `--negative-prompt string` | negative prompt | — |
| `--no-download` | wait for the result and print the output URLs, but write no files | — |
| `--no-wait` | submit, print the workflow id and exit without waiting; collect the results later with 'civitai workflows get \<id>' | — |
| `--out-dir string` | directory to write the generated files into (created if needed); named \<workflow-id>-\<n>.\<ext> | `.` |
| `--print-input` | print the exact generation graph that would be sent and exit without submitting. Redirect it to a file, edit it, and feed it back with --input | — |
| `--quantity int` | number of images to generate (server default when unset; no -n shorthand, it reads as "no") | — |
| `--timeout duration` | how long to WAIT for the generation to finish (e.g. 5m, 0 waits indefinitely). This stops the CLI waiting; it does NOT stop the generation and does NOT stop the charge — the job continues server-side and is not refunded | `10m0s` |
| `-y, --yes` | skip the confirmation and submit (required in a non-interactive shell) | — |

**`civitai images`**

Search images on Civitai

```bash
  civitai images search --limit 5
  civitai images search --model-id 4384 --period Month
  civitai images search --base-model "Krea 2" --sort "Most Reactions" --period Week
  civitai images search --nsfw --sort "Most Reactions" --period Month --meta
  civitai images get 136456589
```

**`civitai images get <id>`**

Get a single image by id (GET /api/v1/images?imageId=\<id>)

```bash
  civitai images get 136456589
  civitai images get 136456589 --json
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |

**`civitai images search`**

Search images (GET /api/v1/images)

```bash
  civitai images search --limit 5
  civitai images search --model-version-id 128713 --sort Newest
  civitai images search --base-model "Krea 2" --sort "Most Reactions" --period Week
  civitai images search --type video --sort "Most Reactions"
  civitai images search --nsfw --sort "Most Reactions" --period Month --meta
  civitai images search --username some-user --cursor <cursor>
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--base-model strings` | filter by base model; repeatable (e.g. --base-model "Krea 2" --base-model Flux). The API OR-combines the given values | — |
| `--cursor string` | pagination cursor from a previous response | — |
| `--json` | print the raw API JSON response (for scripting) | — |
| `--limit int` | results per page (1-200) | — |
| `--meta` | include generation metadata (prompt, sampler, seed, etc.) | — |
| `--model-id int` | filter by model id | — |
| `--model-version-id int` | filter by model version id | — |
| `--nsfw` | include NSFW results | — |
| `--page int` | page number (shallow paging; prefer --cursor) | — |
| `--period string` | time period (AllTime, Year, Month, Week, Day) | — |
| `--post-id int` | filter by post id | — |
| `--sort string` | sort order ("Most Reactions", "Most Comments", Newest) | — |
| `--type string` | filter by media type (image, video, audio) | — |
| `--username string` | filter by uploader username | — |

**`civitai login`**

Authenticate with Civitai

```bash
  civitai login                    # browser device login (recommended); no Buzz-spend
  civitai login --scopes generate  # ALSO grant generation + Buzz SPEND (civitai generate)
  civitai login --no-browser       # device login without auto-opening a browser
  civitai login --token <token>    # store a personal API key instead
  civitai login --token            # no value: print where to create a personal key
  civitai login                    # run again to SWITCH the active account (overwrites the stored credential)
```

| Flag | Description | Default |
|---|---|---|
| `--no-browser` | do not attempt to open a browser for device login | — |
| `--scopes strings` | extra scope sets to request on a browser device login, additive on top of the default (valid: generate). --scopes generate grants generation AND Buzz-SPEND authority; omit it and this login cannot spend your Buzz. Not valid with --token | — |
| `--token string[="civitai-token-no-value"]` | store a personal API key instead of the browser device login (pass with no value to print where to create one) | — |

**`civitai model-versions`**

Inspect model versions on Civitai

```bash
  civitai model-versions get 128713
  civitai model-versions by-hash 5D8D26E2A6
```

**`civitai model-versions by-hash <hash>`**

Get a model version by file hash (GET /api/v1/model-versions/by-hash/{hash})

```bash
  civitai model-versions by-hash 5D8D26E2A6
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |

**`civitai model-versions get <id>`**

Get a model version by id (GET /api/v1/model-versions/{id})

```bash
  civitai model-versions get 128713
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |

**`civitai models`**

Search and inspect models on Civitai

```bash
  civitai models search --query "pony" --limit 5
  civitai models get 4384
```

**`civitai models get <id>`**

Get a model by id (GET /api/v1/models/{id})

```bash
  civitai models get 4384
  civitai models get 4384 --json
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |

**`civitai models search`**

Search models (GET /api/v1/models)

```bash
  civitai models search --query "pony" --limit 5
  civitai models search --type LORA --sort "Most Downloaded" --period Month
  civitai models search --username some-creator --cursor <cursor>
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--base-model strings` | filter by base model; repeatable (e.g. --base-model Pony --base-model "Illustrious"). Distinguishes video checkpoints ("Wan Video 2.2 T2V-A14B") that all share --type Checkpoint | — |
| `--cursor string` | pagination cursor from a previous response | — |
| `--json` | print the raw API JSON response (for scripting) | — |
| `--limit int` | results per page (1-100) | — |
| `--nsfw` | include NSFW results | — |
| `--page int` | page number (shallow paging; prefer --cursor for deep paging) | — |
| `--period string` | time period (AllTime, Year, Month, Week, Day) | — |
| `--query string` | text search query | — |
| `--sort string` | sort order (e.g. "Highest Rated", "Most Downloaded", Newest) | — |
| `--tag string` | filter by tag name | — |
| `--type string` | filter by model type (e.g. Checkpoint, LORA, TextualInversion) | — |
| `--username string` | filter by creator username | — |

**`civitai tags`**

Search model tags on Civitai

```bash
  civitai tags search --query anime --limit 10
```

**`civitai tags search`**

Search tags (GET /api/v1/tags)

```bash
  civitai tags search --query anime --limit 10
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |
| `--limit int` | results per page | — |
| `--page int` | page number | — |
| `--query string` | text search query | — |

**`civitai upgrade`**

Update the civitai CLI to the latest release

```bash
  civitai upgrade
  civitai upgrade --force
```

| Flag | Description | Default |
|---|---|---|
| `--force` | reinstall even if already up to date, and self-replace a Homebrew install | — |

**`civitai users`**

Look up users on Civitai

```bash
  civitai users get some-username
  civitai users get 5
```

**`civitai users get <username-or-id>`**

Look up a user by username or id (public search: GET /api/v1/users)

```bash
  civitai users get some-username
  civitai users get 5 --json
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |

**`civitai version`**

Print the CLI version, commit, and build date

```bash
  civitai version
  civitai version --no-update-check
```

**`civitai whoami`**

Verify your stored API token and its capabilities

```bash
  civitai whoami
  civitai whoami --scopes   # also list every granted scope
  civitai whoami --json     # raw JSON (scriptable)
```

| Flag | Description | Default |
|---|---|---|
| `--json` | emit raw JSON (scriptable) | — |
| `--scopes` | also print the full decoded scope list | — |

**`civitai workflows`**

List, inspect and cancel generation workflows

```bash
  civitai workflows list
  civitai workflows get 01JABCXYZ
  civitai workflows get 01JABCXYZ --json
  civitai workflows cancel 01JABCXYZ
```

**`civitai workflows cancel <workflow-id>`**

Cancel a running generation workflow (DOES NOT REFUND)

```bash
  civitai workflows cancel 01JABCXYZ
  civitai workflows cancel 01JABCXYZ --yes
  civitai workflows cancel 01JABCXYZ --json --yes
```

| Flag | Description | Default |
|---|---|---|
| `--json` | emit the raw server reply on stdout (scriptable) | — |
| `-y, --yes` | skip the confirmation prompt and cancel (for scripts/CI) | — |

**`civitai workflows get <workflow-id>`**

Show one generation workflow and its outputs

```bash
  civitai workflows get 01JABCXYZ
  civitai workflows get 01JABCXYZ --json
```

| Flag | Description | Default |
|---|---|---|
| `--json` | emit the raw server payload on stdout (scriptable) | — |

**`civitai workflows list`**

List the generation workflows you have submitted

```bash
  civitai workflows list
  civitai workflows list --limit 5
  civitai workflows list --limit 50 --cursor <next-cursor>
  civitai workflows list --json
```

| Flag | Description | Default |
|---|---|---|
| `--cursor string` | opaque cursor from a previous page's next-cursor line | — |
| `--json` | emit the raw server payload on stdout (scriptable) | — |
| `--limit int` | how many workflows to fetch in this page (server default when unset) | — |
| `--tag stringArray` | only list workflows carrying this orchestrator tag. Repeatable | — |

<!-- END GENERATED: cli -->
</CliReference>

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
