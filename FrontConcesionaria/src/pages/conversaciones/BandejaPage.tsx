import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    MessageCircle,
    MessageSquare,
    Instagram,
    Facebook,
    Inbox,
    Search,
    Send,
    Share2,
    ArrowLeft,
    User,
    UserPlus,
    Check,
    CheckCheck,
    Clock,
    AlertTriangle,
    Lock,
    RotateCcw,
    type LucideIcon,
} from 'lucide-react';
import {
    conversacionesApi,
    type CanalConversacion,
    type ConversacionDetalle,
    type ConversacionFilter,
    type DatosConsultaManual,
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
import Badge, { type BadgeVariant } from '../../components/ui/Badge';
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

/** Cómo se ve cada canal en la bandeja.
 *
 *  El sistema visual es deliberado: el COLOR dice por qué plataforma entró
 *  (emerald = WhatsApp, violeta = Instagram, cyan = Facebook/Messenger, los
 *  mismos que usa ConsultasPage para el origen del cliente) y la FORMA del
 *  ícono dice qué tipo de charla es (el logo de la plataforma = mensaje
 *  privado, el bocadillo cuadrado = comentario público). Así se distingue un
 *  DM de Instagram de un comentario de Instagram sin leer una palabra.
 *
 *  `publico` es el que manda la advertencia del composer, y `plataforma` es el
 *  nombre que se usa en las frases ("Instagram no deja escribirle…"): decirle
 *  al vendedor "instagram_comentario" sería el error críptico que queremos
 *  evitar. */
interface CanalMeta {
    /** Etiqueta corta: entra en un badge de la columna de 340px. */
    label: string;
    /** Nombre largo, para la cabecera del hilo y los tooltips. */
    largo: string;
    /** Cómo se llama la plataforma en una frase en criollo. */
    plataforma: string;
    variant: BadgeVariant;
    icono: LucideIcon;
    /** Token de color del ícono, alineado con el `variant` del badge. */
    color: string;
    /** true = responder acá publica a la vista de cualquiera. */
    publico: boolean;
}

const CANAL_META: Record<CanalConversacion, CanalMeta> = {
    whatsapp: {
        label: 'WhatsApp', largo: 'WhatsApp', plataforma: 'WhatsApp',
        variant: 'success', icono: MessageCircle, color: 'var(--accent)', publico: false,
    },
    instagram: {
        label: 'Instagram', largo: 'Mensaje directo de Instagram', plataforma: 'Instagram',
        variant: 'violet', icono: Instagram, color: 'var(--accent-2)', publico: false,
    },
    messenger: {
        label: 'Messenger', largo: 'Mensaje de Messenger', plataforma: 'Messenger',
        variant: 'cyan', icono: Facebook, color: 'var(--accent-3)', publico: false,
    },
    instagram_comentario: {
        label: 'Coment. IG', largo: 'Comentario en una publicación de Instagram', plataforma: 'Instagram',
        variant: 'violet', icono: MessageSquare, color: 'var(--accent-2)', publico: true,
    },
    facebook_comentario: {
        label: 'Coment. FB', largo: 'Comentario en la página de Facebook', plataforma: 'Facebook',
        variant: 'cyan', icono: MessageSquare, color: 'var(--accent-3)', publico: true,
    },
};

/** Orden de los chips del filtro. Explícito y no `Object.keys`: el orden de las
 *  claves de un enum de Prisma no es un contrato de UI. */
const CANALES: CanalConversacion[] = [
    'whatsapp', 'instagram', 'messenger', 'instagram_comentario', 'facebook_comentario',
];

/** Canal desconocido: si el backend suma un canal que este front todavía no
 *  conoce, el hilo se ve con un badge neutro en vez de tumbar la página con un
 *  `undefined.label`. */
const CANAL_DESCONOCIDO: CanalMeta = {
    label: 'Otro', largo: 'Canal no reconocido', plataforma: 'la plataforma',
    variant: 'default', icono: MessageSquare, color: 'var(--text-muted)', publico: false,
};

const canalMeta = (canal?: string | null): CanalMeta =>
    CANAL_META[canal as CanalConversacion] ?? CANAL_DESCONOCIDO;

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

/** Milisegundos que faltan para el cierre de la ventana de Meta, o null si el
 *  hilo no tiene ventana (WhatsApp, comentarios, o el backend no la sabe). */
const restanteVentana = (venceAt: string | null | undefined, ahora: number): number | null => {
    if (!venceAt) return null;
    const t = new Date(venceAt).getTime();
    return Number.isNaN(t) ? null : t - ahora;
};

/** "1 h 20 min" / "18 min". Sin segundos: la precisión al minuto alcanza y no
 *  obliga a un ticker de un segundo. */
const restanteCorto = (ms: number): string => {
    const minutos = Math.max(0, Math.floor(ms / 60_000));
    const horas = Math.floor(minutos / 60);
    return horas > 0 ? `${horas} h ${minutos % 60} min` : `${minutos} min`;
};

/** Menos de 2 h: el vendedor todavía llega si contesta ahora. */
const MARGEN_AVISO_MS = 2 * 60 * 60 * 1000;

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
    // '' = todos los canales, y es el default a propósito: el vendedor atiende
    // consultas, no canales. El filtro está para cuando quiere el foco, no para
    // obligarlo a elegir por dónde mira.
    const [canal, setCanal] = useState<'' | CanalConversacion>('');
    const [sinResponder, setSinResponder] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const q = useDebounce(busqueda, 300);
    const [page, setPage] = useState(1);

    const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null);
    const [borrador, setBorrador] = useState('');
    // Último rechazo del backend, TEXTUAL. Vive fuera del toast porque el toast
    // se va solo y en Meta este texto es el que dice qué permiso falta.
    const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

    // Alta manual del contacto como consulta (ver `faltanDatosDelContacto`).
    const [altaAbierta, setAltaAbierta] = useState(false);
    const [nombreConsulta, setNombreConsulta] = useState('');
    const [telefonoConsulta, setTelefonoConsulta] = useState('');

    // Todo cambio de filtro vuelve a la página 1, y abrir/cerrar un hilo limpia el
    // borrador: se resuelve en el handler (no en un efecto, que encadenaría renders).
    const cambiarEstado = (valor: '' | EstadoConversacion) => { setEstado(valor); setPage(1); };
    const cambiarCanal = (valor: '' | CanalConversacion) => { setCanal(valor); setPage(1); };
    const cambiarSinResponder = (valor: boolean) => { setSinResponder(valor); setPage(1); };
    const cambiarBusqueda = (valor: string) => { setBusqueda(valor); setPage(1); };
    const seleccionar = (id: number | null) => {
        setSeleccionadaId(id);
        setBorrador('');
        setErrorEnvio(null); // el error es del hilo anterior
        // Los datos cargados a mano son de ESE contacto: no se arrastran.
        setAltaAbierta(false);
        setNombreConsulta('');
        setTelefonoConsulta('');
    };

    const filtros = useMemo<ConversacionFilter>(() => ({
        ...(estado ? { estado } : {}),
        ...(canal ? { canal } : {}),
        ...(sinResponder ? { sinResponder: true } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
    }), [estado, canal, sinResponder, q]);

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

    // El POST no despacha: encola el saliente por el canal del hilo. Pintamos la
    // burbuja optimista en 'pendiente' — que es justo el estado con el que nace.
    // Puede fallar en el acto con un error de dominio (ventana de Meta cerrada,
    // permiso faltante): ese texto se muestra tal cual, ver `errorEnvio`.
    const enviar = useMutation({
        mutationFn: ({ id, contenido }: { id: number; contenido: string }) =>
            conversacionesApi.enviarMensaje(id, contenido),
        onMutate: async ({ id, contenido }) => {
            setErrorEnvio(null);
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
            // El toast avisa; el cartel sobre el composer es el que queda. En
            // Meta el motivo del rechazo (qué permiso falta, ventana cerrada)
            // sólo está en este texto, y un toast de 4 s se lo lleva puesto.
            const motivo = getErrorMessage(e, 'No se pudo encolar el mensaje');
            setErrorEnvio(motivo);
            addToast(motivo, 'error');
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

    // El alta puede llevar los datos que el vendedor completó a mano: en Meta el
    // hilo puede no traer ni nombre ni teléfono, y el toast tiene que decir lo
    // que REALMENTE quedó en la ficha, no un "listo" que no se cumple.
    const registrar = useMutation({
        mutationFn: ({ id, datos }: { id: number; datos: DatosConsultaManual }) =>
            conversacionesApi.registrarConsulta(id, datos),
        onSuccess: (res, vars) => {
            const conTelefono = !!(vars.datos.telefono?.trim() || hilo?.telefono);
            addToast(
                !res.creado
                    ? 'Consulta registrada sobre un cliente que ya existía'
                    : conTelefono
                        ? 'Consulta registrada: se creó el cliente y quedó vinculado al chat'
                        : 'Consulta registrada: el cliente quedó SIN teléfono. Completá el contacto en su ficha.',
                'success',
            );
            setAltaAbierta(false);
            setNombreConsulta('');
            setTelefonoConsulta('');
            qc.invalidateQueries({ queryKey: ['conversacion', vars.id] });
            qc.invalidateQueries({ queryKey: ['conversaciones'] });
            qc.invalidateQueries({ queryKey: ['clientes'] });
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo registrar la consulta'), 'error'),
    });

    // ── Canal del hilo abierto ───────────────────────────────────────────────
    // Ojo con el nombre: es la ficha visual DEL CANAL, no "Meta" la empresa.
    //
    // El canal se resuelve TAMBIÉN desde la fila de la lista, que ya lo trae y
    // ya lo usa para el badge. Mientras el detalle está en vuelo `hilo` es
    // undefined —pasa en CADA cambio de hilo, no sólo si falla la red— y sin
    // esto el composer se pintaba como un chat privado de WhatsApp aunque el
    // hilo fuera un comentario público. El dato estaba a mano: sólo había que
    // mirarlo.
    const filaSeleccionada = conversaciones.find((c) => c.id === seleccionadaId) ?? null;
    const canalDelHilo = hilo?.canal ?? filaSeleccionada?.canal ?? null;
    const metaHilo = canalMeta(canalDelHilo);
    const IconoHilo = metaHilo.icono;

    // Sólo bloqueamos el envío cuando SABEMOS que el número está caído. Sin la
    // lista de cuentas (vendedor) se deja encolar: el worker despacha cuando vuelva.
    // El `canal === 'whatsapp'` es explícito para que un hilo de Meta —donde
    // whatsappCuentaId es null— no caiga acá por accidente si algún día una
    // cuenta llega con id null en la lista.
    const cuenta = hilo?.canal === 'whatsapp'
        ? (cuentasQuery.data?.find((c) => c.id === hilo.whatsappCuentaId) ?? null)
        : null;
    const cuentaCaida = !!cuenta && cuenta.estado !== 'conectado';

    // ── Condiciones de envío (las manda resueltas el backend) ────────────────
    // Acá NO se reimplementan las reglas de Meta: si se puede escribir, por qué
    // no, si la respuesta es pública y cuánto entra lo decide conversacionService
    // y lo repite el 409 al encolar. El front sólo lo pinta — así el vendedor
    // lee siempre la misma frase, venga del pre-chequeo o del rechazo.
    //
    // Los defaults son PESIMISTAS a propósito. Antes, sin el detalle cargado,
    // `puedeEnviar` caía en true y `esPublico` en false: el composer quedaba
    // habilitado, con el placeholder de WhatsApp y el botón "Enviar", y un
    // comentario público se podía publicar sin haber visto nunca la palabra
    // "público". Equivocarse hacia "no se puede escribir todavía" cuesta un
    // segundo de espera; equivocarse hacia el otro lado publica un precio con
    // descuento abajo de la publicación.
    const envio = hilo?.envio ?? null;
    const puedeEnviar = envio ? envio.puedeEnviar : false;
    const esPublico = envio?.respuestaPublica ?? metaHilo.publico;
    const limiteCaracteres = envio?.limiteCaracteres ?? 4096;
    const venceAt = envio?.aplicaVentana ? envio.ventanaVenceAt : null;

    // Reloj propio, y no `Date.now()` suelto en el render. El hilo se refresca
    // cada 3 s, pero TanStack comparte la estructura de la respuesta: si nada
    // cambió devuelve la MISMA referencia y no hay re-render, con lo que la
    // cuenta regresiva se congelaría y el bloqueo no llegaría a caer nunca.
    // 30 s alcanza: la ventana se cuenta en minutos, no en segundos.
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setAhora(Date.now()), 30_000);
        return () => window.clearInterval(id);
    }, []);

    const msRestantes = restanteVentana(venceAt, ahora);
    // Se avisa que quedan pocas horas sólo mientras todavía se puede escribir.
    const ventanaPorVencer = puedeEnviar
        && msRestantes != null && msRestantes > 0 && msRestantes < MARGEN_AVISO_MS;
    // El reloj del navegador puede ir atrasado respecto del server: si el
    // vencimiento ya pasó del lado del front pero el backend todavía deja
    // enviar, mandamos igual y que decida el backend — bloquear de más es
    // peor que un 409 con el motivo escrito.
    //
    // `!hilo` bloquea explícito (aunque `puedeEnviar` ya sea false sin `envio`):
    // sin el detalle no sabemos si la respuesta sería pública ni si la ventana
    // sigue abierta, así que no se escribe hasta que cargue.
    const bloqueado = cuentaCaida || !puedeEnviar || !hilo;

    // Un DM de Instagram corta en 1000 caracteres: el aviso aparece en el último
    // 15% para que la respuesta larga no se trunque sin que nadie se entere.
    const cercaDelTope = borrador.length > limiteCaracteres * 0.85;
    // Pasarse NO se corta en silencio. El `maxLength` del textarea recortaba el
    // pegado sin avisar —el vendedor pegaba la ficha del auto y mandaba media—,
    // que es exactamente lo que el backend evita rechazando con un 400 explícito.
    // Acá se frena el envío y se dice cuánto sobra; el 400 queda de red.
    const sobran = borrador.trim().length - limiteCaracteres;

    const enviarBorrador = () => {
        const texto = borrador.trim();
        if (!texto || seleccionadaId == null || bloqueado) return;
        if (texto.length > limiteCaracteres) {
            setErrorEnvio(
                `Te pasaste por ${texto.length - limiteCaracteres} caracteres: en ${metaHilo.plataforma} `
                + `entran hasta ${limiteCaracteres}. Recortá el mensaje o mandalo en dos.`,
            );
            return;
        }
        setBorrador('');
        enviar.mutate({ id: seleccionadaId, contenido: texto });
    };

    // Sin nombre y sin teléfono (un DM de Instagram cuyo perfil no se pudo
    // resolver) el hilo igual tiene que titularse con algo: el badge de canal
    // que está al lado ya dice por dónde entró. Mientras carga el detalle se usa
    // lo que ya trajo la lista, así el encabezado no parpadea en blanco.
    const contactoFila = filaSeleccionada
        ? (filaSeleccionada.nombreContacto || filaSeleccionada.telefono || 'Sin nombre')
        : '';
    const nombreHilo = hilo ? (hilo.nombreContacto || hilo.telefono || 'Sin nombre') : contactoFila;
    const tratamiento = hilo?.nombreContacto ? primerNombre(hilo.nombreContacto) : 'esta persona';
    const abierta = hilo?.estado === 'abierta';

    // ── Registrar como consulta ──────────────────────────────────────────────
    // En Meta el hilo puede no tener NI nombre NI teléfono (un DM de Instagram
    // sin perfil resuelto). Registrarlo así creaba un cliente llamado
    // "Contacto 17841400123456789", sin forma de contactarlo ni de deduplicarlo,
    // y el toast lo anunciaba como un alta limpia. Ahora se le piden los datos a
    // quien los tiene delante: el vendedor que está leyendo la charla.
    const faltanDatosDelContacto = !!hilo && !hilo.nombreContacto && !hilo.telefono;
    const registrarDirecto = () => {
        if (!hilo) return;
        registrar.mutate({ id: hilo.id, datos: {} });
    };
    const confirmarAltaManual = () => {
        if (!hilo) return;
        registrar.mutate({
            id: hilo.id,
            datos: { nombre: nombreConsulta.trim(), telefono: telefonoConsulta.trim() },
        });
    };

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Bandeja" />
            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow">
                            <Inbox size={22} />
                        </div>
                        <h1>Bandeja</h1>
                    </div>
                    {/* Una línea: los cuatro canales ya los nombran los chips del
                        filtro, y en el celular cada renglón de más empuja el
                        composer fuera de la pantalla. */}
                    <p>Todos los canales en una sola lista: respondé, asigná y convertí la charla en consulta.</p>
                </div>
            </header>

            <div className={`bandeja-layout ${seleccionadaId != null ? 'is-hilo' : ''}`}>
                {/* ── Lista de conversaciones ── */}
                <aside className="card bandeja-lista">
                    <div className="bandeja-filtros">
                        {/* Chips de canal: reusan .segmented/.segmented-btn del design system
                            (los mismos de Reportes y Gastos) y sólo se les achica la métrica
                            acá, porque la columna mide 340px. El chip activo muestra el
                            nombre y los demás quedan en ícono: así entra todo en una fila
                            sin perder de vista por qué canal se está filtrando. */}
                        <div className="segmented bandeja-canales" role="tablist" aria-label="Filtrar por canal">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={canal === ''}
                                className={`segmented-btn ${canal === '' ? 'is-active' : ''}`}
                                onClick={() => cambiarCanal('')}
                                title="Ver todos los canales"
                            >
                                <MessageCircle size={14} aria-hidden="true" />
                                {canal === '' && <span className="bandeja-canal-txt">Todos</span>}
                            </button>
                            {CANALES.map((c) => {
                                const m = CANAL_META[c];
                                const Icono = m.icono;
                                const activo = canal === c;
                                return (
                                    <button
                                        key={c}
                                        type="button"
                                        role="tab"
                                        aria-selected={activo}
                                        aria-label={m.largo}
                                        className={`segmented-btn ${activo ? 'is-active' : ''}`}
                                        onClick={() => cambiarCanal(c)}
                                        title={m.largo}
                                    >
                                        <Icono
                                            size={14}
                                            aria-hidden="true"
                                            style={activo ? undefined : { color: m.color }}
                                        />
                                        {activo && <span className="bandeja-canal-txt">{m.label}</span>}
                                    </button>
                                );
                            })}
                        </div>
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
                            conversaciones.map((c) => {
                                const m = canalMeta(c.canal);
                                const IconoCanal = m.icono;
                                // Sólo se avisa lo accionable: "quedan 40 min". El vencido no
                                // ocupa lugar en la lista — se explica entero al abrir el hilo.
                                const restante = restanteVentana(c.ventanaVenceAt, ahora);
                                const porVencer = restante != null && restante > 0 && restante < MARGEN_AVISO_MS;
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        className={`bandeja-item ${c.id === seleccionadaId ? 'is-activa' : ''}`}
                                        onClick={() => seleccionar(c.id)}
                                        aria-current={c.id === seleccionadaId}
                                    >
                                        <span className="bandeja-item-top">
                                            <IconoCanal
                                                size={13}
                                                className="bandeja-item-canal"
                                                style={{ color: m.color }}
                                                aria-hidden="true"
                                            />
                                            <span className="bandeja-item-nombre truncate">
                                                {c.nombreContacto || c.telefono || 'Sin nombre'}
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
                                            <Badge variant={m.variant} title={`Entró por ${m.largo}`}>
                                                {m.label}
                                            </Badge>
                                            {c.asignadoA ? (
                                                <Badge variant="violet">{primerNombre(c.asignadoA.nombre)}</Badge>
                                            ) : (
                                                <Badge variant="default">Sin asignar</Badge>
                                            )}
                                            {c.estado !== 'abierta' && (
                                                <Badge variant="warning">{ESTADO_LABEL[c.estado]}</Badge>
                                            )}
                                            {porVencer && (
                                                // "para poder responder" se leía al revés ("faltan 40
                                                // minutos hasta que pueda contestarle") y el aviso que
                                                // existe para apurar invitaba a esperar. Es una cuenta
                                                // regresiva HACIA EL CIERRE, y el rótulo visible va en el
                                                // badge porque "40 min" suelto, al lado de la hora del
                                                // último mensaje, también se lee como antigüedad.
                                                <Badge
                                                    variant="warning"
                                                    title={`Te quedan ${restanteCorto(restante)} para responderle por ${m.plataforma} antes de que se cierre la ventana de 24 h`}
                                                >
                                                    <Clock size={11} aria-hidden="true" /> {restanteCorto(restante)} p/ responder
                                                </Badge>
                                            )}
                                            {c.noLeidos > 0 && (
                                                <span className="bandeja-nolei" title={`${c.noLeidos} sin leer`}>
                                                    {c.noLeidos}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })
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
                            <Inbox size={40} className="text-secondary" />
                            <h2>Elegí una conversación</h2>
                            <p className="text-secondary">
                                Todo lo que entra —chats de WhatsApp, mensajes de Instagram y Messenger,
                                comentarios en las publicaciones— aparece a la izquierda, con una etiqueta que
                                dice por dónde vino. Abrí uno para leer el historial y responder.
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
                                        {/* Segunda línea: el teléfono cuando lo hay, y si no, por dónde
                                            entró el hilo — que es el dato que lo identifica cuando no
                                            hay número (un DM de Instagram, un comentario). */}
                                        <div className="bandeja-hilo-tel">
                                            {/* Gateado por el CANAL y no por `hilo`: en el celular la
                                                lista se oculta al abrir un hilo, así que este badge es la
                                                ÚNICA señal de por dónde entró la charla. Esperar al
                                                detalle la hacía desaparecer justo cuando más falta hace. */}
                                            {canalDelHilo && (
                                                <>
                                                    <Badge variant={metaHilo.variant} title={metaHilo.largo}>
                                                        <IconoHilo size={11} aria-hidden="true" /> {metaHilo.label}
                                                    </Badge>
                                                    <span className="truncate">
                                                        {hilo?.telefono || metaHilo.largo}
                                                    </span>
                                                </>
                                            )}
                                        </div>
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
                                            title={faltanDatosDelContacto
                                                ? 'Este chat no tiene nombre ni teléfono: hay que completarlos para dar de alta al cliente'
                                                : 'Da de alta el contacto como consulta y lo vincula a este chat'}
                                            onClick={() => (faltanDatosDelContacto
                                                ? setAltaAbierta((v) => !v)
                                                : registrarDirecto())}
                                        >
                                            <UserPlus size={14} />
                                            {faltanDatosDelContacto ? 'Completar datos y registrar' : 'Registrar como consulta'}
                                        </Button>
                                    )}

                                    <Select
                                        dense
                                        // El ancho salió del style inline a una clase para poder
                                        // achicarlo en el celular: con 150px fijos la fila de
                                        // acciones se partía en tres y el header se comía la
                                        // mitad de la pantalla.
                                        containerClassName="mb-0 bandeja-asignar"
                                        placeholder="Sin asignar"
                                        value={hilo?.asignadoAId ?? ''}
                                        options={vendedores.map((v) => ({ value: v.id, label: v.nombre }))}
                                        disabled={!hilo || actualizar.isPending}
                                        aria-label="Asignar vendedor"
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
                                                {/* El motivo del rechazo. Viene YA redactado en criollo
                                                    desde el backend (el worker traduce el código de Meta
                                                    y deja el volcado del Graph API en el log, y a los
                                                    errores de Baileys les pone una frase fija): acá se
                                                    muestra tal cual, sin volver a interpretarlo. */}
                                                {m.estado === 'fallido' && m.errorMensaje && (
                                                    <p className="bandeja-fallo">
                                                        <AlertTriangle size={12} aria-hidden="true" />
                                                        <span>{m.errorMensaje}</span>
                                                    </p>
                                                )}
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

                            {/* Alta manual del contacto: sólo cuando el hilo no tiene ni nombre
                                ni teléfono. Se pide ACÁ y no después, en la ficha, porque el
                                único que sabe cómo se llama esa persona es el vendedor que
                                está leyendo la charla. */}
                            {altaAbierta && faltanDatosDelContacto && (
                                <form
                                    className="bandeja-alta"
                                    onSubmit={(e) => { e.preventDefault(); confirmarAltaManual(); }}
                                >
                                    <p className="bandeja-alta-txt">
                                        Este chat entró por {metaHilo.plataforma} y no trae nombre ni teléfono.
                                        Completalos para que el cliente quede contactable desde el CRM.
                                    </p>
                                    <div className="bandeja-alta-campos">
                                        <Input
                                            dense
                                            containerClassName="mb-0"
                                            placeholder="Nombre del contacto"
                                            value={nombreConsulta}
                                            onChange={(e) => setNombreConsulta(e.target.value)}
                                            aria-label="Nombre del contacto"
                                            maxLength={150}
                                        />
                                        <Input
                                            dense
                                            containerClassName="mb-0"
                                            placeholder="Teléfono (opcional)"
                                            value={telefonoConsulta}
                                            onChange={(e) => setTelefonoConsulta(e.target.value)}
                                            aria-label="Teléfono del contacto"
                                            maxLength={40}
                                        />
                                    </div>
                                    <div className="bandeja-alta-acciones">
                                        <Button
                                            type="submit"
                                            size="sm"
                                            disabled={!nombreConsulta.trim()}
                                            loading={registrar.isPending}
                                        >
                                            <UserPlus size={14} /> Registrar consulta
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setAltaAbierta(false)}
                                        >
                                            Cancelar
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {cuentaCaida && (
                                <p className="bandeja-aviso">
                                    <AlertTriangle size={14} />
                                    El número {cuenta?.alias} no está conectado ({cuenta?.estado}). Reconectalo desde
                                    la configuración de WhatsApp para poder responder.
                                </p>
                            )}

                            {/* Sin el detalle cargado no se sabe si la respuesta sería pública ni
                                si la ventana sigue abierta: se dice por qué no se puede escribir
                                todavía, en vez de dejar la caja habilitada como si nada. */}
                            {!hilo && (
                                <p className="bandeja-aviso is-bloqueo">
                                    <Lock size={14} aria-hidden="true" />
                                    <span>
                                        {hiloQuery.isError
                                            ? 'No se pudo cargar la conversación, así que no se puede responder todavía. Probá con "Reintentar".'
                                            : 'Cargando la conversación… vas a poder responder en cuanto termine.'}
                                    </span>
                                </p>
                            )}

                            {/* Ventana de 24 h de Meta. Se avisa ANTES de escribir, no después
                                de que el vendedor redactó media página y le rebotó el envío. El
                                texto es el del backend, tal cual: ahí está escrito en criollo y
                                es el mismo que devolvería el 409 si igual intentara mandar. */}
                            {!puedeEnviar && envio?.motivo && (
                                <p className="bandeja-aviso is-bloqueo">
                                    <Lock size={14} aria-hidden="true" />
                                    <span>{envio.motivo}</span>
                                </p>
                            )}
                            {ventanaPorVencer && msRestantes != null && (
                                <p className="bandeja-aviso">
                                    <Clock size={14} aria-hidden="true" />
                                    <span>
                                        Quedan {restanteCorto(msRestantes)} para responderle por
                                        {' '}{metaHilo.plataforma}: a las 24 horas del último mensaje de
                                        {' '}{tratamiento} se cierra y hay que esperar a que escriba de nuevo.
                                    </span>
                                </p>
                            )}
                            {/* Un vendedor que cree que contesta en privado y publica un
                                precio a la vista de todos es un problema real: el aviso está
                                siempre, no sólo cuando ya escribió. */}
                            {esPublico && (
                                <p className="bandeja-aviso is-publico">
                                    <Share2 size={14} aria-hidden="true" />
                                    <span>
                                        Esto es un comentario: tu respuesta se publica en {metaHilo.plataforma},
                                        {' '}abajo de la publicación, y la ve cualquiera que entre.
                                    </span>
                                </p>
                            )}
                            {/* Pasarse del tope se avisa MIENTRAS escribe, no al apretar Enviar:
                                antes el textarea recortaba el pegado en silencio y el cliente
                                recibía la ficha del auto cortada a la mitad de una palabra. */}
                            {sobran > 0 && (
                                <p className="bandeja-aviso is-error" role="alert">
                                    <AlertTriangle size={14} aria-hidden="true" />
                                    <span>
                                        Te pasaste por {sobran} caracteres: en {metaHilo.plataforma} entran hasta
                                        {' '}{limiteCaracteres}. Recortá el mensaje o mandalo en dos.
                                    </span>
                                </p>
                            )}
                            {errorEnvio && (
                                <p className="bandeja-aviso is-error" role="alert">
                                    <AlertTriangle size={14} aria-hidden="true" />
                                    <span>No se pudo enviar: {errorEnvio}</span>
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
                                    disabled={bloqueado}
                                    // SIN maxLength a propósito: el atributo recorta el PEGADO en
                                    // silencio, que es peor que rechazar. El tope se avisa arriba
                                    // (`sobran`) y lo vuelve a validar el backend con un 400.
                                    aria-label={esPublico ? 'Respuesta pública al comentario' : 'Mensaje'}
                                    // El hint sólo aparece cerca del tope: un contador siempre
                                    // visible es ruido, y el corte de Instagram (1000) sorprende.
                                    hint={cercaDelTope && sobran <= 0
                                        ? `Quedan ${limiteCaracteres - borrador.length} caracteres de ${limiteCaracteres} en ${metaHilo.plataforma}`
                                        : undefined}
                                    placeholder={
                                        !hilo
                                            ? 'Cargando la conversación…'
                                            : !puedeEnviar
                                                ? `No se puede escribir por ${metaHilo.plataforma} en este momento`
                                                : cuentaCaida
                                                    ? 'El número de WhatsApp no está conectado'
                                                    : esPublico
                                                        ? 'Escribí la respuesta… se publica a la vista de todos'
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
                                    disabled={bloqueado || !borrador.trim() || sobran > 0}
                                    loading={enviar.isPending}
                                    aria-label={esPublico ? 'Publicar respuesta' : 'Enviar mensaje'}
                                    title={esPublico
                                        ? 'La respuesta queda publicada en el comentario, a la vista de todos'
                                        : undefined}
                                >
                                    <Send size={16} /> {esPublico ? 'Publicar' : 'Enviar'}
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

                /* Chips de canal. Se califica con .segmented (dos clases) a
                   propósito: así gana por especificidad y no por orden de
                   inyección del <style>, que es frágil. Acá sólo va MÉTRICA:
                   ni una regla de color, para no pisar el .segmented-btn.is-active
                   del design system (que es 0,2,0 y perdería contra un
                   .bandeja-canales .segmented-btn de 0,3,0). */
                .segmented.bandeja-canales {
                    display: flex;
                    width: 100%;
                    gap: 0.15rem;
                    padding: 0.2rem;
                    overflow-x: auto;
                    scrollbar-width: none;
                }
                .segmented.bandeja-canales::-webkit-scrollbar { display: none; }
                .segmented.bandeja-canales .segmented-btn {
                    flex: 0 0 auto;
                    gap: 0.3rem;
                    padding: 0.3rem 0.55rem;
                    font-size: var(--text-xs);
                }
                .bandeja-canal-txt { white-space: nowrap; }
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
                /* flex:1 para que el nombre se pegue al ícono de canal y empuje la
                   hora contra el borde: con el space-between del contenedor y tres
                   hijos, si no, el nombre queda flotando en el medio. */
                .bandeja-item-nombre { flex: 1 1 auto; font-weight: 700; font-size: var(--text-sm); min-width: 0; }
                .bandeja-item-hora { font-size: var(--text-2xs); color: var(--text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
                .bandeja-item-prev { display: flex; gap: 0.3rem; min-width: 0; font-size: var(--text-xs); color: var(--text-secondary); }
                .bandeja-item-vos { color: var(--text-muted); flex-shrink: 0; }
                .bandeja-item-canal { align-self: center; flex-shrink: 0; }
                .bandeja-item-badges { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
                /* Con el badge de canal son hasta cuatro chips en una columna de
                   340px: se achican acá y no en index.css. Sólo métrica — el color
                   lo siguen poniendo .badge-emerald/.badge-violet/etc. */
                .bandeja-item-badges .badge { padding: 0.1rem 0.4rem; font-size: var(--text-3xs); letter-spacing: 0.04em; gap: 0.2rem; }
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
                .bandeja-hilo-tel { display: flex; align-items: center; gap: 0.35rem; min-width: 0; font-size: var(--text-xs); color: var(--text-muted); font-variant-numeric: tabular-nums; }
                .bandeja-hilo-tel .badge { padding: 0.1rem 0.4rem; font-size: var(--text-3xs); letter-spacing: 0.04em; gap: 0.2rem; flex-shrink: 0; }
                .bandeja-hilo-acciones { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
                .bandeja-asignar { min-width: 150px; }
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
                .bandeja-fallo { display: flex; align-items: flex-start; gap: 0.3rem; margin: 0.3rem 0 0; padding-top: 0.3rem; border-top: 1px dashed color-mix(in srgb, var(--danger) 40%, transparent); font-size: var(--text-2xs); line-height: 1.4; color: var(--danger); word-break: break-word; }
                .bandeja-fallo > svg { flex-shrink: 0; margin-top: 0.1rem; }
                .bandeja-meta { display: flex; align-items: center; justify-content: flex-end; gap: 0.3rem; margin-top: 0.2rem; font-size: var(--text-3xs); color: var(--text-muted); font-variant-numeric: tabular-nums; }
                .bandeja-tick { display: inline-flex; align-items: center; }
                .bandeja-sistema { align-self: center; padding: 0.2rem 0.6rem; font-size: var(--text-xs); color: var(--text-muted); text-align: center; }

                /* Avisos sobre el composer. El de base es amarillo (algo que
                   conviene saber); is-bloqueo/is-error son rojos (no se puede
                   enviar) e is-publico es cyan (no bloquea, pero cambia lo que
                   estás por hacer). align-items:flex-start porque estos textos
                   son de dos renglones en la columna angosta. */
                .bandeja-aviso { display: flex; align-items: flex-start; gap: 0.4rem; margin: 0; padding: 0.6rem 0.75rem 0; font-size: var(--text-xs); line-height: 1.45; color: var(--warning); }
                .bandeja-aviso > svg { flex-shrink: 0; margin-top: 0.1rem; }
                .bandeja-aviso.is-bloqueo { color: var(--danger); }
                .bandeja-aviso.is-error { color: var(--danger); word-break: break-word; }
                .bandeja-aviso.is-publico { color: var(--accent-3); }
                .bandeja-composer { display: flex; align-items: flex-end; gap: 0.5rem; padding: 0.75rem; border-top: 1px solid var(--border); }
                .bandeja-composer .input-group { flex: 1; min-width: 0; }

                /* Alta manual del contacto (hilos de Meta sin nombre ni teléfono). */
                .bandeja-alta { display: flex; flex-direction: column; gap: 0.5rem; margin: 0.6rem 0.75rem 0; padding: 0.7rem; border: 1px dashed var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); }
                .bandeja-alta-txt { margin: 0; font-size: var(--text-xs); line-height: 1.45; color: var(--text-secondary); }
                .bandeja-alta-campos { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.5rem; }
                .bandeja-alta-acciones { display: flex; gap: 0.5rem; }

                .bandeja-vacio { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 2rem; text-align: center; }
                .bandeja-vacio h2 { font-size: var(--text-lg); }
                .bandeja-vacio p { font-size: var(--text-sm); max-width: 42ch; }
                .bandeja-hint { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 1.25rem; text-align: center; font-size: var(--text-sm); color: var(--text-secondary); }

                /* ≤768px: una sola columna. Sin hilo elegido se ve la lista; al
                   abrir uno, el hilo ocupa todo y se vuelve con la flecha. */
                @media (max-width: 768px) {
                    /* 100dvh y no 100vh: en el celular 100vh NO descuenta la barra
                       de direcciones, así que el alto real era ~90px más chico que
                       el calculado y el composer terminaba abajo del fold — había
                       que scrollear la PÁGINA (no el hilo) para encontrarlo. */
                    .bandeja-layout { grid-template-columns: minmax(0, 1fr); height: calc(100dvh - 12rem); }
                    /* En la vista de hilo la cabecera de la página no aporta nada
                       y se come ~150px de una pantalla cuyo único fin es el chat. */
                    .page-container:has(.bandeja-layout.is-hilo) .page-header { display: none; }
                    .page-container:has(.bandeja-layout.is-hilo) .bandeja-layout { height: calc(100dvh - 8rem); }
                    .bandeja-alta-campos { grid-template-columns: minmax(0, 1fr); }
                    .bandeja-layout .bandeja-hilo { display: none; }
                    .bandeja-layout.is-hilo .bandeja-lista { display: none; }
                    .bandeja-layout.is-hilo .bandeja-hilo { display: flex; }
                    .bandeja-volver { display: inline-flex; }
                    .bandeja-burbuja { max-width: 85%; }
                    /* En el celular la cabecera y los avisos compiten con los
                       mensajes por el alto: se aprieta lo accesorio para que el
                       hilo siga siendo lo que más ocupa. (La fila de acciones
                       igual se parte en dos con los tres controles: achicarla
                       de verdad pide rediseñar la cabecera, que es de WhatsApp
                       y está viva — queda como pendiente aparte.) */
                    .bandeja-hilo-head { padding: 0.6rem 0.75rem; }
                    .bandeja-asignar { min-width: 7rem; }
                    .bandeja-aviso { padding: 0.5rem 0.75rem 0; }
                }
            `}</style>
        </div>
    );
};

export default BandejaPage;
