<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAuthToken } from '../composables/useAuthToken';

const props = withDefaults(
  defineProps<{
    kind: 'json' | 'cli' | 'header';
    serverName?: string;
  }>(),
  { serverName: 'civitai-orchestration' }
);

const PLACEHOLDER = 'YOUR_CIVITAI_API_KEY';
const URL = 'https://orchestration.civitai.com/mcp';

const { token, hasToken } = useAuthToken();
const tokenValue = computed(() => token.value || PLACEHOLDER);

const code = computed(() => {
  if (props.kind === 'json') {
    return [
      '{',
      '  "mcpServers": {',
      `    "${props.serverName}": {`,
      `      "url": "${URL}",`,
      '      "headers": {',
      `        "Authorization": "Bearer ${tokenValue.value}"`,
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n');
  }
  if (props.kind === 'cli') {
    return [
      `claude mcp add ${props.serverName} ${URL} \\`,
      '  --transport http \\',
      `  --header "Authorization: Bearer ${tokenValue.value}"`,
    ].join('\n');
  }
  return `Authorization: Bearer ${tokenValue.value}`;
});

const lang = computed(() =>
  props.kind === 'json' ? 'json' : props.kind === 'cli' ? 'bash' : 'http'
);

const copied = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(code.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <div class="mcp-config-block">
    <div class="mcp-config-block__bar">
      <span class="mcp-config-block__lang">{{ lang }}</span>
      <span
        v-if="hasToken"
        class="mcp-config-block__badge mcp-config-block__badge--ok"
        title="Filled with the token from your navbar — only visible to you in this browser"
      >
        ✓ filled with your token
      </span>
      <span
        v-else
        class="mcp-config-block__badge mcp-config-block__badge--muted"
        title="Set your Civitai API token in the navbar to auto-fill these snippets"
      >
        set token in navbar to auto-fill
      </span>
      <button class="mcp-config-block__copy" type="button" @click="copy">
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </div>
    <pre class="mcp-config-block__pre"><code>{{ code }}</code></pre>
  </div>
</template>

<style scoped>
.mcp-config-block {
  margin: 16px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-code-block-bg, var(--vp-c-bg-alt));
  overflow: hidden;
  font-size: 0.875rem;
}
.mcp-config-block__bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}
.mcp-config-block__lang {
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  letter-spacing: 0.05em;
}
.mcp-config-block__badge {
  margin-left: auto;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  line-height: 1.2;
}
.mcp-config-block__badge--ok {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
.mcp-config-block__badge--muted {
  background: transparent;
  color: var(--vp-c-text-3);
  border: 1px dashed var(--vp-c-divider);
}
.mcp-config-block__copy {
  padding: 0.2rem 0.6rem;
  font-size: 0.72rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.3rem;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.mcp-config-block__copy:hover { border-color: var(--vp-c-brand-1); }
.mcp-config-block__pre {
  margin: 0;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  background: transparent;
}
.mcp-config-block__pre code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
  color: var(--vp-c-text-1);
  white-space: pre;
}
</style>
