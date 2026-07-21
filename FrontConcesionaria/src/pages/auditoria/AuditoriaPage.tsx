import { useState, useEffect, useCallback } from 'react';
import { Search, Download, Eye, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { auditoriaApi } from '../../api/auditoria.api';
import type { AuditLog, AccionAudit, AuditLogFilter } from '../../api/auditoria.api';
import { useUIStore } from '../../store/uiStore';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';

const ACCIONES: AccionAudit[] = ['create', 'update', 'cancel', 'delete_soft', 'login', 'logout', 'refinanciar'];

// Clases reales del design system (index.css): `.badge` + color. Antes usaba
// `status-badge status-*`, que no existen, y los badges salían sin estilo.
const accionBadge: Record<AccionAudit, string> = {
  create: 'badge badge-emerald',
  update: 'badge badge-cyan',
  cancel: 'badge badge-warning',
  delete_soft: 'badge badge-danger',
  login: 'badge badge-navy',
  logout: 'badge badge-navy',
  refinanciar: 'badge badge-violet',
};

const accionLabel: Record<AccionAudit, string> = {
  create: 'Crear',
  update: 'Actualizar',
  cancel: 'Cancelar',
  delete_soft: 'Eliminar',
  login: 'Login',
  logout: 'Logout',
  refinanciar: 'Refinanciar',
};

// El backend puede sumar acciones nuevas antes que el front. Sin fallback, una
// acción no mapeada rendereaba un badge vacío sin texto.
const badgeClass = (a: string): string => accionBadge[a as AccionAudit] ?? 'badge badge-navy';
const labelFor = (a: string): string => accionLabel[a as AccionAudit] ?? a;

interface DetailModalProps {
  log: AuditLog | null;
  onClose: () => void;
}

const dlStyle: React.CSSProperties = { fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 };

const DetailModal = ({ log, onClose }: DetailModalProps) => (
  <Modal
    isOpen={log !== null}
    onClose={onClose}
    title="Detalle de Registro"
    maxWidth="540px"
    footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
  >
    {log && (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div>
            <div style={dlStyle}>ID</div>
            <div style={{ fontWeight: 600 }}>#{log.id}</div>
          </div>
          <div>
            <div style={dlStyle}>Fecha</div>
            <div>{new Date(log.createdAt).toLocaleString('es-AR')}</div>
          </div>
          <div>
            <div style={dlStyle}>Usuario</div>
            <div>{log.usuario ? `${log.usuario.nombre} (${log.usuario.email})` : '—'}</div>
          </div>
          <div>
            <div style={dlStyle}>Acción</div>
            <span className={badgeClass(log.accion)}>{labelFor(log.accion)}</span>
          </div>
          <div>
            <div style={dlStyle}>Entidad</div>
            <div style={{ fontWeight: 500 }}>{log.entidad}</div>
          </div>
          <div>
            <div style={dlStyle}>ID Entidad</div>
            <div>{log.entidadId ?? '—'}</div>
          </div>
          <div>
            <div style={dlStyle}>IP</div>
            <div>{log.ip ?? '—'}</div>
          </div>
          <div>
            <div style={dlStyle}>Usuario ID</div>
            <div>{log.usuarioId ?? '—'}</div>
          </div>
        </div>
        {log.userAgent && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={dlStyle}>User Agent</div>
            <div style={{ fontSize: '0.8rem', wordBreak: 'break-all', color: 'var(--text-secondary)' }}>{log.userAgent}</div>
          </div>
        )}
        {log.detalle && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={dlStyle}>Detalle</div>
            <pre style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 200,
              overflow: 'auto',
            }}>
              {log.detalle}
            </pre>
          </div>
        )}
      </>
    )}
  </Modal>
);

