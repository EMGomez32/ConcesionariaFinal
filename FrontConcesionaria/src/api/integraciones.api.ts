import apiClient from './client';

/** Canales de ingesta de consultas soportados. */
export type IntegracionTipo = 'meta' | 'email';

/**
 * Config de la integración tal como viaja por la API. Es la unión laxa de los
 * campos de ambos tipos (el backend valida con Zod discriminado por `tipo`):
 * - meta:  origen ('instagram'|'facebook'), verifyToken, appSecret,
 *          pageAccessToken, pageId, igBusinessAccountId, instagramAccessToken
 * - email: origen (default 'deruedas'), host, port, secure, user, pass, carpeta
 * En los GET los campos secretos (appSecret/pageAccessToken/
 * instagramAccessToken/pass) vienen ENMASCARADOS ('••••' + últimos 4, o
 * '••••••••' si están cifrados en reposo). En el PATCH, un secreto omitido o
 * vacío significa "conservar el guardado".
 *
 * Los ids (pageId, igBusinessAccountId) NO son secretos: se muestran completos
 * y, a diferencia de los secretos, mandarlos en '' los BORRA.
 */
export interface IntegracionConfig {
    origen?: string;
    verifyToken?: string;
    appSecret?: string;
    pageAccessToken?: string;
    /** Id numérico de la página de Facebook: habilita Messenger y comentarios de la página. */
    pageId?: string;
    /** Id de la cuenta profesional de Instagram: habilita DM y comentarios de IG. */
    igBusinessAccountId?: string;
    /** Token propio de Instagram; sólo si la app usa el flujo "Instagram Login". */
    instagramAccessToken?: string;
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    carpeta?: string;
}

/** Canales que puede atender una integración de Meta (espejo de CanalMeta del back). */
export type CanalMeta =
    | 'leadgen'
    | 'messenger'
    | 'instagram'
    | 'facebook_comentario'
    | 'instagram_comentario';

/**
 * Estado de un canal, derivado por el backend de lo que hay cargado en la
 * config. `habilitado` dice si de NUESTRO lado no falta nada; `falta` dice qué
 * campo completar acá; `enMeta` dice qué hay que suscribir/permitir en el
 * portal de Meta (eso no lo podemos verificar, se muestra como instrucción).
 */
export interface EstadoCanal {
    canal: CanalMeta;
    etiqueta: string;
    objeto: 'page' | 'instagram';
    campo: string;
    habilitado: boolean;
    falta: string | null;
    enMeta: string;
}

export interface Integracion {
    id: number;
    concesionariaId: number;
    tipo: IntegracionTipo;
    nombre: string;
    activo: boolean;
    config: IntegracionConfig;
    /** Derivado, no persistido. Vacío para las integraciones de tipo 'email'. */
    canales: EstadoCanal[];
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
