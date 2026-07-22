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
import ComponentDemo from './components/ComponentDemo.vue';
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
    ctx.app.component('ScopesTable', ScopesTable);
    ctx.app.component('JsonSchemaTable', JsonSchemaTable);
    ctx.app.component('CliReference', CliReference);
    ctx.app.component('MessageTable', MessageTable);
    ctx.app.component('HooksReference', HooksReference);

    // Design-system showcase surfaces.
    ctx.app.component('ComponentDemo', ComponentDemo);
    ctx.app.component('TokenGallery', TokenGallery);
  },
} satisfies Theme;
