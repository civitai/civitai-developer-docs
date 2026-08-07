// Shared renderers for the App Blocks MARKDOWN FALLBACK regions.
//
// THE DEFECT THIS EXISTS TO FIX
// -----------------------------
// developer.civitai.com publishes an LLM/scraper channel: `vitepress-plugin-llms`
// serves every page a second time as `<path>.md` and aggregates them into
// /llms.txt + /llms-full.txt. That plugin walks the SOURCE markdown through
// remark/mdast and STRIPS every HTML/Vue node. Seven App Blocks reference pages
// render their entire substance through a Vue island (`<CliReference />`,
// `<HooksReference />`, …) that reads a build-time JSON artifact via `inject()`,
// so their payload lives in a component and is ENTIRELY ABSENT from the .md
// channel. Measured on a real build: apps/reference/hooks.md carried 5% of the
// page's words and ZERO of the 33 hooks — under a sentence promising "the
// signatures below".
//
// THE MECHANISM
// -------------
// Vue SLOT content survives into the .md channel but is NOT rendered into HTML:
//
//     <CliReference>
//
//     | col | col |
//     |-----|-----|
//
//     </CliReference>
//
// remark strips the component tags and keeps the table (so the .md gains it),
// while Vue discards the slot because none of these components declare a
// `<slot />` (so the HTML is byte-for-byte the rich island it always was). The
// blank lines are load-bearing: in CommonMark an HTML block ends at a blank
// line, which is what lets the table parse as a real table node rather than
// being swallowed into the HTML block.
//
// So each page keeps its island for humans and gains an equivalent static
// markdown table, inside markers, for machines.
//
// WHY THIS MODULE READS THE JSON ARTIFACTS
// ----------------------------------------
// The renderers below consume `public/appblocks/*.json` — the exact artifacts
// the islands `inject()`. That is deliberate: rendering from the SAME bytes the
// component renders makes the two views structurally incapable of disagreeing,
// and it keeps this file free of a second copy of every generator's upstream
// parsing. (Design tokens are the one exception: `<TokenGallery>` imports the
// published `@civitai/theme` JS export directly rather than a JSON artifact, so
// this module does too.)
//
// WHY IT IS NOT WIRED INTO predev/prebuild
// ----------------------------------------
// Same doctrine as scripts/gen-appblocks-components.mjs: a BUILD MUST NEVER
// REWRITE A COMMITTED FILE. The JSON generation stays in prebuild; writing the
// markdown regions is a MAINTAINER REFRESH step —
//
//     npm run gen:appblocks:md      # rewrite the regions in the committed pages
//     npm run check:md-regions      # PR-BLOCKING drift guard (renders in memory)
//
// Both entry points import THIS module, so the guard can never grade against a
// different renderer than the one that wrote the file.
//
// Output is deterministic (no timestamps, no run-specific provenance, artifact
// key order preserved) so the committed pages are byte-stable.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { outDir, repoRoot } from './appblocks-util.mjs';

export const REFRESH_CMD = 'npm run gen:appblocks:md';

// ── artifact access ──────────────────────────────────────────────────────────

