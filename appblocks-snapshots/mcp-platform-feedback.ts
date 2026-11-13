import { TrpcError } from '../client/trpc.js';
import type { ToolResult } from '../tools/helpers.js';

/**
 * Civitai developer-platform feedback (`platformFeedback.create` /
 * `platformFeedback.getStatus`): an agent telling Civitai that the platform —
 * CLI, SDK, docs, review, sandbox, scopes, this MCP server — got in its way,
 * and reading back whether it is known or fixed.
 *
 * This file holds the wire contract (procedure names, enums, bounds) and the
 * error mapping. It mirrors the server's schema (civitai/civitai
 * `src/server/schema/platform-feedback.schema.ts`). The field bounds are
 * enforced by the tools' zod input schemas; this file adds only what zod
 * cannot see.
 *
 * Feedback sent through this server is NOT redacted client-side, by decision:
 * the hosted server runs on Civitai's own infrastructure, so scrubbing here
 * would hide nothing from the Civitai server that receives the report.
 */

export const PLATFORM_FEEDBACK_CREATE = 'platformFeedback.create';
export const PLATFORM_FEEDBACK_GET_STATUS = 'platformFeedback.getStatus';

/** report.client.name for this server. The server maps it to the `mcp` component for fix-version checks. */
export const PLATFORM_FEEDBACK_CLIENT_NAME = 'civitai-mcp';

export const PLATFORM_FEEDBACK_ABOUT = ['cli', 'sdk', 'docs', 'review', 'sandbox', 'scopes', 'mcp', 'other'] as const;
export const PLATFORM_FEEDBACK_KINDS = ['bug', 'confusing', 'missing', 'request'] as const;
export const PLATFORM_FEEDBACK_DOC_URL_PREFIX = 'https://developer.civitai.com/';

/** Server bounds, in UTF-16 code units (zod's `.max()` is JavaScript's `.length`). */
export const LIMITS = {
  message: 2000,
  ref: 80,
  version: 32,
  agent: 40,
  os: 16,
  arch: 16,
  command: 120,
  sdk: 4,
  sdkName: 40,
  docUrl: 300,
  errorExcerpt: 500,
  appSlug: 64,
  statusRefs: 50,
  statusRef: 80,
} as const;

/** report.ref: a caller-chosen SITE KEY for the failure (e.g. `submit.server-refused`), not a server ref. */
export const REPORT_REF_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
/** A server-issued report ref (e.g. `5123-3f9a01bc`), held to the CLI's conservative shape. */
export const STATUS_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
/** report.client.version's pattern on the server. */
export const CLIENT_VERSION_RE = /^[0-9A-Za-z.+-]+$/;

const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export type PlatformFeedbackAbout = (typeof PLATFORM_FEEDBACK_ABOUT)[number];
export type PlatformFeedbackKind = (typeof PLATFORM_FEEDBACK_KINDS)[number];

/** What the agent supplies. client name/version are filled in by this server, never asked for. */
export interface SendPlatformFeedbackArgs {
  message: string;
  about: PlatformFeedbackAbout;
  kind?: PlatformFeedbackKind;
  ref?: string;
  command?: string;
  httpStatus?: number;
  exitCode?: number;
  errorExcerpt?: string;
  docUrl?: string;
  appSlug?: string;
  agent?: string;
  os?: string;
  arch?: string;
  sdk?: Array<{ name: string; version: string }>;
}

export interface PlatformFeedbackReport {
  about: PlatformFeedbackAbout;
  kind: PlatformFeedbackKind;
  ref?: string;
  client: { name: typeof PLATFORM_FEEDBACK_CLIENT_NAME; version: string };
  agent?: string;
  os?: string;
  arch?: string;
  command?: string;
  exitCode?: number;
  httpStatus?: number;
  sdk?: Array<{ name: string; version: string }>;
  docUrl?: string;
  errorExcerpt?: string;
  appSlug?: string;
}

export interface PlatformFeedbackCreateInput {
  message: string;
  report: PlatformFeedbackReport;
}

export interface PlatformFeedbackCreateResult {
  ref: string;
  duplicate: boolean;
  status: string;
  fixedIn: { component: string; version: string } | null;
  note: string | null;
  reporters: number;
  reports: number;
}

