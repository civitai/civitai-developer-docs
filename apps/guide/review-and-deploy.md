---
title: Review, approval and deploy
description: What happens to a Civitai App after civitai app submit — the pending/approved/deployed lifecycle, how to track it, what the recorded source commit does and does not prove, and how to withdraw a submission without losing your store listing.
sources:
  - go:github.com/civitai/cli
---

# Review, approval and deploy

`civitai app submit` is not a deploy. It packages your **source** tree, uploads
it, and creates a **publish request** that a Civitai moderator has to look at.
Everything after that happens on the platform's side, and this page is about
reading and steering it from the terminal.

If you have not submitted anything yet, start with the
[quickstart](./quickstart). For every command and flag named below, the
generated [CLI reference](../reference/cli) is the authority — this page
explains the lifecycle, not the flag list.

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
Submitting does not make the subdomain serve. The DNS record is programmed as
part of the **deploy** step, which only runs on approval. A 404 there while your
submission is `pending` is the expected state, not a broken deploy.

You do **not** have to wait for it to iterate against the real backend: the dev
token mint accepts a pending slug, so `npm run dev:live` works against an
un-approved app. See [Local dev loop](./local-dev).
:::

Submitting also mints your **store listing** as a draft, which is why the
listing media commands work while you are still in review. That half of the
story is on [Your store listing](./store-listing).

## Tracking a submission

`civitai app status` reads the token-authenticated, self-scoped route
`GET /api/v1/blocks/submissions`. You only ever see your **own** submissions —
the same credential that submitted can read the status. An OAuth login needs the
Apps submit scope, which the default `civitai login` already grants.

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

The unfiltered listing is capped **server-side at 100 submissions**, and the
route returns neither a cursor nor a total. There is therefore no way to page it
and no way to know how many rows were dropped. When a full-length page comes
back, the CLI says so on **stderr** rather than presenting it as your complete
history:

```
note: the server returned the newest 100 submissions — the API caps this listing and offers no way to page, so older submissions may exist but are not listed. Look up a specific app with `civitai app status <blockId>`.
```

That is an inference — a page that is exactly full is indistinguishable from one
that was truncated — which is why it says *may*. A **per-app** lookup
(`civitai app status <blockId>`) is not affected: the server narrows to the slug
before it applies the cap.

`--limit N` is a **display** limit, not a page size. This route accepts no limit
and no cursor, so the CLI fetches the same page either way and prints fewer rows
of it. Two consequences:

- `--limit` **cannot reach submissions the API did not return**, and it does not
  suppress the cap note — if the server capped the page, you are still told.
- It applies to `--json` as well, so `--limit 5 --json` emits five records.

`--limit 0` or a negative value is refused as a usage mistake (exit `2`), and so
is combining `--limit` with a `blockId` or `--id` — a single submission cannot be
limited, and silently ignoring the flag would be worse than saying so.

### Scripting it

`--json` emits the submissions as one object with a `submissions` array. Notes
like the cap caveat go to **stderr**, so stdout stays a pure, parseable payload
and the exit code stays `0`:

```bash
civitai app status --limit 5 --json | jq -r '.submissions[] | "\(.blockId) \(.status)"'
```

An empty list prints a friendly "run `civitai app submit`" hint on the human
rendering; with no credential configured the command points you at
`civitai login` instead.

### Off-site apps have no submissions at all

An **off-site** app is a registered URL rather than a block bundle, so it never
enters the block-submission pipeline. Where the CLI can tell, asking about one
says that instead of telling you to submit:

```console
$ civitai app status my-offsite-app
Error: `my-offsite-app` is an OFFSITE app (registered at https://example.com/), so it has no block submissions — `civitai app status` reads the block-submission pipeline (submit → review → deploy), and an offsite app is a registered URL rather than a block bundle, so there is nothing here to be pending, approved or deployed. Nothing is missing and `civitai app submit` would not create one.
Run `civitai app view my-offsite-app` for what the CLI can show about this app
```

