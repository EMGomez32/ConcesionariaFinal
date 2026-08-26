import client from './client';
import type { EstadoLead, OrigenLead } from '../types/cliente.types';
import type { CondicionTasacion } from '../types/tasacion.types';
import type { TipoSeguimiento } from './seguimientos.api';

/**
 * MÓDULO DEL VENDEDOR — atención presencial.
 *
 * Espejo EXACTO de `interface/routes/atencion.routes.ts` y
 * `interface/routes/precio-minimo.routes.ts` del backend. Cuando cambie una ruta
 * allá, cambia acá en la misma pasada.
 *
 * REGLA DE ORO (criterio de aceptación 7): ningún tipo de este archivo lleva
 * `precioCompra`, costo de preparación, margen ni proveedor — el backend ni
 * siquiera los trae de la base (ver `UNIDAD_SELECT` en atencionService). El
 * `precioMinimo` tampoco viaja con la unidad: se pide aparte y sólo llega con una
 * autorización vigente (`precioMinimoApi.vigentePorVehiculo`).
 */

// ───────────────────────────────────────────────────────────────────────────
// ENUMS (espejo de prisma/schema.prisma)
// ───────────────────────────────────────────────────────────────────────────

export type CanalAtencion = 'presencial';
export type MotivoAtencion = 'consulta_general' | 'unidad_puntual' | 'vuelve_por_atencion_anterior';
export type EstadoAtencion = 'abierta' | 'cerrada';
export type ResultadoAtencion =
    | 'reserva'
    | 'cotizacion'
    | 'test_drive'
    | 'permuta_a_tasar'
    | 'en_analisis'
    | 'sin_unidad'
    | 'se_retiro';
export type ModoBusqueda = 'presupuesto' | 'modelo' | 'unidad';
export type TipoFinanciamiento = 'contado' | 'credito' | 'plan_de_ahorro';
export type TipoAtencionVehiculo = 'buscada' | 'sugerida';
export type AccionAtencionVehiculo = 'vista' | 'test_drive' | 'cotizada' | 'reservada';
export type NivelInteres = 'bajo' | 'medio' | 'alto';
export type EstadoPermuta = 'sin_tasar' | 'tasada' | 'rechazada';

/**
 * Los importes vienen de columnas `Decimal` de Prisma, que se serializan como
 * STRING. Tipar esto como `number` compila pero después `precio.toFixed()` explota
 * en runtime, así que se nombra el hecho y se convierte con `montoANumero`.
 */
export type Importe = number | string | null;

export const montoANumero = (v: Importe | undefined): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

// ───────────────────────────────────────────────────────────────────────────
// CÓDIGOS DE ERROR DEL BACKEND
// ───────────────────────────────────────────────────────────────────────────

/**
 * El handler de errores responde `{ error: <CODE>, message, details? }` y el
 * interceptor de axios rechaza con ese cuerpo. Estos códigos NO son fallas: son
 * pasos del flujo que la pantalla tiene que atender (confirmar que atiende a un
 * cliente ajeno, pedirle los datos al cliente, avisar que sólo tasa el tasador).
 * Tratarlos como "error inesperado" sería justamente perder el flujo.
 */
export interface ErrorApi {
    error?: string;
    message?: string;
    details?: { faltantes?: string[]; resultado?: string; [k: string]: unknown };
}

export const codigoDeError = (e: unknown): string | null =>
    (e && typeof e === 'object' && typeof (e as ErrorApi).error === 'string') ? (e as ErrorApi).error! : null;

export const detallesDeError = (e: unknown): ErrorApi['details'] =>
    (e && typeof e === 'object') ? (e as ErrorApi).details : undefined;

export const COD_CLIENTE_AJENO = 'CLIENTE_ASIGNADO_A_OTRO_VENDEDOR';
export const COD_DATOS_CLIENTE = 'DATOS_CLIENTE_REQUERIDOS';
export const COD_CONSENTIMIENTO = 'CONSENTIMIENTO_REQUERIDO';
export const COD_SOLO_TASADOR = 'TASACION_SOLO_TASADOR';
export const COD_ATENCION_CERRADA = 'ATENCION_CERRADA';

