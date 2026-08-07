#!/usr/bin/env node
/**
 * check-cli-install-parity.mjs
 * ----------------------------
 * Two hosted pages document how to install the SAME binary:
 *
 *   - `site/guide/cli.md`      — the read/download CLI
 *   - `apps/reference/cli.md`  — the Apps-authoring CLI
 *
 * They are the same `civitai` executable from the same repo (`civitai/cli`), so
 * the SET of install methods they offer must be identical. It was not: the Apps
 * page listed npm / Homebrew / `go install` and documented Nix **zero** times,
 * while the site page documented `nix run`, `nix profile install` AND flake-input
 * pinning. A reader who found the Apps page came away believing the CLI has no
 * Nix story at all.
 *
 * WHY THIS IS A SET COMPARISON AND NOT A DIFF
 * -------------------------------------------
 * The two pages legitimately differ in prose, ordering, examples and surrounding
 * context — one is a reference, the other a guide. What must NOT differ is which
 * installation routes exist. So the guard extracts a normalised METHOD SET from
 * each page's `## Install` section and requires the two sets to be equal,
 * reporting the symmetric difference in both directions. Adding a method to one
 * page and forgetting the other fails, whichever page you edited.
 *
 * WHY THE MARKERS ARE COMMANDS
 * ----------------------------
 * A method is identified by the command a reader actually types
 * (`nix profile install github:civitai/cli`), not by a prose keyword. Matching a
 * word like "nix" would be satisfied by a sentence merely MENTIONING Nix — the
 * spelled-not-structural failure, where a page passes while offering the reader
 * no runnable command. Each marker below is the invocation itself.
 *
 * POSITIVE CONTROL
 * ----------------
 * Set equality is trivially satisfied by two EMPTY sets, which is exactly what a
 * broken section-extractor or a renamed heading produces. So each page must also
 * yield at least `MIN_METHODS` methods; a page that yields none FAILS loudly
 * instead of reporting a serene "in parity".
 *
 * USAGE
 *   npm run check:cli-install-parity
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** The two hosted pages that install the same binary. */
export const CLI_PAGES = ['site/guide/cli.md', 'apps/reference/cli.md'];

/**
 * A page must offer at least this many methods. Guards against an empty-vs-empty
 * "pass" after a heading rename or a regex change. Deliberately well below the
 * real count (7) so an intentional removal does not require touching it.
 */
export const MIN_METHODS = 4;

/**
 * Install methods, keyed by the command a reader types. `label` is what the
 * failure message prints. Order is presentation only; comparison is set-based.
 */
export const INSTALL_METHODS = [
  { id: 'npm-global', label: 'npm install -g @civitai/cli', re: /npm\s+install\s+-g\s+@civitai\/cli/ },
  { id: 'npx', label: 'npx @civitai/cli', re: /npx\s+@civitai\/cli/ },
  { id: 'homebrew', label: 'brew install civitai/tap/civitai', re: /brew\s+install\s+civitai\/tap\/civitai/ },
  { id: 'go-install', label: 'go install github.com/civitai/cli/...', re: /go\s+install\s+github\.com\/civitai\/cli/ },
  { id: 'nix-run', label: 'nix run github:civitai/cli', re: /nix\s+run\s+github:civitai\/cli/ },
  { id: 'nix-profile', label: 'nix profile install github:civitai/cli', re: /nix\s+profile\s+install\s+github:civitai\/cli/ },
  { id: 'nix-flake-input', label: 'flake input (inputs.civitai-cli.url)', re: /inputs\.civitai-cli\.url\s*=/ },
];

/**
 * Extract the `## Install` section: from that heading to the next `#`/`##`
 * heading (a `###` subsection stays inside).
 *
 * 🔴 FENCE TRACKING IS NOT OPTIONAL. A markdown heading regex applied to raw
 * lines also matches a SHELL COMMENT inside a fenced block — `# npm (a thin
 * wrapper…)` is the very first line of the install snippet on both pages — so
 * the naive version terminated the section immediately and both pages yielded
 * ZERO methods. Two empty sets are EQUAL, so without the MIN_METHODS positive
 * control below that bug would have reported "in parity" forever. It was caught
 * by that control on the first run, which is the whole reason it is there.
 *
 * Returns `null` when the heading is absent — a distinct outcome from "found a
 * section with no methods", because the two need different remedies.
 */
export function installSection(markdown) {
  const lines = markdown.split('\n');
  const isFence = (l) => /^\s*(```|~~~)/.test(l);

  let start = -1;
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (isFence(lines[i])) fenced = !fenced;
    else if (!fenced && /^##\s+Install\s*$/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  fenced = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (isFence(lines[i])) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && /^#{1,2}\s+\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** The set of method ids a section offers. */
export function methodsIn(sectionText) {
  return new Set(INSTALL_METHODS.filter((m) => m.re.test(sectionText)).map((m) => m.id));
}

const labelOf = (id) => INSTALL_METHODS.find((m) => m.id === id)?.label ?? id;

function main() {
  console.log('CLI install-method parity — the two hosted pages document one binary\n');

  const pages = [];
  let fatal = false;

  for (const rel of CLI_PAGES) {
    const text = readFileSync(join(repoRoot, rel), 'utf8');
    const section = installSection(text);
    if (section === null) {
      console.error(`  ✗ ${rel} — no "## Install" heading found.`);
      console.error('    The extractor keys on that exact heading; a rename makes this guard blind,');
      console.error('    so it fails rather than comparing two empty sets.');
      fatal = true;
      continue;
    }
    const methods = methodsIn(section);
    console.log(`  · ${rel} — ${methods.size} method(s): ${[...methods].join(', ') || '(none)'}`);
    if (methods.size < MIN_METHODS) {
      console.error(`  ✗ ${rel} — only ${methods.size} install method(s) detected, expected >= ${MIN_METHODS}.`);
      console.error('    Two empty sets compare EQUAL, so a broken extractor would otherwise report parity.');
      fatal = true;
    }
    pages.push({ rel, methods });
  }

  if (fatal) {
    console.error('\n--- CLI INSTALL PARITY: could not make a trustworthy comparison ---');
    process.exit(1);
  }

  const [a, b] = pages;
  const onlyA = [...a.methods].filter((m) => !b.methods.has(m));
  const onlyB = [...b.methods].filter((m) => !a.methods.has(m));

  if (!onlyA.length && !onlyB.length) {
    console.log(`\n  ✓ both pages offer the same ${a.methods.size} install method(s)`);
    console.log('\nCLI install methods: in parity.');
    return;
  }

  console.error('\n--- CLI INSTALL PARITY DRIFT ---');
  console.error('\nThese pages document the SAME `civitai` binary, so a reader who lands on one');
  console.error('must not be told about fewer ways to install it than a reader who lands on the');
  console.error('other. That is how the Apps page came to document Nix zero times while the site');
  console.error('page documented three Nix routes.\n');
  for (const [page, only, other] of [
    [a.rel, onlyA, b.rel],
    [b.rel, onlyB, a.rel],
  ]) {
    for (const id of only) {
      console.error(`  ✗ ${labelOf(id)}`);
      console.error(`      documented in ${page}`);
      console.error(`      MISSING from  ${other}`);
    }
  }
  console.error('\nAdd the missing method(s) to the page that lacks them (or remove from both).');
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    console.error(`check-cli-install-parity: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  }
}
