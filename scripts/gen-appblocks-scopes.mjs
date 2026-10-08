// Generate public/appblocks/scopes.json — the canonical App Block scope catalog.
//
// Sources (civitai sibling repo @ origin/main, else committed snapshot):
//   - scope keys + OAuth-bit mapping:
//       src/shared/constants/block-scope.constants.ts  (BLOCK_SCOPE_TO_OAUTH_BIT)
//   - friendly descriptions:
//       src/server/services/blocks/scope-descriptions.constants.ts (SCOPE_DESCRIPTIONS)
//
// The per-scope context-binding note is HAND-SUMMARIZED here (the
// enforceContextBinding switch in block-scope.middleware.ts is not machine-clean
// — per the proposal, we do NOT auto-parse it).
import { log, readCivitaiSource, writeArtifact } from './appblocks-util.mjs';

// Hand-authored binding notes, summarizing block-scope.middleware.ts
// enforceContextBinding + the constant-file comments. Keep in sync on scope
// changes (see the `sources:` front-matter on apps/reference/scopes.md).
const BINDING_NOTES = {
  'models:read:self':
    'Bound to the model on the page where the block is mounted (a model-slot install supplies the modelId context).',
  'media:read:owned': "Self-bound: only the viewer's own uploaded media.",
  'user:read:self': 'Self-bound to the token subject; rejected for an anonymous subject.',
  'ai:write:budgeted':
    'Host-enforced per-call Buzz cap; the token carries a buzzBudget claim the host clamps against.',
  'buzz:read:self': 'Self-bound to the token subject (the signed-in viewer).',
  'social:tip:self': 'Self-bound: tips are posted as the token subject.',
  'block:settings:read':
    'No OAuth bit — gated by the issuance-time caller-is-installer check instead.',
  'block:settings:write':
    'No OAuth bit — gated by the issuance-time caller-is-installer check instead.',
  'apps:storage:read':
    "Scoped to this app's private per-install store; asserted per read op.",
  'apps:storage:write':
    "Scoped to this app's private per-install store; asserted per write op.",
  'apps:storage:shared:read':
    "Scoped to this app's shared (cross-user) store; min-trust gate + fail-closed flag. Never minted for dev-tunnel / dev-token sessions.",
  'apps:storage:shared:write':
    "Scoped to this app's shared (cross-user) store; min-trust gate + fail-closed flag. Never minted for dev-tunnel / dev-token sessions.",
  'collections:read:self':
    "Self-bound; public collections + the viewer's own public collections. Consent-exempt (server visibility/ownership is the gate).",
  'collections:write:self':
    'Self-bound: follow/bookmark on the viewer’s own behalf. Consent-exempt.',
  'collections:read:private':
    'Self-bound; CONSENT-GATED — the viewer must grant it via the host consent gate before a token carries it.',
  'posts:write:self':
    'Self-bound to the token subject; an anonymous subject is rejected — there is no anonymous profile to post to. CONSENT-GATED and SENSITIVE: a manifest declaring it must carry a scopeJustifications entry or submit is rejected. The grant alone is not the whole consent story — the host also opens a per-post confirm rendering the resolved title, tags and images, because the content differs every time and a blanket grant cannot inform.',
  'goods:read:self':
    "Self-bound, and app-bound: the reply is scoped server-side to the calling app's own blockId, so an app only ever sees the entitlements IT sold to this viewer — never their purchases in any other app. Consent-exempt for that reason (the server-side app scoping is the gate, as with the collections read scopes); a non-anonymous subject is still required. No OAuth bit — an app good is a platform-mediated entitlement that touches none of the viewer's Civitai resources through the OAuth surface.",
  'goods:purchase:self':
    "Self-bound: the purchase is billed to the token subject, and an anonymous subject is rejected — there is nobody to bill. CONSENT-GATED and SENSITIVE: money leaves the viewer's balance, so it needs an explicit grant AND a scopeJustifications entry or submit is rejected. Bounded rather than prohibited on page apps: the price is review-gated and hard-capped per purchase, with a per-user daily ceiling across every app. It does NOT consult the per-app daily Buzz budget that governs ai:write:budgeted — that is a separate rail. No OAuth bit, deliberately: reusing social:tip:self's SocialTip bit would let every app already approved to tip start selling goods.",
  'apps:store:items:write':
    "Self-bound: the item is published under the token subject's name, so an anonymous subject is rejected. App-bound: the parent is the calling app's own listing, taken from the token and never from the request. SENSITIVE but CONSENT-EXEMPT: a manifest declaring it must carry a scopeJustifications entry, and the per-call server checks (an app enabled for store items, the caller's own shared-storage item, rate limits, moderator review of every item) are the gate rather than a consent prompt. Never minted for dev-token, dev-tunnel or review sessions, so it reaches only an approved app's token.",
};

