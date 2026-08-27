import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeft, Search, Car, Sparkles, AlertTriangle, Ban, Clock, Check, Lock,
    Handshake, Wallet, MapPin, Gauge, Timer, ChevronDown, ChevronUp,
    CircleAlert, CheckCircle2, ListChecks, TrendingUp, RefreshCw, WifiOff, IdCard,
} from 'lucide-react';
import {
    atencionesApi,
    precioMinimoApi,
    montoANumero,
    codigoDeError,
    detallesDeError,
    faltanDatosDelCliente,
    COD_SOLO_TASADOR,
    ACCIONES,
    ACCIONES_DE_INTERES_REAL,
    ACCION_LABEL,
    ESTADO_PERMUTA_LABEL,
    MEDIOS_CONTACTO,
    MEDIO_CONTACTO_LABEL,
    MOTIVO_ATENCION_LABEL,
    NIVELES_INTERES,
    NIVEL_INTERES_LABEL,
    RESULTADOS_ATENCION,
    RESULTADO_ATENCION_META,
    TIPO_FINANCIAMIENTO_LABEL,
    esResultadoDefinitivo,
    type AccionAtencionVehiculo,
    type AtencionDetalle,
    type AtencionVehiculo,
    type Importe,
    type ModoBusqueda,
    type RegistrarUnidadDto,
    type ResultadoAtencion,
    type ResultadoBusqueda,
    type Sugerencia,
    type TipoAtencionVehiculo,
    type TipoFinanciamiento,
    type UnidadSugerida,
} from '../../api/atenciones.api';
import type { TipoSeguimiento } from '../../api/seguimientos.api';
import { CONDICIONES, CONDICION_MAP, type CondicionTasacion } from '../../types/tasacion.types';
import { useUIStore } from '../../store/uiStore';
import { usePermisos } from '../../hooks/usePermisos';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatFecha } from '../../utils/fecha';
import PageTitle from '../../components/ui/PageTitle';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';

/*
 * LA ATENCIÓN EN CURSO — la pantalla donde el vendedor trabaja con el cliente
 * delante. Tres bloques y nada más: RELEVAR (qué busca, con qué paga), BUSCAR
 * (resultado + hasta 3 alternativas con su motivo) y REGISTRAR (qué se le mostró).
 *
 * Cuatro cosas que esta pantalla NO negocia:
 *  1. El MOTIVO de cada sugerencia se muestra con peso visual propio, no como nota
 *     al pie: es lo que el vendedor le dice al cliente en voz alta.
 *  2. Cuando hay menos de 3 alternativas se dice. Nunca se rellena ni se disimula.
 *  3. El cierre exige resultado, y próximo contacto si el resultado no es
 *     definitivo — y lo explica ANTES del click, no después con un 409.
 *  4. Los 409 del enriquecimiento progresivo (falta DNI / email / domicilio /
 *     consentimiento) NO se muestran como error: abren el formulario que los pide
 *     y reintentan solos la acción que el vendedor había tocado. Él quiso marcar
 *     un test drive, no completar un formulario.
 */

const money = (v: Importe | undefined, moneda = 'ARS') => {
    const n = montoANumero(v);
    if (n === null) return '—';
    const cur = moneda === 'USD' ? 'USD' : 'ARS';
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
};

const kms = (v?: number | null) => (v === null || v === undefined ? null : `${new Intl.NumberFormat('es-AR').format(v)} km`);

