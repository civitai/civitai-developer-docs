---
title: Hooks reference
description: Every @civitai/blocks-react hook — signature and example, generated from the published package.
sources:
  - npm:@civitai/blocks-react@0.39.0/dist/index.d.ts
  - npm:@civitai/blocks-react@0.39.0#README
---

# React hooks

`@civitai/blocks-react` is the React-first way to build a Civitai App. Each hook
wraps a slice of the [message bridge](./messages) so you never touch
`postMessage` directly — you call a hook, get typed state back, and the host
brokers the privileged work.

The signatures below are generated from the published package's type
definitions; the examples come from its README.

::: tip Trust model
Every hook that reads private data or submits work is **host-mediated**: the host
resolves the viewer from the block token and performs the privileged call on
Civitai's side of the iframe boundary. Your app never holds a credential or calls
a privileged API directly.
:::

<HooksReference>
<!-- BEGIN GENERATED: hooks — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`useBlockContext`**

```ts
useBlockContext(): Pick<BlockSnapshot, 'ready' | 'renderMode' | 'context' | 'token' | 'settings' | 'viewer' | 'theme' | 'blockId' | 'blockInstanceId' | 'appId'>
```

The primary hook. Returns everything the host delivered in `BLOCK_INIT` plus a `ready` gate — fields are sentinel-empty before init, so gate your UI on `ready`.

```tsx
const { ready, context, viewer, theme, settings, blockId, blockInstanceId, appId, token, renderMode } =
  useBlockContext();
```

**`useBlockResize`**

```ts
useBlockResize(ref: RefObject<HTMLElement | null>): void
```

Attach to your root element. Observes its height and posts `RESIZE_IFRAME` so the host sizes the iframe to fit. No-op on the inline transport (host DOM reflows naturally).

```tsx
const rootRef = useRef<HTMLDivElement>(null);
useBlockResize(rootRef);
```

**`useBlockToken`**

```ts
useBlockToken(): BlockToken & {
    refresh: () => Promise<void>;
}
```

Current block-scoped JWT, auto-refreshing ~2 min before expiry. Returns the token fields plus a `refresh()` for the 401-retry path.

```tsx
const { raw, scopes, expiresAt, buzzBudget, refresh } = useBlockToken();
// after a 401: await refresh(); then retry the request once with the new `raw`.
```

**`useHostOrigin`**

```ts
useHostOrigin(): string | undefined
```

The validated host origin to direct-fetch the App Blocks HTTP API against — `undefined` until init. Use it as the base URL when you need to bypass the host bridge, always paired with the bearer token from `useBlockToken()`.

```tsx
const host = useHostOrigin();          // e.g. "https://civitai.com" (undefined until BLOCK_INIT)
const { raw } = useBlockToken();
// Once `host` is set, fetch the API on that validated origin with the block token:
if (host) {
  const res = await fetch(`${host}/api/v1/blocks/me`, {
    headers: { authorization: `Bearer ${raw}` },
  });
}
```

**`useBlockSettings`**

```ts
useBlockSettings(): BlockSettings
```

Shorthand for `useBlockContext().settings`. Read-only from the iframe — settings are *written* on the platform `/apps/installed` page, not via a bridge message.

```tsx
const { publisherSettings, userSettings } = useBlockSettings();
```

**`useBuzzWorkflow`**

```ts
useBuzzWorkflow(): UseBuzzWorkflowReturn
```

The generation flow: `estimate` → `submit` → `poll`, host-mediated. Returns `{ estimate, submit, poll, status, result, error }`.

```tsx
import type { WorkflowBody } from '@civitai/app-sdk/blocks';

const { estimate, submit, poll, status, result } = useBuzzWorkflow();
declare const modelId: number, modelVersionId: number, userPrompt: string;

const body: WorkflowBody = {
  kind: 'textToImage',
  modelId,
  modelVersionId,
  params: { prompt: userPrompt },
};
await estimate(body);            // status 'estimating' → 'confirming' (cost in result.cost.total)
const snap = await submit(body); // status 'submitting' → 'polling'; returns a workflowId
await poll(snap.workflowId);     // you loop this on a backoff until terminal
```

**`useBuzzPurchase`**

```ts
useBuzzPurchase(): {
    openPurchaseModal: (suggestedAmount?: number) => Promise<{
        purchased: boolean;
        newBalance?: number;
    }>;
}
```

Open the Buzz purchase modal — the insufficient-budget recovery path.

```tsx
const { openPurchaseModal } = useBuzzPurchase();
const { purchased, newBalance } = await openPurchaseModal(suggestedAmount);
if (purchased) { /* retry the generation */ }
```

