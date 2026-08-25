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
import { usePermisos } from '../../hooks/usePermisos';
import { getErrorMessage } from '../../utils/getErrorMessage';

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
    // Anular un ingreso es del admin (borra el acta con su monto de compra); darlo
    // de alta es de admin/vendedor. Ver hooks/usePermisos.ts.
    const permisos = usePermisos();

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
        } catch (err) {
            // `catch (err)` y no `catch {`: el interceptor de api/client.ts rechaza con
            // el body ya desempaquetado, así que el motivo real del backend viaja en
            // `err.message`. Descartarlo convertía un "no tenés permiso" en un
            // "Error al eliminar ingreso", y el usuario abría un ticket creyendo que
            // el servidor estaba caído.
            addToast(getErrorMessage(err, 'Error al eliminar ingreso'), 'error');
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
                    {permisos.ingresosCrear && (
                        <Button variant="primary" onClick={() => navigate('/vehiculos/nuevo')}>
                            <Plus size={18} /> Ingresar Vehículo
                        </Button>
                    )}
                </div>
            </header>

            {/* Filters Bar */}
            <div className="card glass filters-bar flex flex-wrap items-end gap-6">
                <div className="flex-1">
                    <label className="form-label-xs text-info">Tipo de Adquisición</label>
                    <select className="form-input-select w-full" value={filterTipo} onChange={e => { setFilterTipo(e.target.value); setPage(1); }}>
                        <option value="">TODAS LAS MODALIDADES</option>
                        {TIPO_INGRESO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label.toUpperCase()}</option>)}
                    </select>
                </div>
                <div>
                    <label className="form-label-xs">Sucursal Receptora</label>
                    <select className="form-input-select w-full" value={filterSucursal} onChange={e => { setFilterSucursal(e.target.value); setPage(1); }}>
                        <option value="">TODAS LAS SUCURSALES</option>
                        {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre.toUpperCase()}</option>)}
                    </select>
                </div>
                <div>
                    <label className="form-label-xs">Buscar Unidad</label>
                    <select className="form-input-select w-full" value={filterVehiculo} onChange={e => { setFilterVehiculo(e.target.value); setPage(1); }}>
                        <option value="">TODOS LOS VEHÍCULOS</option>
                        {vehiculos.map(v => <option key={v.id} value={v.id}>{`${v.marca} ${v.modelo} ${v.dominio || ''}`.toUpperCase()}</option>)}
                    </select>
                </div>
                <div className="flex gap-2">
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
                            {permisos.veValorDeIngreso && <th>Valorización</th>}
                            <th>Origen del Activo</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ padding: '8rem', textAlign: 'center' }}><RefreshCw className="animate-spin text-accent" size={40} /></td></tr>
                        ) : ingresos.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="flex flex-col items-center text-muted">
                                        <div className="flex items-center justify-center mb-4">
                                            <ArrowDownLeft size={40} className="text-secondary" />
                                        </div>
                                        <p className="text-xl font-black text-muted">Sin ingresos registrados</p>
                                        <p className="text-sm font-medium">No hay registros que coincidan con los criterios de búsqueda.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : ingresos.map(i => (
                            <tr key={i.id}>
                                <td>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center text-info">
                                            <Car size={18} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold leading-tight">
                                                {i.vehiculo ? `${i.vehiculo.marca} ${i.vehiculo.modelo}` : `Vehículo #${i.vehiculoId}`}
                                            </span>
                                            <span className="text-3xs font-black text-info uppercase tracking-widest">{i.vehiculo?.dominio || 'S/PATENTE'}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <Badge variant={TIPO_BADGE_VARIANT[i.tipoIngreso]}>{tipoLabel(i.tipoIngreso).toUpperCase()}</Badge>
                                </td>
                                <td>
                                    <div className="flex items-center gap-2">
                                        <Building2 size={12} className="text-muted" />
                                        <span className="text-xs font-bold text-muted">{i.sucursal?.nombre ?? 'ALMACÉN CENTRAL'}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="flex items-center gap-2 text-muted">
                                        <Calendar size={14} />
                                        <span className="text-sm font-bold">
                                            {i.fechaIngreso ? new Date(i.fechaIngreso).toLocaleDateString('es-AR') : '-'}
                                        </span>
                                    </div>
                                </td>
                                {/* En un ingreso por compra, este importe ES el precio de compra
                                    de la unidad: el backend se lo recorta a quien no sea
                                    admin/vendedor, así que la columna se esconde en vez de
                                    quedar mostrando $0 a media concesionaria. */}
                                {permisos.veValorDeIngreso && (
                                    <td>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xs font-black text-muted">$</span>
                                            <span className="font-black text-lg tabular-nums">
                                                {Number(i.valorTomado || 0).toLocaleString('es-AR')}
                                            </span>
                                        </div>
                                    </td>
                                )}
                                <td>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center text-muted">
                                            <User size={14} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-muted uppercase truncate">
                                                {i.clienteOrigen?.nombre ?? i.proveedorOrigen?.nombre ?? 'NOT IDENTIFIED'}
                                            </span>
                                            <span className={`text-3xs font-black uppercase ${i.clienteOrigen ? 'text-accent' : i.proveedorOrigen ? 'text-info' : 'text-muted'}`}>
                                                {i.clienteOrigen ? 'Cliente Part.' : i.proveedorOrigen ? 'Proveedor Stock' : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    {permisos.ingresosAnular && (
                                        <button className="icon-btn danger" onClick={() => setDeletingId(i.id)} title="Eliminar"><Trash2 size={16} /></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex justify-center items-center gap-6">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    <ChevronLeft size={16} /> Anterior
                </Button>
                <div className="flex items-center gap-2">
                    <span className="text-3xs text-muted font-black uppercase tracking-tight">Página</span>
                    <span className="flex items-center justify-center font-black text-sm">{page}</span>
                    <span className="text-3xs text-muted font-black uppercase tracking-tight">de {totalPages}</span>
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
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(var(--accent-3-rgb), 0.1);
                    color: var(--info);
                }
                .shadow-glow-primary { box-shadow: 0 0 20px rgba(var(--accent-3-rgb), 0.2); }
                
                /* .form-label-xs: la define index.css (capa global). El
                   .form-input-select local es la variante protagónica de estos
                   filtros y gana la cascada a propósito. */
                .form-input-select {
                    padding: 0.75rem 2.5rem 0.75rem 1rem;
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border);
                    background: var(--bg-primary);
                    font-size: var(--text-sm);
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
                    background: var(--bg-card) !important;
                    border: 1px solid var(--border) !important;
                }
                .icon-btn {
                    padding: 0.6rem;
                    border-radius: var(--radius-md);
                    background: var(--bg-secondary);
                    color: var(--text-secondary);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    border: 1px solid var(--border);
                }
                .icon-btn:hover {
                    background: var(--danger);
                    color: var(--text-white);
                    border-color: var(--danger);
                    transform: scale(1.05);
                }
            `}</style>
        </div>
    );
};

export default IngresosPage;
