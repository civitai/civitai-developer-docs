<script setup lang="ts">
// The index on a SPLIT reference hub (`/apps/reference/hooks`, `/cli`,
// `/generation`): every entry, grouped by the sub-page that documents it.
//
// Placement comes from referenceSplit.shared.mjs — the same module the sub-page
// islands filter with and scripts/appblocks-md.mjs writes the `.md` channel
// from — so this index, the sub-pages and their `.md` twins cannot disagree
// about where an entry lives.
//
// 🔴 OLD DEEP LINKS. Before the split every entry was on the hub, so links like
// `/apps/reference/hooks#hook-useTip` exist in the wild (other repos, agent
// notes, bookmarks). Each index entry therefore carries the entry's OLD id, so
// such a link still lands on a line that links onward without JavaScript, and
// `onMounted` forwards it to the entry's sub-page when JavaScript runs.
import { inject, onMounted } from 'vue';
import { useRouter, withBase } from 'vitepress';
import {
  bridgeItems,
  groupAnchorId,
  itemAnchorId,
  itemKey,
  movedAnchors,
  referenceSplit,
  splitByGroup,
  subPageRoute,
} from './referenceSplit.shared.mjs';

type Kind = 'hooks' | 'cli' | 'bridge';
const props = defineProps<{ kind: Kind }>();

interface CliOption { flags: string; description: string; default: string | null; }
// The artifacts' shapes are owned by the islands that render them; this index
// reads only the fields it shows.
type AnyItem = Record<string, any>;

const PROVIDE_KEY: Record<Kind, string> = {
  hooks: 'appblocks:hooks',
  cli: 'appblocks:cli',
  bridge: 'appblocks:bridge',
};
const data = inject<AnyItem>(PROVIDE_KEY[props.kind], {});
const items: AnyItem[] =
  props.kind === 'hooks' ? data.hooks ?? [] : props.kind === 'cli' ? data.commands ?? [] : bridgeItems(data);

const split = referenceSplit(props.kind);
const groups = splitByGroup(props.kind, items).groups;
const bin: string = data.program?.name ?? 'civitai';
const globalOptions: CliOption[] = props.kind === 'cli' ? data.program?.globalOptions ?? [] : [];

function label(it: AnyItem): string {
  if (props.kind === 'cli') return `${bin} ${it.command}`;
  if (props.kind === 'bridge' && it.isLifecycle) return `${it.name}()`;
  return it.name;
}
function summary(it: AnyItem): string {
  if (props.kind === 'cli') return String(it.description ?? '').replace(/\s*\[coming soon\]\s*$/i, '');
  if (props.kind === 'bridge') return it.isLifecycle ? 'lifecycle' : it.kind;
  return '';
}
const anchorOf = (it: AnyItem) => itemAnchorId(props.kind, itemKey(props.kind, it));
const hrefOf = (slug: string, it?: AnyItem) =>
  withBase(`${subPageRoute(props.kind, slug)}${it ? `#${anchorOf(it)}` : ''}`);

const router = useRouter();
onMounted(() => {
  const id = decodeURIComponent(window.location.hash.slice(1));
  const to = id ? movedAnchors(props.kind, items)[id] : undefined;
  if (to) router.go(withBase(to));
});
</script>

<template>
  <div class="ab-refindex">
    <section v-for="g in groups" :key="g.slug" class="ab-refgroup">
      <h3 :id="groupAnchorId(kind, g.slug)"><a :href="hrefOf(g.slug)">{{ g.title }}</a></h3>
      <p class="ab-refdesc">{{ g.description.replace(/`/g, '') }}</p>
      <ul>
        <li v-for="it in g.items" :key="itemKey(kind, it)">
          <a :id="anchorOf(it)" :href="hrefOf(g.slug, it)"><code>{{ label(it) }}</code></a>
          <span v-if="summary(it)" class="ab-refsum"> — {{ summary(it) }}</span>
        </li>
      </ul>
    </section>
    <p v-if="!items.length" class="ab-empty">
      No {{ split.itemNoun }}s generated. Run <code>npm run gen:appblocks</code>.
    </p>

    <section v-if="globalOptions.length" class="ab-refgroup">
      <h3 id="cli-global-flags">Global flags</h3>
      <p class="ab-refdesc">Accepted by every <code>{{ bin }}</code> command, in addition to the flags listed with it.</p>
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
  </div>
</template>

<style scoped>
.ab-refgroup { margin: 1.5rem 0; }
.ab-refgroup h3 { margin-top: 0; }
.ab-refdesc { margin: 0.3rem 0 0.5rem; color: var(--vp-c-text-2); }
.ab-refgroup ul { margin: 0.2rem 0 0.6rem 1.1rem; }
.ab-refgroup li { margin: 0.15rem 0; }
.ab-refsum { color: var(--vp-c-text-2); }
.ab-muted { color: var(--vp-c-text-3); }
.ab-empty { color: var(--vp-c-text-3); font-style: italic; }
</style>
