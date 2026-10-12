---
title: What goes in the bundle
description: What civitai app submit packages and leaves out — its three reported sizes, the submit-body ceiling, the dotenv rules, the dirty-work-tree guard and the credential warning.
sources:
  - go:github.com/civitai/cli
---

# What goes in the bundle

`civitai app submit` packages your **source** tree — manifest, `src`, build
config — into a ZIP and uploads it. The platform rebuilds from that source; a
prebuilt `dist` is neither wanted nor shipped.

The two expensive surprises are a file you assumed was excluded that is
**uploaded and read by a reviewer**, and a file you assumed was included that
the build **cannot find**.

::: tip `--package-only` writes the exact `.zip` that would be uploaded
It sends nothing. Unzip it and look — that is the only way to be certain, and
it is the path where every warning below is still actionable.
:::

## What `submit` does, in order

1. **Classifies the project path.** A path that does not exist or is not a
   directory is a usage error (exit `2`).
2. **Validates the manifest** — unless you pass `--skip-validate`. See
   [What `app validate` proves](./validate).
3. **Packages** the canonical source ZIP, printing what it packaged, what it
   skipped, and anything that looks like a credential.
4. **Uploads** it with your stored token, if there is one.

With **no token configured**, or with `--package-only`, it stops after step 3
and writes the `.zip` (printing next steps when there is no token). Steps 1 and
2 still run and can fail the command before any zip exists.

## How big can a bundle be?

`app submit` reports **three** sizes:

```
Packaged 68 file(s) (8201270 bytes compressed, 8866319 decompressed; 10935065 bytes as the base64 JSON submit body)
```

::: danger The third one is the one a request-body limit applies to
The `.zip` is base64-encoded into a JSON document (`{"bundleBase64":"…"}`)
before it is sent, so the server receives about **4/3** of the compressed size.
The printed number is exact, and it is printed on every path, including
`--package-only`.
:::

**The ceiling is 10485760 bytes of body — the server's request-body limit — and
`app submit` refuses above it**, before building the request, so the refusal
costs no upload. A submit that carries build provenance (`sourceCommit`,
`sourceDirty`) has a few dozen bytes more body; the printed number is computed
from the body *this run* will send. The `--package-only` and no-token paths
stamp nothing, so they run no `git` at all.

::: warning The ceiling is vendored, so `--allow-oversize` is the way out
If civitai raises its limit, a shipped CLI keeps refusing bundles the server
would now take.

```bash
civitai app submit --allow-oversize     # submit anyway; the ceiling may be stale
```
:::

**The other size caps are the CLI's own** — 2000 files, 10 MiB per file,
50 MiB compressed, 200 MiB decompressed. Clearing them is **not** a prediction
that the submit will be accepted.

### What a rejected upload looks like

The CLI's own refusal never reaches the server: it names the body size and the
ceiling, lists the largest entries under *"What this CLI would have sent"*, and
stops. You see the server's `400: Invalid JSON` — a parse error that names
nothing size-shaped — only with `--allow-oversize`, or if the server's real
limit is lower than the vendored one. The CLI adds what it knows:

```
Error: server returned 400: Invalid JSON

What this CLI sent (it cannot tell whether that is why the submit failed):
  up to 10935065 bytes on the wire — a 8201270-byte zip, base64-encoded into a JSON body.
  largest entries in the bundle (compressed / original):
       2411008 / 2418844     docs/screenshots/flow-01.png
       1904772 / 1911233     docs/screenshots/flow-02.png
       …
```

Entries are ranked by **compressed** size, since that is what the upload is
made of. The usual culprit is a directory of screenshots or sample assets.

The block prints for any upload error once the request has actually gone out,
except `401`/`403` (credentials) and `429`. It never prints for a failure
before the connection opened (no usable credential, an unwritable config), nor
for a refusal before the upload step (no `--yes`, a dirty work tree, the
version guard, a validation failure).

## What the packager left out

Under the `Packaged …` line, `app submit` names every path it skipped — on
every path including `--package-only`, and not at all when it skipped nothing:

```
Skipped 4 path(s): public/environment.env (*.env), .git/, dist/, node_modules/
```

- **The count is of skip *decisions*, not files.** An excluded directory is one
  entry with a trailing `/`; the walk never enters it, so no file count is
  given.
- **A pattern rule is tagged with the pattern that matched** — `(*.env)`,
  `(.env*)`, `(*.zip)`, `(.env or .env.*)` for a dotenv-shaped directory, and
  `(not a regular file)` for a symlink or other non-regular entry. The tag
  tells you renaming recovers the file; tagged entries are listed first.
- **A fixed name carries no tag.** The excluded-directory list is, exactly:
  `.cache`, `.git`, `.hg`, `.mypy_cache`, `.next`, `.pnpm-store`,
  `.pytest_cache`, `.ruff_cache`, `.svn`, `.turbo`, `.venv`, `.vite`, `build`,
  `coverage`, `dist`, `node_modules`, `out`, `venv`. `civitai app submit
  --help` prints it verbatim. Untagged entries also cover those *names as
  regular files* — in a linked worktree or a submodule, `.git` is a file.
