import apiClient from './client';

/**
 * Integración con Mercado Libre: una cuenta de ML vinculada por OAuth a la
 * concesionaria, las publicaciones de sus vehículos y las preguntas que entran.
 *
 * Ciclo del vínculo (OAuth de página completa, ML no permite iframes):
 *   POST /mercadolibre/vincular  →  { url }  →  window.location.assign(url)
 *   el usuario autoriza en ML  →  ML llama al callback público del backend
 *   →  el backend canja el `code` y redirige a /configuracion?ml=ok|error
 *
 * Los tokens viven cifrados en el backend y se renuevan solos; cuando ML deja de
 * aceptarlos, la cuenta queda con `ultimoError` y hay que volver a autorizar.
 *
 * Aparte del vínculo real existe el MODO DEMOSTRACIÓN: una cuenta simulada que se
 * da de alta sin OAuth y cuyas llamadas nunca salen a la red de Mercado Libre.
 * Recorre el mismo circuito (publicar, sincronizar, contestar) para poder mostrar
 * la integración sin credenciales y sin publicar avisos de verdad, y por eso todo
 * lo que sale de ella tiene que llegar ROTULADO a la pantalla.
 */

/** Origen de la cuenta. `demo` = simulada dentro del sistema, sin conexión con ML. */
export type ModoCuentaMl = 'real' | 'demo';

/** Estado del ítem en Mercado Libre. `borrador` = creado acá, todavía no subido. */
export type EstadoPublicacionMl = 'borrador' | 'activa' | 'pausada' | 'cerrada' | 'error';

/** `eliminada` la marca ML cuando el comprador borra su propia pregunta. */
export type EstadoPreguntaMl = 'sin_responder' | 'respondida' | 'eliminada';

/** Referencia mínima a un usuario del sistema (asignado / autor de la respuesta). */
export interface UsuarioRefMl {
    id: number;
    nombre: string;
}

/** La cuenta de ML vinculada, tal como la expone el backend (sin tokens). */
export interface CuentaMlResumen {
    id: number;
    /** Id del usuario DENTRO de Mercado Libre (no el id de nuestra tabla). */
    mlUserId: string;
    nickname: string | null;
    /** Sitio de ML: MLA = Argentina. Define categorías, moneda y tipos de publicación. */
    siteId: string;
    activa: boolean;
    /** Vencimiento del access token; el worker lo renueva antes de que caiga. */
    expiraEn: string | null;
    /** Último fallo contra la API de ML. Si tiene valor, casi siempre hay que re-autorizar. */
    ultimoError: string | null;
    /** `demo` = cuenta simulada: no hay OAuth detrás y ninguna llamada sale a la red. */
    modo: ModoCuentaMl;
    /** Atajo de `modo === 'demo'`: es el flag con el que la pantalla rotula la simulación. */
    demo: boolean;
    createdAt?: string;
    updatedAt?: string;
}

/**
 * Respuesta de GET /mercadolibre/cuenta. Son dos cosas distintas:
 * - `configurada`: el SERVIDOR tiene ML_CLIENT_ID / ML_CLIENT_SECRET. Sin esto no
 *   hay OAuth posible y no sirve mostrar el botón de conectar.
 * - `conectada`: esta concesionaria ya autorizó una cuenta de ML.
 */
export interface EstadoCuentaMl {
    conectada: boolean;
    configurada: boolean;
    cuenta?: CuentaMlResumen | null;
    /**
     * El backend rotula el modo también en la raíz de la respuesta; ver `esCuentaDemo`.
     * Viaja en `null` cuando no hay cuenta vinculada (`modo: cuenta?.modo ?? null`),
     * así que el tipo lo admite: escribir sólo `ModoCuentaMl` sería mentirle al resto
     * del front sobre lo que de verdad llega.
     */
    modo?: ModoCuentaMl | null;
    demo?: boolean;
}

/**
 * Si la cuenta vinculada es simulada. El rótulo de simulación es lo que le permite
 * a quien mira la pantalla distinguir lo conectado de lo simulado, así que no puede
 * depender de en qué nivel del payload viaje el flag: alcanza con que UNO diga demo.
 */
export const esCuentaDemo = (estado?: EstadoCuentaMl | null): boolean =>
    estado?.demo === true
    || estado?.modo === 'demo'
    || estado?.cuenta?.demo === true
    || estado?.cuenta?.modo === 'demo';

