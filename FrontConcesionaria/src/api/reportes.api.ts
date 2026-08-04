import client from './client';

// ── Consolidación de monedas ─────────────────────────────────────────────────
// Cuando se pide ?consolidar=ARS|USD, el backend convierte todo a esa moneda con
// la última cotización cargada y devuelve un total consolidado junto al desglose
// por moneda. `sinCotizacion: true` significa que se pidió consolidar pero no hay
// ninguna cotización cargada todavía.

export type MonedaConsol = 'ARS' | 'USD';

interface ConsolidadoBase {
    moneda: MonedaConsol;
    /** Cotización usada: pesos por 1 USD. */
    valor: number;
    /** Fecha de esa cotización (YYYY-MM-DD). */
    fechaCotizacion: string;
}

export interface ConsolidadoVentas extends ConsolidadoBase {
    cantidad: number;
    precioVenta: number;
    extras: number;
    total: number;
}

export interface ConsolidadoCaja extends ConsolidadoBase {
    ingresos: { cobrosVentas: number; cobrosCuotas: number; total: number };
    egresos: { gastosVehiculos: number; gastosFijos: number; total: number };
    neto: number;
}

export interface ConsolidadoMora extends ConsolidadoBase {
    cuotasVencidas: number;
    saldo: number;
}

export interface ConsolidadoRenta extends ConsolidadoBase {
    cantidad: number;
    precioVenta: number;
    costo: number;
    rentabilidad: number;
}

export interface ConsolidadoProximos extends ConsolidadoBase {
    cuotasPorVencer: number;
    saldo: number;
}

// ── Tipos de respuesta ───────────────────────────────────────────────────────

export interface ReporteVentasItem {
    id: number;
    fecha: string;
    vehiculo: string;
    dominio: string;
    cliente: string;
    vendedor: string;
    sucursal: string;
    formaPago: string;
    moneda: string;
    precioVenta: number;
    extras: number;
    total: number;
}

export interface TotalPorMoneda {
    moneda: string;
    cantidad: number;
    [campo: string]: number | string;
}

export interface ReporteVentas {
    resumen: { cantidad: number; porMoneda: TotalPorMoneda[] };
    items: ReporteVentasItem[];
    consolidado?: ConsolidadoVentas | null;
    sinCotizacion?: boolean;
}

/** Una caja por cada moneda: el neto de pesos y el de dólares no se suman. */
export interface CajaPorMoneda {
    moneda: string;
    ingresos: { cobrosVentas: number; cobrosCuotas: number; total: number };
    egresos: { gastosVehiculos: number; gastosFijos: number; total: number };
    neto: number;
}

export interface ReporteCaja {
    periodo: { anio: number; mes: number };
    porMoneda: CajaPorMoneda[];
    consolidado?: ConsolidadoCaja | null;
    sinCotizacion?: boolean;
}

export interface ReporteMoraItem {
    financiacionId: number | null;
    /** Identifica al deudor. El nombre no alcanza: puede haber homónimos. */
    clienteId: number | null;
    cliente: string;
    telefono: string;
    vehiculo: string;
    dominio: string;
    nroCuota: number;
    vencimiento: string;
    diasAtraso: number;
    moneda: string;
    saldo: number;
}

export interface ReporteMora {
    resumen: { cuotasVencidas: number; clientes: number; porMoneda: TotalPorMoneda[] };
    items: ReporteMoraItem[];
    consolidado?: ConsolidadoMora | null;
    sinCotizacion?: boolean;
}

export interface ReporteRentabilidadItem {
    fecha: string;
    vehiculo: string;
    dominio: string;
    sucursal: string;
    moneda: string;
    precioVenta: number;
    precioCompra: number;
    gastos: number;
    costo: number;
    /** null si hay costos en otra moneda: el margen no se puede calcular sin cotización. */
    rentabilidad: number | null;
    margenPct: number | null;
    incompleto?: boolean;
    /** Importes en otra moneda que quedaron sin restar, por moneda. */
    sinContar?: Record<string, number>;
    /** Mismos números convertidos a la moneda de consolidación (si se pidió). */
    consolidado?: {
        moneda: MonedaConsol;
        precioVenta: number;
        precioCompra: number;
        gastos: number;
        costo: number;
        rentabilidad: number;
        margenPct: number | null;
    };
}

