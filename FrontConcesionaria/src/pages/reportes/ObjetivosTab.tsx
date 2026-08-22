import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { objetivosApi, type ObjetivoVendedorItem } from '../../api/objetivos.api';
import { useUsuarios } from '../../hooks/useUsuarios';
import { useUIStore } from '../../store/uiStore';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { StatCard } from './StatCard';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const money = (n: number, moneda = 'ARS') =>
    `${moneda === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

const hoy = new Date();

/** Objetivo válido a partir de un input: > 0, o null (vacío/0/inválido = "sin objetivo"). */
const posOrNull = (s: string): number | null => {
    const n = Number(s);
    return s.trim() && !isNaN(n) && n > 0 ? n : null;
};

/**
 * Celda de progreso: barra etiquetada "real / objetivo · pct%". Verde al cumplir,
 * ámbar lejos. "—" cuando ese objetivo no se fijó. Mismo lenguaje visual que el
 * ProgressRow del Dashboard.
 */
const ProgressCell = ({
    real,
    objetivo,
    pct,
    fmt,
}: {
    real: number;
    objetivo: number | null;
    pct: number | null;
    fmt: (n: number) => string;
}) => {
    if (objetivo == null) return <span className="text-muted">—</span>;
    const p = pct ?? 0;
    const shown = Math.min(100, Math.max(0, p));
    const color = p >= 100 ? 'var(--success, #16a34a)' : p >= 60 ? 'var(--accent)' : 'var(--warning, #f59e0b)';
    return (
        <div style={{ minWidth: '160px' }}>
            <div className="flex items-center justify-between gap-2" style={{ marginBottom: '0.3rem' }}>
                <span className="text-xs font-bold">
                    {fmt(real)} <span className="text-muted">/ {fmt(objetivo)}</span>
                </span>
                <span className="text-xs font-bold" style={{ color }}>{p}%</span>
            </div>
            <div style={{ height: '8px', width: '100%', background: 'color-mix(in srgb, var(--text-primary) 10%, transparent)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${shown}%`, background: color, borderRadius: '999px', transition: 'width .3s' }} />
            </div>
        </div>
    );
};

