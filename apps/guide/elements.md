---
title: Using the civitai-* elements in a block
description: What a block needs to use the <civitai-*> custom elements from @civitai/components — which register import or CDN bundle defines which elements (40 / 45 / 47), the two SDK-backed elements, theming from the host, and why <civitai-chat> does not run on a block's default token.
sources:
  - npm:@civitai/components@0.9.2/custom-elements.json
  - npm:@civitai/components@0.9.2/dist/elements/register.js
  - npm:@civitai/components@0.9.2/dist/elements/register-site.js
  - npm:@civitai/theme@0.5.2
  - npm:@civitai/components-chat@0.2.0#README
---

# Using the `<civitai-*>` elements in a block

`@civitai/components` ships Civitai's UI as **custom elements** —
`<civitai-button>`, `<civitai-text-input>`, `<civitai-modal>` and the rest. They
need no UI framework, which is why the default `civitai app init` template uses
them with [`@civitai/sdk`](./sdk) and nothing else.

This page covers only what is specific to a block: which import defines which
elements, theming from the host, and the elements whose credentials a block
cannot supply. Every element — live, with its attributes, events and copy-paste
markup — is in the [elements gallery](../elements).

## Register the elements

A `<civitai-*>` tag does nothing until its element is defined, and **an undefined
tag is not an error**: the browser renders it as an unknown inline element — no
styles, no behaviour, nothing in the console. When an element "renders as plain
text", check this first.

`@civitai/components@0.9.2` declares **47** elements in its
`custom-elements.json`. No single import defines all of them:

| Import (bundler) | CDN bundle (no build step) | Defines |
|---|---|---|
| `import '@civitai/components/register'` | `elements.js` | the generic kit: **40** elements |
| `import '@civitai/components/register-site'` | `site-elements.js` | the generic kit plus the civitai vocabulary — `<civitai-avatar>`, `<civitai-media-card>`, `<civitai-reaction>`, `<civitai-rating-badge>`, `<civitai-tag>`: **45** |
| `import '@civitai/components/civitai-sign-in-button/define'`, `…/civitai-workflow-button/define` | none | the two elements that act as the viewer; **no bundle includes them** |

`register-site` already imports `register`, so one of the two is enough. Of the
CDN files, load `elements.js` **or** `site-elements.js`, not both: each carries
its own copy of Lit. The two viewer elements are left out of every bundle because
they import `@civitai/sdk` (an optional peer of `@civitai/components`).

To ship less, replace the bundle with one `…/<tag>/define` import per element you
use — and the undefined-tag trap above then applies to every one you forget.
`<civitai-tab-panel>` has no `define` of its own; `civitai-tabs/define` registers
it.

```ts
import '@civitai/components/civitai-button/define';
import '@civitai/components/civitai-text-input/define';
```

::: warning In a bundler, import the entry points, not the bundle files
The package's `sideEffects` allow-list names `register`, `register-site` and the
per-element `define` modules. It does **not** name `elements.js` /
`site-elements.js`, so a bundler may drop a bare
`import '@civitai/components/elements.js'` as unused — with no warning, and every
tag left undefined. Use the bundle files from a `<script>` tag; use `register`
from code.
:::

## Theme them from the host

The elements read the `--civitai-*` tokens, which inherit into their shadow
roots. Load the tokens once and drive the theme with one attribute on `<html>`:

```ts
import '@civitai/theme/styles.css';
import { initialize } from '@civitai/sdk';

const app = await initialize();
const syncTheme = () => (document.documentElement.dataset.theme = app.theme);
syncTheme();
app.onChange(syncTheme);
```

The tokens default to **dark** and switch to light under `[data-theme='light']`.
Inside a block the theme is the host's: take it from `app.theme`, never from the
viewer's OS preference, and keep it in sync from
[`app.onChange`](./sdk#app-onchange-and-why-you-build-the-view-once).
[Light and dark themes](./theming#light-and-dark-themes) has the full rules.

## Elements a block's token cannot drive

`<civitai-workflow-button>` prices, submits and follows a workflow through
`app.orchestration` — the orchestrator, called directly. On a block's default
token the orchestrator refuses it, and that path carries none of the controls a
block's spend goes through. In a block, spend through `/api/v1/blocks/workflows/*`
as shown in [Money calls](./sdk#money-calls).

`<civitai-chat>`, from the separate `@civitai/components-chat` package, is a
Civitai assistant in one element. It has the same limit, for the same reason: it
calls the orchestrator and Civitai's MCP servers **directly** with the token
`app.getToken()` returns, not through the `/api/v1/blocks/*` routes. **Inside a
block, on the default token, its generations are refused.** It fits an app of
your own that signs the viewer in with `createSignIn()`; read
[Transport models](./concepts#transport-models) before putting it in a block. Its
README covers setup.

## Next

- [The `@civitai/sdk` client](./sdk) — the other half of the default template.
- [Quickstart](./quickstart) — scaffold an app built on both.
- [Theming & the design system](./theming) — tokens, the stylesheet half, and
  the React bindings (`@civitai/components-react`) over these same elements.
