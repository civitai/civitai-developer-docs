---
title: CLI troubleshooting
description: Look up a civitai CLI error message. Every row's left column is a fragment of a string the binary really prints, grouped by what you were doing — credentials, scaffolding, validating and submitting, generating.
sources:
  - go:github.com/civitai/cli
---

# CLI troubleshooting

**Look up the message you got.** Every row's left column is a fragment of a
string the [`civitai` CLI](./cli) really prints, so searching this page for a few
words of your error should land you on the right row. The third column links the
most relevant page — for most rows that is the full explanation, but where the
message itself already names the remedy the row is deliberately terse and the
link is context rather than instructions.

::: tip Branch on the exit code, not on this text
These strings are documentation, not an API. A script should branch on the
**exit code** — `civitai --help` prints the summary table and the full ledger is
in the [CLI README](https://github.com/civitai/cli#exit-codes) — so it can tell the
*kind* of failure apart without matching any sentence below.
:::

### Credentials and access

| You saw | What it means | Where to read more |
| --- | --- | --- |
| `no token configured` | Nothing is logged in. Run `civitai login` or set `CIVITAI_TOKEN` — the App **store** (`app list` / `app view`) is not an anonymous read either. | [CLI credentials and scopes](./cli-auth), [Browse the App store](https://github.com/civitai/cli#browse-the-app-store) |
| `forbidden (403)` | Usually the invite-only Apps beta rather than a broken token — the same account reads the public API fine. | [Submit & auth](https://github.com/civitai/cli#submit--auth) |
| `not permitted for your account (403)` | The **catch-all** listing `403`: managing a store listing needs Apps-author access, a narrower grant than submitting. The two rows below are the listing `403`s that are *not* about your grant. | [Store listing](/apps/guide/store-listing) |
| `under a moderator takedown (403)` | A moderator removed this **store listing**; **your account's access is not the problem** and no command reverses it — ask a moderator to relist it. Unpublishing it yourself is a different refusal: a *material* change, `400`, exit `2`. | [Some states are refused outright](/apps/guide/store-listing#some-states-are-refused-outright-rather-than-staged), [Exit code 3](https://github.com/civitai/cli#exit-code-3) |
| `belongs to another account (403)` | The listing is real and readable, but this account is **neither its owner nor an accepted collaborator** — **your access is not the problem**. There is no moderator bypass. Sign in as the owner (`civitai whoami` says who you are), accept a pending invite, or ask the owner. | [Exit code 3](https://github.com/civitai/cli#exit-code-3) |
| `Submit Apps:` | The `civitai whoami` capability row, and it is **tri-state**: **`unknown` is not `no`**, it is the CLI declining to answer. Re-run `civitai login` for a token whose scope the server reports. | [What `civitai whoami` reports](./cli-auth#what-civitai-whoami-reports) |
| `(token scope not reported by the server — Buzz capabilities unknown)` | The server reported no `tokenScope`, so the two **Buzz** rows are omitted rather than printed as `no`. **Submit Apps** above it is unaffected. | [What `civitai whoami` reports](./cli-auth#what-civitai-whoami-reports) |
| `not permitted to read this app's analytics (403)` | `app metrics` needs the **Apps submit scope**. Re-run `civitai login` if your token predates it; a full-scope personal API key also works. | [`app metrics`](/apps/reference/cli#cli-app-metrics) |
| `block lacks ai:write:budgeted scope` | Printed by your app at runtime under `dev:live`: the dev token was minted **without** `--spend`, and that scope is never requested implicitly, manifest or not. | [Spending real Buzz needs an explicit `--spend`](/apps/guide/local-dev#spending-real-buzz-needs-an-explicit-spend) |
| `the server can receive` | The submit body exceeds **10485760 bytes** and `app submit` refused **before uploading**, so it cost you nothing. Shrink the bundle, or pass `--allow-oversize` — the ceiling is vendored, not measured. | [How big can a bundle be?](/apps/guide/packaging#how-big-can-a-bundle-be) |
| `insufficient Buzz` / `generation disabled` | Not credential problems, which is why they exit `1` rather than `3` — a script must not loop on `civitai login` for either. | [`generate` exit codes](./cli-generate#exit-codes) |
| `rate limited (429)` | 🔴 **One message, TWO exit codes — branch on the code, never the text.** `2` for the deep-paging cap, which is structurally doomed (`--cursor`, not `--page`); `6` for a genuine throttle, which you retry. | [Exit codes](https://github.com/civitai/cli#exit-codes) |
| `Civitai returned HTTP` | **A retriable status that survived every read retry** — `502`/`503`/`504`, or a `429` carrying `Retry-After` — exiting **`5`** in every case. Read the number in the message to know which you hit. | [Exit codes](https://github.com/civitai/cli#exit-codes) |

### Scaffolding a project

| You saw | What it means | Where to read more |
| --- | --- | --- |
| `cannot derive a slug from` / `cannot appear in a blockId` | Exit `2`. Pass `--slug`. | [The blockId](https://github.com/civitai/cli#the-blockid) |
| `is not valid UTF-8` | Exit `2`, and `--slug` does not rescue it: the refusal is about the **display name**, which is written into the manifest as you typed it. | [The blockId](https://github.com/civitai/cli#the-blockid) |
| `… and the limit is …` | Exit `2` — the derived blockId would exceed 40 characters. Pass `--slug`. | [The blockId](https://github.com/civitai/cli#the-blockid) |
| `refusing to overwrite. Scaffold somewhere else` | From `app create` and `app init` alike. Exit `1` — a verdict about the directory, not about your invocation. | [Templates](https://github.com/civitai/cli#templates) |

### Validating and submitting

| You saw | What it means | Where to read more |
| --- | --- | --- |
| `… not found at project root …` | **`civitai app validate`** found no `block.manifest.json` in the directory you named — the finding reads `block.manifest.json not found at project root <dir>`, which the terminal wraps onto a second line for a long path (`--json` carries it as one `message` string). `app submit` prints it too, because it validates first. `app submit --skip-validate` never prints it, because it waives the validation that produces it — that run fails on the row below instead. The path itself was fine, which is why this exits `1` and not `2`. | [Exit code 1](https://github.com/civitai/cli#exit-code-1) |
| `is this an App project?` | The same cause, reported by a command that did not validate first: `civitai app listing …`, which has to work out *which* app you mean from the working directory, and `app submit --skip-validate`, which waived the check that produces the row above. `app validate` and a plain `app submit` never print it, because validation reports the row above first. Run `app listing` from the app directory, or name the app with `--slug` / `--dir`. | [Which app a listing command acts on](/apps/guide/store-listing#which-app-a-listing-command-acts-on) |
| `the server rejected this store-listing lookup (400)` | A **read** was refused and nothing was changed — a listing resolve, a read-for-edit, an asset-scan poll, or `app doctor`'s enumeration, which carries no input at all and so names no value to fix. Exit `2`. | [Listing doctor](https://github.com/civitai/cli#listing-doctor-app-doctor) |
| `the server rejected the image-upload request (400)` | The **image** was refused while being ingested. **No listing was changed**: nothing is attached until `set-icon` / `set-cover` / `add-screenshot` runs. Read the server's own reason after the code. Exit `2`. | [What is checked, and by whom](/apps/guide/store-listing#what-is-checked-and-by-whom) |
| `image upload PUT failed` | Storage refused the **bytes themselves** (e.g. `EntityTooLarge`), between minting the presigned URL and recording the row. No listing was changed, and it exits **`1`, not `2`** unlike the ingest steps above — a known inconsistency ([#388](https://github.com/civitai/cli/issues/388)). | [What is checked, and by whom](/apps/guide/store-listing#what-is-checked-and-by-whom) |
| `the server rejected this store-listing change (400)` | The **listing** was refused and may have **partially applied** — check `civitai app listing status`. It names no value to fix because the seven routes it covers do not all carry one. Exit `2`, except for a staged change refused only by the publish floor, which reports `staged on an open revision` and exits `0`. | […unless the listing is still below the publish floor](/apps/guide/store-listing#unless-the-listing-is-still-below-the-publish-floor) |
| `there is no open revision to submit` | Exit `1`. | [`submit-revision` is what publishes staged work](/apps/guide/store-listing#submit-revision-is-what-publishes-staged-work) |
| `this listing is not live` | Exit `1`. | [Editing a listing that is already LIVE](/apps/guide/store-listing#editing-a-listing-that-is-already-live) |
| `pass a URL or --clear, not both` | Exit `2`, and nothing is sent. | [Link your source code](/apps/guide/store-listing#link-your-source-code) |
| `nothing to do — pass a repository URL to set the link, or --clear` | `set-source-repo` with neither a URL nor `--clear`. The server would reject the empty patch too, but as a `400` costing a round trip and one of your ~30/hour listing edits. Exit `2`. | [Link your source code](/apps/guide/store-listing#link-your-source-code) |
| `the source-repository URL is blank` | Exit `2`, and nothing is sent — there is no "set it to empty" state to reach. | [Link your source code](/apps/guide/store-listing#link-your-source-code) |
| `source-repository link comes from the` | `set-source-repo` on an on-site app, whose link the platform re-syncs from `block.manifest.json` at **every** approved version. Set `repository` there and run `civitai app submit`. Exit `1`. | [Link your source code](/apps/guide/store-listing#link-your-source-code) |
| `no such directory — pass the path to an App project root` | A **usage** error: exit `2`, and `--json` prints nothing at all. | [A refused path emits no object at all](/apps/guide/validate#a-refused-path-emits-no-object-at-all) |
| `is not a directory — pass the App project ROOT` | A **usage** error too: exit `2`, and `--json` prints nothing at all. | [A refused path emits no object at all](/apps/guide/validate#a-refused-path-emits-no-object-at-all) |
| `it did NOT check that the file is loaded` | The `BLOCK_READY` advisory on its **weak** tier: it could not resolve what your `index.html` loads, so it checked only that *some* file mentions the message. The lines after it say what it could not follow. | [It checks REACHABILITY where it can](/apps/guide/validate#it-checks-reachability-where-it-can-and-says-when-it-can-t) |
| `nothing index.html loads reaches it` | The **strong** tier: the emitter is in your project but nothing the browser loads reaches it. Copying `civitai-host.js` in is only half the fix — it has to be referenced too. | [The `BLOCK_READY` advisory](/apps/guide/validate#the-block-ready-advisory) |
| `no lockfile is committed` / `is not a lockfile` | The platform build installs **strictly** from the committed lockfile, so a missing one, or a zero-byte one from `touch`, fails the build server-side. Generate it with the package manager. | [The lockfile rule](/apps/guide/validate#the-lockfile-rule) |
| `refusing to submit without --yes` | Exit `1`. `--package-only` and the no-token fallback never reach it. | [`civitai app submit`](/apps/reference/cli#cli-app-submit) |
| `What this CLI sent` / `What this CLI would have sent` / `largest entries in the bundle` | Not an error of its own: the CLI's account of the bundle, and the largest entries it was made of. `What this CLI **sent**` prints under any error the upload call reports once the request has gone out — **it does not claim to know why** — and not on a `401`/`403`/`429`. A failure that never reached the connection never prints the past tense: no usable credential, an unwritable config and a connection that never opened print neither block. `What this CLI **would have** sent` is the ceiling refusal alone — it sends nothing either, and says so — and that one is exact too: nothing was uploaded. A refusal that stops the submit before the upload step (no `--yes`, a dirty tree, the version guard, a validation failure) prints neither. | [What a rejected upload looks like](/apps/guide/packaging#what-a-rejected-upload-looks-like) |
| `Your repo may be behind what was last released` / `Resubmitting the version that is already live is almost always an accident` / `That version is approved but not live` | The **monotonic-version guard**: the manifest version is not strictly above the highest **approved** version, and approving an older or identical one supersedes the newer. `--allow-downgrade` submits anyway; the second line names which of four cases you are in. | [`civitai app submit`](/apps/reference/cli#cli-app-submit), [Tracking a submission](/apps/guide/review-and-deploy#tracking-a-submission) |
| `from a dirty git work tree` / `that go into the bundle are not committed` | The **dirty-work-tree guard**: files that go into the bundle are uncommitted, so approving one deploys code that exists in no commit. It names the paths — commit them, or pass `--allow-dirty`. | [Exit code 1](https://github.com/civitai/cli#exit-code-1), [the dirty-work-tree guard](/apps/guide/packaging#the-dirty-work-tree-guard) |
| `look like they hold credentials` | A **warning**, not a refusal — the exit code is unchanged. A file the packager KEPT holds a line shaped like a credential, and a submitted bundle cannot be recalled. It prints `path:line` and the key name, never the value. | [What looks like a credential](/apps/guide/packaging#what-looks-like-a-credential) |
| `HEAD is on no remote` | A **warning**, not a refusal. The packaged tree is clean, but its commit exists only on this machine, so the deployed version traces back to nothing anyone can fetch. Push the branch. | [The dirty-work-tree guard](/apps/guide/packaging#the-dirty-work-tree-guard) |
| `refusing to withdraw without --yes` | A withdraw asked for confirmation and found no TTY; nothing was withdrawn. It gates because withdrawing a **first-version** submission deletes that app's store listing — icon, cover and every screenshot. 🔴 **BREAKING** for a scripted `civitai app withdraw <id>` that used to exit `0`. | [Changing the bundle while a request is still pending](/apps/guide/review-and-deploy#changing-the-bundle-while-a-request-is-still-pending) |

### Generating

| You saw | What it means | Where to read more |
| --- | --- | --- |
| `could not read your Buzz balance` | A **warning**, not a refusal — the estimate and the confirmation went ahead without the balance check; `civitai buzz` shows the real balance. The reason after it is the **server's**, cut at 120 characters ([What a table cell can contain](./cli-output#what-a-table-cell-can-contain)). | [Confirmation](./cli-generate#confirmation) |
| `refusing to spend Buzz without --yes` | The same gate on the money path. `--dry-run` prices the job without spending anything. | [Confirmation](./cli-generate#confirmation) |
| `--image requires --ecosystem` | Without an ecosystem the server never promotes the job to image-to-image: your images are silently dropped and you pay for a plain text-to-image run. Hence a refusal, not a warning. | [Image-to-image](./cli-generate-models#image-to-image-image-and-ecosystem) |
| `interrupted while waiting` | **The generation is still running and has already been charged.** Ctrl-C stopped the wait, not the job. Re-attach with `civitai workflows get <id>`. | [Waiting, downloading, and re-attaching](./cli-generate#waiting-downloading-and-re-attaching) |
| `model substituted` | The server ran a **different checkpoint** than you asked for and billed for what ran. Warned by default; `--fail-on-substitution` refuses on the estimate, before any spend. | [Silent model substitution](./cli-generate-models#silent-model-substitution) |
| `The server reported: …` | The server's own words, which the CLI neither interprets nor calls retryable; only invisible and direction-reversing characters are removed first (`--json` is unfiltered). Printed on the `generate` error and by `civitai workflows get`. | [What the server says went wrong](./cli-workflows#what-the-server-says-went-wrong) |
| `An indented line under a row is what the server recorded` | The same record on `civitai workflows list`, wrapped but never abbreviated. The indent keeps server text out of the column a real row starts in, so a message cannot pose as a workflow of yours. | [What the server says went wrong](./cli-workflows#what-the-server-says-went-wrong) |
| `prompt: …` / `negative: …` | Generation prompts in `civitai images search --meta` and `civitai images get`, indented so a server string cannot impersonate a CLI output header — and deliberately **not** soft-wrapped, because that would alter prompt weights and syntax. | [What a table cell can contain](./cli-output#what-a-table-cell-can-contain) |
| `the orchestrator often supplies no failure reason, so it may not say why` | The same failure with **no** account recorded — a real, measured case, not a CLI limitation. Neither `civitai workflows get <id>` nor `workflows list` will say why either. | [What the server says went wrong](./cli-workflows#what-the-server-says-went-wrong) |

### Everything else

| You saw | What it means | Where to read more |
| --- | --- | --- |
| `has no approved App Block yet` | The slug is right and the app exists — its analytics do not, because no version is **approved** yet. The message names the next step for the latest submission's own state. Exit `1`, not `4`. | [`app metrics`](/apps/reference/cli#cli-app-metrics) |
| `no such app for your account` | The server did not recognise the app for your account. From `civitai app pull` it means only that the CLI could not prove the app is yours-but-unapproved. Settle it with `civitai app status`. | [Tracking a submission](/apps/guide/review-and-deploy#tracking-a-submission) |
| `has no approved version yet` | `civitai app pull` clones a repository that exists only once a version has been **approved**. The app is real; the message names the latest submission's state. Exit `4`. | [Pull your app's repository](https://github.com/civitai/cli#pull-your-apps-repository-app-pull) |
| `no such submission` | Nothing has been submitted for that app yet — `civitai app submit` creates the submission **and** the draft store listing — or, with `--id`, no publish request carries that id. | [Tracking a submission](/apps/guide/review-and-deploy#tracking-a-submission) |
| `is an OFFSITE app` | The app exists and is **offsite** — a registered URL, not a block bundle — so it has no block submission to resolve through, and never will. Normal from `civitai app status`; the message names `civitai app view <slug>` instead. | [Off-site apps have no submissions at all](/apps/guide/review-and-deploy#off-site-apps-have-no-submissions-at-all) |
| `is ambiguous — it matches` | Your `--file` value matched as a **substring**; an exact same-name collision is a different message. Exit `2`. | [Selecting files](./cli#selecting-files) |
| `SHA256 mismatch for` | A download's hash did not match, and the partial file was deleted. Retry — this is integrity checking working, not a bug. The file name is the **uploader's**, so it is sanitised and the progress line cut at 120 characters ([What a table cell can contain](./cli-output#what-a-table-cell-can-contain)). | [Integrity](./cli#integrity) |
| `checksum mismatch for` | The row above, during `civitai upgrade`. | [`civitai upgrade`](/apps/reference/cli#cli-upgrade) |
| ``git is required for `civitai app pull` `` | Exit `1`, reached only after the server has already answered. | [Pull your app's repository](https://github.com/civitai/cli#pull-your-apps-repository-app-pull) |
| `unexpected response from` | A public read endpoint answered **`200`** with a body this CLI could not decode — not your request, credential or network, which is why it exits `1`. Two causes are known and fixed ([#513](https://github.com/civitai/cli/issues/513), [#525](https://github.com/civitai/cli/issues/525)); a third means the body is a shape the SDK does not model — **please open an issue with the snippet**. | [When a body still will not decode](./cli-json#when-a-body-still-will-not-decode) |

## Where to go next

- [CLI](./cli) — installing the binary, and the read and download commands.
- [CLI terminal output](./cli-output) — why a server-supplied value in a
  table cell is always one line, and what `--json` is exempt from.
- [CLI credentials and scopes](./cli-auth) — which credential can do what.
- [Scripting the CLI with `--json`](./cli-json) — the output guarantees
  beyond the read endpoints.
- **Exit codes** — the full per-code ledger is in the
  [CLI README](https://github.com/civitai/cli#exit-codes).
