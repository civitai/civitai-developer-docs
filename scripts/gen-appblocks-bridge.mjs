// Generate public/appblocks/bridge.json — the generation-BRIDGE type reference.
//
// WHY THIS EXISTS: the hooks generator (gen-appblocks-hooks.mjs) surfaces hook
// *signatures* + README prose, and the messages generator surfaces the
// postMessage protocol — but neither renders the FIELD-LEVEL contract of the
// generation bridge. The rich contract a builder actually needs to submit a
// non-trivial generation — the `WorkflowBody` discriminated union
// (`textToImage`/`customComfy`/`step`), `sourceImage`/`sourceImages` img2img and
// their PAGE-ONLY constraint, `additionalResources` (LoRA) bounds, the
// `BlockWorkflowSnapshot` result shape (`imageUrls` flattened from
// `output.images`), the per-app `AppWorkflow` subqueue projection, the
// `useBuzzWorkflow().cancel` member the hooks reference drops, and the
// `submit`/`watch` option bags (incl. the `idempotencyKey` that keeps a retried
// submit from being billed twice) — lives ONLY in the `@civitai/app-sdk/blocks` +
// `@civitai/blocks-react` type JSDoc. This generator parses that JSDoc and emits
// a structured reference the <BridgeReference /> component renders.
//
// Sources (published, pinned devDeps):
//   - @civitai/app-sdk        dist/blocks/types.d.ts  — the WorkflowBody union +
//     member field tables + BlockWorkflowSnapshot/AppWorkflow result shapes.
//   - @civitai/blocks-react   dist/hooks/useBuzzWorkflow.d.ts — the estimate →
//     submit → poll → CANCEL lifecycle, from the UseBuzzWorkflowReturn interface
//     (so `cancel` is surfaced STRUCTURALLY from the type, not lifted from README
//     prose the hooks generator misses).
//
// The output feeds a hard COVERAGE guard (assertBridgeCoverage) that fails the
// build loud if the generation contract ever silently loses a field — the same
// fail-loud discipline as gen-appblocks-messages.mjs.
import { Project, ScriptTarget, ModuleKind, ModuleResolutionKind } from 'ts-morph';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { log, resolvePackageRoot, writeArtifact } from './appblocks-util.mjs';

// ── the generation-path types to surface, in doc order ────────────────────────
// Each entry names a declaration in @civitai/app-sdk/dist/blocks/types.d.ts.
const SDK_TYPES = [
  'WorkflowBody',
  'WorkflowBodyTextToImage',
  'BlockTextToImageParams',
  'BlockSourceImage',
  'WorkflowBodyCustomComfy',
  'WorkflowBodyStep',
  'BlockWorkflowSnapshot',
  'AppWorkflow',
  'AppWorkflowImage',
];

// ── the blocks-react option bags the lifecycle signature NAMES ────────────────
// Each entry names a declaration in
// @civitai/blocks-react/dist/hooks/useBuzzWorkflow.d.ts. These are the `options?`
// arguments of `submit`/`watch`: the lifecycle table renders their TYPE NAME, so
// without a table of their own the page names a type it never defines — the same
// "announced with no field table" gap that left WorkflowBodyStep undocumented.
// `SubmitWorkflowOptions.idempotencyKey` is the money-relevant one: reusing a
// stable key on a retried submit is what collapses a lost-response retry to ONE
// Buzz charge.
const REACT_TYPES = ['SubmitWorkflowOptions', 'WatchWorkflowOptions'];

/** Last JSDoc block's description text for any declaration node, or ''. */
function jsdocOf(node) {
  const docs = typeof node.getJsDocs === 'function' ? node.getJsDocs() : [];
  if (!docs.length) return '';
  return (docs[docs.length - 1].getDescription() || '').trim();
}

/** Collect {name,type,optional,description} from a list of PropertySignatures. */
function collectProps(props) {
  return props.map((p) => {
    const typeNode = typeof p.getTypeNode === 'function' ? p.getTypeNode() : null;
    return {
      name: p.getName(),
      type: typeNode ? typeNode.getText().replace(/\s+/g, ' ').trim() : 'unknown',
      optional: typeof p.hasQuestionToken === 'function' ? p.hasQuestionToken() : false,
      description: jsdocOf(p),
    };
  });
}

