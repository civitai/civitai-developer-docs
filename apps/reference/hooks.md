---
title: Hooks reference
description: Every @civitai/blocks-react hook — signature, example and README notes, generated from the published package.
sources:
  - npm:@civitai/blocks-react@0.73.0/dist/index.d.ts
  - npm:@civitai/blocks-react@0.73.0#README
  - npm:@civitai/app-sdk@0.70.0/blocks#WorkflowBody
  - civitai:src/server/schema/blocks/workflow.schema.ts#blockInlineComfyBodySchema
---

# React hooks

`@civitai/blocks-react` is the React-first way to build a Civitai App. Most
hooks wrap a slice of the [message bridge](./messages) so you never touch
`postMessage` directly — you call a hook, get typed state back, and the host
brokers the privileged work. A few call a REST route themselves; the **Trust
model** box below names them.

The signatures below are generated from the published package's type
definitions; the examples, and everything each README section says after its
example, come from its README.

::: info Which transport for what
See [Concepts → Transport models](../guide/concepts#transport-models).

Most hooks on this page are bridge hooks, and most of the data they carry also
has a REST route a block can call with the token it already holds. The
[porting guide](../guide/porting#hook-replacements) maps every hook the package
exports to its route, or says why it stays on the bridge.

This page is generated from `@civitai/blocks-react`'s own type definitions and
README, so it describes each hook as the package ships it. That is a property of
the generator, not a recommendation of one transport over the other.
:::

::: tip Trust model
The hooks fall into three classes, and the credential is the boundary in all of
them.

- **Bridge hooks — most of this page.** The hook posts a message; the host
  resolves the viewer from the block token and performs the privileged call on
  Civitai's side of the iframe boundary, re-checking scopes each time.
- **Direct-fetch hooks — `useTip`, `useTipAllowance`, `useEntitlements`,
  `useGoodPurchase` and `useGenerationResources`.** These are *not*
  host-mediated. The hook calls `fetch()` on a `/api/v1/blocks/*` route at the
  validated host origin, sending the block token your block holds as a bearer.
  The server verifies that token on every request and, where the route declares
  one, checks its required scope (`social:tip:self` for the two tip hooks,
  `goods:purchase:self` and `goods:read:self` for the goods hooks;
  `generation-resources` takes any valid block token). An expired token is a
  401 here, and a mock host that only answers messages never sees these calls.
- **Local hooks.** A few read state the block already has or work entirely
  inside the frame, and call nothing on Civitai.

Calling a block route yourself has the same trust model as the direct-fetch
hooks: your block holds a short-lived scoped credential, and the server
re-checks it and its scopes on every request.
:::

::: warning Not every capability is a hook: generation has five body `kind`s
A search of this page for a hook name will not find everything the platform can
generate. One hook, `useBuzzWorkflow`, takes every kind of generation body, and
**what** it generates is chosen by the `kind` of the body you pass it, not by a
separate hook. Its entry below is generated from the package README, whose
example sends only `kind: 'textToImage'`. The five kinds:

| Body `kind` | What it runs | Read |
|---|---|---|
| `'textToImage'` | An image from a prompt, with LoRAs and source images | [Generating images](../guide/text-to-image) |
| `'customComfy'` | A ComfyUI workflow: a registered recipe, or your own graph | [Comfy on Civitai](../guide/comfy-cloud) |
| `'step'` | One orchestrator step: a registered step id, or any step `$type` passed through | [What the bridge can and cannot do](./generation#what-the-bridge-can-and-cannot-do) |
| `'training'` | A LoRA trained on the viewer's own images | [`WorkflowBodyTraining`](./generation#bridge-WorkflowBodyTraining) |
| `'workflow'` | Up to eight steps as one generation, a later step reading an earlier one's result | [Multi-step workflows](../guide/workflows) |

See [Workflow bodies: the `kind` union](#workflow-bodies-the-kind-union) below
before concluding a capability is missing.
:::

<HooksReference>
<!-- BEGIN GENERATED: hooks — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`useBlockContext`**

```ts
useBlockContext(): UseBlockContext
```

The primary hook. Returns everything the host delivered in `BLOCK_INIT` plus a `ready` gate — fields are sentinel-empty before init, so gate your UI on `ready`.

```tsx
const { ready, context, viewer, theme, settings, blockId, blockInstanceId, appId, token, renderMode } =
  useBlockContext();
```

```md
- `context` — `BlockContext` (`{ slotId, … }`); narrow to `ModelSlotContext` for
  model-page slots. LIVE on a page slot: `context.subPath` starts at the
  `BLOCK_INIT` value and then tracks the host's `ROUTE_CHANGED` push on every
  navigation — see [`useCivitaiRoute()`](#usecivitairoute).
- `viewer` — `ViewerInfo | null` (`null` = anonymous). **Gate sign-in with
  `isSignedIn(viewer)`** (from `@civitai/app-sdk/blocks`), never on
  `viewer.id`/`viewer.username` (both `@deprecated`). Don't open-code the gate:
  the SDK owns which spelling is correct — `signedIn` is optional on the wire
  and is the one viewer field the init validator deliberately does not reject
  when malformed, so `isSignedIn` answers from presence instead. Hover it for
  the full reasoning. Need the identity itself? Use
  [`useViewer()`](#useviewer) — scope-gated and audited per call.
- `theme` — `'light' | 'dark'`. **Set `data-theme={theme}` on your root** (gotcha #60).
  LIVE: it starts at the `BLOCK_INIT` value and then tracks the host's
  `THEME_CHANGE` push when the viewer toggles dark mode mid-session — see
  [`useBlockTheme()`](#useblocktheme).
- `settings` — `{ publisherSettings, userSettings }`.
```

**`useBlockTheme`**

```ts
useBlockTheme(): UseBlockTheme
```

The host's CURRENT site theme, and nothing else. Same value as `useBlockContext().theme` — reach for this when theme is all you need.

```tsx
function ThemedRoot() {
  const theme = useBlockTheme(); // 'light' | 'dark'
  return <div data-theme={theme}>…</div>;
}
```

```md
The viewer can toggle light/dark **while your block is mounted**. The host pushes
a `THEME_CHANGE` message and this hook re-renders. You get that for free as long
as you *read* the theme on every render — a block that copies it into state once
at mount, or writes `data-theme` imperatively in a mount-only effect, will stay
stuck on the old theme.

Against a host that predates `THEME_CHANGE` the value simply never moves (the
old behaviour). Nothing awaits the message, so there is no hang either way.

Exercise it locally: `createMockHost(...).setTheme('light')` (and the same on the
`dev:live` host) pushes the real message.
```

**`useBlockResize`**

```ts
useBlockResize(ref: RefObject<HTMLElement | null>): UseBlockResize
```

Attach to your root element. Observes its height and posts `RESIZE_IFRAME` so the host sizes the iframe to fit. No-op on the inline transport (host DOM reflows naturally).

```tsx
const rootRef = useRef<HTMLDivElement>(null);
useBlockResize(rootRef);
```

```md
**The element may mount on a later render, and that is the normal case** — a
block renders a skeleton until `BLOCK_INIT` lands. The hook keys on the observed
*element*, so you do **not** need to pin the same `ref` to every branch of a
loading/ready conditional to keep the host resizing. Put it on the root you
actually want measured, in whichever branch renders it.

> Also set `iframe.minHeight` in your manifest to the block's *real* rendered
> height — a too-small minHeight makes the iframe seed short and grow-jump on
> `BLOCK_READY` (CLS). Measure it in the dev harness (gotcha #53).
```

**`useBlockBreakpoint`**

```ts
useBlockBreakpoint(ref?: RefObject<HTMLElement | null>): UseBlockBreakpoint
```

Reports the block's **own** width tier, so you can branch on "am I narrow?" without hand-rolling a `ResizeObserver` or hard-coding pixel numbers.

```tsx
const bp = useBlockBreakpoint();
<div style={{ display: 'flex', flexDirection: bp.below('sm') ? 'column' : 'row' }}>
  {bp.atLeast('md') && <aside>…</aside>}
</div>
```

```md
- `tier` — `'base' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'` on civitai's **px** scale
  (480 / 768 / 1024 / 1184 / 1440 — *not* Mantine's em scale, which agrees only
  on `sm`). Tailwind semantics: a tier applies at its breakpoint and above.
  `'base'` is narrower than `xs`, where both a 360px phone and the desktop
  `model.sidebar_top` slot land.
- `atLeast(key)` / `below(key)` — the comparators you actually want at a call site.
- `measured` — `false` until the first measurement lands. An unmeasured width
  resolves to `'base'`, so gate a *structural* narrow branch on
  `measured && below('sm')` if a one-frame swap would be jarring.

> **Container query, not a media query.** It observes an element — by default
> `document.documentElement`, which inside the block's sandbox iframe *is* the
> slot the host gave you. Slot width is not monotonic in viewport width (the
> `model.sidebar_top` slot is ~360px at a 360px viewport and only ~430px at a
> 1440px one), so a `matchMedia` inside the frame answers the wrong question.
> Pass a `ref` to measure a nested container instead.

> **No re-render storm.** A `ResizeObserver` fires on every pixel; this hook
> stores the resolved *tier* and returns a referentially stable object while the
> tier is unchanged, so a 200px drag inside one tier re-renders zero times. That
> is also why the raw width is not returned — it would either cost a render per
> pixel or be stale.
```

**`useBlockToken`**

```ts
useBlockToken(): UseBlockToken
```

Current block-scoped JWT, auto-refreshing ~2 min before expiry. Returns the token fields plus a `refresh()` for the 401-retry path, which **resolves with the new token**.

```tsx
const { raw, scopes, expiresAt, buzzBudget, refresh } = useBlockToken();

let res = await fetch(url, { headers: { Authorization: `Bearer ${raw}` } });
if (res.status === 401) {
  const fresh = await refresh();   // resolves WITH the new token
  res = await fetch(url, { headers: { Authorization: `Bearer ${fresh.raw}` } });
}
```

```md
> **Retry with the resolved token, not the `raw` you destructured.** That `raw` is
> a `const` from the render closure that ran *before* the refresh — awaiting
> `refresh()` re-renders the component but cannot reassign the binding your
> in-flight callback is already holding. A retry that re-reads the outer `raw`
> re-sends the stale JWT and 401s for exactly the reason the first call did.
```

**`useHostOrigin`**

```ts
useHostOrigin(): UseHostOrigin
```

The validated host origin to direct-fetch the App Blocks HTTP API against — `undefined` until init. Use it as the base URL when you need to bypass the host bridge, always paired with the bearer token from `useBlockToken()`.

```tsx
const host = useHostOrigin();          // e.g. "https://civitai.com" (undefined until BLOCK_INIT)
const { raw } = useBlockToken();
// Once `host` is set, fetch the API on that validated origin with the block token:
if (host) {
  const res = await fetch(`${host}/api/v1/blocks/me`, {
    headers: { authorization: `Bearer ${raw}` },
  });
}
```

```md
> **Security:** this is ONLY ever the origin that passed the SDK's origin
> allowlist (the same gate `BLOCK_INIT` passes) — never `document.referrer` or
> `window.location` of the parent. The block token is a money-scoped bearer
> credential, so always send it to *this* origin. Never derive the API host
> from a spoofable browser signal.
```

**`useBlockSettings`**

```ts
useBlockSettings(): UseBlockSettings
```

Shorthand for `useBlockContext().settings`. Read-only from the iframe — there is no general "set settings" bridge message. Writing them is platform-side, in the settings panel reached from the **Manage** control on an installed app. The one setting a block can write itself is the viewer's checkpoint, via the `SET_USER_CHECKPOINT` message (see `useCheckpointPicker`).

```tsx
const { publisherSettings, userSettings } = useBlockSettings();
```

**`useBuzzWorkflow`**

```ts
useBuzzWorkflow(): UseBuzzWorkflow
```

The generation flow: `estimate` → `submit` → `poll`, host-mediated. Returns `{ estimate, submit, poll, status, result, error }`.

```tsx
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

const { estimate, submit, poll, status, result } = useBuzzWorkflow();
declare const modelId: number, modelVersionId: number, userPrompt: string;

const body: WorkflowBody = {
  kind: 'textToImage',
  modelId,
  modelVersionId,
  params: { prompt: userPrompt },
};
// The viewer-facing copy is a string YOUR APP owns, chosen by `err.code`.
// Nothing on the error may be rendered: `err.message` is developer-facing and
// its wording is not a contract; `err.snapshot.error` is server-authored and
// unsanitised.
const estimateFailureMessage = (err: WorkflowEstimateError) =>
  err.code === 'no-cost'
    ? 'We could not get a price for this configuration. Try adjusting it.'
    : 'Pricing is unavailable right now. Please try again shortly.';

// 🔴 estimate() REJECTS when the reply carries no usable price. ALWAYS catch it.
let priced = false;
try {
  await estimate(body);          // status 'estimating' → 'confirming' (cost in result.cost.total)
  priced = true;
} catch (err) {
  if (!(err instanceof WorkflowEstimateError)) throw err;
  // status is now 'error'. Log both for the developer; render neither.
  logForDebugging(err.message, err.snapshot.error);
  showError(estimateFailureMessage(err));
}
if (priced) {
  // 🔴 submit() REJECTS when the reply carries no usable workflow outcome. A
  // priced refusal is different — it RESOLVES.
  try {
    const snap = await submit(body); // status 'submitting' → 'polling'
    if (snap.status === 'failed') {
      // 🔴 A RESOLVED `failed` IS A SERVER OUTCOME, NEVER A TOP-UP CUE: a spend
      // cap or limit buying Buzz does not raise, or a run that may already have
      // spent. The complete list is on `useBuzzWorkflow`'s `submit` docs.
      // Running OUT of Buzz rejects instead — see the catch below.
      showError(submitOutcomeMessage(snap)); // YOUR app owns this copy
    } else {
      await poll(snap.workflowId);   // you loop this on a backoff until terminal
    }
  } catch (err) {
    if (!(err instanceof WorkflowSubmitError)) throw err;
    // Log both for the developer; render neither.
    logForDebugging(err.message, err.snapshot.error);
    // 🔴 TWO SEPARATE QUESTIONS — DO NOT CONJOIN THEM. `code` decides what you may
    // say about MONEY; the id decides only whether there is something to POLL.
    // Folding the id test into the `code` test sends a 'workflow-failed' reply
    // whose id is 'whatif' into the reassuring arm — the exact blind-retry
    // invitation this whole guard exists to remove.
    if (err.code === 'workflow-failed') {
      // 🔴 Spend MAY ALREADY BE COMMITTED. Do not tell the viewer it was free,
      // and do not retry blindly — a retry mints a fresh idempotency key, i.e. a
      // SECOND reservation.
      showError('The generation may have started but did not complete. Check your history.');
      // Only NOW ask about pollability: 'whatif' is a non-workflow sentinel.
      if (err.snapshot.workflowId !== 'whatif') await poll(err.snapshot.workflowId);
    } else {
      // 🔴 'exception' means the host had no workflow to report — USUALLY nothing
      // was queued, but a lost response or an in-progress idempotency conflict
      // reaches this arm too. Retry with the SAME idempotencyKey, not a fresh one.
      showError('Could not start the generation. Please try again.');
    }
  }
}
```

````md
**Status semantics** (gotcha #8/#9/#10):

- `status === 'confirming'` is **IDLE** (estimate landed, user reviewing the
  cost) — keep the Generate button enabled. Only `estimating | submitting |
  polling` are busy.
- `result` is populated after `estimate()` too — don't treat a non-null `result`
  as "something is queued."
- The hook does **not** auto-poll. After `submit` flips status to `'polling'`,
  the **caller** runs a `useEffect` that calls `poll(workflowId)` on a backoff
  until the snapshot is terminal (`succeeded | failed | canceled | expired`).
- A **priced** submit refusal comes back as a **resolved** snapshot with
  `status: 'failed'`, an `error` string, **and a numeric `cost.total`** — the
  price the server refused to charge. That is a workflow *outcome*, not an error.
  Check `snap.status`, not just `try/catch`.
  🔴 **None of them is a top-up cue.** Each is a spend cap or limit that buying
  Buzz does not raise — the per-call `buzzBudget` and the viewer's daily cap
  included — or a reply that may already have spent. The complete list, and
  which of them may say "nothing was charged", is in `useBuzzWorkflow`'s
  `submit` docs. A viewer who is genuinely **out of Buzz** makes `submit`
  **reject** (`WorkflowSubmitError` code `'exception'`, shared with other
  thrown submits): decide a top-up from `useBuzzBalance()` — blue plus the
  block's domain pool, never all three — against the quoted cost.
- **`submit` REJECTS when the reply carries no usable workflow outcome**
  (`@civitai/blocks-react@0.44.0+`). Every failure-shaped reply reports
  `status: 'failed'`, so `status` cannot tell them apart — **`cost` presence
  decides resolve-vs-reject, and `workflowId` decides which rejection**:
  - **priced refusal** → carries `cost`. **Resolves**, as above.
  - **a reply the host built itself** (`failureSnapshot(err)`, which stamps the
    literal `workflowId: 'failed'` — from a `catch` or a short-circuit such as
    the moderator-review nack) → no `cost`. **Rejects** with
    `err.code === 'exception'`, which means *the host had no workflow to report*.
    🔴 **Not the same as "nothing happened."** Usually nothing was queued or
    charged and a retry is fine, but a **lost response**, an **in-progress
    idempotency conflict**, or a **transient 5xx/408/429/401** also land here,
    and a workflow may have been created and charged. Prefer reusing the same
    `idempotencyKey` on retry, and don't render "nothing was charged" as fact.
  - **a failed, unpriced reply whose id is NOT that sentinel** (normally a
    genuine orchestrator id) → no `cost`. **Rejects** with
    `err.code === 'workflow-failed'`.
    🔴 **Money may already be committed.** Server-side, *any* resolved submit
    keeps its Buzz reservation "regardless of snapshot status", with no refund on
    a non-throwing failed snapshot. So do not tell the viewer it was free, and do
    not retry blindly — `submit()` mints a fresh `idempotencyKey` per call, so an
    automatic retry is a second reservation. Read `err.snapshot.workflowId` (a
    usually-pollable id) and `watch`/`poll` it to learn the workflow's actual
    fate — guarding with `err.snapshot.workflowId !== 'whatif'` first, since the
    server treats both `'failed'` and `'whatif'` as non-workflow sentinels.

  Before that version everything resolved, so a block branching on
  `snap.status === 'failed'` could not tell "you can't afford this" from "the
  request failed", and one gating a money control on
  `typeof snap.cost?.total === 'number'` saw the same dead-control shape
  civitai/civitai#4159 describes. An ordinary in-flight reply
  (`{ status: 'pending' }`) is cost-less too and still resolves — and so are
  cost-less `succeeded` / `canceled` / `expired` replies. Only a *failure-shaped*
  reply with no price rejects. `err.message` is a generic developer-facing
  constant that makes **no claim about money** (the two codes differ on that) and
  the server's words stay on `err.snapshot.error`, exactly as on
  `WorkflowEstimateError` below. Note this also fires in **moderator review
  preview**. To exercise your `catch` locally, set the mock host's
  `generation.failSubmitException: true`.
- **`estimate` follows the same rule for a different question** (`@civitai/blocks-react@0.43.0+`).
  It **rejects** with a `WorkflowEstimateError` when the reply carries no usable
  price, rather than resolving a snapshot with no `cost`. Two things produce
  that, and `err.code` tells them apart: `'failed'` (the estimate errored
  server-side) and `'no-cost'` (an otherwise-successful reply that simply has no
  price).
  Before that version both cases resolved, so a block that correctly gates
  Confirm on `typeof cost === 'number'` rendered a dialog it could never confirm
  ("Cost unavailable") and the server's reason was discarded — civitai/civitai#4159.
  Note this also fires in **moderator review preview**, where the host answers
  every workflow request with `'not available in review preview'`: without a
  `catch`, a reviewer's first click becomes an unhandled rejection.
  To exercise your `catch` locally, set the mock host's
  `generation.failEstimate: 'failed' | 'no-cost'`.
- **Three fields, three audiences — and none of them is viewer-facing copy.**
  The string a viewer sees is one **your app owns**; nothing on this error may
  be rendered as-is.
  - `err.code` (`'failed' | 'no-cost'`) — **the branch target**, and the only
    stable one. Switch on it to pick your own localised message.
  - `err.snapshot.error` — **the diagnostic read**, and recovering it is the
    whole point of the fix. **Server-authored and unsanitised** (raw upstream
    text, including database constraint names, can reach it): log it or show it
    in a developer-facing surface, and **never render it verbatim into markup**.
  - `err.message` — **developer-facing**. A generic constant naming only the code
    (`estimate did not return a usable price (no-cost) — reason on .snapshot.error`),
    because `message` is what an uncaught rejection prints and what an error
    reporter ships by default. Safe to log and to let a stack trace print;
    **not intended for display to viewers** — it names an internal field path,
    it is not localised, and **its exact wording is not a contract**, so a UI
    built on it silently rots. Two apps migrating to `0.43.0` piped it into
    rendered UI and would have shipped that sentence to end users.
- A cost of **`0` is a real price**, not a missing one (the orchestrator whatif
  prices a cache hit at 0). `estimate` resolves it; only a non-numeric
  `cost.total` rejects.

#### Showing the app fee: `cost.authorFee`

`cost.total` is what the viewer pays and **already includes the app author's
per-generation fee**. `cost.authorFee` is that fee on its own, in whole Buzz, so
`total - authorFee` is the generation's price. It is display only.

```tsx
import type { BlockWorkflowSnapshot, WorkflowBody } from '@civitai/app-sdk/blocks';

const { estimate } = useBuzzWorkflow();
declare const body: WorkflowBody;

function priceLine(cost: NonNullable<BlockWorkflowSnapshot['cost']>): string {
  // Absent = not itemised. Show the total alone; do NOT treat it as a 0 fee.
  if (cost.authorFee === undefined) return `${cost.total} Buzz`;
  // 0 = a fee was looked up and none applies to this request.
  if (cost.authorFee === 0) return `${cost.total} Buzz (no app fee)`;
  const generation = cost.total - cost.authorFee;
  return `${cost.total} Buzz (generation ${generation} + app fee ${cost.authorFee})`;
}

const quote = await estimate(body); // rejects without a usable price — see above
if (quote.cost) showPrice(priceLine(quote.cost));
```

| `cost.authorFee` | Means | Where |
|---|---|---|
| a number `> 0` | that much of `total` is the app fee | `estimate()` for a `textToImage`, registered-`step` or `workflow` body (one fee for the whole workflow), and the refusal `submit()` resolves for those kinds when a budget, spend cap or rate limit refuses the quoted price |
| `0` | a fee was looked up and none applies to this request | the same replies |
| absent | the total is **not itemised** | a host that predates the field; every snapshot of a submitted workflow (`submit` success, `poll`, `cancel`), whose `total` is the generation's realized cost with the fee charged separately; the registered-`step` `submit()` refusal for a missing orchestrator price quote, which refuses before any fee is looked up; and `customComfy`, pass-through `step` and `training` quotes, which price no fee |

- **Against an older host the field is simply absent.** Nothing else changes:
  `total` has the same value with or without it, so an app that never reads
  `authorFee` is unaffected.
- **Test all three locally** with the mock host's `generation.authorFee`
  (`createMockHost({ generation: { costPerGen: 40, authorFee: 5 } })`, or
  `?authorFee=5` in the dev harness): a number itemises it, the default `0`
  reports `authorFee: 0`, and `authorFee: false` (`?authorFee=off`) leaves it
  out, as an older host does.

#### Why a training step could not be priced: `snapshot.errorCode`

A pass-through `step` body whose `$type` is a training type (`'training'` or
`'imageResourceTraining'`) needs a price quote; when the host cannot get one it
refuses with `{ workflowId: 'failed', status: 'failed', error, errorCode }` and
no `cost`. `estimate()` rejects with a `WorkflowEstimateError` and `submit()`
with a `WorkflowSubmitError` (before anything is reserved), and a batch
estimate returns it as that body's cell. `errorCode` is the stable value to
branch on; `error` stays the diagnostic read.

```tsx
import { useBuzzWorkflow, WorkflowEstimateError } from '@civitai/blocks-react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

const { estimate } = useBuzzWorkflow();
declare const body: WorkflowBody;

try {
  await estimate(body);
} catch (err) {
  if (!(err instanceof WorkflowEstimateError)) throw err;
  switch (err.snapshot.errorCode) {
    case 'training-quote-rejected': // the request itself was refused — change it
      showError('These training settings were refused. Check them and try again.');
      break;
    case 'training-quote-unavailable': // no answer right now — retrying may work
    case 'training-quote-unpriced': // answered without a price
      showError('Training cannot be priced right now. Try again shortly.');
      break;
    default: // no code, or one a later host added
      showError('Could not get a price.');
  }
}
```

| `errorCode` | Means |
|---|---|
| `'training-quote-rejected'` | the orchestrator refused the request itself; resending the same body will not help. `error` reads `Training could not be priced: <reason>` when the reason is safe to show |
| `'training-quote-unavailable'` | no usable answer (an outage, a timeout, a rate limit, insufficient funds, …); a retry may succeed |
| `'training-quote-unpriced'` | the orchestrator answered without a price |
| `'daily-limit-exceeded'` | a viewer-confirmed job (a training run or a [confirmed step](#userunconfirmedstep--one-job-above-the-per-call-budget)) would exceed what remains today of the daily Buzz limit **the viewer** set for this app. Nothing was charged, no job started, and only the viewer can raise the limit. Arrives on a confirmed submit's failed snapshot, never on an estimate; `useRunConfirmedStep()` surfaces it as `err.dailyLimitExceeded` |
| absent | any other reply, and every reply from a host that predates the field |

- **Treat an unknown value as possible.** The field is typed as an open string
  (`KnownBlockWorkflowErrorCode | (string & {})`), the host may add codes, and
  the inbound validator accepts any string. Keep a `default` branch.
- A `kind: 'training'` **estimate** does not set it; the three `training-quote-*`
  codes belong to the pass-through arm.
- A refused `kind: 'workflow'` body sets its own codes, in the same shape — see
  the next section.

#### A registered step with no price quote: `step_quote_*`

A **registered** `kind: 'step'` body (one with a `step` id, such as
`'chat-completion'` or `'convert-image'`) that the host has no price quote for
fails on `estimate()` (`WorkflowEstimateError`) and as a batch-estimate cell,
as `{ workflowId: 'failed', status: 'failed', error, errorCode }` with no
`cost`. `submit()` of the same body is unchanged. The pass-through arm (a
`$type`, no `step`) does not set these codes.

| `errorCode` | Means | `error` | Retry the same body? |
|---|---|---|---|
| `'step_quote_rejected'` | the orchestrator refused the request | `No price quote for this step: the orchestrator rejected the request: <reason>` when the reason is safe to show, else `No price quote for this step: the orchestrator rejected the request; check the step inputs and references (retrying the same body will not help)` | no — change the body |
| `'step_quote_unavailable'` | no usable answer (an outage, a timeout, a rate limit, …) | `No price quote for this step: none could be obtained; try again` | yes |
| `'step_quote_unpriced'` | the orchestrator answered without a price | `No price quote for this step: the orchestrator answered without one` | not expected to help |

An older host has none of the three: it resolves the estimate priced at the
step's declared estimate. The mock host always quotes a registered step (at
`generation.costPerGen`), so it never sends these codes.

#### Several steps as one workflow: `kind: 'workflow'`

A `kind: 'workflow'` body submits **several orchestrator steps as one
workflow**, where a later step can consume an earlier step's result. It goes
through the hooks you already use: `useBuzzWorkflow().estimate / submit /
watch / cancel`, a `useBatchEstimate()` cell, and `useWorkflowBatch()`. There
is no new hook and no new message.

```tsx
import { useBuzzWorkflow } from '@civitai/blocks-react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

const { estimate, submit, watch } = useBuzzWorkflow();

// Step 1 draws an image; step 2 removes the background from step 1's result.
const body: WorkflowBody = {
  kind: 'workflow',
  arguments: { prompt: 'a lighthouse at dusk' },
  steps: [
    {
      name: 'draw',
      $type: 'imageGen',
      input: {
        engine: 'google',
        model: 'nano-banana-2',
        // Read from `arguments` above.
        prompt: { $ref: '$arguments', path: 'prompt' },
      },
      // An intermediate step: its image is not surfaced.
      suppressOutput: true,
    },
    {
      name: 'cutout',
      $type: 'imageBackgroundRemoval',
      // Read from the EARLIER step named `draw`.
      input: { image: { $ref: 'draw', path: 'output.images[0].url' } },
    },
  ],
};

const quote = await estimate(body);
showPrice(`About ${quote.cost?.total} Buzz`); // an estimate, not a maximum

const submitted = await submit(body);
const done = await watch(submitted.workflowId);

for (const step of done.steps ?? []) {
  if (step.status === 'failed') showError(`${step.name} failed`);
}
// Even when `done.status === 'failed'`, earlier steps may have left images.
showImages(done.imageUrls ?? []);
```

**The body**

- `steps`: 1 to 8 (`BLOCK_WORKFLOW_MAX_STEPS`). Each is `{ name?, $type, input,
  suppressOutput? }`, where `$type` is an orchestrator step type and `input` is
  that step's own input.
- **A step `name`** is optional. It is a lowercase letter followed by up to 31
  of `a-z`, `0-9`, `_` or `-`, unique within the body, and not `block-step`
  (reserved). A step you do not name is named by its position: `$0`, `$1`, ….
- **A reference** is `{ $ref, path, default?, format? }` and may stand in for
  any value in `input`, at any depth. `$ref` is `'$arguments'`, the `name` of an
  **earlier** step, or — for an earlier step you did not name — its position
  (`'$0'` is the first step). A step can never reference itself or a later
  step. An object is a reference only when it has both `$ref` and `path` and no
  other key but `default` / `format`.
- **Limits**: 64 references per body, inputs nested at most 32 levels, `repeat`
  templates nested at most 4 deep, a `$type` of at most 64 characters, and 256
  KB (262144 bytes) for every step's `input` plus `arguments` together. An
  unknown key on the body or on a step is rejected. The app's velocity limit
  counts one unit per step, and a `repeat` step one per iteration instead.
- `suppressOutput: true` marks an intermediate step. Its images are left out of
  `snapshot.imageUrls` and out of its own `steps[i].imageUrls`. It still runs
  and is still charged.
- There is **no `maxBuzz`**. The spend ceiling is the app's per-generation
  budget × the number of steps, enforced by the host.
- Any orchestrator `$type` is accepted except the platform-internal ones:
  scanners, moderation classifiers, hashing, web scrape/search, and the retired
  `textToImage` step type.
- **`repeat` over `arguments` only, at most 16 iterations**
  (`BLOCK_WORKFLOW_REPEAT_MAX_ITERATIONS`, nested repeats multiplied). Its input
  is exactly `{ for: { $ref: '$arguments', path, as }, template: { $type,
  name?, input? } }`, where `path` names an array in `arguments`. Inside the
  template, `as` is a source a reference may name; it may not equal a step
  name. The template's `$type` is held to the denylist too. A `repeat` over
  another step's output is refused, because its length is unknown until that
  step has run. The single-step pass-through `kind: 'step'` arm refuses
  `repeat` outright.
- **`merge`**: every entry of `input.fields` needs a string `$ref` (`$arguments`
  or an earlier step, never a repeat variable) and a `reduce`; each counts
  toward the 64-reference limit.
- `WithWorkflowStepRefs<T>` (from `@civitai/app-sdk/blocks`) types an input you
  already have a type for while still allowing references in it.

**🔴 Three things about the price**

1. **The estimate is not a maximum.** When a step reads from an earlier step,
   the orchestrator re-prices it once those values are known and charges the
   difference. Never show the estimate as "you will pay at most".
2. **A workflow the host cannot price has no estimate, but its submit still
   proceeds.** `estimate()` rejects with a `workflow_quote_*` `errorCode` and
   no `cost` (see the second table under Refusals), and a batch estimate
   returns that as the cell. `submit()` of the same body is **not** refused: it
   reserves the ceiling above instead of a quote. So a failed estimate does not
   predict a refused submit. Two exceptions are refused on both, before any
   reservation: a workflow with a training step (a `training-quote-*`
   `errorCode`, as on the single-step arm), and a workflow with a `repeat` step
   at any depth (`workflow_repeat_unbounded`). Their `error` states why there
   is no quote, and only `none could be obtained; try again` is a cause a retry
   of the same body can clear; for the others the body has to change.
   An older host returns the ceiling as the estimate's `cost.total` instead of
   failing, so there a total equal to the ceiling may be unpriced.
3. **One author fee per workflow**, not one per step, on the quoted base. The
   estimate's `cost.authorFee` is that single fee, already inside `cost.total`.
   If the workflow bills more than the quote, the fee charged is held to the
   fee shown. A workflow that does not succeed has its **whole** fee reversed,
   even if earlier steps delivered output.

**The result**

`snapshot.steps` lists every step in order, as `{ name, $type, status,
imageUrls?, output?, error? }`. Read it from `poll()`, `watch()` and
`cancel()`; do not rely on it being on the `submit()` reply. The steps a
`repeat` step generates follow it, named `<repeat name>.<n>`. The top-level
fields keep their meaning: `status` and `cost` are the whole workflow's, and
`imageUrls` is the union of the steps that did not set `suppressOutput`.

🔴 **A `failed` workflow is not an empty one.** Steps that succeeded before the
failing step stay charged and keep their results, so a snapshot with `status:
'failed'` can carry `cost.total > 0` and usable `imageUrls`. Show what did
finish, and do not tell the viewer nothing was charged — though the app fee is
reversed for any workflow that does not succeed.

**Refusals**

A body the host will not run is refused before anything is priced or reserved:
`estimate()` rejects with `WorkflowEstimateError`, `submit()` with
`WorkflowSubmitError`, and a batch estimate returns it as that cell. Branch on
`err.snapshot.errorCode`:

| `errorCode` | Means |
|---|---|
| `'workflow_too_many_steps'` | more than 8 steps |
| `'workflow_step_denied'` | a step names a platform-internal `$type` |
| `'workflow_ref_invalid'` | a reference points at the step itself, a later step, or nothing; a step name breaks the rules above; a `repeat` or `merge` is malformed; or a repeat `as` name is also a step name |
| `'workflow_repeat_unbounded'` | a `repeat` iterates something other than an array in `arguments`, or more than 16 times (nested repeats multiplied); or the workflow has a `repeat` and the host has no price quote for it. `error` then reads `workflow step N: a workflow with a repeat needs a price quote and <cause>`; a retry of the same body can work only when `<cause>` is `none could be obtained; try again` |

A body the host WOULD run, but has no price quote for, fails on `estimate()`
and as a batch-estimate cell only, with no `cost`. `submit()` of the same body
still proceeds (point 2 above):

| `errorCode` | Means | `error` | Retry the same body? |
|---|---|---|---|
| `'workflow_quote_rejected'` | the orchestrator refused the body | `No price quote for this workflow: the orchestrator rejected the request: <reason>` when the reason is safe to show, else `No price quote for this workflow: the orchestrator rejected the request; check the step inputs and references (retrying the same body will not help)` | no — change the body |
| `'workflow_quote_unavailable'` | no usable answer (an outage, a timeout, a rate limit, …) | `No price quote for this workflow: none could be obtained; try again` | yes |
| `'workflow_quote_unpriced'` | the orchestrator answered without a price | `No price quote for this workflow: the orchestrator answered without one` | not expected to help |

An older host has none of the three: it resolves the estimate with the ceiling
as `cost.total`.

- **Requires a host that knows the kind.** An older host refuses the body.
- **Test it locally.** The mock host prices each step with
  `generation.costPerGen` (a function gets the step as its second argument) and
  multiplies it by a `repeat` step's iteration count, then adds
  `generation.authorFee` once; refuses with the four codes of the first table,
  in the host's order; reports
  `steps` on every poll, finishing them in order; and
  `generation.failWorkflowStep: '<name>'` (`'$<index>'` for an unnamed step)
  makes one step fail, so you can render a partial failure. The mock checks
  where a reference points, not whether its `path` exists; it never re-prices;
  and it does not expand a `repeat` step into generated `<name>.<n>` steps. It
  quotes every workflow unless you set `generation.workflowUnpriced` to
  `'rejected'`, `'unavailable'` or `'unpriced'` (`true` means `'unavailable'`),
  which simulates no quote for that cause: a workflow with a training step or a
  `repeat` is refused on both `estimate()` and `submit()`; any other fails its
  `estimate()` with `workflow_quote_<cause>` and no `cost`, while its
  `submit()` is reserved at `buzzBudget` × steps with no fee. The mock has no
  orchestrator reason to pass on, so `'rejected'` always gives the reason-less
  message, never the `…rejected the request: <reason>` form.

> **Estimate must mirror submit** (gotcha #59): build the params for `estimate`
> with the *exact* same logic as `submit` — same seed decision especially. The
> orchestrator whatif prices a cache hit (identical workflow) at 0 and a fresh
> job at full cost, and the seed decides which. A drifting estimate silently
> mis-quotes. See the `buzz-workflow` example.

> **cancel** — `@civitai/blocks-react@0.5.0+` adds `useBuzzWorkflow().cancel(workflowId)`
> for a real server-side orchestrator cancel (gotcha #51), so a running workflow
> stops spending Buzz. Before that, cancel was client-side only (stop polling). If
> your installed version predates 0.5.0, do the client-side half and add the
> `cancel(...)` call after upgrading.
````

**`useBatchEstimate`**

```ts
useBatchEstimate(): UseBatchEstimate
```

```md
Price a grid of generations in one request. `estimateBatch(bodies)` takes a list
of workflow bodies, each exactly what `useBuzzWorkflow().estimate()` takes, and
resolves with one cell per body, in order, plus the run total. Returns
`{ estimateBatch, pending, result, error }`.

- **One request against the estimate allowance** however many cells it carries.
  On a page app that allowance is shared by every viewer of the app and by the
  host's other reads for it, so a 16-cell grid priced cell by cell used 16 of it.
- **At most 16 bodies per call** (`BATCH_ESTIMATE_MAX_CELLS`). Price a larger grid
  in several calls.
- **Cells are metered too**, against an allowance of their own that is shared
  the same way (on a page app, by every viewer of the app), so a batch is not a
  way around the estimate allowance. A call over either limit is refused whole:
  it rejects with `BatchEstimateError` code `'failed'`. Retry in a few seconds.
- **Every rule of a single estimate applies to each cell.** A cell that one
  `estimate()` would reject comes back as `ok: false` with the same
  `WorkflowEstimateError`, and the other cells still price.
- **`kind: 'training'` bodies are refused per cell.** Estimate a training run
  with `useBuzzWorkflow().estimate()`.
- **A cell never carries a `stepQuote`.** A batch stores nothing, so a
  pass-through step priced above the per-call budget comes back with its cost and
  no confirmable quote. To run it with
  [`useRunConfirmedStep()`](#userunconfirmedstep--one-job-above-the-per-call-budget),
  estimate that one body with `useBuzzWorkflow().estimate()`.
- **Estimate only.** Nothing is submitted and no Buzz is held or spent. There is
  no batch submit. Submit each cell with
  `useBuzzWorkflow().submit()`, which asks the viewer and checks the budget per
  cell. `aggregate.total` is a quote, not a lock: each cell is priced again when
  it is submitted. To follow the submitted cells and cancel them together, see
  [`useWorkflowBatch()`](#useworkflowbatch).

`aggregate.total` sums the cells that priced. It covers the whole grid only when
`aggregate.pricedCells === aggregate.cellCount`; otherwise show it as a partial
total.

**The host bounds the time one call takes.** If its budget runs out, the call
still resolves: the cells that priced are returned, and every other cell is
`ok: false` with `timedOut: true`. Show those cells as unavailable and let the
viewer retry later. Branch on `timedOut`, not on `snapshot.error`: the host's
wording is not a contract.

`estimateBatch` rejects with `BatchEstimateError` only when the whole call
failed. Branch on `err.code`:

| `code` | Meaning | What to do |
|---|---|---|
| `'unsupported'` | The host answered `unsupported on this host`. | Price each cell with `estimate()`. |
| `'timeout'` | No reply in time. A host that supports the batch replies within its own time budget, well inside the default wait, so this usually means a slow host, not an old one. | Show the estimate as unavailable and retry later. **Do not** fall back to one `estimate()` per cell: that sends up to 16 more estimates at a host that is already slow. |
| `'invalid-request'` | Empty list, or more than 16 bodies. Refused before sending. | Fix the list. |
| `'failed'` | Any other whole-call refusal: the scope, a rate limit, review preview. The reason is on `err.hostError`; log it, don't render it. | Show your own copy and retry later. |

A 2 × 2 grid (two prompts × two checkpoints), falling back to per-cell estimates
only on a host that answers `'unsupported'`:
```

```tsx
import { useState } from 'react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';
import {
  BatchEstimateError,
  useBatchEstimate,
  useBuzzWorkflow,
  WorkflowEstimateError,
} from '@civitai/blocks-react';

const PROMPTS = ['a lighthouse at dusk', 'a lighthouse in fog'];
const CHECKPOINTS = [
  { modelId: 101, modelVersionId: 1001 },
  { modelId: 202, modelVersionId: 2002 },
];

/** One cell's quote: a price, or why it has none. */
type CellQuote = { total: number } | { unavailable: string };

export function GridQuote() {
  const { estimateBatch } = useBatchEstimate();
  const { estimate } = useBuzzWorkflow();
  const [quotes, setQuotes] = useState<CellQuote[]>([]);
  const [runTotal, setRunTotal] = useState<number | null>(null);

  const bodies: WorkflowBody[] = PROMPTS.flatMap((prompt) =>
    CHECKPOINTS.map((cp) => ({ kind: 'textToImage' as const, ...cp, params: { prompt } })),
  );

  // Your copy, chosen by `code` (and, for a batch cell, `timedOut`). Never
  // render or match `err.message` or `snapshot.error`.
  const why = (err: WorkflowEstimateError, timedOut = false) =>
    timedOut
      ? 'Price not ready, try again shortly'
      : err.code === 'no-cost'
        ? 'No price for this cell'
        : 'This cell cannot run';

  async function priceGrid() {
    try {
      const { cells, aggregate } = await estimateBatch(bodies);
      setQuotes(
        cells.map((c) => (c.ok ? { total: c.cost.total } : { unavailable: why(c.error, c.timedOut) })),
      );
      setRunTotal(aggregate.pricedCells === aggregate.cellCount ? aggregate.total : null);
      return;
    } catch (err) {
      if (!(err instanceof BatchEstimateError)) throw err;
      if (err.code !== 'unsupported') {
        // 'timeout' is a slow host, not an old one: never fan out per cell here.
        setQuotes([]);
        setRunTotal(null);
        return; // show "pricing unavailable, try again" in your UI
      }
    }
    // This host has no batch estimate: one estimate() per cell, as before.
    const fallback: CellQuote[] = [];
    for (const body of bodies) {
      try {
        const snapshot = await estimate(body);
        fallback.push({ total: snapshot.cost!.total });
      } catch (err) {
        if (!(err instanceof WorkflowEstimateError)) throw err;
        fallback.push({ unavailable: why(err) });
      }
    }
    setQuotes(fallback);
    const priced = fallback.filter((q): q is { total: number } => 'total' in q);
    setRunTotal(
      priced.length === fallback.length ? priced.reduce((sum, q) => sum + q.total, 0) : null,
    );
  }

  return (
    <div>
      <button onClick={() => void priceGrid()}>Price grid</button>
      <ul>
        {quotes.map((q, i) => (
          <li key={i}>{'total' in q ? `${q.total} Buzz` : q.unavailable}</li>
        ))}
      </ul>
      {runTotal !== null && <p>Run total: {runTotal} Buzz</p>}
    </div>
  );
}
```

```md
The fallback spends one request of the shared allowance per cell, which is why
the batch exists. Each submit stays per cell: call `submit(bodies[i])` for each
cell the viewer confirms.

A host that predates the batch message never replies, so the call ends in
`'timeout'` after the full wait. Only if your app must support such a host,
detect it with a deliberate probe: send a one-body batch once with a short
`{ timeoutMs }`, and treat only that probe's `'timeout'` as "no batch support".
Any other `'timeout'` is a slow host.

**Mock host:** `createMockHost` and `Harness` price each cell exactly as they
price one `estimate()` of that body (`costPerGen` and `failEstimate` apply per
cell). Like the host, they refuse the **whole call** while the token lacks
`ai:write:budgeted` — `'failed'`, with `hostError` `block lacks
ai:write:budgeted scope` — so pass `consentGranted: true`, or drive
`requestConsent()` and estimate again once the scope lands. Set `generation.batchEstimate` to `'unsupported'` to test the fallback,
or to `'silent'` to test a call that never gets a reply (pass a short
`timeoutMs` in a test). Set `generation.batchEstimateTimedOutCells` to a list
of cell indices to answer those cells the way the host does when its time
budget runs out (`ok: false`, `timedOut: true`). **`dev:live`** forwards the call to civitai.com, so against
a civitai.com that predates the batch procedure it rejects with `'failed'`
rather than `'unsupported'`.
```

**`useWorkflowBatch`**

```ts
useWorkflowBatch(workflowIds: readonly string[], options?: WorkflowBatchOptions): UseWorkflowBatch
```

Watch a set of already-submitted workflows as one batch: per-cell status, a summary, and cancel-all. Built for grid apps that submit each cell with `useBuzzWorkflow().submit()` (one submit per cell, unchanged) and then have to follow all of them. `useWorkflowBatch(workflowIds, options?)` returns `{ cells, summary, cancelAll, rewatch }`. - **The array of ids is the batch.** There is no server-side batch id. Append each id as its `submit()` resolves, and persist the same array (plain strings) to re-attach after a reload by passing it back. Skip a submit that resolved with the `'failed'` placeholder id: nothing was created. - **Every cell is one ordinary `watch()`**, so each workflow has exactly one poll in flight. When a cell's loop restarts (the list changes, `rewatch()`, a StrictMode remount) the new loop waits for the old loop's poll to return. `options` (`intervalMs`, `waitSeconds`, `timeoutMs`, `maxRetries`) are passed to every cell's `watch()`. - **At most 30 ids** (`WORKFLOW_BATCH_MAX_CELLS`): the poll allowance (1,200 per 60 s per block instance and viewer) divided by one watch's 40 polls a minute. A longer list, a duplicate, an empty id or a `'failed'`/`'whatif'` placeholder throws. - **`summary`** counts `succeeded`, `failed`, `canceled`, `expired` and `running` (not terminal, including cells with no snapshot yet) from each cell's latest snapshot, plus `realisedCost`: the sum of `cost.total` on the terminal snapshots that carry one. That is the generation cost the host reported, not a ledger read; the author fee is charged separately and is not included. `settled` is `running === 0`. - **A host failure placeholder is not a workflow outcome.** When the host fails a poll it answers `{ workflowId: 'failed', status: 'failed' }`. That says nothing about the workflow, so the cell is not counted as failed: its `phase` becomes `'stopped'` with `error` set, and `summary.stopped` counts it. A stopped cell (also a watch that timed out or ran out of retries) is not polled again until you call `rewatch()`. - **`cancelAll()` cancels every cell not known to be finished** and resolves (never rejects) with `{ canceled, alreadySettled, refused, notAttempted, failed, complete }`, each a list of ids. Cancels charge the estimate allowance (150 per 10 s per block instance; on a page app every viewer shares it), so at most four are in flight. A refused cancel resolves `status: 'processing'`: it was not sent and the workflow is still running. After the first refusal the rest of the call is not sent (`notAttempted`). A cancel answered with the host's failure placeholder is `failed`, not a failed workflow. Nothing is retried automatically. When `complete` is `false`, wait a few seconds and call `cancelAll()` again; it targets only cells that are still not finished. - **Unmounting stops every poll.** A `cancelAll()` already running keeps sending.

```tsx
import { useEffect, useState } from 'react';
import type { WorkflowBody } from '@civitai/app-sdk/blocks';
import { useBuzzWorkflow, useWorkflowBatch } from '@civitai/blocks-react';

const SAVED = 'grid-run-ids';

function GridRun({ bodies }: { bodies: WorkflowBody[] }) {
  const { submit } = useBuzzWorkflow();
  const [ids, setIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVED) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SAVED, JSON.stringify(ids));
    } catch {
      // Storage can be unavailable; the run still works, it just won't re-attach.
    }
  }, [ids]);

  const { cells, summary, cancelAll, rewatch } = useWorkflowBatch(ids);
  const [cancelNote, setCancelNote] = useState<string | null>(null);

  async function runCell(body: WorkflowBody, key: string) {
    const snap = await submit(body, { idempotencyKey: key });
    if (snap.workflowId !== 'failed') setIds((prev) => [...prev, snap.workflowId]);
  }

  async function onCancelAll() {
    const result = await cancelAll();
    setCancelNote(
      result.complete
        ? null
        : `${result.refused.length + result.notAttempted.length + result.failed.length} cells are still running. Try again in a few seconds.`,
    );
  }

  return (
    <div>
      <button onClick={() => bodies.forEach((b, i) => void runCell(b, `cell-${i}`))}>Run grid</button>
      <p>
        {summary.succeeded} done, {summary.failed} failed, {summary.canceled} cancelled,{' '}
        {summary.running} running. Spent {summary.realisedCost} Buzz.
      </p>
      {!summary.settled && <button onClick={onCancelAll}>Cancel all</button>}
      {summary.stopped > 0 && <button onClick={rewatch}>Refresh stalled cells</button>}
      {cancelNote && <p>{cancelNote}</p>}
      <ul>
        {cells.map((cell) => (
          <li key={cell.workflowId}>{cell.snapshot?.status ?? 'queued'}</li>
        ))}
      </ul>
    </div>
  );
}
```

```md
**Mock host:** `createMockHost` and `Harness` keep a cancelled workflow
cancelled on later polls, report a finished workflow's real status when it is
cancelled, and count down an id they did not submit (one restored after a
reload) like any other. Set `generation.cancelRefused` to `true` (or a list of
workflow ids) to answer cancels the way the host does when the allowance is used
up, and `generation.workflowOutcome` to a `(workflowId, body) => 'succeeded' |
'failed' | 'expired'` function to give a grid a mix of outcomes. The mock does
not model the rate limits themselves.
```

**`useBuzzPurchase`**

```ts
useBuzzPurchase(): UseBuzzPurchase
```

Open the Buzz purchase modal. It raises the viewer's WALLET, never a spend cap: offer it when the viewer's spendable Buzz is below a quoted cost, never on a resolved `failed` submit (see `useBuzzWorkflow`'s `submit` docs).

```tsx
const { openPurchaseModal } = useBuzzPurchase();
const { purchased, newBalance } = await openPurchaseModal(suggestedAmount);
if (purchased) { /* retry the generation */ }
```

**`useGoodPurchase`**

```ts
useGoodPurchase(): UseGoodPurchase
```

Sell a **digital good** — a manifest-declared entitlement the platform sells to the viewer for Buzz on your app's behalf. Requires the `goods:purchase:self` scope **and** a `goods` entry in your manifest; without both the endpoint answers 404.

```tsx
const { purchase, loading, error } = useGoodPurchase();
const { entitlement } = await purchase(
  { goodId: 'extra-slots', expectedPriceBuzz: 250 },
  { topUpOnInsufficientFunds: true },
);
```

```md
🔴 **The platform renders no confirmation for the purchase itself** — this is a plain authed POST on the block token, so whatever the viewer confirms is *your* UI. Spend is bounded by the manifest-reviewed price and the viewer's daily cap, but a good can be priced near that cap where a tip cannot. Show the price and require an explicit action.

`{ topUpOnInsufficientFunds: true }` opens `useBuzzPurchase()` on an `insufficient_funds` refusal and retries **once with the same idempotency key** — but only if the viewer actually bought Buzz. **Pass `expectedPriceBuzz` with it**, or the modal opens with no suggested amount and the retry can re-refuse after real fiat was spent. It keys on the *reason*, never on "the call failed", so it never offers Buzz for a failure Buzz cannot fix.

Refusals reject with a `GoodPurchaseRefusal` carrying `status` and, where the server sends one, `reason`. `reason` is **`undefined`** for the endpoint's own refusals (404, 429, daily-cap 400, every idempotency refusal) — only service-level ones populate it, so always fall back to `status` and `message`.

Two rejections are **not** refusals, and `name` tells them apart: the 30s bound rejects with a plain `Error` naming the timeout — a real failure, the charge may have landed, retry with the **same** `idempotencyKey` — while an unmount rejects with `name === 'AbortError'`, the usual signal that the component navigated away and there is nothing to report. That split is decided by the **abort state**, so it holds wherever the abort lands, the body read included. The one exception runs the other way: a refusal the hook had already parsed stays a `GoodPurchaseRefusal` even if an abort fires in the same tick — `reason` is worth more than the abort wrapper. So ignoring `AbortError` never swallows a refusal or a timeout.
```

**`useEntitlements`**

```ts
useEntitlements(): UseEntitlements
```

What the viewer owns **from this app** — the read half of the goods rail. Scope `goods:read:self`, which is consent-exempt: the reply is scoped server-side to your own app, so a read-only block needs no purchase power and triggers no re-consent prompt.

```tsx
function PaidFeature() {
  const { owns, loading, error, unauthenticated, refetch } = useEntitlements();
  if (loading) return <Spinner />;
  if (unauthenticated) return <SignInToBuy />;        // a logged-out viewer
  if (error) return <RetryNotice onRetry={refetch} />; // NOT "you own nothing"
  return owns('extra-slots') ? <Unlocked /> : <BuyButton onDone={refetch} />;
}
```

```md
🔴 **`owns()` returns `false` when the viewer owns nothing AND when the read failed**, so never gate paid content on it alone — check `loading`, `unauthenticated` and `error` first, in that order. A block that paywalls on `!owns(id)` takes away something the viewer paid for on every transient failure. `unauthenticated` exists because a **page** app is a public surface, so a logged-out viewer is the common path rather than an edge.

🔴 **`unauthenticated` is derived from the viewer, not from a response.** It is `isSignedIn(useBlockContext().viewer) === false` once `BLOCK_INIT` has landed — so it is known *before* any request, and an anonymous viewer costs **no round trip**: the hook skips the GET entirely and settles with `error === null`, because nothing failed. It stays `false` until init lands (a pre-init viewer is *unknown*, not absent), so a block that never gets embedded reaches its host-origin error rather than a sign-in screen.

🔴 **No 403 is ever read as "not signed in"** — and a predicate that tried to be was **dead code**. The endpoint runs under `withBlockScope(…, { requiredScope: 'goods:read:self' })`, whose `:self` arm rejects an anonymous subject as `code: 'context_binding'`, so there is no reachable uncoded 403 on this route; keying on `context_binding` instead would be worse, since the same code covers a wrong `modelId`. Every 403 therefore reaches `error` with the server's own wording — including the one you will actually hit, `insufficient_scope`, a manifest that forgot `goods:read:self`. Read `error.message`, not the status.

Call `refetch()` after a successful purchase to reflect it without a remount.
```

**`useBuzzBalance`**

```ts
useBuzzBalance(): UseBuzzBalance
```

The signed-in viewer's per-pool Buzz balance (`{ blue, green, yellow }` — the domain-clamped pools a block may read; never the platform-internal `red`/`purple`). Host-mediated over `GET_BUZZ_BALANCE` → `BUZZ_BALANCE_RESULT`; same trust model as `useBuzzWorkflow`/`useBuzzPurchase` (the host resolves the viewer from the block token — the block never touches the balance API). Fetches on mount; `refetch` for on-demand refreshes.

```tsx
const { balance, loading, error, refetch } = useBuzzBalance();
// `balance` is null until the first successful fetch. refetch() after a
// generation debits it. An anon viewer / missing scope / host failure → `error`.
if (!loading && balance) console.log(`Yellow: ${balance.yellow}`);
```

```md
> Per-account Buzz: `useBuzzWorkflow().submit(body)` also takes an optional
> `body.accountType` (`'blue' | 'green' | 'yellow'`) — a *preference* for which
> pool funds the generation; the host clamps it server-side.
```

**`useViewer`**

```ts
useViewer(): UseViewer
```

The signed-in viewer as an on-demand authoritative self-read (`{ id, username, status, buzzBudget }`) — distinct from `useBlockContext().viewer`, the coarse `BLOCK_INIT`-time snapshot. `status` is `'active' | 'muted'`; `username` (`string | null`) and `buzzBudget` (`number | null`) are present-but-nullable, so handle the null case. Host-mediated over `GET_VIEWER` → `VIEWER_RESULT` (the host resolves the viewer from the block token via `blocks.getMyViewer`); an anonymous / banned viewer comes back as `error`. Fetches on mount; `refetch` for on-demand refreshes.

```tsx
const { viewer, loading, error, refetch } = useViewer();
// `viewer` is null until the first successful fetch. An anon / banned viewer,
// missing scope, or host failure → `error`. `username`/`buzzBudget` may be null.
if (!loading && viewer) console.log(`${viewer.username ?? 'anon'} · budget ${viewer.buzzBudget ?? 0}`);
```

**`useBuzzTransactions`**

```ts
useBuzzTransactions(params?: BlockBuzzTransactionsParams): UseBuzzTransactions
```

The signed-in viewer's Buzz-transaction ledger (a paged, host-projected read of the Buzz dashboard). Returns `{ transactions, cursor, loading, error, refetch }`; `transactions` rows are rehydrated so `date` is a `Date`. Pass the returned `cursor` back as `params.cursor` to page forward. Requires the `buzz:read:self` scope; host-mediated over `GET_BUZZ_TRANSACTIONS`.

```tsx
const { transactions, cursor, loading, error } = useBuzzTransactions({ type: 'Tip', limit: 20 });
if (!loading && transactions) transactions.forEach((t) => console.log(t.type, t.amount, t.date));
```

**`useBuzzAccounts`**

```ts
useBuzzAccounts(): UseBuzzAccounts
```

The viewer's all-pool Buzz balances — the three spendable pools **plus** the creator payout pools (`{ accountType, balance }[]`), a superset of `useBuzzBalance`. Returns `{ accounts, loading, error, refetch }`. Requires `buzz:read:self`; host-mediated over `GET_BUZZ_ACCOUNTS`.

```tsx
const { accounts, loading, error } = useBuzzAccounts();
if (!loading && accounts) accounts.forEach((a) => console.log(a.accountType, a.balance));
```

**`useDailyCompensation`**

```ts
useDailyCompensation(params: BlockDailyCompensationParams): UseDailyCompensation
```

Per-modelVersion generation-compensation for the month containing `params.date` (Buzz totals + cash totals in pennies). Returns `{ resources, hasPublishedResources, loading, error, refetch }`. Requires `buzz:read:self`; host-mediated over `GET_DAILY_COMPENSATION`.

```tsx
const { resources, hasPublishedResources } = useDailyCompensation({ date: '2026-07-01' });
```

**`useWildcardPack`**

```ts
useWildcardPack(modelVersionId: number): UseWildcardPack
```

Import a wildcard pack's parsed prompt lists by model version — the host resolves + fetches + unzips + parses it **in the user's own page session** (every download gate enforced), so the untrusted iframe never sees the bytes. Returns `{ pack, loading, error, refetch }`. On failure `error` is a `WildcardPackError` with a discriminated `code` (`not-found` / `forbidden` / `too-large` / `parse-failed` / `busy` — `busy` is retryable), not free text.

```tsx
const { pack, loading, error, refetch } = useWildcardPack(modelVersionId);
// `error.code === 'busy'` is retryable — call refetch(); the other codes are terminal.
if (error instanceof WildcardPackError && error.code === 'busy') void refetch();
if (!loading && pack) console.log(Object.keys(pack.lists));
```

**`useCollectionFollow`**

```ts
useCollectionFollow(): UseCollectionFollow
```

```md
Follow / unfollow a collection **for the viewer**, host-mediated over
`SET_COLLECTION_FOLLOW`. Returns `{ setFollow, pending, error }`.

**No block scope, and no token on the wire.** The host calls the session-authed
`collection.follow` / `collection.unfollow` procedures, which self-bind to the
viewer server-side — `collectionId` is the only thing a block influences.

🔴 **Every call opens a host-chrome consent confirm naming the collection**, and
that click is the *only* consent this path has ever had: the HTTP predecessor's
`collections:write:self` scope is consent-exempt server-side and prompted nobody.
Moving to this bridge **tightens** the flow; what it gives up is the manifest
`scopes` declaration a moderator reads before install. The host resolves the
collection's name itself (there is no `name` field on the wire, deliberately) and
bounds that to **20 distinct ids per block instance** — past the cap it refuses
with `collection-unavailable`, the same code a collection the viewer cannot see
gets.

`setFollow` **rejects** with a `CollectionFollowError` on every non-success. Two
of those are not failures to render:

| | meaning | what to do |
|---|---|---|
| `err.declined` | the viewer dismissed the confirm — **no write occurred** | revert, say nothing |
| `err.signInRequired` | no session | route into `useRequestSignIn()` |
| `err.timedOut` | no reply arrived within the 10-min consent bound | 🔴 **check this BEFORE `.message`** — it also has no `.code`, and its message is an SDK-internal string. It does **not** mean no write occurred; re-read your state |
| `err.code` set otherwise | a host refusal (`invalid-request` / `review-mode` / `not-ready` / `collection-unavailable`) | show or ignore per case |
| `err.code === undefined` **and** `!err.timedOut` | a **server** message the host forwarded verbatim | show `err.message` |
```

```tsx
const { setFollow, pending } = useCollectionFollow();
const { requestSignIn } = useRequestSignIn();

async function toggle() {
  try {
    const result = await setFollow({ collectionId, follow: !followed });
    setFollowed(result.followed); // adopt the host's echo, not the guess
  } catch (err) {
    if (err instanceof CollectionFollowError) {
      if (err.signInRequired) return requestSignIn();
      if (err.declined) return; // the viewer said no — say nothing
      if (err.timedOut) return showToast('Still working — check back in a moment.');
      showToast(err.message); // a real server message, safe to render
    }
  }
}
```

```md
Most blocks want `<FollowButton>` from `@civitai/blocks-react/ui` instead, which
wires all of the above.
```

**`useCreatePostFromApp`**

```ts
useCreatePostFromApp(): UseCreatePostFromApp
```

```md
Publish a **real, published Post on the viewer's profile** from this app's own
outputs, host-mediated over `CREATE_POST_FROM_APP`. Returns
`{ createPost, pending, error }`.

The strictly-more-consequential sibling of `usePublishGenerationOutputs()`: that
one makes a bare `Image` row with no post, no feed presence, no reward and no
notification; this one makes **public, feed-visible, reward-earning content under
the viewer's byline**.

🔴 **Requires the `posts:write:self` scope**, which is **sensitive** and
**consent-gated**. Declare it in your manifest *with* a `scopeJustifications`
entry — the server rejects the manifest at submit without one — and expect the
viewer to be prompted to grant it before the first call succeeds.

🔴 **The grant is not the consent.** Every call opens a host-chrome confirm, and
what it shows is the **server's** resolution of your request, never your strings:
the tag names that will *actually* be applied, host-fetched model and version
names for a gallery attach, and real thumbnails. A block cannot show one post and
publish another.

🔴 **No arm of `sources` takes a URL.** Name a workflow from this app's own
subqueue plus indexes into its outputs, or `Image` ids from a previous
`usePublishGenerationOutputs()` publish or `useUploadImageBytes()` upload. The
server re-verifies both — ownership,
this app's provenance marker, and that the image is not already in a post.

⚠️ **Posting a published image removes it from this app's own grid.** The
app-scoped read behind `useGatedImages()` is conjoined with `postId IS NULL`, so
an image that joins a post stops resolving there. An app cannot both keep an
image in its shared grid and let the viewer post it — design around it.

Text is advisory: the server bounds `title`/`detail`, screens them, refuses a
`detail` containing a link, and resolves `tags` against **existing** tags only (a
name matching no tag is dropped, never minted, and is shown to the viewer on the
confirm).

`createPost` **rejects** with a `CreatePostError` on every non-success:

| | meaning | what to do |
|---|---|---|
| `err.declined` | the viewer dismissed the confirm — **no post was created** | revert, say nothing |
| `err.signInRequired` | no session | route into `useRequestSignIn()` |
| `err.timedOut` | no reply arrived within the 10-min consent bound | 🔴 **check this BEFORE `.message`** — it also has no `.code`, and its message is an SDK-internal string. It does **not** mean nothing happened; tell the viewer to check their profile and never retry automatically |
| `err.code` set otherwise | a host refusal (`review-mode` / `block is not ready` / `no images to post` / `no block token`) | show or ignore per case |
| `err.code === undefined` **and** `!err.timedOut` | a **server** message the host forwarded verbatim (rate limit, blocked title, refused gallery attach) | show `err.message` |
```

```tsx
const { createPost, pending } = useCreatePostFromApp();
const { requestSignIn } = useRequestSignIn();

async function share() {
  try {
    const post = await createPost({
      sources: [{ kind: 'workflow', workflowId: w.workflowId, imageIndexes: [0, 2] }],
      title: 'Made with Sticker Studio',
    });
    showToast(`Posted! ${post.url}`);
  } catch (err) {
    if (err instanceof CreatePostError) {
      if (err.signInRequired) return requestSignIn();
      if (err.declined) return; // the viewer said no — say nothing
      if (err.timedOut) return showToast('Still working — check your profile.');
      showToast(err.message); // a real server message, safe to render
    }
  }
}
```

```md
With the mock host — `createMockHost` or `Harness` from
`@civitai/blocks-react/testing` — the `createPostResult` / `createPostError`
options drive both arms (including `declined`). **`dev:live` refuses this bridge on purpose** —
it has no civitai chrome to render the server-resolved confirm in, and driving
the write without it would let dev prove out a flow production does not have.
```

**`usePrepareTrainingDataset`**

```ts
usePrepareTrainingDataset(): UsePrepareTrainingDataset
```

```md
Train a LoRA with the ai-toolkit engine on the **viewer's own images**, from
inside a page app — the App Blocks `kind: 'training'` flow. Four steps, three
hooks:

1. **Dataset** — `usePrepareTrainingDataset().prepareDataset([{ imageId, caption }])`
   (`PREPARE_TRAINING_DATASET`). Only the viewer's own scanned, unflagged images
   within the page's maturity ceiling are admitted; the rest come back in
   `rejected` with a reason (`unavailable`, `unsupported-media`, `not-eligible`,
   `pending-scan`, `import-failed`, `import-unavailable`; `pending-scan` and
   `import-unavailable` are retryable). You get an opaque `datasetId` and the
   admitted `count`, always at least 1 — if **nothing** is admitted the call
   rejects with the server's message instead. 1–50 images, captions up to 1,000 characters; captions are
   moderated. No dialog, no charge.
2. **Quote** — `useBuzzWorkflow().estimate(body)` with a `WorkflowBodyTraining`
   (`kind: 'training'`, no `quoteId`). The reply carries `trainingQuote:
   { quoteId, total, imageCount, expiresAt }` — the orchestrator's own price for
   exactly this run, stored server-side for 15 minutes.
3. **Run** — `useRunTraining().runTraining({ ...body, quoteId })` (`RUN_TRAINING`).
   **Civitai shows the viewer a consent dialog in its own chrome** — price, base
   model, length and dataset size, all read back from the server, never from
   your body — and submits only on their click. Change nothing in the body
   between the estimate and the run; the server checks it against the quoted one.
4. **Follow** — `useBuzzWorkflow().watch(workflowId)`. Once the run's moderation
   status is approved, `trainedEpochs` lists the epochs whose checkpoint is
   ready; send the viewer to the publish wizard with one of them (see
   `trainedEpochs` on `BlockWorkflowSnapshot`).

🔴 **Availability.** Behind the host flag **`app-blocks-training-kind`**, which
ships **off** and is evaluated per viewer. **Page apps only** — the model slot
answers both messages with an error. The manifest must declare
**`ai:write:budgeted`** and the viewer must be signed in and have granted it.
**Refused from `dev:live` and from review sessions** (the server refuses
development and review tokens); build the flow against the mock host. Requires a
civitai.com host carrying civitai/civitai#5434 (`kind: 'training'`,
`RUN_TRAINING`) and civitai/civitai#5438 (`PREPARE_TRAINING_DATASET`).

🔴 **Money.** There is no `maxBuzz` and no timeout knob — the price is the quote.
A confirmed run may cost more than the token's per-call `buzzBudget` (the viewer
confirms the exact price), up to `BLOCK_TRAINING_MAX_BUZZ_PER_RUN` (5,000 Buzz);
an estimate above that is refused. `useBuzzWorkflow().submit()` **refuses** a
training body before sending anything: only `RUN_TRAINING`'s dialog can confirm a
quote, so a training run starts nowhere else.

