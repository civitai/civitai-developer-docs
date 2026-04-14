---
title: ACE-Step music generation
---

<script setup>
const defaultBody = {
  steps: [{
    $type: 'aceStepAudio',
    input: {
      musicDescription: 'Neo-Soul: A warm, organic neo-soul track with smooth Rhodes chords, mellow bass, and gentle drums.',
      lyrics: '[Verse 1]\nSunlight breaks through the morning haze\nCoffee steam rising, starting the day\n\n[Chorus]\nThis is the rhythm of my life\nSimple moments, pure delight',
      duration: 30,
      bpm: 95,
      key: 'D major',
      language: 'en',
    },
  }],
};

const xlTurboBody = {
  steps: [{
    $type: 'aceStepAudio',
    input: {
      musicDescription: 'Cinematic Orchestral: Sweeping strings, bold brass, and thundering percussion.',
      lyrics: '',
      duration: 30,
      bpm: 110,
      key: 'D minor',
      instrumentalWeight: 1.0,
      vocalWeight: 0.0,
      diffusionModel: 'urn:air:ace:checkpoint:huggingface:Comfy-Org/ace_step_1.5_ComfyUI_files@main/split_files/diffusion_models/acestep_v1.5_xl_turbo_bf16.safetensors',
    },
  }],
};

const baseQualityBody = {
  steps: [{
    $type: 'aceStepAudio',
    input: {
      musicDescription: 'Jazz: Smoky late-night jazz with brush drums, upright bass, and a lilting tenor sax.',
      lyrics: '',
      duration: 30,
      bpm: 90,
      key: 'Bb major',
      instrumentalWeight: 1.0,
      vocalWeight: 0.0,
      steps: 50,
      cfg: 4.0,
      diffusionModel: 'urn:air:ace:checkpoint:huggingface:Comfy-Org/ace_step_1.5_ComfyUI_files@main/split_files/diffusion_models/acestep_v1.5_base.safetensors',
    },
  }],
};
</script>

# ACE-Step music generation

[ACE-Step](https://github.com/ace-step/ACE-Step-1.5) is an open text-to-music model that generates full songs from a style description and optional structured lyrics. The orchestrator exposes it through a single `aceStepAudio` step, running on Civitai's ComfyUI workers.

Output is an MP3 by default. Attach a cover image and you get a WebM video with the cover as a still background instead.

## Variants

ACE-Step 1.5 ships as split files — a diffusion model (unet), a shared text encoder (CLIP), and a shared VAE. The step exposes all three as separate overrides; the text encoder and VAE are the same for every variant, so in practice you only change `diffusionModel`.

| Variant | Params | Recommended `steps` | Recommended `cfg` | `diffusionModel` |
|---|---|---|---|---|
| **1.5 Turbo** *(default)* | 2B | `8` | `1.0` | `urn:air:ace:checkpoint:huggingface:Comfy-Org/ace_step_1.5_ComfyUI_files@main/split_files/diffusion_models/acestep_v1.5_turbo.safetensors` |
| 1.5 Base | 2B | `50` | `~4` | `…/diffusion_models/acestep_v1.5_base.safetensors` |
| 1.5 XL Turbo | 4B | `8` | `1.0` | `…/diffusion_models/acestep_v1.5_xl_turbo_bf16.safetensors` |
| 1.5 XL Base | 4B | `50` | `~4` | `…/diffusion_models/acestep_v1.5_xl_base_bf16.safetensors` |
| 1.5 XL SFT | 4B | `50` | `~4` | `…/diffusion_models/acestep_v1.5_xl_sft_bf16.safetensors` |

The XL (4B) variants trade VRAM for quality. Turbo variants use 8 sampling steps with CFG off (cfg ≈ 1.0); base/sft use 50 steps with CFG on.

## The request shape

Every request is a single `aceStepAudio` step on [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow):

```json
{
  "$type": "aceStepAudio",
  "input": {
    "musicDescription": "Neo-Soul: A warm, organic neo-soul track...",
    "lyrics": "[Verse 1]\nSunlight breaks through...",
    "duration": 30,
    "bpm": 95,
    "key": "D major",
    "language": "en"
  }
}
```

All fields except `musicDescription` and `lyrics` have defaults.

### Default model (1.5 Turbo, 2B)

<RecipeRun :body="defaultBody" />

### Switching the diffusion model

Set `diffusionModel` to any of the AIRs in the variant table above. The shared text encoder (`clipModel`) and VAE (`vaeModel`) fall back to their defaults — don't override them unless you know what you're doing.

```json
{
  "$type": "aceStepAudio",
  "input": {
    "musicDescription": "Cinematic Orchestral: Sweeping strings, bold brass...",
    "duration": 30,
    "bpm": 110,
    "diffusionModel": "urn:air:ace:checkpoint:huggingface:Comfy-Org/ace_step_1.5_ComfyUI_files@main/split_files/diffusion_models/acestep_v1.5_xl_turbo_bf16.safetensors"
  }
}
```

<RecipeRun :body="xlTurboBody" />

### High-quality (non-turbo) variants

Base / SFT variants need more sampling steps (`steps: 50`) and CFG turned on (`cfg: 4.0`). Turbo defaults won't give usable output on these.

<RecipeRun :body="baseQualityBody" />

## Parameters

| Field | Default | Notes |
|---|---|---|
| `musicDescription` | — *(required)* | Style / genre description. Prefix with a genre label ("Neo-Soul:", "Jazz:", etc.) for best results. |
| `lyrics` | — *(required)* | Structured lyrics with `[Verse]`, `[Chorus]`, `[Bridge]` markers. Empty string for instrumentals. |
| `duration` | `60` | Seconds, `1`–`190`. |
| `bpm` | `120` | `40`–`200`. |
| `timeSignature` | `"4"` | Beats per measure. |
| `language` | `"en"` | `en`, `zh`, `ja`, `ko`, … |
| `key` | `"C major"` | Musical key ("E minor", "Bb major"). |
| `instrumentalWeight` | `0.85` | `0.0`–`1.0`. Raise for instrumentals. |
| `vocalWeight` | `0.9` | `0.0`–`1.0`. Drop to `0.0` for pure instrumentals. |
| `steps` | `8` | Sampling steps. `8` for turbo variants, `50` for base/sft. |
| `cfg` | `1.0` | Classifier-free guidance. `1.0` for turbo, `~4.0` for base/sft. |
| `seed` | `0` | Fixed seed for reproducibility. |
| `diffusionModel` | 1.5 Turbo (2B) | AIR override; see variant table. |
| `clipModel` | `qwen_4b_ace15` | Shared across all variants — leave unset. |
| `vaeModel` | `ace_1.5_vae` | Shared across all variants — leave unset. |
| `cover.imageUrl` | *(none)* | Attach a 512×512 image to produce a WebM video instead of MP3. |

## Reading the result

Audio-only runs emit a single MP3 blob:

```json
{
  "id": "wf_01HXYZ…",
  "status": "succeeded",
  "steps": [{
    "$type": "aceStepAudio",
    "status": "succeeded",
    "output": {
      "blob": { "id": "blob_…", "url": "https://…/signed.mp3", "duration": 30 }
    }
  }]
}
```

With a cover image, `blob` is a `VideoBlob` (WebM) instead.

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL.

## Long-running jobs

Non-turbo (50-step) variants, especially XL/4B, can run longer than the 100 s request timeout. Use webhooks or polling — see [Results & webhooks](/orchestration/guide/results-and-webhooks).

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- Full parameter catalog: `AceStepAudioInput` in the [API reference](/orchestration/reference/)