/** Lo que devuelve la siembra de preguntas de ejemplo. */
export interface SiembraPreguntasDemo {
    /** Optativo: el backend puede confirmar el alta sin informar el conteo. */
    creadas?: number;
    /**
     * Las que ya estaban sembradas sobre esas publicaciones. La siembra es
     * idempotente (el id de cada pregunta sale de publicación + plantilla), así
     * que volver a apretar el botón no duplica el lote: el aviso lo tiene que
     * decir en vez de anunciar preguntas nuevas que no se crearon.
     */
    yaExistian?: number;
}

/** Lo que devuelve apagar la demostración. */
export interface BajaDemo {
    publicacionesEliminadas: number;
    preguntasEliminadas: number;
    /**
     * Clientes del CRM que nacieron de una pregunta simulada y NO se borran (la
     * ingesta pudo haber actualizado un cliente real preexistente). Quedan
     * rotulados en Clientes; el aviso de salida los nombra para que nadie los
     * descubra después mezclados con los leads de verdad.
     */
    clientesConservados: number;
}

/** Lo que devuelve el inicio del OAuth: la URL de autorización de ML. */
export interface UrlDeVinculacion {
    url: string;
}

/**
 * Modalidad de publicación. Cada una cuesta distinto, por eso los costos se traen
 * EN VIVO de ML para el precio y la categoría concretos del vehículo.
 * `costoPublicacion` es el cargo fijo por publicar y `comisionVenta` lo que ML se
 * queda si se vende.
 *
 * OJO con el `null`: significa DESCONOCIDO (ML no devolvió la grilla de tarifas y
 * el backend cayó a los tipos básicos), NO gratis — el cero explícito es `0`.
 * Mostrarlo como "sin costo" le miente al usuario justo antes de un cargo real.
 */
export interface TipoDePublicacion {
    listingTypeId: string;
    nombre: string;
    costoPublicacion: number | null;
    comisionVenta: number | null;
    moneda: string;
}

/**
 * Previa de la publicación: lo que se va a mandar a ML más las advertencias que el
 * usuario tiene que ver ANTES de gastar un cargo de publicación (fotos no
 * alcanzables desde internet, atributos obligatorios sin completar, etc.).
 */
export interface OpcionesPublicacion {
    vehiculoId: number;
    titulo: string;
    categoriaId: string | null;
    categoriaNombre: string | null;
    precio: number | null;
    moneda: string;
    /** Cantidad de fotos que se van a subir. ML exige al menos una. */
    fotos: number;
    /** Atributos que ML marca como requeridos y el vehículo no tiene cargados. */
    atributosFaltantes: Array<{ id: string; nombre: string }>;
    advertencias: string[];
    tipos: TipoDePublicacion[];
}

/** Cuerpo del POST de publicación: el tipo lo elige el usuario viendo los costos. */
export interface PublicarVehiculoDto {
    listingTypeId: string;
    /** Sobrescribe el título sugerido. */
    titulo?: string;
    /** Sobrescribe la categoría sugerida por ML. */
    categoriaId?: string;
}

/**
 * El ítem publicado. `itemId`/`permalink` recién existen cuando ML aceptó el alta.
 * Los importes vienen de un Decimal de Prisma: pueden llegar como string.
 */
