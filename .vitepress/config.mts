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
        { text: 'Workflows & Jobs', link: '/orchestration/guide/workflows-and-jobs' },
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
        { text: 'WAN video generation', link: '/orchestration/recipes/wan' },
        { text: 'LTX2 video generation', link: '/orchestration/recipes/ltx2' },
        { text: 'Flux 2 image generation', link: '/orchestration/recipes/flux2' },
        { text: 'Flux 1 image generation', link: '/orchestration/recipes/flux1' },
        { text: 'Z-Image generation', link: '/orchestration/recipes/zimage' },
        { text: 'Qwen image generation', link: '/orchestration/recipes/qwen' },
        { text: 'Anima image generation', link: '/orchestration/recipes/anima' },
        { text: 'SDXL image generation', link: '/orchestration/recipes/sdxl' },
        { text: 'SD1 image generation', link: '/orchestration/recipes/sd1' },
        { text: 'OpenAI image generation', link: '/orchestration/recipes/openai' },
        { text: 'Google image generation', link: '/orchestration/recipes/google' },
        { text: 'Gemini image generation', link: '/orchestration/recipes/gemini' },
        { text: 'Seedream image generation', link: '/orchestration/recipes/seedream' },
        { text: 'Grok image generation', link: '/orchestration/recipes/grok' },
        { text: 'WAN image generation', link: '/orchestration/recipes/wan-image' },
        { text: 'Image upscaling', link: '/orchestration/recipes/image-upscaler' },
        { text: 'Video upscaling', link: '/orchestration/recipes/video-upscaler' },
        { text: 'Video frame interpolation', link: '/orchestration/recipes/video-interpolation' },
        { text: 'Transcription', link: '/orchestration/recipes/transcription' },
        { text: 'Text-to-speech', link: '/orchestration/recipes/text-to-speech' },
        { text: 'ACE-Step music generation', link: '/orchestration/recipes/ace-step-audio' },
        { text: 'Prompt enhancement', link: '/orchestration/recipes/prompt-enhancement' },
        { text: 'Chat completion', link: '/orchestration/recipes/chat-completion' },
        { text: 'Image conversion', link: '/orchestration/recipes/convert-image' },
      ],
    },
  ],
  '/orchestration/internals/': [
    {
      text: 'Internals',
      items: [
        { text: 'Architecture', link: '/orchestration/internals/architecture' },
        { text: 'Diagrams', link: '/orchestration/internals/diagrams' },
      ],
    },
  ],
};

export default withMermaid({
  title: 'Civitai Developer',
  description: 'Developer documentation for Civitai APIs — orchestration, SDKs, and more.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['**/CLAUDE.md', '**/README.md'],
  // The dynamic operations routes are generated from [operationId].paths.js — the
  // dead-link checker doesn't resolve them ahead of time, so we skip them here.
  ignoreDeadLinks: [/^\/orchestration\/reference\/operations\//],

  themeConfig: {
    nav: [
      { text: 'Orchestration', link: '/orchestration/', activeMatch: '/orchestration/' },
      {
        text: 'Guides',
        items: [
          { text: 'Orchestration Guide', link: '/orchestration/guide/' },
          { text: 'Orchestration Recipes', link: '/orchestration/recipes/' },
          { text: 'Orchestration Reference', link: '/orchestration/reference/' },
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
        description: 'Civitai developer documentation — orchestration API (submit AI workflows: video, image, audio, text via a single contract that races multiple providers), plus SDKs and related developer tooling.',
        details:
          'Orchestration section covers the consumer-facing REST API: authenticating, submitting workflows, polling / receiving webhooks for results, and using each recipe (videoGen/WAN, imageGen/Flux, upscalers, transcription, TTS, prompt enhancement). ' +
          'Reference pages are generated from the v2-consumers OpenAPI specification and stay in sync with the live API on every build.',
        sidebar,
        ignoreFiles: ['orchestration/reference/operations/[operationId].md'],
      }),
    ],
  },
});
