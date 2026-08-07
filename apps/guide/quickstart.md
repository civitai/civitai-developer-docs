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
npm run dev:harness        # Vite + the harness on http://localhost:5186
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
Replace `src/App.tsx` with:

```tsx
import { useBlockContext } from '@civitai/blocks-react';
import type { ModelSlotContext } from '@civitai/app-sdk/blocks';

export function App() {
  const { ready, context, viewer, theme } = useBlockContext();

  if (!ready) return <div data-theme={theme}>Loading…</div>;
  const model = context as ModelSlotContext;

  return (
    // Set data-theme on YOUR OWN root — the host can't reach into the iframe to
    // set it, so any [data-theme="dark"] CSS is otherwise dormant.
    <div data-theme={theme}>
      <p>Hello {viewer?.username ?? 'anon'} — running on {model.modelName}.</p>
    </div>
  );
}
```

::: tip `useBlockResize` does nothing on a page app
`civitai app create` scaffolds a **page** app (`block.manifest.json` declares a
`page` key), and a page app is rendered by the host's `PageBlockHost`, which
mounts the iframe **full-viewport** (`flex: 1`, `width: 100%`) and subscribes to
no `RESIZE_IFRAME` handler at all. `useBlockResize` still runs its
`ResizeObserver` and still posts the message — the host simply ignores it, so
your app is sized by the surface, not by its content. It is fire-and-forget, so
nothing hangs; it is just inert.

Reach for it on the **model-slot** surface, where `IframeHost` does handle
`RESIZE_IFRAME` and clamps the height to your manifest's
`iframe.minHeight` / `iframe.maxHeight`. (`iframe.resizable` in the manifest
schema still describes itself in size-to-content terms; on a page app that
wording does not apply.)
:::

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
`https://<slug>.civit.ai/`. Submitting also creates your **store listing** as a
draft, so you can fill in its icon and cover **while you wait for review** (see
[Store-listing media](#store-listing-media) below).

::: tip The platform builds from your committed lockfile
`civitai app submit` packages your **source** tree and the platform reinstalls
dependencies strictly from your committed lockfile (`package-lock.json` for
npm/Vite, `pnpm-lock.yaml` for pnpm, `yarn.lock` for yarn — derived from your
`buildCommand`). A missing or out-of-date lockfile is a guaranteed build
failure, so commit it (and re-run your install after changing dependencies).
`civitai app validate` flags this before you submit.
:::

That flow is gated to approved builders during the closed beta. To request access,
**reach out to the Civitai team** (see [Introduction](./)). See the
[CLI reference](../reference/cli) for every command and flag.

## Store-listing media

Your **store listing** is the card shoppers see in the
[`/apps` store](https://civitai.com/apps). It is created as a **draft the moment
you run `civitai app submit`** — not at approval — so you can set its media
**while your app is still in review**. Whatever you attach carries forward when a
moderator approves the app, so the listing can go live the same day it's approved
instead of waiting on a second round-trip.

A listing has a hard **publish floor**: it needs an **icon** and a **cover**
before it can go live. Screenshots (up to 8) are optional. You attach all of them
with the `civitai app listing` command group, run from your app directory (it
resolves the app from `block.manifest.json`, or pass `--slug`):

```bash
civitai app listing status                       # what's attached + what's missing vs the publish floor
civitai app listing set-icon ./assets/icon.png   # square-ish icon (required)
civitai app listing set-cover ./assets/cover.png # landscape hero image (required)
civitai app listing add-screenshot ./shot.png --caption "Grid view"   # optional, up to 8
civitai app listing rm-screenshot alsc_01H...    # remove one by its id (from `status`)
civitai app listing reorder alsc_02 alsc_01 alsc_03   # pass ALL screenshot ids in the new order
```

Each command ingests a local image, waits for the content scan, and attaches it —
the same pipeline the web submit form uses. Run `civitai app listing status` any
time to see what's attached and what's still blocking publish.

::: warning Editing a LIVE listing opens a revision
Once your listing is **approved and live**, attaching or changing media opens a
**revision** that goes back to moderator review — your live listing is untouched
until the revision is approved. Pass `--changelog "..."` to describe the change
(the `set-*` / `add-screenshot` commands accept it), and `-y` to skip the
revision confirmation prompt.
:::

See the [CLI reference](../reference/cli) for every `app listing` subcommand and
flag.

## Next

- [Concepts](./concepts) — the block / install / slot / trust-frame / bridge model.
- [`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react) —
  every hook with a snippet.
- [`@civitai/app-sdk`](https://www.npmjs.com/package/@civitai/app-sdk) — the
  framework-agnostic manifest, scope, and message contract.
