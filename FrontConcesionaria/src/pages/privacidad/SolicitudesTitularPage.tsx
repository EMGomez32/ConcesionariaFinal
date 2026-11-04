import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileLock2, Plus, CircleAlert, Pencil } from 'lucide-react';
import PageTitle from '../../components/ui/PageTitle';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import Select from '../../components/ui/Select';
import Combobox, { type ComboboxOption } from '../../components/ui/Combobox';
import { Listado, ListadoTabla, CampoFiltro, type ColumnaListado } from '../../components/listado';
import {
    privacidadApi,
    TIPO_SOLICITUD_LABEL,
    PLAZO_SOLICITUD_LABEL,
    ESTADO_SOLICITUD_META,
    type SolicitudTitular,
    type TipoSolicitudTitular,
    type EstadoSolicitudTitular,
} from '../../api/privacidad.api';
import { clientesApi } from '../../api/clientes.api';
import { useUIStore } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatFecha, hoyLocal } from '../../utils/fecha';

/**
 * PEDIDOS DE TITULARES (Ley 25.326, arts. 14 a 16) — el registro que permite demostrar
 * que cada pedido de acceso, rectificación, supresión, bloqueo u oposición se atendió y
 * a tiempo. El vencimiento lo calcula el servidor al registrarlo (10 días corridos el
 * acceso, 5 hábiles el resto) y la lista se ordena por vencimiento: lo primero es lo
 * que vence antes. Los vencidos sin cerrar se marcan en rojo.
 */

const TIPOS = Object.keys(TIPO_SOLICITUD_LABEL) as TipoSolicitudTitular[];
const ESTADOS = Object.keys(ESTADO_SOLICITUD_META) as EstadoSolicitudTitular[];

const textoPlazo = (s: SolicitudTitular): string => {
    if (s.diasRestantes === null) return formatFecha(s.venceEl);
    if (s.diasRestantes < 0) return `${formatFecha(s.venceEl)} · venció hace ${-s.diasRestantes} día(s)`;
    if (s.diasRestantes === 0) return `${formatFecha(s.venceEl)} · vence hoy`;
    return `${formatFecha(s.venceEl)} · faltan ${s.diasRestantes} día(s)`;
};

