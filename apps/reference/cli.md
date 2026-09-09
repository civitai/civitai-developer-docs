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
  civitai app doctor
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
immediately runnable (npm install && npm run dev:harness) and test-green.
"civitai app validate" passes once you have run "npm install" — until then it
correctly reports the package-lock.json the platform build installs from.

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

The blockId is your app's PERMANENT public identity — the hostname your app will
be served at once it is approved, and the argument every later command takes — so
derivation refuses rather than guesses when the name carries LETTERS a blockId
cannot hold ("Café Del Mar", "ÜberApp", any non-Latin name). Punctuation, symbols
and emoji still fold to a hyphen, as they always have ("Rocket 🚀 App" ->
rocket-app). Pass --slug <slug> to choose the blockId yourself; it bypasses
derivation entirely.

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

  # A name derivation cannot slugify: choose the blockId yourself.
  civitai app create "Café Del Mar" --slug cafe-del-mar
```

| Flag | Description | Default |
|---|---|---|
| `--dir string` | output directory (default ./\<slug>) | — |
| `--from string` | fork from an existing published app slug (NOT AVAILABLE YET — the CLI cannot fetch app source) | — |
| `--name string` | display name (default derived from the name argument) | — |
| `--slug string` | explicit blockId (bypasses derivation from the name; 3-40 chars, starts with a letter, lowercase a-z/0-9/hyphens) | — |
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

The blockId is your app's PERMANENT public identity — the hostname your app will
be served at once it is approved, and the argument every later command takes — so
derivation refuses rather than guesses when the name carries LETTERS a blockId
cannot hold ("Café Del Mar", "ÜberApp", any non-Latin name). Punctuation, symbols
and emoji still fold to a hyphen, as they always have ("Rocket 🚀 App" ->
rocket-app). Pass --slug <slug> to choose the blockId yourself; it bypasses
derivation entirely.

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

  # A name derivation cannot slugify: choose the blockId yourself.
  civitai app init "Café Del Mar" --slug cafe-del-mar

  # Name, slug, and dir all independent.
  civitai app init my-block ./apps/foo --name "My Block"
```

| Flag | Description | Default |
|---|---|---|
| `--dir string` | output directory (default ./\<slug>) | — |
| `--from string` | fork from an existing published app slug (NOT AVAILABLE YET — the CLI cannot fetch app source) | — |
| `--name string` | display name (default derived from the name argument) | — |
| `--slug string` | explicit blockId (bypasses derivation from the name; 3-40 chars, starts with a letter, lowercase a-z/0-9/hyphens) | — |
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
prebuilt dist. The platform rebuilds from source.

Excluded DIRECTORIES, by name, at any depth:
  .cache, .git, .hg, .mypy_cache, .next, .pnpm-store,
  .pytest_cache, .ruff_cache, .svn, .turbo, .venv, .vite,
  build, coverage, dist, node_modules, out, venv
...and by pattern: a DIRECTORY named .env or .env.<anything> (e.g.
  .env.d/, .env.local/, .env.production/), or ending in .zip, is dropped
  whole at any depth; matching ignores case, so .ENV.D/ and x.ZIP/ go
  too. Directories whose names merely start with .env — .envrc/,
  .env-backup/, .envs/ — are NOT dropped, but the FILE rules still reach
  inside them: a db.env or prod.env there is dropped by the *.env rule,
  and so is a .env.production, because the allow-list applies at the
  PROJECT ROOT only. .env.example, .env.sample and .env.production are
  uploaded from the root and dropped everywhere else —
  .env-backup/.env.production, backups/.env.production and
  .env.d/.env.production all go.

Excluded FILES, by base name:
  *.zip, .env, .env.local, .env.*.local, .env.development, .env.test,
  .env*, *.env
...but these three are KEPT and uploaded, AT THE PROJECT ROOT ONLY:
  .env.example, .env.production, .env.sample
Nothing reads their contents, so put no token in any of them. The allow-list
does not travel: app/.env.production and .env-backup/.env.production are
dropped, and the Skipped line names each one with the rule that matched.
A kept name does not rescue its directory either: under node_modules/ or
.env.d/ the whole directory goes, and the Skipped line names the DIRECTORY,
not the file inside it.

The two lists are separate rules, so the shape matters: a regular file named
build or dist IS packaged, and .git / .hg / .svn go either way (in a linked
worktree or a submodule, .git is a file).

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

Version guard:
  A submit that would really upload first checks the app's own submissions and
  REFUSES when the manifest version is not strictly above the highest APPROVED
  version — submitting an older (or the same) version replaces the newer live
  deployment on approval, which is what a repo that is behind what was last
  released produces naturally. Pass --allow-downgrade for a deliberate rollback.

Dirty-tree guard:
  When the packaged directory is inside a git work tree, a submit that would
  really upload REFUSES while files that go into the bundle are uncommitted —
  the bundle is built from what is on disk, so approving one deploys code that
  exists in no commit. Pass --allow-dirty to submit the tree as it is. This
  degrades: a directory with no git repo (every scaffolded app starts that way)
  submits exactly as before, and a clean tree whose HEAD is on no remote warns
  rather than refusing.

Build provenance:
  A submit that really uploads also STAMPS the commit it was built from — the
  40-character sha of HEAD, plus whether the work tree was dirty — so
  `civitai app status` can later say which source a live version came from.
  It is a CLAIM, not a proof: the server records what this CLI reports and
  cannot verify the bundle was built from that commit. It degrades the same way
  the guard does — no repo, no git, or a repo with no commits sends nothing at
  all rather than a guess — and --allow-dirty still stamps, marking the
  submission dirty, because that is the case worth being able to look up.

