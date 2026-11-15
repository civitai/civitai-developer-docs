/**
 * mcp-registries.mjs
 * ------------------
 * The two MCP tool registries the docs describe, as DERIVED snapshots: the
 * endpoint paths each server maps and the tool names it registers, one per
 * line, sorted. Shared by the two scripts that touch them, so the format has
 * one reader and one writer:
 *   - scripts/check-appblocks-snapshots.mjs DERIVES the text from each repo's
 *     `main` (nightly, in appblocks-drift.yml) and diffs it with the committed
 *     file under appblocks-snapshots/;
 *   - scripts/check-doc-claims.mjs PARSES the committed file to resolve the
 *     `mcp-tool` / `mcp-url` claims on the MCP pages (every PR, offline).
 *
 * WHY DERIVED, NOT A BYTE COPY. The tool names live in ~15 module files per
 * server, next to descriptions and handlers that change for reasons that never
 * touch a name. Byte-snapshotting them would be red on most nightly runs (the
 * argument PINNED_CONSTANTS in check-appblocks-snapshots.mjs makes for the
 * limits table). And civitai-orchestration is a PRIVATE repo: a byte copy of
 * its source in this PUBLIC repo would publish it. The names and paths are
 * already public: the docs list them and `tools/list` returns them.
 *
 * WHY THESE SOURCE FILES (the most stable extractable source for each).
 *   civitai-mcp-server  src/server.ts's `modules` array names every tool
 *                       module `createServer` loads; each module registers its
 *                       tools as `reg('<name>', …)`. The README table and the
 *                       landing page/llms.txt are DOWNSTREAM of that registry
 *                       (the README by hand, unasserted; llms.txt only on the
 *                       deployed server), so they can lag it. The endpoint is
 *                       the `app.post('/mcp', …)` route in src/index.ts.
 *   civitai-orchestration  McpEndpoints.cs is where the endpoints are mapped
 *                       (`V1Path`, `V2Path`) and where the `V2Tools` type list
 *                       is written; each type is `Tools/<Type>.cs` and marks
 *                       its tools `[McpServerTool(Name = "<name>")]`. Only the
 *                       /mcp/v2 set is recorded: v1 is frozen, and the docs
 *                       describe v2. Reading `src/Civitai.Orchestration.McpServer/
 *                       Tools/**` by directory listing would need the contents
 *                       API and would pick up the frozen V1 classes too.
 *
 * WHAT A DERIVATION CANNOT SEE: a tool registered some other way (a loop over
 * a table, a name held in a constant), a module loaded outside `modules` /
 * `V2Tools`, or a type whose file is not named after it (that one fails LOUD:
 * the fetch 404s). A pattern that stops matching is drift, never a skip.
 *
 * Node builtins only (none, in fact): check-appblocks-snapshots.mjs imports
 * this, and nothing that guard imports may need node_modules.
 */

export const MCP_SERVER_SNAPSHOT = 'mcp-server-tools.txt';
export const ORCHESTRATION_SNAPSHOT = 'orchestration-mcp-tools.txt';

/**
 * Which server answers on which host. A DEPLOYMENT fact: neither repo's source
 * names its public host, so this table is the one hand-kept link between a URL
 * a page names and the registry that URL is graded against.
 */
export const MCP_HOSTS = {
  'mcp.civitai.com': MCP_SERVER_SNAPSHOT,
  'orchestration.civitai.com': ORCHESTRATION_SNAPSHOT,
};

const HEADER = {
  [MCP_SERVER_SNAPSHOT]: [
    '# civitai-mcp-server tool registry. DERIVED by scripts/lib/mcp-registries.mjs from',
    "# civitai/civitai-mcp-server@main: src/index.ts (endpoint), src/server.ts `modules` +",
    "# src/tools/<module>.ts `reg('<name>', …)` (tools). Edit only to apply the lines",
    '# `npm run check:snapshots` reports as added/removed.',
  ],
  [ORCHESTRATION_SNAPSHOT]: [
    '# civitai-orchestration MCP registry. DERIVED by scripts/lib/mcp-registries.mjs from',
    '# civitai/civitai-orchestration@main (a PRIVATE repo; only names and paths are kept):',
    '# McpEndpoints.cs V1Path/V2Path (endpoints) and the V2Tools types\' Tools/<Type>.cs',
    '# [McpServerTool(Name = "<name>")] (tools: the /mcp/v2 set). Edit only to apply the',
    '# lines `npm run check:snapshots` reports as added/removed.',
  ],
};

/** The snapshot text for a registry. Deterministic: sorted, no dates or shas. */
export function renderRegistry(snapshot, { endpoints, tools }) {
  return [
    ...HEADER[snapshot],
    ...[...new Set(endpoints)].sort().map((e) => `endpoint ${e}`),
    ...[...new Set(tools)].sort().map((t) => `tool ${t}`),
    '',
  ].join('\n');
}

