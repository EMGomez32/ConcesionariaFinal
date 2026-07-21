import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      setUser: (patch) => set((state) => ({ user: state.user ? { ...state.user, ...patch } as User : state.user })),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
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