Defaults to the current directory.
```

```bash
  civitai app submit                    # validate + package + confirm + submit
  civitai app submit --yes              # skip the confirmation prompt (scripts/CI)
  civitai app submit --package-only     # just write the .zip (safe preview, never submits)
  civitai app submit --allow-downgrade  # deliberate rollback below the approved version
  civitai app submit --allow-dirty      # submit uncommitted working-tree changes on purpose
  civitai app submit -o my-block.zip ./my-block
```

| Flag | Description | Default |
|---|---|---|
| `--allow-dirty` | submit even when the packaged directory has uncommitted git changes | — |
| `--allow-downgrade` | submit even when the version is not above the highest approved one (deliberate rollback) | — |
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

--limit N shows only the newest N of them. It is a DISPLAY limit, not a page
size: this route accepts no limit and no cursor (that is what the cap note is
about), so the CLI always fetches the same page and prints fewer rows of it.
--limit therefore cannot reach submissions the API did not return.

When a single submission is requested AND the current directory holds a
block.manifest.json for that same app, the local manifest version is compared
against your highest APPROVED version. If the repo is BEHIND, a warning is
printed on stderr — a repo behind its own live deployment is how an accidental
downgrade gets submitted. It is advisory only: the exit code never changes, and
nothing is said when the versions cannot be compared.

The SOURCE column (and the detail view's "Source commit" line) is the commit the
submitting client CLAIMED it built the bundle from — abbreviated in the table,
full in the detail view and in --json. It is stored unverified: the server
records what the client reported and cannot check it. A "-" means nothing was
reported (a submission from before the CLI sent it, or from a directory that is
in no git repo), which is NOT the same as a clean build; "(dirty)" means the
client said uncommitted changes went into that bundle.

Note: a submission's <blockId>.civit.ai surface only serves AFTER it is approved
and deployed (deployState 'live').
```

```bash
  civitai app status                 # list all your submissions
  civitai app status --limit 5       # just the newest five
  civitai app status my-block        # detail for the my-block app
  civitai app status --id pubreq_01H # detail by publish-request id
  civitai app status --json          # raw JSON (scriptable)
```

| Flag | Description | Default |
|---|---|---|
| `--id string` | look up a single submission by publish-request id (pubreq_...) | — |
| `--json` | emit raw JSON (scriptable) | — |
| `--limit int` | show only the newest N submissions (display-side; the API pages nothing) | — |

**`civitai app withdraw [pubreq-id]`**

Withdraw your own pending App submission

```text
Withdraw your own pending App submission so you can resubmit a new bundle
for the same slug.

🔴 THIS IS NOT A FREE REPAIR —
withdrawing a FIRST-VERSION submission also DELETES that app's store listing
server-side — its icon, its cover and every screenshot with its caption.
Resubmitting mints an EMPTY listing; the media does not come back.

That is server-side and this command cannot opt out of it: the withdraw route
takes the publish-request id and nothing else. So attach your listing media
AFTER the submission you intend to keep, not before a withdraw — and if a
listing already has media you care about, copy the captions somewhere first.

The same discard happens when a MODERATOR REJECTS a first-version submission.
What "carries forward" is APPROVAL: media survives a moderator approving the
app, and does not survive the app leaving review any other way.

Calls the token-authenticated, self-scoped withdraw route
(POST /api/v1/blocks/withdraw) with your stored credential — you can only ever
withdraw your OWN submissions. Both a personal API key and an OAuth login
(civitai login) work; the OAuth token must carry the Apps submit scope
(the same gate the submit route uses).

Only a submission still in the 'pending' review state can be withdrawn; an
already-approved/rejected (or already-withdrawn) request cannot. Withdrawing is
idempotent WITH RESPECT TO THE SUBMISSION ONLY — withdrawing an already-withdrawn
request still succeeds, but the listing the FIRST withdraw deleted is already
gone and a second call does not restore it.

Pass the publish-request id as a positional argument or via --id (find it with
"civitai app status").

CONFIRMATION: because that deletion is irreversible, an interactive run asks
first. Pass --yes/-y to skip the prompt in a script; a non-interactive shell
without --yes REFUSES rather than deleting a listing silently.
```

```bash
  civitai app withdraw pubreq_01H        # withdraw by publish-request id (asks first)
  civitai app withdraw --id pubreq_01H   # same, via the flag
  civitai app withdraw pubreq_01H --yes  # skip the prompt (scripts/CI)
```

| Flag | Description | Default |
|---|---|---|
| `--id string` | the publish-request id to withdraw (pubreq_...) | — |
| `-y, --yes` | skip the confirmation and withdraw (required in a non-interactive shell) | — |

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
--slug). `civitai app submit` mints your listing as a DRAFT, so its media is
settable while pending review. It will
carry forward on APPROVAL only — withdrawing the submission, or a moderator
rejecting it, deletes the listing and everything on it.
Do not hand-caption a set you may withdraw.

