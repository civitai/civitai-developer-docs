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
 * SCRUB: whichever source wins, the spec is passed through
 * `scripts/lib/spec-scrub.mjs` before it is written to public/openapi/ — a
 * docs-side stopgap for items the upstream source should not publish. The
 * snapshot itself is never scrubbed (a refresh re-writes it verbatim). See that
 * file for the rules table and how a stale rule surfaces.
 *
 * STALENESS is handled where this repo already handles upstream freshness: a
 * SCHEDULED drift check (`npm run check:spec-drift`, wired into
 * appblocks-drift.yml), never a PR gate. Same doctrine as `check:snapshots` and
 * `check:pins` — see that workflow's header.
 *
 * USAGE
 *   npm run copy:spec              # hermetic; snapshot (or sibling) only
 *   npm run copy:spec -- --refresh # re-snapshot from orchestration.civitai.com
 *   npm run copy:spec -- --strict  # exit 2 if a scrub rule matched nothing
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { scrubSpec } from './lib/spec-scrub.mjs';
import { DEST_PATH, SIBLING_PATH, SNAPSHOT_PATH, SPEC_URL, fetchSpec, repoRoot, specHost } from './spec-util.mjs';

const rel = (p) => (p.startsWith(repoRoot) ? p.slice(repoRoot.length + 1) : p);

const refresh = process.argv.includes('--refresh') || process.env.COPY_SPEC_REFRESH === '1';

mkdirSync(dirname(DEST_PATH), { recursive: true });

const strict = process.argv.includes('--strict') || process.env.COPY_SPEC_SCRUB_STRICT === '1';

/**
 * Scrubs `text` (scripts/lib/spec-scrub.mjs) and writes it to the build
 * destination. EVERY resolution path goes through here, so the published spec is
 * scrubbed whichever source won — the snapshot itself stays a verbatim upstream
 * copy.
 *
 * A rule that matched nothing WARNS and the build continues: it most likely
 * means upstream fixed that item, and a fresh build must not break for that.
 * `--strict` / COPY_SPEC_SCRUB_STRICT=1 makes it fatal; CI's
 * `npm run check:spec-scrub` applies the same strictness to the committed
 * snapshot, which is where a stale rule is meant to be noticed and deleted.
 * A spec that is not valid JSON is landed as-is, unscrubbed, with a warning —
 * the build then fails on the import exactly as it did before this pass.
 */
function land(text, from) {
  let out = text;
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.warn(`[docs] WARNING: spec from ${from} is not valid JSON (${err.message}); landing it unscrubbed`);
  }

  if (parsed) {
    const { spec, counts, unmatched, removed } = scrubSpec(parsed);
    const changed = Object.values(counts).some((n) => n > 0);
    if (changed) {
      const indent = /^\{\s*\n(\s+)"/.exec(text)?.[1] ?? '';
      out = JSON.stringify(spec, null, indent || undefined) + (text.endsWith('\n') ? '\n' : '');
    }
    const n = (k) => removed[k].length;
    console.log(
      `[docs] scrub: removed ${n('operations')} operation(s), ${n('schemas')} schema(s), ${n('tags')} tag(s); ` +
        `${Object.keys(counts).length - unmatched.length}/${Object.keys(counts).length} rule(s) matched`,
    );
    for (const id of unmatched) {
      console.warn(`[docs] ${strict ? 'ERROR' : 'WARNING'}: scrub rule ${id} matched nothing — delete it from scripts/lib/spec-scrub.mjs if upstream fixed this`);
    }
    if (strict && unmatched.length) process.exitCode = 2;
  }

  writeFileSync(DEST_PATH, out);
  console.log(`[docs] ${rel(DEST_PATH)} <- ${from} (${out.length} bytes)`);
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
    process.exit();
  }

  // Deliberately NOT fatal. The refresh is an extra, and the snapshot below is
  // the source of record.
  console.warn(`[docs] WARNING: could not refresh from ${specHost()} — ${res.reason} (${res.attempts} attempt(s))`);
  console.warn('[docs] this is an upstream availability problem, unrelated to your change');
  console.warn('[docs] falling back to the committed snapshot; re-run --refresh later to re-snapshot');
}

if (existsSync(SIBLING_PATH)) {
  land(readFileSync(SIBLING_PATH, 'utf8'), `sibling orchestration checkout ${SIBLING_PATH}`);
  process.exit();
}

if (existsSync(SNAPSHOT_PATH)) {
  land(readFileSync(SNAPSHOT_PATH, 'utf8'), `committed snapshot ${rel(SNAPSHOT_PATH)}`);
  process.exit();
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