`runTraining` **rejects** with a `RunTrainingError`; read the flags before
saying anything about money:

| | meaning | what to do |
|---|---|---|
| `err.declined` | the viewer dismissed the dialog — **no run was submitted** | revert, say nothing |
| `err.unconfirmed` | `submission-unconfirmed`, or no reply within the 10-min bound (`err.timedOut`) — the run **may be running and charged** | 🔴 **never retry automatically**: check the viewer's trainings first (`useAppWorkflows()` lists this app's runs). Re-running the same body after the server did start it is a **second, separately charged run** |
| `err.refused` (`code: 'refused'`) | the server refused the submit after the viewer confirmed — a **spend cap** (their daily or private-run Buzz cap, the per-app consent budget, the app's daily spend or rate limit, a dev-session cap) or a **temporary-availability** deny. Refunded: **no run, nothing charged**; the quote is used up | show `err.message` (the server's reason, e.g. `daily Buzz cap reached: …`); estimate again before any retry — buying Buzz does not lift these caps |
| `err.signInRequired` | no session | route into `useRequestSignIn()` |
| `err.code` set otherwise | a host refusal (`review-mode` / `block is not ready` / `invalid training request` / `no block token`) | show or ignore per case |
| `err.code === undefined`, no flag | a server refusal before any submit (expired or used quote, changed body, ineligible image) | estimate again, then retry |

