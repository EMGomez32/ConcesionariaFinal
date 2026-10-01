import client from './client';

export interface MfaStatus {
    activo: boolean;
    codigosRestantes: number;
    /** El rol del usuario exige 2FA: no se puede desactivar. */
    obligatorio: boolean;
}

export interface UsuarioSesion {
    id: number;
    nombre: string;
    email: string;
    roles: string[];
    concesionariaId: number | null;
    sucursalId: number | null;
    mfaActivo?: boolean;
    mfaPendiente?: boolean;
}

export interface SesionResponse {
    user: UsuarioSesion;
    tokens: { access: string; refresh: string };
}

/** Lo que devuelve /auth/login: sesión directa, o "falta el segundo factor". */
export type LoginResponse = SesionResponse | { requires2fa: true; mfaToken: string };

export const esSegundoPaso = (r: LoginResponse): r is { requires2fa: true; mfaToken: string } =>
    (r as { requires2fa?: boolean }).requires2fa === true;

export const mfaApi = {
    status: () => client.get<MfaStatus>('/auth/2fa/status'),

    /** Paso 1: genera el secreto (todavía no activa nada). Pide la contraseña actual. */
    setup: (password: string) =>
        client.post<{ secreto: string; otpauthUrl: string }>('/auth/2fa/setup', { password }),

    /** Paso 2: confirma con un código de la app. Devuelve los códigos de recuperación (UNA vez) y una sesión nueva. */
    enable: (code: string) =>
        client.post<SesionResponse & { codigosRecuperacion: string[] }>('/auth/2fa/enable', { code }),

    disable: (password: string, factor: { code?: string; recoveryCode?: string }) =>
        client.post<void>('/auth/2fa/disable', { password, ...factor }),

    regenerarCodigos: (password: string, code: string) =>
        client.post<{ codigosRecuperacion: string[] }>('/auth/2fa/recovery-codes', { password, code }),

    /** Segundo paso del login. */
    login2fa: (mfaToken: string, factor: { code?: string; recoveryCode?: string }) =>
        client.post<SesionResponse & { usoRecuperacion?: boolean }>('/auth/login/2fa', { mfaToken, ...factor }),

    /** Admin: resetea el 2FA de un usuario que perdió el dispositivo. */
    resetDeUsuario: (usuarioId: number) => client.post<void>(`/usuarios/${usuarioId}/2fa/reset`, {}),
};
