---
title: "Context, frame and analytics hooks"
description: "The host handshake, theme, sizing, the block token and settings, direct-load and nested documents, and analytics. Part of the Hooks reference."
---

<!-- GENERATED PAGE — do not edit by hand. Written by `npm run gen:appblocks:md` (scripts/appblocks-md.mjs); which entry lives on which page is decided in .vitepress/theme/components/referenceSplit.shared.mjs. -->

# Context, frame and analytics hooks

The host handshake, theme, sizing, the block token and settings, direct-load and nested documents, and analytics.

This page documents 10 of the 48 hooks in the [Hooks reference](../hooks), which indexes every hook by name. Generated from the published `@civitai/blocks-react@0.77.0` package's type definitions and README.

Other pages: [Generation hooks](./generation) · [Batch, confirmed-step and training hooks](./batches-and-training) · [Buzz, purchase and tip hooks](./buzz-and-purchases) · [Viewer, consent and navigation hooks](./viewer-and-navigation) · [Storage, picker and media hooks](./storage-and-media)

<HooksReference group="context">
<!-- BEGIN GENERATED: hooks/context — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`useBlockContext`**

```ts
useBlockContext(): UseBlockContext
```

The primary hook. Returns everything the host delivered in `BLOCK_INIT` plus a `ready` gate — fields are sentinel-empty before init, so gate your UI on `ready`.

```tsx
const { ready, context, viewer, theme, settings, blockId, blockInstanceId, appId, token, renderMode } =
  useBlockContext();
```

```md
- `context` — `BlockContext` (`{ slotId, … }`); narrow to `ModelSlotContext` for
  model-page slots. LIVE on a page slot: `context.subPath` starts at the
  `BLOCK_INIT` value and then tracks the host's `ROUTE_CHANGED` push on every
  navigation — see [`useCivitaiRoute()`](#usecivitairoute).
- `viewer` — `ViewerInfo | null` (`null` = anonymous). **Gate sign-in with
  `isSignedIn(viewer)`** (from `@civitai/app-sdk/blocks`), never on
  `viewer.id`/`viewer.username` (both `@deprecated`). Don't open-code the gate:
  the SDK owns which spelling is correct — `signedIn` is optional on the wire
  and is the one viewer field the init validator deliberately does not reject
  when malformed, so `isSignedIn` answers from presence instead. Hover it for
  the full reasoning. Need the identity itself? Use
  [`useViewer()`](#useviewer) — scope-gated and audited per call.
- `theme` — `'light' | 'dark'`. **Set `data-theme={theme}` on your root** (gotcha #60).
  LIVE: it starts at the `BLOCK_INIT` value and then tracks the host's
  `THEME_CHANGE` push when the viewer toggles dark mode mid-session — see
  [`useBlockTheme()`](#useblocktheme).
- `settings` — `{ publisherSettings, userSettings }`.
```

**`useBlockTheme`**

```ts
useBlockTheme(): UseBlockTheme
```

The host's CURRENT site theme, and nothing else. Same value as `useBlockContext().theme` — reach for this when theme is all you need.

```tsx
function ThemedRoot() {
  const theme = useBlockTheme(); // 'light' | 'dark'
  return <div data-theme={theme}>…</div>;
}
```

```md
The viewer can toggle light/dark **while your block is mounted**. The host pushes
a `THEME_CHANGE` message and this hook re-renders. You get that for free as long
as you *read* the theme on every render — a block that copies it into state once
at mount, or writes `data-theme` imperatively in a mount-only effect, will stay
stuck on the old theme.

Against a host that predates `THEME_CHANGE` the value simply never moves (the
old behaviour). Nothing awaits the message, so there is no hang either way.

Exercise it locally: `createMockHost(...).setTheme('light')` (and the same on the
`dev:live` host) pushes the real message.
```

**`useBlockResize`**

```ts
useBlockResize(ref: RefObject<HTMLElement | null>): UseBlockResize
```

