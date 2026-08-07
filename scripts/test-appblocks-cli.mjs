#!/usr/bin/env node
// Regression tests for scripts/gen-appblocks-cli.mjs — the drift-guards a build
// depends on, the tree WALK that replaced the curated command lists, and the two
// CliReference rendering helpers.
//
//   node scripts/test-appblocks-cli.mjs
//
// WHY THIS EXISTS: every check the generator shipped with was FORWARD-only.
// buildCommand threw when a CURATED command had no help block, and
// EXPECTED_COMMAND_COUNT was derived from APP_COMMANDS/APP_SUBGROUPS — it
// compared the curated list against itself, so it could never disagree with it.
// Both were blind BY CONSTRUCTION to a command the CLI GAINS. Measured then:
// with the reverse guard removed and `metrics` dropped from APP_COMMANDS, the
// generator exited 0 and wrote 18 commands with `civitai app metrics` silently
// absent — which is exactly how it shipped missing from the published reference.
//
// The curated lists are now GONE: the command set is walked from cobra's own
// `__complete` output, from the root, so the reference covers the whole binary
// (52 entries) rather than one group (19). That removes the omission-by-curation
// failure entirely and introduces a new one — a walk can LOSE a node — so the
// same two guards were widened rather than retired, and this file grew the
// sections that pin the walk itself.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DISPLAY_ORDER,
  IGNORED_SUBCOMMANDS,
  ROOT_LABEL,
  SNAPSHOT,
  advertisingGroups,
  assertEnumerationsAgree,
  assertNoUnlistedSubcommands,
  blockLabel,
  buildArtifact,
  cocheckedNodes,
  completionLabel,
  enumerationDisagreements,
  liveVsSnapshotDrift,
  nodeSetOf,
  orderChildren,
  parseCompletionNames,
  parseExamples,
  parseFlags,
  parseLongDescription,
  parseShortDescriptions,
  repairPflagSentinel,
  splitBlocks,
  unlistedSubcommands,
  walkCommandPaths,
} from './gen-appblocks-cli.mjs';
import { repoRoot } from './appblocks-util.mjs';
import {
  cliAnchorId,
  cliHeadingLevel,
  cliHeadingTag,
} from '../.vitepress/theme/components/cliReference.shared.mjs';

let failures = 0;
let skipped = 0;
/** Thrown by a check that could not run at all — reported as SKIP, never as ok. */
class Skip extends Error {}
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    if (err instanceof Skip) {
      skipped++;
      // Never printed as `ok`: a check that did not run must not read like one
      // that passed. The summary repeats the count so it cannot scroll away.
      console.log(`  SKIP ${name}\n       ${err.message}`);
      return;
    }
    failures++;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function assertEqual(got, want, msg) {
  if (got !== want) throw new Error(`${msg} — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
/** Run `fn`, return the thrown message, or throw if it did NOT throw. */
function messageFrom(fn, what) {
  try {
    fn();
  } catch (err) {
    return err.message;
  }
  throw new Error(`${what} did not throw`);
}

const snapshotBytes = readFileSync(SNAPSHOT);
const bundle = snapshotBytes.toString('utf8');
const blocks = splitBlocks(bundle);
const rootHelp = blocks[ROOT_LABEL];
const appHelp = blocks['app'];
const listingHelp = blocks['app listing'];

console.log('POSITIVE CONTROL — the parser observes the snapshot at all');

check('the snapshot splits into a root block plus a block per node, help + __complete', () => {
  assert(rootHelp, `no \`${ROOT_LABEL}\` block parsed from the committed snapshot`);
  assert(appHelp, 'no `app` block parsed from the committed snapshot');
  assert(listingHelp, 'no `app listing` block parsed from the committed snapshot');
  const helpBlocks = Object.keys(blocks).filter((l) => !l.startsWith('complete '));
  const completeBlocks = Object.keys(blocks).filter((l) => l.startsWith('complete '));
  assertEqual(
    helpBlocks.length,
    completeBlocks.length,
    'every node must carry BOTH a --help block and a __complete block',
  );
  assert(helpBlocks.length > 40, `suspiciously few help blocks parsed (${helpBlocks.length})`);
});

check('"Available Commands" yields a non-empty command set (guard is not wired to nothing)', () => {
  // Without this, a zero-unlisted verdict below is indistinguishable from a
  // parser that returned {} for every group.
  const top = Object.keys(parseShortDescriptions(rootHelp));
  assert(top.includes('app'), '`app` not advertised by the root help — fixture is out of date');
  assert(top.includes('generate'), '`generate` not advertised by the root help — fixture is out of date');
  assert(top.length >= 15, `civitai --help advertised only ${top.length} commands`);
  const advertised = Object.keys(parseShortDescriptions(appHelp));
  assert(advertised.includes('metrics'), '`metrics` not advertised by the snapshot — fixture is out of date');
  assert(advertised.length >= 13, `app --help advertised only ${advertised.length} commands`);
  const subs = Object.keys(parseShortDescriptions(listingHelp));
  assert(subs.length >= 6, `app listing --help advertised only ${subs.length} subcommands`);
});

check('the LONGEST name in a group is parsed (cobra pads it to ONE space)', () => {
  // Measured on the real snapshot: `add-screenshot` is the longest name under
  // `app listing`, so cobra emits `  add-screenshot Add a screenshot …` with a
  // single separating space. A `\s{2,}` separator dropped exactly that row —
  // making the guard structurally blind to a newly-gained command whenever it
  // happens to be the longest name in its group. Widening added a SECOND live
  // instance: `model-versions` is the longest name at the ROOT.
  const short = parseShortDescriptions(listingHelp);
  assert(short['add-screenshot'], '`add-screenshot` dropped — the one-space separator regressed');
  const top = parseShortDescriptions(rootHelp);
  assert(top['model-versions'], '`model-versions` dropped — the one-space separator regressed at the root');
  // Synthetic control: only ONE space, and the name is the widest in the block.
  const fixture = ['Available Commands:', '  widest-command-name One space only', '  short       Padded'].join('\n');
  const parsed = parseShortDescriptions(fixture);
  assertEqual(parsed['widest-command-name'], 'One space only', 'one-space row not parsed');
  assertEqual(parsed['short'], 'Padded', 'padded row not parsed');
});

// ---------------------------------------------------------------------------
// THE TREE WALK
//
// The generator used to enumerate 19 nodes from two hardcoded lists. It now
// recurses on cobra's `__complete` from the root. The lists are gone, so the
// failure they caused (a gained command silently omitted) is gone with them —
// and a NEW failure is possible: the walk losing a node. Everything below
// pins the walk.
// ---------------------------------------------------------------------------

// 🔴 BUILT INSIDE A `check`, NOT AT TOP LEVEL. Every guard below reads this
// artifact, and buildArtifact THROWS by design (that is how the drift-guards
// gate the build). A bare top-level call therefore turns any guard failure into
// an uncaught exception that kills the process before a single named assertion
// runs — the harness reports a stack trace, no `FAIL <name>` line, and every
// later section silently never executes. Measured while mutation-testing this
// file: dropping parseCompletionNames' flag filter produced `ok=3 FAIL=0` and a
// stack trace, which reads far more like a broken harness than a caught defect.
// On failure the artifact degrades to an empty one so the dependent guards each
// fail with THEIR OWN message instead of disappearing.
let artifact = { generatedAt: '', source: 'unbuilt', program: {}, commands: [] };
check('buildArtifact succeeds against the committed snapshot', () => {
  artifact = buildArtifact(bundle, 'test');
});
const commandSet = new Set(artifact.commands.map((c) => c.command));

// MEASURED on appblocks-snapshots/civitai-cli-help.txt @ civitai v0.1.90-13-g569f5dc:
// 53 tree nodes — the root plus 52 command entries. The root is walked (it is the
// top-level enumeration source) but is NOT emitted as a command entry. The
// binary's cobra tree holds 54 nodes; the delta is `completion`, which
// IGNORED_SUBCOMMANDS drops along with its four-shell subtree.
//
// A FLOOR, not an equality, so an upstream ADDITION is not a failure. A DROP is:
// that is the regression this exists for. Re-measure and update deliberately
// when re-capturing the snapshot.
const COMMAND_COUNT_FLOOR = 52;
const TOP_LEVEL_FLOOR = 17;

console.log('TREE WALK — the whole binary, not one curated group');

