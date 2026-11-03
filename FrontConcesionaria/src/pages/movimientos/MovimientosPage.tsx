import { useState, useMemo, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { vehiculoMovimientosApi, type VehiculoMovimiento } from '../../api/vehiculo-movimientos.api';
import { proveedoresApi } from '../../api/proveedores.api';
import { useVehiculos } from '../../hooks/useVehiculos';
import { useSucursales } from '../../hooks/useSucursales';
import { TIPOS_PROVEEDOR } from '../../constants/proveedorTipos';
import { useUIStore } from '../../store/uiStore';
import Badge, { type BadgeVariant } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import PageTitle from '../../components/ui/PageTitle';
import { Listado, ListadoTabla, CampoFiltro, type ColumnaListado } from '../../components/listado';
import { Plus, RefreshCw, ArrowLeftRight, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { usePermisos } from '../../hooks/usePermisos';
import { hoyLocal } from '../../utils/fecha';
import { getList } from '../../utils/lista';
import { extractPaginatedData } from '../../utils/apiHelpers';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { descripcionVehiculo } from '../vehiculos/vehiculoTextos';

const TIPO_MOVIMIENTO: Record<string, { label: string; variant: BadgeVariant }> = {
    traslado: { label: 'Traslado', variant: 'info' },
    preparacion: { label: 'Preparación', variant: 'violet' },
    ingreso: { label: 'Ingreso al stock', variant: 'success' },
    egreso: { label: 'Salida del stock', variant: 'danger' },
    asignacion_reserva: { label: 'Reserva asignada', variant: 'warning' },
    liberacion_reserva: { label: 'Reserva liberada', variant: 'default' },
};

// Un tipo nuevo del backend nunca se muestra crudo ("algo_nuevo" → "Algo nuevo").
const tipoMovimiento = (tipo: string) => TIPO_MOVIMIENTO[tipo] ?? {
    label: tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1).replace(/_/g, ' ') : 'Movimiento',
    variant: 'default' as BadgeVariant,
};

const fechaCorta = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR') : 'Sin fecha');

const EMPTY_FORM = {
    vehiculoId: '',
    modalidad: 'traslado',        // 'traslado' | 'preparacion'
    hastaSucursalId: '',
    proveedorDestinoId: '',       // a qué proveedor externo va la unidad
    motivo: '',
    fechaMovimiento: hoyLocal(),
};

const LIMIT = 15;

const MovimientosPage = () => {
    const { addToast } = useUIStore();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    // El circuito está partido a propósito: despachar la unidad a un proveedor es
    // acondicionamiento de stock (admin/vendedor), recibirla de vuelta es taller
    // (además, postventa). Ver hooks/usePermisos.ts. Antes la pantalla mostraba los
    // dos botones a todos —postventa y `lectura` incluidos— y el 403 llegaba
    // después de completar el formulario entero.
    const permisos = usePermisos();

    const [page, setPage] = useState(1);
    const [filterVehiculo, setFilterVehiculo] = useState('');
    const [filterDesde, setFilterDesde] = useState('');
    const [filterHasta, setFilterHasta] = useState('');

    // Catálogos. Los hooks/`getList` cubren las distintas formas de respuesta
    // (antes un catch vacío tragaba cualquier error y los selects quedaban vacíos).
    const { data: sucursales = [] } = useSucursales();
    const { data: vehiculosPayload } = useVehiculos({}, { limit: 1000 });
    const vehiculos = getList<{ id: number; marca: string; modelo: string; version?: string; dominio?: string }>(vehiculosPayload);
    // Sólo proveedores activos: a un proveedor dado de baja no se le puede mandar una unidad.
    const { data: provPayload } = useQuery({
        queryKey: ['proveedores', 'activos'],
        queryFn: () => proveedoresApi.getAll({ activo: true }, { limit: 500 }),
    });
    const proveedores = useMemo(
        () => getList<{ id: number; nombre: string; tipo?: string; activo?: boolean }>(provPayload),
        [provPayload],
    );

    const params = {
        page,
        limit: LIMIT,
        vehiculoId: filterVehiculo ? Number(filterVehiculo) : undefined,
        desdeSucursalId: filterDesde ? Number(filterDesde) : undefined,
        hastaSucursalId: filterHasta ? Number(filterHasta) : undefined,
    };
    const { data, isLoading, isFetching, isError, refetch } = useQuery({
        queryKey: ['vehiculo-movimientos', 'list', params],
        queryFn: async () => extractPaginatedData<VehiculoMovimiento>(await vehiculoMovimientosApi.getAll(params)),
        placeholderData: keepPreviousData,
    });
    const movimientos = data?.results ?? [];
    const totalPages = data?.totalPages ?? 1;
    const totalResults = data?.totalResults ?? 0;
    const recargar = () => queryClient.invalidateQueries({ queryKey: ['vehiculo-movimientos'] });

    const filtrosActivos = [filterVehiculo, filterDesde, filterHasta].filter(Boolean).length;
    const limpiarFiltros = () => {
        setFilterVehiculo('');
        setFilterDesde('');
        setFilterHasta('');
        setPage(1);
    };
    const cambiarFiltro = (set: (v: string) => void) => (e: ChangeEvent<HTMLSelectElement>) => {
        set(e.target.value);
        setPage(1);
    };

    const [retornandoId, setRetornandoId] = useState<number | null>(null);
    const handleRetorno = async (id: number) => {
        setRetornandoId(id);
        try {
            await vehiculoMovimientosApi.marcarRetorno(id);
            addToast('Retorno de preparación registrado', 'success');
            recargar();
        } catch (err) {
            addToast(getErrorMessage(err, 'No se pudo registrar el retorno'), 'error');
        } finally {
            setRetornandoId(null);
        }
    };

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    // A un auto se lo manda a un taller, lavadero, etc.: no a una importadora
    // ni a una financiera. Se agrupan por tipo para encontrarlos rápido.
    const destinosPorTipo = useMemo(() => {
        return TIPOS_PROVEEDOR
            .filter(t => t.esDestinoDePreparacion)
            .map(t => ({
                tipo: t.value,
                label: t.label,
                proveedores: proveedores.filter(p => p.tipo === t.value),
            }))
            .filter(g => g.proveedores.length > 0);
    }, [proveedores]);

    const openModal = () => {
        setForm({ ...EMPTY_FORM, fechaMovimiento: hoyLocal() });
        setFormError('');
        setShowModal(true);
    };

    const handleSubmit = async () => {
        const esTraslado = form.modalidad === 'traslado';

        if (!form.vehiculoId) { setFormError('Elegí la unidad.'); return; }
        if (esTraslado && !form.hastaSucursalId) { setFormError('Elegí la sucursal de destino.'); return; }
        if (!esTraslado && !form.proveedorDestinoId) { setFormError('Elegí el proveedor de destino.'); return; }

        setSaving(true);
        setFormError('');
        try {
            const payload: {
                vehiculoId: number; tipo: 'traslado' | 'preparacion';
                hastaSucursalId?: number; proveedorDestinoId?: number; motivo?: string; fechaMovimiento?: string;
            } = { vehiculoId: Number(form.vehiculoId), tipo: esTraslado ? 'traslado' : 'preparacion' };

            if (esTraslado) payload.hastaSucursalId = Number(form.hastaSucursalId);
            else payload.proveedorDestinoId = Number(form.proveedorDestinoId);
            if (form.motivo) payload.motivo = form.motivo;
            if (form.fechaMovimiento) payload.fechaMovimiento = new Date(form.fechaMovimiento).toISOString();

            await vehiculoMovimientosApi.create(payload);
            addToast(esTraslado ? 'Traslado registrado' : 'Envío a preparación registrado', 'success');
            setShowModal(false);
            setPage(1);
            recargar();
        } catch (e: unknown) {
            setFormError(getErrorMessage(e, 'No se pudo registrar el movimiento'));
        } finally {
            setSaving(false);
        }
    };

    const nombreUnidad = (m: VehiculoMovimiento) =>
        m.vehiculo ? `${m.vehiculo.marca} ${m.vehiculo.modelo}` : `Unidad #${m.vehiculoId}`;

    const columnas: ColumnaListado<VehiculoMovimiento>[] = [
        {
            clave: 'unidad',
            titulo: 'Unidad',
            flexible: true,
            tarjeta: 'titulo',
            celda: (m) => (
                <>
                    <span className="listado-principal">{nombreUnidad(m)}</span>
                    <span className="listado-secundario">{m.vehiculo ? descripcionVehiculo(m.vehiculo) : 'Sin datos de la unidad'}</span>
                </>
            ),
        },
        {
            clave: 'tipo',
            titulo: 'Movimiento',
            celda: (m) => {
                const t = tipoMovimiento(m.tipo);
                return <Badge variant={t.variant}>{t.label}</Badge>;
            },
        },
        {
            clave: 'recorrido',
            titulo: 'Desde → hacia',
            celda: (m) => (
                <span className="listado-nowrap" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span className="text-muted">{m.desdeSucursal?.nombre ?? 'Sin origen'}</span>
                    <ArrowRight size={12} aria-label="hacia" />
                    {/* `destino` es texto libre de movimientos viejos, previos a que
                        el destino pasara a ser un proveedor. */}
                    <span>{m.hastaSucursal?.nombre ?? m.proveedorDestino?.nombre ?? m.destino ?? 'Venta'}</span>
                </span>
            ),
        },
        {
            clave: 'fecha',
            titulo: 'Fecha',
            celda: (m) => <span className="listado-nowrap">{fechaCorta(m.fecha ?? m.createdAt)}</span>,
        },
        {
            clave: 'motivo',
            titulo: 'Motivo',
            celda: (m) => (
                m.motivo
                    ? <span className="listado-secundario" style={{ fontSize: 'var(--text-sm)', maxWidth: '24ch' }} title={m.motivo}>{m.motivo}</span>
                    : <span className="text-muted">Sin motivo</span>
            ),
        },
        {
            clave: 'registro',
            titulo: 'Registró',
            celda: (m) => <span className="listado-nowrap">{m.registradoPor?.nombre ?? 'Automático'}</span>,
        },
        {
            clave: 'estado',
            titulo: 'Estado',
            alinear: 'right',
            tarjeta: 'acciones',
            celda: (m) => {
                if (m.tipo !== 'preparacion') return <span className="text-muted">—</span>;
                if (m.fechaRetorno) {
                    return <Badge variant="success" title={`Volvió el ${fechaCorta(m.fechaRetorno)}`}>Volvió el {fechaCorta(m.fechaRetorno)}</Badge>;
                }
                return (
                    <div className="listado-acciones-fila">
                        <Badge variant="warning">En preparación</Badge>
                        {permisos.movimientosMarcarRetorno && (
                            <Button variant="secondary" size="sm" loading={retornandoId === m.id} onClick={() => handleRetorno(m.id)}>
                                <CheckCircle2 size={14} aria-hidden="true" /> Marcar retorno
                            </Button>
                        )}
                    </div>
                );
            },
        },
    ];

    const nuevoMovimiento = permisos.movimientosCrear ? (
        <Button variant="primary" onClick={openModal}>
            <Plus size={18} aria-hidden="true" /> Nuevo movimiento
        </Button>
    ) : undefined;

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Movimientos" />
            <Listado
                titulo="Movimientos"
                subtitulo="Traslados entre sucursales y envíos a preparación"
                icono={<ArrowLeftRight size={22} />}
                clave="movimientos"
                acciones={(
                    <Button variant="secondary" className="btn-icono" onClick={() => refetch()} disabled={isFetching} aria-label="Actualizar la lista" title="Actualizar">
                        <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
                    </Button>
                )}
                accionPrincipal={nuevoMovimiento}
                filtrosActivos={filtrosActivos}
                onLimpiarFiltros={limpiarFiltros}
                resumen={!isLoading && !isError ? `${totalResults} ${totalResults === 1 ? 'movimiento' : 'movimientos'}` : undefined}
                filtros={(
                    <>
                        <CampoFiltro etiqueta="Unidad">
                            <select className="form-input" value={filterVehiculo} onChange={cambiarFiltro(setFilterVehiculo)}>
                                <option value="">Todas las unidades</option>
                                {vehiculos.map(v => <option key={v.id} value={v.id}>{`${v.marca} ${v.modelo}${v.dominio ? ` (${v.dominio})` : ''}`}</option>)}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Desde">
                            <select className="form-input" value={filterDesde} onChange={cambiarFiltro(setFilterDesde)}>
                                <option value="">Cualquier sucursal</option>
                                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Hacia">
                            <select className="form-input" value={filterHasta} onChange={cambiarFiltro(setFilterHasta)}>
                                <option value="">Cualquier sucursal</option>
                                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>
                        </CampoFiltro>
                    </>
                )}
            >
                <ListadoTabla
                    etiqueta="Movimientos"
                    columnas={columnas}
                    filas={movimientos}
                    cargando={isLoading}
                    error={isError}
                    mensajeError="No se pudieron cargar los movimientos"
                    onReintentar={() => refetch()}
                    hayFiltros={filtrosActivos > 0}
                    onLimpiarFiltros={limpiarFiltros}
                    vacio={{
                        titulo: 'Todavía no hay movimientos',
                        descripcion: 'Cuando trasladás una unidad a otra sucursal o la mandás a preparación, queda registrado acá.',
                        icono: <ArrowLeftRight size={32} aria-hidden="true" />,
                        accion: nuevoMovimiento,
                    }}
                    onFilaClick={(m) => navigate(`/vehiculos/${m.vehiculoId}`)}
                    etiquetaFila={(m) => `Abrir la ficha de ${nombreUnidad(m)}`}
                    pagina={page}
                    totalPaginas={totalPages}
                    onPaginaChange={setPage}
                />
            </Listado>

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title="Nuevo movimiento"
                subtitle="Trasladá la unidad a otra sucursal o enviala a preparación (mecánico, lavadero, chapa y pintura, etc.)."
                maxWidth="680px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSubmit} loading={saving}>
                            <ArrowLeftRight size={16} aria-hidden="true" />
                            Registrar movimiento
                        </Button>
                    </>
                }
            >
                <div>
                    <Select
                        dense
                        label="Unidad *"
                        placeholder="Elegí la unidad"
                        options={vehiculos.map(v => ({
                            value: v.id,
                            label: `${v.marca} ${v.modelo}${v.version ? ` ${v.version}` : ''} (${v.dominio || 'sin dominio'})`,
                        }))}
                        value={form.vehiculoId}
                        onChange={e => setForm(f => ({ ...f, vehiculoId: e.target.value }))}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Select dense label="Tipo de movimiento *" value={form.modalidad} onChange={e => setForm(f => ({ ...f, modalidad: e.target.value }))}>
                            <option value="traslado">Traslado a otra sucursal</option>
                            <option value="preparacion">Enviar a preparación</option>
                        </Select>
                        <Input dense label="Fecha" type="date" value={form.fechaMovimiento} onChange={e => setForm(f => ({ ...f, fechaMovimiento: e.target.value }))} />
                    </div>

                    {form.modalidad === 'traslado' ? (
                        <Select
                            dense
                            label="Sucursal de destino *"
                            placeholder="Elegí la sucursal"
                            options={sucursales.map(s => ({ value: s.id, label: s.nombre }))}
                            value={form.hastaSucursalId}
                            onChange={e => setForm(f => ({ ...f, hastaSucursalId: e.target.value }))}
                        />
                    ) : (
                        <div>
                            <Select
                                dense
                                label="Proveedor de destino *"
                                placeholder="Elegí el proveedor"
                                value={form.proveedorDestinoId}
                                onChange={e => setForm(f => ({ ...f, proveedorDestinoId: e.target.value }))}
                            >
                                {destinosPorTipo.map(grupo => (
                                    <optgroup key={grupo.tipo} label={grupo.label}>
                                        {grupo.proveedores.map(p => (
                                            <option key={p.id} value={p.id}>{p.nombre}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </Select>
                            {destinosPorTipo.length === 0 && (
                                <p className="text-xs text-muted" style={{ marginTop: '0.5rem' }}>
                                    No hay proveedores activos a los que enviar la unidad.{' '}
                                    <Link to="/proveedores" style={{ color: 'var(--accent)', fontWeight: 700 }}>Dar de alta un proveedor</Link>
                                </p>
                            )}
                        </div>
                    )}

                    <Textarea dense label="Motivo o notas" rows={3} placeholder="Ej: la pide la sucursal Norte para una reserva" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} style={{ resize: 'none' }} />

                    {formError && (
                        <div className="uploader-alert uploader-alert-error" role="alert">
                            <AlertCircle size={14} aria-hidden="true" />
                            <span>{formError}</span>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default MovimientosPage;
