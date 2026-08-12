import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { dashboardKeys } from '../../hooks/useDashboard';
import { clientesApi } from '../../api/clientes.api';
import { ventasApi } from '../../api/ventas.api';
import { presupuestosApi } from '../../api/presupuestos.api';
import { reservasApi } from '../../api/reservas.api';
import { financiacionesApi } from '../../api/financiaciones.api';
import solicitudesFinanciacionApi from '../../api/solicitudesFinanciacion.api';
import { postventaApi } from '../../api/postventa.api';
import { reportesApi, type EstadoCuenta } from '../../api/reportes.api';
import { seguimientosApi, type Seguimiento, type TipoSeguimiento } from '../../api/seguimientos.api';
import { vehiculoInteresApi, type VehiculoInteres } from '../../api/vehiculoInteres.api';
import { vehiculosApi } from '../../api/vehiculos.api';
import type { Vehiculo } from '../../types/vehiculo.types';
import { ESTADO_LEAD_MAP, ESTADOS_LEAD } from '../../types/cliente.types';
import type { Cliente, EstadoLead } from '../../types/cliente.types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatFecha } from '../../utils/fecha';
import {
    ArrowLeft, User, Phone, Mail, MapPin, FileText,
    ShoppingCart, FileBarChart, Calendar, DollarSign,
    CreditCard, RefreshCw, BookmarkCheck, Wrench, Banknote, FileSignature, FileDown,
    Clock, Plus, Trash2, MessageCircle, Check, CheckCircle2, Star, Car, UserCheck, type LucideIcon
} from 'lucide-react';

type Tab = 'info' | 'ventas' | 'presupuestos' | 'reservas' | 'financiaciones' | 'solicitudes' | 'postventa' | 'seguimiento' | 'interes';

// Fecha local YYYY-MM-DD (no toISOString, que pasa a UTC y de noche en UTC-3 ya
// es "mañana"): así el default del form de alta no se adelanta un día.
const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Etiqueta e ícono por tipo de contacto (bitácora de seguimiento).
const TIPO_SEG: Record<TipoSeguimiento, { label: string; icon: LucideIcon; color: string }> = {
    llamada: { label: 'Llamada', icon: Phone, color: '#10b981' },
    whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: '#22c55e' },
    email: { label: 'Email', icon: Mail, color: '#60a5fa' },
    visita: { label: 'Visita', icon: MapPin, color: '#8b5cf6' },
    otro: { label: 'Otro', icon: FileText, color: '#94a3b8' },
};

type AnyRow = Record<string, unknown>;

const fmtMoney = (v: unknown) =>
    v != null && Number(v) ? `$${Number(v).toLocaleString('es-AR')}` : '-';

const money = (n: number, moneda = 'ARS') =>
    `${moneda === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-AR')}`;

/** "$X · US$Y" para un campo de un array por moneda; omite las monedas en 0. */
const porMonedaStr = (arr: { moneda: string;[k: string]: unknown }[] | undefined, campo: string) => {
    const list = (arr ?? []).filter((m) => Number(m[campo] ?? 0) !== 0);
    return list.length ? list.map((m) => money(Number(m[campo] ?? 0), String(m.moneda))).join(' · ') : money(0);
};

// formatFecha (no new Date().toLocaleDateString): las columnas @db.Date llegan a
// medianoche UTC y en UTC-3 se mostrarían el día ANTERIOR. formatFecha parsea el
// ISO como texto. Corrige de paso las fechas de todas las pestañas.
const fmtDate = (v: unknown) => (v ? formatFecha(String(v)) : '-');

const extractList = <T,>(res: unknown): T[] => {
    if (Array.isArray(res)) return res as T[];
    const r = res as { results?: T[] };
    return r?.results ?? [];
};

