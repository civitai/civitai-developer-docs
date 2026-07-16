#!/usr/bin/env node
/**
 * typecheck-appblocks-snippets.mjs
 * --------------------------------
 * The App Blocks snippet drift-guard. Extracts every ```ts / ```tsx fenced
 * block from the hand-written App Blocks docs (apps/**\/*.md) and runs
 * `tsc --noEmit` against each one, resolving imports against the PINNED,
 * PUBLISHED SDK declarations installed as devDeps:
 *   - @civitai/app-sdk        (dist/**\/*.d.ts, + subpaths)
 *   - @civitai/blocks-react   (dist/index.d.ts, dist/ui/index.d.ts)
 *
 * This keeps the prose examples from rotting: if a documented hook is renamed,
 * a call signature changes, or a return shape drifts (e.g. the docs show
 * `useViewer()` with the wrong return shape), this fails in CI with the
 * file:line + the tsc error.
 *
 * Ported from civitai-app-starters `scripts/typecheck-readme-snippets.mjs`
 * (the SDK repo's `typecheck:readme` gate), adapted for a docs repo that
 * consumes the SDK as installed npm devDeps rather than as monorepo packages.
 *
 * WHAT IT CHECKS
 *   - Imports from `@civitai/app-sdk` (+ subpaths) and `@civitai/blocks-react`
 *     (+ `/ui`) RESOLVE against the pinned declarations.
 *   - The documented exports EXIST and are CALLED with type-compatible args.
 *
 * WHAT IT TOLERATES (so partial doc snippets still pass)
 *   - Free identifiers a snippet references but doesn't declare (e.g. `modelId`,
 *     `prompt`, `manifest`). These surface as TS2304/TS2552/TS18004; the runner
 *     injects a real SDK import when the name is a known SDK export, else a
 *     `declare const X: any; type X = any;` shim, and re-checks. A genuine API
 *     error (wrong args, missing export, bad shape) has a different code and
 *     still fails.
 *   - RELATIVE module imports the doc author owns (`./block.manifest.json`,
 *     `./App`) — these are the reader's own files, NOT an SDK contract, so a
 *     `TS2307 Cannot find module './…'` on a relative specifier is tolerated.
 *     A BARE unresolved import (`@civitai/…`, `react`) is a real drift and
 *     still fails.
 *   - `TS2347` (type args on an `any`-shimmed callee) — a shimming artifact.
 *   - Unused locals/params (relaxed compiler flags).
 *
 * OPT-OUT
 *   Put `// @ts-skip-snippet` (optionally `// @ts-skip-snippet: <reason>`) as
 *   the FIRST non-empty line of a fenced block to skip it — for intentionally
 *   incomplete or illustrative snippets that can't be made to typecheck without
 *   distorting the doc. The reason is printed in the run summary.
 *
 * USAGE
 *   npm run test:snippets:appblocks
 *   Requires the pinned SDK devDeps + typescript + @types/{react,node} to be
 *   installed (`npm ci`).
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePackageRoot } from './appblocks-util.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const SDK_ROOT = resolvePackageRoot('@civitai/app-sdk');
const BLOCKS_ROOT = resolvePackageRoot('@civitai/blocks-react');
const SDK_DIST = join(SDK_ROOT, 'dist');
const BLOCKS_DIST = join(BLOCKS_ROOT, 'dist');

// Published subpaths a doc author imports from, mapped to the installed
// declaration entry. Used to (a) resolve free identifiers to a REAL import so
// import-omitting reference fragments validate against the true types, and
// (b) typecheck the imports themselves.
const ENTRYPOINTS = [
  { module: '@civitai/app-sdk', dts: join(SDK_DIST, 'index.d.ts') },
  { module: '@civitai/app-sdk/oauth', dts: join(SDK_DIST, 'oauth/index.d.ts') },
  { module: '@civitai/app-sdk/scopes', dts: join(SDK_DIST, 'scopes/index.d.ts') },
  { module: '@civitai/app-sdk/cookies', dts: join(SDK_DIST, 'cookies/index.d.ts') },
  { module: '@civitai/app-sdk/orchestrator', dts: join(SDK_DIST, 'orchestrator/index.d.ts') },
  { module: '@civitai/app-sdk/blocks', dts: join(SDK_DIST, 'blocks/index.d.ts') },
  { module: '@civitai/blocks-react', dts: join(BLOCKS_DIST, 'index.d.ts') },
  { module: '@civitai/blocks-react/ui', dts: join(BLOCKS_DIST, 'ui/index.d.ts') },
];

// tsconfig `paths` so tsc resolves the SDK modules regardless of exports-map
// conditions — every entrypoint plus a wildcard subpath fallback into dist.
const TSCONFIG_PATHS = {
  '@civitai/app-sdk': [join(SDK_DIST, 'index.d.ts')],
  '@civitai/app-sdk/*': [join(SDK_DIST, '*')],
  '@civitai/blocks-react': [join(BLOCKS_DIST, 'index.d.ts')],
  '@civitai/blocks-react/*': [join(BLOCKS_DIST, '*')],
};

const TMP_PARENT = join(repoRoot, '.appblocks-snippet-tmp');
const SKIP_MARKER = '@ts-skip-snippet';

/* ─────────────────────────────  doc discovery  ───────────────────────────── */