**`useBuzzBalance`**

```ts
useBuzzBalance(): UseBuzzBalance
```

The signed-in viewer's per-pool Buzz balance (`{ blue, green, yellow }` — the domain-clamped pools a block may read; never the platform-internal `red`/`purple`). Host-mediated over `GET_BUZZ_BALANCE` → `BUZZ_BALANCE_RESULT`; same trust model as `useBuzzWorkflow`/`useBuzzPurchase` (the host resolves the viewer from the block token — the block never touches the balance API). Fetches on mount; `refetch` for on-demand refreshes.

```tsx
const { balance, loading, error, refetch } = useBuzzBalance();
// `balance` is null until the first successful fetch. refetch() after a
// generation debits it. An anon viewer / missing scope / host failure → `error`.
if (!loading && balance) console.log(`Yellow: ${balance.yellow}`);
```

**`useViewer`**

```ts
useViewer(): UseViewer
```

The signed-in viewer as an on-demand authoritative self-read (`{ id, username, status, buzzBudget }`) — distinct from `useBlockContext().viewer`, the coarse `BLOCK_INIT`-time snapshot. `status` is `'active' | 'muted'`; `username` (`string | null`) and `buzzBudget` (`number | null`) are present-but-nullable, so handle the null case. Host-mediated over `GET_VIEWER` → `VIEWER_RESULT` (the host resolves the viewer from the block token via `blocks.getMyViewer`); an anonymous / banned viewer comes back as `error`. Fetches on mount; `refetch` for on-demand refreshes.

```tsx
const { viewer, loading, error, refetch } = useViewer();
// `viewer` is null until the first successful fetch. An anon / banned viewer,
// missing scope, or host failure → `error`. `username`/`buzzBudget` may be null.
if (!loading && viewer) console.log(`${viewer.username ?? 'anon'} · budget ${viewer.buzzBudget ?? 0}`);
```

**`useBuzzTransactions`**

```ts
useBuzzTransactions(params?: BlockBuzzTransactionsParams): UseBuzzTransactions
```

The signed-in viewer's Buzz-transaction ledger (a paged, host-projected read of the Buzz dashboard). Returns `{ transactions, cursor, loading, error, refetch }`; `transactions` rows are rehydrated so `date` is a `Date`. Pass the returned `cursor` back as `params.cursor` to page forward. Requires the `buzz:read:self` scope; host-mediated over `GET_BUZZ_TRANSACTIONS`.

```tsx
const { transactions, cursor, loading, error } = useBuzzTransactions({ type: 'Tip', limit: 20 });
if (!loading && transactions) transactions.forEach((t) => console.log(t.type, t.amount, t.date));
```

**`useBuzzAccounts`**

```ts
useBuzzAccounts(): UseBuzzAccounts
```

The viewer's all-pool Buzz balances — the three spendable pools **plus** the creator payout pools (`{ accountType, balance }[]`), a superset of `useBuzzBalance`. Returns `{ accounts, loading, error, refetch }`. Requires `buzz:read:self`; host-mediated over `GET_BUZZ_ACCOUNTS`.

```tsx
const { accounts, loading, error } = useBuzzAccounts();
if (!loading && accounts) accounts.forEach((a) => console.log(a.accountType, a.balance));
```

**`useDailyCompensation`**

```ts
useDailyCompensation(params: BlockDailyCompensationParams): UseDailyCompensation
```

Per-modelVersion generation-compensation for the month containing `params.date` (Buzz totals + cash totals in pennies). Returns `{ resources, hasPublishedResources, loading, error, refetch }`. Requires `buzz:read:self`; host-mediated over `GET_DAILY_COMPENSATION`.

```tsx
const { resources, hasPublishedResources } = useDailyCompensation({ date: '2026-07-01' });
```

**`useWildcardPack`**

```ts
useWildcardPack(modelVersionId: number): UseWildcardPack
```

Import a wildcard pack's parsed prompt lists by model version — the host resolves + fetches + unzips + parses it **in the user's own page session** (every download gate enforced), so the untrusted iframe never sees the bytes. Returns `{ pack, loading, error, refetch }`. On failure `error` is a `WildcardPackError` with a discriminated `code` (`not-found` / `forbidden` / `too-large` / `parse-failed` / `busy` — `busy` is retryable), not free text.

```tsx
const { pack, loading, error, refetch } = useWildcardPack(modelVersionId);
// `error.code === 'busy'` is retryable — call refetch(); the other codes are terminal.
if (error instanceof WildcardPackError && error.code === 'busy') void refetch();
if (!loading && pack) console.log(Object.keys(pack.lists));
```

