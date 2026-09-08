#!/usr/bin/env node
// Assertions over the BUILT site — the channel nothing in CI had ever compiled.
//
//   npm run build && npm run check:built-site
//
// 🔴 WHY THIS EXISTS. Until this landed, no workflow in .github/workflows/ ran
// `vitepress build` (measured: `grep -rn "vitepress build\|npm run build"
// .github/workflows/` returned nothing). Every `.vue` file under
// .vitepress/theme/ was therefore never compiled, never rendered and never
// asserted on by CI — the HTML channel of the CLI reference had no gate at all,
// while the .md/LLM channel of the SAME content has had one since #49
// (scripts/test-appblocks-cli.mjs, the `STRUCTURAL` check). The residual was
// declared in that PR; this closes it.
//
// Three mutants, each measured on the merged tree at 30f52a0, each of which
// left the ENTIRE node suite green AND `vitepress build` exiting 0:
//
//   1. delete the `<pre v-if="longText(c)" class="ab-long">` line
//      -> built cli.html goes 44 `.ab-long` blocks -> 0. The published page
//         silently loses every cobra `Long` body.
//   2. `{{ longText(c) }}` -> `{{ c.description }}`
//      -> still 44 blocks, each now the one-line summary already printed
//         directly above it. A COUNT-ONLY assertion does not see this, which is
//         why the check below recomputes the expected bodies instead.
//   3. `<code>{{ longText(c) }}</code>` -> `<code v-html="longText(c)">`
//      -> builds fine, and 15 of the 44 bodies then emit their `<slug>` /
//         `<path>` / `<token>` placeholders as raw markup into the DOM. Not XSS
//         today (every byte is generator-derived from a committed help
//         snapshot), but a real rendering break — and after HTML-unescaping the
//         bodies still compare EQUAL, so only the raw-markup assertion catches
//         it.
//
// The same gap was pre-existing for `.ab-example`, so both blocks are covered.
//
// SHAPE OF THE ASSERTION, and why it is not a count. Counts are what mutant 2
// defeats. Each family is compared, IN ORDER, against what the generator says
// should be there — recomputed from public/appblocks/cli.json through the SAME
// shared predicate the component itself calls (`cliLongBody` in
// .vitepress/theme/components/cliReference.shared.mjs). Never by reading the
// page back into itself, and never by duplicating the predicate here: a second
// copy is how the two views drift apart, which is the whole reason that module
// exists outside the SFC.
//
// Escaping is asserted in BOTH directions, because either one alone is
// satisfiable by a broken renderer:
//   - unescape the built block, require it to equal the source EXACTLY (a
//     renderer that drops or mangles content fails), and
//   - require the RAW block to contain no unescaped tag-shaped `<` (a renderer
//     that stops escaping fails, which the first direction cannot see because
//     unescaping raw `<slug>` yields `<slug>`).
//
// POSITIVE CONTROL. A zero must never read as clean. Both families assert a
// minimum block count on the BUILT html AND on the EXPECTED set, so a build
// that rendered an empty component, an artifact with no commands, or a selector
// that stopped matching fails loudly instead of reporting a serene pass over
// nothing.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './appblocks-util.mjs';
import { cliLongBody } from '../.vitepress/theme/components/cliReference.shared.mjs';
import { LANDING_PAGE, PROMPT_PATH, PROMPT_SOURCE, PROMPT_URL } from '../.vitepress/agent-setup.mjs';
import { renderPromptRegion } from './agent-setup-page.mjs';

// MEASURED on the build at 30f52a0: 44 `.ab-long` and 46 `.ab-example` blocks,
// from a 52-command artifact. The floors carry slack because an upstream
// command removal or re-wording legitimately moves the count and is not a
// defect; the EQUALITY assertions below are what make this tight anyway. Their
// only job is to reject a ZERO — or a near-zero — that would otherwise pass
// equality vacuously (`[] === []`).
const LONG_BLOCK_FLOOR = 40;
const EXAMPLE_BLOCK_FLOOR = 40;

