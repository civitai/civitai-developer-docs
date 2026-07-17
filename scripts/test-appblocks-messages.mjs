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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractBraced,
  findUncoveredMessages,
  loadSdkBlockToParent,
  parseInventory,
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

console.log('');
if (failures) {
  console.error(`appblocks-messages tests: ${failures} FAILED`);
  process.exit(1);
}
console.log('appblocks-messages tests: all passed');