function walkMarkdown(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walkMarkdown(full));
    else if (s.isFile() && name.endsWith('.md')) out.push(full);
  }
  return out;
}

/* ───────────────────────────────  export map  ────────────────────────────── */

/**
 * identifier -> import-module for every VALUE export across the entrypoints,
 * via the TypeScript compiler API (resolves nested `export * from` re-exports a
 * regex can't). First-wins on collisions (entry order above), so a bare
 * `@civitai/app-sdk` import is preferred over a subpath.
 */
function buildExportMap(ts) {
  const map = new Map();
  if (!ts) return map;
  const opts = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    allowJs: true,
    noEmit: true,
  };
  for (const { module, dts } of ENTRYPOINTS) {
    if (!existsSync(dts)) continue;
    const prog = ts.createProgram([dts], opts);
    const checker = prog.getTypeChecker();
    const sf = prog.getSourceFile(dts);
    const sym = sf && checker.getSymbolAtLocation(sf);
    if (!sym) continue;
    for (const exp of checker.getExportsOfModule(sym)) {
      let resolved = exp;
      if ((exp.flags & ts.SymbolFlags.Alias) !== 0) {
        try {
          resolved = checker.getAliasedSymbol(exp);
        } catch {
          resolved = exp;
        }
      }
      if ((resolved.flags & ts.SymbolFlags.Value) === 0) continue;
      const name = exp.getName();
      if (!map.has(name)) map.set(name, module);
    }
  }
  return map;
}

/* ─────────────────────────────  fence extraction  ────────────────────────── */

function extractBlocks(md, file) {
  const lines = md.split('\n');
  const blocks = [];
  let inBlock = false;
  let lang = '';
  let buf = [];
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```(\w+)?/);
    if (!inBlock && fence) {
      inBlock = true;
      lang = (fence[1] ?? '').toLowerCase();
      buf = [];
      startLine = i + 1;
      continue;
    }
    if (inBlock && /^```\s*$/.test(line)) {
      inBlock = false;
      if (lang === 'ts' || lang === 'tsx') {
        blocks.push({ file, lang, startLine, code: buf.join('\n') });
      }
      continue;
    }
    if (inBlock) buf.push(line);
  }
  return blocks;
}

function firstNonEmptyLine(code) {
  for (const l of code.split('\n')) {
    if (l.trim().length) return l.trim();
  }
  return '';
}

