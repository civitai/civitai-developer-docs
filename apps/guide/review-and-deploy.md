---
title: Review, approval and deploy
description: What happens to a Civitai App after civitai app submit — the review and deploy lifecycle, tracking it, the recorded source commit, and withdrawing a submission.
sources:
  - go:github.com/civitai/cli
---

# Review, approval and deploy

`civitai app submit` is not a deploy. It packages your **source** tree, uploads
it, and creates a **publish request** that a Civitai moderator reviews. This
page covers reading and steering what happens next from the terminal.

New here? Start with the [quickstart](./quickstart), and run the
[first review checklist](./first-review) before you submit. Every flag is in
the generated [CLI reference](../reference/cli).

## The lifecycle

1. **submit** — `civitai app submit` uploads the bundle and creates a publish
   request. The submission's status is `pending` and it appears under
   `/apps/my-submissions` on civitai.com.
2. **review** — a moderator reads the manifest and the files, then **approves**
   or **rejects**. A rejection carries a reason you can read from the terminal,
   fix, and resubmit against.
3. **deploy** — on **approval** the platform injects its build recipe, builds
   the image, deploys it, and programs the `<blockId>.civit.ai` DNS record. A
   few minutes after approval the app serves at `https://<blockId>.civit.ai/`.

::: warning Before approval, `https://<blockId>.civit.ai/` returns 404
The DNS record is programmed by the **deploy** step, which runs only on
approval, so a 404 while your submission is `pending` is expected. You can
still iterate against the real backend: the dev token mint accepts a pending
slug, so `npm run dev:live` works — see [Local dev loop](./local-dev).
:::

Submitting also mints your **store listing** as a draft — see
[Your store listing](./store-listing).

## Tracking a submission

`civitai app status` reads `GET /api/v1/blocks/submissions`, which returns only
your **own** submissions. An OAuth login needs the Apps submit scope, which the
default `civitai login` grants.

With no argument it lists every submission it got back, newest first:

```console
$ civitai app status
BLOCK_ID    VERSION  STATUS    DEPLOY    SOURCE            SUBMITTED   URL
gen-matrix  0.6.0    approved  live      a1b2c3d           2026-06-22  https://gen-matrix.civit.ai/
my-block    0.2.0    pending   -         9f4e0aa (dirty)   2026-06-21  -
old-app     0.1.0    approved  building  -                 2026-06-19  -
```

Pass a `blockId` (your app slug), or `--id <pubreq_…>`, for one submission in
detail — including the **rejection reason** when it was rejected, and the live
URL once it is approved and deployed:

```console
$ civitai app status gen-matrix
Block ID:         gen-matrix
Version:          0.6.0
Publish request:  pubreq_01HZX
Status:           rejected
Deploy state:     -
Source commit:    a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 (reported clean)
Submitted:        2026-06-22 09:05 CDT
Reviewed:         2026-06-22 11:40 CDT
  Reported by the client that submitted it; the server stores it unverified.

Rejection reason:
  the budgeted scope needs the per-app Sybil cap signed off first

Not live yet — gen-matrix.civit.ai only serves after the app is approved and deployed (deployState 'live').
```

An approved, deployed submission ends with `Live at:` and the app's
`<blockId>.civit.ai` URL instead of that last line.

### The listing is capped at 100 rows, and cannot be paged

The unfiltered listing is capped **server-side at 100 submissions**, with no
cursor or total, so it cannot be paged. When exactly 100 come back, the CLI
notes on **stderr** that older submissions *may* exist:

```
note: the server returned the newest 100 submissions — the API caps this listing and offers no way to page, so older submissions may exist but are not listed. Look up a specific app with `civitai app status <blockId>`.
```

A **per-app** lookup (`civitai app status <blockId>`) is unaffected — the
server narrows to the slug before capping.

`--limit N` only trims what is **displayed** (in `--json` too: `--limit 5
--json` emits five records); it cannot reach submissions the API did not
return, and it does not suppress the cap note. `--limit 0`, a negative value,
or `--limit` with a `blockId` or `--id` is refused (exit `2`).

### Scripting it

`--json` emits one object with a `submissions` array. Notes such as the cap
caveat go to **stderr**, so stdout stays parseable and the exit code stays `0`:

```bash
civitai app status --limit 5 --json | jq -r '.submissions[] | "\(.blockId) \(.status)"'
```

An empty list prints a friendly "run `civitai app submit`" hint on the human
rendering; with no credential configured the command points you at
`civitai login` instead.

### Off-site apps have no submissions at all

An **off-site** app is a registered URL, so it never enters the
block-submission pipeline. Where the CLI can tell, it says so:

```console
$ civitai app status my-offsite-app
Error: `my-offsite-app` is an OFFSITE app (registered at https://example.com/), so it has no block submissions — `civitai app status` reads the block-submission pipeline (submit → review → deploy), and an offsite app is a registered URL rather than a block bundle, so there is nothing here to be pending, approved or deployed. Nothing is missing and `civitai app submit` would not create one.
Run `civitai app view my-offsite-app` for what the CLI can show about this app
```

That exits `4`, like any slug this lookup cannot resolve. Recognising the
off-site case needs an extra lookup that cannot always answer, so you may get
the generic `no such submission … run civitai app submit first` message
instead — still exit `4`.

## Build provenance: which commit is live?

`civitai app submit` records the commit it packaged from, and
`civitai app status` shows it. A submit that really uploads sends:

- **`sourceCommit`** — the full 40-character SHA of `HEAD` in the packaged
  directory's repository.
