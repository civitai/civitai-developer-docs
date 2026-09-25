#!/usr/bin/env node
/**
 * check-cli-download-example-ids.mjs
 * ----------------------------------
 * Every `civitai download <bare-id>` example these docs publish must use an id
 * whose AMBIGUITY was actually checked against the live API.
 *
 * 🔴 WHY THIS EXISTS — THE DEFECT IT IS A REGRESSION GUARD FOR.
 * `civitai download 128713` does not download anything. It **exits 2**:
 *
 *     $ civitai download 128713 --dry-run          # civitai v0.1.108
 *     Error: 128713 is ambiguous — it's both model "Airi Akizuki …" and
 *     version 128713 (of model "DreamShaper").
 *     …
 *     rc=2
 *
 * 128713 is BOTH a model id and a version id, so the CLI refuses to guess. It
 * was the headline example in all seven of this guide's bare-positional
 * `download` examples — the first command a new reader copy-pastes, failing.
 * civitai/cli fixed the same defect in ITS help text and README under issue
 * #227 and pinned it with `internal/cmd/download_example_id_test.go`. This repo
 * republishes those examples on two hosted pages and mirrored NONE of that
 * guard, so nothing here stopped 128713 coming back.
 *
 * 🔴 ALLOWLIST, NOT A DENYLIST — copied deliberately from the upstream guard.
 * The hazard is the CLASS (a number that resolves as both a model id and a
 * version id), not the one number that bit us. A `!== '128713'` denylist waves
 * through the next id someone picks at random, and ids are picked at random.
 * So an id must be IN `UNAMBIGUOUS_EXAMPLE_IDS` to be publishable, and adding a
 * row there is a claim about the live API that a human has to verify.
 *
 * 🔴 WHAT DOES *NOT* MATCH, AND WHY THAT IS CORRECT.
 * `civitai download --version 128713` and `civitai download --model 4384` name
 * the kind explicitly, so they can never hit the ambiguity stop — which is
 * exactly why the CLI's own help still uses 128713 to demonstrate the escape
 * hatch, and why those two lines must keep passing here. Only the BARE
 * POSITIONAL form is checked.
 *
 * SCOPE — stated because a sweep's scope is half its claim.
 * The WHOLE repository tree is walked, every file extension, not just `.md`:
 * `public/agent-setup/prompt.md` is served verbatim and fetched by unattended
 * coding agents, and an `.md`-scoped sweep on this repo has already missed a
 * surface once. `SKIP_DIRS` carves out build output, dependencies, and
 * `scripts/` — the latter because THIS file and its siblings must be free to
 * name the bad id in a comment or a fixture (check-no-hand-flag-tables.mjs
 * carries `civitai download 128713 …` as detector input on purpose). The
 * carve-out is reported in the output, so it can never be silent.
 *
 * 🔴 GENERATED SURFACES ARE IN SCOPE ON PURPOSE. `appblocks-snapshots/civitai-cli-help.txt`
 * and the `BEGIN GENERATED: cli` region of `apps/reference/cli.md` are captured
 * from the civitai/cli binary, so a failure there cannot be fixed in place —
 * the remedy is upstream. Including them is what makes this a guard on the
 * cross-repo SEAM rather than on one side of it: upstream's Go test covers
 * upstream's help, this covers what we actually published, and a capture that
 * silently reintroduced the bad id would otherwise reach readers unchallenged.
 * The failure message says which remedy applies.
 *
 * POSITIVE CONTROL
 * ----------------
 * A reassuring zero is indistinguishable from a walker wired to nothing, a
 * regex that stopped firing, or a renamed page. So the run FAILS unless it
 * found at least `MIN_TOTAL_EXAMPLES` examples across at least `MIN_FILES`
 * distinct files, and it prints both numbers on success.
 *
 * USAGE
 *   npm run check:cli-download-ids
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

/**
 * Ids publishable as a bare positional. VENDORED from civitai/cli's
 * `unambiguousExampleIDs` (internal/cmd/download.go) — Go cannot be imported
 * from Node, the set is three entries, and it has been stable since #227.
 *
 * The invariant is NOT "must be a version id" — it is "must not be BOTH",
 * because only a number that resolves as a model id *and* a version id trips
 * the refuse-to-guess stop. A model-id-only entry is fine: `download`
 * auto-resolves it to that model's default version and prints a note saying so.
 *
 * 🔴 ADDING A ROW IS A CLAIM ABOUT THE LIVE API. Verify BOTH routes before you
 * add one — /api/v1/models/<id> AND /api/v1/model-versions/<id> — and reject
 * any id where both answer 200.
 *
 * Re-verified against civitai v0.1.108 on 2026-09-25 by RUNNING each one:
 *   civitai download 691639 --dry-run  -> plans flux_dev_639902.safetensors, rc=0
 *   civitai download 290640 --dry-run  -> plans ponyDiffusionV6XL_v6…, rc=0
 *   civitai download 4384   --dry-run  -> plans dreamshaper_8.safetensors, rc=0
 */
