#!/usr/bin/env node
/**
 * check-appblocks-pins.mjs
 * ------------------------
 * The App Blocks generation-bridge VERSION-PIN drift-guard.
 *
 * The generated App Blocks reference is only as fresh as the pinned devDep it is
 * generated from. When @civitai/app-sdk or @civitai/blocks-react publishes a new
 * version and the docs pin lags, the live hooks / messages / **bridge** reference
 * silently trails — exactly how `cancel` and the 0.33→0.35→0.37 additions went
 * missing (see app-blocks-bridge-public-docs-assessment-2026-07-27.md, fix #4).
 * This guard fetches each package's npm `latest` and FAILS when a pinned devDep
 * is behind it, so a lagging pin is a visible, actionable signal instead of a
 * quietly-stale reference.
 *
 * SCOPE — the two packages that FEED the generated generation references
 * (hooks.json / messages.json / bridge.json). The design-system packages
 * (@civitai/components*) feed the components reference, which has its OWN drift
 * authority (the MARKUP.md snapshot in check-appblocks-snapshots.mjs); they lock-
 * step on a design-system publish, not this generation-bridge one, so they are
 * intentionally NOT checked here.
 *
 * RESULTS (mirrors the snapshot guard's 404-vs-network contract)
 *   - pinned == latest                     -> PASS.
 *   - pinned <  latest                     -> FAIL (exit 1): the reference is
 *     trailing; bump the pin (in LOCKSTEP — blocks-react peer-locks the app-sdk
 *     minor) and regenerate.
 *   - pinned >  latest (ahead / prerelease) -> PASS with a note.
 *   - registry unreachable / DNS / timeout / 5xx / 429 -> SKIP (exit 0): a
 *     connectivity failure must never false-fail.
 *   - a 404 for the package itself          -> FAIL (the pin names a package npm
 *     doesn't serve — real drift, not transient).
 *
 * DESIGN — scheduled + PR-on-pin-change. Like the snapshot guard, a new upstream
 * publish is unrelated to an arbitrary docs PR, so the scheduled run is the
 * primary signal (`.github/workflows/appblocks-drift.yml`). It ALSO runs on a PR
 * that touches package.json so a pin bump is verified against `latest` at review
 * time.
 *
 * USAGE
 *   npm run check:pins
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// The generation-bridge SDK packages whose pin freshness gates the generated
// reference. (Design-system packages are guarded via MARKUP.md — see header.)
export const TRACKED_PACKAGES = ['@civitai/app-sdk', '@civitai/blocks-react'];

const REGISTRY = process.env.APPBLOCKS_NPM_REGISTRY || 'https://registry.npmjs.org';

/** Parse a `major.minor.patch[-pre]` version into comparable parts. */
export function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(String(v).trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null };
}

/**
 * Compare two release versions. Returns -1 if a<b, 0 if equal, 1 if a>b.
 * A prerelease sorts BELOW its release (1.2.3-rc < 1.2.3). Unparseable -> throws.
 */
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`unparseable semver: ${!pa ? a : b}`);
  for (const k of ['major', 'minor', 'patch']) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1;
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre && !pb.pre) return -1; // prerelease < release
  if (!pa.pre && pb.pre) return 1;
  return pa.pre < pb.pre ? -1 : 1;
}

/**
 * Classify one package's pin against the resolved `latest`. Pure + exported so
 * the regression test proves the guard FIRES on a lagging pin without network.
 * @returns {{ status: 'ok'|'lagging'|'ahead', pinned: string, latest: string }}
 */
export function classifyPin(pinned, latest) {
  const cmp = compareSemver(pinned, latest);
  if (cmp < 0) return { status: 'lagging', pinned, latest };
  if (cmp > 0) return { status: 'ahead', pinned, latest };
  return { status: 'ok', pinned, latest };
}

