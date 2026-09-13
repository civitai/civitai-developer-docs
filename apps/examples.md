---
title: Example apps
description: Public App Block source repositories — what each one demonstrates, which scopes its manifest declares, and which @civitai/blocks-react hooks it actually imports.
---

# Example apps

Eight Civitai App Blocks whose **source is public**. They are the fastest way to
answer "how is this actually wired?" for a part of the platform the
[reference](./reference/) describes but does not exercise end to end — a shared
cross-user data store, a Buzz spend behind a cost gate, a slot-embedded widget,
a block with no React in it at all.

Each entry below states three things that were read out of the repository
itself, not inferred: the **scopes** its `block.manifest.json` declares, the
**hooks** it imports from `@civitai/blocks-react`, and one sentence on what you
will learn from it.

::: info About these repositories
They are individually maintained working apps, not a curated, supported sample
set: seven live on the personal account `ZacxDev` and one under the `civitai`
organization. Treat them as references to read, not as an API contract — the
[reference pages](./reference/) are the contract, and the server is the
enforcement boundary.

Verified 2026-09-11: all eight are public, not forks, and not archived.

**The two lists under each example are not equally fresh, and the difference is
worth knowing before you rely on one.** The **scopes** are a checked claim: a
scheduled job reads each repository's `block.manifest.json` and fails if its
`scopes` array and the list below disagree, so a scope added upstream shows up
here as a red build rather than as a page that quietly went wrong. The **hooks**
are not — verifying what eight repositories import means parsing their source,
which is more machinery than this page is worth — so they are dated instead.
**Hook lists verified by hand on 2026-09-11.** Read them as a snapshot of that
day; the repository is always the authority.
:::

::: warning These links go to source
A published app is opened from **inside** civitai.com, under the
`/apps/run/<slug>` route described in
[Running embedded & direct traffic](./guide/embedding) — not from this page.
Whether any given example is currently installed and reachable there is a
property of the platform, not of this list, so this page links only the thing it
can point at durably: the code.
:::

## Pick one

