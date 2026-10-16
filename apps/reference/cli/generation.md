---
title: "Generation commands"
description: "Run generations and manage workflows. These spend Buzz. Part of the CLI reference."
outline: [2, 4]
---

<!-- GENERATED PAGE — do not edit by hand. Written by `npm run gen:appblocks:md` (scripts/appblocks-md.mjs); which entry lives on which page is decided in .vitepress/theme/components/referenceSplit.shared.mjs. -->

# Generation commands

Run generations and manage workflows. These spend Buzz.

This page documents 5 of the 64 commands in the [CLI reference](../cli), which indexes every command by name. Generated from the `civitai` binary's own help output.

Other pages: [civitai app — authoring commands](./app) · [civitai app listing — store listing commands](./app-listing) · [Catalog and download commands](./catalog) · [Account, setup and utility commands](./account-and-setup)

<CliReference group="generation">
<!-- BEGIN GENERATED: cli/generation — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`civitai generate [prompt]`**

Generate images from a text prompt (SPENDS BUZZ)

```text
Generate images from a text prompt on Civitai's generator.

🔴 THIS SPENDS REAL BUZZ AND CANNOT BE UNDONE. A submitted generation is charged
the moment the orchestrator accepts it, and nothing local calls that back —
neither --timeout nor Ctrl-C stops the job, and `civitai workflows cancel` stops
the remaining work rather than reversing the charge. Preview the price with
--dry-run first; it calls the server's cost estimator and spends nothing.
What the LEDGER then does with that charge — if the run fails, expires, or you
cancel it — is decided server-side, and this CLI cannot see your Buzz ledger — `civitai buzz` reports a balance, not a history, so settle it against your Buzz transaction history (/user/transactions).

CREDENTIAL: generation needs the AI Services scopes. Two credentials carry them:
`civitai login --scopes generate` (a browser login that opts into generation), or a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account). A DEFAULT OAuth browser login
(`civitai login` with no --scopes) does NOT carry them and is refused — and
re-running plain `civitai login` will not fix that. Check yours with
`civitai whoami`.
The ONE exception is --print-input: it assembles the graph and exits before the
estimator, the submit and the balance read, so it needs no credential. Two
caveats, and they are NOT the same caveat. With --image it does need one, because
it uploads each local file first and that upload is authenticated. With
--checkpoint or --lora it still needs none — the model-version lookup is a public
read — but it is not OFFLINE: that lookup is a real request and fails without a
network. Only a bare --print-input needs neither a credential nor a network.

--max-cost IS AN ESTIMATE CHECK, NOT A SPENDING CAP. The cost this command shows
is an estimate, not a quote: the server's estimator returns no quote id, no
signed price and no expiry — there is nothing to hand back at submit time, and
no server-side ceiling is reachable from an API key at all. The realized charge
can exceed the estimate, and --max-cost cannot claw the difference back — it
never reaches the server. --max-cost compares the
ESTIMATE against your number and refuses locally before submitting; it catches a
--quantity typo, and that is all it can do. Do not run an unattended loop
believing it caps spend.

CONFIRMATION: an interactive run prints the estimate and your balance and asks
before spending. A non-interactive shell (pipe/CI) without --yes is REFUSED
rather than charged silently.

WHAT THE SERVER DOES NOT TELL YOU: the generator is permissive, not a validator.
An out-of-range --quantity is clamped with no error, and a checkpoint id that
does not exist is accepted with the ecosystem default silently substituted and
billed. This command therefore resolves every --checkpoint / --lora id against
the public model-version API BEFORE submitting, so a bad id is a hard local
error instead of a wrong charge, and it echoes the resolved model NAME in the
confirmation so you approve a name rather than an integer.

🔴 NAMING A CHECKPOINT DOES NOT MOVE THE ECOSYSTEM WITH IT. --checkpoint selects
a model version and nothing else. The settings the server generates with —
engine, steps, cfg scale, sampler — follow the ECOSYSTEM (--ecosystem, or the
server's default when you pass none), not the checkpoint you named, and there is
no --steps or --cfg-scale here to correct them (see RAW GRAPHS below). A
checkpoint paired with an ecosystem it does not belong to is refused by nothing —
not by this CLI, not by the estimator, not by the generator. The job is accepted
and charged, and it can finish having produced no usable output. The
model-version lookup above proves the id EXISTS, not that it fits, and "Resources
ready" does not answer it either. Which ecosystem a given checkpoint belongs to is
server knowledge this CLI does not hold and will not guess: if you name a
checkpoint, name the --ecosystem it belongs to as well.

🔴 --dry-run's "Resources ready" line is NOT A PROMISE OF OUTPUT. It echoes the
server's `ready` flag, which reports only that the resources this job needs are
currently available — nothing about moderation, and nothing about whether the
job will actually produce an image. A run that reports resources ready can still
be charged and return nothing. Treat `ready: false` as "do not submit"; do not
read `ready: true` as a green light.

WAITING AND DOWNLOADING: by default the command waits for the job to finish and
writes every deliverable output into --out-dir as <workflow-id>-<n>.<ext>.
--out-name <template> names them instead: {workflow}, {n} (1-based) and {ext}
(with its leading dot) expand, everything else is literal. The rendered value
must be a plain file name inside --out-dir — a path separator or ".." is REFUSED,
not stripped — and the template is checked before anything is submitted, so a bad
one costs nothing. A template that would give two outputs the same name is
refused before any byte is downloaded rather than overwriting your own results,
so include {n} for a batch. Pass --no-wait to print the workflow id and exit
immediately, and pick the results up later with
`civitai workflows get <workflow-id>`. Output URLs are PRESIGNED AND EXPIRE, so
download promptly; re-read the workflow for fresh links.

🔴 --timeout STOPS WAITING. IT DOES NOT STOP THE JOB. The generation keeps
running server-side after the CLI gives up, and finishes and bills exactly as if
you had stayed. The same is true of Ctrl-C. Both print the workflow id and the
exact command to re-attach; `civitai workflows cancel` is the only thing that
stops the remaining work.

CRASH SAFETY: the idempotency key is written to a local file BEFORE the request
is sent, because the money moves server-side even if this process dies mid-POST.
If a submit's reply never arrives, re-run with --external-id <the recorded key>:
the orchestrator dedupes on it and returns the PRE-EXISTING workflow instead of
charging a second time.

IMAGE-TO-IMAGE: --image <file-or-url> attaches a reference image (repeatable).
A local png/jpeg is uploaded to Civitai first and the stored blob is referenced;
an https URL is passed through as-is, but must be publicly reachable, because the
generator downloads it server-side too. Either way the CLI reads the image's
width and height from its header and sends them — the server requires both and
rejects an entry without them.

🔴 --image REQUIRES --ecosystem, and the reason is money. The server turns a
text-to-image job into image-to-image only when the request names an ecosystem;
without one it ignores the images, generates from the prompt alone, and charges
you the full amount with no error. Worse, only SOME ecosystems accept reference
images at all (Qwen, Flux1Kontext, NanoBanana, Seedream, OpenAI, Grok and a few
more do; the SD family and the default do not) — and the cost estimate cannot
tell you which case you are in, because several edit-capable ecosystems price
identically with and without images. Name an ecosystem you know supports editing.

🔴 The server SILENTLY TRUNCATES too many reference images. Per-ecosystem limits
run from 1 to 7 and are not knowable from here; over the limit the extras are
dropped with no error and the truncated job is billed. The CLI refuses more than
7 (no ecosystem accepts more) and warns for anything above 1.

RAW GRAPHS: --input <file> (or --input -) sends a generation-graph JSON document
exactly as written, instead of building one from the flags above. It is how you
reach graph parameters this CLI has no flag for — seed, steps, cfgScale and
sampler among them. None of the four has a flag today, and for steps and cfgScale
that is deliberate: the server ACCEPTS a zero for either, prices the degenerate
job cheaper, and bills it, so a flag whose unset value could reach the request
would buy a broken run at a discount. In a graph file they are yours to set and
yours to get right — a seed set there is what makes a run reproducible — and
nothing in that file is checked, defaulted or completed by this CLI. Get a valid
starting point with --print-input, which assembles the graph, prints it, and
exits without submitting or even pricing anything.

--input is txt2img only in this release. It cannot be combined with the content
flags (--negative-prompt, --quantity, --aspect-ratio, --checkpoint, --lora) or
with a prompt argument; the execution flags all still apply. Keys that belong to
the request ENVELOPE rather than the graph — civitaiTip, creatorTip, buzzType,
tags, externalId — are REFUSED in an input file: they are this CLI's to set, and
a tip in particular is real Buzz that --dry-run structurally cannot see. Keys
this CLI does not model are passed through exactly as written, with a warning
that says so and nothing more: what the server does with such a key, including
what it costs, is the server's answer and not this CLI's to predict. --dry-run
prices the graph with those keys included, so it is where a price effect would
show.

🔴 --input DOES NOT get the model-id safety net. --checkpoint and --lora are
resolved against the public API before submitting, so a bad id fails locally
instead of being billed with a substituted model; a raw graph is not
interpreted, so nothing in it is checked before you pay for it.

🔴 --fail-on-substitution STAYS LIVE with --input, but its COVERAGE is unknown
to this CLI. It refuses on the substitution record the estimate returns, so it
still refuses before any spend — but a raw graph is not interpreted here, so
nothing local knows which model references the file contains or which of them a
record would name. One measured case (a checkpoint under "resources") was
charged and ran a different version with no record at all. Read a silent run as
"nothing was reported", never as "nothing was substituted"; --checkpoint is the
path that resolves model ids before anything is submitted.
```

