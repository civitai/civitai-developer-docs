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

```text
Browse, author, and ship Civitai Apps.

Browse the published App store with "civitai app list" (filter-based discovery)
and inspect one App with "civitai app view <slug>".

An App is a sandboxed static web app served in an iframe. The platform
owns the build and the runtime; the only mandatory file is block.manifest.json.
The typical authoring lifecycle is create -> validate -> submit.

"civitai app create" is the friendly, batteries-included scaffolder (defaults to
the rich page-money SDK template); "civitai app init" is the same scaffolder
with a no-build static default (back-compat alias).
```

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

```text
Create a ready-to-build App, batteries included.

This is the friendly happy path: a thin superset of "civitai app init" that
defaults to the rich page-money template — a Vite + React + TypeScript full-page
app wired to the published App SDK (estimate -> consent -> submit -> poll ->
Buzz spend), with a mock-host dev harness and a unit test. The scaffold is
immediately runnable (npm install && npm run dev:harness), test-green, and
validates clean.

The default scaffold ships a runnable txt2img money path AND a Comfy on Civitai
(customComfy) sample that runs a server-registered recipe (invite-only beta) —
both share the estimate -> consent -> submit -> poll driver, switched by an
on-screen mode toggle, and both work end-to-end in "npm run dev:harness".

customComfy has TWO arms. Besides the recipe arm above, an app may also ship
its own ComfyUI graph inline (mode: 'inline', app developers only). src/comfy.ts
includes a complete, unit-tested buildInlineComfyBody for it: the graph, the
declared AIR resource manifest, and the maxBuzz ceiling (which is ALSO the step
timeout in seconds). See the generated README's "Comfy on Civitai samples" section.

Templates (override with --template):
  static      a no-build page app (index.html + a tiny JS, no build step)
  page-vite   a vite + React page app (config-as-code build: buildCommand + outputDir)
  page-money  a vite + React + TS full-page (W10) money-path app wired to the
              published App SDK (estimate -> consent -> submit -> poll -> Buzz
              spend); includes a txt2img + a Comfy on Civitai (customComfy) sample,
              recipe and inline-graph body builders [default for create]

The display name can be free-form ("My Cool Block"); it is slugified for the
blockId. A slug-shaped name is used verbatim.

By default the project is created in ./<slug>. Override the output directory with
a positional [dir] or --dir <path>; override the display name independently with
--name (so name, slug, and directory can all differ).

Note: a DEFAULT `civitai login` (OAuth) grants submit but NOT Buzz-spend. To
run `dev:live` real generations, authenticate with a credential that carries
the AI Services scopes: `civitai login --scopes generate` (a browser login that opts into generation), or a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account).
```

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

```text
Scaffold a correct, ready-to-build App project.

Templates:
  static      a no-build page app (index.html + a tiny JS, no build step)
  page-vite   a vite + React page app (config-as-code build: buildCommand + outputDir)
  page-money  a vite + React + TS full-page (W10) money-path app wired to the
              published App SDK (estimate -> consent -> submit -> poll -> Buzz spend)

The display name can be free-form ("My Cool Block"); it is slugified for the
blockId. A slug-shaped name is used verbatim.

By default the project is created in ./<slug>. Override the output directory with
a positional [dir] or --dir <path>; override the display name independently with
--name (so name, slug, and directory can all differ).
```

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

```text
Validate an App project.

This is a best-effort LOCAL pre-check that mirrors the platform's approve-time
validator (BlockManifestValidator). It catches most rejections before you
submit, but the SERVER remains the source of truth.

Checks block.manifest.json against the vendored JSON Schema (syntactic shape),
plus the ported semantic rules and structural checks:
  - the manifest is present at the project root
  - buildCommand and outputDir are coherent (outputDir set when buildCommand is);
    outputDir must be a safe relative path (no leading "/", no ".." traversal)
  - server-owned fields (iframe.src, trustTier) are REJECTED if set
  - sandbox tokens are limited to the unverified-tier allowlist
    (allow-scripts, allow-forms); allow-same-origin+allow-scripts is rejected
  - a "page" manifest must declare an iframe block; renderMode=iframe needs one too
  - iframe.minHeight and iframe.resizable are required when an iframe is present
  - renderMode inline/hybrid is rejected (requires a verified tier the platform
    only assigns post-submit)
  - targets[].slotId must be a known registered slot
  - the committed LOCKFILE matches the package manager the platform build
    derives from buildCommand (its first word): pnpm -> pnpm-lock.yaml,
    yarn -> yarn.lock, and npm/vite/npx/unset -> package-lock.json. The
    platform installs strictly from the lockfile, so a mismatch or a missing
    lockfile is a guaranteed build failure. Only applies when package.json
    exists — a static app never installs.
    The lockfile must also BE one, not merely exist: a package-lock.json has to
    parse as JSON and declare a numeric "lockfileVersion" of 1 or more, and a
    pnpm-lock.yaml / yarn.lock has to be non-empty. An empty lockfile fails the
    platform build exactly like a missing one, so creating an empty one by hand
    is not a fix — run the package manager and commit what it writes. A lockfile
    that cannot be read (or is implausibly large) is left alone rather than
    reported.

It also emits non-fatal WARNINGS the schema can't catch as hard errors:
  - money-path footguns (e.g. a budgeted page with no page.buzzBudgetPerGen)
  - a "page" app whose source never posts BLOCK_READY. The host will not reveal
    a page app until it acks BLOCK_INIT, so such an app renders fine locally and
    is replaced by a failure card in the real host — the shape of anything
    scaffolded before that was fixed. Advisory ONLY: it infers runtime behaviour
    from static text. A project depending on @civitai/* is never flagged (the
    SDK transport acks internally), and it reads source only — never outputDir,
    node_modules, markdown, or comments.
Warnings do NOT fail validation (exit 0) unless --strict is passed.

Defaults to the current directory.
```

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

```text
Package the canonical App source tree and submit it for moderator
review.

The package is the SOURCE tree (manifest + src + build config) — NOT a
prebuilt dist. The platform rebuilds from source. These are excluded:
  .cache, .git, .hg, .mypy_cache, .next, .pnpm-store, .pytest_cache, .ruff_cache, .svn, .turbo, .venv, .vite, build, coverage, dist, node_modules, out, venv, *.zip, .env, .env.local, .env.*.local, .env.development, .env.test

Submission path:
  By default this uploads the bundle directly using your stored token to the
  token-authenticated submit route (POST /api/v1/blocks/submit-version). OAuth
  device-login tokens (`civitai login`) and personal API keys both work;
  OAuth tokens refresh automatically. Set CIVITAI_SUBMIT_PATH to override the
  route. With no token configured (and no --package-only), it writes the
  canonical .zip and prints the manual next steps.

  --package-only always just writes the .zip and stops.

Submitting creates a real "pending moderator review" request (undone only with
`civitai app withdraw`), so it is NOT fired blindly: before uploading you are
shown the app@version and asked to confirm. Pass --yes/-y to skip the prompt
(for scripts/CI). In a non-interactive shell (no TTY) submit REFUSES unless
--yes is given, rather than hang or submit silently. --package-only is the safe
preview — it never submits.

Defaults to the current directory.
```

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

```text
Check the review and deploy status of your own App submissions.

Calls the token-authenticated, self-scoped status route
(GET /api/v1/blocks/submissions) with your stored credential — you only ever see
your OWN submissions. Both a personal API key and an OAuth login (civitai login)
work; the OAuth token must carry the Apps submit scope (the same gate the
submit route uses).

With no argument it lists all your submissions (newest first). Pass a blockId
(app slug) or --id <pubreq_id> to see a single submission in detail, including the
rejection reason (if rejected) and the live URL (if approved + deployed).

Note: a submission's <blockId>.civit.ai surface only serves AFTER it is approved
and deployed (deployState 'live').
```

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

