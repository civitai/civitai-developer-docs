#!/usr/bin/env node
/**
 * check-page-context.mjs
 * ----------------------
 * Pins the PAGE-surface context type the quickstart teaches.
 *
 * THE BUG THIS EXISTS TO STOP COMING BACK
 * ---------------------------------------
 * `civitai app create` scaffolds a **page** app, and the quickstart's own
 * project declares a `page` surface — but the snippet narrowed the host context
 * with `context as ModelSlotContext` and then rendered `{model.modelName}`.
 *
 * That is wrong, and it is wrong SILENTLY. Verified against the host at
 * `civitai/src/components/AppBlocks/`:
 *   - `PageBlockHost.tsx`'s `buildContext(): PageContext` returns exactly
 *     `{ slotId: 'app.page', entityType: 'none', slug, subPath, viewerUserId,
 *        viewerUsername, theme }` — no `modelId`, no `modelVersionId`, no
 *        `modelName`.
 *   - `types.ts` types `ModelSlotContext.slotId` as
 *     `'model.sidebar_top' | 'model.below_images' | 'model.actions_extra'`,
 *     disjoint from `PageContext.slotId: 'app.page'`.
 * So the reader's very first block renders "running on undefined".
 *
 * WHY THE SNIPPET TYPECHECKER CANNOT CATCH IT
 * -------------------------------------------
 * `test:snippets:appblocks` compiles each snippet against the pinned SDK. The
 * WRONG version compiled perfectly — `ModelSlotContext` is a real exported type
 * and `modelName` is a real property on it, so tsc has nothing to complain
 * about. Measured: the whole suite was `31 found · 31 passed` both before and
 * after the fix. A green snippet run is therefore NOT evidence about which
 * surface the snippet describes, which is precisely why this guard exists
 * separately rather than being folded into that one.
 *
 * WHAT IS CHECKED
 *   1. TYPE-LEVEL, against the PINNED SDK declarations (not against prose):
 *      that a page context and `ModelSlotContext` are genuinely incompatible.
 *      Each expectation is an `@ts-expect-error`, which is self-inverting: if a
 *      future SDK ever makes one of them legal, the directive becomes unused
 *      and tsc fails on it, forcing a human to re-read this file rather than
 *      letting the guard quietly stop asserting anything.
 *   2. SOURCE-LEVEL: the quickstart's page snippet must not narrow the host
 *      context to `ModelSlotContext`, and must pin `slotId: 'app.page'`.
 *
 * USAGE
 *   npm run check:page-context
 */

import { execFileSync } from 'node:child_process';
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
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolvePackageRoot } from './appblocks-util.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** The page whose page-context declaration is pinned in full. */
export const QUICKSTART = 'apps/guide/quickstart.md';

/** Every hand-authored App Blocks page is scanned for the cross-surface rule. */
export const DOC_ROOT = 'apps';

/** The host slotId a page app is mounted under. */
export const PAGE_SLOT_ID = 'app.page';

/**
 * Fields the host sends ONLY on a model slot. A page context carries none of
 * them, so naming one in a page type — or reading one off a page context — is
 * the bug. From `ModelSlotContext` in civitai/civitai `AppBlocks/types.ts`.
 */
export const MODEL_ONLY_FIELDS = [
  'modelId',
  'modelVersionId',
  'modelName',
  'modelType',
  'modelNsfwLevel',
  'creatorUserId',
];

/**
 * Body fields the host honours ONLY for page apps and rejects fail-closed on a
 * model-bound token (documented in apps/guide/text-to-image.md's
 * page-vs-model constraints table). A snippet that narrows to ModelSlotContext
 * and then sends one of these is self-contradictory whichever way you read it.
 */
export const PAGE_ONLY_BODY_FIELDS = ['additionalResources', 'sourceImage', 'sourceImages'];

/**
 * 🔴 THE FIXTURE SPLICES IN THE QUICKSTART'S REAL DECLARATION — it does not
 * carry its own copy.
 *
 * An earlier version hardcoded the page type here and never read the page it
 * claimed to pin. That made the whole type-level half a statement about this
 * file: adding `modelName: string` to the quickstart's own `PageContext` and
 * rendering `{page.modelName}` reproduced the ORIGINAL bug and the guard still
 * exited 0. The declaration is now extracted from the markdown and compiled, so
 * the fixture tests the shape a reader actually copies.
 */
