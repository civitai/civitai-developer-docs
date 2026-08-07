// Types for cliReference.shared.mjs. The implementation is plain ESM (not .ts)
// so scripts/test-appblocks-cli.mjs can import it under bare `node`; this keeps
// CliReference.vue's `<script setup lang="ts">` type-clean without a suppression.
export declare function cliAnchorId(command: string): string;
export declare function cliHeadingLevel(command: string): number;
export declare function cliHeadingTag(command: string): string;
