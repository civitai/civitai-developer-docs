#!/usr/bin/env node
// Regression tests for scripts/gen-appblocks-cli.mjs — specifically the REVERSE
// drift-guard (assertNoUnlistedSubcommands) that a build depends on.
//
//   node scripts/test-appblocks-cli.mjs
//
// WHY THIS EXISTS: every pre-existing check in that generator is FORWARD-only.
// buildCommand throws when a LISTED command has no help block, and
// EXPECTED_COMMAND_COUNT is derived from APP_COMMANDS/APP_SUBGROUPS — it
// compares the curated list against itself, so it can never disagree with it.
// Both are blind BY CONSTRUCTION to a command the CLI GAINS. Measured: with the
// reverse guard removed and `metrics` dropped from APP_COMMANDS, the generator
// exits 0 and writes 18 commands with `civitai app metrics` silently absent —
// which is exactly how it shipped missing from the published reference.
//
// This test pins the guard against the REAL committed snapshot and covers:
//   (a) POSITIVE CONTROL — the parser actually sees commands, so a "0 unlisted"
//       verdict is a measurement rather than a scanner wired to nothing.
//   (b) CURRENT STATE     — the committed snapshot has no unlisted subcommand.
//   (c) NEGATIVE CONTROL  — dropping `metrics` from the list makes the guard
//       FIRE, with `metrics` named in the message.
//   (d) SUBGROUP ARM      — the same relation holds for `app listing`'s own
//       "Available Commands" block, not just the top-level `app` group.
//   (e) IGNORE LIST       — cobra scaffolding (help/completion) never trips it.
import { readFileSync } from 'node:fs';
import {
  APP_COMMANDS,
  APP_SUBGROUPS,
  SNAPSHOT,
  assertEnumerationsAgree,
  assertNoUnlistedSubcommands,
  enumerationDisagreements,
  parseCompletionNames,
  parseShortDescriptions,
  splitBlocks,
  unlistedSubcommands,
} from './gen-appblocks-cli.mjs';

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
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

const bundle = readFileSync(SNAPSHOT, 'utf8');
const blocks = splitBlocks(bundle);
const appHelp = blocks['app'];
const listingHelp = blocks['app listing'];

console.log('POSITIVE CONTROL — the parser observes the snapshot at all');

check('the snapshot splits into the `app` group block plus per-command blocks', () => {
  assert(appHelp, 'no `app` block parsed from the committed snapshot');
  assert(listingHelp, 'no `app listing` block parsed from the committed snapshot');
  assert(Object.keys(blocks).length > APP_COMMANDS.length, 'suspiciously few help blocks parsed');
});

check('"Available Commands" yields a non-empty command set (guard is not wired to nothing)', () => {
  // Without this, a zero-unlisted verdict below is indistinguishable from a
  // parser that returned {} for every group.
  const advertised = Object.keys(parseShortDescriptions(appHelp));
  assert(advertised.length >= APP_COMMANDS.length, `app --help advertised only ${advertised.length} commands`);
  assert(advertised.includes('metrics'), '`metrics` not advertised by the snapshot — fixture is out of date');
  const subs = Object.keys(parseShortDescriptions(listingHelp));
  assert(subs.length >= APP_SUBGROUPS.listing.length, `app listing --help advertised only ${subs.length} subcommands`);
});

check('the LONGEST name in a group is parsed (cobra pads it to ONE space)', () => {
  // Measured on the real snapshot: `add-screenshot` is the longest name under
  // `app listing`, so cobra emits `  add-screenshot Add a screenshot …` with a
  // single separating space. A `\s{2,}` separator dropped exactly that row —
  // making the guard structurally blind to a newly-gained command whenever it
  // happens to be the longest name in its group.
  const short = parseShortDescriptions(listingHelp);
  assert(short['add-screenshot'], '`add-screenshot` dropped — the one-space separator regressed');
  assertEqual(
    Object.keys(short).length,
    APP_SUBGROUPS.listing.length,
    'app listing advertised a different number of subcommands than APP_SUBGROUPS.listing declares',
  );
  // Synthetic control: only ONE space, and the name is the widest in the block.
  const fixture = ['Available Commands:', '  widest-command-name One space only', '  short       Padded'].join('\n');
  const parsed = parseShortDescriptions(fixture);
  assertEqual(parsed['widest-command-name'], 'One space only', 'one-space row not parsed');
  assertEqual(parsed['short'], 'Padded', 'padded row not parsed');
});

console.log('CURRENT STATE — the committed snapshot has no unlisted subcommand');

check('`metrics` IS listed in APP_COMMANDS (the bug this guard was written for)', () => {
  assert(APP_COMMANDS.includes('metrics'), 'metrics missing from APP_COMMANDS — the reference would omit it');
});

