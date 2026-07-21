import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { vehiculoIngresosApi, type IngresoVehiculo, type TipoIngreso } from '../../api/vehiculo-ingresos.api';
import { vehiculosApi } from '../../api/vehiculos.api';
import { sucursalesApi } from '../../api/sucursales.api';
import { useUIStore } from '../../store/uiStore';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import {
    Plus, Trash2, RefreshCw,
    LogIn, ChevronLeft, ChevronRight,
    Building2, Car, Calendar, User,
    ArrowDownLeft
} from 'lucide-react';

const TIPO_INGRESO_OPTS: { value: TipoIngreso; label: string }[] = [
    { value: 'compra_proveedor', label: 'Compra Proveedor' },
    { value: 'compra_particular', label: 'Compra Particular' },
    { value: 'permuta', label: 'Permuta' },
    { value: 'consignacion', label: 'Consignación' },
    { value: 'otro', label: 'Otro' },
];

const TIPO_BADGE_VARIANT: Record<TipoIngreso, 'info' | 'success' | 'warning' | 'default'> = {
    compra_proveedor: 'info',
    compra_particular: 'success',
    permuta: 'warning',
    consignacion: 'default',
    otro: 'default',
};

function tipoLabel(tipo: TipoIngreso) {
    return TIPO_INGRESO_OPTS.find(o => o.value === tipo)?.label ?? tipo;
}

