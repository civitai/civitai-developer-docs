# Component showcase

A live gallery of every component in **`@civitai/components`** — the
framework-agnostic, dual-consumption design system that powers Civitai App
Blocks. Each demo renders **live and fully themed** (painted by the *published*
`@civitai/theme` + `@civitai/components` CSS a real consumer installs), above a
source panel you can toggle between the **framework-agnostic HTML** and the
**`@civitai/components-react`** binding.

- **HTML** authors follow the `data-civitai-ui` markup contract (see the
  [Components reference](/apps/reference/components)) and load the two
  stylesheets below.
- **React** authors use `@civitai/components-react` — `@lit/react` bindings
  around the `<civitai-*>` custom elements. Since `0.9.0` those bindings bind
  the elements, **not** the markup contract: the elements style themselves in
  shadow DOM and inject the `@civitai/theme` tokens on first mount, so there is
  no stylesheet to load and no second renderer of the contract. Handlers receive
  the **DOM event**, not an extracted value — `onChange={(e) => e.target.value}`.

🔴 **A binding prop is assigned as a PROPERTY on every render.** `@lit/react`'s
prop effect carries no dependency array (*"it'll run on every re-render"*) and
deliberately skips dirty checking, so a hard-coded `value="…"` or `checked` on a
binding **re-asserts itself and discards what the viewer typed** the next time the
enclosing component renders. That is why the React arms below set no starting
value.

Starting values and form-reset behaviour differ between React 18 and React 19, and
this page deliberately does not characterise them — read the element's own `value`
docstring (`@civitai/components/dist/elements/field-base.d.ts`) and test against
the React major you ship.

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

The previews re-theme with the site: toggle the header's light/dark switch and
every `--civitai-*` token re-resolves in place. The React snippets below are
type-checked against the pinned `@civitai/components-react@0.9.0` declarations on
every build, so they can't drift from the shipped API.

::: tip Setup — the HTML path
The React bindings need neither of these (the elements self-style and inject the
tokens). For hand-written markup, load the tokens **and** the component CSS
(order-independent):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@civitai/theme/styles.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@civitai/components/styles.css" />
```

Then set `data-theme="light"` or `data-theme="dark"` on any ancestor. From JS,
`import { injectStyles } from '@civitai/components'; injectStyles()` injects both
idempotently.
:::

## Button

Native `<button>` (ref-forwarded in React). `data-variant`:
`filled` · `light` · `outline` · `subtle`. `data-size`: `sm` · `md` · `lg`.
Loading sets `aria-busy` + `disabled` and prepends a `sm` loader.

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

<template #react>

```tsx
import { CivitaiButton, CivitaiGroup, CivitaiStack } from '@civitai/components-react';

<CivitaiStack gap="md">
  <CivitaiGroup gap="sm">
    <CivitaiButton variant="filled">Filled</CivitaiButton>
    <CivitaiButton variant="light">Light</CivitaiButton>
    <CivitaiButton variant="outline">Outline</CivitaiButton>
    <CivitaiButton variant="subtle">Subtle</CivitaiButton>
  </CivitaiGroup>
  <CivitaiGroup gap="sm">
    <CivitaiButton size="sm">Small</CivitaiButton>
    <CivitaiButton size="md">Medium</CivitaiButton>
    <CivitaiButton size="lg">Large</CivitaiButton>
  </CivitaiGroup>
  <CivitaiGroup gap="sm">
    <CivitaiButton variant="filled" loading>Saving…</CivitaiButton>
    <CivitaiButton variant="outline" disabled>Disabled</CivitaiButton>
  </CivitaiGroup>
</CivitaiStack>;
```

</template>

</ComponentDemo>

## Badge

Presentational `<span>`. `data-variant`: `filled` · `light` · `outline`.
`data-size`: `sm` · `md` · `lg`. `data-color` (new in 0.1.2): `info` ·
`success` · `warning` · `error` — omit it for the default primary accent.

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

<template #react>

```tsx
import { CivitaiBadge, CivitaiGroup, CivitaiStack } from '@civitai/components-react';

