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
 *     5. Every SCOPES line on the page matches the repository's own
 *        `block.manifest.json`. See the SCOPES banner below.
 *
 * 🔴 THE PAGE'S MOST AUTHORITATIVE CONTENT USED TO BE ITS LEAST GUARDED
 * --------------------------------------------------------------------
 * `apps/examples.md` states, per repository, a SCOPES array and a HOOK list. An
 * audit read all eight against live source and found them exact — and that was a
 * ONE-TIME READ. Everything above it guarded URL LIVENESS: a repository can stay
 * public, unrenamed and unarchived while its manifest gains a scope, and the page
 * then tells a reader — and every agent the `civitai agent-setup` block points
 * here — something false about the privileged surface an example declares. All
 * eight repositories were pushed within days of the page being written, so drift
 * is likely and, until check 5, silent.
 *
 * SCOPES ARE NOW A CHECKED CLAIM; HOOKS ARE DATE-STAMPED. The split is
 * deliberate and it is about COST, not importance:
 *   - a manifest is ONE file at a known path holding a flat array, so checking it
 *     is one GET and a set comparison;
 *   - a hook list is what a repository IMPORTS, which means fetching and parsing
 *     a whole `src/` tree across eight repositories. That is disproportionate
 *     here, so the page carries a `Hook lists verified by hand on <date>` stamp
 *     instead and check 3b asserts the stamp is present, parseable and not in the
 *     future — the reader gets the AGE of the claim rather than a guarantee, and
 *     the guard's own summary prints that age on every run.
 *
 * 🔴 THE SCOPE COMPARISON IS A SET COMPARISON, AND THAT IS THE CLAIM THE PAGE
 * MAKES. The page says these are "the scopes its `block.manifest.json`
 * declares" — a statement about WHICH scopes, not about the order they appear
 * in the JSON. Reordering a manifest array leaves the page's sentence TRUE, so
 * failing on it would be a false-fail, and this file's doctrine picks a loud
 * skip over a false-fail every time. Measured 2026-09-11: all eight agree as
 * sets AND in order, so order drift is reported as a non-fatal `note` — visible
 * to anyone tidying the page, red for nobody.
 *
 * MANIFEST FETCHES ADD ZERO api.github.com CALLS, ON PURPOSE. They go to
 * `raw.githubusercontent.com`, a different host with a different budget, so the
 * run's api.github.com count stays at exactly one GET per repository and the
 * unauthenticated 60/hr shared-runner limit is no closer than it was. (Reading
 * them through `/repos/:o/:r/contents/` would have DOUBLED it.) Same doctrine on
 * failure: 403/429/5xx/timeout/DNS SKIP loudly, exit 0. A 404 on the manifest
 * does NOT skip — it is terminal, exactly like a 404 on the repository, and it
 * means the page's claim to have read that file cannot be true at that path.
 * Unparseable JSON, and a `scopes` key that is not an array, fail the same way:
 * a clear diagnosis, never a crash and never a silent pass.
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
 *   npm run check:example-apps -- --report <path>
 *                              also write a machine-readable JSON report, which
 *                              is what scripts/drift-notify.mjs turns into the
 *                              GitHub issue a scheduled red run would otherwise
 *                              announce to nobody. Written on EVERY exit path,
 *                              including a broken self-test — a run that made no
 *                              claim must be able to SAY so downstream.
 *
 *   EXAMPLE_APPS_PAGE=<path>   point the page checks at a different markdown
 *                              file — how the controls in this file's own
 *                              red/green matrix were driven; not used in CI
 *   EXAMPLE_APPS_API=<base>    override the REST base (default api.github.com)
 *   EXAMPLE_APPS_RAW=<base>    override the raw base (default
 *                              raw.githubusercontent.com), where the manifests
 *                              are read from
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
 * Where the per-repository manifests are read from. A DIFFERENT HOST from
 * API_BASE on purpose — see the SCOPES banner at the top: it keeps the
 * api.github.com call count at exactly one per repository, so adding check 5 did
 * not move this run one request closer to the unauthenticated 60/hr limit.
 */
const RAW_BASE = process.env.EXAMPLE_APPS_RAW || 'https://raw.githubusercontent.com';

/**
 * The path the page's own sentence names. NOT a search: a fallback that quietly
 * found a manifest somewhere else would make check 5 assert something other than
 * what the page says it read, and the run would print `✓` for a claim nobody
 * verified. If a repository moves its manifest, this guard's red IS the signal,
 * and the fix is a page edit (or a deliberate, reviewed change here).
 *
 * `HEAD` resolves to the default branch without a second request to learn its
 * name. Measured 2026-09-11: 200 on all eight repositories the page names.
 */
const MANIFEST_PATH = 'block.manifest.json';
const MANIFEST_REF = 'HEAD';

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
        kind: 'MISSING',
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
        kind: 'TAKEDOWN',
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
      kind: 'RENAMED',
      reason: `RENAMED — the API redirected github.com/${entry.full} to ${remote}`,
      hint: `update the page to https://github.com/${remote}. GitHub releases the old path as soon as anyone else claims it, at which point this link points at a stranger's repo.`,
    };
  }

  if (result.body?.private === true) {
    return {
      verdict: 'fail',
      kind: 'PRIVATE',
      reason: `github.com/${entry.full} is PRIVATE`,
      hint: 'this run can see it because it carries a token; a reader following the link cannot. Make it public or drop the row.',
    };
  }

  if (result.body?.archived === true) {
    return {
      verdict: 'fail',
      kind: 'ARCHIVED',
      reason: `github.com/${entry.full} is ARCHIVED`,
      hint: 'an archived repo is read-only — no issues, no PRs, and no sign it tracks the current SDK. Unarchive it or drop the row.',
    };
  }

  return { verdict: 'ok' };
}

// ---------------------------------------------------------------------------
// CHECK 5 — THE SCOPES THE PAGE STATES, AND THE HOOK LISTS IT CANNOT CHECK.
// Read the SCOPES banner at the top of this file first: it states why scopes are
// verified and hooks are date-stamped, and why the comparison is a SET
// comparison rather than a sequence one.
// ---------------------------------------------------------------------------

