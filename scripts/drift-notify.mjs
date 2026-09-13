#!/usr/bin/env node
/**
 * drift-notify.mjs
 * ----------------
 * DELIVERY for the scheduled `appblocks-drift` sweep.
 *
 * 🔴 THE GAP THIS CLOSES. `scripts/check-example-apps.mjs` DETECTS external rot
 * — a repository `apps/examples.md` names being renamed, deleted, archived, or
 * quietly growing a scope the page does not list — and it detects it on a
 * SCHEDULED workflow, where a red run surfaces to nobody. Until this existed,
 * `appblocks-drift.yml` had no notify step and no issue step at all: a genuine
 * rot failure and a fully-skipped run were equally invisible unless a human
 * happened to open the Actions tab. `cli-snapshot-refresh.yml`'s own header
 * states the principle in as many words — "detection without a remedy is the
 * failure mode: a red run on an unwatched SCHEDULED workflow is
 * indistinguishable from nobody looking" — and then that reasoning was applied
 * to exactly one of the sweep's checks. This is it applied to the rest.
 *
 * WHAT IT DOES. One GitHub issue, found by the HTML marker in its body, opened
 * when a scheduled run is not clean and closed when a later one is:
 *   - not clean  -> create it, or UPDATE the existing one in place (never a
 *                   second issue, never a comment per run — an alert that spams
 *                   is an alert people mute). A comment is added only when the
 *                   FINGERPRINT changes, i.e. when what is wrong is not what was
 *                   wrong yesterday.
 *   - clean      -> comment saying which run cleared it, then close it. A fixed
 *                   rot must not leave a stale open issue implying live rot.
 *
 * 🔴 "NOT CLEAN" INCLUDES "NOTHING WAS VERIFIED", AND THAT IS THE LOAD-BEARING
 * LINE IN THIS FILE. A run where every repository was unreachable exits 0, by
 * design — a connectivity failure is not drift, and check-example-apps refuses
 * to false-fail on somebody else's outage. But `0 verified` and `8 verified`
 * are not the same claim, and a notifier that only reacts to a non-zero exit
 * code cannot tell them apart: it would report "all clear" about a run that
 * checked nothing, forever, the day GitHub started rate-limiting the runner.
 * The same goes for a job that was SKIPPED or CANCELLED outright, and for a run
 * that produced no report at all. Each of those is an ALERT here, phrased as
 * what it is: nothing was verified, so nothing is known.
 *
 * That asymmetry is deliberate and is the opposite call from the guard's:
 *   - the GUARD skips loudly and exits 0 when it cannot reach the network,
 *     because a false-fail would make a gate everyone clicks through;
 *   - the NOTIFIER exits 1 when it cannot reach the API, because a notifier
 *     that cannot notify IS the failure it exists to prevent. A red notify job
 *     is at least as visible as the red it was trying to deliver.
 *
 * NO node_modules IMPORTS. Same constraint as check-example-apps.mjs and
 * check-agent-setup.mjs: the job that runs `--self-test` on every PR does so
 * with no `npm ci`, and the notify job itself skips the install so a registry
 * outage cannot be what stops an alert going out. Node builtins only.
 *
 * THE LOGIC LIVES HERE, NOT IN THE WORKFLOW. A workflow body is untestable by
 * construction; the decision table below runs its fixtures on EVERY invocation
 * and is additionally run as its own PR-gating step from example-apps.yml.
 *
 * USAGE
 *   node scripts/drift-notify.mjs --self-test   # fixtures only, no env, no network
 *   node scripts/drift-notify.mjs               # decide + deliver
 *
 *   DRIFT_NOTIFY_JOB_RESULT=<success|failure|cancelled|skipped>
 *   DRIFT_NOTIFY_JOB_NAME=<the drift job's NAME as the API reports it — equal to the
 *                          workflow job id only while that job declares no `name:`.
 *                          Unset disables the enrichment>
 *                               the drift job's own result, from `needs.*.result`
 *   DRIFT_NOTIFY_REPORT=<path>  the JSON check-example-apps wrote with --report.
 *                               ABSENT OR UNREADABLE IS A SIGNAL, NOT AN ERROR.
 *   DRIFT_NOTIFY_DRY_RUN=1      print the decision and the issue body; make no
 *                               API call. How this file's red/green matrix was
 *                               driven.
 *   GITHUB_TOKEN                needs `issues: write` on this repository
 *   GITHUB_REPOSITORY / GITHUB_API_URL / GITHUB_SERVER_URL / GITHUB_RUN_ID
 *                               the standard Actions context
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * How the one issue is found again next run.
 *
 * A MARKER IN THE BODY, NOT A TITLE MATCH AND NOT A LABEL. The title carries the
 * current failure count so it is readable in a notification list, which means it
 * CHANGES between runs — matching on it would open a second issue the first time
 * a different repository rotted. A label can be removed by anyone triaging. The
 * marker is invisible in the rendered issue and nobody edits it by hand.
 */
export const MARKER = '<!-- appblocks-drift-notify:v1 -->';
const FINGERPRINT_PREFIX = '<!-- appblocks-drift-notify:fingerprint:';
const LABEL = 'appblocks-drift';

/**
 * Read the report check-example-apps wrote. NEVER THROWS: a missing or corrupt
 * report is the "nothing was verified" signal, and turning it into a crash would
 * lose exactly the case this file exists for.
 *
 * @returns {{ report: object|null, problem: string|null }}
 */
export function readReport(path, read = readFileSync) {
  if (!path) return { report: null, problem: 'no report path was given to the notifier' };
  let raw;
  try {
    raw = read(path, 'utf8');
  } catch (err) {
    return { report: null, problem: `the drift run produced no report at ${path} (${err.code || err.message})` };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { report: null, problem: `the report at ${path} is not an object` };
    return { report: parsed, problem: null };
  } catch (err) {
    return { report: null, problem: `the report at ${path} is not valid JSON (${err.message})` };
  }
}

/**
 * The decision table. Pure + exported: DECIDE_FIXTURES below is its mutation
 * test, and it runs with no environment, no filesystem and no network.
 *
 * @returns {{ action: 'alert'|'resolve', reasons: string[], findings: object[] }}
 */
