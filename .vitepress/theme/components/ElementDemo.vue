<script setup lang="ts">
/**
 * Live demo of `<civitai-*>` custom elements. The preview is rendered from the
 * text of the #html code block, and the optional #js block is run against it,
 * so what a reader copies is exactly what is on screen.
 *
 * The #js code runs with `document` bound to the preview container, so a snippet
 * written as `document.querySelector(...)` reaches only its own demo.
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import { useData } from 'vitepress';

const props = defineProps<{
  title: string;
  /** Tag names shown as chips in the header. */
  tags?: string;
  /** Also define the elements that act through @civitai/sdk. */
  sdk?: boolean;
}>();

const { isDark } = useData();
// SSR always renders light, and hydration does not patch a mismatched attribute.
const mounted = ref(false);
const theme = computed(() => (mounted.value && isDark.value ? 'dark' : 'light'));
const tagList = computed(() => (props.tags ?? '').split(/[\s,]+/).filter(Boolean));

const preview = ref<HTMLElement | null>(null);
const htmlSlot = ref<HTMLElement | null>(null);
const jsSlot = ref<HTMLElement | null>(null);
const error = ref('');

const codeOf = (el: HTMLElement | null) => el?.querySelector('pre code')?.textContent ?? '';

onMounted(async () => {
  // Custom elements extend HTMLElement, which does not exist during SSR.
  await import('@civitai/components/register-site');
  if (props.sdk) {
    await Promise.all([
      import('@civitai/components/civitai-sign-in-button/define'),
      import('@civitai/components/civitai-workflow-button/define'),
    ]);
  }
  mounted.value = true;
  await nextTick();
  if (!preview.value) return;
  preview.value.innerHTML = codeOf(htmlSlot.value);
  const js = codeOf(jsSlot.value);
  if (!js) return;
  try {
    new Function('document', js)(preview.value);
  } catch (e) {
    error.value = String(e);
  }
});
</script>

<template>
  <div class="cds-demo">
    <div class="cds-demo__header">
      <span class="cds-demo__title">
        {{ title }}
        <code v-for="tag in tagList" :key="tag" class="cds-demo__tag">&lt;{{ tag }}&gt;</code>
      </span>
      <span class="cds-demo__theme">{{ theme }}</span>
    </div>

    <div ref="preview" class="cds-preview cds-element-preview" :data-theme="theme" />
    <p v-if="error" class="cds-demo__error">{{ error }}</p>

    <div ref="htmlSlot" class="cds-demo__code">
      <slot name="html" />
    </div>
    <div v-if="$slots.js" ref="jsSlot" class="cds-demo__code">
      <slot name="js" />
    </div>
  </div>
</template>