`prepareDataset` rejects with a `PrepareTrainingDatasetError` (`.code` for the
host's refusals — `review-mode`, `block is not ready`, `sign in to train`,
`invalid training dataset`, `no block token` — plus `.signInRequired` and
`.timedOut`). Preparing charges nothing, so none of them cost Buzz. It prompts
for `ai:write:budgeted` and retries once on a grant (see the table below);
`runTraining` deliberately does not — it carries no idempotency key and has an
outcome where a run may exist, so it never re-sends.
```

```tsx
const { prepareDataset } = usePrepareTrainingDataset();
const { estimate, watch } = useBuzzWorkflow();
const { runTraining } = useRunTraining();

async function train(images: Array<{ id: number; caption: string }>) {
  // Rejects (no `.code`) when NOTHING is admitted, e.g. "none of the requested
  // images can be used for training"; a resolved dataset always has count >= 1.
  const dataset = await prepareDataset(images.map((i) => ({ imageId: i.id, caption: i.caption })));
  if (dataset.rejected.length > 0) showNotice(`${dataset.rejected.length} image(s) left out`);

  const body: WorkflowBodyTraining = {
    kind: 'training',
    datasetId: dataset.datasetId,
    engine: 'ai-toolkit',
    model: baseModelKey, // a key from Civitai's training catalog
    params: aiToolkitParams, // AiToolkitTrainingParams
    triggerWord: 'mystyle',
    samplePrompts: ['mystyle, a lighthouse at dusk'],
  };
  const quote = (await estimate(body)).trainingQuote;
  if (!quote) return showError('No training price came back.');
  // Show quote.total; the host's dialog will show the same number.

  try {
    const started = await runTraining({ ...body, quoteId: quote.quoteId });
    const done = await watch(started.workflowId, { onUpdate: render });
    setEpochs(done.trainedEpochs ?? []);
  } catch (err) {
    if (!(err instanceof RunTrainingError)) throw err;
    if (err.declined) return; // no run
    if (err.unconfirmed) return showCheckYourTrainings(); // may be running — never auto-retry
    if (err.refused) return showError(err.message); // a cap / availability refusal; no run, nothing charged
    if (err.signInRequired) return requestSignIn();
    showError('Could not start training. Get a new price and try again.');
  }
}
```

```md
With the mock host — `createMockHost` or `Harness` from
`@civitai/blocks-react/testing` — the training path is **kind-faithful**: it
holds the datasets it prepared and the quotes it stored, refuses an unknown
dataset, a dataset with nothing admitted, a quote above 5,000 and a quote run
twice, and needs
`ai:write:budgeted` on the token and a signed-in viewer. Its knobs are
`trainingDatasetRejected`, `trainingDatasetError`, `trainingQuoteTotal`,
`runTrainingError` (`'declined'`, `'submission-unconfirmed'`, or any server
message), `runTrainingCapRefusal` (the server's resolved cap / availability refusal, which consumes the quote →
`err.refused`) and `generation.trainedEpochs` for the finished run. It has no
consent dialog, so `runTraining` settles at once where the real host waits on a
click, and it checks a run's body against its quote by `datasetId` only — the
server compares the whole body.
**`dev:live` refuses both bridges**, because the server refuses every training
request from a dev token.
```

**`useRunConfirmedStep`**

```ts
useRunConfirmedStep(): UseRunConfirmedStep
```

```md
A pass-through `step` job (`{ kind: 'step', $type, input, maxBuzz }`) that costs
more than the app may spend without asking is refused by `submit()` — unless the
**viewer confirms that exact price** in Civitai's own dialog. This hook is that
path. It is the training run's confirm applied to any pass-through `$type`
(`polyGen`, a long video job, …). Three steps, two hooks:

