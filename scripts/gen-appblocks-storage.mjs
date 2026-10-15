// Generate public/appblocks/storage.json — the App Blocks DOCUMENT STORE's limits and
// error codes, for <StorageReference> on apps/guide/storage.md.
//
// Sources (civitai sibling repo @ origin/main, else the committed snapshot of the same
// file under appblocks-snapshots/, which `check:snapshots` keeps honest):
//   - src/server/services/apps/doc-store.types.ts      DOC_STORE_BOUNDS, DEFAULT_DOC_STORE_LIMITS
//   - src/server/services/apps/doc-store-api.ts        STORAGE_ERROR_STATUS, STORAGE_BODY_LIMIT_BYTES
//   - src/server/utils/shared-storage-rate-limit.ts    the per-bucket rate limits, SHARED_WRITE_BUDGET
//   - src/shared/constants/block-storage.constants.ts  the declaration bounds, APP_STORAGE_ENABLED_FEATURES
//
// WHY THIS IS GENERATED. Every number here is the server's, and the server can move any
// of them without a docs change. A hand-copied limits table is the failure mode the
// legacy storage docs already shipped twice (a stale "goes live with the next release"
// note, and an expansion figure 30x low). So the VALUES are read from the source; only
// the row LABELS are written here, and every row the generator expects must resolve or
// the run fails — a renamed constant is a red build, never a blank cell.
//
// The constants are read with ts-morph and evaluated by a deliberately tiny evaluator
// (numeric/string/regex literals, + - * /, parentheses, object and array literals,
// `as const`, `Object.freeze(x)`, and identifiers / property access naming another
// constant in the same file set). Anything else throws, naming the expression.
import { Node, Project, ScriptTarget, SyntaxKind } from 'ts-morph';
import { log, readCivitaiSource, writeArtifact } from './appblocks-util.mjs';

const FILES = {
  types: ['src/server/services/apps/doc-store.types.ts', 'doc-store.types.ts'],
  api: ['src/server/services/apps/doc-store-api.ts', 'doc-store-api.ts'],
  rate: ['src/server/utils/shared-storage-rate-limit.ts', 'shared-storage-rate-limit.ts'],
  decl: ['src/shared/constants/block-storage.constants.ts', 'block-storage.constants.ts'],
};

// ── read + index every top-level `const` across the four files ─────────────────
const project = new Project({ compilerOptions: { target: ScriptTarget.ES2022 }, useInMemoryFileSystem: true });
const decls = new Map(); // name -> initializer Node
const sources = [];
for (const [key, [path, snap]] of Object.entries(FILES)) {
  const { text, source } = readCivitaiSource(path, snap);
  sources.push(source);
  const sf = project.createSourceFile(`${key}.ts`, text);
  for (const stmt of sf.getVariableStatements()) {
    for (const d of stmt.getDeclarations()) {
      const init = d.getInitializer();
      if (init) decls.set(d.getName(), init);
    }
  }
}

const memo = new Map();
function evalConst(name) {
  if (memo.has(name)) return memo.get(name);
  const init = decls.get(name);
  if (!init) throw new Error(`gen-appblocks-storage: constant ${name} not found in ${Object.values(FILES).map((f) => f[0]).join(', ')}`);
  const v = evalNode(init, name);
  memo.set(name, v);
  return v;
}

