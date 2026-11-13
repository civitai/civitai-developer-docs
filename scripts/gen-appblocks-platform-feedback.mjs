// Generate public/appblocks/platform-feedback.json — the size limits of a platform
// feedback report, for <PlatformFeedbackLimits> on site/guide/platform-feedback.md.
//
// Sources (sibling checkout @ origin/main, else the committed snapshot of the same file
// under appblocks-snapshots/, which `check:snapshots` keeps honest — the same resolution
// gen-appblocks-storage.mjs uses):
//   - civitai/cli internal/appapi/platform_feedback.go
//       PlatformFeedbackMessageMax, PlatformFeedbackErrorExcerptMax, PlatformFeedbackStatusRefsMax
//   - civitai/civitai-mcp-server src/lib/platform-feedback.ts
//       LIMITS.message, LIMITS.errorExcerpt, LIMITS.statusRefs
//
// WHY THIS IS GENERATED. The CLI enforces these numbers before it sends anything, and
// the page used to restate them by hand. The VALUES come from the CLI's source; only the
// row LABELS are written here. A constant that cannot be found or is not a positive
// integer fails the run — a renamed constant is a red build, never a blank cell.
//
// WHY THE MCP SERVER IS READ TOO. site/mcp/tools.md documents the same channel through
// the MCP server's tools and points at this table instead of restating the numbers. That
// is only true while the MCP server's copy of each bound equals the CLI's, so a
// disagreement fails the run rather than letting one table speak for both clients.
import { log, readSiblingSource, writeArtifact } from './appblocks-util.mjs';

const CLI = ['cli', 'internal/appapi/platform_feedback.go', 'platform_feedback.go'];
const MCP = ['mcp', 'src/lib/platform-feedback.ts', 'mcp-platform-feedback.ts'];

const fail = (msg) => {
  throw new Error(`gen-appblocks-platform-feedback: ${msg}`);
};

/** A positive integer literal (Go/TS `_` separators allowed), or a throw naming it. */
function posInt(text, what) {
  const v = Number(String(text).replace(/_/g, ''));
  if (!Number.isInteger(v) || v <= 0) fail(`${what} is ${JSON.stringify(text)}, expected a positive integer literal`);
  return v;
}

/** `Name = 123` inside a Go const block. Exactly one definition, or a throw. */
function goConst(text, name, file) {
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(\\S+?)\\s*(?://.*)?$`, 'gm');
  const hits = [...text.matchAll(re)];
  if (hits.length !== 1) fail(`expected exactly one \`${name} = <n>\` in ${file}, found ${hits.length} (renamed or moved?)`);
  return posInt(hits[0][1], `${name} in ${file}`);
}

/** `key: 123` inside `export const LIMITS = { … }`. Exactly one, or a throw. */
function tsLimit(text, key, file) {
  const block = text.match(/export const LIMITS = \{([\s\S]*?)\}/);
  if (!block) fail(`\`export const LIMITS = { … }\` not found in ${file} (renamed or moved?)`);
  const hits = [...block[1].matchAll(new RegExp(`^\\s*${key}:\\s*([^,\\s]+),?\\s*$`, 'gm'))];
  if (hits.length !== 1) fail(`expected exactly one \`${key}: <n>\` in LIMITS in ${file}, found ${hits.length}`);
  return posInt(hits[0][1], `LIMITS.${key} in ${file}`);
}

const cli = readSiblingSource(...CLI);
const mcp = readSiblingSource(...MCP);

// Each bound: [artifact key, CLI constant, MCP LIMITS key].
const BOUNDS = [
  ['message', 'PlatformFeedbackMessageMax', 'message'],
  ['errorExcerpt', 'PlatformFeedbackErrorExcerptMax', 'errorExcerpt'],
  ['statusRefs', 'PlatformFeedbackStatusRefsMax', 'statusRefs'],
];
const values = {};
const disagree = [];
for (const [key, goName, tsKey] of BOUNDS) {
  const fromCli = goConst(cli.text, goName, CLI[1]);
  const fromMcp = tsLimit(mcp.text, tsKey, MCP[1]);
  if (fromCli !== fromMcp) disagree.push(`${goName} = ${fromCli} (cli) vs LIMITS.${tsKey} = ${fromMcp} (mcp)`);
  values[key] = fromCli;
}
if (disagree.length) {
  fail(
    `the CLI and the MCP server disagree on a platform feedback bound: ${disagree.join('; ')}. ` +
      'site/mcp/tools.md points at the one generated table for both, so this must be reconciled ' +
      'upstream (or the MCP page must stop pointing at it) before the docs can build.',
  );
}

const n = (v) => v.toLocaleString('en-US');

/** Each row: [item, value]. Labels are the only hand-written part. */
const limits = [
  ['Message', `1 to ${n(values.message)} characters, counted after redaction`],
  ['Error excerpt (`--error-file`, `--error -`)', `the first ${n(values.errorExcerpt)} characters left after redaction are sent`],
  ['Refs per `civitai feedback status`', `up to ${n(values.statusRefs)}; with no ref, the newest ${n(values.statusRefs)} this machine sent`],
];

const artifact = {
  generatedAt: new Date().toISOString(),
  sources: [cli.source, mcp.source],
  values,
  limits: limits.map(([item, value]) => ({ item, value })),
};
const dest = writeArtifact('platform-feedback.json', artifact);
log(`platform-feedback: wrote ${limits.length} limit rows -> ${dest}`);
log(`  from ${cli.source}`);
log(`  from ${mcp.source}`);
