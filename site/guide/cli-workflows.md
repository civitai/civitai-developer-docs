---
title: Tracking and cancelling generations
description: civitai workflows list, get and cancel — cursor paging, the deliverable/total output count, what the server says went wrong, what cancelling does to a charge, and the per-workflow Buzz transaction record.
sources:
  - go:github.com/civitai/cli
---

# Tracking and cancelling generations

Every job `civitai generate` submits becomes a **workflow** with an id. The
`civitai workflows` commands read that feed — the same queue the website's
generator shows — and are the re-attach path for any run the CLI stopped
waiting on.

```bash
civitai workflows list                      # newest first
civitai workflows list --limit 5
civitai workflows list --limit 50 --cursor <next-cursor>
civitai workflows list --json               # raw server payload, incl. nextCursor
civitai workflows get <workflow-id>         # one workflow, in full
civitai workflows cancel <workflow-id>      # asks for confirmation
civitai workflows cancel <workflow-id> -y   # skip the prompt (scripts/CI)
```

**Reading spends nothing.** It needs the same AI Services scopes
`civitai generate` needs — see [CLI credentials and scopes](./cli-auth).

## Listing

`list` is **cursor-paged**, not page-numbered. When more results exist it
prints `Next cursor: <c>` on **stdout**, which you pass back as `--cursor`.
`--tag` filters on orchestrator workflow tags and is repeatable. Deep pages are
not cached server-side, so walk them at a civil pace.

### `deliverable/total` is two numbers on purpose

The `OUTPUTS` column reads `deliverable/total`. The two differ when an output
was blocked by moderation, never landed, or you hid it on the website — so
`0/4` means four images were produced and paid for and none of them are usable,
which is a very different fact from `0/0`. Collapsing them would hide that.
`civitai workflows get <id>` shows the per-output reason.

### The server's account of a workflow

Where the server recorded an account of what happened, the list prints it under
that workflow's row — indented, in full, and in the server's own words:

```console
WORKFLOW ID                STATUS     CREATED                   COST  OUTPUTS
8753561-20260810224136984  succeeded  2026-08-10T22:41:36.984Z  104   1/1
8753561-20260810223715659  failed     2026-08-10T22:37:15.659Z  0     0/1
    Google Gemini: Could not generate images with the given prompts and images.
    Please try again with different inputs.
```

That gives up strictly-one-line-per-workflow, deliberately: `--json` is the
scripting contract and the table is not. Not every workflow has an account
recorded — nothing is printed for those, and the absence is the server's, not
the CLI's.

## What the server says went wrong

When a generation ends badly the orchestrator often records an account of what
happened on the step. `civitai generate` puts it at the end of the error,
`civitai workflows get <id>` prints it under **The server reported:**, and
`civitai workflows list` prints it on indented lines under the workflow's row:

```console
Workflow ID:  wf_abc123
Status:       failed

The server reported:
  - Could not generate images with the given prompts and images. Please try again with different inputs.
```

The heading is *"The server reported"* rather than *"Why it failed"* on
purpose: the CLI prints the record whatever the workflow's status, and it has
not established that the orchestrator populates it only on failure.

Five things it is **not**:

- **It is not this CLI's opinion.** The text is the server's. Nothing here
  classifies it, matches on its wording, or maps it to a list of known messages
  — so a message the platform adds tomorrow arrives intact rather than being
  swallowed by a stale table.
- **It is not quite byte-for-byte, on the terminal.** Before printing any
  server-supplied text the CLI removes escape and control bytes plus every
  character Unicode marks **default-ignorable** — zero-width spaces and
  joiners, the bidi overrides that reverse the order a line is *displayed* in,
  the variation selectors (except the one that keeps an emoji looking like an
  emoji) — plus two runes that paint nothing while Unicode files them as a
  symbol and a mark, and four Hangul *fillers* that paint nothing while Unicode
  files them as letters. Punctuation, accents, CJK, emoji, ordinary letters and
  right-to-left *script* survive, as do the format characters Unicode says must
  be drawn.

  ::: warning The strip is not free
  Every removed character is invisible on its own, but some of them change how
  their **neighbours** are drawn: an emoji built from a zero-width joiner
  renders as its components, a subdivision flag falls back to 🏴, and text that
  uses the join controls to make a distinction loses it — Persian/Arabic
  (`می‌روم` renders joined), Malayalam (the chillu `ണ്‍` becomes `ണ്`, a
  different letter), Devanagari, Bengali, Tamil, Kannada, Sinhala and
  Mongolian. **`--json` is not filtered at all** — it is a raw passthrough, so
  a script sees exactly what the server sent.
  :::

- **It is not applied to the prompt you typed.** The filter is for text the
  server sent. Your prompt, your negative prompt, `--aspect-ratio`,
  `--ecosystem`, the paths you pass to `--image` / `--input`, and the ids you
  give `workflows cancel` are all echoed back exactly as typed — most
  importantly on the confirmation screen before a spend, which has to show what
  will really be sent. Two deliberate exceptions, both outside that screen: a
  value read out of an `--input` *file* is filtered like server text (a graph
  file can come from anywhere), and `civitai download` filters the path it
  reports even when you set it with `--out`, because the same variable usually
  holds a filename the **server** chose.
