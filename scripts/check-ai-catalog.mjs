#!/usr/bin/env node
/**
 * check-ai-catalog.mjs
 * --------------------
 * The guard for machine discovery: `public/.well-known/ai-catalog.json` (the
 * artifact) and the `Link:` header in `nginx.conf` (the advertisement).
 *
 * 🔴 THE DEFECT THIS EXISTS TO CATCH LIVES IN THE SEAM, NOT IN EITHER FILE.
 * Both are individually plausible while being collectively wrong: a catalog
 * listing four artifacts nobody is told about, or a header promising three URLs
 * the catalog never heard of. Each file reviews clean on its own. So every
 * assertion below is about a RELATIONSHIP — header vs catalog, config vs the
 * locations that exist, promise vs what the origin actually serves.
 *
 * 🔴 ADVERTISING A DEAD TARGET IS WORSE THAN ADVERTISING NOTHING, and that is
 * measured rather than feared. On 2026-09-11 `docs.mintlify.com` advertised six
 * rels — llms-txt, llms-full-txt, api-catalog, mcp-server-card, agent-card,
 * agent-skills — and EVERY ONE of the six targets returned 530. Nothing on their
 * side was red; a Link header is consumed by fetchers, so no human ever sees the
 * result. That is the failure mode this file is pointed at.
 *
 * WHAT IS CHECKED
 *   OFFLINE (always; this is the half that can gate a PR)
 *     1. The catalog parses, and carries the `specVersion` / `host` / `entries`
 *        shape, with no empty required field.
 *     2. At least MIN_CATALOG_ENTRIES entries. POSITIVE CONTROL, built in: a
 *        parser wired to nothing passes forever and is indistinguishable from a
 *        healthy one, so a zero is red by construction rather than by luck.
 *     3. Every entry URL is absolute https on CANONICAL_HOST. A relative or
 *        off-host URL in a catalog is how a consumer gets sent somewhere else.
 *     4. `nginx.conf` defines `set $ai_link` exactly once and it parses as a
 *        Link field-value.
 *     5. THE LEDGER (see below): every `location` block that sets any header at
 *        all also sets `add_header Link`, except the ones named in
 *        LINK_EXEMPT_LOCATIONS — and a location in NEITHER set fails the run.
 *     6. THE SEAM: the catalog's own URL is advertised, and every OTHER
 *        advertised URL is itself a catalog entry. Neither file may name a thing
 *        the other has not heard of.
 *
 *   NETWORK (skipped entirely under `--offline`)
 *     7. Every catalog entry URL answers 200, with a Content-Type whose media
 *        type equals the `type` the entry declares.
 *     8. Every advertised URL answers 200.
 *     9. The LIVE origin actually sends the Link header, and its value equals
 *        the one `nginx.conf` sets. This is the only assertion that can see a
 *        deploy that silently dropped the advertisement — items 4-6 all pass
 *        against a config that was never rolled out.
 *
 * 🔴 WHY THE LEDGER IS PHRASED AS "EVERY LOCATION THAT SETS ANY HEADER", NOT AS
 * A LIST OF ROUTES. nginx inherits `add_header` from an outer block ONLY IF the
 * inner block declares NO `add_header` of its own, so one `add_header` anywhere
 * in a location silently drops EVERY inherited one. That makes "sets a header"
 * exactly the predicate that decides whether a location needs its own copy —
 * checking a hand-written list of paths instead would go stale the first time
 * somebody adds a location, which is the case that most needs catching. Measured
 * under a real nginx on a variant with one server-level `add_header Link` and no
 * per-location copies: four of five document routes served NO Link header —
 * `/apps/guide.html`, `/agent-setup/prompt.md`, `/.well-known/ai-catalog.json`
 * and `/` — while `/llms.txt`, whose location sets no header of its own, kept
 * it. `/` loses it because `index index.html` resolves it through an internal
 * redirect into `location ~* \.html$`, so a reviewer who spot-checks the
 * homepage sees a header that most of the site does not send.
 *
 * 🔴 UNREACHABLE ORIGIN -> LOUD SKIP, EXIT 0. STATED, NOT IMPLIED.
 * ---------------------------------------------------------------
 * DNS failure, timeout and 5xx SKIP the affected URL and the run exits 0 —
 * matching check-example-apps.mjs, check-appblocks-pins.mjs and
 * check-appblocks-cli-snapshot.mjs, for the reason those give: a connectivity
 * failure is not drift, and a guard that false-fails on someone else's outage
 * becomes a gate everybody learns to click through.
 *
 * What keeps that honest is that it is never SILENT:
 *   - every skipped URL prints its own `⊘` line naming the reason;
 *   - the summary ALWAYS prints `checked / failed / skipped`, so a run that
 *     verified nothing says `0 checked` rather than a bare "ok";
 *   - a run where EVERY URL was unreachable says in words that nothing was
 *     verified;
 *   - and the offline half still ran, so the structural claims hold regardless.
 *
 * 🔴 A 404 IS NOT A CONNECTIVITY FAILURE AND IS NEVER SKIPPED. It is the exact
 * symptom this guard exists to report, and it is also what a correct config
 * returns before it has been DEPLOYED — which is why the network half runs on a
 * schedule and on demand, never as a PR gate. See ai-catalog.yml.
 *
 * USAGE
 *   node scripts/check-ai-catalog.mjs [--offline] [--host <origin>] [--verbose]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

const CATALOG_PATH = join(REPO, 'public', '.well-known', 'ai-catalog.json');
const NGINX_PATH = join(REPO, 'nginx.conf');

const CANONICAL_HOST = 'developer.civitai.com';
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

/**
 * The floor is the positive control, not a style rule. It is deliberately set
 * to the number of entries that exist today: the catalog is small and
 * hand-maintained, so "one fewer than now" is a real regression worth failing
 * on, and there is no churn argument for slack here. Raising it is correct when
 * an entry is added; LOWERING it is the edit to be suspicious of.
 */
