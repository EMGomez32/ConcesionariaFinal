import { useEffect, useState, useCallback, type MouseEvent } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { financiacionesApi, type CreateFinanciacionDto, type PagarCuotaDto, type SimulacionResult } from '../../api/financiaciones.api';
import { clientesApi } from '../../api/clientes.api';
import { usuariosApi } from '../../api/usuarios.api';
import { ventasApi } from '../../api/ventas.api';
import { reportesApi } from '../../api/reportes.api';
import { useUIStore } from '../../store/uiStore';
import Badge, { type BadgeVariant } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import DataTable, { type Column } from '../../components/ui/DataTable';
import PageTitle from '../../components/ui/PageTitle';
import { useFiltrosUrl } from '../../components/ventas/useFiltrosUrl';
import '../../components/ventas/listados.css';
import type { PaginatedResponse } from '../../types/api.types';
import {
    Plus, Search, Eye, Trash2, RefreshCw, X,
    CreditCard, DollarSign, Calendar,
    AlertCircle, CheckCircle2, Car, TrendingUp, Receipt, Calculator, MessageCircle
} from 'lucide-react';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { usePermisos } from '../../hooks/usePermisos';
import { useConfirm } from '../../hooks/useConfirm';
import { waShareLink } from '../../utils/whatsapp';
import { formatFecha, hoyLocal } from '../../utils/fecha';
import { formatMoneda } from '../../utils/moneda';
import { getApiErrorMessage } from '../../utils/error';

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
    clienteId?: number;
    moneda?: string;
    precioVenta?: number | string;
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
    activa: [{ label: 'Marcar en mora', next: 'en_mora' }, { label: 'Cancelar plan', next: 'cancelada' }],
    en_mora: [{ label: 'Marcar al día', next: 'activa' }, { label: 'Cancelar plan', next: 'cancelada' }],
    refinanciada: [],
    cancelada: [],
};

/** Un contrato se refinancia sólo si está vivo y le queda deuda. */
const puedeRefinanciarse = (estado: string) => estado === 'activa' || estado === 'en_mora';

/** Redondeo a centavos: sumar saldos con decimales dejaba residuos como "$0,0000001". */
const centavos = (n: number) => Math.round(n * 100) / 100;

/** Lo que falta cobrar del plan: saldo de las cuotas no pagadas ni refinanciadas. */
const saldoPorCobrar = (cuotas?: { estado: string; saldoCuota: number | string }[]) =>
    centavos((cuotas ?? [])
        .filter(c => c.estado !== 'pagada' && c.estado !== 'refinanciada')
        .reduce((s, c) => s + (Number(c.saldoCuota) || 0), 0));

const cuotasPagas = (f: { cuotasPlan?: { estado: string }[] }) =>
    (f.cuotasPlan ?? []).filter(c => c.estado === 'pagada').length;

const nroPlan = (id: number) => String(id).padStart(6, '0');

const metodoLabels: Record<string, string> = {
    efectivo: 'Efectivo', transferencia: 'Transferencia',
    tarjeta: 'Tarjeta', cheque: 'Cheque', otro: 'Otro',
};