Source files are checked locally BEFORE any upload — png, jpeg or webp, at most
2.0 MiB for an icon, 4.0 MiB for a cover, 2.0 MiB for a screenshot.
That reads the SOURCE FILE only: an icon is re-encoded server-side and the
platform caps the image IT made — it can pass here and be refused at attach.
```

```bash
  civitai app listing status
  civitai app listing set-text --tagline "Batch upscaling, in your browser"
  civitai app listing set-icon ./assets/icon.png
  civitai app listing set-cover ./assets/cover.png
  civitai app listing add-screenshot ./shot.png --caption "Grid view"
  civitai app listing rm-screenshot alsc_01H...
  civitai app listing reorder alsc_02 alsc_01 alsc_03
  civitai app listing submit-revision --changelog "Refreshed the gallery"
```

**`civitai app listing set-icon <file>`**

Set the listing icon (png, jpeg or webp, at most 2.0 MiB)

```text
Set your store listing's ICON — the small image shown beside your app's name.
An icon is MANDATORY: a listing cannot publish without one.

The source file is validated locally first (png, jpeg or webp, at most 2.0 MiB),
then ingested and attached, and the content scan is waited on afterwards.
Nothing is uploaded if the local check fails. The platform validates the
image's dimensions and aspect at the ATTACH step, so a wrongly-shaped image is
refused in seconds rather than after the scan.

An icon is also RE-ENCODED server-side to PNG (downscaled to at most 1024px on
the longer side) and the platform caps that re-encoded image — a different
measurement from the cap above, which is on your file. A detailed 1024x1024
icon can pass here and be refused there; the lever is smaller pixel dimensions.
See "Listing media requirements" in the README for the platform's bounds.

On a listing that is already LIVE this opens a REVISION for moderator re-review
instead of changing the live listing — pass --changelog to describe the change,
-y to skip the confirmation — but a live listing still below the publish floor
stages WITHOUT submitting, and exits 0. On a DRAFT listing it attaches directly.

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

Set the listing cover (png, jpeg or webp, at most 4.0 MiB)

```text
Set your store listing's COVER — the wide image at the top of the listing
page. A cover is MANDATORY: a listing cannot publish without one.

The source file is validated locally first (png, jpeg or webp, at most 4.0 MiB),
then ingested and attached, and the content scan is waited on afterwards.
Nothing is uploaded if the local check fails. The platform validates the
image's dimensions and aspect at the ATTACH step, so a wrongly-shaped image is
refused in seconds rather than after the scan.
See "Listing media requirements" in the README for the platform's bounds.

On a listing that is already LIVE this opens a REVISION for moderator re-review
instead of changing the live listing — pass --changelog to describe the change,
-y to skip the confirmation — but a live listing still below the publish floor
stages WITHOUT submitting, and exits 0. On a DRAFT listing it attaches directly.

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

The source file is validated locally first (png, jpeg or webp, at most 2.0 MiB),
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
-y to skip the confirmation — but a live listing still below the publish floor
stages WITHOUT submitting, and exits 0. On a DRAFT listing it attaches directly.
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
`civitai app listing status`, e.g. alsc_...).

On a listing that is already LIVE the removal lands in the open REVISION — the
ids `status` prints are that revision's — and it is NOT submitted, so your
public gallery keeps the screenshot until a moderator approves the revision.
Curating a gallery is usually several removals, so the submit stays yours to
make: run `civitai app listing submit-revision` when the revision is what you
want. On a DRAFT listing the removal applies to the listing itself.
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

On a listing that is already LIVE this opens a REVISION and submits it for
moderator re-review instead of reordering the live gallery — pass --changelog
to describe the change — but a live listing still below the publish floor
stages WITHOUT submitting, and exits 0. A DRAFT listing is reordered directly.
```

```bash
  civitai app listing reorder alsc_02 alsc_01 alsc_03
  civitai app listing reorder alsc_02 alsc_01 --slug my-app
```

| Flag | Description | Default |
|---|---|---|
| `--changelog string` | changelog for the moderator review (used only when the listing is already live) | — |
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

--json emits the same read as one object: parentId, shadowId (null when there
is no revision draft), status, hasPendingRevision, the attached media with
their image ids, and the publish-floor verdict. The parent and the shadow are
DIFFERENT listings and a change is addressed to one of them, so a script that
has to decide which needs both ids. The server's own editTargetId is NOT in
there: this CLI does not decode that field, and reporting an id it never read
would be a guess.

🔴 This is not a pure read — with or without --json — so do not poll it in a
loop: on a LIVE listing it opens the shadow revision described above, so a
script calling it repeatedly keeps a revision draft open on your listing. That
holds for an OFFSITE app too, and they are approved in practice.
civitai/cli#389 settled that a FAILED call writes nothing; a successful one
still does.
```

```bash
  civitai app listing status
  civitai app listing status --slug my-app
  civitai app listing status --dir ./my-app
  civitai app listing status --json | jq -r .shadowId
```

| Flag | Description | Default |
|---|---|---|
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--json` | emit the listing as JSON (scriptable) — includes the parent and shadow listing ids; NOT a pure read (see the note in --help) | — |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app listing set-source-repo [url]`**

Set (or clear) the public source-repository link on your listing

```text
Publish a link to your app's PUBLIC SOURCE on its store detail page.

It renders as one `Source` row on the /apps DETAIL page — never on a
grid card — and is omitted entirely when unset.

Pass a repository ROOT url to set it, or --clear to remove it. Exactly one of
the two. The SERVER validates the url and this command does not second-guess
it, so a rejection comes back in the server's own words.

