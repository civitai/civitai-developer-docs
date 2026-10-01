---
layout: home

hero:
  name: "Civitai Apps"
  text: "Build inside Civitai."
  tagline: Ship a small web app that renders inside civitai.com — authenticated, Buzz-aware, and hosted for you. Currently in closed beta.
  actions:
    - theme: brand
      text: Introduction
      link: /apps/guide/
    - theme: alt
      text: Quickstart
      link: /apps/guide/quickstart
    - theme: alt
      text: Concepts
      link: /apps/guide/concepts
    - theme: alt
      text: Examples
      link: /apps/examples
    - theme: alt
      text: Reference
      link: /apps/reference/

features:
  - title: Ship a ZIP, not infrastructure
    details: You build a static SPA (Vite + React). Submit a ZIP; a moderator reviews it; the platform builds, deploys, and serves it at your own subdomain. No Docker, DNS, or OAuth-client setup.
  - title: A trust frame around your iframe
    details: Your app runs in a sandboxed iframe. The host hands it a short-lived, scoped token plus the page context over postMessage, and mediates anything privileged.
  - title: Generation and Buzz, host-mediated
    details: Estimate, submit, and poll orchestrator workflows; read the viewer and their Buzz balance — over the host bridge, or by calling /api/v1 with the token the host hands you.
  - title: React SDK + component pack
    details: "@civitai/blocks-react ships useBlockContext, useBuzzWorkflow, useAppStorage, and a themed component pack; @civitai/app-sdk carries the framework-agnostic contract."
---

## Where to start

- **[Introduction](./guide/)** — what an App is, what the host does for you, and
  what you are responsible for.
- **[Quickstart](./guide/quickstart)** — scaffold an app, run it locally against
  a mock host, and submit it.
- **[Concepts](./guide/concepts)** — the sandboxed iframe, scopes, the
  short-lived token the host hands you, and page context.
- **[Examples](./examples)** — complete apps you can read end to end.
- **[Reference](./reference/)** — manifest fields, scopes, hooks, the message
  bridge, and the CLI.

## Building with an AI agent

Run `civitai agent-setup --track app`. It writes an `AGENTS.md` into your
project that points your agent at the pages above, and registers the Civitai MCP
servers in that agent's own config.

Every page on this site is also served as **plain markdown** — append `.md` to
any URL (for example
[`/apps/reference/hooks.md`](/apps/reference/hooks.md)) and you get the rendered
page as text, with the generated tables expanded. [`/llms.txt`](/llms.txt)
indexes the whole site the same way.
