import { useEffect, useRef, useState } from 'react';

interface UseCountUpOptions {
    /** Duración total en ms (default 800). */
    duration?: number;
    /** Cantidad de decimales (default 0). */
    decimals?: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Anima un número desde el valor anterior hasta el target con ease-out.
 * Si `prefers-reduced-motion` está activo, devuelve el target sin animar.
 */
export function useCountUp(target: number, options: UseCountUpOptions = {}): number {
    const { duration = 800, decimals = 0 } = options;

    // Si el usuario pide reduced-motion, devolvemos target sin pasar por estado animado.
    // Los hooks de abajo se siguen llamando (orden estable) pero no animan.
    const reduce = prefersReducedMotion();

    const [value, setValue] = useState(target);
    const fromRef = useRef(target);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (reduce) {
            // Sólo actualizamos refs; el componente ya está renderizando `target` directamente.
            fromRef.current = target;
            return;
        }

        const from = fromRef.current;
        const start = performance.now();

        const tick = (now: number) => {
            const elapsed = now - start;
            const t = Math.min(1, elapsed / duration);
            const eased = easeOutCubic(t);
            const current = from + (target - from) * eased;
            const factor = Math.pow(10, decimals);
            setValue(Math.round(current * factor) / factor);
            if (t < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                fromRef.current = target;
            }
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        };
    }, [target, duration, decimals, reduce]);

    return reduce ? target : value;
}