Attach to your root element. Observes its height and posts `RESIZE_IFRAME` so the host sizes the iframe to fit. No-op on the inline transport (host DOM reflows naturally).

```tsx
const rootRef = useRef<HTMLDivElement>(null);
useBlockResize(rootRef);
```

```md
**The element may mount on a later render, and that is the normal case** — a
block renders a skeleton until `BLOCK_INIT` lands. The hook keys on the observed
*element*, so you do **not** need to pin the same `ref` to every branch of a
loading/ready conditional to keep the host resizing. Put it on the root you
actually want measured, in whichever branch renders it.

> Also set `iframe.minHeight` in your manifest to the block's *real* rendered
> height — a too-small minHeight makes the iframe seed short and grow-jump on
> `BLOCK_READY` (CLS). Measure it in the dev harness (gotcha #53).
```

**`useBlockBreakpoint`**

```ts
useBlockBreakpoint(ref?: RefObject<HTMLElement | null>): UseBlockBreakpoint
```

```ts
interface BlockBreakpoint {
  tier: BlockSizeTier;
  measured: boolean;
  atLeast: (key: BreakpointKey) => boolean;
  below: (key: BreakpointKey) => boolean;
}
```

Reports the block's **own** width tier, so you can branch on "am I narrow?" without hand-rolling a `ResizeObserver` or hard-coding pixel numbers.

```tsx
const bp = useBlockBreakpoint();
<div style={{ display: 'flex', flexDirection: bp.below('sm') ? 'column' : 'row' }}>
  {bp.atLeast('md') && <aside>…</aside>}
</div>
```

```md
- `tier` — `'base' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'` on civitai's **px** scale
  (480 / 768 / 1024 / 1184 / 1440 — *not* Mantine's em scale, which agrees only
  on `sm`). Tailwind semantics: a tier applies at its breakpoint and above.
  `'base'` is narrower than `xs`, where both a 360px phone and the desktop
  `model.sidebar_top` slot land.
- `atLeast(key)` / `below(key)` — the comparators you actually want at a call site.
- `measured` — `false` until the first measurement lands. An unmeasured width
  resolves to `'base'`, so gate a *structural* narrow branch on
  `measured && below('sm')` if a one-frame swap would be jarring.

> **Container query, not a media query.** It observes an element — by default
> `document.documentElement`, which inside the block's sandbox iframe *is* the
> slot the host gave you. Slot width is not monotonic in viewport width (the
> `model.sidebar_top` slot is ~360px at a 360px viewport and only ~430px at a
> 1440px one), so a `matchMedia` inside the frame answers the wrong question.
> Pass a `ref` to measure a nested container instead.

> **No re-render storm.** A `ResizeObserver` fires on every pixel; this hook
> stores the resolved *tier* and returns a referentially stable object while the
> tier is unchanged, so a 200px drag inside one tier re-renders zero times. That
> is also why the raw width is not returned — it would either cost a render per
> pixel or be stale.
```

**`useBlockToken`**

```ts
useBlockToken(): UseBlockToken
```

Current block-scoped JWT, auto-refreshing ~2 min before expiry. Returns the token fields plus a `refresh()` for the 401-retry path, which **resolves with the new token**.

```tsx
const { raw, scopes, expiresAt, buzzBudget, refresh } = useBlockToken();