export interface ReporteRentabilidad {
    resumen: { cantidad: number; porMoneda: TotalPorMoneda[] };
    items: ReporteRentabilidadItem[];
    consolidado?: ConsolidadoRenta | null;
    sinCotizacion?: boolean;
}

export interface ProximoVencimientoItem {
    financiacionId: number | null;
    clienteId: number | null;
    cliente: string;
    telefono: string;
    vehiculo: string;
    dominio: string;
    nroCuota: number;
    vencimiento: string;
    /** Días desde hoy hasta el vencimiento (0 = vence hoy). */
    diasParaVencer: number;
    moneda: string;
    saldo: number;
}

export interface ReporteProximos {
    ventana: { dias: number; desde: string; hasta: string };
    resumen: { cuotasPorVencer: number; clientes: number; porMoneda: TotalPorMoneda[] };
    items: ProximoVencimientoItem[];
    consolidado?: ConsolidadoProximos | null;
    sinCotizacion?: boolean;
}

export interface StockAntiguedadBucket {
    key: string;
    label: string;
    count: number;
}

/** Capital inmovilizado consolidado. `valor` es la cotización; `capital` el monto. */
export interface ConsolidadoCapital extends ConsolidadoBase {
    count: number;
    capital: number;
}

export interface ReporteStockAntiguedad {
    total: number;
    antiguedadMax: number;
    buckets: StockAntiguedadBucket[];
    /** porMoneda[].capital = capital inmovilizado (precio de compra) de las estancadas. */
    estancados: { umbral: number; count: number; porMoneda: TotalPorMoneda[] };
    consolidado?: ConsolidadoCapital | null;
    sinCotizacion?: boolean;
}

export interface RankingMoneda {
    moneda: string;
    facturado: number;
    rentabilidad: number;
}

export interface RankingVendedorItem {
    vendedorId: number;
    vendedor: string;
    unidades: number;
    porMoneda: RankingMoneda[];
    /** Totales del vendedor convertidos a la moneda de consolidación (si se pidió). */
    consolidado: { moneda: string; facturado: number; rentabilidad: number } | null;
}

export interface ConsolidadoRanking extends ConsolidadoBase {
    facturado: number;
    rentabilidad: number;
}

export interface ReporteRanking {
    periodo: { desde: string | null; hasta: string | null };
    items: RankingVendedorItem[];
    resumen: { vendedores: number; unidades: number };
    consolidado?: ConsolidadoRanking | null;
    sinCotizacion?: boolean;
}

export interface ComisionMoneda {
    moneda: string;
    facturado: number;
    comision: number;
}

export interface ComisionVendedorItem {
    vendedorId: number;
    vendedor: string;
    /** % de comisión del vendedor (de su perfil). */
    porcentaje: number;
    unidades: number;
    porMoneda: ComisionMoneda[];
    consolidado: { moneda: string; facturado: number; comision: number } | null;
}

export interface ConsolidadoComisiones extends ConsolidadoBase {
    facturado: number;
    comision: number;
}

export interface ReporteComisiones {
    periodo: { desde: string | null; hasta: string | null };
    items: ComisionVendedorItem[];
    resumen: { vendedores: number; unidades: number };
    consolidado?: ConsolidadoComisiones | null;
    sinCotizacion?: boolean;
}

export interface EstadoCuentaFinanciacion {
    id: number;
    fechaInicio: string;
    moneda: string;
    montoFinanciado: number;
    estado: string;
    vehiculo: string;
    dominio: string;
    cuotasTotal: number;
    cuotasPagadas: number;
    saldoPendiente: number;
    cuotasVencidas: number;
    saldoVencido: number;
    proximaCuota: { nroCuota: number; vencimiento: string; monto: number } | null;
}

