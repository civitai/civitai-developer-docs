---
title: CLI exit codes
description: The full per-code ledger for the civitai CLI — which paths each of the seven exit codes covers, the exit-to-stdout rules a script must branch on before parsing, and the two documented residuals.
sources:
  - go:github.com/civitai/cli
---

# CLI exit codes

`civitai` returns a differentiated exit code so scripts can branch on the
*kind* of failure without parsing stderr. The human-readable error message is
unchanged by this — only `echo $?` differs.

```bash
# Branch on failure kind
if ! civitai models get "$id" >/dev/null 2>&1; then
  case $? in
    3) echo "log in first: civitai login" ;;
    4) echo "no such model: $id" ;;
    5|6) echo "transient — retry later" ;;
    *) echo "failed" ;;
  esac
fi
```

`civitai --help` prints the one-line summary of every code. This page is the
**full ledger**: which paths each code covers, the residuals it deliberately
does not, and the rules a script has to branch on.

::: tip Each summary below is quoted from the binary
The blockquote opening each section is the exact one-line summary
`civitai --help` prints for that code, and `npm run check:cli-exit-codes`
fails if this page and the binary's captured help ever disagree.
:::

## The codes


### Exit code 0

> Success.


There is nothing more to say about success: the command did what it said, and any `--json` object it produces is on stdout.


### Exit code 1

> Generic / unclassified error. A filesystem failure lands here, and so does a
> validation verdict — an invalid manifest, or a real directory holding no
> manifest.


- A **filesystem failure** lands here — a file that exists but cannot be read,
  an unwritable config directory, an I/O error. It is neither a mistake about
  the invocation (`2`) nor a transport failure (`5`), and there is no
  filesystem-specific code.

- A **validation verdict** lands here, and deliberately not on `2`: `civitai
  app validate` exits `1` when the manifest is invalid, and likewise when the
  directory you named is a real directory with no `block.manifest.json` at its
  root — you pointed at a real place, so the invocation was right and the
  project is wrong. (A path that does **not exist**, or that is not a
  directory, is the invocation being wrong, and exits `2`.)

