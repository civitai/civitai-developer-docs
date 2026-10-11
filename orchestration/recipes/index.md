---
title: Recipes
---

# Recipes

Task-oriented, end-to-end examples. Each recipe walks through a real workflow: what to send, what you get back, common parameter tweaks, and troubleshooting.

::: tip Not the same as App Blocks recipes
These are **Orchestration REST API** recipes — you hold a Bearer token and POST workflows to `orchestration.civitai.com` yourself. Not to be confused with **App Blocks [`customComfy` recipes](/apps/guide/comfy-cloud)**, which are server-registered ComfyUI workflows a sandboxed _block_ invokes by id through the host bridge (the block never calls the orchestrator directly).
:::

## Video

- [WAN video generation](./wan) — all WAN versions (2.1–3.0) across FAL, Comfy, Civitai, and Alibaba, with text-to-video, image-to-video, reference-to-video, and edit-video operations
- [LTX2 video generation](./ltx2) — Lightricks LTX2 and LTX2.3 on Comfy, including the new videoToVideo (style transfer) and audioToVideo (talking-head) operations
- [Kling video generation](./kling) — Kuaishou Kling (v1/v1.5/v1.6/v2/v2.5-turbo with camera control) and Kling V3 (5 operations, multi-prompt, audio, video-to-video)
- [Vidu video generation](./vidu) — Vidu 2.0 (flat 600 Buzz, anime style, first-last-frame), Vidu Q3 (per-second pricing, 4 resolution tiers, turbo mode, native audio) and Vidu Q4 via FAL (image- and reference-to-video, up to 4K)
- [Veo 3 video generation](./veo3) — Google Veo 3.0/3.1 in standard / fast / lite tiers; operation inferred from image count; optional synchronized audio track
- [Gemini Omni video generation](./gemini-omni) — Google Gemini Omni 1.1 Flash; 360p–4K with audio, up to 6 reference images; billed on the seconds actually delivered
- [MiniMax H3 video generation](./minimax-h3) — MiniMax's native H3 model at 2K; text-to-video, first/last-frame, and reference-to-video with up to 9 reference images plus 3 videos and 3 audio clips
- [Seedance video generation](./seedance) — ByteDance Seedance direct on BytePlus; v2 / v2-fast / v2-mini up to 15 s and 1080p, or v2.5 for 30 s single-shot and a 50-asset reference budget
- [Grok video generation](./grok-video) — xAI Grok-Imagine-Video via FAL; text-to-video, image-to-video, and edit-video with 480p/720p output
- [FLUX-3 video generation](./flux3-video) — Black Forest Labs FLUX-3 via FAL; text / image / first-last-frame / keyframes / extend plus draftEnhance, 720p–1080p with synchronized audio and a cheap draft-then-enhance loop
- [Happy-Horse video generation](./happy-horse) — Alibaba Happy-Horse via FAL; text-to-video, image-to-video, video editing, and up to 9 character references
- [HunyuanVideo generation](./hunyuan) — Tencent HunyuanVideo on Comfy workers; text-to-video with LoRA support; compute-intensive, always use `wait=0`
- [Video upscaling](./video-upscaler) — FlashVSR, 2–4× with a 2560 px output cap
- [Video frame interpolation](./video-interpolation) — VFIMamba, 2× or 3× frame-count, smooths generated or low-FPS footage
- [Compose media (video)](./compose-media-video) — overlay/stack videos on a canvas, place audio over a clip, picture-in-picture; the video form of `composeMedia`

## Image