**`useAppWorkflows`**

```ts
useAppWorkflows(params?: AppWorkflowsParams): UseAppWorkflows
```

The calling app's **own** generator subqueue — the tag-scoped list of generations **this app** produced for the viewer (newest-first), plus a fail-closed `cancel`. The host self-binds the account off the block token and **forces** the per-app tag filter, so a block only ever sees the queue it produced — never the viewer's personal queue or another app's. Returns `{ workflows, cursor, loading, error, refetch, cancel }`; each `AppWorkflow` is `{ workflowId, status, images[], cost, createdAt }`. Pass the returned `cursor` back as `params.cursor` to page forward. Requires `ai:write:budgeted` (same trust boundary as submit); host-mediated over `QUERY_APP_WORKFLOWS` / `CANCEL_APP_WORKFLOW`. `cancel(workflowId)` sends `CANCEL_APP_WORKFLOW`, resolves once the host confirms the terminal state (which is optimistically spliced into `workflows` in place — no refetch round-trip), and rejects with the host's error on failure.

```tsx
const { workflows, cursor, loading, error, refetch, cancel } = useAppWorkflows({ limit: 20 });
if (!loading && !error) {
  workflows.forEach((w) => console.log(w.workflowId, w.status, w.images.length, w.cost));
}
async function onCancel(id: string) {
  try {
    await cancel(id); // optimistically flips the row to `canceled`
  } catch (err) {
    console.error('cancel failed', err);
  }
}
```

**`useAppStorage`**

```ts
useAppStorage(): UseAppStorage
```

Per-(block instance, viewer) KV datastore, host-mediated. 64 KB per value, 50 MB + ~1M rows per app.

```tsx
const storage = useAppStorage();
await storage.set('key', { any: 'json' });   // throws "PAYLOAD_TOO_LARGE" over a limit
const v = await storage.get<MyShape>('key'); // null if unset / anon
await storage.delete('key');                  // idempotent
const { keys } = await storage.list({ prefix: 'note-' });
const quota = await storage.getQuota();       // { usedBytes, rowCount, limitBytes, limitRows }
```

**`useSharedStorage`**

```ts
useSharedStorage(): UseSharedStorage
```

App-scoped, append-only, community-votable SHARED datastore (every viewer sees the same list). Sibling of `useAppStorage`; anonymous viewers get the read path and a hard reject on mutations.

```tsx
const shared = useSharedStorage();
const { key } = await shared.append({ title: 'Add dark mode', body: 'please' });
const { items } = await shared.list({ limit: 20 });   // newest-first
const count = await shared.vote(key);                 // idempotent up-vote
await shared.unvote(key);
await shared.withdraw(key);                            // remove my own entry
```

**`useCheckpointPicker`**

```ts
useCheckpointPicker(): {
    open: (opts: {
        /**
         * Ecosystem key (e.g. 'Flux1', 'SDXL'). Get it from
         * `useBlockContext().context.checkpoint?.baseModel` — but for the
         * picker filter the host will collapse to the ecosystem family, so
         * any baseModel in the family works as a hint.
         */
        baseModelGroup: string;
        /** Currently-selected versionId so the picker can pre-highlight it. */
        currentVersionId?: number;
    }) => Promise<{
        selected?: BlockCheckpointInfo;
    }>;
    persist: (versionId: number | null) => Promise<void>;
}
```

Drive the platform Checkpoint picker + persist a viewer override.

```tsx
const { open, persist } = useCheckpointPicker();
const { selected } = await open({ baseModelGroup: 'SDXL', currentVersionId });
if (selected) await persist(selected.versionId);   // null clears the override
```

**`useResourcePicker`**

```ts
useResourcePicker(): {
    open: (opts: {
        /** Which resource type to pick. v1: `'Checkpoint' | 'LORA'` only — the
         * host rejects any other type (the modal never opens). */
        resourceType: BlockResourcePickerType;
        /**
         * Optional base-model family hint — an ecosystem key (e.g. 'Flux1', 'SDXL')
         * OR a baseModel name (e.g. 'Flux.1 D'); the host collapses it to the
         * ecosystem family. Use the chosen checkpoint's `baseModel` to constrain a
         * LoRA pick to the same family. Omit for an unconstrained pick of the type.
         */
        baseModelGroup?: string;
    }) => Promise<BlockResourceInfo | null>;
}
```

Drive the platform resource picker for page blocks — `'Checkpoint' | 'LORA'`. The viewer searches in host chrome; the block only ever sees the one resource it picked. DISCOVERY ONLY — the returned `versionId` is re-validated + re-priced server-side at estimate/submit.

