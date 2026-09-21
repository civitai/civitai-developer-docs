---
title: Loaded Resources
---

# Loaded Resources

`GET /v2/resources?view=Loaded` lists the resources the fleet currently holds — cached on at least
one worker and usable right now, with no download to wait for. It is the pull side of keeping an
external catalogue in step with what the orchestrator can actually run.

It is a sibling of `view=Queue`, which lists the opposite set: what the orchestrator is *loading*.

```bash
curl -G https://orchestration.civitai.com/v2/resources \
  -H "Authorization: Bearer $CIVITAI_TOKEN" \
  -d view=Loaded \
  -d take=100 \
  -d source=civitai \
  -d minSizeBytes=1073741824
```

Items are [`ResourceInfo`](/orchestration/reference/operations/GetResource), the same shape
`GET /v2/resources/{air}` returns, paged with the usual `next` cursor.

## Filter first — an unfiltered query is refused

The fleet holds **hundreds of thousands** of loaded resources. The overwhelming majority are not
models: they are input images, sample images and other generated artifacts that passed through a
workflow. Ask for all of them and you get a `400` telling you how many matched, so you can narrow:

```json
{ "status": 400, "title": "412873 resources match. Narrow the query with type, source or minSizeBytes." }
```

The filters compose with AND. Each repeatable one is OR'd within itself, and they apply to
`view=Queue` just as well — the same narrowing works on what the orchestrator is currently pulling.

| Parameter | Matches |
| --- | --- |
| `type` | The AIR's type segment. Repeatable. |
| `excludeType` | The AIR's type segment; wins over `type`. Repeatable. |
| `source` | The AIR's source segment. Repeatable. |
| `minSizeBytes` / `maxSizeBytes` | The resource's size in bytes, inclusive. |

## Filtering by type, and why `checkpoint` is not "every base model"

`type` matches the AIR's type segment **literally**. There is no alias expansion, no enum and no
validation — an unrecognised value simply matches nothing.

That segment is a **routing key derived from the model's type, not the file's**. A Diffusion Model
file attached to a model whose type is Checkpoint is published as `…:checkpoint:…`. The consequence
for filtering is that base weights are spread across several type segments:

- `checkpoint`
- `diffusion_model` and `diffusionmodel`
- `unet` — GGUF weights, a distinct loader slot from diffusion weights

So `type=checkpoint` returns *some* base models, not all of them. Pass each segment you want:

```
?view=Loaded&type=checkpoint&type=diffusion_model&type=diffusionmodel&type=unet
```

These are deliberately **not** aliased server-side. `unet` and `diffusion_models` are different
routing slots, and collapsing them here would hide a distinction the rest of the pipeline depends on.

## Filtering by size

`minSizeBytes` is the blunter but more reliable cut, and it is the one to reach for when you want
"the big models" rather than a particular category:

```
?view=Loaded&minSizeBytes=1073741824
```

**1 GiB (`1073741824`)** is the meaningful boundary. It is the threshold at which the orchestrator
puts a resource in its large download lane, so in practice it separates base weights from LoRAs,
embeddings and VAEs without naming any of them.

::: warning A size of 0 means unknown, not empty
Some resources reach the fleet without their provider ever reporting a byte count; these have
`size: 0`. Any `minSizeBytes` therefore excludes them. If you need those, filter by type or source
instead.
:::

## Filtering by source

`source=civitai` is the cheapest single predicate for a catalogue sync. It drops everything the
orchestrator generated or fetched itself — blob and object-storage URLs are represented by synthetic
AIRs with a source of `orchestrator` and a type of `other`, and they are the bulk of the table.

Filtering by type instead? The non-model artifacts are `other`, `torchcompilecache` and
`nodepacklayer`:

```
?view=Loaded&excludeType=other&excludeType=torchcompilecache&excludeType=nodepacklayer
```

## Paging

Pass the `next` value from each response as `cursor`. `take` defaults to 100, which is also the maximum: every item is a full `ResourceInfo`, so pages stay small and you follow `next`.

Each page is a **fresh snapshot** rather than a slice of one consistent read. If the fleet's cache
changes mid-sweep — a worker evicts something, another finishes a download — an item can be missed
or repeated at a page boundary. Treat the sweep as eventually consistent and make your reconciliation
idempotent. `view=Queue` behaves the same way.

## The same filters on `view=Queue`

Nothing here is specific to `Loaded`. `?view=Queue&type=checkpoint` narrows the download queue the
same way, with two differences worth knowing:

- The queue does not carry sizes, so `minSizeBytes` / `maxSizeBytes` make the orchestrator look up
  each queued candidate's size. Filtering the queue by `type` or `source` is free.
- There is no too-broad refusal. The queue is only what is being pulled right now, so an unfiltered
  `view=Queue` is small by construction.

## What this view does not tell you

- **`availability` is not populated.** Every item in this view is available by definition; filling it
  in would cost a fleet-wide lookup per item. Call `GET /v2/resources/{air}` when you need the
  detail for one resource.
- **Nothing about capacity.** Worker counts, lane occupancy and download bandwidth are not exposed
  here. This answers "is it loaded", not "how much of it is there".
