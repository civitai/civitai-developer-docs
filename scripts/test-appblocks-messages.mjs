#!/usr/bin/env node
// Regression tests for scripts/gen-appblocks-messages.mjs — specifically the
// INVENTORY parser + the SDK->INVENTORY coverage guard that a build depends on.
//
//   node scripts/test-appblocks-messages.mjs
//
// WHY THIS EXISTS: the generator's COVERAGE guard fires at BUILD time when the
// vendored appblocks-snapshots/hostHandlerParity.ts is stale relative to the
// pinned @civitai/app-sdk (a published block->host message with no INVENTORY
// entry). That is a hard build failure discovered only in Docker/CI. These tests
// exercise the exact same relation against the REAL committed snapshot + the REAL
// pinned SDK, so the drift is caught here FIRST — and cover the two drift modes:
//   (a) STALE SNAPSHOT   — an SDK message missing from the snapshot INVENTORY
//                          (the failure that regressed PUBLISH_GENERATION_OUTPUTS
//                          + GET_IMAGES_BY_IDS).
//   (b) PARSER BREAKAGE  — hostHandlerParity.ts reformatted so parseInventory
//                          silently yields nothing (indentation-agnostic check).
//   (d) PROSE IN `reply`  — upstream declares `reply` documentation-only and appended
//                          a caveat to REQUEST_TOKEN's; read verbatim that drops the
//                          reply payload and re-promotes the reply to a fake push.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractBraced,
  findUncoveredMessages,
  findUnresolvedReplies,
  loadSdkBlockToParent,
  loadSdkParentToBlock,
  parseInventory,
  splitReply,
} from './gen-appblocks-messages.mjs';
import { snapshotsDir } from './appblocks-util.mjs';

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

const snapshotPath = join(snapshotsDir, 'hostHandlerParity.ts');
const snapshotText = readFileSync(snapshotPath, 'utf8');
const inventory = parseInventory(snapshotText);

// The two block->host messages whose absence from the snapshot broke the build.
const REGRESSION_MESSAGES = ['PUBLISH_GENERATION_OUTPUTS', 'GET_IMAGES_BY_IDS'];

console.log('parseInventory — parses the committed hostHandlerParity.ts snapshot');

check('snapshot parses to a non-empty INVENTORY', () => {
  assert(Object.keys(inventory).length > 0, 'parseInventory returned no entries — parser broke');
});

check('the two regressed messages ARE present in the parsed INVENTORY', () => {
  for (const name of REGRESSION_MESSAGES) {
    assert(inventory[name], `${name} missing from parsed INVENTORY (stale snapshot / parser drift)`);
  }
});

check('regressed messages parse with the RIGHT flags (page-only request/reply)', () => {
  for (const name of REGRESSION_MESSAGES) {
    const inv = inventory[name];
    assertEqual(inv.request, true, `${name}.request`);
    assertEqual(inv.pageOnly, true, `${name}.pageOnly`);
    assert(Boolean(inv.reply), `${name}.reply should be set`);
  }
  assertEqual(inventory.PUBLISH_GENERATION_OUTPUTS.reply, 'PUBLISH_RESULT', 'PUBLISH_GENERATION_OUTPUTS.reply');
  assertEqual(inventory.GET_IMAGES_BY_IDS.reply, 'IMAGES_RESULT', 'GET_IMAGES_BY_IDS.reply');
});

check('known-stable entries keep their documented flags', () => {
  assertEqual(inventory.GET_VIEWER?.pageOnly, true, 'GET_VIEWER.pageOnly');
  assertEqual(inventory.GET_VIEWER?.request, true, 'GET_VIEWER.request');
  assert(Boolean(inventory.GET_VIEWER?.reply), 'GET_VIEWER.reply should be set');
  assertEqual(inventory.GET_BUZZ_BALANCE?.pageOnly, false, 'GET_BUZZ_BALANCE.pageOnly');
  assertEqual(inventory.GET_BUZZ_BALANCE?.request, true, 'GET_BUZZ_BALANCE.request');
});

console.log('COVERAGE GUARD — every published SDK block->host message resolves to an INVENTORY entry');

// This is the exact relation the generator hard-fails on. It requires the SDK to
// be installed (npm ci); the CI drift/build jobs always have it.
let sdkBlockToParent;
try {
  sdkBlockToParent = loadSdkBlockToParent();
} catch (err) {
  console.error(`  ERROR could not load the pinned @civitai/app-sdk block->host union: ${err.message}`);
  console.error('        run `npm ci` first (the SDK devDep must be installed).');
  process.exit(2);
}

