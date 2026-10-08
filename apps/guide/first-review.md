---
title: First review checklist
description: A self-runnable checklist to work through before `civitai app submit` — audit every state before polishing, declutter, visual hierarchy, theme, an honest money path, how to batch a submission without losing your store listing, and how to confirm the live build after approval. Distilled from the review feedback that recurred across the first apps built with an AI agent.
sources:
  - go:github.com/civitai/cli
  - npm:@civitai/theme@0.5.2
---

# First review checklist

Run this **before** `civitai app submit` — by hand, or hand the page to your
agent. Each item is one line of what to check and one line of why. It links to
the page that owns the detail rather than repeating it.

The same review feedback came back on app after app; every item below is one
of those.

## 1. Audit before polish

- **Walk every view in four states: cold-open, empty, populated, narrow
  (≈360px).** Cold-open is before your data and bundle have loaded — it is the
  first thing a reviewer and a new viewer see.
- **Check the empty state against the live backend, not the harness.** The
  mock host's synthetic replies and any demo seed data prove the populated path; they say nothing about a
  real account with nothing in it. See [Local dev loop](./local-dev).
- **Look for dead ends.** From every state, the next step should be obvious
  without reading anything.
- **Only then do a theme pass — and offer the human two or three palette
  options before applying one.** Re-theming a layout you will still restructure
  is wasted work, and the palette is a taste call, not yours.

## 2. Declutter

- **Exactly one filled/solid primary action per screen, reserved for
  send/spend.** When everything is primary, the one that costs Buzz stops
  standing out.
- **No explainer cards** ("What's an X?"). If the UI needs a manual, fix the
  UI.
- **Don't repeat your app's own title.** The host listing already names it.
- **Consolidate tabs** into one view, or a sidenav — see
  [the sidenav pattern](./responsive#sidenav-pattern).
- **Hide controls the current state doesn't need.** Show them when they
  become usable.
- **Collapse empty sections** instead of pre-rendering their frames.

## 3. Visual hierarchy

- **Layer surfaces instead of one flat background** — page on
  `--civitai-color-body`, panels on `--civitai-color-surface` /
  `--civitai-color-surface-2`, separated with `--civitai-color-border` where
  the values are close. Check both palettes in [Design tokens](../tokens).
- **Keep the palette subtle.** Let colour mark state and the primary action,
  not decorate.
- **Show media larger rather than as chips.** In an image app the image is
  the content.
- **Full-width layouts that still work at 360px.** That is the model
  sidebar's width as well as a phone's — see
  [Responsive blocks](./responsive#checklist).

## 4. Theme

- Dark is the default, light comes only from the host's theme signal
  (reflect `BLOCK_INIT`'s `theme` onto `data-theme`), and your own palette goes
  on the `--civitai-*` token layer — see
  [Light and dark themes](./theming#light-and-dark-themes).

## 5. Money path honesty

- **Show the exact Buzz price before spend:** estimate → consent → submit →
  watch — see [the `useBuzzWorkflow` lifecycle](../reference/generation#bridge-useBuzzWorkflow)
  and, for consent, [`app.requestGrants`](./sdk#consent-app-requestgrants) or
  `useRequestConsent` in the [hooks reference](../reference/hooks).
- **Render your own error copy, never raw server text.** Branch on the
  refusal's `code` / `reason` ([refusal tables](./earning#refusal-reasons-your-app-must-branch-on)).
  A refused submit's `error` string is for your logs, not the screen
  ([refused submits](./text-to-image#refused-submits)).
- **A disabled or gated action names what is missing, and recomputes live
  as fields fill.** A press that silently does nothing reads as broken.
- **One idempotency key per attempt**, reused on every retry of it — see
  [Retrying a submit safely](./text-to-image#retrying-a-submit-safely) and the
  [key's charset](../reference/generation#idempotency-key-charset).

## 6. Submitting

- **Run [`civitai app validate`](./validate) first.** It mirrors most of
  the approve-time checks in a second.
- **Batch every fix into one submission.** An app has one pending
  submission at a time, and there is no editing it — the only way to change a
  pending bundle is to withdraw and resubmit.
- **Submit the next version only after the current one clears review.**
- **Before you withdraw anything, read
  [what withdrawing does to the store listing](./review-and-deploy#changing-the-bundle-while-a-request-is-still-pending).**
  It is irreversible for a first version.

## 7. After approval

- **Open `https://<slug>.civit.ai/` in the cold-open state** — signed out
  or on a fresh profile, nothing cached — and walk it once.
- **Don't read "Not live yet" as "not serving".** Depending on your CLI
  version, `civitai app status <slug>` may describe only your **newest**
  submission. A `pending`, `withdrawn` or `rejected` newest row prints
  "Not live yet" even while an earlier approved version is serving. Newer CLIs
  name the serving submission in the detail view. Either way, confirm what is
  live by opening `<slug>.civit.ai` cold, as above. See
  [Tracking a submission](./review-and-deploy#tracking-a-submission).
- **Deployed ≠ listed in the store** — see
  [Deployed is not the same as listed](./review-and-deploy#deployed-is-not-the-same-as-listed-in-the-store).
