import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronRight, DollarSign, Package, ArrowRightLeft } from 'lucide-react';
import client from '../../api/client';
import Button from '../ui/Button';
import { useUIStore } from '../../store/uiStore';

type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'otro';

interface PagoItem {
    id: number;
    monto: number;
    metodo: MetodoPago;
    referencia?: string;
    observaciones?: string;
    fecha?: string;
}

interface ExtraItem {
    id: number;
    descripcion: string;
    monto: number;
    comprobanteUrl?: string;
}

interface CanjeItem {
    id: number;
    vehiculoCanjeId: number;
    valorTomado: number;
}

const METODO_LABELS: Record<MetodoPago, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    tarjeta: 'Tarjeta',
    cheque: 'Cheque',
    otro: 'Otro',
};

interface VentaSubResourcesProps {
    ventaId: number;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const VentaSubResources = ({ ventaId }: VentaSubResourcesProps) => {
    const { addToast } = useUIStore();

    // Section open/close
    const [openPagos, setOpenPagos] = useState(true);
    const [openExtras, setOpenExtras] = useState(false);
    const [openCanjes, setOpenCanjes] = useState(false);

    // Lists
    const [pagos, setPagos] = useState<PagoItem[]>([]);
    const [extras, setExtras] = useState<ExtraItem[]>([]);
    const [canjes, setCanjes] = useState<CanjeItem[]>([]);

    // Loading/error
    const [loadingPagos, setLoadingPagos] = useState(false);
    const [loadingExtras, setLoadingExtras] = useState(false);
    const [loadingCanjes, setLoadingCanjes] = useState(false);
    const [errorPagos, setErrorPagos] = useState<string | null>(null);
    const [errorExtras, setErrorExtras] = useState<string | null>(null);
    const [errorCanjes, setErrorCanjes] = useState<string | null>(null);

    // Add forms
    const [showAddPago, setShowAddPago] = useState(false);
    const [showAddExtra, setShowAddExtra] = useState(false);
    const [showAddCanje, setShowAddCanje] = useState(false);

    const [pagoForm, setPagoForm] = useState({ monto: 0, metodo: 'efectivo' as MetodoPago, referencia: '', observaciones: '', fecha: todayStr() });
    const [extraForm, setExtraForm] = useState({ descripcion: '', monto: 0, comprobanteUrl: '' });
    const [canjeForm, setCanjeForm] = useState({ vehiculoCanjeId: 0, valorTomado: 0 });

    const [savingPago, setSavingPago] = useState(false);
    const [savingExtra, setSavingExtra] = useState(false);
    const [savingCanje, setSavingCanje] = useState(false);

    // Helpers to extract array from various server response shapes
    const extractArray = <T,>(res: unknown): T[] => {
        if (Array.isArray(res)) return res as T[];
        const r = res as { data?: unknown; results?: unknown };
        if (Array.isArray(r?.results)) return r.results as T[];
        if (Array.isArray(r?.data)) return r.data as T[];
        const inner = r?.data as { results?: unknown } | undefined;
        if (inner && Array.isArray(inner.results)) return inner.results as T[];
        return [];
    };

    const loadPagos = useCallback(async () => {
        setLoadingPagos(true);
        setErrorPagos(null);
        try {
            const res = await client.get<unknown>(`/ventas/${ventaId}/pagos`, { params: { limit: 100 } });
            setPagos(extractArray<PagoItem>(res));
        } catch (err: unknown) {
            const e = err as { message?: string };
            setErrorPagos(e?.message || 'Error al cargar pagos');
        } finally {
            setLoadingPagos(false);
        }
    }, [ventaId]);

    const loadExtras = useCallback(async () => {
        setLoadingExtras(true);
        setErrorExtras(null);
        try {
            const res = await client.get<unknown>(`/ventas/${ventaId}/extras`, { params: { limit: 100 } });
            setExtras(extractArray<ExtraItem>(res));
        } catch (err: unknown) {
            const e = err as { message?: string };
            setErrorExtras(e?.message || 'Error al cargar extras');
        } finally {
            setLoadingExtras(false);
        }
    }, [ventaId]);

    const loadCanjes = useCallback(async () => {
        setLoadingCanjes(true);
        setErrorCanjes(null);
        try {
            const res = await client.get<unknown>(`/ventas/${ventaId}/canjes`, { params: { limit: 100 } });
            setCanjes(extractArray<CanjeItem>(res));
        } catch (err: unknown) {
            const e = err as { message?: string };
            setErrorCanjes(e?.message || 'Error al cargar canjes');
        } finally {
            setLoadingCanjes(false);
        }
    }, [ventaId]);

    useEffect(() => { loadPagos(); }, [loadPagos]);
    useEffect(() => { loadExtras(); }, [loadExtras]);
    useEffect(() => { loadCanjes(); }, [loadCanjes]);

    // Add handlers
    const handleAddPago = async () => {
        if (pagoForm.monto <= 0) {
            addToast('El monto debe ser mayor a 0', 'error');
            return;
        }
        setSavingPago(true);
        try {
            await client.post(`/ventas/${ventaId}/pagos`, {
                monto: Number(pagoForm.monto),
                metodo: pagoForm.metodo,
                ...(pagoForm.referencia && { referencia: pagoForm.referencia }),
                ...(pagoForm.observaciones && { observaciones: pagoForm.observaciones }),
                ...(pagoForm.fecha && { fecha: pagoForm.fecha }),
            });
            addToast('Pago agregado', 'success');
            setShowAddPago(false);
            setPagoForm({ monto: 0, metodo: 'efectivo', referencia: '', observaciones: '', fecha: todayStr() });
            loadPagos();
        } catch (err: unknown) {
            const e = err as { message?: string };
            addToast(e?.message || 'Error al agregar pago', 'error');
        } finally {
            setSavingPago(false);
        }
    };

    const handleAddExtra = async () => {
        if (!extraForm.descripcion || extraForm.monto <= 0) {
            addToast('Completá descripción y monto', 'error');
            return;
        }
        setSavingExtra(true);
        try {
            await client.post(`/ventas/${ventaId}/extras`, {
                descripcion: extraForm.descripcion,
                monto: Number(extraForm.monto),
                ...(extraForm.comprobanteUrl && { comprobanteUrl: extraForm.comprobanteUrl }),
            });
            addToast('Extra agregado', 'success');
            setShowAddExtra(false);
            setExtraForm({ descripcion: '', monto: 0, comprobanteUrl: '' });
            loadExtras();
        } catch (err: unknown) {
            const e = err as { message?: string };
            addToast(e?.message || 'Error al agregar extra', 'error');
        } finally {
            setSavingExtra(false);
        }
    };

    const handleAddCanje = async () => {
        if (!canjeForm.vehiculoCanjeId || canjeForm.valorTomado <= 0) {
            addToast('Completá vehículo y valor', 'error');
            return;
        }
        setSavingCanje(true);
        try {
            await client.post(`/ventas/${ventaId}/canjes`, {
                vehiculoCanjeId: Number(canjeForm.vehiculoCanjeId),
                valorTomado: Number(canjeForm.valorTomado),
            });
            addToast('Canje agregado', 'success');
            setShowAddCanje(false);
            setCanjeForm({ vehiculoCanjeId: 0, valorTomado: 0 });
            loadCanjes();
        } catch (err: unknown) {
            const e = err as { message?: string };
            addToast(e?.message || 'Error al agregar canje', 'error');
        } finally {
            setSavingCanje(false);
        }
    };

    // Delete handlers
    const handleDeletePago = async (pagoId: number) => {
        if (!confirm('¿Eliminar este pago?')) return;
        try {
            await client.delete(`/ventas/${ventaId}/pagos/${pagoId}`);
            addToast('Pago eliminado', 'success');
            loadPagos();
        } catch (err: unknown) {
            const e = err as { message?: string };
            addToast(e?.message || 'Error al eliminar pago', 'error');
        }
    };

    const handleDeleteExtra = async (extraId: number) => {
        if (!confirm('¿Eliminar este extra?')) return;
        try {
            await client.delete(`/ventas/${ventaId}/extras/${extraId}`);
            addToast('Extra eliminado', 'success');
            loadExtras();
        } catch (err: unknown) {
            const e = err as { message?: string };
            addToast(e?.message || 'Error al eliminar extra', 'error');
        }
    };

    const handleDeleteCanje = async (canjeId: number) => {
        if (!confirm('¿Eliminar este canje?')) return;
        try {
            await client.delete(`/ventas/${ventaId}/canjes/${canjeId}`);
            addToast('Canje eliminado', 'success');
            loadCanjes();
        } catch (err: unknown) {
            const e = err as { message?: string };
            addToast(e?.message || 'Error al eliminar canje', 'error');
        }
    };

    const sectionHeaderStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.85rem 1rem',
        borderRadius: '0.75rem',
        background: 'rgba(15, 23, 42, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        cursor: 'pointer',
        marginBottom: '0.5rem',
    };

