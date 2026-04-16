---
title: Prompt enhancement
---

<script setup>
const recipeBody = {
  ecosystem: 'flux1',
  prompt: 'A photo of a cat sitting on a windowsill',
};

const workflowBody = {
  steps: [{
    $type: 'promptEnhancement',
    input: {
      ecosystem: 'sdxl',
      prompt: 'anime character with sword, cool background',
    },
  }],
};

const negativeBody = {
  steps: [{
    $type: 'promptEnhancement',
    input: {
      ecosystem: 'sdxl',
      prompt: 'anime character with sword',
      negativePrompt: 'ugly, blurry',
      temperature: 0.4,
    },
  }],
};

const instructionBody = {
  steps: [{
    $type: 'promptEnhancement',
    input: {
      ecosystem: 'flux1',
      prompt: 'a dog playing frisbee',
      instruction: 'Keep it under 20 words and emphasize motion.',
    },
  }],
};

const chainBody = {
  steps: [
    {
      $type: 'promptEnhancement',
      name: 'enhance',
      input: {
        ecosystem: 'flux1',
        prompt: 'a cat astronaut in space',
      },
    },
    {
      $type: 'imageGen',
      name: 'hero',
      input: {
        engine: 'flux2',
        model: 'klein',
        operation: 'createImage',
        modelVersion: '4b',
        prompt: { $ref: 'enhance', path: 'output.enhancedPrompt' },
        width: 1024,
        height: 1024,
      },
    },
  ],
};
</script>

# Prompt enhancement

The `promptEnhancement` step type takes a user-written prompt and rewrites it for a specific image/video generation ecosystem, returning a list of detected issues, actionable recommendations, and the rewritten prompt(s). It runs an LLM under the hood and finishes in well under the synchronous-request window, which makes it one of the few recipes you can call with `wait=60` and get the full result back inline.

Common uses:

- Transform short user prompts into detailed, ecosystem-specific prompts before calling `imageGen` / `videoGen`
- Surface issues (vague subject, missing lighting, thin negative prompt) to the end user as inline suggestions
- Enforce constraints ("keep it under 77 tokens", "no adjectives", "English only") via the `instruction` field

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- An ecosystem slug matching your downstream generation step (see [Ecosystems](#ecosystems))

## The simplest request

Inline, synchronous — safe to use `wait=60` since the LLM call typically finishes in a few seconds:

```http
POST https://orchestration.civitai.com/v2/consumer/recipes/promptEnhancement?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "ecosystem": "flux1",
  "prompt": "A photo of a cat sitting on a windowsill"
}
```

<RecipeRun :body="recipeBody" path="/v2/consumer/recipes/promptEnhancement" :wait="60" />

The per-recipe endpoint unwraps the response and returns the step output directly (a `PromptEnhancementOutput` with `issues`, `recommendations`, `enhancedPrompt`, and optionally `enhancedNegativePrompt`).

## Via the generic workflow endpoint

Use this path for webhooks, tags, or to chain into another step like `imageGen`:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "promptEnhancement",
    "input": {
      "ecosystem": "sdxl",
      "prompt": "anime character with sword, cool background"
    }
  }]
}
```

<RecipeRun :body="workflowBody" :wait="60" />

## Input fields

See the [`PromptEnhancementInput` schema](/orchestration/reference/operations/InvokePromptEnhancementStepTemplate) for the full definition.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `ecosystem` | ✅ | — | Target ecosystem slug, e.g. `"flux1"`, `"sdxl"`, `"sd1"`, `"ltx2"`. Drives the enhancement style (booru-style tags for SD1/SDXL, natural-language descriptions for Flux, motion cues for video). |
| `prompt` | ✅ | — | The user's original prompt. Non-empty string. |
| `negativePrompt` | | — | Optional. If present, the response also includes `enhancedNegativePrompt`. Most useful on SD1/SDXL where negative prompts carry weight; often unnecessary on Flux/video. |
| `temperature` | | `0.7` | LLM temperature, `0.0`–`1.0`. Lower for conservative rewrites, higher for more creative variation. |
| `instruction` | | — | Optional free-text directive shaping the rewrite (`"keep it under 20 words"`, `"add cinematic lighting cues"`, `"translate to English first"`). Short, specific directives work best. |

## Ecosystems

Most generative ecosystems exposed by the orchestrator have a registered prompt-enhancement template — pass the same slug you'd use on the downstream `imageGen` / `videoGen` step (e.g. `sd1`, `sdxl`, `flux1`, `ltx2`). The template drives the rewrite style — Booru-style tag soup for SD1/SDXL, natural-language sentences for Flux, motion-aware prompts for video ecosystems. An unknown slug falls through to a generic LLM rewrite without a 400, so output quality on unsupported slugs is best-effort rather than a hard error.

## Using `instruction`

`instruction` is a free-text directive the enhancer treats as the primary constraint. Use it to force length limits, style edicts, or translation passes:

```json
{
  "ecosystem": "flux1",
  "prompt": "a dog playing frisbee",
  "instruction": "Keep it under 20 words and emphasize motion."
}
```

<RecipeRun :body="instructionBody" :wait="60" />

A live run against prod with that input returned:

> *"A golden retriever leaping dynamically mid-air to catch a flying frisbee, sharp motion-blurred action shot."* (19 words)

## Enhancing both prompt and negative prompt

When `negativePrompt` is present, the response includes an `enhancedNegativePrompt` tuned to the same ecosystem. Particularly useful for SD1/SDXL where negatives meaningfully steer generations:

```json
{
  "ecosystem": "sdxl",
  "prompt": "anime character with sword",
  "negativePrompt": "ugly, blurry",
  "temperature": 0.4
}
```

<RecipeRun :body="negativeBody" :wait="60" />

Response (from a live run):

```json
{
  "issues": [
    { "description": "Prompt is extremely vague …", "severity": "error" },
    { "description": "Missing quality boosters …",  "severity": "warning" },
    { "description": "Negative prompt is too minimal …", "severity": "warning" }
  ],
  "recommendations": [
    "Prepend quality tags like 'masterpiece, best quality, highly detailed' …",
    "Specify character details (gender, expression, attire), pose, and scene …",
    "Enhance negative prompt with targeted tags for anatomy errors and artifacts."
  ],
  "enhancedPrompt": "masterpiece, best quality, highly detailed, sharp focus, anime style, solo character, heroic pose, wielding large ornate sword, dynamic action stance, …",
  "enhancedNegativePrompt": "low quality, blurry, ugly, deformed, mutated hands, extra limbs, extra fingers, poorly drawn face, bad anatomy, watermark, text, signature, lowres, jpeg artifacts"
}
```

## Chaining: enhance, then generate

The highest-leverage pattern is to drop `promptEnhancement` in front of an `imageGen` / `videoGen` step and feed the enhanced prompt through a `$ref`:

```json
{
  "steps": [
    {
      "$type": "promptEnhancement",
      "name": "enhance",
      "input": {
        "ecosystem": "flux1",
        "prompt": "a cat astronaut in space"
      }
    },
    {
      "$type": "imageGen",
      "name": "hero",
      "input": {
        "engine": "flux2",
        "model": "klein",
        "operation": "createImage",
        "modelVersion": "4b",
        "prompt": { "$ref": "enhance", "path": "output.enhancedPrompt" },
        "width": 1024,
        "height": 1024
      }
    }
  ]
}
```

The `{ "$ref": "enhance", "path": "output.enhancedPrompt" }` reference creates a dependency — `hero` doesn't start until `enhance` succeeds, and its `prompt` field is filled in with the rewritten text at runtime. See [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism).

<RecipeRun :body="chainBody" />

Match the `ecosystem` on `promptEnhancement` to the downstream model family — `flux1` for Flux, `sdxl` for SDXL, etc. Mismatches yield rewrites that technically parse but lose their edge (e.g. Booru tags in a Flux call, or natural-language sentences in an SDXL call).

## Reading the result

A successful `promptEnhancement` step emits analysis + rewrites:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "promptEnhancement",
    "status": "succeeded",
    "output": {
      "issues": [
        {
          "description": "Prompt is overly generic and vague, lacking details on the cat's appearance …",
          "severity": "warning"
        }
      ],
      "recommendations": [
        "Add descriptive details to the cat (e.g., breed, color, pose) …",
        "Specify lighting, such as 'warm sunlight streaming through the window' …"
      ],
      "enhancedPrompt": "A fluffy tabby cat sitting contentedly on a wooden windowsill …, photorealistic photo, warm golden sunlight streaming through the window …",
      "enhancedNegativePrompt": null
    }
  }]
}
```

