/**
 * spec-util.mjs
 * -------------
 * Shared paths + the ONE network read for the Orchestration OpenAPI spec.
 *
 * Two scripts need these: `copy-spec.mjs` (resolves the spec into
 * public/openapi/ before every dev/build) and `check-openapi-drift.mjs` (the
 * scheduled freshness guard). Keeping the URL, the timeout and the retry policy
 * in one place is what stops the two from disagreeing about which host is
 * canonical or how long "too long" is.
 *
 * THE TIMEOUT IS NOT DECORATION. Before this module existed, copy-spec.mjs held
 * the repo's only `fetch(` with no `AbortSignal.timeout` — the other five all
 * used 20 s. Measured against a TLS server that completes the handshake and then
 * never answers, an untimed `fetch` sits on undici's `headersTimeout` default,
 * which is FIVE MINUTES: long enough to burn a CI job's whole budget and report
 * a timeout instead of a diagnosis. 20 s matches every other fetch here.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(here, '..');

/** The published spec. Overridable so the offline test can point at a local server. */
export const SPEC_URL =
  process.env.CIVITAI_OPENAPI_SPEC_URL || 'https://orchestration.civitai.com/openapi/v2-consumers.json';

/** Host name alone, for messages that need to name who is unreachable. */
export function specHost(url = SPEC_URL) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * The COMMITTED snapshot — the default source, and the reason a build needs no
 * network. Sits beside `appblocks-snapshots/` and is refreshed the same way:
 * deliberately, in a PR, with a scheduled drift check to say when.
 */
export const SNAPSHOT_PATH = join(repoRoot, 'openapi-snapshots', 'v2-consumers.json');

/** Where VitePress imports it from. Gitignored; regenerated on every dev/build. */
export const DEST_PATH = join(repoRoot, 'public', 'openapi', 'v2-consumers.json');

/**
 * Sibling orchestration repo in the dev stack:
 *   repos/civitai-developer-docs/repo/          <- this repo
 *   repos/civitai-orchestration/repo/src/...    <- source of the spec
 */
export const SIBLING_PATH = resolve(
  repoRoot,
  '..',
  '..',
  'civitai-orchestration',
  'repo',
  'src',
  'Civitai.Orchestration.Api',
  'wwwroot',
  'openapi',
  'v2-consumers.json',
);

/** Matches the 20 s every other fetch in scripts/ uses. Env override is for the offline test. */
export const FETCH_TIMEOUT_MS = Number(process.env.COPY_SPEC_TIMEOUT_MS || 20000);
export const FETCH_ATTEMPTS = Number(process.env.COPY_SPEC_ATTEMPTS || 3);
/** Backoff before attempt 2 and attempt 3. Worst case 3×20 s + 4 s ≈ 64 s, bounded. */
const BACKOFF_MS = [1000, 3000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Turns a thrown `fetch` rejection into something a human can act on.
 *
 * 🔴 `err.message` ALONE IS USELESS HERE — undici reports every transport
 * failure as the bare string `fetch failed`, which is the exact
 * nothing-to-go-on message this whole change exists to replace. The real code
 * is one or two levels down, and on a multi-address host it is inside an
 * `AggregateError` under `.errors`, where `err.cause.code` is `undefined`.
 * Measured: a refused loopback connection reported `fetch failed` with no code
 * until this walked the chain.
 */
function describeFetchError(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return `no response within ${FETCH_TIMEOUT_MS}ms`;
  }

  const seen = new Set();
  const codes = [];
  const stack = [err];
  while (stack.length) {
    const e = stack.shift();
    if (!e || typeof e !== 'object' || seen.has(e)) continue;
    seen.add(e);
    if (e.code && !codes.includes(e.code)) codes.push(e.code);
    if (Array.isArray(e.errors)) stack.push(...e.errors);
    if (e.cause) stack.push(e.cause);
  }

  const detail = err?.message || String(err);
  return codes.length ? `${codes.join('/')}: ${detail}` : detail;
}

/**
 * One bounded read of the spec.
 *
 * Returns `{ ok: true, text }`, or `{ ok: false, reason, status?, attempts }`.
 * NEVER throws and never hangs: every attempt carries `AbortSignal.timeout`, and
 * the attempt count is finite. A 4xx is not retried (the URL is wrong, and
 * repeating it just multiplies the wait); a 5xx, a 429 and a thrown network
 * error are.
 */
export async function fetchSpec({ url = SPEC_URL, log = () => {} } = {}) {
  let last = null;

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const wait = BACKOFF_MS[attempt - 2] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
      log(`[docs] retrying in ${wait}ms (attempt ${attempt}/${FETCH_ATTEMPTS})`);
      await sleep(wait);
    }

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });

      if (res.ok) {
        // The body read is inside the same try so a stalled BODY (headers sent,
        // bytes never finished) is caught by the same signal rather than
        // hanging past it.
        return { ok: true, text: await res.text(), status: res.status, attempts: attempt };
      }

      last = { ok: false, reason: `HTTP ${res.status} ${res.statusText}`.trim(), status: res.status, attempts: attempt };
      const retriable = res.status >= 500 || res.status === 429;
      if (!retriable) return last;
      log(`[docs] ${url} answered ${last.reason}`);
    } catch (err) {
      const reason = describeFetchError(err);
      last = { ok: false, reason, attempts: attempt };
      log(`[docs] ${reason}`);
    }
  }

  return last ?? { ok: false, reason: 'no attempt was made', attempts: 0 };
}
