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
 * reporting the symmetric difference in both directions.
 *
 * 🔴 THE REGISTRY IS A CLOSED SET, AND THAT IS THE LIMIT OF THE CLAIM.
 * This guard can only compare methods `INSTALL_METHODS` knows about. An earlier
 * header said "adding a method to one page and forgetting the other fails,
 * whichever page you edited" — that is FALSE for anything outside the registry,
 * and it was false when written: both pages already documented the prebuilt
 * binary / Releases route, which matched none of the then-seven regexes, so
 * deleting it from one page alone still printed "both pages offer the same 7
 * install method(s)" and exited 0. The row now exists, but the general claim
 * does not hold — **a genuinely new install method must be added here or it is
 * invisible to this check.** Stating that plainly is the honest version; a guard
 * that overstates its coverage is how the next gap gets missed.
 *
 * WHY THE MARKERS ARE COMMANDS (mostly)
 * -------------------------------------
 * A method is identified by the command a reader actually types
 * (`nix profile install github:civitai/cli`), not by a prose keyword. Matching a
 * word like "nix" would be satisfied by a sentence merely MENTIONING Nix — the
 * spelled-not-structural failure, where a page passes while offering the reader
 * no runnable command. The one deliberate exception is `prebuilt-release`, which
 * has no command: it is a prose pointer at the Releases page, so it is keyed on
 * the URL a reader clicks, which is the closest thing to an invocation it has.
 *
 * 🔴 SET EQUALITY IS PLATFORM-BLIND, AND THAT COST US A PUBLISHED WRONG CLAIM.
 * A method id is derived from the COMMAND STRING alone (`brew install
 * civitai/tap/civitai`), so `# Homebrew (macOS only)` on one page and
 * `# Homebrew (macOS / Linux)` on the other are INDISTINGUISHABLE to the set
 * comparison: both yield `homebrew`, the sets are equal, and the guard prints
 * `✓ both pages offer the same 8 install method(s)` and exits 0. That is
 * precisely how `# Homebrew (macOS / Linux)` came to ship on BOTH pages in
 * perfect green parity.
 *
 * The claim is false. civitai/cli's `.goreleaser.yaml` carries a
 * `homebrew_casks:` stanza and NO `brews:` stanza, and a cask is a macOS-only
 * concept — upstream pins that with
 * `TestREADMEHomebrewSectionMatchesTheReleaseConfig`. On Linux (Linuxbrew
 * included) `brew install civitai/tap/civitai` has nothing to install. v0.1.108's
 * own `civitai upgrade` help says the same: "The release publishes a Homebrew
 * CASK, which is macOS-only".
 *
 * So `checkHomebrewPlatform` below asserts the PLATFORM CLAIM as well as the
 * method's presence: the banner attached to the brew command must carry a
 * macOS-only qualifier, and must not advertise Linux. Two independent
 * assertions, each with its own message, because each is separately reachable
 * (a banner can say "macOS only, also Linux").
 *
 * RESIDUAL, declared rather than implied: this checks the BANNER — the comment
 * line a reader's eye lands on directly above the command they copy. It does
 * not assert that the longer `::: warning Homebrew is macOS-only` note exists,
 * so deleting that note while leaving the banner intact stays green.
 *
 * POSITIVE CONTROL
 * ----------------
 * Set equality is trivially satisfied by two EMPTY sets, which is exactly what a
 * broken section-extractor or a renamed heading produces. So each page must also
 * yield at least `MIN_METHODS` methods; a page that yields none FAILS loudly
 * instead of reporting a serene "in parity". The platform check carries the same
 * control: it counts the banners it inspected and fails on zero, because a regex
 * that stopped matching the brew command would otherwise report nothing wrong.
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
  // Not a command — a prose pointer at the Releases page. Still an install ROUTE
  // a reader follows, and it sat OUTSIDE the registry at first: deleting it from
  // one page left both reporting "the same 7 install method(s)", rc=0.
  {
    id: 'prebuilt-release',
    label: 'prebuilt binary from GitHub Releases',
    re: /github\.com\/civitai\/cli\/releases/,
  },
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

// ---- platform claim: Homebrew is macOS-only --------------------------------

/** The command whose platform claim is checked. Same string the registry keys on. */
const BREW_COMMAND_RE = /brew\s+install\s+civitai\/tap\/civitai/;

/**
 * A macOS-only qualifier, in either word order: "(macOS only — see …)" and
 * "only on macOS" both pass. Scoped to ONE line so a qualifier three paragraphs
 * away cannot vouch for a command it is not attached to.
 */
export const MACOS_ONLY_RE = /(mac\s?os[^\n]*?\bonly\b)|(\bonly\b[^\n]*?mac\s?os)/i;

