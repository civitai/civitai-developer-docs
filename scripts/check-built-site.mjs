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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

const MAX_STRIP_PASSES = 8;

/**
 * The TEXT CONTENT of a built HTML fragment: markup removed to a fixed point.
 *
 * 🔴 THIS IS NOT SANITISATION, AND IT IS DELIBERATELY NOT THE SAME RULE AS
 * `stripTags` IN check-agent-setup.mjs. There the strip decides whether a
 * COMMAND IS SEEN, so it refuses to delete a `<…>` run holding `|`, `&` or `;`.
 * Here the result is compared with `===` against text derived from the committed
 * `public/agent-setup/prompt.md` and is never rendered, printed to a terminal or
 * handed to a shell — and that rule would break this check outright: measured on
 * the built page, 107 of the 416 tags inside these `<pre>` blocks carry a `;`,
 * because that is how shiki writes `style="--shiki-light:#24292E;…"`.
 *
 * What the two DO share is the part the scanner flags: one pass of `<…>` removal
 * is not a fixed point, so nested or malformed markup can leave a reassembled
 * tag behind. Measured on this repo's own build, one pass already IS the fixed
 * point for all three blocks and leaves zero literal `<` or `>`, so this loop
 * changes nothing today; it is here so a renderer that starts emitting nested
 * markup cannot quietly change what the equality is comparing.
 *
 * At the bound the most-stripped form is used. A block that has not converged in
 * 8 passes is markup this page is not supposed to contain, and the equality then
 * FAILS — the red direction, which is the one this check wants.
 *
 * AND THE INPUT CLASS, because "trusted input" is not a claim anyone can check.
 * The only content an author supplies to this comparison is
 * `public/agent-setup/prompt.md`, and it CANNOT reach the strip as markup:
 * VitePress renders the inline fence entity-escaped. Measured — a prompt line
 * reading `MARKERLINE <b onclick="x">HIDDEN</b> & <tag> tail` built to
 * `MARKERLINE &lt;b onclick=&quot;x&quot;&gt;HIDDEN&lt;/b&gt; &amp; &lt;tag&gt; tail`,
 * and the strip runs BEFORE `unescapeHTML`, so it sees the entities. That is one
 * shape, not a proof about every shape; what it does establish is that the tags
 * this function deletes come from the renderer, not from the file under test.
 */
function textContent(fragment) {
  let cur = fragment;
  for (let pass = 0; pass < MAX_STRIP_PASSES; pass++) {
    const next = cur.replace(/<[^>]+>/g, '');
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
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

  const texts = pres.map((p) => unescapeHTML(textContent(p)).replace(/\n$/, ''));
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

// ---------------------------------------------------------------------------
// llms.txt — NO SIDEBAR GROUP MAY BE EMITTED TWICE.
//
// 🔴 THE DEFECT THIS PINS, MEASURED. VitePress ROUTES a sidebar: one key per
// path prefix, and a leaf page keeps a sidebar by ALIASING an existing array
// under a second key (`'/apps/examples': appsGuideSidebar` beside
// `'/apps/guide/': appsGuideSidebar`; same for `/apps/showcase` +
// `/apps/tokens`). vitepress-plugin-llms routes nothing — it does
// `Object.values(sidebar).flat()` — so every alias emitted that array's groups
// a second time. On the build at 75035bc, and live on
// https://developer.civitai.com/llms.txt: `### Guide`, `### Examples` and
// `### Design system` each appeared TWICE, +20 duplicated lines. The rendered
// HTML, the nav and the on-page sidebars were all correct, which is exactly why
// nothing caught it: llms.txt was the only affected surface, and it is the one
// surface no human reads. It is also the flat index the `civitai` CLI's
// generated AGENTS.md block points agents at.
//
// The fix is `dedupeSidebarGroups` in .vitepress/config.mts. This is the gate on
// it — asserted against the BUILT artifact, because the bug was invisible in the
// source object (both keys are correct VitePress) and visible only after the
// plugin flattened it.
//
// WHAT IS COMPARED, and why it is not the heading. Heading text repeats
// legitimately: `### MCP Server` appears twice for two DIFFERENT groups
// (`/orchestration/mcp/`, `/site/mcp/`) whose entries differ, and both belong
// there. The key is therefore the WHOLE BLOCK — heading line plus its entry
// lines — so two groups are "the same group" only when the reader would get the
// identical list twice.

/** Split the llms.txt Table of Contents into `### `-headed blocks. */
export function tocGroups(llms) {
  const at = llms.indexOf('\n## Table of Contents');
  const body = at === -1 ? llms : llms.slice(at);
  const lines = body.split('\n');
  const groups = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith('### ')) {
      cur = { heading: line.slice(4).trim(), lines: [] };
      groups.push(cur);
    } else if (cur && line.startsWith('##')) {
      cur = null; // a new top-level section ends the run of groups
    } else if (cur && line.trim()) {
      cur.lines.push(line.trim());
    }
  }
  return groups;
}

