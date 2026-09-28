---
title: Choosing a model, and what the server may run instead
description: Why --checkpoint does not carry its ecosystem, how the Civitai CLI reports a silent model substitution, what --fail-on-substitution can and cannot guarantee, and the rules for image-to-image with --image.
sources:
  - go:github.com/civitai/cli
---

# Choosing a model, and what the server may run instead

`civitai generate` lets you name a checkpoint, LoRAs, an ecosystem and
reference images. None of those are validated for *coherence* by anything —
not this CLI, not the cost estimator, not the generator. This page is about the
gap between what you asked for and what actually runs, and what the CLI can
honestly tell you about it.

If you have not read [the money contract](./cli-generate#what-the-cli-can-and-cannot-tell-you-about-a-charge)
yet, start there — everything below can cost Buzz.

## A checkpoint does not carry its ecosystem

`--checkpoint` selects a model **version** and nothing else. The settings the
server generates with — engine, steps, cfg scale, sampler — follow the
**ecosystem** (`--ecosystem`, or the server's default when you pass none),
*not* the checkpoint you named. There is no `--steps` or `--cfg-scale` here to
correct them either; see
[Raw generation graphs](./cli-generation-graphs) for the route that does reach
them.

Pairing a checkpoint with an ecosystem it does not belong to is refused by
**nothing**. Measured once on a live token: a checkpoint version from the SD
1.5 family, passed with no `--ecosystem`, was submitted beside `ecosystem:
zImage`, `engine: sdcpp`, `steps: 9`, `cfgScale: 1`. It was charged, queued 15
minutes, ran 4.5 minutes, and finished `Status: failed` with **0 deliverable
outputs**. `--dry-run` had reported `Resources ready: true` beforehand. One
paid observation, not independently reproduced — reproducing it costs Buzz.

The two things that look like they should catch it do not:

- the model-version lookup proves the id **exists**, not that it **fits**;
- `Resources ready` reports resource availability, not coherence. It is
  [not a promise of output](./cli-json#ready-is-one-directional), and this is a
  second measured case of `ready: true` preceding zero outputs.

::: warning Which ecosystem a checkpoint belongs to is server knowledge
The CLI does not hold it and will not guess. A local copy of server state goes
stale and starts refusing valid *new* inputs, which is worse than the gap it
closes — so there is no vendored table here and no list of valid `--ecosystem`
values. `--ecosystem` is sent **verbatim and is not checked locally**; an
unknown value comes back as the server's own `unknown ecosystem` error.

**If you name a checkpoint, name the `--ecosystem` it belongs to as well.**
:::

## Silent model substitution

If you pass a `--checkpoint` version id that is not valid for the model family
being generated, the server does **not** reject it. It substitutes that
family's default checkpoint, runs the job, and bills you for **what actually
ran**. Until recently the reply was indistinguishable from success — a
nonexistent version id came back `200 OK` at the default price.

The server now reports each swap, and `civitai generate` surfaces it:

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

Your own id stays on the line. The CLI marks it; it never quietly substitutes
the applied one.

Two things about that transcript, so you can tell a *reproduction* from a
*mismatch*:

- **The applied id is the server's current answer, not a constant.** `1892509`
  is whatever that family's default was when this was run; yours will differ,
  and so will the price. What reproduces is the *shape* — a warning naming both
  ids and a `reason`, and a `[SUPERSEDED …]` note on the checkpoint line.
- **A version id that does not exist at all will not get you here.**
  `generate` resolves every `--checkpoint` against the public model-version API
  before it prices anything, so a nonexistent id fails locally with
  `not found (404): Model not found` and exit `4` — no estimate, no submit,
  nothing charged. That live lookup closes off the *nonexistent* id; it cannot
  tell you whether an id that does exist belongs to the family you are
  generating with.

### Where it is reported

On the **estimate** (`--dry-run`, and before the confirmation prompt on a real
run — while you can still back out); **again after the submit**, where it is
the receipt for what was billed; and on a **later read** with
`civitai workflows get <id>`, which is the only place a `--no-wait` run can
still discover it.

The report always goes to **stderr**, in every mode including `--json`, so
`--json` stdout stays machine-clean — and `--json` carries the raw
`modelSubstitutions` array itself.

### The three reasons

| `reason` | What it means | What to do |
| --- | --- | --- |
| `wrong-workflow` | The version is real for this family but scoped to a **different** workflow (e.g. an edit-only version sent to text-to-image). | Pick a version offered for the workflow you are running, or change `--ecosystem` to match. |
| `unrecognized` | The version is in no list for this family — a community checkpoint, or one **retired** since your script was written. | Check it with `civitai model-versions get <id>` and pin one that is still offered. |
| `gated` | The version **is** offered here, but a gate rule hides it from your account. | An entitlement issue, not a command mistake: may need a membership, an early-access window, or an accepted licence. |

A `reason` this CLI does not recognise is still reported, with both ids intact
— the server's token is printed raw and any CLI advice sits on a separate line.

### Refusing instead: `--fail-on-substitution`

**By default a substitution is a warning and the run continues.** That is
deliberate graceful degradation: a script pinned to a version that was later
retired keeps working rather than breaking on a CLI upgrade.

`--fail-on-substitution` refuses instead. It is checked against the
**estimate**, so nothing is submitted and nothing is charged when it refuses.

::: danger Silence is not an assurance
The `modelSubstitutions` field is **omitted** when nothing was substituted, so
"no warning" means *either* "no substitution" *or* "a server older than this
feature". The CLI cannot tell those apart and deliberately never claims the
negative. **Do not read a quiet run as confirmation that your model was used.**
:::

::: danger `--fail-on-substitution` is not a spend guard
It can only refuse what the server *reports*. Against a deployment that does
not report substitutions the flag is **silently inert** — exit `0`, submitted,
charged — and there is no signal distinguishing that from "nothing was
substituted".
:::

Three further limits worth knowing before you build a pipeline on it:

- It is evaluated on the **estimate**, and deliberately does not re-fire after
  the submit. A substitution appearing only on the submit reply is **reported**
  (and is in `--json`) but exits `0`, because the money is already gone and
  failing there would strand a result you paid for and still need to collect.
- It refuses on the *first* reported substitution; the message names that one
  and counts the rest.
- **With `--input` it stays live, but its coverage is unknown to this CLI.** It
  still fires on the estimate's record, so it still refuses before any spend —
  a raw graph does not disarm it. What the CLI cannot do is relate that record
  to your file: the graph is not interpreted, so nothing local knows which
  model references it contains. Measured once: a checkpoint named under
  `resources` was charged and ran a different model version with **no record at
  all**, so the flag did not fire. Read a silent run as *"nothing was
  reported"*, never as *"nothing was substituted"*.

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

A **local `.png`/`.jpg`** is uploaded to Civitai first and the stored blob is
referenced; an **`https` URL** is passed through as-is, but must be publicly
reachable — the generator downloads it server-side too, and an unfetchable URL
is a `400` after you have already been priced.

Either way the CLI reads the image's width and height from its **header only**
(never decoding the pixels) and sends them, because the server requires both
and rejects an entry without them. `http://`, `file://` and `data:` are
refused, and local files are capped at **64 MiB** (checked by `stat`, before a
byte is read).

Only **PNG and JPEG** are supported, and the format is decided by the file's
**bytes, not its extension** — a `.png` that really holds JPEG data is accepted
and sent as `image/jpeg`, while a `.jpg` holding anything else is refused. WebP
is not supported.

### `--image` requires `--ecosystem`, and the reason is money

```console
$ civitai generate "a cat" --image ./cat.png --dry-run
Error: --image requires --ecosystem — the server only turns a job into image-to-image when the request names an ecosystem. Without one it silently ignores the images, generates from the prompt alone and charges you for it. Pass an ecosystem that supports image editing, e.g. --ecosystem Flux1Kontext or --ecosystem NanoBanana
$ echo $?
2
```

The server promotes a text-to-image job to image-to-image only when the request
*names an ecosystem*. Without one it **ignores the images, generates from the
prompt alone, and charges you the full amount** — HTTP 200, no error, no
warning. Measured: the same graph with and without `images[]` priced
byte-identically. The refusal above is a check on a flag combination the CLI
owns, and it costs nothing — it fires before any pricing.

### The workflow on screen still says `txt2img`, and that is correct

Image editing is *requested* as `txt2img` plus your images — the server does
the promotion itself, from the request body. So the `--dry-run` quote and the
spend confirmation both name `txt2img` and, when `--image` is set, say why on
the same line. The CLI does not rename the field, because the value it sends
really is `txt2img`; and it does not claim the promotion *happened*, because it
cannot see that.

### Two things the CLI genuinely cannot check for you

::: warning Only some ecosystems accept reference images at all
`Qwen`, `Flux1Kontext`, `NanoBanana`, `Seedream`, `OpenAI`, `Grok`, `Reve`,
`MAI`, `Boogu` and a few more do; the Stable Diffusion family and the *default*
ecosystem do **not** — and for those the images are dropped silently and
billed.

**The cost estimate cannot tell you which case you are in.** Several
edit-capable ecosystems price identically with and without images (measured on
`Flux1Kontext`, `NanoBanana` and `Seedream`), so a price comparison is not a
detector. Name an ecosystem you know supports editing.
:::

::: warning Too many reference images are silently truncated
Per-ecosystem limits run from 1 to 7, live only inside the server's per-engine
graphs, and the extras are dropped *before* any limit check can fire — so the
server never reports it and the truncated job is billed. Measured on `Qwen`
(limit 3): 4, 5, 6 and 12 images all priced identically to 3.

The CLI refuses **more than 7** — one global ceiling, chosen because no
ecosystem accepts more, so that refusal can never block a valid request — and
**warns** for anything above 1. Below 7 it genuinely does not know your
ecosystem's limit, and it deliberately does not vendor the per-ecosystem table.
:::

### `--dry-run` still uploads

`--dry-run` **does** upload local `--image` files, because an estimate built on
a graph with no `images[]` prices a plain text-to-image job. Uploading spends
no Buzz, and `--dry-run` still never submits — but it is a network write, so
neither `--dry-run` nor `--print-input` is offline once `--image` is involved.

## Where to go next

- [Generating images from the CLI](./cli-generate) — the money contract,
  waiting, downloading and every exit code.
- [Raw generation graphs](./cli-generation-graphs) — what `--input` does and
  does not check.
- [Tracking and cancelling generations](./cli-workflows).
