// Generate public/appblocks/messages.json — the full postMessage bridge protocol.
//
// Sources:
//   - payload shapes + directions: parse the PUBLISHED, pinned @civitai/app-sdk
//     dist/blocks/messages.d.ts with ts-morph (ParentToBlockMessage +
//     BlockToParentMessage are hand-written discriminated `{ type; payload }`
//     unions, so the .d.ts AST is the reliable route).
//   - direction / page-only / request-reply pairing for block->host messages:
//     the civitai host mirror src/components/AppBlocks/hostHandlerParity.ts
//     INVENTORY (a machine-readable Record<name, MessageSpec>).
//
// A block->host message is "page-only" when its INVENTORY entry marks the model
// slot host (IframeHost) N/A (a reason string) while PageBlockHost is 'required'.
import { Project } from 'ts-morph';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dedent, log, readCivitaiSource, resolvePackageRoot, writeArtifact } from './appblocks-util.mjs';

// ── families ────────────────────────────────────────────────────────────────
const FAMILY_RULES = [
  ['viewer', /^GET_VIEWER$|^VIEWER_RESULT$/],
  ['subqueue', /^QUERY_APP_WORKFLOWS$|^CANCEL_APP_WORKFLOW$|^APP_WORKFLOWS_RESULT$|^CANCEL_APP_WORKFLOW_RESULT$/],
  ['workflow', /WORKFLOW|ESTIMATE/],
  ['buzz', /BUZZ|DAILY_COMPENSATION/],
  ['pickers', /PICKER|CHECKPOINT|IMAGE_UPLOAD|IMAGE_SCAN/],
  ['shared', /^SHARED_/],
  ['storage', /^APP_STORAGE_/],
  ['wildcard', /WILDCARD/],
  ['auth', /TOKEN|SIGN_IN|CONSENT/],
  ['lifecycle', /^(BLOCK_INIT|BLOCK_READY|BLOCK_ERROR|RESIZE_IFRAME|NAVIGATE|TRACK_EVENT|SUSPEND|RESUME)$/],
];
function familyOf(name) {
  for (const [fam, re] of FAMILY_RULES) if (re.test(name)) return fam;
  return 'other';
}

// ── parse the SDK message unions ──────────────────────────────────────────────
// Resolve the installed @civitai/app-sdk root lazily so that merely IMPORTING
// this module (e.g. from the test harness to exercise parseInventory) has no
// side effects and no hard dependency on the SDK being installed.
let _sdkRoot;
export function getSdkRoot() {
  return (_sdkRoot ??= resolvePackageRoot('@civitai/app-sdk'));
}

export function resolveMessagesDts() {
  // The package `exports` map doesn't expose raw .d.ts subpaths, so resolve via
  // the package root on disk.
  return join(getSdkRoot(), 'dist', 'blocks', 'messages.d.ts');
}

/** Parse the SDK's block->host (`BlockToParentMessage`) union into names. */
export function loadSdkBlockToParent() {
  const dtsPath = resolveMessagesDts();
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  const sf = project.addSourceFileAtPath(dtsPath);
  return parseUnion(sf, 'BlockToParentMessage', 'block-to-host');
}

/** Parse the SDK's host->block (`ParentToBlockMessage`) union into names. */
export function loadSdkParentToBlock() {
  const dtsPath = resolveMessagesDts();
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  const sf = project.addSourceFileAtPath(dtsPath);
  return parseUnion(sf, 'ParentToBlockMessage', 'host-to-block');
}

/**
 * RESOLUTION relation the generator hard-fails on: every `reply` an INVENTORY entry
 * names must be a published SDK host->block message. Returns `NAME -> "reply"` strings
 * for the ones that do NOT (empty array == healthy). Exported so the regression test
 * asserts the exact same relation the generator's guard uses.
 */
export function findUnresolvedReplies(inventory, parentToBlock) {
  const known = new Set(parentToBlock.map((m) => (typeof m === 'string' ? m : m.name)));
  return Object.entries(inventory)
    .filter(([, inv]) => inv.reply && !known.has(inv.reply))
    .map(([name, inv]) => `${name} -> ${JSON.stringify(inv.reply)}`);
}

/**
 * COVERAGE relation the drift guard enforces: every published SDK block->host
 * message name MUST resolve to a parsed INVENTORY entry. Returns the names that
 * do NOT (empty array == healthy). Exported so the regression test asserts the
 * exact same relation the generator's hard-fail guard uses.
 */
export function findUncoveredMessages(blockToParent, inventory) {
  return blockToParent
    .map((m) => (typeof m === 'string' ? m : m.name))
    .filter((name) => !inventory[name]);
}