export type PlatformFeedbackStatusItem =
  | {
      ref: string;
      found: true;
      status: string;
      fixedIn: { component: string; version: string } | null;
      note: string | null;
      reporters: number;
      firstSeenAt: string | null;
      updatedAt: string | null;
    }
  | { ref: string; found: false };

/** A refusal decided on this side of the wire: nothing was sent. */
export class PlatformFeedbackInputError extends Error {
  constructor(readonly field: string, problem: string) {
    super(`${field} ${problem} — nothing was sent`);
    this.name = 'PlatformFeedbackInputError';
  }
}

/**
 * Makes text storable: the server refuses a NUL or an unpaired surrogate in
 * any text field (Postgres stores neither), and zod's string bounds do not
 * look for them. NUL is removed and an unpaired surrogate becomes U+FFFD, so
 * the length never grows.
 */
function storable(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\u0000/g, '').replace(LONE_SURROGATE_RE, '�');
  if (Array.isArray(value)) return value.map(storable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, storable(v)]));
  }
  return value;
}

/** The first `max` UTF-16 units of `s`, never ending on half a surrogate pair. */
function clip(s: string, max: number): { text: string; clipped: boolean } {
  if (s.length <= max) return { text: s, clipped: false };
  return { text: s.slice(0, max).replace(/[\uD800-\uDBFF]$/, ''), clipped: true };
}

/**
 * Assembles the platformFeedback.create input from the tool's (zod-validated)
 * arguments. Adds only what zod cannot express: storable text, a message that
 * is not blank once trimmed (the server trims before its min-1 check), and
 * the error excerpt cut to the server's 500 (the server rejects a longer one;
 * the tool accepts more so an agent can paste a whole log).
 */
export function buildPlatformFeedbackInput(
  args: SendPlatformFeedbackArgs,
  clientVersion: string
): { input: PlatformFeedbackCreateInput; excerptClipped: boolean } {
  const report: PlatformFeedbackReport = {
    about: args.about,
    kind: args.kind ?? 'bug',
    client: { name: PLATFORM_FEEDBACK_CLIENT_NAME, version: clientVersion },
  };
  // Absent when unset, never a zero value: `httpStatus: 0` would be refused.
  const optional = [
    'ref', 'agent', 'os', 'arch', 'command', 'exitCode', 'httpStatus', 'sdk', 'docUrl', 'errorExcerpt', 'appSlug',
  ] as const;
  for (const key of optional) {
    const value = args[key];
    if (value !== undefined && value !== '') (report as unknown as Record<string, unknown>)[key] = storable(value);
  }

  const message = (storable(args.message) as string).trim();
  if (message === '') throw new PlatformFeedbackInputError('message', 'is blank');

  let excerptClipped = false;
  if (report.errorExcerpt !== undefined) {
    const { text, clipped } = clip(report.errorExcerpt, LIMITS.errorExcerpt);
    report.errorExcerpt = text;
    excerptClipped = clipped;
  }
  return { input: { message, report }, excerptClipped };
}

/** De-duplicates refs, keeping the caller's order. Shape and count are the tool schema's job. */
export function dedupeStatusRefs(refs: string[]): string[] {
  return [...new Set(refs)];
}

/**
 * Builds the result rows from the refs that were ASKED for, in that order: a
 * ref the response omits is not found, and a row nobody asked about is dropped.
 */
