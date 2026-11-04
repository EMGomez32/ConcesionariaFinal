import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config';
import { queryClient } from '../api/queryClient';
import { SESION_VENCIDA, SIN_CONEXION } from '../lib/errores';

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
    /** Aviso para el login (p. ej. "Tu sesión venció"). Se limpia al entrar. */
    avisoSesion: string | null;
    setSession: (user: AppUser, access: string, refresh: string) => Promise<void>;
    setTokens: (access: string, refresh: string) => Promise<void>;
    bootstrap: () => Promise<void>;
    /** `vencida`: la cerró el sistema (token inválido) y el login lo avisa. */
    logout: (motivo?: 'vencida') => Promise<void>;
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
    avisoSesion: null,

    setSession: async (user, access, refresh) => {
        set({ user, accessToken: access, refreshToken: refresh, avisoSesion: null });
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

    logout: async (motivo) => {
        const refresh = get().refreshToken;
        set({
            user: null, accessToken: null, refreshToken: null,
            avisoSesion: motivo === 'vencida' ? SESION_VENCIDA : null,
        });
        // Los datos del usuario que sale no quedan en memoria para el que entra.
        queryClient.clear();
        // Revoca el refresh token en el servidor (best-effort): si no hay red, vence solo.
        if (refresh && motivo !== 'vencida') {
            fetch(`${API_BASE_URL}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: refresh }),
            }).catch(() => { /* sin red: no importa */ });
        }
        await Promise.all([wipe(K_ACCESS), wipe(K_REFRESH), wipe(K_USER)]);
    },

    hasRole: (...roles) => {
        const mine = get().user?.roles ?? [];
        return roles.some((r) => mine.includes(r));
    },
}));

/** Resultado del primer paso del login. */
export type ResultadoLogin =
    | { tipo: 'sesion'; user: AppUser }
    /** La cuenta tiene verificación en dos pasos: falta el código. */
    | { tipo: 'segundo-factor'; mfaToken: string };

/** POST sin el interceptor (para no re-entrar). Lanza con un mensaje en español. */
async function postAuth(path: string, body: unknown): Promise<any> {
    let res: Response;
    try {
        res = await fetch(`${API_BASE_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        throw new Error(SIN_CONEXION);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 429) throw new Error('Hiciste muchos intentos seguidos. Esperá unos minutos y probá de nuevo.');
        if (res.status >= 500) throw new Error('El servidor tuvo un problema. Probá de nuevo en un rato.');
        throw new Error(typeof data?.message === 'string' && data.message ? data.message : 'No pudimos iniciar sesión. Revisá tus datos.');
    }
    return data;
}

/** Guarda la sesión que devolvió el backend (login o segundo factor). */
async function guardarSesion(data: any): Promise<AppUser> {
    const user: AppUser = data?.user;
    const tokens = data?.tokens;
    if (!user || !tokens?.access || !tokens?.refresh) {
        throw new Error('No pudimos iniciar sesión. Probá de nuevo.');
    }
    // Rol que exige 2FA y todavía no lo activó: la sesión sólo sirve para
    // configurarlo, y eso se hace en la web. No se guarda.
    if (data.user.mfaPendiente) {
        fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: tokens.refresh }),
        }).catch(() => { /* best-effort */ });
        throw new Error('Tu rol exige la verificación en dos pasos. Activala en la versión web y volvé a entrar.');
    }
    await useAuthStore.getState().setSession(user, tokens.access, tokens.refresh);
    return user;
}

/**
 * Login directo. Si la cuenta tiene verificación en dos pasos, devuelve el token
 * de 5 minutos para pedir el código (`loginSegundoFactor`); si no, guarda la sesión.
 */
export async function login(email: string, password: string): Promise<ResultadoLogin> {
    const data = await postAuth('/auth/login', { email, password });
    if (data?.requires2fa && typeof data.mfaToken === 'string') {
        return { tipo: 'segundo-factor', mfaToken: data.mfaToken };
    }
    return { tipo: 'sesion', user: await guardarSesion(data) };
}

/** Segundo paso: el código de la app autenticadora o uno de recuperación. */
export async function loginSegundoFactor(mfaToken: string, codigo: string, esRecuperacion: boolean): Promise<AppUser> {
    const data = await postAuth('/auth/login/2fa', esRecuperacion
        ? { mfaToken, recoveryCode: codigo }
        : { mfaToken, code: codigo });
    return guardarSesion(data);
}