/** @returns {{endpoints: Set<string>, tools: Set<string>}} */
export function parseRegistry(text) {
  const endpoints = new Set();
  const tools = new Set();
  for (const line of text.split('\n')) {
    const m = /^(endpoint|tool) (\S+)$/.exec(line);
    if (m) (m[1] === 'endpoint' ? endpoints : tools).add(m[2]);
  }
  return { endpoints, tools };
}

/**
 * A derivation returns {ok:true, text} or the FIRST failed fetch as-is
 * ({ok:false, gone|network, reason, url}), or {ok:false, unmatched:true,
 * reason} when a source no longer has the shape this reads — which the guard
 * reports as drift.
 *
 * @param {(path: string) => Promise<{ok: boolean, text?: string}>} fetchText
 */
export async function deriveMcpServerRegistry(fetchText) {
  const unmatched = (reason) => ({ ok: false, unmatched: true, reason });
  const index = await fetchText('src/index.ts');
  if (!index.ok) return index;
  const endpoints = [...index.text.matchAll(/\bapp\.post\(\s*'(\/[^']*)'/g)].map((m) => m[1]);
  if (!endpoints.length) return unmatched("src/index.ts has no `app.post('/…'` route");

  const server = await fetchText('src/server.ts');
  if (!server.ok) return server;
  // The array's BODY only: its type annotation (`Array<{ …; mod: ToolModule }>`)
  // has the same `mod: <name> }` shape.
  const body = /\bconst modules\b[^=]*=\s*\[([\s\S]*?)\];/.exec(server.text)?.[1] ?? '';
  const modules = [...body.matchAll(/\bmod:\s*(\w+)\s*\}/g)].map((m) => m[1]);
  if (!modules.length) return unmatched('src/server.ts has no `const modules = [{ …, mod: <name> }, …]`');
  const tools = [];
  for (const mod of modules) {
    const imp = new RegExp(String.raw`import\s*\{[^}]*\b${mod}\b[^}]*\}\s*from\s*'\./tools/([\w-]+)\.js'`).exec(server.text);
    if (!imp) return unmatched(`src/server.ts loads \`${mod}\` but no \`./tools/<file>.js\` import provides it`);
    const file = await fetchText(`src/tools/${imp[1]}.ts`);
    if (!file.ok) return file;
    const names = [...file.text.matchAll(/\breg\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
    if (!names.length) return unmatched(`src/tools/${imp[1]}.ts registers no \`reg('<name>', …)\` tool`);
    tools.push(...names);
  }
  return { ok: true, text: renderRegistry(MCP_SERVER_SNAPSHOT, { endpoints, tools }) };
}

const ORCH_DIR = 'src/Civitai.Orchestration.McpServer';

export async function deriveOrchestrationRegistry(fetchText) {
  const unmatched = (reason) => ({ ok: false, unmatched: true, reason });
  const ep = await fetchText(`${ORCH_DIR}/Infrastructure/McpEndpoints.cs`);
  if (!ep.ok) return ep;
  const endpoints = [...ep.text.matchAll(/\bconst string V\d+Path = "(\/[^"]*)"/g)].map((m) => m[1]);
  if (!endpoints.length) return unmatched('McpEndpoints.cs has no `const string V<n>Path = "/…"`');
  const list = /\bV2Tools\s*=\s*\[([^\]]*)\]/.exec(ep.text);
  const types = list ? [...list[1].matchAll(/typeof\((\w+)\)/g)].map((m) => m[1]) : [];
  if (!types.length) return unmatched('McpEndpoints.cs has no `V2Tools = [typeof(…), …]` list');
  const tools = [];
  for (const type of types) {
    const file = await fetchText(`${ORCH_DIR}/Tools/${type}.cs`);
    if (!file.ok) return file;
    const names = [...file.text.matchAll(/\[McpServerTool\(\s*Name\s*=\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
    if (!names.length) return unmatched(`Tools/${type}.cs has no [McpServerTool(Name = "…")] method`);
    tools.push(...names);
  }
  return { ok: true, text: renderRegistry(ORCHESTRATION_SNAPSHOT, { endpoints, tools }) };
}

/** Lines only one side has, for a drift message a human can apply by hand. */
export function registryDelta(committed, upstream) {
  const a = new Set(committed.split('\n').filter((l) => !l.startsWith('#') && l));
  const b = new Set(upstream.split('\n').filter((l) => !l.startsWith('#') && l));
  return { added: [...b].filter((l) => !a.has(l)), removed: [...a].filter((l) => !b.has(l)) };
}