export default function SolicitudesTitularPage() {
    const { addToast } = useUIStore();
    const navigate = useNavigate();

    const [filas, setFilas] = useState<SolicitudTitular[]>([]);
    const [vencidas, setVencidas] = useState(0);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(false);
    const [pagina, setPagina] = useState(1);
    const [totalPaginas, setTotalPaginas] = useState(1);
    const [total, setTotal] = useState(0);
    // Por defecto se ve lo que hay que atender: las abiertas.
    const [filtroEstado, setFiltroEstado] = useState<'abiertas' | '' | EstadoSolicitudTitular>('abiertas');
    const [filtroTipo, setFiltroTipo] = useState<'' | TipoSolicitudTitular>('');

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const res = await privacidadApi.listarSolicitudes({
                page: pagina,
                limit: 50,
                abiertas: filtroEstado === 'abiertas' ? true : undefined,
                estado: filtroEstado && filtroEstado !== 'abiertas' ? filtroEstado : undefined,
                tipo: filtroTipo || undefined,
            });
            setFilas(res.results);
            setVencidas(res.vencidas);
            setTotalPaginas(res.totalPages || 1);
            setTotal(res.totalResults);
            setError(false);
        } catch {
            setError(true);
        } finally {
            setCargando(false);
        }
    }, [pagina, filtroEstado, filtroTipo]);

    useEffect(() => { cargar(); }, [cargar]);

    // ── Alta ────────────────────────────────────────────────────────────────
    const [altaAbierta, setAltaAbierta] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [nTipo, setNTipo] = useState<TipoSolicitudTitular>('acceso');
    const [nNombre, setNNombre] = useState('');
    const [nCliente, setNCliente] = useState<number | null>(null);
    const [nCanal, setNCanal] = useState('');
    const [nDetalle, setNDetalle] = useState('');
    const [nRecibida, setNRecibida] = useState(hoyLocal());
    const [opcionesCliente, setOpcionesCliente] = useState<ComboboxOption[]>([]);
    const [buscandoCliente, setBuscandoCliente] = useState(false);

    const abrirAlta = () => {
        setNTipo('acceso'); setNNombre(''); setNCliente(null); setNCanal(''); setNDetalle(''); setNRecibida(hoyLocal());
        setOpcionesCliente([]);
        setAltaAbierta(true);
    };

    const buscarCliente = async (texto: string) => {
        if (texto.trim().length < 2) { setOpcionesCliente([]); return; }
        setBuscandoCliente(true);
        try {
            const res = await clientesApi.getAll({ search: texto.trim() }, { limit: 10 });
            setOpcionesCliente(res.results.map((c) => ({ value: c.id, label: c.nombre, sub: [c.dni, c.telefono].filter(Boolean).join(' · ') || undefined })));
        } catch {
            setOpcionesCliente([]);
        } finally {
            setBuscandoCliente(false);
        }
    };

    const guardarAlta = async () => {
        if (nNombre.trim().length < 2) { addToast('Escribí el nombre del titular', 'error'); return; }
        setGuardando(true);
        try {
            const creada = await privacidadApi.crearSolicitud({
                tipo: nTipo,
                titularNombre: nNombre.trim(),
                clienteId: nCliente ?? undefined,
                canal: nCanal.trim() || undefined,
                detalle: nDetalle.trim() || undefined,
                recibidaEl: nRecibida || undefined,
            });
            addToast(`Pedido registrado. Vence el ${formatFecha(creada.venceEl)}.`, 'success');
            setAltaAbierta(false);
            cargar();
        } catch (e) {
            addToast(getErrorMessage(e, 'No se pudo registrar el pedido'), 'error');
        } finally {
            setGuardando(false);
        }
    };

    // ── Gestión ─────────────────────────────────────────────────────────────
    const [enGestion, setEnGestion] = useState<SolicitudTitular | null>(null);
    const [gEstado, setGEstado] = useState<EstadoSolicitudTitular>('pendiente');
    const [gResolucion, setGResolucion] = useState('');

    const abrirGestion = (s: SolicitudTitular) => {
        setEnGestion(s);
        setGEstado(s.estado);
        setGResolucion(s.resolucion ?? '');
    };
    const cerrada = enGestion ? enGestion.estado === 'resuelta' || enGestion.estado === 'rechazada' : false;
    const exigeResolucion = gEstado === 'resuelta' || gEstado === 'rechazada';

    const guardarGestion = async () => {
        if (!enGestion) return;
        if (exigeResolucion && !gResolucion.trim()) { addToast('Escribí qué se le respondió al titular', 'error'); return; }
        setGuardando(true);
        try {
            await privacidadApi.actualizarSolicitud(enGestion.id, { estado: gEstado, resolucion: gResolucion.trim() || undefined });
            addToast('Pedido actualizado', 'success');
            setEnGestion(null);
            cargar();
        } catch (e) {
            addToast(getErrorMessage(e, 'No se pudo actualizar el pedido'), 'error');
        } finally {
            setGuardando(false);
        }
    };

    const columnas: ColumnaListado<SolicitudTitular>[] = [
        {
            clave: 'vence',
            titulo: 'Vence',
            celda: (s) => (
                <span className="listado-nowrap" style={{ color: s.vencida ? 'var(--danger)' : undefined, fontWeight: s.vencida ? 700 : undefined }}>
                    {s.vencida && <CircleAlert size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />}
                    {textoPlazo(s)}
                </span>
            ),
        },
        {
            clave: 'tipo',
            titulo: 'Pedido',
            celda: (s) => <span>{TIPO_SOLICITUD_LABEL[s.tipo]}</span>,
        },
        {
            clave: 'titular',
            titulo: 'Titular',
            flexible: true,
            tarjeta: 'titulo',
            celda: (s) => (
                <>
                    <span className="listado-principal">{s.titularNombre}</span>
                    <span className="listado-secundario">
                        Recibido el {formatFecha(s.recibidaEl)}{s.canal ? ` · ${s.canal}` : ''}
                        {s.cliente?.deletedAt ? ' · datos suprimidos' : s.clienteId ? ' · ' : ''}
                        {s.clienteId && !s.cliente?.deletedAt && (
                            <button
                                type="button"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontWeight: 700, fontFamily: 'inherit', fontSize: 'inherit' }}
                                onClick={(e) => { e.stopPropagation(); navigate(`/clientes/${s.clienteId}`); }}
                            >
                                ver ficha
                            </button>
                        )}
                    </span>
                </>
            ),
        },
        {
            clave: 'estado',
            titulo: 'Estado',
            celda: (s) => <Badge variant={s.vencida ? 'danger' : ESTADO_SOLICITUD_META[s.estado].variant}>{s.vencida ? 'Vencido' : ESTADO_SOLICITUD_META[s.estado].label}</Badge>,
        },
        {
            clave: 'atendio',
            titulo: 'Atendió',
            tarjeta: 'oculta',
            celda: (s) => <span className="text-muted">{s.atendidaPor ?? '—'}</span>,
        },
        {
            clave: 'acciones',
            titulo: 'Gestionar',
            alinear: 'right',
            ancho: '1%',
            tarjeta: 'acciones',
            celda: (s) => (
                <div className="listado-acciones-fila">
                    <button type="button" className="icon-btn" title="Gestionar el pedido" aria-label={`Gestionar el pedido de ${s.titularNombre}`} onClick={() => abrirGestion(s)}>
                        <Pencil size={14} aria-hidden="true" />
                    </button>
                </div>
            ),
        },
    ];

    const filtrosActivos = [filtroEstado !== 'abiertas' ? filtroEstado || 'todos' : '', filtroTipo].filter(Boolean).length;

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Pedidos de titulares" />
            <Listado
                titulo="Pedidos de titulares"
                subtitulo="Acceso, rectificación, supresión, bloqueo u oposición (Ley 25.326). Acceso: 10 días corridos; el resto: 5 días hábiles."
                icono={<FileLock2 size={22} />}
                clave="pedidos-titulares"
                accionPrincipal={(
                    <Button onClick={abrirAlta}>
                        <Plus size={16} aria-hidden="true" /> Registrar pedido
                    </Button>
                )}
                filtrosActivos={filtrosActivos}
                onLimpiarFiltros={() => { setFiltroEstado('abiertas'); setFiltroTipo(''); setPagina(1); }}
                resumen={!cargando && !error ? `${total.toLocaleString('es-AR')} ${total === 1 ? 'pedido' : 'pedidos'}` : undefined}
                filtros={(
                    <>
                        <CampoFiltro etiqueta="Estado">
                            <select className="form-input" value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value as typeof filtroEstado); setPagina(1); }}>
                                <option value="abiertas">Abiertos (pendientes y en curso)</option>
                                <option value="">Todos</option>
                                {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_SOLICITUD_META[e].label}</option>)}
                            </select>
                        </CampoFiltro>
                        <CampoFiltro etiqueta="Pedido">
                            <select className="form-input" value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value as typeof filtroTipo); setPagina(1); }}>
                                <option value="">Todos</option>
                                {TIPOS.map((t) => <option key={t} value={t}>{TIPO_SOLICITUD_LABEL[t]}</option>)}
                            </select>
                        </CampoFiltro>
                    </>
                )}
            >
                {vencidas > 0 && (
                    <div className="uploader-alert uploader-alert-error" role="alert">
                        <span>
                            <strong>{vencidas} {vencidas === 1 ? 'pedido vencido' : 'pedidos vencidos'} sin resolver.</strong>{' '}
                            El plazo legal ya pasó: contestale al titular cuanto antes y dejá la respuesta registrada.
                        </span>
                    </div>
                )}
                <ListadoTabla
                    etiqueta="Pedidos de titulares"
                    columnas={columnas}
                    filas={filas}
                    cargando={cargando && filas.length === 0}
                    error={error}
                    mensajeError="No se pudo cargar el registro de pedidos"
                    onReintentar={cargar}
                    hayFiltros={filtrosActivos > 0}
                    onLimpiarFiltros={() => { setFiltroEstado('abiertas'); setFiltroTipo(''); setPagina(1); }}
                    vacio={{
                        titulo: filtroEstado === 'abiertas' ? 'No hay pedidos abiertos' : 'Todavía no hay pedidos registrados',
                        descripcion: 'Cuando un cliente pida ver, corregir o borrar sus datos, o que no lo contacten más, registralo acá: el sistema calcula el plazo legal.',
                        icono: <FileLock2 size={32} aria-hidden="true" />,
                    }}
                    onFilaClick={abrirGestion}
                    etiquetaFila={(s) => `Gestionar el pedido de ${s.titularNombre}`}
                    pagina={pagina}
                    totalPaginas={totalPaginas}
                    onPaginaChange={setPagina}
                />
            </Listado>

            <Modal
                isOpen={altaAbierta}
                onClose={() => !guardando && setAltaAbierta(false)}
                title="Registrar un pedido del titular"
                subtitle="El vencimiento legal se calcula desde la fecha de recepción."
                maxWidth="560px"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setAltaAbierta(false)} disabled={guardando}>Cancelar</Button>
                        <Button onClick={guardarAlta} loading={guardando}>Registrar</Button>
                    </>
                )}
            >
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    <Select
                        dense
                        label="Qué pide"
                        value={nTipo}
                        onChange={(e) => setNTipo(e.target.value as TipoSolicitudTitular)}
                        options={TIPOS.map((t) => ({ value: t, label: TIPO_SOLICITUD_LABEL[t] }))}
                        hint={`Plazo: ${PLAZO_SOLICITUD_LABEL[nTipo]}`}
                    />
                    <Input dense label="Nombre del titular" value={nNombre} onChange={(e) => setNNombre(e.target.value)} maxLength={200} />
                    <Combobox
                        dense
                        label="Ficha del cliente (opcional)"
                        options={opcionesCliente}
                        value={nCliente}
                        onChange={(v, op) => {
                            setNCliente(v === null ? null : Number(v));
                            if (op && !nNombre.trim()) setNNombre(op.label);
                        }}
                        onSearch={buscarCliente}
                        loading={buscandoCliente}
                        placeholder="Buscá por nombre, DNI o teléfono"
                        emptyText="Escribí al menos 2 letras"
                        clearable
                    />
                    <Input dense label="Fecha en que llegó el pedido" type="date" value={nRecibida} max={hoyLocal()} onChange={(e) => setNRecibida(e.target.value)} />
                    <Input dense label="Por dónde llegó (opcional)" placeholder="Mail, presencial, carta documento…" value={nCanal} onChange={(e) => setNCanal(e.target.value)} maxLength={100} />
                    <Textarea dense label="Detalle (opcional)" rows={3} value={nDetalle} onChange={(e) => setNDetalle(e.target.value)} maxLength={2000} />
                </div>
            </Modal>

            <Modal
                isOpen={enGestion !== null}
                onClose={() => !guardando && setEnGestion(null)}
                title={enGestion ? `${TIPO_SOLICITUD_LABEL[enGestion.tipo]} · ${enGestion.titularNombre}` : ''}
                subtitle={enGestion ? `Recibido el ${formatFecha(enGestion.recibidaEl)} · vence el ${formatFecha(enGestion.venceEl)}` : undefined}
                maxWidth="560px"
                footer={cerrada ? (
                    <Button variant="secondary" onClick={() => setEnGestion(null)}>Cerrar</Button>
                ) : (
                    <>
                        <Button variant="secondary" onClick={() => setEnGestion(null)} disabled={guardando}>Cancelar</Button>
                        <Button onClick={guardarGestion} loading={guardando}>Guardar</Button>
                    </>
                )}
            >
                {enGestion && (
                    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                        {enGestion.detalle && <p style={{ margin: 0 }}>{enGestion.detalle}</p>}
                        {enGestion.vencida && (
                            <div className="uploader-alert uploader-alert-error" role="status"><span>El plazo legal venció.</span></div>
                        )}
                        {cerrada ? (
                            <>
                                <p style={{ margin: 0 }}>
                                    <Badge variant={ESTADO_SOLICITUD_META[enGestion.estado].variant}>{ESTADO_SOLICITUD_META[enGestion.estado].label}</Badge>
                                    {enGestion.resueltaEn ? ` el ${new Date(enGestion.resueltaEn).toLocaleDateString('es-AR')}` : ''}
                                    {enGestion.atendidaPor ? ` por ${enGestion.atendidaPor}` : ''}
                                </p>
                                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{enGestion.resolucion}</p>
                                <p className="text-muted" style={{ margin: 0 }}>Un pedido cerrado no se reabre: si el titular vuelve a pedir, registrá uno nuevo.</p>
                            </>
                        ) : (
                            <>
                                <Select
                                    dense
                                    label="Estado"
                                    value={gEstado}
                                    onChange={(e) => setGEstado(e.target.value as EstadoSolicitudTitular)}
                                    options={ESTADOS.map((e) => ({ value: e, label: ESTADO_SOLICITUD_META[e].label }))}
                                />
                                <Textarea
                                    dense
                                    label={exigeResolucion ? 'Qué se le respondió (obligatorio)' : 'Notas de la gestión (opcional)'}
                                    rows={4}
                                    value={gResolucion}
                                    onChange={(e) => setGResolucion(e.target.value)}
                                    maxLength={4000}
                                    hint={enGestion.tipo === 'supresion' || enGestion.tipo === 'acceso'
                                        ? 'La supresión y la descarga de datos se hacen desde la ficha del cliente (sección Privacidad).'
                                        : undefined}
                                />
                            </>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}