export const UNAMBIGUOUS_EXAMPLE_IDS = new Map([
  ['691639', 'version only (200) — FLUX "Dev", model 618692'],
  ['290640', 'version only (200) — Pony Diffusion V6 XL "V6", model 257749'],
  ['4384', 'model only (200); /model-versions/4384 404s — DreamShaper'],
]);

/**
 * The id that shipped in these examples until the corrections. Named
 * explicitly, rather than only being absent from the allowlist, so a reader of
 * a failure knows what the guard is about and gets the specific remedy.
 */
export const KNOWN_AMBIGUOUS_EXAMPLE_ID = '128713';

/**
 * A `civitai download <digits>` example — the id as a BARE POSITIONAL, the only
 * form that can reach the ambiguity stop. Mirrors upstream's
 * `bareDownloadPositionalRe` byte for byte so the two guards cannot drift into
 * covering different things.
 */
export const BARE_DOWNLOAD_POSITIONAL_RE = /civitai download ([0-9]+)/g;

/** Directories the walk never descends into. Reported in the output. */
export const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  // Build output / caches produced by `npm run build`.
  '.vitepress/dist',
  '.vitepress/cache',
  // 🔴 GENERATED, GITIGNORED ARTIFACTS — `.gitignore` carries `public/appblocks/`,
  // and `npm run gen:appblocks` writes cli.json there from the SAME committed
  // snapshot this walk already reads. Leaving it in made the reported count
  // depend on whether anyone had built yet (26 examples/3 files in a fresh
  // checkout, 34/4 after a build), which quietly drains the meaning from the
  // positive control below — and a finding raised against a regenerated file
  // points at a remedy that does not exist. Measured on the merged tree, not
  // predicted.
  'public/appblocks',
  // The checks themselves. They must be free to name the bad id as fixture
  // input — check-no-hand-flag-tables.mjs does exactly that.
  'scripts',
]);

/** Floors. Slack is deliberate: these are a positive control on the WALKER and
 *  the REGEX ("does it still fire?"), never a ratchet on how many examples the
 *  docs owe. Set ON the live counts (26 examples / 3 files as of 2026-09-25)
 *  they would redden on a legitimate example removal and teach the next author
 *  to lower the constant instead of telling them anything true. */
export const MIN_TOTAL_EXAMPLES = 12;
export const MIN_FILES = 2;

/** Files larger than this are not documentation; skipped to keep the walk cheap. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Walk every file under `root`, skipping SKIP_DIRS. Returns repo-relative paths. */
export function walkFiles(root, skip = SKIP_DIRS) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs);
      if (skip.has(entry.name) || skip.has(rel)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(abs);
      else if (entry.isFile()) out.push(rel);
    }
  };
  visit(root);
  return out.sort();
}

