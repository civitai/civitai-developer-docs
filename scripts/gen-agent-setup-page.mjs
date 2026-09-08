#!/usr/bin/env node
// Rewrite the inline copy of the agent-setup prompt on `agent-setup/index.md`
// from `public/agent-setup/prompt.md`.
//
// See scripts/agent-setup-page.mjs for the defect this closes and why the copy
// is generated rather than hand-written.
//
// MAINTAINER REFRESH STEP — deliberately NOT wired into predev/prebuild, for the
// same reason as scripts/gen-appblocks-md.mjs: a build must never rewrite a
// committed file. Run it after ANY edit to public/agent-setup/prompt.md and
// commit the page diff. `npm run check:agent-setup` blocks a PR that forgot to.
//
// It reads no artifact, needs no install and touches no network — the only input
// is the prompt source, which is exactly what makes the drift guard able to run
// in a CI job that does neither.
//
// USAGE
//   npm run gen:agent-setup-page

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANDING_PAGE, PROMPT_SOURCE } from '../.vitepress/agent-setup.mjs';
import { readSources, renderPromptRegion, repoRoot, spliceRegion } from './agent-setup-page.mjs';

const { page, prompt } = readSources();
const after = spliceRegion(page, renderPromptRegion(prompt));

if (after === page) {
  console.log(`agent-setup page: unchanged — ${LANDING_PAGE} already carries ${PROMPT_SOURCE} verbatim`);
} else {
  writeFileSync(join(repoRoot, LANDING_PAGE), after);
  console.log(
    `agent-setup page: UPDATED ${LANDING_PAGE} — inlined ${prompt.split('\n').length} line(s) ` +
      `of ${PROMPT_SOURCE}`,
  );
}
