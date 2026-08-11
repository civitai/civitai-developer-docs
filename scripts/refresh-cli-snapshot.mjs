#!/usr/bin/env node
/**
 * refresh-cli-snapshot.mjs
 * ------------------------
 * SELF-HEALING for the `civitai` CLI help snapshot: when
 * `npm run check:cli-snapshot` would go RED, re-capture
 * `appblocks-snapshots/civitai-cli-help.txt` from a binary built at the latest
 * civitai/cli release and OPEN A PULL REQUEST carrying the new bytes.
 *
 * WHY THIS EXISTS
 * ---------------
 * That snapshot is the ONLY source the published CLI reference is generated
 * from: the Dockerfile builds in node:20-alpine with no `civitai` binary, so
 * `gen-appblocks-cli.mjs` always takes the snapshot path in prod. When the
 * snapshot goes stale the site silently serves WRONG content — measured on the
 * v0.1.92 re-capture (docs#56): the published reference said `2.0 MB` in 10
 * places across 8 lines where the CLI says `MiB`, because civitai/cli#282 had
 * fixed the unit and the docs had not moved.
 *
 * check:cli-snapshot already DETECTS this, and detection without a remedy is
 * the failure mode: its only output is a red run on a SCHEDULED workflow, and a
 * red on an unwatched schedule is indistinguishable from nobody looking. This
 * script is the remedy half.
 *
 * 🔴 THE POLICY: THE SNAPSHOT TRACKS THE LATEST *RELEASE*, NOT `main`'s TIP
 * ------------------------------------------------------------------------
 * This was never written down anywhere, and its absence produced a concrete
 * confusion — an earlier revision of this header, and of the PR that introduced
 * it, claimed this mechanism would have fired for the two hand re-captures
 * docs#48 and docs#52. It would not have fired for either: both happened while
 * the snapshot's TAG was unchanged and check:cli-snapshot was GREEN, and
 * `decideAction` below branches on exactly that tag comparison. So state the
 * rule instead of leaving it to be re-derived:
 *
 *   THE REASON. developer.civitai.com documents the binary a reader can
 *   actually install — `brew install civitai`, `npm i -g @civitai/cli`, a
 *   GitHub release archive. All three are RELEASES. Capturing from `main`'s tip
 *   would publish help text for flags and commands that no user can obtain, on
 *   a site whose whole job is to describe the tool in the reader's hands. So
 *   the snapshot's target is the latest published civitai/cli release, and
 *   tag-lag is the correct AND sufficient trigger — there is no between-release
 *   build a user could be holding for us to be wrong about.
 *
 *   THE CONSEQUENCE, STATED SO IT IS NOT READ AS A BUG. Drift on `main` between
 *   releases is DELIBERATELY INVISIBLE here. `commitsSinceSnapshot` (added by
 *   docs#53 for exactly that blind spot) is not consulted, on purpose. Under
 *   this policy docs#48 and docs#52 — which re-captured from UNRELEASED `main`
 *   builds — are the thing that should not have happened, not incidents this
 *   should have caught. docs#56 (v0.1.90-34 -> v0.1.92, a real release) is the
 *   shape this fires for, and check:cli-snapshot did go red that morning.
 *
 *   IF YOU DISAGREE, CHANGE THE POLICY DELIBERATELY — the switch is not a
 *   one-line trigger swap. Capturing `main` means every civitai/cli merge opens
 *   a docs PR, the snapshot header stops naming an installable version, and the
 *   published reference starts describing a binary nobody has. Decide that on
 *   its merits; do not arrive at it by "fixing" this trigger.
 *
 * WHAT IT DOES *NOT* DO
 * ---------------------
 * 🔴 It NEVER pushes to `main`. It opens a PR, because the human read of that
 * diff is the point: the MB→MiB change was only legible as a real user-facing
 * fix — rather than snapshot churn — because somebody looked at the diff. A bot
 * that commits straight to main converts a review into a notification.
 *
 * It is also NON-GATING and must stay so. Every guard in this repo that reacts
 * to UPSTREAM movement (a civitai/cli release is upstream movement, unrelated
 * to any docs PR) is scheduled rather than PR-blocking — see the doctrine
 * header in .github/workflows/appblocks-drift.yml. Do not add this workflow's
 * job to the required contexts on `main`.
 *
 * ONE STABLE BRANCH, EXTENDED — NEVER FORCE-PUSHED OVER
 * -----------------------------------------------------
 * The branch name is a CONSTANT (`bot/cli-snapshot-refresh`). A fresh branch
 * per run would open a PR per day for the same fact and get muted inside a week
 * — strictly worse than the red it replaces, because a muted PR stream also
 * buries the ONE PR that matters. One PR, updated in place, always describing
 * the current gap.
 *
 * 🔴 IT IS EXTENDED, NOT RECREATED, AND THAT IS A CORRECTNESS PROPERTY RATHER
 * THAN A STYLE CHOICE. The first cut did `git checkout -B <branch>` from a
 * fresh `main` and `git push --force`, consulting `origin/<branch>` not at all
 * — so every commit a human had pushed there was silently deleted on the next
 * cron tick, and a force-push reports success. The commit most certain to be
 * destroyed was the one THIS TOOL'S OWN generated PR body tells the reviewer to
 * push: `git commit --allow-empty -m "chore: trigger checks"`, the documented
 * remedy for the zero-checks trap below. So the run now FETCHES the remote
 * branch and builds on top of it when it exists, and the push is an ordinary
 * fast-forward. Never reintroduce `--force` here; if a run cannot fast-forward,
 * that is a concurrent writer and the correct answer is to fail loudly, not to
 * overwrite them.
 *
 * 🔴 …AND IT MUST BE RECONCILED WITH THE BASE, OR ITS OWN FIRST SUCCESS BREAKS
 * IT FOREVER. An extended-forever branch that nothing ever merges `main` into
 * goes permanently sideways the moment a bot PR is accepted: the SQUASH puts
 * the branch's bytes on `main` as a commit outside the branch's history, so
 * from the next run on, both sides carry a different edit to the same header
 * line and every PR this opens is born CONFLICTED — on a GREEN run, with
 * `↳ continuing …` in the log. Measured end to end; `delete_branch_on_merge` is
 * false here, so the branch really does survive the merge for the next run to
 * continue from. `syncWithBase` merges the base in BEFORE the capture is
 * written, which in that state is a clean no-content merge because the two
 * sides are byte-identical. It only reproduces with a squash — a merge commit
 * leaves the branch tip in the base's history and everything merges clean
 * afterwards. See `syncWithBase` for why merge rather than reset or rebase.
 *
 * 🔴 THE FLOOR — A SHORT CAPTURE MUST FAIL THE JOB, NEVER OPEN A PR
 * -----------------------------------------------------------------
 * This is the failure this whole path is most likely to produce, and it is
 * SILENT. `gen-appblocks-cli.mjs` prefers a live `civitai` on PATH; a CI runner
 * has none, so the job must build one itself and point CIVITAI_CLI_BIN at it.
 * Get that wrong — an older binary, a partial build, a walk that died halfway —
 * and the capture is SHORT. Measured in this repo before the generator defaulted
 * to the snapshot: a `civitai v0.1.89-20-g4018e2c` on PATH wrote **47** commands
 * instead of 52, silently dropping `generate` and the whole `workflows` subtree,
 * and exited 0. Through this script that would ship as a normal-looking PR whose
 * diff is mostly noise, with the Buzz-spending surface quietly deleted.
 *
 * So `validateCapture` gates the PR on three things, and a violation exits
 * NON-ZERO with no branch touched and no PR opened:
 *   1. BLOCK FLOOR — the new capture must carry at least as many `===CMD`
 *      blocks as the snapshot it replaces (106 today = 53 nodes × 2 blocks).
 *      The floor is RELATIVE on purpose: a hardcoded number rots the day the
 *      CLI legitimately removes a command, and this floor is self-maintaining
 *      because each accepted PR re-bases it. A legitimate REMOVAL therefore
 *      reddens this job once and needs a human — correct, and rare.
 *   2. ZERO NUL BYTES — a NUL makes git, grep and file(1) classify the snapshot
 *      as BINARY, so `git diff` refuses to show it and the hand review this
 *      whole design rests on silently ends. See repairPflagSentinel in
 *      gen-appblocks-cli.mjs for how one gets in.
 *   3. THE HEADER RECORDS THE TAG WE MEANT TO CAPTURE — otherwise the PR
 *      claims a version the bytes did not come from, and the next freshness
 *      check reads that claim rather than reality.
 *
 * 🔴 PREREQUISITE: "ALLOW GITHUB ACTIONS TO CREATE AND APPROVE PULL REQUESTS"
 * ---------------------------------------------------------------------------
 * This is OFF on this repository today, and while it is off the PR step CANNOT
 * succeed — no `permissions:` block can grant it, because it is a repo/org
 * Actions policy rather than a token scope. Measured live end-to-end: the
 * branch pushed fine and `gh pr create` failed with `GitHub Actions is not
 * permitted to create or approve pull requests (createPullRequest)`. Flipping
 * the setting and re-running the identical workflow opened the PR.
 *   gh api repos/civitai/civitai-developer-docs/actions/permissions/workflow
 *   -> {"default_workflow_permissions":"write","can_approve_pull_request_reviews":false}
 * `prCreationBlockedAdvice` turns that failure into instructions plus a
 * one-click compare URL, and the run still exits non-zero — the branch exists
 * but nobody has been told, which is the state this whole workflow exists to
 * end, so a green run would be a lie.
 *
 * 🔴 GITHUB_TOKEN AND THE ZERO-CHECKS TRAP
 * ----------------------------------------
 * A pull request opened by GITHUB_TOKEN does not get its checks run — GitHub
 * suppresses it to prevent recursive runs. MEASURED, with a discriminating
 * control, on two PRs carrying the same kind of diff into the same repo and
 * differing only in who opened them:
 *
 *   bot PR   (GITHUB_TOKEN) -> statusCheckRollup = 0 entries, `gh pr checks`
 *                              prints "no checks reported"; the seven
 *                              pull_request workflow runs exist only as
 *                              `conclusion=action_required` and never start.
 *   human PR (same diff)    -> statusCheckRollup = 7 entries, all in_progress.
 *
 * So state the OBSERVABLE — the PR shows zero checks — rather than "no runs are
 * created", which the measurement does not support. Zero checks reads as
 * "nothing to worry about" on exactly the PR whose content nobody has verified,
 * and `main`'s six required contexts never report, so the PR also cannot reach
 * a mergeable state on its own.
 *
 * There is no PAT secret in this repo (measured: `gh api
 * repos/civitai/civitai-developer-docs/actions/secrets` -> total_count 0), and
 * creating one is a maintainer decision, not a bot's. So the mitigation here is
 * disclosure rather than a fix: `prBody` states it in the FIRST section, above
 * the diff summary, with the two one-click remedies. If a PAT is ever added,
 * pass it as the `gh` token in the workflow and delete that section.
 *
 * USAGE
 *   node scripts/refresh-cli-snapshot.mjs                # the CI path
 *   node scripts/refresh-cli-snapshot.mjs --decide       # print/emit the verdict ONLY; no capture, no git, no gh
 *   node scripts/refresh-cli-snapshot.mjs --dry-run      # capture + validate + print; no git, no gh
 *   node scripts/refresh-cli-snapshot.mjs --no-pr        # branch/commit/push; print the PR instead of opening it
 *
 * `--decide` exists so the WORKFLOW can ask the question once, cheaply, before
 * paying for a Go toolchain and a full upstream build — and so the answer the
 * expensive jobs act on is the SAME answer, rather than a second resolution
 * that can disagree with the first. It writes `action` / `tag` / `latest` to
 * $GITHUB_OUTPUT when that is set.
 *
 * ENV
 *   CIVITAI_CLI_BIN                   the binary to capture from (required unless up to date)
 *   CLI_SNAPSHOT_REFRESH_TAG          FORCE a refresh at this tag, bypassing the freshness verdict.
 *                                     The documented test override — it is what lets the drift path be
 *                                     exercised on demand while the committed snapshot is current.
 *   CLI_SNAPSHOT_REFRESH_LATEST_TAG   the latest RELEASE tag, already resolved. Answers the upstream
 *                                     question WITHOUT asking again — it does not force anything and does
 *                                     not bypass the verdict; `decideAction` classifies it exactly as it
 *                                     would classify a freshly fetched answer. It exists because resolving
 *                                     the tag twice in one workflow can return two different answers if a
 *                                     release publishes in between, and the observable of that is a
 *                                     `WRONG BINARY` refusal that blames the capture for a race.
 *   CLI_SNAPSHOT_REFRESH_BRANCH       override the stable branch name (default bot/cli-snapshot-refresh)
 *   CLI_SNAPSHOT_REFRESH_BASE         override the PR base branch (default main)
 *   APPBLOCKS_CLI_RELEASES_URL        release-endpoint override (shared with check-appblocks-cli-snapshot)
 *   GITHUB_TOKEN / GH_TOKEN           lifts the 60/hr unauthenticated rate limit on the releases GET, and
 *                                     is the `gh` credential. Absent, the GET may 403 and the run SKIPs.
 *   GITHUB_SERVER_URL / GITHUB_REPOSITORY / GITHUB_RUN_ID   used to link the run from the PR body
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifySnapshot, parseSnapshotVersion } from './check-appblocks-cli-snapshot.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** Path of the snapshot RELATIVE to the repo root — the only file this ever commits. */
export const SNAPSHOT_REL = 'appblocks-snapshots/civitai-cli-help.txt';

