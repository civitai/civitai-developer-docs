---
title: Moving a block off the bridge
description: Replace a block's postMessage data calls with /api/v1/blocks/* REST calls — what each credential reaches, what auth oauth gives up, and a hook-by-hook replacement table.
sources:
  - npm:@civitai/blocks-react@0.69.0/dist/index.d.ts
  - npm:@civitai/sdk@0.11.0/dist/index.d.ts
  - civitai-app-starters:packages/civitai-sdk/BREAKING.md
  - civitai:public/schemas/app-block/v1.json#auth
  - civitai:src/pages/api/v1/blocks
  - civitai:src/pages/api/v1/blocks/shared-storage/list.ts
  - civitai:src/server/routers/apps-shared.router.ts#listSharedRows
  - civitai:src/server/middleware/block-scope.middleware.ts#verifyBlockToken
---

# Moving a block off the bridge

Most data a block used to fetch by posting a message to its host now has a REST
route, and **a block can call those routes today with the token it already
has.** This page maps each bridge hook to its route, and says what each
credential reaches.

::: tip The rule to build by
**Default to the API. Use messaging only for the things that must go through it.**

Opening the resource picker is a message, because a sandboxed iframe cannot draw
Civitai's picker. Reading a Buzz balance is a request, because nothing about it
needs host chrome.
:::

::: warning `@civitai/sdk` runs in a block now — and nothing is asking you to move
`@civitai/app-sdk` + `@civitai/blocks-react` continue; **no app has to move.**

**On the default block token,** `@civitai/sdk`'s `initialize()` succeeds (since
`0.5.0`; `0.4.0` threw). `app.storage`, `app.site` on `blocks/*` paths,
`app.requestGrants` and all of `app.host` (bridge messages underneath) work.
`app.orchestration` rejects **before it sends** for a signed-in viewer, and
`app.site` outside `blocks/*` returns the API's own 401/403 — with the
`auth: "oauth"` opt-in appended — on a route that requires auth, while a public
route answers anonymously.

