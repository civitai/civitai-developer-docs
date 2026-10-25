// How the three largest App Blocks reference pages are split into sub-pages.
//
// WHY THE SPLIT EXISTS
// --------------------
// Each reference page is served a second time as `<page>.md` for agents. Agent
// fetch tools do not read an arbitrarily long document: Claude Code's WebFetch
// truncated `apps/reference/hooks.md` at character 99,961 (measured 2026-10-14),
// and the three generated pages were 166 KB (hooks), 157 KB (CLI) and 127 KB
// (generation bridge). Everything past the cut was invisible to the reader the
// `.md` channel exists for.
//
// So each of those pages is now a HUB (its URL, its hand-written prose, and an
// index naming every entry) plus generated SUB-PAGES under
// `/apps/reference/<hub>/<group>`, each well under the size budget enforced by
// `npm run check:md-regions`.
//
// ONE RULE, ONE PLACE
// -------------------
// This module is the ONLY place that decides which entry lives on which
// sub-page. It is imported by:
//   - scripts/appblocks-md.mjs   — the `.md` channel (regions + sub-page files)
//   - the Vue islands            — `<HooksReference group>`, `<CliReference group>`,
//                                  `<BridgeReference group>`, `<ReferenceIndex>`
//   - .vitepress/config.mts      — the sidebar entries
// so the HTML, the `.md` twins, the hub index and the sidebar cannot disagree
// about where an entry is. It is plain ESM (typed by the sibling `.d.mts`) so
// bare-`node` scripts can import it.
//
// HOW A NEW ENTRY FINDS ITS PAGE (no hand step required)
// ------------------------------------------------------
// - CLI commands are placed STRUCTURALLY: a command inherits the group of its
//   longest listed command-path prefix (`app listing set-icon` -> `app listing`
//   -> `listing`). A new subcommand of a listed command therefore lands beside
//   its parent; a brand-new TOP-LEVEL command lands on the declared fallback
//   group.
// - Hooks and bridge types carry no grouping in their source, so each group
//   lists its members by name. An entry NOT listed inherits the group of the
//   entry before it in artifact order — which is upstream's own order (the
//   blocks-react README for hooks, the SDK walk for bridge types), where a new
//   hook is written next to its relatives. It is never dropped and never
//   produces an empty page; `splitByGroup` reports it as `inherited` so the
//   generator can name it.
// Either way, the size budget is the backstop: a group that outgrows it fails
// `check:md-regions` and must be split here.

/** The size budget, in characters, for every page that carries a generated region. */
export const MD_PAGE_BUDGET = 80_000;

/**
 * @typedef {{ slug: string, title: string, description: string, members?: string[], prefixes?: string[], fallback?: boolean }} RefGroup
 * @typedef {{ kind: 'hooks'|'cli'|'bridge', hub: string, hubTitle: string, component: string, itemNoun: string, groups: RefGroup[] }} RefSplit
 */

/** @type {RefSplit} */
const HOOKS = {
  kind: 'hooks',
  hub: '/apps/reference/hooks',
  hubTitle: 'Hooks reference',
  component: 'HooksReference',
  itemNoun: 'hook',
  groups: [
    {
      slug: 'context',
      title: 'Context, frame and analytics hooks',
      description:
        'The host handshake, theme, sizing, the block token and settings, direct-load and nested documents, and analytics.',
      members: [
        'useBlockContext',
        'useBlockTheme',
        'useBlockResize',
        'useBlockBreakpoint',
        'useBlockToken',
        'useHostOrigin',
        'useBlockSettings',
        'useBlockAnalytics',
        'useDirectLoad',
        'useNestedDocument',
      ],
    },
    {
      slug: 'generation',
      title: 'Generation hooks',
      description: '`useBuzzWorkflow` and the hooks that list, publish and resource a generation.',
      members: ['useBuzzWorkflow', 'useAppWorkflows', 'useGenerationResources', 'usePublishGenerationOutputs'],
    },
    {
      slug: 'batches-and-training',
      title: 'Batch, confirmed-step and training hooks',
      description:
        'Estimating and running batches, running one job above the per-call budget, and LoRA training.',
      members: ['useBatchEstimate', 'useWorkflowBatch', 'useRunConfirmedStep', 'useRunTraining'],
    },
    {
      slug: 'buzz-and-purchases',
      title: 'Buzz, purchase and tip hooks',
      description: 'Buzz balance and transactions, Buzz and goods purchases, entitlements, compensation and tips.',
      members: [
        'useBuzzPurchase',
        'useGoodPurchase',
        'useEntitlements',
        'useBuzzBalance',
        'useBuzzTransactions',
        'useBuzzAccounts',
        'useDailyCompensation',
        'useTip',
        'useTipAllowance',
      ],
    },
    {
      slug: 'viewer-and-navigation',
      title: 'Viewer, consent and navigation hooks',
      description:
        'The viewer, sign-in and consent prompts, maturity and gated images, following collections, reacting to images, and navigating the host.',
      members: [
        'useViewer',
        'useRequestSignIn',
        'useRequestConsent',
        'useConsentUnavailable',
        'useDomainMaturity',
        'useGatedImages',
        'useCollectionFollow',
        'useReactions',
        'useCivitaiNavigate',
        'useCivitaiRoute',
      ],
    },
    {
      slug: 'storage-and-media',
      title: 'Storage, picker and media hooks',
      description:
        'Per-app and shared storage, wildcard packs, checkpoint, resource and image pickers, uploading images and other media, saving images, and creating posts.',
      members: [
        'useAppStorage',
        'useSharedStorage',
        'useWildcardPack',
        'useCheckpointPicker',
        'useResourcePicker',
        'useImageUpload',
        'useUploadImageBytes',
        'useMediaUpload',
        'useImagePicker',
        'useSaveImage',
        'useCreatePostFromApp',
      ],
    },
  ],
};

