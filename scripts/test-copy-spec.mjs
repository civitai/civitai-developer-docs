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
 *   7. THE PUBLISHED SPEC IS SCRUBBED ON EVERY RESOLUTION PATH (snapshot,
 *      sibling, refresh) by scripts/lib/spec-scrub.mjs, against a synthetic
 *      fixture with LITERAL expected output — while a refresh still writes the
 *      committed snapshot VERBATIM. A scrub rule that matches nothing WARNS
 *      (exit 0, bytes untouched); check:spec-scrub is what fails on it in CI.
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
  // copy-spec imports the scrub pass; a fixture without it cannot even load.
  // (On a copy-spec.mjs that predates the scrub this file is simply unused.)
  mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });
  if (existsSync(join(here, 'lib', 'spec-scrub.mjs'))) {
    cpSync(join(here, 'lib', 'spec-scrub.mjs'), join(root, 'scripts', 'lib', 'spec-scrub.mjs'));
  }

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

// ── 11. the scrub: applied on EVERY resolution path, literal expectations ─────
// A synthetic spec carrying one instance of every scrub rule's target, plus the
// things the scrub must NOT touch (a shared schema, an upstream-orphaned schema,
// an upstream-unused tag, a kept step type). Expected values below are LITERALS,
// not derived from the rules table — a rule that is deleted, mis-spelled or
// over-broad shows up as a wrong string here.
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const body = (n) => ({ content: { 'application/json': { schema: ref(n) } } });
const RESIDUE = {
  openapi: '3.1.1',
  info: { title: 'fixture', version: 'SCRUB' },
  tags: [{ name: 'Keep' }, { name: 'Internal' }, { name: 'Recipes' }, { name: 'Unused' }],
  paths: {
    '/v2/keep': {
      get: {
        tags: ['Keep'],
        operationId: 'KeepMe',
        // A rewrite rule landing in a SUMMARY, not a description.
        summary: 'Keep. Reads Civitai.Orchestration.Grains.Fx.FixtureInput.Image.',
        parameters: [
          {
            name: 'air',
            in: 'path',
            description:
              'A unique ID. See https://developer.civitai.com/docs/getting-started/ai-resource-identifier for more info on AIRs.',
          },
        ],
        responses: { 200: body('KeepOut'), 400: body('ProblemDetails') },
      },
    },
    '/v2/consumer/civitai/{userId}': {
      delete: { tags: ['Internal'], operationId: 'InvalidateUserCache', responses: { 200: body('OnlyInternal') } },
    },
    '/v2/consumer/civitai/{userId}/tokens': {
      delete: { tags: ['Internal'], operationId: 'InvalidateUserTokens', responses: { default: body('ProblemDetails') } },
    },
    '/v2/consumer/recipes/echo': {
      post: { tags: ['Recipes'], operationId: 'InvokeEchoStepTemplate', requestBody: body('EchoInput'), responses: { 200: body('EchoOutput') } },
    },
    '/v2/consumer/recipes/other': {
      post: { tags: ['Recipes'], operationId: 'InvokeOtherStepTemplate', requestBody: body('OtherStepTemplate'), responses: { 200: body('OtherInput') } },
    },
  },
  components: {
    schemas: {
      KeepOut: {
        type: 'object',
        properties: {
          step: ref('WorkflowStep'),
          lostBlobsRefund: { description: 'Net buzz refunded for deliverable blobs lost in the 2026-06-12 storage incident. Null = not yet checked, 0 = intact.' },
          ephemeral: { description: 'Not persisted to telemetry/STORE; in-flight state lives only in grain state and nothing remains once terminal.' },
          deletedAt: { description: 'Soft delete: the telemetry document is kept until its TTL for operators, but consumer reads treat the workflow as gone.' },
          externalId: { description: 'Idempotency key, stored as `"{userId}-{clientValue}"` so the unique index is single-field yet per-user.\nSee Civitai.Orchestration.Grains.Fx.WorkflowTemplate.ExternalId.' },
          forceRefunded: { description: 'Whether force-refunded.\nPrevents re-charging on grain recovery.' },
          useWorkers: { description: 'Opt-into using the spine controller exclusively' },
          // A different controller name is NOT relabelled: the rule matches one exact sentence.
          useOtherWorkers: { description: 'Opt-into using the widget controller exclusively' },
          comfyImage: { description: 'Image as an AIR\n(e.g. `urn:air:oci:image:example:org/image@v1`). Null = worker default.' },
          labelOverrides: { description: 'Overrides merge with the\ndefaults from the FixtureOptionsGrain for the given mode.' },
          strength: { description: 'Ignored without Civitai.Orchestration.Grains.Fx.FixtureInput.Image.' },
          kind: { description: 'Reports Civitai.Orchestration.Grains.Fx.OtherInput instead.' },
          other: { description: 'See Civitai.Orchestration.Api.Fx.Missing.Thing.' },
          // The older, longer upstream wording of the same four fields.
          lostBlobsRefund2: { description: 'Net buzz refunded because deliverable blobs were lost in the 2026-06-12 storage\nincident (vX wrote blobs to the wrong store). Null = not yet\nchecked, 0 = checked and intact.' },
          ephemeral2: { description: 'When true, this workflow is not persisted to telemetry/STORE.\nIn-flight state lives only in FRAMEWORK grain state (CACHE); once the workflow\nreaches a terminal state the grain clears its state and no record remains.' },
          deletedAt2: { description: 'Soft delete: the telemetry document is kept\n(until its natural TTL) so operators can still inspect it in the dashboard, but\nconsumer reads and queries treat the workflow as gone.' },
          externalId2: { description: 'Key. Stored as `"{userId}-{clientValue}"`\nso the partial unique index can be single-field while still scoping\nuniqueness per-user. See Civitai.Orchestration.Grains.Fx.WorkflowTemplate.ExternalId.' },
        },
      },
      FixtureInput: { allOf: [{ type: 'object', properties: { image: { type: 'string' } } }] },
      ProblemDetails: { type: 'object' },
      OnlyInternal: { type: 'object' },
      Orphan: { type: 'object', description: 'unreferenced upstream; must survive' },
      WorkflowStep: { type: 'object', discriminator: { propertyName: '$type', mapping: { echo: '#/components/schemas/EchoStep', other: '#/components/schemas/OtherStep' } } },
      WorkflowStepTemplate: { type: 'object', discriminator: { propertyName: '$type', mapping: { echo: '#/components/schemas/EchoStepTemplate', other: '#/components/schemas/OtherStepTemplate' } } },
      EchoStep: { allOf: [ref('WorkflowStep'), { properties: { input: ref('EchoInput'), output: ref('EchoOutput'), $type: { enum: ['echo'] } } }] },
      EchoStepTemplate: { allOf: [ref('WorkflowStepTemplate'), { properties: { input: ref('EchoInput'), $type: { enum: ['echo'] } } }] },
      EchoInput: { type: 'object' },
      EchoOutput: { type: 'object' },
      OtherStep: { allOf: [ref('WorkflowStep'), { properties: { input: ref('OtherInput'), $type: { enum: ['other'] } } }] },
      OtherStepTemplate: { allOf: [ref('WorkflowStepTemplate'), { properties: { input: ref('OtherInput'), $type: { enum: ['other'] } } }] },
      OtherInput: { type: 'object' },
    },
  },
};
const RESIDUE_TEXT = JSON.stringify(RESIDUE, null, 2);
const RESIDUE_RE = /Civitai\.Orchestration\.|\bgrain\b|OptionsGrain|telemetry|2026-06-12|wrong store|oci:image:example|getting-started\/ai-resource-identifier/i;
// Positive control: the residue pattern must see every residue kind in the INPUT,
// or "no residue survives" below is a zero that cannot go red.
for (const probe of ['Civitai.Orchestration.X', 'in grain state', 'FixtureOptionsGrain', 'telemetry', '2026-06-12', 'wrong store', 'oci:image:example', 'getting-started/ai-resource-identifier']) {
  ok(RESIDUE_RE.test(probe) && RESIDUE_TEXT.includes(probe.replace(/^in /, '').replace('Civitai.Orchestration.X', 'Civitai.Orchestration.')), `residue pattern sees "${probe}" and the fixture carries it`);
}

