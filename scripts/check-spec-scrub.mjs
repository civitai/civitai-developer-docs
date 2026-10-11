#!/usr/bin/env node
/**
 * check-spec-scrub.mjs
 * --------------------
 * Strict check of the docs-side spec scrub (scripts/lib/spec-scrub.mjs) against
 * the COMMITTED snapshot, openapi-snapshots/v2-consumers.json.
 *
 * copy-spec.mjs only WARNS when a scrub rule matches nothing, so a fresh build
 * never breaks because upstream fixed an item. This is where that becomes a
 * failure: the snapshot is committed, so the check is repo-local and runs on
 * every PR — and the re-snapshot PR that picks up an upstream fix is exactly the
 * PR that goes red here, naming the rule to delete.
 *
 * FAILS (exit 1) when:
 *   - any rule matched nothing (stale: delete it, or update it if upstream
 *     reworded rather than fixed);
 *   - the scrubbed spec has a `#/components/schemas/…` reference (or a
 *     discriminator mapping) that no longer resolves;
 *   - a dropped operationId or step-type schema is still referenced anywhere.
 *
 * USAGE
 *   npm run check:spec-scrub
 */

import { readFileSync } from 'node:fs';

import { SCRUB_RULES, danglingRefs, scrubSpec } from './lib/spec-scrub.mjs';
import { SNAPSHOT_PATH } from './spec-util.mjs';

const spec = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
const { spec: out, counts, unmatched, removed } = scrubSpec(spec);

const problems = [];

for (const id of unmatched) {
  problems.push(`rule ${id} matched nothing in the committed snapshot — upstream fixed or moved it; delete or update the rule`);
}

for (const name of danglingRefs(out)) problems.push(`dangling schema reference after scrub: ${name}`);

const text = JSON.stringify(out);
for (const id of removed.operations) {
  if (text.includes(`"${id}"`)) problems.push(`dropped operation ${id} is still referenced in the scrubbed spec`);
}
for (const name of removed.schemas) {
  if (text.includes(`#/components/schemas/${name}"`)) problems.push(`dropped schema ${name} is still referenced`);
}

const countOps = (s) =>
  Object.values(s.paths || {}).reduce((n, item) => n + Object.values(item).filter((op) => op?.operationId).length, 0);

console.log(`spec scrub — committed snapshot`);
for (const rule of [...SCRUB_RULES.dropOperations, ...SCRUB_RULES.dropStepTypes, ...SCRUB_RULES.text]) {
  console.log(`  ${counts[rule.id] > 0 ? '✓' : '✗'} ${rule.id} (${rule.reason}): ${counts[rule.id]} match(es)`);
}
console.log(
  `  operations ${countOps(spec)} -> ${countOps(out)}; schemas ${Object.keys(spec.components.schemas).length} -> ${Object.keys(out.components.schemas).length}`,
);
console.log(`  removed: ${JSON.stringify(removed)}`);

if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\n✓ every scrub rule matched and the scrubbed spec has no dangling references');