```text
Withdraw your own pending App submission so you can resubmit a new bundle
for the same slug.

Calls the token-authenticated, self-scoped withdraw route
(POST /api/v1/blocks/withdraw) with your stored credential — you can only ever
withdraw your OWN submissions. Both a personal API key and an OAuth login
(civitai login) work; the OAuth token must carry the Apps submit scope
(the same gate the submit route uses).

Only a submission still in the 'pending' review state can be withdrawn; an
already-approved/rejected (or already-withdrawn) request cannot. Withdrawing is
idempotent — withdrawing an already-withdrawn request still succeeds.

Pass the publish-request id as a positional argument or via --id (find it with
"civitai app status").

Withdraw is non-interactive (it never prompts); --yes/-y is accepted as a no-op
for symmetry with "civitai app submit" so the same scripted flag works on both.
```

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

```text
Manage your App store listing's MEDIA — the icon, cover, and screenshots
a listing needs before it can publish.

A store listing must have an ICON and a COVER before it can go live; screenshots
are optional. These commands ingest a local image, attach it to your listing,
and then wait for the content scan — the same pipeline the web submit form
uses. The platform validates dimensions, aspect and format at the ATTACH step,
so a wrongly-shaped image is refused in seconds rather than after the scan.

For a listing that is already LIVE (approved), attaching media opens a REVISION
that goes back to moderator review (the live listing is untouched until the
revision is approved); pass --changelog to describe the change.

The app is resolved from block.manifest.json in the current directory (or pass
--slug). Your store listing is created as a DRAFT when you run
`civitai app submit`, so you can set its media WHILE your app is pending review
— the media you attach carries forward when a moderator approves it. Set it
early to clear the publish floor before you go live.

Source files are checked locally BEFORE any upload — png, jpeg or webp, at most
2.0 MB for an icon, 4.0 MB for a cover, 2.0 MB for a screenshot.
A file in the wrong format, or over its cap, is refused before anything is
uploaded.
```

```bash
  civitai app listing status
  civitai app listing set-icon ./assets/icon.png
  civitai app listing set-cover ./assets/cover.png
  civitai app listing add-screenshot ./shot.png --caption "Grid view"
  civitai app listing rm-screenshot alsc_01H...
  civitai app listing reorder alsc_02 alsc_01 alsc_03
```

**`civitai app listing set-icon <file>`**

Set the listing icon (png, jpeg or webp, at most 2.0 MB)

```text
Set your store listing's ICON — the small image shown beside your app's name.
An icon is MANDATORY: a listing cannot publish without one.

The source file is validated locally first (png, jpeg or webp, at most 2.0 MB),
then ingested and attached, and the content scan is waited on afterwards.
Nothing is uploaded if the local check fails. The platform validates the
image's dimensions and aspect at the ATTACH step, so a wrongly-shaped image is
refused in seconds rather than after the scan.
See "Listing media requirements" in the README for the platform's bounds.

On a listing that is already LIVE this opens a REVISION for moderator re-review
instead of changing the live listing — pass --changelog to describe the change,
-y to skip the confirmation. On a DRAFT listing it attaches directly.

Run `civitai app listing status` to see what the publish floor still needs.
```

```bash
  civitai app listing set-icon ./assets/icon.png
  civitai app listing set-icon ./icon.png --slug my-app
  civitai app listing set-icon ./icon.png --changelog "New brand mark" -y
```

| Flag | Description | Default |
|---|---|---|
| `--changelog string` | changelog for the moderator review (used only when the listing is already live) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |
| `-y, --yes` | skip the live-listing revision confirmation | — |

**`civitai app listing set-cover <file>`**

Set the listing cover (png, jpeg or webp, at most 4.0 MB)

```text
Set your store listing's COVER — the wide image at the top of the listing
page. A cover is MANDATORY: a listing cannot publish without one.

The source file is validated locally first (png, jpeg or webp, at most 4.0 MB),
then ingested and attached, and the content scan is waited on afterwards.
Nothing is uploaded if the local check fails. The platform validates the
image's dimensions and aspect at the ATTACH step, so a wrongly-shaped image is
refused in seconds rather than after the scan.
See "Listing media requirements" in the README for the platform's bounds.

On a listing that is already LIVE this opens a REVISION for moderator re-review
instead of changing the live listing — pass --changelog to describe the change,
-y to skip the confirmation. On a DRAFT listing it attaches directly.

Run `civitai app listing status` to see what the publish floor still needs.
```

```bash
  civitai app listing set-cover ./assets/cover.png
  civitai app listing set-cover ./cover.jpg --slug my-app
  civitai app listing set-cover ./cover.png --changelog "Updated hero" -y
```

| Flag | Description | Default |
|---|---|---|
| `--changelog string` | changelog for the moderator review (used only when the listing is already live) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |
| `-y, --yes` | skip the live-listing revision confirmation | — |

**`civitai app listing add-screenshot <file>`**

Add a screenshot (up to 8) with an optional caption

```text
Add a SCREENSHOT to your store listing's gallery. Screenshots are OPTIONAL:
they are not part of the publish floor.

The source file is validated locally first (png, jpeg or webp, at most 2.0 MB),
then ingested and appended to the gallery, and the content scan is waited on
afterwards. Nothing is uploaded if the local check fails. The platform
validates dimensions, aspect and format at the ATTACH step, so a bad image is
refused in seconds rather than after the scan. --caption adds a one-line
caption.
See "Listing media requirements" in the README for the platform's bounds.

Each run appends one screenshot; there is no bulk add. Use
`civitai app listing reorder` to change the order afterwards and
`civitai app listing rm-screenshot` to drop one — both take the screenshot ids
that `civitai app listing status` prints.

The gallery has a ceiling (8 at the time of writing) and it is the SERVER's, not
this CLI's: nothing here counts the gallery before uploading, so hitting the
ceiling surfaces as a server refusal after the ingest rather than as a local
usage error.

On a listing that is already LIVE this opens a REVISION for moderator re-review
instead of changing the live listing — pass --changelog to describe the change,
-y to skip the confirmation. On a DRAFT listing it attaches directly.
```

```bash
  civitai app listing add-screenshot ./shot.png
  civitai app listing add-screenshot ./grid.png --caption "Grid view"
  civitai app listing add-screenshot ./shot.png --slug my-app
```

| Flag | Description | Default |
|---|---|---|
| `--caption string` | optional one-line caption for the screenshot | — |
| `--changelog string` | changelog for the moderator review (used only when the listing is already live) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |
| `-y, --yes` | skip the live-listing revision confirmation | — |

**`civitai app listing rm-screenshot <screenshotId>`**

Remove a screenshot by its id (see `app listing status`)

```text
Remove a screenshot from your listing by its screenshot id (the id shown by
`civitai app listing status`, e.g. alsc_...). Note: for a LIVE listing,
direct screenshot edits are only possible while a revision is open.
```

```bash
  civitai app listing rm-screenshot alsc_01H8XYZ
  civitai app listing rm-screenshot alsc_01H8XYZ --slug my-app
```

| Flag | Description | Default |
|---|---|---|
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app listing reorder <screenshotId...>`**

Reorder screenshots (pass ALL current screenshot ids in the new order)

```text
Reorder your listing's screenshots. Pass EXACTLY the current set of screenshot
ids (from `civitai app listing status`) in the desired order — a partial or
unknown set is rejected.

