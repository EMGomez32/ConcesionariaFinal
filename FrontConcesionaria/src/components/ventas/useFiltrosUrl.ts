import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '../../hooks/useDebounce';

/**
 * Filtros, búsqueda y página de un listado guardados en la URL
 * (Ventas, Presupuestos, Financiación, Reservas).
 *
 * Antes vivían en el estado del componente: entrar a una ficha y volver
 * dejaba el listado en la página 1 y sin filtros. En la URL sobreviven al
 * "volver", se pueden compartir y el back del navegador hace lo esperable.
 *
 * La búsqueda (`q`) se escribe en un input local y recién se manda a la URL
 * —y por lo tanto al backend— con un debounce de ~300 ms.
 */
export function useFiltrosUrl<K extends string>(claves: readonly K[], debounceMs = 300) {
    const [searchParams, setSearchParams] = useSearchParams();

    const clavesKey = claves.join('|');
    const filtros = useMemo(
        () => Object.fromEntries(clavesKey.split('|').map((k) => [k, searchParams.get(k) ?? ''])) as Record<K, string>,
        [searchParams, clavesKey],
    );
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const qUrl = searchParams.get('q') ?? '';

    /** Aplica cambios a la URL. Un valor vacío (o la página 1) borra la clave. */
    const actualizar = useCallback((cambios: Record<string, string | number | null | undefined>) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            for (const [k, v] of Object.entries(cambios)) {
                const vacio = v == null || v === '' || (k === 'page' && Number(v) <= 1);
                if (vacio) next.delete(k);
                else next.set(k, String(v));
            }
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const setFiltro = useCallback((clave: K, valor: string) => actualizar({ [clave]: valor, page: 1 }), [actualizar]);
    const setPage = useCallback((p: number) => actualizar({ page: p }), [actualizar]);

    // ── Búsqueda con debounce ──
    const [busqueda, setBusqueda] = useState(qUrl);
    const debounced = useDebounce(busqueda, debounceMs);
    const ultimoDebounced = useRef(debounced);
    useEffect(() => {
        // Sólo cuando cambia lo tipeado: si no, al "Limpiar filtros" el valor
        // viejo (todavía sin debounce) volvería a escribirse en la URL.
        if (ultimoDebounced.current === debounced) return;
        ultimoDebounced.current = debounced;
        actualizar({ q: debounced.trim(), page: 1 });
    }, [debounced, actualizar]);

    const limpiar = useCallback(() => {
        setBusqueda('');
        actualizar({ q: '', page: 1, ...Object.fromEntries(clavesKey.split('|').map((k) => [k, ''])) });
    }, [actualizar, clavesKey]);

    /** Hay algún filtro o búsqueda aplicada (para distinguir "vacío" de "sin resultados"). */
    const hayFiltros = qUrl !== '' || Object.values<string>(filtros).some((v) => v !== '');

    return { filtros, q: qUrl, busqueda, setBusqueda, page, setPage, setFiltro, limpiar, hayFiltros, actualizar };
}