ON-SITE apps are REFUSED (exit 1 — a verdict about the app, not a bad
command): their link comes from the `repository` key in
block.manifest.json, which the platform re-syncs at every approved version.

🔴 THIS IS A MATERIAL CHANGE, unlike set-text. On an APPROVED listing the
server stages it on a REVISION instead of applying it, so the live page is
unchanged until a moderator approves that revision. This command reports which
branch the server took — it never guesses. On a draft or pending listing it
applies directly.

See the guide for the accepted hosts, what counts as a "change", and the
states that are refused outright.
```

```bash
  civitai app listing set-source-repo https://github.com/me/my-app
  civitai app listing set-source-repo https://gitlab.com/me/my-app --slug my-app
  civitai app listing set-source-repo --clear
  civitai app listing set-source-repo https://github.com/me/my-app --json
```

| Flag | Description | Default |
|---|---|---|
| `--clear` | remove the source-repository link (sends an explicit null) instead of setting one | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--json` | emit the result as JSON (scriptable) — what was sent, and the server's own branch | — |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app listing set-text`**

Set your listing's tagline, description or category

```text
Set the store listing's TEXT fields — tagline, description and category.

These are the three problems `civitai app doctor` reports as
empty-tagline / empty-description / empty-category, and this is the command that
fixes them without the browser.

Pass any combination of --tagline, --description and --category; they are sent
as ONE patch, so a run either applies or does not. At least one is required.

CLEARING vs EMPTYING are different server states and both are reachable:
--tagline "" sets an EMPTY STRING; --clear tagline sets it to NULL. --clear
takes a comma-separated list (tagline, description, category)
and cannot be combined with the matching value flag.

Blanking a field needs --yes, so an unset shell variable cannot silently empty
a public field. Whitespace-only counts as blank (the server trims).

CATEGORY must be one of:
generation, games, utility, discovery, moderation, analytics, other

ON-SITE apps are REFUSED (exit 1 — a verdict about the app, not a bad command):
their copy comes from block.manifest.json and the platform overwrites it at your
next approved version. Edit the manifest instead.

This applies IN PLACE on every listing status — these are not "material"
changes, so they never open a revision for re-review. The server rate-limits
these edits (roughly 30 an hour).
```

```bash
  civitai app listing set-text --tagline "Batch upscaling, in your browser"
  civitai app listing set-text --category utility --slug my-app
  civitai app listing set-text --description "$(cat DESCRIPTION.md)"
  civitai app listing set-text --clear tagline,category
```

| Flag | Description | Default |
|---|---|---|
| `--category string` | set the marketplace category: generation, games, utility, discovery, moderation, analytics, other | — |
| `--clear strings` | clear a field to null instead of setting it: tagline, description, category (comma-separated) | — |
| `--description string` | set the long description (max 2000 characters) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--json` | emit the result as JSON (scriptable) — what was sent, and the server's own branch | — |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |
| `--tagline string` | set the short tagline (max 140 characters) | — |
| `-y, --yes` | permit a blank value for --tagline/--description/--category; blanks are refused without it (the check is on the VALUE you passed, not on the field's current contents) | — |

**`civitai app listing submit-revision`**

Submit your live listing's open revision for moderator review

```text
Submit the REVISION your live listing already has open — the one that
`civitai app listing status` reports and that `rm-screenshot` writes into — for
moderator re-review. Pass --changelog to describe the change.

Only an approved (LIVE) listing has a revision: a draft or pending listing is
edited directly, so there is nothing to submit and this refuses. It refuses too
when there is no open revision to submit, rather than sending a moderator an
empty one.

The revision is submitted as it stands, so stage everything you want in one
review cycle first. Submitting is idempotent — a revision already awaiting
review returns that same request rather than opening a second.
```

```bash
  civitai app listing submit-revision
  civitai app listing submit-revision --changelog "Dropped the outdated grid shot"
  civitai app listing submit-revision --slug my-app
```

| Flag | Description | Default |
|---|---|---|
| `--changelog string` | changelog for the moderator review | — |
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

CREDENTIAL: the analytics query needs the Apps submit scope — the same bit
`civitai app submit` and `civitai app status` require — so it accepts
an OAuth login (`civitai login`) carrying the Apps submit scope, or a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account). An OAuth
token minted before that scope existed does not carry it and is refused with
403; re-run `civitai login` to mint one that does.

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

**`civitai app doctor [slug]`**

Diagnose what is incomplete or blocked on your App store listings

```text
Report what is missing or blocked on your App store listings, and how to fix it.

With no argument it checks EVERY listing you own or hold an accepted
collaborator seat on. Pass an app slug to check just that one.

Findings come from the platform, grouped per app, blocking first:

  BLOCKING   the listing cannot publish until it is fixed — a missing icon or
             cover, or an asset the content scan BLOCKED.
  ADVISORY   recommended, but nothing is held up — no screenshots, or an empty
             description, tagline or category.

An app with nothing wrong is reported as complete, explicitly. A blank space is
not an answer.

Each finding prints the command or URL that fixes it. The three TEXT problems
(description / tagline / category) depend on the app KIND: an on-site app's copy
comes from block.manifest.json, an off-site app's from the web listing editor.
A blocked asset is REPLACED for an icon or cover, but a blocked screenshot must
be REMOVED — adding another does not clear it.

DELISTED LISTINGS: an app whose status is 'removed' is still reported, in its
own section, but its blocking problems do NOT set the exit code. The publish
floor is a statement about a listing that is trying to publish, and a delisted
one is not — without this, one old removed app would fail every run forever.

