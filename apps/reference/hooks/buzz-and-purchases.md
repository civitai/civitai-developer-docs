---
title: "Buzz, purchase and tip hooks"
description: "Buzz balance and transactions, Buzz and goods purchases, entitlements, compensation and tips. Part of the Hooks reference."
---

<!-- GENERATED PAGE — do not edit by hand. Written by `npm run gen:appblocks:md` (scripts/appblocks-md.mjs); which entry lives on which page is decided in .vitepress/theme/components/referenceSplit.shared.mjs. -->

# Buzz, purchase and tip hooks

Buzz balance and transactions, Buzz and goods purchases, entitlements, compensation and tips.

This page documents 9 of the 48 hooks in the [Hooks reference](../hooks), which indexes every hook by name. Generated from the published `@civitai/blocks-react@0.77.0` package's type definitions and README.

Other pages: [Context, frame and analytics hooks](./context) · [Generation hooks](./generation) · [Batch, confirmed-step and training hooks](./batches-and-training) · [Viewer, consent and navigation hooks](./viewer-and-navigation) · [Storage, picker and media hooks](./storage-and-media)

<HooksReference group="buzz-and-purchases">
<!-- BEGIN GENERATED: hooks/buzz-and-purchases — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`useBuzzPurchase`**

```ts
useBuzzPurchase(): UseBuzzPurchase
```

```ts
interface UseBuzzPurchase {
  openPurchaseModal: (suggestedAmount?: number) => Promise<{ purchased: boolean; newBalance?: number; }>;
}
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

```ts
interface UseGoodPurchase {
  purchase: (params: GoodPurchaseParams, options?: GoodPurchaseOptions) => Promise<GoodPurchaseResult>;
  loading: boolean;
  error: Error | null;
}
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

```ts
interface UseEntitlements {
  entitlements: Entitlement[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  unauthenticated: boolean;
  owns: (goodId: string) => boolean;
}
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

```ts
interface UseBuzzBalance {
  balance: BuzzBalance | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
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

**`useBuzzTransactions`**

```ts
useBuzzTransactions(params?: BlockBuzzTransactionsParams): UseBuzzTransactions
```

```ts
interface UseBuzzTransactions {
  transactions: BuzzTransaction[] | null;
  cursor: string | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
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

```ts
interface UseBuzzAccounts {
  accounts: BlockBuzzAccount[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
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

```ts
interface UseDailyCompensation {
  resources: BlockDailyCompensationResource[] | null;
  hasPublishedResources: boolean | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

Per-modelVersion generation-compensation for the month containing `params.date` (Buzz totals + cash totals in pennies). Returns `{ resources, hasPublishedResources, loading, error, refetch }`. Requires `buzz:read:self`; host-mediated over `GET_DAILY_COMPENSATION`.

```tsx
const { resources, hasPublishedResources } = useDailyCompensation({ date: '2026-07-01' });
```

**`useTip`**

```ts
useTip(): UseTip
```

```ts
interface UseTip {
  tip: (params: TipParams, options?: TipOptions) => Promise<TipResult>;
  loading: boolean;
  error: Error | null;
}
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

```ts
interface UseTipAllowance {
  allowance: TipAllowance | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

Read the viewer's REAL remaining daily tip allowance `{ cap, spent, remaining }` through the block-token-gated `GET /api/v1/blocks/tip-allowance` REST endpoint (scope `social:tip:self` — the SAME scope the app already holds to tip, so no manifest change). Direct-fetch against the validated host origin with the block bearer token, the same pattern as {@link useGenerationResources}. Lets a block show a genuinely-tracked remaining allowance and disable the tip button at the true ceiling — instead of a dead client-side full-cap guess (`localStorage` is inert in the opaque-origin sandbox). Fetches once on mount and exposes `refetch` (call it after a successful `useTip().tip(...)`). Only the LATEST request may write state: a reply superseded by a newer `refetch` — or one that lands after unmount — is dropped (#392). If the host origin never arrives the hook reaches a TERMINAL state rather than spinning: see `error` above (#398).

```tsx
const { allowance, refetch } = useTipAllowance();
// allowance?.remaining — Buzz the viewer may still tip today
```

<!-- END GENERATED: hooks/buzz-and-purchases -->
</HooksReference>