- [Flux 2 image generation](./flux2) — Flux.2 Klein (default, cheap + capable, 4b/9b, supports createVariant) plus Dev / Flex / Pro / Max for higher-fidelity and commercial tiers
- [Flux 1 image generation](./flux1) — Flux.1 through sdcpp (default, minimal required input) or Comfy, plus the BFL-hosted `flux1-kontext` editing tier
- [Z-Image generation](./zimage) — lightweight text-to-image on sdcpp; `turbo` (default, distilled, extremely fast + cheap) or `base` when you need more fidelity
- [Qwen image generation](./qwen) — Qwen-Image 20B on sdcpp (default), the Alibaba-hosted catalog (`engine: "qwen"`), or Qwen2 under a FAL-shaped request with a Pro tier; supports createImage + createVariant + editImage
- [MAI Image 2.5 image generation](./mai-image) — Microsoft MAI Image 2.5 via FAL; text-to-image only, eleven aspect ratios (incl. `auto`), flat per-image pricing
- [Anima image generation](./anima) — anime-tuned sdcpp ecosystem with built-in diffuser, LoRA support, createImage only
- [ERNIE image generation](./ernie) — Baidu ERNIE Image on Comfy; `ernie` standard + `turbo` distilled variant, built-in diffuser, LoRA support, createImage only
- [SDXL image generation](./sdxl) — Stable Diffusion XL at 1024² native via sdcpp (default) or Comfy, with createImage + createVariant
- [SD1 image generation](./sd1) — classic Stable Diffusion 1.5 at 512² via sdcpp (default) or Comfy, with createImage + createVariant
- [OpenAI image generation](./openai) — GPT-Image 2 (default) / 1.5 / 1 and DALL·E 2 / 3 via OpenAI's hosted API
- [Google image generation](./google) — Imagen 4 and Nano Banana Pro / 2 / 2 Lite via Vertex AI, with editing + web-search grounding
- [Krea v2 image generation](./krea) — Krea v2 medium and large tiers via FAL, text-to-image
- [Gemini image generation](./gemini) — Gemini 2.5 Flash Image (same product as Nano Banana) via the direct Gemini API
- [Seedream image generation](./seedream) — ByteDance Seedream v3 / v4 / v4.5 / v5.0-lite with native up-to-4096 output + editing
- [Grok image generation](./grok) — xAI Grok with wide aspect-ratio menu (21 options) + editing
- [WAN image generation](./wan-image) — WAN v2.2 / v2.2-5b / v2.5 / v2.7 via FAL (image counterpart to the WAN video recipe)
- [Image upscaling](./image-upscaler) — ESRGAN-family upscalers, chain after `imageGen` or use standalone

## 3D

- [3D model generation](./3d) — text or image → 3D; Hunyuan3D on Civitai's Comfy workers (image-only, most control, cheapest — from 60 Buzz), Meshy v6 via FAL (text + image, rigging + animation, flat 1040 Buzz), and Tripo v2.5 via FAL (image-only, HD/PBR, quad topology, from 260 Buzz)

## Audio

- [Transcription](./transcription) — Qwen3-ASR, multilingual, word-level timestamps for captioning
- [Text-to-speech](./text-to-speech) — built-in speakers with optional style prompt, or voice cloning from a reference clip
- [Multi-speaker dialogue](./multi-speaker-dialogue) — overlay TTS clips on a shared timeline for debate, interview, or audio-drama scenes; the audio form of `composeMedia`
- [ACE-Step music generation](./ace-step-audio) — full songs from a style description + structured lyrics, 2B turbo default with optional 4B XL overrides; audio-only MP3 or MP4 with a still cover image

## Language models

- [Chat completion](./chat-completion) — any OpenRouter model or Civitai AIR model, vision inputs, tool use, streaming, image generation via `modalities: ["image"]`; OpenAI-compatible `/v1/chat/completions` endpoint or workflow step

## Utilities

- [Prompt enhancement](./prompt-enhancement) — LLM rewrites a user prompt for a target ecosystem (Flux / SDXL / SD1 / LTX2), returns issues + recommendations + enhanced prompt
- [Image conversion](./convert-image) — format conversion (JPEG / PNG / WebP / GIF), resize, and region blur; flat 1 Buzz
- [Image background removal](./image-background-removal) — BiRefNet subject cutout with a transparent background; PNG or WebP output, ~6 Buzz
- [Web search](./web-search) — SearXNG-backed web search with optional inline page scraping; results feed `repeat`/`$ref` composition or ground LLM answers
- [Web scrape](./web-scrape) — fetch and render a single page (headless browser) to LLM-ready markdown, HTML, or links

## Training

Train a LoRA on your own dataset using AI Toolkit. You control training length with `steps`, the number of saved checkpoints with `epochs`, and can resume from an existing LoRA with `continueFrom`. All training runs are async — submit with `wait=0`. Cost is `steps × costPerStep + epochs × a per-epoch surcharge` with an 80%-of-default floor (rates vary per ecosystem).

