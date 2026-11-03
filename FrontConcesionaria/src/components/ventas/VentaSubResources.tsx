import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronRight, DollarSign, Package, ArrowRightLeft } from 'lucide-react';
import client from '../../api/client';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { usePermisos } from '../../hooks/usePermisos';
import { useConfirm } from '../../hooks/useConfirm';
import { useVehiculos } from '../../hooks/useVehiculos';
import { useUIStore } from '../../store/uiStore';
import { formatFecha, hoyLocal } from '../../utils/fecha';
import { formatMoneda } from '../../utils/moneda';
import { METODO_PAGO_LABEL } from './estados';

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

interface VentaSubResourcesProps {
    ventaId: number;
    /** Moneda de la venta: pagos, extras y canjes la heredan. */
    moneda?: string | null;
}

const todayStr = hoyLocal;

const VentaSubResources = ({ ventaId, moneda }: VentaSubResourcesProps) => {
    const { addToast } = useUIStore();
    const confirm = useConfirm();
    // El acordeón de sub-recursos es donde el cobrador carga el pago y donde el
    // vendedor corrige un extra mal tipeado — pero también donde estaban los tres
    // tachos que el backend cerró. Ver hooks/usePermisos.ts.
    const permisos = usePermisos();
    const m = (v: number | string) => formatMoneda(v, moneda);

    // Unidades para elegir el canje por nombre y dominio (antes se tipeaba el ID).
    const { data: vehiculosData } = useVehiculos({}, { limit: 2000 });
    const vehiculos = vehiculosData?.results ?? [];
    const descripcionUnidad = (id: number) => {
        const v = vehiculos.find((x) => x.id === id);
        return v ? `${v.marca} ${v.modelo}${v.dominio ? ` (${v.dominio})` : ''}` : `Unidad #${id}`;
    };

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
            setErrorPagos(e?.message || 'No se pudieron cargar los pagos');
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
            setErrorExtras(e?.message || 'No se pudieron cargar los extras');
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
            setErrorCanjes(e?.message || 'No se pudieron cargar los canjes');
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
            addToast('El monto tiene que ser mayor a 0', 'error');
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
            addToast('Pago registrado', 'success');
            setShowAddPago(false);
            setPagoForm({ monto: 0, metodo: 'efectivo', referencia: '', observaciones: '', fecha: todayStr() });
            loadPagos();
        } catch (err: unknown) {
            const e = err as { message?: string };
            addToast(e?.message || 'No se pudo registrar el pago', 'error');
        } finally {
            setSavingPago(false);
        }
    };

    const handleAddExtra = async () => {
        if (!extraForm.descripcion || extraForm.monto <= 0) {
            addToast('Completá la descripción y el monto', 'error');
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
            addToast(e?.message || 'No se pudo agregar el extra', 'error');
        } finally {
            setSavingExtra(false);
        }
    };

    const handleAddCanje = async () => {
        if (!canjeForm.vehiculoCanjeId || canjeForm.valorTomado <= 0) {
            addToast('Elegí la unidad y cargá el valor de toma', 'error');
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
            addToast(e?.message || 'No se pudo agregar el canje', 'error');
        } finally {
            setSavingCanje(false);
        }
    };

    // Bajas: confirmación del sistema (antes, window.confirm del navegador).
    const borrar = (opts: { titulo: string; mensaje: string; url: string; ok: string; fallo: string; recargar: () => void }) =>
        confirm({
            title: opts.titulo,
            message: opts.mensaje,
            type: 'danger',
            confirmLabel: 'Eliminar',
            onConfirm: async () => {
                try {
                    await client.delete(opts.url);
                    addToast(opts.ok, 'success');
                    opts.recargar();
                } catch (err: unknown) {
                    const e = err as { message?: string };
                    addToast(e?.message || opts.fallo, 'error');
                }
            },
        });

    const handleDeletePago = (p: PagoItem) => borrar({
        titulo: 'Eliminar pago',
        mensaje: `¿Eliminar el pago de ${m(p.monto)} (${METODO_PAGO_LABEL[p.metodo] ?? p.metodo})? El saldo de la venta vuelve a subir en ese monto.`,
        url: `/ventas/${ventaId}/pagos/${p.id}`,
        ok: 'Pago eliminado',
        fallo: 'No se pudo eliminar el pago',
        recargar: loadPagos,
    });

    const handleDeleteExtra = (x: ExtraItem) => borrar({
        titulo: 'Eliminar extra',
        mensaje: `¿Eliminar el extra "${x.descripcion}" de ${m(x.monto)}?`,
        url: `/ventas/${ventaId}/extras/${x.id}`,
        ok: 'Extra eliminado',
        fallo: 'No se pudo eliminar el extra',
        recargar: loadExtras,
    });

    const handleDeleteCanje = (c: CanjeItem) => borrar({
        titulo: 'Eliminar canje',
        mensaje: `¿Eliminar el canje de ${descripcionUnidad(c.vehiculoCanjeId)} por ${m(c.valorTomado)}?`,
        url: `/ventas/${ventaId}/canjes/${c.id}`,
        ok: 'Canje eliminado',
        fallo: 'No se pudo eliminar el canje',
        recargar: loadCanjes,
    });

    const sectionHeaderStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.85rem 1rem',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        marginBottom: '0.5rem',
        gap: '0.75rem',
    };

    // El título de cada sección es el botón que la abre y cierra; la acción
    // ("Registrar cobro", etc.) es un botón aparte, no anidado.
    const toggleStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flex: 1,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--text-primary)',
    };

    const tableContainer: React.CSSProperties = {
        padding: '1rem',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        marginBottom: '1rem',
    };

    const formStyle: React.CSSProperties = {
        display: 'grid',
        gap: '0.5rem',
        marginBottom: '0.75rem',
        padding: '0.75rem',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-sm)',
        alignItems: 'end',
    };

    const estadoCarga = (loading: boolean, error: string | null, vacio: boolean, textoVacio: string, reintentar: () => void) => {
        if (loading) return (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                <RefreshCw size={16} className="animate-spin" style={{ display: 'inline-block' }} aria-hidden="true" /> Cargando…
            </div>
        );
        if (error) return (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--danger)' }}>
                <p>{error}</p>
                <Button variant="secondary" size="sm" onClick={reintentar}>Reintentar</Button>
            </div>
        );
        if (vacio) return <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{textoVacio}</div>;
        return null;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* PAGOS */}
            <div>
                <div style={sectionHeaderStyle}>
                    <button type="button" style={toggleStyle} aria-expanded={openPagos} onClick={() => setOpenPagos(o => !o)}>
                        {openPagos ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                        <DollarSign size={16} style={{ color: 'var(--success)' }} aria-hidden="true" />
                        <strong>Pagos</strong>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>({pagos.length})</span>
                    </button>
                    {permisos.ventasCobrar && (
                        <Button variant="secondary" size="sm" onClick={() => { setShowAddPago(s => !s); setOpenPagos(true); }}>
                            <Plus size={14} /> Registrar cobro
                        </Button>
                    )}
                </div>
                {openPagos && (
                    <div style={tableContainer}>
                        {showAddPago && (
                            <div style={{ ...formStyle, gridTemplateColumns: '1fr 1fr 1fr 1fr auto' }}>
                                <Input dense containerClassName="mb-0" label="Monto *" type="number" min="0" placeholder="0" value={pagoForm.monto || ''}
                                    onChange={e => setPagoForm(f => ({ ...f, monto: +e.target.value }))} />
                                <Select dense containerClassName="mb-0" label="Medio de pago" value={pagoForm.metodo}
                                    onChange={e => setPagoForm(f => ({ ...f, metodo: e.target.value as MetodoPago }))}>
                                    {Object.entries(METODO_PAGO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </Select>
                                <Input dense containerClassName="mb-0" label="Referencia" type="text" placeholder="N° de recibo o transferencia" value={pagoForm.referencia}
                                    onChange={e => setPagoForm(f => ({ ...f, referencia: e.target.value }))} />
                                <Input dense containerClassName="mb-0" label="Fecha" type="date" value={pagoForm.fecha}
                                    onChange={e => setPagoForm(f => ({ ...f, fecha: e.target.value }))} />
                                <Button variant="primary" size="sm" onClick={handleAddPago} loading={savingPago}>
                                    Guardar
                                </Button>
                            </div>
                        )}
                        {estadoCarga(loadingPagos, errorPagos, pagos.length === 0, 'Todavía no hay pagos registrados.', loadPagos) ?? (
                            <table className="data-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'right' }}>Monto</th>
                                        <th>Medio</th>
                                        <th>Referencia</th>
                                        <th>Fecha</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagos.map(p => (
                                        <tr key={p.id}>
                                            <td style={{ fontWeight: 700, textAlign: 'right' }} className="tabular-nums">{m(p.monto)}</td>
                                            <td>{METODO_PAGO_LABEL[p.metodo] || p.metodo}</td>
                                            <td style={{ fontSize: 'var(--text-sm)' }}>{p.referencia || '-'}</td>
                                            <td style={{ fontSize: 'var(--text-sm)' }} className="tabular-nums">{formatFecha(p.fecha)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                {permisos.ventasQuitarPagoOCanje && (
                                                    <button type="button" className="icon-btn danger" onClick={() => handleDeletePago(p)} title="Eliminar pago" aria-label={`Eliminar el pago de ${m(p.monto)}`}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
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
                <div style={sectionHeaderStyle}>
                    <button type="button" style={toggleStyle} aria-expanded={openExtras} onClick={() => setOpenExtras(o => !o)}>
                        {openExtras ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                        <Package size={16} style={{ color: 'var(--warning)' }} aria-hidden="true" />
                        <strong>Extras</strong>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>({extras.length})</span>
                    </button>
                    {permisos.ventasOperar && (
                        <Button variant="secondary" size="sm" onClick={() => { setShowAddExtra(s => !s); setOpenExtras(true); }}>
                            <Plus size={14} /> Agregar extra
                        </Button>
                    )}
                </div>
                {openExtras && (
                    <div style={tableContainer}>
                        {showAddExtra && (
                            <div style={{ ...formStyle, gridTemplateColumns: '2fr 1fr 1fr auto' }}>
                                <Input dense containerClassName="mb-0" label="Descripción *" type="text" placeholder="Gestoría, patentamiento, accesorio…" value={extraForm.descripcion}
                                    onChange={e => setExtraForm(f => ({ ...f, descripcion: e.target.value }))} />
                                <Input dense containerClassName="mb-0" label="Monto *" type="number" min="0" placeholder="0" value={extraForm.monto || ''}
                                    onChange={e => setExtraForm(f => ({ ...f, monto: +e.target.value }))} />
                                <Input dense containerClassName="mb-0" label="Link al comprobante" type="url" placeholder="Opcional" value={extraForm.comprobanteUrl}
                                    onChange={e => setExtraForm(f => ({ ...f, comprobanteUrl: e.target.value }))} />
                                <Button variant="primary" size="sm" onClick={handleAddExtra} loading={savingExtra}>
                                    Guardar
                                </Button>
                            </div>
                        )}
                        {estadoCarga(loadingExtras, errorExtras, extras.length === 0, 'Todavía no hay extras registrados.', loadExtras) ?? (
                            <table className="data-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>Descripción</th>
                                        <th style={{ textAlign: 'right' }}>Monto</th>
                                        <th>Comprobante</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {extras.map(x => (
                                        <tr key={x.id}>
                                            <td>{x.descripcion}</td>
                                            <td style={{ fontWeight: 700, textAlign: 'right' }} className="tabular-nums">{m(x.monto)}</td>
                                            <td style={{ fontSize: 'var(--text-sm)' }}>{x.comprobanteUrl ? <a href={x.comprobanteUrl} target="_blank" rel="noreferrer">Ver</a> : '-'}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                {permisos.ventasQuitarExtra && (
                                                    <button type="button" className="icon-btn danger" onClick={() => handleDeleteExtra(x)} title="Eliminar extra" aria-label={`Eliminar el extra ${x.descripcion}`}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
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
                <div style={sectionHeaderStyle}>
                    <button type="button" style={toggleStyle} aria-expanded={openCanjes} onClick={() => setOpenCanjes(o => !o)}>
                        {openCanjes ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                        <ArrowRightLeft size={16} style={{ color: 'var(--accent-2)' }} aria-hidden="true" />
                        <strong>Canjes</strong>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>({canjes.length})</span>
                    </button>
                    {permisos.ventasOperar && (
                        <Button variant="secondary" size="sm" onClick={() => { setShowAddCanje(s => !s); setOpenCanjes(true); }}>
                            <Plus size={14} /> Agregar canje
                        </Button>
                    )}
                </div>
                {openCanjes && (
                    <div style={tableContainer}>
                        {showAddCanje && (
                            <div style={{ ...formStyle, gridTemplateColumns: '2fr 1fr auto' }}>
                                <Select dense containerClassName="mb-0" label="Unidad que entrega el cliente *" placeholder="Elegí la unidad" value={canjeForm.vehiculoCanjeId || ''}
                                    onChange={e => setCanjeForm(f => ({ ...f, vehiculoCanjeId: +e.target.value }))}>
                                    {vehiculos.map(v => <option key={v.id} value={v.id}>{v.marca} {v.modelo} — {v.dominio || `#${v.id}`}</option>)}
                                </Select>
                                <Input dense containerClassName="mb-0" label="Valor de toma *" type="number" min="0" placeholder="0" value={canjeForm.valorTomado || ''}
                                    onChange={e => setCanjeForm(f => ({ ...f, valorTomado: +e.target.value }))} />
                                <Button variant="primary" size="sm" onClick={handleAddCanje} loading={savingCanje}>
                                    Guardar
                                </Button>
                            </div>
                        )}
                        {estadoCarga(loadingCanjes, errorCanjes, canjes.length === 0, 'Todavía no hay canjes registrados.', loadCanjes) ?? (
                            <table className="data-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>Unidad</th>
                                        <th style={{ textAlign: 'right' }}>Valor de toma</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {canjes.map(c => (
                                        <tr key={c.id}>
                                            <td>{descripcionUnidad(c.vehiculoCanjeId)}</td>
                                            <td style={{ fontWeight: 700, textAlign: 'right' }} className="tabular-nums">{m(c.valorTomado)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                {permisos.ventasQuitarPagoOCanje && (
                                                    <button type="button" className="icon-btn danger" onClick={() => handleDeleteCanje(c)} title="Eliminar canje" aria-label={`Eliminar el canje de ${descripcionUnidad(c.vehiculoCanjeId)}`}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
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
