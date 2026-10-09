// Generate public/appblocks/hooks.json — the @civitai/blocks-react hook reference.
//
// Sources (published, pinned devDep):
//   - signatures: parse dist/index.d.ts with ts-morph, resolving each `use*`
//     re-export to its FunctionDeclaration (params + return type).
//   - lead prose + example + notes: the package README.md (one `### useX()`
//     section per hook — the lead is the text before its first ```tsx fence, the
//     example is that fence, the notes are everything after it, in order).
//     Falls back to the hook's own @example JSDoc / description.
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { log, resolvePackageRoot, writeArtifact } from './appblocks-util.mjs';
import { descriptionHasTable } from './lib/description-has-table.mjs';
import { parseReadme, scanSections, verifyPublished } from './lib/readme-hook-sections.mjs';

const pkgRoot = resolvePackageRoot('@civitai/blocks-react');
const version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;
const indexDts = join(pkgRoot, 'dist', 'index.d.ts');
const readmePath = join(pkgRoot, 'README.md');

// 🔴 COMPUTED ONCE AND STAMPED INTO THE ARTIFACT — the predicate itself lives in
// `lib/description-has-table.mjs`, imported above, because it is needed by two
// channels that render independently and a copy in each drifts. That module's
// doc comment carries the two earlier versions and why each was wrong; its
// fixture battery is `test-appblocks-hooks.mjs`.


// ── README: heading order + lead / example / notes per hook ───────────────────
// The splitter and its fail-loud guard live in `lib/readme-hook-sections.mjs`
// (so `test-appblocks-hooks.mjs` can drive them on fixtures). Its header carries
// the defect it replaced: everything after a hook's first ```tsx fence used to be
// dropped, and a section used to run on into whatever non-hook section followed.
const readmeText = readFileSync(readmePath, 'utf8');
const readmeSections = scanSections(readmeText);
const { order: readmeOrder, byHook } = parseReadme(readmeText);

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
    descriptionHasTable: descriptionHasTable(readme.prose || hooks[name].jsdocDesc || ''),
    example: readme.example || hooks[name].jsdocExample || '',
    exampleSource: readme.example ? 'readme' : hooks[name].jsdocExample ? 'jsdoc' : null,
    notes: readme.notes ?? [],
  });
}
for (const [name, h] of Object.entries(hooks)) {
  if (seen.has(name)) continue;
  ordered.push({
    ...h,
    description: h.jsdocDesc || '',
    descriptionHasTable: descriptionHasTable(h.jsdocDesc || ''),
    example: h.jsdocExample || '',
    exampleSource: h.jsdocExample ? 'jsdoc' : null,
    notes: [],
  });
}

if (ordered.length === 0) {
  throw new Error('gen-appblocks-hooks: parsed 0 hooks — refusing to write an empty artifact');
}

// 🔴 FAIL LOUD: every line of every hook's README section must be in its entry,
// and no entry may carry another section's heading. See `verifyPublished`.
const problems = verifyPublished(readmeSections, ordered);
if (problems.length) {
  throw new Error(
    `gen-appblocks-hooks: ${problems.length} hook(s) would publish less (or more) than their README section — ` +
      `refusing to write hooks.json:\n` +
      problems.map((p) => `  - ${p}`).join('\n'),
  );
}

const artifact = {
  generatedAt: new Date().toISOString(),
  reactPackage: `@civitai/blocks-react@${version}`,
  sources: [indexDts, readmePath],
  hooks: ordered,
};
const dest = writeArtifact('hooks.json', artifact);
const noEx = ordered.filter((h) => !h.example).map((h) => h.name);
const withNotes = ordered.filter((h) => h.notes.length).length;
log(`hooks: wrote ${ordered.length} hooks (${withNotes} with notes after the example) -> ${dest}`);
if (noEx.length) log(`  WARNING: no example for: ${noEx.join(', ')}`);
// README sections that sit inside the hook list but are not a hook (`### SfwGate`,
// …). They are deliberately NOT attached to the hook above them; name them so
// what this page does not carry is visible, not silent.
for (const s of readmeSections.interstitials) {
  const red = s.tokens.filter((t) => t.text.includes('🔴')).length;
  log(`  NOTE: README section ${JSON.stringify(s.heading)} is not a hook and is not on this page${red ? ` (${red} 🔴 line(s))` : ''}`);
}
log(`  from ${indexDts} + README.md (@civitai/blocks-react@${version})`);
