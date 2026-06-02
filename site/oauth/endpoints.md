---
title: OAuth Endpoints
description: Request/response reference for the Civitai OAuth authorize, token, revoke, and userinfo endpoints.
---

# OAuth Endpoints

Base URL for every endpoint on this page: **`https://civitai.com`**.

## `GET/POST /api/auth/oauth/authorize`

Start the Authorization Code + PKCE flow. The caller is the **end user's
browser** — your app sends the user here, Civitai handles sign-in and
consent, then redirects them back to your `redirect_uri`.

### Request parameters

All parameters are URL-query on `GET` and form-body on the consent `POST`.

| Param | Required | Notes |
|---|:-:|---|
| `response_type` | ✓ | Must be `code`. |
| `client_id` | ✓ | From [app registration](./register-app). |
| `redirect_uri` | ✓ | Must exact-match one of the URIs you registered. |
| `scope` | ✓ | Decimal integer bitmask. See [Scopes](./scopes). |
| `state` | ✓ | Opaque value echoed back on the redirect. Use it to bind the response to a session and defeat CSRF. |
| `code_challenge` | ✓ | URL-safe base64 SHA-256 of your code verifier. |
| `code_challenge_method` | ✓ | Must be `S256` — `plain` is rejected. |
| `approved` | _consent POST_ | `true` when the user clicks Allow on the consent screen. |
| `remember` | _consent POST_ | `true` to persist consent so subsequent flows skip the screen. |
| `buzz_limit` | _consent POST_ | JSON-encoded buzz-spend budget. See [Buzz limits](./buzz-limits). |

### Behavior

- If the user has no session, Civitai redirects them to `/login` with a
  return URL pointing back at `/authorize`. Your app's request continues
  once they sign in.
- If the user has already consented with the **same `scope`**, Civitai
  skips the consent page and issues a code immediately.
- If the requested scope is wider than the prior consent (or there's no
  prior consent), the user sees the consent page.

### Successful response

`302 Found` redirect to:

```
<redirect_uri>?code=<authorization_code>&state=<your_state>
```

The `code` is single-use, valid for 10 minutes.

### Error responses

| Status | `error` | Cause |
|---:|---|---|
| 400 | `invalid_request` | Missing required param, bad `redirect_uri`, missing or non-S256 PKCE, missing state. |
| 400 | `invalid_client` | `client_id` doesn't exist. |
| 400 | `invalid_scope` | Scope is not a non-negative integer ≤ `Full`. |
| 429 | _rate_limit_ | More than **10 requests / minute / user**. |

### CORS

Permissive with credentials (`Access-Control-Allow-Credentials: true`) on
the preflight, but this endpoint is meant for top-level browser navigation
— don't call it from `fetch()`.

---

## `POST /api/auth/oauth/token`

Exchange an authorization code for tokens, or refresh an existing pair,
or mint a client-owned token via `client_credentials`.

### Common request headers

```
Content-Type: application/x-www-form-urlencoded
```

### Grant: `authorization_code`

| Param | Required | Notes |
|---|:-:|---|
| `grant_type` | ✓ | `authorization_code` |
| `code` | ✓ | The code from the `/authorize` redirect. |
| `code_verifier` | ✓ | The PKCE verifier paired with the `code_challenge`. |
| `client_id` | ✓ | |
| `client_secret` | _confidential only_ | Required for confidential clients; rejected for public clients. |
| `redirect_uri` | ✓ | Must match the value sent to `/authorize`. |

### Grant: `refresh_token`

| Param | Required | Notes |
|---|:-:|---|
| `grant_type` | ✓ | `refresh_token` |
| `refresh_token` | ✓ | The refresh token you currently hold. |
| `client_id` | ✓ | |
| `client_secret` | _confidential only_ | |
| `scope` | – | Optional — narrow the granted scope; cannot widen. |

The old refresh token is invalidated when this call succeeds. Persist the
new one before discarding the old one.

### Grant: `client_credentials`

