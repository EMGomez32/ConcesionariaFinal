import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reservasApi, type Reserva, type EstadoReserva } from '../../api/reservas.api';
import { ventasApi, type CreateVentaDto } from '../../api/ventas.api';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import {
    ArrowLeft, Bookmark, Calendar, DollarSign,
    Car, Users, MapPin, RefreshCw, XCircle,
    CheckCircle, Clock, User, ShoppingBag, FileDown
} from 'lucide-react';
import type { FormaPagoVenta } from '../../types/venta.types';
import { formatFecha, hoyLocal } from '../../utils/fecha';
import { formatMoneda } from '../../utils/moneda';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { FORMA_PAGO_OPTIONS, RESERVA_ESTADO } from '../../components/ventas/estados';

const ESTADO_BADGE = (e: EstadoReserva) => RESERVA_ESTADO[e]?.variant ?? 'default';
const ESTADO_LABEL = (e: EstadoReserva) => RESERVA_ESTADO[e]?.label ?? e;

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

// Se comparan fechas de calendario (aaaa-mm-dd) para no correr el día por la zona horaria.
const isVencimientoProximo = (fecha: string) => {
    const vence = fecha.slice(0, 10);
    return vence >= hoyLocal() && vence <= hoyLocal(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
};

const isVencida = (fecha: string) => fecha.slice(0, 10) < hoyLocal();

/**
 * PATCH /reservas/:id devuelve la reserva PLANA (el interceptor ya sacó el body)
 * y SIN sus relaciones. Leer `res.data` daba undefined y la pantalla quedaba en
 * "Reserva no encontrada." después de cancelar o marcar vencida. Se combina lo
 * que volvió con lo que ya se tenía, conservando cliente, unidad y sucursal.
 */
const combinarReserva = (prev: Reserva | null, res: unknown): Reserva | null => {
    const r = res as Partial<Reserva> | null;
    if (!prev) return (r as Reserva) ?? null;
    if (!r || typeof r !== 'object') return prev;
    return { ...prev, ...r, cliente: prev.cliente, vehiculo: prev.vehiculo, sucursal: prev.sucursal, creadaPor: prev.creadaPor };
};

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
    const [descargando, setDescargando] = useState(false);

    // Convertir form state
    const [convertirForm, setConvertirForm] = useState({
        precioVenta: 0,
        moneda: 'ARS' as 'ARS' | 'USD',
        formaPago: 'contado' as FormaPagoVenta,
        fechaVenta: hoyLocal(),
        observaciones: '',
    });

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        reservasApi.getById(Number(id))
            // El interceptor ya devuelve el body: la reserva viene plana.
            .then((res: unknown) => setReserva(res as Reserva))
            .catch((e: unknown) => setError(getErrorMessage(e, 'No se pudo cargar la reserva.')))
            .finally(() => setLoading(false));
    }, [id]);

    const handleCancel = async () => {
        if (!reserva) return;
        setActionLoading(true);
        try {
            const res = await reservasApi.update(reserva.id, { estado: 'cancelada' });
            setReserva(prev => combinarReserva(prev, res));
            addToast('Reserva cancelada. La unidad volvió a Publicado.', 'success');
            setShowCancelModal(false);
        } catch (e: unknown) {
            addToast(getErrorMessage(e, 'No se pudo cancelar la reserva'), 'error');
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
            addToast('Venta registrada', 'success');
            setShowConvertirModal(false);
            navigate('/ventas');
        } catch (err: unknown) {
            addToast(getErrorMessage(err, 'No se pudo convertir la reserva en venta'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleMarkVencida = async () => {
        if (!reserva) return;
        setActionLoading(true);
        try {
            const res = await reservasApi.update(reserva.id, { estado: 'vencida' });
            setReserva(prev => combinarReserva(prev, res));
            addToast('Reserva marcada como vencida. La unidad volvió a Publicado.', 'success');
            setShowVencidaModal(false);
        } catch (e: unknown) {
            addToast(getErrorMessage(e, 'No se pudo marcar la reserva como vencida'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // Descarga el comprobante de reserva (PDF), mismo patrón que los otros comprobantes.
    const handleComprobante = async () => {
        if (!reserva) return;
        setDescargando(true);
        try {
            const blob = await reservasApi.comprobantePdf(reserva.id) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `comprobante-reserva-${reserva.id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('No se pudo generar el comprobante', 'error');
        } finally {
            setDescargando(false);
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '0.75rem', color: 'var(--text-secondary)' }}>
            <RefreshCw size={20} className="spin" aria-hidden="true" /> Cargando la reserva…
        </div>
    );

    if (error || !reserva) return (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error || 'Reserva no encontrada.'}</p>
            <Button variant="secondary" onClick={() => navigate('/reservas')}>
                <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} /> Volver a Reservas
            </Button>
        </div>
    );

    const proximo = reserva.estado === 'activa' && reserva.fechaVencimiento && isVencimientoProximo(reserva.fechaVencimiento);
    const vencida = reserva.estado === 'activa' && reserva.fechaVencimiento && isVencida(reserva.fechaVencimiento);

    return (
        <div className="page-container" style={{ maxWidth: '860px' }}>
            {/* Back + header */}
            <div className="detalle-header" style={{ marginBottom: '1.5rem' }}>
                <button type="button" className="back-btn" onClick={() => navigate('/reservas')} aria-label="Volver a Reservas" title="Volver a Reservas">
                    <ArrowLeft size={20} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Bookmark size={24} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Reserva N° {reserva.id}</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.3rem' }}>
                            <Badge variant={ESTADO_BADGE(reserva.estado)}>{ESTADO_LABEL(reserva.estado)}</Badge>
                            {proximo && !vencida && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Clock size={13} /> Vence pronto
                                </span>
                            )}
                            {vencida && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Clock size={13} aria-hidden="true" /> Ya pasó la fecha de vencimiento
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button variant="secondary" size="sm" onClick={handleComprobante} disabled={descargando}>
                        <FileDown size={14} style={{ marginRight: '0.4rem' }} /> {descargando ? 'Generando…' : 'Comprobante (PDF)'}
                    </Button>
                    {reserva.estado === 'activa' && (
                        <>
                        {vencida && (
                            <Button variant="outline" size="sm" onClick={() => setShowVencidaModal(true)}>
                                <Clock size={14} style={{ marginRight: '0.4rem' }} /> Marcar vencida
                            </Button>
                        )}
                        <Button variant="primary" size="sm" onClick={() => {
                            // El precio de venta sale del precio de lista de la unidad,
                            // no de la seña (antes se precargaba la seña como precio).
                            const lista = Number(reserva.vehiculo?.precioLista) || 0;
                            const monedaUnidad = reserva.vehiculo?.moneda;
                            setConvertirForm({
                                precioVenta: lista,
                                moneda: monedaUnidad === 'USD' || monedaUnidad === 'ARS' ? monedaUnidad : reserva.moneda,
                                formaPago: 'contado',
                                fechaVenta: hoyLocal(),
                                observaciones: '',
                            });
                            setShowConvertirModal(true);
                        }}>
                            <ShoppingBag size={14} style={{ marginRight: '0.4rem' }} /> Convertir en venta
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setShowCancelModal(true)}>
                            <XCircle size={14} style={{ marginRight: '0.4rem' }} /> Cancelar reserva
                        </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Main cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                {/* Vehículo */}
                <div className="glass" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                    <h3 style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Car size={14} /> Vehículo
                    </h3>
                    <InfoRow icon={Car} label="Unidad" value={reserva.vehiculo ? `${reserva.vehiculo.marca} ${reserva.vehiculo.modelo} ${reserva.vehiculo.version ?? ''}`.trim() : `Unidad #${reserva.vehiculoId}`} />
                    {Number(reserva.vehiculo?.precioLista) > 0 && (
                        <InfoRow icon={DollarSign} label="Precio de lista" value={formatMoneda(reserva.vehiculo?.precioLista, reserva.vehiculo?.moneda)} />
                    )}
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
                    <InfoRow icon={DollarSign} label="Monto" value={<span className="tabular-nums">{formatMoneda(reserva.monto, reserva.moneda)}</span>} />
                    <InfoRow icon={Calendar} label="Vence el" value={
                        <span className="tabular-nums" style={{ color: (vencida || reserva.estado === 'vencida') ? 'var(--danger)' : proximo ? 'var(--warning)' : 'inherit' }}>
                            {formatFecha(reserva.fechaVencimiento)}
                        </span>
                    } />
                    <InfoRow icon={Calendar} label="Creada el" value={reserva.createdAt ? new Date(reserva.createdAt).toLocaleDateString('es-AR') : undefined} />
                </div>

                {/* Sucursal y vendedor */}
                <div className="glass" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
                    <h3 style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <MapPin size={14} aria-hidden="true" /> Sucursal y vendedor
                    </h3>
                    <InfoRow icon={MapPin} label="Sucursal" value={reserva.sucursal?.nombre} />
                    <InfoRow icon={User} label="Vendedor" value={reserva.creadaPor?.nombre} />
                    <InfoRow icon={CheckCircle} label="Estado" value={<Badge variant={ESTADO_BADGE(reserva.estado)}>{ESTADO_LABEL(reserva.estado)}</Badge>} />
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
                title={`Cancelar reserva N° ${reserva.id}`}
                message={`¿Cancelar la reserva? La unidad ${reserva.vehiculo?.marca ?? ''} ${reserva.vehiculo?.modelo ?? ''} vuelve a estar publicada para la venta.`}
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
                title={`Convertir la reserva N° ${reserva.id} en venta`}
                subtitle="La seña queda asociada a la venta. Los campos con * son obligatorios."
                maxWidth="520px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowConvertirModal(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleConvertirEnVenta} loading={actionLoading}>
                            Registrar venta
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <Input dense label="Precio de venta *" type="number" min="0" className="tabular-nums" value={convertirForm.precioVenta || ''}
                            onChange={e => setConvertirForm(f => ({ ...f, precioVenta: +e.target.value }))}
                            hint={convertirForm.precioVenta > 0 ? formatMoneda(convertirForm.precioVenta, convertirForm.moneda) : undefined} />
                        <Select dense label="Moneda *" value={convertirForm.moneda}
                            onChange={e => setConvertirForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}>
                            <option value="ARS">Pesos ($)</option>
                            <option value="USD">Dólares (US$)</option>
                        </Select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <Select dense label="Forma de pago *" value={convertirForm.formaPago}
                            onChange={e => setConvertirForm(f => ({ ...f, formaPago: e.target.value as FormaPagoVenta }))}>
                            {FORMA_PAGO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                        <Input dense label="Fecha de venta *" type="date" value={convertirForm.fechaVenta}
                            onChange={e => setConvertirForm(f => ({ ...f, fechaVenta: e.target.value }))} />
                    </div>
                    <Textarea dense label="Observaciones" rows={3} value={convertirForm.observaciones}
                        onChange={e => setConvertirForm(f => ({ ...f, observaciones: e.target.value }))} />
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={showVencidaModal}
                title="Marcar como vencida"
                message={`¿Marcar la reserva N° ${reserva.id} como vencida? La unidad vuelve a estar publicada para la venta.`}
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
