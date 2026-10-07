---
title: Elements gallery
description: Every <civitai-*> custom element in @civitai/components, rendered live with copy-paste HTML — buttons, forms, overlays, navigation, tables, media and the Civitai vocabulary.
---

# Elements gallery

`@civitai/components` ships the Civitai design system as **`<civitai-*>` custom
elements**. They style themselves in shadow DOM, inject the `@civitai/theme`
tokens on first use, and carry their own keyboard and ARIA behaviour, so they
work the same in plain HTML, React, Vue, Svelte or Blazor.

Every demo below is live: the preview is rendered from the code shown under it,
and it follows the site's light/dark switch.

::: tip Elements or markup?
This page covers the **elements**. The [Component showcase](./showcase) covers
the other way to consume the package: hand-written `data-civitai-ui` markup over
a stylesheet. Pick the elements unless you need zero JavaScript.
:::

## Setup

**No build step** — one script tag. `site-elements.js` registers every element
except the two that act as the viewer (`<civitai-sign-in-button>`,
`<civitai-workflow-button>`), which need their own `define` import — see
[Acting as the viewer](#acting-as-the-viewer):

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@civitai/components/site-elements.js"></script>

<civitai-button variant="filled">Generate</civitai-button>
```

`site-elements.js` is the generic kit plus the Civitai vocabulary (rating
badges, tags, reactions, media cards). `elements.js` is the generic kit alone.
Building a Civitai App? [Using the elements in a block](./guide/elements#register-the-elements)
has the table of which import defines which elements, and the token limits that
apply inside a block.

**With a bundler:**

```bash
npm install @civitai/components
```

```ts
import '@civitai/components/register-site'; // all but the two viewer elements, or:
import '@civitai/components/civitai-button/define'; // one element at a time
```

**React** — typed bindings with props and events from the element classes:

```tsx
import { CivitaiButton, CivitaiCard, CivitaiStack, CivitaiTextInput } from '@civitai/components-react';

export function PromptCard({ onGenerate }: { onGenerate: () => void }) {
  return (
    <CivitaiCard withBorder padding="md">
      <CivitaiStack gap="md">
        <CivitaiTextInput label="Prompt" description="What to generate" />
        <CivitaiButton variant="filled" onClick={onGenerate}>
          Generate
        </CivitaiButton>
      </CivitaiStack>
    </CivitaiCard>
  );
}
```

### How the elements behave

| | |
|---|---|
| **Attributes and properties** | Every attribute mirrors a property, kebab-cased: `full-width` ⇄ `fullWidth`. |
| **Lists of options** | `select`, `segmented-control`, `radio-group`, `tabs` and `breadcrumb` take their items as a `data` **property**, since an attribute cannot carry an array. |
| **Events** | `change` is re-dispatched from the host. Richer events (`vote`, `react`, `select`, `open`) carry a `detail`. |
| **Forms** | Field elements are form-associated: `name`, `FormData`, `required`, `form.reset()`, `type="submit"` and Enter-to-submit all work. Setting `error` also makes the field invalid. |
| **Theme** | Set `data-theme="light"` or `"dark"` on any ancestor. With neither, the OS preference wins. |
| **Styling** | Override any `--civitai-*` token, or reach inside with `::part(...)`. |

The full contract — every tag, attribute, property, event, slot and part — is
the package's generated
[`custom-elements.json`](https://cdn.jsdelivr.net/npm/@civitai/components/custom-elements.json).

## Buttons

`variant`: `filled` · `light` · `outline` · `subtle`. `size`: `sm` · `md` · `lg`.
`<civitai-button-group>` joins its buttons into one control.

<ElementDemo title="Button" tags="civitai-button civitai-button-group">

<template #html>

```html
<civitai-group>
  <civitai-button variant="filled">Filled</civitai-button>
  <civitai-button variant="light">Light</civitai-button>
  <civitai-button variant="outline">Outline</civitai-button>
  <civitai-button variant="subtle">Subtle</civitai-button>
</civitai-group>
<civitai-group>
  <civitai-button size="sm">Small</civitai-button>
  <civitai-button loading>Loading</civitai-button>
  <civitai-button disabled>Disabled</civitai-button>
  <civitai-button>Next<span slot="right">&rarr;</span></civitai-button>
</civitai-group>
<civitai-button-group aria-label="Alignment">
  <civitai-button variant="outline">Left</civitai-button>
  <civitai-button variant="outline">Center</civitai-button>
  <civitai-button variant="outline">Right</civitai-button>
</civitai-button-group>
```

</template>

</ElementDemo>

## Text and layout

`<civitai-text>` separates the outline from the look: `as` picks the heading
level, `size` (`xs` … `5xl`) and `weight` pick the design. `<civitai-stack>`
lays out vertically and `<civitai-group>` horizontally, both with `gap`
(`sm` · `md` · `lg`). `<civitai-card>` takes `padding` and `with-border`.

<ElementDemo title="Text and layout" tags="civitai-text civitai-stack civitai-group civitai-card">

<template #html>

```html
<civitai-card with-border padding="md">
  <civitai-stack gap="sm">
    <civitai-text as="h3" size="2xl" weight="bold">Generate an image</civitai-text>
    <civitai-text>Body copy at the default size.</civitai-text>
    <civitai-group gap="sm">
      <civitai-text size="sm" weight="medium">sm medium</civitai-text>
      <civitai-text size="xs">xs</civitai-text>
    </civitai-group>
  </civitai-stack>
</civitai-card>
```

</template>

</ElementDemo>

## Status and feedback

<ElementDemo title="Badge, loader, alert, progress" tags="civitai-badge civitai-loader civitai-alert civitai-progress">

<template #html>

```html
<civitai-group>
  <civitai-badge>default</civitai-badge>
  <civitai-badge variant="light" color="success">ready</civitai-badge>
  <civitai-badge variant="outline" color="warning">queued</civitai-badge>
  <civitai-badge color="error">failed</civitai-badge>
  <civitai-loader size="sm" label="Working"></civitai-loader>
</civitai-group>
<civitai-alert heading="Heads up">The default info intent.</civitai-alert>
<civitai-alert color="error" heading="Generation failed" closable>Not enough Buzz.</civitai-alert>
<civitai-progress label="Generating" value="64" show-value></civitai-progress>
<civitai-progress label="Preparing" indeterminate color="warning"></civitai-progress>
```

</template>

</ElementDemo>

## Text fields

`label`, `description`, `placeholder`, `required`, `disabled`, `readonly` and
`error` work on every field. `<civitai-input-group>` joins fields, buttons and
`data-affix` text into one row.

<ElementDemo title="Text fields" tags="civitai-text-input civitai-number-input civitai-textarea civitai-input-group">

<template #html>

```html
<civitai-text-input label="Prompt" description="What to draw" placeholder="a cat"></civitai-text-input>
<civitai-group style="align-items: flex-start">
  <civitai-number-input label="Seed" value="12345" min="0"></civitai-number-input>
  <civitai-number-input label="Steps" value="999" max="150" error="Max is 150"></civitai-number-input>
</civitai-group>
<civitai-textarea label="Negative prompt" rows="3"></civitai-textarea>
<civitai-input-group>
  <civitai-number-input aria-label="Tip" value="100" min="1"></civitai-number-input>
  <span data-affix>Buzz</span>
  <civitai-button>Tip</civitai-button>
</civitai-input-group>
```

</template>

</ElementDemo>

## Choices

`select`, `segmented-control` and `radio-group` take their options through the
`data` property. Each option is `{ value, label, disabled? }`.

<ElementDemo title="Choices" tags="civitai-select civitai-segmented-control civitai-radio-group civitai-checkbox civitai-switch civitai-slider">

<template #html>

```html
<civitai-select label="Model" placeholder="Pick a model"></civitai-select>
<civitai-segmented-control aria-label="View"></civitai-segmented-control>
<civitai-radio-group label="Speed" orientation="horizontal"></civitai-radio-group>
<civitai-group>
  <civitai-checkbox label="Upscale" checked></civitai-checkbox>
  <civitai-switch label="Public"></civitai-switch>
</civitai-group>
<civitai-slider label="CFG scale" min="1" max="20" step="0.5" value="7" show-value></civitai-slider>
```

</template>

<template #js>

```js
document.querySelector('civitai-select').data = [
  { value: 'flux', label: 'Flux.1 [dev]' },
  { value: 'sdxl', label: 'SDXL' },
  { value: 'sd15', label: 'SD 1.5 (retired)', disabled: true },
];
document.querySelector('civitai-segmented-control').data = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
  { value: 'feed', label: 'Feed' },
];
document.querySelector('civitai-radio-group').data = [
  { value: 'fast', label: 'Fast' },
  { value: 'quality', label: 'Quality' },
];
```

</template>

</ElementDemo>

## Disclosure

<ElementDemo title="Tabs, collapse, tooltip" tags="civitai-tabs civitai-collapse civitai-tooltip">

<template #html>

```html
<civitai-tabs aria-label="Result view">
  <civitai-tab-panel value="images"><civitai-card padding="md">Images panel</civitai-card></civitai-tab-panel>
  <civitai-tab-panel value="videos"><civitai-card padding="md">Videos panel</civitai-card></civitai-tab-panel>
