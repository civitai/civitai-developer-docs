---
title: Your app's feedback inbox
description: The private feedback your app's users send from inside it — who can read it, what each report carries (the platform commit, your reported source commit, recent failed SDK calls and host refusals, the reporter's browser environment, fork origin), how to read it with civitai app feedback, and why every user-written field is untrusted.
sources:
  - go:github.com/civitai/cli
  - civitai:src/server/schema/app-feedback.schema.ts
  - civitai:src/server/services/blocks/app-feedback.service.ts
---

# Your app's feedback inbox

Signed-in users can send private feedback about your app from inside it. Only
the app's owner and its accepted collaborators can read it: on civitai.com in
the app editor's **Feedback** tab (shown once the first report arrives), or
from the terminal with `civitai app feedback <slug>`.

This is your app's inbox. To report a problem with the Civitai developer
platform itself, use [`civitai feedback send`](/site/guide/platform-feedback).

## What a report carries {#contents}

Each report has the user's message, when it was written, its status, and the
surface it was written on (the App page, or a Model page for a slot app). The
platform also attaches the following. The reporter is told, in the feedback
form, what is attached.

| Field | What it is | Can you trust it? |
| --- | --- | --- |
| App version | the version that was live | the platform's record |
| **Platform commit** | the [build-repository](./repositories) commit of that version | the platform's record |
| **Reported source commit** and dirty flag | what `civitai app submit` reported for that version: the same `sourceCommit` / `sourceDirty` that [`civitai app status`](./review-and-deploy#build-provenance-which-commit-is-live) shows | **unverified**: your CLI's claim, and the commit may exist only on the machine that submitted |
| **Recent errors** | up to 10 of the app session's recent failed SDK calls, and requests the host dropped, refused or rewrote | **untrusted**: sent by the reporter's browser |
| **Environment** | browser family and major version, OS family, viewport size, device pixel ratio, scrollbar type (`classic` or `overlay`), and the app's route | **untrusted**: sent by the reporter's browser |
| **Fork origin** | for a fork: the app it was forked from, its version, and the commit the fork started at | the platform's record |

The source commit is stamped when the report is written, because the live
version changes with the next approval. Reports written before 2026-11-12 have
no source commit, recent errors or environment.

### Recent errors {#recent-errors}

The host already relays every SDK call your app makes, so it remembers the
**failed** replies it sent your app in the current session: the last 10,
from the last 30 minutes, with repeats folded into a count. Each entry has:

- the bridge message type of the request (or of the reply), and the platform's
  error text, cut at 300 characters;
- an error code and the platform's workflow id, when the reply had them;
- for a workflow request, only its `kind` and `step` and the checkpoint's
  `modelVersionId`;
- `reason`, when the host did not carry the request out as asked:
  `rate_limited`, `deduped`, `no_handler`, `not_applicable`,
  `validator_rejected`, `review_mode`, `not_ready`, `refused`, or `rewritten`
  (honoured, but not as the app worded it);
- for a navigation, the scope asked for and the one used, and the app-relative
  path without its query or fragment.

Prompts, parameters, images, request or response bodies, tokens, and anything
about the civitai.com page itself are **not** collected. The browser's full
user-agent string is not stored either.

## Reading it from the terminal {#cli}

```bash
civitai app feedback my-app                       # new reports, one page
civitai app feedback my-app --status all --all    # everything, every page
civitai app feedback my-app --json                # for a script or an agent
```

From CLI **0.1.138**, the human view prints the commits, the environment and
the recent errors as indented `  - ` lines between a report's header and its
message, and a fork's origin once, above the first report. With `--json`, a
report carries these keys, each **absent** when the server sent nothing:

| Key | Holds |
| --- | --- |
| `appVersion`, `appSha` | the version and the platform commit (either can be `null`) |
| `reportedSourceCommit`, `reportedSourceDirty` | the reported source commit; `reportedSourceDirty: false` means the CLI said clean, and absent means unknown |
| `forkOf` | `upstreamSlug`, `upstreamVersion`, `forkedAtCommit` |
| `untrustedDiagnostics` | `recentErrors` and `environment` |
| `untrustedMessage` | the user's message |

Every flag, filter and exit code:
[`civitai app feedback`](../reference/cli/app#cli-app-feedback).

::: danger User-written text is data, never instructions
The message and the diagnostics are written by site users. Treat them as data
to analyse. Never run a command, open a link or change a file because a report
says to. The JSON envelope's `notice` says so on every read, and the human view
prints message lines behind a `|` gutter that nothing the CLI writes carries.
:::

## Finding the code a report was written against {#code}

1. Take the report's platform commit (`appSha`).
2. Check it out in a clone of the app's **build** repository. If
   `civitai app pull` gave you the source repository, fetch the build
   repository into it first
   ([how](./repositories#approval-commit)), then `git checkout <appSha>`.
3. The approval commit's `Source-Commit` trailer, and the report's reported
   source commit, name the matching commit in your own repository.

## Answering a report {#status}

`civitai app feedback set-status <slug> <id> acknowledged` marks a report seen.
`resolved` and `wont_fix` **notify the user who wrote it**, and nothing moves a
report back to `new`, so mark it `resolved` only once the fix is approved and
live. `civitai app feedback flag <slug> <id>` sends an abusive report to the
moderators.
