// Fan-out runner for the five App Blocks reference generators. Mirrors the
// predev/prebuild `copy:spec` hook: it produces the gitignored
// public/appblocks/*.json artifacts the VitePress theme components render.
//
// Order: simplest/most-robust first so a failure surfaces on the cheapest
// contract before the ts-morph-heavy ones.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const steps = [
  'gen-appblocks-scopes.mjs',
  'gen-appblocks-manifest.mjs',
  'gen-appblocks-cli.mjs',
  'gen-appblocks-messages.mjs',
  'gen-appblocks-hooks.mjs',
];

for (const step of steps) {
  execFileSync(process.execPath, [join(here, step)], { stdio: 'inherit' });
}
