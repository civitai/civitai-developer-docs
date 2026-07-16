---
title: Quickstart
description: Scaffold a Civitai App with the civitai CLI, run it in the local harness, and write your first block.
sources:
  - go:github.com/civitai/cli#app
  - npm:@civitai/blocks-react@0.26.0#README
  - npm:@civitai/app-sdk@0.22.0/blocks#defineBlock
  - civitai-app-starters:docs/build-your-first-app-block.md
---

# Quickstart

Go from nothing to a block running in a local host simulator. About ten minutes.
This covers building and running locally — publishing is a separate, closed-beta
flow (see the end of this page).

::: warning Closed beta
You can scaffold, build, and run a block locally with the public packages below
right now. **Publishing** an app to civitai.com is limited to approved builders
during the closed beta — see [Introduction](./). Everything on this page works
without access.
:::

## Prerequisites

- Node ≥ 20.
- The [`civitai` CLI](../reference/cli) installed (`npm install -g @civitai/cli`,
  or Homebrew / a prebuilt binary — see the [CLI reference](../reference/cli#install)).
- A Civitai account (only needed later, to submit).

## 1. Scaffold

The `civitai` CLI's `app create` command scaffolds a correct, ready-to-build App
(a Vite + React + TypeScript project wired to the App SDK), slugifying the name
you pass into your `blockId`:

```bash
civitai app create my-app
```

Use `--template static` for a no-build page app, or `--dir ./path` to control the
output directory. The scaffold is immediately runnable and validates clean.

Then install dependencies:

```bash
cd my-app
cp .env.example .env
npm install
```

You now have a project shaped roughly like this:

```
my-app/
├── block.manifest.json   # the one required file — slug, version, scopes
├── index.html
├── vite.config.ts        # base: '/'  (the block is served at the subdomain root)
└── src/
    ├── App.tsx           # your UI
    ├── main.tsx
    └── Harness.tsx       # local host simulator (dev only)
```

## 2. Run it locally

The starter ships a **harness** — a local simulator that plays the role of the
host: it posts a fake `BLOCK_INIT`, captures your outbound messages into a debug
log, and echoes token refreshes, so you can iterate without civitai.com embedding
your block.

```bash
# from your scaffolded project:
npm run dev:harness        # Vite + the harness on http://localhost:5173
```

`dev:harness` runs Vite with the mock host mounted. To iterate against the **real**
Civitai backend instead, mint a dev token (`civitai app dev-token <slug>`) and run
`npm run dev:live`, or preview your local server inside the real host with
`civitai app dev-tunnel` — both are invite-gated during the pre-GA beta.

::: warning Match the harness origin
The harness pins a parent origin (for example `http://localhost:5180`), and so
does `.env`. They **must match**, or the transport's origin allowlist drops
`BLOCK_INIT` and the block hangs on "Loading…". If your block never leaves the
loading state, check that the two agree.
:::

## 3. Write the block

Read everything the host delivered with `useBlockContext()`, and gate your UI on
`ready` — the context fields are sentinel-empty until `BLOCK_INIT` lands.
`useBlockResize` posts your rendered height back to the host so the iframe fits
your content. Replace `src/App.tsx` with:

```tsx
import { useRef } from 'react';
import { useBlockContext, useBlockResize } from '@civitai/blocks-react';
import type { ModelSlotContext } from '@civitai/app-sdk/blocks';

export function App() {
  const { ready, context, viewer, theme } = useBlockContext();
  const rootRef = useRef<HTMLDivElement>(null);
  useBlockResize(rootRef);              // host fits the iframe to content

  if (!ready) return <div ref={rootRef} data-theme={theme}>Loading…</div>;
  const model = context as ModelSlotContext;

  return (
    // Set data-theme on YOUR OWN root — the host can't reach into the iframe to
    // set it, so any [data-theme="dark"] CSS is otherwise dormant.
    <div ref={rootRef} data-theme={theme}>
      <p>Hello {viewer?.username ?? 'anon'} — running on {model.modelName}.</p>
    </div>
  );
}
```

A few things this snippet establishes as habits:

- **Gate on `ready`.** Nothing in `context` / `viewer` is trustworthy before it.
- **`viewer` can be `null`** — that's an anonymous viewer, not an error.
- **Theme yourself.** Put `data-theme={theme}` on your root; the host cannot set
  it from outside the iframe.

To generate media and bill Buzz, reach for `useBuzzWorkflow()` (estimate →
submit → poll) — see the [`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react)
README for the full pattern, including the rule that your estimate must build the
same params as your submit.

## 4. Validate the manifest

`block.manifest.json` is the contract the platform validates. You can check it any
time against the same rules the platform uses by calling `defineBlock` at module
scope, so mistakes throw at startup instead of at submit:

```ts
import { defineBlock } from '@civitai/app-sdk/blocks';
import manifest from './block.manifest.json' with { type: 'json' };

defineBlock({ manifest });   // throws BlockManifestError with a .field path
```

The manifest declares your `blockId` (which becomes your `<slug>.civit.ai`
subdomain), `version`, `name`, `contentRating`, and the **scopes** your app
requests. You **omit** `iframe.src`'s hostname concerns — keep it at the
subdomain root and leave Vite's `base: '/'`; the platform owns the subdomain and
enforces it server-side.

## 5. Build

```bash
npm run build     # → dist/  (a static SPA; skip it for the `static` template)
```

That's a shippable bundle. Everything up to here works today with the public
packages.

## Submitting (closed beta)

When you're ready to go live, the lifecycle is **validate → submit → review**.
The `civitai` CLI packages your **source** tree and submits it — the platform
rebuilds and deploys it, so there is no client-side `deploy` step:

```bash
civitai app validate   # local pre-check of block.manifest.json
civitai app submit     # package the source + submit for review
civitai app status     # track review / deploy state
```

`civitai app submit` enters your app into **moderator review** — it is not
published immediately. On approval the platform provisions the OAuth client, git
repo, build, deploy, and `<slug>.civit.ai` DNS for you, and serves it at
`https://<slug>.civit.ai/`.

That flow is gated to approved builders during the closed beta. To request access,
**reach out to the Civitai team** (see [Introduction](./)). See the
[CLI reference](../reference/cli) for every command and flag.

## Next

- [Concepts](./concepts) — the block / install / slot / trust-frame / bridge model.
- [`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react) —
  every hook with a snippet.
- [`@civitai/app-sdk`](https://www.npmjs.com/package/@civitai/app-sdk) — the
  framework-agnostic manifest, scope, and message contract.
