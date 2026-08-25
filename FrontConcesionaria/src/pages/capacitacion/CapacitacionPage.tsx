import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Building2,
    Car,
    Check,
    ChevronRight,
    Coins,
    Eye,
    Inbox,
    Info,
    ShieldCheck,
    Target,
    User,
    Wallet,
    Wrench,
    X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Isotipo from '../../components/brand/Isotipo';
import { VENTAJAS, CIRCUITO, ROLES, MODULOS, REPORTES, ESTADO_HONESTO } from './contenido';

/*
 * Página pública /capacitacion — sin login y sin el shell de la app.
 *
 * Es a la vez presentación de venta y manual por rol: se manda por WhatsApp a un
 * dueño que todavía no es cliente, así que se abre primero en un celular.
 *
 * Doctrina heredada de /login (LoginPage.tsx, AuthShell.tsx): escenario navy fijo
 * que NO sigue el tema claro/oscuro de la app. El visitante nuevo no tiene nada en
 * localStorage y cae en dark por default, pero un cliente ya logueado con tema
 * claro podría abrir el link: con un solo escenario fijo hay un solo diseño y un
 * solo QA. Por eso todo texto y toda superficie se declaran acá, sin depender de
 * --bg-* ni --text-*, que sí cambian con el tema. Los acentos sí salen de tokens
 * (--accent*, --neon-gradient) porque sus dos variantes leen bien sobre navy.
 *
 * Todo el contenido viene de ./contenido.ts. Esta página no afirma nada por su
 * cuenta: sin métricas de resultado, sin testimonios, sin precios.
 */

// ── Tipos derivados del contenido ────────────────────────────────────────────
// Se derivan con `typeof X[number]` en vez de importar las interfaces: así el
// componente no se rompe si el archivo de contenido cambia de forma de exportar.
type ModuloItem = (typeof MODULOS)[number];
type RolItem = (typeof ROLES)[number];

/*
 * Color de CATEGORÍA (no de acción). Emerald sigue siendo el único que "actúa".
 *
 * El cuarto tono NO puede ser 'warning': el ámbar (--warning-rgb / --cap-warning)
 * es el color con el que la sección 06 pinta lo que todavía no está terminado, y
 * en esta página aparece nada más que ahí. Si además pintara una de las cuatro
 * ventajas, el mismo color significaría "argumento" y "carencia" en la misma
 * lectura, y encima sobre el bloque positivo de la tarjeta. El cuarto ángulo va
 * en grafito claro: sigue distinguiéndose de los otros tres y no roba señal.
 */
type Tono = 'emerald' | 'cyan' | 'violet' | 'grafito';
const TONOS: Tono[] = ['emerald', 'cyan', 'violet', 'grafito'];

const ICONOS_VENTAJA: LucideIcon[] = [Coins, Inbox, Target, ShieldCheck];

/**
 * Id de rol → nombre corto para los chips. Los datos guardan ids ('super_admin',
 * 'lectura') y el chip los pintaba crudos y en mayúsculas: SUPER_ADMIN con guión
 * bajo en una página que se le manda a un dueño de concesionaria. Los `nombre` de
 * ROLES son frases largas ("Administrador (el dueño o el gerente)") que no entran
 * en una píldora, así que hace falta esta tercera forma, corta.
 */
const NOMBRE_CORTO_ROL: Record<string, string> = {
    admin: 'Administrador',
    vendedor: 'Vendedor',
    cobrador: 'Cobrador',
    postventa: 'Postventa',
    lectura: 'Consulta',
    super_admin: 'Plataforma',
};

const nombreCortoRol = (id: string) => NOMBRE_CORTO_ROL[id] ?? id;

/** Ícono por rol. Con fallback: si mañana aparece un rol nuevo, no rompe nada. */
const ICONOS_ROL: Record<string, LucideIcon> = {
    vendedor: Car,
    cobrador: Wallet,
    admin: Building2,
    postventa: Wrench,
    lectura: Eye,
    super_admin: ShieldCheck,
};

// ── Navegación interna ───────────────────────────────────────────────────────
const SECCIONES = [
    { id: 'por-que', etiqueta: 'Por qué' },
    { id: 'circuito', etiqueta: 'El circuito' },
    { id: 'roles', etiqueta: 'Por rol' },
    { id: 'modulos', etiqueta: 'Módulos' },
    { id: 'reportes', etiqueta: 'Reportes' },
    { id: 'estado', etiqueta: 'Estado' },
] as const;

/*
 * Canal de contacto. Queda en null a propósito: no se inventan teléfonos ni
 * mails. Mientras esté en null el cierre muestra la instrucción de responder el
 * mismo WhatsApp por el que llegó el link (que es cierto). Cuando el dueño defina
 * un canal público, se completa acá y aparece el botón — es el único lugar a tocar.
 */
const CONTACTO = null as { href: string; etiqueta: string } | null;

/*
 * Los módulos vienen planos con su `seccion`; acá se agrupan una sola vez, a nivel
 * de módulo (no hace falta useMemo: MODULOS es una constante importada). El Map
 * conserva el orden de aparición, que es el orden del menú real del sistema.
 */
const MODULOS_POR_SECCION: { seccion: string; items: ModuloItem[] }[] = (() => {
    const mapa = new Map<string, ModuloItem[]>();
    for (const modulo of MODULOS) {
        const acumulado = mapa.get(modulo.seccion);
        if (acumulado) acumulado.push(modulo);
        else mapa.set(modulo.seccion, [modulo]);
    }
    return Array.from(mapa, ([seccion, items]) => ({ seccion, items }));
})();