export default function AuditoriaPage() {
  const { addToast } = useUIStore();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filtros de servidor (accion/entidad/fechas) + búsqueda libre en cliente.
  const [search, setSearch] = useState('');
  const [filterAccion, setFilterAccion] = useState('');
  const [filterEntidad, setFilterEntidad] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const buildFilter = useCallback((): AuditLogFilter => {
    const f: AuditLogFilter = { page, limit: 50 };
    if (filterAccion) f.accion = filterAccion as AccionAudit;
    if (filterEntidad.trim()) f.entidad = filterEntidad.trim();
    if (filterStartDate) f.startDate = filterStartDate;
    if (filterEndDate) f.endDate = filterEndDate;
    return f;
  }, [page, filterAccion, filterEntidad, filterStartDate, filterEndDate]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditoriaApi.getAll(buildFilter()) as { results?: AuditLog[]; totalPages?: number; totalResults?: number };
      const results: AuditLog[] = res?.results ?? [];
      setLogs(results);
      setTotalPages(res?.totalPages ?? 1);
      setTotalResults(res?.totalResults ?? results.length);
    } catch {
      addToast('Error al cargar el log de auditoría', 'error');
    } finally {
      setLoading(false);
    }
  }, [buildFilter, addToast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await auditoriaApi.exportCsv(buildFilter()) as Blob;
      const url = window.URL.createObjectURL(new Blob([res]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `auditoria_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Exportación iniciada', 'success');
    } catch {
      addToast('Error al exportar', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Búsqueda libre: filtra en cliente las filas ya cargadas de esta página.
  const q = search.trim().toLowerCase();
  const filteredLogs = q
    ? logs.filter(l =>
        l.entidad.toLowerCase().includes(q) ||
        (l.usuario?.nombre?.toLowerCase().includes(q) ?? false) ||
        (l.usuario?.email?.toLowerCase().includes(q) ?? false) ||
        (l.detalle?.toLowerCase().includes(q) ?? false),
      )
    : logs;

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="header-title">
          <h1>Auditoría</h1>
          <p>Registro de todas las operaciones del sistema · {totalResults} {totalResults === 1 ? 'registro' : 'registros'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            <Download size={16} />
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="filters-bar">
        <div>
          <label className="form-label-xs">Buscar en esta página</label>
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Entidad, usuario, detalle..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="form-label-xs">Acción</label>
          <select className="form-input-select" value={filterAccion} onChange={e => { setFilterAccion(e.target.value); setPage(1); }}>
            <option value="">Todas</option>
            {ACCIONES.map(a => <option key={a} value={a}>{accionLabel[a]}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label-xs">Entidad</label>
          <input className="form-input" type="text" placeholder="ej: Vehiculo" value={filterEntidad} onChange={e => { setFilterEntidad(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="form-label-xs">Desde</label>
          <input className="form-input" type="date" value={filterStartDate} onChange={e => { setFilterStartDate(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="form-label-xs">Hasta</label>
          <input className="form-input" type="date" value={filterEndDate} onChange={e => { setFilterEndDate(e.target.value); setPage(1); }} />
        </div>
      </div>

      {/* Tabla */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Entidad</th>
              <th>ID</th>
              <th>Acción</th>
              <th>Detalle</th>
              <th>IP</th>
              <th style={{ textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1, 2, 3, 4, 5].map(i => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <td key={idx} style={{ padding: '1.1rem 1rem' }}>
                      <span className="skeleton skeleton-text" style={{ width: '70%' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filteredLogs.length === 0 ? (
              <tr><td colSpan={8}>
                <div className="dt-empty">
                  <div className="dt-empty-badge"><ShieldCheck size={36} /></div>
                  <p className="dt-empty-text">No hay registros de auditoría para estos filtros.</p>
                </div>
              </td></tr>
            ) : filteredLogs.map(log => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{new Date(log.createdAt).toLocaleString('es-AR')}</td>
                <td style={{ fontSize: '0.85rem' }}>
                  {log.usuario ? (
                    <div>
                      <div style={{ fontWeight: 500 }}>{log.usuario.nombre}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{log.usuario.email}</div>
                    </div>
                  ) : '—'}
                </td>
                <td style={{ fontWeight: 500 }}>{log.entidad}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{log.entidadId ?? '—'}</td>
                <td><span className={badgeClass(log.accion)}>{labelFor(log.accion)}</span></td>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-secondary)' }} title={log.detalle ?? ''}>
                  {log.detalle ?? '—'}
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{log.ip ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="icon-btn" title="Ver detalle" onClick={() => setSelectedLog(log)}>
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Página {page} de {totalPages}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <DetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