```bash
  # Preview the price — spends nothing
  civitai generate "a cat wearing sunglasses" --dry-run

  # The same estimate as JSON, for scripts
  civitai generate "a cat wearing sunglasses" --dry-run --json

  # Generate 4 images, refusing if the estimate exceeds 50 Buzz
  civitai generate "a cat wearing sunglasses" --quantity 4 --max-cost 50

  # Image-to-image from a local file — --ecosystem is required
  civitai generate "make it winter" --ecosystem Flux1Kontext --image ./cat.png --dry-run

  # …or from a public URL, with two reference images
  civitai generate "combine these" --ecosystem Seedream \
    --image https://example.com/a.jpg --image ./b.png --yes

  # Your own checkpoint (a VERSION id) plus a LoRA at 0.8 strength. A checkpoint
  # does NOT bring its settings with it — steps, cfg scale and sampler follow the
  # ecosystem — so name the ecosystem that checkpoint belongs to. Which one that
  # is, is yours to know: nothing here checks the pair, and a mismatch is charged.
  civitai generate "a cat" --ecosystem <key> --checkpoint <version-id> \
    --lora <version-id>:0.8 --dry-run

  # Wait, and write the images into ./out
  civitai generate "a cat" --yes --out-dir ./out

  # …naming the files yourself — {n} keeps a batch from colliding
  civitai generate "a cat" --yes --quantity 4 --out-dir ./out --out-name 'cat-{n}{ext}'

  # Fire and forget; collect the results later
  civitai generate "a cat" --yes --no-wait
  civitai workflows get <workflow-id>

  # Non-interactive (CI): --yes is required, or the run is refused
  civitai generate "a cat" --yes --max-cost 20

  # Graduate from flags to a raw graph: print, edit, send back
  civitai generate "a cat" --quantity 2 --print-input > graph.json
  civitai generate --input graph.json --dry-run
  civitai generate --input graph.json --yes

  # …or pipe it straight through
  jq '.prompt = "a dog"' graph.json | civitai generate --input - --dry-run

  # …which is also the only way to set a seed, steps, cfgScale or sampler —
  # there is no flag for any of them.
  jq '.seed = 12345' graph.json | civitai generate --input - --yes
```

