---
title: OAuth Quickstart
description: End-to-end Authorization Code + PKCE walkthrough with curl.
---

# OAuth Quickstart

This page walks the full Authorization Code + PKCE flow using nothing but
curl. By the end you'll have an access token and a refresh token for a
Civitai user.

Before you start, [register an app](./register-app) so you have a
`client_id` (and a `client_secret` if you marked it confidential), then
export them:

```bash
export CIVITAI_CLIENT_ID="…"
export CIVITAI_CLIENT_SECRET="…"   # confidential clients only
export REDIRECT_URI="https://your-app.example.com/oauth/callback"
```

## 1. Generate a PKCE verifier and challenge

```bash
# 43-128 chars, URL-safe base64
VERIFIER=$(openssl rand -base64 64 | tr -d '+/=\n' | cut -c1-64)
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 | tr '+/' '-_' | tr -d '=\n')
STATE=$(openssl rand -hex 16)
echo "$VERIFIER $CHALLENGE $STATE"
```

Keep `$VERIFIER` in your session store keyed by `$STATE` — you'll need it
when you exchange the code.

## 2. Send the user to /authorize

Pick a scope (decimal bitmask — see [Scopes](./scopes)). The example below
asks for `UserRead | AIServicesRead | AIServicesWrite | BuzzRead = 1 + 16384
+ 32768 + 65536 = 114689`:

```bash
echo "https://civitai.com/api/auth/oauth/authorize?$(cat <<EOF | tr -d '\n'
response_type=code
&client_id=$CIVITAI_CLIENT_ID
&redirect_uri=$REDIRECT_URI
&scope=98305
&state=$STATE
&code_challenge=$CHALLENGE
&code_challenge_method=S256
EOF
)"
```

Open that URL in a browser. Civitai will sign the user in if they aren't
already, show the consent screen with the requested scopes, and (if the
user approves) redirect them to your `redirect_uri`.

## 3. Receive the callback

The user lands on:

```
https://your-app.example.com/oauth/callback?code=…&state=…
```

**Validate `state`** matches what you stored in step 1. If it doesn't,
reject the response — it's a CSRF attempt or a stale flow. Then look up
the verifier you stashed for that `$STATE`.

## 4. Exchange the code for tokens

```bash
curl -X POST https://civitai.com/api/auth/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=$CODE" \
  -d "code_verifier=$VERIFIER" \
  -d "client_id=$CIVITAI_CLIENT_ID" \
  -d "client_secret=$CIVITAI_CLIENT_SECRET" \
  -d "redirect_uri=$REDIRECT_URI"
```

Response:

```json
{
  "access_token": "civitai_…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "civitai_…",
  "scope": "114689"
}
```

Store both tokens server-side. Never ship them to the browser.

## 5. Call the API

```bash
curl https://civitai.com/api/auth/oauth/userinfo \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "sub": "12345",
  "id": 12345,
  "username": "ada",
  "preferred_username": "ada",
  "name": "Ada Lovelace",
  "picture": "https://…",
  "image": "https://…",
  "email": "ada@example.com",
  "email_verified": true
}
```

The same bearer header works for every Civitai endpoint that accepts tokens
— browse [the site reference](../reference/) for what's available.

## 6. Refresh before the access token expires

Access tokens live 1 hour. Swap the refresh token for a fresh pair any time
before then:

```bash
curl -X POST https://civitai.com/api/auth/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=$REFRESH_TOKEN" \
  -d "client_id=$CIVITAI_CLIENT_ID" \
  -d "client_secret=$CIVITAI_CLIENT_SECRET"
```

You get a new `access_token` + `refresh_token` pair. The old refresh token
is invalidated — use the new one going forward.

## 7. Revoke when the user signs out

```bash
curl -X POST https://civitai.com/api/auth/oauth/revoke \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=$REFRESH_TOKEN" \
  -d "token_type_hint=refresh_token" \
  -d "client_id=$CIVITAI_CLIENT_ID" \
  -d "client_secret=$CIVITAI_CLIENT_SECRET"
```

Revoking a refresh token also revokes the access tokens it minted. The
endpoint always returns `200 {}` regardless of whether the token existed
(per [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009)) — don't
treat the response as confirmation.

::: warning Public clients
If your client is **public** (no `client_secret`) and the user revokes
consent from civitai.com, you can't call `/revoke` to clean up — revoke
requires authentication. That's fine: the user already cut you off. Just
discard the tokens locally.
:::

## Full working code

[civitai/civitai-oauth-demo](https://github.com/civitai/civitai-oauth-demo)
is a complete Node.js / Express reference implementation of every step
above — authorize, exchange, refresh, revoke. Clone it, plug in your
credentials, and you have a working OAuth integration to study or fork.
