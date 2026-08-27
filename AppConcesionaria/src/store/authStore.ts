import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config';

/**
 * Estado de autenticación de la app.
 *
 * Los tokens se guardan en expo-secure-store (Keychain en iOS / Keystore en
 * Android), NO en almacenamiento plano: son credenciales. Al arrancar, la app
 * rehidrata la sesión desde ahí (`bootstrap`).
 */

export interface AppUser {
    id: number;
    nombre: string;
    email: string;
    roles: string[];
    concesionariaId: number | null;
    sucursalId: number | null;
}

interface AuthState {
    user: AppUser | null;
    accessToken: string | null;
    refreshToken: string | null;
    /** null = todavía no rehidratamos; true/false = decidido. Evita el flash de login. */
    hydrated: boolean;
    setSession: (user: AppUser, access: string, refresh: string) => Promise<void>;
    setTokens: (access: string, refresh: string) => Promise<void>;
    bootstrap: () => Promise<void>;
    logout: () => Promise<void>;
    hasRole: (...roles: string[]) => boolean;
}

const K_ACCESS = 'autenza.accessToken';
const K_REFRESH = 'autenza.refreshToken';
const K_USER = 'autenza.user';

const save = async (k: string, v: string) => {
    try { await SecureStore.setItemAsync(k, v); } catch { /* no bloquea la UI */ }
};
const wipe = async (k: string) => {
    try { await SecureStore.deleteItemAsync(k); } catch { /* idem */ }
};

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    accessToken: null,
    refreshToken: null,
    hydrated: false,

    setSession: async (user, access, refresh) => {
        set({ user, accessToken: access, refreshToken: refresh });
        await Promise.all([
            save(K_ACCESS, access),
            save(K_REFRESH, refresh),
            save(K_USER, JSON.stringify(user)),
        ]);
    },

    setTokens: async (access, refresh) => {
        set({ accessToken: access, refreshToken: refresh });
        await Promise.all([save(K_ACCESS, access), save(K_REFRESH, refresh)]);
    },

    bootstrap: async () => {
        try {
            const [access, refresh, userRaw] = await Promise.all([
                SecureStore.getItemAsync(K_ACCESS),
                SecureStore.getItemAsync(K_REFRESH),
                SecureStore.getItemAsync(K_USER),
            ]);
            if (access && refresh && userRaw) {
                set({ accessToken: access, refreshToken: refresh, user: JSON.parse(userRaw) });
            }
        } catch {
            /* si el storage falla, arranca deslogueado */
        } finally {
            set({ hydrated: true });
        }
    },

    logout: async () => {
        set({ user: null, accessToken: null, refreshToken: null });
        await Promise.all([wipe(K_ACCESS), wipe(K_REFRESH), wipe(K_USER)]);
    },

    hasRole: (...roles) => {
        const mine = get().user?.roles ?? [];
        return roles.some((r) => mine.includes(r));
    },
}));

/**
 * Login directo (sin el interceptor, para no re-entrar). Guarda la sesión.
 * Devuelve el usuario; lanza con un mensaje legible si falla.
 */
export async function login(email: string, password: string): Promise<AppUser> {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.message || 'No pudimos iniciar sesión. Revisá tus datos.');
    }
    const user: AppUser = data.user;
    await useAuthStore.getState().setSession(user, data.tokens.access, data.tokens.refresh);
    return user;
}
