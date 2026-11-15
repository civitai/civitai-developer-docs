/**
 * check-external-doc-claims.mjs
 * -----------------------------
 * Runs check-doc-claims.mjs's claim kinds over docs that live in OTHER repos,
 * where most of the audited docs drift was found: the CLI's README and the
 * AGENTS.md template it writes into new apps, and the civitai-app-starters
 * package READMEs, BREAKING.md, PORTING.md and package AGENTS.md files.
 *
 * ADVISORY, NIGHTLY. It runs as a step of appblocks-drift.yml's `drift` job,
 * never on a PR: what it grades is another repo's `main`, which moves without a
 * docs PR, so it belongs with the other upstream-movement checks. A red step
 * there is delivered by that workflow's `notify` job (one tracking issue, named
 * steps, closed by the next clean run), and the findings are written to the
 * job summary. It is not a required check and cannot block anything.
 *
 * ONE CHECKER, NOT A COPY. The files are FETCHED (raw.githubusercontent.com, at
 * each repo's `main`) and graded by the same gradePages() against THIS repo's
 * pins: the help snapshot, the @civitai/* devDeps, the bundled manifest schema.
 * No checker code lives in the other repos.
 *
 * RESULTS PER FILE (the check-appblocks-snapshots.mjs contract)
 *   200          graded.
 *   404 / 410    RED: a file this list names is gone upstream (renamed or
 *                removed), so the list no longer covers what it says it does.
 *   network / 5xx / 403 / 429   SKIPPED, loudly. Somebody else's outage is not
 *                drift.
 * And per corpus: ZERO claims extracted is RED, whatever the reason (a broken
 * parser, or every file skipped). "Checked nothing" must not read as "clean".
 *
 * BASELINE, PER CORPUS: scripts/doc-claims-external-baseline.json, shaped
 * { "<owner/repo>": { "<path>␟<kind>␟<claim>": "<reason>" } }. Same shrink-only
 * rule as the in-repo baseline: a finding not in it is NEW (red), an entry that
 * no longer reproduces is STALE (red). An entry for a file that was SKIPPED this
 * run is neither: nothing is known about it.
 *
 * WHAT IT CANNOT SEE (on top of check-doc-claims.mjs's own list)
 *   - Files not in EXTERNAL_CORPORA. A new package README upstream is invisible
 *     until it is added here; the list is explicit so that a removed file is a
 *     404, which is loud.
 *   - Upstream AHEAD of the pins. A hook added on starters `main` and not yet
 *     released reads as "exported by none": true of every published version,
 *     and gone once the release and the pin bump land (which then makes its
 *     baseline entry stale). The same for a CLI command newer than the help
 *     snapshot's binary.
 *   - The `mcp-*` kinds: they are tied to this repo's MCP pages (mcpSurface).
 *
 * USAGE
 *   npm run check:doc-claims:external [-- --no-baseline]
 */

import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAIM_KINDS, compareBaseline, gradePages, loadSources, sourceProblems } from './check-doc-claims.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EXTERNAL_BASELINE_PATH = join(repoRoot, 'scripts', 'doc-claims-external-baseline.json');

const STARTER_PACKAGES = [
  'civitai-agent-runner',
  'civitai-app-sdk',
  'civitai-blocks-react',
  'civitai-components',
  'civitai-components-chat',
  'civitai-components-react',
  'civitai-sdk',
  'civitai-theme',
];

export const EXTERNAL_CORPORA = [
  {
    name: 'civitai/cli',
    base: 'https://raw.githubusercontent.com/civitai/cli/main',
    files: ['README.md', 'internal/cmd/templates/agents-app.md'],
  },
  {
    name: 'civitai/civitai-app-starters',
    base: 'https://raw.githubusercontent.com/civitai/civitai-app-starters/main',
    files: [
      ...STARTER_PACKAGES.map((p) => `packages/${p}/README.md`),
      'packages/civitai-sdk/BREAKING.md',
      'PORTING.md',
      'packages/civitai-app-sdk/AGENTS.md',
      'packages/civitai-blocks-react/AGENTS.md',
    ],
  },
];

