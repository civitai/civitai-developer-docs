---
title: Theming & the design system
description: Civitai's dual-consumption design system — the same themed components as generic attribute-driven HTML for any framework, or as thin React bindings. Covers the 3-layer model (@civitai/theme tokens, @civitai/components CSS, @civitai/components-react), plain-HTML and React setup, light/dark theming, and the @layer override model.
sources:
  - civitai-app-starters:packages/civitai-components/MARKUP.md
  - npm:@civitai/theme@0.1.0
  - npm:@civitai/components@0.1.0
  - npm:@civitai/components-react@0.1.0
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

::: tip Published at `0.1.0` — use the pinned CDN URLs
`@civitai/theme`, `@civitai/components`, and `@civitai/components-react` are
published to npm at `0.1.0`, so the `npm i` and CDN steps below resolve today.
Load the CSS from the **pinned** URLs shown here (`@0.1.0`) via
[unpkg](https://unpkg.com): jsDelivr does **not** honor the package `exports`
alias, so the bare `cdn.jsdelivr.net/npm/@civitai/theme/styles.css` path **404s**
there (a silently unstyled page). unpkg resolves the alias; if you must use
jsDelivr, point at the explicit `dist/` path
(`cdn.jsdelivr.net/npm/@civitai/theme@0.1.0/dist/tokens.css`). The
[Plain HTML quickstart](#plain-html-quickstart) below is a complete, copy-paste
page.
:::

## Themed components in generic HTML

The headline: **you don't need React to use Civitai's components.** Load two
stylesheets — the tokens and the component CSS — then write HTML with the
`data-civitai-ui` attributes. That's the whole integration.

```html
<!-- 1. Load the design tokens + the component CSS (order-independent).
     Pin the version and load from unpkg — jsDelivr doesn't resolve the exports alias. -->
<link rel="stylesheet" href="https://unpkg.com/@civitai/theme@0.1.0/styles.css" />
<link rel="stylesheet" href="https://unpkg.com/@civitai/components@0.1.0/styles.css" />

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

    <!-- Pinned CDN URLs. unpkg resolves the package `exports` alias; jsDelivr's
         bare `@civitai/theme/styles.css` 404s (use its explicit dist/ path). -->
    <link rel="stylesheet" href="https://unpkg.com/@civitai/theme@0.1.0/styles.css" />
    <link rel="stylesheet" href="https://unpkg.com/@civitai/components@0.1.0/styles.css" />

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
In the light theme `--civitai-color-surface` and `--civitai-color-surface-2` are
the **same** color (`#fefefe`), so a borderless `card` sits invisibly on the page
background. Add `data-with-border="true"` (as above) — or your own border — to
give a light-mode card a visible edge. In dark mode the two surfaces differ
(`#1A1B1E` vs `#25262B`), so a card reads even without a border.
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

## Where to go next

- [Components reference](../reference/components) — the 10 components, their
  `data-civitai-ui` names, enumerable attributes, and ARIA/role markup
  (generated from `MARKUP.md`).
- [Quickstart](./quickstart) — scaffold and run a block.
- [Concepts](./concepts) — the block / host / slot / bridge model, including how
  the host passes the active theme to your block.