Fields:

- **`issues[]`** — each entry has `description` plus `severity` (`"info"`, `"warning"`, or `"error"`). Good for surfacing in a UI as a bulleted list.
- **`recommendations[]`** — actionable plain-text suggestions. Each is a complete sentence.
- **`enhancedPrompt`** — the rewritten prompt, ready to feed back into `imageGen` / `videoGen`.
- **`enhancedNegativePrompt`** — populated only when the input included a `negativePrompt`.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Flat-rate:

```
total = 1 Buzz per call
```

That's it — prompt length, ecosystem, `temperature`, `instruction`, and whether you pass a `negativePrompt` all leave the price unchanged. Prompt enhancement is the cheapest step Civitai exposes; drop it in front of expensive generation steps without worrying about the overhead.

## Runtime

LLM-backed, usually 2–10 s per call including queue wait. Safe to use `wait=60` (or even `wait=30`) and get the result inline. Cost is a flat base of 1.0 per call regardless of prompt length — unlike generative steps, there's no per-pixel or per-second multiplier.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "prompt" validation error | Empty or missing `prompt` | Always include a non-empty `prompt`; `minLength: 1` is enforced. |
| `400` with "temperature out of range" | Value outside `0.0`–`1.0` | Clamp client-side; leave unset to accept `0.7`. |
| Output doesn't match the ecosystem style (e.g. Flux-style prose on an SD1 request) | Unknown `ecosystem` slug falling through to a generic template | Use the same slug as the downstream generation step, and verify the spelling. |
| `instruction` not respected | Instruction too long, contradictory, or buried in prose | Keep it to one short directive. "Under 20 words" beats a paragraph. |
| `enhancedNegativePrompt` is `null` | No `negativePrompt` was sent | Include a `negativePrompt` in the input if you need one back. |
| Request timed out (`wait` expired) | Rare — the LLM call shouldn't take >10 s on a warm node | Resubmit with `wait=0` and poll, or retry once. |

## Related

- [`InvokePromptEnhancementStepTemplate`](/orchestration/reference/operations/InvokePromptEnhancementStepTemplate) — the per-recipe endpoint
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/promptEnhancement/openapi.yaml) — standalone OpenAPI 3.1 YAML for this endpoint, ready to import into Postman / Insomnia / OpenAPI Generator
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — generic path for chaining
- [Flux 2](./flux2) / [Flux 1](./flux1) image generation, [WAN video generation](./wan), [LTX2 video generation](./ltx2) — downstream generation recipes that take the rewritten prompt
- [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism) — feeding `output.enhancedPrompt` through `$ref`
