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
export function decideNotification({ jobResult, report, problem }) {
  const reasons = [];
  const findings = Array.isArray(report?.findings) ? report.findings : [];

  // 1. The job itself. `skipped` and `cancelled` are the shapes that read as
  //    green everywhere else: GitHub shows no red X for them, and the sweep's
  //    conclusion rolls up as neutral.
  if (jobResult !== 'success') {
    reasons.push(
      jobResult === 'skipped' || jobResult === 'cancelled'
        ? `the scheduled drift job was ${jobResult} — none of its checks ran, so NOTHING was verified`
        : `the scheduled drift job ended "${jobResult}" — at least one drift check is red`,
    );
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
  if (argv.includes('--self-test')) {
    console.log('Self-test only: no decision made, no API call attempted.');
    return;
  }

  // ---- 1. DECIDE ----------------------------------------------------------
  const jobResult = process.env.DRIFT_NOTIFY_JOB_RESULT || 'unknown';
  const { report, problem } = readReport(process.env.DRIFT_NOTIFY_REPORT);
  const decision = decideNotification({ jobResult, report, problem });
  const ctx = ghContext();

  console.log(`\ndrift job result: ${jobResult} · report: ${report ? 'present' : `ABSENT (${problem})`}`);
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