That exits `4`, the same code as any other slug this lookup cannot resolve.
Recognising the off-site case takes one extra lookup that cannot always answer,
so you sometimes get the generic `no such submission … run civitai app submit
first` message instead — on the same exit `4`. The wording is best-effort; the
exit code is not.

## Build provenance: which commit is live?

The bundle is packaged from what is on disk, so without a recorded commit a live
version cannot be traced back to source at all. `civitai app submit` records it
and `civitai app status` shows it.

What a submit that really uploads sends:

- **`sourceCommit`** — the full 40-character SHA of `HEAD` in the packaged
  directory's repository.
- **`sourceDirty`** — `true` when files that went into the bundle were
  uncommitted (only reachable with `--allow-dirty`, which is exactly the case
  worth recording), `false` when the tree was clean.

::: danger It is a CLAIM, not a proof
The server stores what the client reported and **cannot check** that the bundle
was built from that commit. A different machine, a different client, or a
modified one all produce a row that looks identical. The CLI says so wherever it
prints the value — `Reported by the client that submitted it; the server stores
it unverified` — and you should read it the same way. It is a very good pointer
and it is not an attestation.
:::

It also **degrades rather than guessing, and a missing stamp never fails a
submit.** Nothing is sent when the packaged directory is in no git repository
(every scaffolded app starts that way), when there is no `git` on `PATH`, when
the repository has no commits yet, or when the CLI cannot resolve a value in
exactly the shape the server accepts (`^[0-9a-f]{40}$`). The server answers a
malformed `sourceCommit` with a `400` that fails the whole upload, so the CLI
sends *nothing* rather than something it is unsure of.

Reading it back, `sourceDirty` is a **tri-state**, and the difference is
load-bearing:

| JSON value | `SOURCE` column | meaning |
| --- | --- | --- |
| `null` (or absent) | `-`, or `a1b2c3d (dirty?)` when only the commit is known | **nobody reported it** — submitted before this shipped, from a non-repository, or by another client |
| `false` | `a1b2c3d` | a client **asserted** the tree was clean |
| `true` | `a1b2c3d (dirty)` | a client asserted uncommitted changes went into the bundle |

`null` and `false` are different answers: do not collapse them in a script. The
table abbreviates to seven characters for width; the detail view and `--json`
both carry all forty.

## Is your repo behind what you shipped?

A checkout can fall **behind its own live deployment** — you, or a teammate,
released 0.5.2, and then you came back to a working copy still on 0.4.0.
Submitting from there is accepted, and on approval it **replaces newer code with
older code** while the version number reads like an ordinary forward bump.

So when you ask about a single submission **from inside that app's directory**,
`civitai app status` compares the local `block.manifest.json` against your
**highest approved** version of the same app and warns on **stderr**:

```console
$ civitai app status custom-generators
Block ID:         custom-generators
Version:          0.7.0
...

⚠ local block.manifest.json is 0.4.0 — BEHIND the highest APPROVED version of custom-generators, which is 0.5.2.
  An approved version is what gets deployed, so submitting from this repo would replace newer code on approval.
  Sync the released code (civitai app pull . --app custom-generators) or raise the local version above 0.5.2 before civitai app submit.
```

The remedy is `civitai app pull . --app <slug>` — **the `.` matters.** Without a
`[dir]` argument, `app pull` clones into `./<slug>`, which from inside the
checkout would create a second copy nested in your repository and leave the
checkout itself just as far behind. Raising the local version above the
published one is equally legitimate, and is what you want when the local work
really is newer.

What the warning deliberately does **not** do:

- **It never changes the exit code.** It is a warning, not a refusal — nothing
  that scripts `app status` starts failing because a repository is out of date.
- **It goes to stderr**, like the cap caveat, so `--json` stdout stays a pure
  payload on both renderings.
