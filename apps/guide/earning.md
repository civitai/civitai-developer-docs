---
title: How an app earns
description: The three money rails an App Block can earn on — digital goods, the per-generation author fee, and the fiat Buzz rev share — what each one pays, who pays whom, when it settles, and the refusal reasons your app has to branch on.
sources:
  - civitai:src/shared/constants/block-goods.constants.ts
  - civitai:src/server/services/blocks/block-goods.service.ts
  - civitai:src/pages/api/v1/blocks/goods/purchase.ts
  - civitai:src/server/services/blocks/author-fee.ts
  - civitai:src/server/services/blocks/author-fee-accrual.service.ts
  - civitai:src/server/services/blocks/author-fee-settlement.service.ts
  - civitai:src/server/services/blocks/rate-card.ts
  - civitai:src/server/services/blocks/buzz-attribution.service.ts
  - civitai:src/server/services/blocks/backpay.service.ts
  - civitai:src/server/jobs/confirm-pending-block-attributions.ts
  - civitai:src/server/middleware/block-scope.middleware.ts
  - npm:@civitai/blocks-react@0.63.0/dist/hooks/useGoodPurchase.d.ts
---

# How an app earns

An App Block can earn on three separate rails. They are separate ledgers with
separate triggers, separate settlement cadences, and — for two of them —
**opposite directions of money flow**. Nothing about one tells you anything
about another.

::: danger Selling a good and selling Buzz are OPPOSITE directions
This is the single easiest thing to get wrong on this page, and the SDK's own
`useGoodPurchase` docblock says so too.

- **A digital good** is Buzz flowing **from the viewer to you**. The viewer
  already holds the Buzz; you take a share of it.
- **The Buzz rev share** is fiat flowing **into the viewer's balance**, and you
  take a share of the *card payment*. The viewer ends the transaction with
  **more** Buzz than they started with.

They share nothing but the fact that one can unblock the other: a viewer who
cannot afford your good can be sent through a top-up, and the top-up is itself
attributable.
:::

## The three rails at a glance