const distDir = argValue('--dist') ?? join(repoRoot, '.vitepress', 'dist');
const cliPage = join(distDir, 'apps', 'reference', 'cli.html');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function assertEqual(got, want, msg) {
  if (got !== want) throw new Error(`${msg} — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}

/**
 * The bodies of every `<pre class="<cls>"><code>…</code></pre>` block, RAW —
 * still HTML-escaped, in document order.
 *
 * The class is matched as the WHOLE `class` attribute value, not with
 * `includes`, so `ab-long` cannot be matched by some future `ab-long-foo`. The
 * scoped-style attribute VitePress emits (`data-v-<hash>`) is deliberately not
 * pinned: that hash changes whenever the SFC changes, which is every time this
 * check matters.
 */
function rawBlocks(html, cls) {
  const re = new RegExp(`<pre class="${cls}"[^>]*>\\s*<code[^>]*>([\\s\\S]*?)</code>\\s*</pre>`, 'g');
  const blocks = [...html.matchAll(re)].map((m) => m[1]);

  // 🔴 CONTROL ON THE EXTRACTOR ITSELF. A regex that stopped matching returns
  // [] — indistinguishable from "the renderer emitted nothing", which is a
  // REAL defect this file must report accurately rather than blame on markup
  // it failed to parse. So count the class attribute independently: if the
  // page mentions the class more often than the pattern extracted, the pattern
  // is what broke (the component grew a wrapper, reordered its attributes, or
  // stopped nesting a <code>), not the content.
  const mentions = [...html.matchAll(new RegExp(`class="${cls}"`, 'g'))].length;
  if (mentions !== blocks.length) {
    throw new Error(
      `check-built-site: the built page mentions \`class="${cls}"\` ${mentions} time(s) but the ` +
        `<pre>…<code>…</code></pre> pattern extracted ${blocks.length} block(s). The EXTRACTOR in ` +
        `scripts/check-built-site.mjs is out of date with CliReference.vue's markup — fix it before ` +
        `reading any verdict from this file, because a broken selector reports the same [] a deleted ` +
        `block would.`,
    );
  }
  return blocks;
}

/** Undo the five entities Vue's text interpolation produces, plus numeric refs. */
function unescapeHTML(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // `&amp;` LAST, or `&amp;lt;` in the source would decode twice.
    .replace(/&amp;/g, '&');
}

if (!existsSync(cliPage)) {
  console.error(
    `check-built-site: ${cliPage} does not exist.\n` +
      `  The site has not been built. Run \`npm run build\` first (its \`prebuild\` hook runs\n` +
      `  copy:spec + gen:appblocks, which produce the gitignored public/appblocks/*.json the\n` +
      `  theme imports), then re-run this check.`,
  );
  process.exit(1);
}

const html = readFileSync(cliPage, 'utf8');
const artifactPath = join(repoRoot, 'public', 'appblocks', 'cli.json');
if (!existsSync(artifactPath)) {
  console.error(
    `check-built-site: ${artifactPath} does not exist — run \`npm run gen:appblocks:cli\`.\n` +
      `  This check compares the built HTML against the generator's own artifact; without it\n` +
      `  there is nothing to compare to and a pass would mean nothing.`,
  );
  process.exit(1);
}
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
const commands = artifact.commands ?? [];

console.log(`BUILT SITE — ${cliPage}`);

check('POSITIVE CONTROL — the page was built from a non-empty artifact', () => {
  // Without this, every equality below is satisfiable by "the artifact has no
  // commands, so nothing was expected, and nothing was found".
  assert(
    commands.length >= 40,
    `public/appblocks/cli.json carries only ${commands.length} commands (floor 40, measured 52) — ` +
      `the artifact is empty or truncated, so every assertion in this file would pass vacuously. ` +
      `Re-run \`npm run gen:appblocks:cli\`.`,
  );
  assert(
    html.includes('class="ab-cli"'),
    'the built apps/reference/cli.html contains no `.ab-cli` root — <CliReference> did not render at all. ' +
      'Check that apps/reference/cli.md still uses the component and that it is registered in ' +
      '.vitepress/theme/index.ts.',
  );
  assert(
    !html.includes('No CLI reference generated'),
    'the built page rendered <CliReference>\'s EMPTY state — it was built with no `appblocks:cli` data. ' +
      'The build ran without `npm run gen:appblocks`.',
  );
});

