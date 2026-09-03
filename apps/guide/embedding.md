---
title: Running embedded & handling direct traffic
description: Why a Civitai App runs embedded in the civitai.com host, why you should always share the /apps/run/<slug> route, how <BlockGate> makes a direct visit to the bare subdomain degrade gracefully instead of hanging, and what manifest.bootSkeleton makes the run host stand down.
sources:
  - npm:@civitai/blocks-react@0.45.1/dist/internal/directLoad.d.ts
  - npm:@civitai/blocks-react@0.45.1/dist/ui/BlockGate.d.ts
  - npm:@civitai/blocks-react@0.45.1/dist/hooks/useDirectLoad.d.ts
  - civitai:src/components/AppBlocks/PageBlockHost.tsx
---

# Running embedded & handling direct traffic

Your block is **served** from its own origin, `https://<slug>.civit.ai/`, but it
is **designed to run embedded** inside the civitai.com host at
`civitai.com/apps/run/<slug>`. The host is what makes the block work: it draws
the trust frame, mints the scoped token, and hands your block its runtime
context (viewer, token, theme) over the `BLOCK_INIT` handshake (see
[Concepts → the bridge](./concepts#the-host-block-bridge)).

That split has one sharp edge worth designing for from day one.

## The bare subdomain is an embed origin, not a destination

`<slug>.civit.ai` is where your bundle is hosted so the host can frame it — it is
**not** a URL you point users at. If someone opens the bare `<slug>.civit.ai`
directly (a top-level navigation — a shared link, a pasted URL, a social-card
crawl), there is no parent host to send `BLOCK_INIT`. Your `ready` gate never
flips, and the block sits on its loading state **forever**.

::: tip The one rule
**Always link and share the `civitai.com/apps/run/<slug>` route — never the bare
`<slug>.civit.ai` subdomain.** The run route loads the host, the host embeds your
block, and everything works. The subdomain on its own does not.
:::

## Degrade a direct visit gracefully with `<BlockGate>`

You can't stop someone from opening the bare subdomain, but you can make it fail
*gracefully* — an "Open on Civitai" landing that links to the run route, instead
of a spinner that never resolves. `@civitai/blocks-react` ships a drop-in wrapper
for exactly this: **`BlockGate`**.

Wrap your app root in `<BlockGate>` once. On a normal embedded load it renders
your app unchanged; on a direct (unembedded) top-level load with no `BLOCK_INIT`
within a short timeout, it renders the branded fallback instead:

```tsx
import { BlockGate } from '@civitai/blocks-react/ui';
import { App } from './App';

// Wrap your app root once, at the top of your tree (e.g. in main.tsx before you
// hand it to createRoot(...).render(...)).
export function Root() {
  return (
    <BlockGate>
      <App />
    </BlockGate>
  );
}
```

That's the whole integration. `<BlockGate>` accepts a few optional props:

- **`timeoutMs`** — how long to wait for `BLOCK_INIT` before treating a
  top-level load as direct (defaults to `2000`).
- **`fallback`** — a custom node to render on a direct load, replacing the
  default "Open on Civitai" card.
- **`autoRedirectMs`** — if set, auto-navigate the top window to the run route
  after this many milliseconds. Off by default: a click-to-open landing is the
  safe choice for shared links and crawlers (no surprise navigation).

::: tip Why it's precise, not a race
The gate only fires on a *genuine* direct load. An embedded block is never
top-level, so it never triggers. The dev harness runs your block top-level but
posts `BLOCK_INIT` immediately, so `ready` flips long before the timeout and the
fallback never shows. Only a real "nobody will ever send `BLOCK_INIT`" load
reaches the fallback — see [`useDirectLoad`](../reference/hooks) for the exact
conditions.
:::

### Already there in scaffolded apps

The `civitai` CLI's starter template wraps the app root in `<BlockGate>` by
default, so an app scaffolded with `civitai app create` already handles direct
traffic — you don't need to add anything. This page is here so you understand
*why* it's there (and so you keep it if you restructure your entry point).

### Custom handling with `useDirectLoad` / `hostToRunUrl`

If the default landing doesn't fit your app, build your own from the same
primitives `<BlockGate>` uses:

```tsx
import { useDirectLoad, hostToRunUrl } from '@civitai/blocks-react';

export function Gate() {
  // true only on an unembedded top-level load that never received BLOCK_INIT.
  const isDirect = useDirectLoad();
  if (isDirect) {
    // Derives https://civitai.com/apps/run/<slug> from <slug>.civit.ai, or null
    // for a non-deployed host (localhost, a bare civit.ai) — never a broken link.
    const runUrl = hostToRunUrl(window.location.hostname);
    return runUrl ? (
      <a href={runUrl}>Open on Civitai</a>
    ) : (
      <p>Waiting for the Civitai host…</p>
    );
  }
  return <p>…your app…</p>;
}
```

`hostToRunUrl` returns `null` for anything that isn't a deployed `<slug>.civit.ai`
host — so in local dev (or on a bare `civit.ai`) you show a neutral "waiting for
the host" state rather than a dead `apps/run/localhost` link.

## The boot skeleton — `manifest.bootSkeleton` {#boot-skeleton}

Between the moment the host frames your block and the moment your bundle has
parsed and rendered, something has to be on screen. By default the full-page run
host handles that for you, with three separate pieces of cover:

1. an **opaque branded veil** painted over the iframe,
2. the iframe held at **`opacity: 0`** until your block reports `BLOCK_READY`,
3. a **`translateY(8px)` reveal settle** with a transition when it finally shows.

Setting `bootSkeleton: true` in your `block.manifest.json` tells the host to
**stand down all three**. The host still publishes `aria-busy` on the iframe
element while it is waiting — that is its machine-readable "still loading", and
it replaces the veil's `role="status"` — but visually, from first paint, the
viewer is looking straight at your document.

### The key and the markup ship together. The key alone is worse than nothing.

`bootSkeleton` is not a performance switch you flip. It is a **declaration that
your document already paints something worth looking at**, and the host takes
you at your word.

Declare it over an empty `#root` and the host has dropped its cover over a blank
frame. **`bootSkeleton: true` over an empty `#root` is a blank iframe for the
entire load — strictly worse than not opting in.** Without the key the viewer
would at least have watched the veil.

::: danger Nothing validates this today
There is no build gate on this — no check, anywhere, compares the key against
what your built `index.html` actually contains. The only thing standing between
a false declaration and a blank run page is **the author looking at their own
app**. Ship the key and the markup in the same change, then open the run route
and watch it load.
:::

### The markup

Inside your mount container, one element carrying the marker attribute
`data-boot-skeleton`:

```html
<body>
  <div id="root">
    <div data-boot-skeleton aria-hidden="true">
      <!-- shape elements -->
    </div>
  </div>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

Four things about that shape are load-bearing:

- **It must live INSIDE the mount container** (`#root` / `#app`). A skeleton
  painted as a *sibling* of the container is never replaced by your app's render
  and stays on screen after mount, on top of — or below — the real UI.
- **`data-boot-skeleton` is an attribute, not a class.** Classes are mangled by
  CSS-modules and dropped by purge; an attribute survives the bundler and is
  deterministically greppable out of the built HTML.
- **`aria-hidden="true"`.** The skeleton is decorative. The host already
  publishes `aria-busy` on the frame, so an in-frame live region would announce
  the same state a second time.
- **Style it from an inline `<style>` in `<head>`**, with every selector scoped
  by `[data-boot-skeleton]`. No external stylesheet, no JS — that is exactly
  what makes it paint before anything else is fetched or executed.

### The theme is a guess — so guess dark, in CSS

Your skeleton has to paint before your app has been told anything, which means
it has to pick a theme without knowing one. **The boot theme is a guess, and the
guess must be dark.** Civitai is dark-first, so a light default produces a white
flash for the majority of viewers.

Make the guess in the CSS itself, never in a JS branch — the whole point of the
skeleton is that it paints before any script runs:

- The **base, unconditioned rules carry the dark values.**
- **Light is applied only inside `@media (prefers-color-scheme: light)`.**
- There must be **no `@media (prefers-color-scheme: dark)` block** carrying the
  base values. That inverts the default for `no-preference`, for an unknown
  preference, and for any UA without the query.

Belt and braces, because the first thing an iframe paints is the UA canvas,
before a single rule of yours applies:

- `<meta name="color-scheme" content="dark light" />` — **dark first.** If your
  document already carries `content="light dark"`, flip it.
- `html { background: <your dark body colour>; }` in the base rules of that
  inline `<style>`. This is the strong guarantee, and unlike the meta tag it
  does not depend on `color-scheme` support at all.

::: warning Reading the host's real theme is not yet available
The host does have a real theme, and it does send it — at `BLOCK_INIT`, which
arrives after your document has already painted. There is a mechanism for
handing a block its theme *before* first paint (a URL fragment on the frame
src), but its allowlist is empty: **no block receives one today.** So every app
adopting `bootSkeleton` right now paints from `prefers-color-scheme` and is
corrected at `BLOCK_INIT`. This is stated so you know why the default matters —
it is not a step you can take, and there is nothing to configure.
:::

### Removing it — this is per-framework, and React is the exception

How the skeleton *goes away* depends entirely on what mounts over it.

- **React** — `createRoot(container).render(...)` **clears the container's
  existing children** before its first commit, so the skeleton removes itself
  with **no cleanup code at all**. Measured, React 19 + jsdom: the container
  went from holding only the skeleton to holding only the app.
- **Svelte 5** — `mount(App, { target })` **appends, and does not clear.**
  Measured, Svelte 5 + jsdom: after mount the target held the skeleton *and*
  the app, in that order. Svelte apps need an explicit removal step.
- **Anything else** — **React's behaviour does not generalise; assume any other
  framework appends until you have measured it.** The measurement is one
  assertion in a jsdom test: mount over a container that already holds the
  marker, then check whether the marker is still there.

When you do need to remove it, do so immediately after the mount call:

```js
document.querySelector('[data-boot-skeleton]')?.remove();
```

### The `static` (no-build) case

A `static` app has no bundle to wait for — its real content is in the shipped
`index.html` and paints at first paint. So `bootSkeleton: true` is **correct and
maximally useful** there: the host's veil is pure delay laid over content that
is already on screen.

But a *skeleton* in a static app is inert at best and harmful at worst. There is
no framework render to replace it, so it would need explicit JS removal, buying
you a skeleton→content flash in exchange for nothing. For a static app:
**set `bootSkeleton: true` and ship no `[data-boot-skeleton]` markup at all.**
Your existing `<main id="app">` content is the boot state.

### A complete `index.html`

Copy-pasteable, for a bundled (React/Svelte/Vue) app. The colours are
placeholders — swap them for your own, keeping the dark ones in the base rules.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!-- Dark FIRST: this is what the UA paints before any rule of yours applies. -->
    <meta name="color-scheme" content="dark light" />
    <title>My App</title>
    <style>
      /* BASE RULES = DARK. This is the default for no-preference and for any
         UA without the media query. Do not move these into a
         @media (prefers-color-scheme: dark) block. */
      html {
        background: #0d0e12;
      }
      body {
        margin: 0;
        background: #0d0e12;
        color: #e6e7ea;
        font-family: system-ui, sans-serif;
      }
      [data-boot-skeleton] {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 24px;
      }
      [data-boot-skeleton] .bar {
        height: 14px;
        border-radius: 7px;
        background: #212227;
      }
      [data-boot-skeleton] .bar--title {
        height: 22px;
        width: 40%;
      }
      [data-boot-skeleton] .panel {
        height: 180px;
        border-radius: 12px;
        background: #17181d;
      }
      @media (prefers-reduced-motion: no-preference) {
        [data-boot-skeleton] .bar,
        [data-boot-skeleton] .panel {
          animation: boot-pulse 1.6s ease-in-out infinite;
        }
        @keyframes boot-pulse {
          50% {
            opacity: 0.6;
          }
        }
      }

      /* LIGHT IS THE OVERRIDE, and only ever the override. */
      @media (prefers-color-scheme: light) {
        html {
          background: #ffffff;
        }
        body {
          background: #ffffff;
          color: #16171a;
        }
        [data-boot-skeleton] .bar {
          background: #e4e5ea;
        }
        [data-boot-skeleton] .panel {
          background: #f1f2f5;
        }
      }
    </style>
  </head>
  <body>
    <div id="root">
      <div data-boot-skeleton aria-hidden="true">
        <div class="bar bar--title"></div>
        <div class="bar"></div>
        <div class="panel"></div>
      </div>
    </div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

And the manifest key that goes with it — in the same change, never before it:

```json
{
  "blockId": "my-app",
  "version": "1.0.0",
  "name": "My App",
  "contentRating": "g",
  "scopes": [],
  "bootSkeleton": true
}
```

## Platform edge behavior (for context)

Independently of your app, the platform also serves a **server-side redirect**:
a direct document navigation to a page app's subdomain is redirected to its
`civitai.com/apps/run/<slug>` route at the edge. That's platform behavior you
don't configure. The developer-side guidance stays the same regardless:

1. **Share the run route** — `civitai.com/apps/run/<slug>`, never the bare
   subdomain.
2. **Keep `<BlockGate>` at your root** so any direct hit that reaches your bundle
   degrades to an "Open on Civitai" landing instead of a hung spinner.

## Next

- [Concepts](./concepts) — the block / install / slot / trust-frame / bridge model.
- [Hooks reference](../reference/hooks) — `useDirectLoad` and the full hook surface.
