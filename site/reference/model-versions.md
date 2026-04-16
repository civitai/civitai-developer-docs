---
title: Model versions
description: Fetch a specific version of a Civitai model by ID or file hash.
---

# Model versions

A **model version** is a single release within a model — one set of files, a
specific `baseModel`, its own stats, and its own AIR identifier. Models may
have many versions; call these endpoints when you need a specific one.

## Get a model version

```
GET /api/v1/model-versions/{id}
```

**Auth:** Mixed. A valid token exposes a few extra fields (e.g. early-access
data for resources the caller has unlocked).

### Path parameters

| Name | Type | Description |
|------|------|-------------|
| `id` | integer | Model version ID. |

### Response

```json
{
  "id": 2514310,
  "modelId": 827184,
  "name": "v16.0",
  "description": null,
  "baseModel": "Illustrious",
  "baseModelType": "Standard",
  "air": "urn:air:sdxl:checkpoint:civitai:827184@2514310",
  "status": "Published",
  "availability": "Public",
  "nsfwLevel": 3,
  "createdAt": "2025-12-18T08:55:00.000Z",
  "updatedAt": "2025-12-18T09:16:12.062Z",
  "publishedAt": "2025-12-18T09:16:12.062Z",
  "uploadType": "Created",
  "usageControl": "Download",
  "trainedWords": [],
  "earlyAccessConfig": null,
  "earlyAccessEndsAt": null,
  "trainingStatus": null,
  "trainingDetails": null,
  "stats": { "downloadCount": 215627, "thumbsUpCount": 13828, "thumbsDownCount": 22 },
  "model": {
    "name": "WAI-illustrious-SDXL",
    "type": "Checkpoint",
    "nsfw": false,
    "poi": false,
    "minor": false
  },
  "files": [ /* see below */ ],
  "images": [ /* preview images, filtered by browsing level */ ],
  "downloadUrl": "https://civitai.com/api/download/models/2514310"
}
```

Each entry in `files[]`:

```json
{
  "id": 2402203,
  "name": "waiIllustriousSDXL_v160.safetensors",
  "type": "Model",
  "sizeKB": 6775430.35,
  "metadata": { "format": "SafeTensor", "size": "pruned", "fp": "fp16" },
  "pickleScanResult": "Success",
  "virusScanResult": "Success",
  "hashes": {
    "AutoV1": "4748A7F6",
    "AutoV2": "A5F58EB1C3",
    "SHA256": "A5F58EB1C33616...",
    "CRC32": "DAEE95B7",
    "BLAKE3": "1A411D9B...",
    "AutoV3": "22D8CB95B807"
  },
  "downloadUrl": "https://civitai.com/api/download/models/2514310",
  "primary": true
}
```

Returns `404` if the version doesn't exist or isn't published (moderators
bypass the published check).

### Notes

- The `air` field is the canonical [AIR identifier](../guide/air). Forward it directly to the Orchestration API when you need to reference this resource in a workflow.
- `images[]` respects the caller's browsing level — SFW-gated callers never see mature previews. On Civitai's "green" domain or from restricted regions, images are filtered to SFW regardless of session.
- `files[]` only contains public files. Private / archived files are omitted.

### Example

```bash
curl "https://civitai.com/api/v1/model-versions/2514310" | jq '{id, name, air, downloadUrl}'
```

## Get a model version by file hash

```
GET /api/v1/model-versions/by-hash/{hash}
```

**Auth:** Public.

Useful when you have a local file and want to identify the model without
downloading anything from Civitai. Accepts any of the hash types Civitai
records: `AutoV1`, `AutoV2`, `AutoV3`, `SHA256`, `BLAKE3`, or `CRC32`. The
hash is matched case-insensitively.

### Path parameters

| Name | Type | Description |
|------|------|-------------|
| `hash` | string | File hash. |

### Response

Same shape as `GET /model-versions/{id}`.

Returns `404` if no matching file is found, or the file belongs to an
unpublished version.

### Example

```bash
# Identify a local .safetensors by its SHA256
sha256sum model.safetensors
# a5f58eb1c33616c4f06bca55af39876a7b817913cd829caa8acb111b770c85cc

curl "https://civitai.com/api/v1/model-versions/by-hash/A5F58EB1C33616C4F06BCA55AF39876A7B817913CD829CAA8ACB111B770C85CC" \
  | jq '{id, modelId, name, air}'
```
