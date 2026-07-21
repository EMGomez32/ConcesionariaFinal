import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { proveedoresApi } from '../../api/proveedores.api';
import type { Proveedor } from '../../types/proveedor.types';
import { formatFecha } from '../../utils/fecha';
import { labelTipoProveedor } from '../../constants/proveedorTipos';
import Button from '../../components/ui/Button';
import {
    ArrowLeft, Building2, Phone, Mail, MapPin, Tag,
    Car, DollarSign, Wrench, RefreshCw, Truck
} from 'lucide-react';

type Tab = 'info' | 'enviadas' | 'vehiculos' | 'gastos' | 'postventa';

/** Unidad enviada a este proveedor para preparación. */
interface MovimientoDestino {
    id: number;
    fecha?: string;
    fechaRetorno?: string | null;
    motivo?: string | null;
    vehiculo?: { marca?: string; modelo?: string; dominio?: string };
}

interface VehiculoCompra {
    id: number;
    marca?: string;
    modelo?: string;
    anio?: number;
    dominio?: string;
    estado?: string;
    precioCompra?: number | string;
    moneda?: string;
}

interface GastoVehiculo {
    id: number;
    descripcion?: string;
    fecha?: string;
    monto?: number | string;
    moneda?: string;
    vehiculo?: { marca?: string; modelo?: string };
}

interface PostventaItemDet {
    id: number;
    descripcion?: string;
    fecha?: string;
    monto?: number | string;
    caso?: { id: number };
}

const TIPO_COLORS: Record<string, string> = {
    // Servicios a los que se envían unidades: tonos cálidos.
    mecanico: '#f59e0b',
    taller: '#f59e0b',
    chapa_pintura: '#ef4444',
    lavadero: '#06b6d4',
    electricista: '#eab308',
    gomeria: '#8b5cf6',
    // Contrapartes comerciales: tonos fríos.
    importadora: '#6366f1',
    particular: '#10b981',
    financiera: '#3b82f6',
    otro: '#94a3b8',
};

