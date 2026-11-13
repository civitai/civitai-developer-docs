#!/usr/bin/env node
/**
 * bump-appblocks-pins.mjs
 * -----------------------
 * The App Blocks pin-bump bot: move the first-party `@civitai/*` devDependency
 * pins to npm `latest`, carry every hand-written `@civitai/<pkg>@x.y.z` literal
 * with them, regenerate the reference pages, and open (or update) ONE pull
 * request on `bot/appblocks-pin-bump`.
 *
 * WHAT IT FIXES. `check:pins` and `check:ds-pins` on the daily appblocks-drift
 * sweep DETECT a lagging pin; until this existed a human then did the bump by
 * hand (package.json, the lockfile, dozens of prose literals, the regenerated
 * pages). This is the remedy half, run by .github/workflows/appblocks-pin-bump.yml.
 *
 * WHAT IT TRACKS. Exactly the packages check-design-system-pins.mjs guards
 * (`SDK_PACKAGES` + `DESIGN_SYSTEM_PACKAGES`: app-sdk, blocks-react, sdk,
 * theme, components, components-react), imported rather than copied, so the
 * bot and the guard cannot disagree about the set.
 *
 * AUTO-MERGE, AND WHEN IT IS REFUSED. The PR is set to auto-merge (squash) when
 *   - the change is VERSION-ONLY: once the bumped packages' old and new version
 *     strings are masked out, every changed file is identical, and the lockfile
 *     moved only `@civitai/*` entries (plus newly added dependencies); and
 *   - every tracked pin at the PR head equals npm `latest` as read at publish
 *     time. A PR that would leave `main` at an older version than npm, or at
 *     a version nobody could confirm, is never auto-merged.
 * Otherwise the PR gets the `content-change` label and a note, and waits for a
 * human. A release that adds a hook, a manifest field or a message changes the
 * generated pages beyond their version stamps, and that diff is worth reading.
 *
 * CHECKS. The publish job pushes and opens the PR with a GitHub App
 * installation token, not the default GITHUB_TOKEN: a push made with
 * GITHUB_TOKEN starts no `pull_request` runs (issue #148), and `main`'s branch
 * protection only counts the required contexts from `pull_request` runs
 * (dispatching the workflows instead did not satisfy it, docs#339). The token
 * is minted in the workflow (scripts/lib/app-token-step.mjs describes its
 * shape); this script only sees it as `gh`'s GH_TOKEN and the checkout's
 * credential.
 *
 * TWO JOBS, SPLIT BY PRIVILEGE.
 *   --prepare  (read-only job) runs `npm install` / `npm ci` and the generators,
 *              commits on a local `bot/appblocks-pin-bump`, and writes a git
 *              bundle plus result.json to --out.
 *   --publish  (write job) runs NO npm install. It fetches the bundle, works out
 *              the PR's diff and the auto-merge decision from git and the
 *              registry itself (result.json is only used for the title), pushes
 *              the branch, opens or updates the PR, and turns auto-merge on
 *              or off.
 * Third-party install code therefore never runs next to a write token, and
 * the write job does not take the read job's word for what the diff is.
 *
 * ONE BRANCH, NEVER `main`. An open bot PR is extended: `main` is merged into it
 * and the next bump is committed on top, never force-pushed. A bot branch with
 * NO open PR (closed by a human) is refused rather than overwritten; delete it
 * and the next run starts fresh. Merged branches are deleted by the repo setting.
 *
 * REHEARSAL. `--rehearse-from @civitai/<pkg>@<lower>` (workflow input
 * `rehearse_from`) first commits a pin DOWN to `<lower>` on the bot branch, and
 * the normal bump then moves it back to npm latest. The PR's net diff is empty,
 * so `main` ends at npm latest whatever happens, but the whole path runs:
 * install, literal rewrite, regeneration, commit, push, PR, its `pull_request`
 * checks and auto-merge. It is how the path is exercised while every pin is current.
 *
 * USAGE
 *   npm run bump:appblocks-pins -- --dry-run      # plan only; reads npm, writes nothing
 *   node scripts/bump-appblocks-pins.mjs --prepare --out <dir>   # CI only
 *   node scripts/bump-appblocks-pins.mjs --publish --in <dir>    # CI only
 *
 * Tests: scripts/test-bump-appblocks-pins.mjs (fixture registry, no network).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compareSemver } from './check-appblocks-pins.mjs';
import {
  DESIGN_SYSTEM_PACKAGES,
  DOC_FILES,
  DOC_ROOTS,
  HISTORICAL_LITERALS,
  SDK_PACKAGES,
  UPSTREAM_OWNED_PAGES,
} from './check-design-system-pins.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

export const BOT_BRANCH = 'bot/appblocks-pin-bump';
export const BASE = 'main';
export const CONTENT_LABEL = 'content-change';
export const TRACKED_PACKAGES = Object.freeze([...SDK_PACKAGES, ...DESIGN_SYSTEM_PACKAGES]);

/**
 * The open PR from `head` IN THIS REPOSITORY into `base`, or null.
 *
 * `gh pr list --head <name>` also returns PRs from FORKS whose branch has that
 * name (measured: `--head ghost-agent/issue-237` returned fork PR #244), so
 * anyone could open a fork PR named like the bot branch and have the bot edit
 * it. Cross-repository PRs are dropped.
 */
