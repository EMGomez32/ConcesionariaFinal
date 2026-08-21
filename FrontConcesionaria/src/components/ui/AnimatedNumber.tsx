import { useEffect, useState } from 'react';
import { useCountUp } from '../../hooks/useCountUp';

interface AnimatedNumberProps {
    value: number;
    decimals?: number;
    duration?: number;
    /** Si true, formatea con separadores de miles (es-AR). */
    formatThousands?: boolean;
}

// Respeta prefers-reduced-motion: si el usuario pidió menos movimiento, mostramos
// el valor final directo (sin count-up). El CSS global frena las animaciones CSS,
// pero este conteo corre por requestAnimationFrame (JS), así que hay que cortarlo acá
// para no imponer movimiento no consentido ni que un lector lea valores intermedios.
const useReducedMotion = (): boolean => {
    const [reduced, setReduced] = useState<boolean>(
        () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    );
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = () => setReduced(mq.matches);
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);
    return reduced;
};

const AnimatedNumber = ({ value, decimals = 0, duration = 800, formatThousands = true }: AnimatedNumberProps) => {
    const reduced = useReducedMotion();
    const animated = useCountUp(value, { decimals, duration: reduced ? 0 : duration });
    const shown = reduced ? value : animated;
    const formatted = formatThousands
        ? shown.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : shown.toFixed(decimals);
    return <span>{formatted}</span>;
};

export default AnimatedNumber;
