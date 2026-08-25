import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    ShoppingBag,
    Send,
    ArrowLeft,
    User,
    UserPlus,
    RefreshCw,
    ExternalLink,
    Car,
} from 'lucide-react';
import mercadolibreApi, { esCuentaDemo } from '../../api/mercadolibre.api';
import type {
    CrearLeadDto,
    EstadoPreguntaMl,
    PreguntaMl,
    PreguntasFilter,
} from '../../api/mercadolibre.api';
import { usuariosApi } from '../../api/usuarios.api';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/getErrorMessage';
import Button from '../../components/ui/Button';
import Badge, { type BadgeVariant } from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import PageTitle from '../../components/ui/PageTitle';

const LIMITE_LISTA = 40;

// Mismo pulso que la bandeja de WhatsApp: las preguntas entran por webhook, pero
// si el webhook se pierde el worker las levanta y acá se ven en el próximo poll.
const POLL_MS = 5000;

const ESTADOS: { value: EstadoPreguntaMl; label: string }[] = [
    { value: 'sin_responder', label: 'Sin responder' },
    { value: 'respondida', label: 'Respondidas' },
    { value: 'eliminada', label: 'Eliminadas' },
];

const ESTADO_LABEL: Record<EstadoPreguntaMl, string> = {
    sin_responder: 'Sin responder',
    respondida: 'Respondida',
    eliminada: 'Eliminada',
};

const ESTADO_BADGE: Record<EstadoPreguntaMl, BadgeVariant> = {
    sin_responder: 'warning',
    respondida: 'success',
    eliminada: 'default',
};

/** El listado de usuarios llega sin tipar desde `usuariosApi`. */
interface VendedorRef {
    id: number;
    nombre: string;
}

/**
 * Rótulo del modo demostración. La cuenta demo no sale nunca a la red: sus
 * preguntas las siembra el sistema y las respuestas no se publican en ningún
 * lado, así que hay que decirlo en pantalla y no sólo en Ajustes.
 *
 * Se mira el id porque el simulador los emite con prefijo DEMO- justamente para
 * que se distingan a simple vista de un MLA real: sirve para el vendedor, que no
 * puede consultar la cuenta (GET /mercadolibre/cuenta es admin-only), y también
 * rotula fila por fila si en la bandeja quedaron preguntas reales de antes.
 */
const ID_SIMULADO = /^DEMO-/i;