/** Describe one named SDK type (interface, object type-alias, or union alias). */
function describeType(sf, name) {
  const iface = sf.getInterface(name);
  if (iface) {
    return {
      name,
      kind: 'object',
      description: jsdocOf(iface),
      fields: collectProps(iface.getProperties()),
    };
  }
  const alias = sf.getTypeAlias(name);
  if (!alias) throw new Error(`gen-appblocks-bridge: type ${name} not found in ${sf.getFilePath()}`);
  const node = alias.getTypeNodeOrThrow();
  const kindName = node.getKindName();
  if (kindName === 'UnionType') {
    return {
      name,
      kind: 'union',
      description: jsdocOf(alias),
      members: node.getTypeNodes().map((n) => n.getText().trim()),
    };
  }
  // Object type-literal alias (e.g. WorkflowBodyTextToImage = { ... }).
  if (typeof node.getProperties === 'function') {
    return {
      name,
      kind: 'object',
      description: jsdocOf(alias),
      fields: collectProps(node.getProperties()),
    };
  }
  // Fallback: render the alias text verbatim.
  return { name, kind: 'alias', description: jsdocOf(alias), text: node.getText().trim() };
}

function newProject() {
  return new Project({
    compilerOptions: {
      target: ScriptTarget.ES2020,
      module: ModuleKind.NodeNext,
      moduleResolution: ModuleResolutionKind.NodeNext,
      allowJs: true,
      declaration: true,
      skipLibCheck: true,
      noEmit: true,
    },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
}

/** Build the full bridge artifact from the pinned, installed SDK declarations. */
export function buildBridge() {
  const sdkRoot = resolvePackageRoot('@civitai/app-sdk');
  const reactRoot = resolvePackageRoot('@civitai/blocks-react');
  const sdkVersion = JSON.parse(readFileSync(join(sdkRoot, 'package.json'), 'utf8')).version;
  const reactVersion = JSON.parse(readFileSync(join(reactRoot, 'package.json'), 'utf8')).version;

  const typesDts = join(sdkRoot, 'dist', 'blocks', 'types.d.ts');
  const hookDts = join(reactRoot, 'dist', 'hooks', 'useBuzzWorkflow.d.ts');

  // ── SDK generation types ────────────────────────────────────────────────────
  const typesProject = newProject();
  const typesSf = typesProject.addSourceFileAtPath(typesDts);
  const types = SDK_TYPES.map((name) => describeType(typesSf, name));

  // ── useBuzzWorkflow lifecycle (incl. cancel, from the return interface) ──────
  const hookProject = newProject();
  const hookSf = hookProject.addSourceFileAtPath(hookDts);
  const fn = hookSf.getFunction('useBuzzWorkflow');
  if (!fn) throw new Error('gen-appblocks-bridge: useBuzzWorkflow not found in blocks-react');
  const retNode = fn.getReturnTypeNode();
  const retName = retNode ? retNode.getText() : 'unknown';
  const retIface = hookSf.getInterface(retName);
  if (!retIface) {
    throw new Error(
      `gen-appblocks-bridge: could not resolve useBuzzWorkflow return interface "${retName}" — ` +
        'the lifecycle (incl. cancel) cannot be surfaced. The blocks-react .d.ts layout changed.'
    );
  }
  const lifecycle = {
    name: 'useBuzzWorkflow',
    signature: `useBuzzWorkflow(): ${retName}`,
    description: jsdocOf(fn),
    members: collectProps(retIface.getProperties()),
  };

  // The `options?` bags those lifecycle members name in their signatures.
  types.push(...REACT_TYPES.map((name) => describeType(hookSf, name)));

  return {
    generatedAt: new Date().toISOString(),
    sdkPackage: `@civitai/app-sdk@${sdkVersion}`,
    reactPackage: `@civitai/blocks-react@${reactVersion}`,
    sources: [typesDts, hookDts],
    lifecycle,
    types,
  };
}

/**
 * COVERAGE GUARD (fail-loud, do not remove). The whole point of this generator
 * is to surface the generation-path fields the hooks/messages references miss.
 * If a parser regression, a ts-morph API change, or an upstream SDK rename
 * silently drops one, the emitted bridge.json would be plausible but WRONG (the
 * exact failure mode gen-appblocks-messages guards against). These assertions
 * make any such drift a hard build error. Exported so the regression test
 * exercises the SAME relation the generator hard-fails on.
 *
 * @returns {string[]} the list of coverage violations (empty == healthy).
 */
export function bridgeCoverageViolations(artifact) {
  const problems = [];
  const memberNames = (artifact.lifecycle?.members ?? []).map((m) => m.name);
  for (const req of ['estimate', 'submit', 'poll', 'cancel', 'status', 'result', 'error']) {
    if (!memberNames.includes(req)) {
      problems.push(`useBuzzWorkflow lifecycle is missing the "${req}" member`);
    }
  }

  const byName = Object.fromEntries((artifact.types ?? []).map((t) => [t.name, t]));

  const union = byName.WorkflowBody;
  if (!union || union.kind !== 'union' || !(union.members ?? []).some((m) => /textToImage/i.test(m) || /WorkflowBodyTextToImage/.test(m))) {
    problems.push('WorkflowBody discriminated union (textToImage member) not surfaced');
  } else {
    // EVERY union member must get a field table of its own. Without this the page
    // can truthfully say "the N members are the whole surface" while publishing
    // tables for N-1 of them — exactly how WorkflowBodyStep shipped announced but
    // undocumented when the SDK grew a third member.
    for (const mem of union.members ?? []) {
      const memberName = mem.trim();
      if (!/^WorkflowBody[A-Za-z0-9]+$/.test(memberName)) continue; // inline literal member — nothing to link to
      if (!byName[memberName]) {
        problems.push(`WorkflowBody union member "${memberName}" has no field table (add it to SDK_TYPES)`);
      }
    }
  }

  const t2i = byName.WorkflowBodyTextToImage;
  const fieldOf = (t, n) => (t?.fields ?? []).find((f) => f.name === n);
  if (!t2i) {
    problems.push('WorkflowBodyTextToImage type not surfaced');
  } else {
    const sourceImage = fieldOf(t2i, 'sourceImage');
    if (!sourceImage) {
      problems.push('WorkflowBodyTextToImage.sourceImage (img2img) field not surfaced');
    } else if (!/PAGE|page-bound|page app|model-bound/i.test(sourceImage.description)) {
      // The PAGE-ONLY constraint is the load-bearing, undocumented-elsewhere fact.
      problems.push('WorkflowBodyTextToImage.sourceImage lost its PAGE-ONLY constraint JSDoc');
    }
    // The CURRENT multi-image field. It must stay surfaced: the hand-written prose
    // on the same page states what img2img can and cannot express, and a reference
    // that silently drops `sourceImages` is how that prose went stale in the first
    // place (it claimed multi-image editing was "not expressible" for a whole
    // release after the SDK shipped it).
    if (!fieldOf(t2i, 'sourceImages')) {
      problems.push('WorkflowBodyTextToImage.sourceImages (multi-image conditioning) field not surfaced');
    }
    if (!fieldOf(t2i, 'additionalResources')) {
      problems.push('WorkflowBodyTextToImage.additionalResources (LoRA) field not surfaced');
    }
  }

  // submit()'s options bag. `idempotencyKey` is the only documented defence
  // against a retried submit being billed TWICE, so losing it is a money bug, not
  // a cosmetic one.
  const submitOpts = byName.SubmitWorkflowOptions;
  if (!submitOpts) {
    problems.push('SubmitWorkflowOptions (submit() options bag) not surfaced');
  } else if (!fieldOf(submitOpts, 'idempotencyKey')) {
    problems.push('SubmitWorkflowOptions.idempotencyKey (double-charge defence) field not surfaced');
  }

  const snap = byName.BlockWorkflowSnapshot;
  if (!snap) {
    problems.push('BlockWorkflowSnapshot (result shape) not surfaced');
  } else if (!fieldOf(snap, 'imageUrls')) {
    problems.push('BlockWorkflowSnapshot.imageUrls (output.images result) field not surfaced');
  }

  return problems;
}

/** Throwing wrapper for the generator's build-time gate. */
export function assertBridgeCoverage(artifact) {
  const problems = bridgeCoverageViolations(artifact);
  if (problems.length) {
    throw new Error(
      `gen-appblocks-bridge: the generation-bridge reference lost required coverage — the SDK type JSDoc ` +
        `changed or the parser regressed. Fix the generator (or re-check the pinned SDK). Violations:\n  - ` +
        problems.join('\n  - ')
    );
  }
}

function main() {
  const artifact = buildBridge();
  assertBridgeCoverage(artifact);
  const dest = writeArtifact('bridge.json', artifact);
  log(
    `bridge: wrote ${artifact.types.length} types + useBuzzWorkflow lifecycle ` +
      `(${artifact.lifecycle.members.length} members incl. cancel) -> ${dest}`
  );
  log(`  from ${artifact.sdkPackage} + ${artifact.reactPackage}`);
}

// Run only when invoked directly (not when imported for the exported helpers).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
