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

This gives up one-line-per-workflow on purpose: `--json` is the scripting
contract, the table is not. A workflow with no recorded account prints nothing
extra — the absence is the server's, not the CLI's.

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

It is printed whatever the workflow's status. What it is **not**:

- **Not this CLI's opinion.** The text is the server's; nothing classifies it or
  matches it against known messages, so a new message arrives intact.
- **Not byte-for-byte on the terminal.** Escape, control and invisible
  formatting characters are removed first, which can change how some joined
  scripts and ZWJ emoji render — the exact set is in
  [What a table cell can contain](./cli-output#what-a-table-cell-can-contain).
  `--json` is not filtered at all.
- **Not applied to your prompt.** Your prompt, negative prompt and
  `--ecosystem` never go through the filter. Paths you name are exact on the
  confirmation screen before a spend but filtered in some other lines; the
  value-by-value rules are in the same section.
- **Not always there.** Some failures record nothing, and the error then says
  *"the orchestrator often supplies no failure reason, so it may not say why"*.
  That is the server's answer; there is no further detail to look for.
- **Not a statement about your Buzz.** Charges are reported separately — see
  [Buzz transactions for one workflow](#buzz-transactions-for-one-workflow).

### The two commands can word the same failure differently

`workflows list` reads the platform's *normalized* feed, whose server-side
sanitiser prefixes the provider (*"Google Gemini: Could not generate images…"*)
— but also **replaces** any message it cannot vouch for (one carrying a URL, a
path, a stack frame, an infra name, or running past 300 characters or one line)
with a generic *"… reported a system error"*. `workflows get` reads the
orchestrator's raw workflow and applies none of that. So either can be the more
informative: **when a failure is worth chasing, read both.** The CLI reproduces
neither transform.

## Cancelling a workflow

::: danger `cancel` is not a clean refund — and it is not a total loss either
Buzz is charged **up front**, when the orchestrator schedules the run.
Cancelling stops the steps that have not finished; the orchestrator then
**re-prices the workflow against the work it actually did** and settles the
difference. A step that had already finished keeps its full cost, and a job a
worker has already started and cannot interrupt runs to completion and is
billed.

So cancel because you no longer want the *output*. What you end up paying
depends on how far the run got; settlement happens server-side once the
workflow reaches its final state, not when the command returns, and `cancel`
itself reports no figure. (This is also why `--timeout` and Ctrl-C do **not**
cancel: they stop the wait, not the job.)
:::

Once the workflow is final, `civitai workflows get <id>` shows the transactions
the server recorded for it — see
[below](#buzz-transactions-for-one-workflow) — or check your
[transaction history](https://civitai.com/user/transactions).

### The confirmation gate

`cancel` **asks for confirmation**, like `civitai generate` and
`civitai app submit`, because it throws away whatever the run has not produced
yet:

- `--yes` / `-y` proceeds without prompting;
- an interactive terminal prints what is lost and prompts; the default is
  **no**, so a bare Enter aborts;
- a **non-interactive** shell without `--yes` is **refused**.

The gate runs before any request goes out, so a refusal cancels nothing.

### An unknown id is refused, not reported as cancelled

The cancel procedure answers the same empty success for a typo as for a real
workflow, so `cancel` reads the workflow back first. An unknown id exits **`4`**
(as `civitai workflows get` does) and **no cancel request is sent**. If that
read fails for any *other* reason — a timeout, a 5xx, a rate limit, an auth
failure — the cancel **is** still sent, so a flaky read never stops you halting
a job that is spending your Buzz. Cancelling a workflow that finished in the
meantime is a server-side no-op and does not delete a succeeded workflow's
outputs.

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

These are the entries the server recorded against *this* workflow id;
`net` is `debit` minus `credit` over them. It is **not** your account balance
(`civitai buzz` reports that) or your transaction history, and it does not say
what a failure or cancel does in general. Where the payload carries no record,
the CLI says so and points at your
[transaction history](https://civitai.com/user/transactions). Neither an absent
record nor `net 0` means "no money moved".

A transaction `type` this build does not recognise makes the net
**unreportable** rather than dropping the entry out of the arithmetic:

```
Buzz transactions for this workflow (3 recorded)
  debit  12  (2 entries)
  hold   3
  net    (not computed)
```

`--json` passes the raw `transactions` object through, including every field
this CLI does not model.

## Where to go next

- [Generating images from the CLI](./cli-generate) — the money contract and
  every exit code.
- [Scripting the CLI with `--json`](./cli-json) — the output guarantees for
  these commands.
- **Exit codes** — `civitai --help` prints the summary table for every code; the full per-code ledger is in the
  [CLI README](https://github.com/civitai/cli#exit-codes).