function evalNode(n, ctx) {
  switch (n.getKind()) {
    case SyntaxKind.NumericLiteral:
      return Number(n.getText().replace(/_/g, ''));
    case SyntaxKind.StringLiteral:
    case SyntaxKind.NoSubstitutionTemplateLiteral:
      return n.getLiteralValue();
    case SyntaxKind.RegularExpressionLiteral: {
      const t = n.getText();
      return t.slice(1, t.lastIndexOf('/'));
    }
    case SyntaxKind.TrueKeyword:
      return true;
    case SyntaxKind.FalseKeyword:
      return false;
    case SyntaxKind.ParenthesizedExpression:
    case SyntaxKind.AsExpression:
    case SyntaxKind.SatisfiesExpression:
      return evalNode(n.getExpression(), ctx);
    case SyntaxKind.PrefixUnaryExpression: {
      const v = evalNode(n.getOperand(), ctx);
      if (n.getOperatorToken() === SyntaxKind.MinusToken) return -v;
      break;
    }
    case SyntaxKind.BinaryExpression: {
      const a = evalNode(n.getLeft(), ctx);
      const b = evalNode(n.getRight(), ctx);
      const op = n.getOperatorToken().getText();
      if (typeof a !== 'number' || typeof b !== 'number') break;
      if (op === '+') return a + b;
      if (op === '-') return a - b;
      if (op === '*') return a * b;
      if (op === '/') return a / b;
      break;
    }
    case SyntaxKind.Identifier:
      return evalConst(n.getText());
    case SyntaxKind.PropertyAccessExpression: {
      const obj = evalNode(n.getExpression(), ctx);
      const prop = n.getName();
      if (obj && typeof obj === 'object' && prop in obj) return obj[prop];
      break;
    }
    case SyntaxKind.ObjectLiteralExpression: {
      const out = {};
      for (const p of n.getProperties()) {
        if (Node.isPropertyAssignment(p)) {
          out[p.getName().replace(/^['"]|['"]$/g, '')] = evalNode(p.getInitializerOrThrow(), ctx);
        } else if (Node.isShorthandPropertyAssignment(p)) {
          out[p.getName()] = evalConst(p.getName());
        } else {
          throw new Error(`gen-appblocks-storage: ${ctx}: unsupported object member ${p.getKindName()}`);
        }
      }
      return out;
    }
    case SyntaxKind.ArrayLiteralExpression:
      return n.getElements().map((e) => evalNode(e, ctx));
    case SyntaxKind.CallExpression:
      // `Object.freeze({...})` — the one call the sources use around a constant.
      if (n.getExpression().getText() === 'Object.freeze' && n.getArguments().length === 1) {
        return evalNode(n.getArguments()[0], ctx);
      }
      break;
    default:
      break;
  }
  throw new Error(`gen-appblocks-storage: ${ctx}: cannot evaluate \`${n.getText().slice(0, 120)}\``);
}

/** A positive finite number, or a throw naming the constant path. */
function num(value, what) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`gen-appblocks-storage: ${what} is ${JSON.stringify(value)}, expected a positive number`);
  }
  return value;
}

// ── the values ─────────────────────────────────────────────────────────────────
const B = evalConst('DOC_STORE_BOUNDS');
const Q = evalConst('DEFAULT_DOC_STORE_LIMITS');
const STATUS = evalConst('STORAGE_ERROR_STATUS');
const bodyLimit = num(evalConst('STORAGE_BODY_LIMIT_BYTES'), 'STORAGE_BODY_LIMIT_BYTES');
const buckets = evalConst('DOC_STORE_BUCKETS');
const budget = evalConst('SHARED_WRITE_BUDGET');
const features = evalConst('APP_STORAGE_ENABLED_FEATURES');
const builtinMarks = evalConst('APP_STORAGE_BUILTIN_MARKS');
const indexTypes = evalConst('APP_STORAGE_INDEX_TYPES');

// ── formatting ─────────────────────────────────────────────────────────────────
const n = (v) => v.toLocaleString('en-US');
function bytes(v) {
  for (const [unit, size] of [['MiB', 1024 * 1024], ['KiB', 1024]]) {
    if (v >= size && v % size === 0) return `${n(v)} bytes (${n(v / size)} ${unit})`;
  }
  return `${n(v)} bytes`;
}
function per(seconds) {
  if (seconds === 60) return 'a minute';
  if (seconds === 24 * 60 * 60) return 'a day';
  return `${n(seconds)} seconds`;
}
function minutes(ms) {
  const m = ms / 60000;
  return Number.isInteger(m) ? `${m} minute${m === 1 ? '' : 's'}` : `~${m.toFixed(1)} minutes`;
}
function bucket(name) {
  const b = buckets?.[name];
  if (!b) throw new Error(`gen-appblocks-storage: DOC_STORE_BUCKETS.${name} not found`);
  return `${n(num(b.max, `DOC_STORE_BUCKETS.${name}.max`))} ${per(num(b.windowSeconds, `DOC_STORE_BUCKETS.${name}.windowSeconds`))}`;
}
function tokenBucket(name) {
  const b = budget?.[name];
  if (!b) throw new Error(`gen-appblocks-storage: SHARED_WRITE_BUDGET.${name} not found`);
  num(b.capacity, `SHARED_WRITE_BUDGET.${name}.capacity`);
  num(b.refillIntervalMs, `SHARED_WRITE_BUDGET.${name}.refillIntervalMs`);
  return b;
}