export function buildFixture(pageTypeDecl) {
  return `
import type { BlockContext, ModelSlotContext } from '@civitai/app-sdk/blocks';

// --- verbatim from ${QUICKSTART} ---
${pageTypeDecl}
// --- end ---

declare const page: PageContext;
declare const model: ModelSlotContext;

// (a) 'app.page' is not one of the model slots.
// @ts-expect-error page slot is not a ModelSlotContext slot
const _slot: ModelSlotContext['slotId'] = '${PAGE_SLOT_ID}';

// (b) A page context is not a ModelSlotContext: it lacks every model field.
// @ts-expect-error a page context is missing modelId/modelVersionId/modelName
const _narrowed: ModelSlotContext = page;

// (c) The exact read the buggy quickstart performed.
//     🔴 THE MECHANISM IS NOT "modelName is undeclared". BlockContext carries an
//     index signature ([key: string]: unknown), so 'page.modelName' RESOLVES —
//     as \`unknown\` — and compiles fine unannotated. What fails is the
//     ASSIGNMENT: TS2322, unknown is not assignable to string. So this assertion
//     is satisfied by any undeclared name (page.bananaField would too); it pins
//     "a page context yields no typed model field", not "modelName is absent".
//     The narrower claim is carried by the source check below, which rejects the
//     model-only names in the declaration itself.
// @ts-expect-error page.modelName is 'unknown' via the index signature, not a string
const _bad: string = page.modelName;

// (d) POSITIVE CONTROL: the same read IS valid on a real model slot, so the
//     three failures above are about the SURFACE, not a broken fixture or an
//     unresolved import.
const _good: string = model.modelName;
const _pageSlug: string = page.slug;

export { _slot, _narrowed, _bad, _good, _pageSlug };
`;
}

function tscBin() {
  const bin = join(repoRoot, 'node_modules/.bin/tsc');
  return existsSync(bin) ? bin : 'tsc';
}

/**
 * Compile a fixture against the SDK.
 *
 * 🔴 "PINNED" IS AN ASSUMPTION THIS SCRIPT CANNOT CHECK. `resolvePackageRoot`
 * reads whatever is INSTALLED in node_modules, which is only the package.json
 * pin after an `npm ci`. A stale working tree can hold a different version — the
 * shared base clone of this repo sat on app-sdk 0.28.0 / blocks-react 0.37.0
 * against a 0.31.0 / 0.39.0 pin — so a LOCAL green here can be a statement about
 * the wrong declarations entirely. CI runs `npm ci` first, which masks it. The
 * installed version is printed at the top of the run so the number is visible
 * rather than assumed; if it disagrees with package.json, run `npm ci` before
 * believing any result from this file.
 */
export function runFixture(source) {
  const SDK_DIST = join(resolvePackageRoot('@civitai/app-sdk'), 'dist');
  const parent = join(repoRoot, '.page-context-tmp');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, 'run-'));
  try {
    writeFileSync(join(dir, 'fixture.ts'), source);
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            lib: ['ES2022', 'DOM'],
            strict: true,
            skipLibCheck: true,
            noEmit: true,
            types: [],
            baseUrl: '.',
            paths: {
              '@civitai/app-sdk': [join(SDK_DIST, 'index.d.ts')],
              '@civitai/app-sdk/*': [join(SDK_DIST, '*')],
            },
          },
          include: ['fixture.ts'],
        },
        null,
        2
      )
    );
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
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(parent, { recursive: true, force: true });
  }
}

/** Pull the fenced ```tsx blocks out of a markdown page. */
export function tsxBlocks(markdown) {
  const out = [];
  const re = /^```tsx\s*$([\s\S]*?)^```\s*$/gm;
  for (const m of markdown.matchAll(re)) out.push(m[1]);
  return out;
}

