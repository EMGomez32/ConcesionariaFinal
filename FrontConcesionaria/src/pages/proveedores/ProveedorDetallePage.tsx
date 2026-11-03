import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { proveedoresApi } from '../../api/proveedores.api';
import type { Proveedor } from '../../types/proveedor.types';
import { formatFecha } from '../../utils/fecha';
import { labelTipoProveedor } from '../../constants/proveedorTipos';
import Button from '../../components/ui/Button';
import Badge, { type BadgeVariant } from '../../components/ui/Badge';
import PageTitle from '../../components/ui/PageTitle';
import { formatMoneda } from '../../utils/moneda';
import { ESTADO_VEHICULO, estadoVehiculoLabel } from '../vehiculos/vehiculoTextos';
import type { EstadoVehiculo } from '../../types/vehiculo.types';
import {
    ArrowLeft, Building2, Phone, Mail, MapPin, Tag,
    Car, DollarSign, Wrench, RefreshCw, Truck
} from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';

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

// Tipo de proveedor → variante del Badge del sistema. Antes eran hex fijos con
// alfa pegado ("#f59e0b22") y un verde #d1fae5/#065f46 para "Activo" que en el
// tema oscuro quedaba como una mancha clara: con tokens se adapta solo.
const TIPO_VARIANT: Record<string, BadgeVariant> = {
    // Servicios a los que se envían unidades.
    mecanico: 'warning',
    taller: 'warning',
    chapa_pintura: 'danger',
    lavadero: 'cyan',
    electricista: 'warning',
    gomeria: 'violet',
    // Contrapartes comerciales.
    importadora: 'violet',
    particular: 'success',
    financiera: 'info',
    otro: 'default',
};

