---
title: Submitting from GitHub Actions
description: Submit a Civitai App for review on a tag push with the civitai/app-submit-action Action — the workflow, the tag rule, what the server checks in the run's GitHub OIDC token, what moderators and store visitors see, and every refusal.
sources:
  - github:civitai/app-submit-action
  - go:github.com/civitai/cli
  - civitai:src/server/services/blocks/github-actions-oidc.service.ts#verifyGithubActionsOidcToken
  - civitai:src/server/services/blocks/actions-run-source.service.ts#assertActionsRunRepositoryPinned
  - civitai:src/components/Apps/reviewSourceProvenance.ts
  - civitai:src/components/Apps/appListingDetailRows.ts#actionsRunRowValue
---

# Submitting from GitHub Actions

The [`civitai/app-submit-action`](https://github.com/civitai/app-submit-action)
Action submits your app for moderator review when you push a version tag. It
installs the `civitai` CLI and runs `civitai app submit --yes`, the same submit
you run from a terminal, and it sends one extra thing: a **GitHub Actions OIDC
token** for the run. GitHub signs that token, and it names the repository, tag
and commit the run was for. The Civitai server checks the token with GitHub and
records that run with the submission.

**Moderator review is unchanged.** A submission from the Action goes through the
same review as one from your terminal, and it is approved or rejected the same
way. See [Review, approval and deploy](./review-and-deploy).

## Set up the workflow

Copy this into `.github/workflows/release.yml` in your app's repository. It is
the Action's
[`examples/release.yml`](https://github.com/civitai/app-submit-action/blob/main/examples/release.yml)
without its comments:

```yaml
name: Submit to Civitai

on:
  push:
    tags: ['v*']

jobs:
  submit:
    runs-on: ubuntu-latest
    permissions:
      contents: read   # check out the repository
      id-token: write  # let the action request a GitHub OIDC token
    steps:
      - uses: actions/checkout@v4
      - uses: civitai/app-submit-action@v1
        with:
          api-key: ${{ secrets.CIVITAI_API_KEY }}
```

Then add a Civitai API key as a repository secret named `CIVITAI_API_KEY`
(Settings → Secrets and variables → Actions → New repository secret). Never put
the key in the workflow file. Give the key the narrowest scope you can; see
[Which API key](#which-api-key).

**`permissions: id-token: write` is required.** Without it the job has no way
to request the token, and the Action stops before submitting with
`this job cannot request a GitHub OIDC token. Add 'permissions: id-token: write' (and 'contents: read') to the job that uses this action.`

### Which API key

**Any personal API key submits**, whatever its scope: the submit checks a
personal key's account, not its scope. Your account must still be one that can
submit Apps. Create the key in your
[account settings](https://civitai.com/user/account).

**Prefer the narrowest scope.** The key sits in your repository's secrets and
every workflow run can use it. A key whose only permission is **Read** on
**Profile & Settings** submits.

**With a key that isn't Full Access, the CLI skips its store-listing check.**
That check reads your listing before the upload and needs the Apps submit scope,
which a personal key can't carry. The CLI prints a warning and the submit
continues (see
[The submit skipped the store-listing check](#the-submit-skipped-the-store-listing-check)).
Check the listing yourself instead: run `civitai app doctor <slug>` locally
after `civitai login`, or open the listing in your browser. Skipping the check
changes nothing on the server: a moderator still reviews the submission.

**A Full Access key runs the listing check**, but it is a full-power credential
for your account, stored in CI.

### Inputs

| Input | Required | Default | What it is |
| --- | --- | --- | --- |
| `api-key` | yes | | Your Civitai API key, from a secret. |
| `path` | no | `.` | The app directory, the one holding `block.manifest.json`. |
| `cli-version` | no | `pinned` | The `civitai` CLI release to install: `pinned` (the release this Action version records, checked against a recorded sha256 per platform), a tag such as `v0.1.142`, or `latest`. The release must support `CIVITAI_GITHUB_OIDC_TOKEN`; the Action checks this and stops if it does not. |
| `audience` | no | `civitai.com` | The token audience. The server accepts only `civitai.com`, so leave it. |
| `base-url` | no | `https://civitai.com` | The Civitai site to submit to. |

The Action runs on Linux and macOS runners, x64 and arm64. Use
`civitai/app-submit-action@v1`; the `v1` tag moves to the newest `v1.x.y`
release.

## Push a tag that equals the manifest version

The tag **is** the version. If `block.manifest.json` says
`"version": "1.2.3"`, push `v1.2.3` or `1.2.3`:

```sh
git tag v1.2.3
git push origin v1.2.3
```

Any other tag is refused, by the Action before it downloads anything and again
by the server. The example workflow triggers on `v*` tags only, so a bare
`1.2.3` tag starts no run unless you widen the `tags` filter.

Only a **tag push** submits. The Action refuses a branch push, a pull request,
a `workflow_dispatch` and a `release` event, even one that runs on a tag.

## What the server checks

A token that reaches the server is checked before the bundle is uploaded. Every
check must pass:

- the signature is GitHub's: RS256, against GitHub's published Actions signing
  keys;
- the issuer is `https://token.actions.githubusercontent.com`;
- the audience is `civitai.com`;
- the token has not expired, and was issued no more than one hour ago (with 30
  seconds of clock leeway);
- every run claim the server stores is present and well formed;
- `event_name` is `push`;
- `ref_type` is `tag`;
- the tag is the manifest version, as `v<version>` or `<version>`;
- when the CLI also sent `sourceCommit` (the
  [commit it packaged from](./review-and-deploy#build-provenance-which-commit-is-live)),
  it equals the token's `sha`;
- the token has not been used before: each token is accepted once.

After those checks, the run's repository must be the one the app is **pinned**
to. The first submit whose token passes sets the pin, by GitHub's numeric
repository id, so a rename or transfer keeps it. From then on a token from any
other repository is refused. The pin is the repository of the app's earliest
submission with a recorded run that is still pending or approved; rejected and
withdrawn submissions don't count.

When everything passes, the server records the run's repository, tag, commit,
workflow and run id with the submission. The submit response then carries
`actionsRunSourceRecorded`, and the CLI prints one of:

```text
GitHub Actions run verified and recorded with this submission.
GitHub Actions run verified, but the server could not record it with this submission.
```

The run record is separate from `sourceCommit` / `sourceDirty`, which the server
stores as the client sent them, unchecked. One never fills in for the other.

### What the record does not mean

The token shows that a GitHub Actions run of that repository, for that tag and
commit, **submitted** this version. It does **not** show that the bundle was
built from that commit: your workflow builds and uploads the bundle, as you
would from a terminal. It is not a security review, and it does not change what
a moderator checks.

## What moderators see

The review page and the review modal show two separate lines below the
submitter:

```text
Claimed commit (sent by the client, not checked): a1b2c3d · clean tree
GitHub-signed Actions run: owner/repo @ v1.2.3 (a1b2c3d) · commit · run
```

The claimed-commit line ends `· clean tree`, `· uncommitted changes` or
`· tree state not sent`, or reads `none sent`. The run line links the commit
and the run on GitHub. For a repository that is not public it adds
`· private repository` (or `· internal repository`) after the commit. Under it
is a note:

> GitHub signed this run's repository, tag and commit. The run uploaded the
> bundle itself, so this does not show the bundle was built from that commit.

A submission with no run recorded shows `none` on the run line.

## What store visitors see

On the app's store detail page, a **Submitted by** row:

```text
Submitted by: GitHub Actions run of owner/repo @ v1.2.3 (a1b2c3d)
```

The value links to the commit on GitHub. The row appears only for the version
the app is serving, and only when that version's run was from a **public**
repository. A private or internal repository is never named on the store page.

## Troubleshooting

### The Action stopped before submitting

The Action checks the run before it downloads the CLI, and stops with an error
annotation titled `civitai/app-submit-action`. Its messages:

| Message | Fix |
| --- | --- |
| `this action submits only on a tag push, but this run was triggered by '<event>'. …` | Trigger the workflow with `on: push: tags: ["v*"]`. |
| `this action submits only on a tag push, but this run is for <ref> (<ref type>). …` | Same: push a tag, not a branch. |
| `this job cannot request a GitHub OIDC token. …` | Add `permissions: id-token: write` (and `contents: read`) to the job. |
| `the api-key input is empty. …` | Pass the `CIVITAI_API_KEY` secret as the `api-key` input, as the workflow above does, and check the secret exists. |
| `no block.manifest.json at <path>. …` | Set `path` to the directory that holds `block.manifest.json`. |
| `tag <tag> does not match the manifest version <version>. …` | Tag `v<version>` (or `<version>`), or bump `"version"` in `block.manifest.json`. |
| `this civitai CLI does not send a GitHub Actions OIDC token. …` | Set `cli-version` to a release that supports `CIVITAI_GITHUB_OIDC_TOKEN`, or leave it at `pinned`. |
| `could not get a GitHub OIDC token. …` | Check the job has `permissions: id-token: write`. |

### The server refused the token

A refusal stops the submit before anything is uploaded. The response body is
`{ message, code: "github_oidc_token_rejected", reason }`, and every `message`
starts `GitHub Actions OIDC token rejected:`. The token is never included in
it. By `reason`:

| `reason` | Status | The rest of the message | What to do |
| --- | --- | --- | --- |
| `malformed` | `400` | `the token is not a valid signed JWT` | Let the Action request the token; don't set `CIVITAI_GITHUB_OIDC_TOKEN` yourself. |
| `signature` | `400` | `the signature does not match a GitHub Actions key` | Same. Only a token GitHub Actions signed is accepted. |
| `issuer` | `400` | `the issuer must be https://token.actions.githubusercontent.com` | A GitHub Enterprise custom issuer is not accepted. Run the workflow on github.com. |
| `audience` | `400` | `the audience must be "civitai.com"; request the token with that audience` | Remove a changed `audience` input. |
| `expired` | `400` | `the token has expired`, or `the token is too old` | Re-run the workflow. The Action requests the token right before the submit. |
| `missing-claim` | `400` | `the token has no "<claim>" claim` | Let the Action request the token. |
| `invalid-claims` | `400` | `the "<claim>" claim is invalid`, or `the token carries a malformed run claim` | Same. |
| `not-a-push` | `400` | `the workflow ran for a "<event>" event; submit from a tag push` | Trigger on `push` of tags. |
| `not-a-tag` | `400` | `the workflow ran for <ref>, not a tag; submit from a tag push` | Push a tag, not a branch. |
| `tag-version-mismatch` | `400` | `tag <tag> does not match the manifest version <version> (expected v<version> or <version>)` | Push a tag that equals the manifest version. Re-running the same run checks out the same commit, so fix the manifest or the tag first. |
| `sha-mismatch` | `400` | `sourceCommit <sha7> is not the commit the workflow ran for (<sha7>)` | Submit from the tagged commit: don't check out another ref before the Action runs. |
| `replayed` | `400` | `this token was already used for a submit` | Re-run the workflow, which requests a fresh token. |
| `repository-mismatch` | `409` | `this app's verified submits come from <repo> (repository id <id>), but this token is from <repo> (repository id <id>). Submit from <repo>.` | Submit from the pinned repository. The pin moves only when no pending or approved submission with a recorded run remains (see [What the server checks](#what-the-server-checks)). |
| `unavailable` | `503` | `could not fetch GitHub Actions signing keys; re-run the workflow`, `could not check whether the token was already used; re-run the workflow`, or `could not read this app's pinned repository; re-run the workflow` | Re-run the workflow. |

**A token is spent once it passes the checks**, even when a later step of the
submit fails: the repository pin, the bundle upload, or creating the submission.
Retrying always means re-running the workflow, which requests a new token.

### The submit skipped the store-listing check

This is a warning, not a refusal: the submit continues. From CLI v0.1.146
(the Action's `pinned` CLI from v1.0.3), a run with a key that isn't Full Access
prints it to stderr:

| Message | Fix |
| --- | --- |
| ``⚠ skipped the store-listing check for <slug>: this credential cannot read listing media (403, it lacks the Apps submit scope). A personal API key never carries that scope and passes only with Full Access, so with a scoped key this check is skipped on every unattended submit. Submitting without the listing-completeness gate. To check the listing, run `civitai app doctor <slug>` from a `civitai login` session, or open the listing in your browser.`` | Expected with a scoped key (see [Which API key](#which-api-key)). Run `civitai app doctor <slug>` locally after `civitai login`, or check the listing in your browser. |

Any other error the submit prints is the CLI's usual submit error; look it up in
[CLI troubleshooting](/site/guide/cli-troubleshooting).

## Without the Action

`civitai app submit` sends the token whenever the `CIVITAI_GITHUB_OIDC_TOKEN`
environment variable is set (from CLI v0.1.142). The CLI reads it from the
environment only, never from a flag, and never prints it; it prints
`Sending the GitHub Actions OIDC token from CIVITAI_GITHUB_OIDC_TOKEN with this submit.`
to stderr. Without the variable the submit is unchanged. The Action is the
supported way to set it, because it requests the token for the right audience
right before the submit.

## Next

- [Review, approval and deploy](./review-and-deploy) — what happens after the
  submit, and the commit the CLI records.
- [Your store listing](./store-listing) — the rest of the store detail page.
- [CLI reference](../reference/cli) — every `app submit` flag.
