import React, { useState, useMemo } from 'react';
import {
    useGastos, useGastosCategorias, useCreateGasto, useUpdateGasto,
    useDeleteGasto, useCreateCategoriaGasto, useUpdateCategoriaGasto,
    useDeleteCategoriaGasto
} from '../../hooks/useGastos';
import { useVehiculos } from '../../hooks/useVehiculos';
import { useSucursales } from '../../hooks/useSucursales';
import { useConfirm } from '../../hooks/useConfirm';
import { useUIStore } from '../../store/uiStore';
import { useDebounce } from '../../hooks/useDebounce';
import { formatFecha } from '../../utils/fecha';
import type { GastoVehiculo } from '../../api/gastos.api';
import type { GastoCategoria } from '../../api/gastos-categorias.api';
import type { ApiError } from '../../types/api.types';

import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import DataTable, { type Column } from '../../components/ui/DataTable';

import {
    Wrench, Plus, Trash2, Edit, RefreshCw,
    DollarSign, Calendar, Building2,
    TrendingDown, Settings,
    Layers, Search
} from 'lucide-react';

type PageTab = 'gastos' | 'categorias';

const EMPTY_GASTO_FORM = {
    vehiculoId: '',
    categoriaId: '',
    monto: '',
    moneda: 'ARS' as 'ARS' | 'USD',
    fechaGasto: new Date().toISOString().split('T')[0],
    descripcion: '',
};