/** `[key, count]` for every block appearing more than once, in first-seen order. */
export function duplicateGroups(groups) {
  const counts = new Map();
  for (const g of groups) {
    const key = [g.heading, ...g.lines].join('\n');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1);
}

// The detector's own fixtures. A rule shown only passing input is
// indistinguishable from a rule wired to nothing, and this one's whole job is to
// report a ZERO — the reading a broken extractor also produces.
const LLMS_FIXTURES = [
  {
    name: 'two groups, distinct entries — clean',
    expect: 0,
    text: '\n## Table of Contents\n\n### A\n- [x](/x)\n\n### B\n- [y](/y)\n',
  },
  {
    name: 'same heading, DIFFERENT entries — not a duplicate (the two `MCP Server` groups)',
    expect: 0,
    text: '\n## Table of Contents\n\n### MCP Server\n- [Overview](/orchestration/mcp/)\n\n### MCP Server\n- [Overview](/site/mcp/)\n',
  },
  {
    name: 'an ALIASED sidebar array — the live defect',
    expect: 1,
    text: '\n## Table of Contents\n\n### Guide\n- [Intro](/apps/guide/)\n\n### Guide\n- [Intro](/apps/guide/)\n',
  },
  {
    name: 'an alias of a TWO-group array — both groups duplicate',
    expect: 2,
    text: '\n## Table of Contents\n\n### Guide\n- [Intro](/apps/guide/)\n\n### Examples\n- [Example apps](/apps/examples)\n\n### Guide\n- [Intro](/apps/guide/)\n\n### Examples\n- [Example apps](/apps/examples)\n',
  },
];

// MEASURED on the build at 75035bc: 23 `###` groups WITH the duplication, 21
// without. The floor rejects a zero — an extractor that stopped matching, or a
// plugin that stopped emitting a table of contents, both yield [] and would
// otherwise satisfy "no duplicates" vacuously.
const TOC_GROUP_FLOOR = 15;

const llmsTxt = join(distDir, 'llms.txt');
let llmsGroupCount = null;

console.log(`\nBUILT SITE — ${llmsTxt}`);

// --- apps/reference/hooks.html: the collapsed-description regression ---------
//
// 🔴 THIS FILE HAD ZERO COVERAGE OF hooks.html, AND THAT IS HOW THE BUG SHIPPED.
// civitai-developer-docs#80 flattened a hook description carrying a GFM table
// into a single 1853-codepoint run of literal pipes on the rendered page —
// burying that docstring's own instruction to check `err.timedOut` BEFORE
// `.message`. The first fix targeted the .md fallback region, which
// <HooksReference> DISCARDS (it declares no <slot />), so `check:md-regions`
// went green over a page that was still broken. Only building the site and
// reading the HTML found it, by hand, once.
//
// 🔴 WHAT THESE CAN AND CANNOT SEE — stated because the first version of this
// block claimed more than it did, and round 3 measured the gap:
//   CAN  — the <pre> branch being deleted; the flag the template reads being
//          misspelled; the interpolation being swapped to an adjacent field
//          (`h.example`); a description rendered through the wrong element.
//   CANNOT — a regression in the PREDICATE itself. If `descriptionHasTable`
//          narrows, the stamped flag and the rendered element still AGREE, and
//          every assertion here passes. Measured: restoring the pre-fix regex
//          left `check:built-site`, `check:md-regions`, `check:no-flag-tables`
//          and `check:snapshots` all green. `test-appblocks-hooks.mjs` is the
//          only thing that covers that class; do not read this block as if it
//          did.
//
// These assert a RELATIONSHIP — every description in `hooks.json` appears on the
// page under the element its own flag calls for, and the two sets are the same
// size — rather than a floor on how many lines or elements exist. An earlier
// version used floors (`>= 10` lines, `>= 1` <pre>), which red-lighted a
// CORRECTLY rendered small table: a minimal 2x2 GFM table is 5 lines, and the
// failure message asserted it "is being collapsed" when it was not.
const HOOKS_PAGE = 'apps/reference/hooks.html';
const hooksBuilt = join(distDir, 'apps', 'reference', 'hooks.html');
const hooksArtifact = join(repoRoot, 'public', 'appblocks', 'hooks.json');

