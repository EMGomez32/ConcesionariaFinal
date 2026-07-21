import { useEffect, useState, useCallback } from 'react';
import { gastosFijosApi, type GastoFijo } from '../../api/gastos-fijos.api';
import { gastosFijosCategoriaApi, type GastoFijoCategoria } from '../../api/gastos-fijos-categorias.api';
import { sucursalesApi } from '../../api/sucursales.api';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useUIStore } from '../../store/uiStore';
import { getList } from '../../utils/lista';
import Badge from '../../components/ui/Badge';
import {
    FileText, Plus, Trash2, Edit, RefreshCw,
    Tag, DollarSign, AlertCircle,
    Calendar, Building2, ExternalLink, ChevronLeft, ChevronRight
} from 'lucide-react';

type PageTab = 'gastos' | 'categorias';

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

const EMPTY_FORM = {
    categoriaId: '',
    sucursalId: '',
    proveedorId: '',
    anio: String(CURRENT_YEAR),
    mes: String(new Date().getMonth() + 1),
    monto: '',
    descripcion: '',
    comprobanteUrl: '',
};

const EMPTY_CAT_FORM = { nombre: '', activo: true };

const GastosFijosPage = () => {
    const { addToast } = useUIStore();

    /* ── Tabs ────────────────────────────────────────── */
    const [activeTab, setActiveTab] = useState<PageTab>('gastos');

    /* ── Select data ─────────────────────────────────── */
    const [sucursales, setSucursales] = useState<{ id: number; nombre: string }[]>([]);
    const [categorias, setCategorias] = useState<GastoFijoCategoria[]>([]);

    /* ── Filters ─────────────────────────────────────── */
    const [filterAnio, setFilterAnio] = useState(String(CURRENT_YEAR));
    const [filterMes, setFilterMes] = useState('');
    const [filterCategoria, setFilterCategoria] = useState('');
    const [filterSucursal, setFilterSucursal] = useState('');

    /* ── List ────────────────────────────────────────── */
    const [gastos, setGastos] = useState<GastoFijo[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    /* ── Create modal ────────────────────────────────── */
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
    const [createError, setCreateError] = useState('');
    const [saving, setSaving] = useState(false);

    /* ── Edit modal ──────────────────────────────────── */
    const [editTarget, setEditTarget] = useState<GastoFijo | null>(null);
    const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState('');

    /* ── Delete ──────────────────────────────────────── */
    const [deleteTarget, setDeleteTarget] = useState<GastoFijo | null>(null);
    const [deleting, setDeleting] = useState(false);

    /* ── Categories ──────────────────────────────────── */
    const [showCatCreate, setShowCatCreate] = useState(false);
    const [catForm, setCatForm] = useState({ ...EMPTY_CAT_FORM });
    const [savingCat, setSavingCat] = useState(false);
    const [editCat, setEditCat] = useState<GastoFijoCategoria | null>(null);
    const [editCatForm, setEditCatForm] = useState({ nombre: '', activo: true });
    const [deleteCatTarget, setDeleteCatTarget] = useState<GastoFijoCategoria | null>(null);
    const [deletingCat, setDeletingCat] = useState(false);

    const loadCategorias = useCallback(async () => {
        try {
            setCategorias(getList<GastoFijoCategoria>(await gastosFijosCategoriaApi.getAll()));
        } catch {
            addToast('Error al cargar categorías', 'error');
        }
    }, [addToast]);

    /* ── Bootstrap ───────────────────────────────────── */
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                setSucursales(getList<{ id: number; nombre: string }>(await sucursalesApi.getAll()));
                loadCategorias();
            } catch {
                addToast('Error al cargar sucursales', 'error');
            }
        };
        loadInitialData();
    }, [loadCategorias, addToast]);

    /* ── Gastos fijos ────────────────────────────────── */
    const loadGastos = useCallback(async (pg = 1) => {
        setLoading(true);
        try {
            const params: Record<string, string | number> = { page: pg, limit: 20 };
            if (filterAnio) params.anio = Number(filterAnio);
            if (filterMes) params.mes = Number(filterMes);
            if (filterCategoria) params.categoriaId = Number(filterCategoria);
            if (filterSucursal) params.sucursalId = Number(filterSucursal);
            const res = await gastosFijosApi.getAll(params) as unknown as { totalPages?: number };
            setGastos(getList<GastoFijo>(res));
            setTotalPages(res?.totalPages ?? 1);
            setPage(pg);
        } catch {
            addToast('Error al cargar gastos fijos', 'error');
        } finally {
            setLoading(false);
        }
    }, [filterAnio, filterMes, filterCategoria, filterSucursal, addToast]);

    useEffect(() => { loadGastos(1); }, [loadGastos]);

    // Se agrupa por moneda: sumar ARS con USD da un número que no existe. Y es
    // sólo de la página actual (el backend pagina de a 20), así que se rotula
    // como tal en vez de hacerlo pasar por el total del período.
    const totalesPorMoneda = gastos.reduce<Record<string, number>>((acc, g) => {
        const moneda = g.moneda ?? 'ARS';
        acc[moneda] = (acc[moneda] ?? 0) + (Number(g.monto) || 0);
        return acc;
    }, {});
    const monedasOrdenadas = Object.keys(totalesPorMoneda).sort();

    /* ── Create ──────────────────────────────────────── */
    const handleCreate = async () => {
        if (!createForm.categoriaId || !createForm.anio || !createForm.mes || !createForm.monto || !createForm.descripcion.trim()) {
            setCreateError('Los campos marcados con * son mandatorios.');
            return;
        }
        setSaving(true);
        setCreateError('');
        try {
            const payload: Record<string, string | number | null> = {
                categoriaId: Number(createForm.categoriaId),
                anio: Number(createForm.anio),
                mes: Number(createForm.mes),
                monto: parseFloat(createForm.monto),
                descripcion: createForm.descripcion.trim(),
            };
            if (createForm.sucursalId) payload.sucursalId = Number(createForm.sucursalId);
            if (createForm.proveedorId) payload.proveedorId = Number(createForm.proveedorId);
            if (createForm.comprobanteUrl) payload.comprobanteUrl = createForm.comprobanteUrl.trim();
            await gastosFijosApi.create(payload);
            addToast('Egreso operativo registrado con éxito', 'success');
            setShowCreate(false);
            setCreateForm({ ...EMPTY_FORM });
            loadGastos(1);
        } catch (err: unknown) {
            setCreateError((err as { message?: string })?.message ?? 'Error estructural al guardar');
        } finally {
            setSaving(false);
        }
    };

    /* ── Edit ────────────────────────────────────────── */
    const openEdit = (g: GastoFijo) => {
        setEditTarget(g);
        setEditError('');
        setEditForm({
            categoriaId: String(g.categoriaId),
            sucursalId: g.sucursalId ? String(g.sucursalId) : '',
            proveedorId: g.proveedorId ? String(g.proveedorId) : '',
            anio: String(g.anio),
            mes: String(g.mes),
            monto: String(g.monto),
            descripcion: g.descripcion,
            comprobanteUrl: g.comprobanteUrl ?? '',
        });
    };

    const handleEdit = async () => {
        if (!editTarget) return;
        if (!editForm.categoriaId || !editForm.anio || !editForm.mes || !editForm.monto || !editForm.descripcion.trim()) {
            setEditError('Todos los campos son requeridos para la actualización.');
            return;
        }
        setSavingEdit(true);
        setEditError('');
        try {
            const payload: Record<string, string | number | null> = {
                categoriaId: Number(editForm.categoriaId),
                anio: Number(editForm.anio),
                mes: Number(editForm.mes),
                monto: parseFloat(editForm.monto),
                descripcion: editForm.descripcion.trim(),
                sucursalId: editForm.sucursalId ? Number(editForm.sucursalId) : null,
                proveedorId: editForm.proveedorId ? Number(editForm.proveedorId) : null,
                comprobanteUrl: editForm.comprobanteUrl || null,
            };
            await gastosFijosApi.update(editTarget.id, payload);
            addToast('Registro actualizado correctamente', 'success');
            setEditTarget(null);
            loadGastos(page);
        } catch (err: unknown) {
            setEditError((err as { message?: string })?.message ?? 'Error en la actualización de datos');
        } finally {
            setSavingEdit(false);
        }
    };

    /* ── Delete ──────────────────────────────────────── */
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await gastosFijosApi.delete(deleteTarget.id);
            addToast('Registro eliminado definitivamente', 'success');
            setDeleteTarget(null);
            loadGastos(page);
        } catch {
            addToast('Error al ejecutar la baja del registro', 'error');
        } finally {
            setDeleting(false);
        }
    };

    /* ── Cat create ──────────────────────────────────── */
    const handleCatCreate = async () => {
        if (!catForm.nombre.trim()) { addToast('Defina un nombre para el rubro', 'error'); return; }
        setSavingCat(true);
        try {
            await gastosFijosCategoriaApi.create({ nombre: catForm.nombre.trim(), activo: catForm.activo });
            addToast('Nuevo rubro operativo creado', 'success');
            setShowCatCreate(false);
            setCatForm({ ...EMPTY_CAT_FORM });
            loadCategorias();
        } catch (err: unknown) {
            addToast((err as { message?: string })?.message ?? 'Fallo en la creación del rubro', 'error');
        } finally {
            setSavingCat(false);
        }
    };

    /* ── Cat edit ────────────────────────────────────── */
    const openEditCat = (c: GastoFijoCategoria) => {
        setEditCat(c);
        setEditCatForm({ nombre: c.nombre, activo: c.activo ?? true });
    };

    const handleCatEdit = async () => {
        if (!editCat) return;
        setSavingCat(true);
        try {
            await gastosFijosCategoriaApi.update(editCat.id, { nombre: editCatForm.nombre || undefined, activo: editCatForm.activo });
            addToast('Rubro actualizado con éxito', 'success');
            setEditCat(null);
            loadCategorias();
        } catch (err: unknown) {
            addToast((err as { message?: string })?.message ?? 'Error al modificar rubro', 'error');
        } finally {
            setSavingCat(false);
        }
    };

    /* ── Cat delete ──────────────────────────────────── */
    const handleCatDelete = async () => {
        if (!deleteCatTarget) return;
        setDeletingCat(true);
        try {
            await gastosFijosCategoriaApi.delete(deleteCatTarget.id);
            addToast('Categoría de egreso eliminada', 'success');
            setDeleteCatTarget(null);
            loadCategorias();
        } catch {
            addToast('Error al eliminar categoría. Podría tener registros vinculados.', 'error');
        } finally {
            setDeletingCat(false);
        }
    };

    return (
        <div className="page-container animate-fade-in">
            {/* Header */}
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge accent shadow-glow">
                            <DollarSign size={20} />
                        </div>
                        <h1>Egresos Corporativos</h1>
                    </div>
                    <p>Administración de costos fijos, alquileres, suministros y servicios recurrentes.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => loadGastos(page)}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </Button>
                    <Button variant="primary" onClick={() => { setShowCreate(true); setCreateError(''); }}>
                        <Plus size={18} /> Nuevo Registro
                    </Button>
                </div>
            </header>

            {/* Tabs & Period Summary */}
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="segmented" role="tablist">
                        <button
                            role="tab"
                            aria-selected={activeTab === 'gastos'}
                            onClick={() => setActiveTab('gastos')}
                            className={`segmented-btn ${activeTab === 'gastos' ? 'is-active' : ''}`}
                        >
                            <Calendar size={16} />
                            Vista por Período
                        </button>
                        <button
                            role="tab"
                            aria-selected={activeTab === 'categorias'}
                            onClick={() => setActiveTab('categorias')}
                            className={`segmented-btn ${activeTab === 'categorias' ? 'is-active' : ''}`}
                        >
                            <Tag size={16} />
                            Rubros de Gasto
                        </button>
                    </div>

                    {activeTab === 'gastos' && (
                        <div className="card glass py-3 px-6 flex items-center gap-4 bg-emerald-500/5 border-emerald-500/20">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase text-emerald-500 tracking-tighter">Subtotal en pantalla</span>
                                {monedasOrdenadas.length === 0 ? (
                                    <span className="text-2xl font-black text-white tabular-nums">$0</span>
                                ) : (
                                    <div className="flex items-baseline gap-3">
                                        {monedasOrdenadas.map(m => (
                                            <span key={m} className="text-2xl font-black text-white tabular-nums">
                                                ${totalesPorMoneda[m].toLocaleString('es-AR')}
                                                <span className="text-[10px] font-black text-muted"> {m}</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="h-8 w-[1px] bg-emerald-500/20"></div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase text-muted tracking-tighter">Período Seleccionado</span>
                                <span className="text-xl font-black text-slate-400">
                                    {filterMes ? MESES[Number(filterMes) - 1].toUpperCase() : 'TODOS'} {filterAnio}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {activeTab === 'gastos' ? (
                    <>
                        {/* Filters Bar */}
                        <div className="card glass filters-bar flex flex-wrap items-center gap-6">
                            <div className="min-w-[120px]">
                                <label className="form-label-xs">Año Fiscal</label>
                                <select className="form-input-select w-full" value={filterAnio} onChange={e => setFilterAnio(e.target.value)}>
                                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                            <div className="min-w-[150px]">
                                <label className="form-label-xs">Mes Contable</label>
                                <select className="form-input-select w-full" value={filterMes} onChange={e => setFilterMes(e.target.value)}>
                                    <option value="">TODOS LOS MESES</option>
                                    {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m.toUpperCase()}</option>)}
                                </select>
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <label className="form-label-xs">Tipo de Rubro</label>
                                <select className="form-input-select w-full" value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}>
                                    <option value="">TODAS LAS CATEGORÍAS</option>
                                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
                                </select>
                            </div>
                            <div className="min-w-[180px]">
                                <label className="form-label-xs">Sucursal Asignada</label>
                                <select className="form-input-select w-full" value={filterSucursal} onChange={e => setFilterSucursal(e.target.value)}>
                                    <option value="">CORPORATIVO GLOBAL</option>
                                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre.toUpperCase()}</option>)}
                                </select>
                            </div>
                            <div className="flex items-end h-full">
                                <Button variant="secondary" onClick={() => { setFilterMes(''); setFilterCategoria(''); setFilterSucursal(''); }}>
                                    <RefreshCw size={18} />
                                </Button>
                            </div>
                        </div>

                        {/* List Table */}
                        <div className="table-container card">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Categoría</th>
                                        <th>Mes / Período</th>
                                        <th>Descripción del Concepto</th>
                                        <th>Monto Ejecutado</th>
                                        <th>Ubicación / Plaza</th>
                                        <th style={{ textAlign: 'center' }}>Documentación</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={7} style={{ padding: '8rem', textAlign: 'center' }}><RefreshCw className="animate-spin text-accent mx-auto" size={40} /></td></tr>
                                    ) : gastos.length === 0 ? (
                                        <tr>
                                            <td colSpan={7}>
                                                <div className="flex flex-col items-center py-20 text-muted">
                                                    <FileText size={64} className="opacity-10 mb-4" />
                                                    <p className="text-xl font-bold italic">Sin registros para el período</p>
                                                    <p className="text-sm">Inicie una carga financiera para visualizar datos.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        gastos.map(g => (
                                            <tr key={g.id}>
                                                <td><Badge variant="info">{g.categoria?.nombre?.toUpperCase() ?? 'GENERAL'}</Badge></td>
                                                <td>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-white text-sm">{MESES[g.mes - 1].toUpperCase()}</span>
                                                        <span className="text-[10px] font-black text-muted tracking-widest">{g.anio}</span>
                                                    </div>
                                                </td>
                                                <td style={{ maxWidth: '280px' }}>
                                                    <span className="text-xs font-semibold text-slate-300 line-clamp-2" title={g.descripcion}>{g.descripcion}</span>
                                                </td>
                                                <td>
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-lg font-black text-white tabular-nums">${Number(g.monto).toLocaleString('es-AR')}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <Building2 size={12} className="text-muted" />
                                                        <span className="text-xs font-bold text-slate-400">{g.sucursal?.nombre ?? 'CORPORATIVO'}</span>
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {g.comprobanteUrl ? (
                                                        <a href={g.comprobanteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 border border-blue-500/20 transition-all text-[10px] font-black uppercase tracking-tighter">
                                                            <ExternalLink size={12} /> Ver PDF
                                                        </a>
                                                    ) : <span className="text-slate-600 text-[10px] font-black">—</span>}
                                                </td>
                                                <td>
                                                    <div className="flex justify-end gap-2">
                                                        <button className="icon-btn" onClick={() => openEdit(g)} title="Editar"><Edit size={16} /></button>
                                                        <button className="icon-btn danger" onClick={() => setDeleteTarget(g)} title="Eliminar"><Trash2 size={16} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex justify-center gap-4 mt-6">
                                <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => loadGastos(page - 1)}>
                                    <ChevronLeft size={16} /> Anterior
                                </Button>
                                <div className="flex items-center px-4 bg-slate-900/50 rounded-xl border border-slate-800 text-xs font-black">
                                    {page} / {totalPages}
                                </div>
                                <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => loadGastos(page + 1)}>
                                    Siguiente <ChevronRight size={16} />
                                </Button>
                            </div>
                        )}
                    </>
                ) : (
                    /* Categorias View */
                    <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
                        <div className="card glass p-8 flex justify-between items-center border-emerald-500/20 shadow-glow-sm">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-3xl bg-emerald-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/40">
                                    <Tag size={32} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-white">Gestión de Rubros</h2>
                                    <p className="text-sm text-slate-400">Parámetros de clasificación para gastos mensuales recurrentes.</p>
                                </div>
                            </div>
                            {!showCatCreate && (
                                <Button variant="primary" onClick={() => setShowCatCreate(true)}>
                                    <Plus size={18} /> Nuevo Rubro
                                </Button>
                            )}
                        </div>

                        {showCatCreate && (
                            <div className="card glass p-8 animate-fade-in border-emerald-500/30 bg-emerald-500/5">
                                <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2">
                                    <Plus size={20} className="text-emerald-500" /> Definir Nueva Categoría
                                </h3>
                                <div className="flex flex-col sm:flex-row gap-6 mb-8 items-end">
                                    <div className="flex-1 w-full">
                                        <label className="form-label">Nombre del Concepto *</label>
                                        <input className="form-input" placeholder="Ej: Servicios Públicos, Impuestos..." value={catForm.nombre} onChange={e => setCatForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
                                    </div>
                                    <div className="flex gap-4">
                                        <Button variant="secondary" onClick={() => setShowCatCreate(false)}>Cancelar</Button>
                                        <Button variant="primary" onClick={handleCatCreate} loading={savingCat}>Guardar</Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="table-container card">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Identificador del Rubro</th>
                                        <th>Estado Operativo</th>
                                        <th style={{ textAlign: 'right' }}>Acciones Especiales</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categorias.map(c => (
                                        <tr key={c.id}>
                                            <td className="font-black text-white text-sm">
                                                {editCat?.id === c.id ? (
                                                    <input className="form-input h-10" value={editCatForm.nombre} onChange={e => setEditCatForm(f => ({ ...f, nombre: e.target.value }))} />
                                                ) : c.nombre.toUpperCase()}
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${c.activo !== false ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
                                                    <span className={`text-[10px] font-black uppercase ${c.activo !== false ? 'text-emerald-500' : 'text-slate-500'}`}>
                                                        {c.activo !== false ? 'Visible en Carga' : 'Archivado'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                {editCat?.id === c.id ? (
                                                    <div className="flex justify-end gap-2">
                                                        <Button variant="primary" size="sm" onClick={handleCatEdit} loading={savingCat}>Guardar</Button>
                                                        <Button variant="secondary" size="sm" onClick={() => setEditCat(null)}>X</Button>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-end gap-2">
                                                        <button className="icon-btn" onClick={() => openEditCat(c)}><Edit size={16} /></button>
                                                        <button className="icon-btn danger" onClick={() => setDeleteCatTarget(c)}><Trash2 size={16} /></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <Modal
                isOpen={showCreate || editTarget !== null}
                onClose={() => { setShowCreate(false); setEditTarget(null); }}
                title={editTarget ? 'Actualización de Carga' : 'Certificación de Egreso'}
                subtitle="Asegúrese de adjuntar digitalmente el comprobante de respaldo."
                maxWidth="720px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => { setShowCreate(false); setEditTarget(null); }}>Abortar</Button>
                        <Button variant="primary" onClick={editTarget ? handleEdit : handleCreate} loading={saving || savingEdit}>
                            {editTarget ? 'Confirmar Cambios' : 'Registrar'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="form-group">
                            <label className="form-label">Rubro del Gasto *</label>
                            <select className="form-input" value={editTarget ? editForm.categoriaId : createForm.categoriaId}
                                onChange={e => editTarget ? setEditForm(f => ({ ...f, categoriaId: e.target.value })) : setCreateForm(f => ({ ...f, categoriaId: e.target.value }))}>
                                <option value="">Selección de cuenta...</option>
                                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Período Fiscal *</label>
                            <div className="flex gap-4">
                                <select className="form-input" value={editTarget ? editForm.mes : createForm.mes}
                                    onChange={e => editTarget ? setEditForm(f => ({ ...f, mes: e.target.value })) : setCreateForm(f => ({ ...f, mes: e.target.value }))}>
                                    {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m.toUpperCase()}</option>)}
                                </select>
                                <select className="form-input" value={editTarget ? editForm.anio : createForm.anio}
                                    onChange={e => editTarget ? setEditForm(f => ({ ...f, anio: e.target.value })) : setCreateForm(f => ({ ...f, anio: e.target.value }))}>
                                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Descripción Detallada *</label>
                        <textarea className="form-input" rows={3} value={editTarget ? editForm.descripcion : createForm.descripcion}
                            onChange={e => editTarget ? setEditForm(f => ({ ...f, descripcion: e.target.value })) : setCreateForm(f => ({ ...f, descripcion: e.target.value }))}
                            placeholder="Justificación y desglose del egreso..." style={{ resize: 'none' }} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="form-group">
                            <label className="form-label">Importe (ARS) *</label>
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-accent font-black">$</div>
                                <input type="number" className="form-input pl-8 font-black text-xl" value={editTarget ? editForm.monto : createForm.monto}
                                    onChange={e => editTarget ? setEditForm(f => ({ ...f, monto: e.target.value })) : setCreateForm(f => ({ ...f, monto: e.target.value }))} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Plaza / Sucursal</label>
                            <select className="form-input" value={editTarget ? editForm.sucursalId : createForm.sucursalId}
                                onChange={e => editTarget ? setEditForm(f => ({ ...f, sucursalId: e.target.value })) : setCreateForm(f => ({ ...f, sucursalId: e.target.value }))}>
                                <option value="">CENTRALIZADO (CORPORATIVO)</option>
                                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre.toUpperCase()}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Link de Comprobante Digital (PDF/IMG)</label>
                        <div className="relative">
                            <ExternalLink size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                            <input className="form-input pl-11 text-xs" value={editTarget ? editForm.comprobanteUrl : createForm.comprobanteUrl}
                                onChange={e => editTarget ? setEditForm(f => ({ ...f, comprobanteUrl: e.target.value })) : setCreateForm(f => ({ ...f, comprobanteUrl: e.target.value }))}
                                placeholder="https://bucket-almacenamiento.com/factura-123.pdf" />
                        </div>
                    </div>

                    {(createError || editError) && (
                        <div className="uploader-alert uploader-alert-error">
                            <AlertCircle size={14} />
                            <span>{createError || editError}</span>
                        </div>
                    )}
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={deleteTarget !== null || deleteCatTarget !== null}
                title="¿Ejecutar baja?"
                message={`Esta operación eliminará irremediablemente ${deleteTarget
                    ? 'el registro por $' + Number(deleteTarget.monto).toLocaleString('es-AR')
                    : 'la categoría "' + deleteCatTarget?.nombre + '"'}.`}
                confirmLabel="Eliminar"
                cancelLabel="Cerrar"
                type="danger"
                onConfirm={deleteTarget ? handleDelete : handleCatDelete}
                onCancel={() => { setDeleteTarget(null); setDeleteCatTarget(null); }}
                loading={deleting || deletingCat}
            />

        </div>
    );
};

export default GastosFijosPage;
