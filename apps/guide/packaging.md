---
title: What goes in the bundle
description: What civitai app submit packages and what it silently leaves out — the three sizes it reports, the submit-body ceiling, the dotenv allow-list and its traps, the dirty-work-tree guard, and the credential warning that reports a leak without preventing one.
sources:
  - go:github.com/civitai/cli
---

# What goes in the bundle

`civitai app submit` packages your **source** tree — manifest, `src`, build
config — into a ZIP and uploads it. The platform rebuilds from that source; a
prebuilt `dist` is neither wanted nor shipped.

This page is about what actually ends up in the archive, because two of the
surprises are expensive: a file you assumed was excluded that is **uploaded and
read by a reviewer**, and a file you assumed was included that the build
**cannot find**.

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

With **no token configured** (and not `--package-only`) it stops after step 3,
writes the `.zip` and prints the next steps. `--package-only` also stops after
step 3 — note that steps 1 and 2 still run and can still fail the command
before any zip exists.

## How big can a bundle be?

`app submit` reports **three** sizes:

```
Packaged 68 file(s) (8201270 bytes compressed, 8866319 decompressed; 10935065 bytes as the base64 JSON submit body)
```

::: danger The third one is the one a request-body limit applies to
The `.zip` is not what goes on the wire: it is base64-encoded into a JSON
document (`{"bundleBase64":"…"}`) before it is sent, so the server receives
about **4/3** of the compressed size. That number is exact, not an estimate,
and it is printed on every path — including `--package-only`, which is how you
inspect a bundle you cannot submit.
:::

**The ceiling is 10485760 bytes of body, and `app submit` refuses above it.**
The refusal costs no upload — it is checked against the marshalled document
itself, before the request is built. The number is not this CLI's: it is
Next.js's `proxyClientMaxBodySize` default, which applies because civitai's
proxy matches `/api/v1/:path*` and sets no override.

A submit that carries build provenance sends `sourceCommit` and `sourceDirty`
in that same document, so its body is a few dozen bytes larger. The printed
number accounts for it: it is computed from the body *this run* will send, not
from a fixed envelope — and the `--package-only` and no-token paths stamp
nothing, so they run no `git` at all.

::: warning The ceiling is vendored, so `--allow-oversize` is the way out
Nothing in this CLI notices the day civitai raises that default, and on that
day a shipped CLI would refuse bundles the server would now take.

```bash
civitai app submit --allow-oversize     # submit anyway; the ceiling may be stale
```
:::

**The other size caps this CLI enforces *are* its own, not the server's.** They
are generous — 2000 files, 10 MiB per file, 50 MiB compressed, 200 MiB
decompressed — and clearing them is **not** a prediction that the submit will
be accepted.

### What a rejected upload looks like

The CLI's own refusal never reaches the server: it names the body size and the
ceiling and stops, listing the largest entries under
*"What this CLI would have sent"*. The `400` below is what you see only when
you pass `--allow-oversize`, or when the server's real limit turns out to be
lower than the vendored one. The server answers `400: Invalid JSON` — an error
about the *parse*, downstream of the cause, naming nothing size-shaped. The CLI
adds what it knows on top:

```
Error: server returned 400: Invalid JSON

What this CLI sent (it cannot tell whether that is why the submit failed):
  up to 10935065 bytes on the wire — a 8201270-byte zip, base64-encoded into a JSON body.
  largest entries in the bundle (compressed / original):
       2411008 / 2418844     docs/screenshots/flow-01.png
       1904772 / 1911233     docs/screenshots/flow-02.png
       …
```

Entries are ranked by **compressed** size, because that is what the upload is
made of — a large text file that deflates to nothing is not what to delete. The
usual culprit is a directory of screenshots or sample assets.

That block prints under **any error the upload call reports once the request
has gone out**, except a `401`/`403` (a credential problem, unrelated) or a
`429`. A failure that never reached the connection never prints the past tense
— no usable credential, an unwritable config, a connection that never opened —
so `sent` means a request that really went out, not one the CLI only built. A
refusal that stops the submit **before** the upload step prints nothing at all:
no `--yes`, a dirty work tree, the version guard, a validation failure.