/**
 * One family of `<pre>` blocks: assert the count floor, then the exact content
 * in order, then that the content is properly escaped.
 *
 * @param {object} spec
 * @param {string} spec.cls          the `class` attribute value, e.g. `ab-long`
 * @param {number} spec.floor        minimum blocks that must be present
 * @param {string[]} spec.want       the expected bodies, in order, UNESCAPED
 * @param {string[]} spec.owners     the command each expected body belongs to
 * @param {string} spec.source       where in the component this is rendered
 */
function checkFamily({ cls, floor, want, owners, source }) {
  let got = [];
  check(`\`.${cls}\`: the extractor still matches this component's markup`, () => {
    // Runs FIRST, and its failure is a statement about this script rather than
    // about the site — see the control inside rawBlocks().
    got = rawBlocks(html, cls);
  });

  check(`\`.${cls}\`: at least ${floor} blocks are present in the built HTML`, () => {
    // 🔴 THE ZERO GUARD. Mutant 1 (deleting the render line) leaves the build
    // green and the page structurally fine — it simply has none of these
    // blocks. Equality alone would then compare [] against a want that ALSO has
    // to be non-empty to disagree, so the floor is asserted on BOTH sides.
    assert(
      want.length >= floor,
      `the generator yields only ${want.length} \`.${cls}\` bodies (floor ${floor}) — the ARTIFACT or the ` +
        `shared predicate lost them, not the renderer. Check public/appblocks/cli.json and ` +
        `.vitepress/theme/components/cliReference.shared.mjs.`,
    );
    assert(
      got.length >= floor,
      `the built apps/reference/cli.html carries only ${got.length} \`.${cls}\` blocks (floor ${floor}) — ` +
        `the published HTML has LOST this content. Check ${source} in ` +
        `.vitepress/theme/components/CliReference.vue.`,
    );
  });

  check(`\`.${cls}\`: the built blocks equal what the generator yields, in order`, () => {
    // 🔴 THE ASSERTION A COUNT CANNOT MAKE. Mutant 2 (`{{ longText(c) }}` ->
    // `{{ c.description }}`) keeps all 44 blocks and fails only here, because
    // the expected bodies are recomputed from the artifact through the shared
    // predicate rather than read back off the page.
    assertEqual(
      got.length,
      want.length,
      `the built HTML has a different NUMBER of \`.${cls}\` blocks than the generator yields ` +
        `(check ${source} in CliReference.vue)`,
    );
    for (let i = 0; i < want.length; i++) {
      assertEqual(
        unescapeHTML(got[i]),
        want[i],
        `built \`.${cls}\` block #${i + 1} (\`${owners[i]}\`) is not the body the generator yields — ` +
          `${source} is rendering the wrong value`,
      );
    }
  });

  check(`\`.${cls}\`: every block is HTML-ESCAPED (no raw markup reaches the DOM)`, () => {
    // 🔴 THE DIRECTION THE EQUALITY ABOVE IS BLIND TO. Mutant 3 (`v-html`)
    // passes the equality check byte-for-byte — unescaping a raw `<slug>`
    // yields `<slug>`, which is exactly the source. The only observable
    // difference is that the emitted HTML stopped being escaped.
    //
    // A correctly interpolated block contains ZERO bare `<`: Vue escapes every
    // one into `&lt;`. So any `<` at all is the defect, and a tag-shaped one is
    // additionally being parsed as an element by the browser.
    const offenders = [];
    for (let i = 0; i < got.length; i++) {
      const bare = [...got[i].matchAll(/<[^]{0,24}/g)].map((m) => m[0]);
      if (!bare.length) continue;
      const tagShaped = bare.filter((s) => /^<[a-zA-Z/!?]/.test(s));
      offenders.push(
        `  block #${i + 1} (\`${owners[i]}\`): ${bare.length} unescaped \`<\`` +
          `${tagShaped.length ? `, ${tagShaped.length} TAG-SHAPED` : ''} — e.g. ${JSON.stringify((tagShaped[0] ?? bare[0]).slice(0, 24))}`,
      );
    }
    assert(
      offenders.length === 0,
      `${offenders.length} of ${got.length} \`.${cls}\` blocks emit unescaped markup into the DOM:\n` +
        `${offenders.slice(0, 8).join('\n')}` +
        `${offenders.length > 8 ? `\n  … and ${offenders.length - 8} more` : ''}\n` +
        `       The body must be interpolated as TEXT (\`{{ … }}\`), never \`v-html\`: it is verbatim ` +
        `terminal prose full of \`<slug>\` / \`<path>\` / \`<token>\` placeholders. Check ${source}.`,
    );
  });
}