/** @type {RefSplit} */
const CLI = {
  kind: 'cli',
  hub: '/apps/reference/cli',
  hubTitle: 'CLI reference',
  component: 'CliReference',
  itemNoun: 'command',
  groups: [
    {
      slug: 'app',
      title: 'civitai app — authoring commands',
      description: 'Scaffold, validate, submit and operate an App: every `civitai app` command except the listing group.',
      prefixes: ['app'],
    },
    {
      slug: 'app-listing',
      title: 'civitai app listing — store listing commands',
      description: "Edit an App's store listing: icon, cover, screenshots, text, source repo and revisions.",
      prefixes: ['app listing'],
    },
    {
      slug: 'catalog',
      title: 'Catalog and download commands',
      description: 'Browse and search the public catalog, and download model files.',
      prefixes: ['articles', 'collections', 'creators', 'images', 'model-versions', 'models', 'tags', 'users', 'download'],
    },
    {
      slug: 'generation',
      title: 'Generation commands',
      description: 'Run generations and manage workflows. These spend Buzz.',
      prefixes: ['generate', 'workflows'],
    },
    {
      slug: 'account-and-setup',
      title: 'Account, setup and utility commands',
      description: 'Sign in, inspect your account and Buzz, configure your coding agent, and update the CLI.',
      prefixes: ['login', 'whoami', 'buzz', 'agent-setup', 'upgrade', 'version'],
      fallback: true,
    },
  ],
};

/** @type {RefSplit} */
const BRIDGE = {
  kind: 'bridge',
  hub: '/apps/reference/generation',
  hubTitle: 'Generation bridge reference',
  component: 'BridgeReference',
  itemNoun: 'type',
  groups: [
    {
      slug: 'lifecycle',
      title: 'useBuzzWorkflow lifecycle and snapshot types',
      description:
        'The `useBuzzWorkflow()` lifecycle, the submit and watch options, and the workflow snapshots and app-workflow records it returns.',
      members: [
        // The lifecycle entry is not a type; it is keyed by its hook name.
        'useBuzzWorkflow',
        'SubmitWorkflowOptions',
        'WatchWorkflowOptions',
        'BlockWorkflowSnapshot',
        'BlockWorkflowStepSnapshot',
        'AppWorkflow',
        'AppWorkflowImage',
      ],
    },
    {
      slug: 'bodies',
      title: 'Workflow body types',
      description:
        'The `WorkflowBody` union and its text-to-image, ComfyUI and orchestrator-step members, with their parameter types.',
      members: [
        'WorkflowBody',
        'WorkflowBodyTextToImage',
        'BlockTextToImageParams',
        'BlockSourceImage',
        'WorkflowBodyCustomComfy',
        'WorkflowBodyCustomComfyRecipe',
        'WorkflowBodyCustomComfyInline',
        'WorkflowBodyStep',
        'WorkflowBodyPassThroughStep',
      ],
    },
    {
      slug: 'training-and-multi-step',
      title: 'Training and multi-step workflow types',
      description: 'The `training` body and its ai-toolkit parameter types, and the multi-step `workflow` body.',
      members: [
        'WorkflowBodyTraining',
        'BlockTrainedEpoch',
        'AiToolkitTrainingParams',
        'AiToolkitTrainingParamsBase',
        'AiToolkitPlainEcosystem',
        'AiToolkitLrScheduler',
        'AiToolkitOptimizerType',
        'BlockTrainingQuote',
        'WorkflowBodyWorkflow',
        'WorkflowBodyWorkflowStep',
        'WorkflowStepRef',
      ],
    },
  ],
};

/**
 * The bridge artifact's placeable items, in artifact order: the
 * `useBuzzWorkflow` lifecycle entry (keyed by its hook name) first, then every
 * type — the order `<BridgeReference>` has always rendered them in.
 */
