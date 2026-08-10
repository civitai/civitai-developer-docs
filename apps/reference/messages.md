---
title: Message bridge reference
description: The full postMessage protocol between a Civitai App and its host — payloads, directions, request/reply pairing, and page-only messages.
sources:
  - npm:@civitai/app-sdk@0.31.0/blocks#messages.d.ts
  - civitai:src/components/AppBlocks/hostHandlerParity.ts#INVENTORY
---

# Message bridge

A block and its host talk over `window.postMessage`. Every message is a
`{ type, payload }` object discriminated by `type`. The tables below are
generated from the published `@civitai/app-sdk` message unions (for payload
shapes) joined with the `civitai` host **parity inventory** (for direction,
request/reply pairing, and page-only flags).

Most builders never send these by hand — the [React hooks](./hooks) wrap them.
This page is the contract for advanced use and non-React SDK consumers.

## Conventions

- **block → host** vs **host → block** — the direction of the message.
- **request → reply** — a request-style message that **awaits** a specific reply
  type (shown). An unhandled request-style message hangs the block until its SDK
  timeout, so the host always registers a handler.
- **fire-and-forget** — a block → host message with no reply; ignoring it is a
  silent no-op, never a hang.
- **page-only** — handled only by the full-page host (a page app at
  `/apps/run/<slug>`), not by the model-slot host today. Slot apps are deferred
  during the closed beta, so build page apps and you get the full surface.

<MessageTable>
<!-- BEGIN GENERATED: messages — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**Lifecycle**

**`BLOCK_ERROR`** — block → host · fire-and-forget

payload:

```ts
{
    message: string;
    fatal: boolean;
}
```

**`BLOCK_INIT`** — host → block

payload:

```ts
BlockInitPayload
```

**`BLOCK_READY`** — block → host · fire-and-forget

payload:

```ts
{
    height: number;
}
```

**`NAVIGATE`** — block → host · fire-and-forget · page-only

payload:

```ts
{
    path: string;
    target: 'current' | 'new_tab';
}
```

Model slot: model slot is an embedded panel; host-navigation is out of remit (no NAVIGATE bridge)

**`RESIZE_IFRAME`** — block → host · fire-and-forget

payload:

```ts
{
    height: number;
}
```

**`RESUME`** — host → block

payload: (none)

**`SUSPEND`** — host → block

payload: (none)

**`TRACK_EVENT`** — block → host · fire-and-forget

payload:

```ts
{
    eventName: string;
    properties?: Record<string, unknown>;
}
```

**Auth & token**

**`REQUEST_CONSENT`** — block → host · fire-and-forget

payload (optional):

```ts
{
    scopes?: string[];
}
```

**`REQUEST_SIGN_IN`** — block → host · fire-and-forget

payload (optional):

```ts
{
    returnUrl?: string;
}
```

**`REQUEST_TOKEN`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    blockInstanceId: string;
}
```

reply `TOKEN_REFRESH_RESPONSE`:

```ts
{
    requestId?: string;
    token: WrappedToken;
}
```

or a TOKEN_REFRESH push when no requestId was sent

**`TOKEN_REFRESH`** — host → block

payload:

```ts
{
    token: WrappedToken;
}
```

**Generation workflows**

**`CANCEL_WORKFLOW`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    workflowId: string;
}
```

reply `WORKFLOW_CANCELED`:

```ts
{
    requestId: string;
    snapshot: BlockWorkflowSnapshot;
}
```

**`ESTIMATE_WORKFLOW`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    body: WorkflowBody;
}
```

reply `ESTIMATE_RESULT`:

```ts
{
    requestId: string;
    snapshot: BlockWorkflowSnapshot;
}
```

**`POLL_WORKFLOW`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    workflowId: string;
    waitSeconds?: number;
}
```

reply `WORKFLOW_STATUS`:

```ts
{
    requestId: string;
    snapshot: BlockWorkflowSnapshot;
}
```

**`SUBMIT_WORKFLOW`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    body: WorkflowBody;
    idempotencyKey?: string;
}
```

reply `WORKFLOW_SUBMITTED`:

```ts
{
    requestId: string;
    snapshot: BlockWorkflowSnapshot;
}
```

**App subqueue**

**`CANCEL_APP_WORKFLOW`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
    workflowId: string;
}
```

reply `CANCEL_APP_WORKFLOW_RESULT`:

```ts
{
    requestId: string;
    result?: {
        workflow: AppWorkflow;
    };
    error?: string;
}
```

Model slot: app subqueue is a page-only affordance today; slot-apps deferred

**`QUERY_APP_WORKFLOWS`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
    params?: AppWorkflowsParams;
}
```

reply `APP_WORKFLOWS_RESULT`:

```ts
{
    requestId: string;
    result?: {
        workflows: AppWorkflow[];
        cursor: string | null;
    };
    error?: string;
}
```

Model slot: app subqueue is a page-only affordance today; slot-apps deferred

**Buzz**

**`GET_BUZZ_ACCOUNTS`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
}
```