const esSimulada = (p: PreguntaMl): boolean =>
    ID_SIMULADO.test(p.mlQuestionId ?? '') || ID_SIMULADO.test(p.itemId ?? '');

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** En la lista la pregunta se lee por antigüedad, no por hora exacta. */
const desdeHace = (iso?: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const minutos = Math.floor((Date.now() - d.getTime()) / 60000);
    if (minutos < 1) return 'recién';
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;
    const dias = Math.floor(horas / 24);
    if (dias === 1) return 'ayer';
    if (dias < 7) return `hace ${dias} días`;
    return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}`;
};

/** En el detalle sí importa el instante (para saber cuánto se demoró la respuesta). */
const fechaHora = (iso?: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)} ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
};

const primerNombre = (nombre: string): string => nombre.trim().split(/\s+/)[0] || nombre;

/** Título de la fila: el vehículo publicado. Sin publicación vinculada (la ingesta
 *  puede traer preguntas de ítems que no salieron del sistema) cae al itemId. */
const vehiculoDe = (p: PreguntaMl): string => {
    const v = p.publicacion?.vehiculo;
    if (v) return `${v.marca} ${v.modelo}${v.anio ? ` ${v.anio}` : ''}`;
    return p.publicacion?.titulo ?? `Publicación ${p.itemId}`;
};

const PreguntasPage = () => {
    const qc = useQueryClient();
    const { addToast } = useUIStore();
    const user = useAuthStore((s) => s.user);
    // Asignar y forzar la sincronización son admin-only en el backend: al vendedor
    // le escondemos los controles (si no, serían botones muertos que dan 403).
    const esAdmin = !!(user?.roles?.includes('admin') || user?.roles?.includes('super_admin'));

    // ── Filtros de la lista ──────────────────────────────────────────────────
    const [estado, setEstado] = useState<'' | EstadoPreguntaMl>('sin_responder');
    const [soloMias, setSoloMias] = useState(false);
    const [page, setPage] = useState(1);

    const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
    const [borrador, setBorrador] = useState('');
    // Última pregunta contestada en esta pantalla. El filtro por defecto es "Sin
    // responder", así que al confirmar la respuesta la fila sale del listado y el
    // detalle se quedaba sin nada que mostrar: el panel decía "La pregunta ya no
    // está en el listado" justo donde tenía que verse el hilo con la respuesta
    // recién escrita. Se guarda la fila devuelta (mezclada con la que ya
    // teníamos, que trae el vehículo) para que el hilo siga en pantalla.
    const [respondida, setRespondida] = useState<PreguntaMl | null>(null);

    // Alta del lead: el formulario vive acá y no en un componente aparte porque el
    // footer del Modal (fuera del children) necesita leerlo para guardar.
    const [leadAbierto, setLeadAbierto] = useState(false);
    const [leadForm, setLeadForm] = useState({ nombre: '', telefono: '', email: '', vendedorId: '' });

    // Todo cambio de filtro vuelve a la página 1, y abrir otra pregunta limpia el
    // borrador: se resuelve en el handler (no en un efecto, que encadenaría renders).
    const cambiarEstado = (valor: '' | EstadoPreguntaMl) => { setEstado(valor); setPage(1); };
    const cambiarSoloMias = (valor: boolean) => { setSoloMias(valor); setPage(1); };
    const seleccionar = (id: number | null) => { setSeleccionadaId(id); setBorrador(''); setRespondida(null); };

    const filtros = useMemo<PreguntasFilter>(() => ({
        ...(estado ? { estado } : {}),
        ...(soloMias ? { soloMias: true } : {}),
    }), [estado, soloMias]);

    const listaQuery = useQuery({
        queryKey: ['ml-preguntas', filtros, page],
        queryFn: () => mercadolibreApi.getPreguntas(filtros, { page, limit: LIMITE_LISTA }),
        refetchInterval: POLL_MS,
        placeholderData: (previa) => previa,
    });

    // Misma clave que la bandeja de WhatsApp: comparten la caché de vendedores.
    const { data: usuariosData } = useQuery({
        queryKey: ['usuarios-vendedores'],
        queryFn: () => usuariosApi.getAll({}, { limit: 200 }),
        staleTime: 5 * 60 * 1000,
    });
    const vendedores = ((usuariosData as { results?: VendedorRef[] })?.results ?? []);

    // Sólo el admin puede consultar la cuenta: al vendedor no se le pide (daría
    // 403) y para él el rótulo sale de los ids DEMO- de las propias preguntas.
    const { data: cuentaMl } = useQuery({
        queryKey: ['ml-cuenta'],
        queryFn: () => mercadolibreApi.getCuenta(),
        enabled: esAdmin,
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

    const preguntas = listaQuery.data?.results ?? [];
    // El contrato de listarPreguntas devuelve el total crudo, no totalPages.
    const total = listaQuery.data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / LIMITE_LISTA));

    // ¿La cuenta con la que opera el tenant es la simulada? El listado lo dice
    // (lo lee también el vendedor); `esCuentaDemo` es el mismo dato para el admin,
    // que además lo tiene cacheado. No depende de que haya filas: con la bandeja
    // vacía el rótulo tiene que estar igual.
    const cuentaEsDemo = listaQuery.data?.demo === true || esCuentaDemo(cuentaMl);
    // La cabecera se rotula cuando TODO lo que se ve es simulado. El flag de la
    // CUENTA no alcanza para rotular una fila: si la bandeja mezclara preguntas
    // reales (ingeridas con una cuenta anterior), el rótulo global las estaría
    // llamando fingidas — ahí queda sólo el chip de cada fila simulada.
    const bandejaSimulada = cuentaEsDemo && !preguntas.some((p) => !esSimulada(p));

    // No hay endpoint de detalle: la pregunta abierta sale del listado ya cargado.
    // Si un cambio de filtro la deja afuera, el panel lo avisa en vez de colgarse
    // (salvo que sea la que se acaba de contestar: esa se sigue mostrando).
    const seleccionada = preguntas.find((p) => p.id === seleccionadaId)
        ?? (respondida?.id === seleccionadaId ? respondida : null);

    // ── Mutaciones ───────────────────────────────────────────────────────────

    // Responder impacta en vivo contra Mercado Libre (no hay cola): no hay burbuja
    // optimista, la lista se refresca cuando la API confirma. Lo que sí se guarda
    // es la fila confirmada, para que el hilo no desaparezca del panel al salir
    // del filtro "Sin responder" (ver `respondida`).
    const responder = useMutation({
        mutationFn: ({ id, texto }: { id: number; texto: string; previa: PreguntaMl }) =>
            mercadolibreApi.responder(id, texto),
        onSuccess: (p, vars) => {
            // Con la cuenta simulada la respuesta no se publica en ningún lado:
            // el aviso, aunque dure tres segundos, tampoco puede decir que sí.
            addToast(esSimulada(p) ? 'Respuesta registrada (simulada, no salió a Mercado Libre)' : 'Respuesta publicada en Mercado Libre', 'success');
            // La fila que devuelve el endpoint no trae las relaciones (vehículo,
            // asignado): se apoya sobre la que ya estaba en pantalla para que el
            // detalle no pierda el título ni el vendedor al salir del filtro.
            setRespondida({ ...vars.previa, ...p });
            qc.invalidateQueries({ queryKey: ['ml-preguntas'] });
        },
        onError: (e, vars) => {
            setBorrador((b) => (b ? b : vars.texto)); // no perder lo escrito
            // El mensaje es el de Mercado Libre (p.ej. "item closed"): va textual.
            addToast(getErrorMessage(e, 'No se pudo enviar la respuesta'), 'error');
        },
    });

    const asignar = useMutation({
        mutationFn: ({ id, usuarioId }: { id: number; usuarioId: number | null }) =>
            mercadolibreApi.asignar(id, usuarioId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['ml-preguntas'] }),
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo asignar la pregunta'), 'error'),
    });

    const registrarLead = useMutation({
        mutationFn: ({ id, datos }: { id: number; datos: CrearLeadDto }) =>
            mercadolibreApi.crearLead(id, datos),
        onSuccess: (res) => {
            // El único paso por el que algo simulado se vuelve un dato permanente
            // del CRM: el aviso lo dice, igual que el de responder.
            const simulada = res.simulada === true;
            addToast(
                res.creado
                    ? (simulada
                        ? 'Lead creado a partir de una pregunta simulada: queda en Clientes rotulado como SIMULACIÓN'
                        : 'Lead creado y vinculado a la pregunta')
                    // El contacto cargado a mano matcheó con una ficha REAL. Como
                    // la pregunta era simulada, no se le tocó ni el origen ni el
                    // estado del lead: sólo quedó la línea rotulada.
                    : res.sobreFichaReal === true
                        ? 'Ese contacto ya era de un cliente REAL del CRM. Como la pregunta era simulada, sólo se le anotó la consulta (rotulada) en observaciones: no se le cambió el origen ni se le reabrió el lead.'
                        : 'La pregunta quedó vinculada a un cliente que ya existía',
                'success',
            );
            setLeadAbierto(false);
            qc.invalidateQueries({ queryKey: ['ml-preguntas'] });
            qc.invalidateQueries({ queryKey: ['clientes'] });
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo registrar el lead'), 'error'),
    });

    const sincronizar = useMutation({
        mutationFn: () => mercadolibreApi.sincronizarAhora(),
        // Con la cuenta simulada la pasada no sale a la red: la contesta el
        // simulador leyendo nuestra propia tabla, así que `nuevas` es siempre 0.
        // Decir "no había preguntas nuevas en Mercado Libre" afirmaría que se
        // consultó Mercado Libre, que es exactamente lo que no pasó — y el toast
        // se emite justo cuando el que mira acaba de apretar el botón.
        onSuccess: (res) => {
            addToast(
                res.nuevas > 0
                    ? `Entraron ${res.nuevas} preguntas nuevas${cuentaEsDemo ? ' (simuladas)' : ''}`
                    : (cuentaEsDemo
                        ? 'Pasada simulada: no se consultó Mercado Libre y no entró ninguna pregunta'
                        : 'No había preguntas nuevas en Mercado Libre'),
                'success',
            );
            qc.invalidateQueries({ queryKey: ['ml-preguntas'] });
        },
        onError: (e) => addToast(
            getErrorMessage(e, cuentaEsDemo
                ? 'No se pudo correr la pasada simulada'
                : 'No se pudo sincronizar con Mercado Libre'),
            'error',
        ),
    });

    // Mercado Libre no acepta dos respuestas sobre la misma pregunta: una vez
    // respondida (o borrada por el comprador) el composer queda de sólo lectura.
    const puedeResponder = seleccionada?.estado === 'sin_responder';

    const enviarBorrador = () => {
        const texto = borrador.trim();
        if (!texto || !seleccionada || !puedeResponder) return;
        setBorrador('');
        responder.mutate({ id: seleccionada.id, texto, previa: seleccionada });
    };

    const abrirLead = (p: PreguntaMl) => {
        // Mercado Libre sólo comparte el apodo: el resto lo carga el vendedor.
        setLeadForm({
            nombre: p.nombreContacto ?? '',
            telefono: '',
            email: '',
            vendedorId: p.asignadoAId ? String(p.asignadoAId) : '',
        });
        setLeadAbierto(true);
    };

    const guardarLead = () => {
        if (!seleccionada) return;
        registrarLead.mutate({
            id: seleccionada.id,
            datos: {
                ...(leadForm.nombre.trim() ? { nombre: leadForm.nombre.trim() } : {}),
                ...(leadForm.telefono.trim() ? { telefono: leadForm.telefono.trim() } : {}),
                ...(leadForm.email.trim() ? { email: leadForm.email.trim() } : {}),
                vendedorId: leadForm.vendedorId ? Number(leadForm.vendedorId) : null,
            },
        });
    };

    const vehiculoId = seleccionada?.publicacion?.vehiculo?.id ?? null;

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Preguntas de Mercado Libre" />
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <ShoppingBag size={22} />
                        </div>
                        <h1>Mercado Libre</h1>
                        {bandejaSimulada && <Badge variant="warning">SIMULACIÓN</Badge>}
                    </div>
                    <p>Preguntas de tus publicaciones: respondé, asigná el vendedor y convertí la consulta en un lead.</p>
                    {bandejaSimulada && (
                        <p className="preguntas-nota-simulacion">
                            <strong>Modo demostración:</strong> estas consultas las generó el sistema para mostrar
                            el circuito. No vienen de Mercado Libre y lo que se responda no se publica en ningún lado.
                        </p>
                    )}
                </div>
                {esAdmin && (
                    <div className="header-actions">
                        <Button
                            variant="secondary"
                            size="sm"
                            loading={sincronizar.isPending}
                            title={cuentaEsDemo
                                ? 'Corre la pasada de ingesta contra la cuenta simulada: no se consulta Mercado Libre'
                                : 'Trae las preguntas nuevas sin esperar al worker'}
                            onClick={() => sincronizar.mutate()}
                        >
                            <RefreshCw size={14} /> Sincronizar
                        </Button>
                    </div>
                )}
            </header>

            <div className={`preguntas-layout ${seleccionadaId != null ? 'is-detalle' : ''}`}>
                {/* ── Lista de preguntas ── */}
                <aside className="card preguntas-lista">
                    <div className="preguntas-filtros">
                        <Select
                            dense
                            containerClassName="mb-0"
                            placeholder="Todas"
                            value={estado}
                            options={ESTADOS}
                            onChange={(e) => cambiarEstado(e.target.value as '' | EstadoPreguntaMl)}
                            aria-label="Filtrar por estado"
                        />
                        <label className="preguntas-check">
                            <input
                                type="checkbox"
                                checked={soloMias}
                                onChange={(e) => cambiarSoloMias(e.target.checked)}
                            />
                            <span>Solo las mías</span>
                        </label>
                    </div>

                    <div className="preguntas-items">
                        {listaQuery.isLoading ? (
                            <p className="preguntas-hint">Cargando preguntas…</p>
                        ) : listaQuery.isError ? (
                            <div className="preguntas-hint">
                                <span>No se pudieron cargar las preguntas.</span>
                                <Button variant="secondary" size="sm" onClick={() => listaQuery.refetch()}>
                                    Reintentar
                                </Button>
                            </div>
                        ) : preguntas.length === 0 ? (
                            <p className="preguntas-hint">No hay preguntas con estos filtros.</p>
                        ) : (
                            preguntas.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    className={`preguntas-item ${p.id === seleccionadaId ? 'is-activa' : ''}`}
                                    onClick={() => seleccionar(p.id)}
                                    aria-current={p.id === seleccionadaId}
                                >
                                    <span className="preguntas-item-top">
                                        <span className="preguntas-item-vehiculo truncate">{vehiculoDe(p)}</span>
                                        <span className="preguntas-item-hora">{desdeHace(p.preguntadaEn)}</span>
                                    </span>
                                    <span className="preguntas-item-texto line-clamp-2">{p.texto}</span>
                                    <span className="preguntas-item-badges">
                                        {esSimulada(p) && <Badge variant="warning">SIMULACIÓN</Badge>}
                                        <Badge variant={ESTADO_BADGE[p.estado]}>{ESTADO_LABEL[p.estado]}</Badge>
                                        {p.asignadoA ? (
                                            <Badge variant="violet">{primerNombre(p.asignadoA.nombre)}</Badge>
                                        ) : (
                                            <Badge variant="default">Sin asignar</Badge>
                                        )}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>

                    {totalPages > 1 && (
                        <div className="preguntas-pager">
                            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                        </div>
                    )}
                </aside>

                {/* ── Detalle ── */}
                <section className="card preguntas-detalle">
                    {seleccionadaId == null ? (
                        <div className="preguntas-vacio">
                            <ShoppingBag size={40} className="text-secondary" />
                            <h2>Elegí una pregunta</h2>
                            {/* El panel vacío es lo único que se lee cuando no hay
                                nada abierto: con la cuenta simulada no puede
                                describirse como una bandeja de Mercado Libre. */}
                            <p className="text-secondary">
                                {bandejaSimulada
                                    ? 'Las consultas simuladas de tus publicaciones de demostración aparecen a la izquierda. Abrí una para leerla completa y responder: nada de esto sale a Mercado Libre.'
                                    : 'Las consultas de tus publicaciones de Mercado Libre aparecen a la izquierda. Abrí una para leerla completa y responder.'}
                            </p>
                        </div>
                    ) : !seleccionada ? (
                        <div className="preguntas-vacio">
                            <ShoppingBag size={40} className="text-secondary" />
                            <h2>La pregunta ya no está en el listado</h2>
                            <p className="text-secondary">
                                Cambió de estado o quedó fuera de los filtros actuales.
                            </p>
                            <Button variant="secondary" size="sm" onClick={() => seleccionar(null)}>
                                Volver
                            </Button>
                        </div>
                    ) : (
                        <>
                            <header className="preguntas-detalle-head">
                                <div className="preguntas-detalle-quien">
                                    <button
                                        type="button"
                                        className="icon-btn preguntas-volver"
                                        onClick={() => seleccionar(null)}
                                        aria-label="Volver a la lista"
                                    >
                                        <ArrowLeft size={16} />
                                    </button>
                                    <div className="preguntas-detalle-datos">
                                        <div className="flex items-center gap-2">
                                            {/* minWidth 0: sin eso el título no cede espacio y el chip se sale. */}
                                            <div className="preguntas-detalle-titulo truncate" style={{ minWidth: 0 }}>{vehiculoDe(seleccionada)}</div>
                                            {esSimulada(seleccionada) && <Badge variant="warning">SIMULACIÓN</Badge>}
                                        </div>
                                        <div className="preguntas-detalle-sub">
                                            {/* El apodo de fantasía no puede leerse como un comprador real. */}
                                            {seleccionada.nombreContacto || (esSimulada(seleccionada) ? 'Comprador simulado' : 'Comprador de Mercado Libre')}
                                            {' · '}{fechaHora(seleccionada.preguntadaEn)}
                                        </div>
                                    </div>
                                </div>

                                <div className="preguntas-detalle-acciones">
                                    {vehiculoId && (
                                        <Link to={`/vehiculos/${vehiculoId}`} className="btn btn-secondary btn-sm">
                                            <Car size={14} /> Ver vehículo
                                        </Link>
                                    )}
                                    {/* De una pregunta simulada no hay aviso que abrir: en vez del
                                        link va el texto, nunca algo que parezca ir a Mercado Libre. */}
                                    {esSimulada(seleccionada) ? (
                                        <span className="text-xs text-muted">Publicación simulada: no existe en Mercado Libre</span>
                                    ) : seleccionada.publicacion?.permalink && (
                                        <a
                                            href={seleccionada.publicacion.permalink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn btn-secondary btn-sm"
                                        >
                                            <ExternalLink size={14} /> Publicación
                                        </a>
                                    )}

                                    {seleccionada.clienteId ? (
                                        <Link to={`/clientes/${seleccionada.clienteId}`} className="btn btn-secondary btn-sm">
                                            <User size={14} /> Ver ficha
                                        </Link>
                                    ) : (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            title="Da de alta al interesado como lead y lo vincula a esta pregunta"
                                            onClick={() => abrirLead(seleccionada)}
                                        >
                                            <UserPlus size={14} /> Registrar como lead
                                        </Button>
                                    )}

                                    {esAdmin && (
                                        <Select
                                            dense
                                            containerClassName="mb-0"
                                            placeholder="Sin asignar"
                                            value={seleccionada.asignadoAId ?? ''}
                                            options={vendedores.map((v) => ({ value: v.id, label: v.nombre }))}
                                            disabled={asignar.isPending}
                                            aria-label="Asignar vendedor"
                                            style={{ minWidth: 150 }}
                                            onChange={(e) => {
                                                const valor = e.target.value;
                                                asignar.mutate({
                                                    id: seleccionada.id,
                                                    usuarioId: valor ? Number(valor) : null,
                                                });
                                            }}
                                        />
                                    )}
                                </div>
                            </header>

                            <div className="preguntas-hilo">
                                <div className="preguntas-burbuja is-entrante">
                                    <span className="preguntas-tipo">Pregunta</span>
                                    <p className="preguntas-texto">{seleccionada.texto}</p>
                                    <div className="preguntas-meta">
                                        <span>{fechaHora(seleccionada.preguntadaEn)}</span>
                                    </div>
                                </div>

                                {seleccionada.respuesta && (
                                    <div className="preguntas-burbuja is-saliente">
                                        <span className="preguntas-tipo">Respuesta</span>
                                        <p className="preguntas-texto">{seleccionada.respuesta}</p>
                                        <div className="preguntas-meta">
                                            {seleccionada.respondidaPor && (
                                                <span className="truncate">{primerNombre(seleccionada.respondidaPor.nombre)}</span>
                                            )}
                                            <span>{fechaHora(seleccionada.respondidaEn)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {!puedeResponder && (
                                <p className="preguntas-aviso">
                                    {/* Sobre una pregunta simulada, "Mercado Libre
                                        admite una sola respuesta" daba a entender que
                                        la respuesta quedó publicada allá y que es
                                        Mercado Libre el que bloquea: el bloqueo es de
                                        acá y la respuesta no salió a ningún lado. */}
                                    {seleccionada.estado === 'respondida'
                                        ? (esSimulada(seleccionada)
                                            ? 'Esta pregunta simulada ya fue contestada dentro del sistema: la respuesta no se publicó en ningún lado. La demostración respeta la regla real de una sola respuesta por pregunta.'
                                            : 'Mercado Libre admite una sola respuesta por pregunta: esta ya fue contestada.')
                                        : 'El comprador eliminó la pregunta, así que no se puede responder.'}
                                </p>
                            )}

                            <form
                                className="preguntas-composer"
                                onSubmit={(e) => { e.preventDefault(); enviarBorrador(); }}
                            >
                                <Textarea
                                    dense
                                    rows={2}
                                    containerClassName="mb-0"
                                    value={borrador}
                                    onChange={(e) => setBorrador(e.target.value)}
                                    disabled={!puedeResponder}
                                    aria-label="Respuesta"
                                    placeholder={
                                        puedeResponder
                                            ? 'Escribí la respuesta… (Enter envía, Shift+Enter salto de línea)'
                                            : 'Esta pregunta ya no admite respuesta'
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
                                    disabled={!puedeResponder || !borrador.trim()}
                                    loading={responder.isPending}
                                    aria-label="Responder"
                                >
                                    <Send size={16} /> Responder
                                </Button>
                            </form>
                        </>
                    )}
                </section>
            </div>

            <Modal
                isOpen={leadAbierto}
                onClose={() => setLeadAbierto(false)}
                title="Registrar como lead"
                subtitle={seleccionada ? vehiculoDe(seleccionada) : undefined}
                maxWidth="520px"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setLeadAbierto(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={guardarLead} loading={registrarLead.isPending}>
                            <UserPlus size={16} /> Registrar
                        </Button>
                    </>
                }
            >
                {/* El modal tapa la pantalla rotulada que quedó atrás (el overlay
                    la desenfoca), y es el ÚNICO paso del circuito por el que algo
                    simulado se convierte en un dato permanente del CRM: el rótulo
                    tiene que estar acá adentro, no sólo detrás. */}
                {seleccionada && esSimulada(seleccionada) && (
                    <div className="preguntas-lead-simulada">
                        <Badge variant="warning">SIMULACIÓN</Badge>
                        <p>
                            Esta consulta la <strong>generó el sistema</strong>: no hay ningún interesado del otro
                            lado. El cliente que se cree queda en el CRM marcado como simulación y{' '}
                            <strong>sobrevive a apagar el modo demostración</strong>, así que conviene borrarlo a
                            mano cuando la demostración termine.
                        </p>
                    </div>
                )}

                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 'var(--space-4)' }}>
                    {seleccionada && esSimulada(seleccionada)
                        ? 'Los datos de contacto los cargás vos: en el circuito real Mercado Libre no comparte el teléfono ni el email de quien pregunta.'
                        : (<>Mercado Libre <strong>no comparte el teléfono ni el email</strong> de quien pregunta: si los dejó escritos en la consulta, cargalos a mano acá abajo.</>)}
                </p>

                {seleccionada && (
                    <p className="preguntas-cita">{seleccionada.texto}</p>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                    <Input
                        dense
                        label="Nombre"
                        type="text"
                        containerClassName="col-span-full"
                        placeholder="Nombre del interesado"
                        value={leadForm.nombre}
                        onChange={(e) => setLeadForm((f) => ({ ...f, nombre: e.target.value }))}
                    />
                    <Input
                        dense
                        label="Teléfono"
                        type="tel"
                        placeholder="Ej: 2615551234"
                        value={leadForm.telefono}
                        onChange={(e) => setLeadForm((f) => ({ ...f, telefono: e.target.value }))}
                    />
                    <Input
                        dense
                        label="Email"
                        type="email"
                        placeholder="Ej: nombre@mail.com"
                        value={leadForm.email}
                        onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))}
                    />
                    <Select
                        dense
                        label="Vendedor"
                        containerClassName="col-span-full"
                        placeholder="Asignación automática"
                        value={leadForm.vendedorId}
                        options={vendedores.map((v) => ({ value: v.id, label: v.nombre }))}
                        onChange={(e) => setLeadForm((f) => ({ ...f, vendedorId: e.target.value }))}
                    />
                </div>
            </Modal>

            <style>{`
                /* El aviso de simulación va DEBAJO del subtítulo y tiene que leerse
                   más apagado que él. Con .text-sm/.text-muted no alcanza: index.css
                   trae '.header-title p' (una clase + un elemento) y le gana a
                   cualquier utilidad de una sola clase, así que el aviso salía
                   idéntico al subtítulo. Por eso el selector repite '.header-title p'. */
                .header-title p.preguntas-nota-simulacion {
                    font-size: var(--text-sm);
                    color: var(--text-muted);
                    line-height: 1.5;
                    max-width: 68ch;
                }

                .preguntas-layout {
                    display: grid;
                    grid-template-columns: 340px minmax(0, 1fr);
                    gap: 1rem;
                    align-items: stretch;
                    height: calc(100vh - 15rem);
                    min-height: 460px;
                }
                .preguntas-lista, .preguntas-detalle {
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    padding: 0;
                    overflow: hidden;
                }

                /* Columna izquierda */
                .preguntas-filtros { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.9rem; border-bottom: 1px solid var(--border); }
                .preguntas-check { display: flex; align-items: center; gap: 0.45rem; font-size: var(--text-sm); color: var(--text-secondary); cursor: pointer; }
                .preguntas-items { flex: 1; min-height: 0; overflow-y: auto; }
                .preguntas-item {
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
                .preguntas-item:hover { background: var(--bg-secondary); }
                .preguntas-item.is-activa { background: color-mix(in srgb, var(--accent) 12%, transparent); border-left-color: var(--accent); }
                .preguntas-item-top { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; min-width: 0; }
                .preguntas-item-vehiculo { font-weight: 700; font-size: var(--text-sm); min-width: 0; }
                .preguntas-item-hora { font-size: var(--text-2xs); color: var(--text-muted); flex-shrink: 0; }
                .preguntas-item-texto { font-size: var(--text-xs); color: var(--text-secondary); }
                .preguntas-item-badges { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
                .preguntas-pager { padding: 0 0.75rem 0.75rem; }

                /* Columna derecha */
                .preguntas-detalle-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
                .preguntas-detalle-quien { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
                .preguntas-detalle-datos { min-width: 0; }
                .preguntas-detalle-titulo { font-weight: 700; font-size: var(--text-base); }
                .preguntas-detalle-sub { font-size: var(--text-xs); color: var(--text-muted); }
                .preguntas-detalle-acciones { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
                .preguntas-volver { display: none; }

                .preguntas-hilo { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem; }
                .preguntas-burbuja { max-width: min(80%, 42rem); padding: 0.6rem 0.8rem; border-radius: var(--radius-md); box-shadow: var(--shadow-xs); }
                .preguntas-burbuja.is-entrante { align-self: flex-start; background: var(--bg-secondary); border: 1px solid var(--border); border-bottom-left-radius: var(--radius-xs); }
                .preguntas-burbuja.is-saliente {
                    align-self: flex-end;
                    background: color-mix(in srgb, var(--accent) 16%, var(--bg-card));
                    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
                    border-bottom-right-radius: var(--radius-xs);
                }
                .preguntas-tipo { display: block; font-size: var(--text-2xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 0.15rem; }
                .preguntas-texto { margin: 0; font-size: var(--text-sm); color: var(--text-primary); white-space: pre-wrap; word-break: break-word; }
                .preguntas-meta { display: flex; align-items: center; justify-content: flex-end; gap: 0.3rem; margin-top: 0.2rem; font-size: var(--text-3xs); color: var(--text-muted); font-variant-numeric: tabular-nums; }

                .preguntas-aviso { margin: 0; padding: 0.6rem 0.75rem 0; font-size: var(--text-xs); color: var(--text-muted); }
                .preguntas-composer { display: flex; align-items: flex-end; gap: 0.5rem; padding: 0.75rem; border-top: 1px solid var(--border); }
                .preguntas-composer .input-group { flex: 1; min-width: 0; }

                .preguntas-vacio { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem; text-align: center; }
                .preguntas-vacio h2 { font-size: var(--text-lg); }
                .preguntas-vacio p { font-size: var(--text-sm); max-width: 42ch; }
                .preguntas-hint { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 1.25rem; text-align: center; font-size: var(--text-sm); color: var(--text-secondary); }

                /* Rótulo de simulación DENTRO del modal del lead. Va con el mismo
                   lenguaje visual que el aviso de la cabecera, pero acá el aviso es
                   más fuerte: lo que sale de este modal no se borra al apagar la
                   demostración. */
                .preguntas-lead-simulada {
                    display: flex;
                    gap: 0.6rem;
                    align-items: flex-start;
                    margin-bottom: var(--space-4);
                    padding: 0.6rem 0.75rem;
                    border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);
                    border-radius: var(--radius-sm);
                    background: color-mix(in srgb, var(--warning) 10%, transparent);
                }
                .preguntas-lead-simulada p {
                    margin: 0;
                    font-size: var(--text-sm);
                    color: var(--text-secondary);
                    line-height: 1.5;
                }

                /* Cita de la pregunta dentro del modal del lead: de ahí se copian
                   el teléfono o el mail que Mercado Libre no manda. */
                .preguntas-cita {
                    margin: 0 0 var(--space-4);
                    padding: 0.6rem 0.8rem;
                    border-left: 3px solid var(--border);
                    background: var(--bg-secondary);
                    border-radius: var(--radius-xs);
                    font-size: var(--text-sm);
                    color: var(--text-secondary);
                    white-space: pre-wrap;
                    word-break: break-word;
                }

                /* ≤768px: una sola columna. Sin pregunta elegida se ve la lista; al
                   abrir una, el detalle ocupa todo y se vuelve con la flecha. */
                @media (max-width: 768px) {
                    .preguntas-layout { grid-template-columns: minmax(0, 1fr); height: calc(100vh - 12rem); }
                    .preguntas-layout .preguntas-detalle { display: none; }
                    .preguntas-layout.is-detalle .preguntas-lista { display: none; }
                    .preguntas-layout.is-detalle .preguntas-detalle { display: flex; }
                    .preguntas-volver { display: inline-flex; }
                    .preguntas-burbuja { max-width: 90%; }
                }
            `}</style>
        </div>
    );
};

export default PreguntasPage;