const IngresosPage = () => {
    const { addToast } = useUIStore();
    const navigate = useNavigate();

    // List state
    const [ingresos, setIngresos] = useState<IngresoVehiculo[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Filters
    const [filterSucursal, setFilterSucursal] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [filterVehiculo, setFilterVehiculo] = useState('');

    // Catalog data (para los filtros)
    const [sucursales, setSucursales] = useState<{ id: number; nombre: string }[]>([]);
    const [vehiculos, setVehiculos] = useState<{ id: number; marca: string; modelo: string; dominio?: string }[]>([]);

    // Delete confirm
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Load catalog data once
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [sucRes, vehRes] = await Promise.all([
                    sucursalesApi.getAll(),
                    vehiculosApi.getAll({}, { limit: 1000 }),
                ]);
                type Res<T> = { data?: { results?: T[] } | T[] };
                const getList = <T,>(r: unknown): T[] => {
                    const d = (r as Res<T>)?.data;
                    return Array.isArray((d as { results?: T[] })?.results) ? (d as { results: T[] }).results : Array.isArray(d) ? d : [];
                };
                setSucursales(getList<{ id: number; nombre: string }>(sucRes));
                setVehiculos(getList<{ id: number; marca: string; modelo: string; dominio?: string }>(vehRes));
            } catch {
                // error silencioso
            }
        };
        loadInitialData();
    }, []);

    const loadIngresos = useCallback(async (pg = page) => {
        setLoading(true);
        try {
            const params: Record<string, unknown> = { page: pg, limit: 15 };
            if (filterSucursal) params.sucursalId = Number(filterSucursal);
            if (filterTipo) params.tipoIngreso = filterTipo;
            if (filterVehiculo) params.vehiculoId = Number(filterVehiculo);

            const res = await vehiculoIngresosApi.getAll(params);
            const r = res as { data?: { results?: IngresoVehiculo[]; totalPages?: number }; results?: IngresoVehiculo[]; totalPages?: number };
            setIngresos(r?.data?.results ?? r?.results ?? []);
            setTotalPages(r?.data?.totalPages ?? r?.totalPages ?? 1);
        } catch {
            addToast('Error al cargar ingresos', 'error');
        } finally {
            setLoading(false);
        }
    }, [page, filterSucursal, filterTipo, filterVehiculo, addToast]);

    useEffect(() => {
        loadIngresos(page);
    }, [page, filterSucursal, filterTipo, filterVehiculo, loadIngresos]);

    const handleClear = () => {
        setFilterSucursal('');
        setFilterTipo('');
        setFilterVehiculo('');
        setPage(1);
    };

    const handleDelete = async () => {
        if (!deletingId) return;
        setDeleteLoading(true);
        try {
            await vehiculoIngresosApi.delete(deletingId);
            addToast('Registro de ingreso eliminado', 'success');
            setDeletingId(null);
            loadIngresos(page);
        } catch {
            addToast('Error al eliminar ingreso', 'error');
        } finally {
            setDeleteLoading(false);
        }
    };

    return (
        <div className="page-container animate-fade-in">
            {/* Header section */}
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow-primary">
                            <LogIn size={20} />
                        </div>
                        <h1>Ingresos Vehiculares</h1>
                    </div>
                    <p>Gestión de alta de unidades y adquisición de stock por diversas modalidades.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => loadIngresos(page)}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </Button>
                    <Button variant="primary" onClick={() => navigate('/vehiculos/nuevo')}>
                        <Plus size={18} /> Ingresar Vehículo
                    </Button>
                </div>
            </header>

            {/* Filters Bar */}
            <div className="card glass filters-bar flex flex-wrap items-end gap-6">
                <div className="flex-1 min-w-[200px]">
                    <label className="form-label-xs text-blue-400">Tipo de Adquisición</label>
                    <select className="form-input-select w-full" value={filterTipo} onChange={e => { setFilterTipo(e.target.value); setPage(1); }}>
                        <option value="">TODAS LAS MODALIDADES</option>
                        {TIPO_INGRESO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label.toUpperCase()}</option>)}
                    </select>
                </div>
                <div className="min-w-[200px]">
                    <label className="form-label-xs">Sucursal Receptora</label>
                    <select className="form-input-select w-full" value={filterSucursal} onChange={e => { setFilterSucursal(e.target.value); setPage(1); }}>
                        <option value="">TODAS LAS SUCURSALES</option>
                        {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre.toUpperCase()}</option>)}
                    </select>
                </div>
                <div className="min-w-[220px]">
                    <label className="form-label-xs">Buscar Unidad</label>
                    <select className="form-input-select w-full" value={filterVehiculo} onChange={e => { setFilterVehiculo(e.target.value); setPage(1); }}>
                        <option value="">TODOS LOS VEHÍCULOS</option>
                        {vehiculos.map(v => <option key={v.id} value={v.id}>{`${v.marca} ${v.modelo} ${v.dominio || ''}`.toUpperCase()}</option>)}
                    </select>
                </div>
                <div className="flex gap-2 mb-[2px]">
                    <Button variant="secondary" onClick={handleClear} title="Limpiar filtros">
                        <RefreshCw size={18} />
                    </Button>
                </div>
            </div>

            {/* Table or Empty Slate */}
            <div className="table-container card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Unidad Registrada</th>
                            <th>Modalidad</th>
                            <th>Ubicación Actual</th>
                            <th>Fecha de Ingreso</th>
                            <th>Valorización</th>
                            <th>Origen del Activo</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ padding: '8rem', textAlign: 'center' }}><RefreshCw className="animate-spin text-accent mx-auto" size={40} /></td></tr>
                        ) : ingresos.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="flex flex-col items-center py-20 text-muted">
                                        <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mb-4 ring-1 ring-slate-700">
                                            <ArrowDownLeft size={40} className="text-slate-600" />
                                        </div>
                                        <p className="text-xl font-black text-slate-400">Sin ingresos registrados</p>
                                        <p className="text-sm font-medium">No hay registros que coincidan con los criterios de búsqueda.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : ingresos.map(i => (
                            <tr key={i.id}>
                                <td>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-blue-400 shadow-inner ring-1 ring-slate-700">
                                            <Car size={18} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-white leading-tight">
                                                {i.vehiculo ? `${i.vehiculo.marca} ${i.vehiculo.modelo}` : `Vehículo #${i.vehiculoId}`}
                                            </span>
                                            <span className="text-[10px] font-black text-blue-500/80 uppercase tracking-widest">{i.vehiculo?.dominio || 'S/PATENTE'}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <Badge variant={TIPO_BADGE_VARIANT[i.tipoIngreso]}>{tipoLabel(i.tipoIngreso).toUpperCase()}</Badge>
                                </td>
                                <td>
                                    <div className="flex items-center gap-2">
                                        <Building2 size={12} className="text-muted" />
                                        <span className="text-xs font-bold text-slate-300">{i.sucursal?.nombre ?? 'ALMACÉN CENTRAL'}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <Calendar size={14} />
                                        <span className="text-sm font-bold">
                                            {i.fechaIngreso ? new Date(i.fechaIngreso).toLocaleDateString('es-AR') : '-'}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-[10px] font-black text-muted">$</span>
                                        <span className="font-black text-white text-lg tabular-nums">
                                            {Number(i.valorTomado || 0).toLocaleString('es-AR')}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 border border-slate-700">
                                            <User size={14} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-slate-200 uppercase truncate max-w-[120px]">
                                                {i.clienteOrigen?.nombre ?? i.proveedorOrigen?.nombre ?? 'NOT IDENTIFIED'}
                                            </span>
                                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded w-fit ${i.clienteOrigen ? 'bg-green-900/20 text-green-500' : i.proveedorOrigen ? 'bg-blue-900/20 text-blue-500' : 'bg-slate-800 text-slate-500'}`}>
                                                {i.clienteOrigen ? 'Cliente Part.' : i.proveedorOrigen ? 'Proveedor Stock' : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <button className="icon-btn danger" onClick={() => setDeletingId(i.id)} title="Eliminar"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex justify-center items-center gap-6 mt-8">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    <ChevronLeft size={16} /> Anterior
                </Button>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted font-black uppercase tracking-tighter">Página</span>
                    <span className="w-9 h-9 bg-accent text-white rounded-xl flex items-center justify-center font-black text-sm shadow-lg shadow-accent/20">{page}</span>
                    <span className="text-[10px] text-muted font-black uppercase tracking-tighter">de {totalPages}</span>
                </div>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                    Siguiente <ChevronRight size={16} />
                </Button>
            </div>

            <ConfirmDialog
                isOpen={deletingId !== null}
                title="Anular Ingreso"
                message={`¿Anular el ingreso #${deletingId}? Esta acción impactará en la disponibilidad de stock.`}
                confirmLabel="Confirmar baja"
                cancelLabel="Cerrar"
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeletingId(null)}
                loading={deleteLoading}
            />

            <style>{`
                .icon-badge {
                    width: 44px;
                    height: 44px;
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(59, 130, 246, 0.1);
                    color: #3b82f6;
                }
                .shadow-glow-primary { box-shadow: 0 0 20px rgba(59, 130, 246, 0.2); }
                
                .form-label-xs {
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    margin-bottom: 0.5rem;
                    display: block;
                    letter-spacing: 0.1em;
                }
                .form-input-select {
                    padding: 0.75rem 2.5rem 0.75rem 1rem;
                    border-radius: 1rem;
                    border: 1px solid var(--border);
                    background: var(--bg-primary);
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    appearance: none;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 1rem center;
                    text-transform: uppercase;
                }
                .filters-bar {
                    padding: 1.5rem !important;
                    background: rgba(15, 23, 42, 0.4) !important;
                    border: 1px solid rgba(255,255,255,0.05) !important;
                }
                .icon-btn {
                    padding: 0.6rem;
                    border-radius: 12px;
                    background: var(--bg-secondary);
                    color: var(--text-secondary);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    border: 1px solid var(--border);
                }
                .icon-btn:hover {
                    background: #ef4444;
                    color: white;
                    border-color: #ef4444;
                    transform: scale(1.05);
                }
            `}</style>
        </div>
    );
};

export default IngresosPage;
