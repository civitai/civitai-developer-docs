// Unit + end-to-end tests for scripts/check-doc-claims.mjs.
//
// Each claim kind has a RED fixture (a claim the source does not have) and a
// GREEN one (a claim it does), so a resolver that answers "everything resolves"
// and one that answers "nothing resolves" both fail here. Synthetic sources pin
// the logic; the last block runs the REAL pinned sources (help snapshot,
// installed devDeps, bundled manifest schema) so a broken loader cannot pass.
//
//   npm run test:doc-claims        (needs `npm ci` for the end-to-end block)

import assert from 'node:assert/strict';
import {
  compareBaseline,
  extractClaims,
  gradePages,
  loadSources,
  resolveClaim,
  resolveCommand,
  splitFences,
  stripGenerated,
  takesArgs,
} from './check-doc-claims.mjs';

let n = 0;
const eq = (a, b, name) => {
  assert.deepEqual(a, b, name);
  n++;
};

// --- a tiny help capture in the snapshot's own format -----------------------
const HELP = [
  '===CMD (root)===',
  'root',
  '',
  'Usage:',
  '  civitai [flags]',
  '  civitai [command]',
  '',
  'Flags:',
  '  -h, --help      help for civitai',
  '  -v, --version   version',
  '===CMD complete (root)===',
  'app\tApps',
  '===CMD app===',
  'Usage:',
  '  civitai app [flags]',
  '  civitai app [command]',
  '',
  'Flags:',
  '  -h, --help   help',
  '===CMD app create===',
  'Usage:',
  '  civitai app create [name] [dir] [flags]',
  '',
  'Flags:',
  '      --template string   template',
  '      --json              json',
  '===CMD app view===',
  'Usage:',
  '  civitai app view <slug> [flags]',
  '',
  'Flags:',
  '      --json   json',
  '',
].join('\n');

const SRC = {
  help: HELP,
  scopes: new Set(['apps:storage:read', 'ai:write:budgeted']),
  scopeNamespaces: new Set(['apps', 'ai']),
  fields: new Set(['blockId', 'name', 'scopes', 'buildCommand']),
  exportsInfo: { names: new Set(['useViewer', 'useBlockContext']) },
};

const page = (body) => body + '\n';
const verdicts = (md, opts) => extractClaims(md, SRC.scopeNamespaces, opts).map((c) => [c.kind, c.claim, resolveClaim(c, SRC) === null]);

// --- takesArgs / resolveCommand ---------------------------------------------
eq(takesArgs(HELP.split('===CMD app create===')[1], ['app', 'create']), true, 'create takes [name]');
eq(takesArgs(HELP.split('===CMD app===')[1].split('===CMD app create')[0], ['app']), false, 'group takes none');
eq(resolveCommand(HELP, ['app', 'create', 'my-app']).unknown, undefined, 'positional after create');
eq(resolveCommand(HELP, ['app', 'frobnicate']).unknown, 'frobnicate', 'bogus subcommand under a group');
eq(resolveCommand(HELP, ['nope']).unknown, 'nope', 'bogus top-level command');
eq(resolveCommand(HELP, ['app', 'view', 'my-app']).path, ['app', 'view'], 'deepest node');

// --- cli claims: RED and GREEN ----------------------------------------------
eq(verdicts(page('```bash\ncivitai app create my-app --template page\n```')), [['cli', 'civitai app create my-app --template page', true]], 'GREEN: real command, positional, real flag');
eq(verdicts(page('```bash\ncivitai app create my-app --no-such-flag\n```')), [['cli', 'civitai app create my-app --no-such-flag', false]], 'RED: nonexistent flag');
eq(verdicts(page('```bash\ncivitai app frobnicate\n```')), [['cli', 'civitai app frobnicate', false]], 'RED: nonexistent subcommand');
eq(verdicts(page('Run `civitai app view my-app --json` now.')), [['cli', 'civitai app view my-app --json', true]], 'GREEN: inline command span');
eq(verdicts(page('- step\n\n  ```sh\n  civitai app view x --bogus\n  ```')), [['cli', 'civitai app view x --bogus', false]], 'RED: list-nested fence is seen');
eq(verdicts(page('`civitai … --json` prints JSON.')), [['cli', 'civitai … --json', true]], 'GREEN: placeholder command is a template');
eq(verdicts(page('`civitai app view <slug> --bogus`')), [['cli', 'civitai app view <slug> --bogus', false]], 'RED: placeholder POSITIONAL still grades flags');
eq(verdicts(page('```bash\nnpx -y @civitai/cli@latest app frobnicate\n```')), [['cli', 'npx -y @civitai/cli@latest app frobnicate', false]], 'RED: npx form is graded as civitai');
eq(verdicts(page('`npx -y @civitai/cli@latest … --json`')), [['cli', 'npx -y @civitai/cli@latest … --json', true]], 'GREEN: npx placeholder template');