    const tableContainer: React.CSSProperties = {
        padding: '1rem',
        borderRadius: '0.75rem',
        background: 'rgba(15, 23, 42, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.04)',
        marginBottom: '1rem',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* PAGOS */}
            <div>
                <div style={sectionHeaderStyle} onClick={() => setOpenPagos(o => !o)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {openPagos ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <DollarSign size={16} style={{ color: '#22c55e' }} />
                        <strong>Pagos</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({pagos.length})</span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setShowAddPago(s => !s); setOpenPagos(true); }}>
                        <Plus size={14} /> Agregar pago
                    </Button>
                </div>
                {openPagos && (
                    <div style={tableContainer}>
                        {showAddPago && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.75rem', background: 'rgba(99,102,241,0.05)', borderRadius: '0.5rem' }}>
                                <input type="number" placeholder="Monto" className="form-input" value={pagoForm.monto || ''}
                                    onChange={e => setPagoForm(f => ({ ...f, monto: +e.target.value }))} />
                                <select className="form-input" value={pagoForm.metodo}
                                    onChange={e => setPagoForm(f => ({ ...f, metodo: e.target.value as MetodoPago }))}>
                                    {Object.entries(METODO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                                <input type="text" placeholder="Referencia" className="form-input" value={pagoForm.referencia}
                                    onChange={e => setPagoForm(f => ({ ...f, referencia: e.target.value }))} />
                                <input type="date" className="form-input" value={pagoForm.fecha}
                                    onChange={e => setPagoForm(f => ({ ...f, fecha: e.target.value }))} />
                                <Button variant="primary" size="sm" onClick={handleAddPago} disabled={savingPago}>
                                    {savingPago ? '...' : 'Guardar'}
                                </Button>
                            </div>
                        )}
                        {loadingPagos ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                                <RefreshCw size={16} className="animate-spin" style={{ display: 'inline-block' }} /> Cargando...
                            </div>
                        ) : errorPagos ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: '#ef4444' }}>{errorPagos}</div>
                        ) : pagos.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin pagos registrados</div>
                        ) : (
                            <table className="data-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>Monto</th>
                                        <th>Método</th>
                                        <th>Referencia</th>
                                        <th>Fecha</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagos.map(p => (
                                        <tr key={p.id}>
                                            <td style={{ fontWeight: 700 }}>${Number(p.monto).toLocaleString('es-AR')}</td>
                                            <td>{METODO_LABELS[p.metodo] || p.metodo}</td>
                                            <td style={{ fontSize: '0.85rem' }}>{p.referencia || '-'}</td>
                                            <td style={{ fontSize: '0.85rem' }}>{p.fecha ? new Date(p.fecha).toLocaleDateString('es-AR') : '-'}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="icon-btn danger" onClick={() => handleDeletePago(p.id)} title="Eliminar">
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>

            {/* EXTRAS */}
            <div>
                <div style={sectionHeaderStyle} onClick={() => setOpenExtras(o => !o)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {openExtras ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <Package size={16} style={{ color: '#f59e0b' }} />
                        <strong>Extras</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({extras.length})</span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setShowAddExtra(s => !s); setOpenExtras(true); }}>
                        <Plus size={14} /> Agregar extra
                    </Button>
                </div>
                {openExtras && (
                    <div style={tableContainer}>
                        {showAddExtra && (
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.75rem', background: 'rgba(245,158,11,0.05)', borderRadius: '0.5rem' }}>
                                <input type="text" placeholder="Descripción" className="form-input" value={extraForm.descripcion}
                                    onChange={e => setExtraForm(f => ({ ...f, descripcion: e.target.value }))} />
                                <input type="number" placeholder="Monto" className="form-input" value={extraForm.monto || ''}
                                    onChange={e => setExtraForm(f => ({ ...f, monto: +e.target.value }))} />
                                <input type="text" placeholder="URL Comprobante (opcional)" className="form-input" value={extraForm.comprobanteUrl}
                                    onChange={e => setExtraForm(f => ({ ...f, comprobanteUrl: e.target.value }))} />
                                <Button variant="primary" size="sm" onClick={handleAddExtra} disabled={savingExtra}>
                                    {savingExtra ? '...' : 'Guardar'}
                                </Button>
                            </div>
                        )}
                        {loadingExtras ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                                <RefreshCw size={16} className="animate-spin" style={{ display: 'inline-block' }} /> Cargando...
                            </div>
                        ) : errorExtras ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: '#ef4444' }}>{errorExtras}</div>
                        ) : extras.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin extras registrados</div>
                        ) : (
                            <table className="data-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>Descripción</th>
                                        <th>Monto</th>
                                        <th>Comprobante</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {extras.map(x => (
                                        <tr key={x.id}>
                                            <td>{x.descripcion}</td>
                                            <td style={{ fontWeight: 700 }}>${Number(x.monto).toLocaleString('es-AR')}</td>
                                            <td style={{ fontSize: '0.85rem' }}>{x.comprobanteUrl ? <a href={x.comprobanteUrl} target="_blank" rel="noreferrer">Ver</a> : '-'}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="icon-btn danger" onClick={() => handleDeleteExtra(x.id)} title="Eliminar">
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>

            {/* CANJES */}
            <div>
                <div style={sectionHeaderStyle} onClick={() => setOpenCanjes(o => !o)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {openCanjes ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <ArrowRightLeft size={16} style={{ color: '#a855f7' }} />
                        <strong>Canjes</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({canjes.length})</span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setShowAddCanje(s => !s); setOpenCanjes(true); }}>
                        <Plus size={14} /> Agregar canje
                    </Button>
                </div>
                {openCanjes && (
                    <div style={tableContainer}>
                        {showAddCanje && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.75rem', background: 'rgba(168,85,247,0.05)', borderRadius: '0.5rem' }}>
                                <input type="number" placeholder="ID Vehículo a tomar" className="form-input" value={canjeForm.vehiculoCanjeId || ''}
                                    onChange={e => setCanjeForm(f => ({ ...f, vehiculoCanjeId: +e.target.value }))} />
                                <input type="number" placeholder="Valor tomado" className="form-input" value={canjeForm.valorTomado || ''}
                                    onChange={e => setCanjeForm(f => ({ ...f, valorTomado: +e.target.value }))} />
                                <Button variant="primary" size="sm" onClick={handleAddCanje} disabled={savingCanje}>
                                    {savingCanje ? '...' : 'Guardar'}
                                </Button>
                            </div>
                        )}
                        {loadingCanjes ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                                <RefreshCw size={16} className="animate-spin" style={{ display: 'inline-block' }} /> Cargando...
                            </div>
                        ) : errorCanjes ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: '#ef4444' }}>{errorCanjes}</div>
                        ) : canjes.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin canjes registrados</div>
                        ) : (
                            <table className="data-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>ID Vehículo</th>
                                        <th>Valor tomado</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {canjes.map(c => (
                                        <tr key={c.id}>
                                            <td>#{c.vehiculoCanjeId}</td>
                                            <td style={{ fontWeight: 700 }}>${Number(c.valorTomado).toLocaleString('es-AR')}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="icon-btn danger" onClick={() => handleDeleteCanje(c.id)} title="Eliminar">
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default VentaSubResources;
