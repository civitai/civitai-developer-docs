---
title: Component showcase
description: Every <civitai-*> custom element in @civitai/components, live and themed, with the CSS-only data-civitai-ui fallback where one exists.
---

# Component showcase

A live tour of **`@civitai/components`**, component by component. Every section
leads with the **`<civitai-*>` custom element** — the default way to build a
Civitai App's UI, and what `civitai app init` scaffolds. The elements style
themselves in shadow DOM, inject the `@civitai/theme` tokens on first use and
carry their own keyboard and ARIA behaviour, so they work the same in plain
HTML, React, Vue, Svelte or Blazor.

Where the package's stylesheet has the same component, a collapsed
**CSS-only / no-JS** panel under the element shows it as hand-written
`data-civitai-ui` markup. Reach for that only when a page must run no
JavaScript: the markup is styling and nothing else, so focus handling, keyboard
navigation and ARIA state are yours to write. A few sections carry no such panel
— those elements have no stylesheet equivalent.

Every preview is rendered from the code shown under it and follows the site's
light/dark switch.

## Setup

**Elements, no build step** — one script tag:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@civitai/components/site-elements.js"></script>

<civitai-button variant="filled">Generate</civitai-button>
```

`site-elements.js` is the generic kit plus the Civitai vocabulary (rating
badges, tags, reactions, media cards); `elements.js` is the generic kit alone.
Neither defines `<civitai-sign-in-button>` or `<civitai-workflow-button>` — see
[Acting as the viewer](#acting-as-the-viewer). Building a Civitai App?
[Using the elements in a block](./guide/elements#register-the-elements) has the
table of which import defines which elements, and the token limits that apply
inside a block.

**Elements, with a bundler:**

```bash
npm install @civitai/components
```

```ts
import '@civitai/components/register-site'; // all but the two viewer elements, or:
import '@civitai/components/civitai-button/define'; // one element at a time
```

**React** — `@civitai/components-react` wraps these same elements as typed
components, with props and events from the element classes — see
[Themed components in React](./guide/theming#themed-components-in-react).

**CSS-only** — load the tokens and the component stylesheet (order-independent),
then set `data-theme="light"` or `data-theme="dark"` on any ancestor:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@civitai/theme/styles.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@civitai/components/styles.css" />
```

The markup contract is in the [Components reference](/apps/reference/components).

### How the elements behave

| | |
|---|---|
| **Attributes and properties** | Every attribute mirrors a property, kebab-cased: `full-width` ⇄ `fullWidth`. |
| **Lists of options** | `select`, `segmented-control`, `radio-group`, `tabs` and `breadcrumb` take their items as a `data` **property**, since an attribute cannot carry an array. |
| **Events** | `change` is re-dispatched from the host. Richer events (`vote`, `react`, `select`, `open`) carry a `detail`. |
| **Forms** | Field elements are form-associated: `name`, `FormData`, `required`, `form.reset()`, `type="submit"` and Enter-to-submit all work. Setting `error` also makes the field invalid. |
| **Theme** | Set `data-theme="light"` or `"dark"` on any ancestor. With neither, the dark palette applies. |
| **Styling** | Override any `--civitai-*` token, or reach inside with `::part(...)`. |

