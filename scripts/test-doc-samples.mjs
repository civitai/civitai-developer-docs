#!/usr/bin/env node
// Tests every `<ApiTry>` and `<RecipeRun>` widget in the docs by hitting the
// live APIs.
//
//   CIVITAI_TOKEN=... node scripts/test-doc-samples.mjs           # all samples
//   CIVITAI_TOKEN=... node scripts/test-doc-samples.mjs --site    # only /site
//   CIVITAI_TOKEN=... node scripts/test-doc-samples.mjs --orch    # only /orchestration/recipes
//   CIVITAI_TOKEN=... node scripts/test-doc-samples.mjs --filter pattern
//
// Site samples are plain GETs against civitai.com. Orchestrator samples are
// POSTs against orchestration.civitai.com invoked with `?whatif=true` so no
// Buzz is spent and no jobs are actually submitted.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE_BASE = process.env.CIVITAI_BASE_URL ?? 'https://civitai.com';
const ORCH_BASE = process.env.ORCHESTRATION_BASE_URL ?? 'https://orchestration.civitai.com';
const TOKEN = process.env.CIVITAI_TOKEN ?? '';

const args = process.argv.slice(2);
const only = args.find((a) => a === '--site' || a === '--orch');
const filterIdx = args.indexOf('--filter');
const filter = filterIdx >= 0 ? args[filterIdx + 1] : null;
const verbose = args.includes('--verbose');

// A missing CIVITAI_TOKEN is a graceful-skip, not a hard failure: fork PRs and
// repos without the secret configured can't provide one, and false-failing there
// is guard theater. Public GET samples still run and are real coverage; only
// auth-requiring samples (auth/require-auth ApiTry + all RecipeRun POSTs) are
// skipped. Set the CIVITAI_TOKEN secret to exercise the authed samples too.
if (!TOKEN) {
  console.warn('⚠  CIVITAI_TOKEN not set — running PUBLIC samples only; auth-requiring samples will be skipped.');
  console.warn('   Set the CIVITAI_TOKEN secret (https://civitai.com/user/account) to exercise authed samples.\n');
}

/** Does this sample send an Authorization header (and thus need a token)? */
function sampleNeedsAuth(sample) {
  if (sample.kind === 'RecipeRun') return true; // orchestration POSTs always send a token
  const p = sample.props ?? {};
  return p.auth === 'true' || p.requireAuth === 'true' || p.auth === true || p.requireAuth === true;
}

/* ────────────────────────────────  parsing  ──────────────────────────────── */

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (s.isFile() && name.endsWith('.md')) out.push(full);
  }
  return out;
}

