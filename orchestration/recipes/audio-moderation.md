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
      transcriber: 'aceStep',
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

The `audioModeration` step transcribes audio and checks its lyrics for **sexualized minors**. Use the default `aceStep` transcriber for lyrics, or `asr` for the existing speech recognition path. Both feed the same local Shieldstral policy classifier. This policy does not block adult sexuality, profanity, violence, hate, nonsexual childhood themes, innocent teenage romance, or non-graphic abuse reporting, prevention, and survivor testimony.

| `transcriber` | Backend | Notes |
|---|---|---|
| `aceStep` (default) | ACE-Step through vLLM-Omni | Extracts lyrics without generating an audio caption. Incomplete transcripts fail the scan. |
| `asr` | Cohere ASR through vLLM | Accepts an optional language hint. |

## Scan audio

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
      "transcriber": "aceStep"
    }
  }]
}
```

<RecipeRun :body="audioBody" :wait="0" />

| Field | Default | Notes |
|---|---|---|
| `mediaUrl` | Required | Fetchable audio URL or an existing orchestrator blob AIR. |
| `transcriber` | `aceStep` | `aceStep` or `asr`. |
| `language` | Auto-detect | Optional language hint for `asr`, such as `en`. |

The per-recipe endpoint is `POST /v2/consumer/recipes/audioModeration`; send the input object directly. It waits for the result. Prefer the workflow endpoint for long audio or when your HTTP client has a short timeout.

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
  "score": 0.0004,
  "model": "urn:air:mistral:repository:huggingface:mistralai/Shieldstral-1.0-3B@003ec7e2b0bab5f0e6307edbaf186fa5822b76f5.tar",
  "policyHash": "KT39PS983Q6JH91CEC5BJTVNE0"
}
```

`blocked` is true when the sexualized-minors score reaches 0.5. A blocked scan still has `status: "succeeded"`: classification completed and found a policy violation. Approve content only when the scan succeeded and its complete output explicitly has `blocked: false`. A failed/canceled scan, missing output, or unavailable service is not approval.

The parent scan publishes its output after transcription and classification finish. Downstream steps can reference `scan.output.lyrics` using `{ "$ref": "scan", "path": "output.lyrics" }`.

## Music generation checks

ACE-Step, MiniMax Music 3, YuE2, and both Sonilo audio operations check their description and lyrics together before generation. YuE2 also checks an active ABC score. These checks enforce the same sexualized-minors policy, including workflow arguments and deferred references. A blocked submission returns HTTP 400 with `Music prompt or lyrics may sexualize minors.`; a violation discovered after resolving a deferred input fails the generation step.

The separate audio scan recipes return a verdict for your application to enforce. Submitting a music generation request does not automatically scan its resulting audio or attach moderation to a website post.

## Runtime

Audio scans run transcription followed by classification. Queue time, model startup, and audio duration affect latency. Use `wait=0` and poll [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow), or subscribe to [results and webhooks](/orchestration/guide/results-and-webhooks). Identical completed classification requests reuse cached results.

## Cost

Use `whatif=true` for a cost preview. An audio scan includes the selected transcription step and one classifier step; scanning existing lyrics only needs the classifier. See [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection and workflow transactions.

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
