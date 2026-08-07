<script setup lang="ts">
import { inject } from 'vue';
// Plain-.mjs helpers (typed by cliReference.shared.d.mts), shared with the
// PR-blocking gate in scripts/test-appblocks-cli.mjs — which runs under bare
// `node` and so cannot import a `.vue` SFC.
import { cliAnchorId, cliHeadingTag } from './cliReference.shared.mjs';

interface CliOption { flags: string; description: string; default: string | null; }
interface CliCommand {
  command: string;
  args: string;
  description: string;
  options: CliOption[];
  // Verbatim lines of the cobra `Examples:` block. Always present; empty for a
  // command whose help carries no examples.
  examples?: string[];
  status: string;
}
interface CliData {
  program?: { name: string; description: string; version: string; globalOptions?: CliOption[] };
  commands: CliCommand[];
}

const data = inject<CliData>('appblocks:cli', { commands: [] });
const commands = data.commands ?? [];
const bin = data.program?.name ?? 'civitai';
// Cobra's `Global Flags:` — the ROOT command's own flags, accepted by every
// command. Rendered ONCE here rather than repeated on all 52 entries, which is
// why no per-command `options` table carries them. Optional, so an artifact
// generated before this field existed still renders (the block just vanishes).
const globalOptions = data.program?.globalOptions ?? [];

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

// The examples are a shell TRANSCRIPT, so they are joined back into one string
// and printed inside <pre>, preserving every internal blank line, the `#`
// annotations and the hand-aligned trailing comments. Interpolated as TEXT
// (never v-html), which is what makes the `<next-cursor-…>` / `<token>`
// placeholders in them safe: Vue escapes them into text nodes rather than the
// compiler seeing an unknown component.
function exampleText(c: CliCommand): string {
  return (c.examples ?? []).join('\n');
}
</script>

<template>
  <div class="ab-cli">
    <section v-if="globalOptions.length" class="ab-cmd">
      <h3 id="cli-global-flags"><code>Global flags</code></h3>
      <p class="ab-desc">Accepted by every <code>{{ bin }}</code> command, in addition to the flags listed with it.</p>
      <table>
        <thead>
          <tr><th>Flag</th><th>Description</th><th>Default</th></tr>
        </thead>
        <tbody>
          <tr v-for="o in globalOptions" :key="o.flags">
            <td><code>{{ o.flags }}</code></td>
            <td>{{ o.description }}</td>
            <td><code v-if="o.default">{{ o.default }}</code><span v-else class="ab-muted">—</span></td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-for="c in commands" :key="c.command" class="ab-cmd">
      <component :is="cliHeadingTag(c.command)" :id="cliAnchorId(c.command)">
        <code>{{ bin }} {{ c.command }}<template v-if="c.args"> {{ c.args }}</template></code>
        <span v-if="badgeLabel(c.status)" class="ab-badge ab-soon">{{ badgeLabel(c.status) }}</span>
      </component>
      <p class="ab-desc">{{ c.description.replace(/\s*\[coming soon\]\s*$/i, '') }}</p>
      <div v-if="c.examples?.length" class="ab-examples">
        <p class="ab-examples-label">Examples</p>
        <pre class="ab-example"><code>{{ exampleText(c) }}</code></pre>
      </div>
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
.ab-cmd :where(h3, h4, h5, h6) { display: flex; align-items: center; gap: 0.6rem; }
.ab-badge {
  padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.7rem;
  text-transform: uppercase; letter-spacing: 0.03em; font-weight: 600;
}
.ab-soon { background: var(--vp-c-warning-soft); color: var(--vp-c-warning-1); }
.ab-desc { margin: 0.4rem 0 0.6rem; }
.ab-examples { margin: 0.6rem 0 0.9rem; }
.ab-examples-label {
  margin: 0 0 0.35rem; font-size: 0.75rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--vp-c-text-2);
}
/* Shell transcripts: never collapse or reflow. `pre-wrap` would destroy the
   hand-aligned trailing comments cobra emits, so long lines scroll instead. */
.ab-example {
  margin: 0; padding: 0.85rem 1rem; overflow-x: auto;
  border-radius: 8px; background: var(--vp-code-block-bg);
  border: 1px solid var(--vp-c-divider);
}
.ab-example code {
  display: block; white-space: pre; font-size: 0.85em; line-height: 1.6;
  background: none; padding: 0; color: var(--vp-c-text-1);
}
.ab-muted { color: var(--vp-c-text-3); }
.ab-empty { color: var(--vp-c-text-3); font-style: italic; }
</style>
