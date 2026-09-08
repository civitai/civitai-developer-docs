---
title: Agent setup
description: One line that sets your coding agent up to build Civitai Apps.
---

# Agent setup

Paste this into your coding agent — Claude Code, Cursor, Codex, opencode,
Copilot, Windsurf, Zed, whatever you use:

```text
Fetch and execute the appropriate instructions to set me up for Civitai from https://developer.civitai.com/agent-setup/prompt.md
```

The agent fetches the instructions, installs the
[Civitai CLI](https://github.com/civitai/cli), runs `civitai agent-setup`, and
reports what it did. It stops before authentication — the last thing it tells
you is to run `civitai login` yourself.

## What it actually does

- Writes an `AGENTS.md` into your project describing how to build a Civitai App
  (`CLAUDE.md` is added as a one-line shim only when you don't already have one).
- Registers the two Civitai MCP servers in *your* agent's own config file — the
  path and the key name differ per agent, which is exactly why a command does it
  rather than you.
- Verifies the result and prints it.

## Read it first

The instructions are a plain markdown file, served verbatim:

[https://developer.civitai.com/agent-setup/prompt.md](https://developer.civitai.com/agent-setup/prompt.md)

It is unsigned, and there is no signature to check it against. Read it before
you paste it into an agent — that advice applies to every "run this prompt" link
on the internet, including this one.

## If you'd rather do it by hand

```bash
npm install -g @civitai/cli   # or: brew install civitai/tap/civitai
civitai agent-setup --track app
civitai agent-setup --check --json
civitai login
```

Then restart your agent so the MCP servers load.

Building an app is documented in the [Apps guide](/apps/guide/); the manifest,
scopes, hooks and CLI are in the [Apps reference](/apps/reference/).
