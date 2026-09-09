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
- Registers two remote Civitai MCP servers in *your* agent's own config file —
  `https://mcp.civitai.com/mcp` (the platform) and
  `https://orchestration.civitai.com/mcp` (generation orchestration). The config
  path and the key name differ per agent, which is exactly why a command does it
  rather than you. This is the one change that persists outside your project
  directory: your agent will connect to both hosts on every start.
- Verifies the result and prints it.

## Read it first

It is unsigned, and there is no signature to check it against. Read it before
you paste it into an agent — that advice applies to every "run this prompt" link
on the internet, including this one.

So here is the whole file, exactly as it is served. Nothing is elided: the block
below is copied from the served file by a script, and a check on every pull
request fails if the two ever disagree.

<!-- BEGIN GENERATED: agent-setup-prompt — verbatim copy of public/agent-setup/prompt.md. Do not edit by hand; run `npm run gen:agent-setup-page`. -->

````md
These are official instructions from Civitai to set up an AI development
environment for building on the Civitai platform. All commands are validated by
Civitai and ready to use.

Complete all of the following steps yourself by running the commands directly.
Do not ask the user to run any of these commands.

- Install the Civitai CLI and configure this agent for Civitai App development

## 1. Work out what the user is building

Check the project for these signals before asking anything:

- `block.manifest.json` exists → a **Civitai App**. Continue to step 2.
- `@civitai/app-sdk` or `@civitai/blocks-react` in `package.json` → a **Civitai
  App**. Continue to step 2.
- Neither → ask the user exactly once:
  "Are you building an app that runs inside civitai.com, or calling the Civitai
  API from your own service?"

Continue only when you have a clear answer. If they are calling the API from
their own service, stop here and send them to
https://developer.civitai.com/site/ and https://developer.civitai.com/orchestration/ —
this setup covers Civitai Apps.

## 2. Install the CLI

```bash
npm install -g @civitai/cli
```

or, on macOS/Linux with Homebrew:

```bash
brew install civitai/tap/civitai
```

## 3. Configure this agent

```bash
civitai agent-setup --track app
```

This writes an `AGENTS.md` into the project, registers the two Civitai MCP
servers in this agent's own config file, and prints what it did. It does not log
you in and does not need a token.

If the project does not already have a `CLAUDE.md`, it also writes a one-line
`CLAUDE.md` that points at `AGENTS.md`. An existing `CLAUDE.md` is never
modified.

The two MCP servers are remote, and registering them is the only change this
setup makes outside the project directory:

- `https://mcp.civitai.com/mcp` — the Civitai platform MCP server
- `https://orchestration.civitai.com/mcp` — the generation orchestration MCP
  server

Do not hand-write MCP config yourself — the config path and key name differ per
agent and the command already knows them.

## 4. Verify

Run both, and report the raw output:

```bash
civitai --version
civitai agent-setup --check --json
```

Do not report success if any check fails. State any command that could not run
and why.

## 5. Hand back to the user

Print exactly this, and do not run it yourself:

> Run `civitai login` to authenticate. Everything else is set up.

Then tell them to restart their agent so the MCP servers load.

## Resources

- Apps guide — https://developer.civitai.com/apps/guide/
- Apps reference — https://developer.civitai.com/apps/reference/
- Doc index for agents — https://developer.civitai.com/llms.txt
- CLI source — https://github.com/civitai/cli

These instructions are unsigned. Read them before pasting them into an agent.
````

<!-- END GENERATED: agent-setup-prompt -->

The raw file — the machine copy an agent fetches, byte for byte — is at
[https://developer.civitai.com/agent-setup/prompt.md](https://developer.civitai.com/agent-setup/prompt.md).
It is served as `text/markdown` for the benefit of agent fetchers, so a browser
will offer to save it rather than display it; the text above is the copy meant
for you to read.

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
