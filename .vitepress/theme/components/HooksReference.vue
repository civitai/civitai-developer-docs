<script setup lang="ts">
import { inject } from 'vue';

interface Hook {
  name: string;
  signature: string;
  description: string;
  example: string;
  exampleSource: string | null;
}
interface HooksData { hooks: Hook[]; reactPackage?: string; }

const data = inject<HooksData>('appblocks:hooks', { hooks: [] });
const hooks = data.hooks ?? [];
</script>

<template>
  <div class="ab-hooks">
    <section v-for="h in hooks" :key="h.name" class="ab-hook">
      <h3 :id="`hook-${h.name}`"><code>{{ h.name }}</code></h3>
      <div class="ab-sig-label">signature</div>
      <pre class="ab-sig"><code>{{ h.signature }}</code></pre>
      <p v-if="h.description" class="ab-hook-desc">{{ h.description }}</p>
      <template v-if="h.example">
        <div class="ab-sig-label">example</div>
        <pre class="ab-example"><code>{{ h.example }}</code></pre>
      </template>
    </section>
    <p v-if="!hooks.length" class="ab-empty">
      No hooks generated. Run <code>npm run gen:appblocks</code>.
    </p>
  </div>
</template>

<style scoped>
.ab-hook {
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 1rem;
  margin-top: 1.25rem;
}
.ab-hook h3 { margin-top: 0; }
.ab-sig-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vp-c-text-3); margin: 0.5rem 0 0.2rem; }
.ab-sig code { color: var(--vp-c-brand-1); }
.ab-hook pre {
  margin: 0 0 0.4rem; padding: 0.6rem 0.9rem; overflow-x: auto;
  background: var(--vp-code-block-bg, var(--vp-c-bg-alt)); border-radius: 6px;
}
.ab-hook pre code { font-family: var(--vp-font-family-mono); font-size: 0.82rem; white-space: pre; }
.ab-hook-desc { margin: 0.4rem 0 0.8rem; color: var(--vp-c-text-1); }
.ab-empty { color: var(--vp-c-text-3); font-style: italic; }
</style>
