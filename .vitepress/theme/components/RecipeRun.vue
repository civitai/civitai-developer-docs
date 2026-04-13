<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAuthToken } from '../composables/useAuthToken';
import { useWorkflow } from '../composables/useWorkflow';
import ResultViewer from './ResultViewer.vue';

interface Props {
  body: any;
  method?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE';
  path?: string;
  wait?: number;
}

const props = withDefaults(defineProps<Props>(), {
  method: 'POST',
  path: '/v2/consumer/workflows',
  wait: 90,
});

const { token, hasToken } = useAuthToken();
const wf = useWorkflow();

const showBody = ref(false);
const editing = ref(false);
const bodyText = ref(pretty(props.body));
const parseError = ref<string | null>(null);
const previewed = computed(() => !!wf.preview.value);

watch(() => props.body, (next) => {
  if (!editing.value) bodyText.value = pretty(next);
});

const parsedBody = computed<any>(() => {
  try {
    const v = JSON.parse(bodyText.value);
    parseError.value = null;
    return v;
  } catch (e: any) {
    parseError.value = e?.message ?? 'Invalid JSON';
    return null;
  }
});

const canSubmit = computed(() => {
  if (!hasToken.value || parseError.value !== null) return false;
  if (wf.submitLoading.value) return false;
  if (!previewed.value) return false;
  if (insufficient.value) return false;
  return true;
});

const costRows = computed<Array<{ account: string; amount: number }>>(() => {
  const list = wf.preview.value?.transactions?.list as any[] | undefined;
  if (!Array.isArray(list)) return [];
  const map = new Map<string, number>();
  for (const t of list) {
    if (t?.accountType && typeof t.amount === 'number') {
      map.set(t.accountType, (map.get(t.accountType) ?? 0) + t.amount);
    }
  }
  return Array.from(map.entries()).map(([account, amount]) => ({ account, amount }));
});
const costTotal = computed(() => {
  const c = wf.preview.value?.cost as any;
  return typeof c?.total === 'number' ? c.total : null;
});
const insufficient = computed(() => !!wf.preview.value?.transactions?.insufficientBuzz);

async function onPreview() {
  if (!token.value || parseError.value) return;
  await wf.previewCost(token.value, parsedBody.value, { method: props.method, path: props.path });
}
async function onSubmit() {
  if (!token.value || parseError.value) return;
  await wf.submit(token.value, parsedBody.value, {
    method: props.method,
    path: props.path,
    wait: props.wait,
  });
}
function onReset() {
  wf.reset();
}
function onCancel() {
  wf.cancelPoll();
}
function onRevertBody() {
  bodyText.value = pretty(props.body);
  editing.value = false;
  parseError.value = null;
}

const progressPct = computed(() => Math.round(wf.aggregateProgress.value * 100));
const statusLabel = computed(() => wf.aggregateStatus.value ?? 'idle');

function pretty(v: any): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
function fmtNum(n: number): string {
  return n.toLocaleString();
}
function accountLabel(a: string): string {
  if (a === 'yellow') return 'Yellow Buzz';
  if (a === 'blue') return 'Blue Buzz';
  if (a === 'green') return 'Green Buzz';
  return a;
}
</script>