export interface PublicacionMl {
    id: number;
    concesionariaId: number;
    cuentaId: number;
    vehiculoId: number;
    itemId: string | null;
    permalink: string | null;
    estado: EstadoPublicacionMl;
    listingTypeId: string;
    categoriaId: string | null;
    titulo: string;
    precioPublicado: number | string | null;
    monedaPublicada: string | null;
    ultimoError: string | null;
    /** Última vez que se empujó precio/estado hacia ML. */
    ultimaSyncAt: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Datos del vehículo que el backend embebe para no pedirlo aparte. */
export interface VehiculoRefMl {
    id: number;
    marca: string;
    modelo: string;
    version?: string | null;
    anio?: number | null;
    dominio?: string | null;
}

/** La publicación embebida dentro de una pregunta (con su vehículo). */
export interface PublicacionRefMl {
    id: number;
    itemId: string | null;
    permalink: string | null;
    titulo: string;
    estado: EstadoPublicacionMl;
    vehiculo?: VehiculoRefMl | null;
}

/**
 * Pregunta entrante de una publicación. Llega por webhook de ML (topic
 * `questions`) y, como respaldo, por la pasada periódica del worker.
 * `clienteId` se completa recién si alguien la registra como lead.
 */
export interface PreguntaMl {
    id: number;
    concesionariaId: number;
    cuentaId: number;
    publicacionId: number | null;
    /** Id de la pregunta en ML: es la clave que evita duplicar en la ingesta. */
    mlQuestionId: string;
    itemId: string;
    mlFromUserId: string | null;
    nombreContacto: string | null;
    texto: string;
    respuesta: string | null;
    estado: EstadoPreguntaMl;
    asignadoAId: number | null;
    clienteId: number | null;
    preguntadaEn: string;
    respondidaEn: string | null;
    respondidaPorId: number | null;
    createdAt: string;
    updatedAt: string;
    publicacion?: PublicacionRefMl | null;
    asignadoA?: UsuarioRefMl | null;
    respondidaPor?: UsuarioRefMl | null;
    cliente?: { id: number; nombre: string } | null;
}

export interface PreguntasFilter {
    estado?: EstadoPreguntaMl;
    asignadoAId?: number;
    /** Sólo las asignadas al usuario logueado (lo resuelve el backend con el token). */
    soloMias?: boolean;
}

/** Página del listado de preguntas. Ojo: es `total`, no `totalResults`. */
export interface ListaPreguntas {
    results: PreguntaMl[];
    total: number;
    page: number;
    limit: number;
    /**
     * La cuenta vigente del tenant es simulada. Viaja en el LISTADO porque GET
     * /mercadolibre/cuenta es admin-only: sin esto, para un vendedor el rótulo
     * dependía de que hubiera filas con id DEMO-, y con la bandeja vacía (todo
     * contestado, o el filtro "Eliminadas") la pantalla se presentaba como una
     * bandeja de Mercado Libre en producción.
     */
    demo?: boolean;
}

/** Alta del lead a partir de una pregunta: deduplica contra los clientes del tenant. */
export interface CrearLeadDto {
    nombre?: string;
    telefono?: string;
    email?: string;
    vendedorId?: number | null;
}

export interface CrearLeadResultado {
    clienteId: number;
    /** true = se creó un cliente nuevo; false = se ató a uno existente. */
    creado: boolean;
    /**
     * La pregunta era simulada: el cliente quedó marcado como tal en el CRM. El
     * aviso de éxito lo repite — es el único paso del circuito por el que algo
     * simulado se convierte en un dato permanente.
     */
    simulada?: boolean;
}

export const mercadolibreApi = {
    // ─── Cuenta ─────────────────────────────────────────────────────────────

    /** Estado del vínculo + si el servidor tiene las credenciales de la app de ML. */
    getCuenta: () =>
        apiClient.get<EstadoCuentaMl>('/mercadolibre/cuenta'),

    /**
     * Arranca el OAuth: devuelve la URL de ML a la que hay que redirigir la página.
     *
     * `withCredentials` NO es opcional: la respuesta trae una cookie httpOnly con
     * el nonce del `state`, y el callback la exige para confirmar que quien vuelve
     * de Mercado Libre es el MISMO navegador que arrancó el flujo. Sin ella, un
     * link de vinculación ajeno (o copiado de un log) alcanzaría para colgar una
     * cuenta de ML en el tenant de otro. En dev el front es cross-origin y el
     * navegador descarta el Set-Cookie si no se pide explícitamente.
     */
    vincular: () =>
        apiClient.post<UrlDeVinculacion>('/mercadolibre/vincular', undefined, { withCredentials: true }),

    /** Suelta la cuenta: las publicaciones quedan en ML, pero el sistema deja de sincronizarlas. */
    desvincular: (id: number) =>
        apiClient.delete<void>(`/mercadolibre/cuenta/${id}`),

    // ─── Modo demostración ──────────────────────────────────────────────────

    /**
     * Da de alta la cuenta simulada del tenant. No hay OAuth ni credenciales: es
     * el interruptor que hace que las llamadas las conteste el simulador en vez
     * de la red. El backend lo rechaza (409) si ya hay una cuenta REAL activa,
     * para que nunca convivan lo publicado de verdad y lo simulado.
     *
     * La pantalla igual vuelve a pedir GET /mercadolibre/cuenta después: el alta
     * es el disparador, el estado rotulado sigue saliendo de ahí.
     */
    activarDemo: () =>
        apiClient.post<CuentaMlResumen>('/mercadolibre/demo'),

    /**
     * Apaga la demostración y borra la cuenta simulada con sus publicaciones y
     * preguntas. Es a propósito destructivo: nada de eso existió nunca fuera del
     * sistema, y así la demostración se puede repetir desde cero.
     */
    desactivarDemo: () =>
        apiClient.delete<BajaDemo>('/mercadolibre/demo'),

    /**
     * Siembra preguntas de compradores ficticios sobre las publicaciones
     * simuladas. Devuelve 409 si todavía no hay ninguna publicada: sin publicación
     * no hay a qué colgarlas.
     */
    sembrarPreguntasDemo: () =>
        apiClient.post<SiembraPreguntasDemo>('/mercadolibre/demo/preguntas'),

    // ─── Publicaciones ──────────────────────────────────────────────────────

    /** Previa: título, categoría, advertencias y los tipos de publicación con su costo real. */
    opciones: (vehiculoId: number) =>
        apiClient.get<OpcionesPublicacion>(`/mercadolibre/vehiculos/${vehiculoId}/opciones`),

    /** Publica el vehículo con el tipo elegido. Es la acción que puede tener costo. */
    publicar: (vehiculoId: number, data: PublicarVehiculoDto) =>
        apiClient.post<PublicacionMl>(`/mercadolibre/vehiculos/${vehiculoId}/publicar`, data),

    /** Publicación vigente del vehículo, o null si nunca se publicó. */
    getPublicacion: (vehiculoId: number) =>
        apiClient.get<PublicacionMl | null>(`/mercadolibre/vehiculos/${vehiculoId}/publicacion`),

    pausar: (id: number) =>
        apiClient.post<PublicacionMl>(`/mercadolibre/publicaciones/${id}/pausar`),

    reactivar: (id: number) =>
        apiClient.post<PublicacionMl>(`/mercadolibre/publicaciones/${id}/reactivar`),

    /** Cierra el ítem en ML. En ML es irreversible: no se puede reabrir. */
    cerrar: (id: number) =>
        apiClient.post<PublicacionMl>(`/mercadolibre/publicaciones/${id}/cerrar`),

    /**
     * Reconciliación manual: espeja lo que dice ML y le vuelve a empujar el
     * precio y el estado actuales del vehículo (normalmente lo hace solo el
     * worker). Necesita que la publicación tenga `itemId`.
     */
    sincronizar: (id: number) =>
        apiClient.post<PublicacionMl>(`/mercadolibre/publicaciones/${id}/sincronizar`),

    // ─── Preguntas ──────────────────────────────────────────────────────────

    getPreguntas: (filters: PreguntasFilter = {}, options: { page?: number; limit?: number } = {}) =>
        apiClient.get<ListaPreguntas>('/mercadolibre/preguntas', {
            params: { ...filters, ...options },
        }),

    /** Publica la respuesta en ML y la deja registrada acá con su autor. */
    responder: (id: number, texto: string) =>
        apiClient.post<PreguntaMl>(`/mercadolibre/preguntas/${id}/responder`, { texto }),

    /** `usuarioId: null` la devuelve al pool sin dueño. */
    asignar: (id: number, usuarioId: number | null) =>
        apiClient.post<PreguntaMl>(`/mercadolibre/preguntas/${id}/asignar`, { usuarioId }),

    /** Registra al que preguntó como consulta/lead del CRM (origen `mercadolibre`). */
    crearLead: (id: number, data: CrearLeadDto = {}) =>
        apiClient.post<CrearLeadResultado>(`/mercadolibre/preguntas/${id}/lead`, data),

    /**
     * Pasada manual de ingesta: trae las preguntas que el webhook se haya
     * perdido. `fallidas` son las que Mercado Libre devolvió pero no se pudieron
     * guardar (el detalle queda en el log del servidor).
     */
    sincronizarAhora: () =>
        apiClient.post<{ nuevas: number; fallidas: number }>('/mercadolibre/sincronizar'),
};

export default mercadolibreApi;
