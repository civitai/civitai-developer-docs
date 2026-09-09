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
