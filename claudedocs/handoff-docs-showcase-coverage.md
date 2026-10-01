# Handoff: docs-showcase-coverage — 2026-10-01

## Run this first — the index, one command
```bash
$DEVRC/scripts/cairn-ops/read.sh recall --repo "/home/zach/workspace/civit/civitai-developer-docs"
```
Terse pointers this doc does not carry, curated by past sessions and outliving it.
🔴 RECALL, NOT LIVE OBSERVATION — every line is a pointer to VERIFY, never a current
reading, and it may describe a gotcha already fixed. `scope-absent`/`scope-empty` means
nothing is recorded yet: ordinary, not an error, and not a clean bill of health.
Non-blocking: if it exits non-zero, print the stderr line and carry on.

## Goal
`civitai-developer-docs`'s component showcase claimed to be "a live gallery of every
component" and shipped 12 of 21. Make it complete, cover the 47 custom elements, and add
automation so the next gap cannot land silently.
- **closing-condition:** `check` — `gh pr view 133 --repo civitai/civitai-developer-docs
  --json state --jq .state` returns `MERGED` **and** `curl -sfo /dev/null -w '%{http_code}'
  https://developer.civitai.com/apps/reference/elements` returns `200`. The second half is
  load-bearing: the gallery page is **gitignored and generated at build time**, so a green
  merge does not prove it exists on the deployed site.

## State now
- **PR `civitai/civitai-developer-docs#133` — OPEN, merge-ready, NOT merged.** Head
  `c1a6776`, `+3126/−37`, 17 files, **16/16 checks pass** — those ran on a tree containing
  `cb2d43c`. 🔴 **`main` has since moved to `a5b40c0` (#135), so that green set is once
  again a run on a STALE BASE.** Re-merge `origin/main` into the branch and let CI re-run
  before merging; `mergeStateStatus` says nothing about this. 🔴 A merge to `main` **AUTO-DEPLOYS** developer.civitai.com
  (branch-tracked, ~26min build → Flux). There is no separate release step; `main`
  requires **0** approving reviews. The merge is the operator's call and was left to them.
  ⚠ `mergeStateStatus` read `UNKNOWN` at write time — that is GitHub computing lazily, a
  property of the API, not a conflict.
- **What shipped in #133:** showcase completed 12 → **all 21** CSS-pack components (`text`,
  `slider`, `segmented-control`, `toast`, `toast-region`, `tooltip`, `image` were absent;
  `group` and `radio` had no addressable `ui=` chip). Element bundle imported into the
  VitePress theme so `<civitai-*>` render live. New generated gallery over all **47**
  elements (`scripts/gen-appblocks-element-gallery.mjs` → gitignored
  `apps/reference/elements.md`). New `scripts/check-showcase-coverage.mjs`, PR-blocking on
  `test-md-regions`. `scripts/test-showcase-e2e.mjs` rewired into `build-site` with floors.
- 🔴 **A live bug on the deployed site was found and fixed as a side effect.**
  `data-theme` was rendered during SSR where VitePress's `isDark` is `ref(false)`, and a
  production Vue hydration *adopts* a mismatched plain attribute rather than patching it.
  A returning dark-mode reader got `<html class="dark">` with `data-theme="light"` — white
  cards on a dark page, across all 21 demos and all 45 element previews, measured
  identically at +0ms/+1s/+3s. Fixed in `usePreviewTheme.ts` via a `mounted` gate. The
  E2E never saw it because it only ever reached dark **by clicking**.
- **Upstream prerequisites filed in `civitai/civitai-app-starters`:** **#506** (the
  custom-elements-manifest config globs only `civitai-*.ts`, so `CivitaiField`
  (`src/elements/field-base.ts:78`) and `CivitaiElement` (`base.ts:26`) are absent from all
  94 declarations — 8 elements extend `CivitaiField` and each loses the 8 public fields at
  `field-base.ts:94-103`) and **#507** (`@civitai/components-chat` has no
  `custom-elements.json` and no `MARKUP.md`, so it is unreachable by every docs mechanism;
  0 mentions across all 129 dev-docs markdown files, against a control of 77).
