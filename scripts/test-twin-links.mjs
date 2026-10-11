// Unit test for scripts/lib/twin-links.mjs — the post-build pass that rewrites
// the relative links in every `.md` twin to root-absolute paths.
//
// `check:twin-links` grades the BUILT site, but today's corpus carries no
// relative-looking link inside a code block, so the build alone can never show
// the rewriter leaving code untouched. These fixtures pin each shape the
// rewriter must and must not touch, with literal expected output.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { absolutizeLinks, rewriteTwinLinks, sourceDirOf } from './lib/twin-links.mjs';

let n = 0;
function eq(actual, expected, name) {
  assert.equal(actual, expected, name);
  n++;
}

const dir = 'apps/guide';
// Rewritten: ./x, x, ../x, anchors + queries kept, titles kept, angle brackets, images, ref defs, ./ and .
eq(absolutizeLinks('[a](./sdk)', dir), '[a](/apps/guide/sdk)', 'dot-slash');
eq(absolutizeLinks('[a](sdk)', dir), '[a](/apps/guide/sdk)', 'bare relative');
eq(absolutizeLinks('[a](../reference/hooks#x)', dir), '[a](/apps/reference/hooks#x)', 'parent + anchor');
eq(absolutizeLinks('[a](./concepts?tab=1#y)', dir), '[a](/apps/guide/concepts?tab=1#y)', 'query + anchor');
eq(absolutizeLinks('[a](./sdk "The SDK")', dir), '[a](/apps/guide/sdk "The SDK")', 'title kept');
eq(absolutizeLinks('[a](<./my page>)', dir), '[a](</apps/guide/my page>)', 'angle-bracket target');
eq(absolutizeLinks('![i](./shot.png)', dir), '![i](/apps/guide/shot.png)', 'image');
eq(absolutizeLinks('[r]: ./sdk', dir), '[r]: /apps/guide/sdk', 'reference definition');
eq(absolutizeLinks('[a](./)', dir), '[a](/apps/guide/)', 'this directory');
eq(absolutizeLinks('[a](../)', dir), '[a](/apps/)', 'parent directory');
eq(absolutizeLinks('[a](./sdk.md)', dir), '[a](/apps/guide/sdk.md)', '.md target');
eq(absolutizeLinks('[a](./x)', ''), '[a](/x)', 'site-root page');
eq(absolutizeLinks('[`<civitai-*>` el](./elements) and `code`', dir), '[`<civitai-*>` el](/apps/guide/elements) and `code`', 'code in label');
eq(absolutizeLinks('[a](./a) then [b](b)', dir), '[a](/apps/guide/a) then [b](/apps/guide/b)', 'two on a line');

// Left alone: root paths, schemes, protocol-relative, same-page anchors/queries.
for (const keep of [
  '[a](/apps/x)',
  '[a](https://e.com/x)',
  '[a](mailto:x@y.z)',
  '[a](//cdn.example.com/x)',
  '[a](#anchor)',
  '[a](?q=1)',
]) {
  eq(absolutizeLinks(keep, dir), keep, `kept: ${keep}`);
}

// Left alone: inline code spans (single and multi-backtick) and fenced blocks.
eq(absolutizeLinks('`[a](./x)` and [b](./y)', dir), '`[a](./x)` and [b](/apps/guide/y)', 'inline code');
eq(absolutizeLinks('``[a](./x) ` z`` [b](./y)', dir), '``[a](./x) ` z`` [b](/apps/guide/y)', 'double-backtick span');
eq(absolutizeLinks('a ` lone [b](./y)', dir), 'a ` lone [b](/apps/guide/y)', 'unmatched backtick is text');
const fenced = ['```md', '[a](./x)', '```', '[b](./y)'].join('\n');
eq(absolutizeLinks(fenced, dir), ['```md', '[a](./x)', '```', '[b](/apps/guide/y)'].join('\n'), 'backtick fence');
const tilde = ['  ~~~~', '  [a](./x)', '  ```', '  [c](./z)', '  ~~~~', '[b](./y)'].join('\n');
eq(
  absolutizeLinks(tilde, dir),
  ['  ~~~~', '  [a](./x)', '  ```', '  [c](./z)', '  ~~~~', '[b](/apps/guide/y)'].join('\n'),
  'indented tilde fence, inner backtick fence does not close it',
);

// sourceDirOf + rewriteTwinLinks over a fixture site.
const root = mkdtempSync(join(tmpdir(), 'twin-links-'));
try {
  const src = join(root, 'src');
  const out = join(root, 'dist');
  for (const d of ['apps/guide', 'apps/reference']) mkdirSync(join(src, d), { recursive: true });
  for (const d of ['apps/guide', 'agent-setup']) mkdirSync(join(out, d), { recursive: true });
  writeFileSync(join(src, 'apps/guide/index.md'), '# g');
  writeFileSync(join(src, 'apps/guide/sdk.md'), '# s');
  writeFileSync(join(src, 'apps/reference.md'), '# ambiguous');
  writeFileSync(join(src, 'apps/reference/index.md'), '# ambiguous');

  eq(sourceDirOf('apps/guide.md', src), 'apps/guide', 'index twin -> its own directory');
  eq(sourceDirOf('apps/guide/sdk.md', src), 'apps/guide', 'page twin -> its parent');
  assert.throws(() => sourceDirOf('apps/reference.md', src), /ambiguous/);
  assert.throws(() => sourceDirOf('apps/nope.md', src), /no source page/);
  n += 2;

  writeFileSync(join(out, 'apps/guide.md'), '---\nurl: /apps/guide.md\n---\n[s](./sdk)\n');
  writeFileSync(join(out, 'apps/guide/sdk.md'), "---\nurl: '/apps/guide/sdk.md'\n---\n[i](./)\n");
  // Not a plugin twin (no url: frontmatter naming itself): must stay byte-identical.
  const prompt = '# prompt\n[x](./y)\n';
  writeFileSync(join(out, 'agent-setup/prompt.md'), prompt);
  const r = rewriteTwinLinks(out, src);
  eq(r.twins, 2, 'twin count');
  eq(r.changed, 2, 'changed count');
  eq(readFileSync(join(out, 'apps/guide.md'), 'utf8'), '---\nurl: /apps/guide.md\n---\n[s](/apps/guide/sdk)\n', 'index twin');
  eq(readFileSync(join(out, 'apps/guide/sdk.md'), 'utf8'), "---\nurl: '/apps/guide/sdk.md'\n---\n[i](/apps/guide/)\n", 'page twin');
  eq(readFileSync(join(out, 'agent-setup/prompt.md'), 'utf8'), prompt, 'non-twin untouched');
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`test-twin-links: OK — ${n} assertions`);
