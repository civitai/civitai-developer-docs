// Unit test for scripts/lib/twin-table-pipes.mjs — the post-build pass that puts
// the `\|` escapes back into twin table rows the llms plugin's serializer broke.
//
// Every expected value is a literal. The column counts come from `cells` below,
// a GFM cell counter written here rather than imported, so a pass that "fixes"
// a row into some other wrong shape still fails on the count.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dropPipeEscapes, restoreTablePipes, restoreTwinTablePipes } from './lib/twin-table-pipes.mjs';

let n = 0;
function eq(actual, expected, name) {
  assert.equal(actual, expected, name);
  n++;
}

/** GFM cell count of one table row: split on every `|` not preceded by `\`, code spans included (GFM splits cells first). */
function cells(row) {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  let count = 1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '|') count++;
  }
  return count;
}

// The live shapes (site/reference/models.md, site/reference/articles.md, 2026-11-17).
const HEADER = '| Param | Type | Default | Description |';
const DELIM = '|---|---|---|---|';
const SRC_ROW = '| `checkpointType` | `Standard` \\| `Trained` \\| `Merge` | — | For checkpoint models only. |';
const BROKEN_ROW = '| `checkpointType` | `Standard` | `Trained` | `Merge` | — | For checkpoint models only. |';
const CODE_ROW = '| `cursor` | string | — | Opaque keyset cursor (`"<v>\\|<id>"`). |';

eq(cells(HEADER), 4, 'header has 4 cells');
eq(cells(SRC_ROW), 4, 'source row has 4 cells');
eq(cells(BROKEN_ROW), 6, 'broken twin row has 6 cells (the bug)');
eq(cells(CODE_ROW), 4, 'inline-code row has 4 cells');

// The serializer model: `\|` dropped outside code spans, kept inside them.
eq(dropPipeEscapes(SRC_ROW), BROKEN_ROW, 'drops escapes outside code');
eq(dropPipeEscapes(CODE_ROW), CODE_ROW, 'keeps the escape inside a code span');
eq(dropPipeEscapes('a ``x \\| `y` `` \\| b'), 'a ``x \\| `y` `` | b', 'double-backtick span kept');

// ── one twin against its source ──────────────────────────────────────────────
const source = [
  '# Models',
  '',
  HEADER,
  DELIM,
  SRC_ROW,
  CODE_ROW,
  '',
  'Prose with `a \\| b` in code.',
  '',
  '```text',
  '| fenced \\| row |',
  '```',
  '',
].join('\n');
const twin = [
  '---',
  'url: /site/reference/models.md',
  '---',
  '# Models',
  '',
  HEADER,
  DELIM,
  BROKEN_ROW,
  CODE_ROW,
  '',
  'Prose with `a \\| b` in code.',
  '',
  '```text',
  '| fenced \\| row |',
  BROKEN_ROW,
  '```',
  '',
].join('\n');
const want = [
  '---',
  'url: /site/reference/models.md',
  '---',
  '# Models',
  '',
  HEADER,
  DELIM,
  SRC_ROW,
  CODE_ROW,
  '',
  'Prose with `a \\| b` in code.',
  '',
  '```text',
  '| fenced \\| row |',
  BROKEN_ROW,
  '```',
  '',
].join('\n');

const r = restoreTablePipes(twin, source);
eq(r.text, want, 'table row restored; fenced block and inline code untouched');
eq(r.restored, 1, 'one row restored');
eq(r.missed.length, 0, 'nothing missed');
const tableRows = r.text.split('\n').slice(5, 9);
for (const row of tableRows) eq(cells(row), 4, `twin row keeps the header's 4 columns: ${row}`);

// Already intact (an upstream fix, or a re-run): untouched, not missed.
const again = restoreTablePipes(want, source);
eq(again.text, want, 'idempotent');
eq(again.restored, 0, 'idempotent: nothing restored');
eq(again.missed.length, 0, 'idempotent: intact row is not missed');

