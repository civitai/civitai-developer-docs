<script setup lang="ts">
import { computed, inject } from 'vue';
// The rows (including the nested `storage.collections.<name>.*` ones) are
// computed in ONE place, shared with the .md fallback in scripts/appblocks-md.mjs.
import { manifestRows } from './manifestSchema.shared.mjs';

interface Schema {
  properties?: Record<string, any>;
  required?: string[];
}

const schema = inject<Schema>('appblocks:manifest', {});

const rows = computed(() => manifestRows(schema));
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
