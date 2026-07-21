import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { vehiculoMovimientosApi, type VehiculoMovimiento } from '../../api/vehiculo-movimientos.api';
import { vehiculosApi } from '../../api/vehiculos.api';
import { sucursalesApi } from '../../api/sucursales.api';
import { proveedoresApi } from '../../api/proveedores.api';
import { TIPOS_PROVEEDOR } from '../../constants/proveedorTipos';
import { useUIStore } from '../../store/uiStore';
import Badge, { type BadgeVariant } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import {
    Plus, RefreshCw,
    ArrowLeftRight, ChevronLeft, ChevronRight,
    Car, Calendar, FileText,
    ArrowRight, AlertCircle, User, MapPin, CheckCircle2
} from 'lucide-react';

const TIPO_BADGE: Record<string, string> = {
    traslado: 'info',
    preparacion: 'violet',
    ingreso: 'success',
    egreso: 'danger',
    asignacion_reserva: 'warning',
    liberacion_reserva: 'default',
};

const TIPO_LABEL: Record<string, string> = {
    traslado: 'Traslado Inter-Sucursal',
    preparacion: 'Preparación',
    ingreso: 'Ingreso al Stock',
    egreso: 'Egreso del Stock',
    asignacion_reserva: 'Asignación de Reserva',
    liberacion_reserva: 'Liberación de Reserva',
};

const EMPTY_FORM = {
    vehiculoId: '',
    modalidad: 'traslado',        // 'traslado' | 'preparacion'
    hastaSucursalId: '',
    proveedorDestinoId: '',       // a qué proveedor externo va la unidad
    motivo: '',
    fechaMovimiento: new Date().toISOString().slice(0, 10),
};

