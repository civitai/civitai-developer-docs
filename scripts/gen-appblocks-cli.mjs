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
import { pathToFileURL } from 'node:url';
import { log, snapshotsDir, writeArtifact } from './appblocks-util.mjs';

// Canonical top-level `civitai app` command set, in a curated lifecycle/display
// order (authoring → store-listing media → discovery → owner analytics →
// dev-loop → repo sync). Asserting this exact set is present is the drift-guard:
// a renamed/removed command trips the build. Order is curated (NOT the
// alphabetical cobra help order) so the reference reads lifecycle-first.
//
// The REVERSE direction is guarded too — see assertNoUnlistedSubcommands. A
// command the CLI GAINS is invisible to the forward assertion (which only
// checks that each LISTED command has a help block) and to
// EXPECTED_COMMAND_COUNT (which is derived from this same list, so it can never
// disagree with it). `metrics` shipped unlisted for exactly that reason.
export const APP_COMMANDS = [
  'create',
  'init',
  'validate',
  'submit',
  'status',
  'withdraw',
  'listing', // command GROUP — its subcommands are enumerated in APP_SUBGROUPS
  'list',
  'view',
  'metrics',
  'dev-token',
  'dev-tunnel',
  'pull',
];

// Command GROUPS: an `app <group>` that owns its OWN subcommands (a nested cobra
// command tree). The generator RECURSES into each — capturing + parsing
// `civitai app <group> <sub> --help` — so nested subcommands are documented too,
// not just the top-level `app` commands. Each subcommand set is asserted present
// as a drift-guard (a new/removed subcommand trips the build). This is the fix
// for the `app listing` media group being silently dropped from the reference.
export const APP_SUBGROUPS = {
  listing: ['set-icon', 'set-cover', 'add-screenshot', 'rm-screenshot', 'reorder', 'status'],
};

// Cobra scaffolding that every command group advertises but which is not part of
// the App lifecycle and is never rendered in the reference. Anything else the
// help advertises MUST be listed above — see assertNoUnlistedSubcommands.
export const IGNORED_SUBCOMMANDS = new Set(['help', 'completion']);

// Commands gated behind the invite-only pre-GA cohort (server kill-switch /
// invite-gated mint routes). Badged in the rendered reference.
const GATED = new Set(['dev-token', 'dev-tunnel']);

// Total command entries the artifact must contain: every top-level command plus
// every enumerated subcommand of each group.
const EXPECTED_COMMAND_COUNT =
  APP_COMMANDS.length + Object.values(APP_SUBGROUPS).reduce((n, subs) => n + subs.length, 0);

export const SNAPSHOT = join(snapshotsDir, 'civitai-cli-help.txt');
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

// Cobra's machine-readable enumeration of a command group:
// `civitai __complete app ""` emits one TAB-separated `name<TAB>short` per line
// with NO column alignment, then a `:<directive>` trailer.
//
// Captured ALONGSIDE the human help because it is a SECOND, INDEPENDENT
// enumeration of the same set — one that no padding, wrapping or reflow of
// `--help` can perturb. The two are cross-checked (assertEnumerationsAgree),
// which is what pins the fragile half: cobra pads the `Available Commands` name
// column to `max(nameLen) + 1`, so the LONGEST name in each group is followed by
// exactly ONE space, and a `\s{2,}` separator dropped precisely that row. The
// coupling is non-local — the column width is a function of the OTHER commands
// in the group — so ADDING a long-named command silently un-documents a
// DIFFERENT one.
function captureCompletion(bin, path) {
  // `__complete` puts the `:<directive>` trailer on stdout and its human note on
  // stderr; we capture stdout only and drop the trailer when parsing.
  return capture(bin, ['__complete', ...path, '']).trimEnd();
}

