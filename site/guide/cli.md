---
title: CLI
description: Browse and search the Civitai public API from the terminal with the civitai CLI read commands.
---

# CLI

The **`civitai` CLI** (Go, repo [`civitai/cli`](https://github.com/civitai/cli))
ships read subcommands that wrap the [public site API](../reference/) endpoints
documented in this section. They let you search and fetch models, images,
articles, collections, and more straight from the terminal or a script.

::: tip Works anonymously
Every read command hits a **public** endpoint, so it works with no login. If you
*are* logged in the CLI sends your stored token transparently, but for these
public read routes it doesn't change the result — pass `--anon` to force a
token-free request.
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
```

Prebuilt binaries for linux/macOS/windows × amd64/arm64 are on the
[GitHub Releases](https://github.com/civitai/cli/releases) page. Verify with
`civitai version`.

Logging in is **optional** for the read commands below (see
[`civitai login`](#authentication-optional)); it's only required for the App
Blocks authoring commands (`civitai app …`, documented in the
[Apps CLI reference](/apps/reference/cli)).

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
civitai models get 827184
```

`models search` flags: `--query`, `--tag`, `--username`, `--type`
(e.g. `Checkpoint`, `LORA`, `TextualInversion`), `--sort`
(e.g. `"Highest Rated"`, `"Most Downloaded"`, `Newest`), `--period`
(`AllTime`, `Year`, `Month`, `Week`, `Day`), `--nsfw`, `--limit` (1–100),
`--page`, `--cursor`. See [Models](../reference/models).

### Model versions

```bash
civitai model-versions get 2514310
civitai model-versions by-hash 5D8D26E2A6
```

Aliases: `model-version`, `mv`. `by-hash` looks a version up by any of its file
hashes. See [Model versions](../reference/model-versions).

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

`tags search` flags: `--query`, `--limit` (≤ 200), `--page`.
See [Tags](../reference/tags).

### Creators

```bash
civitai creators search --query artist --limit 10
```

`creators search` flags: `--query`, `--limit` (≤ 200), `--page`.
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
```

`articles search` flags: `--query` (matches the title), `--tags` (comma-separated
tag **IDs**, e.g. `5,12`), `--username`, `--sort` (`Newest`,
`"Recently Updated"`, `"Most Reactions"`, `"Most Comments"`, `"Most Bookmarks"`,
`"Most Collected"`), `--nsfw`, `--limit` (1–100), `--cursor`.
See [Articles](../reference/articles).

### Collections

```bash
civitai collections search --query "anime" --limit 5
civitai collections search --sort Newest --cursor <cursor>
civitai collections get 1201
```

`collections search` flags: `--query` (matches the name), `--sort`
(`Newest`, `"Most Followers"`), `--nsfw`, `--limit` (1–100), `--cursor`
(`Newest` sort only). See [Collections](../reference/collections).

## Authentication (optional)

The read commands don't need it, but you can log in to associate requests with
your account:

```bash
civitai login                    # browser device login
civitai login --token <key>      # or a personal API key from civitai.com/user/account
civitai whoami                   # show the current identity
```

Even when logged in, the public read endpoints return the same data as `--anon`.
