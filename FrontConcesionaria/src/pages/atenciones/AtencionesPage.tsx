import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    UserRoundCheck, Search, Phone, Mail, IdCard, AlertTriangle, Clock, DoorOpen,
    History, Car, ChevronRight, RefreshCw, X, CircleAlert, CheckCircle2, WifiOff, Lock,
} from 'lucide-react';
import {
    atencionesApi,
    codigoDeError,
    COD_CLIENTE_AJENO,
    MOTIVO_ATENCION_LABEL,
    RESULTADO_ATENCION_META,
    type Atencion,
    type AtencionFilter,
    type AtencionHistorial,
    type MotivoAtencion,
    type RespuestaIdentificar,
} from '../../api/atenciones.api';
import { ESTADO_LEAD_MAP, ORIGEN_LEAD_LABEL } from '../../types/cliente.types';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useDebounce } from '../../hooks/useDebounce';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatFecha } from '../../utils/fecha';
import PageTitle from '../../components/ui/PageTitle';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Pagination from '../../components/ui/Pagination';

/*
 * MOSTRADOR — la puerta de entrada del vendedor.
 *
 * Se usa DE PIE, con un cliente enfrente. Todo lo que no sirva para abrir una
 * visita en menos de 30 segundos (criterio de aceptación 1) está abajo del
 * pliegue: arriba de todo hay dos campos y un botón, y nada más.
 *
 * El paso intermedio —identificar antes de abrir— NO es fricción: es exactamente
 * lo que impide duplicar al cliente que ya consultó por Instagram (criterio 2).
 * Por eso los dos pasos son un solo gesto encadenado: Enter identifica, el foco
 * salta al botón de abrir, y un segundo Enter abre.
 */

/** Hora local corta. `iniciadaEn` es un DateTime completo, no un `@db.Date`. */
const hora = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const esHoy = (iso?: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    const h = new Date();
    return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
};

/** "hoy 14:32" / "12/08/2026 14:32" — el vendedor mira la hora, salvo que sea vieja. */
const cuando = (iso?: string | null) => {
    if (!iso) return '-';
    return esHoy(iso) ? `hoy ${hora(iso)}` : `${formatFecha(iso)} ${hora(iso)}`;
};

const nombreCompleto = (c: { nombre: string; apellido?: string | null }) =>
    [c.nombre, c.apellido].filter(Boolean).join(' ');

const tituloUnidad = (u?: { marca: string; modelo: string; version?: string | null; anio?: number | null }) =>
    u ? [u.marca, u.modelo, u.version, u.anio].filter(Boolean).join(' ') : 'Unidad';

type FiltroEstado = 'abierta' | 'cerrada' | 'todas';

