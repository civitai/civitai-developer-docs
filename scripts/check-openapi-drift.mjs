#!/usr/bin/env node
/**
 * check-openapi-drift.mjs
 * -----------------------
 * The OpenAPI SNAPSHOT drift-guard (external CI check).
 *
 * `openapi-snapshots/v2-consumers.json` is a committed copy of the spec the
 * orchestrator publishes. The whole `/orchestration/reference/` section is
 * generated from it, so if the orchestrator ships new operations and nobody
 * re-snapshots here, the docs silently stale with a green build. This is the
 * guard that says when.
 *
 * DESIGN — scheduled, not PR-blocking. Identical reasoning to
 * check-appblocks-snapshots.mjs: spec drift is UPSTREAM orchestrator movement,
 * unrelated to any given docs PR, and gating unrelated PRs on someone else's
 * deploy would be wrong. Runs from appblocks-drift.yml (schedule +
 * workflow_dispatch), where a red run is the signal to re-snapshot.
 *
 * RESULTS
 *   - 200 that DIFFERS from the snapshot            -> FAIL (exit 1) + the
 *     re-snapshot command and a summary of which paths moved.
 *   - 404 / 410                                     -> FAIL (exit 1). The spec
 *     URL is published and stable; a 404 means it MOVED, and a moved URL means
 *     the snapshot can never be refreshed again until someone updates it.
 *   - unreachable / DNS / timeout / 5xx / 429 / 403 -> SKIP (exit 0). A
 *     connectivity failure must never false-fail a freshness check.
 *   - 200 byte-identical                            -> PASS.
 *
 * USAGE
 *   npm run check:spec-drift
 */

import { existsSync, readFileSync } from 'node:fs';

import { SNAPSHOT_PATH, SPEC_URL, fetchSpec, repoRoot, specHost } from './spec-util.mjs';

const rel = (p) => (p.startsWith(repoRoot) ? p.slice(repoRoot.length + 1) : p);

/** Operation-level summary of what moved, so a red run is actionable at a glance. */
function summarise(oldText, newText) {
  let a;
  let b;
  try {
    a = JSON.parse(oldText);
    b = JSON.parse(newText);
  } catch {
    return ['      (one side is not parseable JSON — compare the files directly)'];
  }

  const lines = [];
  const av = a?.info?.version;
  const bv = b?.info?.version;
  if (av !== bv) lines.push(`      info.version: ${av} -> ${bv}`);

  const ap = Object.keys(a?.paths || {});
  const bp = Object.keys(b?.paths || {});
  const added = bp.filter((p) => !ap.includes(p));
  const removed = ap.filter((p) => !bp.includes(p));
  const kept = bp.filter((p) => ap.includes(p));
  const changed = kept.filter((p) => JSON.stringify(a.paths[p]) !== JSON.stringify(b.paths[p]));

  if (added.length) lines.push(`      + ${added.length} new path(s): ${added.slice(0, 8).join(', ')}`);
  if (removed.length) lines.push(`      - ${removed.length} removed path(s): ${removed.slice(0, 8).join(', ')}`);
  if (changed.length) lines.push(`      ~ ${changed.length} changed path(s): ${changed.slice(0, 8).join(', ')}`);
  if (!lines.length) lines.push('      (no path-level change — the difference is elsewhere in the document)');
  return lines;
}

async function main() {
  console.log(`OpenAPI snapshot drift-guard — diffing ${rel(SNAPSHOT_PATH)} vs ${SPEC_URL}\n`);

  if (!existsSync(SNAPSHOT_PATH)) {
    console.log(`  ✗ committed snapshot MISSING at ${rel(SNAPSHOT_PATH)}`);
    console.log('      the build resolves the spec from this file — restore it, or re-snapshot with:');
    console.log('        npm run copy:spec -- --refresh');
    process.exit(1);
  }

  const local = readFileSync(SNAPSHOT_PATH, 'utf8');
  const remote = await fetchSpec({ log: (m) => console.log(`  … ${m.replace(/^\[docs\] /, '')}`) });

  if (!remote.ok) {
    if (remote.status === 404 || remote.status === 410) {
      console.log(`  ✗ ${SPEC_URL} returned ${remote.reason}: the published spec URL moved or was removed`);
      console.log('      the snapshot can no longer be refreshed from this URL — update SPEC_URL in');
      console.log('      scripts/spec-util.mjs to wherever the orchestrator publishes it now.');
      process.exit(1);
    }
    console.log(`  ⊘ SKIP — could not reach ${specHost()}: ${remote.reason} (${remote.attempts} attempt(s))`);
    console.log('      a connectivity failure is not drift; nothing to conclude.');
    process.exit(0);
  }

  if (remote.text === local) {
    console.log(`  ✓ ${rel(SNAPSHOT_PATH)} matches the published spec`);
    process.exit(0);
  }

  console.log(`  ✗ ${rel(SNAPSHOT_PATH)} has DRIFTED from ${SPEC_URL}`);
  console.log(`      snapshot ${local.length} bytes, published ${remote.text.length} bytes`);
  for (const line of summarise(local, remote.text)) console.log(line);
  console.log('');
  console.log('      re-snapshot and open a PR:');
  console.log('        npm run copy:spec -- --refresh');
  console.log(`        git add ${rel(SNAPSHOT_PATH)}`);
  process.exit(1);
}

await main();
