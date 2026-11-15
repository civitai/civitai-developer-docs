/**
 * app-key-jobs.mjs
 * ----------------
 * "No dependency install in a job that can read the agent GitHub App's private
 * key." Referencing secrets.AGENT_APP_PRIVATE_KEY in a job delivers the key to
 * that job's runner, and the pin-bump and cli-snapshot bots mint WRITE tokens
 * from it. A job that also runs `npm ci` (or any package-manager script)
 * executes third-party code next to it; minting "after" the install does not
 * help, because the installed code keeps running in the job's later steps.
 * appblocks-drift.yml's header states the rule; this module is what enforces it
 * (scripts/test-check-appblocks-snapshots.mjs runs it over every workflow).
 *
 * It PARSES each workflow (YAML) and judges each job by its own parsed values,
 * so a comment that says "no `npm ci` here" is not an install, and an install in
 * one job is not charged to a neighbour that holds the key. A key referenced in
 * the workflow-level `env:` reaches every job, so every job then counts.
 *
 * A job "can read the key" when one of its values references it through the
 * secrets context (`secrets.AGENT_APP_PRIVATE_KEY`), not when prose names it.
 *
 * What it cannot see: a composite or reusable workflow (`uses:`) that installs
 * inside itself, or a reusable-workflow call handed the key by `secrets: inherit`.
 */
import yaml from 'js-yaml';

export const APP_KEY_SECRET = 'AGENT_APP_PRIVATE_KEY';

/** Substrings that mean "this job runs package-manager code". */
export const INSTALL_MARKERS = ['npm ci', 'npm install', 'npm run', 'pnpm', 'yarn'];

/** Every string scalar under `node` (keys included), depth first. */
function strings(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) for (const v of node) strings(v, out);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      out.push(k);
      strings(v, out);
    }
  }
  return out;
}

// The secrets-context reference (`secrets.X` or `secrets['X']`), which is what
// delivers the value. Prose naming the secret (an issue body that says "secret
// `AGENT_APP_PRIVATE_KEY`") delivers nothing, so it does not count.
const KEY_REF = new RegExp(String.raw`\bsecrets\s*(?:\.\s*${APP_KEY_SECRET}\b|\[\s*['"]${APP_KEY_SECRET}['"]\s*\])`);
const references = (node) => strings(node).some((s) => KEY_REF.test(s));

/** `with: { cache: npm }` on any step (setup-node's dependency cache restores node_modules inputs). */
function npmCacheSteps(job) {
  return (job.steps ?? []).filter((s) => s && s.with && String(s.with.cache).trim() === 'npm');
}

/**
 * Parses one workflow's text. Returns `{ keyJobs, problems }`: the names of the
 * jobs that can read the key, and one message per install found in such a job.
 * Throws when the text is not a workflow with a `jobs:` mapping.
 */
export function appKeyJobProblems(text, file = '<workflow>') {
  const doc = yaml.safeLoad(text);
  if (!doc || typeof doc !== 'object' || !doc.jobs || typeof doc.jobs !== 'object') {
    throw new Error(`${file}: no jobs: mapping`);
  }
  const workflowWide = references(doc.env ?? {});
  const keyJobs = [];
  const problems = [];
  for (const [name, job] of Object.entries(doc.jobs)) {
    if (!workflowWide && !references(job)) continue;
    keyJobs.push(name);
    const values = strings(job);
    for (const marker of INSTALL_MARKERS) {
      if (values.some((s) => s.includes(marker))) {
        problems.push(`${file}: job \`${name}\` can read ${APP_KEY_SECRET} and runs \`${marker}\``);
      }
    }
    if (npmCacheSteps(job).length) {
      problems.push(`${file}: job \`${name}\` can read ${APP_KEY_SECRET} and sets \`cache: npm\``);
    }
  }
  return { keyJobs, problems };
}