// Read once per check, like the other families here, and refuse a MISSING page
// rather than letting an absent file read as "nothing to assert" — the zero that
// looks exactly like a pass. Same for the artifact: without it every loop below
// iterates zero times and reports success.
function readHooksHtml() {
  assert(existsSync(hooksBuilt), `${hooksBuilt} was not built, so nothing below measured the page a human reads.`);
  return readFileSync(hooksBuilt, 'utf8');
}
function readHooksJson() {
  assert(existsSync(hooksArtifact), `${hooksArtifact} is missing — run \`npm run gen:appblocks\`. Without it the checks below iterate over nothing and pass vacuously.`);
  const parsed = JSON.parse(readFileSync(hooksArtifact, 'utf8'));
  const hooks = (parsed.hooks ?? parsed).filter((h) => h && h.description);
  assert(hooks.length > 0, `${hooksArtifact} lists no hook with a description, so every assertion below is vacuous.`);
  // 🔴 POSITIVE CONTROL FOR THE SET-SIZE LEDGER BELOW, AND THE ONLY THING THAT
  // CATCHES THIS CLASS. The ledger is an equality: `pre.length === flagged`. If
  // the generator stops stamping the flag — a rename, a typo at either of the
  // two call sites, a refactor — every hook arrives `undefined`, the template's
  // `v-if="h.description && h.descriptionHasTable"` falls EVERY description to
  // <p>, useCollectionFollow's error table collapses into the run of literal
  // pipes this whole PR exists to fix, and the ledger reads `0 === 0` and
  // `35 === 35`. MEASURED: with the field misspelled generator-side, the page
  // built with ZERO <pre> and `check:built-site` exited 0.
  //
  // Asserting the TYPE rather than a count is deliberate: a `flagged >= 1` floor
  // would also kill that mutant, but would red legitimately the day upstream
  // ships no table at all. This cannot.
  const untyped = hooks.filter((h) => typeof h.descriptionHasTable !== 'boolean').map((h) => h.name);
  assert(
    untyped.length === 0,
    `${untyped.length} hook(s) carry no boolean \`descriptionHasTable\` (${untyped.slice(0, 3).join(', ')}${untyped.length > 3 ? ', …' : ''}). ` +
      `The generator has stopped stamping it, so every description falls back to <p> and any GFM ` +
      `table collapses — while the set-size ledger below still balances at zero. Check the field ` +
      `name in gen-appblocks-hooks.mjs against the one HooksReference.vue reads.`,
  );
  return hooks;
}
// Vue interpolation entity-encodes these on the way into the HTML; undo it so a
// rendered body can be compared to the source string it came from.
const decodeEntities = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
const bodiesOf = (html, re) => [...html.matchAll(re)].map((m) => m[1]);
const PRE_RE = /<pre class="ab-hook-desc ab-hook-desc-pre"[^>]*>([\s\S]*?)<\/pre>/g;
const P_RE = /<p class="ab-hook-desc"[^>]*>([\s\S]*?)<\/p>/g;

check(`every ${HOOKS_PAGE} description renders under the element its own flag calls for`, () => {
  const html = readHooksHtml();
  const hooks = readHooksJson();
  const pre = bodiesOf(html, PRE_RE).map((b) => decodeEntities(b).trim());
  const para = bodiesOf(html, P_RE).map((b) => decodeEntities(b).trim());

  const wrong = [];
  for (const h of hooks) {
    const want = String(h.description).trim();
    const inPre = pre.includes(want);
    const inP = para.includes(want);
    if (h.descriptionHasTable && !inPre) {
      wrong.push(`${h.name}: carries a GFM table but its description is ${inP ? 'in a <p>, where every row collapses into one run of literal pipes' : 'NOT ON THE PAGE AT ALL — the template is rendering some other field here'}`);
    }
    if (!h.descriptionHasTable && !inP) {
      wrong.push(`${h.name}: ordinary prose, but its description is ${inPre ? 'fenced in a <pre>, where it renders as unwrapped monospace' : 'NOT ON THE PAGE AT ALL — the template is rendering some other field here'}`);
    }
  }
  assert(wrong.length === 0, `${wrong.length} hook description(s) rendered under the wrong element:\n` + wrong.map((w) => `         - ${w}`).join('\n'));

  // Both directions: a description the artifact does not list must not appear
  // either, or the page is rendering something this check never inspected.
  const flagged = hooks.filter((h) => h.descriptionHasTable).length;
  assert(
    pre.length === flagged && para.length === hooks.length - flagged,
    `the page holds ${pre.length} <pre> and ${para.length} <p> description(s), but hooks.json ` +
      `declares ${flagged} table-bearing and ${hooks.length - flagged} ordinary. The sets have ` +
      `diverged — something is rendering a description this check did not match.`,
  );
});