export function decideNotification({ jobResult, report, problem, failedSteps = null, stepsProblem = null }) {
  const reasons = [];
  const findings = Array.isArray(report?.findings) ? report.findings : [];

  // 1. The job itself. `skipped` and `cancelled` are the shapes that read as
  //    green everywhere else: GitHub shows no red X for them, and the sweep's
  //    conclusion rolls up as neutral.
  if (jobResult !== 'success') {
    if (jobResult === 'skipped' || jobResult === 'cancelled') {
      reasons.push(`the scheduled drift job was ${jobResult} — none of its checks ran, so NOTHING was verified`);
    } else if (Array.isArray(failedSteps) && failedSteps.length) {
      // 🔴 NAME THE STEPS. THE REPORTING DEFECT #76 IS ABOUT IS THAT THIS DID
      // NOT. `jobResult` is one scalar for a job of ~10 checks, so the body said
      // "at least one drift check is red" and then rendered the example-apps
      // counters — which are about a DIFFERENT check and were reading 8 verified,
      // 0 rotted, 0 drifted while SIX other steps were failing. A reader saw a
      // table of green numbers under a red banner and learned to dismiss it.
      reasons.push(
        `the scheduled drift job ended "${jobResult}" — ${failedSteps.length} check(s) are red:\n` +
          failedSteps.map((s) => `  - ${s}`).join('\n'),
      );
    } else {
      // The degraded path: the API was unreachable, the token lacked
      // `actions: read`, or the run had no matching job. Say which, rather than
      // silently falling back to a sentence that reads as if one check failed.
      reasons.push(
        `the scheduled drift job ended "${jobResult}" — at least one drift check is red` +
          (stepsProblem ? ` (the failing steps could not be named: ${stepsProblem})` : ''),
      );
    }
  }

  // 2. No report at all. Covers a job that died before the guard ran, an
  //    artifact that never uploaded, and a guard that crashed. All of them mean
  //    the same thing downstream and none of them mean "clean".
  if (!report) {
    reasons.push(`${problem || 'the notifier received no report'} — so this run made no claim about apps/examples.md`);
    return { action: 'alert', reasons, findings };
  }

  // 3. The guard's own verdict.
  if (report.verdict === 'broken') {
    reasons.push('the guard FAILED ITS OWN SELF-TEST, so it made no claim about the page this run');
  } else if (report.verdict === 'rot') {
    reasons.push(
      `apps/examples.md is wrong about ${report.findings?.length ?? 0} thing(s) — a repository it names is ` +
        'gone, renamed, frozen, or declares scopes the page does not list',
    );
  } else if (report.verdict === 'offline-ok') {
    reasons.push(
      'the scheduled sweep ran the guard with --offline, so no repository and no manifest was ' +
        'reached — the upstream half did not happen',
    );
  }

  // 4. 🔴 THE SILENT ZERO. A run that verified zero repositories exits 0 and
  //    prints a banner nobody reads. `verdict === 'nothing-verified'` is the
  //    guard saying so itself; the `verified === 0` clause is the belt to that
  //    braces, because a future verdict value that forgets to set it would
  //    otherwise sail through here as clean.
  const verified = Number.isFinite(report.verified) ? report.verified : 0;
  if (report.verdict === 'nothing-verified' || (report.offline !== true && verified === 0)) {
    reasons.push(
      `0 of ${report.listed ?? '?'} repositories were verified — the API was unreachable for all of them, so ` +
        'this run is not a clean bill of health, it is an absence of information',
    );
  }

  // 🔴 THE SAME RULE, APPLIED TO CHECK 5 — and it was missing from the first
  // version of this file, which is the "guard narrower than its own description"
  // failure: the banner at the top claims to catch "nothing was verified", and
  // it caught exactly half of that. The manifests are fetched from a DIFFERENT
  // HOST, so every one of them can fail while every repository resolves live:
  // `verdict` stays `ok`, the exit code stays 0, and not one of the page's scope
  // claims was graded. That is the identical silent zero, one check to the left.
  const scopesClaimed = Number.isFinite(report.scopesClaimed) ? report.scopesClaimed : 0;
  const scopesVerified = Number.isFinite(report.scopesVerified) ? report.scopesVerified : 0;
  if (report.offline !== true && scopesClaimed > 0 && scopesVerified === 0) {
    reasons.push(
      `0 of ${scopesClaimed} scope list(s) were verified against block.manifest.json — the raw host was ` +
        "unreachable for all of them, so the page's scope claims were not graded this run",
    );
  }

  return { action: reasons.length ? 'alert' : 'resolve', reasons, findings };
}