const today = hoyLocal;
const emptyForm = (): FinForm => ({
    ventaId: 0, clienteId: 0, cobradorId: 0,
    fechaInicio: today(), montoFinanciado: 0, moneda: 'ARS',
    cuotas: 12, diaVencimiento: 10,
    tasaMensual: '', observaciones: '',
});
// Clave de idempotencia con fallback: crypto.randomUUID sólo existe en secure
// context (https/localhost); en un origen HTTP no-localhost sería undefined y
// tiraría al generar la clave. El fallback (timestamp + random) evita romper la
// página en ese caso — la clave sólo tiene que ser única por intento, no segura.
const genIdemKey = (): string =>
    globalThis.crypto?.randomUUID?.() ?? `pago-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// idempotencyKey nuevo por cada intento (cada apertura del modal genera uno): así
// un reenvío del MISMO cobro no duplica el pago, pero abrir el modal de nuevo es
// un cobro nuevo.
const emptyPago = (): PagarCuotaDto => ({ monto: 0, metodo: 'efectivo', referencia: '', fechaPago: today(), idempotencyKey: genIdemKey() });

// ─── Componente principal ─────────────────────────────────────────────────────
const FinanciacionesPage = () => {
    // Catálogos
    const [clientes, setClientes] = useState<ClienteRef[]>([]);
    const [cobradores, setCobradores] = useState<CobradorRef[]>([]);
    const [ventas, setVentas] = useState<VentaRef[]>([]);

    // Filtros, búsqueda y página en la URL (sobreviven a entrar a una ficha y volver).
    const { filtros, q, busqueda, setBusqueda, page, setPage, setFiltro, limpiar, hayFiltros } =
        useFiltrosUrl(['estado'] as const);
    const queryClient = useQueryClient();

    // Modales
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState<FinForm>(emptyForm());
    const [saving, setSaving] = useState(false);

    const [detailId, setDetailId] = useState<number | null>(null);
    const [detail, setDetail] = useState<FinanciacionRow | null>(null);
    const [detailError, setDetailError] = useState(false);
    const [deleteId, setDeleteId] = useState<number | null>(null);

    // Pagar cuota sub-modal
    const [pagarCuota, setPagarCuota] = useState<Cuota | null>(null);
    const [pagoForm, setPagoForm] = useState<PagarCuotaDto>(() => emptyPago());
    const [savingPago, setSavingPago] = useState(false);

    const { addToast } = useUIStore();
    const confirm = useConfirm();
    // Ésta es la pantalla donde vive el cobrador, y hasta ahora le mostraba entera
    // la caja de herramientas del admin. "Anular Contrato" (DELETE /financiaciones/:id)
    // es sólo del admin: era un botón muerto en la pantalla de uso diario de otro rol.
    // Ver hooks/usePermisos.ts.
    const permisos = usePermisos();

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
        } catch (e: unknown) {
            // Sin esto el alta quedaba con los selects vacíos y sin explicación.
            addToast(getErrorMessage(e, 'No se pudieron cargar las ventas, clientes y cobradores para el alta'), 'error');
        }
    }, [addToast]);

    // ── Lista ────────────────────────────────────────────────────────────────
    // Búsqueda y filtros resueltos por el backend (contrato 1).
    const listaQuery = useQuery({
        queryKey: ['financiaciones', 'list', { q, estado: filtros.estado, page }],
        queryFn: async () => {
            const params: Record<string, unknown> = {};
            if (filtros.estado) params.estado = filtros.estado;
            if (q) params.q = q;
            // El interceptor de axios ya devuelve el body: {results, totalPages, ...}.
            return await financiacionesApi.getAll(params, { limit: 15, page }) as unknown as PaginatedResponse<FinanciacionRow>;
        },
        placeholderData: keepPreviousData,
    });
    const financiaciones = listaQuery.data?.results ?? [];
    const recargarLista = () => queryClient.invalidateQueries({ queryKey: ['financiaciones'] });

    // ── Indicadores (del backend, no de la página visible) ───────────────────
    // "Cuotas en mora" usa la MISMA fuente que la alerta del Inicio
    // (/reportes/mora: cuotas vencidas con saldo), así los dos números coinciden.
    // /reportes/mora es admin/vendedor/cobrador.
    const puedeVerMora = permisos.tiene('admin', 'super_admin', 'vendedor', 'cobrador');
    const moraQuery = useQuery({
        queryKey: ['financiaciones', 'mora-resumen'],
        queryFn: () => reportesApi.mora(),
        enabled: puedeVerMora,
        staleTime: 60 * 1000,
    });
    const activasQuery = useQuery({
        queryKey: ['financiaciones', 'conteo', 'activa'],
        queryFn: async () => {
            const res = await financiacionesApi.getAll({ estado: 'activa' }, { page: 1, limit: 1 }) as unknown as PaginatedResponse<unknown>;
            return res?.totalResults ?? 0;
        },
    });

    useEffect(() => { loadCatalogos(); }, [loadCatalogos]);

    // ── Detalle ──────────────────────────────────────────────────────────────
    const openDetail = async (id: number) => {
        setDetailId(id);
        setDetail(null);
        setDetailError(false);
        try {
            const res = await financiacionesApi.getById(id);
            // El interceptor ya devuelve el body: la financiación viene plana.
            setDetail((res as unknown as FinanciacionRow) ?? null);
        } catch {
            setDetailError(true);
        }
    };

    const refreshDetail = async (id: number) => {
        try {
            const res = await financiacionesApi.getById(id);
            setDetail((res as unknown as FinanciacionRow) ?? null);
        } catch {
            addToast('El cambio se guardó, pero no se pudo actualizar el detalle. Cerralo y abrilo de nuevo.', 'info');
        }
    };

    // ── Refinanciación ───────────────────────────────────────────────────────
    const [refiOpen, setRefiOpen] = useState(false);
    const [refiSaving, setRefiSaving] = useState(false);
    const [refiForm, setRefiForm] = useState({
        cuotas: '6',
        tasaMensual: '',
        diaVencimiento: '',
        fechaInicio: hoyLocal(),
    });

    // El saldo se calcula acá sólo para mostrarlo: el backend lo recalcula de las
    // cuotas reales, así que la UI no puede inventar el monto a refinanciar.
    const saldoRefinanciable = saldoPorCobrar(detail?.cuotasPlan);

    const abrirRefinanciar = () => {
        if (!detail) return;
        setRefiForm({
            cuotas: '6',
            tasaMensual: detail.tasaMensual != null ? String(detail.tasaMensual) : '',
            diaVencimiento: String(detail.diaVencimiento ?? ''),
            fechaInicio: hoyLocal(),
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
            addToast(`Plan refinanciado: el saldo pasó al plan N° ${String(nueva.id).padStart(6, '0')}`, 'success');
            setRefiOpen(false);
            await recargarLista();
            // Se abre el contrato nuevo: es donde vive la deuda ahora.
            await openDetail(nueva.id);
        } catch (err: unknown) {
            addToast((err as { message?: string })?.message ?? 'No se pudo refinanciar el plan', 'error');
        } finally {
            setRefiSaving(false);
        }
    };

    // ── Cambio estado ────────────────────────────────────────────────────────
    const handleCambioEstado = async (id: number, estado: string) => {
        try {
            await financiacionesApi.updateEstado(id, estado);
            addToast(`Plan: ${finStatusMap[estado as EstadoFinanciacion]?.label ?? estado}`, 'success');
            recargarLista();
            if (detailId === id) refreshDetail(id);
        } catch (e: unknown) {
            // El interceptor de api/client.ts rechaza con `error.response.data`, o sea
            // el body YA desempaquetado: leer `err.response.data.message` daba siempre
            // undefined, y el motivo real del backend nunca llegaba a la pantalla.
            addToast(getErrorMessage(e, 'No se pudo cambiar el estado del plan'), 'error');
        }
    };

    // Los cambios de estado se confirman: cancelar el plan no tiene vuelta atrás.
    const confirmarCambioEstado = (id: number, t: { label: string; next: EstadoFinanciacion }) => confirm({
        title: t.label,
        message: t.next === 'cancelada'
            ? `El plan N° ${nroPlan(id)} queda cancelado: ya no se puede reactivar ni refinanciar.`
            : t.next === 'en_mora'
                ? `El plan N° ${nroPlan(id)} queda marcado en mora.`
                : `El plan N° ${nroPlan(id)} vuelve a figurar al día.`,
        type: t.next === 'cancelada' ? 'danger' : t.next === 'en_mora' ? 'warning' : 'question',
        confirmLabel: t.label,
        onConfirm: () => handleCambioEstado(id, t.next),
    });

    // Al elegir la venta se precargan su cliente y su moneda.
    const elegirVenta = (ventaId: number) => {
        const v = ventas.find(x => x.id === ventaId);
        setForm(f => ({
            ...f,
            ventaId,
            ...(v?.clienteId ? { clienteId: v.clienteId } : {}),
            ...(v?.moneda === 'ARS' || v?.moneda === 'USD' ? { moneda: v.moneda } : {}),
        }));
    };

    // ── Crear ────────────────────────────────────────────────────────────────
    const handleCreate = async () => {
        if (!form.ventaId || !form.clienteId || !form.montoFinanciado || !form.cuotas || !form.diaVencimiento) {
            addToast('Completá la venta, el cliente, el monto, las cuotas y el día de vencimiento', 'error'); return;
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
            addToast('Plan de financiación creado con sus cuotas', 'success');
            setCreateOpen(false);
            setForm(emptyForm());
            setPage(1);
            recargarLista();
        } catch (e: unknown) {
            // El interceptor de api/client.ts rechaza con `error.response.data`, o sea
            // el body YA desempaquetado: leer `err.response.data.message` daba siempre
            // undefined, y el motivo real del backend nunca llegaba a la pantalla.
            addToast(getErrorMessage(e, 'No se pudo crear el plan'), 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Eliminar ─────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await financiacionesApi.delete(deleteId);
            addToast('Plan de financiación anulado', 'success');
            setDeleteId(null);
            recargarLista();
        } catch (e: unknown) {
            // El interceptor de api/client.ts rechaza con `error.response.data`, o sea
            // el body YA desempaquetado: leer `err.response.data.message` daba siempre
            // undefined, y el motivo real del backend nunca llegaba a la pantalla.
            addToast(getErrorMessage(e, 'No se pudo anular el plan'), 'error');
        }
    };

    // Descarga el recibo de pago de una cuota (PDF), mismo patrón que el
    // comprobante de venta.
    const handleRecibo = async (cuotaId: number) => {
        try {
            const blob = await financiacionesApi.reciboCuotaPdf(cuotaId) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `recibo-cuota-${cuotaId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('No se pudo generar el recibo', 'error');
        }
    };

    // ── Pagar cuota ──────────────────────────────────────────────────────────
    const openPagarCuota = (cuota: Cuota) => {
        setPagarCuota(cuota);
        setPagoForm({ ...emptyPago(), monto: Number(cuota.saldoCuota) });
    };

    const handlePagarCuota = async (e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (!pagarCuota) return;
        if (pagoForm.monto <= 0) { addToast('El monto cobrado tiene que ser mayor a 0', 'error'); return; }
        // El cobro es por cuota: no se puede acreditar más que su saldo (evita
        // registrar una sobre-recaudación; el backend además tope el saldo en 0).
        if (pagoForm.monto > Number(pagarCuota.saldoCuota)) {
            addToast('El monto no puede superar el saldo de la cuota', 'error');
            return;
        }
        const finId = detailId;
        setSavingPago(true);
        try {
            await financiacionesApi.pagarCuota(pagarCuota.id, pagoForm);
            addToast('Cobro registrado', 'success');
            setPagarCuota(null);
            // Refresca el detalle abierto (cuotas y saldos) y el listado (saldo,
            // estado y mora de la fila) para que el cobro se vea reflejado.
            if (finId !== null) await refreshDetail(Number(finId));
            await recargarLista();
        } catch (err: unknown) {
            addToast(getApiErrorMessage(err, 'No se pudo registrar el cobro'), 'error');
        } finally {
            setSavingPago(false);
        }
    };

    // ── Helpers ──────────────────────────────────────────────────────────────
    // Estimación sin interés, redondeada a centavos (la cuota real la calcula el
    // backend; con tasa, usá el simulador).
    const calcMontoCuota = () => {
        if (!form.montoFinanciado || !form.cuotas) return 0;
        return Math.round((form.montoFinanciado / form.cuotas) * 100) / 100;
    };

    // ── Simulador de cuotas (no persiste; misma amortización que el alta real) ──
    const [simOpen, setSimOpen] = useState(false);
    const [simForm, setSimForm] = useState({ montoFinanciado: 0, moneda: 'ARS' as 'ARS' | 'USD', cuotas: 12, tasaMensual: '', fechaInicio: '', diaVencimiento: 10 });
    const [simResult, setSimResult] = useState<SimulacionResult | null>(null);
    const [simLoading, setSimLoading] = useState(false);
    const [simError, setSimError] = useState('');
    const openSimulador = () => {
        setSimForm({ montoFinanciado: 0, moneda: 'ARS', cuotas: 12, tasaMensual: '', fechaInicio: '', diaVencimiento: 10 });
        setSimResult(null);
        setSimError('');
        setSimOpen(true);
    };
    const handleSimular = async () => {
        if (!simForm.montoFinanciado || simForm.montoFinanciado <= 0) { setSimError('Ingresá un monto a financiar mayor a 0.'); return; }
        if (!simForm.cuotas) { setSimError('Elegí la cantidad de cuotas.'); return; }
        setSimError('');
        setSimLoading(true);
        try {
            const res = await financiacionesApi.simular({
                montoFinanciado: simForm.montoFinanciado,
                cuotas: simForm.cuotas,
                tasaMensual: simForm.tasaMensual ? parseFloat(simForm.tasaMensual) : undefined,
                moneda: simForm.moneda,
                fechaInicio: simForm.fechaInicio || undefined,
                diaVencimiento: simForm.diaVencimiento,
            }) as unknown as SimulacionResult;
            setSimResult(res);
        } catch (e) {
            setSimError((e as { message?: string })?.message ?? 'No se pudo calcular la simulación.');
        } finally {
            setSimLoading(false);
        }
    };
    // Formatea con la moneda del resultado (o del form mientras no hay resultado).
    const simFmt = (n: number) =>
        formatMoneda(n, simResult?.resumen.moneda ?? simForm.moneda);

    // Comparte la simulación por WhatsApp SIN destinatario: abre el borrador y el
    // vendedor elige el contacto (no se envía nada solo, patrón waShareLink).
    const handleCompartirSim = () => {
        if (!simResult) return;
        const r = simResult.resumen;
        const lineas = [
            'Te comparto la simulación de tu plan de financiación:',
            `Monto a financiar: ${simFmt(r.montoFinanciado)}`,
            `${r.cuotas} ${r.cuotas === 1 ? 'cuota' : 'cuotas'} de ${simFmt(r.valorCuota)}`,
            r.tasaMensual > 0 ? `Interés: ${r.tasaMensual}% mensual` : 'Sin interés',
            `Total a pagar: ${simFmt(r.totalAPagar)}`,
            // formatFecha (no toLocaleDateString): el vencimiento es medianoche UTC
            // y en UTC-3 se mostraría el día ANTERIOR en un texto que va al cliente.
            simResult.cuotas[0] ? `Primera cuota: ${formatFecha(simResult.cuotas[0].vencimiento)}` : '',
            'Es una simulación informativa. Escribime para avanzar. ¡Gracias!',
        ].filter(Boolean);
        window.open(waShareLink(lineas.join('\n')), '_blank', 'noopener');
    };

    // Pasa los valores simulados al alta real: abre "Instrumentar Nuevo Plan" con
    // monto/moneda/cuotas/tasa/fecha/día precargados (queda elegir venta y cliente).
    const handleUsarEnPlan = () => {
        if (!simResult) return;
        const r = simResult.resumen;
        setForm({
            ...emptyForm(),
            montoFinanciado: r.montoFinanciado,
            moneda: r.moneda === 'USD' ? 'USD' : 'ARS',
            cuotas: r.cuotas,
            diaVencimiento: r.diaVencimiento,
            fechaInicio: r.fechaInicio,
            tasaMensual: r.tasaMensual ? String(r.tasaMensual) : '',
        });
        setSimOpen(false);
        setCreateOpen(true);
    };

    const columns: Column<FinanciacionRow>[] = [
        {
            header: 'Plan',
            accessor: (f) => <span className="font-mono text-xs font-bold">N° {nroPlan(f.id)}</span>,
        },
        {
            // Cliente y cobrador juntos: a 1280 px la tabla entra sin scroll horizontal.
            header: 'Cliente',
            accessor: (f) => (
                <div className="flex flex-col" style={{ minWidth: 0, maxWidth: 145 }}>
                    <span className="font-bold text-sm truncate" title={f.cliente?.nombre}>{f.cliente?.nombre ?? `Cliente #${f.clienteId}`}</span>
                    <span className="text-xs text-muted truncate">Cobrador: {f.cobrador?.nombre || 'sin asignar'}</span>
                </div>
            ),
        },
        {
            header: 'Unidad',
            accessor: (f) => (
                <div className="flex flex-col">
                    <span className="text-sm">{f.venta?.vehiculo ? `${f.venta.vehiculo.marca} ${f.venta.vehiculo.modelo}` : `Venta N° ${f.ventaId}`}</span>
                    <span className="text-xs text-muted">{f.venta?.vehiculo?.dominio || 'Sin dominio'}</span>
                </div>
            ),
        },
        {
            header: 'Monto financiado',
            align: 'right',
            accessor: (f) => <span className="font-bold tabular-nums" style={{ whiteSpace: 'nowrap' }}>{formatMoneda(f.montoFinanciado, f.moneda)}</span>,
        },
        {
            header: 'Cuotas pagas',
            accessor: (f) => {
                const pagas = cuotasPagas(f);
                const pct = f.cuotas ? Math.round((pagas / f.cuotas) * 100) : 0;
                return (
                    <div className="flex flex-col gap-1" style={{ minWidth: 90 }}>
                        <span className="text-xs tabular-nums">{pagas} de {f.cuotas} · {pct}%</span>
                        <div className="fin-progreso" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pagas} de ${f.cuotas} cuotas pagas`}>
                            <div style={{ width: `${pct}%` }} />
                        </div>
                    </div>
                );
            },
        },
        {
            header: 'Estado',
            accessor: (f) => (
                <Badge variant={finStatusMap[f.estado as EstadoFinanciacion]?.variant ?? 'default'}>
                    {finStatusMap[f.estado as EstadoFinanciacion]?.label ?? f.estado}
                </Badge>
            ),
        },
        {
            header: 'Acciones',
            align: 'right',
            accessor: (f) => (
                <div className="flex justify-end gap-1">
                    <button type="button" className="icon-btn" title="Ver plan y cuotas" aria-label={`Ver el plan ${nroPlan(f.id)}`} onClick={e => { e.stopPropagation(); openDetail(f.id); }}><Eye size={16} /></button>
                    {permisos.financiacionAnular && (
                        <button type="button" className="icon-btn danger" onClick={e => { e.stopPropagation(); setDeleteId(f.id); }} title="Anular plan" aria-label={`Anular el plan ${nroPlan(f.id)}`}><Trash2 size={16} /></button>
                    )}
                </div>
            ),
        },
    ];

    const moraResumen = moraQuery.data?.resumen;
    const moraPorMoneda = (moraResumen?.porMoneda ?? []).filter(m => Number(m.saldo ?? 0) !== 0);

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Financiación" />
            {/* Header */}
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary">
                            <CreditCard size={20} />
                        </div>
                        <h1>Financiación</h1>
                    </div>
                    <p>Planes de financiación propia, sus cuotas y los cobros.</p>
                </div>
                <div className="header-actions">
                    <Button variant="secondary" onClick={() => recargarLista()} aria-label="Actualizar listado" title="Actualizar listado">
                        <RefreshCw size={18} className={listaQuery.isFetching ? 'animate-spin' : ''} />
                    </Button>
                    <Button data-tour="fin-simular" variant="secondary" onClick={openSimulador} title="Calcular un plan de cuotas para mostrarle al cliente (no crea nada)">
                        <Calculator size={18} /> Simular cuotas
                    </Button>
                    {permisos.financiacionOperar && (
                        <Button data-tour="fin-nuevo" variant="primary" onClick={() => { setForm(emptyForm()); setCreateOpen(true); }}>
                            <Plus size={18} /> Nuevo plan
                        </Button>
                    )}
                </div>
            </header>

            {/* Indicadores: del backend, no de la página visible */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-tour="fin-kpis">
                <div className="card glass stat-tile">
                    <div>
                        <span className="stat-tile-label">Planes activos</span>
                        <div className="text-3xl font-black tabular-nums">
                            {activasQuery.isError ? '—' : activasQuery.isLoading ? '…' : activasQuery.data}
                        </div>
                        <span className="text-xs text-muted">Con cuotas por cobrar</span>
                    </div>
                    <TrendingUp size={60} className="stat-tile-bg" />
                </div>
                {puedeVerMora && (
                    <>
                        <div className="card glass stat-tile">
                            <div>
                                <span className="stat-tile-label" style={{ color: 'var(--danger)' }}>Cuotas en mora</span>
                                <div className="text-3xl font-black tabular-nums">
                                    {moraQuery.isError ? '—' : moraQuery.isLoading ? '…' : moraResumen?.cuotasVencidas ?? 0}
                                </div>
                                <span className="text-xs text-muted">
                                    {moraQuery.isError
                                        ? 'No se pudo calcular'
                                        : `Cuotas vencidas sin pagar · ${moraResumen?.clientes ?? 0} ${moraResumen?.clientes === 1 ? 'cliente' : 'clientes'}`}
                                </span>
                            </div>
                            <AlertCircle size={60} className="stat-tile-bg" />
                        </div>
                        <div className="card glass stat-tile">
                            <div>
                                <span className="stat-tile-label">Saldo vencido</span>
                                {moraQuery.isError ? (
                                    <div className="text-3xl font-black">—</div>
                                ) : moraPorMoneda.length === 0 ? (
                                    <div className="text-3xl font-black tabular-nums">{moraQuery.isLoading ? '…' : formatMoneda(0, 'ARS')}</div>
                                ) : moraPorMoneda.map(m => (
                                    <div key={m.moneda} className="text-2xl font-black tabular-nums">{formatMoneda(Number(m.saldo ?? 0), m.moneda)}</div>
                                ))}
                                <span className="text-xs text-muted">Lo que suman esas cuotas vencidas</span>
                            </div>
                            <DollarSign size={60} className="stat-tile-bg" />
                        </div>
                    </>
                )}
            </div>

            {/* Filtros */}
            <div className="filters-bar filtros-comerciales">
                <div className="search-box">
                    <Search size={18} className="text-muted" aria-hidden="true" />
                    <input
                        type="search"
                        placeholder="Buscar por cliente, DNI, dominio, marca, modelo o N° de plan"
                        aria-label="Buscar planes de financiación"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                    />
                </div>
                <select aria-label="Filtrar por estado" value={filtros.estado} onChange={e => setFiltro('estado', e.target.value)}>
                    <option value="">Estado: todos</option>
                    {Object.entries(finStatusMap).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                    ))}
                </select>
                {hayFiltros && (
                    <Button variant="ghost" size="sm" onClick={limpiar}>
                        <X size={16} /> Limpiar filtros
                    </Button>
                )}
            </div>

            {/* Listado */}
            <div data-tour="fin-tabla" className="listado-compacto">
                <DataTable
                    columns={columns}
                    data={financiaciones}
                    isLoading={listaQuery.isLoading}
                    isError={listaQuery.isError}
                    errorMessage="No se pudieron cargar los planes de financiación"
                    onRetry={() => listaQuery.refetch()}
                    onRowClick={(f) => openDetail(f.id)}
                    currentPage={page}
                    totalPages={listaQuery.data?.totalPages ?? 1}
                    onPageChange={setPage}
                    emptyMessage={hayFiltros
                        ? 'Ningún plan coincide con la búsqueda o los filtros'
                        : 'Todavía no hay planes de financiación. Creá el primero con «Nuevo plan».'}
                    emptyIcon={<CreditCard size={40} className="dt-empty-icon" />}
                    onClearFilters={hayFiltros ? limpiar : undefined}
                />
            </div>

            {/* ALTA DE PLAN */}
            <Modal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Nuevo plan de financiación"
                subtitle="Elegí la venta y las condiciones. Los campos con * son obligatorios."
                maxWidth="820px"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleCreate} loading={saving}>
                            Crear plan
                        </Button>
                    </>
                )}
            >
                <div>
                    <Select
                        dense
                        label="Venta *"
                        containerClassName="col-span-2"
                        placeholder="Elegí la venta que se financia"
                        value={form.ventaId || ''}
                        onChange={e => elegirVenta(+e.target.value)}
                    >
                        {ventas.map(v => (
                            <option key={v.id} value={v.id}>
                                {`N° ${String(v.id).padStart(6, '0')} — ${v.cliente?.nombre ?? 'Sin cliente'} — ${v.vehiculo?.marca ?? ''} ${v.vehiculo?.modelo ?? ''}`}
                            </option>
                        ))}
                    </Select>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select
                            dense
                            label="Cliente *"
                            placeholder="Elegí el cliente"
                            value={form.clienteId || ''}
                            onChange={e => setForm(f => ({ ...f, clienteId: +e.target.value }))}
                        >
                            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </Select>
                        <Select
                            dense
                            label="Cobrador"
                            placeholder="Sin asignar"
                            value={form.cobradorId || ''}
                            onChange={e => setForm(f => ({ ...f, cobradorId: +e.target.value }))}
                        >
                            {cobradores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                        </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Input
                            dense
                            label="Monto a financiar *"
                            icon={<DollarSign size={16} className="text-accent" />}
                            type="number"
                            className="font-bold"
                            value={form.montoFinanciado || ''}
                            onChange={e => setForm(f => ({ ...f, montoFinanciado: +e.target.value }))}
                            placeholder="0"
                            hint={form.montoFinanciado > 0 ? formatMoneda(form.montoFinanciado, form.moneda) : undefined}
                        />
                        <Select
                            dense
                            label="Moneda"
                            value={form.moneda}
                            onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}
                        >
                            <option value="ARS">Pesos (ARS)</option>
                            <option value="USD">Dólares (USD)</option>
                        </Select>
                        <Select
                            dense
                            label="Cuotas *"
                            value={form.cuotas}
                            onChange={e => setForm(f => ({ ...f, cuotas: +e.target.value }))}
                        >
                            {[1, 3, 6, 12, 18, 24, 36, 48, 60].map(n => <option key={n} value={n}>{n} {n === 1 ? 'cuota' : 'cuotas'} mensuales</option>)}
                        </Select>
                        <Input
                            dense
                            label="Interés mensual (%)"
                            icon={<TrendingUp size={16} className="text-info" />}
                            type="number"
                            step="0.1"
                            value={form.tasaMensual}
                            onChange={e => setForm(f => ({ ...f, tasaMensual: e.target.value }))}
                            placeholder="0 = sin interés"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            dense
                            label="Fecha de inicio *"
                            type="date"
                            value={form.fechaInicio}
                            onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))}
                        />
                        <Select
                            dense
                            label="Día de vencimiento *"
                            value={form.diaVencimiento}
                            onChange={e => setForm(f => ({ ...f, diaVencimiento: +e.target.value }))}
                        >
                            {[...Array(28)].map((_, i) => <option key={i + 1} value={i + 1}>Día {i + 1} de cada mes</option>)}
                        </Select>
                    </div>

                    <Textarea
                        dense
                        label="Observaciones"
                        rows={2}
                        value={form.observaciones}
                        onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                        placeholder="Garantías o acuerdos especiales con el cliente…"
                        style={{ resize: 'none' }}
                    />

                    {form.montoFinanciado > 0 && (
                        <div className="flex justify-between items-center card" style={{ padding: 'var(--space-4)' }}>
                            <div>
                                <p className="stat-tile-label">Cuota estimada {form.tasaMensual ? '(sin contar el interés)' : ''}</p>
                                <p className="text-2xl font-black tabular-nums">{formatMoneda(calcMontoCuota(), form.moneda)}</p>
                                <p className="text-xs text-muted">{form.cuotas} {form.cuotas === 1 ? 'cuota' : 'cuotas'}. El valor exacto lo calcula el sistema al crear el plan.</p>
                            </div>
                            <div className="text-right">
                                <p className="stat-tile-label">Monto financiado</p>
                                <p className="text-xl font-bold tabular-nums">{formatMoneda(form.montoFinanciado, form.moneda)}</p>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* MODAL SIMULADOR DE CUOTAS (no persiste nada) */}
            <Modal
                isOpen={simOpen}
                onClose={() => setSimOpen(false)}
                title="Simulador de cuotas"
                subtitle="Calculá el plan para mostrarle al cliente. No crea ninguna financiación."
                maxWidth="820px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setSimOpen(false)}>Cerrar</Button>
                        <Button variant="primary" onClick={handleSimular} loading={simLoading}>
                            <Calculator size={16} /> Calcular plan
                        </Button>
                    </>
                }
            >
                <div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                            dense
                            label="Monto a financiar *"
                            icon={<DollarSign size={16} className="text-accent" />}
                            type="number"
                            className="font-bold"
                            value={simForm.montoFinanciado || ''}
                            onChange={e => setSimForm(f => ({ ...f, montoFinanciado: +e.target.value }))}
                            placeholder="0"
                        />
                        <Select
                            dense
                            label="Moneda"
                            value={simForm.moneda}
                            onChange={e => setSimForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}
                        >
                            <option value="ARS">Pesos (ARS)</option>
                            <option value="USD">Dólares (USD)</option>
                        </Select>
                        <Select
                            dense
                            label="Cantidad de cuotas *"
                            value={simForm.cuotas}
                            onChange={e => setSimForm(f => ({ ...f, cuotas: +e.target.value }))}
                        >
                            {[1, 3, 6, 12, 18, 24, 36, 48, 60].map(n => <option key={n} value={n}>{n} cuotas</option>)}
                        </Select>
                        <Input
                            dense
                            label="Interés mensual (%)"
                            icon={<TrendingUp size={16} className="text-info" />}
                            type="number"
                            step="0.1"
                            min="0"
                            value={simForm.tasaMensual}
                            onChange={e => setSimForm(f => ({ ...f, tasaMensual: e.target.value }))}
                            placeholder="0.0 (sin interés)"
                        />
                        <Input
                            dense
                            label="Fecha de inicio"
                            type="date"
                            value={simForm.fechaInicio}
                            onChange={e => setSimForm(f => ({ ...f, fechaInicio: e.target.value }))}
                        />
                        <Select
                            dense
                            label="Día de cobro"
                            value={simForm.diaVencimiento}
                            onChange={e => setSimForm(f => ({ ...f, diaVencimiento: +e.target.value }))}
                        >
                            {[...Array(28)].map((_, i) => <option key={i + 1} value={i + 1}>Día {i + 1}</option>)}
                        </Select>
                    </div>

                    {simError && (
                        <div className="uploader-alert uploader-alert-error">
                            <AlertCircle size={14} />
                            <span>{simError}</span>
                        </div>
                    )}

                    {simResult && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <p className="stat-tile-label">Valor de cuota</p>
                                    <p className="text-2xl font-black">{simFmt(simResult.resumen.valorCuota)}</p>
                                    <p className="text-xs text-muted">{simResult.resumen.cuotas} cuotas mensuales</p>
                                </div>
                                <div>
                                    <p className="stat-tile-label">Total a pagar</p>
                                    <p className="text-2xl font-black">{simFmt(simResult.resumen.totalAPagar)}</p>
                                    <p className="text-xs text-muted">sobre {simFmt(simResult.resumen.montoFinanciado)} financiados</p>
                                </div>
                                <div>
                                    <p className="stat-tile-label">Interés total</p>
                                    <p className="text-2xl font-black">{simFmt(simResult.resumen.costoFinanciero)}</p>
                                    <p className="text-xs text-muted">interés total ({simResult.resumen.tasaMensual}% mensual)</p>
                                </div>
                            </div>

                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Cuota</th>
                                            <th>Vencimiento</th>
                                            <th style={{ textAlign: 'right' }}>Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {simResult.cuotas.map(c => (
                                            <tr key={c.nroCuota}>
                                                <td className="font-bold tabular-nums">{c.nroCuota}</td>
                                                <td className="text-xs text-muted tabular-nums">{formatFecha(c.vencimiento)}</td>
                                                <td className="font-bold tabular-nums" style={{ textAlign: 'right' }}>{simFmt(c.montoCuota)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex gap-3 justify-end flex-wrap">
                                <Button variant="secondary" onClick={handleCompartirSim} title="Abre WhatsApp con el resumen del plan (elegís el contacto; no se envía solo)">
                                    <MessageCircle size={16} /> Compartir por WhatsApp
                                </Button>
                                <Button variant="secondary" onClick={handleUsarEnPlan} title="Pasa estos valores al alta de un plan real (queda elegir venta y cliente)">
                                    <Plus size={16} /> Usar en nuevo plan
                                </Button>
                            </div>
                            <p className="text-xs text-muted text-center">
                                Simulación informativa. Los montos coinciden con los de una financiación real; las fechas usan el inicio y el día de cobro elegidos.
                            </p>
                        </>
                    )}
                </div>
            </Modal>

            {/* DETALLE DEL PLAN */}
            <Modal
                isOpen={detailId !== null}
                onClose={() => { setDetailId(null); setDetail(null); }}
                title={detailId !== null ? `Plan N° ${nroPlan(detailId)}${detail?.cliente?.nombre ? ` · ${detail.cliente.nombre}` : ''}` : 'Plan de financiación'}
                subtitle={detail?.venta?.vehiculo
                    ? `${detail.venta.vehiculo.marca} ${detail.venta.vehiculo.modelo} · ${detail.venta.vehiculo.dominio || 'sin dominio'}`
                    : detail ? `Venta N° ${detail.ventaId}` : undefined}
                maxWidth="900px"
                footer={detail ? (
                    <Button variant="secondary" onClick={() => { setDetailId(null); setDetail(null); }}>Cerrar</Button>
                ) : undefined}
            >
                {detailError ? (
                    <div className="dt-empty">
                        <p className="dt-empty-text">No se pudo cargar el plan.</p>
                        <Button variant="secondary" size="sm" onClick={() => detailId !== null && openDetail(detailId)}>Reintentar</Button>
                    </div>
                ) : !detail ? (
                    <div className="text-center"><RefreshCw className="animate-spin text-accent mb-4" size={40} aria-hidden="true" /><p className="text-sm text-muted">Cargando el plan…</p></div>
                ) : (
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <Badge variant={finStatusMap[detail.estado as EstadoFinanciacion]?.variant ?? 'default'}>
                                {finStatusMap[detail.estado as EstadoFinanciacion]?.label ?? detail.estado}
                            </Badge>
                            <p className="text-sm font-bold flex items-center gap-2">
                                <Car size={16} aria-hidden="true" />
                                {detail.venta?.vehiculo ? `${detail.venta.vehiculo.marca} ${detail.venta.vehiculo.modelo} · ${detail.venta.vehiculo.dominio || 'sin dominio'}` : `Venta N° ${detail.ventaId}`}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                            <div>
                                <span className="stat-tile-label">Saldo por cobrar</span>
                                {/* Suma de las cuotas no pagadas ni refinanciadas, redondeada a
                                    centavos: sin esto aparecían residuos como "$0,0000001". */}
                                <p className="text-2xl font-black tabular-nums">{formatMoneda(saldoPorCobrar(detail.cuotasPlan), detail.moneda)}</p>
                            </div>
                            <div>
                                <span className="stat-tile-label">Cuotas pagas</span>
                                <p className="text-2xl font-black tabular-nums">{cuotasPagas(detail)} de {detail.cuotas}</p>
                            </div>
                            {/* El modelo Cuota tiene montoCuota y saldoCuota: no existen
                                montoCapital ni montoInteres. */}
                            <div>
                                <span className="stat-tile-label">Total del plan</span>
                                <p className="text-2xl font-black tabular-nums">{formatMoneda(centavos((detail.cuotasPlan ?? []).reduce((s: number, c: Cuota) => s + (Number(c.montoCuota) || 0), 0)), detail.moneda)}</p>
                                <p className="text-xs text-muted">Suma de todas las cuotas, con interés</p>
                            </div>
                            <div>
                                <span className="stat-tile-label">Monto financiado</span>
                                <p className="text-lg font-bold tabular-nums">{formatMoneda(detail.montoFinanciado, detail.moneda)}</p>
                            </div>
                            <div>
                                <span className="stat-tile-label">Valor de cuota</span>
                                {/* Se lee de la primera cuota real en vez de recalcular monto/N. */}
                                <p className="text-lg font-bold tabular-nums">{formatMoneda((detail.cuotasPlan ?? [])[0]?.montoCuota ?? 0, detail.moneda)}</p>
                            </div>
                            <div>
                                <span className="stat-tile-label">Vencimiento</span>
                                <p className="text-lg font-bold">Día {detail.diaVencimiento} de cada mes</p>
                            </div>
                        </div>

                        {/* Contrato ya refinanciado: su deuda vive en otro contrato.
                            La leyenda evita que se lea como "perdonado" o "cobrado". */}
                        {detail.estado === 'refinanciada' && detail.refinanciadaPor && (
                            <div className="card glass" style={{ borderColor: 'var(--accent)' }}>
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <h4 className="text-sm font-bold">Plan refinanciado</h4>
                                        <p className="text-xs text-muted">
                                            Su saldo pasó al plan N° {nroPlan(detail.refinanciadaPor.id)} por{' '}
                                            {formatMoneda(detail.refinanciadaPor.montoFinanciado, detail.refinanciadaPor.moneda)}
                                            {detail.refinanciadaPor.cuotas ? ` en ${detail.refinanciadaPor.cuotas} cuotas` : ''}. En este plan no queda nada por cobrar.
                                        </p>
                                    </div>
                                    <Button variant="primary" size="sm" onClick={() => openDetail(detail.refinanciadaPor!.id)}>
                                        Ver el plan nuevo
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Contrato que nació de refinanciar a otro: link hacia atrás. */}
                        {detail.refinanciaA && (
                            <div className="card glass">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <h4 className="text-sm font-bold">Origen</h4>
                                        <p className="text-xs text-muted">
                                            Refinancia el saldo del plan N° {nroPlan(detail.refinanciaA.id)}.
                                        </p>
                                    </div>
                                    <Button variant="secondary" size="sm" onClick={() => openDetail(detail.refinanciaA!.id)}>
                                        Ver el plan original
                                    </Button>
                                </div>
                            </div>
                        )}

                        {permisos.financiacionOperar && (finTransitions[detail.estado as EstadoFinanciacion]?.length > 0 || puedeRefinanciarse(detail.estado)) && (
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold mb-1">Estado del plan</h4>
                                    <p className="text-xs text-muted">Refinanciá el saldo o cambiá el estado del plan.</p>
                                </div>
                                <div className="flex gap-3">
                                    {puedeRefinanciarse(detail.estado) && saldoRefinanciable > 0 && (
                                        <Button variant="primary" size="sm" onClick={abrirRefinanciar}>
                                            Refinanciar
                                        </Button>
                                    )}
                                    {finTransitions[detail.estado as EstadoFinanciacion].map(t => (
                                        <Button
                                            key={t.next}
                                            variant={t.next === 'cancelada' ? 'secondary' : t.next === 'en_mora' ? 'danger' : 'primary'}
                                            size="sm"
                                            onClick={() => confirmarCambioEstado(detail.id, t)}
                                        >
                                            {t.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-4">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <Calendar size={18} aria-hidden="true" /> Cuotas
                            </h3>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Cuota</th>
                                            <th>Vencimiento</th>
                                            <th style={{ textAlign: 'right' }}>Monto</th>
                                            <th style={{ textAlign: 'right' }}>Saldo</th>
                                            <th>Estado</th>
                                            <th style={{ textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.cuotasPlan?.map((c: Cuota) => (
                                            <tr key={c.id}>
                                                <td className="font-bold tabular-nums">{c.nroCuota}</td>
                                                <td className="text-xs text-muted tabular-nums">{formatFecha(c.vencimiento)}</td>
                                                <td className="tabular-nums" style={{ textAlign: 'right' }}>{formatMoneda(c.montoCuota, detail.moneda)}</td>
                                                <td className="font-bold tabular-nums" style={{ textAlign: 'right' }}>{formatMoneda(c.saldoCuota, detail.moneda)}</td>
                                                <td>
                                                    <Badge variant={cuotaStatusMap[c.estado as EstadoCuota]?.variant ?? 'default'}>
                                                        {cuotaStatusMap[c.estado as EstadoCuota]?.label ?? c.estado}
                                                    </Badge>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div className="flex items-center gap-2 justify-end">
                                                        {permisos.financiacionCobrarCuota && (c.estado === 'pendiente' || c.estado === 'parcial' || c.estado === 'vencida') && (
                                                            <Button variant="primary" size="sm" onClick={() => openPagarCuota(c)}>
                                                                Registrar cobro
                                                            </Button>
                                                        )}
                                                        {(c.estado === 'pagada' || c.estado === 'parcial') && (
                                                            <button type="button" className="icon-btn" title="Descargar recibo del cobro" aria-label={`Descargar recibo de la cuota ${c.nroCuota}`} onClick={() => handleRecibo(c.id)}>
                                                                <Receipt size={16} />
                                                            </button>
                                                        )}
                                                        {c.estado === 'pagada' && <CheckCircle2 size={20} className="text-success" aria-label="Cuota pagada" />}
                                                    </div>
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

            {/* REGISTRAR COBRO DE CUOTA */}
            <Modal
                isOpen={!!pagarCuota}
                onClose={() => setPagarCuota(null)}
                title={pagarCuota ? `Registrar cobro · cuota ${pagarCuota.nroCuota}` : 'Registrar cobro'}
                subtitle="Revisá el monto y el medio de pago antes de guardar."
                maxWidth="520px"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setPagarCuota(null)}>Cancelar</Button>
                        <Button variant="primary" style={{ flex: 1 }} onClick={handlePagarCuota} loading={savingPago}>
                            Registrar cobro
                        </Button>
                    </>
                )}
            >
                {pagarCuota && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <span className="stat-tile-label">Cuota {pagarCuota.nroCuota}</span>
                                <p className="text-sm">Vence el {formatFecha(pagarCuota.vencimiento)}</p>
                            </div>
                            <div className="text-right">
                                <span className="stat-tile-label">Saldo de la cuota</span>
                                <p className="text-2xl font-black">{formatMoneda(pagarCuota.saldoCuota, detail?.moneda)}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                dense
                                label="Monto cobrado *"
                                containerClassName="col-span-2"
                                icon={<DollarSign size={16} className="text-accent" />}
                                type="number"
                                className="font-black text-lg"
                                value={pagoForm.monto || ''}
                                onChange={e => setPagoForm(f => ({ ...f, monto: +e.target.value }))}
                                hint={pagoForm.monto > 0 ? formatMoneda(pagoForm.monto, detail?.moneda) : undefined}
                            />
                            <Select
                                dense
                                label="Medio de pago *"
                                value={pagoForm.metodo}
                                onChange={e => setPagoForm(f => ({ ...f, metodo: e.target.value as PagarCuotaDto['metodo'] }))}
                            >
                                {Object.entries(metodoLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </Select>
                            <Input
                                dense
                                label="Fecha del cobro"
                                type="date"
                                value={pagoForm.fechaPago ?? today()}
                                onChange={e => setPagoForm(f => ({ ...f, fechaPago: e.target.value }))}
                            />
                        </div>
                        <Input
                            dense
                            label="Referencia"
                            type="text"
                            value={pagoForm.referencia ?? ''}
                            onChange={e => setPagoForm(f => ({ ...f, referencia: e.target.value }))}
                            placeholder="N° de recibo o de transferencia"
                        />
                    </div>
                )}
            </Modal>

            {/* REFINANCIAR */}
            <Modal
                isOpen={refiOpen}
                onClose={() => setRefiOpen(false)}
                title="Refinanciar plan"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setRefiOpen(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleRefinanciar} loading={refiSaving}>
                            Refinanciar
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <div className="card glass">
                        <span className="stat-tile-label">Saldo a refinanciar</span>
                        <div className="text-3xl font-black tabular-nums">{formatMoneda(saldoRefinanciable, detail?.moneda)}</div>
                        <p className="text-xs text-muted" style={{ marginTop: '0.5rem' }}>
                            Es lo que falta cobrar del plan N° {nroPlan(detail?.id ?? 0)}. Ese plan queda cerrado como
                            refinanciado y el saldo pasa a un plan nuevo.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            dense
                            label="Cantidad de cuotas *"
                            type="number"
                            min="1"
                            value={refiForm.cuotas}
                            onChange={e => setRefiForm(f => ({ ...f, cuotas: e.target.value }))}
                        />
                        <Input
                            dense
                            label="Tasa mensual (%)"
                            type="number"
                            min="0"
                            step="0.01"
                            value={refiForm.tasaMensual}
                            onChange={e => setRefiForm(f => ({ ...f, tasaMensual: e.target.value }))}
                            placeholder="Vacío: sin interés"
                        />
                        <Input
                            dense
                            label="Día de vencimiento"
                            type="number"
                            min="1"
                            max="31"
                            value={refiForm.diaVencimiento}
                            onChange={e => setRefiForm(f => ({ ...f, diaVencimiento: e.target.value }))}
                        />
                        <Input
                            dense
                            label="Fecha de inicio"
                            type="date"
                            value={refiForm.fechaInicio}
                            onChange={e => setRefiForm(f => ({ ...f, fechaInicio: e.target.value }))}
                        />
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
                title="Anular plan de financiación"
                message={`¿Anular el plan N° ${nroPlan(deleteId ?? 0)}? Deja de figurar en la cartera y sus cuotas ya no se cobran. No se puede deshacer.`}
                confirmLabel="Anular plan"
                cancelLabel="Cancelar"
                onConfirm={handleDelete}
                onCancel={() => setDeleteId(null)}
            />

            <style>{`
                .fin-progreso { height: 4px; border-radius: var(--radius-pill); background: var(--bg-secondary); overflow: hidden; }
                .fin-progreso > div { height: 100%; background: var(--accent); }
            `}</style>
        </div >
    );
};

export default FinanciacionesPage;