export function openPrFor({ head, base }, run) {
  const out = run(['pr', 'list', '--head', head, '--base', base, '--state', 'open', '--json', 'number,headRefOid,isCrossRepository']);
  const list = JSON.parse(out || '[]').filter((p) => p.isCrossRepository === false);
  return list[0] ?? null;
}

/** Files whose change is the version bump itself, not regenerated output. */
const LOCKFILE = 'package-lock.json';
const PKG_JSON = 'package.json';

const BASE_REF = 'refs/pin-bump/base';
const HEAD_REF = 'refs/pin-bump/head';

const EXACT = /^\d+\.\d+\.\d+$/;

// ---- pure ------------------------------------------------------------------

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A version string as a token, for MASKING: not part of a longer number. A
 * letter before it is allowed (`v0.86.0`, `app-sdk@0.86.0`); a digit or a dot
 * either side, or a prerelease suffix after it, is not.
 */
function versionRe(v, flags = 'g') {
  return new RegExp(`(?<![0-9.])${escapeRe(v)}(?!\\.?[0-9]|-[0-9A-Za-z])`, flags);
}

/**
 * The bumps that move a pin UP to npm latest. Equal and ahead pins are left
 * alone, and a package whose latest is unknown is never planned.
 * @returns {Array<{pkg: string, from: string, to: string}>}
 */
export function planBump(pins, latest) {
  const plan = [];
  for (const pkg of TRACKED_PACKAGES) {
    const from = pins[pkg];
    const to = latest[pkg];
    if (!from || !to) continue;
    if (compareSemver(from, to) < 0) plan.push({ pkg, from, to });
  }
  return plan;
}

/**
 * Rewrite every `@civitai/<pkg>@<from>` literal to `<to>`. Literals at any other
 * version are claims about the past ("added in X") and are left alone.
 *
 * Refuses when check-design-system-pins.mjs declares a HISTORICAL literal at
 * `<from>` in this file: the bot cannot tell that sentence from a pin literal.
 */
export function rewriteLiterals(file, text, bumps) {
  let out = text;
  let count = 0;
  for (const { pkg, from, to } of bumps) {
    const hist = HISTORICAL_LITERALS.find((h) => h.file === file && h.pkg === pkg && h.version === from);
    if (hist) {
      throw new Error(
        `${file}: HISTORICAL_LITERALS declares ${pkg}@${from} there as a historical claim, and ${from} is also the ` +
          'pin being bumped, so the bot cannot tell which literal is which. Resolve it by hand.',
      );
    }
    const re = new RegExp(`${escapeRe(pkg)}@${escapeRe(from)}(?![0-9A-Za-z.+-])`, 'g');
    out = out.replace(re, () => {
      count++;
      return `${pkg}@${to}`;
    });
  }
  return { text: out, count };
}

/** The tracked devDep pins of a package.json text. */
export function pinsOf(pkgJsonText) {
  const dev = JSON.parse(pkgJsonText).devDependencies || {};
  const pins = {};
  for (const pkg of TRACKED_PACKAGES) if (dev[pkg]) pins[pkg] = dev[pkg];
  return pins;
}

/** Every tracked pin that differs between two package.json texts, in either direction. */
export function bumpsBetween(beforeText, afterText) {
  const a = pinsOf(beforeText);
  const b = pinsOf(afterText);
  return TRACKED_PACKAGES.filter((p) => a[p] && b[p] && a[p] !== b[p]).map((pkg) => ({ pkg, from: a[pkg], to: b[pkg] }));
}