/**
 * 🔴 A CONSTANT, and EXTENDED rather than recreated. See the header: a per-run
 * branch opens a PR per day for one fact and gets muted, which buries the run
 * that matters — and RECREATING this one force-deleted human commits.
 */
export const DEFAULT_BRANCH = 'bot/cli-snapshot-refresh';
export const DEFAULT_BASE = 'main';

const RELEASES_URL =
  process.env.APPBLOCKS_CLI_RELEASES_URL || 'https://api.github.com/repos/civitai/cli/releases/latest';

// ---- pure helpers (exported for scripts/test-refresh-cli-snapshot.mjs) ------

/**
 * The number of `===CMD <label>===` blocks in a snapshot. Every node
 * contributes exactly two (its `--help` body and its `__complete` enumeration),
 * so this is the anti-truncation quantity — and it is counted on the RAW TEXT
 * rather than by parsing, because a parse that fails is exactly the state a
 * truncated capture is in.
 */
export function countSnapshotBlocks(text) {
  return (String(text).match(/^===CMD .+===$/gm) || []).length;
}

/** NUL bytes. Non-zero means the committed snapshot would be a BINARY file to git. */
export function countNulBytes(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 0) n++;
  return n;
}

/**
 * Gate a fresh capture before ANY branch is touched.
 *
 * Returns `{ ok, problems: string[], stats }`. `problems` is author-facing:
 * it is printed to stderr and it is what the job fails on.
 *
 * 🔴 Failing here must NEVER degrade to opening a PR anyway. The whole hazard
 * is that a short capture LOOKS like a normal refresh — its diff is a big red
 * block and a big green block either way — so the only defence is refusing at
 * this seam.
 */
