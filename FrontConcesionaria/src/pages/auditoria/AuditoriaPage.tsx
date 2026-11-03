import { useState, useEffect, useCallback } from 'react';
import { Download, Eye, ShieldCheck } from 'lucide-react';
import { auditoriaApi } from '../../api/auditoria.api';
import type { AuditLog, AccionAudit, AuditLogFilter } from '../../api/auditoria.api';
import { useUIStore } from '../../store/uiStore';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import PageTitle from '../../components/ui/PageTitle';
import { Listado, ListadoTabla, CampoFiltro, BusquedaListado, type ColumnaListado } from '../../components/listado';
import {
  ACCIONES_AUDITORIA,
  ENTIDAD_AUDITORIA,
  accionAuditoriaLabel,
  accionAuditoriaVariant,
  cuandoAuditoria,
  entidadAuditoriaLabel,
  fraseAuditoria,
} from './auditoriaTextos';

interface DetailModalProps {
  log: AuditLog | null;
  onClose: () => void;
}

const dlStyle: React.CSSProperties = { fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 };

// Entidades ordenadas por su nombre legible para el filtro.
const ENTIDADES_FILTRO = Object.keys(ENTIDAD_AUDITORIA)
  .map((k) => ({ value: k, label: ENTIDAD_AUDITORIA[k].nombre }))
  .sort((a, b) => a.label.localeCompare(b.label, 'es'));

