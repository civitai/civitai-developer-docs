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

<ScopesTable />

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

- **Consent gating.** Most self-reads are consent-exempt (server visibility is
  the gate), but some scopes — notably `collections:read:private` — are
  **consent-gated**: the viewer must grant them through the host consent gate
  before a token will carry them.
- **Dev-token / dev-tunnel restrictions.** The shared-storage scopes
  (`apps:storage:shared:*`) are deliberately never minted for pre-approval dev
  sessions; only an approved, mod-reviewed app that declares them gets them.
- **Per-op assertions.** Storage scopes are asserted per operation (a read scope
  can't perform a write) on the server side, independent of what the token
  carries.

If a scope you declare isn't approved, granted, or in-context, the corresponding
host call fails closed — design your app to degrade gracefully.
