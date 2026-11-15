// Two additions to each hook entry in public/appblocks/hooks.json, kept here (pure,
// fixture-testable from scripts/test-appblocks-hooks.mjs) rather than inline in
// gen-appblocks-hooks.mjs:
//
//   1. `returns` — the members of the hook's return INTERFACE, as declared in the
//      published package. The page used to print only the type name
//      (`useSharedStorage(): UseSharedStorage`), so any member the README example
//      did not happen to call — `get`, `update`, `report`, `getCount`, `getCounts` on
//      that hook — appeared nowhere on the site.
//
//   2. `superseded` / `corrections` — a hand-authored notice on a hook the platform
//      is retiring, and corrections to specific stale sentences in the hook's README
//      section. The README is published verbatim by design (`verifyPublished`), so a
//      stale sentence cannot be cut here; a correction is shown beside it instead, and
//      ONLY while the sentence it corrects is still in the published README. When
//      upstream fixes the sentence the correction stops rendering on its own and the
//      generator names it as retired, so it cannot outlive the thing it corrects.
import { Node } from 'ts-morph';

/**
 * The members of `fn`'s return type when that type is an interface, as TypeScript
 * text with JSDoc stripped and whitespace collapsed — one member per line. Inherited
 * members are included (read from the type, not the declaration). `null` for any
 * other return type (aliases, unions, primitives), which keeps the signature alone.
 *
 * @param {import('ts-morph').FunctionDeclaration} fn
 * @returns {{ type: string, text: string } | null}
 */
export function returnInterfaceText(fn) {
  const t = fn.getReturnType();
  const sym = t.getSymbol();
  const decl = sym?.getDeclarations()?.[0];
  if (!decl || !Node.isInterfaceDeclaration(decl)) return null;
  const members = t
    .getProperties()
    .map((p) => p.getDeclarations()[0])
    .filter(Boolean)
    .map((d) => d.getText().replace(/\s+/g, ' ').replace(/;?$/, ';'));
  if (!members.length) return null;
  const name = decl.getName();
  return { type: name, text: `interface ${name} {\n${members.map((m) => `  ${m}`).join('\n')}\n}` };
}

/** Where the notices point. A site path; the .md channel turns it into a `.md` URL. */
const STORAGE_GUIDE = '/apps/guide/storage';

/**
 * Hooks the platform is retiring, with what replaces them. Every key must name a hook
 * in the published package (`assertAnnotatedHooksExist`), so a rename upstream is a red
 * run rather than a notice that silently stops rendering.
 *
 * `removedIn` is the first `@civitai/blocks-react` version that no longer exports the
 * hook. From that pin on, the requirement INVERTS rather than lapses: the hook must be
 * ABSENT (a hook still exported at its `removedIn` is a red run, because the date was
 * wrong), and the entry, with any README_CORRECTIONS entries for the same hook, is
 * reported for deletion. Below that pin it must exist, exactly as before. This is what
 * lets one tree generate green on both sides of the removal, so the pin-bump bot can
 * move the pin across it without a hand edit landing first.
 */
export const SUPERSEDED_HOOKS = {
  useAppStorage: {
    text:
      'Deprecated: new apps keep per-viewer data in a private collection of the document store. ' +
      'This hook is shut down on 2026-11-10; from then on its calls fail with an error.',
    linkText: 'Storing data',
    href: `${STORAGE_GUIDE}#moving-from-the-legacy-stores`,
    // civitai-app-starters#831 (the next minor, per its `changeset status`).
    removedIn: '0.81.0',
  },
  useSharedStorage: {
    text:
      'Deprecated: new apps keep data every viewer reads in a shared collection of the document store, ' +
      'which has authorship, counters and marks built in. This hook is shut down on ' +
      '2026-11-10; from then on its calls fail with an error.',
    linkText: 'Storing data',
    href: `${STORAGE_GUIDE}#moving-from-the-legacy-stores`,
    removedIn: '0.81.0',
  },
};

/**
 * Corrections to stale sentences in a hook's README section. `match` is tested against
 * the section's text with whitespace collapsed (a sentence wraps, and a line-based test
 * would read a wrapped sentence as absent). A correction renders only while it matches.
 */
