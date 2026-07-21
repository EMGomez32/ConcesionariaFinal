import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, TrendingUp, Wallet, AlertTriangle, BarChart3 } from 'lucide-react';
import {
    reportesApi,
    type ReporteVentasItem,
    type ReporteMoraItem,
    type ReporteRentabilidadItem,
    type TotalPorMoneda,
} from '../../api/reportes.api';
import { useSucursales } from '../../hooks/useSucursales';
import { useUsuarios } from '../../hooks/useUsuarios';
import { useUIStore } from '../../store/uiStore';
import { formatFecha } from '../../utils/fecha';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';

type Tab = 'ventas' | 'caja' | 'mora' | 'rentabilidad';

const TABS: { key: Tab; label: string; icon: typeof TrendingUp }[] = [
    { key: 'ventas', label: 'Ventas', icon: TrendingUp },
    { key: 'caja', label: 'Caja mensual', icon: Wallet },
    { key: 'mora', label: 'Cartera de mora', icon: AlertTriangle },
    { key: 'rentabilidad', label: 'Rentabilidad', icon: BarChart3 },
];

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const money = (n: number, moneda = 'ARS') =>
    `${moneda === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

// Formatea un total desglosado por moneda: "$1.500.000 · US$20.000" (o "—").
const fmtMoneda = (arr: TotalPorMoneda[] | undefined, campo: string) => {
    if (!arr || arr.length === 0) return money(0);
    return arr.map((m) => money(Number(m[campo] ?? 0), m.moneda)).join(' · ');
};

// Primer y último día del mes actual en formato YYYY-MM-DD.
// Se arma con los getters LOCALES y no con toISOString(): éste pasa a UTC, así
// que en Argentina (UTC-3) después de las 21:00 devolvía la fecha de MAÑANA y el
// filtro "Hasta" arrancaba un día adelantado.
const aISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const hoy = new Date();
const primerDiaMes = aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
const hoyStr = aISO(hoy);

/** Explica por qué un margen no se pudo calcular (tooltip del "—"). */
const sinContarTexto = (r: { moneda: string; sinContar?: Record<string, number> }) => {
    const otras = Object.entries(r.sinContar ?? {})
        .map(([m, n]) => money(Number(n), m))
        .join(' + ');
    return otras
        ? `No se puede calcular: la venta es en ${r.moneda} pero hay costos por ${otras}. Haría falta una cotización.`
        : 'No se puede calcular: hay costos en otra moneda.';
};

const StatCard = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="card stat-card">
        <div className="stat-content">
            <span className="text-muted font-bold text-xs uppercase tracking-wider mb-1">{label}</span>
            <span className="stat-value" style={color ? { color } : undefined}>{value}</span>
        </div>
    </div>
);

/** Error de carga con el mismo lenguaje visual que el de DataTable. */
const ErrorCard = ({ mensaje, onRetry }: { mensaje: string; onRetry: () => void }) => (
    <div className="card glass" style={{ textAlign: 'center', padding: '3rem' }}>
        <div className="dt-empty">
            <div className="dt-empty-badge is-error">
                <AlertTriangle size={40} />
            </div>
            <p className="dt-empty-text">{mensaje}</p>
            <p className="dt-empty-hint">
                Es un problema al consultar el servidor, no un período sin movimientos.
            </p>
            <button onClick={onRetry} className="btn btn-secondary btn-sm" type="button">
                Reintentar
            </button>
        </div>
    </div>
);

const ReportesPage = () => {
    const { addToast } = useUIStore();
    const [tab, setTab] = useState<Tab>('ventas');
    const [exporting, setExporting] = useState(false);

    // Filtros compartidos por rango (ventas / rentabilidad).
    const [desde, setDesde] = useState(primerDiaMes);
    const [hasta, setHasta] = useState(hoyStr);
    const [sucursalId, setSucursalId] = useState('');
    const [vendedorId, setVendedorId] = useState('');
    // Filtros de caja.
    const [anio, setAnio] = useState(hoy.getFullYear());
    const [mes, setMes] = useState(hoy.getMonth() + 1);

    const { data: sucursales = [] } = useSucursales();
    const { data: usuariosData } = useUsuarios({}, { limit: 1000 });
    const vendedores = usuariosData?.results ?? [];

    const rango = {
        desde: desde || undefined,
        hasta: hasta || undefined,
        sucursalId: sucursalId ? Number(sucursalId) : undefined,
    };

    const ventasQ = useQuery({
        queryKey: ['reporte', 'ventas', { ...rango, vendedorId }],
        queryFn: () => reportesApi.ventas({ ...rango, vendedorId: vendedorId ? Number(vendedorId) : undefined }),
        enabled: tab === 'ventas',
    });
    const cajaQ = useQuery({
        queryKey: ['reporte', 'caja', anio, mes],
        queryFn: () => reportesApi.caja({ anio, mes }),
        enabled: tab === 'caja',
    });
    const moraQ = useQuery({
        queryKey: ['reporte', 'mora'],
        queryFn: () => reportesApi.mora(),
        enabled: tab === 'mora',
    });
    const rentaQ = useQuery({
        queryKey: ['reporte', 'rentabilidad', rango],
        queryFn: () => reportesApi.rentabilidad(rango),
        enabled: tab === 'rentabilidad',
    });

    const handleExport = async () => {
        setExporting(true);
        try {
            const params: Record<string, unknown> =
                tab === 'caja' ? { anio, mes }
                    : tab === 'mora' ? {}
                        : { ...rango, ...(tab === 'ventas' && vendedorId ? { vendedorId: Number(vendedorId) } : {}) };
            const { blob, filename } = await reportesApi.exportCsv(tab, params);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            // El nombre lo manda el backend en el Content-Disposition y ya trae el
            // período (reporte-caja-2026-07-...): armarlo acá con la fecha de HOY
            // hacía que los exports de dos meses distintos se llamaran igual y el
            // segundo pisara al primero. El fallback es sólo por si el header no
            // llega (proxy que lo filtre, etc.).
            link.setAttribute('download', filename ?? `reporte-${tab}-${hoyStr}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            addToast('Exportación descargada', 'success');
        } catch {
            addToast('Error al exportar el reporte', 'error');
        } finally {
            setExporting(false);
        }
    };

    // ── Columnas ──────────────────────────────────────────────────────────────
    const ventasCols: Column<ReporteVentasItem>[] = [
        { header: 'Fecha', accessor: (r) => formatFecha(r.fecha) },
        { header: 'Vehículo', accessor: (r) => <span className="font-bold">{r.vehiculo} {r.dominio && <span className="text-muted">({r.dominio})</span>}</span> },
        { header: 'Cliente', accessor: (r) => r.cliente },
        { header: 'Vendedor', accessor: (r) => r.vendedor },
        { header: 'Forma de pago', accessor: (r) => <Badge variant="info">{r.formaPago}</Badge> },
        { header: 'Total', align: 'right', accessor: (r) => <span className="font-bold">{money(r.total, r.moneda)}</span> },
    ];

    const moraCols: Column<ReporteMoraItem & { id: number }>[] = [
        { header: 'Cliente', accessor: (r) => <span className="font-bold">{r.cliente}</span> },
        { header: 'Teléfono', accessor: (r) => r.telefono },
        { header: 'Vehículo', accessor: (r) => `${r.vehiculo}${r.dominio ? ` (${r.dominio})` : ''}` },
        { header: 'Cuota', accessor: (r) => `#${r.nroCuota}` },
        { header: 'Vencimiento', accessor: (r) => formatFecha(r.vencimiento) },
        { header: 'Atraso', align: 'center', accessor: (r) => <Badge variant={r.diasAtraso > 30 ? 'danger' : 'warning'}>{r.diasAtraso} días</Badge> },
        // r.moneda es obligatorio acá: sin él, un saldo en USD se imprimía con '$'
        // y se leía como pesos.
        { header: 'Saldo', align: 'right', accessor: (r) => <span className="font-bold">{money(r.saldo, r.moneda)}</span> },
    ];

    const rentaCols: Column<ReporteRentabilidadItem & { id: number }>[] = [
        { header: 'Fecha', accessor: (r) => formatFecha(r.fecha) },
        { header: 'Vehículo', accessor: (r) => <span className="font-bold">{r.vehiculo} {r.dominio && <span className="text-muted">({r.dominio})</span>}</span> },
        { header: 'Venta', align: 'right', accessor: (r) => money(r.precioVenta, r.moneda) },
        { header: 'Compra', align: 'right', accessor: (r) => money(r.precioCompra, r.moneda) },
        { header: 'Gastos', align: 'right', accessor: (r) => money(r.gastos, r.moneda) },
        // rentabilidad viene en null cuando el auto tiene costos en otra moneda:
        // sin cotización no hay margen posible, así que se dice eso en vez de
        // mostrar un número inventado.
        {
            header: 'Rentabilidad', align: 'right', accessor: (r) => (
                r.rentabilidad === null
                    ? <span className="text-muted" title={sinContarTexto(r)}>—</span>
                    : <span className="font-bold" style={{ color: r.rentabilidad >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>{money(r.rentabilidad, r.moneda)}</span>
            )
        },
        {
            header: 'Margen', align: 'right', accessor: (r) => (
                r.margenPct === null
                    ? <span className="text-muted" title={sinContarTexto(r)}>—</span>
                    : `${r.margenPct}%`
            )
        },
    ];

    return (
        <div className="page-container">
            <header className="page-header">
                <div className="header-title">
                    <h1>Reportes</h1>
                    <p>Ventas, caja, mora y rentabilidad. Exportá cualquier reporte a CSV.</p>
                </div>
                <div className="header-actions">
                    <Button variant="secondary" onClick={handleExport} loading={exporting}>
                        <Download size={16} /> Exportar CSV
                    </Button>
                </div>
            </header>

            {/* Tabs — control .segmented del design system, igual que GastosPage. */}
            <div className="segmented" role="tablist" style={{ marginBottom: '1.5rem' }}>
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={`segmented-btn ${tab === key ? 'is-active' : ''}`}
                    >
                        <Icon size={14} /> {label}
                    </button>
                ))}
            </div>

            {/* Filtros por rango (ventas / rentabilidad) */}
            {(tab === 'ventas' || tab === 'rentabilidad') && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="filter-group">
                        <label className="filter-label">Desde</label>
                        <input type="date" className="form-input" value={desde} onChange={(e) => setDesde(e.target.value)} />
                    </div>
                    <div className="filter-group">
                        <label className="filter-label">Hasta</label>
                        <input type="date" className="form-input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                    </div>
                    <div className="filter-group">
                        <label className="filter-label">Sucursal</label>
                        <select className="form-input" value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
                            <option value="">Todas</option>
                            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                        </select>
                    </div>
                    {tab === 'ventas' && (
                        <div className="filter-group">
                            <label className="filter-label">Vendedor</label>
                            <select className="form-input" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
                                <option value="">Todos</option>
                                {vendedores.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            )}

            {/* Filtros de caja */}
            {tab === 'caja' && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="filter-group">
                        <label className="filter-label">Mes</label>
                        <select className="form-input" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label className="filter-label">Año</label>
                        <select className="form-input" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
                            {Array.from({ length: 6 }).map((_, i) => {
                                const y = hoy.getFullYear() - i;
                                return <option key={y} value={y}>{y}</option>;
                            })}
                        </select>
                    </div>
                </div>
            )}

            {/* ── VENTAS ── */}
            {tab === 'ventas' && (
                <>
                    {/* Con la consulta fallida los totales dirían "0 ventas / $0",
                        que es la misma mentira que el estado vacío pero en grande. */}
                    {!ventasQ.isError && (
                        <div className="stats-grid stagger" style={{ marginBottom: '1.5rem' }}>
                            <StatCard label="Cantidad de ventas" value={String(ventasQ.data?.resumen.cantidad ?? 0)} />
                            <StatCard label="Total ventas" value={fmtMoneda(ventasQ.data?.resumen.porMoneda, 'precioVenta')} color="var(--accent)" />
                            <StatCard label="Extras" value={fmtMoneda(ventasQ.data?.resumen.porMoneda, 'extras')} />
                            <StatCard label="Total general" value={fmtMoneda(ventasQ.data?.resumen.porMoneda, 'total')} color="var(--accent)" />
                        </div>
                    )}
                    <DataTable
                        columns={ventasCols}
                        data={ventasQ.data?.items ?? []}
                        isLoading={ventasQ.isLoading}
                        isError={ventasQ.isError}
                        errorMessage="No se pudo cargar el reporte de ventas"
                        onRetry={() => ventasQ.refetch()}
                        emptyMessage="No hay ventas en el período seleccionado"
                    />
                </>
            )}

            {/* ── CAJA ──
                Un bloque por moneda: los pesos y los dólares no se suman, así que
                tampoco se muestran juntos. Antes había 7 tarjetas con '$' fijo
                sobre agregados que ya venían mezclados del backend. */}
            {tab === 'caja' && (
                // El error va ANTES del vacío: "sin movimientos" ante una consulta
                // fallida se lee como un mes sin actividad.
                cajaQ.isError ? (
                    <ErrorCard mensaje="No se pudo cargar la caja del período" onRetry={() => cajaQ.refetch()} />
                ) : (cajaQ.data?.porMoneda ?? []).length === 0 ? (
                    <div className="card glass" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                        {cajaQ.isLoading ? 'Cargando…' : 'Sin movimientos de caja en el período.'}
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {(cajaQ.data?.porMoneda ?? []).map((c) => (
                            <div key={c.moneda}>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="badge badge-navy">{c.moneda}</span>
                                    <span className="text-xs text-muted">
                                        Resultado neto: <strong style={{ color: c.neto >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
                                            {money(c.neto, c.moneda)}
                                        </strong>
                                    </span>
                                </div>
                                <div className="stats-grid stagger">
                                    <StatCard label="Cobros de ventas" value={money(c.ingresos.cobrosVentas, c.moneda)} color="var(--success, #16a34a)" />
                                    <StatCard label="Cobros de cuotas" value={money(c.ingresos.cobrosCuotas, c.moneda)} color="var(--success, #16a34a)" />
                                    <StatCard label="Total ingresos" value={money(c.ingresos.total, c.moneda)} color="var(--success, #16a34a)" />
                                    <StatCard label="Gastos de vehículos" value={money(c.egresos.gastosVehiculos, c.moneda)} color="var(--danger, #dc2626)" />
                                    <StatCard label="Gastos fijos" value={money(c.egresos.gastosFijos, c.moneda)} color="var(--danger, #dc2626)" />
                                    <StatCard label="Total egresos" value={money(c.egresos.total, c.moneda)} color="var(--danger, #dc2626)" />
                                    <StatCard
                                        label="Resultado neto"
                                        value={money(c.neto, c.moneda)}
                                        color={c.neto >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)'}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* ── MORA ── */}
            {tab === 'mora' && (
                <>
                    {!moraQ.isError && (
                        <div className="stats-grid stagger" style={{ marginBottom: '1.5rem' }}>
                            <StatCard label="Cuotas vencidas" value={String(moraQ.data?.resumen.cuotasVencidas ?? 0)} color="var(--danger, #dc2626)" />
                            <StatCard label="Saldo total en mora" value={fmtMoneda(moraQ.data?.resumen.porMoneda, 'saldo')} color="var(--danger, #dc2626)" />
                            <StatCard label="Clientes en mora" value={String(moraQ.data?.resumen.clientes ?? 0)} />
                        </div>
                    )}
                    <DataTable
                        columns={moraCols}
                        data={(moraQ.data?.items ?? []).map((it, i) => ({ ...it, id: i }))}
                        isLoading={moraQ.isLoading}
                        isError={moraQ.isError}
                        // "Cartera al día" ante un error era el peor de los casos:
                        // decía exactamente lo contrario de lo que pasaba.
                        errorMessage="No se pudo cargar la cartera de mora"
                        onRetry={() => moraQ.refetch()}
                        emptyMessage="No hay cuotas en mora. ¡Cartera al día!"
                    />
                </>
            )}

            {/* ── RENTABILIDAD ── */}
            {tab === 'rentabilidad' && (
                <>
                    {!rentaQ.isError && (
                        <div className="stats-grid stagger" style={{ marginBottom: '1.5rem' }}>
                            <StatCard label="Unidades vendidas" value={String(rentaQ.data?.resumen.cantidad ?? 0)} />
                            <StatCard label="Total facturado" value={fmtMoneda(rentaQ.data?.resumen.porMoneda, 'precioVenta')} />
                            <StatCard label="Costo total" value={fmtMoneda(rentaQ.data?.resumen.porMoneda, 'costo')} />
                            <StatCard label="Rentabilidad total" value={fmtMoneda(rentaQ.data?.resumen.porMoneda, 'rentabilidad')} color="var(--accent)" />
                        </div>
                    )}
                    <DataTable
                        columns={rentaCols}
                        data={(rentaQ.data?.items ?? []).map((it, i) => ({ ...it, id: i }))}
                        isLoading={rentaQ.isLoading}
                        isError={rentaQ.isError}
                        errorMessage="No se pudo cargar el reporte de rentabilidad"
                        onRetry={() => rentaQ.refetch()}
                        emptyMessage="No hay ventas en el período seleccionado"
                    />
                </>
            )}
        </div>
    );
};

export default ReportesPage;