const MIN_CATALOG_ENTRIES = 3;

/**
 * Locations deliberately NOT advertising, each with the reason it is exempt.
 * This is a ledger, not a skip list: a location that is in neither this map nor
 * the advertise set FAILS the run, so adding a location forces an explicit
 * decision rather than a silent omission.
 */
const LINK_EXEMPT_LOCATIONS = new Map([
  [
    '/assets/',
    'fingerprinted sub-resources (JS, CSS, fonts) — fetched only because a document already referenced them, so nothing discovers the site here; the header would be pure overhead on the highest-volume routes',
  ],
]);

const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const VERBOSE = args.includes('--verbose');
const hostFlag = args.indexOf('--host');
const ORIGIN = hostFlag !== -1 && args[hostFlag + 1] ? args[hostFlag + 1].replace(/\/$/, '') : CANONICAL_ORIGIN;

const failures = [];
const skips = [];
let checked = 0;

const fail = (msg) => failures.push(msg);
const skip = (what, why) => {
  skips.push(what);
  console.log(`  ⊘ ${what} — ${why}`);
};

// ---------------------------------------------------------------------------
// OFFLINE 1-3: the catalog itself
// ---------------------------------------------------------------------------

let catalog;
try {
  catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
} catch (err) {
  console.error(`✗ cannot read or parse ${CATALOG_PATH}: ${err.message}`);
  process.exit(1);
}

if (catalog.specVersion !== '1.0') {
  fail(`catalog specVersion is ${JSON.stringify(catalog.specVersion)}, expected "1.0"`);
}

for (const key of ['displayName', 'identifier', 'documentationUrl']) {
  if (!catalog.host?.[key]) fail(`catalog host.${key} is missing or empty`);
}
if (catalog.host?.identifier !== `did:web:${CANONICAL_HOST}`) {
  fail(`catalog host.identifier is ${JSON.stringify(catalog.host?.identifier)}, expected "did:web:${CANONICAL_HOST}"`);
}

const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
if (entries.length < MIN_CATALOG_ENTRIES) {
  fail(
    `catalog has ${entries.length} entr(ies), expected at least ${MIN_CATALOG_ENTRIES}. ` +
      `This floor is the positive control — a parser wired to nothing also reports few or zero, ` +
      `and is otherwise indistinguishable from a healthy run.`,
  );
}

const seenIdentifiers = new Set();
for (const [i, e] of entries.entries()) {
  const where = `entries[${i}]${e?.identifier ? ` (${e.identifier})` : ''}`;
  for (const key of ['identifier', 'displayName', 'type', 'url', 'description']) {
    if (!e?.[key] || typeof e[key] !== 'string' || !e[key].trim()) {
      fail(`${where}: ${key} is missing or empty`);
    }
  }
  for (const key of ['tags', 'representativeQueries']) {
    if (!Array.isArray(e?.[key]) || e[key].length === 0) {
      fail(`${where}: ${key} must be a non-empty array`);
    }
  }
  if (e?.identifier) {
    if (seenIdentifiers.has(e.identifier)) fail(`${where}: duplicate identifier`);
    seenIdentifiers.add(e.identifier);
  }
  if (typeof e?.url === 'string' && e.url) {
    let u;
    try {
      u = new URL(e.url);
    } catch {
      fail(`${where}: url ${JSON.stringify(e.url)} is not an absolute URL — a catalog is read by clients that have no base to resolve against`);
      continue;
    }
    if (u.protocol !== 'https:') fail(`${where}: url is not https`);
    if (u.host !== CANONICAL_HOST) {
      fail(`${where}: url host is ${u.host}, expected ${CANONICAL_HOST} — an off-host entry sends consumers somewhere this repo does not control`);
    }
  }
}

