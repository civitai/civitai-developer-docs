#!/usr/bin/env node
/**
 * check-example-apps.mjs
 * ----------------------
 * The anti-rot guard for `apps/examples.md` — the page that names the public
 * example App Block repositories, and the ONE stable URL the `civitai
 * agent-setup` managed block points an agent at instead of embedding a list of
 * repo literals into every user's project.
 *
 * That indirection is the whole point, and it is also the whole risk: the page
 * is now the single place those repositories are named, so when one of them is
 * renamed, archived or deleted, EVERY agent that follows the link gets a dead
 * end. Nothing else in this repo can see that happen.
 *
 * 🔴 WHY A STATUS-CODE CHECK IS WORTHLESS HERE
 * --------------------------------------------
 * **GitHub 301-redirects a RENAMED repository, and both the web and the REST
 * API follow the redirect to the new location — and `fetch` follows it
 * SILENTLY, so the status this script sees is 200, not 301.** WHATWG fetch
 * defaults to `redirect: 'follow'`; the 301 is consumed inside the call and
 * never reaches the caller. Measured 2026-09-11, unauthenticated, node v26.8.1,
 * on `api.github.com/repos/facebook/jest` (renamed to `jestjs/jest`):
 *
 *     fetch(url)                        -> status=200 ok=true  redirected=true
 *                                          body.full_name = "jestjs/jest"
 *     fetch(url, {redirect: 'manual'})  -> status=301 ok=false redirected=false
 *     curl -o /dev/null -w '%{http_code}'  (no -L)     -> 301
 *
 * So `res.ok` is TRUE for a repository that no longer exists at the path the
 * page spells, and a guard reading it calls that link healthy. A human clicking
 * it lands somewhere too, so nobody notices — right up until the redirect is
 * dropped, which happens the moment anyone else claims the old name, at which
 * point the link points at a stranger's repository.
 *
 * So the verdict is computed from the RESPONSE BODY, never the status line:
 * `body.full_name` must equal the `owner/repo` the page spells, case-
 * insensitively. A redirect is therefore a FAILURE with the new name printed,
 * which is also the fix.
 *
 * `redirect: 'manual'` would catch the same case and is deliberately NOT used:
 * it hides the real assertion inside an options bag, where a later tidy-up that
 * drops one word leaves the guard silently inert, and it would report a bare
 * "HTTP 301" rather than naming the repository's new home. The body comparison
 * has no option to lose, and its failure message IS the remedy.
 *
 * WHAT IS CHECKED
 *   OFFLINE (always; this is the half that can gate a PR)
 *     1. `apps/examples.md` exists and parses.
 *     2. At least MIN_EXAMPLE_REPOS distinct `github.com/<owner>/<repo>` URLs
 *        are found on it. This is the POSITIVE CONTROL, built in: a parser that
 *        silently matches nothing passes forever and is indistinguishable from
 *        one wired to nothing, so a zero — or a near-zero — is red by
 *        construction rather than by luck. See the floor's note below.
 *
 *   NETWORK (skipped entirely under `--offline`)
 *     3. Every parsed repo resolves on the GitHub REST API, and:
 *        - HTTP 404 / 410               -> FAIL (deleted, or made private)
 *        - `full_name` != the page's    -> FAIL (RENAMED — see the banner above)
 *        - `archived: true`             -> FAIL (frozen; a reader cannot file an
 *                                          issue, open a PR, or trust it tracks
 *                                          the current SDK)
 *        - `private: true`              -> FAIL (belt-and-braces: anonymous CI
 *                                          sees a private repo as 404, but a run
 *                                          carrying a token that CAN see it must
 *                                          not report the page healthy for
 *                                          readers who cannot)
 *
 * 🔴 UNREACHABLE API -> LOUD SKIP, EXIT 0. STATED, NOT IMPLIED.
 * ------------------------------------------------------------
 * DNS failure, timeout, 5xx, and a 403/429 rate-limit all SKIP the affected
 * repo and the run exits 0 — matching check-appblocks-pins.mjs and
 * check-appblocks-cli-snapshot.mjs, and for the same reason: a connectivity
 * failure is not drift, and a guard that false-fails on someone else's outage
 * becomes a gate everybody learns to click through.
 *
 * What makes that honest rather than quiet is that it is never SILENT:
 *   - every skipped repo prints its own `⊘` line naming the reason;
 *   - the summary ALWAYS prints `checked / failed / skipped` counts, so a run
 *     that verified nothing says `0 checked`, not a bare "ok";
 *   - a run where EVERY repo was unreachable prints a banner saying in words
 *     that nothing was verified;
 *   - and the offline half above still ran, so "the page still names N repos"
 *     is asserted on every invocation regardless of the network.
 * A green run therefore always carries the number it is a claim about.
 * `GITHUB_TOKEN` is optional and lifts the shared-runner rate limit; absent, a
 * 403 skips rather than fails.
 *
 * DESIGN — TWO HALVES, TWO HOMES, ON THIS REPO'S OWN DOCTRINE
 * ----------------------------------------------------------
 * `appblocks-drift.yml`'s header states the rule: a guard that detects UPSTREAM
 * movement is unrelated to any given docs PR, so gating a PR on it would be a
 * permanently-red gate; a REPO-LOCAL invariant blocks a PR because it cannot
 * false-fail on someone else's action. This guard is both things at once, so it
 * is split rather than compromised:
 *   - `--offline` (checks 1–2) is repo-local -> runs on every PR, from
 *     `.github/workflows/example-apps.yml`. It imports only node builtins, so
 *     that job needs no `npm ci`.
 *   - the full run (checks 1–4) reads other people's repositories -> runs on the
 *     daily schedule, from `.github/workflows/appblocks-drift.yml`.
 *
 * USAGE
 *   npm run check:example-apps              # offline + network
 *   npm run check:example-apps -- --offline # parse + floor only, no network
 *
 *   EXAMPLE_APPS_PAGE=<path>   point the parse at a different markdown file
 *                              (used to drive the negative control against a
 *                              fixture; not used in CI)
 *   EXAMPLE_APPS_API=<base>    override the REST base (default api.github.com)
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** The page under guard. Overridable so the negative control can drive a fixture. */
export const PAGE = process.env.EXAMPLE_APPS_PAGE || 'apps/examples.md';

