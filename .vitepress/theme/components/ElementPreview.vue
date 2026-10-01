<script setup lang="ts">
/**
 * <ElementPreview> — the themed container the generated element gallery
 * (apps/reference/elements.md, from scripts/gen-appblocks-element-gallery.mjs)
 * wraps each live `<civitai-*>` instance in.
 *
 * It exists for the same reason <ComponentDemo>'s preview pane does, and reuses
 * its `.cds-preview` class so both get one escape hatch rather than two:
 *
 *  1. THEME. `@civitai/theme` resolves its tokens from `[data-theme='light'|
 *     'dark']` (with a bare `:root` default). VitePress signals dark mode with a
 *     `.dark` CLASS on <html> and sets no `data-theme` at all, so without this
 *     wrapper every element on the page would paint from the `:root` defaults
 *     and ignore the site's light/dark switch. `data-theme` here is driven by
 *     `useData().isDark`, so it re-resolves reactively, in place, with no reload.
 *
 *  2. THE CASCADE. `.cds-preview`'s `all: revert-layer` rule in
 *     theme/design-system.css is what survives the two UNLAYERED resets this
 *     site carries (VitePress's form-control reset and the Tailwind Preflight
 *     `*{border-width:0}` that `vitepress-openapi` pulls in transitively).
 *     Unlayered CSS beats layered CSS whatever the specificity, and for a custom
 *     element it also beats the element's own `:host` rules — a declaration from
 *     the outer tree wins over one from a shadow tree. Scoping the hatch to this
 *     container is what keeps it off the VitePress chrome.
 *
 * `contain` is for `<civitai-toast-region>`, whose host is `position: fixed`:
 * `contain: paint` makes this box the containing block for fixed descendants, so
 * the toast stack renders in place instead of floating over the page.
 */
import { computed } from 'vue';
import { useData } from 'vitepress';

defineProps<{ contain?: boolean }>();

const { isDark } = useData();
const theme = computed(() => (isDark.value ? 'dark' : 'light'));
</script>

<template>
  <div
    class="cds-preview cds-el-preview"
    :class="{ 'cds-el-preview--contain': contain }"
    :data-theme="theme"
    data-testid="cds-el-preview"
  >
    <slot />
  </div>
</template>
