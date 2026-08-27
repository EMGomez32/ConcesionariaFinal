import { api } from './client';

/**
 * API de Atenciones (el Mostrador del vendedor) — el flujo completo de la visita:
 * identificar → abrir → relevamiento/búsqueda → registrar unidad → permuta →
 * cierre. Espejo de los contratos del backend (FrontConcesionaria/src/api).
 */

// ── Enums ──────────────────────────────────────────────────────────────────
export type EstadoAtencion = 'abierta' | 'cerrada';
export type ResultadoAtencion =
    | 'reserva' | 'sin_unidad' | 'cotizacion' | 'test_drive'
    | 'permuta_a_tasar' | 'en_analisis' | 'se_retiro';
export type MotivoAtencion =
    | 'consulta_general' | 'unidad_puntual' | 'vuelve_por_atencion_anterior';
export type ModoBusqueda = 'presupuesto' | 'modelo' | 'unidad';
export type TipoFinanciamiento = 'contado' | 'credito' | 'plan_de_ahorro';
export type TipoAtencionVehiculo = 'buscada' | 'sugerida';
export type AccionAtencionVehiculo = 'vista' | 'test_drive' | 'cotizada' | 'reservada';
export type NivelInteres = 'bajo' | 'medio' | 'alto';
export type EstadoPermuta = 'sin_tasar' | 'tasada' | 'rechazada';
export type CondicionTasacion = 'excelente' | 'muy_bueno' | 'bueno' | 'regular' | 'malo';
export type TipoSeguimiento = 'llamada' | 'whatsapp' | 'email' | 'visita' | 'otro';

// Importe: el backend puede mandar number o string (Decimal). Normalizamos al leer.
export type Importe = number | string | null | undefined;
export const num = (v: Importe): number | null =>
    v === null || v === undefined || v === '' ? null : Number(v);

// ── Entidades ──────────────────────────────────────────────────────────────
export interface ClienteAtencion {
    id: number;
    nombre: string;
    apellido?: string | null;
    telefono?: string | null;
    email?: string | null;
    dni?: string | null;
    direccion?: string | null;
    consentimientoContacto: boolean;
    vendedorAsignadoId?: number | null;
    vendedorAsignado?: { id: number; nombre: string } | null;
    observaciones?: string | null;
}

export interface UnidadSugerida {
    id: number;
    marca: string;
    modelo: string;
    version?: string | null;
    anio?: number | null;
    dominio?: string | null;
    color?: string | null;
    estado: string;
    kmIngreso?: number | null;
    precioLista?: Importe;
    moneda?: string;
    // Precio equivalente en la moneda del presupuesto (al dólar blue). Sólo viene
    // cuando el auto está en OTRA moneda que el presupuesto y se lo convirtió para
    // poder compararlo. Es ORIENTATIVO: el precio real es `precioLista` en `moneda`.
    precioEnMonedaPresupuesto?: Importe;
    monedaPresupuesto?: string;
    cotizacionAplicada?: { tipo: string; valor: number; actualizado: string };
    sucursal?: { id: number; nombre: string } | null;
}

export interface Sugerencia {
    unidad: UnidadSugerida;
    motivo: string;
    porEncimaDelMaximo: boolean;
}

export interface AtencionVehiculo {
    id: number;
    vehiculoId: number;
    tipo: TipoAtencionVehiculo;
    accion: AccionAtencionVehiculo;
    nivelInteres?: NivelInteres | null;
    motivoSugerencia?: string | null;
    vehiculo?: UnidadSugerida;
}

export interface PermutaAtencion {
    id: number;
    marca: string;
    modelo: string;
    anio?: number | null;
    km?: number | null;
    dominio?: string | null;
    condicion?: CondicionTasacion | null;
    valorEstimado?: Importe;
    moneda?: string;
    estado: EstadoPermuta;
}

export interface AtencionListItem {
    id: number;
    estado: EstadoAtencion;
    motivo: MotivoAtencion;
    resultado?: ResultadoAtencion | null;
    iniciadaEn: string;
    cerradaAutomaticamente?: boolean;
    cliente?: ClienteAtencion | null;
    vendedor?: { id: number; nombre: string } | null;
}