| Flag | Description | Default |
|---|---|---|
| `--aspect-ratio string` | aspect ratio bucket, e.g. 1:1 (width/height derive from it) | — |
| `--checkpoint int` | checkpoint model-VERSION id (not a model id) — resolved before submitting | — |
| `--dry-run` | print the cost estimate and exit without submitting (spends nothing) | — |
| `--ecosystem string` | model family to generate with, e.g. Qwen or Flux1Kontext. Sent to the server verbatim and NOT checked locally; required with --image because the server only promotes a job to image-to-image when the ecosystem is stated | — |
| `--external-id string` | re-attach to an earlier submit by reusing its idempotency key (the orchestrator dedupes on it and returns the PRE-EXISTING workflow rather than charging again). Use the key recorded before the lost submit | — |
| `--fail-on-substitution` | refuse to submit if the server REPORTS it substituted a different checkpoint for the one you asked for. Checked against the ESTIMATE, so nothing is spent when it refuses. Off by default: the server substitutes deliberately so that a script pinned to a retired version keeps working. NOT A GUARANTEE: a server that does not report substitutions makes this flag silently inert, so it cannot be relied on as a spend guard against an older deployment. With --input it stays live but its COVERAGE is unknown to this CLI: a raw graph is not interpreted, so a silent run means 'nothing was reported', never 'nothing was substituted' | — |
| `--force` | overwrite existing output files instead of refusing | — |
| `--image stringArray` | reference image for image-to-image: a local file (png or jpeg, uploaded) or an https URL (passed through). Repeatable. Requires --ecosystem, and only some ecosystems accept reference images at all | — |
| `--input string` | read the generation graph from a JSON file ('-' for stdin) and send it as-is, instead of building one from flags. txt2img only. Cannot be combined with the content flags above | — |
| `--json` | emit the raw server payload on stdout (scriptable) | — |
| `--lora stringArray` | LoRA model-version id, optionally :strength (e.g. 250712:0.8). Repeatable | — |
| `--max-cost int` | refuse to submit if the ESTIMATE exceeds this many Buzz. This is an estimate check, NOT a spending cap: the estimate is not binding, the server enforces no ceiling, and the realized charge can be higher — this flag cannot claw that back | — |
| `--negative-prompt string` | negative prompt | — |
| `--no-download` | wait for the result and print the output URLs, but write no files | — |
| `--no-wait` | submit, print the workflow id and exit without waiting; collect the results later with 'civitai workflows get \<id>' | — |
| `--out-dir string` | directory to write the generated files into (created if needed); named \<workflow-id>-\<n>.\<ext> unless --out-name says otherwise | `.` |
| `--out-name string` | template for each output's file name inside --out-dir, e.g. 'img-{n}{ext}'. Placeholders: {workflow} (the workflow id), {n} (1-based output number), {ext} (the extension, WITH its leading dot); everything else is literal. Default '{workflow}-{n}{ext}'. It names a plain file: a path separator or '..' is REFUSED, not stripped, and the template is checked before anything is submitted. A template that would name two outputs the same is refused before anything is downloaded, so include {n} for a batch | — |
| `--print-input` | print the exact generation graph that would be sent and exit without submitting. Redirect it to a file, edit it, and feed it back with --input | — |
| `--quantity int` | number of images to generate (server default when unset; no -n shorthand, it reads as "no") | — |
| `--timeout duration` | how long to WAIT for the generation to finish (e.g. 5m, 0 waits indefinitely). This stops the CLI waiting; it does NOT stop the generation and does NOT stop the charge — the job continues server-side to completion | `30m0s` |
| `-y, --yes` | skip the confirmation and submit (required in a non-interactive shell) | — |

