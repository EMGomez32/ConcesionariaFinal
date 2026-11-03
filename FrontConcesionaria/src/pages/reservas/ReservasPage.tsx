import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { reservasApi, type Reserva } from '../../api/reservas.api';
import { vehiculosApi } from '../../api/vehiculos.api';
import { sucursalesApi } from '../../api/sucursales.api';
import { clientesApi } from '../../api/clientes.api';
import { usuariosApi } from '../../api/usuarios.api';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import DataTable, { type Column } from '../../components/ui/DataTable';
import PageTitle from '../../components/ui/PageTitle';
import { getList } from '../../utils/lista';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { Plus, Search, RefreshCw, Bookmark, Eye, XCircle, X } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { formatFecha, hoyLocal } from '../../utils/fecha';
import { formatMoneda } from '../../utils/moneda';
import { RESERVA_ESTADO, rotuloEstado } from '../../components/ventas/estados';
import { useFiltrosUrl } from '../../components/ventas/useFiltrosUrl';
import type { PaginatedResponse } from '../../types/api.types';

/** Usuario actual como vendedor por defecto, si tiene ese rol. */
const vendedorPorDefecto = (): string => {
    const u = useAuthStore.getState().user;
    return u?.roles?.includes('vendedor') ? String(u.id) : '';
};

const emptyForm = () => ({
    vehiculoId: '',
    clienteId: '',
    vendedorId: vendedorPorDefecto(),
    sucursalId: '',
    monto: '',
    moneda: 'ARS' as 'ARS' | 'USD',
    fechaVencimiento: '',
    observaciones: '',
});