check('the pinned SDK declares the two regressed block->host messages', () => {
  const names = sdkBlockToParent.map((m) => m.name);
  for (const name of REGRESSION_MESSAGES) {
    assert(names.includes(name), `pinned SDK does not declare ${name} — test fixture is out of date`);
  }
});

check('SDK block->host messages ⊆ parsed INVENTORY (no uncovered messages)', () => {
  const uncovered = findUncoveredMessages(sdkBlockToParent, inventory);
  assertEqual(
    uncovered.length,
    0,
    `snapshot is STALE — ${uncovered.length} SDK block->host message(s) missing from INVENTORY: ${uncovered.join(', ')}`
  );
});

console.log('NEGATIVE — the guard FIRES when a message is dropped from the snapshot');

/** Remove a top-level `NAME: { … },` INVENTORY entry from the snapshot text. */
function removeEntry(ts, name) {
  const keyIdx = ts.search(new RegExp(`\\n[ \\t]*${name}\\s*:\\s*\\{`));
  assert(keyIdx >= 0, `fixture setup: ${name} not found to remove`);
  const openIdx = ts.indexOf('{', keyIdx);
  const body = extractBraced(ts, openIdx);
  assert(body != null, `fixture setup: could not brace-match ${name}`);
  const closeIdx = openIdx + 1 + body.length; // index of the matching `}`
  return ts.slice(0, keyIdx) + ts.slice(closeIdx + 1);
}

check('dropping PUBLISH_GENERATION_OUTPUTS makes it uncovered (build would fail)', () => {
  const mutated = removeEntry(snapshotText, 'PUBLISH_GENERATION_OUTPUTS');
  const inv = parseInventory(mutated);
  assert(!inv.PUBLISH_GENERATION_OUTPUTS, 'entry should be gone from the mutated fixture');
  assert(inv.GET_IMAGES_BY_IDS, 'unrelated entries must still parse after the removal');
  const uncovered = findUncoveredMessages(sdkBlockToParent, inv);
  assert(
    uncovered.includes('PUBLISH_GENERATION_OUTPUTS'),
    'coverage guard did NOT flag the dropped message — the guard is broken'
  );
});

console.log('DRIFT MODE (c) — extractBraced is COMMENT-AWARE (an apostrophe in a comment does not drop the entry)');

check('an INVENTORY entry with an apostrophe inside a // comment still parses', () => {
  // Regression for SET_USER_CHECKPOINT: a lone `'` inside a comment (`doc's`,
  // `entityType:'none'`) must NOT open a phantom string that swallows the `}`.
  const fixture = `export const INVENTORY = {
  WITH_APOSTROPHE_COMMENT: {
    request: true,
    reply: 'SOME_RESULT',
    // PAGE: the page host's NACK — entityType:'none' lacks modelId; don't hang.
    IframeHost: 'required',
    PageBlockHost: 'required',
  },
  NEXT_ENTRY: {
    request: true,
    reply: 'NEXT_RESULT',
    IframeHost: 'required',
    PageBlockHost: 'required',
  },
} as const;`;
  const inv = parseInventory(fixture);
  assert(inv.WITH_APOSTROPHE_COMMENT, 'entry with an apostrophe-in-comment was DROPPED (extractBraced not comment-aware)');
  assertEqual(inv.WITH_APOSTROPHE_COMMENT.reply, 'SOME_RESULT', 'apostrophe-comment entry.reply mis-parsed');
  assert(inv.NEXT_ENTRY, 'the entry AFTER the apostrophe-comment one was lost (brace-match ran away)');
});

check('the real SET_USER_CHECKPOINT entry parses from the committed snapshot', () => {
  // The concrete case the comment-awareness fix restored — it became a published
  // block->host message at @civitai/app-sdk@0.28.0.
  assert(inventory.SET_USER_CHECKPOINT, 'SET_USER_CHECKPOINT missing — extractBraced comment-awareness regressed');
  assertEqual(inventory.SET_USER_CHECKPOINT.reply, 'USER_CHECKPOINT_SET', 'SET_USER_CHECKPOINT.reply');
});

console.log('DRIFT MODE (b) — parseInventory is indentation-agnostic (survives a reformat)');

check('re-indenting the snapshot 2->4 space yields the same INVENTORY keys', () => {
  // A naive fixed-indent parser would silently return fewer/zero entries here.
  const reindented = snapshotText.replace(/^( +)/gm, (m) => m + m);
  const inv2 = parseInventory(reindented);
  const before = Object.keys(inventory).sort();
  const after = Object.keys(inv2).sort();
  assertEqual(after.length, before.length, 'reformatted parse dropped/added entries');
  for (const name of REGRESSION_MESSAGES) {
    assert(inv2[name], `${name} lost after re-indentation — parser is not indentation-agnostic`);
  }
});

