// Fan-out runner for the App Blocks reference generators. Mirrors the
// predev/prebuild `copy:spec` hook: it produces the gitignored
// public/appblocks/*.json artifacts the VitePress theme components render, plus
// the gitignored apps/reference/elements.md the element gallery IS.
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
  'gen-appblocks-bridge.mjs',
  // Last, and the only one that writes a MARKDOWN page rather than a JSON
  // artifact: its source is the custom-elements.json inside the pinned devDep,
  // so it needs no network and nothing in public/. The page is gitignored for
  // the same reason the JSON is — a build must never rewrite a committed file.
  'gen-appblocks-element-gallery.mjs',
];

for (const step of steps) {
  execFileSync(process.execPath, [join(here, step)], { stdio: 'inherit' });
}