/** Vence en los próximos 3 días (comparando fechas de calendario, sin corrimiento de zona). */
const isVencimientoProximo = (fecha: string) => {
    const vence = fecha.slice(0, 10);
    const hoy = hoyLocal();
    const en3 = hoyLocal(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
    return vence >= hoy && vence <= en3;
};

const ReservasPage = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { addToast } = useUIStore();
    // Tomar una seña y cancelarla son las dos caras del mismo trabajo del vendedor
    // (el cliente se arrepiente y la unidad vuelve a `publicado`), y las dos van por
    // rutas admin+vendedor. Lo que no puede es verlas `lectura`. Ver usePermisos.ts.
    const permisos = usePermisos();

    // Filtros, búsqueda y página en la URL (sobreviven a entrar a una reserva y volver).
    const { filtros, q, busqueda, setBusqueda, page, setPage, setFiltro, limpiar, hayFiltros } =
        useFiltrosUrl(['estado', 'sucursalId'] as const);

    // Catalog data
    const [sucursales, setSucursales] = useState<{ id: number; nombre: string }[]>([]);
    const [vehiculos, setVehiculos] = useState<{ id: number; marca: string; modelo: string; version?: string; dominio?: string; sucursalId?: number }[]>([]);
    const [clientes, setClientes] = useState<{ id: number; nombre: string }[]>([]);
    const [usuarios, setUsuarios] = useState<{ id: number; nombre: string }[]>([]);
    const [catalogoError, setCatalogoError] = useState<string | null>(null);

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    // Cancel confirm
    const [cancelingId, setCancelingId] = useState<number | null>(null);
    const [cancelLoading, setCancelLoading] = useState(false);

    // Catálogos. Antes cada uno tenía un `.catch(() => {})`: si fallaba, el
    // select quedaba vacío y nadie sabía por qué.
    useEffect(() => {
        const fallos: string[] = [];
        const cargar = <T,>(p: Promise<unknown>, set: (v: T[]) => void, nombre: string) =>
            p.then((res) => set(getList<T>(res))).catch(() => { fallos.push(nombre); });
        Promise.all([
            cargar(sucursalesApi.getAll(), setSucursales, 'sucursales'),
            cargar(vehiculosApi.getAll({ estado: 'publicado' }, { limit: 1000 }), setVehiculos, 'vehículos'),
            cargar(clientesApi.getAll({}, { limit: 1000 }), setClientes, 'clientes'),
            cargar(usuariosApi.getAll({}, { limit: 1000 }), setUsuarios, 'vendedores'),
        ]).then(() => {
            if (fallos.length) setCatalogoError(`No se pudieron cargar: ${fallos.join(', ')}. Recargá la página para reintentar.`);
        });
    }, []);

    // Listado: la búsqueda la resuelve el backend (contrato 1).
    const listaQuery = useQuery({
        queryKey: ['reservas', 'list', { q, ...filtros, page }],
        queryFn: async () => {
            const params: Record<string, string | number> = { page, limit: 15 };
            if (filtros.estado) params.estado = filtros.estado;
            if (filtros.sucursalId) params.sucursalId = filtros.sucursalId;
            if (q) params.q = q;
            return await reservasApi.getAll(params) as unknown as PaginatedResponse<Reserva>;
        },
        placeholderData: keepPreviousData,
    });
    const reservas = listaQuery.data?.results ?? [];
    const total = listaQuery.data?.totalResults ?? 0;
    const recargar = () => queryClient.invalidateQueries({ queryKey: ['reservas'] });

    const openModal = () => {
        setForm(emptyForm());
        setFormError('');
        setShowModal(true);
    };

    /** Al elegir la unidad se precarga su sucursal. */
    const elegirUnidad = (vehiculoId: string) => {
        const v = vehiculos.find(x => String(x.id) === vehiculoId);
        setForm(f => ({ ...f, vehiculoId, ...(v?.sucursalId ? { sucursalId: String(v.sucursalId) } : {}) }));
    };

    const handleSubmit = async () => {
        const { vehiculoId, clienteId, vendedorId, sucursalId, monto, moneda, fechaVencimiento } = form;
        if (!vehiculoId || !clienteId || !vendedorId || !sucursalId || !monto || !fechaVencimiento) {
            setFormError('Completá todos los campos con *.');
            return;
        }
        setSaving(true);
        setFormError('');
        try {
            await reservasApi.create({
                vehiculoId: Number(vehiculoId),
                clienteId: Number(clienteId),
                vendedorId: Number(vendedorId),
                sucursalId: Number(sucursalId),
                monto: Number(monto),
                moneda,
                fechaVencimiento: new Date(fechaVencimiento).toISOString(),
                observaciones: form.observaciones || undefined,
            });
            addToast('Reserva creada', 'success');
            setShowModal(false);
            setPage(1);
            recargar();
        } catch (e: unknown) {
            setFormError(getErrorMessage(e, 'No se pudo crear la reserva'));
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = async () => {
        if (!cancelingId) return;
        setCancelLoading(true);
        try {
            await reservasApi.update(cancelingId, { estado: 'cancelada' });
            addToast('Reserva cancelada. La unidad volvió a Publicado.', 'success');
            setCancelingId(null);
            recargar();
        } catch (e: unknown) {
            addToast(getErrorMessage(e, 'No se pudo cancelar la reserva'), 'error');
        } finally {
            setCancelLoading(false);
        }
    };

    const columns: Column<Reserva>[] = [
        {
            header: 'N°',
            accessor: (r) => <span className="font-mono text-xs font-bold">{r.id}</span>,
        },
        {
            header: 'Unidad',
            accessor: (r) => (
                <div className="flex flex-col">
                    <span className="font-bold text-sm">{r.vehiculo ? `${r.vehiculo.marca} ${r.vehiculo.modelo}` : `Unidad #${r.vehiculoId}`}</span>
                    <span className="text-xs text-muted">{r.vehiculo?.dominio || 'Sin dominio'}</span>
                </div>
            ),
        },
        { header: 'Cliente', accessor: (r) => <span className="text-sm">{r.cliente?.nombre ?? '-'}</span> },
        { header: 'Sucursal', accessor: (r) => <span className="text-sm text-muted">{r.sucursal?.nombre ?? '-'}</span> },
        {
            header: 'Seña',
            align: 'right',
            accessor: (r) => <span className="font-bold tabular-nums" style={{ whiteSpace: 'nowrap' }}>{formatMoneda(r.monto, r.moneda)}</span>,
        },
        {
            header: 'Vence',
            accessor: (r) => {
                const proximo = r.estado === 'activa' && !!r.fechaVencimiento && isVencimientoProximo(r.fechaVencimiento);
                return (
                    <div className="flex items-center gap-2">
                        <span className="text-sm tabular-nums">{formatFecha(r.fechaVencimiento)}</span>
                        {proximo && <Badge variant="warning">Vence pronto</Badge>}
                    </div>
                );
            },
        },
        {
            header: 'Estado',
            accessor: (r) => {
                const e = rotuloEstado(RESERVA_ESTADO, r.estado);
                return <Badge variant={e.variant}>{e.label}</Badge>;
            },
        },
        {
            header: 'Acciones',
            align: 'right',
            accessor: (r) => (
                <div className="flex justify-end gap-1">
                    <button type="button" className="icon-btn" title="Ver detalle" aria-label={`Ver la reserva ${r.id}`}
                        onClick={(e) => { e.stopPropagation(); navigate(`/reservas/${r.id}`); }}>
                        <Eye size={15} />
                    </button>
                    {r.estado === 'activa' && permisos.reservasOperar && (
                        <button type="button" className="icon-btn danger" title="Cancelar reserva" aria-label={`Cancelar la reserva ${r.id}`}
                            onClick={(e) => { e.stopPropagation(); setCancelingId(r.id); }}>
                            <XCircle size={15} />
                        </button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Reservas" />
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary">
                            <Bookmark size={20} />
                        </div>
                        <h1>Reservas</h1>
                    </div>
                    <p>
                        Señas tomadas sobre unidades del stock
                        {listaQuery.isSuccess ? ` · ${total} ${total === 1 ? 'reserva' : 'reservas'}${hayFiltros ? ' con estos filtros' : ''}` : ''}.
                    </p>
                </div>
                <div className="header-actions">
                    <Button variant="secondary" onClick={() => recargar()} aria-label="Actualizar listado" title="Actualizar listado">
                        <RefreshCw size={18} className={listaQuery.isFetching ? 'animate-spin' : ''} />
                    </Button>
                    {permisos.reservasOperar && (
                        <Button data-tour="res-nueva" variant="primary" onClick={openModal}>
                            <Plus size={16} /> Nueva reserva
                        </Button>
                    )}
                </div>
            </header>

            {catalogoError && (
                <div className="uploader-alert uploader-alert-error" role="alert">{catalogoError}</div>
            )}

            {/* Filtros */}
            <div className="filters-bar" data-tour="res-filtros">
                <div className="search-box">
                    <Search size={18} className="text-muted" aria-hidden="true" />
                    <input
                        type="search"
                        placeholder="Buscar por cliente, DNI, dominio, marca, modelo o N°"
                        aria-label="Buscar reservas"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                    />
                </div>
                <select aria-label="Filtrar por estado" value={filtros.estado} onChange={e => setFiltro('estado', e.target.value)}>
                    <option value="">Estado: todos</option>
                    {Object.entries(RESERVA_ESTADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select aria-label="Filtrar por sucursal" value={filtros.sucursalId} onChange={e => setFiltro('sucursalId', e.target.value)}>
                    <option value="">Sucursal: todas</option>
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <Button variant="ghost" onClick={limpiar} disabled={!hayFiltros}>
                    <X size={16} /> Limpiar filtros
                </Button>
            </div>

            <div data-tour="res-tabla">
                <DataTable
                    columns={columns}
                    data={reservas}
                    isLoading={listaQuery.isLoading}
                    isError={listaQuery.isError}
                    errorMessage="No se pudieron cargar las reservas"
                    onRetry={() => listaQuery.refetch()}
                    onRowClick={(r) => navigate(`/reservas/${r.id}`)}
                    currentPage={page}
                    totalPages={listaQuery.data?.totalPages ?? 1}
                    onPageChange={setPage}
                    emptyMessage={hayFiltros
                        ? 'Ninguna reserva coincide con la búsqueda o los filtros'
                        : 'Todavía no hay reservas. Tomá la primera seña con «Nueva reserva».'}
                    emptyIcon={<Bookmark size={40} className="dt-empty-icon" />}
                    onClearFilters={hayFiltros ? limpiar : undefined}
                />
            </div>

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title="Nueva reserva"
                subtitle="La unidad queda reservada hasta la fecha de vencimiento. Los campos con * son obligatorios."
                maxWidth="620px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSubmit} loading={saving}>
                            <Plus size={14} /> Crear reserva
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Select dense label="Unidad *" hint="Sólo se pueden reservar unidades publicadas." placeholder="Elegí la unidad" value={form.vehiculoId} onChange={e => elegirUnidad(e.target.value)}>
                            {vehiculos.map(v => (
                                <option key={v.id} value={v.id}>
                                    {v.marca} {v.modelo} {v.version ? `${v.version} ` : ''}{v.dominio ? `— ${v.dominio}` : ''}
                                </option>
                            ))}
                        </Select>
                    </div>

                    <Select dense label="Cliente *" placeholder="Elegí el cliente" options={clientes.map(c => ({ value: c.id, label: c.nombre }))} value={form.clienteId} onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))} />

                    <Select dense label="Vendedor *" placeholder="Elegí el vendedor" options={usuarios.map(u => ({ value: u.id, label: u.nombre }))} value={form.vendedorId} onChange={e => setForm(f => ({ ...f, vendedorId: e.target.value }))} />

                    <Select dense label="Sucursal *" placeholder="Elegí la sucursal" options={sucursales.map(s => ({ value: s.id, label: s.nombre }))} value={form.sucursalId} onChange={e => setForm(f => ({ ...f, sucursalId: e.target.value }))} />

                    <Input dense label="Vence el *" type="date" min={hoyLocal()} value={form.fechaVencimiento} onChange={e => setForm(f => ({ ...f, fechaVencimiento: e.target.value }))} />

                    <Input dense label="Monto de la seña *" type="number" min="0" placeholder="0" className="tabular-nums" value={form.monto}
                        onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                        hint={form.monto ? formatMoneda(form.monto, form.moneda) : undefined} />

                    <Select dense label="Moneda *" value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}>
                        <option value="ARS">Pesos ($)</option>
                        <option value="USD">Dólares (US$)</option>
                    </Select>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <Textarea dense label="Observaciones" rows={3} placeholder="Opcional" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
                    </div>

                    {formError && (
                        <div className="uploader-alert uploader-alert-error" style={{ gridColumn: '1 / -1' }} role="alert">
                            <span>{formError}</span>
                        </div>
                    )}
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={cancelingId !== null}
                title="Cancelar reserva"
                message={`¿Cancelar la reserva N° ${cancelingId}? La unidad vuelve a estar publicada para la venta.`}
                confirmLabel="Cancelar reserva"
                cancelLabel="Volver"
                type="danger"
                onConfirm={handleCancel}
                onCancel={() => setCancelingId(null)}
                loading={cancelLoading}
            />
        </div>
    );
};

export default ReservasPage;