| If you want to see… | Start with |
|---|---|
| the smallest complete block — no Buzz, no generation, no pickers | [App Requests](#app-requests) |
| a shared, cross-user data store (`useSharedStorage`) | [App Requests](#app-requests), [Model Benchmarking](#model-benchmarking) |
| spending Buzz behind an explicit cost estimate and a confirm step | [Gen Matrix](#gen-matrix), [Custom Generators](#custom-generators) |
| many generations in flight at once, with per-cell retry | [Gen Matrix](#gen-matrix) |
| a **slot** app reading host-injected model context | [Generate from Model](#generate-from-model) |
| publisher-configurable settings (`useBlockSettings`) | [Generate from Model](#generate-from-model) |
| img2img — uploading a source image from a block | [Custom Generators](#custom-generators) |
| a multi-turn LLM chat driven by the generation bridge | [Sensei](#sensei) |
| the App Blocks **HTTP** API (block-token Bearer) rather than `postMessage` hooks | [Playable Collections](#playable-collections) |
| collections and tipping scopes in practice | [Playable Collections](#playable-collections) |
| **no React at all** — Web Components on the raw transport | [Panorama 360](#panorama-360) |
| Comfy-on-Civitai (`customComfy`) wired into a real app | [Panorama 360](#panorama-360) |

## The examples

### Gen Matrix

**[github.com/ZacxDev/civitai-app-gen-matrix](https://github.com/ZacxDev/civitai-app-gen-matrix)** — page app, ~44 TS/TSX files.

**Read it for** a fan-out generation grid: many priced workflows in flight at
once behind a single cost estimate and confirm step, with retry scoped to the
cells that failed rather than the whole batch, plus a cross-user gallery of
published outputs.

- **Scopes** — `ai:write:budgeted`, `apps:storage:read`, `apps:storage:write`, `apps:storage:shared:read`, `apps:storage:shared:write`
- **Hooks** — `useBuzzWorkflow`, `useAppWorkflows`, `usePublishGenerationOutputs`, `useBuzzPurchase`, `useResourcePicker`, `useSharedStorage`, `useAppStorage`, `useGatedImages`, `useDomainMaturity`, `useRequestConsent`, `useRequestSignIn`, `useBlockContext`, `useBlockToken`, `useBlockResize`, `useBlockAnalytics`

### Sensei

**[github.com/ZacxDev/civitai-app-sensei](https://github.com/ZacxDev/civitai-app-sensei)** — page app, ~91 TS/TSX files — **the most
code of any example here**, though Playable Collections has more files.

**Read it for** a multi-turn LLM assistant built on the same generation bridge
as image work — the model's own replies drive follow-up catalog queries — with
per-user conversation state in `useAppStorage` and a resource picker for
attaching a specific model to a question.

- **Scopes** — `ai:write:budgeted`, `buzz:read:self`, `apps:storage:read`, `apps:storage:write`
- **Hooks** — `useBuzzWorkflow`, `useAppStorage`, `useResourcePicker`, `useRequestConsent`, `useRequestSignIn`, `useBlockContext`, `useBlockToken`, `useBlockResize`, `useBlockAnalytics`

### Model Benchmarking

**[github.com/ZacxDev/civitai-app-model-benchmarking](https://github.com/ZacxDev/civitai-app-model-benchmarking)** — page app, ~83 TS/TSX files.

**Read it for** the combination the other examples split up: a priced
generation run (`useBuzzWorkflow`) whose outputs are published
(`usePublishGenerationOutputs`) into a shared store every viewer reads and
writes (`useSharedStorage`). Its own README bills it as the reference example,
and it is the broadest single tour of the hook surface.

- **Scopes** — `ai:write:budgeted`, `buzz:read:self`, `apps:storage:read`, `apps:storage:write`, `apps:storage:shared:read`, `apps:storage:shared:write`
- **Hooks** — `useBuzzWorkflow`, `usePublishGenerationOutputs`, `useSharedStorage`, `useAppStorage`, `useGenerationResources`, `useResourcePicker`, `useBuzzBalance`, `useGatedImages`, `useRequestConsent`, `useRequestSignIn`, `useBlockContext`, `useBlockToken`, `useBlockResize`, `useBlockAnalytics`

### Playable Collections

**[github.com/ZacxDev/civitai-app-playable-collections](https://github.com/ZacxDev/civitai-app-playable-collections)** — page app, ~99 TS/TSX files.

**Read it for** the one example whose privileged reads and writes do **not** go
through `postMessage` hooks: it declares `collections:read:private` and
`social:tip:self`, then calls the App Blocks HTTP API (`/api/v1/blocks/*`) with
its block token as a Bearer, behind a single swappable `ApiClient` interface
that the dev harness replaces with an in-memory fake. `src/lib/api.ts` is worth
reading on its own for how it maps HTTP status to UI-actionable error kinds.

- **Scopes** — `collections:read:self`, `collections:read:private`, `social:tip:self`, `buzz:read:self`, `apps:storage:read`, `apps:storage:write`, `apps:storage:shared:read`, `apps:storage:shared:write`
- **Hooks** — `useSharedStorage`, `useBuzzBalance`, `useDomainMaturity`, `useHostOrigin`, `useRequestConsent`, `useRequestSignIn`, `useBlockContext`, `useBlockToken`, `useBlockResize`

### Custom Generators

**[github.com/ZacxDev/civitai-app-custom-generators](https://github.com/ZacxDev/civitai-app-custom-generators)** — page app, ~67 TS/TSX files.

**Read it for** a complete author → publish → discover → run lifecycle inside
one block: private drafts in `useAppStorage`, a published feed in
`useSharedStorage`, and a spend path that estimates, confirms, and can top the
viewer up mid-flow (`useBuzzWorkflow` + `useBuzzPurchase`). It is also the
clearest img2img example — `useImageUpload` is the source-image path.

- **Scopes** — `ai:write:budgeted`, `buzz:read:self`, `apps:storage:read`, `apps:storage:write`, `apps:storage:shared:read`, `apps:storage:shared:write`
- **Hooks** — `useBuzzWorkflow`, `useBuzzPurchase`, `useBuzzBalance`, `useImageUpload`, `useGenerationResources`, `useResourcePicker`, `useSharedStorage`, `useAppStorage`, `useGatedImages`, `useCivitaiNavigate`, `useRequestConsent`, `useRequestSignIn`, `useBlockContext`, `useBlockToken`, `useBlockResize`, `useBlockAnalytics`

### App Requests

**[github.com/ZacxDev/civitai-app-requests](https://github.com/ZacxDev/civitai-app-requests)** — page app, ~51 TS/TSX files.

**Read it for** the smallest complete block in this list. It declares **no Buzz
and no generation scope at all** — shared storage plus `user:read:self` is the
entire privileged surface — so `useSharedStorage` is visible on its own, running
a cross-user post / vote / edit / withdraw board, without any of the spend
machinery the other examples wrap around it. Start here if the hook lists above
look like a lot.

- **Scopes** — `apps:storage:shared:read`, `apps:storage:shared:write`, `user:read:self`
- **Hooks** — `useSharedStorage`, `useBlockBreakpoint`, `useRequestSignIn`, `useBlockContext`, `useBlockResize`, `useBlockAnalytics`

### Generate from Model

**[github.com/ZacxDev/civitai-block-generate-from-model](https://github.com/ZacxDev/civitai-block-generate-from-model)** — **slot app**, ~30 TS/TSX files.

**Read it for** the only **slot** example here, and the only one that reads
host-injected page context. Its manifest declares no `page` at all — instead a
`targets` entry for `model.sidebar_top` with
`requiredContext: ["modelId", "modelVersionId"]` — so the model identity arrives
from the host rather than from a picker. It is also the only example declaring
publisher-configurable `settings` (`buzz_budget_per_gen`,
`default_prompt_suffix`, `show_advanced`), read back through `useBlockSettings`.

::: tip Slot apps are deferred for third-party builders
[Concepts](./guide/concepts) explains the split: slot apps exist in the
platform, but building one is not currently open to third parties — build a page
app. This repository is still the readable answer to "what does a slot app look
like".
:::

- **Scopes** — `models:read:self`, `ai:write:budgeted`, `buzz:read:self`
- **Hooks** — `useBlockSettings`, `useCheckpointPicker`, `useBuzzWorkflow`, `useBuzzPurchase`, `useBuzzBalance`, `useBlockContext`, `useBlockResize`

### Panorama 360

**[github.com/civitai/app-panorama-360](https://github.com/civitai/app-panorama-360)** — page app, ~35 `.ts` files and **zero `.tsx`**.

**Read it for** proof that the block contract does not require React. It imports
**no hooks at all**: it drives the transport directly with `getTransport` and
`sendTypedRequest` from `@civitai/blocks-react`, takes its types from
`@civitai/app-sdk/blocks`, and builds its UI from hand-rolled Web Components
(`customElements.define('pano-viewer', …)`). React appears only as an inert dev
dependency for the SDK's mock-host test harness. It is also the one example
wiring [Comfy on Civitai](./guide/comfy-cloud) into a real app, via
`@civitai/comfy-run-kit`.

- **Scopes** — `ai:write:budgeted` (the shortest manifest here)
- **SDK surface** — `getTransport`, `sendTypedRequest` (`@civitai/blocks-react`); `BlockWorkflowSnapshot`, `WorkflowBody`, `BuzzAccountType` (`@civitai/app-sdk/blocks`); `RunController`, `BridgeGateway`, `registerRunElements` (`@civitai/comfy-run-kit`)

## Reading one of these next to the docs

The examples are whole applications, so the shortest path from a repository back
to the contract it is using:

- a hook you do not recognise → [Hooks reference](./reference/hooks)
- a manifest field → [Manifest reference](./reference/manifest)
- a scope string → [Scopes reference](./reference/scopes)
- a `WorkflowBody` shape or the spend lifecycle → [Generation bridge](./reference/generation)
- a raw `postMessage` payload (Panorama 360) → [Message bridge](./reference/messages)

If you are not building yet, [Quickstart](./guide/quickstart) scaffolds a
working page app with the `civitai` CLI in less time than reading any of these
takes.

## Keeping this list honest

A docs page naming eight repositories rots in a way nobody notices: GitHub
**301-redirects a renamed repository**, so a link to a repo that moved still
resolves, and a plain link check reports it healthy right up until someone else
claims the old name.

`npm run check:example-apps` (`scripts/check-example-apps.mjs`) therefore reads
each repository's `full_name` back from the API and fails on a mismatch, as well
as on a 404, a 451 takedown and on `archived: true`. Its offline half runs on
every pull request — the page parses, still names at least six repositories, and
does not contradict itself: the counts stated in this prose are graded against
the links actually on the page, every `#anchor` in the table above must resolve
to a section that is still here, and every example section must state a scope
list in a shape the next paragraph can grade. The half that reaches GitHub runs
on the daily `appblocks-drift` schedule, because an upstream rename is unrelated
to whatever docs change is in flight.

A live, unrenamed, unarchived repository can still be described wrongly, so that
scheduled half also fetches each repository's `block.manifest.json` and compares
its `scopes` array against the scope list stated above. The comparison is by
**set, not order**: the page's claim is about *which* scopes an example declares,
so a manifest that merely reorders its array leaves the sentence true and is
reported as a note rather than a failure. A manifest that is missing,
unparseable, or carries no `scopes` array fails with that named as the reason —
never a silent pass. A scheduled run that goes red now **opens a GitHub issue**
naming the repository and how it rotted, and closes it again on the next clean
run; a run that verified *nothing* opens one too, because a silent zero and a
clean bill of health print the same thing.

The **hook** lists are the one thing on this page nothing re-checks, which is why
they carry a date rather than a guarantee. The guard asserts the date stamp is
present, is a real date and is not in the future, and prints its age on every
run — so the lists can get old, but they cannot get old *quietly*.
