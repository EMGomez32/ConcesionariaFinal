import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, TrendingUp, Wallet, AlertTriangle, BarChart3, DollarSign, Pencil, CalendarClock, Trophy, MessageCircle } from 'lucide-react';
import {
    reportesApi,
    type ReporteVentasItem,
    type ReporteMoraItem,
    type ReporteRentabilidadItem,
    type ProximoVencimientoItem,
    type RankingVendedorItem,
    type TotalPorMoneda,
} from '../../api/reportes.api';
import { cotizacionesApi } from '../../api/cotizaciones.api';
import { useSucursales } from '../../hooks/useSucursales';
import { useUsuarios } from '../../hooks/useUsuarios';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { formatFecha } from '../../utils/fecha';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';

type Tab = 'ventas' | 'caja' | 'mora' | 'rentabilidad' | 'proximos' | 'ranking';
type Consolidar = '' | 'ARS' | 'USD';

const TABS: { key: Tab; label: string; icon: typeof TrendingUp }[] = [
    { key: 'ventas', label: 'Ventas', icon: TrendingUp },
    { key: 'caja', label: 'Caja mensual', icon: Wallet },
    { key: 'mora', label: 'Cartera de mora', icon: AlertTriangle },
    { key: 'proximos', label: 'Por vencer', icon: CalendarClock },
    { key: 'ranking', label: 'Ranking', icon: Trophy },
    { key: 'rentabilidad', label: 'Rentabilidad', icon: BarChart3 },
];

// Tabs con datos sensibles (márgenes y facturación): solo admin. El backend ya
// los bloquea con 403; acá se ocultan para no mostrar una pestaña que fallaría.
const ADMIN_TABS: Tab[] = ['rentabilidad', 'ranking'];

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const money = (n: number, moneda = 'ARS') =>
    `${moneda === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

// Arma el link de WhatsApp con un mensaje YA REDACTADO. NO envía nada: abre el
// chat con el borrador y el usuario revisa y manda (como un mailto:).
// Normalización AR best-effort: dígitos, con prefijo 54 si falta. Devuelve null
// si no hay un número usable → el botón se muestra deshabilitado ("—").
const waHref = (telefono: string | undefined, mensaje: string): string | null => {
    const d = (telefono || '').replace(/\D/g, '');
    if (d.length < 8) return null;
    const num = d.startsWith('54') ? d : `54${d}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
};

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
        ? `No se puede calcular: la venta es en ${r.moneda} pero hay costos por ${otras}. Consolidá con una cotización para verla.`
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

/** Banda con el total ya convertido a una sola moneda (cuando el usuario consolida). */
const ConsolidadoCard = ({
    etiqueta,
    valor,
    cot,
}: {
    etiqueta: string;
    valor: number;
    cot: { moneda: string; valor: number; fechaCotizacion: string };
}) => (
    <div className="card glass" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem', borderLeft: '3px solid var(--accent)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex flex-col">
                <span className="text-muted font-bold text-xs uppercase tracking-wider">{etiqueta} · consolidado en {cot.moneda}</span>
                <span className="stat-value" style={{ color: 'var(--accent)' }}>{money(valor, cot.moneda)}</span>
            </div>
            <span className="text-xs text-muted" style={{ maxWidth: '18rem', textAlign: 'right' }}>
                Convertido a cotización {money(cot.valor)}/US$ del {formatFecha(cot.fechaCotizacion)}
            </span>
        </div>
    </div>
);

/** Aviso cuando se pidió consolidar pero no hay ninguna cotización cargada. */
const SinCotizacionCard = ({ isAdmin, onCargar }: { isAdmin: boolean; onCargar: () => void }) => (
    <div className="card glass" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem' }}>
        <div className="flex items-center gap-3 flex-wrap text-sm" style={{ color: 'var(--text-secondary)' }}>
            <AlertTriangle size={16} />
            <span>No hay ninguna cotización cargada, así que no se puede consolidar.</span>
            {isAdmin
                ? <button className="btn btn-secondary btn-sm" type="button" onClick={onCargar}>Cargar cotización</button>
                : <span>Pedile a un administrador que cargue la cotización del día.</span>}
        </div>
    </div>
);

