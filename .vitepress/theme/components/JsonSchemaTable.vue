<script setup lang="ts">
import { computed, inject } from 'vue';

interface Schema {
  properties?: Record<string, any>;
  required?: string[];
}

const schema = inject<Schema>('appblocks:manifest', {});

function typeText(prop: any): string {
  if (!prop) return '';
  let t = Array.isArray(prop.type) ? prop.type.join(' | ') : prop.type ?? '';
  if (prop.enum) t = prop.enum.map((v: any) => JSON.stringify(v)).join(' | ');
  if (t === 'array' && prop.items?.type) t = `${prop.items.type}[]`;
  if (prop.format) t += ` (${prop.format})`;
  return t;
}

function constraintText(prop: any): string {
  if (!prop) return '';
  const bits: string[] = [];
  if (prop.pattern) bits.push(`pattern: ${prop.pattern}`);
  if (prop.minLength != null) bits.push(`minLength ${prop.minLength}`);
  if (prop.maxLength != null) bits.push(`maxLength ${prop.maxLength}`);
  if (prop.minimum != null) bits.push(`min ${prop.minimum}`);
  if (prop.maximum != null) bits.push(`max ${prop.maximum}`);
  if (prop.exclusiveMinimum != null) bits.push(`> ${prop.exclusiveMinimum}`);
  if (prop.maxItems != null) bits.push(`maxItems ${prop.maxItems}`);
  if (prop.default !== undefined) bits.push(`default: ${JSON.stringify(prop.default)}`);
  return bits.join(', ');
}

const rows = computed(() => {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  return Object.entries(props).map(([field, prop]: [string, any]) => ({
    field,
    type: typeText(prop),
    required: required.has(field),
    description: prop.description ?? '',
    constraints: constraintText(prop),
  }));
});
</script>

<template>
  <div class="ab-schema">
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Type</th>
          <th>Required</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.field">
          <td><code>{{ r.field }}</code></td>
          <td><code class="ab-type">{{ r.type }}</code></td>
          <td>
            <span v-if="r.required" class="ab-req">required</span>
            <span v-else class="ab-muted">optional</span>
          </td>
          <td>
            <div v-if="r.description">{{ r.description }}</div>
            <div v-if="r.constraints" class="ab-constraints"><code>{{ r.constraints }}</code></div>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="ab-empty">
      No manifest schema generated. Run <code>npm run gen:appblocks</code>.
    </p>
  </div>
</template>

<style scoped>
.ab-schema { overflow-x: auto; }
.ab-type { font-size: 0.85em; white-space: nowrap; }
.ab-req { color: var(--vp-c-brand-1); font-weight: 600; font-size: 0.85em; }
.ab-muted { color: var(--vp-c-text-3); font-size: 0.85em; }
.ab-constraints { margin-top: 0.35rem; font-size: 0.8em; color: var(--vp-c-text-2); }
.ab-empty { color: var(--vp-c-text-3); font-style: italic; }
</style>