</civitai-tabs>
<civitai-collapse heading="Advanced">
  <civitai-checkbox label="Restore faces"></civitai-checkbox>
</civitai-collapse>
<civitai-tooltip label="Spends Buzz from your balance">
  <civitai-button variant="outline">Hover or focus me</civitai-button>
</civitai-tooltip>
```

</template>

<template #js>

```js
document.querySelector('civitai-tabs').data = [
  { value: 'images', label: 'Images' },
  { value: 'videos', label: 'Videos' },
];
```

</template>

</ElementDemo>

## Overlays

`<civitai-modal>` traps focus and closes on Escape or an overlay click.
`<civitai-confirm-dialog>` resolves `await dialog.ask()` to `true` or `false`.
`<civitai-toast-region>` shows toasts from `show({ message, heading?, color?, duration? })`.

<ElementDemo title="Modal, confirm, toast" tags="civitai-modal civitai-confirm-dialog civitai-toast-region">

<template #html>

```html
<civitai-group>
  <civitai-button class="open-modal">Open modal</civitai-button>
  <civitai-button class="ask" variant="outline">Delete…</civitai-button>
  <civitai-button class="toast" variant="light">Toast</civitai-button>
</civitai-group>
<civitai-modal heading="Confirm generation">
  This will spend Buzz. Focus cannot leave the dialog.