- **Audit ladder COMPLETE — round 0 + rounds 1-4, all posted to #133.** Round 0:
  requirement questioned, 5 deletion candidates, all 5 dispositioned. Rounds 1-4 each found
  a real defect; round 4's was fixed and the ladder closed rather than running a round 5
  over a derivation change. Payload per round: 80 / 202 / 120 / 135, all non-zero, so the
  attribution gate never fired.
- **Deploy/verify:** nothing is verified against developer.civitai.com — the PR is unmerged.
  The gates are the claim. `Dockerfile:17` runs `npm run build`, whose `prebuild` runs
  `gen:appblocks`, so the gitignored gallery **is** generated inside the image and cannot
  404 on rollout — verified by reading the Dockerfile, not by a deploy.
- clawgate resolve: **exit 5, NOTHING RESOLVED** (0 tasks). An unknown session id answers
  200 with an empty array, so that zero cannot distinguish "touched no task" from "wrong
  id" ⇒ no `clawgate-task:` field, by rule. Not a clean bill of health.

## Open investigations — live diagnosis state

### `ElementPreview.vue` says the named export MUST be called, and the e2e's label says it observed the call — neither looks true
- as-of: 2026-10-01
- **Symptom + exact repro:** in
  `civitai-developer-docs:.vitepress/theme/components/ElementPreview.vue`, the lazy
  `import('@civitai/components/register-site')` destructures a named export and calls it,
  with an adjacent comment asserting the call is required. Rename **only** the destructured
  export name there (not the subpath) and rebuild.
- **Observed (with values):** `npm run build` **rc 0**; `test:showcase:e2e` **rc 0, 43/43
  pass**, including the check whose label reads *"every one of the 45 tags UPGRADED (lazy
  registerSite() ran)"*. So a rename that should break the call is completely silent.
  Renaming the **subpath** instead is loud: build rc 1 inside vite's `tryNodeResolve`.
- **Ruled out:** *the elements simply fail to register* — they register fine;
  `dist/elements/register-site.js` line 20 of the installed 0.8.1 build calls
  `registerSite()` at **module scope**, so the import's side effect does the registration
  and the theme's explicit call is redundant. `via: measurement`.
- **Leading hypothesis:** two stale claims, not one bug — the `ElementPreview.vue` comment
  overstates the requirement, and the e2e check's label overstates what it observes (it
  sees the import's effect, never the call). Both pre-date PR #133 and were left untouched
  as out of scope.
- **Next probe:** decide whether the theme should keep the redundant call at all. If it
  stays, reword both the comment and the e2e label to say the **import** registers; if it
  goes, the e2e needs a check that would actually fail when registration does not happen.
  `git -C <dev-docs> log -S 'registerSite' -- .vitepress/theme/components/ElementPreview.vue`
  for who wrote the claim and why.

## Next steps (ranked)
1. **Merge `civitai/civitai-developer-docs#133`.** 16/16 green on the merged tree; the only
   thing between it and the deployed site is the click. 🔴 Merging AUTO-DEPLOYS — confirm
   the close-check's second half (the `/apps/reference/elements` 200) afterwards, because a
   green merge does not prove a gitignored generated page exists on the site.
   forcing: user — the operator asked for the showcase audited and the drift automated;
   this is the delivery, and they explicitly reserved the merge.
2. **Fix the four lagging pins in `civitai-developer-docs`.** `check:ds-pins`' online half
   is red: `@civitai/components` 0.8.1→0.9.0, `components-react` 0.9.0→0.9.1, `app-sdk`
   0.52.0→0.54.0, `blocks-react` 0.59.0→0.61.0. Scheduled, not PR-blocking; the `--offline`
   form is rc 0. ⚠ Measured: `components@0.9.0` + `components-react@0.9.1` trip **none** of
   the new guards, so the bump is mechanically safe. Touches `package.json` plus ~13 prose
   version literals the pin guard single-sources (`apps/guide/theming.md`,
   `apps/guide/responsive.md`, `apps/showcase.md:67`) — `responsive.md:183`'s
   `@civitai/components@0.4.0` is a declared `HISTORICAL_LITERALS` row and must NOT move.
   forcing: gate — a repo gate is red on its daily schedule.