EXIT CODES: 1 when a blocking problem was found on a listing that can still
publish, 0 otherwise — including when only advisories were found, when the only
blocking problems are on delisted listings, and when you have no listings at
all. So it gates a release script directly:

    civitai app doctor my-app || exit 1

Every other exit code keeps its usual meaning (3 not authorized, 4 no such app,
5 transport). --json emits the same verdict as one object and uses the same exit
codes, so a script must branch on the code before trusting the payload.

Unlike `civitai app listing status`, this is a PURE READ — it opens no
revision draft on a live listing, so it is safe to run in a loop.
```

```bash
  civitai app doctor                 # every app you can work on
  civitai app doctor my-app          # just one
  civitai app doctor --json | jq -e .ok
  civitai app doctor my-app || echo "not ready to publish"
```

| Flag | Description | Default |
|---|---|---|
| `--json` | emit the findings as JSON (scriptable); the exit code is unchanged — 1 when anything is blocking | — |

**`civitai agent-setup`**

Set up your coding agent (Claude Code, Cursor, Codex, …) to build Civitai Apps

```text
Configure the coding agent you are using so it can build Civitai Apps.

It does three things, and it never authenticates:

  1. Writes an AGENTS.md managed block into the project — the commands and the
     gotchas an agent cannot infer by reading your code.
  2. Writes a one-line CLAUDE.md containing '@AGENTS.md', ONLY when there is no
     CLAUDE.md already. Claude Code does not read AGENTS.md on its own.
  3. Registers the two Civitai MCP servers in the detected agent's OWN config
     file. The path and the key name differ per agent — .mcp.json/mcpServers for
     Claude Code, .vscode/mcp.json/servers for VS Code, opencode.json/mcp for
     opencode, context_servers for Zed, serverUrl-not-url for Windsurf, a TOML
     [mcp_servers.<name>] table for Codex — which is why this is a command
     rather than a paragraph telling you to hand-write JSON.

NOTHING IS CLOBBERED. An existing AGENTS.md is appended to, or has only its
managed block replaced; an existing CLAUDE.md is left exactly as you wrote it;
an existing MCP config is MERGED into, preserving every other server, every
unknown key, and every key you added to the Civitai entries themselves. A config
file that does not parse is refused by name rather than repaired -- and that
refusal no longer stops AGENTS.md and CLAUDE.md from being written.

The agent is detected from the environment and then from marker files in the
project; --agent overrides it. --agent other prints the config for you to paste
in yourself and writes nothing.

ONE STATED EXCEPTION TO THAT: a JSONC config (Zed's settings.json,
.vscode/mcp.json, opencode.jsonc) is re-encoded, so its comments, its trailing
commas and its key order are not preserved. The run says so when it happens,
rather than refusing the file -- which is what it used to do, and Zed ships
settings.json with comments in it and reads a trailing comma back happily.

NO CREDENTIAL IS EVER WRITTEN INTO A CONFIG FILE. Most of these files are
project-scoped — .mcp.json, .cursor/mcp.json, .vscode/mcp.json and opencode.json
sit in the repo root and get committed — so an Authorization header holding your
actual token is a secret headed for version control. Instead, for agents whose
vendors document environment-variable interpolation, the header REFERENCES
CIVITAI_TOKEN in that vendor's own spelling (${CIVITAI_TOKEN} for Claude Code,
${env:CIVITAI_TOKEN} for Cursor, VS Code and Windsurf, {env:CIVITAI_TOKEN} for
opencode, and bearer_token_env_var for Codex); export CIVITAI_TOKEN so the agent
resolves it — a token stored only by 'civitai login' is NOT visible to your
agent. For agents that document none — Zed today — no header is written at all
and the output names the exact header to add yourself.

THE TWO SERVERS DIFFER ON ANONYMOUS ACCESS. https://mcp.civitai.com/mcp answers
without a credential, so a header-less config browses models, images and
articles as it stands. https://orchestration.civitai.com/mcp returns 401 until
an Authorization header is present, so generation tools need one either way.

AUTHENTICATION IS YOURS TO RUN. The servers are registered before login on
purpose, and 'civitai login' is a separate store from CIVITAI_TOKEN: it writes
this CLI's own config, which your coding agent does not read.

EXIT CODES: --check exits 1 when a check failed, 0 otherwise. A write run exits
0 when every step happened and 1 when one did not -- a config that does not
parse, a destination it will not write (for ANY of the three files), a file it
could not write -- and each of those is a 'blocked' row in the report with 'ok'
false, never a silent success. THE ONE STEP THAT DOES NOT HAPPEN AND STILL EXITS
0 is the 'manual' row: --agent other, or a user-scoped agent with no resolvable
home, where there is no file for this CLI to write and the config is printed for
you to paste instead. A bad --agent, a --dir that does not exist or is not a
directory, and --track api all exit 2. 'authenticated' is REPORTED by --check and
never fails it: an unauthenticated setup is a success, not a failure.

WHAT --dry-run CAN TELL YOU. It writes nothing and reports the rows the PLAN can
classify -- for all three files -- with the same 'ok' and the same exit code the
real run would give for those: a destination it will not write, a config that
does not parse, an AGENTS.md it cannot read or that carries two managed blocks.
It CANNOT report a failure only the act of writing can produce. Measured: a
project directory this process may not write into gives 'blocked' rows and exit 1
on the real run where the dry run reported the intended action and exit 0. A full
disk and a read-only mount are the same shape and were not measured, so treat
that as an open list: a green dry run means the plan is sound, not that the write
will succeed.