export function parseUnion(sourceFile, aliasName, direction) {
  const alias = sourceFile.getTypeAlias(aliasName);
  if (!alias) throw new Error(`type alias ${aliasName} not found in messages.d.ts`);
  const node = alias.getTypeNode();
  // Union of type-literals, OR a single type-literal.
  const members =
    node.getKindName() === 'UnionType' ? node.getTypeNodes() : [node];
  const out = [];
  for (const lit of members) {
    const typeProp = lit.getProperty?.('type');
    const payloadProp = lit.getProperty?.('payload');
    if (!typeProp) continue;
    const rawType = typeProp.getTypeNodeOrThrow().getText();
    const name = rawType.replace(/^['"`]|['"`]$/g, '');
    let payload = null;
    let payloadOptional = false;
    if (payloadProp) {
      payloadOptional = payloadProp.hasQuestionToken();
      const pt = payloadProp.getTypeNode();
      const txt = pt ? pt.getText() : null;
      payload = txt && txt !== 'undefined' ? dedent(txt) : null;
    }
    out.push({ name, direction, payload, payloadOptional });
  }
  return out;
}

// ── parse INVENTORY (host parity) for block->host flags ──────────────────────
//
// The parser is deliberately INDENTATION-AGNOSTIC. An earlier version hard-coded
// 2-space indentation for the entry key + closing brace; reindenting
// hostHandlerParity.ts (e.g. 2-space -> 4-space) would then silently parse ZERO
// entries. Because the SDK message union still yields message names, the
// `messages.length === 0` guard would NOT trip, and we would emit a
// plausible-but-WRONG messages.json (all request/reply/page-only flags lost,
// replies mis-promoted to host->block pushes). The coverage + flag assertions
// below (see the `assert*` block after the call site) turn that failure mode
// into a hard build error instead.

/**
 * Return the substring between the `{` at `openIdx` and its matching `}`
 * (exclusive of the braces), skipping braces that appear inside quoted strings
 * AND inside `//` line / `/* *​/` block comments. Robust to reformatting, to N/A
 * reason strings, and — the reason comment-awareness is load-bearing — to an
 * APOSTROPHE inside a comment (e.g. `// the doc's note`, `entityType:'none'`):
 * without skipping comments, a lone `'` in a comment opens a phantom string that
 * swallows the entry's closing `}`, silently DROPPING the INVENTORY entry. That
 * bit SET_USER_CHECKPOINT (a comment with `doc's` + `entityType:'none'`) the
 * moment it became a published block→host message, which then read as a false
 * "stale snapshot". Comment-awareness makes the brace-match correct regardless.
 */
export function extractBraced(text, openIdx) {
  let depth = 0;
  let quote = null; // active string delimiter, or null
  let line = false; // inside a // comment
  let block = false; // inside a /* */ comment
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    const nx = text[i + 1];
    if (line) {
      if (ch === '\n') line = false;
      continue;
    }
    if (block) {
      if (ch === '*' && nx === '/') { block = false; i++; }
      continue;
    }
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && nx === '/') { line = true; i++; continue; }
    if (ch === '/' && nx === '*') { block = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(openIdx + 1, i);
    }
  }
  return null;
}

/**
 * Split a raw INVENTORY `reply:` value into the MESSAGE TYPE and a free-prose
 * CAVEAT.
 *
 * WHY THIS EXISTS — upstream declared `reply` DOCUMENTATION ONLY. hostHandlerParity.ts's
 * own MessageSpec docblock now says, in as many words, that "NOTHING ENFORCES THIS
 * STRING", that the host parity test only interpolates it into a test NAME, and that
 * behavioural claims belong in the browser tests. This repo is the one consumer that
 * reads it as MACHINE-READABLE: the value is looked up in the SDK's host->block union
 * to attach `replyPayload`, and any name it matches is suppressed from the
 * unsolicited-push list. So the moment upstream appended prose to one —
 *
 *   reply: 'TOKEN_REFRESH_RESPONSE (or a TOKEN_REFRESH push when no requestId was sent)'
 *
 * — a verbatim read silently (a) dropped REQUEST_TOKEN's reply payload shape from the
 * reference, (b) rendered a whole sentence inside the `reply <code>` chip, and
 * (c) re-promoted TOKEN_REFRESH_RESPONSE to a standalone "host -> block" PUSH, which is
 * precisely the "replies mis-promoted to host->block pushes" failure the parser comment
 * above warns about. Nothing was red; the docs were just wrong.
 *
 * Upstream is within its rights — it owns the field and told us it is prose — so the
 * fix belongs HERE: parse the leading SCREAMING_SNAKE token as the type, keep the rest
 * as `replyNote` for display. A value with no leading type token is returned verbatim
 * with no note, so the reply-resolution guard in main() reports it rather than this
 * helper guessing.
 *
 * @param {string} raw
 * @returns {{ reply: string, replyNote: string | null }}
 */