export function validateCapture({ next, prev, expectedTag }) {
  const problems = [];
  const nextBlocks = countSnapshotBlocks(next);
  const prevBlocks = countSnapshotBlocks(prev);
  const nuls = countNulBytes(next);
  const parsed = parseSnapshotVersion(next);

  if (nextBlocks < prevBlocks) {
    problems.push(
      `SHORT CAPTURE: the new snapshot carries ${nextBlocks} \`===CMD\` blocks, the one it replaces carries ` +
        `${prevBlocks}. Every command contributes two blocks, so this capture is missing ` +
        `${(prevBlocks - nextBlocks) / 2} command(s). The usual cause is capturing from the WRONG BINARY — ` +
        `gen-appblocks-cli.mjs prefers a live \`civitai\` on PATH, and an older or partially-built one walks a ` +
        `smaller tree and still exits 0. Check CIVITAI_CLI_BIN points at a binary built at ${expectedTag}. ` +
        `If the CLI genuinely REMOVED a command, this floor is doing its job and needs a human: re-capture by ` +
        `hand and open the PR yourself.`,
    );
  }
  if (nuls > 0) {
    problems.push(
      `NUL BYTES: the new snapshot carries ${nuls} NUL byte(s). git, grep and file(1) would classify it as a ` +
        `BINARY file and \`git diff\` would refuse to render it — which silently ends the hand review this ` +
        `whole auto-PR design rests on. See repairPflagSentinel in scripts/gen-appblocks-cli.mjs.`,
    );
  }
  if (!parsed.ok) {
    problems.push(`UNREADABLE HEADER: ${parsed.reason} — the capture did not write a well-formed header.`);
  } else if (expectedTag && parsed.tag !== expectedTag) {
    problems.push(
      `WRONG BINARY: the capture's header records civitai ${parsed.raw} (tag ${parsed.tag}) but this refresh ` +
        `targeted ${expectedTag}. Committing it would publish a snapshot whose own header lies about its ` +
        `source, and the next freshness check reads that header rather than reality.`,
    );
  }

  return {
    ok: problems.length === 0,
    problems,
    stats: { nextBlocks, prevBlocks, nuls, tag: parsed.ok ? parsed.raw : null },
  };
}

/**
 * What to do, given the committed snapshot's parsed header and the upstream
 * answer. Pure, so the three branches are testable without network.
 *
 * `up-to-date` and `skip` are DIFFERENT and must stay so: `up-to-date` is a
 * measurement (we asked and the answer was no), `skip` is the absence of one
 * (we could not ask). Collapsing them would let a rate-limited runner report
 * "the snapshot is current" forever.
 */
export function decideAction({ snapshotTag, latestTag, forcedTag }) {
  if (forcedTag) {
    return {
      action: 'refresh',
      targetTag: forcedTag,
      reason: `CLI_SNAPSHOT_REFRESH_TAG=${forcedTag} forces a capture regardless of the freshness verdict`,
    };
  }
  if (!latestTag) {
    return { action: 'skip', targetTag: null, reason: 'could not reach the civitai/cli releases endpoint' };
  }
  const cls = classifySnapshot(snapshotTag, latestTag);
  if (cls.status === 'stale') {
    return {
      action: 'refresh',
      targetTag: latestTag,
      reason: `snapshot tag ${snapshotTag} LAGS the latest civitai/cli release ${latestTag}`,
    };
  }
  return {
    action: 'up-to-date',
    targetTag: null,
    reason:
      cls.status === 'ahead'
        ? `snapshot tag ${snapshotTag} is AHEAD of the latest release ${latestTag} (unreleased build)`
        : `snapshot tag ${snapshotTag} matches the latest civitai/cli release ${latestTag}`,
  };
}

export function prTitle(targetTag) {
  return `chore(snapshot): re-capture the CLI help snapshot at ${targetTag}`;
}

/**
 * The PR body.
 *
 * 🔴 THE ZERO-CHECKS DISCLOSURE IS THE FIRST SECTION, ABOVE THE DIFF SUMMARY,
 * and that placement is the mitigation rather than a nicety. A PR opened by
 * GITHUB_TOKEN shows no checks at all, and "no checks" is visually identical to
 * "everything passed" in the GitHub UI — on the one PR in this repo whose
 * contents nobody has reviewed. There is no PAT to fix it with, so the only
 * available defence is making it impossible to misread. If a PAT secret is ever
 * added and wired into the workflow's `gh` token, DELETE this section — leaving
 * a false warning in place teaches reviewers to skim the body.
 */
