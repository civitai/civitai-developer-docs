---
title: API Reference
---

# API Reference

Every consumer-facing operation, request schema, and response shape in the Civitai Orchestration API. Pages here are generated from the OpenAPI specification ([`v2-consumers.json`](https://orchestration.civitai.com/openapi/v2-consumers.json)) and stay in sync with the running API on every build.

## Conventions

- **Base URL**: `https://orchestration.civitai.com`
- **Auth**: `Authorization: Bearer <token>` on every request.
- **Content type**: `application/json` for bodies; blob upload endpoints accept `multipart/form-data` or presigned PUT.
- **IDs**: workflow IDs are ULIDs prefixed `wf_`; blob IDs are prefixed `blob_`.
- **Polymorphism**: workflow step bodies use a `$type` discriminator; request/response schemas list all valid subtypes under `oneOf`.

## Entry points

Most consumer integrations only touch three operations:

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — create a workflow with one or more steps
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — poll a single workflow
- [`QueryWorkflows`](/orchestration/reference/operations/QueryWorkflows) — list / filter workflows

The left sidebar is grouped by OpenAPI tag — **Workflows**, **WorkflowSteps**, **Recipes**, **Blobs**, **Resources**. Recipes have per-endpoint variants (one per job type) if you prefer the typed surface over the polymorphic `SubmitWorkflow` body.

## Rate limits & quotas

::: info Stub
Fill in once the per-tier rate limit scheme is finalized.
:::
