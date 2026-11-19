---
title: Verify
description: Read an image's Content Credentials (C2PA) to see how it was made.
---

# Verify

Checks an image for Content Credentials, the [C2PA](https://c2pa.org/) standard's signed record of how
a file was made. The same check runs on [civitai.com/safety/is-this-ai](https://civitai.com/safety/is-this-ai).

The file is read and discarded: it is not stored, and nothing about it is logged. The check runs
offline: nothing the file points to is fetched.

## Check an image

```
POST /api/v1/verify
```

**Auth:** Mixed. Works without a token. Signed-in callers get a per-user budget.

**Body:** the raw image file (JPEG, PNG, WebP, AVIF or HEIC), up to 10 MiB, sent with a
`Content-Length` header. Not multipart.

**Rate limit:** 10 requests a minute per IP when anonymous. Signed in: 30 a minute per user, and 60
a minute per IP across all signed-in users on it.

### Response

```json
{
  "credentials": "valid",
  "signer": {
    "issuer": "C2PA Test Signing Cert",
    "commonName": "C2PA Signer",
    "signedAt": "2024-08-06T21:53:37+00:00"
  },
  "generator": "make_test_images",
  "aiGenerated": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `credentials` | `valid` \| `invalid` \| `none` \| `unreadable` | `valid`: unchanged since it was signed. `invalid`: changed after signing. `none`: no Content Credentials (most sites remove them when they resize or re-save a file). `unreadable`: credentials are present but damaged, stored remotely, or in a form the reader doesn't support. |
| `signer` | object | With `valid` and `invalid`. The certificate's `issuer`, `commonName` and signing time, as written in the file. A name is not proof of who signed: certificates aren't checked against a trust list. |
| `generator` | string | The tool the manifest says created the file, when given. |
| `aiGenerated` | boolean | `true` when the manifest declares an AI source type (IPTC `trainedAlgorithmicMedia` or `compositeWithTrainedAlgorithmicMedia`). `false` means not declared, not "not AI". |

The response doesn't yet say whether an image was made on Civitai. That comes when Civitai's own
signing and invisible watermark go live.

### Errors

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{"error":"The file is empty"}` | `Content-Length: 0`. |
| `400` | `{"error":"Upload body was incomplete"}` | Fewer bytes arrived than `Content-Length` declared. |
| `411` | `{"error":"Send the file with a Content-Length header"}` | No `Content-Length` (for example, a chunked upload). |
| `413` | `{"error":"File too large"}` | Over 10 MiB. |
| `415` | `{"error":"Send a JPEG, PNG, WebP, AVIF or HEIC image"}` | Not a supported image type. |
| `429` | `{"error":"Rate limit exceeded, please retry shortly."}` | Over the rate limit; see `Retry-After`. |

### Example

```bash
curl -X POST --data-binary @photo.jpg -H "Content-Type: image/jpeg" \
  https://civitai.com/api/v1/verify
```
