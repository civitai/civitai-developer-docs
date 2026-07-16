// Generate public/appblocks/cli.json — the canonical `civitai` CLI reference for
// the App-authoring command group (`civitai app …`).
//
// SOURCE: the Go `civitai` CLI (repo civitai/cli, commands cobra-defined). This
// is the CANONICAL dev CLI — it replaced the deprecated npm `@civitai/blocks-cli`
// (whose `init/dev/deploy` no longer describe the real tool). The App lifecycle
// is create → validate → submit (the platform builds), NOT a client-side deploy.
//
// Resolution mirrors the sibling generators' "prefer live, snapshot is the
// hermetic CI fallback" philosophy:
//   1. If a `civitai` binary is resolvable (CIVITAI_CLI_BIN or on PATH) and
//      APPBLOCKS_SNAPSHOT_ONLY!=1, capture `civitai app --help` + each
//      `civitai app <cmd> --help` live and parse the cobra help text.
//   2. Otherwise parse the committed snapshot appblocks-snapshots/civitai-cli-help.txt
//      (CI has no binary — this keeps the build hermetic + deterministic).
//
// Refresh the committed snapshot from a newer binary with:
//   node scripts/gen-appblocks-cli.mjs --write-snapshot
//
// dev-token / dev-tunnel are invite-gated pre-GA; they are marked status:'gated'
// so the page badges them instead of implying open access.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { log, snapshotsDir, writeArtifact } from './appblocks-util.mjs';

// Canonical App-authoring command set, in lifecycle order (matches the cobra
// AddCommand order in civitai/cli internal/cmd/app.go). Asserting this exact set
// is present is the drift-guard: a renamed/removed command trips the build.
const APP_COMMANDS = [
  'create',
  'init',
  'validate',
  'submit',
  'status',
  'withdraw',
  'dev-token',
  'dev-tunnel',
  'pull',
];

// Commands gated behind the invite-only pre-GA cohort (server kill-switch /
// invite-gated mint routes). Badged in the rendered reference.
const GATED = new Set(['dev-token', 'dev-tunnel']);

const SNAPSHOT = join(snapshotsDir, 'civitai-cli-help.txt');
const DELIM = (label) => `===CMD ${label}===`;

const args = process.argv.slice(2);
const WRITE_SNAPSHOT = args.includes('--write-snapshot');

// ---- source resolution -----------------------------------------------------

function binaryPath() {
  const bin = process.env.CIVITAI_CLI_BIN || 'civitai';
  try {
    // Cheap probe that the binary is invokable; --version is stable + side-effect-free.
    execFileSync(bin, ['--version'], { stdio: 'ignore', env: cleanEnv() });
    return bin;
  } catch {
    return null;
  }
}

// Force plain, deterministic help output regardless of the caller's terminal.
function cleanEnv() {
  return {
    ...process.env,
    NO_COLOR: '1',
    CIVITAI_NO_COLOR: '1',
    CIVITAI_NO_UPDATE_CHECK: '1',
  };
}

function capture(bin, argv) {
  return execFileSync(bin, argv, {
    encoding: 'utf8',
    env: cleanEnv(),
    maxBuffer: 8 * 1024 * 1024,
  });
}

// Build the delimited help bundle (same layout as the committed snapshot) from
// a live binary, so the parser is source-agnostic.
function captureBundle(bin) {
  const version = capture(bin, ['--version']).trim();
  const parts = [
    'civitai CLI help snapshot (App authoring command group)',
    'Captured from: civitai/cli (repo civitai/cli, origin/main) via the installed binary.',
    `Binary version: ${version.split('\n')[0]}`,
    'Regenerate: scripts/gen-appblocks-cli.mjs auto-captures from a `civitai` binary when present,',
    'else parses this committed snapshot. To refresh: run',
    'node scripts/gen-appblocks-cli.mjs --write-snapshot (with a civitai binary on PATH).',
    DELIM('app'),
    capture(bin, ['app', '--help']).trimEnd(),
  ];
  for (const cmd of APP_COMMANDS) {
    parts.push(DELIM(`app ${cmd}`), capture(bin, ['app', cmd, '--help']).trimEnd());
  }
  return parts.join('\n') + '\n';
}

function resolveBundle() {
  const snapshotOnly = process.env.APPBLOCKS_SNAPSHOT_ONLY === '1';
  if (!snapshotOnly) {
    const bin = binaryPath();
    if (bin) {
      const text = captureBundle(bin);
      if (WRITE_SNAPSHOT) {
        writeFileSync(SNAPSHOT, text);
        log(`cli: wrote snapshot ${SNAPSHOT}`);
      }
      return { text, source: `civitai binary (${bin})` };
    }
  }
  if (existsSync(SNAPSHOT)) {
    return { text: readFileSync(SNAPSHOT, 'utf8'), source: `snapshot: ${SNAPSHOT}` };
  }
  throw new Error('gen-appblocks-cli: no `civitai` binary and no committed snapshot present');
}

// ---- cobra help parsing ----------------------------------------------------

