import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import './listado.css';

export interface ListadoProps {
    /** Título de la página: el mismo nombre que su ítem del menú. */
    titulo: string;
    /** Una frase simple de para qué sirve la página (opcional). */
    subtitulo?: ReactNode;
    /** Ícono decorativo junto al título. */
    icono?: ReactNode;
    /** Acciones secundarias del encabezado (exportar, actualizar…). */
    acciones?: ReactNode;
    /** La acción principal (un solo botón primario). En el teléfono queda arriba y a todo el ancho. */
    accionPrincipal?: ReactNode;
    /** Búsqueda de texto: siempre visible, aunque los filtros estén plegados. */
    busqueda?: ReactNode;
    /** Controles de filtro (selects, fechas…), dentro del panel plegable. */
    filtros?: ReactNode;
    /** Cantidad de filtros distintos del valor por defecto: se muestra en el botón "Filtros". */
    filtrosActivos?: number;
    /** Si se pasa y hay filtros activos, aparece "Limpiar filtros" en la barra. */
    onLimpiarFiltros?: () => void;
    /** Texto corto a la derecha de la barra (p.ej. "24 unidades"). */
    resumen?: ReactNode;
    /**
     * Clave para recordar (en este navegador) si el usuario dejó los filtros
     * abiertos o plegados. Sin clave, arrancan según `filtrosAbiertos`.
     */
    clave?: string;
    /** Estado inicial del panel de filtros cuando no hay preferencia guardada. */
    filtrosAbiertos?: boolean;
    /** Ancla del tour de onboarding para la barra de búsqueda y filtros. */
    tourFiltros?: string;
    /** Pestañas de la página (p.ej. un `.segmented`): van entre el encabezado y la barra de filtros. */
    pestanas?: ReactNode;
    /** La tabla (normalmente un `<ListadoTabla>`), modales, etc. */
    children: ReactNode;
}

const leerPreferencia = (clave: string | undefined): boolean | null => {
    if (!clave) return null;
    try {
        const v = window.localStorage.getItem(`listado:${clave}:filtros`);
        return v === 'abiertos' ? true : v === 'plegados' ? false : null;
    } catch {
        return null;
    }
};

const guardarPreferencia = (clave: string | undefined, abiertos: boolean) => {
    if (!clave) return;
    try {
        window.localStorage.setItem(`listado:${clave}:filtros`, abiertos ? 'abiertos' : 'plegados');
    } catch {
        // Sin almacenamiento (modo privado, bloqueado): la preferencia no se recuerda.
    }
};

/**
 * Esqueleto común de las páginas de listado: encabezado con título y acciones,
 * barra de búsqueda con filtros plegables y el contenido (tabla + paginación).
 * Los estilos viven en `listado.css`; la página no necesita un `<style>` propio.
 */
const Listado = ({
    titulo,
    subtitulo,
    icono,
    acciones,
    accionPrincipal,
    busqueda,
    filtros,
    filtrosActivos = 0,
    onLimpiarFiltros,
    resumen,
    clave,
    filtrosAbiertos = false,
    tourFiltros,
    pestanas,
    children,
}: ListadoProps) => {
    const panelId = useId();
    const [abiertos, setAbiertos] = useState<boolean>(() => leerPreferencia(clave) ?? filtrosAbiertos);
    const hayBarra = !!(busqueda || filtros || resumen);

    const alternar = () => {
        const siguiente = !abiertos;
        setAbiertos(siguiente);
        guardarPreferencia(clave, siguiente);
    };

    return (
        <section className="listado">
            <header className="listado-header">
                <div className="listado-titulo header-title">
                    {icono && <span className="icon-badge accent listado-icono" aria-hidden="true">{icono}</span>}
                    <div className="listado-titulo-texto">
                        <h1>{titulo}</h1>
                        {subtitulo && <p>{subtitulo}</p>}
                    </div>
                </div>
                {(acciones || accionPrincipal) && (
                    <div className="listado-acciones">
                        {acciones}
                        {accionPrincipal && <div className="listado-accion-principal">{accionPrincipal}</div>}
                    </div>
                )}
            </header>

            {pestanas}

            {hayBarra && (
                <div className="listado-filtros" data-tour={tourFiltros}>
                    <div className="listado-filtros-barra">
                        {busqueda && <div className="listado-busqueda">{busqueda}</div>}
                        {filtros && (
                            <button
                                type="button"
                                className={`listado-filtros-toggle ${abiertos ? 'is-abierto' : ''}`}
                                aria-expanded={abiertos}
                                aria-controls={panelId}
                                onClick={alternar}
                            >
                                <SlidersHorizontal size={16} aria-hidden="true" />
                                <span>Filtros</span>
                                {filtrosActivos > 0 && (
                                    <span className="listado-filtros-count" aria-label={`${filtrosActivos} ${filtrosActivos === 1 ? 'activo' : 'activos'}`}>
                                        {filtrosActivos}
                                    </span>
                                )}
                                <ChevronDown size={16} aria-hidden="true" className="listado-filtros-chevron" />
                            </button>
                        )}
                        {filtrosActivos > 0 && onLimpiarFiltros && (
                            <button type="button" className="btn btn-ghost btn-sm listado-limpiar" onClick={onLimpiarFiltros}>
                                Limpiar filtros
                            </button>
                        )}
                        {resumen && <span className="listado-resumen">{resumen}</span>}
                    </div>
                    {filtros && (
                        <div id={panelId} className="listado-filtros-panel" hidden={!abiertos}>
                            {filtros}
                        </div>
                    )}
                </div>
            )}

            {children}
        </section>
    );
};

export default Listado;
