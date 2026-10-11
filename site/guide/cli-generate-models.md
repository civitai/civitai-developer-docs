---
title: Choosing a model, and what the server may run instead
description: How civitai generate's --checkpoint, --ecosystem and --image interact, and how the CLI reports and refuses silent model substitution.
sources:
  - go:github.com/civitai/cli
---

# Choosing a model, and what the server may run instead

`civitai generate` lets you name a checkpoint, LoRAs, an ecosystem and
reference images. Nothing — not this CLI, the cost estimator or the generator —
validates that they are *coherent*. This page covers the gap between what you
asked for and what runs. Everything below can cost Buzz; read
[the money contract](./cli-generate#what-the-cli-can-and-cannot-tell-you-about-a-charge)
first.

## A checkpoint does not carry its ecosystem

`--checkpoint` selects a model **version** and nothing else. The engine,
steps, cfg scale and sampler follow the **ecosystem** (`--ecosystem`, or the
server's default), *not* the checkpoint. There is no `--steps` or
`--cfg-scale`; [Raw generation graphs](./cli-generation-graphs) is the route
that reaches them.

A checkpoint paired with an ecosystem it does not belong to is refused by
**nothing**: the job can be charged, run, and finish `Status: failed` with
**0 deliverable outputs**, even after `--dry-run` reported
`Resources ready: true`. The model-version lookup proves the id **exists**, not
that it **fits**, and `Resources ready` reports availability, not coherence
([not a promise of output](./cli-json#ready-is-one-directional)).

::: warning Which ecosystem a checkpoint belongs to is server knowledge
The CLI does not hold it and will not guess — a vendored copy would go stale
and start refusing valid *new* inputs — so there is no list of valid
`--ecosystem` values here. `--ecosystem` is sent **verbatim**; an unknown value
comes back as the server's own `unknown ecosystem` error.

**If you name a checkpoint, name the `--ecosystem` it belongs to as well.**
:::

## Silent model substitution

If you pass a `--checkpoint` version id that is not valid for the model family
being generated, the server does **not** reject it. It substitutes that
family's default checkpoint, runs the job, and bills you for **what actually
ran**.

The server reports each swap, and `civitai generate` surfaces it:

```console
$ civitai generate "a cat" --ecosystem Flux1Kontext --checkpoint 128713 --dry-run
⚠ The server will NOT use the checkpoint you asked for. It has substituted a different model, and this estimate prices the SUBSTITUTE. Nothing has been submitted or charged yet.
    requested version 128713 -> will run version 1892509  (reason: unrecognized)
      the server does not offer that version in this model family at all — it may be a community checkpoint that was never offered for generation, or a version retired since this command was written. Check it with `civitai model-versions get <id>` and pin a version that is still offered
To refuse a run like this instead of being told about it, pass --fail-on-substitution.
```

The checkpoint line in the summary you approve is annotated too, so the model
that will *not* run is never the last one you read before saying yes:

```console
Checkpoint:       DreamShaper — 8 (Checkpoint, id 128713)  [SUPERSEDED — the server will run version 1892509 instead; see the warning above]
```

Your own id stays on the line, marked; the CLI never quietly swaps in the
applied one.

To tell a *reproduction* from a *mismatch*:

- **The applied id is the server's current answer, not a constant.** `1892509`
  was that family's default when this was run; yours, and the price, will
  differ. What reproduces is the *shape* — a warning naming both ids and a
  `reason`, and a `[SUPERSEDED …]` note on the checkpoint line.
- **A version id that does not exist will not get you here.** `generate`
  resolves every `--checkpoint` against the public model-version API before
  pricing, so a nonexistent id fails locally with
  `not found (404): Model not found`, exit `4`, nothing charged. That lookup
  cannot tell you whether an existing id belongs to your family.

### Where it is reported

On the **estimate** (`--dry-run`, and before the confirmation prompt on a real
run, while you can still back out); **again after the submit**, as the receipt
for what was billed; and on a **later read** with `civitai workflows get <id>`,
the only place a `--no-wait` run can discover it. The report always goes to
**stderr**, including under `--json`, whose stdout carries the raw
`modelSubstitutions` array.

### The three reasons

| `reason` | What it means | What to do |
| --- | --- | --- |
| `wrong-workflow` | The version is real for this family but scoped to a **different** workflow (e.g. an edit-only version sent to text-to-image). | Pick a version offered for the workflow you are running, or change `--ecosystem` to match. |
| `unrecognized` | The version is in no list for this family — a community checkpoint, or one **retired** since your script was written. | Check it with `civitai model-versions get <id>` and pin one that is still offered. |
| `gated` | The version **is** offered here, but a gate rule hides it from your account. | An entitlement issue, not a command mistake: may need a membership, an early-access window, or an accepted licence. |

A `reason` this CLI does not recognise is still reported, with both ids intact
— the server's token is printed raw and any CLI advice sits on a separate line.

### Refusing instead: `--fail-on-substitution`

**By default a substitution is a warning and the run continues**, so a script
pinned to a since-retired version keeps working. `--fail-on-substitution`
refuses instead. It is checked against the **estimate**, so a refusal submits
and charges nothing.

::: danger Silence is not an assurance
The flag can only refuse what the server **reports**. `modelSubstitutions` is
**omitted** when nothing was reported, so "no warning" means *either* no
substitution *or* a server that does not report them (for example one older
than this feature) — against which the flag
is **silently inert** (exit `0`, submitted, charged). The CLI cannot tell these
apart and never claims the negative. Read a quiet run as *"nothing was
reported"*, never *"nothing was substituted"*.
:::

It also:

- **does not re-fire after the submit.** A substitution appearing only on the
  submit reply is reported (and is in `--json`) but exits `0`: the money is
  already gone, and failing would strand a result you paid for.
- **refuses on the first** reported substitution, naming it and counting the
  rest.
- **stays live with `--input`, with unknowable coverage.** It still fires on the
  estimate's record, before any spend, but the CLI does not interpret a raw
  graph, so it cannot relate that record to your file. A checkpoint named under
  `resources`, for example, can be charged and run as a different version with
  **no record at all**, so the flag does not fire. The command warns about this
  whenever `--input` and `--fail-on-substitution` appear together.

## Image-to-image: `--image` and `--ecosystem`

`--image <path-or-url>` (repeatable) attaches a reference image and turns the
job into an edit.

```bash
# Image-to-image from a local file — --ecosystem is REQUIRED with --image
civitai generate "make it winter" --ecosystem Flux1Kontext --image ./cat.png --dry-run

# …or from a public https URL, with two reference images
civitai generate "combine these" --ecosystem Seedream \
  --image https://example.com/a.jpg --image ./b.png --yes
```

A **local `.png`/`.jpg`** is uploaded to Civitai and the stored blob is
referenced; an **`https` URL** is passed through as-is and must be publicly
reachable — the generator downloads it server-side, and an unfetchable URL is a
`400` after you have already been priced. `http://`, `file://` and `data:` are
refused.

The CLI reads width and height from the image **header only** (no pixel
decode) and sends them, because the server rejects an entry without them.
Local files are capped at **64 MiB** (checked by `stat`, before a byte is
read). Only **PNG and JPEG** are supported, decided by the file's **bytes, not
its extension**: a `.png` holding JPEG data is sent as `image/jpeg`, while a
`.jpg` holding anything else is refused. WebP is not supported.

### `--image` requires `--ecosystem`, and the reason is money

```console
$ civitai generate "a cat" --image ./cat.png --dry-run
Error: --image requires --ecosystem — the server only turns a job into image-to-image when the request names an ecosystem. Without one it silently ignores the images, generates from the prompt alone and charges you for it. Pass an ecosystem that supports image editing, e.g. --ecosystem Flux1Kontext or --ecosystem NanoBanana
$ echo $?
2
```

Without an ecosystem the server **ignores the images, generates from the
prompt alone, and charges the full amount** — HTTP 200, no warning. The CLI's
refusal fires before any pricing, so it costs nothing.

### The workflow on screen still says `txt2img`, and that is correct

Image editing is *requested* as `txt2img` plus your images; the server does
the promotion. So the `--dry-run` quote and the spend confirmation name
`txt2img` and, with `--image`, say why on the same line. The CLI sends that
value as-is and does not claim the promotion *happened*, because it cannot see
that.

### Two things the CLI genuinely cannot check for you

::: warning Only some ecosystems accept reference images at all
`Qwen`, `Flux1Kontext`, `NanoBanana`, `Seedream`, `OpenAI`, `Grok`, `Reve`,
`MAI`, `Boogu` and a few more do; the Stable Diffusion family and the *default*
ecosystem do **not** — and for those the images are dropped silently and
billed.

**The cost estimate cannot tell you which case you are in.** Several
edit-capable ecosystems price identically with and without images (for example
`Flux1Kontext`, `NanoBanana` and `Seedream`), so a price comparison is not a
detector. Name an ecosystem you know supports editing.
:::

::: warning Too many reference images are silently truncated
Per-ecosystem limits run from 1 to 7, live only inside the server's per-engine
graphs, and the extras are dropped *before* any limit check can fire — so the
server never reports it and the truncated job is billed. For example, `Qwen`
accepts 3: sending 4 or more prices exactly as sending 3.

The CLI refuses **more than 7** (no ecosystem accepts more, so that refusal
never blocks a valid request) and **warns** above 1; below 7 it does not know
your ecosystem's limit and deliberately does not vendor the table.
:::

### `--dry-run` still uploads

`--dry-run` **does** upload local `--image` files, because an estimate without
`images[]` prices a plain text-to-image job. Uploading spends no Buzz and
`--dry-run` still never submits, but it is a network write: neither `--dry-run`
nor `--print-input` is offline once `--image` is involved.

## Where to go next

- [Generating images from the CLI](./cli-generate) — the money contract,
  waiting, downloading and every exit code.
- [Raw generation graphs](./cli-generation-graphs) — what `--input` does and
  does not check.
- [Tracking and cancelling generations](./cli-workflows).
