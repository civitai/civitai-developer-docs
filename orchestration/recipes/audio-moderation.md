---
title: Audio moderation
---

<script setup>
const audioBody = {
  steps: [{
    $type: 'audioModeration',
    name: 'scan',
    input: {
      mediaUrl: 'https://cdn.jsdelivr.net/gh/openai/whisper@main/tests/jfk.flac',
      transcriber: 'auto',
      language: 'en',
    },
  }],
};

const textBody = {
  steps: [{
    $type: 'audioTextModeration',
    name: 'scan',
    input: { lyrics: 'We dance together under the summer sky.' },
  }],
};
</script>

# Audio moderation

The `audioModeration` step transcribes music or a video's audio tracks and checks the transcript for **sexualized minors**. The default `auto` path extracts every audio track, classifies its segments on CPU in the controller, and routes them to Cohere ASR or ACE-Step. Both feed the same local XGuard policy classifier. This policy does not block adult sexuality, profanity, violence, hate, nonsexual childhood themes, innocent teenage romance, or non-graphic abuse reporting, prevention, and survivor testimony.

The classifier connects subjects and ages across verses and uses their age at the time of the events. It considers negation and the context of quoted speech, distinguishing condemnation of abuse from endorsement. Pet names, band names, unrelated numbers, and musical terms such as a minor melody do not establish a person's age. Instructions embedded in lyrics cannot change the policy.

| `transcriber` | Backend | Notes |
|---|---|---|
| `auto` (default) | YAMNet on CPU → Cohere ASR or ACE-Step | Speech uses ASR when `language` is supported. Singing, mixed/uncertain audio, and unknown languages use ACE-Step. Every segment is transcribed. |
| `aceStep` | ACE-Step through vLLM-Omni | Extracts every audio track, decodes it into 30-second segments, and transcribes every segment without generating a caption. Incomplete transcripts fail the scan. |
| `asr` | Cohere ASR through vLLM | Audio-only input; accepts an optional language hint. Explicitly selects ASR; an omitted language uses its English default. |

## Scan audio or video

