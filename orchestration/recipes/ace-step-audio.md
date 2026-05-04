---
title: ACE-Step music generation
---

<script setup>
const coverImageUrl = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/07f78344-e165-4e96-8340-caf0e562f070/anim=false,width=450,optimized=true/1.jpeg';

const defaultBody = {
  steps: [{
    $type: 'aceStepAudio',
    input: {
      musicDescription: 'Neo-Soul: A warm, organic neo-soul track with smooth Rhodes chords, mellow bass, and gentle drums. Soulful and introspective mood.',
      lyrics: '[Verse 1]\nSunlight breaks through the morning haze\nCoffee steam rising, starting the day\n\n[Chorus]\nThis is the rhythm of my life\nSimple moments, pure delight',
      duration: 30,
      bpm: 95,
      key: 'D major',
      language: 'en',
      seed: 12345,
    },
  }],
};

const instrumentalBody = {
  steps: [{
    $type: 'aceStepAudio',
    input: {
      musicDescription: 'Lo-Fi Hip Hop: A chill, relaxing lo-fi beat with dusty samples, soft piano, and mellow drums.',
      lyrics: '',
      duration: 60,
      bpm: 85,
      key: 'A minor',
      instrumentalWeight: 1.0,
      vocalWeight: 0.0,
      seed: 7,
    },
  }],
};

const coverBody = {
  steps: [{
    $type: 'aceStepAudio',
    input: {
      musicDescription: 'Rock: A driving rock track with powerful guitars and thundering drums.',
      lyrics: '[Intro]\n[Verse]\nBreaking through the walls tonight\nNothing is gonna stop this fight',
      duration: 30,
      bpm: 140,
      key: 'E minor',
      seed: 42,
      cover: {
        imageUrl: coverImageUrl,
      },
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
      seed: 3,
      model: 'urn:air:ace:checkpoint:civitai:2549270@2864949',
    },
  }],
};
</script>

# ACE-Step music generation

