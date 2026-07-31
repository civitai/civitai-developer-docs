<script setup lang="ts">
import { inject } from 'vue';

interface Field {
  name: string;
  type: string;
  optional: boolean;
  description: string;
}
interface BridgeType {
  name: string;
  kind: 'object' | 'union' | 'alias';
  description: string;
  fields?: Field[];
  members?: string[];
  text?: string;
}
interface Lifecycle {
  name: string;
  signature: string;
  description: string;
  members: Field[];
}
interface BridgeData {
  lifecycle?: Lifecycle;
  types?: BridgeType[];
  sdkPackage?: string;
  reactPackage?: string;
}

const data = inject<BridgeData>('appblocks:bridge', {});
const lifecycle = data.lifecycle;
const types = data.types ?? [];
</script>

<template>
  <div class="ab-bridge">
    <p v-if="!types.length" class="ab-empty">
      No bridge reference generated. Run <code>npm run gen:appblocks</code>.
    </p>

    <!-- useBuzzWorkflow lifecycle -->
    <section v-if="lifecycle" class="ab-brtype" id="bridge-useBuzzWorkflow">
      <h3><code>{{ lifecycle.name }}()</code> <span class="ab-kind">lifecycle</span></h3>
      <pre class="ab-sig"><code>{{ lifecycle.signature }}</code></pre>
      <p v-if="lifecycle.description" class="ab-desc">{{ lifecycle.description }}</p>
      <table class="ab-fields">
        <thead><tr><th>member</th><th>type</th><th>notes</th></tr></thead>
        <tbody>
          <tr v-for="m in lifecycle.members" :key="m.name">
            <td><code>{{ m.name }}</code></td>
            <td><code class="ab-type">{{ m.type }}</code></td>
            <td class="ab-fnote">{{ m.description }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- SDK generation types -->
    <section v-for="t in types" :key="t.name" class="ab-brtype" :id="`bridge-${t.name}`">
      <h3><code>{{ t.name }}</code> <span class="ab-kind">{{ t.kind }}</span></h3>
      <p v-if="t.description" class="ab-desc">{{ t.description }}</p>

      <div v-if="t.kind === 'union'" class="ab-union">
        <div class="ab-label">members</div>
        <ul>
          <li v-for="mem in t.members" :key="mem"><code>{{ mem }}</code></li>
        </ul>
      </div>

      <table v-else-if="t.fields && t.fields.length" class="ab-fields">
        <thead><tr><th>field</th><th>type</th><th>notes</th></tr></thead>
        <tbody>
          <tr v-for="f in t.fields" :key="f.name">
            <td>
              <code>{{ f.name }}</code><span v-if="f.optional" class="ab-opt" title="optional">?</span>
            </td>
            <td><code class="ab-type">{{ f.type }}</code></td>
            <td class="ab-fnote">{{ f.description }}</td>
          </tr>
        </tbody>
      </table>

      <pre v-else-if="t.text" class="ab-sig"><code>{{ t.text }}</code></pre>
    </section>
  </div>
</template>

<style scoped>
.ab-brtype {
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 1rem;
  margin-top: 1.5rem;
}
.ab-brtype h3 { margin-top: 0; display: flex; align-items: center; gap: 0.5rem; }
.ab-kind {
  font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--vp-c-text-3); background: var(--vp-c-default-soft);
  padding: 0.06rem 0.45rem; border-radius: 999px; font-weight: 600;
}
.ab-sig {
  margin: 0 0 0.6rem; padding: 0.6rem 0.9rem; overflow-x: auto;
  background: var(--vp-code-block-bg, var(--vp-c-bg-alt)); border-radius: 6px;
}
.ab-sig code { font-family: var(--vp-font-family-mono); font-size: 0.82rem; white-space: pre; }
.ab-desc { margin: 0.4rem 0 0.8rem; color: var(--vp-c-text-1); white-space: pre-line; }
.ab-fields { display: table; width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
.ab-fields th, .ab-fields td {
  text-align: left; vertical-align: top; padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--vp-c-divider); font-size: 0.85rem;
}
.ab-fields th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vp-c-text-3); }
.ab-type { font-size: 0.78rem; color: var(--vp-c-brand-1); white-space: pre-wrap; word-break: break-word; }
.ab-opt { color: var(--vp-c-warning-1); font-weight: 700; }
.ab-fnote { color: var(--vp-c-text-2); white-space: pre-line; }
.ab-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vp-c-text-3); margin-bottom: 0.2rem; }
.ab-union ul { margin: 0.2rem 0 0.6rem 1.1rem; }
.ab-empty { color: var(--vp-c-text-3); font-style: italic; }
</style>
