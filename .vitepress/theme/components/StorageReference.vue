<script setup lang="ts">
import { inject } from 'vue';
// The document store's limits and error codes, from `public/appblocks/storage.json`
// (scripts/gen-appblocks-storage.mjs). The rows are composed once, in the generator, and
// the .md fallback region (scripts/appblocks-md.mjs `renderStorage`) renders the same
// rows, so the two channels cannot disagree about a number.
import { inlineCodeSegments } from './storageReference.shared.mjs';

interface LimitRow { group: string; item: string; value: string }
interface ErrorRow { code: string; status: number; meaning: string }
interface StorageData { limits: LimitRow[]; errors: ErrorRow[] }

const props = defineProps<{ table: 'limits' | 'errors' }>();
const data = inject<StorageData>('appblocks:storage', { limits: [], errors: [] });
const limits = data.limits ?? [];
const errors = data.errors ?? [];
const seg = inlineCodeSegments;
</script>

<template>
  <div class="ab-storage">
    <table v-if="props.table === 'limits' && limits.length">
      <thead>
        <tr><th>Area</th><th>Limit</th><th>Value</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in limits" :key="r.group + r.item">
          <td>{{ r.group }}</td>
          <td><template v-for="(s, i) in seg(r.item)" :key="i"><code v-if="s.code">{{ s.text }}</code><template v-else>{{ s.text }}</template></template></td>
          <td><template v-for="(s, i) in seg(r.value)" :key="i"><code v-if="s.code">{{ s.text }}</code><template v-else>{{ s.text }}</template></template></td>
        </tr>
      </tbody>
    </table>
    <table v-else-if="props.table === 'errors' && errors.length">
      <thead>
        <tr><th>Code</th><th>HTTP</th><th>Meaning</th></tr>
      </thead>
      <tbody>
        <tr v-for="e in errors" :key="e.code">
          <td><code>{{ e.code }}</code></td>
          <td>{{ e.status }}</td>
          <td><template v-for="(s, i) in seg(e.meaning)" :key="i"><code v-if="s.code">{{ s.text }}</code><template v-else>{{ s.text }}</template></template></td>
        </tr>
      </tbody>
    </table>
    <p v-else class="ab-empty">
      No storage reference generated. Run <code>npm run gen:appblocks</code>.
    </p>
  </div>
</template>

<style scoped>
.ab-storage { overflow-x: auto; }
.ab-empty { color: var(--vp-c-text-3); font-style: italic; }
</style>
