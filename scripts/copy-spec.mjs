import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// Sibling orchestration repo in the dev stack:
//   repos/civitai-developer-docs/repo/          <- this repo
//   repos/civitai-orchestration/repo/src/...    <- source of the spec
const siblingSpec = resolve(
  repoRoot,
  '..', '..',
  'civitai-orchestration', 'repo',
  'src', 'Civitai.Orchestration.Api', 'wwwroot', 'openapi', 'v2-consumers.json',
);

const fallbackUrl = 'https://orchestration.civitai.com/openapi/v2-consumers.json';
const dest = join(repoRoot, 'public', 'openapi', 'v2-consumers.json');

mkdirSync(dirname(dest), { recursive: true });

if (existsSync(siblingSpec)) {
  cpSync(siblingSpec, dest);
  console.log(`[docs] copied ${siblingSpec} -> ${dest}`);
} else {
  console.log(`[docs] sibling spec not found at ${siblingSpec}`);
  console.log(`[docs] fetching ${fallbackUrl}`);
  const res = await fetch(fallbackUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${fallbackUrl}: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  writeFileSync(dest, text);
  console.log(`[docs] wrote ${dest} (${text.length} bytes)`);
}
