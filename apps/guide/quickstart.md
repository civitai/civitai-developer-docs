---
title: Quickstart
description: Scaffold a Civitai App with the civitai CLI — web components and @civitai/sdk by default, React on request — run it against the local mock host, and build it.
sources:
  - go:github.com/civitai/cli#app
  - npm:@civitai/sdk@0.11.0/dist/index.d.ts
  - npm:@civitai/components@0.9.2/custom-elements.json
  - npm:@civitai/blocks-react@0.71.0#README
  - npm:@civitai/app-sdk@0.66.0/vite#blockManifestPlugin
---

# Quickstart

Go from nothing to an app running against a local host simulator. About ten
minutes. This covers building and running locally — publishing is a separate,
closed-beta flow (see the end of this page).

The default scaffold is **web components and no UI framework**: Vite +
TypeScript, [`@civitai/sdk`](./sdk) for the host, and the
[`<civitai-*>` elements](./elements) for the UI. If you would rather write React,
[skip to the React template](#prefer-react-the-page-money-template) — it is one
flag away and fully supported.

::: warning Closed beta
You can scaffold, build, and run an app locally with the public packages below
right now. **Publishing** an app to civitai.com is limited to approved builders
during the closed beta — see [Introduction](./). Everything on this page works
without access **except running against the real civitai.com backend**, which
needs it.
:::

## Prerequisites

- Node 20.19+ (on 20.x) or 22.12+ — what the scaffold's Vite requires.
- The [`civitai` CLI](../reference/cli) installed (`npm install -g @civitai/cli`,
  or Homebrew / a prebuilt binary — see the [CLI reference](../reference/cli#install)).
- A Civitai account. Not needed for the local mock host; needed to run against
  the live backend, and for submitting.

## 1. Scaffold

```bash
civitai app init my-app
```

`civitai app create` is the same scaffolder with the same default. The name you
pass is slugified into your `blockId` — your app's permanent public id and its
`<slug>.civit.ai` hostname — and the project lands in `./<slug>`. This is what
`civitai` 0.1.114 prints:

```text
✓ Created App "My App" (page-elements)  ·  my-app/  ·  19 files
  blockId: my-app  —  your app's permanent public id (it cannot be renamed later)
  Will be served at https://my-app.civit.ai/ — only after the app is approved and deployed · `civitai app status my-app`

Next steps:
  1. cd my-app && npm install    # writes package-lock.json — COMMIT it
     (`civitai app validate` fails until you do — it needs that lockfile)
  2. npm run dev:harness     # mock host on localhost:5186 — works today
  3. edit src/block.ts and iterate (npm test drives it through the real bridge)
  4. civitai app submit      # validate + submit for review

  When you have beta access (invite-only):
     npm run dev:tunnel      # in another terminal: serve your app for the tunnel
     civitai app dev-tunnel  # your LOCAL app INSIDE the real host, prod-fidelity — no submit needed

  Prefer React? `--template page-money` scaffolds the React alternative.

  Commit the lockfile. The platform build installs strictly from it (`npm ci`) and
  will not build without it. If you install with pnpm or yarn instead, set
  "buildCommand" to that package manager (and the "outputDir" the schema requires
  alongside it) and commit THAT lockfile — a mismatch fails the build.

  Wrote AGENTS.md — your coding agent's instructions for THIS project, derived from
  what was just scaffolded. Run `civitai agent-setup` in it to also register the
  Civitai MCP servers and (for Claude Code) the CLAUDE.md that imports it.
```

That is the `page-elements` template. `--template` picks another: `page-money`
(the [React alternative](#prefer-react-the-page-money-template), with a working
generation sample), `page-vite` (React, no SDK) or `static` (no build step at
all). `--dir ./path` controls the output directory.

The project:

```
my-app/
├── block.manifest.json   # the one required file — blockId, version, scopes, page
├── index.html            # boot skeleton, painted before any script runs
├── vite.config.ts        # validates block.manifest.json on every dev boot and build
├── .env.development      # allow-lists the mock host's origin for local dev
├── src/
│   ├── main.ts           # entry: theme CSS, the dev harness, startBlock()
│   ├── block.ts          # the app: initialize → build the view → update it in place
│   ├── dev-embed.ts      # dev-server settings that let the real host embed it (dev only)
│   └── dev/harness.ts    # local mock host (dev only, dropped from builds)
├── test/                # block.test.ts drives the app through the real bridge, in happy-dom;
│                        # elements.test.ts fails if a <civitai-*> tag you use is not registered
└── AGENTS.md             # instructions for a coding agent working in this project
```

## 2. Run it locally

```bash
cd my-app
npm install
npm run dev:harness        # Vite + the mock host on http://localhost:5186
```

The **harness** is a local stand-in for civitai.com: it posts a fake
`BLOCK_INIT`, logs every message your app sends, and answers token refreshes, so
you can iterate without civitai.com embedding your app. It needs no account, no
token and no Buzz. `.env.development` already allow-lists its origin, which the
bridge requires — a `BLOCK_INIT` from an origin not on that list is dropped
silently, and the app waits on its skeleton.

The same project carries its own checks:

```bash
npm test             # the app, driven through the real bridge
npm run typecheck
```

To run your local app inside the **real** civitai.com host, serve it with
`npm run dev:tunnel` and, in a second terminal, run `civitai app dev-tunnel`,
which tunnels it and prints the URL to open. `.env.development` allow-lists
`https://civitai.com` for it. That needs closed-beta access, and no submit — see
[Local dev loop](./local-dev).

## 3. Read the app

The whole app is `src/block.ts`, and its shape is the one every app on this
template keeps:

```ts
import '@civitai/components/register';
import { initialize } from '@civitai/sdk';
import { isPageSlotContext, isSignedIn } from '@civitai/app-sdk/blocks';

const app = await initialize(); // resolves on the host's BLOCK_INIT

// Build the view ONCE. Its markup is static; host data is written in below.
const view = document.createElement('civitai-stack');
const where = document.createElement('civitai-text');
const viewer = document.createElement('civitai-badge');
view.append(where, viewer);

// Update it IN PLACE — on mount, and on every change the host pushes.
function fill(): void {
  document.documentElement.dataset.theme = app.theme;
  if (isPageSlotContext(app.context)) where.textContent = `${app.context.slug} /${app.context.subPath}`;
  viewer.textContent = isSignedIn(app.viewer) ? 'signed in' : 'anonymous';
}

fill();
document.getElementById('root')!.replaceChildren(view);
app.onChange(fill);
```

Three habits that snippet carries:

- **Build once, update in place.** `app.onChange` fires on a theme switch, a
  route change, and every token rotation — which changes nothing on screen. A
  listener that rebuilds the view wipes whatever the viewer typed, on a timer.
  [The `@civitai/sdk` client](./sdk#app-onchange-and-why-you-build-the-view-once)
  has the detail.
- **Set the theme on `<html>`.** The elements read the `--civitai-*` tokens, and
  `data-theme` on the root selects them. The host cannot reach into your iframe to
  set it.
- **Narrow the context, gate on the predicate.** `app.context` is a union keyed on
  `slotId`; `isPageSlotContext` makes the page fields readable. `viewer` is `null`
  for an anonymous viewer — test it with `isSignedIn`, not by hand.

The scaffold's own version adds what a real app needs around that: a visible
error in place of the skeleton if the app cannot start, and a retry while no host
has answered yet. Keep both. A page app does **not** call
`app.host.autoResize` — the page host fills its content area and ignores resize
messages.

`register` does not define every element — see
[which import defines which](./elements#register-the-elements). Next, add UI
from the [elements guide](./elements) and data from
[`app.site`](./sdk#app-site-the-rest-api). Spending Buzz needs a consent call and
an idempotency key — [Money calls](./sdk#money-calls) shows both.

## 4. Validate the manifest

`block.manifest.json` is the contract the platform validates. Check it against
the same rules the platform uses, any time:

```bash
civitai app validate
```

It reports the missing `package-lock.json` until you have run `npm install`.
This template also validates the manifest on every dev-server boot and every
build: `vite.config.ts` already registers `blockManifestPlugin` from
`@civitai/app-sdk/vite`, with `ajv` installed as a dev dependency. That is a
dev-loop gate, not a substitute for `civitai app validate`.

The manifest declares your `blockId` (your `<slug>.civit.ai` subdomain),
`version`, `name`, `contentRating`, a `page`, and the **scopes** your app requests
— none, as scaffolded. Add a scope before you call anything that needs one; a
call to an undeclared scope fails rather than prompting —
[Declare every scope you call](./sdk#declare-scopes) lists what each call on that
page needs. Keep Vite's `base` at the default `'/'`; the platform owns
the subdomain and serves your app at its root.

## 5. Build

```bash
npm run build     # → dist/  (a static SPA)
```

That's a shippable bundle. Everything up to here works today with the public
packages.

## Prefer React? The `page-money` template

```bash
civitai app init my-app --template page-money
```

`page-money` is Vite + React + TypeScript on
[`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react):
the host bridge as React hooks, plus a working estimate → consent → submit → poll
generation sample with tests. Everything above about manifests, validating,
building and submitting applies to it unchanged; what differs is below.

### Install

```bash
cd my-app
cp .env.example .env
npm install
```

You now have a project shaped roughly like this:

```
my-app/
├── block.manifest.json   # the one required file — slug, version, scopes
├── index.html
├── vite.config.ts        # base: '/'  (the block is served at the subdomain root)
└── src/
    ├── App.tsx           # your UI
    ├── main.tsx
    └── Harness.tsx       # local host simulator (dev only)
```

### Run it locally

```bash
npm run dev:harness        # Vite + the harness on http://localhost:5186
```

`dev:harness` runs Vite with the mock host mounted, and needs no account, no token
and no Buzz. To iterate against the **real** Civitai backend instead, mint a dev
token and run `npm run dev:live`:

```bash
civitai app dev-token my-app --spend --budget 250 --env >> .env.development.local
npm run dev:live
```

This needs closed-beta author access, but not a reviewed or even submitted app.
Spending also needs a credential with the **AI Services** scopes
(`civitai login --scopes generate`); a default login mints read-only. Both flags
matter: `--env` writes the token, and `--budget` lifts the flat **50** Buzz
per-generation budget an unsubmitted app gets, which the scaffold's own sample
exceeds — so don't use the setup notice's **Set up automatically** button for
it, which cannot pass a budget. Details, and why `dev-tunnel` is narrower for
spending: [Local dev loop](./local-dev).

::: warning Match the harness origin
The harness's parent origin (`http://localhost:5186` in `page-money`) and
`VITE_BLOCK_ALLOWED_PARENT_ORIGINS` **must match**, or `BLOCK_INIT` is dropped
and the block hangs on "Loading…". The key is set in `.env.development` (only a
comment in `.env.example`, so a `.env` copied from it won't carry the key), and
a stale copy in `.env.development.local` wins
over it. Auto-setup writes only `VITE_LIVE_BLOCK_TOKEN` and `CIVITAI_HOST_KEY`.
:::

### Read the block

Your `src/App.tsx` is a working generation app **with tests that import it** —
don't overwrite it. Every block first reads what the host delivered with
`useBlockContext()` and gates its UI on `ready` (the fields are empty until
`BLOCK_INIT` lands). Minimally:

```tsx
import { useBlockContext } from '@civitai/blocks-react';
import type { BlockContext } from '@civitai/app-sdk/blocks';

// A PAGE app's context. The host's PageBlockHost sends
// { slotId: 'app.page', entityType: 'none', slug, subPath, viewerUserId,
//   viewerUsername, theme }. The SDK also exports `PageSlotContext` and the
// runtime guard `isPageSlotContext()` — prefer the guard in real code, which
// checks the shape rather than asserting it. Narrowed inline here so the fields
// are visible in one place.
type PageContext = BlockContext & {
  slotId: 'app.page';
  slug: string;
  subPath: string;
};

export function App() {
  const { ready, context, viewer, theme } = useBlockContext();

  if (!ready) return <div data-theme={theme}>Loading…</div>;
  const page = context as PageContext;

  return (
    // Set data-theme on YOUR OWN root — the host can't reach into the iframe to
    // set it, so any [data-theme="dark"] CSS is otherwise dormant.
    <div data-theme={theme}>
      <p>Hello {viewer?.username ?? 'anon'} — running {page.slug}.</p>
    </div>
  );
}
```

::: warning Model-slot types and hooks don't apply to a page app
A page context has `slotId: 'app.page'` and **no** model fields, so casting it
to `ModelSlotContext` compiles and then reads `undefined` — use that type only
on [model slots](./text-to-image#the-happy-path). Likewise `useBlockResize` is
inert here: a page app is mounted full-viewport and the host ignores
`RESIZE_IFRAME` (it is honoured on model slots, clamped to
`iframe.minHeight`/`maxHeight`). See [Responsive blocks](./responsive).
:::

Habits this snippet establishes:

- **Gate on `ready`.** Nothing in `context` / `viewer` is trustworthy before it.
- **`viewer` can be `null`** — that's an anonymous viewer, not an error.
- **Theme yourself.** Put `data-theme={theme}` on your root; the host cannot set
  it from outside the iframe.

To generate media and bill Buzz, reach for `useBuzzWorkflow()` (estimate →
submit → poll) — see the [`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react)
README for the full pattern, including the rule that your estimate must build the
same params as your submit.

### Fail the build on an invalid manifest

Unlike the default template, `page-money` does not wire the manifest check into
the build. If you would rather fail the **build** than run `civitai app
validate`, add the SDK's Vite plugin yourself. It needs `ajv` — an *optional*
peer of `@civitai/app-sdk` that this template does not install either:

```bash
npm install -D ajv
```

```ts
// vite.config.ts
import { blockManifestPlugin } from '@civitai/app-sdk/vite';
```

Then add it to the `plugins` array the scaffold already wrote. **Append — do not
replace the array**, or you drop the plugins your app needs to build at all:

```diff
-  plugins: [react(), civitaiSetupPlugin()],
+  plugins: [react(), civitaiSetupPlugin(), blockManifestPlugin()],
```

It fails the build with a plain `Error` whose message leads with the offending
field — `block.manifest.json is invalid [scopes]: …` (Vite prints only the
message). Outside Vite, use `defineBlock` from `@civitai/app-sdk/manifest`, a
**Node-only** subpath.

## Submitting (closed beta)

When you're ready to go live, the lifecycle is **validate → submit → review**.
The `civitai` CLI packages your **source** tree and submits it — the platform
rebuilds and deploys it, so there is no client-side `deploy` step:

```bash
civitai app validate   # local pre-check of block.manifest.json
civitai app submit     # package the source + submit for review
civitai app status     # track review / deploy state
```

`civitai app submit` enters your app into **moderator review** — it is not
published immediately. On approval the platform provisions the OAuth client, git
repo, build, deploy, and `<slug>.civit.ai` DNS for you, and serves it at
`https://<slug>.civit.ai/`. Submitting also creates your **store listing** as a
draft, so you can fill in its icon and cover **while you wait for review** (see
[Store-listing media](#store-listing-media) below).

::: tip The platform builds from your committed lockfile
`civitai app submit` packages your **source** tree and the platform reinstalls
dependencies strictly from your committed lockfile (`package-lock.json` for
npm/Vite, `pnpm-lock.yaml` for pnpm, `yarn.lock` for yarn — derived from your
`buildCommand`). A missing or out-of-date lockfile is a guaranteed build
failure, so commit it (and re-run your install after changing dependencies).
`civitai app validate` flags this before you submit.
:::

That flow is gated to approved builders during the closed beta. To request access,
**reach out to the Civitai team** (see [Introduction](./)). See the
[CLI reference](../reference/cli) for every command and flag.

## Store-listing media

Your **store listing** is created as a draft when you run `civitai app submit`,
so you can set its media **while your app is in review**. It needs an **icon**
and a **cover** before it can go live; screenshots (up to 8) are optional. Run
these from your app directory (or pass `--slug`):

```bash
civitai app listing status                       # what's attached + what's missing vs the publish floor
civitai app listing set-icon ./assets/icon.png   # square-ish icon (required)
civitai app listing set-cover ./assets/cover.png # landscape hero image (required)
civitai app listing add-screenshot ./shot.png --caption "Grid view"   # optional, up to 8
civitai app listing rm-screenshot alsc_01H...    # remove one by its id (from `status`)
civitai app listing reorder alsc_02 alsc_01 alsc_03   # pass ALL screenshot ids in the new order
```

Image requirements, what changes once the listing is live, and release gating
are in [Your store listing](./store-listing).

## Next

- [The `@civitai/sdk` client](./sdk) — `initialize`, `onChange`, the host's UI,
  the REST API, consent and money calls.
- [Using the `<civitai-*>` elements in a block](./elements) — which import
  defines which elements, theming them, and `<civitai-chat>`.
- [Local dev loop](./local-dev) — the harness modes, which credential can spend,
  and running against the real backend before you submit.
- [Concepts](./concepts) — the block / install / slot / trust-frame / bridge model.
- [`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react) —
  every React hook with a snippet, if you took the React template.