- **When validation produces a result**, `civitai app validate --json` prints
  it in full and its `ok` field is the structured form of the same answer; a
  failure that produces no result at all — a project directory the CLI cannot
  **stat**, say, because it is unreadable or because a path component below it
  is not a directory — still exits `1` with **nothing on stdout**, so branch on
  the exit code before parsing. The full exit→stdout table is in [The `--json`
  result shape](../../apps/guide/validate#the-json-result-shape).

- A resource that **exists but is not ready** lands here too, and deliberately
  not on `4`: `civitai app metrics <slug>` for an app whose submitted version
  is still in review exits `1`, because the slug is right and the app does
  exist — only its analytics do not exist yet, and the error names `civitai app
  status <slug>` as the next command. `4` stays reserved for a slug with no
  submissions at all, so the two remain separately actionable: fix the slug,
  versus wait for approval.

- A **version regression** lands here for the same reason: `civitai app submit`
  refuses when the manifest version is not strictly **above the highest
  approved version** of that app, because approving an older (or identical)
  version replaces the newer live deployment. Nothing about the invocation is
  wrong, so it is a verdict about the project, not a `2`. `--allow-downgrade`
  is the deliberate-rollback escape hatch, and the guard is skipped entirely by
  `--package-only` or a run with no token — neither reaches the server.

- A **dirty git work tree** lands here too: `civitai app submit` refuses while
  files that go into the bundle are uncommitted, because the bundle is packaged
  from what is on disk and approving one deploys code that exists in no commit.
  `--allow-dirty` submits the tree as it is. It **degrades rather than
  enforcing** — a directory that is not in a git repo, or a machine with no
  `git` on `PATH`, submits exactly as before (scaffolded apps have no repo, and
  that path must keep working), and a clean tree whose `HEAD` is on no remote
  **warns** instead of refusing. Like the version guard it is skipped by
  `--package-only` and by a run with no token.

- **A bundle the server cannot receive** lands here for the same reason, since
  [#585](https://github.com/civitai/cli/issues/585): `civitai app submit`
  refuses BEFORE uploading when the base64 JSON body would exceed what the
  platform accepts, so the transfer costs nothing. Nothing about the invocation
  is wrong — the project is too big — which is why it is `1` and not `2`,
  matching the version and dirty-tree refusals above. It previously reached `2`
  by way of the server answering `400: Invalid JSON`. `--allow-oversize` is the
  escape hatch, because the ceiling is a vendored number the CLI cannot
  re-measure; see
  [AGENTS.md](https://github.com/civitai/cli/blob/main/AGENTS.md) item 31.

- The **build-provenance stamp** those two guards now also collect (issue #411
  — the commit `civitai app submit` reports and `civitai app status` shows)
  changes no exit code at all, in either direction. It is sent only when the
  CLI can establish a value in exactly the shape the server accepts
  (`^[0-9a-f]{40}$`); every branch that cannot — no repo, no `git` on `PATH`, a
  repo with no commits, or an answer it does not recognise — sends nothing and
  submits exactly as it did before. A submit that would have succeeded cannot
  fail because of it, and a missing stamp is never an error.

- **"Wait for approval" is the *pending* case only.** The same `1` covers an
  app whose latest submission was **rejected** or **withdrawn** — nothing is in
  review there, so `civitai app metrics <slug>` says so and names a new
  `civitai app submit` as the next step instead of a review to wait for. What
  separates `1` from `4` is unchanged: the slug is right and the app exists.


### Exit code 2

> Usage error — a bad flag, a missing required flag or argument, a bad flag
> value, or a path that does not exist / is not a directory.


- Usage error — a bad flag, a **missing required flag or argument** (e.g.
  `civitai app withdraw` with no publish-request id), a bad flag **value**
  (`--limit` out of range, a non-integer id, `--template nope`), or a request
  the API rejected as malformed (HTTP 400, e.g. a bad `--period`/`--sort`
  enum).

- This does not depend on where the refusal happens: a mistake the CLI catches
  locally and one the server rejects both exit `2`. ⚠ **One exception, added by
  [#585](https://github.com/civitai/cli/issues/585):** a bundle too large to
  upload used to reach `2` via the server's `400: Invalid JSON`, and is now
  refused LOCALLY and exits `1` — a verdict about the project, like the other
  `app submit` refusals. A script branching on `2` for that case must branch on
  `1`.

- **A 429 can land here.** The API's deep-paging cap (`page*limit` past its
  fixed offset ceiling) arrives as HTTP 429, but it is permanent rather than
  transient — retrying the same page loops forever — so it is classified as a
  usage error and exits `2` rather than `6`. The fix is `--cursor` instead of
  `--page`. A genuine throttle still exits `6`; see [exit code
  6](#exit-code-6).

- A local image the CLI refuses before uploading anything (`civitai app listing
  set-icon <file>`, `civitai generate --image`) exits `2` when the file is
  missing, empty, a directory, over the size cap, or not a PNG/JPEG/WebP — but
  a file that exists and cannot be **read** (permissions, an I/O error) is a
  filesystem failure rather than a mistake about the invocation, and exits `1`,
  not `2`.

- That split is not images-only and it is not flags-only — it holds for **a
  flag's value and a positional argument alike**, over the paths listed here:
  `civitai generate --input <file>` likewise exits `2` for a path that is not
  there or is a directory, and `1` when the file is there and the read fails.

- The project commands take a positional path and refuse it the same way:
  `civitai app validate <dir>` and `civitai app submit <dir>` exit `2` when the
  path does not exist **or is not a directory**, because both are mistakes
  about the invocation. A directory that **does** exist but holds no
  `block.manifest.json` is a validation verdict instead, and exits `1`.

- `app listing set-cover` and `app listing add-screenshot` take the same
  positional `<file>` and refuse it the same way. (The CLI has no `--file`
  image flag at all: the only `--file` is `civitai download --file`, which
  picks a file *inside* a model version.)

- **Paths outside that list are not covered, and mostly exit `1`.** `civitai
  app listing … --dir <missing>` exits `1` (it reports "no
  `block.manifest.json` found in …", the same way it does for a directory that
  is really there but holds no manifest), and so does `civitai app submit …
  --out <path under a directory that does not exist>`. Both are stated rather
  than promised: this is a ledger of the paths the split is published for, not
  a claim about every path in the CLI.

- A usage error emits **no JSON object**, in every mode. `civitai app validate
  /nope --json` therefore writes nothing to stdout and exits `2`; it used to
  print `{"ok": false, …}` and exit `1`, which reported a nonexistent path as a
  validation result. Scripts that parsed that object must branch on the exit
  code first.


### Exit code 3

> Not authorized — login required, token invalid/expired, or the credential
> lacks the needed scope (HTTP 401/403).


- Authentication/authorization — login required, token invalid/expired, or the
  credential lacks the needed scope (HTTP 401/403, or no token configured).

- **Not every `403` here is about your credential.** `civitai app listing …`
  against a listing a **moderator removed** answers `403` and so exits `3`, and
  nothing about the account is wrong: no login, grant or scope changes it. The
  message says so rather than sending you to fix access that is already fine,
  and names asking a moderator to relist the listing as the next step. The
  message itself names the next step.

- **`civitai generate` refines this**: several of its failures are *not*
  credential problems but would otherwise land here or on `2`, so they exit `1`
  instead and a script never loops on `civitai login`. A **muted account or
  incomplete onboarding** arrives as a bare `403` that is byte-identical to a
  missing scope; **out of Buzz** and **generation disabled** arrive as `400`
  (the upstream 403 is re-thrown server-side as a tRPC `BAD_REQUEST`), which
  would otherwise read as "bad flags". See [Generating images from the
  CLI](./cli-generate#exit-codes).


### Exit code 4

> Not found — the requested resource does not exist.


- Usually an HTTP 404, but not always: some lookups answer `200` with an empty
  result set instead (`civitai app status <slug>` for an unregistered slug,
  `civitai users get` for an unknown username), and those exit `4` too.

- The same question therefore exits the same way however the API happens to
  phrase the miss.

- **An app that EXISTS but is `offsite` exits `4` from `civitai app status <slug>`, and that is deliberate.** That command resolves through the app's
  block submission, which an offsite app never has, so the *resource it looks
  up* is genuinely absent even though the app is not. Only the message changes
  — where the CLI can tell, it says the app is offsite and names a next step
  that can work, instead of `civitai app submit`, which cannot. This is **not**
  the `has no approved App Block yet` case on `1` above, which exits `1`
  because the thing looked up (analytics) is expected to appear later; an
  offsite app's block submission never will.

- **`civitai app listing …` no longer exits `4` for an offsite app in the
  normal case** — it falls back to selecting the listing by slug and succeeds
  ([#422](https://github.com/civitai/cli/issues/422), needing
  `civitai/civitai#3989` server-side). It still exits `4` when that fallback
  *also* answers **not-found**: a Civitai without `#3989` (older or
  self-hosted), or an app with no listing row. A listing your account does not
  own is **not** in that set on a current server — the by-slug lookup resolves
  it and then refuses it `403`, so it exits `3`.

- **A lookup failure that is not a 404 keeps its own code, and that is not
  always `3` or `5`.** Neither of the two lookups is retried past a non-404 — a
  `403`, a `5xx` or a transport failure says nothing about whether the resource
  exists — so you get the failing lookup's own error and its own code.
  **Measured** end-to-end on both lookups
  (`cmd/civitai/app_listing_lookup_exitcode_test.go`): `401`/`403` → `3`, `429`
  → `6`, `502`/`503`/`504` and a transport failure → `5`, and a plain **`500` →
  `1`**, because that status carries no classification sentinel at all. Do not
  read "the API failed" as "exit `5`": the code to retry on is `5`, and a `500`
  is not it.

- **The offsite wording is best-effort, and the exit code is not.** Naming an
  app as offsite costs one extra lookup against the public store catalog (`GET
  /api/v1/apps/{slug}`), and that route answers only for a **published** store
  listing and is itself still behind a launch flag — until the catalog opens
  publicly you see an app there only as a moderator or app-dev-tester. So an
  offsite app whose listing is not published, a caller without that access, or
  any network/5xx failure of the lookup all keep the generic `no such
  submission … run civitai app submit first` message. **Exit `4` either way**,
  so a script branching on the code is unaffected; only the human-readable half
  degrades, and always in that direction.


### Exit code 5

> Network/transport failure or service unavailable — the code to retry on.


- Network/transport failure or service unavailable — dial/timeout, or HTTP
  502/503/504 after retries.

- **A 429 can land here too**, which no surface used to say: a throttle that
  carries `Retry-After` is retried, and when it persists through every attempt
  the failure is tagged as service-availability rather than rate-limiting. The
  429 STATUS therefore reaches `2` (the deep-paging cap), `5` (a retried
  throttle that never cleared) or `6` (a throttle terminal on the first
  response). The MESSAGE does not: this case prints `Civitai returned HTTP 429
  after N attempts — the service is temporarily unavailable, try again
  shortly`, not `rate limited (429)`, so do not look for the latter here — see
  [exit code 6](#exit-code-6).

- This is the code to **retry** on, so a **filesystem** failure never lands
  here however retryable its errno looks: a permissions or I/O problem does not
  fix itself, and a loop that sleeps and re-runs would never terminate. Those
  exit `1`.


### Exit code 6

> Rate limited — throttled by the API (HTTP 429). Not every 429 lands here: the
> deep-paging cap is a usage error and exits 2.


- A **genuine throttle** — the API asking you to slow down — exits `6` **when
  it is terminal on the first response**. Retry with backoff.

- 🔴 **A throttle carrying `Retry-After` is RETRIED for you, and if it survives
  every attempt it exits `5`, not `6`** — and it prints a DIFFERENT message
  (`Civitai returned HTTP 429 after N attempts …`), so the `rate limited (429)`
  text you are reading about never appears. Measured: `rate limited (429)`
  reaches **`2` or `6`, never `5`**; the 429 STATUS reaches all three.

- 🔴 **THE HEADER IS CONSULTED BEFORE THE MESSAGE, so a cap-worded 429 that
  carries `Retry-After` exits `5`, NOT `2`.** Measured on a local server: body
  `You've requested too many pages …` plus `Retry-After: 1` exits `5` after 4
  requests. That is a structurally doomed request landing on the code to RETRY
  on — the exact hazard the `2` reclassification exists to prevent. It is
  reachable only if the server ever attaches `Retry-After` to a cap 429, which
  `pkg/civitai/retry.go` assumes it does not; that assumption is vendored and
  has no local guard, so it is published here rather than relied on silently.

- 🔴 **A 429 that is really the deep-paging cap exits `2`, not `6`, and this row
  exists because the contract used to say otherwise.** The API caps
  `page*limit` at a fixed offset ceiling and phrases the refusal as a 429 ("too
  many pages", "use cursors instead"). That request is **structurally doomed**:
  retrying the same page loops forever. It is reclassified to `2` so a generic
  429 backoff-and-retry loop does not spin on it — the remedy is `--cursor`
  instead of `--page`, which is a change to the invocation, which is what `2`
  means.

- The distinction is drawn from the server's own message, deliberately
  narrowly, so a real throttle is never misclassified as a usage error. The
  **visible message is unchanged** in both cases: `rate limited (429): … — for
  deep paging use --cursor instead of --page`. **Branch on the exit code, not
  the text.**


## Where to go next

- [Scripting the CLI with `--json`](./cli-json) — the output guarantees, and
  why a usage error emits no object.
- [Generating images from the CLI](./cli-generate#exit-codes) — `generate`'s
  own refinement of codes `1`, `2` and `3`.
- [CLI credentials and scopes](./cli-auth) — what exit `3` means for each
  credential.