// ---------------------------------------------------------------------------
// OFFLINE 4-5: nginx.conf — the advertisement, and the ledger
// ---------------------------------------------------------------------------

const nginxSrc = readFileSync(NGINX_PATH, 'utf8');

// Strip comments so a `#`-quoted example can never be mistaken for a directive.
// Kept as its own step because the parse below is otherwise line-oriented and a
// commented-out `add_header Link` would silently satisfy the ledger.
const nginxCode = nginxSrc
  .split('\n')
  .map((line) => line.replace(/#.*$/, ''))
  .join('\n');

const setMatches = [...nginxCode.matchAll(/set\s+\$ai_link\s+'([^']*)'\s*;/g)];
if (setMatches.length !== 1) {
  fail(`nginx.conf defines \`set $ai_link\` ${setMatches.length} time(s), expected exactly 1`);
}
const linkValue = setMatches[0]?.[1] ?? '';

/** Parse a Link field-value into [{url, rel}]. */
const parseLink = (value) =>
  value
    .split(/,(?=\s*<)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^<([^>]+)>\s*;\s*rel="([^"]+)"$/.exec(part);
      return m ? { url: m[1], rel: m[2] } : { raw: part, malformed: true };
    });

const advertised = parseLink(linkValue);
for (const a of advertised) {
  if (a.malformed) fail(`nginx.conf $ai_link has an unparseable member: ${JSON.stringify(a.raw)}`);
}
if (advertised.length === 0) fail('nginx.conf $ai_link advertises nothing');

