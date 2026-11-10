/**
 * Helpers de integración compartidos entre tests.
 * Apuntan al stack docker corriendo (default http://localhost:3000).
 */
import axios, { AxiosInstance, AxiosError } from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/** Cliente HTTP que NO falla en 4xx/5xx — los tests inspeccionan el status. */
export const api: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true,
    headers: { 'Content-Type': 'application/json' },
});

export interface AuthSession {
    token: string;
    user: {
        id: number;
        email: string;
        nombre: string;
        roles: string[];
        concesionariaId: number | null;
        sucursalId: number | null;
    };
}

/** Hace login y devuelve token + perfil. Usar las funciones específicas abajo. */
export async function login(email: string, password: string): Promise<AuthSession> {
    const res = await api.post('/api/auth/login', { email, password });
    if (res.status !== 200) {
        throw new Error(`Login fallido (${res.status}): ${JSON.stringify(res.data)}`);
    }
    return {
        token: res.data.tokens.access,
        user: res.data.user,
    };
}

export const loginAsSuperAdmin = () =>
    login('superadmin@demo.com', 'super123');

export const loginAsAdmin = () =>
    login('admin@demo.com', 'admin123');

/**
 * Concesionaria de prueba: la del admin del seed. El super_admin del seed es una cuenta
 * de PLATAFORMA (APP-02: un super_admin no pertenece a ninguna concesionaria), así que
 * las suites que operan como super_admin sobre el tenant de prueba lo pasan explícito.
 */
export const concesionariaDeTest = async (): Promise<number> =>
    (await loginAsAdmin()).user.concesionariaId;

/** Headers `Authorization: Bearer ...` listos para spread en config. */
export const authHeaders = (token: string) => ({
    headers: { Authorization: `Bearer ${token}` },
});

/** Genera un sufijo único basado en timestamp + random — evita colisiones. */
export function unique(prefix = 'test'): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 6);
    return `${prefix}-${ts}-${rand}`;
}

/** Best-effort cleanup: ignora errores (la entidad puede ya no existir). */
export async function tryDelete(path: string, token: string): Promise<void> {
    try {
        await api.delete(path, authHeaders(token));
    } catch (err) {
        const e = err as AxiosError;
        if (e?.response?.status !== 404) {
            // Log silencioso, no romper el test por cleanup fallido
            // eslint-disable-next-line no-console
            console.warn(`[cleanup] DELETE ${path} → ${e?.response?.status}`);
        }
    }
}

/**
 * Motivo de anulación para los tests. Anular una venta exige motivo desde PROC-30
 * (DELETE /ventas/:id con `{ motivo }`, mínimo 10 caracteres).
 */
export const MOTIVO_TEST = 'Anulación de prueba del test de integración';

/** DELETE /ventas/:id con motivo. Devuelve la respuesta cruda (validateStatus siempre true). */
export const anularVenta = (ventaId: number, token: string, motivo: string = MOTIVO_TEST) =>
    api.delete(`/api/ventas/${ventaId}`, { ...authHeaders(token), data: { motivo } });

/** DELETE /reservas/:id con motivo (cancelar una seña lo exige desde PROC-33). */
export const cancelarReserva = (reservaId: number, token: string, motivo: string = MOTIVO_TEST) =>
    api.delete(`/api/reservas/${reservaId}`, { ...authHeaders(token), data: { motivo } });