</civitai-modal>
<civitai-confirm-dialog heading="Delete model?" message="This cannot be undone."
  confirm-label="Delete" destructive></civitai-confirm-dialog>
<civitai-toast-region></civitai-toast-region>
```

</template>

<template #js>

```js
const modal = document.querySelector('civitai-modal');
const confirm = document.querySelector('civitai-confirm-dialog');
const toasts = document.querySelector('civitai-toast-region');

document.querySelector('.open-modal').addEventListener('click', () => (modal.open = true));
document.querySelector('.ask').addEventListener('click', async () => {
  const deleted = await confirm.ask();
  toasts.show({ message: deleted ? 'Deleted.' : 'Kept.', color: deleted ? 'error' : 'info' });
});
document.querySelector('.toast').addEventListener('click', () => {
  toasts.show({ heading: 'Saved', message: 'Your changes are live.', color: 'success' });
});
```

</template>

</ElementDemo>

## Menu

Put any button in the `trigger` slot. Choosing an item fires `select` with
`detail.value`.

<ElementDemo title="Menu" tags="civitai-menu civitai-menu-item civitai-menu-label">

<template #html>

```html
<civitai-menu label="Image actions">
  <civitai-button slot="trigger" variant="outline" size="sm">Actions</civitai-button>
  <civitai-menu-item>Save to collection</civitai-menu-item>
  <civitai-menu-item>View post</civitai-menu-item>
  <civitai-menu-label>Moderator</civitai-menu-label>
  <civitai-menu-item disabled>Rescan</civitai-menu-item>
  <civitai-menu-item destructive>Delete</civitai-menu-item>