export interface AtencionDetalle extends AtencionListItem {
    modoBusqueda?: ModoBusqueda | null;
    presupuestoMin?: Importe;
    presupuestoMax?: Importe;
    anticipo?: Importe;
    cuotaMaxima?: Importe;
    tipoFinanciamiento?: TipoFinanciamiento | null;
    presupuestoRealCalculado?: Importe;
    moneda: string;
    observaciones?: string | null;
    cliente?: ClienteAtencion;
    vehiculos: AtencionVehiculo[];
    tasaciones: PermutaAtencion[];
}

export interface AvisoAsignacion {
    esDeOtroVendedor: boolean;
    vendedorAsignado: string | null;
    retencionVencida: boolean;
    mensaje: string | null;
}

export interface RespuestaIdentificar {
    cliente: ClienteAtencion | null;
    aviso: AvisoAsignacion | null;
    avisos: string[];
    historial: { totalAtenciones: number; restringido: boolean } | null;
}

export interface RelevamientoAplicado {
    presupuestoRealCalculado: number | null;
    presupuestoQueMandaElFiltro: number | null;
    origenDelFiltro: string;
    permuta: { valorEstimado: number | null; moneda: string; unidad: string } | null;
    // Cotización usada para convertir autos de otra moneda y que compitan contra
    // este presupuesto. Null si no hizo falta o la fuente no respondió.
    cotizacion?: { tipo: string; valor: number; actualizado: string } | null;
    unidadesConvertidas?: number;
}

export interface ResultadoBusqueda {
    relevamiento: RelevamientoAplicado;
    exacta: UnidadSugerida | null;
    exactaPorEncimaDelMaximo: boolean;
    estadoDeLaExacta: string | null;
    alternativas: Sugerencia[];
    aviso: string | null;
    notaFinanciamiento?: string | null;
}

// ── DTOs ───────────────────────────────────────────────────────────────────
export interface AbrirAtencionDto {
    nombre: string;
    apellido?: string;
    telefono?: string;
    motivo?: MotivoAtencion;
    confirmaAtenderAjeno?: boolean;
}

export interface BuscarUnidadesDto {
    modo: ModoBusqueda;
    dominio?: string;
    marca?: string;
    modelo?: string;
    presupuestoMin?: number;
    presupuestoMax?: number;
    anticipo?: number;
    cuotaMaxima?: number;
    tipoFinanciamiento?: TipoFinanciamiento;
    moneda?: 'ARS' | 'USD';
    incluirYaMostradas?: boolean;
}

export interface RegistrarPermutaDto {
    marca: string;
    modelo: string;
    dominio?: string;
    anio?: number;
    km?: number;
    condicion?: CondicionTasacion;
    valorEstimado?: number;
    moneda?: 'ARS' | 'USD';
}

export interface CompletarClienteDto {
    dni?: string;
    email?: string;
    direccion?: string;
    consentimientoContacto?: boolean;
}

export interface CerrarAtencionDto {
    resultado: ResultadoAtencion;
    observaciones?: string;
    proximoContacto?: string;
    medioProximoContacto?: TipoSeguimiento;
    notaProximoContacto?: string;
}

