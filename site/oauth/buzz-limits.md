---
title: Buzz spend limits
description: How Civitai users cap an OAuth app's buzz spending, and what your app should expect at runtime.
---

# Buzz spend limits

OAuth tokens that include `AIServicesWrite` authorize your app to spend
the user's buzz on AI services (generation, training, scanning). To keep
that authorization sane, the consent flow lets users cap how much an app
can spend, and they can change the cap later from civitai.com.

Your app doesn't set or change the limit — the user does — but knowing
what they see and how it surfaces at runtime will save you a lot of debugging.

::: info Scope of the cap
Per-app buzz caps are enforced by the orchestrator, so they only apply to
**orchestrator-mediated spend** — every AI-services call your token makes.
Other buzz-spending scopes that an OAuth token can carry (notably
`BountiesWrite`, which lets the user create bounties) are gated by the
user's overall balance but are **not** subject to the per-app cap.
:::

## How users set a limit

When the user reaches the consent screen for a scope that includes
`AIServicesWrite`, Civitai shows a budget control alongside the scope list.
The current UI exposes a single "sliding window" budget — buzz limit + period
— but the underlying schema is more flexible.

After consent, users manage existing limits from **Account → Connected
Apps**. They can:

- Edit the limit per app.
- Remove the limit entirely (no cap).
- Revoke the app outright (which is a stronger action — invalidates all
  the app's tokens).

## Budget shape

Limits are stored as an array of budgets. Each budget is one of:

| Type | Fields | Meaning |
|---|---|---|
| `absolute` | `limit`, optional `currencies` | Hard cap. Once hit, no more spending on those currencies until the user resets. |
| `sliding` | `limit`, `unit`, `window`, optional `currencies` | Rolling window — e.g. `unit: 7, window: "day"` is "no more than `limit` in any 7-day stretch." This is what the simple UI ships. |
| `rollover` | `limit`, `cron`, optional `currencies` | Calendar-based reset on a cron expression (e.g. monthly reset on the 1st). |

`currencies` (when set) restricts the budget to specific buzz pools — leave
it off and the budget covers every buzz currency.

Your app **doesn't read** this structure directly — it's stored per-user
and enforced server-side. You'll only ever see its effect: spend calls
succeed or fail.

## What your app sees at runtime

When the orchestrator blocks a spend — for either "user is broke" **or**
"user's per-app cap is hit" — Civitai surfaces it the same way:

```json
{
  "code": "BAD_REQUEST",
  "message": "Hey buddy, seems like you don't have enough funds to perform this action."
}
```

(The `message` may be replaced by an orchestrator-provided detail string
when a per-app limit is what tripped the call — but the response **code is
the same** either way.)

There's no separate error code that lets you distinguish "out of buzz"
from "capped by the user". If you need to give a precise message to the
user, parse `message` defensively, or check the user's per-app spend
state via [`GET /api/v1/me`](../reference/users) ahead of the call and
present a likely-cause hint based on whether a limit is set.

::: warning Don't rely on message text for programmatic decisions
The exact default message string above comes from
[`throwInsufficientFundsError`](https://github.com/civitai/civitai)'s
helper and may change. Treat anything beyond the HTTP/RPC code as
human-readable only.
:::

## Best practices for buzz-spending clients

- **Surface the user's balance.** Call
  [`GET /api/v1/me`](../reference/users) periodically and show buzz in
  your UI — users hate guessing whether their next click will be denied.
- **Use `whatif=true` for cost preview**, not for limit detection. The
  orchestration `whatif` mechanism ([see the orchestration guide](../../orchestration/guide/submitting-work))
  is designed to give you a per-currency cost breakdown before you submit
  for real; treat it as a costing tool, not a "will this be denied?" oracle.
- **Don't retry on insufficient-funds errors.** Whether it's a real shortfall
  or the user's per-app cap, retrying won't help until balance or limits
  change. Show the user the error and let them resolve it.
- **Treat token revocation as expected.** A user who hits their cap may
  decide to revoke your app entirely from civitai.com. Your refresh-token
  call will return `invalid_grant`; handle that by sending the user back
  through `/authorize` (with messaging that explains why).
- **Never persist budget assumptions across sessions.** Users can change
  their cap any time; treat each spend call as the source of truth.

## When you don't need buzz scopes

If your app doesn't spend buzz on the user's behalf — e.g. a read-only
analytics dashboard, or one that submits work using **your own**
`client_credentials` token — don't request `AIServicesWrite`. Users won't
see the buzz-cap UI, and you skip a whole category of failure modes.