/**
 * Strip `//` and block comments from a snippet.
 *
 * 🔴 LOAD-BEARING, and it was earned by a surviving mutant. The slot assertion
 * below first read `block.includes("'app.page'")`, and the snippet's own
 * explanatory comment spells out the host payload — `{ slotId: 'app.page',
 * entityType: 'none', … }`. So a mutation that changed the real declaration to
 * `slotId: string` left the guard GREEN: it was satisfied by prose describing
 * the right thing while the code did the wrong thing. Comments are documentation
 * of intent; only the declaration is the claim. Strip them, then match the
 * declaration.
 */
export function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the locally-declared page context type from a snippet, verbatim.
 * Returns null when no `type PageContext = …;` declaration is present.
 *
 * 🔴 BRACE-BALANCED, NOT LAZY-TO-FIRST-SEMICOLON. The obvious
 * `/type\s+PageContext\s*=[\s\S]*?;\s*$/m` stops at the first semicolon that
 * ends a line — which inside `{ slotId: 'app.page'; slug: string; }` is the
 * FIRST MEMBER. It spliced an unbalanced brace into the fixture and tsc failed
 * with eight TS1005 syntax errors, i.e. the guard would have "failed" for a
 * reason that had nothing to do with the types. Track depth and stop at the
 * terminating `;` at depth 0.
 */
export function pageTypeDeclaration(code) {
  const start = /type\s+PageContext\s*=/.exec(code);
  if (!start) return null;
  let depth = 0;
  for (let i = start.index; i < code.length; i++) {
    const c = code[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ';' && depth === 0) return code.slice(start.index, i + 1);
  }
  return null;
}

/** Recursively collect `.md` files under a directory. */
function collectMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectMarkdown(full, out);
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

