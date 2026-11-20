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
 * 🔴 SET EQUALITY IS PLATFORM-BLIND, SO THE PLATFORM CLAIM IS CHECKED SEPARATELY.
 * A method id is derived from the COMMAND STRING alone (`brew install
 * civitai/tap/civitai`), so `# Homebrew (macOS only)` on one page and
 * `# Homebrew (macOS and Linux)` on the other are INDISTINGUISHABLE to the set
 * comparison: both yield `homebrew`, the sets are equal, and the guard prints
 * `✓ both pages offer the same 8 install method(s)` and exits 0.
 *
 * So `checkBannerList` below asserts the PLATFORM CLAIM as well as the method's
 * presence: the banner attached to every brew command must name EVERY platform
 * in `HOMEBREW_PLATFORMS` and must not narrow it with "only". `staleNoteErrors`
 * applies the same claim to the prose around the command ("Homebrew is
 * macOS-only" notes).
 *
 * 🔴 THIS GUARD ONCE ENFORCED THE OPPOSITE, WRONG CLAIM — READ THIS BEFORE
 * TRUSTING `HOMEBREW_PLATFORMS`. Until 2026-11 it required every banner to say
 * "macOS only" and to NOT name Linux, citing civitai/cli's
 * `TestREADMEHomebrewSectionMatchesTheReleaseConfig` and the belief that "a
 * cask is a macOS-only concept". That was false: the published cask
 * (civitai/homebrew-tap `Casks/civitai.rb`) carries an `on_linux` block with
 * linux amd64/arm64 archives, because the CLI's `homebrew_casks:` stanza has no
 * platform filter. civitai/cli#951 corrected the CLI README to
 * `### Homebrew (macOS and Linux)`, and that same test now DERIVES the platform
 * set from `.goreleaser.yaml` instead of pinning it. This guard, meanwhile,
 * kept every docs surface saying macOS-only in perfect green — because the
 * platform set was a constant here, compared against nothing upstream.
 *
 * That is why `--upstream` exists: it derives the platform set from the
 * published cask AND from the CLI README's Homebrew heading, and fails when
 * either disagrees with `HOMEBREW_PLATFORMS`. It runs nightly in
 * appblocks-drift.yml (network, advisory), never as the PR gate, which stays
 * offline and repo-local.
 *
 * 🔴 THE SURFACE SET IS DISCOVERED, NOT LISTED — because a hardcoded list is the
 * defect this guard was written to stop, one level up. The first version checked
 * `CLI_PAGES` only, which is the two pages a HUMAN reads. It missed
 * `public/agent-setup/prompt.md` — served verbatim and FETCHED AND EXECUTED
 * UNATTENDED BY CODING AGENTS — and `agent-setup/index.md`, which embeds the same
 * block AND carries a second copy in its by-hand snippet. Nothing else covers
 * them: `check-agent-setup.mjs` names prompt.md 30 times but mentions `brew` only
 * in its non-civitai command ALLOWLIST and in one historical byte-count comment;
 * it asserts nothing about platform. So every committed file carrying a FENCED
 * `brew install civitai/tap/civitai` is checked, and a surface added tomorrow is
 * covered without anyone remembering to list it.
 *
 * 🔴 THREE BANNER SHAPES, AND ONLY ONE OF THEM IS A `#` COMMENT. Requiring the
 * shape the CLI pages happen to use would redden correct prose:
 *   1. a `#` comment line directly above the command, inside the fence
 *      (`# Homebrew (macOS and Linux)` — both CLI pages);
 *   2. PROSE above the fence opener
 *      (`or, on macOS or Linux, with Homebrew:` — prompt.md, agent-setup/index.md);
 *   3. a trailing `#` comment on the command's OWN line
 *      (`npm install -g @civitai/cli   # or, on macOS or Linux: brew install …`
 *      — agent-setup/index.md's by-hand block).
 * `homebrewBanners` resolves all three, in that precedence, and still takes only
 * the NEAREST candidate: a qualifier three paragraphs away must not vouch for a
 * command it is not attached to.
 *
 * RESIDUAL, declared rather than implied: the banner check covers the line a
 * reader's eye lands on next to the command they copy; `staleNoteErrors` covers
 * any OTHER line on those surfaces that restricts Homebrew/the cask to macOS.
 * Neither asserts that the explanatory note (CLI pages) or the Linux paragraph
 * (agent-setup pages) EXISTS, so deleting one stays green. Files that name only
 * `brew upgrade` (the generated `civitai upgrade` help page) are not surfaces:
 * that text is generated from the vendored help snapshot and follows the CLI.
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
 *   npm run check:cli-install-parity                  # offline, the PR gate
 *   npm run check:cli-install-parity -- --upstream    # vs the cask + CLI README (network)
 */

import { readFileSync } from 'node:fs';
import { walkFiles } from './check-cli-download-example-ids.mjs';
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
  const { inside, delim } = fenceMask(lines);

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (inside[i] || delim[i]) continue;
    if (/^##\s+Install\s*$/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (inside[i] || delim[i]) continue;
    if (/^#{1,2}\s+\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** A line that LOOKS like a fence marker, tested without any open-fence state. */
export const FENCE_MARKER_RE = /^\s*(`{3,}|~{3,})/;

/**
 * Per-line fence classification for a markdown document: `inside[i]` is true for
 * CONTENT inside a fenced block, `delim[i]` for the opening/closing markers
 * themselves.
 *
 * 🔴 A TOGGLE ON `/^\s*(```|~~~)/` IS WRONG, AND IT FAILS SILENTLY IN THE
 * DANGEROUS DIRECTION. `agent-setup/index.md` embeds the agent prompt inside a
 * FOUR-backtick fence (` ````md `) so the prompt's own three-backtick fences can
 * appear verbatim inside it. A naive toggle counts those inner markers, the
 * parity inverts, and from there every fenced line reads as prose and every
 * prose line as fenced — which made `brew install civitai/tap/civitai` at
 * index.md:88 INVISIBLE to the platform check while the run still printed a
 * confident ✓. Caught by the surface/banner floor, not by review.
 *
 * So the CommonMark rule, not a toggle: a fence opens on a run of >= 3 of one
 * character and closes only on a run of the SAME character, at least as long,
 * with nothing after it. A shorter or info-string-carrying marker inside a fence
 * is ordinary content.
 *
 * One implementation, used by BOTH readers here — a duplicated fence predicate
 * is how the same bug comes back at the second call site.
 *
 * @returns {{ inside: boolean[], delim: boolean[] }}
 */
export function fenceMask(lines) {
  const inside = new Array(lines.length).fill(false);
  const delim = new Array(lines.length).fill(false);
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (open === null) {
      if (m) {
        open = { char: m[1][0], len: m[1].length };
        delim[i] = true;
      }
      continue;
    }
    if (m && m[1][0] === open.char && m[1].length >= open.len && m[2].trim() === '') {
      open = null;
      delim[i] = true;
      continue;
    }
    inside[i] = true;
  }
  return { inside, delim };
}

/** The set of method ids a section offers. */
export function methodsIn(sectionText) {
  return new Set(INSTALL_METHODS.filter((m) => m.re.test(sectionText)).map((m) => m.id));
}

// ---- platform claim: Homebrew covers exactly the cask's platforms ----------

/** The command whose platform claim is checked. Same string the registry keys on. */
const BREW_COMMAND_RE = /brew\s+install\s+civitai\/tap\/civitai/;

/**
 * The platforms the published Homebrew cask installs on, and therefore the
 * platforms every Homebrew banner must name.
 *
 * Source of truth, in order: the published cask
 * (civitai/homebrew-tap `Casks/civitai.rb`: `on_macos` AND `on_linux` blocks,
 * each with amd64/arm64 archives), which civitai/cli's `.goreleaser.yaml`
 * renders from a `homebrew_casks:` stanza with no platform filter; and the CLI
 * README's `### Homebrew (macOS and Linux)` (civitai/cli#951), which
 * `TestREADMEHomebrewSectionMatchesTheReleaseConfig` keeps derived from that
 * config. This constant is offline so the PR gate needs no network; `--upstream`
 * re-derives it from both sources and fails when they move.
 */
export const HOMEBREW_PLATFORMS = [
  { name: 'macOS', re: /\bmac\s?os\b/i, cask: 'macos' },
  { name: 'Linux', re: /\blinux\b/i, cask: 'linux' },
];

/**
 * A word that narrows a banner to fewer platforms than it names
 * ("macOS only; Linux via Linuxbrew"). The banner is a one-line platform label
 * listing every platform the cask covers, so it has no true reason to say
 * "only". Scoped to the one banner line.
 */
export const NARROWING_RE = /\bonly\b/i;

/**
 * A prose line restricting Homebrew or the cask to macOS, in either word order
 * ("Homebrew is macOS-only", "a cask is a macOS-only concept", "on macOS only,
 * with Homebrew"). `staleNoteErrors` applies it to every line of a Homebrew
 * surface that ALSO names Homebrew, the cask, brew or the tap.
 */
export const MACOS_ONLY_RE = /(mac\s?os[^\n]*?\bonly\b)|(\bonly\b[^\n]*?mac\s?os)/i;
const HOMEBREW_WORD_RE = /homebrew|\bcasks?\b|\bbrew\b|\btap\b/i;

/**
 * The banner for each FENCED `brew install …` line in a file, resolved in three
 * shapes (see the header). Precedence, nearest-first:
 *
 *   1. a trailing `#` comment on the command's OWN line — if the author put the
 *      qualifier there, that is the qualifier, and nothing above it can override
 *      or contradict it;
 *   2. the nearest preceding non-blank line INSIDE the fence, if it is a `#`
 *      shell comment;
 *   3. failing both, fall THROUGH the fence opener to the nearest preceding
 *      non-blank PROSE line.
 *
 * Keyed on the COMMAND, then walking UP — rather than grepping the page for a
 * "Homebrew" heading — so the qualifier is required to be attached to the thing
 * a reader (or an agent) copies, not merely present somewhere on the page. Only
 * ONE candidate line is ever taken, at each step, for the same reason.
 *
 * 🔴 STEP 3 IS WHY THIS WALKS A WHOLE FILE, NOT AN `## Install` SECTION. The
 * agent-setup surfaces have no such heading, and their qualifier is prose ABOVE
 * the fence. The earlier version stopped at the fence opener and would have
 * reported `carries NO platform banner` on text that is correct today.
 *
 * @returns {Array<{ command: string, line: number, banner: string|null }>}
 */
export function homebrewBanners(fileText) {
  const lines = fileText.split('\n');
  const { inside, delim } = fenceMask(lines);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    // Only the RUNNABLE invocation inside a fence carries a banner. Prose that
    // merely names the command (a note explaining it) is not something a reader
    // copies, so it is not a banner; `staleNoteErrors` grades that prose instead.
    if (!inside[i]) continue;
    if (!BREW_COMMAND_RE.test(lines[i])) continue;

    let banner = null;
    // (1) trailing comment on the command's own line.
    const hash = lines[i].indexOf('#');
    if (hash !== -1) {
      banner = lines[i].slice(hash);
    } else {
      // (2)/(3) walk up: the nearest non-blank line inside the fence, else the
      // nearest non-blank prose line above the fence opener.
      let crossedFence = false;
      for (let j = i - 1; j >= 0; j--) {
        const l = lines[j].trim();
        if (l === '') continue;
        // A fence MARKER, tested locally rather than via `delim` on purpose: in
        // an EMBEDDED document (`agent-setup/index.md` wraps the whole agent
        // prompt in a ````md block so the prompt's own ```bash fences survive
        // verbatim) those inner markers are outer-fence CONTENT, so `delim` is
        // false for them — yet for the prompt they really are its fences, and
        // the qualifier a reader sees sits above them. The stateful mask is what
        // decides whether a COMMAND is fenced; this one-line test only decides
        // what the walk steps over.
        if (FENCE_MARKER_RE.test(lines[j])) {
          if (crossedFence) break; // a second fence: we have left the block above
          crossedFence = true;
          continue; // (3) fall THROUGH the opener to the prose above it
        }
        if (!crossedFence && !l.startsWith('#')) break; // (2) a non-comment line inside the fence
        banner = lines[j];
        break;
      }
    }
    out.push({ command: lines[i].trim(), line: i + 1, banner });
  }
  return out;
}

/**
 * Every committed file carrying a FENCED `brew install civitai/tap/civitai`.
 *
 * Discovered, not listed — see the header. Reuses the sibling guard's walker so
 * the carve-out (`node_modules`, build output, and `scripts/`, which must stay
 * free to name the command in fixtures and prose) is defined once rather than
 * twice; `scripts/` holds this very file's detector fixtures.
 *
 * @returns {Array<{ rel: string, text: string, banners: ReturnType<typeof homebrewBanners> }>}
 */
export function homebrewSurfaces(root = repoRoot) {
  const found = [];
  for (const rel of walkFiles(root)) {
    let text;
    try {
      text = readFileSync(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (!BREW_COMMAND_RE.test(text)) continue;
    const banners = homebrewBanners(text);
    if (banners.length) found.push({ rel, text, banners });
  }
  return found;
}

/**
 * Floors on the discovery. A reassuring "no platform problem" over ZERO surfaces
 * is indistinguishable from a walker reading the wrong tree or a command string
 * that stopped matching. Measured 2026-09-25: 4 surfaces, 5 banners
 * (site/guide/cli.md, apps/reference/cli.md, public/agent-setup/prompt.md,
 * agent-setup/index.md ×2). Slack is deliberate — these are a positive control
 * on the WALKER, never a ratchet on how many pages must offer Homebrew.
 */
export const MIN_HOMEBREW_SURFACES = 3;
export const MIN_HOMEBREW_BANNERS = 4;

/**
 * Assert the Homebrew platform claim over one file's text.
 * @returns {{ inspected: number, errors: string[][] }} errors are message blocks.
 */
export function checkHomebrewPlatform(sectionText) {
  return checkBannerList(homebrewBanners(sectionText));
}

const PLATFORM_LIST = HOMEBREW_PLATFORMS.map((p) => p.name).join(' and ');
const SOURCE_NOTE =
  'The published cask (civitai/homebrew-tap Casks/civitai.rb) has archives for ' +
  `${PLATFORM_LIST}, and the CLI README says so (### Homebrew (macOS and Linux)).`;

/**
 * The banner assertions, over an already-resolved banner list — so the run over
 * discovered surfaces does not re-read and re-walk every file. Three branches:
 * no banner; a banner that omits a platform the cask covers; a banner that
 * narrows with "only".
 * @returns {{ inspected: number, errors: string[][] }} errors are message blocks.
 */
export function checkBannerList(banners) {
  const errors = [];
  for (const { line, banner } of banners) {
    if (banner === null) {
      errors.push([
        `\`brew install civitai/tap/civitai\` (line ${line}) carries NO platform banner.`,
        SOURCE_NOTE,
        `Label it with the platforms, e.g. \`# Homebrew (${PLATFORM_LIST})\`.`,
      ]);
      continue;
    }
    for (const p of HOMEBREW_PLATFORMS) {
      if (!p.re.test(banner)) {
        errors.push([
          `\`brew install civitai/tap/civitai\` (line ${line}) does not name ${p.name}.`,
          `    banner: ${banner.trim()}`,
          SOURCE_NOTE,
          `The banner must name every platform: ${PLATFORM_LIST}.`,
        ]);
      }
    }
    if (NARROWING_RE.test(banner)) {
      errors.push([
        `\`brew install civitai/tap/civitai\` (line ${line}) narrows Homebrew with "only".`,
        `    banner: ${banner.trim()}`,
        SOURCE_NOTE,
        'Drop the "only": no platform the cask covers is an exception.',
      ]);
    }
  }
  return { inspected: banners.length, errors };
}

/**
 * Every line of a Homebrew surface that restricts Homebrew or the cask to macOS
 * — the stale "Homebrew is macOS-only" notes that sit beside a correct banner.
 * Fence state is irrelevant here: a wrong sentence is wrong inside a fenced
 * prompt as well as outside it.
 * @returns {string[][]} message blocks
 */
export function staleNoteErrors(fileText) {
  const errors = [];
  fileText.split('\n').forEach((l, i) => {
    if (HOMEBREW_WORD_RE.test(l) && MACOS_ONLY_RE.test(l)) {
      errors.push([
        `line ${i + 1} restricts Homebrew to macOS.`,
        `    text: ${l.trim()}`,
        SOURCE_NOTE,
      ]);
    }
  });
  return errors;
}

// ---- --upstream: re-derive HOMEBREW_PLATFORMS from the CLI's own sources ----

export const UPSTREAM_CASK_URL = 'https://raw.githubusercontent.com/civitai/homebrew-tap/main/Casks/civitai.rb';
export const UPSTREAM_README_URL = 'https://raw.githubusercontent.com/civitai/cli/main/README.md';

/**
 * The platforms a cask installs on: each `on_macos do` / `on_linux do` block that
 * carries at least one `url`. A block with no url installs nothing, so it does
 * not count. Returned as cask keys (`macos`, `linux`), sorted.
 */
export function caskPlatforms(caskText) {
  const re = /^\s*on_(macos|linux)\s+do\b/gm;
  const starts = [...caskText.matchAll(re)].map((m) => ({ os: m[1], at: m.index }));
  const out = new Set();
  starts.forEach((s, k) => {
    const body = caskText.slice(s.at, k + 1 < starts.length ? starts[k + 1].at : undefined);
    if (/^\s*url\s+"/m.test(body)) out.add(s.os);
  });
  return [...out].sort();
}

/**
 * The platforms the CLI README's Homebrew heading names
 * (`### Homebrew (macOS and Linux)`), as cask keys, sorted. `null` when the
 * heading is absent, which is a different failure from "names nothing".
 * Only platforms HOMEBREW_PLATFORMS knows are recognised, so this side sees the
 * README DROPPING a platform but not adding a new one; the cask side sees both.
 */
export function readmeHomebrewPlatforms(readme) {
  const m = /^###\s+Homebrew\b(.*)$/m.exec(readme);
  if (!m) return null;
  return HOMEBREW_PLATFORMS.filter((p) => p.re.test(m[1])).map((p) => p.cask).sort();
}

const EXPECTED_CASK_KEYS = HOMEBREW_PLATFORMS.map((p) => p.cask).sort();
const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Compare both upstream derivations with HOMEBREW_PLATFORMS.
 * @returns {string[]} error lines; empty means in parity
 */
export function upstreamErrors(caskText, readmeText) {
  const errors = [];
  if (!/^cask\s+"civitai"/m.test(caskText)) {
    errors.push('the cask file does not declare `cask "civitai"`: wrong file, so no verdict on it is trustworthy');
  } else {
    const got = caskPlatforms(caskText);
    if (!sameSet(got, EXPECTED_CASK_KEYS)) {
      errors.push(`the published cask installs on [${got.join(', ')}], HOMEBREW_PLATFORMS says [${EXPECTED_CASK_KEYS.join(', ')}]`);
    }
  }
  const named = readmeHomebrewPlatforms(readmeText);
  if (named === null) {
    errors.push('the CLI README has no `### Homebrew` heading: the extractor is reading the wrong file, or the section moved');
  } else if (!sameSet(named, EXPECTED_CASK_KEYS)) {
    errors.push(`the CLI README's Homebrew heading names [${named.join(', ')}], HOMEBREW_PLATFORMS says [${EXPECTED_CASK_KEYS.join(', ')}]`);
  }
  return errors;
}

/**
 * DETECTOR CONTROL — run on every invocation, before the real pages.
 *
 * 🔴 A GUARD THAT HAS NEVER BEEN WATCHED FAIL PROVES NOTHING, and a mutation run
 * in somebody's terminal proves it for that terminal only. These fixtures make
 * the red path re-provable on EVERY run, and each names the branch it must kill
 * so a mutant cannot die on the wrong assertion and read as covered:
 *   - `macOS only` (the banner every surface carried until 2026-11) must trip
 *     the missing-Linux AND the narrowing branch;
 *   - `macOS only; Linux via Linuxbrew` names both platforms, so ONLY the
 *     narrowing branch can kill it: that proves the branch is reachable alone;
 *   - `Linux` alone trips missing-macOS only, so a mutant that drops the macOS
 *     row from HOMEBREW_PLATFORMS is seen;
 *   - `# Homebrew` alone trips both missing-platform branches;
 *   - the correct banners must stay silent.
 *
 * 🔴 EVERY BRANCH IS EXERCISED IN ALL FOUR BANNER SHAPES. A fixture table that
 * only builds `# comment`-in-fence documents would certify a resolver that is
 * broken for the agent-executed surfaces. The `nested-prose` shape is the one
 * that catches a naive fence toggle inside `agent-setup/index.md`'s ````md block.
 */
const SHAPES = {
  // (1) `#` comment directly above the command, inside the fence — the CLI pages.
  'fence-comment': (banner) => ['## Install', '', '```bash', banner, 'brew install civitai/tap/civitai', '```'],
  // (2) prose above the fence opener — prompt.md / agent-setup/index.md.
  prose: (banner) => ['## Install', '', banner, '', '```bash', 'brew install civitai/tap/civitai', '```'],
  // (3) trailing comment on the command's own line — index.md's by-hand block.
  'same-line': (banner) => ['## Install', '', '```bash', `npm install -g @civitai/cli   ${banner} brew install civitai/tap/civitai`, '```'],
  // (2) again, NESTED inside a four-backtick block — agent-setup/index.md embeds
  // the whole agent prompt that way, and a naive fence toggle makes the command
  // invisible here while the run still prints a confident ✓.
  'nested-prose': (banner) => ['## The prompt', '', '````md', '# Prompt', '', banner, '', '```bash', 'brew install civitai/tap/civitai', '```', '````'],
};

/** Prose below every fixture that names the command — it is not a banner. */
const TRAILING_PROSE = ['', 'Installing a cask on Linux with `brew install civitai/tap/civitai` needs a current Homebrew.'];

// want: the set of branches that must fire — 'macOS' / 'Linux' (missing
// platform), 'narrow'. Each shape carries every branch combination.
const PLATFORM_FIXTURES = [
  { shape: 'fence-comment', banner: '# Homebrew (macOS only — see the note below)', want: ['Linux', 'narrow'] },
  { shape: 'fence-comment', banner: '# Homebrew (macOS only; Linux via Linuxbrew)', want: ['narrow'] },
  { shape: 'fence-comment', banner: '# Homebrew (Linux)', want: ['macOS'] },
  { shape: 'fence-comment', banner: '# Homebrew', want: ['macOS', 'Linux'] },
  { shape: 'fence-comment', banner: '# Homebrew (macOS and Linux)', want: [] },
  { shape: 'fence-comment', banner: '# Homebrew (macOS / Linux)', want: [] },
  { shape: 'prose', banner: 'or, **on macOS only**, with Homebrew:', want: ['Linux', 'narrow'] },
  { shape: 'prose', banner: 'or, on macOS only (and Linux via Linuxbrew), with Homebrew:', want: ['narrow'] },
  { shape: 'prose', banner: 'or, on Linux, with Homebrew:', want: ['macOS'] },
  { shape: 'prose', banner: 'or, with Homebrew:', want: ['macOS', 'Linux'] },
  { shape: 'prose', banner: 'or, on macOS or Linux, with Homebrew:', want: [] },
  { shape: 'same-line', banner: '# or, on macOS only:', want: ['Linux', 'narrow'] },
  { shape: 'same-line', banner: '# or, on macOS only, and on Linux:', want: ['narrow'] },
  { shape: 'same-line', banner: '# or, on Linux:', want: ['macOS'] },
  { shape: 'same-line', banner: '# or:', want: ['macOS', 'Linux'] },
  { shape: 'same-line', banner: '# or, on macOS or Linux:', want: [] },
  { shape: 'nested-prose', banner: 'or, **on macOS only**, with Homebrew:', want: ['Linux', 'narrow'] },
  { shape: 'nested-prose', banner: 'or, on macOS only, and on Linux too:', want: ['narrow'] },
  { shape: 'nested-prose', banner: 'or, on Linux, with Homebrew:', want: ['macOS'] },
  { shape: 'nested-prose', banner: 'or, with Homebrew:', want: ['macOS', 'Linux'] },
  { shape: 'nested-prose', banner: 'or, on macOS or Linux, with Homebrew:', want: [] },
];

/** Notes: the three stale shapes that shipped, plus correct prose that must pass. */
const NOTE_FIXTURES = [
  { text: '::: warning Homebrew is macOS-only', fire: true },
  { text: 'The tap publishes a **cask**, not a formula, and a cask is a macOS-only concept.', fire: true },
  { text: 'or, **on macOS only**, with Homebrew:', fire: true },
  { text: '::: tip Homebrew covers macOS and Linux', fire: false },
  // macOS-only, but about something other than Homebrew: must not fire.
  { text: 'The config lives under `~/Library/Application Support` on macOS only.', fire: false },
];

const CASK_FIXTURE = (blocks) =>
  ['cask "civitai" do', '  version "1.0.0"', ...blocks, '  binary "civitai"', 'end'].join('\n');
const MAC_BLOCK = ['  on_macos do', '    on_arm do', '      url "https://example.invalid/darwin_arm64.tar.gz"', '    end', '  end'];
const LINUX_BLOCK = ['  on_linux do', '    on_intel do', '      url "https://example.invalid/linux_amd64.tar.gz"', '    end', '  end'];
const EMPTY_LINUX_BLOCK = ['  on_linux do', '  end'];

const UPSTREAM_FIXTURES = [
  { name: 'cask with macOS + Linux, README heading names both', cask: CASK_FIXTURE([...MAC_BLOCK, ...LINUX_BLOCK]), readme: '### Homebrew (macOS and Linux)', fire: false },
  { name: 'cask with no on_linux block (darwin-filtered config)', cask: CASK_FIXTURE(MAC_BLOCK), readme: '### Homebrew (macOS and Linux)', fire: true },
  { name: 'cask whose on_linux block has no url', cask: CASK_FIXTURE([...MAC_BLOCK, ...EMPTY_LINUX_BLOCK]), readme: '### Homebrew (macOS and Linux)', fire: true },
  { name: 'README heading reverted to macOS only', cask: CASK_FIXTURE([...MAC_BLOCK, ...LINUX_BLOCK]), readme: '### Homebrew (macOS only)', fire: true },
  { name: 'README with no Homebrew heading', cask: CASK_FIXTURE([...MAC_BLOCK, ...LINUX_BLOCK]), readme: '### npm (Node)', fire: true },
  { name: 'a file that is not the civitai cask', cask: 'cask "other" do\nend', readme: '### Homebrew (macOS and Linux)', fire: true },
];

function branchesFired(errors) {
  const joined = errors.map((e) => e.join(' ')).join('\n');
  const got = [];
  if (/does not name macOS|carries NO platform banner/.test(joined)) got.push('macOS');
  if (/does not name Linux|carries NO platform banner/.test(joined)) got.push('Linux');
  if (/narrows Homebrew with "only"/.test(joined)) got.push('narrow');
  return got.sort();
}

function runDetectorControl() {
  let fired = 0;
  let silent = 0;
  for (const f of PLATFORM_FIXTURES) {
    const doc = [...SHAPES[f.shape](f.banner), ...TRAILING_PROSE].join('\n');
    const { inspected, errors } = checkHomebrewPlatform(doc);
    // Exactly one fenced command per fixture — if the walker double-counts or
    // picks up the prose mention below the fence, the control fails here.
    if (inspected !== 1) {
      console.error(`  ✗ detector control: ${f.shape} fixture ${JSON.stringify(f.banner)} inspected ${inspected} command(s), want 1`);
      process.exit(1);
    }
    const got = branchesFired(errors);
    if (got.join(',') !== [...f.want].sort().join(',')) {
      console.error(`  ✗ detector control: ${f.shape} fixture ${JSON.stringify(f.banner)}`);
      console.error(`      branches fired=[${got.join(', ')}] want=[${[...f.want].sort().join(', ')}]`);
      process.exit(1);
    }
    if (f.want.length) fired++;
    else silent++;
  }

  // No banner ANYWHERE: the command sits under another command inside the fence,
  // so neither the in-fence comment nor the prose fall-through finds a candidate.
  const noBanner = checkHomebrewPlatform(
    ['## Install', '', '```bash', 'npm install -g @civitai/cli', 'brew install civitai/tap/civitai', '```'].join('\n'),
  );
  if (!noBanner.errors.some((e) => e[0].includes('carries NO platform banner'))) {
    console.error('  ✗ detector control: a brew command with no banner at all did not fire');
    process.exit(1);
  }
  fired++;

  for (const n of NOTE_FIXTURES) {
    if ((staleNoteErrors(n.text).length > 0) !== n.fire) {
      console.error(`  ✗ detector control: stale-note fixture ${JSON.stringify(n.text)} fire=${!n.fire} want=${n.fire}`);
      process.exit(1);
    }
    if (n.fire) fired++;
    else silent++;
  }

  for (const u of UPSTREAM_FIXTURES) {
    if ((upstreamErrors(u.cask, u.readme).length > 0) !== u.fire) {
      console.error(`  ✗ detector control: upstream fixture "${u.name}" fire=${!u.fire} want=${u.fire}`);
      process.exit(1);
    }
    if (u.fire) fired++;
    else silent++;
  }

  console.log(`  ✓ platform detector control: ${fired + silent} fixture(s) exact — ${fired} that MUST fire did, ${silent} that must not stayed silent`);
}

/**
 * `--upstream`: fetch the published cask and the CLI README and compare their
 * platform sets with HOMEBREW_PLATFORMS. 404/410 is RED (a source this names is
 * gone); a network error or other status SKIPS loudly with exit 0, because
 * somebody else's outage is not drift.
 */
async function mainUpstream() {
  console.log('Homebrew platform parity — HOMEBREW_PLATFORMS vs the published cask and the CLI README\n');
  runDetectorControl();
  const texts = [];
  for (const url of [UPSTREAM_CASK_URL, UPSTREAM_README_URL]) {
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    } catch (err) {
      console.log(`\n  SKIPPED: ${url} unreachable (${err.message}); nothing was compared.`);
      return;
    }
    if (res.status === 404 || res.status === 410) {
      console.error(`\n  ✗ ${url} answered HTTP ${res.status}: the source this check names is gone. Repoint it.`);
      process.exit(1);
    }
    if (!res.ok) {
      console.log(`\n  SKIPPED: ${url} answered HTTP ${res.status}; nothing was compared.`);
      return;
    }
    texts.push(await res.text());
  }
  const errors = upstreamErrors(texts[0], texts[1]);
  if (errors.length) {
    console.error('\n--- HOMEBREW PLATFORM DRIFT ---');
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error('\nUpdate HOMEBREW_PLATFORMS and every Homebrew banner and note to what the cask installs on.');
    process.exit(1);
  }
  console.log(`\n  ✓ the published cask and the CLI README both say Homebrew covers ${PLATFORM_LIST}, as HOMEBREW_PLATFORMS does`);
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

  // ---- platform claim, over EVERY surface carrying the command ---------------
  // Runs BEFORE the set comparison reports success, because a set comparison
  // cannot see a platform claim at all: that is the whole point of this half.
  // The surface set is DISCOVERED (see homebrewSurfaces) rather than taken from
  // CLI_PAGES — CLI_PAGES is the two pages a HUMAN reads, and the surface that
  // matters most is the one an AGENT executes unattended.
  let platformFatal = false;
  let bannersInspected = 0;
  const surfaces = homebrewSurfaces();
  for (const { rel, text, banners } of surfaces) {
    const { inspected, errors } = checkBannerList(banners);
    bannersInspected += inspected;
    console.log(`  · ${rel} — ${inspected} Homebrew banner(s)`);
    for (const block of [...errors, ...staleNoteErrors(text)]) {
      console.error(`\n  ✗ ${rel} — ${block[0]}`);
      for (const l of block.slice(1)) console.error(`    ${l}`);
      platformFatal = true;
    }
  }
  if (surfaces.length < MIN_HOMEBREW_SURFACES || bannersInspected < MIN_HOMEBREW_BANNERS) {
    console.error(
      `\n  ✗ found ${bannersInspected} Homebrew banner(s) across ${surfaces.length} surface(s), ` +
        `expected >= ${MIN_HOMEBREW_BANNERS} across >= ${MIN_HOMEBREW_SURFACES}.`,
    );
    console.error('    The walker is reading the wrong tree, or the command string stopped matching.');
    console.error('    A serene "no platform problem" over zero surfaces proves nothing — so this FAILS.');
    platformFatal = true;
  }
  if (platformFatal) {
    console.error('\n--- HOMEBREW PLATFORM CLAIM ---');
    console.error(`\nThese surfaces document the SAME cask, which installs on ${PLATFORM_LIST}. The`);
    console.error('install METHOD SET above is structurally blind to a platform claim: both pages can');
    console.error('restrict Homebrew to macOS and still print "in parity". If the cask itself changed,');
    console.error('`npm run check:cli-install-parity -- --upstream` says how.');
    process.exit(1);
  }
  console.log(
    `\n  ✓ Homebrew is labelled ${PLATFORM_LIST}, unnarrowed, on every surface that offers it ` +
      `(${bannersInspected} banner(s) across ${surfaces.length} surface(s), discovered not listed)`,
  );

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
    if (process.argv.includes('--upstream')) {
      await mainUpstream();
    } else {
      main();
    }
  } catch (err) {
    console.error(`check-cli-install-parity: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  }
}