[ACE-Step 1.5](https://github.com/ace-step/ACE-Step) is an open text-to-music model that produces full songs from a style description plus structured lyrics. The orchestrator exposes it through a single `aceStepAudio` step, which runs on Civitai's ComfyUI workers. The default checkpoint is the 2B turbo model (`ace_step_1.5_turbo_aio.safetensors`) — an eight-step distillation that generates a 30-second song in ~10 s of worker time.

Without a cover image the step emits an MP3 audio blob. Attach `cover.imageUrl` and the output is an MP4 video with that image as the still background, sized 512×512.

## Variants

There's one step type and one invocation path; the only variant axis is the optional `model` override, which swaps the underlying diffusion checkpoint.

All values come from Comfy-Org's [`ace_step_1.5_ComfyUI_files`](https://huggingface.co/Comfy-Org/ace_step_1.5_ComfyUI_files) HuggingFace bundle. The default (unset) is the 2B turbo all-in-one checkpoint.

| `model` | Variant | Params | `steps` | `cfg` | Best for |
|---|---|---|---|---|---|
| *(unset)* | `urn:air:ace:checkpoint:huggingface:Comfy-Org/ace_step_1.5_ComfyUI_files@main/checkpoints/ace_step_1.5_turbo_aio.safetensors` | 2B turbo (AIO) | `8` | `1.0` | **Default** — single all-in-one file; fastest path. |
| 2B turbo | `urn:air:ace:checkpoint:civitai:2549270@2864880` | 2B | `8` | `1.0` | Split-file equivalent of the default AIO. Prefer the AIO unless you're already pulling split files. |
| 2B base | `urn:air:ace:checkpoint:civitai:2549270@2864864` | 2B | `50` | `~4` | Non-turbo 2B base — higher fidelity than turbo at the cost of sampling time. |
| XL turbo | `urn:air:ace:checkpoint:civitai:2549270@2864949` | 4B | `8` | `1.0` | More fidelity at turbo speed. Higher VRAM; slower first-submission while the worker pulls the split files. |
| XL base | `urn:air:ace:checkpoint:civitai:2549270@2864892` | 4B | `50` | `~4` | Highest-fidelity base 4B. Non-turbo; typically slowest. |
| XL SFT | `urn:air:ace:checkpoint:civitai:2549270@2864917` | 4B | `50` | `~4` | Supervised-fine-tuned 4B; sibling of XL base with the same runtime characteristics. |

Turbo variants are distilled to converge in 8 steps with CFG effectively off (`1.0`). Non-turbo base / SFT variants expect the full 50-step schedule with classifier-free guidance on (around `4`) — submitting them with the default `steps: 8` / `cfg: 1.0` produces underbaked output.

**Default choice for new integrations**: omit `model` entirely. The 2B turbo AIO file is the default and is what Civitai's workers are consistently warm on. Reach for an XL split-file override only when the default fidelity isn't enough and you can tolerate a slow first-submission while the worker pulls the additional files.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A `musicDescription` — a short, genre-prefixed style blurb (e.g. `"Neo-Soul: warm Rhodes, brush kit, introspective"`)
- A `lyrics` string — structured with section markers (`[Verse]`, `[Chorus]`, `[Bridge]`, …). Use `""` for pure instrumentals (and set `vocalWeight: 0.0` / `instrumentalWeight: 1.0`)
- A `seed` — any integer; same seed + same input reproduces the track deterministically

## Default (2B turbo, audio-only)

The default path — no `model` override, no cover. Output is an MP3 blob.

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "aceStepAudio",
    "input": {
      "musicDescription": "Neo-Soul: A warm, organic neo-soul track with smooth Rhodes chords, mellow bass, and gentle drums. Soulful and introspective mood.",
      "lyrics": "[Verse 1]\nSunlight breaks through the morning haze\nCoffee steam rising, starting the day\n\n[Chorus]\nThis is the rhythm of my life\nSimple moments, pure delight",
      "duration": 30,
      "bpm": 95,
      "key": "D major",
      "language": "en",
      "seed": 12345
    }
  }]
}
```

<RecipeRun :body="defaultBody" :wait="60" />

## Instrumental (no vocals)

Drop vocals by pairing an empty `lyrics` string with `vocalWeight: 0.0` and `instrumentalWeight: 1.0`. The model still needs both fields — an empty `lyrics` with the default `vocalWeight` of 0.9 will produce scat-like placeholder vocals.

<RecipeRun :body="instrumentalBody" :wait="60" />

## Audio with cover image (MP4 output)

Attach `cover.imageUrl` and the step emits a `video` blob (`.mp4`) with the image as a static 512×512 background instead of an MP3.

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "aceStepAudio",
    "input": {
      "musicDescription": "Rock: A driving rock track with powerful guitars and thundering drums.",
      "lyrics": "[Intro]\n[Verse]\nBreaking through the walls tonight\nNothing is gonna stop this fight",
      "duration": 30,
      "bpm": 140,
      "key": "E minor",
      "seed": 42,
      "cover": {
        "imageUrl": "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/07f78344-e165-4e96-8340-caf0e562f070/anim=false,width=450,optimized=true/1.jpeg"
      }
    }
  }]
}
```

<RecipeRun :body="coverBody" :wait="60" />

`cover.imageUrl` accepts either a plain URL string or a workflow `$ref` pointing at an earlier step's output (e.g. chain an `imageGen` step to generate the album art, then feed it into `aceStepAudio` — see [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism)).

## Switching the diffusion model

