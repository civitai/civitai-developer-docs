#!/usr/bin/env node
// Contract tests for the two post-build passes behind the agent surface:
// `scripts/lib/agent-surface.mjs` (absolute `.md` links, index note, section
// indexes) and `scripts/lib/operation-twins.mjs` (API operation twins and their
// fail-loud count). Pure functions over fixtures — no build needed, so this runs
// BEFORE the build in CI and names the function when it fails.
//
// The built-site counterpart is `scripts/check-agent-surface.mjs`.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyAgentSurface,
  INDEX_NOTE,
  insertIndexGroup,
  ORIGIN,
  parseIndex,
  toAbsoluteMd,
  twinForPath,
  withIndexNote,
  withoutIndexNote,
} from './lib/agent-surface.mjs';
import { buildOperationTwins, operationTitle, specOperations, typeText } from './lib/operation-twins.mjs';

let n = 0;
const failures = [];
const eq = (got, want, what) => {
  n++;
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${what}\n      want ${JSON.stringify(want)}\n      got  ${JSON.stringify(got)}`);
};
const throws = (fn, re, what) => {
  n++;
  try {
    fn();
    failures.push(`${what}: did not throw`);
  } catch (e) {
    if (!re.test(e.message)) failures.push(`${what}: threw the wrong error: ${e.message}`);
  }
};

// ── twinForPath / toAbsoluteMd ───────────────────────────────────────────────
const twins = new Set(['/apps/guide.md', '/apps/guide/sdk.md', '/index.md', '/site.md']);
eq(twinForPath('/apps/guide/', twins), '/apps/guide.md', 'section index, trailing slash');
eq(twinForPath('/apps/guide', twins), '/apps/guide.md', 'section index, no slash');
eq(twinForPath('/apps/guide/index.html', twins), '/apps/guide.md', 'section index, explicit index.html');
eq(twinForPath('/apps/guide/index.md', twins), '/apps/guide.md', 'nginx /<dir>/index.md alias');
eq(twinForPath('/apps/guide/sdk', twins), '/apps/guide/sdk.md', 'leaf page');
eq(twinForPath('/apps/guide/sdk.html', twins), '/apps/guide/sdk.md', 'leaf page .html');
eq(twinForPath('/apps/guide/sdk.md', twins), '/apps/guide/sdk.md', 'leaf page .md');
eq(twinForPath('/', twins), '/index.md', 'homepage, when it has a twin');
eq(twinForPath('/', new Set()), null, 'homepage without a twin');
eq(twinForPath('/apps/missing', twins), null, 'a route with no twin');
eq(twinForPath('/images/a.png', twins), null, 'an asset');
eq(twinForPath('/llms.txt', twins), null, 'a .txt file');
eq(twinForPath('//cdn.example/x', twins), null, 'protocol-relative');

eq(toAbsoluteMd('/apps/guide/sdk#init', twins), `${ORIGIN}/apps/guide/sdk.md#init`, 'fragment preserved');
eq(toAbsoluteMd('/apps/guide/?x=1#a', twins), `${ORIGIN}/apps/guide.md?x=1#a`, 'query + fragment preserved');
eq(toAbsoluteMd(`${ORIGIN}/apps/guide/`, twins), `${ORIGIN}/apps/guide.md`, 'absolute HTML route on this origin');
eq(toAbsoluteMd('https://github.com/civitai/cli', twins), 'https://github.com/civitai/cli', 'external untouched');
eq(toAbsoluteMd('/images/a.png', twins), '/images/a.png', 'asset untouched');
eq(toAbsoluteMd('/openapi/v2-consumers.json', twins), '/openapi/v2-consumers.json', 'non-page file untouched');
eq(toAbsoluteMd('/apps/missing', twins), '/apps/missing', 'no twin -> untouched');
eq(toAbsoluteMd('#same-page', twins), '#same-page', 'same-page anchor untouched');
eq(toAbsoluteMd('mailto:a@b.c', twins), 'mailto:a@b.c', 'other scheme untouched');

// ── index note ───────────────────────────────────────────────────────────────
const twin = '---\nurl: /a.md\n---\n\n# A\n';
const noted = withIndexNote(twin);
eq(noted, `---\nurl: /a.md\n---\n\n${INDEX_NOTE}\n\n# A\n`, 'note goes right after the frontmatter');
eq(withIndexNote(noted), noted, 'note insertion is idempotent');
eq(withoutIndexNote(noted), twin, 'note removal inverts insertion');

// ── llms.txt shape ───────────────────────────────────────────────────────────
const llms = '# T\n\n> d\n\n## Table of Contents\n\n### G\n\n- [A](/a.md)\n- [R](/orchestration/reference.md): r\n\n### H\n\n- [B](/b.md)\n';
eq(parseIndex(llms).toc.map((g) => g.lines.length), [2, 1], 'parseIndex groups');
eq(
  insertIndexGroup(llms, 'API operations', ['- [X](/x.md): GET /x'], '/orchestration/reference.md').match(/^### .*/gm),
  ['### G', '### API operations', '### H'],
  'operations group lands right after the group listing the reference overview',
);
throws(() => parseIndex('# T\n\n## Table of Contents\n\n### G\n\n- [multi\nline](/x.md)\n'), /unparseable/, 'a multi-line entry is refused');
throws(() => parseIndex('# T\n'), /Table of Contents/, 'no TOC is refused');

// ── applyAgentSurface on a fixture build ─────────────────────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'agent-surface-'));
  try {
    const w = (p, t) => {
      mkdirSync(join(dir, p, '..'), { recursive: true });
      writeFileSync(join(dir, p), t);
    };
    w('apps.md', '---\nurl: /apps.md\n---\n\n# Apps\n\nSee [guide](/apps/guide/) and `[code](/apps/guide/)`.\n');
    w('apps/guide.md', '---\nurl: /apps/guide.md\n---\n\n# Guide\n\n[home](/apps) [img](/images/x.png) [ext](https://e.com)\n\n```\n[fenced](/apps)\n```\n');
    w('site.md', '---\nurl: /site.md\n---\n\n# Site\n\n[a](/site/x#h)\n');
    w('site/x.md', '---\nurl: /site/x.md\n---\n\n# X\n');
    w('agent-setup/prompt.md', 'raw prompt [g](/apps/guide/)\n');
    w('llms.txt', '# Docs\n\n> d\n\n## Table of Contents\n\n### Apps\n\n- [Apps](/apps.md): apps desc\n- [Guide](/apps/guide.md)\n\n### Site\n\n- [Site](/site.md): site desc\n- [X](/site/x.md)\n');
    const sec = (u, body) => `---\nurl: ${u}\n---\n\n${body}`;
    w('llms-full.txt', [sec('/apps.md', '[g](/apps/guide/)\n'), sec('/apps/guide.md', 'g\n'), sec('/site.md', 's\n'), sec('/site/x.md', 'x\n')].join('\n---\n\n'));
    const r = applyAgentSurface(dir);
    const rd = (p) => readFileSync(join(dir, p), 'utf8');
    eq(r.twins, 4, 'fixture: twins discovered by frontmatter identity');
    eq(rd('agent-setup/prompt.md'), 'raw prompt [g](/apps/guide/)\n', 'fixture: a non-twin .md (public/ copy) is untouched');
    eq(rd('apps.md').includes(`[guide](${ORIGIN}/apps/guide.md)`), true, 'fixture: prose link absolutized to .md');
    eq(rd('apps.md').includes('`[code](/apps/guide/)`'), true, 'fixture: inline code untouched');
    eq(rd('apps/guide.md').includes('[fenced](/apps)'), true, 'fixture: fenced code untouched');
    eq(rd('apps/guide.md').includes(`[home](${ORIGIN}/apps.md)`), true, 'fixture: /apps -> /apps.md');
    eq(rd('apps/guide.md').includes('[img](/images/x.png)'), true, 'fixture: asset untouched');
    eq(rd('site.md').includes(`[a](${ORIGIN}/site/x.md#h)`), true, 'fixture: fragment kept');
    eq(rd('apps.md').split(INDEX_NOTE).length - 1, 1, 'fixture: exactly one index note');
    eq(rd('llms.txt').includes(`- [Guide](${ORIGIN}/apps/guide.md)`), true, 'fixture: llms.txt entries absolute');
    eq(rd('llms.txt').includes(`(${ORIGIN}/apps/llms.txt)`) && rd('llms.txt').includes(`(${ORIGIN}/site/llms.txt)`), true, 'fixture: root names both section indexes');
    eq(parseIndex(rd('apps/llms.txt')).toc.flatMap((g) => g.lines).length, 2, 'fixture: /apps/llms.txt holds only apps entries');
    eq(rd('apps/llms.txt').startsWith('# Apps\n\n> apps desc\n'), true, 'fixture: section index titled from its own entry');
    eq([...rd('site/llms-full.txt').matchAll(/^url: (.+)$/gm)].map((m) => m[1]), ['/site.md', '/site/x.md'], 'fixture: /site/llms-full.txt sections');
    eq(rd('llms-full.txt').includes(`[g](${ORIGIN}/apps/guide.md)`), true, 'fixture: root bundle links absolutized');
    eq(rd('apps/llms-full.txt').includes('[g](https://developer.civitai.com/apps/guide.md)'), true, 'fixture: section bundle carries the rewritten links');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── operation twins ──────────────────────────────────────────────────────────
const spec = {
  paths: {
    '/v2/things/{id}': {
      get: {
        operationId: 'GetThing',
        summary: 'Get a thing.\nSecond line of the summary.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'mode', in: 'query', schema: { $ref: '#/components/schemas/Mode' } },
        ],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } },
          404: { description: 'Not Found' },
        },
      },
      delete: { operationId: 'DeleteThing', summary: 'Delete', security: [], responses: { 204: { description: 'No Content' } } },
    },
  },
  components: {
    schemas: {
      Mode: { type: 'string', enum: ['a', 'b'] },
      Thing: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, tags: { type: ['null', 'array'], items: { type: 'string' } } } },
    },
  },
};
eq(specOperations(spec).map((o) => o.operationId), ['GetThing', 'DeleteThing'], 'specOperations in document order');
eq(operationTitle(spec.paths['/v2/things/{id}'].get, 'GetThing'), 'Get a thing', 'title is the first summary line');
eq(typeText(spec, { $ref: '#/components/schemas/Mode' }), '`Mode` (one of `a`, `b`)', 'enum ref type text');
eq(typeText(spec, { type: ['null', 'array'], items: { type: 'string' } }), 'array of string, nullable', 'nullable array type text');
const built = buildOperationTwins(spec, ['DeleteThing', 'GetThing']);
const get = built.find((o) => o.operationId === 'GetThing').text;
eq(get.startsWith('---\nurl: /orchestration/reference/operations/GetThing.md\n'), true, 'op twin frontmatter names its own URL');
eq(get.includes('`GET https://orchestration.civitai.com/v2/things/{id}`'), true, 'op twin method + path');
eq(get.includes('| `id` | path | string | yes |'), true, 'op twin path parameter row');
eq(get.includes('| `mode` | query | `Mode` (one of `a`, `b`) | no |'), true, 'op twin enum parameter row');
eq(/^### 200 OK$/m.test(get) && /^### 404 Not Found$/m.test(get), true, 'op twin response headings');
eq(get.includes('Schema `Thing`') && get.includes('| `id` | string | yes |'), true, 'op twin response schema resolved one level');
eq(get.includes('Second line of the summary.'), true, 'multi-line summary kept in the body');
eq(built.find((o) => o.operationId === 'DeleteThing').text.includes('marks this operation anonymous (`security: []`)'), true, 'security: [] -> anonymous, in the spec\'s own terms');
{
  const s2 = JSON.parse(JSON.stringify(spec));
  s2.components.securitySchemes = { ApiKey: { type: 'http', scheme: 'bearer' } };
  s2.components.schemas.Patch = { type: 'array', items: { $ref: '#/components/schemas/Op' }, description: 'ops' };
  s2.components.schemas.Op = { type: 'object', required: ['op'], properties: { op: { type: 'string', enum: ['add', 'remove'] } } };
  s2.paths['/v2/things/{id}'].patch = {
    operationId: 'PatchThing',
    requestBody: { content: { 'application/json-patch+json': { schema: { $ref: '#/components/schemas/Patch' } } } },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } }, 'application/zip': { schema: { type: 'string', format: 'binary' } } } },
      401: { description: 'Unauthorized' },
    },
  };
  const t = buildOperationTwins(s2, ['GetThing', 'DeleteThing', 'PatchThing']).find((o) => o.operationId === 'PatchThing').text;
  eq(t.includes('Schema `Patch`: array of `Op`') && t.includes('| `op` | string, one of `add`, `remove` | yes |'), true, 'array $ref body: element type and its fields');
  eq(t.includes('For `application/zip`:') && t.includes('string (binary)'), true, 'per-content-type response schemas');
  eq(t.includes("the spec's `ApiKey` scheme") && t.includes('documents `401 Unauthorized`'), true, 'bearer auth statement grounded in the spec');
  eq(typeText(s2, { type: 'string', enum: Array.from({ length: 40 }, (_, i) => `v${i}`) }).includes('`v39`'), true, 'a 40-value enum is not truncated');
}
throws(() => buildOperationTwins({ paths: {} }, []), /0 operations/, 'FAIL-LOUD: an emptied spec');
throws(() => buildOperationTwins(spec, ['GetThing']), /2 operation\(s\) in the spec but 1/, 'FAIL-LOUD: loader has fewer pages than the spec');
throws(() => buildOperationTwins(spec, ['GetThing', 'DeleteThing', 'Other']), /missing twins: \[Other\]/, 'FAIL-LOUD: loader has a page the spec lacks');
throws(() => buildOperationTwins(spec, []), /but 0 generated/, 'FAIL-LOUD: loader produced nothing');

if (failures.length) {
  console.error(`test-agent-surface: ${failures.length} of ${n} assertion(s) FAILED:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`test-agent-surface: OK — ${n} assertions`);