1. **Quote** — `useBuzzWorkflow().estimate(body)`, the body you would submit. When
   the job qualifies the reply carries `stepQuote: { quoteId, total, stepType,
   expiresAt }`. `total` is the price the viewer will confirm and be charged.
2. **Run** — `useRunConfirmedStep().runConfirmedStep({ ...body, quoteId })`
   (`RUN_CONFIRMED_STEP`). Civitai reads the quote back from the server, shows
   the viewer the price in **its** chrome and submits on their click. Resolves
   with the submitted workflow's snapshot.
3. **Watch** — `useBuzzWorkflow().watch(snapshot.workflowId)`, as for any job.

No `stepQuote` on the estimate means the ordinary rules apply: submit it if it
fits the budget, and otherwise it cannot run from an app. Change nothing in the
body between the estimate and the run — the server checks it against the quoted
one.

🔴 **Only a fixed price is confirmable.** `stepQuote` is present when the
orchestrator quoted a **fixed** price (positive, not variable or metered) that is
above the token's per-call `buzzBudget` and at most
`BLOCK_CONFIRMED_STEP_MAX_BUZZ_PER_JOB` (5,000 Buzz). The viewer confirms what
they are charged, so a price that may move, or no price at all, gets no quote.
`stepQuote.total` can differ from `cost.total` on the same snapshot (which stays
what an unconfirmed submit would reserve) — put `stepQuote.total` on your button.

🔴 **Estimate it on its own.** Only a single `estimate()` returns a `stepQuote`.
A batch estimate (`useBatchEstimate()`) stores nothing, so its cells never carry
one: price the grid in a batch, then estimate the one body you want to run.

🔴 **Two bodies make the estimate reject instead of returning a price.** Only
where a quote would otherwise be granted, so not below the budget and not in a
batch. `estimate()` rejects with a `WorkflowEstimateError` whose
`snapshot.error` is the server's message; the same text is the
`RunConfirmedStepError`'s `message` if such a body is run. Neither has a code or
a flag — they are server messages, so match on the text:

