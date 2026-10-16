---
title: "Viewer, consent and navigation hooks"
description: "The viewer, sign-in and consent prompts, maturity and gated images, following collections, and navigating the host. Part of the Hooks reference."
---

<!-- GENERATED PAGE — do not edit by hand. Written by `npm run gen:appblocks:md` (scripts/appblocks-md.mjs); which entry lives on which page is decided in .vitepress/theme/components/referenceSplit.shared.mjs. -->

# Viewer, consent and navigation hooks

The viewer, sign-in and consent prompts, maturity and gated images, following collections, and navigating the host.

This page documents 9 of the 47 hooks in the [Hooks reference](../hooks), which indexes every hook by name. Generated from the published `@civitai/blocks-react@0.73.2` package's type definitions and README.

Other pages: [Context, frame and analytics hooks](./context) · [Generation hooks](./generation) · [Batch, confirmed-step and training hooks](./batches-and-training) · [Buzz, purchase and tip hooks](./buzz-and-purchases) · [Storage, picker and media hooks](./storage-and-media)

<HooksReference group="viewer-and-navigation">
<!-- BEGIN GENERATED: hooks/viewer-and-navigation — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`useViewer`**

```ts
useViewer(): UseViewer
```

```ts
interface UseViewer {
  viewer: BlockViewer | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

The signed-in viewer as an on-demand authoritative self-read (`{ id, username, status, buzzBudget }`) — distinct from `useBlockContext().viewer`, the coarse `BLOCK_INIT`-time snapshot. `status` is `'active' | 'muted'`; `username` (`string | null`) and `buzzBudget` (`number | null`) are present-but-nullable, so handle the null case. Host-mediated over `GET_VIEWER` → `VIEWER_RESULT` (the host resolves the viewer from the block token via `blocks.getMyViewer`); an anonymous / banned viewer comes back as `error`. Fetches on mount; `refetch` for on-demand refreshes.

```tsx
const { viewer, loading, error, refetch } = useViewer();
// `viewer` is null until the first successful fetch. An anon / banned viewer,
// missing scope, or host failure → `error`. `username`/`buzzBudget` may be null.
if (!loading && viewer) console.log(`${viewer.username ?? 'anon'} · budget ${viewer.buzzBudget ?? 0}`);
```

**`useCollectionFollow`**

```ts
useCollectionFollow(): UseCollectionFollow
```

```ts
interface UseCollectionFollow {
  setFollow: (args: { collectionId: number; follow: boolean; }) => Promise<BlockCollectionFollowResult>;
  pending: boolean;
  error: CollectionFollowError | null;
}
```

```md
Follow / unfollow a collection **for the viewer**, host-mediated over
`SET_COLLECTION_FOLLOW`. Returns `{ setFollow, pending, error }`.

**No block scope, and no token on the wire.** The host calls the session-authed
`collection.follow` / `collection.unfollow` procedures, which self-bind to the
viewer server-side — `collectionId` is the only thing a block influences.

🔴 **Every call opens a host-chrome consent confirm naming the collection**, and
that click is the *only* consent this path has ever had: the HTTP predecessor's
`collections:write:self` scope is consent-exempt server-side and prompted nobody.
Moving to this bridge **tightens** the flow; what it gives up is the manifest
`scopes` declaration a moderator reads before install. The host resolves the
collection's name itself (there is no `name` field on the wire, deliberately) and
bounds that to **20 distinct ids per block instance** — past the cap it refuses
with `collection-unavailable`, the same code a collection the viewer cannot see
gets.

`setFollow` **rejects** with a `CollectionFollowError` on every non-success. Two
of those are not failures to render:

| | meaning | what to do |
|---|---|---|
| `err.declined` | the viewer dismissed the confirm — **no write occurred** | revert, say nothing |
| `err.signInRequired` | no session | route into `useRequestSignIn()` |
| `err.timedOut` | no reply arrived within the 10-min consent bound | 🔴 **check this BEFORE `.message`** — it also has no `.code`, and its message is an SDK-internal string. It does **not** mean no write occurred; re-read your state |
| `err.code` set otherwise | a host refusal (`invalid-request` / `review-mode` / `not-ready` / `collection-unavailable`) | show or ignore per case |
| `err.code === undefined` **and** `!err.timedOut` | a **server** message the host forwarded verbatim | show `err.message` |
```

```tsx
const { setFollow, pending } = useCollectionFollow();
const { requestSignIn } = useRequestSignIn();

