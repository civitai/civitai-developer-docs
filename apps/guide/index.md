---
title: Introduction to Civitai Apps
description: What Civitai Apps are, who they're for, and how to start building one.
sources:
  - civitai:docs/features/app-blocks.md
  - civitai-app-starters:docs/build-your-first-app-block.md
---

# Introduction

Civitai Apps let you build a small web app that renders **inside** civitai.com —
a self-contained UI, embedded in a sandboxed iframe, that the host authenticates,
sizes, and connects to Civitai capabilities (the viewer, Buzz, generation) on
your behalf. You ship a static single-page app; you don't run a backend, manage
OAuth, or operate any infrastructure.

::: warning Closed beta — access is limited
Civitai Apps is currently in **closed beta** and is **not yet generally
available**. The platform is mod-gated: building and publishing an app is limited
to approved builders, and it is not openly self-serve today. If you'd like to
build an app, **reach out to the Civitai team** to request access. (There is not
yet a public self-signup flow.)
:::

## What is a Civitai App?

The runtime unit is a **block**: a static web app, served from its own
platform-owned subdomain (`https://<slug>.civit.ai/`), declared by a small
`block.manifest.json`. The host page (civitai.com) draws a trust frame around
your iframe, hands it a short-lived, scoped token plus the current page context
over `postMessage`, and brokers anything privileged — so your app never holds a
long-lived credential and never talks to Civitai's privileged APIs directly.

> **Naming:** the product is **Civitai Apps**; the code, manifest, scopes, and
> messages still use the `block` / `app_block` vocabulary. You'll see both in
> these docs — an "app" is what a user installs; a "block" is the hosted iframe
> unit it ships.

The result is a tight contract:

- **You own** the UI — a normal Vite + React (or any framework) SPA.
- **The platform owns** hosting, the subdomain, the runtime image, token minting,
  and the review/deploy pipeline.
- **The host mediates** every privileged action (generation, Buzz, storage,
  navigation) so policy is enforced on Civitai's side of the iframe boundary.

## Page apps and slot apps

A block can render in two places:

- **Page apps** — a full-page app opened from the Apps area on civitai.com
  (`/apps/run/<slug>`), rendered full-bleed under Civitai's chrome. **These docs
  target page apps.**
- **Slot apps** — a block embedded in a named region of another page (for
  example, a model-page sidebar). Slot apps exist in the platform but are
  **deferred / disabled** for third-party builders right now. Build a page app.

## What you'll need

- Node ≥ 20 and pnpm.
- A Civitai account, and closed-beta builder access (see the banner above).
- Basic familiarity with React — the starter and SDK are React-first.

You do **not** need Docker, a domain, a git host, or an OAuth client — the
platform provisions all of that when your app is approved.

## Where to start

<div class="vp-card-group">

- **[Concepts](./concepts)** — the mental model: block, install, slot, the iframe
  trust frame, and how the host and your app talk to each other.
- **[Quickstart](./quickstart)** — go from nothing to a block running in the local
  harness using the `civitai` CLI scaffold.
- **[Comfy Cloud (customComfy)](./comfy-cloud)** — drive a server-owned ComfyUI
  workflow by name (`{ kind, recipe, params }`), the recipe-gated model, and the
  budget rules.
- **[Running embedded & direct traffic](./embedding)** — why your app runs
  embedded in the Civitai host, why you share the `/apps/run/<slug>` route, and
  how `<BlockGate>` degrades a direct visit gracefully.

</div>

Once you understand the shape, the [`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react)
and [`@civitai/app-sdk`](https://www.npmjs.com/package/@civitai/app-sdk) packages
carry the full hook and contract surface.
