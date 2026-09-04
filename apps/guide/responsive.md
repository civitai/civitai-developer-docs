---
title: Responsive blocks
description: The width your block measures is the slot the host gave it, not the device — so a media query inside a block is already a container query. Covers the --civitai-bp-* scale, useBlockBreakpoint(), the em-vs-px breakpoint trap, and what the design system already reflows for you.
sources:
  - npm:@civitai/blocks-react@0.45.1#useBlockBreakpoint
  - npm:@civitai/theme@0.3.1#breakpoints
  - npm:@civitai/components@0.4.1
---

# Responsive blocks

Your block runs in a sandboxed iframe, and that changes what "responsive" means
in a way that is easy to get backwards. This page is the contract: what you are
actually measuring, the scale to measure it against, and the two traps that
produce layouts which look right on your machine and wrong in production.

## The box you measure is the slot, not the device

Inside the iframe, `@media (max-width: …)`, `100vw` and `100dvh` resolve against
**the iframe's own viewport** — the box the host handed you — and not against
the browser window. So a media query written inside a block is *already* a
container query against your slot. You do not need `@container` to get that
behaviour, and you cannot use a media query to ask about the device.

Measured in headless Chromium 152 (host page held at 1440×900 for both runs;
only the iframe box changed):

| iframe box | `matchMedia('(max-width: 500px)')` | `100vw` | `100vh` / `100dvh` / `100svh` / `100lvh` |
|---|---|---|---|
| 430 × 320 | `true` | `430px` | `320px` |
| 900 × 640 | `false` | `900px` | `640px` |

Two things fall out of that table:

- **The 900px row is the control.** A `true` on its own would also be what a
  zero-width or failed-to-load iframe reports, so the value of the measurement
  is that the query *flips* with the iframe box while the window never moves.
- **`dvh`, `svh`, `lvh` and `vh` are the same number here.** Those units differ
  only when browser chrome expands and retracts over the viewport, and an
  iframe has none. Reach for `100dvh` if you like the habit — inside a block it
  buys you nothing over `100vh`, and neither one is the height of the user's
  phone.

## …and slot width is not monotonic in viewport width

This is the part that catches people. A wider window does **not** mean a wider
block:

- the `model.sidebar_top` slot is about **360px** wide at a 360px phone
  viewport, and only about **430px** at a 1440px desktop one;
- a page app (`app.page`) gets the host's whole content area, so the *same*
  block can be several times wider on that same desktop.

So "narrow" is not "phone", and "wide" is not "desktop". A 360px phone and a
desktop model sidebar are the *same layout problem*, and a block that infers
the device from its own width will be wrong on one of them. Design for the box.