async function toggle() {
  try {
    const result = await setFollow({ collectionId, follow: !followed });
    setFollowed(result.followed); // adopt the host's echo, not the guess
  } catch (err) {
    if (err instanceof CollectionFollowError) {
      if (err.signInRequired) return requestSignIn();
      if (err.declined) return; // the viewer said no — say nothing
      if (err.timedOut) return showToast('Still working — check back in a moment.');
      showToast(err.message); // a real server message, safe to render
    }
  }
}
```

```md
Most blocks want `<FollowButton>` from `@civitai/blocks-react/ui` instead, which
wires all of the above.
```

**`useCivitaiNavigate`**

```ts
useCivitaiNavigate(): UseCivitaiNavigate
```

```ts
interface UseCivitaiNavigate {
  navigate: (path: string, options?: 'current' | 'new_tab' | UseCivitaiNavigateOptions) => void;
}
```

```md
Request a navigation from the host. The hook sends a `NAVIGATE` message and
returns — fire-and-forget, so the block never learns what the host did,
including when the host **refuses** the request.

`scope` selects the **space** `path` is resolved in, and it **defaults to
`'app'`**:

| `scope` | `path` resolves | The viewer |
|---|---|---|
| `'app'` *(default)* | under **this app's own route**, as a sub-path of it | stays in your app; the page stays mounted |
| `'site'` | at the **civitai.com root** | leaves your app for a site page |

> 🔴 **A leading slash carries no meaning.** The host normalises it away in
> **both** scopes, so `'/settings'` and `'settings'` are one request within
> whichever scope you chose. That means `navigate('/models/12345')` asks for
> **your app's** `/models/12345` — *not* civitai's model page. To reach the
> civitai.com page, say so: `navigate('models/12345', { scope: 'site' })`.
>
> Both spellings were app-scoped before `scope` existed, so no call you have
> already written changed meaning — that is the point of the default.

`'site'` is granted **per-surface**: the public run page and the dev tunnel allow
it, and a private run or a moderator's review preview refuse it. A refusal is
silent, so do not build a flow that needs to know it happened.

`target` is a REQUEST, not a guarantee. How the host acts on `'current'` vs
`'new_tab'` is host-side behaviour and the host is the authority on it; this
package sends the message and makes no promise about the outcome.

> 🔴 **Nothing in your manifest enables `'new_tab'`.** In particular, do **not**
> declare `allow-popups-to-escape-sandbox`: the host intersects a manifest's
> `iframe.sandbox` with a fixed allowlist that does not contain that token, so it
> is dropped for every block at every trust tier and declaring it has no effect.
> Earlier versions of this page said `'new_tab'` required it — that was wrong.
```

```tsx
const { navigate } = useCivitaiNavigate();

// Your app's own pages — the default.
navigate('settings');                    // this app's /settings
navigate('/settings');                   // identical; the slash means nothing

// A civitai.com page — needs an explicit scope.
navigate('models/12345', { scope: 'site' });
navigate('models/12345', { scope: 'site', target: 'new_tab' });