const GastosPage: React.FC = () => {
    const { addToast } = useUIStore();
    const confirm = useConfirm();

    const [activeTab, setActiveTab] = useState<PageTab>('gastos');
    const [page, setPage] = useState(1);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 500);
    const [filterVehiculo, setFilterVehiculo] = useState('');
    const [filterCategoria, setFilterCategoria] = useState('');
    const [filterSucursal, setFilterSucursal] = useState('');

    // Queries
    const { data: catData = [], isLoading: loadingCat } = useGastosCategorias();
    const { data: sucursalData = [] } = useSucursales();
    const { data: vehiculoData } = useVehiculos({}, { limit: 1000 });

    const { data: payload, isLoading: loadingGastos, refetch: refetchGastos } = useGastos({
        tipo: 'VEHICULO',
        page,
        limit: 15,
        vehiculoId: filterVehiculo ? Number(filterVehiculo) : undefined,
        categoriaId: filterCategoria ? Number(filterCategoria) : undefined,
        sucursalId: filterSucursal ? Number(filterSucursal) : undefined,
        descripcion: debouncedSearch || undefined
    });

    const gastos = useMemo(() => payload?.results || [], [payload?.results]);
    const totalPages = payload?.totalPages || 1;

    // Mutations
    const createGastoMutation = useCreateGasto();
    const updateGastoMutation = useUpdateGasto();
    const deleteGastoMutation = useDeleteGasto();

    const createCatMutation = useCreateCategoriaGasto();
    const updateCatMutation = useUpdateCategoriaGasto();
    const deleteCatMutation = useDeleteCategoriaGasto();

    // Modals State
    const [showCreateGasto, setShowCreateGasto] = useState(false);
    const [gastoForm, setGastoForm] = useState({ ...EMPTY_GASTO_FORM });

    const [editGasto, setEditGasto] = useState<GastoVehiculo | null>(null);
    const [editGastoForm, setEditGastoForm] = useState({ monto: '', descripcion: '', fechaGasto: '' });

    const [showCreateCat, setShowCreateCat] = useState(false);
    const [catForm, setCatForm] = useState({ nombre: '', descripcion: '' });

    const [editCat, setEditCat] = useState<GastoCategoria | null>(null);
    const [editCatForm, setEditCatForm] = useState({ nombre: '', descripcion: '' });

    // Handlers
    const handleCreateGasto = async () => {
        if (!gastoForm.vehiculoId || !gastoForm.categoriaId || !gastoForm.monto) {
            addToast('Complete los campos obligatorios', 'error');
            return;
        }
        try {
            // La sede del gasto la determina el vehículo: no se envía sucursalId.
            await createGastoMutation.mutateAsync({
                ...gastoForm,
                vehiculoId: Number(gastoForm.vehiculoId),
                categoriaId: Number(gastoForm.categoriaId),
                monto: parseFloat(gastoForm.monto),
                fechaGasto: new Date(gastoForm.fechaGasto).toISOString(),
                tipo: 'VEHICULO'
            });
            addToast('Gasto registrado correctamente', 'success');
            setShowCreateGasto(false);
            setGastoForm({ ...EMPTY_GASTO_FORM });
        } catch (err: unknown) {
            const apiError = err as ApiError;
            addToast(apiError?.message || 'Error al registrar gasto', 'error');
        }
    };

    const handleUpdateGasto = async () => {
        if (!editGasto) return;
        try {
            await updateGastoMutation.mutateAsync({
                id: editGasto.id,
                data: {
                    monto: parseFloat(editGastoForm.monto),
                    descripcion: editGastoForm.descripcion,
                    fechaGasto: new Date(editGastoForm.fechaGasto).toISOString()
                }
            });
            addToast('Gasto actualizado', 'success');
            setEditGasto(null);
        } catch (err: unknown) {
            const apiError = err as ApiError;
            addToast(apiError?.message || 'Error al actualizar', 'error');
        }
    };

    const handleDeleteGasto = async (g: GastoVehiculo) => {
        await confirm({
            title: 'Anular Gasto',
            message: `¿Desea eliminar el registro de gasto por $${Number(g.monto).toLocaleString()}? Esta acción no se puede deshacer.`,
            type: 'danger',
            confirmLabel: 'Eliminar',
            onConfirm: async () => {
                await deleteGastoMutation.mutateAsync(g.id);
                addToast('Gasto eliminado', 'success');
            }
        });
    };

    const handleCreateCat = async () => {
        if (!catForm.nombre.trim()) return;
        try {
            await createCatMutation.mutateAsync(catForm);
            addToast('Rubro creado', 'success');
            setShowCreateCat(false);
            setCatForm({ nombre: '', descripcion: '' });
        } catch {
            addToast('Error al crear rubro', 'error');
        }
    };

    const handleUpdateCat = async () => {
        if (!editCat) return;
        try {
            await updateCatMutation.mutateAsync({ id: editCat.id, data: editCatForm });
            addToast('Rubro actualizado', 'success');
            setEditCat(null);
        } catch {
            addToast('Error al actualizar', 'error');
        }
    };

    const handleDeleteCat = async (c: GastoCategoria) => {
        await confirm({
            title: 'Eliminar Rubro',
            message: `¿Desea eliminar el rubro "${c.nombre}"? Solo podrá eliminar rubros que no tengan gastos asociados.`,
            type: 'danger',
            confirmLabel: 'Eliminar',
            onConfirm: async () => {
                try {
                    await deleteCatMutation.mutateAsync(c.id);
                    addToast('Rubro eliminado', 'success');
                } catch {
                    addToast('No se puede eliminar un rubro con gastos activos', 'error');
                }
            }
        });
    };

    // Los totales se acumulan por moneda: sumar ARS y USD en un solo número no
    // representa ningún importe real.
    const totalsInView = useMemo(() => {
        return gastos.reduce((acc: Record<string, number>, g: GastoVehiculo) => {
            const moneda = g.moneda || 'ARS';
            acc[moneda] = (acc[moneda] || 0) + Number(g.monto);
            return acc;
        }, {} as Record<string, number>);
    }, [gastos]);

    const gastoColumns: Column<GastoVehiculo>[] = [
        {
            header: 'Activo Vehicular',
            accessor: (g) => (
                <div className="flex flex-col">
                    <span className="font-bold text-white uppercase text-xs">
                        {g.vehiculo?.marca} {g.vehiculo?.modelo}
                    </span>
                    <span className="text-[10px] font-black text-accent tracking-widest">{g.vehiculo?.dominio || 'S/DOMINIO'}</span>
                </div>
            )
        },
        {
            header: 'Rubro',
            accessor: (g) => <Badge variant="info">{g.categoria?.nombre}</Badge>
        },
        {
            header: 'Fecha',
            accessor: (g) => (
                <div className="flex items-center gap-2 text-slate-400 text-xs font-bold">
                    <Calendar size={14} className="text-white/20" />
                    {formatFecha(g.fechaGasto)}
                </div>
            )
        },
        {
            header: 'Sede',
            accessor: (g) => (
                <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase">
                    <Building2 size={12} />
                    {g.sucursal?.nombre || 'Matriz'}
                </div>
            )
        },
        {
            header: 'Monto',
            accessor: (g) => (
                <div className="flex flex-col">
                    <span className="font-black text-white text-base">${Number(g.monto).toLocaleString()}</span>
                    <span className="text-[9px] font-bold text-slate-600 uppercase">{g.moneda}</span>
                </div>
            )
        },
        {
            header: 'Acciones',
            align: 'right',
            accessor: (g) => (
                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="icon-btn small" onClick={(e) => {
                        e.stopPropagation();
                        setEditGasto(g);
                        setEditGastoForm({
                            monto: String(g.monto),
                            descripcion: g.descripcion || '',
                            fechaGasto: g.fechaGasto.split('T')[0]
                        });
                    }}>
                        <Edit size={14} />
                    </button>
                    <button className="icon-btn small danger" onClick={(e) => { e.stopPropagation(); handleDeleteGasto(g); }}>
                        <Trash2 size={14} />
                    </button>
                </div>
            )
        }
    ];

    const catColumns: Column<GastoCategoria>[] = [
        {
            header: 'Nombre del Rubro',
            accessor: (c) => <span className="font-bold text-white uppercase text-xs">{c.nombre}</span>
        },
        {
            header: 'Descripción',
            accessor: (c) => <span className="text-xs text-slate-400">{c.descripcion || '-'}</span>
        },
        {
            header: 'Acciones',
            align: 'right',
            accessor: (c) => (
                <div className="flex justify-end gap-2">
                    <button className="icon-btn small" onClick={() => {
                        setEditCat(c);
                        setEditCatForm({ nombre: c.nombre, descripcion: c.descripcion || '' });
                    }}>
                        <Edit size={14} />
                    </button>
                    <button className="icon-btn small danger" onClick={() => handleDeleteCat(c)}>
                        <Trash2 size={14} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="page-container animate-fade-in">
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <Wrench size={22} />
                        </div>
                        <h1>Mantenimiento y Costos</h1>
                    </div>
                    <p>Auditoría técnica de erogaciones y puesta a punto de unidades.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => refetchGastos()}>
                        <RefreshCw size={18} className={loadingGastos ? 'animate-spin' : ''} />
                    </Button>
                    <Button variant="primary" onClick={() => setShowCreateGasto(true)}>
                        <Plus size={18} /> Registrar Gasto
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="card glass p-6 border-emerald-500/20 bg-emerald-500/5 col-span-1 md:col-span-2">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-[10px] font-black uppercase text-emerald-400 tracking-widest block mb-1">Inversión en Stock (Vista)</span>
                            <div className="text-3xl font-black text-white italic">
                                ${(totalsInView.ARS || 0).toLocaleString('es-AR')}
                                <span className="text-xs font-bold text-muted" style={{ marginLeft: '0.35rem' }}>ARS</span>
                            </div>
                            {totalsInView.USD ? (
                                <div className="text-xl font-black text-white/70 italic">
                                    ${totalsInView.USD.toLocaleString('es-AR')}
                                    <span className="text-xs font-bold text-muted" style={{ marginLeft: '0.35rem' }}>USD</span>
                                </div>
                            ) : null}
                        </div>
                        <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400">
                            <TrendingDown size={24} />
                        </div>
                    </div>
                </div>

                <div className="card glass p-6 border-slate-700/30 flex justify-between items-center col-span-1 md:col-span-2">
                    <div className="segmented" role="tablist">
                        <button
                            role="tab"
                            aria-selected={activeTab === 'gastos'}
                            onClick={() => setActiveTab('gastos')}
                            className={`segmented-btn ${activeTab === 'gastos' ? 'is-active' : ''}`}
                        >
                            <DollarSign size={14} /> Egresos
                        </button>
                        <button
                            role="tab"
                            aria-selected={activeTab === 'categorias'}
                            onClick={() => setActiveTab('categorias')}
                            className={`segmented-btn ${activeTab === 'categorias' ? 'is-active' : ''}`}
                        >
                            <Settings size={14} /> Rubros
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <div style={{ textAlign: 'right' }}>
                            <span className="text-xs text-muted" style={{ display: 'block', lineHeight: 1.2 }}>Categorías</span>
                            <span className="text-xl font-black">{catData.length}</span>
                        </div>
                        <Layers size={20} className="text-muted" />
                    </div>
                </div>
            </div>

            {activeTab === 'gastos' ? (
                <>
                    <div className="card glass filters-bar mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Buscar descripción..."
                                className="form-input pl-10 py-2 w-full text-xs"
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                            />
                        </div>
                        <select
                            className="bg-slate-900/50 border border-white/5 text-slate-400 text-xs font-bold rounded-xl px-4 py-2 outline-none"
                            value={filterVehiculo}
                            onChange={e => { setFilterVehiculo(e.target.value); setPage(1); }}
                        >
                            <option value="">Todas las Unidades</option>
                            {vehiculoData?.results?.map(v => (
                                <option key={v.id} value={v.id}>{v.marca} {v.modelo} ({v.dominio || 'S/D'})</option>
                            ))}
                        </select>

                        <select
                            className="bg-slate-900/50 border border-white/5 text-slate-400 text-xs font-bold rounded-xl px-4 py-2 outline-none"
                            value={filterCategoria}
                            onChange={e => { setFilterCategoria(e.target.value); setPage(1); }}
                        >
                            <option value="">Todos los Rubros</option>
                            {catData.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>

                        <select
                            className="bg-slate-900/50 border border-white/5 text-slate-400 text-xs font-bold rounded-xl px-4 py-2 outline-none"
                            value={filterSucursal}
                            onChange={e => { setFilterSucursal(e.target.value); setPage(1); }}
                        >
                            <option value="">Todas las Sedes</option>
                            {sucursalData.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                        </select>

                        <Button variant="secondary" onClick={() => { setSearchTerm(''); setFilterVehiculo(''); setFilterCategoria(''); setFilterSucursal(''); setPage(1); }}>
                            Limpiar Filtros
                        </Button>
                    </div>

                    <DataTable
                        columns={gastoColumns}
                        data={gastos}
                        isLoading={loadingGastos}
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        emptyMessage="No se detectaron egresos operativos"
                    />
                </>
            ) : (
                <div className="max-w-4xl mx-auto space-y-6">
                    <div className="card glass p-8 flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-black text-white uppercase italic tracking-tight">Rubros Técnicos</h2>
                            <p className="text-sm text-slate-500">Clasificación operativa para auditoría de costos.</p>
                        </div>
                        <Button variant="primary" onClick={() => setShowCreateCat(true)}>
                            <Plus size={18} /> Nuevo Rubro
                        </Button>
                    </div>

                    <DataTable
                        columns={catColumns}
                        data={catData}
                        isLoading={loadingCat}
                        emptyMessage="No hay rubros definidos"
                    />
                </div>
            )}

            {/* Modal Gasto */}
            <Modal
                isOpen={showCreateGasto || !!editGasto}
                onClose={() => { setShowCreateGasto(false); setEditGasto(null); }}
                title={editGasto ? 'Editar Registro de Gasto' : 'Nuevo Egreso Vehicular'}
                maxWidth="600px"
            >
                <div className="space-y-6">
                    {!editGasto && (
                        <>
                            <div className="form-group">
                                <label className="form-label">Unidad de Stock *</label>
                                <select
                                    className="form-input"
                                    value={gastoForm.vehiculoId}
                                    onChange={e => setGastoForm(f => ({ ...f, vehiculoId: e.target.value }))}
                                >
                                    <option value="">Seleccionar vehículo...</option>
                                    {vehiculoData?.results?.map(v => (
                                        <option key={v.id} value={v.id}>{v.marca} {v.modelo} ({v.dominio || 'S/D'})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">Rubro / Concepto *</label>
                                    <select
                                        className="form-input"
                                        value={gastoForm.categoriaId}
                                        onChange={e => setGastoForm(f => ({ ...f, categoriaId: e.target.value }))}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {catData.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                    </select>
                                </div>
                            </div>
                        </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-group">
                            <label className="form-label">Importe *</label>
                            <div className="relative">
                                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="number"
                                    className="form-input pl-10"
                                    value={editGasto ? editGastoForm.monto : gastoForm.monto}
                                    onChange={e => editGasto ? setEditGastoForm(f => ({ ...f, monto: e.target.value })) : setGastoForm(f => ({ ...f, monto: e.target.value }))}
                                />
                            </div>
                        </div>
                        {!editGasto && (
                            <div className="form-group">
                                <label className="form-label">Moneda *</label>
                                <select
                                    className="form-input"
                                    value={gastoForm.moneda}
                                    onChange={e => setGastoForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}
                                >
                                    <option value="ARS">ARS - Pesos</option>
                                    <option value="USD">USD - Dólares</option>
                                </select>
                            </div>
                        )}
                        <div className="form-group">
                            <label className="form-label">Fecha de Ejecución *</label>
                            <input
                                type="date"
                                className="form-input"
                                value={editGasto ? editGastoForm.fechaGasto : gastoForm.fechaGasto}
                                onChange={e => editGasto ? setEditGastoForm(f => ({ ...f, fechaGasto: e.target.value })) : setGastoForm(f => ({ ...f, fechaGasto: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Descripción / Justificación</label>
                        <textarea
                            className="form-input min-h-[100px]"
                            placeholder="Detalles sobre el mantenimiento, repuestos, etc..."
                            value={editGasto ? editGastoForm.descripcion : gastoForm.descripcion}
                            onChange={e => editGasto ? setEditGastoForm(f => ({ ...f, descripcion: e.target.value })) : setGastoForm(f => ({ ...f, descripcion: e.target.value }))}
                        />
                    </div>

                    <div className="form-actions pt-4">
                        <Button variant="secondary" onClick={() => { setShowCreateGasto(false); setEditGasto(null); }}>Cancelar</Button>
                        <Button
                            variant="primary"
                            onClick={editGasto ? handleUpdateGasto : handleCreateGasto}
                            loading={createGastoMutation.isPending || updateGastoMutation.isPending}
                        >
                            {editGasto ? 'Guardar Cambios' : 'Registrar Gasto'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Modal Categoría */}
            <Modal
                isOpen={showCreateCat || !!editCat}
                onClose={() => { setShowCreateCat(false); setEditCat(null); }}
                title={editCat ? 'Editar Rubro' : 'Nuevo Rubro Técnico'}
                maxWidth="440px"
            >
                <div className="space-y-6">
                    <div className="form-group">
                        <label className="form-label">Nombre del Rubro *</label>
                        <Input
                            value={editCat ? editCatForm.nombre : catForm.nombre}
                            onChange={e => editCat ? setEditCatForm(f => ({ ...f, nombre: e.target.value })) : setCatForm(f => ({ ...f, nombre: e.target.value }))}
                            placeholder="Ej: Pintura, Mecánica..."
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Descripción</label>
                        <textarea
                            className="form-input min-h-[80px]"
                            value={editCat ? editCatForm.descripcion : catForm.descripcion}
                            onChange={e => editCat ? setEditCatForm(f => ({ ...f, descripcion: e.target.value })) : setCatForm(f => ({ ...f, descripcion: e.target.value }))}
                            placeholder="Breve descripción del alcance..."
                        />
                    </div>
                    <div className="form-actions pt-4">
                        <Button variant="secondary" onClick={() => { setShowCreateCat(false); setEditCat(null); }}>Cancelar</Button>
                        <Button
                            variant="primary"
                            onClick={editCat ? handleUpdateCat : handleCreateCat}
                            loading={createCatMutation.isPending || updateCatMutation.isPending}
                        >
                            {editCat ? 'Guardar Cambios' : 'Crear Rubro'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default GastosPage;
