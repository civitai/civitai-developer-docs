---
title: "civitai app listing — store listing commands"
description: "Edit an App's store listing: icon, cover, screenshots, text, source repo and revisions. Part of the CLI reference."
outline: [2, 4]
---

<!-- GENERATED PAGE — do not edit by hand. Written by `npm run gen:appblocks:md` (scripts/appblocks-md.mjs); which entry lives on which page is decided in .vitepress/theme/components/referenceSplit.shared.mjs. -->

# civitai app listing — store listing commands

Edit an App's store listing: icon, cover, screenshots, text, source repo and revisions.

This page documents 10 of the 60 commands in the [CLI reference](../cli), which indexes every command by name. Generated from the `civitai` binary's own help output.

Other pages: [civitai app — authoring commands](./app) · [Catalog and download commands](./catalog) · [Generation commands](./generation) · [Account, setup and utility commands](./account-and-setup)

<CliReference group="app-listing">
<!-- BEGIN GENERATED: cli/app-listing — markdown fallback for the .md/LLM channel. Do not edit by hand; run `npm run gen:appblocks:md`. -->

**`civitai app listing`**

Manage your App store-listing media (icon, cover, screenshots)

```text
Manage your App store listing's MEDIA — the icon, cover, and screenshots
a listing needs before it can publish.

A store listing must have an ICON and a COVER before it can go live; screenshots
are optional. These commands ingest a local image, attach it to your listing,
and then wait for the content scan — the same pipeline the web submit form
uses. The platform validates dimensions, aspect and format at the ATTACH step,
so a wrongly-shaped image is refused in seconds rather than after the scan.

For a listing that is already LIVE (approved), attaching media opens a REVISION
that goes back to moderator review (the live listing is untouched until the
revision is approved); pass --changelog to describe the change.

The app is resolved from block.manifest.json in the current directory (or pass
--slug). `civitai app submit` mints your listing as a DRAFT, so its media is
settable while pending review. It will
carry forward once the app is APPROVED — withdrawing the submission deletes
the listing and everything on it, and a rejection can too.
Do not hand-caption a set you may withdraw.

Source files are checked locally BEFORE any upload — png, jpeg or webp, at most
2.0 MiB for an icon, 4.0 MiB for a cover, 2.0 MiB for a screenshot.
That reads the SOURCE FILE only: an icon is re-encoded server-side and the
platform caps the image IT made — it can pass here and be refused at attach.
```

```bash
  civitai app listing status
  civitai app listing set-text --tagline "Batch upscaling, in your browser"
  civitai app listing set-icon ./assets/icon.png
  civitai app listing set-cover ./assets/cover.png
  civitai app listing add-screenshot ./shot.png --caption "Grid view"
  civitai app listing rm-screenshot alsc_01H...
  civitai app listing reorder alsc_02 alsc_01 alsc_03
  civitai app listing submit-revision --changelog "Refreshed the gallery"
```

**`civitai app listing set-icon <file>`**

Set the listing icon (png, jpeg or webp, at most 2.0 MiB)

```text
Set your store listing's ICON — the small image shown beside your app's name.
An icon is MANDATORY: a listing cannot publish without one.

The source file is validated locally first (png, jpeg or webp, at most 2.0 MiB),
then ingested and attached, and the content scan is waited on afterwards.
Nothing is uploaded if the local check fails. The platform validates the
image's dimensions and aspect at the ATTACH step, so a wrongly-shaped image is
refused in seconds rather than after the scan.

An icon is also RE-ENCODED server-side to PNG (downscaled to at most 1024px on
the longer side) and the platform caps that re-encoded image — a different
measurement from the cap above, which is on your file. A detailed 1024x1024
icon can pass here and be refused there; the lever is smaller pixel dimensions.

Platform bounds: https://developer.civitai.com/apps/guide/store-listing

On a listing that is already LIVE this opens a REVISION for moderator re-review
instead of changing the live listing — pass --changelog to describe the change,
-y to skip the confirmation — but a live listing still below the publish floor
stages WITHOUT submitting, and exits 0. On a DRAFT listing it attaches directly.

Run `civitai app listing status` to see what the publish floor still needs.
```

