import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { reservasApi, type Reserva, type EstadoReserva } from '../../api/reservas.api';
import type { BadgeVariant } from '../../components/ui/Badge';
import { vehiculosApi } from '../../api/vehiculos.api';
import { sucursalesApi } from '../../api/sucursales.api';
import { clientesApi } from '../../api/clientes.api';
import { usuariosApi } from '../../api/usuarios.api';
import { useUIStore } from '../../store/uiStore';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import { getList } from '../../utils/lista';
import {
    Plus, Search, Filter, RefreshCw,
    Bookmark, ChevronLeft, ChevronRight,
    Eye, XCircle, X
} from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';

const ESTADO_OPTS: { value: EstadoReserva; label: string }[] = [
    { value: 'activa', label: 'Activa' },
    { value: 'convertida_en_venta', label: 'Convertida en venta' },
    { value: 'cancelada', label: 'Cancelada' },
    { value: 'vencida', label: 'Vencida' },
];

const ESTADO_BADGE: Record<EstadoReserva, BadgeVariant> = {
    activa: 'success',
    convertida_en_venta: 'info',
    cancelada: 'default',
    vencida: 'danger',
};


const EMPTY_FORM = {
    vehiculoId: '',
    clienteId: '',
    vendedorId: '',
    sucursalId: '',
    monto: '',
    moneda: 'ARS' as 'ARS' | 'USD',
    fechaVencimiento: '',
    observaciones: '',
};

const isVencimientoProximo = (fecha: string) => {
    const diff = new Date(fecha).getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000; // < 3 days
};