/**
 * A scope string as the platform spells one: lowercase colon-separated segments
 * (`ai:write:budgeted`, `user:read:self`, `apps:storage:shared:write`).
 *
 * 🔴 THIS IS A GUARD ON THE PARSER, NOT A VALIDATION OF THE PLATFORM'S SCOPE
 * REGISTRY. Its job is to notice when the line matcher below has walked onto the
 * WRONG LINE — the `**Hooks**` bullet sits directly under the `**Scopes**` one
 * and is also a list of backticked tokens, so a one-character drift in the
 * matcher silently starts grading `useSharedStorage` against a manifest. That
 * failure would otherwise read as "the manifest is missing every scope", which
 * points a maintainer at eight upstream repositories instead of at this file.
 */
const SCOPE_TOKEN_RE = /^[a-z][a-z0-9]*(?::[a-z0-9]+)+$/;

/** Every backticked token on one line, in order. */
function backtickedTokens(line) {
  return [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

/**
 * Split the page into its per-example `###` sections and read, for each, the
 * repository it links and the claims it makes about that repository.
 *
 * Pure + exported so SECTION_FIXTURES can drive it with no filesystem. Both
 * bullet spellings are matched because the page genuinely carries both, and the
 * second one is not an oversight: `civitai/app-panorama-360` imports NO hooks at
 * all — it drives the transport directly — so its section states an
 * `**SDK surface**` instead. A guard that demanded `**Hooks**` everywhere would
 * be red on a page that is correct, so the requirement below is "one of the
 * two", which is the claim the page actually makes.
 *
 * @returns {{ heading: string, anchor: string, repo: {owner,repo,full}|null,
 *             scopes: string[]|null, hasSurfaceLine: boolean }[]}
 */
export function parseExampleSections(markdown) {
  const sections = [];
  // Split on H3 headings; `parts` is [preamble, h1, body1, h2, body2, …].
  const parts = markdown.split(/^###[ \t]+(.+?)[ \t]*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i];
    const body = parts[i + 1] ?? '';
    const repos = parseRepoUrls(body);
    // The em dash the page uses, a plain hyphen, and an en dash — the three
    // spellings a reader or an editor's autocorrect will produce.
    const scopeLine = body.match(/^[ \t]*[-*][ \t]+\*\*Scopes\*\*[ \t]*[—–-][ \t]*(.+)$/m);
    const surfaceLine = /^[ \t]*[-*][ \t]+\*\*(?:Hooks|SDK surface)\*\*[ \t]*[—–-]/m.test(body);
    sections.push({
      heading,
      anchor: headingSlug(heading),
      repo: repos[0] ?? null,
      scopes: scopeLine ? backtickedTokens(scopeLine[1]) : null,
      hasSurfaceLine: surfaceLine,
    });
  }
  return sections;
}

/**
 * The page-local half of check 5, so it gates a PR: every example section that
 * links a repository must also STATE something checkable about it.
 *
 * Repo-local by construction — it reads one committed file and nothing else — so
 * it cannot false-fail on anybody's action but ours, which is this repo's whole
 * test for what may block a PR.
 *
 * The floor is the POSITIVE CONTROL, and it is deliberately the same number as
 * MIN_EXAMPLE_REPOS rather than a new constant: a section matcher that stops
 * matching (someone converts the list to a component, a table, a `<details>`)
 * reports zero sections, zero scope claims and zero findings — indistinguishable
 * from a clean page. It is stated as a floor rather than as `=== entries.length`
 * so that adding a prose link to some other GitHub repository, which is a
 * perfectly ordinary page edit, does not red the gate.
 */
export function checkScopeClaimShape(sections, entries) {
  const failures = [];
  const withRepo = sections.filter((s) => s.repo);
  let claimed = 0;
  let tokens = 0;

  for (const s of withRepo) {
    if (!s.scopes || s.scopes.length === 0) {
      failures.push(
        `"${s.heading}" links ${s.repo.full} but states no \`- **Scopes** — …\` line.\n` +
          `      That line is what the scheduled half grades against the repository's own\n` +
          `      block.manifest.json; without it the most authoritative content on the page is\n` +
          `      back to being unchecked.`,
      );
      continue;
    }
    claimed++;
    tokens += s.scopes.length;
    const bad = s.scopes.filter((t) => !SCOPE_TOKEN_RE.test(t));
    if (bad.length) {
      failures.push(
        `"${s.heading}" states ${bad.length} token(s) that are not scope strings: ` +
          `${bad.map((b) => `\`${b}\``).join(', ')}\n` +
          `      Either the page lists something that is not a scope, or — far more likely — the\n` +
          `      Scopes matcher in parseExampleSections has drifted onto the Hooks bullet, which is\n` +
          `      also a list of backticked tokens. Check that before touching the page.`,
      );
    }
    if (!s.hasSurfaceLine) {
      failures.push(
        `"${s.heading}" states scopes but no \`- **Hooks** — …\` or \`- **SDK surface** — …\` line.\n` +
          `      Every example says which API surface it uses; the SDK-surface spelling exists for\n` +
          `      the one example that imports no hooks at all.`,
      );
    }
    const known = entries.some((e) => e.full.toLowerCase() === s.repo.full.toLowerCase());
    if (!known) {
      failures.push(
        `"${s.heading}" links ${s.repo.full}, which the page-wide parse did not find. ` +
          `The two parsers disagree; neither verdict can be trusted until they do not.`,
      );
    }
  }

  if (withRepo.length < MIN_EXAMPLE_REPOS) {
    failures.push(
      `only ${withRepo.length} example section(s) with a repository were found (floor ` +
        `${MIN_EXAMPLE_REPOS}) — parseExampleSections no longer sees the page's structure, so NO\n` +
        `      scope claim was graded this run and the scheduled half will verify nothing. Fix the\n` +
        `      matcher to the new layout; do not lower the floor.`,
    );
  }

  return { sections: withRepo.length, claimed, tokens, failures };
}

/**
 * The prose the hook lists are dated by. A NAMED CONSTANT, and matched WHOLE:
 * the stamp is the entire mechanism by which a reader learns those lists are a
 * snapshot rather than a checked claim, so a reword that leaves it unmatched
 * must be a red check and a deliberate edit here, not a silent loss of the only
 * thing standing in for a guard.
 */