const AtencionesPage = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { addToast } = useUIStore();
    const user = useAuthStore((s) => s.user);

    // ── Apertura ────────────────────────────────────────────────────────────
    const [nombre, setNombre] = useState('');
    const [telefono, setTelefono] = useState('');
    const [identificado, setIdentificado] = useState<RespuestaIdentificar | null>(null);
    const [motivo, setMotivo] = useState<MotivoAtencion>('consulta_general');
    const [atencionAnteriorId, setAtencionAnteriorId] = useState('');
    // Aviso que llegó como 409 al intentar abrir (no el que ya trajo `identificar`).
    const [avisoAjeno, setAvisoAjeno] = useState<string | null>(null);
    // El foco salta al botón de abrir cuando vuelve la identificación. Se busca por
    // `data-abrir` dentro del panel en vez de pasarle una ref a <Button>, que tipa
    // sus props como ButtonHTMLAttributes y no declara `ref`.
    const fichaRef = useRef<HTMLDivElement>(null);

    // ── Listado ─────────────────────────────────────────────────────────────
    const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('abierta');
    const [soloMias, setSoloMias] = useState(true);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 400);
    const [page, setPage] = useState(1);

    /*
     * `isPending` y NO `isLoading`. `isLoading` es `isPending && isFetching`, así
     * que en cualquier hueco entre intentos queda en false con `data` todavía en
     * undefined, y la pantalla caía en el caso "no tenés ninguna atención abierta"
     * mientras el servidor devolvía error. Probado en vivo contra un backend sin la
     * ruta: decía que no había visitas. Es el mismo bug que documenta el DataTable:
     * un error y un conjunto vacío no son la misma cosa.
     *
     * Los huecos duran más de lo que parece: el retryer de React Query pausa entre
     * reintentos si la pestaña no está enfocada (`focusManager.isFocused() && …` en
     * retryer.js), o sea que una consulta que falló mientras el vendedor miraba
     * otra app se queda en `pending` hasta que vuelve el foco.
     */
    const { data: lista, isPending, isError, refetch, isFetching } = useQuery({
        queryKey: ['atenciones', 'lista', filtroEstado, soloMias, page, user?.id],
        queryFn: () => {
            const filters: AtencionFilter = {};
            if (filtroEstado !== 'todas') filters.estado = filtroEstado;
            // El backend ya recorta al vendedor puro; este filtro es para el admin,
            // que ve todo el tenant y quiere separar lo que atendió él.
            if (soloMias && user?.id) filters.vendedorId = user.id;
            return atencionesApi.getAll(filters, { page, limit: 12 });
        },
        staleTime: 1000 * 30,
    });

    // Atenciones sin cerrar + las que ya cerró el barrido. Va aparte del listado a
    // propósito: si esta consulta falla no puede tumbar la pantalla de trabajo.
    const { data: alerta } = useQuery({
        queryKey: ['atenciones', 'alertas'],
        queryFn: () => atencionesApi.alertas(),
        staleTime: 1000 * 60 * 5,
        retry: false,
    });

    const identificar = useMutation({
        mutationFn: () => atencionesApi.identificar({ nombre: nombre.trim(), telefono: telefono.trim() }),
        // `always` sólo en las MUTACIONES: sin red, el modo por defecto encola la
        // mutación en vez de fallar y el botón gira sin decir nada hasta que vuelva
        // la conexión. Con el cliente enfrente conviene lo contrario — que falle, lo
        // diga y se pueda reintentar a mano.
        networkMode: 'always',
        onSuccess: (res) => {
            setIdentificado(res);
            setAvisoAjeno(null);
            setMotivo('consulta_general');
            setAtencionAnteriorId('');
            // Un tick para que el panel exista en el DOM antes de pedirle el foco.
            setTimeout(() => fichaRef.current?.querySelector<HTMLButtonElement>('[data-abrir]')?.focus(), 0);
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo identificar al cliente'), 'error'),
    });

    const abrir = useMutation({
        mutationFn: (confirmaAtenderAjeno: boolean) =>
            atencionesApi.abrir({
                nombre: nombre.trim(),
                telefono: telefono.trim() || undefined,
                motivo,
                atencionAnteriorId: motivo === 'vuelve_por_atencion_anterior' && atencionAnteriorId
                    ? Number(atencionAnteriorId)
                    : undefined,
                confirmaAtenderAjeno: confirmaAtenderAjeno || undefined,
            }),
        networkMode: 'always',
        onSuccess: (res) => {
            qc.invalidateQueries({ queryKey: ['atenciones'] });
            navigate(`/atenciones/${res.atencion.id}`);
        },
        onError: (e) => {
            // El 409 de cliente ajeno NO es una falla: es el aviso del encargo. Si
            // llega igual (p.ej. lo reasignaron entre la identificación y el click),
            // se muestra y se ofrece abrir confirmando, sin perder lo tipeado.
            if (codigoDeError(e) === COD_CLIENTE_AJENO) {
                setAvisoAjeno(getErrorMessage(e, 'Este cliente está asignado a otro vendedor.'));
                return;
            }
            addToast(getErrorMessage(e, 'No se pudo abrir la atención'), 'error');
        },
    });

    const limpiarApertura = () => {
        setIdentificado(null);
        setNombre('');
        setTelefono('');
        setMotivo('consulta_general');
        setAtencionAnteriorId('');
        setAvisoAjeno(null);
    };

    const puedeIdentificar = nombre.trim().length > 0;

    // `alcance: 'vendedor'` = el backend recorto el conteo a lo de este usuario.
    // Para un admin viene 'tenant' y el numero es de todo el salon.
    const esMiAlerta = alerta?.alcance !== 'tenant';

    const items = lista?.results ?? [];
    const totalPages = lista?.totalPages ?? 1;

    const cliente = identificado?.cliente ?? null;
    const historial = identificado?.historial ?? null;
    const aviso = identificado?.aviso ?? null;
    // El backend sólo manda `aviso` cuando el cliente es de OTRO y la retención
    // sigue vigente; en cualquier otro caso viene null.
    const esDeOtro = !!aviso || !!avisoAjeno;

    // Si ya tiene una visita abierta conviene continuarla en vez de abrir otra.
    const abiertaPrevia = historial?.atenciones.find((a) => a.estado === 'abierta') ?? null;
    const historialCerrado: AtencionHistorial[] = (historial?.atenciones ?? []).filter((a) => a.estado === 'cerrada');

    /*
     * Se manda `confirmaAtenderAjeno` cuando el vendedor YA VIO el aviso en pantalla
     * y apretó el botón igual. Eso es exactamente lo que pide el encargo ("el
     * sistema AVISA antes de abrir la atención"): confirmar sin haber avisado sería
     * saltearse el aviso, y no confirmar después de avisar sería un 409 sin salida.
     */
    const abrirAhora = () => abrir.mutate(esDeOtro);

    return (
        <div className="page-container animate-fade-in">
            <PageTitle title="Atenciones" />

            <header className="page-header">
                <div className="header-title">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="icon-badge primary shadow-glow"><UserRoundCheck size={22} /></div>
                        <h1>Mostrador</h1>
                    </div>
                    <p>Atención presencial: abrí la visita con el nombre y el teléfono, el resto se completa sobre la marcha.</p>
                    <p className="at-nota">
                        Antes de crear nada se busca por teléfono normalizado, DNI y email: el que ya consultó por
                        redes no se duplica cuando viene al salón.
                    </p>
                </div>
            </header>

            {/* Atenciones sin cerrar y las que ya cerró el barrido de fin de día. */}
            {alerta && (alerta.abiertas > 0 || alerta.cerradasPorSistema > 0) && (
                <div className="card at-aviso is-warning" role="status">
                    <CircleAlert size={20} />
                    <div className="at-aviso-body">
                        {/* La frase se arma acá y no se usa `alerta.mensaje`: el backend
                            pluraliza con `atención${n===1?'':'es'}` y sale "2 atenciónes".
                            Los conteos ya vienen; el castellano lo pone la pantalla. */}
                        {/* La misma alerta cuenta dos cosas distintas segun quien mira:
                            para un vendedor puro son SUS atenciones; para un admin son
                            las de todo el salon (el backend lo dice en `alcance`). Sin
                            esa distincion el admin leia "el sistema cerro 30 atenciones
                            que dejaste abiertas" sin haber abierto ninguna, y el detalle
                            de abajo —visitas de doce vendedores— se le presentaba como
                            propio. El numero siempre fue correcto; lo que faltaba era la
                            persona gramatical. */}
                        <strong>
                            {alerta.cerradasPorSistema > 0
                                ? esMiAlerta
                                    ? `El sistema cerró ${alerta.cerradasPorSistema} ${alerta.cerradasPorSistema === 1 ? 'atención' : 'atenciones'} que dejaste abiertas.`
                                    : `El sistema cerró ${alerta.cerradasPorSistema} ${alerta.cerradasPorSistema === 1 ? 'atención del equipo' : 'atenciones del equipo'} sin cerrar.`
                                : esMiAlerta
                                    ? `Tenés ${alerta.abiertas} ${alerta.abiertas === 1 ? 'atención sin cerrar' : 'atenciones sin cerrar'}. Ninguna puede quedar sin resultado.`
                                    : `Hay ${alerta.abiertas} ${alerta.abiertas === 1 ? 'atención sin cerrar' : 'atenciones sin cerrar'} en el salón. Ninguna puede quedar sin resultado.`}
                        </strong>
                        <p>
                            {alerta.cerradasPorSistema > 0
                                ? esMiAlerta
                                    ? 'Se cerraron sin resultado al terminar el día. Abrilas y completá qué pasó: es lo único que después explica por qué esa visita no siguió.'
                                    : 'Se cerraron sin resultado al terminar el día. Es una señal de proceso: quedaron sin explicar por qué esas visitas no siguieron.'
                                : alerta.deJornadasAnteriores > 0
                                    ? `${alerta.deJornadasAnteriores} ${alerta.deJornadasAnteriores === 1 ? 'es de una jornada anterior' : 'son de jornadas anteriores'}: si no ${esMiAlerta ? 'las cerrás' : 'se cierran'}, las cierra el sistema en el próximo corte.`
                                    : esMiAlerta ? 'Cerralas antes de terminar el día.' : 'Tienen que quedar cerradas antes de terminar el día.'}
                        </p>
                        {alerta.detalle.length > 0 && (
                            <div className="at-aviso-links">
                                {alerta.detalle.slice(0, 4).map((a) => (
                                    <button key={a.id} type="button" className="at-link" onClick={() => navigate(`/atenciones/${a.id}`)}>
                                        {a.cliente ? nombreCompleto(a.cliente) : `#${a.id}`} · {cuando(a.iniciadaEn)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── APERTURA ─────────────────────────────────────────────────── */}
            <section className="card glass at-apertura" data-tour="at-apertura">
                <div className="at-apertura-head">
                    <div className="at-apertura-icon"><DoorOpen size={20} /></div>
                    <div>
                        <h2 className="at-apertura-title">Abrir una atención</h2>
                        <p className="at-apertura-sub">Nombre y teléfono. Con eso alcanza para empezar.</p>
                    </div>
                </div>

                <form
                    className="at-apertura-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (puedeIdentificar && !identificar.isPending) identificar.mutate();
                    }}
                >
                    <Input
                        label="Nombre"
                        placeholder="Cómo se llama"
                        autoComplete="off"
                        value={nombre}
                        onChange={(e) => { setNombre(e.target.value); setIdentificado(null); }}
                        containerClassName="at-campo"
                    />
                    <Input
                        label="Teléfono"
                        placeholder="Ej: 261 555-1234"
                        inputMode="tel"
                        autoComplete="off"
                        value={telefono}
                        onChange={(e) => { setTelefono(e.target.value); setIdentificado(null); }}
                        containerClassName="at-campo"
                        hint="Se busca normalizado: da igual cómo esté escrito."
                    />
                    <div className="at-apertura-cta">
                        <Button type="submit" size="lg" loading={identificar.isPending} disabled={!puedeIdentificar}>
                            <Search size={18} /> Buscar y abrir
                        </Button>
                    </div>
                </form>

                {!puedeIdentificar && !identificado && (
                    <p className="at-hint">Con el nombre alcanza para empezar. El teléfono es lo que evita duplicar la ficha.</p>
                )}

                {/* Resultado del dedupe */}
                {identificado && (
                    <div className={`at-ficha ${cliente ? '' : 'is-nuevo'}`} ref={fichaRef}>
                        <button type="button" className="at-ficha-cerrar icon-btn" onClick={limpiarApertura} title="Descartar y empezar de nuevo">
                            <X size={16} />
                        </button>

                        {cliente ? (
                            <>
                                <div className="at-ficha-head">
                                    <div className="at-ficha-avatar"><UserRoundCheck size={24} /></div>
                                    <div className="at-ficha-id">
                                        <h3>{nombreCompleto(cliente)}</h3>
                                        <div className="at-chips">
                                            {cliente.estadoLead && (
                                                <Badge variant={ESTADO_LEAD_MAP[cliente.estadoLead].variant}>
                                                    {ESTADO_LEAD_MAP[cliente.estadoLead].label}
                                                </Badge>
                                            )}
                                            {cliente.origenLead && (
                                                <Badge variant="default">{ORIGEN_LEAD_LABEL[cliente.origenLead]}</Badge>
                                            )}
                                            <span className="at-chip-plano">Ya estaba en el sistema · no se duplica</span>
                                        </div>
                                        <div className="at-contacto">
                                            {cliente.telefono && <span><Phone size={13} /> {cliente.telefono}</span>}
                                            {cliente.email && <span><Mail size={13} /> {cliente.email}</span>}
                                            {cliente.dni && <span><IdCard size={13} /> {cliente.dni}</span>}
                                        </div>
                                    </div>
                                </div>

                                {/* Asignado a otro vendedor: avisa, NO bloquea. */}
                                {aviso?.mensaje && (
                                    <div className="at-aviso is-warning at-aviso-inline" role="alert">
                                        <AlertTriangle size={18} />
                                        <div className="at-aviso-body">
                                            <strong>Este cliente lo atiende {aviso.vendedorAsignado ?? 'otro vendedor'}.</strong>
                                            <p>{aviso.mensaje}</p>
                                        </div>
                                    </div>
                                )}

                                {/* El 409 que llegó al intentar abrir. */}
                                {avisoAjeno && (
                                    <div className="at-aviso is-warning at-aviso-inline" role="alert">
                                        <AlertTriangle size={18} />
                                        <div className="at-aviso-body">
                                            <strong>Hace falta confirmar.</strong>
                                            <p>{avisoAjeno} Tocá otra vez el botón para atenderlo igual.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Avisos sueltos del backend (p.ej. sin teléfono no se deduplica). */}
                                {identificado.avisos.map((a) => (
                                    <p key={a} className="at-hint">{a}</p>
                                ))}

                                {/* Ya tiene una visita abierta. */}
                                {abiertaPrevia && (
                                    <div className="at-aviso is-info at-aviso-inline" role="status">
                                        <Clock size={18} />
                                        <div className="at-aviso-body">
                                            <strong>Tiene una atención abierta desde {cuando(abiertaPrevia.iniciadaEn)}.</strong>
                                            <p>
                                                {abiertaPrevia.vendedor?.nombre ? `La abrió ${abiertaPrevia.vendedor.nombre}. ` : ''}
                                                Si es la misma visita, continuala en vez de abrir una nueva.
                                            </p>
                                            <div>
                                                <Button variant="secondary" size="sm" onClick={() => navigate(`/atenciones/${abiertaPrevia.id}`)}>
                                                    Continuar esa atención <ChevronRight size={14} />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Historial. Puede venir RESTRINGIDO: se dice, no se disimula. */}
                                {historial?.restringido ? (
                                    <div className="at-restringido">
                                        <Lock size={16} />
                                        <div>
                                            <strong>
                                                {historial.totalAtenciones === 1
                                                    ? 'Ya vino 1 vez al salón.'
                                                    : `Ya vino ${historial.totalAtenciones} veces al salón.`}
                                            </strong>
                                            <p>
                                                Lo que le mostraron es información comercial de{' '}
                                                {historial.vendedoresPrevios.map((v) => v.nombre).join(', ') || 'otro vendedor'}.
                                                Al abrir la atención vas a ver el detalle completo, y va a quedar registrado que la abriste vos.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="at-ficha-cols">
                                        <div className="at-ficha-col">
                                            <h4 className="at-col-title"><History size={14} /> Visitas anteriores</h4>
                                            {!historial || historial.atenciones.length === 0 ? (
                                                <p className="at-vacio-inline">Primera vez que viene al salón.</p>
                                            ) : (
                                                <ul className="at-historial">
                                                    {historial.atenciones.slice(0, 5).map((h) => {
                                                        const meta = h.resultado ? RESULTADO_ATENCION_META[h.resultado] : null;
                                                        return (
                                                            <li key={h.id}>
                                                                <button type="button" className="at-link" onClick={() => navigate(`/atenciones/${h.id}`)}>
                                                                    {cuando(h.iniciadaEn)}
                                                                </button>
                                                                {h.vendedor?.nombre && <span className="at-historial-meta">{h.vendedor.nombre}</span>}
                                                                {meta
                                                                    ? <Badge variant={meta.variant}>{meta.label}</Badge>
                                                                    : <Badge variant="warning">Sin resultado</Badge>}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>
                                        <div className="at-ficha-col">
                                            <h4 className="at-col-title"><Car size={14} /> Unidades que ya vio</h4>
                                            {!historial || historial.unidadesVistas.length === 0 ? (
                                                <p className="at-vacio-inline">Todavía no se le mostró ninguna unidad.</p>
                                            ) : (
                                                <ul className="at-vistas">
                                                    {historial.unidadesVistas.slice(0, 6).map((u) => (
                                                        <li key={u.id}>
                                                            <span className="at-vista-nombre">{tituloUnidad(u.vehiculo)}</span>
                                                            <span className="at-vista-meta">
                                                                {u.vehiculo?.dominio ? `${u.vehiculo.dominio} · ` : ''}{cuando(u.createdAt)}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="at-ficha-head">
                                    <div className="at-ficha-avatar is-nuevo"><CheckCircle2 size={24} /></div>
                                    <div className="at-ficha-id">
                                        <h3>Cliente nuevo</h3>
                                        <p className="at-ficha-nuevo-txt">
                                            No hay ninguna ficha con ese teléfono, DNI ni email. Se crea una con
                                            <strong> {nombre.trim()}{telefono.trim() ? ` · ${telefono.trim()}` : ''}</strong> y se sigue desde ahí.
                                        </p>
                                    </div>
                                </div>
                                {identificado.avisos.map((a) => (
                                    <p key={a} className="at-hint">{a}</p>
                                ))}
                            </>
                        )}

                        {/* Motivo + apertura */}
                        <div className="at-abrir-row">
                            <Select
                                dense
                                label="Motivo de la visita"
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value as MotivoAtencion)}
                                containerClassName="at-abrir-motivo"
                            >
                                {(Object.keys(MOTIVO_ATENCION_LABEL) as MotivoAtencion[])
                                    .filter((m) => m !== 'vuelve_por_atencion_anterior' || historialCerrado.length > 0)
                                    .map((m) => <option key={m} value={m}>{MOTIVO_ATENCION_LABEL[m]}</option>)}
                            </Select>

                            {motivo === 'vuelve_por_atencion_anterior' && (
                                <Select
                                    dense
                                    label="¿Por cuál vuelve?"
                                    placeholder="Elegí la visita"
                                    value={atencionAnteriorId}
                                    onChange={(e) => setAtencionAnteriorId(e.target.value)}
                                    containerClassName="at-abrir-motivo"
                                >
                                    {historialCerrado.map((h) => (
                                        <option key={h.id} value={h.id}>
                                            {cuando(h.iniciadaEn)} — {h.resultado ? RESULTADO_ATENCION_META[h.resultado].label : 'sin resultado'}
                                        </option>
                                    ))}
                                </Select>
                            )}

                            <Button
                                size="lg"
                                loading={abrir.isPending}
                                onClick={abrirAhora}
                                data-abrir="1"
                                data-tour="at-abrir"
                            >
                                <DoorOpen size={18} /> {esDeOtro ? 'Atenderlo igual' : 'Abrir atención'}
                            </Button>
                        </div>
                    </div>
                )}
            </section>

            {/* ── LISTADO ──────────────────────────────────────────────────── */}
            <div className="at-lista-head">
                <div className="segmented" role="group" aria-label="Estado de las atenciones">
                    {(['abierta', 'cerrada', 'todas'] as FiltroEstado[]).map((f) => (
                        <button
                            key={f}
                            type="button"
                            className={`segmented-btn ${filtroEstado === f ? 'is-active' : ''}`}
                            onClick={() => { setFiltroEstado(f); setPage(1); }}
                        >
                            {f === 'abierta' ? 'Abiertas' : f === 'cerrada' ? 'Cerradas' : 'Todas'}
                        </button>
                    ))}
                </div>

                <label className="at-toggle">
                    <input
                        type="checkbox"
                        checked={soloMias}
                        onChange={(e) => { setSoloMias(e.target.checked); setPage(1); }}
                    />
                    Sólo las que atendí yo
                </label>

                <div className="at-buscador">
                    <Search size={15} className="text-muted" />
                    <input
                        type="text"
                        placeholder="Filtrar por cliente…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <button className="at-refresh" type="button" onClick={() => refetch()} disabled={isFetching} title="Actualizar">
                    <RefreshCw size={15} className={isFetching ? 'at-spin' : ''} />
                </button>
            </div>

            {isPending ? (
                <div className="at-lista">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="card at-item">
                            <span className="skeleton skeleton-text" style={{ width: '35%' }} />
                            <span className="skeleton skeleton-text" style={{ width: '60%', marginTop: '0.5rem' }} />
                        </div>
                    ))}
                </div>
            ) : isError ? (
                /* Un error NO es una lista vacía: si el servidor falló hay que decirlo
                   y ofrecer reintentar, no dejar creyendo que no hay visitas. */
                <div className="card glass at-vacio is-error" role="alert">
                    <WifiOff size={26} />
                    <div>No se pudo cargar el listado de atenciones.</div>
                    <p className="at-vacio-hint">
                        Puede ser la conexión del salón. Las atenciones que ya abriste siguen guardadas.
                    </p>
                    <Button variant="secondary" size="sm" onClick={() => refetch()}>Reintentar</Button>
                </div>
            ) : (() => {
                /* El backend no filtra por texto. Con 12 filas por página el filtro
                   local alcanza; lo que NO se hace es mentir: si el filtro deja la
                   página vacía, se dice que es el filtro y no que no hay visitas. */
                const q = debouncedSearch.trim().toLowerCase();
                const visibles = q
                    ? items.filter((a: Atencion) => (a.cliente ? nombreCompleto(a.cliente).toLowerCase().includes(q) : false))
                    : items;

                if (items.length === 0) {
                    return (
                        <div className="card glass at-vacio">
                            <UserRoundCheck size={28} style={{ opacity: 0.4 }} />
                            <div>
                                {filtroEstado === 'abierta'
                                    ? 'No tenés ninguna atención abierta.'
                                    : 'No hay atenciones con ese estado.'}
                            </div>
                            <p className="at-vacio-hint">Cuando entre alguien al salón, abrí la visita con el formulario de arriba.</p>
                        </div>
                    );
                }

                if (visibles.length === 0) {
                    return (
                        <div className="card glass at-vacio">
                            <Search size={26} style={{ opacity: 0.4 }} />
                            <div>Ninguna atención de esta página coincide con “{debouncedSearch.trim()}”.</div>
                            <p className="at-vacio-hint">El filtro busca sólo en las {items.length} de esta página.</p>
                            <Button variant="secondary" size="sm" onClick={() => setSearch('')}>Limpiar filtro</Button>
                        </div>
                    );
                }

                return (
                    <>
                        <div className="at-lista" data-tour="at-lista">
                            {visibles.map((a: Atencion) => {
                                const meta = a.resultado ? RESULTADO_ATENCION_META[a.resultado] : null;
                                const abierta = a.estado === 'abierta';
                                const color = abierta ? 'var(--warning)' : meta?.definitivo ? 'var(--success)' : 'var(--text-muted)';
                                const mia = a.vendedorId === user?.id;
                                return (
                                    <div
                                        key={a.id}
                                        className="card at-item"
                                        style={{ borderLeft: `3px solid ${color}` }}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => navigate(`/atenciones/${a.id}`)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/atenciones/${a.id}`); }}
                                    >
                                        <div className="at-item-main">
                                            <div className="at-item-top">
                                                <Badge variant={abierta ? 'warning' : 'default'}>{abierta ? 'Abierta' : 'Cerrada'}</Badge>
                                                <span className="at-item-hora"><Clock size={13} /> {cuando(a.iniciadaEn)}</span>
                                                <span className="at-item-motivo">{MOTIVO_ATENCION_LABEL[a.motivo]}</span>
                                                {a.cerradaAutomaticamente && (
                                                    <span className="at-chip-plano is-alerta">Cerrada por sistema</span>
                                                )}
                                            </div>
                                            <div className="at-item-cliente">
                                                {a.cliente ? nombreCompleto(a.cliente) : `Cliente #${a.clienteId}`}
                                                <ChevronRight size={15} />
                                            </div>
                                            <div className="at-item-meta">
                                                {a.vendedor?.nombre && (
                                                    <span>{mia ? 'Atendida por vos' : `Atendida por ${a.vendedor.nombre}`}</span>
                                                )}
                                                {meta && <Badge variant={meta.variant}>{meta.label}</Badge>}
                                                {!meta && !abierta && <Badge variant="danger">Sin resultado</Badge>}
                                            </div>
                                        </div>
                                        <div className="at-item-cta">
                                            <span className="btn btn-secondary btn-sm">{abierta ? 'Continuar' : 'Ver'}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                    </>
                );
            })()}

            <style>{`
                /* Segundo renglón bajo el subtítulo: '.header-title p' pesa (0,1,1)
                   y le gana a cualquier utilidad de una clase, así que hay que
                   repetir el selector para poder apagarlo. */
                .header-title p.at-nota { font-size: var(--text-sm); color: var(--text-muted); }

                /* ── Apertura ─────────────────────────────────────────────── */
                .at-apertura { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.1rem; }
                .at-apertura-head { display: flex; align-items: center; gap: 0.9rem; }
                .at-apertura-icon { width: 42px; height: 42px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; background: rgba(var(--accent-rgb), 0.14); color: var(--accent); flex-shrink: 0; }
                .at-apertura-title { margin: 0; font-size: var(--text-lg); font-weight: 800; letter-spacing: -0.02em; }
                .at-apertura-sub { margin: 0.1rem 0 0; font-size: var(--text-sm); color: var(--text-secondary); }
                /* Grilla propia (no .filters-bar: ahí todo <input> y <select>
                   descendiente hereda el look de .form-input por un selector de
                   (0,2,1) y le gana a los nuestros). */
                .at-apertura-form { display: grid; grid-template-columns: 1fr 1fr auto; gap: 1rem; align-items: end; }
                /* Los dos campos son ítems del grid y por defecto un ítem NO baja de su
                   contenido (min-width: auto): sin esto, el hint largo del teléfono
                   ensancha su columna y empuja el botón fuera de la tarjeta en vez de
                   envolver. La clase se usaba en el JSX sin tener regla. */
                .at-campo { min-width: 0; }
                .at-apertura-cta { display: flex; }
                .at-apertura-cta .btn { width: 100%; white-space: nowrap; }
                .at-hint { margin: 0; font-size: var(--text-sm); color: var(--text-muted); }

                /* ── Ficha del cliente identificado ───────────────────────── */
                .at-ficha { position: relative; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-secondary); padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; animation: at-in 0.25s var(--easing-out); }
                .at-ficha.is-nuevo { border-color: rgba(var(--accent-rgb), 0.35); }
                .at-ficha-cerrar { position: absolute; top: 0.6rem; right: 0.6rem; }
                .at-ficha-head { display: flex; gap: 1rem; align-items: flex-start; }
                .at-ficha-avatar { width: 48px; height: 48px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; background: rgba(var(--accent-2-rgb), 0.16); color: var(--accent-2); flex-shrink: 0; }
                .at-ficha-avatar.is-nuevo { background: rgba(var(--accent-rgb), 0.16); color: var(--accent); }
                .at-ficha-id { min-width: 0; flex: 1; }
                .at-ficha-id h3 { margin: 0 0 0.35rem; font-size: var(--text-lg); font-weight: 800; letter-spacing: -0.02em; }
                .at-ficha-nuevo-txt { margin: 0; font-size: var(--text-base); color: var(--text-secondary); line-height: 1.5; }
                .at-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
                .at-chip-plano { font-size: var(--text-xs); color: var(--text-muted); }
                .at-chip-plano.is-alerta { color: var(--warning); font-weight: 700; }
                .at-contacto { display: flex; flex-wrap: wrap; gap: 0.9rem; margin-top: 0.5rem; font-size: var(--text-sm); color: var(--text-secondary); }
                .at-contacto span { display: inline-flex; align-items: center; gap: 0.3rem; }

                /* ── Avisos ───────────────────────────────────────────────── */
                .at-aviso { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.9rem 1.1rem; border-left: 3px solid var(--info); }
                .at-aviso.is-warning { border-left-color: var(--warning); color: var(--warning); }
                .at-aviso.is-info { border-left-color: var(--info); color: var(--info); }
                .at-aviso-inline { background: var(--bg-card); border: 1px solid var(--border); border-left-width: 3px; border-radius: var(--radius-md); }
                .at-aviso-body { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 0.35rem; }
                .at-aviso-body strong { font-size: var(--text-base); }
                .at-aviso-body p { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5; }
                .at-aviso-links { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.15rem; }
                .at-link { background: none; border: none; padding: 0; cursor: pointer; color: var(--accent); font-weight: 700; font-size: var(--text-sm); font-family: inherit; }
                .at-link:hover { text-decoration: underline; }

                /* Historial recortado por ser de otro vendedor. */
                .at-restringido { display: flex; gap: 0.7rem; align-items: flex-start; padding: 0.85rem 1rem; border: 1px dashed var(--border-strong); border-radius: var(--radius-md); color: var(--text-muted); }
                .at-restringido strong { color: var(--text-primary); font-size: var(--text-base); }
                .at-restringido p { margin: 0.25rem 0 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5; }

                /* ── Historial y unidades ya vistas ───────────────────────── */
                .at-ficha-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
                /* Mismo caso que .at-campo: columna del grid del historial. Un título de
                   unidad o un dominio largo desbordaba la ficha en vez de envolver. */
                .at-ficha-col { min-width: 0; }
                .at-col-title { display: flex; align-items: center; gap: 0.4rem; margin: 0 0 0.6rem; font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 800; }
                .at-vacio-inline { margin: 0; font-size: var(--text-sm); color: var(--text-muted); }
                .at-historial, .at-vistas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
                .at-historial li { display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap; font-size: var(--text-sm); }
                .at-historial-meta { color: var(--text-muted); font-size: var(--text-xs); }
                .at-vistas li { display: flex; flex-direction: column; gap: 0.1rem; }
                .at-vista-nombre { font-weight: 700; font-size: var(--text-sm); color: var(--text-primary); }
                .at-vista-meta { font-size: var(--text-xs); color: var(--text-muted); }

                .at-abrir-row { display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; }
                .at-abrir-motivo { min-width: 220px; flex: 1; }
                .at-abrir-row .btn { flex-shrink: 0; }

                /* ── Barra del listado ────────────────────────────────────── */
                .at-lista-head { display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; }
                .at-toggle { display: inline-flex; align-items: center; gap: 0.4rem; font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); cursor: pointer; user-select: none; }
                .at-toggle input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
                .at-buscador { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.45rem 0.85rem; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--bg-card); min-width: 220px; flex: 1; max-width: 340px; }
                .at-buscador:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
                .at-buscador input { flex: 1; border: none; background: transparent; color: var(--text-primary); font-size: var(--text-sm); font-family: inherit; outline: none; min-width: 0; }
                .at-refresh { margin-left: auto; background: transparent; border: 1px solid var(--border); color: var(--text-secondary); border-radius: var(--radius-sm); padding: 0.35rem 0.45rem; cursor: pointer; display: inline-flex; }
                .at-refresh:disabled { opacity: 0.5; cursor: default; }
                .at-spin { animation: at-rot 0.8s linear infinite; }

                /* ── Tarjetas de atención ─────────────────────────────────── */
                .at-lista { display: flex; flex-direction: column; gap: 0.7rem; }
                .at-item { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.9rem 1.1rem; flex-wrap: wrap; cursor: pointer; }
                .at-item:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }
                .at-item-main { flex: 1; min-width: 220px; }
                .at-item-top { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
                .at-item-hora { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--text-sm); color: var(--text-secondary); font-weight: 700; }
                .at-item-motivo { font-size: var(--text-xs); color: var(--text-muted); }
                .at-item-cliente { display: inline-flex; align-items: center; gap: 0.2rem; font-weight: 800; font-size: var(--text-md); color: var(--text-primary); letter-spacing: -0.01em; }
                .at-item-meta { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.3rem; font-size: var(--text-xs); color: var(--text-muted); }
                .at-item-cta { flex-shrink: 0; }

                /* ── Vacío / error ────────────────────────────────────────── */
                .at-vacio { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; text-align: center; padding: 2.5rem 1.5rem; color: var(--text-secondary); }
                .at-vacio.is-error { color: var(--danger); }
                .at-vacio-hint { margin: 0; font-size: var(--text-sm); color: var(--text-muted); }

                @keyframes at-rot { to { transform: rotate(360deg); } }
                @keyframes at-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

                /* Tablet y mobile: el mostrador se usa parado, con una tablet en la mano. */
                @media (max-width: 900px) {
                    .at-apertura-form { grid-template-columns: 1fr; }
                    .at-apertura-cta .btn { width: 100%; }
                    .at-ficha-cols { grid-template-columns: 1fr; }
                }
                @media (max-width: 640px) {
                    .at-apertura { padding: 1.1rem; }
                    .at-lista-head { gap: 0.6rem; }
                    .at-buscador { max-width: none; width: 100%; }
                    .at-refresh { margin-left: 0; }
                    .at-item { align-items: flex-start; }
                    .at-item-cta { width: 100%; }
                    .at-item-cta .btn { width: 100%; justify-content: center; }
                    .at-abrir-row .btn { width: 100%; }
                }
            `}</style>
        </div>
    );
};

export default AtencionesPage;
