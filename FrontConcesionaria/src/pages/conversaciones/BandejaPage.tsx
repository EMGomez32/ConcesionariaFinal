import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    MessageCircle,
    Search,
    Send,
    ArrowLeft,
    User,
    UserPlus,
    Check,
    CheckCheck,
    Clock,
    AlertTriangle,
    Lock,
    RotateCcw,
} from 'lucide-react';
import {
    conversacionesApi,
    type ConversacionDetalle,
    type ConversacionFilter,
    type EstadoConversacion,
    type EstadoMensajeWhatsapp,
    type MensajeWhatsapp,
    type TipoMensajeWhatsapp,
    type UsuarioRef,
} from '../../api/conversaciones.api';
import { whatsappApi } from '../../api/whatsapp.api';
import { usuariosApi } from '../../api/usuarios.api';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useDebounce } from '../../hooks/useDebounce';
import { getErrorMessage } from '../../utils/getErrorMessage';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Pagination from '../../components/ui/Pagination';
import PageTitle from '../../components/ui/PageTitle';

const LIMITE_LISTA = 40;

const ESTADOS: { value: EstadoConversacion; label: string }[] = [
    { value: 'abierta', label: 'Abiertas' },
    { value: 'cerrada', label: 'Cerradas' },
    { value: 'archivada', label: 'Archivadas' },
];

const ESTADO_LABEL: Record<EstadoConversacion, string> = {
    abierta: 'Abierta',
    cerrada: 'Cerrada',
    archivada: 'Archivada',
};

// Los tipos no-texto llegan con `contenido` como caption/descripción: la etiqueta
// avisa qué adjunto era el original (la bandeja todavía no renderiza media).
const TIPO_LABEL: Record<TipoMensajeWhatsapp, string> = {
    texto: '',
    imagen: 'Imagen',
    audio: 'Audio',
    video: 'Video',
    documento: 'Documento',
    ubicacion: 'Ubicación',
    contacto: 'Contacto',
    sistema: '',
};

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** Hora local de un timestamp del backend (son instantes, no columnas @db.Date). */
const hora = (iso?: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
};

/** En la lista: hora si el mensaje es de hoy, dd/mm si es más viejo. */
const horaCorta = (iso?: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hoy = new Date();
    const mismoDia =
        d.getFullYear() === hoy.getFullYear() &&
        d.getMonth() === hoy.getMonth() &&
        d.getDate() === hoy.getDate();
    return mismoDia ? hora(iso) : `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}`;
};

const primerNombre = (nombre: string): string => nombre.trim().split(/\s+/)[0] || nombre;

/** Doble tilde estilo WhatsApp para el saliente: dónde quedó el mensaje. */
const EstadoMensajeIcono = ({ estado }: { estado: EstadoMensajeWhatsapp }) => {
    const marca = (label: string, icono: ReactNode, clase = '') => (
        <span className={`bandeja-tick ${clase}`} title={label} aria-label={label} role="img">
            {icono}
        </span>
    );
    switch (estado) {
        case 'pendiente':
            return marca('En cola de envío', <Clock size={12} />);
        case 'enviando':
            return marca('Enviando…', <Clock size={12} />);
        case 'enviado':
            return marca('Enviado', <Check size={12} />);
        case 'entregado':
            return marca('Entregado', <CheckCheck size={12} />);
        case 'leido':
            return marca('Leído', <CheckCheck size={12} />, 'text-accent');
        case 'fallido':
            return marca('Falló el envío', <AlertTriangle size={12} />, 'text-danger');
        default:
            return null;
    }
};