**`auth: "oauth"`** gets a real OAuth access token that `/api/v1`, the
orchestrator and the MCP accept — but it is a trade that costs 22 block routes;
see [choosing your credential](#auth-field). The replacement table below is a
map of routes, not packages, and applies either way.
:::

The bridge is **not deprecated**. Host UI stays on it by design, and so does
publishing a post. A block that moves its data calls uses both — fewer messages,
not zero.

## Before you write any code

### Scope binding is per-route — declare only what you use

A route that declares a required scope binds **only that scope** against your
block context: `GET /api/v1/models/{id}` declares `models:read:self` and 403s
unless `?id` is the model your block renders beside; `GET /api/v1/blocks/buzz`
declares `buzz:read:self` and ignores your other scopes. A route with no
required scope binds nothing — `GET /api/v1/blocks/models` accepts any valid
block token, clamped only by its maturity ceiling. (An unrecognised scope is
rejected outright, but the manifest validator catches that first.)

So **declare the scopes your app actually uses**, and pass each route the
parameters its scope binds on.

### Your tests will pass while exercising nothing

After the port your block sends no `postMessage` operations, so a mock host
answers nothing and the suite goes green having tested none of the new path.
**Move the fake to `fetch`** — see [Testing](#testing) below.

## Choose your credential: the manifest's `auth` field {#auth-field}

```json
{
  "blockId": "my-app",
  "auth": "oauth"
}
```

| `auth` | Credential | Reaches |
|---|---|---|
| `"block-token"` *(default when omitted)* | the block-scoped JWT | the block-token routes under `/api/v1/blocks/*`, plus `/api/v1/models/{id}` |
| `"oauth"` | a real OAuth access token for the block's own client | `/api/v1`, the orchestrator and the MCP, unchanged |

Omitting `auth` keeps today's behaviour, so an existing manifest needs no edit to
start calling the block routes.

The OAuth mint is live in production, but `block-token` is the default for good
reasons:

- **The block token reaches further than its name suggests** — 34 of the 38
  `/api/v1/blocks/*` routes, plus `/api/v1/models/{id}`. If that is your whole
  surface, `auth: "oauth"` buys nothing and costs the routes below.
- **The `oauth` path has little production use yet**, and its consent surface is
  new — declare the narrowest scope set you can.

::: danger `auth: "oauth"` gives up 22 of the block REST routes
An OAuth token resolves to the same `(app, viewer)` claims, but these routes
**re-verify the raw bearer as a block JWS**, which it is not, so they fail with
a 401 or 403: **app storage** (5 routes), **shared storage** (11), all **five
workflow routes** (`estimate`/`submit`/`poll`/`cancel` **and `query`**) and
`user-checkpoint/set`. The other 12 work on either token: `buzz`, `me`,
`models`, `images`, `gated-images`, `generation-resources`, `tools`, `tip`,
`tip-allowance` and the three `collections` routes.

**If your app uses app storage, it cannot use `auth: "oauth"` today.** The server
refuses the pair when a moderator approves the version (and on a direct git
push), not when `civitai app submit` uploads it, and `civitai app validate`
doesn't check it either — so fix it before submitting, or the request sits in
review until approval fails. Left unrefused, every storage read and write would
401 as soon as a viewer signs in.

**If your block generates, stay on the host-proxied workflow routes.** They
carry the per-call Buzz budget, the per-viewer and per-app daily caps, the
maturity clamp and the `app-block:<appId>` attribution tag; a direct
orchestrator call keeps only the per-viewer consent budget.

`oauth` is for a block that needs the general `/api/v1` surface or the
orchestrator directly, and none of those 22.
:::

## The adapter shape

Put a thin per-app layer in `src/platform/` rather than calling the API from
components: one place to own the token, one place to fake in tests, and no wire
shapes in your UI. It uses the validated host origin and the bearer the block
already holds — the same direct-fetch pattern `useTip` and
`useGenerationResources` use internally:

```tsx
// src/platform/useApi.ts
import { useCallback } from 'react';
import { useHostOrigin, useBlockToken } from '@civitai/blocks-react';

/** A fetcher bound to this block's own credential. Throws until BLOCK_INIT. */
export function useApi() {
  const host = useHostOrigin();
  const { raw } = useBlockToken();

  // useCallback is load-bearing, not tidiness. A fresh function identity every
  // render turns the usual `useEffect(..., [call])` into an unbounded request
  // loop — against money-scoped routes. blocks-react's own useTip does the same.
  return useCallback(
    async function call<T>(path: string, init?: RequestInit): Promise<T> {
      if (!host) throw new Error('not ready: BLOCK_INIT has not landed');
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${raw}`);
      const res = await fetch(`${host}/api/v1/blocks/${path}`, { ...init, headers });
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      return (await res.json()) as T;
    },
    [host, raw],
  );
}
```

```tsx
// src/platform/buzz.ts — a capability, named the way your app thinks about it
import { useCallback } from 'react';
import { useApi } from './useApi';

export interface BuzzBalance {
  blue: number;
  green: number;
  yellow: number;
}

