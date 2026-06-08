
---
title: Multi-speaker dialogue
---

<script setup>
// Sequential reading — three turns, no overlap. Elements default to playing back-to-back;
// no "at" needed.
const sequentialBody = {
  steps: [
    {
      $type: 'textToSpeech',
      name: 'opener',
      input: {
        text: 'Welcome to the panel — today we are debating whether open-source models can be trusted.',
        engine: 'custom',
        speaker: 'vivian',
        xVectorOnlyMode: false,
        language: 'English',
      },
    },
    {
      $type: 'textToSpeech',
      name: 'pro',
      input: {
        text: 'Open source is the only way to keep the field honest. Closed models hide their training data.',
        engine: 'custom',
        speaker: 'ryan',
        xVectorOnlyMode: false,
        language: 'English',
      },
    },
    {
      $type: 'textToSpeech',
      name: 'con',
      input: {
        text: 'And yet open weights make misuse trivial. Trust requires gatekeeping, not full disclosure.',
        engine: 'custom',
        speaker: 'aiden',
        xVectorOnlyMode: false,
        language: 'English',
      },
    },
    {
      $type: 'composeMedia',
      input: {
        elements: [
          { url: { $ref: 'opener', path: 'output.audioBlob.url' } },
          { url: { $ref: 'pro',    path: 'output.audioBlob.url' } },
          { url: { $ref: 'con',    path: 'output.audioBlob.url' } },
        ],
      },
    },
  ],
};

// Crosstalk — the second speaker starts before the first finishes, mimicking
// an interruption. The third speaker comes in over the tail of the second
// to keep the energy up. Per-element effects are an appendable transformers[] list.
const crosstalkBody = {
  steps: [
    {
      $type: 'textToSpeech',
      name: 'host',
      input: {
        text: 'So the real question is whether safety can survive open release...',
        engine: 'custom',
        speaker: 'vivian',
        instruct: 'Speak in a measured, journalistic tone.',
        xVectorOnlyMode: false,
        language: 'English',
      },
    },
    {
      $type: 'textToSpeech',
      name: 'interrupt',
      input: {
        text: 'But that framing is exactly the problem — safety is not the only axis!',
        engine: 'custom',
        speaker: 'ryan',
        instruct: 'Speak forcefully, slightly elevated.',
        xVectorOnlyMode: false,
        language: 'English',
      },
    },
    {
      $type: 'textToSpeech',
      name: 'rebuttal',
      input: {
        text: 'Wait — let him finish, then we can take that apart.',
        engine: 'custom',
        speaker: 'aiden',
        instruct: 'Speak with calm authority, slightly amused.',
        xVectorOnlyMode: false,
        language: 'English',
      },
    },
    {
      $type: 'composeMedia',
      input: {
        elements: [
          { url: { $ref: 'host',      path: 'output.audioBlob.url' } },
          { url: { $ref: 'interrupt', path: 'output.audioBlob.url' }, offset: -0.6, transformers: [{ type: 'fadeIn', durationMs: 60 }] },
          { url: { $ref: 'rebuttal',  path: 'output.audioBlob.url' }, offset: -0.4, transformers: [{ type: 'volume', db: -1 }, { type: 'fadeIn', durationMs: 80 }, { type: 'fadeOut', durationMs: 120 }] },
        ],
        normalize: false,
      },
    },
  ],
};

// Music bed example — generate an instrumental bed with aceStepAudio and $ref it. The bed is
// anchored at 0s, attenuated, and faded in/out so the spoken track sits on top cleanly.
const musicBedBody = {
  steps: [
    {
      $type: 'textToSpeech',
      name: 'voice',
      input: {
        text: 'And that wraps our segment for today — until next time, keep building in the open.',
        engine: 'custom',
        speaker: 'dylan',
        xVectorOnlyMode: false,
        language: 'English',
      },
    },
    {
      $type: 'aceStepAudio',
      name: 'bed',
      input: {
        musicDescription: 'Soft ambient piano pad, gentle and unobtrusive, no drums.',
        lyrics: '',
        duration: 20,
        instrumentalWeight: 1.0,
        vocalWeight: 0.0,
        seed: 7,
      },
    },
    {
      $type: 'composeMedia',
      input: {
        elements: [
          { url: { $ref: 'voice', path: 'output.audioBlob.url' } },
          { url: { $ref: 'bed', path: 'output.audioBlob.url' }, at: 0.0, transformers: [{ type: 'volume', db: -18 }, { type: 'fadeIn', durationMs: 500 }, { type: 'fadeOut', durationMs: 1500 }] },
        ],
      },
    },
  ],
};
</script>

# Multi-speaker dialogue

