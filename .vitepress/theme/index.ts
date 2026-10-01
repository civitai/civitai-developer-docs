import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { theme, useOpenapi } from 'vitepress-openapi/client';
import 'vitepress-openapi/dist/style.css';
import './custom.css';

// Civitai design system (dual-consumption) — loaded globally so the <ComponentDemo>
// and <TokenGallery> live previews render fully themed. Safe against the VitePress
// chrome by construction (asserted by the chrome-non-regression test):
//   - @civitai/theme ships ONLY `--civitai-*` custom properties (no `--vp-*`
//     overlap, and it styles no elements), so it cannot restyle nav/sidebar/content.
//   - @civitai/components rules are scoped to `[data-civitai-ui]` AND wrapped in
//     `@layer civitai.components`; layered CSS loses to VitePress's unlayered chrome.
import '@civitai/theme/styles.css';
import '@civitai/components/styles.css';
// The <civitai-*> CUSTOM ELEMENTS — the OTHER of the design system's two
// consumption tracks, and the one `@civitai/components-react` binds. Without this
// import a `<civitai-button>` on a page is an UNKNOWN element: it renders its
// light-DOM children unstyled, never upgrades, and the element gallery would be
// 47 blocks of markup nobody can see working.
//
// `registerSite()` = `registerAll()`'s 39 elements plus the 5 civitai-vocabulary
// ones; load one bundle or the other, never both, because two disjoint bundles
// would each carry their own copy of Lit.
//
// 🔴 IT MUST BE THIS SPECIFIER, AND THE CALL IS NOT OPTIONAL — MEASURED.
// A bare side-effect `import '@civitai/components/site-elements.js'` (the
// prebundled, self-registering root bundle) is TREE-SHAKEN AWAY: the package's
// `sideEffects` field allow-lists `**/*.css`, `**/*.define.js`,
// `**/elements/register.js` and `**/elements/register-site.js` — and NOT the root
// `site-elements.js`/`elements.js` bundles. Rollup therefore drops the whole
// import as dead code, with no warning and no error. Measured on the built site:
// `customElements.get('civitai-card')` was `undefined` on every page, the hosts
// never upgraded, and the only symptom was a gallery of empty boxes. Importing a
// NAMED export and CALLING it cannot be shaken, and the specifier is on the
// allow-list besides.
//
// SSR-safe: `defineElement` returns early when `customElements` is undefined
// (dist/elements/registry.js), so the Node render pass registers nothing and only
// the browser pass defines the 44. Idempotent by design — a duplicate
// `customElements.define` would throw and abort the rest of the calling module, so
// a conflict no-ops and warns instead.
//
// The 2 elements under the package's `src/sdk/` (civitai-sign-in-button,
// civitai-workflow-button) are deliberately NOT registered: they `import
// '@civitai/sdk'` and reach for a block host transport on connect, so off-platform
// they render `nothing`. The generated gallery names them and says why rather than
// showing an empty box as if it were the component.
import { registerSite } from '@civitai/components/register-site';

registerSite();

import './design-system.css';

import spec from '../../public/openapi/v2-consumers.json' with { type: 'json' };

// App Blocks generated reference artifacts (produced by scripts/gen-appblocks*.mjs
// on predev/prebuild; gitignored under public/appblocks/). Mirrors the OpenAPI
// spec import above.
import appblocksScopes from '../../public/appblocks/scopes.json' with { type: 'json' };
import appblocksManifest from '../../public/appblocks/manifest-schema.json' with { type: 'json' };
import appblocksCli from '../../public/appblocks/cli.json' with { type: 'json' };
import appblocksMessages from '../../public/appblocks/messages.json' with { type: 'json' };
import appblocksHooks from '../../public/appblocks/hooks.json' with { type: 'json' };
import appblocksBridge from '../../public/appblocks/bridge.json' with { type: 'json' };

import Layout from './Layout.vue';
import ApiTry from './components/ApiTry.vue';
import AuthBar from './components/AuthBar.vue';
import McpConfigBlock from './components/McpConfigBlock.vue';
import RecipeRun from './components/RecipeRun.vue';
import ResultViewer from './components/ResultViewer.vue';
import ScopesTable from './components/ScopesTable.vue';
import JsonSchemaTable from './components/JsonSchemaTable.vue';
import CliReference from './components/CliReference.vue';
import MessageTable from './components/MessageTable.vue';
import HooksReference from './components/HooksReference.vue';
import BridgeReference from './components/BridgeReference.vue';
import ComponentDemo from './components/ComponentDemo.vue';
import ElementPreview from './components/ElementPreview.vue';
import TokenGallery from './components/TokenGallery.vue';

export default {
  extends: DefaultTheme,
  Layout,

  async enhanceApp(ctx) {
    useOpenapi({
      spec,
      config: {
        // Persist the OpenAPI playground's auth field so users only
        // enter their token once per browser.
        storage: { persistAuth: true, prefix: 'civitai-developer-docs' },
        // Render request/response JSON with Shiki (matches the rest of the
        // site's code blocks) instead of the default vue-json-pretty tree.
        jsonViewer: { renderer: 'shiki' },
      },
    });
    theme.enhanceApp(ctx as any);

    ctx.app.component('ApiTry', ApiTry);
    ctx.app.component('AuthBar', AuthBar);
    ctx.app.component('McpConfigBlock', McpConfigBlock);
    ctx.app.component('RecipeRun', RecipeRun);
    ctx.app.component('ResultViewer', ResultViewer);

    // App Blocks generated reference: provide the artifacts, register the
    // rendering components (mirrors the OpenAPI island pattern above).
    ctx.app.provide('appblocks:scopes', appblocksScopes);
    ctx.app.provide('appblocks:manifest', appblocksManifest);
    ctx.app.provide('appblocks:cli', appblocksCli);
    ctx.app.provide('appblocks:messages', appblocksMessages);
    ctx.app.provide('appblocks:hooks', appblocksHooks);
    ctx.app.provide('appblocks:bridge', appblocksBridge);
    ctx.app.component('ScopesTable', ScopesTable);
    ctx.app.component('JsonSchemaTable', JsonSchemaTable);
    ctx.app.component('CliReference', CliReference);
    ctx.app.component('MessageTable', MessageTable);
    ctx.app.component('HooksReference', HooksReference);
    ctx.app.component('BridgeReference', BridgeReference);

    // Design-system showcase surfaces.
    ctx.app.component('ComponentDemo', ComponentDemo);
    ctx.app.component('ElementPreview', ElementPreview);
    ctx.app.component('TokenGallery', TokenGallery);
  },
} satisfies Theme;
