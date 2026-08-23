import React, { useState, useMemo } from 'react';
import type { CreateVentaDto } from '../../api/ventas.api';
import { useUIStore } from '../../store/uiStore';
import { useConfirm } from '../../hooks/useConfirm';
import { useVentas, useVenta, useCreateVenta, useDeleteVenta, useChangeEstadoEntrega } from '../../hooks/useVentas';
import { useClientes } from '../../hooks/useClientes';
import { useUsuarios } from '../../hooks/useUsuarios';
import { useSucursales } from '../../hooks/useSucursales';
import { useVehiculos } from '../../hooks/useVehiculos';
import { useDebounce } from '../../hooks/useDebounce';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import DataTable, { type Column } from '../../components/ui/DataTable';
import {
    Plus, Search, Eye, Trash2, X, RefreshCw, DollarSign,
    ArrowRightLeft, User, ShoppingBag, Car, MapPin,
    CheckCircle2, TrendingUp, Printer, Package, FileText
} from 'lucide-react';
import type { FormaPagoVenta, EstadoEntrega, Venta } from '../../types/venta.types';
import type { ApiError } from '../../types/api.types';
import VentaSubResources from '../../components/ventas/VentaSubResources';
import VentaFacturaPanel from '../../components/ventas/VentaFacturaPanel';
import { ventasApi } from '../../api/ventas.api';

// ─── Tipos auxiliares ──────────────────────────────────────────────────────
interface PagoRow { monto: number; metodo: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'otro'; referencia: string; observaciones: string }
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

// ─── Status maps ────────────────────────────────────────────────────────────
const entregaStatusMap: Record<EstadoEntrega, { label: string; variant: 'warning' | 'danger' | 'info' | 'success' | 'default' }> = {
    pendiente: { label: 'Pendiente', variant: 'warning' },
    bloqueada: { label: 'Bloqueada', variant: 'danger' },
    autorizada: { label: 'Autorizada', variant: 'info' },
    entregada: { label: 'Entregada', variant: 'success' },
    cancelada: { label: 'Cancelada', variant: 'default' },
};

const entregaTransitions: Record<EstadoEntrega, { label: string; next: EstadoEntrega }[]> = {
    pendiente: [{ label: 'Bloquear Entrega', next: 'bloqueada' }, { label: 'Autorizar Entrega', next: 'autorizada' }],
    bloqueada: [{ label: 'Autorizar Entrega', next: 'autorizada' }, { label: 'Anular Operación', next: 'cancelada' }],
    autorizada: [{ label: 'Efectivizar Entrega', next: 'entregada' }, { label: 'Anular Operación', next: 'cancelada' }],
    entregada: [],
    cancelada: [],
};

const formaPagoLabels: Record<FormaPagoVenta, string> = {
    contado: 'Contado / Efectivo',
    transferencia: 'Transferencia Bancaria',
    financiado_propio: 'Financiación Interna',
    financiado_externo: 'Crédito Prendario / Uva',
    canje_mas_diferencia: 'Canje + Saldo',
    mixto: 'Ingresos Mixtos',
};

const metodoLabels: Record<string, string> = {
    efectivo: 'Efectivo', transferencia: 'Transferencia',
    tarjeta: 'Tarjeta', cheque: 'Cheque', otro: 'Otro / Billetera',
};

const today = () => new Date().toISOString().split('T')[0];
const emptyForm = (): VentaForm => ({
    sucursalId: 0, clienteId: 0, vendedorId: 0, vehiculoId: 0,
    fechaVenta: today(), precioVenta: 0, moneda: 'ARS',
    formaPago: 'contado', observaciones: '',
    pagos: [], externos: [], canjes: [],
});
const emptyPago = (): PagoRow => ({ monto: 0, metodo: 'efectivo', referencia: '', observaciones: '' });
const emptyCanjeRow = (): CanjeRow => ({ vehiculoCanjeId: 0, valorTomado: 0 });

