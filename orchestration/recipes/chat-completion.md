---
title: Chat completion
---

<script setup>
const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/dd4b4ad5-040f-4f0e-baa3-6e1ff00add65/original=true,quality=90,optimized=true/26781018.jpeg';

const basicBody = {
  steps: [{
    $type: 'chatCompletion',
    input: {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
    },
  }],
};

const visionBody = {
  steps: [{
    $type: 'chatCompletion',
    input: {
      model: 'openai/gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image in detail.' },
          { type: 'image_url', image_url: { url: sampleImage } },
        ],
      }],
      maxTokens: 300,
    },
  }],
};

const multiTurnBody = {
  steps: [{
    $type: 'chatCompletion',
    input: {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a concise assistant. Respond in one sentence.' },
        { role: 'user', content: 'Write a haiku about the ocean.' },
        { role: 'assistant', content: 'Waves crash endlessly,\nSalt and foam kiss the grey shore,\nThe sea never sleeps.' },
        { role: 'user', content: 'Now write one about mountains.' },
      ],
      temperature: 0.7,
    },
  }],
};
</script>

# Chat completion

`chatCompletion` routes text (and optionally image) inputs through large language models. Any model available on [OpenRouter](https://openrouter.ai/models) is supported, plus Civitai-hosted AIR models. The request and response shapes follow the OpenAI Chat Completions API.

## Access paths

Two ways to use chat completion, depending on your use case:

| Path | When to use |
|------|-------------|
| **`POST /v1/chat/completions`** | Drop-in replacement for the OpenAI API. Accepts `stream: true` for SSE streaming. |
| **`chatCompletion` workflow step** | Chain with other steps (`imageGen`, `convertImage`, etc.) in a multi-step workflow. |

Both paths share the same input schema and produce the same output format.

## Basic text completion

### Via the OpenAI-compatible endpoint

```http
POST https://orchestration.civitai.com/v1/chat/completions
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "model": "openai/gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "What is the capital of France?" }
  ]
}
```

### Via SubmitWorkflow

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "chatCompletion",
    "input": {
      "model": "openai/gpt-4o-mini",
      "messages": [
        { "role": "system", "content": "You are a helpful assistant." },
        { "role": "user", "content": "What is the capital of France?" }
      ]
    }
  }]
}
```

<RecipeRun :body="basicBody" :wait="60" />

## Vision (image inputs)

Pass images in user message content parts. Any vision-capable model (e.g. `openai/gpt-4o`, `google/gemini-2.0-flash`) can process them.

```json
{
  "model": "openai/gpt-4o",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Describe this image in detail." },
      {
        "type": "image_url",
        "image_url": {
          "url": "https://image.civitai.com/.../photo.jpeg",
          "detail": "auto"
        }
      }
    ]
  }],
  "max_tokens": 300
}
```

`detail` can be `"auto"` (default), `"low"`, or `"high"`. The image source can be a public URL, a data URL (`data:image/jpeg;base64,...`), or raw Base64 — the orchestrator uploads it to blob storage before dispatching the job.

<RecipeRun :body="visionBody" :wait="60" />

## Image generation

Set `"modalities": ["image", "text"]` on the request to generate images through `/v1/chat/completions`. The response carries an `images` array on the assistant message, where each entry is a base64 data URI — the same shape OpenRouter uses, so existing OpenRouter-style SDK code works unmodified.

```http
POST https://orchestration.civitai.com/v1/chat/completions
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "model": "google/gemini-2.5-flash-image",
  "messages": [
    { "role": "user", "content": "A cat in a teacup, soft window light" }
  ],
  "modalities": ["image", "text"],
  "image_config": {
    "aspect_ratio": "1:1",
    "image_size": "1K"
  }
}
```

Response:

```json
{
  "id": "chatcmpl-...",
  "model": "google/gemini-2.5-flash-image",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "",
      "images": [{
        "type": "image_url",
        "image_url": { "url": "data:image/png;base64,iVBOR..." }
      }]
    },
    "finish_reason": "stop"
  }]
}
```

### Image editing (multi-turn)

Pass a prior generated image (or any image URL / data URI) as a content part on a user message and the request routes through the engine's edit operation:

```json
{
  "model": "google/gemini-2.5-flash-image",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Make it a dog instead of a cat." },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
    ]
  }],
  "modalities": ["image", "text"]
}
```

### Supported models

| `model` | Engine | Operations |
|---------|--------|------------|
| `google/gemini-2.5-flash-image` | Gemini 2.5 Flash Image | create, edit |
| `openai/gpt-image-1` | OpenAI gpt-image-1 | create, edit |
| `openai/dall-e-3` | OpenAI DALL·E 3 | create |
| `openai/dall-e-2` | OpenAI DALL·E 2 | create, edit |
| `black-forest-labs/flux.2-dev` | Flux 2 Dev | create, edit |
| `black-forest-labs/flux.2-flex` | Flux 2 Flex | create, edit |
| `black-forest-labs/flux.2-pro` | Flux 2 Pro | create, edit |
| `black-forest-labs/flux.2-max` | Flux 2 Max | create, edit |
| `black-forest-labs/flux.2-klein` | Flux 2 Klein | create, edit |

The provider prefix (`google/`, `openai/`, `black-forest-labs/`) is optional — short names like `gemini-2.5-flash-image`, `gpt-image-1`, `flux-2-dev` are also accepted. Unknown model names with `modalities: ["image"]` return `400` with the supported list.

### Civitai AIR URNs

Pass a Civitai [AIR](/orchestration/guide/air) URN as `model` to use a community checkpoint. The ecosystem segment of the AIR (`sd1`, `sdxl`, `flux1`, `anima`) selects the engine; the AIR is forwarded as the checkpoint:

```json
{
  "model": "urn:air:sdxl:checkpoint:civitai:101055@128078",
  "messages": [{ "role": "user", "content": "A cyberpunk samurai" }],
  "modalities": ["image", "text"],
  "image_config": { "aspect_ratio": "1:1", "image_size": "1K" }
}
```

| Ecosystem | Engine | Operations | Notes |
|-----------|--------|------------|-------|
| `sd1` | SD 1.5 (sd-cpp) | create, variant | Pass an input image to trigger img2img variant. |
| `sdxl` | SDXL (sd-cpp) | create, variant | Same — img2img variant when an input image is supplied. |
| `flux1` | Flux 1 (sd-cpp) | create, edit | Edit operation accepts up to 2 input images; width/height clamped to 832–1216. |
| `anima` | Anima (sd-cpp) | create | Anima checkpoints; no img2img path through chat-completions. |

Other ecosystems (`zimage`, `qwen`, `wan`, `flux2`) hardcode their checkpoints — pass the matching named model instead (e.g. `flux-2-dev`) and use the [`imageGen` workflow step](./flux2) directly when you need to override the checkpoint.

### `image_config`

| Field | Values | Effect |
|-------|--------|--------|
| `aspect_ratio` | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `21:9` | Sets width/height ratio. OpenAI engines snap to their nearest allowed size. Gemini ignores (always 1024×1024). |
| `image_size` | `0.5K`, `1K`, `2K`, `4K` | Approximate megapixel target. Engines clamp to their supported range. |
| `n` | 1–10 | Number of images. Falls back to the top-level `n`. Engines clamp to their supported max. |

For full per-engine knobs (samplers, LoRAs, guidance scales, advanced operations), use the [`imageGen` workflow step](./flux2) directly instead — chat-completions is a thin facade tuned for SDK compatibility, not a full passthrough of every engine parameter.

## Multi-turn conversations

Include prior turns as `assistant` messages to maintain context:

```json
{
  "model": "openai/gpt-4o-mini",
  "messages": [
    { "role": "system",    "content": "You are a concise assistant." },
    { "role": "user",      "content": "Write a haiku about the ocean." },
    { "role": "assistant", "content": "Waves crash endlessly,\nSalt..." },
    { "role": "user",      "content": "Now write one about mountains." }
  ],
  "temperature": 0.7
}
```

<RecipeRun :body="multiTurnBody" :wait="60" />

## Streaming

### Via `/v1/chat/completions`

Set `"stream": true` and handle Server-Sent Events (SSE). The response is a stream of `data: {...}` lines ending with `data: [DONE]`:

```http
POST https://orchestration.civitai.com/v1/chat/completions
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "model": "openai/gpt-4o-mini",
  "messages": [{ "role": "user", "content": "Tell me a short story." }],
  "stream": true
}
```

### Via workflow step

Set `stream: true` in the step `metadata` field:

```json
{
  "steps": [{
    "$type": "chatCompletion",
    "metadata": { "stream": true },
    "input": {
      "model": "openai/gpt-4o-mini",
      "messages": [{ "role": "user", "content": "Tell me a short story." }]
    }
  }]
}
```

When streaming is enabled, the orchestrator stores the raw NDJSON chunks in a streaming blob and assembles them into the standard `ChatCompletionOutput` shape for the workflow output.

## Tool use (function calling)

Define tools as JSON Schema function definitions. The model decides when and how to call them:

```json
{
  "model": "openai/gpt-4o",
  "messages": [
    { "role": "user", "content": "What is the weather in Paris?" }
  ],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get current weather for a city",
      "parameters": {
        "type": "object",
        "properties": {
          "city": { "type": "string" }
        },
        "required": ["city"]
      }
    }
  }],
  "tool_choice": "auto"
}
```

When the model calls a tool, the assistant message in the response contains a `tool_calls` array instead of (or alongside) `content`. Submit the tool result back as a `tool` message:

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "{\"temperature\": 18, \"condition\": \"sunny\"}"
}
```

