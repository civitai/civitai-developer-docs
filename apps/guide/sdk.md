---
title: The @civitai/sdk client
description: What a block does with @civitai/sdk — initialize(), what app.onChange fires on (token rotations included, hence build the view once and update it in place), app.host.autoResize (model slots only), app.site, app.requestGrants and its four outcomes, and the idempotency key every money call needs.
sources:
  - npm:@civitai/sdk@0.10.1/dist/index.d.ts
  - npm:@civitai/sdk@0.10.1/dist/app/index.d.ts
  - npm:@civitai/sdk@0.10.1/dist/host/index.d.ts
  - npm:@civitai/sdk@0.10.1#README
  - npm:@civitai/app-sdk@0.56.1/blocks#isValidBlockIdempotencyKey
  - civitai:src/pages/api/v1/blocks/workflows/submit.ts
---

# The `@civitai/sdk` client

`@civitai/sdk` is the client the default `civitai app init` template is built on.
One object, `app`, carries the host handshake (viewer, slot context, theme), the
host's own UI, and the Civitai REST API as the viewer. It has no UI framework
dependency, so it pairs with the [`<civitai-*>` elements](./elements) or with
anything else.

This page covers what a **block** does with it. The package README documents the
whole surface, including the token-based mode for an app that runs outside
civitai.com; its type declarations are the contract. If you are on React and the
`@civitai/blocks-react` hooks, the [porting guide](./porting) maps each hook to
its `@civitai/sdk` or REST equivalent.

## Starting: `initialize()`

```ts
import { BridgeError, initialize } from '@civitai/sdk';

const app = await initialize({ timeoutMs: 10_000 });
```

Inside a civitai.com page, `initialize()` waits for the host's `BLOCK_INIT` and
resolves with a `BlockAppClient`. If no host answers within `timeoutMs` (10
seconds when you omit it) it **rejects** with a `BridgeError` whose `code` is
`'unavailable'`. Its other options are a `signal` to abandon the wait and a
`transport` to replace the page's bridge (a test passes
`createFakeTransport()` from `@civitai/sdk/testing`), plus `siteUrl`,
`orchestrationUrl` and `fetch` overrides.

A slow host is not a missing one, so retry that one error and let everything
else surface. Until `initialize()` resolves, whatever `index.html` painted is the
viewer's loading state:

```ts
import { BridgeError, initialize, type BlockAppClient } from '@civitai/sdk';

async function waitForHost(): Promise<BlockAppClient> {
  for (;;) {
    try {
      return await initialize();
    } catch (error) {
      // Only "no host answered yet" is worth another wait.
      if (!(error instanceof BridgeError) || error.code !== 'unavailable') throw error;
    }
  }
}
```

::: warning A dropped `BLOCK_INIT` looks exactly like no host
The bridge accepts messages only from allowlisted parent origins — read at build
time from `VITE_BLOCK_ALLOWED_PARENT_ORIGINS` (also `NEXT_PUBLIC_` / `PUBLIC_`),
falling back to the canonical civitai.com origins. An init from any other origin
is dropped silently, so a local harness whose origin is missing from that list
waits forever on `'unavailable'`. The default template's `.env.development`
lists the harness origin for you.
:::

## What `app` holds