export interface EstadoCuenta {
    clienteId: number;
    financiaciones: EstadoCuentaFinanciacion[];
    resumen: {
        financiaciones: number;
        activas: number;
        cuotasVencidas: number;
        /** porMoneda[]: montoFinanciado / saldoPendiente / saldoVencido por moneda. */
        porMoneda: TotalPorMoneda[];
        proximaCuota: { nroCuota: number; vencimiento: string; monto: number; financiacionId: number; moneda: string } | null;
    };
}

export interface VentaMensualItem {
    anio: number;
    mes: number;
    /** Etiqueta corta para el eje, ej "Jul 25". */
    label: string;
    cantidad: number;
    porMoneda: { moneda: string; facturado: number }[];
    /** Facturado convertido a la moneda de consolidación, o null si no hay cotización. */
    facturadoConsolidado: number | null;
}

export interface ReporteVentasMensuales {
    meses: number;
    moneda: MonedaConsol | null;
    valorCotizacion: number | null;
    fechaCotizacion: string | null;
    items: VentaMensualItem[];
    sinCotizacion?: boolean;
}

export interface ReservaPorVencerItem {
    reservaId: number;
    cliente: string;
    telefono: string;
    vehiculo: string;
    dominio: string;
    venceEl: string;
    diasParaVencer: number;
    moneda: string;
    montoSenia: number;
}

export interface ConsolidadoReservas extends ConsolidadoBase {
    cantidad: number;
    montoSenia: number;
}

export interface ReporteReservasPorVencer {
    ventana: { dias: number };
    resumen: { cantidad: number; porMoneda: TotalPorMoneda[] };
    items: ReservaPorVencerItem[];
    consolidado?: ConsolidadoReservas | null;
    sinCotizacion?: boolean;
}

export interface TurnoTallerItem {
    casoId: number;
    cliente: string;
    telefono: string;
    vehiculo: string;
    dominio: string;
    tipo: string;
    estado: string;
    fechaTurno: string;
    horaTurno: string;
}

export interface ReporteTurnosTaller {
    ventana: { dias: number; desde: string; hasta: string };
    resumen: { cantidad: number; hoy: number };
    items: TurnoTallerItem[];
}

/** Un próximo-contacto agendado en la bitácora del CRM (agenda de seguimientos). */
export interface ProximoSeguimientoItem {
    seguimientoId: number;
    clienteId: number;
    cliente: string;
    telefono: string;
    tipo: string;
    vendedor: string;
    proximoContacto: string;
    /** true si el próximo contacto ya venció (proximoContacto < hoy). */
    vencido: boolean;
    nota: string;
}

export interface ReporteProximosSeguimientos {
    ventana: { dias: number; desde: string; hasta: string };
    /** cantidad = total real en la ventana; mostrados = filas devueltas (tope). */
    resumen: { cantidad: number; mostrados: number; vencidos: number; hoy: number };
    items: ProximoSeguimientoItem[];
}

/** Embudo de leads: cantidad de clientes por etapa del pipeline + total. */
export interface LeadsResumen {
    nuevo: number;
    contactado: number;
    negociando: number;
    ganado: number;
    perdido: number;
    total: number;
}

/** Conteos livianos para la campanita de notificaciones (un solo request). */
export interface AlertasResumen {
    dias: number;
    umbral: number;
    mora: number;
    proximos: number;
    reservas: number;
    estancados: number;
    turnos: number;
    turnosHoy: number;
    /** Próximos seguimientos del CRM en la ventana ±dias. */
    seguimientos: number;
    total: number;
}

export interface RangoFiltro {
    desde?: string;
    hasta?: string;
    sucursalId?: number;
    vendedorId?: number;
    /** Convertir todo a esta moneda con la última cotización cargada. */
    consolidar?: MonedaConsol;
}