const API_BASE = process.env.EXAMPLE_APPS_API || 'https://api.github.com';

/**
 * The POSITIVE-CONTROL FLOOR.
 *
 * The page ships 8 repositories today. The floor is 6 — deliberate headroom on
 * BOTH sides, the same reasoning check-no-hand-flag-tables.mjs spells out for
 * its line floor:
 *
 *   Above it: 6 is far enough above 0 that the failure this exists to catch —
 *   a restructure that moves the links into a Vue component, a data file, or an
 *   HTML block the matcher does not see, leaving the guard scanning a page it
 *   no longer understands — trips instantly instead of passing forever with
 *   nothing to check. That failure is the one that is INVISIBLE otherwise: a
 *   zero and a clean bill of health print almost the same thing.
 *
 *   Below it: a floor pinned at 8 goes red the day somebody deliberately drops
 *   an example, which makes the removal look like a defect and teaches the next
 *   reader to edit the constant to get green. 6 leaves room to retire two.
 *
 * Raise it deliberately as the list grows; LOWER it deliberately, in the same
 * commit as the removal and with the reason in the message. Never edit it to
 * make a red run go green.
 */
export const MIN_EXAMPLE_REPOS = 6;

/**
 * Path segments that are NOT a GitHub owner. `github.com/<a>/<b>` is only a
 * repository when `<a>` is a real account, and the site reserves a pile of
 * top-level routes that have the same two-segment shape (`/orgs/civitai`,
 * `/topics/civitai-app-block`, `/apps/foo`). Treating one of those as a repo
 * would hand the API a 404 and fail the page for a link that is perfectly fine.
 */
const RESERVED_OWNERS = new Set([
  'about', 'account', 'apps', 'collections', 'contact', 'customer-stories',
  'dashboard', 'enterprise', 'explore', 'features', 'issues', 'join', 'login',
  'logout', 'marketplace', 'new', 'notifications', 'orgs', 'pricing', 'pulls',
  'readme', 'search', 'security', 'sessions', 'settings', 'signup', 'site',
  'sponsors', 'stars', 'topics', 'trending', 'users', 'watching',
]);

/** Repo names GitHub cannot issue, so a match on one is a parse artifact. */
const RESERVED_REPO_NAMES = new Set(['.', '..']);