reply `BUZZ_ACCOUNTS_RESULT`:

```ts
{
    requestId: string;
    result?: {
        accounts: BlockBuzzAccount[];
    };
    error?: string;
}
```

Model slot: buzz self-read dashboard is a page-only affordance; slot-apps deferred

**`GET_BUZZ_BALANCE`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
}
```

reply `BUZZ_BALANCE_RESULT`:

```ts
{
    requestId: string;
    balance?: {
        blue: number;
        green: number;
        yellow: number;
    };
    error?: string;
}
```

**`GET_BUZZ_TRANSACTIONS`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
    params?: BlockBuzzTransactionsParams;
}
```

reply `BUZZ_TRANSACTIONS_RESULT`:

```ts
{
    requestId: string;
    result?: {
        cursor?: string;
        transactions: BlockBuzzTransaction[];
    };
    error?: string;
}
```

Model slot: buzz self-read dashboard is a page-only affordance; slot-apps deferred

**`GET_DAILY_COMPENSATION`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
    params?: BlockDailyCompensationParams;
}
```

reply `DAILY_COMPENSATION_RESULT`:

```ts
{
    requestId: string;
    result?: {
        resources: BlockDailyCompensationResource[];
        hasPublishedResources: boolean;
    };
    error?: string;
}
```

Model slot: buzz self-read dashboard is a page-only affordance; slot-apps deferred

**`OPEN_BUZZ_PURCHASE`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    suggestedAmount?: number;
}
```

reply `BUZZ_PURCHASE_RESULT`:

```ts
{
    requestId: string;
    purchased: boolean;
    newBalance?: number;
}
```

**Viewer**

**`GET_VIEWER`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
}
```

reply `VIEWER_RESULT`:

```ts
{
    requestId: string;
    viewer?: BlockViewer;
    error?: string;
}
```

Model slot: viewer self-read is a page-only affordance; slot-apps deferred

**Pickers & upload**

**`IMAGE_SCAN_RESOLVED`** — host → block

payload:

```ts
{
    requestId: string;
    imageId: number;
    result: BlockImageScanResult;
}
```

**`OPEN_CHECKPOINT_PICKER`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    baseModelGroup: string;
    /** Currently-selected versionId so the picker can pre-highlight it. */
    currentVersionId?: number;
}
```

reply `CHECKPOINT_PICKER_RESULT`:

```ts
{
    requestId: string;
    selected?: BlockCheckpointInfo;
}
```

**`OPEN_IMAGE_UPLOAD`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
    purpose?: BlockUploadPurpose;
    asyncScan?: boolean;
}
```

reply `IMAGE_UPLOAD_RESULT`:

```ts
{
    requestId: string;
    selected?: BlockUploadedImageInfo | BlockGenerationSourceImageInfo | BlockPendingImageInfo;
}
```

Model slot: host-mediated image upload is a page-only affordance today; the model slot has no such surface

**`OPEN_RESOURCE_PICKER`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
    resourceType: BlockResourcePickerType;
    /** Optional base-model family hint (ecosystem key or baseModel name). */
    baseModelGroup?: string;
}
```

reply `RESOURCE_PICKER_RESULT`:

```ts
{
    requestId: string;
    selected?: BlockResourceInfo;
}
```

Model slot: model slot uses the narrower OPEN_CHECKPOINT_PICKER; the wider resource picker is a page-only affordance

**`SET_USER_CHECKPOINT`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    versionId: number | null;
}
```

reply `USER_CHECKPOINT_SET`:

```ts
{
    requestId: string;
    ok: boolean;
    error?: string;
}
```

**Per-app storage**

**`APP_STORAGE_DELETE`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    key: string;
}
```

reply `APP_STORAGE_DELETE_RESULT`:

```ts
{
    requestId: string;
    ok: boolean;
    deleted: boolean;
    error?: string;
}
```

**`APP_STORAGE_GET`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    key: string;
}
```

reply `APP_STORAGE_GET_RESULT`:

```ts
{
    requestId: string;
    value: unknown;
    error?: string;
}
```

**`APP_STORAGE_LIST`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    prefix?: string;
    limit?: number;
    cursor?: string;
}
```

reply `APP_STORAGE_LIST_RESULT`:

```ts
{
    requestId: string;
    keys: Array<{
        key: string;
        updatedAt: string;
    }>;
    nextCursor?: string;
    error?: string;
}
```

**`APP_STORAGE_QUOTA`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
}
```

reply `APP_STORAGE_QUOTA_RESULT`:

```ts
{
    requestId: string;
    usedBytes: number;
    rowCount: number;
    limitBytes: number;
    limitRows: number;
    error?: string;
}
```

**`APP_STORAGE_SET`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    key: string;
    value: unknown;
}
```

