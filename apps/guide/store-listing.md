---
title: Your store listing
description: The icon, cover, screenshots and text a Civitai App needs before it can publish — what the CLI checks locally, what the platform checks at attach, which edits stage a revision and which apply in place, and how civitai app doctor gates a release.
sources:
  - go:github.com/civitai/cli
---

# Your store listing

Your **store listing** is the card shoppers see in the
[`/apps` store](https://civitai.com/apps). It is a different object from your
app's deployment: an app can be approved, deployed and serving at
`<slug>.civit.ai` while its listing is still a draft nobody can find. See
[Deployed is not the same as listed in the store](./review-and-deploy#deployed-is-not-the-same-as-listed-in-the-store).

The listing is minted as a **draft the moment you run `civitai app submit`** —
not at approval — so you can fill it in **while your app is in review**, and it
goes live the same day the app is approved instead of after a second round-trip.

::: danger Media carries forward on APPROVAL only
Whatever you attach survives a moderator **approving** the app. It does not
survive the app leaving review any other way: **withdrawing** the submission, or
a moderator **rejecting** a first-version submission, deletes the listing and
everything on it — icon, cover, and every screenshot with its caption. See
[Changing the bundle while a request is still pending](./review-and-deploy#changing-the-bundle-while-a-request-is-still-pending).

Practical rule: do not hand-caption a gallery on a submission you may withdraw.
:::

## The publish floor

A listing **cannot go live without an icon AND a cover**. Screenshots are
optional (up to eight). That pair is the *publish floor*, and it is the single
most common reason an approved app is not in the store.

`civitai app listing status` prints what is attached and what the floor still
needs:

```console
$ civitai app listing status
App:             my-app
Listing status:  draft
Icon:            MISSING (required)
Cover:           MISSING (required)
Screenshots:     0

⚠ Not publishable yet — missing icon and cover.
  Add one:  civitai app listing set-icon <file>
  Add one:  civitai app listing set-cover <file>
```

::: danger `civitai app listing status` is not a pure read
On a **live (approved)** listing the read behind it opens the revision draft
server-side — idempotently, the same one each time — so a script that polls it
in a loop keeps a revision open on your listing. Read it once per change; a
watch loop is a writer. This holds with or without `--json`, and it holds for
off-site apps too, which are approved in practice.

If you want something safe to run in CI, use
[`civitai app doctor`](#gating-a-release-with-app-doctor) — it is a pure read.
:::

## Which app a listing command acts on

Every `app listing` subcommand has to work out *which* app you mean, and by
default it does that from the **working directory**: it reads `blockId` out of
the `block.manifest.json` next to you. Run it from somewhere else and it stops
before it builds a request:

```console
$ cd /tmp && civitai app listing status
Error: could not resolve the app — run this from your app directory (with block.manifest.json) or pass --slug: no block.manifest.json found in . — is this an App project? run `civitai app create` to create one
```

Two flags name the app instead, and both work on every subcommand:
`--slug <blockId>` skips the manifest entirely, and `--dir <path>` points at the
app directory from wherever you are.

## Attaching media

```bash
civitai app listing set-icon ./assets/icon.png                         # required
civitai app listing set-cover ./assets/cover.png                       # required
civitai app listing add-screenshot ./assets/shot-1.png --caption "Grid view"   # optional, up to 8
```

`assets/` is scaffolded by every template, with a README of the requirements and
**no placeholder images** — the files above are ones you supply.

Screenshots are managed by **id** — the `alsc_…` values `listing status` prints:

```bash
civitai app listing rm-screenshot alsc_01H8XYZ            # remove one
civitai app listing reorder alsc_02 alsc_01 alsc_03       # pass ALL current ids, in the new order
```

`reorder` is positional and takes the **whole** set: there is no "move one"
form, and a partial or unknown set is rejected. Read the current order out of
`civitai app listing status` and pass the whole list back.

## What is checked, and by whom

Two different things check your listing images, and it is worth knowing which is
which before you open an image editor.

**The CLI checks, locally, before anything is uploaded:** the file's **format**
and its **byte size**. That is all it enforces. Nothing is uploaded if that
check fails.

| kind | how many | format | byte cap (the file you pass) |
| --- | --- | --- | --- |
| **icon** | 1, required | png / jpeg / webp | ≤ 2 MiB |
| **cover** | 1, required | png / jpeg / webp | ≤ 4 MiB |
| **screenshot** | up to 8, optional | png / jpeg / webp | ≤ 2 MiB |

What the CLI *does* show you is the quantity every server-side bound is a
function of, on the line it uploads:

```
Uploading icon (37.3 KiB, 1024×1024)…
```

**The platform checks, server-side, when the image is attached:** the dimensions
and the aspect ratio. The CLI does not reproduce these, so the table below is
**guidance, not a local gate** — the server is the authority, and its rejection
names the bound it applied and the value it measured
(`icon must be square-ish (aspect 2.00 outside 0.9–1.1)`).

| kind | aspect (width ÷ height) | minimum size |
| --- | --- | --- |
| **icon** | 0.9 – 1.1 — square or near-square (1:1 is fine) | 128 px on the shorter side |
| **cover** | 1.3 – 2.4 — landscape, ~4:3 to ~21:9 | 640 px wide |
| **screenshot** | 0.4 – 2.6 — either orientation | 320 px on the shorter side |

Easy starting points: a **512 × 512** icon and a **1600 × 900** cover.

::: tip Why these are not checked locally
They are platform constants that can move. A stale number here costs you one
rejection that carries the *current* bound; a stale local check would refuse
valid images with no way to argue.
:::

### Four behaviours the numbers do not tell you

**Icons are re-encoded server-side, and the re-encode is what gets capped.**
Whatever you upload is downscaled to at most **1024 px** on its longer side and
re-encoded to PNG — aspect preserved, and **never enlarged**, so an undersized
icon is not rescued and the 128 px floor still bites. The platform then caps
that **re-encoded** image at 1 MiB, which is a different measurement from the
2 MiB the CLI applies to the file you passed. It is not a corner case: a
1024 × 1024 photographic JPEG of **37.3 KiB** — under 2% of the local cap — was
refused at attach because the PNG the platform made from it was about 1.15 MiB,
while a 512 × 512 icon in the same run went through. The bytes in that rejection
are the platform's, not your file's, and **the lever is pixel dimensions, not
heavier compression.** The CLI cannot predict the number — how small the
re-encode lands depends on how compressible your artwork is — so it prints the
dimensions it decoded and repeats the mechanism in the error rather than guessing
a bound.

**An icon's upper bound is a PIXEL count, not a file size.** The decoder that
re-encodes it refuses a source above roughly **16 megapixels** — about
4096 × 4096 — regardless of how small the file is. A flat 5000 × 5000 PNG
compresses to a few hundred KB, clears every byte cap in the first table, and is
still rejected. Downscale first: **1024 × 1024** is plenty, because that is what
the server re-encodes to anyway.

**Covers and screenshots are not rescaled.** What you upload is what the store
renders, so ship them at the size you want shown.

**A wrong image is rejected, not quietly accepted, and it comes back fast.** The
CLI attaches *before* it waits on the content scan, so the platform's verdict on
shape arrives in a couple of seconds rather than after a scan that can take two
minutes — and always before a moderator sees it. A **blocked** image never goes
live either: the scan verdict is still waited on, so these commands never report
success on a pending or blocked scan, and a failure tells you what state the
listing was left in.

## Editing a listing that is already LIVE

This is where the model changes, and the difference matters because some of
these commands write to your public listing and some do not.

Once a listing is **approved and live**, the platform classifies an edit as
*material* or not, and only a material one goes through review. Every **media**
command on this page — `set-icon`, `set-cover`, `add-screenshot`,
`rm-screenshot`, `reorder` — is material: it does not edit the live listing, it
writes into a **revision**, a shadow copy that goes back to a moderator, and your
public listing is untouched until that revision is approved. Describe it with
`--changelog "<what changed>"`.

The text fields are the **non**-material case, and they behave completely
differently — see [The text fields apply IN PLACE](#the-text-fields-apply-in-place).

### The attach commands open a revision and submit it

`set-icon`, `set-cover`, `add-screenshot` and `reorder` each make **one complete
change**, so on a live listing they open the revision, write into it, and submit
it:

```
✓ Icon staged on a revision — pending moderator review (alpr_…).
Your live listing is unchanged until a moderator approves the revision.
```

`-y` / `--yes` skips the confirmation on the three attach commands. `reorder`
takes `--changelog` but has no confirmation to skip, so it has no `-y`, and it
never uploads anything. On a **draft** listing there is no revision, so all four
apply to the listing itself (`✓ Icon set`, `✓ Reordered N screenshots`).

### …unless the listing is still below the publish floor

A revision cannot go to a moderator until the listing has both an icon and a
cover, and clearing that floor takes two commands. So the first one **stages
without submitting**: it writes its change into the revision, leaves the revision
open, prints what is still missing, and **exits `0`**. Nothing failed — the
second command reuses the same revision and submits both together.

```
✓ Icon staged on an open revision — not submitted for review yet.
Your live listing is unchanged; nothing reaches a moderator until the publish floor is met.
```

The output says `staged on an open revision — not submitted for review yet`,
never `pending moderator review`. This is why
`civitai app listing set-icon … && civitai app listing set-cover …` works as the
one-liner it looks like.

That "the refusal was progress" reading is **narrow on purpose**, and it is
decided from the listing's own state rather than from the server's wording. All
three of these must hold: the refusal was a **400** (a `500`/`503` is an outage,
not the floor, and still fails with its usual exit code); what was just written
is really there — matched by **image id** for an icon or cover, by the `alsc_…`
row id for a screenshot, and for `reorder` by the revision's gallery holding
exactly the ids you passed in the order you passed them; and the floor is really
unmet. If the CLI cannot read the listing back it claims nothing — you get the
error and exit `2`.

### `rm-screenshot` stages and does **not** submit

On a live listing the ids `listing status` prints belong to the open revision,
so a removal lands there — and it is **not** submitted. Your public gallery goes
on showing the screenshot until the revision is approved:

```
✓ Screenshot removal staged on an open revision — not submitted for review yet.
```

That is deliberate: curating a gallery is usually several removals, and
auto-submitting on the first would open a review cycle in the middle of an edit.
On a **draft** listing the removal *is* the listing, and you get
`✓ Screenshot removed`.

### `submit-revision` is what publishes staged work

```bash
civitai app listing submit-revision --changelog "Dropped the outdated grid shot"
```

This sends the open revision to moderator review. It is the explicit publish step
for anything staged in a revision, and the **only** way to publish a removal. The
revision is submitted as it stands, so stage everything you want in one review
cycle first. Submitting is idempotent — a revision already awaiting review
returns that same request rather than opening a second.

It refuses, without submitting, when the listing is **not live** — a draft or
pending listing is edited directly, so there is no revision, and a `rejected` or
`removed` listing gets its own message — and when there is **no open revision**
to submit, rather than sending a moderator an empty one.

::: warning Below the publish floor, `submit-revision` FAILS where the attach commands exit 0
Exit `2`, not `0`. The submit *is* what you asked for, so reporting success would
be a false claim. The floor gap is printed as context alongside the server's
refusal. The exception described above is scoped to the commands whose job was
the *staged change* — the three attaches and `reorder` — and this one is
deliberately not among them.
:::

## The text fields apply IN PLACE

`civitai app listing set-text` writes the listing's **tagline**, **description**
and **category**:

```bash
civitai app listing set-text --tagline "Batch upscaling, in your browser"
civitai app listing set-text --category utility --slug my-app
civitai app listing set-text --clear tagline,category
```

::: danger This is the exception to everything above
These are not "material" changes, so `set-text` **never opens a revision.** It
applies **in place, immediately and publicly, on every listing status** —
including an approved, live one. There is no revision to review, and nothing to
abandon if you change your mind.
:::

The flags are sent as **one patch**, so a run either applies or does not. At
least one is required. A few rules worth knowing:

- **Clearing and emptying are different server states, and both are reachable.**
  `--tagline ""` sets an **empty string**; `--clear tagline` sets it to **null**.
  `--clear` takes a comma-separated list and cannot be combined with the matching
  value flag.
- **Blanking a field needs `--yes`**, so an unset shell variable cannot silently
  empty a public field. Whitespace-only counts as blank. The check is on the
  value you passed, not on the field's current contents — a blank set is refused
  even on an already-empty field.
- **`category` must be one of** `generation`, `games`, `utility`, `discovery`,
  `moderation`, `analytics`, `other`.
- **On-site apps are refused** (exit `1` — a verdict about the app, not a bad
  command). An on-site listing's copy is **manifest-governed**: the platform
  overwrites `name` / `tagline` / `description` / `category` from
  `block.manifest.json` on every subsequent-version approval, so an edit made
  here would be silently reverted. Edit the manifest and submit a new version
  instead.
- The server **rate-limits** these edits, at roughly 30 an hour.

## Link your source code

If your app is open source, its store **detail** page can carry a `Source` row
linking to the code. It never appears on a store grid card, and it is omitted
entirely when unset.

**Where you set it depends on your app's kind, and the two are not
interchangeable.**

| kind | where the link lives | how it gets there |
|---|---|---|
| **on-site** | the `repository` key in `block.manifest.json` | flows to the listing when a moderator approves a version, and is **re-synced from the manifest on every approved version after that** — remove the key and the link is cleared |
| **off-site** | the listing itself | `civitai app listing set-source-repo <url>` |

`set-source-repo` **refuses an on-site app** (exit `1`) and names the manifest
key instead, because a write here would be re-synced away at your next approved
version.

```bash
civitai app listing set-source-repo https://github.com/me/my-app
civitai app listing set-source-repo --clear          # remove the link
civitai app listing set-source-repo https://github.com/me/my-app --json
```

### What the server accepts

The URL must be a repository **root** on `github.com`, `gitlab.com` or
`codeberg.org` — `https://<host>/<owner>/<repo>`, with no deeper path. A
trailing `/` or `.git`, a query string and a fragment are accepted and
normalised away. A deep link such as `/owner/repo/tree/main` is rejected.

::: tip That rule is the server's, and the CLI does not pre-validate it
The only local check is that you passed something. The platform's
`validateRepositoryUrl` is the authority, and it constrains things the shipped
manifest `pattern` does not — each path segment's characters, a stripped
trailing `.git`. A second local copy of that rule would be a second thing to be
wrong, so an unacceptable URL comes back as the server's own message.

For the **on-site** manifest key, `civitai app validate` checks only the coarse
shape: passing it is necessary, not sufficient.
:::

::: danger This is a *material* change, unlike `set-text`
On an **approved** listing a change to this link is not applied in place: the
server stages it on a revision and the listing re-enters moderator review,
because this is an outbound link on a public page. **The live listing is
unchanged until that revision is approved** — run
`civitai app listing submit-revision` to send it.

The command tells you which branch the server took, and `--json` carries it as
`requiresReview` and `shadowId`. On a draft or pending listing it applies
directly.

This is also why it is a separate command rather than a flag on `set-text`:
bundling them would make a `--tagline` edit stage instead of apply, depending
on whether an unrelated flag happened to be passed.
:::

**What counts as a "change".** The server compares **canonical** forms, so
several things that look like edits are not: re-setting the link you already
have, setting a `/` or `.git` spelling of it, or `--clear` on a listing that
has no link. Those apply in place and stage nothing, and the command reports
`requiresReview: false` — it never guesses which branch happened, it reports
the one the server took.

### Some states are refused outright rather than staged

Read the code, not the word "refused" — they do **not** share one:

| state | exit |
|---|---|
| you unpublished the listing yourself — a material change is blocked while it is down | `2` |
| a moderator removed the listing | `3` |
| any other failure the server does not classify — including a platform that has not yet applied the migration adding the listing's source-repo column | `1` |

The first is `2` because the server answers `MATERIAL_CHANGE_BLOCKED` as an
HTTP `400`, which this CLI classifies as a malformed request. In each case the
server's own sentence is what names the state, and the CLI echoes it verbatim.
On the **moderator takedown** the CLI adds what that sentence leaves out — that
your account's access is not the problem, and that asking a moderator to relist
the listing is the only step that helps.

### If a revision was already open

Because you staged an `rm-screenshot`, or one of the attach commands minted
one — then *when this edit is material* it joins **that** revision rather than
getting its own, and approving it publishes *everything* staged there and
copies its text back over the live listing. The command says so and points you
at `civitai app listing status` first.

When the edit is **not** material (the canonical no-op above) it applies in
place and does not join the revision — but that revision can still carry a
*different* source link that replaces yours when it is approved, so the command
warns about it on that path too. `--json` reports it as `openRevision` either
way.

## Reading a listing back in a script

`civitai app listing status --json` is the scriptable form, and it names the two
listing ids the human output never shows. A live listing has a **parent** and,
once a revision is open, a **shadow** — and which one a change is addressed to is
what decides whether the server accepts it:

```console
$ civitai app listing status --slug my-app --json
{
  "slug": "my-app",
  "parentId": "apl_01KXPENN7GJV51HBG649P3Y99M",
  "shadowId": "apl_01M064YJGDR973P73WHC1FGDP9",
  "status": "approved",
  "hasPendingRevision": false,
  "assets": {
    "icon":  { "present": true,  "imageId": 4711 },
    "cover": { "present": false, "imageId": null },
    "screenshots": [
      { "id": "alsc_01M0…", "order": 0, "caption": "Grid view", "imageId": 8123 }
    ]
  },
  "floor": { "met": false, "missing": ["cover"] }
}
```

- `shadowId` is **`null`** when no revision draft exists — every draft or pending
  listing, and a live one nobody has edited — never absent, so `.shadowId`
  answers on every listing.
- `status` is the **parent's** lifecycle status.
- `hasPendingRevision` means *submitted for review*, not "a shadow exists".
- `floor.missing` is `[]` when the floor is met.
- The server's own `editTargetId` is **deliberately not there**: the CLI does not
  decode that field, and printing an id it never read would be a guess. Use
  `shadowId` when it is non-null and `parentId` otherwise.

Remember that this call is a write on a live listing — see the warning at the top
of this page.

## Off-site apps

An **off-site** app is a registered URL rather than a block bundle, so it has no
block *submission*. Every `app listing` subcommand still works on one: the CLI
resolves through the submission first (the on-site path) and, when there is none,
falls back to selecting the listing **by slug**. That fallback needs a slug
selector that is deployed on civitai.com.

If **both** lookups answer *not found*, the CLI says so and points at the
website. That happens against a Civitai too old to carry the slug selector — an
older or self-hosted deployment — or for an app with no listing row at all. The
message names `civitai app view <slug>`, which still shows the icon and cover the
listing is serving, and names the App-store listing UI on civitai.com as where
that media is managed by the account that registered the app. It does not promise
*you* can edit it there: the store catalog this lookup reads is public, so the app
may not be yours. It exits `4`.

A listing your account does **not** own is not in that set on a current server:
the by-slug lookup resolves the row and then refuses it `403`, so you get that
error and exit `3`. And a failure that is not a 404 keeps its own message and its
own exit code, from *either* lookup — a `403` from the invite-gated submissions
route, a `5xx` or a dropped connection is not evidence about whether a listing
exists, so it is never re-reported as "listing not reachable".

## Gating a release with `app doctor`

`civitai app doctor` answers one question — **is this listing ready to publish,
and if not, what do I do about it?** — for every app you own or hold an accepted
collaborator seat on, or for just the one you name:

```bash
civitai app doctor                 # every app you can work on
civitai app doctor my-app          # just one
civitai app doctor --json | jq -e .ok
```

The findings are the **platform's**, not the CLI's. They arrive already
classified into two severities, and the report keeps that split because it is
what the exit code is computed from:

| Severity | Codes | Meaning |
| --- | --- | --- |
| **BLOCKING** | `missing-icon`, `missing-cover`, `blocked-media` | The listing **cannot publish** until it is fixed. Sets the exit code — unless the listing is delisted. |
| **ADVISORY** | `no-screenshots`, `empty-description`, `empty-tagline`, `empty-category`, `scanning-media` | Recommended, but nothing is held up. |

**The exit code is the point.** `1` when a blocking problem was found on a
listing that **can still publish**, `0` otherwise — including when only
advisories were found, when the only blocking problems are on delisted listings,
and when you have no listings at all. So it gates a release script without
parsing anything:

```bash
civitai app doctor my-app || exit 1
```

`--json` emits the same verdict as one object and uses the **same** exit codes,
so a script must branch on the code before trusting the payload. Every other code
keeps its usual meaning — `3` not authorized, `4` no such app of yours, `5`
transport.

### Delisted listings are reported but do not gate

An app whose status is `removed` still gets a full row, in its own section — the
verdict shrinks, the report does not. Its blocking problems are counted in
`summary.blocking` and **excluded** from `summary.gating`. Without this, one old
removed app would fail every run forever. Republish a listing and it gates again
on the next run, with no flag to remember. Only an explicit `removed` is
excluded: an unrecognised status still gates, because "we could not tell it is
delisted" is not "it is delisted".

### The `--json` shape

| Field | Meaning |
| --- | --- |
| `ok` | The verdict, and the structured form of the exit code. Follows `summary.gating`, **not** `summary.blocking`. |
| `apps[]` | Every listing checked, **gating apps first, delisted last**. Each carries `slug`, `name`, `appListingId`, `appBlockId` (null for off-site), `status`, `role`, `kind`, `delisted`, and a `blocking` and an `advisory` array — never null, `[]` when empty. |
| `apps[].delisted` | `true` when this listing's status is `removed`, i.e. its blocking problems were reported and not counted. |
| `apps[].kind` | `onsite` or `offsite`. Carried because it **decides** the fix for the three text codes — without it a consumer sees two different fixes for one code and cannot reproduce the branch. |
| `summary.truncated` | `true` when the server's page cap may have hidden listings. Computed from the **server's page**, so it is reported on a single-app run too. |
| `summary.blocking` | **Every** blocking problem found, so it matches the arrays you can see. |
| `summary.gating` | The subset on listings that can still publish. **This is the exit code.** |
| `summary.advisory` / `summary.apps` / `summary.delisted` | Advisory findings, apps checked, and how many of them are delisted. |

Two counts rather than one is deliberate: publishing a single number would force
a choice between a total that disagrees with the arrays and a verdict that
disagrees with the exit code. Ask `ok` for "may this ship", `summary.blocking`
for "is anything wrong anywhere".

### Each finding names a fix that actually works

`missing-icon` / `missing-cover` / `no-screenshots` print the exact
`set-icon` / `set-cover` / `add-screenshot` command with `--slug` already filled
in. `scanning-media` prints **no** command at all, because the scan finishes on
its own.

::: warning `blocked-media` depends on the slot
An icon or a cover is **replaced** — the new asset overwrites the slot and
dereferences the blocked image. A screenshot must be **REMOVED**:
`add-screenshot` *appends*, so the blocked row stays attached and go-live is
still refused. That arm prints three commands — `listing status` to find the
`alsc_` id, `rm-screenshot`, and, on an approved listing, `submit-revision`,
because the removal lands in a revision that is deliberately not auto-submitted.
:::

The three **text** problems — description, tagline, category — are **kind-aware**,
because who owns that copy differs:

| kind | fix printed | why |
| --- | --- | --- |
| **off-site** | the listing's **web editor URL** | the copy is author-supplied |
| **on-site** | **`block.manifest.json`**, then `civitai app submit` a new version | the copy is **manifest-governed** |

That distinction is not cosmetic. On an on-site listing the platform overwrites
`name` / `tagline` / `description` / `category` from the manifest on **every
subsequent-version approval**, so telling an on-site author to edit them in the
browser is advice the platform silently reverts. (For an off-site listing,
`civitai app listing set-text` is the CLI equivalent of that web editor — see
[The text fields apply IN PLACE](#the-text-fields-apply-in-place).)

### Two properties worth knowing

- **It is a PURE READ.** Unlike `civitai app listing status`, it opens no
  revision draft on a live listing, so it is safe to run in a loop or in CI.
- **It sees apps `civitai app status` cannot.** `app status` reads the
  submissions route, which is scoped to what *you submitted* — a listing you
  acquired by ownership transfer, or one you hold a collaborator seat on, is
  invisible there. `doctor` reads the ownership-plus-seats listing, so both show
  up.

An app with nothing wrong is reported as complete, explicitly. A blank space is
not an answer: a missing section is indistinguishable from a read that failed.

## Next

- [Review, approval and deploy](./review-and-deploy) — what happens to the app
  itself after `civitai app submit`.
- [CLI reference](../reference/cli) — every `app listing` and `app doctor` flag,
  generated from the binary.
- [CLI troubleshooting](/site/guide/cli-troubleshooting) — look up the exact
  refusal you got, including every `app listing` `400` and `403` on this page.
