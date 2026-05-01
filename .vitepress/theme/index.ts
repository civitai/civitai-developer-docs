import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { theme, useOpenapi } from 'vitepress-openapi/client';
import 'vitepress-openapi/dist/style.css';
import './custom.css';

import spec from '../../public/openapi/v2-consumers.json' with { type: 'json' };

import Layout from './Layout.vue';
import ApiTry from './components/ApiTry.vue';
import AuthBar from './components/AuthBar.vue';
import McpConfigBlock from './components/McpConfigBlock.vue';
import RecipeRun from './components/RecipeRun.vue';
import ResultViewer from './components/ResultViewer.vue';

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
  },
} satisfies Theme;
