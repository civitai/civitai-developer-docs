#!/usr/bin/env node
// Tests for scripts/gen-appblocks-platform-feedback.mjs: the page's limits come from the
// CLI's constants, and every way the source can stop yielding them fails the run.
//
// Each case copies the two committed snapshots into a temp dir, doctors them, and runs
// the generator against that dir (APPBLOCKS_SNAPSHOTS_DIR) with its output redirected
// (APPBLOCKS_OUT_DIR), so the working tree is never touched.
//
// The doctored values (2345 / 678 / 91) are pairwise distinct and equal to no value the
// real sources hold, so a generator that hardcoded a number could not pass case 1.
//
// USAGE  npm run test:appblocks:platform-feedback
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const GEN = join(here, 'gen-appblocks-platform-feedback.mjs');
const CLI_SNAP = 'platform_feedback.go';
const MCP_SNAP = 'mcp-platform-feedback.ts';
const realCli = readFileSync(join(repoRoot, 'appblocks-snapshots', CLI_SNAP), 'utf8');
const realMcp = readFileSync(join(repoRoot, 'appblocks-snapshots', MCP_SNAP), 'utf8');

/** Replace exactly one occurrence of `re` in `text`, or throw (a fixture that no longer applies is a broken test). */
function sub(text, re, to) {
  const hits = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? [];
  if (hits.length !== 1) throw new Error(`fixture: ${re} matched ${hits.length} times, expected 1`);
  return text.replace(re, to);
}

const cliWith = (msg, exc, refs) =>
  sub(
    sub(sub(realCli, /^(\s*PlatformFeedbackMessageMax\s*=\s*)\d+/m, `$1${msg}`), /^(\s*PlatformFeedbackErrorExcerptMax\s*=\s*)\d+/m, `$1${exc}`),
    /^(\s*PlatformFeedbackStatusRefsMax\s*=\s*)\d+/m,
    `$1${refs}`,
  );
const mcpWith = (msg, exc, refs) =>
  sub(sub(sub(realMcp, /^(\s*message:\s*)\d+/m, `$1${msg}`), /^(\s*errorExcerpt:\s*)\d+/m, `$1${exc}`), /^(\s*statusRefs:\s*)\d+/m, `$1${refs}`);

function run(cli, mcp) {
  const dir = mkdtempSync(join(tmpdir(), 'pf-gen-'));
  try {
    writeFileSync(join(dir, CLI_SNAP), cli);
    writeFileSync(join(dir, MCP_SNAP), mcp);
    const env = { ...process.env, APPBLOCKS_SNAPSHOT_ONLY: '1', APPBLOCKS_SNAPSHOTS_DIR: dir, APPBLOCKS_OUT_DIR: join(dir, 'out') };
    try {
      execFileSync(process.execPath, [GEN], { env, encoding: 'utf8', stdio: 'pipe' });
      return { ok: true, artifact: JSON.parse(readFileSync(join(dir, 'out', 'platform-feedback.json'), 'utf8')) };
    } catch (err) {
      return { ok: false, stderr: String(err.stderr ?? '') + String(err.message ?? '') };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

let failed = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ` — ${detail}`}`);
  if (!cond) failed++;
}

// 1. The values come from the source.
{
  const r = run(cliWith(2345, 678, 91), mcpWith(2345, 678, 91));
  check('generates from the CLI constants', r.ok, r.stderr);
  if (r.ok) {
    const v = r.artifact.values;
    check('values are the doctored constants', v.message === 2345 && v.errorExcerpt === 678 && v.statusRefs === 91, JSON.stringify(v));
    const text = r.artifact.limits.map((l) => l.value).join('\n');
    for (const want of ['2,345 characters', 'first 678 characters', 'up to 91;']) {
      check(`a row states ${JSON.stringify(want)}`, text.includes(want), text);
    }
  }
}

// 2. A renamed constant is a red run naming it, never a blank cell.
{
  const r = run(sub(realCli, /PlatformFeedbackStatusRefsMax = /, 'PlatformFeedbackRefsLimit = '), realMcp);
  check('renamed CLI constant fails', !r.ok, 'generator exited 0');
  check('…naming the constant', !r.ok && r.stderr.includes('expected exactly one `PlatformFeedbackStatusRefsMax = <n>`'), r.stderr);
}

// 2b. A constant defined twice is ambiguous and fails, in either source.
{
  const r = run(realCli.replace(/^(\s*PlatformFeedbackMessageMax\s*=\s*\d+)$/m, '$1\n\tPlatformFeedbackMessageMax = 9999'), realMcp);
  check('duplicated CLI constant fails', !r.ok && r.stderr.includes('expected exactly one `PlatformFeedbackMessageMax = <n>` in internal/appapi/platform_feedback.go, found 2'), r.stderr);
}
{
  const r = run(realCli, realMcp.replace(/^(\s*statusRefs:\s*\d+,)$/m, '$1\n  statusRefs: 9999,'));
  check('duplicated MCP LIMITS key fails', !r.ok && r.stderr.includes('expected exactly one `statusRefs: <n>` in LIMITS in src/lib/platform-feedback.ts, found 2'), r.stderr);
}

// 3. A non-positive value fails.
{
  const r = run(cliWith(0, 500, 50), mcpWith(0, 500, 50));
  check('zero bound fails', !r.ok && r.stderr.includes('PlatformFeedbackMessageMax in internal/appapi/platform_feedback.go is "0", expected a positive integer literal'), r.stderr);
}

// 4. The CLI and the MCP server disagreeing fails (site/mcp/tools.md points at this table).
{
  const r = run(cliWith(2000, 500, 50), mcpWith(2000, 400, 50));
  check('CLI vs MCP disagreement fails', !r.ok && r.stderr.includes('PlatformFeedbackErrorExcerptMax = 500 (cli) vs LIMITS.errorExcerpt = 400 (mcp)'), r.stderr);
}

// 5. The MCP LIMITS block going missing fails.
{
  const r = run(realCli, sub(realMcp, /export const LIMITS = \{/, 'export const BOUNDS = {'));
  check('missing MCP LIMITS fails', !r.ok && r.stderr.includes('`export const LIMITS = { … }` not found'), r.stderr);
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall platform-feedback generator checks passed');
