/**
 * bot-push-guard.mjs
 * ------------------
 * The check both bots' privileged publish step runs before it pushes a branch
 * that an UNPRIVILEGED job built.
 *
 * WHY. The unprivileged job runs third-party code: `npm ci` / `npm install` in
 * both bots, and the upstream `civitai` release binary in the snapshot
 * refresher. It hands the publish job a git bundle. The publish job pushes it
 * with the GitHub App token, and an app-token push starts the `pull_request`
 * workflows (#148), which run the branch's own scripts. So a bundle that
 * slipped in an edit to, say, `scripts/test-doc-samples.mjs` would get that code
 * run by a `pull_request` workflow with whatever secrets that workflow passes
 * it. The publish job therefore refuses to push any path the bot does not own,
 * unless that path is byte-identical to the base branch (a `main` merged into
 * the bot branch brings `main`'s files, and those are not the bot's to vet).
 *
 * Workflow files cannot ride along either way: the app token is minted without
 * the `workflows` permission, so GitHub rejects such a push.
 *
 * The allowlist predicate comes from the caller's TRUSTED checkout (the
 * workflow's own ref), never from the bundle.
 */

import { spawnSync } from 'node:child_process';

/** The blob id of `path` at `rev`, or null when it does not exist there. */
function blobAt(cwd, rev, path) {
  const res = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${rev}:${path}`], { cwd, encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : null;
}

function gitOut(cwd, args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed (exit ${res.status}): ${(res.stderr || '').trim()}`);
  return res.stdout;
}

/**
 * The paths that `head` changes relative to `from` which are neither `allowed`
 * nor identical to their version on one of `bases`. Pure over its inputs.
 */
export function unexpectedPaths({ paths, allowed, sameAsBase }) {
  return paths.filter((p) => !allowed(p) && !sameAsBase(p)).sort();
}

/**
 * Throws, naming every offending path, when pushing `head` over `from` would
 * publish a change the bot does not own. `bases` are trusted revisions (the
 * base branch as fetched now, and as the build job saw it).
 */
export function assertOnlyOwnedChanges({ cwd, from, head, bases, allowed }) {
  const paths = gitOut(cwd, ['diff', '--name-only', '--no-renames', '-z', from, head]).split('\0').filter(Boolean);
  const sameAsBase = (p) => {
    const mine = blobAt(cwd, head, p);
    return bases.some((b) => blobAt(cwd, b, p) === mine);
  };
  const bad = unexpectedPaths({ paths, allowed, sameAsBase });
  if (bad.length) {
    throw new Error(
      `the branch handed over for publishing changes ${bad.length} path(s) this bot does not own, so nothing was pushed: ` +
        `${bad.join(', ')}. The build job runs third-party code; a change outside the bot's own files is refused rather ` +
        'than published where pull_request workflows would run it.',
    );
  }
  return paths;
}