| `snapshot.error` / `err.message` | cause | fix |
|---|---|---|
| `a training step type cannot run as a confirmed step — use kind:'training'` | `$type` is `training` or `imageResourceTraining`, in any casing | train with [`kind: 'training'`](#usepreparetrainingdataset-and-useruntraining--lora-training), which has its own dataset and checks |
| starts with `a confirmed step needs plain JSON input (objects, arrays, strings, finite numbers, booleans, null) — ` and ends with the offending path, e.g. `body.input.when is a Date` | `input` holds something that is not plain JSON: a `Date`, `Map`, `Set`, class instance, `BigInt`, `NaN`/`Infinity`, an `undefined` array element, or an empty slot in a sparse array (`… is an empty array slot`). The quote is bound to the exact body, so the body must be exactly representable | send plain JSON (an ISO string for a date, an array for a set). The suffix varies, so match on the part **before the dash** |

🔴 **Single-use, and it expires.** A quote is good for one run and for **15
minutes** (`stepQuote.expiresAt`). The server prices the job again at submit and
refuses a higher price. Estimate again to get a new one.

🔴 **Availability.** Behind the host flag **`app-blocks-confirmed-step`**, which
ships **off** and is evaluated per viewer; requires a civitai.com host carrying
civitai/civitai#5786. **Page apps only** — the model slot answers with an error.
The manifest must declare **`ai:write:budgeted`** and the viewer must be signed
in and have granted it. **Refused for development, dev-tunnel and review
tokens**, so **`dev:live` cannot exercise it**: the estimate there never carries
a `stepQuote` and the bridge replies with a refusal. Build the flow against the
mock host (below). Where the feature is unavailable nothing errors — the estimate
simply has no `stepQuote`, which is also what an older host sends.

🔴 **No retry, ever.** Every confirmation is its own job: there is no idempotency
key, and confirming the same body twice starts and charges two jobs. The hook
never re-sends and never prompts for consent, and `useBuzzWorkflow().submit()`
**refuses** a step body that carries a `quoteId` before sending anything — only
`RUN_CONFIRMED_STEP`'s dialog can confirm a quote. `runConfirmedStep` also
refuses, before sending, a body whose `quoteId` is missing or is not an
`sq_`-shaped id (a training `tq_…` quote, or `undefined` from an estimate that
returned no `stepQuote`).

`runConfirmedStep` **rejects** with a `RunConfirmedStepError`; read the flags
before saying anything about money:

| | meaning | what to do |
|---|---|---|
| `err.declined` | the viewer dismissed the confirm — **no job was submitted**; the quote is still good until it expires | revert, say nothing |
| `err.dailyLimitExceeded` | the job would exceed what remains today of the daily Buzz limit **the viewer** set for this app — **no job, nothing charged**. Civitai has already told the viewer and linked to where the limit is raised | say nothing more; do **not** retry and do **not** offer a Buzz purchase (more Buzz does not lift a limit) |
| `err.unconfirmed` | `submission-unconfirmed`, or no reply within the 10-min bound (`err.timedOut`) — the job **may be running and charged** | 🔴 **never retry automatically**: check the viewer's generations first (`useAppWorkflows()` lists this app's runs). A retry needs a new estimate and a new confirmation, and is a **second, separately charged job** if the first one started |
| `err.refused` (`code: 'refused'`) | the server refused the submit after the viewer confirmed — a **spend cap** (their daily or private-run Buzz cap, the app's daily spend or rate limit). Refunded: **no job, nothing charged**; the quote is used up | show `err.message` (the server's reason); a retry needs a new estimate and usually a later time |
| `err.signInRequired` | no session | route into `useRequestSignIn()` |
| `err.code` set otherwise | a host refusal (`review-mode` / `block is not ready` / `invalid confirmed step request` / `no block token`) | show or ignore per case |
| `err.code === undefined`, no flag | a server refusal with no job started (expired or used quote, changed body, changed price, a training `$type`, non-plain-JSON `input`, the flag is off) | fix the body if the message names it, estimate again, then retry |
```

```tsx
const { estimate, submit, watch } = useBuzzWorkflow();
const { runConfirmedStep } = useRunConfirmedStep();
const { requestSignIn } = useRequestSignIn();

async function generate3d(prompt: string) {
  const body: WorkflowBodyPassThroughStep = {
    kind: 'step',
    $type: 'polyGen',
    input: { prompt },
    maxBuzz: 250,
  };
  const quote = (await estimate(body)).stepQuote;

  try {
    const started = quote
      ? // Over the per-call budget: the viewer confirms `quote.total` in Civitai's dialog.
        await runConfirmedStep({ ...body, quoteId: quote.quoteId })
      : // Within it (or not confirmable): the ordinary path.
        await submit(body);
    return await watch(started.workflowId);
  } catch (err) {
    if (!(err instanceof RunConfirmedStepError)) throw err;
    if (err.declined) return; // no job — say nothing
    if (err.dailyLimitExceeded) return; // no job — Civitai already told the viewer
    if (err.signInRequired) return requestSignIn();
    if (err.unconfirmed) return showCheckYourGenerations(); // may be running — never auto-retry
    if (err.refused) return showError(err.message); // a cap refusal; no job, nothing charged
    showError('Could not start this job. Get a new price and try again.');
  }
}
```

````md
**With the mock host** — `createMockHost` or `Harness` from
`@civitai/blocks-react/testing` — this is the only place the flow can be
exercised before a production host has it. A pass-through `step` estimate carries
a `stepQuote` whenever the mock's price for it (`generation.costPerGen`, or
`cost`) is above the token's per-call budget (`buzzBudget`, default 200) and at
most 5,000, for a signed-in viewer; there is no separate switch. As on the
server, a batch-estimate cell never carries one, and where a quote would be
granted the estimate fails instead, with the server's message, for a training
`$type` and for non-plain-JSON `input`. The mock holds the quotes it stored and
refuses an unknown, expired or already-run one, a body that differs from the
quoted one, and a plain `SUBMIT_WORKFLOW` carrying a `quoteId`. How the run
settles is `runConfirmedStepError`:

| `runConfirmedStepError` | URL | outcome |
|---|---|---|
| unset | — | the viewer confirms; the job starts, charged `stepQuote.total` |
| `'declined'` | `?confirmedStep=declined` | `err.declined`; the quote survives |
| `'daily-limit-exceeded'` | `?confirmedStep=daily-limit` | `err.dailyLimitExceeded`; the quote survives |
| `'submission-unconfirmed'` | `?confirmedStep=unconfirmed` | `err.unconfirmed`; the quote is used up |
| any other string | — | a server message; the quote is used up |

`runConfirmedStepCapRefusal` resolves the server's refunded cap refusal
(`err.refused`), and both knobs are live-tunable with `host.setScenario(...)`.

```tsx
import { createMockHost } from '@civitai/blocks-react/testing';

const host = createMockHost({
  consentGranted: true,
  generation: { costPerGen: 800 }, // above the default 200 per-call budget → quoted
  runConfirmedStepError: 'declined',
});
const uninstall = host.install();
// …later: the viewer confirms this time.
host.setScenario({ runConfirmedStepError: undefined });
```

What the mock does **not** model: it has no dialog, so the run settles at once
where the real host waits on a click; it prices every estimate as fixed, where
the real host gives a variable or metered price no `stepQuote`; and the flag, the
page-only rule and the submit-time re-price are server-side.

#### 3D outputs: `model3dOutputs`

A step that produces 3D models (`polyGen`) lists every model url in
`snapshot.imageUrls`, as before. `snapshot.model3dOutputs` says which is which:
one `{ url, format, variant }` per model, where `format` is the model's own file
format (`'glb'`, `'fbx'`, …) and `variant` is the output it came from (`'model'`,
`'riggedFbxModel'`, `'basicAnimations.walkingModel'`, …). Both are open sets
named by the orchestrator. The field is **omitted** when the workflow produced no
3D model and on hosts that predate it, and the same field is on each
`useAppWorkflows()` row.

```tsx
function modelsOf(snapshot: BlockWorkflowSnapshot) {
  const models = snapshot.model3dOutputs ?? [];
  return {
    // The plain mesh, in the format a web viewer loads.
    glb: models.find((m) => m.format === 'glb' && m.variant === 'model')?.url,
    // The rigged export, for a download button.
    riggedFbx: models.find((m) => m.variant === 'riggedFbxModel')?.url,
    // Every animation clip, whatever the host named them.
    animations: models.filter((m) => m.variant.startsWith('basicAnimations.')),
  };
}
```

In the mock host, `generation.model3dOutputs` puts labels (and their urls in
`imageUrls`) on a succeeded pass-through step.
````

**`useAppWorkflows`**

```ts
useAppWorkflows(params?: AppWorkflowsParams): UseAppWorkflows
```

The calling app's **own** generator subqueue — the tag-scoped list of generations **this app** produced for the viewer (newest-first), plus a fail-closed `cancel`. The host self-binds the account off the block token and **forces** the per-app tag filter, so a block only ever sees the queue it produced — never the viewer's personal queue or another app's. Returns `{ workflows, cursor, loading, error, refetch, cancel }`; each `AppWorkflow` is `{ workflowId, status, images[], cost, createdAt }`. Pass the returned `cursor` back as `params.cursor` to page forward. Requires `ai:write:budgeted` (same trust boundary as submit); host-mediated over `QUERY_APP_WORKFLOWS` / `CANCEL_APP_WORKFLOW`. `cancel(workflowId)` sends `CANCEL_APP_WORKFLOW`, resolves once the host confirms the terminal state (which is optimistically spliced into `workflows` in place — no refetch round-trip), and rejects with the host's error on failure.

```tsx
const { workflows, cursor, loading, error, refetch, cancel } = useAppWorkflows({ limit: 20 });
if (!loading && !error) {
  workflows.forEach((w) => console.log(w.workflowId, w.status, w.images.length, w.cost));
}
async function onCancel(id: string) {
  try {
    await cancel(id); // optimistically flips the row to `canceled`
  } catch (err) {
    console.error('cancel failed', err);
  }
}
```

**`useAppStorage`**

```ts
useAppStorage(): UseAppStorage
```

KV datastore, host-mediated. Keys are **namespaced** per (block instance, viewer); the byte and row **budgets** are enforced per (**app**, viewer), so every instance of one app shares one budget for that viewer.

```tsx
import {
  APP_STORAGE_MAX_VALUE_BYTES, // largest single value, in wire bytes
  APP_STORAGE_MAX_BYTES,       // total stored bytes per (app, viewer)
  APP_STORAGE_MAX_ROWS,        // total rows per (app, viewer)
} from '@civitai/app-sdk/blocks';

const storage = useAppStorage();
await storage.set('key', { any: 'json' });   // rejects over ANY of the three — and on a >200-char key
const v = await storage.get<MyShape>('key'); // null if unset / anon
await storage.delete('key');                  // idempotent
const { keys } = await storage.list({ prefix: 'note-' });
const quota = await storage.getQuota();       // { usedBytes, rowCount, limitBytes, limitRows }
```

````md
🔴 **For the byte/row budget, `getQuota()` is the authority for those two
numbers and the constants are a snapshot.** All three above are compiled-in
figures **as of the version of `@civitai/app-sdk` you installed** — which is the
same frozen-number failure mode this page used to demonstrate, just with one
copy instead of nine. The host can move any of them without your lockfile
changing. So:

- **Render `getQuota()`'s reply**, never a constant, anywhere a viewer sees a
  number or a code path decides whether a write will fit.
- **Reach for the constants only where no quota reply is available** — a
  build-time sanity check, a test fixture, a rough design-time estimate — and
  treat the answer as "roughly, at install time".
- **Re-check after any SDK bump**, and expect movement: the per-viewer clamp
  was sized against a measured distribution and the host says to expect a
  re-measure. `appStorageLimits.ts` in `@civitai/app-sdk` carries the
  provenance and a one-liner that re-derives the current values from the host.

Never hard-code a figure of your own: the docs here used to quote the app-wide
umbrella instead of the per-viewer clamp and were **25x** out on bytes and
**1000x** out on rows.

🔴 **That authority stops at the budget, and so does the list above.**
`getQuota()` answers `{ usedBytes, rowCount, limitBytes, limitRows }` and
nothing more, so it reports neither of the other two ceilings: the host's
**200-character cap on `key`**, nor `APP_STORAGE_MAX_VALUE_BYTES`, which is a
per-**write** cap rather than part of the per-(app, viewer) budget. A write that
fits the quota reply is still refused if its key is too long or its value is
over the per-value cap — and for the key, nothing local catches it
([#370](https://github.com/civitai/civitai-app-starters/issues/370), detailed
below). Cap or hash long keys in your block.

🔴 **The ROW ceiling is usually the binding one, and a byte-based "x of y used"
readout will not see it coming.** A block caching one modest record per item a
viewer touches exhausts `limitRows` while still holding a small fraction of
`limitBytes`. Show rows too.

`createMockHost()` defaults to these same ceilings and enforces the per-value
cap, the byte budget and — since it was added — the **row** budget on write, so
a row-limit overrun now fails under `dev:mock` where it previously passed and
failed only in production. Pass `storage: { quotaBytes, limitRows }` to
simulate something smaller.

⚠️ The mock is **not** gate-for-gate identical to the host. Five known
divergences:

- the byte gate refusing a shrinking overwrite that the host admits
  ([#345](https://github.com/civitai/civitai-app-starters/issues/345));
- 🔴 the byte gate counting **wire** bytes where the host counts **stored**
  bytes — `octet_length(value::jsonb::text)`, larger for every container, up to
  ~1.5x ([#347](https://github.com/civitai/civitai-app-starters/issues/347));
- nothing models the **app-wide** umbrella, so `app quota exceeded` and `app row
  limit exceeded` cannot be produced here at all
  ([#368](https://github.com/civitai/civitai-app-starters/issues/368));
- lowering `valueCapBytes` moves the **gate** but not the **message**, which
  keeps naming the host's real cap
  ([#369](https://github.com/civitai/civitai-app-starters/issues/369));
- 🔴 no key-length cap: the host refuses a `key` over **200 characters**
  zod-side, and neither the mock nor `useAppStorage` does
  ([#370](https://github.com/civitai/civitai-app-starters/issues/370)).

Passing under `dev:mock` is evidence, not proof — and note that the second, the
third and the fifth are **permissive**: each lets a write pass locally that
production will reject. (#347 under-counts the bytes; #368 models no app-wide
ceiling at all, so a write the host would refuse with `app quota exceeded`
succeeds here; #370 admits an over-length key the host refuses outright.)
Size your fixtures against `getQuota()`, not against what the mock accepted.

🔴 **A rejection carries a host-authored MESSAGE, not a code.** There is no
`PAYLOAD_TOO_LARGE` on the wire — that is the TRPC *code*, and the host's
bridge forwards `err.message`. Six **ceiling** strings are measured and
single-sourced in the app-sdk's `blocks/appStorageErrors.ts` — one per
`PAYLOAD_TOO_LARGE` site in the host's router, plus the bridge's `storage
request failed` fallback — and `createMockHost` draws its rejections from that
same module, so for the ceilings the mock HAS it answers the message production
would send, and `classifyAppStorageError(err)` picks the same branch in both.

🔴 **Those six are not every string a block can receive — and nothing here
enumerates the rest.** The bridge catches every rejection out of
`apps.storage.*` with a *blanket* `catch` and puts its message on the same
`error` field, so the host's authorization, approval and feature-flag prose —
**plus tRPC's own zod input-validation messages, which never reach a handler at
all** — travel the identical path. **Every one of them classifies `null`.**

🔴 **One of those zod bounds is a ceiling a real block hits with no local
warning: `key` is capped at 200 characters** (`z.string().min(1).max(200)` on
the host's `get`/`set`/`delete` input schema; `list` also caps `prefix` at 200
and `cursor` at 400). Neither `useAppStorage` nor `createMockHost` caps the key
— both forward it verbatim and the mock has no length gate
([#370](https://github.com/civitai/civitai-app-starters/issues/370)) — so a key
built from a URL or a model name can save fine under `dev:mock` and fail
forever in production, classified `null`. **The reload the `null` arm below
recommends does not fix it.** Cap or hash long keys in your block.

That is the whole rule, and it is stated structurally on purpose: the SDK owns
a chosen slice of the ceiling vocabulary, not the host's error surface, so the
honest claim is "**these six** classify, everything else is `null`" — which
needs no list and stays true when the host adds or rewords a message. Note it
is deliberately *not* "every ceiling classifies": the zod key cap above is a
ceiling that lands on `null` like everything else. Two earlier drafts of this
section tried instead to enumerate the non-ceiling strings, and **both lists
were short**; see the header of `blocks/appStorageErrors.ts` for what they
missed and why no third list replaced them. `invalid block token` (an expired
token mid-session) and `block instance revoked` are *illustrations* of what
lands on `null`, never a bound on it. The practical consequence: `null` is a
busy bucket, so see the `default` arm note below before writing copy for it.

⚠️ **The mock reaches four of the six.** It models no app-wide umbrella
([#368](https://github.com/civitai/civitai-app-starters/issues/368)), so
`app quota exceeded` and `app row limit exceeded` are production-only: a block
must still handle them, and no local run will ever exercise that branch. The
other four are covered — the three ceilings, plus `storage request failed` via
`storage: { failNext }`.

Branch on the classifier's **reason**, never on the string. The reason is this
SDK's and cannot move; the message is the host's and can. (That is also why the
SDK exports `classifyAppStorageError` and the reason type, but deliberately does
*not* export the array of messages: `MESSAGES.includes(err.message)` is equality
against a snapshot, and the per-value message is a template over a cap the host
is free to change.)

```ts
import { classifyAppStorageError } from '@civitai/app-sdk/blocks';

let status = 'Saved.';
try {
  await storage.set(key, note);
} catch (err) {
  console.warn('[my-block] save failed:', err);  // log the host's words
  switch (classifyAppStorageError(err)) {        // never render them
    case 'value-too-large':
      status = 'That note is too long to save. Try shortening it.';
      break;
    case 'user-row-limit':
      status = 'You have no note slots left. Delete one to make room.';
      break;
    case 'request-failed':
      // The bridge's fallback — a transport fault. Genuinely retryable.
      status = 'Could not save that note. Please try again.';
      break;
    default:
      // `null`: an unknown ceiling, or (more often) an expired/revoked token.
      status =
        'Could not save that note. Try reloading the page — if that does not ' +
        'help, storage may be unavailable for this app right now.';
  }
}
```

🔴 **Keep the `default` arm, and do not put "please try again" in it.**
`classifyAppStorageError` answers `null` both for a ceiling message this SDK
version does not know (the host can reword one in any deploy) *and* for the
whole authorization family listed above — an expired block token, a revoked
instance, an unapproved block, a missing storage scope. Retrying fixes none of
the second group, so the generic arm should offer a **reload** (which re-mints
the token, and covers a transport blip too) and concede that storage may be
unavailable. Split `'request-failed'` out if you want honest retry copy: that
reason really is the transport one.

The mock emitted the *code* until
[#343](https://github.com/civitai/civitai-app-starters/issues/343), which is
how a block's error branch could pass every local run and never fire in
production.
````

**`useSharedStorage`**

```ts
useSharedStorage(): UseSharedStorage
```

App-scoped, append-only, community-votable SHARED datastore (every viewer sees the same list). Sibling of `useAppStorage`; anonymous viewers get the read path and a hard reject on mutations.

```tsx
const shared = useSharedStorage();
const { key } = await shared.append({ title: 'Add dark mode', body: 'please' });
const { items } = await shared.list({ limit: 20 });   // newest-first
const count = await shared.vote(key);                 // idempotent up-vote
await shared.unvote(key);
await shared.withdraw(key);                            // remove my own entry
```

````md
#### Shared-storage write limits

Every write is budgeted per **(viewer, app)** on the server. One viewer
exhausting their budget in your app costs them nothing in another app, and
re-minting the block token does not reset it.

| Writes | Budget |
|---|---|
| `append` + `update` (one shared budget) | a **burst of 10**, refilling **1 every 6 minutes**, and a **daily bucket of 50**, refilling continuously (one every ~29 minutes). A write needs a token from both. |
| — writes the server **refused** (moderation block, the 50-entry cap, quota, not found, …) | also charged to a **rejection bucket of 10**, refilling **1 every 30 minutes**. No `append`/`update` is accepted while it is empty. Concurrent refused writes can drive it into debt, down to −10, which has to refill first. |
| `vote` + `unvote` | 30 a minute, shared |
| `withdraw` | 30 a minute |
| `report` | 20 a day |

Only writes that **land** spend the `append`/`update` budget: a write that fails
without landing gets its token back. The few failures the platform marks as its
own fault are refunded without a rejection charge too.

> The `append`/`update` budget above goes live with the next civitai.com
> release. Until then the live limit is a fixed window of **20 posts + edits a
> day** per (viewer, app). The vote, withdraw and report limits, and the retry
> metadata below, are already live.

A write refused for budget arrives with retry metadata, and the hook rejects with
**`SharedStorageRateLimitError`**. It extends the plain `Error` every other
refusal is thrown as, so existing `catch` code keeps working, and `.message` is
still the server's text (`Too many submissions — retry in 312s`, or `votes`,
`withdrawals`, `reports`). Branch on the class to render the wait instead of
parsing the message:

```tsx
import { SharedStorageRateLimitError, useSharedStorage } from '@civitai/blocks-react';

