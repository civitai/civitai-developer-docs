---
title: CLI reference
description: The @civitai/blocks-cli commands and flags, generated from the published package.
sources:
  - npm:@civitai/blocks-cli@0.1.2
---

# CLI

`@civitai/blocks-cli` (binary: `civitai`) scaffolds and locally validates a
Civitai App. Run it with `npx`:

```bash
npx @civitai/blocks-cli@latest init my-app
```

The commands and flags below are generated from the published CLI's command
registry.

<CliReference />

## Publishing is not a CLI command

There is deliberately **no `civitai submit` / `civitai publish`** that ships your
app. `civitai deploy` is a local preflight (it validates your manifests and
prints a notice) — it does **not** publish. The `bundle` / `upload` / `publish`
commands above are reserved stubs and print "coming soon".

The real publish path is **submit → review → deploy** on civitai.com:

1. `civitai init` scaffolds the project.
2. `civitai dev` (or `pnpm dev:harness`) iterates locally.
3. `vite build` produces the static bundle.
4. You upload the built bundle as a **ZIP** to civitai.com, a moderator reviews
   it, and the platform provisions hosting, the subdomain, and the OAuth client.

See the [Quickstart](../guide/quickstart) for the end-to-end flow.