function main() {
  console.log('Page-surface context guard — page apps vs model slots\n');

  const problems = [];
  const sdkVersion = JSON.parse(
    readFileSync(join(resolvePackageRoot('@civitai/app-sdk'), 'package.json'), 'utf8')
  ).version;
  const pinned = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).devDependencies[
    '@civitai/app-sdk'
  ];
  console.log(`  · @civitai/app-sdk INSTALLED ${sdkVersion} (package.json pins ${pinned})`);
  if (sdkVersion !== pinned) {
    // See runFixture()'s header: a local tree can hold a different version.
    console.error(`  ✗ installed SDK (${sdkVersion}) != pin (${pinned}) — run \`npm ci\`.`);
    console.error('    Every type-level result below would otherwise describe the wrong package.');
    problems.push('sdk-version-mismatch');
  }

  // --- 1. The quickstart's OWN page declaration, compiled against the SDK. ---
  const md = readFileSync(join(repoRoot, QUICKSTART), 'utf8');
  const blocks = tsxBlocks(md);
  if (blocks.length === 0) {
    // Positive control: a zero-block scan is indistinguishable from a clean one.
    console.error(`  ✗ found ZERO \`\`\`tsx blocks in ${QUICKSTART} — the extractor or the page changed.`);
    problems.push('no-blocks');
  }
  const ctxBlocks = blocks.filter((b) => b.includes('useBlockContext'));
  if (!ctxBlocks.length && blocks.length) {
    console.error(`  ✗ no useBlockContext() snippet found in ${QUICKSTART}`);
    problems.push('no-context-snippet');
  }

  for (const b of ctxBlocks) {
    const code = stripComments(b);

    if (/\bas\s+ModelSlotContext\b/.test(code)) {
      console.error(`  ✗ ${QUICKSTART} narrows the host context to ModelSlotContext.`);
      console.error('    This page scaffolds a `page` app; the host sends slotId "app.page" and');
      console.error('    none of the model fields, so that cast reads undefined at runtime.');
      problems.push('model-slot-cast');
    }

    const decl = pageTypeDeclaration(code);
    if (!decl) {
      console.error(`  ✗ ${QUICKSTART} declares no local \`type PageContext = …\`.`);
      problems.push('no-page-type');
      continue;
    }

    // Match the DECLARATION, not the string anywhere. See stripComments().
    if (!new RegExp(`slotId\\s*:\\s*'${PAGE_SLOT_ID.replace('.', '\\.')}'`).test(decl)) {
      console.error(`  ✗ ${QUICKSTART}'s PageContext does not DECLARE slotId: '${PAGE_SLOT_ID}'.`);
      problems.push('no-page-slot');
    }

    // 🔴 THE SHAPE, not just the cast. Casting correctly to a page type that
    // has grown `modelName: string` reproduces the original bug exactly, and
    // the cast-only check could not see it.
    const smuggled = MODEL_ONLY_FIELDS.filter((f) => new RegExp(`\\b${f}\\s*[?]?\\s*:`).test(decl));
    if (smuggled.length) {
      console.error(`  ✗ ${QUICKSTART}'s PageContext declares model-slot field(s): ${smuggled.join(', ')}.`);
      console.error('    The host sends NONE of these on a page surface, so declaring one makes the');
      console.error('    type assert a field that is always undefined — the original bug, relabelled.');
      problems.push('model-fields-in-page-type');
    }

    // Compile the REAL declaration (not a copy) against the SDK.
    const res = runFixture(buildFixture(decl));
    if (res.ok) {
      console.log(`  ✓ ${QUICKSTART}'s own PageContext is incompatible with ModelSlotContext`);
      console.log('    (3 @ts-expect-error assertions held; the model-slot positive control compiled)');
    } else {
      console.error('  ✗ the quickstart\'s page type did not behave as pinned:\n');
      console.error(res.out.trim());
      console.error('');
      console.error('  An "unused @ts-expect-error" means a page context BECAME assignable to');
      console.error('  ModelSlotContext — re-read this file before relaxing it.');
      problems.push('type-level');
    }
  }

  // --- 2. Repo-wide: no snippet may be a model slot AND send page-only fields. ---
  // Scoping this guard to the quickstart is what let the same confusion sit
  // unnoticed in text-to-image.md, where a ModelSlotContext cast sent
  // `additionalResources` that the very same page marks FORBIDDEN on a slot.
  const pages = collectMarkdown(join(repoRoot, DOC_ROOT));
  let scanned = 0;
  for (const file of pages) {
    const rel = relative(repoRoot, file);
    for (const raw of tsxBlocks(readFileSync(file, 'utf8'))) {
      const code = stripComments(raw);
      if (!/\bas\s+ModelSlotContext\b/.test(code)) continue;
      scanned++;
      const bad = PAGE_ONLY_BODY_FIELDS.filter((f) => new RegExp(`\\b${f}\\s*:`).test(code));
      if (bad.length) {
        console.error(`  ✗ ${rel} — a ModelSlotContext snippet sends page-only field(s): ${bad.join(', ')}.`);
        console.error('    Both readings break: on a model slot the host rejects it fail-closed with');
        console.error('    a FORBIDDEN the block cannot diagnose; as a page app the ModelSlotContext');
        console.error('    cast yields undefined modelId/modelVersionId. Make it a page app that');
        console.error('    takes the ids from a resource picker.');
        problems.push(`page-only-field-on-model-slot:${rel}`);
      }
    }
  }
  console.log(`  ✓ scanned ${scanned} ModelSlotContext snippet(s) across ${pages.length} ${DOC_ROOT}/ page(s) for page-only fields`);
  if (scanned === 0) {
    // Zero is indistinguishable from a broken extractor: text-to-image.md and
    // the reference pages legitimately narrow to ModelSlotContext.
    console.error('  ✗ found ZERO ModelSlotContext snippets — the extractor or the corpus changed,');
    console.error('    so this rule checked nothing. It is not evidence of cleanliness.');
    problems.push('no-model-slot-snippets');
  }

  if (problems.length) {
    console.error('\n--- PAGE-SURFACE CONTEXT DRIFT ---');
    console.error('\nA page/model-slot mix-up COMPILES cleanly and fails only at runtime — as');
    console.error('`undefined` fields, or as a FORBIDDEN the block cannot diagnose.');
    console.error(`Failed: ${problems.join(', ')}`);
    process.exit(1);
  }

  console.log('\nPage-surface context: pinned.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    console.error(`check-page-context: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  }
}
