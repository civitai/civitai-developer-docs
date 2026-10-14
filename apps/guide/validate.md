---
title: What `civitai app validate` proves
description: What the local civitai app validate covers of the platform's approve-time checks — the lockfile rule, the BLOCK_READY advisory, and the --json result shape for CI.
sources:
  - go:github.com/civitai/cli
---

# What `civitai app validate` proves

`civitai app validate` is a **best-effort LOCAL mirror** of the platform's
approve-time validator: run before you [submit](./review-and-deploy), it
catches most of what a moderator's build would.

::: danger The server is the source of truth
Passing `validate` is **not a guarantee of approval** — some rules exist only
server-side.
:::

## What it actually checks

Three layers:

1. **The manifest's shape**, against a **vendored JSON Schema** — the same
   schema published as the [manifest reference](../reference/manifest).
2. **The ported semantic rules** the server runs: the sandbox trust-tier
   allowlist, `page` ⇒ `iframe`, the required iframe sub-fields, the
   `renderMode` tier gate, and `targets[].slotId` registry membership.
3. **Structural project checks** — the lockfile rule and the `BLOCK_READY`
   advisory below.

A few checks are necessarily approximate locally: the slot registry is
vendored, and per-app origin-binding and scope checks the CLI cannot see are
not reproduced at all.

## The lockfile rule

The one **build-time** rule `validate` mirrors, because its failure is
otherwise an opaque server-side "build failed": **your committed lockfile must
match the package manager the platform derives from `buildCommand`.** The
platform build installs *strictly* from the lockfile, with no registry
re-resolve fallback:

| `buildCommand` | required lockfile |
| --- | --- |
| `pnpm run build` | `pnpm-lock.yaml` |
| `yarn run build` | `yarn.lock` |
| `npm run …`, `vite build`, `npx vite build`, or omitted | `package-lock.json` |

A mismatch or a missing lockfile is a hard `validate` **error**; an *extra*
unused lockfile is a **warning**. Apps with no `package.json` are static — the
platform never installs for them, and they are never flagged.

### The lockfile also has to *be* one

A `package-lock.json` must parse as JSON and declare a numeric
`"lockfileVersion"` of 1 or more (stricter than `npm ci`, which tolerates a
`0`, string, `null` or missing key — shapes npm never writes); a
`pnpm-lock.yaml` or `yarn.lock` must be non-empty.

An **empty** lockfile fails the platform build like a missing one, so
`touch package-lock.json` is not a fix — run the package manager and commit
what it writes. A lockfile that cannot be read, or is implausibly large, is
never flagged.

## The `BLOCK_READY` advisory

`validate` emits one **advisory** about the host handshake: if your manifest
declares a `page` surface and **nothing your app loads posts `BLOCK_READY`**,
it says so.

Such an app renders fine locally and is replaced by a failure card in the real
host. It is a **warning, never an error** — it infers runtime behaviour from
static text and can be wrong — so it exits `0` unless you pass `--strict`.
`civitai app submit` prints the same warnings and does not block on them.

::: warning Copying `civitai-host.js` in is only half the fix
The emitter has to be *loaded* too — a
`<script src="./civitai-host.js"></script>` in `index.html`, or an
`import './civitai-host.js';` at the top of the entry module `index.html`
loads. An unreferenced copy does not satisfy the check.
:::

### It checks REACHABILITY where it can, and says when it can't

Starting at `index.html` it follows every `<script src>`, inline module and
`import` it can resolve, and asks whether any of *those* files posts the
message — so it can report "you have an emitter, but nothing loads it".

When it cannot resolve the graph — no `index.html` at your project root, a
bundler alias (`import '@/…'`), a missing file, an import chain deeper than it
follows — it falls back to scanning the whole tree for the text, and the
warning says *"it did NOT check that the file is loaded"*. In that mode an
unreferenced emitter silences the warning and leaves the app broken.

What else to know:

- **Only `@civitai/blocks-react` and `@civitai/sdk` count as an ack** — their
  iframe transports ack internally, so a `page-money` app gets no "you have no
  emitter" warning. `@civitai/app-sdk`, `@civitai/theme` and
  `@civitai/components` do not post `BLOCK_READY` and do not silence it.
