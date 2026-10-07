---
title: Building with the civitai-* elements
description: The <civitai-*> custom elements from @civitai/components — the three ways to register them (register / register-site, per-element define, the CDN bundle), which elements each one covers, theming through data-theme, reading values and events, the two elements that need @civitai/sdk, and <civitai-chat> from @civitai/components-chat.
sources:
  - npm:@civitai/components@0.9.2/custom-elements.json
  - npm:@civitai/components@0.9.2#README
  - npm:@civitai/components@0.9.2/dist/elements/register.js
  - npm:@civitai/components@0.9.2/dist/elements/register-site.js
  - npm:@civitai/theme@0.5.2
  - npm:@civitai/components-chat@0.2.0#README
---

# Building with the `<civitai-*>` elements

`@civitai/components` ships Civitai's UI as **custom elements** —
`<civitai-button>`, `<civitai-text-input>`, `<civitai-modal>` and the rest. Each
one renders in its own shadow root, carries its behaviour and ARIA wiring with it,
and reads the `--civitai-*` design tokens from `@civitai/theme`. They need no UI
framework, which is why the default `civitai app init` template uses them with
[`@civitai/sdk`](./sdk) and nothing else.

```html
<civitai-stack gap="sm">
  <civitai-text as="h2" size="md" weight="bold">Generate an image</civitai-text>
  <civitai-text-input label="Prompt" name="prompt"></civitai-text-input>
  <civitai-button variant="filled">Generate</civitai-button>
</civitai-stack>
```

The same package also ships an attribute-driven **stylesheet** for hand-written
markup (`data-civitai-ui="…"`). That is a different half with a different
component set; [Theming & the design system](./theming) explains when to use
which, and the [component showcase](../showcase) renders it.

## Register the elements

A `<civitai-*>` tag does nothing until its element is defined. **An undefined tag
is not an error**: the browser renders it as an unknown inline element — no
styles, no behaviour, nothing in the console. So the first thing to check when an
element "renders as plain text" is whether it was registered.

There are three ways to do it.

**1. Everything, from a bundler** — one side-effect import:

```ts
import '@civitai/components/register';
```

**2. Only what you use** — one `define` import per element. A smaller bundle,
and the trap above applies to every tag you forget:

```ts
import '@civitai/components/civitai-button/define';
import '@civitai/components/civitai-text-input/define';
```

`<civitai-tab-panel>` has no `define` of its own; `civitai-tabs/define`
registers it.

**3. No build step** — the self-registering bundle, from a CDN:

```html
<script type="module"
  src="https://cdn.jsdelivr.net/npm/@civitai/components@0.9.2/elements.js"></script>
```

### What `register` does not cover

"Everything" is narrower than it sounds. `@civitai/components@0.9.2` declares
**47** elements in its `custom-elements.json`, and they fall into three groups:

| Group | Elements | Registered by |
|---|---|---|
| the generic kit | 40 elements — buttons, fields, layout, feedback, overlays, navigation, media | `@civitai/components/register`, or `elements.js` |
| the civitai vocabulary | `<civitai-avatar>`, `<civitai-media-card>`, `<civitai-reaction>`, `<civitai-rating-badge>`, `<civitai-tag>` | `@civitai/components/register-site`, or `site-elements.js` — each of which **also** registers the whole generic kit |
| elements that act as the viewer | `<civitai-sign-in-button>`, `<civitai-workflow-button>` | **only** their own `…/define` import — no bundle includes them |

`register-site` already imports `register`, so one import is enough. Of the
prebuilt files, load `elements.js` **or** `site-elements.js`, not both: each
carries its own copy of Lit, and `site-elements.js` is the superset. The two viewer elements are left out
of every bundle on purpose, because they import `@civitai/sdk` — an optional peer
of `@civitai/components` — and a page that only wants the look should not bundle
it.

::: warning Import the entry points, not the bundle files, in a bundler
The package's `sideEffects` allow-list names `register`, `register-site` and the
per-element `define` modules. It does **not** name the prebundled
`elements.js` / `site-elements.js` files, so a bundler is free to drop a bare
`import '@civitai/components/elements.js'` as unused — with no warning, and every
tag left undefined. Use `elements.js` from a `<script>` tag; use `register` from
code.
:::

## Theme them

The elements read the `--civitai-*` tokens, which inherit into their shadow
roots. Load the tokens once and drive the theme with a single attribute on
`<html>`:

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
viewer's OS preference. [Light and dark themes](./theming#light-and-dark-themes)
has the full rules.

## Attributes, properties and events

State goes **in** as attributes (or the matching properties), and intent comes
**out** as events. The elements dispatch ordinary DOM events, so you listen with
`addEventListener` — no framework binding required:

```ts
import '@civitai/components/register';

const prompt = document.querySelector<HTMLElement & { value: string }>('civitai-text-input')!;
const generate = document.querySelector<HTMLElement>('civitai-button')!;

prompt.addEventListener('input', () => {
  generate.toggleAttribute('disabled', prompt.value.trim() === '');
});
generate.addEventListener('click', () => {
  generate.setAttribute('loading', '');
  // …run the work, then generate.removeAttribute('loading') in a finally
});
```

