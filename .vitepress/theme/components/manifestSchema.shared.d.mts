// Types for manifestSchema.shared.mjs. The implementation is plain ESM (not .ts)
// so scripts/appblocks-md.mjs can import it under bare `node`; this keeps
// JsonSchemaTable.vue's `<script setup lang="ts">` type-clean.
export interface ManifestRow {
  field: string;
  type: string;
  required: boolean;
  description: string;
  constraints: string;
}
export declare const EXPANDED_FIELDS: string[];
export declare const PATTERN_KEY: string;
export declare function typeText(prop: any): string;
export declare function constraintText(prop: any): string;
export declare function manifestRows(schema: { properties?: Record<string, any>; required?: string[] }): ManifestRow[];
