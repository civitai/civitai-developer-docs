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
  "stats": { "downloadCount": 215627, "thumbsUpCount": 13828 },
  "model": {
    "name": "WAI-illustrious-SDXL",
    "type": "Checkpoint",
    "nsfw": false,
    "poi": false
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
- `model.mode` appears as `Archived` or `TakenDown` when the parent model has been moderated. When archived, `files[]` and `downloadUrl` are dropped; when taken down, `images[]` is dropped as well. The field is omitted entirely on healthy models.
- `stats` has only `downloadCount` and `thumbsUpCount` here — model-version-level metrics. Use [`GET /models/{id}`](./models#get-a-model) if you need the full set including comments and tipping.

### Example

```bash
curl "https://civitai.com/api/v1/model-versions/2514310" | jq '{id, name, air, downloadUrl}'
```

<ApiTry path="/api/v1/model-versions/2514310" />

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

<ApiTry path="/api/v1/model-versions/by-hash/A5F58EB1C33616C4F06BCA55AF39876A7B817913CD829CAA8ACB111B770C85CC" />

## Bulk lookup by hash

```
POST /api/v1/model-versions/by-hash
```

**Auth:** Public.

Same as `GET /by-hash/{hash}`, but takes up to **100** SHA256 hashes in a
single request. Useful when scanning a directory of local files. Hashes
shorter or longer than 64 characters are rejected (`400`); each must be the
full SHA256.

### Request body

```json
[
  "A5F58EB1C33616C4F06BCA55AF39876A7B817913CD829CAA8ACB111B770C85CC",
  "B7C9D1F2A3E4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D9E0F1A2B3C4D5E6F7A8B9C0"
]
```

### Response

An array of model version objects, same shape as `GET /model-versions/{id}`.
Hashes that don't match any file are silently dropped — the response can
have fewer entries than the request.

```json
[
  { "id": 2514310, "modelId": 827184, "name": "v16.0", "...": "..." }
]
```

### Errors

| Status | Cause |
|--------|-------|
| `400` | Missing body, non-array, hash not 64 chars, or more than 100 entries. The error message lists the first parse failure. |

### Example

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '["A5F58EB1...","B7C9D1F2..."]' \
  "https://civitai.com/api/v1/model-versions/by-hash"
```

::: tip
If you only need the IDs (e.g. to feed back into the Orchestration API or to
de-duplicate a download list), use the lighter
[`/by-hash/ids`](#bulk-lookup-hash-id) endpoint below — it returns just
`{modelVersionId, hash}` pairs and is cheaper.
:::

## Bulk lookup hash → ID {#bulk-lookup-hash-id}

```
POST /api/v1/model-versions/by-hash/ids
```

**Auth:** Public.

Resolves SHA256 hashes to model version IDs only. Accepts up to **10,000**
hashes per call. Use this when you don't need the full version object —
e.g. to dedupe a download list or to map local files back to Civitai IDs in
bulk.

### Request body

```json
[
  "A5F58EB1C33616C4F06BCA55AF39876A7B817913CD829CAA8ACB111B770C85CC",
  "B7C9D1F2A3E4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D9E0F1A2B3C4D5E6F7A8B9C0"
]
```

### Response

```json
[
  { "modelVersionId": 2514310, "hash": "A5F58EB1C33616C4F06BCA55AF39876A7B817913CD829CAA8ACB111B770C85CC" }
]
```

Unmatched hashes are silently dropped.

### Example

```bash
# Map a manifest of local files to model version IDs
jq -r '.files[].sha256' manifest.json \
  | jq -R . | jq -s . \
  | curl -X POST -H "Content-Type: application/json" -d @- \
      "https://civitai.com/api/v1/model-versions/by-hash/ids"
```

## Get a minimal model version

```
GET /api/v1/model-versions/mini/{id}
```

**Auth:** Mixed.

A trimmed-down version of `GET /model-versions/{id}`, intended for clients
that need the bare minimum to **download a file** or **identify whether the
caller can generate** with it. Skips heavy fields like `images[]`,
`description`, and the full `files[]` array.

### Path parameters

| Name | Type | Description |
|------|------|-------------|
| `id` | integer | Model version ID. |

### Query parameters

| Name | Type | Description |
|------|------|-------------|
| `epoch` | integer | For `Private` training-result versions, request a specific epoch's file. Falls back to the last epoch if omitted. |

### Response

```json
{
  "air": "urn:air:sdxl:checkpoint:civitai:827184@2514310",
  "versionName": "v16.0",
  "modelName": "WAI-illustrious-SDXL",
  "baseModel": "Illustrious",
  "availability": "Public",
  "publishedAt": "2025-12-18T09:16:12.062Z",
  "size": 6775430.35,
  "fileType": "Model",
  "fileName": "waiIllustriousSDXL_v160.safetensors",
  "hashes": {
    "AutoV1": "4748A7F6",
    "AutoV2": "A5F58EB1C3",
    "SHA256": "A5F58EB1C33616...",
    "CRC32": "DAEE95B7",
    "BLAKE3": "1A411D9B...",
    "AutoV3": "22D8CB95B807"
  },
  "downloadUrls": ["https://civitai.com/api/download/models/2514310"],
  "format": "SafeTensor",
  "canGenerate": true,
  "isFeatured": false,
  "requireAuth": false,
  "checkPermission": false,
  "earlyAccessEndsAt": null,
  "freeTrialLimit": null,
  "additionalResourceCharge": false,
  "minor": false,
  "sfwOnly": false
}
```

### Field notes

| Field | Description |
|-------|-------------|
| `canGenerate` | `true` when the resource can be used in an Orchestration workflow for the calling user. Combines coverage, availability, and permission checks. |
| `checkPermission` | `true` when the resource is gated (early-access window active, or `Private`). Pair with [`/permissions/check`](./permissions) for an explicit yes/no. |
| `requireAuth` | When `true`, the `downloadUrls` require a token (passed as `Authorization: Bearer` or `?token=`). |
| `earlyAccessEndsAt` | Only present when `checkPermission` is `true`. ISO timestamp when the early-access window ends. |
| `freeTrialLimit` | Number of free generations allowed during early access, when configured. |
| `additionalResourceCharge` | `true` when generating with this resource costs extra Buzz beyond the base workflow cost. |

Returns `404` if the version doesn't exist, isn't published, the primary
file is missing, or (for private training results) the requested `epoch`
isn't found.

### Example

```bash
# Just the download URL and SHA256, fast
curl "https://civitai.com/api/v1/model-versions/mini/2514310" \
  | jq '{air, downloadUrls, "sha256": .hashes.SHA256}'
```

<ApiTry path="/api/v1/model-versions/mini/2514310" />
