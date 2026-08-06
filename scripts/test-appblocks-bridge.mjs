#!/usr/bin/env node
// Regression tests for the generation-BRIDGE reference generator + its two
// drift-guards:
//   (1) scripts/gen-appblocks-bridge.mjs  — the COVERAGE guard that fails the
//       build loud if the generation contract silently loses a field.
//   (2) scripts/check-appblocks-pins.mjs  — the VERSION-PIN guard that fails
//       when a generation-bridge devDep pin trails npm latest.
//
//   node scripts/test-appblocks-bridge.mjs
//
// WHY THIS EXISTS: the bridge reference is generated from the pinned
// @civitai/app-sdk + @civitai/blocks-react type JSDoc. A parser regression, a
// ts-morph API change, or an upstream rename could make it emit a plausible-but-
// WRONG artifact (the exact failure mode gen-appblocks-messages guards against),
// and a lagging pin makes the whole reference silently stale. These tests
// exercise the EXACT relations the guards hard-fail on — proving they PASS on the
// real artifact AND FIRE when source and generated diverge / a pin lags — so the
// drift is caught here first, not in a Docker/CI build or (worse) live docs.
import {
  buildBridge,
  bridgeCoverageViolations,
  assertBridgeCoverage,
} from './gen-appblocks-bridge.mjs';
import {
  classifyPin,
  compareSemver,
  parseSemver,
  readPinnedVersion,
  TRACKED_PACKAGES,
} from './check-appblocks-pins.mjs';

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
function assertThrows(fn, msg) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(msg);
}
/** structuredClone shim (Node 18+ has it globally; keep robust). */
const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

// ─────────────────────────────────────────────────────────────────────────────
console.log('gen-appblocks-bridge — builds the real artifact from the pinned SDK');

let artifact;
try {
  artifact = buildBridge();
} catch (err) {
  console.error(`  ERROR could not build the bridge artifact: ${err.message}`);
  console.error('        run `npm ci` first (the pinned SDK devDeps must be installed).');
  process.exit(2);
}

check('coverage passes on the real generated artifact', () => {
  const problems = bridgeCoverageViolations(artifact);
  assert(problems.length === 0, `unexpected coverage violations: ${problems.join('; ')}`);
});

check('the generation contract is actually present (grep-level)', () => {
  const members = artifact.lifecycle.members.map((m) => m.name);
  assert(members.includes('cancel'), 'useBuzzWorkflow().cancel not surfaced (the hooks-reference omission)');
  const t2i = artifact.types.find((t) => t.name === 'WorkflowBodyTextToImage');
  const sourceImage = t2i.fields.find((f) => f.name === 'sourceImage');
  assert(sourceImage, 'sourceImage (img2img) field not surfaced');
  assert(/PAGE apps only|page-bound|model-bound/i.test(sourceImage.description), 'sourceImage lost its PAGE-ONLY constraint');
  assert(t2i.fields.some((f) => f.name === 'sourceImages'), 'sourceImages (multi-image conditioning) not surfaced');
  assert(t2i.fields.some((f) => f.name === 'additionalResources'), 'additionalResources (LoRA) not surfaced');
  const snap = artifact.types.find((t) => t.name === 'BlockWorkflowSnapshot');
  assert(snap.fields.some((f) => f.name === 'imageUrls'), 'BlockWorkflowSnapshot.imageUrls (result) not surfaced');
});

check('every WorkflowBody union member has a field table of its own', () => {
  const union = artifact.types.find((t) => t.name === 'WorkflowBody');
  assert(union && union.kind === 'union', 'WorkflowBody is not surfaced as a union');
  const names = new Set(artifact.types.map((t) => t.name));
  for (const mem of union.members) {
    assert(names.has(mem.trim()), `union member ${mem} is announced but has no field table`);
  }
  // The member that shipped announced-but-undocumented; pin it explicitly so a
  // regression names the real case rather than an abstract one.
  assert(names.has('WorkflowBodyStep'), 'WorkflowBodyStep (kind:"step") has no field table');
});

