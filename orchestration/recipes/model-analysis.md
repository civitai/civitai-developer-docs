---
title: Model merge analysis
---

<script setup>
const analysisBody = {
  steps: [{
    $type: 'modelAnalysis',
    name: 'analysis',
    input: {
      baseModel: 'urn:air:krea2:checkpoint:civitai:2726029@3064584+2943406',
      checkpoint: 'urn:air:krea2:checkpoint:civitai:2729631@3107962+2992026',
      loras: [{ model: 'urn:air:krea2:lora:civitai:2688234@3070702+2949534' }],
    },
  }],
};
</script>

# Model merge analysis

The `modelAnalysis` step checks whether changes between a checkpoint and its exact base contain evidence of the specified LoRAs. It runs on CPU workers and reuses fingerprints and reports from shared blob storage.

This moderation tool requires a verified Moderator or internal Manager identity. Moderator API keys need UserRead to verify their role and the spend scope required by workflow submission. The analysis step itself has no Buzz charge. Ordinary consumer tokens receive `403` on both submission routes, including estimates.

## Submit a check

Send this body to [`POST /v2/consumer/workflows`](/orchestration/reference/operations/SubmitWorkflow). Use AIRs pinned to safetensors versions/files; a Civitai page URL must first be resolved to an AIR by your application.

```json
{
  "steps": [{
    "$type": "modelAnalysis",
    "name": "analysis",
    "input": {
      "baseModel": "urn:air:krea2:checkpoint:civitai:2726029@3064584+2943406",
      "checkpoint": "urn:air:krea2:checkpoint:civitai:2729631@3107962+2992026",
      "loras": [{ "model": "urn:air:krea2:lora:civitai:2688234@3070702+2949534" }]
    }
  }]
}
```

<RecipeRun :body="analysisBody" />

| Input | Meaning |
|---|---|
| `baseModel` | The exact original checkpoint. A different base can hide a match or make a result inconclusive. |
| `checkpoint` | The checkpoint being investigated. |
| `loras` | One to eight candidate LoRAs. Each has a `model` AIR. |
| `loras[].strength` | Optional expected strength, from -10 to 10; defaults to 1. The actual strength is estimated independently. |

The default step timeout is one hour; it can be set to a positive duration of at most 24 hours. First-time checks may need model downloads and fingerprint jobs. DoRA fingerprints are tied to the supplied base. Some adapter combinations depend on merge order and must be checked separately.

For this example, the tested result was `Supporting evidence`, with a fitted strength of about `0.7502`. Set `checkpoint` equal to `baseModel` for a negative example.

## Receive the result

Poll [`GET /v2/consumer/workflows/{workflowId}`](/orchestration/reference/operations/GetWorkflow), or use [completion webhooks](/orchestration/guide/results-and-webhooks). A callback with `type: ["workflow:succeeded"]` and `detailed: true` includes the report under `details.steps[0].output`.

On success, `steps[0].output.report` contains the typed report, including each candidate's `verdict`, `fittedStrength`, `verificationStrength`, layer coverage and warnings. `steps[0].output.blob.url` downloads the original report JSON. Workflow responses use camelCase; the original report uses PascalCase field names.

Candidate verdicts are `Supporting evidence`, `No signal detected`, or `Inconclusive`. These are evidence assessments, not probabilities or proof of authorship. A negative result only concerns the supplied LoRAs and base.

[`POST /v2/consumer/recipes/modelAnalysis`](/orchestration/reference/operations/InvokeModelAnalysisStepTemplate) accepts the `input` object directly and waits for the output. Prefer workflow submission for checks that may need large downloads: the workflow ID lets your application poll, cancel, or reconnect after the HTTP request ends.
