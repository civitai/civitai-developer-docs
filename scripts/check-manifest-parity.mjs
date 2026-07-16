#!/usr/bin/env node
/**
 * check-manifest-parity.mjs
 * -------------------------
 * The App Blocks MANIFEST SCHEMA parity-guard (proposal §5.3 / risk #6).
 *
 * There are TWO copies of the block-manifest JSON Schema:
 *   A. the prod endpoint  https://civitai.com/api/blocks/manifest-schema
 *      ($id-canonical; what the Phase-2 generator fetches into
 *      public/appblocks/manifest-schema.json → renders reference/manifest.md)
 *   B. the SDK-bundled    @civitai/app-sdk/schemas/app-block/v1.json
 *      (what `defineBlock({ manifest })` validates against at author time)
 *
 * If these diverge, a builder can pass one and be rejected by the other, and the
 * generated manifest reference silently documents the wrong field set. This
 * guard deep-compares the two and FAILS on any divergence, naming the delta.
 *
 * DESIGN — scheduled, not PR-blocking (same rationale as the snapshot guard):
 * a mismatch is UPSTREAM movement between two civitai-owned artifacts, unrelated
 * to any docs PR, so it must not block unrelated docs PRs. It runs on a schedule
 * (`.github/workflows/appblocks-drift.yml`) where a red run is the visible
 * signal to reconcile the two copies.
 *
 * RESULTS
 *   - both fetched, deep-equal        -> PASS (exit 0)
 *   - both fetched, differ            -> FAIL (exit 1), printing the field/key delta
 *   - prod unreachable                -> SKIP (exit 0, note) — never false-fail
 *   - SDK doesn't ship the schema     -> SKIP (exit 0, note)
 *
 * USAGE
 *   npm run check:manifest-parity
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MANIFEST_URL =
  process.env.APPBLOCKS_MANIFEST_URL || 'https://civitai.com/api/blocks/manifest-schema';
const SDK_SCHEMA_MODULE = '@civitai/app-sdk/schemas/app-block/v1.json';

/** Canonical JSON with recursively sorted object keys — order-independent equality. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Structural diff summary between two schemas (for an actionable message). */
function summarize(prod, sdk) {
  const out = [];
  const pk = Object.keys(prod.properties || {});
  const sk = Object.keys(sdk.properties || {});
  const prodOnly = pk.filter((k) => !sk.includes(k));
  const sdkOnly = sk.filter((k) => !pk.includes(k));
  if (prodOnly.length) out.push(`  manifest fields only in PROD endpoint: ${prodOnly.join(', ')}`);
  if (sdkOnly.length) out.push(`  manifest fields only in SDK-bundled : ${sdkOnly.join(', ')}`);

  const ptk = Object.keys(prod).sort();
  const stk = Object.keys(sdk).sort();
  const ptkOnly = ptk.filter((k) => !stk.includes(k));
  const stkOnly = stk.filter((k) => !ptk.includes(k));
  if (ptkOnly.length) out.push(`  top-level keys only in PROD : ${ptkOnly.join(', ')}`);
  if (stkOnly.length) out.push(`  top-level keys only in SDK  : ${stkOnly.join(', ')}`);

  const preq = JSON.stringify(prod.required || []);
  const sreq = JSON.stringify(sdk.required || []);
  if (preq !== sreq) {
    out.push(`  required[] differ:`);
    out.push(`    prod: ${preq}`);
    out.push(`    sdk : ${sreq}`);
  }

  // Per common-field shape drift (beyond presence).
  const shapeDrift = [];
  for (const k of pk.filter((k) => sk.includes(k))) {
    if (canonical(prod.properties[k]) !== canonical(sdk.properties[k])) shapeDrift.push(k);
  }
  if (shapeDrift.length) out.push(`  common fields whose shape/constraints differ: ${shapeDrift.join(', ')}`);

  if (prod.$id !== sdk.$id) out.push(`  $id differs — prod: ${prod.$id}  sdk: ${sdk.$id}`);
  return out;
}

async function fetchProd() {
  try {
    const res = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    return { ok: true, schema: await res.json() };
  } catch (err) {
    return { ok: false, reason: err.message, network: true };
  }
}

function loadSdkSchema() {
  try {
    const p = require.resolve(SDK_SCHEMA_MODULE);
    if (!existsSync(p)) return { ok: false, reason: `resolved but missing: ${p}` };
    return { ok: true, schema: JSON.parse(readFileSync(p, 'utf8')), path: p };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function main() {
  console.log('App Blocks manifest schema parity — prod endpoint vs SDK-bundled v1.json\n');

  const sdk = loadSdkSchema();
  if (!sdk.ok) {
    console.log(`  ⊘ SDK does not ship ${SDK_SCHEMA_MODULE} (${sdk.reason}) — nothing to compare against. Skipping.`);
    return; // exit 0
  }
  console.log(`  SDK-bundled: ${sdk.path}`);

  const prod = await fetchProd();
  if (!prod.ok) {
    console.log(`  ⊘ ${MANIFEST_URL} — ${prod.reason} — could not reach source. Skipping (no false-fail).`);
    return; // exit 0
  }
  console.log(`  prod URL   : ${MANIFEST_URL}\n`);

  if (canonical(prod.schema) === canonical(sdk.schema)) {
    console.log('  ✓ prod endpoint schema and SDK-bundled v1.json are byte-equivalent (deep-equal).');
    console.log('\nManifest parity: OK');
    return;
  }

  console.log('  ✗ prod endpoint schema and SDK-bundled v1.json DIVERGE:');
  for (const line of summarize(prod.schema, sdk.schema)) console.log(line);

  console.error('\n--- MANIFEST SCHEMA DIVERGENCE ---');
  console.error('The manifest reference is generated from the PROD endpoint, but the SDK validates');
  console.error('authors against the bundled copy. Reconcile the two (the proposal recommends the');
  console.error(`$id-stamped prod endpoint as canonical): re-publish the prod schema, or bump/repin`);
  console.error('@civitai/app-sdk so its schemas/app-block/v1.json matches, then re-run gen:appblocks.');
  process.exit(1);
}

main().catch((err) => {
  console.error(`check-manifest-parity: unexpected error: ${err.stack || err.message}`);
  process.exit(2);
});
