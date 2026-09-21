# Civitai Developer Docs

Source for [developer.civitai.com](https://developer.civitai.com) — built with [VitePress](https://vitepress.dev/).

Covers the **Orchestration API** (submit AI workflows for video, image, audio, and text generation through a single contract) and the **Civitai Site API** (browse models, images, creators, and tags on civitai.com). Structured to host additional product docs (SDKs, Signals, etc.) over time.

## Quick start

```bash
npm install
npm run dev
```

The dev server starts with HMR. The OpenAPI spec is resolved automatically from the sibling [civitai-orchestration](https://github.com/civitai/civitai-orchestration) repo if present, otherwise from the committed snapshot — see [OpenAPI spec sync](#openapi-spec-sync). Neither path touches the network.

## Build

```bash
npm run build       # outputs .vitepress/dist/
npm run preview     # serve the built site locally
```

### Docker

```bash
docker build . -t civitai-developer-docs
```

Produces an nginx:alpine image serving the static site.

## Project structure

```
├── index.md                           # Developer Hub landing page
├── orchestration/
│   ├── guide/                         # Consumer onboarding (auth, workflows, results, errors)
│   ├── recipes/                       # Runnable examples with interactive Try It widgets
│   ├── reference/                     # Auto-generated from OpenAPI spec (dynamic routes)
│   └── internals/                     # Architecture diagrams
├── site/
│   ├── guide/                         # Civitai site API: auth, pagination, errors, AIR
│   └── reference/                     # Hand-written per-resource endpoint docs
├── .vitepress/
│   ├── config.mts                     # Nav, sidebar, plugins
│   └── theme/
│       ├── components/                # AuthBar, RecipeRun, ResultViewer
│       └── composables/               # useAuthToken, useWorkflow
├── agent-setup/index.md               # Landing page for the one-line agent setup
├── public/agent-setup/prompt.md       # The raw prompt, served VERBATIM (see below)
├── scripts/copy-spec.mjs             # OpenAPI spec sync script
├── openapi-snapshots/                 # Committed spec snapshot — the build's default source
├── public/openapi/                    # Spec destination (gitignored)
├── public/.well-known/ai-catalog.json  # Machine-discovery catalog (see below)
├── Dockerfile                         # Multi-stage build for production
└── nginx.conf                         # cleanUrls routing + caching, .md content types, Link: advertisement
```

## The serving layer, for machine consumers

Facts about how this site is served that are easy to get wrong and hard to
notice, plus one that turned out not to be ours at all.

**`.md` is `text/markdown`, not `text/plain`.** nginx's `mime.types` has no entry
for `.md`, so `nginx.conf` sets it explicitly. It used to say `text/plain` "like
GitHub raw". That is the wrong type and it is not cosmetic: some agent fetchers
bypass lossy summarisation only for `text/markdown` responses under ~100k
characters, so every per-page `.md` this site publishes *for machines* was being
summarised away by exactly the consumers `vitepress-plugin-llms` exists to serve.

**`/agent-setup/prompt.md` is a verbatim static route.** It is
`public/agent-setup/prompt.md`; VitePress copies `public/` into the output with no
markdown pipeline, so the served bytes equal the source bytes. It gets an exact
`location =` match in `nginx.conf` with `text/markdown; charset=utf-8` and
`X-Content-Type-Options: nosniff`, and **no redirect** — Claude Code does not
follow a cross-host redirect, it returns a *description* of the redirect instead,
which would break every first fetch. `public/**` is in `srcExclude` so VitePress
does not also compile the raw prompt into a page.

**The `.md` type has one human-facing cost, and the landing page absorbs it.**
`text/markdown` + `nosniff` means a browser offers to SAVE a `.md` URL rather than
render it. Site-wide that is nearly free — humans visit `/apps/guide`, and
`/apps/guide.md` is the machine channel by convention. The exception is
`/agent-setup/prompt.md`, whose whole point is that a human reads it before
pasting an unsigned prompt into an agent. So `agent-setup/index.md` renders the
prompt's full text inline, generated from the served file by
`npm run gen:agent-setup-page` and graded byte-for-byte by
`npm run check:agent-setup`; the raw URL stays on the page, labelled as the
machine copy. Run the generator after **any** edit to `public/agent-setup/prompt.md`
— the check blocks a PR that forgot. See `scripts/agent-setup-page.mjs` for why
the inline copy is a fence rather than spliced markdown.

**✅ RESOLVED — Cloudflare used to 403 two user agents; it no longer does.** This
section said *"Nothing in this repository can change it … a naive
`urllib.request` fetch … is hard blocked"*, and that has been false since the fix
below. Re-measured 2026-09-11 against the live zone:

```
curl -sI -A 'Python-urllib/3.11' https://developer.civitai.com/   -> 200
curl -sI -A 'Python-urllib/3.12' https://developer.civitai.com/   -> 200
curl -sI -A 'libwww-perl/6.0'    https://developer.civitai.com/   -> 200
```

All three also return 200 on `/llms.txt` and `/agent-setup/prompt.md`, with
`python-requests` and default `curl` as controls.

The cause was **Cloudflare's Browser Integrity Check** (error **1010**), a
zone-level setting — never this repo, which is why the same `nginx.conf` run
locally always returned 200 to the blocked UAs. It was fixed with a
**Configuration Rule** on the `civitai.com` zone scoped to
`http.host eq "developer.civitai.com"`, setting `bic: false`; `browser_check`
stays `on` zone-wide, so `civitai.com` and `image.civitai.com` keep it.

**✅ RESOLVED — Cloudflare used to eat version numbers out of the published HTML.**
Email Address Obfuscation rewrites anything matching `user@domain` into an
obfuscated `[email protected]` link, and a version literal such as
`@civitai/theme@0.3.1` matches that shape. Measured 2026-09-19 over all 194
published pages: **26 rewrites on 9 pages**, and every decoded blob was an
identifier, not an address — 24 `@civitai/*` pins plus an AIR URN
(`spine-comfy@v1.0.0`) and a Docker tag (`python@3.12-slim`). Worst case was
`apps/guide/theming`, where it truncated the copy-pasteable CDN URLs to
`unpkg.com/@civitai/` — that page's whole purpose. Readers with JS got the text
back; no-JS readers, scrapers and anyone copy-pasting a URL did not.

It was fixed on the **same Configuration Rule** as `bic` above, by adding
`email_obfuscation: false`. `email_obfuscation` stays `on` zone-wide, so
`civitai.com` keeps it. Verified after the change with an HTTP-200 + closing-tag
control, so a zero could not be a failed fetch: rewrites across those 9 pages
went **26 → 0**, and `theming` went from 0 to 6 occurrences of `theme@0.3.1`
with the `unpkg` URLs intact.

🔴 **The tell that this has regressed is a version number rendering as
`[email protected]`** — in view-source or with JS off; with JS on, Cloudflare's
own script decodes it and the page looks fine. Check with
`curl -s <page> | grep -c __cf_email__` and a positive control that the page
actually loaded, because a bare `0` is indistinguishable from a failed fetch.

⚠ **Do not "fix" this in the repo.** A build-time wrapper using Cloudflare's
`<!--email_off-->` markers was written, proven to work locally, and then closed
unmerged (#93) in favour of the rule: the markers cannot be placed from markdown
at all (HTML comments do not survive the build, and most affected literals sit
inside fenced code blocks), a `transformHtml` hook reaches only `<body>` so
`<head>` stays exposed, and whether Cloudflare honours or strips the markers is
not observable before deploying.

🔴 **If either of these ever regresses, re-probe rather than re-reading
Cloudflare's docs.** No Cloudflare documentation states that a Configuration Rule
overrides the zone-level `browser_check` — that precedence was established
empirically, by reading `browser_check: "on"` while the exempted host served 200
to a UA that setting blocks. The same holds for `email_obfuscation`, which also
reads `on` at the zone while this host is exempt.

**This site ships a machine-discovery catalog, and also advertises it.** The
artifacts are `/llms.txt`, `/llms-full.txt` and `/agent-setup/prompt.md`;
`public/.well-known/ai-catalog.json` names all three in one document, and
`nginx.conf` sends a `Link:` header pointing at the catalog and the two `llms`
files from every document route. Measured 2026-09-11, no precedent does both:
`developers.cloudflare.com` ships the same two `.well-known` artifacts and
advertises neither, while `mintlify.com/docs` advertises six rels. Doing both
costs three header lines.

Two things about it are load-bearing and easy to undo by tidying:

- **`Link` is repeated in every `location` that sets any header.** nginx inherits
  `add_header` from an outer block *only if* the inner block declares none of its
  own, so one server-level `Link` is silently dropped by any location that sets a
  header. Measured on a real nginx: with a single server-level copy, four of five
  document routes served no `Link` — including `/`, which resolves through an
  internal redirect into `location ~* \.html$`. A one-URL smoke test of the
  homepage would have passed on a config that advertises almost nowhere.
- **The catalog's `location` carries an empty `types { }` block.** `.json` *is* in
  nginx's `mime.types`, so `default_type application/ai-catalog+json` alone is
  never consulted and the response comes back `application/json`. The empty block
  clears the map so `default_type` applies. It looks like a no-op; deleting it
  silently reverts the declared type.

`npm run check:ai-catalog` asserts the catalog and the header describe the same
site, and — on a schedule, never as a PR gate — that every URL either names
actually resolves. Advertising a dead target is worse than advertising nothing:
on 2026-09-11 `docs.mintlify.com` advertised six rels whose targets all returned
530, with nothing on their side red, because a `Link` header is consumed by
fetchers and no human ever sees the result.

**Not published, and deliberately:** `.well-known/agent-skills/index.json`. Every
entry in that format is a `tar.gz` or `SKILL.md` with a `sha256:` digest, and
this project publishes no skill bundles — `llms.txt` is already the flat index,
and a measured comparison put a flat index at 0.462 against 0.267 for a
hierarchy. An index with zero or invented entries would read as coverage while
providing none. The two MCP endpoints are absent for a different reason: a `GET`
to `mcp.civitai.com/mcp` is a 405 and `orchestration.civitai.com/mcp` a 401, so
they are transports rather than fetchable documents. The entry that would
represent them is a `.well-known/mcp/server-card.json`, which this site does not
serve yet.

## Interactive features

Recipe pages include **Try It** widgets (`<RecipeRun>`) that let readers preview cost, submit real workflows, and see results inline. Set an API token via the **Token** button in the navbar.

The API reference uses [vitepress-openapi](https://github.com/enzonotario/vitepress-openapi) for interactive playgrounds on each operation page.

## OpenAPI spec sync

The spec at `public/openapi/v2-consumers.json` is gitignored and resolved at dev/build time by `scripts/copy-spec.mjs`. **The build is hermetic — the default path makes no network request:**

1. Sibling repo, if the dev stack is checked out beside this one: `../../civitai-orchestration/repo/src/.../wwwroot/openapi/v2-consumers.json`
2. The committed snapshot: `openapi-snapshots/v2-consumers.json`

If neither exists the build fails immediately with a message naming both paths — it never falls back to the network, so a `orchestration.civitai.com` outage can no longer fail a build or a CI job.

To refresh the committed snapshot from the live spec (the only path that fetches):

```bash
npm run copy:spec -- --refresh   # rewrites openapi-snapshots/v2-consumers.json
```

Bounded: 20 s per attempt, 3 attempts. If it cannot reach the host it warns and falls back to the snapshot rather than failing.

Staleness is caught by `npm run check:spec-drift`, which runs daily from `appblocks-drift.yml` and goes red when the published spec no longer matches the snapshot. Same doctrine as the App Blocks snapshots: upstream freshness belongs on a schedule, never on a PR gate.

## CLI snapshot — detected daily, and REPAIRED by a PR

`appblocks-snapshots/civitai-cli-help.txt` is the only source the published CLI
reference is generated from: the production image has no `civitai` binary, so
`gen-appblocks-cli.mjs` always takes the snapshot path. A stale snapshot means
developer.civitai.com silently serves wrong content — the v0.1.92 re-capture
(#56) turned out to carry `2.0 MB` → `2.0 MiB` in 10 places.

### 🔴 The snapshot tracks the latest **release**, not civitai/cli's `main`

This is the policy the whole mechanism follows, and it was not written down
anywhere until it caused a misunderstanding worth recording.

**Why.** developer.civitai.com documents the binary a reader can actually
install — `brew install civitai`, `npm i -g @civitai/cli`, a GitHub release
archive. All three are *releases*. Capturing from civitai/cli's `main` would
publish help text for flags and commands nobody can obtain, on a site whose
whole job is to describe the tool in the reader's hands.

**So the trigger is tag-lag, and that is sufficient**: there is no
between-release build a reader could be holding for the docs to be wrong about.

**The consequence, which is deliberate and not a bug.** Drift on civitai/cli's
`main` between releases is *invisible* to this machinery. `check:cli-snapshot`
compares tags; so does the refresher. Two earlier hand re-captures (#48, #52)
happened while the tag was unchanged and that check was green — under this
policy those were re-captures of *unreleased* `main` state, which is the thing
that should not have happened, rather than incidents the automation missed.
Changing this is a policy decision (a docs PR per upstream merge, and a snapshot
header that stops naming an installable version), not a trigger swap.

Two halves, and neither is a PR gate (a civitai/cli release is upstream
movement, unrelated to any docs PR):

| | |
|---|---|
| **DETECT** | `npm run check:cli-snapshot` — daily from `appblocks-drift.yml`, red on drift. Read-only; safe to run anywhere. |
| **REPAIR** | `cli-snapshot-refresh.yml`, daily. Builds, re-captures, opens a PR. **A workflow, not a local command** — see below. |

`cli-snapshot-refresh.yml` builds a `civitai` binary at the latest release tag,
re-captures, and pushes the one stable branch `bot/cli-snapshot-refresh` — reused
rather than recreated, so there is one PR rather than one per day, and so a
commit *you* push there (the empty "trigger checks" commit, a fixup) is not
deleted by the next run. Each run also merges `main` into that branch before it
captures. Without that, the first PR you *accept* leaves the branch permanently
at odds with `main` — the squash-merge puts its bytes on `main` as a commit
outside the branch's own history — and every later run opens a **conflicted** PR
on a green run. If the two genuinely diverge, the run fails with both sides named
and a compare URL, rather than opening a PR nobody can merge. It **never pushes
to `main`**: the human read of that diff is what makes a real user-facing change
legible as one.

🔴 **`npm run refresh:cli-snapshot` is not a repair command you run.** It commits
to a shared remote branch and leaves your checkout sitting on it. It refuses
outside CI for that reason; `--dry-run` (below) is the local form.

A capture that is SHORT (fewer `===CMD` blocks than the snapshot it replaces),
carries NUL bytes, or came from a binary whose version disagrees with the target
tag **fails the job instead of opening a PR** — a short capture otherwise looks
like an ordinary refresh whose diff has quietly deleted whole command subtrees.

⚠️ **One repository setting must be on**, and it is off today: *Settings →
Actions → General → Workflow permissions → "Allow GitHub Actions to create and
approve pull requests"*. It is a repo/org Actions policy, so no `permissions:`
block can grant it. While it is off the job pushes the branch and then exits RED
with the setting to flip and a compare URL — measured live, `gh pr create` fails
with `GitHub Actions is not permitted to create or approve pull requests`.

⚠️ A PR opened with the default `GITHUB_TOKEN` does **not** get its checks run,
so that PR shows zero checks and `main`'s required contexts never report — the
same diff opened by a human ran all seven. Close and reopen it (or push an empty
commit) before reviewing. The PR body says so in its first section.

To exercise the drift path on demand while the snapshot is current, run the
workflow from the Actions tab with a `force_tag` input, or locally with
`--dry-run`, which captures, validates, prints the PR body it *would* open, and
restores the tree — no git writes, no `gh`:

```bash
CIVITAI_CLI_BIN=/path/to/civitai CLI_SNAPSHOT_REFRESH_TAG=v0.1.92 \
  npm run refresh:cli-snapshot -- --dry-run
```

The refresher's own tests run on every PR from `cli-snapshot-refresh-test.yml`
(`npm run test:refresh-cli-snapshot`). They are repo-local and offline — a
throwaway clone with a bare local `origin` and a `civitai` stand-in that replays
the committed bundle — so they block a PR under the same doctrine as
`appblocks-cli.yml`, while the workflow they guard stays scheduled.

## Adding a new section

1. Create a top-level directory (e.g. `signals/`)
2. Add sidebar and nav entries in `.vitepress/config.mts`
3. Add a feature card to `index.md`

## Testing interactive samples

`<ApiTry>` widgets (site docs) and `<RecipeRun>` widgets (orchestrator recipes)
can be exercised against the live APIs via:

```bash
CIVITAI_TOKEN=your-token npm run test:samples           # all
CIVITAI_TOKEN=your-token npm run test:samples:site      # /site only
CIVITAI_TOKEN=your-token npm run test:samples:orch      # /orchestration/recipes only
```

Orchestrator samples are submitted with `?whatif=true` — no Buzz is spent and
no jobs actually run. Site samples are plain GETs. CI runs this on every PR
that touches the samples and on a daily cron (see `.github/workflows/test-samples.yml`)
so API drift surfaces even when docs don't change.

### Skipping a known-broken sample

When a sample is intentionally broken (orchestrator-side bug, placeholder URL
awaiting a real asset, etc.), precede the widget with a `<!-- test-skip: -->`
HTML comment on the line immediately before it:

```md
<!-- test-skip: editVideo whatif returns empty-body 500 — unskip once fixed -->
<RecipeRun :body="editBody" />
```

The widget still renders in the docs, but the test script reports it as
skipped (with the reason) instead of failing. Skipped samples are listed in
the test summary as a reminder to revisit.

## License

Proprietary. Copyright Civitai.
