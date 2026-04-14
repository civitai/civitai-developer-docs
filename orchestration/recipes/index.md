---
title: Recipes
---

# Recipes

Task-oriented, end-to-end examples. Each recipe walks through a real workflow: what to send, what you get back, common parameter tweaks, and troubleshooting.

## Video

- [WAN video generation](./wan) — all WAN versions (2.1–2.7) across FAL, Comfy, and Civitai, with text-to-video, image-to-video, reference-to-video, and edit-video operations
- [LTX2 video generation](./ltx2) — Lightricks LTX2 and LTX2.3 on Comfy, including the new videoToVideo (style transfer) and audioToVideo (talking-head) operations
- [Video upscaling](./video-upscaler) — FlashVSR, 2–4× with a 2560 px output cap
- [Video frame interpolation](./video-interpolation) — VFIMamba, 2× or 3× frame-count, smooths generated or low-FPS footage

## Image

- [Flux 2 image generation](./flux2) — Flux.2 Klein (default, cheap + capable, 4b/9b, supports createVariant) plus Dev / Flex / Pro / Max for higher-fidelity and commercial tiers
- [Flux 1 image generation](./flux1) — Flux.1 through sdcpp (default, minimal required input) or Comfy, plus the BFL-hosted `flux1-kontext` editing tier
- [Z-Image generation](./zimage) — lightweight text-to-image on sdcpp; `turbo` (default, distilled, extremely fast + cheap) or `base` when you need more fidelity
- [Qwen image generation](./qwen) — Qwen-Image 20B on sdcpp (default) or FAL-hosted Qwen2 with a Pro tier; supports createImage + createVariant + editImage
- [Anima image generation](./anima) — anime-tuned sdcpp ecosystem with built-in diffuser, LoRA support, createImage only
- [SDXL image generation](./sdxl) — Stable Diffusion XL at 1024² native via sdcpp (default) or Comfy, with createImage + createVariant
- [SD1 image generation](./sd1) — classic Stable Diffusion 1.5 at 512² via sdcpp (default) or Comfy, with createImage + createVariant
- [OpenAI image generation](./openai) — GPT-Image 1 / 1.5 and DALL·E 2 / 3 via OpenAI's hosted API
- [Google image generation](./google) — Imagen 4 and Nano Banana Pro / 2 via Vertex AI, with editing + web-search grounding
- [Gemini image generation](./gemini) — Gemini 2.5 Flash Image (same product as Nano Banana) via the direct Gemini API
- [Seedream image generation](./seedream) — ByteDance Seedream v3 / v4 / v4.5 / v5.0-lite with native up-to-4096 output + editing
- [Grok image generation](./grok) — xAI Grok with wide aspect-ratio menu (21 options) + editing
- [WAN image generation](./wan-image) — WAN v2.2 / v2.2-5b / v2.5 / v2.7 via FAL (image counterpart to the WAN video recipe)
- [Image upscaling](./image-upscaler) — ESRGAN-family upscalers, chain after `imageGen` or use standalone

## Audio

- [Transcription](./transcription) — Qwen3-ASR, multilingual, word-level timestamps for captioning
- [Text-to-speech](./text-to-speech) — built-in speakers with optional style prompt, or voice cloning from a reference clip
- [ACE-Step music generation](./ace-step-audio) — full songs from a style description + structured lyrics, 2B turbo default with optional 4B XL overrides; audio-only MP3 or MP4 with a still cover image

## Other

- [Prompt enhancement](./prompt-enhancement) — LLM rewrites a user prompt for a target ecosystem (Flux / SDXL / SD1 / LTX2), returns issues + recommendations + enhanced prompt

::: tip Copy-paste runnable
All recipes target `https://orchestration.civitai.com` and use `<your-token>` as a placeholder for your Bearer token. Drop them into curl, HTTPie, VS Code's REST Client, or any tool that speaks HTTP.
:::
