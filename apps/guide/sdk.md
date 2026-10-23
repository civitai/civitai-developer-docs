---
title: The @civitai/sdk client
description: What a block does with @civitai/sdk — initialize(), app.onChange, app.host, app.site, app.requestGrants, and app.workflows for generation, with the idempotency key every submit needs.
sources:
  - npm:@civitai/sdk@0.14.1/dist/index.d.ts
  - npm:@civitai/sdk@0.14.1/dist/app/index.d.ts
  - npm:@civitai/sdk@0.14.1/dist/host/index.d.ts
  - npm:@civitai/sdk@0.14.1/dist/workflows/index.d.ts
  - npm:@civitai/sdk@0.14.1#README
  - npm:@civitai/app-sdk@0.71.0/blocks#isValidBlockIdempotencyKey
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
| `app.workflows` | generation for a block, through the host's block workflow routes — see [money calls](#money-calls) |
| `app.storage` | the [document store](./storage): `collection(name)` and `info()` (0.14.0 or later); its `get`/`set`/`delete`/`list`/`getQuota` are the deprecated per-viewer key/value store |
| `app.sharedStorage` | the deprecated cross-viewer key/value store; new apps use a shared collection |
| `app.requestGrants(scopes, opts?)` | asks the viewer for more scopes |
| `app.getToken(opts?)` | the token, for a call this client does not make itself |
| `app.orchestration` | the raw orchestrator — **not** for a block; see [money calls](#money-calls) |

`viewer`, `context`, `settings` and `theme` are getters over a live snapshot:
read them every time you render rather than copying them once.

## Declare every scope you call {#declare-scopes}

The token can only carry scopes your `block.manifest.json` lists in `scopes` —
and the default scaffold ships `"scopes": []`. A call that needs an undeclared
scope does not prompt anyone; it fails:

- a route that requires the scope answers **403**;
- `app.requestGrants` for an undeclared scope resolves **`false`** — the host
  replies that the scope cannot be granted here — so a consent-then-call helper
  quietly does nothing.

Add the scope to `scopes` first, then ask for consent if it is consent-gated.
The calls on this page need:

| Call | Scope to declare | Consent-gated |
|---|---|---|
| `app.site.get('blocks/me')` | `user:read:self` | yes |
| `app.site.get('blocks/gated-images', …)` | none | — |
| `app.workflows` (`estimate`, `submit` and the rest) | `ai:write:budgeted` | yes |

Adding or changing a scope needs a new review once the app is published. The
[scopes reference](../reference/scopes) lists every scope.

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

Each route needs its scope [declared](#declare-scopes) — `blocks/me` needs
`user:read:self`; `blocks/gated-images` needs none.

```ts
const me = await app.site.get('blocks/me'); // declare and grant user:read:self first
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
in the scopes reference. A scope must be [declared in the manifest](#declare-scopes)
before it can be granted at all. Ask before the call that needs it:

```ts
const granted = await app.requestGrants(['ai:write:budgeted'], {
  signal: AbortSignal.timeout(60_000),
});
```

It has **four** outcomes, and the fourth is the one that bites:

| Outcome | When |
|---|---|
| resolves `true` | at once if the token already holds every scope asked for; otherwise when the host re-mints a token that does |
| resolves `false` | the host answers that consent cannot be granted here — including for a scope the manifest does not declare |
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

`Scope` is a typed union, so a misspelt scope fails to compile. Before
`@civitai/sdk` 0.13.0 it does **not** include the goods scopes
(`goods:purchase:self`, `goods:read:self`), `apps:store:items:write` or the
document-store scopes (`apps:storage`, `apps:storage:publish`), so on an older
version asking for one needs a cast: `'goods:purchase:self' as Scope`. (The
sub-listings scope is consent-exempt, so there is nothing to ask for.)

## Money calls

A block generates with **`app.workflows`**, which `@civitai/sdk` has from
`0.12.0`. It goes through the host's `/api/v1/blocks/workflows/*` routes, so
the host prices the work, holds it to the viewer's and the app's budgets, tags
it as this app's and submits it. The block never calls the orchestrator.

| Call | Does |
|---|---|
| `estimate(body)` | Prices the body. Nothing is charged or reserved. It is priced when `status` is not `'failed'` and `cost.total` is a number; that number is the price in whole Buzz. A priced estimate is not `'succeeded'` (see [Pricing an estimate](#pricing-an-estimate)) |
| `submit(body, { idempotencyKey })` | Runs it, spending the viewer's Buzz |
| `get(workflowId)` | The workflow as it stands now |
| `watch(workflowId)` | An async iterator: the workflow now, then each time it changes, until a final status |
| `wait(workflowId)` | The last value of `watch`: the final snapshot, whichever status it is |
| `cancel(workflowId)` | Stops it on the orchestrator and resolves with the workflow as it now stands |
| `list({ cursor?, limit? })` | A page of the workflows this app ran for this viewer, as `{ workflows, cursor }` |

Every body kind goes through the same seven calls, a multi-step
[`kind: 'workflow'`](./workflows#on-civitai-sdk) included. The body and reply
types (`WorkflowBody`, `BlockWorkflowSnapshot` and the rest) are exported from
`@civitai/sdk`.

It needs two things:

- **The block token.** That is the token a block holds by default. A block
  whose manifest declares [`auth: "oauth"`](./porting#auth-field) and is handed
  an OAuth access token is answered `401` on every `app.workflows` call. Such
  a block generates through `app.orchestration` instead, as its own principal
  and without the controls above; a block that wants `app.workflows` does not
  declare `auth: "oauth"`.
- **The `ai:write:budgeted` scope**, [declared](#declare-scopes) in the manifest
  and granted. Undeclared, the `askConsent` call below resolves `false` and
  `generate()` returns `null` without sending anything.

::: danger Not `app.orchestration`
`app.orchestration` calls the orchestrator directly and carries none of those
controls. On the default block token it is refused — before sending when the
viewer is signed in and the host marks the token as a block token, otherwise by
the orchestrator; the hazard is live for a block
holding an OAuth token, where the substitution type-checks and works. See
[Transport models](./concepts#transport-models).
:::

```ts
import type { BlockAppClient, BlockWorkflowSnapshot, WorkflowBody } from '@civitai/sdk';

/**
 * `idempotencyKey` is minted by the caller when the viewer presses the button
 * (`crypto.randomUUID()`), and kept by the caller: if `submit` rejects, the
 * retry of that press calls this again with the SAME key.
 */
async function generate(
  app: BlockAppClient,
  body: WorkflowBody,
  idempotencyKey: string
): Promise<BlockWorkflowSnapshot | null> {
  if (!(await askConsent(app, ['ai:write:budgeted']))) return null; // nothing was sent

  // 1. Price it. Nothing is charged or reserved.
  const estimate = await app.workflows.estimate(body);
  // Priced = not 'failed' AND a numeric cost.total. A priced estimate is NOT
  // 'succeeded' ('pending' in practice), so never require 'succeeded'.
  const price =
    estimate.status !== 'failed' && typeof estimate.cost?.total === 'number'
      ? estimate.cost.total
      : null;
  if (price === null) {
    // A refusal RESOLVES. Log `error`; don't render it.
    console.warn('estimate refused:', estimate.errorCode, estimate.error);
    return null;
  }
  if (!(await confirmSpend(price))) return null;

  // 2. Run it.
  const submitted = await app.workflows.submit(body, { idempotencyKey });
  if (submitted.status === 'failed') {
    // The placeholder id 'failed': the host refused this request before
    // submitting it. A real id: a run was created and came back failed.
    console.warn('submit failed:', submitted.workflowId, submitted.errorCode, submitted.error);
    return submitted;
  }

  // 3. Follow it to a final status, whichever it is.
  return app.workflows.wait(submitted.workflowId);
}
```

The `WorkflowBody` shapes and what each costs are in the
[generation bridge reference](../reference/generation); the multi-step kind is
in [Multi-step workflows](./workflows).

### Pricing an estimate {#pricing-an-estimate}

An estimate is **priced** when its `status` is not `'failed'` **and** it
carries a numeric `cost.total`; that number is the price in whole Buzz, and `0`
is a price. 🔴 **Do not require `'succeeded'`.** Nothing runs on an estimate, so
a priced one comes back with a status that has not finished (`'pending'` in
practice), and a check for `'succeeded'` shows "no price" for every estimate. A
`'failed'` snapshot is never a price, even one carrying a `cost.total`: a budget
refusal carries the total it would not charge. Newer `@civitai/sdk` releases
export this check as `estimatedCost(snapshot)`, which returns the price or
`null`.

### The idempotency key

`submit` spends Buzz, so it requires an `idempotencyKey` and refuses to send
without one. The key is what lets the host recognise a submit that was sent
twice (a retry after a dropped connection, a double press) as one request.

- Mint it **once per thing the viewer asked for**, keep it until that press has
  a known outcome, and send it **unchanged** on every retry. A key minted
  inside a retry loop, or a fresh key for "try again" after an error, protects
  nothing: to the host that is a new generation.
- It must match `^[A-Za-z0-9_-]{1,64}$`, with no colons. `crypto.randomUUID()`
  fits; check a key you compose yourself with `isValidBlockIdempotencyKey` from
  `@civitai/app-sdk/blocks`. The host answers `400` for anything else, and the
  client sends the key exactly as given.
- For a `kind: 'training'` body, or a step body carrying a `quoteId`, the key
  is **not** the run's identity: the confirmed quote or the training run is.
  Those two also need a quote the viewer has confirmed in the host's own
  dialog before they are submitted, and `app.workflows` has no call for that
  confirmation step.

### When `submit` rejects, the outcome is unknown {#submit-rejects}

`generate()` above lets a rejection from `submit` reach its caller. That
rejection has **not** said the run does not exist. The host refuses a bad
request before it submits anything, but the reply does not say whether a
rejection came before or after the orchestrator was called, so treat every
rejected `submit` as unknown: an `ApiError` with a `5xx` or a `409`, and a
request that got no answer at all, each leave a workflow that may exist. Do
one of two things, and never mint a new key for that press:

1. **Retry `submit` with the same `idempotencyKey`** (after a `409`, wait
   first: the earlier attempt is still in flight).
2. **Or look for the run** with `app.workflows.list()` before treating the
   press as failed.

Matching a repeated key to a run the first attempt created is done by the host
and the orchestrator, and it is not guaranteed. `list()` is the check that does
not depend on it.

One rejection is its own class. `SubmissionUnconfirmedError` (exported from
`@civitai/sdk`) means the host could not confirm whether the run was created:
it may be running, and the viewer may have been charged. It is reported for a
`kind: 'training'` body or a step body carrying a `quoteId`. Do not resubmit as
a reflex and do not tell the viewer nothing was spent; look for the run with
`list()` first.

Those are the rules in brief. The package README is the copy to work from when
you write the `catch`: it has the full reasoning, what the host does and does
not promise about matching a repeated key, and a worked example that tracks
whether any attempt for a press ended unknown. Read
[When a submit rejects](https://github.com/civitai/civitai-app-starters/blob/main/packages/civitai-sdk/README.md#when-a-submit-rejects-the-outcome-is-unknown),
[When a submit could not be confirmed](https://github.com/civitai/civitai-app-starters/blob/main/packages/civitai-sdk/README.md#when-a-submit-could-not-be-confirmed)
and
[The idempotency key](https://github.com/civitai/civitai-app-starters/blob/main/packages/civitai-sdk/README.md#the-idempotency-key)
there. The same README ships in the installed package, at
`node_modules/@civitai/sdk/README.md`.

### Reading a refusal

**A refusal resolves; it does not reject.** When the host declines to price
or run a body it answers `200` with a snapshot whose `status` is `'failed'`,
and `estimate`, `submit`, `get`, `wait` and `cancel` all resolve with it. So
branch on `snapshot.status` rather than wrapping the call in `try`. A submit
priced above the token's per-call Buzz budget, or over a per-viewer or per-app
daily cap, is refused this way, with the placeholder `workflowId` `'failed'`
and an `error` that says why.

A `failed` snapshot from `submit` is one of two things, told apart by
`workflowId`:

- **The placeholder id `'failed'`**: the host refused *this request* before
  submitting it, and there is no workflow to follow. On the first attempt for a
  press, that means nothing was charged. It says nothing about an earlier
  attempt for the same press that [ended unknown](#submit-rejects).
- **A real id**: a run was created and came back failed, and Buzz may have been
  spent. Follow it like any other.

`error` is server-authored and unsanitised: log it, and show the viewer copy
your app owns. `errorCode`, when the refusal defines one, is the stable value
to branch on.

A refusal's `cost.total` is what the submit would have **reserved**, which is
not always a price. For text-to-image and training it is the quote. For Comfy
it is the ceiling — a recipe's budget or your `maxBuzz`. For `step` submits it
is the step's declared price or your `maxBuzz`, raised to the quote when that is
higher. A training step refused because it could not be quoted has no `cost` at
all.

An **estimate** with no price quote is not priced at a fallback either. A
`kind: 'workflow'` estimate, or a registered `kind: 'step'` estimate (a body
with a `step` id such as `chat-completion`), comes back as a `failed` snapshot
with no `cost` and an `errorCode` naming the cause: `workflow_quote_*` or
`step_quote_*` (`rejected`, `unavailable` or `unpriced`; only `unavailable` is
worth retrying). What the submit does then depends on the kind. A
`kind: 'workflow'` submit is not refused for that reason and runs reserved at
its ceiling, so a failed workflow estimate does not predict a refused submit.
A registered step's submit needs a quote as well, so with none it fails too,
without a `step_quote_*` code: `submit()` rejects, or resolves `failed` with no
`errorCode`. See
[Multi-step workflows](./workflows#refusals) and
[Estimating a registered step](../reference/generation#registered-step-estimate).

**Buying Buzz does not fix any of those refusals** — they limit the token and
the app, not the wallet. A viewer short of Buzz instead gets a **rejection**: an
`ApiError` with `status` `400` and a `{ message }` body, like any bad request
(`403` for `training`). So decide on a top-up from the balance, not the error:
`app.site.get('blocks/buzz')` (scope `buzz:read:self`, consent-gated) answers
`{ blue, green, yellow }`; compare `blue` plus one paid pool — `green` under an
SFW maturity ceiling, `yellow` under a mature one, SFW if unknown — with the
`app.workflows.estimate()` quote. See also
[Refused submits](./text-to-image#refused-submits).

## Next

- [Using the `<civitai-*>` elements in a block](./elements) — the UI half of the
  default template.
- [Quickstart](./quickstart) — scaffold one and run it.
- [Moving a block off the bridge](./porting) — every `@civitai/blocks-react`
  hook and what replaces it.
- [`@civitai/sdk` on npm](https://www.npmjs.com/package/@civitai/sdk) — the full
  README, including storage, uploads and signing in outside civitai.com.
