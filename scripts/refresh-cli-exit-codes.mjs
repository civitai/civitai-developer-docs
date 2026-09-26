#!/usr/bin/env node
/**
 * refresh-cli-exit-codes.mjs
 * --------------------------
 * CAPTURE half of the exit-code guard: runs every entry in
 * `scripts/lib/cli-exit-code-cases.mjs` against a real `civitai` binary and
 * writes what it observed to `appblocks-snapshots/civitai-cli-exit-codes.txt`.
 *
 * `check-cli-exit-codes.mjs` reads that artifact; it never runs the binary. The
 * split is the same one `check:cli-snapshot` / `refresh:cli-snapshot` already
 * use in this repo, and for the same reason: the Dockerfile builds in
 * node:20-alpine with no `civitai` on PATH, so a check that needed the binary
 * would silently degrade to checking nothing in the one environment that
 * matters. A committed capture lets CI make a real assertion offline.
 *
 * 🔴 THE CAPTURE IS A CLAIM ABOUT ONE BINARY, AND IT STAMPS WHICH ONE.
 * The header records `civitai --version`. A capture from a different build is
 * a different claim; re-run this after a CLI upgrade.
 *
 * SAFETY
 * ------
 * Every case runs with `CIVITAI_BASE_URL` pointed at a closed port and with
 * `CIVITAI_NO_UPDATE_CHECK=1`, in a throwaway directory. That is not decoration:
 * it converts "this case was supposed to refuse locally" from an assumption
 * into an observation. A case that actually reached the network returns 5, and
 * this script REFUSES to record a 5 — see `NETWORK_ESCAPE_CODE`.
 *
 * USAGE
 *   npm run refresh:cli-exit-codes              # uses `civitai` from PATH
 *   CIVITAI_BIN=/path/to/civitai npm run refresh:cli-exit-codes
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLI_EXIT_CODE_CASES } from './lib/cli-exit-code-cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const ARTIFACT = join(REPO, 'appblocks-snapshots', 'civitai-cli-exit-codes.txt');

/** A case that reached the network failed its own precondition. */
const NETWORK_ESCAPE_CODE = 5;

/** A closed port: connecting to it fails immediately rather than hanging. */
const DEAD_BASE_URL = 'http://127.0.0.1:1';

function bin() {
  return process.env.CIVITAI_BIN || 'civitai';
}

function version(cmd) {
  try {
    return execFileSync(cmd, ['--version'], { encoding: 'utf8' }).trim();
  } catch (err) {
    console.error(`✗ cannot run \`${cmd} --version\`: ${err.message}`);
    console.error('  Install the CLI, or point CIVITAI_BIN at a binary.');
    process.exit(1);
  }
}

function run() {
  const cmd = bin();
  const ver = version(cmd);
  const scratch = mkdtempSync(join(tmpdir(), 'civitai-exitcodes-'));
  const observed = [];
  let failed = 0;

  try {
    for (const c of CLI_EXIT_CODE_CASES) {
      const dir = join(scratch, c.id);
      mkdirSync(dir, { recursive: true });
      for (const [name, body] of Object.entries(c.files || {})) {
        writeFileSync(join(dir, name), body);
      }
      const res = spawnSync(cmd, c.argv, {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          CIVITAI_BASE_URL: DEAD_BASE_URL,
          CIVITAI_NO_UPDATE_CHECK: '1',
          NO_COLOR: '1',
        },
      });
      if (res.error) {
        console.error(`✗ ${c.id}: could not execute — ${res.error.message}`);
        failed += 1;
        continue;
      }
      const code = res.status;
      if (code === NETWORK_ESCAPE_CODE) {
        console.error(
          `✗ ${c.id}: observed exit ${NETWORK_ESCAPE_CODE} against a closed port — ` +
            'this case reached the network, so it is NOT the local refusal it claims ' +
            'to be. Refusing to record it.',
        );
        failed += 1;
        continue;
      }
      observed.push({ ...c, code });
      console.log(`  ${String(code).padStart(2)}  ${c.id}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  if (failed > 0) {
    console.error(`\n✗ ${failed} case(s) could not be captured; artifact NOT written.`);
    process.exit(1);
  }
  if (observed.length === 0) {
    console.error('\n✗ zero cases captured — the registry is empty or unreadable.');
    process.exit(1);
  }

  const lines = [
    'civitai CLI observed exit codes',
    'Captured from: the case registry in scripts/lib/cli-exit-code-cases.mjs,',
    'run against a real binary with CIVITAI_BASE_URL pointed at a closed port.',
    `Binary version: ${ver}`,
    'Regenerate: npm run refresh:cli-exit-codes',
    '',
    'Each block is one published transcript. `command` is the join key: it must',
    'match the `$ ` line on the page byte for byte.',
    '',
  ];
  for (const o of observed) {
    lines.push(`===CASE ${o.id}===`);
    lines.push(`command: ${o.command}`);
    lines.push(`exit: ${o.code}`);
    lines.push(`why: ${o.why}`);
    lines.push('');
  }
  writeFileSync(ARTIFACT, lines.join('\n'));
  console.log(`\n✓ captured ${observed.length} case(s) from ${ver} -> ${ARTIFACT}`);
}

run();