## Model selection

`model` accepts any string that identifies a model on OpenRouter or a Civitai AIR URI:

| Format | Example | Notes |
|--------|---------|-------|
| OpenRouter ID | `openai/gpt-4o-mini` | Any model from [openrouter.ai/models](https://openrouter.ai/models). |
| OpenAI shorthand | `gpt-4o`, `gpt-4o-mini` | OpenRouter also accepts bare OpenAI model names. |
| AIR URI | `urn:air:llm:model:civitai:<modelId>@<versionId>` | Routes to a Civitai-hosted model. |

## Parameters reference

| Field | Default | Notes |
|-------|---------|-------|
| `model` | — ✅ | Model ID (OpenRouter) or AIR URI. |
| `messages` | — ✅ | Array of role-discriminated messages (at least 1). |
| `temperature` | `1` | 0–2. Higher = more random output. |
| `topP` | `1` | 0–1. Nucleus sampling. Alternative to `temperature`; usually set one or the other. |
| `maxTokens` | `null` | Max output tokens, 1–128 000. Unlimited when omitted. |
| `n` | `1` | Number of completions to generate, 1–128. |
| `stop` | `null` | Up to 4 stop sequences. |
| `presencePenalty` | `0` | -2 to 2. Positive values discourage repeating topics. |
| `frequencyPenalty` | `0` | -2 to 2. Positive values discourage repeating exact tokens. |
| `seed` | `null` | Integer seed for deterministic output (beta). |
| `user` | `null` | End-user identifier for abuse monitoring. |
| `logprobs` | `null` | Return log probabilities for generated tokens. |
| `topLogprobs` | `null` | 0–20. Number of top log-prob candidates per token (requires `logprobs: true`). |
| `tools` | `null` | Function definitions available to the model. |
| `tool_choice` | `null` | `"auto"`, `"none"`, `"required"`, or `{ "type": "function", "function": { "name": "..." } }`. |
| `chatTemplateKwargs` | `null` | Extra kwargs passed to the model's chat template (vLLM-specific). |
| `modalities` | `null` | Output modalities. Include `"image"` to route the request through the image-generation pipeline. See [Image generation](#image-generation). |
| `imageConfig` | `null` | Image-generation parameters (`aspect_ratio`, `image_size`, `n`). Only consulted when `modalities` includes `"image"`. |

## Messages reference

Messages are discriminated by the `role` field:

### `system`

```json
{ "role": "system", "content": "You are a helpful assistant.", "name": "optional" }
```

### `user`

Content can be a plain string or an array of content parts:

```json
{ "role": "user", "content": "Plain text" }
```

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What's in this image?" },
    { "type": "image_url", "image_url": { "url": "https://...", "detail": "auto" } }
  ]
}
```

### `assistant`

```json
{ "role": "assistant", "content": "Prior response text." }
```

Or with tool calls (as returned by the model):

```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [{
    "id": "call_abc123",
    "type": "function",
    "function": { "name": "get_weather", "arguments": "{\"city\":\"Paris\"}" }
  }]
}
```

### `tool`

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "{\"temperature\": 18}"
}
```

