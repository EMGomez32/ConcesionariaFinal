import { useEffect, useState, useCallback, useMemo, type MouseEvent } from 'react';
import { financiacionesApi, type CreateFinanciacionDto, type PagarCuotaDto } from '../../api/financiaciones.api';
import { clientesApi } from '../../api/clientes.api';
import { usuariosApi } from '../../api/usuarios.api';
import { ventasApi } from '../../api/ventas.api';
import { useUIStore } from '../../store/uiStore';
import Badge, { type BadgeVariant } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import {
    Plus, Search, Eye, Trash2, RefreshCw,
    CreditCard, DollarSign, ChevronLeft,
    ChevronRight, Calendar, User, ShoppingBag,
    AlertCircle, CheckCircle2, Car, TrendingUp
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────
type EstadoFinanciacion = 'activa' | 'cancelada' | 'en_mora' | 'refinanciada';
// 'refinanciada': su saldo se trasladó a otro contrato. No se cobró ni sigue
// siendo deuda viva.
type EstadoCuota = 'pendiente' | 'parcial' | 'pagada' | 'vencida' | 'refinanciada';

interface FinForm {
    ventaId: number;
    clienteId: number;
    cobradorId: number;
    fechaInicio: string;
    montoFinanciado: number;
    moneda: 'ARS' | 'USD';
    cuotas: number;
    diaVencimiento: number;
    tasaMensual: string;
    observaciones: string;
}

// Refs de catálogos
interface ClienteRef {
    id: number;
    nombre: string;
}

interface CobradorRef {
    id: number;
    nombre: string;
}

interface VehiculoRef {
    marca: string;
    modelo: string;
    dominio?: string;
}

interface VentaRef {
    id: number;
    cliente?: { nombre: string };
    vehiculo?: VehiculoRef;
}

// Cuota de un plan de financiación
interface Cuota {
    id: number;
    nroCuota: number;
    vencimiento: string;
    montoCuota: number | string;
    saldoCuota: number | string;
    estado: EstadoCuota;
}

// Fila de financiación devuelta por la API
interface FinanciacionRow {
    id: number;
    ventaId: number;
    clienteId: number;
    cobradorId?: number;
    estado: EstadoFinanciacion;
    montoFinanciado: number | string;
    moneda?: string;
    cuotas: number;
    diaVencimiento: number;
    tasaMensual?: number | null;
    cliente?: { nombre: string };
    cobrador?: { nombre: string };
    venta?: { vehiculo?: VehiculoRef };
    cuotasPlan?: Cuota[];
    /** Contrato al que este refinancia (si nació de una refinanciación). */
    refinanciaA?: RefiRef | null;
    /** Contrato que refinanció a este (si su saldo ya se trasladó). */
    refinanciadaPor?: RefiRef | null;
}

/** Datos mínimos del contrato del otro lado de una refinanciación. */
interface RefiRef {
    id: number;
    estado: EstadoFinanciacion;
    montoFinanciado: number | string;
    moneda?: string;
    cuotas?: number;
}

// ─── Status maps ─────────────────────────────────────────────────────────────
const finStatusMap: Record<EstadoFinanciacion, { label: string; variant: BadgeVariant }> = {
    activa: { label: 'Activa', variant: 'success' },
    cancelada: { label: 'Cancelada', variant: 'default' },
    en_mora: { label: 'En mora', variant: 'danger' },
    refinanciada: { label: 'Refinanciada', variant: 'info' },
};

const cuotaStatusMap: Record<EstadoCuota, { label: string; variant: BadgeVariant }> = {
    pendiente: { label: 'Pendiente', variant: 'warning' },
    parcial: { label: 'Parcial', variant: 'info' },
    pagada: { label: 'Pagada', variant: 'success' },
    vencida: { label: 'Vencida', variant: 'danger' },
    // Neutro a propósito: no se cobró, así que no va en verde.
    refinanciada: { label: 'Refinanciada', variant: 'default' },
};

// Refinanciar NO está acá: no es un cambio de estado suelto, sino que crea un
// contrato nuevo por el saldo. Tiene su propio botón y su modal.
const finTransitions: Record<EstadoFinanciacion, { label: string; next: EstadoFinanciacion }[]> = {
    activa: [{ label: 'Declarar Mora', next: 'en_mora' }, { label: 'Cerrar Contrato', next: 'cancelada' }],
    en_mora: [{ label: 'Regularizar', next: 'activa' }, { label: 'Cerrar Contrato', next: 'cancelada' }],
    refinanciada: [],
    cancelada: [],
};

/** Un contrato se refinancia sólo si está vivo y le queda deuda. */
const puedeRefinanciarse = (estado: string) => estado === 'activa' || estado === 'en_mora';

const metodoLabels: Record<string, string> = {
    efectivo: 'Efectivo', transferencia: 'Transferencia',
    tarjeta: 'Tarjeta', cheque: 'Cheque', otro: 'Otro',
};

const today = () => new Date().toISOString().split('T')[0];
const emptyForm = (): FinForm => ({
    ventaId: 0, clienteId: 0, cobradorId: 0,
    fechaInicio: today(), montoFinanciado: 0, moneda: 'ARS',
    cuotas: 12, diaVencimiento: 10,
    tasaMensual: '', observaciones: '',
});
const emptyPago = (): PagarCuotaDto => ({ monto: 0, metodo: 'efectivo', referencia: '', fechaPago: today() });

// ─── Componente principal ─────────────────────────────────────────────────────
const FinanciacionesPage = () => {
    // Catálogos
    const [clientes, setClientes] = useState<ClienteRef[]>([]);
    const [cobradores, setCobradores] = useState<CobradorRef[]>([]);
    const [ventas, setVentas] = useState<VentaRef[]>([]);

    // Lista
    const [financiaciones, setFinanciaciones] = useState<FinanciacionRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Cartera por moneda. `financiado` es lo prestado y `saldo` lo que queda por
    // cobrar (suma de saldoCuota). Se agrupa por moneda porque sumar ARS y USD
    // daría un importe inexistente. Los Decimal de Prisma llegan como string:
    // de ahí el Number() en cada acumulador.
    const carteraPorMoneda = useMemo(() => {
        const acc: Record<string, { financiado: number; saldo: number }> = {};
        for (const f of financiaciones) {
            const moneda = f.moneda || 'ARS';
            if (!acc[moneda]) acc[moneda] = { financiado: 0, saldo: 0 };
            acc[moneda].financiado += Number(f.montoFinanciado) || 0;
            acc[moneda].saldo += (f.cuotasPlan ?? []).reduce(
                (s, c) => s + (Number(c.saldoCuota) || 0), 0
            );
        }
        return Object.entries(acc)
            .map(([moneda, v]) => ({ moneda, ...v }))
            .sort((a, b) => (a.moneda === 'ARS' ? -1 : b.moneda === 'ARS' ? 1 : a.moneda.localeCompare(b.moneda)));
    }, [financiaciones]);

    // Filtros
    const [search, setSearch] = useState('');
    const [filterEstado, setFilterEstado] = useState('');

    // Modales
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState<FinForm>(emptyForm());
    const [saving, setSaving] = useState(false);

    const [detailId, setDetailId] = useState<number | null>(null);
    const [detail, setDetail] = useState<FinanciacionRow | null>(null);
    const [deleteId, setDeleteId] = useState<number | null>(null);

    // Pagar cuota sub-modal
    const [pagarCuota, setPagarCuota] = useState<Cuota | null>(null);
    const [pagoForm, setPagoForm] = useState<PagarCuotaDto>(emptyPago());
    const [savingPago, setSavingPago] = useState(false);

    const { addToast } = useUIStore();

    // ── Catálogos ────────────────────────────────────────────────────────────
    const loadCatalogos = useCallback(async () => {
        try {
            const [c, u, v] = await Promise.all([
                clientesApi.getAll({}, { limit: 1000 }),
                usuariosApi.getAll({}, { limit: 1000 }),
                ventasApi.getAll({}, { limit: 1000 }),
            ]);
            setClientes((c.results ?? []) as ClienteRef[]);
            setCobradores(((u as { results?: CobradorRef[] }).results ?? []));
            setVentas((v.results ?? []) as VentaRef[]);
        } catch { /* silencioso */ }
    }, []);

    // ── Lista ────────────────────────────────────────────────────────────────
    const loadList = useCallback(async (pg = page) => {
        setLoading(true);
        try {
            const filters: Record<string, unknown> = {};
            if (filterEstado) filters.estado = filterEstado;
            const res = await financiacionesApi.getAll(filters, { limit: 15, page: pg });
            // El interceptor de axios ya devuelve el body: la respuesta es
            // {results, totalPages, ...} en la raíz. Un `.data.data` acá dejaba
            // la lista siempre vacía, hubiera o no financiaciones.
            const data = res as { results?: FinanciacionRow[]; totalPages?: number };
            setFinanciaciones(Array.isArray(data?.results) ? data.results : []);
            setTotalPages(data?.totalPages ?? 1);
        } catch {
            addToast('Fallo crítico al sincronizar cartera', 'error');
        } finally {
            setLoading(false);
        }
    }, [page, filterEstado, addToast]);

    useEffect(() => { loadCatalogos(); }, [loadCatalogos]);
    useEffect(() => { loadList(page); }, [loadList, page]);

    // ── Detalle ──────────────────────────────────────────────────────────────
    const openDetail = async (id: number) => {
        setDetailId(id);
        setDetail(null);
        try {
            const res = await financiacionesApi.getById(id);
            // El interceptor ya devuelve el body: la financiación viene plana.
            setDetail((res as unknown as FinanciacionRow) ?? null);
        } catch {
            addToast('Error al recuperar expediente digital', 'error');
        }
    };

    const refreshDetail = async (id: number) => {
        try {
            const res = await financiacionesApi.getById(id);
            setDetail((res as unknown as FinanciacionRow) ?? null);
        } catch { /* silencioso */ }
    };

    // ── Refinanciación ───────────────────────────────────────────────────────
    const [refiOpen, setRefiOpen] = useState(false);
    const [refiSaving, setRefiSaving] = useState(false);
    const [refiForm, setRefiForm] = useState({
        cuotas: '6',
        tasaMensual: '',
        diaVencimiento: '',
        fechaInicio: new Date().toISOString().slice(0, 10),
    });

    // El saldo se calcula acá sólo para mostrarlo: el backend lo recalcula de las
    // cuotas reales, así que la UI no puede inventar el monto a refinanciar.
    const saldoRefinanciable = (detail?.cuotasPlan ?? [])
        .filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada')
        .reduce((s, c) => s + (Number(c.saldoCuota) || 0), 0);

    const abrirRefinanciar = () => {
        if (!detail) return;
        setRefiForm({
            cuotas: '6',
            tasaMensual: detail.tasaMensual != null ? String(detail.tasaMensual) : '',
            diaVencimiento: String(detail.diaVencimiento ?? ''),
            fechaInicio: new Date().toISOString().slice(0, 10),
        });
        setRefiOpen(true);
    };

    const handleRefinanciar = async () => {
        if (!detail) return;
        const cuotas = Number(refiForm.cuotas);
        if (!Number.isInteger(cuotas) || cuotas < 1) {
            addToast('Indicá en cuántas cuotas se refinancia', 'error');
            return;
        }
        setRefiSaving(true);
        try {
            const nueva = await financiacionesApi.refinanciar(detail.id, {
                cuotas,
                fechaInicio: refiForm.fechaInicio,
                ...(refiForm.tasaMensual !== '' ? { tasaMensual: Number(refiForm.tasaMensual) } : {}),
                ...(refiForm.diaVencimiento !== '' ? { diaVencimiento: Number(refiForm.diaVencimiento) } : {}),
            }) as unknown as { id: number };
            addToast(`Contrato refinanciado en el #${String(nueva.id).padStart(6, '0')}`, 'success');
            setRefiOpen(false);
            await loadList(page);
            // Se abre el contrato nuevo: es donde vive la deuda ahora.
            await openDetail(nueva.id);
        } catch (err: unknown) {
            addToast((err as { message?: string })?.message ?? 'Error al refinanciar', 'error');
        } finally {
            setRefiSaving(false);
        }
    };

    // ── Cambio estado ────────────────────────────────────────────────────────
    const handleCambioEstado = async (id: number, estado: string) => {
        try {
            await financiacionesApi.updateEstado(id, estado);
            addToast('Estado legal actualizado correctamente', 'success');
            loadList(page);
            if (detailId === id) refreshDetail(id);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } };
            addToast(err?.response?.data?.message ?? 'Fallo en la transición de estado', 'error');
        }
    };

    // ── Crear ────────────────────────────────────────────────────────────────
    const handleCreate = async () => {
        if (!form.ventaId || !form.clienteId || !form.montoFinanciado || !form.cuotas || !form.diaVencimiento) {
            addToast('Complete la información mandatoria para instrumentar el plan', 'error'); return;
        }
        setSaving(true);
        try {
            const dto: CreateFinanciacionDto = {
                ventaId: form.ventaId,
                clienteId: form.clienteId,
                cobradorId: form.cobradorId || undefined,
                fechaInicio: form.fechaInicio,
                montoFinanciado: form.montoFinanciado,
                moneda: form.moneda,
                cuotas: form.cuotas,
                diaVencimiento: form.diaVencimiento,
                tasaMensual: form.tasaMensual ? parseFloat(form.tasaMensual) : undefined,
                observaciones: form.observaciones || undefined,
            };
            await financiacionesApi.create(dto);
            addToast('Plan de financiación activado y cronograma generado', 'success');
            setCreateOpen(false);
            setForm(emptyForm());
            loadList(1);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } };
            addToast(err?.response?.data?.message ?? 'Error estructural al generar plan', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Eliminar ─────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await financiacionesApi.delete(deleteId);
            addToast('Contrato de financiación revocado', 'success');
            setDeleteId(null);
            loadList(page);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } };
            addToast(err?.response?.data?.message ?? 'Error al revocar plan', 'error');
        }
    };

    // ── Pagar cuota ──────────────────────────────────────────────────────────
    const openPagarCuota = (cuota: Cuota) => {
        setPagarCuota(cuota);
        setPagoForm({ ...emptyPago(), monto: Number(cuota.saldoCuota) });
    };

    const handlePagarCuota = async (e: MouseEvent<HTMLButtonElement>) => {
        // Flujo de pago deshabilitado a propósito: el return corta acá.
        e.preventDefault(); return;
        if (pagoForm.monto <= 0) { addToast('El importe de recaudación debe ser mayor a 0', 'error'); return; }
        if (!pagarCuota) return;
        setSavingPago(true);
        try {
            await financiacionesApi.pagarCuota(pagarCuota!.id, pagoForm);
            addToast('Cobro procesado y acreditado con éxito', 'success');
            setPagarCuota(null);
            if (detailId !== null) refreshDetail(Number(detailId));
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } };
            addToast(err?.response?.data?.message ?? 'Fallo en la conciliación del cobro', 'error');
        } finally {
            setSavingPago(false);
        }
    };

    // ── Helpers ──────────────────────────────────────────────────────────────
    const calcMontoCuota = () => {
        if (!form.montoFinanciado || !form.cuotas) return 0;
        return form.montoFinanciado / form.cuotas;
    };

    const finFiltradas = search
        ? financiaciones.filter(f => {
            const term = search.toLowerCase();
            return (
                f.cliente?.nombre?.toLowerCase().includes(term) ||
                f.venta?.vehiculo?.dominio?.toLowerCase().includes(term) ||
                f.cobrador?.nombre?.toLowerCase().includes(term) ||
                String(f.id).includes(term)
            );
        })
        : financiaciones;

    return (
        <div className="page-container animate-fade-in">
            {/* Header */}
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <CreditCard size={20} />
                        </div>
                        <h1>Estructuras de Financiación</h1>
                    </div>
                    <p>Monitoreo de carteras de crédito, planes de pago y auditoría de recaudaciones internas.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => loadList(page)}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </Button>
                    <Button variant="primary" onClick={() => { setForm(emptyForm()); setCreateOpen(true); }}>
                        <Plus size={18} /> Instrumentar Nuevo Plan
                    </Button>
                </div>
            </header>

            {/* Quick Stats Overlay (Optional design element) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="card glass stat-tile border-blue-500/20 bg-blue-500/5 group">
                    <div className="relative z-10">
                        <span className="stat-tile-label" style={{ color: 'var(--info)' }}>Planes Activos</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black">{financiaciones.filter(f => f.estado === 'activa').length}</span>
                            <span className="text-xs text-muted font-bold">CONTRATOS</span>
                        </div>
                    </div>
                    <TrendingUp size={60} className="stat-tile-bg" />
                </div>
                <div className="card glass stat-tile border-red-500/20 bg-red-500/5 group">
                    <div className="relative z-10">
                        <span className="stat-tile-label" style={{ color: 'var(--danger)' }}>Alerta de Mora</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black">{financiaciones.filter(f => f.estado === 'en_mora').length}</span>
                            <span className="text-xs text-muted font-bold">INCIDENCIAS</span>
                        </div>
                    </div>
                    <AlertCircle size={60} className="stat-tile-bg" />
                </div>
                <div className="card glass stat-tile border-emerald-500/20 bg-emerald-500/5 group col-span-1 md:col-span-2">
                    <div className="relative z-10 flex justify-between items-center">
                        <div>
                            <span className="stat-tile-label" style={{ color: 'var(--accent)' }}>Cartera Administrada</span>
                            {carteraPorMoneda.length === 0 ? (
                                <div className="text-3xl font-black">$0 <span className="text-xs text-muted">ARS</span></div>
                            ) : carteraPorMoneda.map(({ moneda, financiado }) => (
                                <div key={moneda} className="text-3xl font-black">
                                    ${financiado.toLocaleString('es-AR')}
                                    <span className="text-xs text-muted" style={{ marginLeft: '0.35rem' }}>{moneda}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span className="stat-tile-label">Exigibilidad estimada</span>
                            {carteraPorMoneda.length === 0 ? (
                                <p className="text-xl font-bold text-muted">-</p>
                            ) : carteraPorMoneda.map(({ moneda, saldo }) => (
                                <p key={moneda} className="text-xl font-bold">
                                    ${saldo.toLocaleString('es-AR')}
                                    <span className="text-xs text-muted" style={{ marginLeft: '0.35rem' }}>{moneda}</span>
                                </p>
                            ))}
                        </div>
                    </div>
                    <DollarSign size={80} className="stat-tile-bg" />
                </div>
            </div>

            {/* Filters Bar */}
            <div className="card glass filters-bar flex flex-wrap items-center justify-between gap-6 mb-6">
                <div className="flex-1 min-w-[300px] relative">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                        type="text"
                        placeholder="BUSCAR EXPEDIENTE POR CLIENTE, TÍTULO, UNIDAD O DOMINIO..."
                        className="form-input-premium pl-12 h-12 w-full"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex gap-6 items-center">
                    <div className="min-w-[180px]">
                        <label className="form-label-xs">Auditoría de Pagos</label>
                        <select className="form-input-select w-full" value={filterEstado} onChange={e => { setFilterEstado(e.target.value); setPage(1); }}>
                            <option value="">FILTRAR TODOS LOS ESTADOS</option>
                            {Object.entries(finStatusMap).map(([k, v]) => (
                                <option key={k} value={k}>{v.label.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>
                    <Button variant="secondary" onClick={() => { setSearch(''); setFilterEstado(''); setPage(1); }}>
                        <RefreshCw size={18} />
                    </Button>
                </div>
            </div>

            {/* List Table */}
            <div className="table-container card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Identificador</th>
                            <th>Acreedor de Deuda</th>
                            <th>Unidad / Activo</th>
                            <th>Gestor Responsable</th>
                            <th>Capital Financiado</th>
                            <th>Performance Cobro</th>
                            <th>Estado Operativo</th>
                            <th style={{ textAlign: 'right' }}>Análisis</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ padding: '8rem', textAlign: 'center' }}><RefreshCw className="animate-spin text-accent mx-auto" size={40} /></td></tr>
                        ) : finFiltradas.length === 0 ? (
                            <tr>
                                <td colSpan={8}>
                                    <div className="flex flex-col items-center py-20 text-muted">
                                        <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center mb-4 ring-1 ring-slate-700">
                                            <CreditCard size={40} className="text-slate-600" />
                                        </div>
                                        <p className="text-xl font-black text-slate-400">Sin carteras para este criterio</p>
                                        <p className="text-sm font-medium">No se registran financiaciones activas para los datos prospectados.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            finFiltradas.map(f => (
                                <tr key={f.id} onClick={() => openDetail(f.id)} className="cursor-pointer group">
                                    <td>
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-blue-500 tracking-tighter">CONTRATO</span>
                                            <span className="font-mono text-xs font-bold text-white"># {String(f.id).padStart(6, '0')}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700">
                                                <User size={14} />
                                            </div>
                                            <span className="font-bold text-white uppercase text-xs">{f.cliente?.nombre ?? `CLIENTE ID-${f.clienteId}`}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-300">
                                                {f.venta?.vehiculo ? `${f.venta.vehiculo.marca} ${f.venta.vehiculo.modelo}` : `VENTA #${f.ventaId}`}
                                            </span>
                                            <span className="text-[10px] font-black text-muted tracking-widest">{f.venta?.vehiculo?.dominio || 'S/DOMINIO'}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-slate-500 uppercase">{f.cobrador?.nombre || 'SIN OFICIAL'}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="font-black text-white text-base tabular-nums">
                                            ${Number(f.montoFinanciado).toLocaleString('es-AR')}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex flex-col gap-1.5 min-w-[140px]">
                                            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-tighter">
                                                <span className="text-accent-light">{(f.cuotasPlan?.filter((c: { estado: string }) => c.estado === 'pagada').length ?? 0)} de {f.cuotas} cuotas</span>
                                                <span className="text-white">{Math.round(((f.cuotasPlan?.filter((c: { estado: string }) => c.estado === 'pagada').length ?? 0) / f.cuotas) * 100)}%</span>
                                            </div>
                                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                                <div
                                                    className="bg-accent h-full transition-all duration-700"
                                                    style={{ width: `${((f.cuotasPlan?.filter((c: { estado: string }) => c.estado === 'pagada').length ?? 0) / f.cuotas) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <Badge variant={finStatusMap[f.estado as EstadoFinanciacion]?.variant ?? 'default'}>
                                            {finStatusMap[f.estado as EstadoFinanciacion]?.label.toUpperCase()}
                                        </Badge>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                            <button className="icon-btn" title="Ver Expediente"><Eye size={16} /></button>
                                            <button className="icon-btn danger" onClick={e => { e.stopPropagation(); setDeleteId(f.id); }} title="Anular Contrato"><Trash2 size={16} /></button>
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
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                        <ChevronLeft size={16} /> Anterior
                    </Button>
                    <div className="flex items-center gap-2">
                        <span className="w-9 h-9 bg-accent text-white rounded-xl flex items-center justify-center font-black text-sm shadow-lg shadow-accent/20">{page}</span>
                    </div>
                    <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                        Siguiente <ChevronRight size={16} />
                    </Button>
                </div>
            )}

            {/* MODAL CREAR PAN DE PAGOS */}
            <Modal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Instrumentación de Crédito"
                subtitle="Asegúrese de validar la solvencia del acreedor antes de activar el plan."
                maxWidth="820px"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                        <Button variant="primary" className="min-w-[220px]" onClick={handleCreate} loading={saving}>
                            Instrumentar y Activar Plan
                        </Button>
                    </>
                )}
            >
                <div className="space-y-8">
                    <div className="form-group col-span-2">
                        <label className="form-label text-blue-400">Venta de Origen (Documento Base) *</label>
                        <select className="form-input text-lg font-bold" value={form.ventaId || ''} onChange={e => setForm(f => ({ ...f, ventaId: +e.target.value }))}>
                            <option value="">SELECCIONAR CONTRATO DE TRANSFERENCIA...</option>
                            {ventas.map(v => (
                                <option key={v.id} value={v.id}>
                                    {`#${String(v.id).padStart(5, '0')} — CLIENTE: ${v.cliente?.nombre?.toUpperCase()} — VEHÍCULO: ${v.vehiculo?.marca?.toUpperCase()} ${v.vehiculo?.modelo?.toUpperCase()}`}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="form-group">
                            <label className="form-label">Titular Exigible *</label>
                            <select className="form-input" value={form.clienteId || ''} onChange={e => setForm(f => ({ ...f, clienteId: +e.target.value }))}>
                                <option value="">PERSONA FÍSICA / JURÍDICA...</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Oficial Responsable</label>
                            <select className="form-input" value={form.cobradorId || ''} onChange={e => setForm(f => ({ ...f, cobradorId: +e.target.value }))}>
                                <option value="">ASIGNAR GESTOR RECAUDADOR...</option>
                                {cobradores.map(u => <option key={u.id} value={u.id}>{u.nombre.toUpperCase()}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="form-group">
                            <label className="form-label">Capital Liquidado *</label>
                            <div className="relative">
                                <DollarSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" />
                                <input type="number" className="form-input pl-10 font-bold" value={form.montoFinanciado || ''}
                                    onChange={e => setForm(f => ({ ...f, montoFinanciado: +e.target.value }))} placeholder="0.00" />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Moneda</label>
                            <select className="form-input" value={form.moneda}
                                onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}>
                                <option value="ARS">Pesos (ARS)</option>
                                <option value="USD">Dólares (USD)</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Plan de Cuotas *</label>
                            <select className="form-input" value={form.cuotas} onChange={e => setForm(f => ({ ...f, cuotas: +e.target.value }))}>
                                {[1, 3, 6, 12, 18, 24, 36, 48, 60].map(n => <option key={n} value={n}>{n} CUOTAS MENSUALES</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">INTERÉS MENSUAL (%)</label>
                            <div className="relative">
                                <TrendingUp size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" />
                                <input type="number" step="0.1" className="form-input pl-10" value={form.tasaMensual}
                                    onChange={e => setForm(f => ({ ...f, tasaMensual: e.target.value }))} placeholder="0.0" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="form-group">
                            <label className="form-label">Fecha de Inicio Contable</label>
                            <input type="date" className="form-input" value={form.fechaInicio} onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Día Fijo de Cobro</label>
                            <select className="form-input" value={form.diaVencimiento} onChange={e => setForm(f => ({ ...f, diaVencimiento: +e.target.value }))}>
                                {[...Array(28)].map((_, i) => <option key={i + 1} value={i + 1}>DÍA {i + 1} DE CADA MES</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Notas del Contrato (Observaciones)</label>
                        <textarea className="form-input" rows={2} value={form.observaciones}
                            onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="ESPECIFIQUE GARANTÍAS O ACUERDOS EXCEPCIONALES..." style={{ resize: 'none' }} />
                    </div>

                    {form.montoFinanciado > 0 && (
                        <div className="p-6 bg-accent/5 border border-accent/20 rounded-3xl flex justify-between items-center shadow-glow-sm">
                            <div>
                                <p className="text-[10px] font-black text-accent uppercase tracking-widest mb-1">Impacto de Cuota Base</p>
                                <p className="text-3xl font-black text-white">${calcMontoCuota().toLocaleString('es-AR')}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Exigibilidad Total</p>
                                <p className="text-xl font-bold text-white/50">${Number(form.montoFinanciado).toLocaleString('es-AR')}</p>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* MODAL EXPEDIENTE DIGITAL (DETALLE) */}
            <Modal
                isOpen={detailId !== null}
                onClose={() => { setDetailId(null); setDetail(null); }}
                title={detail?.cliente?.nombre ? String(detail.cliente.nombre).toUpperCase() : 'Expediente Financiero'}
                subtitle={detail?.venta?.vehiculo
                    ? `${detail.venta.vehiculo.marca} ${detail.venta.vehiculo.modelo} [${detail.venta.vehiculo.dominio}]`.toUpperCase()
                    : 'OP. VENTA NO ESPECIFICADA'}
                maxWidth="900px"
                footer={detail ? (
                    <Button variant="secondary" className="px-10" onClick={() => { setDetailId(null); setDetail(null); }}>Cerrar Expediente</Button>
                ) : undefined}
            >
                {!detail ? (
                    <div className="p-20 text-center"><RefreshCw className="animate-spin text-accent mx-auto mb-4" size={48} /><p className="text-xs font-black text-muted uppercase tracking-[0.3em]">Recuperando expediente financiero...</p></div>
                ) : (
                    <div className="space-y-10">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-3xl bg-accent flex items-center justify-center text-white shadow-xl shadow-accent/40 ring-4 ring-accent/10">
                                <ShoppingBag size={32} />
                            </div>
                            <div className="flex items-center gap-3">
                                <Badge variant={finStatusMap[detail.estado as EstadoFinanciacion]?.variant ?? 'default'}>
                                    {finStatusMap[detail.estado as EstadoFinanciacion]?.label?.toUpperCase()}
                                </Badge>
                                <p className="text-accent-light font-bold flex items-center gap-2">
                                    <Car size={16} />
                                    {detail.venta?.vehiculo ? `${detail.venta.vehiculo.marca} ${detail.venta.vehiculo.modelo} [${detail.venta.vehiculo.dominio}]`.toUpperCase() : `OP. VENTA NO ESPECIFICADA`.toUpperCase()}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="bg-slate-900/40 p-5 rounded-3xl border border-white/5">
                                <span className="stat-tile-label">Exigibilidad Actual</span>
                                <p className="text-2xl font-black text-accent">
                                    ${(detail.cuotasPlan ?? []).reduce((s: number, c: Cuota) => s + (Number(c.saldoCuota) || 0), 0).toLocaleString('es-AR')}
                                    <span className="text-xs text-muted" style={{ marginLeft: '0.35rem' }}>{detail.moneda || 'ARS'}</span>
                                </p>
                            </div>
                            <div className="bg-slate-900/40 p-5 rounded-3xl border border-white/5">
                                <span className="text-[10px] font-black text-muted uppercase block tracking-widest mb-2">Ratio de Cobro</span>
                                <p className="text-2xl font-black text-emerald-500">{detail.cuotasPlan?.filter((c: { estado: string }) => c.estado === 'pagada').length} / {detail.cuotas}</p>
                            </div>
                            {/* El modelo Cuota tiene montoCuota y saldoCuota: no existen
                                montoCapital ni montoInteres, y sumarlos daba siempre $0. */}
                            <div className="card glass p-4 text-center font-bold">
                                <span className="stat-tile-label">Total contrato</span>
                                ${(detail.cuotasPlan ?? []).reduce((s: number, c: Cuota) => s + (Number(c.montoCuota) || 0), 0).toLocaleString('es-AR')}
                                <span className="text-xs text-muted" style={{ marginLeft: '0.35rem' }}>{detail.moneda || 'ARS'}</span>
                            </div>
                            <div className="card glass p-4 text-center font-bold">
                                <span className="stat-tile-label">Saldo pendiente</span>
                                ${(detail.cuotasPlan ?? []).filter((c: Cuota) => c.estado !== 'pagada').reduce((s: number, c: Cuota) => s + (Number(c.saldoCuota) || 0), 0).toLocaleString('es-AR')}
                                <span className="text-xs text-muted" style={{ marginLeft: '0.35rem' }}>{detail.moneda || 'ARS'}</span>
                            </div>
                            <div className="bg-slate-900/40 p-5 rounded-3xl border border-white/5">
                                <span className="stat-tile-label">Valor de Cuota</span>
                                {/* Se lee de la primera cuota real en vez de recalcular
                                    monto/N, que arrastraba decimales infinitos. */}
                                <p className="text-2xl font-black">
                                    ${Number((detail.cuotasPlan ?? [])[0]?.montoCuota ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    <span className="text-xs text-muted" style={{ marginLeft: '0.35rem' }}>{detail.moneda || 'ARS'}</span>
                                </p>
                            </div>
                            <div className="bg-slate-900/40 p-5 rounded-3xl border border-white/5">
                                <span className="text-[10px] font-black text-muted uppercase block tracking-widest mb-2">Cierre de Ciclo</span>
                                <p className="text-2xl font-black text-blue-400">DÍA {detail.diaVencimiento}</p>
                            </div>
                        </div>

                        {/* Contrato ya refinanciado: su deuda vive en otro contrato.
                            La leyenda evita que se lea como "perdonado" o "cobrado". */}
                        {detail.estado === 'refinanciada' && detail.refinanciadaPor && (
                            <div className="card glass" style={{ borderColor: 'var(--accent)' }}>
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <h4 className="text-sm font-black uppercase tracking-tight">Contrato refinanciado</h4>
                                        <p className="text-xs text-muted">
                                            Su saldo se trasladó al contrato #{String(detail.refinanciadaPor.id).padStart(6, '0')} por{' '}
                                            ${Number(detail.refinanciadaPor.montoFinanciado).toLocaleString('es-AR')} {detail.refinanciadaPor.moneda}
                                            {detail.refinanciadaPor.cuotas ? ` en ${detail.refinanciadaPor.cuotas} cuotas` : ''}. Acá no queda deuda por cobrar.
                                        </p>
                                    </div>
                                    <Button variant="primary" size="sm" onClick={() => openDetail(detail.refinanciadaPor!.id)}>
                                        VER CONTRATO NUEVO
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Contrato que nació de refinanciar a otro: link hacia atrás. */}
                        {detail.refinanciaA && (
                            <div className="card glass">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <h4 className="text-sm font-black uppercase tracking-tight">Origen</h4>
                                        <p className="text-xs text-muted">
                                            Refinancia el saldo del contrato #{String(detail.refinanciaA.id).padStart(6, '0')}.
                                        </p>
                                    </div>
                                    <Button variant="secondary" size="sm" onClick={() => openDetail(detail.refinanciaA!.id)}>
                                        VER CONTRATO ORIGINAL
                                    </Button>
                                </div>
                            </div>
                        )}

                        {(finTransitions[detail.estado as EstadoFinanciacion]?.length > 0 || puedeRefinanciarse(detail.estado)) && (
                            <div className="p-6 bg-slate-900/80 border border-slate-700/50 rounded-3xl flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-black text-white uppercase tracking-widest mb-1">Control de Gestión Legal</h4>
                                    <p className="text-xs text-muted">Transiciones de auditoría para el estado del contrato.</p>
                                </div>
                                <div className="flex gap-3">
                                    {puedeRefinanciarse(detail.estado) && saldoRefinanciable > 0 && (
                                        <Button variant="primary" size="sm" onClick={abrirRefinanciar}>
                                            REFINANCIAR
                                        </Button>
                                    )}
                                    {finTransitions[detail.estado as EstadoFinanciacion].map(t => (
                                        <Button
                                            key={t.next}
                                            variant={t.next === 'cancelada' ? 'secondary' : t.next === 'en_mora' ? 'danger' : 'primary'}
                                            size="sm"
                                            onClick={() => handleCambioEstado(detail.id, t.next)}
                                        >
                                            {t.label.toUpperCase()}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-4">
                            <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                                <Calendar size={18} className="text-accent" /> Historial Analítico de Recaudación
                            </h3>
                            <div className="table-container border-white/5 overflow-hidden">
                                <table className="data-table">
                                    <thead className="bg-slate-900/60">
                                        <tr>
                                            <th>Período</th>
                                            <th>Vencimiento</th>
                                            <th>Cuota Nominal</th>
                                            <th>Deuda Residual</th>
                                            <th>Estado</th>
                                            <th style={{ textAlign: 'right' }}>Operatividad</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.cuotasPlan?.map((c: Cuota) => (
                                            <tr key={c.id}>
                                                <td className="font-black text-white"># {c.nroCuota}</td>
                                                <td className="font-mono text-xs text-slate-400">{new Date(c.vencimiento).toLocaleDateString('es-AR')}</td>
                                                <td className="font-bold text-white">${Number(c.montoCuota).toLocaleString('es-AR')}</td>
                                                <td className="font-black text-accent-light">${Number(c.saldoCuota).toLocaleString('es-AR')}</td>
                                                <td>
                                                    <Badge variant={cuotaStatusMap[c.estado as EstadoCuota]?.variant ?? 'default'}>
                                                        {cuotaStatusMap[c.estado as EstadoCuota]?.label.toUpperCase()}
                                                    </Badge>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {(c.estado === 'pendiente' || c.estado === 'parcial' || c.estado === 'vencida') && (
                                                        <Button variant="primary" size="sm" onClick={() => openPagarCuota(c)}>
                                                            RECAUDAR
                                                        </Button>
                                                    )}
                                                    {c.estado === 'pagada' && <CheckCircle2 size={20} className="text-emerald-500 ml-auto" />}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* SUB-MODAL RECAUDACIÓN (PAGAR CUOTA) */}
            <Modal
                isOpen={!!pagarCuota}
                onClose={() => setPagarCuota(null)}
                title="Certificación de Cobro"
                subtitle="Valide el ingreso del capital antes de confirmar."
                maxWidth="520px"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setPagarCuota(null)}>Abortar</Button>
                        <Button variant="primary" style={{ flex: 1 }} onClick={handlePagarCuota} loading={savingPago}>
                            Efectivizar Ingreso
                        </Button>
                    </>
                )}
            >
                {pagarCuota && (
                    <div className="space-y-8">
                        <div className="p-6 bg-slate-900/60 rounded-3xl border border-accent/20 flex justify-between items-center shadow-glow-sm">
                            <div>
                                <span className="text-[10px] font-black text-muted block mb-1">CONCILIACIÓN CUOTA #{pagarCuota.nroCuota}</span>
                                <p className="text-xs text-accent-light font-bold">FECHA LÍMITE: {new Date(pagarCuota.vencimiento).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-black text-muted block mb-1">EXIGIBILIDAD</span>
                                <p className="text-2xl font-black text-white">${Number(pagarCuota.saldoCuota).toLocaleString('es-AR')}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="form-group col-span-2">
                                <label className="form-label">Recaudación Efectiva (ARS) *</label>
                                <div className="relative">
                                    <DollarSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" />
                                    <input type="number" className="form-input pl-10 font-black text-lg" value={pagoForm.monto || ''}
                                        onChange={e => setPagoForm(f => ({ ...f, monto: +e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Vía de Ingreso *</label>
                                <select className="form-input" value={pagoForm.metodo} onChange={e => setPagoForm(f => ({ ...f, metodo: e.target.value as PagarCuotaDto['metodo'] }))}>
                                    {Object.entries(metodoLabels).map(([k, v]) => <option key={k} value={k}>{v.toUpperCase()}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Fecha del Pago</label>
                                <input type="date" className="form-input" value={pagoForm.fechaPago ?? today()}
                                    onChange={e => setPagoForm(f => ({ ...f, fechaPago: e.target.value }))} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Referencia / Tracking Number</label>
                            <input type="text" className="form-input" value={pagoForm.referencia ?? ''}
                                onChange={e => setPagoForm(f => ({ ...f, referencia: e.target.value }))} placeholder="NRO DE RECIBO, TRANSFERENCIA..." />
                        </div>
                    </div>
                )}
            </Modal>

            {/* REFINANCIAR */}
            <Modal
                isOpen={refiOpen}
                onClose={() => setRefiOpen(false)}
                title="Refinanciar contrato"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setRefiOpen(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleRefinanciar} disabled={refiSaving}>
                            {refiSaving ? 'Refinanciando...' : 'Confirmar refinanciación'}
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <div className="card glass">
                        <span className="stat-tile-label">Deuda a refinanciar</span>
                        <div className="text-3xl font-black">
                            ${saldoRefinanciable.toLocaleString('es-AR')}
                            <span className="text-xs text-muted" style={{ marginLeft: '0.35rem' }}>{detail?.moneda || 'ARS'}</span>
                        </div>
                        <p className="text-xs text-muted" style={{ marginTop: '0.5rem' }}>
                            Es el saldo impago del contrato #{String(detail?.id ?? '').padStart(6, '0')}. Ese contrato queda
                            cerrado como refinanciado y su deuda pasa al nuevo.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="form-group">
                            <label className="form-label">Cantidad de cuotas *</label>
                            <input type="number" min="1" className="form-input" value={refiForm.cuotas}
                                onChange={e => setRefiForm(f => ({ ...f, cuotas: e.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Tasa mensual (%)</label>
                            <input type="number" min="0" step="0.01" className="form-input" value={refiForm.tasaMensual}
                                onChange={e => setRefiForm(f => ({ ...f, tasaMensual: e.target.value }))} placeholder="Vacío = sin interés" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Día de vencimiento</label>
                            <input type="number" min="1" max="31" className="form-input" value={refiForm.diaVencimiento}
                                onChange={e => setRefiForm(f => ({ ...f, diaVencimiento: e.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Fecha de inicio</label>
                            <input type="date" className="form-input" value={refiForm.fechaInicio}
                                onChange={e => setRefiForm(f => ({ ...f, fechaInicio: e.target.value }))} />
                        </div>
                    </div>

                    <p className="text-xs text-muted">
                        Con tasa, la cuota se calcula por sistema francés (cuota fija). Sin tasa, se prorratea la deuda.
                    </p>
                </div>
            </Modal>

            {/* DELETE MODAL (BAJA) */}
            <ConfirmDialog
                isOpen={deleteId !== null}
                type="danger"
                title="Anular financiación"
                message={`¿Confirma la revocación total del contrato # ${deleteId ?? ''}? Esta acción es irreversible y anulará el cronograma de cobros.`}
                confirmLabel="Confirmar Revocación"
                cancelLabel="Desistir"
                onConfirm={handleDelete}
                onCancel={() => setDeleteId(null)}
            />

            <style>{`
                .form-input-premium {
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 1rem;
                    color: white;
                    font-weight: 700;
                    font-size: 0.85rem;
                    outline: none;
                    transition: all 0.3s;
                }
                .form-input-premium:focus {
                    border-color: var(--accent);
                    background: rgba(15, 23, 42, 0.9);
                    box-shadow: 0 0 15px rgba(79, 70, 229, 0.1);
                }
                .icon-badge {
                    width: 44px;
                    height: 44px;
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--accent-light);
                    color: var(--accent);
                }
                .shadow-glow { box-shadow: 0 0 20px rgba(79, 70, 229, 0.2); }
                .shadow-glow-sm { box-shadow: 0 0 15px rgba(79, 70, 229, 0.1); }
                
                .form-label-xs {
                    font-size: 0.70rem;
                    font-weight: 800;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    margin-bottom: 0.5rem;
                    display: block;
                    letter-spacing: 0.1em;
                }
                .form-input-select {
                    padding: 0.75rem 2.5rem 0.75rem 1rem;
                    border-radius: 1rem;
                    border: 1px solid var(--border);
                    background: var(--bg-primary);
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    appearance: none;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%234f46e5' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 1rem center;
                }
                .filters-bar {
                    padding: 1.5rem !important;
                    background: rgba(15, 23, 42, 0.4) !important;
                    border: 1px solid rgba(255,255,255,0.05) !important;
                }
                .icon-btn {
                    padding: 0.6rem;
                    border-radius: 12px;
                    background: var(--bg-secondary);
                    color: var(--text-secondary);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    border: 1px solid var(--border);
                }
                .icon-btn:hover {
                    background: var(--accent);
                    color: white;
                    border-color: var(--accent);
                    transform: scale(1.05);
                }
                .icon-btn.danger:hover {
                    background: #ef4444;
                    border-color: #ef4444;
                }
                .line-clamp-2 {
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
            `}</style>
        </div >
    );
};

export default FinanciacionesPage;