const hora = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Cuánto lleva abierta la visita. Se recalcula en cada render: alcanza y sobra. */
const transcurrido = (desde?: string | null) => {
    if (!desde) return '';
    const min = Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 60000));
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h ${min % 60} min`;
};

/** Días en stock. No hay columna calculada: se deriva de `fechaIngreso`. */
const diasEnStock = (fechaIngreso?: string | null): number | null => {
    if (!fechaIngreso) return null;
    const ms = Date.now() - new Date(fechaIngreso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    return Math.floor(ms / 86400000);
};

/** yyyy-mm-dd LOCAL (de noche en UTC-3, `toISOString` ya devuelve mañana). */
const fechaLocal = (offsetDias = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const numOrUndef = (v: string): number | undefined => {
    const t = v.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
};

const titulo = (u?: { marca: string; modelo: string; version?: string | null; anio?: number | null }) =>
    u ? [u.marca, u.modelo, u.version, u.anio].filter(Boolean).join(' ') : 'Unidad';

const MODOS: { key: ModoBusqueda; label: string }[] = [
    { key: 'presupuesto', label: 'Por presupuesto' },
    { key: 'modelo', label: 'Por modelo' },
    { key: 'unidad', label: 'Unidad puntual' },
];

/**
 * El backend pide `dominio`, `vin` o `vehiculoId` por separado; el vendedor tiene
 * UN dato en la mano y no tiene por qué elegir el campo. Se deduce:
 *   - sólo dígitos → N° de stock (que en este sistema ES el id de la unidad)
 *   - 17 alfanuméricos → VIN (largo estándar ISO 3779)
 *   - cualquier otra cosa → patente
 */
const referenciaAUnidad = (raw: string): { dominio?: string; vin?: string; vehiculoId?: number } => {
    const t = raw.trim();
    if (!t) return {};
    if (/^\d+$/.test(t)) return { vehiculoId: Number(t) };
    if (/^[A-Za-z0-9]{17}$/.test(t)) return { vin: t.toUpperCase() };
    return { dominio: t.toUpperCase().replace(/\s+/g, '') };
};

/** El formulario de relevamiento, todo en texto (es lo que devuelven los inputs). */
interface FormRelevamiento {
    modo: ModoBusqueda;
    moneda: 'ARS' | 'USD';
    presupuestoMin: string;
    presupuestoMax: string;
    marca: string;
    modelo: string;
    version: string;
    anio: string;
    referencia: string;
    anticipo: string;
    cuotaMaxima: string;
    tipoFinanciamiento: TipoFinanciamiento | '';
    /** El bloque de permuta y forma de pago arranca abierto si ya hay algo cargado. */
    abiertoExtra: boolean;
}

const txt = (v: Importe | undefined) => {
    const n = montoANumero(v);
    return n === null ? '' : String(n);
};

/** Valores del formulario según lo que ya tiene guardado la atención. */
const formDesdeAtencion = (a?: AtencionDetalle): FormRelevamiento => ({
    modo: a?.modoBusqueda ?? 'presupuesto',
    moneda: a?.moneda === 'USD' ? 'USD' : 'ARS',
    presupuestoMin: txt(a?.presupuestoMin),
    presupuestoMax: txt(a?.presupuestoMax),
    marca: '',
    modelo: '',
    version: '',
    anio: '',
    referencia: '',
    anticipo: txt(a?.anticipo),
    cuotaMaxima: txt(a?.cuotaMaxima),
    tipoFinanciamiento: a?.tipoFinanciamiento ?? '',
    abiertoExtra: !!a && (montoANumero(a.anticipo) !== null || !!a.tipoFinanciamiento || a.tasaciones.length > 0),
});

/** Nombre legible de cada dato que el backend puede reclamar en el 409. */
const FALTANTE_LABEL: Record<string, string> = {
    dni: 'DNI',
    email: 'Email',
    direccion: 'Domicilio',
    consentimientoContacto: 'Consentimiento de contacto',
};

/** La acción que el vendedor tocó y quedó esperando a que se completen los datos. */
type AccionPendiente =
    | { tipo: 'unidad'; datos: RegistrarUnidadDto }
    | { tipo: 'permuta' }
    | { tipo: 'ninguna' };

const AtencionPage = () => {
    const { id } = useParams<{ id: string }>();
    const atencionId = Number(id);
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { addToast } = useUIStore();
    const permisos = usePermisos();

    // ── Datos ───────────────────────────────────────────────────────────────
    const detalleKey = useMemo(() => ['atenciones', 'detalle', atencionId] as const, [atencionId]);
    /*
     * `isPending` y NO `isLoading`: entre intentos `isLoading` vuelve a false con
     * `at` todavía en undefined, y la pantalla saltaba al cartel de error antes de
     * que la consulta terminara de fallar de verdad. El hueco puede durar bastante:
     * el retryer de React Query pausa mientras la pestaña no está enfocada.
     */
    const { data: at, isPending, isError, refetch, isFetching } = useQuery({
        queryKey: detalleKey,
        queryFn: () => atencionesApi.getById(atencionId),
        enabled: Number.isFinite(atencionId),
    });

    // El historial del cliente viene por separado: el detalle de la atención sólo
    // trae lo de ESTA visita.
    const { data: historial } = useQuery({
        queryKey: ['atenciones', 'historial-cliente', at?.clienteId],
        queryFn: () => atencionesApi.historialCliente(at!.clienteId),
        enabled: !!at?.clienteId,
        staleTime: 1000 * 60,
        retry: false,
    });

    /*
     * ── Relevamiento ───────────────────────────────────────────────────────
     * El formulario se DERIVA de la atención mientras el vendedor no lo tocó, y
     * pasa a ser estado propio en cuanto lo toca. No hay useEffect de hidratación
     * a propósito: sincronizar con un efecto significa que cualquier `invalidate`
     * —y marcar una unidad dispara uno— le puede pisar lo que está tipeando con el
     * cliente enfrente. Con esta forma, `relEdit === null` es "todavía es lo que
     * dice el servidor" y no hay ninguna carrera que resolver.
     */
    const [relEdit, setRelEdit] = useState<FormRelevamiento | null>(null);
    const rel = relEdit ?? formDesdeAtencion(at);
    const setRel = (patch: Partial<FormRelevamiento>) => setRelEdit({ ...rel, ...patch });

    const [incluirYaMostradas, setIncluirYaMostradas] = useState(false);

    // Permuta (alta nueva; la ya cargada se muestra aparte).
    const [pMarca, setPMarca] = useState('');
    const [pModelo, setPModelo] = useState('');
    const [pDominio, setPDominio] = useState('');
    const [pAnio, setPAnio] = useState('');
    const [pKm, setPKm] = useState('');
    const [pCondicion, setPCondicion] = useState<CondicionTasacion>('bueno');
    const [pValor, setPValor] = useState('');
    /**
     * Se enciende cuando el backend contesta TASACION_SOLO_TASADOR. La config del
     * tenant no viaja en el detalle, así que la pantalla la APRENDE del primer
     * intento en vez de adivinarla o de pedir `/configuracion`, que el vendedor no
     * tiene permiso de leer.
     */
    const [soloTasador, setSoloTasador] = useState(false);

    const [resultado, setResultado] = useState<ResultadoBusqueda | null>(null);

    const cerrada = at?.estado === 'cerrada';
    // Una atención cerrada no se sigue trabajando (el backend responde
    // ATENCION_CERRADA en todos los pasos). La pantalla lo refleja en vez de
    // ofrecer botones que van a dar 409.
    const soloLectura = !!cerrada;

    const permutaActual = at?.tasaciones?.[0] ?? null;
    const valorPermuta = permutaActual?.estado === 'rechazada' ? 0 : (montoANumero(permutaActual?.valorEstimado) ?? 0);
    const anticipoNum = Number(numOrUndef(rel.anticipo) ?? 0);
    const presupuestoReal = valorPermuta + anticipoNum;

    // ── Enriquecimiento progresivo ──────────────────────────────────────────
    const [datosAbierto, setDatosAbierto] = useState(false);
    const [faltantes, setFaltantes] = useState<string[]>([]);
    const [motivoDatos, setMotivoDatos] = useState('');
    const [pendiente, setPendiente] = useState<AccionPendiente | null>(null);
    const [dDni, setDDni] = useState('');
    const [dEmail, setDEmail] = useState('');
    const [dDireccion, setDDireccion] = useState('');
    const [dConsentimiento, setDConsentimiento] = useState(false);

    /** Abre el formulario de datos con lo que el backend dijo que falta. */
    const pedirDatos = (e: unknown, accion: AccionPendiente) => {
        const c = at?.cliente;
        setDDni(c?.dni ?? '');
        setDEmail(c?.email ?? '');
        setDDireccion(c?.direccion ?? '');
        setDConsentimiento(c?.consentimientoContacto === true);
        setFaltantes(detallesDeError(e)?.faltantes ?? ['dni', 'email', 'direccion', 'consentimientoContacto']);
        setMotivoDatos(e ? getErrorMessage(e, '') : '');
        setPendiente(accion);
        setDatosAbierto(true);
    };

    // ── Mutaciones ──────────────────────────────────────────────────────────
    // `networkMode: 'always'` en todas: sin red, el modo por defecto ENCOLA la
    // mutación y el botón gira sin explicación. El vendedor tiene que saber si esto
    // quedó guardado o no, así que preferimos que falle y lo diga.
    const buscar = useMutation({
        mutationFn: () =>
            atencionesApi.buscar(atencionId, {
                modo: rel.modo,
                /*
                 * La moneda SÓLO viaja en modo presupuesto, que es donde el
                 * vendedor la elige junto con el rango (el selector vive con
                 * "Desde"/"Hasta" porque es la unidad de cuenta de ESE rango).
                 *
                 * En modo modelo y unidad se mandaba igual, y como arranca en ARS
                 * por el default de la atención, una concesionaria que publica los
                 * usados en dólares perdía TODO el stock: el backend descartaba
                 * cada unidad en otra moneda y devolvía cero alternativas con el
                 * cartel "no hay ninguna que cumpla los criterios", con los autos
                 * en la playa. Ahí la moneda no es una decisión del vendedor sino
                 * una propiedad de la unidad que encontró, así que la resuelve el
                 * motor a partir de ella.
                 */
                moneda: rel.modo === 'presupuesto' ? rel.moneda : undefined,
                ...(rel.modo === 'unidad' ? referenciaAUnidad(rel.referencia) : {}),
                marca: rel.modo === 'modelo' ? rel.marca.trim() || undefined : undefined,
                modelo: rel.modo === 'modelo' ? rel.modelo.trim() || undefined : undefined,
                version: rel.modo === 'modelo' ? rel.version.trim() || undefined : undefined,
                anio: rel.modo === 'modelo' ? numOrUndef(rel.anio) : undefined,
                presupuestoMin: rel.modo === 'presupuesto' ? numOrUndef(rel.presupuestoMin) : undefined,
                presupuestoMax: rel.modo === 'presupuesto' ? numOrUndef(rel.presupuestoMax) : undefined,
                anticipo: numOrUndef(rel.anticipo),
                cuotaMaxima: numOrUndef(rel.cuotaMaxima),
                tipoFinanciamiento: rel.tipoFinanciamiento || undefined,
                incluirYaMostradas,
            }),
        networkMode: 'always',
        onSuccess: (res) => {
            setResultado(res);
            // El relevamiento queda guardado como efecto de la búsqueda: no hay un
            // endpoint aparte, así que se refresca el detalle.
            qc.invalidateQueries({ queryKey: detalleKey });
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo buscar stock'), 'error'),
    });

    // Un registro por unidad en vuelo: con un solo `isPending` compartido se
    // deshabilitarían las cuatro tarjetas al tocar una.
    const [marcando, setMarcando] = useState<Set<number>>(new Set());
    const registrar = useMutation({
        mutationFn: (v: RegistrarUnidadDto) => atencionesApi.registrarUnidad(atencionId, v),
        networkMode: 'always',
        onMutate: (v) => setMarcando((s) => new Set(s).add(v.vehiculoId)),
        onSuccess: () => qc.invalidateQueries({ queryKey: detalleKey }),
        onError: (e, v) => {
            // Interés real sin los datos del cliente: no es un error, es el paso 2
            // del flujo. Se pide lo que falta y se reintenta esta misma acción.
            if (faltanDatosDelCliente(e)) return pedirDatos(e, { tipo: 'unidad', datos: v });
            addToast(getErrorMessage(e, 'No se pudo registrar la unidad'), 'error');
        },
        onSettled: (_d, _e, v) => setMarcando((s) => { const n = new Set(s); n.delete(v.vehiculoId); return n; }),
    });

    const guardarPermuta = useMutation({
        mutationFn: (sinValor: boolean) =>
            atencionesApi.registrarPermuta(atencionId, {
                marca: pMarca.trim(),
                modelo: pModelo.trim(),
                dominio: pDominio.trim(),
                anio: numOrUndef(pAnio),
                km: numOrUndef(pKm),
                condicion: pCondicion,
                valorEstimado: sinValor ? undefined : numOrUndef(pValor),
                moneda: rel.moneda,
            }),
        networkMode: 'always',
        onSuccess: () => {
            addToast('Permuta cargada', 'success');
            setPMarca(''); setPModelo(''); setPDominio(''); setPAnio(''); setPKm(''); setPValor('');
            qc.invalidateQueries({ queryKey: detalleKey });
        },
        onError: (e) => {
            if (faltanDatosDelCliente(e)) return pedirDatos(e, { tipo: 'permuta' });
            if (codigoDeError(e) === COD_SOLO_TASADOR) {
                // La casa no deja que el vendedor le ponga valor. El backend dice
                // textualmente "registrala sin valor": se aprende la config, se
                // limpia el campo y se reintenta sola. Un paso menos con el cliente
                // esperando, y el usado queda cargado igual, en `sin_tasar`.
                setSoloTasador(true);
                setPValor('');
                addToast(getErrorMessage(e, 'Acá el valor de toma lo carga el tasador.'), 'info');
                guardarPermuta.mutate(true);
                return;
            }
            addToast(getErrorMessage(e, 'No se pudo cargar la permuta'), 'error');
        },
    });

    const completarDatos = useMutation({
        mutationFn: () =>
            atencionesApi.completarCliente(atencionId, {
                dni: dDni.trim() || undefined,
                email: dEmail.trim() || undefined,
                direccion: dDireccion.trim() || undefined,
                consentimientoContacto: dConsentimiento || undefined,
            }),
        networkMode: 'always',
        onSuccess: () => {
            setDatosAbierto(false);
            qc.invalidateQueries({ queryKey: detalleKey });
            addToast('Datos del cliente actualizados', 'success');
            const p = pendiente;
            setPendiente(null);
            if (p?.tipo === 'unidad') registrar.mutate(p.datos);
            if (p?.tipo === 'permuta') guardarPermuta.mutate(soloTasador);
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudieron guardar los datos'), 'error'),
    });

    // ── Precio mínimo autorizado ────────────────────────────────────────────
    // El piso NO viaja con la unidad: se pregunta por vehículo y sólo llega si hay
    // una autorización vigente para este usuario (criterio de aceptación 7).
    const [pisos, setPisos] = useState<Record<number, { precio: Importe; moneda: string; venceEl: string | null } | 'pedido'>>({});
    const precioMinimo = useMutation({
        mutationFn: async (vehiculoId: number) => {
            const vigente = await precioMinimoApi.vigentePorVehiculo(vehiculoId);
            if (vigente.autorizado) return { vehiculoId, vigente };
            await precioMinimoApi.solicitar(vehiculoId, atencionId);
            return { vehiculoId, vigente: null };
        },
        networkMode: 'always',
        onSuccess: ({ vehiculoId, vigente }) => {
            if (vigente) {
                setPisos((p) => ({ ...p, [vehiculoId]: { precio: vigente.precioMinimo, moneda: vigente.moneda, venceEl: vigente.venceEl } }));
            } else {
                setPisos((p) => ({ ...p, [vehiculoId]: 'pedido' }));
                addToast('Pedido enviado. Un supervisor tiene que autorizarlo.', 'info');
            }
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo consultar el precio mínimo'), 'error'),
    });

    // ── Cierre ──────────────────────────────────────────────────────────────
    const [cierreAbierto, setCierreAbierto] = useState(false);
    const [resElegido, setResElegido] = useState<ResultadoAtencion | ''>('');
    const [observaciones, setObservaciones] = useState('');
    const [pcFecha, setPcFecha] = useState(fechaLocal(2));
    const [pcMedio, setPcMedio] = useState<TipoSeguimiento>('llamada');
    const [pcNota, setPcNota] = useState('');

    const necesitaProximo = resElegido ? !esResultadoDefinitivo(resElegido) : false;

    /**
     * Por qué NO se puede cerrar todavía. Devuelve el motivo en castellano, o null
     * si se puede. El botón se deshabilita CON este texto al lado: un botón gris
     * sin explicación, con el cliente esperando, es la peor pantalla posible.
     */
    const bloqueoCierre: string | null = (() => {
        if (!resElegido) return 'Elegí cómo terminó la visita. Ninguna atención queda sin resultado.';
        if (necesitaProximo && !pcFecha) return 'Este resultado no es definitivo: falta la FECHA del próximo contacto.';
        if (necesitaProximo && pcFecha < fechaLocal(0)) return 'La fecha del próximo contacto no puede ser anterior a hoy.';
        if (necesitaProximo && !pcMedio) return 'Este resultado no es definitivo: falta el MEDIO del próximo contacto.';
        return null;
    })();

    const cerrar = useMutation({
        mutationFn: () =>
            atencionesApi.cerrar(atencionId, {
                resultado: resElegido as ResultadoAtencion,
                observaciones: observaciones.trim() || undefined,
                proximoContacto: necesitaProximo ? pcFecha : undefined,
                medioProximoContacto: necesitaProximo ? pcMedio : undefined,
                notaProximoContacto: necesitaProximo ? (pcNota.trim() || undefined) : undefined,
            }),
        networkMode: 'always',
        onSuccess: (res) => {
            addToast(
                res.seguimientoId
                    ? 'Atención cerrada. El próximo contacto quedó agendado en Seguimientos.'
                    : 'Atención cerrada',
                'success',
            );
            setCierreAbierto(false);
            qc.invalidateQueries({ queryKey: ['atenciones'] });
        },
        onError: (e) => addToast(getErrorMessage(e, 'No se pudo cerrar la atención'), 'error'),
    });

    // ── Derivados de presentación ───────────────────────────────────────────
    const registradas = at?.vehiculos ?? [];
    // El `?? []` va ADENTRO del memo: afuera arma un array nuevo en cada render y
    // la dependencia cambiaría siempre, que es lo mismo que no memoizar nada.
    const registroPorVehiculo = useMemo(() => {
        const m = new Map<number, AtencionVehiculo>();
        for (const r of at?.vehiculos ?? []) m.set(r.vehiculoId, r);
        return m;
    }, [at]);

    // Unidades mostradas en visitas ANTERIORES a ésta.
    const yaVistasAntes = (historial?.historial.unidadesVistas ?? []).filter((u) => u.atencionId !== atencionId);
    const idsYaVistas = new Set(yaVistasAntes.map((u) => u.vehiculo?.id).filter((v): v is number => typeof v === 'number'));

    // El cliente es de otro vendedor: se deriva de la ficha, sin endpoint extra.
    const duenoId = at?.cliente?.vendedorAsignadoId ?? null;
    const avisoOtroVendedor = !!duenoId && !!at && duenoId !== at.vendedorId && !!at.cliente?.vendedorAsignado?.nombre;

    // Aviso blando del cierre: el resultado dice "cotización/reserva/test drive"
    // pero ninguna unidad quedó marcada así. No bloquea — avisa.
    const accionEsperada: Partial<Record<ResultadoAtencion, AccionAtencionVehiculo>> = {
        reserva: 'reservada', cotizacion: 'cotizada', test_drive: 'test_drive',
    };
    const faltaMarcar = (() => {
        if (!resElegido) return null;
        const esperada = accionEsperada[resElegido];
        if (!esperada) return null;
        if (registradas.some((r) => r.accion === esperada)) return null;
        return `Ninguna unidad de esta visita quedó marcada como "${ACCION_LABEL[esperada]}". Podés cerrar igual, pero después nadie va a saber sobre qué unidad fue.`;
    })();

    const permutaFaltante = resElegido === 'permuta_a_tasar' && !permutaActual;

    // ── Estados de página ───────────────────────────────────────────────────
    if (isPending) {
        return (
            <div className="at-cargando">
                <RefreshCw size={20} className="at-spin" /> Cargando la atención…
            </div>
        );
    }

    if (isError || !at) {
        return (
            <div className="at-error-page">
                <WifiOff size={30} />
                <p>No se pudo cargar la atención. Puede ser la conexión del salón: lo que ya registraste está guardado.</p>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => refetch()}>Reintentar</Button>
                    <Button variant="ghost" onClick={() => navigate('/atenciones')}>
                        <ArrowLeft size={16} /> Volver al mostrador
                    </Button>
                </div>
            </div>
        );
    }

    const cliente = at.cliente;
    const nombreCliente = cliente ? [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') : `Cliente #${at.clienteId}`;
    const metaResultado = at.resultado ? RESULTADO_ATENCION_META[at.resultado] : null;
    const proximo = at.seguimientos.find((s) => s.proximoContacto) ?? null;
    const sinConsentimiento = !!cliente && !cliente.consentimientoContacto;

    // ── Tarjeta de unidad ───────────────────────────────────────────────────
    /*
     * Es una FUNCIÓN que devuelve JSX, no un componente declarado adentro del
     * render: un componente definido acá cambia de identidad en cada render y React
     * desmonta y vuelve a montar el subárbol, con lo que el chip recién tocado
     * pierde el foco justo después de tocarlo.
     */
    const tarjetaUnidad = (
        { u, motivo, porEncima, tipo }: { u: UnidadSugerida; motivo?: string; porEncima?: boolean; tipo: TipoAtencionVehiculo },
    ) => {
        const reg = registroPorVehiculo.get(u.id);
        const enVuelo = marcando.has(u.id);
        const dias = diasEnStock(u.fechaIngreso);
        const piso = pisos[u.id];
        return (
            <article key={u.id} className={`at-unidad ${tipo === 'sugerida' ? 'is-sugerida' : 'is-buscada'} ${reg ? 'is-registrada' : ''}`}>
                <header className="at-unidad-head">
                    <div className="at-unidad-id">
                        <h4>{titulo(u)}</h4>
                        <div className="at-unidad-chips">
                            {u.dominio && <span className="at-tag">{u.dominio}</span>}
                            <span className="at-tag">N° {u.id}</span>
                            {kms(u.kmIngreso) && <span className="at-tag"><Gauge size={11} /> {kms(u.kmIngreso)}</span>}
                            {dias !== null && <span className="at-tag"><Timer size={11} /> {dias} días en stock</span>}
                            {u.sucursal?.nombre && <span className="at-tag"><MapPin size={11} /> {u.sucursal.nombre}</span>}
                            {u.color && <span className="at-tag">{u.color}</span>}
                            {idsYaVistas.has(u.id) && <span className="at-tag is-repetida">Ya se la mostraste</span>}
                        </div>
                    </div>
                    <div className="at-unidad-precio">
                        <span className="at-precio">{money(u.precioLista, u.moneda)}</span>
                        {/* Precio equivalente en la moneda del presupuesto (blue). Sólo
                            aparece cuando el auto está en otra moneda y se lo convirtió
                            para poder compararlo. Es ORIENTATIVO: el de arriba es el real. */}
                        {u.precioEnMonedaPresupuesto != null && u.monedaPresupuesto && (
                            <span
                                className="at-precio-equiv"
                                title={`Equivalente orientativo al dólar ${u.cotizacionAplicada?.tipo ?? 'blue'}${u.cotizacionAplicada ? ` ($${u.cotizacionAplicada.valor.toLocaleString('es-AR')})` : ''}. El precio real es ${money(u.precioLista, u.moneda)}.`}
                            >
                                ≈ {money(u.precioEnMonedaPresupuesto, u.monedaPresupuesto)}
                                <span className="at-precio-equiv-tag">{u.cotizacionAplicada?.tipo ?? 'blue'}</span>
                            </span>
                        )}
                        {porEncima && (
                            <span className="at-sobre-max" title="Supera el máximo que relevó el cliente. El motivo dice por cuánto.">
                                <TrendingUp size={12} /> sobre el máximo
                            </span>
                        )}
                        {/* El piso de venta llega SÓLO con autorización vigente. Sin
                            ella no se muestra ni un "—": el vendedor no tiene por qué
                            enterarse de que hay un número tapado. */}
                        {typeof piso === 'object' && (
                            <span className="at-piso" title={piso.venceEl ? `Autorizado hasta ${formatFecha(piso.venceEl)}` : 'Autorizado'}>
                                <Lock size={12} /> mín. {money(piso.precio, piso.moneda)}
                            </span>
                        )}
                    </div>
                </header>

                {/* CRITERIO 5: el motivo de la sugerencia, con peso propio. */}
                {motivo && (
                    <p className="at-motivo"><Sparkles size={14} /> <span>{motivo}</span></p>
                )}

                {!soloLectura && (
                    <div className="at-unidad-acciones">
                        <div className="at-acciones-grupo" role="group" aria-label="Qué se hizo con esta unidad">
                            {ACCIONES.map((a) => {
                                const pediraDatos = ACCIONES_DE_INTERES_REAL.includes(a) && sinConsentimiento;
                                return (
                                    <button
                                        key={a}
                                        type="button"
                                        className={`at-chip-accion ${reg?.accion === a ? 'is-on' : ''}`}
                                        disabled={enVuelo}
                                        title={pediraDatos
                                            ? 'Es interés real: al tocarlo se van a pedir el DNI, el email, el domicilio y el consentimiento del cliente.'
                                            : undefined}
                                        onClick={() => registrar.mutate({ vehiculoId: u.id, tipo, accion: a, motivoSugerencia: motivo })}
                                    >
                                        {reg?.accion === a && <Check size={12} />} {ACCION_LABEL[a]}
                                        {pediraDatos && <IdCard size={11} />}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="at-acciones-grupo" role="group" aria-label="Nivel de interés">
                            <span className="at-acciones-lbl">Interés</span>
                            {NIVELES_INTERES.map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    className={`at-chip-nivel is-${n} ${reg?.nivelInteres === n ? 'is-on' : ''}`}
                                    disabled={enVuelo}
                                    onClick={() => registrar.mutate({
                                        vehiculoId: u.id,
                                        tipo,
                                        accion: reg?.accion ?? 'vista',
                                        nivelInteres: n,
                                        motivoSugerencia: motivo,
                                    })}
                                >
                                    {NIVEL_INTERES_LABEL[n]}
                                </button>
                            ))}
                        </div>
                        <div className="at-unidad-extra">
                            <Link to={`/vehiculos/${u.id}`} className="at-link-sec">Ver ficha</Link>
                            {/* El botón es para PEDIR autorización, así que sólo se le
                                ofrece a quien la necesita. Sin este gate el propio
                                supervisor tocaba "Ver precio mínimo", el backend le
                                contestaba "no autorizado" y la pantalla le abría un
                                pedido a su nombre: terminaba teniendo que autorizarse a
                                sí mismo y ensuciando su propia bandeja. */}
                            {piso === 'pedido' ? (
                                <span className="at-piso-pendiente"><Lock size={12} /> Precio mínimo pendiente de autorización</span>
                            ) : typeof piso === 'object' ? null : (permisos.vePrecioMinimo || permisos.pidePrecioMinimo) ? (
                                <button
                                    type="button"
                                    className="at-link-sec"
                                    disabled={precioMinimo.isPending}
                                    onClick={() => precioMinimo.mutate(u.id)}
                                    title={permisos.vePrecioMinimo
                                        ? 'Mostrar el piso de venta de la ficha.'
                                        : 'El piso de venta lo autoriza un supervisor: acá se lo pedís.'}
                                >
                                    Ver precio mínimo
                                </button>
                            ) : null}
                        </div>
                    </div>
                )}
            </article>
        );
    };

    return (
        <div className="at-detalle">
            <PageTitle title={`Atención #${at.id}`} />

            {/* ── HERO ───────────────────────────────────────────────────── */}
            <header className="at-hero">
                <button className="at-back" type="button" onClick={() => navigate('/atenciones')} aria-label="Volver al mostrador">
                    <ArrowLeft size={20} />
                </button>
                <div className="at-hero-id">
                    <h1>{nombreCliente}</h1>
                    <div className="at-hero-chips">
                        <Badge variant={cerrada ? 'default' : 'warning'}>{cerrada ? 'Cerrada' : 'Abierta'}</Badge>
                        <span className="at-hero-meta">{MOTIVO_ATENCION_LABEL[at.motivo]}</span>
                        <span className="at-hero-meta">
                            <Clock size={13} /> {hora(at.iniciadaEn)}
                            {!cerrada && ` · ${transcurrido(at.iniciadaEn)} en curso`}
                        </span>
                        {at.vendedor?.nombre && <span className="at-hero-meta">Atiende {at.vendedor.nombre}</span>}
                        {cliente?.telefono && <span className="at-hero-meta">{cliente.telefono}</span>}
                        {cliente && <Link to={`/clientes/${cliente.id}`} className="at-link-sec">Ficha del cliente</Link>}
                    </div>
                </div>
                <div className="at-hero-cta">
                    {isFetching && <RefreshCw size={15} className="at-spin at-hero-sync" />}
                    {!soloLectura && (
                        <Button size="lg" onClick={() => setCierreAbierto(true)} data-tour="at-cerrar">
                            <CheckCircle2 size={18} /> Cerrar atención
                        </Button>
                    )}
                </div>
            </header>

            {/* Cliente de otro vendedor: avisa, nunca bloquea. */}
            {avisoOtroVendedor && (
                <div className="at-banner is-warning" role="alert">
                    <AlertTriangle size={18} />
                    <div>
                        <strong>Este cliente está asignado a {cliente?.vendedorAsignado?.nombre}.</strong>{' '}
                        Queda registrado que la visita la hiciste vos. La reasignación la autoriza un supervisor.
                    </div>
                </div>
            )}

            {/* Consentimiento: hace falta para todo lo que sea interés real. */}
            {sinConsentimiento && !soloLectura && (
                <div className="at-banner is-info" role="status">
                    <CircleAlert size={18} />
                    <div>
                        <strong>Sin consentimiento de contacto.</strong>{' '}
                        Mostrarle unidades no lo necesita. Para un test drive, una cotización, una reserva o la
                        permuta hay que pedirle el DNI, el email, el domicilio y su conformidad (Ley 25.326).
                        <div>
                            <button type="button" className="at-link" onClick={() => pedirDatos(null, { tipo: 'ninguna' })}>
                                Cargar los datos ahora
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Estado final, cuando ya está cerrada. */}
            {cerrada && (
                <div className={`at-banner ${at.resultado ? 'is-ok' : 'is-warning'}`} role="status">
                    {at.resultado ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
                    <div>
                        <strong>{metaResultado ? `Cerrada: ${metaResultado.label}` : 'Cerrada sin resultado'}</strong>
                        {at.cerradaAutomaticamente && ' · la cerró el sistema al terminar el día'}
                        {at.cerradaEn && ` · ${formatFecha(at.cerradaEn)} ${hora(at.cerradaEn)}`}
                        {proximo && (
                            <div className="at-banner-sub">
                                Próximo contacto: {formatFecha(proximo.proximoContacto)} por {MEDIO_CONTACTO_LABEL[proximo.tipo]}
                                {proximo.proximoContactoHecho ? ' (ya realizado)' : ''}
                            </div>
                        )}
                        {!at.resultado && (
                            <div className="at-banner-sub">
                                Quedó sin resultado, y una atención cerrada no se sigue trabajando. Si el cliente
                                vuelve, abrí una atención nueva desde el mostrador.
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="at-cuerpo">
                {/* ── COLUMNA PRINCIPAL ──────────────────────────────────── */}
                <div className="at-col-main">
                    {/* RELEVAMIENTO */}
                    <section className="card at-panel" data-tour="at-relevamiento">
                        <div className="at-panel-head">
                            <h2><Search size={17} /> Qué está buscando</h2>
                        </div>

                        <div className="segmented at-modos" role="group" aria-label="Modo de búsqueda">
                            {MODOS.map((m) => (
                                <button
                                    key={m.key}
                                    type="button"
                                    className={`segmented-btn ${rel.modo === m.key ? 'is-active' : ''}`}
                                    onClick={() => setRel({ modo: m.key })}
                                    disabled={soloLectura}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        <form
                            className="at-form"
                            onSubmit={(e) => { e.preventDefault(); if (!buscar.isPending) buscar.mutate(); }}
                        >
                            {rel.modo === 'presupuesto' && (
                                <div className="at-grid-3">
                                    <Input dense label="Desde" type="number" inputMode="numeric" placeholder="0"
                                        value={rel.presupuestoMin} onChange={(e) => setRel({ presupuestoMin: e.target.value })} disabled={soloLectura} />
                                    <Input dense label="Hasta" type="number" inputMode="numeric" placeholder="Tope que dijo"
                                        value={rel.presupuestoMax} onChange={(e) => setRel({ presupuestoMax: e.target.value })} disabled={soloLectura} />
                                    <Select dense label="Moneda" value={rel.moneda}
                                        onChange={(e) => setRel({ moneda: e.target.value === 'USD' ? 'USD' : 'ARS' })} disabled={soloLectura}>
                                        <option value="ARS">Pesos</option>
                                        <option value="USD">Dólares</option>
                                    </Select>
                                </div>
                            )}

                            {rel.modo === 'modelo' && (
                                <div className="at-grid-4">
                                    <Input dense label="Marca" placeholder="Ej: Toyota" value={rel.marca} onChange={(e) => setRel({ marca: e.target.value })} disabled={soloLectura} />
                                    <Input dense label="Modelo" placeholder="Ej: Corolla" value={rel.modelo} onChange={(e) => setRel({ modelo: e.target.value })} disabled={soloLectura} />
                                    <Input dense label="Versión" placeholder="Opcional" value={rel.version} onChange={(e) => setRel({ version: e.target.value })} disabled={soloLectura} />
                                    <Input dense label="Año" type="number" inputMode="numeric" placeholder="Opcional" value={rel.anio} onChange={(e) => setRel({ anio: e.target.value })} disabled={soloLectura} />
                                </div>
                            )}

                            {rel.modo === 'unidad' && (
                                <Input
                                    label="Patente, N° de stock o VIN"
                                    placeholder="Tipeá lo que tengas"
                                    value={rel.referencia}
                                    onChange={(e) => setRel({ referencia: e.target.value })}
                                    disabled={soloLectura}
                                    hint="Si la unidad no está disponible, te decimos su estado y las alternativas pasan a ser la respuesta."
                                />
                            )}

                            {/* Permuta y financiación */}
                            <button type="button" className="at-desplegar" onClick={() => setRel({ abiertoExtra: !rel.abiertoExtra })}>
                                {rel.abiertoExtra ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                Permuta y forma de pago
                                {(permutaActual || anticipoNum > 0) && <span className="at-tag is-on">cargado</span>}
                            </button>

                            {rel.abiertoExtra && (
                                <div className="at-extra">
                                    <div className="at-extra-bloque">
                                        <h3 className="at-extra-title"><Wallet size={14} /> Forma de pago</h3>
                                        <div className="at-grid-3">
                                            <Input dense label="Anticipo disponible" type="number" inputMode="numeric" placeholder="0"
                                                value={rel.anticipo} onChange={(e) => setRel({ anticipo: e.target.value })} disabled={soloLectura} />
                                            <Input dense label="Cuota máxima" type="number" inputMode="numeric" placeholder="Lo que puede pagar"
                                                value={rel.cuotaMaxima} onChange={(e) => setRel({ cuotaMaxima: e.target.value })} disabled={soloLectura} />
                                            <Select dense label="Tipo" placeholder="Sin definir" value={rel.tipoFinanciamiento}
                                                onChange={(e) => setRel({ tipoFinanciamiento: e.target.value as TipoFinanciamiento | '' })} disabled={soloLectura}>
                                                {(Object.keys(TIPO_FINANCIAMIENTO_LABEL) as TipoFinanciamiento[]).map((t) => (
                                                    <option key={t} value={t}>{TIPO_FINANCIAMIENTO_LABEL[t]}</option>
                                                ))}
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="at-extra-bloque">
                                        <h3 className="at-extra-title"><Handshake size={14} /> Permuta</h3>
                                        {permutaActual ? (
                                            <div className="at-permuta-actual">
                                                <div>
                                                    <strong>{titulo(permutaActual)}</strong>
                                                    <div className="at-permuta-meta">
                                                        {kms(permutaActual.km) ?? 'sin km'}
                                                        {permutaActual.condicion ? ` · ${CONDICION_MAP[permutaActual.condicion].label}` : ''}
                                                    </div>
                                                </div>
                                                <div className="at-permuta-valor">
                                                    <Badge variant={permutaActual.estado === 'tasada' ? 'success' : permutaActual.estado === 'rechazada' ? 'danger' : 'warning'}>
                                                        {ESTADO_PERMUTA_LABEL[permutaActual.estado]}
                                                    </Badge>
                                                    <span>{money(permutaActual.valorEstimado, permutaActual.moneda ?? rel.moneda)}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="at-grid-4">
                                                    <Input dense label="Marca" placeholder="Del usado" value={pMarca} onChange={(e) => setPMarca(e.target.value)} disabled={soloLectura} />
                                                    <Input dense label="Modelo" value={pModelo} onChange={(e) => setPModelo(e.target.value)} disabled={soloLectura} />
                                                    {/* Dominio OBLIGATORIO: la permuta se va a tasar y sin la patente el
                                                        tasador no sabe qué auto revisar. */}
                                                    <Input dense label="Dominio *" placeholder="AB123CD" value={pDominio} onChange={(e) => setPDominio(e.target.value)} disabled={soloLectura} />
                                                    <Input dense label="Año" type="number" inputMode="numeric" value={pAnio} onChange={(e) => setPAnio(e.target.value)} disabled={soloLectura} />
                                                    <Input dense label="Km" type="number" inputMode="numeric" value={pKm} onChange={(e) => setPKm(e.target.value)} disabled={soloLectura} />
                                                </div>
                                                <div className="at-grid-3">
                                                    <Select dense label="Estado general" value={pCondicion}
                                                        onChange={(e) => setPCondicion(e.target.value as CondicionTasacion)} disabled={soloLectura}>
                                                        {CONDICIONES.map((c) => <option key={c} value={c}>{CONDICION_MAP[c].label}</option>)}
                                                    </Select>
                                                    <Input
                                                        dense
                                                        label="Valor estimado de toma"
                                                        type="number"
                                                        inputMode="numeric"
                                                        placeholder={soloTasador ? 'Lo define el tasador' : 'Lo que estimás'}
                                                        value={soloTasador ? '' : pValor}
                                                        onChange={(e) => setPValor(e.target.value)}
                                                        disabled={soloLectura || soloTasador}
                                                        hint={soloTasador ? 'En esta concesionaria la tasación la hace el tasador.' : undefined}
                                                    />
                                                    <div className="at-extra-cta">
                                                        <Button
                                                            variant="secondary"
                                                            type="button"
                                                            loading={guardarPermuta.isPending}
                                                            disabled={soloLectura || !pMarca.trim() || !pModelo.trim() || !pDominio.trim()}
                                                            onClick={() => guardarPermuta.mutate(soloTasador)}
                                                        >
                                                            Cargar permuta
                                                        </Button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* El número que manda el filtro. */}
                                    {presupuestoReal > 0 && (
                                        <div className="at-presupuesto-real">
                                            <div>
                                                <span className="at-pr-lbl">Presupuesto real</span>
                                                <span className="at-pr-val">{money(presupuestoReal, rel.moneda)}</span>
                                            </div>
                                            <p>
                                                Permuta {money(valorPermuta, rel.moneda)} + anticipo {money(anticipoNum, rel.moneda)}.
                                                Este es el número que filtra el stock, no el que dijo al principio.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="at-form-cta">
                                <label className="at-toggle-min">
                                    <input
                                        type="checkbox"
                                        checked={incluirYaMostradas}
                                        onChange={(e) => setIncluirYaMostradas(e.target.checked)}
                                        disabled={soloLectura}
                                    />
                                    Incluir las que ya le mostré
                                </label>
                                <Button type="submit" size="lg" loading={buscar.isPending} disabled={soloLectura}>
                                    <Search size={18} /> Buscar unidades
                                </Button>
                            </div>
                        </form>
                    </section>

                    {/* RESULTADOS */}
                    <section className="at-resultados" data-tour="at-resultados">
                        {buscar.isPending ? (
                            <div className="at-lista-alt">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="card at-unidad">
                                        <span className="skeleton skeleton-text" style={{ width: '45%' }} />
                                        <span className="skeleton skeleton-text" style={{ width: '75%', marginTop: '0.6rem' }} />
                                        <span className="skeleton skeleton-text" style={{ width: '30%', marginTop: '0.6rem' }} />
                                    </div>
                                ))}
                            </div>
                        ) : buscar.isError ? (
                            <div className="card at-vacio is-error" role="alert">
                                <AlertTriangle size={26} />
                                <div>{getErrorMessage(buscar.error, 'La búsqueda falló')}</div>
                                <p className="at-vacio-hint">Es un problema de la consulta, no del stock. Probá de nuevo.</p>
                                <Button variant="secondary" size="sm" onClick={() => buscar.mutate()}>Reintentar</Button>
                            </div>
                        ) : !resultado ? (
                            <div className="card at-vacio">
                                <Car size={28} style={{ opacity: 0.4 }} />
                                <div>Todavía no buscaste nada.</div>
                                <p className="at-vacio-hint">
                                    Cargá arriba lo que busca y tocá <strong>Buscar unidades</strong>. Siempre vas a
                                    recibir hasta 3 alternativas, con el motivo de cada una.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* La buscada NO está disponible: se dice el estado con claridad
                                    y las alternativas pasan a ser la respuesta principal. */}
                                {resultado.estadoDeLaExacta && (
                                    <div className="card at-no-disponible" role="alert">
                                        <div className="at-nd-icon"><Ban size={22} /></div>
                                        <div>
                                            <strong>Esa unidad no está disponible.</strong>
                                            <p>Estado actual: <b>{resultado.estadoDeLaExacta}</b>. No se puede ofrecer.</p>
                                            <p className="at-nd-sub">Estas son las alternativas que sí podés mostrarle:</p>
                                        </div>
                                    </div>
                                )}

                                {resultado.exacta && (
                                    <div className="at-bloque">
                                        <h3 className="at-bloque-title"><Check size={15} /> Lo que buscaba</h3>
                                        {/* Si supera el máximo relevado se dice, igual que en las
                                            alternativas: el vendedor tiene que saber que el auto que
                                            está mostrando está arriba de lo que el cliente dijo. */}
                                        {tarjetaUnidad({ u: resultado.exacta, tipo: 'buscada', porEncima: resultado.exactaPorEncimaDelMaximo })}
                                    </div>
                                )}

                                {/* Cómo se armó el filtro. La nota se muestra cuando el techo
                                    EFECTIVAMENTE filtró: decir "se filtró con $X" en un modo donde
                                    el techo sólo marca sería afirmar un recorte que no ocurrió. */}
                                {resultado.relevamiento.presupuestoFiltra
                                    && resultado.relevamiento.presupuestoQueMandaElFiltro !== null && (
                                    <p className="at-filtro-nota">
                                        <Sparkles size={14} />
                                        <span>
                                            Se filtró con {money(resultado.relevamiento.presupuestoQueMandaElFiltro, resultado.relevamiento.moneda)}
                                            {' '}({resultado.relevamiento.origenDelFiltro})
                                            {resultado.relevamiento.presupuestoRealCalculado !== null
                                                ? ', no con lo que el cliente dijo al principio.'
                                                : '.'}
                                        </span>
                                    </p>
                                )}
                                {/* El rango relevado quedó en otra moneda que la de la comparación:
                                    no se aplicó, y callarlo dejaría al vendedor creyendo que sí. */}
                                {resultado.relevamiento.rangoIgnoradoPorMoneda && (
                                    <p className="at-filtro-nota is-suave">
                                        <CircleAlert size={14} />
                                        <span>
                                            El presupuesto de esta visita está relevado en {resultado.relevamiento.monedaDelRelevamiento} y
                                            esta búsqueda se comparó en {resultado.relevamiento.moneda}: el rango no se aplicó.
                                        </span>
                                    </p>
                                )}
                                {resultado.notaFinanciamiento && (
                                    <p className="at-filtro-nota is-suave"><CircleAlert size={14} /> <span>{resultado.notaFinanciamiento}</span></p>
                                )}
                                {/* Cuando entraron autos de otra moneda por cotización, se dice
                                    con qué valor se convirtieron: el equivalente en pesos es una
                                    referencia, no el precio real (que sigue en su moneda). */}
                                {resultado.relevamiento.cotizacion && resultado.relevamiento.unidadesConvertidas > 0 && (
                                    <p className="at-filtro-nota is-suave">
                                        <CircleAlert size={14} />
                                        <span>
                                            {resultado.relevamiento.unidadesConvertidas} unidad{resultado.relevamiento.unidadesConvertidas === 1 ? '' : 'es'} en otra moneda
                                            {' '}se convirt{resultado.relevamiento.unidadesConvertidas === 1 ? 'ió' : 'ieron'} a {resultado.relevamiento.monedaDelRelevamiento} al
                                            {' '}dólar {resultado.relevamiento.cotizacion.tipo} (${resultado.relevamiento.cotizacion.valor.toLocaleString('es-AR')}) para poder compararlas.
                                            {' '}El equivalente es orientativo; el precio real de cada auto sigue en su moneda.
                                        </span>
                                    </p>
                                )}

                                <div className="at-bloque">
                                    <h3 className="at-bloque-title">
                                        <Sparkles size={15} />
                                        {resultado.estadoDeLaExacta ? 'Alternativas disponibles' : 'También podés mostrarle'}
                                        <span className="at-conteo">{resultado.alternativas.length} de 3</span>
                                    </h3>

                                    {/* Menos de 3: se informa. Nunca se rellena. */}
                                    {resultado.aviso && (
                                        <div className="at-banner is-info at-banner-sm" role="status">
                                            <CircleAlert size={16} />
                                            <div>{resultado.aviso}</div>
                                        </div>
                                    )}

                                    {resultado.alternativas.length === 0 ? (
                                        <div className="card at-vacio">
                                            <Ban size={26} style={{ opacity: 0.4 }} />
                                            <div>No hay ninguna alternativa que cumpla los criterios.</div>
                                            <p className="at-vacio-hint">
                                                Preferimos no mostrar nada antes que ofrecerle algo que no le sirve.
                                                {rel.modo === 'presupuesto'
                                                    ? ' Ampliá el rango o la moneda y volvé a buscar.'
                                                    : rel.modo === 'modelo'
                                                        ? ' Probá con otra marca o modelo, o buscá por presupuesto.'
                                                        : ' Probá buscar por modelo o por presupuesto.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="at-lista-alt">
                                            {resultado.alternativas.map((s: Sugerencia) => tarjetaUnidad({
                                                u: s.unidad,
                                                motivo: s.motivo,
                                                porEncima: s.porEncimaDelMaximo,
                                                tipo: 'sugerida',
                                            }))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </section>
                </div>

                {/* ── COLUMNA LATERAL: el registro de la visita ───────────── */}
                <aside className="at-col-side">
                    <section className="card at-panel at-registro" data-tour="at-registro">
                        <div className="at-panel-head">
                            <h2><ListChecks size={17} /> En esta visita</h2>
                            <span className="at-conteo">{registradas.length}</span>
                        </div>

                        {registradas.length === 0 ? (
                            <p className="at-vacio-inline">
                                Todavía no marcaste ninguna unidad. Lo que le muestres queda acá y se lee en la
                                próxima visita.
                            </p>
                        ) : (
                            <ul className="at-reg-list">
                                {registradas.map((r) => (
                                    <li key={r.id} className="at-reg-item">
                                        <div className="at-reg-body">
                                            <span className="at-reg-nombre">{titulo(r.vehiculo)}</span>
                                            <div className="at-reg-chips">
                                                <span className={`at-tag ${r.tipo === 'sugerida' ? 'is-sug' : ''}`}>
                                                    {r.tipo === 'sugerida' ? 'sugerida' : 'la buscó'}
                                                </span>
                                                <span className="at-tag is-on">{ACCION_LABEL[r.accion]}</span>
                                                {r.nivelInteres && (
                                                    <span className={`at-tag is-nivel-${r.nivelInteres}`}>
                                                        interés {NIVEL_INTERES_LABEL[r.nivelInteres].toLowerCase()}
                                                    </span>
                                                )}
                                            </div>
                                            {r.motivoSugerencia && <p className="at-reg-motivo">{r.motivoSugerencia}</p>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {yaVistasAntes.length > 0 && (
                        <section className="card at-panel">
                            <div className="at-panel-head">
                                <h2><Clock size={17} /> Ya vio antes</h2>
                                <span className="at-conteo">{yaVistasAntes.length}</span>
                            </div>
                            <ul className="at-reg-list">
                                {yaVistasAntes.slice(0, 8).map((u) => (
                                    <li key={u.id} className="at-reg-item">
                                        <div className="at-reg-body">
                                            <span className="at-reg-nombre">{titulo(u.vehiculo)}</span>
                                            <div className="at-reg-chips">
                                                <span className="at-tag">{ACCION_LABEL[u.accion]}</span>
                                                <span className="at-tag">{formatFecha(u.createdAt)}</span>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <p className="at-vacio-inline">
                                Estas no se repiten en las sugerencias, salvo que hayan bajado de precio o lo pidas.
                            </p>
                        </section>
                    )}

                    {at.observaciones && (
                        <section className="card at-panel">
                            <div className="at-panel-head"><h2>Observaciones</h2></div>
                            <p className="at-obs">{at.observaciones}</p>
                        </section>
                    )}
                </aside>
            </div>

            {/* ── MODAL: datos del cliente (enriquecimiento progresivo) ──── */}
            <Modal
                isOpen={datosAbierto}
                onClose={() => { setDatosAbierto(false); setPendiente(null); }}
                title="Completar los datos del cliente"
                subtitle="Recién ahora hacen falta: para mostrarle unidades no se piden."
                maxWidth="560px"
                footer={
                    <div className="at-cierre-footer">
                        <p className="at-bloqueo-suave">Se cargan una sola vez. Después el flujo sigue solo.</p>
                        <div className="at-cierre-btns">
                            <Button variant="secondary" onClick={() => { setDatosAbierto(false); setPendiente(null); }}>Cancelar</Button>
                            <Button loading={completarDatos.isPending} onClick={() => completarDatos.mutate()}>
                                Guardar y continuar
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className="at-cierre">
                    <p className="at-proximo-porque">
                        <CircleAlert size={16} />
                        <span>
                            {motivoDatos || 'Para registrar interés real —test drive, cotización, reserva o permuta— el sistema exige estos datos.'}
                        </span>
                    </p>
                    {faltantes.length > 0 && (
                        <div className="at-chips">
                            {faltantes.map((f) => (
                                <span key={f} className="at-tag is-repetida">{FALTANTE_LABEL[f] ?? f}</span>
                            ))}
                        </div>
                    )}
                    <div className="at-grid-3">
                        <Input dense label="DNI" placeholder="Sin puntos" value={dDni} onChange={(e) => setDDni(e.target.value)} />
                        <Input dense label="Email" type="email" placeholder="correo@ejemplo.com" value={dEmail} onChange={(e) => setDEmail(e.target.value)} />
                        <Input dense label="Domicilio" placeholder="Calle, número, ciudad" value={dDireccion} onChange={(e) => setDDireccion(e.target.value)} />
                    </div>
                    <label className="at-consentimiento">
                        <input type="checkbox" checked={dConsentimiento} onChange={(e) => setDConsentimiento(e.target.checked)} />
                        <span>
                            <strong>El cliente presta conformidad para ser contactado.</strong>
                            <em>
                                Ley 25.326 de Protección de Datos Personales. Preguntáselo en voz alta antes de
                                marcarlo: es una declaración del titular, no un trámite.
                            </em>
                        </span>
                    </label>
                </div>
            </Modal>

            {/* ── MODAL DE CIERRE ────────────────────────────────────────── */}
            <Modal
                isOpen={cierreAbierto}
                onClose={() => setCierreAbierto(false)}
                title="Cerrar la atención"
                subtitle="Ninguna visita queda sin resultado: es lo que después explica qué pasó con este cliente."
                maxWidth="720px"
                footer={
                    <div className="at-cierre-footer">
                        {bloqueoCierre ? (
                            <p className="at-bloqueo" role="alert"><Ban size={15} /> {bloqueoCierre}</p>
                        ) : (
                            <p className="at-listo"><Check size={15} /> Listo para cerrar.</p>
                        )}
                        <div className="at-cierre-btns">
                            <Button variant="secondary" onClick={() => setCierreAbierto(false)}>Cancelar</Button>
                            <Button loading={cerrar.isPending} disabled={!!bloqueoCierre} onClick={() => cerrar.mutate()}>
                                <CheckCircle2 size={16} /> Cerrar atención
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className="at-cierre">
                    <h3 className="at-cierre-title">¿Cómo terminó?</h3>
                    <div className="at-res-opts">
                        {RESULTADOS_ATENCION.map((r) => {
                            const meta = RESULTADO_ATENCION_META[r];
                            return (
                                <button
                                    key={r}
                                    type="button"
                                    className={`at-res-opt ${resElegido === r ? 'is-on' : ''} ${meta.definitivo ? 'is-def' : 'is-seg'}`}
                                    onClick={() => setResElegido(r)}
                                    aria-pressed={resElegido === r}
                                >
                                    <span className="at-res-lbl">{meta.label}</span>
                                    <span className="at-res-ayuda">{meta.ayuda}</span>
                                    <span className="at-res-tag">{meta.definitivo ? 'cierra solo' : 'requiere seguimiento'}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Próximo contacto: aparece SOLO cuando hace falta, y explicado. */}
                    {necesitaProximo && (
                        <div className="at-proximo">
                            <p className="at-proximo-porque">
                                <CircleAlert size={16} />
                                <span>
                                    <strong>Este resultado no cierra la operación.</strong> Para poder guardarlo hace
                                    falta cuándo y cómo lo volvés a contactar: sin eso el cliente se pierde, y por eso
                                    el sistema no deja cerrar. Queda agendado en Seguimientos.
                                </span>
                            </p>
                            <div className="at-grid-3">
                                <Input
                                    dense
                                    label="Próximo contacto"
                                    type="date"
                                    min={fechaLocal(0)}
                                    value={pcFecha}
                                    onChange={(e) => setPcFecha(e.target.value)}
                                />
                                <Select dense label="Medio" value={pcMedio} onChange={(e) => setPcMedio(e.target.value as TipoSeguimiento)}>
                                    {MEDIOS_CONTACTO.map((m) => <option key={m} value={m}>{MEDIO_CONTACTO_LABEL[m]}</option>)}
                                </Select>
                                <Input dense label="Qué le vas a decir" placeholder="Opcional" value={pcNota} onChange={(e) => setPcNota(e.target.value)} />
                            </div>
                        </div>
                    )}

                    {/* Avisos blandos: informan, no bloquean. */}
                    {faltaMarcar && <p className="at-suave"><CircleAlert size={15} /> {faltaMarcar}</p>}
                    {permutaFaltante && (
                        <p className="at-suave">
                            <CircleAlert size={15} /> No cargaste la permuta. Podés cerrar igual, pero el tasador no
                            va a saber qué usado tiene que tasar.
                        </p>
                    )}

                    <Textarea
                        dense
                        label="Observaciones de la visita"
                        placeholder="Lo que convenga que sepa el que la atienda la próxima vez"
                        rows={3}
                        value={observaciones}
                        onChange={(e) => setObservaciones(e.target.value)}
                    />
                </div>
            </Modal>

            <style>{`
                /* ── Página ───────────────────────────────────────────────── */
                .at-detalle { display: flex; flex-direction: column; gap: 1.25rem; animation: at-fade 0.35s var(--easing-out); }
                .at-cargando { display: flex; align-items: center; justify-content: center; gap: 0.75rem; height: 60vh; color: var(--text-secondary); }
                .at-error-page { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 4rem 1.5rem; text-align: center; color: var(--warning); }
                .at-error-page p { margin: 0; color: var(--text-secondary); max-width: 52ch; line-height: 1.5; }
                .at-spin { animation: at-rot 0.9s linear infinite; }

                /* ── Hero ─────────────────────────────────────────────────── */
                .at-hero { display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
                .at-back { padding: 0.55rem; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); cursor: pointer; transition: all var(--duration-fast); flex-shrink: 0; }
                .at-back:hover { background: var(--bg-secondary); color: var(--text-primary); transform: translateX(-2px); }
                .at-hero-id { flex: 1; min-width: 220px; }
                .at-hero-id h1 { margin: 0; font-size: var(--text-2xl); font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; }
                .at-hero-chips { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.45rem; }
                .at-hero-meta { display: inline-flex; align-items: center; gap: 0.3rem; font-size: var(--text-sm); color: var(--text-secondary); }
                .at-hero-cta { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
                .at-hero-sync { color: var(--text-muted); }
                .at-link-sec { background: none; border: none; padding: 0; font-family: inherit; font-size: var(--text-sm); font-weight: 700; color: var(--accent); cursor: pointer; text-decoration: none; }
                .at-link-sec:hover:not(:disabled) { text-decoration: underline; }
                .at-link-sec:disabled { opacity: 0.5; cursor: default; }

                /* ── Banners ──────────────────────────────────────────────── */
                .at-banner { display: flex; gap: 0.7rem; align-items: flex-start; padding: 0.85rem 1.1rem; border: 1px solid var(--border); border-left-width: 3px; border-radius: var(--radius-md); background: var(--bg-card); font-size: var(--text-base); line-height: 1.5; }
                .at-banner.is-warning { border-left-color: var(--warning); color: var(--warning); }
                .at-banner.is-info { border-left-color: var(--info); color: var(--info); }
                .at-banner.is-ok { border-left-color: var(--success); color: var(--success); }
                .at-banner > div { color: var(--text-secondary); min-width: 0; }
                .at-banner strong { color: var(--text-primary); }
                .at-banner-sub { margin-top: 0.25rem; font-size: var(--text-sm); color: var(--text-muted); }
                .at-banner-sm { font-size: var(--text-sm); padding: 0.6rem 0.9rem; }
                .at-link { background: none; border: none; padding: 0; cursor: pointer; color: var(--accent); font-weight: 700; font-size: var(--text-sm); font-family: inherit; margin-top: 0.3rem; }
                .at-link:hover { text-decoration: underline; }

                /* ── Cuerpo ───────────────────────────────────────────────── */
                .at-cuerpo { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 1.25rem; align-items: start; }
                .at-col-main { display: flex; flex-direction: column; gap: 1.25rem; min-width: 0; }
                .at-col-side { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }

                .at-panel { padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
                .at-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
                .at-panel-head h2 { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: var(--text-md); font-weight: 800; letter-spacing: -0.01em; }
                .at-conteo { font-size: var(--text-2xs); font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); background: var(--bg-secondary); border-radius: var(--radius-pill); padding: 0.15rem 0.55rem; }

                .at-modos { align-self: flex-start; max-width: 100%; }
                .at-form { display: flex; flex-direction: column; gap: 1rem; }
                .at-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.85rem; align-items: end; }
                .at-grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.85rem; }
                .at-form-cta { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
                .at-form-cta .btn { flex-shrink: 0; }
                .at-toggle-min { display: inline-flex; align-items: center; gap: 0.4rem; font-size: var(--text-sm); color: var(--text-secondary); cursor: pointer; user-select: none; }
                .at-toggle-min input { width: 15px; height: 15px; accent-color: var(--accent); cursor: pointer; }

                /* ── Permuta / financiación ───────────────────────────────── */
                .at-desplegar { display: inline-flex; align-items: center; gap: 0.4rem; align-self: flex-start; background: none; border: none; padding: 0; font-family: inherit; font-size: var(--text-sm); font-weight: 700; color: var(--accent); cursor: pointer; }
                .at-extra { display: flex; flex-direction: column; gap: 1.1rem; padding: 1rem; border: 1px dashed var(--border-strong); border-radius: var(--radius-md); background: var(--bg-secondary); }
                .at-extra-bloque { display: flex; flex-direction: column; gap: 0.75rem; }
                .at-extra-title { display: flex; align-items: center; gap: 0.4rem; margin: 0; font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 800; }
                .at-extra-cta { display: flex; align-items: flex-end; }
                .at-extra-cta .btn { width: 100%; }
                .at-permuta-actual { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 0.9rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); flex-wrap: wrap; }
                .at-permuta-meta { font-size: var(--text-xs); color: var(--text-muted); margin-top: 0.1rem; }
                .at-permuta-valor { display: flex; align-items: center; gap: 0.6rem; font-weight: 800; font-size: var(--text-md); }
                .at-presupuesto-real { padding: 0.9rem 1.1rem; border-radius: var(--radius-md); background: rgba(var(--accent-rgb), 0.1); border: 1px solid rgba(var(--accent-rgb), 0.3); }
                .at-presupuesto-real > div { display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; }
                .at-pr-lbl { font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; color: var(--text-secondary); }
                .at-pr-val { font-size: var(--text-xl); font-weight: 800; letter-spacing: -0.02em; color: var(--accent); font-variant-numeric: tabular-nums; }
                .at-presupuesto-real p { margin: 0.3rem 0 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.45; }

                /* ── Resultados ───────────────────────────────────────────── */
                .at-resultados { display: flex; flex-direction: column; gap: 1.1rem; }
                .at-bloque { display: flex; flex-direction: column; gap: 0.7rem; }
                .at-bloque-title { display: flex; align-items: center; gap: 0.45rem; margin: 0; font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 800; }
                .at-lista-alt { display: flex; flex-direction: column; gap: 0.75rem; }
                .at-filtro-nota { display: flex; align-items: flex-start; gap: 0.4rem; margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.45; }
                .at-filtro-nota svg { color: var(--accent); flex-shrink: 0; margin-top: 0.1rem; }
                .at-filtro-nota.is-suave svg { color: var(--text-muted); }

                .at-no-disponible { display: flex; gap: 1rem; align-items: flex-start; padding: 1.1rem 1.25rem; border-left: 3px solid var(--danger); }
                .at-nd-icon { width: 40px; height: 40px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; background: rgba(var(--danger-rgb), 0.14); color: var(--danger); flex-shrink: 0; }
                .at-no-disponible strong { font-size: var(--text-md); }
                .at-no-disponible p { margin: 0.25rem 0 0; font-size: var(--text-sm); color: var(--text-secondary); }
                /* Se califica con el ancestro a propósito: '.at-no-disponible p' pesa
                   (0,1,1) y una clase sola no le gana — el mismo choque que
                   '.header-title p' en index.css. Sin esto el renglón salía apagado. */
                .at-no-disponible p.at-nd-sub { color: var(--text-primary); font-weight: 700; }

                /* ── Tarjeta de unidad ────────────────────────────────────── */
                .at-unidad { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-card); padding: 1rem 1.1rem; display: flex; flex-direction: column; gap: 0.75rem; transition: border-color var(--duration-fast), box-shadow var(--duration-fast); }
                .at-unidad.is-buscada { border-left: 3px solid var(--accent); }
                .at-unidad.is-sugerida { border-left: 3px solid var(--accent-2); }
                .at-unidad.is-registrada { box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.35); }
                .at-unidad-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
                .at-unidad-id { min-width: 0; flex: 1; }
                .at-unidad-id h4 { margin: 0 0 0.35rem; font-size: var(--text-md); font-weight: 800; letter-spacing: -0.01em; }
                .at-unidad-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
                .at-unidad-precio { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; flex-shrink: 0; }
                .at-precio { font-size: var(--text-xl); font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
                .at-precio-equiv { display: inline-flex; align-items: center; gap: 0.35rem; font-size: var(--text-xs); font-weight: 700; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
                .at-precio-equiv-tag { font-size: var(--text-2xs); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 14%, transparent); padding: 0.05rem 0.35rem; border-radius: var(--radius-sm); }
                .at-sobre-max { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--text-2xs); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--warning); }
                .at-piso { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--text-xs); font-weight: 700; color: var(--accent-3); }
                .at-piso-pendiente { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--text-xs); color: var(--text-muted); }

                .at-tag { display: inline-flex; align-items: center; gap: 0.2rem; font-size: var(--text-2xs); padding: 0.12rem 0.5rem; border-radius: var(--radius-pill); background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border); white-space: nowrap; }
                .at-tag.is-repetida { color: var(--warning); border-color: rgba(var(--warning-rgb), 0.4); }
                .at-tag.is-on { color: var(--accent); border-color: rgba(var(--accent-rgb), 0.4); }
                .at-tag.is-sug { color: var(--accent-2); border-color: rgba(var(--accent-2-rgb), 0.4); }
                .at-tag.is-nivel-alto { color: var(--success); border-color: rgba(var(--accent-rgb), 0.4); }
                .at-tag.is-nivel-medio { color: var(--warning); border-color: rgba(var(--warning-rgb), 0.4); }
                .at-tag.is-nivel-bajo { color: var(--text-muted); }

                /* EL MOTIVO. Es lo que el vendedor lee en voz alta: va con peso propio,
                   no como nota al pie. Criterio de aceptación 5. */
                .at-motivo { display: flex; align-items: flex-start; gap: 0.5rem; margin: 0; padding: 0.6rem 0.8rem; border-radius: var(--radius-md); background: rgba(var(--accent-2-rgb), 0.1); color: var(--text-primary); font-size: var(--text-base); font-weight: 600; line-height: 1.45; }
                .at-motivo svg { color: var(--accent-2); flex-shrink: 0; margin-top: 0.15rem; }

                .at-unidad-acciones { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.6rem; border-top: 1px solid var(--border); }
                .at-acciones-grupo { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
                .at-acciones-lbl { font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; color: var(--text-muted); margin-right: 0.15rem; }
                /* Objetivo de toque de 40px: esto se marca con el dedo, parado. */
                .at-chip-accion, .at-chip-nivel { display: inline-flex; align-items: center; gap: 0.25rem; min-height: 40px; padding: 0.35rem 0.85rem; border-radius: var(--radius-pill); border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-secondary); font-family: inherit; font-size: var(--text-sm); font-weight: 700; cursor: pointer; transition: all var(--duration-fast); }
                .at-chip-accion:hover:not(:disabled), .at-chip-nivel:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-strong); }
                .at-chip-accion:disabled, .at-chip-nivel:disabled { opacity: 0.55; cursor: default; }
                .at-chip-accion.is-on { background: var(--accent); border-color: var(--accent); color: var(--text-on-accent); }
                .at-chip-nivel.is-on.is-alto { background: var(--success); border-color: var(--success); color: var(--text-on-accent); }
                .at-chip-nivel.is-on.is-medio { background: var(--warning); border-color: var(--warning); color: var(--text-on-accent); }
                .at-chip-nivel.is-on.is-bajo { background: var(--text-muted); border-color: var(--text-muted); color: var(--text-white); }
                .at-unidad-extra { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; padding-top: 0.15rem; }

                /* ── Registro de la visita (columna lateral) ──────────────── */
                .at-registro { position: sticky; top: 1rem; }
                .at-reg-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
                .at-reg-item { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.65rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); }
                .at-reg-body { flex: 1; min-width: 0; }
                .at-reg-nombre { display: block; font-weight: 700; font-size: var(--text-sm); color: var(--text-primary); }
                .at-reg-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.3rem; }
                .at-reg-motivo { margin: 0.35rem 0 0; font-size: var(--text-xs); color: var(--text-muted); line-height: 1.4; }
                .at-obs { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); white-space: pre-wrap; line-height: 1.55; }

                /* ── Vacíos / errores ─────────────────────────────────────── */
                .at-vacio { display: flex; flex-direction: column; align-items: center; gap: 0.55rem; text-align: center; padding: 2.25rem 1.5rem; color: var(--text-secondary); }
                .at-vacio.is-error { color: var(--danger); }
                .at-vacio-hint { margin: 0; font-size: var(--text-sm); color: var(--text-muted); max-width: 48ch; line-height: 1.5; }
                .at-vacio-inline { margin: 0; font-size: var(--text-sm); color: var(--text-muted); line-height: 1.5; }

                /* ── Modales (datos del cliente y cierre) ─────────────────── */
                .at-cierre { display: flex; flex-direction: column; gap: 1.1rem; }
                .at-cierre-title { margin: 0; font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 800; }
                .at-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
                .at-res-opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.6rem; }
                .at-res-opt { display: flex; flex-direction: column; gap: 0.2rem; text-align: left; padding: 0.7rem 0.85rem; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-card); cursor: pointer; font-family: inherit; transition: all var(--duration-fast); }
                .at-res-opt:hover { border-color: var(--border-strong); }
                .at-res-opt.is-on { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.25); background: rgba(var(--accent-rgb), 0.06); }
                .at-res-lbl { font-weight: 800; font-size: var(--text-sm); color: var(--text-primary); }
                .at-res-ayuda { font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.4; }
                .at-res-tag { margin-top: 0.25rem; font-size: var(--text-3xs); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; }
                .at-res-opt.is-def .at-res-tag { color: var(--success); }
                .at-res-opt.is-seg .at-res-tag { color: var(--warning); }

                .at-proximo { padding: 1rem; border-radius: var(--radius-md); border: 1px solid rgba(var(--warning-rgb), 0.4); background: rgba(var(--warning-rgb), 0.08); display: flex; flex-direction: column; gap: 0.85rem; }
                .at-proximo-porque { display: flex; gap: 0.5rem; align-items: flex-start; margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5; }
                .at-proximo-porque svg { color: var(--warning); flex-shrink: 0; margin-top: 0.1rem; }
                .at-proximo-porque strong { color: var(--text-primary); }

                .at-consentimiento { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.85rem 1rem; border: 1px solid rgba(var(--accent-rgb), 0.35); border-radius: var(--radius-md); background: rgba(var(--accent-rgb), 0.06); cursor: pointer; }
                .at-consentimiento input { width: 18px; height: 18px; accent-color: var(--accent); margin-top: 0.1rem; flex-shrink: 0; cursor: pointer; }
                .at-consentimiento strong { display: block; font-size: var(--text-base); color: var(--text-primary); }
                .at-consentimiento em { display: block; margin-top: 0.2rem; font-style: normal; font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.45; }

                .at-suave { display: flex; gap: 0.45rem; align-items: flex-start; margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.45; }
                .at-suave svg { color: var(--warning); flex-shrink: 0; margin-top: 0.1rem; }

                .at-cierre-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%; flex-wrap: wrap; }
                .at-bloqueo, .at-listo, .at-bloqueo-suave { display: flex; align-items: flex-start; gap: 0.4rem; margin: 0; font-size: var(--text-sm); font-weight: 700; line-height: 1.4; max-width: 46ch; }
                .at-bloqueo { color: var(--warning); }
                .at-listo { color: var(--success); }
                .at-bloqueo-suave { color: var(--text-muted); font-weight: 400; }
                .at-cierre-btns { display: flex; gap: 0.6rem; flex-shrink: 0; margin-left: auto; }

                @keyframes at-rot { to { transform: rotate(360deg); } }
                @keyframes at-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

                /* ── Responsive: esto se usa parado, muchas veces en tablet ── */
                @media (max-width: 1100px) {
                    .at-cuerpo { grid-template-columns: minmax(0, 1fr); }
                    .at-registro { position: static; }
                }
                @media (max-width: 720px) {
                    .at-hero-cta { width: 100%; }
                    .at-hero-cta .btn { width: 100%; justify-content: center; }
                    .at-panel { padding: 1rem; }
                    .at-unidad-head { flex-direction: column; }
                    .at-unidad-precio { align-items: flex-start; }
                    .at-form-cta { flex-direction: column-reverse; align-items: stretch; }
                    .at-form-cta .btn { width: 100%; justify-content: center; }
                    .at-chip-accion, .at-chip-nivel { flex: 1; justify-content: center; }
                    .at-cierre-footer { flex-direction: column; align-items: stretch; }
                    .at-cierre-btns { margin-left: 0; }
                    .at-cierre-btns .btn { flex: 1; justify-content: center; }
                }
            `}</style>
        </div>
    );
};

export default AtencionPage;
