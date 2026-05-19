---
title: Multi-speaker dialogue
---

<script setup>
const ttsRefAudio = 'https://github.com/mozilla/DeepSpeech/raw/master/data/smoke_test/LDC93S1.wav';
const musicBedUrl = 'https://cdn.jsdelivr.net/gh/anars/blank-audio@master/10-seconds-of-silence.mp3';

// Sequential reading — three turns, no overlap. Tracks default to playing back-to-back;
// no startSeconds needed.
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
      $type: 'audioMix',
      input: {
        tracks: [
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
// to keep the energy up.
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
      $type: 'audioMix',
      input: {
        tracks: [
          { url: { $ref: 'host',      path: 'output.audioBlob.url' } },
          { url: { $ref: 'interrupt', path: 'output.audioBlob.url' }, offset: -0.6, fadeInMs: 60 },
          { url: { $ref: 'rebuttal',  path: 'output.audioBlob.url' }, offset: -0.4, volumeDb: -1, fadeInMs: 80, fadeOutMs: 120 },
        ],
        normalize: false,
      },
    },
  ],
};

// Music bed example — direct URL form (no $ref). The bed is attenuated and
// fades in/out so the spoken track sits on top cleanly.
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
      $type: 'audioMix',
      input: {
        tracks: [
          { url: { $ref: 'voice', path: 'output.audioBlob.url' } },
          { url: musicBedUrl,                                  startSeconds: 0.0, volumeDb: -18, fadeInMs: 500, fadeOutMs: 1500 },
        ],
      },
    },
  ],
};
</script>

# Multi-speaker dialogue

The `audioMix` step overlays multiple audio clips on a single timeline, each placed at its own start offset with optional per-track volume and fades. Pair it with N `textToSpeech` steps to produce multi-speaker dialogue, debate, or audio drama — including overlap, interruption, and cross-talk that single-utterance TTS can't model on its own.

::: tip Why not a multi-speaker TTS engine?
Qwen3 TTS synthesises one continuous utterance per request with no silence-injection or speaker switching. Asking the model to "say A, then pause, then say B" produces unpredictable prosody. Generating each line as its own short, clean TTS step and overlaying them with `audioMix` keeps every utterance natural while letting you place them anywhere on the output timeline — including overlapping intervals, which is the only way to get genuine cross-talk.
:::

## How it composes

Every dialogue workflow has the same shape:

1. **One `textToSpeech` step per spoken line** — each step picks its own speaker (built-in voice, voice clone, or voice design) and produces a short clean clip.
2. **One trailing `audioMix` step** referencing each TTS output via `$ref`. By default, tracks play back-to-back in array order — no timing math required.

```json
{
  "steps": [
    { "$type": "textToSpeech", "name": "alice", "input": { /* ... */ } },
    { "$type": "textToSpeech", "name": "bob",   "input": { /* ... */ } },
    {
      "$type": "audioMix",
      "input": {
        "tracks": [
          { "url": { "$ref": "alice", "path": "output.audioBlob.url" } },
          { "url": { "$ref": "bob",   "path": "output.audioBlob.url" } }
        ]
      }
    }
  ]
}
```

### Timeline rules

Each track resolves a start time on the output timeline using these rules:

- **Implicit (default)**: track *i* starts when track *i-1* ends (in array order). No fields needed.
- **`offset`**: float in seconds, nudges the implicit position. Negative = overlap/interrupt; positive = gap. `offset: -0.5` means "start 500 ms before the previous track ends".
- **`startSeconds`**: absolute timeline anchor. When set, the track plays at exactly this time **and is excluded from the implicit chain** — perfect for music beds. Other tracks in the array compute their implicit position as if anchored tracks weren't there.

If both `startSeconds` and `offset` are set on the same track, `startSeconds` wins.

The output is a single Ogg Vorbis blob plus a `tracks[]` array echoing each input's resolved `startSeconds` and probed `duration` — convenient for rendering subtitles or speaker highlights without re-probing.

## Sequential reading

Three speakers, each clip placed after the previous one ends. No overlap; the gaps between clips are silent.

<RecipeRun :body="sequentialBody" :wait="0" />

## Crosstalk and interruption

A speaker starts before the previous one finishes. ffmpeg's `amix` sums the overlapping samples, so the two voices are audible simultaneously. Small `fadeInMs` on the interrupter softens the entry.

<RecipeRun :body="crosstalkBody" :wait="0" />

For a "hot debate" effect, set `offset: -0.3` to `-1.0` on each interrupter — negative offsets pull the track earlier on the timeline. Use mild attenuation (`volumeDb: -1` to `-3`) on whichever speaker should sit slightly back in the mix.

## Adding a music or ambience bed

The `url` field also accepts a direct URL string — no `$ref` needed — so you can drop in static background music or ambience under a voice track.

<RecipeRun :body="musicBedBody" :wait="0" />