- **Past 12 entries the list is elided** with `… and K more`; the count before
  the colon still counts every one.

::: tip Directory and file rules are separate
A regular **file** named `build` or `dist` **is** packaged — only the
*directories* are on the fixed list.
:::

## Which dotenv files end up in the bundle

The rule is a **three-name allow-list with a catch-all**:

> **Every file whose base name starts with `.env` is excluded — except
> `.env.example`, `.env.sample` and `.env.production` sitting at the project
> root, which are included.**

The allow-list covers the file the server build reads (`vite build` takes env
files from `envDir`, which defaults to the directory the build runs in) and the
template a reviewer reads; a copy in a subdirectory is neither, and is more
likely a backup holding a real credential.

| file | in the bundle? | why |
| --- | --- | --- |
| `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.test` — **and every other `.env*` name**, dotted or not: `.env.staging`, `.env-local`, `.envrc` | **excluded** | the catch-all: any `.env*` the allow-list does not name is assumed dev-local and secret-bearing. `.envrc` is the direnv convention and routinely holds exported credentials |
| `.env.example`, `.env.sample` **at the project root** | **included** | meant to be placeholder templates the reviewer reads — but the allow-list is by NAME and **nothing reads the contents** |
| `.env.production` **at the project root** | **included** | the platform build runs `vite build` in production mode, which reads it |
| the same three names **in any subdirectory** — `app/.env.production`, `.env-backup/.env.example`, `backups/.env.sample` | **excluded** | the allow-list is scoped to the root, because both of its reasons are |

The edges:

- **Directories.** A directory named `.env` or starting with `.env.` (`.env.d/`,
  `.env.local/`, `.env.production/`), or ending in `.zip`, is excluded whole at
  any depth — the allow-list does not apply to directories. The directory rule
  stops at the dot, so `.environment/`, `.envoy/`, `.envrc/`, `.env-backup/`
  and `.envs/` **are** packaged, but the file rules still reach inside them.
- **A kept name does not rescue its directory.** `.env.d/.env.production` and
  `node_modules/pkg/.env.production` are dropped with their directory.
- **Files ending in `.env`** — `db.env`, `prod.env`, `local.env`,
  `config.env` — are dropped at any depth. This is files only: a directory
  called `config.env/` still ships.
- **Case.** Every dotenv and `*.zip` rule is case-insensitive (`.ENV.LOCAL/`,
  `.ENV.LOCAL`, `X.ZIP/`, `Bundle.ZIP` all go), but the three kept names match
  **exactly**, so `.ENV.PRODUCTION` is dropped. The fixed-name directory list is
  case-**sensitive**, so `NODE_MODULES/` and `Dist/` are packaged.
- **`.env.production.local` is not kept** — `.local` falls to the catch-all.
- **The `*.env` rule has a cost.** `.env` is also **Babylon.js's
  environment-texture format**, so a 3D block's `public/environment.env` is
  dropped; so are `sample.env` and `template.env` (only the dotted
  `.env.sample` is kept). Rename the file (`environment.envmap`) — the
  `Skipped` line's tag names the rule, and so the fix.

::: danger The packager matches names, never contents
A secret in a name that is not dotenv-shaped — `secrets.json`,
`credentials.yaml`, a key pasted into `src/config.ts` — is **still packaged**.
`app submit` *warns* about the ones it recognises (below); that is advisory and
never a drop.
:::

::: warning If your build reads its dotenv from anywhere but the project root
The `.env.production` it actually reads lives there — and this rule drops it.

Vite's `envDir` defaults to `config.root`, which defaults to `process.cwd()` —
the directory the build is *invoked* in. So this covers a `vite.config` that
sets `root:` or `envDir:`, a `build` script that relocates the root
(`vite build --root app`) or runs from another directory (`pnpm --filter web
build`, `npm --prefix web run build`, `cd web && vite build`), and a non-Vite
toolchain (Next, Astro, webpack + `dotenv`) whose `.env.production` resolution
is cwd-anchored the same way.

The manifest's `buildCommand` is still `npm run build` in all of these — the
CLI reads the script's **name**, never its body, so it cannot detect them. A
nested `outputDir` such as `packages/web/dist` is a valid manifest.
:::

Neither scaffolded template sets `root:` or `envDir:`, and both build from the
project root, so an unrestructured `civitai app create` project is unaffected.
If yours differs, it shows on the next run's `Skipped` line, tagged `(.env*)`.

::: danger Nothing stops the three kept files carrying a secret to the platform
Whatever you put in `.env.example`, `.env.sample` or `.env.production` is
packaged and uploaded verbatim. **Do not put a token in any of them** — not a
`VITE_`-prefixed one (Vite inlines those into the client bundle, so they are
public the moment your app loads) and not a plain unprefixed one either (Vite
leaves that out of the bundle, but the CLI still ships the file).