const ReportesPage = () => {
    const { addToast } = useUIStore();
    const queryClient = useQueryClient();
    const isAdmin = useAuthStore((s) => !!s.user?.roles.some((r) => r === 'admin' || r === 'super_admin'));
    // Pestaña inicial por deep-link (?tab=mora, ?tab=proximos…). Lo usan las
    // alertas del Dashboard para aterrizar directo en el reporte relevante.
    const [searchParams] = useSearchParams();
    const paramTab = searchParams.get('tab');
    const puedeVerTab = (k: string | null): k is Tab => TABS.some((t) => t.key === k) && (isAdmin || !ADMIN_TABS.includes(k as Tab));
    const [tab, setTab] = useState<Tab>(puedeVerTab(paramTab) ? paramTab : 'ventas');
    // Pestañas visibles según rol (las admin-only se ocultan al resto).
    const visibleTabs = TABS.filter((t) => isAdmin || !ADMIN_TABS.includes(t.key));
    const [exporting, setExporting] = useState(false);

    // Filtros compartidos por rango (ventas / rentabilidad).
    const [desde, setDesde] = useState(primerDiaMes);
    const [hasta, setHasta] = useState(hoyStr);
    const [sucursalId, setSucursalId] = useState('');
    const [vendedorId, setVendedorId] = useState('');
    // Filtros de caja.
    const [anio, setAnio] = useState(hoy.getFullYear());
    const [mes, setMes] = useState(hoy.getMonth() + 1);
    // Consolidación de monedas ('' = mostrar ARS y USD por separado).
    const [consolidar, setConsolidar] = useState<Consolidar>('');
    const consolidarParam = consolidar || undefined;
    // Ventana del reporte "Por vencer" (días hacia adelante).
    const [dias, setDias] = useState(7);

    const { data: sucursales = [] } = useSucursales();
    const { data: usuariosData } = useUsuarios({}, { limit: 1000 });
    const vendedores = usuariosData?.results ?? [];

    // ── Cotización del dólar ────────────────────────────────────────────────
    const cotizacionQ = useQuery({
        queryKey: ['cotizacion', 'vigente'],
        queryFn: () => cotizacionesApi.getVigente(),
    });
    const [showCotModal, setShowCotModal] = useState(false);
    const [cotFecha, setCotFecha] = useState(hoyStr);
    const [cotValor, setCotValor] = useState('');
    const [cotError, setCotError] = useState('');
    const cotMutation = useMutation({
        mutationFn: (data: { fecha: string; valor: number }) => cotizacionesApi.upsert(data),
        onSuccess: () => {
            addToast('Cotización guardada', 'success');
            setShowCotModal(false);
            setCotValor('');
            // Refresca el chip de cotización y todos los reportes (para reconsolidar).
            queryClient.invalidateQueries({ queryKey: ['cotizacion'] });
            queryClient.invalidateQueries({ queryKey: ['reporte'] });
        },
        onError: (e: unknown) => setCotError((e as { message?: string })?.message ?? 'No se pudo guardar la cotización'),
    });
    const openCotModal = () => {
        setCotError('');
        setCotFecha(hoyStr);
        setCotValor(cotizacionQ.data ? String(cotizacionQ.data.valor) : '');
        setShowCotModal(true);
    };
    const handleSaveCotizacion = () => {
        const valorNum = parseFloat(cotValor);
        if (!cotFecha || !valorNum || valorNum <= 0) {
            setCotError('Ingresá una fecha y un valor mayor a 0.');
            return;
        }
        setCotError('');
        cotMutation.mutate({ fecha: cotFecha, valor: valorNum });
    };

    const rango = {
        desde: desde || undefined,
        hasta: hasta || undefined,
        sucursalId: sucursalId ? Number(sucursalId) : undefined,
    };

    const ventasQ = useQuery({
        queryKey: ['reporte', 'ventas', { ...rango, vendedorId, consolidar }],
        queryFn: () => reportesApi.ventas({ ...rango, vendedorId: vendedorId ? Number(vendedorId) : undefined, consolidar: consolidarParam }),
        enabled: tab === 'ventas',
    });
    const cajaQ = useQuery({
        queryKey: ['reporte', 'caja', anio, mes, consolidar],
        queryFn: () => reportesApi.caja({ anio, mes, consolidar: consolidarParam }),
        enabled: tab === 'caja',
    });
    const moraQ = useQuery({
        queryKey: ['reporte', 'mora', consolidar],
        queryFn: () => reportesApi.mora({ consolidar: consolidarParam }),
        enabled: tab === 'mora',
    });
    const rentaQ = useQuery({
        queryKey: ['reporte', 'rentabilidad', { ...rango, consolidar }],
        queryFn: () => reportesApi.rentabilidad({ ...rango, consolidar: consolidarParam }),
        enabled: tab === 'rentabilidad',
    });
    const proximosQ = useQuery({
        queryKey: ['reporte', 'proximos', dias, consolidar],
        queryFn: () => reportesApi.proximosVencimientos({ dias, consolidar: consolidarParam }),
        enabled: tab === 'proximos',
    });
    const rankingQ = useQuery({
        queryKey: ['reporte', 'ranking', { ...rango, consolidar }],
        queryFn: () => reportesApi.rankingVendedores({ ...rango, consolidar: consolidarParam }),
        enabled: tab === 'ranking',
    });

    const handleExport = async () => {
        setExporting(true);
        try {
            const params: Record<string, unknown> =
                tab === 'caja' ? { anio, mes }
                    : tab === 'mora' ? {}
                        : tab === 'proximos' ? { dias }
                            : { ...rango, ...(tab === 'ventas' && vendedorId ? { vendedorId: Number(vendedorId) } : {}) };
            // Algunos tabs mapean a un nombre de endpoint distinto.
            const reporteCsv = tab === 'proximos' ? 'proximos-vencimientos'
                : tab === 'ranking' ? 'ranking-vendedores'
                    : tab;
            const { blob, filename } = await reportesApi.exportCsv(reporteCsv, params);
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
        {
            header: 'Contacto', align: 'center', accessor: (r) => {
                const msg = `Hola ${r.cliente}, te recordamos que la cuota N° ${r.nroCuota}${r.vehiculo ? ` de ${r.vehiculo}` : ''} venció el ${formatFecha(r.vencimiento)} y registra un saldo de ${money(r.saldo, r.moneda)}. ¿Coordinamos el pago? ¡Gracias!`;
                const href = waHref(r.telefono, msg);
                return href
                    ? <a href={href} target="_blank" rel="noreferrer" className="icon-btn" title="Recordar por WhatsApp (revisá antes de enviar)"><MessageCircle size={16} /></a>
                    : <span className="text-muted">—</span>;
            }
        },
    ];

    const rentaCols: Column<ReporteRentabilidadItem & { id: number }>[] = [
        { header: 'Fecha', accessor: (r) => formatFecha(r.fecha) },
        { header: 'Vehículo', accessor: (r) => <span className="font-bold">{r.vehiculo} {r.dominio && <span className="text-muted">({r.dominio})</span>}</span> },
        { header: 'Venta', align: 'right', accessor: (r) => money(r.precioVenta, r.moneda) },
        { header: 'Compra', align: 'right', accessor: (r) => money(r.precioCompra, r.moneda) },
        { header: 'Gastos', align: 'right', accessor: (r) => money(r.gastos, r.moneda) },
        // rentabilidad viene en null cuando el auto tiene costos en otra moneda:
        // sin cotización no hay margen posible. Si el usuario consolida y el backend
        // devolvió la versión convertida, se muestra ésa (ya no hay "—").
        {
            header: 'Rentabilidad', align: 'right', accessor: (r) => {
                if (consolidar && r.consolidado) {
                    const rc = r.consolidado.rentabilidad;
                    return (
                        <span className="font-bold" title={`Convertido a ${r.consolidado.moneda}`} style={{ color: rc >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
                            {money(rc, r.consolidado.moneda)}<span className="text-muted"> *</span>
                        </span>
                    );
                }
                return r.rentabilidad === null
                    ? <span className="text-muted" title={sinContarTexto(r)}>—</span>
                    : <span className="font-bold" style={{ color: r.rentabilidad >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>{money(r.rentabilidad, r.moneda)}</span>;
            }
        },
        {
            header: 'Margen', align: 'right', accessor: (r) => {
                if (consolidar && r.consolidado) {
                    return r.consolidado.margenPct === null ? <span className="text-muted">—</span> : <span title={`Convertido a ${r.consolidado.moneda}`}>{r.consolidado.margenPct}% <span className="text-muted">*</span></span>;
                }
                return r.margenPct === null
                    ? <span className="text-muted" title={sinContarTexto(r)}>—</span>
                    : `${r.margenPct}%`;
            }
        },
    ];

    const proximosCols: Column<ProximoVencimientoItem & { id: number }>[] = [
        { header: 'Cliente', accessor: (r) => <span className="font-bold">{r.cliente}</span> },
        { header: 'Teléfono', accessor: (r) => r.telefono },
        { header: 'Vehículo', accessor: (r) => `${r.vehiculo}${r.dominio ? ` (${r.dominio})` : ''}` },
        { header: 'Cuota', accessor: (r) => `#${r.nroCuota}` },
        { header: 'Vencimiento', accessor: (r) => formatFecha(r.vencimiento) },
        {
            header: 'Vence', align: 'center', accessor: (r) => {
                const label = r.diasParaVencer === 0 ? 'Hoy' : r.diasParaVencer === 1 ? 'Mañana' : `En ${r.diasParaVencer} días`;
                const variant = r.diasParaVencer <= 1 ? 'danger' : r.diasParaVencer <= 3 ? 'warning' : 'info';
                return <Badge variant={variant}>{label}</Badge>;
            }
        },
        // r.moneda es obligatorio: un saldo en USD con '$' se leería como pesos.
        { header: 'Saldo', align: 'right', accessor: (r) => <span className="font-bold">{money(r.saldo, r.moneda)}</span> },
        {
            header: 'Contacto', align: 'center', accessor: (r) => {
                const cuando = r.diasParaVencer === 0 ? 'vence hoy' : r.diasParaVencer === 1 ? 'vence mañana' : `vence el ${formatFecha(r.vencimiento)}`;
                const msg = `Hola ${r.cliente}, te recordamos que la cuota N° ${r.nroCuota}${r.vehiculo ? ` de ${r.vehiculo}` : ''} ${cuando}, por ${money(r.saldo, r.moneda)}. ¡Gracias!`;
                const href = waHref(r.telefono, msg);
                return href
                    ? <a href={href} target="_blank" rel="noreferrer" className="icon-btn" title="Recordar por WhatsApp (revisá antes de enviar)"><MessageCircle size={16} /></a>
                    : <span className="text-muted">—</span>;
            }
        },
    ];

    // Muestra facturado/rentabilidad del vendedor: consolidado en una moneda si se
    // pidió, o el desglose por moneda si no.
    const fmtRank = (item: RankingVendedorItem, campo: 'facturado' | 'rentabilidad') => {
        if (consolidar && item.consolidado) return money(item.consolidado[campo], item.consolidado.moneda);
        if (!item.porMoneda.length) return money(0);
        return item.porMoneda.map((m) => money(m[campo], m.moneda)).join(' · ');
    };

    const rankingCols: Column<RankingVendedorItem & { id: number; _pos: number }>[] = [
        {
            header: '#', align: 'center', accessor: (r) => {
                const medalla = r._pos === 1 ? '🥇' : r._pos === 2 ? '🥈' : r._pos === 3 ? '🥉' : null;
                return medalla ? <span style={{ fontSize: '1.15rem' }}>{medalla}</span> : <span className="text-muted font-bold">{r._pos}</span>;
            }
        },
        { header: 'Vendedor', accessor: (r) => <span className="font-bold">{r.vendedor}</span> },
        { header: 'Unidades', align: 'center', accessor: (r) => <Badge variant="info">{r.unidades}</Badge> },
        { header: 'Facturado', align: 'right', accessor: (r) => <span className="font-bold">{fmtRank(r, 'facturado')}</span> },
        { header: 'Rentabilidad', align: 'right', accessor: (r) => fmtRank(r, 'rentabilidad') },
    ];

    // Facturado total del ranking: consolidado si se pidió, si no la suma por
    // moneda de todos los vendedores (no se mezcla ARS con USD).
    const rankingFacturadoTotal = () => {
        const data = rankingQ.data;
        if (!data) return money(0);
        if (data.consolidado) return money(data.consolidado.facturado, data.consolidado.moneda);
        const acc: Record<string, number> = {};
        for (const it of data.items) for (const m of it.porMoneda) acc[m.moneda] = (acc[m.moneda] ?? 0) + m.facturado;
        const keys = Object.keys(acc).sort();
        return keys.length ? keys.map((k) => money(acc[k], k)).join(' · ') : money(0);
    };

    // Banda consolidada / aviso, reutilizada por cada tab.
    const renderConsolidado = (
        data: { consolidado?: unknown; sinCotizacion?: boolean } | undefined,
        etiqueta: string,
        getValor: (c: any) => number,
    ) => {
        if (!consolidar) return null;
        if (data?.sinCotizacion) return <SinCotizacionCard isAdmin={isAdmin} onCargar={openCotModal} />;
        const c = data?.consolidado as any;
        if (!c) return null;
        return <ConsolidadoCard etiqueta={etiqueta} valor={getValor(c)} cot={c} />;
    };

    return (
        <div className="page-container">
            <header className="page-header">
                <div className="header-title">
                    <h1>Reportes</h1>
                    <p>Ventas, caja, mora, próximos vencimientos y rentabilidad. Exportá cualquier reporte a CSV.</p>
                </div>
                <div className="header-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Chip de cotización: muestra la última cargada; admin puede editarla. */}
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={isAdmin ? openCotModal : undefined}
                        title={isAdmin ? 'Cargar / actualizar la cotización del dólar' : 'Cotización del dólar vigente'}
                        style={{ cursor: isAdmin ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <DollarSign size={14} />
                        {cotizacionQ.data
                            ? <>Dólar {money(cotizacionQ.data.valor)} <span className="text-muted">· {formatFecha(cotizacionQ.data.fecha)}</span></>
                            : <span className="text-muted">Sin cotización</span>}
                        {isAdmin && <Pencil size={12} />}
                    </button>
                    {/* Consolidar en una sola moneda */}
                    <select
                        className="form-input"
                        value={consolidar}
                        onChange={(e) => setConsolidar(e.target.value as Consolidar)}
                        title="Convertir todos los totales a una sola moneda"
                        style={{ width: 'auto' }}
                    >
                        <option value="">Ver ARS y USD por separado</option>
                        <option value="ARS">Consolidar en ARS</option>
                        <option value="USD">Consolidar en USD</option>
                    </select>
                    <Button variant="secondary" onClick={handleExport} loading={exporting}>
                        <Download size={16} /> Exportar CSV
                    </Button>
                </div>
            </header>

            {/* Tabs — control .segmented del design system, igual que GastosPage. */}
            <div className="segmented" role="tablist" style={{ marginBottom: '1.5rem' }}>
                {visibleTabs.map(({ key, label, icon: Icon }) => (
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

            {/* Filtros por rango (ventas / rentabilidad / ranking) */}
            {(tab === 'ventas' || tab === 'rentabilidad' || tab === 'ranking') && (
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

            {/* Filtro de ventana (próximos vencimientos) */}
            {tab === 'proximos' && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="filter-group">
                        <label className="filter-label">Ventana</label>
                        <select className="form-input" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                            <option value={7}>Próximos 7 días</option>
                            <option value={15}>Próximos 15 días</option>
                            <option value={30}>Próximos 30 días</option>
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
                    {!ventasQ.isError && renderConsolidado(ventasQ.data, 'Total general', (c) => c.total)}
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
                        {renderConsolidado(cajaQ.data, 'Resultado neto', (c) => c.neto)}
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
                    {!moraQ.isError && renderConsolidado(moraQ.data, 'Saldo total en mora', (c) => c.saldo)}
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
                    {!rentaQ.isError && renderConsolidado(rentaQ.data, 'Rentabilidad total', (c) => c.rentabilidad)}
                    <DataTable
                        columns={rentaCols}
                        data={(rentaQ.data?.items ?? []).map((it, i) => ({ ...it, id: i }))}
                        isLoading={rentaQ.isLoading}
                        isError={rentaQ.isError}
                        errorMessage="No se pudo cargar el reporte de rentabilidad"
                        onRetry={() => rentaQ.refetch()}
                        emptyMessage="No hay ventas en el período seleccionado"
                    />
                    {consolidar && (rentaQ.data?.items ?? []).some((it) => it.consolidado) && (
                        <p className="text-xs text-muted" style={{ marginTop: '0.75rem' }}>
                            * Rentabilidad y margen convertidos a {consolidar} con la cotización cargada.
                        </p>
                    )}
                </>
            )}

            {/* ── PRÓXIMOS VENCIMIENTOS ── */}
            {tab === 'proximos' && (
                <>
                    {!proximosQ.isError && (
                        <div className="stats-grid stagger" style={{ marginBottom: '1.5rem' }}>
                            <StatCard label="Cuotas por vencer" value={String(proximosQ.data?.resumen.cuotasPorVencer ?? 0)} />
                            <StatCard label="Saldo a cobrar" value={fmtMoneda(proximosQ.data?.resumen.porMoneda, 'saldo')} color="var(--accent)" />
                            <StatCard label="Clientes" value={String(proximosQ.data?.resumen.clientes ?? 0)} />
                        </div>
                    )}
                    {!proximosQ.isError && renderConsolidado(proximosQ.data, 'Saldo a cobrar', (c) => c.saldo)}
                    <DataTable
                        columns={proximosCols}
                        data={(proximosQ.data?.items ?? []).map((it, i) => ({ ...it, id: i }))}
                        isLoading={proximosQ.isLoading}
                        isError={proximosQ.isError}
                        errorMessage="No se pudo cargar el reporte de próximos vencimientos"
                        onRetry={() => proximosQ.refetch()}
                        emptyMessage="No hay cuotas por vencer en la ventana seleccionada"
                    />
                </>
            )}

            {/* ── RANKING DE VENDEDORES ── */}
            {tab === 'ranking' && (
                <>
                    {!rankingQ.isError && (
                        <div className="stats-grid stagger" style={{ marginBottom: '1.5rem' }}>
                            <StatCard label="Vendedores" value={String(rankingQ.data?.resumen.vendedores ?? 0)} />
                            <StatCard label="Unidades vendidas" value={String(rankingQ.data?.resumen.unidades ?? 0)} />
                            <StatCard label="Facturado total" value={rankingFacturadoTotal()} color="var(--accent)" />
                        </div>
                    )}
                    {!rankingQ.isError && renderConsolidado(rankingQ.data, 'Facturado total', (c) => c.facturado)}
                    <DataTable
                        columns={rankingCols}
                        data={(rankingQ.data?.items ?? []).map((it, i) => ({ ...it, id: i, _pos: i + 1 }))}
                        isLoading={rankingQ.isLoading}
                        isError={rankingQ.isError}
                        errorMessage="No se pudo cargar el ranking de vendedores"
                        onRetry={() => rankingQ.refetch()}
                        emptyMessage="No hay ventas en el período seleccionado"
                    />
                </>
            )}

            {/* Modal de carga de cotización (solo admin) */}
            <Modal
                isOpen={showCotModal}
                onClose={() => setShowCotModal(false)}
                title="Cotización del dólar"
                subtitle="Pesos por 1 USD. Se usa para consolidar los totales de los reportes."
                maxWidth="440px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowCotModal(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSaveCotizacion} loading={cotMutation.isPending}>Guardar</Button>
                    </>
                }
            >
                <div className="space-y-6">
                    <div className="form-group">
                        <label className="form-label">Fecha</label>
                        <input type="date" className="form-input" value={cotFecha} onChange={(e) => setCotFecha(e.target.value)} max={hoyStr} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Valor (ARS por 1 USD) *</label>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-accent font-black">$</div>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="form-input pl-8 font-black text-xl"
                                value={cotValor}
                                onChange={(e) => setCotValor(e.target.value)}
                                placeholder="1450"
                                autoFocus
                            />
                        </div>
                    </div>
                    {cotError && (
                        <div className="uploader-alert uploader-alert-error">
                            <AlertTriangle size={14} />
                            <span>{cotError}</span>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default ReportesPage;
