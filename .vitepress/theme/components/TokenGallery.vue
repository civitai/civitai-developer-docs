<script setup lang="ts">
/**
 * <TokenGallery> — a live, drift-proof gallery of the `@civitai/theme` design
 * tokens.
 *
 * SINGLE SOURCE OF TRUTH: every row is derived from the PUBLISHED
 * `@civitai/theme` JS export (`tokenVars` / `tokens` / `darkTokens`) — never a
 * hand-maintained list — so the gallery cannot show a token the package doesn't
 * export, nor miss one it does. The token-drift test asserts exactly this: the
 * set of rows rendered here === `Object.keys(tokenVars)`.
 *
 * For each token we show:
 *   - its camelCase name + the `--civitai-*` custom property (read out of the
 *     `tokenVars` `var(--…)` string, so the property name can't drift either),
 *   - the exported light + dark values (`tokens` / `darkTokens`),
 *   - the value the BROWSER actually resolves via `getComputedStyle()` on a
 *     `[data-theme]`-scoped probe — proving the tokens CSS is loaded and matches
 *     the JS export.
 *
 * The gallery container follows the site theme (`useData().isDark`) so the
 * "current" swatch column re-resolves in place when you toggle dark mode.
 */
import { computed, onMounted, ref, watch, nextTick } from 'vue';
import { useData } from 'vitepress';
import { tokens, darkTokens, tokenVars } from '@civitai/theme';
import dtcg from '@civitai/theme/tokens.json';

type TokenName = keyof typeof tokenVars;

const { isDark } = useData();
const theme = computed(() => (isDark.value ? 'dark' : 'light'));

/** camelCase token name -> `--civitai-*` property, extracted from `tokenVars`. */
function cssVarOf(name: TokenName): string {
  const m = /var\((--[a-z0-9-]+)\)/i.exec(tokenVars[name]);
  return m ? m[1] : '';
}

interface Row {
  name: TokenName;
  cssVar: string;
  light: string;
  dark: string;
  isColor: boolean;
  category: 'color' | 'typography' | 'shape';
}

function categorize(name: string): Row['category'] {
  if (name.startsWith('color')) return 'color';
  if (name.startsWith('font')) return 'typography';
  return 'shape';
}

const rows: Row[] = (Object.keys(tokenVars) as TokenName[]).map((name) => {
  const light = (tokens as Record<string, string>)[name] ?? '';
  const dark = (darkTokens as Record<string, string>)[name] ?? light;
  return {
    name,
    cssVar: cssVarOf(name),
    light,
    dark,
    isColor: name.startsWith('color'),
    category: categorize(name),
  };
});

const colorRows = rows.filter((r) => r.category === 'color');
const typographyRows = rows.filter((r) => r.category === 'typography');
const shapeRows = rows.filter((r) => r.category === 'shape');

/** Browser-resolved values per theme, read from `getComputedStyle` on a probe. */
const resolvedLight = ref<Record<string, string>>({});
const resolvedDark = ref<Record<string, string>>({});
const lightProbe = ref<HTMLElement | null>(null);
const darkProbe = ref<HTMLElement | null>(null);

function readResolved() {
  const read = (el: HTMLElement | null) => {
    const out: Record<string, string> = {};
    if (!el) return out;
    const cs = getComputedStyle(el);
    for (const r of rows) out[r.name] = cs.getPropertyValue(r.cssVar).trim();
    return out;
  };
  resolvedLight.value = read(lightProbe.value);
  resolvedDark.value = read(darkProbe.value);
}

onMounted(async () => {
  await nextTick();
  readResolved();
});
watch(isDark, async () => {
  await nextTick();
  readResolved();
});

/** The DTCG token document, pretty-printed for the raw export panel. */
const dtcgJson = JSON.stringify(dtcg, null, 2);

/** Component-level size scales — NOT theme tokens, shown for reference only. */
const spacingScale = [
  { name: 'sm', stack: '8px', group: '6px', card: '10px' },
  { name: 'md', stack: '16px', group: '16px', card: '16px' },
  { name: 'lg', stack: '24px', group: '24px', card: '24px' },
];
</script>

