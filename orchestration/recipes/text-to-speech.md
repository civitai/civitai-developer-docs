---
title: Text-to-speech
---

<script setup>
const sampleText = 'Welcome to Civitai, the home of open-source generative AI.';

const recipeBody = {
  text: sampleText,
  engine: 'custom',
  speaker: 'vivian',
  xVectorOnlyMode: false,
  language: 'English',
};

const workflowBody = {
  steps: [{
    $type: 'textToSpeech',
    input: {
      text: sampleText,
      engine: 'custom',
      speaker: 'dylan',
      xVectorOnlyMode: false,
      language: 'English',
    },
  }],
};

const styleBody = {
  steps: [{
    $type: 'textToSpeech',
    input: {
      text: 'Breaking news — we are live from the Civitai studios.',
      engine: 'custom',
      speaker: 'dylan',
      instruct: 'Speak in a cheerful and enthusiastic broadcaster tone.',
      xVectorOnlyMode: false,
      language: 'English',
    },
  }],
};

const cloneBody = {
  steps: [{
    $type: 'textToSpeech',
    input: {
      text: 'This sentence is synthesized by cloning the voice from the reference audio.',
      engine: 'custom',
      refAudioUrl: 'https://github.com/mozilla/DeepSpeech/raw/master/data/smoke_test/LDC93S1.wav',
      refText: 'She had your dark suit in greasy wash water all year.',
      xVectorOnlyMode: false,
      language: 'English',
    },
  }],
};

const xVectorOnlyBody = {
  steps: [{
    $type: 'textToSpeech',
    input: {
      text: 'Using only the speaker embedding from the reference — no transcript required.',
      engine: 'custom',
      refAudioUrl: 'https://github.com/mozilla/DeepSpeech/raw/master/data/smoke_test/LDC93S1.wav',
      xVectorOnlyMode: true,
      language: 'English',
    },
  }],
};

const chainBody = {
  steps: [
    {
      $type: 'transcription',
      name: 'quote',
      input: {
        mediaUrl: 'https://cdn.jsdelivr.net/gh/openai/whisper@main/tests/jfk.flac',
      },
    },
    {
      $type: 'textToSpeech',
      name: 'reread',
      input: {
        text: { $ref: 'quote', path: 'output.text' },
        engine: 'custom',
        speaker: 'dylan',
        instruct: 'Speak in a confident presidential tone.',
        xVectorOnlyMode: false,
        language: 'English',
      },
    },
  ],
};
</script>

# Text-to-speech

The `textToSpeech` step type synthesises audio from text. Two modes on the same step:

