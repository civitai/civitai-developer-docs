<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAuthToken } from '../composables/useAuthToken';

type Highlighter = { codeToHtml: (code: string, opts: any) => string };
let highlighterPromise: Promise<Highlighter | null> | null = null;

function getHighlighter(): Promise<Highlighter | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!highlighterPromise) {
    highlighterPromise = import('shiki')
      .then((m) =>
        m.createHighlighter({
          themes: ['github-light', 'github-dark'],
          langs: ['json'],
        })
      )
      .catch(() => null) as Promise<Highlighter | null>;
  }
  return highlighterPromise;
}

interface Props {
  path: string;
  query?: Record<string, string | number | boolean>;
  auth?: boolean;
  requireAuth?: boolean;
  base?: string;
}

const props = withDefaults(defineProps<Props>(), {
  auth: false,
  requireAuth: false,
  base: 'https://civitai.com',
});

const { token, hasToken } = useAuthToken();

const withAuth = ref(props.auth || props.requireAuth);

const initialUrl = computed(() => {
  const qs = props.query
    ? '?' + Object.entries(props.query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `${props.base}${props.path}${qs}`;
});

const url = ref(initialUrl.value);
const editing = ref(false);

watch(initialUrl, (next) => {
  if (!editing.value) url.value = next;
});

type Result =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; status: number; ms: number; body: unknown; bodyText: string }
  | { state: 'error'; status?: number; ms?: number; message: string; bodyText?: string };

const result = ref<Result>({ state: 'idle' });
const copyFeedback = ref<string | null>(null);
const highlightedHtml = ref<string | null>(null);

async function send() {
  if (props.requireAuth && !hasToken.value) {
    result.value = {
      state: 'error',
      message: 'This endpoint requires authentication. Set a token via the Token button in the navbar.',
    };
    return;
  }

  result.value = { state: 'loading' };
  const started = performance.now();
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (withAuth.value && token.value) {
      headers.Authorization = `Bearer ${token.value}`;
    }
    const res = await fetch(url.value, { headers });
    const ms = Math.round(performance.now() - started);
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch {}
    if (!res.ok) {
      result.value = {
        state: 'error',
        status: res.status,
        ms,
        message: res.statusText || 'Request failed',
        bodyText: text,
      };
    } else {
      result.value = {
        state: 'success',
        status: res.status,
        ms,
        body,
        bodyText: typeof body === 'string' ? text : JSON.stringify(body, null, 2),
      };
    }
  } catch (e: any) {
    result.value = {
      state: 'error',
      message: e?.message ?? String(e),
    };
  }
}

function reset() {
  result.value = { state: 'idle' };
  url.value = initialUrl.value;
}

async function copyResponse() {
  if (result.value.state !== 'success' && result.value.state !== 'error') return;
  const text = (result.value as any).bodyText;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyFeedback.value = 'Copied';
    setTimeout(() => { copyFeedback.value = null; }, 1200);
  } catch {
    copyFeedback.value = 'Copy failed';
    setTimeout(() => { copyFeedback.value = null; }, 1200);
  }
}

const preview = computed(() => {
  if (result.value.state === 'success') {
    const text = result.value.bodyText;
    return text.length > 12000 ? text.slice(0, 12000) + '\n\n/* …truncated — copy to see full response */' : text;
  }
  if (result.value.state === 'error' && result.value.bodyText) {
    const text = result.value.bodyText;
    return text.length > 12000 ? text.slice(0, 12000) + '\n\n/* …truncated — copy to see full response */' : text;
  }
  return '';
});

function looksLikeJson(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith('{') || t.startsWith('[');
}

watch(preview, async (text) => {
  highlightedHtml.value = null;
  if (!text || !looksLikeJson(text)) return;
  const hl = await getHighlighter();
  if (!hl) return;
  if (preview.value !== text) return;
  try {
    highlightedHtml.value = hl.codeToHtml(text, {
      lang: 'json',
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    });
  } catch {
    highlightedHtml.value = null;
  }
}, { immediate: true });

const statusColor = computed(() => {
  if (result.value.state === 'success') return 'ok';
  if (result.value.state === 'error') {
    const s = (result.value as any).status as number | undefined;
    if (s && s >= 400 && s < 500) return 'warn';
    return 'err';
  }
  return '';
});
</script>

<template>
  <div class="api-try">
    <div class="api-try__header">
      <span class="api-try__method">GET</span>
      <input
        v-model="url"
        class="api-try__url"
        spellcheck="false"
        @focus="editing = true"
        @blur="editing = false"
      />
      <button type="button" class="api-try__btn api-try__btn--primary" :disabled="result.state === 'loading'" @click="send">
        <span v-if="result.state === 'loading'">Sending…</span>
        <span v-else>Send</span>
      </button>
    </div>

    <div class="api-try__controls">
      <label class="api-try__check">
        <input type="checkbox" v-model="withAuth" :disabled="requireAuth" />
        <span>Include <code>Authorization: Bearer ...</code></span>
        <span v-if="withAuth && !hasToken" class="api-try__muted">(no token set — use the navbar Token button)</span>
      </label>
      <button v-if="result.state !== 'idle'" type="button" class="api-try__btn api-try__btn--ghost" @click="reset">Reset</button>
    </div>

    <div v-if="result.state === 'success'" class="api-try__panel api-try__panel--ok">
      <div class="api-try__panel-head">
        <span class="api-try__status" :data-kind="statusColor">{{ result.status }}</span>
        <span class="api-try__muted">{{ result.ms }}ms</span>
        <button type="button" class="api-try__btn api-try__btn--ghost" @click="copyResponse">
          {{ copyFeedback ?? 'Copy' }}
        </button>
      </div>
      <div v-if="highlightedHtml" class="api-try__code api-try__code--shiki" v-html="highlightedHtml" />
      <pre v-else class="api-try__code"><code>{{ preview }}</code></pre>
    </div>

    <div v-else-if="result.state === 'error'" class="api-try__panel api-try__panel--err">
      <div class="api-try__panel-head">
        <span v-if="result.status" class="api-try__status" :data-kind="statusColor">{{ result.status }}</span>
        <span v-if="result.ms !== undefined" class="api-try__muted">{{ result.ms }}ms</span>
        <span class="api-try__err-msg">{{ result.message }}</span>
        <button v-if="result.bodyText" type="button" class="api-try__btn api-try__btn--ghost" @click="copyResponse">
          {{ copyFeedback ?? 'Copy' }}
        </button>
      </div>
      <div v-if="result.bodyText && highlightedHtml" class="api-try__code api-try__code--shiki" v-html="highlightedHtml" />
      <pre v-else-if="result.bodyText" class="api-try__code"><code>{{ result.bodyText }}</code></pre>
    </div>
  </div>
