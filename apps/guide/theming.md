---
title: Theming & the design system
description: Civitai's design system — tokens, framework-agnostic CSS, custom elements and React bindings — with setup, light/dark theming and the @layer override model.
sources:
  - civitai-app-starters:packages/civitai-components/MARKUP.md
  - npm:@civitai/theme@0.5.2
  - npm:@civitai/components@0.10.1
  - npm:@civitai/components-react@0.9.2
---

# Theming & the design system

Civitai's UI components come two ways: as **framework-agnostic HTML** styled by
`data-*` attributes (author the markup yourself), and as self-styling
`<civitai-*>` **custom elements** (behaviour and ARIA wiring supplied). Either
works in plain HTML, Svelte, Vue, Solid or vanilla JS; in React,
`@civitai/components-react` gives you the elements as typed bindings.

**The two sets differ — pick by what you need.** The elements include `modal`,
`menu`, `switch` and `table`, which have no `data-civitai-ui` contract; `radio`
is a sheet component with no `<civitai-radio>` element (the element route uses
one `<civitai-radio-group>` taking its options as a `data` property). The sheet
has no `tabs`, but its `segmented-control` has a `role="tablist"` mode. Derive
each set rather than trusting this list: the sheet's is the
[Components reference](../reference/components), the elements' is the
`tagName`s in the package's `custom-elements.json`.

::: tip Not the same as `@civitai/blocks-react`
This design system is the **presentational** layer. It is independent of, and
composable with, the block **runtime** SDK (`@civitai/blocks-react`, its hooks
and `/ui` pack), which handles the host bridge, viewer, token and slots.
:::

## The three layers

The system is three packages, each a layer you can adopt independently:

| Layer | Package | What it is | You use it when… |
|-------|---------|-----------|------------------|
| **1. Tokens** | `@civitai/theme` | `--civitai-*` design tokens generated from Civitai's Mantine v7 theme — as a CSS-variables stylesheet, JS token objects, and a [DTCG](https://tr.designtokens.org/) JSON file. | you want Civitai's colors/spacing/typography as raw values. |
| **2. Components (CSS + elements)** | `@civitai/components` | Two independent ways to consume it: attribute-driven, framework-agnostic CSS styled via `data-civitai-ui="<name>"` + `data-variant`/`data-size` (wrapped in `@layer civitai.components`), and the self-styling `<civitai-*>` custom elements, which carry the behaviour and ARIA wiring in shadow DOM. | you want themed components in **any** framework (or none) — the CSS if you author the markup, the elements if you want the behaviour too. |
| **3. React bindings** | `@civitai/components-react` | `@lit/react` wrappers around the `<civitai-*>` custom elements, with props and events typed from the element classes. | your block is React and you want typed props. |