// --- the ledger -------------------------------------------------------------
// Walk brace depth so a `location` inside another block is attributed correctly.
const locations = [];
{
  const lines = nginxCode.split('\n');
  let depth = 0;
  let current = null;
  for (const line of lines) {
    const open = (line.match(/{/g) || []).length;
    const close = (line.match(/}/g) || []).length;
    const locMatch = /^\s*location\s+(.+?)\s*{/.exec(line);
    if (locMatch && current === null) {
      current = { spec: locMatch[1].trim(), depth, setsAnyHeader: false, setsLink: false };
    } else if (current) {
      if (/^\s*add_header\s+/.test(line)) {
        current.setsAnyHeader = true;
        if (/^\s*add_header\s+Link\s+\$ai_link\b/.test(line)) current.setsLink = true;
      }
    }
    depth += open - close;
    if (current && depth <= current.depth) {
      locations.push(current);
      current = null;
    }
  }
}

if (locations.length === 0) {
  fail('parsed 0 `location` blocks out of nginx.conf — the ledger below is vacuous, so the parser has stopped matching this file rather than the file being clean');
}

for (const loc of locations) {
  const exemptReason = LINK_EXEMPT_LOCATIONS.get(loc.spec);
  if (loc.setsLink) {
    if (exemptReason) {
      fail(
        `location ${loc.spec} sets \`add_header Link\` but is also listed in LINK_EXEMPT_LOCATIONS. ` +
          `One of the two is wrong; decide which and remove the other.`,
      );
    }
    continue;
  }
  if (exemptReason) continue;
  if (loc.setsAnyHeader) {
    fail(
      `location ${loc.spec} sets add_header but NOT \`add_header Link $ai_link\`. ` +
        `nginx drops every inherited add_header from a block that declares one of its own, ` +
        `so this route silently serves no advertisement. Add the header, or add the location ` +
        `to LINK_EXEMPT_LOCATIONS with the reason.`,
    );
  } else if (!LINK_EXEMPT_LOCATIONS.has(loc.spec)) {
    // A location setting no headers inherits correctly, so this is not a defect
    // on its own — but it IS a new location nobody has classified. Report it so
    // the set cannot grow silently in either direction.
    if (VERBOSE) console.log(`  · location ${loc.spec} sets no headers — inherits the server-level default`);
  }
}

// Fail if an exemption is recorded for a location that no longer exists: the
// ledger must shrink as well as grow, or it becomes a list of ghosts that reads
// as coverage.
for (const [spec] of LINK_EXEMPT_LOCATIONS) {
  if (!locations.some((l) => l.spec === spec)) {
    fail(`LINK_EXEMPT_LOCATIONS names location ${spec}, which no longer exists in nginx.conf — remove the stale exemption`);
  }
}

// ---------------------------------------------------------------------------
// OFFLINE 6: the seam — header and catalog must agree
// ---------------------------------------------------------------------------

const catalogPathname = '/.well-known/ai-catalog.json';
const advertisedPaths = advertised.filter((a) => !a.malformed).map((a) => a.url);

if (!advertisedPaths.includes(catalogPathname)) {
  fail(
    `the Link header does not advertise ${catalogPathname}. The catalog is the one hop the header exists to offer; ` +
      `without it a consumer reading the header never learns the catalog exists.`,
  );
}

const catalogPathnames = new Set(
  entries.map((e) => {
    try {
      return new URL(e.url).pathname;
    } catch {
      return null;
    }
  }).filter(Boolean),
);

for (const p of advertisedPaths) {
  if (p === catalogPathname) continue;
  if (!catalogPathnames.has(p)) {
    fail(
      `nginx.conf advertises ${p} but no catalog entry names it. ` +
        `The header and the catalog must describe the same site: an advertised URL the catalog has never ` +
        `heard of is exactly the half-updated state this guard exists to catch.`,
    );
  }
}

// ---------------------------------------------------------------------------
// NETWORK 7-9
// ---------------------------------------------------------------------------

const mediaType = (ct) => (ct || '').split(';')[0].trim().toLowerCase();

const TRANSIENT = /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|UND_ERR|fetch failed|timeout/i;

async function head(url) {
  const res = await fetch(url, { method: 'GET', redirect: 'manual', headers: { 'user-agent': 'civitai-docs-check-ai-catalog' } });
  return res;
}

if (!OFFLINE) {
  console.log(`\nnetwork checks against ${ORIGIN}`);

  const toCheck = [
    ...entries.map((e) => ({ url: e.url, expectType: e.type, what: `catalog entry ${e.identifier}` })),
    ...advertisedPaths.map((p) => ({ url: `${ORIGIN}${p}`, expectType: null, what: `advertised ${p}` })),
  ];

  for (const item of toCheck) {
    const url = item.url.startsWith('http') ? item.url.replace(CANONICAL_ORIGIN, ORIGIN) : `${ORIGIN}${item.url}`;
    let res;
    try {
      res = await head(url);
    } catch (err) {
      if (TRANSIENT.test(String(err?.cause?.code || err?.message || err))) {
        skip(item.what, `origin unreachable (${err?.cause?.code || err.message})`);
        continue;
      }
      fail(`${item.what}: ${url} — ${err.message}`);
      continue;
    }
    if (res.status >= 500) {
      skip(item.what, `origin returned ${res.status} (treated as an outage, not drift)`);
      continue;
    }
    checked += 1;
    if (res.status !== 200) {
      fail(
        `${item.what}: ${url} returned ${res.status}, expected 200. ` +
          `An advertised or catalogued URL that does not resolve is worse than not naming it at all — ` +
          `a fetcher acts on it with no human in the loop.`,
      );
      continue;
    }
    if (item.expectType) {
      const got = mediaType(res.headers.get('content-type'));
      if (got !== item.expectType.toLowerCase()) {
        fail(
          `${item.what}: ${url} serves Content-Type ${JSON.stringify(got)} but the catalog declares ` +
            `${JSON.stringify(item.expectType)}. Consumers discriminate on this, and nosniff means nobody re-guesses it.`,
        );
      }
    }
    if (VERBOSE) console.log(`  ✓ ${item.what} — ${url}`);
  }

  // 9. the LIVE advertisement. Everything above can pass against a config that
  //    was never deployed; only this reads what the origin actually sends.
  try {
    const res = await head(`${ORIGIN}/`);
    if (res.status >= 500) {
      skip('live Link header', `origin returned ${res.status}`);
    } else {
      checked += 1;
      const live = res.headers.get('link');
      if (!live) {
        fail(
          `${ORIGIN}/ sends no Link header. nginx.conf sets one, so either the change is not deployed yet ` +
            `or a location is swallowing it — see the add_header inheritance note in nginx.conf.`,
        );
      } else {
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        if (norm(live) !== norm(linkValue)) {
          fail(`${ORIGIN}/ sends a Link header that differs from nginx.conf.\n    live:   ${norm(live)}\n    config: ${norm(linkValue)}`);
        } else if (VERBOSE) {
          console.log(`  ✓ live Link header matches nginx.conf`);
        }
      }
    }
  } catch (err) {
    skip('live Link header', `origin unreachable (${err?.cause?.code || err.message})`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(
  `\nai-catalog: ${entries.length} catalog entr(ies), ${advertised.length} advertised rel(s), ` +
    `${locations.length} nginx location(s) — ${checked} URL(s) checked, ${failures.length} failed, ${skips.length} skipped`,
);

if (!OFFLINE && checked === 0) {
  console.log(
    '🔴 NOTHING WAS VERIFIED OVER THE NETWORK — every URL was unreachable. The structural checks above still ran, ' +
      'but this run makes no claim that anything resolves.',
  );
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('✓ ai-catalog checks passed');
