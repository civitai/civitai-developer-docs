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
import { dedent, log, readCivitaiSource, resolvePackageRoot, writeArtifact } from './appblocks-util.mjs';

const sdkRoot = resolvePackageRoot('@civitai/app-sdk');

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
function resolveMessagesDts() {
  // The package `exports` map doesn't expose raw .d.ts subpaths, so resolve via
  // the package root on disk.
  return join(sdkRoot, 'dist', 'blocks', 'messages.d.ts');
}

function parseUnion(sourceFile, aliasName, direction) {
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
 * (exclusive of the braces), skipping braces that appear inside quoted strings.
 * Robust to reformatting and to N/A reason strings.
 */
function extractBraced(text, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(openIdx + 1, i);
    }
  }
  return null;
}

function parseInventory(ts) {
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
    const reply = replyM ? replyM[2] : '';
    const iframeM = body.match(/IframeHost:\s*(?:(?:'([^']*)')|(?:"([^"]*)")|([A-Za-z_]+))/);
    const pageM = body.match(/PageBlockHost:\s*(?:(?:'([^']*)')|(?:"([^"]*)")|([A-Za-z_]+))/);
    const iframeVal = iframeM ? (iframeM[1] ?? iframeM[2] ?? iframeM[3]) : '';
    const pageVal = pageM ? (pageM[1] ?? pageM[2] ?? pageM[3]) : '';
    const pageOnly = pageVal === 'required' && iframeVal !== 'required';
    out[name] = { request, reply, pageOnly, iframeNote: iframeVal === 'required' ? null : iframeVal };
  }
  return out;
}

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

// ── DRIFT GUARD (do not remove) ───────────────────────────────────────────────
// The page-only / request-reply pairing flags come ENTIRELY from the parsed
// INVENTORY. If the parser silently yields nothing (e.g. hostHandlerParity.ts was
// reformatted and an over-specific regex stopped matching), the SDK union still
// produces message names, so the emitted messages.json would be plausible but
// WRONG. These assertions make any such regression a hard build failure.
//
// (1) COVERAGE: every published SDK block->host message MUST resolve to a parsed
// INVENTORY entry (the host file's own compile-time gate is one-directional the
// same way — SDK ⊆ INVENTORY). A dropped-entries parse trips this immediately.
const uncovered = blockToParent.filter((m) => !inventory[m.name]).map((m) => m.name);
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

// Family display order.
const FAMILY_ORDER = [
  'lifecycle', 'auth', 'workflow', 'subqueue', 'buzz', 'viewer',
  'pickers', 'storage', 'shared', 'wildcard', 'other',
];
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
