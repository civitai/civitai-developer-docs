// Types for referenceSplit.shared.mjs. The implementation is plain ESM (not .ts)
// so the bare-`node` scripts (scripts/appblocks-md.mjs and the checks) can
// import it; this keeps the islands' `<script setup lang="ts">` type-clean.
export type RefKind = 'hooks' | 'cli' | 'bridge';
export interface RefGroup {
  slug: string;
  title: string;
  description: string;
  members?: string[];
  prefixes?: string[];
  fallback?: boolean;
}
export interface RefSplit {
  kind: RefKind;
  hub: string;
  hubTitle: string;
  component: string;
  itemNoun: string;
  groups: RefGroup[];
}
export declare const MD_PAGE_BUDGET: number;
export declare const REFERENCE_SPLITS: Record<RefKind, RefSplit>;
export declare function referenceSplit(kind: RefKind): RefSplit;
export declare function bridgeItems(data: any): any[];
export declare function subPageRoute(kind: RefKind, slug: string): string;
export declare function subPageFile(kind: RefKind, slug: string): string;
export declare function hubFile(kind: RefKind): string;
export declare function itemKey(kind: RefKind, item: any): string;
export declare function itemAnchorId(kind: RefKind, key: string): string;
export declare function groupAnchorId(kind: RefKind, slug: string): string;
export declare function splitByGroup<T>(
  kind: RefKind,
  items: T[],
): { groups: Array<RefGroup & { items: T[] }>; groupOf: Map<string, string>; inherited: string[] };
export declare function itemsInGroup<T>(kind: RefKind, items: T[], slug?: string): T[];
export declare function movedAnchors(kind: RefKind, items: any[]): Record<string, string>;
export declare function sidebarItems(kind: RefKind): Array<{ text: string; link: string }>;
