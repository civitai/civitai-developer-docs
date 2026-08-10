#!/usr/bin/env node
/**
 * copy-spec.mjs
 * -------------
 * Resolves the Orchestration OpenAPI spec into `public/openapi/v2-consumers.json`,
 * which `.vitepress/config.mts` and the theme import STATICALLY. No spec, no
 * build — esbuild cannot resolve the import, so this script runs as `predev` and
 * `prebuild` and its failure is the build's failure.
 *
 * 🔴 THE DEFAULT PATH MAKES NO NETWORK REQUEST, AND THAT IS THE WHOLE POINT.
 * It used to `fetch` the spec from orchestration.civitai.com on every build with
 * no timeout, no retry and no fallback, so a third party's bad day failed
 * `npm run build` for reasons unrelated to the change being built. Measured on
 * the tree at 30f52a0:
 *
 *   - host does not resolve  -> uncaught `TypeError: fetch failed`, exit 1 in
 *     ~60 ms, before `vitepress build` or `gen:appblocks` ever ran;
 *   - host degraded (TLS handshake completes, no HTTP response) -> no timeout
 *     fires, so the build sits on undici's 5-minute `headersTimeout`;
 *   - non-2xx -> `Error: Failed to fetch …: 503`, exit 1;
 *   - and an existing on-disk copy of the very same spec was never consulted in
 *     any of the three.
 *
 * That is fine for a script a human runs; it is not fine for a REQUIRED status
 * check, which is what `build-site` is meant to become.
 *
 * RESOLUTION ORDER (first hit wins):
 *   1. `--refresh` / COPY_SPEC_REFRESH=1 — fetch the live spec (bounded: 20 s
 *      per attempt, 3 attempts) and re-write the committed snapshot. OPT-IN
 *      ONLY. On failure it warns and falls through, so an opt-in refresh can
 *      never turn a working build into a broken one.
 *   2. The sibling `civitai-orchestration` checkout, when the dev stack is laid
 *      out beside this repo. Unchanged behaviour — a local orchestrator dev
 *      still sees their own spec.
 *   3. The COMMITTED snapshot at `openapi-snapshots/v2-consumers.json`. This is
 *      what CI, Docker and a fresh clone use, and it needs nothing but the
 *      checkout.
 *
 * Only when all three come up empty does this fail — and then it fails in
 * milliseconds with a message that names each place it looked.
 *
 * STALENESS is handled where this repo already handles upstream freshness: a
 * SCHEDULED drift check (`npm run check:spec-drift`, wired into
 * appblocks-drift.yml), never a PR gate. Same doctrine as `check:snapshots` and
 * `check:pins` — see that workflow's header.
 *
 * USAGE
 *   npm run copy:spec              # hermetic; snapshot (or sibling) only
 *   npm run copy:spec -- --refresh # re-snapshot from orchestration.civitai.com
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { DEST_PATH, SIBLING_PATH, SNAPSHOT_PATH, SPEC_URL, fetchSpec, repoRoot, specHost } from './spec-util.mjs';

const rel = (p) => (p.startsWith(repoRoot) ? p.slice(repoRoot.length + 1) : p);

const refresh = process.argv.includes('--refresh') || process.env.COPY_SPEC_REFRESH === '1';

mkdirSync(dirname(DEST_PATH), { recursive: true });

/** Writes `text` to the build destination and reports it. */
function land(text, from) {
  writeFileSync(DEST_PATH, text);
  console.log(`[docs] ${rel(DEST_PATH)} <- ${from} (${text.length} bytes)`);
}

if (refresh) {
  console.log(`[docs] --refresh: fetching ${SPEC_URL}`);
  const res = await fetchSpec({ log: (m) => console.log(m) });

  if (res.ok) {
    // Refresh updates the COMMITTED snapshot too — that is what "re-snapshot"
    // means here, and it is the diff a human reviews in the refresh PR.
    mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
    const changed = !existsSync(SNAPSHOT_PATH) || readFileSync(SNAPSHOT_PATH, 'utf8') !== res.text;
    writeFileSync(SNAPSHOT_PATH, res.text);
    console.log(
      changed
        ? `[docs] snapshot UPDATED: ${rel(SNAPSHOT_PATH)} — commit this`
        : `[docs] snapshot already current: ${rel(SNAPSHOT_PATH)}`,
    );
    land(res.text, SPEC_URL);
    process.exit(0);
  }

  // Deliberately NOT fatal. The refresh is an extra, and the snapshot below is
  // the source of record.
  console.warn(`[docs] WARNING: could not refresh from ${specHost()} — ${res.reason} (${res.attempts} attempt(s))`);
  console.warn('[docs] this is an upstream availability problem, unrelated to your change');
  console.warn('[docs] falling back to the committed snapshot; re-run --refresh later to re-snapshot');
}

if (existsSync(SIBLING_PATH)) {
  copyFileSync(SIBLING_PATH, DEST_PATH);
  console.log(`[docs] ${rel(DEST_PATH)} <- sibling orchestration checkout ${SIBLING_PATH}`);
  process.exit(0);
}

if (existsSync(SNAPSHOT_PATH)) {
  copyFileSync(SNAPSHOT_PATH, DEST_PATH);
  console.log(`[docs] ${rel(DEST_PATH)} <- committed snapshot ${rel(SNAPSHOT_PATH)}`);
  process.exit(0);
}

// Fast and legible: this is a broken checkout, not a broken internet, and the
// message has to say which so nobody goes looking at the network.
console.error('[docs] FATAL: no OpenAPI spec available. Looked, in order:');
console.error(`[docs]   1. sibling orchestration checkout — ${SIBLING_PATH}`);
console.error(`[docs]      not present (normal outside the dev stack)`);
console.error(`[docs]   2. committed snapshot — ${rel(SNAPSHOT_PATH)}`);
console.error(`[docs]      MISSING. This file is committed to the repo, so a checkout should have it.`);
console.error('[docs]');
console.error('[docs] Nothing was fetched: the build is deliberately hermetic, so this is NOT a');
console.error(`[docs] ${specHost()} outage and NOT related to whatever change you are building.`);
console.error('[docs]');
console.error('[docs] Fix: restore the snapshot from git —');
console.error(`[docs]   git checkout -- ${rel(SNAPSHOT_PATH)}`);
console.error('[docs] or, if it genuinely needs re-creating, re-snapshot from the live spec —');
console.error('[docs]   npm run copy:spec -- --refresh');
process.exit(1);
