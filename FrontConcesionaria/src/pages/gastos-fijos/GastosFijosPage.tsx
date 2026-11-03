import { useEffect, useState, useCallback } from 'react';
import { gastosFijosApi, type GastoFijo } from '../../api/gastos-fijos.api';
import { gastosFijosCategoriaApi, type GastoFijoCategoria } from '../../api/gastos-fijos-categorias.api';
import { sucursalesApi } from '../../api/sucursales.api';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import PageTitle from '../../components/ui/PageTitle';
import Badge from '../../components/ui/Badge';
import { Listado, ListadoTabla, CampoFiltro, EstadoListado, type ColumnaListado } from '../../components/listado';
import { useUIStore } from '../../store/uiStore';
import { getList } from '../../utils/lista';
import { formatMoneda, formatTotales, totalesPorMoneda } from '../../utils/moneda';
import { getErrorMessage } from '../../utils/getErrorMessage';
import {
    Plus, Trash2, Edit, RefreshCw,
    Tag, AlertCircle, Calendar, ExternalLink, Receipt
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
    moneda: 'ARS',
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
    const [categoriasError, setCategoriasError] = useState(false);

    /* ── Filters ─────────────────────────────────────── */
    const [filterAnio, setFilterAnio] = useState(String(CURRENT_YEAR));
    const [filterMes, setFilterMes] = useState('');
    const [filterCategoria, setFilterCategoria] = useState('');
    const [filterSucursal, setFilterSucursal] = useState('');

    /* ── List ────────────────────────────────────────── */
    const [gastos, setGastos] = useState<GastoFijo[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
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
            setCategoriasError(false);
        } catch {
            setCategoriasError(true);
        }
    }, []);

    /* ── Bootstrap ───────────────────────────────────── */
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                setSucursales(getList<{ id: number; nombre: string }>(await sucursalesApi.getAll()));
            } catch {
                addToast('No se pudieron cargar las sucursales para el filtro', 'error');
            }
            loadCategorias();
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
            setLoadError(false);
        } catch {
            // Un error del servidor no es "no hay gastos": la tabla lo muestra con Reintentar.
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [filterAnio, filterMes, filterCategoria, filterSucursal]);

    useEffect(() => { loadGastos(1); }, [loadGastos]);

    // Se agrupa por moneda: sumar ARS con USD da un número que no existe. Y es
    // sólo de la página actual (el backend pagina de a 20), así que se rotula
    // como tal en vez de hacerlo pasar por el total del período.
    const totalesPagina = totalesPorMoneda(gastos, (g) => g.monto, (g) => g.moneda);

    const filtrosActivos = [filterAnio !== String(CURRENT_YEAR), !!filterMes, !!filterCategoria, !!filterSucursal].filter(Boolean).length;
    const limpiarFiltros = () => {
        setFilterAnio(String(CURRENT_YEAR));
        setFilterMes('');
        setFilterCategoria('');
        setFilterSucursal('');
    };
    const periodo = `${filterMes ? MESES[Number(filterMes) - 1] : 'Todo'} ${filterAnio}`;

    /* ── Create ──────────────────────────────────────── */
    const handleCreate = async () => {
        if (!createForm.categoriaId || !createForm.anio || !createForm.mes || !createForm.monto || !createForm.descripcion.trim()) {
            setCreateError('Completá los campos marcados con *.');
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
                moneda: createForm.moneda,
                descripcion: createForm.descripcion.trim(),
            };
            if (createForm.sucursalId) payload.sucursalId = Number(createForm.sucursalId);
            if (createForm.proveedorId) payload.proveedorId = Number(createForm.proveedorId);
            if (createForm.comprobanteUrl) payload.comprobanteUrl = createForm.comprobanteUrl.trim();
            await gastosFijosApi.create(payload);
            addToast('Gasto fijo registrado', 'success');
            setShowCreate(false);
            setCreateForm({ ...EMPTY_FORM });
            loadGastos(1);
        } catch (err: unknown) {
            setCreateError(getErrorMessage(err, 'No se pudo registrar el gasto'));
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
            moneda: g.moneda ?? 'ARS',
            descripcion: g.descripcion,
            comprobanteUrl: g.comprobanteUrl ?? '',
        });
    };

    const handleEdit = async () => {
        if (!editTarget) return;
        if (!editForm.categoriaId || !editForm.anio || !editForm.mes || !editForm.monto || !editForm.descripcion.trim()) {
            setEditError('Completá los campos marcados con *.');
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
                moneda: editForm.moneda,
                descripcion: editForm.descripcion.trim(),
                sucursalId: editForm.sucursalId ? Number(editForm.sucursalId) : null,
                proveedorId: editForm.proveedorId ? Number(editForm.proveedorId) : null,
                comprobanteUrl: editForm.comprobanteUrl || null,
            };
            await gastosFijosApi.update(editTarget.id, payload);
            addToast('Gasto fijo actualizado', 'success');
            setEditTarget(null);
            loadGastos(page);
        } catch (err: unknown) {
            setEditError(getErrorMessage(err, 'No se pudo guardar el gasto'));
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
            addToast('Gasto fijo eliminado', 'success');
            setDeleteTarget(null);
            loadGastos(page);
        } catch (err) {
            addToast(getErrorMessage(err, 'No se pudo eliminar el gasto'), 'error');
        } finally {
            setDeleting(false);
        }
    };

    /* ── Cat create ──────────────────────────────────── */
    const handleCatCreate = async () => {
        if (!catForm.nombre.trim()) { addToast('Poné un nombre para el rubro', 'error'); return; }
        setSavingCat(true);
        try {
            await gastosFijosCategoriaApi.create({ nombre: catForm.nombre.trim(), activo: catForm.activo });
            addToast('Rubro creado', 'success');
            setShowCatCreate(false);
            setCatForm({ ...EMPTY_CAT_FORM });
            loadCategorias();
        } catch (err: unknown) {
            addToast(getErrorMessage(err, 'No se pudo crear el rubro'), 'error');
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
            addToast('Rubro actualizado', 'success');
            setEditCat(null);
            loadCategorias();
        } catch (err: unknown) {
            addToast(getErrorMessage(err, 'No se pudo guardar el rubro'), 'error');
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
            addToast('Rubro eliminado', 'success');
            setDeleteCatTarget(null);
            loadCategorias();
        } catch {
            addToast('No se pudo eliminar el rubro. Puede que tenga gastos cargados.', 'error');
        } finally {
            setDeletingCat(false);
        }
    };

    const abrirAlta = () => { setShowCreate(true); setCreateError(''); };

    const columnas: ColumnaListado<GastoFijo>[] = [
        {
            clave: 'descripcion',
            titulo: 'Gasto',
            flexible: true,
            tarjeta: 'titulo',
            celda: (g) => (
                <>
                    <span className="listado-principal" title={g.descripcion}>{g.descripcion}</span>
                    <span className="listado-secundario">{g.categoria?.nombre ?? 'Sin rubro'}</span>
                </>
            ),
        },
        {
            clave: 'periodo',
            titulo: 'Período',
            celda: (g) => <span className="listado-nowrap">{MESES[g.mes - 1] ?? g.mes} {g.anio}</span>,
        },
        {
            clave: 'monto',
            titulo: 'Importe',
            alinear: 'right',
            celda: (g) => <span className="listado-nowrap" style={{ fontWeight: 700 }}>{formatMoneda(g.monto, g.moneda)}</span>,
        },
        {
            clave: 'sucursal',
            titulo: 'Sucursal',
            celda: (g) => <span className="listado-nowrap">{g.sucursal?.nombre ?? 'Toda la concesionaria'}</span>,
        },
        {
            clave: 'comprobante',
            titulo: 'Comprobante',
            celda: (g) => (
                g.comprobanteUrl ? (
                    <a href={g.comprobanteUrl} target="_blank" rel="noreferrer" className="text-accent listado-nowrap" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
                        <ExternalLink size={12} aria-hidden="true" /> Ver
                    </a>
                ) : <span className="text-muted">Sin comprobante</span>
            ),
        },
        {
            clave: 'acciones',
            titulo: 'Acciones',
            alinear: 'right',
            ancho: '1%',
            tarjeta: 'acciones',
            celda: (g) => (
                <div className="listado-acciones-fila">
                    <button type="button" className="icon-btn" onClick={() => openEdit(g)} title="Editar" aria-label={`Editar el gasto "${g.descripcion}"`}><Edit size={14} aria-hidden="true" /></button>
                    <button type="button" className="icon-btn danger" onClick={() => setDeleteTarget(g)} title="Eliminar" aria-label={`Eliminar el gasto "${g.descripcion}"`}><Trash2 size={14} aria-hidden="true" /></button>
                </div>
            ),
        },
    ];

    const pestanas = (
        <div className="segmented" role="tablist" aria-label="Vista">
            <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'gastos'}
                onClick={() => setActiveTab('gastos')}
                className={`segmented-btn ${activeTab === 'gastos' ? 'is-active' : ''}`}
            >
                <Calendar size={16} aria-hidden="true" />
                Gastos por mes
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'categorias'}
                onClick={() => setActiveTab('categorias')}
                className={`segmented-btn ${activeTab === 'categorias' ? 'is-active' : ''}`}
            >
                <Tag size={16} aria-hidden="true" />
                Rubros
            </button>
        </div>
    );

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Gastos fijos" />
            <Listado
                titulo="Gastos fijos"
                subtitulo="Alquiler, servicios, impuestos y otros gastos que se repiten todos los meses"
                icono={<Receipt size={22} />}
                clave="gastos-fijos"
                pestanas={pestanas}
                acciones={activeTab === 'gastos' ? (
                    <Button variant="secondary" className="btn-icono" onClick={() => loadGastos(page)} disabled={loading} aria-label="Actualizar la lista" title="Actualizar">
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
                    </Button>
                ) : undefined}
                accionPrincipal={activeTab === 'gastos' ? (
                    <Button variant="primary" onClick={abrirAlta}>
                        <Plus size={18} aria-hidden="true" /> Nuevo gasto fijo
                    </Button>
                ) : (!showCatCreate ? (
                    <Button variant="primary" onClick={() => setShowCatCreate(true)}>
                        <Plus size={18} aria-hidden="true" /> Nuevo rubro
                    </Button>
                ) : undefined)}
                filtrosActivos={filtrosActivos}
                onLimpiarFiltros={limpiarFiltros}
                resumen={activeTab === 'gastos' && !loading && !loadError ? (
                    <span title="Suma de los gastos que se ven en esta página, separada por moneda">
                        {periodo} · en esta página: {formatTotales(totalesPagina)}
                    </span>
                ) : undefined}
                filtros={activeTab === 'gastos' ? (
                    <>
                        <CampoFiltro etiqueta="Año">
                            <select className="form-input" value={filterAnio} onChange={e => setFilterAnio(e.target.value)}>
                                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Mes">
                            <select className="form-input" value={filterMes} onChange={e => setFilterMes(e.target.value)}>
                                <option value="">Todos los meses</option>
                                {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Rubro">
                            <select className="form-input" value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}>
                                <option value="">Todos los rubros</option>
                                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Sucursal">
                            <select className="form-input" value={filterSucursal} onChange={e => setFilterSucursal(e.target.value)}>
                                <option value="">Todas las sucursales</option>
                                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>
                        </CampoFiltro>
                    </>
                ) : undefined}
            >
                {activeTab === 'gastos' ? (
                    <ListadoTabla
                        etiqueta="Gastos fijos"
                        columnas={columnas}
                        filas={gastos}
                        cargando={loading && gastos.length === 0}
                        error={loadError}
                        mensajeError="No se pudieron cargar los gastos fijos"
                        onReintentar={() => loadGastos(page)}
                        hayFiltros={!!filterMes || !!filterCategoria || !!filterSucursal}
                        onLimpiarFiltros={limpiarFiltros}
                        vacio={{
                            titulo: `No hay gastos fijos cargados en ${filterAnio}`,
                            descripcion: 'Cargá el alquiler, los servicios y los impuestos de cada mes para ver cuánto cuesta mantener la concesionaria.',
                            icono: <Receipt size={32} aria-hidden="true" />,
                            accion: (
                                <Button variant="primary" size="sm" onClick={abrirAlta}>
                                    <Plus size={16} aria-hidden="true" /> Nuevo gasto fijo
                                </Button>
                            ),
                        }}
                        pagina={page}
                        totalPaginas={totalPages}
                        onPaginaChange={(p) => loadGastos(p)}
                    />
                ) : (
                    /* Rubros */
                    <div className="w-full flex flex-col gap-6">
                        {showCatCreate && (
                            <div className="card glass animate-fade-in">
                                <h2 className="text-lg font-black mb-6 flex items-center gap-2" style={{ fontSize: 'var(--text-lg)' }}>
                                    <Plus size={20} className="text-accent" aria-hidden="true" /> Nuevo rubro
                                </h2>
                                <div className="flex flex-col sm:flex-row gap-6 items-end">
                                    <Input
                                        dense
                                        label="Nombre *"
                                        containerClassName="flex-1 w-full"
                                        placeholder="Ej: servicios, impuestos"
                                        value={catForm.nombre}
                                        onChange={e => setCatForm(f => ({ ...f, nombre: e.target.value }))}
                                        autoFocus
                                    />
                                    <div className="flex gap-4">
                                        <Button variant="secondary" onClick={() => setShowCatCreate(false)}>Cancelar</Button>
                                        <Button variant="primary" onClick={handleCatCreate} loading={savingCat}>Guardar</Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {categoriasError ? (
                            <div className="card">
                                <EstadoListado tipo="error" mensaje="No se pudieron cargar los rubros" onReintentar={loadCategorias} />
                            </div>
                        ) : categorias.length === 0 ? (
                            <div className="card">
                                <EstadoListado
                                    tipo="vacio"
                                    titulo="Todavía no hay rubros"
                                    descripcion="Los rubros agrupan los gastos fijos (servicios, impuestos, sueldos…). Creá el primero para empezar a cargar."
                                    icono={<Tag size={32} aria-hidden="true" />}
                                />
                            </div>
                        ) : (
                            <div className="table-container card">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Rubro</th>
                                            <th>Estado</th>
                                            <th style={{ textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categorias.map(c => (
                                            <tr key={c.id}>
                                                <td className="font-bold text-sm">
                                                    {editCat?.id === c.id ? (
                                                        <input className="form-input" aria-label="Nombre del rubro" value={editCatForm.nombre} onChange={e => setEditCatForm(f => ({ ...f, nombre: e.target.value }))} />
                                                    ) : c.nombre}
                                                </td>
                                                <td>
                                                    <Badge variant={c.activo !== false ? 'success' : 'default'} title={c.activo !== false ? 'Aparece al cargar un gasto' : 'No aparece al cargar un gasto'}>
                                                        {c.activo !== false ? 'Activo' : 'Archivado'}
                                                    </Badge>
                                                </td>
                                                <td>
                                                    {editCat?.id === c.id ? (
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="secondary" size="sm" onClick={() => setEditCat(null)}>Cancelar</Button>
                                                            <Button variant="primary" size="sm" onClick={handleCatEdit} loading={savingCat}>Guardar</Button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-end gap-2">
                                                            <button type="button" className="icon-btn" onClick={() => openEditCat(c)} title="Editar" aria-label={`Editar el rubro ${c.nombre}`}><Edit size={16} aria-hidden="true" /></button>
                                                            <button type="button" className="icon-btn danger" onClick={() => setDeleteCatTarget(c)} title="Eliminar" aria-label={`Eliminar el rubro ${c.nombre}`}><Trash2 size={16} aria-hidden="true" /></button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </Listado>

            <Modal
                isOpen={showCreate || editTarget !== null}
                onClose={() => { setShowCreate(false); setEditTarget(null); }}
                title={editTarget ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
                subtitle="Si tenés el comprobante, pegá el link para tenerlo a mano."
                maxWidth="720px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => { setShowCreate(false); setEditTarget(null); }}>Cancelar</Button>
                        <Button variant="primary" onClick={editTarget ? handleEdit : handleCreate} loading={saving || savingEdit}>
                            {editTarget ? 'Guardar' : 'Registrar'}
                        </Button>
                    </>
                }
            >
                <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Select
                            dense
                            label="Rubro *"
                            placeholder="Elegí el rubro"
                            options={categorias.map(c => ({ value: c.id, label: c.nombre }))}
                            value={editTarget ? editForm.categoriaId : createForm.categoriaId}
                            onChange={e => editTarget ? setEditForm(f => ({ ...f, categoriaId: e.target.value })) : setCreateForm(f => ({ ...f, categoriaId: e.target.value }))}
                        />
                        <div className="input-group input-group--dense">
                            <span className="input-label">Período *</span>
                            <div className="flex gap-4">
                                <Select dense containerClassName="flex-1" aria-label="Mes" value={editTarget ? editForm.mes : createForm.mes}
                                    onChange={e => editTarget ? setEditForm(f => ({ ...f, mes: e.target.value })) : setCreateForm(f => ({ ...f, mes: e.target.value }))}>
                                    {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                                </Select>
                                <Select dense containerClassName="flex-1" aria-label="Año" value={editTarget ? editForm.anio : createForm.anio}
                                    onChange={e => editTarget ? setEditForm(f => ({ ...f, anio: e.target.value })) : setCreateForm(f => ({ ...f, anio: e.target.value }))}>
                                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </Select>
                            </div>
                        </div>
                    </div>

                    <Textarea
                        dense
                        label="Descripción *"
                        rows={3}
                        value={editTarget ? editForm.descripcion : createForm.descripcion}
                        onChange={e => editTarget ? setEditForm(f => ({ ...f, descripcion: e.target.value })) : setCreateForm(f => ({ ...f, descripcion: e.target.value }))}
                        placeholder="Ej: alquiler del local de Av. Rivadavia"
                        style={{ resize: 'none' }}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="input-group input-group--dense">
                            <span className="input-label">Importe *</span>
                            <div className="flex gap-3">
                                <Select
                                    dense
                                    aria-label="Moneda"
                                    style={{ maxWidth: '6.5rem' }}
                                    value={editTarget ? editForm.moneda : createForm.moneda}
                                    onChange={e => editTarget ? setEditForm(f => ({ ...f, moneda: e.target.value })) : setCreateForm(f => ({ ...f, moneda: e.target.value }))}
                                >
                                    <option value="ARS">ARS</option>
                                    <option value="USD">USD</option>
                                </Select>
                                <Input dense containerClassName="flex-1" type="number" inputMode="decimal" aria-label="Importe" value={editTarget ? editForm.monto : createForm.monto}
                                    onChange={e => editTarget ? setEditForm(f => ({ ...f, monto: e.target.value })) : setCreateForm(f => ({ ...f, monto: e.target.value }))} />
                            </div>
                        </div>
                        <Select
                            dense
                            label="Sucursal"
                            placeholder="Toda la concesionaria"
                            options={sucursales.map(s => ({ value: s.id, label: s.nombre }))}
                            value={editTarget ? editForm.sucursalId : createForm.sucursalId}
                            onChange={e => editTarget ? setEditForm(f => ({ ...f, sucursalId: e.target.value })) : setCreateForm(f => ({ ...f, sucursalId: e.target.value }))}
                        />
                    </div>

                    <Input
                        dense
                        label="Link del comprobante (PDF o imagen)"
                        icon={<ExternalLink size={14} />}
                        className="text-xs"
                        type="url"
                        value={editTarget ? editForm.comprobanteUrl : createForm.comprobanteUrl}
                        onChange={e => editTarget ? setEditForm(f => ({ ...f, comprobanteUrl: e.target.value })) : setCreateForm(f => ({ ...f, comprobanteUrl: e.target.value }))}
                        placeholder="https://…"
                    />

                    {(createError || editError) && (
                        <div className="uploader-alert uploader-alert-error" role="alert">
                            <AlertCircle size={14} aria-hidden="true" />
                            <span>{createError || editError}</span>
                        </div>
                    )}
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={deleteTarget !== null || deleteCatTarget !== null}
                title={deleteTarget ? 'Eliminar el gasto fijo' : 'Eliminar el rubro'}
                message={deleteTarget
                    ? `¿Eliminar el gasto "${deleteTarget.descripcion}" de ${formatMoneda(deleteTarget.monto, deleteTarget.moneda)}? No se puede deshacer.`
                    : `¿Eliminar el rubro "${deleteCatTarget?.nombre ?? ''}"? No se puede deshacer.`}
                confirmLabel="Eliminar"
                cancelLabel="Cancelar"
                type="danger"
                onConfirm={deleteTarget ? handleDelete : handleCatDelete}
                onCancel={() => { setDeleteTarget(null); setDeleteCatTarget(null); }}
                loading={deleting || deletingCat}
            />
        </div>
    );
};

export default GastosFijosPage;