export function prBody({ fromVersion, targetTag, stats, reason, runUrl, branch }) {
  const run = runUrl ? `[this workflow run](${runUrl})` : 'the scheduled `cli-snapshot-refresh` run';
  return `## ⚠️ This PR's checks did NOT run automatically

A pull request opened by a workflow using the default \`GITHUB_TOKEN\` does not
get its checks run — GitHub suppresses it to prevent recursive runs. So the
checks list on this PR is **empty, not green**, and \`main\`'s six required
contexts will never report, which also leaves this PR unable to reach a
mergeable state on its own. (Measured against a control: the same diff opened by
a human ran all seven checks; opened by the bot, zero.)

**Before reviewing, trigger them:** close and reopen this PR, or push an empty
commit to \`${branch}\`:

\`\`\`
git commit --allow-empty -m "chore: trigger checks" && git push
\`\`\`

Do not read the absent checks as a pass.

## What this is

The committed \`${SNAPSHOT_REL}\` is the **only** source the published CLI
reference is generated from — the production image has no \`civitai\` binary, so
\`gen-appblocks-cli.mjs\` always takes the snapshot path. When the snapshot goes
stale, developer.civitai.com silently serves wrong content.

${run} found: **${reason}**, and re-captured the snapshot from a \`civitai\`
binary built at \`${targetTag}\`.

| | |
|---|---|
| snapshot was captured from | \`civitai ${fromVersion}\` |
| now captured from | \`civitai ${stats.tag}\` |
| \`===CMD\` blocks | ${stats.prevBlocks} → ${stats.nextBlocks} (${stats.nextBlocks / 2} commands) |
| NUL bytes | ${stats.nuls} |

The capture passed the pre-PR floor: at least as many \`===CMD\` blocks as the
snapshot it replaces, zero NUL bytes, and a header recording \`${targetTag}\`. A
capture failing any of those **fails the job instead of opening a PR** — a short
capture (an older binary walks a smaller tree and still exits 0) otherwise ships
as a normal-looking diff with whole command subtrees quietly deleted.

## Review this diff by hand

That is what this PR is for. The last re-capture (docs#56) turned out to carry a
real user-facing fix — \`2.0 MB\` → \`2.0 MiB\` in 10 places — which was only
legible as a fix because somebody read the diff. Look for changed prose, new or
removed flags, and new commands; \`git diff --stat\` alone will not show you any
of it.

This branch is \`${branch}\`, reused and extended on every run: there is one PR, not
one per day. Anything **you** push to it — the empty commit above, a fixup —
stays; the refresher commits on top and never force-pushes. Each run also merges
the base branch in before capturing, so accepting this PR does not leave the
branch permanently conflicting with it — that is what a \`chore: sync …\` merge
commit in the history is. If the two genuinely diverge, the run fails with both
sides named rather than opening a conflicted PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
`;
}

/**
 * 🔴 THE ONE PREREQUISITE THIS FEATURE CANNOT SATISFY ITSELF, AND IT IS OFF
 * TODAY. `gh pr create` with GITHUB_TOKEN fails outright when the repository's
 * "Allow GitHub Actions to create and approve pull requests" setting is off —
 * measured live: `GitHub Actions is not permitted to create or approve pull
 * requests (createPullRequest)`, with the branch already pushed. That setting
 * is off on this repo (`gh api
 * repos/civitai/civitai-developer-docs/actions/permissions/workflow` ->
 * `can_approve_pull_request_reviews: false`), and NO `permissions:` block in a
 * workflow can override it — it is a repo/org-level Actions policy.
 *
 * So the failure is turned into an INSTRUCTION rather than a stack trace. The
 * branch IS pushed by this point, so the work is not lost: the message names
 * the setting to flip and hands over a one-click compare URL. The run still
 * exits non-zero, because the job genuinely did not do its job and a green run
 * would claim it had.
 *
 * Detection is on the message text, which is a SPELLED guard and is admitted as
 * one: `gh` surfaces the GraphQL error string with no distinguishable exit code
 * (2, the same as every other `gh` failure), so there is nothing structural to
 * match. If GitHub rewords it the advice is simply not printed and the raw
 * error still is — the degradation is losing a hint, never losing the failure.
 */
export function prCreationBlocked(errText) {
  return /not permitted to create or approve pull requests/i.test(String(errText));
}

const SLUG_FALLBACK = 'civitai/civitai-developer-docs';

/**
 * 🔴 "THE BRANCH IS PUSHED AND NOBODY HAS BEEN TOLD" IS THE STATE THIS WHOLE
 * WORKFLOW EXISTS TO END, AND IT IS REACHABLE FROM EVERY FAILURE AFTER THE
 * PUSH — NOT JUST THE ONE THAT HAD ADVICE.
 *
 * The first cut printed the compare URL only when `prCreationBlocked` matched.
 * Everything else after the push — a `gh pr list` failure (it sat OUTSIDE the
 * try entirely), a `gh pr edit` failure, a create failure with any other cause,
 * `gh` missing, a 502, an auth expiry, the "a pull request already exists" race
 * — exited 2 with a stack trace and no URL. Same repo state, same silence,
 * strictly less help, and the failures with no advice are the ones nobody
 * anticipated, i.e. exactly where a reader needs the state spelled out.
 *
 * So this is emitted for ANY post-push failure, and the blocked-setting text is
 * an ADDITION to it rather than an alternative. Every branch still exits
 * non-zero: the snapshot is on a branch and no PR announces it.
 */
export function branchPushedAdvice({ branch, base, repoSlug, cause }) {
  const slug = repoSlug || SLUG_FALLBACK;
  return [
    `THE BRANCH IS PUSHED BUT NO PR ANNOUNCES IT — ${cause || 'the PR step failed'}.`,
    '',
    `  The re-captured snapshot is NOT lost. It is on \`${branch}\`, complete and already validated.`,
    '  Nothing else in this run needs to be redone; only the announcement is missing.',
    '',
    '  Open the PR by hand (one click):',
    `    https://github.com/${slug}/compare/${base}...${branch}?expand=1`,
  ].join('\n');
}

/**
 * 🔴 THE BRANCH CANNOT BE RECONCILED WITH THE BASE — the one state
 * `syncWithBase` refuses to guess its way out of.
 *
 * Nothing has been pushed when this prints: the merge is attempted BEFORE the
 * capture is committed, precisely so the alternative to a clean answer is a red
 * run rather than a conflicted PR. So the advice is about the two sides, not
 * about lost work — the previous run's branch is exactly as it was.
 *
 * It names DELETING the branch as a remedy on purpose: the branch is derived
 * state, and a fresh one built from `<base>` is what the next run would produce
 * anyway. That is destructive of anything a human pushed there, which is why it
 * is offered second and qualified, never as the first suggestion.
 */
