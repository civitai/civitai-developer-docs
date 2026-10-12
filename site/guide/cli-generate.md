---
title: Generating images from the CLI
description: civitai generate spends real Buzz — how to price a run with --dry-run, what --max-cost can and cannot do, the confirmation gate, waiting and downloading outputs, and the exit code for every failure.
sources:
  - go:github.com/civitai/cli
---

# Generating images from the CLI

`civitai generate "<prompt>"` runs a text-to-image generation on Civitai's
generator from the [`civitai` CLI](./cli). Unlike every read command, it
**spends money**.

::: danger This spends real Buzz and cannot be undone
A submitted generation is charged the moment the orchestrator accepts it, and
nothing local calls that back — not `--timeout`, not Ctrl-C, not
`civitai workflows cancel`. Price it with `--dry-run` first; that calls the
server's cost estimator and spends nothing.
:::

For the flag list, see `civitai generate --help` and the generated
[CLI reference](../../apps/reference/cli). This page covers the money contract
and the failure modes.

## What the CLI can and cannot tell you about a charge

- **Your account Buzz ledger is not readable from here.** `civitai buzz`
  shows a *balance*, not a history, so it cannot settle "did *this* run come
  back" unless you noted the balance beforehand. Where no per-workflow record is
  available the CLI says so and points you at your
  [transaction history](https://civitai.com/user/transactions).
- **One workflow's own transactions often *are* in the payload.** When they
  are, `civitai workflows get <id>` — and `civitai generate` on a failed run —
  print each `debit` and `credit` and the net; see
  [Buzz transactions for one workflow](./cli-workflows#buzz-transactions-for-one-workflow).

The CLI never says a charge stands or was refunded. The server re-prices a
failed or cancelled run by the share of outputs that never landed, so the
amount depends on how far the run got.

## The shape of a session

```bash
# Price it. Spends nothing.
civitai generate "a cat wearing sunglasses" --dry-run

# The same estimate as raw JSON, for scripts
civitai generate "a cat wearing sunglasses" --dry-run --json

# Generate, refusing if the estimate exceeds 50 Buzz
civitai generate "a cat wearing sunglasses" --quantity 4 --max-cost 50

# Wait for the result and write the images into ./out
civitai generate "a cat" --yes --out-dir ./out

# …naming the files yourself — {n} keeps a batch from colliding
civitai generate "a cat" --yes --quantity 4 --out-dir ./out --out-name 'cat-{n}{ext}'

# Fire and forget; collect the results later
civitai generate "a cat" --yes --no-wait
civitai workflows list
civitai workflows get <workflow-id>

# Non-interactive (CI) — --yes is required, or the run is refused
civitai generate "a cat" --yes --max-cost 20
```

## The credential

Generation needs the **AI Services** scopes. Two credentials carry them:

- a full-scope **personal API key** —
  [create one](https://civitai.com/user/account), then
  `civitai login --token <key>`; or
- a browser login that opted in: `civitai login --scopes generate`.

A **default** OAuth browser login (`civitai login`, no `--scopes`) does **not**
carry them and is refused — and re-running plain `civitai login` will not fix
that. `civitai whoami` shows the capability as **Spend Buzz (AI Services)**.
See [CLI credentials and scopes](./cli-auth).

`--print-input` is the exception: it exits before the estimator, the submit
and the balance read. Only a **bare** `--print-input` needs neither a
credential nor a network — with `--image` or `--checkpoint`/`--lora` it does
not; see [What `--print-input` touches](./cli-generation-graphs#what-print-input-touches).

## `--max-cost` is an estimate check, not a spending cap

::: danger `--max-cost` never reaches the server
The cost this command shows is an **estimate, not a quote**: the server's
estimator returns no quote id, no signed price and no expiry, so there is
nothing to hand back at submit time — and no server-side spending ceiling is
reachable from an API key at all. The realized charge can exceed the estimate,
and `--max-cost` cannot claw the difference back.
:::

`--max-cost` compares that estimate against your number and refuses **locally**
before submitting. It catches a `--quantity` typo, and nothing more — do not
run an unattended loop believing it caps spend. (The per-API-key
`buzzLimit` on your account does not bind this path either — the generator
meters a separate server-minted subject, not your key.)

## Confirmation

An interactive run prints the estimate, your balance and the resolved model
names, then asks. A **non-interactive shell (pipe or CI) without `--yes` is
refused** rather than charged silently. Everything the confirmation prints goes
to **stderr**, so `--json` keeps stdout machine-clean.

## The content flags, and why there aren't twelve

`--negative-prompt`, `--quantity`, `--aspect-ratio`,
`--checkpoint <version-id>`, `--lora <version-id>[:strength]` (repeatable),
plus `--image` and `--ecosystem` — those two are covered in
[Choosing a model](./cli-generate-models).

The generator is **permissive, not a validator** — it returns HTTP 200 for
things it silently changes:

- An out-of-range `--quantity` is **clamped** with no error, so asking for 40
  charges for the server's limit. The CLI warns past its own advisory threshold
  but sends your value; it enforces no maximum.
- `steps: 0` and `cfgScale: 0` are *accepted* and price a degenerate, cheaper,
  wrong job — which is why `seed`, `steps`, `cfgScale` and `sampler` have **no
  flags**. Set them in the graph instead, which is also the only route to a
  **reproducible** run; see [Raw generation graphs](./cli-generation-graphs).
- A nonexistent checkpoint id is accepted, the ecosystem default is **silently
  substituted**, and you are billed for it.

So `--checkpoint` and every `--lora` is resolved against the public
model-version API **before** submitting: a bad id is a local *not found* (exit
`4`) instead of a wrong charge, and the confirmation shows the resolved **model
name**, not an integer.

`--model` is deliberately absent: `civitai download --model` takes a **model**
id, while `--checkpoint` here takes a **version** id.

## Waiting, downloading, and re-attaching

By default `generate` **waits** and writes every deliverable output into
`--out-dir` (default `.`) as `<workflow-id>-<n>.<ext>`. An existing file is
refused *before any bytes move* unless you pass `--force`.

### Naming the files

`--out-name <template>` replaces the default scheme. Three placeholders expand
and everything else is literal:

| Placeholder  | Expands to |
|---|---|
| `{workflow}` | the workflow id |
| `{n}`        | the output number, **1-based** |
| `{ext}`      | the file extension **including its leading dot** (`.jpeg`) |

The default is `{workflow}-{n}{ext}`, so `--out-name 'cat-{n}{ext}'` writes
`cat-1.jpeg`, `cat-2.jpeg`, … into `--out-dir`.

::: warning The rendered name must be a plain file name inside `--out-dir`
A path separator, a leading `/` or a `..` is **refused, not stripped**, as are
an unknown placeholder and a template that renders to nothing. All are
**usage errors (exit 2) raised before pricing**, so a bad template costs
nothing:

```console
$ civitai generate "a cat" --out-name 'sub/dir{ext}' --dry-run
Error: the output file name "sub/dir.jpeg" would not land directly in the output
directory "." — it resolves to "sub/dir.jpeg". An output name must be a plain
file name: a path separator or ".." is refused, not stripped. Fix the --out-name
template, and use --out-dir to choose the directory
$ echo $?
2
```
:::

A template that would give **two outputs the same name** (no `{n}` on a
multi-image run) is refused before any byte is downloaded, and `--force` does
*not* override it — there is no earlier file to replace, and the presigned URLs
are not re-issued. A single-output run with a fixed name is fine.

### Not waiting

- `--no-wait` submits, prints the workflow id and exits `0`.
- `--no-download` waits and prints one `n<TAB>url` row on **stdout** per
  deliverable output that came back with a URL; `cut -f2` gives the URLs. `n` is
  the output's position in the deliverable list, so an output returned without
  a URL leaves a gap in the numbering rather than a dropped row. The URL is
  flattened to one line and one field first, so it cannot add a row or field of
  its own.
- `--timeout` bounds how long the CLI waits, and defaults to **30m**: the wait
  has to outlast the **queue**, where a healthy job can sit in `scheduled` for
  more than **10 minutes** before it runs, and a shorter default would walk
  away from a run that has already been charged.
- `civitai workflows get <workflow-id>` shows a workflow at any time. It is the
  re-attach path for every case where the CLI stopped early, and it spends
  nothing.

::: danger `--timeout` stops *waiting*. It does not stop the *job*.
When the deadline passes — or you press Ctrl-C — the generation keeps running
server-side and bills exactly as if you had stayed. Both exit **non-zero** and
print the workflow id, the idempotency key and the exact
`civitai workflows get …` command. Only `civitai workflows cancel` stops the
remaining work; see [Cancelling](./cli-workflows#cancelling-a-workflow) for what
that does to the charge.
:::

### Output URLs are presigned and expire

The links in a workflow — on screen, from `--no-download` and in `--json` — are
short-lived signatures, not durable addresses. Download promptly, and re-run
`civitai workflows get <id>` for fresh links rather than caching old ones.
Fetch them with **no** `Authorization` header: the URL is already authorized,
and the CLI deliberately attaches nothing (your full-scope API key would hand
25 unrelated permissions to a request that needs none). A 401/403 from one of
these URLs means the signature is wrong or expired; no credential fixes it,
and the CLI does not retry with one.

### Fewer results than you paid for

An output can be blocked by moderation, never land, or be one you hid on the
website. Those are filtered out of the download and **reported, with the
reason**, plus a note when the count differs from `--quantity`. If *every*
output is filtered out the command exits non-zero.

### Crash safety

The orchestrator's idempotency key is written to `pending/<key>.json` under the
CLI's config directory — `~/.config/civitai/` on Linux,
`~/Library/Application Support/civitai/` on macOS — **before** the request is
sent, because the money moves server-side even if the process dies mid-POST.
Idempotency is always on.

If a submit's reply never arrives, re-run with `--external-id <key>`: the
orchestrator dedupes on it and returns the **pre-existing** workflow instead of
charging again. It answers a duplicate with HTTP `200`, not `409`, so
re-attachment is inferred locally. `--external-id` **overrides** the minted
key; it does not switch idempotency on.

### Polling cadence

The status poll starts at 5s, backs off exponentially to a cap, and backs off
harder on a `429`. The floor is not tunable downward: the workflow read has no
cache and no server-side rate limit, so the CLI's own restraint is what
prevents a 429 storm.

## Exit codes

`generate` follows the CLI's global exit-code table with one refinement: the
API answers very different failures with the same HTTP status, and a caller
who is out of Buzz, muted, or hitting a server-side outage must **never** be
told to re-run `civitai login`. Those exit `1` (generic), not `3` (auth) or `2`
(usage).

::: danger An exit code does not tell you whether you were charged
Every failure above the divider happens *before* anything is submitted, so
nothing was spent. Every failure below it happens *after* the submit, and **the
Buzz is gone** — including a `--timeout`, a Ctrl-C, and a workflow that ends
`failed`. Do not write a retry loop that branches on the exit code alone;
re-attach with `civitai workflows get <workflow-id>` instead of re-submitting.
:::

| Failure | Exit |
| --- | --- |
| *— nothing submitted, nothing spent —* | |
| Missing AI Services scope / no token / not authenticated | `3` |
| Not enough Buzz (caught locally against your balance, or reported by the server) | `1` |
| Account muted, or onboarding incomplete | `1` |
| Generation disabled server-side | `1` |
| Prompt refused by content moderation — **never retry**, repeated blocked prompts get the account muted | `1` |
| The server priced the job but reports `ready: false` (a selected resource is not currently available) | `2` |
| Estimate above `--max-cost`, an unknown ecosystem, or a resource that resolved fine but is "not enabled for generation" (the ids exist; the *combination* is not runnable — distinct from exit `4`, which means "no such id") | `2` |
| `--fail-on-substitution` and the **estimate** reported a substituted checkpoint — nothing submitted (see [Silent model substitution](./cli-generate-models#silent-model-substitution)) | `1` |
| `--input` that is malformed, declares a non-`txt2img` workflow, carries an envelope key, or is combined with a content flag | `2` |
| A `--out-name` template that is invalid, escapes `--out-dir`, or collides | `2` |
| `--image` without `--ecosystem` | `2` |
| No such `--checkpoint` / `--lora` version id | `4` |
| `civitai workflows get` / `workflows cancel` on an unknown workflow id (a read; spends nothing) | `4` |
| *— submitted: the Buzz is already spent —* | |
| `--timeout` expired, or Ctrl-C while waiting — the job **keeps running** server-side and was **not** cancelled | `1` |
| The workflow finished `failed` / `expired` / `canceled` | `1` |
| The workflow succeeded but every output was filtered out (blocked / unavailable / hidden) | `1` |

A substitution that appears **only on the submit reply** is reported but exits
`0` — see [`--fail-on-substitution`](./cli-generate-models#refusing-instead-fail-on-substitution).

## Where to go next

- [Choosing a model, and what the server may run instead](./cli-generate-models)
  — `--checkpoint`, `--ecosystem`, `--image`, and silent substitution.
- [Raw generation graphs](./cli-generation-graphs) — `--print-input` /
  `--input`, and the only route to a seed.
- [Tracking and cancelling generations](./cli-workflows) — `civitai workflows
  list` / `get` / `cancel`.
- [Scripting the CLI with `--json`](./cli-json) — the output guarantees, and
  why `ready: true` is not a success predicate.
