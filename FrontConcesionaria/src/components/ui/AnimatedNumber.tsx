import { useCountUp } from '../../hooks/useCountUp';

interface AnimatedNumberProps {
    value: number;
    decimals?: number;
    duration?: number;
    /** Si true, formatea con separadores de miles (es-AR). */
    formatThousands?: boolean;
}

const AnimatedNumber = ({ value, decimals = 0, duration = 800, formatThousands = true }: AnimatedNumberProps) => {
    const animated = useCountUp(value, { decimals, duration });
    const formatted = formatThousands
        ? animated.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : animated.toFixed(decimals);
    return <span>{formatted}</span>;
};

export default AnimatedNumber;