export function branchDivergedAdvice({ branch, base, repoSlug, detail }) {
  const slug = repoSlug || SLUG_FALLBACK;
  return [
    `THE BOT BRANCH HAS DIVERGED FROM \`${base}\` AND CANNOT BE MERGED AUTOMATICALLY.`,
    '',
    `  \`${branch}\` and \`${base}\` both changed ${SNAPSHOT_REL} (or another file on the branch) in ways`,
    '  git cannot reconcile, so a PR from it would be born conflicted. Nothing was pushed: the branch on',
    '  origin is untouched, and this run captured nothing anybody has to clean up.',
    '',
    '  Look at the two sides:',
    `    https://github.com/${slug}/compare/${base}...${branch}?expand=1`,
    '',
    `  Then either reconcile \`${branch}\` by hand (merge \`${base}\` into it and resolve), or — if nothing`,
    '  on it is worth keeping — delete it, and the next run will build a fresh one from',
    `  \`${base}\`. Deleting it discards any commits pushed there by a human, so read the compare first.`,
    ...(detail ? ['', `  git said: ${detail}`] : []),
  ].join('\n');
}

export function prCreationBlockedAdvice({ branch, base, repoSlug }) {
  const slug = repoSlug || SLUG_FALLBACK;
  return [
    'PR CREATION IS BLOCKED BY A REPOSITORY SETTING — the branch was pushed, the PR was not opened.',
    '',
    `  GitHub refused: "GitHub Actions is not permitted to create or approve pull requests".`,
    '  This is a repo/org Actions policy, NOT something a `permissions:` block can grant.',
    '',
    '  Fix it once, in the repository settings:',
    '    Settings -> Actions -> General -> Workflow permissions',
    '    -> tick "Allow GitHub Actions to create and approve pull requests"',
    `  (or, equivalently: gh api -X PUT repos/${slug}/actions/permissions/workflow \\`,
    '     -f default_workflow_permissions=write -F can_approve_pull_request_reviews=true)',
    '',
    '  Until then, the re-captured snapshot is NOT lost — it is on the branch. Open the PR by hand:',
    `    https://github.com/${slug}/compare/${base}...${branch}?expand=1`,
  ].join('\n');
}

// ---- I/O -------------------------------------------------------------------

function git(args, { cwd = repoRoot } = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * `gh`, with stderr CAPTURED rather than inherited — and re-emitted on failure,
 * so nothing is hidden. Inheriting it sent the text straight to the runner log
 * where `prCreationBlocked` could not read it, which is the whole reason the
 * blocked-PR case originally surfaced as a bare stack trace.
 */
function gh(args) {
  const res = spawnSync('gh', args, { cwd: repoRoot, encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const err = new Error(`gh ${args[0]} ${args[1]} failed (exit ${res.status})`);
    err.stderr = res.stderr || '';
    throw err;
  }
  return (res.stdout || '').trim();
}

/**
 * The latest published civitai/cli RELEASE tag (see the policy in the header —
 * a release, never `main`'s tip), or null on ANY failure (-> skip).
 *
 * `CLI_SNAPSHOT_REFRESH_LATEST_TAG` short-circuits the GET with an answer an
 * earlier job already obtained. It is NOT a force: the value flows into
 * `decideAction` as `latestTag` and is classified normally, so a snapshot that
 * matches it still decides up-to-date.
 */
async function fetchLatestReleaseTag() {
  const preResolved = (process.env.CLI_SNAPSHOT_REFRESH_LATEST_TAG || '').trim();
  if (preResolved) return preResolved;
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'civitai-developer-docs-snapshot-refresher',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(RELEASES_URL, { signal: AbortSignal.timeout(20000), headers });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.tag_name || null;
  } catch {
    return null;
  }
}

/**
 * Re-capture the snapshot IN PLACE by driving the real generator, then read the
 * bytes back.
 *
 * Driving `gen-appblocks-cli.mjs --write-snapshot` rather than re-implementing
 * the capture is the point: the generator's own guards
 * (assertEnumerationsAgree, assertNoUnlistedSubcommands, MIN_COMMAND_COUNT) run
 * on the live capture, so a bundle that cannot even be built never reaches the
 * floor below. The caller restores `prev` if validation then fails.
 */
function captureSnapshot(bin) {
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'gen-appblocks-cli.mjs'), '--write-snapshot'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, CIVITAI_CLI_BIN: bin, APPBLOCKS_SNAPSHOT_ONLY: '' },
  });
  return readFileSync(join(repoRoot, SNAPSHOT_REL), 'utf8');
}

/**
 * Re-run the generator on the HERMETIC codepath — the one CI and the Docker
 * build actually take. The live capture above already built an artifact, but
 * from the in-memory bundle; this re-derives it from the BYTES WE ARE ABOUT TO
 * COMMIT, as read back off disk, on a machine pretending it has no binary.
 *
 * 🔴 STATE ITS STRENGTH HONESTLY. This is a FILE ROUND-TRIP check, not an
 * independent verification. The hermetic run parses the same text the live run
 * parsed, so given a live capture that passed, the only thing that can differ
 * is the write/read of the file itself (a truncated write, a full disk, an
 * encoding that does not round-trip) — plus environmental failure of the child
 * process. It is cheap and it is the exact artifact CI will build, so it stays;
 * it is not a second opinion about the CLI tree, and an earlier comment here
 * implied otherwise.
 *
 * The observable that proves it RAN is the generator's own `from snapshot: …`
 * source line, which the live capture (`from civitai binary (…)`) cannot emit.
 * `TestTheHermeticRebuildActuallyRuns` reads exactly that, because commenting
 * this call out is otherwise invisible to the entire suite — it was the single
 * survivor of a 14-mutant semantic sweep.
 */
function verifyHermeticBuild() {
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'gen-appblocks-cli.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, APPBLOCKS_SNAPSHOT_ONLY: '1' },
  });
}

/**
 * Does `origin/<branch>` exist, and what is it? Returns the fetched sha or null.
 *
 * 🔴 A FAILED FETCH IS NOT "THE BRANCH DOES NOT EXIST". `git fetch` exits
 * non-zero for a missing ref AND for an unreachable remote, an auth failure, a
 * proxy, a partial-clone hiccup — and treating the second as the first is
 * precisely how a run would decide the branch is new and clobber it. So the
 * question is asked with `ls-remote`, whose exit codes DO separate the two: 2
 * means the ref is absent, anything else non-zero means we could not ask, and
 * we refuse rather than guess.
 */