const shared = useSharedStorage();
try {
  await shared.append({ title: 'Add dark mode' });
} catch (err) {
  if (err instanceof SharedStorageRateLimitError) {
    // err.retryAt: ISO-8601 instant a retry can succeed; err.retryAfterSeconds: whole seconds, ≥ 1.
    const at = new Date(err.retryAt).toLocaleTimeString();
    showNotice(`You're posting fast. Try again at ${at}.`);
  } else {
    throw err;
  }
}
```

- **Don't retry before `retryAt`.** A refused retry gets nothing, and once the
  budget is empty every attempt is refused until it refills.
- **Absent metadata is not "retry now".** A host that predates it, or a refusal
  that is not a rate limit, throws the plain `Error`. The hook also ignores a
  malformed `rateLimit` and throws the plain `Error`, rather than hand you
  something you would render.
- On the wire the refusal reply is `{ requestId, error, rateLimit?: { retryAfterSeconds, retryAt } }`
  (type `SharedStorageRateLimit` in `@civitai/app-sdk/blocks`) on the six write
  replies.
- `createMockHost({ shared: { rateLimitNext: 1, rateLimit: { retryAfterSeconds: 312 } } })`
  refuses the next write this way, so you can test the branch locally
  (`setScenario({ shared: { rateLimitNext } })` arms it mid-session).
````

**`useCheckpointPicker`**

```ts
useCheckpointPicker(): UseCheckpointPicker
```

Drive the platform Checkpoint picker + persist a viewer override. 🔴 **OMIT `baseModelGroup` BY DEFAULT.** It is an ecosystem-family FILTER, not a label: the host HIDES every checkpoint outside the family you pass, so passing the family you are already in is a trap — the picker then offers only the ecosystem the user is trying to leave. Omit it for an unconstrained pick and the host applies no narrowing at all, offering every checkpoint the viewer can generate with. Pass it ONLY when the block must stay inside a family it already holds — a regenerate/variation flow, say — and then DERIVE it from that checkpoint, never a hardcoded ecosystem string: a literal pins every viewer to whichever family the author happened to test with. `''` is **not** an escape hatch — it does not even mean the same thing on both hosts. On a **model slot** the host normalises whatever string you send, so `''` resolves to the real ecosystem key `Other` and NARROWS to that one family. On a **page** the host drops a zero-length value, so `''` behaves exactly like omitting it. Neither is what you meant on at least one surface: omit the key, or pass a family derived from a real checkpoint, and never `''`.

```tsx
import { isModelSlotContext } from '@civitai/app-sdk/blocks';

const { context } = useBlockContext();
const { open, persist } = useCheckpointPicker();

// DEFAULT — pass no baseModelGroup. The viewer can reach every family.
if (isModelSlotContext(context) && context.checkpoint) {
  const { selected } = await open({ currentVersionId: context.checkpoint.versionId });
  if (selected) await persist(selected.versionId);   // null clears the override
}
```

````md
Pass `baseModelGroup` **only** when the block must stay inside a family it already
holds — a regenerate or variation flow pinned to one checkpoint's ecosystem — and
then derive it from that checkpoint, never from a literal:

```tsx
import { isModelSlotContext } from '@civitai/app-sdk/blocks';

const { context } = useBlockContext();
const { open, persist } = useCheckpointPicker();

// ONLY to stay inside the family the block already holds — derived, never a literal.
if (isModelSlotContext(context) && context.checkpoint) {
  const { selected } = await open({ baseModelGroup: context.checkpoint.baseModel });
  if (selected) await persist(selected.versionId);
}
```

🔴 **`persist()` works on a model slot only. On a page it always rejects.** A
full-page app (`app.page`) is bound to no model, so the host has nowhere to write
the override: it answers every `persist()`, including `persist(null)`, with
`ok: false`, and the promise rejects with `page blocks cannot persist a
checkpoint override (no model binding)`. A page app keeps the checkpoint `open()`
returned in its own state (or in `useAppStorage()`).

Both dev hosts (`createMockHost` / `Harness` and `dev:live`) refuse it the same
way, and both default to a page context. Pass a complete `ModelSlotContext` as
`context` to exercise a block that persists. A test that expected `persist()` to
resolve under the default mock context was asserting something a page app never
gets: give it the model slot the block really runs in, or, for a page app, drop
the `persist()` call.
````

**`useResourcePicker`**

```ts
useResourcePicker(): UseResourcePicker
```

Drive the platform resource picker for page blocks — `'Checkpoint' | 'LORA'`. The viewer searches in host chrome; the block only ever sees what the viewer picked: one resource, or with `multiple` the few LoRAs they chose. DISCOVERY ONLY — a returned `versionId` is re-validated + re-priced server-side at estimate/submit. 🔴 **OMIT `baseModelGroup` BY DEFAULT, and never pass a HARDCODED ecosystem.** It is an ecosystem-family FILTER, not a label: the host hides every resource outside the family you pass, so a literal ecosystem string makes the viewer's own valid LoRAs invisible and the picker look empty or broken. Omit it for an unconstrained pick and the viewer sees everything of that type. Pass it ONLY when the block already holds a chosen checkpoint the pick has to match, and then DERIVE it from that checkpoint (`checkpoint.baseModel`). For stack and matrix apps that pair LoRAs with a checkpoint, this is the recommended pattern: a derived family keeps incompatible LoRAs out of the picker. This hook is PAGE-ONLY, and a page slot has no `context.checkpoint` (that field lives on `ModelSlotContext` alone), so the family comes from `BlockResourceInfo.baseModel`, the `baseModel` of a Checkpoint a picker returned earlier. For a complete multi-LoRA app, see [`starters/examples/generate-studio`](https://github.com/civitai/civitai-app-starters/tree/main/starters/examples/generate-studio): `src/components/ModelSection.tsx` fills one LoRA slot per picker session, up to `MAX_LORAS`, with a `baseModelGroup` derived from the selected checkpoint, and `keepCompatibleLoras` (`src/studio/setup.ts`) re-filters the stack when the checkpoint changes, dropping LoRAs made for another family. To fill several slots in ONE session, use `multiple` (below).

```tsx
const { open } = useResourcePicker();
const picked = await open({ resourceType: 'LORA' });   // unconstrained — the default
if (picked) {
  const versionId = picked.versionId;   // feed into body.additionalResources
  const weight = picked.strength;        // recommended default weight (may be undefined)
}
```

````md
Constrained to the family of a checkpoint the block already holds, derived from
that checkpoint, never from a literal:

```tsx
const { open } = useResourcePicker();

const checkpoint = await open({ resourceType: 'Checkpoint' });
if (checkpoint) {
  const matching = await open({
    resourceType: 'LORA',
    baseModelGroup: checkpoint.baseModel,   // from the pick above — BlockResourceInfo.baseModel
  });
}
```

**Several LoRAs in one session — `multiple: { max }`.** The viewer stages up to
`max` LoRAs in the picker and confirms once; `open` resolves with a **list**, in
the order the viewer picked them, instead of a single resource. Dismissing
resolves with `[]`.

```tsx
const { open } = useResourcePicker();

const loras = await open({ resourceType: 'LORA', multiple: { max: 3 } });
// [] when dismissed; otherwise up to 3 BlockResourceInfo, in pick order
const additionalResources = loras.map((lora) => ({
  modelVersionId: lora.versionId,
  strength: lora.strength ?? 1,
}));
```

- **LoRA only.** `multiple` with `resourceType: 'Checkpoint'` is a type error and
  rejects at runtime — it is never quietly treated as a single pick.
- **`max` is a whole number of at least 1, capped at 5** (the cap on
  `additionalResources`, exported as `RESOURCE_PICKER_MULTIPLE_MAX`). A larger
  value is clamped to 5; `0`, a negative or a fraction rejects.
- **`baseModelGroup` works the same** — pass the family derived from the
  checkpoint the block holds and every LoRA offered matches it.
- **Each entry is the same `BlockResourceInfo`** a single pick returns, and every
  id is still re-validated at estimate/submit.
- **Without `multiple`, nothing changes**: `open` resolves with one resource or
  `null`, exactly as before.
- **On a host that predates multi-select** the viewer gets the single-pick
  picker, and `open` still resolves with a list: of the one LoRA they picked, or
  `[]`. The result does not say which kind of host answered, so a one-item
  list is not a signal to open the picker again: on a current host it means the
  viewer chose one. Let the viewer add more with their own action instead.

With the mock host — `createMockHost` or `Harness` from
`@civitai/blocks-react/testing` — a `multiple` request resolves with two curated
LoRAs by default. Pass `cannedMultiPicks: [...]` to choose the list (it is cut to
the request's `max`), or `cannedMultiPicks: null` for a dismissed picker. The mock
answers a raw `multiple` + Checkpoint request with the host's error.
````

**`useImageUpload`**

```ts
useImageUpload(options: {
    purpose: 'generationSource';
}): UseImageUploadGenerationSource
```

Host-mediated image upload — the host opens its native upload modal and the iframe never handles the bytes. Resolves with a moderated image (or `null` on dismiss); pass `{ purpose: 'generationSource' }` for an unscanned img2img source or `{ asyncScan: true }` for the early-resolve + `scanStatus()` flow.

```tsx
const { open } = useImageUpload();
const img = await open();               // BlockUploadedImageInfo | null
if (img) {
  await submit({
    kind: 'textToImage',
    modelId,
    modelVersionId,
    sourceImage: { url: img.url, width: 1024, height: 1024 },
    params: { prompt },
  });
}
```

**`useUploadImageBytes`**

```ts
useUploadImageBytes(): UseUploadImageBytes
```

Upload an image the block **produced in the tab** (a healed PNG, an edited render), with no picker, so the app can then post it. Returns `{ upload }`. `upload(bytes, { filename? })` resolves with the same moderated image a picked `useImageUpload()` upload returns (`imageId`, `nsfwLevel`, `contentRating`, `url`). That `imageId` is postable by this app through `useCreatePostFromApp()` as a `{ kind: 'published', imageIds }` source. - 🔴 **Page apps only.** A slot (model) block's host has no handler for it. The host answers an unhandled request at once with its generic refusal, so on a slot `upload` rejects immediately with `unsupported on this host` rather than waiting out the 10-minute timeout. - 🔴 **Requires `posts:write:self`.** The server refuses the upload without it, and this hook does not prompt. Ask for the scope first with `useRequestConsent()` and upload only once `useBlockToken().scopes` holds it (the example below), because the upload runs before the `createPost()` call that would otherwise prompt. - **Images only:** PNG, WebP or JPEG by magic bytes. Anything else is refused with `file type is not allowed`. The host names the stored file from the sniffed type, whatever `filename` says. - **The cap is 40 MiB.** The hook refuses a larger buffer before sending it, with the host's error `file exceeds the maximum upload size`. The host also allows at most 3 uploads and 80 MiB per 60 seconds per page, and replies `busy` past that. - **The upload is blocking.** The host replies once the image is scanned, so allow for a wait of up to a few minutes. An image above the SFW ceiling or flagged by the scan is refused with the scan's message. - Pass an `ArrayBuffer` (`await blob.arrayBuffer()`). A `Blob`, a `Uint8Array` or an empty buffer is refused with `invalid image-upload request`. The buffer is copied, not transferred. `upload` **rejects** with the host's error string on every refusal: the ones above, `no block token`, or a server message passed through verbatim (the missing scope, the posting flag, page-only, a rate limit, the scan). It rejects with `the host returned no uploaded image` if the reply carries neither an image nor an error. If no reply arrives within 10 minutes it rejects with a `RequestTimeoutError`; the host may still have stored the image, so retrying after a timeout can create a duplicate. The hook ships in `@civitai/blocks-react` 0.67.0, and the `bytes` payload type it sends is in `@civitai/app-sdk` 0.62.0. What the upload does and does not give you on civitai.com: - 🔴 **Generation metadata embedded in the file is not read.** The posted image has no generation details (prompt, resources, sampler settings), whatever the PNG or JPEG carries. In the example below the healed pixels are posted, and the metadata the app repaired is not shown on the post. - 🔴 **Each uploaded image goes into exactly one post.** Once a post holds it, `createPost()` refuses that `imageId` with `an image is not available to post`. To post the same picture again, upload it again. - **An uploaded image never appears in `useGatedImages()`.** That read returns only what the app published with `usePublishGenerationOutputs()`. Keep the `imageId` and `url` that `upload` resolves with if you need to show it. - **A post holds at most 20 images and names at most 10 sources.** Past 20 images the server refuses with `a post may contain at most 20 images`. - **Posting from apps is still being rolled out.** A viewer who does not have it yet is refused with `posting from apps is not enabled`, and the refusal arrives from `upload` as well as from `createPost()`. Handle it as an ordinary error branch, not as a bug in your app. - **Creating the post needs an account with a verified email or a linked sign-in provider.** Other account checks apply too: onboarding must be finished, the account must not be brand new, and it must not be muted or banned. `upload` refuses a banned account but checks none of the rest, so a viewer can upload and then be refused at `createPost()`. - **Server-side limits also apply**, to the upload and to the post, beyond the host's per-page window above. A `busy` reply or a rate-limit error such as `Rate limit exceeded, please retry shortly.` means wait and retry.

```tsx
import {
  CreatePostError,
  useBlockToken,
  useCreatePostFromApp,
  useRequestConsent,
  useUploadImageBytes,
} from '@civitai/blocks-react';

function PostHealedButton({ healed }: { healed: Blob }) {
  const { scopes } = useBlockToken();
  const { requestConsent } = useRequestConsent();
  const { upload } = useUploadImageBytes();
  const { createPost } = useCreatePostFromApp();
  const canPost = scopes.includes('posts:write:self');

  async function onClick() {
    if (!canPost) {
      // Fire-and-forget: this opens the host's consent dialog and returns
      // nothing. On a grant the host pushes a new token, `scopes` updates and
      // the button re-renders as "Post". Never upload before that: the server
      // refuses the upload without the scope.
      requestConsent({ scopes: ['posts:write:self'] });
      return;
    }
    try {
      // 1. Bytes made in the tab, uploaded and scanned by the host.
      const image = await upload(await healed.arrayBuffer(), { filename: 'healed.png' });
      // 2. Posted through the existing bridge, with its own confirm.
      const post = await createPost({
        sources: [{ kind: 'published', imageIds: [image.imageId] }],
        title: 'Fixed with Metadata Healer',
      });
      showToast(`Posted! ${post.url}`);
    } catch (err) {
      if (err instanceof CreatePostError && err.declined) return; // the viewer said no
      showToast((err as Error).message); // e.g. 'busy', 'file type is not allowed'
    }
  }

  return <button onClick={onClick}>{canPost ? 'Post' : 'Allow posting'}</button>;
}
```

```md
Under `createMockHost` / `Harness` the host's checks run in the host's order:
the cap, then the window, then the type. `uploadImageBytesResult` sets the
image an accepted upload returns, `uploadImageBytesError` forces a refusal
(for example `block lacks posts:write:self scope`), and `onUploadImageBytes`
reports what was accepted. The mock's `CREATE_POST_FROM_APP` checks a
`published` source with the server's rule and refusal strings, but not its
data. Production accepts the viewer's own images that this app stamped and that
are not in a post yet, including ones from earlier sessions. The mock has no
earlier sessions, so it accepts only ids it issued as postable in this session
(an accepted bytes upload, or a `PUBLISH_GENERATION_OUTPUTS` reply) plus the
ids you seed with `createMockHost({ postableImageIds: [...] })`, each in one
post only. Any other id, a picked `useImageUpload()` id (production leaves it
unstamped) or an already-posted id is refused with
`an image is not available to post`. The mock does not model the page-only
rule, the scope check, the real scan, or an older host's picker. `dev:live` has
no bytes path: `upload` rejects with `the host returned no uploaded image`.
```

**`useImagePicker`**

```ts
useImagePicker(): UseImagePicker
```

Let the viewer pick one of their **existing** Civitai images: the ones they have posted, and the ones they made with the Civitai generator. The host opens its own picker over the viewer's library, and your app receives only what the viewer picked. Returns `{ open }`. `open()` resolves with one image, or `null` if nothing was picked.

```tsx
const { open } = useImagePicker();

const image = await open();   // BlockPickedImageInfo | null
if (image) {
  // image.source     'posted' | 'generated'
  // image.url        a Civitai-hosted image URL
  // image.width, image.height
  // image.nsfwLevel  the image's rating; it can be a mature level
  // image.imageId    set for a posted image, undefined for a generated one
}
```

````md
**Several images in one session: `multiple: { max }`.** `open` then resolves with
a **list** of up to `max` images instead of a single image, or `[]` if nothing
was picked.

```tsx
const { open } = useImagePicker();

const images = await open({ multiple: { max: 5 } });
// [] when nothing was picked; otherwise 1 to 5 images
const urls = images.map((image) => image.url);
```

**One library only: `sources`.** Pass `['posted']` or `['generated']` to offer
just that library. Leave it out to offer both.

```tsx
const { open } = useImagePicker();

const output = await open({ sources: ['generated'] });
// output?.imageId is always undefined here: a generator output has no image id
```

If your app decides at runtime whether to ask for one image or several, pass
`multiple` as a value that may be `undefined`. The result is then either shape,
so narrow it with `Array.isArray`:

```tsx
const { open } = useImagePicker();

