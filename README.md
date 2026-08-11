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
├── scripts/copy-spec.mjs             # OpenAPI spec sync script
├── openapi-snapshots/                 # Committed spec snapshot — the build's default source
├── public/openapi/                    # Spec destination (gitignored)
├── Dockerfile                         # Multi-stage build for production
└── nginx.conf                         # cleanUrls routing + caching
```

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
deleted by the next run. It **never pushes to `main`**: the human read of that
diff is what makes a real user-facing change legible as one.

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