Ordering is positional: the first id becomes the first screenshot in the
gallery. There is no "move one" form — read the current order out of
`civitai app listing status` and pass the whole list back.
```

```bash
  civitai app listing reorder alsc_02 alsc_01 alsc_03
  civitai app listing reorder alsc_02 alsc_01 --slug my-app
```

| Flag | Description | Default |
|---|---|---|
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app listing status`**

Show attached media and what's missing vs the publish floor

```text
Show your store listing's attached media (icon, cover, screenshots) and what
is still required before it can publish (an icon and a cover are mandatory).

Your store listing exists as a DRAFT from the moment you run
`civitai app submit`, so this works while your app is still pending review.

Note: on a LIVE (approved) listing this opens an in-progress revision draft and
reports ITS media (idempotent — it reuses any existing draft, and nothing is
submitted for moderator review until you run a set-/add- command and confirm).
```

```bash
  civitai app listing status
  civitai app listing status --slug my-app
  civitai app listing status --dir ./my-app
```

| Flag | Description | Default |
|---|---|---|
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app list`**

Discover published Apps in the store (GET /api/v1/apps)

```text
List published Apps from the Civitai store via GET /api/v1/apps.

This is filter-based discovery — filter by --kind / --category, order by --sort,
and page with --cursor. There is no free-text search yet (the store service
doesn't support it), so there is no `app search` command.

Login is required (`civitai login`): the endpoint keys the visible catalog
off your identity, so an anonymous call would see nothing. Pagination is keyset
cursor-based (no --page); the next cursor is printed after the results — pass it
back via --cursor.

The store is rate-limited per caller; a tight scripted loop may see 429s (the CLI
backs off and retries automatically).

NOTE: the store is gated by a launch flag — until it opens publicly you will only
see apps if your account is a moderator or app-dev-tester; a normal login may get
an empty list.
```

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

```text
Show the public detail for one published App by slug via
GET /api/v1/apps/{slug} — its description, category, rating, gallery, and the
kind-specific action target (an on-site app's live URL, or an off-site app's
external / connect target).

Login is required (`civitai login`). A missing or out-of-scope slug returns a
clean "not found" message.

This reads the PUBLIC STORE CATALOG, which is NOT the same thing as your
deployment: an app can be approved, deployed and serving at <slug>.civit.ai and
still not be in the store. When a 404 lands on a slug you own, the error says so
and points at `civitai app listing status` / `civitai app status`.
```

```bash
  civitai app view my-cool-app
  civitai app view my-cool-app --json
```

| Flag | Description | Default |
|---|---|---|
| `--json` | print the raw API JSON response (for scripting) | — |

**`civitai app metrics <slug>`**

Show your App's install / run / Buzz / engagement analytics

```text
Show the owner-only analytics for one of YOUR App Blocks: installs, runs and
the Buzz they spent, Buzz purchased through the app, and API engagement.

The slug is resolved to its appBlockId through your own submissions
(`civitai app status` reads the same route), so analytics are only available
once a version of the app has been APPROVED — an app that was never approved has
no App Block to report on yet.

WINDOW: the server defaults to the last 30 days and clamps any request to 366
days, so a zero is only meaningful together with the period it covers. This
command therefore always prints the window the SERVER served (echoed from the
response), not the one you asked for. Pass --from / --to as a plain YYYY-MM-DD
date (midnight UTC) or a full RFC3339 timestamp to widen it.

CREDENTIAL: the analytics query is full-scope, so it needs a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account);
an OAuth browser login is refused with 403.

DATA CAVEAT: engagement counts only AUTHENTICATED, scope-gated API calls. An app
that ships no scoped API surface will show real installs and revenue with a flat
engagement section — that is expected, not a bug.
```

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

```text
Mint a short-lived dev block token so a scaffolded page-money app can run
"npm run dev:live" against the REAL Civitai backend.

Calls the invite-gated mint route (POST /api/v1/blocks/dev-token) with your
stored credential and prints the token (a ~4-hour RS256 JWT). Paste it into
VITE_LIVE_BLOCK_TOKEN in .env.development.local, then restart "npm run dev:live".