const MovimientosPage = () => {
    const { addToast } = useUIStore();

    // List state
    const [movimientos, setMovimientos] = useState<VehiculoMovimiento[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Filters
    const [filterVehiculo, setFilterVehiculo] = useState('');
    const [filterDesde, setFilterDesde] = useState('');
    const [filterHasta, setFilterHasta] = useState('');

    // Catalog data
    const [sucursales, setSucursales] = useState<{ id: number; nombre: string }[]>([]);
    const [vehiculos, setVehiculos] = useState<{ id: number; marca: string; modelo: string; version?: string; dominio?: string }[]>([]);
    const [proveedores, setProveedores] = useState<{ id: number; nombre: string; tipo?: string; activo?: boolean }[]>([]);

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    // Load catalogs once
    useEffect(() => {
        const loadInitial = async () => {
            try {
                const [sucRes, vehRes, provRes] = await Promise.all([
                    sucursalesApi.getAll(),
                    vehiculosApi.getAll({}, { limit: 1000 }),
                    // Sólo proveedores activos: a un proveedor dado de baja no se
                    // le puede mandar una unidad.
                    proveedoresApi.getAll({ activo: true }, { limit: 500 })
                ]);
                // Distintos módulos devuelven formas distintas: vehículos → {results},
                // sucursales → {success, data:[...]}. Este helper cubre todas.
                const getList = <T,>(r: unknown): T[] => {
                    if (Array.isArray(r)) return r as T[];
                    const o = (r ?? {}) as { results?: T[]; data?: T[] | { results?: T[] } };
                    if (Array.isArray(o.results)) return o.results;
                    if (Array.isArray(o.data)) return o.data;
                    const dr = (o.data as { results?: T[] })?.results;
                    return Array.isArray(dr) ? dr : [];
                };
                setSucursales(getList(sucRes));
                setVehiculos(getList(vehRes));
                setProveedores(getList(provRes));
            } catch {
                // silencio
            }
        };
        loadInitial();
    }, []);

    const loadMovimientos = useCallback(async (pg = page) => {
        setLoading(true);
        try {
            const params: Record<string, string | number> = { page: pg, limit: 15 };
            if (filterVehiculo) params.vehiculoId = Number(filterVehiculo);
            if (filterDesde) params.desdeSucursalId = Number(filterDesde);
            if (filterHasta) params.hastaSucursalId = Number(filterHasta);

            const res = await vehiculoMovimientosApi.getAll(params) as unknown as { results?: VehiculoMovimiento[]; totalPages?: number };
            setMovimientos(res?.results ?? []);
            setTotalPages(res?.totalPages ?? 1);
        } catch {
            addToast('Error al cargar la trazabilidad de stock', 'error');
        } finally {
            setLoading(false);
        }
    }, [page, filterVehiculo, filterDesde, filterHasta, addToast]);

    useEffect(() => {
        loadMovimientos(page);
    }, [page, loadMovimientos]);

    const handleClear = () => {
        setFilterVehiculo('');
        setFilterDesde('');
        setFilterHasta('');
        setPage(1);
    };

    const [retornandoId, setRetornandoId] = useState<number | null>(null);
    const handleRetorno = async (id: number) => {
        setRetornandoId(id);
        try {
            await vehiculoMovimientosApi.marcarRetorno(id);
            addToast('Retorno de preparación registrado', 'success');
            loadMovimientos(page);
        } catch {
            addToast('Error al registrar el retorno', 'error');
        } finally {
            setRetornandoId(null);
        }
    };

    // A un auto se lo manda a un taller, lavadero, etc.: no a una importadora
    // ni a una financiera. Se agrupan por tipo para encontrarlos rápido.
    const destinosPorTipo = useMemo(() => {
        return TIPOS_PROVEEDOR
            .filter(t => t.esDestinoDePreparacion)
            .map(t => ({
                tipo: t.value,
                label: t.label,
                proveedores: proveedores.filter(p => p.tipo === t.value),
            }))
            .filter(g => g.proveedores.length > 0);
    }, [proveedores]);

    const openModal = () => {
        setForm({ ...EMPTY_FORM });
        setFormError('');
        setShowModal(true);
    };

    const handleSubmit = async () => {
        const esTraslado = form.modalidad === 'traslado';

        if (!form.vehiculoId) { setFormError('Seleccioná la unidad.'); return; }
        if (esTraslado && !form.hastaSucursalId) { setFormError('Seleccioná la sucursal de destino.'); return; }
        if (!esTraslado && !form.proveedorDestinoId) { setFormError('Seleccioná el proveedor de destino.'); return; }

        setSaving(true);
        setFormError('');
        try {
            const payload: {
                vehiculoId: number; tipo: 'traslado' | 'preparacion';
                hastaSucursalId?: number; proveedorDestinoId?: number; motivo?: string; fechaMovimiento?: string;
            } = { vehiculoId: Number(form.vehiculoId), tipo: esTraslado ? 'traslado' : 'preparacion' };

            if (esTraslado) payload.hastaSucursalId = Number(form.hastaSucursalId);
            else payload.proveedorDestinoId = Number(form.proveedorDestinoId);
            if (form.motivo) payload.motivo = form.motivo;
            if (form.fechaMovimiento) payload.fechaMovimiento = new Date(form.fechaMovimiento).toISOString();

            await vehiculoMovimientosApi.create(payload);
            addToast(esTraslado ? 'Traslado registrado correctamente' : 'Envío a preparación registrado', 'success');
            setShowModal(false);
            setPage(1);
            loadMovimientos(1);
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message ?? 'Error al registrar el movimiento';
            setFormError(msg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page-container animate-fade-in">
            {/* Header */}
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow-indigo">
                            <ArrowLeftRight size={20} />
                        </div>
                        <h1>Movimientos de Stock</h1>
                    </div>
                    <p>Trazabilidad de traslados entre sucursales, asignaciones y cambios de ubicación de las unidades.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => loadMovimientos(page)}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </Button>
                    <Button variant="primary" onClick={openModal}>
                        <Plus size={18} /> Nuevo Movimiento
                    </Button>
                </div>
            </header>

            {/* Filters Bar */}
            <div className="card glass filters-bar flex flex-wrap items-end gap-6 bg-slate-900/40">
                <div className="flex-1 min-w-[200px]">
                    <label className="form-label-xs text-indigo-400">Filtrar por Unidad</label>
                    <select className="form-input-select w-full" value={filterVehiculo} onChange={e => { setFilterVehiculo(e.target.value); setPage(1); }}>
                        <option value="">TODOS LOS VEHÍCULOS</option>
                        {vehiculos.map(v => <option key={v.id} value={v.id}>{`${v.marca} ${v.modelo} ${v.dominio || ''}`.toUpperCase()}</option>)}
                    </select>
                </div>
                <div className="min-w-[180px]">
                    <label className="form-label-xs">Origen de Stock</label>
                    <select className="form-input-select w-full" value={filterDesde} onChange={e => { setFilterDesde(e.target.value); setPage(1); }}>
                        <option value="">CUALQUIER PLAZA</option>
                        {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre.toUpperCase()}</option>)}
                    </select>
                </div>
                <div className="min-w-[180px]">
                    <label className="form-label-xs">Destino de Stock</label>
                    <select className="form-input-select w-full" value={filterHasta} onChange={e => { setFilterHasta(e.target.value); setPage(1); }}>
                        <option value="">CUALQUIER DESTINO</option>
                        {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre.toUpperCase()}</option>)}
                    </select>
                </div>
                <div className="flex items-end mb-[2px]">
                    <Button variant="secondary" onClick={handleClear} title="Limpiar filtros">
                        <RefreshCw size={18} />
                    </Button>
                </div>
            </div>

            {/* List Table */}
            <div className="table-container card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Unidad Vehicular</th>
                            <th>Evento de Stock</th>
                            <th>Flujo de Distribución</th>
                            <th>Fecha Evento</th>
                            <th>Certificación / Motivo</th>
                            <th>Responsable Central</th>
                            <th style={{ textAlign: 'right' }}>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} style={{ padding: '8rem', textAlign: 'center' }}><RefreshCw className="animate-spin text-accent mx-auto" size={40} /></td></tr>
                        ) : movimientos.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="flex flex-col items-center py-20 text-muted">
                                        <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center mb-4 border border-slate-700">
                                            <ArrowLeftRight size={40} className="text-slate-600" />
                                        </div>
                                        <p className="text-xl font-black text-slate-400 italic">No se registran trazabilidades</p>
                                        <p className="text-sm font-medium">El historial de movimientos está vacío para los filtros seleccionados.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            movimientos.map(m => (
                                <tr key={m.id}>
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-indigo-400 ring-1 ring-slate-700 shadow-inner">
                                                <Car size={18} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-white leading-tight">
                                                    {m.vehiculo ? `${m.vehiculo.marca} ${m.vehiculo.modelo}` : `Vehículo #${m.vehiculoId}`}
                                                </span>
                                                <span className="text-[10px] font-black text-indigo-500/80 uppercase tracking-widest">{m.vehiculo?.dominio || 'S/PATENTE'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <Badge variant={(TIPO_BADGE[m.tipo] ?? 'default') as BadgeVariant}>
                                            {TIPO_LABEL[m.tipo] ?? m.tipo.toUpperCase()}
                                        </Badge>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] text-muted uppercase font-black tracking-tighter">DESDE</span>
                                                <span className="text-xs font-bold text-slate-300">{m.desdeSucursal?.nombre ?? '-'}</span>
                                            </div>
                                            <ArrowRight size={14} className="text-slate-600 mx-1 shrink-0" />
                                            <div className="flex flex-col text-right">
                                                <span className="text-[9px] text-indigo-400 uppercase font-black tracking-tighter">
                                                    {m.tipo === 'preparacion' ? 'PREPARACIÓN' : 'HASTA'}
                                                </span>
                                                <span className="text-xs font-bold text-white">
                                                    {/* `destino` es texto libre de movimientos viejos, previos a que
                                                        el destino pasara a ser un proveedor. */}
                                                    {m.hastaSucursal?.nombre ?? m.proveedorDestino?.nombre ?? m.destino ?? 'VENTA'}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <Calendar size={14} />
                                            <span className="text-sm font-bold tabular-nums">
                                                {m.fecha ? new Date(m.fecha).toLocaleDateString('es-AR') : (m.createdAt ? new Date(m.createdAt).toLocaleDateString('es-AR') : '-')}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ maxWidth: '200px' }}>
                                        <div className="flex items-center gap-2">
                                            <FileText size={14} className="text-slate-600 shrink-0" />
                                            <span className="text-xs text-slate-400 italic line-clamp-1">{m.motivo || 'Sin detalles registrados'}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 border border-slate-700">
                                                <User size={14} />
                                            </div>
                                            <span className="text-xs font-black text-slate-400 uppercase">{m.registradoPor?.nombre ?? 'SYSTEM'}</span>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        {m.tipo !== 'preparacion' ? (
                                            <span className="text-xs font-bold text-slate-500">—</span>
                                        ) : m.fechaRetorno ? (
                                            <div className="flex flex-col items-end">
                                                <Badge variant="success">Volvió</Badge>
                                                <span className="text-[10px] text-muted mt-1">{new Date(m.fechaRetorno).toLocaleDateString('es-AR')}</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-end gap-1">
                                                <Badge variant="warning">En preparación</Badge>
                                                <Button variant="secondary" size="sm" loading={retornandoId === m.id} onClick={() => handleRetorno(m.id)}>
                                                    <CheckCircle2 size={14} /> Marcar retorno
                                                </Button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
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

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title="Nuevo Movimiento de Unidad"
                subtitle="Trasladá la unidad a otra sucursal o enviala a preparación (mecánico, lavadero, chapa y pintura, etc.)."
                maxWidth="680px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSubmit} loading={saving}>
                            <ArrowLeftRight size={16} />
                            Registrar Movimiento
                        </Button>
                    </>
                }
            >
                <div className="space-y-6">
                    <div className="form-group">
                        <label className="form-label">Unidad Vehicular a Movilizar *</label>
                        <select className="form-input text-lg font-bold" value={form.vehiculoId} onChange={e => setForm(f => ({ ...f, vehiculoId: e.target.value }))}>
                            <option value="">Selección de unidad por Dominio o Modelo...</option>
                            {vehiculos.map(v => (
                                <option key={v.id} value={v.id}>
                                    {`${v.marca} ${v.modelo} ${v.version ? v.version : ''} (${v.dominio || 'SIN PATENTE'})`.toUpperCase()}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="form-group">
                            <label className="form-label">Tipo de movimiento *</label>
                            <select className="form-input" value={form.modalidad} onChange={e => setForm(f => ({ ...f, modalidad: e.target.value }))}>
                                <option value="traslado">Traslado a otra sucursal</option>
                                <option value="preparacion">Enviar a preparación</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Fecha</label>
                            <input type="date" className="form-input" value={form.fechaMovimiento} onChange={e => setForm(f => ({ ...f, fechaMovimiento: e.target.value }))} />
                        </div>
                    </div>

                    {form.modalidad === 'traslado' ? (
                        <div className="form-group">
                            <label className="form-label">Sucursal de destino *</label>
                            <div className="relative">
                                <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" />
                                <select className="form-input pl-11" value={form.hastaSucursalId} onChange={e => setForm(f => ({ ...f, hastaSucursalId: e.target.value }))}>
                                    <option value="">Seleccionar sucursal...</option>
                                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre.toUpperCase()}</option>)}
                                </select>
                            </div>
                        </div>
                    ) : (
                        <div className="form-group">
                            <label className="form-label">Proveedor de destino *</label>
                            <div className="relative">
                                <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" />
                                <select
                                    className="form-input pl-11"
                                    value={form.proveedorDestinoId}
                                    onChange={e => setForm(f => ({ ...f, proveedorDestinoId: e.target.value }))}
                                >
                                    <option value="">Seleccionar proveedor...</option>
                                    {destinosPorTipo.map(grupo => (
                                        <optgroup key={grupo.tipo} label={grupo.label}>
                                            {grupo.proveedores.map(p => (
                                                <option key={p.id} value={p.id}>{p.nombre.toUpperCase()}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                            {destinosPorTipo.length === 0 && (
                                <p className="text-xs text-muted" style={{ marginTop: '0.5rem' }}>
                                    No hay proveedores activos a los que enviar la unidad.{' '}
                                    <Link to="/proveedores" style={{ color: 'var(--accent)', fontWeight: 700 }}>Dar de alta un proveedor</Link>
                                </p>
                            )}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Justificación Operacional / Notas</label>
                        <textarea className="form-input" rows={3} placeholder="Ej: Cumplimiento de reserva en sucursal Norte, rotación de showroom..." value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} style={{ resize: 'none' }} />
                    </div>

                    {formError && (
                        <div className="uploader-alert uploader-alert-error">
                            <AlertCircle size={14} />
                            <span>{formError}</span>
                        </div>
                    )}
                </div>
            </Modal>

            <style>{`
                .icon-badge {
                    width: 44px;
                    height: 44px;
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(99, 102, 241, 0.1);
                    color: #6366f1;
                }
                .shadow-glow-indigo { box-shadow: 0 0 20px rgba(99, 102, 241, 0.2); }
                
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
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 1rem center;
                    text-transform: uppercase;
                }
                .filters-bar {
                    padding: 1.5rem !important;
                    background: rgba(15, 23, 42, 0.6) !important;
                    border: 1px solid rgba(255,255,255,0.03) !important;
                }
            `}</style>
        </div>
    );
};

export default MovimientosPage;
