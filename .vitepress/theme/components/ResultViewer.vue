<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Workflow } from '../composables/useWorkflow';

const props = defineProps<{ workflow: Workflow }>();

interface MediaBlob {
  url: string;
  kind: 'image' | 'video' | 'audio' | 'other';
  filename: string;
  fromStep: string;
}

const showJson = ref(false);

const mediaBlobs = computed<MediaBlob[]>(() => {
  const out: MediaBlob[] = [];
  for (const step of props.workflow.steps ?? []) {
    walk(step.output, (url) => {
      out.push({
        url,
        kind: kindFromUrl(url),
        filename: filenameFromUrl(url),
        fromStep: step.name ?? '',
      });
    });
  }
  return out;
});

const jsonText = computed(() => JSON.stringify(props.workflow, null, 2));

function walk(node: any, onUrl: (url: string) => void) {
  if (!node) return;
  if (typeof node === 'string') {
    if (looksLikeBlobUrl(node)) onUrl(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walk(item, onUrl);
    return;
  }
  if (typeof node === 'object') {
    if (typeof node.url === 'string' && looksLikeBlobUrl(node.url)) {
      onUrl(node.url);
    }
    for (const v of Object.values(node)) walk(v, onUrl);
  }
}

function looksLikeBlobUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) && /\.[a-z0-9]{2,5}(\?|$)/i.test(s);
}

function kindFromUrl(url: string): MediaBlob['kind'] {
  const lower = url.split('?')[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif)$/.test(lower)) return 'image';
  if (/\.(mp4|webm|mov|m4v)$/.test(lower)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|flac)$/.test(lower)) return 'audio';
  return 'other';
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.split('/').filter(Boolean).pop() ?? url;
  } catch {
    return url;
  }
}
</script>

<template>
  <div class="result-viewer">
    <div class="result-viewer__meta">
      <span class="result-viewer__pill" :data-status="workflow.status">{{ workflow.status }}</span>
      <span class="result-viewer__id">{{ workflow.id }}</span>
    </div>

    <div v-if="mediaBlobs.length" class="result-viewer__grid">
      <figure
        v-for="(blob, i) in mediaBlobs"
        :key="`${blob.url}-${i}`"
        class="result-viewer__item"
      >
        <img v-if="blob.kind === 'image'" :src="blob.url" :alt="blob.filename" loading="lazy" />
        <video v-else-if="blob.kind === 'video'" :src="blob.url" controls preload="metadata" />
        <audio v-else-if="blob.kind === 'audio'" :src="blob.url" controls />
        <a v-else :href="blob.url" target="_blank" rel="noopener">Download {{ blob.filename }}</a>
        <figcaption>
          <span>{{ blob.filename }}</span>
          <a class="result-viewer__open" :href="blob.url" target="_blank" rel="noopener" title="Open in new tab">↗</a>
        </figcaption>
      </figure>
    </div>

    <p v-else-if="workflow.status === 'succeeded'" class="result-viewer__empty">
      Workflow finished — no media outputs detected. See raw JSON below.
    </p>

    <button
      type="button"
      class="result-viewer__toggle"
      @click="showJson = !showJson"
    >
      {{ showJson ? 'Hide' : 'Show' }} raw JSON
    </button>

    <pre v-if="showJson" class="result-viewer__json"><code>{{ jsonText }}</code></pre>
  </div>
</template>

<style scoped>
.result-viewer { margin-top: 0.75rem; }

.result-viewer__meta {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.8rem; color: var(--vp-c-text-2);
  margin-bottom: 0.5rem;
}
.result-viewer__id { font-family: var(--vp-font-family-mono); font-size: 0.75rem; }

.result-viewer__pill {
  padding: 0.15rem 0.5rem; border-radius: 999px;
  font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
  background: var(--vp-c-bg-soft); color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
}
.result-viewer__pill[data-status="succeeded"] { color: #137333; border-color: #cdeed4; background: #ecfdf3; }
.result-viewer__pill[data-status="failed"],
.result-viewer__pill[data-status="expired"],
.result-viewer__pill[data-status="canceled"] { color: #b42318; border-color: #fecdca; background: #fef3f2; }
.dark .result-viewer__pill[data-status="succeeded"] { background: rgba(19,115,51,.18); border-color: rgba(19,115,51,.4); color: #6ee7b7; }
.dark .result-viewer__pill[data-status="failed"],
.dark .result-viewer__pill[data-status="expired"],
.dark .result-viewer__pill[data-status="canceled"] { background: rgba(180,35,24,.18); border-color: rgba(180,35,24,.4); color: #fca5a5; }

.result-viewer__grid {
  display: grid; gap: 0.75rem;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.result-viewer__item {
  margin: 0; padding: 0.5rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.5rem;
  display: flex; flex-direction: column; gap: 0.4rem;
}
.result-viewer__item img,
.result-viewer__item video {
  width: 100%; height: auto; display: block; border-radius: 0.25rem;
  background: #000;
}
.result-viewer__item audio { width: 100%; }
.result-viewer__item figcaption {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.72rem; color: var(--vp-c-text-2);
  word-break: break-all;
}
.result-viewer__open { text-decoration: none; padding: 0 0.3rem; }

.result-viewer__empty {
  margin: 0.5rem 0;
  font-size: 0.85rem; color: var(--vp-c-text-2);
}

.result-viewer__toggle {
  margin-top: 0.75rem;
  padding: 0.3rem 0.7rem;
  font-size: 0.75rem;
  background: transparent;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.375rem;
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.result-viewer__toggle:hover { border-color: var(--vp-c-brand-1); }

.result-viewer__json {
  margin-top: 0.5rem;
  padding: 0.75rem;
  font-size: 0.75rem;
  max-height: 24rem;
  overflow: auto;
  background: var(--vp-code-block-bg);
  border-radius: 0.5rem;
}
</style>
