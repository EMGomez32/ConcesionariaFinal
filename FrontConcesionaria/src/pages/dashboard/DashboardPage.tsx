import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Car, Users, RefreshCw, Clock, Zap, ShieldCheck, PieChart, TrendingUp, ArrowUpRight, ArrowDownRight, Wallet, AlertTriangle, Bookmark, Target, Wrench, CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboardStats, useStockDistribution, useDashboardFinanzas, useDashboardAlertas, useDashboardTendencia, useDashboardMeta, useMiObjetivo, dashboardKeys, type FinanzaKpi, type AlertaItem } from '../../hooks/useDashboard';
import type { VentaMensualItem } from '../../api/reportes.api';
import { metasApi } from '../../api/metas.api';
import { useAuditLogs } from '../../hooks/useAuditLogs';
import type { AuditLog } from '../../api/auditoria.api';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import AnimatedNumber from '../../components/ui/AnimatedNumber';
import DonutChart from '../../components/ui/DonutChart';
import { useTour } from '../../onboarding/useTour';
import { useTourStore } from '../../store/tourStore';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const money = (n: number, moneda = 'ARS') =>
  `${moneda === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

// El KPI muestra el total consolidado en ARS si hay cotización; si no, el
// desglose por moneda ("$X · US$Y"): nunca se suma ARS con USD sin cotización.
const kpiValue = (kpi: FinanzaKpi) =>
  kpi.consolidado != null
    ? money(kpi.consolidado, 'ARS')
    : (kpi.porMoneda.length ? kpi.porMoneda.map((m) => money(m.valor, m.moneda)).join(' · ') : money(0));

// El monto de una alerta: consolidado en ARS si hay cotización, si no por moneda.
const alertaMonto = (a: AlertaItem) =>
  a.montoConsolidado != null
    ? money(a.montoConsolidado, 'ARS')
    : (a.porMoneda.length ? a.porMoneda.map((m) => money(m.valor, m.moneda)).join(' · ') : money(0));

// Barra de progreso etiquetada (objetivo del mes). Verde al cumplir, ámbar lejos.
const ProgressRow = ({ etiqueta, actual, objetivo, pct }: { etiqueta: string; actual: string; objetivo: string; pct: number }) => {
  const color = pct >= 100 ? 'var(--success, #16a34a)' : pct >= 60 ? 'var(--accent)' : 'var(--warning, #f59e0b)';
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-1" style={{ marginBottom: '0.4rem' }}>
        <span className="text-muted font-bold text-xs uppercase tracking-wider">{etiqueta}</span>
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          {actual} <span className="text-muted">de {objetivo}</span> · <span style={{ color }}>{pct}%</span>
        </span>
      </div>
      <div style={{ height: '10px', width: '100%', background: 'color-mix(in srgb, var(--text-primary) 10%, transparent)', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '999px', transition: 'width .4s var(--easing-soft, ease)' }} />
      </div>
    </div>
  );
};

const DashboardPage = () => {
  const { user } = useAuthStore();
  // El log de auditoría es admin-only (dato sensible: acciones de todos + IP).
  // El panel "Actividad Reciente" sólo se muestra —y se consulta— para admin.
  const isAdmin = !!(user?.roles?.includes('admin') || user?.roles?.includes('super_admin'));
  // El vendedor ve su propio objetivo del mes (self-view). El admin ya ve la meta
  // del tenant más arriba, así que esto apunta al equipo comercial.
  const esVendedor = !!user?.roles?.includes('vendedor');

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useDashboardStats();
  const { data: stockData, isLoading: stockLoading, refetch: refetchStock } = useStockDistribution();
  const { data: auditsData, isLoading: auditsLoading } = useAuditLogs({}, { limit: 5 }, { enabled: isAdmin });
  // Finanzas del mes: dato de dueño, solo admin (igual criterio que Actividad Reciente).
  const { data: finanzas, isLoading: finanzasLoading, isError: finanzasError, refetch: refetchFinanzas } = useDashboardFinanzas(isAdmin);
  // Acciones del día: alertas accionables (estancados / por vencer / mora), solo admin.
  const { data: alertas, isLoading: alertasLoading, isError: alertasError, refetch: refetchAlertas } = useDashboardAlertas(isAdmin);
  // Tendencia de ventas (últimos 6 meses), solo admin.
  const { data: tendencia, isLoading: tendenciaLoading } = useDashboardTendencia(isAdmin);

  // ── Objetivo del mes (meta de ventas), solo admin ──
  const { data: meta, isLoading: metaLoading } = useDashboardMeta(isAdmin);
  // ── Mi objetivo del mes (self-view del vendedor) ──
  const { data: miObjetivoData, isLoading: miObjetivoLoading } = useMiObjetivo(esVendedor);
  const miObjetivo = miObjetivoData?.objetivo ?? null;
  const queryClient = useQueryClient();
  const { addToast } = useUIStore();

  // Tour de bienvenida: se auto-inicia UNA vez al entrar (si el usuario no lo
  // desactivó y no lo vio). Vive acá porque varios pasos se anclan a las tarjetas de
  // esta pantalla (la landing tras login). El "?" del TopBar lo relanza cuando quieran.
  const { startTour } = useTour();
  useEffect(() => {
    if (!useTourStore.getState().shouldAutoStart()) return;
    const t = window.setTimeout(() => startTour(), 700); // deja renderizar las tarjetas
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hoyDate = new Date();
  const mesActualLabel = MESES[hoyDate.getMonth()];
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [metaUnidades, setMetaUnidades] = useState('');
  const [metaMonto, setMetaMonto] = useState('');
  const [metaMoneda, setMetaMoneda] = useState<'ARS' | 'USD'>('ARS');
  const [metaError, setMetaError] = useState('');
  const metaMutation = useMutation({
    mutationFn: (data: { anio: number; mes: number; unidadesObjetivo?: number | null; montoObjetivo?: number | null; moneda: 'ARS' | 'USD' }) => metasApi.upsert(data),
    onSuccess: () => {
      addToast('Objetivo guardado', 'success');
      setShowMetaModal(false);
      queryClient.invalidateQueries({ queryKey: dashboardKeys.meta() });
    },
    onError: (e: unknown) => setMetaError((e as { message?: string })?.message ?? 'No se pudo guardar el objetivo'),
  });
  const openMetaModal = () => {
    setMetaError('');
    setMetaUnidades(meta?.unidadesObjetivo != null ? String(meta.unidadesObjetivo) : '');
    setMetaMonto(meta?.montoObjetivo != null ? String(meta.montoObjetivo) : '');
    setMetaMoneda((meta?.moneda as 'ARS' | 'USD') || 'ARS');
    setShowMetaModal(true);
  };
  const handleSaveMeta = () => {
    // Un objetivo válido es > 0; vacío / 0 / inválido = "sin objetivo" (null), igual
    // que el backend (positive()). Así fijar 0 no cuenta como objetivo.
    const posOrNull = (s: string) => { const n = Number(s); return s.trim() && !isNaN(n) && n > 0 ? n : null; };
    const u = posOrNull(metaUnidades);
    const m = posOrNull(metaMonto);
    if (u == null && m == null) { setMetaError('Fijá al menos un objetivo mayor a 0: unidades y/o facturado.'); return; }
    setMetaError('');
    metaMutation.mutate({ anio: hoyDate.getFullYear(), mes: hoyDate.getMonth() + 1, unidadesObjetivo: u, montoObjetivo: m, moneda: metaMoneda });
  };
  // Progreso: ventas del mes (de finanzas) contra el objetivo.
  const unidadesVendidas = finanzas?.ventasMes.cantidad ?? 0;
  const facturadoMonedaMeta = (finanzas?.ventasMes.porMoneda ?? []).find((m) => m.moneda === (meta?.moneda ?? 'ARS'))?.valor ?? 0;
  const pctMeta = (actual: number, objetivo: number) => (objetivo > 0 ? Math.min(100, Math.round((actual / objetivo) * 100)) : 0);

  const stats = [
    { label: 'Vehículos en Stock', value: statsData?.vehiculos ?? 0, icon: Car, color: 'var(--primary-navy)' },
    { label: 'Ventas Totales', value: statsData?.ventas ?? 0, icon: Zap, color: 'var(--accent)' },
    { label: 'Reservas Activas', value: statsData?.reservas ?? 0, icon: Clock, color: 'var(--warning)' },
    { label: 'Clientes Registrados', value: statsData?.clientes ?? 0, icon: Users, color: 'var(--info)' },
  ];

  const audits = (auditsData as { results?: AuditLog[] })?.results ?? [];
  const stockTotal = (stockData ?? []).reduce((sum, s) => sum + s.value, 0);

  const financeCards = finanzas ? [
    { label: 'Ventas del mes', value: kpiValue(finanzas.ventasMes), sub: `${finanzas.ventasMes.cantidad} ${finanzas.ventasMes.cantidad === 1 ? 'operación' : 'operaciones'}`, icon: TrendingUp, color: 'var(--accent)' },
    { label: 'Ingresos del mes', value: kpiValue(finanzas.ingresosMes), sub: 'cobros de ventas y cuotas', icon: ArrowUpRight, color: 'var(--success, #16a34a)' },
    { label: 'Egresos del mes', value: kpiValue(finanzas.egresosMes), sub: 'gastos de unidades y fijos', icon: ArrowDownRight, color: 'var(--danger, #dc2626)' },
    { label: 'Resultado neto', value: kpiValue(finanzas.netoMes), sub: 'ingresos − egresos', icon: Wallet, color: (finanzas.netoMes.consolidado != null ? finanzas.netoMes.consolidado < 0 : finanzas.netoMes.porMoneda.some((m) => m.valor < 0)) ? 'var(--danger, #dc2626)' : 'var(--success, #16a34a)' },
    { label: 'En mora', value: kpiValue(finanzas.mora), sub: `${finanzas.mora.cuotas} ${finanzas.mora.cuotas === 1 ? 'cuota vencida' : 'cuotas vencidas'}`, icon: AlertTriangle, color: 'var(--danger, #dc2626)' },
  ] : [];

  const alertCards = alertas ? [
    { key: 'estancados', label: `Estancadas (+${alertas.estancados.umbral} días)`, count: alertas.estancados.count, monto: alertaMonto(alertas.estancados), montoLabel: 'capital inmovilizado', icon: Car, color: 'var(--warning)', to: '/vehiculos' },
    { key: 'porvencer', label: `Cuotas vencen en ${alertas.porVencer.dias} días`, count: alertas.porVencer.count, monto: alertaMonto(alertas.porVencer), montoLabel: 'a cobrar', icon: Clock, color: 'var(--accent)', to: '/reportes?tab=proximos' },
    { key: 'mora', label: 'Cuotas en mora', count: alertas.mora.count, monto: alertaMonto(alertas.mora), montoLabel: 'saldo adeudado', icon: AlertTriangle, color: 'var(--danger, #dc2626)', to: '/reportes?tab=mora' },
    { key: 'reservas', label: `Reservas vencen en ${alertas.reservas.dias} días`, count: alertas.reservas.count, monto: alertaMonto(alertas.reservas), montoLabel: 'en señas', icon: Bookmark, color: '#8b5cf6', to: '/reservas' },
    { key: 'turnos', label: `Turnos de taller (${alertas.turnos.dias} días)`, count: alertas.turnos.count, monto: String(alertas.turnos.hoy), montoLabel: alertas.turnos.hoy === 1 ? 'turno hoy' : 'turnos hoy', icon: Wrench, color: 'var(--info)', to: '/postventa?tab=agenda' },
    { key: 'seguimientos', label: `Seguimientos CRM (${alertas.seguimientos.dias} días)`, count: alertas.seguimientos.count, monto: String(alertas.seguimientos.vencidos), montoLabel: alertas.seguimientos.vencidos === 1 ? 'vencido' : 'vencidos', icon: CalendarClock, color: '#0ea5e9', to: '/seguimientos' },
    { key: 'documentacion', label: `Documentación (${alertas.documentacion.dias} días)`, count: alertas.documentacion.count, monto: String(alertas.documentacion.vencidos), montoLabel: alertas.documentacion.vencidos === 1 ? 'vencida' : 'vencidas', icon: ShieldCheck, color: '#ea580c', to: '/reportes?tab=documentacion' },
  ] : [];

  // ── Tendencia de ventas ──
  const tItems: VentaMensualItem[] = tendencia?.items ?? [];
  const tMax = Math.max(1, ...tItems.map((i) => i.cantidad));
  const tTotalUnidades = tItems.reduce((s, i) => s + i.cantidad, 0);
  const tHayCotizacion = tItems.some((i) => i.facturadoConsolidado != null);
  const facturadoMes = (m: VentaMensualItem) =>
    m.facturadoConsolidado != null
      ? money(m.facturadoConsolidado, 'ARS')
      : (m.porMoneda.length ? m.porMoneda.map((x) => money(x.facturado, x.moneda)).join(' · ') : money(0));
  const tTotalFacturado = (() => {
    if (tHayCotizacion) return money(tItems.reduce((s, i) => s + (i.facturadoConsolidado ?? 0), 0), 'ARS');
    const acc: Record<string, number> = {};
    tItems.forEach((i) => i.porMoneda.forEach((x) => { acc[x.moneda] = (acc[x.moneda] ?? 0) + x.facturado; }));
    const keys = Object.keys(acc).sort();
    return keys.length ? keys.map((k) => money(acc[k], k)).join(' · ') : money(0);
  })();

  const onSync = () => {
    refetchStats();
    refetchStock();
    // refetch dispara la query aunque esté enabled:false; sólo tiene sentido para
    // admin (es quien ve —y consulta— finanzas y alertas).
    if (isAdmin) {
      refetchFinanzas();
      refetchAlertas();
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="header-title">
          <h1>Resumen Operativo</h1>
          <p>Indicadores en tiempo real de tu concesionaria.</p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={onSync}
            disabled={statsLoading || stockLoading}
          >
            <RefreshCw size={16} className={statsLoading || stockLoading ? 'animate-spin' : ''} />
            Sincronizar
          </button>
        </div>
      </header>

      <div className="stats-grid stagger" data-tour="dashboard-kpis">
        {stats.map((stat) => (
          <div key={stat.label} className="card stat-card">
            <div className="flex justify-between items-start mb-4">
              <div className="stat-icon-wrapper" style={{ backgroundColor: `${stat.color}10`, color: stat.color }}>
                <stat.icon size={20} />
              </div>
            </div>
            <div className="stat-content">
              <span className="text-muted font-bold text-xs uppercase tracking-wider mb-1">{stat.label}</span>
              <span className="stat-value">
                {statsLoading
                  ? <span className="skeleton skeleton-text-lg" style={{ width: '4ch', display: 'inline-block' }} />
                  : <AnimatedNumber value={stat.value} />}
              </span>
            </div>
          </div>
        ))}
      </div>

      {esVendedor && (
        <section style={{ marginTop: '1.75rem' }}>
          <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
            <Target size={18} className="text-accent" />
            <h3 style={{ margin: 0 }}>Mi objetivo de {mesActualLabel}</h3>
          </div>
          <div className="card" style={{ padding: '1.5rem' }}>
            {miObjetivoLoading ? (
              <span className="skeleton" style={{ display: 'block', height: '56px', width: '100%', borderRadius: '0.75rem' }} />
            ) : !miObjetivo ? (
              <div style={{ color: 'var(--text-secondary)' }}>Tu administrador todavía no te fijó un objetivo para este mes.</div>
            ) : miObjetivo.unidadesObjetivo == null && miObjetivo.montoObjetivo == null ? (
              <div style={{ color: 'var(--text-secondary)' }}>Tu administrador todavía no te fijó un objetivo para este mes.</div>
            ) : (
              <div className="flex flex-col gap-5">
                {miObjetivo.unidadesObjetivo != null && (
                  <ProgressRow
                    etiqueta="Unidades vendidas"
                    actual={String(miObjetivo.unidadesReal)}
                    objetivo={String(miObjetivo.unidadesObjetivo)}
                    pct={Math.min(100, miObjetivo.unidadesPct ?? 0)}
                  />
                )}
                {miObjetivo.montoObjetivo != null && (
                  <ProgressRow
                    etiqueta={`Facturado (${miObjetivo.moneda})`}
                    actual={money(miObjetivo.montoReal, miObjetivo.moneda)}
                    objetivo={money(miObjetivo.montoObjetivo, miObjetivo.moneda)}
                    pct={Math.min(100, miObjetivo.montoPct ?? 0)}
                  />
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {isAdmin && (
        <section style={{ marginTop: '1.75rem' }}>
          <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: '1rem' }}>
            <div className="flex items-center gap-2">
              <Target size={18} className="text-accent" />
              <h3 style={{ margin: 0 }}>Objetivo de {mesActualLabel}</h3>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={openMetaModal}>
              {meta ? 'Editar objetivo' : 'Fijar objetivo'}
            </button>
          </div>
          <div className="card" style={{ padding: '1.5rem' }}>
            {/* La visibilidad de esta sección NO depende de finanzas: aunque falle,
                el admin tiene que poder fijar/editar el objetivo. */}
            {metaLoading ? (
              <span className="skeleton" style={{ display: 'block', height: '56px', width: '100%', borderRadius: '0.75rem' }} />
            ) : !meta ? (
              <div style={{ color: 'var(--text-secondary)' }}>Todavía no fijaste un objetivo para este mes. Fijá uno para seguir el progreso de tus ventas.</div>
            ) : finanzasLoading ? (
              <span className="skeleton" style={{ display: 'block', height: '56px', width: '100%', borderRadius: '0.75rem' }} />
            ) : !finanzas ? (
              <div style={{ color: 'var(--text-secondary)' }}>No se pudieron cargar las ventas del mes para calcular el progreso.</div>
            ) : (
              <div className="flex flex-col gap-5">
                {meta.unidadesObjetivo != null && (
                  <ProgressRow etiqueta="Unidades vendidas" actual={String(unidadesVendidas)} objetivo={String(meta.unidadesObjetivo)} pct={pctMeta(unidadesVendidas, meta.unidadesObjetivo)} />
                )}
                {meta.montoObjetivo != null && (
                  <ProgressRow etiqueta={`Facturado (${meta.moneda})`} actual={money(facturadoMonedaMeta, meta.moneda)} objetivo={money(meta.montoObjetivo, meta.moneda)} pct={pctMeta(facturadoMonedaMeta, meta.montoObjetivo)} />
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {isAdmin && (alertasLoading || alertas || alertasError) && (
        <section style={{ marginTop: '1.75rem' }}>
          <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
            <Zap size={18} className="text-accent" />
            <h3 style={{ margin: 0 }}>Acciones del día</h3>
          </div>
          {alertasError ? (
            <div className="card glass" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No se pudieron cargar las alertas.{' '}
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetchAlertas()}>Reintentar</button>
            </div>
          ) : (
          <div className="stats-grid stagger">
            {alertasLoading
              ? Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="card stat-card">
                  <div className="stat-content">
                    <span className="skeleton skeleton-text" style={{ width: '55%' }} />
                    <span className="skeleton skeleton-text-lg" style={{ width: '4ch', display: 'inline-block', marginTop: '0.5rem' }} />
                  </div>
                </div>
              ))
              : alertCards.map((a) => {
                // Verde cuando no hay nada que atender; el color de alerta si hay.
                const color = a.count > 0 ? a.color : 'var(--success, #16a34a)';
                return (
                  <Link key={a.key} to={a.to} className="card stat-card" style={{ textDecoration: 'none', borderLeft: `3px solid ${color}` }}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="stat-icon-wrapper" style={{ backgroundColor: `${color}10`, color }}>
                        <a.icon size={20} />
                      </div>
                      <span className="text-3xl font-black tabular-nums" style={{ color }}>{a.count}</span>
                    </div>
                    <div className="stat-content">
                      <span className="text-muted font-bold text-xs uppercase tracking-wider mb-1">{a.label}</span>
                      <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                        {a.monto} <span className="text-muted text-xs">{a.montoLabel}</span>
                      </span>
                    </div>
                  </Link>
                );
              })}
          </div>
          )}
        </section>
      )}

      {isAdmin && (
        <section style={{ marginTop: '1.75rem' }}>
          <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: '1rem' }}>
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-accent" />
              <h3 style={{ margin: 0 }}>Finanzas de {MESES[(finanzas?.periodo.mes ?? new Date().getMonth() + 1) - 1]}</h3>
            </div>
            {!finanzasLoading && !finanzasError && (finanzas?.cotizacion
              ? <span className="text-xs text-muted">Consolidado en pesos a {money(finanzas.cotizacion.valor)}/US$ del {new Date(finanzas.cotizacion.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</span>
              : <span className="text-xs text-muted">Sin cotización cargada · <Link to="/reportes" className="text-accent">cargá una</Link> para ver el total en pesos</span>)}
          </div>
          {finanzasError ? (
            <div className="card glass" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No se pudieron cargar las finanzas del mes.{' '}
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetchFinanzas()}>Reintentar</button>
            </div>
          ) : (
            <div className="stats-grid stagger">
              {finanzasLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="card stat-card">
                    <div className="stat-content">
                      <span className="skeleton skeleton-text" style={{ width: '60%' }} />
                      <span className="skeleton skeleton-text-lg" style={{ width: '6ch', display: 'inline-block', marginTop: '0.5rem' }} />
                    </div>
                  </div>
                ))
                : financeCards.map((c) => (
                  <div key={c.label} className="card stat-card">
                    <div className="flex justify-between items-start mb-4">
                      <div className="stat-icon-wrapper" style={{ backgroundColor: `${c.color}10`, color: c.color }}>
                        <c.icon size={20} />
                      </div>
                    </div>
                    <div className="stat-content">
                      <span className="text-muted font-bold text-xs uppercase tracking-wider mb-1">{c.label}</span>
                      <span className="stat-value" style={{ color: c.color, fontSize: '1.4rem', lineHeight: 1.2, wordBreak: 'break-word' }}>{c.value}</span>
                      {c.sub && <span className="text-muted text-xs" style={{ marginTop: '0.35rem' }}>{c.sub}</span>}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {isAdmin && (tendenciaLoading || tendencia) && (
        <section style={{ marginTop: '1.75rem' }}>
          <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: '1rem' }}>
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-accent" />
              <h3 style={{ margin: 0 }}>Tendencia de ventas</h3>
            </div>
            {!tendenciaLoading && (
              <span className="text-xs text-muted">
                {tTotalUnidades} {tTotalUnidades === 1 ? 'unidad' : 'unidades'} · {tTotalFacturado} · últimos {tendencia?.meses ?? 6} meses
              </span>
            )}
          </div>
          <div className="card" style={{ padding: '1.5rem' }}>
            {tendenciaLoading ? (
              <span className="skeleton" style={{ display: 'block', height: '180px', width: '100%', borderRadius: '0.75rem' }} />
            ) : tTotalUnidades === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                Sin ventas registradas en los últimos {tendencia?.meses ?? 6} meses.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
                  {tItems.map((m) => {
                    const barPct = Math.round((m.cantidad / tMax) * 100);
                    return (
                      <div
                        key={`${m.anio}-${m.mes}`}
                        title={`${m.label}: ${m.cantidad} ${m.cantidad === 1 ? 'unidad' : 'unidades'} · ${facturadoMes(m)}`}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}
                      >
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: m.cantidad > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{m.cantidad}</span>
                        <div style={{ width: '100%', height: '140px', display: 'flex', alignItems: 'flex-end', marginTop: '0.25rem' }}>
                          <div style={{ width: '100%', maxWidth: '46px', margin: '0 auto', height: `${barPct}%`, minHeight: m.cantidad > 0 ? '6px' : '0', background: 'var(--accent)', borderRadius: '5px 5px 0 0', transition: 'height .3s var(--easing-soft, ease)' }} />
                        </div>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.4rem', whiteSpace: 'nowrap' }}>{m.label}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted" style={{ marginTop: '1rem', textAlign: 'center' }}>
                  Barras: unidades vendidas por mes. Pasá el mouse para ver el facturado.
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {/* Modal: fijar / editar el objetivo del mes (solo admin) */}
      <Modal
        isOpen={showMetaModal}
        onClose={() => setShowMetaModal(false)}
        title={`Objetivo de ${mesActualLabel}`}
        subtitle="Fijá tu meta de ventas del mes. Podés poner unidades, facturado, o ambos."
        maxWidth="440px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowMetaModal(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveMeta} loading={metaMutation.isPending}>Guardar</Button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="form-group">
            <label className="form-label">Unidades a vender</label>
            <input type="number" min="0" className="form-input" value={metaUnidades} onChange={(e) => setMetaUnidades(e.target.value)} placeholder="Ej: 12" />
          </div>
          <div className="form-group">
            <label className="form-label">Facturado objetivo</label>
            <div className="flex gap-3">
              <select className="form-input" style={{ maxWidth: '6.5rem' }} value={metaMoneda} onChange={(e) => setMetaMoneda(e.target.value as 'ARS' | 'USD')}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
              <input type="number" min="0" className="form-input" value={metaMonto} onChange={(e) => setMetaMonto(e.target.value)} placeholder="Ej: 180000000" />
            </div>
          </div>
          {metaError && (
            <div className="uploader-alert uploader-alert-error">
              <AlertTriangle size={14} />
              <span>{metaError}</span>
            </div>
          )}
        </div>
      </Modal>

      <div className="dashboard-grid" style={!isAdmin ? { gridTemplateColumns: '1fr' } : undefined}>
        <div className="card chart-card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <PieChart size={18} className="text-accent" />
              <h3>Distribución de stock</h3>
            </div>
          </div>
          {stockLoading ? (
            <div className="chart-skeleton">
              <span className="skeleton skeleton-circle" style={{ width: 180, height: 180 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: 220 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <span key={i} className="skeleton skeleton-text" style={{ width: '90%' }} />
                ))}
              </div>
            </div>
          ) : (
            <DonutChart
              data={stockData ?? []}
              centerValue={stockTotal}
              centerLabel="Unidades"
            />
          )}
        </div>

        {isAdmin && (
        <div className="card activity-card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-accent" />
              <h3>Actividad Reciente</h3>
            </div>
            <ShieldCheck size={18} className="text-muted" />
          </div>

          <div className="activity-timeline">
            {auditsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', gap: '1rem' }}>
                    <span className="skeleton skeleton-circle" style={{ width: 12, height: 12, marginTop: 6 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <span className="skeleton skeleton-text" style={{ width: '70%' }} />
                      <span className="skeleton skeleton-text" style={{ width: '50%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : audits.length === 0 ? (
              <p className="text-center p-4 text-muted">Aún no hay actividad registrada.</p>
            ) : (
              audits.map((audit) => (
                <div key={audit.id} className="timeline-item">
                  <div className="timeline-dot-wrapper">
                    <div className="timeline-dot"></div>
                  </div>
                  <div className="timeline-info">
                    <div className="timeline-header">
                      <span className="timeline-title">{audit.accion?.toUpperCase()} — {audit.entidad}</span>
                      <span className="timeline-time">
                        {new Date(audit.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="timeline-desc">{audit.detalle || `Operación sobre ${audit.entidad}`}</p>
                    <span className="timeline-user">por {audit.usuario?.nombre || 'Sistema'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