// `.ab-long` — the cobra `Long` body. Present exactly where `cliLongBody` is
// truthy, which is the predicate the component itself calls (via `longText`).
const longOwners = commands.filter((c) => cliLongBody(c));
checkFamily({
  cls: 'ab-long',
  floor: LONG_BLOCK_FLOOR,
  want: longOwners.map((c) => cliLongBody(c)),
  owners: longOwners.map((c) => c.command),
  source: '`longText(c)` and the `<pre class="ab-long">` it feeds',
});

// `.ab-example` — the verbatim cobra `Examples:` transcript. Present wherever
// the command has a non-empty `examples` array (the component's own
// `v-if="c.examples?.length"`), joined with newlines by `exampleText`.
const exampleOwners = commands.filter((c) => c.examples?.length);
checkFamily({
  cls: 'ab-example',
  floor: EXAMPLE_BLOCK_FLOOR,
  want: exampleOwners.map((c) => c.examples.join('\n')),
  owners: exampleOwners.map((c) => c.command),
  source: '`exampleText(c)` and the `<pre class="ab-example">` it feeds',
});

// ---------------------------------------------------------------------------
// THE RAW AGENT-SETUP PROMPT.
//
// 🔴 WHY THIS IS HERE AND NOT IN check-agent-setup.mjs. That guard is
// deliberately offline and SOURCE-only: it grades
// `public/agent-setup/prompt.md` against the CLI help snapshot and the shared
// constants. Nothing graded the BUILT artifact — measured, `check-built-site.mjs`
// mentioned `agent-setup` zero times. So a change to `publicDir`, to the
// Dockerfile's `COPY --from=build /app/.vitepress/dist`, to `.gitignore`, or a
// VitePress upgrade that started running `public/**` through the markdown
// pipeline would ship a 404 — or a MUTATED body — at the exact URL the landing
// page tells every agent to fetch, with every gate green.
//
// The assertion is byte-identity, not existence, because the contract this
// route publishes IS byte-identity: `PROMPT_URL` is fetched by an agent that
// then executes what it says, and a frontmatter-injected or re-serialised copy
// is a different file that still 200s.
const promptSrc = join(repoRoot, PROMPT_SOURCE);
const promptBuilt = join(distDir, ...PROMPT_PATH.split('/').filter(Boolean));

console.log(`\nBUILT SITE — ${promptBuilt}`);

check(`the raw prompt is copied into the build at ${PROMPT_PATH}`, () => {
  assert(
    existsSync(promptSrc),
    `${PROMPT_SOURCE} does not exist — the source of ${PROMPT_URL} is gone. ` +
      `See scripts/check-agent-setup.mjs, which owns that failure.`,
  );
  assert(
    existsSync(promptBuilt),
    `${promptBuilt} does not exist, so ${PROMPT_URL} would 404.\n` +
      `       Only files under public/ are copied verbatim into the output. Check that\n` +
      `       ${PROMPT_SOURCE} is still there, that config.mts has not changed publicDir, and\n` +
      `       that public/ is not being excluded from the build.`,
  );
});

check(`the built ${PROMPT_PATH} is BYTE-IDENTICAL to ${PROMPT_SOURCE}`, () => {
  if (!existsSync(promptSrc) || !existsSync(promptBuilt)) {
    throw new Error('skipped — see the existence check above, which already failed');
  }
  const want = readFileSync(promptSrc);
  const got = readFileSync(promptBuilt);
  // POSITIVE CONTROL. Two empty files are byte-identical; that must not read as
  // a pass. MEASURED on this tree: 2,798 bytes. The floor is loose because the
  // prompt is edited often and the equality below is what makes this tight.
  assert(
    want.length >= 500,
    `${PROMPT_SOURCE} is only ${want.length} bytes — it is empty or truncated, so a byte-identity ` +
      `assertion against it would pass vacuously.`,
  );
  assert(
    got.equals(want),
    `the built copy is ${got.length} bytes, the source is ${want.length} — they are NOT identical.\n` +
      `       ${PROMPT_URL} is served verbatim precisely so the bytes an agent executes are the\n` +
      `       bytes in this repo. Something in the build is now REWRITING the file (VitePress\n` +
      `       compiling public/**, the llms plugin re-emitting it with frontmatter, a copy step\n` +
      `       normalising line endings). Fix the build, not this check.`,
  );
});