// The manifest spelling of each feature the platform does not accept yet. Every key of
// APP_STORAGE_ENABLED_FEATURES must have one, so a feature added upstream is a red run
// here rather than a row that silently omits it.
const FEATURE_SPELLING = {
  anyoneWrites: '`write: "anyone"`',
  ownerWrites: '`write: "owner"`',
  logCollections: '`kind: "log"` (and `maxEntries`)',
  ttl: '`ttlSeconds`',
  perAuthorWriteBudget: '`dailyWritesPerAuthor`',
};
for (const f of Object.keys(features)) {
  if (!(f in FEATURE_SPELLING)) throw new Error(`gen-appblocks-storage: APP_STORAGE_ENABLED_FEATURES.${f} has no FEATURE_SPELLING entry`);
}
for (const f of Object.keys(FEATURE_SPELLING)) {
  if (!(f in features)) throw new Error(`gen-appblocks-storage: FEATURE_SPELLING.${f} names no APP_STORAGE_ENABLED_FEATURES key — remove it`);
}
const notYet = Object.entries(features).filter(([, on]) => on === false).map(([f]) => FEATURE_SPELLING[f]);

const burst = tokenBucket('burst');
const daily = tokenBucket('daily');
const rejections = tokenBucket('rejections');

/** Each row: [group, item, value]. Labels are the only hand-written part. */
const limits = [
  ['Documents', 'One document', `${bytes(num(B.docBytes, 'DOC_STORE_BOUNDS.docBytes'))}, measured on the JSON text the server stores, which can be larger than the JSON you sent`],
  ['Documents', 'One request body', bytes(bodyLimit)],
  ['Documents', 'Nesting depth of `data`', n(num(B.depth, 'DOC_STORE_BOUNDS.depth'))],
  ['Documents', 'Key', `\`${B.key}\`, and not made only of dots`],
  ['Documents', 'A string index value', bytes(num(B.stringIndexBytes, 'DOC_STORE_BOUNDS.stringIndexBytes'))],
  ['Documents', 'Counter increment (`by`)', `1 to ${n(num(B.incrementMax, 'DOC_STORE_BOUNDS.incrementMax'))}`],
  ['Lists', 'Page size (`limit`)', `default ${n(num(B.listLimitDefault, 'listLimitDefault'))}, at most ${n(num(B.listLimitMax, 'listLimitMax'))}`],
  ['Lists', 'Equality filters (`where`)', `${n(num(B.equalityFilters, 'equalityFilters'))}, on a declared index`],
  ['Lists', 'Keys in one `getMany`', n(num(B.getManyMax, 'getManyMax'))],
  ['Lists', 'Cursor length', `${n(num(B.cursorChars, 'cursorChars'))} characters`],
  ['Declaration', 'Collections per app', n(num(evalConst('APP_STORAGE_MAX_COLLECTIONS'), 'APP_STORAGE_MAX_COLLECTIONS'))],
  ['Declaration', 'Counters / marks per collection', `${n(num(evalConst('APP_STORAGE_MAX_COUNTERS'), 'APP_STORAGE_MAX_COUNTERS'))} / ${n(num(evalConst('APP_STORAGE_MAX_MARKS'), 'APP_STORAGE_MAX_MARKS'))}`],
  ['Declaration', 'Indexes per collection', `${n(num(evalConst('APP_STORAGE_MAX_INDEXES'), 'APP_STORAGE_MAX_INDEXES'))}, each a field path of up to ${n(num(evalConst('APP_STORAGE_INDEX_MAX_DEPTH'), 'APP_STORAGE_INDEX_MAX_DEPTH'))} segments, typed ${indexTypes.map((t) => `\`${t}\``).join(', ')}`],
  ['Declaration', 'Built-in marks (never declared)', builtinMarks.map((m) => `\`${m}\``).join(', ')],
  ['Declaration', 'Refused by the server (not available yet)', notYet.length ? notYet.join(', ') : 'nothing'],
  ['Quota', 'Per app', `${bytes(num(Q.appBytes, 'appBytes'))} and ${n(num(Q.appDocs, 'appDocs'))} documents`],
  ['Quota', 'Per viewer, within one app', `${bytes(num(Q.userBytes, 'userBytes'))} and ${n(num(Q.userDocs, 'userDocs'))} documents`],
  ['Rate', 'Reads (`info`, `list`, `get`, `getMany`)', `${bucket('read')} per viewer, or per IP address for a signed-out viewer`],
  ['Rate', 'Writes to private collections, and every delete', `${bucket('write')} per viewer`],
  ['Rate', 'Marks and counters', `${bucket('tally')} per viewer`],
  ['Rate', 'Reports', `${bucket('report')} per viewer, on top of the marks-and-counters limit`],
  ['Rate', 'Creating and editing shared documents', `a burst of ${n(burst.capacity)} refilling 1 every ${minutes(burst.refillIntervalMs)}, and ${n(daily.capacity)} a day refilling 1 every ${minutes(daily.refillIntervalMs)}, per viewer; a write needs a token from both, and only a write that lands spends one`],
  ['Rate', 'Shared writes the server refused', `also charged to a bucket of ${n(rejections.capacity)} refilling 1 every ${minutes(rejections.refillIntervalMs)}; while it is empty, no shared create or edit is accepted`],
];