export const README_CORRECTIONS = [
  {
    hook: 'useSharedStorage',
    // The sentence sits in a blockquote and wraps, so the `>` of the next line is between
    // "civitai.com" and "release" once the section is collapsed.
    match: /goes live with the next civitai\.com[\s>]+release/,
    text:
      'The `append`/`update` budget in the table below is live on civitai.com. The note saying it ' +
      'goes live with the next release predates that release.',
  },
  {
    hook: 'useAppStorage',
    match: /up to ~1\.5x/,
    text:
      'Stored size can be far more than ~1.5x the wire size: the `@civitai/sdk` README records a ' +
      'numeric-heavy value storing at up to 44.4x its wire size. Read `getQuota()` rather than ' +
      'estimating from what you sent.',
  },
];

/** Whitespace-collapsed text of a hook's README section (description + notes). */
export function sectionText(hook) {
  const parts = [hook.description ?? ''];
  for (const n of hook.notes ?? []) parts.push(n.kind === 'code' ? n.code : n.text);
  return parts.join(' ').replace(/\s+/g, ' ');
}

/**
 * The corrections that apply to `hook` right now.
 *
 * @param {{ name: string, description?: string, notes?: Array<{kind: string, text?: string, code?: string}> }} hook
 * @param {typeof README_CORRECTIONS} corrections
 * @returns {string[]}
 */
export function correctionsFor(hook, corrections = README_CORRECTIONS) {
  const text = sectionText(hook);
  return corrections.filter((c) => c.hook === hook.name && c.match.test(text)).map((c) => c.text);
}

/**
 * Corrections that matched nothing in the published README — retired upstream, so the
 * entry can be deleted. Reported, not fatal: the README getting FIXED must never turn
 * a build red.
 */
export function retiredCorrections(hooks, corrections = README_CORRECTIONS) {
  const byName = new Map(hooks.map((h) => [h.name, h]));
  return corrections.filter((c) => {
    const h = byName.get(c.hook);
    return !h || !c.match.test(sectionText(h));
  });
}

/** `a` compared with `b` as `x.y.z` (a prerelease or build suffix is ignored). */
export function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v ?? ''));
    if (!m) throw new Error(`hook-annotations: ${JSON.stringify(v)} is not an x.y.z version`);
    return m.slice(1).map(Number);
  };
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/**
 * The hooks SUPERSEDED_HOOKS declares removed at `version` (`removedIn` <= `version`).
 * The one place that decides it: the generator's guard below and the porting-table
 * guard (scripts/check-porting-hook-coverage.mjs) both read it.
 *
 * @param {string} version
 * @returns {string[]}
 */
export function removedAt(version, superseded = SUPERSEDED_HOOKS) {
  return Object.keys(superseded).filter((n) => {
    const r = superseded[n].removedIn;
    return r != null && compareVersions(version, r) >= 0;
  });
}

/**
 * Throw when a notice or correction names a hook the published package does not
 * export, or when a hook declared removed (`removedIn` <= `version`) is still
 * exported. Returns the hooks whose annotations are retired at `version` — every
 * entry naming them can be deleted — so the caller can say so.
 *
 * @param {string[]} hookNames hooks exported by the pinned package
 * @param {string} version the pinned package version
 * @returns {string[]}
 */
export function assertAnnotatedHooksExist(
  hookNames,
  version,
  superseded = SUPERSEDED_HOOKS,
  corrections = README_CORRECTIONS,
) {
  const have = new Set(hookNames);
  const named = [...new Set([...Object.keys(superseded), ...corrections.map((c) => c.hook)])];
  const gone = new Set(removedAt(version, superseded));
  const removed = (n) => gone.has(n);
  const missing = named.filter((n) => !removed(n) && !have.has(n));
  if (missing.length) {
    throw new Error(
      `hook-annotations: ${missing.join(', ')} is annotated in scripts/lib/hook-annotations.mjs ` +
        `but is not a hook in the published @civitai/blocks-react@${version} — rename or remove the entry, ` +
        `or set its \`removedIn\` if upstream removed it`,
    );
  }
  const stillThere = named.filter((n) => removed(n) && have.has(n));
  if (stillThere.length) {
    throw new Error(
      `hook-annotations: ${stillThere
        .map((n) => `${n} (removedIn ${superseded[n].removedIn})`)
        .join(', ')} is still exported by @civitai/blocks-react@${version} — the \`removedIn\` ` +
        `in scripts/lib/hook-annotations.mjs is wrong`,
    );
  }
  return named.filter(removed);
}