function parseScopeBits(ts) {
  // Match  'scope:string': TokenScope.Foo,   or   'scope': SKIP_OAUTH_CHECK,
  const out = {};
  const re = /^\s*'([a-z0-9_:]+)'\s*:\s*(TokenScope\.[A-Za-z0-9_]+|SKIP_OAUTH_CHECK)\s*,/gm;
  let m;
  while ((m = re.exec(ts)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

function parseDescriptions(ts) {
  // Only the SCOPE_DESCRIPTIONS map (stop at the SLOT_DESCRIPTIONS const). Anchor
  // on the actual `export const` so the JSDoc mention above it isn't matched.
  const start = ts.indexOf('export const SCOPE_DESCRIPTIONS');
  const slice = start >= 0 ? ts.slice(start) : ts;
  const end = slice.indexOf('export const SLOT_DESCRIPTIONS');
  const region = end >= 0 ? slice.slice(0, end) : slice;
  const out = {};
  const re = /'([a-z0-9_:]+)'\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  let m;
  while ((m = re.exec(region)) !== null) {
    const raw = m[2] ?? m[3] ?? '';
    // Unescape the few sequences the source uses (\" \' \\).
    out[m[1]] = raw.replace(/\\(["'\\])/g, '$1');
  }
  return out;
}

function prettyOauthBit(req) {
  if (req === 'SKIP_OAUTH_CHECK') return null;
  // TokenScope.ModelsRead -> ModelsRead
  return req.replace(/^TokenScope\./, '');
}

const bitsSrc = readCivitaiSource(
  'src/shared/constants/block-scope.constants.ts',
  'block-scope.constants.ts'
);
const descsSrc = readCivitaiSource(
  'src/server/services/blocks/scope-descriptions.constants.ts',
  'scope-descriptions.constants.ts'
);

const bits = parseScopeBits(bitsSrc.text);
const descs = parseDescriptions(descsSrc.text);

const scopes = Object.keys(bits).map((scope) => ({
  scope,
  description: descs[scope] ?? '',
  oauthBit: prettyOauthBit(bits[scope]),
  binding: BINDING_NOTES[scope] ?? '',
}));

if (scopes.length === 0) {
  throw new Error('gen-appblocks-scopes: parsed 0 scopes — refusing to write an empty artifact');
}

const missingDesc = scopes.filter((s) => !s.description).map((s) => s.scope);
if (missingDesc.length) {
  log(`WARNING: no description for: ${missingDesc.join(', ')}`);
}
const missingBinding = scopes.filter((s) => !s.binding).map((s) => s.scope);
if (missingBinding.length) {
  log(`WARNING: no BINDING_NOTES entry for: ${missingBinding.join(', ')} (add one to gen-appblocks-scopes.mjs)`);
}

const artifact = {
  generatedAt: new Date().toISOString(),
  sources: [bitsSrc.source, descsSrc.source],
  scopes,
};
const dest = writeArtifact('scopes.json', artifact);
log(`scopes: wrote ${scopes.length} scopes -> ${dest}`);
log(`  bits from   ${bitsSrc.source}`);
log(`  descs from  ${descsSrc.source}`);