const DetailModal = ({ log, onClose }: DetailModalProps) => (
  <Modal
    isOpen={log !== null}
    onClose={onClose}
    title="Detalle del registro"
    subtitle={log ? fraseAuditoria(log) : undefined}
    maxWidth="540px"
    footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
  >
    {log && (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div>
            <div style={dlStyle}>Fecha</div>
            <div className="tabular-nums">{new Date(log.createdAt).toLocaleString('es-AR')}</div>
          </div>
          <div>
            <div style={dlStyle}>Acción</div>
            <Badge variant={accionAuditoriaVariant(log.accion)}>{accionAuditoriaLabel(log.accion)}</Badge>
          </div>
          <div>
            <div style={dlStyle}>Quién</div>
            <div>{log.usuario ? `${log.usuario.nombre} (${log.usuario.email})` : 'Automático (sin usuario)'}</div>
          </div>
          <div>
            <div style={dlStyle}>Sobre qué</div>
            <div style={{ fontWeight: 500 }}>
              {entidadAuditoriaLabel(log.entidad)}{log.entidadId != null ? ` #${log.entidadId}` : ''}
            </div>
          </div>
          <div>
            <div style={dlStyle} title="Dirección de internet desde la que se hizo">IP</div>
            <div className="tabular-nums">{log.ip ?? 'Sin dato'}</div>
          </div>
          <div>
            <div style={dlStyle}>N.º de registro</div>
            <div className="tabular-nums">#{log.id}</div>
          </div>
        </div>
        {log.userAgent && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={dlStyle}>Navegador y dispositivo</div>
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
  const [loadError, setLoadError] = useState(false);
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
    if (filterEntidad) f.entidad = filterEntidad;
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
      setLoadError(false);
    } catch {
      // Un error no es "no hubo actividad": la tabla lo muestra con Reintentar.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [buildFilter]);

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
      addToast('Descarga iniciada', 'success');
    } catch {
      addToast('No se pudo exportar. Probá de nuevo.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Búsqueda libre: filtra en cliente las filas ya cargadas de esta página.
  const q = search.trim().toLowerCase();
  const filteredLogs = q
    ? logs.filter(l =>
        fraseAuditoria(l).toLowerCase().includes(q) ||
        entidadAuditoriaLabel(l.entidad).toLowerCase().includes(q) ||
        (l.usuario?.nombre?.toLowerCase().includes(q) ?? false) ||
        (l.usuario?.email?.toLowerCase().includes(q) ?? false) ||
        (l.detalle?.toLowerCase().includes(q) ?? false),
      )
    : logs;

  const filtrosActivos = [filterAccion, filterEntidad, filterStartDate, filterEndDate].filter(Boolean).length;
  const limpiarFiltros = () => {
    setSearch('');
    setFilterAccion('');
    setFilterEntidad('');
    setFilterStartDate('');
    setFilterEndDate('');
    setPage(1);
  };

  const columnas: ColumnaListado<AuditLog>[] = [
    {
      clave: 'fecha',
      titulo: 'Cuándo',
      celda: (log) => <span className="listado-nowrap" title={new Date(log.createdAt).toLocaleString('es-AR')}>{cuandoAuditoria(log.createdAt)}</span>,
    },
    {
      clave: 'que',
      titulo: 'Qué pasó',
      flexible: true,
      tarjeta: 'titulo',
      celda: (log) => (
        <>
          <span className="listado-principal">
            {fraseAuditoria(log)}{log.entidadId != null && !['login', 'logout', 'login_fail'].includes(log.accion) ? ` #${log.entidadId}` : ''}
          </span>
          {log.detalle && <span className="listado-secundario" title={log.detalle}>{log.detalle}</span>}
        </>
      ),
    },
    {
      clave: 'usuario',
      titulo: 'Quién',
      celda: (log) => (
        log.usuario ? (
          <>
            <span className="listado-principal" style={{ fontWeight: 500, maxWidth: '20ch' }}>{log.usuario.nombre}</span>
            <span className="listado-secundario" style={{ maxWidth: '24ch' }}>{log.usuario.email}</span>
          </>
        ) : <span className="text-muted">Automático</span>
      ),
    },
    {
      clave: 'accion',
      titulo: 'Acción',
      celda: (log) => <Badge variant={accionAuditoriaVariant(log.accion)}>{accionAuditoriaLabel(log.accion)}</Badge>,
    },
    {
      clave: 'ip',
      titulo: 'IP',
      tarjeta: 'oculta',
      celda: (log) => <span className="text-muted listado-nowrap">{log.ip ?? 'Sin dato'}</span>,
    },
    {
      clave: 'acciones',
      titulo: 'Detalle',
      alinear: 'right',
      ancho: '1%',
      tarjeta: 'acciones',
      celda: (log) => (
        <div className="listado-acciones-fila">
          <button type="button" className="icon-btn" title="Ver detalle" aria-label={`Ver el detalle: ${fraseAuditoria(log)}`} onClick={() => setSelectedLog(log)}>
            <Eye size={14} aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page-container animate-fade-in">
      <PageTitle title="Auditoría" />
      <Listado
        titulo="Auditoría"
        subtitulo="Quién hizo qué y cuándo en el sistema"
        icono={<ShieldCheck size={22} />}
        clave="auditoria"
        acciones={(
          <Button variant="secondary" onClick={handleExport} loading={exporting} title="Descargar los registros del filtro actual en CSV (Excel)">
            <Download size={16} aria-hidden="true" />
            Exportar CSV
          </Button>
        )}
        busqueda={<BusquedaListado valor={search} onChange={setSearch} placeholder="Buscar en esta página: usuario, detalle…" etiqueta="Buscar en los registros de esta página" />}
        filtrosActivos={filtrosActivos}
        onLimpiarFiltros={limpiarFiltros}
        resumen={!loading && !loadError ? `${totalResults.toLocaleString('es-AR')} ${totalResults === 1 ? 'registro' : 'registros'}` : undefined}
        filtros={(
          <>
            <CampoFiltro etiqueta="Acción">
              <select className="form-input" value={filterAccion} onChange={e => { setFilterAccion(e.target.value); setPage(1); }}>
                <option value="">Todas</option>
                {ACCIONES_AUDITORIA.map(a => <option key={a} value={a}>{accionAuditoriaLabel(a)}</option>)}
              </select>
            </CampoFiltro>
            <CampoFiltro etiqueta="Sobre qué">
              <select className="form-input" value={filterEntidad} onChange={e => { setFilterEntidad(e.target.value); setPage(1); }}>
                <option value="">Todo</option>
                {ENTIDADES_FILTRO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </CampoFiltro>
            <CampoFiltro etiqueta="Desde">
              <input className="form-input" type="date" value={filterStartDate} onChange={e => { setFilterStartDate(e.target.value); setPage(1); }} />
            </CampoFiltro>
            <CampoFiltro etiqueta="Hasta">
              <input className="form-input" type="date" value={filterEndDate} onChange={e => { setFilterEndDate(e.target.value); setPage(1); }} />
            </CampoFiltro>
          </>
        )}
      >
        <ListadoTabla
          etiqueta="Registros de auditoría"
          columnas={columnas}
          filas={filteredLogs}
          cargando={loading && logs.length === 0}
          error={loadError}
          mensajeError="No se pudo cargar la auditoría"
          onReintentar={fetchLogs}
          hayFiltros={filtrosActivos > 0 || !!q}
          onLimpiarFiltros={limpiarFiltros}
          vacio={{
            titulo: 'Todavía no hay actividad registrada',
            descripcion: 'Cada alta, edición, baja e ingreso al sistema queda anotado acá.',
            icono: <ShieldCheck size={32} aria-hidden="true" />,
          }}
          onFilaClick={setSelectedLog}
          etiquetaFila={(log) => `Ver el detalle: ${fraseAuditoria(log)}`}
          pagina={page}
          totalPaginas={totalPages}
          onPaginaChange={setPage}
        />
      </Listado>

      <DetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
