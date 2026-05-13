---
title: OAuth Scopes
description: The full scope bitmask used by Civitai OAuth tokens, plus the four presets exposed in the app-registration UI.
---

# OAuth Scopes

Civitai OAuth scopes are bitwise flags. To request multiple scopes, OR them
together and pass the **decimal integer** as the `scope` parameter on the
`/authorize` URL.

```text
scope = UserRead | AIServicesRead | AIServicesWrite | BuzzRead
      = 1 | 16384 | 32768 | 65536
      = 114689
```

## Scope reference

| Bit | Value | Scope | What it grants |
|---:|---:|---|---|
| 0 | 1 | `UserRead` | Read profile & settings |
| 1 | 2 | `UserWrite` | Update profile & settings |
| 2 | 4 | `ModelsRead` | Browse & download models |
| 3 | 8 | `ModelsWrite` | Upload & edit models |
| 4 | 16 | `ModelsDelete` | Delete models |
| 5 | 32 | `MediaRead` | View images, videos & posts |
| 6 | 64 | `MediaWrite` | Upload media & create posts |
| 7 | 128 | `MediaDelete` | Delete media & posts |
| 8 | 256 | `ArticlesRead` | Read articles |
| 9 | 512 | `ArticlesWrite` | Create & edit articles |
| 10 | 1 024 | `ArticlesDelete` | Delete articles |
| 11 | 2 048 | `BountiesRead` | View bounties |
| 12 | 4 096 | `BountiesWrite` | Create & manage bounties **(buzz spend)** |
| 13 | 8 192 | `BountiesDelete` | Delete bounties |
| 14 | 16 384 | `AIServicesRead` | View generation & training history |
| 15 | 32 768 | `AIServicesWrite` | Generate, train & scan **(buzz spend)** |
| 16 | 65 536 | `BuzzRead` | View buzz balance & history |
| 17 | 131 072 | `CollectionsRead` | View collections |
| 18 | 262 144 | `CollectionsWrite` | Manage collections |
| 19 | 524 288 | `SocialWrite` | Follow, react, comment & review |
| 20 | 1 048 576 | `SocialTip` | _Reserved — see below_ |
| 21 | 2 097 152 | `NotificationsRead` | Read notifications |
| 22 | 4 194 304 | `NotificationsWrite` | Manage notification preferences |
| 23 | 8 388 608 | `VaultRead` | View vault |
| 24 | 16 777 216 | `VaultWrite` | Manage vault |
| — | 33 554 431 | `Full` | All scopes |

## Buzz-spend scopes

Two scopes carry an implicit buzz-spend authorization — granting them
lets your app draw from the user's buzz balance:

- **`AIServicesWrite`** — every generation/training/scan request the app
  makes is billed to the consenting user. This is the only scope subject
  to the per-app [buzz limit](./buzz-limits) cap users can set at consent.
- **`BountiesWrite`** — bounty creation costs buzz at post time. Spend is
  gated by the user's overall balance only; per-app caps don't apply.

(`SocialTip` would be a third — see the reserved note below.)

Pair either with **`BuzzRead`** if you want to surface the user's
remaining balance in your UI before a spend.

::: warning SocialTip is currently reserved
The `SocialTip` bit is defined in the scope enum but every server endpoint
that requires it (tipping, donation goals, event tipping) is gated by
`blockApiKeys: true`, which denies all API-key and OAuth callers
regardless of scope. Granting `SocialTip` today is a no-op. The bit stays
reserved (and locked at 1&lt;&lt;20) so we don't reshuffle the bitmask when
tipping is unblocked for OAuth in the future.
:::

## Presets

The app-registration UI exposes four convenience presets. You can also
target them from the `scope` URL parameter directly:

| Preset | Decimal | Scopes |
|---|---:|---|
| **Read Only** | 10 701 093 | All `*Read` scopes |
| **Creator** | 11 492 205 | Read Only + Models / Media / Articles / Bounties / Collections Write + SocialWrite |
| **AI Services** | 114 688 | `AIServicesRead` \| `AIServicesWrite` \| `BuzzRead` |
| **Full Access** | 33 554 431 | Every defined scope |

Use a preset's number on `/authorize` and the consent screen will still show
the user every flag underneath — there's no shortcut around per-scope consent.

## Asking for less than you registered

The `allowedScopes` you set during [registration](./register-app) is a
ceiling, not a floor. You can ask for any subset of those bits on any
individual `/authorize` call — useful when one user only needs read access
but another wants to spend buzz, and you want a single registered app for
both.

If you request a scope bit your app isn't registered for, the user is
shown the consent screen anyway but Civitai will trim the token to your
allowed scopes when it issues it. Read the `scope` value back from the
token-endpoint response — it's authoritative.

## Checking scopes at the API boundary

Pass the access token as `Authorization: Bearer <token>` on any Civitai
endpoint. The endpoint returns `403 insufficient_scope` if the token's
scope is missing the bit it requires:

```json
{
  "error": "insufficient_scope",
  "error_description": "Token does not have UserRead scope"
}
```

That's the signal to re-run the flow with a wider scope (or, more often,
to display "this action needs additional permissions" in your UI).
