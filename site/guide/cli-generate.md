---
title: Generating images from the CLI
description: civitai generate spends real Buzz — how to price a run with --dry-run, what --max-cost can and cannot do, the confirmation gate, waiting and downloading outputs, and the exit code for every failure.
sources:
  - go:github.com/civitai/cli
---

# Generating images from the CLI

`civitai generate "<prompt>"` runs a text-to-image generation on Civitai's
generator from your terminal. It is part of the same
[`civitai` CLI](./cli) you use to browse and download — but unlike every read
command, this one **spends money**.

::: danger This spends real Buzz and cannot be undone
A submitted generation is charged the moment the orchestrator accepts it, and
nothing local calls that back — not `--timeout`, not Ctrl-C, not
`civitai workflows cancel`. Price it with `--dry-run` first; that calls the
server's cost estimator and spends nothing.
:::

For the flag list, `civitai generate --help` and the generated
[CLI reference](../../apps/reference/cli) are the authority. This page is about
the money contract and the failure modes.

## What the CLI can and cannot tell you about a charge

The CLI reports **two different things**, and keeping them apart is the whole
point:

- **Your account Buzz ledger is not readable from here.** `civitai buzz`
  reports a *balance*, not a history, so a balance alone cannot settle "did
  *this* run come back" unless you noted it beforehand. Where no per-workflow
  record is available the CLI says exactly that and points you at your
  [transaction history](https://civitai.com/user/transactions).
- **One workflow's own transactions often *are* in the payload.** When they
  are, `civitai workflows get <id>` — and `civitai generate` on a failed run —
  print each `debit` and `credit` the server recorded for that workflow, and
  the net. See
  [Buzz transactions for one workflow](./cli-workflows#buzz-transactions-for-one-workflow).

The CLI does **not** tell you a charge stands, and does **not** tell you it was
refunded. The server re-prices a failed or cancelled run by the share of its
outputs that never landed; the CLI still promises no *amount*, because the
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

The one exception is `--print-input`, which assembles the graph and exits
before the estimator, the submit and the balance read. Two caveats, and they
are **not** the same caveat:

- `--print-input` **with `--image`** does need a credential, because it uploads
  each local file first and that upload is authenticated.
- `--print-input` **with `--checkpoint` or `--lora`** needs none — the
  model-version lookup is a public read — but it is **not offline**: that
  lookup is a real request, and with no network it fails (exit `5`) rather than
  printing a graph.

So only a **bare** `--print-input` needs neither a credential nor a network.
See [Raw generation graphs](./cli-generation-graphs).

## `--max-cost` is an estimate check, not a spending cap

::: danger `--max-cost` never reaches the server
The cost this command shows is an **estimate, not a quote**: the server's
estimator returns no quote id, no signed price and no expiry, so there is
nothing to hand back at submit time — and no server-side spending ceiling is
reachable from an API key at all. The realized charge can exceed the estimate,
and `--max-cost` cannot claw the difference back.
:::

`--max-cost` compares that estimate against your number and refuses **locally**
before submitting. It catches a `--quantity` typo. That is all it can do. Do
not run an unattended loop believing it caps spend. (The per-API-key
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

The generator is **permissive, not a validator**. It returns HTTP 200 for
things it silently changes:

- An out-of-range `--quantity` is **clamped** with no error — asking for 40
  charges you for the server's limit. The CLI warns when you cross its own
  advisory threshold, then sends your value anyway; the clamp is the server's,
  and the CLI does not enforce a maximum of its own.
- `steps: 0` and `cfgScale: 0` are *accepted* and price a degenerate, cheaper,
  wrong job — which is exactly why those are **not** exposed as flags.
- A checkpoint id that does not exist is accepted, the ecosystem default is
  **silently substituted**, and you are billed for it.

So `--checkpoint` and every `--lora` is resolved against the public
model-version API **before** anything is submitted: a bad id becomes a hard
local *not found* (exit `4`) instead of a wrong charge, and the confirmation
echoes the resolved **model name** so you approve a name rather than an
integer.

`--model` is deliberately absent, and the asymmetry is real:
`civitai download --model` takes a **model** id, while `--checkpoint` here
takes a **version** id.

::: tip `seed`, `steps`, `cfgScale` and `sampler` have no flags at all
The `steps: 0` behaviour above is why: a flag whose unset value could reach the
request would buy a broken run at a discount. They are still reachable —
through the graph, not a flag — and the graph is the only route to a
**reproducible** run, because the seed lives there. See
[Raw generation graphs](./cli-generation-graphs).
:::

## Waiting, downloading, and re-attaching

By default `generate` **waits** for the job to finish and writes every
deliverable output into `--out-dir` (default `.`) as
`<workflow-id>-<n>.<ext>`. `--force` overwrites existing files; without it a
collision is refused *before any bytes move*.

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
A path separator, a leading `/`, or a `..` is **refused, not stripped** —
silently sanitising a traversal writes a file you did not ask for under a name
you did not choose. An unknown placeholder and a template that renders to
nothing are refused too. All of these are **usage errors (exit 2) raised before
the job is priced or submitted**, so a bad template costs nothing:

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

A template that would give **two outputs the same name** — one with no `{n}` on
a multi-image run — is refused before any byte is downloaded, and `--force`
does *not* override it: there is no earlier file to replace, only the run's own
other output, and the presigned URLs spent getting it are not re-issued.
Include `{n}` for a batch. A single-output run with a fixed name is fine.

### Not waiting

- `--no-wait` submits, prints the workflow id and exits `0`.
- `--no-download` waits and prints the output URLs instead of writing files.
  One row on **stdout** per **deliverable** output that came back **with a
  URL**, the CLI's own number and the URL separated by a tab, so `cut -f2` is
  the intended read. The number is that output's position within the
  deliverable list, so it skips an output the server returned without a URL — a
  gap in the numbering is the CLI's own, not a dropped row. The URL is the **server's**, so it is flattened to
  one line and one tab-separated field first: a presigned URL cannot add a
  numbered row of its own, or an extra field, to that listing.
- `--timeout` bounds how long the CLI waits, and defaults to **30m**. That is
  deliberately generous: the wait has to outlast the **queue**, not just the
  execution. A healthy job has been measured sitting in `scheduled` for
  **11m41s** before execution even began, so a shorter default walks away from
  a run that has already been charged.
- `civitai workflows get <workflow-id>` shows a workflow at any time. It is the
  re-attach path for every case where the CLI stopped early, and it spends
  nothing.

::: danger `--timeout` stops *waiting*. It does not stop the *job*.
When the deadline passes — or you press Ctrl-C — the generation keeps running
server-side, and finishes and bills exactly as if you had stayed. Neither case
cancels anything. Both exit **non-zero**, print the workflow id, the
idempotency key and the exact `civitai workflows get …` command, and never
report success.

`civitai workflows cancel` is the only thing that stops the remaining work; see
[Cancelling](./cli-workflows#cancelling-a-workflow) for what that does to the
charge.
:::

### Output URLs are presigned and expire

Download promptly; re-read the workflow for fresh links. The blob fetch
deliberately carries **no credential** — the URL is already authorized, and
attaching your full-scope API key to it would hand 25 unrelated permissions to
a request that needs none. A 401 from one of these URLs means the signature is
wrong or expired; no credential fixes it, and the CLI does not retry it with
one.

### Fewer results than you paid for

A finished workflow can contain fewer usable results than you paid for. An
output can be blocked by moderation, never land, or be one you hid on the
website. Those are filtered out of the download — and **reported, with the
reason**, plus an explicit note when the count differs from `--quantity`.
Silently writing three files for a four-image job is the failure this exists to
prevent. If *every* output is filtered out the command exits non-zero.

### Crash safety

The orchestrator's idempotency key is written to a `pending/<key>.json` file
under the CLI's config directory — `~/.config/civitai/` on Linux,
`~/Library/Application Support/civitai/` on macOS — **before** the request is
sent, because the money moves server-side even if the process dies mid-POST. Idempotency is
always on — there is no flag to enable it.

If a submit's reply never arrives, re-run with `--external-id <key>`: the
orchestrator dedupes on it and returns the **pre-existing** workflow instead of
charging again. It answers a duplicate with HTTP `200`, not a `409`, so
re-attachment is inferred locally rather than read off a status code.
`--external-id` **overrides** the key the CLI would have minted; it does not
switch idempotency on.

### Polling cadence

The status poll starts at 5s, backs off exponentially to a cap, and backs off
harder on a `429`. That floor is not tunable downward: the workflow read
proxies straight through to the orchestrator with no cache and no server-side
rate limit, so the CLI's own restraint is the only thing between it and a 429
storm.

## Exit codes

`generate` follows the CLI's global exit-code table with one deliberate
refinement. The API answers several very different failures with the same HTTP
status, and the generic mapping would send a script down the wrong path — in
particular a caller who is out of Buzz, muted, or hitting a server-side outage
must **never** be told to re-run `civitai login`. Those cases therefore exit
`1` (generic), not `3` (auth) or `2` (usage).

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
| Prompt refused by content moderation — 🔴 **never retry**, repeated blocked prompts get the account muted | `1` |
| The server priced the job but reports `ready: false` (a selected resource is not currently available) | `2` |
| Estimate above `--max-cost`, an unknown ecosystem, or a resource that resolved fine but is "not enabled for generation" (the ids exist; the *combination* is not runnable — distinct from exit `4`, which means "no such id") | `2` |
| `--fail-on-substitution` and the **estimate** reported a substituted checkpoint — nothing submitted (see [Silent model substitution](./cli-generate-models#silent-model-substitution)) | `1` |
| `--input` that is malformed, declares a non-`txt2img` workflow, carries an envelope key, or is combined with a content flag | `2` |
| A `--out-name` template that is invalid, escapes `--out-dir`, or collides | `2` |
| `--image` without `--ecosystem` | `2` |
| No such `--checkpoint` / `--lora` version id | `4` |
| `civitai workflows get` / `workflows cancel` on an unknown workflow id (a read; spends nothing) | `4` |
| *— 🔴 submitted: the Buzz is already spent —* | |
| `--timeout` expired, or Ctrl-C while waiting — the job **keeps running** server-side and was **not** cancelled | `1` |
| The workflow finished `failed` / `expired` / `canceled` | `1` |
| The workflow succeeded but every output was filtered out (blocked / unavailable / hidden) | `1` |

A substitution that appears **only on the submit reply** is reported and is in
`--json`, but exits `0`: by then the charge has happened, and failing would
strand a result you paid for.

## Where to go next

- [Choosing a model, and what the server may run instead](./cli-generate-models)
  — `--checkpoint`, `--ecosystem`, `--image`, and silent substitution.
- [Raw generation graphs](./cli-generation-graphs) — `--print-input` /
  `--input`, and the only route to a seed.
- [Tracking and cancelling generations](./cli-workflows) — `civitai workflows
  list` / `get` / `cancel`.
- [Scripting the CLI with `--json`](./cli-json) — the output guarantees, and
  why `ready: true` is not a success predicate.
