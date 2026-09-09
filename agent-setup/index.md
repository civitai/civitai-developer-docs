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

Check the project for these signals:

- `block.manifest.json` exists → a **Civitai App**. Continue to step 2.
- `@civitai/app-sdk` or `@civitai/blocks-react` in `package.json` → a **Civitai
  App**. Continue to step 2.
- Neither → **assume a Civitai App and continue to step 2.** An empty directory
  is the normal starting point for this setup, and nothing in steps 2 to 4 is
  specific to a project that already exists. Do not stop to ask — say which you
  assumed when you report back in step 5, so the user can correct you in one
  sentence.

The one case this setup does not cover: the user has already told you they are
calling the Civitai API from their own service, rather than building something
that runs inside civitai.com. Then stop here and send them to
https://developer.civitai.com/site/ and
https://developer.civitai.com/orchestration/ instead.

## 2. Install the CLI

If `civitai --version` already prints a version, the CLI is installed. Note the
number, go to step 3, and come back here only if step 3 or step 4 fails.

Otherwise install it:

```bash
npm install -g @civitai/cli
```

or, on macOS/Linux with Homebrew:

```bash
brew install civitai/tap/civitai
```

### If the install fails

Two failures were measured on a real machine. They are the two that were
measured, not the only ways an install can fail — if you hit a third, report the
exact error and stop rather than guessing.

- **npm fails with `EACCES`, or with `ENOENT` on a `mkdir` under npm's global
  prefix.** The prefix is not writable. This is normal on NixOS, in some
  container images, and wherever Node came from a system package manager.
  Install into a prefix you own, and put its `bin` directory first on PATH for
  this shell:

  ```bash
  npm install -g --prefix="$HOME/.npm-global" @civitai/cli
  PATH="$HOME/.npm-global/bin:$PATH"
  ```

- **brew is not found.** Homebrew is not installed, and installing Homebrew is
  not part of this setup. Use the npm path above.

### The `install-scripts` warning is expected

npm 11 does not run package install scripts by default, so a **successful**
install still ends with a warning naming `@civitai/cli` and a skipped
`postinstall`. That is not a broken install and it is not a reason to stop.
`@civitai/cli` is a thin wrapper whose `postinstall` downloads the matching
platform binary; when the `postinstall` is skipped, the wrapper downloads it on
first run instead. Step 4 is what tells you whether the install worked.

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

The two MCP servers are remote:

- `https://mcp.civitai.com/mcp` — the Civitai platform MCP server
- `https://orchestration.civitai.com/mcp` — the generation orchestration MCP
  server

**The command prints the full path of every file it writes, and that printed
list is the complete footprint of this setup.** How much of it lands outside the
project directory depends on which agent was detected: some agents keep MCP
config in the repo, others in your home directory, and the command names the
path it actually used rather than guessing. Report that list.

Do not hand-write MCP config yourself — the config path and key name differ per
agent and the command already knows them.

## 4. Verify

Run both, and report the raw output:

```bash
civitai --version
civitai agent-setup --check --json
```

Read the output, not just the exit code:

- **The version must be the one you just installed.** If it is older, a
  different `civitai` earlier on PATH is shadowing the new one — the install
  succeeded and you are running a different binary. Fix PATH (see step 2) and
  re-run.
- An error saying "unknown command" or "unknown flag" means the same thing: the
  binary actually being run is too old for this setup. Same fix.

Do not report success if any check fails. State any command that could not run
and why.

## 5. Hand back to the user

**Do not write the authentication instructions yourself.** `civitai agent-setup`
already worked them out for the agent it detected, and they genuinely differ per
agent: most need `CIVITAI_TOKEN` exported into the environment, spelled the way
that particular agent reads environment variables, and at least one agent gets
no `Authorization` header at all and needs one added by hand. Running
`civitai login` on its own does not reach your agent — it stores a token this
CLI can see and your agent cannot.

So: relay, **verbatim**, the `Authentication:` and `Next:` sections that
`civitai agent-setup --track app` printed back in step 3. Do not summarise them,
do not replace them with a sentence of your own, and do not run them yourself —
they are the user's to run. If you no longer have that output, run the step 3
command again (it is idempotent) and relay the sections from the new run.

## 6. Where to go from here

`AGENTS.md` — written into the project by step 3, and the file this agent reads
first from now on — is the source of truth for scaffolding, running, validating
and submitting an App. Follow it rather than repeating it here. The first
command it takes you to is `civitai app init`.

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