check(`${HOOKS_PAGE} escapes descriptions rather than injecting them as HTML`, () => {
  const html = readHooksHtml();
  const hooks = readHooksJson();
  // POSITIVE CONTROL. Without it this check is a reassuring zero: if no
  // description contained an escapable character, the assertion below could not
  // fail however the page were rendered. Measured at the time of writing: 18 of
  // 35 descriptions carry one (apostrophes, mostly).
  const escapable = hooks.filter((h) => /[<>&"']/.test(h.description));
  assert(
    escapable.length > 0,
    `no description contains a character that needs escaping, so this check cannot ` +
      `distinguish an escaped page from a v-html one. It is currently proving nothing — ` +
      `re-point it at a field that does, or delete it.`,
  );
  const raw = [...bodiesOf(html, PRE_RE), ...bodiesOf(html, P_RE)];
  const leaked = [];
  for (const h of escapable) {
    const want = String(h.description).trim();
    const body = raw.find((b) => decodeEntities(b).trim() === want);
    if (!body) continue; // the element check above owns "not on the page"
    for (const ch of ['<', '>', '"', "'"]) {
      if (want.includes(ch) && body.includes(ch)) leaked.push(`${h.name}: a literal ${ch} survived into the HTML`);
    }
    // `&` is NOT in that list, and must not be: a correctly escaped page is FULL
    // of `&` — it opens every entity Vue emits — so `body.includes('&')` is true
    // whether or not the page is escaped, and an earlier version of this loop
    // therefore red-lighted a perfectly rendered page the moment any upstream
    // docstring contained an ampersand. `build-site` is a required context, so
    // that is the reddens-for-unrelated-reasons failure this file warns about
    // elsewhere. Ask the question that actually discriminates: is there an `&`
    // that does NOT begin one of the five entities Vue produces?
    if (/&(?!amp;|lt;|gt;|quot;|#39;)/.test(body)) {
      leaked.push(`${h.name}: an & that begins no entity — the description was injected, not interpolated`);
    }
  }
  assert(
    leaked.length === 0,
    `${leaked.length} description(s) reached the page unescaped. These are uploader-adjacent ` +
      `strings from an upstream package; they must be interpolated ({{ }}), never v-html:\n` +
      leaked.map((l) => `         - ${l}`).join('\n'),
  );
});

check('the llms.txt duplicate detector still detects (fixture table)', () => {
  const wrong = LLMS_FIXTURES.filter((f) => duplicateGroups(tocGroups(f.text)).length !== f.expect);
  assert(
    wrong.length === 0,
    `${wrong.length} fixture(s) disagreed: ${wrong
      .map((f) => `"${f.name}" expected ${f.expect}, got ${duplicateGroups(tocGroups(f.text)).length}`)
      .join('; ')}`,
  );
  const negatives = LLMS_FIXTURES.filter((f) => f.expect > 0).length;
  assert(
    negatives >= 2 && LLMS_FIXTURES.length - negatives >= 2,
    `the fixture table lost its controls (${negatives} must-detect, ` +
      `${LLMS_FIXTURES.length - negatives} must-not) — restore them.`,
  );
});

check('no sidebar group is emitted twice in dist/llms.txt', () => {
  assert(
    existsSync(llmsTxt),
    `${llmsTxt} does not exist — the llms plugin produced no flat index at all. That is the file ` +
      `the civitai CLI's generated AGENTS.md block points agents at.`,
  );
  const groups = tocGroups(readFileSync(llmsTxt, 'utf8'));

  // POSITIVE CONTROL first: a broken extractor and a clean file both print 0.
  assert(
    groups.length >= TOC_GROUP_FLOOR,
    `only ${groups.length} \`###\` group(s) parsed out of llms.txt (floor ${TOC_GROUP_FLOOR}). ` +
      `Either the plugin stopped emitting a Table of Contents, or \`tocGroups\` no longer ` +
      `understands its markup — in which case the duplicate check below asserted nothing.`,
  );

  const dupes = duplicateGroups(groups);
  assert(
    dupes.length === 0,
    `${dupes.length} sidebar group(s) appear more than once in llms.txt:\n` +
      dupes
        .map(([key, n]) => {
          const entries = key.split('\n').length - 1;
          return `         "${key.split('\n')[0]}" ×${n} (${entries} entr${entries === 1 ? 'y' : 'ies'})`;
        })
        .join('\n') +
      `\n       A sidebar array registered under TWO route keys in .vitepress/config.mts is emitted\n` +
      `       twice by vitepress-plugin-llms, which flattens every key instead of routing them.\n` +
      `       That is correct for VitePress (a leaf page keeps a sidebar by aliasing one) and wrong\n` +
      `       for llms.txt. Route the plugin through \`dedupeSidebarGroups\` — it is already there —\n` +
      `       rather than dropping the alias, which would strip the page's sidebar.`,
  );
  // The verdict always carries the number it is a claim about.
  llmsGroupCount = groups.length;
});
if (llmsGroupCount !== null) console.log(`       ${llmsGroupCount} groups parsed, 0 duplicated`);

// MEASURED on the build at 9c1ba1a: 194 html files in dist. The floor carries
// slack because adding or removing a page legitimately moves the count; its only
// job is to reject the ZERO a broken walk would otherwise report as clean.
const HTML_PAGE_FLOOR = 150;

/** Every `.html` under dist, recursively, in a stable order. */
function distHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...distHtmlFiles(p));
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

check('every built page wraps its <body> in Cloudflare email_off markers', () => {
  // WHY: Cloudflare's Email Address Obfuscation rewrites `@civitai/theme@0.3.1`
  // into an obfuscated `__cf_email__` stub, because the version literal is
  // shaped like an address. `transformHtml` in .vitepress/config.mts wraps the
  // rendered body in Cloudflare's documented opt-out pair so the edge leaves it
  // alone. This asserts the markers actually reach the HTML, on every page, in
  // the right position — the half that IS observable without deploying.
  //
  // An HTML comment authored in markdown does NOT survive the build (measured:
  // the `<!-- BEGIN GENERATED: … -->` markers in apps/reference/generation.md
  // appear 0 times in the built page), so this can only ever be satisfied by
  // the config hook. If someone removes the hook, this goes red.
  const files = distHtmlFiles(distDir);

  // POSITIVE CONTROL: an empty or mis-rooted walk must not read as a pass.
  assert(
    files.length >= HTML_PAGE_FLOOR,
    `only ${files.length} .html file(s) found under ${distDir} (floor ${HTML_PAGE_FLOOR}). ` +
      `Either the build emitted almost nothing, or this walk is pointed at the wrong directory — ` +
      `in which case the assertion below proved nothing.`,
  );

  const bad = [];
  for (const file of files) {
    const page = readFileSync(file, 'utf8');
    const rel = file.slice(distDir.length + 1);
    const open = /<body[^>]*>/.exec(page);
    if (!open) {
      bad.push(`${rel}: no <body> tag`);
      continue;
    }
    const opens = [...page.matchAll(/<!--email_off-->/g)].length;
    const closes = [...page.matchAll(/<!--\/email_off-->/g)].length;
    if (opens !== 1 || closes !== 1) {
      bad.push(`${rel}: ${opens} opening and ${closes} closing marker(s), expected 1 and 1`);
      continue;
    }
    // Position, not just presence: the pair must BRACKET the body, or content
    // outside it is still rewritten at the edge.
    const openEnd = open.index + open[0].length;
    if (page.slice(openEnd, openEnd + '<!--email_off-->'.length) !== '<!--email_off-->') {
      bad.push(`${rel}: <!--email_off--> does not immediately follow the <body> tag`);
      continue;
    }
    const closeIdx = page.lastIndexOf('</body>');
    if (page.slice(closeIdx - '<!--/email_off-->'.length, closeIdx) !== '<!--/email_off-->') {
      bad.push(`${rel}: <!--/email_off--> does not immediately precede </body>`);
    }
  }

  assert(
    bad.length === 0,
    `${bad.length} of ${files.length} built page(s) are not wrapped:\n` +
      bad.slice(0, 10).map((b) => `         - ${b}`).join('\n') +
      (bad.length > 10 ? `\n         … and ${bad.length - 10} more` : '') +
      `\n       The wrapper is emitted by \`transformHtml\` in .vitepress/config.mts. Without it,\n` +
      `       Cloudflare rewrites every \`@civitai/<pkg>@<semver>\` literal on the page into an\n` +
      `       obfuscated mailto stub — including the unpkg.com URLs on apps/guide/theming.`,
  );
  console.log(`       ${files.length} built pages, all wrapped`);
});

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall built-site checks passed');
process.exit(failures ? 1 : 0);
