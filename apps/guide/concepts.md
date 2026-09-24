---
title: Concepts
description: The Civitai Apps mental model — block, install, slot, page apps vs slot apps, the iframe trust frame, and the host/block bridge.
sources:
  - civitai:docs/features/app-blocks.md
  - civitai:src/components/AppBlocks/hostHandlerParity.ts#INVENTORY
  - npm:@civitai/app-sdk@0.51.0/blocks#BlockInitPayload
  - npm:@civitai/blocks-react@0.57.1#README
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

- The host **hands your block** a short-lived, scoped credential and the page
  context.
- Your block **spends that credential itself** against Civitai's API, and the
  server re-checks the token and its scopes on every request. The credential is
  the boundary — not the fact that the host made the call.
- The host **brokers what only it can**: anything that has to raise Civitai's own
  UI (sign-in, the resource picker, a Buzz purchase), and anything where host
  chrome *is* the consent control (publishing a post).
- Your block **holds no long-lived secret**. The credential is short-lived and
  scoped, and the sandbox keeps it out of reach of the parent page.

::: info Two transport models
The bullets above hold for both. Which one your block uses decides *how* it
spends the credential — over the `postMessage` bridge, or by calling `/api/v1`
directly. See [Transport models](#transport-models) below.
:::

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

  // Both are optional because a host predating civitai/civitai#2670 omits them.
  domain?: ColorDomain | null;   // 'green' | 'blue' | 'red', or null if unresolved.
                                 // INFORMATIONAL ONLY — never derive "is this SFW?"
                                 // from this string; the policy is server-side.
  maxBrowsingLevel?: number;     // authoritative browsing-level BITMASK — the max
                                 // NSFW levels the domain allows. This is the
                                 // canonical maturity test: isSfwCeiling(maxBrowsingLevel).
}
```

::: warning `maxBrowsingLevel` absent means SFW, not "no limit"
Both maturity fields are optional, and the SDK **fail-closes to SFW** when
`maxBrowsingLevel` is missing. So treat `undefined` as the most restrictive
ceiling — a block that reads it as "unrestricted" surfaces mature affordances on
a host that never granted them. Gate on `isSfwCeiling(maxBrowsingLevel)`, never
on `domain`.
:::

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

## Transport models

There are two ways your block reaches a Civitai capability, and a block may use
both at once. **Neither is deprecated** — they answer different questions.

| | **Bridge** | **Direct API** |
|---|---|---|
| Package | `@civitai/blocks-react` | `@civitai/blocks-react` today; `@civitai/sdk` once a block can hold an OAuth token |
| Mechanism | typed `postMessage` to the host | your block calls `/api/v1` itself |
| Credential | the block token, held by the host | the same block token, read from `useBlockToken()` |
| Good for | anything that must raise Civitai's own UI | reading and writing data |

**The rule to build by: default to the API, and use messaging only for the things
that must go through it.** Opening the resource picker is a message, because a
sandboxed iframe cannot draw Civitai's picker. Reading the viewer's Buzz balance
is a request, because nothing about it needs host chrome.

### What stays on the bridge, by design

- **Host UI** — `requestSignIn`, `openResourcePicker`, `openBuzzPurchase`,
  `download`, `resize`/`autoResize`, `navigate`, `reportError`. A sandboxed frame
  at an opaque origin cannot draw these, and should not.
- **Publishing a post** (`CREATE_POST_FROM_APP`, `PUBLISH_GENERATION_OUTPUTS`).
  This one is a *policy* decision, not a backlog item: the server returns a
  preview, the write echoes the count from that preview, and the host refuses on
  mismatch. A plain REST equivalent would let a block draw its own confirmation
  inside an iframe, with nothing binding what the viewer saw to what gets
  written. That removes a consent control rather than relocating it.

### What the API answers

The viewer, Buzz balance, shared storage, per-viewer app storage, workflows
(estimate / submit / poll / cancel / query), gated images, generation resources
and collections all have routes under `/api/v1`. The
[porting guide](./porting) maps each bridge hook to its replacement.

::: danger Generation goes through the block routes, not the raw orchestrator
`app.orchestration` reaches the orchestrator directly, and that path carries
**none** of the controls the block routes apply: the per-call Buzz budget, the
per-viewer and per-app daily caps, the maturity clamp, and the
`app-block:<appId>` attribution tag. The substitution **type-checks and passes
tests** — which is exactly why it is worth stating. Submit through
`/api/v1/blocks/workflows/*`.
:::

Because every call re-presents a scoped token that the server re-checks, policy
stays on Civitai's side either way. The bridge is what you get when you want the
**viewer** to be the principal; the full public contract is available to anyone
willing to be their **own principal** (own token, own backend, own Buzz). See
[what the bridge can and cannot do](../reference/generation#what-the-bridge-can-and-cannot-do).

## Tokens, briefly

The token arrives in `BLOCK_INIT` and is short-lived. Three things are worth
knowing, because the refresh is lazier than it looks:

- **On the bridge, it is kept fresh only while it is consumed.**
  `useBlockToken()` schedules a refresh shortly before expiry, but only while a
  component using the hook is mounted. A block that never touches the raw token
  never rotates it.
- **On the bridge, that staleness is harmless**, because brokered calls don't
  carry your copy of the token. When the host performs a request on your behalf
  it authenticates server-side; your token's freshness is irrelevant to it.
- **On the direct-API path it is not harmless, and the SDK handles it for you.**
  Your request carries the token, so an expired one is a 401. Retry once through
  `useBlockToken().refresh()` and reissue. (`@civitai/sdk` does this for you, but
  a block cannot use it yet — see the [porting guide](./porting).)

The host also *pushes* a new token when it re-mints one mid-session (chiefly after
a consent grant); apply pushed tokens unconditionally. You never mint, store, or
long-hold a credential yourself. The full authentication model (claims,
self-binding, scope enforcement) is a later reference page; for building, `ready`
+ the hooks are all you need.

### Which credential you get: the manifest's `auth` field

Your manifest chooses between two credentials, and the choice has consequences
beyond the token's format:

| `auth` | What the host hands you | Reaches |
|---|---|---|
| `"block-token"` *(default when omitted)* | the block-scoped JWT | the block-token routes under `/api/v1/blocks/*`, plus `/api/v1/models/{id}` |
| `"oauth"` | a real OAuth access token for the block's own client | `/api/v1`, the orchestrator and the MCP, unchanged |

Omitting `auth` keeps today's behaviour, so an existing manifest needs no edit.

A block token is not confined to `/api/v1/blocks/` by any claim check — it works
on any route wired to accept it, which today means one general route,
`/api/v1/models/{id}`. It does **not** reach `/api/v1/me`; blocks read the viewer
from `/api/v1/blocks/me`.

::: danger `auth: "oauth"` is accepted but not yet live
Minting the OAuth token is behind a server flag that is **off in production**.
While it is off the host falls back to the **block token**, so a manifest
declaring `auth: "oauth"` silently gets `block-token` behaviour. **Do not build
against it yet** (verified 2026-09-24).

It also gives up most of the block REST surface when it does go live — app
storage, shared storage and the workflow routes all re-verify the raw bearer as
a block JWS, which an OAuth token is not. Both caveats, and the field's full
reference, are on the [manifest reference](../reference/manifest) — that page is
`auth`'s home, and this one deliberately does not repeat it.
:::

## Next

- [Quickstart](./quickstart) — scaffold a block and run it in the local harness.
