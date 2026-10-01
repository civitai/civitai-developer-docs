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
 *     `useData().isDark` through `usePreviewTheme()` — see that composable for why
 *     the bare `computed` shipped `light` in the SSR HTML and stayed there.
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
 *  3. REGISTRATION. Nothing below upgrades until the custom elements are DEFINED,
 *     and this component is the only place on the site that renders one — see the
 *     `registerElements()` note below.
 *
 * `contain` is for `<civitai-toast-region>`, whose host is `position: fixed`:
 * `contain: paint` makes this box the containing block for fixed descendants, so
 * the toast stack renders in place instead of floating over the page.
 */
import { onMounted } from 'vue';
import { usePreviewTheme } from '../composables/usePreviewTheme';

defineProps<{ contain?: boolean }>();

const theme = usePreviewTheme();

/**
 * Define the 44 `<civitai-*>` custom elements, LAZILY AND ONCE, when a preview
 * actually mounts.
 *
 * 🔴 THIS IS WHY THE CALL IS HERE AND NOT IN theme/index.ts. It used to be a
 * top-level `registerSite()` in the theme entry, which pulled Lit plus all 44
 * element definitions into the site's MAIN chunk — downloaded, parsed and executed
 * on EVERY page of developer.civitai.com — to serve ONE generated page. Measured on
 * the built site: `apps/reference/elements.html` is the only page in
 * `.vitepress/dist` carrying an unexpanded `<civitai-*>` tag (71 occurrences; every
 * other mention sitewide is escaped `&lt;civitai-` inside a code fence, which is
 * text and needs no upgrade). The CSS-pack demos on `apps/showcase` use
 * `data-civitai-ui` ATTRIBUTES and are painted by a stylesheet, so they are
 * unaffected by registration either way.
 *
 * A dynamic `import()` keeps the bundle in its own async chunk; hanging it off this
 * component's mount rather than off a ROUTE STRING means the dependency cannot
 * drift when the gallery page is renamed or a second page starts using elements —
 * whatever renders a preview pulls in the definitions it needs.
 *
 * It MUST be this specifier and the named export MUST be CALLED — a bare
 * side-effect `import '@civitai/components/site-elements.js'` is TREE-SHAKEN AWAY,
 * because the package's `sideEffects` field allow-lists only its CSS, its
 * `.define.js` files and `elements/register.js` + `elements/register-site.js`,
 * and NOT the root bundles. Measured when it was written that way:
 * `customElements.get('civitai-card')` was `undefined` on every page, nothing
 * upgraded, and the only symptom was a gallery of empty boxes.
 *
 * `registerSite()` = `registerAll()`'s 39 elements plus the 5 civitai-vocabulary
 * ones; load one bundle or the other, never both, because two disjoint bundles
 * would each carry their own copy of Lit.
 *
 * The 2 elements under the package's `src/sdk/` (civitai-sign-in-button,
 * civitai-workflow-button) are deliberately NOT registered: they `import
 * '@civitai/sdk'` and reach for a block host transport on connect, so off-platform
 * they render `nothing`. The generated gallery names them and says why rather than
 * showing an empty box as if it were the component.
 *
 * SSR-safe by construction — `onMounted` does not run in the Node render pass.
 * Idempotent twice over: the module-level promise collapses the gallery's 45
 * mounts into one import, and `defineElement` itself no-ops on a tag that is
 * already defined.
 */
let registration: Promise<void> | null = null;
function registerElements(): Promise<void> {
  registration ??= import('@civitai/components/register-site').then(({ registerSite }) => {
    registerSite();
  });
  return registration;
}

onMounted(() => {
  void registerElements();
});
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