/**
 * A Linux support claim. The banner is a one-line platform label; there is no
 * true reason for it to name Linux, and `macOS / Linux` is the exact wording
 * that shipped. Deliberately NOT applied to the prose note below the fence —
 * that note says "On Linux (Linuxbrew included) … has nothing to install",
 * which is correct and must keep passing.
 */
export const LINUX_CLAIM_RE = /\blinux\b/i;

/**
 * The banner for each `brew install …` line in a section: the nearest preceding
 * shell-comment line, within the same fenced block, skipping blanks.
 *
 * Keyed on the COMMAND, then walking UP — rather than grepping the section for
 * a "Homebrew" heading — so the qualifier is required to be attached to the
 * thing a reader copies, not merely present somewhere on the page.
 *
 * @returns {Array<{ command: string, line: number, banner: string|null }>}
 */
export function homebrewBanners(sectionText) {
  const lines = sectionText.split('\n');
  const out = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      fenced = !fenced;
      continue;
    }
    // Only the RUNNABLE invocation inside a fence carries a platform claim. The
    // prose below the fence legitimately names the command while explaining that
    // it does nothing on Linux ("On Linux (Linuxbrew included) `brew install
    // civitai/tap/civitai` has nothing to install") — reading that as a Linux
    // support claim would red the correct text and green the wrong banner.
    if (!fenced) continue;
    if (!BREW_COMMAND_RE.test(lines[i])) continue;
    let banner = null;
    for (let j = i - 1; j >= 0; j--) {
      const l = lines[j].trim();
      if (l === '') continue;
      if (/^(```|~~~)/.test(l)) break; // hit the fence opener — no banner
      if (l.startsWith('#')) banner = lines[j];
      break; // the line directly above is the only candidate
    }
    out.push({ command: lines[i].trim(), line: i + 1, banner });
  }
  return out;
}

/**
 * Assert the Homebrew platform claim on one page's install section.
 * @returns {{ inspected: number, errors: string[][] }} errors are message blocks.
 */
export function checkHomebrewPlatform(sectionText) {
  const banners = homebrewBanners(sectionText);
  const errors = [];
  for (const { line, banner } of banners) {
    if (banner === null) {
      errors.push([
        `\`brew install civitai/tap/civitai\` (install-section line ${line}) carries NO platform banner.`,
        'The tap publishes a CASK, not a formula, and a cask is macOS-only — a reader on',
        'Linux must not meet this command unqualified. Label it, e.g. `# Homebrew (macOS only)`.',
      ]);
      continue;
    }
    if (!MACOS_ONLY_RE.test(banner)) {
      errors.push([
        `\`brew install civitai/tap/civitai\` (install-section line ${line}) is not marked macOS-only.`,
        `    banner: ${banner.trim()}`,
        'The tap publishes a CASK (civitai/cli `.goreleaser.yaml` has `homebrew_casks:` and no',
        '`brews:`), and a cask is a macOS-only concept. The banner must say so.',
      ]);
    }
    if (LINUX_CLAIM_RE.test(banner)) {
      errors.push([
        `\`brew install civitai/tap/civitai\` (install-section line ${line}) advertises LINUX.`,
        `    banner: ${banner.trim()}`,
        'It does not work there. On Linux (Linuxbrew included) the cask has nothing to install.',
        'Drop the Linux claim from the banner; point Linux readers at npm / Nix / `go install`.',
      ]);
    }
  }
  return { inspected: banners.length, errors };
}

/**
 * DETECTOR CONTROL — run on every invocation, before the real pages.
 *
 * 🔴 A GUARD THAT HAS NEVER BEEN WATCHED FAIL PROVES NOTHING, and a mutation run
 * in somebody's terminal proves it for that terminal only. These fixtures make
 * the red path re-provable on EVERY run, and each names the specific branch it
 * is meant to kill so a mutant cannot die on the wrong assertion and read as
 * covered:
 *   - `macOS / Linux` is the banner that actually shipped on both pages in green
 *     parity; it must trip BOTH branches.
 *   - `macOS only, and Linux via Linuxbrew` SATISFIES the macOS-only branch, so
 *     only the Linux branch can kill it — that is what proves the Linux
 *     assertion is independently reachable rather than riding along.
 *   - `# Homebrew` alone must trip the macOS branch and NOT the Linux branch.
 *   - the last two must stay silent, including the prose line that correctly
 *     names Linux BELOW the fence.
 */
const PLATFORM_FIXTURES = [
  { banner: '# Homebrew (macOS / Linux)', wantMacosErr: true, wantLinuxErr: true },
  { banner: '# Homebrew (macOS only, and Linux via Linuxbrew)', wantMacosErr: false, wantLinuxErr: true },
  { banner: '# Homebrew', wantMacosErr: true, wantLinuxErr: false },
  { banner: '# Homebrew (macOS only — see the note below)', wantMacosErr: false, wantLinuxErr: false },
  { banner: '# Homebrew (only on macOS)', wantMacosErr: false, wantLinuxErr: false },
];

