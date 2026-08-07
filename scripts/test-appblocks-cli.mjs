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
//
// It ALSO covers the `Examples:` extraction and the two CliReference.vue
// rendering helpers — see the section headers further down for why each of
// those assertions exists.
import { readFileSync } from 'node:fs';
import {
  APP_COMMANDS,
  APP_SUBGROUPS,
  SNAPSHOT,
  assertEnumerationsAgree,
  buildArtifact,
  assertNoUnlistedSubcommands,
  enumerationDisagreements,
  parseCompletionNames,
  parseExamples,
  parseLongDescription,
  parseShortDescriptions,
  splitBlocks,
  unlistedSubcommands,
} from './gen-appblocks-cli.mjs';
import {
  cliAnchorId,
  cliHeadingLevel,
  cliHeadingTag,
} from '../.vitepress/theme/components/cliReference.shared.mjs';

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

// ---------------------------------------------------------------------------
// `Examples:` EXTRACTION
//
// WHY THIS EXISTS: cobra emits an `Examples:` block for most `civitai app`
// commands and the generator threw ALL of them away — `section()` only ever
// used `Examples:` as a TERMINATOR for the preceding section and nothing read
// it as a section of its own. Measured on the committed snapshot at the parent
// of this change: `git grep -c Examples scripts/gen-appblocks-cli.mjs` -> 0.
//
// The failure mode this guards is the reassuring zero: a generator wired to
// nothing emits `examples: []` for all 19 commands and looks exactly like a CLI
// whose commands genuinely have none. Hence a FLOOR plus an INDEPENDENT
// recount of the source, not merely "the field exists".
// ---------------------------------------------------------------------------

// The artifact the BUILD writes, rebuilt here from the committed snapshot so
// this gate does not depend on a previously-generated public/appblocks/cli.json
// (CI runs this test BEFORE the generator step).
const artifact = buildArtifact(bundle, 'test');
const commandsWithExamples = artifact.commands.filter((c) => c.examples?.length);
const exampleLineTotal = commandsWithExamples.reduce((n, c) => n + c.examples.length, 0);

// MEASURED on appblocks-snapshots/civitai-cli-help.txt @ civitai v0.1.90-13-g569f5dc:
// 13 of the 19 emitted commands carry an `Examples:` block, 69 lines in total.
// 13 is also every top-level APP_COMMANDS entry — the six `app listing <sub>`
// leaves are the ones with none.
// These are FLOORS, not equalities, so adding an example upstream is not a
// failure. A DROP is: that is the regression this whole section exists for.
// Re-measure and update deliberately when re-capturing the snapshot.
const EXAMPLE_COMMAND_FLOOR = 13;
const EXAMPLE_LINE_FLOOR = 69;

console.log('EXAMPLES — the `Examples:` block is extracted and carried into the artifact');

check(`at least ${EXAMPLE_COMMAND_FLOOR} commands carry examples (a zero-example artifact FAILS)`, () => {
  // The count floor. Without it, `examples: []` everywhere passes silently.
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
  // put and the comparison fires. The `app` GROUP block also has examples but
  // is not emitted as a command entry, so it is excluded here too.
  const rawWithExamples = Object.entries(splitBlocks(bundle))
    .filter(([label]) => label !== 'app' && !label.startsWith('complete '))
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
  // string 13 times". Transcribed by hand from the snapshot bytes (measured
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
  for (const [label, help] of Object.entries(blocks)) {
    if (label.startsWith('complete ')) continue;
    const examples = parseExamples(help);
    if (!examples.length) continue;
    const long = parseLongDescription(help);
    // Whole-LINE equality, not substring: the `app` group's own prose legitimately
    // quotes an invocation mid-sentence (`Browse the published App store with
    // "civitai app list"`), and a substring test calls that a leak. Over-capture
    // brings the transcript across as its own lines, which this sees.
    const longLines = long.split('\n').map((l) => l.trim());
    for (const line of examples) {
      if (!line.trim()) continue;
      assert(
        !longLines.includes(line.trim()),
        `${label}: example line leaked into the long description: ${JSON.stringify(line.trim())}`,
      );
    }
    // And the block as a contiguous run, which is what an actual boundary
    // regression drags in.
    assert(
      !long.includes(examples.join('\n')),
      `${label}: the whole Examples: block leaked into the long description`,
    );
    assert(!long.includes('Examples:'), `${label}: the Examples: heading itself leaked into the long description`);
  }
});