<template>
  <div class="recipe-run" :class="{ 'recipe-run--running': wf.submitLoading.value || wf.polling.value }">
    <div class="recipe-run__header">
      <div class="recipe-run__endpoint">
        <span class="recipe-run__method" :data-method="method">{{ method }}</span>
        <code>{{ path }}</code>
      </div>
      <div class="recipe-run__actions">
        <button
          type="button"
          class="recipe-run__btn"
          :disabled="!hasToken || !!parseError || wf.previewLoading.value || wf.submitLoading.value"
          @click="onPreview"
        >
          <span v-if="wf.previewLoading.value">Estimating…</span>
          <span v-else>Preview cost</span>
        </button>
        <button
          type="button"
          class="recipe-run__btn recipe-run__btn--primary"
          :disabled="!canSubmit"
          :title="!previewed ? 'Click Preview cost first' : ''"
          @click="onSubmit"
        >
          <span v-if="wf.submitLoading.value">Submitting…</span>
          <span v-else>Submit for real</span>
        </button>
      </div>
    </div>

    <div v-if="!hasToken" class="recipe-run__notice">
      Set your Civitai API token via the <strong>Token</strong> button in the navbar to enable Try It.
    </div>

    <details class="recipe-run__body" :open="showBody" @toggle="showBody = ($event.target as HTMLDetailsElement).open">
      <summary>
        Request body
        <span class="recipe-run__muted">— edit to customize (e.g. swap the image URL or prompt)</span>
      </summary>
      <textarea
        v-model="bodyText"
        class="recipe-run__editor"
        :class="{ 'recipe-run__editor--error': parseError }"
        spellcheck="false"
        rows="12"
        @focus="editing = true"
        @blur="editing = false"
      />
      <div class="recipe-run__body-actions">
        <span v-if="parseError" class="recipe-run__parse-error">JSON: {{ parseError }}</span>
        <span v-else class="recipe-run__muted">Valid JSON</span>
        <button type="button" class="recipe-run__btn recipe-run__btn--ghost" @click="onRevertBody">Revert to example</button>
      </div>
    </details>

    <!-- Cost preview panel -->
    <div v-if="previewed && !wf.workflow.value" class="recipe-run__panel recipe-run__panel--preview">
      <div class="recipe-run__panel-title">Estimated cost</div>
      <table v-if="costRows.length" class="recipe-run__cost">
        <tbody>
          <tr v-for="row in costRows" :key="row.account">
            <td>{{ accountLabel(row.account) }}</td>
            <td class="recipe-run__num">{{ fmtNum(row.amount) }}</td>
          </tr>
          <tr v-if="costTotal !== null" class="recipe-run__cost-total">
            <td>Total</td>
            <td class="recipe-run__num">{{ fmtNum(costTotal) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="costTotal !== null">
        Total: <strong>{{ fmtNum(costTotal) }}</strong> Buzz
      </p>
      <p v-else class="recipe-run__muted">No cost breakdown returned.</p>
      <p v-if="insufficient" class="recipe-run__warn">
        Insufficient Buzz on your account. Submit blocked.
      </p>
    </div>

    <!-- Progress / polling -->
    <div v-if="wf.workflow.value && !wf.isTerminal.value" class="recipe-run__panel">
      <div class="recipe-run__panel-title">
        Status: <span class="recipe-run__status" :data-status="statusLabel">{{ statusLabel }}</span>
        <span v-if="wf.polling.value" class="recipe-run__muted"> — polling every few seconds</span>
      </div>
      <div class="recipe-run__bar">
        <div class="recipe-run__bar-fill" :style="{ width: `${progressPct}%` }" />
      </div>
      <div class="recipe-run__panel-actions">
        <button type="button" class="recipe-run__btn recipe-run__btn--ghost" @click="onCancel">
          Stop polling
        </button>
        <span class="recipe-run__muted">(client-side only — workflow keeps running on the server)</span>
      </div>
    </div>

    <!-- Error -->
    <div v-if="wf.error.value" class="recipe-run__panel recipe-run__panel--error">
      <div class="recipe-run__panel-title">Error <span v-if="wf.error.value.status">({{ wf.error.value.status }})</span></div>
      <p>{{ wf.error.value.message }}</p>
      <div v-if="wf.error.value.problem?.errors" class="recipe-run__errors">
        <div v-for="(messages, field) in wf.error.value.problem.errors" :key="field">
          <code>{{ field }}</code>
          <ul><li v-for="m in messages" :key="m">{{ m }}</li></ul>
        </div>
      </div>
    </div>

    <!-- Result -->
    <ResultViewer v-if="wf.workflow.value && wf.isTerminal.value" :workflow="wf.workflow.value" />

    <div v-if="wf.workflow.value || wf.preview.value || wf.error.value" class="recipe-run__footer">
      <button type="button" class="recipe-run__btn recipe-run__btn--ghost" @click="onReset">Reset</button>
    </div>
  </div>
</template>

<style scoped>
.recipe-run {
  margin: 1rem 0 1.5rem;
  padding: 0.85rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.5rem;
  background: var(--vp-c-bg-soft);
}
.recipe-run--running { border-color: var(--vp-c-brand-soft); }

.recipe-run__header {
  display: flex; flex-wrap: wrap; gap: 0.5rem;
  align-items: center; justify-content: space-between;
}
.recipe-run__endpoint {
  display: inline-flex; align-items: center; gap: 0.5rem;
  font-family: var(--vp-font-family-mono); font-size: 0.78rem;
}
.recipe-run__endpoint code { font-size: 0.78rem; padding: 0.1rem 0.4rem; }

.recipe-run__method {
  padding: 0.15rem 0.45rem; border-radius: 0.25rem;
  font-weight: 700; font-size: 0.7rem;
  background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1);
}
.recipe-run__method[data-method="GET"] { background: rgba(34,139,34,.12); color: #228b22; }
.recipe-run__method[data-method="POST"] { background: rgba(14,165,233,.12); color: var(--vp-c-brand-1); }
.recipe-run__method[data-method="PUT"],
.recipe-run__method[data-method="PATCH"] { background: rgba(217,119,6,.12); color: #d97706; }
.recipe-run__method[data-method="DELETE"] { background: rgba(220,38,38,.12); color: #dc2626; }

.recipe-run__actions { display: inline-flex; gap: 0.4rem; }

.recipe-run__btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.375rem;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.recipe-run__btn:hover:not(:disabled) { border-color: var(--vp-c-brand-1); }
.recipe-run__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.recipe-run__btn--primary {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}
.recipe-run__btn--primary:hover:not(:disabled) {
  background: var(--vp-c-brand-2); border-color: var(--vp-c-brand-2);
}
.recipe-run__btn--ghost { background: transparent; }

.recipe-run__notice {
  margin-top: 0.6rem;
  padding: 0.5rem 0.65rem;
  font-size: 0.78rem;
  background: var(--vp-c-bg);
  border: 1px dashed var(--vp-c-divider);
  border-radius: 0.375rem;
  color: var(--vp-c-text-2);
}
.recipe-run__notice--info { border-style: solid; border-color: var(--vp-c-brand-soft); }

.recipe-run__body {
  margin-top: 0.6rem;
  font-size: 0.78rem;
}
.recipe-run__body summary { cursor: pointer; color: var(--vp-c-text-1); }
.recipe-run__body summary .recipe-run__muted { font-weight: 400; }

.recipe-run__editor {
  display: block;
  width: 100%;
  margin-top: 0.4rem;
  padding: 0.6rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  background: var(--vp-code-block-bg);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.375rem;
  resize: vertical;
  min-height: 8rem;
}
.recipe-run__editor:focus { outline: none; border-color: var(--vp-c-brand-1); }
.recipe-run__editor--error { border-color: #dc2626; }

.recipe-run__body-actions {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 0.4rem;
  font-size: 0.72rem;
}
.recipe-run__parse-error { color: #dc2626; }
.dark .recipe-run__parse-error { color: #fca5a5; }

.recipe-run__panel {
  margin-top: 0.75rem;
  padding: 0.65rem 0.75rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.375rem;
}
.recipe-run__panel--preview { border-color: var(--vp-c-brand-soft); }
.recipe-run__panel--error { border-color: #fecdca; background: #fef3f2; color: #991b1b; }
.dark .recipe-run__panel--error { background: rgba(180,35,24,.12); color: #fca5a5; border-color: rgba(180,35,24,.3); }
.recipe-run__panel-title { font-size: 0.78rem; font-weight: 600; margin-bottom: 0.4rem; }
.recipe-run__panel-actions { margin-top: 0.5rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

.recipe-run__cost { width: 100%; font-size: 0.78rem; border-collapse: collapse; }
.recipe-run__cost td { padding: 0.2rem 0; }
.recipe-run__cost .recipe-run__num { text-align: right; font-variant-numeric: tabular-nums; }
.recipe-run__cost-total td { border-top: 1px solid var(--vp-c-divider); font-weight: 600; padding-top: 0.4rem; }

.recipe-run__bar {
  height: 0.4rem; border-radius: 999px;
  background: var(--vp-c-bg-alt); overflow: hidden;
}
.recipe-run__bar-fill {
  height: 100%; background: var(--vp-c-brand-1);
  transition: width .3s ease;
}

.recipe-run__status {
  font-family: var(--vp-font-family-mono); font-size: 0.75rem;
}
.recipe-run__muted { color: var(--vp-c-text-2); font-size: 0.75rem; }
.recipe-run__warn { color: #b42318; font-size: 0.78rem; margin-top: 0.4rem; }
.dark .recipe-run__warn { color: #fca5a5; }

.recipe-run__errors { margin-top: 0.5rem; font-size: 0.78rem; }
.recipe-run__errors code { font-size: 0.75rem; }
.recipe-run__errors ul { margin: 0.2rem 0 0.4rem 1rem; }

.recipe-run__footer {
  margin-top: 0.75rem;
  display: flex; justify-content: flex-end;
}
</style>
