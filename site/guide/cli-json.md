---
title: Scripting the CLI with --json
description: What civitai --json guarantees and what it does not — pure-JSON stdout, errors on stderr, the body repair that changes bytes without changing the document, and why generation payloads follow different rules.
sources:
  - go:github.com/civitai/cli
---

# Scripting the CLI with `--json`

Every read subcommand of the [`civitai` CLI](./cli) takes `--json`, which
prints the `/api/v1/...` REST response **as the API shaped it** — not a
CLI-invented shape. So the field schema is exactly the public Site API's; keep
the [REST field reference](../reference/) open (e.g.
[models](../reference/models),
[model-versions](../reference/model-versions)) rather than
reverse-engineering fields with `jq keys`.

The **read-path recipes** — the `--cursor` deep-paging loop, silencing the
update nag for clean pipeline output, the SHA256-case and embedded
`modelVersions` gotchas, and a worked search-then-download example — are on the
[CLI guide](./cli#scripting-with-json). What is below is how `--json` treats
the bytes, and the generation and `app` payloads, which are not Site API REST
shapes.

## Two properties make the output safe to pipe

- **`--json` stdout is pure JSON.** Nothing else is written to stdout, so
  `… --json | jq -e .` always parses.
- **Errors go to stderr with a non-zero exit.** A failed call writes the error
  to **stderr**, exits non-zero, and prints **nothing to stdout**, so `jq`
  never sees error prose. For example
  `civitai model-versions get 999999999 --json` exits `4` with
  `Error: not found (404): Model not found` on stderr and an empty stdout.

Both hold for `civitai generate` and `civitai workflows …` too — but their
payloads are not Site API shapes. See
[Generation `--json`](#generation-json) below.

## It passes through the DOCUMENT, not the BYTES

::: danger Do not diff or hash `--json` output against the wire
Two things change the bytes without changing the document.
:::

**The first is cosmetic: the output is re-indented**, so a compact API body
comes out longer than it went in.

**The second is not.** The API intermittently emits a **raw control byte** — a
carriage return, most often — inside a `prompt` or `description` string, which
is not legal JSON and used to fail the whole page. When a page will not decode,
the CLI rewrites those bytes as their JSON escapes (`\r`, `\u0001`) and decodes
the repaired body, and **that repaired body is what `--json` prints**. The
*document* is still the API's — the same strings, the same characters — but the
bytes are not. A page that decodes as sent is passed through with no such
rewrite.

### A username can be entirely digits

A second shape used to fail the same way and is also fixed: a Civitai username
can be all digits, and such a value was reported arriving as a bare JSON
**number** (`"username": 2802169344506`, unquoted) rather than a string. One
such uploader on a page failed the whole page, so `civitai images search`
printed nothing at all. The CLI now accepts either shape and keeps the digits
exactly as sent — so treat a username as a **string** in your script even
though the wire may carry a number.

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

**The two byte changes apply differently here, so take them one at a time.**
The output is **re-indented** exactly as above, so it is no more diffable or
hashable than the read group's. But the **repair never runs on a generation
reply** — it is applied by the read SDK's own decode step, and the generation
client decodes with the standard library, so nothing rewrites a control byte
there.

Two further caveats have bitten people, and neither shows up as an error.

### Output URLs are presigned and EXPIRE

The links in a workflow payload are short-lived signatures, not durable
addresses. A pipeline that stores them and fetches later gets a 401/403 from
the storage host that **no credential can fix** — re-run
`civitai workflows get <id>` for fresh links instead of caching the old ones.
Fetch them with **no** `Authorization` header; they are already authorized, and
the CLI deliberately attaches nothing to them.

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

The `*` arm is the point. An earlier version of this snippet tested
`[ … = "false" ] && exit 1`, which exits **0** when the key is absent or `jq`
fails — it read "we could not ask" as "we asked and it was fine".

### `ready` is one-directional {#ready-is-one-directional}

::: danger `ready: true` is not a success predicate
`ready` reports only that the resources this job needs are currently
available. The server computes it as "every job's queue position reports
`support: available`", and **a job carrying no queue position at all is
skipped, leaving the flag `true`**.

It is not a moderation verdict and not a prediction that the job produces an
image — `--dry-run` therefore prints it as **`Resources ready`**, not
"Generatable". A run reporting `ready: true` can still be charged and return
nothing: measured, 8 submits across 3 checkpoints that all quoted `ready: true`
produced **0** outputs.

So gate on the FALSE direction, as above, and never treat `true` as a success
predicate.
:::

The only thing that settles whether a job produced output is the finished
workflow (`civitai workflows get <id>`), and `civitai generate` exits non-zero
when it waited and got no deliverable output.

**What `ready: false` gets you is a LOCAL refusal.** `civitai generate` reads
the flag and refuses to submit; no server-side enforcement of it is known.
Treat it as this CLI's own pre-flight, not as a promise about what the server
would have done.

### Cost keys are an open map

`cost.factors` and `cost.fixed` are server-owned and passed through
**verbatim**, so treat them as an open map rather than a fixed set. The same
goes for `modelSubstitutions` and the `transactions` object: the CLI passes
through every field it does not model.

## Where to go next

- **Exit codes** — branch on the code before parsing. `civitai --help` prints
  the summary table; the full ledger is in the
  [CLI README](https://github.com/civitai/cli#exit-codes).
- [CLI terminal output](./cli-output) — the colour precedence, and the
  sanitising the **human** renderers do that this output is exempt from.
- [CLI troubleshooting](./cli-troubleshooting) — look up an error message.
- [Generating images from the CLI](./cli-generate).
- [Tracking and cancelling generations](./cli-workflows).