const BandejaPage = () => {
    const qc = useQueryClient();
    const { addToast } = useUIStore();
    const user = useAuthStore((s) => s.user);
    // /whatsapp/cuentas es admin-only: al vendedor le devolvería 403, así que ni
    // se consulta (y sin ese dato el envío queda habilitado, ver `cuentaCaida`).
    const esAdmin = !!(user?.roles?.includes('admin') || user?.roles?.includes('super_admin'));

    // ── Filtros de la lista ──────────────────────────────────────────────────
    const [estado, setEstado] = useState<'' | EstadoConversacion>('abierta');
    const [sinResponder, setSinResponder] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const q = useDebounce(busqueda, 300);
    const [page, setPage] = useState(1);

    const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
    const [borrador, setBorrador] = useState('');

    // Todo cambio de filtro vuelve a la página 1, y abrir/cerrar un hilo limpia el
    // borrador: se resuelve en el handler (no en un efecto, que encadenaría renders).
    const cambiarEstado = (valor: '' | EstadoConversacion) => { setEstado(valor); setPage(1); };
    const cambiarSinResponder = (valor: boolean) => { setSinResponder(valor); setPage(1); };
    const cambiarBusqueda = (valor: string) => { setBusqueda(valor); setPage(1); };
    const seleccionar = (id: number | null) => { setSeleccionadaId(id); setBorrador(''); };

    const filtros = useMemo<ConversacionFilter>(() => ({
        ...(estado ? { estado } : {}),
        ...(sinResponder ? { sinResponder: true } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
    }), [estado, sinResponder, q]);

    // No hay websockets: la bandeja se refresca por polling (5s la lista, 3s el
    // hilo abierto). TanStack lo pausa solo cuando la pestaña está oculta.
    const listaQuery = useQuery({
        queryKey: ['conversaciones', filtros, page],
        queryFn: () => conversacionesApi.getAll(filtros, { page, limit: LIMITE_LISTA }),
        refetchInterval: 5000,
        placeholderData: (previa) => previa,
    });

    const hiloQuery = useQuery({
        queryKey: ['conversacion', seleccionadaId],
        queryFn: () => conversacionesApi.getById(seleccionadaId as number),
        enabled: seleccionadaId != null,
        refetchInterval: 3000,
    });

    const cuentasQuery = useQuery({
        queryKey: ['whatsapp', 'cuentas'],
        queryFn: () => whatsappApi.getCuentas(),
        enabled: esAdmin,
        refetchInterval: 30_000,
    });

    const { data: usuariosData } = useQuery({
        queryKey: ['usuarios-vendedores'],
        queryFn: () => usuariosApi.getAll({}, { limit: 200 }),
        staleTime: 5 * 60 * 1000,
    });
    const vendedores = ((usuariosData as { results?: UsuarioRef[] })?.results ?? []);

    const conversaciones = listaQuery.data?.results ?? [];
    const totalPages = listaQuery.data?.totalPages ?? 1;
    const hilo = hiloQuery.data;

    // Abrir el hilo pone noLeidos en 0 del lado del backend: refrescamos la lista
    // apenas llega el detalle para que el badge no quede colgado hasta el próximo poll.
    const leidaRef = useRef<number | null>(null);
    useEffect(() => {
        if (hilo?.id && leidaRef.current !== hilo.id) {
            leidaRef.current = hilo.id;
            qc.invalidateQueries({ queryKey: ['conversaciones'] });
        }
    }, [hilo?.id, qc]);

    // Autoscroll al pie con cada mensaje nuevo (y al cambiar de hilo).
    const mensajesRef = useRef<HTMLDivElement | null>(null);
    const cantidadMensajes = hilo?.mensajes.length ?? 0;
    useEffect(() => {
        const el = mensajesRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [seleccionadaId, cantidadMensajes]);

    // ── Mutaciones ───────────────────────────────────────────────────────────

    // El POST no envía por WhatsApp: encola el saliente. Pintamos la burbuja
    // optimista en 'pendiente' — que es justo el estado con el que nace.
    const enviar = useMutation({
        mutationFn: ({ id, contenido }: { id: number; contenido: string }) =>
            conversacionesApi.enviarMensaje(id, contenido),
        onMutate: async ({ id, contenido }) => {
            await qc.cancelQueries({ queryKey: ['conversacion', id] });
            const previo = qc.getQueryData<ConversacionDetalle>(['conversacion', id]);
            if (previo) {
                const optimista: MensajeWhatsapp = {
                    id: -Date.now(),
                    direccion: 'saliente',
                    tipo: 'texto',
                    contenido,
                    estado: 'pendiente',
                    createdAt: new Date().toISOString(),
                    enviadoPor: user ? { id: user.id, nombre: user.nombre } : null,
                };
                qc.setQueryData<ConversacionDetalle>(['conversacion', id], {
                    ...previo,
                    mensajes: [...previo.mensajes, optimista],
                    ultimoMensajeDir: 'saliente',
                    ultimoMensajeAt: optimista.createdAt,
                });
            }
            return { previo };
        },
        onError: (e, vars, ctx) => {
            if (ctx?.previo) qc.setQueryData(['conversacion', vars.id], ctx.previo);
            setBorrador((b) => (b ? b : vars.contenido)); // no perder lo escrito
            addToast(getErrorMessage(e, 'No se pudo encolar el mensaje'), 'error');
        },
        onSettled: (_d, _e, vars) => {
            qc.invalidateQueries({ queryKey: ['conversacion', vars.id] });
            qc.invalidateQueries({ queryKey: ['conversaciones'] });
        },
    });

    const actualizar = useMutation({
        mutationFn: ({ id, data }: { id: number; data: { estado?: EstadoConversacion; asignadoAId?: number | null } }) =>
            conversacionesApi.update(id, data),
        onSuccess: (_c, vars) => {
            qc.invalidateQueries({ queryKey: ['conversacion', vars.id] });
            qc.invalidateQueries({ queryKey: ['conversaciones'] });
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo actualizar la conversación'), 'error'),
    });

    const registrar = useMutation({
        mutationFn: (id: number) => conversacionesApi.registrarConsulta(id),
        onSuccess: (res, id) => {
            addToast(
                res.creado
                    ? 'Consulta registrada: se creó el cliente y quedó vinculado al chat'
                    : 'Consulta registrada sobre un cliente que ya existía',
                'success',
            );
            qc.invalidateQueries({ queryKey: ['conversacion', id] });
            qc.invalidateQueries({ queryKey: ['conversaciones'] });
            qc.invalidateQueries({ queryKey: ['clientes'] });
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo registrar la consulta'), 'error'),
    });

    // Sólo bloqueamos el envío cuando SABEMOS que el número está caído. Sin la
    // lista de cuentas (vendedor) se deja encolar: el worker despacha cuando vuelva.
    const cuenta = cuentasQuery.data?.find((c) => c.id === hilo?.whatsappCuentaId) ?? null;
    const cuentaCaida = !!cuenta && cuenta.estado !== 'conectado';

    const enviarBorrador = () => {
        const texto = borrador.trim();
        if (!texto || seleccionadaId == null || cuentaCaida) return;
        setBorrador('');
        enviar.mutate({ id: seleccionadaId, contenido: texto });
    };

    const nombreHilo = hilo ? (hilo.nombreContacto || hilo.telefono) : '';
    const abierta = hilo?.estado === 'abierta';

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="WhatsApp" />
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <MessageCircle size={22} />
                        </div>
                        <h1>WhatsApp</h1>
                    </div>
                    <p>Bandeja de chats: respondé, asigná el vendedor y convertí la charla en una consulta.</p>
                </div>
            </header>

            <div className={`bandeja-layout ${seleccionadaId != null ? 'is-hilo' : ''}`}>
                {/* ── Lista de conversaciones ── */}
                <aside className="card bandeja-lista">
                    <div className="bandeja-filtros">
                        <Input
                            dense
                            containerClassName="mb-0"
                            placeholder="Buscar por nombre o teléfono…"
                            icon={<Search size={14} />}
                            value={busqueda}
                            onChange={(e) => cambiarBusqueda(e.target.value)}
                            aria-label="Buscar conversaciones"
                        />
                        <Select
                            dense
                            containerClassName="mb-0"
                            placeholder="Todos los estados"
                            value={estado}
                            options={ESTADOS}
                            onChange={(e) => cambiarEstado(e.target.value as '' | EstadoConversacion)}
                            aria-label="Filtrar por estado"
                        />
                        <label className="bandeja-check">
                            <input
                                type="checkbox"
                                checked={sinResponder}
                                onChange={(e) => cambiarSinResponder(e.target.checked)}
                            />
                            <span>Sin responder</span>
                        </label>
                    </div>

                    <div className="bandeja-items">
                        {listaQuery.isLoading ? (
                            <p className="bandeja-hint">Cargando conversaciones…</p>
                        ) : listaQuery.isError ? (
                            <div className="bandeja-hint">
                                <span>No se pudieron cargar las conversaciones.</span>
                                <Button variant="secondary" size="sm" onClick={() => listaQuery.refetch()}>
                                    Reintentar
                                </Button>
                            </div>
                        ) : conversaciones.length === 0 ? (
                            <p className="bandeja-hint">No hay conversaciones con estos filtros.</p>
                        ) : (
                            conversaciones.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    className={`bandeja-item ${c.id === seleccionadaId ? 'is-activa' : ''}`}
                                    onClick={() => seleccionar(c.id)}
                                    aria-current={c.id === seleccionadaId}
                                >
                                    <span className="bandeja-item-top">
                                        <span className="bandeja-item-nombre truncate">
                                            {c.nombreContacto || c.telefono}
                                        </span>
                                        <span className="bandeja-item-hora">{horaCorta(c.ultimoMensajeAt)}</span>
                                    </span>
                                    <span className="bandeja-item-prev">
                                        {c.ultimoMensajeDir === 'saliente' && (
                                            <span className="bandeja-item-vos">Vos:</span>
                                        )}
                                        <span className="truncate">{c.ultimoMensaje || 'Sin mensajes todavía'}</span>
                                    </span>
                                    <span className="bandeja-item-badges">
                                        {c.asignadoA ? (
                                            <Badge variant="violet">{primerNombre(c.asignadoA.nombre)}</Badge>
                                        ) : (
                                            <Badge variant="default">Sin asignar</Badge>
                                        )}
                                        {c.estado !== 'abierta' && (
                                            <Badge variant="warning">{ESTADO_LABEL[c.estado]}</Badge>
                                        )}
                                        {c.noLeidos > 0 && (
                                            <span className="bandeja-nolei" title={`${c.noLeidos} sin leer`}>
                                                {c.noLeidos}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>

                    {totalPages > 1 && (
                        <div className="bandeja-pager">
                            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                        </div>
                    )}
                </aside>

                {/* ── Hilo ── */}
                <section className="card bandeja-hilo">
                    {seleccionadaId == null ? (
                        <div className="bandeja-vacio">
                            <MessageCircle size={40} className="text-secondary" />
                            <h2>Elegí una conversación</h2>
                            <p className="text-secondary">
                                Los chats entrantes de WhatsApp aparecen a la izquierda. Abrí uno para leer el
                                historial y responder.
                            </p>
                        </div>
                    ) : (
                        <>
                            <header className="bandeja-hilo-head">
                                <div className="bandeja-hilo-quien">
                                    <button
                                        type="button"
                                        className="icon-btn bandeja-volver"
                                        onClick={() => seleccionar(null)}
                                        aria-label="Volver a la lista"
                                    >
                                        <ArrowLeft size={16} />
                                    </button>
                                    <div className="bandeja-hilo-datos">
                                        <div className="bandeja-hilo-nombre truncate">{nombreHilo || 'Conversación'}</div>
                                        <div className="bandeja-hilo-tel">{hilo?.telefono ?? ''}</div>
                                    </div>
                                </div>

                                <div className="bandeja-hilo-acciones">
                                    {hilo?.clienteId ? (
                                        <Link to={`/clientes/${hilo.clienteId}`} className="btn btn-secondary btn-sm">
                                            <User size={14} /> Ver ficha
                                        </Link>
                                    ) : (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={!hilo}
                                            loading={registrar.isPending}
                                            title="Da de alta el contacto como consulta y lo vincula a este chat"
                                            onClick={() => hilo && registrar.mutate(hilo.id)}
                                        >
                                            <UserPlus size={14} /> Registrar como consulta
                                        </Button>
                                    )}

                                    <Select
                                        dense
                                        containerClassName="mb-0"
                                        placeholder="Sin asignar"
                                        value={hilo?.asignadoAId ?? ''}
                                        options={vendedores.map((v) => ({ value: v.id, label: v.nombre }))}
                                        disabled={!hilo || actualizar.isPending}
                                        aria-label="Asignar vendedor"
                                        style={{ minWidth: 150 }}
                                        onChange={(e) => {
                                            if (!hilo) return;
                                            const valor = e.target.value;
                                            actualizar.mutate({
                                                id: hilo.id,
                                                data: { asignadoAId: valor ? Number(valor) : null },
                                            });
                                        }}
                                    />

                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={!hilo || actualizar.isPending}
                                        onClick={() => hilo && actualizar.mutate({
                                            id: hilo.id,
                                            data: { estado: abierta ? 'cerrada' : 'abierta' },
                                        })}
                                    >
                                        {abierta ? <><Lock size={14} /> Cerrar</> : <><RotateCcw size={14} /> Reabrir</>}
                                    </Button>
                                </div>
                            </header>

                            <div className="bandeja-mensajes" ref={mensajesRef}>
                                {hiloQuery.isLoading ? (
                                    <p className="bandeja-hint">Cargando el hilo…</p>
                                ) : hiloQuery.isError ? (
                                    <div className="bandeja-hint">
                                        <span>No se pudo cargar la conversación.</span>
                                        <Button variant="secondary" size="sm" onClick={() => hiloQuery.refetch()}>
                                            Reintentar
                                        </Button>
                                    </div>
                                ) : cantidadMensajes === 0 ? (
                                    <p className="bandeja-hint">Todavía no hay mensajes en este chat.</p>
                                ) : (
                                    hilo?.mensajes.map((m) => (
                                        m.tipo === 'sistema' ? (
                                            <div key={m.id} className="bandeja-sistema">
                                                {m.contenido} · {hora(m.createdAt)}
                                            </div>
                                        ) : (
                                            <div
                                                key={m.id}
                                                className={`bandeja-burbuja ${m.direccion === 'saliente' ? 'is-saliente' : 'is-entrante'}`}
                                            >
                                                {TIPO_LABEL[m.tipo] && (
                                                    <span className="bandeja-tipo">{TIPO_LABEL[m.tipo]}</span>
                                                )}
                                                <p className="bandeja-texto">{m.contenido}</p>
                                                <div className="bandeja-meta">
                                                    {m.direccion === 'saliente' && m.enviadoPor && (
                                                        <span className="truncate">{primerNombre(m.enviadoPor.nombre)}</span>
                                                    )}
                                                    <span>{hora(m.createdAt)}</span>
                                                    {m.direccion === 'saliente' && <EstadoMensajeIcono estado={m.estado} />}
                                                </div>
                                            </div>
                                        )
                                    ))
                                )}
                            </div>

                            {cuentaCaida && (
                                <p className="bandeja-aviso">
                                    <AlertTriangle size={14} />
                                    El número {cuenta?.alias} no está conectado ({cuenta?.estado}). Reconectalo desde
                                    la configuración de WhatsApp para poder responder.
                                </p>
                            )}

                            <form
                                className="bandeja-composer"
                                onSubmit={(e) => { e.preventDefault(); enviarBorrador(); }}
                            >
                                <Textarea
                                    dense
                                    rows={2}
                                    containerClassName="mb-0"
                                    value={borrador}
                                    onChange={(e) => setBorrador(e.target.value)}
                                    disabled={cuentaCaida}
                                    aria-label="Mensaje"
                                    placeholder={
                                        cuentaCaida
                                            ? 'El número de WhatsApp no está conectado'
                                            : 'Escribí un mensaje… (Enter envía, Shift+Enter salto de línea)'
                                    }
                                    style={{ resize: 'none' }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            enviarBorrador();
                                        }
                                    }}
                                />
                                <Button
                                    type="submit"
                                    disabled={cuentaCaida || !borrador.trim()}
                                    loading={enviar.isPending}
                                    aria-label="Enviar mensaje"
                                >
                                    <Send size={16} /> Enviar
                                </Button>
                            </form>
                        </>
                    )}
                </section>
            </div>

            <style>{`
                .bandeja-layout {
                    display: grid;
                    grid-template-columns: 340px minmax(0, 1fr);
                    gap: 1rem;
                    align-items: stretch;
                    height: calc(100vh - 15rem);
                    min-height: 460px;
                }
                .bandeja-lista, .bandeja-hilo {
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    padding: 0;
                    overflow: hidden;
                }

                /* Columna izquierda */
                .bandeja-filtros { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem; border-bottom: 1px solid var(--border); }
                .bandeja-check { display: flex; align-items: center; gap: 0.45rem; font-size: var(--text-sm); color: var(--text-secondary); cursor: pointer; }
                .bandeja-items { flex: 1; min-height: 0; overflow-y: auto; }
                .bandeja-item {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                    padding: 0.7rem 0.9rem;
                    background: transparent;
                    border: 0;
                    border-bottom: 1px solid var(--border);
                    border-left: 3px solid transparent;
                    text-align: left;
                    cursor: pointer;
                    font-family: var(--font-sans);
                    color: var(--text-primary);
                    transition: background var(--duration-fast) var(--easing-soft), border-color var(--duration-fast) var(--easing-soft);
                }
                .bandeja-item:hover { background: var(--bg-secondary); }
                .bandeja-item.is-activa { background: color-mix(in srgb, var(--accent) 12%, transparent); border-left-color: var(--accent); }
                .bandeja-item-top { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; min-width: 0; }
                .bandeja-item-nombre { font-weight: 700; font-size: var(--text-sm); min-width: 0; }
                .bandeja-item-hora { font-size: var(--text-2xs); color: var(--text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
                .bandeja-item-prev { display: flex; gap: 0.3rem; min-width: 0; font-size: var(--text-xs); color: var(--text-secondary); }
                .bandeja-item-vos { color: var(--text-muted); flex-shrink: 0; }
                .bandeja-item-badges { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
                .bandeja-nolei {
                    margin-left: auto;
                    min-width: 1.25rem;
                    height: 1.25rem;
                    padding: 0 0.35rem;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: var(--radius-pill);
                    background: var(--accent);
                    color: var(--text-white);
                    font-size: var(--text-3xs);
                    font-weight: 900;
                    font-variant-numeric: tabular-nums;
                }
                .bandeja-pager { padding: 0 0.75rem 0.75rem; }

                /* Columna derecha */
                .bandeja-hilo-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
                .bandeja-hilo-quien { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
                .bandeja-hilo-nombre { font-weight: 700; font-size: var(--text-base); }
                .bandeja-hilo-tel { font-size: var(--text-xs); color: var(--text-muted); font-variant-numeric: tabular-nums; }
                .bandeja-hilo-acciones { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
                .bandeja-volver { display: none; }
                .bandeja-hilo-datos { min-width: 0; }

                .bandeja-mensajes { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.45rem; padding: 1rem; }
                .bandeja-burbuja { max-width: min(70%, 34rem); padding: 0.5rem 0.7rem; border-radius: var(--radius-md); box-shadow: var(--shadow-xs); }
                .bandeja-burbuja.is-entrante { align-self: flex-start; background: var(--bg-secondary); border: 1px solid var(--border); border-bottom-left-radius: var(--radius-xs); }
                .bandeja-burbuja.is-saliente {
                    align-self: flex-end;
                    background: color-mix(in srgb, var(--accent) 16%, var(--bg-card));
                    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
                    border-bottom-right-radius: var(--radius-xs);
                }
                .bandeja-tipo { display: block; font-size: var(--text-2xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 0.15rem; }
                .bandeja-texto { margin: 0; font-size: var(--text-sm); color: var(--text-primary); white-space: pre-wrap; word-break: break-word; }
                .bandeja-meta { display: flex; align-items: center; justify-content: flex-end; gap: 0.3rem; margin-top: 0.2rem; font-size: var(--text-3xs); color: var(--text-muted); font-variant-numeric: tabular-nums; }
                .bandeja-tick { display: inline-flex; align-items: center; }
                .bandeja-sistema { align-self: center; padding: 0.2rem 0.6rem; font-size: var(--text-xs); color: var(--text-muted); text-align: center; }

                .bandeja-aviso { display: flex; align-items: center; gap: 0.4rem; margin: 0; padding: 0.6rem 0.75rem 0; font-size: var(--text-xs); color: var(--warning); }
                .bandeja-composer { display: flex; align-items: flex-end; gap: 0.5rem; padding: 0.75rem; border-top: 1px solid var(--border); }
                .bandeja-composer .input-group { flex: 1; min-width: 0; }

                .bandeja-vacio { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem; text-align: center; }
                .bandeja-vacio h2 { font-size: var(--text-lg); }
                .bandeja-vacio p { font-size: var(--text-sm); max-width: 42ch; }
                .bandeja-hint { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 1.25rem; text-align: center; font-size: var(--text-sm); color: var(--text-secondary); }

                /* ≤768px: una sola columna. Sin hilo elegido se ve la lista; al
                   abrir uno, el hilo ocupa todo y se vuelve con la flecha. */
                @media (max-width: 768px) {
                    .bandeja-layout { grid-template-columns: minmax(0, 1fr); height: calc(100vh - 12rem); }
                    .bandeja-layout .bandeja-hilo { display: none; }
                    .bandeja-layout.is-hilo .bandeja-lista { display: none; }
                    .bandeja-layout.is-hilo .bandeja-hilo { display: flex; }
                    .bandeja-volver { display: inline-flex; }
                    .bandeja-burbuja { max-width: 85%; }
                }
            `}</style>
        </div>
    );
};

export default BandejaPage;
