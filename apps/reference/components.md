---
title: Components reference
description: The @civitai/components framework-agnostic component pack — each component's data-civitai-ui name, enumerable attributes, and the ARIA/role markup contract.
sources:
  - civitai-app-starters:packages/civitai-components/MARKUP.md
  - npm:@civitai/components/MARKUP.md
---
<!--
  GENERATED FILE — do not edit by hand.
  Produced by scripts/gen-appblocks-components.mjs from the canonical
  @civitai/components/MARKUP.md markup contract.
  To update: re-snapshot appblocks-snapshots/MARKUP.md from
  civitai-app-starters:packages/civitai-components/MARKUP.md, then re-run the generator.
-->

# Components

`@civitai/components` is a **framework-agnostic** pack of 10 presentational
components. The styling is driven entirely by `data-*` attributes, so any
HTML that follows the contract renders identically to the React bindings in
`@civitai/components-react`. This page is generated from that contract —
the canonical [`MARKUP.md`](https://github.com/civitai/civitai-app-starters/blob/main/packages/civitai-components/MARKUP.md)
that ships inside the `@civitai/components` package — so it never drifts from
the source of truth.

::: tip New to the design system?
Start with the [Theming & design system](../guide/theming) guide for the
3-layer model (tokens → framework-agnostic CSS → React bindings) and the
plain-HTML and React setup. This page is the per-component attribute reference.
:::

## Component summary

| Component | `data-civitai-ui` | Enumerable attributes |
|-----------|-------------------|-----------------------|
| Button | `button` | `data-variant`: filled (default) · light · outline · subtle<br>`data-size`: sm · md (default) · lg |
| TextInput | `text-input` | — |
| Textarea | `textarea` | — |
| NumberInput | `number-input` | — |
| Card | `card` | `data-padding`: sm · md · lg |
| Stack | `stack` | `data-gap`: sm · md · lg |
| Group | `group` | `data-gap`: sm · md · lg |
| Alert | `alert` | `data-color`: info · success · warning · error |
| Loader | `loader` | `data-size`: sm · md (default) · lg |
| Badge | `badge` | `data-variant`: filled (default) · light · outline<br>`data-size`: sm · md (default) · lg |

The exact element, required attributes, and ARIA/role wiring for each
component are reproduced verbatim from the canonical contract below.

## Setup

Load the tokens **and** the component CSS (order-independent, but load both):

```html
<link rel="stylesheet" href="https://unpkg.com/@civitai/theme@0.1.0/styles.css" />
<link rel="stylesheet" href="https://unpkg.com/@civitai/components@0.1.0/styles.css" />
```

Or, from JS: `import { injectStyles } from '@civitai/components'; injectStyles();`
(injects both tokens and component CSS, idempotently).

## Theming

Set `data-theme="light"` or `data-theme="dark"` on any ancestor (typically
`<html>` or the block root). All tokens re-resolve from that scope. Default
(no attribute) is the light palette.

## Cascade / overriding

Every shipped rule lives in `@layer civitai.components`. Your own **unlayered**
CSS always beats it — no `!important`, no specificity war. Override a token
locally by redeclaring the custom property (e.g.
`style="--civitai-color-primary: #a259ff"`).

---

## Components

Legend: **bold** = required attribute/element for correct styling + a11y.

### Button — `data-civitai-ui="button"`
- Element: **`<button>`** (or `<a role="button">` for links).
- `data-variant`: `filled` (default) · `light` · `outline` · `subtle`
- `data-size`: `sm` · `md` (default) · `lg`
- `data-full-width="true"` — stretch to container width.
- Loading: set **`aria-busy="true"`** and **`disabled`**; place a
  `<span data-civitai-ui="loader" data-size="sm" aria-hidden="true"></span>`
  as the first child.
- Icon slots: `<span data-civitai-ui-section="left|right">…</span>`.
- A11y: native `<button>` gives role/focus/keyboard for free. Icon-only buttons
  MUST have an `aria-label`.

```html
<button data-civitai-ui="button" data-variant="filled" data-size="md">Generate</button>
```

### TextInput — `data-civitai-ui="text-input"`
- Wrapper **`<div data-civitai-ui="text-input">`** containing, in order:
  - **`<label data-civitai-ui-label for="ID">`** (+ optional
    `<span data-civitai-ui-required aria-hidden="true">*</span>`)
  - optional `<span id="ID-desc" data-civitai-ui-description>`
  - **`<input data-civitai-ui-control id="ID">`**
  - optional `<span id="ID-err" data-civitai-ui-error role="alert">`
- Wire a11y: input `aria-describedby="ID-desc ID-err"`, and when invalid
  `aria-invalid="true"` + `data-invalid="true"` on the wrapper.

```html
<div data-civitai-ui="text-input">
  <label data-civitai-ui-label for="name">Name</label>
  <input data-civitai-ui-control id="name" />
</div>
```

### Textarea — `data-civitai-ui="textarea"`
Identical to TextInput but the control is **`<textarea data-civitai-ui-control>`**
(resizable vertically).

### NumberInput — `data-civitai-ui="number-input"`
Identical to TextInput; the control is **`<input type="number" data-civitai-ui-control>`**.

### Card — `data-civitai-ui="card"`
- `data-with-border="true"` — add a border.
- `data-padding`: `sm` · `md` · `lg`.
- A11y: use a landmark/heading inside as appropriate; the card itself is a
  presentational container (`<div>`/`<section>`/`<article>`).

### Stack — `data-civitai-ui="stack"`
Vertical flex. `data-gap`: `sm` · `md` · `lg` (default ~12px). Presentational
`<div>`.

### Group — `data-civitai-ui="group"`
Horizontal flex, items center-aligned. `data-gap`: `sm` · `md` · `lg`.

### Alert — `data-civitai-ui="alert"`
- **`role="alert"`** (or `role="status"` for non-urgent).
- `data-color`: `info` (default intent) · `success` · `warning` · `error`.
- Structure: optional icon, then
  **`<div data-civitai-ui-alert-body>`** with an optional
  `<div data-civitai-ui-alert-title>` and the message. Optional dismiss:
  `<button data-civitai-ui-alert-close aria-label="Dismiss">×</button>`.

```html
<div data-civitai-ui="alert" data-color="success" role="alert">
  <div data-civitai-ui-alert-body>
    <div data-civitai-ui-alert-title>Saved</div>
    Your changes are live.
  </div>
</div>
```

### Loader — `data-civitai-ui="loader"`
- `data-size`: `sm` · `md` (default) · `lg`.
- A11y: decorative inside a button → `aria-hidden="true"`. Standalone busy
  indicator → wrap/annotate with `role="status"` + an accessible label
  (e.g. visually-hidden "Loading").

### Badge — `data-civitai-ui="badge"`
- `data-variant`: `filled` (default) · `light` · `outline`.
- `data-size`: `sm` · `md` (default) · `lg`.
- Presentational `<span>`. If it conveys status, add an `aria-label`.

---

## React parity

`@civitai/components-react` renders exactly this markup. The
`html-vs-react-parity` browser test asserts `getComputedStyle()` is identical
between hand-written HTML (per this doc) and the React components, in both
themes — so this contract is executable, not aspirational.