check(`the walk yields at least ${COMMAND_COUNT_FLOOR} commands (a truncated artifact FAILS)`, () => {
  assert(
    artifact.commands.length >= COMMAND_COUNT_FLOOR,
    `walked only ${artifact.commands.length} commands (floor ${COMMAND_COUNT_FLOOR}) — the tree walk is losing nodes`,
  );
  const top = artifact.commands.filter((c) => !c.command.includes(' '));
  assert(
    top.length >= TOP_LEVEL_FLOOR,
    `only ${top.length} TOP-LEVEL commands (floor ${TOP_LEVEL_FLOOR}) — the walk never left the root`,
  );
  // A count alone cannot tell a whole-tree walk from 52 copies of one subtree.
  for (const c of ['app', 'app create', 'app listing set-icon', 'generate', 'models search', 'workflows cancel']) {
    assert(commandSet.has(c), `\`${c}\` missing from the artifact — the walk did not reach it`);
  }
});

check('a ZERO-node or truncated bundle is REFUSED, not written', () => {
  // The floor has to be reachable, or it is decoration. Drive the real
  // buildArtifact with a bundle whose root advertises nothing to descend into.
  const rootOnly = [
    'Binary version: civitai v0.0.0',
    `===CMD ${ROOT_LABEL}===`,
    'A CLI.\n\nUsage:\n  civitai [flags]\n',
    `===CMD ${completionLabel([])}===`,
    ':4',
  ].join('\n');
  const msg = messageFrom(() => buildArtifact(rootOnly, 'test'), 'buildArtifact on a zero-command bundle');
  assert(/walked only 0 commands/.test(msg), `the zero-node refusal did not name the count: ${msg}`);
  assert(/refusing to.*write a truncated artifact/s.test(msg), `the refusal is not actionable: ${msg}`);

  // And a bundle whose root enumerates children it has no help blocks for.
  const dangling = [
    'Binary version: civitai v0.0.0',
    `===CMD ${ROOT_LABEL}===`,
    'A CLI.\n\nUsage:\n  civitai [flags]\n\nAvailable Commands:\n  app  Apps\n',
    `===CMD ${completionLabel([])}===`,
    'app\tApps\n:4',
  ].join('\n');
  const msg2 = messageFrom(() => buildArtifact(dangling, 'test'), 'buildArtifact on a dangling reference');
  assert(/missing help block for "app"/.test(msg2), `the dangling-node refusal did not name the block: ${msg2}`);
});

check('a snapshot with no root block is REFUSED (it predates the whole-tree walk)', () => {
  const { [ROOT_LABEL]: _root, [completionLabel([])]: _rc, ...noRoot } = blocks;
  const rebuilt = Object.entries(noRoot)
    .map(([label, text]) => `===CMD ${label}===\n${text}`)
    .join('');
  const msg = messageFrom(() => buildArtifact(rebuilt, 'test'), 'buildArtifact on a root-less bundle');
  assert(msg.includes(ROOT_LABEL), `the message does not name the missing block: ${msg}`);
  assert(msg.includes('--write-snapshot'), `the message does not say how to fix it: ${msg}`);
});

check('DISPLAY order is order-only — an UNLISTED name is appended, never dropped', () => {
  // The curated lists used to be MEMBERSHIP. They are now presentation only, and
  // that is the whole reason the omission failure cannot recur: a name the
  // curator forgot still ships, at the end of its group.
  const got = orderChildren(['app'], ['pull', 'create', 'brand-new', 'validate']);
  assertEqual(got.join(','), 'create,validate,pull,brand-new', 'curated order lost, or the new name was dropped');
  // Curated names the group does NOT have must not be conjured into existence.
  assertEqual(orderChildren(['app'], ['pull']).join(','), 'pull', 'a curated-but-absent name was emitted');
  // A group with no curated order is plain alphabetical.
  assertEqual(orderChildren(['models'], ['search', 'get']).join(','), 'get,search', 'uncurated group not sorted');
  // …and the real artifact honours it.
  const appSubs = artifact.commands
    .filter((c) => c.command.startsWith('app ') && c.command.split(' ').length === 2)
    .map((c) => c.command.slice(4));
  assertEqual(appSubs.slice(0, 6).join(','), DISPLAY_ORDER.app.slice(0, 6).join(','), 'app lifecycle order lost');
});

// ---------------------------------------------------------------------------
// 🔴 THE FLAG-VS-SUBCOMMAND DISCRIMINATOR
//
// At a LEAF with a REQUIRED flag, cobra completes the FLAG instead of a
// subcommand, and emits it in a row byte-shaped exactly like a subcommand row:
//
//     $ civitai __complete app pull ""
//     --app	the app slug (repo name) or appBlockId to pull (required)
//     :0
//
// The `:<directive>` trailer does NOT discriminate — `app` answers `:4` and
// `app pull` answers `:0`, and both are legitimate values a group can return.
// The only reliable signal is the leading `-`. That one-character predicate is
// exactly the kind of thing a later "simplification" deletes, so it gets its own
// section with the REAL bytes as the fixture.
// ---------------------------------------------------------------------------

console.log('FLAG-VS-SUBCOMMAND — `__complete` at a leaf emits FLAGS in subcommand-shaped rows');

check('the committed snapshot really contains the `app pull` shape (fixture is live)', () => {
  // A guard whose fixture stopped existing is a guard wired to nothing.
  const pull = blocks[completionLabel(['app', 'pull'])];
  assert(pull, 'no `complete app pull` block — re-capture the snapshot');
  assert(
    /^--app\t/m.test(pull),
    `the \`app pull\` completion block no longer emits a flag row — re-measure this section: ${JSON.stringify(pull)}`,
  );
  assert(/^:\d/m.test(pull), 'the completion block lost its directive trailer');
});

check('a `-`-prefixed row is NOT parsed as a subcommand', () => {
  const pull = blocks[completionLabel(['app', 'pull'])];
  assertEqual(
    JSON.stringify(parseCompletionNames(pull)),
    '[]',
    'a FLAG was parsed as a subcommand name — the `-` filter regressed, and the walk will descend into `app pull --app`',
  );
  // Synthetic control covering the shapes cobra can emit, both directives.
  assertEqual(
    JSON.stringify(parseCompletionNames('--app\tthe app slug (required)\n-v\tverbose\n:0')),
    '[]',
    'long or short flag rows leaked through the filter',
  );
  assertEqual(
    JSON.stringify(parseCompletionNames('sub\tA real subcommand\n--flag\tA flag\n:4')),
    '["sub"]',
    'a MIXED row set must keep the subcommand and drop the flag',
  );
});

check('the trailing directive is NOT usable as the discriminator (why the `-` test exists)', () => {
  // Stated as an assertion because the obvious "simplification" is to key on the
  // directive instead. `app` (a real group) and `app pull` (a leaf emitting a
  // flag) answer DIFFERENT directives, and `app listing` (a real group) answers
  // the SAME one as `app`, so no directive value separates the two populations.
  const directive = (label) => (blocks[label].match(/^:(\d+)/m) ?? [])[1];
  const group = directive(completionLabel(['app']));
  const leafWithFlag = directive(completionLabel(['app', 'pull']));
  const plainLeaf = directive(completionLabel(['whoami']));
  assert(group && leafWithFlag && plainLeaf, 'a directive trailer is missing from the snapshot');
  assertEqual(
    leafWithFlag,
    plainLeaf,
    'the flag-emitting leaf and a plain leaf answer DIFFERENT directives — re-measure, the discriminator claim may have changed',
  );
  assert(group !== leafWithFlag, 'a group and a leaf now answer the same directive');
});

check('the walk STOPS at a flag-emitting leaf (no `app pull --app` in the artifact)', () => {
  // The end-to-end consequence, not just the parser's return value.
  for (const c of artifact.commands) {
    assert(
      !c.command.split(' ').some((t) => t.startsWith('-')),
      `a FLAG became a command entry: ${JSON.stringify(c.command)}`,
    );
  }
  assert(commandSet.has('app pull'), '`app pull` itself must still be documented');
  assert(
    !artifact.commands.some((c) => c.command.startsWith('app pull ')),
    '`app pull` grew children — the walk descended into its flags',
  );
});