```bash
  civitai app listing set-icon ./assets/icon.png
  civitai app listing set-icon ./icon.png --slug my-app
  civitai app listing set-icon ./icon.png --changelog "New brand mark" -y
```

| Flag | Description | Default |
|---|---|---|
| `--changelog string` | changelog for the moderator review (used only when the listing is already live) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |
| `-y, --yes` | skip the live-listing revision confirmation | — |

**`civitai app listing set-cover <file>`**

Set the listing cover (png, jpeg or webp, at most 4.0 MiB)

```text
Set your store listing's COVER — the wide image at the top of the listing
page. A cover is MANDATORY: a listing cannot publish without one.

The source file is validated locally first (png, jpeg or webp, at most 4.0 MiB),
then ingested and attached, and the content scan is waited on afterwards.
Nothing is uploaded if the local check fails. The platform validates the
image's dimensions and aspect at the ATTACH step, so a wrongly-shaped image is
refused in seconds rather than after the scan.

Platform bounds: https://developer.civitai.com/apps/guide/store-listing

On a listing that is already LIVE this opens a REVISION for moderator re-review
instead of changing the live listing — pass --changelog to describe the change,
-y to skip the confirmation — but a live listing still below the publish floor
stages WITHOUT submitting, and exits 0. On a DRAFT listing it attaches directly.

Run `civitai app listing status` to see what the publish floor still needs.
```

```bash
  civitai app listing set-cover ./assets/cover.png
  civitai app listing set-cover ./cover.jpg --slug my-app
  civitai app listing set-cover ./cover.png --changelog "Updated hero" -y
```

| Flag | Description | Default |
|---|---|---|
| `--changelog string` | changelog for the moderator review (used only when the listing is already live) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |
| `-y, --yes` | skip the live-listing revision confirmation | — |

**`civitai app listing add-screenshot <file>`**

Add a screenshot (up to 8) with an optional caption

```text
Add a SCREENSHOT to your store listing's gallery. Screenshots are OPTIONAL:
they are not part of the publish floor.

The source file is validated locally first (png, jpeg or webp, at most 2.0 MiB),
then ingested and appended to the gallery, and the content scan is waited on
afterwards. Nothing is uploaded if the local check fails. The platform
validates dimensions, aspect and format at the ATTACH step, so a bad image is
refused in seconds rather than after the scan. --caption adds a one-line
caption.

Platform bounds: https://developer.civitai.com/apps/guide/store-listing

Each run appends one screenshot; there is no bulk add. Use
`civitai app listing reorder` to change the order afterwards and
`civitai app listing rm-screenshot` to drop one — both take the screenshot ids
that `civitai app listing status` prints.

The gallery has a ceiling (8 at the time of writing) and it is the SERVER's, not
this CLI's: nothing here counts the gallery before uploading, so hitting the
ceiling surfaces as a server refusal after the ingest rather than as a local
usage error.

On a listing that is already LIVE this opens a REVISION for moderator re-review
instead of changing the live listing — pass --changelog to describe the change,
-y to skip the confirmation — but a live listing still below the publish floor
stages WITHOUT submitting, and exits 0. On a DRAFT listing it attaches directly.
```

```bash
  civitai app listing add-screenshot ./shot.png
  civitai app listing add-screenshot ./grid.png --caption "Grid view"
  civitai app listing add-screenshot ./shot.png --slug my-app
```

| Flag | Description | Default |
|---|---|---|
| `--caption string` | optional one-line caption for the screenshot | — |
| `--changelog string` | changelog for the moderator review (used only when the listing is already live) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |
| `-y, --yes` | skip the live-listing revision confirmation | — |

**`civitai app listing rm-screenshot <screenshotId>`**

Remove a screenshot by its id (see `app listing status`)

