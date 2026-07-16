---
title: Hooks reference
description: Every @civitai/blocks-react hook — signature and example, generated from the published package.
sources:
  - npm:@civitai/blocks-react@0.29.0/dist/index.d.ts
  - npm:@civitai/blocks-react@0.29.0#README
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

<HooksReference />

## Install

```bash
pnpm add @civitai/blocks-react @civitai/app-sdk
```

See the [Quickstart](../guide/quickstart) for a full scaffold, and the
[message bridge reference](./messages) for the protocol these hooks sit on.