export function alignStatusItems(refs: string[], got: unknown): PlatformFeedbackStatusItem[] {
  const byRef = new Map<string, PlatformFeedbackStatusItem>();
  if (Array.isArray(got)) {
    for (const item of got as PlatformFeedbackStatusItem[]) {
      if (item && typeof item.ref === 'string' && !byRef.has(item.ref)) byRef.set(item.ref, item);
    }
  }
  return refs.map((ref) => {
    const item = byRef.get(ref);
    if (!item || item.found !== true) return { ref, found: false as const };
    return {
      ref,
      found: true as const,
      status: item.status,
      fixedIn: item.fixedIn ?? null,
      note: item.note ?? null,
      reporters: item.reporters,
      firstSeenAt: item.firstSeenAt ?? null,
      updatedAt: item.updatedAt ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

export type PlatformFeedbackErrorCode =
  | 'invalid_input'
  | 'unauthorized'
  | 'missing_scope'
  | 'collection_off'
  | 'forbidden'
  | 'rate_limited'
  | 'not_offered'
  | 'rejected'
  | 'unavailable'
  | 'failed';

/** The server's token-scope refusal ("…does not have the required scope…"). Keyed on its stable core, as the CLI does. */
export const isInsufficientScopeMsg = (msg: string) => msg.toLowerCase().includes('required scope');
/** The server's collection-off refusal ("Feedback is not being collected here right now."). */
export const isCollectionOffMsg = (msg: string) => {
  const m = msg.toLowerCase();
  return m.includes('not being collected') || m.includes('not collecting');
};

/** At most this much of a server message is quoted back to the agent. */
const SERVER_MSG_MAX = 300;

function quoteServer(msg: string): string {
  const firstLine = msg.trim().split('\n')[0] ?? '';
  return firstLine.length > SERVER_MSG_MAX ? `${firstLine.slice(0, SERVER_MSG_MAX)}…` : firstLine;
}

/**
 * Maps a failure from either procedure to a message an agent can act on. A
 * tRPC error is never passed through raw: the server's own sentence is quoted
 * (first line, bounded) only where it carries information this mapping lacks.
 */
export function translatePlatformFeedbackError(
  err: unknown,
  webUrl: string
): { code: PlatformFeedbackErrorCode; message: string } {
  if (err instanceof PlatformFeedbackInputError) return { code: 'invalid_input', message: err.message };
  if (!(err instanceof TrpcError)) {
    return { code: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
  const msg = quoteServer(err.serverMessage ?? '');
  const said = msg ? ` Civitai said: "${msg}"` : '';
  switch (err.status) {
    case 401:
      return {
        code: 'unauthorized',
        message:
          'Civitai did not accept the API key for this request (401). Set a valid CIVITAI_API_KEY, or send ' +
          `Authorization: Bearer <key> with the MCP request. Keys are created at ${webUrl}/user/account.`,
      };
    case 403:
      if (isInsufficientScopeMsg(msg)) {
        return {
          code: 'missing_scope',
          message:
            "This API key's scope does not cover platform feedback (403): it needs the AppBlocksSubmit scope " +
            '("Manage your Apps"), an opt-in scope that a scoped key or token only has if it was granted ' +
            `explicitly. A full-access personal API key passes this check: create one at ${webUrl}/user/account. ` +
            'Or use a token that was ' +
            'granted AppBlocksSubmit — for example the one `civitai login` mints for the Civitai CLI — and set ' +
            'it as CIVITAI_API_KEY or send it as Authorization: Bearer <key>.',
        };
      }
      if (isCollectionOffMsg(msg)) {
        return {
          code: 'collection_off',
          message:
            'Civitai is not collecting platform feedback right now (403). That is the server\'s answer, not a ' +
            'problem with your key or your report — try again later.',
        };
      }
      return {
        code: 'forbidden',
        message: `Civitai refused this platform-feedback request (403), for a reason this server cannot name.${said}`,
      };
    case 429:
      return {
        code: 'rate_limited',
        message:
          'Rate limited by Civitai (429). Sending is limited to about 10 reports an hour and 40 a day per ' +
          'user, status checks to about 60 a minute. Wait before trying again.' + said,
      };
    case 404:
      return {
        code: 'not_offered',
        message: `This Civitai server does not offer platform feedback (404); nothing was recorded.${said}`,
      };
    case 400:
      return {
        code: 'rejected',
        message:
          'Civitai rejected the request (400) although it passed this server\'s own checks, so its message ' +
          `is all there is to go on.${said}`,
      };
    case 503:
      return { code: 'unavailable', message: `Platform feedback is unavailable right now (503); try again later.${said}` };
    default:
      return { code: 'failed', message: `The platform-feedback request failed (HTTP ${err.status}).${said}` };
  }
}

/** A tool error result carrying the translated message and a stable code. */
export function platformFeedbackFailure(err: unknown, webUrl: string): ToolResult {
  const { code, message } = translatePlatformFeedbackError(err, webUrl);
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    structuredContent: { ok: false, code, error: message },
    isError: true,
  };
}
