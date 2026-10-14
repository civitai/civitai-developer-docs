// Markdown twins for the generated Orchestration API operation pages.
//
// 🔴 THE GAP. `orchestration/reference/operations/[operationId].md` is a dynamic
// route whose body is ONE component tag (`<OAOperation :operationId=…/>`): the
// whole page is rendered client-side from the OpenAPI spec. The llms plugin
// therefore had nothing to emit, the pages sit in its `ignoreFiles`, and every
// operation page answered `.md` with a 404 and appeared 0 times in llms.txt —
// the API reference, the part of the site an integrating agent most needs, was
// the one part with no machine-readable form at all.
//
// So the twins are rendered HERE, from the same scrubbed spec the HTML pages
// render from (`public/openapi/v2-consumers.json`), as readable markdown:
// method + path, summary/description, auth, a parameter table, the request
// body's schema resolved one level (fields, types, required, enums,
// discriminators), and each response's schema the same way. Not a JSON dump —
// an agent reads a table, and a 600-line schema dump is what lossy summarisers
// drop first.
//
// 🔴 FAIL-LOUD CONTRACT: `buildOperationTwins` THROWS (failing the build) when
// the spec yields 0 operations, or when its operation set differs from the set
// the paths loader generated HTML pages for. A twin set that silently shrank to
// zero is indistinguishable from a working one in every log line but this one.

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

export const API_BASE = 'https://orchestration.civitai.com';
export const OPERATIONS_ROUTE = '/orchestration/reference/operations/';

/** Every operation in the spec, in document order: { operationId, method, path, op }. */
export function specOperations(spec) {
  const out = [];
  for (const [path, item] of Object.entries(spec?.paths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (op?.operationId) out.push({ operationId: op.operationId, method, path, op, pathParams: item.parameters ?? [] });
    }
  }
  return out;
}

const refName = (ref) => ref.split('/').pop();

