import apiClient from './client';

/** Canales de ingesta de consultas soportados. */
export type IntegracionTipo = 'meta' | 'email';

/**
 * Cómo se atiende una integración. `demo` = SIMULADA dentro del sistema: no hay
 * credenciales de Meta detrás, ninguna llamada sale a la red y las
 * conversaciones las siembra el propio sistema.
 *
 * Existe por lo mismo que el modo demostración de Mercado Libre: los cuatro
 * canales de Meta (DM de Instagram, Messenger y los comentarios de ambos)
 * dependen del App Review, que tarda, y la bandeja hay que poder mostrarla
 * antes. Todo lo que sale de una integración demo va ROTULADO en pantalla.
 */
export type ModoIntegracion = 'real' | 'demo';

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
    /**
     * `demo` = integración simulada. Sus canales se reportan habilitados SIN
     * credenciales (si no, el composer de la bandeja quedaría bloqueado y no
     * habría nada que demostrar), así que el modo es el único dato que
     * distingue "conectado de verdad" de "simulado" en esta pantalla.
     */
    modo?: ModoIntegracion;
    /** Atajo de `modo === 'demo'`. Se lee con `esIntegracionDemo`. */
    demo?: boolean;
    ultimoEvento: string | null;
    ultimoError: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
}

/**
 * Si la integración es la simulada. Igual que `esCuentaDemo` de Mercado Libre:
 * el rótulo no puede depender de en qué campo viaje el flag, alcanza con que uno
 * diga demo.
 */
export const esIntegracionDemo = (
    integracion?: { modo?: ModoIntegracion | null; demo?: boolean | null } | null,
): boolean => integracion?.demo === true || integracion?.modo === 'demo';

/**
 * Lo que devuelve encender el modo demostración. Es la integración creada (misma
 * forma que las del listado) más `creada`, que distingue el alta de la
 * reactivación: el alta es idempotente, apretar dos veces no crea una segunda.
 */
export interface AltaDemoMeta extends Partial<Integracion> {
    creada?: boolean;
}

/**
 * Lo que devuelve sembrar las conversaciones de ejemplo. La siembra es
 * idempotente (las claves de hilo son determinísticas), así que `yaExistian`
 * dice cuántas ya estaban: sin ese número el aviso anunciaría conversaciones
 * nuevas que no se crearon.
 */
export interface SiembraConversacionesDemo {
    creadas?: number;
    /** Las que ya estaban: no se duplican, se REINICIAN para que la bandeja
     *  vuelva a verse recién llegada y la demostración se pueda repetir. */
    yaExistian?: number;
    mensajesCreados?: number;
    /** Respuestas de la demostración anterior que se descartaron al reiniciar
     *  los hilos. Reiniciar es reiniciar: si quedaran, la fila de la bandeja
     *  mostraría la frase del propio vendedor como si la hubiera escrito el
     *  comprador. El aviso lo nombra para que no sea una sorpresa. */
    respuestasDescartadas?: number;
}

/**
 * Lo que devuelve apagar la demostración. Los clientes NO se borran: la consulta
 * pudo haber deduplicado contra una ficha REAL preexistente, y un borrado en
 * cascada se la llevaría puesta. Quedan rotulados en Clientes y se cuentan acá,
 * que es lo único que avisa que en el CRM quedó algo de la demostración.
 */
export interface BajaDemoMeta {
    conversacionesEliminadas?: number;
    mensajesEliminados?: number;
    clientesConservados?: number;
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

    // ─── Modo demostración de Meta ──────────────────────────────────────────

    /**
     * Crea la integración de Meta simulada del tenant. No pide credenciales
     * porque no hay ninguna que guardar: es el interruptor que hace que los
     * cuatro canales queden habilitados sin token y que el envío se resuelva
     * adentro del sistema. El backend lo rechaza (409) si ya hay una integración
     * meta REAL activa, para que no convivan en la misma pantalla lo conectado
     * y lo simulado.
     */
    activarDemo: () =>
        apiClient.post<AltaDemoMeta>('/integraciones/demo'),

    /**
     * Siembra las conversaciones de ejemplo en los cuatro canales (DM de
     * Instagram con la ventana abierta y con la ventana vencida, Messenger y un
     * comentario). Idempotente: apretarlo dos veces no duplica el lote.
     */
    sembrarConversacionesDemo: () =>
        apiClient.post<SiembraConversacionesDemo>('/integraciones/demo/conversaciones'),

    /**
     * Apaga la demostración y borra la integración simulada CON todas sus
     * conversaciones y mensajes. Es destructivo a propósito: nada de eso existió
     * nunca fuera del sistema y así la demostración se repite desde cero.
     */
    desactivarDemo: () =>
        apiClient.delete<BajaDemoMeta>('/integraciones/demo'),
};

export default integracionesApi;