/**
 * Did a lockfile change touch ONLY `@civitai/*` entries? Pure.
 *
 * The publish job recomputes the diff itself rather than trusting the job that
 * ran the install, and the lockfile is where an install-time compromise would
 * land (an unrelated package's `resolved`/`integrity` rewritten). So: every
 * pre-existing entry outside the `@civitai` scope must be byte-identical, none
 * may disappear, the root entry may differ only in the bumped devDeps, and the
 * file's other top-level fields must not move. ADDED entries are allowed: a new
 * `@civitai/*` release can bring a new dependency, and `npm ci` verified it.
 */
export function lockfileMovesOnlyCivitai(beforeText, afterText, bumps) {
  let b;
  let a;
  try {
    b = JSON.parse(beforeText);
    a = JSON.parse(afterText);
  } catch {
    return false;
  }
  const { packages: bp = {}, ...bTop } = b;
  const { packages: ap = {}, ...aTop } = a;
  if (JSON.stringify(bTop) !== JSON.stringify(aTop)) return false;
  const civitai = (k) => /(^|\/)node_modules\/@civitai\/[^/]+$/.test(k) || /(^|\/)node_modules\/@civitai\/[^/]+\/node_modules\/@civitai\/[^/]+$/.test(k);
  const root = (e) => {
    const j = JSON.parse(JSON.stringify(e ?? {}));
    for (const { pkg } of bumps) if (j.devDependencies) delete j.devDependencies[pkg];
    return JSON.stringify(j);
  };
  for (const k of Object.keys(bp)) {
    if (k === '') {
      if (root(bp[k]) !== root(ap[k])) return false;
      continue;
    }
    if (civitai(k)) continue;
    if (!(k in ap) || JSON.stringify(bp[k]) !== JSON.stringify(ap[k])) return false;
  }
  return true;
}

/**
 * Is a diff version-only?
 *
 * `changes` is `[{ path, before, after }]`, with null for a side where the file
 * does not exist. Each bumped package's old AND new version strings are masked
 * to one token, then the two sides are compared. Only those strings are masked,
 * so any other number that moves counts as content. package.json is compared as
 * JSON with only the bumped devDep keys removed; the lockfile by `lockfileMovesOnlyCivitai`.
 */
export function classifyChanges(changes, bumps) {
  const masks = bumps.flatMap(({ from, to }) => [from, to]);
  const mask = (s) => masks.reduce((acc, v) => acc.replace(versionRe(v), '\u0000V\u0000'), s);
  const contentPaths = [];
  for (const { path, before, after } of changes) {
    if (path === LOCKFILE) {
      if (before == null || after == null || !lockfileMovesOnlyCivitai(before, after, bumps)) contentPaths.push(path);
      continue;
    }
    if (before == null || after == null) {
      contentPaths.push(path);
      continue;
    }
    if (path === PKG_JSON) {
      const strip = (t) => {
        const j = JSON.parse(t);
        for (const { pkg } of bumps) if (j.devDependencies) delete j.devDependencies[pkg];
        return JSON.stringify(j);
      };
      if (strip(before) !== strip(after)) contentPaths.push(path);
      continue;
    }
    if (mask(before) !== mask(after)) contentPaths.push(path);
  }
  return { versionOnly: contentPaths.length === 0, contentPaths: contentPaths.sort() };
}

/**
 * Auto-merge, or not. Enabled only for a version-only change whose head pins
 * ALL equal npm latest (so `main` can only ever land at latest).
 */
export function autoMergeDecision({ bumps, headPins, latest, classification }) {
  const reasons = [];
  if (!classification.versionOnly) {
    reasons.push(`the regenerated output changed beyond version strings: ${classification.contentPaths.join(', ')}`);
  }
  for (const pkg of TRACKED_PACKAGES) {
    if (!latest[pkg]) reasons.push(`npm latest for ${pkg} is unknown, so "at latest" cannot be confirmed`);
    else if (headPins[pkg] !== latest[pkg]) reasons.push(`${pkg} would land at ${headPins[pkg]}, but npm latest is ${latest[pkg]}`);
  }
  for (const b of bumps) {
    if (compareSemver(b.from, b.to) > 0) reasons.push(`${b.pkg} moves DOWN, ${b.from} -> ${b.to}`);
  }
  return { enable: reasons.length === 0, reasons };
}

export function prTitle({ bumps, rehearsal = false }) {
  const moves = bumps.map((b) => `${b.pkg} ${b.from} -> ${b.to}`).join(', ');
  return `chore(deps): bump ${moves}${rehearsal ? ' (rehearsal)' : ''}`;
}

