---
title: How an app earns
description: How an App Block earns — digital goods (including paid admission) and the per-generation author fee — what each pays, when it settles, and the refusals to branch on.
sources:
  - civitai:src/shared/constants/block-goods.constants.ts
  - civitai:src/server/services/blocks/block-goods.service.ts
  - civitai:src/pages/api/v1/blocks/goods/purchase.ts
  - civitai:src/server/services/blocks/author-fee.ts
  - civitai:src/server/services/blocks/author-fee-accrual.service.ts
  - civitai:src/server/services/blocks/author-fee-settlement.service.ts
  - civitai:src/server/middleware/block-scope.middleware.ts
  - npm:@civitai/blocks-react@0.78.1/dist/hooks/useGoodPurchase.d.ts
  - npm:@civitai/blocks-react@0.78.1/dist/hooks/useEntitlements.d.ts
---

# How an app earns

An App Block can earn on two rails, with separate ledgers, triggers and
settlement cadences.

## The two rails at a glance

| Rail | Trigger | Money flows | You are paid | What you configure |
|---|---|---|---|---|
| **Digital goods** | The viewer buys a `goods` entry you declared in your manifest | Viewer's Buzz → you | **Immediately**, on the purchase | Everything: which goods exist, their `priceBuzz`, whether they are `good` or `app_unlock` — the latter is how you [charge for access to the app itself](#charging-for-access-to-the-app-itself) |
| **Per-generation author fee** | Your app runs a generation for a viewer | Viewer's Buzz → you | **Daily**, as one credit per currency | **Nothing yet.** Platform defaults apply to every app, including yours |

Three things that look like earning rails and are not:

- **`page.buzzBudgetPerGen`** is a **spend ceiling** — the most Buzz a single
  generation your block submits may cost the viewer (sizing:
  [manifest reference](../reference/manifest)). It interacts with the author
  fee but pays you nothing.
- **Tips** (`social:tip:self`) move Buzz to a *creator*, not to your app.
- **Buzz a viewer buys inside your block** (`useBuzzPurchase`, or the top-up
  `useGoodPurchase` can open) goes **into the viewer's balance**; your app is
  not paid for it, though it can unblock a sale. Your earnings panel may show
  those top-ups as **Pending**, then **Confirmed (unpaid)** — neither is paid
  out today.

---

## Rail 1 — digital goods

You declare a catalog in your manifest; the platform sells those entitlements
for Buzz on your behalf and records the ledger. The field shape, review gating
and scopes are in [the manifest reference](../reference/manifest) and
[the scopes reference](../reference/scopes); this section covers the money.

### The split

The app owner keeps **70%**; the platform keeps the remainder.

```ts
// civitai:src/shared/constants/block-goods.constants.ts
export const BLOCK_GOOD_APP_OWNER_SHARE = 0.7;

// The single source of truth for how a sale splits — the payout and anything
// that DISPLAYS the numbers both read it, so what is shown equals what is paid.
const appOwnerShare = Math.floor(priceBuzz * BLOCK_GOOD_APP_OWNER_SHARE);
const platformShare = priceBuzz - appOwnerShare;
```

1. **Your share floors; the platform takes the remainder.** The two parts always
   sum to `priceBuzz` exactly (a database constraint enforces it), so **the
   rounding goes to the platform**. At a price of `10` you keep `7`, exactly
   70/30; at `11` you keep `floor(7.7) = 7` and the platform `4` — an effective
   **63.6%**. For the exact ratio, price in multiples of 10. The share is its own
   constant, not an alias of the cosmetic shop's creator share, even where the
   numbers agree.
2. **The floor price is 2, derived from the share:**

   ```ts
   export const BLOCK_GOOD_MIN_PRICE_BUZZ = Math.ceil(1 / BLOCK_GOOD_APP_OWNER_SHARE); // 2
   ```

   At `1`, `floor(1 × 0.7)` is `0` — you would earn nothing per sale.
3. **It is paid immediately.** No batching, no settlement delay: the purchase
   either completes with your share credited, or is refused and nothing moves.