## Reading the result

The output is an OpenAI-compatible `chat.completion` object:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "chatCompletion",
    "status": "succeeded",
    "output": {
      "id": "chatcmpl-...",
      "object": "chat.completion",
      "created": 1748000000,
      "model": "openai/gpt-4o-mini",
      "choices": [{
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "The capital of France is Paris."
        },
        "finish_reason": "stop"
      }],
      "usage": {
        "prompt_tokens": 24,
        "completion_tokens": 9,
        "total_tokens": 33
      }
    }
  }]
}
```

The `/v1/chat/completions` endpoint returns the `output` object directly (not wrapped in a workflow envelope).

## Cost

Cost depends on whether the model routes through OpenRouter or is a Civitai AIR model.

### OpenRouter models

Cost is computed from actual token usage with a **30% margin**, converted to Buzz (1 000 Buzz = 1 USD):

```
buzzCost = actualCostUsd × 1000 × 1.3   (minimum 1 Buzz)
```

Before execution, the orchestrator estimates cost using OpenRouter's published per-token prices. After execution, the final Buzz charge is based on the tokens actually consumed by the model.

Different models have very different per-token prices — check [openrouter.ai/models](https://openrouter.ai/models) for current pricing. Representative examples:

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Typical single call |
|-------|-----------------------|------------------------|---------------------|
| `openai/gpt-4o-mini` | $0.15 | $0.60 | < 1 Buzz |
| `openai/gpt-4o` | $2.50 | $10.00 | 2–15 Buzz |
| `anthropic/claude-3-5-sonnet` | $3.00 | $15.00 | 4–20 Buzz |
| `meta-llama/llama-3.3-70b-instruct` | $0.12 | $0.30 | < 1 Buzz |

Use `whatif=true` on your first request to get an exact preview before committing.

### AIR models (Civitai-hosted)

Flat-rate pricing based on image count and number of completions requested:

```
total = 1 × (imageCount × 2) × n
```

::: warning Known limitation
For text-only requests to AIR models (`imageCount = 0`), the `images` factor collapses the product to **0 Buzz**. This is a known bug — expect it to be corrected in a future release. For now, AIR model text-only calls cost 0 Buzz.
:::

## Runtime

Most chat completions finish in 5–30 seconds depending on model and output length. Use `wait=60` for simple requests; add `wait=0` + polling for long outputs, large `n`, or slow models. The `/v1/chat/completions` endpoint waits up to 60 seconds before timing out with `504`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "messages must not be empty" | Empty `messages` array | Include at least one message. |
| `400` with "model is required" | Missing `model` field | `model` is always required. |
| `504 Gateway Timeout` (via `/v1`) | Slow model or long output | Retry with `wait=0` via `SubmitWorkflow` + polling. |
| `400` with "topLogprobs requires logprobs" | Sent `topLogprobs` without `logprobs: true` | Set `"logprobs": true` alongside `topLogprobs`. |
| Response truncated mid-sentence | `maxTokens` reached | Raise `maxTokens` or omit it to let the model decide. |
| Tool call in response instead of content | Expected behaviour | The model chose to call a tool — feed the `tool_calls` back as a `tool` message in the next turn. |
| Step `failed`, `reason = "no_provider_available"` | AIR model offline or no worker available | Retry shortly. |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — for the workflow-step path
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — production result handling
- [Prompt enhancement](./prompt-enhancement) — uses a `chatCompletion`-like step to rewrite image prompts
- [Image conversion](./convert-image) — 1-Buzz utility step to post-process generated images
