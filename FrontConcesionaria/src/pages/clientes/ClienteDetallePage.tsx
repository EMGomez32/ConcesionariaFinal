import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { clientesApi } from '../../api/clientes.api';
import { ventasApi } from '../../api/ventas.api';
import { presupuestosApi } from '../../api/presupuestos.api';
import { reservasApi } from '../../api/reservas.api';
import { financiacionesApi } from '../../api/financiaciones.api';
import solicitudesFinanciacionApi from '../../api/solicitudesFinanciacion.api';
import { postventaApi } from '../../api/postventa.api';
import type { Cliente } from '../../types/cliente.types';
import Button from '../../components/ui/Button';
import {
    ArrowLeft, User, Phone, Mail, MapPin, FileText,
    ShoppingCart, FileBarChart, Calendar, DollarSign,
    CreditCard, RefreshCw, BookmarkCheck, Wrench, Banknote, FileSignature
} from 'lucide-react';

type Tab = 'info' | 'ventas' | 'presupuestos' | 'reservas' | 'financiaciones' | 'solicitudes' | 'postventa';

type AnyRow = Record<string, unknown>;

const fmtMoney = (v: unknown) =>
    v != null && Number(v) ? `$${Number(v).toLocaleString('es-AR')}` : '-';

const fmtDate = (v: unknown) =>
    v ? new Date(String(v)).toLocaleDateString('es-AR') : '-';

const extractList = <T,>(res: unknown): T[] => {
    if (Array.isArray(res)) return res as T[];
    const r = res as { results?: T[] };
    return r?.results ?? [];
};

const ClienteDetallePage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<Tab>('info');
    const [cliente, setCliente] = useState<Cliente | null>(null);
    const [ventas, setVentas] = useState<AnyRow[]>([]);
    const [presupuestos, setPresupuestos] = useState<AnyRow[]>([]);
    const [reservas, setReservas] = useState<AnyRow[]>([]);
    const [financiaciones, setFinanciaciones] = useState<AnyRow[]>([]);
    const [solicitudes, setSolicitudes] = useState<AnyRow[]>([]);
    const [postventaCasos, setPostventaCasos] = useState<AnyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            if (!id) return;
            const cid = Number(id);
            setLoading(true);
            setError(null);
            try {
                const [clienteRes, ventasRes, presupuestosRes, reservasRes, financiacionesRes, solicitudesRes, postventaRes] = await Promise.all([
                    clientesApi.getById(cid),
                    ventasApi.getAll({ clienteId: cid }),
                    presupuestosApi.getAll({ clienteId: cid }),
                    reservasApi.getAll({ clienteId: cid }),
                    financiacionesApi.getAll({ clienteId: cid }),
                    solicitudesFinanciacionApi.getAll({ clienteId: cid }),
                    postventaApi.getCasos({ clienteId: cid }),
                ]);
                setCliente(clienteRes);
                setVentas(extractList(ventasRes));
                setPresupuestos(extractList(presupuestosRes));
                setReservas(extractList(reservasRes));
                setFinanciaciones(extractList(financiacionesRes));
                setSolicitudes(extractList(solicitudesRes));
                setPostventaCasos(extractList(postventaRes));
            } catch {
                setError('No se pudo cargar el cliente.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

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
                    </div>
                </div>
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
                        {financiaciones.length === 0 ? (
                            <div className="empty-state"><Banknote size={48} style={{ opacity: 0.2 }} /><p>Sin financiaciones.</p></div>
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
                .stats-bar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
                .stat-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem; border-radius: 1rem; border: 1px solid var(--border); }
                .stat-value { font-size: 1.375rem; font-weight: 800; letter-spacing: -0.02em; }
                .stat-label { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.2rem; }
                .tabs-bar { display: flex; gap: 0.5rem; padding: 0.5rem; border-radius: 1rem; border: 1px solid var(--border); flex-wrap: wrap; }
                .tab-btn { display: flex; align-items: center; gap: 0.625rem; padding: 0.625rem 1.25rem; border-radius: 0.625rem; font-weight: 600; font-size: 0.875rem; color: var(--text-secondary); transition: all 0.15s; }
                .tab-btn:hover { color: var(--text-primary); background: var(--bg-secondary); }
                .tab-btn.active { background: var(--accent); color: white; }
                .tab-badge { background: rgba(255,255,255,0.25); padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; }
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
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

export default ClienteDetallePage;
