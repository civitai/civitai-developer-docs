<script setup lang="ts">
import { computed, inject } from 'vue';

interface Message {
  name: string;
  family: string;
  direction: 'block-to-host' | 'host-to-block';
  request: boolean;
  reply: string | null;
  replyPayload: string | null;
  pageOnly: boolean;
  slotNote: string | null;
  payload: string | null;
  payloadOptional: boolean;
}
interface MessagesData { messages: Message[]; sdkPackage?: string; }

const FAMILY_LABELS: Record<string, string> = {
  lifecycle: 'Lifecycle',
  auth: 'Auth & token',
  workflow: 'Generation workflows',
  subqueue: 'App subqueue',
  buzz: 'Buzz',
  viewer: 'Viewer',
  pickers: 'Pickers & upload',
  storage: 'Per-app storage',
  shared: 'Shared storage',
  wildcard: 'Wildcard packs',
  other: 'Other',
};

const data = inject<MessagesData>('appblocks:messages', { messages: [] });
const messages = data.messages ?? [];

const groups = computed(() => {
  const order: string[] = [];
  const map: Record<string, Message[]> = {};
  for (const m of messages) {
    if (!map[m.family]) { map[m.family] = []; order.push(m.family); }
    map[m.family].push(m);
  }
  return order.map((fam) => ({ family: fam, label: FAMILY_LABELS[fam] ?? fam, items: map[fam] }));
});
</script>

<template>
  <div class="ab-messages">
    <section v-for="g in groups" :key="g.family" class="ab-family">
      <h3 :id="`msg-${g.family}`">{{ g.label }}</h3>
      <div v-for="m in g.items" :key="m.name" class="ab-msg">
        <div class="ab-msg-head">
          <code class="ab-msg-name">{{ m.name }}</code>
          <span class="ab-badge" :class="m.direction === 'block-to-host' ? 'ab-b2h' : 'ab-h2b'">
            {{ m.direction === 'block-to-host' ? 'block → host' : 'host → block' }}
          </span>
          <span v-if="m.request" class="ab-badge ab-req">request → reply</span>
          <span v-else-if="m.direction === 'block-to-host'" class="ab-badge ab-fnf">fire-and-forget</span>
          <span v-if="m.pageOnly" class="ab-badge ab-page" title="Handled only by the full-page host; not on model slots today">page-only</span>
        </div>
        <div class="ab-msg-body">
          <div class="ab-col">
            <div class="ab-label">payload</div>
            <pre v-if="m.payload"><code>{{ m.payload }}</code></pre>
            <span v-else class="ab-muted">(no payload)</span>
          </div>
          <div v-if="m.reply" class="ab-col">
            <div class="ab-label">reply <code>{{ m.reply }}</code></div>
            <pre v-if="m.replyPayload"><code>{{ m.replyPayload }}</code></pre>
          </div>
        </div>
        <div v-if="m.pageOnly && m.slotNote" class="ab-note">Model slot: {{ m.slotNote }}</div>
      </div>
    </section>
    <p v-if="!messages.length" class="ab-empty">
      No messages generated. Run <code>npm run gen:appblocks</code>.
    </p>
  </div>
</template>

<style scoped>
.ab-family { margin-top: 1.5rem; }
.ab-msg {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin: 0.75rem 0;
  background: var(--vp-c-bg-soft);
}
.ab-msg-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.ab-msg-name { font-weight: 600; }
.ab-badge {
  padding: 0.08rem 0.5rem; border-radius: 999px; font-size: 0.68rem;
  text-transform: uppercase; letter-spacing: 0.03em; font-weight: 600; line-height: 1.5;
}
.ab-b2h { background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }
.ab-h2b { background: var(--vp-c-default-soft); color: var(--vp-c-text-2); }
.ab-req { background: var(--vp-c-tip-soft); color: var(--vp-c-tip-1); }
.ab-fnf { background: var(--vp-c-default-soft); color: var(--vp-c-text-3); }
.ab-page { background: var(--vp-c-warning-soft); color: var(--vp-c-warning-1); }
.ab-msg-body { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 0.5rem; }
.ab-col { flex: 1 1 260px; min-width: 0; }
.ab-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vp-c-text-3); margin-bottom: 0.2rem; }
.ab-col pre {
  margin: 0; padding: 0.6rem 0.8rem; overflow-x: auto;
  background: var(--vp-code-block-bg, var(--vp-c-bg-alt)); border-radius: 6px;
}
.ab-col pre code { font-family: var(--vp-font-family-mono); font-size: 0.8rem; white-space: pre; }
.ab-note { margin-top: 0.5rem; font-size: 0.8rem; color: var(--vp-c-text-2); }
.ab-muted { color: var(--vp-c-text-3); }
.ab-empty { color: var(--vp-c-text-3); font-style: italic; }
</style>