/** Split a snippet into leading import lines and the rest. */
function splitImports(code) {
  const lines = code.split('\n');
  const imports = [];
  const body = [];
  let stillImports = true;
  let inImport = false;
  for (const line of lines) {
    const t = line.trim();
    if (stillImports && (inImport || /^import[\s{*]/.test(t) || /^import\s+\w/.test(t))) {
      imports.push(line);
      if (/;?\s*$/.test(t) && (t.endsWith(';') || /from\s+['"][^'"]+['"]/.test(t) || /['"];?$/.test(t))) {
        inImport = false;
      } else {
        inImport = true;
      }
      continue;
    }
    if (stillImports && t === '') {
      body.push(line);
      continue;
    }
    stillImports = false;
    body.push(line);
  }
  return { imports: imports.join('\n'), body: body.join('\n') };
}

/**
 * Assemble a typecheckable module: imports hoisted, `declare`d free-var shims,
 * then the body at MODULE scope (top-level await / hooks-as-statements / the
 * snippet's own top-level `function App() {}` all stay valid). Strip a leading
 * `export ` and guarantee the file is a module.
 */
function buildSource({ imports, body }, { autoImports = '', declares = '' } = {}) {
  const bodyNoExport = body.replace(/^(\s*)export\s+/gm, '$1');
  const hasModuleSyntax = imports.trim().length > 0 || autoImports.trim().length > 0;
  return [imports, autoImports, declares, bodyNoExport, hasModuleSyntax ? '' : 'export {};']
    .filter(Boolean)
    .join('\n');
}

function makeTsconfig(dir, isTsx) {
  const cfg = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      jsx: isTsx ? 'react-jsx' : undefined,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      noEmit: true,
      noUnusedLocals: false,
      noUnusedParameters: false,
      types: ['node', 'react'],
      typeRoots: [join(repoRoot, 'node_modules', '@types')],
      paths: TSCONFIG_PATHS,
      baseUrl: '.',
    },
    include: ['snippet.ts', 'snippet.tsx'],
  };
  cfg.compilerOptions = JSON.parse(JSON.stringify(cfg.compilerOptions));
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(cfg, null, 2));
}

function tscBin() {
  const bin = join(repoRoot, 'node_modules/.bin/tsc');
  if (existsSync(bin)) return bin;
  return 'tsc';
}

function runTsc(dir) {
  try {
    execFileSync(tscBin(), ['-p', join(dir, 'tsconfig.json')], {
      cwd: dir,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return { ok: true, out: '' };
  } catch (err) {
    return { ok: false, out: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

/** Free-identifier names a snippet uses but doesn't declare. */
function collectMissingNames(out) {
  const names = new Set();
  for (const re of [
    /error TS2304: Cannot find name '([^']+)'/g,
    /error TS2552: Cannot find name '([^']+)'/g,
    /error TS18004: No value exists in scope for the shorthand property '([^']+)'/g,
  ]) {
    let m;
    while ((m = re.exec(out)) !== null) names.add(m[1]);
  }
  return names;
}

/**
 * Is this a diagnostic line we tolerate rather than treat as a doc bug?
 *   TS2347 — type args on an `any`-shimmed callee (a shimming artifact).
 *   TS2307 — module-not-found ONLY for a RELATIVE specifier ('./…'/'../…'),
 *            i.e. a file the doc author owns, not an SDK contract we verify.
 *            A bare specifier (`@civitai/…`, `react`) is real drift → NOT
 *            tolerated.
 */
function isToleratedDiagnostic(line) {
  const code = line.match(/error (TS\d+):/);
  if (!code) return false;
  if (code[1] === 'TS2347') return true;
  if (code[1] === 'TS2307') {
    const spec = line.match(/Cannot find module '([^']+)'/);
    if (spec && /^\.\.?\//.test(spec[1])) return true;
  }
  return false;
}

/** Remaining hard (real) error lines after dropping tolerated diagnostics. */
function hardErrorLines(out) {
  return out.split('\n').filter((line) => /error TS\d+:/.test(line) && !isToleratedDiagnostic(line));
}

function renderAutoImports(autoByModule) {
  const lines = [];
  for (const [module, names] of autoByModule) {
    lines.push(`import { ${[...names].join(', ')} } from '${module}';`);
  }
  return lines.join('\n');
}