```text
Remove a screenshot from your listing by its screenshot id (the id shown by
`civitai app listing status`, e.g. alsc_...).

On a listing that is already LIVE the removal lands in the open REVISION — the
ids `status` prints are that revision's — and it is NOT submitted, so your
public gallery keeps the screenshot until a moderator approves the revision.
Curating a gallery is usually several removals, so the submit stays yours to
make: run `civitai app listing submit-revision` when the revision is what you
want. On a DRAFT listing the removal applies to the listing itself.
```

```bash
  civitai app listing rm-screenshot alsc_01H8XYZ
  civitai app listing rm-screenshot alsc_01H8XYZ --slug my-app
```

| Flag | Description | Default |
|---|---|---|
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app listing reorder <screenshotId...>`**

Reorder screenshots (pass ALL current screenshot ids in the new order)

```text
Reorder your listing's screenshots. Pass EXACTLY the current set of screenshot
ids (from `civitai app listing status`) in the desired order — a partial or
unknown set is rejected.

Ordering is positional: the first id becomes the first screenshot in the
gallery. There is no "move one" form — read the current order out of
`civitai app listing status` and pass the whole list back.

On a listing that is already LIVE this opens a REVISION and submits it for
moderator re-review instead of reordering the live gallery — pass --changelog
to describe the change — but a live listing still below the publish floor
stages WITHOUT submitting, and exits 0. A DRAFT listing is reordered directly.
```

```bash
  civitai app listing reorder alsc_02 alsc_01 alsc_03
  civitai app listing reorder alsc_02 alsc_01 --slug my-app
```

| Flag | Description | Default |
|---|---|---|
| `--changelog string` | changelog for the moderator review (used only when the listing is already live) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app listing status`**

Show attached media and what's missing vs the publish floor

```text
Show your store listing's attached media (icon, cover, screenshots) and what
is still required before it can publish (an icon and a cover are mandatory).

Your store listing exists as a DRAFT from the moment you run
`civitai app submit`, so this works while your app is still pending review.

Note: on a LIVE (approved) listing this opens an in-progress revision draft and
reports ITS media (idempotent — it reuses any existing draft, and nothing is
submitted for moderator review until you run a set-/add- command and confirm).

--json emits the same read as one object: parentId, shadowId (null when there
is no revision draft), status, hasPendingRevision, the attached media with
their image ids, and the publish-floor verdict. The parent and the shadow are
DIFFERENT listings and a change is addressed to one of them, so a script that
has to decide which needs both ids. The server's own editTargetId is NOT in
there: this CLI does not decode that field, and reporting an id it never read
would be a guess.

🔴 This is not a pure read — with or without --json — so do not poll it in a
loop: on a LIVE listing it opens the shadow revision described above, so a
script calling it repeatedly keeps a revision draft open on your listing. That
holds for an OFFSITE app too, and they are approved in practice.
civitai/cli#389 settled that a FAILED call writes nothing; a successful one
still does.
```

```bash
  civitai app listing status
  civitai app listing status --slug my-app
  civitai app listing status --dir ./my-app
  civitai app listing status --json | jq -r .shadowId
```

| Flag | Description | Default |
|---|---|---|
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--json` | emit the listing as JSON (scriptable) — includes the parent and shadow listing ids; NOT a pure read (see the note in --help) | — |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app listing set-source-repo [url]`**

Set (or clear) the public source-repository link on your listing

```text
Publish a link to your app's PUBLIC SOURCE on its store detail page.

It renders as one `Source` row on the /apps DETAIL page — never on a
grid card — and is omitted entirely when unset.

Pass a repository ROOT url to set it, or --clear to remove it. Exactly one of
the two. The SERVER validates the url and this command does not second-guess
it, so a rejection comes back in the server's own words.

ON-SITE apps are REFUSED (exit 1 — a verdict about the app, not a bad
command): their link comes from the `repository` key in
block.manifest.json, which the platform re-syncs at every approved version.

🔴 THIS IS A MATERIAL CHANGE, unlike set-text. On an APPROVED listing the
server stages it on a REVISION instead of applying it, so the live page is
unchanged until a moderator approves that revision. This command reports which
branch the server took — it never guesses. On a draft or pending listing it
applies directly.

See the guide for the accepted hosts, what counts as a "change", and the
states that are refused outright.
```

