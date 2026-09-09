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
