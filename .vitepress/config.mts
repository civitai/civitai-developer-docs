import type { DefaultTheme } from 'vitepress';
import { useSidebar } from 'vitepress-openapi';
import llmstxt from 'vitepress-plugin-llms';
import { withMermaid } from 'vitepress-plugin-mermaid';
import spec from '../public/openapi/v2-consumers.json' with { type: 'json' };

const base = '/';

const openapiSidebar = useSidebar({
  spec,
  linkPrefix: '/orchestration/reference/operations/',
});

const sidebar: DefaultTheme.Sidebar = {
  '/orchestration/guide/': [
    {
      text: 'Getting Started',
      items: [
        { text: 'Introduction', link: '/orchestration/guide/' },
        { text: 'Quick Start', link: '/orchestration/guide/getting-started' },
        { text: 'Authentication', link: '/orchestration/guide/authentication' },
      ],
    },
    {
      text: 'Core Concepts',
      items: [
        { text: 'Workflows', link: '/orchestration/guide/workflows' },
        { text: 'Submitting Work', link: '/orchestration/guide/submitting-work' },
        { text: 'Results & Webhooks', link: '/orchestration/guide/results-and-webhooks' },
        { text: 'Errors & Retries', link: '/orchestration/guide/errors-and-retries' },
      ],
    },
  ],
  '/orchestration/reference/': [
    {
      text: 'Reference',
      items: [
        { text: 'Overview', link: '/orchestration/reference/' },
      ],
    },
    ...openapiSidebar.generateSidebarGroups({
      linkPrefix: '/orchestration/reference/operations/',
    }).map(group => ({
      ...group,
      collapsed: true,
    })),
  ],
  '/orchestration/recipes/': [
    {
      text: 'Recipes',
      items: [
        { text: 'Overview', link: '/orchestration/recipes/' },
      ],
    },
    {
      text: 'Video',
      items: [
        { text: 'WAN video generation', link: '/orchestration/recipes/wan' },
        { text: 'LTX2 video generation', link: '/orchestration/recipes/ltx2' },
        { text: 'Kling video generation', link: '/orchestration/recipes/kling' },
        { text: 'Vidu video generation', link: '/orchestration/recipes/vidu' },
        { text: 'Veo 3 video generation', link: '/orchestration/recipes/veo3' },
        { text: 'Grok video generation', link: '/orchestration/recipes/grok-video' },
        { text: 'Happy-Horse video generation', link: '/orchestration/recipes/happy-horse' },
        { text: 'HunyuanVideo generation', link: '/orchestration/recipes/hunyuan' },
        { text: 'Video upscaling', link: '/orchestration/recipes/video-upscaler' },
        { text: 'Video frame interpolation', link: '/orchestration/recipes/video-interpolation' },
        { text: 'Compose media (video)', link: '/orchestration/recipes/compose-media-video' },
      ],
    },
    {
      text: 'Image',
      items: [
        { text: 'Flux 2 image generation', link: '/orchestration/recipes/flux2' },
        { text: 'Flux 1 image generation', link: '/orchestration/recipes/flux1' },
        { text: 'Z-Image generation', link: '/orchestration/recipes/zimage' },
        { text: 'Qwen image generation', link: '/orchestration/recipes/qwen' },
        { text: 'Krea v2 image generation', link: '/orchestration/recipes/krea' },
        { text: 'MAI Image 2.5 image generation', link: '/orchestration/recipes/mai-image' },
        { text: 'Anima image generation', link: '/orchestration/recipes/anima' },
        { text: 'ERNIE image generation', link: '/orchestration/recipes/ernie' },
        { text: 'SDXL image generation', link: '/orchestration/recipes/sdxl' },
        { text: 'SD1 image generation', link: '/orchestration/recipes/sd1' },
        { text: 'OpenAI image generation', link: '/orchestration/recipes/openai' },
        { text: 'Google image generation', link: '/orchestration/recipes/google' },
        { text: 'Gemini image generation', link: '/orchestration/recipes/gemini' },
        { text: 'Seedream image generation', link: '/orchestration/recipes/seedream' },
        { text: 'Grok image generation', link: '/orchestration/recipes/grok' },
        { text: 'WAN image generation', link: '/orchestration/recipes/wan-image' },
        { text: 'Image upscaling', link: '/orchestration/recipes/image-upscaler' },
      ],
    },
    {
      text: '3D',
      items: [
        { text: '3D model generation', link: '/orchestration/recipes/3d' },
      ],
    },
    {
      text: 'Audio',
      items: [
        { text: 'Transcription', link: '/orchestration/recipes/transcription' },
        { text: 'Text-to-speech', link: '/orchestration/recipes/text-to-speech' },
        { text: 'Multi-speaker dialogue', link: '/orchestration/recipes/multi-speaker-dialogue' },
        { text: 'ACE-Step music generation', link: '/orchestration/recipes/ace-step-audio' },
      ],
    },
    {
      text: 'Language models',
      items: [
        { text: 'Chat completion', link: '/orchestration/recipes/chat-completion' },
      ],
    },
    {
      text: 'Utilities',
      items: [
        { text: 'Prompt enhancement', link: '/orchestration/recipes/prompt-enhancement' },
        { text: 'Image conversion', link: '/orchestration/recipes/convert-image' },
        { text: 'Image background removal', link: '/orchestration/recipes/image-background-removal' },
      ],
    },
    {
      text: 'Training',
      items: [
        { text: 'SDXL & SD1 LoRA training', link: '/orchestration/recipes/training-sdxl-sd1' },
        { text: 'Flux 1 LoRA training', link: '/orchestration/recipes/training-flux1' },
        { text: 'Flux 2 Klein LoRA training', link: '/orchestration/recipes/training-flux2-klein' },
        { text: 'Wan video LoRA training', link: '/orchestration/recipes/training-wan' },
        { text: 'LTX2 video LoRA training', link: '/orchestration/recipes/training-ltx2' },
        { text: 'Chroma / ERNIE / Qwen / Z-Image LoRA training', link: '/orchestration/recipes/training-other-image' },
      ],
    },
  ],
  '/orchestration/mcp/': [
    {
      text: 'MCP Server',
      items: [
        { text: 'Overview', link: '/orchestration/mcp/' },
        { text: 'Tools, prompts, resources', link: '/orchestration/mcp/tools' },
      ],
    },
  ],
  '/site/mcp/': [
    {
      text: 'MCP Server',
      items: [
        { text: 'Overview', link: '/site/mcp/' },
        { text: 'Tools', link: '/site/mcp/tools' },
      ],
    },
  ],
  '/apps/guide/': [
    {
      text: 'Guide',
      items: [
        { text: 'Introduction', link: '/apps/guide/' },
        { text: 'Concepts', link: '/apps/guide/concepts' },
        { text: 'Quickstart', link: '/apps/guide/quickstart' },
        { text: 'Comfy Cloud (customComfy)', link: '/apps/guide/comfy-cloud' },
        { text: 'Running embedded & direct traffic', link: '/apps/guide/embedding' },
        { text: 'Theming & design system', link: '/apps/guide/theming' },
        { text: 'Theming an existing app (retrofit)', link: '/apps/guide/theming#theming-an-existing-app-retrofit-incremental-adoption' },
      ],
    },
  ],
  '/apps/reference/': [
    {
      text: 'Reference',
      items: [
        { text: 'Overview', link: '/apps/reference/' },
        { text: 'Scopes', link: '/apps/reference/scopes' },
        { text: 'Manifest', link: '/apps/reference/manifest' },
        { text: 'Components', link: '/apps/reference/components' },
        { text: 'Messages', link: '/apps/reference/messages' },
        { text: 'Hooks', link: '/apps/reference/hooks' },
        { text: 'CLI', link: '/apps/reference/cli' },
      ],
    },
  ],
  '/site/guide/': [
    {
      text: 'Guide',
      items: [
        { text: 'Introduction', link: '/site/guide/' },
        { text: 'Getting Started', link: '/site/guide/getting-started' },
        { text: 'Authentication', link: '/site/guide/authentication' },
        { text: 'CLI', link: '/site/guide/cli' },
        { text: 'Pagination', link: '/site/guide/pagination' },
        { text: 'Errors', link: '/site/guide/errors' },
        { text: 'AIR Identifiers', link: '/site/guide/air' },
      ],
    },
  ],
  '/site/oauth/': [
    {
      text: 'OAuth',
      items: [
        { text: 'Overview', link: '/site/oauth/' },
        { text: 'Quickstart', link: '/site/oauth/quickstart' },
        { text: 'Registering an app', link: '/site/oauth/register-app' },
        { text: 'Scopes', link: '/site/oauth/scopes' },
        { text: 'Endpoints', link: '/site/oauth/endpoints' },
        { text: 'Buzz limits', link: '/site/oauth/buzz-limits' },
      ],
    },
  ],
  '/site/reference/': [
    {
      text: 'Reference',
      items: [
        { text: 'Overview', link: '/site/reference/' },
        { text: 'Models', link: '/site/reference/models' },
        { text: 'Model Versions', link: '/site/reference/model-versions' },
        { text: 'Images', link: '/site/reference/images' },
        { text: 'Articles', link: '/site/reference/articles' },
        { text: 'Collections', link: '/site/reference/collections' },
        { text: 'Creators', link: '/site/reference/creators' },
        { text: 'Tags', link: '/site/reference/tags' },
        { text: 'Users', link: '/site/reference/users' },
        { text: 'Permissions', link: '/site/reference/permissions' },
        { text: 'Vault', link: '/site/reference/vault' },
        { text: 'Enums', link: '/site/reference/enums' },
      ],
    },
  ],
};