3. **Run `/simplify` on round-0's D4 and D5** in `civitai-developer-docs`. D4: the coverage
   guard's `LEDGER 3(a)` (~25 lines) is a near-tautology — it only asserts a devDep's
   specifier string appears in some file that also contains `<ComponentDemo>`. D5: the dead
   `importedBindings` measurement feeding a floor whose own docblock quotes a number
   `importedEverywhere` computes separately. Both verified **held, not grown** by round 4.
   `/simplify` mutates, so it is the operator's to run. forcing: none
4. **Unblock `civitai-app-starters#506`** so the generator's `ABSENT_BASES` machinery can be
   deleted. See Defects for why `0.9.0` does not close it. forcing: none
5. **Write the `civitai-developer-docs / showcase` cairn entry** — drafted this session and
   **NOT written**: `cairn create --scope civitai-developer-docs --ref showcase` was refused
   twice with `http-503 — no available server`, and `cairn sync` confirms
   `cairn.civitai.com` is down while the `personal` instance is live. The scope is
   `scope-absent`, so this would be its first entry. ⚠ The draft lived only in a
   session scratchpad and is **gone**; the lessons it carried are preserved in this doc's
   Gotchas, so re-derive the entry from there rather than from memory. Re-check with
   `cairn sync` before retrying. forcing: none

## Defects (batched)
- `civitai-app-starters#506` is **NOT closed by the `@civitai/components@0.9.0` bump.** That
  release carries `CivitaiField` only as a `superclass.name` **reference**, with **zero**
  base-class declarations. ⚠ A first probe said otherwise — a substring match had matched
  the reference — and was retracted. So the expiry condition recorded in the gallery
  generator's docblock (*#506 merged + the pin bumped ⇒ delete `ABSENT_BASES`,
  `publicFieldsOf`, `resolveAbsentBases`, `renderGap`*) is **not yet satisfiable**, and
  nothing in either tree asserts it. The mechanical half is the one to use: does
  `custom-elements.json` in the **installed** package declare `CivitaiField`?
- `civitai-developer-docs:scripts/test-showcase-e2e.mjs` has a permanently-failing
  assertion history worth knowing: `dark: Card surface` was red on `main` because the
  assertion expected `rgb(26,27,30)` (the dark **body** colour) where a card renders
  `rgb(37,38,43)` (the dark **surface**). Fixed in #133. It hid because in light both
  tokens are `#fefefe`, so the light-theme twin passes against either — that twin is now
  annotated as ambiguous by construction.
- Round-0 candidates D4 and D5 remain open — see ranked item 3.
- The `ElementPreview.vue` / e2e-label overclaim — see Open investigations.

## Gotchas / decisions / dead-ends
- 🔴 **`civitai-developer-docs` is BRANCH-TRACKED: a merge to `main` auto-deploys**, ~26min
  build → Flux rollout, no tag or release step, and `main` requires **0** approving reviews.
  Treat every merge there as a deploy.
- 🔴 **The showcase's own E2E ran in NO WORKFLOW AT ALL** before #133 —
  `git grep -i showcase origin/main -- .github/` returned nothing across all 14 workflow
  files — and its `for all N demos` assertion **passed vacuously at zero demos** while a
  browserless run exited 0 with `SKIP`. Wiring it up was not enough: the harness only
  loaded `apps/showcase` and `apps/tokens`, so the `@layer` hatch it was supposed to guard
  was observable by **nothing**. An unwired gate and a wired-but-blind one look identical
  from the outside.
