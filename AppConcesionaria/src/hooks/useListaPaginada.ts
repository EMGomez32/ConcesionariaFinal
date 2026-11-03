import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Paginado, siguientePagina, totalDe } from '../lib/paginacion';

/** El valor, pero recién cuando dejó de cambiar `ms` milisegundos (búsquedas). */
export function useDebounced<T>(valor: T, ms = 350): T {
    const [v, setV] = useState(valor);
    useEffect(() => {
        const t = setTimeout(() => setV(valor), ms);
        return () => clearTimeout(t);
    }, [valor, ms]);
    return v;
}

/**
 * Lista paginada del backend con scroll infinito (`onEndReached`) en lugar de
 * cortar en 50 sin avisar. Mientras se tipea una búsqueda, la lista anterior
 * queda en pantalla (`placeholderData`) en vez de cambiarse por un spinner.
 */
export function useListaPaginada<T>(
    queryKey: readonly unknown[],
    fetchPage: (page: number, limit: number) => Promise<Paginado<T>>,
    {
        limit = 20, enabled = true, mantenerAnterior = true,
    }: {
        limit?: number;
        enabled?: boolean;
        /** Mostrar la lista anterior mientras llega la nueva (búsquedas). No sirve al cambiar de pestaña. */
        mantenerAnterior?: boolean;
    } = {},
) {
    const q = useInfiniteQuery({
        queryKey: [...queryKey, { limit }],
        queryFn: ({ pageParam }) => fetchPage(pageParam, limit),
        initialPageParam: 1,
        getNextPageParam: (ultima, _todas, pedida) => siguientePagina(ultima, pedida, limit),
        placeholderData: mantenerAnterior ? keepPreviousData : undefined,
        enabled,
    });

    const items = useMemo(() => q.data?.pages.flatMap((p) => p.results) ?? [], [q.data]);
    const total = totalDe(q.data?.pages[0]);

    const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, refetch } = q;
    const cargarMas = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) fetchNextPage();
    }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

    // "Tirar para actualizar": el spinner del RefreshControl sólo por el gesto,
    // no por cada búsqueda en segundo plano.
    const [refrescando, setRefrescando] = useState(false);
    const refrescar = useCallback(async () => {
        setRefrescando(true);
        try { await refetch(); } finally { setRefrescando(false); }
    }, [refetch]);

    return {
        q,
        items,
        total,
        cargarMas,
        refrescando,
        refrescar,
        /** Hay una búsqueda nueva en curso y se ve todavía el resultado anterior. */
        buscando: q.isFetching && q.isPlaceholderData,
    };
}