`@civitai/components` builds on `@civitai/theme`'s tokens. `@civitai/components-react`
binds the `<civitai-*>` elements, which style themselves in shadow DOM — since
`0.9.0` it does NOT render layer 2's markup. To use the elements without React,
`import '@civitai/components/register'` if you bundle, or load the
self-registering `elements.js` from the package root via a CDN
`<script type="module">` if you do not (a bare specifier does not resolve in a
browser). Neither defines every element — see
[the elements guide](./elements#register-the-elements).

::: tip Pin each package's version separately in CDN URLs
The packages version **independently** — this page uses `@civitai/theme@0.5.2`,
`@civitai/components@0.10.1` and `@civitai/components-react@0.9.2` — so copy each
URL as written. A version a package never published 404s, which shows only as
an unstyled page. An **older** pin returns a healthy `200` with old CSS: a stale
`@civitai/components` leaves newer components bare (`tooltip`, `toast`,
`image`, `slider`) or partially styled (`select`, `checkbox`, `radio`,
`segmented-control`); a stale `@civitai/theme` drops newer tokens, so
backgrounds and accents vanish. If markup that follows the current
[Components reference](../reference/components) looks off, check your pins
first.

`@civitai/theme` and `@civitai/components` each ship a package-root
`styles.css`, served by [jsDelivr](https://cdn.jsdelivr.net) and
[unpkg](https://unpkg.com) at `<host>/@civitai/<pkg>@<version>/styles.css`.
`@civitai/components-react` ships **no stylesheet** (that URL 404s): each
element carries its own CSS and injects the `@civitai/theme` tokens on first
mount. The [Plain HTML quickstart](#plain-html-quickstart) below is a complete,
copy-paste page.
:::

## Themed components in generic HTML

**You don't need React.** Load two stylesheets — the tokens and the component
CSS — then write HTML with the `data-civitai-ui` attributes.

This gives you the *look* only — no behaviour, no encapsulation. A `button`'s
loading state (`aria-busy` + `disabled` + the loader span) and a
`text-input`'s label/description/error ARIA relationships are markup **you**
author to the contract. The `<civitai-*>` elements wire these for you.

```html
<!-- 1. Load the design tokens + the component CSS (order-independent).
     Pin each package at its own version — they do not share one.
     Swap unpkg.com for cdn.jsdelivr.net/npm if you prefer jsDelivr. -->
<link rel="stylesheet" href="https://unpkg.com/@civitai/theme@0.5.2/styles.css" />
<link rel="stylesheet" href="https://unpkg.com/@civitai/components@0.10.1/styles.css" />

<!-- 2. Write markup with the data-attributes — styled identically to React. -->
<button data-civitai-ui="button" data-variant="filled" data-size="md">Generate</button>

<div data-civitai-ui="text-input">
  <label data-civitai-ui-label for="prompt">Prompt</label>
  <input data-civitai-ui-control id="prompt" placeholder="a cat astronaut" />
</div>
```

If you bundle your own JS, you can inject both stylesheets from the package
instead of the CDN `<link>`s — `injectStyles()` adds the tokens **and** the
component CSS once, idempotently:

```html
<script type="module">
  import { injectStyles } from '@civitai/components';
  injectStyles();
</script>
```

::: warning FOUC — CDN CSS loads *after* first paint
A CDN `<link>` (or an async `injectStyles()`) resolves after first paint, so a
preloaded or server-rendered page can flash **unthemed content**. If you SSR or
preload, **self-host** the two stylesheets, **inline the critical CSS** into
`<head>`, or call `injectStyles()` synchronously before your block renders. For
a client-rendered block mounted after load, the CDN `<link>` is fine.
:::

Every component's exact markup — required elements, `data-*` attributes, and
ARIA/role wiring — is in the [Components reference](../reference/components),
generated from
[`MARKUP.md`](https://github.com/civitai/civitai-app-starters/blob/main/packages/civitai-components/MARKUP.md),
the source of truth for hand-written markup. It is **not** what the React
bindings render: since `@civitai/components-react@0.9.0` those bind the custom
elements, which style themselves in shadow DOM.

## Plain HTML quickstart

Copy this into an `index.html` and open it: a themed page with a working
light/dark toggle — no build step, no framework, no install.

::: warning Paint the page background yourself
The tokens don't style `<body>`. Without the `body { background/color }` rule
below, the page around the components is unthemed (e.g. white in dark mode).
:::

```html
<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Civitai design system — plain HTML</title>

    <!-- Pinned CDN URLs, each package at its own version (unpkg or jsDelivr). -->
    <link
      rel="stylesheet"
      href="https://unpkg.com/@civitai/theme@0.5.2/styles.css"
    />
    <link
      rel="stylesheet"
      href="https://unpkg.com/@civitai/components@0.10.1/styles.css"
    />

    <style>
      /* The tokens don't paint the page — do it from the body/text tokens. */
      body {
        background: var(--civitai-color-body);
        color: var(--civitai-color-text);
        font-family: system-ui, sans-serif;
        margin: 0;
        padding: 2rem;
      }
    </style>
  </head>
  <body>
    <div data-civitai-ui="stack" data-gap="md">
      <div data-civitai-ui="group" data-gap="sm">
        <button data-civitai-ui="button" data-variant="filled">Generate</button>
        <button data-civitai-ui="button" data-variant="outline">Cancel</button>
        <span data-civitai-ui="badge" data-variant="light">beta</span>
        <!-- Toggle button — flips data-theme on <html> (see the script below). -->
        <button id="theme-toggle" data-civitai-ui="button" data-variant="subtle">
          Toggle theme
        </button>
      </div>

      <!-- data-with-border makes the card visible in LIGHT mode (see note below). -->
      <div data-civitai-ui="card" data-with-border="true" data-padding="md">
        <div data-civitai-ui="stack" data-gap="sm">
          <div data-civitai-ui="text-input">
            <label data-civitai-ui-label for="prompt">Prompt</label>
            <input data-civitai-ui-control id="prompt" placeholder="a cat astronaut" />
          </div>
          <div data-civitai-ui="alert" data-color="info" role="alert">
            <div data-civitai-ui-alert-body>
              <div data-civitai-ui-alert-title>Heads up</div>
              Edit the prompt, then hit Generate.
            </div>
          </div>
        </div>
      </div>
    </div>

    <script>
      // 3-line theme toggle: read the current theme off <html>, flip it, write it back.
      const root = document.documentElement;
      document.getElementById('theme-toggle').addEventListener('click', () => {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      });
    </script>
  </body>
</html>
```

::: warning Light-mode cards need a border {#light-mode-cards-need-a-border}
In the light theme `--civitai-color-body`, `--civitai-color-surface`, **and**
`--civitai-color-surface-2` are all `#fefefe`, so a borderless `card` is
invisible on a token-painted page. Add `data-with-border="true"` (as above), or
your own border or box-shadow. This mirrors Civitai's own Mantine light palette,
so the tokens will not be re-tinted.
:::

## Themed components in React

`@civitai/components-react` gives a React block the elements as typed bindings,
with no `<link>`s to add. Handlers receive the **DOM event**
(`onChange={(e) => e.target.value}`), and server rendering is best-effort —
where server output matters, write the `<civitai-*>` tag directly in JSX, since
attributes survive SSR and properties do not.

```tsx
import { CivitaiButton, CivitaiStack, CivitaiTextInput } from '@civitai/components-react';

export function GenerateForm() {
  return (
    <CivitaiStack gap="md">
      <CivitaiTextInput label="Prompt" placeholder="a cat astronaut" />
      <CivitaiButton variant="filled" size="md" loading={false}>
        Generate
      </CivitaiButton>
    </CivitaiStack>
  );
}
```

**A binding prop is assigned as a PROPERTY on every render** (`@lit/react`
skips dirty checking), so a hard-coded `value="…"` or `checked` **discards what
the viewer typed** the next time the enclosing component renders — which is why
the example sets no starting value. Starting values and form reset differ
between React 18 and 19; read the element's `value` docstring
(`@civitai/components/dist/elements/field-base.d.ts`) and test against the
React major you ship.

<!-- 🔴 DO NOT DERIVE A FIFTH VERSION OF THE PARAGRAPH THAT USED TO SIT HERE.
     Four consecutive audit rounds each found the PREVIOUS round's replacement
     wrong. Every one was a confident explanation of how to get a reset-correct
     default, written under pressure to supply a reason:
       1. "React's `defaultValue` is a DOM attribute the element never reads" —
          the conclusion held, the mechanism was wrong: React 18 treats
          `defaultValue` as a RESERVED prop and never writes it at all.
       2. "write the `<civitai-*>` tag so it lands as an attribute" — true on
          React 18, FALSE on React 19 (property when the element has one), and
          BOTH majors are in `@civitai/components-react`'s peer range.
       3. "`value` reflects only on `civitai-checkbox`, so for the fields the
          property is all there is" — wrong twice. It reflects on five elements
          (checkbox, switch, tabs, menu-item, progress), and the follow-on was
          false outright: `CivitaiField` declares `value: {}`, so the ATTRIBUTE is
          observed on every field element — `field-base.d.ts` says "The `value`
          ATTRIBUTE is the default, as on a native input". What the fields lack is
          REFLECTION (property -> attribute), which is a different thing. That
          draft also told the reader to derive the list from
          `custom-elements.json`, which cannot settle it: the manifest carries no
          `CivitaiField` declaration, so it lists no `value` on the fields.
       4. "no React route gives you one — set the attribute yourself,
          `ref={(el) => el?.setAttribute('value', '30')}`" — wrong twice again. A
          raw tag under React 18 both sets the attribute and survives re-renders,
          so a working React route does exist there; and the inline-arrow ref
          REPRODUCES the defect this callout warns about, because @lit/react
          forwards the user ref through `useCallback(cb, [r])` — a new arrow each
          render detaches and reattaches, re-running setAttribute and re-asserting
          the stale value.
     The verified claim is the first paragraph above, measured twice in a real
     browser. Everything past it was a characterisation nobody had measured across
     both React majors. If you need to document defaults, MEASURE the major you
     ship first and say which one you measured. -->


The props come from the element classes: `CivitaiButton` takes `variant` / `size` /
`loading` / `fullWidth` / `color` / `href`; the field inputs take
`label` / `description` / `error` / `required` and wire up
`htmlFor` / `aria-describedby` / `aria-invalid` for you. `react` and `react-dom`
`^18 || ^19` are peer dependencies. See the
[Components reference](../reference/components) for every component's props.

## Light and dark themes

Set `data-theme="light"` or `data-theme="dark"` on any ancestor — typically
`<html>` or your block root — and every token (and so every component)
re-resolves from that scope. With no attribute the **dark** palette applies and
the OS preference is ignored: since `@civitai/theme@0.5.0` the dark values live
directly on `:root` and the stylesheet declares no `prefers-color-scheme` block
in either direction.

**Only `light` and `dark` select a token block** — any other value inherits
the dark base. `BLOCK_INIT`'s own `theme` is **required**, so `payload.theme` is
safe to write directly; `payload.context.theme` (model-slot/page context) and
the direct-load init fragment's `theme?` are optional, and an unguarded
`root.dataset.theme = ctx.theme` writes `"undefined"` — silently dark.

If you stamp `data-theme="light"` (common before the default changed), keep it.
A `dark` stamp is now redundant on its own — but inheritance takes the NEAREST
`[data-theme]` ancestor, and a component reading `document.documentElement` (as
`BlockGate` does) may rely on it.

```html
<html data-theme="dark">
  <!-- every data-civitai-ui component below renders in the dark palette -->
</html>
```

In an embedded block, the host hands you the viewer's active theme over the
`BLOCK_INIT` handshake — reflect it onto your root's `data-theme` so your block
matches the surrounding Civitai UI (see
[Concepts → the bridge](./concepts#the-host-block-bridge)).

## Overriding styles — the `@layer` model {#overriding-styles}

Every rule `@civitai/components` ships lives in `@layer civitai.components`. Because
**unlayered CSS always beats layered CSS** regardless of specificity, your own
plain CSS overrides the component styles with **no `!important` and no specificity
war**:

```css
/* Your unlayered rule wins over @layer civitai.components — no !important needed. */
[data-civitai-ui='button'][data-variant='filled'] {
  border-radius: 999px;
}
```

::: warning This rule is double-edged
An existing app's unlayered global rules (`button {}`, `input {}`, a reset,
utility classes) also win, so components render **unthemed with no error**.
Adding the design system to an existing app? Read
[Theming an existing app](#retrofit) first.
:::

To retheme rather than restyle, redeclare a token locally — the components read
`--civitai-*` custom properties, so overriding one cascades to every component in
that scope:

```html
<!-- Recolor just this subtree by overriding the primary-color token. -->
<div style="--civitai-color-primary: #a259ff">
  <button data-civitai-ui="button" data-variant="filled">Custom purple</button>
</div>
```

Use a **token override** to recolor or respace consistently, and an
**unlayered rule** for a structural change to one component.

**Scope a token override — never declare one at `:root`.** The token sheet
itself is unlayered, so an app's `:root { --civitai-color-primary: … }`
**ties** with it, and the later stylesheet wins — with `useBlocksStyles()`
injecting from a `useEffect`, that is usually the tokens, and your rebrand
silently does nothing. Scope it as above (an ancestor's inline style, or a class
on your block root). Details:
[Components reference](../reference/components#cascade-overriding).

## Theming an existing app (retrofit / incremental adoption) {#retrofit}

Adding the design system to an **existing app** with its own global CSS breaks
*silently*. This section covers the collision, the fix, CSS resets and
frameworks (Tailwind), a gentler token-only path, and self-hosting the CSS.

### The `@layer` collision (why your buttons look unthemed)

**Any unlayered rule beats *any* layered rule, regardless of specificity**, so
the global rules a real app already has —

```css
/* Typical existing-app CSS: a reset, element rules, utility classes — all UNLAYERED. */
button { background: #635bff; color: #fff; border-radius: 6px; }
input  { border: 1px solid #ccc; padding: 8px; }
```

— **win over** civitai's `[data-civitai-ui='button']` / `[data-civitai-ui='text-input']`
styles, even though the civitai selectors are more specific. Nothing errors.

The tell is a **partial theme**: badges, cards, alerts and loaders are themed,
but **buttons and inputs keep your old styles**.

### The fix — put your legacy CSS in a lower layer (mind the parse order) {#the-layer-fix}

Move your existing CSS into a layer that sorts **below** `civitai`:

1. Declare the layer order **`@layer app, civitai;`** (later layers win).
2. Wrap your existing CSS in `@layer app { … }`.

**Layer order is set at the *first encounter* of each name**, so the
`@layer app, civitai;` statement **must appear before the civitai `<link>`
tags** — otherwise `civitai` registers first, `app` sorts after it, and your old
styles win again.

```html
<head>
  <!-- 1. Declare layer ORDER first — app sorts BELOW civitai.
          MUST come before the civitai <link>s (first-encounter ordering). -->
  <style>@layer app, civitai;</style>

  <!-- 2. Now load the civitai CSS. Its @layer civitai.components slots ABOVE app. -->
  <link rel="stylesheet" href="https://unpkg.com/@civitai/theme@0.5.2/styles.css" />
  <link rel="stylesheet" href="https://unpkg.com/@civitai/components@0.10.1/styles.css" />

  <!-- 3. Wrap your existing/global CSS in the lower `app` layer. -->
  <style>
    @layer app {
      button { background: #635bff; color: #fff; border-radius: 6px; }
      input  { border: 1px solid #ccc; padding: 8px; }
      /* …your reset, element rules, utility classes… */
    }
  </style>
</head>
<body>
  <!-- Now this renders in the civitai blue, not your #635bff. -->
  <button data-civitai-ui="button" data-variant="filled">Generate</button>
</body>
```

Any layer name works (`legacy`, `base`, your app's name), as long as it comes
**before** `civitai` in a leading `@layer …;` list.

### Coexisting with an existing CSS reset / framework (Tailwind, etc.)

A **CSS reset or framework normalize** doesn't just recolor a component — it
**strips it to nothing**. **Tailwind's Preflight** ships this, **unlayered**:

```css
/* Tailwind Preflight (excerpt) — UNLAYERED. Zeroes out every button. */
button {
  background-color: transparent;
  background-image: none;
  padding: 0;
  border: 0;
}
```

A correct `data-civitai-ui="button" data-variant="filled"` then renders as
**bare text** — no fill, padding or border, and no error. Apply the
[layer recipe](#the-layer-fix) to your *entire* stylesheet, the framework reset
included. **Tailwind v4** makes that a one-liner, because each `@import` accepts
a `layer(…)`:

```css
/* app.css — Tailwind v4. Preflight + utilities all land in @layer app. */
@layer app, civitai.components;   /* app sorts BELOW civitai.components */

@import "tailwindcss" layer(app); /* Preflight, utilities, everything → @layer app */
```

If you can't add `layer(app)` to the import (older Tailwind, or a pre-compiled
`tailwind.css` you don't control), wrap the compiled output in `@layer app { … }`
by hand instead — same effect, same ordering rule.

::: warning The first-encounter trap applies here too
The leading `@layer app, civitai.components;` statement must be **the first place
either layer name is seen** — before the civitai `<link>`s *and* before Tailwind's
`@import`. If Preflight registers a bare `app` layer first, the order flips and
you are back to bare text.
:::

### The gentle option — consume tokens, keep your own markup

The lowest-friction path is to keep your own markup and consume only the
**`--civitai-*` design tokens** in your CSS — colors, radius, spacing, fonts.
With no layered component rules there is **no `@layer` fight**, and you need
only the tokens stylesheet (`@civitai/theme`).

```html
<!-- Just the tokens — no component CSS, no @layer collision. -->
<link rel="stylesheet" href="https://unpkg.com/@civitai/theme@0.5.2/styles.css" />
```

Then restyle your own component by swapping hard-coded values for tokens:

```css
/* BEFORE — your custom button, hard-coded brand values. */
.my-btn {
  background: #635bff;
  color: #ffffff;
  border-radius: 6px;
  padding: 8px 16px;
}

/* AFTER — same element/class, now painted from civitai tokens.
   Re-themes with light/dark automatically; no data-civitai-ui, no layer. */
.my-btn {
  background: var(--civitai-color-primary);
  color: var(--civitai-color-primary-fg);
  border-radius: var(--civitai-radius);
  padding: 8px 16px;
}
```

It re-resolves in dark mode from the same `data-theme` scope. Adopt the
`data-civitai-ui` components (with the `@layer` recipe) later, per component.
Either way, [light-mode surfaces are all `#fefefe`](#light-mode-cards-need-a-border),
so give a card or panel a border or shadow.

### Self-hosting / offline — vendoring the CSS

For an offline or self-contained app — and as the
[FOUC](#themed-components-in-generic-html) fix — **vendor** the CSS. Copy
**exactly two files**, one from each package:

| Copy this file (from the published package) | From package | It is |
|---|---|---|
| **`styles.css`** (the **package root**) | `@civitai/theme` | the `--civitai-*` design tokens |
| **`styles.css`** (the **package root**) | `@civitai/components` | the `@layer civitai.components` component CSS |

::: warning Which `styles.css`? Watch out for the decoys
`@civitai/theme` ships `styles.css` (root) **and** `dist/tokens.css`;
`@civitai/components` ships `styles.css` (root) **and** `dist/components.css`.
A CDN serves the root file; the package's `exports["./styles.css"]` points at
the `dist/` one. They are byte-identical. **Vendor the package-root
`styles.css` from each**, and don't cross the two packages' files.
:::

```html
<!-- Vendored, no CDN. Same two stylesheets, served from your own origin.
     Load theme BEFORE components (they read the tokens as custom properties,
     so they're technically order-independent — theme-first is the safe convention). -->
<link rel="stylesheet" href="/assets/civitai/theme.styles.css" />       <!-- @civitai/theme  → styles.css -->
<link rel="stylesheet" href="/assets/civitai/components.styles.css" />  <!-- @civitai/components → styles.css -->
```

Pin the packages at the version you vendored (`@civitai/theme@0.5.2`,
`@civitai/components@0.10.1`) and re-copy both files when you bump. With a
bundler, `import '@civitai/theme/styles.css'` and
`import '@civitai/components/styles.css'` resolve through `exports` instead.

## Where to go next

- [Components reference](../reference/components) — every component, its
  `data-civitai-ui` name, enumerable attributes, and ARIA/role markup
  (generated from `MARKUP.md`, which owns the list).
- [Quickstart](./quickstart) — scaffold and run a block.
- [Concepts](./concepts) — the block / host / slot / bridge model, including how
  the host passes the active theme to your block.
