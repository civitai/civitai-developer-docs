#!/usr/bin/env node
/**
 * test-copy-spec.mjs
 * ------------------
 * OFFLINE guard for the spec-resolution contract in copy-spec.mjs.
 *
 * It is a REPO-LOCAL invariant with no upstream input — it never touches
 * orchestration.civitai.com, and cannot false-fail on someone else's outage — so
 * per this repo's doctrine it BLOCKS a PR (see appblocks-drift.yml's header for
 * the schedule-vs-gate split). The freshness half lives in check-openapi-drift.mjs
 * and stays on the schedule.
 *
 * WHAT IT PINS, and why each one is not obvious:
 *
 *   1. THE DEFAULT PATH MAKES NO REQUEST. Asserted by POISONING `fetch` in the
 *      child: a poisoned call exits 97, so "it resolved from the snapshot" and
 *      "it did not quietly fetch as well" are two different observations rather
 *      than one. A test that only checked the exit code would pass on a build
 *      that fetches every time and merely happens to succeed.
 *   2. THE SIBLING CHECKOUT STILL WINS. The dev-stack behaviour is the one thing
 *      the hermetic default could plausibly have broken.
 *   3. NO SPEC ANYWHERE FAILS FAST AND LEGIBLY. Bounded elapsed time AND the
 *      three things the message has to carry: the host, that it is not an
 *      outage, and the remedy.
 *   4. A REFRESH THAT CANNOT REACH THE HOST FALLS BACK. An opt-in refresh must
 *      never turn a working build into a broken one — 503, a stall and a dead
 *      port all have to land on the snapshot with a warning and exit 0.
 *   5. THE STALL IS BOUNDED. This is the original defect: an untimed fetch
 *      against a host that accepts and never answers. Asserted on WALL TIME, not
 *      on the message.
 *   6. THE DEFAULT TIMEOUT IS 20 s AND THE RETRY REALLY RETRIES. The timeout is
 *      read from the module (an env-overridden run cannot tell you what the
 *      shipped default is), the retry from a request COUNT at a server that
 *      fails twice and then succeeds.
 *
 * Every case runs the REAL scripts/copy-spec.mjs bytes, copied into a temporary
 * fixture repo so the snapshot/sibling/destination paths it derives from its own
 * location point at fixture files instead of this checkout.
 *
 * USAGE
 *   npm run test:copy-spec
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const realRepoRoot = resolve(here, '..');

const SPEC_A = JSON.stringify({ openapi: '3.1.1', info: { title: 'fixture', version: 'A' }, paths: {} });
const SPEC_B = JSON.stringify({ openapi: '3.1.1', info: { title: 'fixture', version: 'B' }, paths: {} });
const SPEC_SIB = JSON.stringify({ openapi: '3.1.1', info: { title: 'fixture', version: 'SIBLING' }, paths: {} });

let failures = 0;
let checks = 0;

function ok(cond, label, detail = '') {
  checks++;
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

/**
 * Builds a throwaway repo whose layout makes copy-spec.mjs resolve everything
 * inside the temp dir:
 *   <base>/civitai-developer-docs/repo/   <- repoRoot (scripts/ lives here)
 *   <base>/civitai-orchestration/repo/... <- the sibling it looks for
 */
