import { useQuery } from '@tanstack/react-query';
import { vehiculosApi } from '../api/vehiculos.api';
import { ventasApi } from '../api/ventas.api';
import { clientesApi } from '../api/clientes.api';
import { reservasApi } from '../api/reservas.api';
import { reportesApi } from '../api/reportes.api';
import { metasApi } from '../api/metas.api';
import { objetivosApi } from '../api/objetivos.api';

export const dashboardKeys = {
    all: ['dashboard'] as const,
    stats: () => [...dashboardKeys.all, 'stats'] as const,
    stockDistribution: () => [...dashboardKeys.all, 'stockDistribution'] as const,
    finanzas: () => [...dashboardKeys.all, 'finanzas'] as const,
    alertas: () => [...dashboardKeys.all, 'alertas'] as const,
    tendencia: (meses: number) => [...dashboardKeys.all, 'tendencia', meses] as const,
    meta: () => [...dashboardKeys.all, 'meta'] as const,
    miObjetivo: () => [...dashboardKeys.all, 'miObjetivo'] as const,
    alertasResumen: () => [...dashboardKeys.all, 'alertasResumen'] as const,
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

// ── Acciones del día (centro de alertas) ─────────────────────────────────────
// Junta las señales accionables de la home: unidades estancadas, cuotas por vencer,
// cuotas en mora, reservas por vencer y turnos de taller de la semana. Cada una
// linkea al lugar donde se actúa. Sólo admin (stock-antiguedad expone precio de compra).

/** Una alerta accionable: un conteo + su monto (consolidado o por moneda). */
export interface AlertaItem {
    count: number;
    montoConsolidado: number | null;
    porMoneda: ImportePorMoneda[];
}

export interface DashboardAlertas {
    cotizacion: { valor: number; fecha: string } | null;
    estancados: AlertaItem & { umbral: number };
    porVencer: AlertaItem & { dias: number };
    mora: AlertaItem;
    reservas: AlertaItem & { dias: number };
    /** Turnos de taller (postventa): no llevan monto, sí un subconteo de "hoy". */
    turnos: { count: number; hoy: number; dias: number };
}

export const useDashboardAlertas = (enabled = true) => {
    return useQuery<DashboardAlertas>({
        queryKey: dashboardKeys.alertas(),
        enabled,
        staleTime: 1000 * 60 * 2,
        queryFn: async () => {
            const DIAS_POR_VENCER = 7;
            // Se pide consolidar en ARS: con cotización cargada da un monto en pesos;
            // si no, cada endpoint devuelve consolidado:null + el desglose por moneda.
            const [stock, proximos, mora, reservas, turnos] = await Promise.all([
                reportesApi.stockAntiguedad({ umbral: 60, consolidar: 'ARS' }),
                reportesApi.proximosVencimientos({ dias: DIAS_POR_VENCER, consolidar: 'ARS' }),
                reportesApi.mora({ consolidar: 'ARS' }),
                reportesApi.reservasPorVencer({ dias: DIAS_POR_VENCER, consolidar: 'ARS' }),
                reportesApi.turnosTaller({ dias: DIAS_POR_VENCER }),
            ]);
            const cot = stock.consolidado || proximos.consolidado || mora.consolidado || reservas.consolidado || null;
            return {
                cotizacion: cot ? { valor: cot.valor, fecha: cot.fechaCotizacion } : null,
                estancados: {
                    umbral: stock.estancados.umbral,
                    count: stock.estancados.count,
                    montoConsolidado: stock.consolidado ? stock.consolidado.capital : null,
                    porMoneda: (stock.estancados.porMoneda ?? []).map((m) => ({ moneda: m.moneda, valor: Number(m.capital ?? 0) })),
                },
                porVencer: {
                    dias: DIAS_POR_VENCER,
                    count: proximos.resumen?.cuotasPorVencer ?? 0,
                    montoConsolidado: proximos.consolidado ? proximos.consolidado.saldo : null,
                    porMoneda: (proximos.resumen?.porMoneda ?? []).map((m) => ({ moneda: m.moneda, valor: Number(m.saldo ?? 0) })),
                },
                mora: {
                    count: mora.resumen?.cuotasVencidas ?? 0,
                    montoConsolidado: mora.consolidado ? mora.consolidado.saldo : null,
                    porMoneda: (mora.resumen?.porMoneda ?? []).map((m) => ({ moneda: m.moneda, valor: Number(m.saldo ?? 0) })),
                },
                reservas: {
                    dias: DIAS_POR_VENCER,
                    count: reservas.resumen?.cantidad ?? 0,
                    montoConsolidado: reservas.consolidado ? reservas.consolidado.montoSenia : null,
                    porMoneda: (reservas.resumen?.porMoneda ?? []).map((m) => ({ moneda: m.moneda, valor: Number(m.montoSenia ?? 0) })),
                },
                turnos: {
                    dias: DIAS_POR_VENCER,
                    count: turnos.resumen?.cantidad ?? 0,
                    hoy: turnos.resumen?.hoy ?? 0,
                },
            };
        },
    });
};

// ── Tendencia de ventas (últimos meses) ──────────────────────────────────────
// Serie mensual para el gráfico de tendencia del Dashboard. Se pide consolidar en
// ARS: con cotización cargada, `facturadoConsolidado` viene en pesos.
export const useDashboardTendencia = (enabled = true, meses = 6) => {
    return useQuery({
        queryKey: dashboardKeys.tendencia(meses),
        enabled,
        staleTime: 1000 * 60 * 5,
        queryFn: () => reportesApi.ventasMensuales({ meses, consolidar: 'ARS' }),
    });
};

// ── Meta de ventas del mes ───────────────────────────────────────────────────
export const useDashboardMeta = (enabled = true) => {
    return useQuery({
        queryKey: dashboardKeys.meta(),
        enabled,
        staleTime: 1000 * 60 * 5,
        // Se pasa el mes calculado en el CLIENTE (mismo criterio que finanzas y que
        // la escritura de la meta): si dejáramos que lo elija el servidor (su reloj),
        // a fin de mes con el server en otra zona horaria la lectura y la escritura
        // quedarían en meses distintos y la meta recién guardada no aparecería.
        queryFn: () => {
            const n = new Date();
            return metasApi.actual(n.getFullYear(), n.getMonth() + 1);
        },
    });
};

// ── Mi objetivo del mes (self-view del vendedor) ─────────────────────────────
// El objetivo individual del usuario logueado y su progreso. El mes se calcula en
// el cliente (mismo criterio que la meta del tenant, arriba).
export const useMiObjetivo = (enabled = true) => {
    return useQuery({
        queryKey: dashboardKeys.miObjetivo(),
        enabled,
        staleTime: 1000 * 60 * 5,
        queryFn: () => {
            const n = new Date();
            return objetivosApi.mio(n.getFullYear(), n.getMonth() + 1);
        },
    });
};