/**
 * Extract every distinct `owner/repo` a GitHub URL on the page points at.
 *
 * Pure + exported so the regression controls can drive it with no network and
 * no filesystem. Deliberately WIDE: it matches a bare link, a markdown link
 * target, an inline autolink and an HTML `href`, because a guard that only sees
 * one spelling silently stops covering the page the first time someone reformats
 * a row.
 *
 * Normalisation, each for a real spelling that appears in the wild:
 *   - `http`/`https` and an optional `www.` host prefix;
 *   - a deep path (`/tree/main`, `/blob/main/README.md`, `/issues/12`) truncated
 *     to its first two segments — the REPO is what we verify, and a link into a
 *     file is still a claim that the repo exists at that path;
 *   - a trailing `.git`, `/`, or markdown/prose punctuation (`)`, `,`, `.`,
 *     `>`, `"`, `'`, `` ` ``) stripped off the repo name;
 *   - case preserved for the message, but deduped case-insensitively, because
 *     GitHub owner/repo lookups are case-insensitive and two spellings of one
 *     repo are one repo.
 *
 * @returns {{ owner: string, repo: string, full: string }[]} in first-seen order
 */
export function parseRepoUrls(markdown) {
  const found = new Map(); // lowercased "owner/repo" -> entry
  const re = /https?:\/\/(?:www\.)?github\.com\/([^\s)\]"'`<>]+)/gi;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const segments = m[1].split('/').filter(Boolean);
    if (segments.length < 2) continue;
    const owner = segments[0];
    // Trim prose/markdown punctuation that ran into the URL, then a `.git` suffix.
    const repo = segments[1].replace(/[).,>"'`]+$/, '').replace(/\.git$/i, '');
    if (!owner || !repo) continue;
    if (RESERVED_OWNERS.has(owner.toLowerCase())) continue;
    if (RESERVED_REPO_NAMES.has(repo)) continue;
    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    if (!found.has(key)) found.set(key, { owner, repo, full: `${owner}/${repo}` });
  }
  return [...found.values()];
}

/**
 * Classify one API result for one page entry. Pure + exported: this is the
 * function the negative control proves can go red, without a network round-trip.
 *
 * 🔴 The `full_name` comparison is the load-bearing line in this file. `ok`
 * being true is NOT evidence the repo lives at the URL the page spells — see
 * the banner at the top. Do not "simplify" this to a status check.
 *
 * @returns {{ verdict: 'ok'|'fail'|'skip', reason?: string, hint?: string }}
 */
export function classifyRepo(entry, result) {
  if (!result.ok) {
    if (result.status === 404 || result.status === 410) {
      return {
        verdict: 'fail',
        reason: `HTTP ${result.status} — no public repository at github.com/${entry.full}`,
        hint: 'it was deleted, or made private. Remove the row, or point it at the live repo.',
      };
    }
    return { verdict: 'skip', reason: result.reason };
  }

  const remote = result.body?.full_name;
  if (typeof remote !== 'string' || !remote.includes('/')) {
    return { verdict: 'skip', reason: 'API response carried no usable full_name' };
  }

  if (remote.toLowerCase() !== entry.full.toLowerCase()) {
    return {
      verdict: 'fail',
      reason: `RENAMED — the API redirected github.com/${entry.full} to ${remote}`,
      hint: `update the page to https://github.com/${remote}. GitHub releases the old path as soon as anyone else claims it, at which point this link points at a stranger's repo.`,
    };
  }

  if (result.body?.private === true) {
    return {
      verdict: 'fail',
      reason: `github.com/${entry.full} is PRIVATE`,
      hint: 'this run can see it because it carries a token; a reader following the link cannot. Make it public or drop the row.',
    };
  }

  if (result.body?.archived === true) {
    return {
      verdict: 'fail',
      reason: `github.com/${entry.full} is ARCHIVED`,
      hint: 'an archived repo is read-only — no issues, no PRs, and no sign it tracks the current SDK. Unarchive it or drop the row.',
    };
  }

  return { verdict: 'ok' };
}

/** GET one repository. Never throws; transient failures come back as `ok:false` without a status. */
async function fetchRepo(entry, fetchImpl = fetch) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'civitai-developer-docs-example-apps-guard',
  };
  // Optional — an Actions-provided token lifts the shared-IP rate limit. Absent,
  // a 403 rate-limit SKIPs (loudly) rather than false-failing.
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const url = `${API_BASE}/repos/${entry.owner}/${entry.repo}`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers });
    if (!res.ok) {
      if (res.status === 404 || res.status === 410) return { ok: false, status: res.status };
      // 403/429 are the rate limit; 5xx is an outage. Neither is drift.
      return { ok: false, reason: `HTTP ${res.status} from ${url}` };
    }
    return { ok: true, body: await res.json() };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function resolvePage() {
  return isAbsolute(PAGE) ? PAGE : join(repoRoot, PAGE);
}

