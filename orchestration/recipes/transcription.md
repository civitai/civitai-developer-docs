---
title: Transcription
---

<script setup>
// JFK "ask not" clip from the OpenAI Whisper test corpus — public, CDN-served,
// reliably passes ffprobe's streaming validation. Swap in your own URL to test
// with different speech content.
const sampleAudio = 'https://cdn.jsdelivr.net/gh/openai/whisper@main/tests/jfk.flac';

const recipeBody = { mediaUrl: sampleAudio };

const workflowBody = {
  steps: [{
    $type: 'transcription',
    input: {
      mediaUrl: sampleAudio,
      returnTimeStamps: true,
    },
  }],
};

const languageHintBody = {
  steps: [{
    $type: 'transcription',
    input: {
      mediaUrl: sampleAudio,
      language: 'en',
    },
  }],
};

const contextBody = {
  steps: [{
    $type: 'transcription',
    input: {
      mediaUrl: sampleAudio,
      language: 'en',
      context: 'Technical discussion about Kubernetes, CRDs, and Flux CD.',
    },
  }],
};

const captionsBody = {
  steps: [{
    $type: 'transcription',
    input: {
      mediaUrl: 'https://example.com/clip.mp4',
      returnTimeStamps: true,
    },
  }],
};
</script>

# Transcription

The `transcription` step type takes an audio or video URL and returns the spoken text, using **Qwen3-ASR-1.7B** for recognition plus **Qwen3-ForcedAligner-0.6B** for timestamp alignment. It handles dozens of languages out of the box, auto-detects the spoken language, and can return **phrase-level** timestamps (one entry per spoken phrase/clause, each containing multiple words) suitable for captions and seek-aware UIs.

Common uses:

- Transcribe podcasts, interviews, voice memos
- Generate captions (SRT / VTT) for video content via timestamps
- Feed speech into text-processing pipelines (summarization, search indexing)
- Pull the dialogue out of an existing video

## Prerequisites