<CivitaiStack gap="md">
  <CivitaiGroup gap="sm">
    <CivitaiBadge variant="filled" size="md">Filled</CivitaiBadge>
    <CivitaiBadge variant="light" size="md">Light</CivitaiBadge>
    <CivitaiBadge variant="outline" size="md">Outline</CivitaiBadge>
  </CivitaiGroup>
  <CivitaiGroup gap="sm">
    <CivitaiBadge variant="filled" color="info" size="md">Info</CivitaiBadge>
    <CivitaiBadge variant="filled" color="success" size="md">Success</CivitaiBadge>
    <CivitaiBadge variant="filled" color="warning" size="md">Warning</CivitaiBadge>
    <CivitaiBadge variant="filled" color="error" size="md">Error</CivitaiBadge>
  </CivitaiGroup>
  <CivitaiGroup gap="sm">
    <CivitaiBadge variant="light" size="sm">Small</CivitaiBadge>
    <CivitaiBadge variant="light" size="md">Medium</CivitaiBadge>
    <CivitaiBadge variant="light" size="lg">Large</CivitaiBadge>
  </CivitaiGroup>
</CivitaiStack>;
```

</template>

</ComponentDemo>

## Alert

`data-civitai-ui="alert"` with **`role="alert"`** (use `role="status"` for
non-urgent). `data-color`: `info` (default) · `success` · `warning` · `error`.
The body lives in `data-civitai-ui-alert-body`, with an optional
`data-civitai-ui-alert-title` and an optional dismiss button.

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

<template #react>

```tsx
import { CivitaiAlert, CivitaiStack } from '@civitai/components-react';

<CivitaiStack gap="sm">
  <CivitaiAlert color="info" heading="Heads up">
    A new model version is available.
  </CivitaiAlert>
  <CivitaiAlert color="success" heading="Saved" closable>
    Your changes are live.
  </CivitaiAlert>
  <CivitaiAlert color="warning">Approaching your Buzz limit.</CivitaiAlert>
  <CivitaiAlert color="error" heading="Generation failed">
    The provider rejected the request.
  </CivitaiAlert>
</CivitaiStack>;
```

</template>

</ComponentDemo>

## TextInput

Labeled `<input>`. The wrapper carries `data-civitai-ui="text-input"`; the label
is wired via `for`/`id`, help text via `aria-describedby`, and the invalid state
via `aria-invalid="true"` + `data-invalid="true"` on the wrapper.

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

<template #react>

```tsx
import { CivitaiTextInput, CivitaiStack } from '@civitai/components-react';

<CivitaiStack gap="md">
  <CivitaiTextInput
    label="Display name"
    description="Shown on your profile."
    required
  />
  <CivitaiTextInput
    label="Email"
    error="Enter a valid email address."
  />
</CivitaiStack>;
```

</template>

</ComponentDemo>

## Textarea

Identical to TextInput, but the control is a resizable `<textarea>`.

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

<template #react>

```tsx
import { CivitaiTextarea } from '@civitai/components-react';

<CivitaiTextarea
  label="Prompt"
  description="Describe what you want to generate."
  rows={3}
  placeholder="a serene alpine lake at dawn"
/>;
```

</template>

</ComponentDemo>

## NumberInput

Identical to TextInput; the control is `<input type="number">`.

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

<template #react>

```tsx
import { CivitaiNumberInput } from '@civitai/components-react';

<CivitaiNumberInput
  label="Steps"
  description="Sampling steps (1–50)."
  placeholder="30"
  min="1"
  max="50"
/>;
```

</template>

</ComponentDemo>

## Select

Labeled native `<select>` — the same field chrome as TextInput, with the
control being a `<select data-civitai-ui-control>` (the native disclosure caret
is retained). This is the framework-agnostic **native** select, not the
interactive JS Select from `@civitai/blocks-react`.

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

<template #react>

```tsx
import { CivitaiSelect } from '@civitai/components-react';

<CivitaiSelect
  label="Base model"
  description="Determines available samplers."
  placeholder="Pick a base model"
  data={[
    { value: 'sdxl', label: 'SDXL 1.0' },
    { value: 'flux', label: 'Flux.1 dev' },
    { value: 'pony', label: 'Pony Diffusion' },
  ]}
/>;
```

</template>

</ComponentDemo>

## Checkbox

A themed native checkbox: the box and its label sit inline in a `-choice` row,
with optional description/error below. `accent-color` carries the theme tint, so
keyboard, focus and indeterminate states are all native.

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

<template #react>

```tsx
import { CivitaiCheckbox, CivitaiStack } from '@civitai/components-react';

