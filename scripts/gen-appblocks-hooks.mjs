// Generate public/appblocks/hooks.json — the @civitai/blocks-react hook reference.
//
// Sources (published, pinned devDep):
//   - signatures: parse dist/index.d.ts with ts-morph, resolving each `use*`
//     re-export to its FunctionDeclaration (params + return type).
//   - examples + prose: the package README.md (one `### useX()` heading with a
//     ```tsx fence per hook). Falls back to the hook's own @example JSDoc.
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { log, resolvePackageRoot, writeArtifact } from './appblocks-util.mjs';

const pkgRoot = resolvePackageRoot('@civitai/blocks-react');
const version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;
const indexDts = join(pkgRoot, 'dist', 'index.d.ts');
const readmePath = join(pkgRoot, 'README.md');

// ── README: heading order + example + prose per hook ──────────────────────────
function parseReadme(md) {
  const order = [];
  const byHook = {};
  const lines = md.split('\n');
  let current = null;
  let buf = [];
  const flush = () => {
    if (!current) return;
    const text = buf.join('\n');
    const fence = text.match(/```tsx\n([\s\S]*?)```/);
    const prose = text.slice(0, fence ? text.indexOf('```tsx') : text.length).trim();
    byHook[current] = {
      example: fence ? fence[1].replace(/\n+$/, '') : null,
      prose: prose || null,
    };
  };
  for (const line of lines) {
    const h = line.match(/^#{2,4}\s+`?(use[A-Za-z0-9]+)/);
    if (h) {
      flush();
      current = h[1];
      order.push(current);
      buf = [];
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return { order, byHook };
}

const { order: readmeOrder, byHook } = parseReadme(readFileSync(readmePath, 'utf8'));

// ── ts-morph: signatures + JSDoc ──────────────────────────────────────────────
const project = new Project({
  compilerOptions: {
    target: ScriptTarget.ES2020,
    module: ModuleKind.NodeNext,
    moduleResolution: ModuleResolutionKind.NodeNext,
    allowJs: true,
    declaration: true,
    skipLibCheck: true,
    noEmit: true,
  },
  skipAddingFilesFromTsConfig: true,
});
const sf = project.addSourceFileAtPath(indexDts);
project.resolveSourceFileDependencies();

const exported = sf.getExportedDeclarations();
const hooks = {};

for (const [name, decls] of exported) {
  if (!/^use[A-Z]/.test(name)) continue;
  const fn = decls.find((d) => typeof d.getParameters === 'function');
  if (!fn) continue;
  const params = fn.getParameters().map((p) => p.getText());
  const retNode = typeof fn.getReturnTypeNode === 'function' ? fn.getReturnTypeNode() : null;
  const ret = retNode ? retNode.getText() : fn.getReturnType?.().getText(fn) ?? 'unknown';
  const signature = `${name}(${params.join(', ')}): ${ret}`;
  // JSDoc @example fallback + description.
  let jsdocExample = null;
  let jsdocDesc = null;
  const docs = typeof fn.getJsDocs === 'function' ? fn.getJsDocs() : [];
  if (docs.length) {
    const doc = docs[docs.length - 1];
    jsdocDesc = doc.getDescription().trim() || null;
    for (const tag of doc.getTags()) {
      if (tag.getTagName() === 'example') {
        jsdocExample = (tag.getCommentText() || '').trim() || null;
      }
    }
  }
  hooks[name] = { name, signature, params, returnType: ret, jsdocExample, jsdocDesc };
}

// ── join, in README order, appending any d.ts-only hooks ──────────────────────
const ordered = [];
const seen = new Set();
for (const name of readmeOrder) {
  if (!hooks[name]) continue;
  seen.add(name);
  const readme = byHook[name] || {};
  ordered.push({
    ...hooks[name],
    description: readme.prose || hooks[name].jsdocDesc || '',
    example: readme.example || hooks[name].jsdocExample || '',
    exampleSource: readme.example ? 'readme' : hooks[name].jsdocExample ? 'jsdoc' : null,
  });
}
for (const [name, h] of Object.entries(hooks)) {
  if (seen.has(name)) continue;
  ordered.push({
    ...h,
    description: h.jsdocDesc || '',
    example: h.jsdocExample || '',
    exampleSource: h.jsdocExample ? 'jsdoc' : null,
  });
}

if (ordered.length === 0) {
  throw new Error('gen-appblocks-hooks: parsed 0 hooks — refusing to write an empty artifact');
}

const artifact = {
  generatedAt: new Date().toISOString(),
  reactPackage: `@civitai/blocks-react@${version}`,
  sources: [indexDts, readmePath],
  hooks: ordered,
};
const dest = writeArtifact('hooks.json', artifact);
const noEx = ordered.filter((h) => !h.example).map((h) => h.name);
log(`hooks: wrote ${ordered.length} hooks -> ${dest}`);
if (noEx.length) log(`  WARNING: no example for: ${noEx.join(', ')}`);
log(`  from ${indexDts} + README.md (@civitai/blocks-react@${version})`);
