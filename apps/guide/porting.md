---
title: Porting a block onto @civitai/sdk
description: Move a block off the postMessage bridge and onto the direct /api/v1 transport — the decision rule, the traps that bite first, the adapter shape, and a hook-by-hook replacement table.
sources:
  - npm:@civitai/sdk@0.2.0/dist/index.d.ts
  - civitai-app-starters:packages/civitai-sdk/BREAKING.md
  - civitai:public/schemas/app-block/v1.json#auth
  - civitai:src/pages/api/v1/blocks
---

# Porting a block onto `@civitai/sdk`

A block used to reach every Civitai capability by posting a message to its host.
It can now hold a token and call `/api/v1` itself. This page is the recipe for
moving an existing block across, and the list of things that will bite you.

::: tip The rule to build by
**Default to the API. Use messaging only for the things that must go through it.**

Opening the resource picker is a message, because a sandboxed iframe cannot draw
Civitai's picker. Reading a Buzz balance is a request, because nothing about it
needs host chrome.
:::

The bridge is **not deprecated**. Host UI stays on it by design, and so does
publishing a post. A ported block uses both — fewer messages, not zero.

## Before you write any code

### Scope binding is per-route — declare only what you use

Each block REST route binds **its own** required scope against your block
context. `GET /api/v1/blocks/models` checks that `models:read:self` matches the
model your block is rendering beside; `GET /api/v1/blocks/buzz` checks
`buzz:read:self` and does not look at your other scopes.

One thing is still token-wide, and it is deny-by-default: a token carrying a
scope the platform does not recognise is rejected outright. That is a
registration-time mistake rather than a call-site one — the manifest validator
catches it first.

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
| `"block-token"` *(default when omitted)* | the block-scoped JWT | every `/api/v1/blocks/*` route, plus `/api/v1/me` and `/api/v1/models/{id}` |
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

::: warning `auth: "oauth"` gives up per-viewer app storage
App storage is keyed to the block token's `(app, viewer)` identity, which an
OAuth access token does not carry. In `oauth` mode every
`/api/v1/blocks/app-storage/*` call is **refused**. Shared storage is unaffected.

Pick `oauth` when you need the general `/api/v1` surface or the orchestrator.
Stay on `block-token` when per-viewer storage matters.
:::

## The adapter shape

Both ported blocks put a thin per-app layer in `src/platform/` rather than
calling the SDK from components. It is worth copying: it gives you one place to
own the token lifecycle, one place to fake in tests, and it keeps the SDK's
shapes from leaking into your UI.

```ts
// src/platform/client.ts
import { initialize, type BlockAppClient } from '@civitai/sdk';

let client: Promise<BlockAppClient> | null = null;

/** One client per page. Every module awaits this rather than initialising again. */
export function getClient(): Promise<BlockAppClient> {
  client ??= initialize();
  return client;
}
```

```ts
// src/platform/buzz.ts — a capability, named the way your app thinks about it
import { getClient } from './client';

export interface BuzzBalance {
  blue: number;
  green: number;
  yellow: number;
}

export async function fetchBuzzBalance(): Promise<BuzzBalance> {
  const app = await getClient();
  return app.site.get<BuzzBalance>('blocks/buzz');
}
```

Components then import `fetchBuzzBalance`, never `app.site`.

## Hook replacements

All 38 exported `@civitai/blocks-react` hooks. "Local" means the hook never
talked to the platform — it is your own code now, with nothing to replace.