/** Read a file as text, or null when it is binary/oversized/unreadable. */
function readText(abs) {
  try {
    if (statSync(abs).size > MAX_FILE_BYTES) return null;
    const buf = readFileSync(abs);
    // A NUL in the head is the cheap binary discriminator; docs never contain one.
    if (buf.subarray(0, 8192).includes(0)) return null;
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Every bare-positional download example in `text`, as {id, line}.
 * Exported so a test can drive it without touching the filesystem.
 */
export function bareDownloadExamples(text) {
  const hits = [];
  for (const m of text.matchAll(BARE_DOWNLOAD_POSITIONAL_RE)) {
    const line = text.slice(0, m.index).split('\n').length;
    hits.push({ id: m[1], line });
  }
  return hits;
}

/** True when a path's content is captured/generated rather than hand-authored. */
export function isGeneratedSurface(rel) {
  return rel.startsWith('appblocks-snapshots/') || rel === 'apps/reference/cli.md';
}

/**
 * DETECTOR CONTROL — run on every invocation, before the tree walk.
 *
 * 🔴 A GUARD NOBODY HAS WATCHED FAIL PROVES NOTHING, and a mutation run in
 * somebody's terminal proves it for that terminal only. Each fixture names the
 * branch it must exercise, so a fixture cannot pass for the wrong reason:
 *   - the known-ambiguous id must be FOUND (it is the #227 defect),
 *   - an id nobody verified must ALSO be found, which is what makes this an
 *     allowlist rather than a `!== 128713` denylist,
 *   - `--version 128713` / `--model 4384` must stay SILENT: naming the kind can
 *     never be ambiguous, and reddening those would break the CLI's own help,
 *   - an id embedded in a longer number must not be half-matched.
 */
const DETECTOR_FIXTURES = [
  { text: 'civitai download 128713', wantIds: ['128713'], wantBad: ['128713'] },
  { text: 'civitai download 999999999', wantIds: ['999999999'], wantBad: ['999999999'] },
  { text: 'civitai download 691639 --layout a1111', wantIds: ['691639'], wantBad: [] },
  { text: 'civitai download --version 128713', wantIds: [], wantBad: [] },
  { text: 'civitai download --model 4384 --out ./x.safetensors', wantIds: [], wantBad: [] },
  { text: 'run `civitai download 4384` and `civitai download 290640`', wantIds: ['4384', '290640'], wantBad: [] },
];

function runDetectorControl() {
  let fired = 0;
  let silent = 0;
  for (const f of DETECTOR_FIXTURES) {
    const ids = bareDownloadExamples(f.text).map((h) => h.id);
    const bad = ids.filter((id) => !UNAMBIGUOUS_EXAMPLE_IDS.has(id));
    if (ids.join(',') !== f.wantIds.join(',') || bad.join(',') !== f.wantBad.join(',')) {
      console.error(`  ✗ detector control: fixture ${JSON.stringify(f.text)}`);
      console.error(`      matched   [${ids}] want [${f.wantIds}]`);
      console.error(`      rejected  [${bad}] want [${f.wantBad}]`);
      process.exit(1);
    }
    if (f.wantBad.length) fired++;
    else silent++;
  }
  console.log(`  ✓ detector control: ${fired + silent} fixture(s) exact — ${fired} that MUST fire did, ${silent} that must not stayed silent`);
}

function main() {
  console.log('`civitai download <id>` examples — every bare positional must be a VERIFIED-unambiguous id\n');

  runDetectorControl();

  // The known-bad id must never be smuggled into the allowlist.
  if (UNAMBIGUOUS_EXAMPLE_IDS.has(KNOWN_AMBIGUOUS_EXAMPLE_ID)) {
    console.error(
      `  ✗ ${KNOWN_AMBIGUOUS_EXAMPLE_ID} is ambiguous (both a model id and a version id) but is listed in UNAMBIGUOUS_EXAMPLE_IDS`,
    );
    process.exit(1);
  }

  const files = walkFiles(repoRoot);
  const findings = [];
  const perFile = new Map();
  let total = 0;

  for (const rel of files) {
    const text = readText(join(repoRoot, rel));
    if (text === null) continue;
    const hits = bareDownloadExamples(text);
    if (!hits.length) continue;
    perFile.set(rel, hits);
    total += hits.length;
    for (const { id, line } of hits) {
      if (!UNAMBIGUOUS_EXAMPLE_IDS.has(id)) findings.push({ rel, line, id });
    }
  }

  console.log(`  · walked ${files.length} file(s); skipped ${[...SKIP_DIRS].join(', ')}`);
  for (const [rel, hits] of perFile) {
    const ids = [...new Set(hits.map((h) => h.id))].join(', ');
    console.log(`  · ${rel} — ${hits.length} example(s): ${ids}`);
  }

  // Positive control. A zero here is indistinguishable from a broken walker.
  if (total < MIN_TOTAL_EXAMPLES || perFile.size < MIN_FILES) {
    console.error(
      `\n  ✗ found ${total} \`civitai download <id>\` example(s) across ${perFile.size} file(s), ` +
        `expected >= ${MIN_TOTAL_EXAMPLES} across >= ${MIN_FILES}.`,
    );
    console.error('    This guard is reading the wrong tree, the regex stopped firing, or the pages moved.');
    console.error('    A serene "no bad ids found" over zero examples proves nothing — so this FAILS.');
    process.exit(1);
  }

  if (!findings.length) {
    console.log(
      `\n  ✓ all ${total} bare-positional example(s) across ${perFile.size} file(s) use a verified-unambiguous id`,
    );
    console.log('\n`civitai download` example ids: all verified unambiguous.');
    return;
  }

  console.error('\n--- AMBIGUOUS `civitai download` EXAMPLE ID ---\n');
  for (const { rel, line, id } of findings) {
    if (id === KNOWN_AMBIGUOUS_EXAMPLE_ID) {
      console.error(`  ✗ ${rel}:${line} — \`civitai download ${id}\``);
      console.error(
        `      ${id} is BOTH a model id and a version id, so this command EXITS 2 with an ambiguity`,
      );
      console.error('      error and downloads nothing. It is the civitai/cli#227 example.');
    } else {
      console.error(`  ✗ ${rel}:${line} — \`civitai download ${id}\``);
      console.error(`      ${id} has not been verified unambiguous. Check that /api/v1/models/${id} and`);
      console.error(`      /api/v1/model-versions/${id} do not BOTH return 200, then add it to`);
      console.error('      UNAMBIGUOUS_EXAMPLE_IDS in scripts/check-cli-download-example-ids.mjs.');
    }
    if (isGeneratedSurface(rel)) {
      console.error('      ^ GENERATED surface — fix it in civitai/cli and re-capture, not here.');
    }
  }
  console.error(`\nUse one of: ${[...UNAMBIGUOUS_EXAMPLE_IDS.keys()].join(', ')}`);
  console.error('…or name the kind explicitly (`--version <id>` / `--model <id>`), which can never be ambiguous.');
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    console.error(`check-cli-download-example-ids: unexpected error: ${err.stack || err.message}`);
    process.exit(2);
  }
}