const picked = await open({ multiple: allowSeveral ? { max: 3 } : undefined });
const images = Array.isArray(picked) ? picked : picked ? [picked] : [];
```

What the viewer can pick, and what you get back:

- **The host decides what is pickable.** Posted images: the viewer's own, in a
  published post, fully scanned, not flagged and rated. Generated images: the
  viewer's own finished generator outputs that have a rating. In both cases the
  viewer is offered only what their own browsing settings on Civitai allow them
  to see. An unrated image is never offered. Images only, no video. Your app
  never sees the rest of the library.
- 🔴 **A pick can be a mature image.** `nsfwLevel` is the image's rating, and it
  is never `0`. The image was offered to this viewer under this viewer's own
  settings. That says nothing about anyone else. If your app shows a pick to
  anybody other than the viewer who picked it (a shared board, a gallery, a
  public post), it is your app's job to check `nsfwLevel` and decide who may
  see it.
- **`imageId` is set only on a posted image.** A generator output that was never
  posted has no image id, so check `image.source` or `image.imageId` before you
  use it.
- **A posted pick's `url` is a resized copy, not the original file.** `width` and
  `height` are the size that copy is requested at. The host chooses one with both
  sides between 64 and 2048 pixels, and a small original is scaled up. The image
  server normally returns exactly that size, but it can return the original
  while the resized copy is still being produced. A posted image that has no
  size in that range (a very long or very wide one) is not offered.
- 🔴 **A generated pick's `url` is the generator's own output link and may stop
  working after a while.** Use it soon after the pick and do not store it for
  later. Its `width` and `height` are the output's own size.

What `open` resolves and rejects with:

- **`null` (or `[]` with `multiple`) means nothing was picked.** Usually the
  viewer closed the picker. A signed-out viewer sees the picker with a sign-in
  button, and closing it gives the same result. The host also answers this way
  immediately, without showing a picker, while your app is being viewed in
  review mode or is not ready yet.
- **`max` is a whole number of at least 1, capped at 20** (exported as
  `IMAGE_PICKER_MULTIPLE_MAX`). A larger value is clamped to 20. `0`, a negative
  number or a fraction rejects before anything is sent, and so does an empty
  `sources` or a value other than `'posted'` and `'generated'`.
- **A refusal rejects.** If the host refuses the request, `open` rejects with an
  `Error` carrying the host's message. It never resolves with `null` for a
  refusal.
- **Page apps only.** On any other surface the host answers at once and `open`
  rejects with `unsupported on this host`.
- **On a host that does not have the picker yet**, the request gets no answer and
  `open` rejects with a `RequestTimeoutError` after 10 minutes.

Using a pick as the source image of a generation: a pick's `url` is hosted by
Civitai, so `{ url, width, height }` passes the address check a generation body
makes on its `sourceImage`. That is the only thing this hook settles. The
generation body has its own rules, including 64 to 2048 pixels per side. A posted
pick is already within that range. A generated pick can be larger, and a
generation body refuses a size above 2048.

With the mock host (`createMockHost` or `Harness` from
`@civitai/blocks-react/testing`) there is no picker to click through: `open`
resolves at once. By default the mock holds one posted image and one generated
image. Pass `cannedImagePicks: [...]` to set the viewer's library. The mock keeps
only the images matching the request's `sources`, then answers a single pick with
the first one and a `multiple` pick with the first `max`. `cannedImagePicks: null`
is a viewer who always closes the picker. Like the host, the mock offers a
repeated image once and drops an `imageId` from a generated image. It does not
model browsing settings or ratings: it returns whatever `nsfwLevel` you give an
image, so use that to test how your app handles a mature pick. The mock refuses
an invalid `sources` or `multiple` with an error, and answers
`unsupported on this host` when its `context` is a model slot. `dev:live` cannot
list the viewer's images, so there `open` rejects with a message saying to use
the mock host.
````

**`useSaveImage`**

```ts
useSaveImage(): UseSaveImage
```

Ask the host to download a file to the viewer's device. **A block cannot download anything itself.** Its sandbox lacks `allow-downloads`, and the validator refuses that token for unverified blocks, so an `<a href="blob:…" download>` click silently does nothing. 🔴 **This hook is the sanctioned way to deliver a file**, including one the block produced in the tab. Pass exactly ONE of three inputs, each gated differently by the host: - **`{ url }`**: the block's own generation output. The host allowlists the origin to the civitai image CDN and refuses any other. - **`{ imageId }`**: an image from another user, read through the same per-viewer gate as `useGatedImages()`. A withheld image is never saved. - **`{ bytes }`**: an `ArrayBuffer` the block made in the tab, such as a healed image or a JSON sidecar. 🔴 **Page apps only.** The host classifies it by CONTENT. It accepts PNG, WebP and JPEG by magic bytes. Anything else must be valid UTF-8 with no NUL byte: it is saved as JSON when it parses and `filename` ends `.json` (any case) once the host has replaced each `?` and `#` with `_`, and as plain text otherwise. A GIF, a zip or other binary is refused with `file type is not allowed`. The host forces the extension from the classified type. The cap is 50 MiB, and the hook refuses a larger buffer before sending it: `file exceeds the maximum save size`. The buffer is copied, not transferred, so you can keep displaying it. 🔴 **On a host that predates the `bytes` variant, `saveImage({ bytes })` rejects with `invalid save-image request`.** The host also replies that when the input is not exactly one variant, or when `bytes` is empty or not an `ArrayBuffer`. Pass `await blob.arrayBuffer()`, not the `Blob` or a `Uint8Array`. The promise resolves once the host has started the download. On any refusal it rejects with the host's error string, which can also be `busy` when too many saves are in flight.

```tsx
import { useSaveImage } from '@civitai/blocks-react';

const { saveImage } = useSaveImage();

// A file healed in the tab. It never leaves the device except to the viewer's disk.
const healed: Blob = await healPngMetadata(file);
await saveImage({ bytes: await healed.arrayBuffer(), filename: 'healed.png' });

// Its JSON sidecar. The .json filename makes valid JSON save as .json rather than .txt.
const sidecar = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
try {
  await saveImage({ bytes: sidecar.slice().buffer, filename: 'healed.json' });
} catch (err) {
  // 'invalid save-image request' here means this host cannot save bytes yet.
  setStatus(`Could not save the sidecar: ${(err as Error).message}`);
}

// The block's own generation output, or another user's image.
await saveImage({ url: output.url, filename: 'render.png' });
await saveImage({ imageId: cell.imageId });
```

```md
Under `createMockHost` / `Harness` the `bytes` variant is classified the same
way. `onSaveBytes` reports what would have been downloaded, and `saveImageError`
forces a refusal. Pass `saveImageError: 'invalid save-image request'` to test a
host without the variant. `dev:live` refuses every save.
```

**`useGenerationResources`**

```ts
useGenerationResources(): UseGenerationResources
```

Rehydrate a saved set of generation resources by version id — WITHOUT re-opening the picker. Returns the same widened projection `useResourcePicker` yields (recommended weights, trigger words, clipSkip). DISCOVERY ONLY.

```tsx
const { fetch } = useGenerationResources();
const resources = await fetch([691639, 666002]);   // by saved versionIds
const first = resources[0];             // .versionId / .strength / .trainedWords / .clipSkip
```

**`useCivitaiNavigate`**

```ts
useCivitaiNavigate(): UseCivitaiNavigate
```

```md
Request a navigation from the host. The hook sends a `NAVIGATE` message and
returns — fire-and-forget, so the block never learns what the host did,
including when the host **refuses** the request.

`scope` selects the **space** `path` is resolved in, and it **defaults to
`'app'`**:

| `scope` | `path` resolves | The viewer |
|---|---|---|
| `'app'` *(default)* | under **this app's own route**, as a sub-path of it | stays in your app; the page stays mounted |
| `'site'` | at the **civitai.com root** | leaves your app for a site page |

> 🔴 **A leading slash carries no meaning.** The host normalises it away in
> **both** scopes, so `'/settings'` and `'settings'` are one request within
> whichever scope you chose. That means `navigate('/models/12345')` asks for
> **your app's** `/models/12345` — *not* civitai's model page. To reach the
> civitai.com page, say so: `navigate('models/12345', { scope: 'site' })`.
>
> Both spellings were app-scoped before `scope` existed, so no call you have
> already written changed meaning — that is the point of the default.

`'site'` is granted **per-surface**: the public run page and the dev tunnel allow
it, and a private run or a moderator's review preview refuse it. A refusal is
silent, so do not build a flow that needs to know it happened.

`target` is a REQUEST, not a guarantee. How the host acts on `'current'` vs
`'new_tab'` is host-side behaviour and the host is the authority on it; this
package sends the message and makes no promise about the outcome.

> 🔴 **Nothing in your manifest enables `'new_tab'`.** In particular, do **not**
> declare `allow-popups-to-escape-sandbox`: the host intersects a manifest's
> `iframe.sandbox` with a fixed allowlist that does not contain that token, so it
> is dropped for every block at every trust tier and declaring it has no effect.
> Earlier versions of this page said `'new_tab'` required it — that was wrong.
```

```tsx
const { navigate } = useCivitaiNavigate();

// Your app's own pages — the default.
navigate('settings');                    // this app's /settings
navigate('/settings');                   // identical; the slash means nothing

// A civitai.com page — needs an explicit scope.
navigate('models/12345', { scope: 'site' });
navigate('models/12345', { scope: 'site', target: 'new_tab' });

// The pre-`scope` two-argument shape still works, and is still app-scoped.
navigate('detail/7', 'new_tab');
```

```md
An app-scoped `navigate()` is **half** of a round trip. The host owns the
history, so the way your block learns where it ended up is
[`useCivitaiRoute()`](#usecivitairoute) — read that next if you are routing.
```

**`useCivitaiRoute`**

```ts
useCivitaiRoute(): UseCivitaiRoute
```

The sub-path below your app's root that is **currently showing**. This is the other half of an app-scoped [`useCivitaiNavigate()`](#usecivitainavigate): you ask the host to move, the host pushes it shallowly so your frame stays mounted, and this is how you find out where you went.

```tsx
function Router() {
  const subPath = useCivitaiRoute(); // '' on your app's index
  const [view, id] = subPath.split('/');
  return view === 'compare' ? <Compare id={id} /> : <Index />;
}
```

```md
It also reports the moves you **did not** ask for: the viewer's own
back/forward, and a deep link the host resolved after init.

Two things set the value — `BLOCK_INIT`'s `context.subPath` at mount, and the
host's `ROUTE_CHANGED` push on every later change. **The first value is never a
message**, which is why this is a value hook rather than an `onRouteChanged`
callback: a callback alone cannot see where the block started, and a change that
lands before its subscription effect runs is lost. It is the same value as
`useBlockContext().context.subPath` on a page slot — reach for this when the
route is all you need, and because its return type is a plain `string` instead of
a field on a union you have to narrow.

> 🔴 **No leading slash.** The host sends the segment below your app root, so
> `subPath === 'compare/42'` is the comparison that works and
> `subPath === '/compare/42'` is the one that silently never matches.

> 🔴 **`''` is a real route — your app's index — and it is also the pre-init
> value.** The two are indistinguishable from this hook alone, exactly as
> `'light'` is both a real theme and [`useBlockTheme()`](#useblocktheme)'s
> pre-init value. Gate on `useBlockContext().ready` if your first paint must tell
> them apart.

> 🔴 **Read it on every render.** A block that copies the value into state once
> at mount, or routes imperatively in a mount-only effect, stays on the route it
> started with — the URL moves and nothing renders, which is the exact symptom
> this message exists to end.

**Page slot only.** A model-page slot has no route of its own, so this returns
`''` there and never moves. Against a host that predates `ROUTE_CHANGED` the
value simply stays at the init sub-path (the old behaviour); nothing awaits the
message, so there is no hang either way.

Exercise it locally with `pnpm dev:live`, where `navigate()` drives the real
message end-to-end. `createMockHost` has **no** route control, deliberately: it
does not handle `NAVIGATE` at all and has no URL to move, so a synthetic setter
there would be a second, weaker way to produce a message the live host already
produces from the call a block actually makes.
```

**`useBlockAnalytics`**

```ts
useBlockAnalytics(): UseBlockAnalytics
```

Custom events for your app's analytics panel. Fire-and-forget: no reply, no acknowledgement.

```tsx
const { track } = useBlockAnalytics();
track('generate_clicked', { mode: 'txt2img', batch: 4 });
```

````md
🔴 **Only what your manifest DECLARES is recorded.** Declare every event, and
every property it carries, under `analytics.events` in `block.manifest.json`.
Events are accepted against the APPROVED manifest, so a reviewer sees what your
app tracks:

```json
"analytics": {
  "events": {
    "generate_clicked": {
      "description": "User pressed Generate",
      "properties": {
        "mode": { "type": "enum", "values": ["txt2img", "img2img"] },
        "batch": { "type": "number" },
        "advanced": { "type": "boolean" }
      }
    }
  }
}
```

| You send | Production |
|---|---|
| A declared event, declared properties of the declared type | Recorded |
| An event the manifest does not declare | Counted as a drop; its name and properties are not stored |
| A property the event does not declare | Dropped; the rest of the event is recorded |
| A value of the wrong type, or a string that is not one of the enum's values | Dropped; the rest of the event is recorded |

- **Types are `enum`, `number` and `boolean`.** There is no free-text string, so
  a prompt, an email or a username cannot be recorded. A `number` is not
  range-limited: do not use one to carry an identifier.
- **Names** are lowercase snake_case (a letter, then up to 63 of `a-z`, `0-9`,
  `_`). At most 50 events per app and 10 properties per event.
- **Limits.** Each mount of your app may send 10 events a second and 500 in
  total, in bodies of at most 32 KiB. An event over a limit is dropped in the
  browser and counted nowhere, so the panel's numbers are floors.
- **Where.** Events are recorded only from the production site.
- **What owners see.** Aggregates in the app's analytics panel: per declared
  event, counts, unique signed-in viewers and property breakdowns. Signed-out
  viewers are counted as events, never identified. The team's own activity is
  excluded by default. Individual events are never shown.

