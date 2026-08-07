// Generate public/appblocks/cli.json — the canonical `civitai` CLI reference for
// the WHOLE command tree (`civitai <group> <cmd> …`), not just `civitai app …`.
//
// SOURCE: the Go `civitai` CLI (repo civitai/cli, commands cobra-defined). This
// is the CANONICAL dev CLI — it replaced the deprecated npm `@civitai/blocks-cli`
// (whose `init/dev/deploy` no longer describe the real tool). The App lifecycle
// is create → validate → submit (the platform builds), NOT a client-side deploy.
//
// Resolution mirrors the sibling generators' "prefer live, snapshot is the
// hermetic CI fallback" philosophy:
//   1. If a `civitai` binary is resolvable (CIVITAI_CLI_BIN or on PATH) and
//      APPBLOCKS_SNAPSHOT_ONLY!=1, walk the command tree live — capturing
//      `civitai <path> --help` plus `civitai __complete <path> ""` at every
//      node — and parse the cobra help text.
//   2. Otherwise parse the committed snapshot appblocks-snapshots/civitai-cli-help.txt
//      (CI has no binary — this keeps the build hermetic + deterministic).
//
// Refresh the committed snapshot from a newer binary with:
//   node scripts/gen-appblocks-cli.mjs --write-snapshot
//
// 🔴 THE COMMAND SET IS ENUMERATED, NOT CURATED. It used to be two hardcoded
// lists (APP_COMMANDS / APP_SUBGROUPS) covering 19 nodes under `app`; the tree
// is now discovered by recursing on cobra's own `__complete` output from the
// ROOT, which is why the reference covers every command the binary ships (52
// entries at civitai v0.1.90-13-g569f5dc) instead of one group's worth. A
// hardcoded list is a drift-guard only for the group it names, and it is a
// SILENT censor for everything it does not: `civitai app metrics` shipped
// unlisted for exactly that reason, and every command outside `app` was in that
// state permanently. The guards that replaced the lists are the two assertions
// at the bottom of this section header — see assertNoUnlistedSubcommands and
// assertEnumerationsAgree — and they now cover every node, not two groups.
//
// dev-token / dev-tunnel are invite-gated pre-GA; they are marked status:'gated'
// so the page badges them instead of implying open access.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { log, snapshotsDir, writeArtifact } from './appblocks-util.mjs';

// Cobra scaffolding that every command group advertises but which is not part of
// the CLI's own surface and is never rendered in the reference. `completion`
// carries its own four-shell subtree, so dropping it here drops that subtree
// too — deliberate: a shell-completion installer is documented by
// `civitai completion --help`, not by a docs page.
export const IGNORED_SUBCOMMANDS = new Set(['help', 'completion']);

// Commands gated behind the invite-only pre-GA cohort (server kill-switch /
// invite-gated mint routes). Badged in the rendered reference.
//
// Keyed on the FULL command path, not the leaf name. With the whole tree in
// scope leaf names are no longer unique. Counted on the committed snapshot @
// civitai v0.1.90-13-g569f5dc: `get` is SEVEN commands (articles, collections,
// images, model-versions, models, users, workflows), `search` is six, and
// `status` and `list` are two each. A leaf-keyed set would badge — or fail to
// badge — the wrong node.
const GATED = new Set(['app dev-token', 'app dev-tunnel']);

// DISPLAY order only — never membership. Names listed here are emitted first, in
// this order; anything the walk finds that is NOT listed follows, alphabetically.
// So an upstream addition can never be dropped by omission here (that is what
// killed the old curated lists); it only lands at the end of its group.
//
// `app`'s order is the curated authoring lifecycle (authoring → store-listing
// media → discovery → owner analytics → dev-loop → repo sync) rather than
// cobra's alphabetical order, so the reference reads lifecycle-first. The root's
// only entry is `app`, because this page lives in the Apps section.
export const DISPLAY_ORDER = {
  '': ['app'],
  app: [
    'create',
    'init',
    'validate',
    'submit',
    'status',
    'withdraw',
    'listing',
    'list',
    'view',
    'metrics',
    'dev-token',
    'dev-tunnel',
    'pull',
  ],
  // The store-listing media flow, in the order an author performs it. Carried
  // over verbatim from the old APP_SUBGROUPS.listing so widening the reference
  // does not silently re-order a section that is already published.
  'app listing': ['set-icon', 'set-cover', 'add-screenshot', 'rm-screenshot', 'reorder', 'status'],
};

