---
title: Custom events (analytics)
description: Send custom analytics events from an app — declare each event and its properties under analytics.events in the manifest, send them with useBlockAnalytics().track() or app.host.track(), what the platform records and drops, the per-mount limits, and where owners see the aggregates.
sources:
  - npm:@civitai/blocks-react@0.68.0#useBlockAnalytics
  - civitai-app-starters:packages/civitai-blocks-react/src/hooks/useBlockAnalytics.ts
  - civitai-app-starters:packages/civitai-sdk/README.md#custom-events
  - civitai-app-starters:packages/civitai-sdk/BREAKING.md#TRACK_EVENT
  - civitai:public/schemas/app-block/v1.json#analytics
  - civitai:src/shared/constants/block-analytics.constants.ts
  - civitai:src/server/services/blocks/block-event-ingest.service.ts
  - civitai:src/components/AppBlocks/blockEventBeacon.ts
  - civitai:src/components/AppBlocks/AppAnalyticsPanel.tsx
  - civitai:src/components/Apps/OnsiteReviewModal.tsx#ManifestAnalytics
---

# Custom events (analytics)

Your app can send **custom events** about how viewers use it, such as a button
pressed or a mode picked, and you see the totals in your app's analytics.

🔴 **Only what your manifest declares is recorded.** Every event, and every
property it carries, must be declared under `analytics.events` in
`block.manifest.json`. Events are checked against your app's **approved**
manifest, so an event you send but never declared is not recorded by name.

## 1. Declare the events

```json
{
  "analytics": {
    "events": {
      "generate_clicked": {
        "description": "Viewer pressed Generate",
        "properties": {
          "mode": { "type": "enum", "values": ["txt2img", "img2img"] },
          "batch": { "type": "number" },
          "advanced": { "type": "boolean" }
        }
      }
    }
  }
}
```

- **Names.** Event and property names are lowercase snake_case: a letter, then
  up to 63 of `a-z`, `0-9` or `_`. `generate_clicked` and `model_id` are valid;
  `generateClicked` and `modelId` are not.
- **Property types are `enum`, `number` and `boolean`.** There is no free-text
  string type. An `enum` declares between 1 and 50 distinct, non-empty string
  `values` of at most 64 characters, and a string is recorded only when it is
  one of them. That keeps prompts, emails and usernames out of your analytics.
  A `number` is not range-limited, so do not use one to carry an identifier.
- **Limits.** At most 50 events per app and 10 properties per event. The
  optional `description` is at most 200 characters.
- **Validation is all or nothing.** A declaration with any error is rejected
  when you submit. Nothing in it is recorded.
- **The declaration is reviewed.** The reviewer sees your declared events, their
  properties and enum values on the review screen. Adding or changing an event
  needs a new version and another review. Until that version is approved, events
  are checked against the manifest that is approved now.

The [manifest reference](../reference/manifest) lists the field with the full
schema.

## 2. Send them

With `@civitai/blocks-react`, use
[`useBlockAnalytics()`](../reference/hooks#hook-useBlockAnalytics):

```tsx
import { useBlockAnalytics } from '@civitai/blocks-react';

export function GenerateButton({ onGenerate }: { onGenerate: () => void }) {
  const { track } = useBlockAnalytics();
  return (
    <button
      onClick={() => {
        track('generate_clicked', { mode: 'txt2img', batch: 4, advanced: false });
        onGenerate();
      }}
    >
      Generate
    </button>
  );
}
```

With [`@civitai/sdk`](./sdk), use `app.host.track(eventName, properties)`. It
sends the same message (`TRACK_EVENT`) and is recorded the same way.

```ts
const app = await initialize();
app.host.track('generate_clicked', { mode: 'txt2img', batch: 4 });
```

`app.host.track` needs `@civitai/sdk` 0.11.0 or later; 0.10.x has no `track`.

Both calls are **fire-and-forget**. They return nothing, there is no reply, and
nothing tells your app whether an event was recorded, so never wait for one or
branch on it.

## What is recorded

| You send | What happens |
|---|---|
| A declared event with declared properties of the declared type | Recorded |
| An event your approved manifest does not declare | Counted as a drop. Its name and properties are not stored |
| A property the event does not declare | Dropped. The rest of the event is recorded |
| A value of the wrong type, or a string that is not one of the enum's values | Dropped. The rest of the event is recorded |

- **Approved apps on civitai.com only.** Nothing is recorded from `dev:live`,
  or for an app with no approved version.
- **Signed-out viewers are counted, never identified.** Their events count
  toward an event's totals, but unique viewers are counted for signed-in viewers
  only.
- **Your team is marked.** An event sent while the app's owner or an accepted
  collaborator was signed in is recorded as team activity. The analytics hide it
  unless you turn it on.
- **Aggregates only.** The analytics show aggregates only; no page shows
  individual events, owners included.

## Limits

- Each mount of your app may send **10 events per second** and **500 in
  total**.
- The host sends events in batches, in request bodies of at most **32 KiB**. An
  event too large to fit in one body is dropped.
- An event over a limit is dropped in the browser and is **not counted
  anywhere**, and a batch that fails to send is not retried. The numbers you see
  are therefore minimums.
- The platform also rate-limits events per network address and app, so viewers
  who share one address (an office or carrier network) share that budget.
  Events dropped by that limit are not shown either, so the numbers stay
  minimums.

## Where you see them

On civitai.com, open the **Apps Dashboard** (`/apps/revenue`), choose the
**Analytics** tab and pick the app. The **Custom events** card shows, per
declared event:

- **Events**: how many were recorded in the range.
- **Signed-in viewers**: each signed-in person counted once.
- **Signed-out events**: events from viewers who were not signed in.

Select an event to see it over time and the breakdown of each declared property.
The **Include team activity** switch is off by default; turn it on to include
events sent while you or an accepted collaborator was signed in. When events
arrive with names your approved manifest does not declare, the card says how
many were dropped.

## Check your events locally

`dev:live` records nothing, but it can tell you what production would drop. From
`@civitai/blocks-react` 0.68.0, `createLiveHost` takes your manifest: pass your
imported `block.manifest.json` as `createLiveHost({ blockToken, manifest })`.
The console then warns once for each undeclared event, undeclared property, or
value of the wrong type. A valid event logs nothing.

## Next

- [Manifest reference](../reference/manifest) — the `analytics` field.
- [Hooks reference](../reference/hooks#hook-useBlockAnalytics) — `useBlockAnalytics`.
- [Review, approval and deploy](./review-and-deploy) — getting a new
  declaration approved.
