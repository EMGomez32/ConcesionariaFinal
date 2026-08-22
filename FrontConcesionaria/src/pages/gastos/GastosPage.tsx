import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGastos, useCreateGasto, useUpdateGasto, useDeleteGasto } from '../../hooks/useGastos';
import { useVehiculos } from '../../hooks/useVehiculos';
import { useSucursales } from '../../hooks/useSucursales';
import { useConfirm } from '../../hooks/useConfirm';
import { useUIStore } from '../../store/uiStore';
import { useDebounce } from '../../hooks/useDebounce';
import { formatFecha } from '../../utils/fecha';
import { proveedoresApi } from '../../api/proveedores.api';
import type { GastoVehiculo } from '../../api/gastos.api';
import type { ApiError } from '../../types/api.types';

import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import DataTable, { type Column } from '../../components/ui/DataTable';

import {
    Wrench, Plus, Trash2, Edit, RefreshCw,
    DollarSign, Calendar, Building2,
    TrendingDown, Search
} from 'lucide-react';

const EMPTY_GASTO_FORM = {
    vehiculoId: '',
    proveedorId: '',
    monto: '',
    moneda: 'ARS' as 'ARS' | 'USD',
    fechaGasto: new Date().toISOString().split('T')[0],
    descripcion: '',
};