- **It says nothing unless it is sure.** No local manifest, an unreadable one, a
  manifest for a *different* app, a version on either side the CLI cannot order,
  a listing lookup that fails, or nothing approved yet — every one of those is
  silence. A false "your repo is behind" would send you to re-pull released code
  for no reason.
- **It only speaks when you are BEHIND.** Being *ahead* is the normal state of a
  repository about to release; being *equal* is the healthy state right after
  one.
- **It is scoped to the detail view** (`app status <blockId>` or `--id`). The
  bare listing is many apps at once and has no single version line to attach to.

**Pre-release and build metadata are not ordered at all.** A version carrying a
`-rc1`, `-beta.2`, `-3-gabc123` or `+build.7` suffix is treated as *not
comparable* rather than reduced to its numeric triple, because real semver ranks
`0.5.0` **above** `0.5.0-beta.1` while a truncating compare calls them equal and
ranks `0.6.0-rc.1` above `0.5.2`. So a **local** version with a suffix produces
no drift warning, and an **approved** version with a suffix is skipped rather
than quoted as "the highest APPROVED version".

The reference is your **highest approved** version, which is deliberately not
the same thing as the newest row: the newest row can be a `pending` resubmission
or a `withdrawn` duplicate, and neither is code anyone is running.
`civitai app submit`'s own downgrade refusal measures against the same
predicate over the same rows, so the two commands cannot quote different numbers
for the same repository.

## Deployed is not the same as listed in the store

`civitai app status` and `civitai app view` read **different resources**, and an
app can legitimately be in one and not the other:

- `civitai app status <slug>` reads your **submission pipeline**
  (`GET /api/v1/blocks/submissions`) — review status, deploy state, live URL.
- `civitai app view <slug>` reads the **public store catalog**
  (`GET /api/v1/apps/{slug}`) — the published store listing.

So `app status` can show `approved / live` with a working `<slug>.civit.ai` URL
while `app view <slug>` returns **not found** and exits `4`. That 404 is
truthful and says nothing about your deploy: the store lists an app only once its
**store listing** is published — which needs an icon and a cover, see
[Your store listing](./store-listing) — and the catalog itself is still gated by
a launch flag while the store is pre-GA. When the 404 lands on a slug **you
own**, the CLI detects that and names both next commands instead of leaving you
with a bare "App not found".

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
It deletes the icon, the cover and **every screenshot with its caption**. That
is server-side and the CLI cannot opt out of it: the withdraw route takes the
publish-request id and nothing else. Resubmitting mints an **empty** listing —
the media does not come back, and neither do the captions.

**The same discard happens when a moderator rejects a first-version
submission.** What "carries forward" is *approval*: media survives a moderator
approving the app, and does not survive the app leaving review any other way.

A withdraw on an app whose listing is already **approved** — a subsequent
version — leaves the live listing alone.
:::

Because that is irreversible, `civitai app withdraw` **asks first** on a
terminal and **refuses** in a non-interactive shell unless you pass `--yes`.

Two further properties worth knowing before you script it:

- Only a **`pending`** request can be withdrawn. An already approved, rejected or
  withdrawn one cannot.
- It is **idempotent with respect to the submission** — withdrawing an
  already-withdrawn request still succeeds. That idempotency does **not** extend
  to the listing: the first withdraw deleted it, and a second call does not
  bring it back.

The practical rule that falls out of all of this: attach your listing media
**after** the submission you intend to keep, not before one you may withdraw.

## Next

- [Your store listing](./store-listing) — the icon, cover and screenshots your
  app needs before it can publish, and what changes when the listing is live.
- [Local dev loop](./local-dev) — iterating against the real backend while your
  app is still in review.
- [CLI reference](../reference/cli) — every command, flag and example, generated
  from the binary.
- [CLI troubleshooting](/site/guide/cli-troubleshooting) — look up the exact
  message `app submit`, `app status` or `app withdraw` printed at you.
