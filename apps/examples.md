---
title: Example apps
description: The maintained, CI-validated Civitai App examples in civitai-app-starters — what each shows, the scopes its block.manifest.json declares, the hooks it imports and how to run it — plus larger public apps to read after them.
---

# Example apps

The eleven examples in
[`civitai/civitai-app-starters`](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples)
are the maintained example set: one small, runnable app per feature area, each
with its own `block.manifest.json`, `src/` and README. They depend on the
published `@civitai/app-sdk` / `@civitai/blocks-react` releases, and that repository's CI
typechecks and builds every one, runs `civitai app validate --strict` on each,
and boots each under `dev:harness` in Chromium to check it renders. **Start
here.** Each README explains the feature and the gotchas built into it, and
says where the local mock host differs from production.

Further down, [More real-world apps](#more-real-world-apps) lists larger public
apps that are not maintained as examples. Read those once you know the basics.

Each entry below states what was read out of the example itself: the
**scopes** its `block.manifest.json` declares and the **hooks** it imports from
`@civitai/blocks-react`.

::: warning What is gated today
The examples run anywhere under `dev:harness`. On civitai.com, the example
READMEs say plainly what is closed, and each one cites the civitai source it
read:

- **The App Blocks runtime is an invite-only, closed beta.** Every spend and
  bridge call checks the per-user `app-blocks-enabled` flag
  ([generation-kinds](#generation-kinds), [generate-studio](#generate-studio)).
  During the pre-GA preview the host API is enabled per *account*, so an
  approved app can still be refused for an account that was never enrolled
  ([kv-storage](#kv-storage)).
- **Page apps are behind a moderator-only flag.** `/apps/run/<slug>` needs both
  `appBlocks` and `appBlocksPages`, and `appBlocksPages` is mod-only until a
  Flipt segment widens it ([page-app](#page-app)).
- **Shared storage is flag- and approval-gated.** Every call, reads included,
  needs the `app-blocks-shared-storage` flag (off by default, on for a limited
  cohort), the app must be approved, and the shared scopes are refused under
  `dev:live` ([shared-board](#shared-board)).
- **`kind: 'training'` is not available to apps.** The host refuses it unless
  the `app-blocks-training-kind` flag is on, and that flag is false when unset
  ([generation-kinds](#generation-kinds)).
- **Goods need an approved app.** A good and its price come from the latest
  approved manifest; before approval the purchase route answers `404`
  ([monetize](#monetize)).
- **Posting to a viewer's profile from an app is off for everyone**, moderators
  included ([generate-studio](#generate-studio)).

This list summarises the READMEs at civitai-app-starters `ed7d69c`. The READMEs
are the authority, and gates change.
:::

::: tip Eight of the eleven are slot apps
`hello-world`, `settings`, `buzz-workflow`, `kv-storage`, `scopes-api`,
`buzz-purchase`, `shared-board` and `monetize` render in the
`model.sidebar_top` slot. [Concepts](./guide/concepts) explains that slot apps
are deferred for third-party builders, so ship a **page app**:
[page-app](#page-app) shows the shape, and [generate-studio](#generate-studio)
and [generation-kinds](#generation-kinds) are page apps that generate. Read the
slot examples for the feature they show. One difference to carry over: a slot
app's per-generation budget is the `buzz_budget_per_gen` setting, while a page
app sets `page.buzzBudgetPerGen` in its manifest
([buzz-workflow](#buzz-workflow)).
:::

## Running an example

Copy one out on its own, the way you would start a real app from it:

```bash
EXAMPLE=hello-world   # any directory name below
npx tiged "civitai/civitai-app-starters/starters/examples/$EXAMPLE" my-block
cd my-block
npm install
npm run dev:harness   # each example pins its own port, listed under its entry
```

Inside a clone of the starters monorepo, run `pnpm install` at the root, then
`pnpm dev:harness` in the example's directory.

`dev:harness` runs the example against the SDK's mock host, with the manifest's
`scopes` passed as `declaredScopes`. No token and no `.env` is needed. URL knobs
such as `?theme=light` and `?viewer=anon` change what the mock host sends.

`dev:live` runs the same example against the real backend with a dev token.
[Local development](./guide/local-dev) covers minting one with
`civitai app dev-token`. The mint is invite-only before GA, and an example that
spends needs `--spend`. **It spends your own real Buzz.** Some host capabilities
are refused in live mode rather than faked; each entry below names the ones that
matter for that example.

## Pick one

| If you want to see… | Start with |
|---|---|
| the smallest complete block: lifecycle, theming, resize | [hello-world](#hello-world) |
| a full-page app: routes, breakpoints, sign-in and consent | [page-app](#page-app) |
| manifest `settings` and the `SettingsForm` component | [settings](#settings) |
| estimate → submit → poll for a generation, with Buzz billed | [buzz-workflow](#buzz-workflow) |
| a real generator page: pickers, LoRAs, img2img, history, publish | [generate-studio](#generate-studio) |
| `customComfy` recipes and chat completions through the same money flow | [generation-kinds](#generation-kinds) |
| topping up a viewer's Buzz mid-flow, and when not to | [buzz-purchase](#buzz-purchase) |
| a per-viewer key-value store (`useAppStorage`) | [kv-storage](#kv-storage) |
| a cross-viewer shared store (`useSharedStorage`) | [shared-board](#shared-board) |
| declared vs granted scopes, and calling REST with the block token | [scopes-api](#scopes-api) |
| selling digital goods, gating on entitlements, taking tips | [monetize](#monetize) |
| many generations in flight at once, with per-cell retry | [Gen Matrix](#gen-matrix) |
| a multi-turn LLM chat driven by the generation bridge | [Sensei](#sensei) |
| the App Blocks **HTTP** API with collections and tipping scopes | [Playable Collections](#playable-collections) |
| **no React at all**: Web Components on the raw transport | [Panorama 360](#panorama-360) |

## The starters examples

### hello-world

**[starters/examples/hello-world](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/hello-world)** — slot app. Read this first.

**Shows** the block lifecycle: the host's trust frame, the `ready` gate before
`BLOCK_INIT`, `useBlockResize` fitting the iframe to its content, and theming
the block itself, dark first, from the host's `theme`.

- **Scopes** — `models:read:self`
- **Hooks** — `useBlockContext`, `useBlockResize`
- **Run** — `npm run dev:harness` → `localhost:5180`

### settings

**[starters/examples/settings](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/settings)** — slot app.

**Shows** manifest-declared `settings` with `publisher` and `viewer` scope,
reading them from `useBlockContext().settings`, filling in manifest defaults the
host does not send, and the headless `SettingsForm` from
`@civitai/blocks-react/ui`.

- **Scopes** — `models:read:self`
- **Hooks** — `useBlockContext`, `useBlockResize`
- **Run** — `npm run dev:harness` → `localhost:5181`. The mock host sends empty
  settings, so you see the manifest defaults.

### buzz-workflow

**[starters/examples/buzz-workflow](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/buzz-workflow)** — slot app.

**Shows** the money path: `useBuzzWorkflow` estimate → submit → poll, one
shared body builder so the estimate prices what the submit sends, branching on
`WorkflowEstimateError.code`, caller-driven polling, and a real server-side
cancel. Copy it for any generation UI.

- **Scopes** — `models:read:self`, `ai:write:budgeted`
- **Hooks** — `useBuzzWorkflow`, `useBlockContext`, `useBlockResize`
- **Run** — `npm run dev:harness` → `localhost:5182`, with no Buzz spent.
  `dev:live` spends your own Buzz.

### kv-storage

**[starters/examples/kv-storage](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/kv-storage)** — slot app.

**Shows** `useAppStorage`, a key-value store per block instance and viewer:
get / set / delete / list / `getQuota`, the byte and row ceilings, classifying a
rejection with `classifyAppStorageError`, and the anonymous-viewer case.

- **Scopes** — `models:read:self`, `apps:storage:read`, `apps:storage:write`
- **Hooks** — `useAppStorage`, `useBlockContext`, `useBlockResize`
- **Run** — `npm run dev:harness` → `localhost:5183`. App Storage refuses under
  `dev:live`; the README explains why.

### scopes-api

**[starters/examples/scopes-api](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/scopes-api)** — slot app.

**Shows** declared versus granted scopes, and calling a scope-gated REST
endpoint (`GET /api/v1/blocks/me`) with the block token as a Bearer, sent only to
`useHostOrigin()`, with 401 → refresh → retry once.

- **Scopes** — `user:read:self`, `models:read:self`
- **Hooks** — `useBlockToken`, `useHostOrigin`, `useBlockContext`, `useBlockResize`
- **Run** — `npm run dev:harness` → `localhost:5184`. The call returns 401
  under the mock token by design; `dev:live` returns real data.

### buzz-purchase

**[starters/examples/buzz-purchase](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/buzz-purchase)** — slot app.

**Shows** `useBuzzPurchase` opening the purchase modal when the wallet is short,
then retrying with guards. It separates the two limits: buying Buzz raises the
wallet (`useBuzzBalance`), never the per-generation budget on the token.

- **Scopes** — `models:read:self`, `ai:write:budgeted`, `buzz:read:self`
- **Hooks** — `useBuzzPurchase`, `useBuzzBalance`, `useBuzzWorkflow`, `useBlockContext`, `useBlockResize`
- **Run** — `npm run dev:harness` → `localhost:5185`. The live host refuses the
  purchase modal, so test the purchase under the harness.

### shared-board

**[starters/examples/shared-board](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/shared-board)** — slot app.

**Shows** `useSharedStorage`, one app-wide store every viewer reads: append,
vote, author-only edit and withdraw, report. A private draft in `useAppStorage`
sits beside it, so the two stores' differences are on screen. Shared storage is
flag- and approval-gated (see the box above).

- **Scopes** — `user:read:self`, `apps:storage:shared:read`, `apps:storage:shared:write`, `apps:storage:read`, `apps:storage:write`
- **Hooks** — `useSharedStorage`, `useAppStorage`, `useViewer`, `useRequestSignIn`, `useRequestConsent`, `useBlockToken`, `useBlockContext`, `useBlockResize`
- **Run** — `npm run dev:harness` → `localhost:5187`. This is the only local
  way to run it: the shared scopes are refused under `dev:live`.

### page-app

**[starters/examples/page-app](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/page-app)** — **page app**.

**Shows** the shape most third-party apps ship: a manifest `page` with no
`targets`, full width from 375px to 2560px with `useBlockBreakpoint`, app-scoped
routes with `useCivitaiRoute` and `useCivitaiNavigate`, and sign-in → consent →
`useViewer`. `src/main.tsx` wraps the app in `<BlockGate>`. Page apps are
mod-only today (see the box above), and the README notes that
`useBlockAnalytics` events reach no pipeline yet.

- **Scopes** — `user:read:self`, `apps:storage:read`, `apps:storage:write`
- **Hooks** — `useBlockBreakpoint`, `useCivitaiRoute`, `useCivitaiNavigate`, `useHostOrigin`, `useRequestSignIn`, `useRequestConsent`, `useConsentUnavailable`, `useBlockToken`, `useViewer`, `useAppStorage`, `useBlockAnalytics`, `useBlockContext`
- **Run** — `npm run dev:harness` → `localhost:5186`. Under `dev:live` your
  storage writes are real.

### generate-studio

**[starters/examples/generate-studio](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/generate-studio)** — **page app**, the largest example.

**Shows** real image generation in a page app: checkpoint and LoRA pickers,
setup codes, txt2img and img2img, a debounced quote, budget versus wallet, a
queue of runs with `watch` and `cancel`, the app's own history, publishing
outputs, and showing them only as far as the viewer may see them. Its README is
a numbered tour of the files. For the multi-LoRA pattern it implements, see
[Building a LoRA stack](./guide/text-to-image#lora-stack).

- **Scopes** — `ai:write:budgeted`, `buzz:read:self`
- **Hooks** — `useCheckpointPicker`, `useResourcePicker`, `useGenerationResources`, `useImageUpload`, `useBuzzWorkflow`, `useBuzzBalance`, `useBuzzPurchase`, `useAppWorkflows`, `usePublishGenerationOutputs`, `useGatedImages`, `useDomainMaturity`, `useSaveImage`, `useRequestConsent`, `useRequestSignIn`, `useBlockContext`, `useBlockResize`
- **Run** — `npm run dev:harness` → `localhost:5188`. `dev:live` spends your own
  Buzz, and the live host refuses consent, upload, purchase, publish and save.

### generation-kinds

**[starters/examples/generation-kinds](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/generation-kinds)** — **page app**.

**Shows** the `WorkflowBody` kinds beyond `textToImage` through the same money
flow: a registered `customComfy` recipe and a multi-turn `step` /
`chat-completion` chat, both page-only, plus `useWildcardPack` and the
sign-in → consent → spend gate. It explains why `training` is left out.

- **Scopes** — `ai:write:budgeted`
- **Hooks** — `useBuzzWorkflow`, `useWildcardPack`, `useRequestSignIn`, `useRequestConsent`, `useConsentUnavailable`, `useBlockToken`, `useBlockContext`, `useBlockResize`
- **Run** — `npm run dev:harness` → `localhost:5189`. The mock host has no text
  channel, so chat replies appear only under `dev:live`, which spends your own
  Buzz.

### monetize

**[starters/examples/monetize](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/monetize)** — slot app.

**Shows** how an app earns: selling manifest-declared digital goods with
`useGoodPurchase`, gating a feature on `useEntitlements` in a safe order, and
tips with `useTip` and `TipButton`. It also says which money rails pay nothing
today. Read it with [How an app earns](./guide/earning).

- **Scopes** — `goods:read:self`, `goods:purchase:self`, `social:tip:self`
- **Hooks** — `useGoodPurchase`, `useEntitlements`, `useTip`, `useTipAllowance`, `useRequestSignIn`, `useBlockToken`, `useBlockContext`, `useBlockResize`
- **Run** — `npm run dev:harness` → `localhost:5190`. Under `dev:live` a tip moves
  your own real Buzz, and your own purchases are refused as `self_purchase`.

**Hook lists verified by hand on 2026-10-07** against civitai-app-starters
`ed7d69c`, from each example's `@civitai/blocks-react` imports. The scope lists
are checked daily (see [Keeping this list honest](#keeping-this-list-honest)).

## More real-world apps

Eight Civitai App Blocks maintained outside the starters repository, with public
source. They are whole working apps rather than examples, and each shows a part
of the platform end to end that the starters examples keep small.

::: info About these repositories
They are individually maintained working apps, not a curated, supported sample
set: seven live on the personal account `ZacxDev` and one under the `civitai`
organization. Treat them as references to read, not as an API contract. The
[reference pages](./reference/) are the contract, and the server is the
enforcement boundary.

Verified 2026-09-11: all eight are public, not forks, and not archived. Their
scopes are checked daily like the starters examples'.
**Hook lists verified by hand on 2026-09-11.** Read them as a snapshot of that
day; the repository is always the authority.
:::

### Gen Matrix

**[github.com/ZacxDev/civitai-app-gen-matrix](https://github.com/ZacxDev/civitai-app-gen-matrix)** — page app.

**Read it for** a fan-out generation grid: many priced workflows in flight
behind one cost estimate and confirm step, with retry scoped to the failed cells.

- **Scopes** — `ai:write:budgeted`, `apps:storage:read`, `apps:storage:write`, `apps:storage:shared:read`, `apps:storage:shared:write`
- **Hooks** — `useBuzzWorkflow`, `useAppWorkflows`, `usePublishGenerationOutputs`, `useBuzzPurchase`, `useResourcePicker`, `useSharedStorage`, `useAppStorage`, `useGatedImages`, `useDomainMaturity`, `useRequestConsent`, `useRequestSignIn`, `useBlockContext`, `useBlockToken`, `useBlockResize`, `useBlockAnalytics`

### Sensei

**[github.com/ZacxDev/civitai-app-sensei](https://github.com/ZacxDev/civitai-app-sensei)** — page app.

**Read it for** a multi-turn LLM assistant on the generation bridge, whose
replies drive follow-up catalog queries, with per-user conversation state.

- **Scopes** — `ai:write:budgeted`, `buzz:read:self`, `apps:storage:read`, `apps:storage:write`
- **Hooks** — `useBuzzWorkflow`, `useAppStorage`, `useResourcePicker`, `useRequestConsent`, `useRequestSignIn`, `useBlockContext`, `useBlockToken`, `useBlockResize`, `useBlockAnalytics`

### Model Benchmarking

**[github.com/ZacxDev/civitai-app-model-benchmarking](https://github.com/ZacxDev/civitai-app-model-benchmarking)** — page app.

**Read it for** a priced generation run whose outputs are published into a
shared store every viewer reads and writes: the broadest single tour of the
hook surface.

- **Scopes** — `ai:write:budgeted`, `buzz:read:self`, `apps:storage:read`, `apps:storage:write`, `apps:storage:shared:read`, `apps:storage:shared:write`
- **Hooks** — `useBuzzWorkflow`, `usePublishGenerationOutputs`, `useSharedStorage`, `useAppStorage`, `useGenerationResources`, `useResourcePicker`, `useBuzzBalance`, `useGatedImages`, `useRequestConsent`, `useRequestSignIn`, `useBlockContext`, `useBlockToken`, `useBlockResize`, `useBlockAnalytics`

### Playable Collections

**[github.com/ZacxDev/civitai-app-playable-collections](https://github.com/ZacxDev/civitai-app-playable-collections)** — page app.

**Read it for** privileged reads and writes over the App Blocks HTTP API
(`/api/v1/blocks/*`, block token as Bearer) rather than `postMessage` hooks,
behind one swappable `ApiClient` the dev harness fakes.

- **Scopes** — `collections:read:self`, `collections:read:private`, `social:tip:self`, `buzz:read:self`, `apps:storage:read`, `apps:storage:write`, `apps:storage:shared:read`, `apps:storage:shared:write`
- **Hooks** — `useSharedStorage`, `useBuzzBalance`, `useDomainMaturity`, `useHostOrigin`, `useRequestConsent`, `useRequestSignIn`, `useBlockContext`, `useBlockToken`, `useBlockResize`

### Custom Generators

**[github.com/ZacxDev/civitai-app-custom-generators](https://github.com/ZacxDev/civitai-app-custom-generators)** — page app.

**Read it for** an author → publish → discover → run lifecycle inside one
block, with a spend path that can top the viewer up mid-flow, and img2img via
`useImageUpload`.

- **Scopes** — `ai:write:budgeted`, `buzz:read:self`, `apps:storage:read`, `apps:storage:write`, `apps:storage:shared:read`, `apps:storage:shared:write`, `posts:write:self`
- **Hooks** — `useBuzzWorkflow`, `useBuzzPurchase`, `useBuzzBalance`, `useImageUpload`, `useGenerationResources`, `useResourcePicker`, `useSharedStorage`, `useAppStorage`, `useGatedImages`, `useCivitaiNavigate`, `useRequestConsent`, `useRequestSignIn`, `useBlockContext`, `useBlockToken`, `useBlockResize`, `useBlockAnalytics`

### App Requests

**[github.com/ZacxDev/civitai-app-requests](https://github.com/ZacxDev/civitai-app-requests)** — page app.

**Read it for** a cross-user post / vote / edit / withdraw board on
`useSharedStorage`, with no Buzz or generation scope at all.

- **Scopes** — `apps:storage:shared:read`, `apps:storage:shared:write`, `user:read:self`
- **Hooks** — `useSharedStorage`, `useBlockBreakpoint`, `useRequestSignIn`, `useBlockContext`, `useBlockResize`, `useBlockAnalytics`

### Generate from Model

**[github.com/ZacxDev/civitai-block-generate-from-model](https://github.com/ZacxDev/civitai-block-generate-from-model)** — **slot app**.

**Read it for** a `model.sidebar_top` slot app that takes the model from
host-injected context (`requiredContext: ["modelId", "modelVersionId"]`) and
reads publisher `settings` through `useBlockSettings`. Slot apps are deferred
for third-party builders, as above.

- **Scopes** — `models:read:self`, `ai:write:budgeted`, `buzz:read:self`
- **Hooks** — `useBlockSettings`, `useCheckpointPicker`, `useBuzzWorkflow`, `useBuzzPurchase`, `useBuzzBalance`, `useBlockContext`, `useBlockResize`

### Panorama 360

**[github.com/civitai/app-panorama-360](https://github.com/civitai/app-panorama-360)** — page app, **no React**.

**Read it for** proof that the block contract does not require React: Web
Components on the raw transport, and [Comfy on Civitai](./guide/comfy-cloud)
wired into a real app via `@civitai/comfy-run-kit`.

::: tip Starting a no-React app today? Use the published elements
Panorama 360 predates the published `<civitai-*>` elements, which is why it
defines its own. A new app does not need to: `civitai app init` now scaffolds a
React-free app on `@civitai/sdk` and the `@civitai/components` elements by
default. Read Panorama 360 for the transport and the Comfy wiring, and start from
the [Quickstart](./guide/quickstart) and
[the elements guide](./guide/elements) for the UI.
:::

- **Scopes** — `ai:write:budgeted`
- **SDK surface** — `getTransport`, `sendTypedRequest` (`@civitai/blocks-react`); `BlockWorkflowSnapshot`, `WorkflowBody`, `BuzzAccountType` (`@civitai/app-sdk/blocks`); `RunController`, `BridgeGateway`, `registerRunElements` (`@civitai/comfy-run-kit`)

## Reading one of these next to the docs

The examples are whole applications, so here is the shortest path from one back
to the contract it uses:

- a hook you do not recognise → [Hooks reference](./reference/hooks)
- a manifest field → [Manifest reference](./reference/manifest)
- a scope string → [Scopes reference](./reference/scopes)
- a `WorkflowBody` shape or the spend lifecycle → [Generation bridge](./reference/generation)
- a raw `postMessage` payload (Panorama 360) → [Message bridge](./reference/messages)

If you are not building yet, [Quickstart](./guide/quickstart) scaffolds a
working page app with the `civitai` CLI.

## Keeping this list honest

`npm run check:example-apps` (`scripts/check-example-apps.mjs`) guards this
page. Its offline half runs on every pull request: the page parses, still names
at least six repositories and at least nine starters examples, and does not
contradict itself. The counts in its prose are graded against the links on the
page, every `#anchor` above must resolve to a section that is still here, and
every example section must state a scope list in a shape the scheduled half can
grade.

The scheduled half runs on the daily `appblocks-drift` schedule, because
upstream changes are unrelated to whatever docs change is in flight. A docs page
naming eight external repositories rots in a way nobody notices: GitHub
**301-redirects a renamed repository**, so a plain link check reports a moved
repository healthy. The guard reads each repository's `full_name` back from the
API and fails on a mismatch, a 404, a 451 takedown or `archived: true`. It then
fetches the `block.manifest.json` each section links (for a starters example,
the one in that example's own directory) and compares its `scopes` array with
the list stated above, **by set, not order**. Finally it lists
`starters/examples/` and fails if an example there has no section here. A red
scheduled run opens a GitHub issue naming what rotted and closes it on the next
clean run; a run that verified *nothing* opens one too.

The **hook** lists are the one thing on this page nothing re-checks, which is
why they carry dates rather than a guarantee. The guard asserts each date stamp
is present, is a real date and is not in the future, and prints the oldest one's
age on every run.
