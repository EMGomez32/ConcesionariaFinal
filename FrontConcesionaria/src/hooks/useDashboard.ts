import { useQuery } from '@tanstack/react-query';
import { vehiculosApi } from '../api/vehiculos.api';
import { ventasApi } from '../api/ventas.api';
import { clientesApi } from '../api/clientes.api';
import { reservasApi } from '../api/reservas.api';
import { reportesApi } from '../api/reportes.api';

export const dashboardKeys = {
    all: ['dashboard'] as const,
    stats: () => [...dashboardKeys.all, 'stats'] as const,
    stockDistribution: () => [...dashboardKeys.all, 'stockDistribution'] as const,
    finanzas: () => [...dashboardKeys.all, 'finanzas'] as const,
};

export const useDashboardStats = () => {
    return useQuery({
        queryKey: dashboardKeys.stats(),
        queryFn: async () => {
            const [vehiculos, ventas, clientes, reservas] = await Promise.all([
                vehiculosApi.getAll({ estado: 'publicado' }),
                ventasApi.getAll({}),
                clientesApi.getAll({}),
                reservasApi.getAll({ estado: 'activa' })
            ]);

            return {
                vehiculos: vehiculos.totalResults ?? 0,
                ventas: ventas.totalResults ?? 0,
                clientes: clientes.totalResults ?? 0,
                reservas: (reservas as { totalResults?: number })?.totalResults ?? 0,
            };
        },
        staleTime: 1000 * 60 * 2,
    });
};

export interface StockSlice {
    estado: 'preparacion' | 'publicado' | 'reservado' | 'vendido';
    label: string;
    value: number;
    color: string;
}

export const useStockDistribution = () => {
    return useQuery({
        queryKey: dashboardKeys.stockDistribution(),
        queryFn: async (): Promise<StockSlice[]> => {
            const [prep, pub, res, ven] = await Promise.all([
                vehiculosApi.getAll({ estado: 'preparacion' }, { limit: 1 }),
                vehiculosApi.getAll({ estado: 'publicado' }, { limit: 1 }),
                vehiculosApi.getAll({ estado: 'reservado' }, { limit: 1 }),
                vehiculosApi.getAll({ estado: 'vendido' }, { limit: 1 }),
            ]);
            return [
                { estado: 'preparacion', label: 'En preparación', value: prep.totalResults ?? 0, color: 'var(--warning)' },
                { estado: 'publicado', label: 'Publicados', value: pub.totalResults ?? 0, color: 'var(--accent)' },
                { estado: 'reservado', label: 'Reservados', value: res.totalResults ?? 0, color: 'var(--accent-3)' },
                { estado: 'vendido', label: 'Vendidos', value: ven.totalResults ?? 0, color: 'var(--accent-2)' },
            ];
        },
        staleTime: 1000 * 60 * 2,
    });
};

// ── Finanzas del mes ─────────────────────────────────────────────────────────
// Pulso financiero del mes en curso para el Dashboard. Se apoya en los reportes
// (ventas/caja/mora) pidiendo ?consolidar=ARS: si hay una cotización cargada, el
// backend devuelve un total consolidado en pesos; si no, se cae al desglose por
// moneda (nunca se suma ARS con USD sin cotización).

/** Un importe por moneda (fallback cuando no hay cotización para consolidar). */
export interface ImportePorMoneda {
    moneda: string;
    valor: number;
}

/** Un KPI financiero: total consolidado en ARS (o null) + desglose por moneda. */
export interface FinanzaKpi {
    /** Total consolidado en ARS, o null si no hay cotización cargada. */
    consolidado: number | null;
    porMoneda: ImportePorMoneda[];
}

export interface DashboardFinanzas {
    periodo: { anio: number; mes: number };
    /** Cotización usada para consolidar (o null si no hay ninguna cargada). */
    cotizacion: { valor: number; fecha: string } | null;
    ventasMes: FinanzaKpi & { cantidad: number };
    ingresosMes: FinanzaKpi;
    egresosMes: FinanzaKpi;
    netoMes: FinanzaKpi;
    mora: FinanzaKpi & { cuotas: number };
}

const pad2 = (n: number) => String(n).padStart(2, '0');
// Fecha local (no toISOString, que pasa a UTC y en AR corre el día de noche).
const aISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const useDashboardFinanzas = (enabled = true) => {
    return useQuery<DashboardFinanzas>({
        queryKey: dashboardKeys.finanzas(),
        enabled,
        staleTime: 1000 * 60 * 2,
        queryFn: async () => {
            const now = new Date();
            const anio = now.getFullYear();
            const mes = now.getMonth() + 1;
            const desde = aISO(new Date(anio, now.getMonth(), 1));
            const hasta = aISO(now);

            // Se pide consolidar en ARS siempre: si hay cotización el backend la usa;
            // si no, devuelve consolidado:null + el desglose porMoneda intacto.
            const [ventas, caja, mora] = await Promise.all([
                reportesApi.ventas({ desde, hasta, consolidar: 'ARS' }),
                reportesApi.caja({ anio, mes, consolidar: 'ARS' }),
                reportesApi.mora({ consolidar: 'ARS' }),
            ]);

            // La cotización usada la trae cualquiera de los consolidados.
            const cot = ventas.consolidado || caja.consolidado || mora.consolidado || null;

            return {
                periodo: { anio, mes },
                cotizacion: cot ? { valor: cot.valor, fecha: cot.fechaCotizacion } : null,
                ventasMes: {
                    consolidado: ventas.consolidado ? ventas.consolidado.total : null,
                    porMoneda: (ventas.resumen?.porMoneda ?? []).map((m) => ({ moneda: m.moneda, valor: Number(m.total ?? 0) })),
                    cantidad: ventas.resumen?.cantidad ?? 0,
                },
                ingresosMes: {
                    consolidado: caja.consolidado ? caja.consolidado.ingresos.total : null,
                    porMoneda: (caja.porMoneda ?? []).map((m) => ({ moneda: m.moneda, valor: m.ingresos.total })),
                },
                egresosMes: {
                    consolidado: caja.consolidado ? caja.consolidado.egresos.total : null,
                    porMoneda: (caja.porMoneda ?? []).map((m) => ({ moneda: m.moneda, valor: m.egresos.total })),
                },
                netoMes: {
                    consolidado: caja.consolidado ? caja.consolidado.neto : null,
                    porMoneda: (caja.porMoneda ?? []).map((m) => ({ moneda: m.moneda, valor: m.neto })),
                },
                mora: {
                    consolidado: mora.consolidado ? mora.consolidado.saldo : null,
                    porMoneda: (mora.resumen?.porMoneda ?? []).map((m) => ({ moneda: m.moneda, valor: Number(m.saldo ?? 0) })),
                    cuotas: mora.resumen?.cuotasVencidas ?? 0,
                },
            };
        },
    });
};
