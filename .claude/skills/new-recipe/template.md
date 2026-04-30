---
title: {{TITLE}}
---

<script setup>
// One `const <name>Body` per `<RecipeRun>` on the page. Plain data literals only —
// no imports, no computed values; the test-doc-samples.mjs harness evaluates this
// script in a sandbox that strips imports.

const sampleImage = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/{{SAMPLE_IMAGE_PATH}}';

const {{OP1_NAME}}Body = {
  steps: [{
    $type: '{{STEP_TYPE}}', // imageGen | videoGen | audioGen | trainingJob | textGen | ...
    input: {
      engine: '{{ENGINE}}',
      // model | version | provider | operation as appropriate for this engine
      prompt: '{{SAMPLE_PROMPT}}',
      // engine-specific params
    },
  }],
};
</script>

# {{TITLE}}

{{ONE_PARAGRAPH_INTRO}} The orchestrator exposes {{WHAT}} via the `{{STEP_TYPE}}` step.

{{IF_VARIANTS}}

## Variants at a glance

| `{{VARIANT_KEY}}` | Operations | Notes |
|---|---|---|
| `{{V1}}` | {{OPS}} | {{NOTES}} |
| `{{V2}}` | {{OPS}} | {{NOTES}} |

**Default choice for new integrations**: `{{VARIANT_KEY}}: "{{DEFAULT}}"`.

{{/IF_VARIANTS}}

## The request shape

Every {{ENGINE}} request is a single `{{STEP_TYPE}}` step on [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow):

```json
{
  "$type": "{{STEP_TYPE}}",
  "input": {
    "engine": "{{ENGINE}}",
    "{{VARIANT_KEY}}": "{{DEFAULT}}",
    "operation": "{{DEFAULT_OP}}"
  }
}
```

## Operations

### {{OP1_NAME}}

{{OP1_DESCRIPTION}}

```http
POST https://orchestration.civitai.com/v2/consumer/workflows?wait=60
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "steps": [{
    "$type": "{{STEP_TYPE}}",
    "input": {
      "engine": "{{ENGINE}}",
      "operation": "{{OP1_NAME}}",
      "prompt": "{{SAMPLE_PROMPT}}"
    }
  }]
}
```

<RecipeRun :body="{{OP1_NAME}}Body" />

#### Parameters

| Field | Default | Allowed | Notes |
|---|---|---|---|
| `prompt` | — ✅ | string | {{NOTES}} |
| {{FIELD}} | {{DEFAULT}} | {{ALLOWED}} | {{NOTES}} |

## Reading the result

```json
{
  "status": "succeeded",
  "steps": [{
    "name": "0",
    "$type": "{{STEP_TYPE}}",
    "status": "succeeded",
    "output": {
      "{{OUTPUT_KEY}}": { "id": "blob_...", "url": "https://.../signed.{{EXT}}" }
    }
  }]
}
```

Blob URLs are signed and expire — refetch the workflow or call [`GetBlob`](/orchestration/reference/operations/GetBlob) for a fresh URL; download the bytes if you need durable storage.

## Runtime

| Variant | Per-call wall time | `wait` recommendation |
|---|---|---|
| {{V1}} | {{TIME}} | `wait={{N}}` |

For anything past the 100 s request timeout, use webhooks — see [Results & webhooks](/orchestration/guide/results-and-webhooks).

## Cost

Billed in Buzz on the workflow's `transactions`. Use `whatif=true` for an exact preview; see [Payments (Buzz)](/orchestration/guide/submitting-work#payments-buzz) for currency selection.

| {{DIM}} | Buzz |
|---|---|
| {{TIER}} | {{N}} |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `400` with "{{...}}" | {{CAUSE}} | {{FIX}} |
| Step `failed`, `reason = "blocked"` | Content moderation | Don't retry the same input — see [Errors & retries → Step-level failures](/orchestration/guide/errors-and-retries#step-level-failures). |

## Related

- [`SubmitWorkflow`](/orchestration/reference/operations/SubmitWorkflow) — operation used by every example here
- [`GetWorkflow`](/orchestration/reference/operations/GetWorkflow) — for polling
- {{SIBLING_RECIPE_LINK}}
- Full parameter catalog: the `{{INPUT_SCHEMA_NAMES}}` schemas in the [API reference](/orchestration/reference/)
