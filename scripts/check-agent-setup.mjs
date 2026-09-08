#!/usr/bin/env node
/**
 * check-agent-setup.mjs
 * ---------------------
 * Anti-rot guard for the hosted agent-setup surface.
 *
 * WHAT ROTS, AND WHY NOTHING ELSE CATCHES IT
 * ------------------------------------------
 * `public/agent-setup/prompt.md` is served verbatim at
 * https://developer.civitai.com/agent-setup/prompt.md and read by an agent that
 * will then RUN what it says. It is a hosted file ASSERTING a command surface
 * that lives in another repo. Every other guard here grades generated pages
 * against generated artifacts; this file is neither, so before this script
 * nothing checked the claim at all. The failure is silent in the worst
 * direction: the page keeps serving 200 while the command it names no longer
 * exists, and the agent reports a broken install as the user's problem.
 *
 * FOUR INDEPENDENT CHECKS. All are REPO-LOCAL — they read committed files only,
 * make no network request, and cannot false-fail on someone else's publish,
 * which is the property this repo requires of anything that blocks a PR.
 *
 *   1. COMMAND SURFACE (contract §6). See "WHAT CHECK 1 ACTUALLY COVERS" below —
 *      that heading exists because the sentence that used to sit here ("every
 *      `civitai …` invocation") was WIDER THAN THE CODE, and a description wider
 *      than its implementation is worse than no guard: it stops anyone looking.
 *
 *   2. SINGLE SOURCE. The copy-paste string and every prompt URL advertised on
 *      `agent-setup/index.md` must be byte-identical to the constants in
 *      `.vitepress/agent-setup.mjs`, and the raw prompt must actually exist at
 *      the path those constants advertise.
 *
 *   3. SERVING ROUTE. `nginx.conf` hard-codes the prompt's URL in an exact-match
 *      `location =` block. `PROMPT_PATH` is the declared authority for that URL,
 *      and nothing graded one against the other: changing `PROMPT_PATH` left the
 *      route on the old URL with every check green.
 *
 *   4. INLINE COPY. The landing page renders the prompt's full text so a human
 *      can actually READ it — the raw route is `text/markdown` + `nosniff`, which
 *      a browser offers to SAVE rather than display, on the one link the page's
 *      whole "these instructions are unsigned, read them first" posture rests on.
 *      That copy is GENERATED from the source file; this check grades the
 *      committed region byte-for-byte against what the generator would write
 *      right now. A landing page that quietly disagrees with the file an agent
 *      actually executes is worse than the download dialog it replaced. See
 *      scripts/agent-setup-page.mjs for the mechanism and why it is a fence.
 *
 * WHAT CHECK 1 ACTUALLY COVERS
 * ----------------------------
 * From `public/agent-setup/prompt.md` only (never the landing page):
 *
 *   - EVERY fenced code block, whatever its info string and INCLUDING UNTAGGED
 *     ``` fences. The old extractor took `bash|sh|shell|console` only, so a
 *     command in an untagged fence was invisible; measured, an untagged fence
 *     containing `civitai totally-bogus-command --nonexistent-flag` left this
 *     guard at exit 0. prompt.md is a file of instructions an agent EXECUTES, so
 *     there is no such thing as a decorative fence in it and none is exempt.
 *   - Every pipeline stage of every line in those blocks (`a | b`, `a && b`,
 *     `a; b`), after stripping a `$ ` prompt, a leading `VAR=value` assignment,
 *     and see-through wrappers (`sudo`, `env`, `command`, …). The old extractor
 *     required `civitai` to be the FIRST token, so `sudo civitai
 *     totally-bogus-command` was invisible too.
 *   - Inline code spans, but only those that LOOK like a command line: at least
 *     two whitespace-separated tokens, the first a bare word. That excludes the
 *     filenames and package names prompt.md writes in spans (`block.manifest.json`,
 *     `@civitai/blocks-react`, `AGENTS.md`) without needing a per-name exemption.
 *
 * For each extracted command:
 *   - `civitai …`  — the command path AND every flag must appear in
 *     `appblocks-snapshots/civitai-cli-help.txt`, the committed capture of the
 *     whole cobra tree. A command the CLI does not have is a red check.
 *   - anything else — the binary must be on `ALLOWED_NON_CIVITAI` below.
 *
 * WHY AN ALLOWLIST FOR NON-`civitai` COMMANDS, AND WHY IT FAILS RATHER THAN WARNS
 * -----------------------------------------------------------------------------
 * This file is fetched over the network and executed unattended. Until now
 * nothing looked at its non-`civitai` lines at all: `curl … | sh`, `rm -rf`,
 * `chmod`, a `sudo` anything could be added and every gate stayed green.
 *
 * A DENYLIST cannot work here — it only ever catches the shapes whoever wrote it
 * imagined, and the interesting ones (`wget -O- … | bash`, `sh -c …`,
 * `python -c …`, `npx some-installer`) are unbounded. An allowlist is
 * deterministic and fails CLOSED: the legitimate set today is exactly two
 * entries, both of which install the CLI, and adding a third is a one-line diff
 * in this file that a reviewer is forced to look at. That review moment IS the
 * feature. It FAILS rather than warns for the same reason: a warning in a CI log
 * nobody reads is the state we are already in.
 *
 * The allowlist deliberately does not model arguments — `npm` is allowed, so
 * `npm install -g anything` is allowed. It is a gate on which third-party tools
 * this hosted file may invoke, not a sandbox.
 *
 * KNOWN RESIDUALS, stated so nobody reads this guard as wider than it is:
 *   - Non-`civitai` commands in INLINE spans of fewer than two tokens are not
 *     examined (that is the rule that keeps `block.manifest.json` from being
 *     read as a command).
 *   - Command SUBSTITUTION and here-docs are not parsed; a `civitai` invocation
 *     hidden inside `$(…)` is not extracted.
 *   - A bare argument that happens to look like a subcommand still extends the
 *     command path, so `civitai download my-model` would false-red. That fails
 *     CLOSED and the remedy is to write the example with a flag or a
 *     non-identifier argument. Resolving it against the snapshot instead was
 *     rejected: longest-prefix resolution would let `civitai app <anything>`
 *     pass, which is a hole, not a fix.
 *
 * SEQUENCING NOTE — check 1 is EXPECTED to be red until civitai/cli ships
 * `civitai agent-setup` and this repo re-captures the snapshot
 * (`node scripts/gen-appblocks-cli.mjs --write-snapshot`). That red is the
 * intended signal, not a bug in the guard, and it is why this check must not
 * join the REQUIRED contexts on `main` until the CLI half has landed.
 *
 * USAGE
 *   npm run check:agent-setup
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LANDING_PAGE,
  PROMPT_PATH,
  PROMPT_SOURCE,
  PROMPT_URL,
  SITE_ORIGIN,
  SETUP_PROMPT,
} from '../.vitepress/agent-setup.mjs';
import {
  REFRESH_CMD,
  locateRegion,
  regionBlock,
  renderPromptRegion,
} from './agent-setup-page.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(repoRoot, 'appblocks-snapshots', 'civitai-cli-help.txt');
const NGINX_CONF = 'nginx.conf';

/**
 * The third-party binaries `public/agent-setup/prompt.md` is allowed to tell an
 * agent to run. Adding an entry is a deliberate, reviewable decision — see the
 * header for why this is an allowlist and not a denylist.
 */