--json SHAPES: 'checks' for --check, 'changes' for a write or dry run, and -- for
a failure that happened before either could be built -- an 'error' string with
neither array. Discriminate on which is present. A usage error carries no
payload: a mistake about the INVOCATION (a bad --agent, a --dir that does not
exist or is not a directory, --track api) exits 2 on stderr like every other
command's usage error, because there is no run to describe. Everything else that
fails emits one of the three -- including a --dir this command cannot stat for
some other reason, which exits 1 and gets the 'error' envelope.
```

```bash
  civitai agent-setup                       # detect the agent and set it up
  civitai agent-setup --agent cursor        # override the detection
  civitai agent-setup --dir ./my-app        # a project other than the cwd
  civitai agent-setup --dry-run             # print every path, write nothing
  civitai agent-setup --check --json        # verify a setup (scriptable)
```

| Flag | Description | Default |
|---|---|---|
| `--agent string` | the coding agent to configure (claude, codex, cursor, opencode, other, vscode, windsurf, zed); detected when omitted | — |
| `--check` | verify an existing setup and report each check; writes nothing, exits 1 when a check failed | — |
| `--dir string` | the project directory that receives AGENTS.md | `.` |
| `--dry-run` | print every path that would be written and why; write nothing | — |
| `--json` | emit the result as JSON (scriptable); the exit code is unchanged | — |
| `--track string` | which onboarding track: app (the only one implemented) or api | `app` |

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

🔴 THIS SPENDS REAL BUZZ AND CANNOT BE UNDONE. A submitted generation is charged
the moment the orchestrator accepts it, and nothing local calls that back —
neither --timeout nor Ctrl-C stops the job, and `civitai workflows cancel` stops
the remaining work rather than reversing the charge. Preview the price with
--dry-run first; it calls the server's cost estimator and spends nothing.
What the LEDGER then does with that charge — if the run fails, expires, or you
cancel it — is decided server-side, and this CLI cannot see your Buzz ledger — `civitai buzz` reports a balance, not a history, so settle it against your Buzz transaction history (/user/transactions).

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
can exceed the estimate, and --max-cost cannot claw the difference back — it
never reaches the server. --max-cost compares the
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

🔴 NAMING A CHECKPOINT DOES NOT MOVE THE ECOSYSTEM WITH IT. --checkpoint selects
a model version and nothing else. The settings the server generates with —
engine, steps, cfg scale, sampler — follow the ECOSYSTEM (--ecosystem, or the
server's default when you pass none), not the checkpoint you named, and there is
no --steps or --cfg-scale here to correct them (see RAW GRAPHS below). A
checkpoint paired with an ecosystem it does not belong to is refused by nothing —
not by this CLI, not by the estimator, not by the generator. The job is accepted
and charged, and it can finish having produced no usable output. The
model-version lookup above proves the id EXISTS, not that it fits, and "Resources
ready" does not answer it either. Which ecosystem a given checkpoint belongs to is
server knowledge this CLI does not hold and will not guess: if you name a
checkpoint, name the --ecosystem it belongs to as well.

🔴 --dry-run's "Resources ready" line is NOT A PROMISE OF OUTPUT. It echoes the
server's `ready` flag, which reports only that the resources this job needs are
currently available — nothing about moderation, and nothing about whether the
job will actually produce an image. A run that reports resources ready can still
be charged and return nothing. Treat `ready: false` as "do not submit"; do not
read `ready: true` as a green light.

WAITING AND DOWNLOADING: by default the command waits for the job to finish and
writes every deliverable output into --out-dir as <workflow-id>-<n>.<ext>.
--out-name <template> names them instead: {workflow}, {n} (1-based) and {ext}
(with its leading dot) expand, everything else is literal. The rendered value
must be a plain file name inside --out-dir — a path separator or ".." is REFUSED,
not stripped — and the template is checked before anything is submitted, so a bad
one costs nothing. A template that would give two outputs the same name is
refused before any byte is downloaded rather than overwriting your own results,
so include {n} for a batch. Pass --no-wait to print the workflow id and exit
immediately, and pick the results up later with
`civitai workflows get <workflow-id>`. Output URLs are PRESIGNED AND EXPIRE, so
download promptly; re-read the workflow for fresh links.

🔴 --timeout STOPS WAITING. IT DOES NOT STOP THE JOB. The generation keeps
running server-side after the CLI gives up, and finishes and bills exactly as if
you had stayed. The same is true of Ctrl-C. Both print the workflow id and the
exact command to re-attach; `civitai workflows cancel` is the only thing that
stops the remaining work.

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
reach graph parameters this CLI has no flag for — seed, steps, cfgScale and
sampler among them. None of the four has a flag today, and for steps and cfgScale
that is deliberate: the server ACCEPTS a zero for either, prices the degenerate
job cheaper, and bills it, so a flag whose unset value could reach the request
would buy a broken run at a discount. In a graph file they are yours to set and
yours to get right — a seed set there is what makes a run reproducible — and
nothing in that file is checked, defaulted or completed by this CLI. Get a valid
starting point with --print-input, which assembles the graph, prints it, and
exits without submitting or even pricing anything.

--input is txt2img only in this release. It cannot be combined with the content
flags (--negative-prompt, --quantity, --aspect-ratio, --checkpoint, --lora) or
with a prompt argument; the execution flags all still apply. Keys that belong to
the request ENVELOPE rather than the graph — civitaiTip, creatorTip, buzzType,
tags, externalId — are REFUSED in an input file: they are this CLI's to set, and
a tip in particular is real Buzz that --dry-run structurally cannot see. Keys
this CLI does not model are passed through exactly as written, with a warning
that says so and nothing more: what the server does with such a key, including
what it costs, is the server's answer and not this CLI's to predict. --dry-run
prices the graph with those keys included, so it is where a price effect would
show.

🔴 --input DOES NOT get the model-id safety net. --checkpoint and --lora are
resolved against the public API before submitting, so a bad id fails locally
instead of being billed with a substituted model; a raw graph is not
interpreted, so nothing in it is checked before you pay for it.

🔴 --fail-on-substitution STAYS LIVE with --input, but its COVERAGE is unknown
to this CLI. It refuses on the substitution record the estimate returns, so it
still refuses before any spend — but a raw graph is not interpreted here, so
nothing local knows which model references the file contains or which of them a
record would name. One measured case (a checkpoint under "resources") was
charged and ran a different version with no record at all. Read a silent run as
"nothing was reported", never as "nothing was substituted"; --checkpoint is the
path that resolves model ids before anything is submitted.
```

