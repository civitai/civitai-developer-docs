#!/usr/bin/env node
/**
 * required-checks.mjs
 * -------------------
 * Start `main`'s required checks on a bot branch, by dispatching the workflows
 * that report them.
 *
 * WHY THIS EXISTS. A pull request opened with the default GITHUB_TOKEN gets no
 * `pull_request` runs: GitHub suppresses them so a workflow cannot trigger
 * itself recursively. The runs are recorded as `action_required` and never
 * start, so the PR shows zero checks and `main`'s required contexts never
 * report (issue #148). `workflow_dispatch` is one of the events GITHUB_TOKEN IS
 * allowed to trigger, and every required workflow accepts it, so a bot that
 * opens a PR dispatches each of them with `--ref <its branch>`. Each run's job
 * reports a check run of the same name, from the GitHub Actions app, on the
 * branch's head commit, which is what branch protection reads.
 *
 * The caller needs `actions: write`. No secret and no App token are involved.
 *
 * A human push to the branch still triggers the ordinary `pull_request` runs;
 * this is only needed for commits the bot pushes itself.
 *
 * ONE LIST. `REQUIRED_CHECKS` maps each required context on `main` to the
 * workflow file whose job carries that name. scripts/test-bump-appblocks-pins.mjs
 * checks that every file exists, accepts `workflow_dispatch`, and has a job of
 * that name. At run time the dispatcher also reads `main`'s required contexts
 * (the public branch endpoint returns them; no admin token is needed) and FAILS
 * the run, after dispatching what it can, when one has no mapping here — a new
 * required check would otherwise leave every bot PR waiting on a check nobody
 * starts, which is #148 again. Add the new context to the list.
 *
 * `EXTRA_CHECKS` are dispatched too but are not required: `showcase-e2e` is the
 * only render test of the design-system packages and is path-filtered, and
 * `checks` runs the bots' own test suites. They do not gate auto-merge (only
 * required checks do); their results are on the PR for a reader.
 *
 * USAGE (CI)
 *   node scripts/lib/required-checks.mjs --ref <branch> [--if-open-pr --base main]
 */

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Required context on `main` -> the workflow file whose job reports it. */
export const REQUIRED_CHECKS = Object.freeze([
  { context: 'test-cli', workflow: 'appblocks-cli.yml' },
  { context: 'test-messages', workflow: 'appblocks-messages.yml' },
  { context: 'test-bridge', workflow: 'appblocks-bridge.yml' },
  { context: 'typecheck-snippets', workflow: 'appblocks-snippets.yml' },
  { context: 'build-site', workflow: 'build-site.yml' },
  { context: 'test-md-regions', workflow: 'appblocks-md-regions.yml' },
]);

/** Dispatched with the required ones, but gating nothing. */
export const EXTRA_CHECKS = Object.freeze([
  { context: 'showcase-e2e', workflow: 'showcase-e2e.yml' },
  { context: 'checks', workflow: 'checks.yml' },
]);

/**
 * The `gh` argument vectors that dispatch every required (then extra) workflow
 * on `ref`. Pure, so the test can pin the exact commands.
 */
export function dispatchCommands(ref) {
  if (!ref || typeof ref !== 'string' || ref === 'main' || ref.startsWith('-')) {
    throw new Error(`refusing to dispatch the required checks on ref ${JSON.stringify(ref)}`);
  }
  return [...REQUIRED_CHECKS, ...EXTRA_CHECKS].map(({ workflow }) => ['workflow', 'run', workflow, '--ref', ref]);
}

/** Required contexts on `main` that no entry here maps to a workflow. Pure. */
export function unmappedContexts(contexts) {
  const known = new Set(REQUIRED_CHECKS.map((c) => c.context));
  return [...new Set(contexts)].filter((c) => !known.has(c)).sort();
}

function gh(args) {
  const res = spawnSync('gh', args, { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const err = new Error(`gh ${args.slice(0, 3).join(' ')} failed (exit ${res.status}): ${(res.stderr || '').trim()}`);
    err.stderr = res.stderr || '';
    throw err;
  }
  return (res.stdout || '').trim();
}

/**
 * The open PR from `head` IN THIS REPOSITORY into `base`, or null.
 *
 * `gh pr list --head <name>` also returns PRs from FORKS whose branch has that
 * name (measured: `--head ghost-agent/issue-237` returned fork PR #244), so
 * anyone could open a fork PR named like the bot branch and have the bot edit
 * it. Cross-repository PRs are dropped.
 */
export function openPrFor({ head, base }, run = gh) {
  const out = run(['pr', 'list', '--head', head, '--base', base, '--state', 'open', '--json', 'number,headRefOid,isCrossRepository']);
  const list = JSON.parse(out || '[]').filter((p) => p.isCrossRepository === false);
  return list[0] ?? null;
}

/**
 * Dispatch all of them. Every dispatch is attempted even if one fails, so one
 * bad workflow does not leave the other five unstarted; then it throws, naming
 * each failure, so the caller's run goes red.
 */
export function dispatchRequiredChecks(ref, run = gh) {
  // Read main's required contexts first; dispatch regardless, fail afterwards.
  let unmapped = [];
  try {
    const contexts = JSON.parse(
      run(['api', 'repos/{owner}/{repo}/branches/main', '--jq', '.protection.required_status_checks.contexts']) || '[]',
    );
    unmapped = unmappedContexts(Array.isArray(contexts) ? contexts : []);
  } catch (err) {
    console.error(`  ⚠ could not read main's required contexts (${err.message}); dispatching the mapped list`);
  }
  const failed = [];
  for (const args of dispatchCommands(ref)) {
    try {
      run(args);
      console.log(`  ✓ dispatched ${args[2]} on ${ref}`);
    } catch (err) {
      console.error(`  ✗ could not dispatch ${args[2]} on ${ref}: ${err.message}`);
      failed.push(args[2]);
    }
  }
  const problems = [];
  if (failed.length) problems.push(`${failed.length} workflow(s) were not dispatched: ${failed.join(', ')}`);
  if (unmapped.length) {
    problems.push(
      `main requires ${unmapped.join(', ')}, which scripts/lib/required-checks.mjs does not map to a workflow, ` +
        'so nothing starts it on this branch and the PR cannot merge. Add it to REQUIRED_CHECKS.',
    );
  }
  if (problems.length) throw new Error(problems.join('; '));
}

function main() {
  const argv = process.argv.slice(2);
  const val = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const ref = val('--ref');
  if (argv.includes('--if-open-pr')) {
    const base = val('--base') || 'main';
    const pr = openPrFor({ head: ref, base });
    if (!pr) {
      console.log(`No open PR from ${ref} into ${base}; nothing to start checks for.`);
      return;
    }
    console.log(`PR #${pr.number} is open from ${ref} (head ${String(pr.headRefOid).slice(0, 8)}).`);
  }
  dispatchRequiredChecks(ref);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    console.error(`required-checks: ${err.message}`);
    process.exit(1);
  }
}
