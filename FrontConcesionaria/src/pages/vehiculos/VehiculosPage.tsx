import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVehiculos, useChangeVehiculoEstado, useDeleteVehiculo } from '../../hooks/useVehiculos';
import { useSucursales } from '../../hooks/useSucursales';
import { useConfirm } from '../../hooks/useConfirm';
import { useDebounce } from '../../hooks/useDebounce';
import type { Vehiculo, EstadoVehiculo, TipoVehiculo } from '../../types/vehiculo.types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { useUIStore } from '../../store/uiStore';
import {
    Plus, Search, Edit, Trash2,
    RefreshCw, Car, ChevronDown, Calendar, Database, MapPin, DollarSign
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import DataTable, { type Column } from '../../components/ui/DataTable';
import PageTitle from '../../components/ui/PageTitle';
import type { ApiError } from '../../types/api.types';

const STATUS_MAP: Record<EstadoVehiculo, { label: string; variant: 'warning' | 'success' | 'info' | 'default' | 'danger' }> = {
    preparacion: { label: 'En Preparación', variant: 'warning' },
    publicado: { label: 'Publicado', variant: 'success' },
    reservado: { label: 'Reservado', variant: 'info' },
    vendido: { label: 'Vendido', variant: 'default' },
    devuelto: { label: 'Devuelto', variant: 'danger' },
};

const NEXT_ESTADOS: Record<EstadoVehiculo, EstadoVehiculo[]> = {
    preparacion: ['publicado'],
    publicado: ['preparacion', 'reservado'],
    reservado: ['publicado', 'vendido'],
    vendido: ['devuelto'],
    devuelto: ['preparacion', 'publicado'],
};

const VehiculosPage: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useUIStore();
    const confirm = useConfirm();

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 500);
    const [filterEstado, setFilterEstado] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [filterSucursal, setFilterSucursal] = useState('');
    const [page, setPage] = useState(1);

    const { data: sucursales = [] } = useSucursales();

    const { data: payload, isLoading: loading, refetch } = useVehiculos({
        search: debouncedSearch || undefined,
        estado: filterEstado ? (filterEstado as EstadoVehiculo) : undefined,
        tipo: filterTipo ? (filterTipo as TipoVehiculo) : undefined,
        sucursalId: filterSucursal ? Number(filterSucursal) : undefined,
    }, { page, limit: 10 });

    const vehiculos = payload?.results || [];
    const totalPages = payload?.totalPages || 1;

    const changeEstadoMutation = useChangeVehiculoEstado();
    const deleteMutation = useDeleteVehiculo();

    const [estadoModal, setEstadoModal] = useState<{ vehiculo: Vehiculo } | null>(null);
    const [nuevoEstado, setNuevoEstado] = useState<EstadoVehiculo | ''>('');

    const handleDelete = async (v: Vehiculo) => {
        await confirm({
            title: 'Baja de Unidad',
            message: `¿Desea retirar permanentemente el vehículo ${v.marca} ${v.modelo} [${v.dominio || 'S/D'}] del stock operativo?`,
            type: 'danger',
            confirmLabel: 'Confirmar Baja',
            onConfirm: async () => {
                await deleteMutation.mutateAsync(v.id);
                addToast('Vehículo eliminado del stock', 'success');
            }
        });
    };

    const openEstadoModal = (v: Vehiculo) => {
        setEstadoModal({ vehiculo: v });
        setNuevoEstado('');
    };

    const handleCambiarEstado = async () => {
        if (!estadoModal || !nuevoEstado) return;
        try {
            await changeEstadoMutation.mutateAsync({ id: estadoModal.vehiculo.id, estado: nuevoEstado as EstadoVehiculo });
            addToast(`Estado cambiado a "${STATUS_MAP[nuevoEstado as EstadoVehiculo].label}"`, 'success');
            setEstadoModal(null);
        } catch (err: unknown) {
            const apiError = err as ApiError;
            addToast(apiError?.message || 'Error al cambiar estado', 'error');
        }
    };

    const columns: Column<Vehiculo>[] = [
        {
            header: 'Vehículo',
            accessor: (v) => (
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-white px-2 py-0.5 bg-accent/20 border border-accent/30 rounded-lg">
                            {v.dominio || 'SIN DOMINIO'}
                        </span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${v.tipo === 'CERO_KM' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                            {v.tipo === 'CERO_KM' ? '0 KM' : 'Usado'}
                        </span>
                    </div>
                    <span className="font-bold text-white uppercase">{v.marca} {v.modelo}</span>
                    <span className="text-[10px] text-slate-500 uppercase font-bold">{v.version || '-'}</span>
                </div>
            )
        },
        {
            header: 'Info',
            accessor: (v) => (
                <div className="flex flex-col gap-1 text-slate-400">
                    <div className="flex items-center gap-2">
                        <Calendar size={12} className="text-accent/60" />
                        <span className="text-[11px] font-bold uppercase">{v.anio || 'S/A'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Database size={12} className="text-accent/60" />
                        <span className="text-[11px] font-bold">{v.kmIngreso ? `${v.kmIngreso.toLocaleString()} KM` : '0 KM'}</span>
                    </div>
                </div>
            )
        },
        {
            header: 'Ubicación',
            accessor: (v) => (
                <div className="flex items-center gap-2 text-slate-400">
                    <MapPin size={14} className="text-accent/60" />
                    <span className="text-xs font-bold truncate">{v.sucursal?.nombre || 'Sede Central'}</span>
                </div>
            )
        },
        {
            header: 'Precio',
            accessor: (v) => (
                <div className="flex items-center gap-1 text-white">
                    <DollarSign size={14} className="text-emerald-400" />
                    <span className="text-sm font-black italic">
                        {v.precioLista
                            ? `${v.moneda === 'USD' ? 'US$' : '$'}${Number(v.precioLista).toLocaleString('es-AR')}`
                            : '-'}
                    </span>
                </div>
            )
        },
        {
            header: 'Estado',
            accessor: (v) => (
                <div className="flex items-center gap-2 group/status cursor-pointer" onClick={(e) => { e.stopPropagation(); openEstadoModal(v); }}>
                    <Badge variant={STATUS_MAP[v.estado].variant}>{STATUS_MAP[v.estado].label}</Badge>
                    <ChevronDown size={14} className="text-slate-600 group-hover/status:text-slate-400 transition-colors" />
                </div>
            )
        },
        {
            header: 'Acciones',
            align: 'right',
            accessor: (v) => (
                <div className="flex gap-2 justify-end">
                    <button className="icon-btn small" title="Editar" onClick={(e) => { e.stopPropagation(); navigate(`/vehiculos/${v.id}/editar`); }}>
                        <Edit size={14} />
                    </button>
                    <button className="icon-btn small danger" title="Dar de baja" onClick={(e) => { e.stopPropagation(); handleDelete(v); }}>
                        <Trash2 size={14} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Vehículos" />
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <Car size={22} />
                        </div>
                        <h1>Parque de Unidades</h1>
                    </div>
                    <p>Gestión estratégica de inventario, disponibilidad y logística interna.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => refetch()} disabled={loading}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </Button>
                    <Button variant="primary" onClick={() => navigate('/vehiculos/nuevo')}>
                        <Plus size={18} />
                        Ingresar Vehículo
                    </Button>
                </div>
            </header>

            <div className="filters-bar">
                <div className="filter-group">
                    <label className="filter-label">Buscar</label>
                    <div className="search-box">
                        <Search size={16} className="text-muted" />
                        <input
                            type="text"
                            placeholder="Marca, modelo, dominio..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="filter-group">
                    <label className="filter-label">Estado</label>
                    <select className="form-input" value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
                        <option value="">Todos los estados</option>
                        {(Object.keys(STATUS_MAP) as EstadoVehiculo[]).map(k => (
                            <option key={k} value={k}>{STATUS_MAP[k].label}</option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <label className="filter-label">Tipo</label>
                    <select className="form-input" value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
                        <option value="">Todos los tipos</option>
                        <option value="USADO">Usado</option>
                        <option value="CERO_KM">0 KM</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label className="filter-label">Sucursal</label>
                    <select className="form-input" value={filterSucursal} onChange={e => setFilterSucursal(e.target.value)}>
                        <option value="">Todas las sedes</option>
                        {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                </div>
            </div>

            <DataTable
                columns={columns}
                data={vehiculos}
                isLoading={loading}
                emptyMessage="No se detectaron unidades registradas"
                emptyIcon={<Car size={48} className="opacity-20" />}
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                onRowClick={(v) => navigate(`/vehiculos/${v.id}`)}
            />

            {/* Modales Reutilizados */}
            <Modal
                isOpen={!!estadoModal}
                onClose={() => setEstadoModal(null)}
                title="Ciclo de Vida de Unidad"
                maxWidth="440px"
            >
                {estadoModal && (
                    <div className="space-y-6">
                        <div className="p-4 bg-slate-900/50 border border-white/5 rounded-2xl">
                            <h4 className="text-sm font-black text-white uppercase tracking-tight">{estadoModal.vehiculo.marca} {estadoModal.vehiculo.modelo}</h4>
                            <p className="text-[10px] font-mono text-accent">ID REGISTRO: #{estadoModal.vehiculo.id.toString().padStart(5, '0')}</p>
                        </div>
                        <div>
                            <label className="text-sm font-bold text-slate-400 mb-3 block">Transicionar a la siguiente fase:</label>
                            <select
                                className="w-full p-4 bg-slate-900 border border-white/10 rounded-2xl text-white outline-none focus:border-accent transition-all cursor-pointer"
                                value={nuevoEstado}
                                onChange={e => setNuevoEstado(e.target.value as EstadoVehiculo)}
                            >
                                <option value="">Seleccionar nuevo estado...</option>
                                {NEXT_ESTADOS[estadoModal.vehiculo.estado as EstadoVehiculo]?.map((e: EstadoVehiculo) => (
                                    <option key={e} value={e}>{STATUS_MAP[e].label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-actions pt-4">
                            <Button variant="secondary" onClick={() => setEstadoModal(null)}>Cancelar</Button>
                            <Button variant="primary" onClick={handleCambiarEstado} loading={changeEstadoMutation.isPending} disabled={!nuevoEstado}>
                                Confirmar Cambio
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default VehiculosPage;
