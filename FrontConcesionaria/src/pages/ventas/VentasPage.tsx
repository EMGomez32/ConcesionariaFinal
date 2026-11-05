import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CreateVentaDto } from '../../api/ventas.api';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useConfirm } from '../../hooks/useConfirm';
import { useVentas, useVenta, useVentasConteo, useCreateVenta, useDeleteVenta, useChangeEstadoEntrega, useAnularOperacionVenta } from '../../hooks/useVentas';
import { useClientes } from '../../hooks/useClientes';
import { useUsuarios } from '../../hooks/useUsuarios';
import { useSucursales } from '../../hooks/useSucursales';
import { useVehiculos } from '../../hooks/useVehiculos';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Combobox from '../../components/ui/Combobox';
import Textarea from '../../components/ui/Textarea';
import DataTable, { type Column } from '../../components/ui/DataTable';
import PageTitle from '../../components/ui/PageTitle';
import MotivoDialog from '../../components/ui/MotivoDialog';
import VentasAnuladasModal from '../../components/ventas/VentasAnuladasModal';
import {
    Plus, Search, Eye, Trash2, X, RefreshCw, DollarSign,
    ArrowRightLeft, User, ShoppingBag, Car, MapPin,
    CheckCircle2, TrendingUp, Printer, Package, FileText, FileDown, Ban
} from 'lucide-react';
import type { FormaPagoVenta, EstadoEntrega, Venta } from '../../types/venta.types';
import VentaSubResources from '../../components/ventas/VentaSubResources';
import VentaFacturaPanel from '../../components/ventas/VentaFacturaPanel';
import { ENTREGA_ESTADO, FORMA_PAGO_LABEL, METODO_PAGO_LABEL, rotuloEstado } from '../../components/ventas/estados';
import { calcularSaldoVenta, imprimirReciboVenta } from '../../components/ventas/reciboVenta';
import { useFiltrosUrl } from '../../components/ventas/useFiltrosUrl';
import '../../components/ventas/listados.css';
import { usePermisos } from '../../hooks/usePermisos';
import { ventasApi } from '../../api/ventas.api';
import { reportesApi } from '../../api/reportes.api';
import { concesionariasApi } from '../../api/concesionarias.api';
import { formatMoneda } from '../../utils/moneda';
import { formatFecha, hoyLocal } from '../../utils/fecha';

// ─── Tipos auxiliares ──────────────────────────────────────────────────────
type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'otro';
interface PagoRow { monto: number; metodo: MetodoPago; referencia: string; observaciones: string }
interface ExtraRow { descripcion: string; monto: number; comprobanteUrl: string }
interface CanjeRow { vehiculoCanjeId: number; valorTomado: number }

interface VentaForm {
    sucursalId: number;
    clienteId: number;
    vendedorId: number;
    vehiculoId: number;
    fechaVenta: string;
    precioVenta: number;
    moneda: 'ARS' | 'USD';
    formaPago: FormaPagoVenta;
    observaciones: string;
    pagos: PagoRow[];
    externos: ExtraRow[];
    canjes: CanjeRow[];
}

/**
 * Transiciones de la entrega. `esAnulacion` separa las dos cosas que este
 * endpoint hace: avanzar la entrega (trabajo diario de vendedor y postventa) y
 * "Anular venta", que manda la venta a `cancelada` — estado TERMINAL, sin vuelta
 * atrás ni para el admin, y que NO devuelve la unidad al stock. El backend acota
 * ese destino a admin dentro del controller. `final` marca los pasos sin vuelta
 * atrás: piden confirmación antes de mandarse.
 */
const entregaTransitions: Record<EstadoEntrega, { label: string; next: EstadoEntrega; esAnulacion?: boolean; final?: boolean }[]> = {
    pendiente: [{ label: 'Bloquear entrega', next: 'bloqueada' }, { label: 'Autorizar entrega', next: 'autorizada' }],
    bloqueada: [{ label: 'Autorizar entrega', next: 'autorizada' }, { label: 'Anular venta', next: 'cancelada', esAnulacion: true, final: true }],
    autorizada: [{ label: 'Marcar como entregada', next: 'entregada', final: true }, { label: 'Anular venta', next: 'cancelada', esAnulacion: true, final: true }],
    entregada: [],
    cancelada: [],
};

/** Usuario actual como vendedor por defecto, si tiene ese rol. */
const vendedorPorDefecto = (): number => {
    const u = useAuthStore.getState().user;
    return u?.roles?.includes('vendedor') ? u.id : 0;
};

const emptyForm = (): VentaForm => ({
    sucursalId: 0, clienteId: 0, vendedorId: vendedorPorDefecto(), vehiculoId: 0,
    fechaVenta: hoyLocal(), precioVenta: 0, moneda: 'ARS',
    formaPago: 'contado', observaciones: '',
    pagos: [], externos: [], canjes: [],
});
const emptyPago = (): PagoRow => ({ monto: 0, metodo: 'efectivo', referencia: '', observaciones: '' });
const emptyCanjeRow = (): CanjeRow => ({ vehiculoCanjeId: 0, valorTomado: 0 });

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Primer y último día del mes en curso (hora local), para "Ventas del mes". */
const rangoMesActual = () => {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = hoy.getMonth();
    const ultimo = new Date(y, m + 1, 0).getDate();
    return {
        desde: `${y}-${pad2(m + 1)}-01`,
        hasta: `${y}-${pad2(m + 1)}-${pad2(ultimo)}`,
        nombre: hoy.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
    };
};

