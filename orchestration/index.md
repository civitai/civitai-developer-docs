---
layout: home

hero:
  name: "Civitai Orchestration"
  text: "Submit AI workflows. Get results."
  tagline: Video, image, audio, text — one API, many providers. Build against the same orchestrator that powers Civitai.
  actions:
    - theme: brand
      text: Get started
      link: /orchestration/guide/getting-started
    - theme: alt
      text: API reference
      link: /orchestration/reference/
    - theme: alt
      text: Recipes
      link: /orchestration/recipes/
    - theme: alt
      text: MCP server
      link: /orchestration/mcp/

features:
  - title: Workflows, not endpoints
    details: Describe the work you want done — the orchestrator picks a provider, routes the job, and streams results back. You don't manage capacity.
  - title: Multi-provider by default
    details: FAL, Google, Bytedance, Civitai workers — the orchestrator races providers and selects the best fit for each job.
  - title: Typed recipe catalog
    details: One recipe per job type (video-gen, image-gen, upscaling, transcription, TTS…) with validated inputs and predictable outputs.
  - title: Sync or async
    details: Poll, subscribe, or wait inline with the `wait=` parameter. Webhooks supported for production integrations.
  - title: MCP-native
    details: Connect Claude Desktop, claude.ai, or any MCP-aware client to the same orchestrator. Find a service, get its exact input schema and run it, over HTTP at /mcp/v2.
---

## Where to start

- **[Get started](./guide/getting-started)** — authenticate and submit your
  first workflow.
- **[Guide](./guide/)** — workflows, submitting work, results and webhooks,
  errors and retries.
- **[API reference](./reference/)** — every consumer-facing operation, generated
  from the OpenAPI specification.
- **[Recipes](./recipes/)** — one page per job type, with validated inputs and
  predictable outputs.
- **[MCP server](./mcp/)** — connect Claude Desktop, claude.ai, or any MCP-aware
  client to the same orchestrator.

Guide and recipe pages are also served as **plain markdown** — append `.md` to
the URL — and [`/llms.txt`](/llms.txt) indexes them for agents. The generated
per-operation reference pages under `/orchestration/reference/operations/` are
the exception: they are HTML only.