| Bridge hook | Replacement |
|---|---|
| `useAppStorage` | `/api/v1/blocks/app-storage/{get,set,delete,list,quota}` — block-token only |
| `useAppWorkflows` | `POST /api/v1/blocks/workflows/query` |
| `useBlockAnalytics` | **Nothing to replace** — see the note below |
| `useBlockBreakpoint` | Local — element measurement, keep as is |
| `useBlockContext` | `initialize()` → `app.{viewer,context,settings,theme}` + `app.onChange()` |
| `useBlockResize` | `app.host.resize(h)` / `app.host.autoResize(el)` |
| `useBlockSettings` | `app.settings` |
| `useBlockTheme` | `app.theme`, with `app.onChange()` to react |
| `useBlockToken` | `app.getToken()` |
| `useBlocksStyles` | Local — stylesheet injection |
| `useBuzzAccounts` | **No route yet** |
| `useBuzzBalance` | `GET /api/v1/blocks/buzz` |
| `useBuzzPurchase` | `app.host.openBuzzPurchase({ suggestedAmount })` |
| `useBuzzTransactions` | **No route yet** |
| `useBuzzWorkflow` | `/api/v1/blocks/workflows/{estimate,submit,poll,cancel}` |
| `useCheckpointPicker` | `app.host.openResourcePicker({ resourceType: 'Checkpoint' })`; `.persist` → `POST /api/v1/blocks/user-checkpoint/set` |
| `useCivitaiNavigate` | `app.host.navigate(path, { target })` |
| `useCollectionFollow` | `POST /api/v1/blocks/collections/{id}/follow` |
| `useConsentUnavailable` | `app.requestGrants(scopes)` resolves `false` — a refusal is an answer |
| `useCreatePostFromApp` | **Stays on the bridge, by design** |
| `useDailyCompensation` | **Not carried** |
| `useDirectLoad` | `initialize()` rejects when no host answers; see [Embedding](./embedding) |
| `useDomainMaturity` | `app.context` carries `maxBrowsingLevel` |
| `useGatedImages` | `GET /api/v1/blocks/gated-images` |
| `useGenerationResources` | `GET /api/v1/blocks/generation-resources?ids=` |
| `useHostOrigin` | Internal to the SDK now |
| `useImageUpload` | **No replacement yet** — in flight |
| `usePublishGenerationOutputs` | **Stays on the bridge, by design** |
| `useRequestConsent` | `app.requestGrants(scopes)` — returns an awaited `boolean` |
| `useRequestSequencer` | Local — the SDK sequences its own requests |
| `useRequestSignIn` | `app.host.requestSignIn({ returnUrl })` |
| `useResourcePicker` | `app.host.openResourcePicker({ resourceType, baseModelGroup })` |
| `useSaveImage` | `app.host.download({ url, filename })` |
| `useSharedStorage` | `/api/v1/blocks/shared-storage/*` — 11 routes |
| `useTip` | `POST /api/v1/blocks/tip` |
| `useTipAllowance` | `GET /api/v1/blocks/tip-allowance` |
| `useViewer` | `app.viewer`, or `GET /api/v1/blocks/me` |
| `useWildcardPack` | **Not carried** |

::: info `useBlockAnalytics` loses nothing
It emits `TRACK_EVENT`, which has **no host-side sink on either host** — the
events are dropped today. The call sites are already no-ops, so removing the hook
costs you nothing that was working. A no-op shim is a fine way to avoid touching
every call site at once.
:::

### Reading and writing

`app.site` addresses routes by path, so a route the API gains needs no SDK
release:

```ts
import { initialize } from '@civitai/sdk';

const app = await initialize();

// Read
const items = await app.site.get<{ items: unknown[] }>('blocks/shared-storage/list', {
  query: { limit: 50 },
});

// Write
await app.site.post('blocks/shared-storage/append', { value: { hello: 'world' } });
```

Two behaviours worth knowing before you write a caller:

- **Every refusal throws.** There is no path that resolves to mean "could not
  read". If your code must not act on a partial view, branch on the rejection —
  never on an empty result.
- **An expired token is retried once**, with a fresh one, before the error
  surfaces. You do not write that retry.

### Host UI

```ts
import { initialize } from '@civitai/sdk';

const app = await initialize();

const picked = await app.host.openResourcePicker({ resourceType: 'Checkpoint' });
if (picked) {
  console.log(picked.modelName, picked.versionId);
}

const stop = app.host.autoResize(document.body);
```

`openResourcePicker` resolves `null` when the viewer dismisses it — a dismissal
is an answer, not an error.

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

Move the fake to `fetch`. `initialize()` accepts one, so the client under test
never touches the network:

```ts
import { initialize } from '@civitai/sdk';

const fakeFetch: typeof fetch = async (input) =>
  new Response(JSON.stringify({ items: [], nextCursor: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const app = await initialize({ token: 'test-token', fetch: fakeFetch });
```

Then assert on the **requests your app made**, not just the values it rendered —
a fixture that fits on one page cannot see a dropped `cursor` parameter.

`@civitai/sdk/testing` also ships an in-memory `BlockTransport` for the host-UI
calls that genuinely remain on the bridge.

## Known gaps

Document these as gaps; do not design around them yet.

| Gap | State |
|---|---|
| `useImageUpload` / `OPEN_IMAGE_UPLOAD` | No REST twin and no SDK host request. In flight. |
| `usePublishGenerationOutputs` | Same, and staying on the bridge by design. |
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
