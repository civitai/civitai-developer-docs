---
title: Tools, prompts, and resources
---

# Tools, prompts, and resources

The server publishes live schemas through `tools/list`, `prompts/list` and `resources/templates/list`, so your client always sees the current parameters. This page summarizes what's there.

## Tools

### Finding and running services

| Tool | Purpose |
|---|---|
| `find_services` | Ranks services by speed, cost and success rate. Takes a natural-language `query` ("fast cheap anime image", "best video") or an exact service id, an optional `category` (`image`, `video`, `audio`, `chat`) and `limit`. Also lists OpenRouter chat models, which run as the `chatCompletion` step. |
| `get_input_schema` | The JSON Schema and an example input for a service. Pass a `service` id from `find_services`; or browse with `stepType` and `parameters` (open choices come back as options, with the services under them); or, for `imageGen`, pass Civitai checkpoint and LoRA AIRs as `resources` to get the matching input with them filled in. With no arguments it lists the step types. |
| `run_step` | Runs one step: `stepType` and `input` as `get_input_schema` returns them. Returns each step's status and output, with resource links to any files it produced. |
| `run_workflow` | Runs several steps in the format of [`POST /v2/consumer/workflows`](/orchestration/reference/operations/SubmitWorkflow): `{"$type", "input", "name"}`, where `$type` is the `stepType`. A later step can take an earlier one's output with `{"$ref": "<step name>", "path": "output.images[0].url"}` in place of a value. |
| `get_guide` | The plan for a multi-step job. Topics: `civitai_models`, `image_to_video`, `edit_image`, `compare_services`, `understand_media`. |

The [recipes](/orchestration/recipes/) describe each step's inputs and outputs in more detail; `get_input_schema` returns the same shapes.

### Understanding media

For agents that can't see or hear files themselves.

| Tool | Purpose |
|---|---|
| `caption_media` | Describes an image or video. |
| `transcribe_audio` | Transcribes audio or video to text, with optional word-level timestamps. |

Tagging (`wdTagging`) and content rating (`mediaRating`) run through `run_step` like any other step.

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
| `understand_media` | `mediaUrl`, optional `question` | Caption or transcribe first, and add tagging or rating only when the question needs them. |

## Resources

| URI template | Behavior |
|---|---|
| `spine://blobs/{blobId}` | Images come back inline as base64. Videos and audio return a signed download URL valid for 5 minutes. Returns an error if the blob doesn't exist. |

Tools that produce media include resource links to this template, so MCP clients can show outputs inline without a separate download.

## Related

- [MCP Server overview](/orchestration/mcp/): endpoint, authentication and client setup
- [Recipes](/orchestration/recipes/): REST equivalents with runnable examples
- [API Reference](/orchestration/reference/): generated from the OpenAPI spec
