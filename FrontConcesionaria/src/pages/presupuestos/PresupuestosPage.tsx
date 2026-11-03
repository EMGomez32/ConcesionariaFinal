import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { presupuestosApi } from '../../api/presupuestos.api';
import { clientesApi } from '../../api/clientes.api';
import { usuariosApi } from '../../api/usuarios.api';
import { sucursalesApi } from '../../api/sucursales.api';
import { vehiculosApi } from '../../api/vehiculos.api';
import client from '../../api/client';
import type { EstadoPresupuesto, Presupuesto } from '../../types/presupuesto.types';
import type { FormaPagoVenta } from '../../types/venta.types';
import type { PaginatedResponse } from '../../types/api.types';
import { formatFecha, hoyLocal } from '../../utils/fecha';
import { formatMoneda } from '../../utils/moneda';
import { useAuthStore } from '../../store/authStore';
import { useConfirm } from '../../hooks/useConfirm';
import { FORMA_PAGO_OPTIONS, PRESUPUESTO_ESTADO, rotuloEstado } from '../../components/ventas/estados';
import { useFiltrosUrl } from '../../components/ventas/useFiltrosUrl';
import '../../components/ventas/listados.css';

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
    precioLista?: number;
    moneda?: string;
    sucursalId?: number;
}

interface VendedorRef {
    id: number;
    nombre: string;
}
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Combobox from '../../components/ui/Combobox';
import Textarea from '../../components/ui/Textarea';
import DataTable, { type Column } from '../../components/ui/DataTable';
import PageTitle from '../../components/ui/PageTitle';
import { useUIStore } from '../../store/uiStore';
import {
    Plus, Search, Eye, Pencil, Trash2,
    SendHorizonal, CheckCircle, FileText, Car,
    ArrowRightLeft, DollarSign, X,
    Hash, RefreshCw, ArrowRight, FileDown, MessageCircle, Clock
} from 'lucide-react';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { getList } from '../../utils/lista';
import { waLink } from '../../utils/whatsapp';

/* ── helpers ── */
const today = hoyLocal;

const genNro = () => {
    const d = new Date();
    return `P-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getTime()).slice(-4)}`;
};

// fechaCreacion y validoHasta son @db.Date: se formatean sin conversión de zona
// horaria para que no se corran un día.
const fmt = (v: string | null | undefined) => formatFecha(v);

const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/* ── transiciones de estado (espejo de la máquina de estados del backend) ──
 * Ninguna tiene vuelta atrás, así que todas piden confirmación. */
interface Transicion { label: string; next: EstadoPresupuesto; icon: React.ReactNode; danger?: boolean; mensaje: string }
const TRANSITIONS: Partial<Record<EstadoPresupuesto, Transicion[]>> = {
    borrador: [
        { label: 'Marcar como enviado', next: 'enviado', icon: <SendHorizonal size={14} />, mensaje: 'pasa a Enviado: ya se lo mandaste al cliente. No vuelve a borrador.' },
        { label: 'Anular', next: 'cancelado', icon: <X size={14} />, danger: true, mensaje: 'queda anulado y no se puede reactivar.' },
    ],
    enviado: [
        { label: 'Marcar como aceptado', next: 'aceptado', icon: <CheckCircle size={14} />, mensaje: 'queda Aceptado y se puede convertir en venta. No vuelve a Enviado.' },
        { label: 'Marcar como rechazado', next: 'rechazado', icon: <X size={14} />, danger: true, mensaje: 'queda Rechazado. Es un estado final: no se puede reabrir.' },
        { label: 'Marcar como vencido', next: 'vencido', icon: <Clock size={14} />, mensaje: 'queda Vencido. Es un estado final: no se puede reabrir.' },
        { label: 'Anular', next: 'cancelado', icon: <X size={14} />, danger: true, mensaje: 'queda anulado y no se puede reactivar.' },
    ],
    aceptado: [
        { label: 'Anular', next: 'cancelado', icon: <X size={14} />, danger: true, mensaje: 'queda anulado y ya no se puede convertir en venta.' },
    ],
};

/** El paso "de todos los días" de cada estado, el único que entra en la fila. */
const transicionRapida = (estado: string): Transicion | undefined =>
    estado === 'borrador' || estado === 'enviado' ? TRANSITIONS[estado as EstadoPresupuesto]?.[0] : undefined;

/* ── blank rows ── */
const emptyItem = () => ({ vehiculoId: '', precioLista: '', descuento: '0', precioFinal: '' });

const emptyCanje = () => ({ descripcion: '', anio: '', km: '', dominio: '', valorTomado: '', observaciones: '' });

/** Usuario actual como vendedor por defecto, si tiene ese rol. */
const vendedorPorDefecto = (): string => {
    const u = useAuthStore.getState().user;
    return u?.roles?.includes('vendedor') ? String(u.id) : '';
};

const blankForm = () => ({
    nroPresupuesto: genNro(),
    sucursalId: '',
    clienteId: '',
    vendedorId: vendedorPorDefecto(),
    moneda: 'ARS' as 'ARS' | 'USD',
    fechaCreacion: today(),
    validoHasta: '',
    observaciones: '',
    items: [emptyItem()],
    extras: [] as { descripcion: string; monto: string }[],
    conCanje: false,
    canje: emptyCanje(),
});

/* ── total calc ── */
const calcTotal = (pres: PresupuestoRow) => {
    const items = (pres.items ?? []).reduce((s: number, i: PresupuestoItem) => s + num(i.precioFinal), 0);
    const extras = (pres.extras ?? []).reduce((s: number, e: PresupuestoExtra) => s + num(e.monto), 0);
    const canje = pres.canje ? num(pres.canje.valorTomado) : 0;
    return items + extras - canje;
};

