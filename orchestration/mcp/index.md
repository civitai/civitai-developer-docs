---
title: MCP Server
---

# Civitai Orchestration MCP Server

The orchestrator is also exposed as a remote [Model Context Protocol](https://modelcontextprotocol.io) server, so any MCP-aware client — Claude Desktop, claude.ai, Claude Code, Cursor, VS Code — can call it directly. The MCP server wraps the same workflow engine as the REST API, with one tool per recipe family (image, video, audio, music, training, analysis, utilities) plus tools for managing workflows.

If you already use the orchestrator via [REST](/orchestration/guide/getting-started), MCP gives you the same capabilities packaged for LLM agents: tools an agent can call, prompts that guide multi-step pipelines, and a resource scheme for fetching generated media inline.

## Endpoint

```
https://orchestration.civitai.com/mcp
```

Transport is **Streamable HTTP** — the modern MCP HTTP transport used by remote MCP servers in Claude Desktop and claude.ai. There is no binary to install; clients connect directly over HTTPS.

## Authentication

The MCP server uses the **same Civitai API key** as the [REST API](/orchestration/guide/authentication). Send it as a Bearer token in the `Authorization` header on every request:

<McpConfigBlock kind="header" />

If you've set your Civitai token in the navbar (top-right), the snippets on this page are pre-filled with it — copy and paste into your MCP client config. Otherwise they show a `YOUR_CIVITAI_API_KEY` placeholder.

Most tools (`generate_image`, `generate_video`, `transcribe_audio`, …) accept anonymous calls, but tools that read or list per-user state — most notably `list_workflows` — require a token. Authenticated calls are also tracked against your account for usage and Buzz accounting, so you'll generally want one configured.

## Connecting

### Claude Desktop

Add the server to `~/.claude/config.json` (or use **Settings → Developer → Edit Config**), then restart Claude Desktop:

<McpConfigBlock kind="json" />

The server appears in the MCP picker, and its tools become available in any conversation.

### claude.ai

In claude.ai, add a custom remote MCP server under **Settings → Connectors → Add custom connector**:

- **URL:** `https://orchestration.civitai.com/mcp`
- **Authentication:** Custom header `Authorization` with the Bearer value below

<McpConfigBlock kind="header" />

### Claude Code / Cursor / VS Code MCP

For Claude Code, run:

<McpConfigBlock kind="cli" />

For Cursor or VS Code with the MCP extension, add the same shape to your `mcp.json`:

<McpConfigBlock kind="json" />

### Generic HTTP MCP clients

Any MCP client that speaks Streamable HTTP can connect — point it at `/mcp` and send the `Authorization` header. The server advertises full capabilities (`tools`, `prompts`, `resources`, all with `listChanged`) on `initialize`.

## What's available

- **Generation tools** — image, video, audio (TTS / transcription), music
- **Media utilities** — upscale, convert, frame extraction
- **Analysis** — caption, rate (NSFW / safety), tag
- **LLM access** — `chat_completion` against any OpenRouter model
- **Discovery** — `find_models` natural-language search across the catalog
- **Workflow management** — submit raw workflow JSON, get / cancel / list workflows
- **Prompts** — three built-in pipeline guides for common tasks
- **Resources** — `spine://blobs/{blobId}` for inline retrieval of generated media

See the [tools reference](/orchestration/mcp/tools) for the full catalog.

## Related

- [Authentication](/orchestration/guide/authentication) — how to get and rotate a Civitai API key
- [Recipes](/orchestration/recipes/) — REST examples for the same workflows the MCP tools wrap
- [Tools, prompts, and resources](/orchestration/mcp/tools) — full MCP catalog