function remoteBranchSha(branch) {
  const res = spawnSync('git', ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (res.error) throw res.error;
  if (res.status === 2) return null; // ls-remote: the ref matched nothing.
  if (res.status !== 0) {
    const err = new Error(
      `could not read origin/${branch} (git ls-remote exit ${res.status}). Refusing to touch the branch: ` +
        `an unreadable remote is NOT an absent branch, and treating it as one would delete whatever is there.`,
    );
    err.stderr = res.stderr || '';
    throw err;
  }
  return (res.stdout || '').trim().split(/\s+/)[0] || null;
}

/**
 * A private ref this script fetches the base branch into. Deliberately NOT
 * `FETCH_HEAD`: the branch fetch just above uses FETCH_HEAD too, and a name
 * that means "whatever was fetched last" is a stale-read waiting to happen the
 * next time a fetch is inserted between the two.
 */
const BASE_REF = 'refs/cli-snapshot-refresh/base';

/**
 * 🔴 RECONCILE THE STABLE BRANCH WITH THE BASE BEFORE COMMITTING ONTO IT —
 * OTHERWISE THE FIRST ACCEPTED PR BREAKS THE MECHANISM PERMANENTLY.
 *
 * The branch is a constant that is EXTENDED and never recreated (see the
 * header), and until this existed nothing ever merged, rebased or reset it
 * against `main`. Reproduced end to end: run 1 pushes the branch, the PR is
 * SQUASH-merged (which is how every PR lands in this repo), and run 2 exits 0,
 * prints `↳ continuing bot/cli-snapshot-refresh at …` and produces a branch
 * that CONFLICTS with `main` — because the squash put the branch's bytes on
 * `main` as a commit that is not in the branch's history, so both sides now
 * carry a different edit to the same header line. `delete_branch_on_merge` is
 * measured FALSE here, so the branch really does persist for run 2 to continue
 * from. After one success: conflicted PRs forever, on green runs. That is
 * detection without a usable remedy — the failure this whole workflow exists to
 * end, regenerated one level up.
 *
 * 🔴 IT ONLY REPRODUCES ON A SQUASH. A merge commit makes the branch tip an
 * ancestor of the base and everything merges clean afterwards, so a fixture (or
 * a mental model) built on one says nothing about this.
 *
 * MERGE, NOT RESET OR REBASE. In the state that matters the two sides are
 * BYTE-IDENTICAL — the squash carries exactly the bytes the branch had — so the
 * merge is trivial and clean. A reset or a rebase would be a rewrite of a
 * shared branch, i.e. the force-push whose removal is the other half of this
 * design, and it would delete whatever a human pushed there. A merge is
 * additive: it cannot lose a commit.
 *
 * WHEN IT GENUINELY CANNOT MERGE, IT FAILS RATHER THAN PUSHING. This runs
 * BEFORE the capture is written and committed, so the alternative to a clean
 * merge is a red run with the two sides named — never a conflicted PR, and
 * never a silent one.
 *
 * 🔴 IT IS UNCONDITIONAL, AND THE ANCESTRY TEST THAT USED TO GUARD IT WAS AN
 * EQUIVALENT MUTANT — measured, so it is recorded rather than left for someone
 * to "restore". `git merge` is ALREADY a no-op when the base is contained
 * (measured: `Already up to date.`, exit 0, HEAD does not move), so the guard
 * chose nothing but a log line — and swapping its operands into the exact
 * squash trap, asking whether the BRANCH is in the BASE (which a squash makes
 * permanently false), changed nothing observable and survived the whole suite.
 * The line printed now comes from whether HEAD actually MOVED, which is an
 * observation rather than a prediction. If you do reintroduce a predicate here,
 * the ancestry that matters is `base` → `HEAD`; the reverse is never true after
 * a squash and would make the branch look permanently unreconciled.
 */
function syncWithBase({ branch, base }) {
  git(['fetch', 'origin', `+refs/heads/${base}:${BASE_REF}`]);
  const before = git(['rev-parse', 'HEAD']);
  const res = spawnSync(
    'git',
    ['merge', '--no-edit', '-m', `chore: sync ${branch} with ${base}`, BASE_REF],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (res.status === 0) {
    const moved = git(['rev-parse', 'HEAD']) !== before;
    console.log(
      moved
        ? `  ↳ merged ${base} into ${branch} — the PR this opens will be mergeable`
        : `  ↳ ${branch} already contains ${base} — nothing to reconcile`,
    );
    return moved;
  }
  // Leave no half-merged state behind for a later step to reason about. The
  // abort is tolerant because git refuses one when no merge ever started (an
  // unrelated-histories refusal, for instance) — and that refusal is not the
  // failure we are reporting.
  spawnSync('git', ['merge', '--abort'], { cwd: repoRoot });
  const err = new Error(`could not merge ${base} into ${branch}`);
  err.gitOutput = `${res.stdout || ''}${res.stderr || ''}`.trim();
  err.diverged = true;
  throw err;
}

function runUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return null;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

/**
 * `--decide`: emit the verdict for a later job to gate on, and do nothing else.
 *
 * 🔴 IT MUST NOT DIFFER FROM THE REAL RUN'S VERDICT. It is the SAME
 * `decideAction` over the SAME inputs, and the `latest` it emits is handed
 * forward as CLI_SNAPSHOT_REFRESH_LATEST_TAG so the expensive job classifies
 * the identical answer instead of asking upstream a second time. Re-deriving
 * the verdict here with different code would recreate the disagreement the
 * plumbing exists to remove.
 */
function emitDecision(decision, latestTag) {
  const out = process.env.GITHUB_OUTPUT;
  const kv = { action: decision.action, tag: decision.targetTag || '', latest: latestTag || '' };
  for (const [k, v] of Object.entries(kv)) console.log(`  ${k}=${v}`);
  if (out) appendFileSync(out, Object.entries(kv).map(([k, v]) => `${k}=${v}\n`).join(''));
}

async function main() {
  const argv = process.argv.slice(2);
  const decideOnly = argv.includes('--decide');
  const dryRun = argv.includes('--dry-run');
  const noPr = argv.includes('--no-pr');
  const allowLocalPush = argv.includes('--allow-local-push');
  const branch = process.env.CLI_SNAPSHOT_REFRESH_BRANCH || DEFAULT_BRANCH;
  const base = process.env.CLI_SNAPSHOT_REFRESH_BASE || DEFAULT_BASE;
  const snapshotPath = join(repoRoot, SNAPSHOT_REL);

  console.log('cli-snapshot-refresh — re-capture appblocks-snapshots/civitai-cli-help.txt and open a PR when it is stale\n');

  // 🔴 REFUSE THE PUSHING PATH OUTSIDE CI, AND REFUSE IT *HERE* — BEFORE ANY
  // WORK. This was documented in the README's repair table as a command to run,
  // next to a dozen read-only `check:*` scripts, and it is not that shape at
  // all: it pushes a shared remote branch, moves the developer's HEAD onto
  // `bot/cli-snapshot-refresh`, and commits whatever the capture produced in
  // THEIR checkout. Run by someone reading the table as "the repair command",
  // the first they learn of it is being on a different branch.
  //
  // The check is first so the refusal costs nothing and leaves nothing behind:
  // placed after the capture it would refuse while the tree already held new
  // bytes. `--dry-run` and `--decide` are unaffected — neither writes git.
  if (!decideOnly && !dryRun && !process.env.CI && !allowLocalPush) {
    console.error(
      '  ✗ this command PUSHES. It commits the capture to the shared branch\n' +
        `    \`${branch}\` on origin and leaves your checkout on that branch — it is the CI path, not a\n` +
        '    local repair command.\n\n' +
        '    To see what it would do, with no git writes and the tree restored:\n' +
        '      npm run refresh:cli-snapshot -- --dry-run\n\n' +
        '    To run the real thing here anyway (you almost certainly do not want to):\n' +
        '      npm run refresh:cli-snapshot -- --allow-local-push',
    );
    process.exit(1);
  }

  if (!existsSync(snapshotPath)) {
    console.error(`  ✗ committed snapshot MISSING at ${SNAPSHOT_REL} — repo-local breakage, not drift.`);
    process.exit(1);
  }
  const prev = readFileSync(snapshotPath, 'utf8');
  const parsedPrev = parseSnapshotVersion(prev);
  if (!parsedPrev.ok) {
    console.error(`  ✗ committed snapshot header unreadable — ${parsedPrev.reason}`);
    process.exit(1);
  }
  console.log(`  committed snapshot: civitai ${parsedPrev.raw} (${countSnapshotBlocks(prev)} ===CMD blocks)`);

  const forcedTag = process.env.CLI_SNAPSHOT_REFRESH_TAG || null;
  const latestTag = forcedTag ? null : await fetchLatestReleaseTag();
  const decision = decideAction({ snapshotTag: parsedPrev.tag, latestTag, forcedTag });

  if (decideOnly) {
    console.log(`  ${decision.action === 'refresh' ? '⚠' : '✓'} ${decision.reason}`);
    emitDecision(decision, latestTag);
    return;
  }

  if (decision.action === 'skip') {
    // A connectivity failure or a rate limit must never look like "current",
    // and must never fail the job either — same contract as check:cli-snapshot.
    console.log(`  ⊘ ${decision.reason} — skipping (no false-fail, no false-pass)`);
    return;
  }
  if (decision.action === 'up-to-date') {
    console.log(`  ✓ ${decision.reason}`);
    console.log('\nNothing to do — no branch touched, no PR opened.');
    return;
  }

  console.log(`  ⚠ ${decision.reason}`);
  console.log(`  → re-capturing at ${decision.targetTag}\n`);

  const bin = process.env.CIVITAI_CLI_BIN;
  if (!bin) {
    console.error(
      '  ✗ CIVITAI_CLI_BIN is unset. A refresh needs a `civitai` binary built at the target tag; the runner\n' +
        '    has none, and leaving the generator to find one on PATH is exactly how a SHORT capture happens.',
    );
    process.exit(1);
  }

  // 🔴 RESTORE THE TREE ON *EVERY* FAILURE PATH, NOT JUST A FAILED FLOOR.
  // `gen-appblocks-cli.mjs --write-snapshot` WRITES THE FILE AND THEN BUILDS
  // THE ARTIFACT, so its own guards (assertEnumerationsAgree,
  // assertNoUnlistedSubcommands, MIN_COMMAND_COUNT) throw with the bad bytes
  // already on disk. Measured: a fixture that removes a command from the root
  // `__complete` block alone trips assertEnumerationsAgree, and the first cut of
  // this function left the checkout holding that capture. Nothing downstream in
  // this script would then commit it — but "the job died leaving a modified
  // snapshot in the checkout" is a state no later step should have to reason
  // about, and a `finally` costs nothing.
  let next;
  try {
    next = captureSnapshot(bin);
  } catch (err) {
    writeFileSync(snapshotPath, prev);
    console.error('\n--- CAPTURE FAILED: the generator refused the bundle; tree restored, no PR ---');
    console.error(`  ✗ ${err.message}`);
    process.exit(1);
  }
  const verdict = validateCapture({ next, prev, expectedTag: decision.targetTag });
  if (!verdict.ok) {
    writeFileSync(snapshotPath, prev);
    console.error('\n--- CAPTURE REJECTED: refusing to open a PR ---');
    for (const p of verdict.problems) console.error(`  ✗ ${p}\n`);
    process.exit(1);
  }
  console.log(
    `\n  ✓ capture accepted: ${verdict.stats.nextBlocks} ===CMD blocks (floor ${verdict.stats.prevBlocks}), ` +
      `${verdict.stats.nuls} NUL bytes, header records civitai ${verdict.stats.tag}`,
  );

  if (next === prev) {
    // Reachable: a release that changed no help text at all. Opening an empty
    // PR would be the "opens a PR when there is nothing to do" failure.
    console.log('  ✓ the capture is byte-identical to the committed snapshot — nothing to PR.');
    return;
  }

  // 🔴 THE RESTORE COVERS THIS CALL TOO. Its own comment above promised
  // "restore on EVERY failure path" while this line sat outside every `try`, so
  // a throw here left the checkout holding a captured-but-un-PRed snapshot —
  // measured. Honest scope, because it changes what this catch is worth: given
  // a live capture that already passed, the hermetic run parses the same text,
  // so what remains reachable is a file round-trip failure or an environmental
  // one (the child process being killed, a full disk). Rare, not impossible,
  // and the tree state it would leave behind is the same either way.
  try {
    verifyHermeticBuild();
  } catch (err) {
    writeFileSync(snapshotPath, prev);
    console.error('\n--- HERMETIC REBUILD FAILED: the captured bytes do not regenerate the reference ---');
    console.error(`  ✗ ${err.message}`);
    console.error('  tree restored, nothing pushed, no PR.');
    process.exit(1);
  }

  const body = prBody({
    fromVersion: parsedPrev.raw,
    targetTag: decision.targetTag,
    stats: verdict.stats,
    reason: decision.reason,
    runUrl: runUrl(),
    branch,
  });
  const title = prTitle(decision.targetTag);

  if (dryRun) {
    writeFileSync(snapshotPath, prev);
    console.log('\n--- --dry-run: tree restored, no git writes, no PR ---');
    console.log(`TITLE: ${title}\n`);
    console.log(body);
    return;
  }

  // ---- git: one stable branch, EXTENDED (never force-pushed over) ----------
  git(['config', 'user.name', process.env.GIT_AUTHOR_NAME || 'github-actions[bot]']);
  git(['config', 'user.email', process.env.GIT_AUTHOR_EMAIL || '41898282+github-actions[bot]@users.noreply.github.com']);

  // 🔴 BUILD ON WHAT IS THERE. See the header: the first cut recreated the
  // branch from `main` and force-pushed, which deleted human commits — the
  // `--allow-empty` "trigger checks" commit this tool's own PR body asks for,
  // most of all. Restoring `prev` first is not tidiness: the working tree
  // currently holds the CAPTURE, and `git checkout` refuses to move a branch
  // when that would overwrite a locally modified file. Restore -> checkout ->
  // re-write the capture.
  const remoteSha = remoteBranchSha(branch);
  writeFileSync(snapshotPath, prev);
  if (remoteSha) {
    // FETCH_HEAD rather than the ls-remote sha: if the ref moved between the
    // two calls, building on the FRESHER tip is what keeps the push a
    // fast-forward. Building on the stale one would fail the push instead —
    // safe, but a needless red.
    git(['fetch', 'origin', branch]);
    git(['checkout', '-B', branch, 'FETCH_HEAD']);
    console.log(`  ↳ continuing ${branch} at ${remoteSha.slice(0, 8)} (its existing commits are kept)`);
    // 🔴 AND RECONCILE IT WITH THE BASE, BEFORE THE CAPTURE IS WRITTEN. See
    // syncWithBase: an extended-forever branch that nothing ever merges into
    // `main` produces conflicted PRs from its own first success onwards. The
    // capture is written AFTER, for two reasons of DIFFERENT strength — say
    // which is which, or the weaker one gets counted as covered. (1) `git merge`
    // refuses to run over a locally modified file it needs to update, so the
    // reverse order can turn a merge that would have been clean into a refusal
    // reported AS divergence. Real, but no fixture here reaches it, and the
    // mutation that reverses the order SURVIVED until (2) was pinned. (2) A
    // failed merge must leave a tree nobody has to clean up — which the
    // divergence test now asserts directly, and which is what kills that mutant.
    try {
      syncWithBase({ branch, base });
    } catch (err) {
      if (!err.diverged) throw err;
      console.error(`\n--- ${branchDivergedAdvice({ branch, base, repoSlug: process.env.GITHUB_REPOSITORY, detail: err.gitOutput })}`);
      process.exit(1);
    }
  } else {
    // A branch being CREATED needs no reconciliation: it is built from this
    // run's checkout of `base`. Residual, stated rather than hidden — if `base`
    // moved after actions/checkout ran AND touched the snapshot, a first PR from
    // a fresh branch could still conflict. That is a minutes-wide window and it
    // is not the failure this fix is about, which is the permanent one the
    // EXISTING-branch path had.
    git(['checkout', '-B', branch]);
    console.log(`  ↳ creating ${branch}`);
  }
  writeFileSync(snapshotPath, next);

  // Explicit path. Never `git add -A`: this job runs in a checkout where the
  // generator has also written gitignored artifacts, and a blind stage is how
  // an unrelated file rides along in a PR nobody is reading closely.
  git(['add', '--', SNAPSHOT_REL]);
  // Nothing staged is REACHABLE now that the branch is extended rather than
  // recreated: a second run finding the same drift re-captures byte-identical
  // bytes that are already on the branch. `git commit` would exit 1 on that,
  // failing a run whose actual state is "already done". Skip the commit, keep
  // going — the PR still needs its body refreshed.
  const staged = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: repoRoot });
  if (staged.status === 0) {
    console.log(`  ↳ ${branch} already carries these bytes — no new commit`);
  } else {
    git([
      'commit',
      '-m',
      title,
      '-m',
      `${decision.reason}.\n\nCaptured from a civitai binary built at ${decision.targetTag}. ` +
        `${verdict.stats.nextBlocks} ===CMD blocks (floor ${verdict.stats.prevBlocks}), ${verdict.stats.nuls} NUL bytes.\n\n` +
        `Opened automatically by .github/workflows/cli-snapshot-refresh.yml.`,
    ]);
  }
  // 🔴 NO `--force`. The push is a fast-forward of a branch we just built on
  // top of. If it is rejected, another writer moved the ref between the
  // ls-remote and here — the correct answer is to fail loudly (the workflow's
  // `concurrency:` group is what makes that rare), never to overwrite them.
  git(['push', 'origin', `${branch}:${branch}`]);
  console.log(`\n  ✓ pushed ${branch}`);

  if (noPr) {
    console.log('\n--- --no-pr: branch pushed, PR not opened ---');
    console.log(`TITLE: ${title}\n`);
    console.log(body);
    return;
  }

  // Written OUTSIDE the repo: an untracked file in the checkout is one blind
  // `git add` away from riding along in the PR it describes.
  const bodyDir = mkdtempSync(join(tmpdir(), 'cli-snapshot-pr-'));
  const bodyFile = join(bodyDir, 'body.md');
  writeFileSync(bodyFile, body);
  // 🔴 EVERYTHING AFTER THE PUSH IS INSIDE THIS TRY, `gh pr list` INCLUDED. It
  // used to sit outside, so a list failure — an outage, an expired token, `gh`
  // itself missing — exited 2 with a stack trace from a repo whose branch was
  // already pushed: the "nobody has been told" state, reached by the one path
  // with no advice attached to it.
  try {
    const existing = gh(['pr', 'list', '--head', branch, '--base', base, '--state', 'open', '--json', 'number']);
    const open = JSON.parse(existing || '[]');
    if (open.length) {
      gh(['pr', 'edit', String(open[0].number), '--title', title, '--body-file', bodyFile]);
      console.log(`  ✓ updated PR #${open[0].number}`);
    } else {
      const url = gh(['pr', 'create', '--base', base, '--head', branch, '--title', title, '--body-file', bodyFile]);
      console.log(`  ✓ opened ${url}`);
    }
    rmSync(bodyDir, { recursive: true, force: true });
  } catch (err) {
    // Cleaned up HERE rather than in a `finally`: `process.exit` below
    // terminates the process without unwinding, so a `finally` would silently
    // never run — the tidy-looking spelling is the one that leaks.
    rmSync(bodyDir, { recursive: true, force: true });
    const stderr = err.stderr || '';
    if (stderr) console.error(stderr.trimEnd());
    const repoSlug = process.env.GITHUB_REPOSITORY;
    // The compare URL is printed for EVERY post-push failure. The blocked-repo-
    // setting text is an addition when it applies, not an alternative — losing
    // the URL is what made the unanticipated failures the least helpful ones.
    console.error(`\n--- ${branchPushedAdvice({ branch, base, repoSlug, cause: err.message })}`);
    if (prCreationBlocked(stderr)) {
      console.error(`\n--- ${prCreationBlockedAdvice({ branch, base, repoSlug })}`);
    }
    // Non-zero in every branch: the branch is pushed but nobody has been told,
    // which is the very state this whole workflow exists to end. A green run
    // would claim the PR was opened.
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`refresh-cli-snapshot: ${err.stack || err.message}`);
    process.exit(2);
  });
}
