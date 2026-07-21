import React, { type ReactNode } from 'react';
import { ShoppingBag, AlertTriangle } from 'lucide-react';
import Pagination from './Pagination';

export interface Column<T> {
    header: string;
    accessor?: keyof T | ((item: T) => ReactNode);
    className?: string;
    style?: React.CSSProperties;
    align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    isLoading?: boolean;
    /**
     * Si la consulta falló. Sin esto la tabla caía en el estado vacío y decía
     * "no hay registros" ante un error del backend: el usuario leía "no hubo
     * ventas" cuando en realidad no se sabe nada. Un error y un conjunto vacío
     * son cosas distintas y se muestran distinto.
     */
    isError?: boolean;
    errorMessage?: string;
    /** Si se pasa, el estado de error ofrece un botón de reintento. */
    onRetry?: () => void;
    onRowClick?: (item: T) => void;
    currentPage?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
    emptyMessage?: string;
    emptyIcon?: ReactNode;
    onClearFilters?: () => void;
}

const DataTable = <T extends { id: string | number }>({
    columns,
    data,
    isLoading,
    isError,
    errorMessage = "No se pudieron cargar los datos",
    onRetry,
    onRowClick,
    currentPage,
    totalPages,
    onPageChange,
    emptyMessage = "No se encontraron registros",
    emptyIcon = <ShoppingBag size={40} className="dt-empty-icon" />,
    onClearFilters
}: DataTableProps<T>) => {
    return (
        <div className="space-y-4">
            <div className="table-container card overflow-hidden">
                <table className="data-table">
                    <thead>
                        <tr>
                            {columns.map((col, idx) => (
                                <th
                                    key={idx}
                                    className={col.className}
                                    style={{ textAlign: col.align || 'left', ...col.style }}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={`skeleton-${i}`}>
                                    {columns.map((_, idx) => (
                                        <td key={`skeleton-col-${idx}`} style={{ padding: '1.25rem 1rem' }}>
                                            <div
                                                className="dt-skeleton"
                                                style={{ width: idx === 0 ? '60%' : idx === columns.length - 1 ? '40%' : '100%' }}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : isError ? (
                            <tr>
                                <td colSpan={columns.length}>
                                    <div className="dt-empty">
                                        <div className="dt-empty-badge is-error">
                                            <AlertTriangle size={40} />
                                        </div>
                                        <p className="dt-empty-text">{errorMessage}</p>
                                        <p className="dt-empty-hint">
                                            Es un problema al consultar el servidor, no un período sin movimientos.
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
                                        <div className="dt-empty-badge">
                                            {emptyIcon}
                                        </div>
                                        <p className="dt-empty-text">{emptyMessage}</p>
                                        {onClearFilters && (
                                            <button
                                                onClick={onClearFilters}
                                                className="btn btn-secondary btn-sm"
                                                type="button"
                                            >
                                                Limpiar Filtros
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.map((item) => (
                                <tr
                                    key={item.id}
                                    onClick={() => onRowClick?.(item)}
                                    className={onRowClick ? 'cursor-pointer group' : ''}
                                >
                                    {columns.map((col, idx) => (
                                        <td
                                            key={idx}
                                            className={col.className}
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
