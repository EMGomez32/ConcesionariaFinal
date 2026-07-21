import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { presupuestosApi } from '../../api/presupuestos.api';
import { clientesApi } from '../../api/clientes.api';
import { usuariosApi } from '../../api/usuarios.api';
import { sucursalesApi } from '../../api/sucursales.api';
import { vehiculosApi } from '../../api/vehiculos.api';
import client from '../../api/client';
import type { EstadoPresupuesto, Presupuesto } from '../../types/presupuesto.types';
import type { FormaPagoVenta } from '../../types/venta.types';
import { formatFecha } from '../../utils/fecha';

/* ── tipos locales ── */
interface PresupuestoItem {
    id: number;
    vehiculoId?: number;
    vehiculo?: { marca: string; modelo: string; dominio?: string; vin?: string };
    precioLista: number | string;
    descuento?: number | string;
    precioFinal: number | string;
}

interface PresupuestoExtra {
    id?: number;
    descripcion?: string;
    monto: number | string;
}

interface PresupuestoCanje {
    descripcion?: string;
    anio?: number | string;
    km?: number | string;
    dominio?: string;
    valorTomado: number | string;
    observaciones?: string;
}

interface PresupuestoRow extends Omit<Presupuesto, 'items'> {
    items?: PresupuestoItem[];
    extras?: PresupuestoExtra[];
    canje?: PresupuestoCanje | null;
    sucursal?: { nombre: string };
    observaciones?: string;
}

interface ClienteRef {
    id: number;
    nombre: string;
}

interface SucursalRef {
    id: number;
    nombre: string;
}

interface VehiculoRef {
    id: number;
    marca: string;
    modelo: string;
    version?: string;
    dominio?: string;
    vin?: string;
}

interface VendedorRef {
    id: number;
    nombre: string;
}
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useUIStore } from '../../store/uiStore';
import {
    Plus, Search, Eye, Pencil, Trash2, ChevronLeft, ChevronRight,
    SendHorizonal, CheckCircle, XCircle, Clock, FileText, Car,
    ArrowRightLeft, DollarSign, Calendar, User,
    MapPin, Hash, RefreshCw, Briefcase, Calculator, ArrowRight
} from 'lucide-react';

const FORMA_PAGO_OPTIONS_CONV: { value: FormaPagoVenta; label: string }[] = [
    { value: 'contado', label: 'Contado / Efectivo' },
    { value: 'transferencia', label: 'Transferencia Bancaria' },
    { value: 'financiado_propio', label: 'Financiación Interna' },
    { value: 'financiado_externo', label: 'Crédito Prendario / UVA' },
    { value: 'canje_mas_diferencia', label: 'Canje + Saldo' },
    { value: 'mixto', label: 'Pago Mixto' },
];

/* ── helpers ── */
const today = () => new Date().toISOString().slice(0, 10);

const genNro = () => {
    const d = new Date();
    return `P-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getTime()).slice(-4)}`;
};

// fechaCreacion y validoHasta son @db.Date: se formatean sin conversión de zona
// horaria para que no se corran un día.
const fmt = (v: string | null | undefined) => formatFecha(v);

const currencyFmt = (v: number | string, moneda = 'ARS') => {
    // Intl.NumberFormat lanza RangeError con un código de moneda inválido, y el
    // default del parámetro no cubre un String(undefined) === "undefined".
    const cur = moneda === 'USD' ? 'USD' : 'ARS';
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(Number(v) || 0);
};

/* ── status config ── */
type Variant = 'default' | 'info' | 'success' | 'danger' | 'warning';
const STATUS: Record<EstadoPresupuesto, { label: string; variant: Variant }> = {
    borrador: { label: 'Borrador', variant: 'default' },
    enviado: { label: 'Enviado', variant: 'info' },
    aceptado: { label: 'Aceptado', variant: 'success' },
    rechazado: { label: 'Rechazado', variant: 'danger' },
    vencido: { label: 'Vencido', variant: 'warning' },
    cancelado: { label: 'Cancelado', variant: 'default' },
};

/* ── blank rows ── */
const emptyItem = () => ({ vehiculoId: '', precioLista: '', descuento: '0', precioFinal: '' });

const emptyCanje = () => ({ descripcion: '', anio: '', km: '', dominio: '', valorTomado: '', observaciones: '' });