export function useBuzzBalanceFetcher() {
  const call = useApi();
  return useCallback(() => call<BuzzBalance>('buzz'), [call]);
}
```

Components import the capability, never the fetcher.

::: tip Two things this layer does not do for you
**Gate on readiness.** The function throws until `BLOCK_INIT` lands, so gate
the call site on `useBlockContext().ready`, or a mount-time read fails with an
unhandled rejection first.

**Retry the 401 race.** For a request that outlived its token, retry once
through `useBlockToken().refresh()`.
:::

`@civitai/sdk`'s `initialize()` runs in a block on either credential, so
`useApi` can later become `app.site` with nothing above it changing.

## Hook replacements

Every hook `@civitai/blocks-react` exports — the package root, plus
`useBlocksStyles` from `@civitai/blocks-react/ui`. "Local" means the hook never
talked to the platform — it is your own code now, with nothing to replace.

::: warning Don't trust a hook count — enumerate
The package gains hooks between releases. List the ones in your installed
version:

```bash
node -e "import('@civitai/blocks-react').then(m => console.log(Object.keys(m).filter(k => k.startsWith('use')).sort().join(' ')))"
```
:::

| Bridge hook | Replacement |
|---|---|
| `useAppStorage` | `/api/v1/blocks/app-storage/{get,set,delete,list,quota}` — block-token only |
| `useAppWorkflows` | `POST /api/v1/blocks/workflows/query` |
| `useBatchEstimate` | **No route yet** — `ESTIMATE_WORKFLOW_BATCH` is a bridge message, and no `/api/v1/blocks/*` route prices a batch. Over REST, price each body with `POST /api/v1/blocks/workflows/estimate` |
| `useBlockAnalytics` | **Keep** — a bridge message with no route. Its events are recorded once your manifest declares them; `@civitai/sdk`'s `app.host.track()` sends the same message (from 0.11.0). See the note below |
| `useBlockBreakpoint` | Local — element measurement, keep as is |
| `useBlockContext` | **Keep** — the handshake payload arrives over the bridge and has no route |
| `useBlockResize` | **Keep** — host UI; only the host can size your frame |
| `useBlockSettings` | **Keep** — part of the handshake payload |
| `useBlockTheme` | **Keep** — part of the handshake payload |
| `useBlockToken` | **Keep** — this is where the bearer for a direct fetch comes from, and its `refresh()` covers the 401 race |
| `useBlocksStyles` | Local — stylesheet injection |
| `useBuzzAccounts` | **No route yet** |
| `useBuzzBalance` | `GET /api/v1/blocks/buzz` |
| `useBuzzPurchase` | **Keep** — host UI |
| `useBuzzTransactions` | **No route yet** |
| `useBuzzWorkflow` | `/api/v1/blocks/workflows/{estimate,submit,poll,cancel}` |
| `useCheckpointPicker` | **Keep** the picker (host UI); `.persist` → `POST /api/v1/blocks/user-checkpoint/set` |
| `useCivitaiNavigate` | **Keep** — host UI |
| `useCivitaiRoute` | **Keep** — reads the host-owned sub-path from the handshake and `ROUTE_CHANGED`; off the bridge your own router owns the URL, so there is nothing to replace |
| `useCollectionFollow` | `POST /api/v1/blocks/collections/{id}/follow` |
| `useConsentUnavailable` | **Keep** — consent is host UI |
| `useCreatePostFromApp` | **Stays on the bridge, by design** — see [Posting from an app](./posting) |
| `useDailyCompensation` | **Not carried** |
| `useDirectLoad` | **Keep** — see [Embedding](./embedding) |
| `useDomainMaturity` | No direct equivalent — keep the hook. Gate through its derived `isSfw` / `isLevelAllowed`, never on a raw bitmask: `maxBrowsingLevel` is the *domain's* ceiling (identical for every viewer on it, including one whose NSFW setting is off) |
| `useEntitlements` | `GET /api/v1/blocks/entitlements` — the read half of the goods rail, scope `goods:read:self`. The reply is scoped server-side to your own `appBlockId`, so the scope is consent-EXEMPT and a read-only block needs no purchase power. Revoked entitlements are excluded server-side |
| `useGatedImages` | `GET /api/v1/blocks/gated-images` |
| `useGenerationResources` | `GET /api/v1/blocks/generation-resources?ids=` |
| `useGoodPurchase` | `POST /api/v1/blocks/goods/purchase` — scope `goods:purchase:self` **and** a `goods` entry in your manifest; without both the endpoint answers 404. Same direct-fetch-on-the-validated-origin shape as `useTip`, and the buyer is always the token subject (the block never supplies a user id). The platform renders **no** confirmation for the purchase itself, so the confirm UI is yours. Its optional top-up on insufficient funds opens `useBuzzPurchase` — host UI, and the opposite money direction |
| `useHostOrigin` | **Keep** — it is the validated base URL every direct fetch needs |
| `useImageUpload` | **Keep** — host UI. (`@civitai/sdk` has covered it since 0.3.0 as `host.openImageUpload`, usable on either credential — but that is still a bridge message, not a route.) |
| `useNestedDocument` | Local — fetches one of your own bundled documents into a `srcdoc` string; it never talks to the platform |
| `usePrepareTrainingDataset` | **No route yet** — `PREPARE_TRAINING_DATASET` is a bridge message, and no `/api/v1/blocks/*` route prepares a training dataset |
| `usePublishGenerationOutputs` | **Stays on the bridge, by design** |
| `useRequestConsent` | **Keep** — consent is host UI |
| `useRequestSignIn` | **Keep** — host UI |
| `useResourcePicker` | **Keep** — host UI; a sandboxed frame cannot draw the picker |
| `useRunTraining` | **Keep** — host UI; the run starts only from the consent dialog Civitai shows in its own chrome |
| `useSaveImage` | **Keep** — host UI; the host fetches from origins it allowlists |
| `useSharedStorage` | `/api/v1/blocks/shared-storage/*` — 11 routes. The route is now the wider surface: `list` takes a `mine` filter the hook has no equivalent for — see [Listing only rows the viewer wrote](#listing-only-rows-the-viewer-wrote) |
| `useTip` | `POST /api/v1/blocks/tip` |
| `useTipAllowance` | `GET /api/v1/blocks/tip-allowance` |
| `useUploadImageBytes` | **Keep** — a bridge message with no route. It sends `OPEN_IMAGE_UPLOAD` with `bytes`, and the host stores, persists and scans the image; no `/api/v1/blocks/*` route accepts an image upload. Page apps only, and the token needs `posts:write:self`. See [Posting from an app](./posting#upload-then-post) |
| `useViewer` | `GET /api/v1/blocks/me`. Keeping the hook is not free: it is a `GET_VIEWER` bridge round trip on mount, not a snapshot read — but it is the authoritative self-read, where `useBlockContext().viewer` is the coarser `BLOCK_INIT` snapshot |
| `useWildcardPack` | **Not carried** |
| `useWorkflowBatch` | **No batch route** — the hook is one `watch()` and one `cancel()` per workflow id, with no server-side batch. Over REST, poll and cancel each id with `/api/v1/blocks/workflows/{poll,cancel}` |

::: warning Keep your `track()` calls — and declare the events
`useBlockAnalytics()` sends `TRACK_EVENT`, and **both hosts forward it**: your
events reach your app's analytics. An earlier version of this page said the
calls were no-ops and could be deleted. That is no longer true, and deleting
them loses data.

Two things to do when you port:

- **Declare every event** under `analytics.events` in your manifest. Only
  declared events, with declared properties of the declared type, are recorded;
  an undeclared event is counted as a drop and its name is not stored.
- **Move the calls, don't drop them.** `TRACK_EVENT` has no REST route. If you
  are moving to `@civitai/sdk`, `app.host.track(eventName, properties)` sends
  the same message (`@civitai/sdk` 0.11.0 or later).

See [Custom events](./custom-events) for the declaration, the limits and where
the numbers show up.
:::

### Reading and writing

Routes are addressed by path, so a route the API gains needs no package release:

```tsx
import { useApi } from './platform/useApi';

declare const call: ReturnType<typeof useApi>;

// Read. Paging differs per route — shared-storage nests its cursor under
// `metadata`, while app-storage returns a top-level one. Check the route.
const page = await call<{ items: unknown[]; metadata: { nextCursor?: string } }>(
  'shared-storage/list?limit=50',
);

// Write
await call('shared-storage/append', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    value: { title: 'My entry', body: 'optional', data: { anything: true } },
  }),
});
```

- **Treat every refusal as a refusal.** No route has a success shape that means
  "could not read", so branch on the error, never on an empty result. A missing
  cursor proves a scan completed only if you read it from the right place;
  otherwise you get a silent one-page truncation.
- **Read `message ?? error`.** Block-scope middleware rejections carry `error`;
  service-layer refusals carry `message`. Branch on the HTTP status.

### Listing only rows the viewer wrote

`shared-storage/list` takes a `mine` filter that narrows the page to rows the
**viewer** authored, so an app showing someone their own submissions need not
page the whole board. There is no bridge-hook equivalent, and none is planned.

```http
GET /api/v1/blocks/shared-storage/list?limit=50&mine=true
```

- **Values:** `true` filters to the viewer's rows; `false` means the whole
  board, the same as omitting the key. Anything else is a `400`, including **`?mine=` with an empty value** (how most
  query-string helpers serialise an unset field or `undefined`), a bare `?mine`,
  the key sent twice, and `1`/`yes`/`TRUE`. Drop the key when the filter is off.
- **It composes** with `prefix`, `limit` and pagination; the envelope, cursor
  and `apps:storage:shared:read` scope are unchanged.
- **Anonymous callers get an empty page**, indistinguishable from "no rows yet".
  Check whether the viewer is signed in (`useBlockContext().viewer` or
  `GET /api/v1/blocks/me`) before rendering an empty state.
- **It is not a privacy control.** It filters on the token subject (no
  caller-supplied id), but every row already carries its `authorUserId` and is
  world-readable either way.

### Host UI stays on the bridge

Only the host can draw this UI, so `@civitai/blocks-react`'s hooks remain the
path on either transport:

```tsx
import { useResourcePicker } from '@civitai/blocks-react';

const { open } = useResourcePicker();
const picked = await open({ resourceType: 'Checkpoint' });
if (picked) {
  console.log(picked.modelName, picked.versionId);
}
```

A dismissal resolves to nothing chosen — that is an answer, not an error.

## Do not do this

::: danger `app.orchestration` is not a replacement for the workflow routes
The block workflow routes delegate to procedures carrying the per-call Buzz
budget, the per-viewer and per-app daily caps, the maturity clamp, and the
`app-block:<appId>` attribution tag. `app.orchestration` is the raw orchestrator
and has **none** of them.

On the **default** credential `app.orchestration` rejects before it sends
(since `@civitai/sdk@0.5.0`). On an `auth: "oauth"` block the substitution
**type-checks, passes tests and reaches the orchestrator**. Submit through
`/api/v1/blocks/workflows/*`.

Likewise prefer `POST /api/v1/blocks/workflows/query` to
`orchestration.queryWorkflows({ tags })`: the route forces the app tag from the
token server-side, while the client trusts caller-supplied tags.
:::

## Testing

Move the fake to `fetch`, and record what was requested, not only what came
back:

```ts
const calls: string[] = [];

globalThis.fetch = (async (input: RequestInfo | URL) => {
  calls.push(String(input));
  return new Response(JSON.stringify({ items: [], metadata: { nextCursor: null } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;
```

Then assert on `calls` — the **requests your app made**, not just the values it
rendered. A fixture that fits on one page cannot see a dropped `cursor`
parameter.

Keep your existing mock host for the calls that remain on the bridge — the
resource picker, Buzz purchase, sign-in, publishing.

## Known gaps

Document these as gaps; do not design around them yet.

| Gap | State |
|---|---|
| `useImageUpload` / `OPEN_IMAGE_UPLOAD` | No REST twin, and deliberately so — it raises host UI. `@civitai/sdk` exposes it as `host.openImageUpload` (since 0.3.0, either credential), which is the same bridge message behind a different package. |
| `usePublishGenerationOutputs` | Same shape, and staying on the bridge by design — host chrome is the consent control. `@civitai/sdk`'s `host.publishGenerationOutputs` (also 0.3.0) is the same message. |
| `useBlockAnalytics` / `TRACK_EVENT` | No REST twin — a fire-and-forget bridge message, recorded only when the manifest declares the event. `@civitai/sdk` carries it as `host.track` from 0.11.0. See [Custom events](./custom-events). |
| Anonymous app-storage reads | REST returns 403 where the bridge resolved a read to `null`; handle both. |
| `useBuzzAccounts`, `useBuzzTransactions`, `useDailyCompensation`, `useWildcardPack` | Not carried. |

Because of the first two, a block that uploads images or publishes generation
outputs **cannot reach zero bridge messages** — by design.

## Next

- [Concepts → Transport models](./concepts#transport-models) — the mental model.
- [Hooks reference](../reference/hooks) — the bridge surface, in full.
- [Generation reference](../reference/generation) — what the bridge can and cannot do.
- [How an app earns](./earning) — the two money rails (digital goods and the
  per-generation author fee) behind the goods and Buzz hooks, and the `reason` /
  `code` values every one of these routes can refuse with.