Wire listeners **once**, when you build the view. A block re-renders on every
[`app.onChange`](./sdk#app-onchange-and-why-you-build-the-view-once) — including
token rotations — and should only update text and attributes there.

A few rules that save a debugging session:

- **Host data goes in with `textContent`.** Never interpolate a model name or a
  username into `innerHTML`: it is user-authored text.
- **To hide an element, use an inline `style.display = 'none'`.** Most elements
  honour the `hidden` attribute, but not all: the light-DOM layout elements
  (`<civitai-tabs>`, `<civitai-table>`, `<civitai-tooltip>` and others) and some
  attribute states (`<civitai-button full-width>`, `<civitai-text as="span">`)
  carry a `display` rule of their own that wins over `[hidden]`.
- **Some elements take their options as a property, not markup.** The
  list-driven ones (`<civitai-select>`, `<civitai-tabs>`,
  `<civitai-radio-group>`, `<civitai-segmented-control>`, `<civitai-breadcrumb>`)
  render from a `data` property you set from script.

### Where the full contract lives

Every tag, attribute, property, event, slot and CSS part is declared in the
`custom-elements.json` that ships inside the package — the
[custom elements manifest](https://github.com/webcomponents/custom-elements-manifest)
format your editor and tooling already understand:

```bash
node -e "const m=require('@civitai/components/custom-elements.json');for(const d of m.modules.flatMap(x=>x.declarations??[]))if(d.customElement)console.log(d.tagName,(d.events??[]).map(e=>e.name).join(' '))"
```

One gap to know about: the form-field elements (`<civitai-text-input>`,
`<civitai-select>` and the other inputs) inherit `name`, `value`, `label`,
`description`, `error`, `required`, `disabled` and `size` from a shared base class
that the manifest does not describe, so those eight are missing from each field's
entry. They are declared on the base class in the package's
`dist/elements/field-base.d.ts`.

## The two elements that act as the viewer

`<civitai-sign-in-button>` and `<civitai-workflow-button>` **do** something on the
viewer's behalf, through `@civitai/sdk`, so they are registered separately and
need that package installed:

```ts
import '@civitai/components/civitai-sign-in-button/define';
```

```html
<civitai-sign-in-button return-url="/gallery">Sign in to continue</civitai-sign-in-button>
```

Inside a civitai.com page the sign-in button asks the host to sign the viewer in,
and hides itself once they are.

::: danger `<civitai-workflow-button>` is not a block money path
It prices, submits and follows a workflow through `app.orchestration` — the
orchestrator called directly. That path carries none of the controls a block's
spend goes through (the per-call Buzz budget, the daily caps, the app attribution
tag), and on a block's default token the orchestrator refuses it. In a
block, spend through `/api/v1/blocks/workflows/*` as shown in
[Money calls](./sdk#money-calls).
:::

## `<civitai-chat>`

`@civitai/components-chat` is a Civitai assistant as one element: the viewer asks
in plain words and it searches models, generates images, video and music on their
Buzz, and keeps the conversation in their Civitai account. It is its own package
because it carries an AI agent and an MCP client that a page with a few buttons
should not have to install.

```ts
import '@civitai/theme/styles.css';
import '@civitai/components-chat/civitai-chat/define';
```

```html
<civitai-chat scope="moodboard" style="height: 600px"></civitai-chat>
```

Give it a height, as for any panel. It reads the same tokens and follows
`data-theme` on the page. `civitai-chat/define` registers only what an empty chat
shows; the agent and its tools load once the chat has a signed-in client.

The chat starts when you set its `app` property to an `@civitai/sdk` client that
holds `ai:write:budgeted`:

```ts
// @ts-skip-snippet: @civitai/components-chat is not a devDependency of this repo; checked against its 0.2.0 declarations by hand
import { initialize } from '@civitai/sdk';
import type { CivitaiChat } from '@civitai/components-chat/civitai-chat';
import '@civitai/components-chat/civitai-chat/define';

const app = await initialize();
const chat = document.querySelector<CivitaiChat>('civitai-chat')!;
chat.app = app;
```

| Property | What it does |
|---|---|
| `app` | the signed-in `@civitai/sdk` client; setting it starts the chat |
| `signIn` | called on the viewer's first send when there is no `app` yet; resolves one |
| `tools` | your page's own tools, by name: `description`, a JSON Schema `inputSchema`, `execute` |
| `instructions` | a string, or a function read before every reply, describing the page |
| `scope` | set before `app`; keeps this page's chats apart from every other page's |

::: warning Check the credential before you ship it in a block
The chat calls the orchestrator and Civitai's MCP servers **directly**, with the
token `app.getToken()` returns — not through the `/api/v1/blocks/*` routes. The
orchestrator accepts no block token on any route, so on a block's default
credential its generations are refused, and with an OAuth token they bypass the
block spend controls described above. Read
[Transport models](./concepts#transport-models) before putting it in a block; it
is a natural fit for an app of your own that signs the viewer in with
`createSignIn()`.
:::

The package README covers the rest: page tools with custom rendering, panels,
voice input, `configureChat()` and where conversations are stored.

## Next

- [The `@civitai/sdk` client](./sdk) — the other half of the default template.
- [Quickstart](./quickstart) — scaffold an app built on both.
- [Theming & the design system](./theming) — tokens, the stylesheet half, and
  the React bindings (`@civitai/components-react`) over these same elements.
- [Component showcase](../showcase) — the stylesheet half, live.