// --- hook claims -------------------------------------------------------------
eq(verdicts(page('Call `useViewer()` first.')), [['hook', 'useViewer', true]], 'GREEN: exported hook');
eq(verdicts(page('Call `useNoSuchHook()` first.')), [['hook', 'useNoSuchHook', false]], 'RED: unexported hook');
eq(verdicts(page('`useState` and `useEffect`')), [['hook', 'useState', true], ['hook', 'useEffect', true]], 'GREEN: React built-ins');
eq(verdicts(page('```ts\nexport function useApi() {}\n```\n\n`useApi` wraps fetch.')), [], 'page-defined hook is not a claim');
eq(verdicts(page('```ts\nconst x = useNoSuchHook();\n```')), [], 'fenced hooks are left to the snippet typechecker');
eq(verdicts(page('`useNoSuchHook`'), { hooks: false }), [], 'hooks off outside HOOK_SCOPE');
eq(verdicts(page('`obj.useNoSuchHook`')), [], 'member access is not a hook claim');

// --- scope claims ------------------------------------------------------------
eq(verdicts(page('needs `apps:storage:read`')), [['scope', 'apps:storage:read', true]], 'GREEN: real scope');
eq(verdicts(page('needs `apps:storage:readonly`')), [['scope', 'apps:storage:readonly', false]], 'RED: typo scope');
eq(verdicts(page('run `dev:live`')), [], 'npm script in a foreign namespace is not a scope claim');

// --- manifest field claims ---------------------------------------------------
eq(verdicts(page('```json\n{ "blockId": "x", "buildCommand": "npm run build" }\n```')), [['field', 'blockId', true], ['field', 'buildCommand', true]], 'GREEN: real fields');
eq(verdicts(page('```json\n{ "blockId": "x", "buildCmd": "npm run build" }\n```')), [['field', 'blockId', true], ['field', 'buildCmd', false]], 'RED: nonexistent field');
eq(verdicts(page('```json\n{ "status": "ok", "buildCmd": 1 }\n```')), [], 'non-manifest JSON is not a claim');

// --- generated content is excluded, line numbers survive ---------------------
eq(stripGenerated('<!-- GENERATED PAGE — x -->\n`useNoSuchHook`\n'), null, 'whole generated page');
const regioned = 'a\n<!-- BEGIN GENERATED: k — x -->\n`useNoSuchHook`\n<!-- END GENERATED: k -->\n`useViewer`\n';
eq(stripGenerated(regioned).split('\n').length, regioned.split('\n').length, 'line count preserved');
eq(verdicts(stripGenerated(regioned)), [['hook', 'useViewer', true]], 'claim inside a generated region is dropped');
eq(extractClaims(stripGenerated(regioned), SRC.scopeNamespaces)[0].line, 5, 'reported line is the real line');
eq(splitFences('x\n~~~\n`useA`\n~~~\n`useB`').prose, ['x', '', '', '', '`useB`'], 'tilde fence blanked from prose');

// --- baseline: new findings fail, stale entries fail -------------------------
const { findings } = gradePages(
  [
    { file: 'apps/a.md', md: '`useNoSuchHook`\n' },
    { file: 'apps/b.md', md: '`useViewer`\n' },
  ],
  SRC,
);
eq(findings.map((f) => f.key), ['apps/a.md␟hook␟useNoSuchHook'], 'one finding');
eq(compareBaseline(findings, {}).fresh.length, 1, 'unbaselined finding is fresh');
eq(compareBaseline(findings, { 'apps/a.md␟hook␟useNoSuchHook': 'r' }), { fresh: [], stale: [] }, 'baselined finding passes');
eq(compareBaseline([], { 'apps/a.md␟hook␟useNoSuchHook': 'r' }).stale, ['apps/a.md␟hook␟useNoSuchHook'], 'fixed finding left in baseline is stale');

// --- end to end against the REAL pinned sources ------------------------------
const real = loadSources();
assert.ok(real.exportsInfo.unresolved.length === 0, `unresolved subpaths: ${real.exportsInfo.unresolved}`);
assert.ok(real.exportsInfo.names.has('useViewer'), 'pinned blocks-react exports useViewer');
assert.ok(real.scopes.has('apps:storage:read'), 'pinned schema has apps:storage:read');
const e2e = (md) => gradePages([{ file: 'apps/guide/seeded.md', md }], real).findings.map((f) => f.why);
eq(e2e('```bash\ncivitai app validate\n```\n'), [], 'GREEN e2e: real command');
eq(e2e('```bash\ncivitai app validate --definitely-not-a-flag\n```\n'), ['`civitai app validate` has no --definitely-not-a-flag'], 'RED e2e: seeded bad flag');
eq(e2e('`civitai app frobnicate`\n').length, 1, 'RED e2e: seeded bad subcommand');
eq(e2e('`useNoSuchHook()` and `apps:storage:readonly`\n').length, 2, 'RED e2e: seeded bad hook + scope');

console.log(`✓ test-doc-claims: ${n} assertions passed`);
