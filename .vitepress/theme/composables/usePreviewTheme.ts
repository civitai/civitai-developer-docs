import { computed, onMounted, ref, type ComputedRef } from 'vue';
import { useData } from 'vitepress';

/**
 * The `data-theme` value a design-system preview container must carry, resolved
 * so it SURVIVES HYDRATION. Used by both preview surfaces (<ComponentDemo> and
 * <ElementPreview>) so the rule lives in one place.
 *
 * 🔴 WHY THIS IS NOT JUST `computed(() => isDark ? 'dark' : 'light')` — MEASURED.
 * `@civitai/theme` resolves its tokens from `[data-theme='light'|'dark']`, and
 * VitePress signals dark mode with a `.dark` CLASS on <html> instead, so a preview
 * has to restate the appearance as a `data-theme` attribute. The naive computed
 * renders that attribute during SSR, where VitePress's `isDark` is a
 * `ref(false)` — `initData()` in vitepress/dist/client/app/data.js only builds the
 * real `useDark()` ref in the browser — so EVERY preview ships `data-theme="light"`
 * in the static HTML.
 *
 * A PRODUCTION Vue hydration does not repair that. `hydrateElement` re-patches only
 * `value`/`indeterminate`, event handlers and `.`-prefixed props; a plain attribute
 * whose server and client values disagree is ADOPTED as rendered. So on a first
 * load with dark already in `localStorage` the attribute stayed `light` for good.
 *
 * Measured on the BUILT + SERVED site (Chromium, `vitepress preview`), dark seeded
 * via an init script so it is a genuine first load — `<html class="dark">`,
 * `localStorage['vitepress-theme-appearance'] === 'dark'`, and at +0ms, +1s and +3s:
 *
 *     data-theme               "light"            (expected "dark")
 *     --civitai-color-surface  rgb(254, 254, 254) (the LIGHT token)
 *     civitai card background  rgb(254, 254, 254) (expected rgb(37, 38, 43))
 *
 * i.e. a returning dark-mode reader — the common case, since the choice persists —
 * got white cards, white inputs and light text on a dark page across all 21
 * showcase demos and all 45 live element previews. Clicking the appearance switch
 * fixed it, because THAT is a reactive update and Vue does patch those; which is
 * also why the browser E2E never saw it (it only ever reaches dark by clicking).
 *
 * THE FIX: gate the value on a `mounted` flag. The first client render therefore
 * reproduces the server's `"light"` and hydration matches; `onMounted` then flips
 * the flag, and the resulting re-render is a normal reactive patch that DOES write
 * the attribute. Costs one extra render of these components and nothing else.
 *
 * `test-showcase-e2e.mjs`'s "dark on FIRST LOAD" block is the regression guard.
 */
export function usePreviewTheme(): ComputedRef<'light' | 'dark'> {
  const { isDark } = useData();
  const mounted = ref(false);
  onMounted(() => {
    mounted.value = true;
  });
  return computed(() => (mounted.value && isDark.value ? 'dark' : 'light'));
}