```bash
  # Preview the price — spends nothing
  civitai generate "a cat wearing sunglasses" --dry-run

  # The same estimate as JSON, for scripts
  civitai generate "a cat wearing sunglasses" --dry-run --json

  # Generate 4 images, refusing if the estimate exceeds 50 Buzz
  civitai generate "a cat wearing sunglasses" --quantity 4 --max-cost 50

  # Image-to-image from a local file — --ecosystem is required
  civitai generate "make it winter" --ecosystem Flux1Kontext --image ./cat.png --dry-run

  # …or from a public URL, with two reference images
  civitai generate "combine these" --ecosystem Seedream \
    --image https://example.com/a.jpg --image ./b.png --yes

  # Your own checkpoint (a VERSION id) plus a LoRA at 0.8 strength. A checkpoint
  # does NOT bring its settings with it — steps, cfg scale and sampler follow the
  # ecosystem — so name the ecosystem that checkpoint belongs to. Which one that
  # is, is yours to know: nothing here checks the pair, and a mismatch is charged.
  civitai generate "a cat" --ecosystem <key> --checkpoint <version-id> \
    --lora <version-id>:0.8 --dry-run

  # Wait, and write the images into ./out
  civitai generate "a cat" --yes --out-dir ./out

  # …naming the files yourself — {n} keeps a batch from colliding
  civitai generate "a cat" --yes --quantity 4 --out-dir ./out --out-name 'cat-{n}{ext}'

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

  # …which is also the only way to set a seed, steps, cfgScale or sampler —
  # there is no flag for any of them.
  jq '.seed = 12345' graph.json | civitai generate --input - --yes
```

| Flag | Description | Default |
|---|---|---|
| `--aspect-ratio string` | aspect ratio bucket, e.g. 1:1 (width/height derive from it) | — |
| `--checkpoint int` | checkpoint model-VERSION id (not a model id) — resolved before submitting | — |
| `--dry-run` | print the cost estimate and exit without submitting (spends nothing) | — |
| `--ecosystem string` | model family to generate with, e.g. Qwen or Flux1Kontext. Sent to the server verbatim and NOT checked locally; required with --image because the server only promotes a job to image-to-image when the ecosystem is stated | — |
| `--external-id string` | re-attach to an earlier submit by reusing its idempotency key (the orchestrator dedupes on it and returns the PRE-EXISTING workflow rather than charging again). Use the key recorded before the lost submit | — |
| `--fail-on-substitution` | refuse to submit if the server REPORTS it substituted a different checkpoint for the one you asked for. Checked against the ESTIMATE, so nothing is spent when it refuses. Off by default: the server substitutes deliberately so that a script pinned to a retired version keeps working. NOT A GUARANTEE: a server that does not report substitutions makes this flag silently inert, so it cannot be relied on as a spend guard against an older deployment. With --input it stays live but its COVERAGE is unknown to this CLI: a raw graph is not interpreted, so a silent run means 'nothing was reported', never 'nothing was substituted' | — |
| `--force` | overwrite existing output files instead of refusing | — |
| `--image stringArray` | reference image for image-to-image: a local file (png or jpeg, uploaded) or an https URL (passed through). Repeatable. Requires --ecosystem, and only some ecosystems accept reference images at all | — |
| `--input string` | read the generation graph from a JSON file ('-' for stdin) and send it as-is, instead of building one from flags. txt2img only. Cannot be combined with the content flags above | — |
| `--json` | emit the raw server payload on stdout (scriptable) | — |
| `--lora stringArray` | LoRA model-version id, optionally :strength (e.g. 250712:0.8). Repeatable | — |
| `--max-cost int` | refuse to submit if the ESTIMATE exceeds this many Buzz. This is an estimate check, NOT a spending cap: the estimate is not binding, the server enforces no ceiling, and the realized charge can be higher — this flag cannot claw that back | — |
| `--negative-prompt string` | negative prompt | — |
| `--no-download` | wait for the result and print the output URLs, but write no files | — |
| `--no-wait` | submit, print the workflow id and exit without waiting; collect the results later with 'civitai workflows get \<id>' | — |
| `--out-dir string` | directory to write the generated files into (created if needed); named \<workflow-id>-\<n>.\<ext> unless --out-name says otherwise | `.` |
| `--out-name string` | template for each output's file name inside --out-dir, e.g. 'img-{n}{ext}'. Placeholders: {workflow} (the workflow id), {n} (1-based output number), {ext} (the extension, WITH its leading dot); everything else is literal. Default '{workflow}-{n}{ext}'. It names a plain file: a path separator or '..' is REFUSED, not stripped, and the template is checked before anything is submitted. A template that would name two outputs the same is refused before anything is downloaded, so include {n} for a batch | — |
| `--print-input` | print the exact generation graph that would be sent and exit without submitting. Redirect it to a file, edit it, and feed it back with --input | — |
| `--quantity int` | number of images to generate (server default when unset; no -n shorthand, it reads as "no") | — |
| `--timeout duration` | how long to WAIT for the generation to finish (e.g. 5m, 0 waits indefinitely). This stops the CLI waiting; it does NOT stop the generation and does NOT stop the charge — the job continues server-side to completion | `30m0s` |
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
authenticated user, then TWO sections.

