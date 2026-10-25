---
title: Local dev loop — mock and live
description: Running a Civitai App against a real host locally — the page-money dev harness's mock and live modes, minting a dev block token with civitai app dev-token, which credentials can spend Buzz, and how dev:live reaches the backend.
sources:
  - go:github.com/civitai/cli
---

# Local dev loop — mock and live

A Civitai App runs as a sandboxed iframe inside a **host** page, and the host is
what sends `BLOCK_INIT`, brokers generation, and answers the block→host
protocol. Locally there is no host — so plain `npm run dev` shows you your own
UI and **nothing of the protocol**. Every hook that talks to the host sits there
waiting for a message that never arrives.

The **`page-money`** template closes that gap with a dev **harness** built on the
SDK's [`@civitai/blocks-react`](https://www.npmjs.com/package/@civitai/blocks-react)
hosts. It has two modes, and they live on deliberately separate subexports — the
mock host on `/testing`, the real-money one on `/live`.

| Command | Mode | What it mounts |
| --- | --- | --- |
| `npm run dev:harness` | **mock** (default) | The SDK **mock host** — synthetic replies, **no real Buzz, no compute, no network.** Safe to spam; drive the money, error and insufficient-Buzz paths from on-screen scenarios or URL query params. Start here. |
| `npm run dev:live` | **live** | The SDK **live host** (`createLiveHost`) — forwards the App protocol to the **real Civitai backend** with a pasted dev token. **Spends REAL Buzz and real compute.** |

Both serve on `http://localhost:5186`.

