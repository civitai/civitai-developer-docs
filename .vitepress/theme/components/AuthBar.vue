<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useAuthToken } from '../composables/useAuthToken';

const { hasToken, masked, setToken, clearToken, token } = useAuthToken();

const open = ref(false);
const draft = ref('');
const inputEl = ref<HTMLInputElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);

function toggle() {
  open.value = !open.value;
  if (open.value) {
    draft.value = token.value ?? '';
    setTimeout(() => inputEl.value?.focus(), 0);
  }
}

function save() {
  setToken(draft.value);
  open.value = false;
}

function clear() {
  clearToken();
  draft.value = '';
  open.value = false;
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return;
  const target = e.target as Node;
  if (rootEl.value && !rootEl.value.contains(target)) open.value = false;
}

onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div class="auth-bar" ref="rootEl">
    <button
      class="auth-bar__pill"
      :class="{ 'auth-bar__pill--set': hasToken }"
      type="button"
      :title="hasToken ? 'API token is set — click to manage' : 'Set your Civitai API token to enable Try It'"
      @click.stop="toggle"
    >
      <span class="auth-bar__dot" />
      Token: {{ masked }}
    </button>

    <div v-if="open" class="auth-bar__popover" @click.stop>
      <label class="auth-bar__label" for="auth-bar-input">Civitai API token</label>
      <input
        id="auth-bar-input"
        ref="inputEl"
        v-model="draft"
        type="password"
        placeholder="Paste your Bearer token"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter="save"
        @keydown.escape="open = false"
      />
      <p class="auth-bar__hint">
        Stored in your browser's localStorage. Only sent to Civitai domains
        (<code>orchestration.civitai.com</code>, <code>civitai.com</code>)
        from the interactive widgets on this site.
      </p>
      <div class="auth-bar__actions">
        <button type="button" class="auth-bar__btn" @click="open = false">Cancel</button>
        <button v-if="hasToken" type="button" class="auth-bar__btn auth-bar__btn--ghost" @click="clear">Clear</button>
        <button type="button" class="auth-bar__btn auth-bar__btn--primary" @click="save">Save</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-bar { position: relative; display: inline-flex; align-items: center; margin-right: 0.5rem; }

.auth-bar__pill {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.25rem 0.6rem;
  font-size: 0.78rem; line-height: 1.4;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: border-color .15s, color .15s, background .15s;
}
.auth-bar__pill:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-text-1); }
.auth-bar__pill--set { border-color: var(--vp-c-brand-soft); color: var(--vp-c-text-1); }

.auth-bar__dot {
  width: 0.5rem; height: 0.5rem; border-radius: 50%;
  background: var(--vp-c-text-3);
}
.auth-bar__pill--set .auth-bar__dot { background: var(--vp-c-brand-1); }

.auth-bar__popover {
  position: absolute; top: calc(100% + 0.5rem); right: 0;
  z-index: 50;
  width: 22rem;
  padding: 1rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.5rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}
.auth-bar__label {
  display: block;
  font-size: 0.78rem; font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 0.4rem;
}
.auth-bar__popover input {
  box-sizing: border-box;
  width: 100%;
  padding: 0.45rem 0.6rem;
  font: inherit; font-size: 0.85rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.375rem;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}
.auth-bar__popover input:focus {
  outline: none; border-color: var(--vp-c-brand-1);
}
.auth-bar__hint {
  margin: 0.5rem 0 0.75rem;
  font-size: 0.72rem; color: var(--vp-c-text-2);
  overflow-wrap: anywhere;
}
.auth-bar__hint code { font-size: 0.72rem; overflow-wrap: anywhere; }

.auth-bar__actions {
  display: flex; justify-content: flex-end; gap: 0.4rem;
}
.auth-bar__btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.auth-bar__btn:hover { border-color: var(--vp-c-brand-1); }
.auth-bar__btn--ghost { color: var(--vp-c-text-2); }
.auth-bar__btn--primary {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}
.auth-bar__btn--primary:hover { background: var(--vp-c-brand-2); border-color: var(--vp-c-brand-2); }

@media (max-width: 640px) {
  .auth-bar__popover { right: -0.5rem; width: 18rem; }
}
</style>
