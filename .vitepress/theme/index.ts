import type { Theme } from 'vitepress';
import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import { theme, useOpenapi } from 'vitepress-openapi/client';
import 'vitepress-openapi/dist/style.css';
import './custom.css';

import spec from '../../public/openapi/v2-consumers.json' with { type: 'json' };

import AuthBar from './components/AuthBar.vue';
import RecipeRun from './components/RecipeRun.vue';
import ResultViewer from './components/ResultViewer.vue';

export default {
  extends: DefaultTheme,

  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(AuthBar),
    });
  },

  async enhanceApp(ctx) {
    useOpenapi({
      spec,
      config: {
        // Persist the OpenAPI playground's auth field so users only
        // enter their token once per browser.
        storage: { persistAuth: true, prefix: 'civitai-developer-docs' },
      },
    });
    theme.enhanceApp(ctx as any);

    ctx.app.component('AuthBar', AuthBar);
    ctx.app.component('RecipeRun', RecipeRun);
    ctx.app.component('ResultViewer', ResultViewer);
  },
} satisfies Theme;