// A source with no escaped table row leaves the twin byte-identical.
const plain = '---\nurl: /x.md\n---\n| a | b |\n|---|---|\n| `c\\|d` | e |\n';
eq(restoreTablePipes(plain, '| a | b |\n|---|---|\n| `c\\|d` | e |\n').text, plain, 'no escaped rows -> untouched');

// The plugin changed the row some other way: reported, not guessed.
const mangled = restoreTablePipes(twin.replace(BROKEN_ROW, BROKEN_ROW.replace('—', '-')), source);
eq(mangled.missed.length, 1, 'mangled row is missed');
eq(mangled.missed[0], SRC_ROW, 'missed names the source row');

// ── the post-build pass over a fixture dist ───────────────────────────────────
const root = mkdtempSync(join(tmpdir(), 'twin-table-pipes-'));
try {
  const src = join(root, 'src');
  const out = join(root, 'dist');
  for (const d of ['site/reference', 'apps/guide']) mkdirSync(join(src, d), { recursive: true });
  for (const d of ['site/reference', 'agent-setup']) mkdirSync(join(out, d), { recursive: true });
  writeFileSync(join(src, 'site/reference/models.md'), source);
  // An index page: twin /apps/guide.md, source apps/guide/index.md.
  const guideSrc = '| Opt | Values |\n|---|---|\n| `t` | a \\| b |\n';
  writeFileSync(join(src, 'apps/guide/index.md'), guideSrc);

  writeFileSync(join(out, 'site/reference/models.md'), twin);
  const guideTwin = '---\nurl: /apps/guide.md\n---\n| Opt | Values |\n|---|---|\n| `t` | a | b |\n';
  writeFileSync(join(out, 'apps/guide.md'), guideTwin);
  // Not a plugin twin: byte-identical afterwards, even though it holds a broken-looking row.
  const prompt = `# prompt\n${BROKEN_ROW}\n`;
  writeFileSync(join(out, 'agent-setup/prompt.md'), prompt);

  const sec = (url, body) => `---\nurl: ${url}\n---\n${body}`;
  const bundle = [
    sec('/site/reference/models.md', `${HEADER}\n${DELIM}\n${BROKEN_ROW}\n`),
    sec('/apps/guide.md', '| Opt | Values |\n|---|---|\n| `t` | a | b |\n'),
  ].join('\n---\n\n');
  writeFileSync(join(out, 'llms-full.txt'), bundle);

  const res = restoreTwinTablePipes(out, src);
  eq(JSON.stringify(res), JSON.stringify({ twins: 2, sections: 2, rowsRestored: 4, filesChanged: 3 }), 'pass counts');
  eq(readFileSync(join(out, 'site/reference/models.md'), 'utf8'), want, 'page twin restored');
  eq(
    readFileSync(join(out, 'apps/guide.md'), 'utf8'),
    '---\nurl: /apps/guide.md\n---\n| Opt | Values |\n|---|---|\n| `t` | a \\| b |\n',
    'index twin restored from <dir>/index.md',
  );
  eq(readFileSync(join(out, 'agent-setup/prompt.md'), 'utf8'), prompt, 'non-twin untouched');
  eq(
    readFileSync(join(out, 'llms-full.txt'), 'utf8'),
    [
      sec('/site/reference/models.md', `${HEADER}\n${DELIM}\n${SRC_ROW}\n`),
      sec('/apps/guide.md', '| Opt | Values |\n|---|---|\n| `t` | a \\| b |\n'),
    ].join('\n---\n\n'),
    'every llms-full section restored from its own source',
  );

  // A row the plugin changed some other way fails the pass, naming the twin.
  writeFileSync(join(out, 'apps/guide.md'), '---\nurl: /apps/guide.md\n---\n| Opt | Values |\n|---|---|\n| `t` | a | c |\n');
  assert.throws(() => restoreTwinTablePipes(out, src), /twin-table-pipes: 1 escaped source table row.*\n {2}\/apps\/guide\.md: \| `t` \| a \\\| b \|/);
  n++;
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`test-twin-table-pipes: OK — ${n} assertions`);