// Split the bundle into { 'app': text, 'app create': text, … } blocks.
function splitBlocks(bundle) {
  const blocks = {};
  const re = /^===CMD (.+?)===$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(bundle))) marks.push({ label: m[1].trim(), start: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? bundle.lastIndexOf('===CMD', marks[i + 1].start) : bundle.length;
    blocks[marks[i].label] = bundle.slice(marks[i].start, end).replace(/^\n/, '');
  }
  return blocks;
}

// The section of a `--help` body between `<Heading>:` and the next blank-line +
// heading (or EOF). Returns the raw lines (heading excluded).
function section(help, heading) {
  const lines = help.split('\n');
  const start = lines.findIndex((l) => l.trimStart().startsWith(`${heading}:`));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    // A new top-level heading (e.g. "Global Flags:", "Examples:") ends the section.
    if (/^[A-Z][A-Za-z ]+:\s*$/.test(l)) break;
    out.push(l);
  }
  return out;
}

// Short one-liners from the group help's "Available Commands:" block.
function parseShortDescriptions(appHelp) {
  const map = {};
  for (const l of section(appHelp, 'Available Commands')) {
    const m = l.match(/^\s+([a-z][a-z0-9-]*)\s{2,}(.+?)\s*$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

// The `Long` description = everything before the `Usage:` heading, collapsed.
function parseLongDescription(help) {
  const lines = help.split('\n');
  const end = lines.findIndex((l) => l.trimStart().startsWith('Usage:'));
  const body = (end === -1 ? lines : lines.slice(0, end)).join('\n').trim();
  return body;
}

// The positional args from the `Usage:` line: strip `civitai app <cmd>` and the
// trailing `[flags]`. e.g. "civitai app create [name] [dir] [flags]" -> "[name] [dir]".
function parseArgs(help, command) {
  for (const l of section(help, 'Usage')) {
    const t = l.trim();
    if (!t) continue;
    const stripped = t
      .replace(new RegExp(`^civitai\\s+${command.replace(/\s+/g, '\\s+')}\\b`), '')
      .replace(/\[flags\]\s*$/, '')
      .trim();
    return stripped;
  }
  return '';
}

// Parse a cobra `Flags:` block into [{ flags, description, default }], joining
// wrapped continuation lines and excluding the ubiquitous -h/--help.
function parseFlags(help) {
  const lines = section(help, 'Flags');
  const isFlagStart = (l) => /^\s+(?:-\w,\s+)?--[a-zA-Z0-9-]+/.test(l);
  const entries = [];
  let cur = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (isFlagStart(raw)) {
      // First line: "<flags+type><2+ spaces><description>".
      const m = raw.replace(/\s+$/, '').match(/^\s+(.+?)\s{2,}(.*)$/);
      const flags = (m ? m[1] : raw.trim()).trim();
      cur = { flags, description: m ? m[2].trim() : '' };
      entries.push(cur);
    } else if (cur) {
      // Wrapped continuation of the current flag's description.
      cur.description = `${cur.description} ${raw.trim()}`.trim();
    }
  }
  return entries
    .filter((e) => !/^(?:-h,\s+)?--help\b/.test(e.flags))
    .map((e) => {
      let description = e.description;
      let def = null;
      const dm = description.match(/\s*\(default\s+(.+)\)\s*$/);
      if (dm) {
        def = dm[1].replace(/^["']|["']$/g, '');
        description = description.slice(0, dm.index).trim();
      }
      return { flags: e.flags, description, default: def };
    });
}

// ---- build the artifact ----------------------------------------------------

const { text: bundle, source } = resolveBundle();
const blocks = splitBlocks(bundle);

const appHelp = blocks['app'];
if (!appHelp) throw new Error('gen-appblocks-cli: missing the `app` group help block in the source');

const versionMatch = bundle.match(/Binary version:\s*civitai\s+(v[\w.]+)/i);
const program = {
  name: 'civitai',
  description: 'Author and ship Civitai Apps.',
  version: versionMatch ? versionMatch[1] : '',
};

const shortDescriptions = parseShortDescriptions(appHelp);

const commands = [];
for (const cmd of APP_COMMANDS) {
  const help = blocks[`app ${cmd}`];
  if (!help) throw new Error(`gen-appblocks-cli: missing help block for "app ${cmd}" — command set drifted`);
  const command = `app ${cmd}`;
  commands.push({
    command,
    args: parseArgs(help, command),
    description: shortDescriptions[cmd] || parseLongDescription(help).split('\n')[0] || '',
    options: parseFlags(help),
    status: GATED.has(cmd) ? 'gated' : 'stable',
  });
}

if (commands.length !== APP_COMMANDS.length) {
  throw new Error('gen-appblocks-cli: parsed command count mismatch — refusing to write a partial artifact');
}

const artifact = {
  generatedAt: new Date().toISOString(),
  source,
  program,
  commands,
};
const dest = writeArtifact('cli.json', artifact);
const gated = commands.filter((c) => c.status === 'gated').map((c) => c.command);
log(`cli: wrote ${commands.length} commands (${gated.length} gated: ${gated.join(', ')}) -> ${dest}`);
log(`  from ${source}`);
