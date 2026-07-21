import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reservasApi, type Reserva, type EstadoReserva } from '../../api/reservas.api';
import { ventasApi, type CreateVentaDto } from '../../api/ventas.api';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import Badge, { type BadgeVariant } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import {
    ArrowLeft, Bookmark, Calendar, DollarSign,
    Car, Users, MapPin, RefreshCw, XCircle,
    CheckCircle, Clock, User, ShoppingBag
} from 'lucide-react';
import type { FormaPagoVenta } from '../../types/venta.types';

const FORMA_PAGO_OPTIONS: { value: FormaPagoVenta; label: string }[] = [
    { value: 'contado', label: 'Contado / Efectivo' },
    { value: 'transferencia', label: 'Transferencia Bancaria' },
    { value: 'financiado_propio', label: 'Financiación Interna' },
    { value: 'financiado_externo', label: 'Crédito Prendario / UVA' },
    { value: 'canje_mas_diferencia', label: 'Canje + Saldo' },
    { value: 'mixto', label: 'Pago Mixto' },
];

const ESTADO_BADGE: Record<EstadoReserva, BadgeVariant> = {
    activa: 'success',
    convertida_en_venta: 'info',
    cancelada: 'default',
    vencida: 'danger',
};

const ESTADO_LABEL: Record<EstadoReserva, string> = {
    activa: 'Activa',
    convertida_en_venta: 'Convertida en venta',
    cancelada: 'Cancelada',
    vencida: 'Vencida',
};

interface InfoRowProps {
    icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
    label: string;
    value?: React.ReactNode;
}

const InfoRow = ({ icon: Icon, label, value }: InfoRowProps) => {
    if (!value && value !== 0) return null;
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
            <Icon size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{label}</div>
                <div style={{ fontWeight: 600 }}>{value}</div>
            </div>
        </div>
    );
};

const isVencimientoProximo = (fecha: string) => {
    const diff = new Date(fecha).getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
};

const isVencida = (fecha: string) => new Date(fecha).getTime() < Date.now();

