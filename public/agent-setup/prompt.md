These are official instructions from Civitai to set up an AI development
environment for building on the Civitai platform. All commands are validated by
Civitai and ready to use.

Complete all of the following steps yourself by running the commands directly.
Do not ask the user to run any of these commands.

- Install the Civitai CLI and configure this agent for Civitai App development
- Relay the CLI's own authentication output verbatim (step 5) — never write
  authentication instructions yourself

## 1. Work out what the user is building

Check the project for these signals:

- `block.manifest.json` exists → a **Civitai App**. Continue to step 2.
- `@civitai/app-sdk` or `@civitai/blocks-react` in `package.json` → a **Civitai
  App**. Continue to step 2.
- Neither → **assume a Civitai App and continue to step 2.** An empty directory
  is the normal starting point, and nothing in steps 2 to 4 depends on a project
  that already exists. Do not stop to ask — say which you assumed when you report
  back in step 5, so the user can correct you in one sentence.

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

Two failures were measured on a real machine — not the only ways an install can
fail. On a third, report the exact error and stop rather than guessing.

- **npm fails with `EACCES`, or with `ENOENT` on a `mkdir` under npm's global
  prefix.** The prefix is not writable. This is normal on NixOS, in some
  container images, and wherever Node came from a system package manager.
  Install into a prefix you own, and put its `bin` directory first on PATH for
  this shell:

  ```bash
  npm install -g --prefix="$HOME/.npm-global" @civitai/cli
  PATH="$HOME/.npm-global/bin:$PATH"
  ```

  That `PATH` line lasts only for this shell. Report it verbatim in step 5 so
  the user can make it permanent — do not edit their shell profile yourself.

- **brew is not found.** Homebrew is not installed, and installing Homebrew is
  not part of this setup. Use the npm path above.

### The `install-scripts` warning is expected

A **successful** npm 11 install still ends with a warning that `@civitai/cli`'s
`postinstall` is "not yet covered by allowScripts". That is an advisory about a
future npm policy, not a report that the script was skipped — measured on npm
11.19, the postinstall ran and the platform binary was on disk before the CLI
was run once. Do not stop, and do not re-install with an allow-scripts flag.
Step 4 tells you whether the install worked.

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

**The command prints the full path of every file it writes, that list is the
complete footprint of this setup, and you must report it.** How much lands
outside the project directory depends on which agent was detected: some keep MCP
config in the repo, others in your home directory, and the command names the
path it actually used rather than guessing.

Do not hand-write MCP config yourself — the config path and key name differ per
agent and the command already knows them.

## 4. Verify

Run both, and report the raw output:

```bash
civitai --version
civitai agent-setup --check --json
```

Read the output, not just the exit code:

- **An old version, or an "unknown command" / "unknown flag" error, means the
  binary being run is too old.** Usually there is only one `civitai` and it is
  simply out of date: `civitai upgrade` replaces it in place, checksum-verified,
  handing off to Homebrew if that is how it was installed. Run it, then re-run
  both commands above. Replacing the binary in place is what makes the user's own
  shell get the new CLI; installing a second copy does not.
- Only if the version still does not move is a different `civitai` earlier on
  PATH — possible only if you used the `--prefix` install in step 2. Fix it
  there, and report that PATH line in step 5.

Do not report success if any check fails. State any command that could not run
and why.

## 5. Hand back to the user

**Do not write the authentication instructions yourself.** `civitai agent-setup`
already worked them out for the agent it detected, and they genuinely differ per
agent: the `CIVITAI_TOKEN` spelling differs per agent, and at least one gets no
`Authorization` header at all and needs one added by hand. Running
`civitai login` on its own does not reach your agent — it stores a token this
CLI can see and your agent cannot.

So: relay, **verbatim**, the `Authentication:` and `Next:` sections that
`civitai agent-setup --track app` printed back in step 3. Do not summarise them,
do not replace them with a sentence of your own, and do not run them yourself —
they are the user's to run. If you no longer have that output, run the step 3
command again (it is idempotent) and relay the sections from the new run.

Where that token comes from, if the user asks: a personal API key created at
https://civitai.com/user/account (API Keys). A browser `civitai login` instead
stores a short-lived OAuth token that the CLI refreshes for itself — exported
into the environment it is never refreshed and stops working when it expires.

## 6. Where to go from here

`AGENTS.md` — written into the project by step 3, and the file this agent reads
first from now on — is the source of truth for scaffolding, running, validating
and submitting an App. Follow it rather than repeating it here, including which
command it tells you to scaffold with — do not pick one yourself.

## Resources

- Apps guide — https://developer.civitai.com/apps/guide/
- Apps reference — https://developer.civitai.com/apps/reference/
- Doc index for agents — https://developer.civitai.com/llms.txt
- CLI source — https://github.com/civitai/cli

These instructions are unsigned. Read them before pasting them into an agent.