<template>
  <div class="cds-tokens" :data-theme="theme" data-testid="cds-token-gallery">
    <!-- Off-screen probes: one per theme, so we can read the browser-resolved
         value of every --civitai-* property regardless of the site theme. -->
    <div
      ref="lightProbe"
      data-theme="light"
      aria-hidden="true"
      style="position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none;"
    />
    <div
      ref="darkProbe"
      data-theme="dark"
      aria-hidden="true"
      style="position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none;"
    />

    <p class="cds-tokens__note">
      All {{ rows.length }} tokens below are read live from the published
      <code>@civitai/theme</code> export. The tokens form a single
      <strong>semantic</strong> layer (e.g. <code>colorPrimary</code>,
      <code>colorSurface</code>) — there is no separate raw-palette layer at
      this version; consumers reference the semantic names and let the
      <code>[data-theme]</code> scope resolve light vs. dark.
    </p>

    <!-- ---------- Colors ---------- -->
    <h3>Colors</h3>
    <div class="cds-tokens__grid">
      <div
        v-for="r in colorRows"
        :key="r.name"
        class="cds-swatch"
        data-testid="cds-token-row"
        :data-token="r.name"
      >
        <div
          class="cds-swatch__chip"
          :style="{ background: theme === 'dark' ? r.dark : r.light }"
        />
        <div class="cds-swatch__meta">
          <span class="cds-swatch__name">{{ r.name }}</span>
          <span class="cds-swatch__var">{{ r.cssVar }}</span>
          <span class="cds-swatch__value">
            light {{ r.light }} · dark {{ r.dark }}
          </span>
          <span class="cds-swatch__value" data-testid="cds-token-resolved">
            resolved:
            {{ (theme === 'dark' ? resolvedDark : resolvedLight)[r.name] || '…' }}
          </span>
        </div>
      </div>
    </div>

    <!-- ---------- Typography ---------- -->
    <h3>Typography</h3>
    <div class="cds-scale">
      <div
        v-for="r in typographyRows"
        :key="r.name"
        class="cds-scale__row"
        data-testid="cds-token-row"
        :data-token="r.name"
      >
        <span class="cds-scale__label">
          {{ r.name }}<br /><code>{{ r.cssVar }}</code>
        </span>
        <span class="cds-specimen" :style="{ fontFamily: `var(${r.cssVar})` }">
          The quick brown fox jumps over the lazy dog — 0123456789
        </span>
      </div>
    </div>

    <!-- ---------- Shape / radius ---------- -->
    <h3>Radius &amp; shape</h3>
    <div class="cds-scale">
      <div
        v-for="r in shapeRows"
        :key="r.name"
        class="cds-scale__row"
        data-testid="cds-token-row"
        :data-token="r.name"
      >
        <span class="cds-scale__label">
          {{ r.name }}<br /><code>{{ r.cssVar }}</code>
        </span>
        <span
          class="cds-radius-specimen"
          :style="{ borderRadius: `var(${r.cssVar})` }"
        >{{ r.light }}</span>
      </div>
    </div>

    <!-- ---------- Full token table (semantic values across themes) ---------- -->
    <h3>All tokens</h3>
    <table class="cds-token-table">
      <thead>
        <tr>
          <th>Token</th>
          <th>CSS custom property</th>
          <th>Light</th>
          <th>Dark</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.name">
          <td><code>{{ r.name }}</code></td>
          <td>
            <span
              v-if="r.isColor"
              class="cds-token-table__swatch"
              :style="{ background: theme === 'dark' ? r.dark : r.light }"
            />
            <code>{{ r.cssVar }}</code>
          </td>
          <td><code>{{ r.light }}</code></td>
          <td><code>{{ r.dark }}</code></td>
        </tr>
      </tbody>
    </table>

    <!-- ---------- Component size scales (reference, not theme tokens) ---------- -->
    <h3>Component size scales</h3>
    <p class="cds-tokens__note">
      Spacing and sizing come from each component's <code>data-gap</code> /
      <code>data-padding</code> / <code>data-size</code> presets (resolved in
      <code>@civitai/components</code>), not from theme tokens. For reference:
    </p>
    <table class="cds-token-table">
      <thead>
        <tr>
          <th>Preset</th>
          <th>Stack gap</th>
          <th>Group gap</th>
          <th>Card padding</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in spacingScale" :key="s.name">
          <td><code>{{ s.name }}</code></td>
          <td><code>{{ s.stack }}</code></td>
          <td><code>{{ s.group }}</code></td>
          <td><code>{{ s.card }}</code></td>
        </tr>
      </tbody>
    </table>

    <!-- ---------- DTCG export ---------- -->
    <h3>DTCG export</h3>
    <p class="cds-tokens__note">
      The same tokens are published as a
      <a href="https://tr.designtokens.org/format/" target="_blank" rel="noreferrer">DTCG</a>
      document at <code>@civitai/theme/tokens.json</code> for design-tool import:
    </p>
    <details class="cds-dtcg">
      <summary>View <code>tokens.json</code></summary>
      <pre class="cds-dtcg__json"><code>{{ dtcgJson }}</code></pre>
    </details>
  </div>
</template>