- **An acking dependency is not an ack that fires.** On `@civitai/blocks-react`
  0.72.0 and older, the transport is built only once something calls it, and
  hooks such as `useBuzzWorkflow` connect only inside the functions they return.
  An app that uses only those hooks never sends `BLOCK_READY`. The host waits
  10 s, shows "This app didn't load in time", retries twice and gives up. When
  your **lockfile** resolves `@civitai/blocks-react` to 0.72.0 or older and
  nothing `index.html` loads calls a hook that connects at render or mount,
  validate warns (an error under `--strict`). Fix: call `useBlockContext()` (or
  `getTransport()`) in your root component, or upgrade to 0.72.2 or later
  (civitai/civitai-app-starters#632), where every hook exported from the
  package root connects at mount. Do not also add `civitai-host.js`: two handshakes race.
  This warning stays quiet when the lockfile is missing or unreadable, when the
  import graph cannot be fully resolved, or when `@civitai/sdk` is also
  declared.
- **It reads source only** — never `node_modules`, build directories (`dist`,
  `build`, `out`, …) or `.md` files, and comments are stripped. A `src` that is
  a **symlink** into a shared package *is* followed.
- **It stays quiet when it cannot see the whole project** — an unreadable file,
  a file over 2 MiB, a very large tree, a directory holding only a manifest, or
  an unresolvable entry graph whose tree contains the literal somewhere.
- **It cannot prove the ack ever fires** — at best, that a file `index.html`
  loads *mentions* the message.
- **False alarm** (your ack comes from a bundled dependency, or a file type it
  doesn't open)? Under `--strict` in CI, drop `--strict` or add the ack, and
  report it with `civitai feedback send --about cli`
  ([Report a platform problem](/site/guide/platform-feedback)).

## The `--json` result shape

```jsonc
{
  "dir": "./my-block",
  "errors":   [ { "field": "iframe.sandbox", "message": "…" } ],
  "ok": false,
  "warnings": [ { "field": "page.buzzBudgetPerGen", "message": "…" } ]
}
```

- **`field` is on every finding, never `null` or empty**, semantic findings
  included (sandbox, justification and money-path rules).
- **It uses dotted paths** — `blockId`, `iframe.sandbox`, `scopes[1]`,
  `targets[0].slotId`, `scopeJustifications.<scope>`. **If your scripts match
  `/`-prefixed fields (`/blockId`), update them.**

Two findings have no single manifest field:

| `field` | meaning |
| --- | --- |
| `(root)` | the manifest **document** — it is missing, unparseable, or the schema reports a violation at the top level (e.g. `missing properties 'blockId', 'version', …`). |
| `(project)` | **repository state outside the manifest** — the committed lockfile, or the source tree the `BLOCK_READY` advisory reads. No manifest edit alone resolves these. |

`ok` is `false` on hard errors, and on warnings under `--strict`; the exit code
matches. The JSON goes to **stdout** and the failure to **stderr**, so
`civitai app validate --json | jq` works on a project that fails *validation*.

### A refused path emits no object at all

::: danger Branch on the exit code before parsing
This object is written only when validation actually produced a result.
:::

A path that does **not exist**, or is not a directory, writes **nothing** to
stdout and exits `2`.

```console
$ civitai app validate ./definitely-not-here --json
Error: ./definitely-not-here: no such directory — pass the path to an App project root, or scaffold one with `civitai app create <name>`
$ echo $?
2
```

A project directory the CLI cannot **stat** (unreadable, or a path component
below it is not a directory), or an internal schema failure, produces no result
either: no object, exit `1`.

::: tip An unreadable `block.manifest.json` is a verdict, not one of those cases
The object is printed in full, with a single `(root)` finding carrying the
`permission denied` message.
:::

| exit | stdout |
| --- | --- |
| `0` | the object, `"ok": true` |
| `1` | the object with `"ok": false` for a validation **verdict** — including an unreadable manifest — but **nothing** when validation produced no result at all (an unreadable project *directory*, or an `ENOTDIR` partway down the path; also an internal schema failure, which a released binary should never hit) |
| `2` | **nothing** — the path does not exist, or is not a directory |

### Reading it from a script

::: danger `jq -e` is the wrong tool for reading `ok`
It exits `1` on a JSON `false` and on a missing key alike, so it cannot tell a
failing result from no result.
:::

Test for an empty string instead, and read `ok` as a value:

```bash
out=$(civitai app validate ./my-block --json); rc=$?
case $rc in
  2) echo "bad path — check the argument"; exit 2 ;;
  0|1)
    if [ -z "$out" ]; then
      echo "no result to parse (rc=$rc)"; exit "$rc"
    fi
    echo "ok=$(jq -r .ok <<<"$out")"          # true | false — the verdict
    jq -r '.errors[]   | "ERROR   \(.field): \(.message)"' <<<"$out"
    jq -r '.warnings[] | "WARNING \(.field): \(.message)"' <<<"$out"
    ;;
esac
```

## Where to go next

- [What goes in the bundle](./packaging) — what `app submit` packages, and what
  it leaves out.
- [Review, approval and deploy](./review-and-deploy) — the lifecycle after a
  successful submit.
- **Exit codes** — `civitai --help` prints the summary table for every code; the full per-code ledger is in the
  [CLI README](https://github.com/civitai/cli#exit-codes).
