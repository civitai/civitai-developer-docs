---
title: MCP Server
---

# Civitai MCP Server

Civitai is exposed as a remote [Model Context Protocol](https://modelcontextprotocol.io) server, so any MCP-aware client — Claude Desktop, claude.ai, Claude Code, Cursor, VS Code — can browse and act on the platform directly. It wraps the same operations as the [Site API](/site/guide/): searching models, images, and creators; creating posts and articles; commenting and reacting; messaging; and (for moderators) managing announcements and the changelog.

This is the **platform** MCP — content and social actions on civitai.com. For generating images, video, audio, and music, use the separate [Orchestration MCP](/orchestration/mcp/).

::: tip Self-documenting
The server advertises live tool schemas via `tools/list` on connect, so your client always sees authoritative parameter shapes. The catalog on this site is a human-readable map; the server is the source of truth. The same content is published as an [`llms.txt`](https://mcp.civitai.com/llms.txt) for agents.
:::

## Endpoint

```
https://mcp.civitai.com/mcp
```

Transport is **Streamable HTTP** (JSON-RPC over HTTP POST) — the modern MCP HTTP transport used by remote servers in Claude Desktop and claude.ai. There is no binary to install; clients connect directly over HTTPS.

## Authentication

The MCP server uses the **same Civitai API key** as the [Site API](/site/guide/authentication). Get one at [civitai.com/user/account](https://civitai.com/user/account) and send it as a Bearer token in the `Authorization` header on every request:

<McpConfigBlock kind="header" url="https://mcp.civitai.com/mcp" serverName="civitai" />

If you've set your Civitai token in the navbar (top-right), the snippets on this page are pre-filled with it — copy and paste into your MCP client config. Otherwise they show a `YOUR_CIVITAI_API_KEY` placeholder.

**Browse tools are anonymous.** `search_models`, `get_model`, `search_images`, `search_creators`, and the other read tools work without a key. Everything that writes — posting, commenting, reacting, messaging, moderation — requires the token, and is performed *as the user that owns the key*. Brand-new accounts must finish onboarding (`complete_onboarding_step`) before guarded writes succeed.

## Connecting

### Claude Code

```bash
claude mcp add --transport http civitai https://mcp.civitai.com/mcp \
  --header "Authorization: Bearer YOUR_CIVITAI_API_KEY"
```

### Claude Desktop / Cursor / VS Code

Add the server to your client's `mcp.json` (or `~/.claude/config.json` for Claude Desktop), then restart:

<McpConfigBlock kind="json" url="https://mcp.civitai.com/mcp" serverName="civitai" />

### claude.ai

Add a custom remote MCP server under **Settings → Connectors → Add custom connector**:

- **URL:** `https://mcp.civitai.com/mcp`
- **Authentication:** Custom header `Authorization` with the Bearer value below

<McpConfigBlock kind="header" url="https://mcp.civitai.com/mcp" serverName="civitai" />

### Standalone CLI

A zero-dependency Node CLI (Node ≥ 18) is published from the server for shell use and scripting:

```bash
curl -fsSL https://mcp.civitai.com/cli -o mcp-cli.mjs
export CIVITAI_API_KEY=YOUR_CIVITAI_API_KEY

node mcp-cli.mjs list
node mcp-cli.mjs call search_models '{"query":"anime","type":"Checkpoint"}'
```

Override the server with `MCP_URL` or `--url`.

### Generic HTTP MCP clients

Any MCP client that speaks Streamable HTTP can connect — point it at `/mcp` and send the `Authorization` header.

## What's available

- **Browse** — search models, model versions, images (with generation metadata), and creators; list filter enums
- **Posts** — create and publish image posts, fetch, delete
- **Articles** — create / update / publish / unpublish, fetch
- **Comments** — list, post, reply, edit, delete, react, pin, lock threads
- **Engagement** — react, review models, follow users, bookmark models and articles, manage notifications
- **Collections** — create, add items, follow
- **Messaging** — direct messages, chat threads, mark read
- **Bounties** — create, update, submit entries, award
- **Moderation** *(moderator-only)* — announcements and changelog entries
- **Utilities** — `upload_image` (from URL or base64), `whoami`

See the [tools reference](/site/mcp/tools) for the full catalog.

## Related

- [Authentication](/site/guide/authentication) — how to get and rotate a Civitai API key
- [Site API reference](/site/reference/) — REST endpoints for the same browse data
- [Orchestration MCP](/orchestration/mcp/) — the generation-focused MCP server
- [Tools reference](/site/mcp/tools) — full MCP catalog