Issues a token bound to the **client's owner account**, with no end user
involved. Confidential clients only.

| Param | Required | Notes |
|---|:-:|---|
| `grant_type` | ✓ | `client_credentials` |
| `client_id` | ✓ | |
| `client_secret` | ✓ | |
| `scope` | – | Defaults to the client's `allowedScopes`. |

### Successful response

```json
{
  "access_token": "civitai_…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "civitai_…",
  "scope": "114689"
}
```

`refresh_token` is omitted for `client_credentials`.

### Error responses

[RFC 6749 §5.2](https://datatracker.ietf.org/doc/html/rfc6749#section-5.2) error envelope:

```json
{ "error": "invalid_grant", "error_description": "…" }
```

| `error` | Meaning |
|---|---|
| `invalid_grant` | Code is unknown, already used, expired, or PKCE verifier didn't match. Refresh token unknown or expired. |
| `invalid_client` | `client_id` unknown, or confidential client supplied wrong `client_secret`. |
| `invalid_request` | Missing required param. |
| `unsupported_grant_type` | `grant_type` not in the list above. |
| `invalid_scope` | Requested scope exceeds the client's `allowedScopes` or the original consent. |

**Rate limit:** 20 requests / minute / `client_id` → `429`.

**CORS:** permissive — this endpoint is designed to be called from third-party origins.

---

## `POST /api/auth/oauth/revoke`

Invalidate an access or refresh token ([RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009)).

### Request

```
Content-Type: application/x-www-form-urlencoded
```

| Param | Required | Notes |
|---|:-:|---|
| `token` | ✓ | The token string to revoke. |
| `token_type_hint` | – | `access_token` or `refresh_token` — Civitai tries both regardless, the hint is an optimization. |
| `client_id` | _public via session_ | Required for the client-credentials authentication path. |
| `client_secret` | _confidential clients_ | Required if you're authenticating as a confidential client. |

### Authentication

The caller must prove authority to revoke the token via **one** of:

- A Civitai session cookie (browser context — user revoking their own token).
- `client_id` + `client_secret` on a **confidential** client.

Public clients with no session can't call `/revoke` — that's fine, just
drop the tokens locally. Revoking a token whose owner doesn't match the
caller is silently ignored, per RFC 7009.

### Response

Always `200 {}` regardless of whether the token existed or matched the
caller. **Don't** treat the response as confirmation that the token was
real or that you owned it.

Revoking a **refresh token** also invalidates every access token it minted
for the same `client_id` / user pair.

**Rate limit:** 20 requests / minute / IP.

---

## `GET /api/auth/oauth/userinfo`

Identify the user behind an access token.

### Request

```
Authorization: Bearer civitai_…
```

No body. The token must include the `UserRead` scope — which is
[granted on every token by default](./scopes#userread-is-always-granted),
so in practice this endpoint always works.

### Response

Standard OIDC UserInfo claims ([OIDC Core §5.1](https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims)):

```json
{
  "sub": "12345",
  "id": 12345,
  "username": "ada",
  "preferred_username": "ada",
  "name": "Ada Lovelace",
  "picture": "https://image.civitai.com/…",
  "image": "https://image.civitai.com/…",
  "email": "ada@example.com",
  "email_verified": true
}
```

- `sub` is the string form of `id` for compatibility with OIDC consumers.
- `email` is present whenever the account has an email on file. Unverified
  emails are still returned, with `email_verified: false`.
- A claim is omitted when its underlying value is genuinely absent.

### Error responses

| Status | `error` | Cause |
|---:|---|---|
| 401 | `invalid_token` | Missing, malformed, or expired bearer token. |
| 403 | `insufficient_scope` | Token doesn't include `UserRead`. Only possible for legacy tokens issued before `UserRead` became a mandatory baseline; they pick it up on their next refresh. |

**CORS:** permissive — call from any origin.

For richer user info (links, stats, etc.) use the
[`GET /api/v1/me`](../reference/users) endpoint with the same bearer token.
