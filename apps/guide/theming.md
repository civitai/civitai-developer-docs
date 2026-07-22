---
title: Theming & the design system
description: Civitai's dual-consumption design system — the same themed components as generic attribute-driven HTML for any framework, or as thin React bindings. Covers the 3-layer model (@civitai/theme tokens, @civitai/components CSS, @civitai/components-react), plain-HTML and React setup, light/dark theming, and the @layer override model.
sources:
  - civitai-app-starters:packages/civitai-components/MARKUP.md
  - npm:@civitai/theme@0.1.1
  - npm:@civitai/components@0.1.1
  - npm:@civitai/components-react@0.1.1
---

# Theming & the design system

Civitai's UI components ship as a **dual-consumption design system**: the exact
same themed components are available as **generic, framework-agnostic HTML** —
styled purely by `data-*` attributes — *and* as thin **React bindings**. Build a
block in plain HTML, Svelte, Vue, Solid, or vanilla JS and it looks like Civitai;
build it in React and you get typed component props over the identical markup.

::: tip Not the same as `@civitai/blocks-react`
This design system (`@civitai/theme` / `@civitai/components` /
`@civitai/components-react`) is the **presentational** layer — tokens, CSS, and
UI primitives. It is independent of, and composable with, the block **runtime**
SDK (`@civitai/blocks-react`, its hooks and `/ui` pack). Use the design system
for look-and-feel; use the SDK for the host bridge, viewer, token, and slots.
:::

## The three layers

The system is three packages, each a layer you can adopt independently:

| Layer | Package | What it is | You use it when… |
|-------|---------|-----------|------------------|
| **1. Tokens** | `@civitai/theme` | `--civitai-*` design tokens generated from Civitai's Mantine v7 theme — as a CSS-variables stylesheet, JS token objects, and a [DTCG](https://tr.designtokens.org/) JSON file. | you want Civitai's colors/spacing/typography as raw values. |
| **2. Components (CSS)** | `@civitai/components` | Attribute-driven, framework-agnostic CSS for 10 presentational components, styled via `data-civitai-ui="<name>"` + `data-variant`/`data-size`. Wrapped in `@layer civitai.components`. | you want themed components in **any** framework (or none). |
| **3. React bindings** | `@civitai/components-react` | 10 thin `forwardRef` React components that render the layer-2 markup with typed props. | your block is React and you want typed props + refs. |

Layers stack downward: `@civitai/components` builds on `@civitai/theme`'s tokens,
and `@civitai/components-react` renders `@civitai/components`' markup. Adopt just
layer 1 for tokens, layers 1–2 for framework-agnostic components, or all three
for the React ergonomics.

