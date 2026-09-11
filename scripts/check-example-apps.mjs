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
 *   SELF-TEST (always, first, before any verdict about the page)
 *     0. PARSE_FIXTURES and CLASSIFY_FIXTURES: the parser still reads a URL the
 *        way a reader does, and the classifier still reaches the verdict the
 *        contract says. Pure, no network, no filesystem. The RENAMED rows are
 *        the mutation test for the `full_name` comparison — see the block above
 *        `PARSE_FIXTURES` for the measurement that made them necessary.
 *
 *   OFFLINE (always; this is the half that can gate a PR)
 *     1. `apps/examples.md` exists and parses.
 *     2. At least MIN_EXAMPLE_REPOS distinct `github.com/<owner>/<repo>` URLs
 *        are found on it. This is the POSITIVE CONTROL, built in: a parser that
 *        silently matches nothing passes forever and is indistinguishable from
 *        one wired to nothing, so a zero — or a near-zero — is red by
 *        construction rather than by luck. See the floor's note below.
 *     3. The page's own claims about itself agree with what it links: every
 *        count it states ("eight", "all eight", the ZacxDev/civitai account
 *        split, the restated floor), and every same-page `#anchor` resolving to
 *        a heading that is still there. Nothing else reads those, and VitePress
 *        checks routes rather than fragments.
 *
 *   NETWORK (skipped entirely under `--offline`)
 *     4. Every parsed repo resolves on the GitHub REST API, and:
 *        - HTTP 404 / 410               -> FAIL (deleted, or made private)
 *        - HTTP 451                     -> FAIL (legal takedown; terminal, so it
 *                                          must not sit in the skip branch)
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
 *   - `--offline` (checks 0–3) is repo-local -> runs on every PR, from
 *     `.github/workflows/example-apps.yml`. It imports only node builtins, so
 *     that job needs no `npm ci`.
 *   - the full run (checks 0–4) reads other people's repositories -> runs on the
 *     daily schedule, from `.github/workflows/appblocks-drift.yml`.
 *
 * 🔴 NO node_modules IMPORTS. example-apps.yml runs this with NO `npm ci` on
 * purpose (its comment says so in as many words), so the self-test above lives
 * in this file as plain exported tables rather than in a test runner. Adding an
 * import from node_modules breaks the PR gate with MODULE_NOT_FOUND.
 *
 * USAGE
 *   npm run check:example-apps              # self-test + page + network
 *   npm run check:example-apps -- --offline # self-test + page only, no network
 *
 *   EXAMPLE_APPS_PAGE=<path>   point the page checks at a different markdown
 *                              file — how the controls in this file's own
 *                              red/green matrix were driven; not used in CI
 *   EXAMPLE_APPS_API=<base>    override the REST base (default api.github.com)
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/**
 * The page under guard. Overridable so a control can be driven against a fixture
 * page — that is how the red/green matrix for the checks below was produced.
 */
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
 * Pure + exported so PARSE_FIXTURES below can drive it with no network and no
 * filesystem — a table that runs on every invocation, not a test file somebody
 * has to remember to run. Deliberately WIDE: it matches a bare link, a markdown link
 * target, an inline autolink and an HTML `href`, because a guard that only sees
 * one spelling silently stops covering the page the first time someone reformats
 * a row.
 *
 * Normalisation, each for a real spelling that appears in the wild:
 *   - `http`/`https` and an optional `www.` host prefix;
 *   - a `?query` or `#fragment` cut off BEFORE the path is split, per RFC 3986:
 *     neither is part of the path, and both arrive constantly because
 *     `…/repo?tab=readme-ov-file` is literally what GitHub's "copy link" button
 *     produces from a README tab, and `…/repo#readme` is what its own in-page
 *     anchors produce;
 *   - a deep path (`/tree/main`, `/blob/main/README.md`, `/issues/12`) truncated
 *     to its first two segments — the REPO is what we verify, and a link into a
 *     file is still a claim that the repo exists at that path;
 *   - a trailing `.git`, and everything from the first character GitHub cannot
 *     issue in a name, dropped off the owner and the repo;
 *   - case preserved for the message, but deduped case-insensitively, because
 *     GitHub owner/repo lookups are case-insensitive and two spellings of one
 *     repo are one repo.
 *
 * 🔴 THE PUNCTUATION RULE IS STRUCTURAL, NOT A LIST — AND THAT IS THE FIX FOR A
 * REAL FALSE-FAIL. It used to strip an enumerated set (`)`, `,`, `.`, `>`, `"`,
 * `'`, `` ` ``), which is a guard spelled rather than stated: every character
 * nobody thought of — `#`, `?`, `;`, `:`, `!`, `’`, `”`, an em dash — survived
 * into the repo name, and the guard then reported the page RENAMED and exited 1
 * naming a repository that was never there. A maintainer following the remedy
 * would have been told to change the URL to the one they already had.
 *
 * So the rule is the one GitHub itself enforces: an owner is
 * `[A-Za-z0-9-]`, a repository is `[A-Za-z0-9._-]`, and the name ends at the
 * first character outside that set. That cannot be out-spelled, because it
 * enumerates what is ALLOWED rather than what is stripped. The cost is stated
 * and accepted: a link whose repo segment is genuinely misspelled with a legal
 * character is still read as a repo and still fails on the API, which is
 * correct.
 *
 * @returns {{ owner: string, repo: string, full: string }[]} in first-seen order
 */
export function parseRepoUrls(markdown) {
  const found = new Map(); // lowercased "owner/repo" -> entry
  const re = /https?:\/\/(?:www\.)?github\.com\/([^\s)\]"'`<>]+)/gi;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    // Query and fragment are not path. Cut them before splitting, or
    // `…/app-panorama-360?tab=readme-ov-file` becomes a repository name.
    const path = m[1].split('#')[0].split('?')[0];
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) continue;
    // End each name at the first character GitHub cannot issue in one, then
    // drop a `.git` clone suffix and any trailing `.` a sentence ran in.
    const owner = segments[0].replace(/[^A-Za-z0-9-].*$/s, '');
    const repo = segments[1]
      .replace(/[^A-Za-z0-9._-].*$/s, '')
      .replace(/\.git$/i, '')
      .replace(/\.+$/, '');
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
 * function CLASSIFY_FIXTURES below proves can go red, on every invocation and
 * without a network round-trip.
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
    // 451 is GitHub's DMCA / legal takedown. It is as terminal as a 404 — the
    // repository is gone and is not coming back on a retry — so it must not sit
    // in the transient branch below, where it would skip quietly forever and a
    // reader would keep following a link to a takedown notice.
    if (result.status === 451) {
      return {
        verdict: 'fail',
        reason: `HTTP 451 — github.com/${entry.full} is UNAVAILABLE FOR LEGAL REASONS (takedown)`,
        hint: 'a reader following this link gets a takedown notice, not code. Drop the row.',
      };
    }
    // 🔴 KNOWN RESIDUAL, deliberately left open: a 403 that is NOT the rate
    // limit (a blocked or suspended account) also lands here and skips forever.
    // Separating the two means reading `x-ratelimit-remaining`, and a secondary
    // / abuse-detection 403 carries no reliable discriminator — so the choice is
    // between a permanent quiet skip and a false-fail on somebody else's
    // throttling. This file's doctrine picks the skip, loudly, every time.
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

// ---------------------------------------------------------------------------
// THE SELF-TEST. Runs on EVERY invocation, before anything else — the offline
// PR half and the scheduled network half alike.
//
// 🔴 WHY IT EXISTS, MEASURED. Until this landed, the doc comments above claimed
// "the negative control" and "the regression controls" as though such a thing
// existed. It did not: nothing in the repository imported `parseRepoUrls` or
// `classifyRepo`, nothing set EXAMPLE_APPS_PAGE, and there was no fixture and no
// test file. The load-bearing line — the `full_name` comparison that is the
// entire reason this guard is not a status check — had ZERO coverage, and that
// was demonstrated rather than argued: replacing it with `if (false && …)`, the
// exact "simplify it to a status check" the banner at the top of this file
// forbids, left the PR gate at rc=0, the daily half at rc=0 reporting
// `8 listed · 8 verified live · 0 rotted`, and a `facebook/jest` probe (renamed
// to `jestjs/jest`) printing `✓`. Every check this repository can run stayed
// green while the guard asserted nothing.
//
// So the mutant must now DIE, and it must die on a run that touches no network
// and no filesystem. That is what CLASSIFY_FIXTURES' `RENAMED` rows do.
// ---------------------------------------------------------------------------

/**
 * Inputs the parser must read the same way a human does.
 *
 * Every `expect` is written from what the LINK MEANS, never from what the
 * current implementation returns. The `?query` / `#fragment` rows are not
 * hypothetical: `…/app-panorama-360?tab=readme-ov-file` is what GitHub's own
 * "copy link" button produces on a README tab, and before the parse was fixed it
 * made this guard print `✗ RENAMED` and exit 1 against a page that was correct —
 * a false-fail, the one failure mode the doctrine at the top of this file says
 * this guard must not have.
 */
export const PARSE_FIXTURES = [
  { name: 'bare link', md: 'https://github.com/civitai/cli', expect: ['civitai/cli'] },
  { name: 'markdown link target', md: '[cli](https://github.com/civitai/cli)', expect: ['civitai/cli'] },
  { name: 'html href', md: '<a href="https://github.com/civitai/cli">cli</a>', expect: ['civitai/cli'] },
  { name: 'autolink', md: '<https://github.com/civitai/cli>', expect: ['civitai/cli'] },
  { name: 'www host prefix', md: 'https://www.github.com/civitai/cli', expect: ['civitai/cli'] },
  { name: 'http scheme', md: 'http://github.com/civitai/cli', expect: ['civitai/cli'] },
  { name: 'deep path truncated to owner/repo', md: 'https://github.com/civitai/cli/blob/main/README.md', expect: ['civitai/cli'] },
  { name: '.git clone suffix', md: 'https://github.com/civitai/cli.git', expect: ['civitai/cli'] },
  { name: 'trailing slash', md: 'https://github.com/civitai/cli/', expect: ['civitai/cli'] },
  { name: 'case-insensitive dedupe', md: 'https://github.com/Civitai/CLI https://github.com/civitai/cli', expect: ['Civitai/CLI'] },
  { name: 'reserved owner (/topics/…) is not a repo', md: 'https://github.com/topics/civitai-app-block', expect: [] },
  { name: 'one segment is not a repo', md: 'https://github.com/civitai', expect: [] },
  // -- the false-fail family: everything the old enumerated strip did not know --
  { name: '?query — GitHub "copy link" from a README tab', md: 'https://github.com/civitai/app-panorama-360?tab=readme-ov-file', expect: ['civitai/app-panorama-360'] },
  { name: '#fragment', md: 'https://github.com/civitai/cli#readme', expect: ['civitai/cli'] },
  { name: '?query on a deep path', md: 'https://github.com/civitai/cli/issues?q=is%3Aopen', expect: ['civitai/cli'] },
  { name: 'sentence-final full stop', md: 'See https://github.com/civitai/cli.', expect: ['civitai/cli'] },
  { name: 'trailing comma', md: 'https://github.com/civitai/cli, and more', expect: ['civitai/cli'] },
  { name: 'trailing semicolon', md: 'https://github.com/civitai/cli; next', expect: ['civitai/cli'] },
  { name: 'trailing colon', md: 'https://github.com/civitai/cli: read it', expect: ['civitai/cli'] },
  { name: 'trailing exclamation mark', md: 'https://github.com/civitai/cli!', expect: ['civitai/cli'] },
  { name: 'typographic right single quote', md: 'https://github.com/civitai/cli’s harness', expect: ['civitai/cli'] },
  { name: 'typographic right double quote', md: '“https://github.com/civitai/cli”', expect: ['civitai/cli'] },
  { name: 'em dash run-on', md: 'https://github.com/civitai/cli—read it', expect: ['civitai/cli'] },
  { name: 'legal dots and underscores survive', md: 'https://github.com/civitai/my_app.v2-beta', expect: ['civitai/my_app.v2-beta'] },
  // NEGATIVE CONTROL. A parser that "helpfully" matched any URL, or read prose
  // as links, would satisfy every positive row above and make the floor
  // meaningless.
  { name: 'negative control — a non-GitHub host', md: 'https://gitlab.com/civitai/cli', expect: [] },
  { name: 'negative control — prose naming a repo with no URL', md: 'the civitai/cli repository', expect: [] },
];

/**
 * Verdicts the classifier must reach. Row 3 is the one that matters: it is the
 * mutation test for the `full_name` comparison, run on every invocation.
 */
export const CLASSIFY_FIXTURES = [
  {
    name: 'live public repo -> ok',
    entry: { owner: 'civitai', repo: 'cli', full: 'civitai/cli' },
    result: { ok: true, body: { full_name: 'civitai/cli' } },
    expect: 'ok',
  },
  {
    name: 'case differs only -> ok (GitHub lookups are case-insensitive)',
    entry: { owner: 'Civitai', repo: 'CLI', full: 'Civitai/CLI' },
    result: { ok: true, body: { full_name: 'civitai/cli' } },
    expect: 'ok',
  },
  {
    // 🔴 THE MUTATION TEST. `if (false && …)` on the full_name comparison turns
    // this row's verdict from 'fail' to 'ok' and reddens this table. Measured:
    // that mutant previously survived the entire repository.
    name: 'RENAMED — 200 OK, body names somewhere else -> fail',
    entry: { owner: 'facebook', repo: 'jest', full: 'facebook/jest' },
    result: { ok: true, body: { full_name: 'jestjs/jest' } },
    expect: 'fail',
    reasonIncludes: 'RENAMED',
  },
  {
    name: 'RENAMED — owner changed, repo name identical -> fail',
    entry: { owner: 'ZacxDev', repo: 'civitai-app-sensei', full: 'ZacxDev/civitai-app-sensei' },
    result: { ok: true, body: { full_name: 'someone-else/civitai-app-sensei' } },
    expect: 'fail',
    reasonIncludes: 'RENAMED',
  },
  {
    name: 'HTTP 404 -> fail',
    entry: { owner: 'civitai', repo: 'gone', full: 'civitai/gone' },
    result: { ok: false, status: 404 },
    expect: 'fail',
    reasonIncludes: '404',
  },
  {
    name: 'HTTP 410 -> fail',
    entry: { owner: 'civitai', repo: 'gone', full: 'civitai/gone' },
    result: { ok: false, status: 410 },
    expect: 'fail',
    reasonIncludes: '410',
  },
  {
    name: 'HTTP 451 takedown -> fail (terminal, not transient)',
    entry: { owner: 'civitai', repo: 'dmca', full: 'civitai/dmca' },
    result: { ok: false, status: 451 },
    expect: 'fail',
    reasonIncludes: '451',
  },
  {
    name: 'archived -> fail',
    entry: { owner: 'civitai', repo: 'old', full: 'civitai/old' },
    result: { ok: true, body: { full_name: 'civitai/old', archived: true } },
    expect: 'fail',
    reasonIncludes: 'ARCHIVED',
  },
  {
    name: 'private -> fail',
    entry: { owner: 'civitai', repo: 'secret', full: 'civitai/secret' },
    result: { ok: true, body: { full_name: 'civitai/secret', private: true } },
    expect: 'fail',
    reasonIncludes: 'PRIVATE',
  },
  {
    name: 'rate limit / outage -> skip, never fail',
    entry: { owner: 'civitai', repo: 'cli', full: 'civitai/cli' },
    result: { ok: false, reason: 'HTTP 403 from api.github.com' },
    expect: 'skip',
  },
  {
    name: 'unusable body -> skip, never fail',
    entry: { owner: 'civitai', repo: 'cli', full: 'civitai/cli' },
    result: { ok: true, body: {} },
    expect: 'skip',
  },
];

/** Failures from the two tables above; empty when both still assert what they say. */
export function runSelfTest() {
  const failures = [];

  for (const f of PARSE_FIXTURES) {
    const got = parseRepoUrls(f.md).map((e) => e.full);
    if (got.join('|') !== f.expect.join('|')) {
      failures.push(
        `PARSE — ${f.name}\n` +
          `      input:    ${JSON.stringify(f.md)}\n` +
          `      expected: [${f.expect.join(', ')}]\n` +
          `      got:      [${got.join(', ')}]\n` +
          `      A parser that reads a repository name wrong reports the page RENAMED and exits 1\n` +
          `      against a page that is correct. Fix parseRepoUrls; do not delete the case.`,
      );
    }
  }

  for (const f of CLASSIFY_FIXTURES) {
    const cls = classifyRepo(f.entry, f.result);
    if (cls.verdict !== f.expect) {
      failures.push(
        `CLASSIFY — ${f.name}\n` +
          `      expected verdict "${f.expect}", got "${cls.verdict}"${cls.reason ? ` (${cls.reason})` : ''}\n` +
          `      This table IS the mutation test for the full_name comparison — the load-bearing\n` +
          `      line this whole file exists for. A 200 OK is NOT evidence the repository lives\n` +
          `      where the page says; see the banner at the top before changing classifyRepo.`,
      );
    } else if (f.reasonIncludes && !(cls.reason ?? '').includes(f.reasonIncludes)) {
      failures.push(
        `CLASSIFY — ${f.name}\n` +
          `      verdict was "${cls.verdict}" as expected, but its reason does not name ` +
          `${JSON.stringify(f.reasonIncludes)}: ${JSON.stringify(cls.reason ?? '')}\n` +
          `      The reason IS the remedy a maintainer acts on, and a right verdict reached for\n` +
          `      the wrong cause is how a green row stops meaning anything.`,
      );
    }
  }

  // CONTROLS ON THE TABLE ITSELF. A table graded only on passing input is a
  // table wired to nothing; these floors are what make the count above a claim.
  const parseNegatives = PARSE_FIXTURES.filter((f) => f.expect.length === 0).length;
  const classifyFails = CLASSIFY_FIXTURES.filter((f) => f.expect === 'fail').length;
  const classifyOks = CLASSIFY_FIXTURES.filter((f) => f.expect === 'ok').length;
  const renames = CLASSIFY_FIXTURES.filter((f) => f.reasonIncludes === 'RENAMED').length;
  if (parseNegatives < 2 || classifyFails < 4 || classifyOks < 2 || renames < 1) {
    failures.push(
      `SELF-TEST DEGENERATE — the fixture tables lost their controls ` +
        `(${parseNegatives} parse negatives, ${classifyOks} must-ok, ${classifyFails} must-fail, ` +
        `${renames} RENAMED row(s)).\n` +
        `      At least one RENAMED row is mandatory: it is the only thing in this repository that\n` +
        `      kills the "simplify it to a status check" mutant.`,
    );
  }

  return failures;
}

// ---------------------------------------------------------------------------
// THE PAGE'S CLAIMS ABOUT ITSELF.
//
// 🔴 THE DEFECT THIS CLOSES, MEASURED. Deleting one example section from
// apps/examples.md passed BOTH CI halves green: the offline gate printed
// `7 repositories parsed (>= 6)` and exited 0, the daily half verified the
// remaining seven live, and three "eight" strings plus a Pick-one table row
// pointing at the now-deleted `#panorama-360` anchor survived untouched.
// Nothing read those numerals, and VitePress does not flag a dead IN-PAGE
// anchor. So the page could go on telling a reader — and an agent — that it
// names eight repositories while naming seven, and offer a link to a section
// that is not there.
//
// Both checks are REPO-LOCAL: they read one committed file and nothing else, so
// they belong on the PR half, and they cannot false-fail on anybody's action but
// ours.
// ---------------------------------------------------------------------------

const NUMBER_WORDS = new Map([
  ['zero', 0], ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5],
  ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10],
  ['eleven', 11], ['twelve', 12], ['thirteen', 13], ['fourteen', 14],
  ['fifteen', 15], ['sixteen', 16], ['seventeen', 17], ['eighteen', 18],
  ['nineteen', 19], ['twenty', 20],
]);