check("submit()'s options bag (the double-charge defence) is surfaced", () => {
  const opts = artifact.types.find((t) => t.name === 'SubmitWorkflowOptions');
  assert(opts, 'SubmitWorkflowOptions not surfaced — submit(body, options?) names a type the page never defines');
  const key = opts.fields.find((f) => f.name === 'idempotencyKey');
  assert(key, 'SubmitWorkflowOptions.idempotencyKey not surfaced');
  assert(key.description.trim().length > 0, 'idempotencyKey has no JSDoc — the retry semantics are the whole point');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('COVERAGE GUARD — FIRES when source and generated diverge');

check('dropping cancel from the lifecycle is flagged (guard catches drift)', () => {
  const mutated = clone(artifact);
  mutated.lifecycle.members = mutated.lifecycle.members.filter((m) => m.name !== 'cancel');
  const problems = bridgeCoverageViolations(mutated);
  assert(
    problems.some((p) => /cancel/.test(p)),
    'coverage guard did NOT flag a dropped cancel — the guard is broken'
  );
  assertThrows(() => assertBridgeCoverage(mutated), 'assertBridgeCoverage must THROW on the mutated artifact');
});

check('dropping sourceImage is flagged as lost img2img coverage', () => {
  const mutated = clone(artifact);
  const t2i = mutated.types.find((t) => t.name === 'WorkflowBodyTextToImage');
  t2i.fields = t2i.fields.filter((f) => f.name !== 'sourceImage');
  const problems = bridgeCoverageViolations(mutated);
  assert(problems.some((p) => /sourceImage/i.test(p)), 'guard did not flag a dropped sourceImage');
});

check('sourceImage losing its PAGE-ONLY JSDoc is flagged', () => {
  const mutated = clone(artifact);
  const t2i = mutated.types.find((t) => t.name === 'WorkflowBodyTextToImage');
  const si = t2i.fields.find((f) => f.name === 'sourceImage');
  si.description = 'just an img2img seed image'; // strip the page-only sentence
  const problems = bridgeCoverageViolations(mutated);
  assert(
    problems.some((p) => /PAGE-ONLY|sourceImage/i.test(p)),
    'guard did not flag the lost PAGE-ONLY constraint (the one fact documented nowhere else)'
  );
});

check('dropping imageUrls from the result snapshot is flagged', () => {
  const mutated = clone(artifact);
  const snap = mutated.types.find((t) => t.name === 'BlockWorkflowSnapshot');
  snap.fields = snap.fields.filter((f) => f.name !== 'imageUrls');
  const problems = bridgeCoverageViolations(mutated);
  assert(problems.some((p) => /imageUrls/.test(p)), 'guard did not flag a dropped result field');
});

check('dropping sourceImages is flagged as lost multi-image coverage', () => {
  const mutated = clone(artifact);
  const t2i = mutated.types.find((t) => t.name === 'WorkflowBodyTextToImage');
  t2i.fields = t2i.fields.filter((f) => f.name !== 'sourceImages');
  const problems = bridgeCoverageViolations(mutated);
  assert(
    problems.some((p) => /sourceImages \(multi-image conditioning\)/.test(p)),
    `guard did not flag a dropped sourceImages with ITS OWN message; got: ${problems.join('; ')}`
  );
});

check('a union member with no field table is flagged (the WorkflowBodyStep gap)', () => {
  const mutated = clone(artifact);
  mutated.types = mutated.types.filter((t) => t.name !== 'WorkflowBodyStep');
  const problems = bridgeCoverageViolations(mutated);
  assert(
    problems.some((p) => /WorkflowBodyStep" has no field table/.test(p)),
    `guard did not flag an announced-but-undocumented union member; got: ${problems.join('; ')}`
  );
  assertThrows(() => assertBridgeCoverage(mutated), 'assertBridgeCoverage must THROW when a union member has no table');
});

check('dropping SubmitWorkflowOptions.idempotencyKey is flagged (money)', () => {
  const mutated = clone(artifact);
  const opts = mutated.types.find((t) => t.name === 'SubmitWorkflowOptions');
  opts.fields = opts.fields.filter((f) => f.name !== 'idempotencyKey');
  const problems = bridgeCoverageViolations(mutated);
  assert(
    problems.some((p) => /idempotencyKey \(double-charge defence\)/.test(p)),
    `guard did not flag a dropped idempotencyKey; got: ${problems.join('; ')}`
  );
});

check('dropping SubmitWorkflowOptions entirely is flagged', () => {
  const mutated = clone(artifact);
  mutated.types = mutated.types.filter((t) => t.name !== 'SubmitWorkflowOptions');
  const problems = bridgeCoverageViolations(mutated);
  assert(
    problems.some((p) => /SubmitWorkflowOptions \(submit\(\) options bag\) not surfaced/.test(p)),
    `guard did not flag a dropped SubmitWorkflowOptions; got: ${problems.join('; ')}`
  );
});

check('an EMPTY artifact (total parser failure) is flagged, not silently green', () => {
  const problems = bridgeCoverageViolations({ lifecycle: { members: [] }, types: [] });
  assert(problems.length > 0, 'an empty artifact must NOT pass coverage');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('VERSION-PIN GUARD — semver compare + FIRES on a lagging pin');

check('parseSemver / compareSemver order correctly', () => {
  assert(parseSemver('0.28.0'), '0.28.0 should parse');
  assert(compareSemver('0.26.0', '0.28.0') < 0, '0.26.0 < 0.28.0');
  assert(compareSemver('0.28.0', '0.28.0') === 0, '0.28.0 == 0.28.0');
  assert(compareSemver('0.37.0', '0.33.0') > 0, '0.37.0 > 0.33.0');
  assert(compareSemver('1.0.0-rc.1', '1.0.0') < 0, 'prerelease sorts below its release');
});

check('classifyPin FIRES (status=lagging) when the pin trails latest', () => {
  // The exact drift the guard exists to catch: the assessment's 0.33 vs 0.35/0.37.
  assert(classifyPin('0.33.0', '0.37.0').status === 'lagging', 'a trailing blocks-react pin must be lagging');
  assert(classifyPin('0.26.0', '0.28.0').status === 'lagging', 'a trailing app-sdk pin must be lagging');
});

check('classifyPin is OK when current, and tolerates being ahead', () => {
  assert(classifyPin('0.28.0', '0.28.0').status === 'ok', 'equal pins are ok');
  assert(classifyPin('0.29.0', '0.28.0').status === 'ahead', 'a pin ahead of latest is ahead (prerelease/pending)');
});

check('the repo currently pins BOTH tracked packages to an exact version', () => {
  for (const pkg of TRACKED_PACKAGES) {
    const pin = readPinnedVersion(pkg);
    assert(pin.ok, `${pkg} is not an exact devDep pin: ${pin.reason}`);
  }
});

console.log('');
if (failures) {
  console.error(`appblocks-bridge tests: ${failures} FAILED`);
  process.exit(1);
}
console.log('appblocks-bridge tests: all passed');