/** Los dos 409 del enriquecimiento progresivo se atienden con el mismo formulario. */
export const faltanDatosDelCliente = (e: unknown): boolean => {
    const c = codigoDeError(e);
    return c === COD_DATOS_CLIENTE || c === COD_CONSENTIMIENTO;
};

// ───────────────────────────────────────────────────────────────────────────
// TABLAS DE PRESENTACIÓN
// ───────────────────────────────────────────────────────────────────────────

export const MOTIVO_ATENCION_LABEL: Record<MotivoAtencion, string> = {
    consulta_general: 'Consulta general',
    unidad_puntual: 'Vino por una unidad puntual',
    vuelve_por_atencion_anterior: 'Vuelve por una atención anterior',
};

/**
 * Los 7 desenlaces del cierre.
 *
 * `definitivo` ESPEJA `RESULTADOS_DEFINITIVOS` de `atencionService.ts`, que hoy es
 * exactamente `['reserva', 'sin_unidad']`. Todo lo demás exige próximo contacto
 * (fecha + medio) para poder cerrar.
 *
 * OJO con la intuición: "cotización entregada" y "test drive realizado" NO son
 * definitivos, y es correcto — el cliente se fue con un papel o probó un auto, la
 * operación sigue viva y alguien tiene que volver a llamarlo. Si el backend cambia
 * esa lista, se cambia acá en la misma pasada; si no, la pantalla habilita el
 * botón y el servidor contesta 409 con el cliente parado enfrente.
 *
 * `ayuda` es el texto que se le muestra al vendedor: son siete opciones y a la
 * quinta visita del día ya no se distinguen solas.
 */
export const RESULTADO_ATENCION_META: Record<
    ResultadoAtencion,
    { label: string; ayuda: string; definitivo: boolean; variant: 'success' | 'cyan' | 'violet' | 'warning' | 'danger' | 'default' }
> = {
    reserva: {
        label: 'Reserva / seña tomada',
        ayuda: 'Se llevó una unidad reservada con seña.',
        definitivo: true,
        variant: 'success',
    },
    sin_unidad: {
        label: 'No hay unidad que le sirva',
        ayuda: 'Hoy no tenemos lo que busca. Se cierra sin pendiente.',
        definitivo: true,
        variant: 'default',
    },
    cotizacion: {
        label: 'Cotización entregada',
        ayuda: 'Se fue con un presupuesto: hay que volver a llamarlo.',
        definitivo: false,
        variant: 'cyan',
    },
    test_drive: {
        label: 'Test drive realizado',
        ayuda: 'Probó una unidad. La operación sigue abierta.',
        definitivo: false,
        variant: 'violet',
    },
    permuta_a_tasar: {
        label: 'Permuta enviada a tasar',
        ayuda: 'Falta el valor de toma del usado.',
        definitivo: false,
        variant: 'warning',
    },
    en_analisis: {
        label: 'En análisis',
        ayuda: 'Lo está pensando. Requiere seguimiento.',
        definitivo: false,
        variant: 'warning',
    },
    se_retiro: {
        label: 'Se retiró sin definir',
        ayuda: 'Se fue sin dar una respuesta.',
        definitivo: false,
        variant: 'danger',
    },
};

/** Orden en que se le ofrecen al vendedor: primero los que cierran solos. */
export const RESULTADOS_ATENCION: ResultadoAtencion[] = [
    'reserva',
    'cotizacion',
    'test_drive',
    'permuta_a_tasar',
    'en_analisis',
    'sin_unidad',
    'se_retiro',
];

export const esResultadoDefinitivo = (r?: ResultadoAtencion | null): boolean =>
    !!r && RESULTADO_ATENCION_META[r].definitivo;

/**
 * Las cuatro acciones que el vendedor marca sobre una unidad. El orden ES una
 * escalera de compromiso: registrar de nuevo la misma unidad en la misma visita
 * SUBE la acción, no duplica la fila (`@@unique([atencionId, vehiculoId])`).
 *
 * Las tres últimas son "interés real" y el backend exige DNI, email, domicilio y
 * consentimiento antes de aceptarlas (enriquecimiento progresivo).
 */
export const ACCION_LABEL: Record<AccionAtencionVehiculo, string> = {
    vista: 'La vio',
    test_drive: 'Test drive',
    cotizada: 'Cotizada',
    reservada: 'Reservada',
};