/** `"eight"` / `"8"` -> 8; anything else -> null. */
function cardinal(token) {
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS.get(token.toLowerCase()) ?? null;
}

/**
 * How many claims about its own size the page must state, so a matcher that
 * silently stopped matching cannot read as "the page makes no claims".
 *
 * Five exist today (the intro, the account split, the Verified line, the
 * "Keeping this list honest" sentence and the floor restatement). The floor is
 * 4: headroom to drop one sentence deliberately, no headroom to lose all of
 * them silently. If a reword breaks a pattern, WIDEN THE PATTERN — editing this
 * constant down to get green is how the whole check evaporates.
 */
const MIN_PAGE_CLAIMS = 4;

/**
 * Grade every count the page states about itself against what it actually
 * links. Returns `{ claims, failures }`.
 *
 * Each pattern's first capture is a cardinal — a word or a numeral, because both
 * spellings appear on the page — and each is keyed to a DIFFERENT expected
 * value, so a fixture cannot satisfy them all by accident:
 *   - the total number of distinct repositories parsed;
 *   - the split BY OWNER (`seven … ZacxDev … one … civitai`), which is a claim
 *     about the set's composition and not merely its size;
 *   - MIN_EXAMPLE_REPOS, the floor this script enforces, restated in prose.
 */