// The pre-`scope` two-argument shape still works, and is still app-scoped.
navigate('detail/7', 'new_tab');
```

```md
An app-scoped `navigate()` is **half** of a round trip. The host owns the
history, so the way your block learns where it ended up is
[`useCivitaiRoute()`](#usecivitairoute) — read that next if you are routing.
```

**`useCivitaiRoute`**

```ts
useCivitaiRoute(): UseCivitaiRoute
```

The sub-path below your app's root that is **currently showing**. This is the other half of an app-scoped [`useCivitaiNavigate()`](#hook-useCivitaiNavigate): you ask the host to move, the host pushes it shallowly so your frame stays mounted, and this is how you find out where you went.

```tsx
function Router() {
  const subPath = useCivitaiRoute(); // '' on your app's index
  const [view, id] = subPath.split('/');
  return view === 'compare' ? <Compare id={id} /> : <Index />;
}
```

```md
It also reports the moves you **did not** ask for: the viewer's own
back/forward, and a deep link the host resolved after init.

Two things set the value — `BLOCK_INIT`'s `context.subPath` at mount, and the
host's `ROUTE_CHANGED` push on every later change. **The first value is never a
message**, which is why this is a value hook rather than an `onRouteChanged`
callback: a callback alone cannot see where the block started, and a change that
lands before its subscription effect runs is lost. It is the same value as
`useBlockContext().context.subPath` on a page slot — reach for this when the
route is all you need, and because its return type is a plain `string` instead of
a field on a union you have to narrow.

> 🔴 **No leading slash.** The host sends the segment below your app root, so
> `subPath === 'compare/42'` is the comparison that works and
> `subPath === '/compare/42'` is the one that silently never matches.

> 🔴 **`''` is a real route — your app's index — and it is also the pre-init
> value.** The two are indistinguishable from this hook alone, exactly as
> `'light'` is both a real theme and [`useBlockTheme()`](#useblocktheme)'s
> pre-init value. Gate on `useBlockContext().ready` if your first paint must tell
> them apart.

> 🔴 **Read it on every render.** A block that copies the value into state once
> at mount, or routes imperatively in a mount-only effect, stays on the route it
> started with — the URL moves and nothing renders, which is the exact symptom
> this message exists to end.

**Page slot only.** A model-page slot has no route of its own, so this returns
`''` there and never moves. Against a host that predates `ROUTE_CHANGED` the
value simply stays at the init sub-path (the old behaviour); nothing awaits the
message, so there is no hang either way.

Exercise it locally with `pnpm dev:live`, where `navigate()` drives the real
message end-to-end. `createMockHost` has **no** route control, deliberately: it
does not handle `NAVIGATE` at all and has no URL to move, so a synthetic setter
there would be a second, weaker way to produce a message the live host already
produces from the call a block actually makes.
```

**`useRequestSignIn`**

```ts
useRequestSignIn(): UseRequestSignIn
```

```ts
interface UseRequestSignIn {
  requestSignIn: (payload?: { returnUrl?: string; }) => void;
}
```

Ask the host to open its sign-in flow for an ANONYMOUS viewer (fire-and-forget). On sign-in the host re-inits the block with the now-authenticated viewer.

```tsx
const { requestSignIn } = useRequestSignIn();
// e.g. onClick of a "Sign in to generate" button:
requestSignIn();
```

**`useRequestConsent`**

```ts
useRequestConsent(): UseRequestConsent
```

```ts
interface UseRequestConsent {
  requestConsent: (payload?: { scopes?: string[]; }) => void;
}
```

The manual version of the above — still exported, still the right tool when you want to prompt *before* a call (e.g. on an onboarding screen) rather than after one fails. Lazy consent: ask the host to open its consent UI when a LOGGED-IN viewer takes an action whose consent-gated scope the block token is missing (e.g. Generate needs `ai:write:budgeted` but the viewer hasn't granted it). Fire-and-forget — on grant the host pushes a new token; observe `useBlockToken().scopes` and retry.

```tsx
import { useRequestConsent } from '@civitai/blocks-react';

const { requestConsent } = useRequestConsent();
requestConsent({ scopes: ['ai:write:budgeted', 'buzz:read:self'] });
```

```md
🔴 **Always pass `scopes`, with a real scope name in it — it is optional in the
signature but a precondition for the refusal path below.** The host grants the
missing set it computed at mint, so a bare `requestConsent()` still opens the
consent dialog. But `CONSENT_UNAVAILABLE` is computed *from the hint*: with no
explicit scope proven un-grantable, the host cannot tell "can never be granted"
from "the viewer hasn't confirmed yet", so it stays silent rather than guess.

The bar is an array holding **at least one non-empty string** — not merely "an
array is present". `undefined`, a non-array, `[]`, `['']` and `[1, 2]` all
produce silence, in `pnpm dev` and in production alike, so
`requestConsent({ scopes: [] })` follows the instruction and still receives
nothing. To its author that reads as a broken message rather than a thin
argument.
```

**`useConsentUnavailable`**

```ts
useConsentUnavailable(): UseConsentUnavailable
```

```ts
interface UseConsentUnavailable {
  refusal: ConsentUnavailablePayload | null;
  reset: () => void;
}
```

Some environments withhold a scope at mint (a dev-tunnel preview token, a surface that carries no money scope), so no consent round-trip can ever add it. The host then pushes an uncorrelated `CONSENT_UNAVAILABLE` — *not* a reply, because `REQUEST_CONSENT` carries no `requestId`. Consume it and stop telling the user to retry something that can't succeed:

```tsx
import { useConsentUnavailable, useRequestConsent } from '@civitai/blocks-react';

function ConsentAwareGenerate() {
  const { requestConsent } = useRequestConsent();
  const { refusal, reset } = useConsentUnavailable();

  // 🔴 Branch on `refusal !== null`, NEVER on `refusal.scopes.length`. The host
  // refuses on its own unfiltered set but names only scopes in the public
  // vocabulary, so `scopes: []` is a legitimate refusal — gating on the length
  // silently drops the very message you subscribed for. Use the names for copy.
  if (refusal) {
    return (
      <div>
        <p>Generating isn't available on this page.</p>
        <button onClick={reset}>Try again</button>
      </div>
    );
  }
  // 🔴 `scopes` is REQUIRED for a refusal to ever arrive — see above.
  return <button onClick={() => requestConsent({ scopes: ['ai:write:budgeted'] })}>Generate</button>;
}
```

````md
`refusal` holds the latest `ConsentUnavailablePayload` (`{ reason, scopes }`) or
`null`; `reset()` clears it, since a refusal is scoped to the scopes that were
asked for and shouldn't latch for the life of the block. Against a host that
never sends the message the hook simply stays `null` — nothing awaits it, so
there is no timeout to hit.

🔴 **The push is UNCORRELATED, and that is the permanent shape of this API.**
`REQUEST_CONSENT` carries no `requestId`, so a refusal cannot be matched to the
request that provoked it. Two consequences to design around:

- **Every mounted `useConsentUnavailable()` sees every refusal.** There is no
  reliable filter: `scopes` is advisory and may legitimately be `[]`, so it
  cannot serve as a correlation key. If two independent parts of your block
  request different scopes, both will see both refusals. Keep a request and its
  refusal UI in one component, or track the outstanding request yourself.
- **A refusal is buffered across mounts, so one that arrives while the consumer
  is unmounted is not lost.** The transport hands an unsolicited push only to
  handlers registered at the instant it arrives, so without this a refusal that
  landed before the consumer mounted — the requester and the consumer being
  different components, or the consumer being conditionally rendered — vanished,
  and the block went back to showing "click Generate again" beside the host's
  "unavailable". `requestConsent()` arms the buffer as it sends. It keeps only
  the latest refusal, is dropped when the block token changes (a refusal is a
  claim about *that* token's scopes, and the grant path re-mints), and is cleared
  by `reset()` — so the "Try again" button above genuinely resets, rather than
  having the refusal reappear on the next mount. A `REQUEST_CONSENT` you post
  through the raw transport instead of the hook does not arm it.

Without the hook (a non-React consumer, or one wiring the transport directly),
the same push is available untyped — note the explicit type import, which the
cast needs and which the hook makes unnecessary:

```tsx
import { getTransport } from '@civitai/blocks-react';
import type { ConsentUnavailablePayload } from '@civitai/app-sdk/blocks';

const unsubscribe = getTransport().onMessage('CONSENT_UNAVAILABLE', (payload) => {
  // `onMessage` hands you `unknown`; this cast is UNCHECKED, which is why
  // `useConsentUnavailable()` is the preferred path.
  const { reason, scopes } = payload as ConsentUnavailablePayload;
  console.info('permission unavailable', reason, scopes);
});
```

To exercise the refusal locally, run the mock host with
`createMockHost({ consentGrantable: false })`, flip it live with
`host.setScenario({ consentGrantable: false })`, or append `?consent=ungrantable`
to the dev harness URL — the `<Harness>` chrome then reads `consent=ungrantable`
rather than `withheld`. `dev:live` emits it too: live mode can grant nothing, so
any request for a scope your dev token lacks produces one.
````

**`useDomainMaturity`**

```ts
useDomainMaturity(): UseDomainMaturity
```

```ts
interface DomainMaturity {
  domain?: ColorDomain | null;
  maxBrowsingLevel?: number;
  effectiveBrowsingLevel?: number;
  isSfw: boolean;
  isLevelAllowed: (level: number) => boolean;
}
```

Read the maturity ceiling in force for the current viewer, so a block can hide/blur mature affordances. **Fail-closed SFW** until `BLOCK_INIT` lands or against a host that projects no ceiling.

```tsx
const { isSfw, isLevelAllowed } = useDomainMaturity();
const showRSlider = isLevelAllowed(BrowsingLevel.R);   // false on a SFW domain
```

````md
The gates account for **two** things, and the distinction matters:

| field | answers |
| --- | --- |
| `maxBrowsingLevel` | what this **domain** permits anybody (identical for every viewer on it) |
| `effectiveBrowsingLevel` | what **this viewer** may be shown here — the domain ceiling narrowed by their own NSFW setting |

`isSfw` / `isLevelAllowed` gate on the second, so a viewer who turned NSFW off
sees SFW affordances even on a mature domain. `effectiveBrowsingLevel` is always
a subset of `maxBrowsingLevel`, so reading these can only ever show the viewer
**less** — never more. Compare the two when you want to explain *why* something
is hidden:

```tsx
const { maxBrowsingLevel, effectiveBrowsingLevel } = useDomainMaturity();
const hiddenByYourSettings = effectiveBrowsingLevel !== maxBrowsingLevel;
```

The hook's name is historic — it shipped when the domain ceiling was the only
signal. There is deliberately no separate viewer-maturity hook: two hooks would
mean two answers to "may I show this", and the one named for the domain would be
the wider of the pair.

Drive it locally with `createMockHost({ domain: 'red', viewerBrowsingLevel: BrowsingLevel.PG })`.
The mock clamps that option to its own ceiling exactly as the real host does, so
you cannot test against a viewer wider than the domain — production cannot
produce one either.
````

**`useGatedImages`**

```ts
useGatedImages(): UseGatedImages
```

```ts
interface UseGatedImages {
  getImages: (imageIds: number[]) => Promise<BlockGatedImage[]>;
}
```

Read per-viewer gated display data for a list of image ids via the host-mediated `GET_IMAGES_BY_IDS` → `IMAGES_RESULT` bridge — the read side of a cross-user image grid (e.g. ids stored via `useSharedStorage()`). The host applies the requesting viewer's browsing-level clamp server-side and returns each image as `visible` (url, plus a rating UNLESS it is the viewer's own not-yet-rated image) or `hidden` (NO url — above ceiling / flagged / scan-refused / someone else's unrated image). This is the load-bearing cross-user moderation boundary: an unclamped edge URL never crosses to a viewer who can't see the image, and the block must render a placeholder for any `hidden` entry. 🔴 A `hidden` ENTRY IS NARROWED TO `{ imageId, status }` BEFORE IT REACHES HERE, and that is enforced in code rather than asserted in prose: the transport runs `projectInboundPayload` on every `IMAGES_RESULT` before delivery (`src/transport/validate.ts`), so a `previewUrl`, `src`, `imageUrl` or any other key a host attaches to a withheld image is DROPPED, not forwarded. Fields are dropped rather than the reply rejected so a future host-side field addition cannot hang this call — see `projectGatedImage`'s docblock. 🔴 `nsfwLevel` AND `contentRating` ARE OPTIONAL, AND A MISSING ONE IS NOT "G". They are absent exactly when `ratingPending` is present. Treating absent as a safe default is the bug this state exists to stop: an image published seconds earlier came back `hidden` under the old two-state contract and a grid rendered it as *"Hidden — rated mature"*, a maturity claim about an image nothing had rated, which a page reload then contradicted.

```tsx
const { getImages } = useGatedImages();
const images = await getImages([101, 102, 103]);
for (const image of images) {
  if (image.status === 'hidden') renderPlaceholder(image.imageId);
  else if (image.ratingPending) renderStillProcessing(image.url); // NO rating to show
  else renderRated(image.url, image.contentRating);
}
```

<!-- END GENERATED: hooks/viewer-and-navigation -->
</HooksReference>
