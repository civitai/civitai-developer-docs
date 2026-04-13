import { computed, ref, type ComputedRef, type Ref } from 'vue';

const STORAGE_KEY = 'civitai-developer-docs:token';

const tokenRef: Ref<string | null> = ref(readInitial());

function readInitial(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) tokenRef.value = e.newValue;
  });
}

export interface UseAuthTokenResult {
  token: Ref<string | null>;
  hasToken: ComputedRef<boolean>;
  masked: ComputedRef<string>;
  setToken: (value: string) => void;
  clearToken: () => void;
}

export function useAuthToken(): UseAuthTokenResult {
  const hasToken = computed(() => !!tokenRef.value);
  const masked = computed(() => {
    const t = tokenRef.value;
    if (!t) return 'not set';
    if (t.length <= 4) return '••••';
    return `••••${t.slice(-4)}`;
  });

  function setToken(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      clearToken();
      return;
    }
    tokenRef.value = trimmed;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    }
  }

  function clearToken() {
    tokenRef.value = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  return { token: tokenRef, hasToken, masked, setToken, clearToken };
}
