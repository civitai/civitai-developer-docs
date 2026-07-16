// Generate public/appblocks/cli.json — the @civitai/blocks-cli command reference.
//
// Source: the published, pinned @civitai/blocks-cli dist/index.js (a devDep),
// which registers its commander program declaratively and unminified. We parse
// the .command()/.description()/.option() chain statically rather than executing
// the CLI (its published package.json carries a `workspace:` dep that npm can't
// resolve at runtime — see the `overrides` entry in package.json).
//
// Fallback: committed snapshot appblocks-snapshots/blocks-cli-index.js.
//
// The bundle/upload/publish commands are registry STUBS ("[coming soon]"); we
// mark them so the page never documents a command that doesn't work. Submission
// is a ZIP upload to civitai.com, not a CLI `submit` command.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { log, snapshotsDir, writeArtifact } from './appblocks-util.mjs';

const require = createRequire(import.meta.url);

function resolveCliSource() {
  try {
    const pkgJson = require.resolve('@civitai/blocks-cli/package.json');
    const p = join(dirname(pkgJson), 'dist', 'index.js');
    if (existsSync(p)) return { text: readFileSync(p, 'utf8'), source: p };
  } catch {
    /* fall through */
  }
  const snap = join(snapshotsDir, 'blocks-cli-index.js');
  if (existsSync(snap)) return { text: readFileSync(snap, 'utf8'), source: `snapshot: ${snap}` };
  throw new Error('gen-appblocks-cli: @civitai/blocks-cli not installed and no snapshot present');
}

function firstStringArg(line) {
  const m = line.match(/\(\s*(['"`])((?:[^\\]|\\.)*?)\1/);
  return m ? m[2] : null;
}

// .option('<flags>', '<desc>'[, '<default>'])
function parseOption(line) {
  const m = line.match(
    /\.option\(\s*(['"`])(.*?)\1\s*,\s*(['"`])(.*?)\3\s*(?:,\s*(['"`])(.*?)\5\s*)?\)/
  );
  if (!m) return null;
  return { flags: m[2], description: m[4], default: m[6] ?? null };
}

const { text, source } = resolveCliSource();
const lines = text.split('\n');

const program = { name: 'civitai', description: '', version: '' };
const commands = [];
let current = null;

for (const raw of lines) {
  const line = raw.trim();
  if (line.startsWith('.name(')) program.name = firstStringArg(line) ?? program.name;
  else if (line.startsWith('.version(')) program.version = firstStringArg(line) ?? program.version;
  else if (line.startsWith('.command(')) {
    const decl = firstStringArg(line) ?? '';
    const [cmd, ...argParts] = decl.split(/\s+/);
    current = {
      command: cmd,
      args: argParts.join(' '),
      description: '',
      options: [],
      status: 'available',
    };
    commands.push(current);
  } else if (line.startsWith('.description(')) {
    const d = firstStringArg(line) ?? '';
    if (current) {
      current.description = d;
      if (/\[coming soon\]/i.test(d)) current.status = 'coming-soon';
    } else if (!program.description) {
      program.description = d;
    }
  } else if (line.startsWith('.option(') && current) {
    const opt = parseOption(line);
    if (opt) current.options.push(opt);
  }
}

if (commands.length === 0) {
  throw new Error('gen-appblocks-cli: parsed 0 commands — refusing to write an empty artifact');
}

const artifact = {
  generatedAt: new Date().toISOString(),
  source,
  program,
  commands,
};
const dest = writeArtifact('cli.json', artifact);
const stubs = commands.filter((c) => c.status === 'coming-soon').map((c) => c.command);
log(`cli: wrote ${commands.length} commands (${stubs.length} coming-soon: ${stubs.join(', ')}) -> ${dest}`);
log(`  from ${source}`);