Set `model` to a full AIR URN. The 2B turbo AIO is the default; everything else is a drop-in override.

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "aceStepAudio",
    "input": {
      "musicDescription": "Cinematic Orchestral: Sweeping strings, bold brass, and thundering percussion.",
      "lyrics": "",
      "duration": 30,
      "bpm": 110,
      "key": "D minor",
      "instrumentalWeight": 1.0,
      "vocalWeight": 0.0,
      "seed": 3,
      "model": "urn:air:ace:checkpoint:civitai:2549270@2864949"
    }
  }]
}
```

<RecipeRun :body="xlTurboBody" :wait="60" />

The split-file XL checkpoints require the worker to download them on first use, so a fresh submission can sit in `scheduled` for a minute or two before a worker is warm. Use the `wait=60` resume loop (see [Runtime](#runtime)) or webhooks — don't wait on a single `wait=60` POST for the first XL call.

## Parameters

| Field | Required | Default | Notes |
|---|---|---|---|
| `musicDescription` | ✅ | — | Style / genre description. Prefix with a genre label (`"Neo-Soul:"`, `"Jazz:"`) for best results. |
| `lyrics` | ✅ | — | Structured lyrics with `[Verse]`, `[Chorus]`, `[Bridge]` markers. Use `""` for pure instrumentals. |
| `seed` | ✅ | — | Any `int32`. Same inputs + same seed reproduce the track. |
| `duration` | | `60` | Seconds, range `1`–`190`. Longer durations increase Buzz linearly — see [Cost](#cost). |
| `bpm` | | `120` | Beats per minute, range `40`–`200`. |
| `timeSignature` | | `"4"` | Beats per measure. `"3"` / `"4"` / `"6"` common. |
| `language` | | `"en"` | Language code — `en`, `zh`, `ja`, `ko`, … |
| `key` | | `"C major"` | Musical key, e.g. `"E minor"`, `"Bb major"`. |
| `instrumentalWeight` | | `0.85` | Range `0.0`–`1.0`. Raise toward `1.0` for instrumental-heavy mixes. |
| `vocalWeight` | | `0.9` | Range `0.0`–`1.0`. Set to `0.0` when `lyrics` is empty or you want a pure instrumental. |
| `model` | | *(2B turbo AIO)* | Full AIR URN for the diffusion checkpoint. See the [Variants](#variants) table. |
| `cover.imageUrl` | | *(none)* | URL (or workflow `$ref`) to a cover image. When set, output is an MP4 video with the image as the 512×512 background instead of an MP3. |

## Reading the result

Audio-only runs emit a single `audio` blob (MP3):

```json
{
  "status": "succeeded",
  "cost": { "total": 4 },
  "steps": [{
    "name": "$0",
    "$type": "aceStepAudio",
    "status": "succeeded",
    "output": {
      "blob": {
        "type": "audio",
        "id": "blob_....mp3",
        "available": true,
        "url": "https://orchestration-new.civitai.com/v2/consumer/blobs/blob_....mp3?sig=...&exp=...",
        "urlExpiresAt": "2027-04-14T15:13:40Z",
        "duration": 30,
        "jobId": "..."
      }
    },
    "jobs": [{
      "id": "...",
      "status": "succeeded",
      "startedAt": "2026-04-14T15:13:28.512Z",
      "completedAt": "2026-04-14T15:13:37.319Z",
      "cost": 4
    }]
  }]
}
```

Fields:

- **`blob.type`** — `"audio"` for MP3 output (no cover), `"video"` when `cover.imageUrl` was supplied (MP4 output).
- **`blob.id`** — stable blob key, ending in `.mp3` or `.mp4`.
- **`blob.url`** — signed URL. Fetch within `urlExpiresAt` or refetch the workflow / call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL.
- **`blob.duration`** — on audio blobs only, the requested duration in seconds (echoes `input.duration`). Video blobs omit this and expose `width` / `height` (both 512) instead.
- **`blob.available`** — `true` once the file is persisted. Whatif previews return `false` because no job actually ran.

When `cover.imageUrl` is set, `blob` is a video blob — same shape, `type: "video"`, `.mp4` extension, `width: 512`, `height: 512`. Despite the C# source commenting "WebM", the current Civitai pipeline emits MP4.

## Runtime

Measured end-to-end against `orchestration.civitai.com` on 2026-04-14:

| Shape | POST → terminal |
|---|---|
| `duration: 30`, 2B turbo, no cover | ~15 s (job itself ~9 s) |
| `duration: 60`, 2B turbo, no cover | ~15 s (job itself ~14 s) |
| `duration: 30`, 2B turbo, with cover image | ~13 s (job itself ~7 s) |
| `duration: 30`, XL turbo (4B) cold worker | >60 s (needs `wait=60` resume loop; worker had to pull split files) |

The 2B turbo default beats the 60-s long-poll window comfortably for every duration up to the 190-s cap, so **submit with `wait=60` and expect the POST itself to return terminal state**. If it doesn't (cold XL variant, capacity pressure), the response comes back non-terminal at the 60-s ceiling — re-issue `GET /v2/consumer/workflows/{id}?wait=60` in a loop until the response is terminal. See [Results & webhooks](/orchestration/guide/results-and-webhooks) for the resume pattern.

For backend integrations that can't hold a connection, register a webhook URL and submit with `wait=0` (fire-and-forget).

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Cost is driven purely by `duration` — a flat base charge plus a per-second factor. Nothing else in the input affects price (model variant, BPM, cover image, instrumental weights, lyrics length are all free).

```
total = 1 + duration × 0.1
```

| Shape | Buzz |
|---|---|
| `duration: 10` (shortest useful clip) | 2 |
| `duration: 30` (default recipe example) | **4** |
| `duration: 60` (schema default) | 7 |
| `duration: 90` (typical full song) | 10 |
| `duration: 180` (near max, 3-minute track) | 19 |

Arithmetic check against the formula: `1 + 30 × 0.1 = 4` ✅, `1 + 60 × 0.1 = 7` ✅, `1 + 180 × 0.1 = 19` ✅. Prod whatif previews confirmed these exact Buzz figures on 2026-04-14. The orchestrator surfaces the raw `Factors["total"]` value — non-integer formula outputs (e.g. `duration: 15` → `2.5`) are passed through unchanged in `cost.total`; there's no `Math.Ceiling` / `Math.Round` in the handler.

Cover images, key, BPM, time signature, language, and instrumental / vocal weights don't affect Buzz price — ACE-Step bills flat-plus-per-second on duration only.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `400` with `"duration must be between 1 and 190"` (or similar range complaint) | `duration` outside `[1, 190]`, `bpm` outside `[40, 200]`, or a weight outside `[0.0, 1.0]` | Clamp the field to the range in the parameters table. |
| `400` with `"musicDescription is required"` / `"lyrics is required"` / `"seed is required"` | Missing one of the three required fields. `lyrics: ""` is valid; the field itself must still be present. | Include every required field explicitly. |
| `400` with `"Unable to analyze … file"` on the cover image | `cover.imageUrl` pointed at a host that rejected the orchestrator's fetch (range requests, UA block, ALB cookie gating) | Use a Civitai CDN URL, or generate the cover with an `imageGen` step and `$ref` its output. |
| Output has scat-like placeholder vocals on an "instrumental" track | `lyrics: ""` but `vocalWeight` left at default `0.9` | Set `vocalWeight: 0.0` (and ideally `instrumentalWeight: 1.0`) whenever `lyrics` is empty. |
| Step `failed`, `reason = "blocked"` | Content moderation on the description / lyrics / cover image | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |
| Workflow stuck in `scheduled` for >60 s on an XL `model` override | No warm worker has the split-file checkpoint yet; the first submission of a given XL variant triggers a download | Keep polling with `?wait=60`; subsequent submissions in the same hour land on the now-warm worker in ~15 s. |
| Request timed out (`wait=60` returned non-terminal) | Cold XL variant, capacity pressure, or `duration` near 190 s on a busy shard | Re-issue `GET /v2/consumer/workflows/{id}?wait=60` until the response is terminal. |

## Related

- [`InvokeAceStepAudioStepTemplate`](/orchestration/reference/operations/InvokeAceStepAudioStepTemplate) — the per-recipe endpoint
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — generic path for chaining `aceStepAudio` into multi-step workflows
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for the `wait=60` resume loop
- [Transcription](./transcription) — inverse direction (audio → text); chain after `aceStepAudio` to auto-caption a track
- [Text-to-speech](./text-to-speech) — sibling audio recipe for spoken output
- [Flux 2 image generation](./flux2) — common upstream for generating cover art to feed into `cover.imageUrl`
- [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism) — for chaining an `imageGen` cover generator into this step
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running submissions (cold XL variants, webhooks)
- Full parameter catalog: the `AceStepAudioInput` schema in the [API reference](/orchestration/reference/)
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/aceStepAudio/openapi.yaml) — standalone OpenAPI 3.1 YAML for this endpoint
