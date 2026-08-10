#!/usr/bin/env node
/**
 * check-manifest-parity.mjs
 * -------------------------
 * The App Blocks MANIFEST SCHEMA parity-guard (proposal §5.3 / risk #6).
 *
 * There are TWO distinct copies of the block-manifest JSON Schema:
 *   A. the CANONICAL, SDK-bundled  @civitai/app-sdk/schemas/app-block/v1.json
 *      ($id https://civitai.com/schemas/app-block/v1.json). This faithfully
 *      transcribes the imperative submit-time validator, is what the SDK and the
 *      Go CLI vendor + validate authors against, and — since this PR — is what
 *      the Phase-2 generator reads into public/appblocks/manifest-schema.json →
 *      renders reference/manifest.md. THIS is the source of record.
 *   B. the prod ENDPOINT  https://civitai.com/api/blocks/manifest-schema
 *      (its hand-built MANIFEST_JSON_SCHEMA object). This is the LAGGING copy:
 *      it understates blockId/version and OMITS the enforced `category` +
 *      `assetBundleUrl` fields, so it under-documents the real constraints.
 *
 * The docs no longer generate from the endpoint (that was the bug this guard
 * used to paper over). This guard now exists to flag the endpoint's divergence
 * as an ACTIONABLE signal: while B differs from A, the public CLI-fetchable
 * endpoint is still behind the canonical, and the sibling civitai PR that makes
 * the endpoint serve the canonical file verbatim has not shipped. It
 * deep-compares the two and FAILS on any SUBSTANTIVE divergence, naming the
 * delta. Once the endpoint serves the canonical, this guard goes GREEN
 * automatically — no docs change required.
 *
 * The top-level `$id` and `$schema` are EXCLUDED from the equality decision by
 * design: the endpoint may keep serving under its own `$id` (the `/api/...` URL)
 * even after it is reconciled to serve the canonical body, so counting `$id`
 * would keep the guard permanently red even after every real field is
 * reconciled — and a forever-red check gets ignored. Everything
 * substantive (`properties`, `required`, and per-field constraints —
 * pattern/min/max/enum/type) is still compared. (A manifest FIELD literally
 * named `$schema` inside `properties` is NOT a top-level key and stays diffed.)
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

/**
 * Drop the TOP-LEVEL `$id` and `$schema` (meta identity keys designed to differ)
 * so the equality decision rests only on substantive schema content. Only the
 * top-level keys are removed — a manifest field named `$schema` inside
 * `properties` is preserved and still compared.
 */
function stripMeta(schema) {
  const { $id, $schema, ...rest } = schema;
  return rest;
}

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
  if (prodOnly.length) out.push(`  manifest fields only in the ENDPOINT   : ${prodOnly.join(', ')}`);
  if (sdkOnly.length) out.push(`  manifest fields only in CANONICAL (SDK) : ${sdkOnly.join(', ')}`);

  const ptk = Object.keys(prod).sort();
  const stk = Object.keys(sdk).sort();
  const ptkOnly = ptk.filter((k) => !stk.includes(k));
  const stkOnly = stk.filter((k) => !ptk.includes(k));
  if (ptkOnly.length) out.push(`  top-level keys only in ENDPOINT  : ${ptkOnly.join(', ')}`);
  if (stkOnly.length) out.push(`  top-level keys only in CANONICAL : ${stkOnly.join(', ')}`);

  const preq = JSON.stringify(prod.required || []);
  const sreq = JSON.stringify(sdk.required || []);
  if (preq !== sreq) {
    out.push(`  required[] differ:`);
    out.push(`    endpoint : ${preq}`);
    out.push(`    canonical: ${sreq}`);
  }

  // Per common-field shape drift (beyond presence).
  const shapeDrift = [];
  for (const k of pk.filter((k) => sk.includes(k))) {
    if (canonical(prod.properties[k]) !== canonical(sdk.properties[k])) shapeDrift.push(k);
  }
  if (shapeDrift.length) out.push(`  common fields whose shape/constraints differ: ${shapeDrift.join(', ')}`);

  // $id / $schema are intentionally NOT reported here — they are excluded from
  // the equality decision by design (see stripMeta + the file header).
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
  console.log('App Blocks manifest schema parity — canonical (SDK-bundled v1.json) vs prod endpoint\n');

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

  // Compare substantive content only ($id/$schema excluded by design).
  const prodCore = stripMeta(prod.schema);
  const sdkCore = stripMeta(sdk.schema);
  const idNote =
    prod.schema.$id !== sdk.schema.$id
      ? `  · $id differs (excluded from equality): endpoint ${prod.schema.$id}  canonical ${sdk.schema.$id}`
      : null;

  if (canonical(prodCore) === canonical(sdkCore)) {
    console.log('  ✓ substantive schema is equal — properties / required / per-field constraints match.');
    console.log('    ($id and $schema are excluded from the comparison by design.)');
    if (idNote) console.log(idNote);
    console.log('\nManifest parity: OK');
    return;
  }

  console.log('  ✗ prod endpoint LAGS the canonical (SDK-bundled) schema (excluding $id/$schema):');
  for (const line of summarize(prodCore, sdkCore)) console.log(line);
  if (idNote) console.log(idNote);

  console.error('\n--- MANIFEST ENDPOINT BEHIND CANONICAL ---');
  console.error('The docs + SDK + Go CLI all use the CANONICAL schema (public/schemas/app-block/v1.json,');
  console.error('bundled in @civitai/app-sdk). The prod endpoint /api/blocks/manifest-schema still serves an');
  console.error('older/looser copy, so any consumer that fetches the endpoint gets an under-specified contract.');
  console.error('ACTION: merge the sibling civitai PR that makes the endpoint serve the canonical file verbatim.');
  console.error('This guard goes GREEN automatically once the endpoint returns the canonical body — no docs change.');
  process.exit(1);
}

main().catch((err) => {
  console.error(`check-manifest-parity: unexpected error: ${err.stack || err.message}`);
  process.exit(2);
});
