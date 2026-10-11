<script setup lang="ts">
/**
 * <ComponentDemo> — a live demo of the CSS-only `data-civitai-ui` markup.
 *
 * On the showcase it is the SECONDARY demo in each section, under the
 * `<civitai-*>` element's <ElementDemo>: the markup a page that runs no
 * JavaScript writes against `@civitai/components/styles.css`.
 *
 * SINGLE SOURCE OF TRUTH: the live preview is derived from the SAME text shown
 * in the code panel (the `#html` slot's rendered <code>). There is no separate
 * "html to render" prop, so the preview can never drift from the shown HTML —
 * the snippet-accuracy check in scripts/test-showcase-e2e.mjs asserts exactly
 * this invariant.
 *
 * Slot: #html — a ```html fenced block (shiki-highlighted, with a copy button).
 *
 * The preview container carries `data-theme` driven by VitePress dark mode
 * (`useData().isDark`), so every `--civitai-*` token re-resolves to match the
 * surrounding site theme.
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import { useData } from 'vitepress';

defineProps<{
  /** Human component name shown in the header, e.g. "Button". */
  title: string;
  /** The `data-civitai-ui` name shown as a code chip, e.g. "button". */
  ui?: string;
}>();

const { isDark } = useData();
// SSR always renders light, and hydration does not patch a mismatched attribute.
const mounted = ref(false);
const theme = computed(() => (mounted.value && isDark.value ? 'dark' : 'light'));

const htmlSlot = ref<HTMLElement | null>(null);
const previewHtml = ref('');

onMounted(async () => {
  mounted.value = true;
  await nextTick();
  const code = htmlSlot.value?.querySelector('pre code');
  if (code) previewHtml.value = code.textContent ?? '';
});
</script>

<template>
  <div class="cds-demo" :data-ui="ui">
    <div class="cds-demo__header">
      <span class="cds-demo__title">
        {{ title }}
        <code v-if="ui">data-civitai-ui="{{ ui }}"</code>
      </span>
      <span class="cds-demo__theme">{{ theme }}</span>
    </div>

    <!-- Live, themed preview — painted by @civitai/theme + @civitai/components. -->
    <div class="cds-preview" :data-theme="theme" data-testid="cds-preview" v-html="previewHtml" />

    <div ref="htmlSlot" class="cds-demo__code" data-testid="cds-code-html">
      <slot name="html" />
    </div>
  </div>
</template>