export function bridgeItems(data) {
  const lifecycle = data?.lifecycle ? [{ ...data.lifecycle, isLifecycle: true }] : [];
  return [...lifecycle, ...(data?.types ?? [])];
}

/** Every split reference, keyed by kind. */
export const REFERENCE_SPLITS = { hooks: HOOKS, cli: CLI, bridge: BRIDGE };

/** @param {'hooks'|'cli'|'bridge'} kind */
export function referenceSplit(kind) {
  const s = REFERENCE_SPLITS[kind];
  if (!s) throw new Error(`referenceSplit: unknown kind ${JSON.stringify(kind)}`);
  return s;
}

/** Site route of a sub-page, e.g. `/apps/reference/hooks/storage`. */
export const subPageRoute = (kind, slug) => `${referenceSplit(kind).hub}/${slug}`;

/** Repo-root-relative source file of a sub-page, e.g. `apps/reference/hooks/storage.md`. */
export const subPageFile = (kind, slug) => `${subPageRoute(kind, slug).slice(1)}.md`;

/** Repo-root-relative source file of a hub page. */
export const hubFile = (kind) => `${referenceSplit(kind).hub.slice(1)}.md`;

/** The stable key each kind's artifact items are placed by. */
export function itemKey(kind, item) {
  if (kind === 'cli') return item.command;
  return item.name;
}

/** The DOM id an item's section carries — on its sub-page AND, as an index anchor, on the hub. */
export function itemAnchorId(kind, key) {
  if (kind === 'hooks') return `hook-${key}`;
  if (kind === 'bridge') return `bridge-${key}`;
  // cli: mirrors cliAnchorId in cliReference.shared.mjs (kept dependency-free
  // here; scripts/test-appblocks-cli.mjs pins the two to the same output).
  const slug = String(key ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `cli-${slug}` : 'cli';
}

/** DOM id of a group's heading in the hub index. */
export const groupAnchorId = (kind, slug) => `${kind}-group-${slug}`;

/**
 * Assign every item to a group. Returns the groups in catalog order, each with
 * its items in ARTIFACT order (so a sub-page reads in the source's own order),
 * plus the keys that were placed by inheritance rather than by an explicit rule.
 *
 * @template T
 * @param {'hooks'|'cli'|'bridge'} kind
 * @param {T[]} items artifact items, in artifact order
 * @returns {{ groups: Array<RefGroup & { items: T[] }>, groupOf: Map<string, string>, inherited: string[] }}
 */
export function splitByGroup(kind, items) {
  const split = referenceSplit(kind);
  const groupOf = new Map();
  const inherited = [];
  const fallback = split.groups.find((g) => g.fallback)?.slug ?? split.groups[0].slug;
  const byMember = new Map();
  for (const g of split.groups) for (const m of g.members ?? []) byMember.set(m, g.slug);
  // Longest prefix first, so `app listing` wins over `app`.
  const prefixes = split.groups
    .flatMap((g) => (g.prefixes ?? []).map((p) => ({ p, slug: g.slug })))
    .sort((a, b) => b.p.length - a.p.length);

  let prev = null;
  for (const item of items) {
    const key = itemKey(kind, item);
    let slug = byMember.get(key);
    if (!slug && prefixes.length) {
      const hit = prefixes.find(({ p }) => key === p || key.startsWith(`${p} `));
      slug = hit?.slug;
      if (!slug) {
        slug = fallback;
        inherited.push(key);
      }
    }
    if (!slug) {
      slug = prev ?? fallback;
      inherited.push(key);
    }
    groupOf.set(key, slug);
    prev = slug;
  }
  const groups = split.groups.map((g) => ({
    ...g,
    items: items.filter((it) => groupOf.get(itemKey(kind, it)) === g.slug),
  }));
  return { groups, groupOf, inherited };
}

/**
 * The items of one group, in artifact order. What the islands call with their
 * (required) `group` prop.
 */
export function itemsInGroup(kind, items, slug) {
  if (!slug) throw new Error(`itemsInGroup: a ${kind} group slug is required`);
  const { groupOf } = splitByGroup(kind, items);
  return items.filter((it) => groupOf.get(itemKey(kind, it)) === slug);
}

/**
 * Hub anchor -> sub-page URL, for every entry. The hub keeps each old anchor
 * as an id on its index entry (so `/apps/reference/hooks#hook-useTip` still
 * lands on something that links onward) and forwards it client-side.
 */
export function movedAnchors(kind, items) {
  const { groupOf } = splitByGroup(kind, items);
  const out = {};
  for (const [key, slug] of groupOf) {
    const id = itemAnchorId(kind, key);
    out[id] = `${subPageRoute(kind, slug)}#${id}`;
  }
  return out;
}

/** Sidebar items for a hub's sub-pages, in catalog order. */
export function sidebarItems(kind) {
  const split = referenceSplit(kind);
  return split.groups.map((g) => ({ text: g.title, link: subPageRoute(kind, g.slug) }));
}