/** Literal assertions on a scrubbed fixture landed at `dest`. */
function assertScrubbed(dest, label) {
  const raw = readFileSync(dest, 'utf8');
  const out = JSON.parse(raw);
  const opIds = Object.values(out.paths).flatMap((item) => Object.values(item).map((op) => op.operationId));
  ok(JSON.stringify(opIds.sort()) === JSON.stringify(['InvokeOtherStepTemplate', 'KeepMe']), `${label}: exactly the internal + test-only operations are dropped`, JSON.stringify(opIds));
  ok(
    JSON.stringify(Object.keys(out.paths).sort()) === JSON.stringify(['/v2/consumer/recipes/other', '/v2/keep']),
    `${label}: their now-empty paths are gone`,
    JSON.stringify(Object.keys(out.paths)),
  );
  ok(
    JSON.stringify(Object.keys(out.components.schemas).sort()) ===
      JSON.stringify(['FixtureInput', 'KeepOut', 'Orphan', 'OtherInput', 'OtherStep', 'OtherStepTemplate', 'ProblemDetails', 'WorkflowStep', 'WorkflowStepTemplate']),
    `${label}: dropped-only schemas pruned; shared and upstream-orphaned ones kept`,
    JSON.stringify(Object.keys(out.components.schemas).sort()),
  );
  ok(
    JSON.stringify(out.components.schemas.WorkflowStep.discriminator.mapping) === '{"other":"#/components/schemas/OtherStep"}' &&
      JSON.stringify(out.components.schemas.WorkflowStepTemplate.discriminator.mapping) === '{"other":"#/components/schemas/OtherStepTemplate"}',
    `${label}: the echo step type is gone from both discriminator mappings`,
  );
  ok(JSON.stringify(out.tags.map((t) => t.name)) === '["Keep","Recipes","Unused"]', `${label}: only the tag the drops emptied is removed`, JSON.stringify(out.tags));
  const p = out.components.schemas.KeepOut.properties;
  const want = {
    lostBlobsRefund: 'Net buzz refunded for deliverable blobs lost during a past storage incident. Null = not checked (most workflows), 0 = intact.',
    ephemeral: 'Not retained: nothing remains once the workflow reaches a terminal state.',
    deletedAt: 'Soft delete: consumer reads treat the workflow as gone.',
    externalId: 'Idempotency key, stored as `"{userId}-{clientValue}"`, so it is unique per user.',
    forceRefunded: 'Whether force-refunded.\nPrevents re-charging if the workflow is recovered.',
    useWorkers: 'When set, restricts the job to (true) or away from (false) a dedicated pool of Comfy workers.',
    useOtherWorkers: 'Opt-into using the widget controller exclusively',
    comfyImage: 'Image as an AIR. Null = worker default.',
    labelOverrides: 'Overrides merge with the\ndefaults for the given mode.',
    strength: 'Ignored without `image`.',
    kind: 'Reports `OtherInput` instead.',
    other: 'See Thing.',
    lostBlobsRefund2: 'Net buzz refunded because deliverable blobs were lost during a past storage incident. Null = not checked (most workflows), 0 = checked and intact.',
    ephemeral2: 'When true, this workflow is not retained: nothing remains once it reaches a terminal state.',
    deletedAt2: 'Soft delete: consumer reads and queries treat the workflow as gone.',
    externalId2: 'Key. Stored as `"{userId}-{clientValue}"`, so it is unique per user.',
  };
  for (const [k, v] of Object.entries(want)) {
    ok(p[k].description === v, `${label}: ${k} description rewritten`, `got ${JSON.stringify(p[k].description)}`);
  }
  ok(
    out.paths['/v2/keep'].get.summary === 'Keep. Reads `image`.',
    `${label}: text rules also rewrite an operation summary`,
    `got ${JSON.stringify(out.paths['/v2/keep'].get.summary)}`,
  );
  ok(
    out.paths['/v2/keep'].get.parameters[0].description ===
      'A unique ID. See https://developer.civitai.com/site/guide/air for more info on AIRs.',
    `${label}: the dead AIR link points at the AIR guide`,
  );
  ok(!RESIDUE_RE.test(raw), `${label}: no residue string survives anywhere in the file`, raw.match(RESIDUE_RE)?.[0]);
  ok(/^\{\n {2}"openapi"/.test(raw), `${label}: the source's 2-space formatting is kept`);
}

{
  const fx = makeFixture({ snapshot: RESIDUE_TEXT });
  const r = await run(fx, { poison: true });
  ok(r.rc === 0, 'scrub (snapshot path) exits 0', `rc=${r.rc}\n${r.out}`);
  assertScrubbed(fx.dest, 'snapshot path');
  ok(readFileSync(fx.snapshotPath, 'utf8') === RESIDUE_TEXT, 'snapshot path: the committed snapshot itself is NOT edited');
  ok(/removed 3 operation\(s\), 5 schema\(s\), 1 tag\(s\)/.test(r.out), 'it reports what it removed', r.out);
  fx.cleanup();
}
{
  const fx = makeFixture({ snapshot: SPEC_A, sibling: RESIDUE_TEXT });
  const r = await run(fx, { poison: true });
  ok(r.rc === 0, 'scrub (sibling path) exits 0', `rc=${r.rc}\n${r.out}`);
  assertScrubbed(fx.dest, 'sibling path');
  fx.cleanup();
}
await withServer(
  (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(RESIDUE_TEXT);
  },
  async (url) => {
    const fx = makeFixture({ snapshot: SPEC_A });
    const r = await run(fx, { args: ['--refresh'], env: { CIVITAI_OPENAPI_SPEC_URL: url } });
    ok(r.rc === 0, 'scrub (refresh path) exits 0', `rc=${r.rc}\n${r.out}`);
    assertScrubbed(fx.dest, 'refresh path');
    ok(readFileSync(fx.snapshotPath, 'utf8') === RESIDUE_TEXT, 'refresh path: the re-snapshot is written VERBATIM, unscrubbed');
    fx.cleanup();
  },
);

// ── 12. a rule that matches nothing WARNS; the build still succeeds ──────────
// (Failing on a stale rule is check:spec-scrub's job, against the committed snapshot.)
{
  const fx = makeFixture({ snapshot: SPEC_A });
  const r = await run(fx, { poison: true });
  ok(r.rc === 0, 'stale rules do not break a default build (exit 0)', `rc=${r.rc}\n${r.out}`);
  ok(/WARNING: scrub rule drop-op:InvalidateUserCache matched nothing/.test(r.out), 'a stale rule is WARNED, by id', r.out);
  ok(/scrub rule text:dotnet-type-names matched nothing/.test(r.out), 'every stale rule is named, text rules included', r.out);
  ok(readFileSync(fx.dest, 'utf8') === SPEC_A, 'a spec nothing matched lands byte-for-byte');
  const all = await run(makeFixture({ snapshot: RESIDUE_TEXT }), { poison: true });
  ok(all.rc === 0 && !/matched nothing/.test(all.out), 'no warning when every rule matched', `rc=${all.rc}\n${all.out}`);
  fx.cleanup();
}

console.log(`\n${failures === 0 ? '✓' : '✗'} ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
