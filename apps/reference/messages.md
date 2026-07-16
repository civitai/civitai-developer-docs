---
title: Message bridge reference
description: The full postMessage protocol between a Civitai App and its host — payloads, directions, request/reply pairing, and page-only messages.
sources:
  - npm:@civitai/app-sdk@0.24.0/blocks#messages.d.ts
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

<MessageTable />

::: tip Payloads reference SDK types
Some payload fields are typed as named SDK interfaces (for example
`WorkflowBody`, `BlockViewer`, `AppWorkflow`). Those come from
`@civitai/app-sdk/blocks` — import the package to get the full type definitions
in your editor.
:::