let res = await fetch(url, { headers: { Authorization: `Bearer ${raw}` } });
if (res.status === 401) {
  const fresh = await refresh();   // resolves WITH the new token
  res = await fetch(url, { headers: { Authorization: `Bearer ${fresh.raw}` } });
}
```

```md
> **Retry with the resolved token, not the `raw` you destructured.** That `raw` is
> a `const` from the render closure that ran *before* the refresh — awaiting
> `refresh()` re-renders the component but cannot reassign the binding your
> in-flight callback is already holding. A retry that re-reads the outer `raw`
> re-sends the stale JWT and 401s for exactly the reason the first call did.
```

**`useHostOrigin`**

```ts
useHostOrigin(): UseHostOrigin
```

The validated host origin to direct-fetch the App Blocks HTTP API against — `undefined` until init. Use it as the base URL when you need to bypass the host bridge, always paired with the bearer token from `useBlockToken()`.

```tsx
const host = useHostOrigin();          // e.g. "https://civitai.com" (undefined until BLOCK_INIT)
const { raw } = useBlockToken();
// Once `host` is set, fetch the API on that validated origin with the block token:
if (host) {
  const res = await fetch(`${host}/api/v1/blocks/me`, {
    headers: { authorization: `Bearer ${raw}` },
  });
}
```

```md
> **Security:** this is ONLY ever the origin that passed the SDK's origin
> allowlist (the same gate `BLOCK_INIT` passes) — never `document.referrer` or
> `window.location` of the parent. The block token is a money-scoped bearer
> credential, so always send it to *this* origin. Never derive the API host
> from a spoofable browser signal.
```

**`useBlockSettings`**

```ts
useBlockSettings(): UseBlockSettings
```

```ts
interface BlockSettings {
  publisherSettings: Record<string, unknown>;
  userSettings: Record<string, unknown>;
}
```

Shorthand for `useBlockContext().settings`. Read-only from the iframe — there is no general "set settings" bridge message. Writing them is platform-side, in the settings panel reached from the **Manage** control on an installed app. The one setting a block can write itself is the viewer's checkpoint, via the `SET_USER_CHECKPOINT` message (see `useCheckpointPicker`).

```tsx
const { publisherSettings, userSettings } = useBlockSettings();
```

**`useBlockAnalytics`**

```ts
useBlockAnalytics(): UseBlockAnalytics
```

```ts
interface UseBlockAnalytics {
  track: (eventName: string, properties?: Record<string, unknown>) => void;
}
```

Custom events for your app's analytics panel. Fire-and-forget: no reply, no acknowledgement.

```tsx
const { track } = useBlockAnalytics();
track('generate_clicked', { mode: 'txt2img', batch: 4 });
```

````md
🔴 **Only what your manifest DECLARES is recorded.** Declare every event, and
every property it carries, under `analytics.events` in `block.manifest.json`.
Events are accepted against the APPROVED manifest, so a reviewer sees what your
app tracks:

```json
"analytics": {
  "events": {
    "generate_clicked": {
      "description": "User pressed Generate",
      "properties": {
        "mode": { "type": "enum", "values": ["txt2img", "img2img"] },
        "batch": { "type": "number" },
        "advanced": { "type": "boolean" }
      }
    }
  }
}
```

| You send | Production |
|---|---|
| A declared event, declared properties of the declared type | Recorded |
| An event the manifest does not declare | Counted as a drop; its name and properties are not stored |
| A property the event does not declare | Dropped; the rest of the event is recorded |
| A value of the wrong type, or a string that is not one of the enum's values | Dropped; the rest of the event is recorded |

- **Types are `enum`, `number` and `boolean`.** There is no free-text string, so
  a prompt, an email or a username cannot be recorded. A `number` is not
  range-limited: do not use one to carry an identifier.
- **Names** are lowercase snake_case (a letter, then up to 63 of `a-z`, `0-9`,
  `_`). At most 50 events per app and 10 properties per event.
- **Limits.** Each mount of your app may send 10 events a second and 500 in
  total, in bodies of at most 32 KiB. An event over a limit is dropped in the
  browser and counted nowhere, so the panel's numbers are floors.
- **Where.** Events are recorded only from the production site.
- **What owners see.** Aggregates in the app's analytics panel: per declared
  event, counts, unique signed-in viewers and property breakdowns. Signed-out
  viewers are counted as events, never identified. The team's own activity is
  excluded by default. Individual events are never shown.

**Check it locally.** Pass your manifest to `createLiveHost` (see
[`/live`](#in-a-devlive-harness)); in `dev:live` the console then warns once per
undeclared event, undeclared property, or value of the wrong type. Every
`starters/examples/*` harness does this.
````

**`useDirectLoad`**

```ts
useDirectLoad(options?: UseDirectLoadOptions): UseDirectLoad
```

Detect a DIRECT (unembedded) top-level load of a block and, after a short grace period, report it so the SDK can show an "Open on Civitai" fallback instead of hanging on the perpetual loading state. Returns `true` ONLY when BOTH hold: 1. The block is TOP-LEVEL (`window.self === window.top` — not in the host iframe), AND 2. No `BLOCK_INIT` has landed (`ready` is still `false`) within `timeoutMs`. This is precise by construction: - An EMBEDDED block (framed) is never top-level → always `false`, even before `ready`. The embedded happy path is untouched. - The dev harness / `createMockHost` runs the block top-level BUT posts `BLOCK_INIT` immediately (a `setTimeout(0)` macrotask), so `ready` flips long before `timeoutMs` and the timer is cleared → always `false`. The dev flow is untouched. - A real direct load (nobody sends `BLOCK_INIT`) stays top-level + not-ready past `timeoutMs` → `true`. Once `ready` flips it stays authoritative: this can never return `true` while `ready` is `true`, so a late init can't leave a stuck fallback.

**`useNestedDocument`**

```ts
useNestedDocument(options?: UseNestedDocumentOptions): UseNestedDocument
```

```ts
interface UseNestedDocument {
  srcDoc: string | null;
  status: NestedDocumentStatus;
  error: Error | null;
}
```

Fetch one of your OWN bundled documents and get back a `srcdoc` string with an absolute `<base href>` injected — the only way a block can embed a nested document of its own. 🔴 PREFER NOT TO NEED THIS. A plain `<iframe src="/game/index.html">` of your own bundle **cannot load**, and no manifest change fixes it. An engine build (Defold, Unity, Phaser) is a `<canvas>` plus a JS loader and normally mounts directly into the block's own document, which avoids the whole problem class; reach for this hook only when a separate document is genuinely required. WHY, measured, in ONE place: the header of `@civitai/app-sdk`'s `src/blocks/nestedDocument.ts`. It carries the opaque-origin / `frame-ancestors` / `X-Frame-Options` derivation, the five-row DATED EXTERNAL platform matrix (verified by nothing in this repo — re-measure it if the platform's sandbox tiers or response headers change), and the known limits of the `<base>` rewrite. Do not restate any of it here: it was duplicated across 11 surfaces with nothing in the repo checking them for agreement, which is exactly how two measured claims in these files' own test headers went stale. 🔴 THE STRING IS NOT SANITIZED. It is your own markup and scripts, verbatim; pass a `src` you control, and put a `sandbox` attribute on the iframe. Changing `src` restarts the fetch and aborts the previous one — `status` goes back to `'loading'` in the SAME render that changes `src`, so no paint ever shows a stale `srcDoc` as `'ready'` beside a new `src`. Unmounting aborts the in-flight fetch, and no state is written after it. A fetch that never settles is bounded: after {@link NESTED_DOCUMENT_TIMEOUT_MS} it is aborted and `status` becomes `'error'` with a message naming the timeout. A timeout is distinguished from the hook's own aborts (unmount, a `src` change) — those stay silent, as they must.

````tsx
```tsx
const { srcDoc, status, error } = useNestedDocument({ src: '/game/index.html' });
if (status === 'error') return <p>Could not load the game: {error?.message}</p>;
if (status !== 'ready') return <p>Loading…</p>;
return <iframe title="game" sandbox="allow-scripts" srcDoc={srcDoc ?? undefined} />;
```
````

<!-- END GENERATED: hooks/context -->
</HooksReference>