export function prBody({ bumps, classification, decision, runUrl = null, rehearsal = null }) {
  const run = runUrl ? `[this workflow run](${runUrl})` : 'the `appblocks-pin-bump` workflow';
  const rows = bumps.map((b) => `| \`${b.pkg}\` | ${b.from} | ${b.to} |`);
  const lines = [];
  if (!classification.versionOnly) {
    lines.push(
      `## ⚠️ \`${CONTENT_LABEL}\`: auto-merge is OFF`,
      '',
      'The regenerated output differs from `main` by more than the version strings, so a human has to read',
      'this diff before it merges. Files that changed beyond their version strings:',
      '',
      ...classification.contentPaths.map((p) => `- \`${p}\``),
      '',
    );
  } else if (decision.enable) {
    lines.push(
      '## Auto-merge (squash) is on',
      '',
      'The only changes are the version strings, and every tracked pin at this head equals npm `latest`,',
      "so this merges itself once `main`'s required checks pass.",
      '',
    );
  } else {
    lines.push('## Auto-merge is OFF', '', ...decision.reasons.map((r) => `- ${r}`), '');
  }
  if (rehearsal) {
    lines.push(
      '## Rehearsal',
      '',
      `This run first pinned \`${rehearsal.pkg}\` down to ${rehearsal.version} on this branch, then bumped it back`,
      'to npm latest, so the net diff against `main` is empty. It exists to exercise the whole path',
      "(install, literal rewrite, regeneration, PR, the PR's checks, auto-merge) while every pin is current.",
      '',
    );
  }
  lines.push(
    '## What moved',
    '',
    ...(rows.length ? ['| package | was | now |', '|---|---|---|', ...rows] : ['Nothing, net of `main` (see Rehearsal).']),
    '',
    `${run} bumped the pinned \`@civitai/*\` devDependencies to npm \`latest\`, rewrote the hand-written`,
    '`@civitai/<pkg>@x.y.z` literals that quote the pin (literals at other versions are historical claims and',
    'were left alone), and regenerated the reference pages with',
    '`APPBLOCKS_SNAPSHOT_ONLY=1 npm run gen:appblocks && npm run gen:appblocks:md`. The lockfile was verified',
    'with `npm ci`, and `check:ds-pins --offline` passed on the result.',
    '',
    '## Checks',
    '',
    'The bot pushes this branch and opens this PR with a GitHub App token, not the default `GITHUB_TOKEN`,',
    "so the ordinary `pull_request` runs start on every push and `main`'s required checks report here",
    'under their usual names. Auto-merge waits for those. `showcase-e2e` (the render test of the',
    'design-system packages) runs when its paths change but does not gate auto-merge, so read it on a',
    'design-system bump.',
    '',
    `This is \`${BOT_BRANCH}\`: one PR, extended by later runs and never force-pushed.`,
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    '',
  );
  return lines.join('\n');
}

/** `@civitai/<tracked>@<exact>` -> { pkg, version }; '' -> null; anything else throws. */
export function parseRehearse(s) {
  if (!s) return null;
  const m = /^(@civitai\/[a-z-]+)@(\d+\.\d+\.\d+)$/.exec(String(s).trim());
  if (!m || !TRACKED_PACKAGES.includes(m[1])) {
    throw new Error(`rehearse_from must be @civitai/<tracked package>@<x.y.z>, got ${JSON.stringify(s)}`);
  }
  return { pkg: m[1], version: m[2] };
}

// ---- registry --------------------------------------------------------------

const registryUrl = () => process.env.APPBLOCKS_NPM_REGISTRY || 'https://registry.npmjs.org';

/** One package's registry document. 404/410 = gone (real drift); anything else failing = transient. */
async function fetchDoc(pkg, registry) {
  const url = `${registry}/${pkg.replaceAll('/', '%2F')}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
    if (!res.ok) return { ok: false, gone: res.status === 404 || res.status === 410, reason: `HTTP ${res.status}` };
    return { ok: true, doc: await res.json() };
  } catch (err) {
    return { ok: false, gone: false, reason: err.message };
  }
}

/**
 * npm `latest` for each package.
 * @returns {Promise<{latest: Record<string,string>, versions: Record<string,string[]>, gone: string[], unreachable: string[]}>}
 */
export async function resolveLatest(pkgs, { registry = registryUrl() } = {}) {
  const latest = {};
  const versions = {};
  const gone = [];
  const unreachable = [];
  for (const pkg of pkgs) {
    const r = await fetchDoc(pkg, registry);
    const v = r.ok ? r.doc?.['dist-tags']?.latest : null;
    if (r.ok && typeof v === 'string' && EXACT.test(v)) {
      latest[pkg] = v;
      versions[pkg] = Object.keys(r.doc.versions || {});
    } else if (!r.ok && r.gone) {
      gone.push(pkg);
    } else {
      unreachable.push(pkg);
    }
  }
  return { latest, versions, gone, unreachable };
}

// ---- I/O -------------------------------------------------------------------

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function gh(args) {
  const res = spawnSync('gh', args, { cwd: repoRoot, encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const err = new Error(`gh ${args.slice(0, 2).join(' ')} failed (exit ${res.status}): ${(res.stderr || '').trim()}`);
    err.stderr = res.stderr || '';
    throw err;
  }
  return (res.stdout || '').trim();
}

function run(cmd, args, env = {}) {
  const res = spawnSync(cmd, args, { cwd: repoRoot, stdio: 'inherit', env: { ...process.env, ...env } });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${res.status}`);
}

