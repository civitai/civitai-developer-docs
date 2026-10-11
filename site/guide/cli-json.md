---
title: Scripting the CLI with --json
description: What civitai --json guarantees for scripts — pure-JSON stdout, errors on stderr, re-indented and repaired bodies, and the generation payload's caveats.
sources:
  - go:github.com/civitai/cli
---

# Scripting the CLI with `--json`

Every read subcommand of the [`civitai` CLI](./cli) takes `--json`, which
prints the `/api/v1/...` REST response **as the API shaped it**, so the field
schema is the public Site API's — keep the [REST field reference](../reference/)
open (e.g. [models](../reference/models),
[model-versions](../reference/model-versions)) rather than reverse-engineering
fields with `jq keys`.

The read-path recipes — `--cursor` deep paging, silencing the update nag, the
SHA256-case and embedded `modelVersions` gotchas, and a search-then-download
example — are on the [CLI guide](./cli#scripting-with-json). This page covers
how `--json` treats the bytes, and the generation and `app` payloads, which are
not Site API shapes.

## Two properties make the output safe to pipe

- **`--json` stdout is pure JSON, and never styled.** Nothing else is written to
  stdout, so `… --json | jq -e .` always parses, at any colour setting
  ([`--json` is never styled](./cli-output#json-is-never-styled)).
- **Errors go to stderr with a non-zero exit**, and **nothing** goes to stdout.
  For example `civitai model-versions get 999999999 --json` exits `4` with
  `Error: not found (404): Model not found` on stderr and an empty stdout.

**Safe to pipe is not safe to print.** The escape-stripping and flattening the
human renderers apply ([What a table cell can contain](./cli-output#what-a-table-cell-can-contain))
do **not** run on `--json`, so a script that prints a server-supplied string
onto a terminal must sanitise it itself.

Both properties hold for `civitai generate` and `civitai workflows …` too; see
[Generation `--json`](#generation-json).

## It passes through the DOCUMENT, not the BYTES

::: danger Do not diff or hash `--json` output against the wire
Two things change the bytes without changing the document.
:::

**The output is re-indented**, so a compact API body comes out longer than it
went in. **And control bytes are repaired:** the API intermittently emits a raw
control byte — most often a carriage return — inside a `prompt` or
`description` string, which is not legal JSON. When a page will not decode, the
CLI rewrites those bytes as JSON escapes (`\r`, `\u0001`), decodes the repaired
body, and **prints the repaired body**. The *document* — the strings and
characters — is still the API's; the bytes are not. A page that decodes as sent
is passed through unrepaired.

### A username can be entirely digits

A username can arrive as a bare JSON **number**
(`"username": 2802169344506`) rather than a string. The CLI keeps the digits
exactly as sent; treat `username` as a **string** in your script.

### When a body still will not decode

You get `unexpected response from …`, and the text after the colon is the
server's own body, **truncated**, with invisible and terminal-controlling
characters removed — so a hostile body cannot rewrite what is already on your
screen from inside the error line. Nothing else about it is rewritten, and the
repair above is **not** applied to what you are shown.

## The two `app` commands that compose their own shape

Most `--json` output is a wire payload. Two `app` commands emit a shape the
**CLI composes**:

- `civitai app validate --json` — see
  [What `app validate` proves](../../apps/guide/validate#the-json-result-shape).
- `civitai app listing status --json`, which joins the two listing reads into
  one object naming `parentId` and `shadowId`.

Both keep the two piping properties above; only the *provenance* of the fields
differs.

::: danger `app listing status --json` is a read with a server-side SIDE EFFECT
On a **live** (approved) listing it opens a revision draft server-side. Unlike
every read above, it must **not** be polled in a loop — a watch loop is a
writer. Reading it once per change is fine.
:::

## Generation `--json` {#generation-json}

`civitai generate --dry-run --json`, `civitai workflows list --json` and
`civitai workflows get <id> --json` emit the raw **orchestrator** payload.
Generation has no REST route, so these are not Site API shapes and there is no
field reference page for them.

The output is **re-indented** as above, but the control-byte **repair never
runs on a generation reply** (it belongs to the read SDK's decode step; the
generation client uses the standard library). Output URLs in these payloads are
presigned and expire — see
[Output URLs are presigned and expire](./cli-generate#output-urls-are-presigned-and-expire).

### `--json` still exits 0 when resources are unavailable

`--dry-run --json` prints the estimate and exits `0` even when the payload says
`"ready": false`. A human `--dry-run` prints a warning and the CLI refuses to
submit in that state, but a script reading only the exit code sees success.
**Branch on the field**, using a shape that **fails closed**:

```bash
q=$(civitai generate "a cat" --dry-run --json) || exit $?
case "$(printf '%s' "$q" | jq -r 'if has("ready") then .ready else "absent" end')" in
  false)   echo "resources unavailable" >&2; exit 1 ;;   # decisive: do not submit
  true)    ;;                                            # NOT a green light — see below
  *)       echo "no readable .ready field" >&2; exit 1 ;; # absent, null, or jq failed
esac
printf '%s' "$q" | jq -r .cost.total
```

The `*` arm is the point: a plain `[ … = "false" ] && exit 1` exits **0** when
the key is absent or `jq` fails.

### `ready` is one-directional {#ready-is-one-directional}

::: danger `ready: true` is not a success predicate
`ready` reports only that the resources the job needs are currently available:
the server sets it from every job's queue position reporting
`support: available`, and **a job with no queue position is skipped, leaving
the flag `true`**. It is not a moderation verdict and not a prediction of
output — `--dry-run` prints it as **`Resources ready`** — and a `ready: true`
run can still be charged and return nothing. Gate on the FALSE direction only.
:::

Only the finished workflow (`civitai workflows get <id>`) settles whether a job
produced output; `civitai generate` exits non-zero when it waited and got no
deliverable output. `ready: false` gets you a **local** refusal —
`civitai generate` will not submit — with no known server-side enforcement.

### Cost keys are an open map

`cost.factors`, `cost.fixed`, `modelSubstitutions` and the `transactions`
object are server-owned and passed through **verbatim**, including fields the
CLI does not model. Treat them as open maps.

## Where to go next

- **Exit codes** — branch on the code before parsing. `civitai --help` prints
  the summary table; the full ledger is in the
  [CLI README](https://github.com/civitai/cli#exit-codes).
- [CLI terminal output](./cli-output) — the colour precedence, and the
  sanitising the **human** renderers do that this output is exempt from.
- [CLI troubleshooting](./cli-troubleshooting) — look up an error message.
- [Generating images from the CLI](./cli-generate).
- [Tracking and cancelling generations](./cli-workflows).