- **`sourceDirty`** — `true` when files that went into the bundle were
  uncommitted (only reachable with `--allow-dirty`), `false` when the tree was
  clean.

::: danger It is a CLAIM, not a proof
The server stores what the client reported and **cannot check** that the bundle
was built from that commit — the CLI prints `Reported by the client that
submitted it; the server stores it unverified` wherever it shows the value. It
is a good pointer, not an attestation.
:::

A missing stamp **never fails a submit.** Nothing is sent when the directory is
in no git repository (every scaffolded app starts that way), with no `git` on
`PATH`, with no commits yet, or when the value is not exactly the shape the
server accepts (`^[0-9a-f]{40}$` — a malformed one would `400` the whole
upload).

Reading it back, `sourceDirty` is a **tri-state**:

| JSON value | `SOURCE` column | meaning |
| --- | --- | --- |
| `null` (or absent) | `-`, or `a1b2c3d (dirty?)` when only the commit is known | **nobody reported it** — submitted before this shipped, from a non-repository, or by another client |
| `false` | `a1b2c3d` | a client **asserted** the tree was clean |
| `true` | `a1b2c3d (dirty)` | a client asserted uncommitted changes went into the bundle |

Do not collapse `null` and `false` in a script. The table shows seven
characters; the detail view and `--json` carry all forty.

## Is your repo behind what you shipped?

A checkout can fall **behind its own live deployment** — someone released 0.5.2
and your working copy is still on 0.4.0. Submitting from there is accepted and,
on approval, **replaces newer code with older code**.

So the detail view (`app status <blockId>` or `--id`), run **from inside that
app's directory**, compares the local `block.manifest.json` with your **highest
approved** version and warns on **stderr**:

```console
$ civitai app status custom-generators
Block ID:         custom-generators
Version:          0.7.0
...

⚠ local block.manifest.json is 0.4.0 — BEHIND the highest APPROVED version of custom-generators, which is 0.5.2.
  An approved version is what gets deployed, so submitting from this repo would replace newer code on approval.
  Sync the released code (civitai app pull . --app custom-generators) or raise the local version above 0.5.2 before civitai app submit.
```

Fix it with `civitai app pull . --app <slug>` — **the `.` matters**: without it
`app pull` clones into a nested `./<slug>` and leaves your checkout behind — or
raise the local version above the published one if your local work really is
newer.

The warning never changes the exit code and never touches `--json` stdout. It
speaks only when you are **behind** and the CLI is sure: no local manifest, an
unreadable or other app's manifest, a failed lookup, nothing approved yet, or a
version it cannot order all mean silence. Versions with a pre-release or build
suffix (`-rc1`, `-beta.2`, `-3-gabc123`, `+build.7`) are not compared: a
suffixed local version gives no warning, and a suffixed approved version is
skipped.

"Highest approved" is not the newest row (that can be a `pending` resubmission
or a `withdrawn` duplicate). `civitai app submit`'s downgrade refusal uses the
same rule, so the two commands always quote the same number.

## Deployed is not the same as listed in the store

`civitai app status` and `civitai app view` read **different resources**:

- `civitai app status <slug>` reads your **submission pipeline**
  (`GET /api/v1/blocks/submissions`) — review status, deploy state, live URL.
- `civitai app view <slug>` reads the **public store catalog**
  (`GET /api/v1/apps/{slug}`) — the published store listing.

So `app status` can show `approved / live` with a working `<slug>.civit.ai` URL
while `app view <slug>` returns **not found** (exit `4`). The store lists an app
only once its **store listing** is published — which needs an icon and a cover,
see [Your store listing](./store-listing) — and the catalog itself is still
gated by a launch flag while the store is pre-GA. On a slug **you own**, the
CLI names both next commands instead of a bare "App not found".

## Changing the bundle while a request is still pending

There is no "edit a pending submission". Withdraw it to free the slug, then
resubmit:

```bash
civitai app status                          # find the pubreq_ id
civitai app withdraw pubreq_01HZX           # frees the slug — and DELETES the store listing
civitai app submit                          # resubmit the new bundle (listing starts EMPTY)
civitai app listing set-icon ./assets/icon.png    # re-attach the media
```

::: danger Withdrawing a first-version submission deletes that app's store listing
It deletes the icon, the cover and **every screenshot with its caption**,
server-side; the CLI cannot opt out. Resubmitting mints an **empty** listing.
A moderator *rejecting* a first-version submission keeps the draft listing and
its media, so a re-submit lands on the same listing; that applies to apps
hosted on `civit.ai`; an off-site app's draft listing is still deleted when it
is rejected.

A withdraw of a subsequent version, whose listing is already **approved**,
leaves the live listing alone.
:::

`civitai app withdraw` therefore **asks first** on a terminal and **refuses** in
a non-interactive shell unless you pass `--yes`.

- Only a **`pending`** request can be withdrawn.
- Withdrawing an already-withdrawn request still succeeds, but the listing the
  first withdraw deleted does not come back.

So attach listing media **after** the submission you intend to keep.

## Next

- [First review checklist](./first-review) — what to check before the next
  submission, and how to confirm the live build after approval.
- [Your store listing](./store-listing) — the icon, cover and screenshots your
  app needs before it can publish, and what changes when the listing is live.
- [Local dev loop](./local-dev) — iterating against the real backend while your
  app is still in review.
- [CLI reference](../reference/cli) — every command, flag and example, generated
  from the binary.
- [CLI troubleshooting](/site/guide/cli-troubleshooting) — look up the exact
  message `app submit`, `app status` or `app withdraw` printed at you.