const ObjetivosTab = () => {
    const { addToast } = useUIStore();
    const queryClient = useQueryClient();

    // Estado propio del período (independiente de los filtros de los otros tabs).
    const [anio, setAnio] = useState(hoy.getFullYear());
    const [mes, setMes] = useState(hoy.getMonth() + 1);

    const objetivosQ = useQuery({
        queryKey: ['objetivos', anio, mes],
        queryFn: () => objetivosApi.getAll(anio, mes),
    });

    // Candidatos para fijar un objetivo nuevo: usuarios activos que todavía no
    // tienen objetivo este mes (a los que ya tienen se los edita desde su fila).
    const { data: usuariosData } = useUsuarios({}, { limit: 1000 });
    const asignados = useMemo(
        () => new Set((objetivosQ.data?.items ?? []).map((i) => i.vendedorId)),
        [objetivosQ.data],
    );
    const candidatos = useMemo(
        () => (usuariosData?.results ?? []).filter((u) => u.activo && !asignados.has(u.id)),
        [usuariosData, asignados],
    );

    // ── Modal fijar / editar ────────────────────────────────────────────────
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<ObjetivoVendedorItem | null>(null);
    const [formVendedorId, setFormVendedorId] = useState('');
    const [formUnidades, setFormUnidades] = useState('');
    const [formMonto, setFormMonto] = useState('');
    const [formMoneda, setFormMoneda] = useState<'ARS' | 'USD'>('ARS');
    const [formError, setFormError] = useState('');

    const upsertMutation = useMutation({
        mutationFn: objetivosApi.upsert,
        onSuccess: () => {
            addToast('Objetivo guardado', 'success');
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['objetivos', anio, mes] });
        },
        onError: (e: unknown) => setFormError((e as { message?: string })?.message ?? 'No se pudo guardar el objetivo'),
    });

    const openCreate = () => {
        setEditing(null);
        setFormVendedorId('');
        setFormUnidades('');
        setFormMonto('');
        setFormMoneda('ARS');
        setFormError('');
        setShowModal(true);
    };

    const openEdit = (item: ObjetivoVendedorItem) => {
        setEditing(item);
        setFormVendedorId(String(item.vendedorId));
        setFormUnidades(item.unidadesObjetivo != null ? String(item.unidadesObjetivo) : '');
        setFormMonto(item.montoObjetivo != null ? String(item.montoObjetivo) : '');
        setFormMoneda((item.moneda as 'ARS' | 'USD') || 'ARS');
        setFormError('');
        setShowModal(true);
    };

    const handleSave = () => {
        const vendedorId = Number(formVendedorId);
        if (!vendedorId) {
            setFormError('Elegí un vendedor.');
            return;
        }
        const u = posOrNull(formUnidades);
        const m = posOrNull(formMonto);
        if (u == null && m == null) {
            setFormError('Fijá al menos un objetivo mayor a 0: unidades y/o facturado.');
            return;
        }
        setFormError('');
        upsertMutation.mutate({ vendedorId, anio, mes, unidadesObjetivo: u, montoObjetivo: m, moneda: formMoneda });
    };

    // ── Confirmación de borrado ──────────────────────────────────────────────
    const [aEliminar, setAEliminar] = useState<ObjetivoVendedorItem | null>(null);
    const deleteMutation = useMutation({
        mutationFn: (id: number) => objetivosApi.delete(id),
        onSuccess: () => {
            addToast('Objetivo eliminado', 'success');
            setAEliminar(null);
            queryClient.invalidateQueries({ queryKey: ['objetivos', anio, mes] });
        },
        onError: (e: unknown) => {
            addToast((e as { message?: string })?.message ?? 'No se pudo eliminar el objetivo', 'error');
            setAEliminar(null);
        },
    });

    // ── Resumen ──────────────────────────────────────────────────────────────
    const items = objetivosQ.data?.items ?? [];
    // Promedio de cumplimiento: se mira el objetivo de unidades si existe, si no el
    // de facturado. Sólo cuenta a quienes tienen algún objetivo (todos, por diseño).
    const promedio = useMemo(() => {
        const pcts = items
            .map((i) => (i.unidadesPct != null ? i.unidadesPct : i.montoPct))
            .filter((p): p is number => p != null);
        if (!pcts.length) return null;
        return Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
    }, [items]);
    const cumplidos = items.filter(
        (i) => (i.unidadesPct != null && i.unidadesPct >= 100) || (i.montoPct != null && i.montoPct >= 100),
    ).length;

    const cols: Column<ObjetivoVendedorItem>[] = [
        { header: 'Vendedor', accessor: (r) => <span className="font-bold">{r.vendedor}</span> },
        {
            header: 'Unidades',
            accessor: (r) => (
                <ProgressCell real={r.unidadesReal} objetivo={r.unidadesObjetivo} pct={r.unidadesPct} fmt={(n) => String(n)} />
            ),
        },
        {
            header: 'Facturado',
            accessor: (r) => (
                <ProgressCell real={r.montoReal} objetivo={r.montoObjetivo} pct={r.montoPct} fmt={(n) => money(n, r.moneda)} />
            ),
        },
        {
            header: 'Acciones',
            align: 'center',
            accessor: (r) => (
                <div className="flex items-center justify-center gap-1">
                    <button className="icon-btn" title="Editar objetivo" onClick={() => openEdit(r)} type="button">
                        <Pencil size={16} />
                    </button>
                    <button className="icon-btn" title="Eliminar objetivo" onClick={() => setAEliminar(r)} type="button">
                        <Trash2 size={16} />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <>
            {/* Selector de período + acción */}
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
                        {/* A diferencia de Caja (histórico), objetivos es planificación:
                            se incluye el año próximo para poder fijar metas a futuro. */}
                        {Array.from({ length: 6 }).map((_, i) => {
                            const y = hoy.getFullYear() + 1 - i;
                            return <option key={y} value={y}>{y}</option>;
                        })}
                    </select>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <Button variant="primary" onClick={openCreate} disabled={candidatos.length === 0} title={candidatos.length === 0 ? 'Todos los vendedores activos ya tienen objetivo este mes' : undefined}>
                        <Plus size={16} /> Fijar objetivo
                    </Button>
                </div>
            </div>

            {!objetivosQ.isError && (
                <div className="stats-grid stagger" style={{ marginBottom: '1.5rem' }}>
                    <StatCard label="Vendedores con objetivo" value={String(objetivosQ.data?.resumen.vendedores ?? 0)} />
                    <StatCard label="Cumplieron el objetivo" value={String(cumplidos)} color="var(--success, #16a34a)" />
                    <StatCard label="Cumplimiento promedio" value={promedio != null ? `${promedio}%` : '—'} color="var(--accent)" />
                </div>
            )}

            <DataTable
                columns={cols}
                data={items}
                isLoading={objetivosQ.isLoading}
                isError={objetivosQ.isError}
                errorMessage="No se pudieron cargar los objetivos"
                onRetry={() => objetivosQ.refetch()}
                emptyMessage="Todavía no fijaste objetivos para este mes. Fijá uno para seguir el progreso del equipo."
            />

            {/* Modal fijar / editar objetivo */}
            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={editing ? `Objetivo de ${editing.vendedor}` : 'Fijar objetivo'}
                subtitle={`${MESES[mes - 1]} ${anio} · unidades, facturado, o ambos.`}
                maxWidth="440px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSave} loading={upsertMutation.isPending}>Guardar</Button>
                    </>
                }
            >
                <div>
                    {!editing && (
                        <div className="form-group">
                            <label className="form-label">Vendedor *</label>
                            <select className="form-input" value={formVendedorId} onChange={(e) => setFormVendedorId(e.target.value)} autoFocus>
                                <option value="">Elegí un vendedor…</option>
                                {candidatos.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="form-group">
                        <label className="form-label">Unidades a vender</label>
                        <input type="number" min="0" className="form-input" value={formUnidades} onChange={(e) => setFormUnidades(e.target.value)} placeholder="Ej: 5" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Facturado objetivo</label>
                        <div className="flex gap-3">
                            <select className="form-input" style={{ maxWidth: '6.5rem' }} value={formMoneda} onChange={(e) => setFormMoneda(e.target.value as 'ARS' | 'USD')}>
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                            </select>
                            <input type="number" min="0" className="form-input" value={formMonto} onChange={(e) => setFormMonto(e.target.value)} placeholder="Ej: 30000000" />
                        </div>
                    </div>
                    {formError && (
                        <div className="uploader-alert uploader-alert-error">
                            <AlertTriangle size={14} />
                            <span>{formError}</span>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Confirmación de borrado */}
            <Modal
                isOpen={!!aEliminar}
                onClose={() => setAEliminar(null)}
                title="Eliminar objetivo"
                maxWidth="400px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setAEliminar(null)}>Cancelar</Button>
                        <Button variant="danger" onClick={() => aEliminar && deleteMutation.mutate(aEliminar.id)} loading={deleteMutation.isPending}>
                            Eliminar
                        </Button>
                    </>
                }
            >
                <p style={{ color: 'var(--text-secondary)' }}>
                    ¿Eliminar el objetivo de <strong>{aEliminar?.vendedor}</strong> de {MESES[mes - 1]} {anio}? El seguimiento de sus ventas seguirá disponible en el ranking.
                </p>
            </Modal>
        </>
    );
};

export default ObjetivosTab;