const ReservasPage = () => {
    const navigate = useNavigate();
    const { addToast } = useUIStore();
    // Tomar una seña y cancelarla son las dos caras del mismo trabajo del vendedor
    // (el cliente se arrepiente y la unidad vuelve a `publicado`), y las dos van por
    // rutas admin+vendedor. Lo que no puede es verlas `lectura`. Ver usePermisos.ts.
    const permisos = usePermisos();

    // List state
    const [reservas, setReservas] = useState<Reserva[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    // Filters
    const [filterEstado, setFilterEstado] = useState('');
    const [filterSucursal, setFilterSucursal] = useState('');
    const [filterCliente, setFilterCliente] = useState('');

    // Catalog data
    const [sucursales, setSucursales] = useState<{ id: number; nombre: string }[]>([]);
    const [vehiculos, setVehiculos] = useState<{ id: number; marca: string; modelo: string; version?: string; dominio?: string }[]>([]);
    const [clientes, setClientes] = useState<{ id: number; nombre: string }[]>([]);
    const [usuarios, setUsuarios] = useState<{ id: number; nombre: string }[]>([]);

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    // Cancel confirm
    const [cancelingId, setCancelingId] = useState<number | null>(null);
    const [cancelLoading, setCancelLoading] = useState(false);

    // Load catalogs
    useEffect(() => {
        sucursalesApi.getAll().then((res: unknown) => setSucursales(getList(res))).catch(() => { });
        vehiculosApi.getAll({ estado: 'publicado' }, { limit: 1000 }).then((res: unknown) => setVehiculos(getList(res))).catch(() => { });
        clientesApi.getAll({}, { limit: 1000 }).then((res: unknown) => setClientes(getList(res))).catch(() => { });
        usuariosApi.getAll({}, { limit: 1000 }).then((res: unknown) => setUsuarios(getList(res))).catch(() => { });
    }, []);

    const loadReservas = useCallback(async (pg = page) => {
        setLoading(true);
        try {
            const params: Record<string, string | number> = { page: pg, limit: 15 };
            if (filterEstado) params.estado = filterEstado;
            if (filterSucursal) params.sucursalId = filterSucursal;
            if (filterCliente) params.clienteId = filterCliente;

            const raw = await reservasApi.getAll(params) as unknown as { results?: Reserva[]; totalPages?: number; totalResults?: number };
            setReservas(raw?.results ?? []);
            setTotalPages(raw?.totalPages ?? 1);
            setTotal(raw?.totalResults ?? 0);
        } catch {
            addToast('Error al cargar reservas', 'error');
        } finally {
            setLoading(false);
        }
    }, [page, filterEstado, filterSucursal, filterCliente, addToast]);

    useEffect(() => {
        loadReservas(page);
    }, [page, loadReservas]);

    const handleClear = () => {
        setFilterEstado('');
        setFilterSucursal('');
        setFilterCliente('');
        setPage(1);
    };

    const openModal = () => {
        setForm({ ...EMPTY_FORM });
        setFormError('');
        setShowModal(true);
    };

    const handleSubmit = async () => {
        const { vehiculoId, clienteId, vendedorId, sucursalId, monto, moneda, fechaVencimiento } = form;
        if (!vehiculoId || !clienteId || !vendedorId || !sucursalId || !monto || !fechaVencimiento) {
            setFormError('Todos los campos obligatorios deben completarse.');
            return;
        }
        setSaving(true);
        setFormError('');
        try {
            await reservasApi.create({
                vehiculoId: Number(vehiculoId),
                clienteId: Number(clienteId),
                vendedorId: Number(vendedorId),
                sucursalId: Number(sucursalId),
                monto: Number(monto),
                moneda,
                fechaVencimiento: new Date(fechaVencimiento).toISOString(),
                observaciones: form.observaciones || undefined,
            });
            addToast('Reserva creada correctamente', 'success');
            setShowModal(false);
            setPage(1);
            loadReservas(1);
        } catch (e: unknown) {
            setFormError((e as { message?: string })?.message ?? 'Error al crear reserva');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = async () => {
        if (!cancelingId) return;
        setCancelLoading(true);
        try {
            await reservasApi.update(cancelingId, { estado: 'cancelada' });
            addToast('Reserva cancelada', 'success');
            setCancelingId(null);
            loadReservas(page);
        } catch {
            addToast('Error al cancelar reserva', 'error');
        } finally {
            setCancelLoading(false);
        }
    };

    return (
        <div className="page-container">
            {/* Header */}
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Bookmark size={28} style={{ color: 'var(--accent)' }} />
                    <div>
                        <h1 className="page-title">Reservas</h1>
                        <p className="page-subtitle">{total} reserva{total !== 1 ? 's' : ''} en total</p>
                    </div>
                </div>
                {permisos.reservasOperar && (
                    <Button data-tour="res-nueva" variant="primary" onClick={openModal}>
                        <Plus size={16} style={{ marginRight: '0.5rem' }} /> Nueva Reserva
                    </Button>
                )}
            </div>

            {/* Filters */}
            <div className="glass filter-bar" data-tour="res-filtros" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', padding: '1rem 1.5rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem' }}>
                <div className="filter-group">
                    <label className="filter-label"><Filter size={12} /> Estado</label>
                    <select className="form-input" value={filterEstado} onChange={e => { setFilterEstado(e.target.value); setPage(1); }} style={{ minWidth: '140px' }}>
                        <option value="">Todos</option>
                        {ESTADO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                <div className="filter-group">
                    <label className="filter-label"><Filter size={12} /> Sucursal</label>
                    <select className="form-input" value={filterSucursal} onChange={e => { setFilterSucursal(e.target.value); setPage(1); }} style={{ minWidth: '150px' }}>
                        <option value="">Todas</option>
                        {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                </div>
                <div className="filter-group">
                    <label className="filter-label"><Search size={12} /> Cliente</label>
                    <select className="form-input" value={filterCliente} onChange={e => { setFilterCliente(e.target.value); setPage(1); }} style={{ minWidth: '160px' }}>
                        <option value="">Todos</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClear}>
                    <X size={14} style={{ marginRight: '0.4rem' }} /> Limpiar
                </Button>
            </div>

            {/* Table */}
            <div className="glass table-container" data-tour="res-tabla">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <RefreshCw size={24} className="spin" />
                    </div>
                ) : reservas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <Bookmark size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                        <p>No hay reservas registradas.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Vehículo</th>
                                <th>Cliente</th>
                                <th>Sucursal</th>
                                <th>Seña</th>
                                <th>Vencimiento</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reservas.map(r => {
                                const proximo = r.estado === 'activa' && r.fechaVencimiento && isVencimientoProximo(r.fechaVencimiento);
                                return (
                                    <tr key={r.id}>
                                        <td className="fw-bold text-muted">#{r.id}</td>
                                        <td>
                                            <span className="fw-bold">
                                                {r.vehiculo ? `${r.vehiculo.marca} ${r.vehiculo.modelo}` : `ID ${r.vehiculoId}`}
                                            </span>
                                            {r.vehiculo?.dominio && (
                                                <span className="dominio-tag" style={{ marginLeft: '0.5rem', fontSize: 'var(--text-xs)' }}>
                                                    {r.vehiculo.dominio}
                                                </span>
                                            )}
                                        </td>
                                        <td>{r.cliente?.nombre ?? '-'}</td>
                                        <td>{r.sucursal?.nombre ?? '-'}</td>
                                        <td className="fw-bold">
                                            {r.moneda} ${Number(r.monto).toLocaleString('es-AR')}
                                        </td>
                                        <td>
                                            <span style={{ color: proximo ? 'var(--warning)' : 'inherit', fontWeight: proximo ? 700 : undefined }}>
                                                {r.fechaVencimiento ? new Date(r.fechaVencimiento).toLocaleDateString('es-AR') : '-'}
                                                {proximo && ' ⚠️'}
                                            </span>
                                        </td>
                                        <td>
                                            <Badge variant={ESTADO_BADGE[r.estado]}>
                                                {ESTADO_OPTS.find(o => o.value === r.estado)?.label ?? r.estado}
                                            </Badge>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <button
                                                    className="icon-btn"
                                                    title="Ver detalle"
                                                    onClick={() => navigate(`/reservas/${r.id}`)}
                                                >
                                                    <Eye size={15} />
                                                </button>
                                                {r.estado === 'activa' && permisos.reservasOperar && (
                                                    <button
                                                        className="icon-btn danger"
                                                        title="Cancelar reserva"
                                                        onClick={() => setCancelingId(r.id)}
                                                    >
                                                        <XCircle size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                        <ChevronLeft size={16} />
                    </Button>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Página {page} de {totalPages}</span>
                    <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                        <ChevronRight size={16} />
                    </Button>
                </div>
            )}

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title="Nueva Reserva"
                maxWidth="620px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSubmit} loading={saving}>
                            <Plus size={14} />
                            Crear Reserva
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Select dense label="Vehículo * (solo publicados)" placeholder="Seleccionar vehículo..." value={form.vehiculoId} onChange={e => setForm(f => ({ ...f, vehiculoId: e.target.value }))}>
                            {vehiculos.map(v => (
                                <option key={v.id} value={v.id}>
                                    {v.marca} {v.modelo} {v.version ? `${v.version} ` : ''}{v.dominio ? `(${v.dominio})` : ''}
                                </option>
                            ))}
                        </Select>
                    </div>

                    <Select dense label="Cliente *" placeholder="Seleccionar cliente..." options={clientes.map(c => ({ value: c.id, label: c.nombre }))} value={form.clienteId} onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))} />

                    <Select dense label="Vendedor *" placeholder="Seleccionar vendedor..." options={usuarios.map(u => ({ value: u.id, label: u.nombre }))} value={form.vendedorId} onChange={e => setForm(f => ({ ...f, vendedorId: e.target.value }))} />

                    <Select dense label="Sucursal *" placeholder="Seleccionar sucursal..." options={sucursales.map(s => ({ value: s.id, label: s.nombre }))} value={form.sucursalId} onChange={e => setForm(f => ({ ...f, sucursalId: e.target.value }))} />

                    <Input dense label="Fecha de vencimiento *" type="date" value={form.fechaVencimiento} onChange={e => setForm(f => ({ ...f, fechaVencimiento: e.target.value }))} />

                    <Input dense label="Monto de seña *" type="number" placeholder="0" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />

                    <Select dense label="Moneda *" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}>
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                    </Select>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <Textarea dense label="Observaciones" rows={3} placeholder="Observaciones opcionales..." value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
                    </div>

                    {formError && (
                        <div className="uploader-alert uploader-alert-error" style={{ gridColumn: '1 / -1' }}>
                            <span>{formError}</span>
                        </div>
                    )}
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={cancelingId !== null}
                title="Cancelar reserva"
                message={`¿Confirmar cancelación de la reserva #${cancelingId}? El vehículo volverá a estado "Publicado".`}
                confirmLabel="Confirmar cancelación"
                cancelLabel="Volver"
                type="danger"
                onConfirm={handleCancel}
                onCancel={() => setCancelingId(null)}
                loading={cancelLoading}
            />

            <style>{`
                .filter-group { display: flex; flex-direction: column; gap: 0.3rem; }
                .filter-label { font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: flex; align-items: center; gap: 0.3rem; }
                .modal-footer { display: flex; justify-content: flex-end; gap: 0.75rem; padding: 1rem 1.5rem; border-top: 1px solid var(--border); }
                @keyframes spin { to { transform: rotate(360deg); } }
                .spin { animation: spin 0.8s linear infinite; }
            `}</style>
        </div>
    );
};

export default ReservasPage;