reply `APP_STORAGE_SET_RESULT`:

```ts
{
    requestId: string;
    ok: boolean;
    error?: string;
    sizeBytes?: number;
}
```

**Shared storage**

**`SHARED_APPEND`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    value: SharedStorageValue;
}
```

reply `SHARED_APPEND_RESULT`:

```ts
{
    requestId: string;
    key: string;
    error?: string;
}
```

**`SHARED_GET`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    key: string;
}
```

reply `SHARED_GET_RESULT`:

```ts
{
    requestId: string;
    item: SharedStorageItemWire | null;
    error?: string;
}
```

**`SHARED_GET_COUNT`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    key: string;
}
```

reply `SHARED_GET_COUNT_RESULT`:

```ts
{
    requestId: string;
    count: number;
    error?: string;
}
```

**`SHARED_GET_COUNTS`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    keys: string[];
}
```

reply `SHARED_GET_COUNTS_RESULT`:

```ts
{
    requestId: string;
    counts: Record<string, number>;
    error?: string;
}
```

**`SHARED_LIST`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    prefix?: string;
    limit?: number;
    cursor?: string;
}
```

reply `SHARED_LIST_RESULT`:

```ts
{
    requestId: string;
    items: SharedStorageItemWire[];
    nextCursor?: string;
    error?: string;
}
```

**`SHARED_REPORT`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    key: string;
    reason?: string;
}
```

reply `SHARED_REPORT_RESULT`:

```ts
{
    requestId: string;
    ok: boolean;
    error?: string;
}
```

**`SHARED_UNVOTE`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    key: string;
}
```

reply `SHARED_UNVOTE_RESULT`:

```ts
{
    requestId: string;
    count: number;
    error?: string;
}
```

**`SHARED_UPDATE`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    key: string;
    value: SharedStorageValue;
}
```

reply `SHARED_UPDATE_RESULT`:

```ts
{
    requestId: string;
    ok: boolean;
    error?: string;
}
```

**`SHARED_VOTE`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    key: string;
}
```

reply `SHARED_VOTE_RESULT`:

```ts
{
    requestId: string;
    count: number;
    error?: string;
}
```

**`SHARED_WITHDRAW`** — block → host · request → reply

payload:

```ts
{
    requestId: string;
    key: string;
}
```

reply `SHARED_WITHDRAW_RESULT`:

```ts
{
    requestId: string;
    ok: boolean;
    deleted: boolean;
    error?: string;
}
```

**Wildcard packs**

**`GET_WILDCARD_PACK`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
    modelVersionId: number;
}
```

reply `WILDCARD_PACK_RESULT`:

```ts
{
    requestId: string;
    pack?: BlockWildcardPack;
    error?: BlockWildcardPackErrorCode;
}
```

Model slot: model slot has no wildcard-pack import surface; the resolve+parse bridge is a page-only affordance

**Other**

**`BLOCK_HELLO`** — block → host · fire-and-forget

payload: (none)

**`GET_IMAGES_BY_IDS`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
    imageIds: number[];
}
```

reply `IMAGES_RESULT`:

```ts
{
    requestId: string;
    result?: {
        images: BlockGatedImage[];
    };
    error?: string;
}
```

Model slot: shared-grid gated read is a page-only affordance today; the model slot has no such surface

**`PUBLISH_GENERATION_OUTPUTS`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
    workflowId: string;
    imageIndexes?: number[];
    title?: string;
}
```

reply `PUBLISH_RESULT`:

```ts
{
    requestId: string;
    result?: {
        imageIds: number[];
    };
    error?: string;
}
```

Model slot: shared-grid publish is a page-only affordance today; the model slot has no such surface

**`SAVE_IMAGE`** — block → host · request → reply · page-only

payload:

```ts
{
    requestId: string;
    /** Own-output URL — origin-allowlisted host-side. Mutually exclusive with `imageId`. */
    url?: string;
    /** Cross-user image id — routed through the gated per-viewer read. Mutually exclusive with `url`. */
    imageId?: number;
    /** Optional download filename (host-sanitized). */
    filename?: string;
}
```

reply `SAVE_IMAGE_RESULT`:

```ts
{
    requestId: string;
    ok: boolean;
    error?: string;
}
```

Model slot: download bridge is a page-only affordance today; the paid-output apps are page apps, the model slot has no such surface

<!-- END GENERATED: messages -->
</MessageTable>

::: tip Payloads reference SDK types
Some payload fields are typed as named SDK interfaces (for example
`WorkflowBody`, `BlockViewer`, `AppWorkflow`). Those come from
`@civitai/app-sdk/blocks` — import the package to get the full type definitions
in your editor.
:::