/** Read one of the generators' JSON artifacts, with an actionable failure. */
export function loadArtifact(name) {
  const p = join(outDir, name);
  if (!existsSync(p)) {
    throw new Error(
      `appblocks-md: missing artifact ${p}. The markdown regions render from the ` +
        `same JSON the Vue islands consume — run \`npm run gen:appblocks\` first.`,
    );
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ── markdown primitives ──────────────────────────────────────────────────────

/** Collapse to one line: table cells cannot contain a newline. */
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Escape source prose for markdown INLINE context.
 *
 * `<` is the load-bearing one and it is not cosmetic: VitePress renders markdown
 * with `html: true` and then hands the result to the VUE compiler, so a
 * description that mentions `https://<slug>.civit.ai` emits a real `<slug>` open
 * tag and the whole page dies with `Element is missing end tag` (measured — it
 * failed the first build of this feature on apps/reference/manifest.md).
 * Backslash-escaping keeps the mdast text node as the literal `<slug>`, so the
 * .md channel still carries the readable text.
 *
 * `&` is escaped only when it would otherwise start an HTML entity.
 */
const escapeInline = (s) =>
  oneLine(s)
    .replace(/&(?=(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#[xX][0-9a-fA-F]+);)/g, '\\&')
    .replace(/</g, '\\<');

/** A table cell: one line, with `|` escaped so it cannot split the row. */
export const cell = (s) => escapeInline(s).replace(/\|/g, '\\|');

/**
 * Inline code, with a backtick fence long enough to survive backticks in the
 * content (CommonMark: N backticks are closed by exactly N).
 */
export function code(s) {
  const t = oneLine(s);
  if (!t) return '';
  const longest = (t.match(/`+/g) ?? []).reduce((m, r) => Math.max(m, r.length), 0);
  const f = '`'.repeat(longest + 1);
  const pad = t.startsWith('`') || t.endsWith('`') ? ' ' : '';
  return `${f}${pad}${t}${pad}${f}`;
}

/**
 * Inline code inside a TABLE cell. GFM requires `|` to be backslash-escaped even
 * within a code span (the escape is consumed, the pipe survives) — outside a
 * table the same escape would render literally, which is why this is a separate
 * helper rather than a blanket rule in `code`.
 */
export const codeCell = (s) => code(s).replace(/\|/g, '\\|');

/** Inline code in a table cell, or an em dash when empty. */
const codeOrDash = (s) => (oneLine(s) ? codeCell(s) : '—');

/**
 * A prose paragraph. Newlines are collapsed so a source description whose line
 * happens to start with `#`, `-` or `|` can never re-parse as a heading, list
 * or table once it lands inside a generated region; the first character is
 * escaped for the same reason, since a collapsed paragraph still begins a line.
 */
export const para = (s) => escapeInline(s).replace(/^([#>\-+*|=]|\d+[.)])/, '\\$1');

/**
 * A fenced code block. The fence grows past any backtick run in the body, and
 * the block is what makes type-heavy content safe on the HTML side too:
 * VitePress marks code fences `v-pre`, so a `{{ … }}` or a JSX tag in a
 * signature is never seen by the Vue compiler.
 */
export function fence(lang, body) {
  const t = String(body ?? '').replace(/\s+$/, '');
  const longest = (t.match(/`{3,}/g) ?? []).reduce((m, r) => Math.max(m, r.length), 2);
  const f = '`'.repeat(Math.max(3, longest + 1));
  return `${f}${lang}\n${t}\n${f}`;
}

/** A GFM table. `rows` are pre-rendered cell arrays. */
export function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

/** Join blocks with exactly one blank line between them, dropping empties. */
const blocks = (...parts) => parts.flat().filter(Boolean).join('\n\n');

// ── region markers ───────────────────────────────────────────────────────────

export const beginMarker = (key) =>
  `<!-- BEGIN GENERATED: ${key} — markdown fallback for the .md/LLM channel. ` +
  `Do not edit by hand; run \`${REFRESH_CMD}\`. -->`;
export const endMarker = (key) => `<!-- END GENERATED: ${key} -->`;

// Matched loosely so the BEGIN comment's prose can evolve without stranding
// every committed page. The generator always writes the canonical text above,
// and the drift guard compares the whole block, so a hand-edited marker still
// fails the guard.
const beginRe = (key) => new RegExp(`^<!-- BEGIN GENERATED: ${key}\\b[^\\n]*-->$`, 'm');
const endRe = (key) => new RegExp(`^<!-- END GENERATED: ${key} -->$`, 'm');

/**
 * The full replaceable block: markers plus the rendered body, with the blank
 * lines CommonMark needs to end the surrounding HTML block.
 */
export const regionBlock = (key, body) =>
  `${beginMarker(key)}\n\n${body.replace(/\s+$/, '')}\n\n${endMarker(key)}`;

/**
 * Replace `key`'s region in `pageText`. Marker-region splice, never a whole-page
 * rewrite — these pages own hand-written prose around the island, unlike
 * apps/reference/components.md which owns its whole file.
 */
/**
 * Assert the region still sits INSIDE its island's slot.
 *
 * This is the invariant the whole mechanism rests on, and it is the one a
 * content diff cannot see: the markdown is invisible to the HTML *only* because
 * Vue drops slot content for a component with no `<slot />`. Move the region one
 * line out of the tags — or revert the tags to the old self-closing
 * `<Component />` — and the page renders the static table a SECOND time,
 * underneath the rich island, with every text check still green.
 *
 * @param {string} pageText
 * @param {{key: string, component: string, page: string}} region
 */
export function assertRegionInSlot(pageText, region) {
  const { key, component } = region;
  const lines = pageText.split('\n');
  const b = lines.findIndex((l) => beginRe(key).test(l));
  const e = lines.findIndex((l) => endRe(key).test(l));
  if (b < 0 || e < 0) return; // marker errors are reported by spliceRegion
  // Nearest NON-BLANK neighbour, not the literal adjacent line: a blank line
  // between the tag and the marker is harmless (the tag pair still brackets the
  // content in the compiled template), so pinning exact adjacency would be a
  // formatting rule masquerading as a safety check.
  const prevNonBlank = (i) => {
    for (let j = i - 1; j >= 0; j--) if (lines[j].trim()) return lines[j].trim();
    return null;
  };
  const nextNonBlank = (i) => {
    for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j].trim();
    return null;
  };
  const open = prevNonBlank(b);
  const close = nextNonBlank(e);
  if (open !== `<${component}>`) {
    throw new Error(
      `region '${key}' is NOT inside the <${component}> slot — the line above BEGIN is ` +
        `${JSON.stringify(open ?? '(start of file)')}, expected "<${component}>". Outside the slot the ` +
        `markdown RENDERS, duplicating the island in the HTML.`,
    );
  }
  if (close !== `</${component}>`) {
    throw new Error(
      `region '${key}' is NOT closed inside the <${component}> slot — the line below END is ` +
        `${JSON.stringify(close ?? '(end of file)')}, expected "</${component}>". Outside the slot the ` +
        `markdown RENDERS, duplicating the island in the HTML.`,
    );
  }
}

export function spliceRegion(pageText, key, body) {
  const begins = pageText.match(new RegExp(beginRe(key).source, 'gm')) ?? [];
  const ends = pageText.match(new RegExp(endRe(key).source, 'gm')) ?? [];
  if (begins.length !== 1) {
    throw new Error(`appblocks-md: expected exactly 1 BEGIN marker for region '${key}', found ${begins.length}`);
  }
  if (ends.length !== 1) {
    throw new Error(`appblocks-md: expected exactly 1 END marker for region '${key}', found ${ends.length}`);
  }
  const b = pageText.match(beginRe(key));
  const e = pageText.match(endRe(key));
  const start = b.index;
  const stop = e.index + e[0].length;
  if (stop <= start) throw new Error(`appblocks-md: END marker precedes BEGIN for region '${key}'`);
  return pageText.slice(0, start) + regionBlock(key, body) + pageText.slice(stop);
}

// ── per-page renderers ───────────────────────────────────────────────────────

/** apps/reference/scopes.md — mirrors <ScopesTable>. */
function renderScopes() {
  const { scopes } = loadArtifact('scopes.json');
  if (!scopes?.length) throw new Error('appblocks-md: scopes.json has no scopes');
  return table(
    ['Scope', 'What it authorizes', 'OAuth bit', 'Binding'],
    scopes.map((s) => [codeCell(s.scope), cell(s.description), s.oauthBit ? codeCell(s.oauthBit) : '—', cell(s.binding)]),
  );
}

/** apps/reference/manifest.md — mirrors <JsonSchemaTable>'s typeText/constraintText. */
function typeText(prop) {
  if (!prop) return '';
  let t = Array.isArray(prop.type) ? prop.type.join(' | ') : prop.type ?? '';
  if (prop.enum) t = prop.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (t === 'array' && prop.items?.type) t = `${prop.items.type}[]`;
  if (prop.format) t += ` (${prop.format})`;
  return t;
}
function constraintText(prop) {
  if (!prop) return '';
  const bits = [];
  if (prop.pattern) bits.push(`pattern: ${prop.pattern}`);
  if (prop.minLength != null) bits.push(`minLength ${prop.minLength}`);
  if (prop.maxLength != null) bits.push(`maxLength ${prop.maxLength}`);
  if (prop.minimum != null) bits.push(`min ${prop.minimum}`);
  if (prop.maximum != null) bits.push(`max ${prop.maximum}`);
  if (prop.exclusiveMinimum != null) bits.push(`> ${prop.exclusiveMinimum}`);
  if (prop.maxItems != null) bits.push(`maxItems ${prop.maxItems}`);
  if (prop.default !== undefined) bits.push(`default: ${JSON.stringify(prop.default)}`);
  return bits.join(', ');
}
function renderManifest() {
  const schema = loadArtifact('manifest-schema.json');
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const entries = Object.entries(props);
  if (!entries.length) throw new Error('appblocks-md: manifest-schema.json has no properties');
  return table(
    ['Field', 'Type', 'Required', 'Notes'],
    entries.map(([field, prop]) => {
      const constraints = constraintText(prop);
      const notes = [cell(prop.description ?? ''), constraints ? codeCell(constraints) : ''].filter(Boolean).join(' ');
      return [codeCell(field), codeOrDash(typeText(prop)), required.has(field) ? 'required' : 'optional', notes || '—'];
    }),
  );
}

/** apps/reference/hooks.md — mirrors <HooksReference>. */
function renderHooks() {
  const { hooks } = loadArtifact('hooks.json');
  if (!hooks?.length) throw new Error('appblocks-md: hooks.json has no hooks');
  return hooks
    .map((h) =>
      blocks(
        // Bold, NOT a markdown heading: markdown-it lifts an `###` inside the
        // slot into the page's header list even though Vue never renders it,
        // which would put phantom entries in the outline.
        `**${code(h.name)}**`,
        fence('ts', h.signature),
        h.description ? para(h.description) : '',
        h.example ? fence('tsx', h.example) : '',
      ),
    )
    .join('\n\n');
}

/** apps/reference/messages.md — mirrors <MessageTable>. */
const FAMILY_LABELS = {
  lifecycle: 'Lifecycle',
  auth: 'Auth & token',
  workflow: 'Generation workflows',
  subqueue: 'App subqueue',
  buzz: 'Buzz',
  viewer: 'Viewer',
  pickers: 'Pickers & upload',
  storage: 'Per-app storage',
  shared: 'Shared storage',
  wildcard: 'Wildcard packs',
  other: 'Other',
};
function renderMessages() {
  const { messages } = loadArtifact('messages.json');
  if (!messages?.length) throw new Error('appblocks-md: messages.json has no messages');
  const order = [];
  const byFamily = {};
  for (const m of messages) {
    if (!byFamily[m.family]) {
      byFamily[m.family] = [];
      order.push(m.family);
    }
    byFamily[m.family].push(m);
  }
  return order
    .map((fam) => {
      const items = byFamily[fam].map((m) => {
        const badges = [
          m.direction === 'block-to-host' ? 'block → host' : 'host → block',
          m.request ? 'request → reply' : m.direction === 'block-to-host' ? 'fire-and-forget' : '',
          m.pageOnly ? 'page-only' : '',
        ].filter(Boolean);
        return blocks(
          `**${code(m.name)}** — ${badges.join(' · ')}`,
          m.payload
            ? `payload${m.payloadOptional ? ' (optional)' : ''}:\n\n${fence('ts', m.payload)}`
            : 'payload: (none)',
          m.reply ? `reply ${code(m.reply)}${m.replyPayload ? `:\n\n${fence('ts', m.replyPayload)}` : ''}` : '',
          m.replyNote ? para(m.replyNote) : '',
          m.pageOnly && m.slotNote ? `Model slot: ${para(m.slotNote)}` : '',
        );
      });
      return blocks(`**${FAMILY_LABELS[fam] ?? fam}**`, items);
    })
    .join('\n\n');
}

/** apps/reference/cli.md — mirrors <CliReference>. */
const CLI_STATUS_LABELS = { 'coming-soon': 'coming soon', gated: 'invite-only', experimental: 'experimental' };
const cliBadge = (status) =>
  !status || status === 'stable' || status === 'available' ? null : CLI_STATUS_LABELS[status] ?? status;
const optionRows = (opts) =>
  table(
    ['Flag', 'Description', 'Default'],
    opts.map((o) => [codeCell(o.flags), cell(o.description), o.default ? codeCell(o.default) : '—']),
  );
function renderCli() {
  const data = loadArtifact('cli.json');
  const commands = data.commands ?? [];
  if (!commands.length) throw new Error('appblocks-md: cli.json has no commands');
  const bin = data.program?.name ?? 'civitai';
  const globalOptions = data.program?.globalOptions ?? [];

  const parts = [];
  if (globalOptions.length) {
    parts.push(
      blocks(
        '**Global flags**',
        para(`Accepted by every \`${bin}\` command, in addition to the flags listed with it.`),
        optionRows(globalOptions),
      ),
    );
  }
  for (const c of commands) {
    const badge = cliBadge(c.status);
    const sig = `${bin} ${c.command}${c.args ? ` ${c.args}` : ''}`;
    parts.push(
      blocks(
        `**${code(sig)}**${badge ? ` — ${badge}` : ''}`,
        para(c.description.replace(/\s*\[coming soon\]\s*$/i, '')),
        c.examples?.length ? fence('bash', c.examples.join('\n')) : '',
        c.options?.length ? optionRows(c.options) : '',
      ),
    );
  }
  return parts.join('\n\n');
}

/** apps/tokens.md — mirrors <TokenGallery>'s rows (minus the live swatches). */
async function renderTokens() {
  // The published package IS the source of truth here, exactly as in the
  // component — there is no tokens JSON artifact to read.
  const { tokens, darkTokens, tokenVars } = await import('@civitai/theme');
  const names = Object.keys(tokenVars);
  if (!names.length) throw new Error('appblocks-md: @civitai/theme exports no tokens');
  const cssVarOf = (n) => (/var\((--[a-z0-9-]+)\)/i.exec(tokenVars[n]) ?? [, ''])[1];
  const categorize = (n) => (n.startsWith('color') ? 'color' : n.startsWith('font') ? 'typography' : 'shape');
  const rows = names.map((name) => ({
    name,
    cssVar: cssVarOf(name),
    light: tokens[name] ?? '',
    // Mirrors the component: darkTokens only carries the OVERRIDES, so a token
    // absent from it resolves to its light value in both themes.
    dark: darkTokens[name] ?? tokens[name] ?? '',
    category: categorize(name),
  }));
  const section = (label, cat) => {
    const rs = rows.filter((r) => r.category === cat);
    if (!rs.length) return '';
    return blocks(
      `**${label}**`,
      table(
        ['Token', 'CSS property', 'Light', 'Dark'],
        rs.map((r) => [codeCell(r.name), codeCell(r.cssVar), codeCell(r.light), codeCell(r.dark)]),
      ),
    );
  };
  return blocks(section('Color', 'color'), section('Typography', 'typography'), section('Shape', 'shape'));
}

/** apps/reference/generation.md — mirrors <BridgeReference>. */
function fieldRows(fields) {
  return table(
    ['Field', 'Type', 'Notes'],
    fields.map((f) => [codeCell(`${f.name}${f.optional ? '?' : ''}`), codeOrDash(f.type), cell(f.description)]),
  );
}
function renderBridge() {
  const data = loadArtifact('bridge.json');
  const { lifecycle } = data;
  const types = data.types ?? [];
  if (!types.length) throw new Error('appblocks-md: bridge.json has no types');
  const parts = [];
  if (lifecycle) {
    parts.push(
      blocks(
        `**${code(`${lifecycle.name}()`)}** — lifecycle`,
        fence('ts', lifecycle.signature),
        lifecycle.description ? para(lifecycle.description) : '',
        lifecycle.members?.length ? fieldRows(lifecycle.members) : '',
      ),
    );
  }
  for (const t of types) {
    parts.push(
      blocks(
        `**${code(t.name)}** — ${t.kind}`,
        t.description ? para(t.description) : '',
        t.kind === 'union' && t.members?.length
          ? t.members.map((m) => `- ${code(m)}`).join('\n')
          : t.fields?.length
            ? fieldRows(t.fields)
            : t.text
              ? fence('ts', t.text)
              : '',
      ),
    );
  }
  return parts.join('\n\n');
}

// ── the region catalog ───────────────────────────────────────────────────────

/**
 * One entry per island whose payload would otherwise be invisible to the .md
 * channel. `page` is repo-root-relative; `render` returns the region BODY.
 */
export const REGIONS = [
  { key: 'cli', page: 'apps/reference/cli.md', component: 'CliReference', render: renderCli },
  { key: 'hooks', page: 'apps/reference/hooks.md', component: 'HooksReference', render: renderHooks },
  { key: 'manifest', page: 'apps/reference/manifest.md', component: 'JsonSchemaTable', render: renderManifest },
  { key: 'messages', page: 'apps/reference/messages.md', component: 'MessageTable', render: renderMessages },
  { key: 'scopes', page: 'apps/reference/scopes.md', component: 'ScopesTable', render: renderScopes },
  { key: 'tokens', page: 'apps/tokens.md', component: 'TokenGallery', render: renderTokens },
  { key: 'bridge', page: 'apps/reference/generation.md', component: 'BridgeReference', render: renderBridge },
];

export const pagePath = (region) => join(repoRoot, region.page);

/** Render every region, returning `{ region, body }` in catalog order. */
export async function renderAll() {
  const out = [];
  for (const region of REGIONS) {
    out.push({ region, body: await region.render() });
  }
  return out;
}
