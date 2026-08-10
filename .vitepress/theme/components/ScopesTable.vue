<script setup lang="ts">
import { inject } from 'vue';

interface Scope {
  scope: string;
  description: string;
  oauthBit: string | null;
  binding: string;
}
interface ScopesData {
  scopes: Scope[];
  sources?: string[];
}

const data = inject<ScopesData>('appblocks:scopes', { scopes: [] });
const scopes = data.scopes ?? [];
</script>

<template>
  <div class="ab-scopes">
    <table>
      <thead>
        <tr>
          <th>Scope</th>
          <th>What it authorizes</th>
          <th>OAuth bit</th>
          <th>Binding</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in scopes" :key="s.scope">
          <td><code>{{ s.scope }}</code></td>
          <td>{{ s.description }}</td>
          <td>
            <code v-if="s.oauthBit">{{ s.oauthBit }}</code>
            <span v-else class="ab-muted" title="No OAuth bit — gated by another mechanism">—</span>
          </td>
          <td class="ab-binding">{{ s.binding }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!scopes.length" class="ab-empty">
      No scopes generated. Run <code>npm run gen:appblocks</code>.
    </p>
  </div>
</template>

<style scoped>
.ab-scopes { overflow-x: auto; }
.ab-binding { font-size: 0.85em; color: var(--vp-c-text-2); }
.ab-muted { color: var(--vp-c-text-3); }
.ab-empty { color: var(--vp-c-text-3); font-style: italic; }
</style>