// ---------------------------------------------------------------------------
// THE RENDERED INLINE COPY.
//
// 🔴 WHAT NEITHER OTHER GATE CAN SEE. The assertion above grades the built
// MACHINE copy (dist/agent-setup/prompt.md). `check:agent-setup`'s check 4
// grades the SOURCE region on agent-setup/index.md. Nothing graded the thing a
// human actually reads: the RENDERED page. So a rendering-layer regression — a
// VitePress or markdown-it change that spills the fence, a plugin that drops the
// generated region, a shiki upgrade that mangles the body — would show the
// reader something other than the file an agent executes with BOTH of those
// checks green. scripts/agent-setup-page.mjs calls exactly that state "strictly
// worse than the download dialog it replaces", because the page's whole posture
// is "these instructions are unsigned, read them first".
//
// The assertion is EQUALITY against what the generator would put in the fence,
// not a first-line/last-line spot check: a renderer that dropped the middle of
// the prompt passes a spot check, and the middle is where the commands are. The
// generator's own `renderPromptRegion` supplies the expected body, so the one
// normalisation (its trailing-newline strip) is not duplicated here — a second
// copy is how the two drift apart.
const landingBuilt = join(distDir, ...LANDING_PAGE.replace(/\.md$/, '.html').split('/'));

console.log(`\nBUILT SITE — ${landingBuilt}`);

check(`the rendered ${LANDING_PAGE} carries the prompt verbatim inside a <pre>`, () => {
  assert(existsSync(promptSrc), `${PROMPT_SOURCE} does not exist — see the checks above.`);
  assert(
    existsSync(landingBuilt),
    `${landingBuilt} does not exist, so the page a human is told to READ was not built at all.`,
  );

  // The fence body the generator would write: `renderPromptRegion` minus its own
  // opening and closing fence lines.
  const region = renderPromptRegion(readFileSync(promptSrc, 'utf8')).split('\n');
  const want = region.slice(1, -1).join('\n');

  // POSITIVE CONTROL. An empty expectation is satisfied by an empty <pre>, and a
  // prompt this short would mean the source is truncated.
  assert(
    want.split('\n').length >= 20,
    `the expected inline body is only ${want.split('\n').length} line(s) — ${PROMPT_SOURCE} is ` +
      `truncated, so an equality assertion against it would pass close to vacuously.`,
  );

  const html = readFileSync(landingBuilt, 'utf8');
  const pres = [...html.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)].map((m) => m[0]);
  // CONTROL ON THE EXTRACTOR, same shape as `rawBlocks` above: zero <pre> means
  // the pattern broke, which must not read as "the prompt is missing".
  assert(
    pres.length >= 2,
    `only ${pres.length} <pre> block(s) in the built page — the page has a copy-paste fence AND ` +
      `the inline prompt, so this is the extractor failing, not the content.`,
  );

  const texts = pres.map((p) => unescapeHTML(p.replace(/<[^>]+>/g, '')).replace(/\n$/, ''));
  const hits = texts.filter((t) => t === want);
  assert(
    hits.length === 1,
    `no <pre> in the built page holds ${PROMPT_SOURCE} verbatim (${hits.length} exact match(es) ` +
      `among ${pres.length} blocks).\n` +
      `       The page renders the prompt inline because the raw route is text/markdown +\n` +
      `       nosniff, which a browser SAVES rather than displays — so this <pre> IS the\n` +
      `       "read it before you paste it" instruction. A reader now sees something other than\n` +
      `       what an agent executes.\n` +
      `       Closest built block, first line: ` +
      `${JSON.stringify(texts.map((t) => t.split('\n')[0]).join(' | ').slice(0, 200))}\n` +
      `       Expected first line: ${JSON.stringify(want.split('\n')[0])}\n` +
      `       Expected last line:  ${JSON.stringify(want.split('\n').at(-1))}`,
  );
});

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall built-site checks passed');
process.exit(failures ? 1 : 0);
