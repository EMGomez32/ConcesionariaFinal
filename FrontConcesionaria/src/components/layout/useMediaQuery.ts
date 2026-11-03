import { useCallback, useSyncExternalStore } from 'react';

/**
 * `true` mientras el viewport cumpla la media query. Se suscribe a los cambios
 * (rotar el teléfono, achicar la ventana) sin estado propio: useSyncExternalStore
 * lee `matchMedia` directo. Sin `matchMedia` (jsdom, SSR) devuelve false.
 */
export function useMediaQuery(query: string): boolean {
    const subscribe = useCallback((avisar: () => void) => {
        if (typeof window === 'undefined' || !window.matchMedia) return () => {};
        const mq = window.matchMedia(query);
        mq.addEventListener?.('change', avisar);
        return () => mq.removeEventListener?.('change', avisar);
    }, [query]);
    const leer = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;
    return useSyncExternalStore(subscribe, leer, () => false);
}

/** Mismo corte que el CSS del sidebar: por debajo, el menú es un panel que se abre y se cierra. */
export const MQ_MENU_MOVIL = '(max-width: 1024px)';