</template>

<style scoped>
.api-try {
  margin: 0.75rem 0 1rem;
  padding: 0.65rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.5rem;
  background: var(--vp-c-bg-soft);
  font-size: 0.8rem;
}
.api-try__header {
  display: flex; gap: 0.4rem; align-items: center;
}
.api-try__method {
  padding: 0.15rem 0.45rem;
  border-radius: 0.25rem;
  font-family: var(--vp-font-family-mono);
  font-weight: 700;
  font-size: 0.7rem;
  background: rgba(34,139,34,.12);
  color: #228b22;
  flex-shrink: 0;
}
.api-try__url {
  flex: 1 1 auto; min-width: 0;
  padding: 0.35rem 0.5rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.375rem;
  background: var(--vp-code-block-bg);
  color: var(--vp-c-text-1);
}
.api-try__url:focus { outline: none; border-color: var(--vp-c-brand-1); }

.api-try__btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.375rem;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  white-space: nowrap;
}
.api-try__btn:hover:not(:disabled) { border-color: var(--vp-c-brand-1); }
.api-try__btn:disabled { cursor: not-allowed; opacity: 0.55; }
.api-try__btn--primary {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}
.api-try__btn--primary:hover:not(:disabled) {
  background: var(--vp-c-brand-2); border-color: var(--vp-c-brand-2);
}
.api-try__btn--ghost { background: transparent; }

.api-try__controls {
  display: flex; justify-content: space-between; align-items: center;
  gap: 0.5rem; flex-wrap: wrap;
  margin-top: 0.5rem;
  font-size: 0.72rem;
}
.api-try__check {
  display: inline-flex; align-items: center; gap: 0.35rem;
  color: var(--vp-c-text-2);
}
.api-try__check code { font-size: 0.7rem; padding: 0 0.25rem; }

.api-try__panel {
  margin-top: 0.6rem;
  padding: 0.55rem 0.65rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.375rem;
}
.api-try__panel--ok { border-color: var(--vp-c-brand-soft); }
.api-try__panel--err { border-color: #fecdca; background: #fef3f2; color: #991b1b; }
.dark .api-try__panel--err { background: rgba(180,35,24,.12); color: #fca5a5; border-color: rgba(180,35,24,.3); }

.api-try__panel-head {
  display: flex; gap: 0.5rem; align-items: center;
  margin-bottom: 0.4rem; flex-wrap: wrap;
}
.api-try__status {
  padding: 0.1rem 0.4rem; border-radius: 0.25rem;
  font-family: var(--vp-font-family-mono);
  font-weight: 600; font-size: 0.7rem;
  background: var(--vp-c-bg-alt);
}
.api-try__status[data-kind="ok"] { background: rgba(34,139,34,.15); color: #15803d; }
.dark .api-try__status[data-kind="ok"] { color: #86efac; }
.api-try__status[data-kind="warn"] { background: rgba(217,119,6,.15); color: #b45309; }
.dark .api-try__status[data-kind="warn"] { color: #fbbf24; }
.api-try__status[data-kind="err"] { background: rgba(220,38,38,.15); color: #b91c1c; }
.dark .api-try__status[data-kind="err"] { color: #fca5a5; }

.api-try__muted { color: var(--vp-c-text-2); font-size: 0.72rem; }
.api-try__err-msg { font-size: 0.78rem; }

.api-try__code {
  margin: 0;
  max-height: 24rem;
  overflow: auto;
  padding: 0.55rem 0.65rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  line-height: 1.5;
  background: var(--vp-code-block-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.375rem;
  white-space: pre;
}
.api-try__code code { background: none; padding: 0; font-size: inherit; }

/* Shiki output lives inside api-try__code--shiki as raw HTML.
   Strip shiki's own padding/background and inherit the wrapper's sizing. */
.api-try__code--shiki { padding: 0; }
.api-try__code--shiki :deep(pre.shiki) {
  margin: 0;
  padding: 0.55rem 0.65rem;
  background: transparent !important;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}
.api-try__code--shiki :deep(code) { background: none; padding: 0; font-size: inherit; }

/* Light/dark theme toggle — with defaultColor: false, shiki emits the
   light theme color in `color:` and the dark theme in `--shiki-dark`. */
.dark .api-try__code--shiki :deep(.shiki),
.dark .api-try__code--shiki :deep(.shiki span) {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
  font-style: var(--shiki-dark-font-style) !important;
  font-weight: var(--shiki-dark-font-weight) !important;
  text-decoration: var(--shiki-dark-text-decoration) !important;
}
</style>
