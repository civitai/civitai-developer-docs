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

This page covers the **21** components of the CSS pack. The elements are a wider
set — **47** tags, most with no `data-civitai-ui` rule at all (`civitai-modal`,
`civitai-menu`, `civitai-table`, `civitai-tabs`, `civitai-switch`,
`civitai-avatar`, …) — and each one has its own live instance, attributes,
slots and events in the
[Element gallery](/apps/reference/elements).

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

## Text

The typography primitive, and the one component that prescribes **no element of
its own** — you write the tag the meaning calls for and this styles it: `<h1>`–
`<h6>` for a heading, `<p>` for a paragraph, `<span>` for inline text. A heading
MUST be a real heading element; that is what puts it in the document outline and
in a screen reader's heading list, and a styled `<div>` is not a substitute.

`data-size`: `xs` · `sm` · `md` (default) · `lg` · `xl` · `2xl` · `3xl` · `4xl` ·
`5xl`. `data-weight`: `normal` (default) · `medium` · `semibold` · `bold`.

**Size and heading level are independent, on purpose.** `data-size` never changes
what the element means and the element never changes the size, so an `<h2>` can
be the small print of a card and a `<p>` can be the lede. The ramp is one scale
in two halves — `xs`–`lg` is the UI ramp (`sm`/`md`/`lg` are byte-identical to
Button's), `xl`–`5xl` is the heading ramp, and every value from `lg` up is one
the `ci-fs-*` utilities already ship. Margins are reset to `0`: the browser's
defaults are em-relative and would move with every `data-size`, so vertical
rhythm belongs to `stack` / `group`.

🔴 **Text sets `color: inherit`, not the text token — on both tracks.** It renders
in whatever colour it inherits, so wherever an ancestor `color` and
`--civitai-color-text` disagree, Text follows the ancestor; an ancestor `color` is
the common case, not the exception. Colour, alignment and truncation are
deliberately **utilities rather than attributes** (`ci-muted`, `ci-text-info` /
`-success` / `-warning` / `-error`, `ci-text-default`, `ci-text-start` /
`-center` / `-end`, `ci-truncate`) — and 🔴 they live in
`@civitai/components/utilities.css`, a **separate stylesheet neither
`injectStyles()` nor `@civitai/blocks-react`'s `injectBlocksStyles()` injects**,
so on either of those paths they are unknown classes that silently do nothing.
This page loads the tokens and `styles.css` only, which is why the demo below
uses no `ci-*` class: link `utilities.css` alongside `styles.css` if you colour,
align or truncate text. Full contract — the px/rem unit caveat and the
`ci-fs-N` mapping — in the [Components reference](/apps/reference/components).

<ComponentDemo title="Text" ui="text">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="md">
  <h2 data-civitai-ui="text" data-size="4xl" data-weight="bold">Generate an image</h2>
  <p data-civitai-ui="text" data-size="xl">Pick a model, then press Generate.</p>
  <p data-civitai-ui="text">The body size is <code>md</code>, the default.</p>
  <p data-civitai-ui="text" data-size="sm" data-weight="semibold">Small and semibold.</p>
  <h3 data-civitai-ui="text" data-size="xs" data-weight="medium">
    An h3 at the smallest size — the level is structure, the size is design.
  </h3>
  <p data-civitai-ui="text" data-size="2xl" data-weight="medium">Heading ramp, 2xl</p>
  <p data-civitai-ui="text" data-size="lg">
    Inline <span data-civitai-ui="text" data-size="lg" data-weight="bold">bold run</span> inside a sentence.
  </p>
</div>
```

</template>

<template #react>

```tsx
import { CivitaiText, CivitaiStack } from '@civitai/components-react';

<CivitaiStack gap="md">
  <CivitaiText as="h2" size="4xl" weight="bold">Generate an image</CivitaiText>
  <CivitaiText size="xl">Pick a model, then press Generate.</CivitaiText>
  <CivitaiText>The body size is md, the default.</CivitaiText>
  <CivitaiText size="sm" weight="semibold">Small and semibold.</CivitaiText>
  <CivitaiText as="h3" size="xs" weight="medium">
    An h3 at the smallest size — the level is structure, the size is design.
  </CivitaiText>
  <CivitaiText size="2xl" weight="medium">Heading ramp, 2xl</CivitaiText>
  <CivitaiText size="lg">
    Inline <CivitaiText as="span" size="lg" weight="bold">bold run</CivitaiText> inside a sentence.
  </CivitaiText>
</CivitaiStack>;
```

</template>

</ComponentDemo>

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

## Radio

Identical chrome to Checkbox, with the control being
`<input type="radio" id="ID">`. Group several by giving them the same `name` —
that is what makes them one native radio set, and it is the whole mechanism; the
RadioGroup below adds the `role="radiogroup"` layout and group label on top.

🔴 **The React arm is `CivitaiRadioGroup`, not a `CivitaiRadio` — there is no
such binding and no `<civitai-radio>` element.** Native `name` exclusion is
tree-scoped, so radios in sibling shadow roots would never group; one element
owns the whole set to keep that behaviour native. On the element track a
standalone radio is therefore a one-option group.

<ComponentDemo title="Radio" ui="radio">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="md">
  <div data-civitai-ui="radio">
    <div data-civitai-ui-choice>
      <input type="radio" name="quality" id="q-draft" checked aria-describedby="q-draft-desc" />
      <label data-civitai-ui-label for="q-draft">Draft</label>
    </div>
    <span id="q-draft-desc" data-civitai-ui-description>Fewer steps, cheaper.</span>
  </div>
  <div data-civitai-ui="radio">
    <div data-civitai-ui-choice>
      <input type="radio" name="quality" id="q-final" />
      <label data-civitai-ui-label for="q-final">Final</label>
    </div>
  </div>
  <div data-civitai-ui="radio">
    <div data-civitai-ui-choice>
      <input type="radio" name="quality" id="q-locked" disabled />
      <label data-civitai-ui-label for="q-locked">Unavailable</label>
    </div>
  </div>
</div>
```

</template>

<template #react>

```tsx
import { CivitaiRadioGroup } from '@civitai/components-react';

<CivitaiRadioGroup
  name="quality"
  description="Fewer steps is cheaper."
  data={[
    { value: 'draft', label: 'Draft' },
    { value: 'final', label: 'Final' },
    { value: 'locked', label: 'Unavailable', disabled: true },
  ]}
/>;
```

</template>

</ComponentDemo>

## RadioGroup

A **RadioGroup** wraps a set of **Radio**s in a `role="radiogroup"` with a group
label; give the children a shared `name` to make them one native radio set.
`data-orientation="horizontal"` lays the options in a row (default is a vertical
stack). A group-level error goes in a `data-civitai-ui-error` span *after* the
options container, with `aria-invalid="true"` + `data-invalid="true"` on the
wrapper.

<ComponentDemo title="RadioGroup" ui="radio-group">

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

## Group — wrap and nowrap

Group is the horizontal half of the pair above; this demo is the part of its
contract the side-by-side comparison cannot show. **Group wraps by default** — a
row of several controls reflows onto more rows rather than overflowing a narrow
slot — and its children may shrink below their content width, so one long
unbroken label narrows instead of pushing the whole row past the container.
`data-nowrap="true"` keeps the row on one line; use it only where a single line
is load-bearing, and expect overflow at narrow widths. The `<civitai-group>`
element spells the same choice as a `nowrap` **property** (reflected to the
`nowrap` attribute) rather than `data-nowrap`.

The two rows below are both constrained to 320px so the difference is visible at
this page width rather than only on a phone.

<ComponentDemo title="Group" ui="group">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="lg">
  <div data-civitai-ui="stack" data-gap="sm">
    <strong>Default — wraps</strong>
    <div style="width:320px;outline:1px dashed var(--civitai-color-border);padding:8px">
      <div data-civitai-ui="group" data-gap="sm">
        <button data-civitai-ui="button" data-variant="light" data-size="sm">Euler a</button>
        <button data-civitai-ui="button" data-variant="light" data-size="sm">DPM++ 2M Karras</button>
        <button data-civitai-ui="button" data-variant="light" data-size="sm">DDIM</button>
        <button data-civitai-ui="button" data-variant="light" data-size="sm">UniPC</button>
      </div>
    </div>
  </div>
  <div data-civitai-ui="stack" data-gap="sm">
    <strong>data-nowrap="true" — one line, overflows</strong>
    <div style="width:320px;outline:1px dashed var(--civitai-color-border);padding:8px;overflow:hidden">
      <div data-civitai-ui="group" data-gap="sm" data-nowrap="true">
        <button data-civitai-ui="button" data-variant="light" data-size="sm">Euler a</button>
        <button data-civitai-ui="button" data-variant="light" data-size="sm">DPM++ 2M Karras</button>
        <button data-civitai-ui="button" data-variant="light" data-size="sm">DDIM</button>
        <button data-civitai-ui="button" data-variant="light" data-size="sm">UniPC</button>
      </div>
    </div>
  </div>
</div>
```

</template>

<template #react>

```tsx
import { CivitaiButton, CivitaiGroup, CivitaiStack } from '@civitai/components-react';

const frame = { width: 320, padding: 8, overflow: 'hidden' } as const;

<CivitaiStack gap="lg">
  <CivitaiStack gap="sm">
    <strong>Default — wraps</strong>
    <div style={frame}>
      <CivitaiGroup gap="sm">
        <CivitaiButton variant="light" size="sm">Euler a</CivitaiButton>
        <CivitaiButton variant="light" size="sm">DPM++ 2M Karras</CivitaiButton>
        <CivitaiButton variant="light" size="sm">DDIM</CivitaiButton>
        <CivitaiButton variant="light" size="sm">UniPC</CivitaiButton>
      </CivitaiGroup>
    </div>
  </CivitaiStack>
  <CivitaiStack gap="sm">
    <strong>nowrap — one line, overflows</strong>
    <div style={frame}>
      <CivitaiGroup gap="sm" nowrap>
        <CivitaiButton variant="light" size="sm">Euler a</CivitaiButton>
        <CivitaiButton variant="light" size="sm">DPM++ 2M Karras</CivitaiButton>
        <CivitaiButton variant="light" size="sm">DDIM</CivitaiButton>
        <CivitaiButton variant="light" size="sm">UniPC</CivitaiButton>
      </CivitaiGroup>
    </div>
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

## Slider

A themed native `<input type="range">` — `accent-color` carries the theme tint,
so keyboard (arrows, Home/End, Page Up/Down) and ARIA come from the native
control. The wrapper holds, in order: an optional
`data-civitai-ui-slider-header` wrapping the label and an optional
`<output data-civitai-ui-slider-value>` read-out (without a read-out, use a bare
`<label data-civitai-ui-label>` instead of the header), an optional description,
the `<input type="range">` itself, and an optional error. Like checkbox and
radio the input does **not** carry `data-civitai-ui-control` — that is the
bordered field-input chrome. Set `min`/`max`/`step`/`value` natively; invalid is
`aria-invalid="true"` + `data-invalid="true"` on the wrapper, which tints the
track to the error token.

🔴 **A formatted read-out needs `aria-valuetext`, and nothing does it for you on
either track.** When the read-out shows something other than the raw number
(`20%`, `Large`), set `aria-valuetext` on the input to that same string or a
screen reader announces the raw `aria-valuenow` instead. `<civitai-slider>`'s
`show-value` renders the RAW value and sets no `aria-valuetext` — the attribute
appears nowhere in the package's element sources — and the React `<Slider>` that
used to set it from a `valueLabel` prop was deleted with the hand-written layer,
so that prop has no element equivalent.

<ComponentDemo title="Slider" ui="slider">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="lg">
  <div data-civitai-ui="slider">
    <div data-civitai-ui-slider-header>
      <label data-civitai-ui-label for="steps-range">Steps</label>
      <output data-civitai-ui-slider-value for="steps-range">20</output>
    </div>
    <span id="steps-range-desc" data-civitai-ui-description>Sampling steps (1–50).</span>
    <input type="range" id="steps-range" min="1" max="50" value="20" aria-describedby="steps-range-desc" />
  </div>
  <div data-civitai-ui="slider">
    <div data-civitai-ui-slider-header>
      <label data-civitai-ui-label for="denoise">Denoise</label>
      <output data-civitai-ui-slider-value for="denoise">40%</output>
    </div>
    <input type="range" id="denoise" min="0" max="100" step="5" value="40" aria-valuetext="40%" />
  </div>
  <div data-civitai-ui="slider" data-invalid="true">
    <label data-civitai-ui-label for="cfg">CFG scale</label>
    <input type="range" id="cfg" min="1" max="30" value="28" aria-invalid="true" aria-describedby="cfg-err" />
    <span id="cfg-err" data-civitai-ui-error role="alert">Above 20 the output tends to burn.</span>
  </div>
  <div data-civitai-ui="slider">
    <label data-civitai-ui-label for="locked-range">Locked</label>
    <input type="range" id="locked-range" min="0" max="10" value="5" disabled />
  </div>
</div>
```

</template>

<template #react>

```tsx
import { CivitaiSlider, CivitaiStack } from '@civitai/components-react';

<CivitaiStack gap="lg">
  <CivitaiSlider
    label="Steps"
    description="Sampling steps (1–50)."
    min="1"
    max="50"
    showValue
  />
  <CivitaiSlider label="Denoise" min="0" max="100" step="5" showValue />
  <CivitaiSlider
    label="CFG scale"
    min="1"
    max="30"
    error="Above 20 the output tends to burn."
  />
  <CivitaiSlider label="Locked" min="0" max="10" disabled />
</CivitaiStack>;
```

</template>

</ComponentDemo>

## SegmentedControl

A row of segment buttons with **roving tabindex** and arrow-key navigation, in
one of two ARIA role modes. The CSS is presentational only: **hand-HTML authors
MUST implement the keyboard behaviour themselves**, so prefer an element for
interactive use — `<civitai-segmented-control>` for the panel-less value switch
(`radiogroup` / `radio`), and `<civitai-tabs>` when the segments actually switch
panels. They are two elements rather than one with a mode because a `tab`'s
`aria-controls` is an IDREF, and an IDREF cannot reach a panel in the light DOM
from inside a shadow root — so `CivitaiSegmentedControl` has no `tabs` mode and
`CivitaiTabs` is the binding for the second arm.

Common to both modes: an accessible name on the wrapper (`aria-label` or
`aria-labelledby`), `data-size` `sm` · `md` (default) · `lg`, and exactly one
segment with `tabindex="0"` while the rest carry `tabindex="-1"`. In mode
`toggle` (the default) the wrapper is `role="radiogroup"` and each segment is
`role="radio"` with `aria-checked`; in mode `tabs` the wrapper is
`role="tablist"` and each segment is `role="tab"` with `aria-selected` and an
`aria-controls` pointing at a `data-civitai-ui-tabpanel`.

<ComponentDemo title="SegmentedControl" ui="segmented-control">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="lg">
  <div data-civitai-ui="stack" data-gap="sm">
    <strong>Mode <code>toggle</code> — a panel-less value switch</strong>
    <div data-civitai-ui="segmented-control" role="radiogroup" aria-label="Layout" data-size="md">
      <button data-civitai-ui-segment role="radio" aria-checked="true" tabindex="0">Grid</button>
      <button data-civitai-ui-segment role="radio" aria-checked="false" tabindex="-1">List</button>
      <button data-civitai-ui-segment role="radio" aria-checked="false" tabindex="-1" disabled>Map</button>
    </div>
  </div>
  <div data-civitai-ui="stack" data-gap="sm">
    <strong>Mode <code>tabs</code> — segments switch visible panels</strong>
    <div data-civitai-ui="segmented-control" role="tablist" aria-label="View" data-size="sm">
      <button data-civitai-ui-segment role="tab" id="t-grid" aria-selected="true"
              aria-controls="p-grid" tabindex="0">Grid</button>
      <button data-civitai-ui-segment role="tab" id="t-list" aria-selected="false"
              aria-controls="p-list" tabindex="-1">List</button>
    </div>
    <div data-civitai-ui-tabpanel role="tabpanel" id="p-grid" aria-labelledby="t-grid" tabindex="0">
      The grid panel.
    </div>
    <div data-civitai-ui-tabpanel role="tabpanel" id="p-list" aria-labelledby="t-list" tabindex="0" hidden>
      The list panel.
    </div>
  </div>
</div>
```

</template>

<template #react>

```tsx
import {
  CivitaiSegmentedControl,
  CivitaiStack,
  CivitaiTabPanel,
  CivitaiTabs,
} from '@civitai/components-react';

<CivitaiStack gap="lg">
  <CivitaiSegmentedControl
    label="Layout"
    size="md"
    data={[
      { value: 'grid', label: 'Grid' },
      { value: 'list', label: 'List' },
      { value: 'map', label: 'Map', disabled: true },
    ]}
  />
  <CivitaiTabs
    data={[
      { value: 'grid', label: 'Grid' },
      { value: 'list', label: 'List' },
    ]}
  >
    <CivitaiTabPanel value="grid">The grid panel.</CivitaiTabPanel>
    <CivitaiTabPanel value="list">The list panel.</CivitaiTabPanel>
  </CivitaiTabs>
</CivitaiStack>;
```

</template>

</ComponentDemo>

## Toast region

The `aria-live` notification host: a fixed bottom-right stack that owns the
queue. `<civitai-toast-region>` owns the auto-dismiss timers too — call its
`show(options)` method, which enqueues a toast and returns its id. (Until
`@civitai/components-react@0.9.0` a React `ToastProvider` + `useToast()` pair did
this; both were deleted with the hand-written layer.) Hand-HTML authors render
into the region themselves and add each toast so the live region announces it.
Use `aria-live="assertive"` for urgent errors.

::: info The preview constrains the region on purpose
`[data-civitai-ui="toast-region"]` is `position: fixed` — in a real app it pins
to the viewport corner above everything else. The preview below wraps it in a
`contain: paint` box, which makes that box the containing block for fixed
descendants, so the stack renders in place instead of floating over this page.
That wrapper is demo scaffolding; it is not part of the contract.
:::

<ComponentDemo title="Toast region" ui="toast-region">

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

<template #react>

```tsx
import { CivitaiToast, CivitaiToastRegion } from '@civitai/components-react';

// Rendered declaratively. To enqueue imperatively instead, hold a ref to the
// region and call `region.show({ message, heading, color, duration, urgent })`,
// which returns the new toast's id.
<CivitaiToastRegion>
  <CivitaiToast color="success" heading="Saved" closable>
    Your changes are live.
  </CivitaiToast>
  <CivitaiToast color="info">Queued behind the first one.</CivitaiToast>
</CivitaiToastRegion>;
```

</template>

</ComponentDemo>

## Toast

The individual notification card — a separate `data-civitai-ui` name from the
region, so the presentational contract is shared by hand HTML and the element.
`role="status"` (or `role="alert"` for urgent). `data-color`: `info` · `success` ·
`warning` · `error` colours the **left accent** only; omit it for the neutral
accent. Same intent set as Alert. The body lives in
`data-civitai-ui-toast-body` with an optional `data-civitai-ui-toast-title`, and
the dismiss button is `data-civitai-ui-toast-close`.

Shown here outside a region so the card itself is legible; in a real app a toast
is always a child of a `toast-region`, which is what makes it announced.

<ComponentDemo title="Toast" ui="toast">

<template #html>

```html
<div data-civitai-ui="stack" data-gap="sm">
  <div data-civitai-ui="toast" role="status">
    <div data-civitai-ui-toast-body>Neutral accent — no data-color.</div>
  </div>
  <div data-civitai-ui="toast" data-color="info" role="status">
    <div data-civitai-ui-toast-body>
      <div data-civitai-ui-toast-title>Heads up</div>
      A new model version is available.
    </div>
    <button data-civitai-ui-toast-close aria-label="Dismiss">×</button>
  </div>
  <div data-civitai-ui="toast" data-color="success" role="status">
    <div data-civitai-ui-toast-body>
      <div data-civitai-ui-toast-title>Saved</div>
      Your changes are live.
    </div>
  </div>
  <div data-civitai-ui="toast" data-color="warning" role="status">
    <div data-civitai-ui-toast-body>Approaching your Buzz limit.</div>
  </div>
  <div data-civitai-ui="toast" data-color="error" role="alert">
    <div data-civitai-ui-toast-body>
      <div data-civitai-ui-toast-title>Generation failed</div>
      The provider rejected the request.
    </div>
    <button data-civitai-ui-toast-close aria-label="Dismiss">×</button>
  </div>
</div>
```

</template>

<template #react>

```tsx
import { CivitaiStack, CivitaiToast } from '@civitai/components-react';

<CivitaiStack gap="sm">
  <CivitaiToast>Neutral accent — no color.</CivitaiToast>
  <CivitaiToast color="info" heading="Heads up" closable>
    A new model version is available.
  </CivitaiToast>
  <CivitaiToast color="success" heading="Saved">
    Your changes are live.
  </CivitaiToast>
  <CivitaiToast color="warning">Approaching your Buzz limit.</CivitaiToast>
  <CivitaiToast color="error" heading="Generation failed" closable urgent>
    The provider rejected the request.
  </CivitaiToast>
</CivitaiStack>;
```

</template>

</ComponentDemo>

## Tooltip

A hover/focus tooltip: a positioned `role="tooltip"` bubble revealed when the
wrapper is hovered or contains focus. The wrapper is a
`<span data-civitai-ui="tooltip">` holding the **trigger** (with
`aria-describedby="TIP_ID"`) followed by
`<span data-civitai-ui-tooltip-bubble role="tooltip" id="TIP_ID">`. The reveal is
pure CSS; `data-open="true"` forces the bubble open, and
`data-dismissed="true"` **force-hides** it — it overrides the hover/focus reveal,
which is what makes Escape-to-dismiss work while the pointer is still hovering.
`<civitai-tooltip>` wires `aria-describedby` and that Escape handling for you.

The trigger must be focusable so keyboard users can reveal the tooltip, and the
text should stay short — it is supplementary, not the accessible name. The third
example below is pinned with `data-open="true"` so the bubble is visible without
hovering.

<ComponentDemo title="Tooltip" ui="tooltip">

<template #html>

```html
<div data-civitai-ui="group" data-gap="lg" style="padding-top:2.5rem">
  <span data-civitai-ui="tooltip">
    <button data-civitai-ui="button" data-variant="light" aria-describedby="tip-seed">Seed</button>
    <span data-civitai-ui-tooltip-bubble role="tooltip" id="tip-seed">Randomize the seed</span>
  </span>
  <span data-civitai-ui="tooltip">
    <button data-civitai-ui="button" data-variant="subtle" aria-describedby="tip-cfg">CFG</button>
    <span data-civitai-ui-tooltip-bubble role="tooltip" id="tip-cfg">
      How closely the result follows the prompt
    </span>
  </span>
  <span data-civitai-ui="tooltip">
    <button data-civitai-ui="button" data-variant="outline" aria-describedby="tip-open">Pinned open</button>
    <span data-civitai-ui-tooltip-bubble role="tooltip" id="tip-open" data-open="true">
      data-open="true"
    </span>
  </span>
</div>
```

</template>

<template #react>

```tsx
import { CivitaiButton, CivitaiGroup, CivitaiTooltip } from '@civitai/components-react';

<CivitaiGroup gap="lg">
  <CivitaiTooltip label="Randomize the seed">
    <CivitaiButton variant="light">Seed</CivitaiButton>
  </CivitaiTooltip>
  <CivitaiTooltip label="How closely the result follows the prompt">
    <CivitaiButton variant="subtle">CFG</CivitaiButton>
  </CivitaiTooltip>
  <CivitaiTooltip label='the "open" property' open>
    <CivitaiButton variant="outline">Pinned open</CivitaiButton>
  </CivitaiTooltip>
</CivitaiGroup>;
```

</template>

</ComponentDemo>

## Image

A media container with a token placeholder background (visible while loading),
`object-fit` control, and a broken-image fallback. Size the wrapper yourself with
`width`/`height`/`aspect-ratio`. The `<img data-civitai-ui-image-img>` takes
`data-fit`: `cover` (default) · `contain`, and always needs an `alt`.

🔴 **The two tracks spell the status differently.** Hand-HTML authors set
`data-status` (`loading` · `loaded` · `error`; omitted ⇒ the image shows)
themselves, and the optional `data-civitai-ui-image-fallback` overlay shows only
at `data-status="error"`. `<civitai-image>` tracks the same thing from the native
`load`/`error` events but reflects it as **`status`**, not `data-status` — its CSS
keys off `:host([status='loading'])`. Its React binding also exposes `pending`
(still being made: a loader shows and nothing is requested) and `blocked`
(withheld from this viewer), which the attribute track has no equivalent for.

<ComponentDemo title="Image" ui="image">

<template #html>

```html
<div data-civitai-ui="group" data-gap="md">
  <div data-civitai-ui="image" style="width:160px;aspect-ratio:1 / 1">
    <img data-civitai-ui-image-img data-fit="cover" src="/images/oauth/edit-oauth-app.png" alt="cover" />
  </div>
  <div data-civitai-ui="image" style="width:160px;aspect-ratio:1 / 1">
    <img data-civitai-ui-image-img data-fit="contain" src="/images/oauth/edit-oauth-app.png" alt="contain" />
  </div>
  <div data-civitai-ui="image" data-status="loading" style="width:160px;aspect-ratio:1 / 1">
    <img data-civitai-ui-image-img src="/images/oauth/edit-oauth-app.png" alt="loading" />
  </div>
  <div data-civitai-ui="image" data-status="error" style="width:160px;aspect-ratio:1 / 1">
    <img data-civitai-ui-image-img src="/images/oauth/edit-oauth-app.png" alt="" />
    <div data-civitai-ui-image-fallback aria-hidden="true">Image unavailable</div>
  </div>
</div>
```

</template>

<template #react>

```tsx
import { CivitaiGroup, CivitaiImage } from '@civitai/components-react';

const box = { width: 160, aspectRatio: '1 / 1' } as const;

<CivitaiGroup gap="md">
  <CivitaiImage style={box} fit="cover" src="/images/oauth/edit-oauth-app.png" alt="cover" />
  <CivitaiImage style={box} fit="contain" src="/images/oauth/edit-oauth-app.png" alt="contain" />
  <CivitaiImage style={box} pending alt="still being made" />
  <CivitaiImage style={box} blocked alt="withheld" fallback="Image unavailable" />
</CivitaiGroup>;
```

</template>

</ComponentDemo>
