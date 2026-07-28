import { Car, Users, RefreshCw, Clock, Zap, ShieldCheck, PieChart, TrendingUp, ArrowUpRight, ArrowDownRight, Wallet, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboardStats, useStockDistribution, useDashboardFinanzas, type FinanzaKpi } from '../../hooks/useDashboard';
import { useAuditLogs } from '../../hooks/useAuditLogs';
import type { AuditLog } from '../../api/auditoria.api';
import { useAuthStore } from '../../store/authStore';
import AnimatedNumber from '../../components/ui/AnimatedNumber';
import DonutChart from '../../components/ui/DonutChart';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const money = (n: number, moneda = 'ARS') =>
  `${moneda === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

// El KPI muestra el total consolidado en ARS si hay cotización; si no, el
// desglose por moneda ("$X · US$Y"): nunca se suma ARS con USD sin cotización.
const kpiValue = (kpi: FinanzaKpi) =>
  kpi.consolidado != null
    ? money(kpi.consolidado, 'ARS')
    : (kpi.porMoneda.length ? kpi.porMoneda.map((m) => money(m.valor, m.moneda)).join(' · ') : money(0));

const DashboardPage = () => {
  const { user } = useAuthStore();
  // El log de auditoría es admin-only (dato sensible: acciones de todos + IP).
  // El panel "Actividad Reciente" sólo se muestra —y se consulta— para admin.
  const isAdmin = !!(user?.roles?.includes('admin') || user?.roles?.includes('super_admin'));

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useDashboardStats();
  const { data: stockData, isLoading: stockLoading, refetch: refetchStock } = useStockDistribution();
  const { data: auditsData, isLoading: auditsLoading } = useAuditLogs({}, { limit: 5 }, { enabled: isAdmin });
  // Finanzas del mes: dato de dueño, solo admin (igual criterio que Actividad Reciente).
  const { data: finanzas, isLoading: finanzasLoading, isError: finanzasError, refetch: refetchFinanzas } = useDashboardFinanzas(isAdmin);

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

  const onSync = () => {
    refetchStats();
    refetchStock();
    // refetch dispara la query aunque esté enabled:false; sólo tiene sentido para
    // admin (es quien ve —y consulta— las finanzas).
    if (isAdmin) refetchFinanzas();
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

      <div className="stats-grid stagger">
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