**Check it locally.** Pass your manifest to `createLiveHost` (see
[`/live`](#in-a-devlive-harness)); in `dev:live` the console then warns once per
undeclared event, undeclared property, or value of the wrong type. Every
`starters/examples/*` harness does this.
````

**`useRequestSignIn`**

```ts
useRequestSignIn(): UseRequestSignIn
```

Ask the host to open its sign-in flow for an ANONYMOUS viewer (fire-and-forget). On sign-in the host re-inits the block with the now-authenticated viewer.

```tsx
const { requestSignIn } = useRequestSignIn();
// e.g. onClick of a "Sign in to generate" button:
requestSignIn();
```

**`useRequestConsent`**

```ts
useRequestConsent(): UseRequestConsent
```

The manual version of the above — still exported, still the right tool when you want to prompt *before* a call (e.g. on an onboarding screen) rather than after one fails. Lazy consent: ask the host to open its consent UI when a LOGGED-IN viewer takes an action whose consent-gated scope the block token is missing (e.g. Generate needs `ai:write:budgeted` but the viewer hasn't granted it). Fire-and-forget — on grant the host pushes a new token; observe `useBlockToken().scopes` and retry.

```tsx
import { useRequestConsent } from '@civitai/blocks-react';

const { requestConsent } = useRequestConsent();
requestConsent({ scopes: ['ai:write:budgeted', 'buzz:read:self'] });
```

```md
🔴 **Always pass `scopes`, with a real scope name in it — it is optional in the
signature but a precondition for the refusal path below.** The host grants the
missing set it computed at mint, so a bare `requestConsent()` still opens the
consent dialog. But `CONSENT_UNAVAILABLE` is computed *from the hint*: with no
explicit scope proven un-grantable, the host cannot tell "can never be granted"
from "the viewer hasn't confirmed yet", so it stays silent rather than guess.

The bar is an array holding **at least one non-empty string** — not merely "an
array is present". `undefined`, a non-array, `[]`, `['']` and `[1, 2]` all
produce silence, in `pnpm dev` and in production alike, so
`requestConsent({ scopes: [] })` follows the instruction and still receives
nothing. To its author that reads as a broken message rather than a thin
argument.
```

**`useConsentUnavailable`**

```ts
useConsentUnavailable(): UseConsentUnavailable
```

Some environments withhold a scope at mint (a dev-tunnel preview token, a surface that carries no money scope), so no consent round-trip can ever add it. The host then pushes an uncorrelated `CONSENT_UNAVAILABLE` — *not* a reply, because `REQUEST_CONSENT` carries no `requestId`. Consume it and stop telling the user to retry something that can't succeed:

```tsx
import { useConsentUnavailable, useRequestConsent } from '@civitai/blocks-react';

function ConsentAwareGenerate() {
  const { requestConsent } = useRequestConsent();
  const { refusal, reset } = useConsentUnavailable();

  // 🔴 Branch on `refusal !== null`, NEVER on `refusal.scopes.length`. The host
  // refuses on its own unfiltered set but names only scopes in the public
  // vocabulary, so `scopes: []` is a legitimate refusal — gating on the length
  // silently drops the very message you subscribed for. Use the names for copy.
  if (refusal) {
    return (
      <div>
        <p>Generating isn't available on this page.</p>
        <button onClick={reset}>Try again</button>
      </div>
    );
  }
  // 🔴 `scopes` is REQUIRED for a refusal to ever arrive — see above.
  return <button onClick={() => requestConsent({ scopes: ['ai:write:budgeted'] })}>Generate</button>;
}
```

````md
`refusal` holds the latest `ConsentUnavailablePayload` (`{ reason, scopes }`) or
`null`; `reset()` clears it, since a refusal is scoped to the scopes that were
asked for and shouldn't latch for the life of the block. Against a host that
never sends the message the hook simply stays `null` — nothing awaits it, so
there is no timeout to hit.

🔴 **The push is UNCORRELATED, and that is the permanent shape of this API.**
`REQUEST_CONSENT` carries no `requestId`, so a refusal cannot be matched to the
request that provoked it. Two consequences to design around:

- **Every mounted `useConsentUnavailable()` sees every refusal.** There is no
  reliable filter: `scopes` is advisory and may legitimately be `[]`, so it
  cannot serve as a correlation key. If two independent parts of your block
  request different scopes, both will see both refusals. Keep a request and its
  refusal UI in one component, or track the outstanding request yourself.
- **A refusal is buffered across mounts, so one that arrives while the consumer
  is unmounted is not lost.** The transport hands an unsolicited push only to
  handlers registered at the instant it arrives, so without this a refusal that
  landed before the consumer mounted — the requester and the consumer being
  different components, or the consumer being conditionally rendered — vanished,
  and the block went back to showing "click Generate again" beside the host's
  "unavailable". `requestConsent()` arms the buffer as it sends. It keeps only
  the latest refusal, is dropped when the block token changes (a refusal is a
  claim about *that* token's scopes, and the grant path re-mints), and is cleared
  by `reset()` — so the "Try again" button above genuinely resets, rather than
  having the refusal reappear on the next mount. A `REQUEST_CONSENT` you post
  through the raw transport instead of the hook does not arm it.

Without the hook (a non-React consumer, or one wiring the transport directly),
the same push is available untyped — note the explicit type import, which the
cast needs and which the hook makes unnecessary:

```tsx
import { getTransport } from '@civitai/blocks-react';
import type { ConsentUnavailablePayload } from '@civitai/app-sdk/blocks';

const unsubscribe = getTransport().onMessage('CONSENT_UNAVAILABLE', (payload) => {
  // `onMessage` hands you `unknown`; this cast is UNCHECKED, which is why
  // `useConsentUnavailable()` is the preferred path.
  const { reason, scopes } = payload as ConsentUnavailablePayload;
  console.info('permission unavailable', reason, scopes);
});
```

To exercise the refusal locally, run the mock host with
`createMockHost({ consentGrantable: false })`, flip it live with
`host.setScenario({ consentGrantable: false })`, or append `?consent=ungrantable`
to the dev harness URL — the `<Harness>` chrome then reads `consent=ungrantable`
rather than `withheld`. `dev:live` emits it too: live mode can grant nothing, so
any request for a scope your dev token lacks produces one.
````

**`useDomainMaturity`**

```ts
useDomainMaturity(): UseDomainMaturity
```

Read the maturity ceiling in force for the current viewer, so a block can hide/blur mature affordances. **Fail-closed SFW** until `BLOCK_INIT` lands or against a host that projects no ceiling.

```tsx
const { isSfw, isLevelAllowed } = useDomainMaturity();
const showRSlider = isLevelAllowed(BrowsingLevel.R);   // false on a SFW domain
```

````md
The gates account for **two** things, and the distinction matters:

| field | answers |
| --- | --- |
| `maxBrowsingLevel` | what this **domain** permits anybody (identical for every viewer on it) |
| `effectiveBrowsingLevel` | what **this viewer** may be shown here — the domain ceiling narrowed by their own NSFW setting |

`isSfw` / `isLevelAllowed` gate on the second, so a viewer who turned NSFW off
sees SFW affordances even on a mature domain. `effectiveBrowsingLevel` is always
a subset of `maxBrowsingLevel`, so reading these can only ever show the viewer
**less** — never more. Compare the two when you want to explain *why* something
is hidden:

```tsx
const { maxBrowsingLevel, effectiveBrowsingLevel } = useDomainMaturity();
const hiddenByYourSettings = effectiveBrowsingLevel !== maxBrowsingLevel;
```

The hook's name is historic — it shipped when the domain ceiling was the only
signal. There is deliberately no separate viewer-maturity hook: two hooks would
mean two answers to "may I show this", and the one named for the domain would be
the wider of the pair.

Drive it locally with `createMockHost({ domain: 'red', viewerBrowsingLevel: BrowsingLevel.PG })`.
The mock clamps that option to its own ceiling exactly as the real host does, so
you cannot test against a viewer wider than the domain — production cannot
produce one either.
````

**`useTip`**

```ts
useTip(): UseTip
```

Send a Buzz TIP from the viewer through the block-token-gated `POST /api/v1/blocks/tip` REST endpoint (scope `social:tip:self`). Direct-fetch (bypasses the postMessage bridge) against the VALIDATED host origin (`useHostOrigin()`) with the block bearer token (`useBlockToken().raw`) — the same security-reviewed pattern as {@link useGenerationResources}. The SENDER is always the token subject (server self-binds it); the block never supplies a `fromUserId`. IDEMPOTENCY: pass a stable `options.idempotencyKey` to make a retry-after- timeout safe (the server replays the first terminal result). Omitting it mints a fresh key per call, so each call is a distinct logical tip. 🔴 THE KEY'S FORMAT IS CONSTRAINED — see {@link TipOptions.idempotencyKey}. Letters, digits, `_` and `-` only, at most 64 characters, **no colons**; the host 400s anything else, and this hook now refuses it before the POST. 🔴 THIS EXAMPLE USED TO RECOMMEND `React.useId()`, AND THAT WAS A LIVE DEFECT: `useId()` wraps its value in characters outside the allowed class on most of the React versions this package's peer range admits (`^18.0.0 || ^19.0.0`) — React 18.3.1 returns `":R0:"` and early React 19 a guillemet-wrapped id, both of which 400. (React 19.2.6, resolved in this repo today, happens to return `_r_0_`, which does clear the charset — so the bug was INVISIBLE here while being guaranteed for a consumer on 18.) Anyone copying that line shipped a guaranteed rejection. Prefer a stable id you already have, which is also better idempotency: it is tied to the THING being tipped rather than to a component instance, so it survives a remount.

```tsx
// No natural id to hand? Mint one with the SDK's generator and persist it
// for as long as the logical tip lives. Do NOT post-process `useId()` into
// shape: rewriting a key is exactly what this SDK refuses to do, because a
// silently-rewritten key breaks the identity the key exists to carry.
import { generateIdempotencyKey } from '@civitai/blocks-react';
const keyRef = React.useRef(generateIdempotencyKey());
await tip({ toUserId: 123, amount: 50 }, { idempotencyKey: keyRef.current });
```

**`useTipAllowance`**

```ts
useTipAllowance(): UseTipAllowance
```

Read the viewer's REAL remaining daily tip allowance `{ cap, spent, remaining }` through the block-token-gated `GET /api/v1/blocks/tip-allowance` REST endpoint (scope `social:tip:self` — the SAME scope the app already holds to tip, so no manifest change). Direct-fetch against the validated host origin with the block bearer token, the same pattern as {@link useGenerationResources}. Lets a block show a genuinely-tracked remaining allowance and disable the tip button at the true ceiling — instead of a dead client-side full-cap guess (`localStorage` is inert in the opaque-origin sandbox). Fetches once on mount and exposes `refetch` (call it after a successful `useTip().tip(...)`). Only the LATEST request may write state: a reply superseded by a newer `refetch` — or one that lands after unmount — is dropped (#392). If the host origin never arrives the hook reaches a TERMINAL state rather than spinning: see `error` above (#398).

```tsx
const { allowance, refetch } = useTipAllowance();
// allowance?.remaining — Buzz the viewer may still tip today
```

**`usePublishGenerationOutputs`**

```ts
usePublishGenerationOutputs(): UsePublishGenerationOutputs
```

Publish selected outputs of one of the calling app's OWN generations into bare, real-scanned public `Image` rows via the host-mediated `PUBLISH_GENERATION_OUTPUTS` → `PUBLISH_RESULT` bridge. Token-bound + fail-closed: the host self-binds the account off the block token, re-derives (viewer, app, workflowId) ownership before reading the workflow, and re-uploads + FULL-scans each selected output server-side (no url ever crosses from the iframe). The result is a set of bare (post-less) scanned `Image` row ids — no Post, no gallery attach, no rewards/notifications. Host-chrome shows a consent confirm before anything is published, and because that confirm waits on a human the request carries {@link HUMAN_INTERACTION_TIMEOUT_MS}, not the default protocol timeout. `dev:live` refuses this bridge: publishing requires the viewer's signed-in civitai.com session, which the local harness does not have, so `publish()` rejects with a message saying so. Test publishing against the mock host — `createMockHost` or `Harness` from `@civitai/blocks-react/testing`, with the `publishImageIds` / `publishError` options.

```tsx
const { publish } = usePublishGenerationOutputs();
const imageIds = await publish({ workflowId: w.workflowId, imageIndexes: [0, 2] });
// …store imageIds via useSharedStorage() so the grid can read them back gated.
```

**`useGatedImages`**

```ts
useGatedImages(): UseGatedImages
```

Read per-viewer gated display data for a list of image ids via the host-mediated `GET_IMAGES_BY_IDS` → `IMAGES_RESULT` bridge — the read side of a cross-user image grid (e.g. ids stored via `useSharedStorage()`). The host applies the requesting viewer's browsing-level clamp server-side and returns each image as `visible` (url, plus a rating UNLESS it is the viewer's own not-yet-rated image) or `hidden` (NO url — above ceiling / flagged / scan-refused / someone else's unrated image). This is the load-bearing cross-user moderation boundary: an unclamped edge URL never crosses to a viewer who can't see the image, and the block must render a placeholder for any `hidden` entry. 🔴 A `hidden` ENTRY IS NARROWED TO `{ imageId, status }` BEFORE IT REACHES HERE, and that is enforced in code rather than asserted in prose: the transport runs `projectInboundPayload` on every `IMAGES_RESULT` before delivery (`src/transport/validate.ts`), so a `previewUrl`, `src`, `imageUrl` or any other key a host attaches to a withheld image is DROPPED, not forwarded. Fields are dropped rather than the reply rejected so a future host-side field addition cannot hang this call — see `projectGatedImage`'s docblock. 🔴 `nsfwLevel` AND `contentRating` ARE OPTIONAL, AND A MISSING ONE IS NOT "G". They are absent exactly when `ratingPending` is present. Treating absent as a safe default is the bug this state exists to stop: an image published seconds earlier came back `hidden` under the old two-state contract and a grid rendered it as *"Hidden — rated mature"*, a maturity claim about an image nothing had rated, which a page reload then contradicted.

```tsx
const { getImages } = useGatedImages();
const images = await getImages([101, 102, 103]);
for (const image of images) {
  if (image.status === 'hidden') renderPlaceholder(image.imageId);
  else if (image.ratingPending) renderStillProcessing(image.url); // NO rating to show
  else renderRated(image.url, image.contentRating);
}
```

**`useRunTraining`**

```ts
useRunTraining(): UseRunTraining
```

Run an App Blocks `kind: 'training'` LoRA training — the only way one starts — through the host-mediated `RUN_TRAINING` → `TRAINING_RESULT` bridge. 🔴 AVAILABILITY: page apps only, behind the host flag `app-blocks-training-kind` (ships off), with `ai:write:budgeted` declared and granted by a signed-in viewer. Refused from `dev:live` and from review sessions — build the flow against the mock host. See `WorkflowBodyTraining` in `@civitai/app-sdk`. The flow: `usePrepareTrainingDataset()` → `useBuzzWorkflow().estimate(body)` (its `trainingQuote.quoteId`) → `runTraining({ ...body, quoteId })` → `useBuzzWorkflow().watch(workflowId)`. Change nothing in the body between the estimate and the run: the server checks it against the quoted one. 🔴 THE CONSENT DIALOG IS CIVITAI'S, AND IT IS THE CHARGE. Every number on it is read back from the server's stored quote — never from your body. A run may cost more than the token's per-call budget (the viewer confirms the exact price), up to `BLOCK_TRAINING_MAX_BUZZ_PER_RUN` (5,000 Buzz). Images are the viewer's own. 🔴 NO AUTOMATIC CONSENT RETRY, unlike the other consent-gated hooks — on purpose. `RUN_TRAINING` carries no idempotency key and has an outcome (`submission-unconfirmed`) where a run may exist, so this hook never re-sends. It is also unreachable in practice: a block holding a `quoteId` got it from an estimate that already required `ai:write:budgeted`. Sent under the 10-minute human-interaction bound: the host replies only when the viewer clicks or dismisses its dialog.

```tsx
const { estimate, watch } = useBuzzWorkflow();
const { runTraining } = useRunTraining();
const quote = (await estimate(body)).trainingQuote!;
try {
  const started = await runTraining({ ...body, quoteId: quote.quoteId });
  await watch(started.workflowId, { onUpdate: render });
} catch (e) {
  if (!(e instanceof RunTrainingError)) throw e;
  if (e.declined) return;                          // no run — say nothing
  if (e.signInRequired) return requestSignIn();
  if (e.unconfirmed) return showCheckYourTrainings(); // may be running — never auto-retry
  if (e.refused) return showError(e.message); // a cap / availability refusal; no run, nothing charged
  showError('Could not start training. Get a new price and try again.');
}
```

**`useDirectLoad`**

```ts
useDirectLoad(options?: UseDirectLoadOptions): UseDirectLoad
```

Detect a DIRECT (unembedded) top-level load of a block and, after a short grace period, report it so the SDK can show an "Open on Civitai" fallback instead of hanging on the perpetual loading state. Returns `true` ONLY when BOTH hold: 1. The block is TOP-LEVEL (`window.self === window.top` — not in the host iframe), AND 2. No `BLOCK_INIT` has landed (`ready` is still `false`) within `timeoutMs`. This is precise by construction: - An EMBEDDED block (framed) is never top-level → always `false`, even before `ready`. The embedded happy path is untouched. - The dev harness / `createMockHost` runs the block top-level BUT posts `BLOCK_INIT` immediately (a `setTimeout(0)` macrotask), so `ready` flips long before `timeoutMs` and the timer is cleared → always `false`. The dev flow is untouched. - A real direct load (nobody sends `BLOCK_INIT`) stays top-level + not-ready past `timeoutMs` → `true`. Once `ready` flips it stays authoritative: this can never return `true` while `ready` is `true`, so a late init can't leave a stuck fallback.

**`useNestedDocument`**

```ts
useNestedDocument(options?: UseNestedDocumentOptions): UseNestedDocument
```

Fetch one of your OWN bundled documents and get back a `srcdoc` string with an absolute `<base href>` injected — the only way a block can embed a nested document of its own. 🔴 PREFER NOT TO NEED THIS. A plain `<iframe src="/game/index.html">` of your own bundle **cannot load**, and no manifest change fixes it. An engine build (Defold, Unity, Phaser) is a `<canvas>` plus a JS loader and normally mounts directly into the block's own document, which avoids the whole problem class; reach for this hook only when a separate document is genuinely required. WHY, measured, in ONE place: the header of `@civitai/app-sdk`'s `src/blocks/nestedDocument.ts`. It carries the opaque-origin / `frame-ancestors` / `X-Frame-Options` derivation, the five-row DATED EXTERNAL platform matrix (verified by nothing in this repo — re-measure it if the platform's sandbox tiers or response headers change), and the known limits of the `<base>` rewrite. Do not restate any of it here: it was duplicated across 11 surfaces with nothing in the repo checking them for agreement, which is exactly how two measured claims in these files' own test headers went stale. 🔴 THE STRING IS NOT SANITIZED. It is your own markup and scripts, verbatim; pass a `src` you control, and put a `sandbox` attribute on the iframe. Changing `src` restarts the fetch and aborts the previous one — `status` goes back to `'loading'` in the SAME render that changes `src`, so no paint ever shows a stale `srcDoc` as `'ready'` beside a new `src`. Unmounting aborts the in-flight fetch, and no state is written after it. A fetch that never settles is bounded: after {@link NESTED_DOCUMENT_TIMEOUT_MS} it is aborted and `status` becomes `'error'` with a message naming the timeout. A timeout is distinguished from the hook's own aborts (unmount, a `src` change) — those stay silent, as they must.

````tsx
```tsx
const { srcDoc, status, error } = useNestedDocument({ src: '/game/index.html' });
if (status === 'error') return <p>Could not load the game: {error?.message}</p>;
if (status !== 'ready') return <p>Loading…</p>;
return <iframe title="game" sandbox="allow-scripts" srcDoc={srcDoc ?? undefined} />;
```
````

<!-- END GENERATED: hooks -->
</HooksReference>

## Workflow bodies: the `kind` union

`estimate()` and `submit()` both take a full `WorkflowBody` — a discriminated
union keyed by `kind`. The hook forwards the body to the host verbatim and never
reads member-specific fields, so every member except `training` flows through the
same `estimate → submit → watch` lifecycle shown above. `training` is quoted with
`estimate()` but run with `useRunTraining()`, and `submit()` refuses it.

As of the pinned `@civitai/app-sdk@0.70.0` the union has five `kind` values, and
`kind: 'step'` is itself two arms — six members in all:

| `kind` | what it runs | what your block sends |
|---|---|---|
| `textToImage` | a Civitai **checkpoint** (plus optional LoRAs / img2img) | `modelId` + `modelVersionId` + `params` |
| `customComfy` | a **ComfyUI workflow** — a server-registered recipe, **or your own graph** | a registered `recipe` id, or `mode: 'inline'` plus the graph itself |
| `step` (`step` present) | a **server-registered orchestrator step** (`convert-image`, `chat-completion`) | a registered `step` id + bounded `params` |
| `step` (`step` omitted) | an orchestrator step type **named directly**, `input` forwarded unmodified | a `$type` + `input` + a `maxBuzz` amount — a reservation, **not** a spend ceiling |
| `training` | an ai-toolkit **LoRA training** run on a dataset of the viewer's own images | a `datasetId` from `usePrepareTrainingDataset()` + a base-model key + `params`; the `quoteId` from the estimate on the run |
| `workflow` | **up to 8 orchestrator steps as one generation**, a later step reading an earlier one's result | `steps` (each a `$type` + `input`, where any value may be a `{ $ref, path }` reference) + optional `arguments`; no `maxBuzz`. See [Multi-step workflows](../guide/workflows) |

`training` is a page-app flow behind a host flag that ships off; its availability,
money rules and the three hooks it uses are under
[`usePrepareTrainingDataset`](#hook-usePrepareTrainingDataset) above.

Narrow on `body.kind` before touching member-specific fields — and note that
`kind === 'step'` alone leaves both step arms in play, so narrow further on
whether `step` is present. The full field tables are in the
[generation bridge reference](./generation#what-the-bridge-can-and-cannot-do).

### `kind: 'customComfy'` — ComfyUI from a block

`customComfy` has **two arms**, selected by `mode`. This is the member most often
missed, because the generated example above never shows it.

**Recipe arm** — `mode` omitted (or `'recipe'`). Your block names a
server-registered, code-reviewed workflow and passes bounded params; the server
owns the graph:

```ts
import type { WorkflowBodyCustomComfyRecipe } from '@civitai/app-sdk/blocks';

const body: WorkflowBodyCustomComfyRecipe = {
  kind: 'customComfy',
  recipe: 'starter-comfy-txt2img', // a SERVER-registered id — unknown ids are rejected fail-closed
  params: {
    prompt: 'a serene alpine lake at golden hour',
    // seed?: number | null — omit to let the orchestrator pick
  },
};
```

**Inline arm** — `mode: 'inline'` (required). Your block ships the ComfyUI graph
itself, plus a declared `resources` manifest and a `maxBuzz` ceiling:

```ts
import type { WorkflowBodyCustomComfyInline } from '@civitai/app-sdk/blocks';

const body: WorkflowBodyCustomComfyInline = {
  kind: 'customComfy',
  mode: 'inline', // REQUIRED, and exactly this value — see below
  workflow: {
    // the ComfyUI `/prompt` graph, keyed by node id — the shape
    // ComfyUI's "Save (API Format)" export produces
    '3': { class_type: 'KSampler', inputs: { seed: 42, steps: 20 } },
  },
  resources: ['urn:air:sdxl:checkpoint:civitai:101055@128078'],
  maxBuzz: 50, // integer 1…250, and ALSO the step timeout in seconds
};
```

Three things trip up a first attempt, all covered in the guide:

- **`mode: 'inline'` is required.** Including a `workflow` key does not select
  the arm — a body without `mode` routes to the recipe arm and is then rejected
  for a missing `recipe`.
- **`resources` is a declared manifest, not an inference.** Every AIR the graph
  names must also appear in `resources` or the submit is rejected.
- **`maxBuzz` is the only spend knob**, and doubles as the step timeout in
  seconds.

::: tip The published SDK types BOTH arms
`WorkflowBodyCustomComfy` is itself a union on `mode`, and both arms are
importable from `@civitai/app-sdk/blocks`: `WorkflowBodyCustomComfyRecipe` and
`WorkflowBodyCustomComfyInline` (plus `InlineComfyNode` for the graph nodes).
Import them rather than declaring the inline shape locally — a hand-declared
copy will drift from the SDK.

**Annotate the ARM, not the union**, as both examples above do. When the `mode`
discriminant is **omitted** — which is the shape this page recommends —
TypeScript's excess-property check runs against the whole union and accepts any
key belonging to *any* constituent, so a body annotated
`WorkflowBodyCustomComfy` silently tolerates a `workflow` key on a recipe body
and you find out at submit, server-side. (Spelling `mode` out explicitly narrows
the union to one constituent and *does* restore the error — but then you are
carrying a field the recommended shape leaves off.) Annotating
`WorkflowBodyCustomComfyRecipe` (or `…Inline`) makes it a compile error either
way. Use the union only where a value genuinely holds either arm.

Still narrow on the **value** of `body.mode === 'inline'`, never on whether the
key is present: `mode` is optional on the recipe arm, so a body that merely
carries a `workflow` key routes to the recipe arm and is rejected for a missing
`recipe`.
:::

Both arms are **mod-gated** and **page-token-only** — a model-bound token is
rejected before either arm is inspected. For the graph rules, the entitlement
and moderation gates, the budget model, and a runnable local example, read
**[Comfy on Civitai (`customComfy`)](../guide/comfy-cloud)** — this section is a
pointer, not a replacement.

## Install

```bash
pnpm add @civitai/blocks-react @civitai/app-sdk
```

See the [Quickstart](../guide/quickstart) for a full scaffold, and the
[message bridge reference](./messages) for the protocol these hooks sit on.
