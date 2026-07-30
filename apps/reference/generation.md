---
title: Generation bridge reference
description: The field-level generation contract — the WorkflowBody union, the useBuzzWorkflow lifecycle (incl. cancel), and the BlockWorkflowSnapshot result — generated from the published SDK type JSDoc.
sources:
  - npm:@civitai/app-sdk@0.28.0/blocks#WorkflowBody
  - npm:@civitai/blocks-react@0.37.0#useBuzzWorkflow
---

# Generation bridge reference

This is the **field-level contract** for spending a viewer's Buzz on a
generation from a block: the `WorkflowBody` your block sends, the
`useBuzzWorkflow()` lifecycle that carries it (estimate → submit → poll →
**cancel**), and the `BlockWorkflowSnapshot` you get back.

Everything below is generated from the **published** `@civitai/app-sdk` and
`@civitai/blocks-react` type definitions — the same JSDoc your editor shows — so
it can't drift from the packages you install. For the narrative version (with
worked img2img / LoRA examples and the page-vs-model rules) start with the
[text-to-image generation guide](../guide/text-to-image); for the ComfyUI recipe
path see [Comfy Cloud](../guide/comfy-cloud).

::: tip Trust model
`useBuzzWorkflow()` is **host-mediated**: the host resolves the viewer from the
block token and runs the estimate/submit/cancel on Civitai's side of the iframe
boundary, re-checking scope + budget every time. Your block never holds an
orchestrator credential.
:::

<BridgeReference />

## See also

- [Generation guide](../guide/text-to-image) — the narrative walkthrough (img2img, LoRAs, page-vs-model).
- [Comfy Cloud (customComfy)](../guide/comfy-cloud) — the recipe-gated ComfyUI path.
- [Hooks reference](./hooks) — every `@civitai/blocks-react` hook.
- [Messages reference](./messages) — the `postMessage` protocol these hooks sit on.
