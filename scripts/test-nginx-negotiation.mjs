#!/usr/bin/env node
// Serves the BUILT site with the REAL `nginx.conf` under the same runtime image
// the Dockerfile ships (`nginx:alpine`), and asserts the agent-facing HTTP
// contract over real HTTP: Accept negotiation, `Vary`, `Link`, Cache-Control
// (counted, not just read), Content-Type and the first bytes of each body.
//
// 🔴 WHY A REAL NGINX AND NOT A PARSE OF THE FILE. Every behaviour asserted here
// lives in nginx semantics that a reading of the config gets wrong in the
// reassuring direction: `add_header` inheritance (one header in a location drops
// every inherited one), `index` internal redirects (`/` is served by the `.html`
// location, not `location /`), `try_files` serving a file WITHOUT re-matching
// locations, `expires` emitting its own Cache-Control, and the q-value maps,
// which are string comparisons standing in for arithmetic. Only a running nginx
// can say what those combine to.
//
// Every page this picks is DERIVED from the build (a section index, a leaf page,
// an operation page, a page with no twin), so new pages need no edit here.
//
// Usage: npm run build && node scripts/test-nginx-negotiation.mjs [distDir] [--matrix]
// Requires docker. No docker -> exit 2 (an unrun contract is not a pass).

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join, resolve } from 'node:path';

const DIST = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.vitepress/dist');
const CONF = resolve(process.env.NGINX_CONF ?? 'nginx.conf');
const IMAGE = process.env.NGINX_IMAGE ?? 'nginx:alpine';

const AI_LINK = '</llms.txt>; rel="llms-txt", </llms-full.txt>; rel="llms-full-txt", </.well-known/ai-catalog.json>; rel="ai-catalog"';
const HTML_CC = 'no-cache, must-revalidate';
const TEXT_CC = 'public, max-age=300, must-revalidate';

const ACCEPT = {
  browser: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  webfetch: 'text/markdown, text/html, */*',
  any: '*/*',
  none: null,
};

// q-value table: [Accept, markdown expected?]
const Q_CASES = [
  ['text/markdown', true],
  ['text/markdown, text/html, */*', true],
  ['text/html, text/markdown', true], // tie at q=1 -> markdown
  ['text/markdown;q=0.9, text/html;q=0.8', true],
  ['text/markdown;q=0.5, text/html;q=0.9', false],
  ['text/markdown;q=0.85, text/html;q=0.8', true],
  ['text/markdown;q=0.8, text/html;q=0.85', false],
  ['text/markdown;q=0.8, text/html;q=0.8', true],
  ['text/markdown;q=1.0, text/html', true],
  ['text/markdown;q=0.3', true], // markdown acceptable, html not listed
  ['text/markdown;q=0, text/html', false], // q=0 = not acceptable
  ['text/markdown;q=0', false],
  ['TEXT/MARKDOWN', true],
  ['text/markdown; charset=utf-8, text/html;q=0.9', true],
  ['text/html;q=0.9, text/markdown;q=0.95', true],
  ['text/plain, text/html', false],
  ['text/markdownx, text/html', false],
  ['*/*', false],
  ['text/*', false],
  [null, false],
];

if (!existsSync(join(DIST, 'llms.txt'))) {
  console.error(`test-nginx-negotiation: no build at ${DIST} — run \`npm run build\` first.`);
  process.exit(2);
}
try {
  execFileSync('docker', ['version'], { stdio: 'ignore' });
} catch {
  console.error('test-nginx-negotiation: docker is not available — the contract was NOT tested (exit 2, not a pass).');
  process.exit(2);
}