<CivitaiStack gap="md">
  <CivitaiCheckbox
    label="Show mature content"
    description="You can change this later in settings."
  />
  <CivitaiCheckbox label="Email me product updates" />
</CivitaiStack>;
```

</template>

</ComponentDemo>

## Radio & RadioGroup

Themed native radios. A **RadioGroup** wraps a set of **Radio**s in a
`role="radiogroup"` with a group label; give the children a shared `name` to
make them one native radio set. `data-orientation="horizontal"` lays the options
in a row (default is a vertical stack).

<ComponentDemo title="Radio & RadioGroup" ui="radio-group">

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

<template #react>

```tsx
import { CivitaiRadioGroup } from '@civitai/components-react';

<CivitaiRadioGroup
  label="Sampler"
  name="sampler"
  data={[
    { value: 'euler', label: 'Euler a' },
    { value: 'ddim', label: 'DDIM' },
    { value: 'dpm', label: 'DPM++ 2M Karras' },
  ]}
/>;
```

</template>

</ComponentDemo>

## Card

Presentational surface container. In light mode a card gets a **subtle default
hairline** (surface == body there, so an unbordered card would be invisible);
`data-with-border="true"` upgrades that to the **stronger, fully-opaque** border.
`data-padding`: `sm` · `md` · `lg`.

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

<template #react>

```tsx
import { CivitaiCard, CivitaiStack, CivitaiGroup } from '@civitai/components-react';

<CivitaiGroup gap="md">
  <CivitaiCard withBorder padding="md">
    <CivitaiStack gap="sm">
      <strong>With border</strong>
      <span>An explicit, fully-opaque border at medium padding.</span>
    </CivitaiStack>
  </CivitaiCard>
  <CivitaiCard padding="lg">
    <CivitaiStack gap="sm">
      <strong>Default</strong>
      <span>The subtle default hairline at large padding.</span>
    </CivitaiStack>
  </CivitaiCard>
</CivitaiGroup>;
```

</template>

</ComponentDemo>

## Stack & Group

Layout primitives. **Stack** lays its children out **vertically** (top-to-bottom);
**Group** lays them out **horizontally** (left-to-right, center-aligned). Both
take `data-gap`: `sm` · `md` · `lg` — the numbered chips below make the direction
and the gap obvious (the chips are plain filler content, not components).

<ComponentDemo title="Stack & Group" ui="stack">

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

<template #react>

```tsx
import { CivitaiStack, CivitaiGroup } from '@civitai/components-react';

const chip = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '2.25rem',
  height: '2.25rem',
  borderRadius: 8,
  background: 'var(--civitai-color-primary)',
  color: 'var(--civitai-color-primary-fg)',
  fontWeight: 700,
} as const;

<CivitaiStack gap="lg">
  <CivitaiStack gap="sm">
    <strong>Stack — vertical, gap="md"</strong>
    <CivitaiStack gap="md">
      <div style={chip}>1</div>
      <div style={chip}>2</div>
      <div style={chip}>3</div>
    </CivitaiStack>
  </CivitaiStack>
  <CivitaiStack gap="sm">
    <strong>Group — horizontal, gap="md"</strong>
    <CivitaiGroup gap="md">
      <div style={chip}>1</div>
      <div style={chip}>2</div>
      <div style={chip}>3</div>
    </CivitaiGroup>
  </CivitaiStack>
</CivitaiStack>;
```

</template>

</ComponentDemo>

## Loader

Spinner. `data-size`: `sm` · `md` · `lg`. Decorative inside a button →
`aria-hidden="true"`; standalone → wrap with `role="status"` + an accessible
label.

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

<template #react>

```tsx
import { CivitaiLoader, CivitaiGroup } from '@civitai/components-react';

<CivitaiGroup gap="lg">
  <CivitaiLoader size="sm" />
  <CivitaiLoader size="md" />
  <CivitaiLoader size="lg" />
  <span role="status">
    <CivitaiLoader size="md" aria-hidden="true" />
    <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
      Loading…
    </span>
  </span>
</CivitaiGroup>;
```

</template>

</ComponentDemo>