console.log('DRIFT MODE (d) — a `reply` value carrying free PROSE still yields the message TYPE');

// WHY: upstream's MessageSpec docblock declares `reply` DOCUMENTATION ONLY ("NOTHING
// ENFORCES THIS STRING"), and then appended a caveat to REQUEST_TOKEN's. This repo reads
// the field as machine-readable, so a verbatim read dropped the reply payload shape,
// printed a sentence inside the `reply <code>` chip, and re-promoted
// TOKEN_REFRESH_RESPONSE to a standalone host->block PUSH — all with a green build.

check('splitReply separates the type from a parenthesised caveat', () => {
  assertEqual(splitReply('TOKEN_REFRESH_RESPONSE').reply, 'TOKEN_REFRESH_RESPONSE', 'bare type .reply');
  assertEqual(splitReply('TOKEN_REFRESH_RESPONSE').replyNote, null, 'bare type .replyNote');

  const withNote = splitReply('TOKEN_REFRESH_RESPONSE (or a TOKEN_REFRESH push when no requestId was sent)');
  assertEqual(withNote.reply, 'TOKEN_REFRESH_RESPONSE', 'prose-suffixed .reply');
  assertEqual(
    withNote.replyNote,
    'or a TOKEN_REFRESH push when no requestId was sent',
    'prose-suffixed .replyNote'
  );

  assertEqual(splitReply('').reply, '', 'empty .reply');
  assertEqual(splitReply('').replyNote, null, 'empty .replyNote');
  // No leading SCREAMING_SNAKE token ⇒ return verbatim rather than guess; the
  // resolution guard is what reports it.
  assertEqual(splitReply('see the browser tests').reply, 'see the browser tests', 'prose-only .reply');
  assertEqual(splitReply('see the browser tests').replyNote, null, 'prose-only .replyNote');
});

check('REQUEST_TOKEN parses to the TYPE plus the conditional-reply caveat', () => {
  // Pins the exact upstream fact this snapshot bump introduced. `reply` must stay a
  // bare type (it is looked up in the SDK union); the caveat must survive as a note
  // rather than being discarded — it is real, newly documented behaviour.
  const inv = inventory.REQUEST_TOKEN;
  assert(inv, 'REQUEST_TOKEN missing from parsed INVENTORY');
  assertEqual(inv.reply, 'TOKEN_REFRESH_RESPONSE', 'REQUEST_TOKEN.reply');
  assert(
    inv.replyNote && inv.replyNote.includes('TOKEN_REFRESH'),
    `REQUEST_TOKEN.replyNote should record the conditional-reply caveat, got ${JSON.stringify(inv.replyNote)}`
  );
  assert(!inv.replyNote.includes('('), 'the wrapping parens should be stripped from replyNote');
});

console.log('RESOLUTION GUARD — every INVENTORY reply names a published SDK host->block message');

let sdkParentToBlock;
try {
  sdkParentToBlock = loadSdkParentToBlock();
} catch (err) {
  console.error(`  ERROR could not load the pinned @civitai/app-sdk host->block union: ${err.message}`);
  process.exit(2);
}

check('every reply in the committed snapshot resolves (no lost payloads / phantom pushes)', () => {
  const unresolved = findUnresolvedReplies(inventory, sdkParentToBlock);
  assertEqual(
    unresolved.length,
    0,
    `unresolvable reply value(s) — the reply loses its payload shape and the named type is ` +
      `mis-emitted as an unsolicited push: ${unresolved.join(', ')}`
  );
});

check('NEGATIVE — a reply that names no SDK message IS reported by the guard', () => {
  // Positive control for the guard itself: without this, a green "0 unresolved" is
  // indistinguishable from a relation wired to nothing.
  const mutated = { ...inventory, FAKE_REQUEST: { request: true, reply: 'NO_SUCH_RESULT', replyNote: null } };
  const unresolved = findUnresolvedReplies(mutated, sdkParentToBlock);
  assert(
    unresolved.some((u) => u.startsWith('FAKE_REQUEST ->')),
    'resolution guard did NOT flag a reply naming a nonexistent message — the guard is broken'
  );
});

console.log('');
if (failures) {
  console.error(`appblocks-messages tests: ${failures} FAILED`);
  process.exit(1);
}
console.log('appblocks-messages tests: all passed');