Credential: one identity ATTRIBUTE — the credential type (OAuth login vs
personal API key). It is not a capability, which is why it no longer sits with
them.

Capabilities: three VERDICTS about what this token may do — whether it can read
your Buzz balance, whether it can spend Buzz, and whether it can submit Apps.
Submit Apps is TRI-STATE — yes / no / unknown — and unknown is the CLI declining
to answer (an OAuth token whose scope mask the server did not report, or a
response with no subject), never a "no". When the scope mask is absent the two
Buzz rows are omitted rather than printed as "no".

The money-path dead end — an OAuth `civitai login` token can submit/withdraw
but cannot spend Buzz — is surfaced here, before dev:live.

Reads the token from config or CIVITAI_TOKEN.
```

```bash
  civitai whoami
  civitai whoami --scopes   # also list every granted scope
  civitai whoami --json     # a stable, curated identity object (scriptable)
```

| Flag | Description | Default |
|---|---|---|
| `--json` | emit a stable, curated identity object (scriptable) | — |
| `--scopes` | also print the full decoded scope list | — |

**`civitai workflows`**

List, inspect and cancel generation workflows

```text
Work with the generation workflows your account has submitted.

A workflow is one submitted generation job. `civitai generate` prints a
workflow id; `list` and `get` are how you find one afterwards — which is what
makes `--no-wait`, a --timeout expiry and a Ctrl-C recoverable rather than a
dead end.

`list` and `get` are reads and SPEND NOTHING. 🔴 `cancel` stops a job, and you
stay billed for what it had already delivered — the server re-prices the rest.
```

```bash
  civitai workflows list
  civitai workflows get 01JABCXYZ
  civitai workflows get 01JABCXYZ --json
  civitai workflows cancel 01JABCXYZ
```

**`civitai workflows cancel <workflow-id>`**

Cancel a running generation workflow (you are billed for what it delivered)

```text
Cancel a generation workflow that is still running.

🔴 CANCELLING IS NOT A CLEAN REFUND — AND IT IS NOT A TOTAL LOSS EITHER. Buzz is
charged UP FRONT, when the orchestrator schedules the run. Cancelling stops the
steps that have not finished; the orchestrator then RE-PRICES the workflow
against the work it actually did, and settles the difference against what it
took. What the run already delivered is billed: a step that had already finished
keeps its full cost, and a job a worker has already started and cannot interrupt
runs to completion and is billed for.

So cancel a job because you no longer want its OUTPUT. How much of the charge
that leaves you paying depends on how far the run had got, which you do not
control and cannot see from here — the settlement is server-side, it happens once
the workflow reaches its final state rather than when this command returns, and
this CLI cannot see your Buzz ledger — `civitai buzz` reports a balance, not a history, so settle it against your Buzz transaction history (/user/transactions).

That is also why `civitai generate --timeout` and Ctrl-C do not cancel anything:
they stop the WAIT, not the job. The run keeps going server-side and its outputs
stay yours — pick them up later with `civitai workflows get <workflow-id>`.

Cancelling an already-finished workflow is harmless — it is a no-op server-side,
and the outputs of a succeeded workflow are not deleted by it (use the website to
delete results).

This needs the same AI Services scopes that `civitai generate` needs:
`civitai login --scopes generate` (a browser login that opts into generation), or a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account).

CONFIRMATION: cancelling is IRREVERSIBLE — it throws away whatever the run had
not produced yet — so an interactive run asks first. Pass `--yes` to skip the
prompt in a script; a non-interactive shell without `--yes` REFUSES rather than
cancelling silently.

UNKNOWN IDS ARE REFUSED, NOT REPORTED AS CANCELLED. The cancel procedure answers
the same empty success for an id the server has never heard of as for a real one,
so this command reads the workflow back first: an id the server does not know
exits 4 and no cancel request is sent. If that read fails for any OTHER reason —
a timeout, a 5xx, a rate limit — the cancel is still sent, because a flaky read
must never be what stops you halting a job that is spending your Buzz.
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

WHERE THE SERVER RECORDED AN ACCOUNT of what happened to a workflow, it is
printed on indented lines under that workflow's row, in the server's own words
and in full. Not every workflow has one; nothing is printed for those.

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
