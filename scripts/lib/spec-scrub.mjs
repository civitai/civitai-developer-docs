// Docs-side scrub of the Orchestration OpenAPI spec, applied by copy-spec.mjs to
// whichever spec it resolved (live refresh, sibling checkout or the committed
// snapshot) BEFORE it lands in public/openapi/v2-consumers.json — the file the
// site renders, bundles and serves for download.
//
// WHY IT LIVES HERE AND NOT IN THE SNAPSHOT. The snapshot is a verbatim copy of
// what upstream publishes and is re-snapshotted wholesale, so a hand edit there
// is undone by the next refresh. A transform on the resolved spec survives every
// refresh and every resolution path. The real fix belongs in the upstream source;
// this is a stopgap, and each rule should be deleted once upstream carries it.
//
// HOW A STALE RULE SURFACES. Every rule records how many things it matched.
// `scrubSpec` never throws on a rule that matched nothing — it reports it in
// `unmatched`. copy-spec.mjs WARNS on that (a fresh build must never break
// because upstream fixed something), and `npm run check:spec-scrub` FAILS on it
// against the committed snapshot, so the re-snapshot PR that picks up an
// upstream fix is the PR told to delete the rule.
//
// SHAPE IS NOT EDITED except by the two drop rules: text rules only rewrite
// `description` / `summary` strings.

/**
 * THE RULES TABLE. One entry per rule; `id` is what a stale-rule message names.
 *
 * - dropOperations: removed from `paths` by operationId (an emptied path item is
 *   removed too, and so is a tag left with no operations).
 * - dropStepTypes: a discriminator value removed from every discriminated union
 *   that maps it, together with the mapped schema.
 * Schemas that become unreachable ONLY because of the drops above are removed
 * as well; anything that was already unreferenced upstream is left alone.
 * - text: regex rewrites over every `description` / `summary` string.
 */
export const SCRUB_RULES = {
  dropOperations: [
    { id: 'drop-op:InvalidateUserCache', operationId: 'InvalidateUserCache', reason: 'marked internal-only upstream' },
    { id: 'drop-op:InvalidateUserTokens', operationId: 'InvalidateUserTokens', reason: 'marked internal-only upstream' },
    { id: 'drop-op:InvokeEchoStepTemplate', operationId: 'InvokeEchoStepTemplate', reason: 'test-only step' },
  ],
  dropStepTypes: [{ id: 'drop-step:echo', stepType: 'echo', reason: 'test-only step' }],
  text: [
    {
      id: 'text:incident-date',
      reason: 'dated incident reference',
      pattern: /lost in the \d{4}-\d{2}-\d{2} storage\s+incident(?: \([^)]*\))?/g,
      replace: 'lost after the workflow completed',
    },
    {
      id: 'text:ephemeral-storage',
      reason: 'backing-store and runtime names',
      // Two upstream wordings seen (the committed snapshot and older ones).
      pattern:
        /Not persisted to [^;]+; in-flight state lives only in grain state and nothing remains once terminal\.|not persisted to [^.]+\.\s*In-flight state lives only in [^;.]*grain state[^;.]*;\s*once the workflow\s+reaches a terminal state the grain clears its state and no record remains\./g,
      replace: (m) =>
        m.startsWith('Not')
          ? 'Not retained: nothing remains once the workflow reaches a terminal state.'
          : 'not retained: nothing remains once it reaches a terminal state.',
    },
    {
      id: 'text:retention',
      reason: 'operator retention wording',
      pattern: /the telemetry document is kept[^,]*, but\s+consumer reads/g,
      replace: 'consumer reads',
    },
    {
      id: 'text:unique-index',
      reason: 'storage index design',
      pattern: /\s+so the (?:partial )?unique index [^.]*per-user\.\s*See Civitai\.Orchestration\.[\w.]*ExternalId\./g,
      replace: ', so it is unique per user.',
    },
    {
      id: 'text:grain-recovery',
      reason: 'runtime name',
      pattern: / on grain recovery\./g,
      replace: ' if the workflow is recovered.',
    },
    {
      id: 'text:options-type',
      reason: 'internal type name',
      pattern: / from the \w+OptionsGrain for the given mode\./g,
      replace: ' for the given mode.',
    },
    {
      id: 'text:worker-codename',
      reason: 'internal component name',
      pattern: /^Opt-into using the \w+ controller exclusively$/g,
      replace: 'Opt into running exclusively on Civitai-managed Comfy workers.',
    },
    {
      id: 'text:image-example',
      reason: 'internal image path',
      pattern: /\n?\(e\.g\. `urn:air:oci:image:[^`]+`\)/g,
      replace: '',
    },
    {
      id: 'text:air-link',
      reason: 'dead link',
      pattern: /https:\/\/developer\.civitai\.com\/docs\/getting-started\/ai-resource-identifier/g,
      replace: 'https://developer.civitai.com/site/guide/air',
    },
    {
      // Unresolved C# doc-comment crefs. A member cref becomes its JSON property
      // name when the owning schema has that property; a type cref becomes the
      // schema name; anything else falls back to its last segment.
      id: 'text:dotnet-type-names',
      reason: 'raw .NET type names',
      pattern: /Civitai\.Orchestration\.[\w.]*\w/g,
      replace: (match, { schemas }) => {
        const seg = match.split('.');
        const last = seg[seg.length - 1];
        const owner = schemas[seg[seg.length - 2]];
        const camel = last[0].toLowerCase() + last.slice(1);
        if (owner && schemaHasProperty(owner, camel)) return `\`${camel}\``;
        if (schemas[last]) return `\`${last}\``;
        return last;
      },
    },
  ],
};

