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

features:
  - title: Ship a ZIP, not infrastructure
    details: You build a static SPA (Vite + React). Submit a ZIP; a moderator reviews it; the platform builds, deploys, and serves it at your own subdomain. No Docker, DNS, or OAuth-client setup.
  - title: A trust frame around your iframe
    details: Your app runs in a sandboxed iframe. The host hands it a short-lived, scoped token plus the page context over postMessage, and mediates anything privileged.
  - title: Generation and Buzz, host-mediated
    details: Estimate, submit, and poll orchestrator workflows; read the viewer and their Buzz balance — the host brokers every privileged call on the platform side.
  - title: React SDK + component pack
    details: "@civitai/blocks-react ships useBlockContext, useBuzzWorkflow, useAppStorage, and a themed component pack; @civitai/app-sdk carries the framework-agnostic contract."
---