export const ACCIONES: AccionAtencionVehiculo[] = ['vista', 'test_drive', 'cotizada', 'reservada'];

/** Las que disparan la exigencia de datos. Sirve para avisar ANTES de tocarlas. */
export const ACCIONES_DE_INTERES_REAL: AccionAtencionVehiculo[] = ['test_drive', 'cotizada', 'reservada'];

export const NIVEL_INTERES_LABEL: Record<NivelInteres, string> = {
    bajo: 'Bajo',
    medio: 'Medio',
    alto: 'Alto',
};

export const NIVELES_INTERES: NivelInteres[] = ['bajo', 'medio', 'alto'];

export const TIPO_FINANCIAMIENTO_LABEL: Record<TipoFinanciamiento, string> = {
    contado: 'Contado',
    credito: 'Crédito',
    plan_de_ahorro: 'Plan de ahorro',
};

/** Medios del próximo contacto: son los `TipoSeguimiento` del CRM, sin inventar otra agenda. */
export const MEDIO_CONTACTO_LABEL: Record<TipoSeguimiento, string> = {
    llamada: 'Llamada',
    whatsapp: 'WhatsApp',
    email: 'Email',
    visita: 'Visita al salón',
    otro: 'Otro',
};

export const MEDIOS_CONTACTO: TipoSeguimiento[] = ['llamada', 'whatsapp', 'email', 'visita', 'otro'];

export const ESTADO_PERMUTA_LABEL: Record<EstadoPermuta, string> = {
    sin_tasar: 'Sin tasar',
    tasada: 'Tasada',
    rechazada: 'Rechazada',
};

// ───────────────────────────────────────────────────────────────────────────
// ENTIDADES
// ───────────────────────────────────────────────────────────────────────────

/** La ficha del cliente como la ve el mostrador. */
export interface ClienteAtencion {
    id: number;
    nombre: string;
    apellido?: string | null;
    telefono?: string | null;
    email?: string | null;
    dni?: string | null;
    direccion?: string | null;
    estadoLead?: EstadoLead;
    origenLead?: OrigenLead | null;
    /** Ley 25.326: sin esto el backend no acepta interés real ni datos de contacto nuevos. */
    consentimientoContacto: boolean;
    consentimientoEn?: string | null;
    vendedorAsignadoId?: number | null;
    vendedorAsignado?: { id: number; nombre: string } | null;
    vendedorAsignadoEn?: string | null;
    ultimaInteraccionEn?: string | null;
    /** Se recorta a null para el vendedor puro que no es dueño del cliente. */
    observaciones?: string | null;
}

/**
 * Una unidad del stock como la ve el vendedor: es la proyección `UNIDAD_SELECT`
 * del backend, sin un solo campo de costo. `kmIngreso` y `precioLista` se llaman
 * así porque así se llaman en el modelo `Vehiculo`.
 */
export interface UnidadSugerida {
    id: number;
    marca: string;
    modelo: string;
    version?: string | null;
    anio?: number | null;
    dominio?: string | null;
    vin?: string | null;
    color?: string | null;
    estado: string;
    tipo?: string;
    kmIngreso?: number | null;
    precioLista?: Importe;
    moneda?: string;
    segmento?: string | null;
    /** Con esto se derivan los días en stock; no hay columna calculada. */
    fechaIngreso?: string | null;
    sucursalId?: number | null;
    sucursal?: { id: number; nombre: string } | null;
}

export interface Sugerencia {
    unidad: UnidadSugerida;
    /** Criterio de aceptación 5: el vendedor lo lee EN VOZ ALTA. Nunca se esconde. */
    motivo: string;
    /** Supera el presupuesto máximo del cliente (hasta +10%). Se muestra marcada. */
    porEncimaDelMaximo: boolean;
}

/** Fila de `AtencionVehiculo`: lo que se le mostró en ESTA visita. */
export interface AtencionVehiculo {
    id: number;
    atencionId: number;
    vehiculoId: number;
    tipo: TipoAtencionVehiculo;
    accion: AccionAtencionVehiculo;
    nivelInteres?: NivelInteres | null;
    /** El texto que mostró el sistema al sugerirla. Se relee tal cual la próxima visita. */
    motivoSugerencia?: string | null;
    createdAt: string;
    vehiculo?: UnidadSugerida;
}