## What the packager left out

Under the `Packaged …` line, `app submit` prints one more line naming every
path it skipped — on every path including `--package-only`, and not at all when
it skipped nothing:

```
Skipped 4 path(s): public/environment.env (*.env), .git/, dist/, node_modules/
```

- **The count is of skip *decisions*, not files.** An excluded directory is one
  entry, printed with a trailing `/`: the walk stops there and never learns how
  many files are underneath, so no number for that is printed rather than a
  number that was guessed.
- **A pattern rule is tagged with the pattern that matched** — `(*.env)`,
  `(.env*)`, `(*.zip)`, `(.env or .env.*)` for a dotenv-shaped directory, and
  `(not a regular file)` for a symlink or other non-regular entry. That tag is
  the actionable part: it says which rule reached the file, so it says that
  renaming recovers it. Tagged entries are listed first for that reason.
- **A fixed name carries no tag.** The excluded-directory list is, exactly:
  `.cache`, `.git`, `.hg`, `.mypy_cache`, `.next`, `.pnpm-store`,
  `.pytest_cache`, `.ruff_cache`, `.svn`, `.turbo`, `.venv`, `.vite`, `build`,
  `coverage`, `dist`, `node_modules`, `out`, `venv`. `civitai app submit
  --help` prints it verbatim. Untagged entries also cover those *names as
  regular files* — in a linked worktree or a submodule, `.git` is a file, not a
  directory.
- **Past 12 entries the list is elided** with `… and K more`; the count before
  the colon still counts every one.

::: tip Directory and file rules are separate, so the shape matters
A regular **file** named `build` or `dist` **is** packaged — only the
*directories* are on the fixed list.
:::

## Which dotenv files end up in the bundle

"The CLI excludes dotenv files" is the natural reading, and it is **not** what
the packager does. The rule is a **three-name allow-list with a catch-all**:

> **Every file whose base name starts with `.env` is excluded — except
> `.env.example`, `.env.sample` and `.env.production` sitting at the project
> root, which are included.**

The **at the project root** half is load-bearing. The allow-list exists for the
file the server build reads (`vite build` takes env files from `envDir`, which
defaults to the directory the build runs in) and the template a human reviewer
reads — and a copy in a subdirectory can be neither.
`.env-backup/.env.production` and `old/.env.production` are backups, and a
backup of a dotenv file is the shape most likely to hold a real credential.

| file | in the bundle? | why |
| --- | --- | --- |
| `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.test` — **and every other `.env*` name**, dotted or not: `.env.staging`, `.env-local`, `.envrc` | **excluded** | the catch-all: any `.env*` the allow-list does not name is assumed dev-local and secret-bearing. `.envrc` is the direnv convention and routinely holds exported credentials |
| `.env.example`, `.env.sample` **at the project root** | **included** | meant to be placeholder templates the reviewer reads — but the allow-list is by NAME and **nothing reads the contents** |
| `.env.production` **at the project root** | **included** | the platform build runs `vite build` in production mode, which reads it |
| the same three names **in any subdirectory** — `app/.env.production`, `.env-backup/.env.example`, `backups/.env.sample` | **excluded** | the allow-list is scoped to the root, because both of its reasons are |

### Directories count too, and by a narrower rule

A *directory* named `.env` or beginning with `.env.` — `.env.d/`,
`.env.local/`, `.env.secrets/` — is excluded whole, at any depth, and so is one
whose name ends in `.zip`. The three-name allow-list does **not** apply to
directories: `vite build` reads a dotenv *file*, so a directory called
`.env.production/` is dropped like any other.

The directory rule deliberately stops at the dot, which the file rule does not,
because matching too much here removes a whole subtree from your submission
with nothing to tell you. So `.environment/`, `.envoy/`, `.envrc/`,
`.env-backup/` and `.envs/` **are** packaged as directories — but the **file**
rules still reach inside them, so a `db.env`, a `prod.env` or a
`.env.production` living there is still dropped.

### A file whose name *ends* in `.env` is dropped too

