---
title: CLI credentials and scopes
description: civitai login's OAuth device flow versus a personal API key, why a default browser login cannot spend Buzz, the --scopes generate opt-in, and how to read civitai whoami's tri-state capabilities from a script.
sources:
  - go:github.com/civitai/cli
---

# CLI credentials and scopes

The [`civitai` CLI](./cli) holds **one** credential at a time, and which one
you have decides what you can do. Two commands can look identical and fail
differently purely on this.

This page is about the CLI's stored credential. For passing a token to the REST
API directly — headers, query parameters, what a 401 looks like — see
[Authentication](./authentication).

## Two kinds of credential

### `civitai login` — the OAuth device flow

`civitai login` with no flags runs the **OAuth device-authorization grant**: it
prints a URL and a short code, you approve in your browser, and the CLI stores
a short-lived access token plus a refresh token that it rotates automatically
before requests and once on a `401`. The lifetimes are the server's, not the
CLI's — the CLI stores whatever expiry the token response carries and refreshes
against it.

By **default** it requests identity, Apps submit (which gates both `app submit`
and the dev-token mint) and the on-site dev tunnel — the bitmask `100663297`.

::: danger A default browser login cannot spend Buzz
That default deliberately omits `AIServicesWrite`. A plain `civitai login`
drives the read/identity paths — viewer, catalog, app storage — but for a
generation app it has its `ai:write:budgeted` scope stripped at mint time and
**cannot estimate, submit, or spend real Buzz**. Re-running plain
`civitai login` will not fix that.
:::

### `civitai login --scopes generate` — opting in

```bash
civitai login --scopes generate   # additive: keeps submit + dev-tunnel, ADDS generation
```

That requests `100777985` — the default **plus** `AIServicesRead`,
`AIServicesWrite` and `BuzzRead` — giving one credential that can both submit
apps and run [`civitai generate`](./cli-generate).

`--scopes` takes a **named set**, never a raw bitmask; an unknown name is
rejected with the list of valid ones. It applies only to the browser device
login and is refused alongside `--token`.

::: warning The device-flow scope check is all-or-nothing
Requesting any bit the `civitai-cli` OAuth client's `allowedScopes` does not
permit rejects the **whole** login with `invalid_scope`. On `civitai.com` that
client's `allowedScopes` **is** `100777985`, so `--scopes generate` works.
Against a **self-hosted or older** auth server (a non-default
`CIVITAI_BASE_URL`) that predates the widening it is rejected, and the CLI maps
the rejection to a message telling you plain `civitai login` still works there.
:::

### A personal API key

A full-scope **personal API key** is the other way to get spend authority, and
it is still the only credential carrying the rest of the Full scope mask.
Create one at [your account page](https://civitai.com/user/account), then:

```bash
civitai login --token <key>       # stores a personal API key (no refresh)
```

`CIVITAI_TOKEN` in the environment overrides the stored credential and is
treated as a personal key.

## What `civitai whoami` reports

`whoami` prints the authenticated user, then **two** sections: a **Credential**
section carrying the one identity *attribute* (the credential type), and a
**Capabilities** section of **three** *verdicts*.

```console
$ civitai whoami
Logged in as zach (id 1) at https://civitai.com

Credential:
  Type:                     personal API key

Capabilities:
  Read Buzz balance:        yes
  Spend Buzz (AI Services): yes
  Submit Apps:              yes
```

That is the whole of stdout for a full-scope personal key. A credential whose
**Spend Buzz** row says `no` gets one more block appended below, naming the fix
for *that* credential — `civitai login --scopes generate` for an OAuth login, a
full-scope personal key otherwise.

`civitai whoami --scopes` additionally prints the full decoded scope list.

### Submit Apps is a tri-state, and `unknown` is not `no`

The server scope-gates submit **only** on OAuth tokens (the opt-in
`AppBlocksSubmit` bit, which the Full scope mask deliberately excludes); a
personal API key is not scope-gated for submit at all. So:

| Credential | `tokenScope` reported | Submit Apps |
| --- | --- | --- |
| Personal API key | either | **`yes`** — never scope-gated, so the mask is irrelevant |
| OAuth login | present | `yes` / `no` from the `AppBlocksSubmit` bit |
| OAuth login | **absent** | **`unknown`** — the bit *is* the answer, and the server did not report it |
| No `subject` in the response | either | **`unknown`** — we cannot tell which gate applies |

When the server reports no scope mask, the two **Buzz** rows are **omitted**
rather than printed as `no`, and the output says so. It is scoped to Buzz
because the Submit Apps row above it may well be a known answer:

```console
$ civitai whoami
Logged in as zach (id 1) at https://civitai.com

Credential:
  Type:                     OAuth login

Capabilities:
  Submit Apps:              unknown
  (token scope not reported by the server — Buzz capabilities unknown)
```

A `yes` means the credential's **scope** permits submit — not that the account
is in the author cohort. The remaining author-cohort and not-banned gates are
server-side and are not visible to the CLI.

## `whoami --json`

::: danger `--json` is a stable, *curated* identity object
It is **not** the server's raw `/api/v1/me` body. It is a hand-built projection
of fourteen keys, and the two the server sends that never appear are **`email`
and `emailVerified`**. Those are PII this command does not print, so passing
the body through would be a privacy regression, not a fix.
:::

```json
{
  "base_url": "https://civitai.com",
  "canReadBalance": true,
  "canSpend": false,
  "canSubmitApps": true,
  "capabilities": { "can_read_buzz": true, "can_spend_buzz": false },
  "credentialType": "personal API key",
  "id": 1,
  "isMember": true,
  "scopes": ["UserRead", "BuzzRead"],
  "scopesKnown": true,
  "status": "active",
  "subscriptions": ["yellow"],
  "tier": "silver",
  "username": "zach"
}
```

### The account profile is `null` when unreported, never `""` / `false` / `[]`

`tier`, `status`, `isMember` and `subscriptions` are `null` when the server did
not report them. The CLI will not fabricate a value the server did not send, so
a script must test for `null` before reading any of the four. `subscriptions`
is a list of strings: `[]` means reported and empty, `null` means not reported.

::: warning The four degrade together
They come from one strict parse, so if *any* of them arrives in an unexpected
shape, **all four** become `null` rather than some of them being dropped
silently — `whoami` still prints your identity and capabilities normally.
:::

`isMember` is the one worth branching on: a member and a free account do not
see the same usable generation ecosystems, so it predicts whether
`civitai generate`'s defaults are even available to this credential.

### Two fields carry a third state

- **`canSubmitApps` is `true` / `false` / `null`.** `null` means *unknowable*
  (the two rows in the table above), and a consumer must not read it as
  `false`: a script doing `if (!j.canSubmitApps)` treats `null` the same as
  `false` and will report a dead end that may not exist. Test
  `j.canSubmitApps === null` first.
- **`scopes` is a list, `[]`, or `null`.** `null` means the scope mask was not
  reported (`scopesKnown: false`); `[]` means the mask **was** reported and had
  no bits set.

`scopesKnown` disambiguates `canReadBalance` and `canSpend`, which stay plain
booleans: when it is `false`, both are `false` because nothing is known, not
because the capability was denied.

## Where to go next

- [Generating images from the CLI](./cli-generate) — which of these credentials
  can spend.
- **Exit codes** — exit `3` and what it does *not* cover: see the
  [CLI README](https://github.com/civitai/cli#exit-code-3).
- [CLI guide](./cli) — installing the binary and the read commands.
