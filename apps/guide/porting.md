---
title: Moving a block off the bridge
description: Replace a block's postMessage data calls with /api/v1/blocks/* REST calls — what each credential reaches, which routes an OAuth token gives up, a hook-by-hook replacement table, and where the route is now the wider surface, taking parameters no bridge hook exposes (shared storage's mine filter).
sources:
  - npm:@civitai/blocks-react@0.65.0/dist/index.d.ts
  - npm:@civitai/sdk@0.5.0/dist/index.d.ts
  - civitai-app-starters:packages/civitai-sdk/BREAKING.md
  - civitai:public/schemas/app-block/v1.json#auth
  - civitai:src/pages/api/v1/blocks
  - civitai:src/pages/api/v1/blocks/shared-storage/list.ts
  - civitai:src/server/routers/apps-shared.router.ts#listSharedRows
  - civitai:src/server/middleware/block-scope.middleware.ts#verifyBlockToken
---

# Moving a block off the bridge

A block used to reach every Civitai capability by posting a message to its host.
Most of that data now has a REST route, and **a block can call those routes today
with the token it already has.** This page maps each bridge hook to its route,
and is honest about what each credential does and does not reach.

::: tip The rule to build by
**Default to the API. Use messaging only for the things that must go through it.**

Opening the resource picker is a message, because a sandboxed iframe cannot draw
Civitai's picker. Reading a Buzz balance is a request, because nothing about it
needs host chrome.
:::

::: warning `@civitai/sdk` runs in a block now — and nothing is asking you to move
`@civitai/app-sdk` + `@civitai/blocks-react` continue, and the platform's position
is unchanged: **no app has to move.** What changed is that the choice is a real
one rather than a blocked one.

**On the default block token,** `@civitai/sdk@0.5.0`'s `initialize()` succeeds.
`app.storage`, `app.site` on `blocks/*` paths, `app.requestGrants` and the whole
of `app.host` (host UI, which is still bridge messages underneath) all work.
`app.orchestration` rejects **before it sends** — the orchestrator accepts a
block-scoped token on no route — and `app.site` outside `blocks/*` returns the
API's own 401/403 with the `auth: "oauth"` opt-in appended to the message.

That is new in 0.5.0. `0.4.0` threw from `initialize()` instead, which refused the
default configuration; the refusal moved to the two surfaces it is actually about.

**With `auth: "oauth"`,** the host mints a real OAuth access token and the general
`/api/v1` surface, the orchestrator and the MCP accept it unchanged. That mint is
enabled in production.