| Member | What it is |
|---|---|
| `app.viewer` | `ViewerInfo`, or `null` for an anonymous viewer |
| `app.context` | the slot context, a union keyed on `slotId` — narrow it with `isPageSlotContext` / `isModelSlotContext` from `@civitai/app-sdk/blocks` |
| `app.settings` | the install's publisher settings |
| `app.theme` | the host theme |
| `app.onChange(listener)` | subscribes to changes in any of the above; returns an unsubscribe function |
| `app.host` | the host's own UI: pickers, uploads, sign-in, navigation, sizing |
| `app.site` | the Civitai REST API at `/api/v1`, with the app's token |
| `app.storage` / `app.sharedStorage` | per-viewer and cross-viewer app storage |
| `app.requestGrants(scopes, opts?)` | asks the viewer for more scopes |
| `app.getToken(opts?)` | the token, for a call this client does not make itself |
| `app.orchestration` | the raw orchestrator — **not** for a block; see [money calls](#money-calls) |

`viewer`, `context`, `settings` and `theme` are getters over a live snapshot:
read them every time you render rather than copying them once.

## `app.onChange` — and why you build the view once {#app-onchange-and-why-you-build-the-view-once}

`onChange` fires whenever the snapshot behind those getters changes. Once
`initialize()` has resolved, four host messages change it (a second `BLOCK_INIT`
is ignored):

| Host message | What changed |
|---|---|
| `THEME_CHANGE` | the viewer switched light / dark |
| `ROUTE_CHANGED` | a page app's sub-path moved (`app.context.subPath`) |
| `TOKEN_REFRESH` | the host rotated the token — **nothing on screen changed** |
| `TOKEN_REFRESH_RESPONSE` | the answer to a token request, applied the same way |

Token rotation is the one that shapes your code. It recurs for as long as the
block is open and visible, and it changes nothing a viewer can see. A listener
that rebuilds the view on every call therefore wipes whatever the viewer typed,
on a timer. So build the view **once**, and make the listener write only text and
visibility into the nodes you already have:

```ts
import { initialize, type BlockAppClient } from '@civitai/sdk';
import { isPageSlotContext } from '@civitai/app-sdk/blocks';

const app = await initialize();
const root = document.getElementById('root')!;

const view = document.createElement('div');
const path = document.createElement('code');
view.append(path);
root.replaceChildren(view); // once — this is also what removes a boot skeleton

function fill(app: BlockAppClient): void {
  document.documentElement.dataset.theme = app.theme;
  if (isPageSlotContext(app.context)) path.textContent = `/${app.context.subPath}`;
}

fill(app);
const stop = app.onChange(() => fill(app)); // call stop() to unsubscribe
```

Write host data with `textContent`, never by interpolating it into `innerHTML`:
a model name or a username is user-authored text.

## `app.host.autoResize` — model slots only {#app-host-autoresize-model-slots-only}

```ts
const stop = app.host.autoResize(document.getElementById('root')!);
```

`autoResize(element?)` keeps the frame as tall as `element` (the document body
when omitted) by posting `RESIZE_IFRAME` whenever its height changes, and
returns a function that stops observing. `resize(height)` is the one-shot form.
The host clamps the height to the manifest's `iframe.minHeight` /
`iframe.maxHeight`.

It does something only on a **model slot**. A page app — which is what
`civitai app init` scaffolds — fills the host's content area, and the page host
does not listen for `RESIZE_IFRAME` at all, so the call is inert there. That is
why the page template does not make it. See [Responsive blocks](./responsive) for
how the two surfaces size a block.

## `app.site` — the REST API {#app-site-the-rest-api}

```ts
const me = await app.site.get('blocks/me');
const images = await app.site.get('blocks/gated-images', { query: { ids: '1,2,3' } });
```

Paths are relative to `/api/v1`, so a route the API gains needs no SDK release.
The client has `get(path, opts?)`, `post(path, body?, opts?)` and
`request(method, path, opts?)`; options take a `query`, a `body` and a `signal`.

A `401` is retried once with a fresh token. Any response the server answered with
an error status rejects with an `ApiError` carrying `status` and the parsed
`body`. A request that never reached the server (offline, DNS, CORS) rejects
with the platform's `TypeError` instead, which has no `status` — test
`error instanceof ApiError` before reading one.

Which routes accept the block token is the server's to decide. The
`/api/v1/blocks/*` routes are the ones it was minted for (plus `models/{id}`).
A **public** route outside them, such as `images`, does not refuse a token it cannot use — it
answers **anonymously**, which looks exactly like a successful read as the
viewer — so prefer the `blocks/*` twin of anything viewer-specific. The
[porting guide](./porting#auth-field) covers the rest and the manifest's `auth`
field.

## Consent: `app.requestGrants`

Some scopes are consent-gated — `ai:write:budgeted` and `goods:purchase:self`
among them: the block's token does not carry them until the viewer agrees in the
host's dialog. Which scopes are exempt is listed under
[consent gating](../reference/scopes#what-this-table-can-t-show-the-server-enforces-more)
in the scopes reference. Ask before the call that needs them:

```ts
const granted = await app.requestGrants(['ai:write:budgeted'], {
  signal: AbortSignal.timeout(60_000),
});
```

It has **four** outcomes, and the fourth is the one that bites:

| Outcome | When |
|---|---|
| resolves `true` | at once if the token already holds every scope asked for; otherwise when the host re-mints a token that does |
| resolves `false` | the host answers that consent cannot be granted here |
| never settles | the host sends nothing back — the viewer dismissed the dialog, the app is in a review session, or the host was not ready — so without a `signal` the promise waits forever |
| **rejects** | the `signal` aborted, with the signal's `reason` (an already-aborted signal rejects at once, unless the scopes are already held) |

So pass a `signal`, and treat its rejection as "not granted" rather than letting
it escape a click handler as an unhandled rejection:

```ts
import type { BlockAppClient, Scope } from '@civitai/sdk';

/** `true` only when the viewer now holds `scopes`. A dismissed dialog times out and reads as "no". */
async function askConsent(app: BlockAppClient, scopes: Scope[]): Promise<boolean> {
  try {
    return await app.requestGrants(scopes, { signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return false;
    }
    throw error;
  }
}
```

`Scope` is a typed union, so a misspelt scope fails to compile. In
`@civitai/sdk@0.10.1` it does **not** include the goods scopes
(`goods:purchase:self`, `goods:read:self`), so asking for one needs a cast:
`'goods:purchase:self' as Scope`.

## Money calls

`@civitai/sdk` has no Buzz-workflow helper. A block spends through the
`/api/v1/blocks/*` routes with `app.site`, which apply the per-call Buzz budget,
the daily caps and the app's attribution tag.

::: danger Not `app.orchestration`
`app.orchestration` calls the orchestrator directly and carries none of those
controls. On the default block token it is refused — before sending when the
viewer is signed in and the host marks the token as a block token, otherwise by
the orchestrator; the hazard is live for a block
holding an OAuth token, where the substitution type-checks and works. See
[Transport models](./concepts#transport-models).
:::

Every money call carries an **idempotency key**: one per intent, minted **before**
the first attempt and sent **unchanged** on every retry. A retry with a new key is
a second reservation of the viewer's Buzz. The key must match
`^[A-Za-z0-9_-]{1,64}$` — `crypto.randomUUID()` does; check a key you compose
yourself with `isValidBlockIdempotencyKey` from `@civitai/app-sdk/blocks`.
`POST blocks/workflows/submit` refuses a request without one.

```ts
import type { BlockAppClient } from '@civitai/sdk';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

async function generate(app: BlockAppClient, body: WorkflowBody): Promise<unknown> {
  if (!(await askConsent(app, ['ai:write:budgeted']))) return null; // nothing was sent
  const idempotencyKey = crypto.randomUUID(); // once per generation
  const submit = () =>
    app.site.post<{ snapshot: unknown }>('blocks/workflows/submit', { body, idempotencyKey });
  const { snapshot } = await submit(); // retry with submit() again: same key, one charge
  // A budget or cap refusal is a 200 too: status 'failed', the refused cost.total, workflowId 'failed'.
  if ((snapshot as { status?: string }).status === 'failed') return null;
  return snapshot;
}
```

The `WorkflowBody` shapes, what each costs and how a workflow is followed to its
result are in the [generation bridge reference](../reference/generation). The
per-generation Buzz budget is a ceiling, not an estimate, and a submit priced
above it — or over a daily cap — is refused **without an error**: the route
answers `200` with a snapshot whose `status` is `'failed'`, carrying the
`cost.total` it refused to charge and the placeholder `workflowId: 'failed'`
rather than a real id. Check the snapshot's
`status` before treating a submit as started; that quoted cost is what a
top-up prompt needs.

## Next

- [Using the `<civitai-*>` elements in a block](./elements) — the UI half of the
  default template.
- [Quickstart](./quickstart) — scaffold one and run it.
- [Moving a block off the bridge](./porting) — every `@civitai/blocks-react`
  hook and what replaces it.
- [`@civitai/sdk` on npm](https://www.npmjs.com/package/@civitai/sdk) — the full
  README, including storage, uploads and signing in outside civitai.com.
