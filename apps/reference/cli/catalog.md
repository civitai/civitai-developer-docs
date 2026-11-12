---
title: "Catalog and download commands"
description: "Browse and search the public catalog, and download model files. Part of the CLI reference."
outline: [2, 4]
---

<!-- GENERATED PAGE — do not edit by hand. Written by `npm run gen:appblocks:md` (scripts/appblocks-md.mjs); which entry lives on which page is decided in .vitepress/theme/components/referenceSplit.shared.mjs. -->

# Catalog and download commands

Browse and search the public catalog, and download model files.

This page documents 22 of the 65 commands in the [CLI reference](../cli), which indexes every command by name. Generated from the `civitai` binary's own help output.

Other pages: [civitai app — authoring commands](./app) · [civitai app listing — store listing commands](./app-listing) · [Generation commands](./generation) · [Account, setup and utility commands](./account-and-setup)

<CliReference group="catalog">
<!-- BEGIN GENERATED: cli/catalog — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

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
the bytes are not: it is re-indented on the way out, and a raw control byte the
API emits inside a string is rewritten as its escape. Do not diff or hash it
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
the bytes are not: it is re-indented on the way out, and a raw control byte the
API emits inside a string is rewritten as its escape. Do not diff or hash it
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
the bytes are not: it is re-indented on the way out, and a raw control byte the
API emits inside a string is rewritten as its escape. Do not diff or hash it
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
and whether auth is required) without transferring anything. It creates no
file at all — not even a ".part".

When a positional model id is resolved to a version, the note reads:

  note: <id> is a model id — downloading its default version <v>

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
--out/--out-dir; --root only applies with --layout. The routed folder map:

  Civitai type                     A1111 / Forge           ComfyUI
  ------------------------------   ---------------------   ---------------------
  Checkpoint                       models/Stable-diffusion models/checkpoints
  VAE (standalone OR bundled)      models/VAE              models/vae
  LORA / LoCon / DoRA              models/Lora             models/loras
  TextualInversion (embedding)     embeddings              models/embeddings
  Hypernetwork                     models/hypernetworks    models/hypernetworks
  Controlnet                       models/ControlNet       models/controlnet
  Upscaler                         models/ESRGAN           models/upscale_models

Sources: the AUTOMATIC1111 wiki plus the sd-webui-controlnet models/ControlNet
default, and the ComfyUI models docs (docs.comfy.org). An UNMAPPED type (Poses,
Wildcards, Archive, …) is written to --root with a stderr note rather than
silently misplaced.

Mis-file warning, WITHOUT --layout: when --all would place files of differing
types into one directory, the CLI prints a one-line stderr warning naming the
off-type file(s) and suggesting --layout. It is a warning, not an error, and a
single-type download stays quiet.

Compatibility: --for-base "<baseModel>" warns on stderr when the version's base
model is in a confidently different family than your target (e.g. an SD 1.5
embedding for an SDXL model). The version's base model is always shown. The
check is deliberately conservative: it groups the common bases into
architecture families — SD1.x, SD2.x, the SDXL family (SDXL/Pony/Illustrious/
NoobAI, treated loosely as one), SD3, Flux, video — and warns ONLY on an
architecture-level mismatch. It never warns on near-neighbours (Pony vs
Illustrious) or on a base it cannot classify.

ControlNet preprocessor: when the parent model is a ControlNet, the CLI prints
a one-line stderr note. A ControlNet model needs a matching preprocessor or
annotator (e.g. the ComfyUI comfyui_controlnet_aux custom node — OpenPose,
Canny, Depth) to derive the control image from your input, and that
preprocessor is a SEPARATE install, not hosted on Civitai. Informational only;
it never blocks the download.

Transport: the Civitai download URL 302-redirects to signed storage and the CLI
follows it. Large files (10+ GB) are never buffered in memory, and TTY-aware
progress is printed to STDERR.

Transient-failure retry applies to the READ endpoints (search / model / version
/ images / tags / creators / users / articles / collections), which retry a
transient 502/503/504 or network error a few times with exponential backoff and
jitter, noting each retry on stderr. A 429 is retried ONLY when it carries a
Retry-After header; a 429 without one is terminal, because Civitai's
deterministic deep-paging limit arrives that way. The download STREAM is not
retried mid-transfer.

Server-supplied text is sanitised on every message here — a file name is the
UPLOADER's string, so invisible and terminal-controlling characters are removed
first, and newlines and tabs become spaces. Each of these is a single-line
surface, so a newline in a file name would otherwise let an uploader write a
whole line of their own — a forged "Saved … (SHA256 verified)" above a transfer
that never finished, say. On the PROGRESS LINE the name is additionally cut at
120 characters and marked with a "…", because removing newlines does not stop a
name long enough to WRAP: the terminal, not the CLI, puts the overflow at
column zero, and a wrap has no character in it to remove. That shortening is
the progress line only — the "Saved …" line, the "SHA256 mismatch" line and the
download plan all print the name in full. Two deliberate exceptions, which do
NOT share a reason: (1) the "server returned an unusable filename" refusal
renders through %q, which ESCAPES a newline to a visible \n, so collapsing it
would hide what the server actually sent; (2) multi-line server text outside
this path — a prompt, a generation failure reason — is printed RAW and
INDENTED, not escaped, because its newlines are real and the indentation is
what keeps a continuation line off column zero.

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
the bytes are not: it is re-indented on the way out, and a raw control byte the
API emits inside a string is rewritten as its escape. Do not diff or hash it
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
the bytes are not: it is re-indented on the way out, and a raw control byte the
API emits inside a string is rewritten as its escape. Do not diff or hash it
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
the bytes are not: it is re-indented on the way out, and a raw control byte the
API emits inside a string is rewritten as its escape. Do not diff or hash it
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
the bytes are not: it is re-indented on the way out, and a raw control byte the
API emits inside a string is rewritten as its escape. Do not diff or hash it
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
the bytes are not: it is re-indented on the way out, and a raw control byte the
API emits inside a string is rewritten as its escape. Do not diff or hash it
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

<!-- END GENERATED: cli/catalog -->
</CliReference>