async function main(argv = process.argv.slice(2)) {
  const offline = argv.includes('--offline');

  console.log(`Example App Blocks guard — ${PAGE}${offline ? ' (offline: parse + floor only)' : ''}\n`);

  // ---- OFFLINE HALF -------------------------------------------------------
  const pagePath = resolvePage();
  if (!existsSync(pagePath)) {
    console.error(`  ✗ page MISSING at ${PAGE}`);
    console.error('    the civitai CLI agents block links readers here; a missing page is a dead link');
    console.error('    on every scaffolded project. Restore it, or update PAGE in this script.');
    process.exit(1);
  }

  const entries = parseRepoUrls(readFileSync(pagePath, 'utf8'));
  console.log(`  ${PAGE} names ${entries.length} distinct GitHub repositories (floor: ${MIN_EXAMPLE_REPOS})`);

  if (entries.length < MIN_EXAMPLE_REPOS) {
    console.error(`\n  ✗ FLOOR BREACHED — found ${entries.length}, expected at least ${MIN_EXAMPLE_REPOS}`);
    console.error('    Either examples were removed (lower MIN_EXAMPLE_REPOS in the same commit, with');
    console.error('    the reason in the message), or — far more likely — the page was restructured and');
    console.error('    this guard is no longer looking at the links. A guard that parses zero URLs passes');
    console.error('    forever; that is what this floor exists to make impossible.');
    process.exit(1);
  }

  if (offline) {
    console.log(`\nOffline checks passed: page present, ${entries.length} repositories parsed (>= ${MIN_EXAMPLE_REPOS}).`);
    console.log('Repository liveness (404 / rename / archived) is the scheduled half — not checked here.');
    return;
  }

  // ---- NETWORK HALF -------------------------------------------------------
  console.log('');
  const failures = [];
  const skipped = [];
  let ok = 0;

  for (const entry of entries) {
    const cls = classifyRepo(entry, await fetchRepo(entry));
    if (cls.verdict === 'ok') {
      console.log(`  ✓ ${entry.full}`);
      ok++;
    } else if (cls.verdict === 'skip') {
      console.log(`  ⊘ ${entry.full} — ${cls.reason} — could not verify (skip, no false-fail)`);
      skipped.push({ entry, ...cls });
    } else {
      console.log(`  ✗ ${entry.full} — ${cls.reason}`);
      failures.push({ entry, ...cls });
    }
  }

  // ALWAYS printed, and always carrying the numbers the verdict is about: a run
  // that verified nothing must say `0 checked`, never a bare "ok".
  console.log(
    `\nRepositories: ${entries.length} listed · ${ok} verified live · ${failures.length} rotted · ${skipped.length} unverified (API unreachable)`,
  );

  if (failures.length) {
    console.error('\n--- EXAMPLE APP ROT: a repository this page names is gone, renamed or frozen ---');
    console.error(`${PAGE} is the ONE URL the civitai CLI's agents block points at instead of embedding`);
    console.error('a repo list in every scaffolded project, so a dead row here reaches every reader.');
    for (const f of failures) {
      console.error(`  - ${f.entry.full}: ${f.reason}`);
      if (f.hint) console.error(`      ${f.hint}`);
    }
    process.exit(1);
  }

  if (skipped.length === entries.length) {
    console.log('\n--- NOTHING WAS VERIFIED ---');
    console.log(`The GitHub API was unreachable for all ${entries.length} repositories, so this run made NO`);
    console.log('claim about whether any of them still exists. Exiting 0 because a connectivity failure is');
    console.log('not drift — but do not read this run as a clean bill of health. Re-run it, or set');
    console.log('GITHUB_TOKEN if the cause was the unauthenticated rate limit.');
    return;
  }

  if (skipped.length) {
    console.log(`\nNote: ${skipped.length} of ${entries.length} could not be reached and were NOT verified this run.`);
  }
}

// Run only when invoked directly (not when imported for the exported helpers).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`check-example-apps: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  });
}