- 🔴 **A generator was the WRONG answer for the hand-written showcase, and the reason is
  reusable:** `custom-elements.json` carries no enum values (`type.text` is the TS alias
  name, e.g. `BadgeVariant`, not `'filled' | 'light' | 'outline'`), mostly empty
  descriptions, and — fatally — no base-class declarations (#506). `reference/components.md`
  is **already** generated from a `MARKUP.md` snapshot and already covers all 21 correctly.
  A guard keyed on the pinned package's own exports was the cheaper correct mechanism.
- 🔴 **"One rule, one place" is WRONG when the two sites share a COINCIDENCE rather than a
  rule — and acting on it cost a whole audit round.** A shared `SDK_ONLY_TAGS` list meant
  *"needs no React binding"* to one reader and *"needs no register bundle"* to the other.
  Those coincide only for today's two `src/sdk/` elements, and the result was a two-gate
  deadlock with **no state of the list green in both**, killing `npm run dev` (the
  generator runs in `predev`/`prebuild`). Un-shared into `BINDINGLESS_TAGS` and
  `UNREGISTERED_TAGS`, each with its own predicate and a "do not re-merge" note. Before
  consolidating, ask whether the sites share a rule or a value that happens to match today.
- 🔴 **A floor set at the exactly-measured count STEALS the ledger's failure**, and it can
  steal a *sibling guard's* ledger across a CI step boundary: `gen:appblocks` runs at
  `appblocks-md-regions.yml:87` and `check:showcase-coverage` at `:130`, in one job, and the
  check reads the page the generator failed to write. The repo documents the convention in
  `check-showcase-coverage.mjs:86-121`. Floors exist to catch a **broken extractor**, never
  to encode coverage.
- ⚠ **`FLOORS` is not always a usable source for a new floor** — every entry sits at or
  above `register-site.js`'s real 5. Where a quantity is an upstream *authoring* decision
  whose shares can move with no element disappearing, any value above `1` re-encodes
  today's split.
- 🔴 **`git log … <sha>..HEAD` in the shared clone measures the WRONG TREE.** The clone sits
  on `main`, so `HEAD` is not the PR head and a payload range comes back **empty with rc 0**
  — indistinguishable from a real zero. Always fetch `refs/remotes/pr/<n>` and name it
  explicitly, and prove the range non-empty with `git rev-list --count` first.
- 🔴 **`audit-dispatch.py`'s `WHERE TO WORK` section says to pass `isolation: "worktree"`
  whenever the script was RUN inside the PR's repo** — but that flag worktrees the
  **dispatching session's** cwd. Every round of this ladder had to override it, because the
  session stood in `civitai-app-starters` while the PR lived in `civitai-developer-docs`.
- ⚠ **A transient `503` from `civitai.com/api/v1/images` reddened `test-samples (site)`
  twice** on this branch (body: *"Image search is temporarily overloaded"*). Both cleared on
  a re-run with no code change. Probe the exact URL before attributing that job to a diff.
- **`npm ci` in a fresh worktree skips `esbuild`/`vue-demi` postinstall scripts**, so
  `npm run build` / VitePress is not a clean measurement there. The plain-Node gate scripts
  are unaffected.

## How to verify
- **The closing condition, both halves:**
  ```bash
  gh pr view 133 --repo civitai/civitai-developer-docs --json state --jq .state   # MERGED
  curl -sfo /dev/null -w '%{http_code}\n' https://developer.civitai.com/apps/reference/elements
  ```
- **The guard is real, not decorative** — from a checkout of the PR head, the red-at-base /
  green-at-HEAD matrix:
  ```bash
  SHOWCASE_PAGE=<a checkout of cb2d43c>/apps/showcase.md node scripts/check-showcase-coverage.mjs
  # rc 1, naming all 9: group image radio segmented-control slider text toast toast-region tooltip
  node scripts/check-showcase-coverage.mjs      # rc 0 at the PR head
  ```
- **The `@layer` hatch is still guarded:** delete the `all: revert-layer` declaration inside
  `.cds-el-preview :is(…)` in `.vitepress/theme/design-system.css`, rebuild, run
  `test:showcase:e2e` → **4 assertions red**, each naming Preflight's `rgb(228,228,231)`;
  `civitai-text-input` collapses 568px → 285px. Restore and re-run → 43/43.
- **A bundle rename is one edit to the generator** (two counting the theme): change
  `fn: 'registerAll'` → `'registerBase'` in `REGISTER_BUNDLES`, regenerate, and grep the
  page: old name **0** hits, new name **42** (40 row labels + snippet comment + call), with
  `registerSite` unchanged at 7. The new-name grep is the positive control — a bare zero
  proves nothing.
- **The gallery page is byte-stable:** `md5sum apps/reference/elements.md` →
  `9b789e6c3edf29188fd915e79f1b452b`.
- **Full local gate:** `npm run gen:appblocks && npm run check:showcase-coverage &&
  npm run build && npm run test:snippets:appblocks && npm run test:showcase:e2e`.
  Last measured at `c1a6776`: snippets **53/53**, e2e **43/43**, all rc 0.
- Audit the doc: `python3 ~/workspace/devrc/scripts/handoff-audit.py claudedocs/handoff-docs-showcase-coverage.md`
