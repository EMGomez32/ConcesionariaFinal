import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Clave de localStorage que usa el middleware `persist`. */
const AUTH_STORAGE_KEY = 'auth-storage';

interface User {
  id: number;
  nombre: string;
  email: string;
  roles: string[];
  concesionariaId: number | null;
  sucursalId: number | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setAccessToken: (token: string) => void;
  /** Guarda el par rotado (access + refresh) tras un /auth/refresh. */
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: Partial<User>) => void;
  logout: () => void;
}

/**
 * Decodes a JWT payload without a library.
 * Returns null if the token is malformed.
 */
const decodeJwtPayload = (token: string): { exp?: number } | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
};

/**
 * Returns true if the JWT access token is expired or unreadable.
 */
const isTokenExpired = (token: string | null): boolean => {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  // Allow 30 seconds of leeway
  return Date.now() >= (payload.exp * 1000) - 30_000;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (patch) => set((state) => ({ user: state.user ? { ...state.user, ...patch } as User : state.user })),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        // On app load, check if the access token is expired
        if (state && isTokenExpired(state.accessToken)) {
          // If the refresh token is also expired, log out completely
          if (isTokenExpired(state.refreshToken)) {
            state.logout();
          }
          // If only access token is expired but refresh is valid,
          // the axios interceptor will handle the refresh on next request
        }
      },
    }
  )
);

/**
 * Lee el refreshToken más reciente directamente de localStorage (lo que `persist`
 * escribió), en vez del estado en memoria. Necesario para el refresh entre pestañas:
 * si otra pestaña ya rotó el token, el store en memoria de ésta quedó viejo pero
 * localStorage tiene el nuevo. Mandar el viejo dispararía la detección de reuso del
 * backend (revokeAllForUser → logout de TODAS las sesiones). Devuelve null si no hay
 * token o si el storage es ilegible.
 */
export const getPersistedRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { refreshToken?: string | null } };
    return parsed?.state?.refreshToken ?? null;
  } catch {
    return null;
  }
};