```tsx
const { open } = useResourcePicker();
const picked = await open({ resourceType: 'LORA', baseModelGroup: 'SDXL' });
if (picked) {
  const versionId = picked.versionId;   // feed into body.additionalResources
  const weight = picked.strength;        // recommended default weight (may be undefined)
}
```

**`useImageUpload`**

```ts
useImageUpload(options: {
    purpose: 'generationSource';
}): {
    open: () => Promise<BlockGenerationSourceImageInfo | null>;
}
```

Host-mediated image upload — the host opens its native upload modal and the iframe never handles the bytes. Resolves with a moderated image (or `null` on dismiss); pass `{ purpose: 'generationSource' }` for an unscanned img2img source or `{ asyncScan: true }` for the early-resolve + `scanStatus()` flow.

```tsx
const { open } = useImageUpload();
const img = await open();               // BlockUploadedImageInfo | null
if (img) {
  await submit({
    kind: 'textToImage',
    modelId,
    modelVersionId,
    sourceImage: { url: img.url, width: 1024, height: 1024 },
    params: { prompt },
  });
}
```

**`useGenerationResources`**

```ts
useGenerationResources(): {
    fetch: (versionIds: number[]) => Promise<BlockResourceInfo[]>;
}
```

Rehydrate a saved set of generation resources by version id — WITHOUT re-opening the picker. Returns the same widened projection `useResourcePicker` yields (recommended weights, trigger words, clipSkip). DISCOVERY ONLY.

```tsx
const { fetch } = useGenerationResources();
const resources = await fetch([691639, 666002]);   // by saved versionIds
const first = resources[0];             // .versionId / .strength / .trainedWords / .clipSkip
```

**`useCivitaiNavigate`**

```ts
useCivitaiNavigate(): {
    navigate: (path: string, target?: 'current' | 'new_tab') => void;
}
```

Request a navigation within civitai.com (host-mediated; fire-and-forget).

```tsx
const { navigate } = useCivitaiNavigate();
navigate('/models/12345', 'new_tab');   // 'new_tab' needs allow-popups* in the manifest sandbox
```

**`useBlockAnalytics`**

```ts
useBlockAnalytics(): {
    track: (eventName: string, properties?: Record<string, unknown>) => void;
}
```

Fire-and-forget event tracking into the host's analytics pipeline.

```tsx
const { track } = useBlockAnalytics();
track('generate_clicked', { modelId });
```

**`useRequestSignIn`**

```ts
useRequestSignIn(): {
    requestSignIn: (payload?: {
        returnUrl?: string;
    }) => void;
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
useRequestConsent(): {
    requestConsent: (payload?: {
        scopes?: string[];
    }) => void;
}
```

