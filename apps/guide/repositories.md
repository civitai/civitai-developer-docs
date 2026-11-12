---
title: Your app's git repositories
description: The two git repositories behind a Civitai App — the build repository of approved versions and the source repository forks and App Assistant apps get — cloning them with civitai app pull, the credential helper that keeps the token off disk, what a push does, App Assistant saves, what an approval commits and tags, and why submodules fail the build.
sources:
  - go:github.com/civitai/cli
  - civitai:src/server/services/blocks/app-source-repo.service.ts
  - civitai:src/server/services/blocks/approve-provenance.ts
---

# Your app's git repositories

An app hosted on Civitai has up to two git repositories on the platform git
host. You never create either one: the platform does. This page covers which
one you get, how to clone it, and what the platform writes into it.

| Repository | Path | Exists | Holds |
| --- | --- | --- | --- |
| **Build repository** | `civitai-apps/<slug>` | once a first version is **approved** | one commit per approved version. The build reads only this repository. |
| **Source repository** | `civitai-apps-src/<slug>` | from the first day of a **fork** or an **App Assistant** app, before any approval | your git history, including each App Assistant save as a commit. Nothing builds from it. |

An app you built locally and submitted as a ZIP has only a build repository,
and only after its first approval. Both repositories are private. You can read
and push to them if you own the app or are one of its accepted collaborators.
Until the app's first approval, only the person who forked or built it can
use its source repository.

## Cloning: `civitai app pull` {#pull}

```bash
civitai app pull --app my-block                # clone into ./my-block
civitai app pull ./my-block --app my-block     # clone into, or sync, ./my-block
civitai app pull . --app my-block              # sync the current directory
```

The slug goes in `--app`. The positional argument is the **directory**, not
the app, which is the reverse of every other `civitai app` command, so
`civitai app pull my-block` is refused (exit `2`).

- When the app has a **source repository**, `app pull` clones that (CLI
  **0.1.139** or later). Otherwise it clones the build repository.
- Run it again inside a checkout to sync it. A sync fetches the repository's
  default branch and fast-forwards the branch you have checked out onto it; it
  never creates a merge commit.
- A checkout of the **build** repository keeps syncing from the build
  repository, and the CLI tells you where the source repository is. If the app
  has no approved version at that moment, the sync stops instead and names the
  source repository to clone.
- An app with no source repository and no approved version has nothing to
  clone yet; the CLI says so and names the latest submission's state (exit
  `4`).

