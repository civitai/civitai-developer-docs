<script setup lang="ts">
import { inject } from 'vue';

interface Hook {
  name: string;
  signature: string;
  description: string;
  example: string;
  exampleSource: string | null;
  /** Stamped by gen-appblocks-hooks.mjs, branched on by the `<pre v-if>` in the
   *  template below. (It said ":31" until round 3: the same commit that wrote
   *  the pointer shifted the template five lines down, so it was wrong when
   *  written. Name the construct, not the line.) Declared here
   *  because NOTHING in CI type-checks .vue: a typo or a generator rename would
   *  silently yield `undefined`, fall every description back to <p>, and restore
   *  the collapsed-table bug with a fully green build. */
  descriptionHasTable?: boolean;
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
      <!-- 🔴 A DESCRIPTION CARRYING A TABLE MUST NOT BE COLLAPSED. This <p> has no
           white-space rule, so the browser flattens the source newlines: the
           useCollectionFollow docstring rendered as an 1853-codepoint run of
           literal pipes, burying its own instruction to check `err.timedOut`
           BEFORE `.message`. `descriptionHasTable` is computed in
           gen-appblocks-hooks.mjs and stamped into hooks.json, so this island and
           the .md fallback region agree by construction rather than by two
           regexes that drift. -->
      <pre v-if="h.description && h.descriptionHasTable" class="ab-hook-desc ab-hook-desc-pre">{{ h.description }}</pre>
      <p v-else-if="h.description" class="ab-hook-desc">{{ h.description }}</p>
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
.ab-hook-desc-pre { white-space: pre-wrap; font-family: inherit; overflow-x: auto; }
.ab-empty { color: var(--vp-c-text-3); font-style: italic; }
</style>