Lazy consent: ask the host to open its consent UI when a LOGGED-IN viewer takes an action whose consent-gated scope the block token is missing (e.g. Generate needs `ai:write:budgeted` but the viewer hasn't granted it). Fire-and-forget — on grant the host pushes a new token; observe `useBlockToken().scopes` and retry.

```tsx
const { requestConsent } = useRequestConsent();
requestConsent({ scopes: ['ai:write:budgeted', 'buzz:read:self'] });
```

**`useDomainMaturity`**

```ts
useDomainMaturity(): DomainMaturity
```

Read the surrounding color-domain's maturity ceiling (civitai #2670) so a block can hide/blur mature affordances on a SFW domain. **Fail-closed SFW** until `BLOCK_INIT` lands or against a host that predates the field.

```tsx
const { isSfw, isLevelAllowed } = useDomainMaturity();
const showRSlider = isLevelAllowed(BrowsingLevel.R);   // false on a SFW domain
```

**`useTip`**

```ts
useTip(): UseTip
```

Send a Buzz TIP from the viewer through the block-token-gated `POST /api/v1/blocks/tip` REST endpoint (scope `social:tip:self`). Direct-fetch (bypasses the postMessage bridge) against the VALIDATED host origin (`useHostOrigin()`) with the block bearer token (`useBlockToken().raw`) — the same security-reviewed pattern as {@link useGenerationResources}. The SENDER is always the token subject (server self-binds it); the block never supplies a `fromUserId`. IDEMPOTENCY: pass a stable `options.idempotencyKey` to make a retry-after- timeout safe (the server replays the first terminal result). Omitting it mints a fresh key per call, so each call is a distinct logical tip.

```tsx
const { tip, loading, error } = useTip();
const key = React.useId(); // stable across this component's retries
await tip({ toUserId: 123, amount: 50, entityType: 'Image', entityId: 99 }, { idempotencyKey: key });
```

**`useTipAllowance`**

```ts
useTipAllowance(): UseTipAllowance
```

Read the viewer's REAL remaining daily tip allowance `{ cap, spent, remaining }` through the block-token-gated `GET /api/v1/blocks/tip-allowance` REST endpoint (scope `social:tip:self` — the SAME scope the app already holds to tip, so no manifest change). Direct-fetch against the validated host origin with the block bearer token, the same pattern as {@link useGenerationResources}. Lets a block show a genuinely-tracked remaining allowance and disable the tip button at the true ceiling — instead of a dead client-side full-cap guess (`localStorage` is inert in the opaque-origin sandbox). Fetches once on mount and exposes `refetch` (call it after a successful `useTip().tip(...)`).

```tsx
const { allowance, refetch } = useTipAllowance();
// allowance?.remaining — Buzz the viewer may still tip today
```

**`usePublishGenerationOutputs`**

```ts
usePublishGenerationOutputs(): UsePublishGenerationOutputs
```

Publish selected outputs of one of the calling app's OWN generations into bare, real-scanned public `Image` rows via the host-mediated `PUBLISH_GENERATION_OUTPUTS` → `PUBLISH_RESULT` bridge. Token-bound + fail-closed: the host self-binds the account off the block token, re-derives (viewer, app, workflowId) ownership before reading the workflow, and re-uploads + FULL-scans each selected output server-side (no url ever crosses from the iframe). The result is a set of bare (post-less) scanned `Image` row ids — no Post, no gallery attach, no rewards/notifications. Host-chrome shows a consent confirm before anything is published.

```tsx
const { publish } = usePublishGenerationOutputs();
const imageIds = await publish({ workflowId: w.workflowId, imageIndexes: [0, 2] });
// …store imageIds via useSharedStorage() so the grid can read them back gated.
```

**`useGatedImages`**

```ts
useGatedImages(): UseGatedImages
```

Read per-viewer gated display data for a list of image ids via the host-mediated `GET_IMAGES_BY_IDS` → `IMAGES_RESULT` bridge — the read side of a cross-user image grid (e.g. ids stored via `useSharedStorage()`). The host applies the requesting viewer's browsing-level clamp server-side and returns each image as `visible` (moderated projection incl. url) or `hidden` (NO url — above ceiling / unscanned / flagged). This is the load-bearing cross-user moderation boundary: an unclamped edge URL never crosses to a viewer who can't see the image, and the block must render a placeholder for any `hidden` entry.

```tsx
const { getImages } = useGatedImages();
const images = await getImages([101, 102, 103]);
// …render `visible` cells with their url; `hidden` cells as a blurred placeholder.
```

**`useSaveImage`**

```ts
useSaveImage(): UseSaveImage
```

Download an image via the host-mediated `SAVE_IMAGE` → `SAVE_IMAGE_RESULT` bridge. See {@link SaveImageInput} for the url-vs-id security posture.

```tsx
const { saveImage } = useSaveImage();
// block's own generation output (origin-allowlisted host-side):
await saveImage({ url: output.url, filename: 'my-render.png' });
// a cross-user grid cell (routed through the gated per-viewer read):
await saveImage({ imageId: cell.imageId });
```

**`useDirectLoad`**

```ts
useDirectLoad(options?: UseDirectLoadOptions): boolean
```

Detect a DIRECT (unembedded) top-level load of a block and, after a short grace period, report it so the SDK can show an "Open on Civitai" fallback instead of hanging on the perpetual loading state. Returns `true` ONLY when BOTH hold: 1. The block is TOP-LEVEL (`window.self === window.top` — not in the host iframe), AND 2. No `BLOCK_INIT` has landed (`ready` is still `false`) within `timeoutMs`. This is precise by construction: - An EMBEDDED block (framed) is never top-level → always `false`, even before `ready`. The embedded happy path is untouched. - The dev harness / `createMockHost` runs the block top-level BUT posts `BLOCK_INIT` immediately (a `setTimeout(0)` macrotask), so `ready` flips long before `timeoutMs` and the timer is cleared → always `false`. The dev flow is untouched. - A real direct load (nobody sends `BLOCK_INIT`) stays top-level + not-ready past `timeoutMs` → `true`. Once `ready` flips it stays authoritative: this can never return `true` while `ready` is `true`, so a late init can't leave a stuck fallback.

<!-- END GENERATED: hooks -->
</HooksReference>

## Install

```bash
pnpm add @civitai/blocks-react @civitai/app-sdk
```

See the [Quickstart](../guide/quickstart) for a full scaffold, and the
[message bridge reference](./messages) for the protocol these hooks sit on.
