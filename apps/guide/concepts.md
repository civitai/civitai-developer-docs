---
title: Concepts
description: The Civitai Apps mental model — block, install, slot, page apps vs slot apps, the iframe trust frame, and the host/block bridge.
sources:
  - civitai:docs/features/app-blocks.md
  - civitai:src/components/AppBlocks/hostHandlerParity.ts#INVENTORY
  - npm:@civitai/app-sdk@0.22.0/blocks#BlockInitPayload
  - npm:@civitai/blocks-react@0.26.0#README
---

# Concepts

Before you build, it helps to hold five ideas in your head: the **block**, the
**install**, the **slot**, the **trust frame**, and the **bridge** the host and
your block talk over. This page is the mental model; the [Quickstart](./quickstart)
puts it into practice.

## Block

A **block** is the runtime unit of a Civitai App: a static single-page app,
declared by a `block.manifest.json` and served from its own platform-owned
subdomain, `https://<slug>.civit.ai/`. You author the app; you never author the
subdomain or the `iframe.src` — the platform stamps those from your `blockId`
(slug) when your app is approved.

A block is owned by an **app** (an OAuth client). The manifest names the block's
slug, version, display name, content rating, and the **scopes** it requests. The
manifest is the entire contract between your code and the platform — it's the one
file the platform validates, and the one file that is truly required in your ZIP.

## Install

An **install** is a user (or the platform) enabling your app so it renders. For a
**page app**, a user opens the app from the Apps area on civitai.com; the platform
mints a token scoped to that install and that viewer, then loads your block. Each
install has its own identity, so tokens, consent, and any per-user data are scoped
to a single (app, viewer) pair — never shared across installs.

## Slot

A **slot** is a named region where a block renders. **Page apps** render
full-bleed under Civitai's chrome at `/apps/run/<slug>`. **Slot apps** render
inside a region of another page (for example, a model-page sidebar) — these exist
in the platform but are deferred for third-party builders, so target page apps
today (see the [Introduction](./)).

The important consequence: your block should read *where* it's running from the
context the host gives it, rather than assuming a fixed surface.

## The trust frame

Your block runs in a **sandboxed iframe**. The host page wraps that iframe in a
trust frame — a visible "Civitai App" badge and menu — and enforces the iframe
sandbox so your code can't reach the parent page, cookies, or same-origin
storage. This isolation is the primary security boundary of the platform, and
it's why the relationship between your block and the host is deliberately narrow:

- The host **hands your block** a short-lived, scoped JWT and the page context.
- The host **brokers** anything privileged — your block asks, the host performs
  the action server-side (re-checking the token and scopes) and answers.
- Your block **holds no long-lived secret** and calls **no** privileged Civitai
  API directly.

<!-- The auto-slug for this heading is `the-host-↔-block-bridge` (the `↔`
     survives slugification), which nothing links to and nobody types. Three
     pages already link to `#the-host-block-bridge`; pin that as the real id. -->
## The host ↔ block bridge {#the-host-block-bridge}

The host and your block communicate over `window.postMessage`, discriminated by a
message `type`. When your iframe loads and a token is minted, the host posts a
single **`BLOCK_INIT`** message carrying everything your block needs to start:

```ts
interface BlockInitPayload {
  blockInstanceId: string;
  blockId: string;
  appId: string;                 // the app (OAuth client) this block belongs to
  token: WrappedToken;           // { raw, scopes[], expiresAt (ISO), buzzBudget? }
  context: BlockContext;         // { slotId, … } — where the block is rendering
  settings: BlockSettings;       // { publisherSettings, userSettings }
  viewer: ViewerInfo | null;     // null = anonymous viewer
  theme: 'light' | 'dark';       // matches the host color scheme
  renderMode: 'iframe' | 'inline';
}
```

From there, the [`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react)
hooks surface this to you — `useBlockContext()` returns the init payload behind a
`ready` gate, and higher-level hooks (generation, Buzz, storage) each map to a
request/response message pair the host answers.

::: tip Render your shell instantly, hydrate on init
`ready` gates the **data**, not your whole app. Your layout, headings, controls,
and empty states need nothing from the host — render them on first paint and swap
in the init-dependent parts when `ready` flips. Blocking the entire tree on the
handshake turns a fast iframe into a blank panel for the length of a round trip,
which is the single most common reason a block *feels* slow.

The host also puts the paint-time fields — `theme`, `renderMode` and
`blockInstanceId` — in the iframe URL fragment, so a block that wants the right
theme on its very first frame can read them before any message arrives. The
bridge remains authoritative: treat the fragment as a hint and let `BLOCK_INIT`
confirm it.
:::

### Bridge-first: the host brokers, you don't fetch

The platform's transport model is **bridge-first**. The default — and for most
apps, the only — way to reach a Civitai capability is to send the host a typed
message and await its reply:

- **Generation** — `useBuzzWorkflow()` estimates, submits, and polls orchestrator
  workflows. Your block never calls the orchestrator; the host does, on the
  platform side, against the block token.
- **Buzz** — `useBuzzBalance()` / `useViewer()` read the signed-in viewer and
  their per-pool balance through the host.
- **Storage** — `useAppStorage()` is a per-(app, viewer) key/value store the host
  brokers.

Because the host performs each call, it re-verifies your token and re-checks
scopes and content-rating on every request — policy stays on Civitai's side of
the iframe, not in code you control.

This is also why the bridge exposes a narrower surface than Civitai's public APIs
rather than proxying them: the full contract is available to anyone willing to be
their **own principal** (own token, own backend, own Buzz), while the bridge is
what you get when you want the **viewer** to be the principal. Spending someone
else's Buzz requires the host to understand each request well enough to confirm
it honestly and enforce policy on it — see
[what the bridge can and cannot do](../reference/generation#what-the-bridge-can-and-cannot-do).

Direct REST calls with the block token (via `useHostOrigin()` + `useBlockToken()`)
are reserved for narrow cases — high-volume public catalog reads and headless
tooling — not the default path. When in doubt, use a hook and let the host broker
the call.

## Tokens, briefly

The token arrives in `BLOCK_INIT` and is short-lived. Three things are worth
knowing, because the refresh is lazier than it looks:

- **It is kept fresh only while it is consumed.** `useBlockToken()` schedules a
  refresh shortly before expiry, but only while a component using the hook is
  mounted. A block that never touches the raw token never rotates it.
- **That staleness is harmless**, because brokered calls don't carry your copy of
  the token. When the host performs a request on your behalf it authenticates
  server-side; your token's freshness is irrelevant to it.
- **`refresh()` covers the 401 race** — the case where a request you made directly
  outlived the token it was issued against. Retry once through `refresh()`.

The host also *pushes* a new token when it re-mints one mid-session (chiefly after
a consent grant); apply pushed tokens unconditionally. You never mint, store, or
long-hold a credential yourself. The full authentication model (claims,
self-binding, scope enforcement) is a later reference page; for building, `ready`
+ the hooks are all you need.

## Next

- [Quickstart](./quickstart) — scaffold a block and run it in the local harness.