- **Built-in speakers** — nine curated voices (`aiden`, `dylan`, `eric`, `ono_anna`, `ryan`, `serena`, `sohee`, `uncle_fu`, `vivian`). Pass `speaker: "<name>"` and go.
- **Voice cloning** — pass a `refAudioUrl` (and optionally the reference's transcript) and the output speaks in that voice.

Output is an Ogg Vorbis audio blob.

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- Text to synthesise (English or Chinese work best; language auto-detected by default)
- *For voice cloning only:* a short reference audio clip URL (≤ ~10 s clean speech) and, ideally, its transcript

## The simplest request

Built-in speaker, auto-detected language, `wait=0` because TTS typically runs longer than the synchronous 100-second window:

```http
POST https://orchestration.civitai.com/v2/consumer/recipes/textToSpeech?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "text": "Welcome to Civitai, the home of open-source generative AI.",
  "engine": "custom",
  "speaker": "vivian",
  "xVectorOnlyMode": false,
  "language": "English"
}
```

<RecipeRun :body="recipeBody" path="/v2/consumer/recipes/textToSpeech" :wait="0" />

The response (after polling to `succeeded`) is a full [`Workflow`](/orchestration/reference/operations/GetWorkflow) whose step carries an `audioBlob` with a signed streaming URL.

::: tip Use `wait=0` for TTS
End-to-end processing for a single sentence is ~60–120 s including model load and queue wait. Short clips can sneak in under `wait=30` on a warm node, but relying on it is brittle — `wait=0` + polling is the safe default.
:::

## Via the generic workflow endpoint

Use this path for webhooks, tags, or chaining with other steps:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "textToSpeech",
    "input": {
      "text": "Welcome to Civitai, the home of open-source generative AI.",
      "engine": "custom",
      "speaker": "dylan",
      "xVectorOnlyMode": false,
      "language": "English"
    }
  }]
}
```

<RecipeRun :body="workflowBody" :wait="0" />

## Input fields

See the [`TextToSpeechInput` schema](/orchestration/reference/operations/InvokeTextToSpeechStepTemplate) for the complete definition. The `engine` property is a discriminator — each engine has its own set of valid fields.

### Shared fields

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `text` | ✅ | — | The text to synthesise. No hard length cap, but generation time scales roughly linearly with length. |
| `engine` | ✅ | `custom` | Which TTS backend to route to. `custom` covers both built-in speakers and voice cloning on one schema. |
| `language` | | `Auto` | Full English language name: `"English"`, `"Chinese"`, or `"Auto"`. ISO codes like `"en"` may not be recognised by the model — use the full English name. |

### `custom` engine

The `custom` engine flattens both modes into one request. Whether you're using a built-in speaker or cloning depends on which fields you provide:

| Field | Required | Used in mode | Notes |
|-------|----------|--------------|-------|
| `speaker` | ✅ for built-in | CustomVoice | One of `aiden`, `dylan`, `eric`, `ono_anna`, `ryan`, `serena`, `sohee`, `uncle_fu`, `vivian`. |
| `instruct` | | CustomVoice | Optional free-text style/tone instruction (e.g. `"Speak in a cheerful and enthusiastic tone."`). |
| `refAudioUrl` | ✅ for cloning | Base | URL of a reference audio clip (HTTP(S) URL or AIR URN). |
| `refText` | ✅ for cloning (unless `xVectorOnlyMode: true`) | Base | Accurate transcript of the reference audio — helps the model align voice features to phonemes. |
| `xVectorOnlyMode` | ✅ | both | `false` for most cases. `true` skips `refText` and uses only the speaker embedding from the reference — faster to wire up, slightly lower quality. |
| `maxNewTokens` | | both | Generation cap, optional. Leave unset unless you're seeing runaway output. |

## Built-in speakers with a style prompt

`instruct` lets you nudge tone/pacing without switching voices. Example: the `dylan` voice as a cheerful broadcaster:

```json
{
  "text": "Breaking news — we are live from the Civitai studios.",
  "engine": "custom",
  "speaker": "dylan",
  "instruct": "Speak in a cheerful and enthusiastic broadcaster tone.",
  "xVectorOnlyMode": false,
  "language": "English"
}
```

<RecipeRun :body="styleBody" :wait="0" />

Short, specific directions work better than long prose (`"slow and serious"` beats a paragraph). The model doesn't always follow the instruction — treat it as a bias, not a guarantee.

## Voice cloning (Base mode)

Pass `refAudioUrl` + `refText` to clone the voice from a short reference clip:

```json
{
  "text": "This sentence is synthesized by cloning the voice from the reference audio.",
  "engine": "custom",
  "refAudioUrl": "https://.../reference.wav",
  "refText": "She had your dark suit in greasy wash water all year.",
  "xVectorOnlyMode": false,
  "language": "English"
}
```

<RecipeRun :body="cloneBody" :wait="0" />

Guidance for the reference:

- **Length**: 5–15 seconds of clean speech works best. Longer clips don't help and may time out.
- **Quality**: single speaker, minimal background noise, no music. Podcast intros or call-recording noise floor drop quality noticeably.
- **`refText` accuracy**: transcribe the reference exactly — including punctuation and capitalisation — or skip it via `xVectorOnlyMode: true`.
- **Reach**: the `refAudioUrl` must be fetchable by the orchestrator the same way [transcription's `mediaUrl`](./transcription#choosing-a-source-url) is. CDN-served files are safe; sites that inject per-request session state break the streaming fetch.

### `xVectorOnlyMode: true` — skip the reference transcript

If you don't have (or don't want to supply) a transcript, set `xVectorOnlyMode: true`. The model uses only the speaker embedding from the reference clip, no alignment:

```json
{
  "text": "Using only the speaker embedding from the reference — no transcript required.",
  "engine": "custom",
  "refAudioUrl": "https://.../reference.wav",
  "xVectorOnlyMode": true,
  "language": "English"
}
```

<RecipeRun :body="xVectorOnlyBody" :wait="0" />

Trade-off: one less input to get right; slightly less faithful cloning on sentences whose phonetic content differs from the reference. Start with `xVectorOnlyMode: false` when quality matters.

## Chaining: transcribe then re-speak

A common pipeline — transcribe an existing clip, then synthesise the same text in a different voice:

```json
{
  "steps": [
    {
      "$type": "transcription",
      "name": "quote",
      "input": {
        "mediaUrl": "https://cdn.jsdelivr.net/gh/openai/whisper@main/tests/jfk.flac"
      }
    },
    {
      "$type": "textToSpeech",
      "name": "reread",
      "input": {
        "text": { "$ref": "quote", "path": "output.text" },
        "engine": "custom",
        "speaker": "dylan",
        "instruct": "Speak in a confident presidential tone.",
        "xVectorOnlyMode": false,
        "language": "English"
      }
    }
  ]
}
```

The `{ "$ref": "quote", "path": "output.text" }` reference feeds the transcribed string into `reread`'s `text` field at runtime. See [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism).

<!-- test-skip: cross-step $ref inside whatif returns 500 — known orchestrator-side issue -->
<RecipeRun :body="chainBody" :wait="0" />

## Reading the result

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "textToSpeech",
    "status": "succeeded",
    "output": {
      "audioBlob": {
        "id": "XSSD3Y6B6BSPFBC3QHV0WD8QJ0.ogg",
        "url": "https://orchestration-new.civitai.com/v2/consumer/streaming-blobs/XSSD3Y6B6BSPFBC3QHV0WD8QJ0.ogg?sig=...",
        "urlExpiresAt": "2027-04-13T23:44:20Z",
        "type": "audio",
        "duration": null
      },
      "speaker": "vivian",
      "modelType": "custom_voice"
    }
  }]
}
```