check('an example block never over-runs into Flags / Global Flags / the cobra trailer', () => {
  // The other direction: if the section terminator stops matching, `Examples:`
  // swallows the rest of the help body.
  const isFlagRow = (l) => /^\s+(?:-\w,\s+)?--[a-zA-Z0-9-]+/.test(l);
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
// RENDERER — the two pre-existing CliReference.vue defects
// ---------------------------------------------------------------------------

console.log('RENDERER — anchor slugs (was: literal spaces inside an id)');

check('a nested command slugifies instead of emitting `cli-app listing set-icon`', () => {
  assertEqual(cliAnchorId('app listing set-icon'), 'cli-app-listing-set-icon', 'nested command not slugified');
  assertEqual(cliAnchorId('app create'), 'cli-app-create', 'top-level command not slugified');
});

check('EVERY command in the artifact gets a URL-safe, unique id', () => {
  // The positive control: this loop must actually see commands, or "no id
  // contains a space" is a claim about an empty set.
  const expected = APP_COMMANDS.length + Object.values(APP_SUBGROUPS).reduce((n, s) => n + s.length, 0);
  assertEqual(artifact.commands.length, expected, 'the artifact does not carry every curated command');
  const ids = artifact.commands.map((c) => cliAnchorId(c.command));
  for (const id of ids) {
    assert(!/\s/.test(id), `anchor id contains whitespace: ${JSON.stringify(id)}`);
    assert(/^[a-z0-9-]+$/.test(id), `anchor id is not URL-fragment safe: ${JSON.stringify(id)}`);
  }
  assertEqual(new Set(ids).size, ids.length, 'two commands collapsed onto the same anchor id');
});

console.log('RENDERER — heading depth (was: hardcoded <h3> for every entry)');

check('a subcommand renders DEEPER than the group that owns it', () => {
  // `.vitepress/config.mts` sets `outline: { level: [2, 3] }` and VitePress
  // builds the outline by scanning the rendered DOM, so h3 is the deepest level
  // that appears there. A flat h3 put the six `app listing <sub>` leaves in the
  // outline as siblings of `app listing` itself.
  assertEqual(cliHeadingLevel('app listing'), 3, 'a top-level command group should be h3');
  assertEqual(cliHeadingLevel('app create'), 3, 'a top-level command should be h3');
  assertEqual(cliHeadingLevel('app listing set-icon'), 4, 'a nested subcommand should be h4');
  assertEqual(cliHeadingTag('app listing set-icon'), 'h4', 'heading TAG disagrees with the level');
  assert(
    cliHeadingLevel('app listing set-icon') > cliHeadingLevel('app listing'),
    'a subcommand is not deeper than its group — the hardcoded-h3 defect is back',
  );
});

check('every top-level command is h3 and every subgroup leaf is h4', () => {
  const top = APP_COMMANDS.map((c) => `app ${c}`);
  const leaves = Object.entries(APP_SUBGROUPS).flatMap(([g, subs]) => subs.map((s) => `app ${g} ${s}`));
  assert(top.length && leaves.length, 'nothing to check — the command lists are empty');
  for (const c of top) assertEqual(cliHeadingLevel(c), 3, `${c} should be h3`);
  for (const c of leaves) assertEqual(cliHeadingLevel(c), 4, `${c} should be h4`);
  // Clamped, so a hypothetical deeper tree never emits an <h7>.
  assertEqual(cliHeadingLevel('app a b c d e f g'), 6, 'heading level is not clamped at 6');
});

console.log('');
if (failures) {
  console.error(`appblocks-cli tests: ${failures} FAILED`);
  process.exit(1);
}
console.log('appblocks-cli tests: all passed');