/** La permuta de la visita: una `Tasacion` con `atencionId`. */
export interface PermutaAtencion {
    id: number;
    atencionId?: number | null;
    marca: string;
    modelo: string;
    anio?: number | null;
    km?: number | null;
    dominio?: string | null;
    condicion?: CondicionTasacion | null;
    valorEstimado?: Importe;
    moneda?: string;
    estado: EstadoPermuta;
    fecha?: string;
    observaciones?: string | null;
}

/** El próximo contacto del cierre: un `ClienteSeguimiento` con `atencionId`. */
export interface SeguimientoAtencion {
    id: number;
    tipo: TipoSeguimiento;
    fecha: string;
    nota: string;
    proximoContacto?: string | null;
    proximoContactoHecho: boolean;
}

export interface Atencion {
    id: number;
    clienteId: number;
    vendedorId: number;
    canal: CanalAtencion;
    motivo: MotivoAtencion;
    atencionAnteriorId?: number | null;
    estado: EstadoAtencion;
    resultado?: ResultadoAtencion | null;
    iniciadaEn: string;
    cerradaEn?: string | null;
    cerradaAutomaticamente: boolean;
    observaciones?: string | null;
    modoBusqueda?: ModoBusqueda | null;
    presupuestoMin?: Importe;
    presupuestoMax?: Importe;
    anticipo?: Importe;
    cuotaMaxima?: Importe;
    tipoFinanciamiento?: TipoFinanciamiento | null;
    presupuestoRealCalculado?: Importe;
    moneda: string;
    cliente?: ClienteAtencion;
    vendedor?: { id: number; nombre: string };
}

/** `GET /atenciones/:id`. */
export interface AtencionDetalle extends Atencion {
    vehiculos: AtencionVehiculo[];
    /** La permuta de la visita. Se llama `tasaciones` porque eso ES. */
    tasaciones: PermutaAtencion[];
    seguimientos: SeguimientoAtencion[];
}

/** Una visita anterior, resumida. */
export interface AtencionHistorial {
    id: number;
    iniciadaEn: string;
    cerradaEn?: string | null;
    estado: EstadoAtencion;
    motivo: MotivoAtencion;
    resultado?: ResultadoAtencion | null;
    cerradaAutomaticamente: boolean;
    observaciones?: string | null;
    vendedor?: { id: number; nombre: string } | null;
}

/** Una unidad que este cliente YA vio, en cualquier visita. */
export interface UnidadYaVista {
    id: number;
    atencionId: number;
    tipo: TipoAtencionVehiculo;
    accion: AccionAtencionVehiculo;
    nivelInteres?: NivelInteres | null;
    motivoSugerencia?: string | null;
    createdAt: string;
    vehiculo?: UnidadSugerida;
}

/**
 * El historial del cliente.
 *
 * `restringido: true` es un caso REAL, no un error: un vendedor puro que
 * identifica a un cliente de otro ve que existe y de quién es —eso es lo que
 * evita el duplicado— pero no qué le mostró el otro vendedor. La pantalla tiene
 * que decirlo, no simular que el cliente no tiene historia.
 */
export interface HistorialCliente {
    restringido: boolean;
    totalAtenciones: number;
    ultimaAtencion?: { id: number; iniciadaEn: string; estado: EstadoAtencion } | null;
    vendedoresPrevios: Array<{ id: number; nombre: string }>;
    atenciones: AtencionHistorial[];
    unidadesVistas: UnidadYaVista[];
}

/** El aviso de "este cliente es de otro vendedor". Trae el texto ya redactado. */
export interface AvisoAsignacion {
    esDeOtroVendedor: boolean;
    vendedorAsignadoId: number | null;
    vendedorAsignado: string | null;
    /** El plazo venció: cualquiera lo puede tomar sin pedirle nada a nadie. */
    retencionVencida: boolean;
    diasRetencion: number;
    mensaje: string | null;
}

// ───────────────────────────────────────────────────────────────────────────
// DTOs Y RESPUESTAS
// ───────────────────────────────────────────────────────────────────────────

export interface IdentificarDto {
    nombre?: string;
    telefono?: string;
    dni?: string;
    email?: string;
}