Fields:

- **`audioBlob.url`** — signed **streaming** URL for the generated audio (Ogg Vorbis, `.ogg`). Stream it directly in an `<audio src>` tag or download the bytes.
- **`audioBlob.id`** — blob identifier, also usable via [`GetBlob`](/orchestration/reference/operations/GetBlob) if you need a fresh URL later.
- **`audioBlob.duration`** — output length in seconds when available (may be `null` until the blob is fully materialised).
- **`speaker`** — the speaker name used (only populated for CustomVoice / built-in modes).
- **`modelType`** — `"custom_voice"` for built-in speakers, `"base"` for reference-audio cloning. `null` if the backend didn't classify.

Blob URLs are signed and expire — store the audio locally or call [`GetBlob`](/orchestration/reference/operations/GetBlob) when the URL expires.

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Character-based with a minimum floor, multiplied by 2.6 when a built-in speaker is used:

```
textLength = max(1, ceil(len(text) / 100))
total      = textLength × (speaker != null ? 2.6 : 1)
```

| Shape | Buzz |
|-------|------|
| Base mode (voice cloning), 60 characters | **1** |
| Base mode, 500 characters | ~5 |
| Base mode, 2 000 characters | ~20 |
| CustomVoice (built-in `speaker`), 60 characters | ~2.6 |
| CustomVoice, 500 characters | ~13 |
| CustomVoice, 2 000 characters | ~52 |

Voice cloning via `refAudioUrl` is cheaper per character than picking a built-in `speaker` — the 2.6× multiplier only applies when `speaker` is set. `instruct`, `language`, and `maxNewTokens` don't affect cost.

## Runtime

End-to-end time for one short sentence is typically 60–120 seconds including model load, queue wait, and inference. Longer text scales roughly linearly. **Always submit with `wait=0`** and poll or subscribe to webhooks; `wait=30` synchronous calls will usually time out.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` validation error on `speaker` | Value not in the nine built-in names | Use one of the allowed speakers; check the [`CustomTextToSpeechInput` schema](/orchestration/reference/operations/InvokeTextToSpeechStepTemplate). |
| `400` validation error on `language` | Passed an ISO code like `"en"` | Use the full English name: `"English"`, `"Chinese"`, or `"Auto"`. |
| `400` validation error on `xVectorOnlyMode` | Missing — the field is required on the `custom` engine | Always include it; set to `false` unless you explicitly want x-vector-only cloning. |
| Voice cloning output sounds robotic | Reference clip is too noisy, too short, or contains multiple speakers | Supply a cleaner 5–15 s single-speaker reference. |
| Voice cloning ignores the reference entirely | `refAudioUrl` couldn't be fetched by the worker (cookie-gated host, 403, redirect loop) | Host the reference on a CDN / S3 direct / GitHub raw URL. |
| Prosody doesn't match `instruct` | The directive is too long or contradictory with the speaker's natural register | Keep `instruct` short and specific; try a different built-in speaker. |
| Request timed out (`wait` expired) | Synthesis too slow to finish in the synchronous window | Resubmit with `wait=0` and poll, or register a webhook. |
| Step `failed`, `reason = "blocked"` | Text or reference audio hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`InvokeTextToSpeechStepTemplate`](/orchestration/reference/operations/InvokeTextToSpeechStepTemplate) — the per-recipe endpoint
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/textToSpeech/openapi.yaml) — standalone OpenAPI 3.1 YAML for this endpoint, ready to import into Postman / Insomnia / OpenAPI Generator
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — generic path for chaining
- [Multi-speaker dialogue](./multi-speaker-dialogue) — overlay several TTS clips for debate, interview, or audio-drama scenes (uses the `audioMix` step)
- [Transcription](./transcription) — the inverse: audio → text
- [ACE-Step music generation](./ace-step-audio) — lyrics + style → full song audio (different recipe, sibling capability)
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running workflows
- [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism) — feeding `output.text` into a TTS step via `$ref`
