// The comparison behind the PAGE PROSE gate in scripts/test-appblocks-cli.mjs:
// which top-level `civitai` commands the HAND-WRITTEN `## Command reference`
// intro on apps/reference/cli.md fails to name (`missing`), and which names it
// carries that are not top-level commands (`stale`).
//
// 🔴 ONE RULE, TWO READERS — AND NEITHER IS ALLOWED TO WRITE THE PROSE.
//   - the gate (test-appblocks-cli.mjs) FAILS on a non-empty answer, so prose
//     rot reds the PR;
//   - the snapshot refresher (refresh-cli-snapshot.mjs) only REPORTS it, in the
//     bot PR's body, so the human who has to write the sentence is told which
//     command is missing before they open a failing log.
// The intro is curated English by design — what a command is FOR is not
// derivable from its help text in a form worth publishing — so the refresher
// must never "fix" it. Both readers share this function so the PR body cannot
// name a different set than the check that fails.
export const CLI_PAGE_REL = 'apps/reference/cli.md';

/**
 * @param {{ page: string, artifact: { program?: { name?: string }, commands: Array<{ command: string }> } }} input
 * @returns {{ ok: true, missing: string[], stale: string[], topLevel: string[] } | { ok: false, reason: string }}
 */
export function introCommandDrift({ page, artifact }) {
  const start = page.indexOf('## Command reference');
  // Match the TAG, not one spelling of it. The intro ends where the generated
  // index begins: the command entries live on sub-pages under
  // apps/reference/cli/, and the hub carries `<ReferenceIndex kind="cli">`.
  const end = page.indexOf('<ReferenceIndex', start);
  if (start === -1 || !(end > start)) {
    return { ok: false, reason: 'could not locate the `## Command reference` intro — did the page restructure?' };
  }
  const intro = page.slice(start, end);

  // Single-word backticked tokens only, so `civitai app` / `civitai completion
  // --help` (multi-word) are prose rather than a claimed command name. The
  // program's own name is excluded: it is the binary, not a command, and no
  // top-level command can be called `civitai` (it would be `civitai civitai`).
  const named = new Set(
    [...intro.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter((t) => /^[a-z][a-z0-9-]*$/.test(t) && t !== (artifact.program?.name ?? 'civitai')),
  );
  const topLevel = artifact.commands.filter((c) => !c.command.includes(' ')).map((c) => c.command);
  // `completion` is named as the one deliberate exclusion, so it belongs in the
  // prose while deliberately NOT being a command entry.
  const expected = new Set([...topLevel, 'completion']);

  return {
    ok: true,
    missing: [...expected].filter((c) => !named.has(c)).sort(),
    stale: [...named].filter((c) => !expected.has(c)).sort(),
    topLevel,
  };
}
