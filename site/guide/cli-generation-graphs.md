---
title: Raw generation graphs
description: civitai generate --print-input and --input — the only route to seed, steps, cfgScale and sampler, what the CLI refuses in a raw graph, and the four things a passthrough cannot protect you from.
sources:
  - go:github.com/civitai/cli
---

# Raw generation graphs

`civitai generate`'s content flags cover the common job. Everything else the
generator understands lives in the **generation graph** — the JSON document
those flags assemble. That includes **`seed`, `steps`, `cfgScale` and
`sampler`**, none of which has a flag: a seed set in the graph is the only way
to reproduce a run, and the graph is the only way to raise cfg or move steps.

You can write that document yourself.

::: danger A raw graph is submitted as written
`--input` is a **passthrough**. The CLI does not interpret your graph, so
nothing local resolves the model ids in it, prices your custom keys, or checks
that the job is coherent. Everything on this page follows from that. Read
[the money contract](./cli-generate#what-the-cli-can-and-cannot-tell-you-about-a-charge)
first.
:::

## The round trip

```bash
# 1. Assemble it from flags, print it, and exit. No submit, no cost estimate,
#    no balance read — with no --checkpoint/--lora, no request at all.
civitai generate "a cat" --quantity 2 --aspect-ratio 1:1 --print-input > graph.json

# 2. Edit graph.json however you like.

# 3. Send it as-is. Price it first; --dry-run still spends nothing.
civitai generate --input graph.json --dry-run
civitai generate --input graph.json --yes

# …or pipe it, with `-`
jq '.prompt = "a dog"' graph.json | civitai generate --input - --dry-run

# The same route is how you set a seed — there is no --seed flag.
jq '.seed = 12345' graph.json | civitai generate --input - --yes
```

What `--print-input` writes is a plain graph document:

```console
$ civitai generate "a cat" --quantity 2 --aspect-ratio 1:1 --print-input
{
  "workflow": "txt2img",
  "prompt": "a cat",
  "quantity": 2,
  "aspectRatio": "1:1"
}
```

Note what is **absent**: there is no `seed`, no `steps`, no `cfgScale`, no
`sampler`. The CLI never writes a key you did not set, because an explicit zero
is a real, accepted, *wrong* job — `steps: 0` prices a degenerate cheaper run
at HTTP 200. An unset key is simply not in the payload, and the server supplies
its own behaviour. Add only the keys you actually want to control.

`--print-input`'s output is a valid `--input` document by construction. That
round-trip is the point of the pair, and it is what replaces a
`--set some.path=value` expression language the CLI deliberately does not have:
a wrong type in such an expression is accepted by the server silently and
billed, while an edited file is inspectable before it is sent.

## What `--print-input` touches

`--print-input` reaches **no money seam**: not the submit, not the cost
estimator, not the balance read. With `--checkpoint` or `--lora` it does still
make the public model-version *read* those flags always make — that lookup
supplies `model.type`, which graph `resources[]` entries require, so skipping
it would print a document `--input` could not submit.

With `--image` it uploads each local file first, and that upload is
authenticated. So:

- **bare `--print-input`** — no credential, no network;
- **`--print-input --checkpoint`/`--lora`** — no credential, but a real public
  read (with no network it exits `5`, it does not print a graph);
- **`--print-input --image`** — a credential *is* required.

## The five things a passthrough cannot do for you

### 1. `txt2img` only

A graph declaring any other workflow is refused:

```console
$ civitai generate --input graph-img2img.json --dry-run
Error: --input declares workflow "img2img", but this CLI only submits "txt2img". Other workflows (img2img, video, comfy, …) are not supported yet: their prompts do not always live in the top-level "prompt" node the server's content audit reads, and this CLI will not be the path that bypasses it
$ echo $?
2
```

The server's content audit reads the top-level `prompt` node, and it rebuilds
what it inspects from *declared* graph nodes — so a graph carrying its prompt
somewhere else is a shape this CLI will not send. Widening `--input` to the
other workflows is gated on server-side work, not on the next workflow looking
like it would work.

Note that this is about the workflow the *file declares*. Image-to-image via
`--image` still sends `workflow: "txt2img"` and is unaffected; see
[Choosing a model](./cli-generate-models#image-to-image-image-and-ecosystem).

### 2. Envelope keys are refused, not ignored

`civitaiTip`, `creatorTip`, `buzzType`, `tags`, `externalId`,
`sourceMetadata`, `sourceMetadataMap`, `remixOfId` and a top-level `input`
belong to the request *envelope* around the graph, not to the graph:

```console
$ civitai generate --input graph-tip.json --dry-run
Error: --input contains "civitaiTip", which is NOT part of the generation graph: it belongs beside the graph in the request envelope, and this CLI owns it. Tips (civitaiTip/creatorTip) are real Buzz that the cost estimate cannot see, so a file setting one would charge more than --dry-run showed. Remove it from the file
$ echo $?
2
```

A file setting `civitaiTip` would charge a tip that **`--dry-run` structurally
cannot show you** — the estimator prices a strictly smaller request and is
never sent tips at all — so the file is rejected rather than quietly cleaned
up. `externalId` is on the list for a different reason: it is the idempotency
key the CLI mints per submit, and a file supplying its own would collide with
the crash-safety record. Use `--external-id` instead.

### 3. Keys the CLI does not model are passed through, with a warning that claims nothing

The warning says the key is not modelled *here* and was not checked *here*. It
is **not** a claim that the key is invalid, and **not** a claim that the server
ignores it. The CLI does not carry a copy of the server's node registry, so it
cannot tell those apart.

What the key does — **including what it costs** — is the server's answer.
`--dry-run` prices the graph with your key included, so the estimate is where a
price effect would show; nothing local can predict one. Check the spelling.

::: danger This warning used to assert the opposite, and it was wrong
It said an undeclared key "returns HTTP 200, prices the same, and simply has no
effect". A graph carrying `"priority": "high"` drew that sentence and then
priced at **28**, with a `fixed → priority 20` component three lines below it,
against **8** for `normal`. The key was honoured, it tripled the price, and the
warning would have talked you out of the one change that clears a slow queue.
:::

### 4. No model-id safety net

`--checkpoint` and `--lora` are resolved against the public API before
submitting. A raw graph is not interpreted, so a nonexistent id inside it is
accepted, the ecosystem default is substituted, and you are billed for what
ran. `resources[]` entries also require a `model` **type** alongside the id — a
bare id is a `400`, and a *wrong* type is silently accepted.

### 5. `--fail-on-substitution` works here, but its reach is not knowable from here

Every *execution* flag still applies, this one included. It fires on the
estimate's substitution record, so it refuses before any spend just as it does
on the flag path. The limit is that a raw graph is not interpreted, so the CLI
cannot tell you which model references your file contains, or which of them a
record would name.

One measured case — a checkpoint named under `resources` — was charged and ran
a different version with **no record at all**. The command warns about exactly
this whenever the two flags appear together, unconditionally and without
reading your file, because deciding *which* graphs to warn about would mean
vendoring which keys the server reports on.

Read a silent run as *"nothing was reported"*, never as *"nothing was
substituted"*.

## Which flags `--input` accepts

`--input` cannot be combined with a prompt argument, or with any flag that
would also set graph content:

```console
$ civitai generate "a cat" --input graph-tip.json --dry-run
Error: --input cannot be combined with a prompt argument — --input sends the graph in the file exactly as written, so a flag that would also set graph content has no defined meaning against it. Either drop it, or edit the file (start from `civitai generate "a cat" --print-input`)
$ echo $?
2
```

The refused set is `--negative-prompt`, `--quantity`, `--aspect-ratio`,
`--checkpoint`, `--lora`, `--image` and `--ecosystem` — there is no predictable
answer to "does `--lora` append to or replace the file's `resources`?", so the
combination is a usage error rather than a guess. Put those values in the file
instead.

Every *execution* flag still applies: `--dry-run`, `--yes`, `--max-cost`,
`--json`, `--no-wait`, `--timeout`, `--out-dir`, `--out-name`, `--no-download`,
`--force`, `--external-id` and `--fail-on-substitution`, with the coverage
caveat above.

A file that is not a JSON object is a usage error too:

```console
$ civitai generate --input broken.json --dry-run
Error: --input is not a JSON object: invalid character 'o' in literal null (expecting 'u') — expected a generation graph like {"workflow":"txt2img","prompt":"…"}; produce a valid starting point with `civitai generate "a cat" --print-input`
$ echo $?
2
```

## Where to go next

- [Generating images from the CLI](./cli-generate) — the flag path, waiting,
  downloading and the exit codes.
- [Choosing a model](./cli-generate-models) — substitution, ecosystems and
  `--image`.
- [Scripting the CLI with `--json`](./cli-json).