If your project was scaffolded before this was documented, open `.env.example`
by hand — and if a real token was ever there, treat it as disclosed and mint a
new one.
:::

## What looks like a credential

The `Skipped …` line says what did **not** ship. This one says what **did**
ship and probably should not have.

```
Packaged 5 file(s) (858 bytes compressed, 110 decompressed; 1163 bytes as the base64 JSON submit body)
⚠ 3 packaged file(s) look like they hold credentials:
    config.toml:2           token
    secrets.json:2          API_SECRET
    src/credentials.yaml:1  password
  These are uploaded to the platform and read by a reviewer, and cannot be
  recalled. On a real submit this prints as the bundle goes up: it reports,
  it does not stop the upload — `civitai app submit --package-only` is the
  path that lets you look first. The matched values are not printed here.
```

- **It warns. It never drops a file, never refuses, and never changes the exit
  code** — a `--yes`/CI submit that warned still exits `0`.
- ⚠️ **On a real `submit` it reports a leak; it cannot prevent one.** It prints
  between the confirmation prompt and the upload. `--package-only` is the path
  where the warning is actionable.
- **It prints `path:line` and the key name, never the value.** A key that
  *itself* looks credential-shaped is replaced by the bare word.
- **It reads exactly what the packager kept** — never a dropped file such as
  `.env.local` or anything under `node_modules/`, but `.env.production` **is**
  in scope, because it is uploaded.
- **What it matches:** an assignment whose key contains a credential word —
  `SECRET`, `TOKEN`, `PASSWORD`, `PASSWD`, `API_KEY`, `PRIVATE_KEY`,
  `ACCESS_KEY`, `CREDENTIAL(S)`, with or without the separator (`APIKEY`
  matches too) — and whose value survives a placeholder-and-entropy gate, so
  `process.env.VITE_API_KEY`, `"your-api-key-here"`, `"${TOKEN}"` and
  `PASSWORD_MIN = 8` are silent. Plus **nine self-identifying formats**: PEM
  private key, JWT, AWS access key id, GitHub token, Slack token, OpenAI key,
  Stripe key, npm token, and a URL carrying a password such as
  `postgres://admin:…@host`.

::: danger A silent run is not a clean bill of health
It does **not** see:

- binary files (a NUL byte in the first 8 KiB);
- a line over 1 MiB, e.g. a minified bundle (that *line* is skipped; the rest
  of the file is scanned);
- a credential passed other than as an assignment or one of the nine formats;
- **Google API keys**, deliberately — a Firebase *web* key has the same shape
  and is public by design, so a Google *server* key is not reported either;
- a headerless PKCS#8 body (as often a certificate as a private key);
- a connection string against a **reserved host** — `example.com`/`.net`/`.org`
  and anything under them, a `.test`, `.invalid`, `.localhost`, `.example` or
  `.local` TLD, and loopback/unspecified addresses. These are matched as
  **whole DNS labels**, so `fastest.civitai.com`, `db.dev.civitai.com` or
  `cache.samplerate.io` **is** reported.

If the scan hits its 8 MiB budget it stops **and says so**.
:::

False positives are rare. There is deliberately **no** carve-out for
`*.test.*` files: a credential in a test file is uploaded like any other.

## The dirty-work-tree guard

`app submit` refuses while files that go into the bundle are uncommitted,
because approving that bundle would deploy code that exists in no commit.
`--allow-dirty` submits the tree as it is. The refusal is
[exit `1`](https://github.com/civitai/cli#exit-code-1) — a verdict about the
project, not a bad command.

It **degrades rather than enforcing**: outside a git repo, or with no `git` on
`PATH`, it does nothing, and a clean tree whose `HEAD` is on no remote **warns**
instead of refusing. Like the version guard, it is skipped by `--package-only`
and by a run with no token.

It counts only paths the packager ships — not `dist/`, `node_modules/`, a stray
`.zip`, a `.env.local`, anything `.gitignore`d, or any symlink.

::: danger A repository with no commits yet refuses everything
`block.manifest.json` included: nothing in the bundle is in a commit. Make the
first commit, or pass `--allow-dirty`. Scaffolding never puts you here —
`civitai app create` and `app init` run no `git init`.
:::

- **A `git mv` counts as two changes** — the destination and the original are
  both named, even when the destination is a path the packager drops
  (`git mv src/App.tsx dist/App.tsx` is refused, naming `src/App.tsx`).

## Where to go next

- [What `civitai app validate` proves](./validate) — the step that runs before
  packaging.
- [Review, approval and deploy](./review-and-deploy) — what happens after the
  upload.
- [Your store listing](./store-listing) — the icon and cover a listing cannot
  publish without.
- **Exit codes** — `civitai --help` prints the summary table for every code; the full per-code ledger is in the
  [CLI README](https://github.com/civitai/cli#exit-codes).