- A Civitai orchestration token ([Quick start → Prerequisites](/orchestration/guide/getting-started#prerequisites))
- A publicly-fetchable audio or video URL (`.mp3`, `.wav`, `.m4a`, `.mp4` with an audio track, etc.). Civitai CDN URLs work directly.

## The simplest request

Use the per-recipe endpoint when you just need the text from one piece of audio:

```http
POST https://orchestration.civitai.com/v2/consumer/recipes/transcription?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "mediaUrl": "https://.../interview.mp3"
}
```

<RecipeRun :body="recipeBody" path="/v2/consumer/recipes/transcription" :wait="0" />

Defaults: language is auto-detected, phrase-level timestamps are returned. The response is a full [`Workflow`](/orchestration/reference/operations/GetWorkflow) whose single step carries the transcript in `output.text`.

::: tip Choosing a source URL
The URL must be **publicly fetchable** AND served by a host that supports HTTP range requests and consistent responses across requests — ffprobe streams + seeks rather than downloading the whole file. Sites that inject per-request session cookies (common on `wp-content/uploads` endpoints behind AWS ALBs) often break the seek and fail with `Failed to read frame size: Could not seek to N`. CDN-served files (jsdelivr, GitHub raw, S3 without redirect) are safe defaults; the Civitai CDN works directly.
:::

::: tip Use `wait=0` for long audio
Billing is computed per 30 s of audio (minimum 1 unit), and real processing time roughly tracks audio length + queue wait. Anything longer than ~90 s of audio is a candidate for `wait=0` + polling; a multi-minute file will blow past the [100-second request timeout](/orchestration/guide/getting-started#_3-poll-if-you-didn-t-wait-inline).
:::

## Via the generic workflow endpoint

Equivalent request through [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — use this path when you need webhooks, tags, or to chain with other steps:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "transcription",
    "input": {
      "mediaUrl": "https://.../interview.mp3",
      "returnTimeStamps": true
    }
  }]
}
```

<RecipeRun :body="workflowBody" :wait="0" />

## Input fields

See the [`TranscriptionInput` schema](/orchestration/reference/operations/InvokeTranscriptionStepTemplate) for the full definition.

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `mediaUrl` | ✅ | — | URL of the audio (or video with an audio track). Must be publicly fetchable without auth. ffprobe must be able to stream + seek the response (see tip above). |
| `language` | | auto-detect | ISO 639-1 hint like `"en"`, `"zh"`, `"es"`, `"ja"`. Omit to let the model detect. Setting it anyway usually improves accuracy on short or noisy clips. The *output* language is returned as a full English name (`"English"`, `"Spanish"`, …), not the ISO code. |
| `context` | | — | Optional free-text prompt describing the subject matter — helps the model spell unusual proper nouns, technical terms, or domain jargon correctly. |
| `returnTimeStamps` | | `true` | Whether to return phrase-level `startTime` / `endTime` pairs. Leave `true` unless you don't need them; the extra cost is negligible. |

## Language hints

Auto-detection is reliable on clear speech but can flip on short clips, heavily accented speakers, or audio that starts with non-speech (music, silence). If you know the language upfront, set it:

```json
{
  "mediaUrl": "https://.../audio.mp3",
  "language": "en"
}
```

<RecipeRun :body="languageHintBody" :wait="0" />

The detected (or forced) language is returned in `output.language` — note it comes back as the full English name (`"English"`, `"Japanese"`, …), not the ISO code you passed in.

## Context hints for accuracy

Provide a short free-text `context` to bias the model toward correct spellings for proper nouns, acronyms, or technical vocabulary. For a tech podcast:

```json
{
  "mediaUrl": "https://.../podcast.mp3",
  "language": "en",
  "context": "Technical discussion about Kubernetes, CRDs, and Flux CD."
}
```

<RecipeRun :body="contextBody" :wait="0" />

Think of `context` like a prompt passed to the ASR model — a sentence or two of topic / vocabulary hints usually helps more than a long verbose description.

## Generating captions / SRT

Video files work as a `mediaUrl` too — pass an `.mp4` (or any container FFmpeg understands) and the audio track is extracted automatically. Combine with `returnTimeStamps: true` to get everything you need to emit an SRT or VTT file:

```json
{
  "mediaUrl": "https://.../clip.mp4",
  "returnTimeStamps": true
}
```

<RecipeRun :body="captionsBody" :wait="0" />

The `output.timeStamps` array holds one entry per spoken phrase (typically a clause between pauses or punctuation), each with `{ text, startTime, endTime }` in seconds. Phrase-sized chunks are usually what you want for subtitles — each entry can map directly to one caption line. If you need finer breaks (e.g. strict N-words-per-line), split each phrase's `text` client-side and interpolate times linearly across the phrase's duration.

## Reading the result

A successful `transcription` step emits the full transcript plus structured timing. Real output from the JFK clip above:

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "transcription",
    "status": "succeeded",
    "output": {
      "text": "And so, my fellow Americans, ask not what your country can do for you. Ask what you can do for your country.",
      "language": "English",
      "timeStamps": [
        { "text": "And so my fellow Americans",         "startTime": 0.32, "endTime": 2.16 },
        { "text": "ask not",                           "startTime": 3.28, "endTime": 4.32 },
        { "text": "what your country can do for you",  "startTime": 5.36, "endTime": 7.52 },
        { "text": "Ask what you can do for your country", "startTime": 8.16, "endTime": 10.48 }
      ],
      "elapsedSeconds": 0.876
    }
  }]
}
```

Fields:

- **`text`** — the full transcript as one string, with punctuation and casing restored
- **`language`** — the detected (or hinted) language as a **full English name** (e.g. `"English"`, `"Mandarin"`, `"Spanish"`). Not the ISO code you pass in.
- **`timeStamps`** — one entry per phrase/clause (spans multiple words each); empty array if `returnTimeStamps: false`
- **`elapsedSeconds`** — server-side model runtime (excludes queue wait — this is just the recognition pass)

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

Duration-based with a minimum floor of 1:

```
total = max(1, ceil(durationSeconds / 30))
```

| Audio length | Buzz |
|-------------|------|
| ≤ 30 s | **1** |
| 31–60 s | **2** |
| 5 min | ~10 |
| 30 min | ~60 |
| 60 min | ~120 |

Transcription is the cheapest speech path Civitai exposes — every 30 seconds of source is one Buzz, rounded up. The `language`, `context`, and `returnTimeStamps` fields don't affect cost.

## Runtime

Real-time-factor (processing time ÷ audio length) is well below 1 on Qwen3-ASR — a 5-minute recording typically finishes in well under a minute of server-side compute, plus queue wait. Plan for `wait=0` + polling on anything beyond ~90 s of audio.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` with "Unable to analyze audio file: … Failed to read frame size: Could not seek to N" | The host doesn't honor HTTP range requests or injects per-request session state (AWS ALB cookies, etc.), so ffprobe's streaming seek fails | Use a CDN-served file (jsdelivr, GitHub raw, S3 direct, Civitai CDN) instead. |
| `400` with "Unable to analyze audio file" (no seek error) | Source couldn't be probed (corrupt, wrong container, DNS failure, 403/404, redirect loop) | Verify the URL resolves with a direct `curl` and returns valid audio. |
| `400` with "Input audio resource does not exist" | Passed an AIR that doesn't resolve | Pass a plain URL instead, or confirm the AIR is correct. |
| `output.language` is wrong | Auto-detection failed on a short / noisy clip | Set `language` explicitly. |
| Proper nouns / jargon misspelled | Model hasn't seen the term often | Add a `context` string describing the subject matter and vocabulary. |
| Empty or partial transcript | Audio contains long silence, music, or very low-level speech | Trim silence / pre-normalize audio; confirm speech is actually audible at a reasonable volume. |
| Request timed out (`wait` expired) | Audio too long to finish in the synchronous window | Resubmit with `wait=0` and poll, or register a webhook. |
| Step `failed`, `reason = "blocked"` | Audio hit content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`InvokeTranscriptionStepTemplate`](/orchestration/reference/operations/InvokeTranscriptionStepTemplate) — the per-recipe endpoint
- [Endpoint OpenAPI spec](https://orchestration.civitai.com/v2/consumer/recipes/transcription/openapi.yaml) — standalone OpenAPI 3.1 YAML for this endpoint, ready to import into Postman / Insomnia / OpenAPI Generator
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — generic path for chaining
- [Text-to-speech](./text-to-speech) — the inverse: text → audio
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — handling long-running workflows
- [Workflows & Jobs → Dependencies](/orchestration/guide/workflows-and-jobs#dependencies-parallelism) — how to feed `output.text` into a downstream step
