---
title: What `civitai app validate` proves
description: The local validator is a best-effort mirror of the platform's approve-time checks — what it really covers, the lockfile rule, the BLOCK_READY advisory and its two tiers, and the exact --json result shape a CI job must branch on.
sources:
  - go:github.com/civitai/cli
---

# What `civitai app validate` proves

`civitai app validate` is a **best-effort LOCAL mirror** of the platform's
approve-time validator. Running it before you
[submit](./review-and-deploy) catches most of what a moderator's build would
catch, in a second, on your machine.

::: danger The server is the source of truth
Passing `validate` locally is a strong pre-check, **not a guarantee of
approval**. Some rules exist only server-side, and a local answer is always a
copy of a moving target.
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

This is the one **build-time** rule `validate` mirrors, because the failure it
prevents is otherwise an opaque server-side "build failed".

**Your committed lockfile must match the package manager the platform derives
from `buildCommand`.** The platform build installs *strictly* from the lockfile
— there is no registry re-resolve fallback — so:

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
`"lockfileVersion"` of 1 or more; a `pnpm-lock.yaml` or `yarn.lock` must be
non-empty.

That version rule is deliberately **stricter than `npm ci` measures** — npm
states it as a precondition but will happily install from an otherwise-intact
lockfile whose version key is `0`, a string, `null` or absent. `validate` keeps
it because npm never *writes* those shapes, so a file carrying one was made by
hand.

An **empty** lockfile fails the platform build exactly like a missing one, so
`touch package-lock.json` is not a fix — run the package manager and commit
what it writes.

If the lockfile cannot be read, or is implausibly large, `validate` says
nothing rather than guessing: it never blocks a submit on a file it could not
inspect.

## The `BLOCK_READY` advisory

`validate` emits one **advisory** about the host handshake: if your manifest
declares a `page` surface and **nothing your app loads posts `BLOCK_READY`**,
it says so.

That is the shape of an app scaffolded before the templates were fixed — it
renders perfectly everywhere you can look locally and is replaced by a failure
card in the real host. It is a **warning, never an error**: unlike the lockfile
rule (where the platform build provably dies), this one infers *runtime*
behaviour from *static text* and can be wrong, so it must not fail a correct
project.

::: warning Copying `civitai-host.js` in is only half the fix
A browser never fetches a file nothing references, so the emitter has to be
*loaded* too — a `<script src="./civitai-host.js"></script>` in `index.html`,
or an `import './civitai-host.js';` at the top of the entry module `index.html`
loads.

Earlier releases of this check looked only for the *text* `BLOCK_READY`
anywhere in your tree, so an unreferenced copy silenced it and a still-broken
app validated clean. It now resolves what your `index.html` actually loads.
:::

Four things follow.

### It checks REACHABILITY where it can, and says when it can't

Starting at `index.html` it follows every `<script src>`, inline module and
`import` it can resolve, and asks whether any of *those* files posts the
message. When that resolution is complete you get a precise finding —
including "you have an emitter, but nothing loads it".

When it **isn't** — no `index.html` at your project root, a bundler alias
(`import '@/…'`), a reference to a file that isn't there, an import chain
deeper than it follows — it falls back to scanning your whole tree for the
text, and the warning **says so in as many words**: *"it did NOT check that the
file is loaded"*.

Read that sentence as it is written. In that mode, adding the emitter without
referencing it will silence the warning and leave the app broken.

### A dependency that acks ends the check

Today that is **`@civitai/blocks-react`, and nothing else**. Its iframe
transport acks internally and the literal never appears in your `src/`, so a
`page-money` app is never flagged.

This is an *exact* list, not the `@civitai/` scope: `@civitai/app-sdk` is the
server-side SDK and no runtime code in it posts `BLOCK_READY`, and
`@civitai/theme` / `@civitai/components` are CSS. Depending on those does not
give you the handshake, so it does not silence the check either.

### It reads source only

Never `node_modules`, never the conventional build directories (`dist`,
`build`, `out`, …), and never a `.md` file — a README *describing* the
handshake is not an implementation of it. Comments are stripped too, so a
comment naming `BLOCK_READY` does not satisfy it. A `src` that is a **symlink**
into a shared package *is* followed.

### It stays quiet when it cannot see the whole project

An unreadable file, a file over 2 MiB, a very large tree, or a directory
holding only a manifest all mean "we could not look" — reported as nothing,
never as a finding. Likewise a project whose entry graph can't be resolved
*and* which contains the literal somewhere: quiet, deliberately, because
warning at a correct project is the more expensive mistake.

### If it fires on a project you know is correct

Your ack arrives from a bundled dependency, or from a file type this scan
doesn't open — it is a false alarm, and it never blocks (exit `0`) unless you
pass `--strict`.

What it proves stays narrow even at its strongest: that a file your
`index.html` really loads *mentions* the message. **It cannot prove the ack
ever fires**; only the real host can.

