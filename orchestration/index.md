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
    details: Connect Claude Desktop, claude.ai, or any MCP-aware client to the same orchestrator. 20 tools, 3 prompts, and a blob resource — over HTTP at /mcp.
---