const blankForm = () => ({
    nroPresupuesto: genNro(),
    sucursalId: '',
    clienteId: '',
    vendedorId: '',
    moneda: 'ARS' as 'ARS' | 'USD',
    fechaCreacion: today(),
    validoHasta: '',
    observaciones: '',
    items: [emptyItem()],
    extras: [] as { descripcion: string; monto: string }[],
    conCanje: false,
    canje: emptyCanje(),
});

const PresupuestosPage = () => {
    const { addToast } = useUIStore();
    const navigate = useNavigate();

    /* ── convertir en venta ── */
    const [convertirId, setConvertirId] = useState<number | null>(null);
    const [convertirForm, setConvertirForm] = useState({
        formaPago: 'contado' as FormaPagoVenta,
        moneda: 'ARS' as 'ARS' | 'USD',
        fechaVenta: new Date().toISOString().slice(0, 10),
        observaciones: '',
    });
    const [convertirSaving, setConvertirSaving] = useState(false);

    const handleConvertirEnVenta = async () => {
        if (!convertirId) return;
        setConvertirSaving(true);
        try {
            await client.post(`/presupuestos/${convertirId}/convertir-en-venta`, {
                formaPago: convertirForm.formaPago,
                fechaVenta: convertirForm.fechaVenta,
                moneda: convertirForm.moneda,
                ...(convertirForm.observaciones && { observaciones: convertirForm.observaciones }),
            });
            addToast('Venta creada con éxito', 'success');
            setConvertirId(null);
            navigate('/ventas');
        } catch (err: unknown) {
            const e = err as { message?: string; code?: string };
            addToast(e?.message || 'Error al convertir el presupuesto', 'error');
        } finally {
            setConvertirSaving(false);
        }
    };

    /* ── data ── */
    const [presupuestos, setPresupuestos] = useState<PresupuestoRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    /* ── filters ── */
    const [search, setSearch] = useState('');
    const [filterEstado, setFilterEstado] = useState('');

    /* ── catalogs ── */
    const [clientes, setClientes] = useState<ClienteRef[]>([]);
    const [vendedores, setVendedores] = useState<VendedorRef[]>([]);
    const [sucursales, setSucursales] = useState<SucursalRef[]>([]);
    const [vehiculos, setVehiculos] = useState<VehiculoRef[]>([]);

    /* ── modals ── */
    const [createOpen, setCreateOpen] = useState(false);
    const [detailId, setDetailId] = useState<number | null>(null);
    const [detail, setDetail] = useState<PresupuestoRow | null>(null);
    const [, setDetailLoading] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState({ estado: '', observaciones: '' });
    const [deleteId, setDeleteId] = useState<number | null>(null);

    /* ── create form ── */
    const [form, setForm] = useState(blankForm());
    const [saving, setSaving] = useState(false);

    /* ── load catalogs ── */
    useEffect(() => {
        Promise.all([
            clientesApi.getAll({}, { limit: 1000 }),
            usuariosApi.getAll({}, { limit: 1000 }),
            sucursalesApi.getAll({}, { limit: 100 }),
            vehiculosApi.getAll({ estado: 'publicado' }, { limit: 1000 }),
        ]).then(([c, u, s, v]) => {
            setClientes((c.results ?? []) as ClienteRef[]);
            setVendedores(((u as { results?: VendedorRef[] }).results ?? []));
            setSucursales(((s as { results?: SucursalRef[] }).results ?? []));
            setVehiculos((v.results ?? []) as VehiculoRef[]);
        });
    }, []);

    /* ── load list ── */
    const load = useCallback(async (p = 1) => {
        setLoading(true);
        try {
            const params: Record<string, unknown> = { page: p, limit: 15 };
            if (filterEstado) params.estado = filterEstado;
            const res = await presupuestosApi.getAll(params);
            setPresupuestos((res?.results ?? []) as PresupuestoRow[]);
            setTotalPages(res?.totalPages ?? 1);
            setPage(p);
        } catch {
            addToast('Error al sincronizar la matriz de cotizaciones', 'error');
        } finally {
            setLoading(false);
        }
    }, [filterEstado, addToast]);

    useEffect(() => { load(1); }, [load]);

    /* ── load detail ── */
    useEffect(() => {
        if (detailId === null) { setDetail(null); return; }
        setDetailLoading(true);
        presupuestosApi.getById(detailId)
            // El interceptor de axios ya devuelve el body: el endpoint responde
            // el presupuesto plano, sin envoltorio. Un `.data.data` acá dejaba
            // `detail` siempre en null y el modal girando para siempre.
            .then(r => setDetail((r as unknown as PresupuestoRow) ?? null))
            .catch(() => addToast('Fallo en la recuperación del expediente comercial', 'error'))
            .finally(() => setDetailLoading(false));
    }, [detailId, addToast]);

    /* ── client-side search ── */
    const filtered = presupuestos.filter(p => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (
            p.nroPresupuesto?.toLowerCase().includes(s) ||
            p.cliente?.nombre?.toLowerCase().includes(s) ||
            p.vendedor?.nombre?.toLowerCase().includes(s)
        );
    });

    /* ── create ── */
    const handleCreate = async () => {
        if (!form.sucursalId || !form.clienteId || !form.vendedorId) {
            addToast('Complete la estructura mandatoria: sucursal, cliente y oficial', 'error'); return;
        }
        const validItems = form.items.filter(i => i.vehiculoId && i.precioFinal);
        if (validItems.length === 0) {
            addToast('Debe incluir al menos una unidad cotizada', 'error'); return;
        }
        setSaving(true);
        try {
            const body: Parameters<typeof presupuestosApi.create>[0] = {
                nroPresupuesto: form.nroPresupuesto,
                sucursalId: Number(form.sucursalId),
                clienteId: Number(form.clienteId),
                vendedorId: Number(form.vendedorId),
                moneda: form.moneda,
                fechaCreacion: form.fechaCreacion,
                ...(form.validoHasta && { validoHasta: form.validoHasta }),
                ...(form.observaciones && { observaciones: form.observaciones }),
                items: validItems.map(i => ({
                    vehiculoId: Number(i.vehiculoId),
                    precioLista: Number(i.precioLista) || Number(i.precioFinal),
                    descuento: Number(i.descuento) || 0,
                    precioFinal: Number(i.precioFinal),
                })),
                externos: form.extras
                    .filter(e => e.descripcion && e.monto)
                    .map(e => ({ descripcion: e.descripcion, monto: Number(e.monto) })),
            };
            if (form.conCanje && form.canje.valorTomado) {
                body.canjes = {
                    descripcion: form.canje.descripcion || undefined,
                    anio: form.canje.anio ? Number(form.canje.anio) : undefined,
                    km: form.canje.km ? Number(form.canje.km) : undefined,
                    dominio: form.canje.dominio || undefined,
                    valorTomado: Number(form.canje.valorTomado),
                    observaciones: form.canje.observaciones || undefined,
                };
            }
            await presupuestosApi.create(body);
            addToast('Propuesta comercial instrumentada con éxito', 'success');
            setCreateOpen(false);
            setForm(blankForm());
            load(1);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } };
            addToast(err.response?.data?.message ?? 'Fallo en la validación de la cotización', 'error');
        } finally {
            setSaving(false);
        }
    };

    /* ── edit ── */
    const openEdit = (p: PresupuestoRow) => {
        setEditId(Number(p.id));
        setEditForm({ estado: String(p.estado || ''), observaciones: String(p.observaciones || '') });
    };

    const handleEdit = async () => {
        if (!editId) return;
        setSaving(true);
        try {
            await presupuestosApi.update(editId, {
                estado: editForm.estado || undefined,
                observaciones: editForm.observaciones || undefined,
            });
            addToast('Parámetros de presupuesto actualizados', 'success');
            setEditId(null);
            load(page);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } };
            addToast(err.response?.data?.message ?? 'Error al actualizar expediente', 'error');
        } finally {
            setSaving(false);
        }
    };

    /* ── quick estado transitions ── */
    const changeEstado = async (id: number, estado: string) => {
        try {
            await presupuestosApi.update(id, { estado });
            addToast(`Expediente actualizado a: ${STATUS[estado as EstadoPresupuesto]?.label.toUpperCase()}`, 'success');
            load(page);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } };
            addToast(err.response?.data?.message ?? 'Fallo en la transición administrativa', 'error');
        }
    };

    /* ── delete ── */
    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await presupuestosApi.delete(deleteId);
            addToast('Cotización revocada del sistema', 'success');
            setDeleteId(null);
            load(page);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } };
            addToast(err.response?.data?.message ?? 'Error al anular presupuesto', 'error');
        }
    };

    /* ── dynamic row helpers ── */
    const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
    const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
    const updItem = (i: number, k: string, v: string) =>
        setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }));

    /* ── total calc ── */
    const calcTotal = (pres: PresupuestoRow) => {
        const items = (pres.items ?? []).reduce((s: number, i: PresupuestoItem) => s + Number(i.precioFinal ?? 0), 0);
        const extras = (pres.extras ?? []).reduce((s: number, e: PresupuestoExtra) => s + Number(e.monto ?? 0), 0);
        const canje = pres.canje ? Number(pres.canje.valorTomado ?? 0) : 0;
        return items + extras - canje;
    };

    const currentTotal = () => {
        const items = form.items.reduce((s, i) => s + Number(i.precioFinal || 0), 0);
        const extras = form.extras.reduce((s, e) => s + Number(e.monto || 0), 0);
        const canje = form.conCanje ? Number(form.canje.valorTomado || 0) : 0;
        return items + extras - canje;
    };

    /* ── transition map ── */
    const transitions: Record<string, { label: string; next: string; icon: React.ReactNode; clr: string }[]> = {
        borrador: [{ label: 'Emitir', next: 'enviado', icon: <SendHorizonal size={14} />, clr: '#3b82f6' }],
        enviado: [
            { label: 'Aprobar', next: 'aceptado', icon: <CheckCircle size={14} />, clr: '#22c55e' },
            { label: 'Rechazar', next: 'rechazado', icon: <XCircle size={14} />, clr: '#ef4444' },
            { label: 'Vencer', next: 'vencido', icon: <Clock size={14} />, clr: '#f59e0b' },
        ],
        aceptado: [{ label: 'Anular', next: 'cancelado', icon: <XCircle size={14} />, clr: '#6b7280' }],
    };

    return (
        <div className="page-container animate-fade-in">
            {/* Header */}
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <FileText size={20} />
                        </div>
                        <h1>Cotizaciones y Presupuestos</h1>
                    </div>
                    <p>Administración estratégica de propuestas comerciales, funnel de ventas y auditoría de ofertas.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => load(page)}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </Button>
                    <Button variant="primary" onClick={() => { setForm(blankForm()); setCreateOpen(true); }}>
                        <Plus size={18} /> Nueva Cotización Comercial
                    </Button>
                </div>
            </header>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="card glass stat-tile border-blue-500/20 bg-blue-500/5 group hover:scale-[1.02] transition-all">
                    <div className="relative z-10">
                        <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest block mb-2">En Negociación</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white">{presupuestos.filter(p => p.estado === 'enviado').length}</span>
                            <span className="text-xs font-bold text-slate-500 italic">COTIZACIONES</span>
                        </div>
                    </div>
                    <SendHorizonal size={64} className="stat-tile-bg" />
                </div>
                <div className="card glass stat-tile border-emerald-500/20 bg-emerald-500/5 group hover:scale-[1.02] transition-all">
                    <div className="relative z-10">
                        <span className="text-[10px] font-black uppercase text-emerald-400 tracking-widest block mb-2">Cierre Mes</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white">{presupuestos.filter(p => p.estado === 'aceptado').length}</span>
                            <span className="text-xs font-bold text-slate-500 italic">CONVERTIDOS</span>
                        </div>
                    </div>
                    <CheckCircle size={64} className="stat-tile-bg" />
                </div>
                <div className="card glass p-6 border-slate-700/30 bg-slate-800/10 relative overflow-hidden group md:col-span-2">
                    <div className="relative z-10 flex justify-between items-center h-full">
                        <div>
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Volumen de Proyección</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-white tabular-nums">
                                    ${presupuestos.reduce((s, p) => s + calcTotal(p), 0).toLocaleString('es-AR')}
                                </span>
                                <Badge variant="info">PRE-VENTA</Badge>
                            </div>
                        </div>
                        <Calculator size={50} className="text-accent opacity-20" />
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="card glass filters-bar flex flex-wrap items-center justify-between gap-6 mb-6">
                <div className="flex-1 min-w-[300px] relative">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                        type="text"
                        placeholder="BUSCAR POR NRO DE EXPEDIENTE, CLIENTE O RESPONSABLE COMERCIAL..."
                        className="form-input-premium pl-12 h-12 w-full"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex gap-4 items-center">
                    <div className="min-w-[170px]">
                        <label className="form-label-xs">Ambiente Legal</label>
                        <select className="form-input-select w-full" value={filterEstado} onChange={e => { setFilterEstado(e.target.value); setPage(1); }}>
                            <option value="">TODOS LOS ESTADOS</option>
                            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label.toUpperCase()}</option>)}
                        </select>
                    </div>
                    <Button variant="secondary" onClick={() => { setSearch(''); setFilterEstado(''); setPage(1); }}>
                        <RefreshCw size={18} />
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div className="table-container card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Identificador</th>
                            <th>Emisión</th>
                            <th>Validez</th>
                            <th>Interesado</th>
                            <th>Oficial de Cuenta</th>
                            <th>Estado Comercial</th>
                            <th style={{ textAlign: 'right' }}>Gestión</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ padding: '8rem', textAlign: 'center' }}><RefreshCw className="animate-spin text-accent mx-auto" size={40} /></td></tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="flex flex-col items-center py-24 text-muted">
                                        <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center mb-4 ring-1 ring-slate-700">
                                            <FileText size={40} className="text-slate-600" />
                                        </div>
                                        <p className="text-xl font-black text-slate-400 italic">No se registran cotizaciones activas</p>
                                        <p className="text-sm font-medium">Inicie una nueva propuesta con el botón superior.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filtered.map(p => (
                                <tr key={p.id} onClick={() => setDetailId(p.id)} className="cursor-pointer group">
                                    <td>
                                        <div className="flex flex-col">
                                            <span className="font-mono text-xs font-bold text-accent-light tracking-widest">{p.nroPresupuesto}</span>
                                            <span className="text-[10px] font-black text-slate-500 uppercase">DOC-COM-{p.id}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <Calendar size={14} />
                                            <span className="text-xs font-semibold">{fmt(p.fechaCreacion)}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`text-xs font-black ${p.validoHasta && new Date(p.validoHasta) < new Date() ? 'text-red-400' : 'text-slate-300'}`}>
                                            {fmt(p.validoHasta)}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700">
                                                <User size={14} />
                                            </div>
                                            <span className="font-bold text-white uppercase text-xs truncate max-w-[150px]">{p.cliente?.nombre ?? '-'}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <Briefcase size={14} className="text-slate-500" />
                                            <span className="text-[10px] font-black text-slate-500 uppercase">{p.vendedor?.nombre ?? 'NO ASIGN.'}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <Badge variant={STATUS[p.estado as EstadoPresupuesto]?.variant ?? 'default'}>
                                            {STATUS[p.estado as EstadoPresupuesto]?.label.toUpperCase()}
                                        </Badge>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all" onClick={e => e.stopPropagation()}>
                                            {(transitions[p.estado] ?? []).map(t => (
                                                <button key={t.next} className="icon-btn" title={t.label}
                                                    style={{ color: t.clr }} onClick={() => changeEstado(p.id, t.next)}>
                                                    {t.icon}
                                                </button>
                                            ))}
                                            {p.estado === 'aceptado' && (
                                                <button className="icon-btn" title="Convertir en venta"
                                                    style={{ color: '#22c55e' }}
                                                    onClick={() => {
                                                        setConvertirId(Number(p.id));
                                                        setConvertirForm({
                                                            formaPago: 'contado',
                                                            moneda: (p.moneda as 'ARS' | 'USD') || 'ARS',
                                                            fechaVenta: new Date().toISOString().slice(0, 10),
                                                            observaciones: '',
                                                        });
                                                    }}>
                                                    <ArrowRight size={16} />
                                                </button>
                                            )}
                                            <button className="icon-btn" title="Ver Expediente" onClick={() => setDetailId(p.id)}><Eye size={16} /></button>
                                            <button className="icon-btn" title="Editar Metadatos" onClick={() => openEdit(p)}><Pencil size={16} /></button>
                                            <button className="icon-btn danger" title="Anular" onClick={() => setDeleteId(p.id)}><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-6 mt-8">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>
                        <ChevronLeft size={16} /> Anterior
                    </Button>
                    <div className="flex items-center gap-2">
                        <span className="w-9 h-9 bg-accent text-white rounded-xl flex items-center justify-center font-black text-sm shadow-lg shadow-accent/20">{page}</span>
                    </div>
                    <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => load(page + 1)}>
                        Siguiente <ChevronRight size={16} />
                    </Button>
                </div>
            )}

            {/* CREATE MODAL */}
            <Modal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Instrumentación de Cotización"
                subtitle="Defina las condiciones comerciales y activos involucrados en la propuesta."
                maxWidth="900px"
                footer={(
                    <div className="flex justify-between items-center w-full">
                        <div>
                            <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Impacto Final Neto</p>
                            <p className="text-3xl font-black text-white">${currentTotal().toLocaleString('es-AR')} <span className="text-sm font-normal text-slate-500 italic">({form.moneda})</span></p>
                        </div>
                        <div className="flex gap-4">
                            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                            <Button variant="primary" className="px-10" onClick={handleCreate} loading={saving}>Instrumentar Propuesta</Button>
                        </div>
                    </div>
                )}
            >
                <div className="space-y-8 max-h-[70vh] overflow-y-auto pr-2">
                    {/* Primary Info */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="form-group flex flex-col">
                            <label className="form-label">Nro. de Control *</label>
                            <div className="relative">
                                <Hash size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" />
                                <input className="form-input pl-10 font-bold" value={form.nroPresupuesto} onChange={e => setForm(f => ({ ...f, nroPresupuesto: e.target.value }))} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Divisa de Negociación *</label>
                            <select className="form-input font-bold" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}>
                                <option value="ARS">PESO ARGENTINO (ARS)</option>
                                <option value="USD">DÓLAR ESTADOUNIDENSE (USD)</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Sucursal Radicación *</label>
                            <select className="form-input" value={form.sucursalId} onChange={e => setForm(f => ({ ...f, sucursalId: e.target.value }))}>
                                <option value="">SELECCIONAR PUNTO DE VENTA...</option>
                                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Cliente Potencial *</label>
                            <select className="form-input" value={form.clienteId} onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))}>
                                <option value="">SELECCIONAR PROSPECTO...</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Vendedor Designado *</label>
                            <select className="form-input" value={form.vendedorId} onChange={e => setForm(f => ({ ...f, vendedorId: e.target.value }))}>
                                <option value="">ASIGNAR OFICIAL COMERCIAL...</option>
                                {vendedores.map(u => <option key={u.id} value={u.id}>{u.nombre.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Fecha Límite Validez</label>
                            <input type="date" className="form-input" value={form.validoHasta} onChange={e => setForm(f => ({ ...f, validoHasta: e.target.value }))} />
                        </div>
                    </div>

                    {/* Items Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <h3 className="text-xs font-black uppercase text-accent tracking-widest flex items-center gap-2">
                                <Car size={14} /> Unidades Cotizadas
                            </h3>
                            <Button variant="secondary" size="sm" onClick={addItem}>
                                <Plus size={14} className="mr-1" /> Añadir Unidad
                            </Button>
                        </div>
                        {form.items.map((item, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-900/40 p-4 rounded-2xl border border-white/5 group relative transition-all hover:bg-slate-900/60">
                                <div className="md:col-span-5">
                                    <label className="form-label-xs">Vehículo / Modelo</label>
                                    <select className="form-input py-2" value={item.vehiculoId} onChange={e => updItem(i, 'vehiculoId', e.target.value)}>
                                        <option value="">SELECCIONE UNIDAD EN STOCK...</option>
                                        {vehiculos.map(v => <option key={v.id} value={v.id}>{v.marca} {v.modelo} — {v.dominio ?? v.vin ?? `#${v.id}`}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="form-label-xs">P. Lista</label>
                                    <input type="number" className="form-input py-2" value={item.precioLista} onChange={e => updItem(i, 'precioLista', e.target.value)} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="form-label-xs">Desc.</label>
                                    <input type="number" className="form-input py-2" value={item.descuento} onChange={e => updItem(i, 'descuento', e.target.value)} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="form-label-xs">Final *</label>
                                    <input type="number" className="form-input py-2 font-bold text-accent" value={item.precioFinal} onChange={e => updItem(i, 'precioFinal', e.target.value)} />
                                </div>
                                <div className="md:col-span-1">
                                    <button className="w-full h-[38px] flex items-center justify-center text-red-500/50 hover:text-red-500 transition-all rounded-lg"
                                        onClick={() => removeItem(i)} disabled={form.items.length === 1}>
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Canje Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <h3 className="text-xs font-black uppercase text-indigo-400 tracking-widest flex items-center gap-2">
                                <ArrowRightLeft size={14} /> Toma de Usado (Canje)
                            </h3>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <span className="text-[10px] font-bold text-muted uppercase">{form.conCanje ? 'Incluido' : 'Sin Canje'}</span>
                                <div className={`w-10 h-5 rounded-full transition-all relative ${form.conCanje ? 'bg-indigo-600' : 'bg-slate-700'}`}
                                    onClick={() => setForm(f => ({ ...f, conCanje: !f.conCanje }))}>
                                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${form.conCanje ? 'right-1' : 'left-1'}`} />
                                </div>
                            </label>
                        </div>
                        {form.conCanje && (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-indigo-500/5 p-6 rounded-3xl border border-indigo-500/10">
                                <div className="md:col-span-2">
                                    <label className="form-label">Descripción / Marca / Modelo</label>
                                    <input className="form-input" value={form.canje.descripcion} onChange={e => setForm(f => ({ ...f, canje: { ...f.canje, descripcion: e.target.value } }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Dominio</label>
                                    <input className="form-input font-mono" value={form.canje.dominio} onChange={e => setForm(f => ({ ...f, canje: { ...f.canje, dominio: e.target.value } }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Valor de Toma *</label>
                                    <div className="relative">
                                        <DollarSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400" />
                                        <input type="number" className="form-input pl-10 font-bold" value={form.canje.valorTomado} onChange={e => setForm(f => ({ ...f, canje: { ...f.canje, valorTomado: e.target.value } }))} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* DETAIL MODAL */}
            <Modal
                isOpen={detailId !== null}
                onClose={() => setDetailId(null)}
                title={detail?.nroPresupuesto ?? 'Expediente Comercial'}
                subtitle={detail ? `SUCURSAL: ${detail.sucursal?.nombre ?? 'NO ESPECIFICADA'}` : undefined}
                maxWidth="900px"
                footer={detail ? (
                    <div className="flex justify-between items-center w-full">
                        <div>
                            <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Impacto Final de la Operación</p>
                            <p className="text-2xl font-black text-accent">{currencyFmt(calcTotal(detail), detail.moneda)}</p>
                        </div>
                        <div className="flex gap-4">
                            <Button variant="secondary" onClick={() => setDetailId(null)}>Cerrar Expediente</Button>
                            <Button variant="primary" className="px-8 shadow-glow" onClick={() => { setDetailId(null); openEdit(detail); }}>
                                <Pencil size={16} className="mr-2" /> Alterar Parámetros
                            </Button>
                        </div>
                    </div>
                ) : undefined}
            >
                {!detail ? (
                    <div className="p-24 text-center"><RefreshCw className="animate-spin text-accent mx-auto mb-4" size={48} /><p className="text-xs font-black text-muted uppercase tracking-[0.3em]">Consolidando expediente comercial...</p></div>
                ) : (
                    <div className="space-y-8">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-3xl bg-slate-800 flex items-center justify-center text-accent ring-1 ring-white/10">
                                <FileText size={32} />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <Badge variant={STATUS[detail.estado as EstadoPresupuesto]?.variant ?? 'default'}>
                                        {STATUS[detail.estado as EstadoPresupuesto]?.label.toUpperCase()}
                                    </Badge>
                                </div>
                                <p className="text-slate-400 font-bold flex items-center gap-2 uppercase text-xs">
                                    <MapPin size={14} /> SUCURSAL: {detail.sucursal?.nombre ?? 'NO ESPECIFICADA'}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="bg-slate-900/40 p-5 rounded-3xl border border-white/5">
                                <span className="text-[10px] font-black text-muted uppercase block tracking-widest mb-1">Fecha Emisión</span>
                                <p className="text-lg font-bold text-white">{fmt(detail.fechaCreacion)}</p>
                            </div>
                            <div className="bg-slate-900/40 p-5 rounded-3xl border border-white/5">
                                <span className="text-[10px] font-black text-muted uppercase block tracking-widest mb-1">Validez Hasta</span>
                                <p className="text-lg font-bold text-white">{fmt(detail.validoHasta)}</p>
                            </div>
                            <div className="bg-slate-900/40 p-5 rounded-3xl border border-white/5">
                                <span className="text-[10px] font-black text-muted uppercase block tracking-widest mb-1">Interesado</span>
                                <p className="text-lg font-bold text-white truncate">{detail.cliente?.nombre ?? '-'}</p>
                            </div>
                            <div className="bg-slate-900/40 p-5 rounded-3xl border border-white/5">
                                <span className="text-[10px] font-black text-muted uppercase block tracking-widest mb-1">Oficial Responsable</span>
                                <p className="text-lg font-bold text-white truncate">{detail.vendedor?.nombre ?? '-'}</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2 border-b border-white/5 pb-2">
                                <Car size={16} className="text-accent" /> Matriz de Unidades Cotizadas
                            </h3>
                            <div className="table-container border-white/5 overflow-hidden">
                                <table className="data-table">
                                    <thead className="bg-slate-900/60">
                                        <tr>
                                            <th>Activo / Unidad</th>
                                            <th style={{ textAlign: 'right' }}>Precio Lista</th>
                                            <th style={{ textAlign: 'right' }}>Descuento Aplicado</th>
                                            <th style={{ textAlign: 'right' }}>Neto Final</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.items?.map((it: PresupuestoItem) => (
                                            <tr key={it.id}>
                                                <td className="font-bold text-white uppercase text-xs">{it.vehiculo ? `${it.vehiculo.marca} ${it.vehiculo.modelo} [${it.vehiculo.dominio || 'S/D'}]` : `#${it.vehiculoId}`}</td>
                                                <td style={{ textAlign: 'right' }} className="text-slate-400 font-mono italic">{currencyFmt(it.precioLista, String(detail.moneda))}</td>
                                                <td style={{ textAlign: 'right' }} className="text-red-400 font-mono font-bold">-{currencyFmt(it.descuento ?? 0, String(detail.moneda))}</td>
                                                <td style={{ textAlign: 'right' }} className="font-black text-white text-lg">{currencyFmt(it.precioFinal, String(detail.moneda))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {detail.canje && (
                            <div className="p-8 bg-indigo-500/5 border border-indigo-500/10 rounded-3xl">
                                <h3 className="text-xs font-black uppercase text-indigo-400 tracking-widest mb-6 flex items-center gap-2">
                                    <ArrowRightLeft size={14} /> Gestión de Toma de Usado
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                                    <div className="md:col-span-2">
                                        <span className="text-[10px] font-black text-muted block mb-1 uppercase">Descripción del Activo</span>
                                        <p className="font-bold text-white uppercase">{detail.canje.descripcion}</p>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-black text-muted block mb-1 uppercase">Dominio</span>
                                        <p className="font-mono text-white text-lg tracking-widest">{detail.canje.dominio || 'S/D'}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] font-black text-indigo-400 block mb-1 uppercase">Acreditación Canje</span>
                                        <p className="text-2xl font-black text-white">-{currencyFmt(detail.canje.valorTomado, detail.moneda)}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* EDIT MODAL */}
            <Modal
                isOpen={editId !== null}
                onClose={() => setEditId(null)}
                title="Gestión de Auditoría"
                subtitle="Ajuste el estado legal y administrativo de la cotización."
                maxWidth="500px"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setEditId(null)}>Desistir</Button>
                        <Button variant="primary" className="flex-1" onClick={handleEdit} loading={saving}>Acreditar Cambios</Button>
                    </>
                )}
            >
                <div className="space-y-8">
                    <div className="form-group">
                        <label className="form-label">Estado del Expediente</label>
                        <select className="form-input text-lg font-bold" value={editForm.estado} onChange={e => setEditForm(f => ({ ...f, estado: e.target.value }))}>
                            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label.toUpperCase()}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Observaciones de Auditoría</label>
                        <textarea className="form-input" rows={4} value={editForm.observaciones} onChange={e => setEditForm(f => ({ ...f, observaciones: e.target.value }))} style={{ resize: 'none' }} placeholder="JUSTIFICACIÓN DE CAMBIO DE ESTADO O NOTAS PARA VENDEDORES..." />
                    </div>
                </div>
            </Modal>

            {/* CONVERTIR EN VENTA MODAL */}
            <Modal
                isOpen={convertirId !== null}
                onClose={() => setConvertirId(null)}
                title="Convertir en Venta"
                subtitle="Definí los datos de cierre. El resto los toma del presupuesto."
                maxWidth="520px"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setConvertirId(null)}>Cancelar</Button>
                        <Button variant="primary" className="flex-1" onClick={handleConvertirEnVenta} loading={convertirSaving}>
                            <ArrowRight size={16} className="mr-2" /> Crear venta
                        </Button>
                    </>
                )}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-group">
                            <label className="form-label">Forma de pago</label>
                            <select className="form-input" value={convertirForm.formaPago}
                                onChange={e => setConvertirForm(f => ({ ...f, formaPago: e.target.value as FormaPagoVenta }))}>
                                {FORMA_PAGO_OPTIONS_CONV.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Moneda</label>
                            <select className="form-input" value={convertirForm.moneda}
                                onChange={e => setConvertirForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}>
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Fecha venta</label>
                        <input type="date" className="form-input" value={convertirForm.fechaVenta}
                            onChange={e => setConvertirForm(f => ({ ...f, fechaVenta: e.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Observaciones</label>
                        <textarea className="form-input" rows={3} value={convertirForm.observaciones}
                            onChange={e => setConvertirForm(f => ({ ...f, observaciones: e.target.value }))} />
                    </div>
                </div>
            </Modal>

            {/* DELETE CONFIRM */}
            <ConfirmDialog
                isOpen={deleteId !== null}
                title="Eliminar presupuesto"
                message="¿Eliminar este presupuesto? Esta acción no se puede deshacer."
                confirmLabel="Eliminar"
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeleteId(null)}
            />

        </div>
    );
};

export default PresupuestosPage;