::: warning Don't reach for the parent
There is no escape hatch to the real window size. The [trust
frame](./concepts#the-trust-frame) is the platform's primary security boundary:
your code cannot reach the parent page, so the host's dimensions are not
readable from inside the block (and yours are not readable from outside it).
Everything below works entirely within the frame.
:::

## The scale: `--civitai-bp-*` and `useBlockBreakpoint()`

Civitai's breakpoints ship as tokens in `@civitai/theme` and as a hook in
`@civitai/blocks-react`, so you never have to hard-code a number or hand-roll a
`ResizeObserver`.

| key | token | value |
|---|---|---|
| `xs` | `--civitai-bp-xs` | `480px` |
| `sm` | `--civitai-bp-sm` | `768px` |
| `md` | `--civitai-bp-md` | `1024px` |
| `lg` | `--civitai-bp-lg` | `1184px` |
| `xl` | `--civitai-bp-xl` | `1440px` |

Tier semantics are Tailwind's: a tier applies **at** its breakpoint and above.
Below `xs` is `base`, which is where both the phone and the model sidebar land.

### In CSS

```css
.layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}

/* 768px is --civitai-bp-sm — see the note below on why it is written out. */
@media (min-width: 768px) {
  .layout { grid-template-columns: 2fr 1fr; }
}
```

::: danger A custom property cannot appear in a media query condition
`@media (min-width: var(--civitai-bp-sm))` **does not work**. A media condition
is evaluated outside the cascade, where no element is in scope, so `var()` is
never substituted there — the condition is invalid and the rules inside it never
apply. Nothing errors and nothing warns; the styles are simply missing.

Measured in the same browser, with the window at 1000px and `--bp-sm` proven to
resolve to `768px`: the literal `@media (min-width: 768px)` applied and the
`var()` form did not. The literal is the control — without it, "the rule did not
apply" would not distinguish a dead condition from a probe that never ran.

So write the pixel value literally in a `@media` or `@container` condition, and
keep the token for the places that do substitute it — `width`, `max-width`,
`padding`, and any other property value.
:::

### In JavaScript

`useBlockBreakpoint()` observes an element — by default the block's own root —
and reports which tier it is in.

```tsx
import { useBlockBreakpoint } from '@civitai/blocks-react';

export function Layout() {
  const bp = useBlockBreakpoint();

  return (
    <div style={{ display: 'flex', flexDirection: bp.below('sm') ? 'column' : 'row' }}>
      <main>…</main>
      {bp.atLeast('md') && <aside>…</aside>}
    </div>
  );
}
```

- `tier` — `'base' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'`.
- `atLeast(key)` / `below(key)` — the comparators you want at a call site.
- `measured` — `false` until the first measurement lands. An unmeasured width
  resolves to `'base'`, which is indistinguishable from a genuinely narrow
  block. That is the right default (the slot is narrow more often than not), but
  if your narrow branch is a *structural* DOM swap rather than a style change,
  gate it on `measured && below('sm')` so it does not render and immediately
  undo itself.

The hook stores the resolved **tier**, not the width, and returns a
referentially stable object while the tier is unchanged — so dragging 200px
inside one tier re-renders your block zero times. That is also why it does not
hand you the raw width: doing so would cost a render per pixel, or be stale.

Pass a `ref` to measure a nested container instead of the root:

```tsx
import { useRef } from 'react';
import { useBlockBreakpoint } from '@civitai/blocks-react';

const ref = useRef<HTMLDivElement>(null);
const bp = useBlockBreakpoint(ref);
```

Need the numbers themselves — for a canvas, a virtualised list, or a
non-React framework? `@civitai/theme` exports them:

```ts
import { breakpoints, BREAKPOINT_KEYS } from '@civitai/theme';
// breakpoints.sm === 768
```

## The trap: two breakpoint scales, agreeing on exactly one key

Civitai's scale is **px**. Mantine's stock scale — which civitai never
overrides, and which every Mantine responsive prop uses — is **em**, and it is a
different set of numbers:

| key | civitai (`--civitai-bp-*`) | Mantine stock |
|---|---|---|
| `xs` | **480px** | 576px (36em) |
| `sm` | 768px | 768px (48em) |
| `md` | **1024px** | 992px (62em) |
| `lg` | **1184px** | 1200px (75em) |
| `xl` | **1440px** | 1408px (88em) |

They agree on `sm` and nowhere else. That single coincidence is what makes this
expensive: a spot-check at `sm` passes against the completely wrong scale, so
"I verified it" and "it is right" come apart. If you use Mantine inside your
block, its `hiddenFrom` / `visibleFrom` props are on the em scale while
`--civitai-bp-*` and `useBlockBreakpoint()` are on the px one — pick one and
stay on it rather than mixing them in the same layout.

## What the design system already reflows for you

Since `@civitai/components@0.4.0` you get some of this without writing anything
(0.4.0 is the arrival version, not the current pin — 0.4.1 is a docs-only release
whose `styles.css` is byte-identical):

- **`group` wraps by default.** A row of controls that no longer fits reflows
  onto another row instead of overflowing its box, and its children may shrink
  (`min-width: 0`) rather than pushing the row past its container.
- **Opt out per row with `data-nowrap="true"`** — for a deliberately
  horizontally-scrolling toolbar, which is the one case where overflow was the
  point.

```html
<div data-civitai-ui="group">…reflows…</div>
<div data-civitai-ui="group" data-nowrap="true">…stays on one line…</div>
```

This applies to bare markup and to `@civitai/components-react`'s `<Group>`.
`@civitai/blocks-react`'s `<Group>` already wrapped and is unchanged. See the
[components reference](../reference/components) for the full markup contract.

## The surface decides what "responsive" means

The two surfaces size your iframe differently, and the difference is not
cosmetic:

| | page app (`app.page`) | model slot (`model.*`) |
|---|---|---|
| iframe height | full content area; the host does **not** listen for `RESIZE_IFRAME` | sized to your content, clamped to the manifest's `iframe.minHeight` / `iframe.maxHeight` |
| `useBlockResize` | inert — it still posts, the host ignores it | honoured |
| typical width | the page content width | narrow, and roughly constant regardless of window width |

On a page app, size **to** the surface: let the host's box be your canvas and
lay out inside it. On a model slot, tell the host how tall you are with
[`useBlockResize`](../reference/hooks) and keep the layout single-column — you
are in a sidebar whether or not the window is wide.

## Checklist

- Never infer the device. The width you can see is the slot's.
- Use `--civitai-bp-*` / `useBlockBreakpoint()` rather than invented numbers.
- Write the literal px value inside a `@media` condition; a `var()` there is
  silently dead.
- If you also use Mantine props, remember they are on the em scale.
- Gate a *structural* narrow branch on `measured &&`, not on the tier alone.
- Let `group` wrap; reach for `data-nowrap="true"` only when a row must not.
- Check your block at `base` (≈360px) as well as wide — that is the model
  sidebar, not just a phone.