function output(kv) {
  for (const [k, v] of Object.entries(kv)) console.log(`  ${k}=${v}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(kv).map(([k, v]) => `${k}=${v}\n`).join(''));
}

function runUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : null;
}

function collectMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectMarkdown(full, out);
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

/** The hand-authored docs check:ds-pins reads, repo-relative. */
function authoredDocs() {
  return [...DOC_ROOTS.flatMap((d) => collectMarkdown(join(repoRoot, d))), ...DOC_FILES.map((f) => join(repoRoot, f))]
    .map((f) => relative(repoRoot, f))
    .filter((f) => !UPSTREAM_OWNED_PAGES.has(f));
}

/** Every literal rewrite `bumps` would make, without writing. */
function previewLiterals(bumps) {
  const files = [];
  let total = 0;
  for (const f of authoredDocs()) {
    const { count } = rewriteLiterals(f, readFileSync(join(repoRoot, f), 'utf8'), bumps);
    if (count) {
      files.push(f);
      total += count;
    }
  }
  return { files, total };
}

function readPins() {
  return pinsOf(readFileSync(join(repoRoot, PKG_JSON), 'utf8'));
}

/**
 * The paths in `git status --porcelain=v1 -z` output. Pure. The input must be
 * UNTRIMMED: each record starts with a two-character status, and a leading
 * space is part of the first one (` M path`). Trimming it cut the first path's
 * first character, found by running --prepare end to end.
 */
export function parsePorcelainZ(raw) {
  const recs = String(raw).split('\0');
  const out = [];
  for (let i = 0; i < recs.length; i++) {
    if (recs[i].length < 4) continue;
    out.push(recs[i].slice(3));
    if (recs[i][0] === 'R' || recs[i][0] === 'C') i++;
  }
  return out;
}

/** Paths with any change in the working tree. Not through `git()`, which trims. */
function changedPaths() {
  return parsePorcelainZ(
    execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' }),
  );
}

/** The pages the md generator owns: every REGIONS page, and the generated sub-page dirs. */
async function ownedPages() {
  const { REGIONS } = await import(pathToFileURL(join(repoRoot, 'scripts', 'appblocks-md.mjs')).href);
  const { REFERENCE_SPLITS } = await import(
    pathToFileURL(join(repoRoot, '.vitepress', 'theme', 'components', 'referenceSplit.shared.mjs')).href
  );
  return { owned: new Set(REGIONS.map((r) => r.page)), dirs: Object.values(REFERENCE_SPLITS).map((s) => s.hub.slice(1)) };
}

/**
 * Apply `bumps` to the working tree and commit them: install, verify the
 * lockfile with `npm ci`, rewrite the literals, regenerate, check the result,
 * stage ONLY the paths this is allowed to touch.
 */
async function applyAndCommit(bumps, message) {
  const before = new Set(changedPaths());
  if (before.size) throw new Error(`the tree is not clean before the bump: ${[...before].join(', ')}`);

  run('npm', ['install', '--save-dev', '--save-exact', '--no-audit', '--no-fund', ...bumps.map((b) => `${b.pkg}@${b.to}`)]);
  const pins = readPins();
  for (const b of bumps) {
    if (pins[b.pkg] !== b.to) throw new Error(`npm install left ${b.pkg} at ${pins[b.pkg]}, not ${b.to}`);
  }
  // `npm install` tolerates peer conflicts that `npm ci` refuses (ERESOLVE), and
  // CI installs with `npm ci`, so verify the lockfile the way CI will read it.
  run('npm', ['ci', '--no-audit', '--no-fund']);

  const rewritten = [];
  for (const f of authoredDocs()) {
    const p = join(repoRoot, f);
    const { text, count } = rewriteLiterals(f, readFileSync(p, 'utf8'), bumps);
    if (count) {
      writeFileSync(p, text);
      rewritten.push(f);
      console.log(`  ↳ ${count} literal(s) in ${f}`);
    }
  }

  run(process.execPath, [join(repoRoot, 'scripts', 'gen-appblocks.mjs')], { APPBLOCKS_SNAPSHOT_ONLY: '1' });
  run(process.execPath, [join(repoRoot, 'scripts', 'gen-appblocks-md.mjs')], { APPBLOCKS_SNAPSHOT_ONLY: '1' });
  run(process.execPath, [join(repoRoot, 'scripts', 'check-design-system-pins.mjs'), '--offline']);

  const { owned, dirs } = await ownedPages();
  const inOwnedDir = (p) => dirs.some((d) => p.startsWith(`${d}/`) && p.endsWith('.md') && !p.slice(d.length + 1).includes('/'));
  const allowed = (p) => p === PKG_JSON || p === LOCKFILE || rewritten.includes(p) || owned.has(p) || inOwnedDir(p);
  const changed = changedPaths();
  const unexpected = changed.filter((p) => !allowed(p));
  if (unexpected.length) {
    throw new Error(`the bump changed files it does not own, so nothing was committed: ${unexpected.join(', ')}`);
  }
  if (!changed.length) throw new Error('the bump changed nothing, which cannot be right for a planned version move');
  git(['add', '--', ...changed]);
  git(['commit', '-q', '-m', message]);
  console.log(`  ✓ committed ${changed.length} file(s): ${message.split('\n')[0]}`);
}

function remoteBranchSha(branch) {
  const res = spawnSync('git', ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`], { cwd: repoRoot, encoding: 'utf8' });
  if (res.status === 2) return null;
  if (res.status !== 0) throw new Error(`could not read origin/${branch} (ls-remote exit ${res.status}); refusing to guess`);
  return res.stdout.trim().split(/\s+/)[0] || null;
}

