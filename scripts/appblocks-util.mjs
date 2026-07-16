// Shared helpers for the App Blocks generators (scripts/gen-appblocks-*.mjs).
//
// Mirrors the resolution philosophy of scripts/copy-spec.mjs: prefer a live
// source (the `civitai` sibling repo at origin/main, or a published prod URL /
// npm package), fall back to a committed snapshot so the build is hermetic in
// CI (which has neither the sibling checkout nor guaranteed network).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '..');

const requireFromHere = createRequire(import.meta.url);

/**
 * Resolve an installed package's root directory. These SDK packages don't expose
 * `./package.json` in their `exports`, so we resolve the package's main entry and
 * walk up to the dir that owns its package.json.
 */
export function resolvePackageRoot(name) {
  // Direct devDeps land at node_modules/<name> under the repo root — reliable and
  // avoids the exports-map gate (these packages declare only an `import`
  // condition, so CJS require.resolve of the bare name fails).
  const guess = join(repoRoot, 'node_modules', ...name.split('/'));
  if (existsSync(join(guess, 'package.json'))) return guess;
  // Fallback: resolve the entry and walk up to the owning package.json.
  try {
    let dir = dirname(requireFromHere.resolve(name));
    for (let i = 0; i < 8; i++) {
      const pj = join(dir, 'package.json');
      if (existsSync(pj)) {
        try {
          if (JSON.parse(readFileSync(pj, 'utf8')).name === name) return dir;
        } catch {
          /* keep walking */
        }
      }
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  } catch {
    /* fall through to error */
  }
  throw new Error(`resolvePackageRoot: could not locate package root for ${name}`);
}
export const snapshotsDir = join(repoRoot, 'appblocks-snapshots');
export const outDir = join(repoRoot, 'public', 'appblocks');

// Candidate sibling `civitai` repo roots. The first matches the dev-stack layout
// copy-spec.mjs assumes (repos/<name>/repo/); the rest cover a flat local
// checkout. Each entry is a repo root that should contain `src/...`.
const CIVITAI_SIBLINGS = [
  resolve(repoRoot, '..', '..', 'civitai', 'repo'),
  resolve(repoRoot, '..', 'civitai'),
  resolve(repoRoot, '..', '..', 'civitai'),
];

/**
 * Resolve a file from the `civitai` sibling repo, preferring its `origin/main`
 * blob (so a teammate's in-progress working-tree branch never leaks into the
 * docs), then the working-tree file, then a committed snapshot by basename.
 *
 * @param {string} relPath  repo-relative path, e.g. 'src/shared/constants/x.ts'
 * @param {string} snapshotName  basename under appblocks-snapshots/
 * @returns {{ text: string, source: string }}
 */
export function readCivitaiSource(relPath, snapshotName) {
  for (const root of CIVITAI_SIBLINGS) {
    if (!existsSync(root)) continue;
    // Prefer origin/main via git when this is a git repo.
    if (existsSync(join(root, '.git'))) {
      try {
        const text = execFileSync('git', ['-C', root, 'show', `origin/main:${relPath}`], {
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        });
        return { text, source: `${root} (origin/main:${relPath})` };
      } catch {
        // fall through to working-tree read
      }
    }
    const wt = join(root, relPath);
    if (existsSync(wt)) {
      return { text: readFileSync(wt, 'utf8'), source: wt };
    }
  }
  const snap = join(snapshotsDir, snapshotName);
  if (existsSync(snap)) {
    return { text: readFileSync(snap, 'utf8'), source: `snapshot: ${snap}` };
  }
  throw new Error(
    `Could not resolve civitai source ${relPath} from any sibling repo or the committed snapshot ${snapshotName}`
  );
}

/** Write a JSON artifact into public/appblocks/, creating the dir. */
export function writeArtifact(name, data) {
  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, name);
  writeFileSync(dest, JSON.stringify(data, null, 2) + '\n');
  return dest;
}

/**
 * Reindent a `.d.ts` type literal for display. The opening `{` sits at column 0
 * while the body is indented to its position in the source file, so a naive
 * common-indent dedent is a no-op. Keep the first line, then strip the common
 * indentation of the remaining lines.
 */
export function dedent(text) {
  if (!text) return text;
  const lines = text.split('\n');
  if (lines.length <= 1) return text.trim();
  const rest = lines.slice(1);
  const indents = rest
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^[ \t]*/)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return [lines[0].trim(), ...rest.map((l) => l.slice(min))].join('\n').trimEnd();
}

export function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`[appblocks] ${msg}`);
}