| Rail | Trigger | Money flows | You are paid | What you configure |
|---|---|---|---|---|
| **Digital goods** | The viewer buys a `goods` entry you declared in your manifest | Viewer's Buzz → you | **Immediately**, on the purchase | Everything: which goods exist, their `priceBuzz`, whether they are `good` or `app_unlock` |
| **Per-generation author fee** | Your app runs a generation for a viewer | Viewer's Buzz → you | **Daily**, as one credit per currency | **Nothing yet.** Platform defaults apply to every app, including yours |
| **Fiat Buzz rev share** | The viewer buys Buzz with a card *inside your block* | Card payment → platform → **accrued against your app** | 🔴 **Not at all today.** Your share is recorded and stops there — no code path disburses it. See [Rail 3](#rail-3) before you price for this | Nothing. The rate is a platform rate card |

Two things that look like earning rails and are not:

- **`page.buzzBudgetPerGen`** is a **spend ceiling**, not income — the most Buzz
  a single generation your block submits may cost the viewer. Sizing it is
  covered in [the manifest reference](../reference/manifest). It interacts with
  the author fee (see below) but pays you nothing.
- **Tips** (`social:tip:self`) move Buzz to a *creator*, not to your app.

---

## Rail 1 — digital goods

You declare a catalog in your manifest; the platform sells those entitlements to
viewers for Buzz on your behalf and records the ledger. The field-by-field shape,
the review gating, the entitlement-key warning and the scopes you need are in
[the manifest reference](../reference/manifest) and
[the scopes reference](../reference/scopes) — this section is only about the
money.

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

Three consequences of that expression, in order of how likely they are to
surprise you:

1. **Your share floors; the platform takes the remainder.** The two parts always
   sum to `priceBuzz` exactly — a database constraint enforces it, so rounding
   can never create Buzz — which means **the rounding goes to the platform** on
   any price where `priceBuzz × 0.7` is not a whole number. At a price of `10`
   you keep `7` and the split is exactly 70/30. At a price of `11` you keep
   `floor(7.7) = 7`, the platform keeps `4`, and your effective share is
   **63.6%**. If the exact ratio matters to you, price in multiples of 10.
2. **The floor price is 2, and it is derived, not chosen.**

   ```ts
   export const BLOCK_GOOD_MIN_PRICE_BUZZ = Math.ceil(1 / BLOCK_GOOD_APP_OWNER_SHARE); // 2
   ```

   At a price of `1`, `floor(1 × 0.7)` is `0` — you would sell an item and earn
   nothing from it, permanently and silently. `2` is the cheapest price at which
   your share is at least `1`.
3. **It is paid immediately.** There is no batching and no settlement delay on
   this rail: the purchase either completes with your share credited, or it is
   refused and nothing moves.

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

🔴 **Three of those four rows are kind-blind; one is not.** For a
`kind: "app_unlock"` good, the share, the floor and the 32-entry catalog cap all
apply unchanged — an unlock earns the same 70%, cannot be priced below 2, and
counts toward the same 32. **Only the per-good price ceiling differs**: an unlock
is capped well below 50,000.

An unlock also carries one cap with no ordinary-good equivalent — a limit on how
many *unlocks* a single catalog may hold — and that one **narrows nothing above**:
a 33-entry catalog is refused by the 32 cap whether or not one entry is an
unlock. Both unlock numbers are in
[charging for access](#charging-for-access-to-the-app-itself) below, which points
at the one place they are written down.

Above your per-good ceiling sits a **per-viewer daily ceiling across every app**.
A purchase at a perfectly legal price can still be refused because the viewer has
spent their day's allowance somewhere else, and that refusal is not something
your app can price its way out of.

### Charging for access to the app itself

A good declared `kind: "app_unlock"` means "this buys admission", as opposed to
the default `"good"`, which buys something *inside* your app. The two are sold
through the same rail, at the same 70/30 split, and recorded in the same ledger.

🔴 **It is not enforced yet. Selling one does not paywall your app.** No access
gate reads the value today, so an `app_unlock` entitlement is recorded like any
other and every viewer still gets in. Declaring it is how you get a catalog the
gate can read the day it lands, without a migration — it is **not** a way to
charge for access now. (Not a platform rule, but worth saying: if you ship one
before the gate exists, a listing that implies a paywall is describing something
the platform is not doing on your behalf.)

What it does change today is **three manifest-time rules** an ordinary good does
not carry — a lower price ceiling, an arity of one, and a mandatory
`justification`. All three are enforced by the submit-time validator and are
deliberately *not* declared in the JSON Schema, so each one validates offline and
is rejected at submit.

🔴 **The rules and their exact bounds are in
[the manifest reference](../reference/manifest#optional-fields-worth-calling-out),
and only there.** They are not restated on this page on purpose: they were
written out in four places in one change, and nothing relates the copies, so a
correction to one would leave the others wrong. ⚠ **And no guard would catch
that** — the reference's `goods` key-set guard checks that every schema KEY is
documented and says in its own header that it does *not* check the bound cells,
so it cannot see a wrong NUMBER. One place, one set of numbers, because the
numbers are the part nothing can verify for you.

What belongs here is the *money* consequence rather than the manifest rule: the
`justification` is review metadata, never copied onto the entitlement and never
shown to the viewer, so it has no bearing on what a buyer sees or on what you are
paid — and the platform records your claim without verifying it. The split and
its rounding, **described above**, and the [refusal reasons](#refusal-reasons-your-app-must-branch-on)
below, apply to an unlock exactly as they do to an ordinary good.

It exists because your **permission set does not move** when you start charging.
Declaring any `goods` catalog already requires
[`goods:purchase:self`](../reference/scopes) — including a catalog whose only
entry is an `app_unlock` — and that scope is declared once. So an app already
selling ordinary items can begin charging for admission with its scopes
unchanged; the `justification` is what makes that visible at review.

🔴 **You cannot buy your own app's goods.** A purchase by the app owner is
refused `self_purchase` (400, `charge: 'none'`, `retryable: false`), so testing
an unlock end-to-end needs a second account — being signed in with enough Buzz
is not sufficient.

### A pinned install can be charged a price it was never shown

A viewer's install can be **pinned to an older approved version** of your block.
The purchase path does not follow that pin: it resolves the good and its price
from your **latest approved manifest**, while the pinned iframe is still rendering
the catalog of the version it is pinned to. Consequences, all live today:

- **The price charged can differ from the price displayed.** Sending
  `expectedPriceBuzz` catches this — the purchase is refused `price_changed`
  rather than charging a number the viewer never agreed to — but the field is
  optional, and it is the only thing standing between a pinned viewer and a price
  they did not see. **Send it on every purchase.**
- **A good you added in a newer version is buyable from an older one.** A pinned
  viewer was never shown that good, and nothing refuses the purchase on those
  grounds.
- **A good you removed or renamed is still on screen, and its buy button is
  dead.** The pinned catalog still lists it; the purchase path cannot find it in
  your latest approved manifest, so it answers the bare `404` in the no-`reason`
  table below. Render that refusal as "no longer available", not as an error.

🔴 **The obvious `price_changed` remedy does not terminate here.** "Re-read the
catalog and show the new price" assumes a re-read returns the new price; on a
pinned install the re-read returns the **pinned** price again, so a UI that
re-reads and re-submits loops indefinitely on the same refusal. The refusal is
not retryable and you cannot read the server's price out of a structured field —
only the viewer-facing `message` names it, and that copy can be reworded. So
**bound it**: show the refusal's own message verbatim, ask the viewer to confirm
once, re-submit at most once with a **fresh** idempotency key (a changed price is
a changed payload, and a key is pinned to one payload — reusing it is refused
`422`), and if a second `price_changed` arrives for the same good, stop and
surface it instead of trying a third time.

::: tip The share is a policy coincidence, not a constant alias
`BLOCK_GOOD_APP_OWNER_SHARE` is deliberately **not** an alias of the cosmetic
shop's creator share, even though the two are the same number today. They are
independent knobs that currently agree, so do not reason from one to the other.
:::

---

## Rail 2 — the per-generation author fee

Every generation your app runs for a viewer can carry an **author fee**: an
additive, viewer-paid amount that goes to you. The platform takes **no cut** of
it and funds none of it — it is a conduit. You are credited exactly what the
viewer was debited.

This rail is **live and on by default**. You do not opt in, and today you cannot
tune it: per-app configuration is a later change, and until it lands **the
platform defaults apply to every app, including apps that already existed.** The
platform retains a switch that stops new fees being quoted, reserved or charged;
it does not stop a fee already accrued from being refunded.

### The formula

```text
# civitai:src/server/services/blocks/author-fee.ts
fee = max(flatBuzz, pctOfBase × base_generation_buzz)
```

The `max` is deliberate — it is "largest of flat or percent", not a sum, and not
a percentage with a floor expressed some other way. Whichever leg wins is
recorded as the **governing leg** (`flat`, `pct`, or `none` when the fee is
zero); at the crossover, where the legs are equal, `flat` wins as a pinned
tie-break.

The platform defaults:

| Constant | Value | Meaning |
|---|---|---|
| `BLOCK_AUTHOR_FEE_DEFAULT_FLAT_BUZZ` | `1` | Flat leg: 1 ⚡ per generation |
| `BLOCK_AUTHOR_FEE_DEFAULT_PCT_OF_BASE` | `0.05` | Percentage leg: 5% of the **base** generation cost |
| `BLOCK_AUTHOR_FEE_MAX_FLAT_BUZZ` | `100` | Platform ceiling on the flat leg. No floor — `0` is legal |
| `BLOCK_AUTHOR_FEE_MAX_PCT_OF_BASE` | `1` | Platform ceiling on the percentage leg (100% of base). No floor |
| `BLOCK_AUTHOR_FEE_BASIS_POINTS_SCALE` | `10_000` | The percentage leg is evaluated in whole basis points, as exact integer arithmetic |

The platform table also carries a per-generation-type override for
`chat-completion`, and it is a **zero** — `flatBuzz: 0, pctOfBase: 0` — so a
conversational block earns nothing per turn. That is intentional: chat
completion is the highest-frequency generation type an app runs, and a flat floor
on each turn would be a per-message toll rather than a fee on a generation.

### Which base, and every rounding direction

- **The percentage is taken of the BASE cost, not the total.** The total a viewer
  pays for a generation already carries other creators' model licensing fees, a
  lineage fee and any tips. Charging a percentage of that would be charging a
  percentage of someone else's fee, and would compound as more fee-charging
  resources stack onto one generation. Your percentage leg sees the base only.
- **Every rounding goes toward the viewer.** The stated fraction floors to whole
  basis points, and the resulting Buzz floors again — so a stated 5% never
  charges more than 5%. That direction is what makes the guarantee exact rather
  than approximate, and it is also why a low percentage with a zero flat leg
  would earn nothing on cheap generations: `floor(4 × 500 / 10000)` is `0`, every
  time. The platform's `1 ⚡` flat default exists to avoid exactly that.
- **A zero-cost generation earns nothing, and that is a separate rule from the
  formula.** A plain `max(1, 5% × 0)` would be `1` — the flat leg minting a fee
  out of a generation that cost nothing. The zero-base guard returns before the
  legs are evaluated, and zero-base generations do happen.
- **A provisional price earns nothing today.** When the orchestrator reports the
  price as a *cap* that may settle lower — at least one step post-billed and
  charged up front at its maximum, with the difference refunded — the fee is
  skipped rather than charged against money the viewer may not ultimately spend.
  This is recorded as the current answer, not a settled policy.

### Two things this rail does to your app's own numbers

1. **The fee is folded into the cost your block is quoted, with no itemised
   field.** A cost estimate your block asks for comes back as a total that
   already includes the author fee. If you display that number, you are
   displaying generation cost plus fee, and there is no separate line item to
   subtract.
2. **The fee counts against the per-generation budget ceiling.** The submit path
   compares *generation cost plus fee* against the per-call budget, so a
   `page.buzzBudgetPerGen` sized against a bare generation estimate can start
   refusing with an insufficient-budget reply once the fee is added. Leave
   headroom.

### When you actually get paid

The rail is two hops:

1. **At submit**, the viewer is debited the fee and one `accrued` row is written
   to the `block_author_fee_accrual` ledger naming you as the payee.
2. **Daily**, those rows are summed per **(owner × Buzz type × accrual day)** and
   the total is minted to you as a *single* credit. You get one credit per
   currency per day, not one per generation. The credit's external id is shaped
   `block-author-fee-<YYYY-MM-DD>-<userId>-<buzzType>`, which is what to quote if
   you ever need to reconcile a day with support.

The batching exists for ledger volume, not for rounding — the fee is already
floored to whole Buzz before the viewer is shown or charged it, so there is no
sub-Buzz residue being carried.

**A generation that does not succeed does not earn.** When a generation reaches a
terminal state that is not success, an accrual that has not yet settled is
removed and the viewer is refunded. A row that has already settled is never
reversed.

**You cannot earn this fee from yourself.** If the viewer running the generation
is the app owner, the fee is refused before any money moves.

The goods rail refuses the equivalent purchase, but it does so by **its own
independent check** — there is no shared predicate, and the two are not otherwise
equivalent: the author-fee check additionally refuses a *private run*, where a
delisted or suspended app's bundle is served for review. Don't assume parity; if
it matters to your app, test both.

---

## Rail 3 — the fiat Buzz rev share {#rail-3}

When a viewer buys Buzz **with a card, inside your block**, the platform records
a `block_buzz_attribution` row against your app and you are owed a share of the
payment. This is the rail that runs in the opposite direction to goods: the
viewer's balance goes **up**.

::: danger Nothing on this rail is paid out today. Read this before pricing for it
This rail **records** what you are owed and stops there. **No code path
disburses a recorded row, and none is queued behind one.** The Buzz-purchase leg's
rows reach a state that is terminal in practice; the membership leg's rows are
deliberately written *unrated* and cannot be priced at all until a rate is signed
off by Civitai's monetization leadership, which has not happened. The platform's
own source describes the payout as a thing to **build**, not a thing to switch on.

That matters more than it looks, because **the accrual is shown to you.** Your
app's revenue panel renders the purchase leg's rows in a `Confirmed (unpaid)`
bucket whose number can be non-zero, and the panel's own tooltip says the same
thing this callout does — *"…This amount accrues; automated payouts are not yet
enabled."* The `Paid out` bucket beside it is not pending, either: nothing in
production writes that state, so its zero is structural. What you are looking at
is an accrual, not a balance, and not a receivable with a date on it. **Do not
price, forecast, or promise anything against it.**

Everything below describes what is *recorded* — the surfaces, the percentages,
the immutability rule. None of it is a payment schedule.
:::

The basis is the **net** — gross minus the payment provider's fee — and the
share depends on the *surface* the purchase happened on:

| Attribution surface | Publisher share of net |
|---|---|
| `publisher_all_my_models` — your block installed across a publisher's models | **15%** |
| `viewer_personal` — a viewer's own install of your block | **25%** |
| `per_model_install` — legacy, no longer emitted for new attributions | 15% |
| `platform_default` — a platform-default placement | **0%** |
| `viewer_global` — a full-page app (`app.page`, no model entity) | **0%** |

Read that table before you assume this rail is worth building for: **a page app
currently attributes at 0%.** The zero is a deliberate placeholder — page
revenue is treated as largely platform-counterfactual — and raising it needs a
new rate card, not a code change on your side.

Mechanics worth knowing — and note that the **Buzz-purchase leg and the
membership leg are rated at different times**, so a statement about one is not a
statement about the other:

- **A Buzz purchase is rated at WRITE time.** The row stamps both the rate-card
  version *and* your share, computed from the net, at the moment it is written.
  The share on a purchase row is therefore already a number, not a calculation
  deferred to a later pass — so "computed at payout" is a statement about the
  membership leg only, and does not describe this one.
- **A membership payment is TRACKED, not rated.** A block-initiated membership is
  recorded per **paid invoice** — the initial purchase *and each renewal* — with
  no rate applied and a deliberate *unrated* marker in place of a card version,
  precisely so an immutable row is never locked to an unsigned placeholder rate.
  Pricing it is a later backpay pass, and that pass is gated on a sign-off that
  has not happened. The rate the active card carries today is **15% of net**,
  mirroring the purchase floor as a conservative starting default **pending
  monetization sign-off** — treat it as the rate a backpay *would* apply, not a
  committed number.
- **Rate cards are immutable.** A row is rated under the card version it was
  written against, for the life of the row. Changing a percentage means a new
  card; it never retroactively reprices rows already written.

So a written row is not a price quote, and — per the callout above — a rated row
is not a payment either.

::: warning Wired, barely exercised, and the reason is structural
This rail is built end-to-end across the host, the payment webhooks and the
ledger, and almost nobody has earned on it. **That is not because it went
undocumented, and it is not a signal about demand: it is because there is no
disbursement.** A row can travel the whole length of every path described above
and still have paid nobody, so near-zero earnings is exactly the behaviour the
current code produces. If you are weighing this rail against goods or the author
fee, **talk to the Civitai team first** rather than inferring a timeline from
this page.
:::

---

## Refusal reasons your app must branch on

Every money path refuses in ways your app has to tell apart, and the machine-
readable discriminators are not all on the same key.

::: warning You cannot buy your own app's items
An app owner purchasing their own good is refused: `400`, `reason:
"self_purchase"`, nothing charged, and **`retryable: false`**. Retrying will
never work.

The reason is arithmetic, not policy theatre: an owner buying their own good
would pay themselves 70% through the bank and burn the other 30% — a
self-discount with a platform fee attached, not a sale.

This bites hardest when you are testing your own catalog. **Test a purchase as a
viewer who is not the app owner**, or the only thing you will ever measure is
this refusal.
:::

### Goods purchases — the `reason` key

A refused purchase answers with `{ ok: false, error, reason }`. In the
`@civitai/blocks-react` binding this surfaces as a rejected promise carrying a
`GoodPurchaseRefusal` with `status`, `message` and `reason`.

Three fields decide what your app should do, and they are independent of each
other:

- **`reason`** — *why*. Branch on this, never on `message`, which is
  viewer-facing copy and will be reworded.
- **`charge`** (on the server result) — what this attempt did to the viewer's
  Buzz: `none`, `reversed`, or `unknown`.
- **`retryable`** — whether an identical retry could reach a *different* verdict.
  🔴 **It is not derivable from the status class.** Both a pre-charge database
  failure and a post-charge reversal answer `500` with `charge_failed`, and both
  are retryable; several `409`s are not.

| `reason` | Status | Charged? | Retryable | What your app should do |
|---|---|---|---|---|
| `price_over_cap` | `400` | `none` | no | The approved price exceeds the platform ceiling. Ship a new version at a legal price |
| `price_changed` | `409` | `none` | no | Your UI showed a stale price. Show the refusal's `message` verbatim, re-confirm with the viewer, re-submit **once** with a fresh key. 🔴 Do **not** loop on re-reading the catalog — on a pinned install that returns the stale price forever; see [the pinned-install caveat](#a-pinned-install-can-be-charged-a-price-it-was-never-shown) |
| `self_purchase` | `400` | `none` | no | The buyer is the app owner. Never retryable — see the callout above |
| `already_owned` | `409` | `none` | no | The viewer already holds a live entitlement. Re-read entitlements and render the owned state |
| `insufficient_funds` | `400` | `none` | **yes** | Offer a top-up. A retry after the viewer buys Buzz genuinely can succeed |
| `duplicate` | `409` | `none` | no | Another attempt already completed this purchase. Re-read entitlements; do not charge again |
| `pending_reconciliation` | `409` | `none` | no | An earlier attempt is still being settled. Point the viewer at support — retrying walls them |
| `ledger_conflict` | `409` | `unknown` | no | The ledger id is occupied, including by a reversal. Nothing the viewer can do; this one is for a human |
| `charge_failed` | `400` / `500` | `none` or `reversed` | **yes** | Either nothing was charged or it was charged and given straight back. Safe to offer a retry |
| `charge_unknown` | `503` | `unknown` | **yes** | We cannot say whether Buzz moved. Retry with the **same** idempotency key; do not present it as a clean failure |

🔴 **`reason` is frequently absent, and a `switch` with no `default` will swallow
real failures.** Only the service-level refusals above carry one. The endpoint's
own refusals answer with `{ error }` and **no `reason` at all**:

| Refusal | Status | `reason` | Note |
|---|---|---|---|
| The good is not available (no such id, or the approved manifest no longer declares it) | `404` | *absent* | This is also how a good removed or broken by a later approved version stops being sellable — there is no separate delisting step |
| Purchase rate limit | `429` | *absent* | Carries `Retry-After`. Transient: nothing moved, so a retry once the window clears is allowed |
| Viewer's daily purchase limit reached | `400` | *absent* | The message names the daily ceiling. Not something your pricing can fix |
| Purchase limiter unavailable | `503` | *absent* | Transient. Retry |
| An attempt with this idempotency key is already in progress | `409` | *absent* | Wait for the first attempt; do not mint a new key |
| The idempotency key was already used for a **different** purchase payload | `422` | *absent* | A key is pinned to a payload fingerprint. Use one key per logical purchase |
| The idempotency store is unavailable | `503` | *absent* | Transient. Retry |

Always fall back to `status` plus `message` when `reason` is missing.

::: tip One `reason` you will find in the source and should not branch on
The server's refusal union declares a `good_not_found` member, and **no code path
returns it** — the unavailable-good case is the bare `404` in the table above,
with no `reason`. Do not write a branch for it.
:::

### Scope and permission refusals — the `code` key

Every block REST route runs behind the scope middleware, which refuses with a
different key: **`code`**, alongside the human `error` string. These are not
money-specific — they apply to any block route, including the goods endpoints —
and telling them apart is the whole reason `code` exists. Every one of these
means something different, and the remedy differs every time — do not collapse
them into "permission denied".

| `code` | Status | Means | Your remedy |
|---|---|---|---|
| `insufficient_scope` | `403` | The token never carried the scope this route needs | A manifest / approval problem. Declare the scope, justify it, resubmit. The name mirrors RFC 6750's OAuth 2.0 bearer error |
| `consent_revoked` | `403` | The token *does* carry the scope and the viewer has since withdrawn it | **Stop asking.** Let the host re-prompt; retrying the call cannot help |
| `context_binding` | `403` | The token carries the scope but the request does not match what it was bound to (wrong model id, an anonymous subject on a self-bound scope, an array-form query param) | Re-request a token for the right context. Not a consent problem |
| `instance_revoked` | `403` | This install went away, or the publisher was banned | Terminal for this instance. Not a scope or consent issue |
| `app_not_approved` | `403` | The app block is not approved | Nothing runtime-side to fix; this is the review gate |
| `permission_state_unavailable` | **`503`** | Permission state could not be read right now | 🔴 **The only retryable one, and the only one that is not a `403`.** Retry shortly. Treating it as a permanent denial takes away access the viewer still has |

Some refusals on this surface carry **no** `code` at all — an invalid or expired
block token answers `401`, and an unavailable approval lookup on a route that does
not elect to be served answers `503`. Treat "`code` is missing" as its own case
and branch on status there, rather than enumerating which refusals lack one.

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
      // 🔴 ONE place decides whether the key survives, and KEEPING it is the safe
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
            // 🔴 REQUIRED. `reason` is undefined for the 404, the 429, the
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
`idempotencyKey` is **a stable key for one logical purchase** — the SDK's own type
says so — which is why the example mints it once and holds it in a ref rather than
deriving it from an attempt counter, a timestamp or a render. What a stable key
buys you is narrow and worth knowing exactly: for a short window after a purchase
settles, a retry under the same key **replays that first verdict verbatim** instead
of mounting a second attempt, and a retry while the first attempt is still in
flight is refused `409` instead of racing it. A key that changes per attempt gets
neither.

What it does **not** buy you is the protection against double-charging. That comes
from a server-side transaction id the platform derives deterministically from the
purchase itself, with no randomness and no client key in it — which is also why
`charge_unknown` is marked retryable here even though Buzz may have moved, and why
your retry on that path is refused `pending_reconciliation` rather than charging
again. **So do not read a per-attempt key as a double-charge bug; read it as
giving up the replay and the `409`.**

**Do not build the key out of your `goodId` either.** A good id may be up to 64
characters on its own, and the key is validated at `1..64` **in total** (callout
below), so `` `buy-${goodId}-…` `` can be refused `400` on nothing but length —
and it fails for your longest-named goods only, which is exactly the shape that
survives testing. The `goodId` is already in the purchase payload, and the key is
pinned to that payload, so repeating it in the key buys no uniqueness. A prefixed
`crypto.randomUUID()` is 40 characters and safe at any good id.
:::

::: danger The idempotency key's charset is validated — `^[A-Za-z0-9_-]{1,64}$`
The idempotency refusals in the tables above are all about the *meaning* of your
key. This one is about its *spelling*, and it lands before any of them:
**letters, digits, `_` and `-` only, 1 to 64 characters.** The purchase route
validates its body first, so a key outside that class is refused with a plain
**`400`** —

```json
{ "error": "Invalid request body",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "idempotencyKey": ["Invalid string: must match pattern /^[A-Za-z0-9_-]{1,64}$/"]
    } } }
```

— and note what that envelope does **not** have: no `reason`, and none of the
`code` values from the tables above, because the request never reaches the
purchase logic. So a `switch` on `err.reason` cannot see this, and neither can
one on the scope `code`. Nothing is charged and no entitlement moves; the
purchase simply never happens.

🔴 **The colon is excluded on purpose**, so swapping it for `.` or `/` does not
help — those are outside the class too. The host joins the parts of its internal
per-viewer / per-app dedupe and rate-limit keys with `:`, and those joins stay
unambiguous only while none of the parts can contain one; your key is a part.
Join with **`-`** or `_`, as the example above does.

The **64** bound exists because the host derives a longer downstream identifier
from your key, against a 128-character ceiling it does not control.

The same charset applies to `useTip().tip()` and to the generation
`submit()` bag — note that `React.useId()` is **not** a usable key on any of
them: it returns a colon-wrapped value such as `:R0:`. `crypto.randomUUID()`
is fine. Full rationale:
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
