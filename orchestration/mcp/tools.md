---
title: Tools, prompts, and resources
---

# Tools, prompts, and resources

This page summarizes the `/mcp/v2` catalog; your client always sees the current parameters through `tools/list`, `prompts/list` and `resources/templates/list`. The older `/mcp` endpoint serves a frozen v1 tool set and gets no new tools.

## Tools

### Finding and running services

| Tool | Purpose |
|---|---|
| `find_services` | Finds the service for any job, most used reliable first, with speed, cost, success rate and the media each takes. `category`: `image`, `video` or `audio` to make or change media; `text` to caption, tag, rate or describe media and to improve or moderate prompts; `3d`; `model` for training; `utility` for conversions and other tools; `chat` for OpenRouter chat models (the `chatCompletion` step). Transcription is `audio`. `takes`: the media you start from, e.g. `["image"]`. `prefer`: `fast`, `cheap` or `quality`, only when the user asked. `query`: a service or model name, or an exact service id; `*` also lists utilities. `limit` defaults to 10. |
| `get_input_schema` | The JSON Schema and an example input for a service. Pass a `service` id from `find_services`; or browse with `stepType` and `parameters` (open choices come back as options, with the services under them); or, for `imageGen`, pass Civitai checkpoint and LoRA AIRs as `resources` to get the matching input with them filled in. With no arguments it lists the step types. |
| `run_step` | Runs one step: `stepType` and `input` as `get_input_schema` returns them. **By default it only prices the step** (`whatif` defaults to `true`); call again with `whatif: false` to run it and spend Buzz. A real run returns the step's output, with resource links to any files it produced. |
| `run_workflow` | Runs several steps in the format of [`POST /v2/consumer/workflows`](/orchestration/reference/operations/SubmitWorkflow): `{"$type", "input", "name"}`, where `$type` is the `stepType`. A later step can take an earlier one's output with `{"$ref": "<step name>", "path": "output.images[0].url"}` in place of a value, and add `"format": "A drawing of {0}"` to insert it into text ([details](/orchestration/guide/workflows#inserting-a-reference-into-text)). |
| `get_guide` | The plan for a multi-step job. Topics: `civitai_models`, `image_to_video`, `edit_image`, `compare_services`, `understand_media`. |

The [recipes](/orchestration/recipes/) describe each step's inputs and outputs in more detail; `get_input_schema` returns the same shapes.

### Understanding media

Captioning, transcription, tagging (`wdTagging`) and content rating (`mediaRating`) are services like any other: find one with `find_services` (`category: "text"` for captions, tags and ratings, `"audio"` for transcription) and run it with `run_step`.

### Web

| Tool | Purpose |
|---|---|
| `web_search` | Searches the web and returns result titles, URLs and descriptions. 1 Buzz per call. |
| `fetch_page` | Fetches a web page and returns its content as markdown. 1 Buzz per call. |

### Workflows

| Tool | Purpose |
|---|---|
| `get_workflow` | A workflow's status and each step's output, with resource links to files. |
| `list_workflows` | Your recent workflows. Supports `take`, `tags` and `excludeFailed`. |
| `cancel_workflow` | Cancels a running workflow. |

You can only see and cancel your own workflows.

## Prompts

Prompts are plans your MCP client can offer you, usually as slash commands. Each returns the same plan as the matching `get_guide` topic, with your request filled in.

| Prompt | Arguments | Plan |
|---|---|---|
| `generate_with_civitai_models` | `prompt`, `resources` (AIRs, comma-separated) | Get the input for exactly these models, add the prompt, run it. If the models can't run together, say why instead of swapping one. |
| `image_to_video` | `idea`, optional `image` | Pick a video service that takes a source image; generate the first frame if none is given, and chain frame and video in one workflow. |
| `edit_image` | `image`, `instruction` | Find a service that edits and describe the change plus what must stay the same. |
| `compare_services` | `prompt`, optional `category` | Run one prompt on three different services in one workflow and compare cost, time and result. |
| `understand_media` | `mediaUrl`, optional `question` | Find a captioning or transcription service with `find_services` and run it; add tagging or rating only when the question needs them. |

## Resources

| URI template | Behavior |
|---|---|
| `spine://blobs/{blobId}` | Images come back inline as base64. Videos and audio return a signed download URL valid for 5 minutes. Returns an error if the blob doesn't exist. |

Tools that produce media include resource links to this template, so MCP clients can show outputs inline without a separate download.

## Related

- [MCP Server overview](/orchestration/mcp/): endpoint, authentication and client setup
- [Recipes](/orchestration/recipes/): REST equivalents with runnable examples
- [API Reference](/orchestration/reference/): generated from the OpenAPI spec