`civitai app submit` prints the same warnings before it uploads, and likewise
does not block on them.

::: warning If you already run `civitai app validate --strict` in CI
This advisory can turn a previously-green project red — which is what
`--strict` asks for. If it is a false alarm for your project, drop `--strict`
or add the ack, and please open an issue: a warning at a correct project is a
bug in the check, not something you should have to work around.
:::

## The `--json` result shape

```jsonc
{
  "dir": "./my-block",
  "errors":   [ { "field": "iframe.sandbox", "message": "…" } ],
  "ok": false,
  "warnings": [ { "field": "page.buzzBudgetPerGen", "message": "…" } ]
}
```

Two guarantees, both of which an earlier release broke:

- **`field` is present on every finding, and is never `null` or empty.** It
  used to be recovered by parsing the message text, which worked only for the
  JSON Schema errors — so every *semantic* finding (the sandbox rules, the
  justification rules, the money-path warnings: the ones a local pre-check
  exists for) arrived as `"field": null`, and grouping by field in CI silently
  dropped them. Findings now carry their field from where they are produced.
- **One notation: dotted paths.** `blockId`, `iframe.sandbox`, `scopes[1]`,
  `targets[0].slotId`, `scopeJustifications.<scope>` — the same way the
  human-readable messages and the schema name fields. Earlier releases mixed
  JSON Pointer (`/blockId`, `/scopes/1`) into `--json` while the text output
  used dotted; **if you were matching on `/`-prefixed fields, update your
  scripts.**

Two findings have no single manifest field, and say so explicitly rather than
omitting the key:

| `field` | meaning |
| --- | --- |
| `(root)` | the manifest **document** — it is missing, unparseable, or the schema reports a violation at the top level (e.g. `missing properties 'blockId', 'version', …`). |
| `(project)` | **repository state outside the manifest** — the committed lockfile, or the source tree the `BLOCK_READY` advisory reads. No manifest edit alone resolves these. |

`ok` already accounts for `--strict`: it is `false` when there are hard errors,
and also when `--strict` is passed and there are warnings. The process exit
code matches, and the JSON goes to **stdout** while the failure is reported on
**stderr** — so `civitai app validate --json | jq` works on a project that
fails *validation*.

### A refused path emits no object at all

::: danger Branch on the exit code before parsing
This object is written only when validation actually produced a result.
:::

A path that does **not exist**, or that is not a directory, is a mistake about
the invocation: it writes **nothing** to stdout and exits `2`.

```console
$ civitai app validate ./definitely-not-here --json
Error: ./definitely-not-here: no such directory — pass the path to an App project root, or scaffold one with `civitai app create <name>`
$ echo $?
2
```

It used to print `{"ok": false, "dir": "/nope", "errors": [ … ]}` and exit `1`
— a fabricated validation result, complete with a finding about a manifest
nobody could have written.

A failure that produces **no validation result at all** likewise emits no
object and exits `1`: a project directory the CLI cannot **stat** (it is
unreadable, or a component of the path below it is not a directory), and in
principle an internal schema failure, which is a directory the CLI *can* read
that still yields nothing to print.

::: tip An unreadable `block.manifest.json` is not one of those cases
It is a validation *verdict*, and the object is printed in full with a single
`(root)` finding carrying the `permission denied` message. The distinction is
how far the CLI got before it stopped: it could not read your *manifest*, which
is something to report about the project; it could not read the *directory*,
which is nothing at all.
:::

| exit | stdout |
| --- | --- |
| `0` | the object, `"ok": true` |
| `1` | the object with `"ok": false` for a validation **verdict** — including an unreadable manifest — but **nothing** when validation produced no result at all (an unreadable project *directory*, or an `ENOTDIR` partway down the path; also an internal schema failure, which a released binary should never hit) |
| `2` | **nothing** — the path does not exist, or is not a directory |

### Reading it from a script

::: danger `jq -e` is the wrong tool for reading `ok`
It exits `1` on a JSON `false`, which is indistinguishable from its exit code
for a missing key — so the obvious one-liner reports a *failing but perfectly
well-formed* result as "no result", which is the one distinction this whole
section exists to draw.
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

## The durable fix

A server-side `civitai app validate` endpoint calling the real validator — the
faithful contract — with this schema published as the syntactic half. Until
that exists, vendoring is on purpose: a local answer is *cheaper* than a
round-trip, and for validation a stale local copy is a cost worth paying.

## Where to go next

- [What goes in the bundle](./packaging) — what `app submit` packages, and what
  it leaves out.
- [Review, approval and deploy](./review-and-deploy) — the lifecycle after a
  successful submit.
- **Exit codes** — `civitai --help` prints the summary table for every code; the full per-code ledger is in the
  [CLI README](https://github.com/civitai/cli#exit-codes).
