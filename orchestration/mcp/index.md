---
title: MCP Server
---

# Civitai Orchestration MCP Server

The orchestrator is also a remote [Model Context Protocol](https://modelcontextprotocol.io) server. Any MCP client, such as Claude Desktop, claude.ai, Claude Code, Cursor or VS Code, can run the same workflows as the [REST API](/orchestration/guide/getting-started): images, video, audio, music, upscaling, conversion, tagging and every other step.

Instead of one tool per task, the server has a few generic tools. The agent finds a service, asks for the exact input that service accepts, and runs it. New engines, models and steps show up without any change to the MCP server.

This is the **generation** MCP. To browse models and images, post, comment, react, or message on civitai.com, use the separate [Civitai (site) MCP](/site/mcp/).

## Endpoint

```
https://orchestration.civitai.com/mcp/v2
```

Transport is **Streamable HTTP**, the MCP transport for remote servers. There is nothing to install; clients connect directly over HTTPS.

## Authentication

The MCP server uses the **same Civitai API key** as the [REST API](/orchestration/guide/authentication). Send it as a Bearer token in the `Authorization` header on every request:

<McpConfigBlock kind="header" url="https://orchestration.civitai.com/mcp/v2" />

If you've set your Civitai token in the navbar (top-right), the snippets on this page are pre-filled with it. Otherwise they show a `YOUR_CIVITAI_API_KEY` placeholder.

Every request needs a valid token; requests without one are rejected with `401`. Calls run as your account, so Buzz is charged to it and workflows show up in `list_workflows`.

## Connecting

### Claude Desktop

Add the server to `~/.claude/config.json` (or use **Settings → Developer → Edit Config**), then restart Claude Desktop:

<McpConfigBlock kind="json" url="https://orchestration.civitai.com/mcp/v2" />

### claude.ai

Add a custom remote MCP server under **Settings → Connectors → Add custom connector**:

- **URL:** `https://orchestration.civitai.com/mcp/v2`
- **Authentication:** custom header `Authorization` with the Bearer value below

<McpConfigBlock kind="header" url="https://orchestration.civitai.com/mcp/v2" />

### Claude Code, Cursor, VS Code

For Claude Code, run:

<McpConfigBlock kind="cli" url="https://orchestration.civitai.com/mcp/v2" />

For Cursor or VS Code, add the same shape to your `mcp.json`:

<McpConfigBlock kind="json" url="https://orchestration.civitai.com/mcp/v2" />

### Other clients

Any client that speaks Streamable HTTP can connect: point it at `/mcp/v2` and send the `Authorization` header.

## Steps and services

- A **step** is what a workflow runs: `imageGen`, `videoGen`, `textToSpeech`, `convertImage` and so on. It's the `$type` in [`POST /v2/consumer/workflows`](/orchestration/reference/operations/SubmitWorkflow).
- A **service** is one concrete thing a step can do, meaning an engine, model and operation, identified like `image/flux2/klein/createImage/9b`. These are the same ids as [`GET /v2/consumer/services`](/orchestration/reference/operations/ListServices).

## How an agent uses it

1. **Pick a service.** `find_services` ranks services by speed, cost and success rate from a query like "fast cheap anime image", and prints each one's service id.
2. **Get its input.** `get_input_schema(service)` returns the JSON Schema for that service's input and an example to start from.
3. **Run it.** `run_step(stepType, input)`. Everything the service needs, the prompt included, goes inside `input`. To chain several steps, use `run_workflow(steps)`.

```jsonc
// get_input_schema({ "service": "image/flux2/klein/createImage/9b" })
{
  "service": "image/flux2/klein/createImage/9b",
  "stepType": "imageGen",
  "parameters": { "engine": "flux2", "model": "klein", "operation": "createImage", "modelVersion": "9b" },
  "schema": { "type": "object", "properties": { "width": { "minimum": 512, "maximum": 2048, "default": 1024 }, … } },
  "example": { "engine": "flux2", "model": "klein", "operation": "createImage", "modelVersion": "9b" }
}
```

To generate with Civitai checkpoints and LoRAs, pass their AIRs instead: `get_input_schema(resources=["urn:air:sdxl:checkpoint:civitai:257749@290640", …])` picks the service they run on and fills them into the example.

For jobs that take several steps, such as turning a generated picture into a video, `get_guide` returns a plan the agent can follow. The server's instructions tell the agent to use it.

Inputs are checked strictly: a property the step's schema doesn't define is rejected with the list of valid ones, so a guessed field name fails loudly instead of being ignored.

See the [tools reference](/orchestration/mcp/tools) for every tool, prompt and resource.

## Pricing, async submission, and tagging

`run_step`, `run_workflow`, `caption_media` and `transcribe_audio` accept four optional parameters:

| Parameter | Type | Behavior |
|---|---|---|
| `whatif` | boolean | Price the request without running it. Nothing is executed and no Buzz is spent, the same as `?whatif=true` on [`POST /v2/consumer/workflows`](/orchestration/reference/operations/SubmitWorkflow). |
| `waitForCompletion` | boolean | Default `true` (training steps default to `false`): the call returns when the workflow finishes. Set `false` to get the workflow ID back immediately and poll with `get_workflow`. |
| `tags` | string[] | Up to 10 tags, 1–200 characters each, stored on the workflow. Filter by them later with `list_workflows`. |
| `metadataJson` | string | A JSON object (as a string) stored as the workflow's `metadata`. |

Results carry `structuredContent` alongside the text, so clients don't have to parse prose:

```jsonc
// whatif: true
{ "workflowId": "…", "cost": { "base": 12, "total": 12, "variable": false }, "insufficientBuzz": false, "currencies": ["blue"] }

// waitForCompletion: false
{ "workflowId": "…", "status": "submitted" }

// default (waits)
{ "workflowId": "…" }
```

`cost.variable` is `true` when the price is a cap that may settle lower. `currencies` lists the Buzz accounts the charge would draw from.

## Newer MCP clients

Clients on MCP protocol revision `2026-07-28` also get:

- **Buzz confirmation.** Before a run that costs Buzz, the server prices it and asks the user to approve, for example "Spend 12 Buzz to run imageGen?". If the user declines, nothing is spent. `whatif` calls and free runs skip the prompt.
- **Tasks.** A client that opts into the `io.modelcontextprotocol/tasks` extension gets a task back from the tools that run workflows instead of waiting for the result. The task ID is the workflow ID; poll it with `tasks/get` and stop it with `tasks/cancel`. Tasks don't depend on the connection, so a long video or training run can't time out the tool call.
- **Cached lists.** The tool and prompt lists may be cached for an hour.

Clients on earlier revisions work as described above, without these.

## Related

- [Tools, prompts, and resources](/orchestration/mcp/tools): the full catalog
- [Authentication](/orchestration/guide/authentication): how to get and rotate a Civitai API key
- [Recipes](/orchestration/recipes/): REST examples for the same steps
