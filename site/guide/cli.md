---
title: CLI
description: Browse, search, and download from Civitai in the terminal with the civitai CLI — read commands plus the authenticated download command.
---

# CLI

The **`civitai` CLI** (Go, repo [`civitai/cli`](https://github.com/civitai/cli))
wraps the [public site API](../reference/) so you can search and fetch models,
images, articles, collections, and more straight from the terminal or a script —
and **download** a model version's file(s) with type-aware folder routing and
automatic SHA256 verification.

::: tip Read = anonymous, download = authenticated
The **read/search** commands (`models`, `model-versions`, `images`, `articles`,
`collections`, `tags`, `creators`, `users`) hit **public** endpoints and work
with no login; pass `--anon` to force a token-free request. The **`download`**
command is different: Civitai requires a token for **any** model-file download —
even a small public file — so `civitai download` needs [`civitai login`](#authentication).
:::

## Install

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

To pin the CLI as a flake input (reproducible builds/CI), reference it in your
`flake.nix`:

```nix
{
  inputs.civitai-cli.url = "github:civitai/cli";
  # optionally pin a release tag:
  # inputs.civitai-cli.url = "github:civitai/cli/v0.1.67";

  outputs = { self, nixpkgs, civitai-cli, ... }: {
    # add `civitai-cli.packages.${system}.default` to your devShell / packages
  };
}
```

Prebuilt binaries for linux/macOS/windows × amd64/arm64 are on the
[GitHub Releases](https://github.com/civitai/cli/releases) page. Verify with
`civitai version`.

Logging in is **optional** for the read commands below and **required** for
[`download`](#download) (see [Authentication](#authentication)). Logging in is
also required for the App Blocks authoring commands (`civitai app …`, documented
in the [Apps CLI reference](/apps/reference/cli)).

## Shared flags

Every read subcommand accepts:

| Flag | Description |
|------|-------------|
| `--json` | Print the raw API JSON response (for scripting) instead of the formatted table. |
| `--anon` | Force an anonymous request, ignoring any stored login token. |

Search commands paginate with `--limit` and either `--page` (shallow) or
`--cursor` (deep paging — copy `metadata.nextCursor` from a previous response).
See [Pagination](./pagination).

## Read commands

### Models

```bash
civitai models search --query "pony" --limit 5
civitai models search --type LORA --sort "Most Downloaded" --period Month
civitai models search --base-model Pony --base-model "Illustrious"
civitai models get 827184
```

`models search` flags: `--query`, `--tag`, `--username`, `--type`
(e.g. `Checkpoint`, `LORA`, `TextualInversion`), `--base-model` (**repeatable**),
`--sort` (e.g. `"Highest Rated"`, `"Most Downloaded"`, `Newest`), `--period`
(`AllTime`, `Year`, `Month`, `Week`, `Day`), `--nsfw`, `--limit` (1–100),
`--page`, `--cursor`. See [Models](../reference/models).

::: tip Filtering by architecture / video models
`--base-model` filters by base-model family and is the way to disambiguate
models that share a `--type`. Video checkpoints all report `--type Checkpoint`,
so filter them with e.g. `--base-model "Wan Video 2.2 T2V-A14B"`.
:::

### Model versions

```bash
civitai model-versions get 2514310
civitai model-versions by-hash 5D8D26E2A6
```

Aliases: `model-version`, `mv`. `by-hash` looks a version up by any of its file
hashes (AutoV1, AutoV2, SHA256, CRC32, BLAKE3), matched case-insensitively.
See [Model versions](../reference/model-versions).

### Images

```bash
civitai images search --limit 5
civitai images search --model-version-id 128713 --sort Newest
civitai images search --username some-user --cursor <cursor>
```

`images search` flags: `--limit` (1–200), `--page`, `--cursor`, `--post-id`,
`--model-id`, `--model-version-id`, `--username`, `--period`, `--sort`
(`"Most Reactions"`, `"Most Comments"`, `Newest`), `--nsfw`.
See [Images](../reference/images).

### Tags

```bash
civitai tags search --query anime --limit 10
```

`tags search` flags: `--query`, `--limit`, `--page`.
See [Tags](../reference/tags).

### Creators

```bash
civitai creators search --query artist --limit 10
```

`creators search` flags: `--query`, `--limit`, `--page`.
See [Creators](../reference/creators).

### Users

```bash
civitai users get some-username
```

`users get <username-or-id>` resolves a user through the public user search
(`GET /api/v1/users`) — the public route is a fuzzy search, so a lookup returns
the closest match. See [Users](../reference/users).

### Articles

```bash
civitai articles search --query "comfyui" --limit 5
civitai articles search --sort "Most Reactions" --nsfw
civitai articles get 15342
civitai articles get 15342 --content
```

`articles search` flags: `--query` (matches the title), `--tags` (comma-separated
tag **IDs**, e.g. `5,12`), `--username`, `--sort` (`Newest`,
`"Recently Updated"`, `"Most Reactions"`, `"Most Comments"`, `"Most Bookmarks"`,
`"Most Collected"`), `--nsfw`, `--limit` (1–100), `--cursor`.

`articles get <id>` prints the article's metadata by default. Pass `--content`
to also render the article **body** — the actual guide — as readable
text/markdown (headings, paragraphs, lists, links, code blocks; HTML stripped
and entities decoded). `--json` returns the raw API body and takes precedence
over `--content`. See [Articles](../reference/articles).

### Collections

```bash
civitai collections search --query "anime" --limit 5
civitai collections search --sort Newest --cursor <cursor>
civitai collections get 1201
```

`collections search` flags: `--query` (matches the name), `--sort`
(`Newest`, `"Most Followers"`), `--nsfw`, `--limit` (1–100), `--cursor`
(`Newest` sort only). See [Collections](../reference/collections).

## Download

Download the file(s) of a model **version** from Civitai.

```bash
# by version id
civitai download 128713

# resolve a MODEL's default (first published) version instead
civitai download --model 4384 --out ./dreamshaper.safetensors

# preview the plan (files, sizes, SHA256, target paths, auth) without transferring
civitai download 128713 --dry-run
```

::: warning Downloads require authentication
Civitai requires a token to download **any** model file — even a small public
one (a 336 KB public embedding returns `401` just like a gated checkpoint). Run
[`civitai login`](#authentication) first; your stored token or `CIVITAI_API_KEY`
is sent automatically. `--anon` is meaningful for the read commands but **not**
for downloads (they still `401` without a token).
:::

By default the version's **primary** file is written into the current directory
under its server-provided name. Downloads stream to `<target>.part` and are
renamed into place only on success, so an interrupted run never leaves a
truncated final file.

**Any file type downloads** — model weights, but also non-weights deliverables
like a `Workflows` model's Archive, training data, or other artifacts.

### Selecting files

```bash
civitai download 128713 --file vae --out-dir ./models
civitai download 128713 --all --out-dir ./models
```

Use `--file` to pick a specific file (exact match, else a unique
case-insensitive substring) or `--all` to download every file in the version.

### Folder routing for apps

```bash
civitai download 128713 --all --layout comfyui --root ~/ComfyUI
civitai download 128713 --layout a1111 --root ~/stable-diffusion-webui
```

`--layout <a1111|comfyui>` routes each file into the correct subfolder for that
app, **by file/model type** — so `--all` fans a bundled VAE into the VAE folder
instead of polluting the checkpoint folder, and LoRAs/embeddings land in their
own directories. `--root <dir>` (default `.`) is the base directory for routing.
`--layout` is mutually exclusive with `--out`/`--out-dir`.

### Base-model compatibility check

```bash
civitai download 128713 --layout a1111 --for-base "SDXL 1.0"
```

`--for-base "<baseModel>"` warns on stderr when the version's base model is in a
confidently different family than your target (e.g. an SD 1.5 embedding for an
SDXL model). The version's base model is always shown regardless.

### Integrity

The streamed bytes are **verified against the file's SHA256 by default**. A hash
mismatch deletes the partial file and fails the run. Pass `--no-verify` to skip
(a file with no published SHA256 is downloaded with a warning either way).

### Download flags

| Flag | Description |
|------|-------------|
| `--model <model-id>` | Resolve + download a model's default (first published) version instead of a version id. |
| `--file <name>` | Select a specific file by name (exact match, else a unique case-insensitive substring). |
| `--all` | Download every file in the version. |
| `--out <path>` | Target file path (single-file only; mutually exclusive with `--all`/`--out-dir`). |
| `--out-dir <dir>` | Directory to write server-named file(s) into (created if needed). |
| `--layout <a1111\|comfyui>` | Route each file into its type's subfolder for an app; mutually exclusive with `--out`/`--out-dir`. |
| `--root <dir>` | Base directory for `--layout` routing (default `.`; only applies with `--layout`). |
| `--for-base <baseModel>` | Warn if the version's base model is a confidently different family than this target. |
| `--dry-run` | Print the resolved plan (files, sizes, hashes, targets) and exit without downloading. |
| `--force` | Re-download even if the target file already exists. |
| `--no-verify` | Skip SHA256 verification of the downloaded bytes. |
| `--anon` | Force an anonymous request — but downloads still `401` without a token. |

## Authentication

The read commands don't need it. **`download` and the App Blocks authoring
commands do.** Authenticate once:

```bash
civitai login                    # browser device login (recommended)
civitai login --token <key>      # or a personal API key from civitai.com/user/account
civitai whoami                   # show the current identity and capabilities
```

`civitai login` runs a browser-based device login and stores short-lived OAuth
tokens that refresh automatically; the credential is saved owner-readable to
`~/.config/civitai/config.yaml`. The `CIVITAI_TOKEN` environment variable
overrides the stored credential. Running `civitai login` again switches the
active account (no separate logout).

For the read endpoints the result is identical to `--anon` whether or not you're
logged in.

## Scripting with `--json`

`--json` prints the **raw `/api/v1/...` REST response** — a stable passthrough,
not a shape the CLI invents. The fields are exactly the public Site API's, so
reach for the [REST reference](../reference/) (e.g. [Models](../reference/models),
[Model versions](../reference/model-versions)) for the schema instead of probing
with `jq keys`.

The output is pipe-safe by contract:

- **stdout is pure JSON** — `civitai … --json | jq -e .` always parses.
- **errors go to stderr with a non-zero exit** and **nothing on stdout**, so
  `jq` never sees error prose. `civitai model-versions get 999999999 --json`
  exits `1`, prints `Error: not found (404): Model not found` to stderr, and
  emits an empty stdout.

### Cursor-pagination loop

Use `--cursor`, **not** `--page`, for deep paging (the API caps `page*limit` at
1000 and returns `429` beyond it — see [Pagination](./pagination)). Read
`.metadata.nextCursor` from each response, feed it back via `--cursor`, and stop
when it's absent:

```bash
export CIVITAI_NO_UPDATE_CHECK=1
cursor=""
while :; do
  page=$(civitai models search --type LORA --base-model Illustrious \
           --sort "Most Downloaded" --limit 5 ${cursor:+--cursor "$cursor"} --json) || break
  echo "$page" | jq -r '.items[].id'                 # your work here
  cursor=$(echo "$page" | jq -r '.metadata.nextCursor // empty')
  [ -z "$cursor" ] && break                          # no more pages
done
```

### Clean output for pipelines

The CLI runs a background check for a newer release and prints a nag to
**stderr**. Suppress it in scripts with `CIVITAI_NO_UPDATE_CHECK=1` (env) or
`--no-update-check` (flag). The nag never touches stdout, so `--json` stays pure
regardless — silencing it just keeps your stderr/logs clean.

### Gotchas

- **SHA256 is UPPER-case** in the API/`--json` (e.g. `42BA94DF…`), whereas
  `sha256sum` emits lowercase — case-fold before comparing if you verify
  downloads yourself. (`civitai download`'s built-in verify is already
  case-insensitive.)
- **`models search` already embeds `.modelVersions[]`** — each item carries its
  versions with `files[].hashes.SHA256` and `trainedWords`, so a per-version
  `model-versions get` is usually redundant when you started from a search.
- **Creator and model-level download counts are only in the search response.**
  `model-versions get <id>` returns a version whose `.model` is just
  `{name, type, nsfw, poi}` — no `creator`, no model `stats`. If you started from
  a version id, fetch those from `models search`/`models get` and join on the
  model id (`.modelId` on the version).

### Worked example — top LoRAs for a base model, then plan a download

Search → pick each version with `jq` → hand the id to `download` with app folder
routing. `--dry-run` prints the plan (files, sizes, hashes, targets) without
transferring, so this is safe to copy-paste:

```bash
export CIVITAI_NO_UPDATE_CHECK=1
civitai models search --type LORA --base-model Illustrious \
    --sort "Most Downloaded" --limit 3 --json |
  jq -r '.items[].modelVersions[0].id' |
  while read -r vid; do
    civitai download "$vid" --layout comfyui --root ~/ComfyUI --dry-run
  done
```

Drop `--dry-run` (and run [`civitai login`](#authentication) first) to actually
fetch the files; `--layout comfyui` routes each into its ComfyUI type folder.