/** Shared head of both CI modes: npm latest for every tracked package, or a reason to stop. */
async function latestOrStop() {
  const r = await resolveLatest(TRACKED_PACKAGES);
  if (r.gone.length) {
    console.error(`  ✗ npm does not serve: ${r.gone.join(', ')} (404/410). That is real drift, not a network blip.`);
    process.exit(1);
  }
  if (r.unreachable.length) {
    console.log(`  ⊘ could not read npm latest for ${r.unreachable.join(', ')}; skip (no partial bump, no false fail)`);
    return null;
  }
  return r;
}

async function dryRun(rehearse) {
  const r = await latestOrStop();
  if (!r) return;
  let pins = readPins();
  if (rehearse) {
    console.log(`  rehearsal: would first pin ${rehearse.pkg} ${pins[rehearse.pkg]} -> ${rehearse.version}`);
    pins = { ...pins, [rehearse.pkg]: rehearse.version };
  }
  const plan = planBump(pins, r.latest);
  for (const pkg of TRACKED_PACKAGES) console.log(`  · ${pkg}: pinned ${pins[pkg]}, npm latest ${r.latest[pkg]}`);
  if (!plan.length) {
    console.log('\nNothing to bump: every tracked pin is at (or ahead of) npm latest.');
  } else {
    console.log('\nWould bump:');
    for (const b of plan) console.log(`  ${b.pkg} ${b.from} -> ${b.to}`);
    if (!rehearse) {
      const { files, total } = previewLiterals(plan);
      console.log(`  and rewrite ${total} literal(s) in ${files.length} file(s)`);
    }
  }
  console.log('\n--dry-run: nothing written (no install, no regeneration, no git).');
}

