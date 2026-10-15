---
title: CLI troubleshooting
description: Look up a civitai CLI error message by the text it printed, grouped by what you were doing.
sources:
  - go:github.com/civitai/cli
---

# CLI troubleshooting

**Search this page for a few words of your error.** Each row's left column is
a fragment of a string the [`civitai` CLI](./cli) really prints.

::: tip Branch on the exit code, not on this text
These strings are documentation, not an API. A script should branch on the
**exit code** — `civitai --help` prints the summary table; the full ledger is in
the [CLI README](https://github.com/civitai/cli#exit-codes).
:::

### Credentials and access

| You saw | What it means | Where to read more |
| --- | --- | --- |
| `no token configured` | Nothing is logged in. Run `civitai login` or set `CIVITAI_TOKEN` — the App **store** (`app list` / `app view`) is not an anonymous read either. | [CLI credentials and scopes](./cli-auth), [Browse the App store](https://github.com/civitai/cli#browse-the-app-store) |
| `forbidden (403)` | Usually the invite-only Apps beta rather than a broken token — the same account reads the public API fine. | [Submit & auth](https://github.com/civitai/cli#submit--auth) |
| `not permitted for your account (403)` | The **catch-all** listing `403`: managing a store listing needs Apps-author access, narrower than submitting. The two rows below are listing `403`s that are *not* about your grant. | [Store listing](/apps/guide/store-listing) |
| `under a moderator takedown (403)` | A moderator removed this **store listing**; your account's access is fine and no command reverses it — ask a moderator to relist. Unpublishing it yourself is a different refusal (`400`, exit `2`). | [Some states are refused outright](/apps/guide/store-listing#some-states-are-refused-outright-rather-than-staged), [Exit code 3](https://github.com/civitai/cli#exit-code-3) |
| `belongs to another account (403)` | You are **neither the owner nor an accepted collaborator** of this listing; your access is otherwise fine and there is no moderator bypass. Sign in as the owner (`civitai whoami` says who you are), accept a pending invite, or ask the owner. | [Exit code 3](https://github.com/civitai/cli#exit-code-3) |
| `Submit Apps:` | The `civitai whoami` capability row, which is **tri-state**: **`unknown` is not `no`**. Re-run `civitai login` for a token whose scope the server reports. | [What `civitai whoami` reports](./cli-auth#what-civitai-whoami-reports) |
| `(token scope not reported by the server — Buzz capabilities unknown)` | The server reported no `tokenScope`, so the two **Buzz** rows are omitted rather than printed as `no`. **Submit Apps** above it is unaffected. | [What `civitai whoami` reports](./cli-auth#what-civitai-whoami-reports) |
| `not permitted to read this app's analytics (403)` | `app metrics` needs the **Apps submit scope**. Re-run `civitai login` if your token predates it; a full-scope personal API key also works. | [`app metrics`](/apps/reference/cli/app#cli-app-metrics) |
| `block lacks ai:write:budgeted scope` | Printed by your app at runtime under `dev:live`: the dev token was minted **without** `--spend`, and that scope is never requested implicitly, manifest or not. | [Spending real Buzz needs an explicit `--spend`](/apps/guide/local-dev#spending-real-buzz-needs-an-explicit-spend) |
| `the server can receive` | The submit body exceeds **10485760 bytes**; `app submit` refused **before uploading**, at no cost. Shrink the bundle, or pass `--allow-oversize` — the ceiling is vendored, not measured. | [How big can a bundle be?](/apps/guide/packaging#how-big-can-a-bundle-be) |
| `insufficient Buzz` / `generation disabled` | Not credential problems, which is why they exit `1` rather than `3` — a script must not loop on `civitai login` for either. | [`generate` exit codes](./cli-generate#exit-codes) |
| `rate limited (429)` | **One message, two exit codes — branch on the code.** `2` for the deep-paging cap (use `--cursor`, not `--page`); `6` for a genuine throttle, which you retry. | [Exit codes](https://github.com/civitai/cli#exit-codes) |
| `Civitai returned HTTP` | A retriable status (`502`/`503`/`504`, or a `429` with `Retry-After`) that survived every read retry. Exit **`5`**; the number in the message says which. | [Exit codes](https://github.com/civitai/cli#exit-codes) |

### Scaffolding a project

| You saw | What it means | Where to read more |
| --- | --- | --- |
| `cannot derive a slug from` / `cannot appear in a blockId` | Exit `2`. Pass `--slug`. | [The blockId](https://github.com/civitai/cli#the-blockid) |
| `is not valid UTF-8` | Exit `2`. `--slug` does not help: the problem is the **display name**, which is written into the manifest as typed. | [The blockId](https://github.com/civitai/cli#the-blockid) |
| `… and the limit is …` | Exit `2` — the derived blockId would exceed 40 characters. Pass `--slug`. | [The blockId](https://github.com/civitai/cli#the-blockid) |
| `refusing to overwrite. Scaffold somewhere else` | From `app create` and `app init`. Exit `1` — a verdict about the directory, not your invocation. | [Templates](https://github.com/civitai/cli#templates) |

### Validating and submitting

| You saw | What it means | Where to read more |
| --- | --- | --- |
| `… not found at project root …` | **`civitai app validate`** found no `block.manifest.json` in the directory you named — the finding reads `block.manifest.json not found at project root <dir>`, which the terminal wraps onto a second line for a long path (`--json` carries it as one `message` string). `app submit` prints it too, because it validates first. `app submit --skip-validate` never prints it, because it waives the validation that produces it — that run fails on the row below instead. The path itself was fine, which is why this exits `1` and not `2`. | [Exit code 1](https://github.com/civitai/cli#exit-code-1) |
| `is this an App project?` | The same cause, reported by a command that did not validate first: `civitai app listing …`, which has to work out *which* app you mean from the working directory, and `app submit --skip-validate`, which waived the check that produces the row above. `app validate` and a plain `app submit` never print it, because validation reports the row above first. Run `app listing` from the app directory, or name the app with `--slug` / `--dir`. | [Which app a listing command acts on](/apps/guide/store-listing#which-app-a-listing-command-acts-on) |
| `the server rejected this store-listing lookup (400)` | A **read** was refused; nothing changed. Covers a listing resolve, a read-for-edit, an asset-scan poll, and `app doctor`'s enumeration (which carries no input, so names no value to fix). Exit `2`. | [Listing doctor](https://github.com/civitai/cli#listing-doctor-app-doctor) |
| `the server rejected the image-upload request (400)` | The **image** was refused during ingest. **No listing changed** — nothing attaches until `set-icon` / `set-cover` / `add-screenshot` runs. The server's reason follows the code. Exit `2`. | [What is checked, and by whom](/apps/guide/store-listing#what-is-checked-and-by-whom) |
| `image upload PUT failed` | Storage refused the **bytes** (e.g. `EntityTooLarge`) after the presigned URL was minted. No listing changed. Exit **`1`**, not `2`. | [What is checked, and by whom](/apps/guide/store-listing#what-is-checked-and-by-whom) |
| `the server rejected this store-listing change (400)` | The **listing** change was refused and may have **partially applied** — check `civitai app listing status`. It names no value because the seven routes it covers do not all carry one. Exit `2`, except a change refused only by the publish floor, which reports `staged on an open revision` and exits `0`. | […unless the listing is still below the publish floor](/apps/guide/store-listing#unless-the-listing-is-still-below-the-publish-floor) |
| `there is no open revision to submit` | Exit `1`. | [`submit-revision` is what publishes staged work](/apps/guide/store-listing#submit-revision-is-what-publishes-staged-work) |
| `this listing is not live` | Exit `1`. | [Editing a listing that is already LIVE](/apps/guide/store-listing#editing-a-listing-that-is-already-live) |
| `pass a URL or --clear, not both` | Exit `2`, and nothing is sent. | [Link your source code](/apps/guide/store-listing#link-your-source-code) |
| `nothing to do — pass a repository URL to set the link, or --clear` | `set-source-repo` with neither a URL nor `--clear`. Refused locally rather than costing a `400` round trip and one of your ~30/hour listing edits. Exit `2`. | [Link your source code](/apps/guide/store-listing#link-your-source-code) |
| `the source-repository URL is blank` | Exit `2`, and nothing is sent — there is no "set it to empty" state to reach. | [Link your source code](/apps/guide/store-listing#link-your-source-code) |
| `source-repository link comes from the` | `set-source-repo` on an on-site app, whose link is re-synced from `block.manifest.json` at **every** approved version. Set `repository` there and run `civitai app submit`. Exit `1`. | [Link your source code](/apps/guide/store-listing#link-your-source-code) |
| `no such directory — pass the path to an App project root` | A **usage** error: exit `2`, and `--json` prints nothing at all. | [A refused path emits no object at all](/apps/guide/validate#a-refused-path-emits-no-object-at-all) |
| `is not a directory — pass the App project ROOT` | A **usage** error too: exit `2`, and `--json` prints nothing at all. | [A refused path emits no object at all](/apps/guide/validate#a-refused-path-emits-no-object-at-all) |
| `it did NOT check that the file is loaded` | The `BLOCK_READY` advisory's **weak** tier: it could not resolve what `index.html` loads, so it checked only that *some* file mentions the message. The following lines say what it could not follow. | [It checks REACHABILITY where it can](/apps/guide/validate#it-checks-reachability-where-it-can-and-says-when-it-can-t) |
| `nothing index.html loads reaches it` | The **strong** tier: the emitter is in your project but nothing the browser loads reaches it. Copying `civitai-host.js` in is not enough — reference it too. | [The `BLOCK_READY` advisory](/apps/guide/validate#the-block-ready-advisory) |
| `no lockfile is committed` / `is not a lockfile` | The platform build installs **strictly** from the committed lockfile, so a missing or zero-byte one fails the build server-side. Generate it with the package manager. | [The lockfile rule](/apps/guide/validate#the-lockfile-rule) |
| `refusing to submit without --yes` | Exit `1`. `--package-only` and the no-token fallback never reach it. | [`civitai app submit`](/apps/reference/cli/app#cli-app-submit) |
| `What this CLI sent` / `What this CLI would have sent` / `largest entries in the bundle` | Not an error of its own: the CLI's account of the bundle, and the largest entries it was made of. `What this CLI **sent**` prints under any error the upload call reports once the request has gone out — **it does not claim to know why** — and not on a `401`/`403`/`429`. A failure that never reached the connection never prints the past tense: no usable credential, an unwritable config and a connection that never opened print neither block. `What this CLI **would have** sent` is the ceiling refusal alone — it sends nothing either, and says so — and that one is exact too: nothing was uploaded. A refusal that stops the submit before the upload step (no `--yes`, a dirty tree, the version guard, the listing-completeness gate, a validation failure) prints neither. | [What a rejected upload looks like](/apps/guide/packaging#what-a-rejected-upload-looks-like) |
| `Your repo may be behind what was last released` / `Resubmitting the version that is already live is almost always an accident` / `That version is approved but not live` | The **monotonic-version guard**: the manifest version is not above the highest **approved** one, and approving an older or identical version supersedes the newer. `--allow-downgrade` submits anyway; the second line says which of four cases applies. | [`civitai app submit`](/apps/reference/cli/app#cli-app-submit), [Tracking a submission](/apps/guide/review-and-deploy#tracking-a-submission) |
| `from a dirty git work tree` / `that go into the bundle are not committed` | The **dirty-work-tree guard**: bundle files are uncommitted, so approving would deploy code in no commit. It names the paths — commit them, or pass `--allow-dirty`. | [Exit code 1](https://github.com/civitai/cli#exit-code-1), [the dirty-work-tree guard](/apps/guide/packaging#the-dirty-work-tree-guard) |
| `look like they hold credentials` | A **warning**; exit code unchanged. A kept file has a credential-shaped line, and a submitted bundle cannot be recalled. Prints `path:line` and the key name, never the value. | [What looks like a credential](/apps/guide/packaging#what-looks-like-a-credential) |
| `HEAD is on no remote` | A **warning**. The tree is clean but its commit exists only locally, so the deployed version traces back to nothing fetchable. Push the branch. | [The dirty-work-tree guard](/apps/guide/packaging#the-dirty-work-tree-guard) |
| `refusing to withdraw without --yes` | No TTY to confirm; nothing was withdrawn. Withdrawing a **first-version** submission deletes the app's store listing (icon, cover, every screenshot), so a scripted `civitai app withdraw <id>` needs `--yes`. | [Changing the bundle while a request is still pending](/apps/guide/review-and-deploy#changing-the-bundle-while-a-request-is-still-pending) |

### Generating

| You saw | What it means | Where to read more |
| --- | --- | --- |
| `could not read your Buzz balance` | A **warning**: the estimate and confirmation went ahead without the balance check; `civitai buzz` shows the real balance. The reason after it is the server's, cut at 120 characters ([What a table cell can contain](./cli-output#what-a-table-cell-can-contain)). | [Confirmation](./cli-generate#confirmation) |
| `refusing to spend Buzz without --yes` | The same gate on the money path. `--dry-run` prices the job without spending anything. | [Confirmation](./cli-generate#confirmation) |
| `--image requires --ecosystem` | Without an ecosystem the server silently drops your images and bills a plain text-to-image run, so this is a refusal. | [Image-to-image](./cli-generate-models#image-to-image-image-and-ecosystem) |
| `interrupted while waiting` | **The generation is still running and has already been charged.** Ctrl-C stopped the wait, not the job. Re-attach with `civitai workflows get <id>`. | [Waiting, downloading, and re-attaching](./cli-generate#waiting-downloading-and-re-attaching) |
| `model substituted` | The server ran a **different checkpoint** and billed for what ran. A warning by default; `--fail-on-substitution` refuses on the estimate, before any spend. | [Silent model substitution](./cli-generate-models#silent-model-substitution) |
| `The server reported: …` | The server's own words, not interpreted or classified as retryable; only invisible and direction-reversing characters are removed (`--json` is unfiltered). Printed on the `generate` error and by `civitai workflows get`. | [What the server says went wrong](./cli-workflows#what-the-server-says-went-wrong) |
| `An indented line under a row is what the server recorded` | The same record on `civitai workflows list`, wrapped but never abbreviated, and indented so it cannot pose as a workflow row. | [What the server says went wrong](./cli-workflows#what-the-server-says-went-wrong) |
| `prompt: …` / `negative: …` | Generation prompts in `civitai images search --meta` and `civitai images get`, indented so they cannot impersonate a CLI header, and **not** soft-wrapped (that would alter prompt weights and syntax). | [What a table cell can contain](./cli-output#what-a-table-cell-can-contain) |
| `the orchestrator often supplies no failure reason, so it may not say why` | No account was recorded for the failure. Neither `civitai workflows get <id>` nor `workflows list` will say why either. | [What the server says went wrong](./cli-workflows#what-the-server-says-went-wrong) |

### Everything else

| You saw | What it means | Where to read more |
| --- | --- | --- |
| `has no approved App Block yet` | The app exists but has no **approved** version, so no analytics. The message names the next step for the latest submission's state. Exit `1`, not `4`. | [`app metrics`](/apps/reference/cli/app#cli-app-metrics) |
| `no such app for your account` | The server did not recognise the app for your account. From `civitai app pull` it means only that the CLI could not prove the app is yours-but-unapproved; check with `civitai app status`. | [Tracking a submission](/apps/guide/review-and-deploy#tracking-a-submission) |
| `has no approved version yet` | `civitai app pull` needs a repository, which exists only after a version is **approved**. The message names the latest submission's state. Exit `4`. | [Pull your app's repository](https://github.com/civitai/cli#pull-your-apps-repository-app-pull) |
| `no such submission` | Nothing has been submitted for that app yet (`civitai app submit` creates the submission **and** the draft store listing), or no publish request carries that `--id`. | [Tracking a submission](/apps/guide/review-and-deploy#tracking-a-submission) |
| `is an OFFSITE app` | The app is **offsite** — a registered URL, not a block bundle — so it has no block submission. Normal from `civitai app status`; use `civitai app view <slug>`. | [Off-site apps have no submissions at all](/apps/guide/review-and-deploy#off-site-apps-have-no-submissions-at-all) |
| `is ambiguous — it matches` | Your `--file` value matched as a **substring**; an exact same-name collision is a different message. Exit `2`. | [Selecting files](./cli#selecting-files) |
| `SHA256 mismatch for` | A download's hash did not match and the partial file was deleted — integrity checking working. Retry. The file name is the uploader's, so it is sanitised and the progress line cut at 120 characters ([What a table cell can contain](./cli-output#what-a-table-cell-can-contain)). | [Integrity](./cli#integrity) |
| `checksum mismatch for` | The row above, during `civitai upgrade`. | [`civitai upgrade`](/apps/reference/cli/account-and-setup#cli-upgrade) |
| ``git is required for `civitai app pull` `` | Exit `1`, reached only after the server has already answered. | [Pull your app's repository](https://github.com/civitai/cli#pull-your-apps-repository-app-pull) |
| `unexpected response from` | A public read endpoint answered **`200`** with a body this CLI could not decode — not your request, credential or network, so exit `1`. **Report it with `civitai feedback send --about cli`, attaching the snippet with `--error-file`.** | [Report a platform problem](./platform-feedback), [When a body still will not decode](./cli-json#when-a-body-still-will-not-decode) |

## Where to go next

- [CLI](./cli) — installing the binary, and the read and download commands.
- [CLI terminal output](./cli-output) — why a server-supplied value in a
  table cell is always one line, and what `--json` is exempt from.
- [CLI credentials and scopes](./cli-auth) — which credential can do what.
- [Scripting the CLI with `--json`](./cli-json) — the output guarantees
  beyond the read endpoints.
- **Exit codes** — the full per-code ledger is in the
  [CLI README](https://github.com/civitai/cli#exit-codes).
- [Report a platform problem](./platform-feedback) — when the CLI, an SDK,
  these docs or app review got in your way: `civitai feedback send`.