```bash
  civitai app listing set-source-repo https://github.com/me/my-app
  civitai app listing set-source-repo https://gitlab.com/me/my-app --slug my-app
  civitai app listing set-source-repo --clear
  civitai app listing set-source-repo https://github.com/me/my-app --json
```

| Flag | Description | Default |
|---|---|---|
| `--clear` | remove the source-repository link (sends an explicit null) instead of setting one | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--json` | emit the result as JSON (scriptable) — what was sent, and the server's own branch | — |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

**`civitai app listing set-text`**

Set your listing's tagline, description or category

```text
Set the store listing's TEXT fields — tagline, description and category.

These are the three problems `civitai app doctor` reports as
empty-tagline / empty-description / empty-category, and this is the command that
fixes them without the browser.

Pass any combination of --tagline, --description and --category; they are sent
as ONE patch, so a run either applies or does not. At least one is required.

CLEARING vs EMPTYING are different server states and both are reachable:
--tagline "" sets an EMPTY STRING; --clear tagline sets it to NULL. --clear
takes a comma-separated list (tagline, description, category)
and cannot be combined with the matching value flag.

Blanking a field needs --yes, so an unset shell variable cannot silently empty
a public field. Whitespace-only counts as blank (the server trims).

CATEGORY must be one of:
generation, games, utility, discovery, moderation, analytics, other

ON-SITE apps are REFUSED (exit 1 — a verdict about the app, not a bad command):
their copy comes from block.manifest.json and the platform overwrites it at your
next approved version. Edit the manifest instead.

This applies IN PLACE on every listing status — these are not "material"
changes, so they never open a revision for re-review. The server rate-limits
these edits (roughly 30 an hour).
```

```bash
  civitai app listing set-text --tagline "Batch upscaling, in your browser"
  civitai app listing set-text --category utility --slug my-app
  civitai app listing set-text --description "$(cat DESCRIPTION.md)"
  civitai app listing set-text --clear tagline,category
```

| Flag | Description | Default |
|---|---|---|
| `--category string` | set the marketplace category: generation, games, utility, discovery, moderation, analytics, other | — |
| `--clear strings` | clear a field to null instead of setting it: tagline, description, category (comma-separated) | — |
| `--description string` | set the long description (max 2000 characters) | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--json` | emit the result as JSON (scriptable) — what was sent, and the server's own branch | — |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |
| `--tagline string` | set the short tagline (max 140 characters) | — |
| `-y, --yes` | permit a blank value for --tagline/--description/--category; blanks are refused without it (the check is on the VALUE you passed, not on the field's current contents) | — |

**`civitai app listing submit-revision`**

Submit your live listing's open revision for moderator review

```text
Submit the REVISION your live listing already has open — the one that
`civitai app listing status` reports and that `rm-screenshot` writes into — for
moderator re-review. Pass --changelog to describe the change.

Only an approved (LIVE) listing has a revision: a draft or pending listing is
edited directly, so there is nothing to submit and this refuses. It refuses too
when there is no open revision to submit, rather than sending a moderator an
empty one.

The revision is submitted as it stands, so stage everything you want in one
review cycle first. Submitting is idempotent — a revision already awaiting
review returns that same request rather than opening a second.
```

```bash
  civitai app listing submit-revision
  civitai app listing submit-revision --changelog "Dropped the outdated grid shot"
  civitai app listing submit-revision --slug my-app
```

| Flag | Description | Default |
|---|---|---|
| `--changelog string` | changelog for the moderator review | — |
| `--dir string` | app directory holding block.manifest.json (when --slug is not given) | `.` |
| `--slug string` | app slug (defaults to block.manifest.json's blockId) | — |

<!-- END GENERATED: cli/app-listing -->
</CliReference>