🔴 **But `auth: "oauth"` is a trade, not an upgrade** — it costs you 22 block
routes, app storage among them, and nothing stops you shipping a manifest that
needs both. Read [choosing your credential](#auth-field) before you declare it.

**Either way the replacement table below still applies:** it is a map of routes,
not of packages, and the `/api/v1/blocks/*` routes accept your block token right
now.
:::

The bridge is **not deprecated**. Host UI stays on it by design, and so does
publishing a post. A block that moves its data calls uses both — fewer messages,
not zero.

## Before you write any code

### Scope binding is per-route — declare only what you use

A route that declares a required scope binds **that scope, and only that
scope**, against your block context. `GET /api/v1/models/{id}` declares
`models:read:self` and 403s unless `?id` equals the model your block is
rendering beside. `GET /api/v1/blocks/buzz` declares `buzz:read:self` and does
not look at your other scopes.

A route that declares no required scope binds nothing: `GET /api/v1/blocks/models`
accepts any valid block token, clamped only by the token's maturity ceiling.
Declaring `models:read:self` is not what gates it.

A token carrying a scope the platform does not recognise is rejected outright,
but that is a registration-time mistake rather than a call-site one — the
manifest validator catches it first.

So the only rule at the call site is the ordinary one: **declare the scopes your
app actually uses**, and pass each route the parameters its own scope binds on.

### Your tests will pass while exercising nothing

This is the one people get wrong. After the port your block sends no
`postMessage` operations — so a mock host is answering a conversation nobody is
having, and the suite goes green having tested none of the new path.

**The fake has to move to `fetch`.** In the reference port, deleting the `cursor`
query parameter survived the entire suite, because every fixture fit on one page.
See [Testing](#testing) below.

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

::: tip The mint is live — and `block-token` is still the default for a reason
The host mints a real OAuth access token for a manifest declaring `auth: "oauth"`,
in production. Verified 2026-09-25.

Two things to weigh before you declare it:

- **The block token reaches further than its name suggests.** It is accepted on 34
  of the 38 `/api/v1/blocks/*` routes and on the general `/api/v1/models/{id}`. If
  that is your whole surface, `auth: "oauth"` buys you nothing and costs you the
  routes below.
- **Nobody has run this in anger yet.** No app in Civitai's own fleet declares
  `auth: "oauth"`, so the path is live but unexercised. Budget for finding the
  first rough edge yourself.

**Declare the narrowest scope set you can.** An `auth: "oauth"` block's consent
surface is new, and the fewer scopes your manifest asks for, the less rides on it.
:::

::: danger `auth: "oauth"` gives up 22 of the block REST routes
This is wider than it looks, and it is not an identity gap — an OAuth token does
resolve to the same `(app, viewer)` claims. The reason is that those routes
**re-verify the raw bearer as a block JWS** inside their service layer, and an
OAuth access token is not one. Those calls fail with a 401 or 403.

That covers **app storage** (5 routes), **shared storage** (11 routes), all
**five workflow routes** (`estimate`/`submit`/`poll`/`cancel` **and `query`**) and
`user-checkpoint/set` — 22 in all. The other 12 block routes are
credential-agnostic and work on either token: `buzz`, `me`, `models`, `images`,
`gated-images`, `generation-resources`, `tools`, `tip`, `tip-allowance` and the
three `collections` routes.

🔴 **If your app uses app storage, it cannot use `auth: "oauth"` today** — and
nothing stops you shipping the pair, because manifest validation does not yet
refuse it. The failure arrives at runtime as an unexplained 401 on every read and
write. `@civitai/sdk` will not annotate it either: its `auth: "oauth"` hint fires
only for a block that *holds* a block token, which yours no longer does.

🔴 **If your block generates, stay on the host-proxied workflow routes.** They
carry the per-call Buzz budget, the per-viewer and per-app daily caps, the
maturity clamp and the `app-block:<appId>` attribution tag. A direct orchestrator
call keeps only the per-viewer consent budget; the rest have not moved across yet.

`oauth` is for a block that needs the general `/api/v1` surface or the
orchestrator directly, and needs none of those 22.
:::

## The adapter shape

Both ported blocks put a thin per-app layer in `src/platform/` rather than
calling the API from components. It is worth copying whichever transport you are
on: it gives you one place to own the token, one place to fake in tests, and it
keeps wire shapes out of your UI.

A block already holds everything it needs — the validated host origin and the
bearer — and this is the same direct-fetch pattern `useTip` and
`useGenerationResources` use internally:

```tsx
// src/platform/useApi.ts
import { useCallback } from 'react';
import { useHostOrigin, useBlockToken } from '@civitai/blocks-react';

/** A fetcher bound to this block's own credential. Throws until BLOCK_INIT. */
export function useApi() {
  const host = useHostOrigin();
  const { raw } = useBlockToken();

  // 🔴 useCallback is load-bearing, not tidiness. A fresh function identity every
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
**Gate on readiness.** The returned function throws until `BLOCK_INIT` lands, so a
mount-time read fires before `useHostOrigin()` resolves. Gate the call site on
`useBlockContext().ready` — it self-heals when `host` arrives and the identity
changes, but without a gate you get an unhandled rejection first.

**Retry the 401 race.** `useBlockToken()` exposes `refresh()` for a request that
outlived the token it was issued against. Retry once through it rather than
failing the call.
:::

The same layer is what you swap: `@civitai/sdk`'s `initialize()` runs in a block
today, on either credential, so `useApi` can become `app.site` with nothing above
it changing. That is the point of having it.

## Hook replacements

Every hook `@civitai/blocks-react` exports — the package root, plus
`useBlocksStyles` from `@civitai/blocks-react/ui`. "Local" means the hook never
talked to the platform — it is your own code now, with nothing to replace.

::: warning Don't trust a hook count — enumerate
This paragraph used to open "All 37 hooks", and the number is the defect: the
package outgrows it every release, and a stale count reads as a complete list.
It said 37 while the package exported 39, and the two it was short of were the
digital-goods pair (`useGoodPurchase` / `useEntitlements`) — invisible to
everyone porting off the bridge. Enumerate from the package you actually
installed rather than trusting any figure written down here:

```bash
node -e "import('@civitai/blocks-react').then(m => console.log(Object.keys(m).filter(k => k.startsWith('use')).sort().join(' ')))"
```

The table below is pinned to that same export set by
`npm run check:porting-hooks`, which reads it from the installed package's own
type barrels — so a hook the package gains and this page misses fails a PR
rather than shipping.
:::

| Bridge hook | Replacement |
|---|---|
| `useAppStorage` | `/api/v1/blocks/app-storage/{get,set,delete,list,quota}` — block-token only |
| `useAppWorkflows` | `POST /api/v1/blocks/workflows/query` |
| `useBlockAnalytics` | **Nothing to replace** — see the note below |
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
| `useCreatePostFromApp` | **Stays on the bridge, by design** |
| `useDailyCompensation` | **Not carried** |
| `useDirectLoad` | **Keep** — see [Embedding](./embedding) |
| `useDomainMaturity` | No direct equivalent — keep the hook. 🔴 Gate through its derived `isSfw` / `isLevelAllowed`, never on a raw bitmask: `maxBrowsingLevel` is the *domain's* ceiling (identical for every viewer on it, including one whose NSFW setting is off) |
| `useEntitlements` | `GET /api/v1/blocks/entitlements` — the read half of the goods rail, scope `goods:read:self`. The reply is scoped server-side to your own `appBlockId`, so the scope is consent-EXEMPT and a read-only block needs no purchase power. Revoked entitlements are excluded server-side |
| `useGatedImages` | `GET /api/v1/blocks/gated-images` |
| `useGenerationResources` | `GET /api/v1/blocks/generation-resources?ids=` |
| `useGoodPurchase` | `POST /api/v1/blocks/goods/purchase` — scope `goods:purchase:self` **and** a `goods` entry in your manifest; without both the endpoint answers 404. Same direct-fetch-on-the-validated-origin shape as `useTip`, and the buyer is always the token subject (the block never supplies a user id). 🔴 The platform renders **no** confirmation for the purchase itself, so the confirm UI is yours. Its optional top-up on insufficient funds opens `useBuzzPurchase` — host UI, and the opposite money direction |
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
| `useViewer` | `GET /api/v1/blocks/me`. Keeping the hook is not free: it is a `GET_VIEWER` bridge round trip on mount, not a snapshot read — but it is the authoritative self-read, where `useBlockContext().viewer` is the coarser `BLOCK_INIT` snapshot |
| `useWildcardPack` | **Not carried** |

::: info `useBlockAnalytics` loses nothing
It emits `TRACK_EVENT`, which has **no host-side sink on either host** — the
events are dropped today. The call sites are already no-ops, so removing the hook
costs you nothing that was working. A no-op shim is a fine way to avoid touching
every call site at once.
:::

### Reading and writing

Routes are addressed by path, so a route the API gains needs no package release:

```tsx
import { useApi } from './platform/useApi';

declare const call: ReturnType<typeof useApi>;

// Read. 🔴 Paging differs per route — shared-storage nests its cursor under
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

Two behaviours worth knowing before you write a caller:

- **Treat every refusal as a refusal.** No route has a success shape that means
  "could not read". If your code must not act on a partial view, branch on the
  error — never on an empty result. Once you are reading the cursor from the
  right place, its absence is your proof a scan completed — read it from the
  wrong place and you get a silent one-page truncation instead.
- **Read `message ?? error`.** Which key carries the reason depends on where the
  request died: rejections from the block-scope middleware carry `error` only,
  while service-layer refusals carry `message`. Branch on the HTTP status.

### Listing only rows the viewer wrote

Shared storage is a case where the route is now the wider surface, not just the
other spelling. `shared-storage/list` takes a `mine` filter that narrows the page
to rows the **viewer** authored — so an app showing someone their own submissions
stops paging the whole board and filtering in the client. There is no bridge-hook
equivalent, and none is planned: the platform is consolidating this capability on
the REST path.

```http
GET /api/v1/blocks/shared-storage/list?limit=50&mine=true
```

Omit the parameter for the whole board. `mine=false` is also accepted and means
exactly that — the whole board — so a UI with a "mine / everyone" toggle can send
either spelling rather than rebuilding the URL.

Everything else is unchanged: the same `{ items, metadata: { nextCursor } }`
envelope, the same opaque cursor, the same `prefix` and `limit`, the same
`apps:storage:shared:read` scope. `mine` composes with `prefix` and with
pagination — it is one more predicate on the same query, so `nextCursor` pages
through the filtered set.

::: danger `?mine=` with an empty value is a 400 — omit the parameter instead
`mine` accepts the two string literals `true` and `false`, and nothing else.
That is deliberate rather than an oversight: the obvious coercion maps the
*string* `"false"` to **true** and would silently invert the filter, so the route
refuses a value it does not recognise instead of quietly falling back to the
whole board.

The consequence to design your query builder around: **`?mine=` — the standard
serialisation of an unset form field, or of an `undefined` in most
query-string helpers — is a `400`, not a default.** Drop the key entirely when
the filter is off. A bare `?mine` with no `=` parses to the same empty string and
400s identically, as does the same key sent twice. A typo (`?mine=1`, `?mine=yes`,
`?mine=TRUE`) is a loud 400 for the same reason, which is the point: you find out,
rather than rendering the whole board in a UI that promised "yours".
:::

::: warning An empty page under `mine` is not evidence the store is empty
Anonymous viewers may read this feed. An anonymous caller asking for `mine=true`
gets an **empty page** — not an error, and not the whole board — because the
author comparison is made against a null subject and therefore matches nothing.

That is the right answer (an anonymous viewer has authored nothing), but it
arrives from how the query is evaluated rather than from an explicit refusal, so
it is indistinguishable at the wire from "this app has no rows yet". **Do not
read an empty `mine` page as a fact about the store.** If your UI has an empty
state, branch on whether the viewer is signed in before rendering "nothing here
yet" — `useBlockContext().viewer`, or `GET /api/v1/blocks/me`, is where you find
that out.
:::

::: info `mine` is a convenience, not a permission boundary
It is a boolean, not a user id, and the author it filters on is the resolved
token subject — the same value each row's `viewerVoted` already keys on. No
caller-supplied identity enters this path.

**That is not a privacy control, and it would be wrong to design as if it were.**
Every listed row already carries its `authorUserId`, so paging the board and
filtering by author has always been possible; `mine` makes it cheap, not
possible. Nothing is withheld from a caller that omits it, and the rows are
exactly as world-readable either way. The reason it is a boolean rather than a
`mine=<userId>` form is **YAGNI**: nothing asks for the id form, and widening a
boolean later is easy where narrowing an id once clients depend on it is not.

The authoritative statement is the `listSharedRows` docblock in the `civitai`
repo (`src/server/routers/apps-shared.router.ts`), which records the security
framing it had to retract — read it there rather than re-deriving one here.
:::

### Host UI stays on the bridge

Nothing changes here — `@civitai/blocks-react`'s hooks are the path, on either
transport, because only the host can draw this UI:

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

Since `@civitai/sdk@0.5.0` a block on the **default** credential cannot make this
mistake quietly — `app.orchestration` rejects before it sends. The hazard is live
for an `auth: "oauth"` block, where the substitution **type-checks, passes tests
and reaches the orchestrator**. Submit through `/api/v1/blocks/workflows/*`.

The same shape applies to `orchestration.queryWorkflows({ tags })` versus
`POST /api/v1/blocks/workflows/query`: the route forces the app tag server-side
from the token, while the client takes tags from the caller — which moves a trust
boundary inside the iframe.
:::

## Testing

After the port your block makes HTTP requests, not `postMessage` calls. A mock
host will therefore sit idle while your suite passes.

Move the fake to `fetch` — and keep a record of what was requested, not only
what came back:

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
parameter, which is exactly how that bug survived a full green suite.

Keep your existing mock host for the calls that genuinely remain on the bridge —
the resource picker, Buzz purchase, sign-in, publishing. Those are still
`postMessage`, so the old fake is still the right one for them.

## Known gaps

Document these as gaps; do not design around them yet.

| Gap | State |
|---|---|
| `useImageUpload` / `OPEN_IMAGE_UPLOAD` | No REST twin, and deliberately so — it raises host UI. `@civitai/sdk` exposes it as `host.openImageUpload` (since 0.3.0, either credential), which is the same bridge message behind a different package. |
| `usePublishGenerationOutputs` | Same shape, and staying on the bridge by design — host chrome is the consent control. `@civitai/sdk`'s `host.publishGenerationOutputs` (also 0.3.0) is the same message. |
| `useBlockAnalytics` | No sink anywhere; already a no-op. |
| Anonymous app-storage reads | REST returns 403 where the bridge resolved a read to `null`. Whether that is the intended policy per operation is open as [#5089](https://github.com/civitai/civitai/issues/5089). |
| `useBuzzAccounts`, `useBuzzTransactions`, `useDailyCompensation`, `useWildcardPack` | Not carried. |

Because of the first two, a block that uploads images or publishes generation
outputs **cannot reach zero bridge messages today** — whichever package it asks
through. That is expected, and it is why the bridge is not going anywhere.

## Next

- [Concepts → Transport models](./concepts#transport-models) — the mental model.
- [Hooks reference](../reference/hooks) — the bridge surface, in full.
- [Generation reference](../reference/generation) — what the bridge can and cannot do.
- [How an app earns](./earning) — the three money rails behind the goods and Buzz
  hooks, and the `reason` / `code` values every one of these routes can refuse
  with.
