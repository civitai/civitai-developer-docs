---
title: Model version gifts
description: Claim a gift code for a paid or early-access model version, and mint, list and revoke gift codes for your own, and see who claimed them.
---

# Model version gifts

A creator of a paid or early-access model version can give access away free with **gift codes**. A
code is either a shareable link with an optional expiry and claim cap, or one of a batch of
single-use codes. Claiming a code gives the account the same access a purchase would, and no Buzz is
charged.

*Every endpoint here is authenticated with an API key or OAuth token carrying the `ModelsWrite` scope, a
full-access personal API key, or a signed-in session.* Other tokens are refused with `403`. Responses
are never cached. Creating, minting, revoking and claiming also need an account in good standing with a
verified email; otherwise they answer `403`.

Codes look like `cvg_` followed by 26 characters. Matching ignores case and hyphens.

## Claim a gift

```
POST /api/v1/model-versions/gifts/claim
```

```json
{ "code": "cvg_…" }
```

### Response

```json
{ "modelVersionId": 555, "modelId": 123, "alreadyHadAccess": false,
  "notice": "The creator can see that you claimed this." }
```

`alreadyHadAccess: true` means the account already had this access (or the version is no longer
gated), and the claim was not used up. A claim that is used up carries `notice`: the version's creator
can list the accounts that claimed their gifts. Show it to the person claiming.

| Status | When |
|--------|------|
| `400` | The code is unknown, expired, revoked or used up (one message for all four); the version is not published; or it is your own model. |
| `429` | Too many claim attempts. Retry later. |

## Mint single-use codes

```
POST /api/v1/model-versions/{id}/gifts
```

You must own the model (otherwise `403`), and the version must be gated (otherwise `400`). The same
ownership rule applies to creating, listing and revoking.

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer, 1–500 | How many codes to mint. |
| `expiresAt` | ISO date-time, optional | When the codes stop working. |
| `label` | string ≤ 100, optional | Your own note, shown in the list. |

A version can hold at most 5000 live, unclaimed codes. Minting and link creation are rate-limited per
account (`429`).

### Response (`201`)

```json
{ "batchId": "0b6f6a3e-…", "codes": ["cvg_…", "cvg_…"] }
```

**The codes are returned only here.** Civitai stores a fingerprint, not the code, so store them
yourself.

## Create a gift link

```
POST /api/v1/model-versions/{id}/gifts/link
```

| Field | Type | Description |
|-------|------|-------------|
| `maxRedemptions` | integer ≥ 1, optional | How many accounts can claim it. Omit for no limit. |
| `expiresAt` | ISO date-time, optional | When it stops working. |
| `label` | string ≤ 100, optional | Your own note. |

Returns `201` with `{ "id": 42, "code": "cvg_…" }`. Share it as `https://civitai.com/gift/<code>`;
any code, single-use ones included, can also be pasted on `https://civitai.com/gift`.

## List gift codes

```
GET /api/v1/model-versions/{id}/gifts
```

```json
{
  "links": [
    { "id": 42, "codeHint": "7KQ2", "label": null, "maxRedemptions": 10, "redemptionCount": 3,
      "expiresAt": null, "revokedAt": null, "createdAt": "2026-11-07T12:00:00.000Z" }
  ],
  "batches": [
    { "batchId": "0b6f6a3e-…", "label": "Patreon", "total": 500, "claimed": 120, "live": 380,
      "createdAt": "2026-11-07T12:00:00.000Z", "expiresAt": null }
  ]
}
```

`links` holds your gift links and `batches` one summary per batch of single-use codes, live ones first;
`live` counts codes that are still claimable. Codes themselves are never returned; who claimed them is
the next endpoint.

## List who claimed

```
GET /api/v1/model-versions/{id}/gifts/{giftId}/claims?limit=100&cursor=…
GET /api/v1/model-versions/{id}/gifts/batch/{batchId}/claims?limit=100&cursor=…
```

The accounts that claimed one gift link, or any code of one batch, newest first. Available to the
version's creator.

| Query | Type | Description |
|-------|------|-------------|
| `limit` | integer, 1–100, optional | Claims per page. Defaults to 100. |
| `cursor` | string, optional | The `nextCursor` of the previous page. |

```json
{
  "claims": [
    { "giftLinkId": 42, "userId": 1234, "username": "someone", "claimedAt": "2026-11-07T12:00:00.000Z" }
  ],
  "nextCursor": null,
  "hiddenCount": 3
}
```

`hiddenCount` (first page only; `null` on later pages) counts claims made before claimers were told the
creator can see them; those are never
listed by name. A `limit` above 100 or a malformed cursor answers `400`; a version you do not own answers `403`.

## Revoke

```
DELETE /api/v1/model-versions/{id}/gifts/{giftId}
DELETE /api/v1/model-versions/{id}/gifts/batch/{batchId}
```

Returns `{ "revoked": <count> }`. A revoked code can no longer be claimed. Accounts that already claimed
keep their access. Revoking a code that is already revoked, or that does not exist, answers `404`.