function runDetectorControl() {
  const mk = (banner) =>
    ['## Install', '', '```bash', banner, 'brew install civitai/tap/civitai', '```', '', 'On Linux (Linuxbrew included) `brew install civitai/tap/civitai` has nothing to install.'].join('\n');

  let fired = 0;
  let silent = 0;
  for (const f of PLATFORM_FIXTURES) {
    const { inspected, errors } = checkHomebrewPlatform(mk(f.banner));
    // Exactly one fenced command per fixture — if the walker double-counts or
    // picks up the prose mention, the control fails here rather than later.
    if (inspected !== 1) {
      console.error(`  ✗ detector control: fixture ${JSON.stringify(f.banner)} inspected ${inspected} command(s), want 1`);
      process.exit(1);
    }
    const joined = errors.map((e) => e.join(' ')).join('\n');
    const gotMacos = /is not marked macOS-only|carries NO platform banner/.test(joined);
    const gotLinux = /advertises LINUX/.test(joined);
    if (gotMacos !== f.wantMacosErr || gotLinux !== f.wantLinuxErr) {
      console.error(`  ✗ detector control: fixture ${JSON.stringify(f.banner)}`);
      console.error(`      macOS-only branch fired=${gotMacos} want=${f.wantMacosErr}`);
      console.error(`      Linux-claim branch fired=${gotLinux} want=${f.wantLinuxErr}`);
      process.exit(1);
    }
    if (f.wantMacosErr || f.wantLinuxErr) fired++;
    else silent++;
  }

  // A no-banner fixture: the command is the first line inside the fence.
  const noBanner = checkHomebrewPlatform(['## Install', '', '```bash', 'brew install civitai/tap/civitai', '```'].join('\n'));
  if (!noBanner.errors.some((e) => e[0].includes('carries NO platform banner'))) {
    console.error('  ✗ detector control: a brew command with no banner at all did not fire');
    process.exit(1);
  }
  fired++;

  console.log(`  ✓ platform detector control: ${fired + silent} fixture(s) exact — ${fired} that MUST fire did, ${silent} that must not stayed silent`);
}

const labelOf = (id) => INSTALL_METHODS.find((m) => m.id === id)?.label ?? id;

function main() {
  console.log('CLI install-method parity — the two hosted pages document one binary\n');

  runDetectorControl();
  console.log('');

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
    pages.push({ rel, methods, section });
  }

  if (fatal) {
    console.error('\n--- CLI INSTALL PARITY: could not make a trustworthy comparison ---');
    process.exit(1);
  }

  // ---- platform claim, per page ---------------------------------------------
  // Runs BEFORE the set comparison reports success, because a set comparison
  // cannot see a platform claim at all: that is the whole point of this half.
  let platformFatal = false;
  let bannersInspected = 0;
  for (const { rel, methods, section } of pages) {
    if (!methods.has('homebrew')) continue;
    const { inspected, errors } = checkHomebrewPlatform(section);
    bannersInspected += inspected;
    if (inspected === 0) {
      console.error(`\n  ✗ ${rel} — the homebrew method was detected but NO \`brew install\` line was located.`);
      console.error('    The banner walker is reading something the registry regex is not; it cannot');
      console.error('    report "no platform problem" over zero inspected commands.');
      platformFatal = true;
      continue;
    }
    for (const block of errors) {
      console.error(`\n  ✗ ${rel} — ${block[0]}`);
      for (const l of block.slice(1)) console.error(`    ${l}`);
      platformFatal = true;
    }
  }
  if (platformFatal) {
    console.error('\n--- HOMEBREW PLATFORM CLAIM ---');
    console.error('\nThese pages document the SAME cask. `homebrew_casks:` in civitai/cli\'s');
    console.error('.goreleaser.yaml (and no `brews:` stanza) makes it macOS-only, which the install');
    console.error('METHOD SET above is structurally blind to — both pages can claim Linux support and');
    console.error('still print "in parity".');
    process.exit(1);
  }
  if (bannersInspected > 0) {
    console.log(`\n  ✓ Homebrew is labelled macOS-only on every page that offers it (${bannersInspected} banner(s) inspected)`);
  }

  const [a, b] = pages;
  const onlyA = [...a.methods].filter((m) => !b.methods.has(m));
  const onlyB = [...b.methods].filter((m) => !a.methods.has(m));

  if (!onlyA.length && !onlyB.length) {
    console.log(`  ✓ both pages offer the same ${a.methods.size} install method(s)`);
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
