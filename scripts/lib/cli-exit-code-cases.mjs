/**
 * cli-exit-code-cases.mjs
 * -----------------------
 * The REGISTRY of `civitai` invocations these docs publish an exit code for.
 *
 * One entry per command transcript that appears on a hosted page inside a
 * ```console block ending in `$ echo $?` and a number. `refresh-cli-exit-codes.mjs`
 * RUNS each of these against a real binary and writes what it observed into
 * `appblocks-snapshots/civitai-cli-exit-codes.txt`; `check-cli-exit-codes.mjs`
 * then compares the published transcripts against that capture.
 *
 * 🔴 EVERY CASE MUST BE OFFLINE-SAFE AND FREE. These run unattended. Each one
 * below is a refusal the CLI raises BEFORE it prices or submits anything —
 * measured, not assumed: the refresh script points `CIVITAI_BASE_URL` at a
 * closed port, so a case that reached the network would fail with a transport
 * error (exit 5) rather than quietly costing money. A case whose observed code
 * is 5 is therefore a case that escaped its own precondition, and the refresh
 * script refuses to record one.
 *
 * NEVER add a case that can submit a generation, spend Buzz, or write to the
 * platform. The point of this registry is that it is a closed, reviewable list
 * rather than "whatever the markdown happened to contain" — a checker that
 * shell-executes arbitrary strings lifted out of prose is a worse problem than
 * the drift it would catch.
 *
 * `files` is written into a scratch directory that the command runs in, so a
 * case can name a fixture (`graph-tip.json`) without one being committed.
 *
 * `command` MUST be byte-identical to the `$ ` line on the page, minus the
 * leading `$ `. That string is the join key.
 */

export const CLI_EXIT_CODE_CASES = [
  {
    id: 'out-name-path-separator',
    command: `civitai generate "a cat" --out-name 'sub/dir{ext}' --dry-run`,
    argv: ['generate', 'a cat', '--out-name', 'sub/dir{ext}', '--dry-run'],
    files: {},
    why: 'an --out-name that escapes --out-dir is a usage error raised before pricing',
  },
  {
    id: 'image-without-ecosystem',
    command: 'civitai generate "a cat" --image ./cat.png --dry-run',
    argv: ['generate', 'a cat', '--image', './cat.png', '--dry-run'],
    files: {},
    why: '--image requires --ecosystem; refused before any upload or pricing',
  },
  {
    id: 'input-non-txt2img',
    command: 'civitai generate --input graph-img2img.json --dry-run',
    argv: ['generate', '--input', 'graph-img2img.json', '--dry-run'],
    files: { 'graph-img2img.json': '{"workflow":"img2img","prompt":"x"}' },
    why: '--input accepts only txt2img graphs',
  },
  {
    id: 'input-envelope-key',
    command: 'civitai generate --input graph-tip.json --dry-run',
    argv: ['generate', '--input', 'graph-tip.json', '--dry-run'],
    files: { 'graph-tip.json': '{"workflow":"txt2img","prompt":"x","civitaiTip":5}' },
    why: 'an envelope key in the graph file is refused, not stripped',
  },
  {
    id: 'input-with-prompt-arg',
    command: 'civitai generate "a cat" --input graph-tip.json --dry-run',
    argv: ['generate', 'a cat', '--input', 'graph-tip.json', '--dry-run'],
    files: { 'graph-tip.json': '{"workflow":"txt2img","prompt":"x","civitaiTip":5}' },
    why: '--input cannot be combined with a prompt argument',
  },
  {
    id: 'validate-missing-path',
    command: 'civitai app validate ./definitely-not-here --json',
    argv: ['app', 'validate', './definitely-not-here', '--json'],
    files: {},
    why: 'a path that does not exist is a mistake about the invocation, and emits no JSON object',
  },
  {
    id: 'input-malformed',
    command: 'civitai generate --input broken.json --dry-run',
    argv: ['generate', '--input', 'broken.json', '--dry-run'],
    files: { 'broken.json': 'not json' },
    why: 'a file that is not a JSON object is a usage error',
  },
];
