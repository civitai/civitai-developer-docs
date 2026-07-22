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

::: warning Packages publishing in progress
`@civitai/theme`, `@civitai/components`, and `@civitai/components-react` are at
`0.1.0` and publishing to npm is in progress. Until they land, the `npm i` /
CDN steps below won't resolve. The [Components reference](../reference/components)
already documents the full attribute contract.
:::

## Themed components in generic HTML

The headline: **you don't need React to use Civitai's components.** Load two
stylesheets — the tokens and the component CSS — then write HTML with the
`data-civitai-ui` attributes. That's the whole integration.

```html
<!-- 1. Load the design tokens + the component CSS (order-independent). -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@civitai/theme/styles.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@civitai/components/styles.css" />

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