function checkBlock(block, exportMap) {
  const isTsx = block.lang === 'tsx';
  const { imports, body } = splitImports(block.code);
  const declared = new Set();
  const autoByModule = new Map();
  const alreadyImported = new Set([...imports.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1]));
  mkdirSync(TMP_PARENT, { recursive: true });
  const dir = mkdtempSync(join(TMP_PARENT, 'snip-'));
  try {
    makeTsconfig(dir, isTsx);
    const fileName = isTsx ? 'snippet.tsx' : 'snippet.ts';
    let lastOut = '';
    for (let pass = 0; pass < 12; pass++) {
      const declares = [...declared].map((n) => `declare const ${n}: any;\ntype ${n} = any;`).join('\n');
      const autoImports = renderAutoImports(autoByModule);
      const src = buildSource({ imports, body }, { autoImports, declares });
      writeFileSync(join(dir, fileName), src);
      const { ok, out } = runTsc(dir);
      if (ok) return { ok: true };
      lastOut = out;
      const missing = collectMissingNames(out);
      let added = false;
      for (const n of missing) {
        if (declared.has(n) || alreadyImported.has(n)) continue;
        const mod = exportMap.get(n);
        if (mod) {
          if (!autoByModule.has(mod)) autoByModule.set(mod, new Set());
          const set = autoByModule.get(mod);
          if (!set.has(n)) {
            set.add(n);
            added = true;
          }
        } else {
          declared.add(n);
          added = true;
        }
      }
      if (!added) {
        const hard = hardErrorLines(out);
        if (hard.length === 0) return { ok: true };
        return { ok: false, out: hard.join('\n') };
      }
    }
    return { ok: false, out: hardErrorLines(lastOut).join('\n') || lastOut };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ────────────────────────────────────  main  ─────────────────────────────── */

function main() {
  for (const dts of [join(SDK_DIST, 'index.d.ts'), join(BLOCKS_DIST, 'index.d.ts')]) {
    if (!existsSync(dts)) {
      console.error(
        `ERROR: SDK declarations missing at ${dts}.\n` +
          'Install the pinned devDeps first:  npm ci',
      );
      process.exit(2);
    }
  }

  let ts;
  try {
    ts = require('typescript');
  } catch {
    console.error('ERROR: `typescript` is not installed. Run `npm ci`.');
    process.exit(2);
  }

  const exportMap = buildExportMap(ts);
  console.log(`Resolved ${exportMap.size} SDK value exports for auto-import.`);
  console.log(`  @civitai/app-sdk      -> ${relative(repoRoot, SDK_DIST)}`);
  console.log(`  @civitai/blocks-react -> ${relative(repoRoot, BLOCKS_DIST)}\n`);

  const files = walkMarkdown(join(repoRoot, 'apps')).sort();
  let total = 0;
  let checked = 0;
  let skipped = 0;
  const failures = [];

  for (const file of files) {
    const rel = relative(repoRoot, file);
    const blocks = extractBlocks(readFileSync(file, 'utf8'), rel);
    for (const block of blocks) {
      total++;
      const first = firstNonEmptyLine(block.code);
      if (first.includes(SKIP_MARKER)) {
        skipped++;
        const reason = first.split(SKIP_MARKER)[1]?.replace(/^[:\s]+/, '') || '(no reason given)';
        console.log(`  SKIP  ${rel}:${block.startLine} [${block.lang}] — ${reason}`);
        continue;
      }
      const res = checkBlock(block, exportMap);
      if (res.ok) {
        checked++;
        console.log(`  PASS  ${rel}:${block.startLine} [${block.lang}]`);
      } else {
        console.log(`  FAIL  ${rel}:${block.startLine} [${block.lang}]`);
        failures.push({ rel, line: block.startLine, lang: block.lang, out: res.out });
      }
    }
  }

  rmSync(TMP_PARENT, { recursive: true, force: true });

  console.log(
    `\nApp Blocks snippets: ${total} found · ${checked} passed · ${skipped} skipped · ${failures.length} failed`,
  );

  if (failures.length) {
    console.error('\n--- failures (a doc snippet drifted from the pinned SDK) ---');
    for (const f of failures) {
      console.error(`\n${f.rel}:${f.line} [${f.lang}]`);
      console.error(f.out.trim());
    }
    process.exit(1);
  }
}

main();