// ---------------------------------------------------------------------------
// 🔴 NON-TTY `__complete`
//
// The whole widening rests on `__complete` answering the same way when the
// generator shells out from a CI runner (no controlling terminal, stdin not a
// TTY) as it does from a developer's shell. Nothing had ever verified that.
// Skipped — loudly, and only here — when no binary is resolvable, which is the
// hermetic CI case for this repo.
// ---------------------------------------------------------------------------

console.log('NON-TTY — `__complete` behaves the same with no terminal attached');

const CLI_BIN = (() => {
  const bin = process.env.CIVITAI_CLI_BIN || 'civitai';
  try {
    execFileSync(bin, ['--version'], { stdio: 'ignore' });
    return bin;
  } catch {
    return null;
  }
})();

check('`__complete` parses identically with stdin/stderr detached from any TTY', () => {
  if (!CLI_BIN) {
    throw new Skip('no `civitai` binary resolvable — set CIVITAI_CLI_BIN to run this arm (CI is hermetic by design)');
  }
  const env = { ...process.env, NO_COLOR: '1', CIVITAI_NO_COLOR: '1', CIVITAI_NO_UPDATE_CHECK: '1' };
  const run = (argv, stdio) => execFileSync(CLI_BIN, argv, { encoding: 'utf8', env, stdio }).trimEnd();

  // The shape the generator itself uses: stdin ignored, stderr discarded, and
  // no terminal on any descriptor.
  const detached = run(['__complete', 'app', ''], ['ignore', 'pipe', 'ignore']);
  const names = parseCompletionNames(detached);
  assert(names && names.length >= 13, `non-TTY __complete enumerated only ${names?.length} names under \`app\``);
  assert(names.includes('metrics'), 'non-TTY __complete lost `metrics`');
  assert(!names.some((n) => n.startsWith('-')), 'non-TTY __complete leaked a flag row past the filter');
  assert(/^:\d/m.test(detached), 'non-TTY __complete emitted no directive trailer');

  // And a pipe-fed stdin, which is what a shell pipeline / some runners give.
  const piped = run(['__complete', 'app', ''], ['pipe', 'pipe', 'pipe']);
  assertEqual(piped, detached, '`__complete` output DIFFERS between a detached and a piped stdin');

  // The flag-row case under the same conditions — it is the shape that would
  // silently corrupt the walk.
  assertEqual(
    JSON.stringify(parseCompletionNames(run(['__complete', 'app', 'pull', ''], ['ignore', 'pipe', 'ignore']))),
    '[]',
    'non-TTY `app pull` completion did not parse to zero subcommands',
  );
});

// ---------------------------------------------------------------------------
// THE REVERSE GUARD (widened: every group in the tree, not two)
// ---------------------------------------------------------------------------

console.log('CURRENT STATE — the committed snapshot has no undocumented subcommand');

check('assertNoUnlistedSubcommands passes against the committed snapshot', () => {
  assertNoUnlistedSubcommands(blocks);
});

check(`the guard covers EVERY group in the tree (was: 2)`, () => {
  const covered = advertisingGroups(blocks).map((g) => g.label).sort();
  assert(covered.includes(ROOT_LABEL), 'the ROOT group is not covered by the reverse guard');
  assert(covered.includes('app'), '`app` is not covered by the reverse guard');
  assert(covered.includes('app listing'), '`app listing` is not covered by the reverse guard');
  assert(covered.includes('workflows'), '`workflows` is not covered by the reverse guard');
  assert(covered.length >= 12, `only ${covered.length} groups covered — the guard narrowed`);
});

console.log('NEGATIVE CONTROL — the reverse guard FIRES when a command goes undocumented');

check('dropping `metrics` from the DOCUMENTED set makes it show up as unlisted', () => {
  const without = artifact.commands.map((c) => c.command).filter((c) => c !== 'app metrics');
  const msg = messageFrom(
    () => assertNoUnlistedSubcommands(blocks, without),
    'assertNoUnlistedSubcommands with `app metrics` dropped',
  );
  assert(msg.includes('metrics'), `message does not name the undocumented command: ${msg}`);
  assert(msg.includes('civitai app --help'), `message does not name the group: ${msg}`);
  assert(msg.includes('parseCompletionNames'), `message does not say where to look: ${msg}`);
});

check('the guard fires OUTSIDE the `app` group too (root and a new subgroup)', () => {
  // The old guard could only ever see two groups. This is the widening, proved.
  const all = artifact.commands.map((c) => c.command);
  const noGenerate = messageFrom(
    () => assertNoUnlistedSubcommands(blocks, all.filter((c) => c !== 'generate')),
    'assertNoUnlistedSubcommands with `generate` dropped',
  );
  assert(noGenerate.includes('generate'), `root-level omission not detected: ${noGenerate}`);
  const noCancel = messageFrom(
    () => assertNoUnlistedSubcommands(blocks, all.filter((c) => c !== 'workflows cancel')),
    'assertNoUnlistedSubcommands with `workflows cancel` dropped',
  );
  assert(noCancel.includes('cancel'), `nested omission outside \`app\` not detected: ${noCancel}`);
  assert(noCancel.includes('civitai workflows --help'), `the wrong group was blamed: ${noCancel}`);
});

check('the pure predicate still names an unknown advertised command', () => {
  const fixture = appHelp.replace(/^(\s+)view(\s+)/m, '$1zzz-unknown$2');
  const missing = unlistedSubcommands(fixture, Object.keys(parseShortDescriptions(appHelp)));
  assertEqual(missing.join(','), 'zzz-unknown', 'the pure predicate did not flag the unknown command');
});

console.log('IGNORE LIST — cobra scaffolding never trips the guard');

check('`help` / `completion` are ignored even though they are advertised', () => {
  const fixture = ['Available Commands:', '  help        Help about any command', '  completion  Generate autocompletion'].join('\n');
  assertEqual(unlistedSubcommands(fixture, []).length, 0, 'cobra scaffolding was treated as a real command');
});

check('a genuinely new command is NOT swallowed by the ignore list', () => {
  const fixture = ['Available Commands:', '  help        Help about any command', '  brand-new   Something the CLI just gained'].join('\n');
  assertEqual(unlistedSubcommands(fixture, [])[0], 'brand-new', 'a new command was ignored');
});

check('`completion` is dropped from the artifact ON PURPOSE, subtree and all', () => {
  assert(IGNORED_SUBCOMMANDS.has('completion'), '`completion` left the ignore list — the node count claim moved');
  assert(Object.keys(parseShortDescriptions(rootHelp)).includes('completion'), 'the root no longer advertises `completion`');
  assert(!commandSet.has('completion'), '`completion` is now documented — update the 52-vs-54 node accounting');
  assert(
    ![...commandSet].some((c) => c.startsWith('completion')),
    'a `completion` SUBCOMMAND leaked in — the ignore list must drop the whole subtree',
  );
});

// ---------------------------------------------------------------------------
// THE ENUMERATION CROSS-CHECK (widened: every node, not two groups)
// ---------------------------------------------------------------------------

console.log('ENUMERATION CROSS-CHECK — `Available Commands:` vs cobra `__complete`');

check('the snapshot carries a `__complete` section for EVERY node', () => {
  // Without these the cross-check degrades to a silent no-op, so their absence
  // must fail here rather than read as a pass.
  const nodes = cocheckedNodes(blocks);
  assertEqual(
    nodes.length,
    Object.keys(blocks).filter((l) => !l.startsWith('complete ')).length,
    'some node has a --help block but no __complete block',
  );
  assert(nodes.length >= 40, `only ${nodes.length} nodes cross-checked`);
  const names = parseCompletionNames(blocks['complete app']);
  assert(names.includes('metrics'), '`metrics` missing from the __complete enumeration');
  assert(!names.some((n) => n.includes('\t') || n.startsWith(':')), 'directive trailer leaked into the parsed names');
});

check('the two enumerations agree on EVERY node of the committed snapshot', () => {
  assertEnumerationsAgree(blocks);
  let compared = 0;
  for (const { label, help, completion } of cocheckedNodes(blocks)) {
    const d = enumerationDisagreements(help, completion);
    assert(d, `no second enumeration available for ${label}`);
    assertEqual(d.missingFromHelp.length, 0, `${label}: names __complete has that the help parse lost`);
    assertEqual(d.missingFromCompletion.length, 0, `${label}: names the help parse has that __complete lacks`);
    compared++;
  }
  assert(compared >= 40, `only ${compared} nodes actually compared — the cross-check is wired to nothing`);
});

