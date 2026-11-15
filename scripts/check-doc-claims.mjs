/**
 * check-doc-claims.mjs
 * --------------------
 * Resolves the machine-checkable CLAIMS in the HAND-WRITTEN pages against the
 * source they describe, so a guide that names a CLI flag, hook or scope that
 * does not exist goes red instead of shipping.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every other guard here grades a GENERATED page against its generator, or one
 * named hand-written page (agent-setup prompt, porting table, trust-model box)
 * against one named source. The ~80 hand-written guides and site pages had no
 * general check: `civitai app frobnicate --nope` in `apps/guide/*.md` stayed
 * green forever. `check-agent-setup.mjs` check 1 already resolves `civitai …`
 * invocations against the help snapshot — for two files. This generalises that
 * resolver (it IMPORTS the same extractor; one parser, not two) to the whole
 * hand-written corpus and adds five more claim kinds.
 *
 * CLAIM KINDS (each resolved against the PINNED source, never the network)
 *   cli     a `civitai …` / `npx @civitai/cli … ` invocation in a code block or a
 *           command-shaped inline span. The command path must be a node in the
 *           help snapshot and every flag must appear in that node's --help.
 *           Source: appblocks-snapshots/civitai-cli-help.txt.
 *   hook    an identifier shaped `useXxx` in an inline code span OUTSIDE a
 *           fence. It must be exported by one of HOOK_PACKAGES (pinned devDeps,
 *           every subpath in their `exports` map) or be a React built-in.
 *           Fenced ts/tsx is already compiled by test:snippets:appblocks.
 *   scope   an inline span shaped like an App Blocks scope (`ns:verb[:qual]`
 *           whose namespace is one the schema's scope enum uses). It must be a
 *           member of that enum. Source: the pinned app-sdk's bundled manifest
 *           schema — the SAME file the /apps/reference manifest page is
 *           generated from.
 *   field   a top-level key of a ```json fence that is a manifest (has a
 *           top-level "blockId"). It must be a schema `properties` key.
 *   mcp-url a Civitai MCP server URL (host in MCP_HOSTS, path under /mcp) on
 *           an MCP page (mcpSurface). On site/mcp/** and orchestration/mcp/**
 *           its path must be an endpoint the host's server maps; on
 *           public/agent-setup/prompt.md it must be a URL the CLI's
 *           `agent-setup --help` says it registers.
 *   mcp-tool a code span in the first cell of a `| Tool | … |` table on an MCP
 *           page. It must be registered by that page's server: civitai-mcp-
 *           server for site/mcp/**, orchestration's /mcp/v2 set for
 *           orchestration/mcp/**, either for the prompt.
 *           Source for both: appblocks-snapshots/mcp-server-tools.txt and
 *           orchestration-mcp-tools.txt (derived, kept fresh by
 *           check:snapshots; see scripts/lib/mcp-registries.mjs).
 *
 * The same kinds run NIGHTLY over docs in other repos (cli, civitai-app-
 * starters): scripts/check-external-doc-claims.mjs.
 *
 * CORPUS: every tracked *.md outside node_modules/, claudedocs/,
 * appblocks-snapshots/ and the repo-meta files (README.md, CLAUDE.md), minus
 * whole GENERATED pages and minus every BEGIN/END GENERATED region (those are
 * graded by their generators' own guards). Lines inside a stripped region are
 * blanked, not removed, so reported line numbers are real.
 *
 * WHAT IT CANNOT SEE (stated so a green is read at its real scope)
 *   - Prose. "The CLI retries three times" is not a code span; nothing here
 *     parses it. Only the six claim SHAPES above are resolved.
 *   - A flag's MEANING or a hook's SIGNATURE — only existence. A doc that calls
 *     `--dry-run` "free" when it costs Buzz is green.
 *   - Positional arguments and flag VALUES (`--track bogus`).
 *   - Hooks inside non-ts fences (```js, untagged), and any identifier not
 *     shaped `useXxx` (`initialize`, `app.storage.get`).
 *   - OAuth scopes on site/ pages — a DIFFERENT scope set; the scope check runs
 *     only on namespaces the App Blocks enum owns, so a typo in a NEW namespace
 *     is invisible.
 *   - Flags written in a bracketed synopsis (`[--yes]`): the shared extractor
 *     drops them (measured: 59 such flags in civitai/cli's README).
 *   - MCP tools named in PROSE, MCP prompts and resources, tool PARAMETERS, and
 *     which endpoint a page SHOULD name (/mcp vs /mcp/v2): a URL that exists
 *     is green wherever it appears. The host→server map (MCP_HOSTS) is a
 *     deployment fact neither server's source states.
 *   - Upstream movement: it grades against the PINNED snapshot/devDeps. A CLI
 *     release that drops a flag is only seen after the snapshot refresh lands.
 *     (A release mode that graded a release artifact was removed: no pipeline
 *     called it. Re-add it together with the release step that invokes it.)
 *
 * BASELINE (why this is not a permanently-red gate)
 *   Findings already on `main` when this landed are listed in
 *   scripts/doc-claims-baseline.json, keyed `file␟kind␟claim` (no line number —
 *   lines move on every edit). A finding NOT in the baseline fails. A baseline
 *   entry that no longer reproduces ALSO fails ("stale"), so fixing a doc forces
 *   the entry out and the list can only shrink. Never add an entry to make a PR
 *   green without a reason string a reviewer can check.
 *
 * USAGE
 *   npm run check:doc-claims
 *   node scripts/check-doc-claims.mjs [--no-baseline] [--json]
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { absoluteUrls, extractInvocations, helpBody, mentionsFlag } from './check-agent-setup.mjs';
import { MCP_HOSTS, MCP_SERVER_SNAPSHOT, ORCHESTRATION_SNAPSHOT, parseRegistry } from './lib/mcp-registries.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = join(repoRoot, 'scripts', 'doc-claims-baseline.json');
const SEP = '␟';

/** Packages whose exports satisfy a `useXxx` claim. Order is irrelevant. */
export const HOOK_PACKAGES = ['@civitai/blocks-react', '@civitai/sdk', '@civitai/app-sdk', '@civitai/components-react'];
/** React's own hooks — a guide legitimately names these. */
export const REACT_HOOKS = new Set([
  'useState', 'useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useCallback', 'useMemo',
  'useRef', 'useContext', 'useReducer', 'useId', 'useTransition', 'useDeferredValue',
  'useSyncExternalStore', 'useImperativeHandle', 'useDebugValue', 'useOptimistic',
  'useActionState', 'useFormStatus',
]);

