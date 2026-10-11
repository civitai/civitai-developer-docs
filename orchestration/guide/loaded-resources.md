---
title: Loaded Resources
---

# Loaded Resources

`GET /v2/resources?view=Loaded` lists the resources the fleet currently holds: cached on at least
one worker and usable now, with no download to wait for. Use it to keep an external catalogue in
step with what the orchestrator can run. Its sibling `view=Queue` lists what is being *loaded*.

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

The fleet holds **hundreds of thousands** of loaded resources, mostly not models but input images,
sample images and other workflow artifacts. When more than 50,000 resources match on one provider,
the request is refused with a `400` saying how many matched:

```
{N} resources match on one provider. Narrow the query with type, source or minSizeBytes.
```

The filters compose with AND; each repeatable one is OR'd within itself.

| Parameter | Matches |
| --- | --- |
| `type` | The AIR's type segment. Repeatable. |
| `excludeType` | The AIR's type segment; wins over `type`. Repeatable. |
| `source` | The AIR's source segment. Repeatable. |
| `minSizeBytes` / `maxSizeBytes` | The resource's size in bytes, inclusive. |

## Filtering by type, and why `checkpoint` is not "every base model"

`type` matches the AIR's type segment **literally**: no alias expansion, no enum, no validation. An
unrecognised value matches nothing.

The segment comes from the model's type, not the file's (a Diffusion Model file on a Checkpoint
model is published as `…:checkpoint:…`), so base weights are spread across several segments:

- `checkpoint`
- `diffusion_model` and `diffusionmodel`
- `unet` — GGUF weights, a distinct loader slot from diffusion weights

`type=checkpoint` alone returns only *some* base models, and the segments are not aliased
server-side. Pass each one you want:

```
?view=Loaded&type=checkpoint&type=diffusion_model&type=diffusionmodel&type=unet
```

## Filtering by size

`minSizeBytes` is the blunter but more reliable cut when you want "the big models" rather than a
category:

```
?view=Loaded&minSizeBytes=1073741824
```

**1 GiB (`1073741824`)** is the meaningful boundary: the orchestrator puts larger resources in its
large download lane, and in practice it separates base weights from LoRAs, embeddings and VAEs.

::: warning A size of 0 means unknown, not empty
Resources whose provider never reported a byte count have `size: 0`, so any `minSizeBytes` excludes
them. Filter by type or source to include them.
:::

## Filtering by source

`source=civitai` is the cheapest single predicate for a catalogue sync. It drops everything the
orchestrator generated or fetched itself: blob and object-storage URLs, represented by synthetic AIRs
with source `orchestrator` and type `other`, which are the bulk of the table.

To exclude them by type instead, the non-model artifacts are `other`, `torchcompilecache` and
`nodepacklayer`:

```
?view=Loaded&excludeType=other&excludeType=torchcompilecache&excludeType=nodepacklayer
```

## A complete list, or an error

`view=Loaded` never returns a partial list. If any part of the fleet is unreachable, or still
re-registering workers after an orchestrator restart, the response is `503` with `Retry-After`.
Treat anything but `200` as "no answer this time", never as "these resources were unloaded".

## Paging

Pass each response's `next` as `cursor`. `take` defaults to 100, which is also the maximum.

Each page is a **fresh snapshot**, not a slice of one consistent read: if the fleet's cache changes
mid-sweep, an item can be missed or repeated at a page boundary. Make your reconciliation
idempotent. `view=Queue` pages the same way.

## The same filters on `view=Queue`

`?view=Queue&type=checkpoint` narrows the download queue the same way, with two differences:

- The queue does not carry sizes, so `minSizeBytes` / `maxSizeBytes` make the orchestrator look up
  each queued candidate's size. Filtering by `type` or `source` is free.
- There is no too-broad refusal: the queue holds only what is being pulled right now.

## What this view does not tell you

- **`availability` is not populated** — every item is available by definition. Call
  `GET /v2/resources/{air}` for one resource's detail.
- **Nothing about capacity.** Worker counts, lane occupancy and download bandwidth are not exposed.