Submit a workflow and poll its status:

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=0
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "audioModeration",
    "name": "scan",
    "input": {
      "mediaUrl": "https://cdn.jsdelivr.net/gh/openai/whisper@main/tests/jfk.flac",
      "transcriber": "auto",
      "language": "en"
    }
  }]
}
```

<RecipeRun :body="audioBody" :wait="0" />

| Field | Default | Notes |
|---|---|---|
| `mediaUrl` | Required | Fetchable audio/video URL or an existing orchestrator blob AIR. Video extraction supports `auto` and `aceStep`. |
| `transcriber` | `auto` | `auto`, `aceStep`, or `asr`. |
| `language` | Unspecified | In `auto`, speech uses ASR only with a supported language code; otherwise it uses ACE-Step. In explicit `asr`, omission defaults to English. |

The per-recipe endpoint is `POST /v2/consumer/recipes/audioModeration`; send the input object directly. It waits for the result. Prefer the workflow endpoint for long audio or when your HTTP client has a short timeout.

## Audio routing

YAMNet runs inside the controller using ONNX Runtime on CPU. It evaluates overlapping windows throughout every 30-second PCM segment; background music alone does not force the singing route. Classification selects a transcriber and never exempts audio from moderation. Missing classifier assets or failed extraction fail the scan.

The supported Cohere language codes are `en`, `fr`, `de`, `it`, `es`, `pt`, `el`, `nl`, `pl`, `zh`, `ja`, `ko`, `vi`, and `ar`. YAMNet does not identify the language. Leave `language` unset for unknown or multilingual audio to keep the ACE-Step fallback.

For routing diagnostics, an `audioClassification` step accepts `{ "mediaUrl": "https://example.com/video.mp4" }` and returns `hasAudio`, a classifier version, CPU classification time, and an ordered segment manifest with content labels and scores. This is audio event classification, not a moderation verdict. Extracted segment blobs remain private.

## Scan an existing transcript

`audioTextModeration` checks text without transcribing it again:

```json
{
  "steps": [{
    "$type": "audioTextModeration",
    "name": "scan",
    "input": { "lyrics": "We dance together under the summer sky." }
  }]
}
```

<RecipeRun :body="textBody" :wait="0" />

Supply exactly one input source:

| Field | Source |
|---|---|
| `lyrics` | Complete lyric text. |
| `transcription` | The entire `output` of a `transcription` step. |
| `audioCaptioning` | The entire `output` of an `audioCaptioning` step, including its transcription completion metadata. |

For example, `"transcription": { "$ref": "transcribe", "path": "output" }` uses an earlier transcription step. The per-recipe endpoint is `POST /v2/consumer/recipes/audioTextModeration`.

## Reading the result

The scan's `output` contains:

```json
{
  "lyrics": "We dance together under the summer sky.",
  "sexualizedMinors": false,
  "blocked": false,
  "score": 0.0159,
  "model": "urn:air:qwen3:repository:huggingface:Civitai/YuFeng-XGuard-Reason-8B-FP8@4ad55b8d983ccaebd7ba6454901954505bc48089.tar",
  "policyHash": "SYQXZTXPZKKHYC208RHKH5EQ70",
  "hasAudio": true
}
```

`blocked` is true when the sexualized-minors score reaches 0.5. A blocked scan still has `status: "succeeded"`: classification completed and found a policy violation. Approve content only when the scan succeeded and its complete output explicitly has `blocked: false`. A failed/canceled scan, missing output, or unavailable service is not approval.

The parent scan publishes its output after transcription and classification finish. Downstream steps can reference `scan.output.lyrics` using `{ "$ref": "scan", "path": "output.lyrics" }`.

For a video with no audio track, the scan returns `hasAudio: false`, `skippedReason: "noAudioTrack"`, empty lyrics, false flags, and null `score`, `model`, and `policyHash`. This is a skip, not a classifier approval. Corrupt media fails instead of being treated as silent video. `hasAudio` may be absent for an existing text transcript or the audio-only ASR path.

Long transcripts are scanned in overlapping windows. The returned `score` is the highest window score; the full transcript is retained. Every window must finish successfully before the parent publishes a verdict.

## Website posting

The website queues newly uploaded music and video for the automatic routing path. The website currently supplies no language hint, so its segments fall back to ACE-Step. Posting scans run in shadow mode: they store flags for moderator review without changing post visibility or ratings. The moderator audio queue records “would block” or “would allow” and exports a rolling 14-day sample with those decisions. Only sexualized minors are assessed. A scan's `blocked` field describes the classifier decision; it does not mean the post was removed.

## Music generation checks

ACE-Step, MiniMax Music 3, YuE2, and both Sonilo audio operations check their description and lyrics together before generation. YuE2 also checks an active ABC score. These checks enforce the same sexualized-minors policy, including workflow arguments and deferred references. A blocked submission returns HTTP 400 with `Music prompt or lyrics may sexualize minors.`; a violation discovered after resolving a deferred input fails the generation step.

The separate audio scan recipes return a verdict for your application to handle. Submitting a music generation request checks its text inputs; the website queues a transcript scan when audio or video is posted.

## Runtime

Audio scans run transcription followed by classification. Queue time, model startup, and audio duration affect latency. Use `wait=0` and poll [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow), or subscribe to [results and webhooks](/orchestration/guide/results-and-webhooks). Identical completed classification requests reuse cached results.

## Cost

Use `whatif=true` for a cost preview. An audio scan includes the selected transcription step and a classifier step; long transcripts require multiple classifier requests. Scanning existing lyrics only needs the classifier. See [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection and workflow transactions.

## Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| `blocked: true` | The classifier detected sexualized minors. | Do not approve the content. Review or change it. |
| No verdict, or scan failed/canceled | Transcription or classification did not complete successfully. | Keep the content pending and retry after resolving the service/input failure. |
| ACE-Step transcript rejected | Missing lyrics or incomplete generation metadata. | Use a complete transcript from the current audio captioning pipeline. |
| Music submission returns the policy's HTTP 400 error | The prompt or lyrics violated the rule. | Revise the input; repeating it is not a transient-error retry. |

## Related

- [Transcription](./transcription)
- [ACE-Step music generation](./ace-step-audio)
- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) and [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow)
- [`InvokeAudioModerationStepTemplate`](/orchestration/reference/operations/InvokeAudioModerationStepTemplate) — `AudioModerationInput` and `AudioModerationOutput`
- [`InvokeAudioTextModerationStepTemplate`](/orchestration/reference/operations/InvokeAudioTextModerationStepTemplate) — `AudioTextModerationInput` and `AudioTextModerationOutput`