/** `POST /atenciones/identificar` — no persiste nada. */
export interface RespuestaIdentificar {
    cliente: ClienteAtencion | null;
    historial: HistorialCliente | null;
    aviso: AvisoAsignacion | null;
    /** Avisos sueltos, ya redactados (p.ej. "sin teléfono no se puede deduplicar"). */
    avisos: string[];
}

export interface AbrirAtencionDto {
    /** Lo único obligatorio. El teléfono es opcional: no se bloquea el avance. */
    nombre: string;
    apellido?: string;
    telefono?: string;
    dni?: string;
    email?: string;
    motivo?: MotivoAtencion;
    atencionAnteriorId?: number;
    observaciones?: string;
    /** Sin esto, un cliente de otro vendedor devuelve 409 y no se abre nada. */
    confirmaAtenderAjeno?: boolean;
}

export interface RespuestaAbrir {
    atencion: Atencion;
    cliente: ClienteAtencion;
    clienteEsNuevo: boolean;
    aviso: AvisoAsignacion | null;
    avisos: string[];
    historial: HistorialCliente;
}

export interface AtencionFilter {
    estado?: EstadoAtencion;
    clienteId?: number;
    vendedorId?: number;
    desde?: string;
    hasta?: string;
}

/** El listado no usa `PaginatedResponse`: el backend manda `total`, no `totalResults`. */
export interface ListadoAtenciones {
    results: Atencion[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

/** `GET /atenciones/alertas`. */
export interface AlertaAtenciones {
    abiertas: number;
    /**
     * Qué está contando. `vendedor` = lo que dejó ESTE vendedor; `tenant` = lo de
     * todo el salón (es lo que ve un admin). La pantalla lo necesita para elegir
     * la persona gramatical: sin esto le decía al admin "el sistema cerró 30
     * atenciones que dejaste abiertas" cuando él no abrió ninguna.
     */
    alcance: 'vendedor' | 'tenant';
    /** Las que el barrido va a cerrar en el próximo corte: son las urgentes. */
    deJornadasAnteriores: number;
    cerradasPorSistema: number;
    ventanaDesde: string;
    detalle: Array<{
        id: number;
        iniciadaEn: string;
        motivo: MotivoAtencion;
        cliente?: { id: number; nombre: string; apellido?: string | null; telefono?: string | null };
        vendedor?: { id: number; nombre: string } | null;
    }>;
    mensaje: string | null;
}

export interface CompletarClienteDto {
    nombre?: string;
    apellido?: string;
    dni?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
    consentimientoContacto?: boolean;
}

/**
 * `POST /atenciones/:id/buscar` — relevamiento y búsqueda en un solo movimiento.
 * El relevamiento queda guardado en la atención como efecto de esta llamada: no
 * hay un endpoint aparte para guardarlo.
 */
export interface BuscarUnidadesDto {
    modo: ModoBusqueda;
    // modo `unidad`: hace falta UNO de los tres.
    dominio?: string;
    vin?: string;
    vehiculoId?: number;
    // modo `modelo`: hace falta marca o modelo.
    marca?: string;
    modelo?: string;
    version?: string;
    anio?: number;
    // modo `presupuesto`.
    presupuestoMin?: number;
    presupuestoMax?: number;
    // Financiamiento de mostrador: se guarda y recalcula el presupuesto real.
    anticipo?: number;
    cuotaMaxima?: number;
    tipoFinanciamiento?: TipoFinanciamiento;
    moneda?: 'ARS' | 'USD';
    incluirYaMostradas?: boolean;
}

export interface RelevamientoAplicado {
    modo: ModoBusqueda;
    /** La moneda en la que se comparó DE VERDAD (en modo unidad/modelo la fija la unidad hallada). */
    moneda: string;
    /** La moneda en la que están el rango, el anticipo y el presupuesto real de la visita. */
    monedaDelRelevamiento: string;
    presupuestoDeclaradoMin: number | null;
    presupuestoDeclaradoMax: number | null;
    /** (permuta + anticipo). Null si no hay ninguno de los dos. */
    presupuestoRealCalculado: number | null;
    /** El número que EFECTIVAMENTE filtró el stock. Null si no filtró nada. */
    presupuestoQueMandaElFiltro: number | null;
    /** true sólo en modo presupuesto: en los otros el techo marca pero no descarta. */
    presupuestoFiltra: boolean;
    /** El rango relevado está en otra moneda que la comparación: no se aplicó. */
    rangoIgnoradoPorMoneda: boolean;
    origenDelFiltro: string;
    anticipo: number | null;
    cuotaMaxima: number | null;
    tipoFinanciamiento: TipoFinanciamiento | null;
    permuta: { id: number; estado: EstadoPermuta; valorEstimado: number | null; moneda: string; unidad: string } | null;
}

export interface ResultadoBusqueda {
    relevamiento: RelevamientoAplicado;
    /** La unidad buscada, sólo si está DISPONIBLE. */
    exacta: UnidadSugerida | null;
    /** La exacta supera el máximo relevado. Se muestra marcada, no se esconde. */
    exactaPorEncimaDelMaximo: boolean;
    /** Si NO está disponible: su estado, para decirlo con claridad. */
    estadoDeLaExacta: string | null;
    /** 0..3. Nunca más de 3, nunca relleno. */
    alternativas: Sugerencia[];
    /** Presente cuando hay menos de 3, o cuando la patente no existe. Se muestra. */
    aviso: string | null;
    /** Por qué la cuota máxima no se convirtió en capital. */
    notaFinanciamiento?: string | null;
}

export interface RegistrarUnidadDto {
    vehiculoId: number;
    tipo: TipoAtencionVehiculo;
    accion?: AccionAtencionVehiculo;
    nivelInteres?: NivelInteres;
    motivoSugerencia?: string;
}

export interface RegistrarPermutaDto {
    marca: string;
    modelo: string;
    anio?: number;
    km?: number;
    dominio?: string;
    condicion?: CondicionTasacion;
    /** Vacío = `sin_tasar`. En las casas donde sólo tasa el tasador, mandar valor da 403. */
    valorEstimado?: number;
    moneda?: 'ARS' | 'USD';
    observaciones?: string;
}

/** `PATCH /atenciones/:id/cierre`. Los tres campos del próximo contacto van PLANOS. */
export interface CerrarAtencionDto {
    resultado: ResultadoAtencion;
    observaciones?: string;
    /** yyyy-mm-dd. Obligatorio si el resultado no es definitivo. */
    proximoContacto?: string;
    medioProximoContacto?: TipoSeguimiento;
    notaProximoContacto?: string;
}

export interface RespuestaCierre {
    atencion: Atencion;
    seguimientoId: number | null;
    /** Los resultados que ya son entidades se ENLAZAN, no se duplican. */
    enlaces: { reservaId?: number; presupuestoId?: number };
    requeriaProximoContacto: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// API — ATENCIONES
// ───────────────────────────────────────────────────────────────────────────

export const atencionesApi = {
    /**
     * PASO 1a. Dedupe (teléfono normalizado → DNI → email) + ficha + historial +
     * aviso de asignación. NO persiste nada: es lo que el vendedor mira antes de
     * decidir. Es POST porque teléfono y DNI en una query string terminan en el
     * log de acceso.
     */
    identificar: (data: IdentificarDto) =>
        client.post<RespuestaIdentificar>('/atenciones/identificar', data),

    /**
     * PASO 1b. Abre la visita. Si el cliente es de otro vendedor y la retención
     * sigue vigente responde 409 CLIENTE_ASIGNADO_A_OTRO_VENDEDOR y no escribe
     * nada: hay que reenviar con `confirmaAtenderAjeno: true`.
     */
    abrir: (data: AbrirAtencionDto) =>
        client.post<RespuestaAbrir>('/atenciones', data),

    getAll: (filters: AtencionFilter = {}, options: { page?: number; limit?: number } = {}) =>
        client.get<ListadoAtenciones>('/atenciones', { params: { ...filters, ...options } }),

    getById: (id: number) =>
        client.get<AtencionDetalle>(`/atenciones/${id}`),

    /** Cuántas dejó sin cerrar y cuántas le cerró el barrido de fin de día. */
    alertas: () =>
        client.get<AlertaAtenciones>('/atenciones/alertas'),

    /** Historial del cliente: visitas, unidades ya vistas y quién lo atendió antes. */
    historialCliente: (clienteId: number) =>
        client.get<{ cliente: ClienteAtencion; historial: HistorialCliente }>(`/atenciones/cliente/${clienteId}`),

    /** PASO 2 — enriquecimiento progresivo (DNI, email, domicilio, consentimiento). */
    completarCliente: (id: number, data: CompletarClienteDto) =>
        client.patch<ClienteAtencion>(`/atenciones/${id}/cliente`, data),

    /** PASOS 3 y 4 — relevamiento + búsqueda + hasta 3 alternativas con su motivo. */
    buscar: (id: number, data: BuscarUnidadesDto) =>
        client.post<ResultadoBusqueda>(`/atenciones/${id}/buscar`, data),

    /** PASO 5 — registro de lo mostrado. Upsert por (atención, vehículo). */
    registrarUnidad: (id: number, data: RegistrarUnidadDto) =>
        client.post<AtencionVehiculo>(`/atenciones/${id}/vehiculos`, data),

    /** La permuta de la visita (se guarda como Tasación vinculada a la atención). */
    registrarPermuta: (id: number, data: RegistrarPermutaDto) =>
        client.post<PermutaAtencion>(`/atenciones/${id}/permuta`, data),

    /** PASO 6 — cierre. 409 si falta el resultado o el próximo contacto. */
    cerrar: (id: number, data: CerrarAtencionDto) =>
        client.patch<RespuestaCierre>(`/atenciones/${id}/cierre`, data),

    /** Reasignar el cliente a otro vendedor. SÓLO admin (lo exige la ruta y el service). */
    reasignarCliente: (id: number, vendedorId: number, motivo?: string) =>
        client.patch(`/atenciones/${id}/reasignar-cliente`, { vendedorId, motivo }),
};

// ───────────────────────────────────────────────────────────────────────────
// API — PRECIO MÍNIMO AUTORIZADO
// ───────────────────────────────────────────────────────────────────────────

export type EstadoSolicitudPrecioMinimo = 'pendiente' | 'autorizada' | 'rechazada' | 'expirada';

export interface SolicitudPrecioMinimo {
    id: number;
    vehiculoId: number;
    atencionId?: number | null;
    estado: EstadoSolicitudPrecioMinimo;
    motivo?: string | null;
    respuesta?: string | null;
    precioAutorizado?: Importe;
    moneda: string;
    solicitadaEn: string;
    resueltaEn?: string | null;
    venceEl?: string | null;
}

/**
 * Respuesta de `GET /precio-minimo/vehiculo/:id`.
 *
 * Devuelve 200 con `autorizado: false` en vez de 403 a propósito: "todavía no te
 * lo autorizaron" no es un error, es el estado normal, y la pantalla tiene que
 * poder ofrecer el pedido sin tratar la negativa como una falla.
 */
export type PrecioMinimoVigente =
    | { autorizado: false; vehiculoId: number }
    | {
        autorizado: true;
        /** `null` cuando el acceso lo da el ROL (admin): no hay pedido detrás. */
        solicitudId: number | null;
        vehiculoId: number;
        precioMinimo: Importe;
        moneda: string;
        venceEl: string | null;
        autorizadaPor: string | null;
        /** true = lo ve por ser supervisor, sin pedido ni vencimiento. */
        porRol?: boolean;
    };

export const precioMinimoApi = {
    /** El piso de venta, sólo si este usuario tiene una autorización vigente. */
    vigentePorVehiculo: (vehiculoId: number) =>
        client.get<PrecioMinimoVigente>(`/precio-minimo/vehiculo/${vehiculoId}`),

    /** El vendedor pide ver el piso. Idempotente mientras haya una pendiente. */
    solicitar: (vehiculoId: number, atencionId?: number, motivo?: string) =>
        client.post<SolicitudPrecioMinimo>('/precio-minimo', { vehiculoId, atencionId, motivo }),

    /** Bandeja: el admin ve las del tenant, el vendedor sólo las propias. */
    listar: (params: { estado?: EstadoSolicitudPrecioMinimo; vehiculoId?: number } = {}) =>
        client.get<{ results: SolicitudPrecioMinimo[]; totalResults: number }>('/precio-minimo', { params }),
};