The `composeMedia` step overlays multiple media elements on a single timeline, each placed at its own start offset with an appendable list of per-element transformers (volume, fades). With no `canvas`, it produces a single mixed-down audio blob — the audio form used throughout this recipe. Pair it with N `textToSpeech` steps to produce multi-speaker dialogue, debate, or audio drama — including overlap, interruption, and cross-talk that single-utterance TTS can't model on its own.

::: tip composeMedia also does video
The same step composes video: add a `canvas` and the elements are scaled, stacked, and overlaid into an MP4/WebM (e.g. a music track over a clip, or picture-in-picture). See [Compose media (video)](./compose-media-video). This page focuses on the audio-only form.
:::

::: tip Why not a multi-speaker TTS engine?
Qwen3 TTS synthesises one continuous utterance per request with no silence-injection or speaker switching. Asking the model to "say A, then pause, then say B" produces unpredictable prosody. Generating each line as its own short, clean TTS step and overlaying them with `composeMedia` keeps every utterance natural while letting you place them anywhere on the output timeline — including overlapping intervals, which is the only way to get genuine cross-talk.
:::

## How it composes

Every dialogue workflow has the same shape:

1. **One `textToSpeech` step per spoken line** — each step picks its own speaker (built-in voice, voice clone, or voice design) and produces a short clean clip.
2. **One trailing `composeMedia` step** referencing each TTS output via `$ref`. By default, elements play back-to-back in array order — no timing math required.

Each element must be AIR-resolvable — a `$ref` to a prior step's output, or a Civitai resource/blob URL — because the worker pre-downloads it; direct third-party URLs aren't supported for now.

```json
{
  "steps": [
    { "$type": "textToSpeech", "name": "alice", "input": { /* ... */ } },
    { "$type": "textToSpeech", "name": "bob",   "input": { /* ... */ } },
    {
      "$type": "composeMedia",
      "input": {
        "elements": [
          { "url": { "$ref": "alice", "path": "output.audioBlob.url" } },
          { "url": { "$ref": "bob",   "path": "output.audioBlob.url" } }
        ]
      }
    }
  ]
}
```

### Timeline rules

Each element resolves a start time on the output timeline using these rules:

- **Implicit (default)**: element *i* starts when element *i-1* ends (in array order). No fields needed.
- **`offset`**: float in seconds, nudges the implicit position. Negative = overlap/interrupt; positive = gap. `offset: -0.5` means "start 500 ms before the previous element ends".
- **`at`**: absolute timeline anchor. When set, the element plays at exactly this time **and is excluded from the implicit chain** — perfect for music beds. Other elements in the array compute their implicit position as if anchored elements weren't there.

If both `at` and `offset` are set on the same element, `at` wins.

The output is a single Ogg Vorbis blob plus an `elements[]` array echoing each input's resolved `startSeconds` and probed `duration` — convenient for rendering subtitles or speaker highlights without re-probing.

## Sequential reading

Three speakers, each clip placed after the previous one ends. No overlap; the gaps between clips are silent.

<RecipeRun :body="sequentialBody" :wait="0" />

## Crosstalk and interruption

A speaker starts before the previous one finishes. ffmpeg's `amix` sums the overlapping samples, so the two voices are audible simultaneously. A small `fadeIn` transformer on the interrupter softens the entry.

<RecipeRun :body="crosstalkBody" :wait="0" />

For a "hot debate" effect, set `offset: -0.3` to `-1.0` on each interrupter — negative offsets pull the element earlier on the timeline. Use mild attenuation (a `volume` transformer at `-1` to `-3` dB) on whichever speaker should sit slightly back in the mix.

## Adding a music or ambience bed

Generate an instrumental with `aceStepAudio` (or reference any Civitai-hosted audio resource) and overlay it under the voice track.

<RecipeRun :body="musicBedBody" :wait="0" />

The bed sits at a `volume` transformer of `-18` dB (well under speech), fades in over 500 ms, and fades out over 1.5 s. Keep beds at -15 dB or lower against speech.

## Input fields

### `composeMedia` step

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `elements` | ✅ | — | Array of elements to overlay. At least one. |
| `output` | | derived | `{ type, container }`. Leave unset for an audio mixdown; set `container` to `ogg` (default) or `mp3`. |
| `canvas` | | — | Omit for an audio mixdown (this recipe). Set it to produce video — see [Compose media (video)](./compose-media-video). |
| `normalize` | | `false` | When `true`, ffmpeg's `amix` divides by N to avoid clipping. Keep `false` when you've set per-element `volume` transformers and want the levels you specified. |

### Per-element fields

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `url` | ✅ | — | A `{ "$ref": "<step-name>", "path": "output.audioBlob.url" }` referencing a prior step's output, or a Civitai resource/blob URL. Each element is pre-downloaded by the worker as a resource, so direct third-party URLs are **not supported for now**. |
| `at` | | implicit | Absolute timeline anchor in seconds. Set this to pin an element to a fixed time (music bed, ambience). When set, the element is taken out of the implicit-sequencing chain. When unset, the element plays after the previous non-anchored element ends. |
| `offset` | | `0` | Seconds to nudge this element from its implicit position. Negative = overlap/interrupt; positive = gap. Ignored when `at` is set. |
| `transformers` | | `[]` | Ordered list of per-element effects, applied in array order. See below. |

