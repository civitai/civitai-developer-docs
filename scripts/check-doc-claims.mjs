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
 * hand-written corpus and adds three more claim kinds.
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
 *
 * CORPUS: every tracked *.md outside node_modules/, claudedocs/,
 * appblocks-snapshots/ and the repo-meta files (README.md, CLAUDE.md), minus
 * whole GENERATED pages and minus every BEGIN/END GENERATED region (those are
 * graded by their generators' own guards). Lines inside a stripped region are
 * blanked, not removed, so reported line numbers are real.
 *
 * WHAT IT CANNOT SEE (stated so a green is read at its real scope)
 *   - Prose. "The CLI retries three times" is not a code span; nothing here
 *     parses it. Only the four claim SHAPES above are resolved.
 *   - A flag's MEANING or a hook's SIGNATURE — only existence. A doc that calls
 *     `--dry-run` "free" when it costs Buzz is green.
 *   - Positional arguments and flag VALUES (`--track bogus`).
 *   - Hooks inside non-ts fences (```js, untagged), and any identifier not
 *     shaped `useXxx` (`initialize`, `app.storage.get`).
 *   - OAuth scopes on site/ pages — a DIFFERENT scope set; the scope check runs
 *     only on namespaces the App Blocks enum owns, so a typo in a NEW namespace
 *     is invisible.
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
import { extractInvocations, helpBody, mentionsFlag } from './check-agent-setup.mjs';

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
 * Every checkable claim on one (already generated-stripped) page.
 * @param {string} md
 * @param {Set<string>} scopeNamespaces namespaces the scope enum uses
 */
export function extractClaims(md, scopeNamespaces, { hooks = true } = {}) {
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
  return { help, helpPath, schemaPath, scopes, fields, exportsInfo, scopeNamespaces: new Set([...scopes].map((s) => s.split(':')[0])) };
}

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

/** @returns {string|null} why the claim does not resolve, or null if it does. */
export function resolveClaim(c, src) {
  switch (c.kind) {
    case 'cli': {
      const r = resolveCommand(src.help, c.path);
      if (r.unknown) return `command \`civitai ${[...r.path, r.unknown].join(' ')}\` is not in the CLI help (\`civitai ${r.path.join(' ') || '(root)'}\` takes no positional argument)`;
      // A placeholder in a node that takes no positional stands for a command.
      if (c.templated && !takesArgs(r.body, r.path)) return null;
      const missing = c.flags.filter((f) => !mentionsFlag(r.body, f));
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
    default:
      throw new Error(`unknown claim kind ${c.kind}`);
  }
}

export const findingKey = (file, c) => [file, c.kind, c.claim].join(SEP);

/** Grade a set of pages. `pages` is [{file, md}] with md un-stripped. */
export function gradePages(pages, src) {
  const findings = [];
  const counts = { pages: 0, cli: 0, hook: 0, scope: 0, field: 0 };
  for (const { file, md } of pages) {
    const stripped = stripGenerated(md);
    if (stripped === null) continue;
    counts.pages++;
    const seen = new Set();
    for (const c of extractClaims(stripped, src.scopeNamespaces, { hooks: HOOK_SCOPE.test(file) })) {
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

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const src = loadSources();
  const problems = [];

  // Positive controls on the SOURCES: an empty source set makes every claim
  // unresolvable (loud) or, worse, a filter that skips everything (silent).
  if (src.exportsInfo.unresolved.length) problems.push(`package subpaths did not resolve: ${src.exportsInfo.unresolved.join(', ')}`);
  if (src.exportsInfo.names.size < 20) problems.push(`only ${src.exportsInfo.names.size} package exports loaded — the export probe is broken`);
  if (src.scopes.size === 0) problems.push(`${src.schemaPath} has no scope enum — wrong schema file?`);
  if (helpBody(src.help, ['app']) === null) problems.push(`${src.helpPath} has no \`civitai app\` node — not a help capture?`);

  const pages = corpusFiles().map((file) => ({ file, md: readFileSync(join(repoRoot, file), 'utf8') }));
  const { findings, counts } = gradePages(pages, src);
  // Positive control on EXTRACTION: the corpus has always carried hundreds of
  // CLI invocations and dozens of hook/scope spans. A zero is a broken parser.
  for (const k of ['cli', 'hook', 'scope']) if (counts[k] === 0) problems.push(`extracted 0 \`${k}\` claims — the extractor is broken`);

  const baseline = opts.baseline && existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
  const { fresh, stale } = compareBaseline(findings, baseline);

  if (opts.json) {
    console.log(JSON.stringify({ counts, findings, fresh: fresh.map((f) => f.key), stale, problems }, null, 2));
  } else {
    console.log(
      `doc claims — ${counts.pages} hand-written page(s): ${counts.cli} cli, ${counts.hook} hook, ` +
        `${counts.scope} scope, ${counts.field} manifest-field claim(s) resolved against\n` +
        `  cli:   ${src.helpPath.replace(repoRoot + '/', '')}\n` +
        `  hooks: ${src.exportsInfo.specifiers.length} subpath(s) of ${HOOK_PACKAGES.join(', ')} (${src.exportsInfo.names.size} exports)\n` +
        `  scope/field: ${src.schemaPath.replace(repoRoot + '/', '')}\n`,
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
