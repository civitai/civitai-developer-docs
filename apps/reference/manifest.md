---
title: Manifest reference
description: Every block.manifest.json field, generated from the canonical JSON Schema.
sources:
  - https://civitai.com/schemas/app-block/v1.json
  - civitai:public/schemas/app-block/v1.json
  - '@civitai/app-sdk/schemas/app-block/v1.json'
  - civitai:src/server/services/block-manifest-validator.service.ts
---

# Manifest

Every app ships a `block.manifest.json` that declares its identity, the scopes
it needs, and how it renders. The platform publishes the **canonical JSON Schema
(Draft 2020-12)** for this file at
[`https://civitai.com/schemas/app-block/v1.json`](https://civitai.com/schemas/app-block/v1.json).
Set that URL as your manifest's `$schema` for editor validation. The table below
is generated from the **same canonical schema** — the one the `@civitai/app-sdk`
and the `civitai` CLI vendor and validate against — so it never drifts from what
the server accepts.

<JsonSchemaTable>
<!-- BEGIN GENERATED: manifest — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

| Field | Type | Required | Notes |
|---|---|---|---|
| `$schema` | `string` | optional | Optional JSON-Schema reference; ignored by the platform validator. |
| `blockId` | `string` | required | The block slug. Becomes the canonical submission slug. Lowercase, starts with a letter, hyphen-separated, 3-40 chars. `pattern: ^[a-z][a-z0-9-]*[a-z0-9]$, minLength 3, maxLength 40` |
| `version` | `string` | required | Semantic version (x.y.z, optional -prerelease). `pattern: ^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$, minLength 1` |
| `name` | `string` | required | Human-readable display name. The server only requires a non-empty string (no length cap), so the CLI does not impose one either. `minLength 1` |
| `tagline` | `string` | optional | Optional one-line pitch shown under the app's name on its `/apps` store card + detail page. Manifest-governed: it flows to the store listing on moderator-approve and is re-synced from the manifest on every subsequent approved version. Omit it and the store simply shows no tagline. Must contain a non-whitespace character and is capped at 140 characters — the same bound off-site listings use (OFFSITE_TAGLINE_MAX), kept in lockstep with MANIFEST_TAGLINE_MAX_LENGTH in src/server/services/block-manifest-validator.service.ts (a drift-guard test enforces equality). NOTE: the server measures the TRIMMED length, while this maxLength counts the raw string — so a value padded past 140 is rejected here but accepted server-side. That asymmetry is deliberate and one-directional: this schema is never more permissive than the server, so local validation can't green-light something submit would reject. `pattern: \S, minLength 1, maxLength 140` |
| `type` | `"block"` | optional | Free-form descriptor used by some examples (e.g. "block"). Not validated by the platform. |
| `contentRating` | `"g" \| "pg" \| "pg13" \| "r" \| "x"` | required | Content rating of the app surface. |
| `category` | `"generation" \| "games" \| "utility" \| "discovery" \| "moderation" \| "analytics" \| "other"` | optional | Optional marketplace category for the app's `/apps` store listing. When present it flows to the listing automatically on moderator-approve (only when a moderator has not already curated a category). Omit to let a moderator categorise the app. Must be one of the known marketplace categories — this enum is kept in lockstep with MARKETPLACE_CATEGORIES in src/server/services/blocks/marketplace-categories.constants.ts (a drift-guard test enforces equality). |
| `renderMode` | `"iframe" \| "inline" \| "hybrid"` | optional | How the block renders. Defaults to "iframe". "inline"/"hybrid" require a verified/internal trust tier (server-assigned), so authors should leave this as iframe. |
| `trustTier` | `"unverified" \| "verified" \| "internal"` | optional | SERVER-OWNED. Do NOT set this in your manifest — the platform assigns the trust tier during review. Present here only to reject dev-set values. |
| `scopes` | `string[]` | required | Capabilities the block requests. Must be a strict subset of what review grants. Each scope is lowercase colon-separated. |
| `scopeJustifications` | `object` | optional | Per-scope justification: a map of scope-id → free-text rationale explaining WHY the app needs that permission, shown to the moderator during review. REQUIRED for SENSITIVE scopes — any declared scope that can spend or read the viewer's Buzz, read the viewer's private data, or write data other users see (e.g. `ai:write:budgeted`, `social:tip:self`, `buzz:read:self`, `collections:read:private`, `apps:storage:shared:write`) MUST carry a non-empty justification here, or the manifest is rejected at submit time. OPTIONAL for non-sensitive scopes — omit those and the manifest stays valid. Every key MUST be a scope also present in `scopes` (justifications for scopes you don't request are rejected). Each value is a non-empty string of at most 500 characters. The requirement is enforced imperatively by the manifest validator (not expressed as JSON-Schema conditionals here). NOTE: the justification captures the developer's STATED rationale only; the platform does not verify the truth of the claims. |
| `minApiVersion` | `string` | optional | Minimum App SDK API version the block targets (informational). `pattern: ^\d+(\.\d+)*$` |
| `buildCommand` | `string` | optional | Config-as-code: command the platform runs to build the static bundle. Must be one of an allowlisted set of build invocations (defense-in-depth against shell injection): "npm run \<script>", "pnpm run \<script>", "yarn run \<script>" (where \<script> is a package.json script name), "vite build", or "npx vite build". Omit for no-build (static) apps. When set, outputDir must also be set. The pattern and max length are kept in lockstep with BUILD_COMMAND_RE / BUILD_COMMAND_MAX_LENGTH in src/server/services/block-manifest-validator.service.ts (a drift-guard test enforces equality). `pattern: ^(?:(?:npm\|pnpm\|yarn) run [a-zA-Z0-9:_-]+\|(?:npx )?vite build)$, minLength 1, maxLength 128` |
| `outputDir` | `string` | optional | Config-as-code: directory (relative to the project root) the buildCommand emits static files into (e.g. "dist"). Must be a safe relative path — no leading "/", no ".." path traversal, no backslash separators, and no Windows drive prefix (e.g. C:). Required when buildCommand is set. Kept in lockstep with the outputDir checks in src/server/services/block-manifest-validator.service.ts (a drift-guard test enforces equality). (The server additionally rejects a NUL byte; that impossible-in-a-manifest case is intentionally omitted here for RE2 regex portability.) `minLength 1, maxLength 256` |
| `publicSettingsKeys` | `string[]` | optional | Allowlist of settings keys exposed to anonymous viewers. Default (omitted) = none exposed. `maxItems 32` |
| `assetBundleUrl` | `string (uri)` | optional | Optional v2 surface — HTTPS URL to a hosted asset bundle. Must be a public https URL. `pattern: ^https://` |
| `iframe` | `object` | optional | iframe envelope. NOTE: iframe.src is SERVER-OWNED — do NOT set it; the platform stamps the canonical bundle URL during build/approve. |
| `page` | `object` | optional | Full-page surface descriptor (W10). Page apps mount at /apps/run/\<slug>. |
| `targets` | `object[]` | optional | Model-page slot targets. Each target's slotId must be a known registered model slot (not the page slot). Optional for page-only apps. `maxItems 16` |

<!-- END GENERATED: manifest -->
</JsonSchemaTable>

## Required fields

`blockId`, `version`, `name`, `contentRating`, and `scopes` are always required.
`iframe.src` is **server-owned** — do not set it (see below); the platform stamps
the canonical bundle URL during build/approve.

Note the tightened constraints the schema now surfaces (all server-enforced):

- **`blockId`** — a DNS-label slug: lowercase, starts with a letter, 3–40 chars,
  `^[a-z][a-z0-9-]*[a-z0-9]$`. It becomes `<blockId>.civit.ai`.
- **`version`** — semantic version (`x.y.z`, optional `-prerelease`), not just any
  non-empty string.
- **`scopes`** — each entry must be one of the known scopes (the enum in the
  table above), not merely a well-formed `a:b:c` string. See [Scopes](./scopes).

## Optional fields worth calling out

- **`category`** (enforced) — an optional marketplace category for the app's
  `/apps` store listing. If present it must be one of the enum values in the
  table; an unknown value is **rejected** at submit time. Omit it to let a
  moderator categorise the app.
- **`assetBundleUrl`** (enforced) — an optional v2 surface. Must be a public
  `https://` URL on an origin registered in your app's OAuth-client
  `allowedOrigins` (SSRF + origin binding); private, non-HTTPS, or off-origin
  values are rejected.
- **`type`** and **`minApiVersion`** (informational) — accepted but **not
  enforced** by the validator. Safe to include as documentation; don't treat
  them as load-bearing.

### Sizing `page.buzzBudgetPerGen`

`page.buzzBudgetPerGen` is a **safety ceiling, not a cost estimate.** It caps
what a **single** generation your app requests is allowed to cost, so that a bug
in your app — or a compromised bundle — cannot drain the viewer's Buzz. It is
not a forecast of your bill.

**Set it well above your worst-case run.** A good rule of thumb is *several
times* your worst case — `1000` when a run costs ~100, not `100`. Headroom is
free: the server re-prices every submit and charges the **real** price, so a
generous ceiling never costs you or the viewer more.

The multiplier is generous rather than tight because the trade is **asymmetric**:
too low breaks the app for *every* user until a new manifest ships and is
re-approved, while too high costs nobody anything. So pick the number the way you
would pick a blast radius — *how large a single generation am I willing to let a
compromised build request?* — rather than by taking a price and adding a margin.
A budget derived from one workflow's current price re-breaks the moment you add a
step or call a pricier model or recipe.

**Setting it to an estimate is the common mistake, and it breaks the app.** The
server compares the real price against your budget *before anything runs*, so a
generation that comes in over budget is **rejected outright** with `insufficient
buzz budget` — no workflow is created and no Buzz is spent, but the user gets
nothing back, and it stays broken for **every** user until you ship a new
manifest version and it is re-approved. Anything that pushes real cost up — more
steps, a bigger resolution, a pricier model, a costlier recipe — turns a budget
sized to today's estimate into a hard outage.

Practical notes:

- **Omitting it** on a page that declares `ai:write:budgeted` mints tokens with a
  **10 Buzz** fallback budget, which is below almost any real generation — so
  every submit fails. `civitai app validate` warns about this.
- The server **clamps** the budget to the platform per-gen cap (**1000** today),
  so you cannot set an unsafe value by being generous.
- It bounds **one generation only.** Cumulative spend is separately capped **per
  viewer per day** and **per app**, so a high per-gen ceiling does not widen
  total exposure.
- For Comfy recipes it is also a hard **floor**: a submit is rejected when the
  recipe's own `maxBuzz` ceiling exceeds the token budget.

## Server-owned fields

Some fields appear in the schema for completeness but are **owned by the
platform** — a value you submit is normalized or overridden server-side:

- **`iframe.src`** — normalized and host-allowlisted at registration. You don't
  point this at your own host; the platform serves your app from
  `https://<slug>.civit.ai/`.
- **`trustTier`** — always assigned by the server; a submitted value is ignored.

## What the schema can't express (the validator wins)

The JSON Schema describes the manifest's **shape and enums**. The authoritative
`BlockManifestValidator` at submit time additionally enforces semantic rules
that JSON Schema can't:

- **SSRF host allowlisting** on `iframe.src`.
- **Scope ⊆ OAuth-client** — your declared `scopes` must be a subset of the
  app's OAuth-client allowed bits (see [Scopes](./scopes)).
- **Sandbox-token allowlisting by trust tier.**
- **`buildCommand` allowlist** — only a fixed set of build invocations is
  permitted. The published schema only bounds the length; the **validator**
  carries the positive allowlist regex and additionally rejects shell
  metacharacters. A `buildCommand` that passes local schema validation can still
  be rejected at submit time.
- **`outputDir` traversal** — the schema blocks a leading `/`; the validator also
  rejects `..`, backslashes, and other traversal/escape sequences.

In two small spots the published schema is *marginally stricter* than the
runtime validator: it locks `type` to `["block"]` and requires `outputDir`
whenever `buildCommand` is set, whereas the validator ignores `type` and
defaults `outputDir`. The server validator is the true gate — and it enforces
**more** than the schema elsewhere (the semantic rules above) — so don't
over-constrain based on the table alone.

::: warning The validator is the enforcement boundary
A manifest can pass local JSON-Schema validation and still be rejected at submit
time. If the schema and the validator ever conflict, **the validator wins.**
:::
