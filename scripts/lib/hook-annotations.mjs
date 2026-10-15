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
 */
export const SUPERSEDED_HOOKS = {
  useAppStorage: {
    text:
      'Deprecated: new apps keep per-viewer data in a private collection of the document store. ' +
      'This hook and its routes keep working while apps move; no removal date is set.',
    linkText: 'Storing data',
    href: `${STORAGE_GUIDE}#moving-from-the-legacy-stores`,
  },
  useSharedStorage: {
    text:
      'Deprecated: new apps keep data every viewer reads in a shared collection of the document store, ' +
      'which has authorship, counters and marks built in. This hook and its routes keep working while ' +
      'apps move; no removal date is set.',
    linkText: 'Storing data',
    href: `${STORAGE_GUIDE}#moving-from-the-legacy-stores`,
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

/** Throw when a notice or correction names a hook the published package does not export. */
export function assertAnnotatedHooksExist(hookNames, superseded = SUPERSEDED_HOOKS, corrections = README_CORRECTIONS) {
  const have = new Set(hookNames);
  const missing = [...Object.keys(superseded), ...corrections.map((c) => c.hook)].filter((n) => !have.has(n));
  if (missing.length) {
    throw new Error(
      `hook-annotations: ${[...new Set(missing)].join(', ')} is annotated in scripts/lib/hook-annotations.mjs ` +
        `but is not a hook in the published @civitai/blocks-react — rename or remove the entry`,
    );
  }
}