const nroVenta = (id: number) => String(id).padStart(6, '0');

// ─── Componente principal ────────────────────────────────────────────────────
const VentasPage = () => {
    const { addToast } = useUIStore();
    const confirm = useConfirm();

    // Filtros, búsqueda y página en la URL: sobreviven a entrar a una ficha y volver.
    const { filtros, q, busqueda, setBusqueda, page, setPage, setFiltro, limpiar, hayFiltros } =
        useFiltrosUrl(['formaPago', 'estadoEntrega'] as const);

    // Modals & Detail State
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState<VentaForm>(emptyForm());
    const [selectedDetailId, setSelectedDetailId] = useState<number | null>(null);
    /**
     * Anulación en curso (pide motivo). `baja`: DELETE, la unidad vuelve al stock.
     * `entrega`: estado de entrega `cancelada`, terminal y SIN devolver la unidad.
     */
    const [anulacion, setAnulacion] = useState<{ venta: Venta; modo: 'baja' | 'entrega' } | null>(null);
    const [anuladasOpen, setAnuladasOpen] = useState(false);
    // Facturas en curso (por venta): evita doble emisión al doble-clickear.
    const [facturaEnCurso, setFacturaEnCurso] = useState<Set<number>>(new Set());
    const [imprimiendo, setImprimiendo] = useState(false);

    // La búsqueda la resuelve el backend (contrato 1): ya no se filtra la página en memoria.
    const { data: ventasData, isLoading: loadingVentas, isFetching, isError, refetch: refetchVentas } = useVentas(
        {
            q: q || undefined,
            formaPago: filtros.formaPago || undefined,
            estadoEntrega: filtros.estadoEntrega || undefined,
        },
        { page, limit: 15 }
    );

    const { data: detail, isLoading: loadingDetail, isError: detailError, refetch: refetchDetail } = useVenta(selectedDetailId);

    // Cada control de esta pantalla espeja un authorize() del backend. Ver hooks/usePermisos.ts.
    const permisos = usePermisos();
    // /reportes/ventas es admin/vendedor (super_admin pasa siempre).
    const puedeVerReporte = permisos.tiene('admin', 'super_admin', 'vendedor');

    // ── Indicadores: contados por el backend, no sobre la página visible ──
    const mes = useMemo(() => rangoMesActual(), []);
    const ventasMes = useVentasConteo({ fechaDesde: mes.desde, fechaHasta: mes.hasta });
    const pendientes = useVentasConteo({ estadoEntrega: 'pendiente' });
    const bloqueadas = useVentasConteo({ estadoEntrega: 'bloqueada' });
    const autorizadas = useVentasConteo({ estadoEntrega: 'autorizada' });
    const pendientesError = pendientes.isError || bloqueadas.isError || autorizadas.isError;
    const pendientesCargando = pendientes.isLoading || bloqueadas.isLoading || autorizadas.isLoading;
    const pendientesTotal = (pendientes.data ?? 0) + (bloqueadas.data ?? 0) + (autorizadas.data ?? 0);

    // Importe vendido en el mes, por moneda: el mismo cálculo que "Ventas del
    // mes" del Inicio (precio + extras de las ventas con fecha en el mes).
    const reporteMes = useQuery({
        queryKey: ['ventas', 'reporte-mes', mes.desde, mes.hasta],
        queryFn: () => reportesApi.ventas({ desde: mes.desde, hasta: mes.hasta }),
        enabled: puedeVerReporte,
        staleTime: 60 * 1000,
    });
    const vendidoPorMoneda = useMemo(() => (reporteMes.data?.resumen?.porMoneda ?? [])
        .map((m) => ({ moneda: String(m.moneda), total: Number(m.total ?? 0), cantidad: Number(m.cantidad ?? 0) }))
        .filter((m) => m.cantidad > 0)
        .sort((a, b) => (a.moneda === 'ARS' ? -1 : b.moneda === 'ARS' ? 1 : a.moneda.localeCompare(b.moneda))),
    [reporteMes.data]);

    // Catalog Queries
    const { data: clientesData } = useClientes({}, { limit: 1000 });
    const { data: vendedoresData } = useUsuarios({}, { limit: 1000 });
    const { data: sucursalesData } = useSucursales();
    const { data: vehiculosPublicados } = useVehiculos({ estado: 'publicado' }, { limit: 1000 });
    const { data: todosVehiculosData } = useVehiculos({}, { limit: 2000 });

    const clientes = clientesData?.results || [];
    const vendedores = vendedoresData?.results || [];
    const vehiculos = vehiculosPublicados?.results || [];
    const todosVehiculos = todosVehiculosData?.results || [];

    const nombreSucursal = (id?: number) => sucursalesData?.find((s) => s.id === id)?.nombre;
    const descripcionUnidad = (id: number) => {
        const v = todosVehiculos.find((x) => x.id === id);
        return v ? `${v.marca} ${v.modelo}${v.dominio ? ` (${v.dominio})` : ''}` : `Unidad #${id}`;
    };

    // Mutations
    const createMutation = useCreateVenta();
    const changeEstadoEntregaMutation = useChangeEstadoEntrega();
    const deleteMutation = useDeleteVenta();
    const anularOperacionMutation = useAnularOperacionVenta();

    /** Al elegir la unidad se precargan su precio de lista, su moneda y su sucursal. */
    const elegirUnidad = (vehiculoId: number) => {
        const v = vehiculos.find((x) => x.id === vehiculoId);
        setForm((f) => ({
            ...f,
            vehiculoId,
            ...(v && Number(v.precioLista) > 0 ? { precioVenta: Number(v.precioLista) } : {}),
            ...(v?.moneda === 'ARS' || v?.moneda === 'USD' ? { moneda: v.moneda } : {}),
            ...(v?.sucursalId ? { sucursalId: v.sucursalId } : {}),
        }));
    };
    const unidadElegida = vehiculos.find((x) => x.id === form.vehiculoId);

    const handleCreate = async () => {
        if (!form.vehiculoId || !form.clienteId || !form.vendedorId || !form.sucursalId) {
            addToast('Completá la unidad, el cliente, el vendedor y la sucursal', 'error'); return;
        }
        if (form.precioVenta <= 0) {
            addToast('El precio de venta tiene que ser mayor a 0', 'error'); return;
        }

        try {
            const dto: CreateVentaDto = {
                sucursalId: form.sucursalId, clienteId: form.clienteId,
                vendedorId: form.vendedorId, vehiculoId: form.vehiculoId,
                fechaVenta: form.fechaVenta, precioVenta: form.precioVenta,
                moneda: form.moneda, formaPago: form.formaPago,
                observaciones: form.observaciones || undefined,
                pagos: form.pagos.filter(p => p.monto > 0),
                externos: form.externos.filter(e => e.descripcion && e.monto > 0),
                canjes: form.canjes.filter(c => c.vehiculoCanjeId && c.valorTomado > 0),
            };
            await createMutation.mutateAsync(dto);
            addToast('Venta registrada', 'success');
            setCreateOpen(false);
            setForm(emptyForm());
        } catch {
            // El aviso de error lo da el MutationCache global (la mutación no define onError).
        }
    };

    /**
     * Transiciones de entrega que este rol puede disparar de verdad. Avanzar la
     * entrega es de admin/vendedor/postventa; "Anular venta" es sólo del admin
     * (el backend lo chequea por DESTINO, no por ruta: es el mismo PATCH).
     */
    const transicionesVisibles = (detail ? entregaTransitions[detail.estadoEntrega] ?? [] : []).filter(
        (t) => (t.esAnulacion ? permisos.ventasCancelarOperacion : permisos.ventasAvanzarEntrega)
    );

    const handleAddPago = () => setForm(f => ({ ...f, pagos: [...f.pagos, emptyPago()] }));
    const handleAddCanje = () => setForm(f => ({ ...f, canjes: [...f.canjes, emptyCanjeRow()] }));

    const updPago = (i: number, cambios: Partial<PagoRow>) =>
        setForm(f => ({ ...f, pagos: f.pagos.map((p, j) => (j === i ? { ...p, ...cambios } : p)) }));
    const updCanje = (i: number, cambios: Partial<CanjeRow>) =>
        setForm(f => ({ ...f, canjes: f.canjes.map((c, j) => (j === i ? { ...c, ...cambios } : c)) }));

    // Anular pide MOTIVO (queda en la venta y en la auditoría) y puede rebotar con un
    // 409 que dice qué revertir antes (pagos, financiación, factura): ese mensaje lo
    // muestra el diálogo adentro, por eso acá no hay try/catch.
    const handleDelete = (v: Venta) => setAnulacion({ venta: v, modo: 'baja' });

    const confirmarAnulacion = async (motivo: string) => {
        if (!anulacion) return;
        const { venta, modo } = anulacion;
        if (modo === 'baja') {
            await deleteMutation.mutateAsync({ id: venta.id, motivo });
            if (selectedDetailId === venta.id) setSelectedDetailId(null);
            addToast('Venta anulada. La unidad volvió a Publicado.', 'success');
        } else {
            await anularOperacionMutation.mutateAsync({ id: venta.id, motivo });
            addToast(`Entrega: ${ENTREGA_ESTADO.cancelada.label}`, 'success');
        }
        setAnulacion(null);
    };

    const handleComprobante = async (id: number) => {
        try {
            const blob = await ventasApi.comprobantePdf(id) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `comprobante-venta-${id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('No se pudo generar el comprobante', 'error');
        }
    };

    // Factura electrónica AFIP: emite (obtiene el CAE) y descarga el PDF fiscal.
    // Idempotente: si la venta ya fue facturada, el backend responde 409 con
    // 'COMPROBANTE_YA_EMITIDO' → no es un error, se salta directo a la descarga.
    // Un 422 (faltan datos fiscales del emisor/receptor) se muestra tal cual.
    const handleFactura = async (id: number) => {
        // Guard anti-doble-emisión: si ya hay una factura en curso para esta venta,
        // el segundo click se ignora (el botón además queda deshabilitado).
        if (facturaEnCurso.has(id)) return;
        setFacturaEnCurso(prev => new Set(prev).add(id));
        try {
            let emitida = false;
            try {
                await ventasApi.emitirFactura(id);
                emitida = true;
            } catch (err: unknown) {
                const apiError = err as { error?: string; message?: string };
                if (apiError?.error !== 'COMPROBANTE_YA_EMITIDO') {
                    addToast(apiError?.message ?? 'No se pudo emitir la factura', 'error');
                    return;
                }
            }
            if (emitida) addToast('Factura emitida: AFIP otorgó el CAE', 'success');

            const blob = await ventasApi.facturaPdf(id) as unknown as Blob;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `factura-venta-${id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            addToast('No se pudo generar la factura', 'error');
        } finally {
            setFacturaEnCurso(prev => { const next = new Set(prev); next.delete(id); return next; });
        }
    };

    // Si falla, el aviso lo da el MutationCache global (la mutación no define onError)
    // y el rechazo sigue de largo para que el diálogo de confirmación no se cierre.
    const cambiarEntrega = async (id: number, estadoEntrega: EstadoEntrega) => {
        await changeEstadoEntregaMutation.mutateAsync({ id, estadoEntrega });
        addToast(`Entrega: ${ENTREGA_ESTADO[estadoEntrega].label}`, 'success');
    };

    /** Los pasos finales (entregar, anular) piden confirmación: no tienen vuelta atrás. */
    const handleEstadoEntrega = async (v: Venta, t: { next: EstadoEntrega; final?: boolean }) => {
        if (!t.final) {
            // El error ya se mostró en un toast dentro de cambiarEntrega.
            await cambiarEntrega(v.id, t.next).catch(() => undefined);
            return;
        }
        const unidad = `${v.vehiculo?.marca ?? ''} ${v.vehiculo?.modelo ?? ''}${v.vehiculo?.dominio ? ` (${v.vehiculo.dominio})` : ''}`.trim();
        if (t.next === 'cancelada') {
            setAnulacion({ venta: v, modo: 'entrega' });
        } else {
            await confirm({
                title: 'Marcar como entregada',
                message: `Confirmá que la unidad ${unidad} ya se le entregó a ${v.cliente?.nombre ?? 'el cliente'}. Es el último paso de la entrega: después no se puede cambiar.`,
                type: 'question',
                confirmLabel: 'Marcar como entregada',
                onConfirm: () => cambiarEntrega(v.id, 'entregada'),
            });
        }
    };

    // ── Recibo imprimible ──
    const handleImprimirRecibo = async () => {
        if (!detail) return;
        setImprimiendo(true);
        try {
            // Datos de la concesionaria para el encabezado. El super_admin no tiene
            // "la suya": se pide la de la venta. Si falla, el recibo sale igual.
            let conc: { nombre?: string; cuit?: string; direccion?: string; telefono?: string } | null = null;
            try {
                conc = permisos.roles.includes('super_admin')
                    ? await concesionariasApi.getById(detail.concesionariaId) as typeof conc
                    : await concesionariasApi.getMine() as typeof conc;
            } catch {
                addToast('No se pudieron leer los datos de la concesionaria: el recibo sale sin ellos', 'info');
            }
            const cliente = (detail.cliente ?? {}) as { nombre?: string; dni?: string; email?: string; telefono?: string };
            const ok = imprimirReciboVenta({
                id: detail.id,
                fechaVenta: detail.fechaVenta,
                precioVenta: detail.precioVenta,
                moneda: detail.moneda,
                formaPago: detail.formaPago,
                observaciones: detail.observaciones,
                concesionaria: conc,
                sucursal: nombreSucursal(detail.sucursalId),
                cliente,
                vehiculo: detail.vehiculo,
                vendedor: detail.vendedor?.nombre,
                pagos: (detail.pagos ?? []).map((p) => ({ ...p, fecha: (p as { fecha?: string }).fecha })),
                extras: ((detail as { extras?: { descripcion?: string; monto: number }[] }).extras ?? []),
                canjes: (detail.canjes ?? []).map((c) => ({ descripcion: descripcionUnidad(c.vehiculoCanjeId), valorTomado: c.valorTomado })),
            });
            if (!ok) addToast('El navegador bloqueó la ventana del recibo. Permití las ventanas emergentes y probá de nuevo.', 'error');
        } finally {
            setImprimiendo(false);
        }
    };

    const ventas = ventasData?.results || [];
    const cuentaForm = calcularSaldoVenta({
        precioVenta: form.precioVenta,
        pagos: form.pagos,
        extras: form.externos,
        canjes: form.canjes,
    });

    const columns: Column<Venta>[] = [
        {
            header: 'Venta',
            accessor: (v) => (
                <div className="flex flex-col">
                    <span className="font-mono text-xs font-bold">N° {nroVenta(v.id)}</span>
                    <span className="text-xs text-muted tabular-nums">{formatFecha(v.fechaVenta)}</span>
                </div>
            )
        },
        {
            header: 'Unidad',
            accessor: (v) => (
                <div className="flex flex-col">
                    <span className="font-bold text-sm">{v.vehiculo?.marca} {v.vehiculo?.modelo}</span>
                    <span className="text-xs text-muted">{v.vehiculo?.dominio || 'Sin dominio'}</span>
                </div>
            )
        },
        {
            // Cliente y vendedor en una sola columna: a 1280 px la tabla entra sin
            // scroll horizontal y las acciones quedan a la vista.
            header: 'Cliente',
            accessor: (v) => (
                <div className="flex flex-col" style={{ minWidth: 0 }}>
                    <span className="text-sm font-bold truncate">{v.cliente?.nombre || 'Sin cliente'}</span>
                    <span className="text-xs text-muted truncate">Vendedor: {v.vendedor?.nombre || 'sin asignar'}</span>
                </div>
            )
        },
        {
            header: 'Precio',
            align: 'right',
            accessor: (v) => (
                <div className="flex flex-col" style={{ alignItems: 'flex-end' }}>
                    <span className="font-black tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                        {formatMoneda(v.precioVenta, v.moneda)}
                    </span>
                    <span className="text-xs text-muted">{FORMA_PAGO_LABEL[v.formaPago] || v.formaPago}</span>
                </div>
            )
        },
        {
            header: 'Entrega',
            accessor: (v) => {
                const e = rotuloEstado(ENTREGA_ESTADO, v.estadoEntrega);
                return <Badge variant={e.variant}>{e.label}</Badge>;
            }
        },
        {
            header: 'Acciones',
            align: 'right',
            accessor: (v) => (
                <div className="flex justify-end gap-1">
                    <button type="button" className="icon-btn" title="Ver detalle" aria-label={`Ver detalle de la venta ${nroVenta(v.id)}`} onClick={(e) => { e.stopPropagation(); setSelectedDetailId(v.id); }}><Eye size={16} /></button>
                    <button type="button" className="icon-btn" title="Descargar comprobante (PDF)" aria-label={`Descargar comprobante de la venta ${nroVenta(v.id)}`} onClick={(e) => { e.stopPropagation(); handleComprobante(v.id); }}><FileDown size={16} /></button>
                    {permisos.ventasOperar && (
                        <button type="button" className="icon-btn" title="Emitir o descargar la factura electrónica (AFIP)" aria-label={`Factura AFIP de la venta ${nroVenta(v.id)}`} disabled={facturaEnCurso.has(v.id)} onClick={(e) => { e.stopPropagation(); handleFactura(v.id); }}><FileText size={16} /></button>
                    )}
                    {permisos.ventasAnular && (
                        <button type="button" className="icon-btn danger" title="Anular venta" aria-label={`Anular la venta ${nroVenta(v.id)}`} onClick={e => { e.stopPropagation(); handleDelete(v); }}><Trash2 size={16} /></button>
                    )}
                </div>
            )
        }
    ];

    const kpiNumero = (c: { data?: number; isLoading: boolean; isError: boolean }) =>
        c.isError ? '—' : c.isLoading ? '…' : String(c.data ?? 0);

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Ventas" />
            {/* Header */}
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary">
                            <ShoppingBag size={20} />
                        </div>
                        <h1>Ventas</h1>
                    </div>
                    <p>Ventas registradas, su entrega y sus cobros.</p>
                </div>
                <div className="header-actions">
                    <Button variant="secondary" onClick={() => refetchVentas()} aria-label="Actualizar listado" title="Actualizar listado">
                        <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
                    </Button>
                    {permisos.ventasAnular && (
                        <Button variant="secondary" onClick={() => setAnuladasOpen(true)} title="Ventas anuladas, con su motivo y quién las anuló">
                            <Ban size={18} aria-hidden="true" /> Anuladas
                        </Button>
                    )}
                    {permisos.ventasOperar && (
                        <Button data-tour="ventas-nueva" variant="primary" onClick={() => { setForm(emptyForm()); setCreateOpen(true); }}>
                            <Plus size={18} /> Registrar venta
                        </Button>
                    )}
                </div>
            </header>

            {/* Indicadores */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6" data-tour="ventas-kpis">
                <div className="card glass stat-tile">
                    <div className="stat-tile-body">
                        <span className="stat-tile-label">Ventas del mes</span>
                        <div className="text-3xl font-black tabular-nums" title={ventasMes.isError ? 'No se pudo calcular' : undefined}>{kpiNumero(ventasMes)}</div>
                        <span className="text-xs text-muted">{mes.nombre}</span>
                    </div>
                    <TrendingUp size={64} className="stat-tile-bg" />
                </div>
                <div className="card glass stat-tile">
                    <div className="stat-tile-body">
                        <span className="stat-tile-label">Pendientes de entrega</span>
                        <div className="text-3xl font-black tabular-nums" title={pendientesError ? 'No se pudo calcular' : undefined}>
                            {pendientesError ? '—' : pendientesCargando ? '…' : pendientesTotal}
                        </div>
                        <span className="text-xs text-muted">Sin entregar ni anular</span>
                    </div>
                    <Package size={64} className="stat-tile-bg" />
                </div>
                {puedeVerReporte && (
                    <div className="card glass stat-tile col-span-1 md:col-span-2">
                        <div className="ventas-kpi-montos">
                            <div>
                                <span className="stat-tile-label">Vendido en el mes</span>
                                {reporteMes.isError ? (
                                    <p className="text-sm text-muted">No se pudo calcular. <button type="button" className="link-btn" onClick={() => reporteMes.refetch()}>Reintentar</button></p>
                                ) : reporteMes.isLoading ? (
                                    <div className="ventas-kpi-monto text-muted">…</div>
                                ) : vendidoPorMoneda.length === 0 ? (
                                    <div className="ventas-kpi-monto">{formatMoneda(0, 'ARS')}</div>
                                ) : vendidoPorMoneda.map(({ moneda, total }) => (
                                    <div key={moneda} className="ventas-kpi-monto">{formatMoneda(total, moneda)}</div>
                                ))}
                            </div>
                            <div>
                                <span className="stat-tile-label">Promedio por venta</span>
                                {vendidoPorMoneda.length === 0 ? (
                                    <div className="ventas-kpi-monto text-muted">-</div>
                                ) : vendidoPorMoneda.map(({ moneda, total, cantidad }) => (
                                    <div key={moneda} className="ventas-kpi-monto">{formatMoneda(Math.round(total / cantidad), moneda)}</div>
                                ))}
                            </div>
                        </div>
                        <DollarSign size={80} className="stat-tile-bg" />
                    </div>
                )}
            </div>

            {/* Filtros */}
            <div className="filters-bar filtros-comerciales" data-tour="ventas-filtros">
                <div className="search-box">
                    <Search size={18} className="text-muted" aria-hidden="true" />
                    <input
                        type="search"
                        placeholder="Buscar cliente, DNI, dominio, marca o modelo"
                        aria-label="Buscar ventas"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                    />
                </div>
                <select aria-label="Filtrar por estado de la entrega" value={filtros.estadoEntrega} onChange={e => setFiltro('estadoEntrega', e.target.value)}>
                    <option value="">Entrega: todas</option>
                    {Object.entries(ENTREGA_ESTADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select aria-label="Filtrar por forma de pago" value={filtros.formaPago} onChange={e => setFiltro('formaPago', e.target.value)}>
                    <option value="">Forma de pago: todas</option>
                    {Object.entries(FORMA_PAGO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {hayFiltros && (
                    <Button variant="ghost" size="sm" onClick={limpiar}>
                        <X size={16} /> Limpiar filtros
                    </Button>
                )}
            </div>

            <div data-tour="ventas-tabla" className="listado-compacto">
                <DataTable
                    columns={columns}
                    data={ventas}
                    isLoading={loadingVentas}
                    isError={isError}
                    errorMessage="No se pudieron cargar las ventas"
                    onRetry={() => refetchVentas()}
                    onRowClick={(v) => setSelectedDetailId(v.id)}
                    currentPage={page}
                    totalPages={ventasData?.totalPages || 1}
                    onPageChange={setPage}
                    emptyMessage={hayFiltros
                        ? 'Ninguna venta coincide con la búsqueda o los filtros'
                        : 'Todavía no hay ventas registradas. Cargá la primera con «Registrar venta».'}
                    emptyIcon={<ShoppingBag size={40} className="dt-empty-icon" />}
                    onClearFilters={hayFiltros ? limpiar : undefined}
                />
            </div>

            {/* ALTA */}
            <Modal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Registrar venta"
                subtitle="Los campos con * son obligatorios."
                maxWidth="940px"
                footer={(
                    <div className="flex justify-between items-center w-full flex-wrap gap-4">
                        <div>
                            <p className="stat-tile-label">Precio de venta</p>
                            <p className="text-2xl font-black tabular-nums">{formatMoneda(form.precioVenta, form.moneda)}</p>
                            {(cuentaForm.totalPagos > 0 || cuentaForm.totalCanjes > 0) && (
                                <p className="text-xs text-muted tabular-nums">
                                    Cobrado {formatMoneda(cuentaForm.totalPagos, form.moneda)}
                                    {cuentaForm.totalCanjes > 0 && ` · Canjes ${formatMoneda(cuentaForm.totalCanjes, form.moneda)}`}
                                    {` · Saldo ${formatMoneda(cuentaForm.saldo, form.moneda)}`}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                            <Button variant="primary" onClick={handleCreate} loading={createMutation.isPending}>Registrar venta</Button>
                        </div>
                    </div>
                )}
            >
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Combobox dense label="Unidad *" placeholder="Buscá por marca, modelo o dominio" value={form.vehiculoId || null} onChange={v => elegirUnidad(Number(v) || 0)}
                            options={vehiculos.map(v => ({ value: v.id, label: `${v.marca} ${v.modelo}`, sub: v.dominio || `#${v.id}` }))}
                            hint={unidadElegida && Number(unidadElegida.precioLista) > 0 ? `Precio de lista: ${formatMoneda(unidadElegida.precioLista, unidadElegida.moneda)}` : undefined} />
                        <Combobox dense label="Cliente *" placeholder="Buscá el cliente por nombre" value={form.clienteId || null} onChange={v => setForm(f => ({ ...f, clienteId: Number(v) || 0 }))}
                            options={clientes.map(c => ({ value: c.id, label: c.nombre }))} />
                        <Select dense label="Vendedor *" placeholder="Elegí el vendedor" value={form.vendedorId || ''} onChange={e => setForm(f => ({ ...f, vendedorId: +e.target.value }))}>
                            {vendedores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                        </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Select dense label="Sucursal *" placeholder="Elegí la sucursal" value={form.sucursalId || ''} onChange={e => setForm(f => ({ ...f, sucursalId: +e.target.value }))}>
                            {sucursalesData?.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                        </Select>
                        <Input dense label="Fecha de venta *" type="date" value={form.fechaVenta} onChange={e => setForm(f => ({ ...f, fechaVenta: e.target.value }))} />
                        <Input dense label="Precio de venta *" type="number" min="0" className="font-bold tabular-nums" icon={<DollarSign size={16} />} value={form.precioVenta || ''}
                            onChange={e => setForm(f => ({ ...f, precioVenta: +e.target.value }))} placeholder="0"
                            hint={form.precioVenta > 0 ? formatMoneda(form.precioVenta, form.moneda) : undefined} />
                        <Select dense label="Moneda *" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}>
                            <option value="ARS">Pesos ($)</option>
                            <option value="USD">Dólares (US$)</option>
                        </Select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Select dense label="Forma de pago *" value={form.formaPago} onChange={e => setForm(f => ({ ...f, formaPago: e.target.value as FormaPagoVenta }))}>
                            {Object.entries(FORMA_PAGO_LABEL).map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
                        </Select>
                    </div>

                    {/* Pagos */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <DollarSign size={14} /> Pagos recibidos
                            </h3>
                            <Button variant="secondary" size="sm" onClick={handleAddPago}>
                                <Plus size={14} /> Agregar pago
                            </Button>
                        </div>
                        {form.pagos.length === 0 && <p className="text-xs text-muted">Sin pagos cargados. Podés agregarlos después desde el detalle de la venta.</p>}
                        {form.pagos.map((p, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-2">
                                <Input dense containerClassName="mb-0 md:col-span-3" label="Monto" type="number" min="0" className="tabular-nums" value={p.monto || ''}
                                    onChange={e => updPago(i, { monto: +e.target.value })} />
                                <Select dense containerClassName="mb-0 md:col-span-3" label="Medio de pago" value={p.metodo} onChange={e => updPago(i, { metodo: e.target.value as MetodoPago })}>
                                    {Object.entries(METODO_PAGO_LABEL).map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
                                </Select>
                                <Input dense containerClassName="mb-0 md:col-span-5" label="Referencia" type="text" value={p.referencia}
                                    onChange={e => updPago(i, { referencia: e.target.value })} placeholder="N° de recibo, de transferencia o de cheque" />
                                <div className="md:col-span-1 flex justify-end">
                                    <button type="button" className="icon-btn danger" aria-label={`Quitar el pago ${i + 1}`} title="Quitar pago"
                                        onClick={() => setForm(f => ({ ...f, pagos: f.pagos.filter((_, j) => j !== i) }))}>
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Canjes */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <ArrowRightLeft size={14} /> Canje (unidad que entrega el cliente)
                            </h3>
                            <Button variant="secondary" size="sm" onClick={handleAddCanje}>
                                <Plus size={14} /> Agregar canje
                            </Button>
                        </div>
                        {form.canjes.length === 0 && <p className="text-xs text-muted">Sin canje. La unidad que entrega el cliente tiene que estar cargada en Vehículos.</p>}
                        {form.canjes.map((c, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-2">
                                <Select dense containerClassName="mb-0 md:col-span-8" label="Unidad del canje" placeholder="Elegí la unidad" value={c.vehiculoCanjeId || ''} onChange={e => updCanje(i, { vehiculoCanjeId: +e.target.value })}>
                                    {todosVehiculos.map(v => (
                                        <option key={v.id} value={v.id}>{v.marca} {v.modelo} — {v.dominio || `#${v.id}`}</option>
                                    ))}
                                </Select>
                                <Input dense containerClassName="mb-0 md:col-span-3" label="Valor de toma" type="number" min="0" className="tabular-nums" value={c.valorTomado || ''}
                                    onChange={e => updCanje(i, { valorTomado: +e.target.value })} />
                                <div className="md:col-span-1 flex justify-end">
                                    <button type="button" className="icon-btn danger" aria-label={`Quitar el canje ${i + 1}`} title="Quitar canje"
                                        onClick={() => setForm(f => ({ ...f, canjes: f.canjes.filter((_, j) => j !== i) }))}>
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Textarea dense label="Observaciones" rows={2} value={form.observaciones}
                        onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Gestoría, documentación pendiente, acuerdos con el cliente…" />
                </div>
            </Modal>

            {/* DETALLE */}
            <Modal
                isOpen={!!selectedDetailId}
                onClose={() => { setSelectedDetailId(null); }}
                title={selectedDetailId ? `Venta N° ${nroVenta(selectedDetailId)}` : 'Venta'}
                maxWidth="900px"
                footer={detail ? (
                    <div className="flex justify-end gap-3 w-full flex-wrap">
                        <Button variant="secondary" onClick={handleImprimirRecibo} loading={imprimiendo}>
                            <Printer size={16} /> Imprimir recibo
                        </Button>
                        <Button variant="secondary" onClick={() => setSelectedDetailId(null)}>Cerrar</Button>
                    </div>
                ) : undefined}
            >
                {detailError ? (
                    <div className="dt-empty">
                        <p className="dt-empty-text">No se pudo cargar la venta.</p>
                        <Button variant="secondary" size="sm" onClick={() => refetchDetail()}>Reintentar</Button>
                    </div>
                ) : loadingDetail || !detail ? (
                    <div className="text-center"><RefreshCw className="animate-spin text-accent mb-4" size={40} aria-hidden="true" /><p className="text-sm text-muted">Cargando la venta…</p></div>
                ) : (
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-3 flex-wrap">
                            <Badge variant={rotuloEstado(ENTREGA_ESTADO, detail.estadoEntrega).variant}>
                                Entrega: {rotuloEstado(ENTREGA_ESTADO, detail.estadoEntrega).label}
                            </Badge>
                            {/* Se vendió por debajo del precio mínimo, con autorización o por un
                                admin (PROC-34). El valor del piso no viaja: sólo la marca. */}
                            {detail.bajoPiso && (
                                <Badge variant="warning">Bajo el precio mínimo</Badge>
                            )}
                            <p className="font-bold flex items-center gap-2 text-sm">
                                <Car size={16} aria-hidden="true" /> {detail.vehiculo?.marca} {detail.vehiculo?.modelo} · {detail.vehiculo?.dominio || 'sin dominio'}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                                <span className="stat-tile-label">Fecha de venta</span>
                                <p className="text-lg font-bold tabular-nums">{formatFecha(detail.fechaVenta)}</p>
                            </div>
                            <div>
                                <span className="stat-tile-label">Sucursal</span>
                                <p className="text-lg font-bold truncate">{nombreSucursal(detail.sucursalId) || '-'}</p>
                            </div>
                            <div>
                                <span className="stat-tile-label">Precio de venta</span>
                                <p className="text-xl font-black tabular-nums">{formatMoneda(detail.precioVenta, detail.moneda)}</p>
                            </div>
                            <div>
                                <span className="stat-tile-label">Forma de pago</span>
                                <p className="text-sm font-bold">{FORMA_PAGO_LABEL[detail.formaPago] || detail.formaPago}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
                                    <User size={14} aria-hidden="true" /> Cliente y vendedor
                                </h3>
                                <span className="stat-tile-label">Cliente</span>
                                <p className="font-bold">{detail.cliente?.nombre || '-'}</p>
                                <p className="text-xs text-muted mb-3">{detail.cliente?.email || 'Sin email'}</p>
                                <span className="stat-tile-label">Vendedor</span>
                                <p className="font-bold">{detail.vendedor?.nombre || 'Sin asignar'}</p>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
                                    <MapPin size={14} aria-hidden="true" /> Entrega
                                </h3>
                                {transicionesVisibles.length > 0 ? (
                                    <div>
                                        <p className="text-xs text-secondary mb-3">Próximo paso de la entrega:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {transicionesVisibles.map(t => (
                                                <Button
                                                    key={t.next}
                                                    variant={t.next === 'cancelada' ? 'danger' : t.next === 'entregada' ? 'primary' : 'secondary'}
                                                    size="sm"
                                                    loading={changeEstadoEntregaMutation.isPending && changeEstadoEntregaMutation.variables?.estadoEntrega === t.next}
                                                    onClick={() => handleEstadoEntrega(detail, t)}
                                                >
                                                    {t.label}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-sm">
                                        <CheckCircle2 size={20} className="text-success" aria-hidden="true" />
                                        <span>{detail.estadoEntrega === 'entregada' ? 'Unidad entregada.' : detail.estadoEntrega === 'cancelada' ? 'Venta anulada.' : 'No hay pasos de entrega disponibles para tu usuario.'}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
                                <DollarSign size={14} aria-hidden="true" /> Pagos y canjes
                            </h3>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Concepto</th>
                                            <th>Medio</th>
                                            <th>Referencia</th>
                                            <th style={{ textAlign: 'right' }}>Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(detail.pagos?.length ?? 0) === 0 && (detail.canjes?.length ?? 0) === 0 && (
                                            <tr><td colSpan={4} className="text-center text-sm text-muted">Todavía no hay pagos ni canjes registrados.</td></tr>
                                        )}
                                        {detail.pagos?.map((p) => (
                                            <tr key={`p-${p.id}`}>
                                                <td>Pago</td>
                                                <td><Badge variant="default">{METODO_PAGO_LABEL[p.metodo] ?? p.metodo}</Badge></td>
                                                <td className="text-xs text-muted">{p.referencia || '-'}</td>
                                                <td style={{ textAlign: 'right' }} className="font-bold tabular-nums">{formatMoneda(p.monto, detail.moneda)}</td>
                                            </tr>
                                        ))}
                                        {detail.canjes?.map((c) => (
                                            <tr key={`c-${c.id}`}>
                                                <td>Canje</td>
                                                <td><Badge variant="warning">Unidad</Badge></td>
                                                <td className="text-xs">{descripcionUnidad(c.vehiculoCanjeId)}</td>
                                                <td style={{ textAlign: 'right' }} className="font-bold tabular-nums">{formatMoneda(c.valorTomado, detail.moneda)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {detail.observaciones && (
                            <div className="text-sm text-secondary">
                                <span className="stat-tile-label">Observaciones</span>
                                <p style={{ whiteSpace: 'pre-line' }}>{detail.observaciones}</p>
                            </div>
                        )}

                        {/* Facturación electrónica AFIP */}
                        <VentaFacturaPanel ventaId={detail.id} />

                        {/* Pagos, extras y canjes: alta y baja */}
                        <div>
                            <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
                                <DollarSign size={14} aria-hidden="true" /> Cargar o quitar pagos, extras y canjes
                            </h3>
                            <VentaSubResources ventaId={detail.id} moneda={detail.moneda} />
                        </div>
                    </div>
                )}
            </Modal>

            {anulacion && (
                <MotivoDialog
                    isOpen
                    title={`Anular la venta N° ${nroVenta(anulacion.venta.id)}`}
                    message={anulacion.modo === 'baja'
                        ? `La venta (${`${anulacion.venta.vehiculo?.marca ?? ''} ${anulacion.venta.vehiculo?.modelo ?? ''}`.trim()}) sale del listado y la unidad vuelve a quedar publicada. Si tiene pagos, una financiación o una factura ante AFIP, primero hay que revertirlos.`
                        : `La operación queda anulada y no se puede volver atrás. La unidad no vuelve sola al stock: si corresponde, cambiá su estado desde Vehículos.`}
                    label="Motivo de la anulación"
                    placeholder="Ej.: el cliente desistió, error de carga, venta duplicada…"
                    confirmLabel="Anular venta"
                    onCancel={() => setAnulacion(null)}
                    onConfirm={confirmarAnulacion}
                />
            )}

            <VentasAnuladasModal isOpen={anuladasOpen} onClose={() => setAnuladasOpen(false)} />

            <style>{`
                .ventas-kpi-montos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
                /* Tamaño fluido: a 1280 px el promedio entra entero (antes se cortaba en "$17.700.00…"). */
                .ventas-kpi-monto { font-family: var(--font-display); font-weight: 700; font-size: clamp(1.1rem, 1.6vw, 1.75rem); line-height: 1.15; font-variant-numeric: tabular-nums; white-space: nowrap; }
                .link-btn { background: none; border: none; padding: 0; color: var(--accent-hover, var(--accent)); text-decoration: underline; cursor: pointer; font: inherit; }
            `}</style>
        </div>
    );
};

export default VentasPage;