/** A stable id for WHAT is wrong, so an unchanged problem does not re-comment. */
export function fingerprint(decision) {
  const material = [
    ...decision.reasons,
    ...decision.findings.map((f) => `${f.repo ?? '-'}::${f.reason ?? ''}`),
  ]
    .map((s) => s.trim())
    .sort()
    .join('\n');
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

/** The issue title. Short, and it names the count so a notification list is readable. */
export function issueTitle(decision, report) {
  if (decision.findings.length) {
    const names = [...new Set(decision.findings.map((f) => f.repo).filter(Boolean))];
    const who = names.length === 1 ? names[0] : `${names.length} repositories`;
    return `Example app rot: apps/examples.md is wrong about ${names.length ? who : 'its own contents'}`;
  }
  if (report && (report.verdict === 'nothing-verified' || report.verified === 0)) {
    return 'Example app guard verified NOTHING on the scheduled run';
  }
  return 'Scheduled appblocks-drift sweep is red';
}

export function issueBody(decision, report, ctx) {
  const runUrl = ctx.runId ? `${ctx.serverUrl}/${ctx.repo}/actions/runs/${ctx.runId}` : `${ctx.serverUrl}/${ctx.repo}/actions`;
  const lines = [
    MARKER,
    `${FINGERPRINT_PREFIX}${fingerprint(decision)} -->`,
    '',
    '## Why this is open',
    '',
    ...decision.reasons.map((r) => `- ${r}`),
    '',
  ];

  if (decision.findings.length) {
    lines.push('## What rotted', '');
    for (const f of decision.findings) {
      lines.push(`- **${f.repo ?? 'the page'}** — \`${f.kind ?? 'ROT'}\` — ${f.reason}`);
      if (f.hint) lines.push(`  - ${f.hint}`);
    }
    lines.push('');
  }

  if (report) {
    lines.push(
      '## What the run measured',
      '',
      '| | |',
      '|---|---|',
      `| repositories listed on the page | ${report.listed ?? '?'} |`,
      `| verified live | ${report.verified ?? 0} |`,
      `| rotted | ${report.rotted ?? 0} |`,
      `| unverified (API unreachable) | ${report.unverified ?? 0} |`,
      `| scope lists verified against \`block.manifest.json\` | ${report.scopesVerified ?? 0} |`,
      `| scope lists drifted | ${report.scopesRotted ?? 0} |`,
      `| scope lists unverified | ${report.scopesUnverified ?? 0} |`,
      `| hook lists stamped | ${report.hooksStamp ?? 'NOWHERE'}${report.hooksAgeDays === null || report.hooksAgeDays === undefined ? '' : ` (${report.hooksAgeDays} day(s) old)`} |`,
      '',
    );
    if (Array.isArray(report.notes) && report.notes.length) {
      lines.push('Non-fatal notes from the same run:', '', ...report.notes.map((n) => `- ${n}`), '');
    }
  }

  lines.push(
    '## How this issue behaves',
    '',
    `- It is **updated in place** by every later scheduled run that is still red — one issue, refreshed, never a second one. A comment is added only when *what* is wrong changes.`,
    `- It is **closed automatically** by the first run that comes back clean.`,
    `- Reproduce locally with \`npm run check:example-apps\`; the offline half is \`npm run check:example-apps -- --offline\`.`,
    '',
    `Run: ${runUrl}`,
    '',
    `<sub>Opened by \`scripts/drift-notify.mjs\` from \`.github/workflows/appblocks-drift.yml\`. Editing the body by hand is fine — the next red run overwrites it.</sub>`,
  );
  return lines.join('\n');
}

/** The fingerprint carried by an existing issue body, or null. */
export function fingerprintOf(body) {
  const m = String(body ?? '').match(/<!-- appblocks-drift-notify:fingerprint:([0-9a-f]+) -->/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// THE SELF-TEST. Runs on EVERY invocation, before any decision is acted on, and
// is additionally its own PR-gating step. Same doctrine as
// check-example-apps.mjs: the tables are in this file because the job that runs
// them does not `npm ci`.
// ---------------------------------------------------------------------------

const REPORT_OK = { verdict: 'ok', listed: 8, verified: 8, rotted: 0, unverified: 0, scopesClaimed: 8, scopesVerified: 8, offline: false, findings: [] };

export const DECIDE_FIXTURES = [
  {
    name: 'a clean scheduled run -> resolve',
    input: { jobResult: 'success', report: REPORT_OK, problem: null },
    expect: 'resolve',
  },
  {
    name: 'a clean run with SOME repos unreachable is still a resolve (it verified something)',
    input: { jobResult: 'success', report: { ...REPORT_OK, verified: 6, unverified: 2 }, problem: null },
    expect: 'resolve',
  },
  {
    // 🔴 THE #76 ROW. Before this, a failed job produced "at least one drift
    // check is red" and then a table of example-apps counters reading 8
    // verified / 0 rotted — about a DIFFERENT check — while six others were
    // failing. The reason must NAME them, or the body is green prose under a
    // red banner and readers learn to dismiss it.
    name: 'a failed job with named steps -> alert, and the reason NAMES each failing step',
    input: {
      jobResult: 'failure',
      report: REPORT_OK,
      problem: null,
      failedSteps: ['Snapshot drift — appblocks-snapshots/ vs civitai@origin/main', 'OpenAPI spec drift — openapi-snapshots/ vs the published spec'],
    },
    expect: 'alert',
    reasonIncludes: 'OpenAPI spec drift',
  },
  {
    // The count must move with the list. A reason naming two steps while saying
    // "1 check(s) are red" is the kind of mismatch a reader trusts and acts on.
    name: 'the named-steps reason states the COUNT it actually lists',
    input: {
      jobResult: 'failure',
      report: REPORT_OK,
      problem: null,
      failedSteps: ['a', 'b', 'c'],
    },
    expect: 'alert',
    reasonIncludes: '3 check(s) are red',
  },
  {
    // 🔴 THE DEGRADED PATH IS A FINDING, NOT A FALLBACK. If the steps cannot be
    // listed the alert still goes out — but it must say WHY they are unnamed,
    // otherwise it is indistinguishable from the pre-#76 sentence and a reader
    // cannot tell "one check failed" from "we could not look".
    name: 'a failed job whose steps could NOT be listed says so in the reason',
    input: {
      jobResult: 'failure',
      report: REPORT_OK,
      problem: null,
      failedSteps: null,
      stepsProblem: 'the token lacks `actions: read`, so the run\'s steps could not be listed',
    },
    expect: 'alert',
    reasonIncludes: 'could not be named',
  },
  {
    // A skipped job has no steps to name, and must NOT acquire the enriched
    // sentence — "none of its checks ran" is the stronger statement and the one
    // that survives here.
    // ⚠ INVARIANT GUARD, LABELLED AS ONE. main() forces failedSteps to null
    // whenever jobResult is skipped/cancelled, so this combination is
    // UNREACHABLE in production and no mutant kills it alone. It pins branch
    // ORDER inside an exported function, which is worth a row — it is not
    // regression coverage and must not be counted as such.
    name: 'INVARIANT: a skipped job keeps its own reason and never claims named steps',
    input: { jobResult: 'skipped', report: REPORT_OK, problem: null, failedSteps: ['x'] },
    expect: 'alert',
    reasonIncludes: 'NOTHING was verified',
  },
  {
    name: 'the job failed -> alert',
    input: { jobResult: 'failure', report: { ...REPORT_OK, verdict: 'rot', rotted: 1, findings: [{ repo: 'x/y', reason: 'RENAMED — …' }] }, problem: null },
    expect: 'alert',
    reasonIncludes: 'at least one drift check is red',
  },
  {
    // 🔴 THE FULLY-SKIPPED RUN. GitHub renders it as neither red nor green, and
    // nothing downstream distinguishes it from success.
    name: 'the job was SKIPPED -> alert, saying nothing was verified',
    input: { jobResult: 'skipped', report: null, problem: 'the drift run produced no report' },
    expect: 'alert',
    reasonIncludes: 'NOTHING was verified',
  },
  {
    name: 'the job was CANCELLED -> alert',
    input: { jobResult: 'cancelled', report: null, problem: 'the drift run produced no report' },
    expect: 'alert',
    reasonIncludes: 'NOTHING was verified',
  },
  {
    name: 'the job succeeded but produced no report -> alert',
    input: { jobResult: 'success', report: null, problem: 'the drift run produced no report at /tmp/r.json (ENOENT)' },
    expect: 'alert',
    reasonIncludes: 'made no claim',
  },
  {
    // 🔴 THE MUTATION TEST. This is the row that dies when the `verified === 0`
    // clause is removed or short-circuited: the guard exited 0, the job
    // succeeded, and the run verified nothing at all.
    name: 'SUCCESS, exit 0, and ZERO repositories verified -> alert, never resolve',
    input: { jobResult: 'success', report: { verdict: 'nothing-verified', listed: 8, verified: 0, rotted: 0, unverified: 8, offline: false, findings: [] }, problem: null },
    expect: 'alert',
    reasonIncludes: '0 of 8 repositories were verified',
  },
  {
    // The belt to that braces: a report whose verdict forgot to say so.
    name: 'a report claiming "ok" while having verified zero -> alert anyway',
    input: { jobResult: 'success', report: { verdict: 'ok', listed: 8, verified: 0, rotted: 0, unverified: 8, scopesClaimed: 8, scopesVerified: 8, offline: false, findings: [] }, problem: null },
    expect: 'alert',
    reasonIncludes: '0 of 8 repositories were verified',
  },
  {
    // 🔴 THE SAME SILENT ZERO, ONE CHECK TO THE LEFT. Every repository resolved
    // live, the exit code was 0, the verdict was `ok` — and not one scope claim
    // on the page was graded, because the manifests live on a different host
    // which was the one that was down.
    name: 'every repository live but ZERO scope lists verified -> alert',
    input: { jobResult: 'success', report: { verdict: 'ok', listed: 8, verified: 8, rotted: 0, unverified: 0, scopesClaimed: 8, scopesVerified: 0, scopesUnverified: 8, offline: false, findings: [] }, problem: null },
    expect: 'alert',
    reasonIncludes: '0 of 8 scope list(s) were verified',
  },
  {
    // …and the control that keeps the clause from being an unconditional alert:
    // a page stating no scope claims at all must not trip it.
    name: 'a page claiming no scopes at all does not trip the scope-zero clause',
    input: { jobResult: 'success', report: { ...REPORT_OK, scopesClaimed: 0, scopesVerified: 0 }, problem: null },
    expect: 'resolve',
  },
  {
    name: 'the guard failed its own self-test -> alert',
    input: { jobResult: 'failure', report: { verdict: 'broken', listed: 0, verified: 0, offline: false, findings: [{ kind: 'SELF-TEST', repo: null, reason: 'CLASSIFY — RENAMED …' }] }, problem: null },
    expect: 'alert',
    reasonIncludes: 'FAILED ITS OWN SELF-TEST',
  },
  {
    name: 'the sweep ran the guard --offline -> alert, because the upstream half did not happen',
    input: { jobResult: 'success', report: { verdict: 'offline-ok', listed: 8, verified: 0, offline: true, findings: [] }, problem: null },
    expect: 'alert',
    reasonIncludes: 'the upstream half did not happen',
  },
  {
    name: 'real rot -> alert naming the count',
    input: { jobResult: 'failure', report: { verdict: 'rot', listed: 8, verified: 7, rotted: 1, unverified: 0, offline: false, findings: [{ repo: 'a/b', reason: 'RENAMED — the API redirected github.com/a/b to c/d' }] }, problem: null },
    expect: 'alert',
    reasonIncludes: 'wrong about 1 thing(s)',
  },
];

/**
 * The fetcher's own table. It exists because fetchFailedSteps NEVER THROWS, and
 * an un-tested never-throws function is where a silent failure lives: every
 * degraded path returns the same SHAPE as a success, so a broken one reports
 * "could not name the steps" forever and reads exactly like a 403.
 *
 * Rows carrying `wantSteps` are the POSITIVE CONTROLS — without one, a fetcher
 * hard-wired to return a problem passes every other row here. There are TWO now
 * (this one and the 403-retry row); the count printed at the end is DERIVED from
 * `wantSteps` rather than written down, because an earlier literal said "1" and
 * kept saying it after rows changed.
 */
const STEPS_FIXTURES = [
  {
    name: 'POSITIVE CONTROL: a real run names its failed steps, and only those',
    wantAuth: [true], // token only: a 200 must never trigger the anonymous retry
    reply: { ok: true, json: { jobs: [{ name: 'drift', steps: [
      { name: 'Snapshot drift', conclusion: 'failure' },
      { name: 'A green one', conclusion: 'success' },
      { name: 'OpenAPI spec drift', conclusion: 'failure' },
      { name: 'A skipped one', conclusion: 'skipped' },
    ] }, { name: 'notify', steps: [] }] } },
    wantSteps: ['Snapshot drift', 'OpenAPI spec drift'],
  },
  {
    // 🔴 THE ROW THAT REMOVES A PERMISSION SCOPE. This repo is PUBLIC, so the
    // jobs endpoint answers 200 anonymously — measured, with a bogus run id
    // returning 404 as the control. An earlier draft sent the token
    // unconditionally, so a GITHUB_TOKEN without `actions: read` got a 403 where
    // NO token gets a 200, and the workflow grew a scope to paper over it. This
    // row pins the retry that made the scope unnecessary; delete it and the
    // grant comes back.
    name: 'a 403 WITH the token retries WITHOUT it and names the steps',
    wantAuth: [true, false], // the ORDER is the claim, not the count
    replies: [
      { ok: false, status: 403 },
      { ok: true, json: { jobs: [{ name: 'drift', steps: [{ name: 'Snapshot drift', conclusion: 'failure' }] }] } },
    ],
    wantSteps: ['Snapshot drift'],
  },
  {
    // 🔴 THE ROW THE PREVIOUS ROUND SHIPPED WITHOUT. Widening the retry to 404 was
    // a behaviour change that nothing pinned: reverting it to 403-only survived
    // the entire suite. That is the same defect this table was convened to kill,
    // one level along — a claim with no fixture. 404 matters because whether a
    // scope-less GITHUB_TOKEN gets 403 or 404 here cannot be measured without a
    // real privileged run, which is exactly why the retry covers both.
    name: 'a 404 WITH the token also retries anonymously — the status a scope-less token may get',
    replies: [
      { ok: false, status: 404 },
      { ok: true, json: { jobs: [{ name: 'drift', steps: [{ name: 'OpenAPI spec drift', conclusion: 'failure' }] }] } },
    ],
    wantAuth: [true, false],
    wantSteps: ['OpenAPI spec drift'],
  },
  {
    name: 'a 403 BOTH ways is a rate limit, and says so rather than blaming a scope',
    wantAuth: [true, false],
    replies: [
      { ok: false, status: 403 },
      { ok: false, status: 403 },
    ],
    wantProblem: 'rate limit, not a missing scope',
  },
  {
    // The no-token path had ZERO coverage, which is why the "both with and
    // without the token" message was able to print after a single call.
    name: 'with NO token there is nothing to retry, and the message does not claim two calls',
    ctx: { api: 'https://api.example', repo: 'o/r', runId: '1', token: '' },
    reply: { ok: false, status: 403 },
    wantAuth: [false],
    wantProblem: 'anonymous request',
  },
  {
    // A 500 is not an auth problem, so retrying anonymously buys nothing and
    // spends the anonymous budget. Pins that the retry is NOT "on any failure".
    name: 'a 500 is reported as-is and never retried',
    reply: { ok: false, status: 500 },
    wantAuth: [true],
    wantProblem: 'answered 500',
  },
  {
    name: 'a missing job name is reported, not guessed',
    jobName: '',
    reply: { ok: true, json: { jobs: [{ name: 'drift', steps: [] }] } },
    wantProblem: 'DRIFT_NOTIFY_JOB_NAME unset',
    expectCalls: 0, // it refuses before reaching the network
  },
  {
    name: 'an unreachable API is reported, not thrown',
    wantAuth: [true],
    throws: new Error('getaddrinfo ENOTFOUND'),
    wantProblem: 'unreachable',
  },
  {
    name: 'a run with no matching job says so',
    wantAuth: [true],
    reply: { ok: true, json: { jobs: [{ name: 'something-else', steps: [] }] } },
    wantProblem: 'no job named',
  },
  {
    name: 'a job that failed with NO step failing is its own signal, not an empty list',
    wantAuth: [true],
    reply: { ok: true, json: { jobs: [{ name: 'drift', steps: [{ name: 'x', conclusion: 'success' }] }] } },
    wantProblem: 'died in setup',
  },
];

/** Runs STEPS_FIXTURES. Async, so main() awaits it beside the sync table. */
export async function runFetchSelfTest() {
  const failures = [];
  const ctx = { api: 'https://api.example', repo: 'o/r', runId: '1', token: 't' };
  for (const f of STEPS_FIXTURES) {
    // A queue, so a row can script the 403-then-retry sequence. A single `reply`
    // is the degenerate case of a one-element queue that never runs out.
    const queue = f.replies ? [...f.replies] : null;
    let calls = 0;
    // 🔴 THE FAKE RECORDS THE REQUEST, AND AN EARLIER VERSION THREW IT AWAY.
    // It took no arguments, so the table could assert only HOW MANY calls were
    // made — never what was IN them. Measured: five mutants survived the whole
    // suite, including "never send the token" and "anonymous first, token on
    // retry", which is the exact INVERSION of the ordering this table's own
    // failure text says it protects. A count is not a request.
    const sent = [];
    const fake = async (url, init) => {
      calls += 1;
      sent.push({ url, auth: Boolean(init?.headers?.authorization), signal: Boolean(init?.signal) });
      if (f.throws) throw f.throws;
      const r = queue ? queue.shift() ?? f.replies[f.replies.length - 1] : f.reply;
      return { ok: r.ok, status: r.status, json: async () => r.json };
    };
    const got = await fetchFailedSteps(f.ctx || ctx, f.jobName === undefined ? 'drift' : f.jobName, fake);
    // 🔴 EVERY ROW ASSERTS ITS CALL COUNT, NOT JUST THE SCRIPTED ONES. An earlier
    // draft checked it only when `replies` was present, and a mutant that retried
    // UNCONDITIONALLY instead of on 403 SURVIVED the whole table: the single-reply
    // rows still got their answer, just after a redundant second call. That is not
    // cosmetic — it doubles every request and spends the 60/hr anonymous budget
    // that is the entire reason the token goes first.
    const wantCalls = f.throws ? 1 : f.replies ? f.replies.length : f.expectCalls ?? 1;
    // wantAuth is the per-call ordering: [true] = token only; [true, false] =
    // token first, then the anonymous retry. Writing it per call is what makes an
    // inverted ordering a different array rather than the same count.
    // 🔴 MANDATORY FOR ANY ROW THAT REACHES THE NETWORK — optional is the exact
    // anti-pattern recorded 20 lines below, where a conditional call-count check
    // let an unconditional-retry mutant survive the whole table. A row added
    // without wantAuth would assert nothing about its own ordering.
    if (!f.wantAuth && f.expectCalls !== 0) {
      failures.push(
        `STEPS — ${f.name}\n      declares no wantAuth. Every row that reaches the network must state its ` +
          `per-call Authorization ORDER, or it silently asserts nothing about the one property this table exists for.`,
      );
    }
    if (f.wantAuth) {
      const gotAuth = sent.map((r) => r.auth);
      if (JSON.stringify(gotAuth) !== JSON.stringify(f.wantAuth)) {
        failures.push(
          `STEPS — ${f.name}\n      Authorization per call was ${JSON.stringify(gotAuth)}, want ` +
            `${JSON.stringify(f.wantAuth)}.\n` +
            `      The ORDER is the claim: the token goes first for rate-limit headroom on a shared\n` +
            `      runner IP, and anonymous is the FALLBACK. Inverted, every call spends the 60/hr\n` +
            `      anonymous budget; never sent, it spends all of them.`,
        );
      }
    }
    // Every request must carry a timeout. Without one the notify job can hang to
    // its own 10-minute limit and the alert simply never arrives — a failure that
    // looks like nothing happening at all.
    // 🔴 THE URL WAS RECORDED AND READ BY NOTHING. Round 2 found five surviving
    // request-target mutants through that gap; the sharpest drops `?per_page=100`,
    // leaving the API default of 30 jobs per page, so a workflow that grew past 30
    // jobs would report `no job named "drift"` forever — degraded, silent, green.
    // One of the three recorded fields was decorative; now none is.
    const wantUrl = `https://api.example/repos/o/r/actions/runs/1/jobs?per_page=100`;
    if (f.expectCalls !== 0 && sent.some((r) => r.url !== wantUrl)) {
      failures.push(
        `STEPS — ${f.name}\n      a request went to ${JSON.stringify(sent.map((r) => r.url))}, want every call at ` +
          `${JSON.stringify(wantUrl)}.\n` +
          `      The page size is part of the target: without it the API returns 30 jobs and a run with more ` +
          `      would never contain the drift job at all.`,
      );
    }
    if (sent.some((r) => !r.signal)) {
      failures.push(
        `STEPS — ${f.name}\n      a request went out with no abort signal. fetch has no default timeout, so ` +
          `the notify job can hang until the workflow kills it and the alert is never delivered.`,
      );
    }
    if (!f.skipCallCount && calls !== wantCalls) {
      failures.push(
        `STEPS — ${f.name}\n      the fetcher made ${calls} call(s), want ${wantCalls} — the retry either did not ` +
          `happen, or happened when it should not have. A retry on every call doubles the request rate and ` +
          `burns the anonymous limit the token-first ordering exists to protect.`,
      );
    }
    if (f.wantSteps) {
      if (JSON.stringify(got.failedSteps) !== JSON.stringify(f.wantSteps)) {
        failures.push(
          `STEPS — ${f.name}\n      expected ${JSON.stringify(f.wantSteps)}, got ${JSON.stringify(got.failedSteps)}` +
            ` (problem: ${got.stepsProblem})\n` +
            `      This row is the control on the other four: a fetcher that always returned a problem\n` +
            `      would satisfy every one of them while naming nothing, ever.`,
        );
      }
    } else if (!got.stepsProblem || !got.stepsProblem.includes(f.wantProblem)) {
      failures.push(
        `STEPS — ${f.name}\n      expected a problem containing ${JSON.stringify(f.wantProblem)}, got ` +
          `${JSON.stringify(got.stepsProblem)}\n` +
          `      The degraded path must say WHY the steps are unnamed. Reported as a bare null it is\n` +
          `      indistinguishable from "one check failed", which is the defect #76 is about.`,
      );
    }
  }
  return failures;
}

export function runSelfTest() {
  const failures = [];

  for (const f of DECIDE_FIXTURES) {
    const got = decideNotification(f.input);
    if (got.action !== f.expect) {
      failures.push(
        `DECIDE — ${f.name}\n` +
          `      expected "${f.expect}", got "${got.action}" (reasons: ${JSON.stringify(got.reasons)})\n` +
          `      This table IS the mutation test for the silent-zero clause. A scheduled run that\n` +
          `      verified nothing exits 0 and looks exactly like a clean one; if that row can turn\n` +
          `      "resolve", external rot is detected and delivered to nobody, which is the whole\n` +
          `      reason this file exists.`,
      );
    } else if (f.reasonIncludes && !got.reasons.some((r) => r.includes(f.reasonIncludes))) {
      failures.push(
        `DECIDE — ${f.name}\n` +
          `      action was "${got.action}" as expected, but no reason names ${JSON.stringify(f.reasonIncludes)}: ` +
          `${JSON.stringify(got.reasons)}\n` +
          `      The reason IS the issue body a maintainer reads. A right verdict reached for an\n` +
          `      unstated cause is an alert nobody can act on.`,
      );
    }
  }

  // The fingerprint must MOVE when what is wrong changes, and must NOT move when
  // it does not — those are two different failures and both are silent.
  const a = decideNotification(DECIDE_FIXTURES.find((f) => f.name.startsWith('real rot')).input);
  const b = decideNotification({
    jobResult: 'failure',
    report: { verdict: 'rot', listed: 8, verified: 7, rotted: 1, unverified: 0, offline: false, findings: [{ repo: 'e/f', reason: 'HTTP 404 — no public repository at github.com/e/f' }] },
    problem: null,
  });
  if (fingerprint(a) === fingerprint(b)) {
    failures.push('FINGERPRINT — two different failures hash the same, so a changed problem would never re-comment.');
  }
  if (fingerprint(a) !== fingerprint(decideNotification(DECIDE_FIXTURES.find((f) => f.name.startsWith('real rot')).input))) {
    failures.push('FINGERPRINT — the same failure hashes differently twice, so every run would re-comment.');
  }

  // A body must round-trip its own fingerprint, or the "has this changed?"
  // question is answered `null !== <hash>` every run — i.e. always "yes".
  const body = issueBody(a, DECIDE_FIXTURES.find((f) => f.name.startsWith('real rot')).input.report, {
    repo: 'civitai/civitai-developer-docs',
    serverUrl: 'https://github.com',
    runId: '1',
  });
  if (fingerprintOf(body) !== fingerprint(a)) {
    failures.push(
      `FINGERPRINT — issueBody does not round-trip it (wrote ${fingerprint(a)}, read ${fingerprintOf(body)}), so every ` +
        'run would read the issue as changed and comment again.',
    );
  }
  if (!body.includes(MARKER)) {
    failures.push('MARKER — issueBody omits the marker, so the next run cannot find the issue and would open a second one.');
  }

  // CONTROLS ON THE TABLE ITSELF.
  const alerts = DECIDE_FIXTURES.filter((f) => f.expect === 'alert').length;
  const resolves = DECIDE_FIXTURES.filter((f) => f.expect === 'resolve').length;
  const zeroRows = DECIDE_FIXTURES.filter((f) => f.input.report && f.input.report.verified === 0 && f.input.jobResult === 'success' && f.input.report.offline !== true).length;
  const scopeZeroRows = DECIDE_FIXTURES.filter(
    (f) => f.input.report && f.input.report.scopesClaimed > 0 && f.input.report.scopesVerified === 0 && f.input.jobResult === 'success',
  ).length;
  const skippedRows = DECIDE_FIXTURES.filter((f) => f.input.jobResult === 'skipped' || f.input.jobResult === 'cancelled').length;
  if (alerts < 4 || resolves < 2 || zeroRows < 2 || scopeZeroRows < 1 || skippedRows < 1) {
    failures.push(
      `SELF-TEST DEGENERATE — the decision table lost its controls (${alerts} alert rows, ${resolves} resolve rows, ` +
        `${zeroRows} success-with-zero-repos-verified rows, ${scopeZeroRows} success-with-zero-scopes-verified rows, ` +
        `${skippedRows} skipped/cancelled rows).\n` +
        `      The zero-verified rows are mandatory, BOTH kinds: they are the only thing that kills the\n` +
        `      "a green exit code means all clear" mutant, and the scope one exists because the first\n` +
        `      version of this file caught exactly half of what its own banner claimed. Two resolve rows\n` +
        `      are mandatory too — a notifier that alerts unconditionally is noise, and noise is muted.`,
    );
  }

  return failures;
}

// ---------------------------------------------------------------------------
// DELIVERY.
// ---------------------------------------------------------------------------

function ghContext() {
  return {
    repo: process.env.GITHUB_REPOSITORY || '',
    api: process.env.GITHUB_API_URL || 'https://api.github.com',
    serverUrl: process.env.GITHUB_SERVER_URL || 'https://github.com',
    runId: process.env.GITHUB_RUN_ID || '',
    token: process.env.GITHUB_TOKEN || '',
  };
}

/**
 * Which STEPS of the drift job failed, for the body a maintainer reads.
 *
 * 🔴 READ FROM THE RUN, NOT FROM THE STEPS THEMSELVES — civitai-developer-docs#76.
 * The obvious alternative is to have each drift step record its own result into
 * an artifact the notifier reads. That regenerates the defect at the NEXT step
 * added: a step nobody wired is invisible, and invisible reads as green. Asking
 * the API for the run's jobs covers every step that exists, including ones added
 * after this file was written, which is the only version of this that cannot rot.
 *
 * 🔴 NEVER THROWS, unlike api() below, and the asymmetry is deliberate. A
 * notifier that cannot reach the API has failed at its only job — but a notifier
 * that cannot ENRICH its alert must still send it. Returning a problem string
 * makes the degraded path say WHY the steps are unnamed instead of quietly
 * printing the old one-scalar sentence.
 *
 * 🔴 REQUIRES NO SCOPE **ON A PUBLIC REPO**, AND AN EARLIER DRAFT SAID BOTH
 * HALVES WRONG. It first said `actions: read` is required; the retry below made
 * that false. The replacement said "REQUIRES NO SCOPE" flat, which is true only
 * because this repo is public and the jobs endpoint answers anonymously. Copy
 * this to a PRIVATE repo and the retry fails too, the enrichment degrades
 * forever, and an unconditional sentence here would tell whoever investigates
 * that no scope is needed. The earlier draft said `actions: read`.
 * That was written when the token went out unconditionally; it is false since the
 * 403/404 retry below, and the workflow grant it named has been deleted. Left
 * standing it would send the next maintainer debugging a degraded enrichment
 * straight to re-adding the scope — undoing the commit that removed it and
 * re-falsifying the workflow's own "no actions" line.
 *
 * @returns {Promise<{ failedSteps: string[]|null, stepsProblem: string|null }>}
 */
// 🔴 jobName IS PASSED IN, NOT DEFAULTED HERE. A literal 'drift' in this file has
// nothing tying it to the workflow's job id: rename the job and the fetcher
// degrades PERMANENTLY and quietly to "no job named drift", which is the same
// rot-on-next-change failure this design rejects the per-step ledger for. The
// workflow supplies it from DRIFT_NOTIFY_JOB_NAME on the line next to
// DRIFT_NOTIFY_JOB_RESULT's `needs.<id>.result`, so the two references sit
// together and a rename that misses one is visible in the diff.
export async function fetchFailedSteps(ctx, jobName, fetchImpl = fetch) {
  if (!jobName) return { failedSteps: null, stepsProblem: 'no job name was given to the fetcher (DRIFT_NOTIFY_JOB_NAME unset)' };
  if (!ctx.runId) return { failedSteps: null, stepsProblem: 'no GITHUB_RUN_ID in the environment' };
  if (!ctx.repo) return { failedSteps: null, stepsProblem: 'no GITHUB_REPOSITORY in the environment' };
  const url = `${ctx.api}/repos/${ctx.repo}/actions/runs/${ctx.runId}/jobs?per_page=100`;
  const get = (withToken) =>
    fetchImpl(url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(withToken && ctx.token ? { authorization: `Bearer ${ctx.token}` } : {}),
      },
    });

  // 🔴 TOKEN FIRST, THEN UNAUTHENTICATED ON 403 — AND THAT ORDER BUYS US NO NEW
  // SCOPE. This repo is PUBLIC, so /actions/runs/<id>/jobs answers 200 to an
  // anonymous GET; measured, with a bogus run id returning 404 as the control.
  // An earlier draft sent the token unconditionally and therefore needed
  // `actions: read` on the one privileged job in this workflow — a scope that
  // turns a working 200 into a 403 and nothing else. The retry removes it.
  //
  // Token first anyway, because the workflow header's own argument applies: the
  // unauthenticated limit is 60/hr shared across a runner IP, so the anonymous
  // call is the FALLBACK rather than the default. This is the same
  // "UNAUTHENTICATED-capable GET of a PUBLIC cross-repo endpoint" shape every
  // read step in this workflow already uses.
  let res;
  let firstStatus;
  try {
    res = await get(true);
    firstStatus = res.status;
    // 403 OR 404, and the 404 is not padding. A token that cannot see a resource
    // is answered 403 by some GitHub token types and 404 by others, and which one
    // a GITHUB_TOKEN lacking `actions` gets is the load-bearing precondition here
    // — one this repo cannot measure without a real run. The notify job always
    // queries the run it is EXECUTING INSIDE, so a 404 there cannot mean "gone";
    // it can only mean "this token cannot see it", which is exactly the case the
    // anonymous retry answers. Retrying on both removes the assumption for free.
    if ((res.status === 403 || res.status === 404) && ctx.token) res = await get(false);
  } catch (err) {
    return { failedSteps: null, stepsProblem: `the jobs API was unreachable (${err.name || err.message})` };
  }
  if (!res.ok) {
    return {
      failedSteps: null,
      stepsProblem:
        res.status === 403
          ? ctx.token
            ? `the jobs API answered ${firstStatus} with the token and ${res.status} without — on a PUBLIC repo that is a rate limit, not a missing scope`
            : 'the jobs API answered 403 to an anonymous request — on a PUBLIC repo that is the 60/hr shared-runner rate limit'
          : `the jobs API answered ${res.status}`,
    };
  }
  let body;
  try {
    body = await res.json();
  } catch (err) {
    return { failedSteps: null, stepsProblem: `the jobs API returned unparseable JSON (${err.message})` };
  }
  const jobs = Array.isArray(body?.jobs) ? body.jobs : [];
  const job = jobs.find((j) => j?.name === jobName);
  if (!job) {
    return { failedSteps: null, stepsProblem: `this run has no job named "${jobName}" (saw ${jobs.length})` };
  }
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const failed = steps.filter((st) => st?.conclusion === 'failure').map((st) => String(st.name || '(unnamed step)'));
  // An EMPTY list where the job failed is itself information: the job died
  // before any step recorded a conclusion, or failed in its own setup.
  if (!failed.length) {
    return { failedSteps: null, stepsProblem: `the "${jobName}" job failed with no step recording a failure — it died in setup, or was killed` };
  }
  return { failedSteps: failed, stepsProblem: null };
}

/**
 * One API call. THROWS on failure, on purpose — see the banner: the guard skips
 * loudly on an unreachable network because a false-fail would poison a gate; a
 * notifier that cannot reach the API has failed at the only thing it does.
 */
async function api(ctx, method, path, body, fetchImpl = fetch) {
  const res = await fetchImpl(`${ctx.api}${path}`, {
    method,
    signal: AbortSignal.timeout(20000),
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      authorization: `Bearer ${ctx.token}`,
      'user-agent': 'civitai-developer-docs-drift-notify',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} -> HTTP ${res.status} ${text.slice(0, 400)}`);
  }
  return res.status === 204 ? null : res.json();
}

/**
 * The one open issue this notifier owns, or null.
 *
 * Paginated rather than capped at one page: the marker search must not start
 * missing the issue the day this repository has 101 open ones, because the
 * observable of that is a SECOND issue opened every night. Bounded at 10 pages
 * (1000 issues) so a pathological repository cannot hang the job — a disclosed
 * residual, not an oversight.
 */
async function findIssue(ctx, fetchImpl = fetch) {
  for (let page = 1; page <= 10; page++) {
    const batch = await api(ctx, 'GET', `/repos/${ctx.repo}/issues?state=open&per_page=100&page=${page}`, null, fetchImpl);
    if (!Array.isArray(batch) || batch.length === 0) return null;
    const hit = batch.find((it) => !it.pull_request && String(it.body ?? '').includes(MARKER));
    if (hit) return hit;
    if (batch.length < 100) return null;
  }
  return null;
}

async function main(argv = process.argv.slice(2)) {
  // ---- 0. THE INSTRUMENT ITSELF -------------------------------------------
  const selfTest = runSelfTest();
  if (selfTest.length) {
    console.error('✗ SELF-TEST FAILED — the notifier is broken, so it delivered nothing\n');
    for (const f of selfTest) console.error(`  - ${f}`);
    process.exit(1);
  }
  const zeroRows = DECIDE_FIXTURES.filter((f) => f.input.report && f.input.report.verified === 0 && f.input.jobResult === 'success' && f.input.report.offline !== true).length;
  console.log(
    `✓ self-test: ${DECIDE_FIXTURES.length} decision fixture(s) ` +
      `(${DECIDE_FIXTURES.filter((f) => f.expect === 'alert').length} must-ALERT, ` +
      `${zeroRows} of them the silent-zero mutation test) · fingerprint round-trips`,
  );
  // 🔴 THIS ONE WARNS; IT DOES NOT EXIT. The decision table's self-test above
  // exits 1 because a broken DECISION means the alert would be wrong. This table
  // covers the ENRICHMENT, and fetchFailedSteps is explicitly built never to
  // throw so that "cannot name the steps" degrades instead of blocking. Exiting
  // here would undo exactly that: a bug in an optional feature's own test would
  // stop the alert going out, which is the failure this whole file exists to
  // prevent, one level up. --self-test still exits 1, because there the fixtures
  // ARE the deliverable.
  const fetchFailures = await runFetchSelfTest();
  if (fetchFailures.length) {
    console.error('⚠ the step-fetcher self-test FAILED — the alert will still be delivered, un-enriched\n');
    for (const f of fetchFailures) console.error(`  - ${f}`);
    if (argv.includes('--self-test')) process.exit(1);
  }
  // 🔴 GUARDED. This printed unconditionally, so on the production path — where
  // the failure above is deliberately non-fatal — a ✓ appeared directly under the
  // FAILED banner for the table that had just failed. In a file whose whole
  // doctrine is "a green that is not evidence", that is the exact shape.
  // The count is DERIVED, not a literal: an earlier version hardcoded "1 positive
  // control" and went on printing it after the control row was deleted.
  if (!fetchFailures.length) {
    const controls = STEPS_FIXTURES.filter((f) => f.wantSteps).length;
    console.log(
      `✓ self-test: ${STEPS_FIXTURES.length} step-fetcher fixture(s) ` +
        `(${controls} positive control(s), ${STEPS_FIXTURES.length - controls} degraded paths)`,
    );
  }
  if (argv.includes('--self-test')) {
    console.log('Self-test only: no decision made, no API call attempted.');
    return;
  }

  // ---- 1. DECIDE ----------------------------------------------------------
  const jobResult = process.env.DRIFT_NOTIFY_JOB_RESULT || 'unknown';
  const { report, problem } = readReport(process.env.DRIFT_NOTIFY_REPORT);
  const ctx = ghContext();
  // Only ask when there is something to explain. A green job has no failing
  // steps to name, and a skipped/cancelled one has no steps at all — spending an
  // API call on either would be a call that can only fail.
  const { failedSteps, stepsProblem } =
    jobResult !== 'success' && jobResult !== 'skipped' && jobResult !== 'cancelled'
      ? await fetchFailedSteps(ctx, process.env.DRIFT_NOTIFY_JOB_NAME || '')
      : { failedSteps: null, stepsProblem: null };
  const decision = decideNotification({ jobResult, report, problem, failedSteps, stepsProblem });

  console.log(`\ndrift job result: ${jobResult} · report: ${report ? 'present' : `ABSENT (${problem})`}`);
  console.log(
    `failing steps: ${failedSteps ? `${failedSteps.length} named` : `NOT NAMED (${stepsProblem || 'not applicable'})`}`,
  );
  console.log(`decision: ${decision.action.toUpperCase()}`);
  for (const r of decision.reasons) console.log(`  - ${r}`);

  const dryRun = process.env.DRIFT_NOTIFY_DRY_RUN === '1';
  if (dryRun) {
    console.log('\n--- DRY RUN: the issue body that would be delivered ---\n');
    console.log(issueBody(decision, report, ctx));
    return;
  }

  if (!ctx.repo || !ctx.token) {
    console.error('\n✗ no GITHUB_REPOSITORY / GITHUB_TOKEN — the notifier cannot deliver, and a');
    console.error('  notifier that cannot deliver is the failure it exists to prevent. Failing loudly.');
    process.exit(1);
  }

  // ---- 2. DELIVER ---------------------------------------------------------
  const existing = await findIssue(ctx);

  if (decision.action === 'resolve') {
    if (!existing) {
      console.log('\nClean run and no open issue — nothing to deliver.');
      return;
    }
    const runUrl = `${ctx.serverUrl}/${ctx.repo}/actions/runs/${ctx.runId}`;
    await api(ctx, 'POST', `/repos/${ctx.repo}/issues/${existing.number}/comments`, {
      body:
        `The scheduled sweep came back clean: ${report?.verified ?? 0} of ${report?.listed ?? '?'} repositories verified live, ` +
        `${report?.scopesVerified ?? 0} scope list(s) verified against \`block.manifest.json\`, 0 rotted. ` +
        `Closing.\n\nRun: ${runUrl}`,
    });
    await api(ctx, 'PATCH', `/repos/${ctx.repo}/issues/${existing.number}`, { state: 'closed', state_reason: 'completed' });
    console.log(`\nClosed #${existing.number} — a fixed rot must not leave an open issue implying live rot.`);
    return;
  }

  const title = issueTitle(decision, report);
  const body = issueBody(decision, report, ctx);
  const fp = fingerprint(decision);

  if (!existing) {
    // 🔴 THE LABEL MUST NEVER BE WHY THE ALERT DOES NOT ARRIVE. The label is a
    // convenience for whoever triages; the ISSUE is the product. Creating one
    // with a label that does not exist yet normally creates the label too, but
    // that depends on a permission this job may or may not have been given, and
    // a notifier that fails over a taxonomy detail has failed at the one thing
    // it does. So: try with, fall back to without, and SAY which happened —
    // degraded delivery, stated, never silent.
    let created;
    try {
      created = await api(ctx, 'POST', `/repos/${ctx.repo}/issues`, { title, body, labels: [LABEL] });
    } catch (err) {
      console.error(`  ! could not create the issue with the \`${LABEL}\` label (${err.message})`);
      console.error(`  ! retrying WITHOUT it — the label is cosmetic, the alert is not.`);
      created = await api(ctx, 'POST', `/repos/${ctx.repo}/issues`, { title, body });
      console.log(`  (opened without the \`${LABEL}\` label; add it by hand, or create the label once.)`);
    }
    console.log(`\nOpened #${created.number}: ${created.html_url}`);
    return;
  }

  const changed = fingerprintOf(existing.body) !== fp;
  await api(ctx, 'PATCH', `/repos/${ctx.repo}/issues/${existing.number}`, { title, body });
  if (changed) {
    await api(ctx, 'POST', `/repos/${ctx.repo}/issues/${existing.number}/comments`, {
      body: `What is failing has **changed** since the last run:\n\n${decision.reasons.map((r) => `- ${r}`).join('\n')}\n\nRun: ${ctx.serverUrl}/${ctx.repo}/actions/runs/${ctx.runId}`,
    });
  }
  console.log(
    `\nUpdated #${existing.number} in place${changed ? ' and commented (the failure changed)' : ' (same failure as last run — no comment, an alert that spams gets muted)'}.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`drift-notify: ${err.stack || err.message}`);
    process.exit(1);
  });
}