- [LoRA training overview](./training) — what every ecosystem shares: parameters, training data (zip or uploaded blobs), continuing a run, live `trace` logs, the cost formula
- [SDXL & SD1 LoRA training](./training-sdxl-sd1) — classic Stable Diffusion ecosystems (500 Buzz default); cheapest pick for first fine-tunes
- [Flux 1 LoRA training](./training-flux1) — Flux.1 Dev or Schnell (2000 Buzz default); higher quality, fixed BFL base checkpoints
- [Flux 2 Klein LoRA training](./training-flux2-klein) — Flux 2 Klein 4b / 9b (500 / 1000 Buzz default), including image-edit training mode with control reference images
- [Wan video LoRA training](./training-wan) — preview ecosystem for Wan 2.1 / 2.2 video LoRAs (3000 Buzz default)
- [LTX2 video LoRA training](./training-ltx2) — Lightricks LTX2 and LTX 2.3 video LoRAs (2750 Buzz default, 3000-step runs)
- [Chroma / ERNIE / Qwen / Z-Image LoRA training](./training-other-image) — five smaller image ecosystems consolidated into one page; each section is independently runnable

::: tip Copy-paste runnable
All recipes target `https://orchestration.civitai.com` and use `<your-token>` as a placeholder for your Bearer token — an orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites)). Drop them into curl, HTTPie, VS Code's REST Client, or any tool that speaks HTTP.
:::

## Common to every recipe

Each recipe page documents only what is specific to it. This section covers what they all share.

### Reading results {#reading-results}

A result arrives in the workflow envelope that [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) returns or a [webhook](/orchestration/guide/results-and-webhooks) delivers. Most generation recipes emit one of two output shapes.

`imageGen` emits an `images[]` array, one entry per `quantity`. `nsfwLevel` carries the moderation classification applied to the output:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "imageGen",
    "status": "succeeded",
    "output": {
      "images": [
        {
          "id": "aa6e7228-68cd-4d15-b4d7-5005b2bfbac6-0.jpg",
          "width": 1024,
          "height": 1024,
          "url": "https://orchestration.civitai.com/v2/consumer/blobs/…?sig=…",
          "urlExpiresAt": "2027-04-15T17:18:54.3195353Z",
          "previewUrl": "https://orchestration.civitai.com/v2/consumer/blobs/…?sig=…",
          "previewUrlExpiresAt": "2027-04-15T17:18:54.3196735Z",
          "available": true,
          "nsfwLevel": "pg13"
        }
      ],
      "errors": []
    }
  }]
}
```

`videoGen` emits a single `video` blob:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "videoGen",
    "status": "succeeded",
    "output": {
      "video": { "id": "blob_...", "url": "https://.../signed.mp4" }
    }
  }]
}
```

Blob URLs (`url`, `previewUrl`) are signed and expire. Refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL rather than caching one, and download the bytes if you need to keep them — see [Blobs in results](/orchestration/guide/results-and-webhooks#blobs-in-results).

### Cost

Recipes bill in Buzz, recorded on the workflow's `transactions`. Submit with `whatif=true` to preview the exact charge without running anything; [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) covers currency selection.

### Troubleshooting {#common-troubleshooting}

These apply to every recipe; each page's own table covers the rest.

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Request timed out (`wait` expired), or `202` with a non-terminal status | The job outlasted the [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline) — typically a large `quantity`, large or atypical dimensions, high `steps`, a premium tier, or a busy provider queue | Resubmit with `wait=0` and poll [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow), or register a [webhook](/orchestration/guide/results-and-webhooks). |
| Step `failed`, `reason = "blocked"` | The prompt or an input hit content moderation (the provider's filter or Civitai's) | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |
| Blob URL `403` after a few minutes | The signed URL expired | Refetch the workflow, or call [`GetBlob`](/orchestration/reference/operations/GetBlob), for a fresh URL. |

### OpenAPI specs

Each per-recipe endpoint publishes a standalone OpenAPI 3.1 YAML at `https://orchestration.civitai.com/v2/consumer/recipes/<recipe>/openapi.yaml` (for example [`imageGen`](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml)), ready to import into Postman, Insomnia or OpenAPI Generator. Each recipe's Related section links its own.
