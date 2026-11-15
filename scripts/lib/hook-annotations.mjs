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
//      upstream fixes the sentence the correction stops rendering on its own, and the
//      generator FAILS until the entry is deleted (`staleAnnotations`), so it cannot
//      outlive the thing it corrects. It used to print a NOTE and carry on; the two
//      entries this list held then sat retired through every build until 2026-11-14,
//      because a NOTE in a green build log is read by nobody.
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
  // Shape: { hook: 'useX', match: /a stale sentence/, text: 'What is true instead.' }
  // The last two entries (useSharedStorage's "goes live with the next civitai.com
  // release", useAppStorage's "up to ~1.5x") were deleted on 2026-11-14 when
  // @civitai/blocks-react@0.80.1's README no longer carried either sentence (the
  // storage one now states the measured 44.4x itself, which is what the correction said).
];

/**
 * Hooks the published package documents with NO example (neither a README `### useX()`
 * section with a ```tsx fence nor an `@example` JSDoc tag), with why. Exact: a hook
 * missing from here with no example fails the generator, and so does a hook listed
 * here that has gained one — so this cannot drift into a list nobody reads either.
 */
export const HOOKS_WITHOUT_EXAMPLE = {
  // Its example sits under the README's `## Direct-load fallback ("Open on Civitai")`,
  // a `##` section outside the hook list, so no `### useDirectLoad()` section exists to
  // attach it from, and its JSDoc has no @example (blocks-react@0.80.1).
  useDirectLoad: 'documented under the README `## Direct-load fallback` section, outside the hook list',
};

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
 * entry must be deleted. `staleAnnotations` turns each into a generator failure.
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

/**
 * Every annotation that no longer describes the published package, as a list of
 * messages (empty = all current). The generator throws on a non-empty list:
 *   - a README correction whose sentence is gone (retired upstream: delete it);
 *   - a hook with no example that is not in HOOKS_WITHOUT_EXAMPLE (new gap: add an
 *     example upstream, or list it here with why);
 *   - a HOOKS_WITHOUT_EXAMPLE entry whose hook now has an example, or no longer exists.
 *
 * `removed` is what `assertAnnotatedHooksExist` returned: hooks declared `removedIn` at
 * this pin and proven absent. An entry naming one of them is NOT reported here, because
 * the generator reports the whole hook's entries as deletable instead; this is the one
 * exemption, and it covers only hooks whose `removedIn` the pin has reached.
 *
 * @param {Array<{ name: string, example?: string, description?: string, notes?: Array<object> }>} hooks
 * @param {string[]} [removed]
 */
export function staleAnnotations(
  hooks,
  corrections = README_CORRECTIONS,
  withoutExample = HOOKS_WITHOUT_EXAMPLE,
  removed = [],
) {
  const problems = [];
  const gone = new Set(removed);
  for (const c of retiredCorrections(hooks, corrections).filter((c) => !gone.has(c.hook))) {
    problems.push(`README_CORRECTIONS { hook: '${c.hook}', match: ${c.match} } no longer matches the published README — upstream fixed the sentence; delete the entry`);
  }
  const byName = new Map(hooks.map((h) => [h.name, h]));
  for (const h of hooks) {
    if (!h.example && !(h.name in withoutExample)) {
      problems.push(`${h.name} has no example (no README \`### ${h.name}()\` fence, no @example) — add one upstream, or list it in HOOKS_WITHOUT_EXAMPLE with why`);
    }
  }
  for (const name of Object.keys(withoutExample)) {
    if (gone.has(name)) continue;
    const h = byName.get(name);
    if (!h) problems.push(`HOOKS_WITHOUT_EXAMPLE names ${name}, which the published package does not export — delete the entry`);
    else if (h.example) problems.push(`HOOKS_WITHOUT_EXAMPLE names ${name}, which now has an example — delete the entry`);
  }
  return problems;
}
