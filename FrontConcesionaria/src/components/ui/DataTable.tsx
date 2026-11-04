import React, { type ReactNode } from 'react';
import { ShoppingBag, AlertTriangle } from 'lucide-react';
import Pagination from './Pagination';
import { getErrorMessage } from '../../utils/getErrorMessage';

export interface Column<T> {
    header: string;
    accessor?: keyof T | ((item: T) => ReactNode);
    className?: string;
    style?: React.CSSProperties;
    align?: 'left' | 'center' | 'right';
    /**
     * Las celdas de DataTable van en UN renglón (densidad: filas de ~52px; si no
     * entra, la tabla scrollea de costado). Para una columna de texto libre
     * (descripción, motivo, observaciones) pasá `wrap: true` y esa columna sí
     * corta en renglones, con un ancho mínimo legible.
     */
    wrap?: boolean;
}

/**
 * Tabla de datos del sistema, con sus tres estados además de los datos:
 *
 * - **Cargando**: `isLoading` muestra filas skeleton.
 * - **Error**: pasale el error de la query y la tabla dice que falló (no "no hay
 *   registros") con un botón "Reintentar":
 *   `<DataTable error={q.error} onRetry={() => q.refetch()} … />`
 *   (`isError` + `errorMessage` siguen andando si preferís controlarlo a mano).
 * - **Vacío**: `emptyMessage` (+ `emptyHint` opcional). Si la lista está vacía
 *   por los filtros, pasá `onClearFilters` y aparece "Limpiar filtros"; si está
 *   vacía de verdad, `emptyAction` muestra el CTA (p.ej. `<Button>Cargar vehículo</Button>`).
 *
 * Filas clicables: con `onRowClick` cada fila entra al orden de tabulación y se
 * abre con Enter o Espacio (además del clic). Los botones de la fila siguen
 * andando con su propio teclado: sólo cuenta la tecla si el foco está en la fila.
 * La fila conserva su rol de fila (pisarlo con role="button" rompería la tabla
 * para el lector de pantalla); `rowLabel` le da un nombre corto si hace falta.
 */
interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    isLoading?: boolean;
    /**
     * El error de la consulta (p.ej. `query.error`). Si viene, la tabla muestra
     * el estado de error con su mensaje. Un error y un conjunto vacío son cosas
     * distintas: sin esto la tabla decía "no hay registros" ante una falla del
     * backend y el usuario leía "no hubo ventas" cuando no se sabe nada.
     */
    error?: unknown;
    /** Forzar el estado de error (si no se pasa, se deduce de `error`). */
    isError?: boolean;
    /** Mensaje del estado de error. Por defecto, el del error o uno genérico. */
    errorMessage?: string;
    /** Si se pasa, el estado de error ofrece "Reintentar". */
    onRetry?: () => void;
    onRowClick?: (item: T) => void;
    /** Nombre accesible de cada fila clicable (p.ej. `v => \`Venta #${v.id}\``). */
    rowLabel?: (item: T) => string;
    /** Título de la tabla para lectores de pantalla (no se ve). */
    caption?: string;
    currentPage?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
    emptyMessage?: string;
    /** Segunda línea del estado vacío (qué hacer). */
    emptyHint?: string;
    emptyIcon?: ReactNode;
    /** Acción del estado vacío cuando no hay nada cargado todavía (CTA). */
    emptyAction?: ReactNode;
    /** Si la lista está vacía por los filtros: muestra "Limpiar filtros". */
    onClearFilters?: () => void;
}

const DataTable = <T extends { id: string | number }>({
    columns,
    data,
    isLoading,
    error,
    isError,
    errorMessage,
    onRetry,
    onRowClick,
    rowLabel,
    caption,
    currentPage,
    totalPages,
    onPageChange,
    emptyMessage = "No se encontraron registros",
    emptyHint,
    emptyIcon = <ShoppingBag size={40} className="dt-empty-icon" />,
    emptyAction,
    onClearFilters
}: DataTableProps<T>) => {
    const hayError = isError ?? (error != null);
    const mensajeError = errorMessage ?? (error != null
        ? getErrorMessage(error, 'No se pudieron cargar los datos')
        : 'No se pudieron cargar los datos');

    return (
        <div>
            <div className="table-container card">
                <table className="data-table dt-compacta">
                    {caption && <caption className="sr-only">{caption}</caption>}
                    <thead>
                        <tr>
                            {columns.map((col, idx) => (
                                <th
                                    key={idx}
                                    scope="col"
                                    className={col.className}
                                    style={{ textAlign: col.align || 'left', ...col.style }}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody aria-busy={isLoading || undefined}>
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={`skeleton-${i}`}>
                                    {columns.map((_, idx) => (
                                        <td key={`skeleton-col-${idx}`} style={{ padding: '1rem' }}>
                                            <div
                                                className="dt-skeleton"
                                                style={{ width: idx === 0 ? '60%' : idx === columns.length - 1 ? '40%' : '100%' }}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : hayError ? (
                            <tr>
                                <td colSpan={columns.length}>
                                    <div className="dt-empty" role="alert">
                                        <div className="dt-empty-badge is-error" aria-hidden="true">
                                            <AlertTriangle size={40} />
                                        </div>
                                        <p className="dt-empty-text">{mensajeError}</p>
                                        <p className="dt-empty-hint">
                                            Falló la consulta al servidor: no quiere decir que no haya datos.
                                        </p>
                                        {onRetry && (
                                            <button
                                                onClick={onRetry}
                                                className="btn btn-secondary btn-sm"
                                                type="button"
                                            >
                                                Reintentar
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length}>
                                    <div className="dt-empty">
                                        <div className="dt-empty-badge" aria-hidden="true">
                                            {emptyIcon}
                                        </div>
                                        <p className="dt-empty-text">{emptyMessage}</p>
                                        {emptyHint && <p className="dt-empty-hint">{emptyHint}</p>}
                                        {(onClearFilters || emptyAction) && (
                                            <div className="flex flex-wrap items-center justify-center gap-3">
                                                {onClearFilters && (
                                                    <button
                                                        onClick={onClearFilters}
                                                        className="btn btn-secondary btn-sm"
                                                        type="button"
                                                    >
                                                        Limpiar filtros
                                                    </button>
                                                )}
                                                {emptyAction}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.map((item) => (
                                <tr
                                    key={item.id}
                                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                                    onKeyDown={onRowClick ? (e) => {
                                        // Sólo si el foco está en la FILA: un Enter sobre un
                                        // botón de la columna de acciones es de ese botón.
                                        if (e.target !== e.currentTarget) return;
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            onRowClick(item);
                                        }
                                    } : undefined}
                                    tabIndex={onRowClick ? 0 : undefined}
                                    aria-label={onRowClick && rowLabel ? rowLabel(item) : undefined}
                                    className={onRowClick ? 'dt-row-clickable' : undefined}
                                >
                                    {columns.map((col, idx) => (
                                        <td
                                            key={idx}
                                            className={[col.className, col.wrap ? 'dt-wrap' : ''].filter(Boolean).join(' ') || undefined}
                                            style={{ textAlign: col.align || 'left', ...col.style }}
                                        >
                                            {typeof col.accessor === 'function'
                                                ? col.accessor(item)
                                                : col.accessor
                                                    ? (item[col.accessor] as ReactNode)
                                                    : null}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {onPageChange && totalPages && totalPages > 1 && (
                <Pagination
                    currentPage={currentPage || 1}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                />
            )}
        </div>
    );
};

export default DataTable;