async function prepare(outDir, rehearse) {
  mkdirSync(outDir, { recursive: true });
  const r = await latestOrStop();
  if (!r) return output({ action: 'none' });

  git(['config', 'user.name', 'github-actions[bot]']);
  git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  git(['fetch', '-q', 'origin', `+refs/heads/${BASE}:${BASE_REF}`]);
  const baseSha = git(['rev-parse', BASE_REF]);

  const pr = openPrFor({ head: BOT_BRANCH, base: BASE }, gh);
  const remoteSha = remoteBranchSha(BOT_BRANCH);
  let branchBaseTip;
  if (pr) {
    if (rehearse) throw new Error(`PR #${pr.number} is open on ${BOT_BRANCH}; a rehearsal needs no open bot PR`);
    git(['fetch', '-q', 'origin', `+refs/heads/${BOT_BRANCH}:refs/pin-bump/remote`]);
    git(['checkout', '-q', '-B', BOT_BRANCH, 'refs/pin-bump/remote']);
    branchBaseTip = git(['rev-parse', 'HEAD']);
    const m = spawnSync('git', ['merge', '--no-edit', '-m', `chore: sync ${BOT_BRANCH} with ${BASE}`, BASE_REF], { cwd: repoRoot, encoding: 'utf8' });
    if (m.status !== 0) {
      spawnSync('git', ['merge', '--abort'], { cwd: repoRoot });
      throw new Error(`could not merge ${BASE} into ${BOT_BRANCH} (PR #${pr.number}); reconcile it by hand:\n${m.stdout}${m.stderr}`);
    }
    console.log(`  ↳ extending ${BOT_BRANCH} (PR #${pr.number}), ${BASE} merged in`);
  } else if (remoteSha) {
    throw new Error(
      `${BOT_BRANCH} exists on origin (${remoteSha.slice(0, 8)}) but has no open PR, so a human closed it. ` +
        'Refusing to overwrite it; delete the branch and the next run starts fresh.',
    );
  } else {
    git(['checkout', '-q', '-B', BOT_BRANCH, BASE_REF]);
    branchBaseTip = null;
    console.log(`  ↳ creating ${BOT_BRANCH} from ${BASE} ${baseSha.slice(0, 8)}`);
  }
  // The branch can hold a different lockfile from the checkout `npm ci` installed.
  run('npm', ['ci', '--no-audit', '--no-fund']);

  if (rehearse) {
    const pin = readPins()[rehearse.pkg];
    if (compareSemver(rehearse.version, pin) >= 0) throw new Error(`rehearsal version ${rehearse.version} is not below the pin ${pin}`);
    if (!r.versions[rehearse.pkg].includes(rehearse.version)) throw new Error(`${rehearse.pkg}@${rehearse.version} is not published`);
    await applyAndCommit(
      [{ pkg: rehearse.pkg, from: pin, to: rehearse.version }],
      `chore(deps): rehearsal, pin ${rehearse.pkg} down to ${rehearse.version}\n\nThe next commit bumps it back to npm latest; the PR's net diff is empty.`,
    );
  }

  const plan = planBump(readPins(), r.latest);
  if (!plan.length) {
    console.log('\nNothing to bump: every tracked pin is at (or ahead of) npm latest. No branch pushed, no PR touched.');
    return output({ action: 'none' });
  }
  await applyAndCommit(plan, `${prTitle({ bumps: plan })}\n\nOpened automatically by .github/workflows/appblocks-pin-bump.yml.`);

  const head = git(['rev-parse', 'HEAD']);
  const range = `${branchBaseTip || baseSha}..refs/heads/${BOT_BRANCH}`;
  git(['bundle', 'create', join(outDir, 'branch.bundle'), range]);
  writeFileSync(
    join(outDir, 'result.json'),
    `${JSON.stringify({ plan, rehearse, baseSha, branchBaseTip, head }, null, 2)}\n`,
  );
  console.log(`\n  ✓ ${BOT_BRANCH} at ${head.slice(0, 8)} bundled for the publish job`);
  return output({ action: 'publish' });
}

