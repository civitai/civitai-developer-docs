---
title: CLI terminal output
description: How the civitai CLI decides whether to colour its output, and what it does to server-supplied text before printing it.
sources:
  - go:github.com/civitai/cli
---

# CLI terminal output

Two things decide what the [`civitai` CLI](./cli) puts on your screen: whether
styling is on, and what the human renderers do with text a server or another
user supplied. Neither applies to `--json`.

## The global flags, and one that is not

`--no-color`, `--color`, `--no-update-check` and `-h` / `--help` are accepted by
**every** command — `civitai --help` lists them all. `-v` / `--version` is
**root-only**: `civitai --version` prints the version, but on a subcommand it is
not a flag at all (`civitai app validate --version` fails with
`unknown flag: --version`, exit `2`). From a script use **`civitai version`** —
version, commit and build date — which works from anywhere.

`civitai --help` also prints the [exit-code](https://github.com/civitai/cli#exit-codes)
contract. `--no-update-check` (or `CIVITAI_NO_UPDATE_CHECK`) skips the
background check for a newer release; the nag it suppresses only goes to
**stderr**, so it is about clean logs, not clean stdout (see
[Clean output for pipelines](./cli#clean-output-for-pipelines)).

## Colour is off by default whenever stdout is not a TTY

A redirected or piped run already emits plain text with **no escape
sequences**. To override that, the precedence is, highest first:

1. `--no-color` / `NO_COLOR` / `CIVITAI_NO_COLOR` → **off**
2. `--color` / `CLICOLOR_FORCE` / `CIVITAI_COLOR` → **on**
3. `TERM=dumb` → **off**
4. otherwise: **auto** — on if the stream being written to is a TTY, off if it
   is not

**Off always beats on**, so a `NO_COLOR` in the environment cannot be
re-enabled by a `--color` further down a pipeline. `TERM=dumb` sits *below*
force-on, so `CLICOLOR_FORCE=1` in a `TERM=dumb` shell still styles. Auto is
resolved **per stream**: one run can write plain text to a piped stdout and
styled text to a TTY stderr. The force tiers apply to both.

## The `CIVITAI_*` variables are parsed as BOOLEANS

::: warning `CIVITAI_NO_COLOR` is not a drop-in for `NO_COLOR`
It parses its value, and **silently ignores anything it cannot parse**.
:::

`NO_COLOR` and `CLICOLOR_FORCE` are presence tests; `CIVITAI_NO_COLOR` and
`CIVITAI_COLOR` go through the CLI's config layer and are read as **booleans**.

| Variable | What counts |
| --- | --- |
| `NO_COLOR` | [no-color.org](https://no-color.org): **present and non-empty**, whatever the value — so even `NO_COLOR=0` disables colour |
| `CLICOLOR_FORCE` | present, non-empty and **not** `0` |
| `CIVITAI_NO_COLOR`, `CIVITAI_COLOR` | a **boolean**: only twelve spellings mean anything |

The twelve spellings are `1`, `t`, `T`, `TRUE`, `true`, `True` (on) and `0`,
`f`, `F`, `FALSE`, `false`, `False` (off). Anything else — `yes`, `on`, `y`,
`enabled`, `2`, an empty string — parses as **false** with no warning. So
`CIVITAI_NO_COLOR=yes` does **not** disable colour, `CIVITAI_NO_COLOR=1` does,
and `CIVITAI_NO_COLOR=0` leaves colour alone — **unlike `NO_COLOR=0`**, which
disables it. **When in doubt use `1`, or the plain `NO_COLOR` spelling.**

## What a table cell can contain {#what-a-table-cell-can-contain}

Almost every value in a human table — a model name, a username, a tag, a
workflow status, a block id — is text a stranger uploaded or a server chose.
The human renderers put all of it through one gate:

- **Terminal escapes and invisible characters are removed**, so a hostile value
  cannot overwrite a line the CLI already printed or reorder what you read.
- **A table cell is one line and one column.** A newline or tab in a
  server-supplied cell value becomes a space.
- **Genuinely multi-line text keeps its line breaks**, indented under the line
  that introduced it, so a continuation never sits at column zero.
- **Two values are cut at 120 characters**: the download progress line and
  `generate`'s `could not read your Buzz balance` warning. Nothing else is
  shortened.
- **What you typed splits by value, not by screen.** Your prompt, negative
  prompt, `--aspect-ratio`, `--ecosystem` and the ids you give `workflows
  cancel` never go through the gate. Paths you name are shown
  exactly on the confirmation screen before a spend, but filtered in several
  other lines that report a path.

::: details The full rules: which characters, which fields, which limits

**Which characters are stripped.** Escape and control bytes (cursor moves, line
clears, OSC sequences), plus every character Unicode marks
**default-ignorable** — zero-width spaces and joiners, the bidi overrides that
reverse the order a line is *displayed* in, the variation selectors (except the
one that keeps an emoji looking like an emoji) — plus two runes that paint
nothing while Unicode files them as a symbol and a mark, and four Hangul
*fillers* that paint nothing while Unicode files them as letters. Punctuation,
accents, CJK, emoji, ordinary letters and right-to-left *script* survive, as do
the format characters Unicode says must be drawn. `U+2028` / `U+2029` are passed
through (no terminal is known to break lines on them).

The strip is not free. Each removed character is invisible on its own, but some
change how their **neighbours** are drawn: an emoji built from a zero-width
joiner renders as its components, a subdivision flag falls back to 🏴, and text
that uses the join controls to make a distinction loses it — Persian/Arabic
(`می‌روم` renders joined), Malayalam (the chillu `ണ്‍` becomes `ണ്`, a different
letter), Devanagari, Bengali, Tamil, Kannada, Sinhala and Mongolian.

**Values you supplied.** The promise splits by **value**, not by screen. Your
prompt, your negative prompt, `--aspect-ratio`, `--ecosystem` and the ids you
give `workflows cancel` never go through the gate. **The
paths you name are different:** they are echoed exactly on the **confirmation
screen before a spend**, which has to show what will really be sent, and
filtered in several of the lines that report a path elsewhere. Some other values
you supply are filtered too, and no surface enumerates the set — these are the
known cases, not its boundary:

1. a value read out of an `--input` **file** is filtered like server text,
   because a graph file can be downloaded or generated;
2. `civitai download` filters the target path it reports **even when you set it
   with `--out`**, because the same variable holds a **server**-chosen file name
   in its other branches;
3. `civitai download` also filters the values you give `--root` and
   `--for-base`, in the lines that report them.

The quote `civitai generate --dry-run` prints is **not** the confirmation
screen: it prints `<not checked by --dry-run>` in place of **both** prompt rows,
because the estimate is priced on a graph with that text removed. Do not read
one as a preview of the other.

**Which fields are flattened to one line.** Every server-supplied value in a
rendered table cell — `models search`, `images search`, `app status`,
`workflows list`, the pre-spend cost table, and the rest. A newline would start
a line at column zero that looks like a CLI row; a tab would add an extra,
aligned column. Single-line `label: value` fields are flattened the same way:
`images … --meta`'s model, sampler, seed, resources, cfg, steps and url;
`app status --id`'s live URL and block id; `app listing status`'s screenshot ids
and captions; the `--no-wait` re-attach hint; and `generate`'s wait-path lines
(the submit receipt, the poll's status line, the server's message when a status
check fails and is retried, and the re-attach block printed when a wait ends
without a result). That list is **illustrative, not exhaustive**. Other one-off
detail lines — the header block above `models get`'s version table,
`collections get`, `app view` — have escapes stripped but **may still carry a
newline**.

**Which surfaces keep line breaks.** Five: the generation prompt and negative
prompt (`images … --meta`), the orchestrator's failure reason (`workflows get`
and `workflows list`), the same reason on `generate`'s error path, per-output
exclusion reasons (`generate`), and the reviewer's rejection reason / approval
notes (`app status --id`). If a field you expect to be multi-line arrives on one
line, it was in a cell.

**Why two values are shortened.** The progress line and the balance warning sit
directly above something the CLI asserts — a `Saved … (SHA256 verified)` line,
and the `Cost: … Buzz` line you approve a spend on — and a value long enough to
wrap could write extra rows that read as the CLI's own. The cut is marked `…`.
The `Saved …` line, the download plan and every table cell print values in
full.

**Known limits.** The CLI never asks how wide your terminal is. Shortening
bounds **how many** rows a value takes, not whether one starts at column zero,
and the 120-character budget counts **characters, not columns**, so wide (CJK)
text takes twice the space. Every other long value can soft-wrap to column
zero, and one hostile value widens a column for every row. Only
`workflows list` wraps its reason text, to a fixed budget of **79 columns**, of
which the server's text gets **75** (each line has a four-space indent) — so a
77-rune reason wraps. Wrapping collapses whitespace runs and breaks a token
longer than the line, but **drops no words**; in a narrower terminal, or with
wide characters, the terminal re-wraps and can still reach column zero.
Generation prompts are deliberately **not** soft-wrapped, because collapsing
whitespace or splitting tokens would alter prompt weights and syntax.
:::

## `--json` is never styled or sanitised {#json-is-never-styled}

::: danger A script that renders server strings onto a terminal must sanitise them itself
`--json` bypasses the presentation layer entirely, at **any** colour setting,
so it is always safe to pipe into `jq`. It is also emitted **raw** — JSON
already escapes control characters, and rewriting the bytes would corrupt what
a script parses — so none of the guarantees above apply to it.
:::

Two adjacent transforms are documented elsewhere:
[the control-byte repair](./cli-json#it-passes-through-the-document-not-the-bytes)
that changes a read body's bytes but not its document, and
[a server-side sanitiser](./cli-workflows#the-two-commands-can-word-the-same-failure-differently)
that rewrites a failure message before the CLI sees it. The CLI reproduces
neither.

## Where to go next

- [CLI](./cli) — installing the binary, and the read and download commands.
- [CLI troubleshooting](./cli-troubleshooting) — look up the message you got.
- [Scripting the CLI with `--json`](./cli-json) — what the machine-readable
  output guarantees.
- **Exit codes** — the full per-code ledger is in the
  [CLI README](https://github.com/civitai/cli#exit-codes).