`db.env`, `prod.env`, `local.env`, `config.env`, at any depth and in any
directory. That is the shape tooling writes, and until this rule existed no
rule saw it: every dotenv rule was a *prefix* rule, so a name not starting with
`.env` was invisible to all of them. This one is **files only** — a directory
called `config.env/` still ships, because dropping a whole subtree on a suffix
match is the silent loss the directory rule is aimed away from.

### Case sensitivity is split, deliberately

Matching is **case-insensitive** for every dotenv and `*.zip` rule, on
directories and files alike: `.ENV.LOCAL/`, `.ENV.LOCAL`, `X.ZIP/` and
`Bundle.ZIP` all go. The three kept names are still matched **exactly** —
`.ENV.PRODUCTION` is not the file `vite build` reads, so it is dropped rather
than uploaded.

The **fixed-name directory list** is the exception: it is matched
**case-sensitively**, on purpose, because `Build/` and `Dist/` are plausible
content directory names and dropping one is a silent subtree loss. So
`NODE_MODULES/` and `Dist/` are **packaged**.

### This closes shapes, not the class

::: danger The packager matches names, never contents
A secret in a name that is not dotenv-shaped at all — `secrets.json`,
`credentials.yaml`, a key pasted into `src/config.ts` — is reached by no name
rule and is **still packaged**. `app submit` *warns* about the ones it
recognises (below); that is advisory and never a drop.
:::

### The `*.env` rule costs something

`.env` is also **Babylon.js's environment-texture format** — a 3D block
shipping `public/environment.env` will have it dropped. `sample.env` and
`template.env` go the same way, and the three-name allow-list has no
suffix-shaped counterpart: `.env.sample` is kept, `sample.env` is not. Rename
the file (`environment.envmap`) and it travels. Read the `Skipped` line's tag:
it names the rule, so it also names the fix.

### The root scope costs something too

::: warning If your build reads its dotenv from anywhere but the project root
The `.env.production` it actually reads lives there — and this rule drops it.

Vite's `envDir` defaults to `config.root`, which defaults to `process.cwd()` —
the directory the build is *invoked* in, not "the project root" in the bundle
sense. So this is not only about a `vite.config` that sets `root:` or `envDir:`.
It also reaches a `package.json` `build` script that relocates the root
(`vite build --root app`), or runs the build from another directory at all
(`pnpm --filter web build`, `npm --prefix web run build`, `cd web && vite
build`), and a non-Vite toolchain (Next, Astro, webpack + `dotenv`) whose
`.env.production` resolution is cwd-anchored the same way.

In every one of those cases the manifest's `buildCommand` is still
`npm run build`: the CLI reads the script's **name**, never its body, so it
cannot tell you which of these you are. And a nested `outputDir` such as
`packages/web/dist` is a valid manifest, so building from a subdirectory is a
shape the platform permits rather than an exotic one.
:::

Neither scaffolded template sets `root:` or `envDir:`, and both build from the
project root — so a project `civitai app create` produced and you have not
restructured is unaffected. If yours is different you will see it on the
`Skipped` line of the very next run, tagged `(.env*)`.

A kept name does **not** rescue its directory: `.env.d/.env.production` is
dropped along with `.env.d/`, and so is `node_modules/pkg/.env.production` —
the walk skips an excluded directory before it ever looks at a file name.

::: danger Nothing stops the three kept files carrying a secret to the platform
Whatever you put in `.env.example`, `.env.sample` or `.env.production` is
packaged and uploaded verbatim. **Do not put a token in any of them** — not a
`VITE_`-prefixed one (Vite inlines those into the client bundle, so they are
public the moment your app loads) and not a plain unprefixed one either (Vite
leaves that out of the bundle, but the CLI still ships the file).

Put nothing in the three kept files you would not paste into a public page. If
your project was scaffolded before this was documented, open `.env.example` by
hand — and if a real token was ever there, treat it as disclosed and mint a new
one.
:::

`.env.production` being **shipped** is the one worth knowing about, because it
is the least expected: the server-side build needs it.
`.env.production.local` is *not* kept — `.local` is the dev-local override
convention and falls to the catch-all.

## What looks like a credential