// ── pick pages from the build ────────────────────────────────────────────────
const isFile = (p) => existsSync(p);
const sectionIndex = ['apps/guide', 'site/guide', 'orchestration/guide'].find(
  (d) => isFile(join(DIST, d, 'index.html')) && isFile(join(DIST, `${d}.md`)),
);
const leaf = (() => {
  const d = join(DIST, 'apps/guide');
  for (const f of readdirSync(d)) {
    if (f.endsWith('.html') && f !== 'index.html' && isFile(join(d, f.replace(/\.html$/, '.md')))) {
      return `apps/guide/${f.replace(/\.html$/, '')}`;
    }
  }
  return null;
})();
const opDir = join(DIST, 'orchestration/reference/operations');
const op = readdirSync(opDir).find((f) => f.endsWith('.md') && isFile(join(opDir, f.replace(/\.md$/, '.html'))));
if (!sectionIndex || !leaf || !op) {
  console.error(`test-nginx-negotiation: could not derive test pages (section=${sectionIndex} leaf=${leaf} op=${op}).`);
  process.exit(1);
}
const opRoute = `orchestration/reference/operations/${op.replace(/\.md$/, '')}`;

// HUB pages: `<d>.html` + `<d>.md` with a DIRECTORY `<d>/` of sub-pages and no
// `<d>/index.html` (the split hooks/cli/generation references). Their slash form
// used to answer 403. Every hub in the build is exercised, with one sub-page each.
function findHubs(dir, rel = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    const d = join(dir, e.name);
    if (isFile(`${d}.html`) && isFile(`${d}.md`) && !isFile(join(d, 'index.html'))) {
      const sub = readdirSync(d).find((f) => f.endsWith('.html') && isFile(join(d, f.replace(/\.html$/, '.md'))));
      if (sub) out.push({ hub: r, sub: `${r}/${sub.replace(/\.html$/, '')}` });
    }
    out.push(...findHubs(d, r));
  }
  return out;
}
const hubs = findHubs(DIST);
const homeHasTwin = isFile(join(DIST, 'index.md'));

// ── start nginx ──────────────────────────────────────────────────────────────
const id = execFileSync('docker', [
  'run', '-d', '--rm', '-p', '127.0.0.1::80',
  '-v', `${DIST}:/usr/share/nginx/html:ro`,
  '-v', `${CONF}:/etc/nginx/conf.d/default.conf:ro`,
  IMAGE,
]).toString().trim();
const stop = () => {
  try {
    execFileSync('docker', ['rm', '-f', id], { stdio: 'ignore' });
  } catch {}
};
process.on('exit', stop);

const port = execFileSync('docker', ['port', id, '80']).toString().trim().split('\n')[0].split(':').pop();