// Anti-TRUNCATION floor, not a drift guard. A partially-walked tree (a capture
// that died halfway, a snapshot truncated by an editor, a `__complete` that
// stopped enumerating) must refuse to write rather than publish a reference
// that silently lost half the CLI. Deliberately well below the measured count
// (52 at civitai v0.1.90-13-g569f5dc) so a legitimate upstream REMOVAL does not
// false-fail the build; the tight, re-measured floor lives in
// scripts/test-appblocks-cli.mjs.
const MIN_COMMAND_COUNT = 40;

// Snapshot label for the root command (`civitai --help`). Parenthesised so it
// can never collide with a real command name.
export const ROOT_LABEL = '(root)';

export const SNAPSHOT = join(snapshotsDir, 'civitai-cli-help.txt');
const DELIM = (label) => `===CMD ${label}===`;

/** The snapshot block label for a command path. `[]` -> `(root)`. */
export function blockLabel(path) {
  return path.length ? path.join(' ') : ROOT_LABEL;
}

/** The snapshot block label for a command path's `__complete` capture. */
export function completionLabel(path) {
  return `complete ${blockLabel(path)}`;
}

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
  return repairPflagSentinel(
    execFileSync(bin, argv, {
      encoding: 'utf8',
      env: cleanEnv(),
      maxBuffer: 8 * 1024 * 1024,
      // stdin is IGNORED, not inherited. The walk shells out ~2× per node and CI
      // runners have no TTY; pinning the shape here means the capture behaves the
      // same on a developer's terminal and on a runner. (Measured both ways — see
      // the non-TTY case in scripts/test-appblocks-cli.mjs.)
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
}

// 🔴 A RAW NUL BYTE REACHES `--help` STDOUT, AND IT ARRIVES WITH THE ROW ALREADY
// MIS-ALIGNED. pflag builds each `Flags:` row as `<spec>\x00<usage>` and swaps
// that NUL for alignment spacing at print time, splitting on the FIRST `\x00` in
// the line. `civitai login --token` declares
// `NoOptDefVal = "\x00civitai-token-no-value"` (civitai/cli
// internal/cmd/login.go:42), so the row carries TWO sentinels: pflag aligns on
// the one inside the DEFAULT VALUE and its own separator survives into stdout.
//
// Measured on civitai v0.1.90-13-g569f5dc, `civitai login --help`:
//   `      --token string[="<28 spaces>civitai-token-no-value"]<NUL>store a personal API key …`
//
// Two consequences, both unacceptable to publish. A NUL makes git, grep and
// `file(1)` classify the committed snapshot as BINARY — `git diff` refuses to
// show it, which would have silently ended hand-review of every future
// re-capture. And parseFlags splits on the first 2+ space run, which is now the
// one pflag injected INSIDE the brackets, yielding
// flags=`--token string[="` / description=`civitai-token-no-value"]store a …`.
//
// So undo pflag's mis-split rather than papering over the byte: collapse the
// spacing it injected inside `[="…"]`, and restore the two-space separator its
// real sentinel stood for. The rendered default then reads
// `civitai-token-no-value`, which is what the flag's help means and what pflag
// would have printed had the two sentinels not collided. Any OTHER NUL is
// pflag's separator with no collision, so it becomes the separator too — a NUL
// is never content. This is the CAPTURE seam, so the committed snapshot is
// clean at rest; `TestSnapshotCarriesNoNulBytes` in scripts/test-appblocks-cli.mjs
// is the standing proof.
export function repairPflagSentinel(text) {
  return text.replace(/\[="[ ]+([^"\n]*)"\]\x00/g, '[="$1"]  ').replace(/\x00/g, '  ');
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
//
// It is ALSO the tree walker's enumeration: recursing on it is what widened this
// generator from one hardcoded group to the whole binary.
function captureCompletion(bin, path) {
  // `__complete` puts the `:<directive>` trailer on stdout and its human note on
  // stderr; we capture stdout only and drop the trailer when parsing.
  return capture(bin, ['__complete', ...path, '']).trimEnd();
}

// Names from a captured `__complete` block. Returns null for an absent block so
// a pre-existing snapshot without these sections degrades to the regex alone
// rather than reporting an empty enumeration.
//
// 🔴 A `-`-PREFIXED ROW IS A FLAG, NOT A SUBCOMMAND, AND DROPPING IT IS LOAD-
// BEARING. At a LEAF that has a REQUIRED flag, cobra completes the flag instead
// of a subcommand and emits it in a row byte-shaped exactly like a subcommand
// row — `name<TAB>description`:
//
//     $ civitai __complete app pull ""
//     --app	the app slug (repo name) or appBlockId to pull (required)
//     :0
//
// The `:<directive>` trailer does NOT discriminate: `app` answers `:4`
// (NoFileComp) and `app pull` answers `:0`, and both are meaningful values a
// group can legitimately return. The leading `-` is the signal, because no cobra
// command name can carry one (command names are bare words).
//
// 🔴 IT IS THE BEST AVAILABLE SIGNAL, NOT A COMPLETE ONE — an earlier wording
// here said "the ONLY reliable signal", which reasons about flags and forgets
// the other thing `__complete` can emit. A POSITIONAL-ARGUMENT completion (a
// cobra `ValidArgsFunction`, or `ValidArgs`) returns `value<TAB>description`
// rows that are byte-identical to a subcommand row and carry no dash, and this
// filter cannot see them. Unreachable today — measured on the whole tree at
// civitai v0.1.90-13-g569f5dc, no node returns argument completions with a
// description, and the one command that completes positionally (`completion`,
// whose values carry no tab) is in IGNORED_SUBCOMMANDS. And the failure
// direction is safe rather than silent: a phantom child would either dangle
// (no help block -> walkCommandPaths throws by name) or be caught by
// assertEnumerationsAgree, which compares against `Available Commands:` and
// would name the extra. So this refuses to publish bad docs; it does not
// guarantee it can classify every row.
//
// Without this filter the walk descends into `civitai app pull --app --help`,
// which is not a command — and the enumeration cross-check reports a permanent
// false disagreement at every such leaf, because `Available Commands:` never
// lists flags. Measured at civitai v0.1.90-13-g569f5dc: `app pull` is the only
// node in the tree that trips it, which is exactly why it needs its own
// regression test rather than a passing glance.
export function parseCompletionNames(block) {
  if (block == null) return null;
  return block
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.startsWith(':') && l.includes('\t'))
    .map((l) => l.slice(0, l.indexOf('\t')).trim())
    .filter(Boolean)
    .filter((name) => !name.startsWith('-'))
    .sort();
}

/**
 * Children of a group, in DISPLAY order: the curated names first (in their
 * curated order), then everything else alphabetically. Pure + exported so the
 * regression test can prove an unlisted addition survives rather than vanishing.
 */
export function orderChildren(path, names) {
  const curated = DISPLAY_ORDER[path.join(' ')] ?? [];
  const rest = names.filter((n) => !curated.includes(n)).sort();
  return [...curated.filter((n) => names.includes(n)), ...rest];
}

/** The child command names of a node, per its captured `__complete` block. */
function childNames(path, completionBlock) {
  const names = (parseCompletionNames(completionBlock) ?? []).filter((n) => !IGNORED_SUBCOMMANDS.has(n));
  return orderChildren(path, names);
}

// Build the delimited help bundle (same layout as the committed snapshot) from
// a live binary, so the parser is source-agnostic. Depth-first in DISPLAY order,
// so the snapshot reads in the same order as the rendered page.
function captureBundle(bin) {
  const version = capture(bin, ['--version']).trim();
  const parts = [
    'civitai CLI help snapshot (the WHOLE command tree)',
    'Captured from: civitai/cli (repo civitai/cli, origin/main) via the installed binary.',
    `Binary version: ${version.split('\n')[0]}`,
    'Regenerate: scripts/gen-appblocks-cli.mjs auto-captures from a `civitai` binary when present,',
    'else parses this committed snapshot. To refresh: run',
    'node scripts/gen-appblocks-cli.mjs --write-snapshot (with a civitai binary on PATH).',
    'Every node carries TWO blocks: its `--help` body, and the `__complete` enumeration',
    'the walk used to discover its children.',
  ];
  const visit = (path) => {
    parts.push(DELIM(blockLabel(path)), capture(bin, [...path, '--help']).trimEnd());
    const completion = captureCompletion(bin, path);
    parts.push(DELIM(completionLabel(path)), completion);
    for (const child of childNames(path, completion)) visit([...path, child]);
  };
  visit([]);
  return parts.join('\n') + '\n';
}

/**
 * The command paths a bundle documents, or null if it cannot be walked. Used to
 * compare a live capture against the committed snapshot. Tolerant by design —
 * an unwalkable bundle is reported as "cannot compare", never as "no drift".
 */
export function nodeSetOf(bundleText) {
  try {
    return walkCommandPaths(splitBlocks(bundleText)).map((p) => p.join(' '));
  } catch {
    return null;
  }
}

/**
 * Compare a live capture's command set against the committed snapshot's.
 * Pure + exported so the regression test can drive it without a binary.
 * @returns {{added: string[], removed: string[]} | null} null when incomparable
 */
export function liveVsSnapshotDrift(liveText, snapshotText) {
  const live = nodeSetOf(liveText);
  const snap = nodeSetOf(snapshotText);
  if (!live || !snap) return null;
  return {
    added: live.filter((c) => !snap.includes(c)).sort(),
    removed: snap.filter((c) => !live.includes(c)).sort(),
  };
}

// 🔴 THE SNAPSHOT IS THE DEFAULT SOURCE; A LIVE BINARY IS OPT-IN. This inverts
// what this generator used to do, and the inversion is the fix for a real
// regression this file introduced.
//
// The sibling generators' "prefer live, snapshot is the CI fallback" philosophy
// is sound for THEM: their live source is the `civitai` repo at origin/main — a
// shared, reviewable ref. This generator's "live" source is whatever `civitai`
// binary happens to be on THIS machine's PATH, which is not a shared source at
// all. It is per-developer state that silently decides what gets published.
//
// That was survivable while the command set was the curated APP_COMMANDS list:
// buildCommand threw when a listed command had no help block, so an out-of-date
// binary was caught. Walking the tree removed the list AND that check together,
// leaving the command set free to float with the binary, bounded only by
// MIN_COMMAND_COUNT. Measured on this machine with the `civitai
// v0.1.89-20-g4018e2c` that was on PATH: `node scripts/gen-appblocks-cli.mjs`
// wrote **47** commands instead of 52, silently dropping `generate` and the
// entire `workflows` subtree — exactly the Buzz-spending surface
// apps/reference/cli.md now promises the page covers — and exited 0.
// Production was never at risk (the Dockerfile builds in node:20-alpine with no
// `civitai`, so it always took the snapshot path), but a local `npm run build`
// or any hand-built deploy would publish the hole.
//
// Two independent barriers, because either alone leaves a hole:
//   1. Default to the snapshot. A build is then reproducible from the repo
//      alone, on every machine, which is what the artifact is supposed to be.
//   2. When the live path IS taken deliberately, DIFF it against the committed
//      snapshot and hard-fail on any disagreement. Without this, opting in
//      would restore the same silent-drift hole for whoever opted in — and it
//      catches a NEWER binary too, which is the direction that produces a local
//      artifact CI cannot reproduce.
function resolveBundle() {
  const snapshotOnly = process.env.APPBLOCKS_SNAPSHOT_ONLY === '1';
  // `--write-snapshot` is by definition a live capture; `CIVITAI_CLI_LIVE=1` is
  // the explicit opt-in for anyone who wants to generate straight from a binary.
  const wantLive = !snapshotOnly && (WRITE_SNAPSHOT || process.env.CIVITAI_CLI_LIVE === '1');

  if (snapshotOnly && WRITE_SNAPSHOT) {
    // Previously this combination fell through and quietly refreshed NOTHING —
    // a refresh command reporting a clean exit while doing nothing, which is the
    // failure class this repo's AGENTS.md calls out by name.
    throw new Error(
      'gen-appblocks-cli: --write-snapshot needs a live `civitai` binary, but APPBLOCKS_SNAPSHOT_ONLY=1 forbids ' +
        'running one. Unset APPBLOCKS_SNAPSHOT_ONLY to re-capture, or drop --write-snapshot to build from the ' +
        'committed snapshot.',
    );
  }

  if (wantLive) {
    const bin = binaryPath();
    if (!bin) {
      throw new Error(
        `gen-appblocks-cli: no \`civitai\` binary found (looked at ${process.env.CIVITAI_CLI_BIN || 'civitai'} on PATH), ` +
          `but a live capture was requested. Install one (\`go install github.com/civitai/cli/cmd/civitai@latest\`), ` +
          `set CIVITAI_CLI_BIN, or build from the committed snapshot instead.`,
      );
    }
    const text = captureBundle(bin);
    if (WRITE_SNAPSHOT) {
      writeFileSync(SNAPSHOT, text);
      log(`cli: wrote snapshot ${SNAPSHOT}`);
      return { text, source: `civitai binary (${bin})` };
    }
    // Opted into live WITHOUT refreshing the snapshot: the two must agree, or
    // the artifact this build publishes is not the artifact CI publishes.
    if (existsSync(SNAPSHOT)) {
      const drift = liveVsSnapshotDrift(text, readFileSync(SNAPSHOT, 'utf8'));
      if (drift && (drift.added.length || drift.removed.length)) {
        throw new Error(
          `gen-appblocks-cli: the live \`${bin}\` and the committed snapshot describe DIFFERENT command trees, so ` +
            `this build would publish a reference CI cannot reproduce — refusing. ` +
            (drift.removed.length
              ? `Absent from the binary but present in the snapshot: ${drift.removed.join(', ')} (your binary is OLDER than the snapshot — upgrade it). `
              : '') +
            (drift.added.length
              ? `Present in the binary but not the snapshot: ${drift.added.join(', ')} (your binary is NEWER — re-capture with \`node scripts/gen-appblocks-cli.mjs --write-snapshot\` and commit the result). `
              : '') +
            `Or build from the snapshot alone by dropping CIVITAI_CLI_LIVE=1.`,
        );
      }
    }
    return { text, source: `civitai binary (${bin})` };
  }

  if (existsSync(SNAPSHOT)) {
    return { text: readFileSync(SNAPSHOT, 'utf8'), source: `snapshot: ${SNAPSHOT}` };
  }
  throw new Error('gen-appblocks-cli: no `civitai` binary and no committed snapshot present');
}

// ---- cobra help parsing ----------------------------------------------------

// Split the bundle into { '(root)': text, 'app': text, 'app create': text, … } blocks.
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

// The section of a `--help` body between `<Heading>:` and the next heading (or
// EOF). Returns the raw lines (heading excluded).
//
// 🔴 A SECTION ALSO ENDS AT ANY NON-BLANK LINE IN COLUMN 0, not just at a
// heading — cobra indents every section BODY and leaves only headings and its
// own trailer flush left. Without that rule the last section in a help body runs
// to EOF and swallows cobra's trailer:
//
//     Flags:
//       -v, --version           version for civitai
//
//     Use "civitai [command] --help" for more information about a command.
//
// parseFlags then joins the trailer on as a wrapped continuation, and `-v`'s
// description renders as `version for civitai Use "civitai [command] --help"
// for more information about a command.` It stayed invisible for every
// per-command block because those end their `Flags:` section at the
// `Global Flags:` heading — only the ROOT has no such heading, and the root's
// flags were not published until the global-flags block was added. Found by
// rendering it, not by review.
//
// Matching cobra's trailer TEXT would work today and rot the moment cobra
// rewords it; the indentation rule is structural. Measured on the committed
// snapshot @ civitai v0.1.90-13-g569f5dc, across `Usage`, `Examples`,
// `Available Commands` and `Flags` on all 53 nodes: of **547** non-blank
// section-body lines, exactly **one** sits in column 0 — the trailer above. So
// this cuts the defect and nothing else.
function section(help, heading) {
  const lines = help.split('\n');
  const start = lines.findIndex((l) => l.trimStart().startsWith(`${heading}:`));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    // ONE rule, because the second one this used to carry — "a new top-level
    // heading (`/^[A-Z][A-Za-z ]+:\s*$/`) ends the section" — is now strictly
    // subsumed by it: cobra prints every heading flush left too, so the
    // indentation test already catches `Global Flags:`, `Examples:` and the
    // rest, and it additionally catches the trailer that the heading pattern
    // could not match. Keeping both would be two spellings of one predicate,
    // free to drift apart and impossible to mutation-test independently.
    //
    // Blank lines are INTERIOR CONTENT and must not terminate the section —
    // `app create`'s Examples block groups its four scenarios with them, so a
    // "stop at the first blank line" rule would silently weld them together.
    if (l.trim() && !/^\s/.test(l)) break;
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

// The cobra `Examples:` block, VERBATIM, as an array of lines.
//
// This section existed in the source all along and was thrown away: `section()`
// only ever treated `Examples:` as a TERMINATOR for the preceding section, and
// nothing read it as a section of its own. Measured on the committed snapshot,
// that discarded 13 of the 19 documented commands' examples.
//
// 🔴 CARRIED VERBATIM, NOT NORMALISED. These are shell TRANSCRIPTS, not prose:
//   - internal blank lines are the transcript's own grouping (`app create` uses
//     them to separate four annotated scenarios) and MUST survive;
//   - `#` comment lines annotate the command below or beside them;
//   - trailing inline comments are column-aligned by hand in the Go source
//     (`civitai app dev-tunnel                 # blockId from …`), so
//     collapsing runs of spaces destroys the alignment the author wrote.
// Measured on appblocks-snapshots/civitai-cli-help.txt @ civitai
// v0.1.90-13-g569f5dc, across the WHOLE tree: the leading-whitespace histogram
// of the 193 non-blank example lines is `{2: 192, 4: 1}`. The outlier is real
// content, not noise — `civitai generate`'s Examples block hand-wraps one
// invocation with a trailing `\` and indents the continuation by 4:
//   `  civitai generate "combine these" --ecosystem Seedream \`
//   `    --image https://example.com/a.jpg --image ./b.png --yes`
// (When this generator covered only `app …` the histogram was a flat `{2: 72}`,
// which is what made "just dedent" look free.) So a normalisation is no longer
// hypothetically lossy, it is measurably lossy: the artifact keeps the bytes
// cobra emitted and the renderer prints them preformatted. The ONLY thing
// trimmed is leading/trailing BLANK lines, which are section-boundary artifacts
// rather than content.
export function parseExamples(help) {
  const lines = section(help, 'Examples');
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
}

// The `Long` description = everything before the `Usage:` heading, collapsed.
export function parseLongDescription(help) {
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
export function parseFlags(help) {
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

// ---- the tree walk ---------------------------------------------------------

/**
 * Every command path the bundle documents, depth-first in DISPLAY order,
 * discovered by recursing on the stored `__complete` blocks. The ROOT is walked
 * (its help block is the top-level enumeration source and carries the global
 * flags) but is NOT returned: `civitai` itself is not a command entry, and
 * emitting it would render a second h3 that owns every other h3 on the page.
 *
 * Pure + exported so the regression test can drive it off the committed
 * snapshot without a binary.
 */
export function walkCommandPaths(blocks) {
  const out = [];
  const visit = (path) => {
    const label = blockLabel(path);
    if (!blocks[label]) {
      throw new Error(
        `gen-appblocks-cli: missing help block for "${label}" — the snapshot is truncated or the walk drifted. ` +
          `Re-run \`node scripts/gen-appblocks-cli.mjs --write-snapshot\` with a civitai binary on PATH.`,
      );
    }
    if (path.length) out.push(path);
    for (const child of childNames(path, blocks[completionLabel(path)])) visit([...path, child]);
  };
  visit([]);
  return out;
}

// ---- the drift-guards ------------------------------------------------------

// Subcommands the SOURCE advertises that the DOCUMENTED set does not carry.
//
// The pre-existing guards were all FORWARD-only: buildCommand threw when a
// CURATED command had no help block, and EXPECTED_COMMAND_COUNT was derived from
// the curated lists, so it compared them against themselves and could never
// disagree. Both were blind by construction to a command the CLI GAINS — which
// is how `civitai app metrics` shipped in the binary and stayed absent from the
// published reference with every check green.
//
// The curated lists are gone, but the reverse question is not: the walk can
// still lose a node (an over-eager `__complete` filter, a missing completion
// block silently demoting a group to a leaf, a truncated capture). So the guard
// now compares the help text's OWN `Available Commands:` advertisement against
// the set of commands actually built — at EVERY group in the tree, not two.
//
// Pure + exported so the regression test can prove it FIRES without a binary.
export function unlistedSubcommands(groupHelp, listed, ignored = IGNORED_SUBCOMMANDS) {
  return Object.keys(parseShortDescriptions(groupHelp))
    .filter((name) => !listed.includes(name) && !ignored.has(name))
    .sort();
}

/**
 * Every block that advertises an `Available Commands:` block — i.e. every group
 * in the tree, root included. One place, so the unlisted check and the
 * enumeration cross-check below can never disagree about which groups they
 * cover.
 */
export function advertisingGroups(blocks) {
  return Object.entries(blocks)
    .filter(([label]) => !label.startsWith('complete '))
    .map(([label, help]) => ({
      label,
      path: label === ROOT_LABEL ? [] : label.split(' '),
      help,
      advertised: Object.keys(parseShortDescriptions(help)),
    }))
    .filter((g) => g.advertised.length > 0);
}

/**
 * Every block that carries BOTH a help body and a `__complete` counterpart —
 * i.e. every node the walk captured. Leaves are included on purpose: a leaf's
 * `__complete` output is the `app pull` shape (a required FLAG in a
 * subcommand-shaped row), and a filter regression there must fail here rather
 * than only where it happens to be noticed.
 */
export function cocheckedNodes(blocks) {
  return Object.entries(blocks)
    .filter(([label]) => !label.startsWith('complete '))
    .filter(([label]) => blocks[`complete ${label}`] != null)
    .map(([label, help]) => ({ label, help, completion: blocks[`complete ${label}`] }));
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
  for (const { label, help, completion } of cocheckedNodes(blocks)) {
    const d = enumerationDisagreements(help, completion);
    if (!d) continue;
    if (d.missingFromHelp.length || d.missingFromCompletion.length) {
      const invocation = `civitai${label === ROOT_LABEL ? '' : ` ${label}`}`;
      throw new Error(
        `gen-appblocks-cli: the two enumerations of "${invocation}" disagree — ` +
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

// REPO-LOCAL invariant (the committed snapshot / the local binary vs what the
// walk actually built) — no upstream input, so it cannot false-fail on someone
// else's publish. Per the guard doctrine that is what makes it safe to BLOCK a
// PR on: see .github/workflows/appblocks-cli.yml.
export function assertNoUnlistedSubcommands(blocks, documented = null) {
  const built = documented ?? walkCommandPaths(blocks).map((p) => p.join(' '));
  for (const { label, path, help } of advertisingGroups(blocks)) {
    const prefix = path.length ? `${path.join(' ')} ` : '';
    const listed = built
      .filter((c) => c.startsWith(prefix) && !c.slice(prefix.length).includes(' '))
      .map((c) => c.slice(prefix.length));
    const missing = unlistedSubcommands(help, listed);
    if (missing.length) {
      throw new Error(
        `gen-appblocks-cli: "civitai ${prefix}--help" advertises ${missing.length} subcommand(s) the generated ` +
          `reference does NOT document: ${missing.join(', ')} — the CLI GAINED a command and the reference ` +
          `would silently omit it. The command set is walked from cobra's \`__complete\`, so this means the ` +
          `walk lost a node: check parseCompletionNames' flag filter and that the snapshot carries a ` +
          `"${completionLabel(path)}" section, then re-run ` +
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
function buildCommand(blocks, path, parentShort) {
  const label = blockLabel(path);
  const help = blocks[label];
  if (!help) throw new Error(`gen-appblocks-cli: missing help block for "${label}" — command set drifted`);
  const command = path.join(' ');
  const leaf = path[path.length - 1];
  // Prefer the short one-liner from the parent's "Available Commands" block;
  // fall back to the command's own Long description first line.
  const short = parentShort?.[leaf];
  return {
    command,
    args: parseArgs(help, command),
    description: short || parseLongDescription(help).split('\n')[0] || '',
    // 🔴 THE WHOLE `Long` BODY, AND IT IS A SEPARATE FIELD ON PURPOSE.
    // `parseLongDescription` has always returned everything before `Usage:`, but
    // it was only ever reached as a FALLBACK for `description` — and then only
    // its FIRST LINE. A subcommand always has a `short` from its parent's
    // "Available Commands:" block, so `short` always won and the rest of the
    // body was parsed and thrown away on every command. Measured on
    // appblocks-snapshots/civitai-cli-help.txt @ civitai v0.1.90-13-g569f5dc:
    // 52 of 52 commands carry a non-empty Long, 40,678 characters in total, of
    // which the published reference showed the first line of NONE (every one of
    // the 52 had a `short`). The largest are `generate` (5,731), `download`
    // (3,742) and `app dev-token` (3,245) — and `generate`'s body is where the
    // "THIS SPENDS REAL BUZZ AND CANNOT BE UNDONE" warning lives, so this is not
    // merely more prose.
    //
    // `description` is DELIBERATELY UNCHANGED. It is the one-line summary every
    // consumer already reads, and it is NOT the Long's first line — measured, it
    // differs from it on 44 of 52 commands (`app validate` summarises as
    // "Validate block.manifest.json against the App schema" while its Long opens
    // "Validate an App project."). Deriving one from the other would be a
    // breaking wire change in both directions.
    //
    // Always present (possibly empty), for the same reason as `examples` below.
    // Every command in today's snapshot has one, so the empty case is a contract
    // a consumer can rely on rather than a state we ship.
    longDescription: parseLongDescription(help),
    options: parseFlags(help),
    // Always present (possibly empty) so a consumer never has to distinguish
    // "no examples" from "an artifact generated before this field existed".
    examples: parseExamples(help),
    status: GATED.has(command) ? 'gated' : 'stable',
  };
}

// Build the whole artifact from a help bundle. Exported (and pure — no I/O, no
// clock) so scripts/test-appblocks-cli.mjs can assert on the REAL artifact the
// build writes, driven from the committed snapshot, without depending on a
// previously-generated public/appblocks/cli.json being on disk.
export function buildArtifact(bundle, source = 'test') {
  const blocks = splitBlocks(bundle);

  if (!blocks[ROOT_LABEL]) {
    throw new Error(
      `gen-appblocks-cli: missing the "${ROOT_LABEL}" help block in the source — the snapshot predates the ` +
        `whole-tree walk. Re-capture it with \`node scripts/gen-appblocks-cli.mjs --write-snapshot\`.`,
    );
  }

  const paths = walkCommandPaths(blocks);

  // Both run BEFORE the build loop on purpose, and in this order: a help parser
  // that lost a row makes the unlisted check blind to exactly that row, so the
  // parser is validated FIRST — otherwise a green unlisted check would be a
  // claim about a parse that is already known to be short.
  assertEnumerationsAgree(blocks);
  assertNoUnlistedSubcommands(
    blocks,
    paths.map((p) => p.join(' ')),
  );

  const versionMatch = bundle.match(/Binary version:\s*civitai\s+(v[\w.]+)/i);
  const program = {
    name: 'civitai',
    description: 'Author and ship Civitai Apps.',
    version: versionMatch ? versionMatch[1] : '',
    // 🔴 THE GLOBAL FLAGS, WHICH NO COMMAND ENTRY CAN CARRY. `parseFlags` reads
    // a command's own `Flags:` section and deliberately does NOT read
    // `Global Flags:` — repeating `--no-color` on all 52 entries would be noise,
    // and cobra prints them there precisely because they are not the command's.
    // The root is where they ARE the command's own flags, and the root is not
    // emitted as an entry (it would render a second h3 owning every other h3).
    // Net effect before this: `--color`, `--no-color`, `--no-update-check` and
    // `-v/--version` appeared NOWHERE on a page whose frontmatter had just
    // started claiming it documented every flag. The gap predates this change;
    // the false claim did not, and closing the gap is the better of the two
    // available fixes.
    globalOptions: parseFlags(blocks[ROOT_LABEL]),
  };

  // Short one-liners for a node come from its PARENT's "Available Commands:"
  // block, so memoise one parse per group rather than one per command.
  const shortCache = new Map();
  const shortsFor = (parentPath) => {
    const key = blockLabel(parentPath);
    if (!shortCache.has(key)) shortCache.set(key, parseShortDescriptions(blocks[key] ?? ''));
    return shortCache.get(key);
  };

  const commands = paths.map((p) => buildCommand(blocks, p, shortsFor(p.slice(0, -1))));

  if (commands.length < MIN_COMMAND_COUNT) {
    throw new Error(
      `gen-appblocks-cli: walked only ${commands.length} commands (floor ${MIN_COMMAND_COUNT}) — refusing to ` +
        `write a truncated artifact. Either the capture died part-way or the committed snapshot is incomplete.`,
    );
  }

  return { generatedAt: new Date().toISOString(), source, program, commands };
}

function main() {
  const { text: bundle, source } = resolveBundle();
  const artifact = buildArtifact(bundle, source);
  const { commands } = artifact;
  const dest = writeArtifact('cli.json', artifact);
  const gated = commands.filter((c) => c.status === 'gated').map((c) => c.command);
  // Report the example yield in the build log: a generator that silently stops
  // extracting examples otherwise looks identical to one whose commands simply
  // have none. The FLOOR that turns this into a gate lives in
  // scripts/test-appblocks-cli.mjs (PR-blocking via .github/workflows/appblocks-cli.yml).
  const withExamples = commands.filter((c) => c.examples.length);
  const exampleLines = withExamples.reduce((n, c) => n + c.examples.length, 0);
  // Same reasoning for the Long bodies: a parser that silently stopped
  // extracting them emits `longDescription: ''` everywhere and looks exactly
  // like a CLI whose commands have no Long. The FLOOR that turns this into a
  // gate lives in scripts/test-appblocks-cli.mjs alongside the examples one.
  const withLong = commands.filter((c) => c.longDescription);
  const longChars = withLong.reduce((n, c) => n + c.longDescription.length, 0);
  const groups = commands.filter((c) => c.command.includes(' ')).length;
  log(`cli: wrote ${commands.length} commands (${groups} nested, ${gated.length} gated: ${gated.join(', ')}) -> ${dest}`);
  log(`  examples: ${withExamples.length}/${commands.length} commands, ${exampleLines} lines`);
  log(`  long descriptions: ${withLong.length}/${commands.length} commands, ${longChars} chars`);
  log(`  from ${source}`);
}

// Run the generator only when invoked directly (`node scripts/gen-appblocks-cli.mjs`),
// NOT when imported for its exported helpers (the test harness).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