export const HOOKS_STAMP_RE = /\bHook lists verified by hand on (\d{4})-(\d{2})-(\d{2})\b/;

/**
 * Grade the hook-list date stamp. `now` is injected so STAMP_FIXTURES can drive
 * the future-date case without depending on when the suite runs.
 *
 * 🔴 IT DOES NOT FAIL ON AGE, DELIBERATELY. A stamp that goes red after N days
 * is a permanently-red gate with a countdown — this repo's own doctrine says
 * that is worse than no gate, because everyone learns to click through it. What
 * the run does instead is PRINT the age, every time, so the number is in front
 * of whoever reads the output rather than inferred from a date they have to
 * subtract in their head.
 */
export function checkHooksStamp(markdown, now = new Date()) {
  const m = markdown.match(HOOKS_STAMP_RE);
  if (!m) {
    return {
      stamp: null,
      ageDays: null,
      failures: [
        `the page carries no hook-list date stamp.\n` +
          `      The hook lists are NOT machine-checked — verifying what eight repositories import\n` +
          `      needs source parsing this guard deliberately does not do — so the stamp is the only\n` +
          `      thing telling a reader how old they are. Restore the sentence matched by\n` +
          `      HOOKS_STAMP_RE, or change that constant in the same commit as the reword.`,
      ],
    };
  }

  const [, y, mo, d] = m;
  const stamp = `${y}-${mo}-${d}`;
  const when = new Date(`${stamp}T00:00:00Z`);
  if (Number.isNaN(when.getTime()) || when.toISOString().slice(0, 10) !== stamp) {
    return {
      stamp,
      ageDays: null,
      failures: [`the hook-list stamp "${stamp}" is not a real calendar date.`],
    };
  }

  const ageDays = Math.floor((now.getTime() - when.getTime()) / 86_400_000);
  const failures = [];
  // A two-day grace: a commit made near midnight in a UTC+N timezone is not a
  // defect, and neither is a clock-skewed runner.
  if (ageDays < -2) {
    failures.push(
      `the hook-list stamp is dated ${stamp}, which is ${-ageDays} days in the FUTURE.\n` +
        `      A stamp nobody can have verified yet is worse than none: it reads as fresher than\n` +
        `      anything on the page actually is.`,
    );
  }
  return { stamp, ageDays, failures };
}

/**
 * Classify one repository's manifest against the scopes its page section claims.
 * Pure + exported: SCOPES_FIXTURES below is its mutation test, run on every
 * invocation with no network.
 *
 * `result` is what fetchManifest returns: `{ok:true, body}`, `{ok:true,
 * parseError}`, `{ok:false, status}` for a terminal status, or `{ok:false,
 * reason}` for anything transient.
 *
 * @returns {{ verdict: 'ok'|'fail'|'skip', reason?: string, hint?: string, note?: string }}
 */