const GastosPage: React.FC = () => {
    const { addToast } = useUIStore();
    const confirm = useConfirm();

    const [page, setPage] = useState(1);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 500);
    const [filterVehiculo, setFilterVehiculo] = useState('');
    const [filterProveedor, setFilterProveedor] = useState('');
    const [filterSucursal, setFilterSucursal] = useState('');

    // Queries
    const { data: sucursalData = [] } = useSucursales();
    const { data: vehiculoData } = useVehiculos({}, { limit: 1000 });
    // Proveedores: reemplazan a los rubros como clasificación del gasto. Se
    // gestionan en el módulo Proveedores (/proveedores); acá sólo se listan.
    const { data: provPayload } = useQuery({
        queryKey: ['proveedores', 'all'],
        queryFn: () => proveedoresApi.getAll({}, { limit: 1000 }),
    });
    const proveedores = useMemo(() => provPayload?.results || [], [provPayload?.results]);

    const { data: payload, isLoading: loadingGastos, refetch: refetchGastos } = useGastos({
        tipo: 'VEHICULO',
        page,
        limit: 15,
        vehiculoId: filterVehiculo ? Number(filterVehiculo) : undefined,
        proveedorId: filterProveedor ? Number(filterProveedor) : undefined,
        sucursalId: filterSucursal ? Number(filterSucursal) : undefined,
        descripcion: debouncedSearch || undefined
    });

    const gastos = useMemo(() => payload?.results || [], [payload?.results]);
    const totalPages = payload?.totalPages || 1;

    // Mutations
    const createGastoMutation = useCreateGasto();
    const updateGastoMutation = useUpdateGasto();
    const deleteGastoMutation = useDeleteGasto();

    // Modals State
    const [showCreateGasto, setShowCreateGasto] = useState(false);
    const [gastoForm, setGastoForm] = useState({ ...EMPTY_GASTO_FORM });

    const [editGasto, setEditGasto] = useState<GastoVehiculo | null>(null);
    const [editGastoForm, setEditGastoForm] = useState({ monto: '', descripcion: '', fechaGasto: '' });

    // Handlers
    const handleCreateGasto = async () => {
        if (!gastoForm.vehiculoId || !gastoForm.proveedorId || !gastoForm.monto) {
            addToast('Complete vehículo, proveedor e importe', 'error');
            return;
        }
        try {
            // La sede del gasto la determina el vehículo: no se envía sucursalId.
            await createGastoMutation.mutateAsync({
                vehiculoId: Number(gastoForm.vehiculoId),
                proveedorId: Number(gastoForm.proveedorId),
                monto: parseFloat(gastoForm.monto),
                moneda: gastoForm.moneda,
                fechaGasto: new Date(gastoForm.fechaGasto).toISOString(),
                descripcion: gastoForm.descripcion,
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
                    <span className="font-bold uppercase text-xs">
                        {g.vehiculo?.marca} {g.vehiculo?.modelo}
                    </span>
                    <span className="text-3xs font-black text-accent tracking-widest">{g.vehiculo?.dominio || 'S/DOMINIO'}</span>
                </div>
            )
        },
        {
            header: 'Proveedor',
            // Nuevo criterio: se clasifica por proveedor. Los gastos viejos no
            // tienen proveedor pero sí rubro → se muestra como fallback.
            accessor: (g) => (
                g.proveedor?.nombre
                    ? <Badge variant="info">{g.proveedor.nombre}</Badge>
                    : g.categoria?.nombre
                        ? <Badge variant="default">{g.categoria.nombre}</Badge>
                        : <span className="text-secondary text-xs">—</span>
            )
        },
        {
            header: 'Fecha',
            accessor: (g) => (
                <div className="flex items-center gap-2 text-muted text-xs font-bold">
                    <Calendar size={14} />
                    {formatFecha(g.fechaGasto)}
                </div>
            )
        },
        {
            header: 'Sede',
            accessor: (g) => (
                <div className="flex items-center gap-2 text-muted text-3xs font-black uppercase">
                    <Building2 size={12} />
                    {g.sucursal?.nombre || 'Matriz'}
                </div>
            )
        },
        {
            header: 'Monto',
            accessor: (g) => (
                <div className="flex flex-col">
                    <span className="font-black text-base">${Number(g.monto).toLocaleString()}</span>
                    <span className="text-3xs font-bold text-secondary uppercase">{g.moneda}</span>
                </div>
            )
        },
        {
            header: 'Acciones',
            align: 'right',
            accessor: (g) => (
                <div className="flex justify-end gap-1">
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

            <div className="grid grid-cols-1 gap-6">
                <div className="card glass">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-3xs font-black uppercase text-accent tracking-widest mb-1">Inversión en Stock (Vista)</span>
                            <div className="text-3xl font-black italic">
                                ${(totalsInView.ARS || 0).toLocaleString('es-AR')}
                                <span className="text-xs font-bold text-muted" style={{ marginLeft: '0.35rem' }}>ARS</span>
                            </div>
                            {totalsInView.USD ? (
                                <div className="text-xl font-black italic">
                                    ${totalsInView.USD.toLocaleString('es-AR')}
                                    <span className="text-xs font-bold text-muted" style={{ marginLeft: '0.35rem' }}>USD</span>
                                </div>
                            ) : null}
                        </div>
                        <div className="text-accent">
                            <TrendingDown size={24} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="card glass filters-bar mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                    <Search size={16} className="text-muted" />
                    <input
                        type="text"
                        placeholder="Buscar descripción..."
                        className="form-input w-full text-xs"
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                    />
                </div>
                <select
                    className="text-muted text-xs font-bold"
                    value={filterVehiculo}
                    onChange={e => { setFilterVehiculo(e.target.value); setPage(1); }}
                >
                    <option value="">Todas las Unidades</option>
                    {vehiculoData?.results?.map(v => (
                        <option key={v.id} value={v.id}>{v.marca} {v.modelo} ({v.dominio || 'S/D'})</option>
                    ))}
                </select>

                <select
                    className="text-muted text-xs font-bold"
                    value={filterProveedor}
                    onChange={e => { setFilterProveedor(e.target.value); setPage(1); }}
                >
                    <option value="">Todos los Proveedores</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>

                <select
                    className="text-muted text-xs font-bold"
                    value={filterSucursal}
                    onChange={e => { setFilterSucursal(e.target.value); setPage(1); }}
                >
                    <option value="">Todas las Sedes</option>
                    {sucursalData.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>

                <Button variant="secondary" onClick={() => { setSearchTerm(''); setFilterVehiculo(''); setFilterProveedor(''); setFilterSucursal(''); setPage(1); }}>
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

            {/* Modal Gasto */}
            <Modal
                isOpen={showCreateGasto || !!editGasto}
                onClose={() => { setShowCreateGasto(false); setEditGasto(null); }}
                title={editGasto ? 'Editar Registro de Gasto' : 'Nuevo Egreso Vehicular'}
                maxWidth="600px"
            >
                <div>
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

                            <div className="form-group">
                                <label className="form-label">Proveedor *</label>
                                <select
                                    className="form-input"
                                    value={gastoForm.proveedorId}
                                    onChange={e => setGastoForm(f => ({ ...f, proveedorId: e.target.value }))}
                                >
                                    <option value="">Seleccionar proveedor...</option>
                                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                </select>
                                {proveedores.length === 0 && (
                                    <p className="text-2xs text-muted">
                                        No hay proveedores cargados. Agregalos en la sección Proveedores.
                                    </p>
                                )}
                            </div>
                        </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-group">
                            <label className="form-label">Importe *</label>
                            <div>
                                <DollarSign size={16} className="text-muted" />
                                <input
                                    type="number"
                                    className="form-input"
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
                            className="form-input"
                            placeholder="Detalles sobre el mantenimiento, repuestos, etc..."
                            value={editGasto ? editGastoForm.descripcion : gastoForm.descripcion}
                            onChange={e => editGasto ? setEditGastoForm(f => ({ ...f, descripcion: e.target.value })) : setGastoForm(f => ({ ...f, descripcion: e.target.value }))}
                        />
                    </div>

                    <div className="form-actions">
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
        </div>
    );
};

export default GastosPage;