export interface CajaFiltro {
    anio: number;
    mes: number;
    consolidar?: MonedaConsol;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export const reportesApi = {
    ventas: (params: RangoFiltro = {}) =>
        client.get<ReporteVentas>('/reportes/ventas', { params }),
    caja: (params: CajaFiltro) =>
        client.get<ReporteCaja>('/reportes/caja', { params }),
    mora: (params: { consolidar?: MonedaConsol } = {}) =>
        client.get<ReporteMora>('/reportes/mora', { params }),
    rentabilidad: (params: RangoFiltro = {}) =>
        client.get<ReporteRentabilidad>('/reportes/rentabilidad', { params }),

    proximosVencimientos: (params: { dias?: number; consolidar?: MonedaConsol } = {}) =>
        client.get<ReporteProximos>('/reportes/proximos-vencimientos', { params }),

    stockAntiguedad: (params: { umbral?: number; consolidar?: MonedaConsol } = {}) =>
        client.get<ReporteStockAntiguedad>('/reportes/stock-antiguedad', { params }),

    rankingVendedores: (params: RangoFiltro = {}) =>
        client.get<ReporteRanking>('/reportes/ranking-vendedores', { params }),

    comisiones: (params: RangoFiltro = {}) =>
        client.get<ReporteComisiones>('/reportes/comisiones', { params }),

    /** Liquidación de comisiones de UN vendedor en PDF (blob). */
    comisionesLiquidacionPdf: (params: { vendedorId: number; desde?: string; hasta?: string; sucursalId?: number }) =>
        client.get<Blob>('/reportes/comisiones/pdf', { params, responseType: 'blob' }),

    estadoCuenta: (clienteId: number) =>
        client.get<EstadoCuenta>('/reportes/estado-cuenta', { params: { clienteId } }),

    ventasMensuales: (params: { meses?: number; consolidar?: MonedaConsol } = {}) =>
        client.get<ReporteVentasMensuales>('/reportes/ventas-mensuales', { params }),

    reservasPorVencer: (params: { dias?: number; consolidar?: MonedaConsol } = {}) =>
        client.get<ReporteReservasPorVencer>('/reportes/reservas-por-vencer', { params }),

    turnosTaller: (params: { dias?: number } = {}) =>
        client.get<ReporteTurnosTaller>('/reportes/turnos-taller', { params }),

    /** Agenda de próximos seguimientos del CRM (ventana ±dias). */
    proximosSeguimientos: (params: { dias?: number } = {}) =>
        client.get<ReporteProximosSeguimientos>('/reportes/proximos-seguimientos', { params }),

    /** Conteos de alertas en una sola llamada (campanita de notificaciones). */
    alertasResumen: () =>
        client.get<AlertasResumen>('/reportes/alertas-resumen'),

    /** Embudo de leads: cantidad de clientes por etapa del pipeline. */
    leadsResumen: () =>
        client.get<LeadsResumen>('/reportes/leads-resumen'),

    /**
     * Variante CSV. Devuelve el blob y el nombre de archivo que mandó el
     * backend en el Content-Disposition, que ya incluye el período: sin él, dos
     * exports de meses distintos se guardaban con el mismo nombre y el segundo
     * pisaba al primero en la carpeta de descargas.
     */
    exportCsv: async (
        reporte: 'ventas' | 'caja' | 'mora' | 'rentabilidad' | 'proximos-vencimientos' | 'ranking-vendedores' | 'comisiones',
        params: Record<string, unknown> = {},
    ): Promise<{ blob: Blob; filename?: string }> => {
        const res = await client.getRaw<Blob>(`/reportes/${reporte}`, {
            params: { ...params, format: 'csv' },
            responseType: 'blob',
        });
        return {
            blob: res.data,
            filename: parseFilename(res.headers['content-disposition']),
        };
    },
};

/**
 * Saca el filename de un header Content-Disposition. Soporta la forma simple
 * (`filename="x.csv"`) y la RFC 5987 (`filename*=UTF-8''x.csv`), que es la que
 * usan los nombres con acentos. Devuelve undefined si el header no vino o no
 * matchea, para que el llamador use su propio nombre por defecto.
 */
function parseFilename(header: unknown): string | undefined {
    if (typeof header !== 'string') return undefined;

    const rfc5987 = /filename\*=(?:UTF-8|utf-8)''([^;]+)/i.exec(header);
    if (rfc5987) {
        try {
            return decodeURIComponent(rfc5987[1].trim());
        } catch {
            // Header mal formado: mejor caer al nombre por defecto que romper.
        }
    }

    const simple = /filename="?([^";]+)"?/i.exec(header);
    return simple ? simple[1].trim() : undefined;
}