const ALLOWED_NON_CIVITAI = new Map([
  ['npm', 'step 2 — installs the CLI from the npm registry'],
  ['brew', 'step 2 — installs the CLI from the Homebrew tap'],
]);

/**
 * Wrappers we look THROUGH to find the real command. Being here does not make a
 * wrapper allowed: `sudo` is seen through so that `sudo civitai bogus` still
 * reports the bogus command, and is ALSO reported itself because it is not in
 * ALLOWED_NON_CIVITAI.
 */
const SEE_THROUGH = new Set(['sudo', 'doas', 'env', 'command', 'exec', 'time', 'nohup']);

/** A cobra subcommand name. Anything else after `civitai` is an ARGUMENT. */
const SUBCOMMAND = /^[a-z][a-z0-9-]*$/;

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * Every fenced block in `md`, whatever its info string — including untagged
 * fences, which is the gap that let a bogus command through.
 *
 * @returns {{ tag: string, body: string }[]}
 */
export function fencedBlocks(md) {
  const out = [];
  for (const m of md.matchAll(/^(`{3,}|~{3,})[ \t]*([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm)) {
    out.push({ tag: (m[2].trim().split(/\s+/)[0] ?? '').toLowerCase(), body: m[3] });
  }
  return out;
}

/** Minimal quote-aware tokeniser. Quoted runs stay one token. */
export function tokenize(s) {
  return [...s.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/**
 * One shell line -> its pipeline stages, as token arrays, with `$ ` prompts,
 * trailing comments, leading `VAR=value` assignments and see-through wrappers
 * removed.
 *
 * @returns {{ tokens: string[], wrappers: string[] }[]}
 */
export function commandStages(line) {
  let s = line.replace(/^\s*\$\s+/, '').trim();
  if (!s || s.startsWith('#')) return [];
  s = s.replace(/\s+#\s.*$/, '').trim(); // trailing comment; `\s#` so a URL fragment survives
  if (!s) return [];

  const stages = [];
  for (const raw of s.split(/\s*(?:\|\||&&|\||;)\s*/)) {
    let tokens = tokenize(raw.trim()).filter(Boolean);
    const wrappers = [];
    // Leading environment assignments: `CIVITAI_TOKEN=x civitai …`.
    while (tokens.length && ASSIGNMENT.test(tokens[0])) tokens = tokens.slice(1);
    // See-through wrappers, plus their own flags/assignments.
    while (tokens.length && SEE_THROUGH.has(tokens[0])) {
      wrappers.push(tokens[0]);
      tokens = tokens.slice(1);
      while (tokens.length && (tokens[0].startsWith('-') || ASSIGNMENT.test(tokens[0]))) {
        tokens = tokens.slice(1);
      }
    }
    if (tokens.length) stages.push({ tokens, wrappers });
  }
  return stages;
}

/** Split a `civitai …` token list into its command path and its flags. */
function splitCivitai(tokens) {
  const path = [];
  const flags = [];
  let inFlags = false;
  let sawArgument = false;
  for (const t of tokens.slice(1)) {
    if (t === '--') {
      inFlags = true;
      continue;
    }
    if (t.startsWith('-')) {
      inFlags = true;
      // `--track=app` and `--track app` are the same flag.
      flags.push(t.split('=')[0]);
      continue;
    }
    // A bare word after a flag is that flag's VALUE (`--track app`), not a
    // subcommand. A bare word that is not a valid subcommand NAME is a
    // positional argument, and so is everything bare after it — that is what
    // stops `civitai app validate ./my-app --json` from demanding a
    // `civitai app validate ./my-app` node.
    if (!inFlags && !sawArgument && SUBCOMMAND.test(t)) path.push(t);
    else sawArgument = true;
  }
  return { path, flags };
}

/**
 * Every command `public/agent-setup/prompt.md` tells an agent to run.
 *
 * @returns {{ civitai: {path: string[], flags: string[], raw: string}[],
 *             foreign: {binary: string, raw: string, where: string}[] }}
 */
export function extractInvocations(md) {
  /** @type {{source: string, raw: string, fenced: boolean}[]} */
  const lines = [];

  for (const { tag, body } of fencedBlocks(md)) {
    const where = tag ? `\`\`\`${tag} block` : 'untagged ``` block';
    // Join backslash continuations so `foo \\\n  --bar` is one command.
    for (const raw of body.replace(/\\\n\s*/g, ' ').split('\n')) {
      if (raw.trim()) lines.push({ source: where, raw, fenced: true });
    }
  }

  for (const m of md.matchAll(/`([^`\n]+)`/g)) {
    const span = m[1].trim();
    const tokens = span.split(/\s+/).filter(Boolean);
    // Prose spans are filenames and package names. A span is only read as a
    // command when it has an argument and starts with a bare word.
    if (tokens.length < 2 || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(tokens[0])) continue;
    lines.push({ source: 'inline code span', raw: span, fenced: false });
  }

  const civitai = [];
  const foreign = [];
  const seenCivitai = new Set();
  const seenForeign = new Set();

  for (const { source, raw } of lines) {
    for (const { tokens, wrappers } of commandStages(raw)) {
      for (const w of wrappers) {
        const key = `${w}␟${source}`;
        if (!seenForeign.has(key)) {
          seenForeign.add(key);
          foreign.push({ binary: w, raw: raw.trim(), where: source });
        }
      }
      if (tokens[0] === 'civitai') {
        const { path, flags } = splitCivitai(tokens);
        // U+241F (SYMBOL FOR UNIT SEPARATOR) — a PRINTABLE separator. This used
        // to be a raw NUL, which made git classify this whole file as binary:
        // `gh pr diff` rendered it as "Binary files differ", so the guard was
        // invisible in review and to `git grep`.
        const key = `${path.join(' ')}␟${flags.join(' ')}`;
        if (seenCivitai.has(key)) continue;
        seenCivitai.add(key);
        civitai.push({ path, flags, raw: tokens.join(' ') });
      } else {
        const key = `${tokens[0]}␟${source}`;
        if (seenForeign.has(key)) continue;
        seenForeign.add(key);
        foreign.push({ binary: tokens[0], raw: raw.trim(), where: source });
      }
    }
  }
  return { civitai, foreign };
}

/**
 * The `--help` body of one node in the snapshot. Nodes are delimited by
 * `===CMD <path>===` (root is `(root)`); the following `===CMD complete <path>===`
 * block is a separate node and ends this one.
 *
 * The marker is accepted at byte 0 as well as after a newline: requiring the
 * leading `\n` meant a snapshot whose FIRST line is `===CMD (root)===` could
 * never resolve its root node.
 *
 * @returns {string|null} null when the command does not exist in the snapshot.
 */
export function helpBody(snapshot, path) {
  const name = path.length ? path.join(' ') : '(root)';
  const marker = `===CMD ${name}===`;
  let from;
  if (snapshot.startsWith(`${marker}\n`)) {
    from = marker.length + 1;
  } else {
    const at = snapshot.indexOf(`\n${marker}\n`);
    if (at === -1) return null;
    from = at + marker.length + 2;
  }
  const next = snapshot.indexOf('\n===CMD ', from);
  return next === -1 ? snapshot.slice(from) : snapshot.slice(from, next);
}

/** Whole-token match, so `--json` never satisfies itself via `--jsonl`. */
const mentionsFlag = (body, flag) =>
  new RegExp(`(?<![\\w-])${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(body);

function checkCommandSurface() {
  const failures = [];
  if (!existsSync(SNAPSHOT)) {
    failures.push(
      'appblocks-snapshots/civitai-cli-help.txt is MISSING — re-capture with\n' +
        '    node scripts/gen-appblocks-cli.mjs --write-snapshot',
    );
    return failures;
  }
  const snapshot = readFileSync(SNAPSHOT, 'utf8');
  const prompt = readFileSync(join(repoRoot, PROMPT_SOURCE), 'utf8');
  const { civitai, foreign } = extractInvocations(prompt);
  if (civitai.length === 0) {
    // Positive control against a silently-zero extractor: prompt.md has always
    // named at least `civitai agent-setup`, so an empty result means the parser
    // broke, not that the prompt got safer.
    failures.push(`${PROMPT_SOURCE} yielded 0 \`civitai …\` invocations — the extractor is broken`);
    return failures;
  }
  console.log(`  ${civitai.length} \`civitai …\` invocation(s) asserted by ${PROMPT_SOURCE}:`);
  for (const inv of civitai) {
    const name = inv.path.length ? `civitai ${inv.path.join(' ')}` : 'civitai (root)';
    const body = helpBody(snapshot, inv.path);
    if (body === null) {
      failures.push(
        `\`${inv.raw}\` — command \`${name}\` is NOT in the CLI help snapshot.\n` +
          `    prompt.md tells an agent to run a command this CLI does not publish.`,
      );
      continue;
    }
    const missing = inv.flags.filter((f) => !mentionsFlag(body, f));
    if (missing.length) {
      failures.push(
        `\`${inv.raw}\` — \`${name}\` exists, but its --help does not mention ${missing.join(', ')}`,
      );
      continue;
    }
    console.log(`    ✓ ${inv.raw}`);
  }

  console.log(`  ${foreign.length} non-\`civitai\` command(s) asserted by ${PROMPT_SOURCE}:`);
  for (const f of foreign) {
    if (ALLOWED_NON_CIVITAI.has(f.binary)) {
      console.log(`    ✓ ${f.binary} — ${ALLOWED_NON_CIVITAI.get(f.binary)}`);
      continue;
    }
    failures.push(
      `\`${f.raw}\` (${f.where}) — \`${f.binary}\` is not an allowed non-\`civitai\` command.\n` +
        `    ${PROMPT_SOURCE} is fetched over the network and executed UNATTENDED by an agent, so\n` +
        `    every third-party binary it invokes is an explicit, reviewed decision. If this one is\n` +
        `    genuinely intended, add it to ALLOWED_NON_CIVITAI in scripts/check-agent-setup.mjs with\n` +
        `    a one-line reason — that diff is the review moment this check exists to force.`,
    );
  }
  return failures;
}

/**
 * Every absolute URL on a page, with trailing sentence punctuation trimmed.
 * Markdown link syntax (`[text](url)`) yields the label and the target
 * separately, which is deliberate: they can disagree, and that disagreement is
 * exactly the defect this feeds.
 */
export function absoluteUrls(page) {
  return [...page.matchAll(/https?:\/\/[^\s)\]}"'`<>]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ''));
}

/**
 * A URL that CLAIMS to be the raw prompt: it is served from this site's
 * `/agent-setup/` area, or it points at a `prompt.md` on any host. The second
 * half is what catches an off-origin swap — measured, repointing the "Read it
 * first" link to `https://evil.example.com/prompt.md` left the old check green.
 */
export function promptClaimingUrls(page) {
  return absoluteUrls(page).filter((u) => {
    if (u.startsWith(`${SITE_ORIGIN}/agent-setup/`)) return true;
    try {
      return new URL(u).pathname.endsWith('/prompt.md');
    } catch {
      return false;
    }
  });
}

// MEASURED on agent-setup/index.md at 6323f4f: three — the copy-paste fence,
// and the markdown link's label and target. A floor, not an equality: adding a
// legitimate second link to the prompt is fine, and every one of them is
// checked. Its only job is to reject a page that stopped linking the prompt at
// all, which the every-URL-matches assertion below would otherwise pass
// vacuously over an empty set.
const PROMPT_URL_FLOOR = 3;

function checkSingleSource() {
  const failures = [];
  const page = readFileSync(join(repoRoot, LANDING_PAGE), 'utf8');
  if (!page.includes(SETUP_PROMPT)) {
    failures.push(
      `${LANDING_PAGE} does not carry the copy-paste string verbatim. Expected:\n` +
        `      ${SETUP_PROMPT}\n` +
        `    Update the page, or change SETUP_PROMPT in .vitepress/agent-setup.mjs — the\n` +
        `    constant is the authority and this check is what keeps the two from drifting.`,
    );
  }

  // 🔴 NOT `page.includes(PROMPT_URL)`. That assertion was VACUOUS: SETUP_PROMPT
  // CONTAINS PROMPT_URL, so it was strictly implied by the check above and could
  // never fail on its own. Measured — the "Read it first" link was repointed at
  // https://evil.example.com/prompt.md and this guard stayed green.
  //
  // The replacement grades EVERY prompt-claiming URL on the page, and counts
  // them, so an ADDED wrong one fails as loudly as a changed one.
  const claiming = promptClaimingUrls(page);
  const wrong = claiming.filter((u) => u !== PROMPT_URL);
  if (wrong.length) {
    failures.push(
      `${LANDING_PAGE} advertises ${wrong.length} prompt URL(s) that are not ${PROMPT_URL}:\n` +
        wrong.map((u) => `      ${u}`).join('\n') +
        `\n    PROMPT_URL in .vitepress/agent-setup.mjs is the authority. Every link on this page\n` +
        `    that points at a prompt.md, or anywhere under ${SITE_ORIGIN}/agent-setup/, must be\n` +
        `    that exact string — a link that reads right and points elsewhere is the whole\n` +
        `    failure mode of a page whose job is to tell you what you are about to execute.`,
    );
  }
  if (claiming.length < PROMPT_URL_FLOOR) {
    failures.push(
      `${LANDING_PAGE} carries only ${claiming.length} reference(s) to the raw prompt (floor ${PROMPT_URL_FLOOR}, ` +
        `measured 3: the copy-paste fence, and the "Read it first" link's label and target).\n` +
        `    A page that stopped linking the prompt would otherwise satisfy the every-URL-matches\n` +
        `    assertion above over an empty set.`,
    );
  }

  if (!failures.length) {
    console.log(
      `  ✓ ${LANDING_PAGE} advertises ${PROMPT_URL} verbatim, and all ${claiming.length} of its ` +
        `prompt references agree`,
    );
  }
  return failures;
}

function checkServingRoute() {
  const failures = [];
  const confPath = join(repoRoot, NGINX_CONF);
  if (!existsSync(confPath)) {
    failures.push(`${NGINX_CONF} is missing — the verbatim prompt route lives there`);
    return failures;
  }
  const conf = readFileSync(confPath, 'utf8');

  // Exact-match locations, which is what the prompt route must be: it has to
  // beat both regex locations and the cleanUrls try_files.
  const exact = [...conf.matchAll(/^\s*location\s*=\s*(\S+)\s*\{/gm)].map((m) => m[1]);
  if (!exact.includes(PROMPT_PATH)) {
    failures.push(
      `${NGINX_CONF} has no \`location = ${PROMPT_PATH} {\` block.\n` +
        `    PROMPT_PATH in .vitepress/agent-setup.mjs is the authority for that URL, and nothing\n` +
        `    else grades the two against each other — changing PROMPT_PATH without changing this\n` +
        `    file leaves the exact-match route serving the OLD URL with every other check green.\n` +
        `    Exact-match locations found: ${exact.length ? exact.join(', ') : '(none)'}`,
    );
  }

  // Any OTHER /agent-setup/ path in the config is a leftover from a rename.
  const stray = [...new Set([...conf.matchAll(/\/agent-setup\/[A-Za-z0-9._/-]*/g)].map((m) => m[0]))].filter(
    (p) => p !== PROMPT_PATH,
  );
  if (stray.length) {
    failures.push(
      `${NGINX_CONF} names ${stray.length} \`/agent-setup/\` path(s) that are not PROMPT_PATH ` +
        `(${PROMPT_PATH}):\n` +
        stray.map((p) => `      ${p}`).join('\n') +
        `\n    Left behind by a rename. Delete them or point them at PROMPT_PATH.`,
    );
  }

  if (!failures.length) {
    console.log(`  ✓ ${NGINX_CONF} serves PROMPT_PATH (${PROMPT_PATH}) from an exact-match location`);
  }
  return failures;
}

/** First differing line, so the error points at something rather than a blob. */
function firstDiff(expected, actual) {
  const e = expected.split('\n');
  const a = actual.split('\n');
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if (e[i] !== a[i]) {
      return { line: i + 1, expected: e[i] ?? '(end of region)', actual: a[i] ?? '(end of region)' };
    }
  }
  return null;
}

function checkInlineCopy() {
  const failures = [];
  const page = readFileSync(join(repoRoot, LANDING_PAGE), 'utf8');
  const prompt = readFileSync(join(repoRoot, PROMPT_SOURCE), 'utf8');
  const expected = regionBlock(renderPromptRegion(prompt));

  let actual;
  try {
    ({ block: actual } = locateRegion(page));
  } catch (err) {
    failures.push(
      `${LANDING_PAGE} — ${err.message}.\n` +
        `    The inline copy of the prompt is what a human READS before pasting the one-liner;\n` +
        `    the raw route is served as text/markdown, which a browser saves instead of showing.\n` +
        `    Restore the markers and run \`${REFRESH_CMD}\`.`,
    );
    return failures;
  }

  if (actual !== expected) {
    const d = firstDiff(expected, actual);
    failures.push(
      `${LANDING_PAGE}'s inline copy has DRIFTED from ${PROMPT_SOURCE}.\n` +
        (d
          ? `    first difference at region line ${d.line}:\n` +
            `      committed: ${JSON.stringify(d.actual)}\n` +
            `      generated: ${JSON.stringify(d.expected)}\n`
          : `    the region differs only in trailing whitespace.\n`) +
        `    The page is telling a reader something other than what the file an agent executes\n` +
        `    says — the exact failure the inline copy exists to prevent. Re-generate and commit:\n\n` +
        `        ${REFRESH_CMD}\n\n` +
        `    Do NOT hand-edit the region: it is overwritten, and the generator is the only thing\n` +
        `    keeping the two in sync.`,
    );
  }

  if (!failures.length) {
    console.log(
      `  ✓ ${LANDING_PAGE} renders ${PROMPT_SOURCE} inline, byte-for-byte ` +
        `(${prompt.split('\n').length} lines)`,
    );
  }
  return failures;
}

function main() {
  console.log('agent-setup surface — prompt.md vs the CLI help snapshot, and the page vs its constants\n');
  // FIRST, and not folded into checkSingleSource: both halves READ this file, so
  // an absent prompt has to be an actionable failure here rather than an
  // unhandled ENOENT thrown out of the reader further down. Measured — it was
  // exactly that until the mutation battery moved the file.
  if (!existsSync(join(repoRoot, PROMPT_SOURCE))) {
    console.error(
      `\n❌ agent-setup guard — the prompt source is missing.\n\n` +
        `  ✗ ${PROMPT_SOURCE} does not exist. PROMPT_PATH advertises ${PROMPT_PATH}, but nothing\n` +
        `    is shipped there. ONLY files under public/ are copied verbatim into the build\n` +
        `    output; a prompt moved anywhere else is rendered into HTML by VitePress and the\n` +
        `    raw route 404s or serves markup. Put it back, or change PROMPT_PATH.\n`,
    );
    process.exit(1);
  }

  // Each check reports its OWN verdict. Sharing one `failures` array meant
  // check 2's success line was gated on check 1 passing, so on the real red run
  // an operator could not tell whether check 2 had even run.
  const checks = [
    ['1. command surface', checkCommandSurface],
    ['2. single source', checkSingleSource],
    ['3. serving route', checkServingRoute],
    ['4. inline copy', checkInlineCopy],
  ];
  const failures = [];
  for (const [label, fn] of checks) {
    const own = fn();
    failures.push(...own);
    console.log(own.length ? `  ✗ check ${label}: ${own.length} problem(s)\n` : `  ✓ check ${label}\n`);
  }

  if (failures.length) {
    console.error(`\n❌ agent-setup guard — ${failures.length} problem(s):\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    console.error(
      'If the CLI genuinely gained or renamed a command, re-capture the snapshot with a\n' +
        'current binary and commit it:\n\n' +
        '    node scripts/gen-appblocks-cli.mjs --write-snapshot\n\n' +
        'Do NOT soften this guard to make it pass: a green run here is the only thing\n' +
        'asserting that the hosted prompt names commands that exist.\n',
    );
    process.exit(1);
  }
  console.log('\n✓ agent-setup surface is coherent.');
}

main();
