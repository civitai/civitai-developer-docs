---
title: Raw generation graphs
description: Use civitai generate --print-input and --input to set seed, steps, cfgScale and sampler in a raw generation graph, and what the CLI refuses or cannot check there.
sources:
  - go:github.com/civitai/cli
---

# Raw generation graphs

`civitai generate`'s flags assemble a **generation graph** — a JSON document
you can also write yourself. It is the only route to **`seed`, `steps`,
`cfgScale` and `sampler`**, which have no flags: a seed in the graph is the
only way to reproduce a run.

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

There is no `seed`, `steps`, `cfgScale` or `sampler`: the CLI never writes a
key you did not set, because an explicit zero is a real, accepted, *wrong* job
(`steps: 0` prices a degenerate cheaper run at HTTP 200). Add only the keys you
want to control.

`--print-input`'s output is a valid `--input` document by construction. That
round trip replaces a `--set some.path=value` expression language the CLI
deliberately does not have: a wrong type in such an expression is accepted
silently and billed, while an edited file can be inspected before it is sent.

## What `--print-input` touches

`--print-input` reaches **no money seam** — not the submit, the cost
estimator or the balance read. But `--checkpoint`/`--lora` still trigger the
public model-version read (it supplies `model.type`, which `resources[]`
entries require), and `--image` uploads each local file, which is
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

The server's content audit rebuilds what it inspects from *declared* graph
nodes and reads the top-level `prompt`, so a graph carrying its prompt elsewhere
is a shape this CLI will not send. Widening `--input` waits on server-side work.
This is about the workflow the *file declares*: image-to-image via `--image`
still sends `workflow: "txt2img"`; see
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

Tips are refused rather than stripped because `--dry-run` **structurally
cannot show them** — the estimator is never sent tips. `externalId` is refused
because it is the per-submit idempotency key the CLI mints for crash safety;
use `--external-id` instead.

### 3. Keys the CLI does not model are passed through, with a warning that claims nothing

The warning says only that the key is not modelled or checked *here* — not
that it is invalid, and not that the server ignores it; the CLI has no copy of
the server's node registry. What the key does, **including what it costs**, is
the server's answer, and `--dry-run` prices the graph with it included. For
example, an undeclared `"priority": "high"` is honoured and raises the price.
Check the spelling.

### 4. No model-id safety net

`--checkpoint` and `--lora` are resolved against the public API before
submitting. A raw graph is not interpreted, so a nonexistent id inside it is
accepted, the ecosystem default is substituted, and you are billed for what
ran. `resources[]` entries also require a `model` **type** alongside the id — a
bare id is a `400`, and a *wrong* type is silently accepted.

### 5. `--fail-on-substitution` works here, but its reach is not knowable from here

It still refuses before any spend, but the CLI cannot relate the server's
substitution record to the model references in your file, and some
substitutions carry no record at all. The command warns about this whenever the
two flags appear together. See
[`--fail-on-substitution`](./cli-generate-models#refusing-instead-fail-on-substitution).

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
`--checkpoint`, `--lora`, `--image` and `--ecosystem` — "does `--lora` append
to or replace the file's `resources`?" has no predictable answer, so put those
values in the file instead. Every *execution* flag still applies: `--dry-run`,
`--yes`, `--max-cost`, `--json`, `--no-wait`, `--timeout`, `--out-dir`,
`--out-name`, `--no-download`, `--force`, `--external-id` and
`--fail-on-substitution` (with the caveat above).

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