const EXCLUDE_DIRS = /^(node_modules|claudedocs|appblocks-snapshots|\.github|\.claude)\//;
/** Hook claims are App Blocks claims; orchestration recipes use `usePrime`-style JSON params. */
export const HOOK_SCOPE = /^(apps|agent-setup|public\/agent-setup)\//;
const EXCLUDE_FILES = new Set(['README.md', 'CLAUDE.md']);

/**
 * The MCP surface of a page, which decides what its `mcp-*` claims mean:
 *   site          site/mcp/**: the platform server (civitai-mcp-server)
 *   orchestration orchestration/mcp/**: the orchestration server's /mcp/v2 set
 *   prompt        public/agent-setup/prompt.md: tells an agent which servers
 *                 `civitai agent-setup` REGISTERED, so its URLs are graded
 *                 against the CLI, not against what the servers serve.
 * Null for every other page: no `mcp-*` claims are extracted there.
 */
export function mcpSurface(file) {
  if (/^site\/mcp\//.test(file)) return 'site';
  if (/^orchestration\/mcp\//.test(file)) return 'orchestration';
  if (file === 'public/agent-setup/prompt.md') return 'prompt';
  return null;
}

// ---------------------------------------------------------------------------
// Corpus

/** Tracked markdown files that are hand-written (see CORPUS above). */
export function corpusFiles(root = repoRoot) {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', '*.md'], { encoding: 'utf8' });
  return out
    .split('\0')
    .filter(Boolean)
    .filter((f) => !EXCLUDE_DIRS.test(f) && !EXCLUDE_FILES.has(f));
}

/**
 * Blank out generated content, keeping the line count. Returns null for a page
 * that is generated whole.
 */
export function stripGenerated(md) {
  if (/^<!-- GENERATED PAGE\b/m.test(md)) return null;
  const lines = md.split('\n');
  let inRegion = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^<!-- BEGIN GENERATED: /.test(lines[i])) inRegion = true;
    const wasIn = inRegion;
    if (/^<!-- END GENERATED: /.test(lines[i])) inRegion = false;
    if (wasIn) lines[i] = '';
  }
  return lines.join('\n');
}