export function checkPageClaims(markdown, entries) {
  const prose = markdown.replace(/\s+/g, ' ');
  const total = entries.length;
  const byOwner = new Map();
  for (const e of entries) {
    const k = e.owner.toLowerCase();
    byOwner.set(k, (byOwner.get(k) ?? 0) + 1);
  }

  const failures = [];
  let claims = 0;
  const repos = (n) => `${n} repositor${n === 1 ? 'y' : 'ies'}`;

  // The cardinal alternation is BUILT FROM `NUMBER_WORDS`, not spelled as
  // `[a-z]+`. A loose capture matches the wrong word and then grades it: "A
  // handful of Civitai App Blocks" captured `of` and reported that the page
  // "says of, but there are 8" — a real red for an unreal reason. Only a token
  // that IS a number can be a count claim; anything else is not a claim at all,
  // and the floor below is what notices they have all gone.
  const CARDINAL = `(?:${[...NUMBER_WORDS.keys()].join('|')}|\\d+)`;
  const rx = (source, flags = 'i') => new RegExp(source.replace(/#N#/g, `(${CARDINAL})`), flags);

  const single = [
    {
      re: rx('\\b#N# Civitai App Blocks\\b'),
      what: 'the opening sentence',
      want: () => total,
      unit: 'repositories linked on the page',
    },
    {
      re: rx('\\ball #N# are public\\b'),
      what: 'the Verified line',
      want: () => total,
      unit: 'repositories linked on the page',
    },
    {
      re: rx('\\bnaming #N# repositories\\b'),
      what: '"Keeping this list honest"',
      want: () => total,
      unit: 'repositories linked on the page',
    },
    {
      re: rx('\\bat least #N# repositories\\b'),
      what: 'the restated floor',
      want: () => MIN_EXAMPLE_REPOS,
      unit: 'MIN_EXAMPLE_REPOS in this script',
    },
  ];

  for (const c of single) {
    const m = prose.match(c.re);
    if (!m) continue;
    claims++;
    const got = cardinal(m[1]);
    const want = c.want();
    if (got !== want) {
      failures.push(
        `${c.what} says "${m[0].trim()}", but there are ${want} ${c.unit}.\n` +
          `      Update the prose in the same commit as the list. Nothing else reads these numerals,\n` +
          `      which is exactly why they rot.`,
      );
    }
  }

  // The composition claim: "seven live on the personal account `ZacxDev` and one
  // under the `civitai` organization". Graded against the parsed OWNERS, so it
  // pins which accounts the examples come from, not just how many there are.
  const split = prose.match(
    rx('\\b#N# live on the personal account `?([A-Za-z0-9-]+)`? and #N# under the `?([A-Za-z0-9-]+)`?'),
  );
  if (split) {
    claims++;
    const pairs = [
      [cardinal(split[1]), split[2]],
      [cardinal(split[3]), split[4]],
    ];
    for (const [n, owner] of pairs) {
      const actual = byOwner.get(owner.toLowerCase()) ?? 0;
      if (n !== actual) {
        failures.push(
          `the account split claims ${repos(n)} under \`${owner}\`, but the page links ${actual}.`,
        );
      }
    }
    const covered = pairs.reduce((s, [n]) => s + n, 0);
    if (covered !== total) {
      failures.push(
        `the account split accounts for ${repos(covered)}, but the page links ${total}. ` +
          `Every example belongs to one of the named accounts or the sentence is wrong.`,
      );
    }
  }

  // POSITIVE CONTROL. Zero claims matched and a page that states nothing about
  // itself print the same thing, and only one of those is a real state.
  if (claims < MIN_PAGE_CLAIMS) {
    failures.push(
      `only ${claims} self-count claim(s) matched (floor ${MIN_PAGE_CLAIMS}) — the patterns in\n` +
        `      checkPageClaims no longer see the page's prose, so NONE of the numerals on it were\n` +
        `      graded this run. Widen the patterns to match the new wording; do not lower the floor.`,
    );
  }

  return { claims, failures };
}

/**
 * The slug VitePress gives a heading (`@mdit-vue/shared`'s `slugify`), plus the
 * explicit `{#anchor}` override the Apps guide already uses.
 */
export function headingSlug(heading) {
  const explicit = heading.match(/\{#([^}]+)\}\s*$/);
  if (explicit) return explicit[1];
  return heading
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

/**
 * Same-page anchors on the page that resolve to no heading on it.
 *
 * VitePress's dead-link checker resolves ROUTES; a `#fragment` into the page
 * you are already on is not a route, so a table row pointing at a section
 * somebody deleted builds clean and ships. That is the second half of the
 * measured defect above.
 */
const MIN_PAGE_ANCHORS = 8;

export function checkPageAnchors(markdown) {
  // Strip inline code and fenced blocks first — a `#` inside them is not a link.
  const body = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const slugs = new Set(
    [...body.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm)].map((m) => headingSlug(m[1])),
  );
  const anchors = [...body.matchAll(/\]\(#([^)\s]+)\)/g)].map((m) => m[1]);

  const failures = [];
  const dead = [...new Set(anchors.filter((a) => !slugs.has(a)))];
  if (dead.length) {
    failures.push(
      `${dead.length} in-page anchor(s) resolve to no heading: ${dead.map((d) => `#${d}`).join(', ')}\n` +
        `      VitePress checks ROUTES, not fragments, so a link to a section that was deleted or\n` +
        `      renamed builds clean and ships as a link that goes nowhere. Headings present: ` +
        `${[...slugs].slice(0, 12).join(', ')}${slugs.size > 12 ? ', …' : ''}`,
    );
  }

  // POSITIVE CONTROL, both sides: an extractor that stopped matching anchors,
  // and one that stopped matching headings, each report zero dead links.
  if (anchors.length < MIN_PAGE_ANCHORS) {
    failures.push(
      `only ${anchors.length} in-page anchor(s) found (floor ${MIN_PAGE_ANCHORS}) — the "Pick one"\n` +
        `      table is built out of them, so this is the extractor failing, not the page. Nothing\n` +
        `      was checked this run.`,
    );
  }
  if (slugs.size < 2) {
    failures.push(
      `only ${slugs.size} heading(s) parsed out of the page — the heading extractor broke, and\n` +
        `      every anchor would read as dead. Fix it before reading any verdict here.`,
    );
  }

  return { anchors: anchors.length, headings: slugs.size, failures };
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
      // Terminal statuses carry the code through so `classifyRepo` can FAIL on
      // them; everything else becomes a reason string and SKIPs.
      if (res.status === 404 || res.status === 410 || res.status === 451) {
        return { ok: false, status: res.status };
      }
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

  console.log(
    `Example App Blocks guard — ${PAGE}${offline ? ' (offline: self-test + page, no network)' : ''}\n`,
  );

  // ---- 0. THE INSTRUMENT ITSELF -------------------------------------------
  // Before any verdict about the page: the parser still parses and the
  // classifier still classifies. No network, no filesystem. A run that reaches
  // the page checks below has EARNED the right to be believed about them.
  const selfTest = runSelfTest();
  if (selfTest.length) {
    console.error('  ✗ SELF-TEST FAILED — this guard is broken, so it made no claim about the page\n');
    for (const f of selfTest) console.error(`    - ${f}`);
    process.exit(1);
  }
  const renameRows = CLASSIFY_FIXTURES.filter((f) => f.reasonIncludes === 'RENAMED').length;
  console.log(
    `  ✓ self-test: ${PARSE_FIXTURES.length} parse fixture(s) ` +
      `(${PARSE_FIXTURES.filter((f) => f.expect.length === 0).length} negative control(s)) · ` +
      `${CLASSIFY_FIXTURES.length} classify fixture(s) ` +
      `(${CLASSIFY_FIXTURES.filter((f) => f.expect === 'fail').length} must-FAIL, ` +
      `${renameRows} of them the RENAMED mutation test)`,
  );

  // ---- OFFLINE HALF -------------------------------------------------------
  const pagePath = resolvePage();
  if (!existsSync(pagePath)) {
    console.error(`  ✗ page MISSING at ${PAGE}`);
    console.error('    the civitai CLI agents block links readers here; a missing page is a dead link');
    console.error('    on every scaffolded project. Restore it, or update PAGE in this script.');
    process.exit(1);
  }

  const markdown = readFileSync(pagePath, 'utf8');
  const entries = parseRepoUrls(markdown);
  console.log(`  ${PAGE} names ${entries.length} distinct GitHub repositories (floor: ${MIN_EXAMPLE_REPOS})`);

  if (entries.length < MIN_EXAMPLE_REPOS) {
    console.error(`\n  ✗ FLOOR BREACHED — found ${entries.length}, expected at least ${MIN_EXAMPLE_REPOS}`);
    console.error('    Either examples were removed (lower MIN_EXAMPLE_REPOS in the same commit, with');
    console.error('    the reason in the message), or — far more likely — the page was restructured and');
    console.error('    this guard is no longer looking at the links. A guard that parses zero URLs passes');
    console.error('    forever; that is what this floor exists to make impossible.');
    process.exit(1);
  }

  // ---- 3. THE PAGE'S CLAIMS ABOUT ITSELF ----------------------------------
  // Repo-local, so it runs on the PR half too: removing an example must not be
  // able to leave "eight" in the prose and a Pick-one row pointing at a section
  // that no longer exists.
  const claims = checkPageClaims(markdown, entries);
  const anchors = checkPageAnchors(markdown);
  const pageFailures = [...claims.failures, ...anchors.failures];
  console.log(
    `  ${claims.claims} self-count claim(s) graded (floor ${MIN_PAGE_CLAIMS}) · ` +
      `${anchors.anchors} in-page anchor(s) across ${anchors.headings} heading(s)`,
  );
  if (pageFailures.length) {
    console.error(`\n  ✗ THE PAGE CONTRADICTS ITSELF — ${pageFailures.length} finding(s)`);
    for (const f of pageFailures) console.error(`    - ${f}`);
    console.error('');
    console.error('    These numerals and anchors are hand-written and nothing else reads them, so a');
    console.error('    removed or added example leaves them behind silently — the links keep checking');
    console.error('    out while the page tells a reader something untrue about itself.');
    process.exit(1);
  }

  if (offline) {
    console.log(`\nOffline checks passed: page present, ${entries.length} repositories parsed (>= ${MIN_EXAMPLE_REPOS}),`);
    console.log(`self-count claims agree, ${anchors.anchors} in-page anchors resolve.`);
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
