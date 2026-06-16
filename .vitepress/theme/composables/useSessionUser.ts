import { computed, ref, type ComputedRef, type Ref } from 'vue';

// The current Civitai session user, read for this static docs site from the AUTH HUB
// (auth.civitai.com) over a credentialed request. This site has no server of its own and
// the session cookie is httpOnly, so the only way to know who's signed in is to ask the
// hub — the browser attaches whatever `.civitai.com` session cookie it holds (the new hub
// `civ-token`, or a legacy `civitai-token` the hub still decodes), so this works across
// the auth cutover with no cookie-name handling here.
//
// `developer.civitai.com` is a `.civitai.com` subdomain, so the hub cookie (set on the
// parent domain) rides along automatically. The hub's `/api/auth/identity` GET reads the
// session cookie (or a Bearer) and returns the rich SessionUser. CORS prerequisite: the
// hub must list this origin in AUTH_CORS_ORIGINS so it echoes Access-Control-Allow-Origin
// + Allow-Credentials for it (a `*.civitai.com` same-site origin, so its cookie is sent).

const AUTH_HUB_URL =
  (import.meta.env?.VITE_AUTH_HUB_URL as string | undefined) ?? 'https://auth.civitai.com';

// The hub identity endpoint — reads the session cookie and returns the bare SessionUser.
// Override per-environment if the session source moves.
const SESSION_PATH =
  (import.meta.env?.VITE_HUB_IDENTITY_PATH as string | undefined) ?? '/api/auth/identity';

/** A Civitai session user. Loosely typed — the docs site only needs identity-ish fields;
 *  extra fields the endpoint returns are preserved via the index signature. */
export interface SessionUser {
  id: number;
  username?: string;
  email?: string;
  image?: string;
  isModerator?: boolean;
  tier?: string;
  [key: string]: unknown;
}

const userRef: Ref<SessionUser | null> = ref(null);
const loadingRef = ref(false);
const loadedRef = ref(false); // true once a fetch has resolved at least once (success or empty)

let inflight: Promise<SessionUser | null> | null = null;

/** GET the session endpoint with credentials. Returns the user, or null when signed out /
 *  unreachable / CORS-blocked. Single-flighted so concurrent callers share one request. */
async function fetchSessionUser(): Promise<SessionUser | null> {
  if (typeof window === 'undefined') return null; // SSR/build — no cookies, no fetch
  if (inflight) return inflight;

  loadingRef.value = true;
  inflight = (async () => {
    try {
      const res = await fetch(new URL(SESSION_PATH, AUTH_HUB_URL).toString(), {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      // 401 = no/invalid/revoked session, 404 = no such user — both mean "signed out".
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as
        | { user?: SessionUser | null }
        | SessionUser
        | null;
      // The hub returns a bare SessionUser; also tolerate a `{ user }` envelope.
      const user =
        data && typeof data === 'object' && 'user' in data
          ? (data.user ?? null)
          : ((data as SessionUser | null) ?? null);
      userRef.value = user && typeof user.id === 'number' ? user : null;
      return userRef.value;
    } catch {
      // Not signed in, offline, CORS blocked, etc. — treat as signed out.
      return null;
    } finally {
      loadingRef.value = false;
      loadedRef.value = true;
      inflight = null;
    }
  })();
  return inflight;
}

// Kick off a fetch as soon as the module loads in the browser, mirroring useAuthToken's
// auto-fetch so the signed-in state is ready by the time UI reads it.
if (typeof window !== 'undefined') {
  void fetchSessionUser();
}

export interface UseSessionUserResult {
  user: Ref<SessionUser | null>;
  isAuthenticated: ComputedRef<boolean>;
  isModerator: ComputedRef<boolean>;
  displayName: ComputedRef<string | null>;
  loading: Ref<boolean>;
  loaded: Ref<boolean>;
  /** Re-fetch the session user (e.g. after the user signs in elsewhere and returns). */
  refresh: () => Promise<SessionUser | null>;
}

export function useSessionUser(): UseSessionUserResult {
  const isAuthenticated = computed(() => !!userRef.value);
  const isModerator = computed(() => !!userRef.value?.isModerator);
  const displayName = computed(() => userRef.value?.username ?? userRef.value?.email ?? null);

  // `refresh` bypasses the single-flight cache so a manual retry always re-hits the network.
  function refresh() {
    inflight = null;
    return fetchSessionUser();
  }

  return {
    user: userRef,
    isAuthenticated,
    isModerator,
    displayName,
    loading: loadingRef,
    loaded: loadedRef,
    refresh,
  };
}
