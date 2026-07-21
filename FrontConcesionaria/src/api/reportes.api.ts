import client from './client';

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
}

export interface ReporteRentabilidad {
    resumen: { cantidad: number; porMoneda: TotalPorMoneda[] };
    items: ReporteRentabilidadItem[];
}

export interface RangoFiltro {
    desde?: string;
    hasta?: string;
    sucursalId?: number;
    vendedorId?: number;
}

export interface CajaFiltro {
    anio: number;
    mes: number;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export const reportesApi = {
    ventas: (params: RangoFiltro = {}) =>
        client.get<ReporteVentas>('/reportes/ventas', { params }),
    caja: (params: CajaFiltro) =>
        client.get<ReporteCaja>('/reportes/caja', { params }),
    mora: () =>
        client.get<ReporteMora>('/reportes/mora'),
    rentabilidad: (params: RangoFiltro = {}) =>
        client.get<ReporteRentabilidad>('/reportes/rentabilidad', { params }),

    /**
     * Variante CSV. Devuelve el blob y el nombre de archivo que mandó el
     * backend en el Content-Disposition, que ya incluye el período: sin él, dos
     * exports de meses distintos se guardaban con el mismo nombre y el segundo
     * pisaba al primero en la carpeta de descargas.
     */
    exportCsv: async (
        reporte: 'ventas' | 'caja' | 'mora' | 'rentabilidad',
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