const ProveedorDetallePage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<Tab>('info');
    const [proveedor, setProveedor] = useState<Proveedor | null>(null);
    const [vehiculos, setVehiculos] = useState<VehiculoCompra[]>([]);
    const [gastos, setGastos] = useState<GastoVehiculo[]>([]);
    const [postventaItems, setPostventaItems] = useState<PostventaItemDet[]>([]);
    const [enviadas, setEnviadas] = useState<MovimientoDestino[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            if (!id) return;
            setLoading(true);
            setError(null);
            try {
                const data = await proveedoresApi.getById(Number(id)) as Proveedor & {
                    vehiculosCompra?: VehiculoCompra[];
                    gastosVehiculo?: GastoVehiculo[];
                    postventaItems?: PostventaItemDet[];
                    movimientosDestino?: MovimientoDestino[];
                };
                setProveedor(data);
                setVehiculos(data.vehiculosCompra ?? []);
                setGastos(data.gastosVehiculo ?? []);
                setPostventaItems(data.postventaItems ?? []);
                setEnviadas(data.movimientosDestino ?? []);
            } catch {
                setError('No se pudo cargar el proveedor.');
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

    if (error || !proveedor) return (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '1.5rem' }}>{error || 'Proveedor no encontrado.'}</p>
            <Button variant="secondary" onClick={() => navigate('/proveedores')}>
                <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} /> Volver a Proveedores
            </Button>
        </div>
    );

    const tipoColor = TIPO_COLORS[proveedor.tipo || 'otro'];

    const tabs: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }>; count?: number }[] = [
        { key: 'info', label: 'Información', icon: Building2 },
        { key: 'enviadas', label: 'Unidades enviadas', icon: Truck, count: enviadas.length },
        { key: 'vehiculos', label: 'Vehículos comprados', icon: Car, count: vehiculos.length },
        { key: 'gastos', label: 'Gastos', icon: DollarSign, count: gastos.length },
        { key: 'postventa', label: 'Postventa', icon: Wrench, count: postventaItems.length },
    ];

    return (
        <div className="detalle-container">
            <div className="detalle-header">
                <button className="back-btn" onClick={() => navigate('/proveedores')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="proveedor-hero">
                    <div className="proveedor-avatar-lg" style={{ background: `linear-gradient(135deg, ${tipoColor}, ${tipoColor}99)` }}>
                        <Building2 size={32} />
                    </div>
                    <div>
                        <h1>{proveedor.nombre}</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem' }}>
                            {proveedor.tipo && (
                                <span className="tipo-badge" style={{ background: `${tipoColor}22`, color: tipoColor }}>
                                    {labelTipoProveedor(proveedor.tipo)}
                                </span>
                            )}
                            <span className={`status-badge ${proveedor.activo ? 'active' : 'inactive'}`}>
                                {proveedor.activo ? 'Activo' : 'Inactivo'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="stats-bar">
                <div className="stat-card glass">
                    <Car size={20} style={{ color: '#6366f1' }} />
                    <div>
                        <div className="stat-value">{vehiculos.length}</div>
                        <div className="stat-label">Vehículos comprados</div>
                    </div>
                </div>
                <div className="stat-card glass">
                    <DollarSign size={20} style={{ color: '#f59e0b' }} />
                    <div>
                        <div className="stat-value">{gastos.length}</div>
                        <div className="stat-label">Gastos registrados</div>
                    </div>
                </div>
                <div className="stat-card glass">
                    <Wrench size={20} style={{ color: '#10b981' }} />
                    <div>
                        <div className="stat-value">{postventaItems.length}</div>
                        <div className="stat-label">Ítems postventa</div>
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
                            <h3>Datos del proveedor</h3>
                            <div className="info-rows">
                                <div className="info-row">
                                    <Building2 size={16} />
                                    <span className="info-label">Nombre</span>
                                    <span className="info-value">{proveedor.nombre}</span>
                                </div>
                                <div className="info-row">
                                    <Tag size={16} />
                                    <span className="info-label">Tipo</span>
                                    <span className="info-value">{labelTipoProveedor(proveedor.tipo)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="info-section">
                            <h3>Contacto</h3>
                            <div className="info-rows">
                                <div className="info-row">
                                    <Phone size={16} />
                                    <span className="info-label">Teléfono</span>
                                    <span className="info-value">{proveedor.telefono || '-'}</span>
                                </div>
                                <div className="info-row">
                                    <Mail size={16} />
                                    <span className="info-label">Email</span>
                                    <span className="info-value">{proveedor.email || '-'}</span>
                                </div>
                                <div className="info-row">
                                    <MapPin size={16} />
                                    <span className="info-label">Dirección</span>
                                    <span className="info-value">{proveedor.direccion || '-'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'vehiculos' && (
                    vehiculos.length === 0
                        ? <EmptyState icon={Car} text="No hay vehículos registrados para este proveedor." />
                        : (
                            <table className="data-table">
                                <thead>
                                    <tr><th>Vehículo</th><th>Dominio</th><th>Estado</th><th>Precio compra</th></tr>
                                </thead>
                                <tbody>
                                    {vehiculos.map((v) => (
                                        <tr key={v.id}>
                                            <td><div className="fw-bold">{v.marca} {v.modelo}</div><div className="text-muted-sm">{v.anio}</div></td>
                                            <td>{v.dominio || '-'}</td>
                                            <td><span className="estado-badge">{v.estado}</span></td>
                                            <td>{v.precioCompra ? `$${Number(v.precioCompra).toLocaleString('es-AR')} ${v.moneda || 'ARS'}` : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )
                )}

                {activeTab === 'enviadas' && (
                    enviadas.length === 0
                        ? <EmptyState icon={Truck} text="No se envió ninguna unidad a este proveedor." />
                        : (
                            <table className="data-table">
                                <thead>
                                    <tr><th>Unidad</th><th>Dominio</th><th>Enviada</th><th>Motivo</th><th>Estado</th></tr>
                                </thead>
                                <tbody>
                                    {enviadas.map((m) => (
                                        <tr key={m.id}>
                                            <td className="fw-bold">{m.vehiculo ? `${m.vehiculo.marca} ${m.vehiculo.modelo}` : '-'}</td>
                                            <td>{m.vehiculo?.dominio || '-'}</td>
                                            <td>{formatFecha(m.fecha)}</td>
                                            <td>{m.motivo || '-'}</td>
                                            <td>
                                                {m.fechaRetorno
                                                    ? <span className="text-muted">Volvió {formatFecha(m.fechaRetorno)}</span>
                                                    : <span className="estado-badge">En el taller</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )
                )}

                {activeTab === 'gastos' && (
                    gastos.length === 0
                        ? <EmptyState icon={DollarSign} text="No hay gastos registrados para este proveedor." />
                        : (
                            <table className="data-table">
                                <thead>
                                    <tr><th>Descripción</th><th>Vehículo</th><th>Fecha</th><th>Monto</th></tr>
                                </thead>
                                <tbody>
                                    {gastos.map((g) => (
                                        <tr key={g.id}>
                                            <td>{g.descripcion || '-'}</td>
                                            <td>{g.vehiculo ? `${g.vehiculo.marca} ${g.vehiculo.modelo}` : '-'}</td>
                                            <td>{formatFecha(g.fecha)}</td>
                                            <td className="fw-bold">{g.monto ? `$${Number(g.monto).toLocaleString('es-AR')} ${g.moneda || 'ARS'}` : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )
                )}

                {activeTab === 'postventa' && (
                    postventaItems.length === 0
                        ? <EmptyState icon={Wrench} text="No hay ítems de postventa registrados para este proveedor." />
                        : (
                            <table className="data-table">
                                <thead>
                                    <tr><th>Descripción</th><th>Caso</th><th>Fecha</th><th>Monto</th></tr>
                                </thead>
                                <tbody>
                                    {postventaItems.map((item) => (
                                        <tr key={item.id}>
                                            <td>{item.descripcion || '-'}</td>
                                            <td>{item.caso ? `#${item.caso.id}` : '-'}</td>
                                            <td>{formatFecha(item.fecha)}</td>
                                            <td className="fw-bold">{item.monto ? `$${Number(item.monto).toLocaleString('es-AR')}` : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )
                )}
            </div>

            <style>{`
                .detalle-container { display: flex; flex-direction: column; gap: 1.75rem; animation: fadeIn 0.4s ease-out; }
                .detalle-header { display: flex; align-items: center; gap: 1.5rem; }
                .back-btn { padding: 0.625rem; border-radius: 0.75rem; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); transition: all 0.15s; }
                .back-btn:hover { background: var(--bg-secondary); color: var(--text-primary); transform: translateX(-2px); }

                .proveedor-hero { display: flex; align-items: center; gap: 1.25rem; }
                .proveedor-avatar-lg { width: 64px; height: 64px; border-radius: 1rem; color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .proveedor-hero h1 { font-size: 1.875rem; font-weight: 800; letter-spacing: -0.03em; }

                .stats-bar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
                .stat-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem; border-radius: 1rem; border: 1px solid var(--border); }
                .stat-value { font-size: 1.375rem; font-weight: 800; letter-spacing: -0.02em; }
                .stat-label { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.2rem; }

                .tabs-bar { display: flex; gap: 0.5rem; padding: 0.5rem; border-radius: 1rem; border: 1px solid var(--border); width: fit-content; }
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
                .info-label { font-size: 0.8125rem; color: var(--text-secondary); width: 100px; flex-shrink: 0; }
                .info-value { font-weight: 600; font-size: 0.9375rem; }

                .tipo-badge { padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; }
                .status-badge { padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
                .status-badge.active { background: #d1fae5; color: #065f46; }
                .status-badge.inactive { background: #f1f5f9; color: #64748b; }
                .estado-badge { padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; background: var(--bg-secondary); color: var(--text-secondary); }

                .data-table { width: 100%; border-collapse: collapse; }
                .data-table th { padding: 0.75rem 1rem; background: var(--bg-secondary); color: var(--text-secondary); font-weight: 700; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); text-align: left; }
                .data-table td { padding: 1rem; border-bottom: 1px solid var(--border); }
                .data-table tr:last-child td { border-bottom: none; }
                .data-table tr:hover td { background: var(--bg-secondary); }
                .fw-bold { font-weight: 700; }
                .text-muted-sm { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem; }

                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

const EmptyState = ({ icon: Icon, text }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; text: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        <Icon size={48} style={{ opacity: 0.2 }} />
        <p>{text}</p>
    </div>
);

export default ProveedorDetallePage;
