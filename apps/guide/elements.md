---
title: Using the civitai-* elements in a block
description: Using the <civitai-*> custom elements in a block — which import defines which elements, the SDK-backed elements, theming from the host, <civitai-chat>, and why <civitai-reaction> and <civitai-tag> record nothing.
sources:
  - npm:@civitai/components@0.10.1/custom-elements.json
  - npm:@civitai/components@0.10.1/dist/elements/civitai-reaction.js
  - npm:@civitai/components@0.10.1/dist/elements/civitai-tag.js
  - npm:@civitai/components@0.10.1/dist/elements/register.js
  - npm:@civitai/components@0.10.1/dist/elements/register-site.js
  - npm:@civitai/theme@0.5.2
  - npm:@civitai/components-chat#README
---

# Using the `<civitai-*>` elements in a block

`@civitai/components` ships Civitai's UI as **custom elements** —
`<civitai-button>`, `<civitai-text-input>`, `<civitai-modal>` and the rest. They
need no UI framework, which is why the default `civitai app init` template uses
them with [`@civitai/sdk`](./sdk) and nothing else.

This page covers only what is specific to a block: which import defines which
elements, theming from the host, the elements whose credentials a block
cannot supply, and the reaction and tag elements that look wired but are not. Every element — live, with its attributes, events and copy-paste
markup — is in the [component showcase](../showcase).

## Register the elements

A `<civitai-*>` tag does nothing until its element is defined, and **an undefined
tag is not an error**: the browser renders it as an unknown inline element — no
styles, no behaviour, nothing in the console. When an element "renders as plain
text", check this first.

`@civitai/components@0.10.1` declares **47** elements in its
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
with `app.workflows`, as shown in [Money calls](./sdk#money-calls).

`<civitai-chat>`, from the separate `@civitai/components-chat` package, is a
Civitai assistant in one element. It has the same limit, for the same reason: it
calls the orchestrator and Civitai's MCP servers **directly** with the token
`app.getToken()` returns, not through the `/api/v1/blocks/*` routes. **Inside a
block, on the default token, its generations are refused.** It fits an app of
your own that signs the viewer in with `createSignIn()`; read
[Transport models](./concepts#transport-models) before putting it in a block. Its
README covers setup.

## `<civitai-reaction>` records nothing

`<civitai-reaction>` looks like the reaction button on civitai.com. It does not
work like one. It is **presentational only**: it calls no route, sends no bridge
message, and needs no scope.

- **Properties:** `emoji`, `count`, `reacted` (the pressed state), `label` (the
  accessible name, e.g. `Like`) and `disabled`. You set all of them. The element
  cannot read an entity's counts or whether this viewer has already reacted.
- **On click** it toggles itself optimistically: it flips `reacted`, moves
  `count` by one (never below 0), then dispatches a `react` `CustomEvent` with
  `detail: { emoji, reacted, count }`. The event bubbles and is `composed`, so
  it crosses shadow roots. In React, `@civitai/components-react`'s
  `<CivitaiReaction>` exposes it as `onReact`.
- **Saving the change is your job.** If your write fails, set `reacted` and
  `count` back yourself. The element does not do it for you.

```ts
import '@civitai/components/civitai-reaction/define';
import type { ReactionDetail } from '@civitai/components/civitai-reaction';

// Your own write, e.g. to app storage. It is not a Civitai reaction.
declare function saveMark(emoji: string, marked: boolean): Promise<void>;

const button = document.querySelector('civitai-reaction');
if (button) {
  button.addEventListener('react', (event) => {
    const { emoji, reacted } = (event as CustomEvent<ReactionDetail>).detail;
    saveMark(emoji, reacted).catch(() => {
      // The element has already flipped itself. Put it back.
      button.reacted = !reacted;
      button.count = Math.max(0, button.count + (reacted ? -1 : 1));
    });
  });
}
```

### Real Civitai reactions go through `useReactions`

To set a real reaction, wire the element to the
[`useReactions`](../reference/hooks/viewer-and-navigation#hook-useReactions)
hook. It reads and sets the viewer's reactions on **images** over the bridge,
and needs the consent-gated `social:react:self` scope (in the
[Scopes reference](../reference/scopes)). A reaction made this way **is** a
Civitai reaction: it pays, ranks and notifies exactly as the site's own button
does. Its limits are in the hook reference: images only, no `Dislike`, and a
per-image `reactTicket` that only the REST image routes supply.

The hook's example reads `event.detail.reaction`. `ReactionDetail` carries that
field from `@civitai/components` 0.13.0 on; on an older version it is
`undefined`, so the element flips itself and nothing is written. Use 0.13.0 or
later.

Other entity types (posts, models, articles) have no reaction support. The
other social actions an app can take are tips (the `social:tip:self` scope) and
collection follows. A follow needs no scope: `<FollowButton>` from
`@civitai/blocks-react/ui`, or the
[`useCollectionFollow`](../reference/hooks/viewer-and-navigation#hook-useCollectionFollow)
hook beneath it, asks the host to follow, and the host confirms each follow with
the viewer.

If you only want a reaction-style button that stays inside your app, you can
keep app-local "marks" in your app's own [storage](./storage), as the example
above does. They are **not** Civitai reactions. They never reach civitai.com,
their counts do not match the counts on the site, and the creator never sees
them. Your app's copy must not call them Civitai reactions, and must not suggest
the creator is notified.

## `<civitai-tag>` votes go nowhere either

`<civitai-tag>` draws the up/down vote arrows from civitai.com's tag pills. Like
`<civitai-reaction>`, it is **presentational only**: it calls no route, sends no
bridge message, and needs no scope.

- **Properties:** `name`, `vote` (`1` up, `-1` down, `0` none), `score`,
  `show-score`, `confidence`, `rating` and `readonly` (which removes the
  arrows). You set all of them. The element cannot read a tag's real score or
  how this viewer voted.
- **On click** it sets `vote` (pressing the side already chosen clears it to
  `0`), then dispatches a `vote` `CustomEvent` with `detail: { name, vote }`.
  It does **not** change `score`. The event bubbles and is `composed`. In
  React, `@civitai/components-react`'s `<CivitaiTag>` exposes it as `onVote`.
- **Saving the vote, and moving `score`, is your job.** If your write fails,
  set `vote` back yourself.

```ts
import '@civitai/components/civitai-tag/define';
import type { TagVoteDetail } from '@civitai/components/civitai-tag';

// Your own write, e.g. to app storage. It is not a vote on a Civitai tag.
declare function saveTagVote(name: string, vote: -1 | 0 | 1): Promise<void>;

const tag = document.querySelector('civitai-tag');
if (tag) {
  let previous = tag.vote;
  tag.addEventListener('vote', (event) => {
    const { name, vote } = (event as CustomEvent<TagVoteDetail>).detail;
    const before = previous;
    previous = vote;
    saveTagVote(name, vote).catch(() => {
      // The element has already changed its vote. Put it back.
      tag.vote = before;
      previous = before;
    });
  });
}
```

Apps **cannot vote on Civitai tags**. civitai.com records tag votes through
its own signed-in session, and no block scope, hook, bridge message or
`/api/v1/blocks` route exposes that to an app. A vote your app stores is an
app-local mark, the same as the reaction marks above: it never reaches
civitai.com and does not change the tag's score there.

## Next

- [The `@civitai/sdk` client](./sdk) — the other half of the default template.
- [Quickstart](./quickstart) — scaffold an app built on both.
- [Theming & the design system](./theming) — tokens, the stylesheet half, and
  the React bindings (`@civitai/components-react`) over these same elements.