const ClienteDetallePage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { addToast } = useUIStore();
    const user = useAuthStore((s) => s.user);
    // Admin/vendedor pueden registrar y borrar contactos (mismo criterio que el backend).
    const puedeEditar = !!user?.roles?.some((r) => r === 'admin' || r === 'super_admin' || r === 'vendedor');

    const [activeTab, setActiveTab] = useState<Tab>('info');
    const [descargandoEC, setDescargandoEC] = useState(false);
    const [cliente, setCliente] = useState<Cliente | null>(null);
    const [ventas, setVentas] = useState<AnyRow[]>([]);
    const [presupuestos, setPresupuestos] = useState<AnyRow[]>([]);
    const [reservas, setReservas] = useState<AnyRow[]>([]);
    const [financiaciones, setFinanciaciones] = useState<AnyRow[]>([]);
    const [solicitudes, setSolicitudes] = useState<AnyRow[]>([]);
    const [postventaCasos, setPostventaCasos] = useState<AnyRow[]>([]);
    const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
    const [interes, setInteres] = useState<VehiculoInteres[]>([]);
    const [estadoCuenta, setEstadoCuenta] = useState<EstadoCuenta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingEstado, setSavingEstado] = useState(false);

    // ─ Alta de contacto (bitácora de seguimiento) ─
    const [segForm, setSegForm] = useState<{ tipo: TipoSeguimiento; fecha: string; nota: string; proximoContacto: string }>({
        tipo: 'llamada', fecha: today(), nota: '', proximoContacto: '',
    });
    const [savingSeg, setSavingSeg] = useState(false);

    // ─ Alta de interés en un vehículo del stock ─
    const [stock, setStock] = useState<Vehiculo[]>([]);
    const [stockCargado, setStockCargado] = useState(false);
    const [interesForm, setInteresForm] = useState<{ vehiculoId: string; nota: string }>({ vehiculoId: '', nota: '' });
    const [savingInteres, setSavingInteres] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (!id) return;
            const cid = Number(id);
            setLoading(true);
            setError(null);
            try {
                const [clienteRes, ventasRes, presupuestosRes, reservasRes, financiacionesRes, solicitudesRes, postventaRes, estadoCuentaRes, seguimientosRes, interesRes] = await Promise.all([
                    clientesApi.getById(cid),
                    ventasApi.getAll({ clienteId: cid }),
                    presupuestosApi.getAll({ clienteId: cid }),
                    reservasApi.getAll({ clienteId: cid }),
                    financiacionesApi.getAll({ clienteId: cid }),
                    solicitudesFinanciacionApi.getAll({ clienteId: cid }),
                    postventaApi.getCasos({ clienteId: cid }),
                    // El estado de cuenta es admin/vendedor: si el rol no tiene acceso
                    // (o falla), se degrada a null y la sección simplemente no aparece.
                    reportesApi.estadoCuenta(cid).catch(() => null),
                    seguimientosApi.getByCliente(cid),
                    // Interés en vehículos (puente CRM↔inventario). admin/vendedor: si
                    // el rol no accede, se degrada a [] y el tab queda vacío.
                    vehiculoInteresApi.getByCliente(cid).catch(() => [] as VehiculoInteres[]),
                ]);
                setCliente(clienteRes);
                setVentas(extractList(ventasRes));
                setPresupuestos(extractList(presupuestosRes));
                setReservas(extractList(reservasRes));
                setFinanciaciones(extractList(financiacionesRes));
                setSolicitudes(extractList(solicitudesRes));
                setPostventaCasos(extractList(postventaRes));
                setEstadoCuenta(estadoCuentaRes);
                setSeguimientos(extractList(seguimientosRes));
                setInteres(extractList(interesRes));
            } catch {
                setError('No se pudo cargar el cliente.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    // Carga diferida del stock: sólo la primera vez que se abre el tab "Interés"
    // (evita pedir el listado completo de vehículos en el load inicial de la ficha).
    useEffect(() => {
        if (activeTab !== 'interes' || stockCargado) return;
        let vivo = true;
        (async () => {
            try {
                const res = await vehiculosApi.getAll({}, { limit: 500 });
                if (vivo) setStock(extractList<Vehiculo>(res));
            } catch {
                if (vivo) addToast('No se pudo cargar el stock de vehículos', 'error');
            } finally {
                if (vivo) setStockCargado(true);
            }
        })();
        return () => { vivo = false; };
    }, [activeTab, stockCargado, addToast]);

    // Registra el interés del cliente en un vehículo del stock. El POST es
    // idempotente en el backend (si ya existe, actualiza la nota), así que no
    // hace falta filtrar acá los ya agregados.
    const handleAddInteres = async () => {
        if (!id) return;
        if (!interesForm.vehiculoId) { addToast('Elegí un vehículo del stock', 'error'); return; }
        setSavingInteres(true);
        try {
            await vehiculoInteresApi.create({
                clienteId: Number(id),
                vehiculoId: Number(interesForm.vehiculoId),
                nota: interesForm.nota.trim() || undefined,
            });
            addToast('Interés registrado', 'success');
            setInteresForm({ vehiculoId: '', nota: '' });
            setInteres(extractList(await vehiculoInteresApi.getByCliente(Number(id))));
        } catch (e) {
            addToast(getErrorMessage(e, 'No se pudo registrar el interés'), 'error');
        } finally {
            setSavingInteres(false);
        }
    };

    const handleDeleteInteres = async (i: VehiculoInteres) => {
        if (!window.confirm('¿Quitar este vehículo de los intereses del cliente?')) return;
        try {
            await vehiculoInteresApi.delete(i.id);
            addToast('Interés eliminado', 'success');
            setInteres((prev) => prev.filter((x) => x.id !== i.id));
        } catch (e) {
            addToast(getErrorMessage(e, 'No se pudo eliminar el interés'), 'error');
        }
    };

    // Descarga el estado de cuenta del cliente (PDF), mismo patrón que el
    // comprobante de venta y el recibo de cuota.
    const handleEstadoCuentaPdf = async () => {
        if (!cliente || !id) return;
        setDescargandoEC(true);
        try {
            const blob = await clientesApi.estadoCuentaPdf(Number(id)) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            const slug = cliente.nombre.trim().replace(/\s+/g, '-').toLowerCase() || `cliente-${id}`;
            link.setAttribute('download', `estado-cuenta-${slug}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('Error al generar el estado de cuenta', 'error');
        } finally {
            setDescargandoEC(false);
        }
    };

    // ─ Bitácora de seguimiento: alta y baja de contactos ─
    const handleAddSeguimiento = async () => {
        if (!id) return;
        if (!segForm.nota.trim()) { addToast('La nota del contacto es obligatoria', 'error'); return; }
        if (!segForm.fecha) { addToast('La fecha es obligatoria', 'error'); return; }
        setSavingSeg(true);
        // `creado` separa dos fallos distintos: si el POST ya devolvió y falla el
        // refetch de abajo, el contacto SÍ quedó guardado — no mostramos "error al
        // registrar" (sería un toast falso), sólo avisamos que la lista quedó vieja.
        let creado = false;
        try {
            await seguimientosApi.create({
                clienteId: Number(id),
                tipo: segForm.tipo,
                fecha: segForm.fecha,
                nota: segForm.nota.trim(),
                proximoContacto: segForm.proximoContacto || undefined,
            });
            creado = true;
            addToast('Contacto registrado', 'success');
            setSegForm({ tipo: 'llamada', fecha: today(), nota: '', proximoContacto: '' });
            setSeguimientos(extractList(await seguimientosApi.getByCliente(Number(id))));
        } catch (e) {
            addToast(
                creado
                    ? 'Contacto guardado. Recargá para ver la lista actualizada.'
                    : getErrorMessage(e, 'Error al registrar el contacto'),
                creado ? 'info' : 'error',
            );
        } finally {
            setSavingSeg(false);
        }
    };

    const handleDeleteSeguimiento = async (s: Seguimiento) => {
        if (!window.confirm('¿Eliminar este contacto de la bitácora?')) return;
        try {
            await seguimientosApi.delete(s.id);
            addToast('Contacto eliminado', 'success');
            setSeguimientos((prev) => prev.filter((x) => x.id !== s.id));
        } catch (e) {
            addToast(getErrorMessage(e, 'Error al eliminar el contacto'), 'error');
        }
    };

    // Cambia la etapa del lead (embudo). Reusa el PATCH /clientes/:id genérico e
    // invalida el listado + el embudo para que los conteos y el badge se refresquen.
    const handleChangeEstadoLead = async (nuevo: EstadoLead) => {
        if (!id || !cliente || nuevo === (cliente.estadoLead ?? 'nuevo')) return;
        setSavingEstado(true);
        try {
            await clientesApi.update(Number(id), { estadoLead: nuevo });
            setCliente((prev) => (prev ? { ...prev, estadoLead: nuevo } : prev));
            addToast(`Etapa actualizada a "${ESTADO_LEAD_MAP[nuevo].label}"`, 'success');
            queryClient.invalidateQueries({ queryKey: ['clientes'] });
        } catch (e) {
            addToast(getErrorMessage(e, 'No se pudo actualizar la etapa'), 'error');
        } finally {
            setSavingEstado(false);
        }
    };

    // Marca / reabre el próximo contacto (lo saca o lo devuelve a la agenda global).
    const handleToggleProximo = async (s: Seguimiento) => {
        const hecho = !s.proximoContactoHecho;
        try {
            await seguimientosApi.marcarProximo(s.id, hecho);
            setSeguimientos((prev) => prev.map((x) => (x.id === s.id ? { ...x, proximoContactoHecho: hecho } : x)));
            addToast(hecho ? 'Próximo contacto marcado como realizado' : 'Próximo contacto reabierto', 'success');
            // Mismas invalidaciones que la agenda: que /seguimientos, la card del
            // Dashboard y la campanita reflejen el cambio (si no, quedan viejos ~2-5 min).
            queryClient.invalidateQueries({ queryKey: ['seguimientos', 'proximos'] });
            queryClient.invalidateQueries({ queryKey: dashboardKeys.alertas() });
            queryClient.invalidateQueries({ queryKey: dashboardKeys.alertasResumen() });
        } catch (e) {
            addToast(getErrorMessage(e, 'No se pudo actualizar el contacto'), 'error');
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '0.75rem', color: 'var(--text-secondary)' }}>
            <RefreshCw size={20} className="spin" /> Cargando...
        </div>
    );

    if (error || !cliente) return (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '1.5rem' }}>{error || 'Cliente no encontrado.'}</p>
            <Button variant="secondary" onClick={() => navigate('/clientes')}>
                <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} /> Volver a Clientes
            </Button>
        </div>
    );

    const tabs: { key: Tab; label: string; icon: typeof User; count?: number }[] = [
        { key: 'info', label: 'Información', icon: User },
        { key: 'ventas', label: 'Ventas', icon: ShoppingCart, count: ventas.length },
        { key: 'reservas', label: 'Reservas', icon: BookmarkCheck, count: reservas.length },
        { key: 'presupuestos', label: 'Presupuestos', icon: FileBarChart, count: presupuestos.length },
        { key: 'financiaciones', label: 'Financiaciones', icon: Banknote, count: financiaciones.length },
        { key: 'solicitudes', label: 'Solicitudes', icon: FileSignature, count: solicitudes.length },
        { key: 'postventa', label: 'Postventa', icon: Wrench, count: postventaCasos.length },
        { key: 'seguimiento', label: 'Seguimiento', icon: Clock, count: seguimientos.length },
        { key: 'interes', label: 'Interés', icon: Star, count: interes.length },
    ];

    return (
        <div className="detalle-container">
            <div className="detalle-header">
                <button className="back-btn" onClick={() => navigate('/clientes')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="cliente-hero">
                    <div className="cliente-avatar-lg">
                        <User size={32} />
                    </div>
                    <div>
                        <h1>{cliente.nombre}</h1>
                        <p className="text-muted">
                            {[cliente.dni && `CUIT/CUIL: ${cliente.dni}`, cliente.email, cliente.telefono].filter(Boolean).join(' · ')}
                        </p>
                        <div className="lead-stage-row">
                            <Badge variant={ESTADO_LEAD_MAP[cliente.estadoLead ?? 'nuevo'].variant}>
                                {ESTADO_LEAD_MAP[cliente.estadoLead ?? 'nuevo'].label}
                            </Badge>
                            {puedeEditar && (
                                <select
                                    className="lead-stage-select"
                                    value={cliente.estadoLead ?? 'nuevo'}
                                    disabled={savingEstado}
                                    onChange={(e) => handleChangeEstadoLead(e.target.value as EstadoLead)}
                                    aria-label="Cambiar etapa del lead"
                                >
                                    {ESTADOS_LEAD.map((k) => <option key={k} value={k}>{ESTADO_LEAD_MAP[k].label}</option>)}
                                </select>
                            )}
                        </div>
                        <p className="text-muted" style={{ marginTop: '0.45rem', fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <UserCheck size={13} /> Vendedor:&nbsp;
                            <strong style={{ color: 'var(--text-secondary)' }}>{cliente.vendedorAsignado?.nombre ?? 'sin asignar'}</strong>
                        </p>
                    </div>
                </div>
                {estadoCuenta && estadoCuenta.financiaciones.length > 0 && (
                    <div style={{ marginLeft: 'auto' }}>
                        <Button variant="secondary" onClick={handleEstadoCuentaPdf} disabled={descargandoEC}>
                            <FileDown size={16} style={{ marginRight: '0.5rem' }} />
                            {descargandoEC ? 'Generando...' : 'Estado de cuenta (PDF)'}
                        </Button>
                    </div>
                )}
            </div>

            <div className="stats-bar">
                <div className="stat-card glass">
                    <ShoppingCart size={20} style={{ color: '#6366f1' }} />
                    <div>
                        <div className="stat-value">{ventas.length}</div>
                        <div className="stat-label">Ventas realizadas</div>
                    </div>
                </div>
                <div className="stat-card glass">
                    <FileBarChart size={20} style={{ color: '#f59e0b' }} />
                    <div>
                        <div className="stat-value">{presupuestos.length}</div>
                        <div className="stat-label">Presupuestos</div>
                    </div>
                </div>
                <div className="stat-card glass">
                    <DollarSign size={20} style={{ color: '#10b981' }} />
                    <div>
                        <div className="stat-value">
                            {ventas.length > 0
                                ? `$${ventas.reduce((sum: number, v) => sum + (Number((v as AnyRow).precioVenta ?? (v as AnyRow).precioFinal) || 0), 0).toLocaleString('es-AR')}`
                                : '$0'}
                        </div>
                        <div className="stat-label">Total facturado</div>
                    </div>
                </div>
                {estadoCuenta && estadoCuenta.resumen.financiaciones > 0 && (
                    <div className="stat-card glass">
                        <Banknote size={20} style={{ color: estadoCuenta.resumen.cuotasVencidas > 0 ? '#ef4444' : '#10b981' }} />
                        <div>
                            <div className="stat-value">{porMonedaStr(estadoCuenta.resumen.porMoneda, 'saldoPendiente')}</div>
                            <div className="stat-label">
                                Saldo pendiente{estadoCuenta.resumen.cuotasVencidas > 0 ? ` · ${estadoCuenta.resumen.cuotasVencidas} vencidas` : ''}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="tabs-bar glass">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(t.key)}
                    >
                        <t.icon size={16} />
                        <span>{t.label}</span>
                        {t.count !== undefined && <span className="tab-badge">{t.count}</span>}
                    </button>
                ))}
            </div>

            <div className="tab-content glass">
                {activeTab === 'info' && (
                    <div className="info-grid">
                        <div className="info-section">
                            <h3>Datos personales</h3>
                            <div className="info-rows">
                                <div className="info-row">
                                    <User size={16} />
                                    <span className="info-label">Nombre completo</span>
                                    <span className="info-value">{cliente.nombre}</span>
                                </div>
                                <div className="info-row">
                                    <FileText size={16} />
                                    <span className="info-label">CUIT/CUIL</span>
                                    <span className="info-value">{cliente.dni || '-'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="info-section">
                            <h3>Contacto</h3>
                            <div className="info-rows">
                                <div className="info-row">
                                    <Phone size={16} />
                                    <span className="info-label">Teléfono</span>
                                    <span className="info-value">{cliente.telefono || '-'}</span>
                                </div>
                                <div className="info-row">
                                    <Mail size={16} />
                                    <span className="info-label">Email</span>
                                    <span className="info-value">{cliente.email || '-'}</span>
                                </div>
                                <div className="info-row">
                                    <MapPin size={16} />
                                    <span className="info-label">Dirección</span>
                                    <span className="info-value">{cliente.direccion || '-'}</span>
                                </div>
                            </div>
                        </div>
                        {cliente.observaciones && (
                            <div className="info-section full-width">
                                <h3>Observaciones</h3>
                                <p className="observaciones-text">{cliente.observaciones}</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'ventas' && (
                    <div>
                        {ventas.length === 0 ? (
                            <div className="empty-state">
                                <ShoppingCart size={48} style={{ opacity: 0.2 }} />
                                <p>Este cliente no tiene ventas registradas.</p>
                            </div>
                        ) : (
                            <table className="data-table">
                                <thead><tr><th>Vehículo</th><th>Fecha</th><th>Precio</th><th>Estado entrega</th></tr></thead>
                                <tbody>
                                    {ventas.map((v) => {
                                        const r = v as AnyRow;
                                        const veh = r.vehiculo as AnyRow | undefined;
                                        return (
                                            <tr key={String(r.id)}>
                                                <td>
                                                    <div className="fw-bold">{String(veh?.marca ?? '')} {String(veh?.modelo ?? '')}</div>
                                                    <div className="text-muted-sm">{String(veh?.anio ?? '')} {veh?.dominio ? `· ${String(veh.dominio)}` : ''}</div>
                                                </td>
                                                <td><div className="flex-cell"><Calendar size={14} />{fmtDate(r.fechaVenta)}</div></td>
                                                <td><div className="flex-cell"><DollarSign size={14} />{fmtMoney(r.precioVenta ?? r.precioFinal)}</div></td>
                                                <td><span className="badge badge-warning">{String(r.estadoEntrega ?? '-')}</span></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === 'reservas' && (
                    <div>
                        {reservas.length === 0 ? (
                            <div className="empty-state"><BookmarkCheck size={48} style={{ opacity: 0.2 }} /><p>Sin reservas.</p></div>
                        ) : (
                            <table className="data-table">
                                <thead><tr><th>Vehículo</th><th>Vencimiento</th><th>Seña</th><th>Estado</th></tr></thead>
                                <tbody>
                                    {reservas.map((row) => {
                                        const r = row as AnyRow;
                                        const veh = r.vehiculo as AnyRow | undefined;
                                        return (
                                            <tr key={String(r.id)}>
                                                <td>
                                                    <div className="fw-bold">{String(veh?.marca ?? '')} {String(veh?.modelo ?? '')}</div>
                                                    <div className="text-muted-sm">{veh?.dominio ? String(veh.dominio) : ''}</div>
                                                </td>
                                                <td><div className="flex-cell"><Calendar size={14} />{fmtDate(r.fechaVencimiento)}</div></td>
                                                <td><div className="flex-cell"><DollarSign size={14} />{fmtMoney(r.montoSena)}</div></td>
                                                <td><span className="badge badge-warning">{String(r.estado ?? '-')}</span></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === 'presupuestos' && (
                    <div>
                        {presupuestos.length === 0 ? (
                            <div className="empty-state"><FileBarChart size={48} style={{ opacity: 0.2 }} /><p>Sin presupuestos.</p></div>
                        ) : (
                            <table className="data-table">
                                <thead><tr><th>Nro</th><th>Fecha</th><th>Monto</th><th>Estado</th></tr></thead>
                                <tbody>
                                    {presupuestos.map((row) => {
                                        const p = row as AnyRow;
                                        return (
                                            <tr key={String(p.id)}>
                                                <td><span className="fw-bold">#{String(p.nroPresupuesto ?? p.id)}</span></td>
                                                <td><div className="flex-cell"><Calendar size={14} />{fmtDate(p.fechaCreacion ?? p.fechaEmision)}</div></td>
                                                <td><div className="flex-cell"><CreditCard size={14} />{fmtMoney(p.montoTotal ?? p.precioTotal)}</div></td>
                                                <td><span className={`badge badge-${p.estado === 'aceptado' ? 'emerald' : p.estado === 'rechazado' ? 'danger' : 'warning'}`}>{String(p.estado ?? '-')}</span></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === 'financiaciones' && (
                    <div>
                        {estadoCuenta && estadoCuenta.financiaciones.length > 0 && (
                            <div className="ec-banner">
                                <div className="ec-item">
                                    <span className="ec-label">Saldo pendiente</span>
                                    <span className="ec-value" style={{ color: '#ef4444' }}>{porMonedaStr(estadoCuenta.resumen.porMoneda, 'saldoPendiente')}</span>
                                </div>
                                <div className="ec-item">
                                    <span className="ec-label">Cuotas vencidas</span>
                                    <span className="ec-value">{estadoCuenta.resumen.cuotasVencidas}</span>
                                </div>
                                <div className="ec-item">
                                    <span className="ec-label">Próximo vencimiento</span>
                                    <span className="ec-value">{estadoCuenta.resumen.proximaCuota
                                        ? `${fmtDate(estadoCuenta.resumen.proximaCuota.vencimiento)} · ${money(estadoCuenta.resumen.proximaCuota.monto, estadoCuenta.resumen.proximaCuota.moneda)}`
                                        : '—'}</span>
                                </div>
                            </div>
                        )}
                        {(estadoCuenta ? estadoCuenta.financiaciones.length : financiaciones.length) === 0 ? (
                            <div className="empty-state"><Banknote size={48} style={{ opacity: 0.2 }} /><p>Sin financiaciones.</p></div>
                        ) : estadoCuenta ? (
                            <table className="data-table">
                                <thead><tr><th>Vehículo</th><th>Inicio</th><th>Monto</th><th>Progreso</th><th>Saldo</th><th>Vencidas</th><th>Próx. venc.</th><th>Estado</th></tr></thead>
                                <tbody>
                                    {estadoCuenta.financiaciones.map((f) => (
                                        <tr key={f.id}>
                                            <td>
                                                <div className="fw-bold">{f.vehiculo || `Financiación #${f.id}`}</div>
                                                {f.dominio && <div className="text-muted-sm">{f.dominio}</div>}
                                            </td>
                                            <td><div className="flex-cell"><Calendar size={14} />{fmtDate(f.fechaInicio)}</div></td>
                                            <td><div className="flex-cell"><DollarSign size={14} />{money(f.montoFinanciado, f.moneda)}</div></td>
                                            <td>{f.cuotasPagadas}/{f.cuotasTotal} <span className="text-muted-sm">pagas</span></td>
                                            <td><span className="fw-bold" style={{ color: f.saldoPendiente > 0 ? '#ef4444' : '#10b981' }}>{money(f.saldoPendiente, f.moneda)}</span></td>
                                            <td>{f.cuotasVencidas > 0 ? <span className="badge badge-danger">{f.cuotasVencidas}</span> : <span className="text-muted-sm">—</span>}</td>
                                            <td className="text-muted-sm">{f.proximaCuota ? fmtDate(f.proximaCuota.vencimiento) : '—'}</td>
                                            <td><span className={`badge badge-${f.estado === 'activa' ? 'emerald' : 'warning'}`}>{f.estado}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <table className="data-table">
                                <thead><tr><th>ID</th><th>Inicio</th><th>Monto</th><th>Cuotas</th><th>Estado</th></tr></thead>
                                <tbody>
                                    {financiaciones.map((row) => {
                                        const f = row as AnyRow;
                                        return (
                                            <tr key={String(f.id)}>
                                                <td><span className="fw-bold">#{String(f.id)}</span></td>
                                                <td><div className="flex-cell"><Calendar size={14} />{fmtDate(f.fechaInicio)}</div></td>
                                                <td><div className="flex-cell"><DollarSign size={14} />{fmtMoney(f.montoFinanciado)}</div></td>
                                                <td>{String(f.cuotas ?? '-')}</td>
                                                <td><span className={`badge badge-${f.estado === 'activa' ? 'emerald' : 'warning'}`}>{String(f.estado ?? '-')}</span></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === 'solicitudes' && (
                    <div>
                        {solicitudes.length === 0 ? (
                            <div className="empty-state"><FileSignature size={48} style={{ opacity: 0.2 }} /><p>Sin solicitudes de financiación externa.</p></div>
                        ) : (
                            <table className="data-table">
                                <thead><tr><th>Financiera</th><th>Monto</th><th>Plazo</th><th>Estado</th><th>Fecha</th></tr></thead>
                                <tbody>
                                    {solicitudes.map((row) => {
                                        const s = row as AnyRow;
                                        const fin = s.financiera as AnyRow | undefined;
                                        return (
                                            <tr key={String(s.id)}>
                                                <td className="fw-bold">{String(fin?.nombre ?? '-')}</td>
                                                <td><div className="flex-cell"><DollarSign size={14} />{fmtMoney(s.montoSolicitado)}</div></td>
                                                <td>{s.plazoCuotas ? `${String(s.plazoCuotas)} cuotas` : '-'}</td>
                                                <td><span className="badge badge-warning">{String(s.estado ?? '-')}</span></td>
                                                <td><div className="flex-cell"><Calendar size={14} />{fmtDate(s.createdAt)}</div></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === 'postventa' && (
                    <div>
                        {postventaCasos.length === 0 ? (
                            <div className="empty-state"><Wrench size={48} style={{ opacity: 0.2 }} /><p>Sin casos de postventa.</p></div>
                        ) : (
                            <table className="data-table">
                                <thead><tr><th>Tipo</th><th>Reclamo</th><th>Fecha reclamo</th><th>Estado</th><th>Fecha cierre</th></tr></thead>
                                <tbody>
                                    {postventaCasos.map((row) => {
                                        const c = row as AnyRow;
                                        return (
                                            <tr key={String(c.id)}>
                                                <td className="fw-bold">{String(c.tipo ?? '-')}</td>
                                                <td className="text-muted-sm" style={{ maxWidth: '300px' }}>{String(c.descripcion ?? '-')}</td>
                                                <td><div className="flex-cell"><Calendar size={14} />{fmtDate(c.fechaReclamo)}</div></td>
                                                <td><span className={`badge badge-${c.estado === 'resuelto' ? 'emerald' : 'warning'}`}>{String(c.estado ?? '-')}</span></td>
                                                <td><div className="flex-cell"><Calendar size={14} />{fmtDate(c.fechaCierre)}</div></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === 'seguimiento' && (
                    <div>
                        {/* Alta de contacto (sólo admin/vendedor; el backend igual lo exige) */}
                        {puedeEditar && (
                            <div className="seg-form">
                                <div className="seg-form-grid">
                                    <div>
                                        <label className="seg-lbl">Tipo</label>
                                        <select className="seg-input" value={segForm.tipo} onChange={(e) => setSegForm((p) => ({ ...p, tipo: e.target.value as TipoSeguimiento }))}>
                                            {(Object.keys(TIPO_SEG) as TipoSeguimiento[]).map((t) => <option key={t} value={t}>{TIPO_SEG[t].label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="seg-lbl">Fecha del contacto</label>
                                        <input className="seg-input" type="date" value={segForm.fecha} onChange={(e) => setSegForm((p) => ({ ...p, fecha: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label className="seg-lbl">Próximo contacto (opcional)</label>
                                        <input className="seg-input" type="date" value={segForm.proximoContacto} onChange={(e) => setSegForm((p) => ({ ...p, proximoContacto: e.target.value }))} />
                                    </div>
                                </div>
                                <textarea className="seg-input" rows={2} placeholder="¿Qué se habló con el cliente?" value={segForm.nota} onChange={(e) => setSegForm((p) => ({ ...p, nota: e.target.value }))} style={{ resize: 'vertical', marginTop: '0.75rem' }} />
                                <div style={{ textAlign: 'right', marginTop: '0.75rem' }}>
                                    <Button variant="primary" size="sm" onClick={handleAddSeguimiento} loading={savingSeg} disabled={savingSeg}>
                                        <Plus size={14} style={{ marginRight: '0.35rem' }} /> Registrar contacto
                                    </Button>
                                </div>
                            </div>
                        )}

                        {seguimientos.length === 0 ? (
                            <div className="empty-state"><Clock size={48} style={{ opacity: 0.2 }} /><p>Sin contactos registrados todavía.</p></div>
                        ) : (
                            <div className="seg-list">
                                {seguimientos.map((s) => {
                                    const t = TIPO_SEG[s.tipo] ?? TIPO_SEG.otro;
                                    return (
                                        <div key={s.id} className="seg-item">
                                            <span className="seg-item-icon" style={{ background: `color-mix(in srgb, ${t.color} 14%, transparent)`, color: t.color }}><t.icon size={16} /></span>
                                            <div className="seg-item-body">
                                                <div className="seg-item-head">
                                                    <span className="seg-tipo" style={{ color: t.color }}>{t.label}</span>
                                                    <span className="flex-cell"><Calendar size={13} />{fmtDate(s.fecha)}</span>
                                                    {s.proximoContacto && (
                                                        s.proximoContactoHecho ? (
                                                            <span className="seg-next seg-next-done"><CheckCircle2 size={13} /> Contactado: {fmtDate(s.proximoContacto)}</span>
                                                        ) : (
                                                            <span className="seg-next"><Clock size={13} /> Próximo: {fmtDate(s.proximoContacto)}</span>
                                                        )
                                                    )}
                                                    {s.proximoContacto && puedeEditar && (
                                                        <button
                                                            type="button"
                                                            className="seg-toggle"
                                                            onClick={() => handleToggleProximo(s)}
                                                            title={s.proximoContactoHecho ? 'Reabrir: vuelve a la agenda' : 'Marcar el próximo contacto como realizado'}
                                                        >
                                                            {s.proximoContactoHecho ? 'Reabrir' : <><Check size={12} /> Marcar hecho</>}
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="seg-nota">{s.nota}</p>
                                                <span className="seg-user">por {s.usuario?.nombre ?? '—'}</span>
                                            </div>
                                            {puedeEditar && (
                                                <button className="seg-del" title="Eliminar contacto" onClick={() => handleDeleteSeguimiento(s)}>
                                                    <Trash2 size={15} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'interes' && (
                    <div>
                        {/* Alta de interés (sólo admin/vendedor; el backend igual lo exige) */}
                        {puedeEditar && (
                            <div className="seg-form">
                                <div className="int-form-grid">
                                    <div>
                                        <label className="seg-lbl">Vehículo del stock</label>
                                        <select
                                            className="seg-input"
                                            value={interesForm.vehiculoId}
                                            onChange={(e) => setInteresForm((p) => ({ ...p, vehiculoId: e.target.value }))}
                                            disabled={!stockCargado}
                                        >
                                            <option value="">{stockCargado ? 'Elegí un vehículo…' : 'Cargando stock…'}</option>
                                            {stock.map((v) => (
                                                <option key={v.id} value={v.id}>
                                                    {v.marca} {v.modelo}{v.version ? ` ${v.version}` : ''}{v.anio ? ` (${v.anio})` : ''}{v.dominio ? ` — ${v.dominio}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="seg-lbl">Nota (opcional)</label>
                                        <input
                                            className="seg-input"
                                            type="text"
                                            placeholder="Ej: quiere financiar, consulta color…"
                                            value={interesForm.nota}
                                            onChange={(e) => setInteresForm((p) => ({ ...p, nota: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', marginTop: '0.75rem' }}>
                                    <Button variant="primary" size="sm" onClick={handleAddInteres} loading={savingInteres} disabled={savingInteres || !stockCargado}>
                                        <Plus size={14} style={{ marginRight: '0.35rem' }} /> Agregar interés
                                    </Button>
                                </div>
                            </div>
                        )}

                        {interes.length === 0 ? (
                            <div className="empty-state"><Star size={48} style={{ opacity: 0.2 }} /><p>Este cliente no tiene vehículos marcados como interés.</p></div>
                        ) : (
                            <div className="seg-list">
                                {interes.map((i) => {
                                    const v = i.vehiculo;
                                    return (
                                        <div key={i.id} className="seg-item">
                                            <span className="seg-item-icon" style={{ background: 'color-mix(in srgb, #f59e0b 14%, transparent)', color: '#f59e0b' }}><Car size={16} /></span>
                                            <div className="seg-item-body">
                                                <div className="seg-item-head">
                                                    <button
                                                        type="button"
                                                        className="int-veh-link"
                                                        onClick={() => v && navigate(`/vehiculos/${v.id}`)}
                                                        disabled={!v}
                                                        title={v ? 'Ver el vehículo' : undefined}
                                                    >
                                                        {v ? `${v.marca} ${v.modelo}${v.version ? ` ${v.version}` : ''}` : `Vehículo #${i.vehiculoId}`}
                                                    </button>
                                                    {v?.anio && <span className="flex-cell">{v.anio}</span>}
                                                    {v?.dominio && <span className="int-chip">{v.dominio}</span>}
                                                    {v?.estado && <span className="int-chip">{v.estado}</span>}
                                                    {v?.precioLista != null && Number(v.precioLista) > 0 && (
                                                        <span className="int-precio">{money(Number(v.precioLista), v.moneda)}</span>
                                                    )}
                                                </div>
                                                {i.nota && <p className="seg-nota">{i.nota}</p>}
                                                <span className="seg-user">agregado el {fmtDate(i.createdAt)}</span>
                                            </div>
                                            {puedeEditar && (
                                                <div className="int-item-actions">
                                                    <button
                                                        className="int-gen-presu"
                                                        title="Generar presupuesto con este vehículo"
                                                        onClick={() => navigate(`/presupuestos?nuevoClienteId=${id}&nuevoVehiculoId=${i.vehiculoId}`)}
                                                    >
                                                        <FileText size={15} />
                                                    </button>
                                                    <button className="seg-del" title="Quitar interés" onClick={() => handleDeleteInteres(i)}>
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style>{`
                .detalle-container { display: flex; flex-direction: column; gap: 1.75rem; animation: fadeIn 0.4s ease-out; }
                .detalle-header { display: flex; align-items: center; gap: 1.5rem; }
                .back-btn { padding: 0.625rem; border-radius: 0.75rem; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); transition: all 0.15s; }
                .back-btn:hover { background: var(--bg-secondary); color: var(--text-primary); transform: translateX(-2px); }
                .cliente-hero { display: flex; align-items: center; gap: 1.25rem; }
                .cliente-avatar-lg { width: 64px; height: 64px; border-radius: 1rem; background: linear-gradient(135deg, #6366f1, #818cf8); color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .cliente-hero h1 { font-size: 1.875rem; font-weight: 800; letter-spacing: -0.03em; }
                .text-muted { color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.25rem; }
                .stats-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; }
                .stat-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem; border-radius: 1rem; border: 1px solid var(--border); }
                .stat-value { font-size: 1.375rem; font-weight: 800; letter-spacing: -0.02em; }
                .stat-label { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.2rem; }
                .ec-banner { display: flex; flex-wrap: wrap; gap: 2.5rem; padding: 1rem 1.5rem; margin-bottom: 1.5rem; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 0.75rem; }
                .ec-item { display: flex; flex-direction: column; gap: 0.25rem; }
                .ec-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); font-weight: 700; }
                .ec-value { font-size: 1.05rem; font-weight: 800; color: var(--text-primary); }
                .tabs-bar { display: flex; gap: 0.5rem; padding: 0.5rem; border-radius: 1rem; border: 1px solid var(--border); flex-wrap: wrap; }
                .tab-btn { display: flex; align-items: center; gap: 0.625rem; padding: 0.625rem 1.25rem; border-radius: 0.625rem; font-weight: 600; font-size: 0.875rem; color: var(--text-secondary); transition: all 0.15s; }
                .tab-btn:hover { color: var(--text-primary); background: var(--bg-secondary); }
                .tab-btn.active { background: var(--accent); color: white; }
                .tab-badge { background: color-mix(in srgb, currentColor 25%, transparent); padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; }
                .tab-btn:not(.active) .tab-badge { background: var(--bg-secondary); color: var(--text-muted); }
                .tab-content { padding: 2rem; border-radius: 1.25rem; border: 1px solid var(--border); }
                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
                .info-section h3 { font-size: 0.875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 1.25rem; }
                .info-rows { display: flex; flex-direction: column; gap: 0.875rem; }
                .info-row { display: flex; align-items: center; gap: 0.875rem; }
                .info-row svg { color: var(--text-muted); flex-shrink: 0; }
                .info-label { font-size: 0.8125rem; color: var(--text-secondary); width: 130px; flex-shrink: 0; }
                .info-value { font-weight: 600; font-size: 0.9375rem; color: var(--text-primary); }
                .full-width { grid-column: span 2; }
                .observaciones-text { color: var(--text-secondary); line-height: 1.6; background: var(--bg-secondary); padding: 1rem; border-radius: 0.75rem; border: 1px solid var(--border); }
                .data-table { width: 100%; border-collapse: collapse; }
                .data-table th { padding: 0.75rem 1rem; background: var(--bg-secondary); color: var(--text-secondary); font-weight: 700; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); text-align: left; }
                .data-table td { padding: 1rem; border-bottom: 1px solid var(--border); }
                .data-table tr:last-child td { border-bottom: none; }
                .data-table tr:hover td { background: var(--bg-secondary); }
                .fw-bold { font-weight: 700; }
                .text-muted-sm { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem; }
                .flex-cell { display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-size: 0.8125rem; }
                .empty-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem; color: var(--text-muted); text-align: center; }
                .seg-form { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 0.9rem; padding: 1.25rem; margin-bottom: 1.5rem; }
                .seg-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.9rem; }
                .seg-lbl { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); font-weight: 700; margin-bottom: 0.35rem; }
                .seg-input { width: 100%; padding: 0.55rem 0.7rem; border-radius: 0.6rem; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-primary); font-size: 0.875rem; }
                .seg-list { display: flex; flex-direction: column; gap: 0.75rem; }
                .seg-item { display: flex; gap: 0.9rem; align-items: flex-start; padding: 1rem; border: 1px solid var(--border); border-radius: 0.9rem; background: var(--bg-card); }
                .seg-item-icon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .seg-item-body { flex: 1; min-width: 0; }
                .seg-item-head { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.35rem; }
                .seg-tipo { font-weight: 800; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
                .lead-stage-row { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.6rem; flex-wrap: wrap; }
                .lead-stage-select { padding: 0.3rem 0.55rem; border-radius: 0.5rem; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-primary); font-size: 0.8rem; cursor: pointer; }
                .lead-stage-select:disabled { opacity: 0.6; cursor: default; }
                .seg-next { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: var(--warning, #f59e0b); font-weight: 600; }
                .seg-next-done { color: var(--success, #16a34a); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--success, #16a34a) 45%, transparent); }
                .seg-toggle { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.72rem; font-weight: 700; color: var(--accent); background: transparent; border: 1px solid var(--border); border-radius: 999px; padding: 0.12rem 0.55rem; cursor: pointer; transition: background 0.15s, color 0.15s; }
                .seg-toggle:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
                .seg-nota { color: var(--text-primary); font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
                .seg-user { font-size: 0.72rem; color: var(--text-muted); margin-top: 0.35rem; display: inline-block; }
                .seg-del { color: var(--text-muted); padding: 0.35rem; border-radius: 0.5rem; flex-shrink: 0; transition: all 0.15s; }
                .seg-del:hover { color: var(--danger, #ef4444); background: rgba(239,68,68,0.1); }
                .int-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.9rem; }
                .int-veh-link { font-weight: 600; color: var(--text-primary); background: none; border: none; padding: 0; cursor: pointer; transition: color 0.15s; }
                .int-veh-link:hover:not(:disabled) { color: var(--primary, #6366f1); text-decoration: underline; }
                .int-veh-link:disabled { cursor: default; }
                .int-chip { font-size: 0.72rem; padding: 0.1rem 0.5rem; border-radius: 999px; background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border); text-transform: capitalize; }
                .int-precio { font-size: 0.8125rem; font-weight: 600; color: var(--success, #10b981); }
                .int-item-actions { display: flex; align-items: flex-start; gap: 0.35rem; flex-shrink: 0; }
                .int-gen-presu { color: var(--text-muted); padding: 0.35rem; border-radius: 0.5rem; transition: all 0.15s; }
                .int-gen-presu:hover { color: var(--primary, #6366f1); background: color-mix(in srgb, var(--primary, #6366f1) 12%, transparent); }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

export default ClienteDetallePage;