export default withMermaid({
  title: 'Civitai Developer',
  description: 'Developer documentation for Civitai APIs — orchestration, SDKs, and more.',
  base,
  head: [
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/images/favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/images/favicon-16x16.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/images/apple-touch-icon.png' }],
    ['link', { rel: 'manifest', href: '/site.webmanifest' }],
  ],
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['**/CLAUDE.md', '**/README.md', 'orchestration/internals/**'],
  // The dynamic operations routes are generated from [operationId].paths.js — the
  // dead-link checker doesn't resolve them ahead of time, so we skip them here.
  ignoreDeadLinks: [/^\/orchestration\/reference\/operations\//],

  transformPageData(pageData) {
    const pageTitle = pageData.params?.pageTitle;
    if (typeof pageTitle === 'string' && pageTitle.length > 0) {
      pageData.title = pageTitle;
    }
  },

  themeConfig: {
    nav: [
      { text: 'Orchestration', link: '/orchestration/', activeMatch: '/orchestration/' },
      { text: 'Civitai Site', link: '/site/', activeMatch: '/site/' },
      { text: 'Apps', link: '/apps/', activeMatch: '/apps/' },
      {
        text: 'Guides',
        items: [
          { text: 'Orchestration Guide', link: '/orchestration/guide/' },
          { text: 'Orchestration Recipes', link: '/orchestration/recipes/' },
          { text: 'Orchestration Reference', link: '/orchestration/reference/' },
          { text: 'Orchestration MCP', link: '/orchestration/mcp/' },
          { text: 'Civitai Site Guide', link: '/site/guide/' },
          { text: 'Civitai Site OAuth', link: '/site/oauth/' },
          { text: 'Civitai Site Reference', link: '/site/reference/' },
          { text: 'Civitai MCP', link: '/site/mcp/' },
          { text: 'Apps Guide', link: '/apps/guide/' },
          { text: 'Apps Reference', link: '/apps/reference/' },
        ],
      },
    ],

    sidebar,

    socialLinks: [
      { icon: 'github', link: 'https://github.com/civitai/civitai-developer-docs' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Civitai Developer Documentation',
      copyright: `© ${new Date().getFullYear()} Civitai`,
    },

    outline: { level: [2, 3] },
  },

  vite: {
    server: {
      // Aspire's YARP gateway proxies via host.docker.internal and the
      // *.civitai.localhost domains; allow both in dev.
      allowedHosts: true,
    },
    plugins: [
      llmstxt({
        description: 'Civitai developer documentation — orchestration API (submit AI workflows: video, image, audio, text via a single contract that races multiple providers), the Civitai site API, MCP servers for both, plus SDKs and related developer tooling.',
        details:
          'Orchestration section covers the consumer-facing REST API: authenticating, submitting workflows, polling / receiving webhooks for results, and using each recipe (videoGen/WAN, imageGen/Flux, upscalers, transcription, TTS, prompt enhancement). ' +
          'Reference pages are generated from the v2-consumers OpenAPI specification and stay in sync with the live API on every build.',
        sidebar,
        ignoreFiles: ['orchestration/reference/operations/**/*.md'],
      }),
    ],
  },
});