**`civitai workflows`**

List, inspect and cancel generation workflows

```text
Work with the generation workflows your account has submitted.

A workflow is one submitted generation job. `civitai generate` prints a
workflow id; `list` and `get` are how you find one afterwards — which is what
makes `--no-wait`, a --timeout expiry and a Ctrl-C recoverable rather than a
dead end.

`list` and `get` are reads and SPEND NOTHING. 🔴 `cancel` stops a job, and you
stay billed for what it had already delivered — the server re-prices the rest.
```

```bash
  civitai workflows list
  civitai workflows get 01JABCXYZ
  civitai workflows get 01JABCXYZ --json
  civitai workflows cancel 01JABCXYZ
```

**`civitai workflows cancel <workflow-id>`**

Cancel a running generation workflow (you are billed for what it delivered)

```text
Cancel a generation workflow that is still running.

🔴 CANCELLING IS NOT A CLEAN REFUND — AND IT IS NOT A TOTAL LOSS EITHER. Buzz is
charged UP FRONT, when the orchestrator schedules the run. Cancelling stops the
steps that have not finished; the orchestrator then RE-PRICES the workflow
against the work it actually did, and settles the difference against what it
took. What the run already delivered is billed: a step that had already finished
keeps its full cost, and a job a worker has already started and cannot interrupt
runs to completion and is billed for.

So cancel a job because you no longer want its OUTPUT. How much of the charge
that leaves you paying depends on how far the run had got, which you do not
control and cannot see from here — the settlement is server-side, it happens once
the workflow reaches its final state rather than when this command returns, and
this CLI cannot see your Buzz ledger — `civitai buzz` reports a balance, not a history, so settle it against your Buzz transaction history (/user/transactions).

That is also why `civitai generate --timeout` and Ctrl-C do not cancel anything:
they stop the WAIT, not the job. The run keeps going server-side and its outputs
stay yours — pick them up later with `civitai workflows get <workflow-id>`.

Cancelling an already-finished workflow is harmless — it is a no-op server-side,
and the outputs of a succeeded workflow are not deleted by it (use the website to
delete results).

This needs the same AI Services scopes that `civitai generate` needs:
`civitai login --scopes generate` (a browser login that opts into generation), or a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account).

CONFIRMATION: cancelling is IRREVERSIBLE — it throws away whatever the run had
not produced yet — so an interactive run asks first. Pass `--yes` to skip the
prompt in a script; a non-interactive shell without `--yes` REFUSES rather than
cancelling silently.

UNKNOWN IDS ARE REFUSED, NOT REPORTED AS CANCELLED. The cancel procedure answers
the same empty success for an id the server has never heard of as for a real one,
so this command reads the workflow back first: an id the server does not know
exits 4 and no cancel request is sent. If that read fails for any OTHER reason —
a timeout, a 5xx, a rate limit — the cancel is still sent, because a flaky read
must never be what stops you halting a job that is spending your Buzz.
```