check('NEGATIVE — a help parse that lost a padded row is DETECTED', () => {
  // The concrete shape: `add-screenshot` is the longest name under `app listing`,
  // so cobra gives it a single trailing space. Delete that row from the help
  // block and the cross-check must name it.
  const mutilated = blocks['app listing'].replace(/^ {2}add-screenshot .*$/m, '');
  const d = enumerationDisagreements(mutilated, blocks['complete app listing']);
  assertEqual(d.missingFromHelp.join(','), 'add-screenshot', 'the lost row was not detected');
  const msg = messageFrom(
    () => assertEnumerationsAgree({ ...blocks, 'app listing': mutilated }),
    'assertEnumerationsAgree on a mutilated help block',
  );
  assert(msg.includes('add-screenshot'), `assertEnumerationsAgree did not name the lost row: ${msg}`);
  assert(msg.includes('civitai app listing'), `the message did not name the group: ${msg}`);
});

check('NEGATIVE — the cross-check fires at the ROOT too, and names it readably', () => {
  const mutilated = rootHelp.replace(/^ {2}model-versions .*$/m, '');
  const msg = messageFrom(
    () => assertEnumerationsAgree({ ...blocks, [ROOT_LABEL]: mutilated }),
    'assertEnumerationsAgree on a mutilated ROOT help block',
  );
  assert(msg.includes('model-versions'), `the lost root row was not named: ${msg}`);
  assert(msg.includes('"civitai"'), `the root was not rendered as a bare \`civitai\`: ${msg}`);
  assert(!msg.includes(ROOT_LABEL), `the internal ${ROOT_LABEL} sentinel leaked into a user-facing message: ${msg}`);
});

check('a snapshot with NO `__complete` section degrades instead of false-failing', () => {
  // Backwards compatibility: a pre-existing snapshot has no completion block.
  assertEqual(enumerationDisagreements(appHelp, undefined), null, 'absent completion block should yield null');
  assertEqual(parseCompletionNames(undefined), null, 'absent completion block should parse to null');
  const noCompletion = Object.fromEntries(Object.entries(blocks).filter(([l]) => !l.startsWith('complete ')));
  assertEnumerationsAgree(noCompletion); // must not throw
});

check('a group whose `__complete` block VANISHES is caught by the reverse guard', () => {
  // The seam between the two guards. Losing a completion block silently demotes
  // a group to a leaf and drops its whole subtree — invisible to the
  // cross-check (which just degrades), so the reverse guard has to see it.
  const { ['complete app listing']: _gone, ...crippled } = blocks;
  const msg = messageFrom(
    () => buildArtifact(
      Object.entries(crippled).map(([label, text]) => `===CMD ${label}===\n${text}`).join(''),
      'test',
    ),
    'buildArtifact with `complete app listing` removed',
  );
  assert(
    /set-icon|add-screenshot|reorder/.test(msg),
    `the dropped subtree was not named: ${msg}`,
  );
  assert(msg.includes('complete app listing'), `the message does not name the missing section: ${msg}`);
});

check('BOTH guards are WIRED INTO buildArtifact, not merely correct in isolation', () => {
  // 🔴 FOUND BY MUTATION, NOT BY REVIEW. Every cross-check assertion above calls
  // `assertEnumerationsAgree(blocks)` DIRECTLY, so deleting its call site inside
  // buildArtifact left the entire suite GREEN — a guard that is correct and
  // unreachable, which is the shape that ships. These two drive the real
  // buildArtifact and require the throw to come out of IT.
  //
  // The fixture for the cross-check arm deletes `add-screenshot` from the
  // `app listing` HELP only: `__complete` still lists it, so the walk still
  // documents it and the reverse guard stays quiet. That isolation is the point
  // — otherwise a green here could be the other guard firing.
  const serialize = (b) => Object.entries(b).map(([label, text]) => `===CMD ${label}===\n${text}`).join('');
  const helpRowGone = serialize({
    ...blocks,
    'app listing': blocks['app listing'].replace(/^ {2}add-screenshot .*$/m, ''),
  });
  const msg = messageFrom(() => buildArtifact(helpRowGone, 'test'), 'buildArtifact on a disagreeing enumeration');
  assert(
    msg.includes('add-screenshot') && msg.includes('disagree'),
    `buildArtifact did not surface the ENUMERATION disagreement — is assertEnumerationsAgree still called? got: ${msg}`,
  );

  // And the reverse guard's own wiring, isolated the same way: `__complete` and
  // the help both still advertise `metrics`, but the walk is starved of it by
  // removing it from the completion block — so the help advertises a command the
  // built set lacks, and only assertNoUnlistedSubcommands can see that.
  const walkStarved = serialize({
    ...blocks,
    'complete app': blocks['complete app'].split('\n').filter((l) => !l.startsWith('metrics\t')).join('\n'),
  });
  const msg2 = messageFrom(() => buildArtifact(walkStarved, 'test'), 'buildArtifact on a starved walk');
  assert(
    msg2.includes('metrics'),
    `buildArtifact did not surface the UNDOCUMENTED command — is assertNoUnlistedSubcommands still called? got: ${msg2}`,
  );
});

// ---------------------------------------------------------------------------
// 🔴 THE pflag NUL SENTINEL
//
// `civitai login --token` declares NoOptDefVal = "\x00civitai-token-no-value",
// which collides with pflag's own alignment sentinel: pflag splits the row on
// the FIRST NUL, so its real separator survives into stdout as a raw NUL and the
// `[="…"]` default is printed with the alignment spacing inside it. Invisible
// until the reference widened past the `app` group.
// ---------------------------------------------------------------------------

console.log('pflag NUL SENTINEL — the committed snapshot must stay a TEXT file');

check('the committed snapshot contains ZERO NUL bytes', () => {
  const nuls = snapshotBytes.filter((b) => b === 0).length;
  assertEqual(nuls, 0, 'the snapshot carries NUL bytes — git and grep will treat it as BINARY and stop diffing it');
});

check('POSITIVE CONTROL — the repair actually has something to repair', () => {
  // A zero-NUL verdict above is meaningless unless the raw source really emits
  // one. This is the measured `civitai login --help` row, transcribed by hand.
  const raw = '      --token string[="                            civitai-token-no-value"]\x00store a personal API key instead\n';
  assert(raw.includes('\x00'), 'the fixture lost its NUL — it no longer reproduces the defect');
  const fixed = repairPflagSentinel(raw);
  assert(!fixed.includes('\x00'), 'repairPflagSentinel left a NUL behind');
  assertEqual(
    fixed,
    '      --token string[="civitai-token-no-value"]  store a personal API key instead\n',
    'the row was not restored to what pflag would have printed without the sentinel collision',
  );
});

check('a lone NUL with no `[="` prefix still becomes a separator', () => {
  assertEqual(repairPflagSentinel('      --x string\x00usage'), '      --x string  usage', 'lone NUL not handled');
  assertEqual(repairPflagSentinel('nothing to do'), 'nothing to do', 'the repair mutated clean text');
});

