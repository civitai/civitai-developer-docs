// Generate public/appblocks/manifest-schema.json — the CANONICAL block-manifest
// JSON Schema (Draft 2020-12), the single source of truth for block.manifest.json.
//
// Canonical source of record (see
// claudedocs/manifest-schema-single-source-plan in datapacket-talos):
// `civitai:public/schemas/app-block/v1.json`, $id
// https://civitai.com/schemas/app-block/v1.json. It faithfully transcribes the
// imperative submit-time validator (block-manifest-validator.service.ts) and is
// vendored BYTE-IDENTICALLY by the SDK and the Go CLI (both CI-guarded against
// the static URL). We generate from the SDK-BUNDLED copy of it, which ships in
// the pinned @civitai/app-sdk devDep — hermetic + version-pinned, no network.
//
// We deliberately do NOT fetch https://civitai.com/api/blocks/manifest-schema:
// that endpoint is the LAGGING copy — it understates blockId/version and OMITS
// the enforced `category` + `assetBundleUrl` fields, so generating from it
// under-documents the real author-time constraints. (check-manifest-parity.mjs
// keeps flagging that endpoint's divergence until a sibling civitai PR makes it
// serve this canonical file verbatim.)
//
// Resolution (prefer the pinned hermetic dep, snapshot fallback for CI):
//   1. SDK-bundled @civitai/app-sdk/schemas/app-block/v1.json  (pinned devDep)
//   2. committed snapshot appblocks-snapshots/manifest-schema.json  (kept in
//      lockstep with the canonical)
//
// No zod-to-json-schema — the source is already JSON Schema.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { log, outDir, resolvePackageRoot, snapshotsDir } from './appblocks-util.mjs';

// The SDK declares only an `import` condition and does not expose the schema
// subpath in its exports map, so a bare require.resolve of the JSON file fails.
// Resolve the package ROOT (util handles the exports gate) and join the bundled
// schema path — the same technique the other appblocks generators use.
const SDK_SCHEMA_REL = join('schemas', 'app-block', 'v1.json');

export function fieldCount(schema) {
  return schema && schema.properties ? Object.keys(schema.properties).length : 0;
}

/**
 * Resolve the canonical manifest schema, preferring the pinned hermetic dep.
 *
 * EXPORTED so a guard can ask the same question this generator asks, from the
 * same place. `scripts/check-goods-item-parity.mjs` compares a hand-maintained
 * table against `goods.items` and must read the schema the PAGE is generated
 * from — a second copy of this two-step fallback would be free to disagree with
 * the generator about which schema is authoritative, and the disagreement would
 * surface as a guard verdict about a schema the page was never built from.
 *
 * 🔴 Module side effects are gated behind the entrypoint check at the bottom of
 * this file precisely so this export is importable. `gen-appblocks.mjs` runs
 * each generator with `execFileSync(process.execPath, [script])`, so argv[1] is
 * this file and generation still happens when it is RUN. Do not move the
 * generation back to module top level.
 */
export function resolveSchema() {
  // 1. SDK-bundled canonical schema (pinned devDep — hermetic, versioned).
  try {
    const p = join(resolvePackageRoot('@civitai/app-sdk'), SDK_SCHEMA_REL);
    if (existsSync(p)) {
      const schema = JSON.parse(readFileSync(p, 'utf8'));
      if (fieldCount(schema) > 0) return { schema, source: `sdk-bundled: ${p}` };
      log(`WARNING: ${p} has no properties`);
    }
  } catch (err) {
    log(`WARNING: could not read SDK-bundled schema: ${err.message}`);
  }
  // 2. committed snapshot (kept in lockstep with the canonical).
  const snap = join(snapshotsDir, 'manifest-schema.json');
  if (existsSync(snap)) {
    return { schema: JSON.parse(readFileSync(snap, 'utf8')), source: `snapshot: ${snap}` };
  }
  throw new Error('gen-appblocks-manifest: no canonical manifest schema available (SDK-bundled + snapshot both missing)');
}

function main() {
  const { schema, source } = resolveSchema();
  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, 'manifest-schema.json');
  writeFileSync(dest, JSON.stringify(schema, null, 2) + '\n');
  log(`manifest: wrote ${fieldCount(schema)} top-level fields -> ${dest}`);
  log(`  from ${source}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
