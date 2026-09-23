---
title: MCP Server
---

# Civitai Orchestration MCP Server

The orchestrator is also exposed as a remote [Model Context Protocol](https://modelcontextprotocol.io) server, so any MCP-aware client — Claude Desktop, claude.ai, Claude Code, Cursor, VS Code — can call it directly. The MCP server wraps the same workflow engine as the REST API, with one tool per recipe family (image, video, audio, music, training, analysis, utilities) plus tools for managing workflows.

If you already use the orchestrator via [REST](/orchestration/guide/getting-started), MCP gives you the same capabilities packaged for LLM agents: tools an agent can call, prompts that guide multi-step pipelines, and a resource scheme for fetching generated media inline.

This is the **generation** MCP. To browse models and images, post, comment, react, or message on civitai.com, use the separate [Civitai (site) MCP](/site/mcp/).

## Endpoint

```
https://orchestration.civitai.com/mcp
```

Transport is **Streamable HTTP** — the modern MCP HTTP transport used by remote MCP servers in Claude Desktop and claude.ai. There is no binary to install; clients connect directly over HTTPS.

## Authentication

The MCP server uses the **same Civitai API key** as the [REST API](/orchestration/guide/authentication). Send it as a Bearer token in the `Authorization` header on every request:

<McpConfigBlock kind="header" />

If you've set your Civitai token in the navbar (top-right), the snippets on this page are pre-filled with it — copy and paste into your MCP client config. Otherwise they show a `YOUR_CIVITAI_API_KEY` placeholder.

Every tool requires a token — requests without a valid `Authorization` header are rejected with `401`. Calls run as your account, so Buzz is charged to it and workflows show up in `list_workflows`.

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

## Pricing, async submission, and tagging

The generation and transform tools (`generate_image`, `generate_video`, `generate_music`, `text_to_speech`, `upscale_image`, `convert_image`, `upscale_video`, `extract_video_frames`) accept four optional parameters on top of their own:

| Parameter | Type | Behavior |
|---|---|---|
| `whatif` | boolean | Price the request without running it. Nothing is executed and no Buzz is spent — the same as `?whatif=true` on [`POST /v2/consumer/workflows`](/orchestration/reference/operations/SubmitWorkflow). |
| `waitForCompletion` | boolean | Default `true`: the call blocks until the workflow finishes. Set `false` to get the workflow ID back immediately and poll with `get_workflow`. |
| `tags` | string[] | Up to 10 tags, 1–200 characters each, stored on the workflow. Filter by them later with `list_workflows`. |
| `metadataJson` | string | A JSON object (as a string) stored as the workflow's `metadata`. |

Results carry `structuredContent` alongside the text, so clients don't have to parse prose:

```jsonc
// whatif: true
{ "workflowId": "…", "cost": { "base": 12, "total": 12, "variable": false }, "insufficientBuzz": false, "currencies": ["blue"] }

// waitForCompletion: false
{ "workflowId": "…", "status": "submitted" }

// default (blocking)
{ "workflowId": "…" }
```

`cost.variable` is `true` when the price is a cap that may settle lower. `currencies` lists the Buzz accounts the charge would draw from.

## Related

- [Authentication](/orchestration/guide/authentication) — how to get and rotate a Civitai API key
- [Recipes](/orchestration/recipes/) — REST examples for the same workflows the MCP tools wrap
- [Tools, prompts, and resources](/orchestration/mcp/tools) — full MCP catalog