The minted token's CAPABILITIES depend on the credential you mint with:
  - REAL generation (spends real Buzz) needs a credential carrying AI Services:
    a FULL-SCOPE PERSONAL API KEY (create one at https://civitai.com/user/account)
    or an OAuth login that opted in with "civitai login --scopes generate".
    Confirm yours can spend with "civitai whoami".
  - A DEFAULT OAuth login ("civitai login", no --scopes) mints a
    READ/IDENTITY-ONLY dev token (no spend) — dev:live shows your viewer +
    catalog/storage, but estimate → submit → generation will NOT spend.

--spend is the explicit affirmation that this token may spend real Buzz. It does
two things to the request: it adds ai:write:budgeted to the scopes REQUESTED from
the mint route, and it sets the request's spend-intent field (requestBudgetedSpend)
to true. The server still clamps against your credential, so --spend cannot grant
what your credential lacks.

WITHOUT --spend the CLI never requests budgeted spend implicitly: if your
block.manifest.json declares ai:write:budgeted it is FILTERED OUT of the request
(the command tells you when that happens). The scaffolded money app declares it,
so a live run that used to generate now needs --spend — otherwise dev:live
refuses with "block lacks ai:write:budgeted scope". Every other manifest scope is
requested unchanged. With no local manifest the CLI sends no scopes at all —
independently of that, EVERY mint now states its spend intent explicitly, since
requestBudgetedSpend is always present on the request and is true only with
--spend.

Pre-GA the mint route is invite-only. You do NOT need to submit the app
first — for a brand-new slug with no app row yet, the token is minted from the
scopes in your local block.manifest.json (clamped server-side), so
"create → dev-token → dev:live" works directly. The token is short-lived —
never commit it; re-mint when it expires.

BUDGET (--budget, 1-250 Buzz). The token carries a per-generation Buzz budget.
Omit --budget and the server picks one — 50 for a slug with no submitted app.
Your LOCAL block.manifest.json page.buzzBudgetPerGen does NOT raise it: until
the app is submitted there is no server-side manifest to read, so the 50 is a
flat default, not a clamp of your file. --budget is the only way to move it.

A generation is REFUSED outright when the recipe's Buzz ceiling exceeds that
budget, so a shipped recipe with a ceiling of 90 dead-ends on the default:

  insufficient buzz budget: recipe ceiling 90 exceeds budget 50

Raise it (--budget 250) rather than editing the recipe.

The trap: for an inline customComfy graph your maxBuzz is BOTH the Buzz ceiling
and the step timeout in SECONDS. An over-thrifty budget therefore does not fail
as a billing error — the step runs out of wall clock and comes back "expired",
which reads like a broken graph. Budget for the seconds the graph needs.
```

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

```text
Run your app locally (`npm run dev:tunnel`) and see it rendered INSIDE the
real production host at civitai.com/apps/dev/<blockId> — the actual page host
bridge, your real Buzz, real pickers, real session — but with the iframe pointing
at YOUR local code instead of a deployed bundle. A prod-fidelity inner-dev-loop.

How it works: this mints an EPHEMERAL ssh keypair (in memory — never written to
~/.ssh), calls blocks.startDevTunnel with the PUBLIC key, opens a reverse tunnel
(ssh -R) from your local dev-server port to the Civitai tunnel endpoint, and
prints the /apps/dev/<blockId> URL to open in your browser. On Ctrl-C (or an idle
timeout) it tears the tunnel down and revokes the session server-side.

Start your dev server first, in another terminal:

  npm run dev:tunnel            # serves your app on 127.0.0.1:5186, embeddable

then run this against the SAME port. Authentication uses your stored credential
(`civitai login` or a personal API key); you can only tunnel your OWN app.

The blockId is resolved from (in order): the `--block` flag, the positional
argument, then the `blockId` in `block.manifest.json` in the current
directory. Run it from your App project dir and you can omit the blockId entirely.

⚠️ GATED: dev tunnels are limited to invited Apps authors / moderators and are
guarded by a server kill-switch flag. The tunnel endpoint is live; if you are not
enrolled the mint reports "not available" — ask to be added to the cohort.
```

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

```text
Clone (or, if [dir] is already a checkout, pull) the canonical repository
backing one of YOUR approved Apps. This is the read side of git authoring:
it fetches the current block.manifest.json + source so you can edit locally and
then submit (`civitai app submit`) or push.

Authentication uses your stored credential (`civitai login` or a personal
API key). The command calls an owner-only endpoint that lazily provisions a
scoped, read-only Forgejo identity for you and returns a clone URL with a push/
pull token embedded.

⚠  SECURITY — TOKEN-IN-URL LEAKAGE: the clone URL embeds your access token as
HTTP-Basic credentials (https://<user>:<token>@...). On a fresh CLONE, git
stores the remote URL in .git/config, so the token lands on disk in the clone;
treat the checkout as sensitive: do NOT commit .git/config or share the
directory, and consider clearing the remote URL (or replacing it with the
credential-less HTTPS URL `git remote set-url origin <httpUrl>`) after the
clone if you rely on a git credential helper. On a SYNC (pull into an existing
checkout) the URL is passed explicitly and is NOT persisted to .git/config, but
the token still transiently appears in the git child process's arguments, so it
is briefly visible to other processes via `ps` / /proc/<pid>/cmdline.

The repo only exists once your FIRST version has been submitted as a ZIP and
approved; before then the command tells you so instead of failing obscurely.
```

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

```text
Read-only access to Civitai articles through the public REST API
(GET /api/v1/articles, GET /api/v1/articles/{id}).

No login is needed — these are public read routes (unlike `civitai app list`
and `app view`, which are refused without a token). The CLI still sends your
stored token when you have one; --anon forces an anonymous request.

Articles are the site's long-form guides. `articles search` finds them;
`articles get <id> --content` renders the BODY as readable text/markdown —
headings, paragraphs, lists, links and code blocks, with the HTML stripped and
entities decoded — so a guide is readable in the terminal without a browser.

--json returns the raw API body, including the UNTOUCHED HTML content, and
takes precedence over --content.

--json writes the API response to stdout and nothing else — notes and errors go
to stderr, so `… --json | jq -e .` always parses. The document is the API's,
the bytes are not: it is re-indented on the way out, so do not diff or hash it
against the wire.
```

```bash
  civitai articles search --query "workflow" --limit 5
  civitai articles get 1234
  civitai articles get 1234 --content
```

**`civitai articles get <id>`**

Get an article by id (GET /api/v1/articles/{id})

```text
Get one article by id (GET /api/v1/articles/{id}).

By default it prints the article's metadata (title, author, stats, tags). Pass
--content to also render the article BODY — the actual guide — as readable plain
text / lightweight markdown (headings, paragraphs, lists, links, code blocks;
HTML tags stripped and entities decoded). --json returns the raw API body
(including the untouched HTML content) and takes precedence over --content.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

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

```text
Search articles via GET /api/v1/articles.

Filters: --query (matches the TITLE, not the body), --tags, --username and
--nsfw. --tags takes numeric tag IDS, comma-separated (e.g. --tags 5,12), not
tag names — and `civitai tags search` renders names, not ids, so it cannot
supply this filter for you.

--sort takes a server-owned value set.
The CLI does not check those value sets — it passes the value through and the
server rejects an unknown one with HTTP 400, reported as a usage mistake.

Paging is cursor-only: the article feed is a keyset feed, so there is no --page
here. --limit takes 1–100; omit it for the server's default page size.
The next cursor is printed under the results; pass it back via --cursor.

The REACTIONS column is likes plus favourites, from the list endpoint's own
stats. `articles get <id>` reports all-time view / like / favourite /
comment / collected counts instead — a different stats block, so the two need
not agree — and --content renders the guide itself.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

```bash
  civitai articles search --query "comfyui" --limit 5
  civitai articles search --sort "Most Reactions" --nsfw
  civitai articles search --username some-creator --cursor '<cursor>'
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

```text
Show your spendable Buzz balance (blue / green / yellow, plus a total) using
your stored credential.

Reads buzz.getBuzzAccount with the same credential as `whoami` / `app status`.
A full-scope personal API key can read your balance, as can a browser login that
opted into the generate scope set (`civitai login --scopes generate`). A
DEFAULT OAuth login (`civitai login`) can read neither balance nor spend Buzz —
in that case this prints both ways to fix it.
```

```bash
  civitai buzz
  civitai buzz --json   # raw JSON (scriptable)
```

| Flag | Description | Default |
|---|---|---|
| `--json` | emit raw JSON (scriptable) | — |

**`civitai collections`**

Search and inspect collections on Civitai

```text
Read-only access to Civitai collections through the public REST API
(GET /api/v1/collections, GET /api/v1/collections/{id}).

No login is needed — these are public read routes (unlike `civitai app list`
and `app view`, which are refused without a token). The CLI still sends your
stored token when you have one; --anon forces an anonymous request.

Only PUBLIC collections are discoverable. Logging in does not widen this
surface to your own private collections, and there is no create, edit or
add-to-collection path in the CLI — this group is read-only.

`collections search` finds collections by name; `collections get <id>`
shows one collection's owner, type, read permission, description and tags.

Neither command pages through a collection's CONTENTS: the public route
answers with collection metadata (`search` adds an item COUNT), not with the
models or images inside.

--json writes the API response to stdout and nothing else — notes and errors go
to stderr, so `… --json | jq -e .` always parses. The document is the API's,
the bytes are not: it is re-indented on the way out, so do not diff or hash it
against the wire.
```

```bash
  civitai collections search --query "favorites" --limit 5
  civitai collections get 1234
  civitai collections get 1234 --json
```

**`civitai collections get <id>`**

Get a collection by id (GET /api/v1/collections/{id})

```text
Get one collection by id: GET /api/v1/collections/{id}.

The id is the number in a civitai.com/collections/<id> URL. A non-integer or
non-positive argument is refused locally, as a usage mistake, before any
request is made.

Prints the collection's name, owner, type, read permission, public flag,
description (truncated) and tags. Only PUBLIC collections are readable here.

Two differences from the `search` row for the same collection, both of them
the API's shape rather than the CLI's: the detail body drops the item COUNT and
adds the TAGS. Neither shape lists the collection's items.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

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

```text
Search public collections via GET /api/v1/collections.

Paging is cursor-only: a keyset cursor on the collection id, so there is
no --page here. --limit takes 1–100; omit it for the server's default page size.
The next cursor is printed under the results; pass it back via --cursor.

Cursor paging is only supported for the default (Newest) sort. This is a server
constraint: for any other --sort (e.g. "Most Followers") the API returns a
nextCursor that it then rejects — a dead cursor that yields no further pages. So
for a non-Newest sort the CLI shows the first page only and does NOT print a
next-page hint; deep paging requires --sort Newest.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

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

```text
Read-only access to Civitai creators through the public REST API
(GET /api/v1/creators).

No login is needed — these are public read routes (unlike `civitai app list`
and `app view`, which are refused without a token). The CLI still sends your
stored token when you have one; --anon forces an anonymous request.

A creator row is a USERNAME, a published-model COUNT and a LINK. The group is
search-only: the public API has no per-creator profile route, so there is no
`creators get` to add.

The follow-up is `civitai models search --username <name>`, which is what
actually lists a creator's models. Use `civitai users get <name>` if you want
the user record (id, avatar) behind the name.

--json writes the API response to stdout and nothing else — notes and errors go
to stderr, so `… --json | jq -e .` always parses. The document is the API's,
the bytes are not: it is re-indented on the way out, so do not diff or hash it
against the wire.
```

```bash
  civitai creators search --query artist --limit 10
  civitai creators search --query artist --json
```

**`civitai creators search`**

Search creators (GET /api/v1/creators)

```text
Search creators via GET /api/v1/creators.

--query matches the username; omit it to page the whole creator list.
--limit takes 1–200; omit it for the server's default page size.

Paging is --page only. This endpoint answers with the classic page envelope
(total items, current page, total pages) and no cursor, so there is no --cursor
here. The footer prints the next --page while the response says there is one.

Each row is USERNAME, MODELS (that creator's published model count) and LINK
(the equivalent models query on the website). To list the models themselves,
run `civitai models search --username <name>`.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

```bash
  civitai creators search --query artist --limit 10
  civitai creators search --limit 50 --page 2
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |
| `--limit int` | results per page (1-200) | — |
| `--page int` | page number | — |
| `--query string` | text search query | — |

**`civitai download [version-id]`**

Download a model version's file(s)

```text
Download the file(s) of a model VERSION from Civitai.

Identify the version deterministically by its numeric version id:

  civitai download 691639

…or resolve a model's default (first published) version with --model:

  civitai download --model 4384

The positional id is normally a model-VERSION id, but 'civitai models search'
and 'civitai models get' list MODEL ids — so handing a model id as the positional
(e.g. 'civitai download 4384') just works: the CLI recognizes it's a model id and
downloads that model's default version (printing a note that it did). When a
pasted number is BOTH a valid model id and a valid version id (common for low/mid
numbers), the CLI STOPS and asks you to disambiguate rather than silently
downloading an unrelated model's version — re-run with --model <id> (the model's
default version) or --version <id> (that version as-is). Use --version to name a
version id explicitly and skip that stop; --yes proceeds on the version
interpretation and echoes exactly which version it is downloading.

Use --dry-run to print the resolved plan (files, sizes, SHA256, target paths,
and whether auth is required) without transferring anything.

By default the version's PRIMARY file is downloaded into the current directory
under its server-provided name. Any file type downloads — model weights, but
also non-weights deliverables like a "Workflows" model's Archive, training data,
or other artifacts. Use --file to pick a specific file, or --all to download
every file. Downloads stream to "<target>.part" and are renamed into place only
on success, so an interrupted run never leaves a truncated final file.

Selecting one of two same-named files: a version can ship two files with the
SAME name (e.g. an fp16 and an fp8 both named flux_dev.safetensors). --file
accepts a numeric FILE ID (the version's files[].id) as well as a name, so you
can pick exactly one — the ids are shown by --dry-run and in the error you get
if a name is ambiguous. --all refuses to run when two selected files would
resolve to the same on-disk path (which would silently overwrite one), listing
the colliding files with their ids so you can --file <id> the one you want.

Authentication: most model files require a token to download — a gated file
requires authentication (it 401s without a token), but some public files
download with no token at all. Run 'civitai login' if a download 401s. Your
stored login token or CIVITAI_TOKEN is sent automatically. The read/search
commands (models, model-versions, articles, images, …) always work anonymously.

Folder routing: pass --layout <a1111|comfyui> (with an optional --root <dir>,
default ".") to write each file into the correct subfolder for that app, routed
by the file/model type — so --all fans a bundled VAE into the VAE folder
instead of polluting the checkpoint folder. --layout is mutually exclusive with
--out/--out-dir.

Compatibility: --for-base "<baseModel>" warns on stderr when the version's base
model is in a confidently different family than your target (e.g. an SD 1.5
embedding for an SDXL model). The version's base model is always shown.

Integrity: the streamed bytes are verified against the file's SHA256 by default
(--no-verify to skip; a file with no published SHA256 is downloaded with a
warning). A hash mismatch deletes the partial file and fails. SHA256 verifies
INTEGRITY (the bytes match what the API advertised), NOT authenticity — a
compromised source that advertises a matching hash for malicious bytes can't be
detected by the hash alone. Pickle/executable (.ckpt/.pt/.pth/.bin/.pickle/.pkl)
and archive (.zip/.tar/.tar.gz/.tgz/.rar/.7z) files can execute code when loaded;
the CLI notes this on stderr. Only download models from creators you trust.
```

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

```text
Generate images from a text prompt on Civitai's generator.

🔴 THIS SPENDS REAL BUZZ AND CANNOT BE UNDONE. A submitted generation is charged;
there is no cancel-for-refund and no "undo". Preview the price with --dry-run
first — it calls the server's cost estimator and spends nothing.

CREDENTIAL: generation needs the AI Services scopes. Two credentials carry them:
`civitai login --scopes generate` (a browser login that opts into generation), or a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account). A DEFAULT OAuth browser login
(`civitai login` with no --scopes) does NOT carry them and is refused — and
re-running plain `civitai login` will not fix that. Check yours with
`civitai whoami`.
The ONE exception is --print-input: it assembles the graph and exits before the
estimator, the submit and the balance read, so it needs no credential. Two
caveats, and they are NOT the same caveat. With --image it does need one, because
it uploads each local file first and that upload is authenticated. With
--checkpoint or --lora it still needs none — the model-version lookup is a public
read — but it is not OFFLINE: that lookup is a real request and fails without a
network. Only a bare --print-input needs neither a credential nor a network.

--max-cost IS AN ESTIMATE CHECK, NOT A SPENDING CAP. The cost this command shows
is an estimate, not a quote: the server's estimator returns no quote id, no
signed price and no expiry — there is nothing to hand back at submit time, and
no server-side ceiling is reachable from an API key at all. The realized charge
can exceed the estimate, and it is not refunded. --max-cost compares the
ESTIMATE against your number and refuses locally before submitting; it catches a
--quantity typo, and that is all it can do. Do not run an unattended loop
believing it caps spend.

CONFIRMATION: an interactive run prints the estimate and your balance and asks
before spending. A non-interactive shell (pipe/CI) without --yes is REFUSED
rather than charged silently.

WHAT THE SERVER DOES NOT TELL YOU: the generator is permissive, not a validator.
An out-of-range --quantity is clamped with no error, and a checkpoint id that
does not exist is accepted with the ecosystem default silently substituted and
billed. This command therefore resolves every --checkpoint / --lora id against
the public model-version API BEFORE submitting, so a bad id is a hard local
error instead of a wrong charge, and it echoes the resolved model NAME in the
confirmation so you approve a name rather than an integer.

WAITING AND DOWNLOADING: by default the command waits for the job to finish and
writes every deliverable output into --out-dir as <workflow-id>-<n>.<ext>. Pass
--no-wait to print the workflow id and exit immediately, and pick the results up
later with `civitai workflows get <workflow-id>`. Output URLs are PRESIGNED AND
EXPIRE, so download promptly; re-read the workflow for fresh links.

🔴 --timeout STOPS WAITING. IT DOES NOT STOP PAYING. The generation keeps
running server-side after the CLI gives up, and the charge stands — there is no
cancel-for-refund, and a mid-run cancel bills the accrued cost anyway. The same
is true of Ctrl-C. Both print the workflow id and the exact command to re-attach.

CRASH SAFETY: the idempotency key is written to a local file BEFORE the request
is sent, because the money moves server-side even if this process dies mid-POST.
If a submit's reply never arrives, re-run with --external-id <the recorded key>:
the orchestrator dedupes on it and returns the PRE-EXISTING workflow instead of
charging a second time.

IMAGE-TO-IMAGE: --image <file-or-url> attaches a reference image (repeatable).
A local png/jpeg is uploaded to Civitai first and the stored blob is referenced;
an https URL is passed through as-is, but must be publicly reachable, because the
generator downloads it server-side too. Either way the CLI reads the image's
width and height from its header and sends them — the server requires both and
rejects an entry without them.

🔴 --image REQUIRES --ecosystem, and the reason is money. The server turns a
text-to-image job into image-to-image only when the request names an ecosystem;
without one it ignores the images, generates from the prompt alone, and charges
you the full amount with no error. Worse, only SOME ecosystems accept reference
images at all (Qwen, Flux1Kontext, NanoBanana, Seedream, OpenAI, Grok and a few
more do; the SD family and the default do not) — and the cost estimate cannot
tell you which case you are in, because several edit-capable ecosystems price
identically with and without images. Name an ecosystem you know supports editing.

🔴 The server SILENTLY TRUNCATES too many reference images. Per-ecosystem limits
run from 1 to 7 and are not knowable from here; over the limit the extras are
dropped with no error and the truncated job is billed. The CLI refuses more than
7 (no ecosystem accepts more) and warns for anything above 1.

RAW GRAPHS: --input <file> (or --input -) sends a generation-graph JSON document
exactly as written, instead of building one from the flags above. It is how you
reach graph parameters this CLI has no flag for. Get a valid starting point with
--print-input, which assembles the graph, prints it, and exits without
submitting or even pricing anything.

--input is txt2img only in this release. It cannot be combined with the content
flags (--negative-prompt, --quantity, --aspect-ratio, --checkpoint, --lora) or
with a prompt argument; the execution flags all still apply. Keys that belong to
the request ENVELOPE rather than the graph — civitaiTip, creatorTip, buzzType,
tags, externalId — are REFUSED in an input file: they are this CLI's to set, and
a tip in particular is real Buzz that --dry-run structurally cannot see. Keys
this CLI does not recognise are passed through with a warning, because the
server silently drops what it does not declare rather than reporting an error.

🔴 --input DOES NOT get the model-id safety net. --checkpoint and --lora are
resolved against the public API before submitting, so a bad id fails locally
instead of being billed with a substituted model; a raw graph is not
interpreted, so nothing in it is checked before you pay for it.
```

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

```text
Read-only access to Civitai images through the public REST API
(GET /api/v1/images). Videos and audio posts ride the same route — pick one
with --type image|video|audio.

No login is needed — these are public read routes (unlike `civitai app list`
and `app view`, which are refused without a token). The CLI still sends your
stored token when you have one; --anon forces an anonymous request.

`images search` is the feed; `images get <id>` is one image, by the id in
a civitai.com/images/<id> URL.

Both can render the GENERATION METADATA — prompt, negative prompt, sampler,
cfg, steps, seed, and the resources "recipe" of checkpoint plus LoRAs — which
is what makes this a reproduction tool rather than a gallery. `search` omits
it unless you pass --meta, matching the API (which leaves meta out by default
to keep pages small); `get` always asks for it.

An uploader can hide their generation data. Those images print
"meta: (hidden by uploader)" rather than failing.

--json writes the API response to stdout and nothing else — notes and errors go
to stderr, so `… --json | jq -e .` always parses. The document is the API's,
the bytes are not: it is re-indented on the way out, so do not diff or hash it
against the wire.
```

```bash
  civitai images search --limit 5
  civitai images search --model-id 4384 --period Month
  civitai images search --base-model "Krea 2" --sort "Most Reactions" --period Week
  civitai images search --nsfw --sort "Most Reactions" --period Month --meta
  civitai images get 136456589
```

**`civitai images get <id>`**

Get a single image by id (GET /api/v1/images?imageId=\<id>)

```text
Fetch one image by its numeric id — the id in a civitai.com/images/<id> URL —
and render its generation metadata: prompt, negative prompt, sampler, cfg,
steps, seed, and the resources recipe (checkpoint plus LoRAs, with weights and
hashes). Metadata is requested implicitly, so this is the same detail block
`images search --meta` prints.

There is no per-id REST route. This is GET /api/v1/images?imageId=<id> — the
search endpoint keyed to a single id — which is why `--json` hands back a
one-item search envelope rather than a bare image object.

The id is validated locally: a non-integer, non-positive, or beyond-32-bit
value is refused as a usage mistake before any request, so an oversized id
comes back as a clear refusal instead of a server error.

A resource line falls back to meta.hashes when the generator inlined no hash;
those hashes are exactly what `model-versions by-hash` resolves.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

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

```text
Search images via GET /api/v1/images.

Filters: --model-id, --model-version-id, --post-id, --username, --nsfw and
--base-model (repeatable — the API ORs the values). --base-model is matched
LITERALLY, so a misspelling returns zero results rather than an error; the CLI
says so on stderr.

--type, --sort and --period take server-owned value sets.
The CLI does not check those value sets — it passes the value through and the
server rejects an unknown one with HTTP 400, reported as a usage mistake.

--sort is IGNORED when --model-id is set — the API returns that model's images
in its own order whatever you ask, so the CLI notes it on stderr rather than
let you believe the sort took. --model-version-id does honour --sort.

--meta adds each image's prompt, sampler, cfg, steps, seed, model and resource
list, rendered as a per-image block instead of the table (a table cannot hold a
prompt). With --json it adds the raw meta object to every item.

Paging: --limit takes 1–200; omit it for the server's default page size.
--page is shallow paging, --cursor is deep paging, and the next cursor is
printed under the results. The API caps page × limit at 1000 and answers 429
past it — the CLI reports that cap as a usage mistake, not a rate limit, so a
retry loop does not spin on it.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

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

```text
Authenticate the CLI with Civitai for authenticated commands (whoami,
app submit).

By default `civitai login` runs a browser-based device login: it prints a
URL and a code, you approve in your browser, and the CLI stores short-lived
OAuth tokens that refresh automatically.

Alternatively, pass --token to store a personal API key created at
https://civitai.com/user/account (API Keys). Passing --token with NO value prints
where to create that key and how to re-run (it does not log in). Either way the
credential is saved
to your config file (~/.config/civitai/config.yaml, owner-readable only). The
CIVITAI_TOKEN environment variable still overrides the stored credential.

SCOPES. By DEFAULT `civitai login` grants identity + Apps submit +
dev-tunnel, and deliberately NOT Buzz-spend — a plain login must never silently
hand the CLI authority to spend your Buzz. Opt in per named scope set with
--scopes (additive — you keep everything the default grants):

  --scopes generate
      run `civitai generate` and read your Buzz balance (AIServicesRead|AIServicesWrite|BuzzRead) — this login WILL be able to SPEND your Buzz

So `civitai login --scopes generate` yields ONE credential that can both
submit apps and run `civitai generate`. Without it, generation is refused
and `dev:live` cannot spend; the other way to get spend authority is a
full-scope personal API key (`civitai login --token <key>`, created at
https://civitai.com/user/account).

--scopes applies only to the browser device login; it is rejected with --token.

Switching accounts: running `civitai login` again overwrites the stored
credential with the new account — no separate logout needed. (Check the active
account with `civitai whoami`.)
```

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
| `--token string[="(no value)"]` | store a personal API key instead of the browser device login (pass with no value to print where to create one) | — |

**`civitai model-versions`**

Inspect model versions on Civitai

```text
Read-only access to Civitai model versions through the public REST API
(GET /api/v1/model-versions/{id} and .../by-hash/{hash}).
Aliases: model-version, mv.

No login is needed — these are public read routes (unlike `civitai app list`
and `app view`, which are refused without a token). The CLI still sends your
stored token when you have one; --anon forces an anonymous request.

A model VERSION is the downloadable unit, and it is what most of the rest of
this CLI wants: `civitai download --version <id>`,
`civitai generate --checkpoint <id>` and `--lora <id>` all take a version
id, never a model id. `civitai models get <id>` is where you read those
version ids off a model.

`by-hash` runs that lookup backwards: it identifies a file you already have
on disk, which is how you put a name to an unlabelled .safetensors.

--json writes the API response to stdout and nothing else — notes and errors go
to stderr, so `… --json | jq -e .` always parses. The document is the API's,
the bytes are not: it is re-indented on the way out, so do not diff or hash it
against the wire.
```

```bash
  civitai model-versions get 128713
  civitai mv get 128713 --json
  civitai model-versions by-hash 5D8D26E2A6
```

**`civitai model-versions by-hash <hash>`**

Get a model version by file hash (GET /api/v1/model-versions/by-hash/{hash})

```text
Look up a model version by any of its file hashes:
GET /api/v1/model-versions/by-hash/{hash}.

AutoV1, AutoV2, SHA256, CRC32 and BLAKE3 hashes all work — the server
upper-cases the value, so case does not matter here. This is the "what IS this
file?" lookup for a .safetensors you already have on disk.

Note the API reports SHA256 in UPPER case while sha256sum prints lower case, so
case-fold before comparing if you hash a file yourself. (`civitai download`'s
own verification is already case-insensitive.)

On a hit the CLI prints a ready-to-run download line for the resolved version.
It uses --version rather than a bare positional id deliberately: a bare id is
ambiguous between a model id and a version id, and the printed command must
never be the one that trips that stop.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

```bash
  civitai model-versions by-hash 5D8D26E2A6
  civitai mv by-hash 5D8D26E2A6 --json
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |

**`civitai model-versions get <id>`**

Get a model version by id (GET /api/v1/model-versions/{id})

```text
Get one model version by its version id: GET /api/v1/model-versions/{id}.

This is the id `civitai download --version` and
`civitai generate --checkpoint / --lora` take. A non-integer argument is
refused locally, as a usage mistake, before any request is made.

The output carries the base model, the trigger words, the AIR identifier and
every file with its size and type. A version whose primary file is not model
weights is tagged with that type ([Archive], [Training Data], [Other]).

What a version does NOT carry is model-level data. Its .model is a stub — the
CLI reads a name, a type and an nsfw flag out of it — and there is no creator
and no model-level download count on this response at all. If you started from
a version and need those, read them from `models get` / `models search`
and join on the version's .modelId.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

```bash
  civitai model-versions get 128713
  civitai mv get 128713 --json
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |

**`civitai models`**

Search and inspect models on Civitai

```text
Read-only access to Civitai models through the public REST API
(GET /api/v1/models, GET /api/v1/models/{id}).

No login is needed — these are public read routes (unlike `civitai app list`
and `app view`, which are refused without a token). The CLI still sends your
stored token when you have one; --anon forces an anonymous request.

`models search` is the discovery surface — filter by --query / --tag /
--username / --type / --base-model, order with --sort / --period, and page with
--limit / --page / --cursor. `models get <id>` returns one model with its
full version list.

What lives one level down: a model is the PAGE, a model VERSION is the
downloadable unit. `civitai download` and `civitai generate --checkpoint`
both take a version id, which `models get` lists.

--json writes the API response to stdout and nothing else — notes and errors go
to stderr, so `… --json | jq -e .` always parses. The document is the API's,
the bytes are not: it is re-indented on the way out, so do not diff or hash it
against the wire.
```

```bash
  civitai models search --query "pony" --limit 5
  civitai models search --type LORA --base-model Illustrious --limit 20
  civitai models get 4384
  civitai models get 4384 --json
```

**`civitai models get <id>`**

Get a model by id (GET /api/v1/models/{id})

```text
Get one model by id: GET /api/v1/models/{id}.

The id is the number in a civitai.com/models/<id> URL. A non-integer argument
is refused locally, as a usage mistake, before any request is made.

The human output lists every published VERSION (id, name, base model) — that
version id is what `civitai download --version` and
`civitai generate --checkpoint` take. A version whose primary file is not
model weights is tagged with its actual file type ([Archive], [Training Data],
[Other]); it still downloads, the tag just says it is not a .safetensors.

--json carries much more than the human view — the description HTML, per-file
hashes and download URLs, and the full stats block.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

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

```text
Search models via GET /api/v1/models.

Filters: --query (free text), --tag, --username, --base-model (repeatable — the
API ORs the given values) and --nsfw. --base-model is matched LITERALLY, so a
misspelling returns zero results rather than an error; the CLI says so on
stderr.

--type, --sort and --period take server-owned value sets.
The CLI does not check those value sets — it passes the value through and the
server rejects an unknown one with HTTP 400, reported as a usage mistake.

Paging: --limit takes 1–100; omit it for the server's default page size.
--page is shallow paging, --cursor is deep paging, and the next cursor is
printed under the results. The API caps page × limit at 1000 and answers 429
past it — the CLI reports that cap as a usage mistake, not a rate limit, so a
retry loop does not spin on it.

--period changes the SORT, not the DOWNLOADS column: the API returns only the
all-time download count, so a later row can legitimately show more downloads
than an earlier one. The column is labelled DL(all-time) for that reason.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

```bash
  civitai models search --query "pony" --limit 5
  civitai models search --type LORA --sort "Most Downloaded" --period Month
  civitai models search --base-model Pony --base-model Illustrious --limit 20
  civitai models search --username some-creator --cursor '<cursor>'
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

```text
Read-only access to Civitai MODEL tags through the public REST API
(GET /api/v1/tags).

No login is needed — these are public read routes (unlike `civitai app list`
and `app view`, which are refused without a token). The CLI still sends your
stored token when you have one; --anon forces an anonymous request.

These are the model taxonomy — the same names `civitai models search --tag`
filters on, which is what this group is for: find the tag, then search with it.

The group is search-only, and deliberately so: the public route answers with a
tag NAME and a LINK per tag and nothing else, so there is nothing for a
`tags get` to fetch.

Not to be confused with `civitai articles search --tags`, which takes numeric
tag IDS rather than these names — a different filter on a different endpoint.

--json writes the API response to stdout and nothing else — notes and errors go
to stderr, so `… --json | jq -e .` always parses. The document is the API's,
the bytes are not: it is re-indented on the way out, so do not diff or hash it
against the wire.
```

```bash
  civitai tags search --query anime --limit 10
  civitai tags search --query anime --json
```

**`civitai tags search`**

Search tags (GET /api/v1/tags)

```text
Search model tags via GET /api/v1/tags.

--query matches the tag name; omit it to page the whole tag list.
--limit takes 1–200; omit it for the server's default page size.

Paging is --page only. This endpoint answers with the classic page envelope
(total items, current page, total pages) and no cursor, so there is no --cursor
here. The footer prints the next --page while the response says there is one.

Each row is a tag NAME and a LINK. The name is what
`civitai models search --tag <name>` takes — that is the follow-up this
command exists to set up. The link is the equivalent models query on the
website.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

```bash
  civitai tags search --query anime --limit 10
  civitai tags search --limit 50 --page 2
```

| Flag | Description | Default |
|---|---|---|
| `--anon` | force an anonymous request (ignore any stored login token) | — |
| `--json` | print the raw API JSON response (for scripting) | — |
| `--limit int` | results per page (1-200) | — |
| `--page int` | page number | — |
| `--query string` | text search query | — |

**`civitai upgrade`**

Update the civitai CLI to the latest release

```text
Download and install the latest civitai release, replacing this binary.

The latest release is resolved from the public GitHub releases API (no token is
ever sent). The downloaded tarball is verified against its SHA-256 checksum
before anything is replaced — a mismatch aborts the upgrade and leaves the
current binary untouched.

If this binary was installed via Homebrew, upgrade delegates to:
    brew upgrade civitai/tap/civitai
(use --force to self-replace anyway).
```

```bash
  civitai upgrade
  civitai upgrade --force
```

| Flag | Description | Default |
|---|---|---|
| `--force` | reinstall even if already up to date, and self-replace a Homebrew install | — |

**`civitai users`**

Look up users on Civitai

```text
Read-only access to Civitai users through the public REST API.

No login is needed — these are public read routes (unlike `civitai app list`
and `app view`, which are refused without a token). The CLI still sends your
stored token when you have one; --anon forces an anonymous request.

NOTE: the only public users route is the SEARCH endpoint GET /api/v1/users,
keyed by ?query= or ?ids=. The per-id route /api/v1/users/{userId} is an
INTERNAL webhook (POST plus a system token) and is not usable from the CLI, so
`users get` resolves a user through that public search.

That is also why there is no `users search`: the search endpoint is already
what `users get` calls, and it answers with a handful of fuzzy neighbours
rather than a browsable, pageable list — it has no pagination envelope at all.

What comes back is identity only: id, username and avatar URL. For a user's
models use `civitai models search --username <name>`; for their published
model COUNT use `civitai creators search --query <name>`.

--json writes the API response to stdout and nothing else — notes and errors go
to stderr, so `… --json | jq -e .` always parses. The document is the API's,
the bytes are not: it is re-indented on the way out, so do not diff or hash it
against the wire.
```

```bash
  civitai users get some-username
  civitai users get 5
  civitai users get 5 --json
```

**`civitai users get <username-or-id>`**

Look up a user by username or id (public search: GET /api/v1/users)

```text
Look up a user by username or numeric id through the public user search
(GET /api/v1/users). A numeric argument is sent as ?ids= and returns exactly
that user; anything else is sent as ?query=.

A NAME lookup is FUZZY on the server side — the endpoint answers with the
closest-matching users, not with your user. So the CLI requires an exact
(case-insensitive) username match before it prints anybody: a typo lists the
near misses and fails as not-found rather than confidently printing the wrong
person. When several users match, the exact one is printed and the rest are
listed under "other matches". Pass the numeric id when you need certainty.

An unknown user comes back from this endpoint as an empty HTTP 200 rather than
a 404. The CLI still reports it as NOT FOUND, so a script gets the same signal
it would from a real 404.

The result is identity only — id, username, avatar URL. There are no stats and
no model list on this route.

Works anonymously (no login needed); --anon forces an anonymous request even
when you are logged in.
```

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

```text
Print detailed build information for this civitai binary.

The version, commit, and date are stamped in at release time. For a plain
"go install" or source build they fall back to the embedded Go build info
(module version + VCS revision/time).

After printing build info, this command makes a single unauthenticated call to
the GitHub releases API to tell you if a newer release is available. The check
is best-effort (short timeout, fails silently offline) and never sends your API
token. Skip it with --no-update-check or by setting CIVITAI_NO_UPDATE_CHECK.
```

```bash
  civitai version
  civitai version --no-update-check
```

**`civitai whoami`**

Verify your stored API token and its capabilities

```text
Verify the stored API token by calling the Civitai API and printing the
authenticated user PLUS a short capability summary: the credential type (OAuth
login vs personal API key), whether it can read your Buzz balance, and whether
it can spend Buzz. The money-path dead end — an OAuth `civitai login` token
can submit/withdraw but cannot spend Buzz — is surfaced here, before dev:live.

Reads the token from config or CIVITAI_TOKEN.
```

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

```text
Work with the generation workflows your account has submitted.

A workflow is one submitted generation job. `civitai generate` prints a
workflow id; `list` and `get` are how you find one afterwards — which is what
makes `--no-wait`, a --timeout expiry and a Ctrl-C recoverable rather than a
dead end.

`list` and `get` are reads and SPEND NOTHING. 🔴 `cancel` stops a job but does
NOT refund it — a mid-run cancel bills the accrued cost, non-refundably.
```

```bash
  civitai workflows list
  civitai workflows get 01JABCXYZ
  civitai workflows get 01JABCXYZ --json
  civitai workflows cancel 01JABCXYZ
```

**`civitai workflows cancel <workflow-id>`**

Cancel a running generation workflow (DOES NOT REFUND)

```text
Cancel a generation workflow that is still running.

🔴 CANCELLING DOES NOT GET YOUR BUZZ BACK. A mid-run cancel BILLS THE ACCRUED
COST, orchestrator-side and non-refundably. There is no cancel-for-refund
anywhere on this platform: by the time a workflow is running, the money has
moved. Cancel a job because you no longer want its OUTPUT — never as a way to
save money, and never as a way to undo a submit you regret.

That is also why `civitai generate --timeout` and Ctrl-C do not cancel anything:
stopping the wait costs nothing, while stopping the job would cost the same as
letting it finish and would throw away the result you already paid for.

Cancelling an already-finished workflow is harmless — the outputs of a succeeded
workflow are not deleted by it (use the website to delete results).

This needs the same AI Services scopes that `civitai generate` needs:
`civitai login --scopes generate` (a browser login that opts into generation), or a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account).

CONFIRMATION: cancelling is IRREVERSIBLE and destroys a job you have already paid
for, so an interactive run asks first. Pass `--yes` to skip the prompt in a
script; a non-interactive shell without `--yes` REFUSES rather than cancelling
silently.
```

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

```text
Show one generation workflow: its status, its steps, and its outputs.

Use it to re-attach to a job you did not wait for — after `--no-wait`, after a
--timeout expiry, or after Ctrl-C. The workflow id is printed by
`civitai generate` in all three cases.

OUTPUT URLS ARE PRESIGNED AND EXPIRE. The links this prints are short-lived;
fetch them promptly or re-run this command for fresh ones.

Outputs that are blocked by moderation, not available, or hidden are listed with
the reason rather than omitted — a finished workflow can legitimately contain
fewer usable results than it was charged for, and silently dropping them would
make that invisible.

Reading a workflow SPENDS NOTHING. It needs the same AI Services scopes that
`civitai generate` needs: `civitai login --scopes generate` (a browser login that opts into generation), or a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account).
```

```bash
  civitai workflows get 01JABCXYZ
  civitai workflows get 01JABCXYZ --json
```

| Flag | Description | Default |
|---|---|---|
| `--json` | emit the raw server payload on stdout (scriptable) | — |

**`civitai workflows list`**

List the generation workflows you have submitted

```text
List your own generation workflows, newest first.

This is the feed behind the website's generator queue: one entry per submitted
job, with its status, when it was created, what it cost and how many outputs it
produced.

PAGING is by cursor, not page number. --limit sets the page size; when more
results exist the command prints the next cursor, which you pass back as
--cursor to fetch the following page. Deep pages are not cached server-side, so
walk them at a civil pace.

Each row reports outputs as "<deliverable>/<total>". They differ when an output
was blocked by moderation, never landed, or was hidden on the website — a
workflow you were charged for can legitimately have fewer usable results than it
produced, and collapsing the two numbers would hide that. Use
`civitai workflows get <id>` for the per-output reasons and the URLs.

Reading SPENDS NOTHING. It needs the same AI Services scopes that
`civitai generate` needs: `civitai login --scopes generate` (a browser login that opts into generation), or a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account).
```

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
