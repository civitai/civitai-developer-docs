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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolvePackageRoot } from './appblocks-util.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** The page whose snippet is pinned. */
export const QUICKSTART = 'apps/guide/quickstart.md';

/** The host slotId a page app is mounted under. */
export const PAGE_SLOT_ID = 'app.page';

/**
 * The type-level fixture. Every `@ts-expect-error` is an assertion that the
 * line below it DOES NOT compile; tsc fails if any of them starts compiling.
 */
export const FIXTURE = `
import type { BlockContext, ModelSlotContext } from '@civitai/app-sdk/blocks';

/**
 * The page surface, mirroring the host's PageContext. The published SDK exports
 * BlockContext and ModelSlotContext but NO page type, which is why the
 * quickstart narrows locally — and why this mirror is written out here.
 */
type PageContext = BlockContext & {
  slotId: '${PAGE_SLOT_ID}';
  slug: string;
  subPath: string;
};

declare const page: PageContext;
declare const model: ModelSlotContext;

// (a) 'app.page' is not one of the model slots.
// @ts-expect-error page slot is not a ModelSlotContext slot
const _slot: ModelSlotContext['slotId'] = '${PAGE_SLOT_ID}';

// (b) A page context is not a ModelSlotContext: it lacks every model field.
// @ts-expect-error a page context is missing modelId/modelVersionId/modelName
const _narrowed: ModelSlotContext = page;

// (c) The exact read the buggy quickstart performed. On the page shape
//     'modelName' is not a declared property, so this must not compile.
// @ts-expect-error modelName does not exist on a page context
const _bad: string = page.modelName;

// (d) POSITIVE CONTROL: the same read IS valid on a real model slot, so the
//     three failures above are about the SURFACE, not about a broken fixture
//     or an unresolved import.
const _good: string = model.modelName;
const _pageSlug: string = page.slug;

export { _slot, _narrowed, _bad, _good, _pageSlug };
`;

function tscBin() {
  const bin = join(repoRoot, 'node_modules/.bin/tsc');
  return existsSync(bin) ? bin : 'tsc';
}

/** Compile FIXTURE against the pinned SDK. Returns {ok, out}. */
export function runFixture(source = FIXTURE) {
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

function main() {
  console.log('Page-surface context guard — the quickstart scaffolds a `page` app\n');

  const problems = [];

  // --- 1. Type level, against the pinned SDK. ---
  const res = runFixture();
  if (res.ok) {
    console.log('  ✓ page context and ModelSlotContext are incompatible in the pinned SDK');
    console.log('    (3 @ts-expect-error assertions held; the model-slot positive control compiled)');
  } else {
    console.error('  ✗ the type-level fixture did not behave as pinned:\n');
    console.error(res.out.trim());
    console.error('');
    console.error('  An "unused @ts-expect-error" here means a page context BECAME assignable to');
    console.error('  ModelSlotContext in the pinned SDK — re-read this file before relaxing it.');
    problems.push('type-level');
  }

  // --- 2. Source level: what the quickstart actually teaches. ---
  const md = readFileSync(join(repoRoot, QUICKSTART), 'utf8');
  const blocks = tsxBlocks(md);
  if (blocks.length === 0) {
    // Positive control: a zero-block scan is indistinguishable from a clean one.
    console.error(`  ✗ found ZERO \`\`\`tsx blocks in ${QUICKSTART} — the extractor or the page changed.`);
    problems.push('no-blocks');
  } else {
    const pageBlocks = blocks.filter((b) => b.includes('useBlockContext'));
    if (pageBlocks.length === 0) {
      console.error(`  ✗ no useBlockContext() snippet found in ${QUICKSTART}`);
      problems.push('no-context-snippet');
    }
    for (const b of pageBlocks) {
      const code = stripComments(b);
      if (/\bas\s+ModelSlotContext\b/.test(code)) {
        console.error(`  ✗ ${QUICKSTART} narrows the host context to ModelSlotContext.`);
        console.error('    This page scaffolds a `page` app; the host sends slotId "app.page" and');
        console.error('    none of the model fields, so that cast reads undefined at runtime.');
        problems.push('model-slot-cast');
      }
      // Match the DECLARATION, not the string anywhere: `slotId: 'app.page'`.
      // See stripComments() — a comment naming the slot is not a declaration.
      if (!new RegExp(`slotId\\s*:\\s*'${PAGE_SLOT_ID.replace('.', '\\.')}'`).test(code)) {
        console.error(`  ✗ ${QUICKSTART}'s context snippet does not DECLARE slotId: '${PAGE_SLOT_ID}'.`);
        console.error('    The page shape is what makes the snippet correct — state it in the type,');
        console.error('    not only in a comment (a comment there was a surviving mutant once).');
        problems.push('no-page-slot');
      }
    }
    if (!problems.length) {
      console.log(`  ✓ ${QUICKSTART} narrows to the page shape (slotId '${PAGE_SLOT_ID}'), not ModelSlotContext`);
    }
  }

  if (problems.length) {
    console.error('\n--- PAGE-SURFACE CONTEXT DRIFT ---');
    console.error('\nThe quickstart is the first block a reader writes, and a page/model-slot');
    console.error('mix-up compiles cleanly and fails only at runtime, as `undefined`.');
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
