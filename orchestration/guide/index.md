---
title: Introduction
---

# Introduction

The Civitai Orchestrator is an API for running AI workloads — video generation, image generation, upscaling, transcription, text-to-speech, and more — without managing the underlying infrastructure.

You submit a **workflow**: a small JSON document describing what you want done. The orchestrator:

1. Converts workflow steps into **jobs**
2. Races multiple **providers** (FAL, Google, Bytedance, Civitai workers, and others) to claim each job
3. Streams results back — blobs (images/video/audio), text, or structured output

You get a single contract. The orchestrator handles provider selection, capacity, retries, and capability matching behind it.

## When to use this API

- You want to generate or transform media (video, image, audio, 3D) at scale
- You want provider redundancy without writing provider-specific code
- You want job tracking, webhooks, and resumable workflows out of the box
- You already have an AIR (Civitai resource identifier) and want to run inference against it

## Next steps

- [Quick start](./getting-started) — your first request in 5 minutes
- [Recipes](/orchestration/recipes/) — end-to-end examples (WAN video, Flux images, upscaling…)
- [API reference](/orchestration/reference/) — every operation, schema, and response
- [Internals](/orchestration/internals/architecture) — how the orchestrator works under the hood