function showOrNull(ref, path) {
  const res = spawnSync('git', ['show', `${ref}:${path}`], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return res.status === 0 ? res.stdout : null;
}

async function publish(inDir) {
  const result = JSON.parse(readFileSync(join(inDir, 'result.json'), 'utf8'));
  git(['fetch', '-q', join(inDir, 'branch.bundle'), `+refs/heads/${BOT_BRANCH}:${HEAD_REF}`]);
  const head = git(['rev-parse', HEAD_REF]);
  if (head !== result.head) throw new Error(`the bundle holds ${head}, but prepare reported ${result.head}`);
  git(['fetch', '-q', 'origin', `+refs/heads/${BASE}:${BASE_REF}`]);
  const remote = remoteBranchSha(BOT_BRANCH);
  if (remote !== result.branchBaseTip) {
    throw new Error(`${BOT_BRANCH} moved since prepare (expected ${result.branchBaseTip}, found ${remote}); nothing pushed`);
  }

  // Recompute the PR's diff from git, against the merge base (what GitHub shows).
  const mb = git(['merge-base', BASE_REF, HEAD_REF]);
  const paths = git(['diff', '--name-only', '-z', mb, HEAD_REF]).split('\0').filter(Boolean);
  const changes = paths.map((p) => ({ path: p, before: showOrNull(mb, p), after: showOrNull(HEAD_REF, p) }));
  const headPkg = showOrNull(HEAD_REF, PKG_JSON);
  const bumps = bumpsBetween(showOrNull(mb, PKG_JSON), headPkg);
  const classification = classifyChanges(changes, bumps);
  const r = await resolveLatest(TRACKED_PACKAGES);
  const decision = autoMergeDecision({ bumps, headPins: pinsOf(headPkg), latest: r.latest, classification });
  console.log(`  diff vs ${BASE}: ${paths.length} file(s); ${classification.versionOnly ? 'version-only' : `CONTENT CHANGE in ${classification.contentPaths.join(', ')}`}`);
  console.log(`  auto-merge: ${decision.enable ? 'enable' : `off (${decision.reasons.join('; ')})`}`);

  // 🔴 AUTO-MERGE OFF BEFORE THE NEW HEAD EXISTS. An earlier run may have
  // enabled it on a version-only head; if this head is a content change and
  // anything below failed before auto-merge was re-decided, the old enable
  // would merge it once its checks went green. So it is cleared first, a
  // failure to clear it stops the run before the push, and it is enabled again
  // only as the LAST step, for this exact head.
  const existing = openPrFor({ head: BOT_BRANCH, base: BASE }, gh);
  if (existing) {
    const am = JSON.parse(gh(['pr', 'view', String(existing.number), '--json', 'autoMergeRequest'])).autoMergeRequest;
    if (am) {
      gh(['pr', 'merge', String(existing.number), '--disable-auto']);
      console.log(`  ↳ auto-merge cleared on #${existing.number} before pushing a new head`);
    }
  }

  git(['push', 'origin', `${HEAD_REF}:refs/heads/${BOT_BRANCH}`]);
  console.log(`  ✓ pushed ${BOT_BRANCH} at ${head.slice(0, 8)}`);

  const rehearsal = result.rehearse || null;
  const title = prTitle({ bumps: bumps.length ? bumps : result.plan, rehearsal: Boolean(rehearsal) });
  const body = prBody({ bumps, classification, decision, runUrl: runUrl(), rehearsal });
  const dir = mkdtempSync(join(tmpdir(), 'pin-bump-pr-'));
  const bodyFile = join(dir, 'body.md');
  writeFileSync(bodyFile, body);
  try {
    let pr = openPrFor({ head: BOT_BRANCH, base: BASE }, gh);
    if (pr) {
      gh(['pr', 'edit', String(pr.number), '--title', title, '--body-file', bodyFile]);
      console.log(`  ✓ updated PR #${pr.number}`);
    } else {
      const url = gh(['pr', 'create', '--base', BASE, '--head', BOT_BRANCH, '--title', title, '--body-file', bodyFile]);
      console.log(`  ✓ opened ${url}`);
      pr = openPrFor({ head: BOT_BRANCH, base: BASE }, gh);
      if (!pr) throw new Error(`gh pr create printed ${url}, but no open PR from ${BOT_BRANCH} is listed`);
    }
    const n = String(pr.number);
    if (!classification.versionOnly) {
      gh(['label', 'create', CONTENT_LABEL, '--force', '--color', 'D93F0B', '--description', 'Pin bump whose regenerated docs changed beyond version strings']);
      gh(['pr', 'edit', n, '--add-label', CONTENT_LABEL]);
    } else {
      const labels = JSON.parse(gh(['pr', 'view', n, '--json', 'labels'])).labels.map((l) => l.name);
      if (labels.includes(CONTENT_LABEL)) gh(['pr', 'edit', n, '--remove-label', CONTENT_LABEL]);
    }

    if (decision.enable) {
      gh(['pr', 'merge', n, '--auto', '--squash', '--match-head-commit', head]);
      console.log(`  ✓ auto-merge (squash) enabled on #${n} for head ${head.slice(0, 8)}`);
    } else {
      console.log(`  auto-merge left OFF on #${n}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const val = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const rehearse = parseRehearse(val('--rehearse-from') ?? process.env.REHEARSE_FROM ?? '');
  console.log('appblocks-pin-bump: the @civitai/* devDependency pins vs npm latest\n');

  if (argv.includes('--dry-run')) return dryRun(rehearse);
  if (argv.includes('--prepare') || argv.includes('--publish')) {
    if (!process.env.CI) {
      console.error('  ✗ --prepare and --publish commit and push, so they refuse to run outside CI. Use --dry-run.');
      process.exit(1);
    }
    if (argv.includes('--prepare')) return prepare(val('--out'), rehearse);
    return publish(val('--in'));
  }
  console.error('usage: bump-appblocks-pins.mjs --dry-run | --prepare --out <dir> | --publish --in <dir>');
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`bump-appblocks-pins: ${err.stack || err.message}`);
    process.exit(1);
  });
}