// ── API ────────────────────────────────────────────────────────────────────
export const atencionesApi = {
    list: (estado?: EstadoAtencion, page = 1, limit = 50) =>
        api.get('/atenciones', { params: { ...(estado ? { estado } : {}), page, limit } }).then((r) => r.data as { results: AtencionListItem[]; total: number }),

    alertas: () =>
        api.get('/atenciones/alertas').then((r) => r.data as {
            abiertas: number; cerradasPorSistema: number; alcance: 'vendedor' | 'tenant';
        }),

    getById: (id: number) =>
        api.get(`/atenciones/${id}`).then((r) => r.data as AtencionDetalle),

    identificar: (data: { nombre?: string; telefono?: string }) =>
        api.post('/atenciones/identificar', data).then((r) => r.data as RespuestaIdentificar),

    abrir: (data: AbrirAtencionDto) =>
        api.post('/atenciones', data).then((r) => r.data as { atencion: { id: number }; clienteEsNuevo: boolean }),

    buscar: (id: number, data: BuscarUnidadesDto) =>
        api.post(`/atenciones/${id}/buscar`, data).then((r) => r.data as ResultadoBusqueda),

    registrarUnidad: (id: number, data: { vehiculoId: number; tipo: TipoAtencionVehiculo; accion?: AccionAtencionVehiculo; nivelInteres?: NivelInteres; motivoSugerencia?: string }) =>
        api.post(`/atenciones/${id}/vehiculos`, data).then((r) => r.data),

    registrarPermuta: (id: number, data: RegistrarPermutaDto) =>
        api.post(`/atenciones/${id}/permuta`, data).then((r) => r.data as PermutaAtencion),

    completarCliente: (id: number, data: CompletarClienteDto) =>
        api.patch(`/atenciones/${id}/cliente`, data).then((r) => r.data),

    cerrar: (id: number, data: CerrarAtencionDto) =>
        api.patch(`/atenciones/${id}/cierre`, data).then((r) => r.data),
};

// ── Códigos de error del flujo ───────────────────────────────────────────────
export const COD_CLIENTE_AJENO = 'CLIENTE_ASIGNADO_A_OTRO_VENDEDOR';
export const COD_DATOS_CLIENTE = 'DATOS_CLIENTE_REQUERIDOS';
export const COD_CONSENTIMIENTO = 'CONSENTIMIENTO_REQUERIDO';
export const COD_SOLO_TASADOR = 'TASACION_SOLO_TASADOR';

export const codigoDeError = (e: any): string | null =>
    (typeof e?.response?.data?.error === 'string' ? e.response.data.error : null);

/** Los dos 409 del enriquecimiento progresivo se atienden con el mismo formulario. */
export const faltanDatosDelCliente = (e: any): boolean => {
    const c = codigoDeError(e);
    return c === COD_DATOS_CLIENTE || c === COD_CONSENTIMIENTO;
};

// ── Etiquetas ────────────────────────────────────────────────────────────────
export const MOTIVO_LABEL: Record<MotivoAtencion, string> = {
    consulta_general: 'Consulta general',
    unidad_puntual: 'Vino por una unidad puntual',
    vuelve_por_atencion_anterior: 'Vuelve por una visita anterior',
};

export const RESULTADO_LABEL: Record<ResultadoAtencion, string> = {
    reserva: 'Reserva / seña tomada',
    sin_unidad: 'No hay unidad que le sirva',
    cotizacion: 'Cotización entregada',
    test_drive: 'Test drive realizado',
    permuta_a_tasar: 'Permuta enviada a tasar',
    en_analisis: 'En análisis',
    se_retiro: 'Se retiró sin definir',
};

/** Resultados definitivos: no exigen próximo contacto. */
export const RESULTADOS_DEFINITIVOS: ResultadoAtencion[] = ['reserva', 'sin_unidad', 'se_retiro'];

export const FINANCIAMIENTO_LABEL: Record<TipoFinanciamiento, string> = {
    contado: 'Contado', credito: 'Crédito', plan_de_ahorro: 'Plan de ahorro',
};
export const CONDICION_LABEL: Record<CondicionTasacion, string> = {
    excelente: 'Excelente', muy_bueno: 'Muy bueno', bueno: 'Bueno', regular: 'Regular', malo: 'Malo',
};
export const CONDICIONES: CondicionTasacion[] = ['excelente', 'muy_bueno', 'bueno', 'regular', 'malo'];
export const ESTADO_PERMUTA_LABEL: Record<EstadoPermuta, string> = {
    sin_tasar: 'Sin tasar', tasada: 'Tasada', rechazada: 'Rechazada',
};
export const MEDIO_CONTACTO_LABEL: Record<TipoSeguimiento, string> = {
    llamada: 'Llamada', whatsapp: 'WhatsApp', email: 'Email', visita: 'Visita al salón', otro: 'Otro',
};
export const MEDIOS_CONTACTO: TipoSeguimiento[] = ['llamada', 'whatsapp', 'email', 'visita', 'otro'];