function schemaHasProperty(schema, name) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.properties && Object.hasOwn(schema.properties, name)) return true;
  return ['allOf', 'anyOf', 'oneOf'].some((k) => (schema[k] || []).some((s) => schemaHasProperty(s, name)));
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const SCHEMA_REF = '#/components/schemas/';

/** Every schema name referenced from `node` — `$ref`s and discriminator mapping values. */
function refsIn(node, out = new Set()) {
  if (Array.isArray(node)) {
    for (const v of node) refsIn(v, out);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string' && v.startsWith(SCHEMA_REF)) out.add(v.slice(SCHEMA_REF.length));
      else if (k === 'mapping' && v && typeof v === 'object') {
        for (const m of Object.values(v)) if (typeof m === 'string' && m.startsWith(SCHEMA_REF)) out.add(m.slice(SCHEMA_REF.length));
      } else refsIn(v, out);
    }
  }
  return out;
}

/** Schema names reachable from paths (and any non-schema components). */
function reachableSchemas(spec) {
  const schemas = spec.components?.schemas || {};
  const roots = { paths: spec.paths, webhooks: spec.webhooks };
  for (const [k, v] of Object.entries(spec.components || {})) if (k !== 'schemas') roots[k] = v;
  const seen = new Set();
  const queue = [...refsIn(roots)];
  while (queue.length) {
    const name = queue.pop();
    if (seen.has(name) || !schemas[name]) continue;
    seen.add(name);
    queue.push(...refsIn(schemas[name]));
  }
  return seen;
}

function tagsInUse(spec) {
  const used = new Set();
  for (const item of Object.values(spec.paths || {})) {
    for (const m of HTTP_METHODS) for (const t of item?.[m]?.tags || []) used.add(t);
  }
  return used;
}

/**
 * Applies `rules` to a deep copy of `spec`.
 *
 * Returns `{ spec, counts, unmatched, removed }`:
 *   counts    — { [ruleId]: number of things the rule matched }
 *   unmatched — rule ids that matched nothing (stale: upstream fixed it, or moved it)
 *   removed   — { operations, schemas, tags } actually removed, for reporting
 */
export function scrubSpec(input, rules = SCRUB_RULES) {
  const spec = structuredClone(input);
  const counts = {};
  const removed = { operations: [], schemas: [], tags: [] };
  const schemas = spec.components?.schemas || {};
  const reachableBefore = reachableSchemas(spec);
  const tagsBefore = tagsInUse(spec);

  for (const rule of rules.dropOperations || []) {
    counts[rule.id] = 0;
    for (const [path, item] of Object.entries(spec.paths || {})) {
      for (const m of HTTP_METHODS) {
        if (item?.[m]?.operationId === rule.operationId) {
          delete item[m];
          counts[rule.id]++;
          removed.operations.push(rule.operationId);
        }
      }
      if (!HTTP_METHODS.some((m) => item?.[m])) delete spec.paths[path];
    }
  }

  for (const rule of rules.dropStepTypes || []) {
    counts[rule.id] = 0;
    for (const schema of Object.values(schemas)) {
      const mapping = schema?.discriminator?.mapping;
      if (!mapping || !Object.hasOwn(mapping, rule.stepType)) continue;
      const target = mapping[rule.stepType];
      delete mapping[rule.stepType];
      counts[rule.id]++;
      for (const k of ['oneOf', 'anyOf']) {
        if (Array.isArray(schema[k])) schema[k] = schema[k].filter((s) => s?.$ref !== target);
      }
      if (typeof target === 'string' && target.startsWith(SCHEMA_REF)) {
        const name = target.slice(SCHEMA_REF.length);
        if (schemas[name]) {
          delete schemas[name];
          removed.schemas.push(name);
        }
      }
    }
  }

  // Prune only what the drops orphaned — never upstream's own unreferenced schemas.
  const reachableAfter = reachableSchemas(spec);
  for (const name of reachableBefore) {
    if (!reachableAfter.has(name) && schemas[name]) {
      delete schemas[name];
      removed.schemas.push(name);
    }
  }

  // Likewise only tags the drops emptied.
  const tagsAfter = tagsInUse(spec);
  if (Array.isArray(spec.tags)) {
    spec.tags = spec.tags.filter((t) => {
      const drop = tagsBefore.has(t.name) && !tagsAfter.has(t.name);
      if (drop) removed.tags.push(t.name);
      return !drop;
    });
  }

  const ctx = { schemas };
  for (const rule of rules.text || []) counts[rule.id] = 0;
  const rewrite = (s) => {
    let out = s;
    for (const rule of rules.text || []) {
      out = out.replace(rule.pattern, (...args) => {
        counts[rule.id]++;
        return typeof rule.replace === 'function' ? rule.replace(args[0], ctx) : rule.replace;
      });
    }
    return out;
  };
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if ((k === 'description' || k === 'summary') && typeof v === 'string') node[k] = rewrite(v);
        else walk(v);
      }
    }
  };
  walk(spec);

  const unmatched = Object.keys(counts).filter((id) => counts[id] === 0);
  return { spec, counts, unmatched, removed };
}

/** Every `#/components/schemas/…` reference (incl. discriminator mappings) that does not resolve. */
export function danglingRefs(spec) {
  const schemas = spec.components?.schemas || {};
  return [...refsIn(spec)].filter((name) => !schemas[name]);
}