/** @returns {Promise<{ok: true, text: string} | {ok: false, gone?: boolean, status?: number, reason: string}>} */
export async function fetchRaw(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (res.ok) return { ok: true, text: await res.text() };
    return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Grade every corpus. Pure apart from `fetchText(url)`, which the tests replace.
 * Every external page gets the hook kind (they are all App Blocks docs) and no
 * `mcp-*` kind.
 */
export async function gradeExternal(corpora, src, baseline, fetchText = fetchRaw) {
  const results = [];
  for (const corpus of corpora) {
    const r = { name: corpus.name, graded: [], gone: [], skipped: [], problems: [] };
    const pages = [];
    for (const file of corpus.files) {
      const got = await fetchText(`${corpus.base}/${file}`);
      if (got.ok) {
        pages.push({ file, md: got.text });
        r.graded.push(file);
      } else if (got.gone) {
        r.gone.push({ file, reason: got.reason });
      } else {
        r.skipped.push({ file, reason: got.reason });
      }
    }
    const { findings, counts } = gradePages(pages, src, { hooks: () => true, mcp: () => null });
    r.findings = findings;
    r.counts = counts;
    const total = CLAIM_KINDS.reduce((n, k) => n + counts[k], 0);
    if (total === 0) {
      r.problems.push(
        `extracted 0 claims from ${corpus.name} (${r.graded.length} file(s) graded, ${r.skipped.length} skipped) — nothing was checked`,
      );
    }
    // Only entries for files graded THIS run can be stale.
    const own = Object.fromEntries(
      Object.entries(baseline[corpus.name] ?? {}).filter(([k]) => r.graded.includes(k.split('␟')[0])),
    );
    Object.assign(r, compareBaseline(findings, own));
    r.red = r.gone.length + r.fresh.length + r.stale.length + r.problems.length > 0;
    results.push(r);
  }
  return results;
}

/** The job-summary / console report, as markdown. */
export function renderReport(results) {
  const out = ['## Doc claims in other repos (advisory, nightly)', ''];
  out.push('| corpus | files graded | skipped | gone (404/410) | claims | unresolved | baselined | new | stale |');
  out.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const claims = CLAIM_KINDS.reduce((n, k) => n + r.counts[k], 0);
    out.push(
      `| ${r.name} | ${r.graded.length} | ${r.skipped.length} | ${r.gone.length} | ${claims} | ${r.findings.length} | ` +
        `${r.findings.length - r.fresh.length} | ${r.fresh.length} | ${r.stale.length} |`,
    );
  }
  for (const r of results) {
    const lines = [
      ...r.gone.map((g) => `- ✗ GONE \`${g.file}\` (${g.reason}): renamed or removed upstream; update EXTERNAL_CORPORA`),
      ...r.fresh.map((f) => `- ✗ NEW \`${f.file}:${f.line}\` [${f.kind}] ${f.why}`),
      ...r.stale.map((k) => `- ✗ STALE \`${k.split('␟').join(' · ')}\`: no longer reproduces; delete it from scripts/doc-claims-external-baseline.json`),
      ...r.problems.map((p) => `- ✗ ${p}`),
      ...r.skipped.map((s) => `- ⊘ SKIPPED \`${s.file}\` (${s.reason}): not checked this run`),
    ];
    if (lines.length) out.push('', `### ${r.name}`, '', ...lines);
  }
  out.push(
    '',
    'Closing condition: this step goes green when every NEW finding is fixed upstream or baselined with a reason,',
    'every STALE entry is deleted, and every GONE path is updated; the appblocks-drift issue closes on the next clean run.',
  );
  return out.join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  for (const a of args) if (a !== '--no-baseline') throw new Error(`unknown argument ${a}`);
  const src = loadSources();
  const problems = sourceProblems(src);
  const baseline = args.includes('--no-baseline') ? {} : JSON.parse(readFileSync(EXTERNAL_BASELINE_PATH, 'utf8'));
  for (const name of Object.keys(baseline)) {
    if (!EXTERNAL_CORPORA.some((c) => c.name === name)) problems.push(`baseline names corpus ${name}, which EXTERNAL_CORPORA does not`);
  }
  const results = await gradeExternal(EXTERNAL_CORPORA, src, baseline);
  const report = renderReport(results) + problems.map((p) => `- ✗ ${p}\n`).join('');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  if (problems.length || results.some((r) => r.red)) process.exit(1);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
