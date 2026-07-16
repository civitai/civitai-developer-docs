// Generate public/appblocks/manifest-schema.json — the canonical block-manifest
// JSON Schema (Draft 2020-12), already served as JSON Schema by the platform.
//
// Resolution (copy-spec fallback pattern):
//   1. fetch https://civitai.com/api/blocks/manifest-schema  ($id-canonical, live)
//   2. committed snapshot appblocks-snapshots/manifest-schema.json
//   3. SDK-bundled @civitai/app-sdk/schemas/app-block/v1.json  (hermetic devDep)
//
// No zod-to-json-schema — the source is already JSON Schema.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { log, outDir, snapshotsDir } from './appblocks-util.mjs';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const MANIFEST_URL = 'https://civitai.com/api/blocks/manifest-schema';

function fieldCount(schema) {
  return schema && schema.properties ? Object.keys(schema.properties).length : 0;
}

async function resolveSchema() {
  // 1. live prod URL
  try {
    const res = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const schema = await res.json();
      if (fieldCount(schema) > 0) return { schema, source: MANIFEST_URL };
      log(`WARNING: ${MANIFEST_URL} returned a schema with no properties`);
    } else {
      log(`WARNING: ${MANIFEST_URL} -> HTTP ${res.status}`);
    }
  } catch (err) {
    log(`WARNING: fetch ${MANIFEST_URL} failed: ${err.message}`);
  }
  // 2. committed snapshot
  const snap = join(snapshotsDir, 'manifest-schema.json');
  if (existsSync(snap)) {
    return { schema: JSON.parse(readFileSync(snap, 'utf8')), source: `snapshot: ${snap}` };
  }
  // 3. SDK-bundled schema
  try {
    const p = require.resolve('@civitai/app-sdk/schemas/app-block/v1.json');
    return { schema: JSON.parse(readFileSync(p, 'utf8')), source: `sdk-bundled: ${p}` };
  } catch (err) {
    throw new Error(`gen-appblocks-manifest: no manifest schema available (${err.message})`);
  }
}

const { schema, source } = await resolveSchema();
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, 'manifest-schema.json');
writeFileSync(dest, JSON.stringify(schema, null, 2) + '\n');
log(`manifest: wrote ${fieldCount(schema)} top-level fields -> ${dest}`);
log(`  from ${source}`);