</civitai-menu>
```

</template>

</ElementDemo>

## Navigation

`<civitai-nav-list current="…">` marks the item whose `href` matches and opens
every group above it. An item with children is a collapsible group.
`<civitai-pagination>` fires `change`, then read `page`.

<ElementDemo title="Navigation" tags="civitai-breadcrumb civitai-pagination civitai-nav-list civitai-nav-item">

<template #html>

```html
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

## Media

`<civitai-image>`, `<civitai-video>` and `<civitai-audio>` share the states a
generated file goes through: `pending` while it is being made, `blocked` when it
is withheld from this viewer, and `fallback` text when it fails to load. Size
them from outside.

<ElementDemo title="Media" tags="civitai-image civitai-video civitai-audio">

<template #html>

```html
<civitai-group gap="lg" style="align-items: flex-start">
  <civitai-image openable alt="A gradient" style="width: 140px; aspect-ratio: 1"
    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Cdefs%3E%3ClinearGradient id='g' x2='1' y2='1'%3E%3Cstop stop-color='%23228be6'/%3E%3Cstop offset='1' stop-color='%23326D5C'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1' height='1' fill='url(%23g)'/%3E%3C/svg%3E"></civitai-image>
  <civitai-image pending style="width: 140px; aspect-ratio: 1"></civitai-image>
  <civitai-image blocked style="width: 140px; aspect-ratio: 1"><span slot="blocked">Hidden: mature content</span></civitai-image>
  <civitai-video src="/does-not-exist.mp4" fallback="This clip is gone" style="width: 140px; aspect-ratio: 1"></civitai-video>
</civitai-group>
<civitai-audio src="/does-not-exist.mp3" alt="A jingle" fallback="This track is gone" style="max-width: 320px"></civitai-audio>
```

</template>

</ElementDemo>

## Civitai vocabulary

In `site-elements.js` / `register-site` only: the pieces that make an app look
like civitai.com. `<civitai-tag>` fires `vote`, `<civitai-reaction>` fires
`react`, and `<civitai-media-card>` lays them out over an image in named slots
(`media`, `top-start`, `top-end`, `bottom`).

<ElementDemo title="Civitai vocabulary" tags="civitai-rating-badge civitai-avatar civitai-tag civitai-reaction civitai-action-button civitai-media-card">

<template #html>

```html
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
```

</template>

</ElementDemo>

## Acting as the viewer

Two elements do something rather than show something, through
[`@civitai/sdk`](https://www.npmjs.com/package/@civitai/sdk). They are not in
the bundles above, so the SDK stays out of apps that do not need it. Import them
by path:

```ts
import '@civitai/components/civitai-sign-in-button/define';
import '@civitai/components/civitai-workflow-button/define';
```

- **`<civitai-sign-in-button>`** signs the viewer in with Civitai.
- **`<civitai-workflow-button>`** prices a workflow template, submits it on
  click, and shows progress until it finishes. A second press cancels. It fires
  `priced`, `submitted`, `progress`, `finished`, `canceled` and `error`.

## Working on the components

The source lives in
[`civitai-app-starters/packages/civitai-components`](https://github.com/civitai/civitai-app-starters/tree/main/packages/civitai-components).
Its playground renders every element straight from source with hot reload:

```bash
pnpm --filter @civitai/components dev
```