const addPago = (setForm: React.Dispatch<React.SetStateAction<VentaForm>>) => {
    setForm(f => ({ ...f, pagos: [...f.pagos, emptyPago()] }));
};

const addCanje = (setForm: React.Dispatch<React.SetStateAction<VentaForm>>) => {
    setForm(f => ({ ...f, canjes: [...f.canjes, emptyCanjeRow()] }));
};

// ─── Componente principal ────────────────────────────────────────────────────
const VentasPage = () => {
    const { addToast } = useUIStore();
    const confirm = useConfirm();

    // Filters & Pagination State
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 500);
    const [filterFormaPago, setFilterFormaPago] = useState('');
    const [filterEstadoEntrega, setFilterEstadoEntrega] = useState('');

    // Modals & Detail State
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState<VentaForm>(emptyForm());
    const [selectedDetailId, setSelectedDetailId] = useState<number | null>(null);
    // Facturas en curso (por venta): evita doble emisión al doble-clickear.
    const [facturaEnCurso, setFacturaEnCurso] = useState<Set<number>>(new Set());

    // Queries
    const { data: ventasData, isLoading: loadingVentas, refetch: refetchVentas } = useVentas(
        {
            formaPago: filterFormaPago || undefined,
            estadoEntrega: filterEstadoEntrega || undefined,
        },
        { page, limit: 15 }
    );

    const { data: detail, isLoading: loadingDetail } = useVenta(selectedDetailId);

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

    // Mutations
    const createMutation = useCreateVenta();
    const changeEstadoEntregaMutation = useChangeEstadoEntrega();
    const deleteMutation = useDeleteVenta();

    const handleCreate = async () => {
        if (!form.vehiculoId || !form.clienteId || !form.vendedorId || !form.sucursalId) {
            addToast('Complete la estructura mandatoria para registrar la venta', 'error'); return;
        }
        if (form.precioVenta <= 0) {
            addToast('El precio de transacción debe ser un valor positivo', 'error'); return;
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
            addToast('Venta perfeccionada y asientos contables generados', 'success');
            setCreateOpen(false);
            setForm(emptyForm());
        } catch (err: unknown) {
            const apiError = err as ApiError;
            addToast(apiError?.message ?? 'Fallo en la validación fiscal de la venta', 'error');
        }
    };

    const handleAddPago = () => addPago(setForm);
    const handleAddCanje = () => addCanje(setForm);

    const handleDelete = async (id: number) => {
        await confirm({
            title: 'Revocar Acto Comercial',
            message: `¿Desea anular la venta #${id}? Esta acción revierte el stock, anula los cobros y purga los asientos contables relacionados.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    await deleteMutation.mutateAsync(id);
                    addToast('Operación revocada con éxito', 'success');
                } catch (err: unknown) {
                    const apiError = err as ApiError;
                    addToast(apiError?.message ?? 'Error al desestimar la venta', 'error');
                }
            }
        });
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
            addToast('Error al generar el comprobante', 'error');
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
            if (emitida) addToast('Factura AFIP emitida — CAE obtenido', 'success');

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
            addToast('Error al generar la factura', 'error');
        } finally {
            setFacturaEnCurso(prev => { const next = new Set(prev); next.delete(id); return next; });
        }
    };

    const handleEstadoEntrega = async (id: number, estadoEntrega: EstadoEntrega) => {
        try {
            await changeEstadoEntregaMutation.mutateAsync({ id, estadoEntrega });
            addToast(`Estado de logística actualizado a: ${entregaStatusMap[estadoEntrega].label.toUpperCase()} `, 'success');
        } catch (err: unknown) {
            const apiError = err as ApiError;
            addToast(apiError?.message ?? 'Error al procesar la transición de logística', 'error');
        }
    };

    // Client-side search filtration
    const ventasFiltradas = useMemo(() => {
        const results = ventasData?.results || [];
        if (!debouncedSearch) return results;
        const term = debouncedSearch.toLowerCase();
        return results.filter(v =>
            v.cliente?.nombre?.toLowerCase().includes(term) ||
            v.vehiculo?.marca?.toLowerCase().includes(term) ||
            v.vehiculo?.modelo?.toLowerCase().includes(term) ||
            v.vehiculo?.dominio?.toLowerCase().includes(term) ||
            v.vendedor?.nombre?.toLowerCase().includes(term)
        );
    }, [ventasData, debouncedSearch]);

    // El volumen se acumula por moneda: sumar pesos y dólares en un mismo total
    // da un número que no existe, y el promedio de esa mezcla tampoco significa
    // nada. ARS primero por ser la moneda por defecto.
    const volumenPorMoneda = useMemo(() => {
        const acc: Record<string, { total: number; cantidad: number }> = {};
        for (const v of ventasFiltradas) {
            const moneda = v.moneda || 'ARS';
            if (!acc[moneda]) acc[moneda] = { total: 0, cantidad: 0 };
            acc[moneda].total += Number(v.precioVenta) || 0;
            acc[moneda].cantidad += 1;
        }
        return Object.entries(acc)
            .map(([moneda, { total, cantidad }]) => ({ moneda, total, cantidad }))
            .sort((a, b) => (a.moneda === 'ARS' ? -1 : b.moneda === 'ARS' ? 1 : a.moneda.localeCompare(b.moneda)));
    }, [ventasFiltradas]);

    const columns: Column<Venta>[] = [
        {
            header: 'Identificador',
            accessor: (v) => (
                <div className="flex flex-col">
                    <span className="text-2xs font-black text-info tracking-tight uppercase italic">Operación</span>
                    <span className="font-mono text-xs font-bold">#{String(v.id).padStart(6, '0')}</span>
                </div>
            )
        },
        {
            header: 'Unidad / Activo',
            accessor: (v) => (
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center text-accent shadow-glow-sm">
                        <Car size={18} />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-xs uppercase">{v.vehiculo?.marca} {v.vehiculo?.modelo}</span>
                        <span className="text-3xs font-black text-muted tracking-widest">{v.vehiculo?.dominio || 'S/DOMINIO'}</span>
                    </div>
                </div>
            )
        },
        {
            header: 'Titular Cliente',
            accessor: (v) => (
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center text-muted">
                        <User size={12} />
                    </div>
                    <span className="text-xs font-bold text-muted uppercase truncate">{v.cliente?.nombre || 'CLIENTE N/A'}</span>
                </div>
            )
        },
        {
            header: 'Oficial Designado',
            accessor: (v) => (
                <span className="text-3xs font-black text-muted uppercase">{v.vendedor?.nombre || 'SIN OFICIAL'}</span>
            )
        },
        {
            header: 'Aforo de Venta',
            accessor: (v) => (
                <div className="flex flex-col">
                    <span className="font-black text-base tabular-nums">
                        ${Number(v.precioVenta).toLocaleString('es-AR')}
                    </span>
                    <span className="text-3xs font-bold text-accent uppercase tracking-tight">
                        {formaPagoLabels[v.formaPago] || v.formaPago}
                    </span>
                </div>
            )
        },
        {
            header: 'Estado Entrega',
            accessor: (v) => (
                <Badge variant={entregaStatusMap[v.estadoEntrega]?.variant ?? 'default'}>
                    {entregaStatusMap[v.estadoEntrega]?.label.toUpperCase()}
                </Badge>
            )
        },
        {
            header: 'Análisis',
            align: 'right',
            accessor: (v) => (
                <div className="flex justify-end gap-2">
                    <button className="icon-btn" title="Auditar Operación" onClick={(e) => { e.stopPropagation(); setSelectedDetailId(v.id); }}><Eye size={16} /></button>
                    <button className="icon-btn" title="Descargar comprobante PDF" onClick={(e) => { e.stopPropagation(); handleComprobante(v.id); }}><Printer size={16} /></button>
                    <button className="icon-btn" title="Emitir / descargar factura AFIP" disabled={facturaEnCurso.has(v.id)} onClick={(e) => { e.stopPropagation(); handleFactura(v.id); }}><FileText size={16} /></button>
                    <button className="icon-btn danger" onClick={e => { e.stopPropagation(); handleDelete(v.id); }} title="Anular Venta"><Trash2 size={16} /></button>
                </div>
            )
        }
    ];

    return (
        <div className="page-container animate-fade-in">
            {/* Header */}
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <ShoppingBag size={20} />
                        </div>
                        <h1>Libro de Ventas y Entregas</h1>
                    </div>
                    <p>Centralización de operaciones comerciales, auditoría de ingresos y trazabilidad de activos entregados.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => refetchVentas()}>
                        <RefreshCw size={18} className={loadingVentas ? 'animate-spin' : ''} />
                    </Button>
                    <Button data-tour="ventas-nueva" variant="primary" onClick={() => { setForm(emptyForm()); setCreateOpen(true); }}>
                        <Plus size={18} /> Registrar Nueva Transacción
                    </Button>
                </div>
            </header>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6" data-tour="ventas-kpis">
                <div className="card glass stat-tile">
                    <div className="stat-tile-body">
                        <span className="text-xs text-muted uppercase font-black tracking-tight">Ventas del Mes</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black">{ventasFiltradas.length}</span>
                            <span className="text-xs text-muted font-bold">PERIODICIDAD ACTIVA</span>
                        </div>
                    </div>
                    <TrendingUp size={64} className="stat-tile-bg" />
                </div>
                <div className="card glass stat-tile">
                    <div className="stat-tile-body">
                        <span className="text-xs text-muted uppercase font-black tracking-tight">Pendientes Entrega</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black">{ventasFiltradas.filter(v => v.estadoEntrega === 'pendiente' || v.estadoEntrega === 'autorizada').length}</span>
                            <span className="text-xs text-muted font-bold">UNIDADES</span>
                        </div>
                    </div>
                    <Package size={64} className="stat-tile-bg" />
                </div>
                <div className="card glass stat-tile col-span-1 md:col-span-2">
                    <div className="stat-tile-body flex justify-between items-center">
                        <div>
                            <span className="text-xs text-muted uppercase font-black tracking-tight">Volumen Facturado (Total Filtro)</span>
                            {/* Un solo número mezclando ARS y USD no representa ningún
                                importe real: se muestra un renglón por moneda. */}
                            {volumenPorMoneda.length === 0 ? (
                                <div className="text-3xl font-black">$0 <span className="text-xs text-muted">ARS</span></div>
                            ) : volumenPorMoneda.map(({ moneda, total }) => (
                                <div key={moneda} className="text-3xl font-black">
                                    ${total.toLocaleString('es-AR')}
                                    <span className="text-xs text-muted" style={{ marginLeft: '0.35rem' }}>{moneda}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span className="text-xs text-muted uppercase font-black tracking-tight">Promedio venta</span>
                            {volumenPorMoneda.length === 0 ? (
                                <p className="text-xl font-bold text-muted">-</p>
                            ) : volumenPorMoneda.map(({ moneda, total, cantidad }) => (
                                <p key={moneda} className="text-xl font-bold">
                                    ${Math.round(total / cantidad).toLocaleString('es-AR')}
                                    <span className="text-xs text-muted" style={{ marginLeft: '0.35rem' }}>{moneda}</span>
                                </p>
                            ))}
                        </div>
                    </div>
                    <DollarSign size={80} className="stat-tile-bg" />
                </div>
            </div>

            {/* Filters */}
            <div className="card glass filters-bar flex flex-wrap items-center justify-between gap-6 mb-6" data-tour="ventas-filtros">
                <div className="flex-1">
                    <Search size={18} className="text-muted" />
                    <input
                        type="text"
                        placeholder="BUSCAR POR CLIENTE, MARCA, MODELO, DOMINIO O RESPONSABLE COMERCIAL..."
                        className="form-input w-full"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', color: 'var(--text-primary)' }}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex gap-4 items-center">
                    <div>
                        <label className="text-3xs font-black text-muted uppercase mb-1">Logística</label>
                        <select className="form-input w-full" value={filterEstadoEntrega} onChange={e => { setFilterEstadoEntrega(e.target.value); setPage(1); }}>
                            <option value="">TODAS LAS ENTREGAS</option>
                            {Object.entries(entregaStatusMap).map(([k, v]) => <option key={k} value={k}>{v.label.toUpperCase()}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-3xs font-black text-muted uppercase mb-1">Modalidad</label>
                        <select className="form-input w-full" value={filterFormaPago} onChange={e => { setFilterFormaPago(e.target.value); setPage(1); }}>
                            <option value="">TODOS LOS PAGOS</option>
                            {Object.entries(formaPagoLabels).map(([k, v]) => <option key={k} value={k}>{v.toUpperCase()}</option>)}
                        </select>
                    </div>
                    <Button variant="secondary" onClick={() => { setSearch(''); setFilterEstadoEntrega(''); setFilterFormaPago(''); setPage(1); }}>
                        <RefreshCw size={18} />
                    </Button>
                </div>
            </div>

            <div data-tour="ventas-tabla">
            <DataTable
                columns={columns}
                data={ventasFiltradas}
                isLoading={loadingVentas}
                onRowClick={(v) => setSelectedDetailId(v.id)}
                currentPage={page}
                totalPages={ventasData?.totalPages || 1}
                onPageChange={setPage}
                emptyMessage="Sin operaciones en este registro"
            />
            </div>

            {/* CREATE MODAL */}
            <Modal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Certificación de Venta Automotriz"
                maxWidth="940px"
            >
                <div>
                    {/* Primary IDs */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Select dense label="Unidad Transaccionada *" className="text-lg font-bold" placeholder="SELECCIONAR UNIDAD EN STOCK..." value={form.vehiculoId || ''} onChange={e => setForm(f => ({ ...f, vehiculoId: +e.target.value }))}>
                            {vehiculos.map(v => (
                                <option key={v.id} value={v.id}>{v.marca} {v.modelo} [{v.dominio || `#${v.id} `}]</option>
                            ))}
                        </Select>
                        <Select dense label="Titular Adquirente *" placeholder="CLIENTE RECEPTOR..." value={form.clienteId || ''} onChange={e => setForm(f => ({ ...f, clienteId: +e.target.value }))}>
                            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre.toUpperCase()}</option>)}
                        </Select>
                        <Select dense label="Oficial de Venta *" placeholder="GESTIONADO POR..." value={form.vendedorId || ''} onChange={e => setForm(f => ({ ...f, vendedorId: +e.target.value }))}>
                            {vendedores.map(u => <option key={u.id} value={u.id}>{u.nombre.toUpperCase()}</option>)}
                        </Select>
                    </div>

                    {/* Financial Details */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <Select dense label="Sucursal de Venta *" placeholder="SELECCIONAR SUCURSAL..." value={form.sucursalId || ''} onChange={e => setForm(f => ({ ...f, sucursalId: +e.target.value }))}>
                            {sucursalesData?.map(s => <option key={s.id} value={s.id}>{s.nombre.toUpperCase()}</option>)}
                        </Select>
                        <Input dense label="Fecha Contable" type="date" value={form.fechaVenta} onChange={e => setForm(f => ({ ...f, fechaVenta: e.target.value }))} />
                        <Input dense label="Precio de Cierre *" type="number" className="font-black" icon={<DollarSign size={16} className="text-accent" />} value={form.precioVenta || ''}
                            onChange={e => setForm(f => ({ ...f, precioVenta: +e.target.value }))} placeholder="0.00" />
                        <Select dense label="Divisa" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}>
                            <option value="ARS">PESOS (ARS)</option>
                            <option value="USD">DÓLARES (USD)</option>
                        </Select>
                        <Select dense label="Modalidad Liquidación" value={form.formaPago} onChange={e => setForm(f => ({ ...f, formaPago: e.target.value as FormaPagoVenta }))}>
                            {Object.entries(formaPagoLabels).map(([k, lbl]) => <option key={k} value={k}>{lbl.toUpperCase()}</option>)}
                        </Select>
                    </div>

                    {/* Payment Breakdown */}
                    <div>
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase text-accent tracking-widest flex items-center gap-2">
                                <DollarSign size={14} /> Desglose de Cobros y Entregas
                            </h3>
                            <Button variant="secondary" size="sm" onClick={handleAddPago}>
                                <Plus size={14} /> Añadir Pago
                            </Button>
                        </div>
                        {form.pagos.map((p, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end p-4">
                                <Input dense containerClassName="md:col-span-3" label="Importe Recibido" type="number" className="font-bold" value={p.monto || ''}
                                    onChange={e => {
                                        const newPagos = [...form.pagos];
                                        newPagos[i].monto = +e.target.value;
                                        setForm(f => ({ ...f, pagos: newPagos }));
                                    }} />
                                <Select dense containerClassName="md:col-span-3" label="Vía Canal" value={p.metodo} onChange={e => {
                                    const newPagos = [...form.pagos];
                                    newPagos[i].metodo = e.target.value as 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'otro';
                                    setForm(f => ({ ...f, pagos: newPagos }));
                                }}>
                                    {Object.entries(metodoLabels).map(([k, lbl]) => <option key={k} value={k}>{lbl.toUpperCase()}</option>)}
                                </Select>
                                <Input dense containerClassName="md:col-span-5" label="Certificación / Tracking" type="text" className="italic" value={p.referencia}
                                    onChange={e => {
                                        const newPagos = [...form.pagos];
                                        newPagos[i].referencia = e.target.value;
                                        setForm(f => ({ ...f, pagos: newPagos }));
                                    }} placeholder="NRO DE RECIBO, CBU, CHEQUE..." />
                                <div className="md:col-span-1">
                                    <button className="w-full flex items-center justify-center text-danger" onClick={() => {
                                        setForm(f => ({ ...f, pagos: f.pagos.filter((_, j) => j !== i) }));
                                    }}>
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Canjes Section */}
                    <div>
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase text-warning tracking-widest flex items-center gap-2">
                                <ArrowRightLeft size={14} /> Permuta / Toma de Activos
                            </h3>
                            <Button variant="secondary" size="sm" onClick={handleAddCanje}>
                                <Plus size={14} /> Incorporar Unidad
                            </Button>
                        </div>
                        {form.canjes.map((c, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end p-4">
                                <Select dense containerClassName="md:col-span-8" label="Vehículo para incorporar al Stock" placeholder="RECONOCIMIENTO DE UNIDAD EXISTENTE..." value={c.vehiculoCanjeId || ''} onChange={e => {
                                    const newCanjes = [...form.canjes];
                                    newCanjes[i].vehiculoCanjeId = +e.target.value;
                                    setForm(f => ({ ...f, canjes: newCanjes }));
                                }}>
                                    {todosVehiculos.map(v => (
                                        <option key={v.id} value={v.id}>{v.marca} {v.modelo} [{v.dominio || `#${v.id}`}]</option>
                                    ))}
                                </Select>
                                <Input dense containerClassName="md:col-span-3" label="Acreditación" type="number" className="font-black text-danger" value={c.valorTomado || ''}
                                    onChange={e => {
                                        const newCanjes = [...form.canjes];
                                        newCanjes[i].valorTomado = +e.target.value;
                                        setForm(f => ({ ...f, canjes: newCanjes }));
                                    }} />
                                <div className="md:col-span-1">
                                    <button className="w-full flex items-center justify-center text-danger" onClick={() => {
                                        setForm(f => ({ ...f, canjes: f.canjes.filter((_, j) => j !== i) }));
                                    }}>
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Textarea dense label="Notas Adicionales (Protocolo de Venta)" rows={2} value={form.observaciones}
                        onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="DETALLES DE GESTORÍA, DOCUMENTACIÓN PENDIENTE..." />

                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-3xs font-black text-muted uppercase tracking-widest mb-1">Impacto de Caja Final</p>
                            <p className="text-3xl font-black">${Number(form.precioVenta || 0).toLocaleString('es-AR')} <span className="text-sm font-normal text-muted">({form.moneda})</span></p>
                        </div>
                        <div className="flex gap-4">
                            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Abortar</Button>
                            <Button variant="primary" className="shadow-glow" onClick={handleCreate} loading={createMutation.isPending}>Acreditar y Cerrar Venta</Button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* DETAIL MODAL (AUDITORÍA) */}
            <Modal
                isOpen={!!selectedDetailId}
                onClose={() => { setSelectedDetailId(null); }}
                title={detail ? `CONTRATO #${String(detail.id).padStart(5, '0')} ` : 'Cargando...'}
                maxWidth="900px"
            >
                {loadingDetail || !detail ? (
                    <div className="text-center"><RefreshCw className="animate-spin text-accent mb-4" size={48} /><p className="text-xs font-black text-muted uppercase tracking-widest">Consolidando expediente de venta...</p></div>
                ) : (
                    <div>
                        <header className="flex justify-between items-start">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center justify-center">
                                    <ShoppingBag size={32} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <Badge variant={entregaStatusMap[detail.estadoEntrega]?.variant ?? 'default'}>
                                            LOGÍSTICA: {entregaStatusMap[detail.estadoEntrega]?.label.toUpperCase()}
                                        </Badge>
                                    </div>
                                    <p className="text-accent font-bold flex items-center gap-2 text-sm">
                                        <Car size={16} /> {detail.vehiculo?.marca?.toUpperCase()} {detail.vehiculo?.modelo?.toUpperCase()} [{detail.vehiculo?.dominio || 'S/DOMINIO'}]
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button className="text-muted" title="Imprimir Recibo">
                                    <Printer size={20} />
                                </button>
                            </div>
                        </header>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                                <span className="text-3xs font-black text-muted uppercase tracking-widest mb-1">Fecha Operación</span>
                                <p className="text-lg font-bold">{new Date(detail.fechaVenta).toLocaleDateString()}</p>
                            </div>
                            <div>
                                <span className="text-3xs font-black text-muted uppercase tracking-widest mb-1">Sucursal Radicación</span>
                                <p className="text-lg font-bold truncate">{detail.sucursal?.nombre || 'CENTRAL'}</p>
                            </div>
                            <div>
                                <span className="text-3xs font-black text-muted uppercase tracking-widest mb-1">Aforo Venta</span>
                                <p className="text-xl font-black text-accent">${Number(detail.precioVenta).toLocaleString('es-AR')}</p>
                            </div>
                            <div>
                                <span className="text-3xs font-black text-muted uppercase tracking-widest mb-1">Modalidad</span>
                                <p className="text-xs font-black uppercase italic">{formaPagoLabels[detail.formaPago] || detail.formaPago}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-xs font-black text-muted uppercase tracking-widest flex items-center gap-2">
                                    <User size={14} className="text-accent" /> Partes Involucradas
                                </h3>
                                <div>
                                    <div>
                                        <span className="text-3xs font-black text-muted mb-1 uppercase">Comprador</span>
                                        <p className="font-bold">{detail.cliente?.nombre?.toUpperCase() || 'N/A'}</p>
                                        <p className="text-xs text-muted">{detail.cliente?.email || 'SIN EMAIL'}</p>
                                    </div>
                                    <div>
                                        <span className="text-3xs font-black text-muted mb-1 uppercase">Responsable Comercial</span>
                                        <p className="font-bold italic">{detail.vendedor?.nombre?.toUpperCase() || 'NO ASIGNADO'}</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xs font-black text-muted uppercase tracking-widest flex items-center gap-2">
                                    <MapPin size={14} className="text-warning" /> Trazabilidad Logística
                                </h3>
                                <div>
                                    {entregaTransitions[detail.estadoEntrega]?.length > 0 ? (
                                        <div>
                                            <p className="text-xs text-secondary italic mb-4">Acciones de auditoría requeridas para el flujo de entrega:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {entregaTransitions[detail.estadoEntrega].map(t => (
                                                    <Button
                                                        key={t.next}
                                                        variant={t.next === 'cancelada' ? 'danger' : t.next === 'entregada' ? 'primary' : 'secondary'}
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => handleEstadoEntrega(detail.id, t.next)}
                                                    >
                                                        {t.label.toUpperCase()}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center p-4 text-center">
                                            <CheckCircle2 size={32} className="text-success mb-2" />
                                            <p className="text-xs font-bold uppercase italic">Ciclo operativo concluido</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-black text-muted uppercase tracking-widest flex items-center gap-2">
                                <DollarSign size={14} className="text-accent" /> Detalle de Ingresos Conciliados
                            </h3>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Identificador</th>
                                            <th>Canal / Vía</th>
                                            <th>Referencia Auditoría</th>
                                            <th style={{ textAlign: 'right' }}>Importe Efectivo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.pagos && detail.pagos.length > 0 ? detail.pagos.map((p) => (
                                            <tr key={p.id}>
                                                <td className="font-mono text-3xs text-muted">PAG-{p.id}</td>
                                                <td><Badge variant="default">{metodoLabels[p.metodo]?.toUpperCase() || p.metodo.toUpperCase()}</Badge></td>
                                                <td className="text-xs italic text-muted">{p.referencia || '-'}</td>
                                                <td style={{ textAlign: 'right' }} className="font-black">${Number(p.monto).toLocaleString('es-AR')}</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan={4} className="text-center text-xs italic text-muted">No se registran pagos individuales (Ingreso Contado Total)</td></tr>
                                        )}
                                        {detail.canjes?.map((c) => (
                                            <tr key={c.id}>
                                                <td className="font-mono text-3xs text-warning">CAN-{c.id}</td>
                                                <td><Badge variant="warning">TOMA UNIDAD</Badge></td>
                                                <td className="text-xs italic font-bold uppercase">ID-VEHÍCULO: {c.vehiculoCanjeId}</td>
                                                <td style={{ textAlign: 'right' }} className="font-black text-warning">-${Number(c.valorTomado).toLocaleString('es-AR')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {detail.observaciones && (
                            <div className="italic text-xs text-secondary">
                                <span className="font-black text-muted mb-2 uppercase tracking-widest">Anotaciones de Auditoría:</span>
                                "{detail.observaciones}"
                            </div>
                        )}

                        {/* Facturación electrónica AFIP */}
                        <VentaFacturaPanel ventaId={detail.id} />

                        {/* Sub-recursos: Pagos, Extras, Canjes */}
                        <div>
                            <h3 className="text-xs font-black text-muted uppercase tracking-widest flex items-center gap-2">
                                <DollarSign size={14} className="text-accent" /> Gestión de Sub-recursos
                            </h3>
                            <VentaSubResources ventaId={detail.id} />
                        </div>
                    </div>
                )}
            </Modal>

        </div>
    );
};

export default VentasPage;
