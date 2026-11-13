<script setup lang="ts">
import { inject } from 'vue';
// The size limits of a platform feedback report, from `public/appblocks/platform-feedback.json`
// (scripts/gen-appblocks-platform-feedback.mjs, which reads them from the CLI's source). The
// .md fallback region (scripts/appblocks-md.mjs `renderPlatformFeedback`) renders the same
// rows, so the two channels cannot disagree about a number.
import { inlineCodeSegments } from './storageReference.shared.mjs';

interface LimitRow { item: string; value: string }
interface PlatformFeedbackData { limits: LimitRow[] }

const data = inject<PlatformFeedbackData>('appblocks:platform-feedback', { limits: [] });
const limits = data.limits ?? [];
const seg = inlineCodeSegments;
</script>

<template>
  <div class="ab-platform-feedback">
    <table v-if="limits.length">
      <thead>
        <tr><th>Limit</th><th>Value</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in limits" :key="r.item">
          <td><template v-for="(s, i) in seg(r.item)" :key="i"><code v-if="s.code">{{ s.text }}</code><template v-else>{{ s.text }}</template></template></td>
          <td><template v-for="(s, i) in seg(r.value)" :key="i"><code v-if="s.code">{{ s.text }}</code><template v-else>{{ s.text }}</template></template></td>
        </tr>
      </tbody>
    </table>
    <p v-else class="ab-empty">
      No platform feedback limits generated. Run <code>npm run gen:appblocks</code>.
    </p>
  </div>
</template>

<style scoped>
.ab-platform-feedback { overflow-x: auto; }
.ab-empty { color: var(--vp-c-text-3); font-style: italic; }
</style>