/** Resolve a local `#/components/...` $ref (one hop). */
export function deref(spec, schema) {
  if (!schema?.$ref) return schema;
  const parts = schema.$ref.replace(/^#\//, '').split('/');
  let cur = spec;
  for (const p of parts) cur = cur?.[p];
  if (!cur) throw new Error(`operation-twins: unresolvable $ref ${schema.$ref}`);
  return cur;
}

/** One-line, table-safe text. */
const cell = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
const code = (s) => '`' + String(s).replace(/`/g, "'") + '`';

// High enough that no enum in the spec is cut (the largest is 36 values): a
// truncated enum silently hides valid values, e.g. callback event types.
const MAX_ENUM = 64;

function enumText(values) {
  const shown = values.slice(0, MAX_ENUM).map((v) => code(v)).join(', ');
  return values.length > MAX_ENUM ? `${shown}, … (${values.length} values)` : shown;
}

/** A compact, human type string for a schema (no recursion past named refs). */
export function typeText(spec, schema) {
  if (!schema || typeof schema !== 'object') return 'any';
  if (schema.$ref) {
    const name = refName(schema.$ref);
    const target = deref(spec, schema);
    if (Array.isArray(target.enum)) return `${code(name)} (one of ${enumText(target.enum)})`;
    return code(name);
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length === 1) return typeText(spec, schema.allOf[0]);
  let types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const nullable = types.includes('null');
  types = types.filter((t) => t !== 'null');
  let t;
  if (types.includes('array') || schema.items) {
    t = `array of ${typeText(spec, schema.items)}`;
  } else if ((types.includes('object') || !types.length) && schema.additionalProperties && typeof schema.additionalProperties === 'object' && Object.keys(schema.additionalProperties).length) {
    t = `map of ${typeText(spec, schema.additionalProperties)}`;
  } else if (types.length) {
    t = types.join(' or ');
    if (schema.format) t += ` (${schema.format})`;
  } else {
    t = 'any';
  }
  if (Array.isArray(schema.enum)) t += `, one of ${enumText(schema.enum)}`;
  if (nullable) t += ', nullable';
  return t;
}

function constraints(schema) {
  const c = [];
  if (!schema || typeof schema !== 'object') return '';
  if (schema.default !== undefined) c.push(`default ${code(JSON.stringify(schema.default))}`);
  for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern']) {
    if (schema[k] !== undefined) c.push(`${k} ${code(schema[k])}`);
  }
  return c.join(', ');
}

function withConstraints(desc, schema) {
  const c = constraints(schema);
  if (!c) return desc;
  return desc ? `${desc.replace(/\.?$/, '.')} (${c})` : `(${c})`;
}

/** Named object schemas a schema's own fields reference directly (not enums). */
function referencedObjects(spec, schema) {
  const names = [];
  const add = (x) => {
    if (!x || typeof x !== 'object') return;
    if (x.$ref) {
      if (!Array.isArray(deref(spec, x).enum)) names.push(x);
      return;
    }
    if (Array.isArray(x.allOf) && x.allOf.length === 1) add(x.allOf[0]);
    if (x.items) add(x.items);
    if (x.additionalProperties && typeof x.additionalProperties === 'object') add(x.additionalProperties);
  };
  const target = schema?.$ref || schema?.type !== 'array' ? schema : schema.items;
  if (!target) return names;
  const { props } = objectShape(spec, target);
  for (const ps of Object.values(props)) add(ps);
  return names;
}

/** Flatten an object schema, following `allOf` parts one level. */
export function objectShape(spec, schema) {
  const s = deref(spec, schema);
  const props = {};
  const required = new Set(s.required ?? []);
  const bases = [];
  for (const part of s.allOf ?? []) {
    if (part.$ref) bases.push(refName(part.$ref));
    const p = deref(spec, part);
    Object.assign(props, p.properties ?? {});
    for (const r of p.required ?? []) required.add(r);
  }
  Object.assign(props, s.properties ?? {});
  return { schema: s, props, required, bases };
}

/** The markdown block describing a (top-level) schema: fields table + discriminator + enum. */
export function schemaBlock(spec, schema, seen) {
  const lines = [];
  const name = schema?.$ref ? refName(schema.$ref) : null;
  if (name && seen.has(name)) {
    lines.push(`Schema ${code(name)} — fields as listed above.`);
    return lines;
  }
  if (name) seen.add(name);
  const resolved = deref(spec, schema);
  const isArray = resolved?.type === 'array' || (Array.isArray(resolved?.type) && resolved.type.includes('array'));
  if (isArray && resolved.items) {
    // An array schema, inline or by $ref (e.g. JsonPatchDocument): name it, then
    // describe its ELEMENT type — the object path would print no fields at all.
    const label = name ? `Schema ${code(name)}: ${typeText(spec, resolved)}` : `Type: ${typeText(spec, resolved)}`;
    lines.push(label + (resolved.description ? ` — ${cell(resolved.description)}` : '.'));
    if (resolved.items.$ref) lines.push('', ...schemaBlock(spec, resolved.items, seen));
    return lines;
  }
  const { schema: s, props, required, bases } = objectShape(spec, schema);
  const head = [name ? `Schema ${code(name)}` : `Type: ${typeText(spec, schema)}`];
  if (bases.length) head.push(`(extends ${bases.map(code).join(', ')})`);
  lines.push(head.join(' ') + (s.description ? ` — ${cell(s.description)}` : '.'));
  if (Array.isArray(s.enum)) {
    lines.push('', `One of: ${enumText(s.enum)}.`);
    return lines;
  }
  if (s.discriminator?.propertyName) {
    const mapping = Object.entries(s.discriminator.mapping ?? {});
    lines.push(
      '',
      `Polymorphic: the ${code(s.discriminator.propertyName)} field selects the concrete type` +
        (mapping.length ? ` — ${mapping.map(([k, v]) => `${code(k)} → ${code(refName(v))}`).join(', ')}.` : '.'),
    );
  }
  const entries = Object.entries(props);
  if (entries.length) {
    lines.push('', '| Field | Type | Required | Description |', '|---|---|---|---|');
    for (const [prop, ps] of entries) {
      const desc = withConstraints(cell(ps?.description ?? (ps?.$ref ? deref(spec, ps).description : '')), ps);
      lines.push(`| ${code(prop)} | ${cell(typeText(spec, ps))} | ${required.has(prop) ? 'yes' : 'no'} | ${desc} |`);
    }
  } else if (s.additionalProperties) {
    lines.push('', `Type: ${typeText(spec, s)}.`);
  }
  return lines;
}

const yamlString = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * A one-line title. Some summaries in the spec run over several lines (a whole
 * sentence or two), which broke the one-line-per-entry shape of llms.txt; the
 * first line is the title and the full summary is kept in the body.
 */
export function operationTitle(op, operationId) {
  const first = String(op.summary ?? '').split('\n')[0].trim().replace(/[.:,;]$/, '');
  return (first || operationId).replace(/[[\]]/g, '');
}

/** The full markdown twin for one operation. */
export function renderOperation(spec, { operationId, method, path, op, pathParams }) {
  const M = method.toUpperCase();
  const title = operationTitle(op, operationId);
  const multiLineSummary = /\n/.test(op.summary ?? '') ? op.summary.trim() : null;
  const seen = new Set();
  const out = [
    '---',
    `url: ${OPERATIONS_ROUTE}${operationId}.md`,
    `description: ${yamlString(`${M} ${path} — ${title}`)}`,
    '---',
    '',
    `# ${title}`,
    '',
    code(`${M} ${API_BASE}${path}`),
    '',
    `Operation ${code(operationId)}${op.tags?.length ? ` · ${op.tags.join(', ')}` : ''} · ` +
      `Civitai Orchestration API, generated from the published OpenAPI spec ` +
      `([v2-consumers.json](https://developer.civitai.com/openapi/v2-consumers.json)); the interactive HTML page is this URL without \`.md\`.`,
  ];
  if (multiLineSummary) out.push('', multiLineSummary);
  if (op.description) out.push('', op.description.trim());

  // 🔴 Worded to what the spec SAYS, not stronger. Its global `security` is
  // `[{}]` (no requirement object names a scheme), so the spec never states a
  // token is REQUIRED; what it does carry is one bearer scheme (`ApiKey`), an
  // explicit `security: []` opt-out on some operations, and a documented 401
  // on most. Say exactly those three things.
  out.push('', '## Authentication', '');
  const has401 = Object.prototype.hasOwnProperty.call(op.responses ?? {}, '401');
  const schemes = Object.entries(spec.components?.securitySchemes ?? {});
  const bearer = schemes.find(([, v]) => v?.type === 'http' && v?.scheme === 'bearer');
  if (Array.isArray(op.security) && op.security.length === 0) {
    out.push(
      'The spec marks this operation anonymous (`security: []`): no token is needed' +
        (has401 ? ', although it still documents a `401 Unauthorized` response.' : '.'),
    );
  } else if (bearer) {
    out.push(
      `Send \`Authorization: Bearer <token>\` (the spec's \`${bearer[0]}\` scheme)` +
        (has401 ? '; this operation documents `401 Unauthorized` for a missing or invalid token.' : '.') +
        ' See [Authentication](/orchestration/guide/authentication).',
    );
  } else {
    out.push('The spec declares no authentication scheme for this operation.');
  }

  const params = [...pathParams, ...(op.parameters ?? [])].map((p) => deref(spec, p));
  out.push('', '## Parameters', '');
  if (params.length) {
    out.push('| Name | In | Type | Required | Description |', '|---|---|---|---|---|');
    for (const p of params) {
      const desc = withConstraints(cell(p.description), p.schema);
      out.push(`| ${code(p.name)} | ${p.in} | ${cell(typeText(spec, p.schema))} | ${p.required ? 'yes' : 'no'} | ${desc} |`);
    }
  } else {
    out.push('None.');
  }

  if (op.requestBody) {
    const body = deref(spec, op.requestBody);
    const content = Object.entries(body.content ?? {});
    out.push('', '## Request body', '');
    out.push(
      `${body.required ? 'Required' : 'Optional'}. Content type${content.length > 1 ? 's' : ''}: ${content.map(([t]) => code(t)).join(', ')}.` +
        (body.description ? ` ${cell(body.description)}` : ''),
    );
    const [, media] = content[0] ?? [];
    if (media?.schema) {
      out.push('', ...schemaBlock(spec, media.schema, seen));
      // One level further for the body only: the request is what an agent has to
      // COMPOSE, and its nested types (often discriminated by `$type`) are where
      // a payload goes wrong. Responses stay one level to bound the size.
      const nested = referencedObjects(spec, media.schema).filter((r) => !seen.has(refName(r.$ref)));
      if (nested.length) {
        out.push('', '### Types used by the request body');
        for (const r of nested) {
          if (seen.has(refName(r.$ref))) continue;
          out.push('', `#### ${refName(r.$ref)}`, '', ...schemaBlock(spec, r, seen));
        }
      }
    }
    const examples = Object.entries(media?.examples ?? {});
    const first = examples[0];
    if (first) {
      const json = JSON.stringify(deref(spec, first[1]).value, null, 2);
      if (json && json.length <= 3000) {
        out.push('', `Example (${cell(first[0])}${examples.length > 1 ? `; ${examples.length - 1} more in the spec` : ''}):`, '', '```json', json, '```');
      }
    }
  }

  out.push('', '## Responses');
  for (const [status, raw] of Object.entries(op.responses ?? {})) {
    const r = deref(spec, raw);
    out.push('', `### ${status}${r.description ? ` ${cell(r.description)}` : ''}`, '');
    const content = Object.entries(r.content ?? {});
    if (!content.length) {
      out.push('No body.');
      continue;
    }
    out.push(`Content type${content.length > 1 ? 's' : ''}: ${content.map(([t]) => code(t)).join(', ')}.`);
    // One block per DISTINCT schema: `QueryWorkflows` answers JSON or a zip, and
    // showing only the first schema mislabels the other.
    const shown = new Set();
    for (const [type, media] of content) {
      if (!media?.schema) continue;
      const key = JSON.stringify(media.schema);
      if (shown.has(key)) continue;
      shown.add(key);
      out.push('', ...(content.length > 1 ? [`For ${code(type)}:`, ''] : []), ...schemaBlock(spec, media.schema, seen));
    }
  }
  return out.join('\n') + '\n';
}

/**
 * Render every operation's twin. `expectedIds` is the set the paths loader
 * generated HTML pages for; THROWS on 0 operations or any mismatch.
 * Returns [{ operationId, method, path, title, url, text }].
 */
export function buildOperationTwins(spec, expectedIds) {
  const ops = specOperations(spec);
  if (ops.length === 0) {
    throw new Error('operation-twins: the OpenAPI spec yields 0 operations — refusing to publish an empty API reference');
  }
  const ids = ops.map((o) => o.operationId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(`operation-twins: duplicate operationId(s) in the spec: ${[...new Set(dupes)].join(', ')}`);
  const want = [...new Set(expectedIds)].sort();
  const have = [...ids].sort();
  if (want.length === 0 || want.join('\n') !== have.join('\n')) {
    const missing = want.filter((id) => !ids.includes(id));
    const extra = have.filter((id) => !want.includes(id));
    throw new Error(
      `operation-twins: ${have.length} operation(s) in the spec but ${want.length} generated operation page(s) — ` +
        `missing twins: [${missing.join(', ')}], twins with no page: [${extra.join(', ')}]`,
    );
  }
  return ops.map((o) => ({
    operationId: o.operationId,
    method: o.method.toUpperCase(),
    path: o.path,
    title: operationTitle(o.op, o.operationId),
    url: `${OPERATIONS_ROUTE}${o.operationId}.md`,
    text: renderOperation(spec, o),
  }));
}