/**
 * Split a page into prose lines (fences blanked) and fenced blocks, keeping line
 * numbers. Fences are recognised at any indent (list-nested fences are the
 * normal way a step is written); the closing fence must use the same character
 * and be at least as long, per CommonMark.
 */
export function splitFences(md) {
  const lines = md.split('\n');
  const prose = [...lines];
  const fences = [];
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/.exec(lines[i]);
    if (!open) {
      if (m) open = { ch: m[1][0], len: m[1].length, lang: m[2].toLowerCase(), start: i + 1, body: [] };
      continue;
    }
    prose[i] = '';
    if (m && m[1][0] === open.ch && m[1].length >= open.len && !m[2]) {
      prose[open.start - 1] = '';
      fences.push({ lang: open.lang, line: open.start, body: open.body.join('\n') });
      open = null;
    } else {
      open.body.push(lines[i]);
    }
  }
  if (open) {
    // Unclosed fence runs to EOF (CommonMark); blank its opener too.
    prose[open.start - 1] = '';
    fences.push({ lang: open.lang, line: open.start, body: open.body.join('\n') });
  }
  return { prose, fences };
}

/** Inline code spans on prose lines, with their 1-based line number. */
function inlineSpans(proseLines) {
  const spans = [];
  proseLines.forEach((line, i) => {
    for (const m of line.matchAll(/(`+)([^`]+?)\1(?!`)/g)) spans.push({ text: m[2].trim(), line: i + 1 });
  });
  return spans;
}

// ---------------------------------------------------------------------------
// Extraction

const PLACEHOLDER = /^(?:…|\.\.\.|<[^>]*>)$/;

/** 1-based line of the first occurrence of `needle`, else 0. */
function lineOf(md, needle) {
  const at = md.indexOf(needle);
  return at === -1 ? 0 : md.slice(0, at).split('\n').length;
}

/**
 * Every Civitai MCP server URL in `text`, as `https://host/path` with no
 * trailing slash.
 *
 * 🔴 DUPLICATE, ON PURPOSE AND TEMPORARILY. civitai-developer-docs#349 adds this
 * same function (same name, same body) to check-agent-setup.mjs as part of its
 * check 8, which is not on `main` yet, and this PR is based on `main` (no stacked
 * PRs). Whichever of the two merges second deletes this copy and imports
 * `mcpServerUrls` from check-agent-setup.mjs, as `extractInvocations` is.
 */
export function mcpServerUrls(text) {
  const out = new Set();
  for (const raw of absoluteUrls(text)) {
    let u;
    try {
      u = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    } catch {
      continue;
    }
    if (!Object.hasOwn(MCP_HOSTS, u.hostname.toLowerCase())) continue;
    const path = u.pathname.replace(/\/+$/, '');
    if (!/^\/mcp(?:\/|$)/.test(path)) continue;
    out.add(`https://${u.hostname.toLowerCase()}${path}`);
  }
  return [...out];
}

/**
 * Tool names a page LISTS: the code spans in the first cell of each row of a
 * table whose header's first cell is `Tool`. That is the shape every MCP page
 * uses for its catalog. Prose mentions are NOT claims here: snake_case spans in
 * prose are as often a prompt, a `get_guide` topic or a status value
 * (`not_planned`), and a registry lookup cannot tell those apart.
 */
function toolTableSpans(proseLines) {
  const out = [];
  let inTable = false;
  proseLines.forEach((line, i) => {
    const cells = /^\s*\|(.*)\|\s*$/.exec(line)?.[1].split('|');
    if (!cells) {
      inTable = false;
      return;
    }
    const first = cells[0].trim();
    if (/^tool$/i.test(first)) {
      inTable = true;
      return;
    }
    if (!inTable || /^:?-{3,}:?$/.test(first)) return;
    for (const m of first.matchAll(/`([^`]+)`/g)) out.push({ text: m[1].trim(), line: i + 1 });
  });
  return out;
}

/**
 * Every checkable claim on one (already generated-stripped) page.
 * @param {string} md
 * @param {Set<string>} scopeNamespaces namespaces the scope enum uses
 * @param {{hooks?: boolean, mcp?: string|null}} opts `mcp` is the page's mcpSurface()
 */
export function extractClaims(md, scopeNamespaces, { hooks = true, mcp = null } = {}) {
  const claims = [];
  const { prose, fences } = splitFences(md);

  for (const inv of extractInvocations(md).civitai) {
    const line = lineOf(md, inv.raw) || lineOf(md, ['civitai', ...inv.path].join(' ')) || lineOf(md, inv.path.at(-1) ?? 'civitai');
    // `civitai … --json` / `civitai <command> --json`: a placeholder standing
    // where the command goes. The flags belong to an unnamed command, so only
    // the named prefix is a claim.
    const toks = inv.raw.split(/\s+/);
    const cliToks = toks[0] === 'npx' ? ['civitai', ...toks.slice(toks.findIndex((t) => t.startsWith('@civitai/cli')) + 1)] : toks;
    const after = cliToks[1 + inv.path.length];
    const templated = after !== undefined && PLACEHOLDER.test(after);
    claims.push({ kind: 'cli', claim: inv.raw, path: inv.path, flags: inv.flags, templated, line });
  }

  // A hook the page DEFINES itself (`function useApi()` in a porting recipe) is
  // the reader's code, not a package claim.
  const defined = new Set([...md.matchAll(/\b(?:function|const|let|var)\s+(use[A-Z][A-Za-z0-9]*)\b/g)].map((m) => m[1]));
  for (const { text, line } of inlineSpans(prose)) {
    if (hooks) {
      for (const m of text.matchAll(/(?<![\w$.])use[A-Z][A-Za-z0-9]*\b/g)) {
        if (!defined.has(m[0])) claims.push({ kind: 'hook', claim: m[0], line });
      }
    }
    const sm = /^([a-z]+)(?::[a-z]+){1,3}$/.exec(text);
    if (sm && scopeNamespaces.has(sm[1])) claims.push({ kind: 'scope', claim: text, line });
  }

  for (const f of fences) {
    if (f.lang !== 'json' && f.lang !== 'jsonc') continue;
    let obj;
    try {
      obj = JSON.parse(f.body);
    } catch {
      continue; // partial / commented snippets are prose-like; not a claim we can parse
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !('blockId' in obj)) continue;
    for (const key of Object.keys(obj)) claims.push({ kind: 'field', claim: key, line: f.line });
  }

  if (mcp) {
    // URLs anywhere on the page, fences included: a client-config block is where
    // most of them are.
    md.split('\n').forEach((line, i) => {
      for (const url of mcpServerUrls(line)) claims.push({ kind: 'mcp-url', claim: url, surface: mcp, line: i + 1 });
    });
    for (const { text, line } of toolTableSpans(prose)) {
      if (/^[a-z][a-z0-9_]*$/.test(text)) claims.push({ kind: 'mcp-tool', claim: text, surface: mcp, line });
    }
  }
  return claims;
}

// ---------------------------------------------------------------------------
// Sources of truth

/** Export names of every subpath in each package's `exports` map. */
export function packageExports(nodeModules, packages = HOOK_PACKAGES) {
  const specifiers = [];
  for (const pkg of packages) {
    const pj = join(nodeModules, pkg, 'package.json');
    if (!existsSync(pj)) throw new Error(`${pkg} is not installed under ${nodeModules} — run npm ci`);
    const exp = JSON.parse(readFileSync(pj, 'utf8')).exports ?? { '.': {} };
    for (const sub of Object.keys(exp)) {
      if (sub.includes('*') || /\.(css|json)$/.test(sub) || sub === './package.json') continue;
      specifiers.push(sub === '.' ? pkg : `${pkg}/${sub.slice(2)}`);
    }
  }
  const probe = join(nodeModules, '..', '__doc_claims_probe__.ts');
  const source = specifiers.map((s, i) => `import * as m${i} from '${s}';`).join('\n') + '\nexport {};\n';
  const host = ts.createCompilerHost({});
  const realRead = host.readFile.bind(host);
  host.readFile = (f) => (resolve(f) === resolve(probe) ? source : realRead(f));
  const realExists = host.fileExists.bind(host);
  host.fileExists = (f) => resolve(f) === resolve(probe) || realExists(f);
  const program = ts.createProgram({
    rootNames: [probe],
    options: { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, skipLibCheck: true, noEmit: true, jsx: ts.JsxEmit.ReactJSX },
    host,
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(probe);
  const names = new Set();
  const unresolved = [];
  sf.statements.filter(ts.isImportDeclaration).forEach((st, i) => {
    const sym = checker.getSymbolAtLocation(st.moduleSpecifier);
    if (!sym) return unresolved.push(specifiers[i]);
    for (const e of checker.getExportsOfModule(sym)) names.add(e.getName());
  });
  return { names, specifiers, unresolved };
}

export function loadSources() {
  const nodeModules = join(repoRoot, 'node_modules');
  const helpPath = join(repoRoot, 'appblocks-snapshots', 'civitai-cli-help.txt');
  const schemaPath = join(nodeModules, '@civitai', 'app-sdk', 'schemas', 'app-block', 'v1.json');
  const help = readFileSync(helpPath, 'utf8');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const scopes = new Set(schema?.properties?.scopes?.items?.enum ?? []);
  const fields = new Set(Object.keys(schema?.properties ?? {}));
  const exportsInfo = packageExports(nodeModules);
  return {
    help,
    helpPath,
    schemaPath,
    scopes,
    fields,
    exportsInfo,
    scopeNamespaces: new Set([...scopes].map((s) => s.split(':')[0])),
    ...loadMcpSources(help),
  };
}

/**
 * The MCP truth sets: each registry snapshot (endpoints + tools), and the URLs
 * the CLI's `agent-setup --help` says it registers. Node builtins only.
 */
export function loadMcpSources(help) {
  const registries = {};
  for (const snapshot of [MCP_SERVER_SNAPSHOT, ORCHESTRATION_SNAPSHOT]) {
    registries[snapshot] = parseRegistry(readFileSync(join(repoRoot, 'appblocks-snapshots', snapshot), 'utf8'));
  }
  const agentSetup = helpBody(help, ['agent-setup']);
  return { registries, cliMcpUrls: new Set(agentSetup === null ? [] : mcpServerUrls(agentSetup)) };
}

/** The registry an `mcp-tool` claim on this surface is graded against. */
const TOOL_REGISTRIES = {
  site: [MCP_SERVER_SNAPSHOT],
  orchestration: [ORCHESTRATION_SNAPSHOT],
  prompt: [MCP_SERVER_SNAPSHOT, ORCHESTRATION_SNAPSHOT],
};

// ---------------------------------------------------------------------------
// Resolution

/**
 * Does this node's Usage line declare a positional argument? The snapshot
 * carries cobra's `Usage:` block, e.g. `civitai app create [name] [dir] [flags]`
 * (yes) vs `civitai app [flags]` / `civitai app [command]` (no).
 */
export function takesArgs(body, path) {
  const m = /^Usage:\n((?:[ \t]+\S.*\n?)+)/m.exec(body);
  if (!m) return false;
  const head = ['civitai', ...path].join(' ');
  return m[1].split('\n').some((l) => {
    const t = l.trim();
    if (!t.startsWith(head + ' ')) return false;
    return t.slice(head.length).trim().split(/\s+/).some((tok) => tok && tok !== '[flags]' && tok !== '[command]');
  });
}

/**
 * Resolve the bare words of an invocation to the deepest snapshot node. The
 * extractor cannot tell `civitai app create my-app` (a positional NAME) from
 * `civitai app frobnicate` (a bogus SUBCOMMAND) — both are lowercase words. So:
 * descend while `path + word` is a node; the first word that is not is a
 * positional argument only if that node's Usage declares one, else it is an
 * unknown command.
 * @returns {{path: string[], body: string, unknown?: string}}
 */
export function resolveCommand(help, words) {
  const path = [];
  let body = helpBody(help, []);
  for (const w of words) {
    const next = helpBody(help, [...path, w]);
    if (next !== null) {
      path.push(w);
      body = next;
      continue;
    }
    return takesArgs(body, path) ? { path, body } : { path, body, unknown: w };
  }
  return { path, body };
}

const FLAG_SHAPE = /^--?[A-Za-z0-9]/;

/** @returns {string|null} why the claim does not resolve, or null if it does. */
export function resolveClaim(c, src) {
  switch (c.kind) {
    case 'cli': {
      const r = resolveCommand(src.help, c.path);
      if (r.unknown) return `command \`civitai ${[...r.path, r.unknown].join(' ')}\` is not in the CLI help (\`civitai ${r.path.join(' ') || '(root)'}\` takes no positional argument)`;
      // A placeholder in a node that takes no positional stands for a command.
      if (c.templated && !takesArgs(r.body, r.path)) return null;
      // Only tokens SHAPED like a flag are flag claims. The shared extractor
      // keeps the `-]` of a synopsis like `[--error-file <path>\|--error -]`
      // (measured on civitai/cli's README), which no reader takes for a flag.
      const missing = c.flags.filter((f) => FLAG_SHAPE.test(f) && !mentionsFlag(r.body, f));
      return missing.length ? `\`civitai ${r.path.join(' ') || '(root)'}\` has no ${missing.join(', ')}` : null;
    }
    case 'hook':
      return src.exportsInfo.names.has(c.claim) || REACT_HOOKS.has(c.claim)
        ? null
        : `\`${c.claim}\` is exported by none of ${HOOK_PACKAGES.join(', ')} (nor React)`;
    case 'scope':
      return src.scopes.has(c.claim) ? null : `\`${c.claim}\` is not in the manifest schema's scope enum`;
    case 'field':
      return src.fields.has(c.claim) ? null : `\`${c.claim}\` is not a manifest schema property`;
    case 'mcp-url': {
      if (c.surface === 'prompt') {
        return src.cliMcpUrls.has(c.claim)
          ? null
          : `${c.claim} is not an MCP server the CLI's \`agent-setup\` registers (its help names: ${[...src.cliMcpUrls].join(', ') || 'none'})`;
      }
      const u = new URL(c.claim);
      const snapshot = MCP_HOSTS[u.hostname];
      return src.registries[snapshot].endpoints.has(u.pathname)
        ? null
        : `${c.claim}: the server on ${u.hostname} maps no \`${u.pathname}\` endpoint (appblocks-snapshots/${snapshot}: ${[...src.registries[snapshot].endpoints].join(', ')})`;
    }
    case 'mcp-tool': {
      const snaps = TOOL_REGISTRIES[c.surface];
      return snaps.some((s) => src.registries[s].tools.has(c.claim))
        ? null
        : `tool \`${c.claim}\` is not registered by ${snaps.map((s) => `appblocks-snapshots/${s}`).join(' or ')}`;
    }
    default:
      throw new Error(`unknown claim kind ${c.kind}`);
  }
}

export const findingKey = (file, c) => [file, c.kind, c.claim].join(SEP);

export const CLAIM_KINDS = ['cli', 'hook', 'scope', 'field', 'mcp-url', 'mcp-tool'];

/**
 * Grade a set of pages. `pages` is [{file, md}] with md un-stripped.
 * `hooks(file)` / `mcp(file)` decide which page gets which claim kinds; the
 * defaults are this repo's paths. The external-corpus run passes its own.
 */
export function gradePages(pages, src, { hooks = (f) => HOOK_SCOPE.test(f), mcp = mcpSurface } = {}) {
  const findings = [];
  const counts = { pages: 0, ...Object.fromEntries(CLAIM_KINDS.map((k) => [k, 0])) };
  for (const { file, md } of pages) {
    const stripped = stripGenerated(md);
    if (stripped === null) continue;
    counts.pages++;
    const seen = new Set();
    for (const c of extractClaims(stripped, src.scopeNamespaces, { hooks: hooks(file), mcp: mcp(file) })) {
      counts[c.kind]++;
      const why = resolveClaim(c, src);
      if (!why) continue;
      const key = findingKey(file, c);
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ key, file, line: c.line, kind: c.kind, claim: c.claim, why });
    }
  }
  return { findings, counts };
}

/** New findings (not baselined) and stale baseline entries (no longer reproduce). */
export function compareBaseline(findings, baseline) {
  const keys = new Set(findings.map((f) => f.key));
  return {
    fresh: findings.filter((f) => !(f.key in baseline)),
    stale: Object.keys(baseline).filter((k) => !keys.has(k)),
  };
}

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { baseline: true, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-baseline') opts.baseline = false;
    else if (a === '--json') opts.json = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

/**
 * Positive controls on the SOURCES: an empty source set makes every claim
 * unresolvable (loud) or, worse, a filter that skips everything (silent).
 * Shared with the external-corpus run, which grades against the same pins.
 */
export function sourceProblems(src) {
  const problems = [];
  if (src.exportsInfo.unresolved.length) problems.push(`package subpaths did not resolve: ${src.exportsInfo.unresolved.join(', ')}`);
  if (src.exportsInfo.names.size < 20) problems.push(`only ${src.exportsInfo.names.size} package exports loaded — the export probe is broken`);
  if (src.scopes.size === 0) problems.push(`${src.schemaPath} has no scope enum — wrong schema file?`);
  if (helpBody(src.help, ['app']) === null) problems.push(`${src.helpPath} has no \`civitai app\` node — not a help capture?`);
  if (src.cliMcpUrls.size === 0) problems.push(`${src.helpPath}'s agent-setup section names no MCP server URL — the extractor or the snapshot is broken`);
  for (const [snapshot, r] of Object.entries(src.registries)) {
    if (!r.tools.size || !r.endpoints.size) problems.push(`appblocks-snapshots/${snapshot} has ${r.endpoints.size} endpoint(s) and ${r.tools.size} tool(s) — not a registry snapshot?`);
  }
  return problems;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const src = loadSources();
  const problems = sourceProblems(src);

  const pages = corpusFiles().map((file) => ({ file, md: readFileSync(join(repoRoot, file), 'utf8') }));
  const { findings, counts } = gradePages(pages, src);
  // Positive control on EXTRACTION: the corpus has always carried hundreds of
  // CLI invocations, dozens of hook/scope spans and manifest keys, and the MCP
  // pages list dozens of tools and name both servers. A zero is a broken parser.
  for (const k of CLAIM_KINDS) if (counts[k] === 0) problems.push(`extracted 0 \`${k}\` claims — the extractor is broken`);

  const baseline = opts.baseline && existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
  const { fresh, stale } = compareBaseline(findings, baseline);

  if (opts.json) {
    console.log(JSON.stringify({ counts, findings, fresh: fresh.map((f) => f.key), stale, problems }, null, 2));
  } else {
    console.log(
      `doc claims — ${counts.pages} hand-written page(s): ${counts.cli} cli, ${counts.hook} hook, ` +
        `${counts.scope} scope, ${counts.field} manifest-field, ${counts['mcp-url']} mcp-url, ${counts['mcp-tool']} mcp-tool claim(s) resolved against\n` +
        `  cli:   ${src.helpPath.replace(repoRoot + '/', '')}\n` +
        `  hooks: ${src.exportsInfo.specifiers.length} subpath(s) of ${HOOK_PACKAGES.join(', ')} (${src.exportsInfo.names.size} exports)\n` +
        `  scope/field: ${src.schemaPath.replace(repoRoot + '/', '')}\n` +
        `  mcp:   appblocks-snapshots/${MCP_SERVER_SNAPSHOT}, appblocks-snapshots/${ORCHESTRATION_SNAPSHOT}, and the help snapshot's agent-setup section (${src.cliMcpUrls.size} URL(s))\n`,
    );
    console.log(`${findings.length} unresolved claim(s), ${findings.length - fresh.length} baselined, ${fresh.length} new, ${stale.length} stale baseline entr${stale.length === 1 ? 'y' : 'ies'}`);
    for (const f of fresh) console.log(`  ✗ NEW   ${f.file}:${f.line} [${f.kind}] ${f.why}`);
    for (const k of stale) console.log(`  ✗ STALE ${k.split(SEP).join(' · ')} — no longer reproduces; delete it from scripts/doc-claims-baseline.json`);
    for (const p of problems) console.log(`  ✗ ${p}`);
  }
  if (fresh.length || stale.length || problems.length) process.exit(1);
  if (!opts.json) console.log('\n✓ every checkable claim resolves (or is baselined).');
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