The bed sits at `volumeDb: -18` (well under speech), fades in over 500 ms, and fades out over 1.5 s. Keep beds at -15 dB or lower against speech.

## Input fields

### `audioMix` step

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `tracks` | ✅ | — | Array of tracks to overlay. At least one. |
| `normalize` | | `false` | When `true`, ffmpeg's `amix` divides by N to avoid clipping. Keep `false` when you've set per-track `volumeDb` and want the levels you specified. |
| `maxDurationSeconds` | | `600` | Server-side cap on output length. The job fails early if the union of track intervals exceeds this. |

### Per-track fields

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `url` | ✅ | — | Either a direct `"https://..."` URL string, or a `{ "$ref": "<step-name>", "path": "output.audioBlob.url" }` referencing a prior step's output. |
| `startSeconds` | | implicit | Absolute timeline anchor. Set this to pin a track to a fixed time (music bed, ambience). When set, the track is taken out of the implicit-sequencing chain. When unset, the track plays after the previous non-anchored track ends. |
| `offset` | | `0` | Seconds to nudge this track from its implicit position. Negative = overlap/interrupt; positive = gap. Ignored when `startSeconds` is set. |
| `volumeDb` | | `0` | Per-track gain in dB. `-3` halves perceived loudness; `-18` is a typical music-bed level. |
| `fadeInMs` | | `0` | Linear fade-in length applied at the track's resolved start. |
| `fadeOutMs` | | `0` | Linear fade-out applied at the track's tail (resolved start + duration − fadeOutMs). |

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
      "$type": "audioMix",
      "status": "succeeded",
      "output": {
        "audioBlob": {
          "id": "ZXNS7C...ogg",
          "url": "https://orchestration-new.civitai.com/v2/consumer/blobs/ZXNS7C...ogg?sig=...",
          "duration": 18.2
        },
        "tracks": [
          { "startSeconds":  0.0, "duration": 5.7 },
          { "startSeconds":  5.7, "duration": 5.9 },
          { "startSeconds": 11.6, "duration": 6.2 }
        ]
      }
    }
  ]
}
```

- **`audioBlob.url`** — signed URL for the mixed Ogg Vorbis output. Stream it directly in an `<audio src>` tag.
- **`audioBlob.duration`** — total output length in seconds (max of resolved `startSeconds + duration` across tracks).
- **`tracks[]`** — per-input timing in the order they were submitted, useful for rendering subtitle overlays or speaker-highlight UI.

## Runtime

The `audioMix` step itself is cheap — typically a second or two of ffmpeg on a CPU worker. The wall-clock for the whole workflow is dominated by the TTS steps, which run in parallel on the Qwen workers and each take 60–120 s for a short line. Submit with `wait=0` and poll, the same as plain `textToSpeech`.

## Cost

`audioMix` itself is **free** — `Factors: []`, no fixed cost. The expensive work, generating each utterance, is already priced on the underlying `textToSpeech` steps under their existing per-character formula. See the [text-to-speech recipe](./text-to-speech#cost) for the TTS pricing.

The server enforces `maxDurationSeconds` (default 600) as a guardrail against runaway mixes; raise it on the input if you genuinely need longer output.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `400` validation error, "AudioMix track has no resolved url" | A `$ref` failed to resolve — the referenced step name doesn't match, or its output's path doesn't exist | Confirm each prior step has a unique `name` and that the `$ref.path` is `"output.audioBlob.url"` (case-sensitive). |
| Output clips/distorts when speakers overlap | Two or more tracks at `volumeDb: 0` summing to over full-scale | Either set `"normalize": true`, or attenuate the louder track with `volumeDb: -3` to `-6`. |
| Music bed too loud against speech | Bed `volumeDb` too high | Drop the bed to `-18` to `-24` dB; voice tracks at 0 dB then sit cleanly on top. |
| Cross-talk sounds abrupt | Interrupter starts with no fade | Add `fadeInMs: 60–120` on the interrupting track. |
| `failed`, "AudioMix output would be Xs, exceeding MaxDurationSeconds" | Resolved `startSeconds + duration` exceeds the cap on at least one track | Raise `maxDurationSeconds` on the input, or shorten the tracks. |
| Mix succeeded but `tracks[]` is empty | The middleware succeeded but the timing payload didn't propagate (rare) | The `audioBlob.duration` is still reliable; recompute per-track timing client-side from the inputs you sent. |

## Related

- [Text-to-speech](./text-to-speech) — single-utterance synthesis; the building block this recipe composes.
- [Transcription](./transcription) — the inverse, useful for caption tracks over a finished mix.
- [Workflows → Dependencies](/orchestration/guide/workflows#dependencies-parallelism) — how `$ref` lets one step consume another's output.
- [Results & webhooks](/orchestration/guide/results-and-webhooks) — for workflows with several long-running TTS steps.
- The [`AudioMixInput` and `AudioMixOutput` schemas](/orchestration/reference/operations/InvokeAudioMixStepTemplate) — full parameter reference.