check('the artifact carries the REPAIRED `login --token` row, not the mangled one', () => {
  const login = artifact.commands.find((c) => c.command === 'login');
  assert(login, 'no `login` command in the artifact');
  const token = login.options.find((o) => o.flags.startsWith('--token'));
  assert(token, `\`login\` has no --token flag: ${JSON.stringify(login.options.map((o) => o.flags))}`);
  assertEqual(token.flags, '--token string[="civitai-token-no-value"]', 'the --token flag spec is still mangled');
  assert(
    token.description.startsWith('store a personal API key'),
    `the description absorbed the default value: ${JSON.stringify(token.description)}`,
  );
  // The whole artifact, not just this row.
  for (const c of artifact.commands) {
    for (const o of c.options) {
      assert(!o.flags.includes('\x00') && !o.description.includes('\x00'), `${c.command}: NUL in a flag row`);
      assert(
        !/\s{2,}/.test(o.flags),
        `${c.command}: a flag spec carries an alignment run — pflag mis-split it: ${JSON.stringify(o.flags)}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// `Examples:` EXTRACTION
//
// WHY THIS EXISTS: cobra emits an `Examples:` block for most commands and the
// generator threw ALL of them away — `section()` only ever used `Examples:` as a
// TERMINATOR for the preceding section and nothing read it as a section of its
// own.
//
// The failure mode this guards is the reassuring zero: a generator wired to
// nothing emits `examples: []` for every command and looks exactly like a CLI
// whose commands genuinely have none. Hence a FLOOR plus an INDEPENDENT recount
// of the source, not merely "the field exists".
// ---------------------------------------------------------------------------

const commandsWithExamples = artifact.commands.filter((c) => c.examples?.length);
const exampleLineTotal = commandsWithExamples.reduce((n, c) => n + c.examples.length, 0);

// MEASURED on appblocks-snapshots/civitai-cli-help.txt @ civitai v0.1.90-13-g569f5dc:
// 46 of the 52 emitted commands carry an `Examples:` block, 196 lines in total
// (was 13 / 69 when the reference covered only `app`). Cross-checked against the
// Go source's own `cobra.Command.Example` strings: byte-identical on all 46.
// FLOORS, not equalities — see above.
const EXAMPLE_COMMAND_FLOOR = 46;
const EXAMPLE_LINE_FLOOR = 196;

console.log('EXAMPLES — the `Examples:` block is extracted and carried into the artifact');

check(`at least ${EXAMPLE_COMMAND_FLOOR} commands carry examples (a zero-example artifact FAILS)`, () => {
  assert(
    commandsWithExamples.length >= EXAMPLE_COMMAND_FLOOR,
    `only ${commandsWithExamples.length}/${artifact.commands.length} commands carry examples ` +
      `(floor ${EXAMPLE_COMMAND_FLOOR}) — the Examples: parser is dropping blocks`,
  );
  assert(
    exampleLineTotal >= EXAMPLE_LINE_FLOOR,
    `only ${exampleLineTotal} example lines total (floor ${EXAMPLE_LINE_FLOOR}) — ` +
      `the blocks are being truncated even though the commands were counted`,
  );
});

check('POSITIVE CONTROL — the artifact count matches an INDEPENDENT recount of the snapshot', () => {
  // Counted straight off the raw bundle text with string ops, NOT through
  // section()/parseExamples() — so if that parser regresses, this number stays
  // put and the comparison fires. The ROOT block also has examples but is not
  // emitted as a command entry, so it is excluded here too.
  const rawWithExamples = Object.entries(splitBlocks(bundle))
    .filter(([label]) => label !== ROOT_LABEL && !label.startsWith('complete '))
    .filter(([, help]) => help.split('\n').includes('Examples:'))
    .map(([label]) => label)
    .sort();
  assert(rawWithExamples.length > 0, 'the raw snapshot advertises NO Examples: block — fixture is broken');
  assertEqual(
    commandsWithExamples.map((c) => c.command).sort().join(','),
    rawWithExamples.join(','),
    'the set of commands the artifact gave examples to differs from the set the snapshot has them for',
  );
});

check('CONTENT — `app dev-tunnel` examples appear VERBATIM, leading whitespace intact', () => {
  // A count alone cannot tell "extracted correctly" from "extracted an empty
  // string 46 times". Transcribed by hand from the snapshot bytes (measured
  // with `cat -A`), NOT copied out of the generator's own output: every line
  // carries cobra's 2-space indent, and line 4 has SEVENTEEN spaces of
  // hand-alignment before its trailing `#` comment.
  const want = [
    '  # In terminal 1: start the embeddable dev server.',
    '  npm run dev:tunnel',
    '  # In terminal 2: open the tunnel (Ctrl-C to tear down).',
    '  civitai app dev-tunnel                 # blockId from block.manifest.json in the CWD',
    '  civitai app dev-tunnel my-block',
    '  civitai app dev-tunnel my-block --port 5173',
    "  # Dev server NOT on the CLI's loopback (a container/pod, VM, or bound interface):",
    '  civitai app dev-tunnel my-block --local-host 10.42.0.100',
    '  civitai app dev-tunnel --block my-block --idle-timeout 15m',
  ];
  const got = artifact.commands.find((c) => c.command === 'app dev-tunnel')?.examples;
  assert(got, 'no `app dev-tunnel` command in the artifact');
  assertEqual(got.join('\n'), want.join('\n'), '`app dev-tunnel` examples are not verbatim');
  // Stated separately so a whitespace-only regression names itself.
  assert(
    got.every((l) => /^ {2}\S/.test(l)),
    `a line lost its leading whitespace: ${JSON.stringify(got.filter((l) => !/^ {2}\S/.test(l)))}`,
  );
  assertEqual(
    got[3],
    '  civitai app dev-tunnel                 # blockId from block.manifest.json in the CWD',
    'the 17-space comment alignment was collapsed',
  );
});

check('CONTENT — internal blank lines survive (`app create` groups four scenarios)', () => {
  // The transcript's own grouping. A `.filter(Boolean)` anywhere in the chain
  // silently welds the four scenarios into one wall of text.
  const got = artifact.commands.find((c) => c.command === 'app create')?.examples ?? [];
  assertEqual(got.length, 11, '`app create` should carry 11 lines (8 content + 3 blank separators)');
  assertEqual(
    got.map((l, i) => (l.trim() ? '' : String(i))).filter(Boolean).join(','),
    '2,5,8',
    'the internal blank lines moved or were dropped',
  );
  assert(got[0].startsWith('  # A page-money app'), `unexpected first line: ${JSON.stringify(got[0])}`);
});

check('BOUNDARY — trailing blank lines are trimmed but nothing else is', () => {
  for (const c of commandsWithExamples) {
    assert(c.examples[0].trim(), `${c.command}: leading blank line not trimmed`);
    assert(c.examples[c.examples.length - 1].trim(), `${c.command}: trailing blank line not trimmed`);
  }
});

console.log('EXAMPLES / NEGATIVE — the section boundary does not OVER-capture');

check('an example block never leaks into the LONG description', () => {
  // The bug being fixed is a section-boundary bug, so the symmetric regression
  // is over-capture. `parseLongDescription` cuts at `Usage:` and `Examples:`
  // sits AFTER it; moving that cut (or dropping it) drags the whole transcript
  // into the description text every command's one-liner is derived from.
  //
  // 🔴 THIS USED TO ASSERT PER-LINE ("no example line appears anywhere in the
  // Long"), AND WIDENING FALSIFIED IT. Measured across the whole tree, two
  // blocks legitimately repeat an example line in their prose: the ROOT's
  // "Get started:" section reproduces two of its own Examples lines verbatim,
  // and `download`'s Long contains `civitai download 691639`. Both are authored
  // duplication in the Go source, not a parse leak — so the per-line form is a
  // FALSE POSITIVE at a correct project, and re-tightening it (a "≥N contiguous
  // duplicate lines" threshold) would only be tuning a number until this
  // particular corpus passed.
  //
  // What over-capture ACTUALLY produces is section HEADINGS inside the Long, so
  // that is what is asserted: a boundary claim rather than a text-similarity
  // one. Measured: zero of the 53 blocks carry any of these as a line of their
  // Long today, and breaking parseLongDescription's `Usage:` cut fires it.
  for (const [label, help] of Object.entries(blocks)) {
    if (label.startsWith('complete ')) continue;
    const examples = parseExamples(help);
    if (!examples.length) continue;
    const long = parseLongDescription(help);
    const longLines = long.split('\n').map((l) => l.trim());
    for (const heading of ['Usage:', 'Examples:', 'Flags:', 'Global Flags:', 'Available Commands:']) {
      assert(
        !longLines.includes(heading),
        `${label}: the "${heading}" section boundary was crossed — it is inside the long description`,
      );
    }
    // And the block as a contiguous run, which is what an actual boundary
    // regression drags in.
    assert(
      !long.includes(examples.join('\n')),
      `${label}: the whole Examples: block leaked into the long description`,
    );
  }
});

check('an example block never over-runs into Flags / Global Flags / the cobra trailer', () => {
  // The other direction: if the section terminator stops matching, `Examples:`
  // swallows the rest of the help body.
  //
  // 🔴 The row shape needs the 2+ SPACE SEPARATOR, and widening is what proved
  // it: `civitai generate`'s Examples block hand-wraps an invocation with a
  // trailing `\`, so its continuation line reads
  // `    --image https://example.com/a.jpg --image ./b.png --yes` — a genuine
  // example that a "starts with --flag" test calls a Flags row. A cobra Flags
  // ROW is a two-column table entry; the separator is what makes it one.
  const isFlagRow = (l) => /^\s+(?:-\w,\s+)?--[a-zA-Z0-9-]+.*?\s{2,}\S/.test(l);
  for (const c of commandsWithExamples) {
    for (const line of c.examples) {
      assert(!isFlagRow(line), `${c.command}: a Flags: row was captured as an example: ${JSON.stringify(line)}`);
      for (const heading of ['Flags:', 'Global Flags:', 'Available Commands:', 'Usage:']) {
        assert(
          !line.includes(heading),
          `${c.command}: the "${heading}" section was captured as an example: ${JSON.stringify(line)}`,
        );
      }
      assert(
        !line.includes('for more information about a command'),
        `${c.command}: cobra's trailer line was captured as an example: ${JSON.stringify(line)}`,
      );
    }
  }
});

check('the rendered one-line `description` stays a one-liner with no example text', () => {
  for (const c of artifact.commands) {
    assert(c.description.trim(), `${c.command}: empty description`);
    assert(!c.description.includes('\n'), `${c.command}: description is multi-line`);
    for (const line of c.examples ?? []) {
      if (!line.trim()) continue;
      assert(
        !c.description.includes(line.trim()),
        `${c.command}: example text leaked into the description: ${JSON.stringify(line.trim())}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// STATUS BADGES
// ---------------------------------------------------------------------------

console.log('STATUS — the invite-gated commands keep their badge, and nothing else gains one');

check('exactly `app dev-token` and `app dev-tunnel` are gated', () => {
  const gated = artifact.commands.filter((c) => c.status === 'gated').map((c) => c.command).sort();
  assertEqual(gated.join(','), 'app dev-token,app dev-tunnel', 'the gated set changed');
  for (const c of artifact.commands) {
    assert(c.status === 'gated' || c.status === 'stable', `${c.command}: unknown status ${JSON.stringify(c.status)}`);
  }
});

check('GATED is keyed on the FULL path, so a shared leaf name cannot be mis-badged', () => {
  // `status` exists as both `app status` and `app listing status`; `get` is five
  // different commands. A leaf-keyed set would badge the wrong node.
  const dupes = artifact.commands
    .map((c) => c.command.split(' ').pop())
    .filter((leaf, _i, all) => all.filter((l) => l === leaf).length > 1);
  assert(dupes.length > 0, 'no duplicate leaf names in the tree — this guard is no longer measuring anything');
  for (const c of artifact.commands) {
    if (c.status !== 'gated') continue;
    assert(c.command.includes(' '), `a top-level command is gated: ${c.command}`);
  }
});

// ---------------------------------------------------------------------------
// 🔴 SOURCE RESOLUTION — a live binary must never silently outvote the snapshot
//
// Walking the tree deleted the curated lists AND, with them, the only thing that
// noticed a stale binary: buildCommand used to throw when a LISTED command had
// no help block. Measured on this machine with `civitai v0.1.89-20-g4018e2c` on
// PATH, `node scripts/gen-appblocks-cli.mjs` wrote 47 commands instead of 52 and
// exited 0, dropping `generate` and the whole `workflows` subtree.
// ---------------------------------------------------------------------------

console.log('SOURCE RESOLUTION — a live binary that disagrees with the snapshot is REFUSED');

check('liveVsSnapshotDrift NAMES what an older binary would drop', () => {
  // The exact reproduction, synthesised from the real snapshot: a binary that
  // predates `generate`/`workflows` yields a bundle without those blocks.
  const drop = new Set(['generate', 'workflows', 'workflows cancel', 'workflows get', 'workflows list']);
  const older = Object.entries(blocks)
    .filter(([label]) => !drop.has(label.replace(/^complete /, '')))
    .map(([label, text]) => {
      if (label !== ROOT_LABEL && label !== `complete ${ROOT_LABEL}`) return `===CMD ${label}===\n${text}`;
      // Strip the dropped commands from the root's two enumerations as well.
      const stripped = text
        .split('\n')
        .filter((l) => !/^ {2}(generate|workflows) /.test(l) && !/^(generate|workflows)\t/.test(l))
        .join('\n');
      return `===CMD ${label}===\n${stripped}`;
    })
    .join('');
  const drift = liveVsSnapshotDrift(older, bundle);
  assert(drift, 'drift was reported as incomparable on two walkable bundles');
  assertEqual(drift.added.length, 0, 'an older binary should ADD nothing');
  assertEqual(
    drift.removed.join(','),
    'generate,workflows,workflows cancel,workflows get,workflows list',
    'the guard did not name exactly the commands an older binary drops',
  );
});

check('drift is symmetric — a NEWER binary is caught too', () => {
  // The other direction matters just as much: it produces a local artifact CI
  // cannot reproduce, which is how a snapshot silently falls behind.
  const newer = Object.entries(blocks)
    .map(([label, text]) => {
      if (label === ROOT_LABEL) return `===CMD ${label}===\n${text.replace(/^ {2}buzz /m, '  brand-new     Something new\n  buzz ')}`;
      if (label === `complete ${ROOT_LABEL}`) return `===CMD ${label}===\n${text.replace(/^buzz\t/m, 'brand-new\tSomething new\nbuzz\t')}`;
      return `===CMD ${label}===\n${text}`;
    })
    .join('') + `===CMD brand-new===\nSomething new\n\nUsage:\n  civitai brand-new [flags]\n===CMD complete brand-new===\n:0\n`;
  const drift = liveVsSnapshotDrift(newer, bundle);
  assert(drift, 'drift was reported as incomparable');
  assertEqual(drift.added.join(','), 'brand-new', 'a newly-gained command was not reported as added');
  assertEqual(drift.removed.length, 0, 'nothing should be reported as removed');
});

check('identical bundles report NO drift (the guard cannot be permanently red)', () => {
  const drift = liveVsSnapshotDrift(bundle, bundle);
  assert(drift, 'identical bundles were reported as incomparable');
  assertEqual(drift.added.length + drift.removed.length, 0, 'a bundle drifted against ITSELF');
});

check('an UNWALKABLE bundle is "cannot compare", never "no drift"', () => {
  // The reassuring-zero shape: if a malformed capture silently compared equal,
  // the guard would wave through exactly the broken artifact it exists to stop.
  assertEqual(nodeSetOf('not a bundle at all'), null, 'a malformed bundle should not walk');
  assertEqual(liveVsSnapshotDrift('garbage', bundle), null, 'an unwalkable live bundle must be incomparable');
  assertEqual(liveVsSnapshotDrift(bundle, 'garbage'), null, 'an unwalkable snapshot must be incomparable');
  // …and the real snapshot IS walkable, so the checks above are not vacuous.
  assert((nodeSetOf(bundle) ?? []).length >= COMMAND_COUNT_FLOOR, 'the committed snapshot did not walk');
});

// 🔴 THE POLICY ITSELF, END-TO-END, WITH A FAKE BINARY.
//
// Everything above drives the pure helper. That is not enough, and mutation
// proved it: flipping `resolveBundle` back to "prefer live" left this whole
// suite GREEN, because no test ever reached resolveBundle — the same
// correct-but-unwired shape that `BOTH guards are WIRED INTO buildArtifact`
// exists for. So this spawns the real generator against a STUB `civitai` that
// reports a deliberately tiny tree, and asserts the POLICY:
//   - by default the snapshot wins even though a binary is right there;
//   - opting in with CIVITAI_CLI_LIVE=1 refuses, naming what it would drop.
// Hermetic — the stub is a node script, so this arm runs in CI too.
const stubDir = mkdtempSync(join(tmpdir(), 'civitai-stub-'));
const STUB = join(stubDir, 'civitai-stub.mjs');
writeFileSync(
  STUB,
  [
    '#!/usr/bin/env node',
    'const a = process.argv.slice(2);',
    "if (a[0] === '--version') { console.log('civitai v0.0.0-stub'); process.exit(0); }",
    "if (a[0] === '__complete') {",
    "  const path = a.slice(1, -1);",
    "  if (path.length === 0) { console.log('app\\tBrowse, author, and ship Civitai Apps'); }",
    "  console.log(path.length === 0 ? ':4' : ':0');",
    '  process.exit(0);',
    '}',
    "const path = a.filter((x) => x !== '--help');",
    "if (path.length === 0) {",
    "  console.log('A stub CLI.\\n\\nUsage:\\n  civitai [flags]\\n\\nAvailable Commands:\\n  app   Browse, author, and ship Civitai Apps\\n\\nFlags:\\n      --color   colour\\n');",
    '} else {',
    "  console.log('Stub app group.\\n\\nUsage:\\n  civitai app [flags]\\n');",
    '}',
  ].join('\n'),
);
chmodSync(STUB, 0o755);

function runGenerator(env) {
  const r = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'gen-appblocks-cli.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, CIVITAI_CLI_BIN: STUB, APPBLOCKS_SNAPSHOT_ONLY: '', CIVITAI_CLI_LIVE: '', ...env },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

check('END-TO-END — a resolvable binary does NOT outvote the committed snapshot', () => {
  // The stub advertises ONE command. If the generator preferred it, the
  // artifact would be that tree instead of the snapshot's 52.
  const probe = runGenerator({});
  assert(
    /from snapshot:/.test(probe.out),
    `the generator read a live binary by default — a stale \`civitai\` on PATH now decides what ships: ${probe.out.slice(0, 400)}`,
  );
  assertEqual(probe.status, 0, `the default generator run failed: ${probe.out.slice(0, 400)}`);
  const m = probe.out.match(/wrote (\d+) commands/);
  assert(m && Number(m[1]) >= COMMAND_COUNT_FLOOR, `default run wrote ${m?.[1]} commands, not the snapshot's full tree`);
});

check('END-TO-END — opting in to a DIVERGENT binary is refused, and the message names the loss', () => {
  const probe = runGenerator({ CIVITAI_CLI_LIVE: '1' });
  assert(probe.status !== 0, `a divergent live binary was accepted (exit ${probe.status}): ${probe.out.slice(0, 400)}`);
  assert(/DIFFERENT command trees/.test(probe.out), `the refusal is not the drift guard: ${probe.out.slice(0, 500)}`);
  for (const named of ['generate', 'workflows cancel']) {
    assert(probe.out.includes(named), `the refusal does not name \`${named}\` among the dropped commands`);
  }
  assert(/OLDER than the snapshot/.test(probe.out), 'the refusal does not say which side is behind');
});

check('END-TO-END — `--write-snapshot` under APPBLOCKS_SNAPSHOT_ONLY refuses instead of no-oping', () => {
  const r = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'gen-appblocks-cli.mjs'), '--write-snapshot'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, CIVITAI_CLI_BIN: STUB, APPBLOCKS_SNAPSHOT_ONLY: '1' },
  });
  const out = `${r.stdout}${r.stderr}`;
  assert(r.status !== 0, `a refresh that cannot refresh exited 0 — the silent no-op is back: ${out.slice(0, 300)}`);
  assert(/--write-snapshot needs a live/.test(out), `the refusal is not the expected one: ${out.slice(0, 300)}`);
});

// ---------------------------------------------------------------------------
// 🔴 DEFAULT EXTRACTION — a machine annotation vs prose that merely says "default"
//
// Cobra machine-emits `(default …)` for a non-empty Go default and ALWAYS quotes
// string defaults, leaving numbers/durations/bools bare. Several flags ALSO end
// their authored usage string with a parenthesised "(default …)" that is prose.
// The discriminating regex carried a nine-line justification and NO test:
// loosening it to `/\s*\(default\s+(.*?)\)\s*$/` left the entire suite green
// while changing six published defaults — including `download --root`, which
// rendered `default = '."; only applies with --layout'`.
// ---------------------------------------------------------------------------

console.log('DEFAULTS — authored prose is not a cobra default annotation');

check('PROSE `(default …)` stays in the description and yields no default', () => {
  const prose = [
    ['app create', '--dir', '(default ./<slug>)'],
    ['app create', '--name', '(default derived from the name argument)'],
    ['app init', '--dir', '(default ./<slug>)'],
    ['app init', '--name', '(default derived from the name argument)'],
    ['app dev-tunnel', '--tunnel-endpoint', '(default sish.civitai.com:2224, or $CIVITAI_DEV_TUNNEL_ENDPOINT)'],
    ['download', '--root', '(default "."; only applies with --layout)'],
  ];
  for (const [command, flag, tail] of prose) {
    const cmd = artifact.commands.find((c) => c.command === command);
    assert(cmd, `no \`${command}\` in the artifact`);
    const opt = cmd.options.find((o) => o.flags === flag || o.flags.startsWith(`${flag} `));
    assert(opt, `\`${command}\` has no ${flag}`);
    assertEqual(opt.default, null, `${command} ${flag}: authored prose was swallowed into \`default\``);
    assert(
      opt.description.endsWith(tail),
      `${command} ${flag}: the prose was mangled or moved — got ${JSON.stringify(opt.description.slice(-80))}`,
    );
  }
});

check('GENUINE cobra annotations ARE extracted (the guard is not "never extract")', () => {
  // Positive control. Without it, `default: null` everywhere would pass above.
  const machine = [
    ['app create', '-t, --template string', 'page-money'],
    ['app init', '-t, --template string', 'static'],
    ['app listing set-icon', '--dir string', '.'],
  ];
  for (const [command, flags, want] of machine) {
    const opt = artifact.commands.find((c) => c.command === command)?.options.find((o) => o.flags === flags);
    assert(opt, `\`${command}\` has no ${flags}`);
    assertEqual(opt.default, want, `${command} ${flags}: cobra's own default was not extracted`);
    assert(!opt.description.includes('(default'), `${command} ${flags}: the annotation was left in the description`);
  }
  const extracted = artifact.commands.reduce((n, c) => n + c.options.filter((o) => o.default !== null).length, 0);
  assert(extracted >= 13, `only ${extracted} flags carry an extracted default — the extractor stopped working`);
});

check('SYNTHETIC control — every shape cobra emits, and every shape it does not', () => {
  // Driven through parseFlags directly so the rule is pinned independently of
  // whichever flags this particular binary happens to ship.
  const rows = (...lines) => ['Flags:', ...lines].join('\n');
  const one = (line) => parseFlags(rows(line))[0];
  // Machine-emitted: quoted string, bare int, float, duration, bools, negative.
  assertEqual(one('      --a string   x (default "page-money")').default, 'page-money', 'quoted string default');
  assertEqual(one('      --b int      x (default 25)').default, '25', 'bare int default');
  assertEqual(one('      --c float    x (default 1.5)').default, '1.5', 'float default');
  assertEqual(one('      --d duration x (default 30m0s)').default, '30m0s', 'duration default');
  assertEqual(one('      --e          x (default true)').default, 'true', 'true default');
  assertEqual(one('      --f          x (default false)').default, 'false', 'false default');
  assertEqual(one('      --g int      x (default -1)').default, '-1', 'negative default');
  assertEqual(one('      --h string   x (default "")').default, '', 'empty-string default');
  // Authored prose — none of these is a cobra annotation.
  for (const tail of [
    '(default ./<slug>)',
    '(default derived from the name argument)',
    '(default sish.civitai.com:2224, or $CIVITAI_DEV_TUNNEL_ENDPOINT)',
    '(default "."; only applies with --layout)',
    '(default the current directory)',
  ]) {
    const got = one(`      --p string   usage ${tail}`);
    assertEqual(got.default, null, `prose ${JSON.stringify(tail)} was treated as a cobra default`);
    assert(got.description.endsWith(tail), `prose ${JSON.stringify(tail)} was mangled`);
  }
});

// ---------------------------------------------------------------------------
// GLOBAL FLAGS — the root's own flags, which no command entry can carry
// ---------------------------------------------------------------------------

console.log('GLOBAL FLAGS — documented once, from the root');

check('the artifact carries the global flags', () => {
  const g = artifact.program?.globalOptions;
  assert(Array.isArray(g), 'program.globalOptions is missing — the page claims to document every flag');
  const names = g.map((o) => o.flags);
  for (const want of ['--color', '--no-color', '--no-update-check']) {
    assert(names.includes(want), `global flag ${want} missing: ${JSON.stringify(names)}`);
  }
  assert(names.some((n) => n.includes('--version')), `--version missing: ${JSON.stringify(names)}`);
  assert(!names.some((n) => /--help\b/.test(n)), '`--help` should be filtered out like everywhere else');
  // They must NOT also be repeated on every command entry.
  const onCommands = artifact.commands.filter((c) => c.options.some((o) => o.flags === '--no-color'));
  assertEqual(onCommands.length, 0, 'a global flag leaked into per-command options');
});

check("REGRESSION — cobra's trailer never lands in a flag description", () => {
  // 🔴 Found by RENDERING the new global-flags block, not by review. The root is
  // the only node whose `Flags:` section is last in the body — every other node
  // ends it at the `Global Flags:` heading — so its section ran to EOF and
  // parseFlags joined cobra's trailer on as a wrapped continuation of `-v`.
  const trailer = 'for more information about a command';
  for (const o of artifact.program.globalOptions) {
    assert(!o.description.includes(trailer), `global flag ${o.flags} swallowed cobra's trailer: ${JSON.stringify(o.description)}`);
  }
  for (const c of artifact.commands) {
    for (const o of c.options) {
      assert(!o.description.includes(trailer), `${c.command} ${o.flags} swallowed cobra's trailer`);
    }
  }
  const version = artifact.program.globalOptions.find((o) => o.flags.includes('--version'));
  assertEqual(version.description, 'version for civitai', 'the --version description is not the bare cobra usage string');
  // POSITIVE CONTROL: the trailer really is present in the root block, so the
  // assertions above are about a hazard that exists rather than one that cannot.
  assert(rootHelp.includes(trailer), 'the root help no longer carries a trailer — re-measure this guard');
});

check('a section body ends at column 0, and blank lines do NOT end it', () => {
  // The structural rule behind the fix. Blank lines are interior content —
  // `app create`'s Examples block groups four scenarios with them — so a
  // "stop at the first blank line" fix would have destroyed that instead.
  const help = ['Flags:', '      --a   first', '      --b   second', '', 'Trailer at column zero.'].join('\n');
  const flags = parseFlags(help);
  assertEqual(flags.length, 2, 'wrong number of flags parsed');
  assertEqual(flags[1].description, 'second', "the column-0 trailer was joined onto the last flag's description");
  assert(
    (artifact.commands.find((c) => c.command === 'app create')?.examples ?? []).length === 11,
    'blank lines stopped being interior content — `app create` lost its scenario separators',
  );
});

// ---------------------------------------------------------------------------
// PAGE PROSE — hand-written curation is exactly what this PR exists to delete
// ---------------------------------------------------------------------------

console.log('PAGE PROSE — the hand-written command list on apps/reference/cli.md is GATED');

check('the page names exactly the top-level commands the artifact carries', () => {
  // 🔴 The `## Command reference` intro names all 17 top-level commands in
  // prose. That is ungated curation — the same failure mode as the APP_COMMANDS
  // list this PR deletes, reintroduced in English. Gate it, in BOTH directions,
  // so a command the CLI gains or loses fails here instead of rotting silently.
  const page = readFileSync(`${repoRoot}/apps/reference/cli.md`, 'utf8');
  const start = page.indexOf('## Command reference');
  // Match the TAG, not one spelling of it: the island became `<CliReference>` +
  // `</CliReference>` when the page gained its markdown-fallback slot (the .md /
  // LLM channel — scripts/appblocks-md.mjs), and pinning `<CliReference />` made
  // this assertion fail on a page that had not restructured at all.
  const end = page.indexOf('<CliReference', start);
  assert(start !== -1 && end > start, 'could not locate the `## Command reference` intro — did the page restructure?');
  const intro = page.slice(start, end);

  // Single-word backticked tokens only, so `civitai app` / `civitai completion
  // --help` (multi-word) are prose rather than a claimed command name. The
  // program's own name is excluded: it is the binary, not a command, and no
  // top-level command can be called `civitai` (it would be `civitai civitai`).
  const named = new Set(
    [...intro.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter((t) => /^[a-z][a-z0-9-]*$/.test(t) && t !== (artifact.program?.name ?? 'civitai')),
  );
  const topLevel = artifact.commands.filter((c) => !c.command.includes(' ')).map((c) => c.command);
  assert(topLevel.length >= TOP_LEVEL_FLOOR, 'no top-level commands to compare against');
  // `completion` is named as the one deliberate exclusion, so it belongs in the
  // prose while deliberately NOT being a command entry.
  const expected = new Set([...topLevel, 'completion']);

  const missing = [...expected].filter((c) => !named.has(c)).sort();
  const stale = [...named].filter((c) => !expected.has(c)).sort();
  assertEqual(
    missing.join(','),
    '',
    'the page intro does not name every top-level command — the CLI gained one and the prose rotted',
  );
  assertEqual(
    stale.join(','),
    '',
    'the page intro names something that is not a top-level command — the CLI removed one, or a typo',
  );
});

// ---------------------------------------------------------------------------
// RENDERER
// ---------------------------------------------------------------------------

console.log('RENDERER — anchor slugs (was: literal spaces inside an id)');

check('a nested command slugifies instead of emitting `cli-app listing set-icon`', () => {
  assertEqual(cliAnchorId('app listing set-icon'), 'cli-app-listing-set-icon', 'nested command not slugified');
  assertEqual(cliAnchorId('app create'), 'cli-app-create', 'top-level command not slugified');
  assertEqual(cliAnchorId('model-versions by-hash'), 'cli-model-versions-by-hash', 'hyphenated command not slugified');
});

check('EVERY command in the artifact gets a URL-safe, unique id', () => {
  // The positive control: this loop must actually see commands, or "no id
  // contains a space" is a claim about an empty set.
  assert(
    artifact.commands.length >= COMMAND_COUNT_FLOOR,
    'the artifact does not carry the whole command tree',
  );
  const ids = artifact.commands.map((c) => cliAnchorId(c.command));
  for (const id of ids) {
    assert(!/\s/.test(id), `anchor id contains whitespace: ${JSON.stringify(id)}`);
    assert(/^[a-z0-9-]+$/.test(id), `anchor id is not URL-fragment safe: ${JSON.stringify(id)}`);
  }
  assertEqual(new Set(ids).size, ids.length, 'two commands collapsed onto the same anchor id');
});

console.log('RENDERER — heading depth (was: hardcoded <h3>; then a base that widening invalidated)');

check('a subcommand renders DEEPER than the group that owns it, at EVERY depth', () => {
  // `.vitepress/config.mts` sets `outline: { level: [2, 3] }` and VitePress
  // builds the outline by scanning the rendered DOM, so h3 is the deepest level
  // that appears there.
  assertEqual(cliHeadingLevel('app'), 3, 'a top-level command group should be h3');
  assertEqual(cliHeadingLevel('login'), 3, 'a top-level leaf should be h3');
  assertEqual(cliHeadingLevel('app listing'), 4, 'a depth-2 group should be h4');
  assertEqual(cliHeadingLevel('app create'), 4, 'a depth-2 command should be h4');
  assertEqual(cliHeadingLevel('app listing set-icon'), 5, 'a depth-3 subcommand should be h5');
  assertEqual(cliHeadingTag('app listing set-icon'), 'h5', 'heading TAG disagrees with the level');
  // 🔴 The relation, stated independently of the numbers: this is what the
  // widening could have silently broken. Under the pre-widening `tokens - 2`
  // rule `app` and `app create` BOTH landed on h3 — a group and its own
  // subcommand as siblings.
  for (const c of artifact.commands) {
    const parent = c.command.split(' ').slice(0, -1).join(' ');
    if (!parent) continue;
    assert(
      cliHeadingLevel(c.command) > cliHeadingLevel(parent),
      `${c.command} (h${cliHeadingLevel(c.command)}) is not deeper than its parent ${parent} (h${cliHeadingLevel(parent)})`,
    );
  }
});

check('every artifact command lands in the h3..h6 band, top-level ones on h3', () => {
  const top = artifact.commands.filter((c) => !c.command.includes(' '));
  assert(top.length >= TOP_LEVEL_FLOOR, `only ${top.length} top-level commands — nothing to check`);
  for (const c of top) assertEqual(cliHeadingLevel(c.command), 3, `${c.command} should be h3`);
  for (const c of artifact.commands) {
    const lvl = cliHeadingLevel(c.command);
    assert(lvl >= 3 && lvl <= 6, `${c.command}: heading level ${lvl} outside the h3..h6 band`);
  }
  // Clamped at BOTH ends, so a hypothetical deeper tree never emits an <h7> and
  // an empty command never renders above the page's own `##` sections.
  assertEqual(cliHeadingLevel('a b c d e f g'), 6, 'heading level is not clamped at 6');
  assertEqual(cliHeadingLevel(''), 3, 'an empty command must not render above h3');
});

console.log('');
if (failures) {
  console.error(`appblocks-cli tests: ${failures} FAILED, ${skipped} skipped`);
  process.exit(1);
}
console.log(`appblocks-cli tests: all passed (${skipped} skipped)`);
