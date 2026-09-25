---
title: Moving a block off the bridge
description: Replace a block's postMessage data calls with /api/v1/blocks/* REST calls — what is available today, what waits on the OAuth mint, and a hook-by-hook replacement table.
sources:
  - npm:@civitai/blocks-react@0.57.1/dist/index.d.ts
  - npm:@civitai/sdk@0.4.0/dist/index.d.ts
  - civitai-app-starters:packages/civitai-sdk/BREAKING.md
  - civitai:public/schemas/app-block/v1.json#auth
  - civitai:src/pages/api/v1/blocks
---

# Moving a block off the bridge

A block used to reach every Civitai capability by posting a message to its host.
Most of that data now has a REST route, and **a block can call those routes today
with the token it already has.** This page maps each bridge hook to its route,
and is honest about the part that is not ready.

::: tip The rule to build by
**Default to the API. Use messaging only for the things that must go through it.**

Opening the resource picker is a message, because a sandboxed iframe cannot draw
Civitai's picker. Reading a Buzz balance is a request, because nothing about it
needs host chrome.
:::

::: danger Blocks do not adopt `@civitai/sdk` yet — and nothing is asking you to move
`@civitai/sdk` is the client for an app that holds **its own** OAuth token. For a
block, the platform's position is explicit: **no app has to move**, and
`@civitai/app-sdk` + `@civitai/blocks-react` continue.

The blocker is the credential. A block's token is a block-scoped JWT, which the
general `/api/v1` surface and the orchestrator do not accept. The manifest gained
an `auth: "oauth"` field to opt into a real OAuth token — but **minting it is
behind a server flag that is off in production**, so a block that declares it
silently receives the block token anyway.

🔴 **Since `@civitai/sdk@0.4.0`, that combination throws.** `initialize()`
refuses a block-scoped token for a signed-in viewer with a `CivitaiError` telling
you to declare `auth: "oauth"` — which, while the flag is off, you cannot
satisfy. Until the mint is live, a block calling `@civitai/sdk` has no working
path.

**What you can do today is everything else on this page:** the
`/api/v1/blocks/*` routes accept your block token right now, and the replacement
table below is a map of routes, not of packages.
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

::: danger `auth: "oauth"` is accepted but not yet live
The validator accepts `"oauth"`, but minting the OAuth token is behind a server
flag that is **off in production**. While it is off the host falls back to the
**block token**, so a manifest declaring `auth: "oauth"` silently gets
`block-token` behaviour and a general `/api/v1` call fails as unauthorised
rather than explaining itself.

**Port onto the block routes first.** They work today, and they are where the
spend caps and attribution live anyway. Verified 2026-09-24.
:::

::: danger `auth: "oauth"` gives up most of the block REST surface
This is wider than it looks, and it is not an identity gap — an OAuth token does
resolve to the same `(app, viewer)` claims. The reason is that several block
routes **re-verify the raw bearer as a block JWS** inside their service layer,
and an OAuth access token is not one. Those calls fail.

That covers **app storage** (5 routes), **shared storage** (11 routes), all
**five workflow routes** (`estimate`/`submit`/`poll`/`cancel` **and `query`**) and
`user-checkpoint/set` — 22 in all.

🔴 **So `oauth` mode gives up exactly the routes this guide tells you to submit
generations through** — the ones carrying the Buzz budget, the per-viewer and
per-app caps, the maturity clamp and the attribution tag. If your block
generates, stay on `block-token`.

`oauth` is for a block that needs the general `/api/v1` surface or the
orchestrator directly, and does not need the block routes.
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

The same layer is what you swap later: when `@civitai/sdk` becomes available to
blocks, `useApi` becomes `initialize()` and nothing above it changes. That is the
point of having it.

## Hook replacements

All 37 hooks `@civitai/blocks-react` exports — 36 from the package root, plus
`useBlocksStyles` from `@civitai/blocks-react/ui`. "Local" means the hook never
talked to the platform — it is your own code now, with nothing to replace.

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
| `useCollectionFollow` | `POST /api/v1/blocks/collections/{id}/follow` |
| `useConsentUnavailable` | **Keep** — consent is host UI |
| `useCreatePostFromApp` | **Stays on the bridge, by design** |
| `useDailyCompensation` | **Not carried** |
| `useDirectLoad` | **Keep** — see [Embedding](./embedding) |
| `useDomainMaturity` | No direct equivalent — keep the hook. 🔴 Gate through its derived `isSfw` / `isLevelAllowed`, never on a raw bitmask: `maxBrowsingLevel` is the *domain's* ceiling (identical for every viewer on it, including one whose NSFW setting is off) |
| `useGatedImages` | `GET /api/v1/blocks/gated-images` |
| `useGenerationResources` | `GET /api/v1/blocks/generation-resources?ids=` |
| `useHostOrigin` | **Keep** — it is the validated base URL every direct fetch needs |
| `useImageUpload` | **Keep** — host UI. (`@civitai/sdk` has `host.openImageUpload`, but a block cannot use that package yet.) |
| `usePublishGenerationOutputs` | **Stays on the bridge, by design** |
| `useRequestConsent` | **Keep** — consent is host UI |
| `useRequestSignIn` | **Keep** — host UI |
| `useResourcePicker` | **Keep** — host UI; a sandboxed frame cannot draw the picker |
| `useSaveImage` | **Keep** — host UI; the host fetches from origins it allowlists |
| `useSharedStorage` | `/api/v1/blocks/shared-storage/*` — 11 routes |
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

The substitution **type-checks and passes tests**, which is why it is worth
naming. Submit through `/api/v1/blocks/workflows/*`.

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
| `useImageUpload` / `OPEN_IMAGE_UPLOAD` | No REST twin, and deliberately so — it raises host UI. `@civitai/sdk` exposes `host.openImageUpload`, but a block cannot use that package yet. |
| `usePublishGenerationOutputs` | Same shape, and staying on the bridge by design — host chrome is the consent control. |
| `useBlockAnalytics` | No sink anywhere; already a no-op. |
| Anonymous app-storage reads | REST returns 403 where the bridge resolved a read to `null`. Whether that is the intended policy per operation is open as [#5089](https://github.com/civitai/civitai/issues/5089). |
| `useBuzzAccounts`, `useBuzzTransactions`, `useDailyCompensation`, `useWildcardPack` | Not carried. |

Because of the first two, a block that uploads images or publishes generation
outputs **cannot reach zero `@civitai/blocks-react` imports today.** That is
expected, and it is why the bridge is not going anywhere.

## Next

- [Concepts → Transport models](./concepts#transport-models) — the mental model.
- [Hooks reference](../reference/hooks) — the bridge surface, in full.
- [Generation reference](../reference/generation) — what the bridge can and cannot do.