/** Extract the <script setup> block (if any) and evaluate its const bindings. */
function evalScriptSetup(markdown, filePath) {
  const m = markdown.match(/<script setup[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return {};
  // Strip ES imports (recipes occasionally import vue refs etc) — we only need
  // literal data, not runtime wiring.
  let code = m[1].replace(/^\s*import[^;]*;?\s*$/gm, '');
  // Node's vm module treats top-level `const`/`let` as lexical bindings that
  // do NOT attach to the context's global object. Convert to `var` so our
  // extracted sandbox can see them. Safe because recipe scripts are just
  // const-declared data literals with no block scoping that matters here.
  code = code.replace(/\b(const|let)\b/g, 'var');
  const sandbox = {};
  try {
    vm.runInNewContext(code, sandbox, { filename: filePath });
  } catch (e) {
    console.warn(`  ⚠  couldn't eval <script setup> in ${relative(ROOT, filePath)}: ${e.message}`);
    return {};
  }
  return sandbox;
}

/** Parse the attribute chunk of a self-closing Vue tag into { key: rawValue, isBound }. */
function parseAttrs(blob) {
  const attrs = {};
  const re = /(:?[\w-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(blob))) {
    const rawKey = m[1];
    const isBound = rawKey.startsWith(':');
    const key = isBound ? rawKey.slice(1) : rawKey;
    attrs[key] = { value: m[2], isBound };
  }
  // Also catch boolean props (no =) like `require-auth`
  for (const bool of blob.matchAll(/\s([\w-]+)(?=\s|\/>|>)/g)) {
    if (!(bool[1] in attrs) && !bool[1].includes('=')) {
      attrs[bool[1]] = { value: 'true', isBound: false };
    }
  }
  return attrs;
}

function kebabToCamel(k) {
  return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** Evaluate a Vue binding expression (e.g. `{ limit: 5 }` or `defaultBody`) using the script-setup bindings. */
function evalBinding(expr, bindings, filePath) {
  try {
    return vm.runInNewContext(`(${expr})`, { ...bindings }, { filename: filePath });
  } catch (e) {
    throw new Error(`failed to evaluate ${JSON.stringify(expr)}: ${e.message}`);
  }
}

function extractSamples(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const bindings = evalScriptSetup(src, filePath);
  const samples = [];
  const tagRe = /<(ApiTry|RecipeRun)\b([^>]*?)\/?>/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const kind = m[1];
    const attrs = parseAttrs(m[2]);
    const resolved = {};
    for (const [rawKey, info] of Object.entries(attrs)) {
      const key = kebabToCamel(rawKey);
      if (info.isBound) {
        try {
          resolved[key] = evalBinding(info.value, bindings, filePath);
        } catch (e) {
          samples.push({
            kind, file: filePath, source: m[0],
            error: `prop :${rawKey} — ${e.message}`,
          });
          break;
        }
      } else {
        resolved[key] = info.value;
      }
    }
    if (samples.at(-1)?.error) continue;
    // Look at the immediately-preceding non-empty line for a skip marker:
    //   <!-- test-skip: reason here -->
    //   <RecipeRun :body="..." />
    const before = src.slice(0, m.index);
    const prevLine = before.split('\n').reverse().find((l) => l.trim().length) ?? '';
    const skipMatch = /^\s*<!--\s*test-skip\s*:?\s*(.*?)\s*-->\s*$/.exec(prevLine);
    if (skipMatch) resolved.testSkip = skipMatch[1].trim() || 'no reason given';
    samples.push({ kind, file: filePath, source: m[0], props: resolved });
  }
  return samples;
}

/* ──────────────────────────────  execution  ─────────────────────────────── */

function buildUrl(base, path, query) {
  const u = new URL(path, base);
  for (const [k, v] of Object.entries(query ?? {})) {
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function runApiTry(sample) {
  const base = sample.props.base ?? SITE_BASE;
  const url = buildUrl(base, sample.props.path, sample.props.query);
  const headers = { Accept: 'application/json' };
  if (sampleNeedsAuth(sample)) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { headers });
  return {
    ok: res.ok,
    status: res.status,
    url,
    body: res.ok ? null : await res.text(),
  };
}

async function runRecipeRun(sample) {
  const path = sample.props.path ?? '/v2/consumer/workflows';
  const body = sample.props.body;
  if (body === undefined) {
    return { ok: false, status: 0, url: path, body: 'no :body prop' };
  }
  const url = buildUrl(ORCH_BASE, path, { whatif: 'true' });
  const res = await fetch(url, {
    method: sample.props.method ?? 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return {
    ok: res.ok,
    status: res.status,
    url,
    body: res.ok ? null : await res.text(),
  };
}

/* ──────────────────────────────────  main  ───────────────────────────────── */

const sections = [];
if (!only || only === '--site') sections.push({ dir: join(ROOT, 'site'), label: 'site' });
if (!only || only === '--orch') sections.push({ dir: join(ROOT, 'orchestration', 'recipes'), label: 'orchestration' });

const samples = [];
for (const { dir, label } of sections) {
  for (const file of walk(dir)) {
    for (const s of extractSamples(file)) {
      s.section = label;
      samples.push(s);
    }
  }
}

const matched = filter
  ? samples.filter((s) => relative(ROOT, s.file).includes(filter) || s.source.includes(filter))
  : samples;

console.log(`Running ${matched.length} sample(s)${filter ? ` matching "${filter}"` : ''}…\n`);

const failures = [];
const skipped = [];
let idx = 0;
for (const sample of matched) {
  idx++;
  const loc = relative(ROOT, sample.file);
  const short = sample.source.replace(/\s+/g, ' ').trim();
  const label = `[${idx}/${matched.length}] ${loc} ${short}`;
  if (sample.props?.testSkip) {
    console.log(`  ⊘ ${label}`);
    console.log(`      skipped: ${sample.props.testSkip}`);
    skipped.push({ sample, reason: sample.props.testSkip });
    continue;
  }
  if (sample.error) {
    console.log(`  ✗ ${label}`);
    console.log(`      parse error: ${sample.error}`);
    failures.push({ sample, reason: sample.error });
    continue;
  }
  if (!TOKEN && sampleNeedsAuth(sample)) {
    console.log(`  ⊘ ${label}`);
    console.log(`      skipped: needs CIVITAI_TOKEN (auth sample)`);
    skipped.push({ sample, reason: 'needs CIVITAI_TOKEN (auth sample)' });
    continue;
  }
  try {
    const result = sample.kind === 'ApiTry' ? await runApiTry(sample) : await runRecipeRun(sample);
    if (result.ok) {
      console.log(`  ✓ ${label}  ${result.status}`);
      if (verbose) console.log(`      ${result.url}`);
    } else {
      console.log(`  ✗ ${label}  ${result.status}`);
      console.log(`      ${result.url}`);
      if (result.body) {
        const trimmed = result.body.slice(0, 500).replace(/\n/g, '\n      ');
        console.log(`      ${trimmed}`);
      }
      failures.push({ sample, reason: `${result.status} ${result.url}` });
    }
  } catch (e) {
    console.log(`  ✗ ${label}`);
    console.log(`      ${e.message}`);
    failures.push({ sample, reason: e.message });
  }
}

const ran = matched.length - skipped.length;
console.log(`\n${ran - failures.length}/${ran} passed${skipped.length ? `, ${skipped.length} skipped` : ''}`);
if (skipped.length) {
  console.log(`\n${skipped.length} skipped (revisit when unblocked):`);
  for (const s of skipped) {
    console.log(`  - ${relative(ROOT, s.sample.file)}: ${s.reason}`);
  }
}
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of failures) {
    console.log(`  - ${relative(ROOT, f.sample.file)}: ${f.reason}`);
  }
  process.exit(1);
}