Every flag and message: [`civitai app pull`](../reference/cli/app#cli-app-pull).

### No token on disk {#credentials}

From CLI **0.1.138**, a clone stores no token. `app pull` clones the
token-less URL and writes a credential helper into the checkout's
`.git/config`, scoped to the platform git host:

```ini
[credential "https://<git host>"]
    helper =
    helper = !civitai git-credential --app my-block
    useHttpPath = true
```

On each fetch or push git runs `civitai git-credential`, which uses your
`civitai login` to ask the platform for your git credential, and hands it to
git only for this app's build or source repository. The empty `helper =` line
stops a helper from your global git config, such as `store`, from saving it.
A push keeps working for as long as your `civitai login` does.

The credential is a **write** token (`write:repository`) for every app
repository you can write to, not only this one. That is why it is kept out of
the checkout.

**Older clones.** A checkout made by an earlier CLI stored the token in its
remote URL. Run `civitai app pull` in it once: it removes the token from every
remote that points at this app's repositories, installs the helper, and says
so. A remote that carries a credential but points elsewhere is left alone, and
the CLI prints the `git remote set-url` that cleans it. The token is not
rotated, so if that `.git/config` was ever copied or shared, treat it as
exposed.

## Pushing {#push}

- **To the source repository:** the push is stored, and that is all. It never
  builds, never opens a review, and never submits a version. Submit with
  [`civitai app submit`](./review-and-deploy).
- **To the build repository's `main` branch:** the push becomes a publish
  request, which waits for review like a submit. It never deploys by itself.
  A push to any other branch creates nothing, and a push whose manifest is
  invalid, whose `blockId` does not match the repository, or whose `iframe.src`
  is set to anything but the canonical value creates no request either: the
  commit gets a failed status that says why. Pushes recorded for review are
  rate-limited.

## App Assistant saves {#assistant-saves}

App Assistant commits its work to the source repository as it goes. If a save
would overwrite a change you pushed to the same file, the save goes to the
`civitai-assistant` branch instead and `main` is left alone. `app pull` only
ever fetches the default branch, so fetch the assistant's branch yourself and
merge it when you choose:

```bash
git fetch origin civitai-assistant
git merge FETCH_HEAD
```

## What an approval writes {#approval-commit}

When a moderator approves a version, the platform writes that version as one
commit in the **build** repository. Approvals from 2026-11-12 onwards also
record where the version came from, so a build can be traced back to code.

The commit subject is `Approved publish request <pubreq_id> — <slug> v<version>`,
followed by git trailers in this order. A trailer whose value is unknown or
unsafe is left out.

| Trailer | Value | Who says so |
| --- | --- | --- |
| `Publish-Request` | the publish request id | the platform |
| `App-Version` | the manifest `version` | the platform |
| `Pushed-Commit` | the commit you pushed, for a version that came from a push to the build repository | the platform saw the push |
| `Source-Commit` | the commit `civitai app submit` reported for a ZIP submit | your CLI, **unverified** |
| `Source-Dirty` | `true` or `false`, only when the CLI reported it | your CLI, **unverified** |
| `Source-Repo` | the manifest's `repository` link, when it is `https://` | your manifest |

`Source-Commit` and `Source-Dirty` are the same values `civitai app status`
shows; see [Build provenance](./review-and-deploy#build-provenance-which-commit-is-live).

Each approved commit is also given an annotated tag. Usually that is
`v<version>`. A version tag is never moved, so when `v<version>` already
names an earlier commit (the same version approved twice), the new commit is
tagged `approved-<pubreq_id>` instead. A version that is not semver gets no
tag.

```bash
git log -1 --format=%B v1.4.0                  # subject and trailers
git log --format='%h %(trailers:key=Source-Commit,valueonly,separator=)' -5
```

From a source-repository clone, the build repository's commits and tags are not
in your history. Fetch them by URL. It is your `origin` URL with
`civitai-apps-src` replaced by `civitai-apps`, and the credential helper
already answers for it:

```bash
git fetch --tags https://<git host>/civitai-apps/my-block.git
```

## Reading `iframe.src` in a pulled checkout {#iframe-src}

A pulled `block.manifest.json` can carry `iframe.src` set to
`https://<blockId>.civit.ai/`, because the platform writes that value into the
build repository. From CLI **0.1.138**, `civitai app validate` accepts exactly
that value with a warning, so pull, edit and submit works without touching it.
Any other value is still an error. You can delete the key: the platform sets
it on submit and at build either way. See
[Server-owned fields](../reference/manifest#server-owned-fields).

## No git submodules {#no-submodules}

The build clones your app's repository without submodules, and a version whose
tree has a `.gitmodules` file **fails the build** with
`git submodules are not supported in app repos`. That applies to a version
from a push and to a ZIP submit, since `civitai app submit` packages
`.gitmodules` like any other file. Commit the files directly instead.

## Mapping a feedback report to code {#feedback}

A report in your [feedback inbox](./feedback) names the **platform commit**: the
build-repository commit of the version that was live. Check it out from a
build-repository clone, or fetch the build repository first as above. The
report's **reported source commit** is the `Source-Commit` value of that
version, in your own repository.

## Next

- [Review, approval and deploy](./review-and-deploy) — what happens after a
  submit or a push.
- [Your app's feedback inbox](./feedback) — what each report carries.
- [Forking an app](./forking) — how a fork's source repository starts.
