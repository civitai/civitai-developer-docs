---
title: Tools, prompts, and resources
---

# Tools, prompts, and resources

The MCP server advertises live schemas via `tools/list`, `prompts/list`, and `resources/list` on connect, so your client always sees authoritative parameter shapes. The tables below summarize what's exposed so you know what to look for and which REST recipe each tool maps to.

## Tools

### Image generation

| Tool | Purpose |
|---|---|
| `generate_image` | Text-to-image and image-edit. Engines: `sdcpp`, `seedream`, `flux1-kontext`, `openai`, `gemini`, `grok`, `google`, `wan`. Returns a resource link to each generated blob. |
| `upscale_image` | Repeated 2× upscale (1–3 passes → up to 8×). |
| `convert_image` | Format conversion (jpeg / png / webp / gif) with optional resize. |

Behavior maps directly to the [image recipes](/orchestration/recipes/) — see [Flux 2](/orchestration/recipes/flux2), [SDXL](/orchestration/recipes/sdxl), [Image upscaling](/orchestration/recipes/image-upscaler), and [Image conversion](/orchestration/recipes/convert-image) for parameter and output details.

### Video generation

| Tool | Purpose |
|---|---|
| `generate_video` | Text-to-video and image-to-video. Engines: `kling-v3`, `kling`, `haiper`, `veo3`, `wan`, `minimax`, `vidu`, `sora`, `grok`, `lightricks`. |
| `extract_video_frames` | Sample frames at a configurable rate; perceptual-hash deduplication filters near-identical frames. |
| `upscale_video` | FlashVSR 2–4× upscaling. |

See [WAN](/orchestration/recipes/wan), [Kling](/orchestration/recipes/kling), [Veo 3](/orchestration/recipes/veo3), and [Video upscaling](/orchestration/recipes/video-upscaler) for matching REST recipes.

### Audio

| Tool | Purpose |
|---|---|
| `transcribe_audio` | Speech-to-text with optional word-level timestamps. |
| `text_to_speech` | TTS with selectable speakers (`aiden`, `dylan`, `eric`, `ryan`, `serena`, `sohee`, `vivian`). |

See [Transcription](/orchestration/recipes/transcription) and [Text-to-speech](/orchestration/recipes/text-to-speech).

### Music

| Tool | Purpose |
|---|---|
| `generate_music` | ACE Step 1.5. Supports structured lyrics with section markers like `[Verse]`, `[Chorus]`, `[Bridge]`. Returns MP3 audio or WebM with cover image. |

See [ACE-Step music generation](/orchestration/recipes/ace-step-audio).

### Media analysis

| Tool | Purpose |
|---|---|
| `caption_media` | Generate a descriptive caption for an image or video. |
| `rate_media` | NSFW level, blocked status, content labels. Optional sub-analyses for age classification, face recognition, AI detection, and anime recognition. |
| `tag_media` | WD-style tagging with confidence scores and content-rating distribution. |

### Language models

| Tool | Purpose |
|---|---|
| `chat_completion` | OpenRouter passthrough — any model from OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, Qwen, etc. Supports multi-turn `system` / `user` / `assistant` messages. |

See [Chat completion](/orchestration/recipes/chat-completion) for the model ID format.

### Prompt utilities

| Tool | Purpose |
|---|---|
| `enhance_prompt` | Analyze and rewrite a generation prompt for a target ecosystem (`sd1`, `sdxl`, `flux`, `ltx2`). Returns the improved prompt with issues and recommendations. |

See [Prompt enhancement](/orchestration/recipes/prompt-enhancement).

### Discovery

| Tool | Purpose |
|---|---|
| `find_models` | Natural-language model search across image, video, audio, and chat catalogs. Accepts queries like `"fast cheap chat model"` or a metrics ID like `image/flux1-kontext/pro`. |

### Workflow management

| Tool | Purpose | Auth |
|---|---|---|
| `submit_workflow` | Submit raw workflow JSON — same shape as [`POST /v2/consumer/workflows`](/orchestration/reference/operations/SubmitWorkflow). Use when a specific tool doesn't cover your case. | optional |
| `get_workflow` | Status and output by workflow ID. | optional |
| `cancel_workflow` | Cancel a running workflow. | optional |
| `list_workflows` | Recent workflows for the authenticated user. Supports `take`, `tags`, `excludeFailed`. | **required** |

## Prompts

The server ships three built-in MCP prompts that return ready-to-use guidance for multi-step pipelines. Clients can list and invoke them like any MCP prompt.

| Prompt | Input | What it returns |
|---|---|---|
| `image_generation_guide` | `intent` (e.g. `"photorealistic product photo"`, `"anime character"`, `"fast draft"`) | Engine comparison table, quick recommendations, parameter tips. |
| `video_creation_pipeline` | `intent` (e.g. `"product showcase"`, `"music video clip"`, `"talking head"`) | Recommended pipeline (image → video → upscale), engine selection matrix, example tool sequence. |
| `content_analysis_pipeline` | `mediaUrl` | Stepwise plan: caption → tag → rate, with notes on when to use each. |

## Resources

| URI template | MIME | Behavior |
|---|---|---|
| `spine://blobs/{blobId}` | `application/octet-stream` | Images are inlined as base64 content. Videos and audio return a 5-minute signed download URL. Returns an error if the blob does not exist. |

Tools that produce media include resource links pointing at this URI template, so MCP clients can render outputs inline without a separate download step.

## Capabilities advertised on `initialize`

```json
{
  "protocolVersion": "2024-11-05",
  "capabilities": {
    "logging": {},
    "prompts": { "listChanged": true },
    "resources": { "listChanged": true },
    "tools": { "listChanged": true }
  },
  "serverInfo": {
    "name": "civitai-orchestration",
    "title": "Civitai Orchestration MCP Server",
    "description": "Generate images, videos, audio, and more via the Civitai Orchestration platform"
  }
}
```

## Related

- [MCP Server overview](/orchestration/mcp/) — endpoint, auth, and client setup
- [Recipes](/orchestration/recipes/) — REST equivalents with runnable examples
- [API Reference](/orchestration/reference/) — generated from the OpenAPI spec