// What each code means. Every code the route maps must have one, and nothing else may.
const MEANING = {
  invalid_request: 'The request is malformed: a bad key, body, query parameter, value or cursor, an increment or mark naming an undeclared counter or mark, a counter or mark on a private collection, or withdrawing a `report`.',
  index_not_declared: 'A `where` or `sort` names a field, counter or mark the collection does not declare.',
  unauthenticated: 'No usable token.',
  sign_in_required: 'The operation needs a signed-in viewer: writes, marks, counters, `info`, any read of a private collection, and `author=me` / `markedBy=me` lists.',
  insufficient_scope: 'The token does not carry `apps:storage`.',
  consent_required: 'The viewer has not granted `apps:storage:publish`, or withdrew a consent-gated scope. Ask with `requestGrants`.',
  not_eligible: 'The app or the viewer cannot use storage here. `details.reason` says which, for example `app_not_approved` or `account_too_new`.',
  not_author: 'Only a document\'s author may change or delete it.',
  write_policy: 'The collection\'s `write` policy does not let viewers write documents.',
  not_found: 'No such document (hidden documents read the same way), or no such route.',
  collection_not_declared: 'The collection is not declared in the app\'s approved manifest (in a moderator\'s review run, the pending one).',
  version_conflict: 'An `ifVersion` write found another version. `details.currentVersion` is the one stored.',
  index_building: 'Declared for a later phase; not raised today.',
  cursor_expired: 'Declared for a later phase; not raised today.',
  too_large: 'The document or the request body is over its limit.',
  quota_exceeded: 'A quota is full. `details.ceiling` names which one.',
  content_rejected: 'Moderation refused a shared write. `details.category` is coarse and never the matched text.',
  rate_limited: 'A rate limit or the shared write budget is spent. Wait `Retry-After` seconds.',
  storage_disabled: 'The document store is not enabled on this server.',
  moderation_unavailable: 'A shared write could not be reviewed right now. Retryable after `Retry-After`.',
  consent_unavailable: 'The viewer\'s consent state could not be read. Retryable.',
  service_unavailable: 'A dependency could not be read. Retryable.',
  internal_error: 'A server fault.',
  method_not_allowed: 'The path exists, not for this method. The `Allow` header lists the methods it takes.',
};
const codes = Object.keys(STATUS);
const unexplained = codes.filter((c) => !(c in MEANING));
const stale = Object.keys(MEANING).filter((c) => !(c in STATUS));
if (unexplained.length || stale.length) {
  throw new Error(
    `gen-appblocks-storage: STORAGE_ERROR_STATUS and MEANING disagree — no meaning for: ${unexplained.join(', ') || '(none)'}; ` +
      `meaning for a code the route no longer maps: ${stale.join(', ') || '(none)'}`,
  );
}
const errors = codes.map((code) => ({ code, status: num(STATUS[code], `STORAGE_ERROR_STATUS.${code}`), meaning: MEANING[code] }));

if (limits.length === 0 || errors.length === 0) {
  throw new Error('gen-appblocks-storage: produced an empty table — refusing to write the artifact');
}

const artifact = {
  generatedAt: new Date().toISOString(),
  sources,
  limits: limits.map(([group, item, value]) => ({ group, item, value })),
  errors,
};
const dest = writeArtifact('storage.json', artifact);
log(`storage: wrote ${limits.length} limit rows + ${errors.length} error codes -> ${dest}`);
for (const s of sources) log(`  from ${s}`);