/**
 * Cantidad de presupuestos en un estado, contada por el backend (`totalResults`
 * con limit=1). "En negociación" y "Cierre del mes" contaban la página visible.
 */
const usePresupuestosConteo = (estado: EstadoPresupuesto) => useQuery({
    queryKey: ['presupuestos', 'conteo', estado],
    queryFn: async () => {
        const res = await presupuestosApi.getAll({ estado }, { page: 1, limit: 1 }) as unknown as PaginatedResponse<unknown>;
        return res?.totalResults ?? 0;
    },
});

const PresupuestosPage = () => {
    const { addToast } = useUIStore();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();

    // Filtros, búsqueda y página en la URL (sobreviven a entrar a una ficha y volver).
    const { filtros, q, busqueda, setBusqueda, page, setPage, setFiltro, limpiar, hayFiltros } =
        useFiltrosUrl(['estado'] as const);

    // Descarga el presupuesto en PDF (mismo patrón que el comprobante de venta).
    const handlePdf = async (id: number) => {
        try {
            const blob = await presupuestosApi.pdf(id) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `presupuesto-${id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('No se pudo generar el PDF del presupuesto', 'error');
        }
    };

    // Abre WhatsApp con un mensaje al cliente sobre su presupuesto. NO envía: el
    // vendedor revisa, adjunta el PDF (botón de al lado) y manda.
    const handleWhatsapp = (p: PresupuestoRow) => {
        const total = calcTotal(p);
        const totalTxt = total ? ` por un total de ${formatMoneda(total, p.moneda)}` : '';
        const msg = `Hola ${p.cliente?.nombre ?? ''}, te comparto el presupuesto N° ${p.nroPresupuesto}${totalTxt}. Te adjunto el PDF con el detalle. Cualquier consulta quedo a disposición. ¡Saludos!`;
        const link = waLink(p.cliente?.telefono, msg);
        if (!link) {
            addToast('El cliente no tiene un teléfono válido cargado', 'error');
            return;
        }
        window.open(link, '_blank', 'noopener');
    };

    /* ── convertir en venta ── */
    const [convertirId, setConvertirId] = useState<number | null>(null);
    const [convertirForm, setConvertirForm] = useState({
        formaPago: 'contado' as FormaPagoVenta,
        moneda: 'ARS' as 'ARS' | 'USD',
        fechaVenta: hoyLocal(),
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
            addToast('Venta registrada a partir del presupuesto', 'success');
            setConvertirId(null);
            navigate('/ventas');
        } catch (err: unknown) {
            const e = err as { message?: string; code?: string };
            addToast(e?.message || 'No se pudo convertir el presupuesto en venta', 'error');
        } finally {
            setConvertirSaving(false);
        }
    };

    const abrirConvertir = (p: PresupuestoRow) => {
        setConvertirId(Number(p.id));
        setConvertirForm({
            formaPago: 'contado',
            moneda: (p.moneda as 'ARS' | 'USD') || 'ARS',
            fechaVenta: hoyLocal(),
            observaciones: '',
        });
    };

    /* ── listado: búsqueda y filtros resueltos por el backend (contrato 1) ── */
    const listaQuery = useQuery({
        queryKey: ['presupuestos', 'list', { q, estado: filtros.estado, page }],
        queryFn: async () => {
            const params: Record<string, unknown> = { page, limit: 15 };
            if (filtros.estado) params.estado = filtros.estado;
            if (q) params.q = q;
            return await presupuestosApi.getAll(params) as unknown as PaginatedResponse<PresupuestoRow>;
        },
        placeholderData: keepPreviousData,
    });
    const presupuestos = listaQuery.data?.results ?? [];
    const totalPages = listaQuery.data?.totalPages ?? 1;
    const recargar = () => queryClient.invalidateQueries({ queryKey: ['presupuestos'] });

    /* ── indicadores: contados por el backend (totalResults), no sobre la página visible ── */
    const enviados = usePresupuestosConteo('enviado');
    const aceptados = usePresupuestosConteo('aceptado');
    const borradores = usePresupuestosConteo('borrador');
    const kpi = (c: { data?: number; isLoading: boolean; isError: boolean }) =>
        c.isError ? '—' : c.isLoading ? '…' : String(c.data ?? 0);

    /* ── catalogs ── */
    const [clientes, setClientes] = useState<ClienteRef[]>([]);
    const [vendedores, setVendedores] = useState<VendedorRef[]>([]);
    const [sucursales, setSucursales] = useState<SucursalRef[]>([]);
    const [vehiculos, setVehiculos] = useState<VehiculoRef[]>([]);
    const [catalogosOk, setCatalogosOk] = useState(false);

    /* ── modals ── */
    const [createOpen, setCreateOpen] = useState(false);
    const [detailId, setDetailId] = useState<number | null>(null);
    const [editId, setEditId] = useState<number | null>(null);
    const [editEstadoActual, setEditEstadoActual] = useState<EstadoPresupuesto>('borrador');
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
            // getList: no todos los módulos responden con la misma forma.
            setClientes(getList<ClienteRef>(c));
            setVendedores(getList<VendedorRef>(u));
            setSucursales(getList<SucursalRef>(s));
            setVehiculos(getList<VehiculoRef>(v));
            setCatalogosOk(true);
        }).catch((e: unknown) => {
            // Sin esto el alta quedaba con los selects vacíos y sin explicación.
            addToast(getErrorMessage(e, 'No se pudieron cargar clientes, vendedores, sucursales y unidades para el alta'), 'error');
        });
    }, [addToast]);

    /* ── prefill "generar presupuesto desde el interés" ──
     * Se llega con /presupuestos?nuevoClienteId=..&nuevoVehiculoId=.. desde la
     * ficha del cliente o del vehículo (tab de interés). Abre el form de alta ya
     * con el cliente y el vehículo (y su precio) cargados. Corre una sola vez, y
     * espera a que carguen los catálogos para que el precio se derive del stock. */
    const prefillDone = useRef(false);
    useEffect(() => {
        if (prefillDone.current) return;
        const cid = searchParams.get('nuevoClienteId');
        if (!cid) return;
        if (!catalogosOk) return; // catálogos aún no cargados
        prefillDone.current = true;
        const vid = searchParams.get('nuevoVehiculoId');
        (async () => {
            const f = blankForm();
            f.clienteId = cid;
            // El cliente puede no estar entre los primeros del catálogo (tenant con
            // muchos): si falta, lo traemos puntual y lo inyectamos para que el
            // <select> lo muestre (simétrico al fallback del vehículo de abajo).
            if (!clientes.some(c => String(c.id) === cid)) {
                try {
                    const full = await clientesApi.getById(Number(cid)) as unknown as ClienteRef;
                    if (full?.id) setClientes(prev => prev.some(c => c.id === full.id) ? prev : [{ id: full.id, nombre: full.nombre }, ...prev]);
                } catch {
                    addToast('No se encontró el cliente del interés: elegilo a mano', 'info');
                }
            }
            if (vid) {
                let v = vehiculos.find(x => String(x.id) === vid);
                if (!v) {
                    // El vehículo del interés puede no estar 'publicado' (reservado, en
                    // preparación): lo traemos puntual y lo inyectamos al catálogo para
                    // que el <select> del ítem lo muestre.
                    try {
                        const full = await vehiculosApi.getById(Number(vid)) as unknown as VehiculoRef;
                        if (full?.id) {
                            v = full;
                            setVehiculos(prev => prev.some(x => x.id === full.id) ? prev : [full, ...prev]);
                        }
                    } catch {
                        addToast('No se encontró la unidad del interés: elegila a mano', 'info');
                    }
                }
                if (v) {
                    const precio = v.precioLista != null ? String(v.precioLista) : '';
                    f.items = [{ vehiculoId: String(v.id), precioLista: precio, descuento: '0', precioFinal: precio }];
                    if (v.moneda === 'ARS' || v.moneda === 'USD') f.moneda = v.moneda;
                    if (v.sucursalId) f.sucursalId = String(v.sucursalId);
                }
            }
            setForm(f);
            setCreateOpen(true);
            // Sacar sólo los params del prefill (los filtros del listado quedan).
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.delete('nuevoClienteId');
                next.delete('nuevoVehiculoId');
                return next;
            }, { replace: true });
            addToast('Revisá el presupuesto precargado y guardá', 'info');
        })();
    }, [searchParams, catalogosOk, clientes, vehiculos, setSearchParams, addToast]);

    /* ── detalle ── */
    const detailQuery = useQuery({
        queryKey: ['presupuestos', 'detail', detailId],
        // El interceptor de axios ya devuelve el body: el endpoint responde el
        // presupuesto plano, sin envoltorio.
        queryFn: async () => await presupuestosApi.getById(detailId!) as unknown as PresupuestoRow,
        enabled: detailId !== null,
    });
    const detail = detailId !== null ? detailQuery.data ?? null : null;

    /* ── create ── */
    const handleCreate = async () => {
        if (!form.sucursalId || !form.clienteId || !form.vendedorId) {
            addToast('Completá la sucursal, el cliente y el vendedor', 'error'); return;
        }
        const validItems = form.items.filter(i => i.vehiculoId && i.precioFinal);
        if (validItems.length === 0) {
            addToast('Agregá al menos una unidad con su precio final', 'error'); return;
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
            addToast('Presupuesto creado', 'success');
            setCreateOpen(false);
            setForm(blankForm());
            setPage(1);
            recargar();
        } catch (e: unknown) {
            // El interceptor de api/client.ts rechaza con `error.response.data`, o sea
            // el body YA desempaquetado.
            addToast(getErrorMessage(e, 'No se pudo crear el presupuesto'), 'error');
        } finally {
            setSaving(false);
        }
    };

    /* ── edit ── */
    const openEdit = (p: PresupuestoRow) => {
        setEditId(Number(p.id));
        setEditEstadoActual(p.estado as EstadoPresupuesto);
        setEditForm({ estado: String(p.estado || ''), observaciones: String(p.observaciones || '') });
    };

    const handleEdit = async () => {
        if (!editId) return;
        setSaving(true);
        try {
            await presupuestosApi.update(editId, {
                // Sólo se manda el estado si cambió: reenviar el mismo es una
                // transición inválida para la máquina de estados del backend.
                estado: editForm.estado && editForm.estado !== editEstadoActual ? editForm.estado : undefined,
                observaciones: editForm.observaciones || undefined,
            });
            addToast('Presupuesto actualizado', 'success');
            setEditId(null);
            recargar();
        } catch (e: unknown) {
            addToast(getErrorMessage(e, 'No se pudo actualizar el presupuesto'), 'error');
        } finally {
            setSaving(false);
        }
    };

    /* ── transiciones rápidas: siempre con confirmación (ninguna tiene vuelta atrás) ── */
    const changeEstado = (p: PresupuestoRow, t: Transicion) => confirm({
        title: t.label,
        message: `El presupuesto N° ${p.nroPresupuesto} ${t.mensaje}`,
        type: t.danger ? 'danger' : 'question',
        confirmLabel: t.label,
        onConfirm: async () => {
            try {
                await presupuestosApi.update(p.id, { estado: t.next });
                addToast(`Presupuesto ${PRESUPUESTO_ESTADO[t.next].label.toLowerCase()}`, 'success');
                recargar();
            } catch (e: unknown) {
                addToast(getErrorMessage(e, 'No se pudo cambiar el estado'), 'error');
                throw e;
            }
        },
    });

    /* ── delete ── */
    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await presupuestosApi.delete(deleteId);
            addToast('Presupuesto eliminado', 'success');
            setDeleteId(null);
            recargar();
        } catch (e: unknown) {
            addToast(getErrorMessage(e, 'No se pudo eliminar el presupuesto'), 'error');
        }
    };

    /* ── dynamic row helpers ── */
    const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
    const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

    /**
     * Precio de lista, descuento y final se mantienen coherentes:
     * lista o descuento recalculan el final; tocar el final recalcula el descuento.
     * Al elegir la unidad se precargan su precio de lista y, si todavía no se
     * eligieron, la moneda y la sucursal.
     */
    const updItem = (i: number, k: 'vehiculoId' | 'precioLista' | 'descuento' | 'precioFinal', v: string) =>
        setForm(f => {
            let { moneda, sucursalId } = f;
            const items = f.items.map((it, idx) => {
                if (idx !== i) return it;
                const next = { ...it, [k]: v };
                if (k === 'vehiculoId') {
                    const veh = vehiculos.find(x => String(x.id) === v);
                    if (veh?.precioLista != null) {
                        next.precioLista = String(veh.precioLista);
                        next.descuento = '0';
                        next.precioFinal = String(veh.precioLista);
                    }
                    if (i === 0 && (veh?.moneda === 'ARS' || veh?.moneda === 'USD')) moneda = veh.moneda;
                    if (!sucursalId && veh?.sucursalId) sucursalId = String(veh.sucursalId);
                } else if (k === 'precioLista' || k === 'descuento') {
                    const final = num(next.precioLista) - num(next.descuento);
                    next.precioFinal = next.precioLista === '' ? '' : String(Math.max(0, final));
                } else if (k === 'precioFinal' && next.precioLista !== '') {
                    next.descuento = String(Math.max(0, num(next.precioLista) - num(v)));
                }
                return next;
            });
            return { ...f, items, moneda, sucursalId };
        });

    const currentTotal = () => {
        const items = form.items.reduce((s, i) => s + num(i.precioFinal), 0);
        const extras = form.extras.reduce((s, e) => s + num(e.monto), 0);
        const canje = form.conCanje ? num(form.canje.valorTomado) : 0;
        return items + extras - canje;
    };

    const columns: Column<PresupuestoRow>[] = [
        {
            header: 'Número',
            accessor: (p) => (
                <div className="flex flex-col">
                    <span className="font-mono text-xs font-bold">{p.nroPresupuesto}</span>
                    <span className="text-xs text-muted tabular-nums">{fmt(p.fechaCreacion)}</span>
                </div>
            ),
        },
        {
            // Cliente y vendedor juntos: a 1280 px la tabla entra sin scroll horizontal.
            header: 'Cliente',
            accessor: (p) => (
                <div className="flex flex-col" style={{ minWidth: 0 }}>
                    <span className="font-bold text-sm truncate">{p.cliente?.nombre ?? '-'}</span>
                    <span className="text-xs text-muted truncate">Vendedor: {p.vendedor?.nombre ?? 'sin asignar'}</span>
                </div>
            ),
        },
        {
            header: 'Total',
            align: 'right',
            accessor: (p) => <span className="font-bold tabular-nums" style={{ whiteSpace: 'nowrap' }}>{formatMoneda(calcTotal(p), p.moneda)}</span>,
        },
        {
            // La validez va bajo el estado (se leen juntos: un enviado con la
            // validez vencida está para marcarlo como vencido) y la tabla gana
            // una columna: a 1280 px las acciones entran sin scroll horizontal.
            header: 'Estado',
            accessor: (p) => {
                const e = rotuloEstado(PRESUPUESTO_ESTADO, p.estado);
                const vivo = p.estado === 'borrador' || p.estado === 'enviado';
                const vencido = vivo && !!p.validoHasta && p.validoHasta.slice(0, 10) < hoyLocal();
                return (
                    <div className="flex flex-col gap-1" style={{ alignItems: 'flex-start' }}>
                        <Badge variant={e.variant}>{e.label}</Badge>
                        {p.validoHasta && (
                            <span className={`text-xs tabular-nums ${vencido ? 'text-danger font-bold' : 'text-muted'}`} title={vencido ? 'La validez ya pasó' : undefined}>
                                Válido hasta {fmt(p.validoHasta)}
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            header: 'Acciones',
            align: 'right',
            accessor: (p) => {
                const rapida = transicionRapida(p.estado);
                return (
                    <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {rapida && (
                            <button type="button" className="icon-btn" title={rapida.label} aria-label={`${rapida.label}: presupuesto ${p.nroPresupuesto}`} onClick={() => changeEstado(p, rapida)}>
                                {rapida.icon}
                            </button>
                        )}
                        {p.estado === 'aceptado' && (
                            <button type="button" className="icon-btn" title="Convertir en venta" aria-label={`Convertir en venta el presupuesto ${p.nroPresupuesto}`} onClick={() => abrirConvertir(p)}>
                                <ArrowRight size={16} />
                            </button>
                        )}
                        <button type="button" className="icon-btn" title="Enviar por WhatsApp" aria-label={`Enviar por WhatsApp el presupuesto ${p.nroPresupuesto}`} onClick={() => handleWhatsapp(p)}><MessageCircle size={16} /></button>
                        <button type="button" className="icon-btn" title="Descargar PDF" aria-label={`Descargar PDF del presupuesto ${p.nroPresupuesto}`} onClick={() => handlePdf(p.id)}><FileDown size={16} /></button>
                        <button type="button" className="icon-btn" title="Ver detalle" aria-label={`Ver detalle del presupuesto ${p.nroPresupuesto}`} onClick={() => setDetailId(p.id)}><Eye size={16} /></button>
                        <button type="button" className="icon-btn danger" title="Eliminar" aria-label={`Eliminar el presupuesto ${p.nroPresupuesto}`} onClick={() => setDeleteId(p.id)}><Trash2 size={16} /></button>
                    </div>
                );
            },
        },
    ];

    // Estados a los que se puede pasar desde el actual (para el select de "Cambiar estado").
    const estadosEditables: EstadoPresupuesto[] = [editEstadoActual, ...(TRANSITIONS[editEstadoActual] ?? []).map(t => t.next)];

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Presupuestos" />
            {/* Header */}
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary">
                            <FileText size={20} />
                        </div>
                        <h1>Presupuestos</h1>
                    </div>
                    <p>Presupuestos para clientes: envialos, seguí su respuesta y convertilos en venta.</p>
                </div>
                <div className="header-actions">
                    <Button variant="secondary" onClick={() => recargar()} aria-label="Actualizar listado" title="Actualizar listado">
                        <RefreshCw size={18} className={listaQuery.isFetching ? 'animate-spin' : ''} />
                    </Button>
                    <Button variant="primary" onClick={() => { setForm(blankForm()); setCreateOpen(true); }}>
                        <Plus size={18} /> Nuevo presupuesto
                    </Button>
                </div>
            </header>

            {/* Indicadores: cantidades reales del backend, no de la página visible */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card glass stat-tile">
                    <div>
                        <span className="stat-tile-label">Enviados</span>
                        <div className="text-3xl font-black tabular-nums">{kpi(enviados)}</div>
                        <span className="text-xs text-muted">Esperando respuesta del cliente</span>
                    </div>
                    <SendHorizonal size={64} className="stat-tile-bg" />
                </div>
                <div className="card glass stat-tile">
                    <div>
                        <span className="stat-tile-label">Aceptados</span>
                        <div className="text-3xl font-black tabular-nums">{kpi(aceptados)}</div>
                        <span className="text-xs text-muted">En total, convertidos o no en venta</span>
                    </div>
                    <CheckCircle size={64} className="stat-tile-bg" />
                </div>
                <div className="card glass stat-tile">
                    <div>
                        <span className="stat-tile-label">Borradores</span>
                        <div className="text-3xl font-black tabular-nums">{kpi(borradores)}</div>
                        <span className="text-xs text-muted">Todavía sin enviar</span>
                    </div>
                    <FileText size={64} className="stat-tile-bg" />
                </div>
            </div>

            {/* Filtros */}
            <div className="filters-bar filtros-comerciales">
                <div className="search-box">
                    <Search size={18} className="text-muted" aria-hidden="true" />
                    <input
                        type="search"
                        placeholder="Buscar por número, cliente, DNI, dominio, marca o modelo"
                        aria-label="Buscar presupuestos"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                    />
                </div>
                <select aria-label="Filtrar por estado" value={filtros.estado} onChange={e => setFiltro('estado', e.target.value)}>
                    <option value="">Estado: todos</option>
                    {Object.entries(PRESUPUESTO_ESTADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {hayFiltros && (
                    <Button variant="ghost" size="sm" onClick={limpiar}>
                        <X size={16} /> Limpiar filtros
                    </Button>
                )}
            </div>

            <div className="listado-compacto">
            <DataTable
                columns={columns}
                data={presupuestos}
                isLoading={listaQuery.isLoading}
                isError={listaQuery.isError}
                errorMessage="No se pudieron cargar los presupuestos"
                onRetry={() => listaQuery.refetch()}
                onRowClick={(p) => setDetailId(p.id)}
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                emptyMessage={hayFiltros
                    ? 'Ningún presupuesto coincide con la búsqueda o los filtros'
                    : 'Todavía no hay presupuestos. Creá el primero con «Nuevo presupuesto».'}
                emptyIcon={<FileText size={40} className="dt-empty-icon" />}
                onClearFilters={hayFiltros ? limpiar : undefined}
            />
            </div>

            {/* ALTA */}
            <Modal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Nuevo presupuesto"
                subtitle="Elegí el cliente y las unidades. Los campos con * son obligatorios."
                maxWidth="900px"
                footer={(
                    <div className="flex justify-between items-center w-full flex-wrap gap-4">
                        <div>
                            <p className="stat-tile-label">Total del presupuesto</p>
                            <p className="text-2xl font-black tabular-nums">{formatMoneda(currentTotal(), form.moneda)}</p>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                            <Button variant="primary" onClick={handleCreate} loading={saving}>Crear presupuesto</Button>
                        </div>
                    </div>
                )}
            >
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                            dense
                            label="Número"
                            hint="Se genera solo; podés cambiarlo."
                            icon={<Hash size={16} />}
                            className="font-bold"
                            value={form.nroPresupuesto}
                            onChange={e => setForm(f => ({ ...f, nroPresupuesto: e.target.value }))}
                        />
                        <Select
                            dense
                            label="Moneda"
                            value={form.moneda}
                            onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}
                        >
                            <option value="ARS">Pesos ($)</option>
                            <option value="USD">Dólares (US$)</option>
                        </Select>
                        <Select
                            dense
                            label="Sucursal *"
                            placeholder="Elegí la sucursal"
                            options={sucursales.map(s => ({ value: s.id, label: s.nombre }))}
                            value={form.sucursalId}
                            onChange={e => setForm(f => ({ ...f, sucursalId: e.target.value }))}
                        />
                        <Combobox
                            dense
                            label="Cliente *"
                            placeholder="Buscá el cliente por nombre"
                            options={clientes.map(c => ({ value: c.id, label: c.nombre }))}
                            value={form.clienteId}
                            onChange={v => setForm(f => ({ ...f, clienteId: v == null ? '' : String(v) }))}
                        />
                        <Select
                            dense
                            label="Vendedor *"
                            placeholder="Elegí el vendedor"
                            options={vendedores.map(u => ({ value: u.id, label: u.nombre }))}
                            value={form.vendedorId}
                            onChange={e => setForm(f => ({ ...f, vendedorId: e.target.value }))}
                        />
                        <Input
                            dense
                            label="Válido hasta"
                            type="date"
                            value={form.validoHasta}
                            onChange={e => setForm(f => ({ ...f, validoHasta: e.target.value }))}
                        />
                    </div>

                    {/* Unidades */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <Car size={14} aria-hidden="true" /> Unidades
                            </h3>
                            <Button variant="secondary" size="sm" onClick={addItem}>
                                <Plus size={14} /> Agregar unidad
                            </Button>
                        </div>
                        {form.items.map((item, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-2">
                                <Combobox
                                    dense
                                    containerClassName="md:col-span-5 mb-0"
                                    label="Unidad *"
                                    placeholder="Buscá por marca, modelo o dominio"
                                    options={vehiculos.map(v => ({ value: v.id, label: `${v.marca} ${v.modelo}`, sub: v.dominio ?? v.vin ?? `#${v.id}` }))}
                                    value={item.vehiculoId}
                                    onChange={v => updItem(i, 'vehiculoId', v == null ? '' : String(v))}
                                />
                                <Input
                                    dense
                                    containerClassName="md:col-span-2 mb-0"
                                    label="Precio de lista *"
                                    type="number"
                                    min="0"
                                    className="tabular-nums"
                                    value={item.precioLista}
                                    onChange={e => updItem(i, 'precioLista', e.target.value)}
                                />
                                <Input
                                    dense
                                    containerClassName="md:col-span-2 mb-0"
                                    label="Descuento"
                                    type="number"
                                    min="0"
                                    className="tabular-nums"
                                    value={item.descuento}
                                    onChange={e => updItem(i, 'descuento', e.target.value)}
                                />
                                <Input
                                    dense
                                    containerClassName="md:col-span-2 mb-0"
                                    label="Precio final *"
                                    type="number"
                                    min="0"
                                    className="font-bold tabular-nums"
                                    value={item.precioFinal}
                                    onChange={e => updItem(i, 'precioFinal', e.target.value)}
                                    hint={item.precioFinal !== '' ? formatMoneda(item.precioFinal, form.moneda) : undefined}
                                />
                                <div className="md:col-span-1 flex justify-end">
                                    <button type="button" className="icon-btn danger" aria-label={`Quitar la unidad ${i + 1}`} title="Quitar unidad"
                                        onClick={() => removeItem(i)} disabled={form.items.length === 1}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Extras */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <Plus size={14} aria-hidden="true" /> Extras
                            </h3>
                            <Button variant="secondary" size="sm" onClick={() => setForm(f => ({ ...f, extras: [...f.extras, { descripcion: '', monto: '' }] }))}>
                                <Plus size={14} /> Agregar extra
                            </Button>
                        </div>
                        {form.extras.length === 0 && <p className="text-xs text-muted">Gestoría, patentamiento, accesorios: lo que se le cobra aparte del precio de la unidad.</p>}
                        {form.extras.map((ex, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-2">
                                <Input dense containerClassName="md:col-span-8 mb-0" label="Descripción" value={ex.descripcion}
                                    onChange={e => setForm(f => ({ ...f, extras: f.extras.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x) }))} />
                                <Input dense containerClassName="md:col-span-3 mb-0" label="Monto" type="number" min="0" className="tabular-nums" value={ex.monto}
                                    onChange={e => setForm(f => ({ ...f, extras: f.extras.map((x, j) => j === i ? { ...x, monto: e.target.value } : x) }))} />
                                <div className="md:col-span-1 flex justify-end">
                                    <button type="button" className="icon-btn danger" aria-label={`Quitar el extra ${i + 1}`} title="Quitar extra"
                                        onClick={() => setForm(f => ({ ...f, extras: f.extras.filter((_, j) => j !== i) }))}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Canje */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-bold" style={{ cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={form.conCanje}
                                onChange={e => setForm(f => ({ ...f, conCanje: e.target.checked }))}
                            />
                            <ArrowRightLeft size={14} aria-hidden="true" /> El cliente entrega una unidad en canje
                        </label>
                        {form.conCanje && (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-3">
                                <Input
                                    dense
                                    label="Marca y modelo"
                                    containerClassName="md:col-span-2"
                                    value={form.canje.descripcion}
                                    onChange={e => setForm(f => ({ ...f, canje: { ...f.canje, descripcion: e.target.value } }))}
                                />
                                <Input
                                    dense
                                    label="Dominio"
                                    className="font-mono"
                                    value={form.canje.dominio}
                                    onChange={e => setForm(f => ({ ...f, canje: { ...f.canje, dominio: e.target.value } }))}
                                />
                                <Input
                                    dense
                                    label="Valor de toma *"
                                    type="number"
                                    min="0"
                                    icon={<DollarSign size={16} />}
                                    className="font-bold tabular-nums"
                                    value={form.canje.valorTomado}
                                    onChange={e => setForm(f => ({ ...f, canje: { ...f.canje, valorTomado: e.target.value } }))}
                                    hint="Se descuenta del total."
                                />
                                <Input
                                    dense
                                    label="Año"
                                    type="number"
                                    value={form.canje.anio}
                                    onChange={e => setForm(f => ({ ...f, canje: { ...f.canje, anio: e.target.value } }))}
                                />
                                <Input
                                    dense
                                    label="Kilómetros"
                                    type="number"
                                    min="0"
                                    value={form.canje.km}
                                    onChange={e => setForm(f => ({ ...f, canje: { ...f.canje, km: e.target.value } }))}
                                />
                            </div>
                        )}
                    </div>

                    <Textarea
                        dense
                        label="Observaciones"
                        rows={2}
                        value={form.observaciones}
                        onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                        placeholder="Condiciones, plazos de entrega, lo que se acordó con el cliente…"
                    />
                </div>
            </Modal>

            {/* DETALLE */}
            <Modal
                isOpen={detailId !== null}
                onClose={() => setDetailId(null)}
                title={detail ? `Presupuesto ${detail.nroPresupuesto}` : 'Presupuesto'}
                subtitle={detail?.sucursal?.nombre ? `Sucursal ${detail.sucursal.nombre}` : undefined}
                maxWidth="900px"
                footer={detail ? (
                    <div className="flex justify-between items-center w-full flex-wrap gap-4">
                        <div>
                            <p className="stat-tile-label">Total</p>
                            <p className="text-2xl font-black tabular-nums">{formatMoneda(calcTotal(detail), detail.moneda)}</p>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                            {detail.estado === 'aceptado' && (
                                <Button variant="primary" onClick={() => { setDetailId(null); abrirConvertir(detail); }}>
                                    <ArrowRight size={16} /> Convertir en venta
                                </Button>
                            )}
                            {(TRANSITIONS[detail.estado as EstadoPresupuesto] ?? []).map(t => (
                                <Button key={t.next} variant={t.danger ? 'danger' : 'secondary'} size="sm" onClick={() => changeEstado(detail, t)}>
                                    {t.icon} {t.label}
                                </Button>
                            ))}
                            <Button variant="secondary" size="sm" onClick={() => { setDetailId(null); openEdit(detail); }}>
                                <Pencil size={14} /> Editar
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setDetailId(null)}>Cerrar</Button>
                        </div>
                    </div>
                ) : undefined}
            >
                {detailQuery.isError ? (
                    <div className="dt-empty">
                        <p className="dt-empty-text">No se pudo cargar el presupuesto.</p>
                        <Button variant="secondary" size="sm" onClick={() => detailQuery.refetch()}>Reintentar</Button>
                    </div>
                ) : !detail ? (
                    <div className="text-center"><RefreshCw className="animate-spin text-accent mb-4" size={40} aria-hidden="true" /><p className="text-sm text-muted">Cargando el presupuesto…</p></div>
                ) : (
                    <div className="flex flex-col gap-6">
                        <div>
                            <Badge variant={rotuloEstado(PRESUPUESTO_ESTADO, detail.estado).variant}>
                                {rotuloEstado(PRESUPUESTO_ESTADO, detail.estado).label}
                            </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                                <span className="stat-tile-label">Fecha</span>
                                <p className="text-lg font-bold tabular-nums">{fmt(detail.fechaCreacion)}</p>
                            </div>
                            <div>
                                <span className="stat-tile-label">Válido hasta</span>
                                <p className="text-lg font-bold tabular-nums">{fmt(detail.validoHasta)}</p>
                            </div>
                            <div>
                                <span className="stat-tile-label">Cliente</span>
                                <p className="text-lg font-bold truncate">{detail.cliente?.nombre ?? '-'}</p>
                            </div>
                            <div>
                                <span className="stat-tile-label">Vendedor</span>
                                <p className="text-lg font-bold truncate">{detail.vendedor?.nombre ?? '-'}</p>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
                                <Car size={16} aria-hidden="true" /> Unidades
                            </h3>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Unidad</th>
                                            <th style={{ textAlign: 'right' }}>Precio de lista</th>
                                            <th style={{ textAlign: 'right' }}>Descuento</th>
                                            <th style={{ textAlign: 'right' }}>Precio final</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.items?.map((it: PresupuestoItem) => (
                                            <tr key={it.id}>
                                                <td className="font-bold text-sm">{it.vehiculo ? `${it.vehiculo.marca} ${it.vehiculo.modelo} · ${it.vehiculo.dominio || 'sin dominio'}` : `Unidad #${it.vehiculoId}`}</td>
                                                <td style={{ textAlign: 'right' }} className="text-muted tabular-nums">{formatMoneda(it.precioLista, detail.moneda)}</td>
                                                <td style={{ textAlign: 'right' }} className="tabular-nums">{num(it.descuento) ? `−${formatMoneda(it.descuento, detail.moneda)}` : '-'}</td>
                                                <td style={{ textAlign: 'right' }} className="font-black tabular-nums">{formatMoneda(it.precioFinal, detail.moneda)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {detail.canje && (
                            <div>
                                <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
                                    <ArrowRightLeft size={14} aria-hidden="true" /> Canje
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <div className="md:col-span-2">
                                        <span className="stat-tile-label">Unidad que entrega el cliente</span>
                                        <p className="font-bold">{detail.canje.descripcion || '-'}{detail.canje.anio ? ` (${detail.canje.anio})` : ''}</p>
                                    </div>
                                    <div>
                                        <span className="stat-tile-label">Dominio</span>
                                        <p className="font-mono">{detail.canje.dominio || 'sin dominio'}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="stat-tile-label">Valor de toma</span>
                                        <p className="text-xl font-black tabular-nums">−{formatMoneda(detail.canje.valorTomado, detail.moneda)}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(detail.extras?.length ?? 0) > 0 && (
                            <div>
                                <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
                                    <Plus size={16} aria-hidden="true" /> Extras
                                </h3>
                                <div className="table-container">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Concepto</th>
                                                <th style={{ textAlign: 'right' }}>Monto</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detail.extras!.map((e, i) => (
                                                <tr key={e.id ?? i}>
                                                    <td className="font-bold">{e.descripcion || 'Extra'}</td>
                                                    <td style={{ textAlign: 'right' }} className="font-black tabular-nums">{formatMoneda(e.monto, detail.moneda)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {detail.observaciones && (
                            <div>
                                <span className="stat-tile-label">Observaciones</span>
                                <p style={{ whiteSpace: 'pre-line' }}>{detail.observaciones}</p>
                            </div>
                        )}

                        {/* La cuenta que lleva al total: sin ella, un presupuesto con extras o
                            canje muestra un total que no coincide con la tabla de unidades. */}
                        <div>
                            <span className="stat-tile-label">Cuenta del total</span>
                            {[
                                { label: 'Unidades', valor: (detail.items ?? []).reduce((s, it) => s + num(it.precioFinal), 0), signo: '' },
                                { label: 'Extras', valor: (detail.extras ?? []).reduce((s, e) => s + num(e.monto), 0), signo: '+' },
                                { label: 'Canje', valor: detail.canje ? num(detail.canje.valorTomado) : 0, signo: '−' },
                            ].filter((r) => r.signo === '' || r.valor !== 0).map((r) => (
                                <div key={r.label} className="flex justify-between text-sm tabular-nums">
                                    <span className="text-secondary">{r.signo} {r.label}</span>
                                    <span className="font-bold">{formatMoneda(r.valor, detail.moneda)}</span>
                                </div>
                            ))}
                            <div className="flex justify-between text-sm tabular-nums font-black">
                                <span>Total</span>
                                <span>{formatMoneda(calcTotal(detail), detail.moneda)}</span>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* CAMBIAR ESTADO / OBSERVACIONES */}
            <Modal
                isOpen={editId !== null}
                onClose={() => setEditId(null)}
                title="Cambiar estado"
                subtitle="Cambiá el estado del presupuesto o sus observaciones."
                maxWidth="500px"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setEditId(null)}>Cancelar</Button>
                        <Button variant="primary" className="flex-1" onClick={handleEdit} loading={saving}>Guardar</Button>
                    </>
                )}
            >
                <div className="flex flex-col gap-4">
                    <Select
                        dense
                        label="Estado"
                        value={editForm.estado}
                        onChange={e => setEditForm(f => ({ ...f, estado: e.target.value }))}
                        hint={editForm.estado !== editEstadoActual ? 'Este cambio de estado no tiene vuelta atrás.' : undefined}
                    >
                        {estadosEditables.map(k => <option key={k} value={k}>{rotuloEstado(PRESUPUESTO_ESTADO, k).label}</option>)}
                    </Select>
                    <Textarea
                        dense
                        label="Observaciones"
                        rows={4}
                        value={editForm.observaciones}
                        onChange={e => setEditForm(f => ({ ...f, observaciones: e.target.value }))}
                        style={{ resize: 'none' }}
                        placeholder="Por qué cambia el estado, notas para el vendedor…"
                    />
                </div>
            </Modal>

            {/* CONVERTIR EN VENTA */}
            <Modal
                isOpen={convertirId !== null}
                onClose={() => setConvertirId(null)}
                title="Convertir en venta"
                subtitle="Completá los datos del cierre. El resto se toma del presupuesto."
                maxWidth="520px"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setConvertirId(null)}>Cancelar</Button>
                        <Button variant="primary" className="flex-1" onClick={handleConvertirEnVenta} loading={convertirSaving}>
                            <ArrowRight size={16} /> Registrar venta
                        </Button>
                    </>
                )}
            >
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Select
                            dense
                            label="Forma de pago *"
                            value={convertirForm.formaPago}
                            onChange={e => setConvertirForm(f => ({ ...f, formaPago: e.target.value as FormaPagoVenta }))}
                        >
                            {FORMA_PAGO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                        <Select
                            dense
                            label="Moneda *"
                            value={convertirForm.moneda}
                            onChange={e => setConvertirForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}
                        >
                            <option value="ARS">Pesos ($)</option>
                            <option value="USD">Dólares (US$)</option>
                        </Select>
                    </div>
                    <Input
                        dense
                        label="Fecha de venta *"
                        type="date"
                        value={convertirForm.fechaVenta}
                        onChange={e => setConvertirForm(f => ({ ...f, fechaVenta: e.target.value }))}
                    />
                    <Textarea
                        dense
                        label="Observaciones"
                        rows={3}
                        value={convertirForm.observaciones}
                        onChange={e => setConvertirForm(f => ({ ...f, observaciones: e.target.value }))}
                    />
                </div>
            </Modal>

            {/* ELIMINAR */}
            <ConfirmDialog
                isOpen={deleteId !== null}
                title="Eliminar presupuesto"
                message="¿Eliminar este presupuesto? No se puede deshacer."
                confirmLabel="Eliminar"
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeleteId(null)}
            />

        </div>
    );
};

export default PresupuestosPage;
