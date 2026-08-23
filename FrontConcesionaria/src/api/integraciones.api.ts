import apiClient from './client';

/** Canales de ingesta de consultas soportados. */
export type IntegracionTipo = 'meta' | 'email';

/**
 * Config de la integración tal como viaja por la API. Es la unión laxa de los
 * campos de ambos tipos (el backend valida con Zod discriminado por `tipo`):
 * - meta:  origen ('instagram'|'facebook'), verifyToken, appSecret, pageAccessToken
 * - email: origen (default 'deruedas'), host, port, secure, user, pass, carpeta
 * En los GET los campos secretos (appSecret/pageAccessToken/pass) vienen
 * ENMASCARADOS ('••••' + últimos 4). En el PATCH, un secreto omitido o vacío
 * significa "conservar el guardado".
 */
export interface IntegracionConfig {
    origen?: string;
    verifyToken?: string;
    appSecret?: string;
    pageAccessToken?: string;
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    carpeta?: string;
}

export interface Integracion {
    id: number;
    concesionariaId: number;
    tipo: IntegracionTipo;
    nombre: string;
    activo: boolean;
    config: IntegracionConfig;
    ultimoEvento: string | null;
    ultimoError: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
}

export interface CreateIntegracionDto {
    tipo: IntegracionTipo;
    nombre: string;
    config: IntegracionConfig;
}

export interface UpdateIntegracionDto {
    nombre?: string;
    activo?: boolean;
    config?: IntegracionConfig;
}

export const integracionesApi = {
    getAll: () =>
        apiClient.get<Integracion[]>('/integraciones'),

    create: (data: CreateIntegracionDto) =>
        apiClient.post<Integracion>('/integraciones', data),

    update: (id: number, data: UpdateIntegracionDto) =>
        apiClient.patch<Integracion>(`/integraciones/${id}`, data),

    delete: (id: number) =>
        apiClient.delete<void>(`/integraciones/${id}`),
};

export default integracionesApi;