function get(path, accept) {
  return new Promise((ok, bad) => {
    const headers = {};
    if (accept !== null && accept !== undefined) headers.accept = accept;
    const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = res.rawHeaders;
        const all = (name) => {
          const out = [];
          for (let i = 0; i < raw.length; i += 2) if (raw[i].toLowerCase() === name) out.push(raw[i + 1]);
          return out;
        };
        ok({ status: res.statusCode, all, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', bad);
    req.end();
  });
}

for (let i = 0; ; i++) {
  try {
    await get('/llms.txt');
    break;
  } catch (e) {
    if (i > 50) {
      console.error(execFileSync('docker', ['logs', id]).toString());
      console.error(`test-nginx-negotiation: nginx never answered: ${e.message}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

// ── assertions ───────────────────────────────────────────────────────────────
const failures = [];
let checks = 0;
const expect = (cond, what) => {
  checks++;
  if (!cond) failures.push(what);
};
const linkMembers = (r) => r.all('link').join(', ');
const varyTokens = (r) => r.all('vary').join(',').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/** A negotiable document URL: markdown or HTML, with the matching headers. */
async function document(path, accept, { twin, wantMd, htmlRedirect }) {
  const r = await get(path, accept);
  const tag = `${path} [Accept: ${accept ?? '<none>'}]`;
  if (htmlRedirect && !wantMd) {
    // A directory URL without its slash: nginx's own 301, which must be RELATIVE
    // (`absolute_redirect off`) — an absolute one is built as `http://` behind the CDN.
    expect(r.status === 301, `${tag}: status ${r.status}, expected the directory-slash 301`);
    expect(r.all('location').join() === htmlRedirect, `${tag}: Location ${r.all('location')}, expected ${htmlRedirect}`);
    expect(linkMembers(r).includes(AI_LINK), `${tag}: Link lacks the site-wide $ai_link members`);
    return r;
  }
  const ct = r.all('content-type').join(',');
  const cc = r.all('cache-control');
  expect(r.status === 200, `${tag}: status ${r.status}`);
  expect(linkMembers(r).includes(AI_LINK), `${tag}: Link lacks the site-wide $ai_link members`);
  if (wantMd) {
    expect(ct.startsWith('text/markdown'), `${tag}: content-type ${ct}, expected text/markdown`);
    expect(!/^\s*</.test(r.body), `${tag}: markdown body starts with markup: ${JSON.stringify(r.body.slice(0, 40))}`);
    expect(cc.length === 1 && cc[0] === TEXT_CC, `${tag}: Cache-Control ${JSON.stringify(cc)}`);
  } else {
    expect(ct.startsWith('text/html'), `${tag}: content-type ${ct}, expected text/html`);
    expect(r.body.startsWith('<!DOCTYPE html>'), `${tag}: HTML body starts ${JSON.stringify(r.body.slice(0, 40))}`);
    expect(cc.length === 1 && cc[0] === HTML_CC, `${tag}: Cache-Control ${JSON.stringify(cc)} — expected exactly one`);
  }
  if (twin) {
    expect(varyTokens(r).includes('accept'), `${tag}: negotiable URL without Vary: Accept (${r.all('vary')})`);
    if (!wantMd) {
      expect(
        linkMembers(r).includes(`<${twin}>; rel="alternate"; type="text/markdown"`),
        `${tag}: Link lacks the alternate twin ${twin}: ${linkMembers(r)}`,
      );
      expect(linkMembers(r).includes('</llms.txt>; rel="describedby"'), `${tag}: Link lacks rel=describedby`);
    }
  } else {
    expect(!varyTokens(r).includes('accept'), `${tag}: URL with no twin sends Vary: Accept`);
    expect(!linkMembers(r).includes('rel="alternate"'), `${tag}: URL with no twin advertises an alternate`);
  }
  return r;
}

const rows = [];
const record = async (path, accept, opts) => {
  const r = await document(path, accept, opts);
  rows.push([path, accept === null ? 'none' : Object.keys(ACCEPT).find((k) => ACCEPT[k] === accept) ?? accept, r]);
};

const pages = [
  [`/${sectionIndex}/`, `/${sectionIndex}.md`],
  [`/${sectionIndex}`, `/${sectionIndex}.md`, `/${sectionIndex}/`],
  [`/${sectionIndex}/index.html`, `/${sectionIndex}.md`],
  [`/${leaf}`, `/${leaf}.md`],
  [`/${leaf}.html`, `/${leaf}.md`],
  [`/${opRoute}`, `/${opRoute}.md`],
  ['/', homeHasTwin ? '/index.md' : null],
  ['/404', null], // a real HTML page with no twin: markdown Accept must still get HTML, never a 404
];
for (const [path, twin, htmlRedirect] of pages) {
  for (const [name, accept] of Object.entries(ACCEPT)) {
    await record(path, accept, { twin, htmlRedirect, wantMd: Boolean(twin) && name === 'webfetch' });
  }
}

for (const { hub, sub } of hubs) {
  for (const [name, accept] of Object.entries(ACCEPT)) {
    const md = name === 'webfetch';
    // The slash form: markdown for a markdown client, else a RELATIVE 301 to the hub — never a 403.
    await record(`/${hub}/`, accept, { twin: `/${hub}.md`, wantMd: md, htmlRedirect: `/${hub}` });
    await record(`/${hub}`, accept, { twin: `/${hub}.md`, wantMd: md });
    await record(`/${sub}`, accept, { twin: `/${sub}.md`, wantMd: md });
  }
  const r = await get(`/${sub}.md`, ACCEPT.browser);
  rows.push([`/${sub}.md`, 'browser', r]);
  expect(r.status === 200 && r.all('content-type').join() === 'text/markdown; charset=utf-8', `/${sub}.md: ${r.status} ${r.all('content-type')}`);
}
{
  const r = await get('/__slash_redirect', ACCEPT.browser);
  expect(r.status === 404, `/__slash_redirect is reachable directly (${r.status}); it must be internal`);
}

// The q-value table, on one negotiable URL.
for (const [accept, md] of Q_CASES) {
  await document(`/${leaf}`, accept, { twin: `/${leaf}.md`, wantMd: md });
}

// Direct `.md` URLs: always markdown, never `Vary: Accept` (they do not negotiate).
// The two verbatim agent-setup files (the prompt and its in-sandbox leaf) are
// served from their own exact-match blocks, which must ALSO keep `nosniff` — an
// agent fetch tool that sniffs could otherwise reclassify the body.
const VERBATIM_AGENT_SETUP = ['/agent-setup/prompt.md', '/agent-setup/in-sandbox.md'];
for (const path of [`/${opRoute}.md`, `/${leaf}.md`, `/${sectionIndex}/index.md`, ...VERBATIM_AGENT_SETUP]) {
  for (const accept of [ACCEPT.browser, ACCEPT.webfetch]) {
    const r = await get(path, accept);
    const tag = `${path} [${accept}]`;
    rows.push([path, Object.keys(ACCEPT).find((k) => ACCEPT[k] === accept), r]);
    expect(r.status === 200, `${tag}: status ${r.status}`);
    expect(r.all('content-type').join() === 'text/markdown; charset=utf-8', `${tag}: content-type ${r.all('content-type')}`);
    expect(!varyTokens(r).includes('accept'), `${tag}: a direct .md URL sends Vary: Accept`);
    expect(r.all('cache-control').length === 1 && r.all('cache-control')[0] === TEXT_CC, `${tag}: Cache-Control ${r.all('cache-control')}`);
    expect(linkMembers(r).includes(AI_LINK), `${tag}: Link lacks $ai_link`);
    if (VERBATIM_AGENT_SETUP.includes(path)) {
      expect(r.all('x-content-type-options').join() === 'nosniff', `${tag}: X-Content-Type-Options ${r.all('x-content-type-options')}`);
    }
  }
}

// Text artifacts.
const texts = [
  ['/llms.txt', 'text/plain; charset=utf-8'],
  ['/llms-full.txt', 'text/plain; charset=utf-8'],
  ['/apps/llms.txt', 'text/plain; charset=utf-8'],
  ['/orchestration/llms.txt', 'text/plain; charset=utf-8'],
  ['/robots.txt', 'text/plain; charset=utf-8'],
  ['/sitemap.xml', 'text/xml; charset=utf-8'],
];
for (const [path, type] of texts) {
  for (const accept of [ACCEPT.webfetch, ACCEPT.none]) {
    const r = await get(path, accept);
    const tag = `${path} [${accept ?? '<none>'}]`;
    rows.push([path, accept === null ? 'none' : 'webfetch', r]);
    expect(r.status === 200, `${tag}: status ${r.status}`);
    expect(r.all('content-type').join() === type, `${tag}: content-type ${r.all('content-type')}, expected ${type}`);
    expect(r.all('cache-control').length === 1 && r.all('cache-control')[0] === TEXT_CC, `${tag}: Cache-Control ${r.all('cache-control')}`);
    expect(!varyTokens(r).includes('accept'), `${tag}: sends Vary: Accept`);
    expect(linkMembers(r).includes(AI_LINK), `${tag}: Link lacks $ai_link`);
  }
}

// THE PUBLISHED RULE, APPLIED LITERALLY: "every page has a markdown version at
// its URL + `.md`" (llms.txt, every twin's index note, robots.txt, the
// agent-setup prompt). Every sitemap <loc> — trailing-slash section pages and
// `/` included — with `.md` appended as a string, no normalising: 200,
// text/markdown, and a body that is not HTML. A trailing-slash URL makes that
// `/apps/guide/.md`, which is exactly the case that used to 404.
const locs = [...readFileSync(join(DIST, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
let ruleFailures = 0;
for (const loc of locs) {
  for (const accept of [ACCEPT.browser, ACCEPT.none]) {
    const r = await get(`${loc}.md`, accept);
    const ok =
      r.status === 200 && r.all('content-type').join() === 'text/markdown; charset=utf-8' && !/^\s*</.test(r.body) && r.body.length > 0;
    if (!ok) ruleFailures++;
    expect(ok, `RULE ${loc} + ".md" [Accept: ${accept ?? '<none>'}]: ${r.status} ${r.all('content-type')} ${JSON.stringify(r.body.slice(0, 30))}`);
  }
}
expect(locs.length >= 100, `sitemap.xml yielded only ${locs.length} <loc> (floor 100) — the rule check would be vacuous`);
expect(locs.includes('/') && locs.some((l) => l.length > 1 && l.endsWith('/')), 'sitemap has no `/` or no trailing-slash <loc> — the cases this guards are missing');

// The verbatim agent-setup files are public/ files, not twins: their
// extensionless paths must NOT negotiate into an alias of them, and the 404 must
// not claim to vary or name an alternate. `/agent-setup/` itself still negotiates.
for (const file of VERBATIM_AGENT_SETUP) {
  const bare = file.replace(/\.md$/, '');
  for (const accept of [ACCEPT.webfetch, ACCEPT.browser]) {
    const r = await get(bare, accept);
    rows.push([bare, accept === ACCEPT.webfetch ? 'webfetch' : 'browser', r]);
    expect(r.status === 404, `${bare} [${accept}]: ${r.status} ${r.all('content-type')} — must not alias ${file}`);
    expect(!varyTokens(r).includes('accept'), `${bare} [${accept}]: sends Vary: Accept`);
    expect(!linkMembers(r).includes('rel="alternate"'), `${bare} [${accept}]: advertises an alternate`);
  }
}
if (isFile(join(DIST, 'agent-setup.md'))) {
  await record('/agent-setup/', ACCEPT.webfetch, { twin: '/agent-setup.md', wantMd: true });
  await record('/agent-setup/', ACCEPT.browser, { twin: '/agent-setup.md', wantMd: false });
}

// A renamed page still redirects, whatever the Accept.
{
  const r = await get('/apps/elements', ACCEPT.webfetch);
  expect(r.status === 301 && r.all('location')[0] === '/apps/showcase', `/apps/elements [webfetch]: ${r.status} ${r.all('location')}`);
}

// ── report ───────────────────────────────────────────────────────────────────
if (process.argv.includes('--matrix')) {
  console.log('| URL | Accept | status | content-type | Vary | Cache-Control (n) | Link rels | first bytes |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const [path, accept, r] of rows) {
    const rels = [...linkMembers(r).matchAll(/rel="([^"]+)"/g)].map((m) => m[1]).join(' ');
    const cc = r.all('cache-control');
    console.log(
      `| \`${path}\` | ${accept} | ${r.status} | ${r.all('content-type').join()} | ${r.all('vary').join(', ')} | ` +
        `${cc.join(' / ')} (${cc.length}) | ${rels} | \`${JSON.stringify(r.body.slice(0, 15)).slice(1, -1).replace(/\|/g, '\\|')}\` |`,
    );
  }
}

if (failures.length) {
  console.error(`test-nginx-negotiation: published rule "URL + .md" failed for ${ruleFailures} of ${locs.length * 2} sitemap requests (${locs.length} URLs x 2 Accepts).`);
  console.error(`test-nginx-negotiation: ${failures.length} of ${checks} assertion(s) FAILED:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `test-nginx-negotiation: OK — ${checks} assertions over ${rows.length} recorded responses + ${Q_CASES.length} q-value cases ` +
    `(section=/${sectionIndex}/, leaf=/${leaf}, op=/${opRoute}, home twin=${homeHasTwin}, ` +
    `hubs=${hubs.map((h) => `/${h.hub}`).join(' ') || 'none in this build'}); ` +
    `published rule "URL + .md" held for all ${locs.length} sitemap URLs.`,
);