export function classifyManifest(entry, declared, result) {
  if (!result.ok) {
    if (result.status === 404 || result.status === 410) {
      return {
        verdict: 'fail',
        kind: 'MANIFEST MISSING',
        reason: `MANIFEST MISSING — HTTP ${result.status} for ${MANIFEST_PATH} in github.com/${entry.full}`,
        hint:
          `the page states this repository's scopes as read out of ${MANIFEST_PATH}, and there is no ` +
          `such file at its root any more. Either it moved (point MANIFEST_PATH at the new one, ` +
          `deliberately) or the claim cannot be true.`,
      };
    }
    return { verdict: 'skip', reason: result.reason };
  }

  if (result.parseError) {
    return {
      verdict: 'fail',
      kind: 'MANIFEST UNPARSEABLE',
      reason: `MANIFEST UNPARSEABLE — ${MANIFEST_PATH} in github.com/${entry.full} is not valid JSON (${result.parseError})`,
      hint: 'the page claims to have read this file. Nothing downstream of it can be trusted until it parses.',
    };
  }

  const remote = result.body?.scopes;
  if (!Array.isArray(remote)) {
    return {
      verdict: 'fail',
      kind: 'MANIFEST INVALID',
      reason: `MANIFEST HAS NO scopes ARRAY — ${MANIFEST_PATH} in github.com/${entry.full} carries ${JSON.stringify(remote) ?? 'nothing'} at \`scopes\``,
      hint: 'a block manifest declares its privileged surface in a top-level `scopes` array; the page quotes it.',
    };
  }

  // 🔴 SET, NOT SEQUENCE. See the SCOPES banner: the page's sentence is about
  // WHICH scopes are declared, so a reordered manifest leaves it true and
  // failing on that would be the false-fail this file exists not to have.
  const want = declared.map((s) => s.toLowerCase());
  const got = remote.map((s) => String(s).toLowerCase());
  const missing = want.filter((s) => !got.includes(s));
  const extra = got.filter((s) => !want.includes(s));

  if (missing.length || extra.length) {
    const bits = [];
    if (extra.length) bits.push(`the manifest declares ${extra.map((s) => `\`${s}\``).join(', ')} which the page does not list`);
    if (missing.length) bits.push(`the page lists ${missing.map((s) => `\`${s}\``).join(', ')} which the manifest does not declare`);
    return {
      verdict: 'fail',
      kind: 'SCOPES DRIFTED',
      reason: `SCOPES DRIFTED for github.com/${entry.full} — ${bits.join('; ')}`,
      hint:
        `update the \`- **Scopes** — …\` line for this example to the manifest's array ` +
        `(${remote.map((s) => `\`${s}\``).join(', ')}). A scope list a reader trusts and the platform ` +
        `does not enforce is the one kind of wrong this page must not be.`,
    };
  }

  if (want.join('|') !== got.join('|')) {
    return {
      verdict: 'ok',
      note:
        `scopes match as a set but not in order — the page reads ` +
        `${declared.join(', ')}, the manifest ${remote.join(', ')}. Not a failure (the page's claim is ` +
        `about which scopes, not their order); tidy it when you are next in there.`,
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

/**
 * A minimal page in the shape the real one has. Written as a template so
 * SECTION_FIXTURES can mutate exactly one thing at a time — a fixture that
 * differs in two places cannot tell you which one the verdict came from.
 */
const SECTION_PAGE = (body) => `# Example apps\n\n## The examples\n\n${body}\n`;

const SECTION_OK = [
  '### Gen Matrix',
  '',
  '**[github.com/ZacxDev/civitai-app-gen-matrix](https://github.com/ZacxDev/civitai-app-gen-matrix)** — page app.',
  '',
  '- **Scopes** — `ai:write:budgeted`, `apps:storage:read`',
  '- **Hooks** — `useBuzzWorkflow`, `useAppStorage`',
].join('\n');

/**
 * What the section parser must read out of a page. Every `expect` is written
 * from what the SECTION MEANS to a reader, never from what the code returns.
 */
export const SECTION_FIXTURES = [
  {
    name: 'a complete section yields repo + scopes + a surface line',
    md: SECTION_PAGE(SECTION_OK),
    expect: [{ heading: 'Gen Matrix', repo: 'ZacxDev/civitai-app-gen-matrix', scopes: ['ai:write:budgeted', 'apps:storage:read'], hasSurfaceLine: true }],
  },
  {
    name: 'the SDK-surface spelling counts as a surface line (the no-hooks example)',
    md: SECTION_PAGE(SECTION_OK.replace('**Hooks**', '**SDK surface**')),
    expect: [{ heading: 'Gen Matrix', repo: 'ZacxDev/civitai-app-gen-matrix', scopes: ['ai:write:budgeted', 'apps:storage:read'], hasSurfaceLine: true }],
  },
  {
    name: 'a trailing parenthetical after the scopes does not become a scope',
    md: SECTION_PAGE(SECTION_OK.replace('`ai:write:budgeted`, `apps:storage:read`', '`ai:write:budgeted` (the shortest manifest here)')),
    expect: [{ heading: 'Gen Matrix', repo: 'ZacxDev/civitai-app-gen-matrix', scopes: ['ai:write:budgeted'], hasSurfaceLine: true }],
  },
  {
    name: 'a section with no Scopes line reports scopes: null, not an empty list',
    md: SECTION_PAGE(SECTION_OK.split('\n').filter((l) => !l.includes('**Scopes**')).join('\n')),
    expect: [{ heading: 'Gen Matrix', repo: 'ZacxDev/civitai-app-gen-matrix', scopes: null, hasSurfaceLine: true }],
  },
  {
    name: 'two sections are two sections, each with its own repo',
    md: SECTION_PAGE(`${SECTION_OK}\n\n### App Requests\n\nhttps://github.com/ZacxDev/civitai-app-requests\n\n- **Scopes** — \`user:read:self\`\n- **Hooks** — \`useSharedStorage\``),
    expect: [
      { heading: 'Gen Matrix', repo: 'ZacxDev/civitai-app-gen-matrix', scopes: ['ai:write:budgeted', 'apps:storage:read'], hasSurfaceLine: true },
      { heading: 'App Requests', repo: 'ZacxDev/civitai-app-requests', scopes: ['user:read:self'], hasSurfaceLine: true },
    ],
  },
  // 🔴 NEGATIVE CONTROL ON THE MATCHER'S AIM. The Hooks bullet sits directly
  // under the Scopes one and is also a list of backticked tokens; a matcher that
  // grabbed the wrong bullet would satisfy every positive row above while
  // grading `useBuzzWorkflow` against a manifest.
  {
    name: 'negative control — the Hooks bullet is never read as scopes',
    md: SECTION_PAGE(SECTION_OK.split('\n').filter((l) => !l.includes('**Scopes**')).join('\n')),
    expect: [{ heading: 'Gen Matrix', repo: 'ZacxDev/civitai-app-gen-matrix', scopes: null, hasSurfaceLine: true }],
  },
  {
    name: 'negative control — an H2 is not an example section',
    md: '# Example apps\n\n## Keeping this list honest\n\nhttps://github.com/civitai/cli\n',
    expect: [],
  },
];

/**
 * Verdicts the manifest comparison must reach. The SCOPES DRIFTED rows are the
 * mutation test for the set comparison — the load-bearing line of check 5 — and
 * the order-only row is the mutation test for the decision NOT to fail on order.
 */
export const SCOPES_FIXTURES = [
  {
    name: 'manifest agrees exactly -> ok',
    entry: { full: 'civitai/app' },
    declared: ['ai:write:budgeted', 'buzz:read:self'],
    result: { ok: true, body: { scopes: ['ai:write:budgeted', 'buzz:read:self'] } },
    expect: 'ok',
  },
  {
    name: 'one scope, agreeing -> ok (the shortest manifest on the page)',
    entry: { full: 'civitai/app-panorama-360' },
    declared: ['ai:write:budgeted'],
    result: { ok: true, body: { scopes: ['ai:write:budgeted'] } },
    expect: 'ok',
  },
  {
    // 🔴 THE ORDER DECISION, PINNED. Flipping this to `expect: 'fail'` is the
    // false-fail the SCOPES banner refuses; flipping the implementation to
    // compare sequences reddens this row.
    name: 'same set, different order -> ok, with a note naming both orders',
    entry: { full: 'civitai/app' },
    declared: ['buzz:read:self', 'ai:write:budgeted'],
    result: { ok: true, body: { scopes: ['ai:write:budgeted', 'buzz:read:self'] } },
    expect: 'ok',
    noteIncludes: 'not in order',
  },
  {
    // 🔴 THE MUTATION TEST for the set comparison. Replacing the difference with
    // `if (false && …)` — the "just check it parses" simplification — turns this
    // row's verdict from 'fail' to 'ok'.
    name: 'the manifest gained a scope the page does not list -> fail',
    entry: { full: 'civitai/app' },
    declared: ['ai:write:budgeted'],
    result: { ok: true, body: { scopes: ['ai:write:budgeted', 'apps:storage:shared:write'] } },
    expect: 'fail',
    reasonIncludes: 'SCOPES DRIFTED',
  },
  {
    name: 'the page lists a scope the manifest dropped -> fail',
    entry: { full: 'civitai/app' },
    declared: ['ai:write:budgeted', 'buzz:read:self'],
    result: { ok: true, body: { scopes: ['ai:write:budgeted'] } },
    expect: 'fail',
    reasonIncludes: 'SCOPES DRIFTED',
  },
  {
    name: 'case differs only -> ok (scope strings are compared case-insensitively)',
    entry: { full: 'civitai/app' },
    declared: ['AI:Write:Budgeted'],
    result: { ok: true, body: { scopes: ['ai:write:budgeted'] } },
    expect: 'ok',
  },
  {
    name: 'manifest 404 -> fail, terminal (it is not an outage)',
    entry: { full: 'civitai/app' },
    declared: ['ai:write:budgeted'],
    result: { ok: false, status: 404 },
    expect: 'fail',
    reasonIncludes: 'MANIFEST MISSING',
  },
  {
    name: 'manifest is not JSON -> fail, with the parser error named',
    entry: { full: 'civitai/app' },
    declared: ['ai:write:budgeted'],
    result: { ok: true, parseError: 'Unexpected token < in JSON at position 0' },
    expect: 'fail',
    reasonIncludes: 'MANIFEST UNPARSEABLE',
  },
  {
    name: 'manifest parses but has no scopes array -> fail, never a silent pass',
    entry: { full: 'civitai/app' },
    declared: ['ai:write:budgeted'],
    result: { ok: true, body: { blockId: 'x' } },
    expect: 'fail',
    reasonIncludes: 'NO scopes ARRAY',
  },
  {
    name: 'scopes present but not an array -> fail',
    entry: { full: 'civitai/app' },
    declared: ['ai:write:budgeted'],
    result: { ok: true, body: { scopes: 'ai:write:budgeted' } },
    expect: 'fail',
    reasonIncludes: 'NO scopes ARRAY',
  },
  {
    name: 'rate limit / outage -> skip, never fail',
    entry: { full: 'civitai/app' },
    declared: ['ai:write:budgeted'],
    result: { ok: false, reason: 'HTTP 429 from raw.githubusercontent.com' },
    expect: 'skip',
  },
];

/** The hook-list date stamp: present, real, and not dated in the future. */
export const STAMP_FIXTURES = [
  {
    name: 'a stamp in the page is read and aged',
    md: 'Hook lists verified by hand on 2026-09-01. Read them as a snapshot.',
    now: '2026-09-11T00:00:00Z',
    expectStamp: '2026-09-01',
    expectAgeDays: 10,
    expectFailures: 0,
  },
  {
    name: 'NEGATIVE CONTROL — no stamp at all is a failure, not a pass',
    md: 'Verified 2026-09-11: all eight are public, not forks, and not archived.',
    now: '2026-09-11T00:00:00Z',
    expectStamp: null,
    expectFailures: 1,
  },
  {
    name: 'a stamp in the future is a failure',
    md: 'Hook lists verified by hand on 2026-12-01.',
    now: '2026-09-11T00:00:00Z',
    expectStamp: '2026-12-01',
    expectFailures: 1,
  },
  {
    name: 'a stamp one day ahead is inside the timezone grace, not a failure',
    md: 'Hook lists verified by hand on 2026-09-12.',
    now: '2026-09-11T00:00:00Z',
    expectStamp: '2026-09-12',
    expectFailures: 0,
  },
  {
    name: 'a date that is not a real calendar day is a failure',
    md: 'Hook lists verified by hand on 2026-02-31.',
    now: '2026-09-11T00:00:00Z',
    expectStamp: '2026-02-31',
    expectFailures: 1,
  },
];

/** Failures from the tables above; empty when all of them still assert what they say. */
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

  for (const f of SECTION_FIXTURES) {
    const got = parseExampleSections(f.md).map((s) => ({
      heading: s.heading,
      repo: s.repo?.full ?? null,
      scopes: s.scopes,
      hasSurfaceLine: s.hasSurfaceLine,
    }));
    const want = f.expect.map((e) => ({ heading: e.heading, repo: e.repo, scopes: e.scopes, hasSurfaceLine: e.hasSurfaceLine }));
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      failures.push(
        `SECTION — ${f.name}\n` +
          `      expected: ${JSON.stringify(want)}\n` +
          `      got:      ${JSON.stringify(got)}\n` +
          `      parseExampleSections feeds the scope comparison. Read the wrong bullet and this guard\n` +
          `      grades hook names against a manifest and blames eight upstream repositories.`,
      );
    }
  }

  for (const f of SCOPES_FIXTURES) {
    const cls = classifyManifest(f.entry, f.declared, f.result);
    if (cls.verdict !== f.expect) {
      failures.push(
        `SCOPES — ${f.name}\n` +
          `      expected verdict "${f.expect}", got "${cls.verdict}"${cls.reason ? ` (${cls.reason})` : ''}\n` +
          `      This table IS the mutation test for the scope SET comparison — check 5's load-bearing\n` +
          `      line. A live, unrenamed, unarchived repository can still declare scopes the page does\n` +
          `      not list; nothing else in this repository would see that.`,
      );
    } else if (f.reasonIncludes && !(cls.reason ?? '').includes(f.reasonIncludes)) {
      failures.push(
        `SCOPES — ${f.name}\n` +
          `      verdict was "${cls.verdict}" as expected, but its reason does not name ` +
          `${JSON.stringify(f.reasonIncludes)}: ${JSON.stringify(cls.reason ?? '')}\n` +
          `      The reason IS the remedy a maintainer acts on.`,
      );
    } else if (f.noteIncludes && !(cls.note ?? '').includes(f.noteIncludes)) {
      failures.push(
        `SCOPES — ${f.name}\n` +
          `      verdict was "${cls.verdict}" as expected, but no note named ` +
          `${JSON.stringify(f.noteIncludes)}: ${JSON.stringify(cls.note ?? '')}\n` +
          `      Order drift is deliberately not a failure; it is only useful if it is still SAID.`,
      );
    }
  }

  for (const f of STAMP_FIXTURES) {
    const got = checkHooksStamp(f.md, new Date(f.now));
    if (got.stamp !== f.expectStamp) {
      failures.push(`STAMP — ${f.name}\n      expected stamp ${JSON.stringify(f.expectStamp)}, got ${JSON.stringify(got.stamp)}`);
    } else if (got.failures.length !== f.expectFailures) {
      failures.push(
        `STAMP — ${f.name}\n` +
          `      expected ${f.expectFailures} failure(s), got ${got.failures.length}: ${JSON.stringify(got.failures)}\n` +
          `      The stamp is the ONLY thing standing in for a guard on the hook lists. If it can go\n` +
          `      missing quietly, the lists have no age and no check.`,
      );
    } else if (f.expectAgeDays !== undefined && got.ageDays !== f.expectAgeDays) {
      failures.push(`STAMP — ${f.name}\n      expected age ${f.expectAgeDays} days, got ${got.ageDays}`);
    }
  }

  // EVERY must-FAIL verdict must carry a `kind`. 🔴 A FIELD THAT EXISTS IN THE
  // RETURN VALUE IS NOT A GUARD — the report writes `f.kind ?? 'ROT'`, so a
  // classifier branch that forgets to set one degrades silently to the generic
  // label, and the issue all of this ends up in stops naming what went wrong.
  // The `??` fallback is what makes the omission invisible; this is what makes
  // it visible.
  const kindless = [
    ...CLASSIFY_FIXTURES.filter((f) => f.expect === 'fail').map((f) => [f.name, classifyRepo(f.entry, f.result)]),
    ...SCOPES_FIXTURES.filter((f) => f.expect === 'fail').map((f) => [f.name, classifyManifest(f.entry, f.declared, f.result)]),
  ].filter(([, c]) => typeof c.kind !== 'string' || !c.kind.length);
  if (kindless.length) {
    failures.push(
      `KIND MISSING — ${kindless.length} failing classification(s) carry no \`kind\`: ` +
        `${kindless.map(([n]) => JSON.stringify(n)).join(', ')}\n` +
        `      The report falls back to the generic "ROT" label, and that label is what the drift\n` +
        `      notifier puts in front of a maintainer. Set a kind on the branch.`,
    );
  }

  // CONTROLS ON THE TABLES THEMSELVES. A table graded only on passing input is a
  // table wired to nothing; these floors are what make the counts above a claim.
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

  // The same control for check 5, stated separately so a table can only lose its
  // own controls. `drifts` is check 5's RENAMED row: without one, "compare the
  // manifest" degrades to "fetch the manifest and print a tick".
  const sectionNegatives = SECTION_FIXTURES.filter((f) => f.expect.length === 0 || f.expect.some((e) => e.scopes === null)).length;
  const scopeDrifts = SCOPES_FIXTURES.filter((f) => f.reasonIncludes === 'SCOPES DRIFTED').length;
  const scopeOks = SCOPES_FIXTURES.filter((f) => f.expect === 'ok').length;
  const scopeSkips = SCOPES_FIXTURES.filter((f) => f.expect === 'skip').length;
  const stampNegatives = STAMP_FIXTURES.filter((f) => f.expectFailures > 0).length;
  if (sectionNegatives < 2 || scopeDrifts < 2 || scopeOks < 2 || scopeSkips < 1 || stampNegatives < 2) {
    failures.push(
      `SELF-TEST DEGENERATE (check 5) — the scope tables lost their controls ` +
        `(${sectionNegatives} section negatives, ${scopeOks} must-ok, ${scopeDrifts} SCOPES DRIFTED row(s), ` +
        `${scopeSkips} must-skip, ${stampNegatives} stamp negatives).\n` +
        `      At least two SCOPES DRIFTED rows are mandatory — one in each direction. Without them\n` +
        `      the manifest fetch is a round-trip whose result nothing reads, which is precisely the\n` +
        `      shape the audit that produced this check went looking for.`,
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

/**
 * GET one repository's `block.manifest.json`. Never throws.
 *
 * Deliberately UNAUTHENTICATED and on raw.githubusercontent.com — see the SCOPES
 * banner. A JSON parse failure comes back as `{ ok: true, parseError }` rather
 * than as an exception, because "the file is there and it is garbage" is a
 * finding a maintainer must be told, not a crash.
 */
async function fetchManifest(entry, fetchImpl = fetch) {
  const url = `${RAW_BASE}/${entry.owner}/${entry.repo}/${MANIFEST_REF}/${MANIFEST_PATH}`;
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(20000),
      headers: { accept: 'application/json', 'user-agent': 'civitai-developer-docs-example-apps-guard' },
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 410) return { ok: false, status: res.status };
      return { ok: false, reason: `HTTP ${res.status} from ${url}` };
    }
    const text = await res.text();
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch (err) {
      return { ok: true, parseError: err.message };
    }
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function resolvePage() {
  return isAbsolute(PAGE) ? PAGE : join(repoRoot, PAGE);
}

/**
 * The machine-readable summary scripts/drift-notify.mjs reads.
 *
 * 🔴 WRITTEN ON EVERY EXIT PATH, INCLUDING THE ONES WHERE THIS GUARD CONCLUDED
 * NOTHING. A notifier that only ever sees a report from a run that finished is
 * blind to exactly the case it exists for — a run that verified zero
 * repositories, or died before it verified any, and so is indistinguishable from
 * a clean one. `verdict` is what the notifier branches on; `verified` is the
 * number that makes a green claim mean anything.
 */
function writeReport(path, report) {
  if (!path) return;
  try {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  } catch (err) {
    // Never let the bookkeeping fail the guard: the verdict is the product.
    console.error(`  ! could not write the report to ${path}: ${err.message}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const offline = argv.includes('--offline');
  const reportAt = argv.includes('--report') ? argv[argv.indexOf('--report') + 1] : null;
  if (argv.includes('--report') && !reportAt) {
    console.error('check-example-apps: --report takes a path');
    process.exit(2);
  }

  // The report is built up as the run proceeds and written on EVERY exit path —
  // `finish` is the only way out below. See writeReport: a run that concluded
  // nothing must be able to say so to the notifier, or a broken guard and a
  // clean page deliver the same silence.
  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    page: PAGE,
    offline,
    verdict: 'incomplete',
    stage: 'self-test',
    listed: 0,
    verified: 0,
    rotted: 0,
    unverified: 0,
    scopesVerified: 0,
    scopesRotted: 0,
    scopesClaimed: 0,
    scopesUnverified: 0,
    hooksStamp: null,
    hooksAgeDays: null,
    notes: [],
    findings: [],
  };
  const finish = (code) => {
    writeReport(reportAt, report);
    if (code) process.exit(code);
  };

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
    report.verdict = 'broken';
    report.findings = selfTest.map((f) => ({ kind: 'SELF-TEST', repo: null, reason: f.split('\n')[0], hint: null }));
    finish(1);
    return;
  }
  const renameRows = CLASSIFY_FIXTURES.filter((f) => f.reasonIncludes === 'RENAMED').length;
  const driftRows = SCOPES_FIXTURES.filter((f) => f.reasonIncludes === 'SCOPES DRIFTED').length;
  console.log(
    `  ✓ self-test: ${PARSE_FIXTURES.length} parse fixture(s) ` +
      `(${PARSE_FIXTURES.filter((f) => f.expect.length === 0).length} negative control(s)) · ` +
      `${CLASSIFY_FIXTURES.length} classify fixture(s) ` +
      `(${CLASSIFY_FIXTURES.filter((f) => f.expect === 'fail').length} must-FAIL, ` +
      `${renameRows} of them the RENAMED mutation test)`,
  );
  console.log(
    `  ✓ self-test: ${SECTION_FIXTURES.length} section fixture(s) · ` +
      `${SCOPES_FIXTURES.length} manifest fixture(s) ` +
      `(${SCOPES_FIXTURES.filter((f) => f.expect === 'fail').length} must-FAIL, ` +
      `${driftRows} of them the SCOPES DRIFTED mutation test) · ` +
      `${STAMP_FIXTURES.length} hook-stamp fixture(s)`,
  );

  // ---- OFFLINE HALF -------------------------------------------------------
  report.stage = 'page';
  const pagePath = resolvePage();
  if (!existsSync(pagePath)) {
    console.error(`  ✗ page MISSING at ${PAGE}`);
    console.error('    the civitai CLI agents block links readers here; a missing page is a dead link');
    console.error('    on every scaffolded project. Restore it, or update PAGE in this script.');
    report.verdict = 'rot';
    report.findings.push({ kind: 'PAGE MISSING', repo: null, reason: `no page at ${PAGE}`, hint: 'restore it, or update PAGE in scripts/check-example-apps.mjs' });
    finish(1);
    return;
  }

  const markdown = readFileSync(pagePath, 'utf8');
  const entries = parseRepoUrls(markdown);
  report.listed = entries.length;
  console.log(`  ${PAGE} names ${entries.length} distinct GitHub repositories (floor: ${MIN_EXAMPLE_REPOS})`);

  if (entries.length < MIN_EXAMPLE_REPOS) {
    console.error(`\n  ✗ FLOOR BREACHED — found ${entries.length}, expected at least ${MIN_EXAMPLE_REPOS}`);
    console.error('    Either examples were removed (lower MIN_EXAMPLE_REPOS in the same commit, with');
    console.error('    the reason in the message), or — far more likely — the page was restructured and');
    console.error('    this guard is no longer looking at the links. A guard that parses zero URLs passes');
    console.error('    forever; that is what this floor exists to make impossible.');
    report.verdict = 'rot';
    report.findings.push({ kind: 'FLOOR BREACHED', repo: null, reason: `${entries.length} repositories parsed, floor ${MIN_EXAMPLE_REPOS}`, hint: 'the page was probably restructured past the link matcher' });
    finish(1);
    return;
  }

  // ---- 3. THE PAGE'S CLAIMS ABOUT ITSELF ----------------------------------
  // Repo-local, so it runs on the PR half too: removing an example must not be
  // able to leave "eight" in the prose and a Pick-one row pointing at a section
  // that no longer exists. 3b adds the per-example claims: every section that
  // links a repository must state the scopes the scheduled half grades, and the
  // hook lists — which nothing grades — must carry their date stamp.
  const claims = checkPageClaims(markdown, entries);
  const anchors = checkPageAnchors(markdown);
  const sections = parseExampleSections(markdown);
  const shape = checkScopeClaimShape(sections, entries);
  const stamp = checkHooksStamp(markdown);
  report.hooksStamp = stamp.stamp;
  report.hooksAgeDays = stamp.ageDays;
  const pageFailures = [...claims.failures, ...anchors.failures, ...shape.failures, ...stamp.failures];
  console.log(
    `  ${claims.claims} self-count claim(s) graded (floor ${MIN_PAGE_CLAIMS}) · ` +
      `${anchors.anchors} in-page anchor(s) across ${anchors.headings} heading(s)`,
  );
  console.log(
    `  ${shape.claimed} of ${shape.sections} example section(s) state scopes ` +
      `(${shape.tokens} scope string(s), floor ${MIN_EXAMPLE_REPOS} sections) · ` +
      `hook lists stamped ${stamp.stamp ?? 'NOWHERE'}` +
      `${stamp.ageDays === null ? '' : ` (${stamp.ageDays} day(s) old — not machine-checked, by design)`}`,
  );
  if (pageFailures.length) {
    console.error(`\n  ✗ THE PAGE CONTRADICTS ITSELF — ${pageFailures.length} finding(s)`);
    for (const f of pageFailures) console.error(`    - ${f}`);
    console.error('');
    console.error('    These numerals, anchors, scope lists and date stamps are hand-written and nothing');
    console.error('    else reads them, so a removed or added example leaves them behind silently — the');
    console.error('    links keep checking out while the page tells a reader something untrue about itself.');
    report.verdict = 'rot';
    for (const f of pageFailures) report.findings.push({ kind: 'PAGE', repo: null, reason: f.split('\n')[0], hint: null });
    finish(1);
    return;
  }

  if (offline) {
    console.log(`\nOffline checks passed: page present, ${entries.length} repositories parsed (>= ${MIN_EXAMPLE_REPOS}),`);
    console.log(`self-count claims agree, ${anchors.anchors} in-page anchors resolve, ${shape.claimed} scope lists`);
    console.log(`are stated in a gradeable shape, and the hook lists carry a date stamp.`);
    console.log('Repository liveness (404 / rename / archived) and the scope lists themselves are the');
    console.log('scheduled half — not checked here.');
    report.verdict = 'offline-ok';
    finish(0);
    return;
  }

  // ---- NETWORK HALF -------------------------------------------------------
  report.stage = 'network';
  console.log('');
  const failures = [];
  const skipped = [];
  let ok = 0;

  // Scope claims keyed by repository, so check 5 can look one up per entry. Only
  // repositories the page states scopes for are candidates; checkScopeClaimShape
  // above has already failed the run if a section links a repo and states none.
  const declaredFor = new Map();
  for (const s of sections) {
    if (s.repo && s.scopes && s.scopes.length) declaredFor.set(s.repo.full.toLowerCase(), s.scopes);
  }
  report.scopesClaimed = declaredFor.size;

  const scopeFailures = [];
  const scopeSkipped = [];
  let scopeOk = 0;

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

    // ---- 5. THE SCOPES THE PAGE STATES -----------------------------------
    // Not run for a repository that already FAILED liveness: a second finding
    // about a repository that is gone, renamed or archived is noise on top of a
    // remedy the maintainer already has. A SKIPPED one is still attempted —
    // raw.githubusercontent.com is a different host, so it can be reachable when
    // api.github.com is not, and more coverage under a rate limit is the point.
    const declared = declaredFor.get(entry.full.toLowerCase());
    if (cls.verdict === 'fail') continue;
    if (!declared) continue;
    const mcls = classifyManifest(entry, declared, await fetchManifest(entry));
    if (mcls.verdict === 'ok') {
      scopeOk++;
      if (mcls.note) {
        console.log(`    · ${entry.full} scopes: ${mcls.note}`);
        report.notes.push(`${entry.full}: ${mcls.note}`);
      } else {
        console.log(`    · ${entry.full} scopes: ${declared.length} declared, all agree with ${MANIFEST_PATH}`);
      }
    } else if (mcls.verdict === 'skip') {
      console.log(`    ⊘ ${entry.full} scopes — ${mcls.reason} — could not verify (skip, no false-fail)`);
      scopeSkipped.push({ entry, ...mcls });
    } else {
      console.log(`    ✗ ${entry.full} scopes — ${mcls.reason}`);
      scopeFailures.push({ entry, ...mcls });
    }
  }

  report.verified = ok;
  report.rotted = failures.length;
  report.unverified = skipped.length;
  report.scopesVerified = scopeOk;
  report.scopesRotted = scopeFailures.length;
  report.scopesUnverified = scopeSkipped.length;
  for (const f of [...failures, ...scopeFailures]) {
    report.findings.push({
      // 🔴 THE CLASSIFIER'S OWN `kind`, NEVER THE FIRST WORDS OF ITS PROSE. The
      // first version of this line derived the kind by splitting the reason on a
      // dash and taking three words, which produced `"SCOPES DRIFTED for"` — and
      // that string is what the notifier puts in an ISSUE TITLE. A label derived
      // from a sentence moves whenever the sentence is reworded; a label the
      // classifier states does not.
      kind: f.kind ?? 'ROT',
      repo: f.entry.full,
      reason: f.reason,
      hint: f.hint ?? null,
    });
  }

  // ALWAYS printed, and always carrying the numbers the verdict is about: a run
  // that verified nothing must say `0 checked`, never a bare "ok".
  console.log(
    `\nRepositories: ${entries.length} listed · ${ok} verified live · ${failures.length} rotted · ${skipped.length} unverified (API unreachable)`,
  );
  console.log(
    `Scopes: ${declaredFor.size} claimed on the page · ${scopeOk} verified against ${MANIFEST_PATH} · ` +
      `${scopeFailures.length} drifted · ${scopeSkipped.length} unverified (manifest unreachable)`,
  );
  if (stamp.stamp) {
    console.log(
      `Hook lists: NOT machine-checked, by design — stamped ${stamp.stamp}, ${stamp.ageDays} day(s) old.`,
    );
  }

  if (failures.length || scopeFailures.length) {
    console.error('\n--- EXAMPLE APP ROT: the page says something about a repository that is not true ---');
    console.error(`${PAGE} is the ONE URL the civitai CLI's agents block points at instead of embedding`);
    console.error('a repo list in every scaffolded project, so a wrong row here reaches every reader.');
    for (const f of [...failures, ...scopeFailures]) {
      console.error(`  - ${f.entry.full}: ${f.reason}`);
      if (f.hint) console.error(`      ${f.hint}`);
    }
    report.verdict = 'rot';
    finish(1);
    return;
  }

  // 🔴 A RUN THAT VERIFIED NOTHING IS NOT A GREEN RUN, AND THIS IS WHERE IT SAYS
  // SO — in the log for a human, and in `verdict` for the notifier, which opens
  // an issue on it. A silent zero is indistinguishable from success, and until
  // the report existed it WAS success as far as anything downstream could tell.
  if (ok === 0) {
    console.log('\n--- NO REPOSITORY WAS VERIFIED ---');
    console.log(`The GitHub API was unreachable for all ${entries.length} repositories, so this run made NO`);
    console.log('claim about whether any of them still exists. Exiting 0 because a connectivity failure is');
    console.log('not drift — but do not read this run as a clean bill of health. Re-run it, or set');
    console.log('GITHUB_TOKEN if the cause was the unauthenticated rate limit.');
    // Say what DID happen, or this banner overstates the loss in the other
    // direction. The manifests come from a different host, so they can verify
    // while api.github.com is down — which is part of why they were put there.
    if (scopeOk) {
      console.log(
        `(${scopeOk} scope list(s) WERE verified against ${MANIFEST_PATH}; those come from ${RAW_BASE},`,
      );
      console.log('a different host, so they survived this outage. Liveness did not.)');
    }
    report.verdict = 'nothing-verified';
    finish(0);
    return;
  }

  if (skipped.length || scopeSkipped.length) {
    console.log(
      `\nNote: ${skipped.length} of ${entries.length} repositories and ${scopeSkipped.length} of ` +
        `${declaredFor.size} scope lists could not be reached and were NOT verified this run.`,
    );
  }
  report.verdict = 'ok';
  finish(0);
}

// Run only when invoked directly (not when imported for the exported helpers).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`check-example-apps: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  });
}
