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

// REACHABILITY PRECONDITION for the nested-descent guards further down. Those
// guards delete a NESTED arm and require the coverage walk to notice; if the SDK
// ever flattened WorkflowBodyCustomComfy back into an object, or promoted its
// arms to top-level members, they would still pass — but for the wrong reason,
// and a flat walk would once again go unnoticed. This turns that into a loud,
// specific failure instead of a silent downgrade to a vacuous test.
check('WorkflowBodyCustomComfy is a NESTED union — the arms are ONLY reachable by descending', () => {
  const byName = Object.fromEntries(artifact.types.map((t) => [t.name, t]));
  const cc = byName.WorkflowBodyCustomComfy;
  assert(cc, 'WorkflowBodyCustomComfy not surfaced at all');
  assert(
    cc.kind === 'union',
    `WorkflowBodyCustomComfy must be a union as of @civitai/app-sdk 0.33.0, got kind="${cc.kind}" — if the SDK really flattened it, the nested-descent guards below are now vacuous and must be re-pointed`
  );
  const topLevel = byName.WorkflowBody.members.map((m) => m.trim());
  const arms = cc.members.map((m) => m.trim());
  assert(arms.length >= 2, `expected both customComfy arms, got ${JSON.stringify(arms)}`);
  for (const arm of arms) {
    assert(
      !topLevel.includes(arm),
      `${arm} is ALSO a top-level WorkflowBody member — a flat walk would reach it, so the nested-descent guards would no longer prove descent`
    );
    assert(byName[arm], `nested arm ${arm} has no field table of its own`);
  }
  // The fields that vanish from the published page when the walk stays flat.
  const recipeArm = byName.WorkflowBodyCustomComfyRecipe;
  assert(recipeArm, 'WorkflowBodyCustomComfyRecipe (the default arm) not surfaced');
  for (const f of ['recipe', 'params']) {
    assert(
      (recipeArm.fields ?? []).some((x) => x.name === f),
      `WorkflowBodyCustomComfyRecipe.${f} not surfaced — this is the field table that silently disappears from the live page when the walk does not descend`
    );
  }
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

// ── NESTED-UNION DESCENT ─────────────────────────────────────────────────────
// The guard above walks the TOP-LEVEL member list. That was the whole check
// until @civitai/app-sdk 0.33.0 turned WorkflowBodyCustomComfy into a union on
// `mode` WITHOUT changing the top-level member list at all — so a flat walk
// reported a clean surface while the page defined neither arm, and the
// recipe/params field table silently disappeared from the published docs at
// EXIT 0. These three guards pin the RELATIONSHIP (the walk descends past a
// non-union member, and does not re-report a shared arm) rather than the arm
// NAMES. 🔴 They pin descent by ONE level: a depth-capped-at-2 rewrite of the
// BFS passes all of them. The shipped walk is unbounded, so a 3-level nesting is
// handled — but it is NOT pinned here, and would need its own fixture. Asserting
// that the arms appear in
// the type list would be satisfied by a flat walk plus a hardcoded list, and so
// would not catch a reverted walk at all.

check('a missing NESTED union arm is flagged — the walk DESCENDS (real artifact)', () => {
  const mutated = clone(artifact);
  mutated.types = mutated.types.filter((t) => t.name !== 'WorkflowBodyCustomComfyRecipe');
  const problems = bridgeCoverageViolations(mutated);
  assert(
    problems.some((p) => /WorkflowBodyCustomComfyRecipe" has no field table/.test(p)),
    `the walk did NOT descend into the nested WorkflowBodyCustomComfy union — a flat walk publishes a page with no recipe/params table and still exits 0; got: ${problems.join('; ') || '(NO violations at all)'}`
  );
  assertThrows(
    () => assertBridgeCoverage(mutated),
    'assertBridgeCoverage must THROW when a NESTED union arm has no field table'
  );
});

check('descent SKIPS a non-union member instead of ending the walk', () => {
  // Order-independent companion to the test above. The real WorkflowBody happens
  // to list a non-union member (textToImage) BEFORE the nested union, so a walk
  // that ABORTS on the first non-union it dequeues — rather than skipping it —
  // never reaches the nested arms. Pinning that ordering here means a future SDK
  // member reshuffle cannot quietly turn the real-artifact test above into one
  // that passes for the wrong reason.
  const synthetic = {
    lifecycle: { members: [] },
    types: [
      { name: 'WorkflowBody', kind: 'union', members: ['WorkflowBodyTextToImage', 'WorkflowBodyNested'] },
      { name: 'WorkflowBodyTextToImage', kind: 'object', fields: [] }, // dequeued FIRST, and NOT a union
      { name: 'WorkflowBodyNested', kind: 'union', members: ['WorkflowBodyNestedArm'] },
      // WorkflowBodyNestedArm is deliberately absent — reachable ONLY past the
      // non-union member above.
    ],
  };
  const problems = bridgeCoverageViolations(synthetic);
  assert(
    problems.some((p) => /WorkflowBodyNestedArm" has no field table/.test(p)),
    `a non-union member must be SKIPPED, not terminate the walk; got: ${problems.join('; ') || '(NO violations at all)'}`
  );
});

check('a missing arm reachable from TWO unions is reported exactly ONCE', () => {
  // 🔴 This pins the OBSERVABLE (reported exactly once), NOT the mechanism: an
  // implementation carrying no `seen` at all that de-duplicates the message list
  // at end-of-walk passes this too — and that one has no cycle protection. A
  // cyclic WorkflowBody union is not realistically constructible from the SDK
  // types, which is why the weaker pin is accepted here.
  // `seen` must be a VISITED set: marked when a member is taken off a member
  // list, BEFORE the has-a-table test. If it is only marked for members that DO
  // have a table, a missing arm is re-reported once per inbound edge, so the
  // violation list grows with the SHAPE of the type graph rather than with the
  // number of real gaps — and the build error names one gap N times.
  const diamond = {
    lifecycle: { members: [] },
    types: [
      { name: 'WorkflowBody', kind: 'union', members: ['WorkflowBodyTextToImage', 'WorkflowBodyLeft', 'WorkflowBodyRight'] },
      { name: 'WorkflowBodyTextToImage', kind: 'object', fields: [] },
      { name: 'WorkflowBodyLeft', kind: 'union', members: ['WorkflowBodyShared'] },
      { name: 'WorkflowBodyRight', kind: 'union', members: ['WorkflowBodyShared'] },
      // WorkflowBodyShared is absent, and reachable from BOTH arms.
    ],
  };
  const hits = bridgeCoverageViolations(diamond).filter((p) => /WorkflowBodyShared/.test(p));
  assert(
    hits.length === 1,
    `expected the shared missing arm to be reported exactly once, got ${hits.length}: ${hits.join(' | ') || '(NO violations at all — the walk never reached it)'}`
  );
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

check('parseSemver IGNORES build metadata (SemVer 2.0.0 §10)', () => {
  assert(parseSemver('0.31.0+build.7'), 'build metadata must parse, not return null');
  assert(compareSemver('0.31.0+build.7', '0.31.0') === 0, 'build metadata does not affect precedence');
  assert(compareSemver('1.0.0-rc.1+b', '1.0.0') < 0, 'prerelease still sorts below release with metadata');
  assert(parseSemver('1.0.0-rc.1+b').pre === 'rc.1', 'metadata must not leak into the prerelease field');
  assert(parseSemver('not.a.version') === null, 'control: real garbage still returns null');
});

// The USER-VISIBLE defect, not just the unit: `latest` comes from someone
// else's publish, and classifyPin is called OUTSIDE fetchLatest's try/catch, so
// a throw here escapes to main().catch and exits 2 — a permanently-red gate on
// a scheduled job, triggered by a release this repo does not control.
check('classifyPin survives a build-metadata `latest` (the exit-2 path)', () => {
  const cls = classifyPin('0.31.0', '0.31.0+build.7');
  assert(cls && cls.status === 'ok', `expected status ok, got ${JSON.stringify(cls)}`);
  assert(classifyPin('0.30.0', '0.31.0+build.7').status === 'lagging', 'a real lag behind a +build latest still fires');
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