The `Skipped …` line says what did **not** ship. This one is its opposite: what
**did** ship and probably should not have.

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
- ⚠️ **On a real `submit` it reports a leak; it cannot prevent one.** The line
  is printed between the confirmation prompt and the upload, so by the time you
  read it the bundle is on its way. `--package-only` is the path where the
  warning is actionable.
- **It prints `path:line` and the key name, never the value.** This output
  lands in CI logs and terminal scrollback; printing the secret would move it
  into a second durable place. A key that *itself* looks credential-shaped is
  replaced by the bare word, so the printed label never carries secret-shaped
  material.
- **It reads exactly what the packager kept.** A warning can never name a file
  that was dropped — including `.env.local` and anything under `node_modules/`
  — and `.env.production` **is** in scope, because it is allow-listed by name
  and uploaded.
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
What it does **not** see: binary files (a NUL byte in the first 8 KiB); a line
over 1 MiB, e.g. a minified bundle — that *line* is skipped, the rest of the
file is still scanned; a credential passed some way other than an assignment or
one of the nine formats; and, deliberately, **Google API keys** (a Firebase
*web* key has the same shape and Google documents it as public, so warning on
it would fire on every submit of a Firebase-based block — the cost is that a
Google *server* key is not reported either); a headerless PKCS#8 body (that
shape is an X.509 certificate just as often as a private key); and a connection
string against a **reserved host** — `example.com`/`.net`/`.org` and anything
under them, any host whose TLD is `.test`, `.invalid`, `.localhost`, `.example`
or `.local`, and the loopback/unspecified addresses — which is documentation,
not a leak.

That last set is compared as **whole DNS labels**, so a real host that merely
spells one of those words (`fastest.civitai.com`, `db.dev.civitai.com`,
`cache.samplerate.io`) **is** reported. If the scan hits its 8 MiB budget it
stops **and says so** rather than reporting a quiet zero.
:::

**The rate you can measure is the false-positive one.** Over 244 real project
directories and 3,917 packaged files this fires on **one** project. The
*true*-positive rate is unmeasured and cannot be measured from that corpus,
because it holds no real credential: detection is evidenced only against
planted fixtures. It is aimed at accidental inclusion by an honest author.
There is deliberately **no** carve-out for `*.test.*` files, because a
credential in a test file is uploaded and reviewed like any other.

## The dirty-work-tree guard

`app submit` refuses while files that go into the bundle are uncommitted,
because the bundle is packaged from what is on disk and approving one deploys
code that exists in no commit. `--allow-dirty` submits the tree as it is. The
refusal is [exit `1`](../../site/guide/cli-exit-codes#exit-code-1) — a verdict
about the project, not a bad command.

It **degrades rather than enforcing**: a directory that is not in a git repo,
or a machine with no `git` on `PATH`, submits exactly as before, and a clean
tree whose `HEAD` is on no remote **warns** instead of refusing. Like the
version guard it is skipped by `--package-only` and by a run with no token.

**The same skip list decides what it counts.** Paths the packager never ships —
`dist/`, `node_modules/`, a stray `.zip`, a `.env.local`, anything
`.gitignore`d, and any symlink — are **not** counted: they are not in the
bundle.

Two cases worth knowing:

::: danger A repository with no commits yet refuses everything
`block.manifest.json` included. A `git init` you have not committed into puts
nothing in the bundle in a commit, which is what the guard checks. That is the
row between "no repo" and "repo, dirty": make the first commit, or pass
`--allow-dirty`.

Scaffolding never puts you here — `civitai app create` and `app init` run no
`git init`.
:::

- **A `git mv` counts as two changes**, because the bundle gains the
  destination and loses the original. Both are named, even when the destination
  is a path the packager drops (`git mv src/App.tsx dist/App.tsx` is refused,
  naming `src/App.tsx`).

## Where to go next

- [What `civitai app validate` proves](./validate) — the step that runs before
  packaging.
- [Review, approval and deploy](./review-and-deploy) — what happens after the
  upload.
- [Your store listing](./store-listing) — the icon and cover a listing cannot
  publish without.
- [CLI exit codes](../../site/guide/cli-exit-codes) — the full per-code ledger.