/** Read the EXACT pinned devDep version for a package from package.json. */
export function readPinnedVersion(pkg, pkgJsonPath = join(repoRoot, 'package.json')) {
  const pj = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const dev = pj.devDependencies || {};
  const raw = dev[pkg];
  if (!raw) return { ok: false, reason: `not a devDependency` };
  // This guard only reasons about EXACT pins (the docs pin exact by convention).
  if (!/^\d+\.\d+\.\d+(?:-.+)?$/.test(raw)) {
    return { ok: false, reason: `pin "${raw}" is not an exact version (range pins are not tracked)` };
  }
  return { ok: true, version: raw };
}

/** Fetch a package's npm `latest` dist-tag. 404 = real drift; else transient. */
async function fetchLatest(pkg) {
  const url = `${REGISTRY}/${pkg.replace('/', '%2F')}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
    if (!res.ok) {
      const gone = res.status === 404 || res.status === 410;
      return { ok: false, url, status: res.status, reason: `HTTP ${res.status}`, gone };
    }
    const body = await res.json();
    const latest = body['dist-tags']?.latest;
    if (!latest) return { ok: false, url, reason: 'no dist-tags.latest in registry response' };
    return { ok: true, url, latest };
  } catch (err) {
    return { ok: false, url, reason: err.message, network: true };
  }
}

async function main() {
  console.log('App Blocks generation-bridge pin-guard — pinned devDeps vs npm latest\n');

  const lagging = [];
  const skipped = [];
  let ok = 0;

  for (const pkg of TRACKED_PACKAGES) {
    const pin = readPinnedVersion(pkg);
    if (!pin.ok) {
      console.log(`  ⊘ ${pkg} — ${pin.reason} — skipping`);
      skipped.push({ pkg, note: pin.reason });
      continue;
    }
    const remote = await fetchLatest(pkg);
    if (!remote.ok) {
      if (remote.gone) {
        console.log(`  ✗ ${pkg} — registry returned ${remote.reason}: npm does not serve this package`);
        lagging.push({ pkg, pinned: pin.version, gone: true, status: remote.status });
        continue;
      }
      console.log(`  ⊘ ${pkg} — ${remote.reason} — could not reach registry (skip, no false-fail)`);
      skipped.push({ pkg, note: remote.reason });
      continue;
    }
    const cls = classifyPin(pin.version, remote.latest);
    if (cls.status === 'ok') {
      console.log(`  ✓ ${pkg}@${pin.version} — matches npm latest`);
      ok++;
    } else if (cls.status === 'ahead') {
      console.log(`  ✓ ${pkg}@${pin.version} — AHEAD of npm latest (${remote.latest}) — ok (prerelease/pending publish)`);
      ok++;
    } else {
      console.log(`  ✗ ${pkg}@${pin.version} — LAGS npm latest ${remote.latest}`);
      lagging.push({ pkg, pinned: pin.version, latest: remote.latest });
    }
  }

  console.log(`\nPins: ${ok} current · ${lagging.length} lagging · ${skipped.length} skipped (unreachable)`);

  if (skipped.length && !lagging.length && ok === 0) {
    console.log('\nRegistry unreachable for all packages — treating as a network issue, not drift. Exiting 0.');
    return;
  }

  if (lagging.length) {
    console.error('\n--- PIN DRIFT: a generation-bridge devDep pin trails npm latest ---');
    console.error('The generated hooks / messages / bridge reference is only as fresh as these pins, so the');
    console.error('published reference is TRAILING until they are bumped. Bump in LOCKSTEP (blocks-react');
    console.error('peer-locks the app-sdk minor; verify with `npm ci`, not `npm install`) then regenerate:');
    for (const l of lagging) {
      if (l.gone) {
        console.error(`  - ${l.pkg}: pinned ${l.pinned}, but npm returned HTTP ${l.status} for the package.`);
      } else {
        console.error(`  - ${l.pkg}: ${l.pinned} -> ${l.latest}   (package.json devDependencies)`);
      }
    }
    console.error('\nThen run `npm run gen:appblocks` and review the regenerated public/appblocks/*.');
    process.exit(1);
  }
}

// Run only when invoked directly (not when imported for the exported helpers).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`check-appblocks-pins: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  });
}
