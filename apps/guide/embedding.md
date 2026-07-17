---
title: Running embedded & handling direct traffic
description: Why a Civitai App runs embedded in the civitai.com host, why you should always share the /apps/run/<slug> route, and how <BlockGate> makes a direct visit to the bare subdomain degrade gracefully instead of hanging.
sources:
  - npm:@civitai/blocks-react@0.32.0/dist/internal/directLoad.d.ts
  - npm:@civitai/blocks-react@0.32.0/dist/ui/BlockGate.d.ts
  - npm:@civitai/blocks-react@0.32.0/dist/hooks/useDirectLoad.d.ts
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