### Transformers

Each entry is `{ "type": "<name>", ...params }`. The audio-relevant set:

| `type` | Params | Notes |
|--------|--------|-------|
| `volume` | `db` (float) | Per-element gain in dB. `-3` halves perceived loudness; `-18` is a typical music-bed level. |
| `fadeIn` | `durationMs` (int) | Linear fade-in applied at the element's resolved start. |
| `fadeOut` | `durationMs` (int) | Linear fade-out applied at the element's tail (resolved start + duration − duration). |

## Reading the result

```json
{
  "status": "succeeded",
  "steps": [
    { "name": "opener", "$type": "textToSpeech", "output": { "audioBlob": { /* ... */ } } },
    { "name": "pro",    "$type": "textToSpeech", "output": { "audioBlob": { /* ... */ } } },
    { "name": "con",    "$type": "textToSpeech", "output": { "audioBlob": { /* ... */ } } },
    {
      "name": "3",
      "$type": "composeMedia",
      "status": "succeeded",
      "output": {
        "type": "audio",
        "audioBlob": {
          "id": "ZXNS7C...ogg",
          "url": "https://orchestration-new.civitai.com/v2/consumer/blobs/ZXNS7C...ogg?sig=...",
          "duration": 18.2
        },
        "elements": [
          { "startSeconds":  0.0, "duration": 5.7 },
          { "startSeconds":  5.7, "duration": 5.9 },
          { "startSeconds": 11.6, "duration": 6.2 }
        ]
      }
    }
  ]
}
```

- **`type`** — `"audio"` here. The output is discriminated on `type`: an audio mixdown carries `audioBlob`, a video composition carries `videoBlob`.
- **`audioBlob.url`** — signed URL for the mixed Ogg Vorbis output. Stream it directly in an `<audio src>` tag.
- **`audioBlob.duration`** — total output length in seconds (max of resolved `startSeconds + duration` across elements).
- **`elements[]`** — per-input timing in the order they were submitted, useful for rendering subtitle overlays or speaker-highlight UI.

## Runtime

The `composeMedia` step itself is cheap for audio — typically a second or two of ffmpeg on a worker. The wall-clock for the whole workflow is dominated by the TTS steps, which run in parallel on the Qwen workers and each take 60–120 s for a short line. Submit with `wait=0` and poll, the same as plain `textToSpeech`.

## Cost

The audio form of `composeMedia` is **free** — no fixed cost, no factors. The expensive work, generating each utterance, is already priced on the underlying `textToSpeech` steps under their existing per-character formula. See the [text-to-speech recipe](./text-to-speech#cost) for the TTS pricing. (Video compositions are priced separately — see [Compose media (video)](./compose-media-video#cost).)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` validation error, "ComposeMedia element has no resolved url" | A `$ref` failed to resolve — the referenced step name doesn't match, or its output's path doesn't exist | Confirm each prior step has a unique `name` and that the `$ref.path` is `"output.audioBlob.url"` (case-sensitive). |
| `400` validation error, "is not an AIR-resolvable resource" | An element `url` is a direct third-party URL | Use a `$ref` to a prior step's output, or a Civitai resource/blob URL — external URLs aren't supported yet. |
| Output clips/distorts when speakers overlap | Two or more elements at `0` dB summing to over full-scale | Either set `"normalize": true`, or attenuate the louder element with a `volume` transformer at `-3` to `-6` dB. |
| Music bed too loud against speech | Bed `volume` too high | Drop the bed to `-18` to `-24` dB; voice elements at 0 dB then sit cleanly on top. |
| Cross-talk sounds abrupt | Interrupter starts with no fade | Add a `fadeIn` transformer of `60–120` ms on the interrupting element. |
| Mix succeeded but `elements[]` is empty | The worker succeeded but the timing payload didn't propagate (rare) | The `audioBlob.duration` is still reliable; recompute per-element timing client-side from the inputs you sent. |

## Related

- [Compose media (video)](./compose-media-video) — the same step with a `canvas`: overlay/stack videos, place audio over a clip, picture-in-picture.
- [Text-to-speech](./text-to-speech) — single-utterance synthesis; the building block this recipe composes.
- [Transcription](./transcription) — the inverse, useful for caption tracks over a finished mix.
- [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism) — how `$ref` lets one step consume another's output.
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — for workflows with several long-running TTS steps.
- The [`ComposeMediaInput` and `ComposeMediaOutput` schemas](/orchestration/reference/operations/InvokeComposeMediaStepTemplate) — full parameter reference.
