import { type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import Pagination from '../ui/Pagination';
import EstadoListado from './EstadoListado';
import './listado.css';

/**
 * Cómo se ve una columna cuando la tabla pasa a tarjetas (pantallas angostas):
 * - `titulo`: encabeza la tarjeta, ancho completo y sin rótulo (p.ej. la unidad).
 * - `detalle` (por defecto): renglón "Rótulo · valor".
 * - `acciones`: pie de la tarjeta, alineado a la derecha y sin rótulo.
 * - `oculta`: no se muestra en la tarjeta (dato secundario que no entra).
 */
export type ColumnaEnTarjeta = 'titulo' | 'detalle' | 'acciones' | 'oculta';

export interface ColumnaListado<T> {
    /** Identificador estable de la columna (key de React). */
    clave: string;
    /** Encabezado. También es el rótulo del dato en la vista de tarjeta. */
    titulo: string;
    celda: (item: T) => ReactNode;
    alinear?: 'left' | 'center' | 'right';
    /** Ancho CSS de la columna (p.ej. '1%' para que se ajuste a su contenido). */
    ancho?: string;
    /**
     * La columna toma el espacio que sobra y, si falta, se angosta cortando su
     * texto con "…" (usar `.listado-principal`/`.listado-secundario` adentro).
     * Así la tabla no genera scroll horizontal y la columna de acciones queda
     * siempre a la vista. Ideal para el nombre de la entidad.
     */
    flexible?: boolean;
    tarjeta?: ColumnaEnTarjeta;
}

export interface EstadoVacioListado {
    /** "Todavía no hay unidades cargadas". */
    titulo: string;
    descripcion?: ReactNode;
    /** Acción para empezar (p.ej. el botón "Nuevo vehículo"). */
    accion?: ReactNode;
    icono?: ReactNode;
}

export interface ListadoTablaProps<T> {
    columnas: ColumnaListado<T>[];
    filas: T[];
    /** Clave de cada fila. Por defecto `item.id`. */
    getId?: (item: T) => string | number;
    cargando?: boolean;
    /**
     * Si la consulta falló. Un error no es un "no hay registros": se muestra
     * distinto y ofrece reintentar.
     */
    error?: boolean;
    mensajeError?: string;
    onReintentar?: () => void;
    /** Estado vacío cuando todavía no hay nada cargado (sin filtros). */
    vacio: EstadoVacioListado;
    /**
     * Hay filtros o búsqueda aplicados. Con lista vacía cambia el mensaje a
     * "ningún resultado con estos filtros" y ofrece limpiarlos.
     */
    hayFiltros?: boolean;
    onLimpiarFiltros?: () => void;
    /** Hace la fila navegable (clic, Enter o Espacio con el foco en la fila). */
    onFilaClick?: (item: T) => void;
    /** Nombre accesible de la fila navegable ("Abrir Toyota Corolla AB123CD"). */
    etiquetaFila?: (item: T) => string;
    /** Cantidad de filas fantasma mientras carga. */
    filasCargando?: number;
    /** Rótulo accesible de la tabla. */
    etiqueta?: string;
    pagina?: number;
    totalPaginas?: number;
    onPaginaChange?: (pagina: number) => void;
}

// Un clic sobre un control propio de la fila (botón, link, select) no abre la
// fila: así las páginas no tienen que acordarse de cortar la propagación.
const SELECTOR_INTERACTIVO = 'button, a, input, select, textarea, label, [data-no-row-click]';

const esDesdeControl = (e: MouseEvent | KeyboardEvent): boolean => {
    const target = e.target as HTMLElement | null;
    if (!target || target === e.currentTarget) return false;
    const control = target.closest(SELECTOR_INTERACTIVO);
    return !!control && (e.currentTarget as HTMLElement).contains(control);
};

const defaultGetId = (item: unknown): string | number => (item as { id: string | number }).id;

/**
 * Tabla de listado con sus estados (cargando, error, vacío, sin resultados)
 * y paginación. En pantallas angostas cada fila se ve como una tarjeta; los
 * estilos viven en `listado.css`.
 */
function ListadoTabla<T>({
    columnas,
    filas,
    getId = defaultGetId,
    cargando = false,
    error = false,
    mensajeError = 'No se pudieron cargar los datos',
    onReintentar,
    vacio,
    hayFiltros = false,
    onLimpiarFiltros,
    onFilaClick,
    etiquetaFila,
    filasCargando = 8,
    etiqueta,
    pagina = 1,
    totalPaginas = 1,
    onPaginaChange,
}: ListadoTablaProps<T>) {
    const alinear = (c: ColumnaListado<T>) =>
        [c.alinear ? `is-${c.alinear}` : '', c.flexible ? 'is-flexible' : ''].filter(Boolean).join(' ');
    const claseTarjeta = (c: ColumnaListado<T>) => `en-tarjeta-${c.tarjeta ?? 'detalle'}`;

    if (error && !cargando) {
        return (
            <div className="listado-tabla-card">
                <EstadoListado tipo="error" mensaje={mensajeError} onReintentar={onReintentar} />
            </div>
        );
    }

    if (!cargando && filas.length === 0) {
        return (
            <div className="listado-tabla-card">
                {hayFiltros
                    ? <EstadoListado tipo="sin-resultados" onLimpiarFiltros={onLimpiarFiltros} />
                    : <EstadoListado tipo="vacio" {...vacio} />}
            </div>
        );
    }

    const abrir = (item: T) => onFilaClick?.(item);

    return (
        <div className="listado-tabla-wrap">
            <div className="listado-tabla-card">
                <table className="listado-tabla" aria-label={etiqueta} aria-busy={cargando || undefined}>
                    <thead>
                        <tr>
                            {columnas.map((c) => (
                                <th
                                    key={c.clave}
                                    scope="col"
                                    className={alinear(c)}
                                    style={c.ancho ? { width: c.ancho } : undefined}
                                >
                                    {c.titulo}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {cargando
                            ? Array.from({ length: filasCargando }).map((_, i) => (
                                <tr key={`cargando-${i}`} className="is-cargando" aria-hidden="true">
                                    {columnas.map((c, idx) => (
                                        <td key={c.clave} className={`${alinear(c)} ${claseTarjeta(c)}`}>
                                            <span
                                                className="skeleton skeleton-text"
                                                style={{ width: idx === 0 ? '70%' : '55%' }}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))
                            : filas.map((item) => (
                                <tr
                                    key={getId(item)}
                                    className={onFilaClick ? 'is-navegable' : undefined}
                                    tabIndex={onFilaClick ? 0 : undefined}
                                    aria-label={onFilaClick && etiquetaFila ? etiquetaFila(item) : undefined}
                                    onClick={onFilaClick ? (e) => { if (!esDesdeControl(e)) abrir(item); } : undefined}
                                    onKeyDown={onFilaClick ? (e) => {
                                        if (e.key !== 'Enter' && e.key !== ' ') return;
                                        if (esDesdeControl(e)) return;
                                        e.preventDefault();
                                        abrir(item);
                                    } : undefined}
                                >
                                    {columnas.map((c) => (
                                        <td
                                            key={c.clave}
                                            className={`${alinear(c)} ${claseTarjeta(c)}`}
                                            data-label={c.titulo}
                                        >
                                            <div className="listado-celda">{c.celda(item)}</div>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            {onPaginaChange && totalPaginas > 1 && (
                <Pagination currentPage={pagina} totalPages={totalPaginas} onPageChange={onPaginaChange} />
            )}
        </div>
    );
}

export default ListadoTabla;
