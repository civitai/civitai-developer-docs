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
 * check:cli-snapshot already DETECTS this. It has gone stale twice in this
 * workstream and both times a human noticed, not the check — because its only
 * output is a red run on a SCHEDULED workflow, and a red on an unwatched
 * schedule is indistinguishable from nobody looking. Detection without a
 * remedy is the failure mode; this script is the remedy.
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
 * ONE STABLE BRANCH, FORCE-UPDATED
 * --------------------------------
 * The branch name is a CONSTANT (`bot/cli-snapshot-refresh`) and the push is a
 * force-update. A fresh branch per run would open a PR per day for the same
 * fact and get muted inside a week — strictly worse than the red it replaces,
 * because a muted PR stream also buries the ONE PR that matters. One PR,
 * updated in place, always describing the current gap.
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
 *   node scripts/refresh-cli-snapshot.mjs --dry-run      # capture + validate + print; no git, no gh
 *   node scripts/refresh-cli-snapshot.mjs --no-pr        # branch/commit/push; print the PR instead of opening it
 *
 * ENV
 *   CIVITAI_CLI_BIN                   the binary to capture from (required unless up to date)
 *   CLI_SNAPSHOT_REFRESH_TAG          FORCE a refresh at this tag, bypassing the freshness verdict.
 *                                     The documented test override — it is what lets the drift path be
 *                                     exercised on demand while the committed snapshot is current.
 *   CLI_SNAPSHOT_REFRESH_BRANCH       override the stable branch name (default bot/cli-snapshot-refresh)
 *   CLI_SNAPSHOT_REFRESH_BASE         override the PR base branch (default main)
 *   APPBLOCKS_CLI_RELEASES_URL        release-endpoint override (shared with check-appblocks-cli-snapshot)
 *   GITHUB_SERVER_URL / GITHUB_REPOSITORY / GITHUB_RUN_ID   used to link the run from the PR body
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifySnapshot, parseSnapshotVersion } from './check-appblocks-cli-snapshot.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** Path of the snapshot RELATIVE to the repo root — the only file this ever commits. */
export const SNAPSHOT_REL = 'appblocks-snapshots/civitai-cli-help.txt';

/**
 * 🔴 A CONSTANT, force-updated. See the header: a per-run branch opens a PR per
 * day for one fact and gets muted, which buries the run that matters.
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

This branch is \`${branch}\`, force-updated on every run: there is one PR, not
one per day.

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

export function prCreationBlockedAdvice({ branch, base, repoSlug }) {
  const slug = repoSlug || 'civitai/civitai-developer-docs';
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

/** The latest published civitai/cli release tag, or null on ANY failure (-> skip). */
async function fetchLatestReleaseTag() {
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
 * from the in-memory bundle; this proves the BYTES WE ARE ABOUT TO COMMIT
 * regenerate the reference on a machine with no binary. Cheap, and it is the
 * exact failure a PR must not carry.
 */
function verifyHermeticBuild() {
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'gen-appblocks-cli.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, APPBLOCKS_SNAPSHOT_ONLY: '1' },
  });
}

function runUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return null;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const noPr = argv.includes('--no-pr');
  const branch = process.env.CLI_SNAPSHOT_REFRESH_BRANCH || DEFAULT_BRANCH;
  const base = process.env.CLI_SNAPSHOT_REFRESH_BASE || DEFAULT_BASE;
  const snapshotPath = join(repoRoot, SNAPSHOT_REL);

  console.log('cli-snapshot-refresh — re-capture appblocks-snapshots/civitai-cli-help.txt and open a PR when it is stale\n');

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

  verifyHermeticBuild();

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

  // ---- git: one stable branch, force-updated, ONE explicit path staged -----
  git(['config', 'user.name', process.env.GIT_AUTHOR_NAME || 'github-actions[bot]']);
  git(['config', 'user.email', process.env.GIT_AUTHOR_EMAIL || '41898282+github-actions[bot]@users.noreply.github.com']);
  git(['checkout', '-B', branch]);
  // Explicit path. Never `git add -A`: this job runs in a checkout where the
  // generator has also written gitignored artifacts, and a blind stage is how
  // an unrelated file rides along in a PR nobody is reading closely.
  git(['add', '--', SNAPSHOT_REL]);
  git([
    'commit',
    '-m',
    title,
    '-m',
    `${decision.reason}.\n\nCaptured from a civitai binary built at ${decision.targetTag}. ` +
      `${verdict.stats.nextBlocks} ===CMD blocks (floor ${verdict.stats.prevBlocks}), ${verdict.stats.nuls} NUL bytes.\n\n` +
      `Opened automatically by .github/workflows/cli-snapshot-refresh.yml.`,
  ]);
  git(['push', '--force', 'origin', `${branch}:${branch}`]);
  console.log(`\n  ✓ pushed ${branch}`);

  if (noPr) {
    console.log('\n--- --no-pr: branch pushed, PR not opened ---');
    console.log(`TITLE: ${title}\n`);
    console.log(body);
    return;
  }

  // Written OUTSIDE the repo: an untracked file in the checkout is one blind
  // `git add` away from riding along in the PR it describes.
  const bodyFile = join(mkdtempSync(join(tmpdir(), 'cli-snapshot-pr-')), 'body.md');
  writeFileSync(bodyFile, body);
  const existing = gh(['pr', 'list', '--head', branch, '--base', base, '--state', 'open', '--json', 'number']);
  const open = JSON.parse(existing || '[]');
  try {
    if (open.length) {
      gh(['pr', 'edit', String(open[0].number), '--title', title, '--body-file', bodyFile]);
      console.log(`  ✓ updated PR #${open[0].number}`);
    } else {
      const url = gh(['pr', 'create', '--base', base, '--head', branch, '--title', title, '--body-file', bodyFile]);
      console.log(`  ✓ opened ${url}`);
    }
  } catch (err) {
    const stderr = err.stderr || '';
    if (stderr) console.error(stderr.trimEnd());
    if (prCreationBlocked(stderr)) {
      console.error(`\n--- ${prCreationBlockedAdvice({ branch, base, repoSlug: process.env.GITHUB_REPOSITORY })}`);
      // Non-zero: the branch is pushed but nobody has been told, which is the
      // very state this whole workflow exists to end. A green run would claim
      // the PR was opened.
      process.exit(1);
    }
    throw err;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`refresh-cli-snapshot: ${err.stack || err.message}`);
    process.exit(2);
  });
}