::: tip Published at `0.1.1` — pin the version in the CDN URL
`@civitai/theme`, `@civitai/components`, and `@civitai/components-react` are
published to npm at `0.1.1`, so the `npm i` and CDN steps below resolve today.
As of `0.1.1` each package ships a real package-root `styles.css`, so **both
[jsDelivr](https://cdn.jsdelivr.net) and [unpkg](https://unpkg.com) resolve it** —
`cdn.jsdelivr.net/npm/@civitai/theme@0.1.1/styles.css` and
`unpkg.com/@civitai/theme@0.1.1/styles.css` both return the stylesheet (all four
URLs verified `200`). Just **pin the version** (`@0.1.1`) so a future major can't
change the CSS out from under you. The
[Plain HTML quickstart](#plain-html-quickstart) below is a complete, copy-paste
page.
:::

## Themed components in generic HTML

The headline: **you don't need React to use Civitai's components.** Load two
stylesheets — the tokens and the component CSS — then write HTML with the
`data-civitai-ui` attributes. That's the whole integration.

```html
<!-- 1. Load the design tokens + the component CSS (order-independent).
     Pin the version. Both CDNs work at 0.1.1 — swap unpkg.com for
     cdn.jsdelivr.net/npm if you prefer jsDelivr. -->
<link rel="stylesheet" href="https://unpkg.com/@civitai/theme@0.1.1/styles.css" />
<link rel="stylesheet" href="https://unpkg.com/@civitai/components@0.1.1/styles.css" />

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
A `<link>` to the CDN (or an async `injectStyles()`) resolves after the browser's
first paint, so a preloaded or server-rendered page can flash **unthemed content**
before the stylesheet arrives. If you SSR or preload, don't rely on the CDN
`<link>` alone: **self-host** the two stylesheets (serve them from your own origin
so they're on the critical path), **inline the critical CSS** into `<head>`, or
call `injectStyles()` synchronously before your block renders. For a
client-rendered block mounted after load, the flash is invisible and the CDN
`<link>` is fine.
:::

Every component's exact markup — required elements, `data-*` attributes, and the
ARIA/role wiring — is in the [Components reference](../reference/components),
generated from the canonical
[`MARKUP.md`](https://github.com/civitai/civitai-app-starters/blob/main/packages/civitai-components/MARKUP.md)
that ships inside `@civitai/components`. **`MARKUP.md` is the source of truth**:
any HTML that follows it renders identically to the React bindings (asserted by a
`getComputedStyle()` parity browser test in both themes).

## Plain HTML quickstart

Copy this into an `index.html`, open it in a browser, and you get a themed page
with a working light/dark toggle — no build step, no framework, no install. It
loads the two stylesheets from the pinned CDN URLs and uses a handful of
components straight from the [attribute contract](../reference/components).

::: warning Paint the page background yourself
The tokens don't style `<body>` — they only expose the `--civitai-*` custom
properties. Without the `body { background/color }` rule below, the components
are themed but the page around them is not (e.g. a white page in dark mode).
Paint the page from the surface/text tokens as shown.
:::

```html
<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Civitai design system — plain HTML</title>

    <!-- Pinned CDN URLs (version-pinned to 0.1.1). Both jsDelivr and unpkg
         resolve `@civitai/<pkg>@0.1.1/styles.css` — either host works. -->
    <link rel="stylesheet" href="https://unpkg.com/@civitai/theme@0.1.1/styles.css" />
    <link rel="stylesheet" href="https://unpkg.com/@civitai/components@0.1.1/styles.css" />

    <style>
      /* The tokens don't paint the page — do it from the surface/text tokens. */
      body {
        background: var(--civitai-color-surface);
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

::: warning Light-mode cards need a border
In the light theme `--civitai-color-body`, `--civitai-color-surface`, **and**
`--civitai-color-surface-2` are all the **same** color (`#fefefe`), so a
borderless `card` sits invisibly on a token-painted page background — nothing
separates the surface from the body. Add `data-with-border="true"` (as above) — or
your own border or box-shadow — to give a light-mode card a visible edge. In dark
mode the surfaces differ (body/surface `#1A1B1E` vs surface-2 `#25262B`), so a
card reads even without a border. (These token values are governed by the design
system's drift-guard — reach for a border or shadow, don't try to re-tint the
surface.)
:::

## Themed components in React

If your block is React, `@civitai/components-react` gives you the same components
as typed `forwardRef` primitives — no `data-*` attributes to remember, and refs
forward to the underlying DOM node. The bindings auto-inject the stylesheet and
tokens on first render, so there are no `<link>`s to add.

```tsx
import { Button, Stack, TextInput } from '@civitai/components-react';

export function GenerateForm() {
  return (
    <Stack gap="md">
      <TextInput label="Prompt" placeholder="a cat astronaut" />
      <Button variant="filled" size="md" loading={false}>
        Generate
      </Button>
    </Stack>
  );
}
```

The props mirror the attribute contract: `Button` takes `variant` / `size` /
`loading` / `fullWidth` / `leftSection` / `rightSection`; the field inputs take
`label` / `description` / `error` / `required` and wire up
`htmlFor` / `aria-describedby` / `aria-invalid` for you. `react` and `react-dom`
`^18 || ^19` are peer dependencies. See the
[Components reference](../reference/components) for every component's props.

## Light and dark themes

Both layers resolve their colors from `data-theme`. Set `data-theme="light"` or
`data-theme="dark"` on any ancestor — typically `<html>` or your block root — and
every token (and therefore every component) re-resolves from that scope. With no
attribute, the light palette is the default.

```html
<html data-theme="dark">
  <!-- every data-civitai-ui component below renders in the dark palette -->
</html>
```

In an embedded block, the host hands you the viewer's active theme over the
`BLOCK_INIT` handshake — reflect it onto your root's `data-theme` so your block
matches the surrounding Civitai UI (see
[Concepts → the bridge](./concepts#the-host-block-bridge)).

## Overriding styles — the `@layer` model

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
"Unlayered CSS always wins" is exactly what makes **intentional** overrides
effortless (above) — and exactly what makes a **retrofit** silently break. If you
drop the component CSS into an app that already has unlayered global rules
(`button {}`, `input {}`, a reset, utility classes), those rules win over the
layered component styles and your components render **unthemed with no error**. If
you're adding the design system to an existing app, read
[Theming an existing app](#theming-an-existing-app-retrofit-incremental-adoption)
below **before** you wire up the components.
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

Prefer a **token override** (a `--civitai-*` custom property) when you want to
recolor/respace consistently, and an **unlayered rule** when you need a
structural change to one component. Both compose cleanly with the layer.

## Theming an existing app (retrofit / incremental adoption)

Adding the design system to a **greenfield** block is easy — there's no CSS to
fight. Adding it to an **existing app** that already ships its own global CSS is
the case that bites, and it bites *silently*. This section is the retrofit
playbook: the one collision that breaks it, the recipe that fixes it, the sharper
form that shows up when your app ships a **CSS reset / framework** (Tailwind), the
gentler adoption path that sidesteps the collision entirely, and how to
**self-host** the CSS for an offline app.

### The `@layer` collision (why your buttons look unthemed)

`@civitai/components` ships every rule inside `@layer civitai.components`. Per the
CSS cascade, **any unlayered rule beats *any* layered rule, regardless of
specificity**. So the global rules a real app already has —

```css
/* Typical existing-app CSS: a reset, element rules, utility classes — all UNLAYERED. */
button { background: #635bff; color: #fff; border-radius: 6px; }
input  { border: 1px solid #ccc; padding: 8px; }
```

— **win over** civitai's `[data-civitai-ui='button']` / `[data-civitai-ui='text-input']`
styles, even though the civitai selectors are more specific. Nothing errors.

The tell is a **partial theme**: components that *don't* collide with a bare
element selector pick up the civitai look (badges, cards, alerts, loaders — there's
no global `[data-civitai-ui='badge']` in your app), while **buttons and inputs
stay in your old styles** because your unlayered `button {}` / `input {}` rules
outrank the layer. If your buttons and text fields look untouched but your badges
and cards are themed, this is why.

### The fix — put your legacy CSS in a lower layer (mind the parse order)

The fix is to move your existing CSS into a named cascade layer that sorts
**below** `civitai`, so civitai's layered rules win. Two parts, and the **order
matters**:

1. Declare the layer order **`@layer app, civitai;`** — this fixes `app` as
   lower-priority than `civitai` (later layers in the list win).
2. Wrap your existing/legacy CSS in `@layer app { … }`.

The catch: **layer order is set at the *first encounter* of each layer name.** If
the browser sees civitai's `@layer civitai.components { … }` (from the `<link>`)
*before* your `@layer app, civitai;` declaration, `civitai` registers first, your
later mention appends `app` *after* it, and `app` wins again — you're back to
orange buttons. So the `@layer app, civitai;` statement **must appear before the
civitai `<link>` tags.**

```html
<head>
  <!-- 1. Declare layer ORDER first — app sorts BELOW civitai.
          MUST come before the civitai <link>s (first-encounter ordering). -->
  <style>@layer app, civitai;</style>

  <!-- 2. Now load the civitai CSS. Its @layer civitai.components slots ABOVE app. -->
  <link rel="stylesheet" href="https://unpkg.com/@civitai/theme@0.1.1/styles.css" />
  <link rel="stylesheet" href="https://unpkg.com/@civitai/components@0.1.1/styles.css" />

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

::: tip Verified
This exact recipe was reproduced in a headless browser: with an unlayered
`button { background: orange }` rule the civitai button computes to
`rgb(255, 165, 0)` (orange — your CSS wins); after wrapping that rule in
`@layer app { … }` behind a leading `@layer app, civitai;`, the same button
computes to `rgb(34, 139, 230)` (`#228BE6`, civitai's `--civitai-color-primary`) —
the component wins. Move the `@layer app, civitai;` line *after* the `<link>`s and
it flips back to orange.
:::

Use whatever name you like for your layer (`legacy`, `base`, your app's name) — the
only rules are that it appears **before** `civitai` in a leading `@layer …;` list
and that your CSS is wrapped in it.

### Coexisting with an existing CSS reset / framework (Tailwind, etc.)

The collision above is bad enough when your app ships *element rules* (a stray
`button {}` recolors the component). It gets **sharper** when your app ships a
**CSS reset or framework normalize** — because a reset doesn't merely re-color the
component, it **strips it to nothing**. The worst offender is a utility framework's
base layer. **Tailwind's Preflight** ships this, **unlayered**:

```css
/* Tailwind Preflight (excerpt) — UNLAYERED. Zeroes out every button. */
button {
  background-color: transparent;
  background-image: none;
  padding: 0;
  border: 0;
}
```

Because unlayered CSS beats *any* layered rule, this Preflight reset wins over
`@layer civitai.components`. The result: a perfectly-authored
`data-civitai-ui="button" data-variant="filled"` renders as **bare, unstyled
text** — no fill, no padding, no border. The markup contract is satisfied and
nothing errors; the component is simply **invisible**. This is the exact point
where "unlayered CSS always wins" flips from a **feature** (effortless overrides,
above) into a **footgun** — the framework's reset is unlayered too, and it's
fighting the component instead of you.

The remedy is the same [layer recipe](#the-fix-—-put-your-legacy-css-in-a-lower-layer-mind-the-parse-order)
as above, applied to the framework: declare `@layer app, civitai.components;`
(so `app` sorts **below** civitai's components) and wrap your app's **entire
stylesheet — the framework reset included — in `@layer app { … }`.** Once the
Preflight reset lives in the lower `app` layer, civitai's component rules win and
the button paints.

For **Tailwind specifically**, wrap the compiled build in a layer rather than
hand-editing Preflight. In **Tailwind v4** each `@import` accepts a `layer(…)`,
so import Tailwind into the `app` layer:

```css
/* app.css — Tailwind v4. Preflight + utilities all land in @layer app. */
@layer app, civitai.components;   /* app sorts BELOW civitai.components */

@import "tailwindcss" layer(app); /* Preflight, utilities, everything → @layer app */
```

If you can't add `layer(app)` to the import (older Tailwind, a pre-compiled
`tailwind.css` you don't control, or any vendored framework build), wrap the
compiled output itself — same effect:

```html
<head>
  <!-- 1. Layer order FIRST — app below civitai.components.
          MUST precede the civitai <link>s (first-encounter ordering). -->
  <style>@layer app, civitai.components;</style>

  <!-- 2. Then the civitai CSS — its @layer civitai.components slots ABOVE app. -->
  <link rel="stylesheet" href="https://unpkg.com/@civitai/theme@0.1.1/styles.css" />
  <link rel="stylesheet" href="https://unpkg.com/@civitai/components@0.1.1/styles.css" />

  <!-- 3. Your compiled Tailwind (Preflight + utilities), wrapped in @layer app. -->
  <style>
    @layer app {
      /* …paste or @import your compiled tailwind.css here… */
      button { background-color: transparent; background-image: none; padding: 0; border: 0; }
    }
  </style>
</head>
<body>
  <!-- Now the component paints (civitai blue) instead of rendering as bare text. -->
  <button data-civitai-ui="button" data-variant="filled">Generate</button>
</body>
```

::: tip Verified — bare text → civitai blue
Reproduced headless with the real `@civitai/theme` + `@civitai/components@0.1.1`
CSS. With the Preflight-style `button { background: transparent; border: 0;
padding: 0 }` reset **unlayered**, the civitai button's computed
`background-color` is **`rgba(0, 0, 0, 0)`** (transparent — the reset wins, the
button is invisible). After declaring `@layer app, civitai.components;` and moving
that reset into `@layer app { … }`, the *same* button computes to
**`rgb(34, 139, 230)`** (`#228BE6`, `--civitai-color-primary` — the component
wins). Nothing else changed.
:::

::: warning `layer(app)` must not re-order the layer
Whether you use `@import "tailwindcss" layer(app)` or wrap the compiled output,
the leading `@layer app, civitai.components;` statement still has to be **the
first place either layer name is seen** (before the civitai `<link>`s / before
Tailwind's `@import`). If Tailwind's Preflight registers a bare `app` layer first,
the order flips and you're back to bare text — same first-encounter trap as the
[generic recipe](#the-fix-—-put-your-legacy-css-in-a-lower-layer-mind-the-parse-order).
:::

### The gentle option — consume tokens, keep your own markup

If you're adopting incrementally, the lowest-friction path is to **not adopt the
`data-civitai-ui` components at all.** Keep your existing elements, classes, and
markup, and just consume the **`--civitai-*` design tokens** in your own CSS —
colors, radius, spacing, fonts. You get Civitai's look on *your* components, and
because you're not introducing any layered component rules, **there's no `@layer`
fight to have** — you only need the tokens stylesheet (`@civitai/theme`), not the
component CSS.

```html
<!-- Just the tokens — no component CSS, no @layer collision. -->
<link rel="stylesheet" href="https://unpkg.com/@civitai/theme@0.1.1/styles.css" />
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

Your `.my-btn` is unlayered, so it simply reads the token values — no cascade
conflict, and it re-resolves in dark mode from the same `data-theme` scope. Adopt
the `data-civitai-ui` components (and the `@layer` recipe above) later, per
component, when you want the full styling for free. See
[Overriding styles](#overriding-styles-—-the-layer-model) for the token-override
mechanics.

::: tip Light-mode elevation still applies
Whichever path you take, remember the
[light-mode surfaces are all `#fefefe`](#plain-html-quickstart) — a borderless
card or panel blends into a token-painted body in light mode. Give it
`data-with-border="true"`, your own border, or a shadow; dark mode differentiates
the surfaces for you.
:::

### Self-hosting / offline — vendoring the CSS

For an offline, air-gapped, or fully self-contained app you'll want to **vendor**
the CSS into your own repo rather than depend on a CDN `<link>` at runtime (this
is also the [FOUC](#themed-components-in-generic-html) fix — served from your own
origin, the stylesheets are on the critical path). Copy **exactly two files**, one
from each package:

| Copy this file (in the published `0.1.1` package) | From package | It is |
|---|---|---|
| **`styles.css`** (the **package root**) | `@civitai/theme` | the `--civitai-*` design tokens |
| **`styles.css`** (the **package root**) | `@civitai/components` | the `@layer civitai.components` component CSS |

::: warning Which `styles.css`? Watch out for the decoys
Each package's tarball contains **more than one** CSS file, and the names overlap
confusingly — `@civitai/theme` ships `styles.css` (root) **and**
`dist/tokens.css`; `@civitai/components` ships `styles.css` (root) **and**
`dist/components.css`. **Vendor the package-root `styles.css` from each** — that is
exactly what the CDN URL `@civitai/<pkg>@0.1.1/styles.css` and the package's
`exports["./styles.css"]` map both resolve to (the root file and its `dist/`
target are byte-identical at `0.1.1`, so either works, but the root `styles.css`
is the unambiguous one to copy). Do **not** grab `dist/components.css` from
`@civitai/theme` or vice-versa — the filenames make it easy to cross the wires.
:::

```html
<!-- Vendored, no CDN. Same two stylesheets, served from your own origin.
     Load theme BEFORE components (they read the tokens as custom properties,
     so they're technically order-independent — theme-first is the safe convention). -->
<link rel="stylesheet" href="/assets/civitai/theme.styles.css" />       <!-- @civitai/theme  → styles.css -->
<link rel="stylesheet" href="/assets/civitai/components.styles.css" />  <!-- @civitai/components → styles.css -->
```

Pin the packages at the version you vendored (`@civitai/theme@0.1.1`,
`@civitai/components@0.1.1`) so a re-vendor is deliberate, and re-copy the two
`styles.css` files whenever you bump. If you use a bundler instead of static
files, `import '@civitai/theme/styles.css'` and `import '@civitai/components/styles.css'`
resolve through the same `exports` map — no manual copy needed.

## Where to go next

- [Components reference](../reference/components) — the 10 components, their
  `data-civitai-ui` names, enumerable attributes, and ARIA/role markup
  (generated from `MARKUP.md`).
- [Quickstart](./quickstart) — scaffold and run a block.
- [Concepts](./concepts) — the block / host / slot / bridge model, including how
  the host passes the active theme to your block.