// Names from a captured `__complete` block. Returns null for an absent block so
// a pre-existing snapshot without these sections degrades to the regex alone
// rather than reporting an empty enumeration.
export function parseCompletionNames(block) {
  if (block == null) return null;
  return block
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.startsWith(':') && l.includes('\t'))
    .map((l) => l.slice(0, l.indexOf('\t')).trim())
    .filter(Boolean)
    .sort();
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
    DELIM('complete app'),
    captureCompletion(bin, ['app']),
  ];
  for (const cmd of APP_COMMANDS) {
    parts.push(DELIM(`app ${cmd}`), capture(bin, ['app', cmd, '--help']).trimEnd());
    // Recurse into a command group's subcommands so the nested tree is captured.
    const subs = APP_SUBGROUPS[cmd];
    if (subs) parts.push(DELIM(`complete app ${cmd}`), captureCompletion(bin, ['app', cmd]));
    for (const sub of subs ?? []) {
      parts.push(DELIM(`app ${cmd} ${sub}`), capture(bin, ['app', cmd, sub, '--help']).trimEnd());
    }
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
export function splitBlocks(bundle) {
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
//
// Cobra renders each row as `  {rpad name namePadding} {short}` — the name is
// left-padded to the width of the LONGEST name in the group, then ONE space.
// So the longest-named command in every group is separated by exactly one
// space: `  add-screenshot Add a screenshot …`. A `\s{2,}` separator therefore
// drops precisely that row, which made the reverse drift-guard structurally
// blind to a newly-gained command that happened to be the longest name in its
// group. Match the 2-space row indent + a 1-or-more space separator instead.
// (Cobra does not wrap this block, so there is no continuation line for the
// looser separator to mistake for a command.)
export function parseShortDescriptions(appHelp) {
  const map = {};
  for (const l of section(appHelp, 'Available Commands')) {
    const m = l.match(/^ {2}([a-z][a-z0-9-]*) +(\S.*?)\s*$/);
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
      // Extract ONLY a genuine cobra default annotation — cobra machine-emits
      // `(default …)` for a non-empty Go default and ALWAYS quotes string
      // defaults, leaving numbers/durations/bools bare. So the token is either a
      // "double-quoted string" or a whitespace-free numeric/duration/bool
      // literal. A trailing `(default …)` that is authored PROSE inside the
      // usage string (e.g. `--dir` → `(default ./<slug>)`, `--tunnel-endpoint` →
      // `(default sish.civitai.com:2224, or $CIVITAI_DEV_TUNNEL_ENDPOINT)`) is
      // NOT one of those shapes, so it is left in the description rather than
      // greedily swallowed into `default`.
      const dm = description.match(/\s*\(default\s+("[^"]*"|-?\d[\d.a-z]*|true|false)\)\s*$/);
      if (dm) {
        def = dm[1].replace(/^"|"$/g, '');
        description = description.slice(0, dm.index).trim();
      }
      return { flags: e.flags, description, default: def };
    });
}

// ---- the REVERSE drift-guard -----------------------------------------------

// Subcommands the SOURCE advertises that the curated list does NOT carry.
//
// The pre-existing guards are all FORWARD-only: buildCommand throws when a
// LISTED command has no help block, and EXPECTED_COMMAND_COUNT is derived from
// APP_COMMANDS/APP_SUBGROUPS, so it compares the list against itself and can
// never disagree. Both are blind by construction to a command the CLI GAINS —
// which is how `civitai app metrics` shipped in the binary and stayed absent
// from the published reference with every check green.
//
// Pure + exported so the regression test can prove it FIRES without a binary.
export function unlistedSubcommands(groupHelp, listed, ignored = IGNORED_SUBCOMMANDS) {
  return Object.keys(parseShortDescriptions(groupHelp))
    .filter((name) => !listed.includes(name) && !ignored.has(name))
    .sort();
}

// The guarded groups: the `app` group itself plus every nested command group.
// One place, so the unlisted check and the enumeration cross-check below can
// never disagree about which groups they cover.
function guardedGroups(blocks) {
  return [
    {
      label: 'app',
      help: blocks['app'],
      completion: blocks['complete app'],
      listed: APP_COMMANDS,
      listName: 'APP_COMMANDS',
    },
    ...Object.keys(APP_SUBGROUPS)
      .filter((g) => blocks[`app ${g}`])
      .map((g) => ({
        label: `app ${g}`,
        help: blocks[`app ${g}`],
        completion: blocks[`complete app ${g}`],
        listed: APP_SUBGROUPS[g],
        listName: `APP_SUBGROUPS.${g}`,
      })),
  ];
}

// CROSS-CHECK the two independent enumerations of each group: the human
// `Available Commands:` block (column-aligned, parsed by regex) and cobra's
// `__complete` output (TAB-separated, alignment-free). They describe the same
// set, so any disagreement means the HELP PARSER lost a row — the failure that
// dropped `add-screenshot`, the longest name under `app listing`, because cobra
// pads the longest name in a group to exactly ONE trailing space.
//
// A snapshot captured before the `complete …` sections existed has no
// completion block; that degrades to the regex alone rather than reporting a
// false disagreement. Pure + exported for the regression test.
export function enumerationDisagreements(groupHelp, completionBlock) {
  const fromCompletion = parseCompletionNames(completionBlock);
  if (!fromCompletion) return null; // no second enumeration available
  const keep = (n) => !IGNORED_SUBCOMMANDS.has(n);
  const help = new Set(Object.keys(parseShortDescriptions(groupHelp)).filter(keep));
  const complete = new Set(fromCompletion.filter(keep));
  return {
    missingFromHelp: [...complete].filter((n) => !help.has(n)).sort(),
    missingFromCompletion: [...help].filter((n) => !complete.has(n)).sort(),
  };
}

export function assertEnumerationsAgree(blocks) {
  for (const { label, help, completion } of guardedGroups(blocks)) {
    const d = enumerationDisagreements(help, completion);
    if (!d) continue;
    if (d.missingFromHelp.length || d.missingFromCompletion.length) {
      throw new Error(
        `gen-appblocks-cli: the two enumerations of "civitai ${label}" disagree — ` +
          (d.missingFromHelp.length
            ? `__complete lists ${d.missingFromHelp.join(', ')} but the "Available Commands:" parse does NOT (the help parser lost a row — cobra pads the LONGEST name in a group to a single trailing space); `
            : '') +
          (d.missingFromCompletion.length
            ? `the "Available Commands:" parse lists ${d.missingFromCompletion.join(', ')} but __complete does NOT; `
            : '') +
          `fix parseShortDescriptions in scripts/gen-appblocks-cli.mjs, or re-capture the snapshot if the two sections are out of sync.`,
      );
    }
  }
}

// REPO-LOCAL invariant (the committed snapshot / the local binary vs a list in
// this file) — no upstream input, so it cannot false-fail on someone else's
// publish. Per the guard doctrine that is what makes it safe to BLOCK a PR on:
// see .github/workflows/appblocks-cli.yml.
export function assertNoUnlistedSubcommands(blocks) {
  for (const { label, help, listed, listName } of guardedGroups(blocks)) {
    const missing = unlistedSubcommands(help, listed);
    if (missing.length) {
      throw new Error(
        `gen-appblocks-cli: "civitai ${label} --help" advertises ${missing.length} subcommand(s) that ${listName} does not list: ` +
          `${missing.join(', ')} — the CLI GAINED a command and the reference would silently omit it. ` +
          `Add it to ${listName} in scripts/gen-appblocks-cli.mjs (in curated lifecycle order), then re-run ` +
          `\`node scripts/gen-appblocks-cli.mjs --write-snapshot\` with a civitai binary on PATH.`,
      );
    }
  }
}

// ---- build the artifact ----------------------------------------------------

// Emit one entry per command. For a GROUP command we emit the group itself (its
// help + description act as a section header) followed by each of its
// subcommands, so the rendered flat reference shows e.g. `civitai app listing`
// then `civitai app listing set-icon <file>` etc.
function buildCommand(blocks, cmd, label) {
  const help = blocks[label];
  if (!help) throw new Error(`gen-appblocks-cli: missing help block for "${label}" — command set drifted`);
  const command = label;
  // Prefer the short one-liner from the parent's "Available Commands" block;
  // fall back to the command's own Long description first line.
  const short = cmd.parentShort?.[cmd.leaf];
  return {
    command,
    args: parseArgs(help, command),
    description: short || parseLongDescription(help).split('\n')[0] || '',
    options: parseFlags(help),
    status: GATED.has(cmd.leaf) ? 'gated' : 'stable',
  };
}

function main() {
  const { text: bundle, source } = resolveBundle();
  const blocks = splitBlocks(bundle);

  const appHelp = blocks['app'];
  if (!appHelp) throw new Error('gen-appblocks-cli: missing the `app` group help block in the source');

  // Both run BEFORE the build loop on purpose. buildCommand's missing-block
  // throw and the EXPECTED_COMMAND_COUNT check both fire on a list edit too, and
  // either running first would mask these with a less actionable message.
  //
  // Order matters between these two as well: a help parser that lost a row makes
  // the unlisted check blind to exactly that row, so the parser is validated
  // FIRST — otherwise a green unlisted check would be a claim about a parse that
  // is already known to be short.
  assertEnumerationsAgree(blocks);
  assertNoUnlistedSubcommands(blocks);

  const versionMatch = bundle.match(/Binary version:\s*civitai\s+(v[\w.]+)/i);
  const program = {
    name: 'civitai',
    description: 'Author and ship Civitai Apps.',
    version: versionMatch ? versionMatch[1] : '',
  };

  const shortDescriptions = parseShortDescriptions(appHelp);

  const commands = [];
  for (const cmd of APP_COMMANDS) {
    commands.push(buildCommand(blocks, { leaf: cmd, parentShort: shortDescriptions }, `app ${cmd}`));
    const subs = APP_SUBGROUPS[cmd];
    if (subs) {
      const groupHelp = blocks[`app ${cmd}`];
      // Short one-liners for the group's subcommands come from ITS own
      // "Available Commands:" block.
      const subShort = parseShortDescriptions(groupHelp);
      for (const sub of subs) {
        commands.push(buildCommand(blocks, { leaf: sub, parentShort: subShort }, `app ${cmd} ${sub}`));
      }
    }
  }

  if (commands.length !== EXPECTED_COMMAND_COUNT) {
    throw new Error(
      `gen-appblocks-cli: parsed ${commands.length} commands, expected ${EXPECTED_COMMAND_COUNT} — refusing to write a partial artifact`,
    );
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
}

// Run the generator only when invoked directly (`node scripts/gen-appblocks-cli.mjs`),
// NOT when imported for its exported helpers (the test harness).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
