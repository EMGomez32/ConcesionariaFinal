import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Car, Users, RefreshCw, Clock, Zap, ShieldCheck, PieChart, TrendingUp, ArrowUpRight, ArrowDownRight, Wallet, AlertTriangle, Bookmark, Target, Wrench, CalendarClock, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useDashboardStats, useStockDistribution, useDashboardFinanzas, useDashboardAlertas, useDashboardTendencia, useDashboardMeta, useMiObjetivo, dashboardKeys, type FinanzaKpi, type AlertaItem, type AlertaKey } from '../../hooks/useDashboard';
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

// "Actualizado hace X": tiempo relativo desde la última sincronización.
const haceCuanto = (desde: Date, ahora: Date): string => {
  const s = Math.max(0, Math.round((ahora.getTime() - desde.getTime()) / 1000));
  if (s < 45) return 'recién';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
};

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
  const color = pct >= 100 ? 'var(--success)' : pct >= 60 ? 'var(--accent)' : 'var(--warning, #f59e0b)';
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-1" style={{ marginBottom: '0.4rem' }}>
        <span className="text-muted font-bold text-xs uppercase tracking-wider">{etiqueta}</span>
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          {actual} <span className="text-muted">de {objetivo}</span> · <span style={{ color }}>{pct}%</span>
        </span>
      </div>
      <div style={{ height: '10px', width: '100%', background: 'color-mix(in srgb, var(--text-primary) 10%, transparent)', borderRadius: '999px', overflow: 'hidden' }}>
        {/* Sin transition de width: animar layout provoca thrash y el valor cambia
            sólo al refetchear (no hay momento de motion que justifique el costo). */}
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '999px' }} />
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
  const esCobrador = !!user?.roles?.includes('cobrador');
  const esPostventa = !!user?.roles?.includes('postventa');

  const { data: statsData, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useDashboardStats();
  const { data: stockData, isLoading: stockLoading, isError: stockError, refetch: refetchStock } = useStockDistribution();
  const { data: auditsData, isLoading: auditsLoading, refetch: refetchAudits } = useAuditLogs({}, { limit: 5 }, { enabled: isAdmin });
  // Finanzas del mes: dato de dueño, solo admin (igual criterio que Actividad Reciente).
  const { data: finanzas, isLoading: finanzasLoading, isError: finanzasError, refetch: refetchFinanzas } = useDashboardFinanzas(isAdmin);
  // Acciones del día: cada rol ve LAS SEÑALES DE SU TRABAJO, no un gate binario
  // admin/no-admin: admin todo; cobrador su cola de cobranza; vendedor su agenda
  // comercial; postventa su taller y la documentación. Espejo del authorize de
  // cada reporte en el backend (los roles acá deben poder consultar su endpoint).
  const alertKeys: AlertaKey[] = isAdmin
    ? ['estancados', 'porVencer', 'mora', 'reservas', 'turnos', 'seguimientos', 'documentacion']
    : Array.from(new Set<AlertaKey>([
        ...(esCobrador ? (['porVencer', 'mora'] as AlertaKey[]) : []),
        ...(esVendedor ? (['reservas', 'seguimientos'] as AlertaKey[]) : []),
        ...(esPostventa ? (['turnos', 'documentacion'] as AlertaKey[]) : []),
      ]));
  const { data: alertas, isLoading: alertasLoading, isError: alertasError, refetch: refetchAlertas } = useDashboardAlertas(alertKeys);
  // Tendencia de ventas (últimos 6 meses), solo admin.
  const { data: tendencia, isLoading: tendenciaLoading, isError: tendenciaError, refetch: refetchTendencia } = useDashboardTendencia(isAdmin);

  // ── Objetivo del mes (meta de ventas), solo admin ──
  const { data: meta, isLoading: metaLoading, refetch: refetchMeta } = useDashboardMeta(isAdmin);
  // ── Mi objetivo del mes (self-view del vendedor) ──
  const { data: miObjetivoData, isLoading: miObjetivoLoading, refetch: refetchMiObjetivo } = useMiObjetivo(esVendedor);
  const miObjetivo = miObjetivoData?.objetivo ?? null;
  const queryClient = useQueryClient();
  const { addToast } = useUIStore();

  // Sincronización manual: refetchea TODO lo visible por rol y marca cuándo se
  // actualizó. Antes "Sincronizar" refrescaba sólo stats/stock y el resto (tendencia,
  // objetivo, actividad) quedaba viejo sin ninguna señal.
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date>(() => new Date());
  const [ahora, setAhora] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

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
    { label: 'Ingresos del mes', value: kpiValue(finanzas.ingresosMes), sub: 'cobros de ventas y cuotas', icon: ArrowUpRight, color: 'var(--success)' },
    { label: 'Egresos del mes', value: kpiValue(finanzas.egresosMes), sub: 'gastos de unidades y fijos', icon: ArrowDownRight, color: 'var(--danger)' },
    { label: 'Resultado neto', value: kpiValue(finanzas.netoMes), sub: 'ingresos − egresos', icon: Wallet, color: (finanzas.netoMes.consolidado != null ? finanzas.netoMes.consolidado < 0 : finanzas.netoMes.porMoneda.some((m) => m.valor < 0)) ? 'var(--danger)' : 'var(--success)' },
    { label: 'En mora', value: kpiValue(finanzas.mora), sub: `${finanzas.mora.cuotas} ${finanzas.mora.cuotas === 1 ? 'cuota vencida' : 'cuotas vencidas'}`, icon: AlertTriangle, color: 'var(--danger)' },
  ] : [];

  // Tarjetas de "Acciones del día": sólo las señales que este rol pidió (las no
  // pedidas vienen null del hook). Se arman YA en orden de urgencia —danger
  // (vencido) → warning (vence pronto / se estanca) → info (agenda)— y el color
  // marca ese ROL DE ESTADO, no la identidad de la tarjeta: la identidad la dan
  // ícono + etiqueta. Las señales en 0 no rinden tarjeta: colapsan a un chip en
  // la línea "Al día" (menos ruido, jerarquía por urgencia; fix P2 de la crítica).
  type AlertCard = { key: AlertaKey; label: string; corto: string; count: number; monto: string; montoLabel: string; icon: LucideIcon; color: string; to: string };
  const alertCards: AlertCard[] = [];
  if (alertas?.mora) alertCards.push({ key: 'mora', label: 'Cuotas en mora', corto: 'Mora', count: alertas.mora.count, monto: alertaMonto(alertas.mora), montoLabel: 'saldo adeudado', icon: AlertTriangle, color: 'var(--danger)', to: '/reportes?tab=mora' });
  if (alertas?.porVencer) alertCards.push({ key: 'porVencer', label: `Cuotas vencen en ${alertas.porVencer.dias} días`, corto: 'Cuotas por vencer', count: alertas.porVencer.count, monto: alertaMonto(alertas.porVencer), montoLabel: 'a cobrar', icon: Clock, color: 'var(--warning)', to: '/reportes?tab=proximos' });
  if (alertas?.reservas) alertCards.push({ key: 'reservas', label: `Reservas vencen en ${alertas.reservas.dias} días`, corto: 'Reservas', count: alertas.reservas.count, monto: alertaMonto(alertas.reservas), montoLabel: 'en señas', icon: Bookmark, color: 'var(--warning)', to: '/reservas' });
  if (alertas?.documentacion) alertCards.push({ key: 'documentacion', label: `Documentación (${alertas.documentacion.dias} días)`, corto: 'Documentación', count: alertas.documentacion.count, monto: String(alertas.documentacion.vencidos), montoLabel: alertas.documentacion.vencidos === 1 ? 'vencida' : 'vencidas', icon: ShieldCheck, color: 'var(--warning)', to: '/reportes?tab=documentacion' });
  if (alertas?.estancados) alertCards.push({ key: 'estancados', label: `Estancadas (+${alertas.estancados.umbral} días)`, corto: 'Estancadas', count: alertas.estancados.count, monto: alertaMonto(alertas.estancados), montoLabel: 'capital inmovilizado', icon: Car, color: 'var(--warning)', to: '/vehiculos' });
  if (alertas?.turnos) alertCards.push({ key: 'turnos', label: `Turnos de taller (${alertas.turnos.dias} días)`, corto: 'Turnos', count: alertas.turnos.count, monto: String(alertas.turnos.hoy), montoLabel: alertas.turnos.hoy === 1 ? 'turno hoy' : 'turnos hoy', icon: Wrench, color: 'var(--info)', to: '/postventa?tab=agenda' });
  if (alertas?.seguimientos) alertCards.push({ key: 'seguimientos', label: `Seguimientos CRM (${alertas.seguimientos.dias} días)`, corto: 'Seguimientos', count: alertas.seguimientos.count, monto: String(alertas.seguimientos.vencidos), montoLabel: alertas.seguimientos.vencidos === 1 ? 'vencido' : 'vencidos', icon: CalendarClock, color: 'var(--info)', to: '/seguimientos' });
  const alertasActivas = alertCards.filter((a) => a.count > 0);
  const alertasAlDia = alertCards.filter((a) => a.count === 0);

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

  const onSync = async () => {
    setIsSyncing(true);
    // refetch dispara la query aunque esté enabled:false; por eso sólo se agregan
    // las que este rol realmente ve (no le pegamos a endpoints admin como no-admin).
    const jobs: Promise<unknown>[] = [refetchStats(), refetchStock()];
    if (isAdmin) jobs.push(refetchFinanzas(), refetchTendencia(), refetchMeta(), refetchAudits());
    if (alertKeys.length > 0) jobs.push(refetchAlertas());
    if (esVendedor) jobs.push(refetchMiObjetivo());
    try {
      // refetch() en v5 nunca rechaza: resuelve con { status: 'error' } si falló.
      // El sello de frescura sólo se actualiza si TODO lo pedido terminó bien; si
      // algo falló quedan las cards de error y el "Actualizado hace X" viejo
      // (decir "recién" con el backend caído sería mentir).
      const results = await Promise.all(jobs);
      const anyError = results.some((r) => (r as { status?: string } | null | undefined)?.status === 'error');
      if (!anyError) setLastSyncAt(new Date());
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="header-title">
          <h1>Resumen Operativo</h1>
          <p>Un vistazo al estado de tu concesionaria.</p>
        </div>
        <div className="header-actions">
          {/* Sin aria-live: el reloj relativo muta solo (~cada minuto) y una live
              region lo anunciaría por lector de pantalla indefinidamente. */}
          <span className="text-xs text-muted">Actualizado {haceCuanto(lastSyncAt, ahora)}</span>
          <button
            className="btn btn-secondary"
            onClick={onSync}
            disabled={isSyncing}
            aria-busy={isSyncing}
          >
            <RefreshCw size={16} className={isSyncing || statsLoading || stockLoading ? 'animate-spin' : ''} />
            {isSyncing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        </div>
      </header>

      {statsError && !statsData ? (
        <div className="card glass" data-tour="dashboard-kpis" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No se pudieron cargar los indicadores.{' '}
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetchStats()}>Reintentar</button>
        </div>
      ) : (
      <div className="stats-grid stagger" data-tour="dashboard-kpis" aria-busy={statsLoading}>
        {stats.map((stat) => (
          <div key={stat.label} className="card stat-card">
            <div className="flex justify-between items-start mb-4">
              {/* color-mix (no `${color}10`): el truco del alfa-hex sólo era CSS
                  válido con un hex literal; con tokens var() la declaración caía
                  y el chip quedaba transparente. */}
              <div className="stat-icon-wrapper" style={{ backgroundColor: `color-mix(in srgb, ${stat.color} 10%, transparent)`, color: stat.color }}>
                <stat.icon size={20} />
              </div>
            </div>
            <div className="stat-content">
              <span className="text-muted font-bold text-xs uppercase tracking-wider mb-1">{stat.label}</span>
              <span className="stat-value">
                {statsLoading
                  ? <span className="skeleton skeleton-text-lg" style={{ width: '4ch', display: 'inline-block' }} role="status" aria-label={`Cargando ${stat.label}`} />
                  : <AnimatedNumber value={stat.value} />}
              </span>
            </div>
          </div>
        ))}
      </div>
      )}

      {esVendedor && (
        <section style={{ marginTop: '1.75rem' }}>
          <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
            <Target size={18} className="text-accent" />
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '-0.01em' }}>Mi objetivo de {mesActualLabel}</h2>
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
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '-0.01em' }}>Objetivo de {mesActualLabel}</h2>
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

      {alertKeys.length > 0 && (alertasLoading || alertas || alertasError) && (
        <section style={{ marginTop: '1.75rem' }}>
          <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
            <Zap size={18} className="text-accent" />
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '-0.01em' }}>Acciones del día</h2>
          </div>
          {alertasError ? (
            <div className="card glass" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No se pudieron cargar las alertas.{' '}
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetchAlertas()}>Reintentar</button>
            </div>
          ) : alertasLoading ? (
            <div className="stats-grid stagger">
              {Array.from({ length: alertKeys.length }).map((_, i) => (
                <div key={i} className="card stat-card">
                  <div className="stat-content">
                    <span className="skeleton skeleton-text" style={{ width: '55%' }} />
                    <span className="skeleton skeleton-text-lg" style={{ width: '4ch', display: 'inline-block', marginTop: '0.5rem' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {alertasActivas.length === 0 ? (
                <div className="card" style={{ padding: '1.5rem', color: 'var(--text-secondary)' }}>
                  Todo al día. No hay acciones pendientes hoy.
                </div>
              ) : (
                <div className="stats-grid stagger">
                  {alertasActivas.map((a, idx) => (
                    <Link
                      key={a.key}
                      to={a.to}
                      className="card stat-card"
                      style={{
                        textDecoration: 'none',
                        // Sólo la tarjeta MÁS urgente (la primera del orden
                        // danger→warning→info) lleva énfasis de superficie: un tinte
                        // y borde de su color de estado. El resto queda plano; la
                        // identidad la cargan el chip del ícono y la etiqueta.
                        ...(idx === 0
                          ? {
                              background: `color-mix(in srgb, ${a.color} 4%, var(--bg-card))`,
                              borderColor: `color-mix(in srgb, ${a.color} 30%, var(--border))`,
                            }
                          : {}),
                      }}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="stat-icon-wrapper" style={{ backgroundColor: `color-mix(in srgb, ${a.color} 10%, transparent)`, color: a.color }}>
                          <a.icon size={20} />
                        </div>
                        <span className="text-3xl font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{a.count}</span>
                      </div>
                      <div className="stat-content">
                        <span className="text-muted font-bold text-xs uppercase tracking-wider mb-1">{a.label}</span>
                        <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                          {a.monto} <span className="text-muted text-xs">{a.montoLabel}</span>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {alertasAlDia.length > 0 && (
                <div className="flex items-center flex-wrap gap-2" style={{ marginTop: '1rem' }}>
                  <span className="text-xs text-muted font-bold uppercase tracking-wider" style={{ whiteSpace: 'nowrap' }}>Al día:</span>
                  {alertasAlDia.map((a) => (
                    <Link
                      key={a.key}
                      to={a.to}
                      className="text-xs"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.35rem 0.7rem',
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-secondary)',
                        textDecoration: 'none',
                        // nowrap: el chip envuelve como unidad a la línea siguiente,
                        // nunca quiebra su propio texto en varios renglones.
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Check size={12} style={{ color: 'var(--success)' }} aria-hidden="true" />
                      {a.corto}
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {isAdmin && (
        <section style={{ marginTop: '1.75rem' }}>
          <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: '1rem' }}>
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-accent" />
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '-0.01em' }}>Finanzas de {MESES[(finanzas?.periodo.mes ?? new Date().getMonth() + 1) - 1]}</h2>
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
                      <div className="stat-icon-wrapper" style={{ backgroundColor: `color-mix(in srgb, ${c.color} 10%, transparent)`, color: c.color }}>
                        <c.icon size={20} />
                      </div>
                    </div>
                    <div className="stat-content">
                      <span className="text-muted font-bold text-xs uppercase tracking-wider mb-1">{c.label}</span>
                      <span className="stat-value" style={{ color: c.color, fontSize: 'var(--text-xl)', lineHeight: 1.2, wordBreak: 'break-word' }}>{c.value}</span>
                      {c.sub && <span className="text-muted text-xs" style={{ marginTop: '0.35rem' }}>{c.sub}</span>}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {isAdmin && (tendenciaLoading || tendencia || tendenciaError) && (
        <section style={{ marginTop: '1.75rem' }}>
          <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: '1rem' }}>
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-accent" />
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '-0.01em' }}>Tendencia de ventas</h2>
            </div>
            {!tendenciaLoading && !tendenciaError && (
              <span className="text-xs text-muted">
                {tTotalUnidades} {tTotalUnidades === 1 ? 'unidad' : 'unidades'} · {tTotalFacturado} · últimos {tendencia?.meses ?? 6} meses
              </span>
            )}
          </div>
          <div className="card" style={{ padding: '1.5rem' }}>
            {tendenciaLoading ? (
              <span className="skeleton" style={{ display: 'block', height: '180px', width: '100%', borderRadius: '0.75rem' }} />
            ) : tendenciaError ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)' }}>
                No se pudo cargar la tendencia de ventas.{' '}
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetchTendencia()}>Reintentar</button>
              </div>
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
                        role="img"
                        aria-label={`${m.label}: ${m.cantidad} ${m.cantidad === 1 ? 'unidad' : 'unidades'} · ${facturadoMes(m)}`}
                        title={`${m.label}: ${m.cantidad} ${m.cantidad === 1 ? 'unidad' : 'unidades'} · ${facturadoMes(m)}`}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}
                      >
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: m.cantidad > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{m.cantidad}</span>
                        {/* Sin transition de height (layout thrash); radios y cuerpos en
                            tokens de la rampa (0.625rem es el micro-label documentado). */}
                        <div style={{ width: '100%', height: '140px', display: 'flex', alignItems: 'flex-end', marginTop: '0.25rem' }}>
                          <div style={{ width: '100%', maxWidth: '46px', margin: '0 auto', height: `${barPct}%`, minHeight: m.cantidad > 0 ? '6px' : '0', background: 'var(--accent)', borderRadius: 'var(--radius-xs) var(--radius-xs) 0 0' }} />
                        </div>
                        <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: '0.4rem', whiteSpace: 'nowrap' }}>{m.label}</span>
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
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '-0.01em' }}>Distribución de stock</h2>
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
          ) : stockError && !stockData ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
              No se pudo cargar la distribución de stock.{' '}
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetchStock()}>Reintentar</button>
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
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '-0.01em' }}>Actividad Reciente</h2>
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