const ReservaDetallePage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { addToast } = useUIStore();

    const [reserva, setReserva] = useState<Reserva | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Action modals
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showVencidaModal, setShowVencidaModal] = useState(false);
    const [showConvertirModal, setShowConvertirModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Convertir form state
    const [convertirForm, setConvertirForm] = useState({
        precioVenta: 0,
        moneda: 'ARS' as 'ARS' | 'USD',
        formaPago: 'contado' as FormaPagoVenta,
        fechaVenta: new Date().toISOString().slice(0, 10),
        observaciones: '',
    });

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        reservasApi.getById(Number(id))
            .then((res: unknown) => {
                const r = res as { data?: Reserva };
                setReserva(r?.data ?? res as Reserva);
            })
            .catch(() => setError('No se pudo cargar la reserva.'))
            .finally(() => setLoading(false));
    }, [id]);

    const handleCancel = async () => {
        if (!reserva) return;
        setActionLoading(true);
        try {
            const res = await reservasApi.update(reserva.id, { estado: 'cancelada' }) as unknown as { data?: Reserva };
            setReserva(res?.data ?? null);
            addToast('Reserva cancelada. El vehículo volvió a estado "Publicado".', 'success');
            setShowCancelModal(false);
        } catch {
            addToast('Error al cancelar reserva', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleConvertirEnVenta = async () => {
        if (!reserva) return;
        const vendedorId = useAuthStore.getState().user?.id;
        if (!vendedorId) {
            addToast('No se pudo determinar el usuario actual', 'error');
            return;
        }
        if (convertirForm.precioVenta <= 0) {
            addToast('El precio de venta debe ser mayor a 0', 'error');
            return;
        }
        setActionLoading(true);
        try {
            const dto: CreateVentaDto = {
                reservaId: reserva.id,
                vehiculoId: reserva.vehiculoId,
                clienteId: reserva.clienteId,
                sucursalId: reserva.sucursalId,
                vendedorId,
                precioVenta: Number(convertirForm.precioVenta),
                moneda: convertirForm.moneda,
                formaPago: convertirForm.formaPago,
                fechaVenta: convertirForm.fechaVenta,
                ...(convertirForm.observaciones && { observaciones: convertirForm.observaciones }),
            };
            await ventasApi.create(dto);
            addToast('Venta creada con éxito', 'success');
            setShowConvertirModal(false);
            navigate('/ventas');
        } catch (err: unknown) {
            const e = err as { message?: string };
            addToast(e?.message || 'Error al convertir la reserva en venta', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleMarkVencida = async () => {
        if (!reserva) return;
        setActionLoading(true);
        try {
            const res = await reservasApi.update(reserva.id, { estado: 'vencida' }) as unknown as { data?: Reserva };
            setReserva(res?.data ?? null);
            addToast('Reserva marcada como vencida.', 'success');
            setShowVencidaModal(false);
        } catch {
            addToast('Error al actualizar reserva', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '0.75rem', color: 'var(--text-secondary)' }}>
            <RefreshCw size={20} className="spin" /> Cargando...
        </div>
    );

    if (error || !reserva) return (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error || 'Reserva no encontrada.'}</p>
            <Button variant="secondary" onClick={() => navigate('/reservas')}>
                <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} /> Volver
            </Button>
        </div>
    );

    const proximo = reserva.estado === 'activa' && reserva.fechaVencimiento && isVencimientoProximo(reserva.fechaVencimiento);
    const vencida = reserva.estado === 'activa' && reserva.fechaVencimiento && isVencida(reserva.fechaVencimiento);

    return (
        <div className="page-container" style={{ maxWidth: '860px' }}>
            {/* Back + header */}
            <div className="detalle-header" style={{ marginBottom: '1.5rem' }}>
                <button className="back-btn" onClick={() => navigate('/reservas')}>
                    <ArrowLeft size={20} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Bookmark size={24} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Reserva #{reserva.id}</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.3rem' }}>
                            <Badge variant={ESTADO_BADGE[reserva.estado]}>{ESTADO_LABEL[reserva.estado]}</Badge>
                            {proximo && !vencida && (
                                <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Clock size={13} /> Vence pronto
                                </span>
                            )}
                            {vencida && (
                                <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Clock size={13} /> Fecha vencida
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                {reserva.estado === 'activa' && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                        {vencida && (
                            <Button variant="outline" size="sm" onClick={() => setShowVencidaModal(true)}>
                                <Clock size={14} style={{ marginRight: '0.4rem' }} /> Marcar vencida
                            </Button>
                        )}
                        <Button variant="primary" size="sm" onClick={() => {
                            setConvertirForm({
                                precioVenta: Number(reserva.monto) || 0,
                                moneda: reserva.moneda,
                                formaPago: 'contado',
                                fechaVenta: new Date().toISOString().slice(0, 10),
                                observaciones: '',
                            });
                            setShowConvertirModal(true);
                        }}>
                            <ShoppingBag size={14} style={{ marginRight: '0.4rem' }} /> Convertir en venta
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setShowCancelModal(true)}>
                            <XCircle size={14} style={{ marginRight: '0.4rem' }} /> Cancelar reserva
                        </Button>
                    </div>
                )}
            </div>

            {/* Main cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                {/* Vehículo */}
                <div className="glass" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                    <h3 style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Car size={14} /> Vehículo
                    </h3>
                    <InfoRow icon={Car} label="Vehículo" value={reserva.vehiculo ? `${reserva.vehiculo.marca} ${reserva.vehiculo.modelo} ${reserva.vehiculo.version ?? ''}`.trim() : `ID ${reserva.vehiculoId}`} />
                    <InfoRow icon={Car} label="Dominio" value={reserva.vehiculo?.dominio} />
                    <div style={{ marginTop: '0.75rem' }}>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/vehiculos/${reserva.vehiculoId}`)}>
                            Ver ficha del vehículo →
                        </Button>
                    </div>
                </div>

                {/* Cliente */}
                <div className="glass" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                    <h3 style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Users size={14} /> Cliente
                    </h3>
                    <InfoRow icon={User} label="Nombre" value={reserva.cliente?.nombre} />
                    <InfoRow icon={User} label="DNI" value={reserva.cliente?.dni} />
                    <InfoRow icon={User} label="Teléfono" value={reserva.cliente?.telefono} />
                    <div style={{ marginTop: '0.75rem' }}>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/clientes/${reserva.clienteId}`)}>
                            Ver ficha del cliente →
                        </Button>
                    </div>
                </div>

                {/* Seña */}
                <div className="glass" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                    <h3 style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <DollarSign size={14} /> Seña
                    </h3>
                    <InfoRow icon={DollarSign} label="Monto" value={`${reserva.moneda} $${Number(reserva.monto).toLocaleString('es-AR')}`} />
                    <InfoRow icon={Calendar} label="Vencimiento" value={
                        <span style={{ color: (vencida || reserva.estado === 'vencida') ? '#ef4444' : proximo ? '#f59e0b' : 'inherit' }}>
                            {reserva.fechaVencimiento ? new Date(reserva.fechaVencimiento).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'}
                        </span>
                    } />
                    <InfoRow icon={Calendar} label="Creada el" value={reserva.createdAt ? new Date(reserva.createdAt).toLocaleDateString('es-AR') : undefined} />
                </div>

                {/* Sucursal y vendedor */}
                <div className="glass" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                    <h3 style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <MapPin size={14} /> Operación
                    </h3>
                    <InfoRow icon={MapPin} label="Sucursal" value={reserva.sucursal?.nombre} />
                    <InfoRow icon={User} label="Creada por" value={reserva.creadaPor?.nombre} />
                    <InfoRow icon={CheckCircle} label="Estado" value={<Badge variant={ESTADO_BADGE[reserva.estado]}>{ESTADO_LABEL[reserva.estado]}</Badge>} />
                </div>
            </div>

            {/* Observaciones */}
            {reserva.observaciones && (
                <div className="glass" style={{ padding: '1.5rem', borderRadius: '1rem', marginTop: '1.25rem' }}>
                    <h3 style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        Observaciones
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>{reserva.observaciones}</p>
                </div>
            )}

            <ConfirmDialog
                isOpen={showCancelModal}
                title={`Cancelar reserva #${reserva.id}`}
                message={`¿Confirmar la cancelación? El vehículo "${reserva.vehiculo?.marca} ${reserva.vehiculo?.modelo}" volverá a estado "Publicado".`}
                confirmLabel="Cancelar reserva"
                cancelLabel="Volver"
                type="danger"
                onConfirm={handleCancel}
                onCancel={() => setShowCancelModal(false)}
                loading={actionLoading}
            />

            <Modal
                isOpen={showConvertirModal}
                onClose={() => setShowConvertirModal(false)}
                title={`Convertir reserva #${reserva.id} en venta`}
                maxWidth="520px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowConvertirModal(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleConvertirEnVenta} loading={actionLoading}>
                            Crear venta
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label className="input-label">Precio venta *</label>
                            <input type="number" className="form-input" value={convertirForm.precioVenta || ''}
                                onChange={e => setConvertirForm(f => ({ ...f, precioVenta: +e.target.value }))} />
                        </div>
                        <div>
                            <label className="input-label">Moneda</label>
                            <select className="form-input" value={convertirForm.moneda}
                                onChange={e => setConvertirForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}>
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label className="input-label">Forma de pago</label>
                            <select className="form-input" value={convertirForm.formaPago}
                                onChange={e => setConvertirForm(f => ({ ...f, formaPago: e.target.value as FormaPagoVenta }))}>
                                {FORMA_PAGO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="input-label">Fecha venta</label>
                            <input type="date" className="form-input" value={convertirForm.fechaVenta}
                                onChange={e => setConvertirForm(f => ({ ...f, fechaVenta: e.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <label className="input-label">Observaciones</label>
                        <textarea className="form-input" rows={3} value={convertirForm.observaciones}
                            onChange={e => setConvertirForm(f => ({ ...f, observaciones: e.target.value }))} />
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={showVencidaModal}
                title="Marcar como vencida"
                message={`¿Marcar la reserva #${reserva.id} como vencida? El vehículo volverá a estado "Publicado".`}
                confirmLabel="Marcar vencida"
                cancelLabel="Volver"
                type="warning"
                onConfirm={handleMarkVencida}
                onCancel={() => setShowVencidaModal(false)}
                loading={actionLoading}
            />

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .spin { animation: spin 0.8s linear infinite; }
                .detalle-header { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
                .back-btn { background: none; border: 1px solid var(--border); border-radius: 0.5rem; color: var(--text-secondary); cursor: pointer; padding: 0.5rem; display: flex; align-items: center; }
                .back-btn:hover { background: var(--bg-secondary); }
            `}</style>
        </div>
    );
};

export default ReservaDetallePage;
