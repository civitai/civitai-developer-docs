/**
 * app-token-step.mjs
 * ------------------
 * The ONE description of how a bot job in this repo gets its write credential,
 * shared by the tests of both bots (test-bump-appblocks-pins.mjs and
 * test-refresh-cli-snapshot.mjs) so the two cannot drift apart.
 *
 * WHY AN APP TOKEN (#148). A pull request pushed or opened with the default
 * GITHUB_TOKEN gets no `pull_request` runs: GitHub holds them at
 * `action_required` so a workflow cannot trigger itself. `main`'s branch
 * protection only counts the required contexts from those `pull_request` runs
 * (measured on docs#339: check runs from `workflow_dispatch` runs on the same
 * head did not satisfy it). Pushes and PRs made with a GitHub App installation
 * token DO start `pull_request` runs, so each bot mints one, in the job that
 * pushes, scoped to this repository and to the scopes it uses.
 *
 * Two checks live here, one per half of that description:
 *
 * - `appTokenProblems(jobBody, scopes)`: what is wrong with how ONE bot job
 *   mints and uses the token (empty when it is right). It reads the job's text,
 *   as both bot tests hand it a job body cut out by their own `jobsOf`.
 *
 * - `appKeyJobProblems(workflowText, file)`: "no dependency install in a job
 *   that can read the App's private key", over a WHOLE workflow. This is the
 *   only place that rule is checked (test-check-appblocks-snapshots.mjs runs it
 *   over every workflow and pins the set of key-holding jobs); the two bot tests
 *   do not repeat it for their `publish` jobs. See its own comment below.
 */
import yaml from 'js-yaml';

/** Pinned by commit, at the version civitai-image-cacher and civitai-dev-stack pin. */
export const APP_TOKEN_ACTION = 'actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510';
export const APP_TOKEN_REF = '${{ steps.app-token.outputs.token }}';
export const APP_OWNER = 'civitai';
export const APP_REPOSITORY = 'civitai-developer-docs';

/** Drop comment lines, so a commented-out step cannot satisfy a check. */
function runnable(text) {
  return text
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

/** The steps of a job, as text, split on `- ` at the steps' indentation. */
function stepsOf(jobBody) {
  const lines = runnable(jobBody).split('\n');
  const at = lines.findIndex((l) => /^ {4}steps:$/.test(l));
  if (at < 0) return [];
  const steps = [];
  for (const line of lines.slice(at + 1)) {
    if (/^ {6}- /.test(line)) steps.push(line);
    else if (steps.length && (/^ {7,}\S/.test(line) || !line.trim())) steps[steps.length - 1] += `\n${line}`;
    else if (/^ {0,5}\S/.test(line)) break;
  }
  return steps;
}

/** `key: value` pairs under a step's `with:` (and `env:`), unquoted. */
function mapOf(step, key) {
  const lines = step.split('\n');
  const at = lines.findIndex((l) => new RegExp(`^ {6}(- | {2})${key}:$`).test(l));
  if (at < 0) return {};
  const out = {};
  for (const l of lines.slice(at + 1)) {
    const m = /^ {10}([A-Za-z0-9_-]+): (.*)$/.exec(l);
    if (!m) break;
    out[m[1]] = m[2].replace(/\s+#.*$/, '').trim();
  }
  return out;
}

/**
 * Everything wrong with how `jobBody` mints and uses the app token, given the
 * exact `{ scope: 'write' | 'read' }` it should request.
 */
export function appTokenProblems(jobBody, scopes) {
  const problems = [];
  const steps = stepsOf(jobBody);
  const mint = steps.filter((s) => /^ {6}- uses: actions\/create-github-app-token@/m.test(s) || /^ {8}uses: actions\/create-github-app-token@/m.test(s));
  if (mint.length !== 1) return [`expected one create-github-app-token step, found ${mint.length}`];
  const step = mint[0];
  const uses = /uses: (\S+)/.exec(step)[1];
  if (uses !== APP_TOKEN_ACTION) problems.push(`create-github-app-token is not pinned to ${APP_TOKEN_ACTION} (got ${uses})`);
  if (!/^ {8}id: app-token$/m.test(step)) problems.push('the token step has no `id: app-token`');
  const w = mapOf(step, 'with');
  const want = {
    'client-id': '${{ vars.AGENT_APP_CLIENT_ID }}',
    'private-key': '${{ secrets.AGENT_APP_PRIVATE_KEY }}',
    owner: APP_OWNER,
    repositories: APP_REPOSITORY,
  };
  for (const [k, v] of Object.entries(want)) {
    if (w[k] !== v) problems.push(`the token step's ${k} is ${JSON.stringify(w[k])}, expected ${JSON.stringify(v)}`);
  }
  const got = Object.fromEntries(
    Object.entries(w)
      .filter(([k]) => k.startsWith('permission-'))
      .map(([k, v]) => [k.slice('permission-'.length), v]),
  );
  const fmt = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
  if (fmt(got) !== fmt(scopes)) problems.push(`the token requests ${fmt(got)}, expected exactly ${fmt(scopes)}`);
  const extra = Object.keys(w).filter((k) => !(k in want) && !k.startsWith('permission-'));
  if (extra.length) problems.push(`the token step sets unexpected inputs: ${extra.join(', ')}`);

  // The push goes through the checkout's persisted credential, so the checkout
  // must carry the app token, and must come after the step that mints it.
  const mintAt = steps.indexOf(step);
  const checkouts = steps.filter((s) => /uses: actions\/checkout@/.test(s));
  if (checkouts.length !== 1) problems.push(`expected one checkout in the job, found ${checkouts.length}`);
  else {
    const co = checkouts[0];
    if (steps.indexOf(co) < mintAt) problems.push('the checkout runs before the token is minted');
    if (mapOf(co, 'with').token !== APP_TOKEN_REF) problems.push('the checkout does not use the app token, so the push would not start pull_request runs');
    if (mapOf(co, 'with')['persist-credentials'] === 'false') problems.push('the checkout drops the app token, so the push has no credential');
  }
  // Every `gh` credential in the job is the app token: a GH_TOKEN of
  // secrets.GITHUB_TOKEN would open the PR as github-actions, which starts no
  // pull_request runs.
  const ghTokens = steps.map((s) => mapOf(s, 'env').GH_TOKEN).filter(Boolean);
  if (!ghTokens.length) problems.push('no step hands the app token to gh as GH_TOKEN');
  for (const t of ghTokens) if (t !== APP_TOKEN_REF) problems.push(`a step passes GH_TOKEN=${t}, not the app token`);
  return problems;
}

/** Jobs (by name) whose text mints an app token. */
export function jobsMintingAppToken(jobs) {
  return Object.entries(jobs)
    .filter(([, b]) => /uses: actions\/create-github-app-token@/.test(runnable(b)))
    .map(([n]) => n);
}

// ── No dependency install in a job that can read the App private key ────────
/*
 * The rule: no dependency install in a job that can read the agent GitHub
 * App's private key. Referencing secrets.AGENT_APP_PRIVATE_KEY in a job
 * delivers the key to that job's runner, and the pin-bump and cli-snapshot bots
 * mint WRITE tokens from it. A job that also runs `npm ci` (or any package-manager script)
 * executes third-party code next to it; minting "after" the install does not
 * help, because the installed code keeps running in the job's later steps.
 * appblocks-drift.yml's header states the rule; appKeyJobProblems below is what
 * enforces it (scripts/test-check-appblocks-snapshots.mjs runs it over every
 * workflow).
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
