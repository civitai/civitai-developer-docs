---
title: Your store listing
description: The icon, cover, screenshots and text a Civitai App listing needs to publish — what is checked where, which edits stage a revision, and how civitai app doctor gates a release.
sources:
  - go:github.com/civitai/cli
---

# Your store listing

Your **store listing** is the card shoppers see in the
[`/apps` store](https://civitai.com/apps), which is still gated while the store is
pre-GA. It is separate from your app's deployment: an app can be approved and
serving at `<slug>.civit.ai` while its listing is still a draft nobody can find
(see [Deployed is not the same as listed in the store](./review-and-deploy#deployed-is-not-the-same-as-listed-in-the-store)).

The listing is minted as a **draft when you run `civitai app submit`**, so you
can fill it in **while your app is in review** and it goes live the day the app
is approved.

::: danger Media carries forward on APPROVAL only
Withdrawing or rejection of a first-version submission deletes the listing and
all its media — see
[Changing the bundle while a request is still pending](./review-and-deploy#changing-the-bundle-while-a-request-is-still-pending).
:::

## The publish floor

A listing **cannot go live without an icon AND a cover** — the *publish
floor*, and the most common reason an approved app is not in the store.
Screenshots are optional (up to eight).

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
On a **live (approved)** listing — off-site apps included — the read behind it
opens the revision draft server-side (idempotently, the same one each time), so
a script polling it keeps a revision open on your listing. Read it once per
change, with or without `--json`. For CI, use
[`civitai app doctor`](#gating-a-release-with-app-doctor), which is a pure read.
:::

## Which app a listing command acts on

By default every `app listing` subcommand reads `blockId` from the
`block.manifest.json` in the **working directory**. Run it from elsewhere and it
stops before building a request:

```console
$ cd /tmp && civitai app listing status
Error: could not resolve the app — run this from your app directory (with block.manifest.json) or pass --slug: no block.manifest.json found in . — is this an App project? run `civitai app create` to create one
```

Two flags, on every subcommand, name the app instead: `--slug <blockId>` skips
the manifest, and `--dir <path>` points at the app directory.

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

`reorder` takes the **whole** set, in order — there is no "move one" form, and a
partial or unknown set is rejected.

## What is checked, and by whom

**The CLI checks, locally, before anything is uploaded:** the file's **format**
and **byte size** — nothing else.

| kind | how many | format | byte cap (the file you pass) |
| --- | --- | --- | --- |
| **icon** | 1, required | png / jpeg / webp | ≤ 2 MiB |
| **cover** | 1, required | png / jpeg / webp | ≤ 4 MiB |
| **screenshot** | up to 8, optional | png / jpeg / webp | ≤ 2 MiB |

It prints the decoded dimensions, which every server-side bound depends on, on
the upload line:

```
Uploading icon (37.3 KiB, 1024×1024)…
```

**The platform checks, when the image is attached:** dimensions and aspect
ratio. The CLI does not reproduce these, so the table below is **guidance, not
a local gate** — the server's rejection names the bound and the measured value
(`icon must be square-ish (aspect 2.00 outside 0.9–1.1)`).

| kind | aspect (width ÷ height) | minimum size |
| --- | --- | --- |
| **icon** | 0.9 – 1.1 — square or near-square (1:1 is fine) | 128 px on the shorter side |
| **cover** | 1.3 – 2.4 — landscape, ~4:3 to ~21:9 | 640 px wide |
| **screenshot** | 0.4 – 2.6 — either orientation | 320 px on the shorter side |

Easy starting points: a **512 × 512** icon and a **1600 × 900** cover. These
are platform constants that can move; a rejection always carries the *current*
bound.

### Four behaviours the numbers do not tell you

**Icons are re-encoded server-side, and the re-encode is what gets capped.**
The upload is downscaled to at most **1024 px** on its longer side and
re-encoded to PNG — aspect preserved, **never enlarged** (so the 128 px floor
still bites). The platform then caps that **re-encoded** PNG at 1 MiB, a
different measurement from the CLI's 2 MiB on your file: a photographic
1024 × 1024 JPEG of a few tens of KiB can still be refused, because its PNG
re-encode exceeds 1 MiB. **The lever is pixel dimensions, not heavier
compression.** The CLI cannot predict the re-encoded size (it depends on how
compressible your artwork is), so its error repeats this mechanism.

**An icon's upper bound is a PIXEL count, not a file size.** A source above
roughly **16 megapixels** (about 4096 × 4096) is refused however small the file
— a flat 5000 × 5000 PNG of a few hundred KB is rejected. **1024 × 1024** is
plenty, since that is what the server re-encodes to.

**Covers and screenshots are not rescaled.** Ship them at the size you want
shown.

**A wrong image is rejected fast.** The CLI attaches *before* waiting on the
content scan, so a shape rejection arrives in seconds rather than after a scan
that can take two minutes. The scan verdict is still waited on: these commands
never report success on a pending or blocked scan, and a failure says what state
the listing was left in.

## Editing a listing that is already LIVE

Once a listing is **approved and live**, only a *material* edit goes through
review. Every **media** command — `set-icon`, `set-cover`, `add-screenshot`,
`rm-screenshot`, `reorder` — is material: it writes into a **revision**, a
shadow copy that goes to a moderator, and your public listing is untouched until
that revision is approved. Describe it with `--changelog "<what changed>"`.
The text fields are **not** material — see
[The text fields apply IN PLACE](#the-text-fields-apply-in-place).

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
cover. So when one command cannot clear the floor alone, it **stages without
submitting**: it writes its change into the revision, leaves it open, prints
what is still missing, and **exits `0`**. The next command reuses the same
revision and submits both together.

```
✓ Icon staged on an open revision — not submitted for review yet.
Your live listing is unchanged; nothing reaches a moderator until the publish floor is met.
```

So `civitai app listing set-icon … && civitai app listing set-cover …` works as
a one-liner.

The CLI treats the refusal as progress only when, read back from the listing,
all three hold: the refusal was a **400** (a `500`/`503` still fails with its
usual exit code); the change is really there (by **image id** for an icon or
cover, by `alsc_…` id for a screenshot, and for `reorder` the exact ids in the
order you passed); and the floor is really unmet. If it cannot read the listing
back, you get the error and exit `2`.

### `rm-screenshot` stages and does **not** submit

On a live listing the ids `listing status` prints belong to the open revision,
so a removal lands there — and it is **not** submitted. Your public gallery goes
on showing the screenshot until the revision is approved:

```
✓ Screenshot removal staged on an open revision — not submitted for review yet.
```

That lets you stage several removals in one review cycle. On a **draft**
listing the removal applies directly: `✓ Screenshot removed`.

### `submit-revision` is what publishes staged work

```bash
civitai app listing submit-revision --changelog "Dropped the outdated grid shot"
```

This sends the open revision, as it stands, to moderator review — the **only**
way to publish a removal. It is idempotent: a revision already awaiting review
returns that same request.

It refuses, without submitting, when the listing is **not live** (a draft or
pending listing has no revision; `rejected` and `removed` get their own message)
and when there is **no open revision**.

::: warning Below the publish floor, `submit-revision` FAILS where the attach commands exit 0
Exit `2`: the submit is what you asked for, so it cannot report success. The
floor gap is printed alongside the server's refusal.
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
least one is required.

- **Clearing and emptying differ.** `--tagline ""` sets an **empty string**;
  `--clear tagline` sets it to **null**. `--clear` takes a comma-separated list
  and cannot be combined with the matching value flag.
- **Blanking a field needs `--yes`**, so an unset shell variable cannot silently
  empty a public field. Whitespace-only counts as blank, and the check is on the
  value you passed — a blank set is refused even on an already-empty field.
- **`category` must be one of** `generation`, `games`, `utility`, `discovery`,
  `moderation`, `analytics`, `other`.
- **On-site apps are refused** (exit `1`). Their copy is **manifest-governed**:
  the platform overwrites `name` / `tagline` / `description` / `category` from
  `block.manifest.json` on every subsequent-version approval. Edit the manifest
  and submit a new version instead.
- The server **rate-limits** these edits, at roughly 30 an hour.

## Link your source code

An open-source app's store **detail** page can carry a `Source` row linking to
the code (never on a grid card; omitted when unset). Where you set it depends on
the app's kind:

| kind | where the link lives | how it gets there |
|---|---|---|
| **on-site** | the `repository` key in `block.manifest.json` | flows to the listing when a moderator approves a version, and is **re-synced from the manifest on every approved version after that** — remove the key and the link is cleared |
| **off-site** | the listing itself | `civitai app listing set-source-repo <url>` |

`set-source-repo` **refuses an on-site app** (exit `1`) and names the manifest
key instead.

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

::: tip The CLI does not pre-validate the URL
It only checks that you passed something; an unacceptable URL comes back as the
server's own message. The server's rule is stricter than the manifest's
`pattern` (each path segment's characters, a stripped trailing `.git`), so for
the **on-site** key, passing `civitai app validate` is necessary, not
sufficient.
:::

::: danger This is a *material* change, unlike `set-text`
On an **approved** listing the server stages the change on a revision and the
listing re-enters moderator review. **The live listing is unchanged until that
revision is approved** — run `civitai app listing submit-revision` to send it.
The command says which branch the server took; `--json` carries it as
`requiresReview` and `shadowId`. On a draft or pending listing it applies
directly.
:::

**What counts as a "change".** The server compares **canonical** forms, so
re-setting the link you already have, setting a `/` or `.git` spelling of it,
or `--clear` on a listing with no link applies in place, stages nothing, and
reports `requiresReview: false`.

### Some states are refused outright rather than staged

Each has its own exit code:

| state | exit |
|---|---|
| you unpublished the listing yourself — a material change is blocked while it is down | `2` |
| a moderator removed the listing | `3` |
| any other failure the server does not classify | `1` |

The first is `2` because the server answers `MATERIAL_CHANGE_BLOCKED` as an
HTTP `400`. The CLI echoes the server's sentence verbatim; on a **moderator
takedown** it adds that your account's access is not the problem and that only
a moderator relisting it helps.

### If a revision was already open

A *material* edit joins the open revision (from an `rm-screenshot` or an attach
command) rather than getting its own, and approving it publishes *everything*
staged there and copies its text back over the live listing. The command says
so and points you at `civitai app listing status`.

A **non**-material edit applies in place without joining it — but the open
revision can still carry a *different* source link that replaces yours when
approved, so the command warns on that path too. `--json` reports it as
`openRevision` either way.

## Reading a listing back in a script

`civitai app listing status --json` also names the two listing ids the human
output omits: a live listing's **parent** and, once a revision is open, its
**shadow**. Which one a change is addressed to decides whether the server
accepts it:

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
- The server's `editTargetId` is not included. Address a change to `shadowId`
  when it is non-null and `parentId` otherwise.

This call is a write on a live listing — see the warning at the top of this
page.

## Off-site apps

An **off-site** app is a registered URL, so it has no block *submission*. Every
`app listing` subcommand still works on one: the CLI tries the submission first
and, when there is none, selects the listing **by slug**.

If **both** lookups answer *not found* (an app with no listing row at all), the
CLI exits `4` and points at `civitai app view <slug>`, which shows the icon and
cover the listing serves, and at the App-store listing UI on civitai.com, where
the registering account manages that media — which may not be you.

A listing your account does **not** own resolves by slug and is then refused
`403` (exit `3`). Any other failure from either lookup — a `403` from the
invite-gated submissions route, a `5xx`, a dropped connection — keeps its own
message and exit code rather than being reported as "listing not reachable".

## Gating a release with `app doctor`

`civitai app doctor` answers one question — **is this listing ready to publish,
and if not, what do I do about it?** — for every app you own or hold an accepted
collaborator seat on, or for just the one you name:

```bash
civitai app doctor                 # every app you can work on
civitai app doctor my-app          # just one
civitai app doctor --json | jq -e .ok
```

The findings are the **platform's**, classified into two severities:

| Severity | Codes | Meaning |
| --- | --- | --- |
| **BLOCKING** | `missing-icon`, `missing-cover`, `blocked-media` | The listing **cannot publish** until it is fixed. Sets the exit code — unless the listing is delisted. |
| **ADVISORY** | `no-screenshots`, `empty-description`, `empty-tagline`, `empty-category`, `scanning-media` | Recommended, but nothing is held up. |

**The exit code** is `1` when a blocking problem was found on a listing that
**can still publish**, `0` otherwise — including advisories only, blocking
problems only on delisted listings, and no listings at all. So it gates a
release script without parsing anything:

```bash
civitai app doctor my-app || exit 1
```

`--json` emits the same verdict as one object and uses the **same** exit codes,
so a script must branch on the code before trusting the payload. Every other code
keeps its usual meaning — `3` not authorized, `4` no such app of yours, `5`
transport.

### Delisted listings are reported but do not gate

An app whose status is `removed` still gets a full row, in its own section. Its
blocking problems are counted in `summary.blocking` and **excluded** from
`summary.gating`, so one old removed app cannot fail every run. Republish it and
it gates again on the next run. Only an explicit `removed` is excluded; an
unrecognised status still gates.

### The `--json` shape

| Field | Meaning |
| --- | --- |
| `ok` | The verdict, and the structured form of the exit code. Follows `summary.gating`, **not** `summary.blocking`. |
| `apps[]` | Every listing checked, **gating apps first, delisted last**. Each carries `slug`, `name`, `appListingId`, `appBlockId` (null for off-site), `status`, `role`, `kind`, `delisted`, and a `blocking` and an `advisory` array — never null, `[]` when empty. |
| `apps[].delisted` | `true` when this listing's status is `removed`, i.e. its blocking problems were reported and not counted. |
| `apps[].kind` | `onsite` or `offsite` — it **decides** the fix for the three text codes. |
| `summary.truncated` | `true` when the server's page cap may have hidden listings. Computed from the **server's page**, so it is reported on a single-app run too. |
| `summary.blocking` | **Every** blocking problem found, so it matches the arrays you can see. |
| `summary.gating` | The subset on listings that can still publish. **This is the exit code.** |
| `summary.advisory` / `summary.apps` / `summary.delisted` | Advisory findings, apps checked, and how many of them are delisted. |

Ask `ok` for "may this ship", `summary.blocking` for "is anything wrong
anywhere".

### Each finding names a fix that actually works

`missing-icon` / `missing-cover` / `no-screenshots` print the exact
`set-icon` / `set-cover` / `add-screenshot` command with `--slug` already filled
in. `scanning-media` prints **no** command at all, because the scan finishes on
its own.

::: warning `blocked-media` depends on the slot
An icon or a cover is **replaced** — the new asset overwrites the slot. A
screenshot must be **REMOVED**: `add-screenshot` *appends*, so the blocked row
stays and go-live is still refused. That arm prints three commands —
`listing status` to find the `alsc_` id, `rm-screenshot`, and, on an approved
listing, `submit-revision` (the removal is not auto-submitted).
:::

The three **text** problems — description, tagline, category — are **kind-aware**:

| kind | fix printed | why |
| --- | --- | --- |
| **off-site** | the listing's **web editor URL** | the copy is author-supplied |
| **on-site** | **`block.manifest.json`**, then `civitai app submit` a new version | the copy is **manifest-governed** |

An on-site edit made in the browser would be reverted at the next approval (see
above). For an off-site listing, `civitai app listing set-text` is the CLI
equivalent of the web editor — see
[The text fields apply IN PLACE](#the-text-fields-apply-in-place).

### Two properties worth knowing

- **It is a PURE READ.** Unlike `civitai app listing status`, it opens no
  revision draft, so it is safe in a loop or in CI.
- **It sees apps `civitai app status` cannot** — listings you acquired by
  ownership transfer or hold a collaborator seat on. `app status` reads only
  what *you submitted*.

An app with nothing wrong is reported as complete explicitly, never as a blank
section.

## Next

- [Review, approval and deploy](./review-and-deploy) — what happens to the app
  itself after `civitai app submit`.
- [CLI reference](../reference/cli) — every `app listing` and `app doctor` flag,
  generated from the binary.
- [App Store sub-listings](./sub-listings) — items your viewers make inside
  the app, published as their own store cards under yours.
- [CLI troubleshooting](/site/guide/cli-troubleshooting) — look up the exact
  refusal you got, including every `app listing` `400` and `403` on this page.
