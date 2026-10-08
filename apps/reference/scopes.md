---
title: Scopes reference
description: The full Civitai App scope catalog — what each scope authorizes, its OAuth bit, and how it is bound.
sources:
  - civitai:src/shared/constants/block-scope.constants.ts#BLOCK_SCOPE_TO_OAUTH_BIT
  - civitai:src/server/services/blocks/scope-descriptions.constants.ts#SCOPE_DESCRIPTIONS
  - civitai:src/server/middleware/block-scope.middleware.ts#enforceContextBinding
---

# Scopes

Every capability an app can use is gated by a **scope**. An app declares the
scopes it needs in its `block.manifest.json`; a moderator reviews them; and at
runtime the host mints a short-lived block token carrying only the
approved-and-granted subset. The block never holds a long-lived credential.

The table below is generated from the `civitai` scope constants — the same
source the manifest validator and the token minter read.

<ScopesTable>
<!-- BEGIN GENERATED: scopes — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

| Scope | What it authorizes | OAuth bit | Binding |
|---|---|---|---|
| `models:read:self` | Read the model on the page where the block is mounted | `ModelsRead` | Bound to the model on the page where the block is mounted (a model-slot install supplies the modelId context). |
| `user:read:self` | Read the viewer's username and account status | `UserRead` | Self-bound to the token subject; rejected for an anonymous subject. |
| `ai:write:budgeted` | Run AI work that spends the viewer's Buzz, with a per-call cap | `AIServicesWrite` | Host-enforced per-call Buzz cap; the token carries a buzzBudget claim the host clamps against. |
| `buzz:read:self` | Read the viewer's Buzz balance | `BuzzRead` | Self-bound to the token subject (the signed-in viewer). |
| `social:tip:self` | Post tips on behalf of the viewer | `SocialTip` | Self-bound: tips are posted as the token subject. |
| `apps:storage:read` | Read this app's private per-install data store | — | Scoped to this app's private per-install store; asserted per read op. |
| `apps:storage:write` | Write to this app's private per-install data store | — | Scoped to this app's private per-install store; asserted per write op. |
| `apps:storage:shared:read` | Read this app's shared, community-wide data (e.g. everyone's posts + vote counts) | — | Scoped to this app's shared (cross-user) store; min-trust gate + fail-closed flag. Never minted for dev-tunnel / dev-token sessions. |
| `apps:storage:shared:write` | Post + vote in this app's shared, community-wide data — visible to all users of the app | — | Scoped to this app's shared (cross-user) store; min-trust gate + fail-closed flag. Never minted for dev-tunnel / dev-token sessions. |
| `collections:read:self` | Browse and read public Civitai collections, and your own public collections | — | Self-bound; public collections + the viewer's own public collections. Consent-exempt (server visibility/ownership is the gate). |
| `collections:write:self` | Bookmark (follow) collections on your behalf | — | Self-bound: follow/bookmark on the viewer’s own behalf. Consent-exempt. |
| `collections:read:private` | Read your private collections | — | Self-bound; CONSENT-GATED — the viewer must grant it via the host consent gate before a token carries it. |
| `posts:write:self` | Publish posts to your profile from this app's own results — you approve each one | `MediaWrite` | Self-bound to the token subject; an anonymous subject is rejected — there is no anonymous profile to post to. CONSENT-GATED and SENSITIVE: a manifest declaring it must carry a scopeJustifications entry or submit is rejected. The grant alone is not the whole consent story — the host also opens a per-post confirm rendering the resolved title, tags and images, because the content differs every time and a blanket grant cannot inform. |
| `goods:read:self` | See which of this app's items you already own | — | Self-bound, and app-bound: the reply is scoped server-side to the calling app's own blockId, so an app only ever sees the entitlements IT sold to this viewer — never their purchases in any other app. Consent-exempt for that reason (the server-side app scoping is the gate, as with the collections read scopes); a non-anonymous subject is still required. No OAuth bit — an app good is a platform-mediated entitlement that touches none of the viewer's Civitai resources through the OAuth surface. |
| `goods:purchase:self` | Buy this app's items with your Buzz | — | Self-bound: the purchase is billed to the token subject, and an anonymous subject is rejected — there is nobody to bill. CONSENT-GATED and SENSITIVE: money leaves the viewer's balance, so it needs an explicit grant AND a scopeJustifications entry or submit is rejected. Bounded rather than prohibited on page apps: the price is review-gated and hard-capped per purchase, with a per-user daily ceiling across every app. It does NOT consult the per-app daily Buzz budget that governs ai:write:budgeted — that is a separate rail. No OAuth bit, deliberately: reusing social:tip:self's SocialTip bit would let every app already approved to tip start selling goods. |
| `apps:store:items:write` | List items you made in this app in the Civitai App Store, under your name | — | Self-bound: the item is published under the token subject's name, so an anonymous subject is rejected. App-bound: the parent is the calling app's own listing, taken from the token and never from the request. SENSITIVE but CONSENT-EXEMPT: a manifest declaring it must carry a scopeJustifications entry, and the per-call server checks (an app enabled for store items, the caller's own shared-storage item, rate limits, moderator review of every item) are the gate rather than a consent prompt. Never minted for dev-token, dev-tunnel or review sessions, so it reaches only an approved app's token. |

<!-- END GENERATED: scopes -->
</ScopesTable>

## How to read this table

- **Scope** — the exact string you put in `manifest.scopes`.
- **What it authorizes** — the capability it unlocks.
- **OAuth bit** — the underlying `OauthClient.allowedScopes` bit this scope maps
  to. Your app's manifest scopes must be a **strict subset** of the OAuth
  client's allowed bits (a registration-time gate, re-checked at token issuance).
  A `—` means the scope has **no** OAuth bit and is gated by another mechanism
  (noted in **Binding**) rather than the bitmask.
- **Binding** — how the scope is constrained at runtime. `:self` scopes are
  bound to the token subject (the signed-in viewer) and are rejected for an
  anonymous subject; model-slot scopes require the model context from the page
  the block is mounted on.

## What this table can't show (the server enforces more)

- **Consent gating.** Only the app-storage scopes, `models:read:self`,
  `collections:read:self`, `collections:write:self`, `goods:read:self` and
  `apps:store:items:write` are consent-exempt. Every other scope —
  `user:read:self`, `buzz:read:self`, `collections:read:private` and
  `ai:write:budgeted` among them — is **consent-gated**: the viewer must grant it
  through the host consent gate before a token will carry it.
- **Dev-token / dev-tunnel restrictions.** The shared-storage scopes
  (`apps:storage:shared:*`) are deliberately never minted for pre-approval dev
  sessions; only an approved, mod-reviewed app that declares them gets them.
  `apps:store:items:write` goes further: no dev-token, dev-tunnel or review
  session is ever minted it, so you can only exercise
  [store items](../guide/store-items) from an approved app.
- **Per-op assertions.** Storage scopes are asserted per operation (a read scope
  can't perform a write) on the server side, independent of what the token
  carries.

If a scope you declare isn't approved, granted, or in-context, the corresponding
host call fails closed — design your app to degrade gracefully.

The refusal carries a machine-readable `code` that distinguishes these cases
from each other — "you never had this scope", "the viewer withdrew it", "the
request doesn't match what the token was bound to" and "permission state is
temporarily unreadable" all call for different behaviour, and only one of them
is retryable. The full list, with statuses and remedies, is in
[How an app earns](../guide/earning).