- **It is not always there.** Some failures record nothing. In that case the
  error says so instead — *"the orchestrator often supplies no failure reason,
  so it may not say why"*. That is a measured case, not a gap in the CLI, and
  there is no further detail to go and look for.
- **It is not a statement about your Buzz.** Whether a charge stands, is
  re-priced or comes back is decided server-side and reported separately — see
  [Buzz transactions for one workflow](#buzz-transactions-for-one-workflow).

### The two commands can word the same failure differently

Neither is the CLI's doing. `workflows list` reads the platform's *normalized*
feed, which runs each message through a server-side sanitiser that names the
provider — *"Google Gemini: Could not generate images…"*. `workflows get` reads
the orchestrator's raw workflow, where the same message has no such prefix. So
the list can be the more specific of the two.

It can also be the **less** specific one, and that is the half worth knowing
when you are debugging. The same sanitiser *replaces* any message it cannot
vouch for — one carrying a URL, a path, a stack frame, an infra name, or
running past 300 characters or one line — with a generic *"… reported a system
error"*. `workflows get` applies none of that, so where the two disagree the
raw one can be the more informative.

**When a failure is worth chasing, read both.** The CLI reproduces neither
transform; it prints what each endpoint sent, less the invisible characters
described above.

## Cancelling a workflow

::: danger `cancel` is not a clean refund — and it is not a total loss either
Buzz is charged **up front**, when the orchestrator schedules the run.
Cancelling stops the steps that have not finished; the orchestrator then
**re-prices the workflow against the work it actually did** and settles the
difference against what it took. What the run already delivered is billed: a
step that had already finished keeps its full cost, and a job a worker has
already started and cannot interrupt runs to completion and is billed for.

So cancel a job because you no longer want its *output*. How much of the charge
that leaves you paying depends on how far the run had got — the settlement is
server-side and happens once the workflow reaches its final state, not when the
command returns, and **this CLI never sees your account Buzz ledger**, so
`cancel` itself reports no figure.

(This is also why `--timeout` and Ctrl-C deliberately do **not** cancel: they
stop the wait, not the job.)
:::

Once the workflow reaches its final state, `civitai workflows get <id>` shows
the transactions the server recorded for it — see
[below](#buzz-transactions-for-one-workflow). Otherwise settle it against your
[transaction history](https://civitai.com/user/transactions).

### The confirmation gate

`cancel` **asks for confirmation**, matching `civitai generate` and
`civitai app submit`. It is the one irreversible action here — it throws away
whatever the run has not produced yet — so it is gated the same way:

- `--yes` / `-y` proceeds without prompting;
- an interactive terminal prints what is lost and prompts; the default is
  **no**, so a bare Enter aborts;
- a **non-interactive** shell without `--yes` **refuses** rather than
  cancelling silently. Scripts must pass `--yes` explicitly.

Nothing is cancelled when the confirmation is refused — the gate runs before
any request goes out.

### An unknown id is refused, not reported as cancelled

The cancel procedure answers the same empty success for a typo as for a real
workflow, so `cancel` reads the workflow back first. An unknown id exits **`4`**
— the same code `civitai workflows get` gives it — and **no cancel request is
sent at all**.

If that read fails for any *other* reason — a timeout, a 5xx, a rate limit, an
auth failure — the cancel **is** still sent, because a flaky read must never be
what stops you halting a job that is spending your Buzz.

Between the read and the cancel a workflow can reach a final status on its own.
That is harmless: cancelling a finished workflow is a server-side no-op, and it
does not delete a succeeded workflow's outputs.

## Buzz transactions for one workflow

The workflow read often returns the orchestrator's own money record for that
one workflow. When it does, `civitai workflows get <id>` prints it — at any
status — and so does `civitai generate` when a run it waited on ends `failed`,
`expired` or `canceled`, or when a `succeeded` run had outputs excluded:

```
Buzz transactions for this workflow (2 recorded)
  debit   8
  credit  8
  net     0
```

**These are entries the server returned, not a rule the CLI is asserting.** The
block reports what is recorded against *this* workflow id and nothing more —
`net` is simply `debit` minus `credit` over the rows above it. It is **not**
your account balance (`civitai buzz` reports that), it is **not** your account
transaction history, and it does not tell you what a failure or a cancel does
in general.

Where the payload carries no record, the CLI says so and points you at your
[transaction history](https://civitai.com/user/transactions) instead. An absent
record is *"nothing to report"*, never *"no money moved"* — and by the same
rule, `net 0` is not a statement that no money moved.

A transaction `type` this build does not recognise makes the net
**unreportable** rather than dropping the entry out of the arithmetic:

```
Buzz transactions for this workflow (3 recorded)
  debit  12  (2 entries)
  hold   3
  net    (not computed)
```

`--json` is unaffected: it has always passed the raw payload through, including
the `transactions` object with every field this CLI does not model.

## Where to go next

- [Generating images from the CLI](./cli-generate) — the money contract and
  every exit code.
- [Scripting the CLI with `--json`](./cli-json) — the output guarantees for
  these commands.
- **Exit codes** — `civitai --help` prints the summary table for every code; the full per-code ledger is in the
  [CLI README](https://github.com/civitai/cli#exit-codes).
