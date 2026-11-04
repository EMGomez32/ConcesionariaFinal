import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Clave de localStorage que usa el middleware `persist`. */
export const AUTH_STORAGE_KEY = 'auth-storage';

export interface User {
  id: number;
  nombre: string;
  email: string;
  roles: string[];
  concesionariaId: number | null;
  sucursalId: number | null;
  /** El usuario tiene el 2FA activado. */
  mfaActivo?: boolean;
  /** Su rol exige 2FA y todavía no lo activó: sólo puede usar la pantalla de activación. */
  mfaPendiente?: boolean;
}

interface AuthState {
  /** Único dato que se persiste (localStorage): quién es el usuario de esta sesión. */
  user: User | null;
  /** Access token: vive SÓLO en memoria. Al recargar se pide otro con /auth/refresh (cookie). */
  accessToken: string | null;
  /**
   * Refresh token de la sesión, SÓLO en memoria (nunca en localStorage) y sólo
   * como dato informativo para el backend: Ajustes lo manda a /usuarios/me para
   * que, al cerrar las demás sesiones, conserve ésta. El /auth/refresh del
   * navegador NO lo usa: va con la cookie httpOnly `autenza_rt`. Tras una recarga
   * queda en null hasta el próximo refresh (que lo vuelve a traer en el cuerpo).
   */
  refreshToken: string | null;
  /** Hay usuario Y access token: se pueden hacer requests autenticadas. */
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken?: string | null) => void;
  setAccessToken: (token: string) => void;
  /** Guarda el par rotado tras un /auth/refresh (el refresh sólo en memoria). */
  setTokens: (accessToken: string, refreshToken?: string | null) => void;
  setUser: (user: Partial<User>) => void;
  logout: () => void;
}

/**
 * Decodifica el payload de un JWT sin librería. null si está mal formado.
 * Se usa para comprobar que un access token nuevo es del MISMO usuario que la
 * pestaña tiene cargado (ver api/client.ts).
 */
export const decodeJwtPayload = (token: string): { exp?: number; userId?: number } | null => {
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
 * Refresh token que la versión anterior guardaba en localStorage. Se rescata UNA
 * vez al migrar el storage (v0 → v1) para mandarlo en el primer /auth/refresh:
 * el backend lo acepta en el cuerpo, pone la cookie y desde ahí la sesión sigue
 * por cookie. Así el deploy no desloguea a nadie. Se borra del storage en el
 * mismo momento (la migración reescribe la clave sólo con `user`).
 */
let refreshHeredado: string | null = null;

/** El refresh heredado del storage viejo, si lo hubo (se usa en el primer /auth/refresh). */
export const leerRefreshHeredado = (): string | null => refreshHeredado;
/** Se olvida en cuanto el backend contestó (con éxito o rechazándolo): no se reintenta. */
export const olvidarRefreshHeredado = () => { refreshHeredado = null; };

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken = null) =>
        set({ user, accessToken, refreshToken: refreshToken ?? null, isAuthenticated: true }),
      setAccessToken: (accessToken) => set((s) => ({ accessToken, isAuthenticated: !!s.user })),
      setTokens: (accessToken, refreshToken = null) =>
        set((s) => ({ accessToken, refreshToken: refreshToken ?? s.refreshToken, isAuthenticated: !!s.user })),
      setUser: (patch) => set((state) => ({ user: state.user ? { ...state.user, ...patch } as User : state.user })),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      // v1: sólo se persiste `user`. Los tokens no se escriben nunca en localStorage
      // (un XSS no puede llevarse una sesión de días leyendo el storage).
      version: 1,
      partialize: (state) => ({ user: state.user }),
      migrate: (persistido, version) => {
        const viejo = (persistido ?? {}) as { user?: User | null; refreshToken?: string | null };
        if (version < 1 && typeof viejo.refreshToken === 'string') refreshHeredado = viejo.refreshToken;
        return { user: viejo.user ?? null };
      },
      // Del storage sólo se toma `user`; isAuthenticated arranca en false hasta que
      // ProtectedRoute restaure el access token con la cookie.
      merge: (persistido, actual) => ({
        ...actual,
        user: (persistido as { user?: User | null } | undefined)?.user ?? null,
      }),
    }
  )
);
