---
title: CLI terminal output
description: How the civitai CLI decides whether to colour its output, why the CIVITAI_* colour variables are parsed as booleans and the standard ones are not, and what the human renderers guarantee about server-supplied text — escapes stripped, table cells flattened to one line, two values shortened at 120 characters, and none of it applied to --json.
sources:
  - go:github.com/civitai/cli
---

# CLI terminal output

Two things decide what the [`civitai` CLI](./cli) puts on your screen: whether
styling is on, and what the human renderers are allowed to do with text a
**stranger uploaded**. Both matter in a pipeline, and neither applies to
`--json`.

::: tip This page is about behaviour, not about the flag list
The complete, always-current global flag list is generated from the binary's own
`--help` output — see
[Global flags](/apps/reference/cli#cli-global-flags) in the generated CLI
reference, or run `civitai --help`. What is below is what those flags *do*,
which the generated list cannot tell you.
:::

## Four global flags, and one that is not

`--no-color`, `--color`, `--no-update-check` and `-h` / `--help` are accepted by
**every** command. `-v` / `--version` is the exception — it is **root-only**:

- `civitai --version` prints the version and exits.
- On a subcommand it is **not a flag at all**. `civitai app validate --version`
  fails with `unknown flag: --version` and exits `2`.
- From a script, use **`civitai version`** — version, commit and build date —
  which works from anywhere.

`civitai --help` also prints the [exit-code](https://github.com/civitai/cli#exit-codes)
contract. `--no-update-check` skips the background check for a newer release,
and is also settable as `CIVITAI_NO_UPDATE_CHECK`; the nag it suppresses only
ever goes to **stderr**, so silencing it is about clean logs rather than clean
stdout (see
[Clean output for pipelines](./cli#clean-output-for-pipelines)).

## Colour is off by default whenever stdout is not a TTY

A redirected or piped run already emits plain text with **no escape
sequences** — you do not have to ask for anything. When you do want to override
that, the precedence is fixed. Highest first:

1. `--no-color` / `NO_COLOR` / `CIVITAI_NO_COLOR` → **off**
2. `--color` / `CLICOLOR_FORCE` / `CIVITAI_COLOR` → **on**
3. `TERM=dumb` → **off**
4. otherwise: **auto** — on if the stream being written to is a TTY, off if it
   is not

**Off always beats on**, so a `NO_COLOR` in the environment cannot be
re-enabled by a `--color` further down a pipeline. `TERM=dumb` sits *below*
force-on, so `CLICOLOR_FORCE=1` in a `TERM=dumb` shell still styles.

::: tip Auto is resolved per writer, not once per process
Tier 4 asks whether **that stream** is a terminal, so one run can write plain
text to a piped stdout and styled text to a TTY stderr at the same time. The
force tiers are absolute and apply to both.
:::

## The `CIVITAI_*` variables are parsed as BOOLEANS

::: warning `CIVITAI_NO_COLOR` is not a drop-in for `NO_COLOR`
It parses its value, and **silently ignores anything it cannot parse**.
:::

The two pairs read their environment through different code, and that is why
they behave differently. `NO_COLOR` and `CLICOLOR_FORCE` are read directly as
presence tests; `CIVITAI_NO_COLOR` and `CIVITAI_COLOR` are bound into the CLI's
config layer and read as **booleans**.

| Variable | What counts |
| --- | --- |
| `NO_COLOR` | [no-color.org](https://no-color.org): **present and non-empty**, whatever the value — so even `NO_COLOR=0` disables colour |
| `CLICOLOR_FORCE` | present, non-empty and **not** `0` |
| `CIVITAI_NO_COLOR`, `CIVITAI_COLOR` | a **boolean**: only twelve spellings mean anything |

The twelve spellings are `1`, `t`, `T`, `TRUE`, `true`, `True` (on) and `0`,
`f`, `F`, `FALSE`, `false`, `False` (off). Anything else — `yes`, `on`, `y`,
`enabled`, `2`, an empty string — parses as **false** and does nothing at all,
with no warning:

- `CIVITAI_NO_COLOR=yes` does **not** disable colour.
- `CIVITAI_NO_COLOR=1` does.
- `CIVITAI_NO_COLOR=0` is a real *false* that leaves colour alone — **unlike
  `NO_COLOR=0`**, where the same value disables it.

**When in doubt use `1`, or the plain `NO_COLOR` spelling.**

## `--json` is never styled

::: danger `--json` bypasses the presentation layer entirely
At **any** of the settings above. It is written without passing through the
presentation layer at all, so `--json` is always safe to pipe into `jq`
regardless of how colour is configured or whether a TTY is attached.
:::

## What a table cell can contain {#what-a-table-cell-can-contain}

Almost every value the CLI prints in a human table — a model name, a username, a
tag, a workflow status, a submission's block id — is **text a stranger uploaded**
or that a server chose. The human renderers put all of it through one gate before
it reaches your terminal, and this is what that gate promises.

### Terminal escapes are removed

Cursor moves, line clears, OSC sequences and the invisible /
direction-reversing characters are stripped from the server-supplied strings the
human renderers print, so a hostile value cannot overwrite a line the CLI
already printed or reorder what you read.

What the CLI prints from what **you** typed — a prompt, a path, a flag value —
is echoed byte-for-byte and is deliberately *not* rewritten.

### A table cell is one line, and one column

Every **server-supplied** value that reaches a cell of a rendered table —
`models search`, `images search`, `app status`, `workflows list`, the pre-spend
cost table, and the rest — has any newline or tab in it replaced by a **space**.

A newline would otherwise start a line at column zero, where it is
indistinguishable from a row the CLI wrote; a tab is the column separator, so it
would add an extra, perfectly aligned column. Both read as real output, which is
why the value is flattened rather than trusted.

### `label: value` lines are a narrower promise

The single-line metadata fields are flattened the same way:

- `images … --meta`'s model / sampler / seed / resources
- `app status --id`'s live URL and block id
- `app listing status`'s screenshot ids and captions
- the `--no-wait` re-attach hint
- `generate`'s wait-path lines — the submit receipt, the status line the poll
  prints or redraws, the server's own message when a status check fails and is
  retried, and the re-attach block printed when a wait ends without a result

Other one-off detail lines **outside** a table (for example the header block
above `models get`'s version table, `collections get`, `app view`) have their
escapes stripped but **may still carry a newline**, so a hostile value there can
start a line at column zero. Telling a genuinely single-line field from
legitimately multi-line free text is a per-field judgement.

::: warning The list above is illustrative, not exhaustive
More fields are flattened than it names — `images … --meta`'s cfg, steps and url
among them. Treat it as "these definitely are", never as "only these are".
:::

### Genuinely multi-line server text keeps its line breaks

It is indented under the line that introduced it, so a continuation can never
sit at column zero. There are **five** such surfaces:

1. the generation prompt and negative prompt (`images … --meta`)
2. the orchestrator's failure reason (`workflows get` and `workflows list`)
3. the same reason on `generate`'s **error** path
4. per-output exclusion reasons (`generate`)
5. the reviewer's rejection reason / approval notes (`app status --id`)

**If a field you expect to be multi-line arrives on one line, it was in a cell.**

### Two values are shortened, and the rest are not

The download **progress line** and `generate`'s
**`could not read your Buzz balance`** warning cut the server's text at **120
characters** and mark the cut with a `…`.

Both sit directly above something the CLI itself asserts — a
`Saved … (SHA256 verified)` line, and the `Cost: … Buzz` line you approve a
spend on — and a value long enough to wrap lets the server write extra rows of
your terminal that read as the CLI's own, with no invisible character involved.

Nothing else is shortened: the `Saved …` line, the download plan and every table
cell still print the value in full.

### Known limits

Shortening bounds **how many** rows a value can take, not whether one of them
starts at column zero — the CLI never asks how wide your terminal is, so it
cannot know where a line breaks. The 120-character budget counts
**characters, not screen columns**, so wide (CJK) text takes twice the space it
accounts for.

Every **other** long value is not shortened at all, so your terminal can still
soft-wrap it to column zero, and one hostile value widens a column for every
row.

Only `workflows list` wraps its reason text to a fixed budget; the other
multi-line surfaces do not — and that budget is a **fixed 79 columns**, never a
question about how wide your terminal is. Wrapping collapses runs of whitespace
and breaks a token longer than the line, but **no words are dropped**; in a
*narrower* terminal, or with wide (CJK) characters, your terminal re-wraps and
the overflow can still reach column zero.

Generation prompts are the deliberate opposite: they are **not** soft-wrapped at
all, because collapsing whitespace runs and splitting tokens would alter prompt
weights and syntax, so in a narrow terminal the terminal's own soft-wrap is what
reaches column zero there. `U+2028` / `U+2029` are passed through (no terminal
is known to break lines on them).

## None of this applies to `--json`

::: danger A script that renders server strings onto a terminal must sanitise them itself
`--json` is emitted **raw**, because JSON already escapes control characters and
rewriting the bytes would corrupt what a script parses. Every guarantee above is
about the **human** output only.
:::

Two adjacent contracts are worth reading beside this one, because they are about
different transforms:

- [`--json` passes through the document, not the bytes](./cli-json#it-passes-through-the-document-not-the-bytes)
  — the control-byte repair that changes the bytes of a read body without
  changing the document, and what an `unexpected response from …` error snippet
  is filtered for.
- [The two commands can word the same failure differently](./cli-workflows#the-two-commands-can-word-the-same-failure-differently)
  — a **server-side** sanitiser that rewrites a failure message before the CLI
  ever sees it. The CLI reproduces neither transform.

## Where to go next

- [CLI](./cli) — installing the binary, and the read and download commands.
- [CLI troubleshooting](./cli-troubleshooting) — look up the message you got.
- [Scripting the CLI with `--json`](./cli-json) — what the machine-readable
  output guarantees.
- **Exit codes** — the full per-code ledger is in the
  [CLI README](https://github.com/civitai/cli#exit-codes).
