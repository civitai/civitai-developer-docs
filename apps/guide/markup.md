---
title: Markup that holds up
description: Four structural habits that make a block accessible, reviewable and testable — semantic collections, stable test hooks, an honest boot signal, and destructive controls that announce themselves.
---

# Markup that holds up

Your block is a real web app inside someone else's page. Four structural habits
cost almost nothing while you are writing it and are expensive to retrofit: they
decide whether assistive technology can read your app, whether an automated
check can tell a genuinely empty screen from one it simply cannot parse, and
whether a test can find a control without depending on where it happens to sit.

None of this is about styling — see the
[theming guide](./theming) for that.

## 1. Mark a collection up as a collection

If your block renders a list of things — results, cards, rows, requests — say so
in the markup:

```html
<!-- good: the structure is in the markup -->
<ul data-testid="request-list">
  <li data-testid="request-row">…</li>
  <li data-testid="request-row">…</li>
</ul>

<!-- avoid: three unrelated divs as far as anything but a human is concerned -->
<div>
  <div data-testid="request-row">…</div>
  <div data-testid="request-row">…</div>
</div>
```

`<ul>`/`<li>` (or `role="list"` / `role="listitem"` if you need different
elements) buys you two separate things.

**A screen reader announces a list.** It says how many items there are and lets
the user jump between them. With plain `<div>`s it announces three unrelated
blocks and no count — the user cannot tell where the list starts, ends, or how
much of it there is.

**An empty list becomes legible to tooling.** This is the part people miss. A
`<ul>` with no `<li>` is unambiguously *a collection with zero items*. A `<div>`
with no children is just a `<div>` — nothing can distinguish "the fetch returned
nothing", "the filter matched nothing", and "this was never a list". If you mark
the collection up, an automated review can tell you that your empty state
renders and whether it offers the user a way forward. If you do not, the only
thing left to key on is whether you happened to name a placeholder element
something recognisable, which is luck rather than structure.

::: tip
The rule of thumb: **if it repeats, it is a list.** Cards in a grid, rows in a
table, messages in a feed — all of them.
:::

## 2. Give interactive children their own `data-testid`

A `data-testid` on a container is not enough if the things people actually click
are inside it.

```html
<!-- good: each control is addressable by name -->
<div data-testid="sort-control" role="tablist" aria-label="Sort requests">
  <button role="tab" data-testid="sort-top" aria-selected="true">Top</button>
  <button role="tab" data-testid="sort-newest" aria-selected="false">Newest</button>
</div>

<!-- avoid: the only way in is "the second button" -->
<div data-testid="sort-control" role="tablist">
  <button role="tab">Top</button>
  <button role="tab">Newest</button>
</div>
```

With the second form, anything driving your app has to say
`[data-testid=sort-control] button:nth-of-type(2)`. That selector encodes the
current *order* of your buttons, so it silently starts pointing at the wrong
control the day you add a third option or reorder two — and it keeps passing,
because there is still a second button to click.

Name the controls and the selector says what it means.

While you are there, give the group an `aria-label` and the state an
`aria-selected` (or `aria-pressed`, or `aria-current`) — the same attributes
that make a tablist usable with a keyboard are what let a test assert that the
click actually *changed* something, rather than merely that it did not throw.

## 3. Pick an honest boot signal

Your block boots inside the host through the `BLOCK_INIT` handshake (see
[Concepts](./concepts)). Anything watching your app — a test, a monitor, a
person — needs one element that means **"this app is up and usable"**.

Render something that only the booted app renders, and keep it mounted in every
state. What *not* to use, in rough order of how often it gets reached for:

**Not your mount point.** `<div id="root"></div>` ships in your static HTML. It
is present before your JavaScript runs, and it is still present if your app
never boots at all — so it can only ever say "the server returned a page".

**Not a validation message.** An element whose text is *"Enter a prompt to
generate."* exists precisely while the app is unusable and disappears the moment
it becomes usable. That is exactly backwards, and it is a tempting choice
because such an element is often the only unique one on a fresh screen.

**Not an empty-state element.** `empty-state`, `no-results`, "Be the first to
suggest one" — these vanish the instant anyone creates the first item. A signal
that works only until your app succeeds is not a signal.

**Not transient loading art.** Placeholders and skeletons are present in one
render and gone in the next. If it can differ between two reads a second apart,
it cannot mean "ready".

**Not a generated id.** React's `useId()` produces values like `«r0»` /
`:r0:` that are allocated by render order, so they change when anything about
mounting changes. Never address one from outside your component.

A good boot signal is usually a piece of persistent chrome — a tab strip, a
toolbar, the primary action — that your app renders once it has its data and
keeps rendering afterwards.

## 4. Make destructive controls announce themselves

Nothing in HTML distinguishes a button that sorts a list from one that deletes a
record. A reviewer, a test, and an assistive technology user all see
`<button>`.

So make the difference explicit in the things that *are* readable:

- **Confirm anything irreversible.** Deleting, withdrawing, unpublishing — put a
  confirmation step in front of it. This is the only one of the four that
  protects the user rather than the tooling.
- **Give it an accessible name that says what it does.** `aria-label="Withdraw
  this request"` beats a bare trash icon with no name, which announces as
  "button".
- **Do not put a destructive control and a benign one behind interchangeable
  markup.** If `vote`, `edit` and `withdraw` are three identical buttons
  distinguished only by icon and position, every consumer of your UI — human
  included — is one mistake away from the wrong one.

::: warning
Assume something will eventually drive your block programmatically: your own
end-to-end tests, a screenshot pipeline, an accessibility audit. A synthetic
click on a button that posts, votes, edits or deletes performs the real action
against the signed-in account. Design so that the destructive controls are the
ones hardest to hit by accident, not the ones that look like everything else.
:::

## Checklist

- Repeating content is inside a `<ul>`/`<ol>`/`<table>` or a `role="list"`.
- Every control someone might click has its own `data-testid`.
- Grouped controls carry `aria-label` and a state attribute
  (`aria-selected` / `aria-pressed` / `aria-current`).
- One element means "booted and usable", is unique to the booted app, and is
  present in every state.
- Irreversible actions confirm, and every icon-only button has an accessible
  name.