You are credited **in the same currency proportions the viewer paid in**. A
purchase spends the viewer's granted (blue) Buzz before the Buzz they bought
(yellow), and your share is prorated back across the same pools, flooring so the
blue leg can never exceed the proportional amount.

### The bounds you are priced inside

| Constant | Value | Where it bites |
|---|---|---|
| `BLOCK_GOOD_APP_OWNER_SHARE` | `0.7` | Your share of every sale |
| `BLOCK_GOOD_MIN_PRICE_BUZZ` | `2` | Cheapest listable price |
| `BLOCK_GOOD_MAX_PRICE_BUZZ` | `50_000` | Ceiling on a **single** good, re-checked at purchase time as well as at manifest validation — so an old approved manifest cannot keep charging a price the ceiling has since moved below |
| `BLOCK_GOOD_MAX_PER_MANIFEST` | `32` | Most goods one manifest may declare |

A `kind: "app_unlock"` good gets the same share, floor and 32-entry cap; **only
its per-good price ceiling differs** (well below 50,000), and a catalog may hold
only a limited number of unlocks. Both unlock numbers are in
[the manifest reference](../reference/manifest#optional-fields-worth-calling-out).

Above your per-good ceiling sits a **per-viewer daily ceiling across every
app**: a purchase at a legal price can still be refused because the viewer spent
their day's allowance elsewhere.

### Charging for access to the app itself

The paid-admission pattern: a viewer pays once, in Buzz, to use your app. A good
declared `kind: "app_unlock"` buys admission; the default `"good"` buys
something *inside* your app. Both use the same rail, split, rounding and
[refusal reasons](#refusal-reasons-your-app-must-branch-on).

**The platform does not gate access for you. Your app enforces the gate.** Your
block is served, and its token issued, the same way whether or not the viewer
bought the unlock. Your app reads the viewer's entitlements and renders the paid
experience only to holders. Declare the good as `app_unlock` anyway: a future
platform gate would read that entitlement, so the catalog needs no migration.
If your listing says the app is paid, make sure your code implements the gate.

::: danger A gate in your bundle is not a security boundary
Anyone who loads your app can read everything it ships. `owns('full-access')`
decides what your UI *shows*, not what your bundle *contains*. If the paid part
is content or data that must not leak, serve it from your own server, which
establishes the viewer's entitlement before it answers.
:::

#### Step 1: declare the unlock and two scopes

Add **one** good with `kind: "app_unlock"` to your manifest's `goods`, and
declare both goods scopes:

```json
{
  "scopes": ["goods:read:self", "goods:purchase:self"],
  "scopeJustifications": {
    "goods:purchase:self": "Viewers pay a one-time 500 Buzz unlock to use the app."
  },
  "goods": [
    {
      "id": "full-access",
      "title": "Full access",
      "kind": "app_unlock",
      "priceBuzz": 500,
      "justification": "One-time unlock for the full editor; the free view shows a preview only."
    }
  ]
}
```

(Only the keys this pattern adds.)

- **`goods:read:self`** reads what the viewer bought from *your* app. It is
  consent-exempt. An app already selling ordinary goods must **add** it: without
  it every entitlement read is refused and every viewer, paid or not, gets the
  retry state.
- **`goods:purchase:self`** spends the viewer's Buzz — a sensitive scope, so it
  needs a `scopeJustifications` entry and viewer consent. Any `goods` catalog
  requires it.
- An `app_unlock` needs a **required** `justification` and has a lower price
  ceiling and a per-manifest limit. These are checked at submit, not by the JSON
  Schema, so a manifest that breaks one validates offline and is **rejected at
  submit** (numbers:
  [manifest reference](../reference/manifest#optional-fields-worth-calling-out)).
- The `justification` is shown only to the moderator — it makes the switch from
  free to paid visible at review — never to the viewer or on the entitlement.
- The `id` is the entitlement key. Changing it orphans every unlock already
  sold.

#### Step 2: gate on the entitlement and sell the unlock

Read ownership with `useEntitlements` and buy with `useGoodPurchase`, both from
`@civitai/blocks-react`:

```tsx
import { useRef, type ReactNode } from 'react';
import { useEntitlements, useGoodPurchase, GoodPurchaseRefusal } from '@civitai/blocks-react';

// Must match the app_unlock entry in your manifest.
const UNLOCK_ID = 'full-access';
const UNLOCK_PRICE = 500;

export function PaidAdmission({ children }: { children: ReactNode }) {
  const { owns, loading, error, unauthenticated, refetch } = useEntitlements();
  const { purchase, loading: buying, error: buyError } = useGoodPurchase();
  // ONE key per logical purchase, reused across retries of that purchase.
  const keyRef = useRef<string | null>(null);

  async function unlock() {
    if (!keyRef.current) keyRef.current = `unlock-${crypto.randomUUID()}`;
    try {
      await purchase(
        { goodId: UNLOCK_ID, expectedPriceBuzz: UNLOCK_PRICE },
        { idempotencyKey: keyRef.current, topUpOnInsufficientFunds: true },
      );
      keyRef.current = null; // success: this purchase is over
    } catch (err) {
      // A definite refusal ends this purchase, so the next attempt gets a new key.
      // Anything else (a timeout, a 5xx, `charge_unknown`) may have charged: keep it.
      const definite =
        err instanceof GoodPurchaseRefusal &&
        (err.status === 422 ||
          ['already_owned', 'duplicate', 'self_purchase', 'price_changed'].includes(err.reason ?? ''));
      if (definite) keyRef.current = null;
    }
    refetch(); // after ANY outcome: an ambiguous one may still have granted the unlock
  }

  if (loading) return <p>Checking your access…</p>;
  if (unauthenticated) return <p>Sign in to unlock this app.</p>;
  if (error) return <button onClick={refetch}>Couldn’t check your access. Try again</button>;
  if (owns(UNLOCK_ID)) return <>{children}</>;

  return (
    <div>
      <p>Unlock the full app for {UNLOCK_PRICE} Buzz.</p>
      <button disabled={buying} onClick={unlock}>Unlock for {UNLOCK_PRICE} Buzz</button>
      {buyError && <p role="alert">{buyError.message}</p>}
    </div>
  );
}
```

The platform renders no confirmation for a goods purchase, so the button that
names the price is your confirmation step. For per-reason error handling,
including the bounded `price_changed` re-confirm, use the
[`BuyButton` example](#putting-it-together) below.

#### The gate states, and why their order matters

`useEntitlements().owns()` returns `false` until the first read succeeds —
**also** what a failed read looks like — so the paywall must be the last
branch:

1. **Loading.** A neutral state, never the paywall.
2. **Signed out** (`unauthenticated`). Ask the viewer to sign in; a retry can
   never clear it.
3. **The read failed** (`error`). A retry that calls `refetch()`, **never the
   paywall** — otherwise a paid viewer is asked to pay again after a network
   blip.
4. **Owns the unlock.** Render the app.
5. **Only then:** the paywall.

The sketch calls `refetch()` after every purchase outcome, because the
entitlement read, not one `purchase()` call, says whether the unlock was
granted.

#### Testing it

**You cannot buy your own app's goods** (see
[the callout below](#refusal-reasons-your-app-must-branch-on)), so test the
unlock as a **second account** with enough Buzz. Once live, the gate shows
**you** the paywall too; the hooks expose no "is the owner" flag, so if you need
the paid view as the owner, your app must establish that itself.

The moderator review preview does not grant `goods:read:self`, so your gate
shows its read-failed state there. Make that state say what the app is, so a
reviewer can tell it from a broken app.

### A pinned install can be charged a price it was never shown

A viewer's install can be **pinned to an older approved version** of your block,
but the purchase path resolves the good and its price from your **latest
approved manifest**. So:

- **The price charged can differ from the price displayed.** `expectedPriceBuzz`
  makes the purchase refuse `price_changed` instead; it is optional, and the
  only protection a pinned viewer has. **Send it on every purchase.**
- **A good added in a newer version is buyable from an older one**, though the
  pinned viewer was never shown it.
- **A good you removed or renamed stays on screen with a dead buy button** — the
  purchase answers the bare `404` in the no-`reason` table below. Render it as
  "no longer available".

**Bound the `price_changed` remedy.** On a pinned install, re-reading the
catalog returns the **pinned** price again, so re-read-and-resubmit loops
forever. The new price is only in the viewer-facing `message`. Show that message
verbatim, ask the viewer to confirm once, re-submit at most once with a
**fresh** idempotency key (a changed price is a changed payload; reusing the key
is refused `422`), and stop on a second `price_changed`.

---

## Rail 2 — the per-generation author fee

Every generation your app runs for a viewer can carry an **author fee**: an
additive, viewer-paid amount that goes to you. The platform takes **no cut** and
funds none of it — you are credited exactly what the viewer was debited.

This rail is **live and on by default**, and you cannot tune it yet: **the
platform defaults apply to every app.** The platform has a switch that stops new
fees being quoted, reserved or charged; it does not stop an accrued fee from
being refunded.

### The formula

```text
# civitai:src/server/services/blocks/author-fee.ts
fee = max(flatBuzz, pctOfBase × base_generation_buzz)
```

The larger leg wins (not a sum) and is recorded as the **governing leg**
(`flat`, `pct`, or `none` when the fee is zero); on a tie, `flat` wins.

The platform defaults:

| Constant | Value | Meaning |
|---|---|---|
| `BLOCK_AUTHOR_FEE_DEFAULT_FLAT_BUZZ` | `1` | Flat leg: 1 ⚡ per generation |
| `BLOCK_AUTHOR_FEE_DEFAULT_PCT_OF_BASE` | `0.05` | Percentage leg: 5% of the **base** generation cost |
| `BLOCK_AUTHOR_FEE_MAX_FLAT_BUZZ` | `100` | Platform ceiling on the flat leg. No floor — `0` is legal |
| `BLOCK_AUTHOR_FEE_MAX_PCT_OF_BASE` | `1` | Platform ceiling on the percentage leg (100% of base). No floor |
| `BLOCK_AUTHOR_FEE_BASIS_POINTS_SCALE` | `10_000` | The percentage leg is evaluated in whole basis points, as exact integer arithmetic |

A per-generation-type override sets `chat-completion` to **zero**
(`flatBuzz: 0, pctOfBase: 0`), so a conversational block earns nothing per
turn.

### Which base, and every rounding direction

- **The percentage is of the BASE cost, not the total** — the total already
  carries other creators' licensing fees, a lineage fee and tips.
- **Every rounding goes toward the viewer.** The fraction floors to whole basis
  points and the Buzz floors again, so a stated 5% never charges more than 5%.
  It also means a low percentage alone earns nothing on cheap generations
  (`floor(4 × 500 / 10000)` is `0`) — hence the `1 ⚡` flat default.
- **A zero-cost generation earns nothing.** A guard returns before the legs are
  evaluated, so the flat leg cannot mint a fee from it.
- **A provisional price earns nothing today.** When the orchestrator reports the
  price as a *cap* that may settle lower (a step charged up front at its maximum
  and refunded the difference), the fee is skipped. This may change.

### Two things this rail does to your app's own numbers

1. **The fee is folded into the cost your block is quoted.** `cost.total`
   already includes it. Where the host itemises it, `cost.authorFee` is the fee
   on its own, so `total - authorFee` is the generation's price; when the field
   is absent, show `total` on its own rather than reading it as `0`. See
   "Showing the app fee: `cost.authorFee`" under
   [`useBuzzWorkflow`](../reference/hooks/generation#hook-useBuzzWorkflow).
2. **The fee counts against the per-generation budget ceiling**, so a
   `page.buzzBudgetPerGen` sized against a bare generation estimate can refuse
   with an insufficient-budget reply. Leave headroom.

### When you actually get paid

The rail is two hops:

1. **At submit**, the viewer is debited the fee and an accrual is recorded naming
   you as the payee.
2. **Daily**, those accruals are summed per **(owner × Buzz type × accrual day)** and
   the total is minted to you as a *single* credit. You get one credit per
   currency per day, not one per generation. The credit's external id is shaped
   `block-author-fee-<YYYY-MM-DD>-<userId>-<buzzType>`, which is what to quote if
   you ever need to reconcile a day with support.

The fee is already whole Buzz, so batching carries no sub-Buzz residue.

**A generation that does not succeed does not earn.** On a non-success terminal
state, an unsettled accrual is removed and the viewer refunded. A settled row is
never reversed.

**You cannot earn this fee from yourself.** If the viewer is the app owner, the
fee is refused before any money moves. It is also refused on a *private run*
(a delisted or suspended app's bundle served for review). The goods rail's
self-purchase refusal is an independent check, not this one — test both.

---

## Refusal reasons your app must branch on

The machine-readable discriminators are not all on the same key.

::: warning You cannot buy your own app's items
An app owner purchasing their own good is refused: `400`, `reason:
"self_purchase"`, nothing charged, **`retryable: false`**. **Test purchases as a
viewer who is not the app owner.**
:::

### Goods purchases — the `reason` key

A refused purchase answers with `{ ok: false, error, reason }`; in
`@civitai/blocks-react` it is a rejected promise carrying a
`GoodPurchaseRefusal` with `status`, `message` and `reason`. Three independent
fields decide what to do:

- **`reason`** — *why*. Branch on this, never on `message`, which is
  viewer-facing copy and will be reworded.
- **`charge`** (on the server result) — what this attempt did to the viewer's
  Buzz: `none`, `reversed`, or `unknown`.
- **`retryable`** — whether an identical retry could reach a *different*
  verdict. **It does not follow from the status class**: both `500`
  `charge_failed` cases are retryable; several `409`s are not.

| `reason` | Status | Charged? | Retryable | What your app should do |
|---|---|---|---|---|
| `price_over_cap` | `400` | `none` | no | The approved price exceeds the platform ceiling. Ship a new version at a legal price |
| `price_changed` | `409` | `none` | no | Your UI showed a stale price. Show the refusal's `message` verbatim, re-confirm with the viewer, re-submit **once** with a fresh key. Do **not** loop on re-reading the catalog — on a pinned install that returns the stale price forever; see [the pinned-install caveat](#a-pinned-install-can-be-charged-a-price-it-was-never-shown) |
| `self_purchase` | `400` | `none` | no | The buyer is the app owner. Never retryable — see the callout above |
| `already_owned` | `409` | `none` | no | The viewer already holds a live entitlement. Re-read entitlements and render the owned state |
| `insufficient_funds` | `400` | `none` | **yes** | Offer a top-up. A retry after the viewer buys Buzz genuinely can succeed |
| `duplicate` | `409` | `none` | no | Another attempt already completed this purchase. Re-read entitlements; do not charge again |
| `pending_reconciliation` | `409` | `none` | no | An earlier attempt is still being settled. Point the viewer at support — retrying walls them |
| `ledger_conflict` | `409` | `unknown` | no | The ledger id is occupied, including by a reversal. Nothing the viewer can do; this one is for a human |
| `charge_failed` | `400` / `500` | `none` or `reversed` | **yes** | Either nothing was charged or it was charged and given straight back. Safe to offer a retry |
| `charge_unknown` | `503` | `unknown` | **yes** | We cannot say whether Buzz moved. Retry with the **same** idempotency key; do not present it as a clean failure |

**`reason` is often absent, so a `switch` needs a `default`.** The endpoint's
own refusals answer with `{ error }` and **no `reason`**:

| Refusal | Status | `reason` | Note |
|---|---|---|---|
| The good is not available (no such id, or the approved manifest no longer declares it) | `404` | *absent* | This is also how a good removed or broken by a later approved version stops being sellable — there is no separate delisting step |
| Purchase rate limit | `429` | *absent* | Carries `Retry-After`. Transient: nothing moved, so a retry once the window clears is allowed |
| Viewer's daily purchase limit reached | `400` | *absent* | The message names the daily ceiling. Not something your pricing can fix |
| Purchase limiter unavailable | `503` | *absent* | Transient. Retry |
| An attempt with this idempotency key is already in progress | `409` | *absent* | Wait for the first attempt; do not mint a new key |
| The idempotency key was already used for a **different** purchase payload | `422` | *absent* | A key is pinned to a payload fingerprint. Use one key per logical purchase |
| The idempotency store is unavailable | `503` | *absent* | Transient. Retry |

Always fall back to `status` plus `message` when `reason` is missing. (The
server's types also declare a `good_not_found` reason that is never returned.)

### Scope and permission refusals — the `code` key

Every block REST route, the goods endpoints included, runs behind the scope
middleware, which refuses with **`code`** alongside the human `error` string.
Each needs a different remedy — do not collapse them into "permission denied".

| `code` | Status | Means | Your remedy |
|---|---|---|---|
| `insufficient_scope` | `403` | The token never carried the scope this route needs | A manifest / approval problem. Declare the scope, justify it, resubmit. The name mirrors RFC 6750's OAuth 2.0 bearer error |
| `consent_revoked` | `403` | The token *does* carry the scope and the viewer has since withdrawn it | **Stop asking.** Let the host re-prompt; retrying the call cannot help |
| `context_binding` | `403` | The token carries the scope but the request does not match what it was bound to (wrong model id, an anonymous subject on a self-bound scope, an array-form query param) | Re-request a token for the right context. Not a consent problem |
| `instance_revoked` | `403` | This install went away, or the publisher was banned | Terminal for this instance. Not a scope or consent issue |
| `app_not_approved` | `403` | The app block is not approved | Nothing runtime-side to fix; this is the review gate |
| `permission_state_unavailable` | **`503`** | Permission state could not be read right now | **The only retryable one, and the only one that is not a `403`.** Retry shortly. Treating it as a permanent denial takes away access the viewer still has |

Some refusals carry **no** `code` — an invalid or expired block token (`401`),
an unavailable approval lookup on a route that does not elect to be served
(`503`). Treat a missing `code` as its own case and branch on status.

### Putting it together

```tsx
import { useRef } from 'react';
import { useEntitlements, useGoodPurchase, GoodPurchaseRefusal } from '@civitai/blocks-react';

function BuyButton({ goodId, priceBuzz }: { goodId: string; priceBuzz: number }) {
  const { purchase, loading } = useGoodPurchase();
  const { refetch } = useEntitlements();
  // ONE key per logical purchase, held across retries — see the note under this
  // snippet for why this is a ref and not a per-attempt value.
  const keyRef = useRef<string | null>(null);

  async function onBuy() {
    if (!keyRef.current) keyRef.current = `buy-${crypto.randomUUID()}`;
    try {
      await purchase(
        { goodId, expectedPriceBuzz: priceBuzz },
        // `-` joins the parts, never `:` — see the charset callout below.
        { idempotencyKey: keyRef.current, topUpOnInsufficientFunds: true },
      );
      keyRef.current = null;             // settled — a later re-buy gets a new key
      refetch();
      return;
    } catch (err) {
      // ONE place decides whether the key survives, and KEEPING it is the safe
      // default: an unknown, in-flight or malformed outcome is exactly where a
      // fresh key costs you the replay and the 409 guard, and the server already
      // frees the key itself on any outcome it calls transient. So only discard it
      // where this purchase is finished, or where the next attempt MUST carry a
      // different payload — a key is pinned to one payload, and reuse is `422`.
      const needsNewKey =
        err instanceof GoodPurchaseRefusal &&
        (err.status === 422 ||              // the key outlived the payload it was pinned to
          err.reason === 'price_changed' || // a new price is a new payload
          err.reason === 'already_owned' ||
          err.reason === 'duplicate' ||
          err.reason === 'self_purchase');  // this purchase is over
      if (needsNewKey) keyRef.current = null;

      // A refusal the server produced deliberately, as opposed to a transport failure.
      if (err instanceof GoodPurchaseRefusal) {
        switch (err.reason) {
          case 'already_owned':
          case 'duplicate':
            refetch();                       // they have it — render the owned state
            return;
          case 'price_changed':
            // Show this copy verbatim — the new price is only in the message. The
            // re-confirmed price has to reach the next submit as state or a prop;
            // this example stops at notifying, deliberately.
            showStalePriceNotice(err.message);
            return;
          case 'self_purchase':
            showOwnerNotice();               // never retryable
            return;
          case 'charge_unknown':
            // Buzz may have moved, so the key is kept by the default above. Note
            // the retry does not complete the purchase — it is walled at
            // `pending_reconciliation`, which is a state a human can act on.
            // Never present this as a clean failure.
            showUncertainNotice(err.message);
            return;
          default:
            // REQUIRED. `reason` is undefined for the 404, the 429, the
            // daily-cap 400 and every idempotency refusal.
            showRefusal(err.status, err.message);
            return;
        }
      }
      // Not a refusal: a 30s timeout (the charge may have landed — retry with the
      // same key) or an AbortError because the component unmounted.
      if (err instanceof Error && err.name === 'AbortError') return;
      showTimeoutNotice();
    }
  }

  return <button disabled={loading} onClick={onBuy}>Buy for {priceBuzz} Buzz</button>;
}
```

::: tip The key identifies the PURCHASE, not the attempt
`idempotencyKey` is **a stable key for one logical purchase**, so the example
mints it once and holds it in a ref — not an attempt counter, timestamp or
render. A stable key buys two things: for a short window after a purchase
settles, a retry under the same key **replays the first verdict**, and a retry
while the first is in flight is refused `409` instead of racing it.

It does **not** protect against double-charging — a server-side transaction id
derived from the purchase itself does that, which is why `charge_unknown` is
retryable and a retry on that path is refused `pending_reconciliation` rather
than charging again. A per-attempt key only gives up the replay and the `409`.

**Do not build the key out of your `goodId`.** A good id may be 64 characters
on its own and the key is capped at 64 **in total** (callout below), so
`` `buy-${goodId}-…` `` fails with `400` for your longest-named goods only. The
`goodId` is already in the payload the key is pinned to. A prefixed
`crypto.randomUUID()` (40 characters) is safe at any good id.
:::

::: danger The idempotency key's charset is validated — `^[A-Za-z0-9_-]{1,64}$`
**Letters, digits, `_` and `-` only, 1 to 64 characters** — so no `:`, `.` or
`/`, and not `React.useId()` (it returns a colon-wrapped value such as `:R0:`);
`crypto.randomUUID()` is fine. The purchase route validates its body first, so
a key outside the class is a plain **`400`** with no `reason` and no scope
`code` — a `switch` on either cannot see it. Nothing is charged.

```json
{ "error": "Invalid request body",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "idempotencyKey": ["Invalid string: must match pattern /^[A-Za-z0-9_-]{1,64}$/"]
    } } }
```

The same charset applies to `useTip().tip()` and the generation `submit()` bag.
Why `:` and 64:
[`idempotencyKey` — the validated charset](../reference/generation#idempotency-key-charset).
:::

---

## Related

- [Manifest reference](../reference/manifest) — the `goods` catalog shape, its
  bounds, and sizing `page.buzzBudgetPerGen`
- [Scopes reference](../reference/scopes) — `goods:purchase:self`,
  `goods:read:self`, `ai:write:budgeted`, and which scopes need a justification
- [Hooks reference](../reference/hooks) — `useGoodPurchase`, `useEntitlements`,
  `useBuzzPurchase`, `useBuzzBalance`
- [Moving a block off the bridge](./porting) — the REST routes behind the goods
  hooks, and which credential reaches them
- [Generating images](./text-to-image) and
  [Comfy on Civitai](./comfy-cloud) — the generation paths the author fee rides
- [Review, approval and deploy](./review-and-deploy) — why a price change is a
  new version
