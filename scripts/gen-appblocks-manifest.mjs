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
// We do not fetch https://civitai.com/api/blocks/manifest-schema, because the
// build makes no network request (build-site is a required, hermetic check).
// Whether that endpoint serves the same schema is a separate question, owned by
// check-manifest-parity.mjs on the scheduled drift sweep. That guard reported
// the two substantively EQUAL when this comment was last checked (2026-11-14);
// an earlier version of this comment said the endpoint lagged (understated
// blockId/version, omitted `category` + `assetBundleUrl`), which stopped being
// true by 2026-09-13. Read the guard's output rather than this sentence.
//
// Resolution: the SDK-bundled @civitai/app-sdk/schemas/app-block/v1.json, and
// nothing else. There used to be a second step, a committed snapshot at
// appblocks-snapshots/manifest-schema.json "kept in lockstep with the
// canonical". Nothing kept it in lockstep: no drift guard compared it and the
// pin-bump bot never refreshed it, so it sat two schema revisions behind the
// pin while scripts/test-appblocks-manifest.mjs (a required check) graded the
// snapshot instead of the schema the page renders from. Every workflow and the
// Dockerfile run `npm ci` before generating, so the pinned package is always
// there; when it is not, failing is the correct outcome — a fallback to an
// unguarded copy publishes a stale reference with a green build.
//
// No zod-to-json-schema — the source is already JSON Schema.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { log, outDir, resolvePackageRoot } from './appblocks-util.mjs';

// The SDK declares only an `import` condition and does not expose the schema
// subpath in its exports map, so a bare require.resolve of the JSON file fails.
// Resolve the package ROOT (util handles the exports gate) and join the bundled
// schema path — the same technique the other appblocks generators use.
const SDK_SCHEMA_REL = join('schemas', 'app-block', 'v1.json');

export function fieldCount(schema) {
  return schema && schema.properties ? Object.keys(schema.properties).length : 0;
}

/**
 * Resolve the canonical manifest schema from the pinned @civitai/app-sdk.
 *
 * EXPORTED so every reader asks the same question this generator asks, from the
 * same place: `scripts/check-goods-item-parity.mjs` and
 * `scripts/test-appblocks-manifest.mjs` both grade the schema the PAGE is
 * generated from, and a private copy of the resolution would be free to
 * disagree with the generator about which schema is authoritative (the second
 * of those once did, reading a stale snapshot).
 *
 * Throws when the pinned package does not ship a schema with properties.
 *
 * 🔴 Module side effects are gated behind the entrypoint check at the bottom of
 * this file precisely so this export is importable. `gen-appblocks.mjs` runs
 * each generator with `execFileSync(process.execPath, [script])`, so argv[1] is
 * this file and generation still happens when it is RUN. Do not move the
 * generation back to module top level.
 */
export function resolveSchema() {
  let p;
  try {
    p = join(resolvePackageRoot('@civitai/app-sdk'), SDK_SCHEMA_REL);
  } catch (err) {
    throw new Error(`gen-appblocks-manifest: @civitai/app-sdk is not installed (run \`npm ci\`): ${err.message}`);
  }
  if (!existsSync(p)) {
    throw new Error(`gen-appblocks-manifest: the pinned @civitai/app-sdk ships no ${SDK_SCHEMA_REL} (looked at ${p})`);
  }
  const schema = JSON.parse(readFileSync(p, 'utf8'));
  if (fieldCount(schema) === 0) throw new Error(`gen-appblocks-manifest: ${p} has no top-level properties`);
  return { schema, source: `sdk-bundled: ${p}` };
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
