// Shared by <JsonSchemaTable> and its .md fallback renderer (scripts/appblocks-md.mjs),
// so the manifest table's rows are computed ONCE and the two channels can only
// differ in layout. Plain ESM (not .ts) so bare-`node` scripts can import it; the
// island's types come from manifestSchema.shared.d.mts.

/**
 * Top-level manifest fields whose NESTED fields the table also lists, as dotted
 * rows under the field's own row. Everything below a listed field is walked: its
 * `properties`, and a single-pattern `patternProperties` map (one row segment
 * `<name>` stands for every key the pattern allows).
 *
 * Deliberately NOT every object in the schema. `storage` is listed because its
 * per-collection fields (`visibility`, `write`, `ownedModelVersions`, …) are what
 * an author actually declares, and nothing on the page described them field by
 * field. `iframe`, `page` and `analytics` already have hand-written prose on the
 * manifest page; expanding them is a one-line change here, made when someone
 * decides those rows read better than the prose. `goods` and `targets` are
 * ARRAYS of objects, which this walk does not descend into (`items` is never
 * walked), so listing them here would add nothing; `goods.items` has its own
 * parity-guarded hand table instead.
 */
export const EXPANDED_FIELDS = ['storage'];

/** The row segment that stands for a `patternProperties` key. */
export const PATTERN_KEY = '<name>';

const isSchema = (p) => p !== null && typeof p === 'object' && !Array.isArray(p);

/** The one `patternProperties` entry of `prop`, or null; more than one is refused. */
function singlePattern(prop, path) {
  const entries = Object.entries(prop?.patternProperties ?? {});
  if (!entries.length) return null;
  if (entries.length > 1) {
    throw new Error(
      `manifest table: ${path} has ${entries.length} patternProperties; the table can name only one ` +
        `"${PATTERN_KEY}" segment per map. Teach manifestSchema.shared.mjs how to label them.`,
    );
  }
  const [pattern, value] = entries[0];
  return { pattern, value };
}

/** The Type column. */
export function typeText(prop) {
  if (!prop) return '';
  let t = Array.isArray(prop.type) ? prop.type.join(' | ') : prop.type ?? '';
  if (prop.enum) t = prop.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (t === 'array' && prop.items?.type) t = `${prop.items.type}[]`;
  if (prop.format) t += ` (${prop.format})`;
  return t;
}

/** The constraint line under a row's description. */
export function constraintText(prop) {
  if (!prop) return '';
  const bits = [];
  if (prop.pattern) bits.push(`pattern: ${prop.pattern}`);
  if (prop.minLength != null) bits.push(`minLength ${prop.minLength}`);
  if (prop.maxLength != null) bits.push(`maxLength ${prop.maxLength}`);
  if (prop.minimum != null) bits.push(`min ${prop.minimum}`);
  if (prop.maximum != null) bits.push(`max ${prop.maximum}`);
  if (prop.exclusiveMinimum != null) bits.push(`> ${prop.exclusiveMinimum}`);
  if (prop.minItems != null) bits.push(`minItems ${prop.minItems}`);
  if (prop.maxItems != null) bits.push(`maxItems ${prop.maxItems}`);
  if (prop.uniqueItems) bits.push('unique items');
  if (isSchema(prop.items)) {
    if (prop.items.pattern) bits.push(`item pattern: ${prop.items.pattern}`);
    const notEnum = prop.items.not?.enum;
    if (Array.isArray(notEnum)) bits.push(`item not: ${notEnum.map((v) => JSON.stringify(v)).join(' | ')}`);
  }
  if (prop.minProperties != null) bits.push(`minProperties ${prop.minProperties}`);
  if (prop.maxProperties != null) bits.push(`maxProperties ${prop.maxProperties}`);
  const pp = singlePattern(prop, '(constraint)');
  if (pp) {
    bits.push(`key pattern: ${pp.pattern}`);
    if (Array.isArray(pp.value?.enum)) bits.push(`values: ${pp.value.enum.map((v) => JSON.stringify(v)).join(' | ')}`);
  }
  if (prop.default !== undefined) bits.push(`default: ${JSON.stringify(prop.default)}`);
  return bits.join(', ');
}

const expanded = (path) => EXPANDED_FIELDS.some((f) => path === f || path.startsWith(`${f}.`));

/**
 * Every row of the manifest table, in schema order: each top-level field, and
 * directly after an expanded one, its nested fields as dotted paths. `required`
 * is relative to the row's PARENT object (a collection's `visibility` is required
 * in every collection, not in every manifest).
 *
 * @param {{ properties?: Record<string, any>, required?: string[] }} schema
 * @returns {Array<{ field: string, type: string, required: boolean, description: string, constraints: string }>}
 */
export function manifestRows(schema) {
  const rows = [];
  const walk = (obj, prefix) => {
    const required = new Set(obj?.required ?? []);
    for (const [name, prop] of Object.entries(obj?.properties ?? {})) {
      // A `false` subschema (e.g. `indexes.properties.key: false`) forbids a key;
      // it is not a field.
      if (!isSchema(prop)) continue;
      const field = prefix + name;
      rows.push({
        field,
        type: typeText(prop),
        required: required.has(name),
        description: prop.description ?? '',
        constraints: constraintText(prop),
      });
      if (!expanded(field)) continue;
      if (prop.properties) walk(prop, `${field}.`);
      const pp = singlePattern(prop, field);
      if (pp && isSchema(pp.value) && pp.value.properties) walk(pp.value, `${field}.${PATTERN_KEY}.`);
    }
  };
  walk(schema, '');
  return rows;
}
