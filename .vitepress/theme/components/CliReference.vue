<script setup lang="ts">
import { inject } from 'vue';

interface CliOption { flags: string; description: string; default: string | null; }
interface CliCommand {
  command: string;
  args: string;
  description: string;
  options: CliOption[];
  status: string;
}
interface CliData {
  program?: { name: string; description: string; version: string };
  commands: CliCommand[];
}

const data = inject<CliData>('appblocks:cli', { commands: [] });
const commands = data.commands ?? [];
const bin = data.program?.name ?? 'civitai';

// A short, human badge for any non-stable command status.
const STATUS_LABELS: Record<string, string> = {
  'coming-soon': 'coming soon',
  gated: 'invite-only',
  experimental: 'experimental',
};
function badgeLabel(status: string): string | null {
  if (!status || status === 'stable' || status === 'available') return null;
  return STATUS_LABELS[status] ?? status;
}
</script>

<template>
  <div class="ab-cli">
    <section v-for="c in commands" :key="c.command" class="ab-cmd">
      <h3 :id="`cli-${c.command}`">
        <code>{{ bin }} {{ c.command }}<template v-if="c.args"> {{ c.args }}</template></code>
        <span v-if="badgeLabel(c.status)" class="ab-badge ab-soon">{{ badgeLabel(c.status) }}</span>
      </h3>
      <p class="ab-desc">{{ c.description.replace(/\s*\[coming soon\]\s*$/i, '') }}</p>
      <table v-if="c.options.length">
        <thead>
          <tr><th>Flag</th><th>Description</th><th>Default</th></tr>
        </thead>
        <tbody>
          <tr v-for="o in c.options" :key="o.flags">
            <td><code>{{ o.flags }}</code></td>
            <td>{{ o.description }}</td>
            <td><code v-if="o.default">{{ o.default }}</code><span v-else class="ab-muted">—</span></td>
          </tr>
        </tbody>
      </table>
    </section>
    <p v-if="!commands.length" class="ab-empty">
      No CLI reference generated. Run <code>npm run gen:appblocks</code>.
    </p>
  </div>
</template>

<style scoped>
.ab-cmd { margin: 1.5rem 0; }
.ab-cmd h3 { display: flex; align-items: center; gap: 0.6rem; }
.ab-badge {
  padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.7rem;
  text-transform: uppercase; letter-spacing: 0.03em; font-weight: 600;
}
.ab-soon { background: var(--vp-c-warning-soft); color: var(--vp-c-warning-1); }
.ab-desc { margin: 0.4rem 0 0.6rem; }
.ab-muted { color: var(--vp-c-text-3); }
.ab-empty { color: var(--vp-c-text-3); font-style: italic; }
</style>
