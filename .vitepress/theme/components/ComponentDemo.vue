<script setup lang="ts">
/**
 * <ComponentDemo> — a Shoelace-style live demo for the Civitai design system.
 *
 * Renders the plain-HTML `data-civitai-ui` markup LIVE as the primary themed
 * preview, above a code panel that toggles between the HTML and React source.
 *
 * SINGLE SOURCE OF TRUTH: the live preview is derived from the SAME text shown
 * in the HTML code panel (the `#html` slot's rendered <code>). There is no
 * separate "html to render" prop, so the preview can never drift from the shown
 * HTML — the snippet-accuracy test asserts exactly this invariant.
 *
 * Slots (each a VitePress fenced code block, so it is shiki-highlighted and gets
 * a copy button for free):
 *   #html   — the framework-agnostic HTML (```html)  — also the live source
 *   #react  — the @civitai/components-react equivalent (```tsx)
 *
 * The preview container carries `data-theme` driven by VitePress dark mode
 * (`useData().isDark`), so every `--civitai-*` token re-resolves to match the
 * surrounding site theme.
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useData } from 'vitepress';

const props = withDefaults(
  defineProps<{
    /** Human component name shown in the header, e.g. "Button". */
    title: string;
    /** The `data-civitai-ui` name shown as a code chip, e.g. "button". */
    ui?: string;
    /** Whether a #react panel is provided (defaults true). */
    react?: boolean;
  }>(),
  // NB: Vue 3.3+ infers `type: Boolean` from the `react?: boolean` annotation,
  // and an ABSENT Boolean prop is cast to `false` (not `undefined`) — so a bare
  // `<ComponentDemo>` with no `react` attribute would hide the React panel. The
  // explicit default restores the intended "React panel on unless :react=false".
  { react: true },
);

const { isDark } = useData();
const theme = computed(() => (isDark.value ? 'dark' : 'light'));
const showReact = props.react;

const tab = ref<'html' | 'react'>('html');
const htmlSlot = ref<HTMLElement | null>(null);
const previewHtml = ref('');

/** Read the raw code text out of the shiki-rendered #html slot. */
function syncPreview() {
  const code = htmlSlot.value?.querySelector('pre code');
  if (code) previewHtml.value = code.textContent ?? '';
}

onMounted(async () => {
  await nextTick();
  syncPreview();
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

    <div class="cds-demo__toolbar" role="tablist" aria-label="Source language">
      <button
        class="cds-tab"
        role="tab"
        type="button"
        :aria-selected="tab === 'html'"
        data-testid="cds-tab-html"
        @click="tab = 'html'"
      >
        HTML
      </button>
      <button
        v-if="showReact"
        class="cds-tab"
        role="tab"
        type="button"
        :aria-selected="tab === 'react'"
        data-testid="cds-tab-react"
        @click="tab = 'react'"
      >
        React
      </button>
    </div>

    <!-- Both panels stay mounted (v-show) so the #html source is always readable
         for the live preview, even while the React panel is on screen. -->
    <div
      v-show="tab === 'html'"
      ref="htmlSlot"
      class="cds-demo__code"
      data-testid="cds-code-html"
    >
      <slot name="html" />
    </div>
    <div
      v-if="showReact"
      v-show="tab === 'react'"
      class="cds-demo__code"
      data-testid="cds-code-react"
    >
      <slot name="react" />
    </div>
  </div>
</template>