The full contract — every tag, attribute, property, event, slot and part — is
the package's generated
[`custom-elements.json`](https://cdn.jsdelivr.net/npm/@civitai/components/custom-elements.json).

## Button

`variant`: `filled` · `light` · `outline` · `subtle`. `size`: `sm` · `md` · `lg`.
`loading` shows a spinner and disables the button. `<civitai-button-group>`
joins its buttons into one control.

<ElementDemo title="Button" tags="civitai-button civitai-button-group">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-group gap="sm">
    <civitai-button variant="filled">Filled</civitai-button>
    <civitai-button variant="light">Light</civitai-button>
    <civitai-button variant="outline">Outline</civitai-button>
    <civitai-button variant="subtle">Subtle</civitai-button>
  </civitai-group>
  <civitai-group gap="sm">
    <civitai-button size="sm">Small</civitai-button>
    <civitai-button size="md">Medium</civitai-button>
    <civitai-button size="lg">Large</civitai-button>
  </civitai-group>
  <civitai-group gap="sm">
    <civitai-button variant="filled" loading>Saving…</civitai-button>
    <civitai-button variant="outline" disabled>Disabled</civitai-button>
    <civitai-button>Next<span slot="right">&rarr;</span></civitai-button>
  </civitai-group>
  <civitai-button-group aria-label="Alignment">
    <civitai-button variant="outline">Left</civitai-button>
    <civitai-button variant="outline">Center</civitai-button>
    <civitai-button variant="outline">Right</civitai-button>
  </civitai-button-group>
</civitai-stack>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="button"
A native `<button>`. Loading is `aria-busy` + `disabled` with a `sm` loader
prepended. There is no button-group in the stylesheet.

<ComponentDemo title="Button" ui="button">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="md">
  <div data-civitai-ui="group" data-gap="sm">
    <button data-civitai-ui="button" data-variant="filled">Filled</button>
    <button data-civitai-ui="button" data-variant="light">Light</button>
    <button data-civitai-ui="button" data-variant="outline">Outline</button>
    <button data-civitai-ui="button" data-variant="subtle">Subtle</button>
  </div>
  <div data-civitai-ui="group" data-gap="sm">
    <button data-civitai-ui="button" data-size="sm">Small</button>
    <button data-civitai-ui="button" data-size="md">Medium</button>
    <button data-civitai-ui="button" data-size="lg">Large</button>
  </div>
  <div data-civitai-ui="group" data-gap="sm">
    <button data-civitai-ui="button" data-variant="filled" aria-busy="true" disabled>
      <span data-civitai-ui="loader" data-size="sm" aria-hidden="true"></span>
      Saving…
    </button>
    <button data-civitai-ui="button" data-variant="outline" disabled>Disabled</button>
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Badge

`variant`: `filled` · `light` · `outline`. `size`: `sm` · `md` · `lg`. `color`:
`info` · `success` · `warning` · `error` — omit it for the primary accent. If a
badge conveys status, give it an `aria-label`.

<ElementDemo title="Badge" tags="civitai-badge">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-group gap="sm">
    <civitai-badge variant="filled">Filled</civitai-badge>
    <civitai-badge variant="light">Light</civitai-badge>
    <civitai-badge variant="outline">Outline</civitai-badge>
  </civitai-group>
  <civitai-group gap="sm">
    <civitai-badge color="info">Info</civitai-badge>
    <civitai-badge color="success">Success</civitai-badge>
    <civitai-badge color="warning">Warning</civitai-badge>
    <civitai-badge color="error">Error</civitai-badge>
  </civitai-group>
  <civitai-group gap="sm">
    <civitai-badge variant="light" size="sm">Small</civitai-badge>
    <civitai-badge variant="light" size="md">Medium</civitai-badge>
    <civitai-badge variant="light" size="lg">Large</civitai-badge>
  </civitai-group>
</civitai-stack>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="badge"
A presentational `<span>`.

<ComponentDemo title="Badge" ui="badge">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="md">
  <div data-civitai-ui="group" data-gap="sm">
    <span data-civitai-ui="badge" data-variant="filled" data-size="md">Filled</span>
    <span data-civitai-ui="badge" data-variant="light" data-size="md">Light</span>
    <span data-civitai-ui="badge" data-variant="outline" data-size="md">Outline</span>
  </div>
  <div data-civitai-ui="group" data-gap="sm">
    <span data-civitai-ui="badge" data-variant="filled" data-color="info" data-size="md">Info</span>
    <span data-civitai-ui="badge" data-variant="filled" data-color="success" data-size="md">Success</span>
    <span data-civitai-ui="badge" data-variant="filled" data-color="warning" data-size="md">Warning</span>
    <span data-civitai-ui="badge" data-variant="filled" data-color="error" data-size="md">Error</span>
  </div>
  <div data-civitai-ui="group" data-gap="sm">
    <span data-civitai-ui="badge" data-variant="light" data-size="sm">Small</span>
    <span data-civitai-ui="badge" data-variant="light" data-size="md">Medium</span>
    <span data-civitai-ui="badge" data-variant="light" data-size="lg">Large</span>
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Alert

`color`: `info` (default) · `success` · `warning` · `error`. `heading` adds a
title; `closable` adds a dismiss button, which fires `close`.

<ElementDemo title="Alert" tags="civitai-alert">

<template #html>

```html
<civitai-stack gap="sm">
  <civitai-alert heading="Heads up">A new model version is available.</civitai-alert>
  <civitai-alert color="success" heading="Saved" closable>Your changes are live.</civitai-alert>
  <civitai-alert color="warning">Approaching your Buzz limit.</civitai-alert>
  <civitai-alert color="error" heading="Generation failed">The provider rejected the request.</civitai-alert>
</civitai-stack>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="alert"
Put `role="alert"` on the wrapper (`role="status"` for non-urgent). The body
lives in `data-civitai-ui-alert-body`, with an optional
`data-civitai-ui-alert-title`; a dismiss button needs your own handler.

<ComponentDemo title="Alert" ui="alert">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="sm">
  <div data-civitai-ui="alert" data-color="info" role="alert">
    <div data-civitai-ui-alert-body>
      <div data-civitai-ui-alert-title>Heads up</div>
      A new model version is available.
    </div>
  </div>
  <div data-civitai-ui="alert" data-color="success" role="alert">
    <div data-civitai-ui-alert-body>
      <div data-civitai-ui-alert-title>Saved</div>
      Your changes are live.
    </div>
    <button data-civitai-ui-alert-close aria-label="Dismiss">×</button>
  </div>
  <div data-civitai-ui="alert" data-color="warning" role="alert">
    <div data-civitai-ui-alert-body>Approaching your Buzz limit.</div>
  </div>
  <div data-civitai-ui="alert" data-color="error" role="alert">
    <div data-civitai-ui-alert-body>
      <div data-civitai-ui-alert-title>Generation failed</div>
      The provider rejected the request.
    </div>
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Loader and progress

`<civitai-loader>` is a spinner: `size` `sm` · `md` · `lg`, and `label` names it
for screen readers. `<civitai-progress>` is a bar: `value` out of `max`
(default 100), `show-value` prints the percentage, and `indeterminate` animates
it when there is no number to show.

<ElementDemo title="Loader and progress" tags="civitai-loader civitai-progress">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-group gap="lg">
    <civitai-loader size="sm" label="Loading"></civitai-loader>
    <civitai-loader size="md" label="Loading"></civitai-loader>
    <civitai-loader size="lg" label="Loading"></civitai-loader>
  </civitai-group>
  <civitai-progress label="Generating" value="64" show-value></civitai-progress>
  <civitai-progress label="Preparing" indeterminate color="warning"></civitai-progress>
</civitai-stack>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="loader"
Decorative inside a button → `aria-hidden="true"`; standalone → wrap it in
`role="status"` with a visually hidden label. There is no progress bar in the
stylesheet.

<ComponentDemo title="Loader" ui="loader">

<template #html>

```html
<div data-civitai-ui="group" data-gap="lg">
  <span data-civitai-ui="loader" data-size="sm"></span>
  <span data-civitai-ui="loader" data-size="md"></span>
  <span data-civitai-ui="loader" data-size="lg"></span>
  <span role="status">
    <span data-civitai-ui="loader" data-size="md" aria-hidden="true"></span>
    <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Loading…</span>
  </span>
</div>
```

</template>

</ComponentDemo>

:::

## TextInput

`label`, `description`, `required`, `disabled` and `error` work on every field
element — text-input, textarea, number-input, select, checkbox, switch, slider,
radio-group and segmented-control — and every field is form-associated: `name`,
`FormData` and `form.reset()` work as on a native input. Setting `error` also
marks the field invalid. `placeholder` reaches the input only on
`<civitai-text-input>`, `<civitai-textarea>` and `<civitai-number-input>`;
`<civitai-select>` renders it as a disabled first option shown while nothing is
chosen, and the other fields ignore it. `readonly` works only on
`<civitai-text-input>` and `<civitai-textarea>` — elsewhere it leaves the control
editable. `<civitai-input-group>` joins fields, buttons and
`data-affix` text into one row.

<ElementDemo title="TextInput" tags="civitai-text-input civitai-input-group">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-text-input label="Display name" description="Shown on your profile." required></civitai-text-input>
  <civitai-text-input label="Email" value="not-an-email" error="Enter a valid email address."></civitai-text-input>
  <civitai-input-group>
    <civitai-text-input aria-label="Search models" placeholder="Search models"></civitai-text-input>
    <civitai-button>Search</civitai-button>
  </civitai-input-group>
  <civitai-input-group>
    <civitai-number-input aria-label="Tip" value="100" min="1"></civitai-number-input>
    <span data-affix>Buzz</span>
    <civitai-button>Tip</civitai-button>
  </civitai-input-group>
</civitai-stack>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="text-input"
The label is wired by `for`/`id`, help text by `aria-describedby`, and the
invalid state by `aria-invalid="true"` plus `data-invalid="true"` on the
wrapper. There is no input-group in the stylesheet.

<ComponentDemo title="TextInput" ui="text-input">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="md">
  <div data-civitai-ui="text-input">
    <label data-civitai-ui-label for="display-name">
      Display name
      <span data-civitai-ui-required aria-hidden="true">*</span>
    </label>
    <span id="display-name-desc" data-civitai-ui-description>Shown on your profile.</span>
    <input data-civitai-ui-control id="display-name" aria-describedby="display-name-desc" required />
  </div>
  <div data-civitai-ui="text-input" data-invalid="true">
    <label data-civitai-ui-label for="email">Email</label>
    <input data-civitai-ui-control id="email" value="not-an-email" aria-invalid="true" aria-describedby="email-err" />
    <span id="email-err" data-civitai-ui-error role="alert">Enter a valid email address.</span>
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Textarea

The same field as TextInput over a resizable `<textarea>`; `rows` sets its
starting height.

<ElementDemo title="Textarea" tags="civitai-textarea">

<template #html>

```html
<civitai-textarea label="Prompt" description="Describe what you want to generate." rows="3"
  value="a serene alpine lake at dawn"></civitai-textarea>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="textarea"
<ComponentDemo title="Textarea" ui="textarea">

<template #html>

```html
<div data-civitai-ui="textarea">
  <label data-civitai-ui-label for="prompt">Prompt</label>
  <span id="prompt-desc" data-civitai-ui-description>Describe what you want to generate.</span>
  <textarea data-civitai-ui-control id="prompt" rows="3" aria-describedby="prompt-desc">a serene alpine lake at dawn</textarea>
</div>
```

</template>

</ComponentDemo>

:::

## NumberInput

The same field over `<input type="number">`, with `min`, `max` and `step`.

<ElementDemo title="NumberInput" tags="civitai-number-input">

<template #html>

```html
<civitai-group gap="md" style="align-items: flex-start">
  <civitai-number-input label="Steps" description="Sampling steps (1–50)." value="30" min="1" max="50"></civitai-number-input>
  <civitai-number-input label="CFG scale" value="99" max="20" error="Max is 20"></civitai-number-input>
</civitai-group>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="number-input"
<ComponentDemo title="NumberInput" ui="number-input">

<template #html>

```html
<div data-civitai-ui="number-input">
  <label data-civitai-ui-label for="steps">Steps</label>
  <span id="steps-desc" data-civitai-ui-description>Sampling steps (1–50).</span>
  <input type="number" data-civitai-ui-control id="steps" value="30" min="1" max="50" aria-describedby="steps-desc" />
</div>
```

</template>

</ComponentDemo>

:::

## Select

A labelled select. Its options are a `data` **property** — an attribute cannot
carry an array — of `{ value, label, disabled? }`.

<ElementDemo title="Select" tags="civitai-select">

<template #html>

```html
<civitai-select label="Base model" description="Determines available samplers."
  placeholder="Pick a base model" value="flux"></civitai-select>
```

</template>

<template #js>

```js
document.querySelector('civitai-select').data = [
  { value: 'sdxl', label: 'SDXL 1.0' },
  { value: 'flux', label: 'Flux.1 dev' },
  { value: 'sd15', label: 'SD 1.5 (retired)', disabled: true },
];
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="select"
The field chrome over a native `<select data-civitai-ui-control>`, which keeps
its native disclosure caret.

<ComponentDemo title="Select" ui="select">

<template #html>

```html
<div data-civitai-ui="select">
  <label data-civitai-ui-label for="base-model">Base model</label>
  <span id="base-model-desc" data-civitai-ui-description>Determines available samplers.</span>
  <select data-civitai-ui-control id="base-model" aria-describedby="base-model-desc">
    <option value="sdxl">SDXL 1.0</option>
    <option value="flux" selected>Flux.1 dev</option>
    <option value="pony">Pony Diffusion</option>
  </select>
</div>
```

</template>

</ComponentDemo>

:::

## Checkbox and switch

`<civitai-checkbox>` and `<civitai-switch>` take `label`, `description`,
`checked` and `disabled`, and fire `change`; read `checked` from the element.

<ElementDemo title="Checkbox and switch" tags="civitai-checkbox civitai-switch">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-checkbox label="Show mature content" description="You can change this later in settings." checked></civitai-checkbox>
  <civitai-checkbox label="Email me product updates"></civitai-checkbox>
  <civitai-switch label="Public"></civitai-switch>
  <civitai-switch label="Locked" checked disabled></civitai-switch>
</civitai-stack>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="checkbox"
A native checkbox: the box and its label sit inline in a `-choice` row, with
optional description and error below. `accent-color` carries the theme tint, so
keyboard, focus and indeterminate states stay native. There is no switch in the
stylesheet.

<ComponentDemo title="Checkbox" ui="checkbox">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="md">
  <div data-civitai-ui="checkbox">
    <div data-civitai-ui-choice>
      <input type="checkbox" id="mature" checked aria-describedby="mature-desc" />
      <label data-civitai-ui-label for="mature">Show mature content</label>
    </div>
    <span id="mature-desc" data-civitai-ui-description>You can change this later in settings.</span>
  </div>
  <div data-civitai-ui="checkbox">
    <div data-civitai-ui-choice>
      <input type="checkbox" id="newsletter" />
      <label data-civitai-ui-label for="newsletter">Email me product updates</label>
    </div>
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Radio group

`<civitai-radio-group>` renders a labelled set of radios from its `data`
property. `orientation="horizontal"` lays them out in a row.

<ElementDemo title="Radio group" tags="civitai-radio-group">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-radio-group label="Sampler" value="euler"></civitai-radio-group>
  <civitai-radio-group label="Speed" orientation="horizontal" value="fast"></civitai-radio-group>
</civitai-stack>
```

</template>

<template #js>

```js
const [sampler, speed] = document.querySelectorAll('civitai-radio-group');
sampler.data = [
  { value: 'euler', label: 'Euler a' },
  { value: 'ddim', label: 'DDIM' },
  { value: 'dpm', label: 'DPM++ 2M Karras' },
];
speed.data = [
  { value: 'fast', label: 'Fast' },
  { value: 'quality', label: 'Quality' },
];
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="radio-group" and "radio"
The stylesheet has two pieces: `radio`, one themed native radio (the checkbox
row with `type="radio"`), and `radio-group`, the `role="radiogroup"` wrapper with
a group label. A shared `name` makes the radios one native set. `radio` is the
one CSS component with no element of its own — `<civitai-radio-group>` renders
its options for you.

<ComponentDemo title="Radio group" ui="radio-group">

<template #html>

```html
<div data-civitai-ui="radio-group" role="radiogroup" aria-labelledby="sampler-lbl">
  <span data-civitai-ui-label id="sampler-lbl">Sampler</span>
  <div data-civitai-ui-radio-options>
    <div data-civitai-ui="radio">
      <div data-civitai-ui-choice>
        <input type="radio" name="sampler" id="s-euler" checked />
        <label data-civitai-ui-label for="s-euler">Euler a</label>
      </div>
    </div>
    <div data-civitai-ui="radio">
      <div data-civitai-ui-choice>
        <input type="radio" name="sampler" id="s-ddim" />
        <label data-civitai-ui-label for="s-ddim">DDIM</label>
      </div>
    </div>
    <div data-civitai-ui="radio">
      <div data-civitai-ui-choice>
        <input type="radio" name="sampler" id="s-dpm" />
        <label data-civitai-ui-label for="s-dpm">DPM++ 2M Karras</label>
      </div>
    </div>
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Slider

`min`, `max`, `step` and `value` as on a native range input; `show-value` adds a
read-out of the raw value.

<ElementDemo title="Slider" tags="civitai-slider">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-slider label="Steps" description="Sampling steps (1–50)." min="1" max="50" value="20" show-value></civitai-slider>
  <civitai-slider label="CFG scale" min="1" max="20" step="0.5" value="7" show-value></civitai-slider>
</civitai-stack>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="slider"
A themed native `<input type="range">`, so keyboard and ARIA come from the
browser. Like checkbox and radio the input does **not** carry
`data-civitai-ui-control`. A formatted read-out (`40%`) needs `aria-valuetext`
on the input to the same string — on either track; `show-value` above prints
the raw number and sets none.

<ComponentDemo title="Slider" ui="slider">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="lg">
  <div data-civitai-ui="slider">
    <div data-civitai-ui-slider-header>
      <label data-civitai-ui-label for="steps-range">Steps</label>
      <output data-civitai-ui-slider-value for="steps-range">20</output>
    </div>
    <input type="range" id="steps-range" min="1" max="50" value="20" />
  </div>
  <div data-civitai-ui="slider">
    <div data-civitai-ui-slider-header>
      <label data-civitai-ui-label for="denoise">Denoise</label>
      <output data-civitai-ui-slider-value for="denoise">40%</output>
    </div>
    <input type="range" id="denoise" min="0" max="100" step="5" value="40" aria-valuetext="40%" />
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Segmented control and tabs

Two elements over one look. `<civitai-segmented-control>` picks a value with no
panels; `<civitai-tabs>` switches `<civitai-tab-panel>` children whose `value`
matches. Both take their segments as a `data` property and fire `change`.

<ElementDemo title="Segmented control and tabs" tags="civitai-segmented-control civitai-tabs civitai-tab-panel">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-segmented-control aria-label="Layout" value="grid"></civitai-segmented-control>
  <civitai-tabs aria-label="Result view">
    <civitai-tab-panel value="images"><civitai-card padding="md">Images panel</civitai-card></civitai-tab-panel>
    <civitai-tab-panel value="videos"><civitai-card padding="md">Videos panel</civitai-card></civitai-tab-panel>
  </civitai-tabs>
</civitai-stack>
```

</template>

<template #js>

```js
document.querySelector('civitai-segmented-control').data = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
  { value: 'map', label: 'Map', disabled: true },
];
document.querySelector('civitai-tabs').data = [
  { value: 'images', label: 'Images' },
  { value: 'videos', label: 'Videos' },
];
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="segmented-control"
The stylesheet is presentational only: roving `tabindex` and arrow-key
navigation are **yours to implement**, which is why the elements are the
recommended path here. Mode `toggle` is `role="radiogroup"` with
`role="radio"` segments; mode `tabs` is `role="tablist"` with `role="tab"`
segments pointing at `data-civitai-ui-tabpanel` panels.

<ComponentDemo title="Segmented control" ui="segmented-control">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="lg">
  <div data-civitai-ui="segmented-control" role="radiogroup" aria-label="Layout" data-size="md">
    <button data-civitai-ui-segment role="radio" aria-checked="true" tabindex="0">Grid</button>
    <button data-civitai-ui-segment role="radio" aria-checked="false" tabindex="-1">List</button>
    <button data-civitai-ui-segment role="radio" aria-checked="false" tabindex="-1" disabled>Map</button>
  </div>
  <div data-civitai-ui="stack" data-gap="sm">
    <div data-civitai-ui="segmented-control" role="tablist" aria-label="Result view" data-size="sm">
      <button data-civitai-ui-segment role="tab" id="t-images" aria-selected="true"
              aria-controls="p-images" tabindex="0">Images</button>
      <button data-civitai-ui-segment role="tab" id="t-videos" aria-selected="false"
              aria-controls="p-videos" tabindex="-1">Videos</button>
    </div>
    <div data-civitai-ui-tabpanel role="tabpanel" id="p-images" aria-labelledby="t-images" tabindex="0">Images panel</div>
    <div data-civitai-ui-tabpanel role="tabpanel" id="p-videos" aria-labelledby="t-videos" tabindex="0" hidden>Videos panel</div>
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Card

A surface container. `padding`: `sm` · `md` · `lg`. In light mode a card gets a
subtle default hairline (surface and body are the same colour there);
`with-border` upgrades it to the stronger, fully opaque border.

<ElementDemo title="Card" tags="civitai-card">

<template #html>

```html
<civitai-group gap="md" style="align-items: stretch">
  <civitai-card with-border padding="md">
    <civitai-stack gap="sm">
      <strong>With border</strong>
      <span>An explicit, fully-opaque border at medium padding.</span>
    </civitai-stack>
  </civitai-card>
  <civitai-card padding="lg">
    <civitai-stack gap="sm">
      <strong>Default</strong>
      <span>The subtle default hairline at large padding.</span>
    </civitai-stack>
  </civitai-card>
</civitai-group>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="card"
<ComponentDemo title="Card" ui="card">

<template #html>

```html
<div data-civitai-ui="group" data-gap="md">
  <div data-civitai-ui="card" data-with-border="true" data-padding="md">
    <div data-civitai-ui="stack" data-gap="sm">
      <strong>With border</strong>
      <span>An explicit, fully-opaque border at medium padding.</span>
    </div>
  </div>
  <div data-civitai-ui="card" data-padding="lg">
    <div data-civitai-ui="stack" data-gap="sm">
      <strong>Default</strong>
      <span>The subtle default hairline at large padding.</span>
    </div>
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Stack and group

Layout. `<civitai-stack>` lays its children out **vertically**;
`<civitai-group>` lays them out **horizontally**, centred, and wraps onto more
rows rather than overflowing (`nowrap` turns that off). Both take `gap`: `sm` ·
`md` · `lg`. The numbered chips are filler content, not components.

<ElementDemo title="Stack and group" tags="civitai-stack civitai-group">

<template #html>

```html
<civitai-stack gap="lg">
  <civitai-stack gap="sm">
    <strong>Stack — vertical, gap="md"</strong>
    <civitai-stack gap="md">
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">1</div>
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">2</div>
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">3</div>
    </civitai-stack>
  </civitai-stack>
  <civitai-stack gap="sm">
    <strong>Group — horizontal, gap="md"</strong>
    <civitai-group gap="md">
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">1</div>
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">2</div>
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">3</div>
    </civitai-group>
  </civitai-stack>
</civitai-stack>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="stack" and "group"
<ComponentDemo title="Stack and group" ui="stack">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="lg">
  <div data-civitai-ui="stack" data-gap="sm">
    <strong>Stack — vertical, data-gap="md"</strong>
    <div data-civitai-ui="stack" data-gap="md">
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">1</div>
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">2</div>
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">3</div>
    </div>
  </div>
  <div data-civitai-ui="stack" data-gap="sm">
    <strong>Group — horizontal, data-gap="md"</strong>
    <div data-civitai-ui="group" data-gap="md">
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">1</div>
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">2</div>
      <div data-demo-chip style="display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:8px;background:var(--civitai-color-primary);color:var(--civitai-color-primary-fg);font-weight:700">3</div>
    </div>
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Text

Typography. `as` picks the element — `h1`–`h6` for a heading, `p` for a
paragraph — so a heading lands in the document outline; `size` (`xs` … `5xl`)
and `weight` (`normal` · `medium` · `semibold` · `bold`) pick the look. Level
and size are independent on purpose: an `h3` can be small print. Text inherits
its colour from its parent.

<ElementDemo title="Text" tags="civitai-text">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-text as="h2" size="4xl" weight="bold">Generate an image</civitai-text>
  <civitai-text size="xl">Pick a model, then press Generate.</civitai-text>
  <civitai-text>The body size is md, the default.</civitai-text>
  <civitai-text size="sm" weight="semibold">Small and semibold.</civitai-text>
  <civitai-text as="h3" size="xs" weight="medium">An h3 at the smallest size.</civitai-text>
</civitai-stack>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="text"
Write the tag the meaning calls for and add `data-civitai-ui="text"`, with
`data-size` and `data-weight`. Colour, alignment and truncation are `ci-*`
utility classes in the separate `@civitai/components/utilities.css`, which
`styles.css` does not include.

<ComponentDemo title="Text" ui="text">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="md">
  <h2 data-civitai-ui="text" data-size="4xl" data-weight="bold">Generate an image</h2>
  <p data-civitai-ui="text" data-size="xl">Pick a model, then press Generate.</p>
  <p data-civitai-ui="text">The body size is md, the default.</p>
  <p data-civitai-ui="text" data-size="sm" data-weight="semibold">Small and semibold.</p>
  <h3 data-civitai-ui="text" data-size="xs" data-weight="medium">An h3 at the smallest size.</h3>
</div>
```

</template>

</ComponentDemo>

:::

## Tooltip

Wrap any focusable element; `label` is the tooltip text. The element wires the
trigger's `aria-describedby` and Escape-to-dismiss for you.

<ElementDemo title="Tooltip" tags="civitai-tooltip">

<template #html>

```html
<civitai-group gap="md">
  <civitai-tooltip label="Randomize the seed">
    <civitai-button variant="light">Seed</civitai-button>
  </civitai-tooltip>
  <civitai-tooltip label="Spends Buzz from your balance">
    <civitai-button variant="outline">Hover or focus me</civitai-button>
  </civitai-tooltip>
</civitai-group>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="tooltip"
The reveal is pure CSS on `:hover` / `:focus-within`; `data-open="true"` forces
it open. Wiring `aria-describedby` and any Escape handling is yours. The second
bubble is pinned open so it shows without hovering.

<ComponentDemo title="Tooltip" ui="tooltip">

<template #html>

```html
<div data-civitai-ui="group" data-gap="lg" style="padding-top:2.5rem">
  <span data-civitai-ui="tooltip">
    <button data-civitai-ui="button" data-variant="light" aria-describedby="tip-seed">Seed</button>
    <span data-civitai-ui-tooltip-bubble role="tooltip" id="tip-seed">Randomize the seed</span>
  </span>
  <span data-civitai-ui="tooltip">
    <button data-civitai-ui="button" data-variant="outline" aria-describedby="tip-open">Pinned open</button>
    <span data-civitai-ui-tooltip-bubble role="tooltip" id="tip-open" data-open="true">data-open="true"</span>
  </span>
</div>
```

</template>

</ComponentDemo>

:::

## Toast

`<civitai-toast-region>` owns the queue and the auto-dismiss timers: call
`show({ message, heading?, color?, duration? })` on it, and it returns the
toast's id. `<civitai-toast>` is the card it renders — `color`, `heading`,
`closable` — and can also be placed by hand, as below.

<ElementDemo title="Toast" tags="civitai-toast-region civitai-toast">

<template #html>

```html
<civitai-stack gap="sm">
  <civitai-toast heading="Heads up" color="info" closable>A new model version is available.</civitai-toast>
  <civitai-toast color="warning">Approaching your Buzz limit.</civitai-toast>
  <civitai-group>
    <civitai-button class="toast" variant="light">Show a toast</civitai-button>
  </civitai-group>
  <civitai-toast-region></civitai-toast-region>
</civitai-stack>
```

</template>

<template #js>

```js
const toasts = document.querySelector('civitai-toast-region');
document.querySelector('.toast').addEventListener('click', () => {
  toasts.show({ heading: 'Saved', message: 'Your changes are live.', color: 'success' });
});
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="toast-region" and "toast"
Render into the region yourself, one `toast` per notification, so its
`aria-live` announces each one; timers and dismissal are yours. The region is
`position: fixed` — the `contain: paint` box here only keeps it inside the
preview.

<ComponentDemo title="Toast" ui="toast-region">

<template #html>

```html
<div style="position:relative;contain:paint;height:200px">
  <div data-civitai-ui="toast-region" role="region" aria-label="Notifications" aria-live="polite">
    <div data-civitai-ui="toast" data-color="success" role="status">
      <div data-civitai-ui-toast-body>
        <div data-civitai-ui-toast-title>Saved</div>
        Your changes are live.
      </div>
      <button data-civitai-ui-toast-close aria-label="Dismiss">×</button>
    </div>
    <div data-civitai-ui="toast" data-color="info" role="status">
      <div data-civitai-ui-toast-body>Queued behind the first one.</div>
    </div>
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Image

`<civitai-image>` shows a placeholder while loading and a fallback when the file
fails. `fit` is `cover` or `contain`; `pending` shows a loader for a file still
being made, `blocked` withholds it from this viewer, and `openable` makes it a
button that fires `open`. Size it from outside.

<ElementDemo title="Image" tags="civitai-image">

<template #html>

```html
<civitai-group gap="md" style="align-items: flex-start">
  <civitai-image openable alt="A gradient" style="width: 140px; aspect-ratio: 1"
    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Cdefs%3E%3ClinearGradient id='g' x2='1' y2='1'%3E%3Cstop stop-color='%23228be6'/%3E%3Cstop offset='1' stop-color='%23326D5C'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1' height='1' fill='url(%23g)'/%3E%3C/svg%3E"></civitai-image>
  <civitai-image pending style="width: 140px; aspect-ratio: 1"></civitai-image>
  <civitai-image blocked style="width: 140px; aspect-ratio: 1"><span slot="blocked">Hidden: mature content</span></civitai-image>
  <civitai-image src="data:image/png;base64,AAAA" alt="Missing" fallback="Image unavailable" style="width: 140px; aspect-ratio: 1"></civitai-image>
</civitai-group>
```

</template>

</ElementDemo>

::: details CSS-only / no-JS: data-civitai-ui="image"
You set `data-status` (`loading` · `loaded` · `error`) yourself; the fallback
overlay shows only at `error`. The element reflects the same state as `status`,
not `data-status`. There is no `pending` or `blocked` in the stylesheet.

<ComponentDemo title="Image" ui="image">

<template #html>

```html
<div data-civitai-ui="group" data-gap="md">
  <div data-civitai-ui="image" style="width:140px;aspect-ratio:1 / 1">
    <img data-civitai-ui-image-img data-fit="cover" src="/images/oauth/edit-oauth-app.png" alt="cover" />
  </div>
  <div data-civitai-ui="image" style="width:140px;aspect-ratio:1 / 1">
    <img data-civitai-ui-image-img data-fit="contain" src="/images/oauth/edit-oauth-app.png" alt="contain" />
  </div>
  <div data-civitai-ui="image" data-status="error" style="width:140px;aspect-ratio:1 / 1">
    <img data-civitai-ui-image-img src="/images/oauth/edit-oauth-app.png" alt="" />
    <div data-civitai-ui-image-fallback aria-hidden="true">Image unavailable</div>
  </div>
</div>
```

</template>

</ComponentDemo>

:::

## Video and audio

The same `pending`, `blocked` and `fallback` states as `<civitai-image>`, for a
generated clip or track.

<ElementDemo title="Video and audio" tags="civitai-video civitai-audio">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-video src="data:video/mp4;base64,AAAA" fallback="This clip is gone" style="width: 200px; aspect-ratio: 16 / 9"></civitai-video>
  <civitai-audio src="data:audio/mpeg;base64,AAAA" alt="A jingle" fallback="This track is gone" style="max-width: 320px"></civitai-audio>
</civitai-stack>
```

</template>

</ElementDemo>

## Modal and confirm dialog

`<civitai-modal>` traps focus and closes on Escape or an overlay click; set
`open` or call `show()`. `<civitai-confirm-dialog>` resolves
`await dialog.ask()` to `true` or `false`. Neither has a CSS-only equivalent.

<ElementDemo title="Modal and confirm dialog" tags="civitai-modal civitai-confirm-dialog">

<template #html>

```html
<civitai-stack gap="sm">
  <civitai-group>
    <civitai-button class="open-modal">Open modal</civitai-button>
    <civitai-button class="ask" variant="outline">Delete…</civitai-button>
  </civitai-group>
  <civitai-text size="sm" class="log">Press Delete… and answer.</civitai-text>
  <civitai-modal heading="Confirm generation">
    This will spend Buzz. Focus cannot leave the dialog.
  </civitai-modal>
  <civitai-confirm-dialog heading="Delete model?" message="This cannot be undone."
    confirm-label="Delete" destructive></civitai-confirm-dialog>
</civitai-stack>
```

</template>

<template #js>

```js
const modal = document.querySelector('civitai-modal');
const confirm = document.querySelector('civitai-confirm-dialog');
const log = document.querySelector('.log');

document.querySelector('.open-modal').addEventListener('click', () => (modal.open = true));
document.querySelector('.ask').addEventListener('click', async () => {
  log.textContent = (await confirm.ask()) ? 'Deleted.' : 'Kept.';
});
```

</template>

</ElementDemo>

## Collapse

A disclosure: `heading` is the toggle, `open` the state, and it fires `toggle`.

<ElementDemo title="Collapse" tags="civitai-collapse">

<template #html>

```html
<civitai-collapse heading="Advanced">
  <civitai-stack gap="sm">
    <civitai-checkbox label="Restore faces"></civitai-checkbox>
    <civitai-checkbox label="Tile"></civitai-checkbox>
  </civitai-stack>
</civitai-collapse>
```

</template>

</ElementDemo>

## Menu

Put any button in the `trigger` slot. Choosing an item fires `select` with
`detail.value`; `<civitai-menu-label>` titles a group of items.

<ElementDemo title="Menu" tags="civitai-menu civitai-menu-item civitai-menu-label">

<template #html>

```html
<civitai-group>
  <civitai-menu label="Image actions">
    <civitai-button slot="trigger" variant="outline" size="sm">Actions</civitai-button>
    <civitai-menu-item>Save to collection</civitai-menu-item>
    <civitai-menu-item>View post</civitai-menu-item>
    <civitai-menu-label>Moderator</civitai-menu-label>
    <civitai-menu-item disabled>Rescan</civitai-menu-item>
    <civitai-menu-item destructive>Delete</civitai-menu-item>
  </civitai-menu>
</civitai-group>
```

</template>

</ElementDemo>

## Navigation

`<civitai-breadcrumb>` takes its trail as a `data` property.
`<civitai-pagination>` fires `change`; read `page`. `<civitai-nav-list
current="…">` marks the item whose `href` matches and opens every group above
it; an item with children is a collapsible group.

<ElementDemo title="Navigation" tags="civitai-breadcrumb civitai-pagination civitai-nav-list civitai-nav-item">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-breadcrumb></civitai-breadcrumb>
  <civitai-pagination total="20" page="7"></civitai-pagination>
  <civitai-nav-list label="Sections" current="/jobs/replay" style="max-width: 240px">
    <civitai-nav-item href="/" label="Summary"></civitai-nav-item>
    <civitai-nav-item label="Jobs">
      <civitai-nav-item href="/jobs" label="Active"></civitai-nav-item>
      <civitai-nav-item href="/jobs/replay" label="Replay"></civitai-nav-item>
    </civitai-nav-item>
    <civitai-nav-item href="/workers" label="Workers"></civitai-nav-item>
  </civitai-nav-list>
</civitai-stack>
```

</template>

<template #js>

```js
document.querySelector('civitai-breadcrumb').data = [
  { label: 'Home', href: '/' },
  { label: 'Models', href: '/models' },
  { label: 'Flux.1 [dev]' },
];
```

</template>

</ElementDemo>

## Table

`<civitai-table>` styles a `<table>` you write yourself, including one a data
grid generates. Flags: `striped`, `hoverable`, `with-border`, `dense`,
`sticky-header`. Mark number cells with `data-numeric`.

<ElementDemo title="Table" tags="civitai-table">

<template #html>

```html
<civitai-table striped hoverable with-border>
  <table>
    <thead>
      <tr><th>Job</th><th>Model</th><th>Status</th><th data-numeric>Cost</th></tr>
    </thead>
    <tbody>
      <tr><td>wf_8f21</td><td>Flux.1 [dev]</td><td><civitai-badge variant="light" color="success">succeeded</civitai-badge></td><td data-numeric>12</td></tr>
      <tr><td>wf_8f22</td><td>SDXL</td><td><civitai-badge variant="light" color="warning">queued</civitai-badge></td><td data-numeric>4</td></tr>
      <tr><td>wf_8f23</td><td>SDXL</td><td><civitai-badge variant="light" color="error">failed</civitai-badge></td><td data-numeric>0</td></tr>
    </tbody>
  </table>
</civitai-table>
```

</template>

</ElementDemo>

## Civitai vocabulary

Defined by `site-elements.js` / `register-site` only: the pieces that make an
app look like civitai.com. `<civitai-tag>` fires `vote`, `<civitai-reaction>`
fires `react`, and `<civitai-media-card>` lays them out over an image in named
slots (`media`, `top-start`, `top-end`, `bottom`). `<civitai-action-button>` is
the round icon button for those slots.

Firing the event is all `<civitai-reaction>` does. It flips itself on click and
saves nothing: you set its `count` and `reacted`, you write the change, and you
revert it if the write fails. Apps cannot register real Civitai reactions yet.
[`<civitai-reaction>` records nothing](./guide/elements#civitai-reaction-records-nothing)
covers what that means for your app.
`<civitai-tag>` is the same: it sets its own `vote` and fires `vote`, saves
nothing, and does not move `score`. Apps cannot vote on real Civitai tags.
[`<civitai-tag>` votes go nowhere either](./guide/elements#civitai-tag-votes-go-nowhere-either)
has the details.

<ElementDemo title="Civitai vocabulary" tags="civitai-rating-badge civitai-avatar civitai-tag civitai-reaction civitai-action-button civitai-media-card">

<template #html>

```html
<civitai-stack gap="md">
  <civitai-group>
    <civitai-rating-badge rating="pg"></civitai-rating-badge>
    <civitai-rating-badge rating="pg13"></civitai-rating-badge>
    <civitai-rating-badge rating="r"></civitai-rating-badge>
    <civitai-rating-badge rating="x"></civitai-rating-badge>
    <civitai-avatar name="Jane Q Doe"></civitai-avatar>
    <civitai-avatar size="lg" name="Sinity" frame="linear-gradient(135deg, #f0a, #0af)"></civitai-avatar>
  </civitai-group>
  <civitai-group>
    <civitai-tag name="wolf" confidence="0.97"></civitai-tag>
    <civitai-tag name="full moon" vote="1" score="128" show-score></civitai-tag>
    <civitai-tag name="anime" readonly></civitai-tag>
  </civitai-group>
  <civitai-media-card href="#" label="Open image" style="width: 220px">
    <img slot="media" alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='280'%3E%3Cdefs%3E%3ClinearGradient id='g' x2='1' y2='1'%3E%3Cstop stop-color='%23b98b4a'/%3E%3Cstop offset='1' stop-color='%231b1f2a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='280' fill='url(%23g)'/%3E%3C/svg%3E" />
    <civitai-rating-badge slot="top-start" rating="pg"></civitai-rating-badge>
    <civitai-action-button slot="top-end" label="Remix">
      <span slot="icon" aria-hidden="true">&#10022;</span>
    </civitai-action-button>
    <civitai-reaction slot="bottom" emoji="👍" label="Like" count="13100"></civitai-reaction>
    <civitai-reaction slot="bottom" emoji="❤️" label="Heart" count="812" reacted></civitai-reaction>
  </civitai-media-card>
</civitai-stack>
```

</template>

</ElementDemo>

## Acting as the viewer

Two elements act rather than display, through
[`@civitai/sdk`](./guide/sdk), so no bundle includes them — not
`site-elements.js`, not `register-site` — and the SDK stays out of apps that do
not need it. Import `@civitai/components/civitai-sign-in-button/define` and
`…/civitai-workflow-button/define`.

- **`<civitai-sign-in-button>`** signs the viewer in. Inside civitai.com it asks
  the host; an app of its own hands it `createSignIn()`'s result as `signIn`. It
  hides once the viewer is signed in.
- **`<civitai-workflow-button>`** prices its `template` as soon as it has one
  (`Bake for 185 Buzz`), submits it on click, and shows progress until it
  finishes. A second press offers to cancel. It fires `priced`, `submitted`,
  `progress`, `finished`, `canceled` and `error`. Pass it a signed-in `app`
  from `@civitai/sdk`; left out, it calls `initialize()` itself. It runs the
  workflow through `app.orchestration`, so **inside a block, on the default
  token, the orchestrator refuses it** — see
  [Using the elements in a block](./guide/elements#elements-a-block-s-token-cannot-drive).

The demo hands both a stand-in for the SDK, so pressing them spends nothing and
signs no one in. [Wiring them to the real SDK](#wiring-them-to-the-real-sdk) is
below it.

<ElementDemo title="Acting as the viewer" tags="civitai-workflow-button civitai-sign-in-button" sdk>

<template #html>

```html
<civitai-stack gap="sm">
  <civitai-group>
    <civitai-workflow-button label="Bake"></civitai-workflow-button>
    <civitai-sign-in-button variant="subtle">Sign in with Civitai</civitai-sign-in-button>
  </civitai-group>
  <civitai-text size="sm" class="log">Press Bake, then press it again to cancel.</civitai-text>
</civitai-stack>
```

</template>

<template #js>

```js
const log = document.querySelector('.log');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Stand-ins for initialize() and createSignIn() from @civitai/sdk.
let canceled = false;
const app = {
  requestGrants: async () => true,
  getToken: async () => 'demo',
  orchestration: {
    estimateWorkflow: async () => ({ cost: { total: 185 } }),
    submitWorkflow: async () => ((canceled = false), { id: 'wf_demo' }),
    cancelWorkflow: async () => void (canceled = true),
    async *watchWorkflow() {
      await wait(800);
      yield { status: 'scheduled', steps: [] };
      for (let rate = 0.05; rate <= 1; rate += 0.05) {
        await wait(300);
        if (canceled) return yield { status: 'canceled', steps: [] };
        yield { status: 'processing', steps: [{ status: 'processing', estimatedProgressRate: rate }] };
      }
      yield { status: 'succeeded', steps: [] };
    },
  },
};

const button = document.querySelector('civitai-workflow-button');
button.app = app;
button.template = { steps: [{ $type: 'textToImage', input: { prompt: 'a red bike' } }] };
for (const type of ['priced', 'submitted', 'finished', 'canceled', 'error']) {
  button.addEventListener(type, () => (log.textContent = `workflow-button: ${type}`));
}
document.querySelector('civitai-sign-in-button').signIn = {
  signedIn: false,
  signIn: async () => (log.textContent = 'sign-in: would leave for Civitai'),
};
```

</template>

</ElementDemo>

### Wiring them to the real SDK

In an app of your own, import both by path and pass the SDK's own objects —
here a client from `createSignIn()`, since `initialize()` with no arguments
waits for a civitai.com host:

```ts
import type { CivitaiWorkflowButton } from '@civitai/components/civitai-workflow-button';
import '@civitai/components/civitai-workflow-button/define';
import { createSignIn, initialize } from '@civitai/sdk';

const auth = await createSignIn({ clientId, scopes: ['ai:write:budgeted'] });
const button = document.querySelector<CivitaiWorkflowButton>('civitai-workflow-button')!;
button.app = await initialize(auth);
button.template = {
  steps: [{
    $type: 'textToImage',
    input: { model: 'urn:air:sdxl:checkpoint:civitai:101055@128078', prompt: 'a red bike', cfgScale: 7, seed: 42 },
  }],
};
```

## Contributing

The source lives in
[`civitai-app-starters/packages/civitai-components`](https://github.com/civitai/civitai-app-starters/tree/main/packages/civitai-components).
To change an element, its playground runs it from source with hot reload:

```bash
pnpm --filter @civitai/components dev
```