const ProveedorDetallePage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    // Esta pestaña era la única fuga real del precio de compra: `GET /proveedores/:id`
    // no lleva authorize (todo el equipo necesita ver a quién se le compra) y devolvía
    // la fila entera de cada Vehiculo. El backend ahora se lo borra a los no-admin, así
    // que la columna se esconde en vez de quedar mostrando "-" a media concesionaria.
    const permisos = usePermisos();

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
        <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '0.75rem', color: 'var(--text-secondary)' }}>
            <RefreshCw size={20} className="spin" aria-hidden="true" /> Cargando el proveedor…
        </div>
    );

    if (error || !proveedor) return (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '1.5rem' }}>{error || 'Proveedor no encontrado.'}</p>
            <Button variant="secondary" onClick={() => navigate('/proveedores')}>
                <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} aria-hidden="true" /> Volver a Proveedores
            </Button>
        </div>
    );


    const tabs: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }>; count?: number }[] = [
        { key: 'info', label: 'Información', icon: Building2 },
        { key: 'enviadas', label: 'Unidades enviadas', icon: Truck, count: enviadas.length },
        { key: 'vehiculos', label: 'Vehículos comprados', icon: Car, count: vehiculos.length },
        { key: 'gastos', label: 'Gastos', icon: DollarSign, count: gastos.length },
        { key: 'postventa', label: 'Postventa', icon: Wrench, count: postventaItems.length },
    ];

    return (
        <div className="detalle-container">
            <PageTitle title={proveedor.nombre} />
            <div className="detalle-header">
                <button type="button" className="back-btn" onClick={() => navigate('/proveedores')} aria-label="Volver a Proveedores" title="Volver">
                    <ArrowLeft size={20} aria-hidden="true" />
                </button>
                <div className="proveedor-hero">
                    <div className="proveedor-avatar-lg" aria-hidden="true">
                        <Building2 size={32} />
                    </div>
                    <div>
                        <h1>{proveedor.nombre}</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem' }}>
                            {proveedor.tipo && (
                                <Badge variant={TIPO_VARIANT[proveedor.tipo] ?? 'default'}>
                                    {labelTipoProveedor(proveedor.tipo)}
                                </Badge>
                            )}
                            <Badge variant={proveedor.activo ? 'success' : 'default'}>
                                {proveedor.activo ? 'Activo' : 'Inactivo'}
                            </Badge>
                        </div>
                    </div>
                </div>
            </div>

            <div className="stats-bar">
                <div className="stat-card glass">
                    <Car size={20} style={{ color: 'var(--accent-2)' }} />
                    <div>
                        <div className="stat-value">{vehiculos.length}</div>
                        <div className="stat-label">Vehículos comprados</div>
                    </div>
                </div>
                <div className="stat-card glass">
                    <DollarSign size={20} style={{ color: 'var(--warning)' }} />
                    <div>
                        <div className="stat-value">{gastos.length}</div>
                        <div className="stat-label">Gastos registrados</div>
                    </div>
                </div>
                <div className="stat-card glass">
                    <Wrench size={20} style={{ color: 'var(--accent)' }} />
                    <div>
                        <div className="stat-value">{postventaItems.length}</div>
                        <div className="stat-label">Ítems postventa</div>
                    </div>
                </div>
            </div>

            <div className="tabs-bar glass" role="tablist" aria-label="Secciones del proveedor">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === t.key}
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
                                    <span className="info-value">{proveedor.telefono || 'Sin cargar'}</span>
                                </div>
                                <div className="info-row">
                                    <Mail size={16} />
                                    <span className="info-label">Email</span>
                                    <span className="info-value">{proveedor.email || 'Sin cargar'}</span>
                                </div>
                                <div className="info-row">
                                    <MapPin size={16} />
                                    <span className="info-label">Dirección</span>
                                    <span className="info-value">{proveedor.direccion || 'Sin cargar'}</span>
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
                                    <tr><th>Vehículo</th><th>Dominio</th><th>Estado</th>{permisos.vePrecioDeCompra && <th>Precio compra</th>}</tr>
                                </thead>
                                <tbody>
                                    {vehiculos.map((v) => (
                                        <tr key={v.id}>
                                            <td><div className="fw-bold">{v.marca} {v.modelo}</div>{v.anio && <div className="text-muted-sm">{v.anio}</div>}</td>
                                            <td>{v.dominio || 'Sin dominio'}</td>
                                            <td>
                                                <Badge variant={ESTADO_VEHICULO[v.estado as EstadoVehiculo]?.variant ?? 'default'}>
                                                    {estadoVehiculoLabel(v.estado)}
                                                </Badge>
                                            </td>
                                            {permisos.vePrecioDeCompra && (
                                                <td className="tabular-nums">{v.precioCompra ? formatMoneda(v.precioCompra, v.moneda) : 'Sin cargar'}</td>
                                            )}
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
                                            <td className="fw-bold">{m.vehiculo ? `${m.vehiculo.marca} ${m.vehiculo.modelo}` : 'Unidad sin datos'}</td>
                                            <td>{m.vehiculo?.dominio || 'Sin dominio'}</td>
                                            <td>{formatFecha(m.fecha)}</td>
                                            <td>{m.motivo || <span className="text-muted">Sin motivo</span>}</td>
                                            <td>
                                                {m.fechaRetorno
                                                    ? <Badge variant="success">Volvió el {formatFecha(m.fechaRetorno)}</Badge>
                                                    : <Badge variant="warning">En preparación</Badge>}
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
                                            <td>{g.descripcion || <span className="text-muted">Sin descripción</span>}</td>
                                            <td>{g.vehiculo ? `${g.vehiculo.marca} ${g.vehiculo.modelo}` : 'Sin unidad'}</td>
                                            <td>{formatFecha(g.fecha)}</td>
                                            <td className="fw-bold tabular-nums">{g.monto ? formatMoneda(g.monto, g.moneda) : 'Sin importe'}</td>
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
                                            <td>{item.descripcion || <span className="text-muted">Sin descripción</span>}</td>
                                            <td>{item.caso ? `Caso #${item.caso.id}` : 'Sin caso'}</td>
                                            <td>{formatFecha(item.fecha)}</td>
                                            <td className="fw-bold tabular-nums">{item.monto ? formatMoneda(item.monto) : 'Sin importe'}</td>
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
                .back-btn { padding: 0.625rem; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); transition: all 0.15s; }
                .back-btn:hover { background: var(--bg-secondary); color: var(--text-primary); transform: translateX(-2px); }

                .proveedor-hero { display: flex; align-items: center; gap: 1.25rem; }
                .proveedor-avatar-lg { width: 64px; height: 64px; border-radius: var(--radius-lg); background: var(--accent-light); color: var(--accent); border: 1px solid rgba(var(--accent-rgb), 0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .proveedor-hero h1 { font-size: var(--text-2xl); font-weight: 800; letter-spacing: -0.03em; }

                .stats-bar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
                .stat-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem; border-radius: var(--radius-lg); border: 1px solid var(--border); }
                .stat-value { font-size: var(--text-xl); font-weight: 800; letter-spacing: -0.02em; }
                .stat-label { font-size: var(--text-xs); color: var(--text-secondary); margin-top: 0.2rem; }

                .tabs-bar { display: flex; gap: 0.5rem; padding: 0.5rem; border-radius: var(--radius-lg); border: 1px solid var(--border); width: fit-content; }
                .tab-btn { display: flex; align-items: center; gap: 0.625rem; padding: 0.625rem 1.25rem; border-radius: var(--radius-md); font-weight: 600; font-size: var(--text-sm); color: var(--text-secondary); transition: all 0.15s; }
                .tab-btn:hover { color: var(--text-primary); background: var(--bg-secondary); }
                .tab-btn.active { background: var(--accent); color: var(--text-on-accent); }
                .tab-btn:focus-visible { box-shadow: 0 0 0 3px var(--ring); }
                .tab-badge { background: color-mix(in srgb, currentColor 25%, transparent); padding: 0.125rem 0.5rem; border-radius: var(--radius-pill); font-size: var(--text-2xs); font-weight: 700; }
                .tab-btn:not(.active) .tab-badge { background: var(--bg-secondary); color: var(--text-muted); }

                .tab-content { padding: 2rem; border-radius: var(--radius-lg); border: 1px solid var(--border); }

                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
                .info-section h3 { font-size: var(--text-sm); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 1.25rem; }
                .info-rows { display: flex; flex-direction: column; gap: 0.875rem; }
                .info-row { display: flex; align-items: center; gap: 0.875rem; }
                .info-row svg { color: var(--text-muted); flex-shrink: 0; }
                .info-label { font-size: var(--text-sm); color: var(--text-secondary); width: 100px; flex-shrink: 0; }
                .info-value { font-weight: 600; font-size: var(--text-base); }


                .data-table { width: 100%; border-collapse: collapse; }
                .data-table th { padding: 0.75rem 1rem; background: var(--bg-secondary); color: var(--text-secondary); font-weight: 700; font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); text-align: left; }
                .data-table td { padding: 1rem; border-bottom: 1px solid var(--border); }
                .data-table tr:last-child td { border-bottom: none; }
                .data-table tr:hover td { background: var(--bg-secondary); }
                .fw-bold { font-weight: 700; }
                .text-muted-sm { font-size: var(--text-xs); color: var(--text-muted); margin-top: 0.15rem; }

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