function makeFixture({ snapshot, sibling }) {
  const base = mkdtempSync(join(tmpdir(), 'copy-spec-test-'));
  const root = join(base, 'civitai-developer-docs', 'repo');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(here, 'copy-spec.mjs'), join(root, 'scripts', 'copy-spec.mjs'));
  cpSync(join(here, 'spec-util.mjs'), join(root, 'scripts', 'spec-util.mjs'));

  if (snapshot !== undefined) {
    mkdirSync(join(root, 'openapi-snapshots'), { recursive: true });
    writeFileSync(join(root, 'openapi-snapshots', 'v2-consumers.json'), snapshot);
  }
  if (sibling !== undefined) {
    const p = join(
      base,
      'civitai-orchestration',
      'repo',
      'src',
      'Civitai.Orchestration.Api',
      'wwwroot',
      'openapi',
      'v2-consumers.json',
    );
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, sibling);
  }

  // Poison pill: any call to global fetch is a hard, unmistakable failure.
  writeFileSync(
    join(base, 'poison.cjs'),
    [
      'globalThis.fetch = function () {',
      "  console.error('POISONED_FETCH_CALLED');",
      '  process.exit(97);',
      '};',
    ].join('\n'),
  );

  return {
    base,
    root,
    dest: join(root, 'public', 'openapi', 'v2-consumers.json'),
    snapshotPath: join(root, 'openapi-snapshots', 'v2-consumers.json'),
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

/**
 * Runs the fixture's copy-spec.mjs to completion.
 *
 * 🔴 ASYNC ON PURPOSE — `spawnSync` here is a trap that reads as the simpler
 * choice. The fixture HTTP server lives in THIS process, so a synchronous spawn
 * blocks the very event loop that would answer the child's request: every server
 * case then observes zero hits and times out, and the stall case still passes
 * because a stall is what a blocked server looks like. Measured that way before
 * it was fixed.
 *
 * 🔴 IT ALSO KILLS THE CHILD AT A BOUND, and that is not belt-and-braces. This
 * guard exists because an unbounded wait reached CI; a guard that can ITSELF
 * wait forever reproduces the defect it is checking for. Measured: with the
 * `AbortSignal.timeout` removed from spec-util.mjs — the exact original bug —
 * the suite ran past 300 s and had to be killed from outside, so the mutant
 * registered as "harness broken" rather than "guard fired". With the bound it
 * fails in seconds, naming the case.
 */
function run(fx, { args = [], env = {}, poison = false, killAfterMs = 30000 } = {}) {
  const started = Date.now();
  const child = spawn(process.execPath, [join(fx.root, 'scripts', 'copy-spec.mjs'), ...args], {
    cwd: fx.root,
    env: {
      ...process.env,
      COPY_SPEC_REFRESH: '',
      CIVITAI_OPENAPI_SPEC_URL: '',
      COPY_SPEC_TIMEOUT_MS: '',
      COPY_SPEC_ATTEMPTS: '',
      ...env,
      ...(poison ? { NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${join(fx.base, 'poison.cjs')}` } : {}),
    },
  });

  let out = '';
  child.stdout.on('data', (d) => {
    out += d;
  });
  child.stderr.on('data', (d) => {
    out += d;
  });

  return new Promise((resolveRun) => {
    let killed = false;
    const bomb = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, killAfterMs);
    child.on('close', (code) => {
      clearTimeout(bomb);
      resolveRun({
        rc: killed ? 'KILLED' : code,
        killed,
        out: killed ? `${out}\n[test] child exceeded ${killAfterMs}ms and was killed` : out,
        elapsed: Date.now() - started,
      });
    });
  });
}

/** A local HTTP server. `handler(req, res, hits)` decides each response. */
async function withServer(handler, fn) {
  const state = { hits: 0 };
  const server = createServer((req, res) => {
    state.hits++;
    handler(req, res, state.hits);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/openapi/v2-consumers.json`;
  try {
    return await fn(url, state);
  } finally {
    // Order matters: a stalled request holds its socket open, and `close()`
    // waits for every connection to end — so dropping them has to come FIRST or
    // the await never returns.
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

/** Binds an ephemeral port, releases it, and returns the now-closed number. */
async function closedPort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

console.log('copy-spec resolution contract — offline\n');

// ── 1. default path: snapshot only, fetch poisoned ────────────────────────────
{
  const fx = makeFixture({ snapshot: SPEC_A });
  const r = await run(fx, { poison: true });
  ok(r.rc === 0, 'snapshot-only build exits 0', `rc=${r.rc}\n${r.out}`);
  ok(!r.out.includes('POISONED_FETCH_CALLED'), 'the default path makes NO network request', r.out);
  ok(existsSync(fx.dest) && readFileSync(fx.dest, 'utf8') === SPEC_A, 'the destination carries the snapshot bytes');
  ok(/committed snapshot/.test(r.out), 'it says where the spec came from', r.out);
  fx.cleanup();
}

// ── 2. sibling checkout still wins over the snapshot ──────────────────────────
{
  const fx = makeFixture({ snapshot: SPEC_A, sibling: SPEC_SIB });
  const r = await run(fx, { poison: true });
  ok(r.rc === 0, 'sibling + snapshot exits 0', `rc=${r.rc}\n${r.out}`);
  ok(readFileSync(fx.dest, 'utf8') === SPEC_SIB, 'the SIBLING checkout wins (dev-stack behaviour preserved)');
  fx.cleanup();
}

// ── 3. nothing anywhere: fast and legible ─────────────────────────────────────
{
  const fx = makeFixture({});
  const r = await run(fx, { poison: true });
  ok(r.rc === 1, 'no spec anywhere exits 1', `rc=${r.rc}`);
  ok(r.elapsed < 5000, `it fails FAST (${r.elapsed}ms < 5000ms)`);
  ok(!r.out.includes('POISONED_FETCH_CALLED'), 'it does not fetch on the way to failing');
  ok(/orchestration\.civitai\.com/.test(r.out), 'the message names the upstream host', r.out);
  ok(/not related|unrelated|NOT related/i.test(r.out), 'the message says the failure is not about your change', r.out);
  ok(/--refresh/.test(r.out) && /git checkout/.test(r.out), 'the message states a remedy', r.out);
  ok(/openapi-snapshots/.test(r.out), 'the message names the file it wanted', r.out);
  fx.cleanup();
}

// ── 4. --refresh, healthy server ──────────────────────────────────────────────
await withServer(
  (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(SPEC_B);
  },
  async (url) => {
    const fx = makeFixture({ snapshot: SPEC_A });
    const r = await run(fx, { args: ['--refresh'], env: { CIVITAI_OPENAPI_SPEC_URL: url } });
    ok(r.rc === 0, '--refresh against a healthy host exits 0', `rc=${r.rc}\n${r.out}`);
    ok(readFileSync(fx.dest, 'utf8') === SPEC_B, '--refresh lands the fetched bytes');
    ok(readFileSync(fx.snapshotPath, 'utf8') === SPEC_B, '--refresh REWRITES the committed snapshot');
    ok(/snapshot UPDATED/.test(r.out), '--refresh says the snapshot needs committing', r.out);
    fx.cleanup();
  },
);

// ── 5. --refresh, 503, snapshot present -> falls back ─────────────────────────
await withServer(
  (req, res) => {
    res.writeHead(503);
    res.end('nope');
  },
  async (url, state) => {
    const fx = makeFixture({ snapshot: SPEC_A });
    const r = await run(fx, {
      args: ['--refresh'],
      env: { CIVITAI_OPENAPI_SPEC_URL: url, COPY_SPEC_ATTEMPTS: '2', COPY_SPEC_TIMEOUT_MS: '2000' },
    });
    ok(r.rc === 0, 'a 503 refresh still exits 0 when a snapshot exists', `rc=${r.rc}\n${r.out}`);
    ok(readFileSync(fx.dest, 'utf8') === SPEC_A, 'it falls back to the snapshot bytes');
    ok(readFileSync(fx.snapshotPath, 'utf8') === SPEC_A, 'a failed refresh does NOT clobber the snapshot');
    ok(/WARNING/.test(r.out) && /503/.test(r.out), 'it warns, naming the status', r.out);
    ok(/unrelated to your change/.test(r.out), 'the warning says it is not about your change', r.out);
    ok(state.hits === 2, `a 503 is retried (server saw ${state.hits} requests, want 2)`);
  },
);

// ── 6. --refresh against a STALLED host is bounded ────────────────────────────
await withServer(
  () => {
    /* accept the request, answer never */
  },
  async (url) => {
    const fx = makeFixture({ snapshot: SPEC_A });
    const r = await run(fx, {
      args: ['--refresh'],
      env: { CIVITAI_OPENAPI_SPEC_URL: url, COPY_SPEC_ATTEMPTS: '2', COPY_SPEC_TIMEOUT_MS: '900' },
      // Tighter than the default bound: this is THE case that regresses to an
      // unbounded wait, so it must not sit for 30s before saying so.
      killAfterMs: 15000,
    });
    // 2 attempts × 900ms + one 1000ms backoff ≈ 2.8s; 12s is slack, not a budget.
    ok(r.rc === 0, 'a stalled host still exits 0 when a snapshot exists', `rc=${r.rc}\n${r.out}`);
    ok(r.elapsed < 12000, `a stalled host is BOUNDED (${r.elapsed}ms < 12000ms)`);
    ok(readFileSync(fx.dest, 'utf8') === SPEC_A, 'it falls back to the snapshot bytes');
    ok(/no response within 900ms/.test(r.out), 'it says the host did not answer in time', r.out);
  },
);

// ── 7. --refresh, unreachable host, and nothing on disk ───────────────────────
{
  const fx = makeFixture({});
  // A port that was really listening a moment ago and is now closed, so the
  // connection is REFUSED. Note a hardcoded low port would not do: Node's fetch
  // rejects the forbidden-port list (1, 7, 9, …) with `bad port` before any
  // socket is opened, which looks like a transport failure and is not one.
  const deadPort = await closedPort();
  const r = await run(fx, {
    args: ['--refresh'],
    env: {
      CIVITAI_OPENAPI_SPEC_URL: `http://127.0.0.1:${deadPort}/openapi/v2-consumers.json`,
      COPY_SPEC_ATTEMPTS: '2',
      COPY_SPEC_TIMEOUT_MS: '2000',
    },
  });
  ok(r.rc === 1, 'refresh + no spec at all exits 1', `rc=${r.rc}\n${r.out}`);
  ok(r.elapsed < 15000, `and it does so promptly (${r.elapsed}ms < 15000ms)`);
  ok(/ECONNREFUSED/.test(r.out), 'it reports the transport failure', r.out);
  ok(/FATAL: no OpenAPI spec available/.test(r.out), 'it still prints the actionable FATAL block', r.out);
  fx.cleanup();
}

// ── 8. the SHIPPED defaults, read from the module rather than from a run ──────
{
  const mod = await import(join(here, 'spec-util.mjs'));
  ok(
    mod.FETCH_TIMEOUT_MS === 20000,
    'the default fetch timeout is 20s, matching every other fetch in scripts/',
    `got ${mod.FETCH_TIMEOUT_MS}`,
  );
  ok(mod.FETCH_ATTEMPTS >= 2 && mod.FETCH_ATTEMPTS <= 5, `the retry budget is bounded (${mod.FETCH_ATTEMPTS})`);
  ok(
    mod.SPEC_URL === 'https://orchestration.civitai.com/openapi/v2-consumers.json',
    'the canonical spec URL is unchanged',
    mod.SPEC_URL,
  );
}

// ── 9. the retry recovers, not just gives up ──────────────────────────────────
await withServer(
  (req, res, hits) => {
    if (hits < 3) {
      res.writeHead(500);
      res.end('boom');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(SPEC_B);
  },
  async (url, state) => {
    const fx = makeFixture({ snapshot: SPEC_A });
    const r = await run(fx, {
      args: ['--refresh'],
      env: { CIVITAI_OPENAPI_SPEC_URL: url, COPY_SPEC_ATTEMPTS: '3', COPY_SPEC_TIMEOUT_MS: '3000' },
    });
    ok(r.rc === 0, 'two 500s then a 200 succeeds', `rc=${r.rc}\n${r.out}`);
    ok(state.hits === 3, `the retry ran to the third attempt (server saw ${state.hits})`);
    ok(readFileSync(fx.dest, 'utf8') === SPEC_B, 'the recovered fetch is what lands');
    fx.cleanup();
  },
);

// ── 10. the committed snapshot in THIS repo is real ───────────────────────────
{
  const snap = join(realRepoRoot, 'openapi-snapshots', 'v2-consumers.json');
  ok(existsSync(snap), 'openapi-snapshots/v2-consumers.json is committed');
  if (existsSync(snap)) {
    let parsed = null;
    try {
      parsed = JSON.parse(readFileSync(snap, 'utf8'));
    } catch (err) {
      ok(false, 'the committed snapshot parses as JSON', String(err));
    }
    if (parsed) {
      ok(typeof parsed.openapi === 'string', `it is an OpenAPI document (openapi: ${parsed.openapi})`);
      // A floor, not a pin: the count moves with the API, but zero would mean
      // the file is a stub and every reference page would silently vanish.
      const paths = Object.keys(parsed.paths || {}).length;
      ok(paths >= 10, `it carries a real path set (${paths} paths, floor 10)`);
    }
  }
}

console.log(`\n${failures === 0 ? '✓' : '✗'} ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