```bash
  civitai workflows cancel 01JABCXYZ
  civitai workflows cancel 01JABCXYZ --yes
  civitai workflows cancel 01JABCXYZ --json --yes
```

| Flag | Description | Default |
|---|---|---|
| `--json` | emit the raw server reply on stdout (scriptable) | — |
| `-y, --yes` | skip the confirmation prompt and cancel (for scripts/CI) | — |

**`civitai workflows get <workflow-id>`**

Show one generation workflow and its outputs

```text
Show one generation workflow: its status, its steps, and its outputs.

Use it to re-attach to a job you did not wait for — after `--no-wait`, after a
--timeout expiry, or after Ctrl-C. The workflow id is printed by
`civitai generate` in all three cases.

OUTPUT URLS ARE PRESIGNED AND EXPIRE. The links this prints are short-lived;
fetch them promptly or re-run this command for fresh ones.

Outputs that are blocked by moderation, not available, or hidden are listed with
the reason rather than omitted — a finished workflow can legitimately contain
fewer usable results than it was charged for, and silently dropping them would
make that invisible.

Reading a workflow SPENDS NOTHING. It needs the same AI Services scopes that
`civitai generate` needs: `civitai login --scopes generate` (a browser login that opts into generation), or a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account).
```

```bash
  civitai workflows get 01JABCXYZ
  civitai workflows get 01JABCXYZ --json
```

| Flag | Description | Default |
|---|---|---|
| `--json` | emit the raw server payload on stdout (scriptable) | — |

**`civitai workflows list`**

List the generation workflows you have submitted

```text
List your own generation workflows, newest first.

This is the feed behind the website's generator queue: one entry per submitted
job, with its status, when it was created, what it cost and how many outputs it
produced.

PAGING is by cursor, not page number. --limit sets the page size; when more
results exist the command prints the next cursor, which you pass back as
--cursor to fetch the following page. Deep pages are not cached server-side, so
walk them at a civil pace.

Each row reports outputs as "<deliverable>/<total>". They differ when an output
was blocked by moderation, never landed, or was hidden on the website — a
workflow you were charged for can legitimately have fewer usable results than it
produced, and collapsing the two numbers would hide that. Use
`civitai workflows get <id>` for the per-output reasons and the URLs.

WHERE THE SERVER RECORDED AN ACCOUNT of what happened to a workflow, it is
printed on indented lines under that workflow's row, in the server's own words
and in full. Not every workflow has one; nothing is printed for those.

Reading SPENDS NOTHING. It needs the same AI Services scopes that
`civitai generate` needs: `civitai login --scopes generate` (a browser login that opts into generation), or a full-scope personal API key (`civitai login --token <key>`, created at https://civitai.com/user/account).
```

```bash
  civitai workflows list
  civitai workflows list --limit 5
  civitai workflows list --limit 50 --cursor <next-cursor>
  civitai workflows list --json
```

| Flag | Description | Default |
|---|---|---|
| `--cursor string` | opaque cursor from a previous page's next-cursor line | — |
| `--json` | emit the raw server payload on stdout (scriptable) | — |
| `--limit int` | how many workflows to fetch in this page (server default when unset) | — |
| `--tag stringArray` | only list workflows carrying this orchestrator tag. Repeatable | — |

<!-- END GENERATED: cli/generation -->
</CliReference>