const CapacitacionPage = () => {
    // Arranca vacío a propósito: al abrir la página se está mirando la portada,
    // que no es ninguna de las secciones. Marcar "Por qué" desde el vamos sería
    // mentirle a la barra. La primera sección se resalta recién al llegar a ella.
    const [seccionActiva, setSeccionActiva] = useState<string>('');
    const [rolActivo, setRolActivo] = useState<string>(ROLES[0]?.id ?? '');
    const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
    /*
     * El observer sólo informa las secciones que CAMBIARON de estado, no todas.
     * Guardar el conjunto visible en un ref permite elegir siempre la primera en
     * orden de documento, que es la que la barra debe marcar.
     */
    const visibles = useRef<Set<string>>(new Set());

    useEffect(() => {
        const nodos = SECCIONES
            .map((s) => document.getElementById(s.id))
            .filter((n): n is HTMLElement => n !== null);
        if (nodos.length === 0) return;

        // rootMargin recorta la ventana a una franja bajo la barra pegajosa: así la
        // sección activa es la que se está leyendo, no la que apenas asoma abajo.
        const observer = new IntersectionObserver(
            (entradas) => {
                for (const entrada of entradas) {
                    if (entrada.isIntersecting) visibles.current.add(entrada.target.id);
                    else visibles.current.delete(entrada.target.id);
                }
                const primera = SECCIONES.find((s) => visibles.current.has(s.id));
                if (primera) setSeccionActiva(primera.id);
            },
            { rootMargin: '-140px 0px -55% 0px', threshold: 0 },
        );

        nodos.forEach((n) => observer.observe(n));
        return () => observer.disconnect();
    }, []);

    const rolSeleccionado: RolItem | undefined = ROLES.find((r) => r.id === rolActivo);

    /** Tablist accesible: flechas mueven el foco y la selección, Home/End a los extremos. */
    const manejarTeclaTab = (evento: KeyboardEvent<HTMLButtonElement>, indice: number) => {
        const ultimo = ROLES.length - 1;
        let destino = -1;
        if (evento.key === 'ArrowRight' || evento.key === 'ArrowDown') destino = indice === ultimo ? 0 : indice + 1;
        else if (evento.key === 'ArrowLeft' || evento.key === 'ArrowUp') destino = indice === 0 ? ultimo : indice - 1;
        else if (evento.key === 'Home') destino = 0;
        else if (evento.key === 'End') destino = ultimo;
        if (destino === -1) return;

        evento.preventDefault();
        const rol = ROLES[destino];
        if (!rol) return;
        setRolActivo(rol.id);
        tabsRef.current[destino]?.focus();
    };

    const IconoRolActivo = rolSeleccionado ? (ICONOS_ROL[rolSeleccionado.id] ?? User) : User;

    return (
        <div className="cap-page">
            {/*
             * Metadatos SIN react-helmet-async. Se verificó en el navegador que bajo
             * React 19 la librería no inyecta absolutamente nada en el <head> (cero
             * tags): quedaba un título mudo. React 19 iza <title> y <meta> por sí
             * solo desde cualquier punto del árbol, así que se declaran acá derecho.
             *
             * Tampoco se repite <html lang> ni <meta name="theme-color">: index.html
             * ya trae los dos, y como React agrega al final del <head>, un segundo
             * theme-color perdería contra el primero. Antes que dejar un tag inerte,
             * no se pone.
             */}
            <title>AUTENZA — Presentación y capacitación por rol</title>
            <meta
                name="description"
                content="Qué hace AUTENZA, el sistema de gestión para concesionarias: rentabilidad real por unidad, consultas asignadas con seguimiento, objetivos por vendedor y todo el circuito en un solo lugar. Incluye la capacitación de los seis roles."
            />
            {/*
              * Los og:* NO van acá. Este link se manda por WhatsApp y el crawler de
              * Meta no ejecuta JavaScript: lee el HTML que sirve nginx, que es el
              * index.html del build (la app es un SPA de un solo entry, con fallback
              * a ese archivo para toda ruta). Cualquier tag que inyecte React llega
              * después de que el crawler ya armó la tarjeta. Por eso los metadatos
              * de previsualización viven estáticos en index.html; acá queda sólo lo
              * que sí sirve en el navegador: el título de la pestaña y la
              * descripción específica de esta página para los buscadores que sí
              * corren JS.
              */}

            <a href="#contenido" className="skip-link">Ir al contenido</a>

            {/* ── Barra pegajosa: marca + anclas + contacto ─────────────────── */}
            <header className="cap-topbar">
                <div className="cap-shell cap-topbar-inner">
                    <a className="cap-topbar-brand" href="#inicio" aria-label="AUTENZA — volver al inicio de la página">
                        <span className="cap-mark cap-mark--sm" aria-hidden="true">
                            <Isotipo size={18} color="#ffffff" />
                        </span>
                        <span className="cap-word cap-word--sm">AUTENZA</span>
                    </a>

                    <nav className="cap-nav" aria-label="Secciones de esta página">
                        <ul className="cap-nav-list">
                            {SECCIONES.map((seccion) => (
                                <li key={seccion.id}>
                                    <a
                                        href={'#' + seccion.id}
                                        className={'cap-nav-link' + (seccionActiva === seccion.id ? ' is-active' : '')}
                                        aria-current={seccionActiva === seccion.id ? 'location' : undefined}
                                    >
                                        {seccion.etiqueta}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <a className="cap-btn-outline cap-topbar-cta" href="#contacto">Contacto</a>
                </div>
            </header>

            {/* tabIndex -1: <main> no es enfocable por sí solo, y sin esto el skip
                link mueve el scroll pero no el foco (misma convención que el
                <main> de AppLayout). */}
            <main id="contenido" tabIndex={-1}>
                {/* ── Portada ──────────────────────────────────────────────── */}
                <section className="cap-hero" id="inicio">
                    <div className="cap-hero-grid" aria-hidden="true" />
                    <div className="cap-hero-orb cap-hero-orb--violet" aria-hidden="true" />
                    <div className="cap-hero-orb cap-hero-orb--cyan" aria-hidden="true" />
                    <div className="cap-hero-orb cap-hero-orb--emerald" aria-hidden="true" />

                    <div className="cap-shell cap-hero-inner animate-fade-in">
                        <span className="cap-mark" aria-hidden="true">
                            <Isotipo size={30} color="#ffffff" />
                        </span>
                        <p className="cap-word">AUTENZA</p>
                        <p className="cap-tag">Dealer Operating System</p>

                        <h1 className="cap-hero-title">
                            Todo lo que pasa en tu concesionaria,<br />
                            <span className="cap-hero-title-accent">en un solo lugar</span>
                        </h1>

                        <p className="cap-hero-lead">
                            Stock, consultas, reservas, ventas, cobranzas, postventa y documentación, con un
                            reporte que te dice cuánto ganaste de verdad en cada auto. Esta página es dos cosas:
                            la presentación del sistema y el manual de uso de cada rol.
                        </p>

                        <div className="cap-hero-actions">
                            <a className="cap-btn-outline cap-btn-outline--lg" href="#por-que">
                                Ver qué resuelve
                                <ArrowRight size={16} aria-hidden="true" />
                            </a>
                            <a className="cap-link-plano" href="#roles">O saltar directo a la capacitación por rol</a>
                        </div>

                        {/* Cifras contadas del propio contenido: nunca pueden quedar desactualizadas. */}
                        <ul className="cap-hero-stats" aria-label="Alcance del sistema">
                            <li className="cap-stat">
                                <span className="cap-stat-num tabular-nums">{ROLES.length}</span>
                                <span className="cap-stat-label">roles</span>
                            </li>
                            <li className="cap-stat">
                                <span className="cap-stat-num tabular-nums">{MODULOS.length}</span>
                                <span className="cap-stat-label">módulos</span>
                            </li>
                            <li className="cap-stat">
                                <span className="cap-stat-num tabular-nums">{REPORTES.length}</span>
                                <span className="cap-stat-label">reportes</span>
                            </li>
                            <li className="cap-stat">
                                <span className="cap-stat-num tabular-nums">{CIRCUITO.length}</span>
                                <span className="cap-stat-label">pasos del circuito</span>
                            </li>
                        </ul>

                        <p className="cap-hero-nota">
                            <Info size={15} aria-hidden="true" />
                            <span>
                                Cada cosa que dice esta página se puede señalar en una pantalla del sistema.
                                No hay promesas de resultado: hay funciones que se muestran en vivo.
                            </span>
                        </p>
                    </div>
                </section>

                {/* ── 1. Por qué AUTENZA ───────────────────────────────────── */}
                <section className="cap-section" id="por-que" aria-labelledby="cap-h-porque">
                    <div className="cap-shell">
                        <div className="cap-section-head">
                            <span className="cap-eyebrow">01 · Por qué AUTENZA</span>
                            <h2 className="cap-section-title" id="cap-h-porque">
                                Cuatro cosas que hoy te cuestan plata
                            </h2>
                            <p className="cap-section-lead">
                                De cada una vas a ver tres cosas: el problema tal como pasa hoy,
                                qué hace el sistema, y en qué pantalla lo comprobás.
                            </p>
                        </div>

                        <div className="cap-grid cap-grid--2">
                            {VENTAJAS.map((ventaja, indice) => {
                                const Icono = ICONOS_VENTAJA[indice % ICONOS_VENTAJA.length];
                                return (
                                    <article
                                        key={ventaja.titulo}
                                        className="cap-card cap-ventaja"
                                        data-tono={TONOS[indice % TONOS.length]}
                                    >
                                        <div className="cap-ventaja-head">
                                            <span className="cap-ventaja-icon" aria-hidden="true">
                                                <Icono size={20} />
                                            </span>
                                            <span className="cap-ventaja-num tabular-nums" aria-hidden="true">
                                                {String(indice + 1).padStart(2, '0')}
                                            </span>
                                        </div>

                                        <h3 className="cap-card-title">{ventaja.titulo}</h3>

                                        <div className="cap-bloque cap-bloque--hoy">
                                            <span className="cap-bloque-label">
                                                <AlertTriangle size={13} aria-hidden="true" />
                                                Hoy
                                            </span>
                                            <p>{ventaja.problema}</p>
                                        </div>

                                        <div className="cap-bloque cap-bloque--con">
                                            <span className="cap-bloque-label">
                                                <Check size={13} aria-hidden="true" />
                                                Con AUTENZA
                                            </span>
                                            {/* Varios párrafos y no uno solo: ver el comentario de
                                                `solucion` en contenido.ts. En un celular el bloque
                                                único era un muro de veinte líneas. */}
                                            {ventaja.solucion.map((parrafo) => (
                                                <p key={parrafo}>{parrafo}</p>
                                            ))}
                                        </div>

                                        <div className="cap-prueba">
                                            <span className="cap-microlabel">Dónde se comprueba</span>
                                            <ul className="cap-prueba-list">
                                                {ventaja.dondeSeVe.map((lugar) => (
                                                    <li key={lugar}>
                                                        <ChevronRight size={13} aria-hidden="true" />
                                                        <span>{lugar}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* ── 2. El circuito ───────────────────────────────────────── */}
                <section className="cap-section" id="circuito" aria-labelledby="cap-h-circuito">
                    <div className="cap-shell">
                        <div className="cap-section-head">
                            <span className="cap-eyebrow">02 · El circuito</span>
                            <h2 className="cap-section-title" id="cap-h-circuito">
                                Del ingreso del auto a la postventa
                            </h2>
                            <p className="cap-section-lead">
                                El mismo recorrido que ya hace tu concesionaria, pero con cada paso registrado
                                y con un responsable claro.
                            </p>
                        </div>

                        <ol className="cap-flow">
                            {CIRCUITO.map((paso) => (
                                <li className="cap-step" key={paso.orden}>
                                    <span className="cap-step-node tabular-nums" aria-hidden="true">
                                        {String(paso.orden).padStart(2, '0')}
                                    </span>
                                    <div className="cap-step-body">
                                        <h3 className="cap-step-title">{paso.titulo}</h3>
                                        <p className="cap-step-que">{paso.que}</p>
                                        <div className="cap-step-meta">
                                            <ul className="cap-chips" aria-label="Roles que intervienen">
                                                {paso.quien.map((rol) => (
                                                    <li key={rol} className="cap-chip cap-chip--cyan">{nombreCortoRol(rol)}</li>
                                                ))}
                                            </ul>
                                            <p className="cap-pantalla">
                                                <ChevronRight size={13} aria-hidden="true" />
                                                <span>{paso.pantalla}</span>
                                            </p>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                {/* ── 3. Capacitación por rol ──────────────────────────────── */}
                <section className="cap-section" id="roles" aria-labelledby="cap-h-roles">
                    <div className="cap-shell">
                        <div className="cap-section-head">
                            <span className="cap-eyebrow">03 · Capacitación por rol</span>
                            <h2 className="cap-section-title" id="cap-h-roles">
                                Qué ve y qué hace cada uno
                            </h2>
                            <p className="cap-section-lead">
                                Elegí un rol y leé su instructivo: el día típico, los módulos que tiene a mano,
                                las tareas paso a paso y lo que el sistema no le deja hacer.
                            </p>
                        </div>

                        <div
                            className="cap-tablist"
                            role="tablist"
                            aria-label="Roles del sistema"
                        >
                            {ROLES.map((rol, indice) => {
                                const IconoRol = ICONOS_ROL[rol.id] ?? User;
                                const activo = rol.id === rolActivo;
                                return (
                                    <button
                                        key={rol.id}
                                        type="button"
                                        role="tab"
                                        id={'cap-tab-' + rol.id}
                                        aria-selected={activo}
                                        aria-controls={'cap-panel-' + rol.id}
                                        // Roving tabindex: sólo la pestaña activa entra en el orden de tabulación;
                                        // dentro del grupo se navega con las flechas.
                                        tabIndex={activo ? 0 : -1}
                                        ref={(nodo) => { tabsRef.current[indice] = nodo; }}
                                        className={'cap-tab' + (activo ? ' is-active' : '')}
                                        onClick={() => setRolActivo(rol.id)}
                                        onKeyDown={(evento) => manejarTeclaTab(evento, indice)}
                                    >
                                        <IconoRol size={16} aria-hidden="true" />
                                        <span>{rol.nombre}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {rolSeleccionado && (
                            <div
                                className="cap-card cap-panel"
                                role="tabpanel"
                                id={'cap-panel-' + rolSeleccionado.id}
                                aria-labelledby={'cap-tab-' + rolSeleccionado.id}
                                // tabIndex 0: el panel tiene contenido largo y debe poder recibir foco
                                // para que el teclado pueda desplazarlo tras elegir la pestaña.
                                tabIndex={0}
                            >
                                <div className="cap-panel-head">
                                    <span className="cap-panel-icon" aria-hidden="true">
                                        <IconoRolActivo size={22} />
                                    </span>
                                    <div>
                                        <h3 className="cap-panel-title">{rolSeleccionado.nombre}</h3>
                                        <p className="cap-panel-resumen">{rolSeleccionado.resumen}</p>
                                    </div>
                                </div>

                                <div className="cap-dia">
                                    <span className="cap-microlabel">Un día típico</span>
                                    <p>{rolSeleccionado.diaTipico}</p>
                                </div>

                                <div className="cap-panel-grid">
                                    <div className="cap-panel-col">
                                        <h4 className="cap-panel-sub">Tareas, paso a paso</h4>
                                        <ol className="cap-tareas">
                                            {rolSeleccionado.tareas.map((tarea, indiceTarea) => (
                                                <li className="cap-tarea" key={tarea.titulo}>
                                                    <div className="cap-tarea-head">
                                                        <span className="cap-tarea-num tabular-nums" aria-hidden="true">
                                                            {indiceTarea + 1}
                                                        </span>
                                                        <h5 className="cap-tarea-title">{tarea.titulo}</h5>
                                                    </div>
                                                    <ol className="cap-pasos">
                                                        {tarea.pasos.map((paso) => (
                                                            <li key={paso}>{paso}</li>
                                                        ))}
                                                    </ol>
                                                    <p className="cap-pantalla">
                                                        <ChevronRight size={13} aria-hidden="true" />
                                                        <span>{tarea.pantalla}</span>
                                                    </p>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>

                                    <div className="cap-panel-col">
                                        {/* "Los módulos donde trabaja" y no "los que tiene a mano":
                                            el menú real no está recortado a esta lista para todos
                                            los roles. Donde la diferencia es grande, el rol la
                                            aclara con `notaMenu` acá abajo. */}
                                        <h4 className="cap-panel-sub">Los módulos donde trabaja</h4>
                                        <ul className="cap-chips cap-chips--bloque">
                                            {rolSeleccionado.modulos.map((modulo) => (
                                                <li key={modulo} className="cap-chip cap-chip--violet">{modulo}</li>
                                            ))}
                                        </ul>
                                        {rolSeleccionado.notaMenu && (
                                            <p className="cap-nota-menu">
                                                <Info size={13} aria-hidden="true" />
                                                <span>{rolSeleccionado.notaMenu}</span>
                                            </p>
                                        )}

                                        <h4 className="cap-panel-sub">Lo que no puede hacer</h4>
                                        <ul className="cap-nopuede">
                                            {rolSeleccionado.noPuede.map((limite) => (
                                                <li key={limite}>
                                                    <X size={13} aria-hidden="true" />
                                                    <span>{limite}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        {/*
                                          * Decía "No es una recomendación: el sistema lo bloquea",
                                          * y salía igual bajo los seis roles. Era falso como
                                          * garantía general: las pantallas de operación (ventas,
                                          * reservas, financiaciones, ingresos, movimientos) no
                                          * tienen candado por rol, y la propia página lo admite dos
                                          * secciones después. Ahora nombra las familias de límite
                                          * que el servidor sí aplica y manda a leer el resto.
                                          *
                                          * El super_admin lleva su propia nota: lo suyo no es un
                                          * candado sino dónde arranca su sesión (un redirect del
                                          * navegador; el authorize del servidor lo deja pasar a
                                          * propósito, porque es la cuenta que mantiene el sistema).
                                          */}
                                        {rolSeleccionado.id === 'super_admin' ? (
                                            <p className="cap-nopuede-nota">
                                                Ojo con el matiz: eso es dónde arranca su sesión, no un candado.
                                                Es la cuenta que da de alta y mantiene las concesionarias, así que
                                                por diseño puede entrar a cualquiera — y preferimos decirlo.
                                            </p>
                                        ) : (
                                            <p className="cap-nopuede-nota">
                                                Los límites de plata, las bandejas de atención, las bajas y la
                                                administración los aplica el servidor, no sólo la pantalla. En las
                                                pantallas de operación del día a día el límite todavía lo pone el
                                                menú: está dicho en{' '}
                                                <a className="cap-link-plano" href="#estado">En qué estado está</a>.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* ── 4. Los módulos ───────────────────────────────────────── */}
                <section className="cap-section" id="modulos" aria-labelledby="cap-h-modulos">
                    <div className="cap-shell">
                        <div className="cap-section-head">
                            <span className="cap-eyebrow">04 · Los módulos</span>
                            <h2 className="cap-section-title" id="cap-h-modulos">
                                El menú, tal como se ve adentro
                            </h2>
                            <p className="cap-section-lead">
                                Agrupados igual que en el sistema, con quién entra a cada uno.
                            </p>
                        </div>

                        <div className="cap-modulos">
                            {MODULOS_POR_SECCION.map((grupo) => (
                                // Sin className: la separación entre grupos la da el gap de
                                // .cap-modulos y el espaciado interno lo ponen el título y la
                                // lista. Una clase acá no tendría ninguna regla — inerte.
                                <section key={grupo.seccion} aria-label={grupo.seccion}>
                                    <h3 className="cap-modgroup-title">
                                        <span className="cap-modgroup-dot" aria-hidden="true" />
                                        {grupo.seccion}
                                        <span className="cap-modgroup-count tabular-nums" aria-hidden="true">
                                            {grupo.items.length}
                                        </span>
                                    </h3>
                                    <ul className="cap-modlist">
                                        {grupo.items.map((modulo) => (
                                            <li className="cap-mod" key={grupo.seccion + '-' + modulo.nombre}>
                                                <h4 className="cap-mod-nombre">{modulo.nombre}</h4>
                                                <p className="cap-mod-que">{modulo.qué}</p>
                                                <ul className="cap-chips">
                                                    {modulo.roles.map((rol) => (
                                                        <li key={rol} className="cap-chip cap-chip--neutro">{nombreCortoRol(rol)}</li>
                                                    ))}
                                                </ul>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── 5. Reportes ──────────────────────────────────────────── */}
                <section className="cap-section" id="reportes" aria-labelledby="cap-h-reportes">
                    <div className="cap-shell">
                        <div className="cap-section-head">
                            <span className="cap-eyebrow">05 · Reportes</span>
                            <h2 className="cap-section-title" id="cap-h-reportes">
                                Lo que vas a poder responder
                            </h2>
                            <p className="cap-section-lead">
                                <BarChart3 size={15} aria-hidden="true" />
                                <span>
                                    Cada reporte contesta una pregunta concreta. Estas son las preguntas,
                                    dichas como se dicen en el salón.
                                </span>
                            </p>
                        </div>

                        <ul className="cap-reportes">
                            {REPORTES.map((reporte) => (
                                <li className="cap-reporte" key={reporte.nombre}>
                                    <p className="cap-reporte-responde">{reporte.responde}</p>
                                    <p className="cap-reporte-nombre">
                                        <ChevronRight size={13} aria-hidden="true" />
                                        <span>{reporte.nombre}</span>
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* ── 6. Estado honesto ────────────────────────────────────── */}
                <section className="cap-section" id="estado" aria-labelledby="cap-h-estado">
                    <div className="cap-shell">
                        <div className="cap-section-head">
                            <span className="cap-eyebrow">06 · En qué estado está</span>
                            <h2 className="cap-section-title" id="cap-h-estado">
                                Lo que todavía no está terminado
                            </h2>
                            <p className="cap-section-lead">
                                Va acá, en el medio de la presentación y no en letra chica al final.
                                Preferimos que lo sepas antes de contratar y no después.
                            </p>
                        </div>

                        <div className="cap-estado">
                            {ESTADO_HONESTO.map((item) => (
                                <article className="cap-estado-item" key={item.titulo}>
                                    <span className="cap-estado-icon" aria-hidden="true">
                                        <AlertTriangle size={16} />
                                    </span>
                                    <div>
                                        <h3 className="cap-estado-title">{item.titulo}</h3>
                                        <p className="cap-estado-detalle">{item.detalle}</p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── 7. Cierre ────────────────────────────────────────────── */}
                <section className="cap-section cap-section--cierre" id="contacto" aria-labelledby="cap-h-contacto">
                    <div className="cap-shell">
                        <div className="cap-cierre">
                            <span className="cap-mark" aria-hidden="true">
                                <Isotipo size={26} color="#ffffff" />
                            </span>
                            <h2 className="cap-cierre-title" id="cap-h-contacto">
                                La mejor forma de evaluarlo es verlo con tus autos
                            </h2>
                            <p className="cap-cierre-text">
                                Una demo en vivo: cargamos una unidad tuya con su precio de compra y sus gastos,
                                y mirás el margen real en pantalla. Ahí decidís.
                            </p>

                            {CONTACTO ? (
                                // Único .btn-primary de toda la página: emerald es el color de acción
                                // y no se reparte en varios botones (regla Emerald-Acts).
                                <a className="btn btn-primary btn-lg cap-cta" href={CONTACTO.href}>
                                    {CONTACTO.etiqueta}
                                </a>
                            ) : (
                                <p className="cap-cierre-nota">
                                    <ArrowRight size={16} aria-hidden="true" />
                                    <span>Respondé el mismo mensaje por el que te llegó este link y coordinamos.</span>
                                </p>
                            )}

                            <p className="cap-cierre-fine">
                                Sin planes ni precios publicados en esta página: se conversan.
                            </p>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="cap-footer">
                <div className="cap-shell cap-footer-inner">
                    <span className="cap-word cap-word--sm">AUTENZA</span>
                    <span>&copy; {new Date().getFullYear()} AUTENZA · Sistema de gestión para concesionarias</span>
                </div>
            </footer>

            <style>{`
        /* ═══════════════════════════════════════════════════════════════════
         * Escenario y paleta local
         * Todo con prefijo .cap- : las utilidades de index.css pierden contra
         * cualquier selector descendiente, y varias asumen fondo claro.
         * ═══════════════════════════════════════════════════════════════ */
        .cap-page {
          /* Escala de tinta sobre navy. Es la misma doctrina del login (§ opacidades
             escalonadas), pero el piso se sube a 0.5: por debajo, un micro-label de
             11px no llega a 4.5:1 de contraste y esta página se lee en un celular. */
          --cap-ink: #f5f7fb;            /* impeccable-disable-line design-system-color: texto sobre navy fijo, no sigue el tema */
          --cap-ink-2: rgba(255,255,255,0.74); /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
          --cap-ink-3: rgba(255,255,255,0.58); /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
          --cap-ink-4: rgba(255,255,255,0.50); /* impeccable-disable-line design-system-color: texto sobre navy fijo, relativo al contexto */
          --cap-line: rgba(255,255,255,0.09);  /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
          --cap-line-2: rgba(255,255,255,0.16);/* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
          --cap-surface: rgba(255,255,255,0.035); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
          --cap-glass: rgba(13,18,33,0.72);   /* impeccable-disable-line design-system-color: vidrio navy sobre escenario fijo, relativo al contexto */

          /* Tintes de acento legibles sobre navy: --accent/--accent-2/--accent-3 plenos
             no alcanzan contraste en texto chico (misma razón que #a7f3d0 en AuthShell). */
          --cap-emerald: #a7f3d0;  /* impeccable-disable-line design-system-color: tinte emerald legible sobre navy; --accent pleno no contrasta */
          --cap-cyan: #a5f3fc;     /* impeccable-disable-line design-system-color: tinte cyan legible sobre navy; --accent-3 pleno no contrasta */
          --cap-violet: #ddd6fe;   /* impeccable-disable-line design-system-color: tinte violet legible sobre navy; --accent-2 pleno no contrasta */
          --cap-warning: #fde68a;  /* impeccable-disable-line design-system-color: tinte warning legible sobre navy; --warning pleno no contrasta */

          /* Anillo de foco propio. NO se usa --ring: es un token de superficie del
             tema, calibrado contra --bg-primary y no contra este navy fijo. Sobre
             la barra y la tarjeta de vidrio daba 2.87:1 y 2.91:1 en oscuro (el
             mínimo no textual de WCAG es 3:1), y con el tema claro caía a 1.84:1 —
             el escenario justamente por el que esta página declara sus propias
             tintas. Este emerald claro pasa 3:1 sobre las dos superficies. */
          --cap-ring: rgba(167,243,208,0.62); /* impeccable-disable-line design-system-color: anillo de foco sobre navy fijo, no sigue el tema */

          /* Alto real de la barra pegajosa, que es el scroll-margin-top de cada
             sección. Tiene tres valores porque la barra cambia de forma: abajo de
             ~500px las seis anclas no entran en una fila y envuelven en dos (152),
             de ahí hasta 900 van en una fila propia debajo de la marca (118), y de
             900 para arriba la barra es una sola línea (76). Si este número se
             queda corto, el salto por ancla deja el eyebrow tapado. */
          --cap-topbar-h: 152px;

          position: relative;
          min-height: 100vh;
          background: #04060d; /* impeccable-disable-line design-system-color: escenario navy fijo, no cambia con el tema */
          color: var(--cap-ink-2);
          font-family: var(--font-sans);
          font-size: var(--text-base);
          line-height: 1.6;
          /* clip y no hidden: 'hidden' convertiría a .cap-page en contenedor de scroll
             y rompería el position:sticky de la barra superior. */
          overflow-x: clip;
          isolation: isolate;
        }

        /* Los headings globales heredan var(--text-primary): en tema claro eso es
           tinta oscura y sería invisible sobre el navy. Se fija acá. */
        /* Estos tres son RESETS, no diseño: sólo tienen que ganarle a los globales
           de index.css y perder contra cualquier clase .cap-* de esta página.
           Van envueltos en :where() porque .cap-page a pesa (0,1,1) y le ganaba a
           .cap-nav-link, .cap-btn-outline, .cap-link-plano, .cap-panel-sub y
           .cap-modgroup-title, que pesan (0,1,0): las cinco declaraban color y
           quedaban inertes (el subrayado de .cap-link-plano directamente no salía).
           :where() vale 0, así que el reset queda en (0,0,1): le gana al selector
           de elemento pelado de index.css por orden —este bloque va después— y
           pierde contra toda clase, que es exactamente lo que se busca.
           OJO: nada de backticks en estos comentarios, que cierran el template. */
        :where(.cap-page) h1,
        :where(.cap-page) h2,
        :where(.cap-page) h3,
        :where(.cap-page) h4,
        :where(.cap-page) h5 { color: var(--cap-ink); }

        :where(.cap-page) a { color: inherit; text-decoration: none; }
        :where(.cap-page) ul, :where(.cap-page) ol { list-style: none; }

        .cap-shell {
          width: 100%;
          max-width: 1080px;
          margin: 0 auto;
          padding-left: 1.25rem;
          padding-right: 1.25rem;
        }

        /* ── Barra pegajosa ──────────────────────────────────────────────── */
        .cap-topbar {
          position: sticky;
          top: 0;
          z-index: 30;
          background: rgba(4,6,13,0.86); /* impeccable-disable-line design-system-color: velo del escenario navy fijo, relativo al contexto */
          backdrop-filter: blur(18px) saturate(150%);
          -webkit-backdrop-filter: blur(18px) saturate(150%);
          border-bottom: 1px solid var(--cap-line);
        }

        .cap-topbar-inner {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          flex-wrap: wrap;
          padding-top: var(--space-3);
          padding-bottom: var(--space-3);
        }

        .cap-topbar-brand { display: inline-flex; align-items: center; gap: var(--space-2); }
        .cap-topbar-cta { margin-left: auto; }

        /* Móvil: marca y contacto en la primera línea, anclas abajo a lo ancho. */
        .cap-nav { order: 1; flex: 1 0 100%; min-width: 0; }
        /* flex-wrap y no scroll horizontal, por la misma razón que .cap-tablist:
           las seis anclas miden ~465px y en 375px entran 335, así que "Reportes" y
           "Estado" quedaban fuera de cuadro. Y no había cómo enterarse: sin barra
           (scrollbar-width:none), sin degradé de corte y sin flecha. Envueltas en
           dos filas se ven las seis, y el .is-active nunca queda escondido. */
        .cap-nav-list {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-1);
        }

        .cap-nav-link {
          display: inline-block;
          padding: 0.4rem 0.7rem;
          border-radius: var(--radius-pill);
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--cap-ink-4);
          white-space: nowrap;
          transition: color var(--duration-base) var(--easing-soft),
                      background var(--duration-base) var(--easing-soft);
        }
        .cap-nav-link:hover { color: var(--cap-ink); background: var(--cap-surface); }
        .cap-nav-link.is-active {
          color: var(--cap-emerald);
          background: rgba(var(--accent-rgb), 0.12);
        }

        /* :focus-visible global está anulado en index.css; cada interactivo nuevo
           tiene que declarar su propio anillo o queda sin foco visible. */
        .cap-nav-link:focus-visible,
        .cap-topbar-brand:focus-visible,
        .cap-btn-outline:focus-visible,
        .cap-link-plano:focus-visible,
        .cap-tab:focus-visible,
        .cap-panel:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px var(--cap-ring);
          border-radius: var(--radius-pill);
        }
        .cap-panel:focus-visible { border-radius: var(--radius-lg); }

        /* ── Marca ───────────────────────────────────────────────────────── */
        .cap-mark {
          width: 58px;
          height: 58px;
          border-radius: var(--radius-lg);
          background: var(--neon-gradient);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.15) inset, /* impeccable-disable-line design-system-color: brillo sobre el gradiente neón, relativo al contexto */
                      0 12px 32px -6px rgba(var(--accent-2-rgb), 0.5);
        }
        .cap-mark::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), transparent 60%); /* impeccable-disable-line design-system-color: brillo sobre el gradiente neón, relativo al contexto */
          mix-blend-mode: overlay;
        }
        .cap-mark--sm { width: 34px; height: 34px; border-radius: var(--radius-md); }

        .cap-word {
          font-family: var(--font-display);
          font-size: var(--text-xl);
          font-weight: 700;
          letter-spacing: 0.18em;
          background: var(--neon-gradient);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }
        .cap-word--sm { font-size: var(--text-base); letter-spacing: 0.16em; }

        .cap-tag {
          font-size: var(--text-2xs);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: var(--cap-ink-4);
        }

        /* ── Botones propios (emerald queda reservado al único CTA) ───────── */
        .cap-btn-outline {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: 0.5rem 1.1rem;
          border-radius: var(--radius-pill);
          border: 1px solid var(--cap-line-2);
          background: var(--cap-surface);
          color: var(--cap-ink);
          font-size: var(--text-sm);
          font-weight: 600;
          white-space: nowrap;
          transition: border-color var(--duration-base) var(--easing-soft),
                      background var(--duration-base) var(--easing-soft),
                      transform var(--duration-fast) var(--easing-soft);
        }
        .cap-btn-outline:hover {
          border-color: rgba(var(--accent-rgb), 0.55);
          background: rgba(var(--accent-rgb), 0.10);
          transform: translateY(-1px);
        }
        .cap-btn-outline--lg { padding: 0.8rem 1.5rem; font-size: var(--text-md); }

        .cap-link-plano {
          font-size: var(--text-sm);
          color: var(--cap-ink-3);
          text-decoration: underline;
          text-underline-offset: 3px;
          text-decoration-color: var(--cap-line-2);
        }
        .cap-link-plano:hover { color: var(--cap-ink); }

        /* ── Portada ─────────────────────────────────────────────────────── */
        .cap-hero {
          position: relative;
          /* El escenario decorativo (retícula + orbes) vive SOLO acá: sobre el resto
             de la página el neón sería papel tapiz, no señal. */
          overflow: hidden;
          padding-top: 3.5rem;
          padding-bottom: 3.5rem;
          scroll-margin-top: var(--cap-topbar-h);
        }
        .cap-hero-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse at 50% 20%, black 20%, transparent 72%);
          -webkit-mask-image: radial-gradient(ellipse at 50% 20%, black 20%, transparent 72%);
          z-index: 0;
        }
        .cap-hero-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          z-index: 0;
          animation: cap-orb-drift 16s ease-in-out infinite;
          pointer-events: none;
        }
        .cap-hero-orb--violet {
          width: 420px; height: 420px;
          background: rgba(var(--accent-2-rgb), 0.34);
          top: -160px; left: -100px;
        }
        .cap-hero-orb--cyan {
          width: 380px; height: 380px;
          background: rgba(var(--accent-3-rgb), 0.26);
          bottom: -180px; right: -110px;
          animation-delay: -5s;
        }
        .cap-hero-orb--emerald {
          width: 300px; height: 300px;
          background: rgba(var(--accent-rgb), 0.20);
          top: 20%; right: 22%;
          animation-delay: -9s;
        }
        @keyframes cap-orb-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(36px,-26px) scale(1.06); }
          66% { transform: translate(-22px,32px) scale(0.95); }
        }

        .cap-hero-inner { position: relative; z-index: 1; }
        .cap-hero-inner > .cap-word { margin-top: var(--space-4); }
        .cap-hero-inner > .cap-tag { margin-top: var(--space-1); }

        .cap-hero-title {
          margin-top: var(--space-6);
          font-size: var(--text-2xl);
          line-height: 1.08;
          letter-spacing: -0.03em;
          max-width: 20ch;
        }
        .cap-hero-title-accent {
          background: var(--neon-gradient);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }

        .cap-hero-lead {
          margin-top: var(--space-5);
          max-width: 62ch;
          font-size: var(--text-md);
          color: var(--cap-ink-2);
        }

        .cap-hero-actions {
          margin-top: var(--space-8);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-4);
        }

        .cap-hero-stats {
          margin-top: var(--space-10);
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-3);
          max-width: 620px;
        }
        .cap-stat {
          padding: var(--space-4);
          border-radius: var(--radius-md);
          border: 1px solid var(--cap-line);
          background: var(--cap-surface);
        }
        .cap-stat-num {
          display: block;
          font-family: var(--font-display);
          font-size: var(--text-2xl);
          font-weight: 700;
          line-height: 1;
          color: var(--cap-ink);
        }
        .cap-stat-label {
          display: block;
          margin-top: var(--space-1);
          font-size: var(--text-2xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--cap-ink-4);
        }

        .cap-hero-nota {
          margin-top: var(--space-8);
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          max-width: 62ch;
          padding: var(--space-4);
          border-radius: var(--radius-md);
          border: 1px solid rgba(var(--accent-3-rgb), 0.22);
          background: rgba(var(--accent-3-rgb), 0.07);
          color: var(--cap-ink-2);
          font-size: var(--text-sm);
        }
        .cap-hero-nota svg { flex: none; margin-top: 2px; color: var(--cap-cyan); }

        /* ── Secciones ───────────────────────────────────────────────────── */
        .cap-section {
          padding-top: 3.25rem;
          padding-bottom: 3.25rem;
          /* Compensa la barra pegajosa al saltar por ancla. */
          scroll-margin-top: var(--cap-topbar-h);
          border-top: 1px solid var(--cap-line);
        }

        .cap-section-head { margin-bottom: var(--space-8); }
        .cap-eyebrow {
          display: inline-block;
          font-size: var(--text-2xs);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--cap-ink-4);
        }
        .cap-section-title {
          margin-top: var(--space-2);
          font-size: var(--text-2xl);
          line-height: 1.12;
          letter-spacing: -0.025em;
          max-width: 22ch;
        }
        .cap-section-lead {
          margin-top: var(--space-3);
          max-width: 68ch;
          color: var(--cap-ink-3);
          display: flex;
          align-items: flex-start;
          gap: var(--space-2);
        }
        .cap-section-lead svg { flex: none; margin-top: 4px; color: var(--cap-cyan); }

        .cap-microlabel {
          display: block;
          font-size: var(--text-2xs);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--cap-ink-4);
        }

        /* ── Tarjeta de vidrio (no se usa .card: depende de --bg-card) ────── */
        .cap-card {
          border-radius: var(--radius-lg);
          border: 1px solid var(--cap-line);
          background: var(--cap-glass);
          padding: var(--space-6);
        }

        .cap-card-title {
          font-size: var(--text-lg);
          letter-spacing: -0.02em;
          margin-bottom: var(--space-4);
        }

        .cap-grid { display: grid; gap: var(--space-4); grid-template-columns: minmax(0, 1fr); }

        /* ── Ventajas ────────────────────────────────────────────────────── */
        /* El tono es color de CATEGORÍA: distingue los cuatro ángulos y nunca
           pinta un botón. Se declara una vez y todo lo demás lee var(--tono-*). */
        .cap-ventaja[data-tono="emerald"] { --tono-rgb: var(--accent-rgb);   --tono-ink: var(--cap-emerald); }
        .cap-ventaja[data-tono="cyan"]    { --tono-rgb: var(--accent-3-rgb); --tono-ink: var(--cap-cyan); }
        .cap-ventaja[data-tono="violet"]  { --tono-rgb: var(--accent-2-rgb); --tono-ink: var(--cap-violet); }
        /* El cuarto no usa --warning-rgb: ese ámbar es el código de "todavía no
           está terminado" de la sección 06 y en toda la página aparece nada más
           que ahí. Grafito claro: distingue la cuarta categoría sin robarle el
           significado al ámbar. */
        .cap-ventaja[data-tono="grafito"] { --tono-rgb: 226,232,240;         --tono-ink: var(--cap-ink); } /* impeccable-disable-line design-system-color: tinte neutro sobre navy fijo, relativo al contexto */

        .cap-ventaja { display: flex; flex-direction: column; }
        .cap-ventaja-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-4);
        }
        .cap-ventaja-icon {
          width: 42px; height: 42px;
          border-radius: var(--radius-md);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(var(--tono-rgb), 0.12);
          border: 1px solid rgba(var(--tono-rgb), 0.28);
          color: var(--tono-ink);
        }
        .cap-ventaja-num {
          font-family: var(--font-display);
          font-size: var(--text-2xl);
          font-weight: 700;
          line-height: 1;
          color: rgba(255,255,255,0.10); /* impeccable-disable-line design-system-color: numeral de marca de agua sobre navy fijo, relativo al contexto */
        }

        .cap-bloque { padding-left: var(--space-4); border-left: 2px solid var(--cap-line-2); margin-bottom: var(--space-4); }
        .cap-bloque p { font-size: var(--text-sm); color: var(--cap-ink-2); }
        .cap-bloque-label {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          margin-bottom: var(--space-1);
          font-size: var(--text-2xs);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .cap-bloque--hoy .cap-bloque-label { color: var(--cap-ink-4); }
        .cap-bloque--hoy p { color: var(--cap-ink-3); }
        .cap-bloque--con { border-left-color: rgba(var(--tono-rgb), 0.5); }
        .cap-bloque--con .cap-bloque-label { color: var(--tono-ink); }

        .cap-prueba {
          margin-top: auto;
          padding-top: var(--space-4);
          border-top: 1px solid var(--cap-line);
        }
        .cap-prueba-list { margin-top: var(--space-2); display: flex; flex-direction: column; gap: 0.3rem; }
        .cap-prueba-list li {
          display: flex;
          align-items: flex-start;
          gap: 0.35rem;
          font-size: var(--text-sm);
          color: var(--cap-ink-2);
        }
        .cap-prueba-list svg { flex: none; margin-top: 4px; color: var(--tono-ink); }

        /* ── Circuito ────────────────────────────────────────────────────── */
        .cap-flow { position: relative; display: flex; flex-direction: column; gap: var(--space-5); }
        .cap-step { position: relative; display: flex; gap: var(--space-4); }
        /* Riel: se dibuja desde cada paso hacia el siguiente y se corta en el último. */
        .cap-step::before {
          content: '';
          position: absolute;
          left: 21px;
          top: 44px;
          bottom: calc(var(--space-5) * -1);
          width: 2px;
          background: linear-gradient(180deg, rgba(var(--accent-3-rgb), 0.35), rgba(var(--accent-2-rgb), 0.10));
        }
        .cap-step:last-child::before { display: none; }

        .cap-step-node {
          flex: none;
          width: 44px; height: 44px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-display);
          font-size: var(--text-sm);
          font-weight: 700;
          color: var(--cap-cyan);
          background: rgba(var(--accent-3-rgb), 0.10);
          border: 1px solid rgba(var(--accent-3-rgb), 0.30);
        }
        .cap-step-body {
          flex: 1 1 auto;
          min-width: 0;
          padding-bottom: var(--space-2);
        }
        .cap-step-title { font-size: var(--text-lg); letter-spacing: -0.02em; }
        .cap-step-que { margin-top: var(--space-1); max-width: 68ch; color: var(--cap-ink-2); font-size: var(--text-sm); }
        .cap-step-meta {
          margin-top: var(--space-3);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-2) var(--space-4);
        }

        /* ── Chips ───────────────────────────────────────────────────────── */
        /* No se reutiliza .badge: badge-navy pinta con --bg-secondary y sobre navy
           quedaría una píldora gris clara con texto oscuro. */
        .cap-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
        .cap-chips--bloque { margin-top: var(--space-2); margin-bottom: var(--space-6); }
        .cap-chip {
          display: inline-flex;
          align-items: center;
          padding: 0.2rem 0.6rem;
          border-radius: var(--radius-pill);
          font-size: var(--text-2xs);
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          border: 1px solid var(--cap-line-2);
          background: var(--cap-surface);
          color: var(--cap-ink-3);
          /* Sin white-space:nowrap y con min-width:0. Con nowrap, el min-content de
             un chip es el string entero y flex-wrap no puede achicarlo: los chips
             largos de "Los módulos donde trabaja" se salían de la tarjeta y, como
             .cap-page tiene overflow-x:clip, el texto sobrante desaparecía sin
             elipsis ni scroll. Envolviendo en dos líneas se lee todo. */
          min-width: 0;
        }
        .cap-chip--cyan   { color: var(--cap-cyan);   background: rgba(var(--accent-3-rgb), 0.10); border-color: rgba(var(--accent-3-rgb), 0.26); }
        .cap-chip--violet { color: var(--cap-violet); background: rgba(var(--accent-2-rgb), 0.10); border-color: rgba(var(--accent-2-rgb), 0.26); }
        .cap-chip--neutro { color: var(--cap-ink-3); }

        .cap-pantalla {
          display: inline-flex;
          /* flex-start y no center: varios nombres de pantalla ocupan dos líneas en
             un celular angosto, y centrado el ícono quedaba flotando en el medio. */
          align-items: flex-start;
          gap: 0.3rem;
          font-family: var(--font-mono);
          font-size: var(--text-2xs);
          line-height: 1.45;
          color: var(--cap-ink-4);
        }
        .cap-pantalla svg { flex: none; margin-top: 2px; color: rgba(var(--accent-rgb), 0.8); }

        /* ── Selector de roles ───────────────────────────────────────────── */
        /* flex-wrap y no scroll horizontal: con seis roles en 375px un carrusel
           esconde pestañas; envueltas se ven todas de una. */
        .cap-tablist {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          margin-bottom: var(--space-6);
        }
        .cap-tab {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: 0.55rem 1rem;
          border-radius: var(--radius-pill);
          border: 1px solid var(--cap-line-2);
          background: var(--cap-surface);
          color: var(--cap-ink-3);
          font-family: var(--font-sans);
          font-size: var(--text-sm);
          font-weight: 700;
          transition: color var(--duration-base) var(--easing-soft),
                      border-color var(--duration-base) var(--easing-soft),
                      background var(--duration-base) var(--easing-soft);
        }
        .cap-tab:hover:not(.is-active) { color: var(--cap-ink); border-color: rgba(255,255,255,0.28); } /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
        .cap-tab.is-active {
          /* Estado de selección = emerald, igual que .segmented-btn.is-active del
             sistema, y con el mismo gradiente de marca. Lo único que cambia es la
             tinta: blanco puro sobre emerald→cyan da 1.85:1, y a 13px/700 el piso
             de AA es 4.5:1. Con el navy del escenario encima del gradiente el
             contraste sube a ~10:1 sin tocar el gradiente, que es marca. Esta
             página se lee al sol en un celular y ya declaró ese piso arriba. */
          background: var(--accent-gradient);
          border-color: transparent;
          color: #04060d; /* impeccable-disable-line design-system-color: tinta oscura sobre el gradiente emerald→cyan para llegar a 4.5:1 */
          box-shadow: 0 6px 20px -8px rgba(var(--accent-rgb), 0.6);
        }
        /* El anillo de foco tiene que ir DESPUÉS de .cap-tab.is-active: las dos
           reglas pesan (0,2,0) y la de arriba, más abajo en la hoja, le pisaba el
           box-shadow al :focus-visible. El tablist usa roving tabindex, así que la
           pestaña que recibe el foco es SIEMPRE la activa: sin esto, el único
           control interactivo de la sección no tenía indicador de foco. */
        .cap-tab.is-active:focus-visible {
          box-shadow: 0 0 0 3px var(--cap-ring), 0 6px 20px -8px rgba(var(--accent-rgb), 0.6);
        }

        .cap-panel-head {
          display: flex;
          align-items: flex-start;
          gap: var(--space-4);
          padding-bottom: var(--space-5);
          border-bottom: 1px solid var(--cap-line);
        }
        .cap-panel-icon {
          flex: none;
          width: 48px; height: 48px;
          border-radius: var(--radius-md);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(var(--accent-rgb), 0.12);
          border: 1px solid rgba(var(--accent-rgb), 0.26);
          color: var(--cap-emerald);
        }
        .cap-panel-title { font-size: var(--text-xl); letter-spacing: -0.02em; }
        .cap-panel-resumen { margin-top: var(--space-1); max-width: 68ch; color: var(--cap-ink-2); font-size: var(--text-sm); }

        .cap-dia {
          margin-top: var(--space-5);
          padding: var(--space-4);
          border-radius: var(--radius-md);
          border: 1px solid rgba(var(--accent-rgb), 0.22);
          background: rgba(var(--accent-rgb), 0.07);
        }
        .cap-dia .cap-microlabel { color: var(--cap-emerald); }
        .cap-dia p { margin-top: var(--space-1); color: var(--cap-ink-2); font-size: var(--text-sm); }

        .cap-panel-grid {
          margin-top: var(--space-6);
          display: grid;
          gap: var(--space-8);
          grid-template-columns: minmax(0, 1fr);
        }
        .cap-panel-col { min-width: 0; }
        .cap-panel-sub {
          font-size: var(--text-2xs);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--cap-ink-4);
          font-family: var(--font-sans);
        }

        .cap-tareas { margin-top: var(--space-3); display: flex; flex-direction: column; gap: var(--space-3); }
        .cap-tarea {
          padding: var(--space-4);
          border-radius: var(--radius-md);
          border: 1px solid var(--cap-line);
          background: var(--cap-surface);
        }
        .cap-tarea-head { display: flex; align-items: center; gap: var(--space-2); }
        .cap-tarea-num {
          flex: none;
          width: 24px; height: 24px;
          border-radius: var(--radius-pill);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-display);
          font-size: var(--text-2xs);
          font-weight: 700;
          color: var(--cap-emerald);
          background: rgba(var(--accent-rgb), 0.14);
        }
        .cap-tarea-title { font-size: var(--text-base); letter-spacing: -0.01em; }

        .cap-pasos { counter-reset: cap-paso; margin-top: var(--space-3); display: flex; flex-direction: column; gap: 0.4rem; }
        .cap-pasos li {
          counter-increment: cap-paso;
          position: relative;
          padding-left: 1.8rem;
          font-size: var(--text-sm);
          color: var(--cap-ink-2);
        }
        .cap-pasos li::before {
          content: counter(cap-paso);
          position: absolute;
          left: 0;
          top: 0.15rem;
          width: 1.25rem; height: 1.25rem;
          border-radius: var(--radius-pill);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--text-3xs);
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          color: var(--cap-ink-3);
          background: rgba(255,255,255,0.07); /* impeccable-disable-line design-system-color: capa sobre navy fijo, relativa al contexto */
        }
        .cap-tarea .cap-pantalla { margin-top: var(--space-3); }

        /* Aclaración de qué le aparece en el menú además de los módulos de arriba.
           Va pegada a los chips (que traen margin-bottom propio) y en cyan, el tono
           de "dato", para que no se lea como advertencia: no lo es. */
        .cap-nota-menu {
          margin-top: calc(var(--space-6) * -1 + var(--space-1));
          margin-bottom: var(--space-6);
          display: flex;
          align-items: flex-start;
          gap: 0.4rem;
          font-size: var(--text-2xs);
          line-height: 1.55;
          color: var(--cap-ink-3);
        }
        .cap-nota-menu svg { flex: none; margin-top: 3px; color: var(--cap-cyan); }

        .cap-nopuede { margin-top: var(--space-3); display: flex; flex-direction: column; gap: 0.4rem; }
        .cap-nopuede li {
          display: flex;
          align-items: flex-start;
          gap: 0.4rem;
          font-size: var(--text-sm);
          color: var(--cap-ink-2);
        }
        .cap-nopuede svg { flex: none; margin-top: 4px; color: rgba(var(--danger-rgb), 0.9); }
        .cap-nopuede-nota { margin-top: var(--space-3); font-size: var(--text-2xs); line-height: 1.55; color: var(--cap-ink-4); }
        /* El link al estado honesto va dentro de la nota: hereda el cuerpo chico en
           vez del --text-sm de .cap-link-plano, que lo haría más grande que el
           párrafo que lo contiene. */
        .cap-nopuede-nota .cap-link-plano { font-size: inherit; color: var(--cap-ink-3); }

        /* ── Módulos ─────────────────────────────────────────────────────── */
        .cap-modulos { display: flex; flex-direction: column; gap: var(--space-8); }
        .cap-modgroup-title {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-family: var(--font-sans);
          font-size: var(--text-2xs);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--cap-ink-3);
          padding-bottom: var(--space-3);
          border-bottom: 1px solid var(--cap-line);
        }
        .cap-modgroup-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--neon-gradient);
        }
        .cap-modgroup-count {
          margin-left: auto;
          font-family: var(--font-mono);
          color: var(--cap-ink-4);
        }
        .cap-modlist {
          margin-top: var(--space-4);
          display: grid;
          gap: var(--space-3);
          grid-template-columns: minmax(0, 1fr);
        }
        .cap-mod {
          padding: var(--space-4);
          border-radius: var(--radius-md);
          border: 1px solid var(--cap-line);
          background: var(--cap-surface);
          transition: border-color var(--duration-base) var(--easing-soft);
        }
        .cap-mod:hover { border-color: var(--cap-line-2); }
        .cap-mod-nombre { font-size: var(--text-base); letter-spacing: -0.01em; }
        .cap-mod-que { margin: var(--space-1) 0 var(--space-3); font-size: var(--text-sm); color: var(--cap-ink-3); }

        /* ── Reportes ────────────────────────────────────────────────────── */
        .cap-reportes { display: grid; gap: var(--space-3); grid-template-columns: minmax(0, 1fr); }
        .cap-reporte {
          padding: var(--space-4);
          border-radius: var(--radius-md);
          border: 1px solid var(--cap-line);
          background: var(--cap-surface);
          transition: border-color var(--duration-base) var(--easing-soft),
                      background var(--duration-base) var(--easing-soft);
        }
        .cap-reporte:hover { border-color: rgba(var(--accent-3-rgb), 0.35); background: rgba(var(--accent-3-rgb), 0.06); }
        .cap-reporte-responde {
          font-family: var(--font-display);
          font-size: var(--text-md);
          font-weight: 500;
          line-height: 1.35;
          letter-spacing: -0.01em;
          color: var(--cap-ink);
        }
        .cap-reporte-nombre {
          margin-top: var(--space-3);
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: var(--text-2xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--cap-cyan);
        }
        .cap-reporte-nombre svg { flex: none; }

        /* ── Estado honesto ──────────────────────────────────────────────── */
        .cap-estado { display: grid; gap: var(--space-3); grid-template-columns: minmax(0, 1fr); }
        .cap-estado-item {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-5);
          border-radius: var(--radius-md);
          border: 1px solid rgba(var(--warning-rgb), 0.24);
          background: rgba(var(--warning-rgb), 0.06);
        }
        .cap-estado-icon { flex: none; color: var(--cap-warning); margin-top: 2px; }
        .cap-estado-title { font-size: var(--text-base); letter-spacing: -0.01em; }
        .cap-estado-detalle { margin-top: var(--space-1); font-size: var(--text-sm); color: var(--cap-ink-2); }

        /* ── Cierre ──────────────────────────────────────────────────────── */
        /* Doble clase a propósito: .cap-section--cierre sola empata en peso con
           .cap-section, y el .cap-section de la media query de 768px va después en
           la hoja, así que en escritorio le ganaba por orden y este padding no
           existía. Con (0,2,0) gana en todos los anchos. */
        .cap-section.cap-section--cierre { padding-bottom: 4.5rem; }
        .cap-cierre {
          position: relative;
          text-align: center;
          padding: var(--space-10) var(--space-6);
          border-radius: var(--radius-xl);
          background: var(--cap-glass);
          border: 1px solid var(--cap-line);
          /* Sin overflow:hidden — el ::before del borde de gradiente se dibuja en
             inset:-1px y un clip lo comería justo en el anillo que aporta. */
        }
        /* Borde de gradiente por máscara — mismo recurso que .login-card. */
        .cap-cierre::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg,
              rgba(var(--accent-2-rgb), 0.55) 0%,
              rgba(var(--accent-rgb), 0.0) 45%,
              rgba(var(--accent-3-rgb), 0.55) 100%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); /* impeccable-disable-line design-system-color: canal de máscara, no es un color de UI */
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        .cap-cierre-title {
          margin-top: var(--space-5);
          font-size: var(--text-xl);
          letter-spacing: -0.025em;
          max-width: 24ch;
          margin-left: auto;
          margin-right: auto;
        }
        .cap-cierre-text {
          margin: var(--space-3) auto 0;
          max-width: 56ch;
          color: var(--cap-ink-2);
        }
        .cap-cta { margin-top: var(--space-6); }
        .cap-cierre-nota {
          margin: var(--space-6) auto 0;
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          text-align: left;
          padding: var(--space-4) var(--space-5);
          border-radius: var(--radius-md);
          border: 1px solid rgba(var(--accent-rgb), 0.28);
          background: rgba(var(--accent-rgb), 0.09);
          color: var(--cap-ink);
          font-weight: 600;
        }
        .cap-cierre-nota svg { flex: none; color: var(--cap-emerald); }
        .cap-cierre-fine { margin-top: var(--space-4); font-size: var(--text-2xs); color: var(--cap-ink-4); }

        /* ── Pie ─────────────────────────────────────────────────────────── */
        .cap-footer { border-top: 1px solid var(--cap-line); padding-top: var(--space-6); padding-bottom: var(--space-6); }
        .cap-footer-inner {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          font-size: var(--text-2xs);
          color: var(--cap-ink-4);
        }

        /* ═══ Responsive ═══════════════════════════════════════════════════ */
        @media (min-width: 480px) {
          .cap-hero-title { font-size: var(--text-3xl); }
          .cap-hero-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }

        /* Las seis anclas necesitan ~460px de fila; con el padding del shell eso
           son 500px de viewport. Desde acá dejan de envolver y la barra baja una
           fila de alto. Breakpoint propio y no 480: a 480 todavía envuelven. */
        @media (min-width: 520px) {
          .cap-page { --cap-topbar-h: 118px; }
        }

        @media (min-width: 768px) {
          .cap-shell { padding-left: 2rem; padding-right: 2rem; }
          .cap-hero { padding-top: 5rem; padding-bottom: 5rem; }
          .cap-section { padding-top: 5rem; padding-bottom: 5rem; }
          .cap-hero-title { font-size: var(--text-4xl); }
          .cap-section-title { font-size: var(--text-3xl); }
          .cap-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-5); }
          .cap-modlist { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .cap-reportes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .cap-estado { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .cap-cierre { padding: 3.5rem var(--space-10); }
          .cap-cierre-title { font-size: var(--text-2xl); }
        }

        @media (min-width: 900px) {
          .cap-page { --cap-topbar-h: 76px; }
          /* La barra vuelve a una sola línea: marca · anclas · contacto. */
          .cap-nav { order: 0; flex: 0 1 auto; }
          .cap-panel-grid { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: var(--space-10); }
          .cap-panel { padding: var(--space-8); }
        }

        @media (min-width: 1024px) {
          .cap-reportes { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .cap-modlist { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }

        /* El bloque global de reduced-motion ya anula las animaciones; acá se
           frenan además los orbes, que si no quedan quietos pero desplazados. */
        @media (prefers-reduced-motion: reduce) {
          .cap-hero-orb { animation: none; }
        }
      `}</style>
        </div>
    );
};

export default CapacitacionPage;