check('assertNoUnlistedSubcommands passes against the committed snapshot', () => {
  assertNoUnlistedSubcommands(blocks);
});

console.log('NEGATIVE CONTROL — the guard FIRES when the CLI advertises an unlisted command');

check('dropping `metrics` from the list makes it show up as unlisted', () => {
  const without = APP_COMMANDS.filter((c) => c !== 'metrics');
  const missing = unlistedSubcommands(appHelp, without);
  assert(
    missing.includes('metrics'),
    `guard did NOT flag the dropped command — it is broken (got ${JSON.stringify(missing)})`,
  );
  assertEqual(missing.length, 1, 'exactly one command should be unlisted in this fixture');
});

check('the thrown message NAMES the command and the list to edit', () => {
  // The message is the whole value of the guard: it must be actionable, not
  // merely non-zero. A generic "command set drifted" would leave a maintainer
  // re-deriving which command moved.
  let msg = null;
  try {
    assertNoUnlistedSubcommands({ ...blocks, app: appHelp.replace(/^(\s+)view(\s{2,})/m, '$1zzz-unknown$2') });
  } catch (err) {
    msg = err.message;
  }
  assert(msg, 'guard did not throw for an unknown advertised command');
  assert(msg.includes('zzz-unknown'), `message does not name the unlisted command: ${msg}`);
  assert(msg.includes('APP_COMMANDS'), `message does not name the list to edit: ${msg}`);
});

console.log('SUBGROUP ARM — a nested command group is guarded the same way');

check('dropping `reorder` from APP_SUBGROUPS.listing makes it show up as unlisted', () => {
  const without = APP_SUBGROUPS.listing.filter((c) => c !== 'reorder');
  const missing = unlistedSubcommands(listingHelp, without);
  assert(missing.includes('reorder'), `subgroup arm did NOT flag the dropped subcommand (got ${JSON.stringify(missing)})`);
});

console.log('ENUMERATION CROSS-CHECK — `Available Commands:` vs cobra `__complete`');

check('the snapshot carries a `__complete` section for every guarded group', () => {
  // Without these the cross-check degrades to a silent no-op, so its absence
  // must fail here rather than read as a pass.
  assert(blocks['complete app'], 'no `complete app` section — re-capture the snapshot');
  assert(blocks['complete app listing'], 'no `complete app listing` section — re-capture the snapshot');
  const names = parseCompletionNames(blocks['complete app']);
  assert(names.includes('metrics'), '`metrics` missing from the __complete enumeration');
  assert(!names.some((n) => n.includes('\t') || n.startsWith(':')), 'directive trailer leaked into the parsed names');
});

check('the two enumerations agree on the committed snapshot', () => {
  assertEnumerationsAgree(blocks);
  for (const label of ['app', 'app listing']) {
    const d = enumerationDisagreements(blocks[label], blocks[`complete ${label}`]);
    assert(d, `no second enumeration available for ${label}`);
    assertEqual(d.missingFromHelp.length, 0, `${label}: names __complete has that the help parse lost`);
    assertEqual(d.missingFromCompletion.length, 0, `${label}: names the help parse has that __complete lacks`);
  }
});

check('NEGATIVE — a help parse that lost a padded row is DETECTED', () => {
  // The concrete Bug-7 shape: `add-screenshot` is the longest name under
  // `app listing`, so cobra gives it a single trailing space. Delete that row
  // from the help block and the cross-check must name it.
  const mutilated = blocks['app listing'].replace(/^ {2}add-screenshot .*$/m, '');
  const d = enumerationDisagreements(mutilated, blocks['complete app listing']);
  assertEqual(d.missingFromHelp.join(','), 'add-screenshot', 'the lost row was not detected');
  let msg = null;
  try {
    assertEnumerationsAgree({ ...blocks, 'app listing': mutilated });
  } catch (err) {
    msg = err.message;
  }
  assert(msg && msg.includes('add-screenshot'), `assertEnumerationsAgree did not name the lost row: ${msg}`);
});

check('a snapshot with NO `__complete` section degrades instead of false-failing', () => {
  // Backwards compatibility: a pre-existing snapshot has no completion block.
  assertEqual(enumerationDisagreements(appHelp, undefined), null, 'absent completion block should yield null');
  assertEqual(parseCompletionNames(undefined), null, 'absent completion block should parse to null');
  const { ['complete app']: _a, ['complete app listing']: _b, ...noCompletion } = blocks;
  assertEnumerationsAgree(noCompletion); // must not throw
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

console.log('');
if (failures) {
  console.error(`appblocks-cli tests: ${failures} FAILED`);
  process.exit(1);
}
console.log('appblocks-cli tests: all passed');