::: tip `dev:harness` is the wide one — do not infer its limits from `dev:live`'s
The mock host answers the whole block→host protocol, so hooks that `dev:live`
refuses work there, including posting, image save/upload, wildcard packs,
[workflow files](./workflow-files) and the
legacy App-Storage message families. It has no
[document store](./storage#local-development), which is not on the bridge. You do not need beta access, a token, or any Buzz
to exercise any of them.
:::

## The mock host enforces the spend scope

From `@civitai/blocks-react` 0.70.0, the mock host refuses
`estimate()`, `estimateBatch()` and `submit()` for a token without
`ai:write:budgeted`, as the real host does. Its default is a token **without**
that grant, matching the first token production hands a block, so out of the box:

- `estimate()` and `estimateBatch()` **reject** (code `'failed'`), with no cost;
- `submit()` asks for consent, the mock grants it and pushes a refreshed token,
  and the retry resolves normally. It is charged once, because the retry reuses
  the same idempotency key. With `consentGrantable: false` the submit rejects
  instead.

A test or harness session that is not about consent should start granted:
`createMockHost({ consentGranted: true })`, or `?consent=granted` on the dev
harness URL. A test that **is** about consent can now drive the whole loop:
estimate, see the refusal, `requestConsent({ scopes: ['ai:write:budgeted'] })`,
wait for the scope on `useBlockToken().scopes`, and estimate again.

## `dev:live` works on a pending app

You do **not** have to wait for moderator approval to iterate against the real
backend. The dev-token mint accepts a **pending** slug — right after a successful
`civitai app submit` — and it accepts a brand-new slug with no app row at all,
because it falls back to the scopes in your local `block.manifest.json`
(clamped server-side). So `create → dev-token → dev:live` works directly.

`dev:live` forwards the **money path** (`estimate` / `submit` / `poll` /
`cancel`) and the Buzz balance read to the real backend, and serves the
**resource pickers** as a protocol-identical in-harness overlay. A Buzz purchase
opens the real purchase page in a new tab and answers `purchased: false`,
because the harness cannot see the purchase complete. On a page context,
`SET_USER_CHECKPOINT` is refused exactly as the page host refuses it. A
capability the live host cannot serve refuses with an error rather than a faked
success; use mock mode for those.

**Storage does not work under `dev:live`:**

- The [document store](./storage#local-development) is not reached at all. It
  is called over HTTP by `@civitai/sdk`, not over the bridge this harness
  forwards, and the `page-money` template does not use `@civitai/sdk`.
- Legacy App Storage (`useAppStorage`) is forwarded, and the server refuses it:
  those calls need a civitai.com browser session, which a local harness never
  has, so every developer gets `401` `Apps access is not enabled for this
  browser session`. It says nothing about your account or your app.
- Legacy shared storage (`useSharedStorage`) is refused too. Approval is
  checked first, so before your app is approved the refusal is about approval
  (`app block not found` while the app has no record yet, as for a first
  version still in review, or `app block is not approved`). Once it is
  approved, the refusal is about scope: the shared scopes are never minted on a
  dev token.

Exercise the legacy stores under `dev:harness` (they are
[shut down on 2026-11-10](./storage#moving-from-the-legacy-stores), after which
their calls fail), and the document store with
[`createFakeStorage`](./storage#testing).

## Minting a dev block token

Live mode needs a short-lived dev block token. Mint it with
`civitai app dev-token` — the CLI handles the invite-gated mint route with your
stored credential, so there is no hand-rolled `curl` — and paste it into
`.env.development.local` as `VITE_LIVE_BLOCK_TOKEN`:

```bash
# From your scaffolded project directory:
civitai app dev-token my-block --env >> .env.development.local
npm run dev:live
```

`--env` prints the `VITE_LIVE_BLOCK_TOKEN=<token>` line ready to append; without
it the token goes to stdout on its own.

The command reads the scopes to request from your **local**
`block.manifest.json`, which is why it works on a slug you have never submitted.
`.env.development.local` is the git-ignored one — the scaffold's `.gitignore`
covers `.env.*.local`, and `civitai app submit` drops it from the bundle — so the
token never ships. It is short-lived (roughly a 4-hour JWT); re-run `dev-token`
when it expires, and never commit it.

With no token at all, `dev:live` **fails safe**: it renders a notice telling you
to mint one, and never silently spends.

## Spending real Buzz needs an explicit `--spend`

::: danger The CLI never requests budgeted spend implicitly
Without `--spend`, the `ai:write:budgeted` scope is **filtered out** of the mint
request — **even when your `block.manifest.json` declares it**, which the
scaffolded money app does. The command tells you when that happens. A token
minted that way looks fine and then refuses to generate with
`block lacks ai:write:budgeted scope`.
:::

```bash
civitai app dev-token my-block --spend               # request ai:write:budgeted (real Buzz)
civitai app dev-token my-block --budget 250 --spend  # …with the maximum per-generation budget
```

`--spend` does two things to the request: it adds `ai:write:budgeted` to the
scopes requested, and it sets the request's spend-intent field to `true`. The
server still **clamps against your credential**, so `--spend` cannot grant what
your credential does not carry. Every other manifest scope is requested
unchanged.

### `--budget` is a per-generation ceiling

`--budget <n>` (1–250 Buzz) sets the token's **per-generation** Buzz budget. Omit
it and the server picks one — **50** for a slug with no submitted app. Your local
`block.manifest.json`'s `page.buzzBudgetPerGen` does **not** raise it: until the
app is submitted there is no server-side manifest to read, so the 50 is a flat
default rather than a clamp of your file. `--budget` is the only way to move it.

A generation is **refused outright** when the recipe's Buzz ceiling exceeds that
budget, so a shipped recipe with a ceiling of 90 dead-ends on the default:

```
insufficient buzz budget: recipe ceiling 90 exceeds budget 50
```

Raise the budget rather than editing the recipe.

::: warning For an inline `customComfy` graph, `maxBuzz` is also a timeout
It is **both** the Buzz ceiling **and** the step timeout **in seconds**. An
over-thrifty budget therefore does not fail as a billing error — the step runs
out of wall clock and comes back `expired`, which reads like a broken graph.
Budget for the seconds the graph needs. `--budget 250` buys 250 s of wall clock
as well as 250 Buzz.
:::

## Which credential can spend?

Spending Buzz — a real `dev:live` generation, or a `civitai generate` run from
the terminal — needs the **AI Services** scope. Two credentials carry it, and the
default OAuth login deliberately does not:

- **A full-scope personal API key — yes.** Create it **in the web UI** at
  `civitai.com/user/account`, then `civitai login --token <key>`. A personal key
  carries AI Services. You cannot mint one over OAuth or from the CLI; the web UI
  is the only route.
- **`civitai login --scopes generate` — yes.** An OAuth login that opts in. It is
  **additive** on top of the default, so it keeps Apps submit and dev-tunnel too.
  `--scopes` applies only to the browser device login and is rejected alongside
  `--token`.
- **`civitai login` with no `--scopes` — no.** The default scope set grants
  identity, Apps submit and dev-tunnel, and deliberately **not** Buzz-spend: a
  plain login must never silently hand the CLI authority to spend your Buzz.
  That is fine for a read/identity `dev:live` session; it cannot generate.

This is the single most common blocker for generation: a default OAuth login
looks perfectly valid, and the refusal is a **scope** problem rather than a login
problem. Re-running plain `civitai login` will not fix it.

Check before a live run rather than after:

```console
$ civitai whoami
Logged in as your-handle (id 12345) at https://civitai.com

Credential:
  Type:                     OAuth login

Capabilities:
  Read Buzz balance:        yes
  Spend Buzz (AI Services): yes
  Submit Apps:              yes
```

`Spend Buzz (AI Services)` is the line that decides it, and `whoami` names the
fix for whichever credential you have. The dev token always grants
`user:read:self`, so your viewer resolves on either path.

## How `dev:live` reaches the backend

The scaffold wires this — there is nothing to configure — but it is worth knowing
why, because it is the part that breaks if you reach for a direct fetch.

`dev:live` routes the live host's backend calls through the **Vite dev proxy**
(`server.proxy['/api']`), not straight to `civitai.com`. `createLiveHost` fetches
`/api/...` **same-origin** against the dev server on `localhost:5186`, and Vite
proxies that server-side to Civitai with the `Origin` header rewritten to an
allowlisted host.

That is load-bearing, and it fixes two independent problems at once: a direct
cross-origin fetch from `localhost` is blocked by the CORS preflight, *and*
rejected by Civitai's tRPC origin gate. The same-origin proxy plus the Origin
rewrite closes both. `VITE_LIVE_HOST_ORIGIN` overrides the proxy **target**
(default `https://civitai.com`).

The rest of the harness's environment variables and its scenario knobs are
documented in your scaffolded project's own `README.md` and `.env.example` —
they ship with the template rather than being platform contract.

## Previewing inside the real host

The harness gives you the protocol. To see your local build rendered inside
civitai.com's actual chrome — the real page host bridge, real pickers, real
session, and on a pending or approved app your real Buzz — use
`civitai app dev-tunnel`. Start
`npm run dev:tunnel` in one terminal, run `civitai app dev-tunnel` against the
same port in another, and it prints a `civitai.com/apps/dev/<blockId>` URL to
open. It mints an **ephemeral** SSH keypair in memory — never written to
`~/.ssh` — opens a reverse tunnel from your local dev server, and revokes the
session server-side on Ctrl-C or an idle timeout. See the
[CLI reference](../reference/cli) for its flags.

⚠️ **While a submission is pending, the tunnel's token does not take its scopes
from your local `block.manifest.json`.** On an app that has never been approved
they come from the pending submission's manifest; once it is rejected or
withdrawn, the tunnel goes back to the local manifest under the rules in the
next paragraph. The default `page-elements` template
scaffolds `"scopes": []`, so a scope you add locally after submitting
(generation needs `ai:write:budgeted`) is not on the token. A slug holds one
pending submission at a time, so changing it means `civitai app withdraw` and
submitting again, and withdrawing a first-version submission deletes its listing
media (see the [CLI reference](../reference/cli)). Declare the scopes the app
needs before the first `civitai app submit`. On an app that has been approved,
the tunnel uses the last approved version's scopes, so a scope added in a later
version reaches the token only once that version is approved.

⚠️ **The tunnel is narrower than `dev:live` for real generation on a
never-approved app with no pending submission** (never submitted, or its
submission rejected or withdrawn). That path carries a third, spend-specific
gate on top of author access, and it is open to fewer people; when it is closed the mint drops
the budgeted-spend scope, so the app renders inside the host and Generate does
nothing. The *pending* and *approved* tunnel paths are unaffected. If what you
want is real generation before submitting, `dev:live` above does it on a
`page-money` app. The default `page-elements` template has no `dev:live`
script; there, declare `ai:write:budgeted` and submit, then use the pending
tunnel path.

## Next

- [Review, approval and deploy](./review-and-deploy) — what happens once you run
  `civitai app submit`.
- [Your store listing](./store-listing) — the media and text your app needs
  before it can publish.
- [Scopes reference](../reference/scopes) — what each scope grants and what the
  host refuses without it.
