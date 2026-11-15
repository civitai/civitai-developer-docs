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
  mcpServerUrls,
  mcpSurface,
  resolveClaim,
  sourceProblems,
  resolveCommand,
  splitFences,
  stripGenerated,
  takesArgs,
} from './check-doc-claims.mjs';
import { gradeExternal } from './check-external-doc-claims.mjs';
import {
  MCP_SERVER_SNAPSHOT,
  ORCHESTRATION_SNAPSHOT,
  deriveMcpServerRegistry,
  deriveOrchestrationRegistry,
  parseRegistry,
  registryDelta,
} from './lib/mcp-registries.mjs';

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

// Registry fixtures: names and paths pairwise distinct from the real snapshots'
// where it matters (`orch_only` exists nowhere real), so a resolver that reads
// the wrong registry cannot pass by coincidence.
const SRC = {
  help: HELP,
  scopes: new Set(['apps:storage:read', 'ai:write:budgeted']),
  scopeNamespaces: new Set(['apps', 'ai']),
  fields: new Set(['blockId', 'name', 'scopes', 'buildCommand']),
  exportsInfo: { names: new Set(['useViewer', 'useBlockContext']) },
  registries: {
    [MCP_SERVER_SNAPSHOT]: { endpoints: new Set(['/mcp']), tools: new Set(['search_models', 'edit_comment', 'delete_comment']) },
    [ORCHESTRATION_SNAPSHOT]: { endpoints: new Set(['/mcp', '/mcp/v2']), tools: new Set(['run_step', 'orch_only']) },
  },
  cliMcpUrls: new Set(['https://mcp.civitai.com/mcp', 'https://orchestration.civitai.com/mcp']),
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

// --- cli: only flag-SHAPED tokens are flag claims ----------------------------
eq(verdicts(page('`civitai app view <slug> [--x <p>\\|--json -]`')), [['cli', 'civitai app view <slug> [--x <p>\\|--json -]', true]], 'GREEN: synopsis `-]` is not a flag claim');

// --- mcp surfaces -------------------------------------------------------------
eq(
  ['site/mcp/tools.md', 'orchestration/mcp/index.md', 'public/agent-setup/prompt.md', 'apps/guide/x.md', 'site/guide/mcp.md'].map(mcpSurface),
  ['site', 'orchestration', 'prompt', null, null],
  'mcpSurface maps exactly the three MCP surfaces',
);
const mv = (md, mcp) => verdicts(page(md), { hooks: false, mcp });
const TABLE = (rows) => `| Tool | Purpose |\n|---|---|\n${rows.map((r) => `| ${r} | x |`).join('\n')}\n`;

// --- mcp-tool claims -----------------------------------------------------------
eq(mv(TABLE(['`search_models`']), 'site'), [['mcp-tool', 'search_models', true]], 'GREEN: registered platform tool');
eq(mv(TABLE(['`search_modelz`']), 'site'), [['mcp-tool', 'search_modelz', false]], 'RED: unregistered platform tool');
eq(mv(TABLE(['`edit_comment` / `delete_comment`']), 'site'), [['mcp-tool', 'edit_comment', true], ['mcp-tool', 'delete_comment', true]], 'every span in a combined first cell');
eq(mv(TABLE(['`orch_only`']), 'site'), [['mcp-tool', 'orch_only', false]], 'RED: site page graded against the PLATFORM registry only');
eq(mv(TABLE(['`orch_only`']), 'orchestration'), [['mcp-tool', 'orch_only', true]], 'GREEN: orchestration page graded against its registry');
eq(mv(TABLE(['`search_models`']), 'orchestration'), [['mcp-tool', 'search_models', false]], 'RED: orchestration page does not accept a platform tool');
eq(mv(TABLE(['`orch_only`', '`search_models`']), 'prompt'), [['mcp-tool', 'orch_only', true], ['mcp-tool', 'search_models', true]], 'prompt accepts either registry');
eq(mv('| Prompt | Plan |\n|---|---|\n| `nope_prompt` | x |\n', 'orchestration'), [], 'a Prompt table is not a tool claim');
eq(mv('Statuses: `not_planned`, `fixed_ish`.\n', 'site'), [], 'snake_case in prose is not a tool claim');
eq(mv(`${TABLE(['`search_models`'])}\nprose\n\n| Other | y |\n|---|---|\n| \`zzz_tool\` | y |\n`, 'site'), [['mcp-tool', 'search_models', true]], 'a table ends at a non-table line');
eq(mv('```md\n| Tool | x |\n|---|---|\n| `zzz_tool` | x |\n```\n', 'site'), [], 'a table inside a fence is not a claim');
eq(verdicts(page(TABLE(['`zzz_tool`'])), { hooks: false }), [], 'no mcp claims off the MCP surfaces');

// --- mcp-url claims --------------------------------------------------------------
eq(mv('Connect to `https://orchestration.civitai.com/mcp/v2`.', 'orchestration'), [['mcp-url', 'https://orchestration.civitai.com/mcp/v2', true]], 'GREEN: mapped endpoint');
eq(mv('Connect to https://orchestration.civitai.com/mcp/v3', 'orchestration'), [['mcp-url', 'https://orchestration.civitai.com/mcp/v3', false]], 'RED: unmapped endpoint path');
eq(mv('Connect to https://mcp.civitai.com/mcp/v2', 'site'), [['mcp-url', 'https://mcp.civitai.com/mcp/v2', false]], 'RED: graded against the HOST\'s server, not any server');
eq(mv('```json\n{"url": "https://mcp.civitai.com/mcp/"}\n```\n', 'site'), [['mcp-url', 'https://mcp.civitai.com/mcp', true]], 'GREEN: URL in a fence, trailing slash folded');
eq(mv('https://orchestration.civitai.com/mcp/v2', 'prompt'), [['mcp-url', 'https://orchestration.civitai.com/mcp/v2', false]], 'RED: prompt names a served URL the CLI does not register');
eq(mv('https://orchestration.civitai.com/mcp', 'prompt'), [['mcp-url', 'https://orchestration.civitai.com/mcp', true]], 'GREEN: prompt names a CLI-registered URL');
eq(mv('https://example.com/mcp and https://orchestration.civitai.com/v2/consumer', 'site'), [], 'foreign host / non-/mcp path is not a claim');
eq(mcpServerUrls('HTTPS://MCP.civitai.com/mcp'), ['https://mcp.civitai.com/mcp'], 'host is case-folded');

// --- registry derivation (scripts/lib/mcp-registries.mjs) ------------------------
const files = (map) => async (p) => (p in map ? { ok: true, text: map[p] } : { ok: false, gone: true, reason: 'HTTP 404', url: p });
const MCP_REPO = {
  'src/index.ts': "app.post('/mcp', async () => {});\napp.get('/mcp', x);",
  'src/server.ts': [
    "import { browseTools } from './tools/browse.js';",
    "import { fail, type X } from './tools/helpers.js';",
    "import { whoamiTools } from './tools/whoami.js';",
    'const modules: Array<{ category: string; mod: ToolModule }> = [',
    "  { category: 'Browse', mod: browseTools },",
    "  { category: 'Utility', mod: whoamiTools },",
    '];',
  ].join('\n'),
  'src/tools/browse.ts': "reg(\n  'search_models', {}, h);\nreg('get_model', {}, h);",
  'src/tools/whoami.ts': "reg('whoami', {}, h);",
};
const mcpReg = await deriveMcpServerRegistry(files(MCP_REPO));
eq(mcpReg.ok, true, 'mcp-server derivation succeeds');
eq(
  [...parseRegistry(mcpReg.text).tools],
  ['get_model', 'search_models', 'whoami'],
  'mcp-server: every module in `modules` contributes, sorted',
);
eq([...parseRegistry(mcpReg.text).endpoints], ['/mcp'], 'mcp-server endpoint is the POST route');
eq(
  (await deriveMcpServerRegistry(files({ ...MCP_REPO, 'src/tools/whoami.ts': 'register("whoami")' }))).unmatched,
  true,
  'a module that registers nothing is UNMATCHED (drift), not empty',
);
const noBrowse = { ...MCP_REPO };
delete noBrowse['src/tools/browse.ts'];
eq((await deriveMcpServerRegistry(files(noBrowse))).gone, true, 'a module file that 404s propagates as gone');

const ORCH = 'src/Civitai.Orchestration.McpServer';
const ORCH_REPO = {
  [`${ORCH}/Infrastructure/McpEndpoints.cs`]: [
    'public const string V1Path = "/mcp";',
    'public const string V2Path = "/mcp/v2";',
    'public static readonly ImmutableArray<Type> V1Tools = [ typeof(OldToolsV1) ];',
    'public static readonly ImmutableArray<Type> V2Tools = [ typeof(StepTools), typeof(WebTools) ];',
  ].join('\n'),
  [`${ORCH}/Tools/StepTools.cs`]: '[McpServerTool(Name = "run_step", Destructive = false)]\n[McpServerTool(Name = "run_workflow")]',
  [`${ORCH}/Tools/WebTools.cs`]: '[McpServerTool(Name = "web_search", ReadOnly = true)]\n[McpServerPrompt(Name = "a_prompt")]',
  // At Tools/<Type>.cs (the real file is under Tools/V1/) so that a derivation
  // reading V1Tools too would FIND it and the V2-only assertion below is reached.
  [`${ORCH}/Tools/OldToolsV1.cs`]: '[McpServerTool(Name = "caption_media")]',
};
const orchOut = await deriveOrchestrationRegistry(files(ORCH_REPO));
eq(orchOut.ok, true, 'orchestration derivation succeeds');
const orchReg = parseRegistry(orchOut.text);
eq([...orchReg.tools], ['run_step', 'run_workflow', 'web_search'], 'orchestration: V2Tools only, tools only (no V1, no prompts)');
eq([...orchReg.endpoints], ['/mcp', '/mcp/v2'], 'orchestration: both mapped endpoint paths');
const orchNoList = { ...ORCH_REPO, [`${ORCH}/Infrastructure/McpEndpoints.cs`]: 'public const string V2Path = "/mcp/v2";' };
eq((await deriveOrchestrationRegistry(files(orchNoList))).unmatched, true, 'no V2Tools list is UNMATCHED');
eq(registryDelta('# h\ntool a\ntool b\n', '# other\ntool b\ntool c\n'), { added: ['tool c'], removed: ['tool a'] }, 'delta ignores headers');

// --- external corpora (scripts/check-external-doc-claims.mjs) ----------------------
const CORPORA = [
  { name: 'o/a', base: 'https://raw/o/a', files: ['README.md', 'GONE.md', 'FLAKY.md'] },
  { name: 'o/b', base: 'https://raw/o/b', files: ['README.md'] },
  { name: 'o/c', base: 'https://raw/o/c', files: ['OTHER.md'] },
];
const RAW = {
  'https://raw/o/a/README.md': '`useNoSuchHook` and `useViewer`\n',
  'https://raw/o/a/FLAKY.md': null,
  'https://raw/o/b/README.md': '`useNoSuchHook`\n',
  'https://raw/o/c/OTHER.md': 'no claims here\n',
};
const fakeFetch = async (url) => {
  if (url.endsWith('GONE.md')) return { ok: false, gone: true, status: 404, reason: 'HTTP 404' };
  if (RAW[url] === null) return { ok: false, status: 503, reason: 'HTTP 503' };
  return { ok: true, text: RAW[url] };
};
const ext = await gradeExternal(CORPORA, SRC, {
  'o/a': { 'README.md␟hook␟useNoSuchHook': 'r', 'FLAKY.md␟hook␟useGone': 'r' },
  'o/c': { 'OTHER.md␟hook␟useGone': 'r' },
}, fakeFetch);
eq(ext[0].graded, ['README.md'], 'external: a 200 is graded');
eq(ext[0].gone.map((g) => g.file), ['GONE.md'], 'external: a 404 is GONE');
eq(ext[0].skipped.map((s) => s.file), ['FLAKY.md'], 'external: a 5xx is SKIPPED');
eq(ext[0].findings.map((f) => f.key), ['README.md␟hook␟useNoSuchHook'], 'external: hooks graded on every external page');
eq([ext[0].fresh.length, ext[0].stale], [0, []], 'external: baselined finding passes; a SKIPPED file\'s entry is not stale');
eq(ext[0].red, true, 'external: a GONE file alone makes the corpus red');
eq(ext[1].fresh.map((f) => f.key), ['README.md␟hook␟useNoSuchHook'], 'external: baseline is PER CORPUS (o/a\'s entry does not cover o/b)');
eq(ext[2].stale, ['OTHER.md␟hook␟useGone'], 'external: a graded file\'s entry that no longer reproduces is STALE');
eq(ext[2].problems.length, 1, 'external: zero claims from a corpus is a problem');
const allSkipped = await gradeExternal([CORPORA[0]], SRC, {}, async () => ({ ok: false, reason: 'ECONNRESET' }));
eq([allSkipped[0].gone.length, allSkipped[0].skipped.length, allSkipped[0].red], [0, 3, true], 'external: every file skipped = zero claims = RED, not clean');
const clean = await gradeExternal([CORPORA[2]], SRC, {}, async () => ({ ok: true, text: '`useViewer`\n' }));
eq(clean[0].red, false, 'external: all claims resolve = green');

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
eq(e2e('```json\n{ "blockId": "x", "scopes": [] }\n```\n'), [], 'GREEN e2e: real manifest fields against the bundled schema');
eq(e2e('```json\n{ "blockId": "x", "buildCmd": "x" }\n```\n'), ['`buildCmd` is not a manifest schema property'], 'RED e2e: seeded bad manifest field');

// Positive controls on the MCP sources fire on an emptied source, and only then.
eq(sourceProblems(real), [], 'real sources pass the source controls');
eq(sourceProblems({ ...real, cliMcpUrls: new Set() }).length, 1, 'source control: CLI names no MCP URL');
eq(sourceProblems({ ...real, registries: { ...real.registries, [ORCHESTRATION_SNAPSHOT]: parseRegistry('# empty\n') } }).length, 1, 'source control: empty registry snapshot');

// MCP kinds against the committed registry snapshots + the help snapshot.
assert.ok(real.cliMcpUrls.has('https://mcp.civitai.com/mcp'), 'help snapshot agent-setup names the platform server');
assert.ok(real.registries[MCP_SERVER_SNAPSHOT].tools.size >= 40, 'mcp-server snapshot carries the registry');
const mcpE2e = (file, md) => gradePages([{ file, md }], real).findings.map((f) => f.kind);
eq(mcpE2e('site/mcp/seeded.md', TABLE(['`search_models`', '`whoami`'])), [], 'GREEN e2e: real platform tools');
eq(mcpE2e('site/mcp/seeded.md', TABLE(['`search_modelz`'])), ['mcp-tool'], 'RED e2e: seeded bad platform tool');
eq(mcpE2e('orchestration/mcp/seeded.md', TABLE(['`find_services`', '`run_step`']) + '\nhttps://orchestration.civitai.com/mcp/v2\n'), [], 'GREEN e2e: real v2 tools + endpoint');
eq(mcpE2e('orchestration/mcp/seeded.md', TABLE(['`caption_media`']) + '\nhttps://orchestration.civitai.com/mcp/v9\n'), ['mcp-url', 'mcp-tool'], 'RED e2e: v1-only tool on a v2 page + unmapped endpoint');
eq(mcpE2e('public/agent-setup/prompt.md', 'https://mcp.civitai.com/mcp/v9\n'), ['mcp-url'], 'RED e2e: prompt names a URL the CLI does not register');

// External corpus, end to end on the real pins: one fake upstream page.
const extE2e = await gradeExternal([{ name: 'o/x', base: 'b', files: ['README.md'] }], real, {}, async () => ({
  ok: true,
  text: '```bash\ncivitai app validate --definitely-not-a-flag\n```\n`useViewer()` `useNoSuchHook()`\n',
}));
eq(extE2e[0].findings.map((f) => f.kind), ['cli', 'hook'], 'RED e2e: external page graded against the real pins');

console.log(`✓ test-doc-claims: ${n} assertions passed`);
