---
title: AIR identifiers
description: The AI Resource Identifier (AIR) URN format used across Civitai and the Orchestration API.
---

# AIR identifiers

An **AI Resource Identifier** (AIR) is the canonical URN-style string Civitai
uses to reference any AI resource — a checkpoint, LoRA, VAE, embedding, or
upscaler — consistently across the site API, the Orchestration API, and
partner integrations.

Every response from [`GET /model-versions/{id}`](../reference/model-versions#get-a-model-version)
includes an `air` field you can pass directly to generation APIs.

## Format

```
urn:air:{ecosystem}:{type}:{source}:{id}[@{version}][.{format}]
```

The `urn:` and `air:` prefixes are both optional — parsers accept
`urn:air:sdxl:checkpoint:civitai:827184@2514310`,
`air:sdxl:checkpoint:civitai:827184@2514310`, and bare
`sdxl:checkpoint:civitai:827184@2514310` interchangeably. **Use the full
`urn:air:...` form** in API requests; it's the unambiguous canonical form.

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `ecosystem` | Optional | Model family bucket: `sd15`, `sdxl`, `sd3`, `flux1`, `other`, etc. |
| `type` | Optional | Resource kind: `checkpoint`, `lora`, `embedding`, `vae`, `controlnet`, `upscaler`. |
| `source` | Required | Hosting system: `civitai`, `civitai-r2`, `huggingface`, `orchestrator`. |
| `id` | Required | Resource identifier within the source. For `civitai`, this is the **model ID**. |
| `version` | Optional | Specific version (for `civitai` this is the model version ID). If omitted, the resource's default/latest version is implied. |
| `format` | Optional | Model file format, e.g. `safetensor`, `ckpt`, `diffuser`. |

## Real examples

From actual `GET /api/v1/model-versions/{id}` responses and internal workflow
templates:

```
urn:air:sdxl:checkpoint:civitai:827184@2514310
urn:air:illustrious:checkpoint:civitai:795765@900661
urn:air:other:upscaler:civitai:147759@164821
urn:air:other:other:civitai-r2:civitai-worker-assets@sam_vit_b_01ec64.pth
```

The last one is a file asset (SAM ViT-B checkpoint) stored on Civitai's R2
bucket rather than a model version.

## Type values

The `type` segment maps to Civitai's `ModelType` enum:

| AIR type | Civitai `ModelType` |
|----------|---------------------|
| `checkpoint` | `Checkpoint` |
| `lora` | `LORA` |
| `embedding` | `TextualInversion` |
| `vae` | `VAE` |
| `controlnet` | `Controlnet` |
| `upscaler` | `Upscaler` |

Resources that don't map to one of those (motion modules, detection models,
wildcards, etc.) use `other` as the type.

## Using AIR with the Orchestration API

The Orchestration API accepts AIR strings anywhere a resource is referenced.
Given a `modelVersionId` from the site API, the simplest way to get a valid
AIR is to call `GET /api/v1/model-versions/{id}` and forward the `air` field.

For example, to use `WAI-illustrious-SDXL v16.0` in a text-to-image workflow:

1. `curl https://civitai.com/api/v1/model-versions/2514310` →
   `"air": "urn:air:sdxl:checkpoint:civitai:827184@2514310"`
2. Pass that string as the checkpoint reference in your
   [Orchestration submission](/orchestration/guide/submitting-work).

## Building an AIR by hand

You can also construct an AIR directly from a Civitai model version:

```
urn:air:{baseModel}:{type}:civitai:{modelId}@{versionId}
```

Where `baseModel` comes from the model version's `baseModel` field
(`SDXL 1.0` → `sdxl`, `SD 1.5` → `sd15`, etc.) and `type` maps from the
parent model's `type` field as shown in the table above.

The site-generated `air` field already handles this mapping — prefer it over
hand-construction when you have the option.