export function splitReply(raw) {
  if (!raw) return { reply: '', replyNote: null };
  const m = raw.match(/^\s*([A-Z][A-Z0-9_]*)\s*([\s\S]*)$/);
  if (!m) return { reply: raw.trim(), replyNote: null };
  let note = m[2].trim();
  // Strip one wrapping paren pair: `(or a TOKEN_REFRESH push when …)`.
  if (note.startsWith('(') && note.endsWith(')')) note = note.slice(1, -1).trim();
  return { reply: m[1], replyNote: note || null };
}

export function parseInventory(ts) {
  const start = ts.indexOf('export const INVENTORY');
  if (start < 0) return {};
  const region = ts.slice(start);
  const out = {};
  // Indentation-agnostic: an uppercase entry key at a line start (any leading
  // whitespace) followed by `: {`. We then brace-match the body rather than
  // relying on a fixed-indent closing-brace pattern.
  const keyRe = /^[ \t]*([A-Z][A-Z0-9_]+)\s*:\s*\{/gm;
  let m;
  while ((m = keyRe.exec(region)) !== null) {
    const name = m[1];
    if (name === 'INLINE_STUB') continue;
    const openIdx = region.indexOf('{', m.index);
    const body = extractBraced(region, openIdx);
    if (body == null) continue;
    const request = /request:\s*true/.test(body);
    const replyM = body.match(/reply:\s*(['"`])(.*?)\1/);
    // `reply` is upstream-declared free prose; take the leading type, keep the
    // rest as a display note (see splitReply).
    const { reply, replyNote } = splitReply(replyM ? replyM[2] : '');
    const iframeM = body.match(/IframeHost:\s*(?:(?:'([^']*)')|(?:"([^"]*)")|([A-Za-z_]+))/);
    const pageM = body.match(/PageBlockHost:\s*(?:(?:'([^']*)')|(?:"([^"]*)")|([A-Za-z_]+))/);
    const iframeVal = iframeM ? (iframeM[1] ?? iframeM[2] ?? iframeM[3]) : '';
    const pageVal = pageM ? (pageM[1] ?? pageM[2] ?? pageM[3]) : '';
    const pageOnly = pageVal === 'required' && iframeVal !== 'required';
    out[name] = { request, reply, replyNote, pageOnly, iframeNote: iframeVal === 'required' ? null : iframeVal };
  }
  return out;
}

// Family display order.
const FAMILY_ORDER = [
  'lifecycle', 'auth', 'workflow', 'subqueue', 'buzz', 'viewer',
  'pickers', 'storage', 'shared', 'wildcard', 'other',
];

function main() {
  const sdkRoot = getSdkRoot();
  const dtsPath = resolveMessagesDts();
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  const sf = project.addSourceFileAtPath(dtsPath);

  const parentToBlock = parseUnion(sf, 'ParentToBlockMessage', 'host-to-block');
  const blockToParent = parseUnion(sf, 'BlockToParentMessage', 'block-to-host');

  const invSrc = readCivitaiSource(
    'src/components/AppBlocks/hostHandlerParity.ts',
    'hostHandlerParity.ts'
  );
  const inventory = parseInventory(invSrc.text);

  // ── DRIFT GUARD (do not remove) ─────────────────────────────────────────────
  // The page-only / request-reply pairing flags come ENTIRELY from the parsed
  // INVENTORY. If the parser silently yields nothing (e.g. hostHandlerParity.ts
  // was reformatted and an over-specific regex stopped matching), the SDK union
  // still produces message names, so the emitted messages.json would be plausible
  // but WRONG. These assertions make any such regression a hard build failure.
  //
  // (1) COVERAGE: every published SDK block->host message MUST resolve to a parsed
  // INVENTORY entry (the host file's own compile-time gate is one-directional the
  // same way — SDK ⊆ INVENTORY). A dropped-entries parse trips this immediately.
  const uncovered = findUncoveredMessages(blockToParent, inventory);
  if (uncovered.length) {
    throw new Error(
      `gen-appblocks-messages: ${uncovered.length} published SDK block->host message(s) missing from the parsed ` +
        `host parity INVENTORY — the parser likely failed to match hostHandlerParity.ts (a reformat/drift). ` +
        `Fix parseInventory or re-copy the snapshot. Missing: ${uncovered.join(', ')}`
    );
  }
  // (2) FLAG SANITY: known-stable entries must resolve with the RIGHT flags, to
  // catch a parser that resolves keys but mangles the body extraction.
  const assertFlags = (name, want) => {
    const inv = inventory[name];
    if (!inv) throw new Error(`gen-appblocks-messages: expected stable INVENTORY entry ${name} not found`);
    for (const [k, v] of Object.entries(want)) {
      const got = k === 'hasReply' ? Boolean(inv.reply) : inv[k];
      if (got !== v) {
        throw new Error(
          `gen-appblocks-messages: INVENTORY flag drift on ${name}.${k} — expected ${v}, parsed ${got}. ` +
            `parseInventory mis-read hostHandlerParity.ts.`
        );
      }
    }
  };
  assertFlags('GET_VIEWER', { pageOnly: true, request: true, hasReply: true });
  assertFlags('GET_BUZZ_BALANCE', { pageOnly: false, request: true, hasReply: true });

  // Build a lookup of host->block replies so we can pair request/reply.
  const replyByName = new Map(parentToBlock.map((m) => [m.name, m]));

  // (3) REPLY RESOLUTION: every `reply` an INVENTORY entry names MUST resolve to a
  // published SDK host->block message. This is the guard the drift that motivated
  // splitReply walked straight past: coverage (1) was fine and the flag sanity
  // sample (2) does not include REQUEST_TOKEN, so a `reply` that had become prose
  // just... stopped resolving. `replyPayload` went null and the orphaned type got
  // re-emitted as an unsolicited push — a plausible, fully-populated, WRONG page.
  // Measured at the time this landed: 36 of 36 replies resolve, so a hard failure
  // here has no false-positive population; an unresolvable reply means the parse is
  // wrong or the snapshot is stale, and both should stop the build rather than
  // quietly publish.
  const unresolvedReplies = findUnresolvedReplies(inventory, parentToBlock);
  if (unresolvedReplies.length) {
    throw new Error(
      `gen-appblocks-messages: ${unresolvedReplies.length} INVENTORY reply value(s) do not name a published SDK ` +
        `host->block message. The reply would lose its payload shape and the named type would be mis-emitted as an ` +
        `unsolicited push. Fix splitReply/parseInventory or re-snapshot hostHandlerParity.ts. ` +
        `Unresolved: ${unresolvedReplies.join(', ')}`
    );
  }

  const messages = [];
  for (const m of blockToParent) {
    const inv = inventory[m.name] ?? {};
    const reply = inv.reply || null;
    messages.push({
      name: m.name,
      family: familyOf(m.name),
      direction: 'block-to-host',
      request: inv.request ?? Boolean(reply),
      reply,
      replyNote: inv.replyNote ?? null,
      replyPayload: reply && replyByName.has(reply) ? replyByName.get(reply).payload : null,
      pageOnly: inv.pageOnly ?? false,
      slotNote: inv.slotNote ?? inv.iframeNote ?? null,
      payload: m.payload,
      payloadOptional: m.payloadOptional,
    });
  }
  // Host->block messages that are NOT a reply to a block->host request (pushes:
  // BLOCK_INIT, TOKEN_REFRESH, SUSPEND, RESUME, IMAGE_SCAN_RESOLVED).
  const pairedReplies = new Set(messages.map((m) => m.reply).filter(Boolean));
  for (const m of parentToBlock) {
    if (pairedReplies.has(m.name)) continue;
    messages.push({
      name: m.name,
      family: familyOf(m.name),
      direction: 'host-to-block',
      request: false,
      reply: null,
      replyNote: null,
      replyPayload: null,
      pageOnly: false,
      slotNote: null,
      payload: m.payload,
      payloadOptional: m.payloadOptional,
    });
  }

  if (messages.length === 0) {
    throw new Error('gen-appblocks-messages: parsed 0 messages — refusing to write an empty artifact');
  }

  messages.sort((a, b) => {
    const fa = FAMILY_ORDER.indexOf(a.family);
    const fb = FAMILY_ORDER.indexOf(b.family);
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name);
  });

  const sdkVersion = JSON.parse(readFileSync(join(sdkRoot, 'package.json'), 'utf8')).version;

  const artifact = {
    generatedAt: new Date().toISOString(),
    sdkPackage: `@civitai/app-sdk@${sdkVersion}`,
    sources: [dtsPath, invSrc.source],
    messages,
  };
  const dest = writeArtifact('messages.json', artifact);
  const b2h = messages.filter((m) => m.direction === 'block-to-host').length;
  const h2b = messages.length - b2h;
  log(`messages: wrote ${messages.length} (${b2h} block->host, ${h2b} host->block) -> ${dest}`);
  log(`  payloads from ${dtsPath}`);
  log(`  parity from   ${invSrc.source}`);
}

// Run the generator only when invoked directly (`node scripts/gen-appblocks-messages.mjs`),
// NOT when imported for its exported helpers (the test harness).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
